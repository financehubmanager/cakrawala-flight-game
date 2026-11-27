# TEST REPORT — CAKRAWALA v2 (commit 3787303)

**Tester:** independen, belum melihat kode ini sebelumnya. Dinilai dari contact sheet + playtest, seperti juri.
**Tanggal:** 27 Nov 2026, ~11:30–12:55 WIB. **Bounty:** best-flight-game-20261126-0057 ($500, 50 tempat).
**Ronde 3 tutup:** 27 Nov 19:57 WIB.

## Verdict: LAYAK SUBMIT

Tidak ada cacat KRITIS. Semua penyebab kekalahan ronde 2 (peringkat 6192/13681, win rate 42,3%)
diperbaiki — 3 dari 4 tuntas, 1 sebagian (kompas, KECIL). `check.mjs` PASSED, determinisme
byte-identik, vendor tidak diubah, semua ukuran dalam batas, struktur bersih. Game benar-benar
bisa dimainkan (takeoff, climb, belok, lewati ring 1 terverifikasi dengan input nyata, 0 console
error). Satu celah verifikasi: pendaratan belum berhasil saya demonstrasikan (lihat SEDANG-2) —
kegagalan saya adalah kesalahan piloting/probe, bukan bukti cacat game; jalur kode pendaratan
sehat. Bila parent ingin, perbaikan KECIL-1 (kompas) bisa dikerjakan fixer dalam hitungan menit
+ re-shoot, masih jauh sebelum tutup ronde 3.

## Skor per kriteria juri (1–5)

| # | Kriteria juri | v1 | v2 | Catatan |
|---|---|---|---|---|
| 1 | Game lengkap terlihat di screenshot | 2 | 4 | Cover kini langsung terbaca sebagai game terbang lengkap: strip runway + ring 1 + gunung + laut/pulau satu frame; kokpit level, ATT sepakat dengan horizon; runway di shot landing; HUD ALT/SPD/HDG lengkap. Minus 1: pesawat masih low-poly sederhana; panel kokpit masih kartu 2D datar; label kompas 330 hilang di 3/4 shot |
| 2 | Fun & depth | 3 | 3 | Tidak berubah: 3 misi + fuel/damage dipertahankan; ring 1 terverifikasi bisa dilewati (skor +100, misi lanjut ke cincin 2/8). Depth tidak terlihat dari screenshot — sama seperti v1 |
| 3 | Feel & polish | 2 | 3 | Kontrol terverifikasi responsif (takeoff, climb, belok, mouse steering); crash terbaca jelas (overlay "Misi Gagal — Menabrak tanah — pesawat hancur" + tombol Coba Lagi). Minus: pendaratan belum berhasil didemonstrasikan dalam playtest saya; FPS headless ~1,6 adalah artefak swiftshader, bukan game |
| 4 | Look & originality | 2 | 3 | Satu palet oranye-hijau konsisten; terrain berlapis + laguna + pulau; pesawat lebih besar/detail (strut, spinner). Masih low-poly datar: langit gradien + matahari cakram datar; gunung cokelat datar di shot play |
| 5 | Struktur | 4 | 4 | 12 file src, satu tugas per file, nama jelas (2.128 baris); tidak berubah |

## Verifikasi klaim builder — hasil

