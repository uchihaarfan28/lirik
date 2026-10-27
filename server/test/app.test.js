import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';
import { LyricsEngine } from '../src/engine.js';
import { UserRuntime } from '../src/runtime.js';
import { UserRegistry, hashApiKey } from '../src/users.js';
import { engineConfig, silentLog } from './helpers.js';

const KEY = 'k'.repeat(24);
const KEY2 = 'm'.repeat(24);

function makeRuntime() {
  const registry = new UserRegistry({ bootstrapApiKey: KEY, log: silentLog }).load();
  // tambah user kedua dengan hash KEY2
  registry.index.push({
    id: 'user2',
    name: 'Ani',
    apiKeyHash: hashApiKey(KEY2),
    createdAt: new Date().toISOString(),
  });
  registry.openStore('user2');
  registry.normalizeUserStore('user2');

  const calls = [];
  const lyrics = { getLyrics: async () => ({ status: 'none', lines: [] }) };
  const apns = {
    async send() {
      return { ok: true, status: 200 };
    },
  };

  const runtime = new UserRuntime({
    registry,
    lyrics,
    apns,
    spotifyCfg: { clientId: 'cid', clientSecret: 'sec', redirectUri: 'http://pub.example/callback' },
    engineCfg: engineConfig(),
    log: silentLog,
    createSpotifyFn: ({ store }) => {
      let connected = Boolean(store.get('refreshToken'));
      return {
        isConnected: () => connected,
        logout() {
          connected = false;
          store.set({ refreshToken: null });
          calls.push(['logout', store]);
        },
        authorizeUrl: (state) => `https://accounts.spotify.com/authorize?state=${state}`,
        async exchangeCode(code) {
          if (code === 'buruk') throw new Error('invalid_grant');
          store.set({ refreshToken: 'rt' });
          connected = true;
          calls.push(['exchange', code]);
        },
        async getCurrentlyPlaying() {
          return null;
        },
      };
    },
    LyricsEngineClass: LyricsEngine,
  }).boot();

  // patch engines for call tracking where needed
  for (const session of runtime.sessions.values()) {
    const eng = session.engine;
    const origKick = eng.kick.bind(eng);
    eng.kick = () => {
      calls.push(['kick', session.meta.id]);
      origKick();
    };
    const origRegPts = eng.registerPushToStart.bind(eng);
    eng.registerPushToStart = (t, opts) => {
      calls.push(['pts', t, opts?.deviceId]);
      origRegPts(t, opts);
    };
    const origRegAct = eng.registerActivity.bind(eng);
    eng.registerActivity = (a) => {
      calls.push(['act', a]);
      origRegAct(a);
    };
    const origEnded = eng.activityEnded.bind(eng);
    eng.activityEnded = (a) => {
      calls.push(['ended', a]);
      origEnded(a);
    };
    const origDev = eng.registerDeviceToken.bind(eng);
    eng.registerDeviceToken = (t, opts) => {
      calls.push(['device', t, opts?.deviceId]);
      origDev(t, opts);
    };
    eng.testPush = async () => ({ ok: false, status: 0, reason: 'Belum ada Live Activity' });
  }

  return { runtime, registry, calls };
}

const { runtime, registry, calls } = makeRuntime();

