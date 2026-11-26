// Fix-verification probe: idle taxi, bounce recovery, water taxi crash.
// Read-only vs game code. Drives with real keyboard events and reads
// window.__game.state(). Headless sim runs ~0.1-0.33x wall time, so every
// wait is on game state, never on wall time alone.
// Usage: node scripts/probe-fix-bounce.mjs [--port 8112]
// Exit 0 when all three checks pass, 1 otherwise.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1] || 8112);
const base = `http://127.0.0.1:${port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findChrome() {
  const home = process.env.HOME;
  for (const c of [
    `${home}/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome`,
    `${home}/.cache/ms-playwright/chromium_headless_shell-1254/chrome-linux/headless_shell`,
  ]) { try { await access(c); return c; } catch { /* next */ } }
  return undefined;
}

// Poll state() until pred holds, or timeout (wall ms). Returns last state.
async function waitState(page, pred, timeoutMs, label) {
  const t0 = Date.now();
  let s = null;
  for (;;) {
    s = await page.evaluate(() => window.__game.state());
    if (pred(s)) return s;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout waiting for ${label}; last=${JSON.stringify(s)}`);
    await sleep(150);
  }
}

const server = spawn('node', ['serve.ts', '--port', String(port)], { cwd: root, stdio: 'ignore' });
const results = {};
const errors = [];
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
  await page.goto(`${base}/?lite=1`, { waitUntil: 'load', timeout: 30000 });
  await sleep(2500);

  // ---- A. Idle taxi: throttle 0 on the ground must NOT spool to 38 m/s.
  await page.evaluate(() => window.__game.startMission('ring-run'));
  await sleep(500);
  let maxSpeedA = 0;
  for (let i = 0; i < 24; i += 1) {
    const s = await state();
    maxSpeedA = Math.max(maxSpeedA, s.speed);
    await sleep(500);
  }
  const a = await state();
  results.idleTaxi = { maxSpeed: Math.round(maxSpeedA * 10) / 10, finalSpeed: Math.round(a.speed * 10) / 10, pass: maxSpeedA < 5 };
  console.log('A IDLE-TAXI', JSON.stringify(results.idleTaxi));

  // ---- B. Bounce recovery: dive at terrain at ~55-100 m/s, one hit only.
  await page.evaluate(() => window.__game.startMission('ring-run'));
  await sleep(500);
  await page.keyboard.down('KeyW');
  await waitState(page, (s) => s.throttle > 0.8, 60000, 'throttle 0.8');
  await waitState(page, (s) => !s.onGround && s.speed > 70, 120000, 'liftoff + speed 70');
  // Climb to ~170 m.
  await page.keyboard.down('ArrowUp');
  await waitState(page, (s) => s.position.y >= 170, 120000, 'climb to 170 m');
  await page.keyboard.up('ArrowUp');
  // Ease throttle to ~0.5 so impact stays in the 55-100 m/s band.
  await page.keyboard.down('KeyS');
  await waitState(page, (s) => s.throttle <= 0.55, 60000, 'throttle 0.5');
  await page.keyboard.up('KeyS');
  await page.keyboard.up('KeyW');
  // Dive at the ground.
  await page.keyboard.down('ArrowDown');
  let impact = null;
  {
    const t0 = Date.now();
    for (;;) {
      const s = await state();
      if (s.hits >= 1) { impact = s; break; }
      if (s.phase !== 'flying') throw new Error(`dive ended in phase ${s.phase}: ${JSON.stringify(s)}`);
      if (Date.now() - t0 > 180000) throw new Error(`dive never hit ground: ${JSON.stringify(s)}`);
      await sleep(120);
    }
  }
  const impactSpeed = Math.round(impact.speed * 10) / 10;
  const impactY = Math.round(impact.position.y * 10) / 10;
  console.log('B IMPACT', JSON.stringify({ speed: impactSpeed, y: impactY, x: Math.round(impact.position.x), z: Math.round(impact.position.z), hits: impact.hits }));
  // Climb out: full throttle + pitch up, and watch it fly away.
  await page.keyboard.up('ArrowDown');
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ArrowUp');
  let minSpeedB = Infinity;
  let maxYB = -Infinity;
  let finalB = null;
  {
    const t0 = Date.now();
    for (;;) {
      const s = await state();
      minSpeedB = Math.min(minSpeedB, s.speed);
      maxYB = Math.max(maxYB, s.position.y);
      finalB = s;
      if (s.position.y > impactY + 40 && s.speed > 55) break;
      if (s.phase !== 'flying') break;
      if (Date.now() - t0 > 120000) break;
    }
  }
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up('KeyW');
  results.bounce = {
    impactSpeed, impactY,
    minSpeedAfter: Math.round(minSpeedB * 10) / 10,
    maxYAfter: Math.round(maxYB * 10) / 10,
    finalHits: finalB.hits, finalPhase: finalB.phase,
    finalSpeed: Math.round(finalB.speed * 10) / 10,
    finalY: Math.round(finalB.position.y * 10) / 10,
    pass: finalB.phase === 'flying' && finalB.hits === 1 && finalB.speed > 55 && finalB.position.y > impactY + 20,
  };
  console.log('B BOUNCE', JSON.stringify(results.bounce));

  // ---- C. Water taxi: roll east off the strip at low throttle; the sea
  // must crash the aircraft even while onGround. Throttle 0.2 keeps the
  // aircraft on the ground (liftoff needs throttle > 0.4).
  await page.evaluate(() => window.__game.startMission('ring-run'));
  await sleep(500);
  // The input throttle is sticky across mission restarts (it is the
  // player's throttle lever, not reset by startMission), so first drive it
  // to zero with S — otherwise the previous test's full throttle persists.
  // Wait for the input -> flight sync first: the first state read after a
  // restart still shows the reset value (0), which would end the S-hold
  // before it even started.
  await sleep(1500);
  await page.keyboard.down('KeyS');
  await waitState(page, (s) => s.throttle <= 0.02, 60000, 'throttle 0');
  await page.keyboard.up('KeyS');
  await page.keyboard.down('KeyW');
  await waitState(page, (s) => s.throttle >= 0.18, 60000, 'throttle 0.2');
  await page.keyboard.up('KeyW');
  const c0 = await state();
  console.log('C TAXI-START', JSON.stringify({ throttle: Math.round(c0.throttle * 100) / 100, speed: Math.round(c0.speed) }));
  // Turn east (heading -PI/2): right bank decreases heading.
  await page.keyboard.down('ArrowRight');
  await waitState(page, (s) => s.heading <= -1.35 || s.phase !== 'flying', 120000, 'turn east');
  await page.keyboard.up('ArrowRight');
  const c1 = await state();
  console.log('C TURNED', JSON.stringify({ heading: Math.round(c1.heading * 100) / 100, x: Math.round(c1.position.x), speed: Math.round(c1.speed) }));
  // Drive east until the sea (or a timeout).
  let crashReason = null;
  {
    const t0 = Date.now();
    for (;;) {
      const s = await state();
      if (s.phase === 'crashed') {
        crashReason = await page.evaluate(() => document.getElementById('crash-reason')?.textContent ?? '');
        break;
      }
      if (s.position.x > 900) throw new Error(`taxied past the coast without crashing: ${JSON.stringify(s)}`);
      if (Date.now() - t0 > 180000) throw new Error(`no sea crash: ${JSON.stringify(s)}`);
      await sleep(200);
    }
  }
  const c2 = await state();
  results.waterTaxi = {
    crashX: Math.round(c2.position.x), crashZ: Math.round(c2.position.z),
    reason: crashReason,
    pass: c2.phase === 'crashed' && /laut|tenggelam/i.test(crashReason || ''),
  };
  console.log('C WATER-TAXI', JSON.stringify(results.waterTaxi));

  results.errors = errors;
  const pass = results.idleTaxi.pass && results.bounce.pass && results.waterTaxi.pass && errors.length === 0;
  console.log(pass ? 'PROBE PASSED' : 'PROBE FAILED');
  process.exitCode = pass ? 0 : 1;
} catch (e) {
  console.error('PROBE ERROR', e?.stack || String(e));
  console.log('PARTIAL', JSON.stringify(results));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill();
}
