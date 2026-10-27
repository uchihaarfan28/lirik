const ACCOUNTS = 'https://accounts.spotify.com';
const API = 'https://api.spotify.com/v1';

export const SCOPES = ['user-read-currently-playing', 'user-read-playback-state'];

export class SpotifyError extends Error {
  constructor(message, status = 0, retryAfterSec = 0) {
    super(message);
    this.status = status;
    this.retryAfterSec = retryAfterSec;
  }
}

/** Pilih URL cover: width terdekat 300, fallback gambar terbesar. */
export function pickArtworkURL(images) {
  if (!Array.isArray(images) || images.length === 0) return '';
  const ranked = images
    .filter((im) => im && typeof im.url === 'string' && im.url)
    .map((im) => ({ url: im.url, w: Number(im.width) || 0 }));
  if (!ranked.length) return '';
  const withWidth = ranked.filter((im) => im.w > 0);
  if (!withWidth.length) return ranked[0].url;
  withWidth.sort((a, b) => Math.abs(a.w - 300) - Math.abs(b.w - 300) || b.w - a.w);
  return withWidth[0].url;
}

/** Ubah respons /me/player/currently-playing jadi bentuk yang dipakai engine. */
export function parseCurrentlyPlaying(json) {
  if (!json) return null;
  const base = {
    isPlaying: Boolean(json.is_playing),
    type: json.currently_playing_type ?? 'unknown',
    progressMs: Number(json.progress_ms ?? 0),
    item: null,
  };
  if (base.type !== 'track' || !json.item) return base;
  const it = json.item;
  const artists = (it.artists || []).map((a) => a.name).filter(Boolean);
  base.item = {
    id: it.id || it.uri || `${it.name}|${artists[0] ?? ''}`,
    title: it.name ?? '',
    artist: artists.join(', '),
    primaryArtist: artists[0] ?? '',
    album: it.album?.name ?? '',
    durationMs: Number(it.duration_ms ?? 0),
    artworkURL: pickArtworkURL(it.album?.images),
  };
  return base;
}

export function createSpotify({
  clientId,
  clientSecret,
  redirectUri,
  store,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  log = console,
}) {
  let access = null; // { token, expiresAt }
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  async function tokenRequest(params) {
    const res = await fetchImpl(`${ACCOUNTS}/api/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params).toString(),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new SpotifyError(
        `Token Spotify gagal: ${json.error_description || json.error || res.status}`,
        res.status,
      );
    }
    access = {
      token: json.access_token,
      expiresAt: now() + (json.expires_in ?? 3600) * 1000 - 60_000,
    };
    // Spotify kadang mengirim refresh token baru — selalu simpan yang terbaru.
    if (json.refresh_token) store.set({ refreshToken: json.refresh_token });
    return json;
  }

  async function getAccessToken(force = false) {
    if (!force && access && access.expiresAt > now()) return access.token;
    const refreshToken = store.get('refreshToken');
    if (!refreshToken) throw new SpotifyError('Spotify belum terhubung', 0);
    try {
      await tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
    } catch (e) {
      if (e.status === 400) {
        // invalid_grant: token dicabut / kedaluwarsa (Spotify membatasi umur 6 bulan) → harus login ulang
        log.warn?.('[spotify] refresh token tidak berlaku, silakan login ulang');
        store.set({ refreshToken: null });
        access = null;
      }
      throw e;
    }
    return access.token;
  }

  return {
    isConnected: () => Boolean(store.get('refreshToken')),

    /** Putuskan Spotify (hapus refresh token); device/Live Activity tetap. */
    logout() {
      access = null;
      store.set({ refreshToken: null });
    },

    authorizeUrl(state) {
      const p = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        scope: SCOPES.join(' '),
        redirect_uri: redirectUri,
        state,
      });
      return `${ACCOUNTS}/authorize?${p}`;
    },

    async exchangeCode(code) {
      await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
    },

    /** null = tidak ada yang diputar. */
    async getCurrentlyPlaying() {
      for (let attempt = 0; attempt < 2; attempt++) {
        const token = await getAccessToken(attempt > 0);
        const res = await fetchImpl(`${API}/me/player/currently-playing?additional_types=track`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401 && attempt === 0) continue; // token basi → refresh lalu ulangi
        if (res.status === 204) return null;
        if (res.status === 429) {
          const retry = Number(res.headers.get('retry-after')) || 5;
          throw new SpotifyError('Kena rate limit Spotify', 429, retry);
        }
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new SpotifyError(`Spotify ${res.status}: ${text.slice(0, 200)}`, res.status);
        }
        const text = await res.text();
        if (!text) return null;
        return parseCurrentlyPlaying(JSON.parse(text));
      }
      throw new SpotifyError('Token Spotify ditolak', 401);
    },
  };
}