let server;
let base;
before(async () => {
  server = createApp({
    cfg: { apiKey: KEY, publicUrl: 'http://pub.example' },
    runtime,
    log: { warn() {}, error() {} },
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const api = (path, { method = 'GET', body, key = KEY } = {}) =>
  fetch(`${base}${path}`, {
    method,
    redirect: 'manual',
    headers: { ...(key ? { 'x-api-key': key } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

test('health tanpa API key', async () => {
  const r = await api('/health', { key: null });
  assert.equal(r.status, 200);
});

test('/api/* menolak API key salah', async () => {
  assert.equal((await api('/api/status', { key: null })).status, 401);
  assert.equal((await api('/api/status', { key: 'salah' })).status, 401);
  const ok = await api('/api/status');
  assert.equal(ok.status, 200);
});

test('dua API key → dua user terpisah', async () => {
  const me1 = await (await api('/api/me')).json();
  const me2 = await (await api('/api/me', { key: KEY2 })).json();
  assert.equal(me1.userId, 'default');
  assert.equal(me2.userId, 'user2');
  assert.equal(me2.name, 'Ani');
});

test('registrasi token dari iPhone + deviceId', async () => {
  calls.length = 0;
  const hex = 'a1'.repeat(40);
  assert.equal(
    (await api('/api/push-to-start-token', { method: 'POST', body: { token: hex, deviceId: 'iphone-a' } })).status,
    200,
  );
  assert.equal(
    (
      await api('/api/activity-token', {
        method: 'POST',
        body: { token: hex, activityId: 'ID-1', deviceId: 'iphone-a' },
      })
    ).status,
    200,
  );
  assert.equal(
    (await api('/api/activity-ended', { method: 'POST', body: { activityId: 'ID-1', deviceId: 'iphone-a' } })).status,
    200,
  );
  assert.ok(calls.some((c) => c[0] === 'pts' && c[2] === 'iphone-a'));
  assert.ok(calls.some((c) => c[0] === 'act' && c[1].deviceId === 'iphone-a'));
  assert.ok(calls.some((c) => c[0] === 'ended'));
  const bad = await api('/api/activity-token', { method: 'POST', body: { token: 'bukan-hex!' } });
  assert.equal(bad.status, 400);
});

test('JSON rusak → 400', async () => {
  const r = await fetch(`${base}/api/activity-token`, { method: 'POST', headers: { 'x-api-key': KEY }, body: '{oops' });
  assert.equal(r.status, 400);
});

test('alur login Spotify: link sekali pakai → redirect → callback', async () => {
  calls.length = 0;
  const { url } = await (await api('/api/login-link', { method: 'POST' })).json();
  assert.match(url, /^http:\/\/pub\.example\/login\?n=/);
  const loginPath = new URL(url).pathname + new URL(url).search;

  const r1 = await api(loginPath, { key: null });
  assert.equal(r1.status, 302);
  const state = new URL(r1.headers.get('location')).searchParams.get('state');
  assert.ok(state);

  assert.equal((await api(loginPath, { key: null })).status, 403, 'link hanya sekali pakai');

  const cb = await api(`/callback?code=kode1&state=${state}`, { key: null });
  assert.equal(cb.status, 200);
  assert.match(await cb.text(), /Spotify terhubung/);
  assert.ok(calls.some((c) => c[0] === 'exchange' && c[1] === 'kode1'));
  assert.ok(calls.some((c) => c[0] === 'kick'));

  assert.equal((await api(`/callback?code=kode1&state=${state}`, { key: null })).status, 403, 'state sekali pakai');
  assert.equal((await api('/callback?error=access_denied', { key: null })).status, 400);
});

test('callback: kode buruk → 502 dengan pesan', async () => {
  const { url } = await (await api('/api/login-link', { method: 'POST' })).json();
  const u = new URL(url);
  const r1 = await api(u.pathname + u.search, { key: null });
  const state = new URL(r1.headers.get('location')).searchParams.get('state');
  const cb = await api(`/callback?code=buruk&state=${state}`, { key: null });
  assert.equal(cb.status, 502);
});

test('test-push meneruskan alasan gagal', async () => {
  const r = await api('/api/test-push', { method: 'POST' });
  assert.equal(r.status, 502);
  assert.match((await r.json()).error, /Belum ada Live Activity/);
});

test('device-token registrasi', async () => {
  calls.length = 0;
  const hex = 'b2'.repeat(40);
  assert.equal((await api('/api/device-token', { method: 'POST', body: { token: hex, deviceId: 'd1' } })).status, 200);
  assert.ok(calls.some((c) => c[0] === 'device' && c[1] === hex && c[2] === 'd1'));
  assert.equal((await api('/api/device-token', { method: 'POST', body: { token: 'bad!' } })).status, 400);
});

test('preferences merge & validasi', async () => {
  const ok = await api('/api/preferences', {
    method: 'POST',
    body: { hideAfterPauseSec: 60, pauseMode: 'dim', autoStart: false },
  });
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).preferences, {
    hideAfterPauseSec: 60,
    autoStart: false,
    pauseMode: 'dim',
  });
  assert.equal((await api('/api/preferences', { method: 'POST', body: { hideAfterPauseSec: 12 } })).status, 400);
  assert.equal((await api('/api/preferences', { method: 'POST', body: { pauseMode: 'blink' } })).status, 400);
  const st = await (await api('/api/status')).json();
  assert.equal(st.preferences.pauseMode, 'dim');
});

test('logout memutus Spotify user itu saja', async () => {
  const store1 = registry.getStore('default');
  const store2 = registry.getStore('user2');
  store1.set({ refreshToken: 'rt-a' });
  store2.set({ refreshToken: 'rt-b' });
  // re-sync connected flags via logout API only for KEY
  const r = await api('/api/logout', { method: 'POST' });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).spotifyConnected, false);
  assert.equal(store1.get('refreshToken'), null);
  assert.equal(store2.get('refreshToken'), 'rt-b');
});

test('GET /api/lyrics mengembalikan baris + index', async () => {
  const session = runtime.byUserId('default');
  session.engine.lyricState = {
    status: 'synced',
    lines: [
      { t: 0, text: 'Lampu kota berbaris di kaca depan' },
      { t: 4000, text: 'Jalan tol sepi, radio pelan' },
    ],
  };
  session.engine.track = { id: 'demo', title: 'Lagu Demo', artist: 'Pulau Kecil', durationMs: 60_000 };
  session.engine.playing = true;
  session.engine.anchor = { progressMs: 0, at: Date.now() };
  const r = await api('/api/lyrics');
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.status, 'synced');
  assert.equal(body.lines.length, 2);
  assert.equal(body.lines[0].text, 'Lampu kota berbaris di kaca depan');
});

test('rute tidak dikenal → 404', async () => {
  assert.equal((await api('/apa', { key: null })).status, 404);
});
