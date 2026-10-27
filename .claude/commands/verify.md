---
description: Jalankan semua pemeriksaan (tes server, kontrak, simulasi singkat) dan laporkan hasilnya
---

Jalankan pemeriksaan berikut dan laporkan ringkas (lulus/gagal + penyebab bila gagal):

1. `cd server && npm test` — semua tes termasuk `test/contract.test.js`.
2. `cd server && timeout 40 npm run simulate` — pastikan baris lirik tercetak berurutan dan diakhiri event `end`.
3. Cek tidak ada rahasia yang ikut: `git status --porcelain` tidak boleh menampilkan `server/.env`, `*.p8`, atau `server/data/`.
4. Bila ada perubahan file Swift dan perintah `xcodebuild` tersedia, jalankan `/ios-build`. Bila tidak tersedia, sebutkan bahwa build Swift belum diverifikasi.

Jangan memperbaiki apa pun tanpa diminta; cukup laporkan. $ARGUMENTS
