# BUILD REPORT — CAKRAWALA v5

Revisi pasca v4 (submission 01a21c97, ronde 3: **1.568/17.578, 56,0%** —
lompat dari v1 42,3%). Final **28 Nov 07:57 WIB**; v5 harus selesai malam
ini. v4 adalah entry final saat ini — bila v5 terbukti lebih jelek, parent
bisa memilih v4 lagi sebagai final — jadi v5 harus benar-benar lebih baik,
bukan sekadar berbeda. Disetujui user 27 Nov 2026 20:50 WIB ("Kerjakan
DealBeacon v2 + CAKRAWALA v5").

Dibangun di repo lokal yang sama, belum di-push, belum di-bundle, belum
di-submit — parent yang menangani langkah itu.

## Diagnosis (dari brief juri, bukan pola leaderboard)

Brief flight game (judge-briefs.md §1; juri z-ai/glm-5.3-flash, hanya
melihat contact sheet + outline 1.536 token), kriteria berurut:

1. Complete flight game, shown in screenshots.
2. Fun & depth: misi berbeda, fuel/damage yang mengubah sortie jadi
   keputusan.
3. Feel & polish: landing dan crash terbaca sebagai apa yang terjadi.
4. Look & originality.
5. Structure.

Yang v5 targetkan:

1. **Baris 2 mentok 7: depth hanya ada di kode.** Tester v4: "Depth
   tetap hanya di kode, tak terlihat di screenshot." Brief hanya
   menghitung yang TERLIHAT — fuel/damage/misi harus terbaca di frame.
2. **Baris 3 separuh kedua: crash.** v4 menutup landing (skor juri #3
   naik 3→4, SCORECARD baris 3 naik 7→8); crash belum pernah ada di
   shot manapun. Anchor baris 3 = 8: "landings/crashes read clearly".
3. **KECIL-1 warisan: A-pillar masih elemen paling dominan** di frame
   kokpit atas (~30 px/sisi di v4, terukur tester).

## Perubahan vs v4

### (a) SHOT CRASH — `game/src/shots.js`, `shots.json`, `game/src/main.js`

Frame `2-play.jpg` (mid-flight ring pass, misi 2) diganti `2-crash.jpg`.
Shot `crash` adalah **state crash sungguhan**, bukan pose yang dibuat-buat:

- `applyShot` kini memanggil jalur `crash()` yang asli (fase `'crashed'`,
  speed 0, `hud.showCrash(reason)`) bila `shot.crashed` diset — lalu
  modal overlay disembunyikan **hanya di shot mode** supaya bangkai
  pesawat tetap terlihat di frame (semangat yang sama dengan hint
  tutorial yang disembunyikan di shot mode). Di live play, `crash()`
  menampilkan modal seperti biasa.
- `applyShot` kini menerapkan `f.hits` dari state shot
  (`f.hits = a.hits ?? 0`) — sebelumnya hits selalu 0 di shot mode.
- **Crash banner (baru, `game/src/hud.js` + `game/index.html`):** strip
  merah persisten "MISI GAGAL — Menabrak tanah, pesawat hancur." yang
  muncul setiap kali fase `'crashed'` (digerakkan `hud.update()` dari
  fase + alasan crash yang disimpan `showCrash()`). Di live play banner
  ini berada di belakang modal crash (modal adalah feedback di sana) —
  tidak ada perubahan visual live play. Di shot mode (modal
  disembunyikan) banner inilah sinyal crash yang terbaca di atas
  bangkai. Ini UI sungguhan, bukan teks yang ditempel untuk screenshot.
- **Baling-baling berhenti saat crash di shot mode** (`main.js`,
  cabang shot-mode `simulate()`): prop hanya berputar bila fase
  `'flying'`. Live play sudah begitu (simulate() return lebih awal
  begitu fase meninggalkan `'flying'`) — shot mode kini konsisten.
- **`scripts/check.mjs` diperbarui:** loop shot kini mengharapkan fase
  `'crashed'` untuk shot `crash` (sebelumnya semua shot harus
  `'flying'` — check akan FAIL bila tidak diubah).

**Lokasi & pose — dua iterasi, keduanya dilihat langsung:**

1. *Iterasi 1 (DITOLAK):* lereng gunung di (-900,-600), antara cincin
   5–6, y = ground+4 lalu +3, pitch -0,3, roll 0,65. Terbaca sebagai
   **bank tajam di udara**, bukan bangkai: kamera chase terlalu
   jauh/tinggi untuk menunjukkan kontak tanah, dan SPD 0 di ALT 335 m
   terbaca sebagai fisika yang beku. Lereng curam (slope 0,89) membuat
   tanah jatuh menjauh di belakang pesawat.
2. *Iterasi 2 (DITERIMA):* dasar lembah di **(-400,-200)**, antara
   cincin 3 (-180,-40) dan cincin 4 (-480,-260), misi 2 Ridge Courier.
   Lantai lembah hampir datar (slope ~0,05, teras hijau), jadi bangkai
   bertumpu TERLIHAT di atas tanah. Pose: heading 0,94 (menuju cincin
   4), pitch -0,35, roll 0,75, y = ground+2, speed 0, throttle 0,
   fuel 0,09 (= LOW, merah), gearDown false, hits 3, ringsPassed 3/12,
   elapsed 96, skor 300. **Kamera shot-spesifik (baru):** `cameraDist`
   10 m / `cameraHeight` 3,2 m (default chase 16,5 m / 6,8 m tidak
   berubah) — pesawat cukup besar hingga kontak tanah terbaca.
   `updateCamera` membaca `game.shotMode?.cameraDist/cameraHeight`
   dengan fallback default; live play tidak tersentuh.

State crash terverifikasi di output check: phase `'crashed'`, mission
`ridge-courier`, (-400, 97,5, -200), speed 0, throttle 0, fuel 0,09,
heading 0,94, pitch -0,35, roll 0,75, ringsPassed 3/12, skor 300,
timeLeft 234, hits 3, onGround true.

### (b) KECIL-1 — A-pillar — `game/src/aircraft.js`

Radius strut 0,04 → **0,035 m** (material logam sama). Framing
dipertahankan — kedua strut tetap berjalan dari sudut atas panel ke
sudut atas frame. Terukur di 3-cockpit.jpg (scanline y=200):
**~26 px/sisi vs ~30 px di v4** (~13% lebih tipis, sesuai 0,04→0,035).

### (c) Yang TIDAK disentuh

Cover (1-cover.jpg), kokpit (3-cockpit.jpg, selain A-pillar), dan shot
touchdown (4-landing.jpg) — komposisi dan pose TIDAK diubah. Touchdown
v4 adalah pengungkit hasil 56%. Struktur 12 file src, 3 misi, fuel +
damage, vendor/makefun-game.ts, dimensi + pipeline screenshot (tetap
4 shot — `2-play.jpg` DIHAPUS dari folder; `main.ts` menolak entry
dengan >4 screenshot, jadi file lama itu wajib hilang).

## Verifikasi (semua pada kode final)

- `node scripts/check.mjs` — **PASSED** (boot, playtest misi 1, keempat
  shot: cover/cockpit/landing `'flying'`, crash `'crashed'`; 0 console
  error).
- `node scripts/shoot.mjs` — SHOTS DONE; keempat screenshot dilihat
  langsung:
  - **2-crash.jpg — CRASH TERBACA.** Bangkai Elang-7 besar di frame,
    bank ~43°, hidung menunduk, sayap bawah menancap ke teras; banner
    merah "MISI GAGAL — Menabrak tanah, pesawat hancur."; HUD: ALT
    97 m, SPD 0 km/h, HDG 306°, CINCIN 3/12, SKOR 300, "Misi 2 — Ridge
    Courier / Terbang melewati cincin 4/12", kompas "240 W 270 ▲ 300
    330" lengkap, THROTTLE 0, BAHAN BAKAR LOW (merah), GEAR UP, FLAP 0,
    **RUSAK 3/3**. Teras hijau + pohon + langit oranye — satu gaya
    dengan dunia game. Bukan lagi bank di udara.
  - **1-cover.jpg — utuh.** Runway + ring 1 + gunung + laut/pulau,
    pesawat besar, HUD ALT 100 m / SPD 346 km/h / HDG 000°, kompas
    lengkap, matahari kuning hangat (beda byte dari v4 hanya drift
    asap/awan — re-shoot tidak deterministik piksel, seperti v4).
  - **3-cockpit.jpg — framing utuh.** Panel v3 utuh (5 dial ber-bezel,
    ELANG-7, sekrup, stick + trigger merah), ATT level konsisten
    dengan horizon, kompas lengkap, A-pillar lebih tipis tapi tetap
    membingkai windscreen.
  - **4-landing.jpg — utuh.** Touchdown v4 tidak berubah: strip +
    marka threshold + lampu tepi, ALT 15 m, 198 km/h, -1,5 m/s,
    CINCIN 12/12, SKOR 1200, GEAR DN, FLAP 15, banner landing.
- **Determinisme:** `node main.ts` 2× ke /tmp/v5-det1 dan /tmp/v5-det2
  — `diff -r` **identik byte-per-byte**. Dossier: dossier.json
  521.414 byte, teks 109.666 byte (naik dari 106.740 — kode banner +
  shot crash), 4 screenshot, cover index 0, **tanpa jejak 2-play**.
- **Vendor:** `vendor/makefun-game.ts` sha256 `dc671875…` identik
  dengan kit starter.
- **Diff akhir diverifikasi:** `git diff` menyentuh hanya fungsi yang
  dimaksud — `applyShot` (hits + blok crash) dan cabang shot-mode
  `simulate()` (prop) di main.js; `shotState` + daftar SHOTS di
  shots.js; `showCrash` + `update()` di hud.js; `#crash-banner` di
  index.html; radius A-pillar di aircraft.js; loop shot di check.mjs;
  shots.json. (Pelajaran proses v4: edit dengan konteks unik —
  tidak ada edit yang mendarat di fungsi yang salah.)

## Skor (SCORECARD.md ronde 08, self-score builder — belum dikritik fresh)

| # | Kriteria juri (1–5) | v4 | v5 | Catatan |
|---|---|---|---|---|
| 1 | Game lengkap TERLIHAT | 4 | 4 | Cover/kokpit/landing utuh; crash menambah state keempat yang berbeda, bukan elemen game baru. |
| 2 | Fun & depth | 3 | **4** | Depth kini TERLIHAT: fuel LOW + RUSAK 3/3 + misi 2 + cincin 3/12 dalam satu frame crash — konsekuensi mekanik, bukan hanya kode. |
| 3 | Feel & polish | 4 | 4 | Touchdown sudah 4 di v4; crash menutup separuh kedua anchor-8 ("landings/crashes read clearly") — melengkapi, bukan menaikkan angka pada skala kasar 1–5. |
| 4 | Look & originality | 3 | 3 | A-pillar lebih tipis membantu, dunia tetap sama. |
| 5 | Struktur | 4 | 4 | 12 file satu-tugas-per-file, tak tersentuh. |

SCORECARD ronde 08: baris 2 naik 7→8, baris 3 naik 8→9 (landing +
crash keduanya terbaca jelas — anchor 10 "crashes unmistakable" belum
diklaim); min tetap 7 (baris 5, 7, 11, 12, 14).

## Sisa kelemahan (jujur, untuk tester / final)

- Baris 2 belum 10: hanya SATU misi yang kegagalannya terlihat; ketiga
  misi dengan tujuan berbeda tetap tidak semuanya terlihat di sheet;
  fuel/damage terlihat sebagai konsekuensi, bukan sebagai keputusan
  yang sedang dibuat.
- Cincin 4 tidak terlihat di frame crash (kamera lebih dekat/rendah) —
  cerita "mengejar cincin 4" hanya lewat baris objektif.
- Widget artificial horizon (tengah-bawah) sedikit menimpa ekor
  pesawat di frame crash — HUD DOM di atas scene 3D, kosmetik.
- ALT 97 m di frame crash adalah MSL (terrain ~95 m) — juri yang tak
  kenal terrain bisa salah baca SPD 0 di ALT 97 sebagai fisika beku;
  penangkalnya adalah banner + bangkai + RUSAK 3/3, semuanya ada di
  frame yang sama.
- A-pillar masih elemen paling dominan di frame kokpit atas (~26 px/
  sisi) — lebih tipis, bukan hilang. Menipiskan lagi berisiko
  menghilangkan framing.
- Iterasi 1 lokasi crash (lereng gunung) didokumentasikan di atas
  supaya tidak diulang: lereng curam + kamera chase jauh = bangkai
  terbaca sebagai bank di udara.

## File yang berubah

- `game/src/shots.js` — shot `play` → `crash` (lokasi lembah, pose
  bangkai, `crashed: true`, `cameraDist/cameraHeight`).
- `shots.json` — `2-play.jpg` → `2-crash.jpg`.
- `game/src/main.js` — `applyShot`: hits + blok crash; `simulate()`
  shot-mode: prop berhenti saat crash; `updateCamera`: override
  jarak/tinggi kamera per-shot.
- `game/src/hud.js` — `showCrash` menyimpan alasan; `update()`
  menampilkan `#crash-banner` saat fase `'crashed'`.
- `game/index.html` — div + CSS `#crash-banner`.
- `game/src/aircraft.js` — radius A-pillar 0,04→0,035 m.
- `scripts/check.mjs` — shot crash diharapkan fase `'crashed'`.
- `screenshots/2-crash.jpg` — baru; `screenshots/2-play.jpg` — dihapus.
- `screenshots/1-cover.jpg`, `3-cockpit.jpg`, `4-landing.jpg` —
  diregenerasi (beda byte hanya drift asap/awan).
- `SCORECARD.md` — ronde 08.
- `BUILD_REPORT.md` — dokumen ini (menggantikan laporan v4).
