// Terrain profile along the two possible finals (north and south of the
// strip), to design a flyable approach. Prints heightAt every 100 m.
// Usage: node scripts/terrain-profile.mjs [--port 8114]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1] || 8114);
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
  await page.goto(`${base}/?lite=1`, { waitUntil: 'load', timeout: 30000 });
  await sleep(2000);
  const prof = await page.evaluate(async () => {
    const { heightAt } = await import('/src/terrain.js');
    const out = {};
    for (const x of [330, 200, 460]) {
      out[`x=${x}`] = [];
      for (let z = -900; z <= 1600; z += 100) {
        out[`x=${x}`].push({ z, h: Math.round(heightAt(x, z) * 10) / 10 });
      }
    }
    return out;
  });
  for (const [k, v] of Object.entries(prof)) {
    console.log(k, v.map((p) => `${p.z}:${p.h}`).join(' '));
  }
} finally {
  if (browser) await browser.close();
  server.kill();
}
