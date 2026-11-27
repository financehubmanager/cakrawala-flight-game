# BUILD REPORT — CAKRAWALA v3

Revisi panel kokpit pasca v2 (submission 01a21b67, commit remote 6e7194c3,
di hitung dari ronde 3; ronde 3 tutup 27 Nov 19:57 WIB, final 28 Nov 07:57
WIB). Disetujui user 27 Nov 2026 14:34 WIB, bersamaan dengan revisi Bot
Sprint dan Thankful Judge. v3 dibangun di repo lokal yang sama, belum
di-push, belum di-bundle, belum di-submit — parent yang menangani langkah
itu.

## Diagnosis v2 (dari TEST_REPORT.md v2)

Tester v2 verdict LAYAK SUBMIT, 0 KRITIS: kriteria #1 naik 2→4, #3 2→3,
#4 2→3. Satu kelemahan terbesar tersisa, **SEDANG-1: panel kokpit masih
kartu 2D datar yang ditempel di atas view 3D** — tepi keras, dial digambar
tanpa bezel, tidak ada struktur kokpit di sekitarnya; frame kokpit masih
yang terlemah dari empat shot. **KECIL-2:** HUD tumpang tindih di bawah
lebar 1280 px (live play saja). KECIL-3 (detail pesawat tidak terbedakan di
resolusi shot) diabaikan — tidak ada cara murah yang benar-benar terlihat
di shot.

## Perubahan vs v2 (semua di `game/src/aircraft.js` + `game/index.html`)

### SEDANG-1 — panel kokpit dibangun ulang jadi instrumen sungguhan

**Struktur 3D di sekitar panel (`buildCockpit`, ditulis ulang):**
- Frame pemasangan logam 2,0×0,68×0,05 m di belakang panel — panel kini
  punya "dinding" tempat ia terpasang, bukan mengambang di udara.
- Panel lebih dalam: 1,85×0,55×0,16 m (dulu 0,1 m) — dari sudut kokpit,
  ketebalan panel terlihat sebagai slab, bukan kartu.
- Glareshield: hood 2,0×0,05×0,4 m di atas panel, miring 0,4 rad ke arah
  pilot — atap gelap di atas instrumen, seperti visor dasbor pesawat
  sungguhan; tepi atas panel tidak lagi bertemu langit secara tiba-tiba.
- Pipi samping (side cheeks) 0,06×0,55×0,45 m di kedua ujung panel, miring
  0,25 rad — panel menyatu ke sisi kokpit.
- **A-pillar:** silinder r=0,05 m dari sudut atas panel (±0,98; 0,62;
  −4,25) ke sudut atas frame (±1,85; 2,15; −3,95) — windscreen kini
  berbingkai, bukan langit terbuka. Iterasi pertama r=0,07 terbaca seperti
  balok hitam raksasa di shot; ditipiskan ke 0,05 dan material diganti ke
  logam agar menangkap sedikit cahaya matahari.
- **Control stick:** kolom r=0,045 m dari lantai (0; −0,35; −4,15) miring
  ke pilot, grip 0,11×0,20×0,10 m tepat di bawah tepi bawah panel, trigger
  merah 0,04×0,06×0,03 m — isyarat foreground bahwa penonton duduk di
  kursi. Grip sempat tersembunyi di balik tepi panel; dipindah lebih rendah
  (y 0,26 → 0,18) dan diperbesar sampai trigger merah terlihat jelas di
  shot.

**Panel digambar ulang (`createPanel`, canvas 512×160 → 640×200):**
- Wajah logam mesin: slab dengan bevel (tepi atas terang, tepi bawah
  bayangan), 4 sekrup sudut dengan slot, placard "ELANG-7".
- Setiap dial kini punya **bezel logam** (gradien radial metalik + alur
  hitam), **kaca** (sheen diagonal di atas muka dial), **angka** (KT 0–4,
  ALT 0/8/15, FUEL E/½/F), dan **redline** merah di KT + RPM.
- **ATT:** simbol pesawat tetap oranye (tidak ikut roll — referensi yang
  membuat bola terbaca sebagai attitude indicator), pitch ladder ±10° yang
  bergerak bersama bola, bank pointer segitiga di 12 o'clock pada bezel.
  Horizon ATT tetap roll/pitch dari state live — tidak pernah berkontradiksi
  dengan horizon dunia (pelajaran v1).
- Jarum tetap mengikuti angka HUD (KT/ALT/FUEL/RPM dari state live);
  posisi dial baru: RPM (48,100,r28), KT (140,100,r56), ATT (320,100,r56),
  ALT (500,100,r56), FUEL (592,100,r28).