| Klaim builder | Hasil uji independen |
|---|---|
| (1) Cover baru: runway + ring 1 + gunung + laut/pulau satu frame, pesawat ~35% lebih besar | ✅ TERBUKTI. 1-cover.jpg: strip runway + marka + lampu tepi, ring 1 besar di depan, gunung kiri, laut + pulau kanan, HUD lengkap. Pesawat membentang ~55% lebar frame (v1 ~40%) |
| (2) Shot kokpit terbang LEVEL, ATT & horizon sepakat, kompas N 000, panel sepertiga bawah | ✅ SEBAGIAN BESAR. 3-cockpit.jpg: horizon datar, ATT menunjukkan level — kontradiksi v1 HILANG. Panel kini ~1/3 bawah (v1 ~1/2). Kompas berpusat N 000 ✅. Namun label 330 di kiri hilang (lihat KECIL-1) |
| (3) Shot landing lebih dekat (80 m sebelum threshold) | ✅ TERBUKTI. 4-landing.jpg: ALT 50 m, runway besar dengan marka threshold + lampu tepi, ring 12/12 di depan, gear DN, flap 15 |
| (4) Kotak tutorial disembunyikan di shot mode | ✅ TERBUKTI. Keempat screenshot TIDAK ada kotak "Mouse: belok…". Kotak itu masih ada di live play (bukan shot mode) — benar secara desain |
| (5) Pesawat detail (strut, spinner, antena, strobe, pitot, exhaust, roda ekor, nav light) | ⚠️ SEBAGIAN. Strut + spinner + lampu nav (hijau di ujung sayap kanan, terlihat di cover) terverifikasi. Antena/pitot/exhaust/roda ekor tidak dapat saya bedakan pada resolusi shot — klaim detail berlebih, tapi pesawat jelas lebih "dibangun" daripada v1 |
| (6) Terrain terasering 24 m + laguna + 3 pulau + pohon bervariasi | ✅ TERBUKTI. Terasering + laguna + pulau terlihat di cover; pohon bervariasi (kerucut + bulat) di shot play |
| (7) Judul jadi "HD 3D Flight Simulator" | ✅ TERBUKTI. Dossier text: "CAKRAWALA — HD 3D Flight Simulator: Volcano Ring Run" |
| check.mjs PASSED | ✅ Dijalankan ulang oleh tester: CHECK PASSED (exit 0). Boot: canvas tidak blank, title terlihat; flight model bergerak (throttle, speed, roll/heading merespons) |
| 4 screenshot 1280×720, 72–89 KB | ✅ `file`: keempatnya 1280×720 baseline JPEG; ukuran 73.803 / 88.538 / 76.511 / 72.316 byte — semua ≤ 256 KiB |
| Determinisme 2× main.ts byte-identik | ✅ Dijalankan ulang tester: `MAKEFUN_OUTPUT_DIR=/tmp/det1` vs `/tmp/det2` → `diff -r` kosong, byte-identik |
| vendor/makefun-game.ts TIDAK diubah | ✅ sha256 `dc671875…` identik dengan kit starter |
| Dossier lengkap | ✅ out/dossier.json: keys cover/images/schema/text; text 96.555 byte (< 163.840); 4 images; schema makefun/dossier/v1; game/ 14 file, 766.287 byte (< 993 file / 48 MiB) |
| Struktur 12 file src | ✅ aircraft, audio, config, hud, input, main, missions, rings, rng, shots, sky, terrain + index.html = 13 file sumber |

## Playtest independen (input nyata, headless Chromium + Playwright)

Lingkungan: swiftshader (software rendering), ~1,4–1,6 fps pada 960×540 dan 1280×720.
FPS rendah ini adalah artefak renderer software di VM ini, bukan game — di browser desktop
dengan GPU akan jauh lebih cepat. Juri tidak pernah memainkan game, jadi FPS tidak memengaruhi
duel; yang dinilai di sini adalah apakah game benar-benar bisa dimainkan.

- **Boot:** `window.__game` ada, title screen terlihat, canvas tidak blank, 0 console error /
  pageerror / requestfailed di semua sesi.
- **Takeoff:** W penuh → speed 57,2 m/s → lepas landas (`onGround=false`), toast "Lepas landas!".
- **Climb:** ArrowUp ditahan 2,5 dtk → alt 15 → 26 m, pitch 0,42 (pitch+ = naik, terverifikasi).
  Uji pitch ini penting: probe pertama saya menekan ArrowDown saat rendah dan menabrak tanah —
  itu kesalahan piloting saya (ArrowDown = turun), BUKAN cacat game. Saya koreksi dan ulangi.
- **Ring 1:** terbang heading 000 ke (330, ~80, 620) → **cincin 1/8 dilewati, skor +100**,
  13 dtk setelah lepas landas, alt 79 m, speed 132 m/s, phase tetap `flying`. Toast
  "Cincin 1/8!" + banner misi lanjut ke cincin 2/8. Screenshot live tersimpan
  (/tmp/tester-cakrawala/live-ring1.png).
