import fs from 'node:fs';
import path from 'node:path';

function num(env, name, def) {
  const v = env[name];
  if (v === undefined || v === '') return def;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} harus berupa angka`);
  return n;
}

function bool(env, name, def = false) {
  const v = env[name];
  if (v === undefined || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

function loadPrivateKey(env) {
  if (env.APNS_KEY_BASE64) return Buffer.from(env.APNS_KEY_BASE64, 'base64').toString('utf8');
  if (env.APNS_KEY) return env.APNS_KEY.replace(/\\n/g, '\n');
  if (env.APNS_KEY_PATH) return fs.readFileSync(path.resolve(env.APNS_KEY_PATH), 'utf8');
  return '';
}

export function loadConfig(env = process.env) {
  const missing = [];
  const req = (k) => {
    const v = String(env[k] ?? '').trim();
    if (!v) missing.push(k);
    return v;
  };

  const publicUrl = req('PUBLIC_URL').replace(/\/+$/, '');
  const apiKey = req('API_KEY');

  const cfg = {
    port: num(env, 'PORT', 8888),
    publicUrl,
    apiKey,
    dataDir: path.resolve(env.DATA_DIR || './data'),
    appName: env.APP_NAME || 'Lirik Island',
    attributesType: 'LyricsActivityAttributes',
    spotify: {
      clientId: req('SPOTIFY_CLIENT_ID'),
      clientSecret: req('SPOTIFY_CLIENT_SECRET'),
      redirectUri: `${publicUrl}/callback`,
    },
    apns: {
      dryRun: bool(env, 'APNS_DRY_RUN'),
      env: env.APNS_ENV || 'development',
      teamId: '',
      keyId: '',
      bundleId: '',
      privateKey: '',
    },
    engine: {
      pollMs: num(env, 'POLL_MS', 3000),
      idlePollMs: num(env, 'IDLE_POLL_MS', 10000),
      leadMs: num(env, 'LEAD_MS', 400),
      minPushIntervalMs: num(env, 'MIN_PUSH_INTERVAL_MS', 1000),
      autoEndIdleMs: num(env, 'AUTO_END_IDLE_MIN', 15) * 60_000,
      startCooldownMs: 60_000,
      logPushes: bool(env, 'LOG_PUSHES'),
    },
  };

  if (!cfg.apns.dryRun) {
    cfg.apns.teamId = req('APNS_TEAM_ID');
    cfg.apns.keyId = req('APNS_KEY_ID');
    cfg.apns.bundleId = req('APNS_BUNDLE_ID');
    cfg.apns.privateKey = loadPrivateKey(env);
    if (!cfg.apns.privateKey) missing.push('APNS_KEY_PATH / APNS_KEY_BASE64');
  } else {
    cfg.apns.bundleId = env.APNS_BUNDLE_ID || 'com.example.lirikisland';
  }

  if (missing.length) throw new Error(`Konfigurasi belum lengkap, isi di .env: ${missing.join(', ')}`);
  if (apiKey.length < 16) throw new Error('API_KEY minimal 16 karakter (pakai: openssl rand -hex 24)');
  if (!['development', 'production'].includes(cfg.apns.env)) {
    throw new Error('APNS_ENV harus "development" (build dari Xcode) atau "production" (TestFlight/App Store)');
  }
  return cfg;
}
