# ROADMAP — Backlog & Kriteria Selesai

Cara pakai dengan Claude Code: pilih tugas teratas yang statusnya ⬜ dan tidak terblokir, kerjakan sampai semua kriteria ✓, lalu ubah statusnya jadi ✅ dan catat ringkas di bagian **Log**. Perintah `/next-task` melakukan ini.

Status: ⬜ belum · 🔄 dikerjakan · ✅ selesai · ⛔ terblokir

---

## Fase 0 — Prototipe Spotify ✅

| ID | Tugas | Status |
|---|---|---|
| T-001 | Server: polling Spotify, LRCLIB, engine sinkron, APNs | ✅ |
| T-002 | App iOS: pengaturan, mulai/stop, upload token | ✅ |
| T-003 | Widget: Dynamic Island, Lock Screen, CarPlay `.small` | ✅ |
| T-004 | 43 tes server, simulasi, Dockerfile | ✅ |

## Fase 1 — Validasi di perangkat & app harian yang stabil

### T-101 · Build pertama di Xcode ⬜
- `xcodegen generate` berhasil; target app + widget build tanpa error untuk iOS 18.
- Perbaiki error compile/warning concurrency tanpa mengubah kontrak.
- **Selesai bila:** `xcodebuild -scheme LirikIsland -destination 'generic/platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO` sukses; preview widget tampil di Xcode.

### T-102 · Uji end-to-end di iPhone ⬜ (butuh T-101)
- Jalankan checklist [TESTING.md §2](TESTING.md) bagian A–D.
- **Selesai bila:** tes push muncul; lirik berganti mengikuti lagu ≥ 5 lagu berbeda; hasil dicatat di Log.

### T-103 · Uji di mobil (CarPlay, iOS 26) ⬜ (butuh T-102)
- Checklist TESTING.md bagian E.
- Ukur: berapa push terkirim vs tampil selama 30 menit; perlu/tidaknya ubah `LEAD_MS`.
- **Selesai bila:** tile muncul di Dashboard; catatan delay dan jatah push di Log.

### T-104 · API key di Keychain (FR-41) ⬜
- Helper Keychain kecil (`kSecClassGenericPassword`, service = bundle ID).
- Migrasi otomatis dari UserDefaults lalu hapus nilai lama.
- **Selesai bila:** API key tidak ada lagi di UserDefaults; tetap terbaca setelah app di-restart.

### T-105 · Onboarding (FR-42) ✅
- Alur 3 langkah: Spotify → Live Activities → coba push (lihat UI-DESIGN §5).
- **Selesai bila:** pengguna baru bisa sampai tes push tanpa isi URL/API key.

### T-106 · Ikon app & nama tampilan ⬜
- Asset catalog dengan AppIcon (1024 px), set `ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon` di `project.yml`.
- Opsional; tidak memblokir T-108–T-110.

### T-107 · Endpoint & UI "Hentikan dari server" ⬜
- Bila Live Activity ditutup manual saat app mati, server tidak tahu. Saat app dibuka, kirim daftar activity aktif ke server (`POST /api/activity-sync {activityIds: [...]}`); server hapus token yang tidak ada di daftar.
- **Selesai bila:** skenario "geser tutup → putar lagu → auto-start jalan lagi" berhasil setelah app dibuka sekali; tes server ditambah.

### T-108 · Rombak UI app (AppConfig + TabView) ✅
- AppConfig tertanam; TabView Sekarang / Tampilan / Status; onboarding 3 langkah.
- **Selesai bila:** tanpa input URL/key; host tampil di Status; API key tidak terlihat.

### T-109 · Artwork + progress Live Activity ✅
- Kontrak: `trackId`, `durationMs`, `playbackStartSec`; cover App Group; 3 gaya Lock Screen; silent push best-effort.
- **Selesai bila:** `npm test` hijau; progress timerInterval; widget baca cover by trackId.

### T-110 · Preferensi jeda / hemat baterai ✅
- `POST /api/preferences` + grace 20 s; `pauseMode` dim|hide; polling `scenePhase`.
- **Selesai bila:** tes engine autoStart/dim/grace lulus; UI Tampilan sync prefs.

## Fase 2 — Mode ShazamKit (tanpa Premium, semua pemutar)

