# Lirik Island

Putar lagu di **Spotify** → baris lirik yang sedang dinyanyikan muncul di **Dynamic Island**, **Lock Screen**, dan **CarPlay Dashboard**, berganti otomatis mengikuti lagu.

```
 Spotify (app apa saja)                 Server (VPS / laptop)                         iPhone
 ─────────────────────                  ─────────────────────                         ──────
 lagu diputar ──► Spotify Web API ◄──── polling tiap 3 dtk: judul + posisi
                                         │
                                         ├─ ambil lirik LRC (LRCLIB) per lagu
                                         ├─ timer tepat di pergantian baris
                                         └─ push APNs (Live Activity) ───────────►  Dynamic Island
                                                                                    Lock Screen
                                                                                    CarPlay Dashboard (iOS 26)
```

iPhone tidak bisa membaca app Spotify secara langsung, jadi server kecil yang bertugas: ia tahu lagu dan posisinya lewat Spotify Web API, lalu mengirim setiap baris ke Live Activity lewat push. App iPhone tidak perlu tetap terbuka.

**Dokumen pengembangan:** [PRD](docs/PRD.md) · [Desain teknis](docs/DESIGN.md) · [Kontrak API](docs/API.md) · [Desain UI](docs/UI-DESIGN.md) · [Keputusan (ADR)](docs/DECISIONS.md) · [Roadmap](docs/ROADMAP.md) · [Testing](docs/TESTING.md)

**Mengembangkan dengan Claude Code:** buka folder ini dengan `claude`. Claude Code otomatis membaca [`CLAUDE.md`](CLAUDE.md). Perintah yang tersedia:

| Perintah | Fungsi |
|---|---|
| `/next-task` | Ambil tugas berikutnya dari roadmap (atau `/next-task T-104`), kerjakan, tes, perbarui log |
| `/verify` | Jalankan semua tes + simulasi, laporkan hasil |
| `/ios-build` | Generate project Xcode & build (di Mac) |
| `/contract-change` | Ubah payload Live Activity dengan aman di server + iOS |

---

## Yang dibutuhkan

| | Keterangan |
|---|---|
| Mac + Xcode 26 | untuk build app ke iPhone |
| iPhone iOS 18+ | Dynamic Island butuh iPhone 14 Pro ke atas. **Tampil di CarPlay butuh iOS 26** |
| Apple Developer Program (berbayar, $99/th) | push notification **tidak bisa** pakai akun gratis |
| Spotify Premium | syarat Spotify untuk app developer mode |
| Server dengan HTTPS | VPS (mis. Coolify) — atau laptop untuk tes awal |

---

## Langkah 1 — Buat app di Spotify

1. Buka https://developer.spotify.com/dashboard → **Create app**.
2. **Redirect URI**: isi `PUBLIC_URL` + `/callback`, persis sama:
   - VPS: `https://lirik.domainanda.com/callback`
   - Tes lokal: `http://127.0.0.1:8888/callback` (Spotify hanya mengizinkan HTTP untuk alamat loopback)
3. Centang **Web API**, simpan.
4. **Settings → User Management**: tambahkan email akun Spotify Anda (developer mode hanya untuk user yang didaftarkan, maks. 5).
5. Catat **Client ID** dan **Client Secret**.

## Langkah 2 — Buat kunci APNs di Apple

1. https://developer.apple.com/account/resources/authkeys → **+** → centang **Apple Push Notifications service (APNs)** → download `AuthKey_XXXXXXXXXX.p8` (hanya bisa diunduh sekali).
2. Catat **Key ID** (10 karakter) dan **Team ID** (pojok kanan atas halaman Membership).

## Langkah 3 — Jalankan server

```bash
cd server
cp .env.example .env      # isi semua nilai
npm run simulate          # (opsional) lihat cara kerjanya tanpa Spotify/iPhone
npm test                  # (opsional) 50 tes
npm run dev               # jalankan server
```

Isi `.env` yang penting:

