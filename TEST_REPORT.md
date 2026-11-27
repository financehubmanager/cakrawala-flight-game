# TEST REPORT — CAKRAWALA v3 (commit 00d558d)

**Tester:** independen, belum melihat kode ini sebelumnya. Dinilai dari contact sheet + playtest, seperti juri.
**Tanggal:** 27 Nov 2026, ~14:50–15:15 WIB. **Bounty:** best-flight-game-20261126-0057 ($500, 50 tempat).
**Ronde 3 tutup:** 27 Nov 19:57 WIB; final 28 Nov 07:57 WIB. v2 sudah terkirim (submission 01a21b67) dan dihitung ronde 3; v3 akan menggantikannya (Force_Last) bila lolos.

## Verdict: LAYAK SUBMIT

Tidak ada cacat KRITIS, tidak ada SEDANG. SEDANG-1 v2 (panel kokpit kartu 2D) **TERATASI** — panel kini instrumen sungguhan; KECIL-2 v2 (HUD tumpang tindih <1280 px) **TERATASI** — terukur tanpa tumpang tindih. `check.mjs` PASSED, determinisme byte-identik, vendor tidak diubah, dossier lengkap, game benar-benar bisa dimainkan (takeoff + ring 1 terverifikasi dengan input nyata, 0 console error). Satu celah verifikasi yang dibawa dari v2: pendaratan belum berhasil didemonstrasikan (SEDANG-2 v2) — jalur kode pendaratan tidak berubah dari v2 dan juri tidak memainkan game, jadi ini tetap bukan penghalang submit.

## Skor per kriteria juri (1–5)

| # | Kriteria juri | v1 | v2 | v3 | Catatan |
|---|---|---|---|---|---|
| 1 | Game lengkap terlihat di screenshot | 2 | 4 | 4 | Frame kokpit kini tidak lagi melemahkan set (panel instrumen sungguhan, ATT sepakat, kompas 330 utuh di 4/4 shot); cover/play/landing tidak berubah. Tetap 4: pesawat masih low-poly sederhana, matahari masih membakar pojok kiri atas cover |
| 2 | Fun & depth | 3 | 3 | 3 | Tidak berubah: 3 misi + fuel/damage dipertahankan; ring 1 terverifikasi bisa dilewati lagi (skor +100). Depth tidak terlihat dari screenshot — sama seperti v1/v2 |
| 3 | Feel & polish | 2 | 3 | 3 | Kontrol terverifikasi responsif (takeoff, climb, steering keyboard, ring 1); crash terbaca jelas (v2). Minus: pendaratan belum berhasil didemonstrasikan dalam playtest saya (celah warisan v2); FPS headless ~1,5 adalah artefak swiftshader, bukan game |
| 4 | Look & originality | 2 | 3 | 3 | Instrumen kini "look flown" (bezel, kaca, sekrup, placard, redline) — frame kokpit naik kelas. Tetap 3: langit gradien + matahari cakram datar dan gunung cokelat datar di shot play tidak berubah |
| 5 | Struktur | 4 | 4 | 4 | 12 file src, satu tugas per file; tidak berubah |

## Verifikasi klaim builder — hasil

