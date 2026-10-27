import crypto from 'node:crypto';
import http from 'node:http';

const TOKEN_RE = /^[0-9a-f]{32,512}$/i;
const LINK_TTL_MS = 10 * 60_000;

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function page(title, body) {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>body{font-family:-apple-system,system-ui,sans-serif;max-width:480px;margin:15vh auto;padding:0 20px;line-height:1.5;color:#111;background:#fafafa}
h1{font-size:22px}@media(prefers-color-scheme:dark){body{background:#111;color:#eee}}</style></head>
<body><h1>${esc(title)}</h1><p>${body}</p></body></html>`;
}

function readJson(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('Body terlalu besar'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('JSON tidak valid'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function optionalDeviceId(body) {
  const id = body?.deviceId != null ? String(body.deviceId).trim().slice(0, 128) : '';
  return id || null;
}

/**
 * HTTP API multi-user.
 * `runtime` = UserRuntime (resolveApiKey / byUserId).
 * Semua /api/* butuh x-api-key milik salah satu user.
 */
export function createApp({ cfg, runtime, log = console, now = () => Date.now() }) {
  const loginNonces = new Map(); // nonce → { exp, userId }
  const oauthStates = new Map(); // state → { exp, userId }

  const take = (map, key) => {
    const row = map.get(key);
    map.delete(key);
    return row && row.exp > now() ? row : null;
  };
  const prune = (map) => {
    for (const [k, row] of map) if (row.exp <= now()) map.delete(k);
  };

  const send = (res, status, body, headers = {}) => {
    const isJson = typeof body === 'object';
    res.writeHead(status, {
      'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    });
    res.end(isJson ? JSON.stringify(body) : body);
  };

  const requireToken = (body) => {
    const token = String(body.token ?? '').trim();
    if (!TOKEN_RE.test(token)) throw Object.assign(new Error('Token tidak valid'), { status: 400 });
    return token;
  };

  const routes = {
    'GET /health': (req, res) => send(res, 200, { ok: true }),

    'GET /': (req, res) =>
      send(res, 200, page('Lirik Island', 'Server berjalan. Buka app di iPhone untuk menghubungkan Spotify.')),

    'POST /api/login-link': (req, res, url, session) => {
      prune(loginNonces);
      const nonce = crypto.randomBytes(18).toString('base64url');
      loginNonces.set(nonce, { exp: now() + LINK_TTL_MS, userId: session.meta.id });
      send(res, 200, { url: `${cfg.publicUrl}/login?n=${nonce}`, expiresInSec: LINK_TTL_MS / 1000 });
    },

    'GET /login': (req, res, url) => {
      const row = take(loginNonces, url.searchParams.get('n') ?? '');
      if (!row) {
        return send(res, 403, page('Link kedaluwarsa', 'Buat link login baru dari app atau <code>npm run login</code>.'));
      }
      const session = runtime.byUserId(row.userId);
      if (!session) return send(res, 500, page('User tidak ditemukan', 'Restart server lalu coba lagi.'));
      prune(oauthStates);
      const state = crypto.randomBytes(18).toString('base64url');
      oauthStates.set(state, { exp: now() + LINK_TTL_MS, userId: row.userId });
      send(res, 302, '', { Location: session.spotify.authorizeUrl(state) });
    },

    'GET /callback': async (req, res, url) => {
      const err = url.searchParams.get('error');
      if (err) return send(res, 400, page('Login dibatalkan', `Spotify: ${esc(err)}`));
      const row = take(oauthStates, url.searchParams.get('state') ?? '');
      if (!row) return send(res, 403, page('Sesi login tidak valid', 'Ulangi dari awal.'));
      const session = runtime.byUserId(row.userId);
      if (!session) return send(res, 500, page('User tidak ditemukan', 'Restart server lalu coba lagi.'));
      try {
        await session.spotify.exchangeCode(url.searchParams.get('code') ?? '');
      } catch (e) {
        log.warn?.(`[auth] tukar kode gagal: ${e.message}`);
        return send(res, 502, page('Gagal terhubung ke Spotify', esc(e.message)));
      }
      session.engine.kick();
      send(res, 200, page('Spotify terhubung ✓', 'Silakan kembali ke app Lirik Island lalu putar lagu di Spotify.'));
    },

    'POST /api/push-to-start-token': async (req, res, url, session) => {
      const body = await readJson(req);
      const token = requireToken(body);
      session.engine.registerPushToStart(token, { deviceId: optionalDeviceId(body) });
      send(res, 200, { ok: true });
    },

    'POST /api/activity-token': async (req, res, url, session) => {
      const body = await readJson(req);
      const token = requireToken(body);
      session.engine.registerActivity({
        token,
        activityId: body.activityId ? String(body.activityId).slice(0, 100) : null,
        deviceId: optionalDeviceId(body),
      });
      send(res, 200, { ok: true });
    },

    'POST /api/activity-ended': async (req, res, url, session) => {
      const body = await readJson(req);
      session.engine.activityEnded({
        activityId: body.activityId ? String(body.activityId) : null,
        deviceId: optionalDeviceId(body),
      });
      send(res, 200, { ok: true });
    },

    'GET /api/status': (req, res, url, session) => send(res, 200, session.engine.status()),

    'GET /api/lyrics': (req, res, url, session) => send(res, 200, session.engine.lyricsPayload()),

    'GET /api/me': (req, res, url, session) => {
      const me = runtime.registry.me(session.meta.id);
      send(res, 200, me);
    },

    'POST /api/logout': (req, res, url, session) => {
      session.spotify.logout();
      session.engine.kick();
      send(res, 200, { ok: true, spotifyConnected: false });
    },

    'POST /api/device-token': async (req, res, url, session) => {
      const body = await readJson(req);
      const token = requireToken(body);
      session.engine.registerDeviceToken(token, { deviceId: optionalDeviceId(body) });
      send(res, 200, { ok: true });
    },

    'POST /api/preferences': async (req, res, url, session) => {
      const body = await readJson(req);
      const preferences = session.engine.setPreferences(body);
      send(res, 200, { preferences });
    },

    'POST /api/test-push': async (req, res, url, session) => {
      const r = await session.engine.testPush();
      send(res, r?.ok ? 200 : 502, r?.ok ? { ok: true } : { error: `Push gagal: ${r?.status ?? 0} ${r?.reason ?? ''}`.trim() });
    },
  };

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const handler = routes[`${req.method} ${url.pathname}`];
    if (!handler) return send(res, 404, { error: 'Tidak ditemukan' });

    const needsAuth = url.pathname.startsWith('/api/');
    let session = null;
    if (needsAuth) {
      const key = req.headers['x-api-key'] ?? '';
      session = runtime.resolveApiKey(key);
      if (!session) return send(res, 401, { error: 'API key salah' });
    }

    try {
      await handler(req, res, url, session);
    } catch (e) {
      const status = e.status ?? 500;
      if (status >= 500) log.error?.(`[http] ${req.method} ${url.pathname}: ${e.stack || e.message}`);
      if (!res.headersSent) send(res, status, { error: e.message });
    }
  });
}
