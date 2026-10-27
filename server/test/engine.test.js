import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LyricsEngine } from '../src/engine.js';
import { Store } from '../src/store.js';
import { engineConfig, fakeApns, FakeClock, fakeSpotify, silentLog } from './helpers.js';

const TRACK = { id: 'trk1', title: 'Judul', artist: 'Artis', primaryArtist: 'Artis', album: 'Al', durationMs: 60_000 };
const LINES = [
  { t: 2000, text: 'satu' },
  { t: 5000, text: 'dua' },
  { t: 8000, text: '' },
  { t: 9500, text: 'empat' },
];

function setup({ cfg = {}, lyrics = { status: 'synced', lines: LINES }, activity = true, spotifyOpts = {} } = {}) {
  const clock = new FakeClock();
  const store = new Store(null);
  if (activity) {
    store.set({
      devices: [
        {
          deviceId: 'phone1',
          activityToken: 'ab'.repeat(32),
          activityId: 'A1',
          deviceToken: null,
          pushToStartToken: null,
          registeredAtMs: clock.now(),
          lastSeenAt: clock.now(),
        },
      ],
    });
  }
  const spotify = fakeSpotify(clock, { track: TRACK, ...spotifyOpts });
  const apns = fakeApns();
  const lyricsProvider = { calls: 0, getLyrics: async () => (lyricsProvider.calls++, lyrics) };
  const engine = new LyricsEngine({
    spotify,
    lyrics: lyricsProvider,
    apns,
    store,
    config: engineConfig(cfg),
    clock: { now: clock.now },
    timers: clock.timers,
    log: silentLog,
  });
  return { clock, store, spotify, apns, engine, lyricsProvider };
}

test('mengirim baris lirik tepat di pergantian baris', async () => {
  const { clock, apns, engine } = setup();
  engine.start();
  await clock.advance(0);
  // awal: "Memuat lirik…" lalu langsung lirik (sebelum baris pertama → "♪")
  assert.deepEqual(apns.lines(), ['Memuat lirik…']);

  await clock.advance(1100); // jarak minimum 1 dtk dari push pertama
  assert.equal(apns.lines().at(-1), '♪');
  assert.equal(apns.sent.at(-1).aps['content-state'].nextLine, 'satu');

  await clock.advance(900); // t = 2000
  assert.equal(apns.lines().at(-1), 'satu');
  const atSatu = apns.sent.at(-1);
  assert.equal(atSatu.aps.event, 'update');
  assert.equal(atSatu.aps['content-state'].nextLine, 'dua');
  assert.equal(atSatu.aps['content-state'].isPlaying, true);
  assert.equal(atSatu.aps['content-state'].hasLyrics, true);
  assert.equal(atSatu.opts.priority, 10);

  await clock.advance(3000); // t = 5000
  assert.equal(apns.lines().at(-1), 'dua');
  await clock.advance(3000); // t = 8000 → baris kosong jadi "♪"
  assert.equal(apns.lines().at(-1), '♪');
  await clock.advance(1500); // t = 9500
  assert.equal(apns.lines().at(-1), 'empat');
  engine.stop();
});

test('timestamp APNs selalu naik dan stale-date terpasang', async () => {
  const { clock, apns, engine } = setup();
  engine.start();
  await clock.advance(12_000);
  const ts = apns.sent.map((s) => s.aps.timestamp);
  for (let i = 1; i < ts.length; i++) assert.ok(ts[i] > ts[i - 1], `timestamp ${i} harus naik`);
  for (const s of apns.sent) assert.equal(s.aps['stale-date'], s.aps.timestamp + 900);
  engine.stop();
});

test('leadMs mengirim lebih awal', async () => {
  const { clock, apns, engine } = setup({ cfg: { leadMs: 400 } });
  engine.start();
  await clock.advance(4599);
  assert.equal(apns.lines().at(-1), 'satu');
  await clock.advance(1); // 5000 - 400
  assert.equal(apns.lines().at(-1), 'dua');
  engine.stop();
});