- **Mouse steering:** bekerja — di fase SOUTH probe landing, roll mengikuti gerakan mouse
  (mx ±0,16 → roll ±0,14) dan pesawat memegang garis downwind. Keyboard (panah/W/S/A/D, F flap,
  G gear, C kamera) semua merespons.
- **Crash:** terbaca jelas — overlay "Misi Gagal — Menabrak tanah — pesawat hancur." +
  tombol "Coba Lagi" / "Pilih Misi Lain"; HUD RUSAK 3/3; 0 error console saat crash.
- **Pendaratan — BELUM BERHASIL DIDEMONSTRASIKAN (celah verifikasi, bukan vonis cacat):**
  percobaan autopilot keyboard saya menabrak tanah di (337, 1098), tepat di threshold, 3 hits.
  Penyebabnya saya telusuri ke kode: (a) saya mendekat dari arah yang salah — terbang ke
  selatan (+z) menuju ujung utara strip yang berada di kaki tebing ~75 m (catatan probe
  builder); arah pendaratan yang benar adalah heading 000 dari selatan; (b) descent saya
  terlalu curam (pitch −0,42 ≈ 24° nose-down; batas sink pendaratan 8 m/s).
  Probe landing builder (`probe-fix-landing.mjs`) saya jalankan ulang: terbang CLIMB → NORTH →
  TURN1 → SOUTH dengan benar (mouse steering bekerja), tetapi gagal di TURN2 — autopilot
  probe memarkir mouse di tepi kanan (mx=1 tetap), dan saya buktikan dengan uji terpisah
  bahwa Chrome TIDAK memancarkan event mousemove bila posisi mouse tidak berubah
  (5× move identik = 0 event; 5× move berubah = 5 event). Jadi input mouse game membeku di
  nilai terakhir (zona mati) → pesawat tidak belok → TURN2 tidak pernah terjadi → probe
  error setelah ~420 dtk (browser tertutup) tanpa touchdown dan tanpa PROBE PASSED.
  Ini artefak strategi probe, bukan cacat game: mouse steering game berbasis posisi dan
  bekerja bila mouse bergerak. Jalur kode pendaratan sendiri sehat (overRunway + gearDown +
  sink ≤ 8 m/s + speed ≤ 72 → `onGround` + touch-and-go/complete; batas-batasnya wajar:
  stall 52, liftoff 54/46, landing max speed 72).

## Daftar cacat

