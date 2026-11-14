// Stage 1 captures (DESIGN.md §8): the folded-paper board look-dev at 9:16, 19.5:9 and 20:9, plus a greyscale copy for checking the value hierarchy.
// Run from the project folder: node tools/lookdev.mjs   ->  tools/lookdev/board-9x16.png, board-19.5x9.png, board-20x9.png, board-9x16-grey.png, board-all.png
import { createServer } from 'http';
import { readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { execFile } from 'child_process';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url), Jimp = require('jimp');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), OUT = path.join(ROOT, 'tools', 'lookdev'), PORT = 8132;
const CHROME = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && existsSync(p));
const WW = 640, WH = 920;   // the browser window; the board is pinned to the wanted size in its middle and cut out afterwards
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (q, s) => { try { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT)) throw 0; const body = await readFile(f);
  s.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); s.end(body); } catch (e) { s.writeHead(404); s.end(); } });
const shoot = (file, w, h) => new Promise((res, rej) => execFile(CHROME, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars', '--mute-audio', '--force-device-scale-factor=1',
  `--window-size=${WW},${WH}`, '--virtual-time-budget=20000', `--screenshot=${file}`, `http://localhost:${PORT}/index.html?lookdev&mute&auto&nosw&w=${w}&h=${h}`], { timeout: 180000 }, err => err && !existsSync(file) ? rej(err) : res(file)));
if (!CHROME) { console.error('no Chrome/Edge found (set CHROME=path)'); process.exit(2); }
await mkdir(OUT, { recursive: true }); await new Promise(r => server.listen(PORT, r));
try { const sizes = [['9x16', 450, 800], ['19.5x9', 390, 844], ['20x9', 360, 800]], imgs = [];
  for (const [name, w, h] of sizes) { const f = path.join(OUT, `board-${name}.png`); await shoot(f, w, h); const im = await Jimp.read(f); im.crop(Math.round((im.bitmap.width - w) / 2), Math.round((im.bitmap.height - h) / 2), w, h); await im.writeAsync(f); imgs.push(im); console.log('saved', f); }
  const grey = imgs[0].clone().greyscale(); await grey.writeAsync(path.join(OUT, 'board-9x16-grey.png'));
  const Hh = 800, all = [...imgs, grey].map(i => i.clone().resize(Jimp.AUTO, Hh)), sheet = new Jimp(all.reduce((a, i) => a + i.bitmap.width + 10, 10), Hh + 20, 0x101010ff); let x = 10; for (const i of all) { sheet.composite(i, x, 10); x += i.bitmap.width + 10; }
  await sheet.writeAsync(path.join(OUT, 'board-all.png')); console.log('saved', path.join(OUT, 'board-all.png'));
} catch (e) { console.error(e); process.exitCode = 2; } finally { server.close(); }