test('lompat posisi (seek) terkoreksi di polling berikutnya', async () => {
  const { clock, apns, engine, spotify } = setup();
  engine.start();
  await clock.advance(2500);
  assert.equal(apns.lines().at(-1), 'satu');
  spotify.offsetMs = 7500; // user geser ke ~10 dtk
  await clock.advance(600); // polling di t=3000 melihat posisi 10.5 dtk
  assert.equal(apns.lines().at(-1), 'empat');
  engine.stop();
});

test('pause → isPlaying false dan timer baris berhenti', async () => {
  const { clock, apns, engine, spotify } = setup();
  engine.start();
  await clock.advance(2500);
  spotify.pause();
  await clock.advance(600); // poll t=3000
  const last = apns.sent.at(-1).aps['content-state'];
  assert.equal(last.isPlaying, false);
  assert.equal(last.line, 'satu');
  const count = apns.sent.length;
  await clock.advance(20_000);
  assert.equal(apns.sent.length, count, 'tidak ada push lagi selama pause');
  engine.stop();
});

test('ganti lagu → ambil lirik baru', async () => {
  const { clock, apns, engine, spotify, lyricsProvider } = setup();
  engine.start();
  await clock.advance(2500);
  spotify.track = { ...TRACK, id: 'trk2', title: 'Lagu Kedua' };
  spotify.startAt = clock.now();
  await clock.advance(600);
  assert.equal(lyricsProvider.calls, 2);
  const titles = apns.sent.map((s) => s.aps['content-state'].title);
  assert.ok(titles.includes('Lagu Kedua'));
  engine.stop();
});

test('status lirik non-sinkron menampilkan pesan', async () => {
  for (const [status, text] of [
    ['none', 'Lirik tidak ditemukan'],
    ['instrumental', '♪ Instrumental ♪'],
    ['plain', 'Lirik ada, tapi belum tersinkron'],
    ['error', 'Gagal memuat lirik'],
  ]) {
    const { clock, apns, engine } = setup({ lyrics: { status, lines: [] } });
    engine.start();
    await clock.advance(1200);
    assert.equal(apns.lines().at(-1), text);
    assert.equal(apns.sent.at(-1).aps['content-state'].hasLyrics, false);
    engine.stop();
  }
});

test('tanpa Live Activity terdaftar tidak ada update; setelah terdaftar langsung terkirim', async () => {
  const { clock, apns, engine } = setup({ activity: false });
  engine.start();
  await clock.advance(2500);
  assert.equal(apns.sent.length, 0);
  engine.registerActivity({ token: 'cd'.repeat(32), activityId: 'X' });
  await clock.advance(0);
  assert.equal(apns.lines().at(-1), 'satu');
  assert.equal(apns.sent.at(-1).token, 'cd'.repeat(32));
  engine.stop();
});

test('push-to-start saat musik mulai, dengan cooldown', async () => {
  const { clock, apns, engine, store } = setup({ activity: false });
  store.set({
    devices: [
      {
        deviceId: 'pts',
        activityToken: null,
        activityId: null,
        deviceToken: null,
        pushToStartToken: 'ef'.repeat(32),
        registeredAtMs: null,
        lastSeenAt: clock.now(),
      },
    ],
  });
  engine.start();
  await clock.advance(100);
  const starts = apns.sent.filter((s) => s.aps.event === 'start');
  assert.equal(starts.length, 1);
  const aps = starts[0].aps;
  assert.equal(starts[0].token, 'ef'.repeat(32));
  assert.equal(aps['attributes-type'], 'LyricsActivityAttributes');
  assert.deepEqual(aps.attributes, { appName: 'Lirik Island' });
  assert.equal(aps['input-push-token'], 1);
  assert.equal(aps.alert.title, 'Judul');
  assert.ok(aps['content-state'].line);
  await clock.advance(30_000);
  assert.equal(apns.sent.filter((s) => s.aps.event === 'start').length, 1, 'tidak diulang dalam cooldown');
  engine.stop();
});

