// Builds the torn-paper edge mask used by every paper piece of the UI.
// The edge is not drawn: it is read off real torn edges in a CC0 scan (ambientCG CardboardSet001,
// opacity map). Each torn edge becomes a depth profile; four stretches of it make the four sides
// of a square mask that CSS then nine-slices (mask-border), so the tear keeps its scale at any size.
// Usage: node torn.js <CardboardSet001_4K-JPG_Opacity.jpg> <out torn.png>
const Jimp = require('jimp');
const [src, out] = process.argv.slice(2);

// torn edges in the 4K atlas: [x0, y0, x1, y1, side the tear faces]
const EDGES = [
  [3180, 2700, 4050, 3020, 'bottom'],   // the square sheet: torn lower edge
  [3070, 2260, 3250, 2900, 'left'],     // the square sheet: torn left edge
  [2330, 2150, 2990, 2400, 'top'],      // the ragged sheet: upper edge
  [2900, 2250, 3040, 2900, 'right'],    // the ragged sheet: right edge
];
const SIZE = 240, CORNER = 40, MID = SIZE - CORNER * 2, DEPTH = 13, SS = 3, ZOOM = 1.5;   // ZOOM: scan px (2K scale) -> mask px * SS, same in both directions

(async () => {
  const img = await Jimp.read(src), W = img.bitmap.width, D = img.bitmap.data;
  const on = (x, y) => D[(y * W + x) * 4] > 127;
  let all = [];
  for (const [x0, y0, x1, y1, side] of EDGES) {
    const p = [];
    if (side === 'bottom') for (let x = x0; x < x1; x++) { let y = y1; while (y > y0 && !on(x, y)) y--; p.push(y1 - y); }
    else if (side === 'top') for (let x = x0; x < x1; x++) { let y = y0; while (y < y1 && !on(x, y)) y++; p.push(y - y0); }
    else if (side === 'left') for (let y = y0; y < y1; y++) { let x = x0; while (x < x1 && !on(x, y)) x++; p.push(x - x0); }
    else for (let y = y0; y < y1; y++) { let x = x1; while (x > x0 && !on(x, y)) x--; p.push(x1 - x); }
    // keep the raggedness, drop the overall slant of the piece
    const n = p.length, win = 90, flat = p.map((v, i) => { let s = 0, c = 0; for (let k = Math.max(0, i - win); k < Math.min(n, i + win); k++) { s += p[k]; c++; } return v - s / c; });
    const half = []; for (let i = 0; i + 1 < n; i += 2) half.push((flat[i] + flat[i + 1]) / 4);   // 4K -> 2K scale
    const good = half.filter(v => Math.abs(v) < 40);
    console.log(side, 'samples', half.length, 'usable', good.length, 'range', Math.min(...good).toFixed(1), Math.max(...good).toFixed(1));
    all = all.concat(half.map(v => Math.max(-DEPTH, Math.min(DEPTH, v))));
  }
  // four periodic stretches (ends cross-faded so the middle slice can repeat without a seam)
  const N = MID * SS, M = Math.ceil(N / ZOOM) + 1, sides = [];
  for (let s = 0; s < 4; s++) {
    const o = Math.floor(s * (all.length - M) / 3), a = [], f = 24 * SS; for (let i = 0; i < N; i++) { const u = i / ZOOM, k = Math.floor(u), t = u - k; a.push((all[o + k] * (1 - t) + all[o + k + 1] * t) * ZOOM); }
    for (let i = 0; i < f; i++) { const t = i / f; a[N - f + i] = a[N - f + i] * (1 - t) + a[0] * t; }
    const lo = Math.min(...a); sides.push(a.map(v => v - lo + 1));
  }
  console.log('profile px available', all.length, 'needed', M * 4, 'deepest tear (mask px)', (Math.max(...sides.flat()) / SS).toFixed(1));
  const B = SIZE * SS, at = (s, i) => sides[s][(((i - CORNER * SS) % N) + N) % N];
  const big = new Uint8Array(B * B);
  for (let y = 0; y < B; y++) for (let x = 0; x < B; x++) {
    const inside = y >= at(0, x) && B - 1 - y >= at(1, x) && x >= at(2, y) && B - 1 - x >= at(3, y)
      && x + y > 9 * SS && (B - 1 - x) + y > 6 * SS && x + (B - 1 - y) > 7 * SS && (B - 1 - x) + (B - 1 - y) > 10 * SS;
    big[y * B + x] = inside ? 1 : 0;
  }
  const png = new Jimp(SIZE, SIZE, 0x00000000);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    let s = 0; for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) s += big[(y * SS + j) * B + x * SS + i];
    png.setPixelColor(Jimp.rgbaToInt(0, 0, 0, Math.round(255 * s / (SS * SS))), x, y);
  }
  await png.writeAsync(out);
  console.log('wrote', out, SIZE + 'x' + SIZE, 'slice', CORNER);
})();
