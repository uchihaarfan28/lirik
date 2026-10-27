import { isDeadToken } from './apns.js';
import { indexAt } from './lyrics.js';

const MAX_TEXT = 140; // payload Live Activity maks 4 KB — teks dipotong biar aman
const clip = (s) => {
  const v = String(s ?? '');
  return v.length > MAX_TEXT ? `${v.slice(0, MAX_TEXT - 1)}…` : v;
};

const STALE_AFTER_SEC = 15 * 60; // kalau server mati, Live Activity ditandai "basi" setelah 15 menit
const ACTIVITY_MAX_MS = 8 * 3600_000; // iOS mengakhiri Live Activity setelah 8 jam
const PAUSE_GRACE_SEC = 20; // hideAfterPauseSec=0 → ambang efektif 20 dtk (anti-kedip ganti lagu)

export const PREFS_HIDE_AFTER = new Set([0, 60, 300, 900, -1]);
export const PREFS_PAUSE_MODE = new Set(['dim', 'hide']);

export function defaultPrefs(autoEndIdleMs = 15 * 60_000) {
  const fromEnv = Math.round(Number(autoEndIdleMs) / 1000);
  const hideAfterPauseSec = PREFS_HIDE_AFTER.has(fromEnv) ? fromEnv : 900;
  return { hideAfterPauseSec, autoStart: true, pauseMode: 'hide' };
}

export function validatePrefsPatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw Object.assign(new Error('Body preferensi tidak valid'), { status: 400 });
  }
  const patch = {};
  if ('hideAfterPauseSec' in body) {
    const n = Number(body.hideAfterPauseSec);
    if (!Number.isInteger(n) || !PREFS_HIDE_AFTER.has(n)) {
      throw Object.assign(new Error('hideAfterPauseSec harus 0, 60, 300, 900, atau -1'), { status: 400 });
    }
    patch.hideAfterPauseSec = n;
  }
  if ('autoStart' in body) {
    if (typeof body.autoStart !== 'boolean') {
      throw Object.assign(new Error('autoStart harus boolean'), { status: 400 });
    }
    patch.autoStart = body.autoStart;
  }
  if ('pauseMode' in body) {
    if (!PREFS_PAUSE_MODE.has(body.pauseMode)) {
      throw Object.assign(new Error('pauseMode harus "dim" atau "hide"'), { status: 400 });
    }
    patch.pauseMode = body.pauseMode;
  }
  return patch;
}

/** Ambang efektif (ms) untuk auto-end idle. null = jangan pernah end. */
export function effectiveHideAfterMs(prefs) {
  if (!prefs || prefs.pauseMode === 'dim') return null;
  const sec = prefs.hideAfterPauseSec;
  if (sec === -1) return null;
  if (sec === 0) return PAUSE_GRACE_SEC * 1000;
  return sec * 1000;
}

/**
 * Inti sinkronisasi:
 *  1. polling Spotify → judul + posisi lagu
 *  2. ambil lirik LRC → daftar baris bertimestamp
 *  3. pasang timer tepat di pergantian baris → kirim push update ke Live Activity
 */
export class LyricsEngine {
  constructor({
    spotify,
    lyrics,
    apns,
    store,
    config,
    clock = { now: () => Date.now() },
    timers = { setTimeout, clearTimeout },
    log = console,
  }) {
    this.spotify = spotify;
    this.lyrics = lyrics;
    this.apns = apns;
    this.store = store;
    this.cfg = config;
    this.clock = clock;
    this.timers = timers;
    this.log = log;

    this.track = null;
    this.playing = false;
    this.anchor = { progressMs: 0, at: 0 };
    this.lyricState = { status: 'idle', lines: [] };
    this.currentIndex = -1;

    this.lastSentKey = null;
    this.lastPushAt = -Infinity;
    this.lastTs = 0;
    this.notPlayingSince = null;
    this.startRequestedAt = -Infinity;
    this.lastArtworkKey = null;

    this.pollTimer = null;
    this.lineTimer = null;
    this.pushTimer = null;
    this.polling = false;
    this.pollAgain = false;
    this.running = false;

    this.lastPush = null;
    this.lastError = null;

    if (!this.store.get('prefs')) {
      this.store.set({ prefs: defaultPrefs(this.cfg.autoEndIdleMs) });
    }
  }