test('auto-end setelah lama tidak ada musik', async () => {
  const { clock, apns, engine, spotify, store } = setup({ cfg: { autoEndIdleMs: 60_000 } });
  engine.start();
  await clock.advance(2500);
  spotify.track = null; // Spotify berhenti total
  await clock.advance(70_000);
  const end = apns.sent.find((s) => s.aps.event === 'end');
  assert.ok(end, 'event end terkirim');
  assert.equal(end.aps['content-state'].isPlaying, false);
  assert.ok(end.aps['dismissal-date']);
  assert.equal(engine.activityDevices().length, 0);
  engine.stop();
});

test('token mati (410) dihapus; error lain dicoba ulang', async () => {
  const { clock, apns, engine, store } = setup();
  apns.result = { ok: false, status: 410, reason: 'Unregistered' };
  engine.start();
  await clock.advance(100);
  assert.equal(engine.activityDevices().length, 0);

  const s2 = setup();
  s2.apns.result = { ok: false, status: 500, reason: 'InternalServerError' };
  s2.engine.start();
  await s2.clock.advance(100);
  assert.ok(s2.engine.activityDevices().length > 0);
  s2.apns.result = { ok: true, status: 200 };
  await s2.clock.advance(3000); // polling berikutnya mengirim ulang
  assert.ok(s2.apns.sent.at(-1).aps['content-state'].line);
  assert.equal(s2.engine.lastPush.ok, true);
  engine.stop();
  s2.engine.stop();
});

test('rate limit Spotify memperlambat polling', async () => {
  const { clock, engine, spotify } = setup();
  spotify.getCurrentlyPlaying = async () => {
    spotify.calls++;
    throw Object.assign(new Error('Kena rate limit Spotify'), { status: 429, retryAfterSec: 30 });
  };
  engine.start();
  await clock.advance(100);
  assert.equal(spotify.calls, 1);
  await clock.advance(20_000);
  assert.equal(spotify.calls, 1);
  await clock.advance(11_000);
  assert.equal(spotify.calls, 2);
  assert.match(engine.status().lastError, /rate limit/);
  engine.stop();
});

test('Spotify belum terhubung → tidak polling API', async () => {
  const { clock, engine, spotify } = setup();
  spotify.connected = false;
  engine.start();
  await clock.advance(30_000);
  assert.equal(spotify.calls, 0);
  assert.equal(engine.status().lastError, 'Spotify belum terhubung');
  engine.stop();
});

test('polling dipercepat menjelang lagu habis', async () => {
  const { clock, engine, spotify } = setup({ spotifyOpts: { offsetMs: 59_000 } });
  engine.start();
  await clock.advance(0);
  assert.equal(spotify.calls, 1);
  await clock.advance(1700); // sisa 1 dtk + 600 ms
  assert.equal(spotify.calls, 2);
  engine.stop();
});

test('testPush dan status', async () => {
  const { clock, apns, engine } = setup();
  engine.start();
  await clock.advance(2500);
  const r = await engine.testPush();
  assert.equal(r.ok, true);
  assert.equal(apns.lines().at(-1), 'Tes dari server ✓');
  const st = engine.status();
  assert.equal(st.spotifyConnected, true);
  assert.equal(st.activityRegistered, true);
  assert.equal(st.nowPlaying.title, 'Judul');
  assert.equal(st.nowPlaying.trackId, 'trk1');
  assert.equal(st.nowPlaying.durationMs, 60_000);
  assert.equal(typeof st.nowPlaying.positionMs, 'number');
  assert.equal(st.lyrics, 'synced');
  assert.equal(st.line, 'satu');
  assert.equal(st.preferences.hideAfterPauseSec, 900);
  assert.equal(st.preferences.autoStart, true);
  assert.equal(st.preferences.pauseMode, 'hide');
  // setelah tes, baris asli dikirim lagi
  await clock.advance(1100);
  assert.equal(apns.lines().at(-1), 'satu');
  engine.stop();
});

