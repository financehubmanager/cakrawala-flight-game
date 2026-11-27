# BRIEF — CAKRAWALA: Volcano Ring Run

## The contract (make.fun bounty "Make the best flight game", 26–28 Nov 2026)

- A complete, original flight game. Static files under `game/`, no network request,
  desktop Chrome, keyboard + mouse. 3–4 real screenshots under `screenshots/`.
- The AI judge compares entries two at a time from (a) a contact sheet of the
  screenshots (cover large on top, the rest small below) and (b) a short outline of
  the source (file paths + first declarations). Screenshots decide almost everything.
- Judge criteria, most important first:
  1. Complete flight game SHOWN in screenshots: cockpit or chase view over
     recognisable terrain, aircraft in frame with instruments lit, a runway or
     target ring ahead, altitude + speed + heading on the HUD.
  2. Fun and depth: flying that rewards throttle and turn discipline, missions with
     different goals, fuel or damage that turns a sortie into decisions.
  3. Feel and polish: controls that answer at every speed, a camera that never
     fights the pilot, landings and crashes that read as what happened.
  4. Look and originality: terrain and sky in one style, an aircraft that looks
     built, instruments that look flown rather than drawn. Original — never a copy
     of a commercial game.
  5. Structure: the game's own source split into files with one clear job each,
     named for what they do.
- Gate (must pass or the entry scores 0): game/ ≤ 993 files, ≤ 48 MiB, index.html
  ≤ 1 MiB, no symlinks, no network references (everything local or `data:`),
  screenshots 3–4, each ≤ 256 KiB, long side ≤ 1280, short side ≥ 480, dossier
  byte-identical to what `buildDossier` writes, MIT LICENSE, repo created after
  the bounty opened, public, owned by ocoot. Transcripts: ≥30% authored lines,
  ≥5 assistant turns with text, ≥2 revising writes of some file.
- Deadline: entries close 28 Nov 2026 07:57 WIB. Top 200 dev-board entrants go to
  the final heat; top 50 share $500 (1st $100). Blind rounds: no public ranks
  until results. 7,396 submissions already — most titles say "3D tactical /
  courier / ring run". A flat 2D game will lose on criterion 1 alone.

## The game

**Title:** CAKRAWALA — Volcano Ring Run. **Aircraft:** "Elang-7", a rugged orange
-and-cream STOL bush plane (elang = eagle). **Place:** a golden-hour volcanic
archipelago off an Indonesian coast — one smoking volcano cone, terraced green
hills, a turquoise lagoon, a coastal airstrip. One warm palette everywhere:
teal sea, green terraces, amber sun, peach sky. Recognisable terrain = volcano +
terraces + lagoon + runway.

**Core loop (60 s to first decision):** take off from the coastal strip, fly a
sequence of glowing rings, manage throttle and fuel, land back on the runway.
Three missions, different goals:
1. **Ring Run** — 8 rings in sequence against the clock, generous fuel.
2. **Ridge Courier** — 12 rings threaded through the valley and around the
   volcano, then a full-stop landing on the strip.
3. **Volcano Dash (dusk)** — rings around the smoking cone in low light, tight
   fuel, wind gusts; land before the tank runs dry.

**Decisions:** throttle vs fuel burn, tight turns vs speed, flap/gear discipline
on approach, go-around vs risky landing. Damage: terrain strike or hard landing
costs a hit (3 hits = crash, wreck + smoke + restart). Score = rings + time +
landing softness + fuel left.

**Controls:** mouse steers (pointer), W/S or Shift/Ctrl throttle, arrows / A,D
pitch & roll, F flaps, G gear, C camera (chase / cockpit), P pause, R restart,
M mute. Title screen teaches controls in 10 seconds; HUD always shows ALT,
SPD, HDG, fuel, throttle, ring counter, mission objective, timer.

**Views:** chase cam (default, aircraft in frame, ring ahead), cockpit cam
(full lit panel: horizon, altimeter, compass, fuel), plus deterministic
`?shot=` states for the screenshots (see `game/src/shots.js`).

## Look (one style, no placeholders)

- Three.js r160 vendored as `game/vendor/three.module.min.js` (import map, no CDN).
- Procedural everything: heightfield terrain with volcano cone + terraces (vertex
  colours by altitude/slope), flat-shaded low-poly style with warm sun, blue
  aerial-perspective fog, painted sky dome (gradient + sun disc + drifting
  cumulus billboards), turquoise water plane with animated normals, instanced
  trees on the hills, runway with lights + windsock, smoke column over the cone.
- Aircraft built from primitives (fuselage, wings, tail, spinning prop, nav
  lights, landing lights) — it must look built, not a cone with wings.
- Instruments that look flown: glass-cockpit strip in chase view (lit dials,
  artificial horizon that actually moves, compass tape), full panel in cockpit
  view. HUD numbers big and legible at contact-sheet size.
- Sound: WebAudio synthesis only (engine drone tied to RPM, wind, ring chime,
  touchdown thump, stall warning). No audio files, no network.

## Structure (criterion 5 — the judge reads file/function names)

One job per file, named for what it does:
- `game/index.html` — shell, import map, HUD DOM, title/pause/game-over overlays
- `game/src/main.js` — boot + fixed-step loop + state machine
- `game/src/config.js` — every tuning number + palette in one place
- `game/src/rng.js` — seeded RNG + value-noise fBm (terrain, placement)
- `game/src/terrain.js` — heightfield, volcano, terraces, water, trees, runway
- `game/src/aircraft.js` — plane model + 6-DOF-ish flight model
- `game/src/rings.js` — mission rings (build, glow, pass detection)
- `game/src/sky.js` — sky dome, sun, clouds, fog, time-of-day presets
- `game/src/missions.js` — mission definitions + objectives + scoring
- `game/src/hud.js` — HUD + instruments + overlays
- `game/src/audio.js` — synth engine, wind, chimes
- `game/src/input.js` — keyboard + mouse
- `game/src/shots.js` — deterministic `?shot=` screenshot states
- `main.ts` — copies game/ + screenshots/ to /output, writes dossier.json
- `serve.ts` — local static server for play-testing

## Screenshot plan (the cover decides the first impression)

1280×720 JPEG, each ≤ 256 KiB. First by name is the cover. v2 (27 Nov, pasca
ronde 2: 6192/13681) — cover kini low pass di garis tengah runway (ring +
runway + gunung + laut satu frame), kokpit terbang level (ATT konsisten),
kotak tutorial disembunyikan di shot mode, kamera chase 16,5 m.
1. `1-cover.jpg` — low pass di garis tengah runway menghadap utara, ring
   dead ahead di atas runway, HUD lit, matahari rendah, gunung di kejauhan.
2. `2-rings.jpg` — mid-flight ring pass, wings banked, terraces below.
3. `3-cockpit.jpg` — cockpit view LEVEL, lit panel (ATT + jarum hidup),
   ring + runway ahead through the windscreen.
4. `4-landing.jpg` — final approach 80 m sebelum threshold, gear down,
   runway threshold ahead, dusk light.

## Verification loop (procedural-3d-web-game skill, scaled to the bounty)

Build → `node scripts/check.mjs` (load, no console errors, not blank) →
`node scripts/shoot.mjs` (same 4 shots every round) → fresh critic subagent
scores SCORECARD.md rows 1–10 from the contact sheet only → fix the lowest row
→ repeat. Stop when every row ≥ 8, or two rounds in a row fail to raise the
minimum, or the deadline forces a submit. A subagent playtest (scripted keys,
state assertions) runs after every stage so a visual pass can't silently break
a mechanic.
