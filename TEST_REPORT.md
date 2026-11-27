# TEST_REPORT — CAKRAWALA v4 (commit 8621111)

**Verdict: LAYAK SUBMIT — 0 KRITIS, 0 SEDANG, 3 KECIL (semua kosmetik).**

Tester independen. Semua klaim builder diverifikasi ulang dengan pengukuran,
bukan dipercaya begitu saja. v4 menargetkan FINAL 28 Nov 07:57 WIB
(v3, submission 01a21c04, dinilai ronde 3 malam ini 19:57 WIB).

## Yang diverifikasi

### 1. `node scripts/check.mjs` — PASSED
State shot landing di output check:
`{x:330, y:15, z:1040}, speed 55, throttle 0.25, fuel 0.3, heading 0,
pitch 0.06, roll 0, ringsPassed 12/12, score 1200, timeLeft 112, hits 0,
onGround: true, stalled: false`.
Cocok dengan klaim builder (roda di strip 20 m setelah threshold, flare
+0,06, GEAR DN, FLAP 15, 12/12, skor 1200).

### 2. Determinisme — byte-identical
`MAKEFUN_OUTPUT_DIR=/tmp/det-a node main.ts` vs `/tmp/det-b`: `diff -r`
tanpa perbedaan. Dossier 536.155 byte, teks 106.740 byte, 4 gambar
(1-cover, 2-play, 3-cockpit, 4-landing), cover index 0.

### 3. Vendor — identik dengan kit starter
`vendor/makefun-game.ts` sha256
`dc67187521b24025ff952f8c231485a6eb92d6d71d29edd2a08154ffb4376129` — sama
dengan `~/workspace/makefun/kit/starter/vendor/makefun-game.ts`.
`game/vendor/three.module.min.js` (3e690ac7…) bawaan sejak commit 130db53
(era v1), tidak berubah di v4.

### 4. Screenshot — dilihat langsung sebagai juri (1280×720)

**1-cover.jpg** — runway + ring 1 + gunung berapi + laut/pulau dalam satu
frame; pesawat besar di frame; HUD ALT 100 m / SPD 346 km/h / HDG 000°;
kompas "300 330 ▲ N 000 030" lengkap; banner "Misi 1 — Ring Run".
Matahari: piksel putih terbakar (>245) di pojok kiri atas 300×200 turun
**3779 → 539 dari 60.000 (6,3% → 0,9%, 7× lebih kecil)**; mean luminance
181,4 → 175,4. Klaim "kini kuning hangat" TERBUKTI — tidak lagi membakar.

**4-landing.jpg** — TERBACA sebagai touchdown: strip memenuhi frame bawah
dan membentang 600 m ke depan, marka threshold putih tepat di bawah hidung,
ALT 15 m, GEAR DN, FLAP 15, CINCIN 12/12, SKOR 1200, banner "Semua cincin
dilewati — mendarat di landasan!". **Caveat (lihat KECIL-2):** roda tidak
terlihat dari chase cam belakang-atas — touchdown terbaca lewat strip +
marka + HUD + banner, bukan lewat roda.

**2-play.jpg** — chase view miring (bank), cincin besar di depan lereng
gunung, HUD ALT 195 m / SPD 374 km/h / HDG 306°, kompas "240 W 270 ▲ 300
330" lengkap, CINCIN 3/12, SKOR 300. Matahari lembut, tidak membakar.

**3-cockpit.jpg** — panel v3 UTUH, tanpa regresi: 5 dial ber-bezel (RPM, KT,
ATT, ALT, FUEL), placard ELANG-7, sekrup, glareshield, pipi panel, stick +
trigger merah terlihat di bawah panel. ATT level dan konsisten dengan
horizon luar (shot pitch 0, roll 0). HUD ALT 134 m / SPD 331 km/h /
HDG 000°, kompas "300 330 ▲ N 000 030" lengkap. A-pillar: rentang total
**38 → 30 px pada y=200 (~21% lebih tipis)**, terukur dari scanline —
tetap elemen paling dominan di frame atas (lihat KECIL-1).

### 5. Playtest live — headless Chromium (probe14 + probe-tester-v4 baru)

- **Touch-and-go (probe-playtest14):** TOUCHDOWN z=880 x=330 speed 64,3,
  toast "Mendarat — lepas landas lagi untuk lanjut misi", GEAR DN,
  **RELIFTOFF OK** (y=15,6, speed 71,2, z=836). ERRORS(0), FINDINGS(0).
  Observasi: run ini sempat memantul keras sekali sebelum touchdown akhir
  (hits 0→1 di z≈914 setelah lonjakan sink 17 m/s dari osilasi pitch
  controller probe sendiri) — artefak piloting probe, bukan cacat game:
  game mencatat pendaratan, menampilkan toast, dan reliftoff jalan.
  **Ini menutup celah verifikasi SEDANG-2 warisan v3 (pendaratan belum
  pernah didemonstrasikan): pendaratan kini TERBUKTI live.**
