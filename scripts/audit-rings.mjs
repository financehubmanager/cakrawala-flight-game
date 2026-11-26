// Ring-leg audit for CAKRAWALA. Runs in the browser so it uses the game's
// own heightAt (via the page's import map). For every consecutive ring pair
// in every mission it reports: climb angle vs maxPitch*0.85, and minimum
// terrain clearance along the straight line (20 samples). Also reports the
// turn angle at each interior ring and the spawn -> ring 1 leg.
// Usage: node scripts/audit-rings.mjs [--port 8111]
// Exit 0 when every leg passes, 1 otherwise.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1] || 8111);
const base = `http://127.0.0.1:${port}`;
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}/?lite=1`, { waitUntil: 'load', timeout: 30000 });
  await sleep(2000);

  const audit = await page.evaluate(async () => {
    const { COURSES, spawnFor } = await import('/src/missions.js');
    const { heightAt } = await import('/src/terrain.js');
    const { PLANE } = await import('/src/config.js');
    const maxClimb = PLANE.maxPitch * 0.85;
    const maxClimbDeg = (maxClimb * 180) / Math.PI;
    const out = { maxClimbDeg, missions: {} };
    for (const [missionId, course] of Object.entries(COURSES)) {
      const legs = [];
      const points = course.map((p) => ({ x: p.x, y: p.y, z: p.z }));
      // Spawn -> ring 1 (takeoff leg), then every consecutive ring pair.
      const spawn = spawnFor(missionId);
      const all = [{ x: spawn.x, y: spawn.y, z: spawn.z, label: 'spawn' }, ...points];
      for (let i = 0; i < all.length - 1; i += 1) {
        const a = all[i];
        const b = all[i + 1];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const dist = Math.hypot(dx, dz);
        const dy = b.y - a.y;
        const climbDeg = (Math.atan2(dy, dist) * 180) / Math.PI;
        let minClear = Infinity;
        let minClearAt = 0;
        for (let s = 1; s <= 20; s += 1) {
          const t = s / 21;
          const x = a.x + dx * t;
          const z = a.z + dz * t;
          const lineY = a.y + dy * t;
          const clear = lineY - heightAt(x, z);
          if (clear < minClear) { minClear = clear; minClearAt = t; }
        }
        // The spawn leg is the takeoff roll: the aircraft starts ON the
        // runway, so straight-line clearance is meaningless there (the
        // aircraft is on the ground by design). Only its climb angle counts.
        const isSpawnLeg = i === 0;
        legs.push({
          from: a.label ?? `ring ${i}`,
          to: `ring ${i + 1}`,
          dist: Math.round(dist),
          dy: Math.round(dy),
          climbDeg: Math.round(climbDeg * 10) / 10,
          climbOk: climbDeg <= maxClimbDeg,
          minClear: isSpawnLeg ? null : Math.round(minClear * 10) / 10,
          minClearAt: Math.round(minClearAt * 100) / 100,
          clearOk: isSpawnLeg ? true : minClear >= 40,
        });
      }
      // Turn angle at each interior ring (xz-plane, between incoming and
      // outgoing legs). >80 deg is a sharp turn that deserves a toast.
      const turns = [];
      for (let i = 1; i < points.length - 1; i += 1) {
        const v1 = { x: points[i].x - points[i - 1].x, z: points[i].z - points[i - 1].z };
        const v2 = { x: points[i + 1].x - points[i].x, z: points[i + 1].z - points[i].z };
        const a1 = Math.atan2(v1.x, -v1.z);
        const a2 = Math.atan2(v2.x, -v2.z);
        let d = a2 - a1;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        turns.push({ atRing: i + 1, turnDeg: Math.round((Math.abs(d) * 180) / Math.PI * 10) / 10, sharp: Math.abs(d) > (80 * Math.PI) / 180 });
      }
      out.missions[missionId] = {
        rings: points.map((p) => ({ x: p.x, y: Math.round(p.y * 10) / 10, z: p.z })),
        legs, turns,
      };
    }
    return out;
  });

  let allPass = true;
  console.log(`CLIMB LIMIT maxPitch*0.85 = ${audit.maxClimbDeg.toFixed(1)} deg | CLEARANCE MIN 40 m\n`);
  for (const [missionId, m] of Object.entries(audit.missions)) {
    console.log(`== ${missionId} ==`);
    console.log('  rings:', m.rings.map((r) => `(${r.x},${r.z},y${r.y})`).join(' '));
    for (const leg of m.legs) {
      const ok = leg.climbOk && leg.clearOk;
      if (!ok) allPass = false;
      console.log(`  leg ${leg.from} -> ${leg.to}: dist ${leg.dist} m, dy ${leg.dy} m, climb ${leg.climbDeg} deg [${leg.climbOk ? 'OK' : 'FAIL'}], minClear ${leg.minClear === null ? 'n/a (takeoff roll)' : `${leg.minClear} m @t=${leg.minClearAt}`} [${leg.clearOk ? 'OK' : 'FAIL'}] ${ok ? '' : '<<<'}`);
    }
    for (const t of m.turns) {
      console.log(`  turn at ring ${t.atRing}: ${t.turnDeg} deg ${t.sharp ? '[SHARP — toast]' : ''}`);
    }
    console.log('');
  }
  if (errors.length > 0) {
    console.log('PAGE ERRORS:', JSON.stringify(errors));
    allPass = false;
  }
  console.log(allPass ? 'AUDIT PASSED' : 'AUDIT FAILED');
  process.exitCode = allPass ? 0 : 1;
} catch (e) {
  console.error('AUDIT ERROR', e?.stack || String(e));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill();
}
