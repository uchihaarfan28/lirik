# CLAUDE.md — Lirik Island

Panduan untuk Claude Code saat bekerja di repo ini. Baca ini dulu, lalu dokumen di `docs/` sesuai kebutuhan.

## Apa ini

App iPhone yang menampilkan baris lirik lagu Spotify yang sedang diputar di **Dynamic Island, Lock Screen, dan CarPlay Dashboard** lewat Live Activity. Server Node.js membaca posisi lagu dari Spotify Web API, mengambil lirik LRC dari LRCLIB, dan mengirim tiap baris sebagai push APNs.

| Dokumen | Isi |
|---|---|
| `docs/PRD.md` | Tujuan, kebutuhan (FR/NFR), batasan, fase |
| `docs/DESIGN.md` | Arsitektur, alur, algoritma sinkron, error handling |
| `docs/API.md` | Kontrak HTTP API & payload Live Activity |
| `docs/UI-DESIGN.md` | Tampilan Island/Lock Screen/CarPlay/app, copywriting |
| `docs/DECISIONS.md` | ADR — alasan di balik keputusan besar |
| `docs/ROADMAP.md` | Backlog bertahap + kriteria selesai + log |
| `docs/TESTING.md` | Tes otomatis & checklist QA perangkat |

## Struktur

```
Dockerfile / docker-compose.yml  Coolify monorepo (build server dari root)
contract/live-activity.json   sumber kebenaran payload Live Activity
server/                       Node.js ≥ 20.6, ESM, TANPA dependency
  src/engine.js               inti sinkronisasi (paling sering diubah)
  src/{spotify,lyrics,apns,app,config,store}.js
  test/*.test.js              node:test + FakeClock
ios/
  Shared/                     LyricsActivityAttributes (target app + widget)
  LirikIsland/                app SwiftUI
  LirikIslandWidget/          Live Activity UI
  project.yml                 XcodeGen (xcodeproj TIDAK di-commit)
```

## Perintah

```bash
cd server && npm test          # wajib lulus sebelum selesai (50 tes, < 1 dtk)
cd server && npm run simulate  # demo push real-time ±32 dtk
cd server && npm run dev       # server lokal (butuh server/.env)
cd ios && xcodegen generate    # buat LirikIsland.xcodeproj (hanya di macOS)
```

Perintah khusus: `/verify`, `/ios-build`, `/next-task`, `/contract-change`.

## Aturan penting

1. **Kontrak harus sinkron.** Mengubah `content-state`, `attributes`, atau respons `/api/status` = ubah `contract/live-activity.json` + `server/src/engine.js` + Swift + `docs/API.md`, lalu `npm test` (tes kontrak memeriksa server ↔ Swift). Field baru di Swift wajib punya default di decoder toleran.
2. **Server tanpa dependency npm** (ADR-004). Pakai modul bawaan Node. Menambah dependency butuh ADR baru di `docs/DECISIONS.md` dan persetujuan pengguna.
3. **Waktu selalu diinjeksi.** Kode yang bergantung waktu memakai `this.clock` / `this.timers`, tes memakai `FakeClock` dari `server/test/helpers.js`. Jangan `Date.now()`/`setTimeout` langsung di engine.
4. **Setiap perubahan perilaku server → tes.** Bug fix diawali tes yang gagal.
5. **Swift:** iOS 18 minimum, Swift 5 language mode, `ActivityManager` tetap `@MainActor`. Kalau lingkungan tidak punya Xcode (mis. Linux), Swift tidak bisa di-compile: tulis dengan hati-hati, jalankan tes kontrak, dan **katakan terus terang** ke pengguna bahwa build belum diverifikasi.
6. **Rahasia:** jangan membaca, menampilkan, atau meng-commit `server/.env`, `*.p8`, `server/data/`. Contoh konfigurasi hanya di `server/.env.example`.
7. **Lirik:** jangan menulis lirik lagu asli di kode, tes, atau dokumen. Pakai teks buatan sendiri.
8. **Teks UI berbahasa Indonesia**, singkat (lihat `docs/UI-DESIGN.md` §6). Nama kode/identifier berbahasa Inggris; komentar boleh Indonesia.
9. **Keselamatan CarPlay:** jangan menambah elemen interaktif, scroll, atau animasi panjang di tampilan `.small`.

## Definisi selesai

- `cd server && npm test` lulus.
- Dokumen terkait diperbarui (API.md bila kontrak berubah, DESIGN.md bila alur berubah, DECISIONS.md bila ada keputusan baru).
- Status tugas di `docs/ROADMAP.md` diperbarui + satu baris di **Log**.
- Untuk perubahan Swift: sebutkan apakah sudah di-build (`/ios-build`) atau belum.

## Konteks platform (jangan dilanggar)

- iOS tidak punya API publik untuk membaca lagu dari app lain → server + push (ADR-001).
- Spotify Development Mode: Premium wajib, maks. 5 user, refresh token 6 bulan.
- Live Activity: payload < 4 KB, maks. 8 jam, timestamp APNs harus naik, jatah push dibatasi iOS.
- CarPlay memakai `ActivityFamily.small` (iOS 26), non-interaktif.
