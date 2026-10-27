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
