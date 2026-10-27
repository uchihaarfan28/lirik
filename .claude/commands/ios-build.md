---
description: Generate project Xcode dan build app + widget untuk iOS Simulator (hanya macOS)
---

1. Pastikan berjalan di macOS dan `xcodegen` serta `xcodebuild` tersedia (`which xcodegen xcodebuild`). Kalau tidak, hentikan dan jelaskan ke pengguna (install: `brew install xcodegen`, Xcode dari App Store).
2. `cd ios && xcodegen generate`
3. `cd ios && xcodebuild -project LirikIsland.xcodeproj -scheme LirikIsland -destination 'generic/platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO 2>&1 | tail -80`
4. Bila gagal: perbaiki error compile satu per satu. Jangan mengubah nama/tipe field di `LyricsActivityAttributes.ContentState` kecuali mengikuti `/contract-change`. Setelah memperbaiki, jalankan `cd server && npm test` (tes kontrak membaca file Swift).
5. Laporkan: sukses/gagal, daftar file yang diubah, dan warning penting.

$ARGUMENTS
