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
| `accent` | `#22C55E` (RGB ≈ 0.133, 0.773, 0.369) | Ikon musik, keyline Island, CTA |
| `primary` | putih 100% | Baris aktif |
| `secondary` | putih 60% | Judul/artis, baris berikutnya |
| Latar Live Activity | hitam 82% (`activityBackgroundTint`) | Lock Screen, CarPlay |
| Latar app | hitam OLED / system background | Tab Sekarang |
| Status basi / jeda | opacity 55% | `context.isStale` atau `!isPlaying` |

Ikon SF Symbols: `music.note` (memutar), `pause.fill` (jeda), `waveform` (indikator memutar di expanded).

Tipografi (SF, Dynamic Type): baris aktif **bold**, maks. 2 baris, `minimumScaleFactor 0.7`; baris berikutnya 1 baris.

Progress: `ProgressView(timerInterval:)` saat memutar; nilai statis saat jeda. CarPlay `.small` tanpa progress animasi.

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

Tiga gaya (preferensi App Group `lockScreenStyle`):

| Gaya | Isi |
|---|---|
| **klasik** | Ikon 44×44 + judul/artis + lirik + next + progress |
| **cover** | Thumb cover 52×52 dari App Group + lirik + progress |
| **minimal** | Hanya baris lirik besar |

Saat jeda: opacity 0.55 + caption lokal "Dijeda".

```
┌────────────────────────────────────────────────┐
│ ┌────┐  Lagu Demo · Lirik Island               │
│ │ ♪  │  Lampu kota berbaris di kaca depan      │  ← title3 bold, putih
│ └────┘  Jalan tol sepi, radio pelan            │  ← subheadline, 60%
│         ████████░░░░ progress                  │
└────────────────────────────────────────────────┘
```
- Padding 14 pt. Shared views tidak memakai `@Environment(\.activityFamily)`.

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

## 5. App iPhone (TabView)

Tab: **Sekarang** | **Tampilan** | **Status**.

### Sekarang
Hero cover (dari App Group) + judul/artis + lirik + CTA "Tampilkan lirik" / "Hentikan Live Activity".

### Tampilan
Pratinjau Lock Screen (data contoh buatan) + preferensi visual (App Group) + bagian "Saat jeda" → `POST /api/preferences`.

### Status
Host server (bukan API key), Spotify, diagnosa Live Activity, App Group OK/path, tes push.

Polling: `scenePhase` aktif → 3 s bila playing, 10 s bila idle; batal di background.

### Onboarding (3 langkah, sekali)
1. Hubungkan Spotify → 2. Izinkan Live Activities → 3. Coba push / selesai.

### Rencana Fase 3: lirik penuh di app (FR-15) & offset (FR-14)
- Daftar semua baris, baris aktif disorot dan auto-scroll ke tengah.
- Tombol "−0,5 dtk / +0,5 dtk" (disimpan per lagu di server).

## 6. Copywriting

| Konteks | Teks |
|---|---|
| Tombol utama | Tampilkan lirik |
| Login | Hubungkan akun Spotify |
| Sukses login (web) | Spotify terhubung ✓ — Silakan kembali ke app Lirik Island lalu putar lagu di Spotify. |
| Live Activities mati | Live Activities mati. Nyalakan di Settings › Lirik Island › Live Activities. |
| Gagal koneksi | Tidak bisa menghubungi server |
| Jeda (widget) | Dijeda |
| Alert push-to-start | Judul: nama lagu · Isi: nama artis |

## 7. Mode jeda (UI Tampilan)

- Toggle "Mulai otomatis saat Spotify diputar" → `autoStart`.
- Toggle "Redupkan saja saat jeda" → `pauseMode=dim` (picker sembunyikan disabled).
- Picker sembunyikan setelah: Segera / 1 / 5 / 15 mnt / Jangan.

Gaya: kalimat pendek, kata "Anda" dihindari bila bisa, istilah teknis (Live Activity, Dynamic Island, CarPlay) tidak diterjemahkan.

## 8. Aksesibilitas

- Semua teks mengikuti Dynamic Type; baris aktif boleh mengecil sampai 70% sebelum terpotong.
- Kontras putih di atas hitam 82% ≥ 7:1.
- Status tidak hanya dibedakan warna (ikon berbeda untuk ✓/✗/−).
