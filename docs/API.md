# API & Kontrak Data

Ada dua kontrak yang **harus selalu sinkron** antara server dan iOS:

1. **HTTP API** — app iPhone ↔ server.
2. **Payload Live Activity** — server → APNs → widget (`content-state` & `attributes`).

Sumber kebenaran kontrak Live Activity: [`contract/live-activity.json`](../contract/live-activity.json). Tes `server/test/contract.test.js` gagal bila server atau Swift tidak cocok dengan file ini.

---

## 1. HTTP API

Base URL = `PUBLIC_URL`. Semua respons JSON kecuali halaman HTML login. Semua `/api/*` wajib header:

```
x-api-key: <API_KEY>
```

Error selalu berbentuk `{ "error": "pesan" }` dengan status 4xx/5xx. `401` = API key salah.

### `GET /health`
Tanpa auth. Untuk healthcheck Docker/Coolify.
```json
{ "ok": true }
```

### `POST /api/login-link`
Membuat link login Spotify sekali pakai (berlaku 10 menit).
```json
{ "url": "https://lirik.example.com/login?n=Y-4BG8zqp2Lia77gqo8elOcM", "expiresInSec": 600 }
```

### `GET /login?n=<nonce>` (browser, tanpa auth)
Nonce valid → `302` ke `accounts.spotify.com/authorize`. Nonce kedaluwarsa/terpakai → `403` HTML.

### `GET /callback?code=…&state=…` (dipanggil Spotify)
Tukar kode → simpan refresh token → `200` HTML "Spotify terhubung ✓". `state` sekali pakai. `?error=` → `400`. Gagal tukar → `502`.

### `POST /api/push-to-start-token`
Dikirim app setiap iOS memberi push-to-start token baru.
```json
// request
{ "token": "80f0…(hex)" }
// response
{ "ok": true }
```

### `POST /api/activity-token`
Dikirim app setiap Live Activity mendapat token update (baik dimulai dari app maupun lewat push-to-start).
```json
// request
{ "token": "a1b2…(hex)", "activityId": "6F2C…" }
// response
{ "ok": true }
```
Efek: token disimpan, engine langsung mengirim baris aktif.

### `POST /api/activity-ended`
Dikirim app saat Live Activity `.ended` / `.dismissed`.
```json
{ "activityId": "6F2C…" }
```

### `GET /api/status`
```json
{
  "spotifyConnected": true,
  "pushToStartRegistered": true,
  "activityRegistered": true,
  "nowPlaying": {
    "title": "Judul Lagu",
    "artist": "Artis A, Artis B",
    "isPlaying": true,
    "positionMs": 63210,
    "durationMs": 214000,
    "trackId": "spotifyTrackId",
    "album": "Nama Album",
    "artworkURL": "https://i.scdn.co/image/…"
  },
  "lyrics": "synced",
  "line": "Baris yang sedang dinyanyikan",
  "nextLine": "Baris berikutnya",
  "lastPush": {
    "at": "2026-10-27T04:33:45.000Z",
    "event": "update",
    "ok": true,
    "status": 200,
    "reason": null,
    "line": "Baris yang sedang dinyanyikan"
  },
  "lastError": null,
  "preferences": {
    "hideAfterPauseSec": 900,
    "autoStart": true,
    "pauseMode": "hide"
  }
}
```
- `nowPlaying` = `null` bila belum ada lagu. `artworkURL` hanya di status (bukan di content-state).
- `lyrics` ∈ `idle | loading | synced | plain | instrumental | none | error`.
- `lastPush` = `null` sebelum push pertama. `lastError` = string atau `null`.
- `preferences` — lihat `POST /api/preferences`.

Model Swift: `ServerStatus` di `ios/LirikIsland/ServerClient.swift`. Field non-opsional di Swift wajib selalu ada di respons (dicek tes kontrak).

### `POST /api/device-token`
Token remote notification app (untuk silent push artwork, best-effort).
```json
// request
{ "token": "a1b2…(hex)" }
// response
{ "ok": true }
```
Token mati (410 / BadDeviceToken) hanya menghapus `deviceToken`, bukan token Live Activity.

### `POST /api/preferences`
Merge parsial preferensi siklus hidup (disimpan di `store.prefs`).
```json
// request (semua field opsional)
{ "hideAfterPauseSec": 60, "autoStart": false, "pauseMode": "dim" }
// response
{ "preferences": { "hideAfterPauseSec": 60, "autoStart": false, "pauseMode": "dim" } }
```
| Field | Nilai sah | Perilaku |
|---|---|---|
| `hideAfterPauseSec` | `0`, `60`, `300`, `900`, `-1` | `0` → grace efektif **20 s**; `-1` → tidak pernah auto-end |
| `autoStart` | boolean | `false` → tidak kirim event `start` (manual dari app tetap boleh) |
| `pauseMode` | `dim` \| `hide` | `dim` → jangan `endActivity` karena idle; `hide` → end setelah ambang |
Nilai lain → `400`. Default: dari `AUTO_END_IDLE_MIN` → `hideAfterPauseSec`, `autoStart=true`, `pauseMode=hide`.

### `POST /api/test-push`
Mengirim update "Tes dari server ✓" ke Live Activity terdaftar.
- `200 { "ok": true }`
- `502 { "error": "Push gagal: 400 BadDeviceToken" }` / `{ "error": "Push gagal: 0 Belum ada Live Activity yang terdaftar di server" }`