  now() {
    return this.clock.now();
  }

  prefs() {
    return { ...defaultPrefs(this.cfg.autoEndIdleMs), ...(this.store.get('prefs') || {}) };
  }

  setPreferences(patch) {
    const next = { ...this.prefs(), ...validatePrefsPatch(patch) };
    this.store.set({ prefs: next });
    return next;
  }

  // ---------- siklus hidup ----------

  start() {
    if (this.running) return;
    this.running = true;
    this.schedulePoll(0);
  }

  stop() {
    this.running = false;
    for (const k of ['pollTimer', 'lineTimer', 'pushTimer']) {
      if (this[k]) this.timers.clearTimeout(this[k]);
      this[k] = null;
    }
  }

  /** Paksa polling sekarang (mis. setelah login Spotify / token baru masuk). */
  kick() {
    if (this.running) this.schedulePoll(0);
  }

  schedulePoll(ms) {
    if (this.pollTimer) this.timers.clearTimeout(this.pollTimer);
    this.pollTimer = this.timers.setTimeout(() => {
      this.pollTimer = null;
      this.poll().catch((e) => this.log.error?.(`[engine] ${e.stack || e.message}`));
    }, ms);
  }

  async poll() {
    if (this.polling) {
      this.pollAgain = true;
      return;
    }
    this.polling = true;
    let next = this.cfg.idlePollMs;
    try {
      if (!this.spotify.isConnected()) {
        this.lastError = 'Spotify belum terhubung';
        return;
      }
      const sentAt = this.now();
      const np = await this.spotify.getCurrentlyPlaying();
      const at = this.now();
      this.lastError = null;
      this.applyPlayback(np, at, Math.max(0, (at - sentAt) / 2));

      if (this.playing) {
        next = this.cfg.pollMs;
        // cek lebih cepat menjelang lagu habis supaya lagu berikutnya langsung ketahuan
        const remaining = (this.track?.durationMs ?? 0) - this.positionAt(this.now());
        if (remaining > 0) next = Math.min(next, remaining + 600);
      }
      await this.maintainActivity();
      await this.maybeSendArtworkPush();
    } catch (e) {
      this.lastError = e.message;
      if (e.status === 429 && e.retryAfterSec) next = Math.max(next, e.retryAfterSec * 1000);
      this.log.warn?.(`[engine] polling gagal: ${e.message}`);
    } finally {
      this.polling = false;
      const again = this.pollAgain;
      this.pollAgain = false;
      if (this.running) this.schedulePoll(again ? 0 : next);
    }
  }

  // ---------- status pemutaran ----------

  positionAt(t) {
    const raw = this.playing ? this.anchor.progressMs + (t - this.anchor.at) : this.anchor.progressMs;
    const dur = this.track?.durationMs || Infinity;
    return Math.min(Math.max(0, raw), dur);
  }

  /** Unix detik saat posisi lagu = 0 (stabil tanpa seek/pause/resume). */
  playbackStartSec() {
    if (!this.track) return 0;
    return Math.max(0, Math.floor((this.anchor.at - this.anchor.progressMs) / 1000));
  }

