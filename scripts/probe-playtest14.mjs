// Probe 14 for CAKRAWALA (read-only vs game code). FINAL landing verification.
//  In-page controller: runs INSIDE the page (setInterval 16ms), dispatching
//  real KeyboardEvents to window and reading window.__game.state() directly.
//  This avoids the CDP round-trip starvation that froze the sim in probe 13
//  (rAF starved -> sim bursts -> over-actuation). The controller only
//  simulates keyboard input, exactly like a human player; it does not touch
//  game code or internals.
//  Test: immediate touch-and-go with speed-gated throttle cut (cut to 0.30
//  once airborne and speed > 60, so speed peaks ~62-68, under the 72 limit)
//  and tight pitch control (deadband +/-0.015) for a gentle descent to y=12.
// Usage: node scripts/probe-playtest14.mjs [--port 8105] [--out /tmp/probe14]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1] || 8105);
const outDir = args[args.indexOf('--out') + 1] || '/tmp/probe-cakrawala14';
await mkdir(outDir, { recursive: true });
const base = `http://127.0.0.1:${port}`;
const LOG = [];
function log(...a) { const line = a.join(' '); LOG.push(line); console.log(line); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
const findings = [];
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
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => {
    if (!r.url().endsWith('/favicon.ico')) errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`);
  });

  const hudText = (id) => page.evaluate((i) => document.getElementById(i)?.textContent ?? null, id);

  await page.goto(`${base}/?lite=1`, { waitUntil: 'load', timeout: 30000 });
  await sleep(2000);
  await page.evaluate(() => window.__game.startMission('ring-run'));
  await sleep(500);
  log('T1e gear at start=', await hudText('hud-gear'));

  // Inject the in-page controller.
  await page.evaluate(() => {
    window.__probe = { samples: [], outcome: null, maxSpeedPreHit: 0, maxSinkPreHit: -Infinity, startWall: Date.now() };
    const held = new Set();
    function setKeys(want) {
      for (const k of [...held]) {
        if (!want.has(k)) { window.dispatchEvent(new KeyboardEvent('keyup', { code: k })); held.delete(k); }
      }
      for (const k of want) {
        if (!held.has(k)) { window.dispatchEvent(new KeyboardEvent('keydown', { code: k })); held.add(k); }
      }
    }
    const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
    let tick = 0;
    let lifted = false;
    window.__probe.timer = setInterval(() => {
      const P = window.__probe;
      if (Date.now() - P.startWall > 180000) { P.outcome = 'timeout'; clearInterval(P.timer); setKeys(new Set()); return; }
      const s = window.__game.state();
      if (s.phase !== 'flying') { P.outcome = 'phase ' + s.phase; clearInterval(P.timer); setKeys(new Set()); return; }
      if (tick % 3 === 0) {
        const stalled = s.speed < 52 && !s.onGround;
        const sinkI = -s.speed * Math.sin(s.pitch) * Math.cos(s.roll) + (stalled ? 14 : 0);
        P.samples.push({ y: +s.position.y.toFixed(1), spd: +s.speed.toFixed(0), pitch: +s.pitch.toFixed(3), roll: +s.roll.toFixed(2), sinkI: +sinkI.toFixed(1), z: Math.round(s.position.z), x: Math.round(s.position.x), hits: s.hits, thr: +s.throttle.toFixed(2), gnd: s.onGround });
        if (s.hits === 0) {
          if (s.speed > P.maxSpeedPreHit) P.maxSpeedPreHit = s.speed;
          if (sinkI > P.maxSinkPreHit) P.maxSinkPreHit = sinkI;
        }
      }
      tick += 1;
      if (!s.onGround) lifted = true;
      if (lifted && s.onGround) { P.outcome = 'TOUCHDOWN z=' + Math.round(s.position.z) + ' x=' + Math.round(s.position.x) + ' speed=' + s.speed.toFixed(1); clearInterval(P.timer); setKeys(new Set()); return; }
      const keys = new Set();
      if (!lifted) {
        if (s.speed < 50) keys.add('KeyW');
        else if (s.throttle > 0.42) keys.add('KeyS');
        else keys.add('ArrowUp');
      } else {
        const err = wrapPi(0 - s.heading);
        if (err > 0.03) keys.add('ArrowLeft');
        else if (err < -0.03) keys.add('ArrowRight');
        const vsDes = Math.max(-4, Math.min(2, (12 - s.position.y) * 0.5));
        const pitchDes = Math.max(-0.42, Math.min(0.42, Math.asin(Math.max(-1, Math.min(1, vsDes / Math.max(30, s.speed))))));
        if (pitchDes > s.pitch + 0.015) keys.add('ArrowUp');
        else if (pitchDes < s.pitch - 0.015) keys.add('ArrowDown');
        if (s.speed > 60 && s.throttle > 0.30) keys.add('KeyS');
        else if (s.throttle < 0.27) keys.add('KeyW');
      }
      setKeys(keys);
    }, 16);
  });

  // Wait for the outcome (infrequent outside polling so rAF is not starved).
  let probe = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 200000) {
    probe = await page.evaluate(() => ({
      outcome: window.__probe.outcome,
      n: window.__probe.samples.length,
      maxSpeedPreHit: window.__probe.maxSpeedPreHit,
      maxSinkPreHit: window.__probe.maxSinkPreHit,
    }));
    if (probe.outcome) break;
    await sleep(2000);
  }
  const full = await page.evaluate(() => window.__probe);
  const state = () => page.evaluate(() => window.__game.state());
  const fin = await state();
  log('T1e outcome=', probe.outcome, 'phase=', fin.phase, 'hits=', fin.hits, 'toast=', await hudText('toast'), 'gear=', await hudText('hud-gear'));
  log('T1e max SPEED before any hit=', +full.maxSpeedPreHit.toFixed(1), '; max instantaneous SINK before any hit=', +full.maxSinkPreHit.toFixed(1));
  const firstHitIdx = full.samples.findIndex((x) => x.hits > 0);
  if (firstHitIdx >= 0) {
    log('T1e samples around first hit (idx ' + firstHitIdx + '):', JSON.stringify(full.samples.slice(Math.max(0, firstHitIdx - 6), firstHitIdx + 4)));
  } else {
    log('T1e samples around touchdown:', JSON.stringify(full.samples.slice(-8)));
  }
  // Liftoff sample (first airborne).
  const liftIdx = full.samples.findIndex((x) => !x.gnd);
  if (liftIdx >= 0) log('T1e liftoff sample:', JSON.stringify(full.samples[liftIdx]));
  log('T1e pre-hit samples:', JSON.stringify(full.samples.filter((x) => x.hits === 0)));
  if (probe.outcome && probe.outcome.startsWith('TOUCHDOWN')) {
    log('T1e TOUCH-AND-GO VERIFIED (in-page controller): gentle touchdown on the strip — landing mechanics WORK');
    // Reliftoff via CDP keys.
    await page.keyboard.down('KeyW');
    await page.keyboard.down('ArrowUp');
    let relift = null;
    const rt0 = Date.now();
    while (Date.now() - rt0 < 60000) {
      const s = await state();
      if (!s.onGround) { relift = s; break; }
      await sleep(200);
    }
    if (relift) log('T1e RELIFTOFF OK y=', relift.position.y.toFixed(1), 'speed=', relift.speed.toFixed(1), 'z=', Math.round(relift.position.z));
    else findings.push('T1e: reliftoff gagal');
    await page.keyboard.up('ArrowUp');
    await page.keyboard.up('KeyW');
  } else {
    findings.push(`T1e: touch-and-go gagal — outcome: ${probe.outcome} (max speed pre-hit ${+full.maxSpeedPreHit.toFixed(1)}, max sink pre-hit ${+full.maxSinkPreHit.toFixed(1)})`);
  }

  await page.screenshot({ path: join(outDir, 'final.png') });
  await writeFile(join(outDir, 'probe-log.txt'), LOG.join('\n'), 'utf8');
} catch (e) {
  log('PROBE ERROR', e?.stack || String(e));
  findings.push(`probe error: ${e?.message}`);
} finally {
  if (browser) await browser.close();
  server.kill();
}

log('ERRORS(' + errors.length + ')', errors.length ? JSON.stringify(errors, null, 2) : 'none');
log('FINDINGS(' + findings.length + ')');
findings.forEach((f) => log(' - ' + f));
if (errors.length || findings.length) process.exitCode = 1;
log('PROBE DONE');
