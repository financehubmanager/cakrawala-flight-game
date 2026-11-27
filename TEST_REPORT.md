# TEST REPORT — CAKRAWALA v5 (independent)

Tester independen. Repo lokal `~/workspace/cakrawala-flight-game/`, commit
yang diuji **27730ca** ("v5: crash shot (2-crash.jpg) + crash banner +
A-pillar 0.035; check PASSED, determinism byte-identical"). Kit
`~/workspace/makefun/kit/`. Brief juri: judge-briefs.md §1 + RULES.txt
(juri z-ai/glm-5.3-flash, hanya melihat contact sheet + outline 1.536
token; kriteria berurut: 1) game lengkap TERLIHAT, 2) fun & depth, 3) feel
& polish — landing DAN crash terbaca, 4) look & originality, 5) structure).

## Verdict: LAYAK SUBMIT

**0 KRITIS, 0 SEDANG, 5 KECIL** (semua kosmetik / catatan, jangan diperbaiki
malam ini — final 28 Nov 07:57 WIB, risiko > manfaat).

## 1. check.mjs — PASSED (dijalankan sendiri)

`node scripts/check.mjs` → **CHECK PASSED**, 0 console error. Keempat shot
terverifikasi dengan fase yang diharapkan masing-masing:

- `SHOT cover` — phase `flying`, ring-run, (344, 100.4, 1120), speed 96.
- `SHOT crash` — phase **`crashed`**, ridge-courier, (-400, 97.5, -200),
  speed 0, throttle 0, fuel 0.09, heading 0.94, pitch -0.35, roll 0.75,
  ringsPassed 3/12, score 300, timeLeft 234, **hits 3, onGround true**.
- `SHOT cockpit` — phase `flying`, (330, 134.5, 1180), speed 92.
- `SHOT landing` — phase `flying`, (330, 15, 1040), speed 55, 12/12,
  score 1200, onGround true.

**Perubahan check.mjs TIDAK melemahkan check** (diperiksa via `git diff
ff24c66..27730ca`): loop shot kini mengharapkan fase per-shot
(`crash → 'crashed'`, lainnya `'flying'`) — lebih ketat dari v4 yang
menuntut `'flying'` untuk semua. Diff `main.js` juga terkonfirmasi
terbatas pada yang dimaksud: `applyShot` (hits + blok `if (shot.crashed)
crash(...)`), override kamera per-shot via `game.shotMode?.cameraDist/
cameraHeight` (live play tidak tersentuh — fallback default), dan
cabang shot-mode `simulate()` (prop hanya berputar bila fase
`'flying'`). Blok crash memanggil jalur `crash()` yang asli, bukan pose
palsu.

## 2. Determinisme + vendor — TERKONFIRMASI SENDIRI

- `main.ts` 2× ke `/tmp/v5-tdet1` dan `/tmp/v5-tdet2` → `diff -r`
  **identik byte-per-byte**. Dossier **521.414 byte** (klaim builder
  cocok), teks naik 106.740 → 109.666 byte (kode banner + shot crash).
- `grep -c "2-play"` pada dossier = **0**; `2-crash` ada. Tidak ada jejak
  shot lama.
- `vendor/makefun-game.ts` sha256 **`dc671875…` = kit starter**. Tidak
  disentuh.

## 3. Screenshot — DILIHAT LANGSUNG (keempatnya)

### 2-crash.jpg — CRASH TERBACA ✓ (ini yang diuji paling keras)

Bangkai Elang-7 besar di frame, bank ~43°, hidung menunduk, sayap bawah
menancap ke teras hijau — kontak tanah TERLIHAT (kamera 10 m / 3,2 m,
bukan chase 16,5 m). Empat sinyal independen mendukung satu bacaan yang
sama: banner merah **"MISI GAGAL — Menabrak tanah — pesawat hancur."**,
HUD **SPD 0 km/h** + **RUSAK 3/3** + **BAHAN BAKAR LOW (merah)** +
THROTTLE 0, kompas lengkap "240 W 270 ▲ 300 330", objektif "Misi 2 —
Ridge Courier / Terbang melewati cincin 4/12", CINCIN 3/12, SKOR 300,
WAKTU 03:54. Baling-baling berhenti (tidak ada blur). Bukan lagi mode
kegagalan iterasi 1 builder (bank tajam di udara) — kamera dekat/rendah
+ sayap di tanah + SPD 0 menutupnya. Teras hijau + pohon + langit oranye
satu gaya dengan dunia game.

Sisa ambiguitas (lihat KECIL-2/3/4): ALT 97 m (MSL, lantai lembah
~95 m) dan widget horizon yang menimpa ekor.

### 1-cover.jpg — UTUH ✓

Runway + ring 1 di depan + gunung + laut/pulau dalam satu frame,
pesawat besar, HUD ALT 100 m / SPD 346 km/h / HDG 000°, kompas lengkap,
matahari kuning hangat. Sama dengan v4 (beda byte hanya drift asap/awan).

### 3-cockpit.jpg — UTUH, A-pillar terukur ✓

Panel v3 utuh (5 dial ber-bezel, placard ELANG-7, sekrup, stick + trigger
merah), ATT level konsisten dengan horizon, kompas lengkap, HUD ALT
134 m / SPD 331 km/h / HDG 000°. **A-pillar diukur sendiri** (scan
pixel, piksel gelap <60 RGB): lebar visual total per sisi **~26–28 px**
(y=80: 28 px, y=200: 27 px, y=240: 26 px) vs ~30 px di v4 — klaim
builder "~26 px" terkonfirmasi (dua run gelap per sisi: strut + tepi/
highlight). Masih elemen paling dominan di atas frame (KECIL-1 warisan).

### 4-landing.jpg — UTUH ✓

