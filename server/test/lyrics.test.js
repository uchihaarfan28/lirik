import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanTitle, createLyricsProvider, indexAt, parseLrc, pickBest } from '../src/lyrics.js';

test('parseLrc: format dasar, metadata diabaikan, urut waktu', () => {
  const lines = parseLrc(`[ar:Penyanyi]\n[ti:Judul]\n[00:12.50]Baris dua\n[00:01.00]Baris satu\n[01:02.345]Baris tiga`);
  assert.deepEqual(lines, [
    { t: 1000, text: 'Baris satu' },
    { t: 12500, text: 'Baris dua' },
    { t: 62345, text: 'Baris tiga' },
  ]);
});

test('parseLrc: banyak timestamp per baris & baris kosong (jeda instrumental)', () => {
  const lines = parseLrc('[00:05.00][00:20.00]Reff\n[00:10]\n');
  assert.deepEqual(lines, [
    { t: 5000, text: 'Reff' },
    { t: 10000, text: '' },
    { t: 20000, text: 'Reff' },
  ]);
});

test('parseLrc: tag offset dan tag per kata', () => {
  const lines = parseLrc('[offset:+500]\n[00:02.00]<00:02.00>Halo <00:02.50>dunia');
  assert.deepEqual(lines, [{ t: 1500, text: 'Halo dunia' }]);
});

test('parseLrc: pecahan 1 digit = persepuluhan detik', () => {
  assert.equal(parseLrc('[00:01.5]x')[0].t, 1500);
});

test('indexAt: pencarian baris aktif', () => {
  const lines = [{ t: 1000 }, { t: 2000 }, { t: 3000 }];
  assert.equal(indexAt(lines, 0), -1);
  assert.equal(indexAt(lines, 1000), 0);
  assert.equal(indexAt(lines, 2999), 1);
  assert.equal(indexAt(lines, 99999), 2);
  assert.equal(indexAt([], 5), -1);
});

test('cleanTitle membuang embel-embel', () => {
  assert.equal(cleanTitle('Lagu (feat. Seseorang)'), 'Lagu');
  assert.equal(cleanTitle('Lagu - Remastered 2011'), 'Lagu');
  assert.equal(cleanTitle('Lagu - Live at Senayan'), 'Lagu');
  assert.equal(cleanTitle('Hujan (Bagian 2)'), 'Hujan (Bagian 2)');
});

test('pickBest: durasi cocok & utamakan tersinkron', () => {
  const best = pickBest(
    [
      { id: 1, duration: 200, plainLyrics: 'x' },
      { id: 2, duration: 260, syncedLyrics: '[00:01]a' },
      { id: 3, duration: 201, syncedLyrics: '[00:01]a' },
    ],
    200,
  );
  assert.equal(best.id, 3);
});

function mockFetch(routes) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    const u = new URL(url);
    const r = routes[u.pathname];
    const { status, body } = typeof r === 'function' ? r(u) : r;
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  fn.calls = calls;
  return fn;
}

const track = { id: 't1', title: 'Lagu (feat. X)', artist: 'A, B', primaryArtist: 'A', album: 'Album', durationMs: 200_400 };

test('provider: /api/get langsung ketemu', async () => {
  const fetchImpl = mockFetch({ '/api/get': { status: 200, body: { syncedLyrics: '[00:01.00]satu\n[00:02.00]dua' } } });
  const p = createLyricsProvider({ fetchImpl, userAgent: 'test' });
  const r = await p.getLyrics(track);
  assert.equal(r.status, 'synced');
  assert.equal(r.lines.length, 2);
  const u = new URL(fetchImpl.calls[0].url);
  assert.equal(u.searchParams.get('artist_name'), 'A');
  assert.equal(u.searchParams.get('duration'), '200');
  assert.equal(fetchImpl.calls[0].opts.headers['User-Agent'], 'test');
  await p.getLyrics(track);
  assert.equal(fetchImpl.calls.length, 1, 'hasil kedua dari cache');
});

test('provider: 404 → fallback /api/search dengan judul bersih', async () => {
  const fetchImpl = mockFetch({
    '/api/get': { status: 404, body: {} },
    '/api/search': (u) => {
      assert.equal(u.searchParams.get('track_name'), 'Lagu');
      return { status: 200, body: [{ duration: 200, syncedLyrics: '[00:03.00]tiga' }] };
    },
  });
  const r = await createLyricsProvider({ fetchImpl }).getLyrics(track);
  assert.equal(r.status, 'synced');
  assert.equal(r.source, 'lrclib:search');
});

test('provider: instrumental, tidak ada, dan error', async () => {
  const inst = createLyricsProvider({ fetchImpl: mockFetch({ '/api/get': { status: 200, body: { instrumental: true } } }) });
  assert.equal((await inst.getLyrics(track)).status, 'instrumental');

  const none = createLyricsProvider({
    fetchImpl: mockFetch({ '/api/get': { status: 404, body: {} }, '/api/search': { status: 200, body: [] } }),
  });
  assert.equal((await none.getLyrics(track)).status, 'none');

  const err = createLyricsProvider({ fetchImpl: mockFetch({ '/api/get': { status: 500, body: {} } }), log: { warn() {} } });
  assert.equal((await err.getLyrics(track)).status, 'error');
});

test('provider: hanya plain → tetap dicari versi tersinkron, kalau tidak ada pakai plain', async () => {
  const p = createLyricsProvider({
    fetchImpl: mockFetch({
      '/api/get': { status: 200, body: { plainLyrics: 'teks' } },
      '/api/search': { status: 200, body: [] },
    }),
  });
  assert.equal((await p.getLyrics(track)).status, 'plain');
});
