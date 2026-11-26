// Probe 11 for CAKRAWALA (read-only vs game code). DECISIVE landing diagnostic.
//  T1b: touch-and-go with the WAYPOINT controller (steady pitch, no sigma-delta
//       pulses). Logs pitch/roll/speed/y + instantaneous sink at every poll,
//       and the HUD gear state. If this touches down gently, probe-10 T1 was
//       my modulator's pitch oscillation (probe artifact). If it still hits
//       with sink<7 and speed<72, the landing check itself is broken.
//  T2b: full rectangular pattern ending in a SOUTHBOUND final (descend from
//       y=60 at z~200, touchdown ~z=765 on the strip).
// Usage: node scripts/probe-playtest11.mjs [--port 8102] [--out /tmp/probe11]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1] || 8102);
const outDir = args[args.indexOf('--out') + 1] || '/tmp/probe-cakrawala11';
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

  // Waypoint controller (steady pitch within +/-0.05 of target).
  async function tick(target, cruise) {
    const s = await state();
    if (s.phase !== 'flying') return { s, phase: s.phase };
    const dx = target.x - s.position.x;
    const dz = target.z - s.position.z;
    const desiredH = Math.atan2(-dx, -dz);
    const err = wrapPi(desiredH - s.heading);
    const vsDes = Math.max(-(cruise.vsCap ?? 10), Math.min(cruise.vsClimb ?? 14, (target.y - s.position.y) * 0.3));
    const pitchDes = Math.max(-0.42, Math.min(0.42, Math.asin(Math.max(-1, Math.min(1, vsDes / Math.max(30, s.speed))))));
    const keys = new Set();
    if (err > 0.10) keys.add('ArrowLeft');
    else if (err < -0.10) keys.add('ArrowRight');
    if (pitchDes > s.pitch + 0.05) keys.add('ArrowUp');
    else if (pitchDes < s.pitch - 0.05) keys.add('ArrowDown');
    if (s.throttle < cruise.throttle - 0.03) keys.add('KeyW');
    else if (s.throttle > cruise.throttle + 0.06) keys.add('KeyS');
    await pilot.setKeys(keys);
    return { s };
  }

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

  // Instantaneous sink from the flight model: -speed*sin(pitch)*cos(roll)
  // (plus -14 if stalled; state has no stalled flag, speed<52 implies it).
  const sinkInst = (s) => {
    let v = -s.speed * Math.sin(s.pitch) * Math.cos(s.roll);
    if (s.speed < 52 && !s.onGround) v -= 14;
    return +v.toFixed(1);
  };
  const sample = (s, prev) => {
    let sinkAvg = null;
    if (prev) {
      const dtSim = prev.timeLeft - s.timeLeft;
      if (dtSim > 0.01) sinkAvg = +((prev.position.y - s.position.y) / dtSim).toFixed(1);
    }
    return { y: +s.position.y.toFixed(1), spd: +s.speed.toFixed(0), pitch: +s.pitch.toFixed(3), roll: +s.roll.toFixed(2), sinkI: sinkInst(s), sinkA: sinkAvg, z: Math.round(s.position.z), x: Math.round(s.position.x), hits: s.hits };
  };

  // ---- TEST T1b: waypoint touch-and-go ------------------------------------
  await page.evaluate(() => window.__game.startMission('ring-run'));
  await sleep(500);
  log('T1b gear at start=', await hudText('hud-gear'));
  try {
    await page.keyboard.down('KeyW');
    await page.keyboard.down('ArrowUp');
    const lift = await waitState((s) => !s.onGround, 120000, 'liftoff T1b');
    await page.keyboard.up('ArrowUp');
    log('T1b LIFTOFF y=', lift.position.y.toFixed(1), 'speed=', lift.speed.toFixed(1), 'throttle=', lift.throttle.toFixed(2), 'z=', Math.round(lift.position.z), 'gear=', await hudText('hud-gear'));
    const samples = [];
    let prev = null;
    let outcome = null;
    const t1 = Date.now();
    while (Date.now() - t1 < 180000) {
      const r = await tick({ x: 330, y: 12, z: 700 }, { throttle: 0.30, vsCap: 5, vsClimb: 5 });
      const s = r.s;
      samples.push(sample(s, prev));
      prev = s;
      if (s.phase === 'crashed') { outcome = `crashed hits=${s.hits} reason=${JSON.stringify(await crashReason())}`; break; }
      if (s.phase !== 'flying') { outcome = `phase ${s.phase}`; break; }
      if (s.onGround) { outcome = `TOUCHDOWN z=${Math.round(s.position.z)} x=${Math.round(s.position.x)} speed=${s.speed.toFixed(1)}`; break; }
      await sleep(80);
    }
    const fin = await state();
    log('T1b outcome=', outcome, 'phase=', fin.phase, 'hits=', fin.hits, 'toast=', await hudText('toast'), 'gear=', await hudText('hud-gear'));
    log('T1b last samples:', JSON.stringify(samples.slice(-8)));
    if (outcome && outcome.startsWith('TOUCHDOWN')) {
      log('T1b TOUCH-AND-GO VERIFIED: gentle touchdown on the strip (waypoint controller, steady pitch)');
    } else {
      findings.push(`T1b: touch-and-go gagal — outcome: ${outcome}`);
    }
    // If touchdown happened, lift off again to prove the roll-on works.
    if (outcome && outcome.startsWith('TOUCHDOWN')) {
      await page.keyboard.down('KeyW');
      await page.keyboard.down('ArrowUp');
      try {
        const relift = await waitState((s) => !s.onGround, 60000, 'reliftoff T1b');
        log('T1b RELIFTOFF OK y=', relift.position.y.toFixed(1), 'speed=', relift.speed.toFixed(1), 'z=', Math.round(relift.position.z));
      } catch (e) { findings.push(`T1b: reliftoff gagal — ${e.message}`); }
      await page.keyboard.up('ArrowUp');
    }
  } catch (e) {
    findings.push(`T1b: probe error — ${e.message}`);
  } finally {
    await pilot.releaseAll();
  }

  // ---- TEST T2b: rectangular pattern, SOUTHBOUND final --------------------
  await page.keyboard.press('KeyR');
  await sleep(800);
  try {
    await page.keyboard.down('KeyW');
    await page.keyboard.down('ArrowUp');
    await waitState((s) => !s.onGround, 120000, 'liftoff T2b');
    await page.keyboard.up('ArrowUp');

    async function leg(name, target, cruise, arrive, timeoutMs = 240000) {
      let ok = false; let fail = null;
      const t1 = Date.now();
      while (Date.now() - t1 < timeoutMs) {
        const r = await tick(target, cruise);
        const s = r.s;
        if (r.phase) { fail = `phase=${r.phase}`; break; }
        if (s.hits > 0) { fail = `hit hits=${s.hits}`; break; }
        if (arrive(s)) { ok = true; break; }
        await sleep(150);
      }
      if (!ok && !fail) fail = 'timeout';
      const s = await state();
      log(`T2b ${name}`, ok ? 'OK' : `FAIL ${fail}`, JSON.stringify({ x: Math.round(s.position.x), y: Math.round(s.position.y), z: Math.round(s.position.z), hdg: +s.heading.toFixed(2), spd: Math.round(s.speed) }));
      return ok;
    }

    let ok = await leg('CLIMB', { x: 330, y: 150, z: 200 }, { throttle: 0.7, vsCap: 8, vsClimb: 20 },
      (s) => Math.hypot(s.position.x - 330, s.position.z - 200) < 80 && Math.abs(s.position.y - 150) < 30);
    if (ok) ok = await leg('SOUTH', { x: 330, y: 150, z: 1150 }, { throttle: 0.6, vsCap: 8, vsClimb: 10 },
      (s) => Math.hypot(s.position.x - 330, s.position.z - 1150) < 100 && Math.abs(wrapPi(Math.PI - s.heading)) < 0.3);
    if (ok) ok = await leg('DESCEND', { x: 330, y: 60, z: 1400 }, { throttle: 0.35, vsCap: 6, vsClimb: 6 },
      (s) => Math.hypot(s.position.x - 330, s.position.z - 1400) < 100 && Math.abs(s.position.y - 60) < 20);
    if (ok) ok = await leg('NORTH', { x: 330, y: 60, z: 900 }, { throttle: 0.35, vsCap: 6, vsClimb: 6 },
      (s) => Math.abs(wrapPi(0 - s.heading)) < 0.25 && Math.abs(s.position.x - 330) < 60 && s.position.z < 1000);
    if (ok) ok = await leg('NORTH-EXTEND', { x: 330, y: 60, z: 100 }, { throttle: 0.35, vsCap: 6, vsClimb: 6 },
      (s) => Math.abs(s.position.z - 100) < 100 && Math.abs(s.position.x - 330) < 60);
    if (ok) {
      await page.keyboard.press('KeyF');
      await sleep(400);
      log('T2b flaps=', await hudText('hud-flaps'), 'gear=', await hudText('hud-gear'));
      // Southbound final: turn 180 and descend to (330,12,900).
      const samples = [];
      let prev = null;
      let outcome = null;
      const t1 = Date.now();
      while (Date.now() - t1 < 240000) {
        const r = await tick({ x: 330, y: 12, z: 900 }, { throttle: 0.35, vsCap: 5.5, vsClimb: 5 });
        const s = r.s;
        samples.push(sample(s, prev));
        prev = s;
        if (s.phase === 'complete') { outcome = 'COMPLETE'; break; }
        if (s.phase === 'crashed') { outcome = `crashed hits=${s.hits} reason=${JSON.stringify(await crashReason())}`; break; }
        if (s.phase !== 'flying') { outcome = `phase ${s.phase}`; break; }
        if (s.onGround) { outcome = `TOUCHDOWN z=${Math.round(s.position.z)} x=${Math.round(s.position.x)} speed=${s.speed.toFixed(1)}`; break; }
        if (s.position.z > 1200 && s.position.y < 40) { outcome = 'overshoot-south'; break; }
        await sleep(80);
      }
      const fin = await state();
      log('T2b FINAL outcome=', outcome, 'phase=', fin.phase, 'speed=', fin.speed.toFixed(1),
        'pos=(', Math.round(fin.position.x), ',', Math.round(fin.position.y), ',', Math.round(fin.position.z), ') hits=', fin.hits);
      log('T2b final samples:', JSON.stringify(samples.slice(-6)));
      if (outcome && (outcome.startsWith('TOUCHDOWN') || outcome === 'COMPLETE')) {
        log('T2b LANDING VERIFIED from a full rectangular pattern (southbound final)');
      } else {
        findings.push(`T2b: pendaratan pola gagal — outcome: ${outcome}`);
      }
    } else {
      findings.push('T2b: gagal sebelum final');
    }
  } catch (e) {
    findings.push(`T2b: probe error — ${e.message}`);
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
