// Probe 3 for CAKRAWALA (read-only vs game code).
//  C2: clean touch-and-go (stay over the runway, phase-checked, slow first)
//  D2: deliberate overspeed touchdown -> attempt recovery (full power + climb)
//  E2: full mission with waypoint autopilot v2 (east detour for leg 4->5,
//      midpoint waypoint for leg 5->6) + landing -> complete screen.
// Usage: node scripts/probe-playtest3.mjs [--port 8094] [--out /tmp/probe3]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1] || 8094);
const outDir = args[args.indexOf('--out') + 1] || '/tmp/probe-cakrawala3';
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

const RINGS = [
  { x: 330, z: 620, radius: 26, clearance: 60 },
  { x: 120, z: 180, radius: 26, clearance: 70 },
  { x: -260, z: -120, radius: 24, clearance: 80 },
  { x: -620, z: -380, radius: 24, clearance: 90 },
  { x: -820, z: -560, radius: 26, clearance: 110 },
  { x: -420, z: -820, radius: 24, clearance: 80 },
  { x: 40, z: -620, radius: 26, clearance: 70 },
  { x: 330, z: -120, radius: 28, clearance: 60 },
];

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
  const heights = await page.evaluate(async (pts) => {
    const m = await import('/src/terrain.js');
    return pts.map(([x, z]) => m.heightAt(x, z));
  }, RINGS.map((r) => [r.x, r.z]));
  RINGS.forEach((r, i) => { r.y = Math.max(heights[i] + r.clearance, 60); });

  class Pilot {
    constructor() { this.held = new Set(); }
    async setKeys(want) {
      for (const k of [...this.held]) if (!want.has(k)) { await page.keyboard.up(k); this.held.delete(k); }
      for (const k of want) if (!this.held.has(k)) { await page.keyboard.down(k); this.held.add(k); }
    }
    async release() { await this.setKeys(new Set()); }
  }
  const pilot = new Pilot();

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
      await sleep(250);
    }
    throw new Error(`timeout: ${label}; last=${JSON.stringify(last)}`);
  }

  async function takeoff() {
    await page.keyboard.down('KeyW');
    await page.keyboard.down('ArrowUp');
    const s = await waitState((v) => !v.onGround, 120000, 'liftoff');
    await page.keyboard.up('ArrowUp');
    return s;
  }

  // ---- TEST C2: clean touch-and-go --------------------------------------
  await page.evaluate(() => window.__game.startMission('ring-run'));
  await sleep(500);
  await takeoff();
  // Climb while staying over the south half of the strip (target behind-north
  // is capped: aim at z=950 so we never leave the runway area).
  {
    const t1 = Date.now();
    let ok = false;
    while (Date.now() - t1 < 120000) {
      const r = await tick({ x: 330, y: 85, z: 950 }, { throttle: 0.65, vsCap: 8, vsClimb: 12 });
      if (r.phase) { log('C2 climb phase=', r.phase); break; }
      if (r.s.position.y > 80) { ok = true; break; }
      await sleep(150);
    }
    log('C2 climbed ok=', ok);
  }
  await pilot.release();
  // Slow to 55-65 while level, still over the strip.
  await page.keyboard.down('KeyS');
  let slow = null;
  try {
    slow = await waitState((s) => (s.speed <= 62 && s.phase === 'flying') || s.phase !== 'flying', 60000, 'slow');
    log('C2 SLOWED speed=', slow.speed.toFixed(1), 'throttle=', slow.throttle.toFixed(2),
      'y=', slow.position.y.toFixed(0), 'z=', Math.round(slow.position.z), 'phase=', slow.phase);
  } catch (e) { log('C2 slow timeout:', e.message); }
  await page.keyboard.up('KeyS');
  await page.keyboard.press('KeyF');
  await sleep(400);
  log('C2 flaps=', await hudText('hud-flaps'), 'gear=', await hudText('hud-gear'));
  let landedC = null; let crashC = null;
  {
    const t1 = Date.now();
    while (Date.now() - t1 < 120000) {
      const r = await tick({ x: 330, y: 15, z: 800 }, { throttle: 0.35, vsCap: 5.5, vsClimb: 5 });
      const s = r.s;
      if (s.phase === 'crashed') { crashC = { ...s, ...(await crashReason()) }; break; }
      if (s.phase !== 'flying') break;
      if (s.onGround) { landedC = s; break; }
      await sleep(150);
    }
  }
  await pilot.release();
  await page.keyboard.up('KeyW');
  if (landedC) {
    log('C2 TOUCH-AND-GO OK phase=', landedC.phase, 'speed=', landedC.speed.toFixed(1),
      'pos=(', Math.round(landedC.position.x), ',', Math.round(landedC.position.y), ',', Math.round(landedC.position.z), ')',
      'hits=', landedC.hits, 'toast=', await hudText('toast'));
  } else {
    findings.push(`C2: touch-and-go bersih GAGAL — ${crashC ? `crash ${JSON.stringify(crashC)}` : 'timeout'}`);
  }

  // ---- TEST D2: overspeed touchdown + recovery ---------------------------
  // Take off from the roll, climb to 120 over the strip, dive fast.
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ArrowUp');
  try { await waitState((s) => !s.onGround, 120000, 'liftoff D2'); } catch (e) { log('D2 liftoff timeout:', e.message); }
  await page.keyboard.up('ArrowUp');
  {
    const t1 = Date.now();
    while (Date.now() - t1 < 120000) {
      const r = await tick({ x: 330, y: 120, z: 900 }, { throttle: 0.8, vsCap: 8, vsClimb: 14 });
      if (r.phase) { log('D2 climb phase=', r.phase); break; }
      if (r.s.position.y > 110) break;
      await sleep(150);
    }
  }
  let hitsSeen = 0; let outcomeD = null; let diveSpeed = null;
  {
    const t1 = Date.now();
    let diving = true;
    while (Date.now() - t1 < 150000) {
      const s = await state();
      if (s.phase === 'crashed') { outcomeD = `crashed hits=${s.hits} reason=${JSON.stringify(await crashReason())}`; break; }
      if (s.hits > hitsSeen) {
        hitsSeen = s.hits;
        log(`D2 HIT #${hitsSeen} speed=${s.speed.toFixed(0)} y=${s.position.y.toFixed(0)} pos=(${Math.round(s.position.x)},${Math.round(s.position.z)}) stalled=${s.stalled}`);
        if (hitsSeen === 1) {
          await pilot.release();
          await page.keyboard.down('KeyW');
          await page.keyboard.down('ArrowUp');
          diving = false;
        }
      }
      if (diving) {
        const r = await tick({ x: 330, y: 15, z: 800 }, { throttle: 1.0, vsCap: 14, vsClimb: 5 });
        if (r.s && !r.phase) diveSpeed = r.s.speed;
      } else {
        const s2 = await state();
        if (s2.position.y > 100 && s2.hits === 1 && !s2.stalled) { outcomeD = 'RECOVERED after 1 hit (climbed away, y>100, not stalled)'; break; }
        if (s2.hits >= 3) { outcomeD = `crashed during recovery, hits=${s2.hits}`; break; }
      }
      await sleep(150);
    }
  }
  await pilot.release();
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ArrowUp');
  log('D2 diveSpeed~', diveSpeed === null ? '?' : diveSpeed.toFixed(0), 'OUTCOME:', outcomeD ?? 'timeout/unknown');
  if (outcomeD && outcomeD.startsWith('crashed')) {
    findings.push(`D2 (sedang): satu touchdown keras (overspeed) berujung crash tak terhindarkan — ${outcomeD}. Setelah bounce (speed x0.45) pesawat stall (<52 m/s) dan menabrak lagi 2x dalam ~1-2 detik sim; tidak ada jendela pulih.`);
  } else if (outcomeD) {
    log('D2 recovery possible:', outcomeD);
  }

  // ---- TEST E2: full mission, waypoint autopilot v2 ----------------------
  await page.keyboard.press('KeyR');
  await sleep(800);
  await takeoff();
  // Waypoints per leg (extra points keep the plane on flyable lines).
  const LEGS = [
    [RINGS[0]],
    [RINGS[1]],
    [RINGS[2]],
    [RINGS[3]],
    [{ x: -450, y: 380, z: -480 }, RINGS[4]], // east detour, climb before ring 5
    [{ x: -620, y: 300, z: -690 }, RINGS[5]], // stay on the 5->6 line, no wide turn
    [RINGS[6]],
    [RINGS[7]],
  ];
  let failE = null;
  for (let i = 0; i < 8; i += 1) {
    for (const wp of LEGS[i]) {
      const isRing = wp === RINGS[i];
      const t1 = Date.now();
      let done = false;
      while (Date.now() - t1 < 240000) {
        const r = await tick(wp, { throttle: 0.65, vsCap: 10, vsClimb: 28 });
        const s = r.s;
        if (s.phase === 'crashed') { failE = `crash menuju ring ${i + 1} (wp ${JSON.stringify(wp)}) hits=${s.hits} reason=${JSON.stringify(await crashReason())}`; break; }
        if (s.phase !== 'flying') { failE = `phase ${s.phase} menuju ring ${i + 1}`; break; }
        if (isRing && s.ringsPassed > i) { done = true; break; }
        if (!isRing && Math.hypot(s.position.x - wp.x, s.position.z - wp.z) < 70 && Math.abs(s.position.y - wp.y) < 40) { done = true; break; }
        if (s.hits > 0) log(`E2 ring ${i + 1}: HIT hits=${s.hits} pos=(${Math.round(s.position.x)},${Math.round(s.position.y)},${Math.round(s.position.z)}) fuel=${s.fuel.toFixed(2)}`);
        await sleep(150);
      }
      if (failE) break;
      if (!done) { failE = `waypoint/cincin ${i + 1} tidak tercapai (${JSON.stringify(wp)})`; break; }
    }
    const s = await state();
    log(`E2 RING ${i + 1}/8 ${s.ringsPassed > i ? 'PASSED' : 'GAGAL'} score=${s.score} fuel=${s.fuel.toFixed(3)} timeLeft=${Math.round(s.timeLeft)} pos=(${Math.round(s.position.x)},${Math.round(s.position.y)},${Math.round(s.position.z)})`);
    if (failE) break;
  }
  await pilot.release();
  if (!failE) {
    log('E2 ALL RINGS DONE objective=', await hudText('hud-objective'));
    await page.keyboard.press('KeyF');
    await sleep(400);
    log('E2 flaps=', await hudText('hud-flaps'), 'gear=', await hudText('hud-gear'));
    let outcome = null;
    {
      const t1 = Date.now();
      while (Date.now() - t1 < 180000) {
        const r = await tick({ x: 330, y: 55, z: 520 }, { throttle: 0.35, vsCap: 6, vsClimb: 6 });
        const s = r.s;
        if (s.phase !== 'flying') { outcome = s.phase; break; }
        if (Math.hypot(s.position.x - 330, s.position.z - 520) < 60 && s.position.y < 70) break;
        await sleep(150);
      }
    }
    {
      const t1 = Date.now();
      while (Date.now() - t1 < 240000) {
        const r = await tick({ x: 330, y: 16, z: 800 }, { throttle: 0.35, vsCap: 5.5, vsClimb: 5 });
        const s = r.s;
        if (s.phase === 'complete') { outcome = 'complete'; break; }
        if (s.phase === 'crashed') { outcome = `crashed hits=${s.hits} reason=${JSON.stringify(await crashReason())}`; break; }
        if (s.onGround) { outcome = `touchdown-but-still-flying z=${Math.round(s.position.z)}`; break; }
        if (s.position.z > 1080 && s.position.y < 40) { outcome = 'overshoot-runway-south'; break; }
        await sleep(150);
      }
    }
    await pilot.release();
    await page.keyboard.up('KeyW');
    const fin = await state();
    log('E2 LANDING outcome=', outcome, 'phase=', fin.phase, 'score=', fin.score,
      'pos=(', Math.round(fin.position.x), ',', Math.round(fin.position.y), ',', Math.round(fin.position.z), ')',
      'hits=', fin.hits, 'fuel=', fin.fuel.toFixed(3));
    if (outcome === 'complete') {
      const breakdown = {
        rings: await hudText('score-rings'), landing: await hudText('score-landing'),
        fuel: await hudText('score-fuel'), time: await hudText('score-time'), total: await hudText('score-total'),
      };
      log('E2 COMPLETE-SCREEN', JSON.stringify(breakdown), 'overlay=', await page.evaluate(() => !document.getElementById('complete-screen')?.classList.contains('hidden')));
      await page.screenshot({ path: join(outDir, 'complete.png') });
    } else {
      findings.push(`E2: pendaratan setelah 8 cincin tidak complete — outcome: ${outcome}`);
    }
  } else {
    findings.push(`E2: misi penuh gagal — ${failE}`);
    await pilot.release();
    await page.keyboard.up('KeyW');
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
