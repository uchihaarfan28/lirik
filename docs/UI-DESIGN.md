# UI-DESIGN — Tampilan & Pengalaman

Prinsip utama: **dilirik, bukan dibaca**. Pengguna sering sedang menyetir; satu baris besar lebih berguna daripada banyak informasi.

---

## 1. Prinsip

1. **Baris aktif adalah pahlawan.** Selalu elemen terbesar dan paling kontras.
2. **Satu sumber kebenaran.** Semua permukaan (Island, Lock Screen, CarPlay) menampilkan data `content-state` yang sama; hanya tata letaknya yang berbeda.
3. **Status selalu jelas.** Tidak ada layar kosong: memuat, jeda, tidak ada lirik, basi — semua punya teks.
4. **Aman di mobil.** CarPlay non-interaktif, tanpa scroll, tanpa animasi panjang (maks. transisi 0,3 dtk).
5. **Bahasa Indonesia, santai dan singkat.**

## 2. Token visual

| Token | Nilai | Pemakaian |
|---|---|---|
| `accent` | `#1FD661` (RGB 0.12, 0.84, 0.38) | Ikon musik, keyline Island |
| `primary` | putih 100% | Baris aktif |
| `secondary` | putih 60% | Judul/artis, baris berikutnya |
| Latar Live Activity | hitam 82% (`activityBackgroundTint`) | Lock Screen, CarPlay |
| Status basi | opacity 55% seluruh konten | `context.isStale` |

Ikon SF Symbols: `music.note` (memutar), `pause.fill` (jeda), `waveform` (indikator memutar di expanded).

Tipografi (SF, Dynamic Type): baris aktif **bold**, maks. 2 baris, `minimumScaleFactor 0.7`; baris berikutnya 1 baris.

## 3. Permukaan

### 3.1 Dynamic Island

| Mode | Isi |
|---|---|
| **Compact leading** | Ikon `music.note` (atau `pause.fill` saat jeda), warna accent |
| **Compact trailing** | Potongan baris aktif, `caption2` semibold, lebar maks. 80 pt, 1 baris |
| **Minimal** | Ikon `music.note` (saat ada Live Activity lain) |
| **Expanded** | Leading: ikon musik · Trailing: `waveform`/`pause.fill` · Center: "Judul · Artis" (caption, secondary) · Bottom: baris aktif (`headline`, tengah, maks. 2 baris) + baris berikutnya (`subheadline`, secondary) |

Compact sengaja hanya potongan: ruang di kanan kamera sangat sempit. Baris lengkap ada di expanded, Lock Screen, dan CarPlay.

```
Compact:   [♪]  (kamera)  Lampu kota ber…

Expanded:  ♪            Lagu Demo · Lirik Island            ∿
                 Lampu kota berbaris di kaca depan
                    Jalan tol sepi, radio pelan
```

### 3.2 Lock Screen / StandBy (`ActivityFamily.medium`)

```
┌────────────────────────────────────────────────┐
│ ┌────┐  Lagu Demo · Lirik Island               │
│ │ ♪  │  Lampu kota berbaris di kaca depan      │  ← title3 bold, putih
│ └────┘  Jalan tol sepi, radio pelan            │  ← subheadline, 60%
└────────────────────────────────────────────────┘
```
- Kotak ikon 44×44, radius 10, isi accent 18%.
- Padding 14 pt.

### 3.3 CarPlay Dashboard (`ActivityFamily.small`, iOS 26)

```
┌──────────────────────────────┐
│ ♪ Lagu Demo                  │  ← caption2, 60%
│ Lampu kota berbaris          │  ← headline bold, maks. 2 baris
│ di kaca depan                │
└──────────────────────────────┘
```
- Tanpa baris berikutnya (ruang kecil, kurangi beban baca).
- Padding 10 pt. Tidak ada tombol (Live Activity di CarPlay non-interaktif).
- Juga dipakai Apple Watch Smart Stack.

