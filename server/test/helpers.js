// Jam & timer palsu supaya tes timing berjalan instan dan deterministik.
export class FakeClock {
  constructor(start = 1_700_000_000_000) {
    this.t = start;
    this.queue = [];
    this.seq = 0;
    this.now = () => this.t;
    this.timers = {
      setTimeout: (fn, ms) => {
        const id = ++this.seq;
        this.queue.push({ id, at: this.t + Math.max(0, ms), fn });
        return id;
      },
      clearTimeout: (id) => {
        this.queue = this.queue.filter((q) => q.id !== id);
      },
    };
  }

  async flush() {
    for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
  }

  /** Majukan waktu, jalankan timer yang jatuh tempo berurutan. */
  async advance(ms) {
    const target = this.t + ms;
    for (;;) {
      this.queue.sort((a, b) => a.at - b.at || a.id - b.id);
      const next = this.queue[0];
      if (!next || next.at > target) break;
      this.queue.shift();
      this.t = next.at;
      next.fn();
      await this.flush();
    }
    this.t = target;
    await this.flush();
  }
}

export const silentLog = { info() {}, warn() {}, error() {} };

export function engineConfig(over = {}) {
  return {
    pollMs: 3000,
    idlePollMs: 10000,
    leadMs: 0,
    minPushIntervalMs: 1000,
    autoEndIdleMs: 15 * 60_000,
    startCooldownMs: 60_000,
    attributesType: 'LyricsActivityAttributes',
    appName: 'Lirik Island',
    ...over,
  };
}

/** Spotify palsu: posisi lagu mengikuti jam palsu. */
export function fakeSpotify(clock, { track, startAt = clock.now(), offsetMs = 0 } = {}) {
  const s = {
    connected: true,
    playing: true,
    track,
    startAt,
    offsetMs,
    pausedAt: null,
    calls: 0,
    isConnected: () => s.connected,
    async getCurrentlyPlaying() {
      s.calls++;
      if (!s.track) return null;
      const progress = s.pausedAt !== null ? s.pausedAt : clock.now() - s.startAt + s.offsetMs;
      return { isPlaying: s.playing, type: 'track', progressMs: progress, item: s.track };
    },
    pause() {
      s.pausedAt = clock.now() - s.startAt + s.offsetMs;
      s.playing = false;
    },
  };
  return s;
}

export function fakeApns(result = { ok: true, status: 200 }) {
  const a = {
    sent: [],
    result,
    async send(token, aps, opts) {
      a.sent.push({ token, aps, opts });
      return typeof a.result === 'function' ? a.result(token, aps) : a.result;
    },
    lines: () => a.sent.filter((s) => s.aps.event === 'update').map((s) => s.aps['content-state'].line),
  };
  return a;
}
