// Art check (DESIGN.md §6): is the game board still as good as the approved stage-1 look-dev?
// The baseline is the approved look-dev, locked as pictures in tools/artref (board-9x16.png, board-19.5x9.png, board-20x9.png).
// This captures the current game (a scripted night held still at wave 3, interface on, as the player sees it) at the same three
// sizes with headless Chrome, saves baseline and game side by side, and compares four measures of the 9:16 picture:
//   spread  — width of the brightness distribution (95th minus 5th percentile of luma)
//   grain   — high-frequency detail: mean relative difference between a pixel and its 3x3 blur (paper texture, fold lines)
//   shadow  — share of pixels clearly darker than their surroundings (cast shadows, layered paper)
//   warm    — share of clearly warm pixels (lantern pools, windows): the lighting mood
// The game fails when any measure is below 85 % of the baseline, or the mean brightness leaves 80–125 % of it. Do not deploy on a fail.
// It also runs the flicker check on the same build (zero black frames, zero luminance spikes over 12 s of play with resolution changes and a pause).
// Run from the project folder:  node tools/artcheck.mjs        (exit code 1 on fail)
// Output: tools/artcheck/compare.png (baseline | game at 9:16), compare-all.png (all three ratios), game-*.png, report.json
import { createServer } from 'http';
import { readFile, mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { execFile } from 'child_process';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url), Jimp = require('jimp');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), OUT = path.join(ROOT, 'tools', 'artcheck'), REF = path.join(ROOT, 'tools', 'artref'), PORT = 8131, WW = 640, WH = 920;
const CHROME = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && existsSync(p));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (q, s) => { try { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT)) throw 0;
  const body = await readFile(f); s.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); s.end(body); } catch (e) { s.writeHead(404); s.end(); } });
const FLAGS = ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars', '--mute-audio', '--force-device-scale-factor=1', `--window-size=${WW},${WH}`];
const shoot = (file, w, h) => new Promise((res, rej) => execFile(CHROME, [...FLAGS, '--virtual-time-budget=20000', `--screenshot=${file}`, `http://localhost:${PORT}/index.html?mute&auto&nosw&shot=3&w=${w}&h=${h}`], { timeout: 240000 }, err => err && !existsSync(file) ? rej(err) : res(file)));
const dump = url => new Promise((res, rej) => execFile(CHROME, [...FLAGS, '--virtual-time-budget=60000', '--dump-dom', `http://localhost:${PORT}${url}`], { timeout: 400000, maxBuffer: 1 << 26 }, (err, out) => err && !out ? rej(err) : res(out)));

async function measure(img) {
  const W = img.bitmap.width, H = img.bitmap.height, D = img.bitmap.data, L = new Float32Array(W * H); let warm = 0;
  for (let i = 0; i < W * H; i++) { const r = D[i * 4], g = D[i * 4 + 1], b = D[i * 4 + 2]; L[i] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; if (r > 110 && r > b * 1.5 && g > b) warm++; }
  const sorted = Float32Array.from(L).sort(), pc = p => sorted[Math.floor(p * (sorted.length - 1))];
  const S = new Float64Array((W + 1) * (H + 1)); for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += L[y * W + x]; S[(y + 1) * (W + 1) + x + 1] = S[y * (W + 1) + x + 1] + row; } }
  const box = (x, y, r) => { const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(W, x + r + 1), y1 = Math.min(H, y + r + 1); return (S[y1 * (W + 1) + x1] - S[y0 * (W + 1) + x1] - S[y1 * (W + 1) + x0] + S[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0)); };
  let grain = 0, gn = 0, shadow = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const l = L[y * W + x], b = box(x, y, 1); if (b > 0.02 && b < 0.9) { grain += Math.abs(l - b) / (b + 0.02); gn++; } const m = box(x, y, 20); if (m > 0.03 && l < 0.6 * m) shadow++; }
  return { spread: +(pc(0.95) - pc(0.05)).toFixed(4), grain: +(grain / Math.max(1, gn)).toFixed(4), shadow: +(shadow / (W * H)).toFixed(4), warm: +(warm / (W * H)).toFixed(4), mean: +(sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(4) };
}

if (!CHROME) { console.error('no Chrome/Edge found (set CHROME=path)'); process.exit(2); }
await mkdir(OUT, { recursive: true }); await new Promise(r => server.listen(PORT, r));
try {
  const sizes = [['9x16', 450, 800], ['19.5x9', 390, 844], ['20x9', 360, 800]], pairs = [];
  for (const [name, w, h] of sizes) { const f = path.join(OUT, `game-${name}.png`); await shoot(f, w, h); const im = await Jimp.read(f); im.crop(Math.round((im.bitmap.width - w) / 2), Math.round((im.bitmap.height - h) / 2), w, h); await im.writeAsync(f); pairs.push([await Jimp.read(path.join(REF, `board-${name}.png`)), im]); }
  const side = async (list, file) => { const Hh = 800, all = list.flat().map(i => i.clone().resize(Jimp.AUTO, Hh)), sheet = new Jimp(all.reduce((a, i) => a + i.bitmap.width + 10, 10), Hh + 20, 0x101010ff); let x = 10; for (const i of all) { sheet.composite(i, x, 10); x += i.bitmap.width + 10; } await sheet.writeAsync(file); };
  await side([pairs[0]], path.join(OUT, 'compare.png')); await side(pairs, path.join(OUT, 'compare-all.png'));
  const mr = await measure(pairs[0][0]), mg = await measure(pairs[0][1]), rows = ['spread', 'grain', 'shadow', 'warm'].map(k => ({ measure: k, baseline: mr[k], game: mg[k], ratio: +(mg[k] / Math.max(1e-6, mr[k])).toFixed(2) }));
  const lum = +(mg.mean / mr.mean).toFixed(2), artOk = rows.every(r => r.ratio >= 0.85) && lum >= 0.8 && lum <= 1.25;
  let flicker = null; try { const dom = await dump('/index.html?mute&auto&nosw&shot=3&flicker&w=450&h=800'), m = dom.match(/data-flicker="([^"]*)"/); flicker = m ? JSON.parse(m[1].replace(/&quot;/g, '"')) : null; } catch (e) { console.error('flicker run failed', e.message); }
  const flickOk = !!flicker && flicker.spikes === 0 && flicker.black === 0, pass = artOk && flickOk;
  await writeFile(path.join(OUT, 'report.json'), JSON.stringify({ pass, artOk, flickOk, rows, meanLumaRatio: lum, baseline: mr, game: mg, flicker, when: new Date().toISOString() }, null, 1));
  console.table(rows); console.log('mean luma  baseline', mr.mean, ' game', mg.mean, ' ratio', lum); console.log('flicker', JSON.stringify(flicker)); console.log('side by side:', path.join(OUT, 'compare.png'));
  console.log(pass ? 'ARTCHECK PASS' : `ARTCHECK FAIL (${artOk ? '' : 'the board is below the approved look-dev '}${flickOk ? '' : 'flicker check failed'}) — do not deploy`);
  server.close(); process.exit(pass ? 0 : 1);
} catch (e) { console.error(e); server.close(); process.exit(2); }
