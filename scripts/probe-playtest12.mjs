// Probe 12 for CAKRAWALA (read-only vs game code). FINAL decisive landing test.
//  T1c: immediate touch-and-go with a TIGHT steady-pitch controller
//       (deadband +/-0.015 rad, poll every ~50ms wall). Pitch pulses move the
//       pitch by ~0.02-0.04 rad, so the instantaneous sink stays within ~+/-3
//       of the target sink (~1-2 m/s) — well under the 7 m/s limit.
//       If this touches down gently, probe-10 T1's hit is proven to be my
//       sigma-delta modulator's coarse pitch pulses (probe artifact), and the
//       landing mechanics are VERIFIED. If it still hits with sink<7 and
//       speed<72 logged, the landing check itself is broken (game bug).
// Usage: node scripts/probe-playtest12.mjs [--port 8103] [--out /tmp/probe12]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1] || 8103);
const outDir = args[args.indexOf('--out') + 1] || '/tmp/probe-cakrawala12';
await mkdir(outDir, { recursive: true });
const base = `http://127.0.0.1:${port}`;
const LOG = [];
function log(...a) { const line = a.join(' '); LOG.push(line); console.log(line); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

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

  const state = () => page.evaluate(() => window.__game.state());
  const hudText = (id) => page.evaluate((i) => document.getElementById(i)?.textContent ?? null, id);
  const crashReason = () => page.evaluate(() => ({
    reason: document.getElementById('crash-reason')?.textContent ?? null,
    visible: !document.getElementById('crash-screen')?.classList.contains('hidden'),
  }));

  await page.goto(`${base}/?lite=1`, { waitUntil: 'load', timeout: 30000 });
  await sleep(2000);

  class Pilot {
    constructor() { this.held = new Set(); }
    async setKeys(want) {
      for (const k of [...this.held]) if (!want.has(k)) { await page.keyboard.up(k); this.held.delete(k); }
      for (const k of want) if (!this.held.has(k)) { await page.keyboard.down(k); this.held.add(k); }
    }
    async release() { await this.setKeys(new Set()); }
    async releaseAll() {
      await this.release();
      for (const k of ['KeyW', 'KeyS', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']) {
        try { await page.keyboard.up(k); } catch { /* ignore */ }
      }
    }
  }
  const pilot = new Pilot();

  async function waitState(pred, timeoutMs, label) {
    const t0 = Date.now();
    let last = null;
    while (Date.now() - t0 < timeoutMs) {
      last = await state();
      if (pred(last)) return last;
      await sleep(150);
    }
    throw new Error(`timeout: ${label}; last=${JSON.stringify(last)}`);
  }

  // Correct instantaneous sink: -speed*sin(pitch)*cos(roll) + 14 if stalled.
  const sinkInst = (s) => {
    const stalled = s.speed < 52 && !s.onGround;
    return +((-s.speed * Math.sin(s.pitch) * Math.cos(s.roll) + (stalled ? 14 : 0)).toFixed(1));
  };
  const sample = (s, prev) => {
    let sinkAvg = null;
    if (prev) {
      const dtSim = prev.timeLeft - s.timeLeft;
      if (dtSim > 0.01) sinkAvg = +((prev.position.y - s.position.y) / dtSim).toFixed(1);
    }
    return { y: +s.position.y.toFixed(1), spd: +s.speed.toFixed(0), pitch: +s.pitch.toFixed(3), roll: +s.roll.toFixed(2), sinkI: sinkInst(s), sinkA: sinkAvg, z: Math.round(s.position.z), x: Math.round(s.position.x), hits: s.hits, thr: +s.throttle.toFixed(2) };
  };

  // Tight steady-pitch + heading-hold controller.
  // Target: descend gently to y=12 (sink ~1-2), heading 0, throttle 0.30.
  async function tightTick() {
    const s = await state();
    if (s.phase !== 'flying') return { s, phase: s.phase };
    const keys = new Set();
    // Heading: tight deadband +/-0.03 rad.
    const err = wrapPi(0 - s.heading);
    if (err > 0.03) keys.add('ArrowLeft');
    else if (err < -0.03) keys.add('ArrowRight');
    // Pitch: target sink from altitude error, capped at 4 m/s.
    const vsDes = Math.max(-4, Math.min(2, (12 - s.position.y) * 0.5));
    const pitchDes = Math.max(-0.42, Math.min(0.42, Math.asin(Math.max(-1, Math.min(1, vsDes / Math.max(30, s.speed))))));
    if (pitchDes > s.pitch + 0.015) keys.add('ArrowUp');
    else if (pitchDes < s.pitch - 0.015) keys.add('ArrowDown');
    // Throttle: hold 0.30.
    if (s.throttle < 0.27) keys.add('KeyW');
    else if (s.throttle > 0.36) keys.add('KeyS');
    await pilot.setKeys(keys);
    return { s };
  }

  // ---- TEST T1c: tight-controller immediate touch-and-go -------------------
  await page.evaluate(() => window.__game.startMission('ring-run'));
  await sleep(500);
  log('T1c gear at start=', await hudText('hud-gear'));
  try {
    // Throttle-managed liftoff (probe 10 style): W to speed 50, S to 0.42,
    // lift, then immediately cut to 0.30 via the tight controller.
    await page.keyboard.down('KeyW');
    await waitState((s) => s.speed >= 50, 60000, 'roll to 50');
    await page.keyboard.up('KeyW');
    await page.keyboard.down('KeyS');
    await waitState((s) => s.throttle <= 0.45, 30000, 'throttle to 0.45');
    await page.keyboard.up('KeyS');
    await page.keyboard.down('ArrowUp');
    const lift = await waitState((s) => !s.onGround, 60000, 'liftoff T1c');
    await page.keyboard.up('ArrowUp');
    log('T1c LIFTOFF y=', lift.position.y.toFixed(1), 'speed=', lift.speed.toFixed(1), 'throttle=', lift.throttle.toFixed(2), 'z=', Math.round(lift.position.z), 'gear=', await hudText('hud-gear'));
    const samples = [];
    let prev = null;
    let outcome = null;
    let maxSinkI = -Infinity;
    let maxSinkBeforeHit = -Infinity;
    const t1 = Date.now();
    while (Date.now() - t1 < 180000) {
      const r = await tightTick();
      const s = r.s;
      const smp = sample(s, prev);
      samples.push(smp);
      if (s.hits === 0 && smp.sinkI > maxSinkBeforeHit) maxSinkBeforeHit = smp.sinkI;
      if (smp.sinkI > maxSinkI) maxSinkI = smp.sinkI;
      prev = s;
      if (s.phase === 'crashed') { outcome = `crashed hits=${s.hits} reason=${JSON.stringify(await crashReason())}`; break; }
      if (s.phase !== 'flying') { outcome = `phase ${s.phase}`; break; }
      if (s.onGround) { outcome = `TOUCHDOWN z=${Math.round(s.position.z)} x=${Math.round(s.position.x)} speed=${s.speed.toFixed(1)}`; break; }
      await sleep(50);
    }
    const fin = await state();
    log('T1c outcome=', outcome, 'phase=', fin.phase, 'hits=', fin.hits, 'toast=', await hudText('toast'), 'gear=', await hudText('hud-gear'));
    log('T1c max instantaneous sink (all samples)=', maxSinkI, '; max sink BEFORE any hit=', maxSinkBeforeHit);
    log('T1c last samples:', JSON.stringify(samples.slice(-10)));
    if (outcome && outcome.startsWith('TOUCHDOWN')) {
      log('T1c TOUCH-AND-GO VERIFIED: gentle touchdown on the strip with a steady pitch — probe-10 T1 was my modulator artifact');
      // Reliftoff: prove the roll-on works.
      await page.keyboard.down('KeyW');
      await page.keyboard.down('ArrowUp');
      try {
        const relift = await waitState((s) => !s.onGround, 60000, 'reliftoff T1c');
        log('T1c RELIFTOFF OK y=', relift.position.y.toFixed(1), 'speed=', relift.speed.toFixed(1), 'z=', Math.round(relift.position.z));
      } catch (e) { findings.push(`T1c: reliftoff gagal — ${e.message}`); }
      await page.keyboard.up('ArrowUp');
    } else {
      findings.push(`T1c: touch-and-go gagal — outcome: ${outcome} (max sink before hit ${maxSinkBeforeHit})`);
    }
  } catch (e) {
    findings.push(`T1c: probe error — ${e.message}`);
  } finally {
    await pilot.releaseAll();
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
