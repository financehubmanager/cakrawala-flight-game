# cakrawala-flight-game

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/financehubmanager/cakrawala-flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/financehubmanager/cakrawala-flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

CAKRAWALA — Volcano Ring Run: terbangkan Elang-7, pesawat bush oranye-krem, di atas kepulauan vulkanik saat golden hour. Lewati cincin-cincin bercahaya, hemat bahan bakar, dan mendarat kembali di landasan pantai. Tiga misi: Ring Run, Ridge Courier, dan Volcano Dash saat senja dengan angin kencang.

## Run it

```sh
node serve.ts
```

Lalu buka http://localhost:8080. Kontrol: W/S throttle, mouse untuk belok, panah pitch & roll, F flap, G roda, C kamera kokpit, P jeda, R ulang, M suara.

## Struktur

- `game/index.html` — shell + HUD
- `game/src/main.js` — boot, loop 60 Hz, state machine
- `game/src/config.js` — semua angka tuning + palet
- `game/src/rng.js` — RNG berseed + value-noise fBm
- `game/src/terrain.js` — pulau vulkanik, terasering, laut, landasan
- `game/src/aircraft.js` — model Elang-7 + flight model
- `game/src/rings.js` — cincin misi
- `game/src/missions.js` — definisi 3 misi + skor
- `game/src/sky.js` — langit, matahari, awan, kabut
- `game/src/hud.js` — HUD + instrumen + overlay
- `game/src/audio.js` — suara mesin WebAudio (sintesis)
- `game/src/input.js` — keyboard + mouse
- `game/src/shots.js` — state deterministik `?shot=` untuk screenshot
- `game/vendor/three.module.min.js` — Three.js r160 (vendored)
- `main.ts` — entrypoint: salin game/ + screenshots/ ke /output, tulis dossier.json

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
