// Probe 4 for CAKRAWALA (read-only vs game code).
// Heading-hold controller (no target points -> no orbit chaos at low altitude).
//  L1: touch-and-go by heading-hold (liftoff, throttle 0.30, gentle descent north)
//  L2: traffic-pattern landing (take off, climb, 180 deg turn, descend south onto strip)
//  L3: full mission with a heading flight-plan for the volcano legs 4->5->6,
//      then landing -> complete screen.
// Usage: node scripts/probe-playtest4.mjs [--port 8095] [--out /tmp/probe4]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1] || 8095);
const outDir = args[args.indexOf('--out') + 1] || '/tmp/probe-cakrawala4';
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

  // Waypoint tick (proven for rings 1-4).
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

  // Heading-hold tick: fixed compass heading + target altitude, no point to orbit.
  async function holdHeading(desiredH, targetY, cruise) {
    const s = await state();
    if (s.phase !== 'flying') return { s, phase: s.phase };
    const err = wrapPi(desiredH - s.heading);
    const vsDes = Math.max(-(cruise.vsCap ?? 10), Math.min(cruise.vsClimb ?? 14, (targetY - s.position.y) * 0.3));
    const pitchDes = Math.max(-0.42, Math.min(0.42, Math.asin(Math.max(-1, Math.min(1, vsDes / Math.max(30, s.speed))))));
    const keys = new Set();
    if (err > 0.08) keys.add('ArrowLeft');
    else if (err < -0.08) keys.add('ArrowRight');
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
    await page.keyboard.down('KeyW');
    await page.keyboard.down('ArrowUp');
    const s = await waitState((v) => !v.onGround, 120000, 'liftoff');
    await page.keyboard.up('ArrowUp');
    return s;
  }

  // ---- TEST L1: touch-and-go, heading-hold north ------------------------
  await page.evaluate(() => window.__game.startMission('ring-run'));
  await sleep(500);
  const lift1 = await takeoff();
  log('L1 LIFTOFF y=', lift1.position.y.toFixed(1), 'speed=', lift1.speed.toFixed(1), 'z=', Math.round(lift1.position.z));
  // Cut throttle, descend gently, hold heading north (0). Sample fast for sink.
  const samples = [];
  let landed1 = null; let crash1 = null;
  {
    const t1 = Date.now();
    let prev = null;
    while (Date.now() - t1 < 90000) {
      const r = await holdHeading(0, 15, { throttle: 0.30, vsCap: 5, vsClimb: 5 });
      const s = r.s;
      if (prev) {
        const dtSim = prev.timeLeft - s.timeLeft;
        if (dtSim > 0.01) samples.push({ y: +s.position.y.toFixed(1), spd: +s.speed.toFixed(0), sink: +((prev.position.y - s.position.y) / dtSim).toFixed(1), z: Math.round(s.position.z), thr: +s.throttle.toFixed(2) });
      }
      prev = s;
      if (s.phase === 'crashed') { crash1 = { ...s, ...(await crashReason()) }; break; }
      if (s.phase !== 'flying') break;
      if (s.onGround) { landed1 = s; break; }
      await sleep(100);
    }
  }
  await pilot.release();
  await page.keyboard.up('KeyW');
  if (landed1) {
    const near = samples.slice(-4);
    log('L1 TOUCH-AND-GO OK phase=', landed1.phase, 'speed=', landed1.speed.toFixed(1),
      'pos=(', Math.round(landed1.position.x), ',', Math.round(landed1.position.y), ',', Math.round(landed1.position.z), ')',
      'hits=', landed1.hits, 'toast=', await hudText('toast'));
    log('L1 approach samples (y,spd,sink,z,thr):', JSON.stringify(near));
  } else {
    findings.push(`L1: touch-and-go GAGAL — ${crash1 ? `crash ${JSON.stringify(crash1)}` : 'timeout'}; last samples ${JSON.stringify(samples.slice(-4))}`);
  }

  // ---- TEST L2: traffic pattern landing ----------------------------------
  // From the roll: take off again, climb north, 180 deg turn, descend south.
  let l2ok = false;
  if (landed1) {
    await page.keyboard.down('KeyW');
    await page.keyboard.down('ArrowUp');
    try { await waitState((s) => !s.onGround, 120000, 'liftoff L2'); } catch (e) { log('L2 liftoff timeout:', e.message); }
    await page.keyboard.up('ArrowUp');
    // Climb north to 150.
    {
      const t1 = Date.now();
      while (Date.now() - t1 < 120000) {
        const r = await holdHeading(0, 150, { throttle: 0.7, vsCap: 8, vsClimb: 20 });
        if (r.phase) break;
        if (r.s.position.y > 140) break;
        await sleep(150);
      }
    }
    const atTop = await state();
    log('L2 AT TOP y=', atTop.position.y.toFixed(0), 'z=', Math.round(atTop.position.z), 'phase=', atTop.phase);
    // Turn 180 to heading south (pi), keep altitude.
    {
      const t1 = Date.now();
      while (Date.now() - t1 < 120000) {
        const r = await holdHeading(Math.PI, 150, { throttle: 0.6, vsCap: 8, vsClimb: 10 });
        if (r.phase) break;
        if (Math.abs(wrapPi(Math.PI - r.s.heading)) < 0.15) break;
        await sleep(150);
      }
    }
    const turned = await state();
    log('L2 TURNED heading=', turned.heading.toFixed(2), 'pos=(', Math.round(turned.position.x), ',', Math.round(turned.position.z), ') y=', turned.position.y.toFixed(0), 'phase=', turned.phase);
    // Fly south to z~900, descend to 55.
    {
      const t1 = Date.now();
      while (Date.now() - t1 < 120000) {
        const r = await holdHeading(Math.PI, 55, { throttle: 0.35, vsCap: 6, vsClimb: 6 });
        if (r.phase) break;
        if (r.s.position.z > 850 && r.s.position.y < 70) break;
        await sleep(150);
      }
    }
    await page.keyboard.press('KeyF');
    await sleep(400);
    log('L2 flaps=', await hudText('hud-flaps'), 'gear=', await hudText('hud-gear'));
    // Final: heading south, descend to 16.
    let outcome2 = null; const samples2 = [];
    {
      const t1 = Date.now();
      let prev = null;
      while (Date.now() - t1 < 180000) {
        const r = await holdHeading(Math.PI, 16, { throttle: 0.35, vsCap: 5.5, vsClimb: 5 });
        const s = r.s;
        if (prev) {
          const dtSim = prev.timeLeft - s.timeLeft;
          if (dtSim > 0.01) samples2.push({ y: +s.position.y.toFixed(1), spd: +s.speed.toFixed(0), sink: +((prev.position.y - s.position.y) / dtSim).toFixed(1), z: Math.round(s.position.z) });
        }
        prev = s;
        if (s.phase === 'complete') { outcome2 = 'complete'; break; }
        if (s.phase === 'crashed') { outcome2 = `crashed hits=${s.hits} reason=${JSON.stringify(await crashReason())}`; break; }
        if (s.onGround) { outcome2 = `touchdown(still flying, rings not done) z=${Math.round(s.position.z)}`; break; }
        if (s.position.z < 400 && s.position.y < 40) { outcome2 = 'overshoot-runway-north'; break; }
        await sleep(100);
      }
    }
    await pilot.release();
    await page.keyboard.up('KeyW');
    const fin2 = await state();
    log('L2 LANDING outcome=', outcome2, 'phase=', fin2.phase, 'speed=', fin2.speed.toFixed(1),
      'pos=(', Math.round(fin2.position.x), ',', Math.round(fin2.position.y), ',', Math.round(fin2.position.z), ') hits=', fin2.hits);
    log('L2 final samples:', JSON.stringify(samples2.slice(-4)));
    if (outcome2 && outcome2.startsWith('touchdown')) {
      l2ok = true;
      log('L2 LANDING MECHANICS VERIFIED (touch-and-go on strip, gentle, gear down)');
    } else {
      findings.push(`L2: pendaratan pola lalu lintas gagal — outcome: ${outcome2}`);
    }
  } else {
    log('L2 skipped (L1 failed)');
  }

  // ---- TEST L3: full mission, heading flight-plan for volcano legs -------
  await page.keyboard.press('KeyR');
  await sleep(800);
  await takeoff();
  let fail3 = null;
  // Legs 1-4: waypoint autopilot (proven). Then heading plan for 5, then waypoints.
  for (let i = 0; i < 4; i += 1) {
    const t1 = Date.now();
    let passed = false;
    while (Date.now() - t1 < 240000) {
      const r = await tick(RINGS[i], { throttle: 0.65, vsCap: 10, vsClimb: 14 });
      const s = r.s;
      if (s.phase === 'crashed') { fail3 = `crash menuju ring ${i + 1} hits=${s.hits} reason=${JSON.stringify(await crashReason())}`; break; }
      if (s.phase !== 'flying') { fail3 = `phase ${s.phase} menuju ring ${i + 1}`; break; }
      if (s.ringsPassed > i) { passed = true; break; }
      if (s.hits > 0) log(`L3 ring ${i + 1}: HIT hits=${s.hits}`);
      await sleep(150);
    }
    const s = await state();
    log(`L3 RING ${i + 1}/8 ${passed ? 'PASSED' : 'GAGAL'} score=${s.score} fuel=${s.fuel.toFixed(3)} timeLeft=${Math.round(s.timeLeft)} pos=(${Math.round(s.position.x)},${Math.round(s.position.y)},${Math.round(s.position.z)})`);
    if (!passed) { fail3 = fail3 || `ring ${i + 1} tidak terlewati`; break; }
  }
  if (!fail3) {
    // After ring 4 (heading NW ~0.94, y~221): fly NORTH (heading 0.15) climbing
    // to 385, staying east of the volcano, until z <= -660.
    log('L3 VOLCANO TRANSIT: climb north to 385');
    {
      const t1 = Date.now();
      while (Date.now() - t1 < 180000) {
        const r = await holdHeading(0.15, 385, { throttle: 0.7, vsCap: 10, vsClimb: 28 });
        const s = r.s;
        if (s.phase !== 'flying') { fail3 = `phase ${s.phase} saat transit utara`; break; }
        if (s.position.z <= -660 && s.position.y >= 370) break;
        if (s.hits > 0) { fail3 = `hit saat transit utara hits=${s.hits} pos=(${Math.round(s.position.x)},${Math.round(s.position.y)},${Math.round(s.position.z)})`; break; }
        await sleep(150);
      }
    }
    const atNorth = await state();
    log('L3 AT NORTH pos=(', Math.round(atNorth.position.x), ',', Math.round(atNorth.position.y), ',', Math.round(atNorth.position.z), ') fuel=', atNorth.fuel.toFixed(2));
    // Turn west (heading pi/2) until x <= -800, keep altitude.
    if (!fail3) {
      const t1 = Date.now();
      while (Date.now() - t1 < 120000) {
        const r = await holdHeading(Math.PI / 2, 385, { throttle: 0.65, vsCap: 8, vsClimb: 10 });
        const s = r.s;
        if (s.phase !== 'flying') { fail3 = `phase ${s.phase} saat belok barat`; break; }
        if (s.position.x <= -800) break;
        if (s.hits > 0) { fail3 = `hit saat belok barat hits=${s.hits}`; break; }
        await sleep(150);
      }
    }
    // Turn south (heading pi) and fly down onto ring 5 from the north.
    if (!fail3) {
      const t1 = Date.now();
      let passed = false;
      while (Date.now() - t1 < 180000) {
        const r = await holdHeading(Math.PI, 381, { throttle: 0.6, vsCap: 8, vsClimb: 8 });
        const s = r.s;
        if (s.phase !== 'flying') { fail3 = `phase ${s.phase} saat approach ring 5`; break; }
        if (s.ringsPassed >= 5) { passed = true; break; }
        if (s.hits > 0) { fail3 = `hit saat approach ring 5 hits=${s.hits} pos=(${Math.round(s.position.x)},${Math.round(s.position.y)},${Math.round(s.position.z)})`; break; }
        await sleep(150);
      }
      const s = await state();
      log(`L3 RING 5/8 ${passed ? 'PASSED' : 'GAGAL'} score=${s.score} fuel=${s.fuel.toFixed(3)} pos=(${Math.round(s.position.x)},${Math.round(s.position.y)},${Math.round(s.position.z)})`);
      if (!passed) fail3 = fail3 || 'ring 5 tidak terlewati via approach utara';
    }
  }
  // Rings 6-8: waypoint autopilot.
  if (!fail3) {
    for (let i = 5; i < 8; i += 1) {
      const t1 = Date.now();
      let passed = false;
      while (Date.now() - t1 < 240000) {
        const r = await tick(RINGS[i], { throttle: 0.65, vsCap: 10, vsClimb: 14 });
        const s = r.s;
        if (s.phase === 'crashed') { fail3 = `crash menuju ring ${i + 1} hits=${s.hits} reason=${JSON.stringify(await crashReason())}`; break; }
        if (s.phase !== 'flying') { fail3 = `phase ${s.phase} menuju ring ${i + 1}`; break; }
        if (s.ringsPassed > i) { passed = true; break; }
        if (s.hits > 0) log(`L3 ring ${i + 1}: HIT hits=${s.hits} pos=(${Math.round(s.position.x)},${Math.round(s.position.y)},${Math.round(s.position.z)})`);
        await sleep(150);
      }
      const s = await state();
      log(`L3 RING ${i + 1}/8 ${passed ? 'PASSED' : 'GAGAL'} score=${s.score} fuel=${s.fuel.toFixed(3)} timeLeft=${Math.round(s.timeLeft)} pos=(${Math.round(s.position.x)},${Math.round(s.position.y)},${Math.round(s.position.z)})`);
      if (!passed) { fail3 = fail3 || `ring ${i + 1} tidak terlewati`; break; }
    }
  }
  await pilot.release();
  if (!fail3) {
    log('L3 ALL RINGS DONE objective=', await hudText('hud-objective'));
    await page.keyboard.press('KeyF');
    await sleep(400);
    let outcome = null;
    {
      const t1 = Date.now();
      while (Date.now() - t1 < 180000) {
        // Ring 8 is NORTH of the strip: approach heading SOUTH toward it.
        const r = await holdHeading(Math.PI, 55, { throttle: 0.35, vsCap: 6, vsClimb: 6 });
        const s = r.s;
        if (s.phase !== 'flying') { outcome = s.phase; break; }
        if (Math.hypot(s.position.x - 330, s.position.z - 520) < 60 && s.position.y < 70) break;
        await sleep(150);
      }
    }
    // Final approach: need to be heading NORTH over the strip. If we are
    // north of it, this hold takes us south first — use waypoint instead.
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
    log('L3 LANDING outcome=', outcome, 'phase=', fin.phase, 'score=', fin.score,
      'pos=(', Math.round(fin.position.x), ',', Math.round(fin.position.y), ',', Math.round(fin.position.z), ')',
      'hits=', fin.hits, 'fuel=', fin.fuel.toFixed(3));
    if (outcome === 'complete') {
      const breakdown = {
        rings: await hudText('score-rings'), landing: await hudText('score-landing'),
        fuel: await hudText('score-fuel'), time: await hudText('score-time'), total: await hudText('score-total'),
      };
      log('L3 COMPLETE-SCREEN', JSON.stringify(breakdown), 'overlay=', await page.evaluate(() => !document.getElementById('complete-screen')?.classList.contains('hidden')));
      await page.screenshot({ path: join(outDir, 'complete.png') });
    } else {
      findings.push(`L3: pendaratan setelah 8 cincin tidak complete — outcome: ${outcome}`);
    }
  } else {
    findings.push(`L3: misi penuh gagal — ${fail3}`);
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
