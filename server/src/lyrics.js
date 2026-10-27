const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const LEADING_TAGS = /^(\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]\s*)+/;
const WORD_TAG = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g;

function tagToMs(m) {
  const min = Number(m[1]);
  const sec = Number(m[2]);
  let frac = 0;
  if (m[3] !== undefined) {
    const f = m[3];
    frac = f.length === 1 ? Number(f) * 100 : f.length === 2 ? Number(f) * 10 : Number(f);
  }
  return (min * 60 + sec) * 1000 + frac;
}

/**
 * Parse lirik format LRC → [{ t: milidetik, text }], urut waktu.
 * Mendukung beberapa timestamp per baris, tag [offset:], dan tag per kata (enhanced LRC).
 */
export function parseLrc(text) {
  if (!text) return [];
  let offset = 0;
  const out = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const off = line.match(/^\[offset:\s*([+-]?\d+)\s*\]$/i);
    if (off) {
      offset = Number(off[1]);
      continue;
    }
    const lead = line.match(LEADING_TAGS);
    if (!lead) continue; // metadata seperti [ar:], [ti:]
    const body = line
      .slice(lead[0].length)
      .replace(WORD_TAG, '')
      .replace(/\s+/g, ' ')
      .trim();
    for (const m of lead[0].matchAll(TIME_TAG)) out.push({ t: tagToMs(m), text: body });
  }
  // offset positif = lirik tampil lebih awal
  for (const l of out) l.t = Math.max(0, l.t - offset);
  out.sort((a, b) => a.t - b.t);
  return out;
}

/** Index baris terakhir dengan t <= posMs, atau -1 bila belum ada. */
export function indexAt(lines, posMs) {
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].t <= posMs) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/** Buang embel-embel "(feat. X)", "- Remastered 2011", dll untuk pencarian cadangan. */
export function cleanTitle(title) {
  return String(title ?? '')
    .replace(/\s*[([][^)\]]*\b(feat\.?|ft\.?|with|remaster(ed)?|live|version|edit|mono|stereo|radio|bonus|deluxe)\b[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+.*\b(remaster(ed)?|live|version|edit|mono|stereo|radio|mix|single)\b.*$/i, '')
    .trim();
}

/** Pilih hasil pencarian LRCLIB terbaik: durasi cocok (±3 dtk), utamakan yang tersinkron. */
export function pickBest(results, durationSec) {
  const ok = (results || []).filter(
    (r) => !durationSec || !r.duration || Math.abs(r.duration - durationSec) <= 3,
  );
  const rank = (r) => (r.syncedLyrics ? 0 : r.instrumental ? 1 : r.plainLyrics ? 2 : 3);
  const diff = (r) => (durationSec && r.duration ? Math.abs(r.duration - durationSec) : 0);
  ok.sort((a, b) => rank(a) * 100 + diff(a) - (rank(b) * 100 + diff(b)));
  return ok[0] ?? null;
}

function toResult(rec, source) {
  if (!rec) return null;
  if (rec.instrumental) return { status: 'instrumental', lines: [], source };
  const lines = parseLrc(rec.syncedLyrics);
  if (lines.length) return { status: 'synced', lines, source };
  if (rec.plainLyrics) return { status: 'plain', lines: [], source };
  return null;
}

/**
 * Sumber lirik: LRCLIB (gratis, komunitas, format LRC).
 * Hasil: { status: 'synced'|'plain'|'instrumental'|'none'|'error', lines }
 */
export function createLyricsProvider({
  fetchImpl = globalThis.fetch,
  baseUrl = 'https://lrclib.net',
  userAgent = 'LirikIsland/0.1',
  log = console,
  cacheSize = 300,
} = {}) {
  const cache = new Map();

  async function getJson(pathname, params) {
    const url = `${baseUrl}${pathname}?${new URLSearchParams(params)}`;
    const res = await fetchImpl(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`LRCLIB ${res.status}`);
    return res.json();
  }

  async function lookup(track) {
    const durationSec = Math.round((track.durationMs || 0) / 1000);
    const artist = track.primaryArtist || track.artist;
    try {
      const exact = await getJson('/api/get', {
        track_name: track.title,
        artist_name: artist,
        album_name: track.album || '',
        duration: String(durationSec),
      });
      const first = toResult(exact, 'lrclib:get');
      if (first && first.status !== 'plain') return first;

      const results = await getJson('/api/search', { track_name: cleanTitle(track.title), artist_name: artist });
      const second = toResult(pickBest(results, durationSec), 'lrclib:search');
      if (second && second.status !== 'plain') return second;
      return first || second || { status: 'none', lines: [], source: 'lrclib' };
    } catch (e) {
      log.warn?.(`[lyrics] gagal mengambil lirik "${track.title}": ${e.message}`);
      return { status: 'error', lines: [], error: e.message };
    }
  }

  return {
    async getLyrics(track) {
      const key = track.id;
      if (cache.has(key)) return cache.get(key);
      const result = await lookup(track);
      if (result.status !== 'error') {
        cache.set(key, result);
        if (cache.size > cacheSize) cache.delete(cache.keys().next().value);
      }
      return result;
    },
  };
}
