// Probe tester-v4 for CAKRAWALA (read-only vs game code). Independent v4 checks:
//  A) HUD at 960x540 (below 1280): top clusters must not overlap; the mission
//     banner's compass tape must show 300 / 330 / N 000 / 030 at heading ~N 000.
//  B) Live playtest: takeoff, steer to ring 1 (330, z 620, clearance 60) of
//     ring-run, confirm ringsPassed increments; collect console/page errors.
// Usage: node scripts/probe-tester-v4.mjs [--port 8107] [--out /tmp/probe-v4]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1] || 8107);
const outDir = args[args.indexOf('--out') + 1] || '/tmp/probe-cakrawala-v4';
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

  // ---- Phase A: HUD at 960x540 ----
  const pageA = await browser.newPage({ viewport: { width: 960, height: 540 } });
  pageA.on('console', (m) => { if (m.type() === 'error') errors.push(`A console: ${m.text()}`); });
  pageA.on('pageerror', (e) => errors.push(`A pageerror: ${e.message}`));
  pageA.on('requestfailed', (r) => {
    if (!r.url().endsWith('/favicon.ico')) errors.push(`A requestfailed: ${r.url()}`);
  });
  for (const shot of ['cover', 'cockpit', 'landing']) {
    await pageA.goto(`${base}/?lite=1&shot=${shot}`, { waitUntil: 'load', timeout: 30000 });
    await sleep(4000);
    const hud = await pageA.evaluate(() => {
      const rect = (id) => {
        const el = document.getElementById(id);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), right: Math.round(r.right) };
      };
      const compass = document.getElementById('hud-compass');
      const tape = document.getElementById('hud-compass-tape');
      const spans = [...(tape?.querySelectorAll('span') ?? [])].map((s) => {
        const r = s.getBoundingClientRect();
        const c = compass.getBoundingClientRect();
        // visible = span centre inside the compass window (mask fades the outer 20%)
        const cx = r.x + r.width / 2;
        return { t: s.textContent.trim(), x: Math.round(r.x), w: Math.round(r.width), visible: cx > c.x && cx < c.right };
      });
      return {
        left: rect('hud-topleft'), center: rect('hud-topcenter'), right: rect('hud-topright'),
        compassText: spans.filter((s) => s.visible).map((s) => s.t).join(' '),
        compassAll: spans.map((s) => s.t).join(' '),
        hdg: document.getElementById('hud-hdg')?.textContent,
      };
    });
    const overlap = hud.left && hud.center && hud.right
      ? (hud.left.right >= hud.center.x || hud.center.right >= hud.right.x)
      : null;
    log(`A ${shot} 960x540: left=${JSON.stringify(hud.left)} center=${JSON.stringify(hud.center)} right=${JSON.stringify(hud.right)} overlap=${overlap} hdg=${hud.hdg}`);
    log(`A ${shot} compass visible: "${hud.compassText}" (all: "${hud.compassAll}")`);
    if (overlap) findings.push(`A ${shot}: HUD top clusters overlap at 960x540`);
    await pageA.screenshot({ path: join(outDir, `hud960-${shot}.png`) });
  }
  await pageA.close();

  // ---- Phase B: live playtest, ring 1 ----
  const pageB = await browser.newPage({ viewport: { width: 640, height: 360 } });
  pageB.on('console', (m) => { if (m.type() === 'error') errors.push(`B console: ${m.text()}`); });
  pageB.on('pageerror', (e) => errors.push(`B pageerror: ${e.message}`));
  pageB.on('requestfailed', (r) => {
    if (!r.url().endsWith('/favicon.ico')) errors.push(`B requestfailed: ${r.url()}`);
  });
  await pageB.goto(`${base}/?lite=1`, { waitUntil: 'load', timeout: 30000 });
  await sleep(2000);
  await pageB.evaluate(() => window.__game.startMission('ring-run'));
  await sleep(500);
  await pageB.evaluate(() => {
    window.__probe = { samples: [], outcome: null, startWall: Date.now() };
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
    // Heading 0 flies toward -z; ring 1 at (330, z 620). Bearing from start
    // (~330, z 1040) is straight ahead, heading ~0.
    let tick = 0;
    let lifted = false;
    let liftT = 0;
    window.__probe.timer = setInterval(() => {
      const P = window.__probe;
      if (Date.now() - P.startWall > 150000) { P.outcome = 'timeout'; clearInterval(P.timer); setKeys(new Set()); return; }
      const s = window.__game.state();
      if (s.phase !== 'flying') { P.outcome = 'phase ' + s.phase; clearInterval(P.timer); setKeys(new Set()); return; }
      if (tick % 6 === 0) P.samples.push({ t: +((Date.now() - P.startWall) / 1000).toFixed(1), y: +s.position.y.toFixed(1), spd: +s.speed.toFixed(0), pitch: +s.pitch.toFixed(3), roll: +s.roll.toFixed(2), z: Math.round(s.position.z), rings: s.ringsPassed, hits: s.hits, thr: +s.throttle.toFixed(2), gnd: s.onGround });
      tick += 1;
      if (!s.onGround && !lifted) { lifted = true; liftT = Date.now() - P.startWall; }
      if (s.ringsPassed >= 1) { P.outcome = `RING 1 PASSED t=${((Date.now() - P.startWall) / 1000).toFixed(1)}s y=${s.position.y.toFixed(1)} z=${Math.round(s.position.z)} speed=${s.speed.toFixed(0)}`; P.liftT = liftT; clearInterval(P.timer); setKeys(new Set()); return; }
      const keys = new Set();
      if (!lifted) {
        if (s.speed < 50) keys.add('KeyW');
        else if (s.throttle > 0.42) keys.add('KeyS');
        else keys.add('ArrowUp');
      } else {
        // Steer toward ring 1 (330, 620): desired heading from current pos.
        const dx = 330 - s.position.x;
        const dz = 620 - s.position.z;
        const desHdg = Math.atan2(dx, -dz); // heading 0 = -z
        const err = wrapPi(desHdg - s.heading);
        if (err > 0.03) keys.add('ArrowLeft');
        else if (err < -0.03) keys.add('ArrowRight');
        // Hold y ~70 (ring 1 clearance 60 over ground ~12-15).
        const vsDes = Math.max(-4, Math.min(3, (70 - s.position.y) * 0.4));
        const pitchDes = Math.max(-0.42, Math.min(0.42, Math.asin(Math.max(-1, Math.min(1, vsDes / Math.max(30, s.speed))))));
        if (pitchDes > s.pitch + 0.015) keys.add('ArrowUp');
        else if (pitchDes < s.pitch - 0.015) keys.add('ArrowDown');
        if (s.speed > 62 && s.throttle > 0.30) keys.add('KeyS');
        else if (s.throttle < 0.27) keys.add('KeyW');
      }
      setKeys(keys);
    }, 16);
  });
  let probe = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 170000) {
    probe = await pageB.evaluate(() => ({ outcome: window.__probe.outcome, n: window.__probe.samples.length, liftT: window.__probe.liftT ?? null }));
    if (probe.outcome) break;
    await sleep(2000);
  }
  const full = await pageB.evaluate(() => window.__probe);
  const fin = await pageB.evaluate(() => window.__game.state());
  log('B outcome=', probe.outcome, 'liftoff after ms=', probe.liftT, 'phase=', fin.phase, 'rings=', fin.ringsPassed, 'hits=', fin.hits, 'score=', fin.score);
  log('B samples:', JSON.stringify(full.samples.slice(0, 6)), '...', JSON.stringify(full.samples.slice(-6)));
  if (probe.outcome && probe.outcome.startsWith('RING 1 PASSED')) {
    log('B RING 1 VERIFIED LIVE (in-page controller, real keyboard events)');
  } else {
    findings.push(`B: ring 1 not passed — outcome: ${probe.outcome}`);
  }
  await pageB.screenshot({ path: join(outDir, 'playtest-final.png') });
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
