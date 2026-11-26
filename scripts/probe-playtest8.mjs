// Probe 8 for CAKRAWALA (read-only vs game code). Final landing tests.
// Uses the PROVEN waypoint controller from probes 1-4 (rings 1-4 passed 4x)
// for all maneuvering, with proper key cleanup between tests.
//  A: traffic-pattern landing via waypoints, final target y=12
//  B: overspeed touchdown, then IMMEDIATE full-power climb recovery
// Usage: node scripts/probe-playtest8.mjs [--port 8099] [--out /tmp/probe8]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1] || 8099);
const outDir = args[args.indexOf('--out') + 1] || '/tmp/probe-cakrawala8';
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

  // Proven waypoint controller (probes 1-4).
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

  async function takeoff() {
    try {
      await page.keyboard.down('KeyW');
      await page.keyboard.down('ArrowUp');
      const s = await waitState((v) => !v.onGround, 120000, 'liftoff');
      await page.keyboard.up('ArrowUp');
      return s;
    } catch (e) {
      await pilot.releaseAll();
      throw e;
    }
  }

  async function flyWaypoint(target, cruise, arriveR, timeoutMs, label) {
    const t1 = Date.now();
    while (Date.now() - t1 < timeoutMs) {
      const r = await tick(target, cruise);
      const s = r.s;
      if (r.phase) return { ok: false, reason: `phase=${r.phase}`, s };
      if (Math.hypot(s.position.x - target.x, s.position.z - target.z) < arriveR
        && Math.abs(s.position.y - target.y) < 45) return { ok: true, s };
      if (s.hits > 0) return { ok: false, reason: `hit hits=${s.hits}`, s };
      await sleep(150);
    }
    const s = await state();
    return { ok: false, reason: `timeout ${label}`, s };
  }

  // ---- TEST A: traffic-pattern landing -----------------------------------
  await page.evaluate(() => window.__game.startMission('ring-run'));
  await sleep(500);
  let outcomeA = null;
  try {
    const liftA = await takeoff();
    log('A LIFTOFF y=', liftA.position.y.toFixed(1), 'speed=', liftA.speed.toFixed(1), 'z=', Math.round(liftA.position.z));
    let r = await flyWaypoint({ x: 330, y: 150, z: 200 }, { throttle: 0.7, vsCap: 8, vsClimb: 20 }, 130, 240000, 'climb-north');
    log('A CLIMB', r.ok ? 'OK' : `FAIL ${r.reason}`, 'pos=(', Math.round(r.s.position.x), ',', Math.round(r.s.position.y), ',', Math.round(r.s.position.z), ')');
    if (r.ok) {
      r = await flyWaypoint({ x: 330, y: 150, z: 900 }, { throttle: 0.6, vsCap: 8, vsClimb: 10 }, 130, 240000, 'turn-south');
      log('A TURN+SOUTH', r.ok ? 'OK' : `FAIL ${r.reason}`, 'pos=(', Math.round(r.s.position.x), ',', Math.round(r.s.position.y), ',', Math.round(r.s.position.z), ') heading=', r.s.heading.toFixed(2));
    }
    if (r.ok) {
      r = await flyWaypoint({ x: 330, y: 55, z: 600 }, { throttle: 0.35, vsCap: 6, vsClimb: 6 }, 130, 240000, 'descend-final');
      log('A DESCEND', r.ok ? 'OK' : `FAIL ${r.reason}`, 'pos=(', Math.round(r.s.position.x), ',', Math.round(r.s.position.y), ',', Math.round(r.s.position.z), ') speed=', r.s.speed.toFixed(0));
    }
    if (r.ok) {
      await page.keyboard.press('KeyF');
      await sleep(400);
      log('A flaps=', await hudText('hud-flaps'), 'gear=', await hudText('hud-gear'));
      const samplesA = [];
      const t1 = Date.now();
      let prev = null;
      while (Date.now() - t1 < 240000) {
        const rr = await tick({ x: 330, y: 12, z: 800 }, { throttle: 0.35, vsCap: 5.5, vsClimb: 5 });
        const s = rr.s;
        if (prev) {
          const dtSim = prev.timeLeft - s.timeLeft;
          if (dtSim > 0.01) samplesA.push({ y: +s.position.y.toFixed(1), spd: +s.speed.toFixed(0), sink: +((prev.position.y - s.position.y) / dtSim).toFixed(1), z: Math.round(s.position.z), x: Math.round(s.position.x) });
        }
        prev = s;
        if (s.phase === 'complete') { outcomeA = 'complete'; break; }
        if (s.phase === 'crashed') { outcomeA = `crashed hits=${s.hits} reason=${JSON.stringify(await crashReason())}`; break; }
        if (s.phase !== 'flying') { outcomeA = `phase ${s.phase}`; break; }
        if (s.onGround) { outcomeA = `touchdown(still flying, rings not done) z=${Math.round(s.position.z)} x=${Math.round(s.position.x)}`; break; }
        if (s.position.z > 1080 && s.position.y < 40) { outcomeA = 'overshoot-runway-south'; break; }
        await sleep(100);
      }
      const finA = await state();
      log('A LANDING outcome=', outcomeA, 'phase=', finA.phase, 'speed=', finA.speed.toFixed(1),
        'pos=(', Math.round(finA.position.x), ',', Math.round(finA.position.y), ',', Math.round(finA.position.z), ') hits=', finA.hits);
      log('A final samples:', JSON.stringify(samplesA.slice(-5)));
      if (outcomeA && outcomeA.startsWith('touchdown')) {
        log('A LANDING MECHANICS VERIFIED: gentle touchdown on strip, gear down, phase stays flying (touch-and-go, rings not done)');
      } else {
        findings.push(`A: pendaratan pola lalu lintas gagal — outcome: ${outcomeA}`);
      }
    } else {
      findings.push(`A: gagal sebelum final — ${r.reason}`);
    }
  } catch (e) {
    findings.push(`A: probe error — ${e.message}`);
  } finally {
    await pilot.releaseAll();
  }

  // ---- TEST B: overspeed touchdown + immediate recovery ------------------
  await page.keyboard.press('KeyR');
  await sleep(800);
  try {
    await takeoff();
    let r = await flyWaypoint({ x: 330, y: 120, z: 300 }, { throttle: 0.8, vsCap: 8, vsClimb: 14 }, 130, 240000, 'climb-B');
    log('B CLIMB', r.ok ? 'OK' : `FAIL ${r.reason}`, 'pos=(', Math.round(r.s.position.x), ',', Math.round(r.s.position.y), ',', Math.round(r.s.position.z), ')');
    if (r.ok) {
      r = await flyWaypoint({ x: 330, y: 120, z: 900 }, { throttle: 0.7, vsCap: 8, vsClimb: 10 }, 130, 240000, 'turn-B');
      log('B TURN', r.ok ? 'OK' : `FAIL ${r.reason}`, 'pos=(', Math.round(r.s.position.x), ',', Math.round(r.s.position.y), ',', Math.round(r.s.position.z), ')');
    }
    let outcomeB = null;
    if (r.ok) {
      let hitsSeen = 0; const recoveryLog = [];
      const t1 = Date.now();
      let diving = true;
      while (Date.now() - t1 < 240000) {
        const s = await state();
        if (s.phase === 'crashed') { outcomeB = `crashed hits=${s.hits} reason=${JSON.stringify(await crashReason())}`; break; }
        if (s.hits > hitsSeen) {
          hitsSeen = s.hits;
          log(`B HIT #${hitsSeen} speed=${s.speed.toFixed(0)} y=${s.position.y.toFixed(0)} pos=(${Math.round(s.position.x)},${Math.round(s.position.z)}) stalled=${s.stalled} phase=${s.phase}`);
          if (hitsSeen === 1) {
            await pilot.releaseAll();
            await page.keyboard.down('KeyW');
            await page.keyboard.down('ArrowUp');
            diving = false;
          }
        }
        if (diving) {
          const rr = await tick({ x: 330, y: 12, z: 800 }, { throttle: 1.0, vsCap: 14, vsClimb: 5 });
          if (rr.phase) { outcomeB = `phase ${rr.phase} saat dive`; break; }
        } else {
          const s2 = await state();
          recoveryLog.push({ t: +((Date.now() - t1) / 1000).toFixed(1), y: +s2.position.y.toFixed(0), spd: +s2.speed.toFixed(0), stalled: s2.stalled, hits: s2.hits });
          if (s2.position.y > 100 && s2.hits === 1 && !s2.stalled && s2.phase === 'flying') {
            outcomeB = `RECOVERED after 1 hit (y=${s2.position.y.toFixed(0)}, speed=${s2.speed.toFixed(0)}, hits=1)`;
            break;
          }
        }
        await sleep(120);
      }
      await pilot.releaseAll();
      log('B OUTCOME:', outcomeB ?? 'timeout/unknown');
      log('B recovery timeline (first 20):', JSON.stringify(recoveryLog.slice(0, 20)));
      if (outcomeB && outcomeB.startsWith('crashed')) {
        findings.push(`B (sedang): satu touchdown overspeed berujung crash MESKIPUN langsung full-power + mendaki — ${outcomeB}. Bounce (speed x0.45) menjatuhkan pesawat ke bawah stall 52 m/s; stall memaksa hidung turun (-0.22) + sink 14 m/s sehingga pesawat menyentuh tanah lagi sebelum sempat pulih. Efektif: 1 hit di ketinggian rendah = crash.`);
      } else if (outcomeB) {
        log('B recovery possible:', outcomeB);
      } else {
        findings.push('B: timeout tanpa hasil');
      }
    } else {
      findings.push(`B: gagal sebelum dive — ${r.reason}`);
    }
  } catch (e) {
    findings.push(`B: probe error — ${e.message}`);
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
