# server/ — catatan untuk Claude Code

- Entry: `src/server.js` merakit modul; logika ada di modul lain dan semuanya bisa dites tanpa jaringan.
- `LyricsEngine` (src/engine.js) adalah inti. Alurnya: `poll()` → `applyPlayback()` → `resync()` → `pushIfChanged()` → `sendToActivity()`. `maintainActivity()` menangani auto-start/auto-end. Penjelasan lengkap: `docs/DESIGN.md` §4.
- Semua env dibaca di `src/config.js` (`loadConfig(env)`); env baru → tambahkan juga ke `.env.example` dan README tabel penyetelan.
- Endpoint baru → `src/app.js` (tabel `routes`), auth otomatis untuk prefix `/api/`, tes di `test/app.test.js`, dokumentasi di `docs/API.md`.
- Tes timing: `const clock = new FakeClock(); ... await clock.advance(ms)`. Lihat `test/engine.test.js` untuk pola `setup()`.
- Mode coba tanpa Apple: `APNS_DRY_RUN=1` (push dicetak ke log).
- Respons APNs `410` / `400 BadDeviceToken` → token dihapus (`isDeadToken`). Jangan ubah tanpa alasan kuat.
