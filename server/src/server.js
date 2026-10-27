import path from 'node:path';
import { createApns } from './apns.js';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { LyricsEngine } from './engine.js';
import { log } from './log.js';
import { createLyricsProvider } from './lyrics.js';
import { createSpotify } from './spotify.js';
import { Store } from './store.js';

let cfg;
try {
  cfg = loadConfig();
} catch (e) {
  log.error(e.message);
  process.exit(1);
}

const store = new Store(path.join(cfg.dataDir, 'state.json'));
const spotify = createSpotify({ ...cfg.spotify, store, log });
const lyrics = createLyricsProvider({ userAgent: `LirikIsland/0.1 (+${cfg.publicUrl})`, log });
const apns = createApns({ ...cfg.apns, log });
const engine = new LyricsEngine({
  spotify,
  lyrics,
  apns,
  store,
  config: { ...cfg.engine, attributesType: cfg.attributesType, appName: cfg.appName },
  log,
});
const server = createApp({ cfg, spotify, engine, log });

server.listen(cfg.port, () => {
  log.info(`Lirik Island server di port ${cfg.port} — ${cfg.publicUrl}`);
  log.info(`APNs: ${cfg.apns.dryRun ? 'DRY RUN (push hanya dicetak ke log)' : `${cfg.apns.env}, topic ${apns.topic}`}`);
  if (!spotify.isConnected()) log.info('Spotify belum terhubung → jalankan: npm run login');
  engine.start();
});

const shutdown = () => {
  log.info('Berhenti…');
  engine.stop();
  apns.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
