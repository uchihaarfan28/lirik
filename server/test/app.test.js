import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';

const KEY = 'k'.repeat(24);
const calls = [];
let prefs = { hideAfterPauseSec: 900, autoStart: true, pauseMode: 'hide' };
const engine = {
  kick: () => calls.push(['kick']),
  registerPushToStart: (t) => calls.push(['pts', t]),
  registerActivity: (a) => calls.push(['act', a]),
  activityEnded: (a) => calls.push(['ended', a]),
  registerDeviceToken: (t) => calls.push(['device', t]),
  setPreferences: (patch) => {
    calls.push(['prefs', patch]);
    if (patch.hideAfterPauseSec !== undefined && ![0, 60, 300, 900, -1].includes(patch.hideAfterPauseSec)) {
      throw Object.assign(new Error('hideAfterPauseSec harus 0, 60, 300, 900, atau -1'), { status: 400 });
    }
    if (patch.pauseMode !== undefined && !['dim', 'hide'].includes(patch.pauseMode)) {
      throw Object.assign(new Error('pauseMode harus "dim" atau "hide"'), { status: 400 });
    }
    if (patch.autoStart !== undefined && typeof patch.autoStart !== 'boolean') {
      throw Object.assign(new Error('autoStart harus boolean'), { status: 400 });
    }
    prefs = { ...prefs, ...patch };
    return prefs;
  },
  status: () => ({ spotifyConnected: true, line: 'halo', preferences: prefs }),
  testPush: async () => ({ ok: false, status: 0, reason: 'Belum ada Live Activity' }),
};
const spotify = {
  authorizeUrl: (state) => `https://accounts.spotify.com/authorize?state=${state}`,
  exchanged: [],
  async exchangeCode(code) {
    if (code === 'buruk') throw new Error('invalid_grant');
    this.exchanged.push(code);
  },
};

let server;
let base;
before(async () => {
  server = createApp({ cfg: { apiKey: KEY, publicUrl: 'http://pub.example' }, spotify, engine, log: { warn() {}, error() {} } });
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
  assert.equal((await ok.json()).line, 'halo');
});

test('registrasi token dari iPhone', async () => {
  const hex = 'a1'.repeat(40);
  assert.equal((await api('/api/push-to-start-token', { method: 'POST', body: { token: hex } })).status, 200);
  assert.equal((await api('/api/activity-token', { method: 'POST', body: { token: hex, activityId: 'ID-1' } })).status, 200);
  assert.equal((await api('/api/activity-ended', { method: 'POST', body: { activityId: 'ID-1' } })).status, 200);
  assert.deepEqual(calls.slice(-3), [
    ['pts', hex],
    ['act', { token: hex, activityId: 'ID-1' }],
    ['ended', { activityId: 'ID-1' }],
  ]);
  const bad = await api('/api/activity-token', { method: 'POST', body: { token: 'bukan-hex!' } });
  assert.equal(bad.status, 400);
});

test('JSON rusak → 400', async () => {
  const r = await fetch(`${base}/api/activity-token`, { method: 'POST', headers: { 'x-api-key': KEY }, body: '{oops' });
  assert.equal(r.status, 400);
});

test('alur login Spotify: link sekali pakai → redirect → callback', async () => {
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
  assert.deepEqual(spotify.exchanged, ['kode1']);
  assert.deepEqual(calls.at(-1), ['kick']);

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
  const hex = 'b2'.repeat(40);
  assert.equal((await api('/api/device-token', { method: 'POST', body: { token: hex } })).status, 200);
  assert.deepEqual(calls.at(-1), ['device', hex]);
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

test('rute tidak dikenal → 404', async () => {
  assert.equal((await api('/apa', { key: null })).status, 404);
});
