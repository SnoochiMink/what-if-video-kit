#!/usr/bin/env node
// Offline frame-exact video export. No screen recording, no dropped frames.
//
//   node tools/export.mjs                     # 1080x1920 @ 60fps -> tools/out/video.mp4
//   node tools/export.mjs --fps=30 --crf=16
//   node tools/export.mjs --from=20 --to=30   # export a range, for quick tests
//   node tools/export.mjs --keep              # keep the PNG frames afterwards
//
// The page advances its simulation one output frame at a time via window.renderFrameAt(n),
// so wall-clock speed is irrelevant: every frame gets as long as it needs. We screenshot the
// whole page rather than the canvas, which is what captures the HTML captions and counters.
import puppeteer from 'puppeteer-core';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

// fileURLToPath, not url.pathname — the latter leaves %20 in paths containing spaces, which
// silently writes frames into a directory literally named "what%20if%20tiktok".
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n, d) => { const h = argv.find(a => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const has = n => argv.includes(`--${n}`);

const FPS = +flag('fps', 60);   // matches the 1/60 s sim step exactly: one frame per step
const W = +flag('w', 1080), H = +flag('h', 1920);
const CRF = +flag('crf', 18);
const FROM = +flag('from', 0), TO = flag('to', null);
const OUT = flag('out', path.join(root, 'tools', 'out', 'video.mp4'));
const FRAMEDIR = path.join(root, 'tools', 'frames');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
// Look beside the project first, then fall back to PATH.
// Override with --ffmpeg=<path to ffmpeg.exe> or the FFMPEG env var.
const FFMPEG = flag('ffmpeg', process.env.FFMPEG) || [
  path.join(root, '..', 'ffmpeg', 'bin', 'ffmpeg.exe'),
  path.join(root, '..', 'ffmpeg', 'ffmpeg.exe'),
  path.join(root, 'ffmpeg', 'bin', 'ffmpeg.exe'),
].find(p => fs.existsSync(p)) || 'ffmpeg';

fs.rmSync(FRAMEDIR, { recursive: true, force: true });
fs.mkdirSync(FRAMEDIR, { recursive: true });
fs.mkdirSync(path.dirname(OUT), { recursive: true });

// Try the real GPU first — it is many times faster than the CPU rasterizer. If the page
// reports no WebGL we relaunch on SwiftShader, which always works but is slow.
async function launch(gpu) {
  return puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: [
      ...(gpu ? ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-zero-copy']
              : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']),
      '--allow-file-access-from-files', '--hide-scrollbars', '--mute-audio',
      '--force-device-scale-factor=1', `--window-size=${W},${H}`,
    ],
  });
}

let browser = await launch(true);
let gpu = true;
let page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', e => errs.push(e.message));

const url = pathToFileURL(path.join(root, 'index.html')).href + `?render=1&fps=${FPS}&clean`;
await page.goto(url, { timeout: 300000 });
await page.waitForFunction(() => document.title === 'RENDER_READY', { timeout: 300000, polling: 200 })
  .catch(() => { throw new Error('page never reached RENDER_READY\n' + errs.join('\n')); });

const info = await page.evaluate(() => window.exportInfo);
let frames = info.frames;
const first = Math.round(FROM * FPS);
const last = TO != null ? Math.round(+TO * FPS) : frames;
frames = last - first;
console.log(`Export: ${W}x${H} @ ${FPS}fps, frames ${first}..${last} (${frames}), ${gpu ? 'GPU' : 'software'} rendering`);

const t0 = Date.now();
let slowFrames = 0;
for (let i = first; i < last; i++) {
  const f0 = Date.now();
  await page.evaluate(n => window.renderFrameAt(n), i);
  await page.screenshot({ path: path.join(FRAMEDIR, `f_${String(i - first).padStart(6, '0')}.png`), optimizeForSpeed: true });
  const ms = Date.now() - f0;
  if (ms > 4000) slowFrames++;
  if ((i - first) % 30 === 0 || i === last - 1) {
    const done = i - first + 1, el = (Date.now() - t0) / 1000;
    const eta = el / done * (frames - done);
    process.stdout.write(`\r  frame ${done}/${frames}  ${(done / frames * 100).toFixed(1)}%  ${(el / done).toFixed(2)}s/frame  ETA ${(eta / 60).toFixed(1)} min   `);
  }
}
console.log(`\n  rendered in ${((Date.now() - t0) / 60000).toFixed(1)} min${slowFrames ? ` (${slowFrames} slow frames)` : ''}`);
if (errs.length) console.log('  page errors:\n   ' + [...new Set(errs)].slice(0, 5).join('\n   '));
await browser.close();

// yuv420p + even dimensions keep the file playable everywhere, including TikTok's encoder.
const args = [
  '-y', '-framerate', String(FPS), '-i', path.join(FRAMEDIR, 'f_%06d.png'),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', String(CRF),
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
  OUT,
];
console.log(`Encoding -> ${OUT}`);
await new Promise((res, rej) => {
  const p = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let tail = '';
  p.stderr.on('data', d => { tail = (tail + d).slice(-2000); });
  // A missing encoder must never throw away a 20-minute render, so say where the frames are.
  p.on('error', e => rej(e.code === 'ENOENT'
    ? new Error(`ffmpeg not found (tried "${FFMPEG}").
` +
        `  The ${frames} rendered frames are still in ${FRAMEDIR}.
` +
        `  Install ffmpeg and re-run with --ffmpeg=<path>, or encode them yourself.`)
    : e));
  p.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg exited ' + c + '\n' + tail)));
});

if (!has('keep')) fs.rmSync(FRAMEDIR, { recursive: true, force: true });
const mb = (fs.statSync(OUT).size / 1048576).toFixed(1);
console.log(`Done: ${OUT} (${mb} MB, ${(frames / FPS).toFixed(1)}s)`);
