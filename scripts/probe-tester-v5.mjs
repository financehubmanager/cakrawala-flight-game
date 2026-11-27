// Probe tester-v5 for CAKRAWALA (read-only vs game code). Independent v5 checks:
//  A) HUD at 960x540 for cover/cockpit/landing/crash: top clusters must not overlap;
//     crash shot: banner visible, modal hidden, compass complete.
//  B) Live playtest: takeoff, steer to ring 1 of ring-run, confirm ringsPassed increments.
//  C) Live crash path: dive into terrain in live play; confirm phase 'crashed',
//     crash banner visible AND crash modal visible (modal hidden ONLY in shot mode),
//     console/page errors collected throughout.
// Usage: node scripts/probe-tester-v5.mjs [--port 8108] [--out /tmp/probe-v5]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1] || 8108);
const outDir = args[args.indexOf('--out') + 1] || '/tmp/probe-cakrawala-v5';
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

  // ---- Phase A: HUD at 960x540, incl. crash shot ----
  const pageA = await browser.newPage({ viewport: { width: 960, height: 540 } });
  pageA.on('console', (m) => { if (m.type() === 'error') errors.push(`A console: ${m.text()}`); });
  pageA.on('pageerror', (e) => errors.push(`A pageerror: ${e.message}`));
  pageA.on('requestfailed', (r) => {
    if (!r.url().endsWith('/favicon.ico')) errors.push(`A requestfailed: ${r.url()}`);
  });
  for (const shot of ['cover', 'crash', 'cockpit', 'landing']) {
    await pageA.goto(`${base}/?lite=1&shot=${shot}`, { waitUntil: 'load', timeout: 30000 });
    await sleep(4000);
    const hud = await pageA.evaluate(() => {
      const rect = (id) => {
        const el = document.getElementById(id);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), right: Math.round(r.right) };
      };
      const vis = (el) => {
        if (!el) return 'missing';
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return `display=${cs.display} vis=${cs.visibility} w=${Math.round(r.width)} h=${Math.round(r.height)} text=${(el.textContent || '').trim().slice(0, 60)}`;
      };
      const compass = document.getElementById('hud-compass');
      const tape = document.getElementById('hud-compass-tape');
      const spans = [...(tape?.querySelectorAll('span') ?? [])].map((s) => {
        const r = s.getBoundingClientRect();
        const c = compass.getBoundingClientRect();
        const cx = r.x + r.width / 2;
        return { t: s.textContent.trim(), visible: cx > c.x && cx < c.right };
      });
      const st = window.__game ? window.__game.state() : null;
      return {
        left: rect('hud-topleft'), center: rect('hud-topcenter'), right: rect('hud-topright'),
        compassText: spans.filter((s) => s.visible).map((s) => s.t).join(' '),
        hdg: document.getElementById('hud-hdg')?.textContent,
        phase: st?.phase, speed: st?.speed, hits: st?.hits,
        banner: vis(document.getElementById('crash-banner')),
        modal: vis(document.getElementById('crash-screen')),
        modalAny: [...document.querySelectorAll('.overlay')].map((e) => vis(e)).slice(0, 3),
      };
    });
    const overlap = hud.left && hud.center && hud.right
      ? (hud.left.right >= hud.center.x || hud.center.right >= hud.right.x)
      : null;
    log(`A ${shot} 960x540: overlap=${overlap} hdg=${hud.hdg} phase=${hud.phase} speed=${hud.speed} hits=${hud.hits}`);
    log(`A ${shot} compass visible: "${hud.compassText}"`);
    log(`A ${shot} banner: ${hud.banner}`);
    log(`A ${shot} modal: ${hud.modal} | modals: ${JSON.stringify(hud.modalAny)}`);
    if (overlap) findings.push(`A ${shot}: HUD top clusters overlap at 960x540`);
    if (shot === 'crash') {
      if (!/MISI GAGAL/.test(hud.banner)) findings.push('A crash: crash banner not visible in shot mode');
      if (/display=block|display=flex/.test(hud.modal) && /w=[1-9]/.test(hud.modal)) findings.push('A crash: crash modal visible in shot mode (should be hidden)');
    }
    await pageA.screenshot({ path: join(outDir, `hud960-${shot}.png`) });
  }
  await pageA.close();

  // ---- Phase B: live playtest, ring 1 (same controller as v4) ----
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
    let tick = 0;
    let lifted = false;
    let liftT = 0;
    window.__probe.timer = setInterval(() => {
      const P = window.__probe;
      if (Date.now() - P.startWall > 150000) { P.outcome = 'timeout'; clearInterval(P.timer); setKeys(new Set()); return; }
      const s = window.__game.state();
      if (s.phase !== 'flying') { P.outcome = 'phase ' + s.phase; clearInterval(P.timer); setKeys(new Set()); return; }
      if (tick % 6 === 0) P.samples.push({ t: +((Date.now() - P.startWall) / 1000).toFixed(1), y: +s.position.y.toFixed(1), spd: +s.speed.toFixed(0), z: Math.round(s.position.z), rings: s.ringsPassed, hits: s.hits, gnd: s.onGround });
      tick += 1;
      if (!s.onGround && !lifted) { lifted = true; liftT = Date.now() - P.startWall; }
      if (s.ringsPassed >= 1) { P.outcome = `RING 1 PASSED t=${((Date.now() - P.startWall) / 1000).toFixed(1)}s y=${s.position.y.toFixed(1)} z=${Math.round(s.position.z)} speed=${s.speed.toFixed(0)}`; P.liftT = liftT; clearInterval(P.timer); setKeys(new Set()); return; }
      const keys = new Set();
      if (!lifted) {
        if (s.speed < 50) keys.add('KeyW');
        else if (s.throttle > 0.42) keys.add('KeyS');
        else keys.add('ArrowUp');
      } else {
        const dx = 330 - s.position.x;
        const dz = 620 - s.position.z;
        const desHdg = Math.atan2(dx, -dz);
        const err = wrapPi(desHdg - s.heading);
        if (err > 0.03) keys.add('ArrowLeft');
        else if (err < -0.03) keys.add('ArrowRight');
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
  log('B samples:', JSON.stringify(full.samples.slice(0, 4)), '...', JSON.stringify(full.samples.slice(-4)));
  if (probe.outcome && probe.outcome.startsWith('RING 1 PASSED')) {
    log('B RING 1 VERIFIED LIVE (in-page controller, real keyboard events)');
  } else {
    findings.push(`B: ring 1 not passed — outcome: ${probe.outcome}`);
  }
  await pageB.screenshot({ path: join(outDir, 'playtest-final.png') });

  // ---- Phase C: live crash path ----
  // Restart mission, then dive into the terrain on purpose.
  await pageB.evaluate(() => window.__game.startMission('ring-run'));
  await sleep(500);
  await pageB.evaluate(() => {
    window.__crash = { outcome: null, startWall: Date.now(), samples: [] };
    const held = new Set();
    function setKeys(want) {
      for (const k of [...held]) {
        if (!want.has(k)) { window.dispatchEvent(new KeyboardEvent('keyup', { code: k })); held.delete(k); }
      }
      for (const k of want) {
        if (!held.has(k)) { window.dispatchEvent(new KeyboardEvent('keydown', { code: k })); held.add(k); }
      }
    }
    let tick = 0;
    let lifted = false;
    window.__crash.timer = setInterval(() => {
      const P = window.__crash;
      if (Date.now() - P.startWall > 120000) { P.outcome = 'timeout'; clearInterval(P.timer); setKeys(new Set()); return; }
      const s = window.__game.state();
      if (s.phase !== 'flying') { P.outcome = 'phase ' + s.phase; clearInterval(P.timer); setKeys(new Set()); return; }
      if (tick % 10 === 0) P.samples.push({ t: +((Date.now() - P.startWall) / 1000).toFixed(1), y: +s.position.y.toFixed(1), spd: +s.speed.toFixed(0), pitch: +s.pitch.toFixed(2), gnd: s.onGround, hits: s.hits });
      tick += 1;
      const keys = new Set();
      if (!lifted) {
        if (s.speed < 55) keys.add('KeyW');
        else if (s.throttle > 0.45) keys.add('KeyS');
        else keys.add('ArrowUp');
        if (!s.onGround) lifted = true;
      } else {
        // Dive: full throttle, pitch down hard toward the terrain.
        keys.add('KeyW');
        keys.add('ArrowDown');
      }
      setKeys(keys);
    }, 16);
  });
  let cprobe = null;
  const t1 = Date.now();
  while (Date.now() - t1 < 130000) {
    cprobe = await pageB.evaluate(() => ({ outcome: window.__crash.outcome, n: window.__crash.samples.length }));
    if (cprobe.outcome) break;
    await sleep(2000);
  }
  const cfull = await pageB.evaluate(() => window.__crash);
  const cfin = await pageB.evaluate(() => window.__game.state());
  const crashDom = await pageB.evaluate(() => {
    const vis = (el) => {
      if (!el) return 'missing';
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return `display=${cs.display} w=${Math.round(r.width)} text=${(el.textContent || '').trim().slice(0, 70)}`;
    };
    return {
      banner: vis(document.getElementById('crash-banner')),
      modal: vis(document.getElementById('crash-screen')),
      modals: [...document.querySelectorAll('.overlay')].map((e) => vis(e)).slice(0, 3),
    };
  });
  log('C outcome=', cprobe.outcome, 'phase=', cfin.phase, 'speed=', cfin.speed, 'hits=', cfin.hits, 'score=', cfin.score, 'onGround=', cfin.onGround);
  log('C samples:', JSON.stringify(cfull.samples.slice(0, 4)), '...', JSON.stringify(cfull.samples.slice(-4)));
  log('C banner:', crashDom.banner);
  log('C modal:', crashDom.modal, '| modals:', JSON.stringify(crashDom.modals));
  if (cprobe.outcome === 'phase crashed') {
    log('C CRASH VERIFIED LIVE: terrain impact ends the sortie in phase crashed');
    if (!/MISI GAGAL/.test(crashDom.banner)) findings.push('C: crash banner not visible after live crash');
    if (!/display=block|display=flex/.test(crashDom.modal) && !crashDom.modals.some((m) => /display=block|display=flex/.test(m))) {
      findings.push('C: crash modal NOT visible after live crash (modal should show in live play)');
    }
  } else {
    findings.push(`C: live crash not reached — outcome: ${cprobe.outcome}`);
  }
  await pageB.screenshot({ path: join(outDir, 'crash-final.png') });
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