Touchdown v4 tidak berubah: strip + marka threshold + lampu tepi,
pesawat tepat di atas marka, HUD ALT 15 m / 198 km/h / -1,5 m/s /
GEAR DN / FLAP 15 / CINCIN 12/12 / SKOR 1200, banner "Semua cincin
dilewati — mendarat di landasan!".

## 4. Playtest live — headless Chromium (probe-tester-v5.mjs)

Probe baru `scripts/probe-tester-v5.mjs` (Playwright, Chromium 1254,
`--use-angle=swiftshader`): **ERRORS(0), FINDINGS(0)**.

- **Fase A — HUD 960×540, keempat shot:** tidak ada overlap klaster atas
  di semua shot; kompas lengkap di semua shot (crash: "240 W 270 300
  330"; lainnya "300 330 N 000 030"). Shot crash: banner **display=block,
  w=507** dengan teks benar; modal crash **display=none** (tersembunyi
  hanya di shot mode, seperti yang diklaim). Banner tersembunyi di
  ketiga shot lain.
- **Fase B — ring 1 live:** **RING 1 PASSED t=35.2s** (y=58.6, z=614,
  speed 64, liftoff 10.5 s, hits 0, score 100) — controller in-page
  dengan keyboard event sungguhan, sama seperti v4.
- **Fase C — jalur crash LIVE (baru, kunci v5):** sortie sengaja
  diterbangkan menukik ke terrain → **phase `crashed`, speed 0, hits 3,
  score 0**. Banner crash **display=block** dengan teks benar DAN modal
  crash **display=flex (TERLIHAT)** di live play. Jadi: shot crash
  adalah state game sungguhan (fase `crashed` dari `crash()` yang sama),
  bukan pose palsu — dan perubahan v5 TIDAK membocorkan penyembunyian
  modal ke live play.

## 5. Skor mandiri per kriteria brief (1–5)

| # | Kriteria | v4 | v5 | Alasan |
|---|---|---|---|---|
| 1 | Game lengkap TERLIHAT | 4 | 4 | Cover/kokpit/landing utuh; crash menambah state keempat yang berbeda, bukan elemen game baru. |
| 2 | Fun & depth | 3 | **4** | Depth kini TERLIHAT: fuel LOW + RUSAK 3/3 + misi 2 + cincin 3/12 dalam satu frame crash — konsekuensi mekanik, bukan hanya kode. (Satu misi saja; ketiga misi tetap tidak semuanya terlihat.) |
| 3 | Feel & polish | 4 | 4 | Touchdown sudah 4 di v4; crash menutup separuh kedua anchor ("landings/crashes read clearly") — melengkapi, bukan menaikkan angka pada skala kasar 1–5. |
| 4 | Look & originality | 3 | 3 | A-pillar lebih tipis membantu sedikit; dunia tetap sama. |
| 5 | Struktur | 4 | 4 | 12 file satu-tugas-per-file, tak tersentuh. |

Catatan jujur: klaim builder "baris 3 naik 8→9" di SCORECARD adalah
self-score; pada skala juri 1–5 saya menahannya di 4 karena frame crash
masih punya nits (KECIL-2/3). Yang penting: v5 tidak lebih jelek dari
v4 di kriteria mana pun, dan naik satu poin di #2 — persis celah yang
ditargetkan brief.

## 6. Cacat (semua KECIL — jangan perbaiki malam ini)

- **KECIL-1 (warisan v4, membaik):** A-pillar masih elemen paling dominan
  di atas frame kokpit (~26–28 px/sisi, dari ~30 px). Menipiskan lagi
  berisiko menghilangkan framing windscreen. Jangan kejar.
- **KECIL-2 (baru, residual):** ALT 97 m di frame crash bisa salah baca
  sebagai "fisika beku di ketinggian" bagi juri yang tak kenal terrain
  (lantai lembah ~95 m MSL). Penangkalnya ada di frame yang sama
  (banner + sayap di tanah + SPD 0 + RUSAK 3/3); memperbaikinya butuh
  mengubah terrain — di luar scope malam ini.
- **KECIL-3 (baru):** widget artificial horizon (tengah-bawah) sedikit
  menimpa ekor pesawat di 2-crash.jpg. HUD DOM di atas scene 3D,
  kosmetik.
- **KECIL-4 (baru):** cincin 4 tidak terlihat di frame crash (kamera
  lebih dekat/rendah); cerita "mengejar cincin 4" hanya lewat baris
  objektif.
- **KECIL-5 (observasi, internal saja):** setelah crash live
  (terrain impact), state menunjukkan `onGround=false`, sedangkan
  state shot crash `onGround=true`. Tidak terlihat juri (banner +
  modal tampil benar); catat saja untuk builder berikutnya.
- Diwarisi dari v4, tidak berubah: roda tidak terlihat jelas di shot
  landing (chase cam dari belakang-atas).

## 7. Yang TIDAK diuji

- Bundle `makefun check` + submit (di luar tugas tester; parent yang
  menangani). Dossier sudah byte-identical dan vendor utuh, jadi tidak
  ada sinyal masalah di sisi itu.
- Final heat / penilaian juri sesungguhnya (tidak bisa diuji lokal).

## Ringkasan untuk parent

v5 LAYAK SUBMIT. Crash shot adalah state `crashed` sungguhan —
terverifikasi lewat check.mjs, screenshot langsung, DAN playtest live
(terrain impact → `crashed` + banner + modal tampil). v4 utuh di
ketiga frame lain. Satu-satunya kenaikan skor yang saya berikan adalah
kriteria #2 (3→4); #3 tetap 4. Tidak ada cacat yang membenarkan fixer
sebelum final 07:57 WIB — submit apa adanya.
