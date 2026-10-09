// node tools/sheet.mjs --q="follow=0,170,40" 13 16 19 ...   -> tools/shots/sheet.png
// Renders each time through the export path (look.mjs) and tiles them into
// one contact sheet, 5 across, so a whole sequence can be judged at once.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n, d) => { const h = argv.find(a => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const times = argv.filter(a => !a.startsWith('--'));
const q = flag('q', ''), out = flag('out', 'sheet.png'), cols = +flag('cols', 5);
const shots = [];
const reuse = argv.includes('--reuse');
for (const t of times) {
  const name = path.join(root, 'tools', 'shots', `look_${String(t).replace('.', '_')}_sh.png`);
  if (reuse && fs.existsSync(name)) { shots.push(name); continue; }
  const args = [path.join(root, 'tools', 'look.mjs'), t, '--tag=sh'];
  if (q) args.push(`--q=${q}`);
  const r = execFileSync(process.execPath, args, { encoding: 'utf8' }).trim().split('\n').pop();
  shots.push(path.join(root, r));
}
const ff = path.join(root, '..', 'ffmpeg', 'bin', 'ffmpeg.exe');
const rows = Math.ceil(shots.length / cols);
const inputs = shots.flatMap(s => ['-i', s]);
const scaled = shots.map((_, i) => `[${i}:v]scale=270:480,drawtext=text='${times[i]}':x=8:y=8:fontsize=26:fontcolor=yellow:box=1:boxcolor=black@0.6[s${i}]`).join(';');
const pad = shots.length < rows * cols ? Array.from({ length: rows * cols - shots.length }, (_, k) => `color=black:270x480[p${k}]`).join(';') + ';' : '';
const labels = shots.map((_, i) => `[s${i}]`).join('') + Array.from({ length: rows * cols - shots.length }, (_, k) => `[p${k}]`).join('');
const layout = Array.from({ length: rows * cols }, (_, i) => `${(i % cols) * 270}_${Math.floor(i / cols) * 480}`).join('|');
const filter = `${pad}${scaled};${labels}xstack=inputs=${rows * cols}:layout=${layout}`;
try { execFileSync(ff, ['-y', ...inputs, '-filter_complex', filter, '-frames:v', '1', '-update', '1', path.join(root, 'tools', 'shots', out)], { stdio: ['ignore', 'ignore', 'pipe'] }); }
catch (e) { console.error(String(e.stderr).slice(-1500)); process.exit(1); }
console.log('tools/shots/' + out);
