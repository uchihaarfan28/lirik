# DECISIONS — Catatan Keputusan Arsitektur (ADR)

Format: konteks → keputusan → konsekuensi. Tambahkan ADR baru di bawah, jangan mengubah yang lama (tandai "Digantikan oleh ADR-xxx" bila berubah).

---

## ADR-001 — Server + push APNs, bukan app yang polling sendiri

**Status:** Diterima (Fase 0)

**Konteks.** iOS tidak menyediakan API publik untuk membaca lagu dari app lain (framework MediaRemote bersifat private dan ditolak App Store). App kita juga disuspend iOS dalam hitungan detik di background bila tidak memutar/merekam audio, sehingga tidak bisa meng-update Live Activity sendiri setiap baris.

**Keputusan.** Server membaca Spotify Web API dan mengirim setiap baris sebagai push Live Activity lewat APNs.

**Konsekuensi.**
- (+) App tidak perlu terbuka; bekerja di Lock Screen dan CarPlay.
- (−) Butuh server, akun Apple Developer berbayar, kunci APNs.
- (−) Delay ±0,5–1 dtk; jatah push dibatasi iOS.

## ADR-002 — Spotify Web API sebagai sumber pertama

**Status:** Diterima (Fase 0)

**Konteks.** Pengguna utama memakai Spotify. Alternatif: Spotify iOS SDK (App Remote) — butuh app tetap hidup; Last.fm — tanpa posisi detik; API internal web player — melanggar ToS.

**Keputusan.** `GET /me/player/currently-playing` dengan scope `user-read-currently-playing user-read-playback-state`, polling 3 dtk.

**Konsekuensi.**
- (+) Posisi detik akurat, deteksi pause/seek.
- (−) Development Mode: Premium wajib, maks. 5 user, refresh token 6 bulan. Tidak bisa disebar publik.

## ADR-003 — LRCLIB sebagai sumber lirik

**Status:** Diterima (Fase 0), ditinjau ulang di Fase 4

**Konteks.** Spotify dan Apple tidak membuka lirik lewat API. Musixmatch/LyricFind berlisensi dan berbayar.

**Keputusan.** LRCLIB (`/api/get`, cadangan `/api/search`), dengan `User-Agent` yang mengidentifikasi app.

**Konsekuensi.**
- (+) Gratis, format LRC tersinkron, tanpa API key.
- (−) Cakupan tidak lengkap; lirik berhak cipta → hanya untuk pribadi. Rilis publik butuh penyedia berlisensi (antarmuka `getLyrics(track)` sengaja sederhana agar mudah diganti).

## ADR-004 — Server tanpa dependency npm

**Status:** Diterima (Fase 0)

**Keputusan.** Hanya modul bawaan Node (`http`, `http2`, `crypto`, `fs`, `fetch`, `node:test`).

**Konsekuensi.**
- (+) Tidak ada supply-chain risk, image Docker kecil, `npm install` tidak perlu.
- (−) JWT, HTTP/2 APNs, dan router ditulis sendiri (sudah dites).
- Aturan: menambah dependency butuh ADR baru.

## ADR-005 — Dependensi diinjeksi (clock, timers, fetch)

**Status:** Diterima (Fase 0)

**Keputusan.** `LyricsEngine`, `createSpotify`, `createLyricsProvider`, `createApns` menerima dependensi sebagai parameter. Tes memakai `FakeClock` untuk mensimulasikan waktu.

**Konsekuensi.** Logika timing (inti produk) bisa dites deterministik dalam milidetik tanpa menunggu waktu nyata.

## ADR-006 — Satu `ActivityConfiguration` untuk semua permukaan

**Status:** Diterima (Fase 0)

**Keputusan.** Dynamic Island, Lock Screen (`.medium`), dan CarPlay/Watch (`.small` via `supplementalActivityFamilies`) dari satu Live Activity. Tidak membuat app CarPlay penuh.

**Konsekuensi.**
- (+) Tidak butuh entitlement CarPlay (kategori audio/navigasi/dll tidak cocok untuk app lirik).
- (−) Tampilan CarPlay non-interaktif dan hanya muncul di iOS 26+.

## ADR-007 — Link login sekali pakai

**Status:** Diterima (Fase 0)

