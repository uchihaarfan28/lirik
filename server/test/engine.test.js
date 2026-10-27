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
  if (activity) store.set({ activity: { token: 'ab'.repeat(32), id: 'A1', registeredAtMs: clock.now() } });
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
  store.set({ pushToStartToken: 'ef'.repeat(32) });
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
  assert.equal(store.get('activity'), null);
  engine.stop();
});

test('token mati (410) dihapus; error lain dicoba ulang', async () => {
  const { clock, apns, engine, store } = setup();
  apns.result = { ok: false, status: 410, reason: 'Unregistered' };
  engine.start();
  await clock.advance(100);
  assert.equal(store.get('activity'), null);

  const s2 = setup();
  s2.apns.result = { ok: false, status: 500, reason: 'InternalServerError' };
  s2.engine.start();
  await s2.clock.advance(100);
  assert.ok(s2.store.get('activity'));
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
  assert.equal(st.lyrics, 'synced');
  assert.equal(st.line, 'satu');
  // setelah tes, baris asli dikirim lagi
  await clock.advance(1100);
  assert.equal(apns.lines().at(-1), 'satu');
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
