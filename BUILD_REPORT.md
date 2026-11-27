# BUILD REPORT — CAKRAWALA v4

Revisi pasca v3 (submission 01a21c04, commit remote 1c9a2af8, dihitung
ronde 3; ronde 3 tutup 27 Nov 19:57 WIB, final 28 Nov 07:57 WIB).
Disetujui user 27 Nov 2026 17:22 WIB ("Ketiganya" — bersama revisi
Thankful Judge v3 dan SakuRumah v2). v4 menargetkan FINAL, bukan ronde 3
— ronde 3 terlalu mepet untuk pipeline penuh. v4 dibangun di repo lokal
yang sama, belum di-push, belum di-bundle, belum di-submit — parent yang
menangani langkah itu.

## Diagnosis v3 (dari TEST_REPORT.md v3)

Tester v3 verdict LAYAK SUBMIT, 0 KRITIS, 0 SEDANG, 2 KECIL. Skor juri
v2→v3 tidak naik angka (4/3/3/3/4) — perbaikannya ada di dalam band yang
sama — tapi frame kokpit tidak lagi menjadi alasan kalah duel. Sisa
kelemahan yang bisa menaikkan skor, dalam urutan nilai:

1. **Baris 3 scorecard mentok 7: tidak ada shot touchdown/crash.**
   Pendaratan hanya terlihat sebagai approach (ALT 50 m, 80 m sebelum
   threshold), bukan touchdown. Juri tidak memainkan game, jadi
   pendaratan harus TERLIHAT di screenshot.
2. **Matahari membakar pojok kiri atas cover** (sudah ada sejak v2):
   cakram matahari di shader langit bertambah 1,0× warna + halo 0,32 —
   dengan tone mapping ACES dan exposure 1,12, cakramnya klip ke putih.
3. **KECIL-1: A-pillar terlalu dominan** — strut hitam ~30 px di
   1280×720, kontras tinggi melawan langit oranye.
4. **KECIL-2 (baru v3): strip kompas di banner misi terpotong di lebar
   <1280 px** — di 960×540 hanya "330 ▲ N 000" yang terlihat, label
   300/030 hilang. Live play saja; shot juri 1280×720 utuh.

## Perubahan vs v3

### (a) SHOT TOUCHDOWN — `game/src/shots.js` + `game/src/main.js`

Shot `landing` ditulis ulang dari approach menjadi touchdown:

- Pesawat di **y = 15 m (groundY 12 + 3, persis tinggi on-ground
  flight model), z = 1040 — 20 m setelah threshold** (threshold
  selatan di z = 1060, marka threshold di z = 1034). Strip memenuhi
  frame bawah dan berlari 600 m ke depan; marka threshold tepat di
  bawah hidung; lampu tepi membingkai kedua sisi.
- **Flare:** pitch +0,06 (hidung sedikit naik), speed 55 m/s,
  vspeed −1,5 m/s (turun lembut), throttle 0,25, gearDown + flaps.
- **Semua 12 cincin dilewati** (ringsPassed 12, skor 1200, CINCIN
  12/12) — shot ini adalah akhir misi, bukan approach di tengah jalan.
- `applyShot` di `main.js` diperbaiki: bila ringsPassed >= ringTotal,
  objective menjadi "Semua cincin dilewati — mendarat di landasan!"
  (baris yang sama dipakai runtime saat cincin terakhir dilewati).
  Tanpa ini, ringsPassed 12 akan terbaca "cincin 13/12". Perubahan
  ini hanya menyentuh cabang shot — `loadMission` (ringsPassed selalu
  0) dan logika ring di `simulate()` tidak berubah.
- Shot mode membekukan pose (simulasi tidak berjalan), jadi
  onGround: true tidak memicu `complete()` — frame tetap momen
  beku yang deterministik.

### (b) Matahari cover — `game/src/sky.js`

Satu baris di fragment shader langit: `sunColor * (sunAmount * 1.0 +
halo * 0.32)` → `sunColor * (sunAmount * 0.5 + halo * 0.28)`.
Cakram kini cakram kuning hangat, bukan putih terbakar; halo sedikit
lebih kalem. Posisi/intensitas cahaya directional tidak disentuh
(pencahayaan scene sama), begitu pula `dusk` (shot landing sudah
lembut). Berlaku untuk semua shot yang menghadap matahari.

### (c) KECIL-1 — A-pillar — `game/src/aircraft.js`

Radius strut 0,05 → **0,04 m** (material logam sama). Framing
dipertahankan — kedua strut tetap berjalan dari sudut atas panel ke
sudut atas frame dan terbaca sebagai struktur; hanya kurang dominan.
Diverifikasi visual di 3-cockpit.jpg (lihat bawah).

### (d) KECIL-2 — strip kompas <1280 px — `game/index.html`

