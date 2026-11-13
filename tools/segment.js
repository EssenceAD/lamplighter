// Splits a black-on-white reference sheet into separate silhouettes.
// Usage: node segment.js <sheet.png> <outDir> [minArea] [closePx]
// Writes <outDir>/<sheet>_<n>.png (pure black/white crops) and a numbered contact sheet.
const Jimp = require('jimp');
const fs = require('fs');
const path = require('path');

(async () => {
  const [file, outDir, minAreaArg, joinArg] = process.argv.slice(2);
  const minArea = +(minAreaArg || 6000);
  const join = +(joinArg || 0); // dilate radius used only for grouping nearby bits
  const img = await Jimp.read(file);
  const W = img.bitmap.width, H = img.bitmap.height, D = img.bitmap.data;
  const ink = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const l = 0.299 * D[i * 4] + 0.587 * D[i * 4 + 1] + 0.114 * D[i * 4 + 2];
    ink[i] = l < 110 ? 1 : 0;
  }
  // grouping mask (optionally dilated so loose fragments join their parent)
  let grp = ink;
  if (join > 0) {
    const tmp = new Uint8Array(W * H);
    grp = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = 0; for (let k = -join; k <= join && !v; k++) { const xx = x + k; if (xx >= 0 && xx < W && ink[y * W + xx]) v = 1; }
      tmp[y * W + x] = v;
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = 0; for (let k = -join; k <= join && !v; k++) { const yy = y + k; if (yy >= 0 && yy < H && tmp[yy * W + x]) v = 1; }
      grp[y * W + x] = v;
    }
  }
  const label = new Int32Array(W * H);
  const comps = [];
  const stack = new Int32Array(W * H);
  for (let s = 0; s < W * H; s++) {
    if (!grp[s] || label[s]) continue;
    const id = comps.length + 1;
    let sp = 0; stack[sp++] = s; label[s] = id;
    let x0 = W, y0 = H, x1 = 0, y1 = 0, area = 0;
    while (sp) {
      const p = stack[--sp]; const x = p % W, y = (p / W) | 0;
      if (ink[p]) area++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const q = yy * W + xx;
        if (grp[q] && !label[q]) { label[q] = id; stack[sp++] = q; }
      }
    }
    comps.push({ id, x0, y0, x1, y1, area });
  }
  const keep = comps.filter(c => c.area >= minArea).sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2 || a.x0 - b.x0);
  fs.mkdirSync(outDir, { recursive: true });
  const base = path.basename(file, '.png');
  const font = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);
  const sheet = new Jimp(W, H, 0xffffffff);
  let n = 0;
  for (const c of keep) {
    const pad = 12, w = c.x1 - c.x0 + 1 + pad * 2, h = c.y1 - c.y0 + 1 + pad * 2;
    const out = new Jimp(w, h, 0xffffffff);
    for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) {
      const p = y * W + x;
      if (label[p] === c.id && ink[p]) {
        out.setPixelColor(0x000000ff, x - c.x0 + pad, y - c.y0 + pad);
        sheet.setPixelColor(0x000000ff, x, y);
      }
    }
    await out.writeAsync(path.join(outDir, `${base}_${n}.png`));
    sheet.print(font, c.x0, Math.max(0, c.y0 - 60), `${n}`);
    console.log(n, c.x0, c.y0, w, h, c.area);
    n++;
  }
  sheet.resize(900, Jimp.AUTO).quality(80);
  await sheet.writeAsync(path.join(outDir, `${base}_contact.prev.jpg`));
})();
