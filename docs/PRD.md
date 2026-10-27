# PRD — Lirik Island

| | |
|---|---|
| Status | Fase 0 selesai (prototipe Spotify), Fase 1 berjalan |
| Pemilik | Rofiq |
| Terakhir diperbarui | 27 Oktober 2026 |
| Dokumen terkait | [DESIGN.md](DESIGN.md) · [API.md](API.md) · [UI-DESIGN.md](UI-DESIGN.md) · [ROADMAP.md](ROADMAP.md) · [DECISIONS.md](DECISIONS.md) · [TESTING.md](TESTING.md) |

---

## 1. Ringkasan

Lirik Island menampilkan **baris lirik yang sedang dinyanyikan** dari lagu yang diputar di Spotify (dan nanti YouTube Music / Apple Music) di **Dynamic Island**, **Lock Screen**, dan **CarPlay Dashboard** iPhone. Lirik berganti otomatis mengikuti lagu tanpa perlu membuka app.

## 2. Masalah

- Spotify dan YouTube Music tidak menampilkan lirik di CarPlay atau Dynamic Island.
- Apple Music menampilkan lirik di CarPlay (iOS 26), tapi tidak untuk layanan lain.
- Melihat lirik di HP saat musik diputar di mobil berarti membuka app, membuka kunci layar, dan mengganggu.
- iOS tidak mengizinkan app membaca lagu yang diputar app lain (beda dengan Windows/Android), jadi solusi harus memakai jalur alternatif.

## 3. Tujuan & bukan tujuan

### Tujuan
- **G1** — Saat lagu Spotify diputar, baris aktif muncul di Dynamic Island, Lock Screen, dan CarPlay dengan selisih ≤ 1 detik dari vokal.
- **G2** — Setelah setup awal, pemakaian harian tanpa membuka app (auto-start).
- **G3** — Tampilan CarPlay mudah dilirik: satu baris besar, tanpa interaksi.
- **G4** (Fase 2) — Mendukung semua pemutar, termasuk Spotify gratis dan YouTube Music, lewat pengenalan audio (ShazamKit).

### Bukan tujuan (untuk saat ini)
- Memutar musik atau mengontrol pemutaran (play/pause/skip).
- Aplikasi CarPlay penuh (butuh entitlement kategori yang tidak cocok untuk app lirik).
- Terjemahan lirik, karaoke per kata, atau mengedit lirik.
- Rilis di App Store sebelum ada lisensi lirik (lihat §9).

## 4. Pengguna

| Persona | Kebutuhan | Prioritas |
|---|---|---|
| **Pengemudi/penumpang pengguna Spotify Premium** (Rofiq, pemakaian pribadi) | Lirik di CarPlay & Dynamic Island tanpa ribet | MVP |
| **Teman/keluarga** (maks. 4 orang tambahan, batas Spotify Development Mode) | Sama, memakai server yang sama | Fase 3 |
| **Pengguna Spotify gratis / YouTube Music** | Lirik tanpa Premium | Fase 2 (ShazamKit) |
| Publik umum (App Store) | — | Fase 4, bergantung lisensi |

## 5. Skenario utama

1. **Pertama kali** — Pengguna install app, isi URL server + API key, login Spotify, tekan "Tampilkan lirik". Lirik langsung muncul di Dynamic Island.
2. **Harian di mobil** — Pengguna menyalakan mobil, CarPlay tersambung, memutar Spotify. Live Activity muncul sendiri (auto-start) dan lirik tampil di CarPlay Dashboard.
3. **Ganti lagu / geser posisi** — Lirik mengikuti dalam ≤ 3 detik (siklus polling).
4. **Pause** — Tampilan menunjukkan status jeda, baris berhenti berganti.
5. **Lagu tanpa lirik** — Tampil pesan jelas ("Lirik tidak ditemukan" / "♪ Instrumental ♪").
6. **Selesai berkendara** — Setelah 15 menit tanpa musik, Live Activity berakhir sendiri.

## 6. Kebutuhan fungsional

Kode `FR-x` dirujuk di ROADMAP dan tes.

### Sumber lagu
| ID | Kebutuhan | Status |
|---|---|---|
| FR-1 | Login Spotify via OAuth (link sekali pakai dari app atau CLI) | ✅ |
| FR-2 | Membaca judul, artis, album, durasi, posisi, status putar dari Spotify Web API | ✅ |
| FR-3 | Deteksi ganti lagu, pause, seek, dan "tidak ada yang diputar" | ✅ |
| FR-4 | Mode ShazamKit: kenali lagu + posisi lewat mic, tanpa akun Spotify | ⬜ Fase 2 |

### Lirik
| ID | Kebutuhan | Status |
|---|---|---|
| FR-10 | Ambil lirik tersinkron (LRC) dari LRCLIB, cocokkan judul/artis/durasi | ✅ |
| FR-11 | Pencarian cadangan dengan judul dibersihkan ("feat.", "Remastered") | ✅ |
| FR-12 | Bedakan status: tersinkron, tanpa sinkron, instrumental, tidak ada, gagal | ✅ |
| FR-13 | Cache lirik per lagu | ✅ (memori) |
| FR-14 | Koreksi offset manual per lagu (+/- 0,5 dtk) dari app | ⬜ Fase 3 |
| FR-15 | Tampilan lirik lengkap di dalam app (scroll otomatis) | ✅ (layar penuh; offset FR-14 masih Fase 3) |

