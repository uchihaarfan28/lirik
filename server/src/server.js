import { createApns } from './apns.js';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { log } from './log.js';
import { createLyricsProvider } from './lyrics.js';
import { UserRuntime } from './runtime.js';
import { UserRegistry } from './users.js';

let cfg;
try {
  cfg = loadConfig();
} catch (e) {
  log.error(e.message);
  process.exit(1);
}

const registry = new UserRegistry({
  dataDir: cfg.dataDir,
  bootstrapApiKey: cfg.apiKey,
  log,
}).load();

const lyrics = createLyricsProvider({ userAgent: `LirikIsland/0.1 (+${cfg.publicUrl})`, log });
const apns = createApns({ ...cfg.apns, log });
const runtime = new UserRuntime({
  registry,
  lyrics,
  apns,
  spotifyCfg: cfg.spotify,
  engineCfg: { ...cfg.engine, attributesType: cfg.attributesType, appName: cfg.appName },
  log,
}).boot();

const server = createApp({ cfg, runtime, log });

server.listen(cfg.port, () => {
  log.info(`Lirik Island server di port ${cfg.port} — ${cfg.publicUrl}`);
  log.info(`APNs: ${cfg.apns.dryRun ? 'DRY RUN (push hanya dicetak ke log)' : `${cfg.apns.env}, topic ${apns.topic}`}`);
  log.info(`Users: ${registry.list().map((u) => u.name).join(', ') || '(kosong)'}`);
  const connected = [...runtime.sessions.values()].filter((s) => s.spotify.isConnected()).length;
  if (!connected) log.info('Spotify belum terhubung → npm run login (atau Hubungkan dari app)');
  runtime.startAll();
});

const shutdown = () => {
  log.info('Berhenti…');
  runtime.stopAll();
  apns.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