- **Ring 1 (probe-tester-v4, scripts/probe-tester-v4.mjs):** RING 1 PASSED
  t=26,2 dtk, y=58,6, z=614, speed 64, liftoff 8,1 dtk, hits 0, skor 100.
  ERRORS(0), FINDINGS(0).
- **HUD 960×540 (probe-tester-v4):** ketiga shot — klaster kiri 12–272,
  tengah 311–649, kanan 766–948 (landing: kanan 728–948); celah 39/117 px,
  **overlap=false**. Strip kompas di heading 000° menampilkan
  **"300 330 N 000 030" lengkap dan terbaca** (diverifikasi visual di
  hud960-landing.png, bukan hanya DOM). **KECIL-2 v3 (strip kompas
  terpotong <1280 px) TERATASI.**

## Cacat

### KRITIS — 0

### SEDANG — 0

### KECIL

- **KECIL-1 (warisan v3, mengecil): A-pillar masih elemen paling dominan
  di frame kokpit atas.** Rentang total 38 → 30 px pada 1280×720
  (y=200; kiri 201–231, kanan 1048–1078), ~21% lebih tipis, tapi dua
  strut hitam kontras tinggi melawan langit oranye tetap memakan frame
  atas. Menipiskan lagi berisiko menghilangkan framing — kosmetik,
  jangan dikejar.
- **KECIL-2 (baru): roda tidak terlihat di shot landing.** Chase cam
  belakang-atas menyembunyikan roda di balik badan pesawat; touchdown
  terbaca lewat strip/marka/HUD/banner. Sudut samping/bawah akan
  menunjukkan roda, tapi re-shoot berisiko merusak komposisi — kosmetik.
- **KECIL-3 (warisan v3, mengecil): matahari tetap cakram besar di pojok
  kiri atas cover** (539 px putih terbakar tersisa, max 252) — kini kuning
  hangat, bukan putih terbakar. Pilihan golden hour, bukan cacat.
- **Diterima tanpa perbaikan (warisan):** detail kecil pesawat (strut,
  spinner, antena, exhaust, pitot, roda ekor) tetap tak terbaca pada
  resolusi shot; baris 2 (depth: 3 misi, fuel, damage) tetap tak terlihat
  di screenshot — batas struktural set 4 screenshot, bukan cacat v4.

## Skor juri per kriteria (skala 1–5, sama seperti v3)

| # | Kriteria | v3 | v4 | Catatan |
|---|----------|----|----|---------|
| 1 | Game lengkap TERLIHAT | 4 | 4 | Cover/play/kokpit/landing semua terbaca; arc penerbangan kini lengkap (takeoff→terbang→kokpit→touchdown), tapi dunia tetap low-poly yang sama — belum cukup untuk 5. |
| 2 | Fun & depth | 3 | 3 | Depth tetap hanya di kode, tak terlihat di screenshot. |
| 3 | Feel & polish | 3 | **4** | Touchdown kini terbaca jelas — potongan terakhir yang hilang di v2/v3 (anchor SCORECARD baris 3 = 8: "landings/crashes read clearly"). |
| 4 | Look & originality | 3 | 3 | Matahari dijinakkan membantu, tapi dunia dan A-pillar masih sama. |
| 5 | Struktur | 4 | 4 | 12 file satu-tugas-per-file, tak tersentuh. |

Self-score builder (SCORECARD ronde 07): baris 3 naik 7→8, min tetap 7
(baris 2). Penilaian tester sejalan: satu-satunya kenaikan skor juri
adalah baris 3.

## Dossier / kelengkapan

- `check.mjs` PASSED, determinisme byte-identical, vendor identik starter.
- 4 screenshot 1280×720, dossier lengkap (teks 106.740 byte).
- Struktur 12 file, 3 misi, fuel + damage utuh; `shots.json` dan vendor
  tidak diubah.

## Kesimpulan

v4 memperbaiki tepat tiga hal yang dijanjikan builder, semuanya terukur:
touchdown terbaca (strip + marka + HUD 12/12 + banner), matahari tidak
lagi membakar (piksel putih 7× lebih sedikit), A-pillar lebih tipis
(~21%), strip kompas utuh di 960×540. Tidak ada regresi dari v3
(panel kokpit utuh, kompas 330 lengkap, ATT konsisten). Pendaratan dan
cincin 1 keduanya terverifikasi LIVE tanpa console/page error.
**LAYAK SUBMIT sebagai entry final.**
