// Simulasi tanpa Spotify & tanpa iPhone: lagu demo diputar, server "mengirim" push per baris ke log.
// Pakai: npm run simulate
import { LyricsEngine } from './engine.js';
import { parseLrc } from './lyrics.js';
import { Store } from './store.js';

const DEMO_LRC = `
[00:01.00]Lampu kota berbaris di kaca depan
[00:04.20]Jalan tol sepi, radio pelan
[00:07.50]Lirik ini muncul tepat waktunya
[00:10.80]Di pulau kecil atas layar kaca
[00:14.00]
[00:16.00]Belok kiri, satu baris lagi
[00:19.30]CarPlay menyala sampai pagi
[00:22.60]Selesai — lagu demo berakhir di sini
`;

const startedAt = Date.now();
const DURATION = 26_000;

const spotify = {
  isConnected: () => true,
  async getCurrentlyPlaying() {
    const progress = Date.now() - startedAt;
    if (progress > DURATION) return null;
    return {
      isPlaying: true,
      type: 'track',
      progressMs: progress,
      item: {
        id: 'demo-track-1',
        title: 'Lagu Demo',
        artist: 'Lirik Island',
        primaryArtist: 'Lirik Island',
        album: 'Pulau Demo',
        durationMs: DURATION,
        artworkURL: 'https://example.com/demo-cover.jpg',
      },
    };
  },
};

const lyrics = { getLyrics: async () => ({ status: 'synced', lines: parseLrc(DEMO_LRC) }) };

const t0 = Date.now();
const apns = {
  async send(token, aps, opts = {}) {
    if (opts.pushType === 'background') {
      const sec = ((Date.now() - t0) / 1000).toFixed(1).padStart(5);
      console.log(`[${sec}s] artwork │ ${opts.extra?.artwork?.trackId ?? '?'}`);
      return { ok: true, status: 200 };
    }
    const s = aps['content-state'];
    const sec = ((Date.now() - t0) / 1000).toFixed(1).padStart(5);
    console.log(`[${sec}s] ${aps.event.padEnd(6)} │ ${s.line}${s.nextLine ? `   (berikut: ${s.nextLine})` : ''}`);
    return { ok: true, status: 200 };
  },
};

const store = new Store(null);
store.set({
  devices: [
    {
      deviceId: 'sim',
      activityToken: 'a'.repeat(64),
      activityId: 'sim',
      deviceToken: 'b'.repeat(64),
      pushToStartToken: null,
      registeredAtMs: Date.now(),
      lastSeenAt: Date.now(),
    },
  ],
});

const engine = new LyricsEngine({
  spotify,
  lyrics,
  apns,
  store,
  config: {
    pollMs: 3000,
    idlePollMs: 2000,
    leadMs: 400,
    minPushIntervalMs: 1000,
    autoEndIdleMs: 3000,
    startCooldownMs: 60_000,
    attributesType: 'LyricsActivityAttributes',
    appName: 'Lirik Island',
  },
  log: { info: () => {}, warn: console.warn, error: console.error },
});

console.log('Simulasi Live Activity (push hanya dicetak, ±32 detik)…\n');
engine.start();
setTimeout(() => {
  engine.stop();
  console.log('\nSelesai.');
}, DURATION + 6500);