test('lyricsPayload mengembalikan semua baris + index aktif', async () => {
  const { clock, engine } = setup({
    lyrics: {
      status: 'synced',
      lines: [
        { t: 0, text: 'baris awal demo' },
        { t: 5_000, text: 'baris tengah demo' },
        { t: 20_000, text: 'baris akhir demo' },
      ],
    },
  });
  engine.start();
  await clock.advance(1200);
  let p = engine.lyricsPayload();
  assert.equal(p.status, 'synced');
  assert.equal(p.lines.length, 3);
  assert.equal(p.index, 0);
  assert.equal(p.title, 'Judul');
  await clock.advance(6_000);
  p = engine.lyricsPayload();
  assert.equal(p.index, 1);
  assert.equal(p.lines[1].text, 'baris tengah demo');
  engine.stop();
});

test('teks panjang dipotong supaya payload kecil', async () => {
  const long = 'x'.repeat(500);
  const { clock, apns, engine } = setup({ lyrics: { status: 'synced', lines: [{ t: 0, text: long }] } });
  engine.start();
  await clock.advance(1200);
  const line = apns.sent.at(-1).aps['content-state'].line;
  assert.equal(line.length, 140);
  assert.ok(Buffer.byteLength(JSON.stringify({ aps: apns.sent.at(-1).aps })) < 4096);
  engine.stop();
});

test('dedupe: maju waktu tanpa ganti baris tidak spam push', async () => {
  const { clock, apns, engine } = setup({
    lyrics: { status: 'synced', lines: [{ t: 0, text: 'panjang' }, { t: 30_000, text: 'akhir' }] },
  });
  engine.start();
  await clock.advance(2000);
  const before = apns.sent.filter((s) => s.aps.event === 'update').length;
  const startSec = apns.sent.at(-1).aps['content-state'].playbackStartSec;
  await clock.advance(10_000);
  const after = apns.sent.filter((s) => s.aps.event === 'update').length;
  assert.equal(after, before, 'tidak ada push ekstra hanya karena waktu');
  assert.equal(apns.sent.at(-1).aps['content-state'].playbackStartSec, startSec);
  engine.stop();
});

test('seek mengubah playbackStartSec dan memicu push', async () => {
  const { clock, apns, engine, spotify } = setup({
    lyrics: { status: 'synced', lines: [{ t: 0, text: 'awal' }, { t: 20_000, text: 'jauh' }] },
  });
  engine.start();
  await clock.advance(2000);
  const before = apns.sent.at(-1).aps['content-state'].playbackStartSec;
  spotify.offsetMs = 20_000;
  await clock.advance(1100);
  const after = apns.sent.at(-1).aps['content-state'];
  assert.notEqual(after.playbackStartSec, before);
  assert.equal(after.line, 'jauh');
  engine.stop();
});

test('content-state punya trackId durationMs playbackStartSec', async () => {
  const { clock, apns, engine } = setup();
  engine.start();
  await clock.advance(2500);
  const s = apns.sent.at(-1).aps['content-state'];
  assert.equal(s.trackId, 'trk1');
  assert.equal(s.durationMs, 60_000);
  assert.equal(typeof s.playbackStartSec, 'number');
  assert.ok(s.playbackStartSec > 0);
  engine.stop();
});

test('autoStart=false tidak mengirim event start', async () => {
  const { clock, apns, engine, store } = setup({ activity: false });
  store.set({
    devices: [
      {
        deviceId: 'pts',
        activityToken: null,
        activityId: null,
        deviceToken: null,
        pushToStartToken: 'ef'.repeat(32),
        registeredAtMs: null,
        lastSeenAt: clock.now(),
      },
    ],
  });
  engine.setPreferences({ autoStart: false });
  engine.start();
  await clock.advance(100);
  assert.equal(apns.sent.filter((s) => s.aps.event === 'start').length, 0);
  engine.stop();
});