---

## 2. Payload Live Activity (APNs)

### Header HTTP/2 ke APNs

| Header | Nilai |
|---|---|
| `:path` | `/3/device/<token hex>` |
| `authorization` | `bearer <JWT ES256>` (iss = Team ID, kid = Key ID, diperbarui tiap 50 menit) |
| `apns-topic` | `<APNS_BUNDLE_ID>.push-type.liveactivity` |
| `apns-push-type` | `liveactivity` |
| `apns-priority` | `10` |

Host: `api.sandbox.push.apple.com` (development) / `api.push.apple.com` (production).

### `content-state` (berubah tiap baris)

| Key | Tipe | Keterangan |
|---|---|---|
| `title` | string | Judul lagu, maks. 140 karakter, `""` bila tidak ada |
| `artist` | string | Artis dipisah koma, maks. 140 |
| `line` | string | Baris aktif atau pesan status (lihat DESIGN §4.3), maks. 140 |
| `nextLine` | string | Baris non-kosong berikutnya, `""` bila tidak ada |
| `isPlaying` | bool | `false` saat jeda / tidak ada lagu |
| `hasLyrics` | bool | `true` hanya bila lirik tersinkron |
| `trackId` | string | ID lagu (kunci file cover di App Group); `""` bila tidak ada |
| `durationMs` | number (Int) | Durasi lagu ms; `0` bila tidak ada |
| `playbackStartSec` | number (Int) | Unix detik saat posisi = 0; untuk `ProgressView(timerInterval:)`; `0` bila tidak ada |

**Tidak** ada `artworkURL` / `elapsedMs` di content-state (payload < 4 KB; progress memakai timer sistem).

Swift: `LyricsActivityAttributes.ContentState`. Decoder Swift toleran (key hilang → nilai default), tapi server **wajib** mengirim semua key.

### `attributes` (statis, hanya di event `start`)

| Key | Tipe |
|---|---|
| `appName` | string |

`attributes-type` = `"LyricsActivityAttributes"` — harus sama persis dengan nama struct Swift.

### Contoh `update`
```json
{
  "aps": {
    "timestamp": 1793075626,
    "event": "update",
    "content-state": {
      "title": "Judul Lagu",
      "artist": "Artis",
      "line": "Baris yang sedang dinyanyikan",
      "nextLine": "Baris berikutnya",
      "isPlaying": true,
      "hasLyrics": true,
      "trackId": "abc123",
      "durationMs": 214000,
      "playbackStartSec": 1793075000
    },
    "stale-date": 1793076526
  }
}
```

### Contoh `start` (push-to-start)
```json
{
  "aps": {
    "timestamp": 1793075700,
    "event": "start",
    "attributes-type": "LyricsActivityAttributes",
    "attributes": { "appName": "Lirik Island" },
    "content-state": {
      "title": "Judul Lagu", "artist": "Artis", "line": "Memuat lirik…", "nextLine": "",
      "isPlaying": true, "hasLyrics": false,
      "trackId": "abc123", "durationMs": 214000, "playbackStartSec": 1793075000
    },
    "alert": { "title": "Judul Lagu", "body": "Artis" },
    "input-push-token": 1,
    "stale-date": 1793076600
  }
}
```

### Contoh `end`
```json
{
  "aps": {
    "timestamp": 1793079000,
    "event": "end",
    "content-state": {
      "title": "Judul Lagu", "artist": "Artis", "line": "…", "nextLine": "",
      "isPlaying": false, "hasLyrics": true,
      "trackId": "abc123", "durationMs": 214000, "playbackStartSec": 1793075000
    },
    "dismissal-date": 1793079000
  }
}
```

### Silent push artwork (best-effort)
Bukan Live Activity. Hanya dikirim bila `deviceToken` + activity terdaftar + cover/`trackId` berubah.
| Header | Nilai |
|---|---|
| `apns-push-type` | `background` |
| `apns-topic` | `<APNS_BUNDLE_ID>` (tanpa `.push-type.liveactivity`) |
| `apns-priority` | `5` |

```json
{
  "aps": { "content-available": 1 },
  "artwork": { "trackId": "abc123", "url": "https://i.scdn.co/image/…" }
}
```
Tanpa alert/sound/badge. Path utama cover: app prefetch dari `/api/status` saat foreground.

### Aturan
- `timestamp` wajib naik terus per activity (server menjamin ini).
- Payload total < 4 KB.
- Respons APNs `410` atau `400 BadDeviceToken` → token terkait dihapus (`activity` atau `deviceToken`).

---

## 3. Mengubah kontrak — checklist

Saat menambah/mengubah field `content-state`:

1. Ubah `contract/live-activity.json`.
2. Ubah `buildState()` di `server/src/engine.js` (semua cabang).
3. Ubah `LyricsActivityAttributes.ContentState` + decoder toleran di `ios/Shared/LyricsActivityAttributes.swift` (dan `.waiting`, preview).
4. Pakai di `ios/LirikIslandWidget/LyricsLiveActivity.swift`.
5. Perbarui tabel di dokumen ini.
6. `cd server && npm test` — tes kontrak harus lulus.

Ingat: Live Activity yang sedang berjalan di HP memakai versi struct lama sampai app di-update; field baru harus punya default di decoder.