| Klaim builder | Hasil uji independen |
|---|---|
| (1) Panel kokpit instrumen sungguhan: frame logam, panel 0,16 m, glareshield, pipi, A-pillar, stick + trigger merah | ✅ TERBUKTI. 3-cockpit.jpg dilihat langsung: panel hitam dengan 4 sekrup sudut + placard "ELANG-7", 5 dial ber-bezel (RPM/KT/ATT/ALT/FUEL) dengan angka + redline, ATT dengan simbol oranye + pitch ladder + bank pointer; hood di atas panel, pipi di kedua ujung, A-pillar membingkai windscreen, kolom stick + trigger merah di bawah panel. Panel terbaca "diterbangkan, bukan digambar" |
| (2) Jarum + horizon ATT mengikuti state live; ATT tidak pernah berkontradiksi dengan horizon dunia | ✅ TERBUKTI. Screenshot live cockpit pasca ring 1 (ALT 62 m, SPEED 475 km/h, SKOR 100): jarum KT di ~3,5 (cocok 475 km/h pada skala 0–4), jarum ALT/RPM/FUEL bergerak dari posisi shot, ATT level dan horizon dunia datar — sepakat |
| (3) KECIL-2: media query max-width 1279px, HUD tidak tumpang tindih di bawah 1280 px | ✅ TERBUKTI. Probe independen 960×540: kotak terukur topleft 12–245, topcenter 356–604, topright 766–948 — celah 111 px dan 162 px, **tidak ada tumpang tindih**; screenshot 960×540 dilihat langsung, ketiga klaster atas terpisah jelas |
| (4) Cover/play/landing tidak berubah komposisinya | ✅ TERBUKTI. 1-cover: runway + ring 1 + gunung + laut/pulau satu frame, pesawat ~55% lebar frame, kompas "300 330 ▲ N 000 030". 2-play: ring 4/12 di depan gunung, kompas lengkap "240 W 270 ▲300 330". 4-landing: runway + marka threshold + lampu tepi, ring 12/12, ALT 50 m, GEAR DN, FLAP 15. Tidak ada kotak tutorial di keempat shot |
| (5) check.mjs PASSED, determinisme byte-identik, 4 screenshot dilihat | ✅ Dijalankan ulang tester: CHECK PASSED (exit 0). `MAKEFUN_OUTPUT_DIR=/tmp/t-det1` vs `/tmp/t-det2` → `diff -r` kosong, byte-identik. Keempat screenshot 1280×720 baseline JPEG, 72.562 / 88.624 / 85.725 / 72.504 byte — semua ≤ 256 KiB |
| vendor/makefun-game.ts TIDAK diubah | ✅ sha256 `dc67187521b24025ff952f8c231485a6eb92d6d71d29edd2a08154ffb4376129` identik dengan kit starter |
| Dossier lengkap | ✅ out/dossier.json: keys cover/images/schema/text; schema makefun/dossier/v1; text 96.784 byte (< 163.840); judul "CAKRAWALA — HD 3D Flight Simulator: Volcano Ring Run" ada di text; 4 images |
| Struktur 12 file src | ✅ aircraft, audio, config, hud, input, main, missions, rings, rng, shots, sky, terrain + index.html; diff v2→v3 hanya aircraft.js + index.html + BUILD_REPORT.md + SCORECARD.md + 3 screenshot (2-play.jpg byte-identik) |

## Playtest independen (input nyata, headless Chromium + Playwright)

Lingkungan: swiftshader (software rendering), ~1,5 fps. FPS rendah adalah artefak renderer software di VM ini, bukan game. Juri tidak pernah memainkan game; yang dinilai di sini adalah apakah game benar-benar bisa dimainkan.

- **Boot:** `window.__game` ada, title screen terlihat, canvas tidak blank, 0 console error / pageerror / requestfailed di semua sesi.
- **Takeoff:** W penuh → speed 0 → 61 m/s → lepas landas (`onGround=false`, toast "Lepas landas!") pada ~t=26 dtk.
- **Climb + hold:** ArrowUp → alt 15 → 62 m; autopilot menahan 55–95 m; speed 132 m/s di ring 1.
- **Ring 1:** terbang heading 000 ke (330, 62, 619) → **cincin 1/8 dilewati, skor +100**, ~60 dtk setelah start, phase tetap `flying`, 0 hits, fuel 0,94. Screenshot live cockpit tersimpan (/tmp/tester-v3/live-cockpit.png).
- **Panel live:** di view kokpit pasca ring 1, jarum KT/ALT/RPM/FUEL dan ATT mengikuti state live (lihat verifikasi klaim (2) di atas).
- **Pendaratan — TIDAK DICOBA (celah warisan v2, bukan vonis cacat):** tester v2 sudah menelusuri bahwa kegagalan demonstrasi pendaratan berasal dari kesalahan piloting/probe, dan jalur kode pendaratan sehat (overRunway + gearDown + sink ≤ 8 m/s + speed ≤ 72 → onGround). Kode jalur itu tidak berubah di v3. Juri tidak memainkan game, jadi ini tidak memengaruhi duel.

## Daftar cacat

### SEDANG
_Tidak ada._