**Konteks.** `/login` publik akan memungkinkan siapa pun menautkan akun Spotify-nya ke server Anda.

**Keputusan.** `/login` hanya menerima nonce dari `POST /api/login-link` (butuh API key), berlaku 10 menit, sekali pakai; `state` OAuth juga sekali pakai.

## ADR-008 — Mode ShazamKit sebagai sumber kedua (direncanakan)

**Status:** Diusulkan (Fase 2)

**Konteks.** Syarat Premium dan batas 5 user dari Spotify, serta tidak adanya API untuk YouTube Music.

**Keputusan (usulan).** Sumber alternatif di dalam app: ShazamKit mengenali lagu + offset lewat mic; engine versi Swift meng-update Live Activity lokal; tanpa server.

**Syarat sebelum diterima.** Spike membuktikan mic aktif tidak menurunkan kualitas audio CarPlay/Bluetooth dan konsumsi baterai wajar (PRD NFR-9).

## ADR-009 — AppConfig tertanam (tanpa input URL/API key di UI)

**Status:** Diterima (T-108)

**Konteks.** App prototipe meminta URL server + API key di Form. Untuk pemakaian pribadi satu server, itu berlebihan dan berisiko salah ketik. API key tidak boleh terlihat di Status.

**Keputusan.** `ios/LirikIsland/AppConfig.swift` (gitignore) diisi dari `server/.envcoolify` (`PUBLIC_URL`, `API_KEY`). Template: `ios/AppConfig.template.swift.txt`. ActivityManager memakai `AppConfig` saja.

**Konsekuensi.**
- (+) Setup lebih pendek; key tidak muncul di UI.
- (−) Build lokal butuh menyalin/generate AppConfig dulu; tanpa file itu compile gagal.

## ADR-010 — Cover album lewat App Group + silent push best-effort

**Status:** Diterima (T-109)

**Konteks.** Widget Live Activity tidak boleh networking. URL di `content-state` membengkak payload (< 4 KB) dan widget tetap tidak mengunduh.

**Keputusan.** `content-state` hanya `trackId`. URL artwork di `/api/status.nowPlaying` + body silent push. App mengunduh ke App Group `artwork/<trackId>.jpg`. Prefetch foreground = path utama; silent push (`content-available`) = best-effort. App Group ID: entitlement `group.com.savage.lirikisland`, derive runtime `group.` + bundle app.

**Konsekuensi.**
- (+) Payload kecil; cover tersedia di Island/Lock Screen bila file ada.
- (−) Cover bisa kosong di background sampai app aktif lagi; butuh App Groups capability (xtool rewrite `XTL-…`).

## ADR-011 — Progress bar memakai `playbackStartSec` + `durationMs`

**Status:** Diterima (T-109)

**Konteks.** `ProgressView(timerInterval:)` memakai `Date()` saat render. Mengirim `elapsedMs` mentah membuat progress loncat karena waktu push ≠ waktu render.

**Keputusan.** Kirim `playbackStartSec` (unix detik saat posisi = 0) dan `durationMs`. Range timer = `start...(start+duration)`. Saat jeda: `ProgressView(value:)` statis. Anchor dibekukan saat pause agar dedupe tidak spam.

**Konsekuensi.**
- (+) Progress selaras sistem tanpa push tiap detik.
- (−) Seek/pause/resume tetap memicu push (playbackStartSec berubah) — itu disengaja.

## ADR-012 — Multi-user: API key per user + devices[] (bukan multi-tenant publik)

**Status:** Diterima (T-303)

**Konteks.** Satu `state.json` tidak bisa menjalankan dua akun Spotify atau dua iPhone tanpa saling timpa token. Batas Spotify Development Mode = 5 user.

**Keputusan.** Indeks `users.json` (id, name, apiKeyHash) + file `users/<id>.json` (refreshToken, prefs, `devices[]`). Env `API_KEY` = bootstrap. CLI `user:add` mencetak plain key sekali. Auth HTTP = resolve hash key → session (Spotify + Engine). Push update ke semua `activityToken` user. Logout hanya menghapus refresh token. Migrasi otomatis dari `state.json` lama.

**Konsekuensi.**
- (+) Dua akun / dua device paralel tanpa DB eksternal.
- (−) User baru butuh restart server setelah `user:add`; bukan self-serve publik (itu T-403).
