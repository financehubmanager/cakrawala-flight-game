// Probe 15 for CAKRAWALA (read-only vs game code). HUD check at 1280x720.
// Screenshots the cockpit shot and the play shot at the bounty size to check
// whether the HUD/mission-panel overlaps seen at 640x360 persist.
// Usage: node scripts/probe-playtest15.mjs [--port 8106] [--out /tmp/probe15]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1] || 8106);
const outDir = args[args.indexOf('--out') + 1] || '/tmp/probe-cakrawala15';
await mkdir(outDir, { recursive: true });
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
const errors = [];
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
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => {
    if (!r.url().endsWith('/favicon.ico')) errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`);
  });
  for (const shot of ['cockpit', 'play', 'landing']) {
    await page.goto(`${base}/?lite=1&shot=${shot}`, { waitUntil: 'load', timeout: 30000 });
    await sleep(4000);
    await page.screenshot({ path: join(outDir, `shot-${shot}-1280.png`) });
    console.log('saved shot', shot);
  }
  console.log('ERRORS(' + errors.length + ')', errors.length ? JSON.stringify(errors) : 'none');
} catch (e) {
  console.log('PROBE ERROR', e?.stack || String(e));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log('PROBE DONE');
