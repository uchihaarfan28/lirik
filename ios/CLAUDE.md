# ios/ — catatan untuk Claude Code

- Project dibuat dari `project.yml` (XcodeGen). Tambah file Swift cukup taruh di folder target; jalankan ulang `xcodegen generate`. Jangan commit `*.xcodeproj`.
- `Shared/LyricsActivityAttributes.swift` dikompilasi di **dua target** (app + widget). Struct ini adalah kontrak dengan server — lihat `docs/API.md` §3 sebelum mengubah.
- Widget extension tidak boleh melakukan networking atau menyimpan state; semua data datang dari `content-state`.
- Tampilan per permukaan di `LirikIslandWidget/LyricsLiveActivity.swift`:
  - Dynamic Island → closure `dynamicIsland:`
  - Lock Screen → `LyricsActivityView` dengan `activityFamily == .medium`
  - CarPlay / Watch → `LyricsActivityView` dengan `activityFamily == .small`
- Token push selalu dikirim ke server sebagai hex (`Data.hexString`).
- Build cepat tanpa signing (macOS):
  `xcodebuild -project LirikIsland.xcodeproj -scheme LirikIsland -destination 'generic/platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO`
- Live Activity tidak bisa dites push di Simulator dengan APNs sandbox secara andal; uji push di iPhone asli (checklist `docs/TESTING.md`).
