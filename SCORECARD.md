# SCORECARD — CAKRAWALA

Rows are scored 1–10 from the contact sheet + a playtest, by a FRESH critic
subagent that has not seen the code. Anchors: 4 = readable but generic,
6 = solid with gaps, 8 = would use as key art / shipped quality, 10 = best in
the field. Automatic failures (cap the row at 5): hero view dominated by
placeholders/empty space; aircraft is a primitive plus glow; fog/darkness
standing in for missing geometry; HUD overlaps the play area or clips text;
game can't be played through real input; no active-play shot exists.

| Row | 4/10 | 6/10 | 8/10 | 10/10 |
|---|---|---|---|---|
| 1. Complete flight game (judge #1) | plane + sky, no runway/ring/HUD | chase view, ring OR runway, HUD present | chase + cockpit, ring ahead AND runway visible, ALT/SPD/HDG lit and legible at contact-sheet size | every shot reads as a finished flight game at a glance |
| 2. Fun & depth (judge #2) | fly around, nothing to do | rings to fly through | 3 missions, fuel + damage force decisions, score rewards discipline | first 30 s contain a real decision; ignoring the mechanic can't progress |
| 3. Feel & polish (judge #3) | controls laggy, camera fights | responsive, camera mostly steady | controls answer at every speed, landings/crashes read clearly, no camera clipping | landings feel earned, crashes unmistakable |
| 4. Look & originality (judge #4) | flat colours, generic plane | one palette, plane reads as a plane | terrain + sky one style, aircraft looks built, instruments look flown | distinctive Indonesian volcano setting, key-art frames |
| 5. Structure (judge #5) | one big file | split files | one job per file, names say what they do | outline reads like a design doc |
| 6. Composition & framing | subject cut off, empty frames | readable but generic | every view has focal point + foreground/mid/background depth | key art |
| 7. Lighting & shadows | flat, one light | key + shadows, some depth | key/fill/rim, contact shadows, warm sun + cool shadows | light tells golden hour at a glance |
| 8. Atmosphere & colour | white haze or none | fog exists, colours OK | blue aerial perspective, layered distance, warm highs / cool shadows | matches the brief palette side by side |
| 9. Terrain & water | smooth noise blob | varied heights, water plane | volcano + terraces + lagoon read as a real place, no tiling | you'd fly it to sightsee |
| 10. Aircraft & instruments | cone + wings | recognisable plane, dials drawn | built from parts, prop spins, nav lights, horizon + compass actually move | close-up holds up |
| 11. Animation & life | static world | prop + clouds move | birds, smoke column, water shimmer, windsock, ring pulse | world feels alive when idle |
| 12. Audio | silence | engine loop | layered engine + wind + chimes tied to actions, mute key | mood carries without visuals |
| 13. UI & feel | cluttered or none | functional | minimal, legible, loader teaches controls in 10 s | invisible until needed |
| 14. Performance | < 30 fps / hitches | playable | p95 ≤ 16.7 ms at default tier, no shader-compile stalls | scales down gracefully |
| 15. Stability | errors, black frames | occasional glitches | zero console errors, no flicker/z-fighting in motion | — |

## Round log

| Round | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | Min | Changed this round |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 01 | 7 | 6 | 5 | 7 | 7 | 6 | 6 | 6 | 6 | 5 | | | | | | 5 | scaffold; kritik: panel kokpit miring vs horizon datar (terbaca bug), V/S beku +0.0, compass terpotong, cover langit kosong |
| 02 | 8 | 7 | 6 | 7 | 7 | 7 | 6 | 7 | 7 | 7 | | | | | | 6 | kritik ronde 2: min naik 5→6; kokpit tidak lagi terbaca rusak; gap terbesar = langit tanpa matahari (baris 7) |
| 03 | 8 | 7 | 6 | 8 | 7 | 7 | 7 | 7 | 7 | 7 | | | | | | 6 | kritik ronde 3: min visual 7, min keseluruhan 6 (baris 3 = playtest); matahari membantu, gunung tidak terlalu gelap; sisa: komposisi shot 4 + label compass setengah |
| 04 | | | | | | | | | | | | | | | | | ronde terakhir: landing 60 m / 150 m sebelum threshold, label compass fade per-label (opacity 0 sebelum terpotong) |
| 05 | 8 | 7 | 7 | 8 | 7 | 8 | 7 | 8 | 8 | 8 | 7 | 7 | 7 | 7 | 8 | 7 | v2 (rebuild pasca ronde 2: 6192/13681, 42,3%): min naik 6→7. Cover kini runway + ring + gunung + laut dalam satu frame; kokpit level (ATT konsisten dengan horizon), panel 2,1 m tidak lagi menelan frame, label kompas bersih (N 000 di tengah); kotak tutorial disembunyikan di shot mode; pesawat lebih besar/detail (strut, spinner, antena, exhaust, pitot, roda ekor); terasering 24 m kini terlihat, laguna + 3 pulau jauh + pohon berdaun lebar; halo matahari + awan horizon. Sisa: baris 3 — tak ada shot touchdown/crash; baris 2 — depth ada di kode, tak terlihat di screenshot; matahari masih membakar pojok kiri atas cover. |
| 06 | 9 | 7 | 7 | 8 | 7 | 8 | 7 | 8 | 8 | 9 | 7 | 7 | 8 | 7 | 8 | 7 | v3 (builder self-score; belum dikritik fresh): panel kokpit dibangun ulang jadi instrumen sungguhan — bezel logam + kaca + sekrup + placard ELANG-7, dial berangka + redline, simbol ATT tetap + pitch ladder + bank pointer; A-pillar + glareshield + pipi panel + stick (trigger merah) membingkai windscreen; panel tidak lagi mengambang. KECIL-2: HUD tidak lagi tumpang tindih di bawah 1280 px (probe 960×540: celah 84 px / 162 px antar klaster). Sisa: baris 3 — tak ada shot touchdown/crash; baris 2 — depth ada di kode, tak terlihat di screenshot; matahari masih membakar pojok kiri atas cover. |
| 07 | 9 | 7 | 8 | 8 | 7 | 8 | 7 | 8 | 8 | 9 | 7 | 7 | 8 | 7 | 8 | 7 | v4 (builder self-score; belum dikritik fresh): shot landing kini TOUCHDOWN — roda di strip 20 m setelah threshold (ALT 15 m, flare +0,06, GEAR DN, FLAP 15, CINCIN 12/12, skor 1200, objective landing), strip + marka + lampu tepi memenuhi frame; baris 3 naik 7→8. Matahari cover dijinakkan (cakram 1,0→0,5 di shader — kuning hangat, bukan putih terbakar). A-pillar 0,05→0,04 m, framing utuh. KECIL-2: strip kompas <1280 px kini "300 330 ▲ N 000 030" utuh (topcenter 320 px, probe 960×540: celah 39/117 px, tanpa overlap). Sisa: baris 2 — depth tak terlihat di screenshot; roda tidak terlihat jelas dari chase cam. |
| 08 | 9 | 8 | 9 | 8 | 7 | 8 | 7 | 8 | 8 | 9 | 7 | 7 | 8 | 7 | 8 | 7 | v5 (builder self-score; belum dikritik fresh): frame 2-play diganti 2-crash — bangkai Elang-7 di dasar lembah misi 2 (bank 43°, hidung menunduk, sayap bawah menancap teras; banner merah "MISI GAGAL — Menabrak tanah, pesawat hancur."; SPD 0, RUSAK 3/3, fuel LOW, CINCIN 3/12); baris 2 naik 7→8 (depth kini TERLIHAT), baris 3 naik 8→9 (landing + crash keduanya terbaca). Iterasi 1 di lereng gunung DITOLAK (terbaca bank di udara — kamera terlalu jauh/tinggi); kamera crash 10 m / 3,2 m. A-pillar 0,04→0,035 m (~26 px/sisi), framing utuh. Cover/kokpit/landing utuh. Sisa: cincin 4 tak terlihat di frame crash; ALT 97 m adalah MSL (terrain ~95 m). |