### T-201 · Spike audio session ⬜
- App percobaan: `SHManagedSession` + `AVAudioSession(.playAndRecord, [.mixWithOthers, .allowBluetoothA2DP])`, input mic internal.
- Uji: Spotify via CarPlay kabel & nirkabel, Bluetooth mobil biasa. Apakah musik pindah ke mode telepon / kualitas turun?
- Ukur baterai 30 menit.
- **Selesai bila:** keputusan go/no-go dicatat sebagai pembaruan ADR-008.

### T-202 · Port engine ke Swift ⬜ (butuh T-201 = go)
- `LRCParser`, `indexAt`, `LocalLyricsEngine` (posisi, timer per baris, dedupe, jeda minimum) — logika sama dengan `server/src/engine.js`.
- Unit test XCTest memakai data uji yang sama dengan `server/test/lyrics.test.js`.
- Klien LRCLIB di Swift.

### T-203 · Sumber ShazamKit ⬜
- Re-match tiap 15 dtk; `predictedCurrentMatchOffset` → anchor posisi.
- Tidak ada match 30 dtk → jeda; judul berbeda → ganti lagu.
- `Activity.update` lokal; `UIBackgroundModes: audio`; izin mikrofon (`NSMicrophoneUsageDescription`).
- Aktifkan ShazamKit di App ID.

### T-204 · Pilihan sumber di app ⬜
- Segmented: "Spotify (server)" / "Dengar lewat mic". Simpan pilihan.
- **Selesai bila:** YouTube Music & Spotify gratis menampilkan lirik di Dynamic Island.

## Fase 3 — Kenyamanan & multi-user

| ID | Tugas | Kriteria selesai | Status |
|---|---|---|---|
| T-301 | Offset per lagu (FR-14): `POST /api/offset {trackId, deltaMs}`, disimpan di state, dipakai di `positionAt` | Tombol ±0,5 dtk di app; tes engine | ⬜ |
| T-302 | Lirik penuh di app (FR-15): `GET /api/lyrics` → semua baris + index aktif | Auto-scroll, sorot baris aktif | ⬜ |
| T-303 | Multi-user (maks. 5): state per user (`users/{id}`), API key per user | Dua iPhone dengan akun Spotify berbeda berjalan bersamaan | ⬜ |
| T-304 | Spike broadcast channel Live Activity (iOS 18) sebagai pengganti token per activity | Laporan keandalan vs push-to-start | ⬜ |
| T-305 | Cache lirik persisten (file) + statistik cakupan lirik | `GET /api/status` menampilkan % lagu bertemu lirik | ⬜ |
| T-306 | Notifikasi bila refresh token Spotify dicabut | Push biasa / pesan di app | ⬜ |

## Fase 4 — Siap App Store (bergantung lisensi)

| ID | Tugas | Status |
|---|---|---|
| T-401 | Pilih penyedia lirik berlisensi (Musixmatch/LyricFind), ganti implementasi `getLyrics` | ⬜ |
| T-402 | `PrivacyInfo.xcprivacy`, kebijakan privasi, catatan review (kenapa ada server & mic) | ⬜ |
| T-403 | Login pengguna & server multi-tenant (bukan URL server manual) | ⬜ |
| T-404 | TestFlight (`APNS_ENV=production`) | ⬜ |

---

## Log

Tambahkan entri terbaru di atas. Format: `YYYY-MM-DD · T-xxx · ringkasan · hasil/angka penting`.

- 2026-10-27 · T-108–T-110 · Rombak UI/UX: kontrak trackId/playbackStartSec/durationMs, artwork App Group, silent push, preferences, TabView, ADR-009/010/011 · 63 tes server lulus
- 2026-10-27 · Deploy · Dockerfile + `.dockerignore` + `docker-compose.yml` di root monorepo untuk Coolify · Base Directory `/`, volume `/data`
- 2026-10-27 · Docs · PRD, DESIGN, API, UI-DESIGN, ADR, TESTING, CLAUDE.md, perintah Claude Code, tes kontrak server ↔ Swift, opsi `LOG_PUSHES` · 50 tes lulus
- 2026-10-27 · T-001–T-004 · Prototipe selesai · 43 tes lulus, simulasi baris ±0,4 dtk lebih awal (LEAD_MS=400)