Media query `max-width: 1279px`: `#hud-topcenter { min-width: 230px }`
→ **320 px**. Hanya jendela yang terlihat yang membesar — matematika
tape (2,4 px/derajat, span 72 px) TIDAK disentuh, jadi tidak ada
risiko misalignment label. Shot juri 1280×720 tidak terpengaruh
(media query tidak berlaku di sana).

### Yang TIDAK disentuh (v3 dipertahankan)

Panel kokpit v3 (bezel/kaca/sekrup/placard, ATT, kompas 330), cover
runway+ring, ATT konsisten dengan horizon, kotak tutorial hilang di
shot mode, struktur 12 file src, 3 misi, fuel + damage, dimensi +
pipeline screenshot (shots.json — tetap 4 shot), vendor/makefun-game.ts.

## Verifikasi (semua pada kode final)

- `node scripts/check.mjs` — **PASSED** (boot, playtest, keempat shot
  mode mencapai fase flying, 0 console error). State landing
  terverifikasi di output check: y 15, z 1040, pitch 0,06, speed 55,
  ringsPassed 12/12, skor 1200, onGround true.
- `node scripts/shoot.mjs` — SHOTS DONE; keempat screenshot dilihat
  langsung:
  - **4-landing.jpg — TOUCHDOWN TERBACA.** Pesawat di atas strip
    dengan marka threshold di bawah hidung, strip + lampu tepi
    memenuhi frame bawah dan berlari ke horizon; HUD: ALT 15 m,
    SPD 198 km/h, −1,5 m/s, CINCIN 12/12, SKOR 1200, GEAR DN,
    FLAP 15, objective "Semua cincin dilewati — mendarat di
    landasan!". Bukan lagi approach.
  - **1-cover.jpg — matahari jinakkan.** Cakram kini kuning hangat
    di pojok kiri atas, tidak lagi putih terbakar; halo lebih kalem.
    Komposisi utuh (runway + ring + gunung + laut + pesawat).
  - **3-cockpit.jpg — A-pillar lebih tipis, framing utuh.** Kedua
    strut masih membingkai windscreen dengan jelas; panel, ATT,
    kompas 330 utuh; ring 1 + strip + gunung tetap terlihat.
  - **2-play.jpg — tidak berubah komposisinya** (ring 4 di depan
    gunung, sayap banked; matahari tidak masuk frame ini).
- **Determinisme:** `node main.ts` 2× ke /tmp/v4-det1 dan /tmp/v4-det2
  — `diff -r` **identik byte-per-byte**.
- **Vendor:** sha256 `dc671875…` identik dengan kit starter.
- **Probe KECIL-2 (960×540, skrip sekali pakai di /tmp, tidak masuk
  repo):** klaster HUD terukur — topleft 12–272, topcenter 311–649,
  topright 766–948; celah 39 px dan 117 px, **tidak ada tumpang
  tindih**, 0 page error. Screenshot dilihat langsung: strip kompas
  kini "300 330 ▲ N 000 030" — kelima label terlihat (300/030 agak
  redup di tepi mask, tapi terbaca jelas). Catatan: panel kiri bawah
  membungkus "RUSAK 0/3" ke dua baris di 960 px — perilaku lama dari
  media query v3 (width 180 px), kosmetik live-play, tidak disentuh.

## Skor (SCORECARD.md ronde 07, self-score builder — belum dikritik fresh)

Baris 3: 7→8 (touchdown kini terbaca jelas — tepat anchor 8:
"landings/crashes read clearly"); sisanya sama dengan v3; min tetap 7
(baris 2: depth ada di kode, tak terlihat di screenshot).

## Sisa kelemahan (jujur, untuk tester / final)

- Baris 2 tetap 7: depth (3 misi, fuel, damage) ada di kode, tidak
  terlihat di screenshot — tidak ada cara murah yang benar-benar
  terlihat di shot; ini batas struktural set 4 screenshot.
- A-pillar masih elemen paling dominan di frame kokpit atas, hanya
  lebih tipis (0,04 m). Menipiskan lagi berisiko menghilangkan framing.
- Roda pesawat tidak terlihat jelas dari chase cam belakang-atas
  (badan pesawat menyembunyikannya) — touchdown terbaca lewat strip +
  marka + HUD, bukan lewat roda itu sendiri.
- Matahari cover kini kuning hangat, bukan lagi putih terbakar — tapi
  tetap cakram besar di pojok; itu pilihan golden hour, bukan cacat.

## File yang berubah

- `game/src/shots.js` — state `landing` ditulis ulang (touchdown).
- `game/src/main.js` — objective landing di `applyShot` saat semua
  cincin dilewati.
- `game/src/sky.js` — intensitas cakram matahari 1,0→0,5, halo
  0,32→0,28.
- `game/src/aircraft.js` — radius A-pillar 0,05→0,04 m.
- `game/index.html` — topcenter <1280 px 230→320 px.
- `screenshots/*.jpg` — diregenerasi (shoot.mjs).
- `SCORECARD.md` — ronde 07.
- `BUILD_REPORT.md` — dokumen ini (menggantikan laporan v3).
