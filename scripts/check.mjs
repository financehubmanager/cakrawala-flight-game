// Headless load + playtest check for CAKRAWALA. Starts serve.ts, opens the
// game in Chromium, fails loudly on console/page errors or a blank canvas,
// then plays mission 1 by script (throttle up, steer) and asserts the flight
// model actually moves. Usage: node scripts/check.mjs [--url <base>]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { access } from 'node:fs/promises';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = portIndex === -1 ? 8091 : Number(args[portIndex + 1]);
const base = `http://127.0.0.1:${port}`;

async function findChrome() {
  const home = process.env.HOME;
  const candidates = [
    `${home}/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome`,
    `${home}/.cache/ms-playwright/chromium_headless_shell-1254/chrome-linux/headless_shell`,
  ];
  for (const c of candidates) {
    try { await access(c); return c; } catch { /* next */ }
  }
  return undefined;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServer(tries = 40) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(`${base}/index.html`);
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  return false;
}

const server = spawn('node', ['serve.ts', '--port', String(port)], { cwd: root, stdio: 'ignore' });
const failures = [];
try {
  if (!(await waitForServer())) {
    failures.push('serve.ts did not answer');
    throw new Error('no server');
  }
  const executablePath = await findChrome();
  const browser = await chromium.launch({
    executablePath,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('requestfailed', (req) => {
    if (!req.url().endsWith('/favicon.ico')) errors.push(`requestfailed: ${req.url()} ${req.failure()?.errorText}`);
  });

  await page.goto(`${base}/?lite=1`, { waitUntil: 'load', timeout: 30000 });
  await sleep(3000);

  const boot = await page.evaluate(() => new Promise((resolve) => {
    // Read the WebGL canvas inside a rAF callback, in the same frame the
    // game rendered it — reading it from outside the frame returns blank.
    requestAnimationFrame(() => {
      const canvas = document.getElementById('game');
      const hasGame = typeof window.__game?.state === 'function';
      const state = hasGame ? window.__game.state() : null;
      let nonBlank = false;
      try {
        const off = document.createElement('canvas');
        off.width = 64; off.height = 36;
        const ctx = off.getContext('2d');
        ctx.drawImage(canvas, 0, 0, 64, 36);
        const data = ctx.getImageData(0, 0, 64, 36).data;
        let sum = 0; let sumSq = 0;
        for (let i = 0; i < data.length; i += 4) {
          const v = (data[i] + data[i + 1] + data[i + 2]) / 3;
          sum += v; sumSq += v * v;
        }
        const n = data.length / 4;
        const mean = sum / n;
        const variance = sumSq / n - mean * mean;
        nonBlank = variance > 50;
      } catch (e) { nonBlank = false; }
      resolve({ hasGame, state, nonBlank, titleVisible: !document.getElementById('title-screen')?.classList.contains('hidden') });
    });
  }));
  console.log('BOOT', JSON.stringify(boot, null, 2));
  if (!boot.hasGame) failures.push('window.__game missing');
  if (!boot.nonBlank) failures.push('canvas looks blank (variance too low)');
  if (!boot.titleVisible) failures.push('title screen not visible on load');

  // Scripted playtest: start mission 1, throttle up, steer, assert flight.
  // Headless software rendering is slow, so wait on game state, not wall time.
  await page.evaluate(() => window.__game.startMission('ring-run'));
  await sleep(500);
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => {
    const s = window.__game.state();
    return s.throttle > 0.5;
  }, { timeout: 60000 });
  await page.waitForFunction(() => {
    const s = window.__game.state();
    return s.speed > 30;
  }, { timeout: 90000 });
  await page.keyboard.down('ArrowLeft');
  await page.waitForFunction(() => {
    const s = window.__game.state();
    return Math.abs(s.roll) > 0.05 || Math.abs(s.heading) > 0.01;
  }, { timeout: 30000 });
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('KeyW');
  const flight = await page.evaluate(() => window.__game.state());
  console.log('FLIGHT', JSON.stringify(flight, null, 2));
  if (flight.phase !== 'flying') failures.push(`phase is ${flight.phase}, expected flying`);
  if (flight.speed < 20) failures.push(`speed ${flight.speed} too low after throttle`);
  if (flight.throttle < 0.5) failures.push(`throttle ${flight.throttle} did not rise`);
  if (Math.abs(flight.roll) < 0.05 && Math.abs(flight.heading) < 0.01) {
    failures.push('steering had no effect (roll and heading unchanged)');
  }
  if (errors.length > 0) failures.push(...errors);

  // Shot modes must all boot without errors. The crash shot is a real
  // crashed state (v5), so it must reach phase 'crashed', not 'flying'.
  for (const shot of ['cover', 'crash', 'cockpit', 'landing']) {
    await page.goto(`${base}/?shot=${shot}&seed=1`, { waitUntil: 'load', timeout: 30000 });
    await sleep(3000);
    const shotState = await page.evaluate(() => window.__game?.state?.() ?? null);
    console.log(`SHOT ${shot}`, JSON.stringify(shotState));
    const expected = shot === 'crash' ? 'crashed' : 'flying';
    if (!shotState || shotState.phase !== expected) failures.push(`shot ${shot} phase is ${shotState?.phase}, expected ${expected}`);
  }
  if (errors.length > 0) failures.push(...errors);
  await browser.close();
} finally {
  server.kill();
}

if (failures.length > 0) {
  console.error(`\nCHECK FAILED (${failures.length}):`);
  failures.forEach((f) => console.error(` - ${f}`));
  process.exit(1);
}
console.log('\nCHECK PASSED');
