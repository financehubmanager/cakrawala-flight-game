// Follow-up probe for CAKRAWALA (read-only vs game code).
// Verifies probe-1 open questions:
//  A. gear toggle (with proper waits, not 300 ms sleeps)
//  B. idle taxi: throttle 0 -> does the plane roll on its own?
//  C. clean touch-and-go: slow down BEFORE descending, gentle sink
//  D. deliberate overspeed touchdown -> is one bounce recoverable?
//  E. leg ring4->ring5 with pre-climb to 380, then full mission + landing
//  F. (fallback) loadScenario('landing'): pass ring 12, then land -> complete
// Also: terrain profile along the straight ring4->ring5 line (hard numbers).
// Usage: node scripts/probe-playtest2.mjs [--port 8093] [--out /tmp/probe2]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1] || 8093);
const outDir = args[args.indexOf('--out') + 1] || '/tmp/probe-cakrawala2';
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

  // Terrain profile along straight ring4 -> ring5 line.
  const profile = await page.evaluate(async ({ a, b }) => {
    const m = await import('/src/terrain.js');
    const out = [];
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const lineY = a.y + (b.y - a.y) * t;
      out.push({ t: +t.toFixed(1), lineY: Math.round(lineY), ground: Math.round(m.heightAt(x, z)), clearance: Math.round(lineY - m.heightAt(x, z)) });
    }
    return out;
  }, { a: { x: -620, y: 221, z: -380 }, b: { x: -820, y: 381, z: -560 } });
  log('PROFILE ring4->ring5 (lineY vs ground):');
  profile.forEach((p) => log(`  t=${p.t} lineY=${p.lineY} ground=${p.ground} clearance=${p.clearance}`));
  const minClear = Math.min(...profile.map((p) => p.clearance));
  if (minClear < 10) findings.push(`KURSI 4->5: garis lurus antar-cincin nyaris/masuk terrain (clearance minimum ${minClear} m di sepanjang garis) — jalur alami menuju cincin berikutnya menabrak gunung`);

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
    if (s.phase !== 'flying') return { s, done: false, phase: s.phase };
    const dx = target.x - s.position.x;
    const dz = target.z - s.position.z;
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
    return { s, done: false };
  }

  async function waitHudText(id, value, timeoutMs = 8000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if ((await hudText(id)) === value) return true;
      await sleep(200);
    }
    return false;
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

  // ---- TEST A: gear toggle (proper waits) -------------------------------
  await page.evaluate(() => window.__game.startMission('ring-run'));
  await sleep(500);
  await page.keyboard.press('KeyG');
  const gearUpOk = await waitHudText('hud-gear', 'GEAR UP');
  await page.keyboard.press('KeyG');
  const gearDnOk = await waitHudText('hud-gear', 'GEAR DN');
  log('TA GEAR UP->', gearUpOk, ' DN->', gearDnOk);
  if (!gearUpOk || !gearDnOk) findings.push(`TA: toggle gear gagal (UP=${gearUpOk}, DN=${gearDnOk}) — tombol G tidak mengubah roda`);
  else log('TA GEAR OK (probe-1 tadi hanya race frame)');

  // ---- TEST B: idle taxi -------------------------------------------------
  await page.keyboard.press('KeyR');
  await sleep(500);
  const idle0 = await state();
  await sleep(6000);
  const idle1 = await state();
  log('TB IDLE-TAXI t0 speed=', idle0.speed.toFixed(1), 'pos z=', Math.round(idle0.position.z),
    ' | +6s wall speed=', idle1.speed.toFixed(1), 'pos z=', Math.round(idle1.position.z),
    ' throttle=', idle1.throttle.toFixed(2), 'onGround=', idle1.onGround);
  if (idle1.speed > 20) {
    findings.push(`TB (kecil): tanpa input apa pun pesawat melaju sendiri hingga ${idle1.speed.toFixed(0)} m/s (${Math.round(idle1.speed * 3.6)} km/h) di darat — throttle 0 tetap menuju minSpeed 38 m/s; pesawat taxi sendiri dan bisa keluar landasan tanpa disentuh`);
  }

  // ---- TEST C: clean touch-and-go ---------------------------------------
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ArrowUp');
  await waitState((s) => !s.onGround, 120000, 'liftoff C');
  await page.keyboard.up('ArrowUp');
  // climb to ~90, then slow to 55-65 before descending
  {
    const t1 = Date.now();
    while (Date.now() - t1 < 120000) {
      const r = await tick({ x: 330, y: 90, z: 700 }, { throttle: 0.65, vsCap: 8, vsClimb: 10 });
      if (r.s.position.y > 85) break;
      await sleep(150);
    }
  }
  await pilot.release();
  // slow down: hold S until speed <= 62
  await page.keyboard.down('KeyS');
  let slow = null;
  try {
    slow = await waitState((s) => s.speed <= 62, 60000, 'slow to <=62');
    log('TC SLOWED speed=', slow.speed.toFixed(1), 'throttle=', slow.throttle.toFixed(2), 'y=', slow.position.y.toFixed(0));
  } catch (e) { log('TC slow timeout:', e.message); }
  await page.keyboard.up('KeyS');
  await page.keyboard.press('KeyF'); // flaps
  await sleep(300);
  log('TC flaps=', await hudText('hud-flaps'), 'gear=', await hudText('hud-gear'));
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
    log('TC TOUCH-AND-GO OK phase=', landedC.phase, 'speed=', landedC.speed.toFixed(1),
      'pos=(', Math.round(landedC.position.x), ',', Math.round(landedC.position.y), ',', Math.round(landedC.position.z), ')',
      'hits=', landedC.hits, 'toast=', await hudText('toast'));
  } else {
    findings.push(`TC: touch-and-go bersih GAGAL — ${crashC ? `crash: ${JSON.stringify(crashC)}` : 'timeout'}`);
  }

  // ---- TEST D: overspeed touchdown -> recoverable? -----------------------
  // Take off again from the roll, climb, then dive onto the runway fast.
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ArrowUp');
  try { await waitState((s) => !s.onGround, 120000, 'liftoff D'); } catch (e) { log('TD liftoff timeout:', e.message); }
  await page.keyboard.up('ArrowUp');
  {
    const t1 = Date.now();
    while (Date.now() - t1 < 120000) {
      const r = await tick({ x: 330, y: 120, z: 600 }, { throttle: 0.8, vsCap: 8, vsClimb: 12 });
      if (r.s.position.y > 110) break;
      await sleep(150);
    }
  }
  // Now dive at the runway: full throttle, pitch down, target y=15, speed will be >80.
  let hitsSeen = 0; let outcomeD = null;
  {
    const t1 = Date.now();
    let diving = true;
    while (Date.now() - t1 < 120000) {
      const s = await state();
      if (s.phase === 'crashed') { outcomeD = `crashed hits=${s.hits} reason=${JSON.stringify(await crashReason())}`; break; }
      if (s.hits > hitsSeen) {
        hitsSeen = s.hits;
        log(`TD HIT #${hitsSeen} at speed=${s.speed.toFixed(0)} y=${s.position.y.toFixed(0)} pos=(${Math.round(s.position.x)},${Math.round(s.position.z)})`);
        if (hitsSeen === 1) {
          // Try to recover: full power + climb away.
          await pilot.release();
          await page.keyboard.down('KeyW');
          await page.keyboard.down('ArrowUp');
          diving = false;
        }
      }
      if (diving) {
        await tick({ x: 330, y: 15, z: 800 }, { throttle: 1.0, vsCap: 14, vsClimb: 5 });
      }
      if (!diving) {
        // recovery attempt: hold climb 20 s wall, watch hits/phase
        const s2 = await state();
        if (s2.position.y > 100 && s2.hits === 1) { outcomeD = 'RECOVERED after 1 hit (climbed away)'; break; }
        if (Date.now() - t1 > 90000) { outcomeD = `no recovery in time; hits=${s2.hits} y=${s2.position.y.toFixed(0)} phase=${s2.phase}`; break; }
      }
      await sleep(150);
    }
  }
  await pilot.release();
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ArrowUp');
  log('TD OUTCOME:', outcomeD ?? 'timeout/unknown');
  if (outcomeD && outcomeD.startsWith('crashed')) {
    findings.push(`TD (sedang): satu touchdown keras berujung crash tak terhindarkan — ${outcomeD}. Bounce (speed x0.45, y=ground+6) tidak memberi ruang pulih saat rendah & pelan (stall <52 m/s).`);
  }

  // ---- TEST E: full mission with pre-climb for leg 4->5 -----------------
  await page.keyboard.press('KeyR');
  await sleep(800);
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ArrowUp');
  try { await waitState((s) => !s.onGround, 120000, 'liftoff E'); } catch (e) { log('TE liftoff timeout:', e.message); }
  await page.keyboard.up('ArrowUp');
  let failE = null;
  for (let i = 0; i < 8; i += 1) {
    // Before ring 5 (index 4): pre-climb to 380 over ring 4's position first.
    if (i === 4) {
      log('TE PRE-CLIMB to 380 over ring4 area');
      const t1 = Date.now();
      let climbed = false;
      while (Date.now() - t1 < 180000) {
        const r = await tick({ x: -620, y: 385, z: -380 }, { throttle: 0.7, vsCap: 10, vsClimb: 30 });
        const s = r.s;
        if (s.phase !== 'flying') { failE = `phase ${s.phase} saat pre-climb`; break; }
        if (s.position.y >= 375) { climbed = true; break; }
        await sleep(150);
      }
      const s = await state();
      log('TE PRE-CLIMB done=', climbed, 'y=', s.position.y.toFixed(0), 'pos=(', Math.round(s.position.x), ',', Math.round(s.position.z), ') fuel=', s.fuel.toFixed(2));
      if (failE) break;
    }
    const t1 = Date.now();
    let passed = false;
    while (Date.now() - t1 < 240000) {
      const r = await tick(RINGS[i], { throttle: 0.65, vsCap: 10, vsClimb: 14 });
      const s = r.s;
      if (s.phase === 'crashed') { failE = `crash menuju ring ${i + 1} hits=${s.hits} reason=${JSON.stringify(await crashReason())}`; break; }
      if (s.phase !== 'flying') { failE = `phase ${s.phase} menuju ring ${i + 1}`; break; }
      if (s.ringsPassed > i) { passed = true; break; }
      if (s.hits > 0) log(`TE ring ${i + 1}: HIT hits=${s.hits} pos=(${Math.round(s.position.x)},${Math.round(s.position.y)},${Math.round(s.position.z)})`);
      await sleep(150);
    }
    const s = await state();
    log(`TE RING ${i + 1}/8 ${passed ? 'PASSED' : 'GAGAL'} score=${s.score} fuel=${s.fuel.toFixed(3)} timeLeft=${Math.round(s.timeLeft)} pos=(${Math.round(s.position.x)},${Math.round(s.position.y)},${Math.round(s.position.z)})`);
    if (!passed) { failE = failE || `ring ${i + 1} tidak terlewati`; break; }
  }
  await pilot.release();
  if (!failE) {
    log('TE ALL RINGS DONE — landing approach');
    await page.keyboard.press('KeyF');
    await sleep(300);
    log('TE flaps=', await hudText('hud-flaps'), 'gear=', await hudText('hud-gear'));
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
    log('TE LANDING outcome=', outcome, 'phase=', fin.phase, 'score=', fin.score,
      'pos=(', Math.round(fin.position.x), ',', Math.round(fin.position.y), ',', Math.round(fin.position.z), ')',
      'hits=', fin.hits, 'fuel=', fin.fuel.toFixed(3));
    if (outcome === 'complete') {
      const breakdown = {
        rings: await hudText('score-rings'), landing: await hudText('score-landing'),
        fuel: await hudText('score-fuel'), time: await hudText('score-time'), total: await hudText('score-total'),
      };
      log('TE COMPLETE-SCREEN', JSON.stringify(breakdown), 'overlay=', await page.evaluate(() => !document.getElementById('complete-screen')?.classList.contains('hidden')));
      await page.screenshot({ path: join(outDir, 'complete.png') });
    } else {
      findings.push(`TE: pendaratan setelah 8 cincin tidak complete — outcome: ${outcome}`);
    }
  } else {
    findings.push(`KRITIS TE: misi penuh gagal walau sudah pre-climb — ${failE}`);
    await pilot.release();
    await page.keyboard.up('KeyW');
  }

  // ---- TEST F: fallback landing via shot scenario -----------------------
  if (failE) {
    log('TF fallback: loadScenario(landing) ridge-courier 11/12');
    await page.evaluate(() => window.__game.loadScenario('landing'));
    await sleep(500);
    const s0 = await state();
    log('TF start rings=', s0.ringsPassed, '/', s0.ringTotal, 'pos=(', Math.round(s0.position.x), ',', Math.round(s0.position.y), ',', Math.round(s0.position.z), ') phase=', s0.phase);
    // Ring 12 ridge-courier: (330, y, 420). Fly north through it.
    const ring12 = { x: 330, y: Math.max(60, 55 + 55), z: 420 };
    const h12 = await page.evaluate(async () => {
      const m = await import('/src/terrain.js');
      return m.heightAt(330, 420);
    });
    ring12.y = Math.max(h12 + 55, 60);
    let passed12 = false; let failF = null;
    {
      const t1 = Date.now();
      while (Date.now() - t1 < 180000) {
        const r = await tick(ring12, { throttle: 0.6, vsCap: 8, vsClimb: 10 });
        const s = r.s;
        if (s.phase !== 'flying') { failF = `phase ${s.phase}`; break; }
        if (s.ringsPassed >= 12) { passed12 = true; break; }
        await sleep(150);
      }
    }
    log('TF RING12 passed=', passed12, failF ?? '');
    if (passed12) {
      // Turn around southbound and land on the strip (heading not enforced by the game).
      let outcome = null;
      {
        const t1 = Date.now();
        while (Date.now() - t1 < 240000) {
          const r = await tick({ x: 330, y: 60, z: 900 }, { throttle: 0.35, vsCap: 6, vsClimb: 6 });
          const s = r.s;
          if (s.phase !== 'flying') { outcome = s.phase; break; }
          if (Math.hypot(s.position.x - 330, s.position.z - 900) < 80 && s.position.y < 75) break;
          await sleep(150);
        }
      }
      {
        const t1 = Date.now();
        while (Date.now() - t1 < 240000) {
          const r = await tick({ x: 330, y: 16, z: 700 }, { throttle: 0.35, vsCap: 5.5, vsClimb: 5 });
          const s = r.s;
          if (s.phase === 'complete') { outcome = 'complete'; break; }
          if (s.phase === 'crashed') { outcome = `crashed hits=${s.hits} reason=${JSON.stringify(await crashReason())}`; break; }
          if (s.onGround) { outcome = `touchdown-but-still-flying z=${Math.round(s.position.z)}`; break; }
          if (s.position.z < 380 && s.position.y < 40) { outcome = 'overshoot-runway-north'; break; }
          await sleep(150);
        }
      }
      await pilot.release();
      const fin = await state();
      log('TF LANDING outcome=', outcome, 'phase=', fin.phase, 'score=', fin.score, 'hits=', fin.hits);
      if (outcome === 'complete') {
        log('TF COMPLETE-SCREEN', JSON.stringify({
          rings: await hudText('score-rings'), landing: await hudText('score-landing'),
          fuel: await hudText('score-fuel'), time: await hudText('score-time'), total: await hudText('score-total'),
        }));
        await page.screenshot({ path: join(outDir, 'complete.png') });
      } else {
        findings.push(`TF: pendaratan via skenario landing tidak complete — outcome: ${outcome}`);
      }
    } else {
      findings.push(`TF: ring 12 tidak terlewati — ${failF ?? 'timeout'}`);
    }
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
