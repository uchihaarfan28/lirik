---
description: Ubah kontrak payload Live Activity / status API dengan aman di server dan iOS sekaligus
argument-hint: "[perubahan, mis. tambah field albumArtUrl: string]"
---

Perubahan yang diminta: $ARGUMENTS

Ikuti checklist `docs/API.md` §3 secara berurutan:

1. `contract/live-activity.json` — tambah/ubah field.
2. `server/src/engine.js` — `buildState()` di **semua cabang** mengisi field ini; perhatikan batas 140 karakter & payload < 4 KB.
3. `ios/Shared/LyricsActivityAttributes.swift` — properti di `ContentState`, `decodeIfPresent` dengan default di decoder toleran, `.waiting`.
4. `ios/LirikIslandWidget/LyricsLiveActivity.swift` — preview state + pemakaian di UI (ikuti `docs/UI-DESIGN.md`).
5. Bila menyangkut `/api/status`: `engine.status()` dan `ServerStatus` di `ios/LirikIsland/ServerClient.swift` (field baru sebaiknya opsional di Swift).
6. `docs/API.md` — tabel dan contoh JSON.
7. `cd server && npm test` — tes kontrak wajib lulus.

Ingat: Live Activity yang sedang berjalan di HP lama tetap memakai struct lama sampai app di-update, jadi field baru jangan membuat decoding gagal.