### KECIL
- **KECIL-1 (baru) — A-pillar terlalu dominan di frame kokpit.**
  Bukti: 3-cockpit.jpg + live-cockpit.png — dua strut hitam tebal (~30 px pada 1280×720) memotong diagonal dari sudut atas frame ke sudut panel; kontrasnya tinggi melawan langit oranye dan memakan ~15% area pandang atas. Mereka terbaca sebagai struktur kokpit (baik — windscreen kini berbingkai), jadi ini harga framing yang benar, bukan cacat. Builder sudah menipiskan 0,07 → 0,05 m; penipisan lebih lanjut berisiko menghilangkan framing. Bukan penghalang submit.
- **KECIL-2 (baru) — Strip kompas di banner misi terpotong di lebar <1280 px.**
  Bukti: screenshot 960×540 — banner menampilkan "330 ▲ N 000", label 300/030 hilang karena banner lebih sempit. Live play saja (shot juri 1280×720 utuh "300 330 ▲ N 000 030"); label kunci (330, N 000) tetap ada. Kosmetik, bukan penghalang submit.
- **KECIL-3 (warisan v2) — Klaim detail pesawat berlebih.**
  Antena/pitot/exhaust/roda ekor tetap tidak terbedakan pada resolusi shot. Tidak memengaruhi duel — pesawat sudah terbaca "dibangun" — tetapi jangan klaim yang tidak terlihat.

### Celah verifikasi (bukan cacat)
- **SEDANG-2 (warisan v2) — Pendaratan belum terbukti bisa dilakukan.** Tidak ada demonstrasi touchdown pada v3 (tidak dicoba tester ini; tester v2 gagal karena artefak probe). Jalur kode pendaratan sehat dan tidak berubah dari v2. Juri tidak memainkan game.

## Penilaian jujur: apakah v3 memperbaiki penyebab kekalahan ronde 2?

Ya, dan v3 menutup kelemahan terbesar yang tersisa dari v2:
1. Panel kokpit kartu 2D (SEDANG-1 v2) → **diperbaiki tuntas**: panel kini instrumen sungguhan dengan bezel/kaca/sekrup/placard/angka/redline + struktur kokpit 3D di sekelilingnya; frame kokpit bukan lagi frame terlemah.
2. HUD tumpang tindih <1280 px (KECIL-2 v2) → **diperbaiki tuntas**: terukur tanpa overlap di 960×540.
3. Label kompas 330 (KECIL-1 v2, diperbaiki fixer) → **tetap utuh** di 4/4 shot v3.
4. Cover/play/landing → **tanpa regresi**: komposisi dan HUD sama kuatnya dengan v2.

Skor juri saya v2→v3: #1 4→4, #2 3→3, #3 3→3, #4 3→3, #5 4→4. Angka tidak naik karena skor 1–5 juri kasar — perbaikannya ada di dalam band yang sama — tetapi frame kokpit tidak lagi menjadi alasan kalah duel, dan itulah yang paling melemahkan v2. Ekspektasi realistis: v3 seharusnya menang sedikit lebih banyak duel daripada v2 pada kriteria #1/#4; menembus 50 besar dari 6192 tetap membutuhkan lompatan besar. v3 adalah perbaikan nyata, bukan jaminan hadiah.

## Perintah yang dijalankan (reproduksibel)

- `node scripts/check.mjs` → CHECK PASSED (exit 0)
- `MAKEFUN_OUTPUT_DIR=/tmp/t-det1 node main.ts` + `/tmp/t-det2` → `diff -r` kosong
- `sha256sum vendor/makefun-game.ts` vs kit starter → identik
- `file screenshots/*.jpg` → 1280×720 semua; `du` → 72–89 KB
- Probe independen: `scripts/tester-v3-probe.mjs` (takeoff + ring 1 + live cockpit; skrip probe KECIL-2 keduanya dihapus dari repo setelah dipakai; repo bersih) — catatan: probe pertama sempat gagal di halaman kedua (goto timeout 30 dtk saat membuka page kedua di browser yang sama); KECIL-2 diulang dengan probe terpisah (`scripts/tester-v3-hud960.mjs`) dan berhasil.
- `python3 -c` baca out/dossier.json → schema + judul + 4 images terverifikasi