### 3.4 Transisi baris

Baris aktif memakai `.id(text)` + `.transition(.push(from: .bottom))` — baris lama naik, baris baru masuk dari bawah. Tidak ada animasi lain.

## 4. Tabel status

| Kondisi | `line` | Ikon | Catatan visual |
|---|---|---|---|
| Belum ada lagu | Putar lagu di Spotify | `music.note` | — |
| Memuat lirik | Memuat lirik… | `music.note` | — |
| Memutar, jeda instrumental | ♪ | `music.note` | `nextLine` = baris berikutnya |
| Memutar | (teks lirik) | `music.note` / `waveform` | — |
| Jeda | (baris terakhir) | `pause.fill` | Baris tidak berganti |
| Instrumental | ♪ Instrumental ♪ | `music.note` | — |
| Lirik tak tersinkron | Lirik ada, tapi belum tersinkron | `music.note` | — |
| Tidak ada lirik | Lirik tidak ditemukan | `music.note` | — |
| Gagal | Gagal memuat lirik | `music.note` | — |
| Server mati > 15 menit | (terakhir) | — | Opacity 55% |
| Tes | Tes dari server ✓ | — | `nextLine` = jam UTC |

## 5. App iPhone (satu layar `Form`)

Urutan section:

1. **Server** — URL, API key (SecureField), peringatan koneksi (oranye).
2. **Spotify** — status "Akun terhubung", tombol "Hubungkan akun Spotify".
3. **Sedang diputar** — ikon play/pause, "Judul — Artis", baris aktif (title3 bold), baris berikutnya.
4. **Live Activity** — status: aktif, server pegang token, auto-start siap, update sering diizinkan · tombol: Tampilkan lirik di Dynamic Island, Kirim tes push, Hentikan (merah) · footer: penjelasan CarPlay & More Frequent Updates.
5. **Push terakhir** — `event · OK / gagal status alasan` (monospace).
6. **Catatan server** — `lastError` (oranye).
7. **Pesan** — hasil aksi terakhir.

Status ditampilkan dengan ikon: ✓ hijau (ya), ✗ abu (tidak), − abu (belum diketahui). Status di-refresh tiap 3 dtk saat layar terbuka.

### Rencana Fase 1: onboarding (FR-42)
Layar bertahap saat pertama dibuka: (1) Server → tes koneksi, (2) Login Spotify → tunggu "terhubung", (3) Izinkan Live Activities + More Frequent Updates, (4) Tombol "Coba sekarang" → tes push. Setelah selesai, masuk ke layar Form di atas.

### Rencana Fase 3: lirik penuh di app (FR-15) & offset (FR-14)
- Daftar semua baris, baris aktif disorot dan auto-scroll ke tengah.
- Tombol "−0,5 dtk / +0,5 dtk" (disimpan per lagu di server).

## 6. Copywriting

| Konteks | Teks |
|---|---|
| Tombol utama | Tampilkan lirik di Dynamic Island |
| Login | Hubungkan akun Spotify |
| Sukses login (web) | Spotify terhubung ✓ — Silakan kembali ke app Lirik Island lalu putar lagu di Spotify. |
| Live Activities mati | Live Activities mati. Nyalakan di Settings › Lirik Island › Live Activities. |
| Belum diatur | Isi URL server dan API key dulu. |
| Alert push-to-start | Judul: nama lagu · Isi: nama artis |

Gaya: kalimat pendek, kata "Anda" dihindari bila bisa, istilah teknis (Live Activity, Dynamic Island, CarPlay) tidak diterjemahkan.

## 7. Aksesibilitas

- Semua teks mengikuti Dynamic Type; baris aktif boleh mengecil sampai 70% sebelum terpotong.
- Kontras putih di atas hitam 82% ≥ 7:1.
- Status tidak hanya dibedakan warna (ikon berbeda untuk ✓/✗/−).
