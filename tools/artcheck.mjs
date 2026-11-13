// Art check: is the game screen still as good as the approved look-dev scene?
// Captures the look-dev scene (tools/artref, the look-dev commit kept as it was) and the current game
// (a night in progress, interface hidden) at the same resolution with headless Chrome, saves them side
// by side, and compares three measures of the picture:
//   spread  — width of the brightness distribution (95th minus 5th percentile of luma)
//   grain   — high-frequency detail: mean relative difference between a pixel and its 3x3 blur (paper texture)
//   shadow  — share of pixels clearly darker than their surroundings (cast shadows, layered paper)
// The game fails when any measure is clearly below the look-dev one (under 70 %). Do not deploy on a fail.
// Run from the project folder:  node tools/artcheck.mjs        (exit code 1 on fail)
// Output: tools/artcheck/compare.png, tools/artcheck/game-9x16.png, game-19.5x9.png, game-20x9.png, report.json
import { createServer } from 'http';
import { readFile, mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { execFile } from 'child_process';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url), Jimp = require('jimp');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), OUT = path.join(ROOT, 'tools', 'artcheck'), PORT = 8131;
const CHROME = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && existsSync(p));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (q, s) => { try { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT)) throw 0;
  const body = await readFile(f); s.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); s.end(body); } catch (e) { s.writeHead(404); s.end(); } });
const shoot = (url, file, w, h) => new Promise((res, rej) => execFile(CHROME, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars', '--mute-audio', '--force-device-scale-factor=1',
  `--window-size=${w},${h}`, '--virtual-time-budget=14000', `--screenshot=${file}`, `http://localhost:${PORT}${url}`], { timeout: 180000 }, err => err && !existsSync(file) ? rej(err) : res(file)));

async function measure(file) {
  const img = await Jimp.read(file), W = img.bitmap.width, H = img.bitmap.height, D = img.bitmap.data, L = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) L[i] = (0.2126 * D[i * 4] + 0.7152 * D[i * 4 + 1] + 0.0722 * D[i * 4 + 2]) / 255;
  const sorted = Float32Array.from(L).sort(), pc = p => sorted[Math.floor(p * (sorted.length - 1))];
  // summed-area table for box means
  const S = new Float64Array((W + 1) * (H + 1)); for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += L[y * W + x]; S[(y + 1) * (W + 1) + x + 1] = S[y * (W + 1) + x + 1] + row; } }
  const box = (x, y, r) => { const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(W, x + r + 1), y1 = Math.min(H, y + r + 1); return (S[y1 * (W + 1) + x1] - S[y0 * (W + 1) + x1] - S[y1 * (W + 1) + x0] + S[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0)); };
  let grain = 0, gn = 0, shadow = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const l = L[y * W + x], b = box(x, y, 1); if (b > 0.02 && b < 0.9) { grain += Math.abs(l - b) / (b + 0.02); gn++; } const m = box(x, y, 20); if (m > 0.03 && l < 0.6 * m) shadow++; }
  return { spread: +(pc(0.95) - pc(0.05)).toFixed(4), grain: +(grain / Math.max(1, gn)).toFixed(4), shadow: +(shadow / (W * H)).toFixed(4), mean: +(sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(4) };
}

if (!CHROME) { console.error('no Chrome/Edge found (set CHROME=path)'); process.exit(2); }
await mkdir(OUT, { recursive: true }); await new Promise(r => server.listen(PORT, r));
try {
  const W = 450, H = 800, ref = path.join(OUT, 'lookdev-9x16.png'), game = path.join(OUT, 'game-9x16.png');
  await shoot('/tools/artref/index.html?t=9.6&mute', ref, W, H);
  await shoot('/index.html?mute&auto&nosw&shot=3', game, W, H);
  await shoot('/index.html?mute&auto&nosw&shot=3', path.join(OUT, 'game-19.5x9.png'), 390, 844);
  await shoot('/index.html?mute&auto&nosw&shot=3', path.join(OUT, 'game-20x9.png'), 360, 800);
  const a = await Jimp.read(ref), b = await Jimp.read(game), side = new Jimp(W * 2 + 12, H, 0x000000ff); side.composite(a, 0, 0).composite(b, W + 12, 0); await side.writeAsync(path.join(OUT, 'compare.png'));
  const mr = await measure(ref), mg = await measure(game), rows = ['spread', 'grain', 'shadow'].map(k => ({ measure: k, lookdev: mr[k], game: mg[k], ratio: +(mg[k] / Math.max(1e-6, mr[k])).toFixed(2) }));
  const pass = rows.every(r => r.ratio >= 0.7);
  await writeFile(path.join(OUT, 'report.json'), JSON.stringify({ pass, rows, lookdev: mr, game: mg, when: new Date().toISOString() }, null, 1));
  console.table(rows); console.log('mean luma  look-dev', mr.mean, ' game', mg.mean); console.log('side by side:', path.join(OUT, 'compare.png'));
  console.log(pass ? 'ARTCHECK PASS' : 'ARTCHECK FAIL: the game screen is clearly below the look-dev scene — do not deploy');
  server.close(); process.exit(pass ? 0 : 1);
} catch (e) { console.error(e); server.close(); process.exit(2); }
