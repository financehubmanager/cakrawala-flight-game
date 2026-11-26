// Fix-verification probe: scripted runway approach + touch-and-go.
// Flies mission 1 (ring-run, wind 0) with a small autopilot: mouse steering
// for proportional pitch/roll, W/S for throttle, all waits on game state.
// The strip's north end sits at the foot of a ~75 m cliff, so the approach
// comes from the SOUTH (like the landing shot): downwind south, turn, and a
// z-based altitude profile down the strip. Proves the averaged-sink landing
// check: a gentle approach must register as a touch-and-go, not a hit.
// Steering is CROSS-TRACK (heading = base heading + k * lateral error
// from a centreline), never toward a fixed point — a point target flips
// behind the aircraft once passed and makes it orbit the point.
// Geometry: SOUTH runs down the EAST (coastal, low) line x=730, so the
// 180 deg right turn through west (TURN2) lands the aircraft on the
// centreline x=330, already aligned for the final.
// Usage: node scripts/probe-fix-landing.mjs [--port 8113]
// Exit 0 on a clean touch-and-go + liftoff, 1 otherwise.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1] || 8113);
const base = `http://127.0.0.1:${port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const normAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

async function findChrome() {
  const home = process.env.HOME;
  for (const c of [
    `${home}/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome`,
    `${home}/.cache/ms-playwright/chromium_headless_shell-1254/chrome-linux/headless_shell`,
  ]) { try { await access(c); return c; } catch { /* next */ } }
  return undefined;
}

const server = spawn('node', ['serve.ts', '--port', String(port)], { cwd: root, stdio: 'ignore' });
const errors = [];
const log = [];
const diag = []; // ring buffer of control cycles (printed on failure)
let browser;
try {
  for (let i = 0; i < 40; i += 1) {
    try { const r = await fetch(`${base}/index.html`); if (r.ok) break; } catch { /* wait */ }
    await sleep(250);
  }
  browser = await chromium.launch({
    executablePath: await findChrome(),
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => {
    if (!r.url().endsWith('/favicon.ico')) errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`);
  });
  const state = () => page.evaluate(() => window.__game.state());
  const toast = () => page.evaluate(() => document.getElementById('toast')?.textContent ?? '');
  await page.goto(`${base}/?lite=1`, { waitUntil: 'load', timeout: 30000 });
  await sleep(2500);
  await page.evaluate(() => window.__game.startMission('ring-run'));
  await sleep(500);

  let phase = 'TAKEOFF';
  let phaseT0 = Date.now();
  const phaseTimeout = { TAKEOFF: 120000, CLIMB: 120000, NORTH: 180000, TURN1: 180000, SOUTH: 300000, TURN2: 180000, ALIGN: 180000, FINAL: 300000, LIFTOFF: 120000 };
  let keys = { w: false, s: false };
  let prevSample = null;
  const sinkSamples = [];
  let touchdown = null;

  async function setKeys(w, s) {
    if (w !== keys.w) { await page.keyboard[w ? 'down' : 'up']('KeyW'); keys.w = w; }
    if (s !== keys.s) { await page.keyboard[s ? 'down' : 'up']('KeyS'); keys.s = s; }
  }

  function setPhase(p, s) {
    phase = p;
    phaseT0 = Date.now();
    log.push(`${p} @ y=${Math.round(s.position.y)} z=${Math.round(s.position.z)} x=${Math.round(s.position.x)} spd=${Math.round(s.speed)} hdg=${s.heading.toFixed(2)} roll=${s.roll.toFixed(2)}`);
    console.log('PHASE', p, JSON.stringify({ y: Math.round(s.position.y), z: Math.round(s.position.z), x: Math.round(s.position.x), speed: Math.round(s.speed), heading: Math.round(s.heading * 100) / 100, roll: Math.round(s.roll * 100) / 100 }));
  }

  // Cross-track heading toward a LINE x = cx: base heading plus a
  // correction that steers the aircraft back onto the line. Northbound the
  // correction is +k*(x-cx) (east of the line -> head west of north);
  // southbound it is subtracted. A line target cannot be "passed", so it
  // cannot orbit. Gain 2.0 keeps small errors out of the mouse dead zone.
  const hNorth = (s, cx = 330, cap = 0.5) => clamp((s.position.x - cx) * 0.004, -cap, cap);
  const hSouth = (s, cx = 330, cap = 0.5) => Math.PI - clamp((s.position.x - cx) * 0.004, -cap, cap);
  const settled = (s, hD) => Math.abs(normAngle(hD - s.heading)) < 0.15 && Math.abs(s.roll) < 0.12;

  const t0 = Date.now();
  for (;;) {
    const s = await state();
    if (s.phase === 'crashed') {
      const reason = await page.evaluate(() => document.getElementById('crash-reason')?.textContent ?? '');
      throw new Error(`crashed during ${phase}: ${reason} state=${JSON.stringify(s)}`);
    }
    if (s.phase === 'complete') throw new Error(`mission completed unexpectedly during ${phase}`);
    if (s.hits > 0) throw new Error(`took a hit during ${phase}: ${JSON.stringify(s)}`);
    if (Date.now() - phaseT0 > phaseTimeout[phase]) {
      throw new Error(`phase ${phase} timed out: ${JSON.stringify(s)}`);
    }
    if (Date.now() - t0 > 900000) throw new Error('probe overall timeout');
    if (prevSample && s.timeLeft < prevSample.tl) {
      const simDt = prevSample.tl - s.timeLeft;
      const sink = -(s.position.y - prevSample.y) / simDt;
      sinkSamples.push({ tl: Math.round(s.timeLeft), sink: Math.round(sink * 10) / 10, y: Math.round(s.position.y), z: Math.round(s.position.z) });
      if (sinkSamples.length > 400) sinkSamples.shift();
    }
    prevSample = { y: s.position.y, tl: s.timeLeft };

    let hD = 0;
    let vT = 0;
    let thrT = 0.8;
    if (phase === 'TAKEOFF') {
      thrT = 0.9; vT = 0; hD = 0;
      if (!s.onGround && s.speed > 70) setPhase('CLIMB', s);
    } else if (phase === 'CLIMB') {
      // Steep: the ground rises fast past the strip's north end.
      thrT = 0.8; vT = 18; hD = 0;
      if (s.position.y >= 220) setPhase('NORTH', s);
    } else if (phase === 'NORTH') {
      thrT = 0.75; vT = 0; hD = hNorth(s);
      if (s.position.z <= -900) setPhase('TURN1', s);
    } else if (phase === 'TURN1') {
      thrT = 0.7; vT = 0; hD = Math.PI;
      if (settled(s, Math.PI)) setPhase('SOUTH', s);
    } else if (phase === 'SOUTH') {
      // Downwind south along the EAST coastal line x=730 (low terrain),
      // descending gradually 220 -> ~90.
      thrT = 0.4; hD = hSouth(s, 730, 0.9);
      const yT = 220 - (s.position.z + 900) * 0.0542;
      vT = clamp((yT - s.position.y) * 0.6, -6, 3);
      if (s.position.z >= 1500) setPhase('TURN2', s);
    } else if (phase === 'TURN2') {
      // Right turn through WEST to north. The heading error sits exactly
      // on the +/-PI wrap boundary here, so force a hard right bank until
      // the heading is close to north, then let the controller settle it.
      // A 180 deg turn displaces the aircraft ~2r west, landing it on the
      // centreline from the x=730 downwind line.
      thrT = 0.35; vT = -1; hD = 0;
      if (settled(s, 0)) setPhase('ALIGN', s);
    } else if (phase === 'ALIGN') {
      // Level at ~90 m, converge on the centreline before descending.
      thrT = 0.3; vT = clamp((90 - s.position.y) * 0.6, -3, 3); hD = hNorth(s, 330, 0.9);
      if (s.position.z < 550) throw new Error(`ALIGN failed to converge before the northern hills: ${JSON.stringify(s)}`);
      if (Math.abs(s.position.x - 330) < 60 && settled(s, hD)) setPhase('FINAL', s);
    } else if (phase === 'FINAL') {
      thrT = 0.28; hD = hNorth(s, 330, 0.4);
      // Altitude profile down the strip: level 90, then a ~5.7 deg slope
      // (sink ~6.4 m/s at 64 m/s, inside the 8 limit) to 15 at z=650, then
      // it keeps descending below 15 so the commanded sink stays above
      // the mouse dead zone until the wheels touch.
      const z = s.position.z;
      const yT = z >= 1400 ? 90 : z >= 650 ? 90 - (1400 - z) * 0.1 : 15 - (650 - z) * 0.08;
      vT = clamp((yT - s.position.y) * 0.8, -8, 4);
      if (s.position.z < 400) throw new Error(`overshot the strip north: ${JSON.stringify(s)}`);
      if (s.onGround) {
        touchdown = { ...s, toast: await toast() };
        console.log('TOUCHDOWN', JSON.stringify({ y: Math.round(s.position.y), z: Math.round(s.position.z), x: Math.round(s.position.x), speed: Math.round(s.speed), hits: s.hits, toast: touchdown.toast }));
        setPhase('LIFTOFF', s);
      }
    } else if (phase === 'LIFTOFF') {
      // Steep climb off the strip. The northern hills rise faster than the
      // aircraft can outclimb them, so the probe completes as soon as it
      // is airborne and climbing over the strip (y>22, still z>440).
      thrT = 0.9; vT = 18; hD = hNorth(s, 330, 0.4);
      if (!s.onGround && s.position.y > 22) {
        const final = await state();
        console.log('LIFTOFF-AGAIN', JSON.stringify({ y: Math.round(final.position.y), speed: Math.round(final.speed), hits: final.hits, phase: final.phase }));
        console.log('SINK-LAST-40', JSON.stringify(sinkSamples.slice(-40)));
        console.log('LOG', JSON.stringify(log));
        const pass = touchdown && touchdown.hits === 0 && final.phase === 'flying' && final.hits === 0 && errors.length === 0;
        console.log(JSON.stringify({ touchdown: { y: Math.round(touchdown.position.y), z: Math.round(touchdown.position.z), x: Math.round(touchdown.position.x), speed: Math.round(touchdown.speed), hits: touchdown.hits, toast: touchdown.toast }, errors }));
        console.log(pass ? 'PROBE PASSED' : 'PROBE FAILED');
        process.exitCode = pass ? 0 : 1;
        break;
      }
    }

    // The game's mouse input has a 0.12 dead zone; a small commanded
    // deflection would be ignored entirely, so push any non-trivial
    // command just past the dead zone.
    const pastDeadZone = (m) => (Math.abs(m) > 0.01 && Math.abs(m) < 0.16 ? Math.sign(m) * 0.16 : m);
    let e = normAngle(hD - s.heading);
    let rollInput = clamp(-e * 2.0, -1, 1);
    let mx = clamp(rollInput / 0.85, -1, 1);
    if (phase === 'TURN2' && Math.abs(normAngle(0 - s.heading)) > 0.5) {
      // Force the right turn: the error sits on the +/-PI wrap boundary.
      mx = 1;
    }
    mx = pastDeadZone(mx);
    const pitchD = Math.asin(clamp(vT / Math.max(s.speed, 10), -0.9, 0.9));
    const pitchInput = clamp(pitchD / 0.42, -1, 1);
    const my = pastDeadZone(clamp(-pitchInput / 0.7, -1, 1));
    diag.push({ ph: phase, x: Math.round(s.position.x), z: Math.round(s.position.z), y: Math.round(s.position.y), h: Math.round(s.heading * 100) / 100, hD: Math.round(hD * 100) / 100, e: Math.round(e * 100) / 100, mx: Math.round(mx * 100) / 100, roll: Math.round(s.roll * 100) / 100, spd: Math.round(s.speed) });
    if (diag.length > 150) diag.shift();
    await page.mouse.move(((mx + 1) / 2) * 1280, ((my + 1) / 2) * 720);
    if (s.throttle < thrT - 0.02) await setKeys(true, false);
    else if (s.throttle > thrT + 0.02) await setKeys(false, true);
    else await setKeys(false, false);
    await sleep(250);
  }
} catch (e) {
  console.error('PROBE ERROR', e?.message || String(e));
  console.log('LOG', JSON.stringify(log));
  console.log('DIAG-LAST-150', JSON.stringify(diag));
  console.log('ERRORS', JSON.stringify(errors));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill();
}