  applyPlayback(np, at, latencyMs) {
    const item = np?.item ?? null;
    if (!item) {
      // tidak ada lagu / iklan / podcast → anggap pause, posisi dibekukan
      const wasPlaying = this.playing;
      const pos = this.positionAt(at);
      this.playing = false;
      // Jangan geser anchor tiap poll — playbackStartSec harus stabil saat jeda
      if (wasPlaying || this.notPlayingSince === null) {
        this.anchor = { progressMs: pos, at };
      }
      if (this.notPlayingSince === null) this.notPlayingSince = at;
      this.resync();
      return;
    }
    if (!this.track || this.track.id !== item.id) this.onTrackChange(item);
    const wasPlaying = this.playing;
    this.playing = np.isPlaying;
    if (this.playing) {
      this.anchor = { progressMs: np.progressMs + latencyMs, at };
      this.notPlayingSince = null;
    } else {
      const progressMs = np.progressMs;
      // Transisi ke jeda, atau seek saat jeda (>0.5 dtk) → perbarui anchor sekali
      if (wasPlaying || this.notPlayingSince === null || Math.abs(progressMs - this.anchor.progressMs) > 500) {
        this.anchor = { progressMs, at };
      }
      if (this.notPlayingSince === null) this.notPlayingSince = at;
    }
    this.resync();
  }

  onTrackChange(item) {
    this.track = item;
    this.lyricState = { status: 'loading', lines: [] };
    this.currentIndex = -1;
    const id = item.id;
    this.log.info?.(`[engine] lagu: ${item.title} — ${item.artist}`);
    Promise.resolve(this.lyrics.getLyrics(item))
      .then((res) => {
        if (this.track?.id !== id) return;
        this.lyricState = res?.status === 'error' || !res ? { status: 'error', lines: [] } : res;
        this.log.info?.(`[engine] lirik: ${this.lyricState.status} (${this.lyricState.lines.length} baris)`);
        this.resync();
      })
      .catch(() => {
        if (this.track?.id !== id) return;
        this.lyricState = { status: 'error', lines: [] };
        this.resync();
      });
  }

  /** Hitung baris yang sedang aktif, kirim bila berubah, dan pasang timer ke baris berikutnya. */
  resync() {
    if (this.lineTimer) {
      this.timers.clearTimeout(this.lineTimer);
      this.lineTimer = null;
    }
    const lines = this.lyricState.status === 'synced' ? this.lyricState.lines : [];
    // leadMs: kirim sedikit lebih awal untuk menutup delay pengiriman push
    const pos = this.positionAt(this.now()) + (this.playing ? this.cfg.leadMs : 0);
    this.currentIndex = lines.length ? indexAt(lines, pos) : -1;
    this.pushIfChanged();

    if (this.playing && lines.length && this.currentIndex + 1 < lines.length) {
      const delay = Math.max(30, lines[this.currentIndex + 1].t - pos);
      this.lineTimer = this.timers.setTimeout(() => {
        this.lineTimer = null;
        this.resync();
      }, delay);
    }
  }

  buildState() {
    const t = this.track;
    const timing = {
      trackId: t?.id ? String(t.id) : '',
      durationMs: t ? Math.round(Number(t.durationMs) || 0) : 0,
      playbackStartSec: this.playbackStartSec(),
    };
    const base = {
      title: clip(t?.title ?? ''),
      artist: clip(t?.artist ?? ''),
      isPlaying: Boolean(t) && this.playing,
      hasLyrics: this.lyricState.status === 'synced',
      ...timing,
    };
    const msg = (line) => ({ ...base, line, nextLine: '' });
    if (!t) return msg('Putar lagu di Spotify');
    switch (this.lyricState.status) {
      case 'loading':
        return msg('Memuat lirik…');
      case 'instrumental':
        return msg('♪ Instrumental ♪');
      case 'plain':
        return msg('Lirik ada, tapi belum tersinkron');
      case 'none':
        return msg('Lirik tidak ditemukan');
      case 'error':
        return msg('Gagal memuat lirik');
      case 'synced': {
        const lines = this.lyricState.lines;
        const i = this.currentIndex;
        const cur = i >= 0 ? lines[i].text : '';
        const nxt = lines.slice(i + 1).find((l) => l.text)?.text ?? ''; // lewati jeda kosong
        return { ...base, line: clip(cur || '♪'), nextLine: clip(nxt) };
      }
      default:
        return msg('');
    }
  }