test('pauseMode=hide, hideAfterPauseSec=0: grace 20s lalu end', async () => {
  const { clock, apns, engine, spotify, store } = setup();
  engine.setPreferences({ pauseMode: 'hide', hideAfterPauseSec: 0 });
  engine.start();
  await clock.advance(2500);
  spotify.pause();
  await clock.advance(600);
  assert.equal(apns.sent.find((s) => s.aps.event === 'end'), undefined);
  await clock.advance(5000);
  assert.equal(apns.sent.find((s) => s.aps.event === 'end'), undefined, 'belum end di 5s');
  await clock.advance(16_000);
  const end = apns.sent.find((s) => s.aps.event === 'end');
  assert.ok(end, 'end setelah grace 20s');
  assert.equal(engine.activityDevices().length, 0);
  assert.ok(Array.isArray(store.get('devices')));
  engine.stop();
});

test('pauseMode=dim tidak end meski jeda lama', async () => {
  const { clock, apns, engine, spotify } = setup();
  engine.setPreferences({ pauseMode: 'dim', hideAfterPauseSec: 60 });
  engine.start();
  await clock.advance(2500);
  spotify.pause();
  await clock.advance(70_000);
  assert.equal(apns.sent.find((s) => s.aps.event === 'end'), undefined);
  assert.ok(engine.activityDevices().length > 0);
  engine.stop();
});

test('silent push artwork saat device+activity+cover baru', async () => {
  const track = {
    ...TRACK,
    artworkURL: 'https://example.com/cover-a.jpg',
  };
  const { clock, apns, engine, store, spotify } = setup();
  spotify.track = track;
  engine.registerDeviceToken('dd'.repeat(32), { deviceId: 'phone1' });
  engine.start();
  await clock.advance(100);
  const bg = apns.sent.filter((s) => s.opts?.pushType === 'background');
  assert.equal(bg.length, 1);
  assert.equal(bg[0].token, 'dd'.repeat(32));
  assert.deepEqual(bg[0].opts.extra.artwork, { trackId: 'trk1', url: 'https://example.com/cover-a.jpg' });
  assert.equal(bg[0].opts.priority, 5);
  const count = bg.length;
  await clock.advance(5000);
  assert.equal(
    apns.sent.filter((s) => s.opts?.pushType === 'background').length,
    count,
    'tidak spam artwork yang sama',
  );
  engine.stop();
});

test('silent push artwork tidak dikirim tanpa activity', async () => {
  const { clock, apns, engine, spotify } = setup({ activity: false });
  spotify.track = { ...TRACK, artworkURL: 'https://example.com/c.jpg' };
  engine.registerDeviceToken('ee'.repeat(32), { deviceId: 'only-dev' });
  engine.start();
  await clock.advance(100);
  assert.equal(apns.sent.filter((s) => s.opts?.pushType === 'background').length, 0);
  engine.stop();
});

test('device token mati hanya menghapus deviceToken', async () => {
  const { clock, apns, engine, store, spotify } = setup();
  spotify.track = { ...TRACK, artworkURL: 'https://example.com/c.jpg' };
  engine.registerDeviceToken('ff'.repeat(32), { deviceId: 'phone1' });
  apns.result = (token) =>
    token === 'ff'.repeat(32)
      ? { ok: false, status: 410, reason: 'Unregistered' }
      : { ok: true, status: 200 };
  engine.start();
  await clock.advance(100);
  const devices = store.get('devices');
  assert.equal(devices.find((d) => d.deviceId === 'phone1')?.deviceToken, null);
  assert.ok(devices.find((d) => d.deviceId === 'phone1')?.activityToken, 'activity token tetap');
  engine.stop();
});

test('multi-device: update dikirim ke semua activity token', async () => {
  const { clock, apns, engine } = setup({ activity: false });
  engine.registerActivity({ token: 'aa'.repeat(32), activityId: 'A', deviceId: 'd1' });
  engine.registerActivity({ token: 'bb'.repeat(32), activityId: 'B', deviceId: 'd2' });
  engine.start();
  await clock.advance(2500);
  const updates = apns.sent.filter((s) => s.aps.event === 'update');
  const tokens = new Set(updates.map((s) => s.token));
  assert.ok(tokens.has('aa'.repeat(32)));
  assert.ok(tokens.has('bb'.repeat(32)));
  engine.stop();
});
