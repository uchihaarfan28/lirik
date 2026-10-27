import { LyricsEngine } from './engine.js';
import { createSpotify } from './spotify.js';

/**
 * Satu proses: N pasang Spotify + LyricsEngine (satu per user).
 */
export class UserRuntime {
  constructor({
    registry,
    lyrics,
    apns,
    spotifyCfg,
    engineCfg,
    log = console,
    createSpotifyFn = createSpotify,
    LyricsEngineClass = LyricsEngine,
  }) {
    this.registry = registry;
    this.lyrics = lyrics;
    this.apns = apns;
    this.spotifyCfg = spotifyCfg;
    this.engineCfg = engineCfg;
    this.log = log;
    this.createSpotifyFn = createSpotifyFn;
    this.LyricsEngineClass = LyricsEngineClass;
    /** @type {Map<string, { meta: object, spotify: object, engine: LyricsEngine }>} */
    this.sessions = new Map();
  }

  boot() {
    for (const meta of this.registry.list()) {
      this.attach(meta);
    }
    return this;
  }

  attach(meta) {
    const store = this.registry.getStore(meta.id);
    if (!store) throw new Error(`Store user ${meta.id} tidak ada`);
    const spotify = this.createSpotifyFn({ ...this.spotifyCfg, store, log: this.log });
    const engine = new this.LyricsEngineClass({
      spotify,
      lyrics: this.lyrics,
      apns: this.apns,
      store,
      config: this.engineCfg,
      log: this.log,
    });
    const session = { meta, spotify, engine };
    this.sessions.set(meta.id, session);
    return session;
  }

  startAll() {
    for (const { engine } of this.sessions.values()) engine.start();
  }

  stopAll() {
    for (const { engine } of this.sessions.values()) engine.stop();
  }

  resolveApiKey(apiKey) {
    const meta = this.registry.resolveApiKey(apiKey);
    if (!meta) return null;
    return this.sessions.get(meta.id) ?? null;
  }

  byUserId(userId) {
    return this.sessions.get(userId) ?? null;
  }

  /** Setelah CLI menambah user saat server mati; untuk tes / hot-add. */
  addSession(meta) {
    return this.attach(meta);
  }
}
