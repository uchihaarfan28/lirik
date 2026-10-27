---
description: Ambil tugas berikutnya dari docs/ROADMAP.md, kerjakan sampai kriteria selesai terpenuhi
argument-hint: "[ID tugas, mis. T-104 — opsional]"
---

1. Baca `CLAUDE.md`, lalu `docs/ROADMAP.md`.
2. Pilih tugas: kalau argumen berisi ID (mis. `T-104`), pakai itu. Kalau tidak, ambil tugas ⬜ paling atas yang dependensinya sudah ✅ dan **tidak** butuh perangkat fisik (iPhone/mobil). Tugas yang butuh perangkat (T-102, T-103, spike T-201): siapkan langkah uji dan minta pengguna menjalankannya.
3. Baca bagian dokumen yang relevan (PRD untuk kebutuhan, DESIGN/API/UI-DESIGN untuk detail).
4. Sampaikan rencana singkat (file yang akan diubah, tes yang akan ditambah) lalu kerjakan.
5. Ikuti aturan di `CLAUDE.md` (kontrak, tanpa dependency, FakeClock, tes).
6. Jalankan `/verify`.
7. Perbarui `docs/ROADMAP.md`: status jadi ✅ dan tambahkan satu baris di **Log** (tanggal hari ini, ID, ringkasan, angka penting). Perbarui dokumen lain yang terdampak.
8. Laporkan: apa yang dikerjakan, hasil tes, dan apa yang perlu dicek pengguna di perangkat.

Argumen: $ARGUMENTS
