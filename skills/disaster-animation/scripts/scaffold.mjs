#!/usr/bin/env node
// Create a runnable disaster-animation project.
//
//   node scaffold.mjs <targetDir> <Title> [--no-three]
//   node scaffold.mjs "E:/what if tiktok/Tsunami" "Tsunami"
//
// Writes the shell, fixed-step loop, HUD, director, field stub and the preview harness,
// then vendors three.js so the page works offline from file://. The result renders
// immediately, so you iterate on a working scene instead of debugging a blank page.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const here = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(here, '..', 'assets', 'template');
const HARNESS = path.join(here, 'shoot.mjs');
const EXPORTER = path.join(here, 'export.mjs');
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';

const [, , targetArg, titleArg] = process.argv;
if (!targetArg) {
  console.error('usage: node scaffold.mjs <targetDir> <Title>');
  process.exit(1);
}
const target = path.resolve(targetArg);
const title = titleArg || path.basename(target);
const noThree = process.argv.includes('--no-three');

function substitute(s) {
  return s.replace(/\{\{TITLE\}\}/g, title).replace(/\{\{TITLEUC\}\}/g, title.toUpperCase());
}
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name), dst = path.join(to, entry.name);
    if (entry.isDirectory()) { copyDir(src, dst); continue; }
    if (fs.existsSync(dst)) { console.log(`  skip (exists) ${path.relative(target, dst)}`); continue; }
    const text = fs.readFileSync(src, 'utf8');
    fs.writeFileSync(dst, /\.(html|css|js|mjs|md|json)$/.test(entry.name) ? substitute(text) : text);
    console.log(`  + ${path.relative(target, dst)}`);
  }
}

console.log(`Scaffolding "${title}" into ${target}`);
copyDir(TEMPLATE, target);

fs.mkdirSync(path.join(target, 'tools'), { recursive: true });
const harnessDst = path.join(target, 'tools', 'shoot.mjs');
if (!fs.existsSync(harnessDst)) {
  fs.copyFileSync(HARNESS, harnessDst);
  console.log('  + tools/shoot.mjs');
}
const exportDst = path.join(target, 'tools', 'export.mjs');
if (!fs.existsSync(exportDst)) {
  fs.copyFileSync(EXPORTER, exportDst);
  console.log('  + tools/export.mjs');
}
const pkg = path.join(target, 'tools', 'package.json');
if (!fs.existsSync(pkg)) {
  fs.writeFileSync(pkg, JSON.stringify({
    name: 'preview-harness', private: true, type: 'module',
    dependencies: { 'puppeteer-core': '^23' },
  }, null, 2));
  console.log('  + tools/package.json');
}

function fetchThree() {
  return new Promise((resolve, reject) => {
    const dst = path.join(target, 'lib', 'three.min.js');
    if (fs.existsSync(dst)) { console.log('  skip (exists) lib/three.min.js'); return resolve(); }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    https.get(THREE_URL, res => {
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      const out = fs.createWriteStream(dst);
      res.pipe(out);
      out.on('finish', () => { console.log('  + lib/three.min.js'); resolve(); });
    }).on('error', reject);
  });
}

try { if (!noThree) await fetchThree(); }
catch (e) {
  console.log(`  ! could not download three.js (${e.message})`);
  console.log(`    download it manually to lib/three.min.js from ${THREE_URL}`);
}

console.log(`
Done. Next:
  cd "${target}/tools" && npm install        # the preview harness needs puppeteer-core
  node tools/shoot.mjs 2 20 40               # render stills and LOOK at them
  node tools/export.mjs                      # when it is finished: 1080x1920 @ 60fps MP4
                                             # (needs ffmpeg beside the project or on PATH)

Then work through the build order in SKILL.md, starting with js/field.js.
Open index.html in Chrome to watch it play.`);