| Variabel | Isi |
|---|---|
| `PUBLIC_URL` | URL server, mis. `https://lirik.domainanda.com` |
| `API_KEY` | string acak ≥ 16 karakter: `openssl rand -hex 24` |
| `SPOTIFY_CLIENT_ID` / `SECRET` | dari Langkah 1 |
| `APNS_TEAM_ID` / `APNS_KEY_ID` | dari Langkah 2 |
| `APNS_KEY_PATH` atau `APNS_KEY_BASE64` | file `.p8`, atau isinya: `base64 -i AuthKey_XXX.p8` |
| `APNS_BUNDLE_ID` | bundle ID app iPhone (Langkah 4), mis. `com.rofiq.lirikisland` |
| `APNS_ENV` | `development` saat install dari Xcode, `production` untuk TestFlight |

Tidak ada dependency npm — cukup Node 20.6+.

**Deploy ke Coolify (monorepo):** buat resource dari **root repo** (Dockerfile di root), Base Directory `/`, port `8888`, domain HTTPS. Masukkan semua isi `server/.env` sebagai Environment Variables (pakai `APNS_KEY_BASE64`, set `DATA_DIR=/data`), dan tambahkan **persistent storage** di `/data` supaya token tidak hilang saat redeploy. Bisa juga pakai `docker-compose.yml` di root.

**Hubungkan Spotify** (sekali saja):

```bash
npm run login      # mencetak link login sekali pakai → buka di browser → login Spotify
```

Bisa juga dari app iPhone (tombol *Hubungkan akun Spotify*) — asalkan server sudah HTTPS.

## Langkah 4 — Build app iPhone

Cara cepat dengan XcodeGen:

```bash
brew install xcodegen
cd ios
# edit project.yml: ganti com.example.lirikisland dengan bundle ID Anda, isi DEVELOPMENT_TEAM
xcodegen generate
open LirikIsland.xcodeproj
```

<details>
<summary>Atau buat project manual di Xcode</summary>

1. File → New → Project → **App** (SwiftUI), nama `LirikIsland`, minimum iOS 18.
2. File → New → Target → **Widget Extension**, nama `LirikIslandWidget`, centang *Include Live Activity*. Hapus file contoh yang dibuat Xcode.
3. Seret isi folder `ios/LirikIsland` ke target app, `ios/LirikIslandWidget` ke target widget, dan `ios/Shared/LyricsActivityAttributes.swift` ke **kedua** target (centang keduanya di File Inspector).
4. Target app → Info: tambahkan `Supports Live Activities = YES` dan `Supports Live Activities Frequent Updates = YES`.
5. Target app → Signing & Capabilities: **+ Push Notifications**, **+ Background Modes → Remote notifications**.
6. Kalau muncul error concurrency, set *Swift Language Version* = Swift 5 di Build Settings.
</details>

Lalu:

1. Pilih **Team** di Signing kedua target, sambungkan iPhone, **Run**.
2. Di app: isi **URL server** dan **API key** (sama dengan `.env`).
3. Pastikan *Akun terhubung* ✓ (kalau belum, tekan *Hubungkan akun Spotify*).
4. Tekan **Tampilkan lirik di Dynamic Island**, lalu **Kirim tes push** → harus muncul "Tes dari server ✓".
5. Buka Spotify, putar lagu. Kunci layar atau sambungkan CarPlay.

**Di CarPlay (iOS 26):** Live Activity otomatis muncul sebagai tile di Dashboard (layar kedua CarPlay) selama aktif. Pengaturan tampilan CarPlay ada di iPhone: Settings › General › CarPlay.

**Auto-start:** setelah app pernah dibuka sekali, server menyimpan token *push-to-start*. Saat Spotify mulai diputar dan belum ada Live Activity, server memulainya sendiri — Anda tidak perlu membuka app. Fitur ini bergantung pada iOS dan kadang tidak mengirim token update; kalau lirik tidak bergerak setelah auto-start, buka app sekali atau tekan tombol mulai.

---

## Penyetelan

| Gejala | Yang diubah di `.env` |
|---|---|
| Lirik muncul telat | naikkan `LEAD_MS` (mis. 700) |
| Lirik muncul kecepatan | turunkan `LEAD_MS` (mis. 200) |
| Live Activity hilang sendiri saat berhenti di rest area | naikkan `AUTO_END_IDLE_MIN`, atau `0` untuk tidak pernah |
| Kena rate limit Spotify | naikkan `POLL_MS` (mis. 5000) |

