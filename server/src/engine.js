import { isDeadToken } from './apns.js';
import { indexAt } from './lyrics.js';

const MAX_TEXT = 140; // payload Live Activity maks 4 KB — teks dipotong biar aman
const clip = (s) => {
  const v = String(s ?? '');
  return v.length > MAX_TEXT ? `${v.slice(0, MAX_TEXT - 1)}…` : v;
};

const STALE_AFTER_SEC = 15 * 60; // kalau server mati, Live Activity ditandai "basi" setelah 15 menit
const ACTIVITY_MAX_MS = 8 * 3600_000; // iOS mengakhiri Live Activity setelah 8 jam

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

    this.pollTimer = null;
    this.lineTimer = null;
    this.pushTimer = null;
    this.polling = false;
    this.pollAgain = false;
    this.running = false;

    this.lastPush = null;
    this.lastError = null;
  }

  now() {
    return this.clock.now();
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

  applyPlayback(np, at, latencyMs) {
    const item = np?.item ?? null;
    if (!item) {
      // tidak ada lagu / iklan / podcast → anggap pause, posisi dibekukan
      const pos = this.positionAt(at);
      this.playing = false;
      this.anchor = { progressMs: pos, at };
      if (this.notPlayingSince === null) this.notPlayingSince = at;
      this.resync();
      return;
    }
    if (!this.track || this.track.id !== item.id) this.onTrackChange(item);
    this.playing = np.isPlaying;
    this.anchor = { progressMs: np.progressMs + (np.isPlaying ? latencyMs : 0), at };
    if (this.playing) this.notPlayingSince = null;
    else if (this.notPlayingSince === null) this.notPlayingSince = at;
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
    const base = {
      title: clip(t?.title ?? ''),
      artist: clip(t?.artist ?? ''),
      isPlaying: Boolean(t) && this.playing,
      hasLyrics: this.lyricState.status === 'synced',
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

  /** Auto-start (push-to-start) saat musik mulai, auto-end saat lama tidak ada musik. */
  async maintainActivity() {
    const now = this.now();
    let activity = this.store.get('activity');

    if (activity?.token && activity.registeredAtMs && now - activity.registeredAtMs > ACTIVITY_MAX_MS) {
      this.store.set({ activity: null });
      activity = null;
    }

    if (this.playing && this.track && !activity?.token) {
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

    if (
      activity?.token &&
      this.cfg.autoEndIdleMs > 0 &&
      !this.playing &&
      this.notPlayingSince !== null &&
      now - this.notPlayingSince >= this.cfg.autoEndIdleMs
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
          }
        : null,
      lyrics: this.lyricState.status,
      line: s.line,
      nextLine: s.nextLine,
      lastPush: this.lastPush,
      lastError: this.lastError,
    };
  }
}
