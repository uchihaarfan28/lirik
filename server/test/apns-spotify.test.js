import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { createApns, isDeadToken, signJwt } from '../src/apns.js';
import { loadConfig } from '../src/config.js';
import { createSpotify, parseCurrentlyPlaying } from '../src/spotify.js';
import { Store } from '../src/store.js';

test('JWT APNs: ES256 valid dan bisa diverifikasi', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const jwt = signJwt({ teamId: 'TEAM123456', keyId: 'KEY1234567', privateKey: pem, iat: 1700000000 });
  const [h, p, s] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'ES256', kid: 'KEY1234567' });
  assert.deepEqual(JSON.parse(Buffer.from(p, 'base64url')), { iss: 'TEAM123456', iat: 1700000000 });
  const sig = Buffer.from(s, 'base64url');
  assert.equal(sig.length, 64, 'format JOSE (r||s), bukan DER');
  assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, sig));
});

test('APNs dry run & topic', async () => {
  const logs = [];
  const apns = createApns({ bundleId: 'com.x.app', dryRun: true, log: { info: (m) => logs.push(m) } });
  assert.equal(apns.topic, 'com.x.app.push-type.liveactivity');
  const r = await apns.send('ab'.repeat(32), { event: 'update', timestamp: 1 }, { label: 'update' });
  assert.equal(r.ok, true);
  assert.match(logs[0], /"event":"update"/);
  assert.match(logs[0], /type=liveactivity/);
});

test('APNs background: topic bundleId & content-available', async () => {
  const logs = [];
  const apns = createApns({ bundleId: 'com.x.app', dryRun: true, log: { info: (m) => logs.push(m) } });
  const r = await apns.send(
    'cd'.repeat(32),
    { 'content-available': 1 },
    {
      priority: 5,
      label: 'artwork',
      pushType: 'background',
      extra: { artwork: { trackId: 't1', url: 'https://example.com/a.jpg' } },
    },
  );
  assert.equal(r.ok, true);
  assert.match(logs[0], /type=background/);
  assert.match(logs[0], /topic=com\.x\.app /);
  assert.match(logs[0], /"content-available":1/);
  assert.match(logs[0], /"trackId":"t1"/);
});

test('isDeadToken', () => {
  assert.equal(isDeadToken({ status: 410 }), true);
  assert.equal(isDeadToken({ status: 400, reason: 'BadDeviceToken' }), true);
  assert.equal(isDeadToken({ status: 400, reason: 'BadTopic' }), false);
  assert.equal(isDeadToken({ status: 429 }), false);
});

test('parseCurrentlyPlaying: lagu, iklan, file lokal', () => {
  const t = parseCurrentlyPlaying({
    is_playing: true,
    progress_ms: 1234,
    currently_playing_type: 'track',
    item: {
      id: 'abc',
      name: 'Lagu',
      duration_ms: 200000,
      album: {
        name: 'Album',
        images: [
          { url: 'https://i.scdn.co/640.jpg', width: 640, height: 640 },
          { url: 'https://i.scdn.co/300.jpg', width: 300, height: 300 },
          { url: 'https://i.scdn.co/64.jpg', width: 64, height: 64 },
        ],
      },
      artists: [{ name: 'A' }, { name: 'B' }],
    },
  });
  assert.deepEqual(t, {
    isPlaying: true,
    type: 'track',
    progressMs: 1234,
    item: {
      id: 'abc',
      title: 'Lagu',
      artist: 'A, B',
      primaryArtist: 'A',
      album: 'Album',
      durationMs: 200000,
      artworkURL: 'https://i.scdn.co/300.jpg',
    },
  });
  assert.equal(parseCurrentlyPlaying({ is_playing: true, currently_playing_type: 'ad', item: null }).item, null);
  const local = parseCurrentlyPlaying({ currently_playing_type: 'track', item: { id: null, uri: 'spotify:local:x', name: 'L', artists: [] } });
  assert.equal(local.item.id, 'spotify:local:x');
  assert.equal(local.item.artworkURL, '');
});

test('parseCurrentlyPlaying: artwork pilih width terdekat 300', () => {
  const near = parseCurrentlyPlaying({
    currently_playing_type: 'track',
    item: {
      id: 'x',
      name: 'N',
      artists: [],
      album: {
        images: [
          { url: 'https://a/640.jpg', width: 640 },
          { url: 'https://a/200.jpg', width: 200 },
        ],
      },
    },
  });
  assert.equal(near.item.artworkURL, 'https://a/200.jpg');
  const onlyLarge = parseCurrentlyPlaying({
    currently_playing_type: 'track',
    item: {
      id: 'y',
      name: 'N',
      artists: [],
      album: { images: [{ url: 'https://a/big.jpg', width: 640 }] },
    },
  });
  assert.equal(onlyLarge.item.artworkURL, 'https://a/big.jpg');
});

