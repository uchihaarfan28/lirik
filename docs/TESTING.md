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
| `test/engine.test.js` | Timing per baris, `LEAD_MS`, seek, pause, ganti lagu, dedupe playbackStartSec, prefs autoStart/dim/grace, silent artwork, auto-end, token mati, payload < 4 KB |
| `test/apns-spotify.test.js` | JWT ES256, dry run liveactivity + background, artwork 300px, refresh token, config |
| `test/app.test.js` | Auth API key, registrasi token/device-token, preferences validasi, alur login |
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
- [ ] App buka tanpa input URL/API key → host muncul di Status; API key **tidak** terlihat
- [ ] Hubungkan Spotify dari app → halaman "Spotify terhubung ✓" → status ✓
- [ ] Status: App Group = OK; path container non-nil
- [ ] "Auto-start siap" ✓ setelah app dibuka

### B. Live Activity dasar
- [ ] "Tampilkan lirik" → Live Activity muncul di Dynamic Island
- [ ] "Kirim tes push" → "Tes dari server ✓" muncul ≤ 2 dtk
- [ ] Lock Screen gaya klasik + progress jalan selaras lagu (±1–2 s)
- [ ] Ganti gaya di Tampilan → baris berikutnya memakai gaya baru
- [ ] "Hentikan" → Live Activity hilang

### C. Sinkronisasi & cover
- [ ] 5 lagu berbeda: baris berganti tepat
- [ ] Geser posisi → lirik + progress menyesuaikan ≤ 3 dtk
- [ ] Pause → "Dijeda", opacity redup; play → lanjut
- [ ] Buka app saat lagu A → cover di Island/Lock Screen; ganti lagu B → buka app lagi → cover B
- [ ] Lagu tanpa lirik / instrumental → pesan sesuai tabel UI-DESIGN §4

### D. Siklus hidup / jeda
- [ ] "Segera sembunyikan" + pause ≥ 25 s → activity hilang
- [ ] "Redupkan saja" + pause lama → activity tetap, tampilan redup
- [ ] Matikan auto-start → stop → putar lagu baru → activity **tidak** muncul sendiri
- [ ] Tutup paksa app → lirik tetap berjalan (push dari server)
- [ ] Matikan server 15 menit → tampilan meredup (stale)

### E. CarPlay (iOS 26)
- [ ] Tile muncul di Dashboard saat Live Activity aktif
- [ ] Tata letak `.small` tanpa kontrol/progress animasi panjang
- [ ] Teks terbaca sekilas dari posisi mengemudi
- [ ] Settings › More Frequent Updates: bandingkan nyala vs mati

## 3. Mengukur jatah push (T-103)

1. Set `LOG_PUSHES=1` di env server, sehingga setiap push sukses dicatat (`[push] update 200 …`). Di Coolify, lihat tab Logs.
2. Hitung baris `[push] update 200` per menit dari log.
3. Bandingkan dengan pengamatan: baris yang dilewati/terlambat.
4. Bila banyak tertahan: coba `MIN_PUSH_INTERVAL_MS=2000` dan bandingkan.

## 4. Tes Swift (Fase 2)

Saat engine diport ke Swift (T-202), buat XCTest yang memakai **kasus uji yang sama** dengan `server/test/lyrics.test.js` dan `engine.test.js` (input LRC & ekspektasi baris per waktu), supaya kedua implementasi berperilaku identik.