### Tampilan
| ID | Kebutuhan | Status |
|---|---|---|
| FR-20 | Dynamic Island: compact (ikon + potongan baris), expanded (judul, baris aktif, baris berikutnya), minimal | ✅ |
| FR-21 | Lock Screen / StandBy: judul, baris aktif besar, baris berikutnya | ✅ |
| FR-22 | CarPlay Dashboard (iOS 26, family `.small`): judul kecil + baris aktif | ✅ |
| FR-23 | Tanda "basi" bila tidak ada update 15 menit (server mati) | ✅ |

### Siklus Live Activity
| ID | Kebutuhan | Status |
|---|---|---|
| FR-30 | Mulai manual dari app; token update dikirim ke server | ✅ |
| FR-31 | Auto-start lewat push-to-start saat musik mulai | ✅ (eksperimental) |
| FR-32 | Auto-end setelah N menit tanpa musik (default 15) | ✅ |
| FR-33 | Tangani token kedaluwarsa (410 / BadDeviceToken) | ✅ |
| FR-34 | Tes push dari app untuk diagnosis | ✅ |

### Pengaturan & diagnosis
| ID | Kebutuhan | Status |
|---|---|---|
| FR-40 | App menampilkan status: Spotify terhubung, token terdaftar, push terakhir, error server | ✅ |
| FR-41 | API key disimpan di Keychain | ✅ |
| FR-42 | Onboarding langkah demi langkah di app | ⬜ Fase 1 |

## 7. Kebutuhan non-fungsional

| ID | Kebutuhan | Target |
|---|---|---|
| NFR-1 | Selisih tampil vs vokal | ≤ 1 dtk (p90), dapat disetel lewat `LEAD_MS` |
| NFR-2 | Deteksi ganti lagu | ≤ 3,6 dtk (polling 3 dtk + jeda) |
| NFR-3 | Ukuran payload Live Activity | < 4 KB (teks dipotong 140 karakter) |
| NFR-4 | Frekuensi push | ≥ 1 dtk antar push; hanya saat baris berubah |
| NFR-5 | Server ringan | Tanpa dependency npm, < 50 MB RAM, jalan di VPS kecil |
| NFR-6 | Keamanan | Semua `/api/*` butuh API key; token disimpan file 0600; link login sekali pakai 10 menit |
| NFR-7 | Privasi | Yang dikirim ke LRCLIB hanya judul, artis, album, durasi |
| NFR-8 | Keselamatan berkendara | CarPlay non-interaktif, satu baris, teks besar, tanpa animasi berlebihan |
| NFR-9 | Baterai (Fase 2) | Mode ShazamKit ≤ 10%/jam tambahan (target, perlu diukur) |

## 8. Metrik keberhasilan (pemakaian pribadi)

- ≥ 90% lagu populer yang diputar punya lirik tersinkron.
- Sinkron terasa tepat menurut pengguna di ≥ 9 dari 10 lagu.
- Dalam seminggu pemakaian di mobil, Live Activity muncul otomatis di ≥ 80% perjalanan.
- Nol crash app/widget yang terlihat pengguna.

## 9. Batasan & risiko

| Risiko | Dampak | Mitigasi |
|---|---|---|
| **Spotify Development Mode**: wajib Premium (sejak Feb 2026), maks. 5 user, extended quota hanya untuk organisasi ≥ 250 ribu MAU | Tidak bisa disebar luas lewat Spotify API | Pemakaian pribadi; Fase 2 ShazamKit untuk tanpa Premium |
| Refresh token Spotify berumur 6 bulan | Harus login ulang | Status "Spotify belum terhubung" di app + `npm run login` |
| Jatah update Live Activity dibatasi iOS | Baris bisa tertahan/telat | Push hanya saat berubah, jeda ≥ 1 dtk, minta "More Frequent Updates" |
| Live Activity maksimal 8 jam | Berhenti di perjalanan panjang | Auto-start ulang saat musik masih jalan |
| Push-to-start tidak selalu memberi token update | Auto-start tidak update lirik | Panduan buka app sekali; evaluasi broadcast channel (Fase 3) |
| **Hak cipta lirik** (LRCLIB = komunitas) | Tidak boleh dikomersialkan tanpa lisensi | Pribadi saja; Fase 4 butuh lisensi Musixmatch/LyricFind |
| Gangguan pengemudi | Keselamatan | Desain CarPlay minimal (NFR-8) |
| Mode ShazamKit: mic aktif bisa memindah audio CarPlay/Bluetooth ke mode telepon | Kualitas musik turun | Spike teknis di Fase 2 sebelum dibangun penuh |

## 10. Pertanyaan terbuka

1. Apakah user tambahan di Development Mode juga wajib Premium? → uji dengan akun gratis.
2. Berapa jatah push Live Activity sebenarnya untuk satu sesi 2 jam? → ukur di Fase 1 (TESTING.md §3).
3. Apakah broadcast channel (iOS 18) lebih andal daripada push-to-start + token? → spike Fase 3.
4. Apakah mic iPhone tetap bisa dipakai tanpa menurunkan kualitas audio CarPlay? → spike Fase 2.

## 11. Rilis bertahap

Detail tugas dan kriteria selesai ada di [ROADMAP.md](ROADMAP.md).

| Fase | Isi | Hasil |
|---|---|---|
| 0 | Prototipe Spotify + server + Live Activity | ✅ selesai |
| 1 | Validasi di iPhone & mobil, perbaikan build, Keychain, onboarding | App harian yang stabil |
| 2 | Mode ShazamKit (semua pemutar, tanpa Premium, tanpa server) | Tidak bergantung Spotify API |
| 3 | Offset per lagu, lirik penuh di app, multi-user, broadcast channel | Nyaman dipakai keluarga |
| 4 | Lisensi lirik, privacy manifest, persiapan App Store | Bisa dirilis publik |