**Geometri terverifikasi hitung (bukan perkiraan):** kursi kokpit di
pos+forward×2,2+(0,1,0), FOV 68; panel 2,1 m di depan kursi, sepertiga
bawah frame (tepi atas ~9,3° di bawah tengah frame, tepi bawah ~23,1°);
hood 3,7°–9,5° di bawah tengah (di atas panel, di bawah ring 1); grip
stick ~24° di bawah tengah (y≈611 di 1280×720), tepat di atas kotak
horizon DOM. A-pillar tidak menutupi ring 1 maupun gunung.

### KECIL-2 — HUD overlap di bawah 1280 px (`game/index.html`)

Media query `@media (max-width: 1279px)`: topcenter min-width 230 px,
value font 19 px, gap/padding diperkecil, horizon box 90×50 px. Tidak
berlaku di 1280×720 — keempat shot tidak berubah karenanya.

### Yang TIDAK disentuh (v2 dipertahankan)

Cover runway+ring, shot landing, ATT konsisten dengan horizon, label
kompas 330, kotak tutorial hilang di shot mode, struktur 12 file src
satu-tugas-per-file, 3 misi, fuel + damage, dimensi + pipeline screenshot
v2 (shots.json), vendor/makefun-game.ts.

## Verifikasi (semua pada kode final)

- `node scripts/check.mjs` — **PASSED** (boot, playtest takeoff +
  steering, keempat shot mode mencapai fase flying, 0 console error).
- `node scripts/shoot.mjs` — SHOTS DONE; keempat screenshot dilihat
  langsung:
  - **3-cockpit.jpg — SEDANG-1 teratasi.** Panel terbaca sebagai panel
    instrumen sungguhan (bezel, sekrup, placard, angka, redline, simbol
    ATT), windscreen berbingkai A-pillar, hood + pipi menyatukan panel ke
    kokpit, stick + trigger merah di bawah panel. Ring 1, strip runway,
    dan gunung tetap terlihat di windscreen; kompas 330 utuh.
  - **1-cover.jpg — tidak berubah komposisinya** (runway + ring + gunung +
    laut + pesawat; beda byte hanya drift awan/asap/baling dari live
    shoot), 2-play.jpg dan 4-landing.jpg utuh (kokpit tersembunyi di
    mode chase, sesuai desain).
- **Determinisme:** `node main.ts` 2× ke /tmp/det1 dan /tmp/det2 —
  `diff -r` **identik byte-per-byte** (dossier + game + screenshots).
- **Probe KECIL-2 (960×540, skrip sekali pakai, sudah dihapus):** kotak
  HUD terukur — topleft 12–272, topcenter 356–604, topright 766–948;
  celah 84 px dan 162 px, **tidak ada tumpang tindih**; screenshot
  960×540 dilihat langsung: ketiga klaster atas terpisah jelas. (Catatan
  probe: query shot yang benar `?shot=cockpit&seed=1` — `?shot=3-cockpit`
  bukan nama shot dan jatuh ke layar menu.)

## Skor (SCORECARD.md ronde 06, self-score builder — belum dikritik fresh)

Baris 1: 8→9, baris 10: 8→9, baris 13: 7→8; sisanya sama dengan v2;
min tetap 7. Yang naik adalah baris yang langsung disentuh revisi ini:
frame kokpit kini benar-benar terbaca sebagai game penerbangan jadi
(baris 1), close-up kokpit tahan dilihat (baris 10), HUD bersih di semua
lebar (baris 13).

## Sisa kelemahan (jujur, untuk tester / ronde berikutnya)

- Baris 3 (feel & polish) tetap 7: tidak ada shot touchdown/crash —
  pendaratan hanya terlihat sebagai approach, bukan touchdown.
- Baris 2 tetap 7: depth (3 misi, fuel, damage) ada di kode, tidak
  terlihat di screenshot.
- Matahari masih membakar pojok kiri atas cover (sudah ada sejak v2).
- A-pillar masih elemen paling dominan di frame kokpit atas — tipis dan
  berbingkai, tapi kontrasnya tinggi melawan langit oranye; ini harga
  framing yang benar, bukan cacat.
- Grip stick terbaca lewat kolom + trigger merahnya; grip itu sendiri
  masih berupa kolom gelap, bukan bentuk grip yang detail.

## File yang berubah

- `game/src/aircraft.js` — `buildCockpit` ditulis ulang (frame, panel
  lebih dalam, hood, pipi, A-pillar, stick); `createPanel` ditulis ulang
  (canvas 640×200, bezel/kaca/sekrup/placard/angka/redline, ATT dengan
  simbol + ladder + bank pointer).
- `game/index.html` — media query KECIL-2.
- `screenshots/*.jpg` — diregenerasi (shoot.mjs).
- `SCORECARD.md` — ronde 06.
- `BUILD_REPORT.md` — dokumen ini (menggantikan laporan v2).
