# TESTING — Strategi Tes & Checklist QA

## 1. Tes otomatis (server)

```bash
cd server
npm test            # semua tes (node:test), < 1 dtk
npm run simulate    # demo real-time ±32 dtk, push dicetak ke konsol
```

| File | Cakupan |
|---|---|
| `test/lyrics.test.js` | Parser LRC (multi-timestamp, offset, tag per kata), `indexAt`, `cleanTitle`, `pickBest`, provider LRCLIB (get → search, cache, error) |
| `test/engine.test.js` | Timing per baris, `LEAD_MS`, seek, pause, ganti lagu, status non-sinkron, push-to-start + cooldown, auto-end, token mati, rate limit, payload < 4 KB |
| `test/apns-spotify.test.js` | JWT ES256 (format JOSE), dry run, `isDeadToken`, parsing Spotify, refresh token, 401/429, config |
| `test/app.test.js` | Auth API key, registrasi token, validasi input, alur login sekali pakai, callback |
| `test/contract.test.js` | `content-state` server = `contract/live-activity.json` = struct Swift; `/api/status` memenuhi field wajib `ServerStatus` |

### Aturan menulis tes
- Logika yang bergantung waktu **wajib** memakai `FakeClock` (`test/helpers.js`), bukan `setTimeout` nyata.
- Jangan memanggil jaringan sungguhan; injeksi `fetchImpl`.
- Setiap bug yang diperbaiki → tambah satu tes yang gagal sebelum perbaikan.
- Lirik contoh di tes/simulasi harus teks buatan sendiri (bukan lirik lagu asli).

## 2. Checklist QA manual (iPhone)

Catat hasil di [ROADMAP.md](ROADMAP.md) bagian Log.

### A. Setup
- [ ] Server jalan; `GET /health` = `{"ok":true}`
- [ ] App: URL + API key benar → tidak ada peringatan koneksi
- [ ] API key salah → muncul "API key salah"
- [ ] Hubungkan Spotify dari app → halaman "Spotify terhubung ✓" → status ✓ dalam 3 dtk
- [ ] "Auto-start siap" ✓ setelah app dibuka

### B. Live Activity dasar
- [ ] "Tampilkan lirik" → Live Activity muncul di Dynamic Island
- [ ] "Server pegang token update" ✓
- [ ] "Kirim tes push" → "Tes dari server ✓" muncul ≤ 2 dtk
- [ ] Tekan lama Island → tampilan expanded benar
- [ ] Kunci layar → tampilan Lock Screen benar
- [ ] "Hentikan" → Live Activity hilang, server tidak lagi pegang token

### C. Sinkronisasi
- [ ] 5 lagu populer berbeda: baris berganti tepat (catat selisih kira-kira)
- [ ] Geser posisi lagu → lirik menyesuaikan ≤ 3 dtk
- [ ] Pause → ikon jeda, baris berhenti; play → lanjut
- [ ] Ganti lagu → "Memuat lirik…" lalu lirik lagu baru
- [ ] Lagu tanpa lirik / instrumental → pesan sesuai tabel UI-DESIGN §4
- [ ] Iklan (akun gratis) / podcast → dianggap jeda

### D. Siklus hidup
- [ ] Tutup paksa app → lirik tetap berjalan (push dari server)
- [ ] Hentikan Live Activity, tutup app, putar lagu → auto-start dalam ≤ 10 dtk
- [ ] Setelah auto-start, lirik ikut berganti (token update terkirim)
- [ ] Stop musik 15 menit → Live Activity berakhir sendiri
- [ ] Matikan server 15 menit → tampilan meredup (stale)

### E. CarPlay (iOS 26)
- [ ] Tile muncul di Dashboard saat Live Activity aktif
- [ ] Tata letak `.small` (bukan fallback compact)
- [ ] Teks terbaca sekilas dari posisi mengemudi
- [ ] Selama 30 menit: hitung push terkirim (log server) vs baris yang tampil — apakah ada yang tertahan?
- [ ] Settings › Lirik Island › Live Activities › More Frequent Updates: bandingkan nyala vs mati

## 3. Mengukur jatah push (T-103)

1. Set `LOG_PUSHES=1` di env server, sehingga setiap push sukses dicatat (`[push] update 200 …`). Di Coolify, lihat tab Logs.
2. Hitung baris `[push] update 200` per menit dari log.
3. Bandingkan dengan pengamatan: baris yang dilewati/terlambat.
4. Bila banyak tertahan: coba `MIN_PUSH_INTERVAL_MS=2000` dan bandingkan.

## 4. Tes Swift (Fase 2)

Saat engine diport ke Swift (T-202), buat XCTest yang memakai **kasus uji yang sama** dengan `server/test/lyrics.test.js` dan `engine.test.js` (input LRC & ekspektasi baris per waktu), supaya kedua implementasi berperilaku identik.