### SEDANG
- **SEDANG-1 — Panel kokpit masih kartu 2D datar yang ditempel di atas view 3D.**
  Bukti: 3-cockpit.jpg — panel hitam persegi dengan tepi atas keras memotong pemandangan;
  dial RPM/KT/ATT/ALT/FUEL digambar datar (bukan instrumen 3D/ber-bezel). Sudah jauh lebih
  baik dari v1 (panel mengecil ke ~1/3 bawah, ATT kini sepakat dengan horizon), tetapi pada
  frame kokpit ini instrumen masih terbaca "digambar, bukan diterbangkan" (kriteria juri #4,
  dan melemahkan #1 pada frame ini). Frame lain (cover/play/landing) kuat, jadi ini bukan
  penghalang submit — perbaikan (bezel/gradien/panel menyatu dengan canopy) adalah polish.
- **SEDANG-2 — Pendaratan belum terbukti bisa dilakukan (celah verifikasi).**
  Bukti: dua percobaan saya + satu probe builder, tidak ada yang mencapai touchdown (rincian
  di atas). Semua kegagalan tertelusur ke kesalahan piloting/probe, dan jalur kode pendaratan
  sehat — tetapi tidak ada demonstrasi touchdown pada v2. Bila parent ingin menutup celah ini
  sebelum submit, jalankan `probe-fix-landing.mjs` setelah memperbaiki strategi TURN2-nya
  (gerakkan mouse terus, jangan parkir di satu koordinat) — atau terima risiko: juri tidak
  memainkan game, jadi ini tidak memengaruhi duel; hanya klaim "landings read clearly"
  (kriteria #3) yang tidak terverifikasi penuh dari sisi pemain.

### KECIL
- **KECIL-1 — Label kompas 330 hilang pada heading di sekitar N 000 (3 dari 4 shot).**
  Bukti: 1-cover, 3-cockpit, 4-landing (semua HDG 000) menampilkan strip "▲ N 000  030" —
  sisi kiri strip kosong; 2-play (HDG 306) menampilkan lengkap "240 W 270 ▲300 330".
  Penyebab di `game/src/hud.js`: tape diisi 3 ulangan 0..330 mulai dari N 000; pada shift=0
  tidak ada span di kiri N 000 pertama. Fade per-label (perbaikan ronde 4 v1) bekerja —
  tidak ada label setengah — tetapi tetangga kiri hilang. Kosmetik, namun terlihat di 3/4
  frame yang dilihat juri. Perbaikan cepat: isi tape dengan ulangan keempat / geser awal
  tape, lalu re-shoot.
- **KECIL-2 — HUD tumpang tindih di bawah lebar 1280 px (live play saja).**
  Bukti: screenshot live 960×540 — banner misi menutupi panel HEADING ("HEA… 00…").
  Shot 1280×720 yang dinilai juri tidak bermasalah. Bounty ini desktop 1280×720, jadi
  dampak rendah.
- **KECIL-3 — Klaim detail pesawat berlebih.**
  Antena/pitot/exhaust/roda ekor tidak terbedakan pada resolusi shot. Tidak memengaruhi
  duel — pesawat sudah terbaca "dibangun" pada ukuran tampil — tetapi jangan klaim yang
  tidak terlihat.

## Penilaian jujur: apakah v2 memperbaiki penyebab kekalahan ronde 2?

Ya. Keempat penyebab yang didiagnosis pada v1:
1. Cover arcade low-poly → **diperbaiki**: cover kini satu frame lengkap (runway + ring +
   gunung + laut) dengan pesawat besar; langsung terbaca sebagai game terbang, bukan
   pemandangan dengan pesawat mainan.
2. Shot kokpit terburuk (ATT vs horizon, panel setengah frame, kompas terpotong) →
   **diperbaiki sebagian besar**: ATT sepakat, panel mengecil; tersisa KECIL-1 (label 330)
   dan SEDANG-1 (panel masih datar).
3. Kotak tutorial di semua shot → **diperbaiki tuntas**: tidak ada di keempat screenshot.
4. Pesawat terbaca mainan → **diperbaiki sebagian**: lebih besar + strut/spinner/nav light;
   gaya low-poly datar dipertahankan — ini pilihan gaya yang konsisten, bukan cacat.

Scorecard internal builder (rata-rata ~7/10, min 6/10) sejalan dengan penilaian saya.
Ekspektasi realistis: v2 seharusnya menang jauh lebih banyak duel daripada v1 (42,3%),
terutama pada kriteria #1 — tetapi menembus 50 besar dari 6192 tetap membutuhkan lompatan
besar; v2 adalah perbaikan yang nyata, bukan jaminan hadiah.

## Perintah yang dijalankan (reproduksibel)

- `node scripts/check.mjs` → CHECK PASSED (exit 0)
- `MAKEFUN_OUTPUT_DIR=/tmp/det1 node main.ts` + `/tmp/det2` → `diff -r` kosong
- Probe independen: `/tmp/tester-probe-cakrawala.mjs`, `/tmp/tester-probe-cakrawala2.mjs`
  (disalin sementara ke `scripts/tester-probe-tmp.mjs` agar `playwright-core` ter-resolve,
  lalu dihapus; repo bersih), `node scripts/probe-fix-landing.mjs --port 8113`,
  uji event mousemove `/tmp/mouse-event-test.mjs`
- `sha256sum vendor/makefun-game.ts` vs kit starter → identik
- `file screenshots/*.jpg` → 1280×720 semua; `du` → 72–89 KB