function res(status, body, headers = {}) {
  const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    json: async () => JSON.parse(text || '{}'),
    text: async () => text,
  };
}

test('Spotify: refresh token, 204, 401 → refresh ulang, 429', async () => {
  const store = new Store(null);
  store.set({ refreshToken: 'rt-lama' });
  const calls = [];
  const queue = [
    res(200, { access_token: 'at1', expires_in: 3600 }),
    res(204),
    res(401, { error: 'expired' }),
    res(200, { access_token: 'at2', expires_in: 3600, refresh_token: 'rt-baru' }),
    res(200, { is_playing: false, progress_ms: 5, currently_playing_type: 'track', item: { id: 'x', name: 'N', artists: [{ name: 'Z' }] } }),
    res(429, {}, { 'retry-after': '12' }),
  ];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    return queue.shift();
  };
  const sp = createSpotify({ clientId: 'cid', clientSecret: 'sec', redirectUri: 'http://127.0.0.1:8888/callback', store, fetchImpl, log: { warn() {} } });

  assert.equal(await sp.getCurrentlyPlaying(), null);
  assert.equal(calls[0].opts.headers.Authorization, `Basic ${Buffer.from('cid:sec').toString('base64')}`);
  assert.match(calls[0].opts.body, /grant_type=refresh_token&refresh_token=rt-lama/);
  assert.equal(calls[1].opts.headers.Authorization, 'Bearer at1');

  const np = await sp.getCurrentlyPlaying();
  assert.equal(np.item.title, 'N');
  assert.equal(store.get('refreshToken'), 'rt-baru');
  assert.equal(calls[4].opts.headers.Authorization, 'Bearer at2');

  await assert.rejects(sp.getCurrentlyPlaying(), (e) => e.status === 429 && e.retryAfterSec === 12);
});

test('Spotify: refresh token dicabut → dihapus agar login ulang', async () => {
  const store = new Store(null);
  store.set({ refreshToken: 'rt' });
  const sp = createSpotify({
    clientId: 'c',
    clientSecret: 's',
    redirectUri: 'x',
    store,
    fetchImpl: async () => res(400, { error: 'invalid_grant', error_description: 'Refresh token revoked' }),
    log: { warn() {} },
  });
  await assert.rejects(sp.getCurrentlyPlaying(), /Refresh token revoked/);
  assert.equal(sp.isConnected(), false);
});

test('Spotify: URL authorize berisi scope & redirect', () => {
  const sp = createSpotify({ clientId: 'cid', clientSecret: 's', redirectUri: 'https://a.b/callback', store: new Store(null) });
  const u = new URL(sp.authorizeUrl('st8'));
  assert.equal(u.searchParams.get('scope'), 'user-read-currently-playing user-read-playback-state');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://a.b/callback');
  assert.equal(u.searchParams.get('state'), 'st8');
});

test('config: validasi & default', () => {
  const base = { PUBLIC_URL: 'https://lirik.example.com/', API_KEY: 'x'.repeat(20), SPOTIFY_CLIENT_ID: 'a', SPOTIFY_CLIENT_SECRET: 'b' };
  const dry = loadConfig({ ...base, APNS_DRY_RUN: '1' });
  assert.equal(dry.spotify.redirectUri, 'https://lirik.example.com/callback');
  assert.equal(dry.engine.pollMs, 3000);
  assert.equal(dry.engine.autoEndIdleMs, 15 * 60_000);
  assert.throws(() => loadConfig(base), /APNS_TEAM_ID/);
  assert.throws(() => loadConfig({ ...base, APNS_DRY_RUN: '1', API_KEY: 'pendek' }), /16 karakter/);
  const full = loadConfig({ ...base, APNS_TEAM_ID: 'T', APNS_KEY_ID: 'K', APNS_BUNDLE_ID: 'com.a', APNS_KEY_BASE64: Buffer.from('PEM').toString('base64') });
  assert.equal(full.apns.privateKey, 'PEM');
  assert.throws(() => loadConfig({ ...base, APNS_DRY_RUN: '1', APNS_ENV: 'prod' }), /APNS_ENV/);
});