  // ---------- pengiriman push ----------

  nextTimestamp() {
    // APNs mengabaikan update dengan timestamp ≤ update sebelumnya → harus naik terus
    this.lastTs = Math.max(Math.floor(this.now() / 1000), this.lastTs + 1);
    return this.lastTs;
  }

  pushIfChanged() {
    const state = this.buildState();
    const key = JSON.stringify(state);
    if (key === this.lastSentKey) return;
    if (!this.store.get('activity')?.token) return;

    const wait = this.lastPushAt + this.cfg.minPushIntervalMs - this.now();
    if (wait > 0) {
      if (!this.pushTimer) {
        this.pushTimer = this.timers.setTimeout(() => {
          this.pushTimer = null;
          this.pushIfChanged();
        }, wait);
      }
      return;
    }
    this.lastSentKey = key;
    this.lastPushAt = this.now();
    this.sendToActivity('update', state).catch((e) => this.log.warn?.(`[engine] push gagal: ${e.message}`));
  }

  recordPush(event, res, state) {
    this.lastPush = {
      at: new Date(this.now()).toISOString(),
      event,
      ok: Boolean(res?.ok),
      status: res?.status ?? 0,
      reason: res?.reason ?? null,
      line: state?.line ?? '',
    };
  }

  async sendToActivity(event, state, extra = {}) {
    const activity = this.store.get('activity');
    if (!activity?.token) return null;
    const ts = this.nextTimestamp();
    const aps = { timestamp: ts, event, 'content-state': state, ...extra };
    if (event === 'update') aps['stale-date'] = ts + STALE_AFTER_SEC;

    const res = await this.apns.send(activity.token, aps, { priority: 10, label: event });
    this.recordPush(event, res, state);
    if (res.ok && this.cfg.logPushes) this.log.info?.(`[push] ${event} ${res.status} ${state.line}`);
    if (!res.ok) {
      this.lastSentKey = null; // biar dicoba lagi di resync berikutnya
      this.log.warn?.(`[engine] APNs ${event} gagal: ${res.status} ${res.reason ?? ''}`);
      if (isDeadToken(res) && this.store.get('activity')?.token === activity.token) {
        this.log.warn?.('[engine] token Live Activity sudah tidak berlaku → dihapus. (BadDeviceToken? cek APNS_ENV)');
        this.store.set({ activity: null });
      }
    }
    return res;
  }

  /** Silent push artwork (best-effort): hanya bila device token + activity + cover berubah. */
  async maybeSendArtworkPush() {
    const track = this.track;
    const url = track?.artworkURL;
    const trackId = track?.id ? String(track.id) : '';
    if (!trackId || !url) return;

    const key = `${trackId}|${url}`;
    if (key === this.lastArtworkKey) return;

    const deviceToken = this.store.get('deviceToken');
    const activity = this.store.get('activity');
    if (!deviceToken || !activity?.token) return;

    this.lastArtworkKey = key;
    const res = await this.apns.send(
      deviceToken,
      { 'content-available': 1 },
      {
        priority: 5,
        label: 'artwork',
        pushType: 'background',
        extra: { artwork: { trackId, url } },
      },
    );
    if (!res.ok) {
      this.log.warn?.(`[engine] silent artwork gagal: ${res.status} ${res.reason ?? ''}`);
      if (isDeadToken(res)) {
        this.log.warn?.('[engine] device token tidak berlaku → dihapus');
        this.store.set({ deviceToken: null });
        this.lastArtworkKey = null;
      }
    }
  }

