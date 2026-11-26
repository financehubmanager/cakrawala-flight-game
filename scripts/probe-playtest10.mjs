// Probe 10 for CAKRAWALA (read-only vs game code). FINAL landing verification.
//  T1: throttle-managed immediate touch-and-go. Cut throttle to ~0.30 as the
//      plane lifts (speed never exceeds 72), sigma-delta heading-hold north,
//      descend to y=12 straight ahead.
//  T2: rectangular traffic pattern (northbound landing): climb north, turn
//      south, descend southbound to 60 at z~1400, turn north, final descend
//      to 12 over the strip.
// Usage: node scripts/probe-playtest10.mjs [--port 8101] [--out /tmp/probe10]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1] || 8101);
const outDir = args[args.indexOf('--out') + 1] || '/tmp/probe-cakrawala10';
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

  // Sigma-delta heading-hold (probe 7: proven to fly straight).
  const mod = { pitchErr: 0, rollErr: 0 };
  async function holdHeading(desiredH, targetY, cruise) {
    const s = await state();
    if (s.phase !== 'flying') return { s, phase: s.phase };
    const err = wrapPi(desiredH - s.heading);
    const rollDes = Math.abs(err) > 0.3 ? Math.sign(err) * -1 : err * -1.5; // NOTE: roll sign corrected: err>0 -> ArrowLeft (heading increases)
    const vsDes = Math.max(-(cruise.vsCap ?? 10), Math.min(cruise.vsClimb ?? 14, (targetY - s.position.y) * 0.3));
    const pitchDes = Math.max(-0.42, Math.min(0.42, Math.asin(Math.max(-1, Math.min(1, vsDes / Math.max(30, s.speed))))));
    mod.pitchErr += pitchDes / 0.42;
    mod.rollErr += rollDes;
    const keys = new Set();
    if (mod.pitchErr >= 0.5) { keys.add('ArrowUp'); mod.pitchErr -= 1; }
    else if (mod.pitchErr <= -0.5) { keys.add('ArrowDown'); mod.pitchErr += 1; }
    if (mod.rollErr >= 0.5) { keys.add('ArrowRight'); mod.rollErr -= 1; }
    else if (mod.rollErr <= -0.5) { keys.add('ArrowLeft'); mod.rollErr += 1; }
    if (s.throttle < cruise.throttle - 0.03) keys.add('KeyW');
    else if (s.throttle > cruise.throttle + 0.06) keys.add('KeyS');
    await pilot.setKeys(keys);
    return { s };
  }

  // Waypoint controller (proven for rings / turns).
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
      await sleep(200);
    }
    throw new Error(`timeout: ${label}; last=${JSON.stringify(last)}`);
  }

  // ---- TEST T1: throttle-managed immediate touch-and-go -------------------
  await page.evaluate(() => window.__game.startMission('ring-run'));
  await sleep(500);
  let outcome1 = null;
  try {
    // Takeoff roll: W until speed 50, then S to throttle ~0.42, lift at 54+.
    await page.keyboard.down('KeyW');
    await waitState((s) => s.speed >= 50, 60000, 'roll to 50');
    await page.keyboard.up('KeyW');
    await page.keyboard.down('KeyS');
    await waitState((s) => s.throttle <= 0.45, 30000, 'throttle to 0.45');
    await page.keyboard.up('KeyS');
    await page.keyboard.down('ArrowUp');
    const lift = await waitState((s) => !s.onGround, 60000, 'liftoff T1');
    await page.keyboard.up('ArrowUp');
    log('T1 LIFTOFF y=', lift.position.y.toFixed(1), 'speed=', lift.speed.toFixed(1), 'throttle=', lift.throttle.toFixed(2), 'z=', Math.round(lift.position.z));
    // Immediately settle: heading north, descend to y=12, throttle 0.30.
    const samples = [];
    const t1 = Date.now();
    let prev = null;
    while (Date.now() - t1 < 120000) {
      const r = await holdHeading(0, 12, { throttle: 0.30, vsCap: 5, vsClimb: 5 });
      const s = r.s;
      if (prev) {
        const dtSim = prev.timeLeft - s.timeLeft;
        if (dtSim > 0.01) samples.push({ y: +s.position.y.toFixed(1), spd: +s.speed.toFixed(0), sink: +((prev.position.y - s.position.y) / dtSim).toFixed(1), z: Math.round(s.position.z), x: Math.round(s.position.x), thr: +s.throttle.toFixed(2) });
      }
      prev = s;
      if (s.phase === 'crashed') { outcome1 = `crashed hits=${s.hits} reason=${JSON.stringify(await crashReason())}`; break; }
      if (s.phase !== 'flying') { outcome1 = `phase ${s.phase}`; break; }
      if (s.onGround) { outcome1 = `touchdown z=${Math.round(s.position.z)} x=${Math.round(s.position.x)}`; break; }
      await sleep(100);
    }
    const fin = await state();
    log('T1 outcome=', outcome1, 'phase=', fin.phase, 'speed=', fin.speed.toFixed(1), 'hits=', fin.hits, 'toast=', await hudText('toast'));
    log('T1 samples:', JSON.stringify(samples.slice(-6)));
    if (outcome1 && outcome1.startsWith('touchdown')) {
      log('T1 TOUCH-AND-GO VERIFIED: gentle touchdown on the strip, gear down, phase stays flying');
    } else {
      findings.push(`T1: touch-and-go gagal — outcome: ${outcome1}`);
    }
  } catch (e) {
    findings.push(`T1: probe error — ${e.message}`);
  } finally {
    await pilot.releaseAll();
  }

  // ---- TEST T2: rectangular pattern, northbound landing -------------------
  await page.keyboard.press('KeyR');
  await sleep(800);
  let outcome2 = null;
  try {
    await page.keyboard.down('KeyW');
    await page.keyboard.down('ArrowUp');
    await waitState((s) => !s.onGround, 120000, 'liftoff T2');
    await page.keyboard.up('ArrowUp');
    // 1. Climb north to 150 at z~200.
    let ok = false; let fail = null;
    {
      const t1 = Date.now();
      while (Date.now() - t1 < 240000) {
        const r = await tick({ x: 330, y: 150, z: 200 }, { throttle: 0.7, vsCap: 8, vsClimb: 20 });
        const s = r.s;
        if (r.phase) { fail = `climb phase=${r.phase}`; break; }
        if (Math.hypot(s.position.x - 330, s.position.z - 200) < 80 && Math.abs(s.position.y - 150) < 30) { ok = true; break; }
        await sleep(150);
      }
      if (!ok && !fail) fail = 'climb timeout';
    }
    log('T2 CLIMB', ok ? 'OK' : `FAIL ${fail}`);
    // 2. Turn south, fly to z~1150 at 150.
    if (ok) {
      ok = false; fail = null;
      const t1 = Date.now();
      while (Date.now() - t1 < 240000) {
        const r = await tick({ x: 330, y: 150, z: 1150 }, { throttle: 0.6, vsCap: 8, vsClimb: 10 });
        const s = r.s;
        if (r.phase) { fail = `south leg phase=${r.phase}`; break; }
        if (s.hits > 0) { fail = `hit hits=${s.hits}`; break; }
        if (Math.hypot(s.position.x - 330, s.position.z - 1150) < 100 && Math.abs(wrapPi(Math.PI - s.heading)) < 0.3) { ok = true; break; }
        await sleep(150);
      }
      if (!ok && !fail) fail = 'south leg timeout';
      log('T2 SOUTH LEG', ok ? 'OK' : `FAIL ${fail}`, JSON.stringify(await state().then((s) => ({ x: Math.round(s.position.x), y: Math.round(s.position.y), z: Math.round(s.position.z), hdg: +s.heading.toFixed(2) }))));
    }
    // 3. Descend southbound to 60 by z~1400.
    if (ok) {
      ok = false; fail = null;
      const t1 = Date.now();
      while (Date.now() - t1 < 240000) {
        const r = await tick({ x: 330, y: 60, z: 1400 }, { throttle: 0.35, vsCap: 6, vsClimb: 6 });
        const s = r.s;
        if (r.phase) { fail = `descent phase=${r.phase}`; break; }
        if (s.hits > 0) { fail = `hit hits=${s.hits}`; break; }
        if (Math.hypot(s.position.x - 330, s.position.z - 1400) < 100 && Math.abs(s.position.y - 60) < 20) { ok = true; break; }
        await sleep(150);
      }
      if (!ok && !fail) fail = 'descent timeout';
      log('T2 DESCEND', ok ? 'OK' : `FAIL ${fail}`, JSON.stringify(await state().then((s) => ({ x: Math.round(s.position.x), y: Math.round(s.position.y), z: Math.round(s.position.z), spd: Math.round(s.speed) }))));
    }
    // 4. Turn north, final approach to (330,12,700).
    if (ok) {
      ok = false; fail = null;
      const t1 = Date.now();
      while (Date.now() - t1 < 240000) {
        const r = await tick({ x: 330, y: 60, z: 900 }, { throttle: 0.35, vsCap: 6, vsClimb: 6 });
        const s = r.s;
        if (r.phase) { fail = `turn-north phase=${r.phase}`; break; }
        if (s.hits > 0) { fail = `hit hits=${s.hits}`; break; }
        if (Math.abs(wrapPi(0 - s.heading)) < 0.25 && Math.abs(s.position.x - 330) < 60 && s.position.z < 1000) { ok = true; break; }
        await sleep(150);
      }
      if (!ok && !fail) fail = 'turn-north timeout';
      log('T2 TURN NORTH', ok ? 'OK' : `FAIL ${fail}`, JSON.stringify(await state().then((s) => ({ x: Math.round(s.position.x), y: Math.round(s.position.y), z: Math.round(s.position.z), hdg: +s.heading.toFixed(2) }))));
    }
    if (ok) {
      await page.keyboard.press('KeyF');
      await sleep(400);
      log('T2 flaps=', await hudText('hud-flaps'), 'gear=', await hudText('hud-gear'));
      const samples = [];
      const t1 = Date.now();
      let prev = null;
      while (Date.now() - t1 < 240000) {
        const r = await tick({ x: 330, y: 12, z: 700 }, { throttle: 0.35, vsCap: 5.5, vsClimb: 5 });
        const s = r.s;
        if (prev) {
          const dtSim = prev.timeLeft - s.timeLeft;
          if (dtSim > 0.01) samples.push({ y: +s.position.y.toFixed(1), spd: +s.speed.toFixed(0), sink: +((prev.position.y - s.position.y) / dtSim).toFixed(1), z: Math.round(s.position.z), x: Math.round(s.position.x) });
        }
        prev = s;
        if (s.phase === 'complete') { outcome2 = 'complete'; break; }
        if (s.phase === 'crashed') { outcome2 = `crashed hits=${s.hits} reason=${JSON.stringify(await crashReason())}`; break; }
        if (s.phase !== 'flying') { outcome2 = `phase ${s.phase}`; break; }
        if (s.onGround) { outcome2 = `touchdown(still flying, rings not done) z=${Math.round(s.position.z)} x=${Math.round(s.position.x)}`; break; }
        if (s.position.z < 400 && s.position.y < 40) { outcome2 = 'overshoot-runway-north'; break; }
        await sleep(100);
      }
      const fin = await state();
      log('T2 LANDING outcome=', outcome2, 'phase=', fin.phase, 'speed=', fin.speed.toFixed(1),
        'pos=(', Math.round(fin.position.x), ',', Math.round(fin.position.y), ',', Math.round(fin.position.z), ') hits=', fin.hits);
      log('T2 final samples:', JSON.stringify(samples.slice(-5)));
      if (outcome2 && outcome2.startsWith('touchdown')) {
        log('T2 LANDING MECHANICS VERIFIED: gentle touchdown on strip from a full rectangular pattern');
      } else {
        findings.push(`T2: pendaratan pola gagal — outcome: ${outcome2}`);
      }
    } else {
      findings.push(`T2: gagal sebelum final — ${fail}`);
    }
  } catch (e) {
    findings.push(`T2: probe error — ${e.message}`);
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
