// Independent playtest probe for CAKRAWALA (read-only vs game code).
// Spawns serve.ts, drives the game with scripted keys + a simple autopilot
// (heading + pitch controllers, state-based waits), and logs everything.
// Usage: node scripts/probe-playtest.mjs [--port 8092] [--out /tmp/probe]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1] || 8092);
const outDir = args[args.indexOf('--out') + 1] || '/tmp/probe-cakrawala';
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
  const overlayVisible = (id) => page.evaluate((i) => !document.getElementById(i)?.classList.contains('hidden'), id);

  // Exact ring altitudes from the game's own terrain module (read-only import).
  const ringY = await page.evaluate(async () => null).catch(() => null);
  await page.goto(`${base}/?lite=1`, { waitUntil: 'load', timeout: 30000 });
  await sleep(2000);
  const terrain = await page.evaluate(async () => {
    try {
      const m = await import('/src/terrain.js');
      return { ok: true, h: (x, z) => m.heightAt(x, z) };
    } catch (e) { return { ok: false, err: String(e) }; }
  });
  // evaluate() cannot return functions; recompute per-ring via a second call.
  const heights = await page.evaluate(async (pts) => {
    try {
      const m = await import('/src/terrain.js');
      return pts.map(([x, z]) => m.heightAt(x, z));
    } catch (e) { return null; }
  }, RINGS.map((r) => [r.x, r.z]));
  if (heights) {
    RINGS.forEach((r, i) => { r.y = Math.max(heights[i] + r.clearance, 60); });
    log('RING-Y', JSON.stringify(RINGS.map((r) => Math.round(r.y))));
  } else {
    RINGS.forEach((r) => { r.y = 90; });
    log('RING-Y fallback 90 (terrain import failed)');
  }
  void ringY; void terrain;

  // ---- autopilot -------------------------------------------------------
  class Pilot {
    constructor() { this.held = new Set(); }
    async setKeys(want) {
      for (const k of [...this.held]) if (!want.has(k)) { await page.keyboard.up(k); this.held.delete(k); }
      for (const k of want) if (!this.held.has(k)) { await page.keyboard.down(k); this.held.add(k); }
    }
    async release() { await this.setKeys(new Set()); }
  }
  const pilot = new Pilot();

  // One control tick: steer heading toward (tx,tz), pitch toward ty.
  async function tick(target, cruise) {
    const s = await state();
    if (s.phase !== 'flying') return { s, done: false, phase: s.phase };
    const dx = target.x - s.position.x;
    const dz = target.z - s.position.z;
    const dist = Math.hypot(dx, dz);
    const desiredH = Math.atan2(-dx, -dz);
    const err = wrapPi(desiredH - s.heading);
    const vsDes = Math.max(-(cruise.vsCap ?? 10), Math.min(cruise.vsClimb ?? 12, (target.y - s.position.y) * 0.3));
    const pitchDes = Math.max(-0.42, Math.min(0.42, Math.asin(Math.max(-1, Math.min(1, vsDes / Math.max(30, s.speed))))));
    const keys = new Set();
    if (err > 0.10) keys.add('ArrowLeft');
    else if (err < -0.10) keys.add('ArrowRight');
    if (pitchDes > s.pitch + 0.05) keys.add('ArrowUp');
    else if (pitchDes < s.pitch - 0.05) keys.add('ArrowDown');
    if (s.throttle < cruise.throttle - 0.03) keys.add('KeyW');
    else if (s.throttle > cruise.throttle + 0.06) keys.add('KeyS');
    await pilot.setKeys(keys);
    return { s, done: false, dist };
  }

  async function waitPhase(phase, timeoutMs, label) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const s = await state();
      if (s.phase === phase) return s;
      await sleep(400);
    }
    throw new Error(`timeout waiting for phase=${phase} (${label})`);
  }

  // ---- TEST 1: boot / title -------------------------------------------
  const boot = await state();
  log('T1 BOOT phase=', boot.phase, 'titleVisible=', await overlayVisible('title-screen'),
    'hud-alt=', await hudText('hud-alt'), 'hud-spd=', await hudText('hud-spd'));
  if (boot.phase !== 'title') findings.push('T1: phase awal bukan title');

  // ---- TEST 2: takeoff --------------------------------------------------
  await page.evaluate(() => window.__game.startMission('ring-run'));
  await sleep(300);
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ArrowUp');
  let liftoff = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    const s = await state();
    if (s.phase !== 'flying') { findings.push(`T2: phase berubah jadi ${s.phase} saat takeoff`); break; }
    if (!s.onGround && !liftoff) {
      liftoff = { ...s, wallMs: Date.now() - t0 };
      log('T2 LIFTOFF y=', s.position.y.toFixed(1), 'speed=', s.speed.toFixed(1),
        'throttle=', s.throttle.toFixed(2), 'elapsed-sim~', (240 - s.timeLeft).toFixed(1), 's');
    }
    if (liftoff && s.position.y > 100) break;
    if (s.stalled) log('T2 STALL FLAG at speed', s.speed.toFixed(1));
    await sleep(300);
  }
  await page.keyboard.up('ArrowUp');
  const climb = await state();
  log('T2 CLIMB y=', climb.position.y.toFixed(1), 'speed=', climb.speed.toFixed(1),
    'stalled=', climb.stalled, 'phase=', climb.phase, 'fuel=', climb.fuel.toFixed(3));
  if (!liftoff) findings.push('KRITIS T2: pesawat tidak pernah lepas landas (onGround tetap true)');
  if (climb.stalled) findings.push('T2: stall saat climb awal');
  if (climb.phase === 'crashed') findings.push('KRITIS T2: crash saat takeoff/climb');

  // HUD sample 1 (in flight)
  const hud1 = { alt: await hudText('hud-alt'), spd: await hudText('hud-spd'), hdg: await hudText('hud-hdg'), rings: await hudText('hud-rings'), obj: await hudText('hud-objective') };
  log('HUD1', JSON.stringify(hud1), 'state y=', climb.position.y.toFixed(0), 'spd-kmh=', Math.round(climb.speed * 3.6));

  // ---- TEST 3: fly ring 1 ----------------------------------------------
  log('T3 target ring1', JSON.stringify(RINGS[0]));
  let ring1 = null;
  {
    const t1 = Date.now();
    while (Date.now() - t1 < 240000) {
      const r = await tick(RINGS[0], { throttle: 0.65, vsCap: 10, vsClimb: 12 });
      if (r.phase && r.phase !== 'flying') { findings.push(`T3: phase jadi ${r.phase} menuju ring 1`); break; }
      const s = r.s;
      if (s.ringsPassed >= 1) { ring1 = s; break; }
      if (s.stalled) log('T3 STALL at y=', s.position.y.toFixed(0), 'speed=', s.speed.toFixed(0));
      if (s.hits > 0) { log('T3 HIT! hits=', s.hits, 'at', JSON.stringify(s.position)); break; }
      await sleep(150);
    }
  }
  await pilot.release();
  await page.keyboard.up('KeyW');
  if (ring1) {
    log('T3 RING1 PASSED score=', ring1.score, 'fuel=', ring1.fuel.toFixed(3),
      'pos=', JSON.stringify({ x: Math.round(ring1.position.x), y: Math.round(ring1.position.y), z: Math.round(ring1.position.z) }),
      'objective=', await hudText('hud-objective'));
    if (ring1.score !== 100) findings.push(`T3: skor setelah ring 1 = ${ring1.score}, expected 100`);
  } else {
    const s = await state();
    findings.push(`KRITIS T3: cincin 1 tidak terlewati. State akhir: ${JSON.stringify(s)}`);
  }

  // ---- TEST 4: cockpit camera -------------------------------------------
  const beforeC = await state();
  await page.keyboard.press('KeyC');
  await sleep(1500);
  const afterC = await state();
  const cockpitDark = await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => {
      const canvas = document.getElementById('game');
      const off = document.createElement('canvas');
      off.width = 64; off.height = 36;
      const ctx = off.getContext('2d');
      ctx.drawImage(canvas, 0, 0, 64, 36);
      const d = ctx.getImageData(0, 0, 64, 36).data;
      let dark = 0; let n = 0; let sum = 0;
      for (let y = 24; y < 36; y += 1) for (let x = 0; x < 64; x += 1) {
        const i = (y * 64 + x) * 4; const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
        n += 1; sum += v; if (v < 60) dark += 1;
      }
      resolve({ bottomDarkFrac: +(dark / n).toFixed(2), bottomMean: +(sum / n).toFixed(1) });
    });
  }));
  await page.screenshot({ path: join(outDir, 'cockpit.png') });
  log('T4 COCKPIT moved=', Math.hypot(afterC.position.x - beforeC.position.x, afterC.position.z - beforeC.position.z).toFixed(1), 'm in 1.5s wall',
    'phase=', afterC.phase, 'bottomDarkFrac=', cockpitDark.bottomDarkFrac, 'bottomMean=', cockpitDark.bottomMean);
  if (cockpitDark.bottomDarkFrac < 0.25) findings.push(`T4: panel kokpit tidak tampak gelap di sepertiga bawah frame (darkFrac=${cockpitDark.bottomDarkFrac}) — panel mungkin tidak terlihat`);
  if (afterC.phase !== 'flying') findings.push('T4: game berhenti setelah tekan C');
  await page.keyboard.press('KeyC'); // back to chase
  await sleep(800);

  // ---- TEST 5: flaps + gear toggles -------------------------------------
  await page.keyboard.press('KeyF');
  await sleep(300);
  const flaps1 = await hudText('hud-flaps');
  await page.keyboard.press('KeyF');
  await sleep(300);
  const flaps0 = await hudText('hud-flaps');
  await page.keyboard.press('KeyG');
  await sleep(300);
  const gearUp = await hudText('hud-gear');
  await page.keyboard.press('KeyG');
  await sleep(300);
  const gearDn = await hudText('hud-gear');
  log('T5 FLAPS', flaps1, '->', flaps0, '| GEAR', gearUp, '->', gearDn);
  if (flaps1 !== 'FLAP 15' || flaps0 !== 'FLAP 0') findings.push(`T5: toggle flap tidak konsisten (${flaps1}/${flaps0})`);
  if (gearUp !== 'GEAR UP' || gearDn !== 'GEAR DN') findings.push(`T5: toggle gear tidak konsisten (${gearUp}/${gearDn})`);

  // ---- TEST 6: pause -----------------------------------------------------
  await page.keyboard.press('KeyP');
  await sleep(600);
  const paused = await state();
  const pauseOverlay = await overlayVisible('pause-screen');
  const snap = { ...paused, timeLeft: paused.timeLeft };
  await sleep(2500);
  const paused2 = await state();
  log('T6 PAUSE phase=', paused.phase, 'overlay=', pauseOverlay,
    'frozen=', JSON.stringify(paused.position) === JSON.stringify(paused2.position) && paused.timeLeft === paused2.timeLeft,
    'timeLeft=', paused.timeLeft, '->', paused2.timeLeft);
  if (paused.phase !== 'paused') findings.push('T6: P tidak mengubah phase ke paused');
  if (!pauseOverlay) findings.push('T6: layar pause tidak muncul');
  if (paused.timeLeft !== paused2.timeLeft || JSON.stringify(paused.position) !== JSON.stringify(paused2.position)) {
    findings.push('T6: game tetap berjalan saat pause (posisi/waktu berubah)');
  }
  await page.keyboard.press('KeyP');
  await sleep(600);
  const resumed = await state();
  log('T6 RESUME phase=', resumed.phase, 'overlayHidden=', !(await overlayVisible('pause-screen')));
  if (resumed.phase !== 'flying') findings.push('T6: P kedua tidak kembali ke flying');

  // ---- TEST 7: restart ---------------------------------------------------
  await page.keyboard.press('KeyR');
  await sleep(800);
  const restarted = await state();
  log('T7 RESTART phase=', restarted.phase, 'rings=', restarted.ringsPassed, 'score=', restarted.score,
    'pos=', JSON.stringify({ x: Math.round(restarted.position.x), y: Math.round(restarted.position.y), z: Math.round(restarted.position.z) }),
    'speed=', restarted.speed.toFixed(1), 'onGround=', restarted.onGround);
  if (restarted.ringsPassed !== 0 || restarted.score !== 0) findings.push('T7: restart tidak reset skor/cincin');
  if (Math.abs(restarted.position.x - 330) > 5 || Math.abs(restarted.position.z - 1020) > 5) findings.push('T7: restart tidak kembali ke spawn runway');

  // ---- TEST 8: touch-and-go ---------------------------------------------
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ArrowUp');
  await sleep(100);
  let lifted = false;
  {
    const t1 = Date.now();
    while (Date.now() - t1 < 120000) {
      const s = await state();
      if (!s.onGround) { lifted = true; break; }
      await sleep(300);
    }
  }
  await page.keyboard.up('ArrowUp');
  // Immediately settle back down on the strip: throttle 0.3, gentle sink.
  let landed = null;
  {
    const t1 = Date.now();
    while (Date.now() - t1 < 120000) {
      const r = await tick({ x: 330, y: 15, z: 800 }, { throttle: 0.3, vsCap: 5.5, vsClimb: 5 });
      const s = r.s;
      if (s.phase !== 'flying') { log('T8 phase jadi', s.phase); break; }
      if (s.onGround && lifted) { landed = s; break; }
      await sleep(150);
    }
  }
  await pilot.release();
  await page.keyboard.up('KeyW');
  if (landed) {
    log('T8 TOUCH-AND-GO OK onGround, phase=', landed.phase, 'speed=', landed.speed.toFixed(1),
      'z=', Math.round(landed.position.z), 'hits=', landed.hits, 'toast=', await hudText('toast') ?? '(toast el?)');
  } else {
    const s = await state();
    findings.push(`T8: touch-and-go gagal — state akhir ${JSON.stringify(s)}`);
  }

  // ---- TEST 9: full mission — all 8 rings + landing ---------------------
  await page.keyboard.press('KeyR');
  await sleep(800);
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ArrowUp');
  {
    const t1 = Date.now();
    let ok = false;
    while (Date.now() - t1 < 120000) {
      const s = await state();
      if (!s.onGround) { ok = true; break; }
      await sleep(300);
    }
    if (!ok) findings.push('T9: tidak lepas landas di percobaan misi penuh');
  }
  await page.keyboard.up('ArrowUp');
  let missionFail = null;
  for (let i = 0; i < 8; i += 1) {
    const t1 = Date.now();
    let passed = false;
    while (Date.now() - t1 < 240000) {
      const r = await tick(RINGS[i], { throttle: 0.65, vsCap: 10, vsClimb: 12 });
      const s = r.s;
      if (s.phase === 'crashed') { missionFail = `crash saat menuju ring ${i + 1} (hits=${s.hits}) pos=${JSON.stringify(s.position)} fuel=${s.fuel.toFixed(2)}`; break; }
      if (s.phase !== 'flying') { missionFail = `phase ${s.phase} saat menuju ring ${i + 1}`; break; }
      if (s.ringsPassed > i) { passed = true; break; }
      if (s.hits > 0) log(`T9 ring ${i + 1}: HIT hits=${s.hits} pos=`, JSON.stringify({ x: Math.round(s.position.x), y: Math.round(s.position.y), z: Math.round(s.position.z) }), 'fuel=', s.fuel.toFixed(2));
      await sleep(150);
    }
    const s = await state();
    log(`T9 RING ${i + 1}/8 ${passed ? 'PASSED' : 'GAGAL'} score=${s.score} fuel=${s.fuel.toFixed(3)} timeLeft=${Math.round(s.timeLeft)} pos=(${Math.round(s.position.x)},${Math.round(s.position.y)},${Math.round(s.position.z)})`);
    if (!passed) { missionFail = missionFail || `ring ${i + 1} tidak terlewati dalam batas waktu`; break; }
  }
  await pilot.release();
  if (!missionFail) {
    // Landing: phase A — descend to 55 m over north threshold; phase B — final.
    log('T9 ALL RINGS DONE — approach');
    await page.keyboard.press('KeyF'); // flaps down for approach
    await sleep(300);
    log('T9 flaps=', await hudText('hud-flaps'), 'gear=', await hudText('hud-gear'));
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
    log('T9 APPROACH pos=', JSON.stringify(await state().then((s) => ({ x: Math.round(s.position.x), y: Math.round(s.position.y), z: Math.round(s.position.z), spd: Math.round(s.speed), phase: s.phase }))));
    {
      const t1 = Date.now();
      while (Date.now() - t1 < 240000) {
        const r = await tick({ x: 330, y: 16, z: 800 }, { throttle: 0.35, vsCap: 5.5, vsClimb: 5 });
        const s = r.s;
        if (s.phase === 'complete') { outcome = 'complete'; break; }
        if (s.phase === 'crashed') { outcome = `crashed hits=${s.hits}`; break; }
        if (s.onGround) { outcome = `touchdown-but-phase-flying (touch-and-go?) z=${Math.round(s.position.z)}`; break; }
        if (s.position.z > 1080 && s.position.y < 40) { outcome = 'overshoot-runway-south'; break; }
        await sleep(150);
      }
    }
    await pilot.release();
    await page.keyboard.up('KeyW');
    const fin = await state();
    log('T9 LANDING outcome=', outcome, 'phase=', fin.phase, 'score=', fin.score,
      'pos=', JSON.stringify({ x: Math.round(fin.position.x), y: Math.round(fin.position.y), z: Math.round(fin.position.z) }),
      'hits=', fin.hits, 'fuel=', fin.fuel.toFixed(3));
    if (outcome === 'complete') {
      const breakdown = {
        rings: await hudText('score-rings'), landing: await hudText('score-landing'),
        fuel: await hudText('score-fuel'), time: await hudText('score-time'), total: await hudText('score-total'),
      };
      log('T9 COMPLETE-SCREEN', JSON.stringify(breakdown), 'overlay=', await overlayVisible('complete-screen'));
      await page.screenshot({ path: join(outDir, 'complete.png') });
    } else {
      findings.push(`T9: pendaratan setelah 8 cincin tidak complete — outcome: ${outcome}`);
    }
    if (fin.hits > 0) findings.push(`T9: pesawat kena hit (${fin.hits}) selama misi/pendaratan`);
  } else {
    findings.push(`KRITIS T9: misi penuh gagal — ${missionFail}`);
    await pilot.release();
    await page.keyboard.up('KeyW');
  }

  // ---- final HUD sample + errors ----------------------------------------
  const finHud = { alt: await hudText('hud-alt'), spd: await hudText('hud-spd'), hdg: await hudText('hud-hdg') };
  const finState = await state();
  log('FINAL HUD', JSON.stringify(finHud), 'state y=', Math.round(finState.position.y), 'kmh=', Math.round(finState.speed * 3.6));
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
