// Probe 13 for CAKRAWALA (read-only vs game code). FINAL landing verification.
//  T1d: immediate touch-and-go with speed-gated throttle cut.
//       - Roll: W to speed 50, S to throttle 0.42 (just above the 0.40
//         liftoff threshold), release.
//       - Then a FAST unified loop (poll ~50ms wall): while onGround, do
//         nothing (let it roll and lift); once airborne, cut throttle to
//         0.30 as soon as speed > 60 (before it can reach 72). Speed should
//         peak at ~60-63. Tight pitch control (deadband +/-0.015) descends
//         gently to y=12, heading-hold 0.
//       - ALL samples are saved (not just the last N) so the pre-hit state
//         is captured.
//  If this touches down gently, the landing mechanics are VERIFIED and the
//  earlier T1 failures are fully explained (speed overshoot past 72 +
//  pitch-pulse sink spikes + off-strip drift). If it still hits with
//  speed<72 and sink<7 logged at contact, the landing check is broken.
// Usage: node scripts/probe-playtest13.mjs [--port 8104] [--out /tmp/probe13]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1] || 8104);
const outDir = args[args.indexOf('--out') + 1] || '/tmp/probe-cakrawala13';
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
      await sleep(100);
    }
    throw new Error(`timeout: ${label}; last=${JSON.stringify(last)}`);
  }

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
    return { y: +s.position.y.toFixed(1), spd: +s.speed.toFixed(0), pitch: +s.pitch.toFixed(3), roll: +s.roll.toFixed(2), sinkI: sinkInst(s), sinkA: sinkAvg, z: Math.round(s.position.z), x: Math.round(s.position.x), hits: s.hits, thr: +s.throttle.toFixed(2), gnd: s.onGround };
  };

  // ---- TEST T1d: speed-gated immediate touch-and-go ------------------------
  await page.evaluate(() => window.__game.startMission('ring-run'));
  await sleep(500);
  log('T1d gear at start=', await hudText('hud-gear'));
  try {
    await page.keyboard.down('KeyW');
    await waitState((s) => s.speed >= 50, 60000, 'roll to 50');
    await page.keyboard.up('KeyW');
    await page.keyboard.down('KeyS');
    await waitState((s) => s.throttle <= 0.42, 30000, 'throttle to 0.42');
    await page.keyboard.up('KeyS');
    // Fast unified loop: no liftoff detection lag. While onGround, only
    // hold ArrowUp (pitch is forced 0 on the ground anyway). Once airborne,
    // cut throttle to 0.30 as soon as speed > 60.
    const samples = [];
    let prev = null;
    let outcome = null;
    let maxSpeedPreHit = -Infinity;
    let maxSinkPreHit = -Infinity;
    let liftLogged = false;
    const t1 = Date.now();
    while (Date.now() - t1 < 180000) {
      const s = await state();
      if (s.phase !== 'flying') { outcome = `phase ${s.phase}`; break; }
      const smp = sample(s, prev);
      samples.push(smp);
      if (s.hits === 0) {
        if (smp.spd > maxSpeedPreHit) maxSpeedPreHit = smp.spd;
        if (smp.sinkI > maxSinkPreHit) maxSinkPreHit = smp.sinkI;
      }
      prev = s;
      if (!s.onGround && !liftLogged) {
        liftLogged = true;
        log('T1d LIFTOFF y=', s.position.y.toFixed(1), 'speed=', s.speed.toFixed(1), 'throttle=', s.throttle.toFixed(2), 'z=', Math.round(s.position.z));
      }
      if (s.phase === 'crashed') { outcome = `crashed hits=${s.hits} reason=${JSON.stringify(await crashReason())}`; break; }
      if (s.onGround && liftLogged) { outcome = `TOUCHDOWN z=${Math.round(s.position.z)} x=${Math.round(s.position.x)} speed=${s.speed.toFixed(1)}`; break; }
      // Control.
      const keys = new Set();
      if (!s.onGround) {
        const err = wrapPi(0 - s.heading);
        if (err > 0.03) keys.add('ArrowLeft');
        else if (err < -0.03) keys.add('ArrowRight');
        const vsDes = Math.max(-4, Math.min(2, (12 - s.position.y) * 0.5));
        const pitchDes = Math.max(-0.42, Math.min(0.42, Math.asin(Math.max(-1, Math.min(1, vsDes / Math.max(30, s.speed))))));
        if (pitchDes > s.pitch + 0.015) keys.add('ArrowUp');
        else if (pitchDes < s.pitch - 0.015) keys.add('ArrowDown');
        // Speed-gated throttle: cut to 0.30 once airborne and speed > 60.
        if (s.speed > 60 && s.throttle > 0.30) keys.add('KeyS');
        else if (s.throttle < 0.27) keys.add('KeyW');
      } else {
        keys.add('ArrowUp');
      }
      await pilot.setKeys(keys);
      await sleep(50);
    }
    const fin = await state();
    log('T1d outcome=', outcome, 'phase=', fin.phase, 'hits=', fin.hits, 'toast=', await hudText('toast'), 'gear=', await hudText('hud-gear'));
    log('T1d max SPEED before any hit=', maxSpeedPreHit, '; max instantaneous SINK before any hit=', maxSinkPreHit);
    // Print the samples around the first hit (or touchdown) — the decisive ones.
    const firstHitIdx = samples.findIndex((x) => x.hits > 0);
    if (firstHitIdx >= 0) {
      log('T1d samples around first hit (idx ' + firstHitIdx + '):', JSON.stringify(samples.slice(Math.max(0, firstHitIdx - 6), firstHitIdx + 4)));
    } else {
      log('T1d samples around touchdown:', JSON.stringify(samples.slice(-8)));
    }
    log('T1d ALL pre-hit samples:', JSON.stringify(samples.filter((x) => x.hits === 0)));
    if (outcome && outcome.startsWith('TOUCHDOWN')) {
      log('T1d TOUCH-AND-GO VERIFIED: gentle touchdown on the strip — landing mechanics WORK');
      await page.keyboard.down('KeyW');
      await page.keyboard.down('ArrowUp');
      try {
        const relift = await waitState((s) => !s.onGround, 60000, 'reliftoff T1d');
        log('T1d RELIFTOFF OK y=', relift.position.y.toFixed(1), 'speed=', relift.speed.toFixed(1), 'z=', Math.round(relift.position.z));
      } catch (e) { findings.push(`T1d: reliftoff gagal — ${e.message}`); }
      await page.keyboard.up('ArrowUp');
    } else {
      findings.push(`T1d: touch-and-go gagal — outcome: ${outcome} (max speed pre-hit ${maxSpeedPreHit}, max sink pre-hit ${maxSinkPreHit})`);
    }
  } catch (e) {
    findings.push(`T1d: probe error — ${e.message}`);
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