  /** Auto-start (push-to-start) saat musik mulai, auto-end saat lama tidak ada musik. */
  async maintainActivity() {
    const now = this.now();
    const prefs = this.prefs();
    let activity = this.store.get('activity');

    if (activity?.token && activity.registeredAtMs && now - activity.registeredAtMs > ACTIVITY_MAX_MS) {
      this.store.set({ activity: null });
      activity = null;
    }

    if (prefs.autoStart && this.playing && this.track && !activity?.token) {
      const pts = this.store.get('pushToStartToken');
      if (pts && now - this.startRequestedAt > this.cfg.startCooldownMs) {
        this.startRequestedAt = now;
        const state = this.buildState();
        const ts = this.nextTimestamp();
        const aps = {
          timestamp: ts,
          event: 'start',
          'content-state': state,
          'attributes-type': this.cfg.attributesType,
          attributes: { appName: this.cfg.appName },
          alert: { title: state.title || this.cfg.appName, body: state.artist || 'Lirik siap' },
          'input-push-token': 1,
          'stale-date': ts + STALE_AFTER_SEC,
        };
        const res = await this.apns.send(pts, aps, { priority: 10, label: 'start' });
        this.recordPush('start', res, state);
        if (!res.ok && isDeadToken(res)) this.store.set({ pushToStartToken: null });
      }
    }

    const hideAfterMs = effectiveHideAfterMs(prefs);
    if (
      activity?.token &&
      hideAfterMs !== null &&
      !this.playing &&
      this.notPlayingSince !== null &&
      now - this.notPlayingSince >= hideAfterMs
    ) {
      await this.endActivity();
    }
  }

  async endActivity() {
    const state = { ...this.buildState(), isPlaying: false };
    await this.sendToActivity('end', state, { 'dismissal-date': Math.floor(this.now() / 1000) });
    this.store.set({ activity: null });
    this.lastSentKey = null;
  }

  // ---------- dipanggil dari HTTP API ----------

  registerActivity({ token, activityId }) {
    const prev = this.store.get('activity');
    if (prev?.token === token) return;
    this.store.set({ activity: { token, id: activityId ?? null, registeredAtMs: this.now() } });
    this.lastSentKey = null;
    this.lastPushAt = -Infinity;
    this.lastArtworkKey = null;
    this.log.info?.('[engine] Live Activity terdaftar');
    this.resync();
    this.kick();
  }

  activityEnded({ activityId }) {
    const a = this.store.get('activity');
    if (a && (!activityId || !a.id || a.id === activityId)) {
      this.store.set({ activity: null });
      this.lastSentKey = null;
    }
  }

  registerPushToStart(token) {
    this.store.set({ pushToStartToken: token });
    this.startRequestedAt = -Infinity;
    this.kick();
  }

  registerDeviceToken(token) {
    this.store.set({ deviceToken: token });
    this.lastArtworkKey = null;
    this.kick();
  }

  async testPush() {
    if (!this.store.get('activity')?.token) {
      return { ok: false, status: 0, reason: 'Belum ada Live Activity yang terdaftar di server' };
    }
    const time = new Date(this.now()).toISOString().slice(11, 19);
    const state = { ...this.buildState(), line: 'Tes dari server ✓', nextLine: `${time} UTC` };
    this.lastSentKey = null;
    this.lastPushAt = this.now();
    return this.sendToActivity('update', state);
  }

  status() {
    const s = this.buildState();
    const prefs = this.prefs();
    return {
      spotifyConnected: this.spotify.isConnected(),
      pushToStartRegistered: Boolean(this.store.get('pushToStartToken')),
      activityRegistered: Boolean(this.store.get('activity')?.token),
      nowPlaying: this.track
        ? {
            title: this.track.title,
            artist: this.track.artist,
            isPlaying: this.playing,
            positionMs: Math.round(this.positionAt(this.now())),
            durationMs: this.track.durationMs,
            trackId: String(this.track.id ?? ''),
            album: this.track.album ?? '',
            artworkURL: this.track.artworkURL ?? '',
          }
        : null,
      lyrics: this.lyricState.status,
      line: s.line,
      nextLine: s.nextLine,
      lastPush: this.lastPush,
      lastError: this.lastError,
      preferences: {
        hideAfterPauseSec: prefs.hideAfterPauseSec,
        autoStart: prefs.autoStart,
        pauseMode: prefs.pauseMode,
      },
    };
  }
}
