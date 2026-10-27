# ios/ — catatan untuk Claude Code

- Project dibuat dari `project.yml` (XcodeGen) **atau** `Package.swift` + `xtool.yml` (xtool di WSL). Jangan commit `*.xcodeproj`.
- `Shared/` dikompilasi di **dua target** (app + widget). Via SPM: modul `LyricsShared`. Struct kontrak: `LyricsActivityAttributes` — lihat `docs/API.md` §3 sebelum mengubah.
- **AppConfig:** `LirikIsland/AppConfig.swift` di-gitignore (berisi `PUBLIC_URL` + `API_KEY`). Salin dari `AppConfig.template.swift.txt` atau generate dari `server/.envcoolify`. Tanpa file ini, build gagal — itu disengaja.
- **App Group:** entitlement `group.com.savage.lirikisland`. Runtime: `AppGroup.id` = `group.` + bundle app (strip `.LirikIslandWidget`). xtool dapat me-rewrite ke `group.XTL-…`.
- Shared views (`LiveActivityViews.swift`) **tidak** memakai `@Environment(\.activityFamily)` — widget yang memilih layout di `LyricsLiveActivity.swift`.
- Widget extension tidak networking. Cover: app unduh → `ArtworkStore` → widget baca by `trackId`.
- Preferensi visual → App Group (`DisplayPreferences`). Preferensi siklus hidup → server (`POST /api/preferences`).
- `ActivityManager` tetap `@MainActor ObservableObject` (jangan migrasi `@Observable` di PR UI).
- Token push selalu dikirim ke server sebagai hex (`Data.hexString`). Device token → `/api/device-token` untuk silent artwork.
- Build cepat tanpa signing (macOS):
  `xcodebuild -project LirikIsland.xcodeproj -scheme LirikIsland -destination 'generic/platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO`
- Live Activity tidak bisa dites push di Simulator dengan APNs sandbox secara andal; uji push di iPhone asli (checklist `docs/TESTING.md`).
