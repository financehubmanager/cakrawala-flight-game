# FIX REPORT — CAKRAWALA v2 (KECIL-1)

**Fixer:** 27 Nov 2026, ~12:00 WIB. **Dasar:** TEST_REPORT.md (commit 8d01ad3) —
verdict LAYAK SUBMIT, 0 KRITIS, 2 SEDANG, 3 KECIL.
**Tugas:** hanya KECIL-1. SEDANG-1 (panel kokpit kartu 2D) sengaja TIDAK diperbaiki —
butuh kerja panel yang lebih besar dan tidak wajib untuk submit. Tidak ada perubahan
gameplay, misi, terrain, pesawat, atau file lain. vendor/makefun-game.ts tidak disentuh.

## Cacat: KECIL-1 — label kompas 330 hilang pada heading ~N 000

Bukti tester: strip kompas pada 1-cover, 3-cockpit, 4-landing (semua HDG 000)
menampilkan "▲ N 000  030" — sisi kiri strip kosong; 2-play (HDG 306) lengkap
"240 W 270 ▲300 330".

## Akar penyebab (game/src/hud.js)

Tape kompas diisi 3 ulangan label 0..330 (36 span × 72 px) dan diparkir dengan
ujung kirinya tepat di tengah strip (`#hud-compass-tape { left: 50% }`,
`shift = -(deg * 2.4) % 864`). Pada heading 000, shift = 0, jadi span pertama
("N 000") adalah label paling kiri yang ada — tidak ada satu pun span di kiri
tanda ▲. Tape hanya memanjang ke kanan dari tengah.

## Perbaikan (game/src/hud.js, 6 baris tambah / 3 ubah)

- Tape diisi **4 ulangan** 0..330 (48 span), bukan 3.
- Shift digeser satu ulangan penuh ke kiri: `shift = (-(deg * 2.4) % 864) - 864`.
- Efeknya: ulangan tengah menjadi "home" — label tersedia di kedua sisi ▲ pada
  semua heading. Perhitungan posisi dan fade per-label tidak berubah (geseran
  tepat 864 px = 12 span, jadi setiap label yang terlihat jatuh di piksel yang
  sama seperti sebelum perbaikan; alignment tape tidak berubah).

Simulasi logika tape untuk semua heading 0–359 (lebar strip 340 px) sebelum
re-shoot: setiap heading kini punya sedikitnya satu label opasitas penuh di kiri
dan di kanan tengah; pada HDG 000 strip menjadi "300 (fade) | 330 | N 000 |
030 (fade)".

## Bukti sebelum / sesudah (diperiksa visual dari crop strip kompas)

| Shot | Heading | Sebelum (TEST_REPORT) | Sesudah (re-shoot ini) |
|---|---|---|---|
| 1-cover.jpg | 000 | "▲ N 000 030", kiri kosong | "300 · 330 · ▲ N 000 · 030" — 330 muncul penuh |
| 3-cockpit.jpg | 000 | "▲ N 000 030", kiri kosong | "300 · 330 · ▲ N 000 · 030" — 330 muncul penuh |
| 4-landing.jpg | 000 | "▲ N 000 030", kiri kosong | "300 · 330 · ▲ N 000 · 030" — 330 muncul penuh |
| 2-play.jpg | 306 | "240 W 270 ▲300 330" | "240 (fade) · W 270 · ▲300 · 330" — tidak berubah, tanpa regresi |

Tidak ada label lain yang hilang atau terpotong karenanya di keempat shot;
fade per-label (perbaikan ronde 4 v1) tetap bekerja — tidak ada label setengah.

## Verifikasi (tanpa regresi)

- Re-shoot: `node scripts/shoot.mjs` — keempat screenshot 1280×720, ukuran
  73.331 / 88.624 / 76.136 / 72.486 byte, semua ≤ 256 KiB.
- `node scripts/check.mjs` → **CHECK PASSED** (exit 0).
- Determinisme: `MAKEFUN_OUTPUT_DIR=/tmp/fix-det1` vs `/tmp/fix-det2` →
  `diff -r` kosong, **byte-identik**.
- vendor/makefun-game.ts: sha256 `dc671875…` identik dengan kit starter.
- Diff commit ini: hanya `game/src/hud.js` + 4 screenshot (out/ tidak
  ter-track di repo).

## Status

KECIL-1 **TERATASI**. Entry siap submit apa adanya; SEDANG-1 dan SEDANG-2 tetap
terbuka sesuai keputusan parent (tidak menghalangi submit, per TEST_REPORT).
