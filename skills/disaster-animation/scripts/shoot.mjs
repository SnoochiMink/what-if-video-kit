#!/usr/bin/env node
// Headless preview harness for browser disaster animations.
//
//   node tools/shoot.mjs 12 28 41
//   node tools/shoot.mjs 30 --tag=wide --q="cam=400,80,-300&look=0,60,0&fov=45"
//   node tools/shoot.mjs 41 --w=1080 --h=1920        # full-res check
//
// Renders one frame per timestamp to tools/shots/t_<time>[_tag].png and prints render
// stats plus any console errors or page exceptions. Requires the page to support a
// `?shot=<seconds>` query parameter that fast-forwards the simulation, renders one frame,
// and then sets document.title to 'SHOT_READY'. See references/verification.md.
//
// Setup, once per project:   cd tools && npm init -y && npm i puppeteer-core
import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';
import os from 'os';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].find(p => fs.existsSync(p));
if (!CHROME) { console.error('No Chrome/Edge found. Set CHROME_PATH.'); process.exit(1); }

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const times = argv.filter(a => !a.startsWith('--')).map(Number).filter(n => !Number.isNaN(n));
if (!times.length) { console.error('usage: node tools/shoot.mjs <seconds...> [--tag=x] [--q=extra&params] [--w=540] [--h=960]'); process.exit(1); }

const extra = flag('q', '');
const tag = flag('tag', '');
const W = +flag('w', 540), H = +flag('h', 960);
const CONC = +flag('conc', 2);                       // software WebGL is CPU-bound; 2 is usually the sweet spot
const root = path.resolve(flag('root', process.cwd()));
const page_ = flag('page', 'index.html');
const outDir = path.join(root, 'tools', 'shots');
fs.mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || CHROME,
  headless: 'new',
  args: [
    // SwiftShader is Chrome's CPU rasterizer. Without --enable-unsafe-swiftshader a
    // headless WebGL canvas silently screenshots blank on many machines.
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    '--allow-file-access-from-files',                // needed for file:// + local textures
    '--hide-scrollbars', '--mute-audio',
    `--window-size=${W},${H}`,
  ],
});

async function shoot(t) {
  const pg = await browser.newPage();
  await pg.setViewport({ width: W, height: H });
  const logs = [];
  pg.on('console', m => {
    const type = m.type();
    if (type === 'error' || type === 'warning' || /error|fail|undefined/i.test(m.text())) logs.push(`[${type}] ${m.text()}`);
  });
  pg.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
  pg.on('requestfailed', r => logs.push(`[404] ${r.url().split('/').pop()}`));

  const t0 = Date.now();
  const url = 'file:///' + path.join(root, page_).replace(/\\/g, '/') + `?shot=${t}` + (extra ? '&' + extra : '');
  try {
    await pg.goto(url, { timeout: 600000 });
    // The page signals readiness itself, so we never guess at a sleep duration.
    await pg.waitForFunction(
      () => document.title === 'SHOT_READY' || (document.getElementById('err') || {}).textContent,
      { timeout: 600000, polling: 250 });
  } catch (e) { logs.push('WAIT FAILED: ' + e.message.split('\n')[0]); }
  await new Promise(r => setTimeout(r, 300));          // let the last paint land

  const name = `t_${String(t).padStart(5, '0')}${tag ? '_' + tag : ''}.png`;
  await pg.screenshot({ path: path.join(outDir, name) });

  // Pull whatever diagnostics the page exposes. Everything is optional, so a project
  // that has not defined these globals still screenshots fine.
  const info = await pg.evaluate(() => {
    const o = {};
    try { o.calls = renderer.info.render.calls; o.tris = renderer.info.render.triangles; } catch {}
    try { o.progs = renderer.info.programs.length; } catch {}
    try { o.stats = typeof simStats === 'function' ? simStats() : undefined; } catch {}
    return o;
  }).catch(() => ({}));

  console.log(`t=${t}s -> ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s) ${JSON.stringify(info)}`);
  [...new Set(logs)].slice(0, 15).forEach(m => console.log('   ' + m.slice(0, 500)));
  await pg.close();
}

for (let i = 0; i < times.length; i += CONC) {
  await Promise.all(times.slice(i, i + CONC).map(shoot));
}
await browser.close();
