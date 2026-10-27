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

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
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

/**
 * HTTP API untuk app iPhone + alur login Spotify.
 * Semua /api/* butuh header x-api-key.
 */
export function createApp({ cfg, spotify, engine, log = console, now = () => Date.now() }) {
  const loginNonces = new Map(); // nonce → kedaluwarsa
  const oauthStates = new Map(); // state → kedaluwarsa

  const take = (map, key) => {
    const exp = map.get(key);
    map.delete(key);
    return Boolean(exp && exp > now());
  };
  const prune = (map) => {
    for (const [k, exp] of map) if (exp <= now()) map.delete(k);
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

    'GET /': (req, res) => send(res, 200, page('Lirik Island', 'Server berjalan. Buka app di iPhone untuk menghubungkan Spotify.')),

    // ---- alur login Spotify (link sekali pakai, dibuat dari app / CLI) ----
    'POST /api/login-link': (req, res) => {
      prune(loginNonces);
      const nonce = crypto.randomBytes(18).toString('base64url');
      loginNonces.set(nonce, now() + LINK_TTL_MS);
      send(res, 200, { url: `${cfg.publicUrl}/login?n=${nonce}`, expiresInSec: LINK_TTL_MS / 1000 });
    },

    'GET /login': (req, res, url) => {
      if (!take(loginNonces, url.searchParams.get('n') ?? '')) {
        return send(res, 403, page('Link kedaluwarsa', 'Buat link login baru dari app atau <code>npm run login</code>.'));
      }
      prune(oauthStates);
      const state = crypto.randomBytes(18).toString('base64url');
      oauthStates.set(state, now() + LINK_TTL_MS);
      send(res, 302, '', { Location: spotify.authorizeUrl(state) });
    },

    'GET /callback': async (req, res, url) => {
      const err = url.searchParams.get('error');
      if (err) return send(res, 400, page('Login dibatalkan', `Spotify: ${esc(err)}`));
      if (!take(oauthStates, url.searchParams.get('state') ?? '')) {
        return send(res, 403, page('Sesi login tidak valid', 'Ulangi dari awal.'));
      }
      try {
        await spotify.exchangeCode(url.searchParams.get('code') ?? '');
      } catch (e) {
        log.warn?.(`[auth] tukar kode gagal: ${e.message}`);
        return send(res, 502, page('Gagal terhubung ke Spotify', esc(e.message)));
      }
      engine.kick();
      send(res, 200, page('Spotify terhubung ✓', 'Silakan kembali ke app Lirik Island lalu putar lagu di Spotify.'));
    },

    // ---- dipanggil app iPhone ----
    'POST /api/push-to-start-token': async (req, res) => {
      const token = requireToken(await readJson(req));
      engine.registerPushToStart(token);
      send(res, 200, { ok: true });
    },

    'POST /api/activity-token': async (req, res) => {
      const body = await readJson(req);
      const token = requireToken(body);
      engine.registerActivity({ token, activityId: body.activityId ? String(body.activityId).slice(0, 100) : null });
      send(res, 200, { ok: true });
    },

    'POST /api/activity-ended': async (req, res) => {
      const body = await readJson(req);
      engine.activityEnded({ activityId: body.activityId ? String(body.activityId) : null });
      send(res, 200, { ok: true });
    },

    'GET /api/status': (req, res) => send(res, 200, engine.status()),

    'POST /api/device-token': async (req, res) => {
      const token = requireToken(await readJson(req));
      engine.registerDeviceToken(token);
      send(res, 200, { ok: true });
    },

    'POST /api/preferences': async (req, res) => {
      const body = await readJson(req);
      const preferences = engine.setPreferences(body);
      send(res, 200, { preferences });
    },

    'POST /api/test-push': async (req, res) => {
      const r = await engine.testPush();
      send(res, r?.ok ? 200 : 502, r?.ok ? { ok: true } : { error: `Push gagal: ${r?.status ?? 0} ${r?.reason ?? ''}`.trim() });
    },
  };

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const handler = routes[`${req.method} ${url.pathname}`];
    if (!handler) return send(res, 404, { error: 'Tidak ditemukan' });

    if (url.pathname.startsWith('/api/') && !safeEqual(req.headers['x-api-key'] ?? '', cfg.apiKey)) {
      return send(res, 401, { error: 'API key salah' });
    }
    try {
      await handler(req, res, url);
    } catch (e) {
      const status = e.status ?? 500;
      if (status >= 500) log.error?.(`[http] ${req.method} ${url.pathname}: ${e.stack || e.message}`);
      if (!res.headersSent) send(res, status, { error: e.message });
    }
  });
}