## Batasan yang perlu diketahui

- **Delay ±0,5–1 detik** wajar: posisi lagu dibaca lewat polling dan baris dikirim lewat push Apple.
- **Jatah update dari iOS.** Push Live Activity dibatasi sistem. Aktifkan *More Frequent Updates* (Settings › Lirik Island › Live Activities). Kalau sangat sering, iOS bisa menahan sebagian update sementara.
- **Maksimal 8 jam** per Live Activity (aturan iOS), setelah itu dimulai ulang otomatis (auto-start) atau lewat app.
- **Kalau Live Activity Anda tutup manual** (geser) saat app tidak berjalan, server belum tentu tahu dan tidak akan auto-start lagi sampai jeda `AUTO_END_IDLE_MIN`. Buka app sekali atau tekan tombol mulai.
- **Dynamic Island compact** sangat sempit — baris panjang terpotong. Baris lengkap terlihat saat Island ditekan lama (expanded), di Lock Screen, dan di CarPlay.
- **Spotify developer mode:** maks. 5 user terdaftar, pemilik app wajib Premium, refresh token berumur 6 bulan (login ulang dengan `npm run login`). App untuk publik butuh *extended quota* yang kini hanya untuk organisasi besar.
- **Lirik** diambil dari LRCLIB (komunitas). Tidak semua lagu ada versi tersinkron; lirik berhak cipta, jadi gunakan untuk pribadi. Untuk dijual, perlu lisensi (mis. Musixmatch/LyricFind).
- **Keselamatan berkendara:** tampilan CarPlay sengaja hanya satu baris besar. Jangan membaca lirik sambil menyetir di situasi yang butuh fokus.

## Troubleshooting

| Pesan / gejala | Penyebab & solusi |
|---|---|
| Push gagal `400 BadDeviceToken` | `APNS_ENV` tidak cocok. Install dari Xcode = `development`, TestFlight = `production`. Setelah diubah, mulai ulang Live Activity dari app |
| `400 DeviceTokenNotForTopic` / `TopicDisallowed` | `APNS_BUNDLE_ID` beda dengan bundle ID app (pakai bundle app utama, bukan `.widget`) |
| `403 InvalidProviderToken` | Team ID / Key ID / file `.p8` salah, atau jam server tidak sinkron |
| Spotify `403` | email Anda belum ditambahkan di User Management, atau akun bukan Premium |
| "Spotify belum terhubung" | jalankan `npm run login` |
| "Lirik tidak ditemukan" | lagu belum ada di LRCLIB |
| Tes push OK tapi lirik diam | cek "Catatan server" di app; pastikan lagu benar-benar diputar di akun Spotify yang sama |

## Struktur

```
Dockerfile               image server (Coolify monorepo, build dari root)
docker-compose.yml       opsi deploy Coolify / lokal dengan volume /data
CLAUDE.md                panduan untuk Claude Code (+ server/CLAUDE.md, ios/CLAUDE.md)
.claude/                 perintah /next-task, /verify, /ios-build, /contract-change
docs/                    PRD, desain, kontrak API, UI, ADR, roadmap, testing
contract/                live-activity.json — kontrak payload server ↔ iOS (dicek tes)
server/                  Node.js (tanpa dependency)
  src/engine.js          inti: polling Spotify, sinkron baris, jadwal push
  src/spotify.js         OAuth + currently-playing
  src/lyrics.js          LRCLIB + parser LRC
  src/apns.js            push Live Activity (HTTP/2 + JWT ES256)
  src/app.js             HTTP API untuk app iPhone
  test/                  50 tes (npm test)
ios/
  Shared/                LyricsActivityAttributes (app + widget)
  LirikIsland/           app SwiftUI: pengaturan, mulai/stop, kirim token
  LirikIslandWidget/     tampilan Dynamic Island, Lock Screen, CarPlay
  project.yml            spesifikasi XcodeGen
```
