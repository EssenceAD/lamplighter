// Vector-traces the segmented reference silhouettes with potrace.
// Only the outline survives: the output is SVG path data, no pixels, no texture.
// Usage: node trace.js <partsDir> <out shapes.json> <out svg dir>
const potrace = require('potrace');
const Jimp = require('jimp');
const fs = require('fs');
const path = require('path');

const [partsDir, outJson, svgDir] = process.argv.slice(2);

// name -> [segmented crop, turdSize (specks smaller than this are dropped)]
const MAP = {
  house_a: ['houses_0', 12], house_b: ['houses_2', 12], house_c: ['houses_4', 12],
  house_d: ['houses_5', 12], house_e: ['houses_6', 12],
  tower: ['tower_0', 10],
  monster_a: ['monsters2_5', 40], monster_b: ['monsters2_4', 40], monster_c: ['monsters2_0', 40],
  tree_a: ['props_0', 30], tree_b: ['props_2', 30], tree_c: ['props_7', 30], tree_d: ['props_10', 30],
  bush: ['props_5', 30], well: ['props_4', 14], fence: ['props_8', 14],
  moon: ['scenery_1', 20], cloud_a: ['scenery_0', 20], cloud_b: ['scenery_3', 20],
  ridge: ['scenery_4', 20], hill_pines: ['scenery_5', 8], hill_grass: ['scenery_6', 8],
  hill_far: ['scenery_8', 20], hill_low: ['scenery_9', 20],
  path: ['path_0', 40],
};

function trace(file, turdSize) {
  return new Promise((res, rej) => {
    const t = new potrace.Potrace({ threshold: 128, turdSize, optTolerance: 0.5, alphaMax: 1.0 });
    t.loadImage(file, err => {
      if (err) return rej(err);
      const tag = t.getPathTag();
      res(tag.match(/ d="([^"]+)"/)[1]);
    });
  });
}

// Centre line of the path ribbon: rough hand-placed waypoints (fractions of the crop)
// are pulled onto the ridge of the distance transform so the walkers stay mid-path.
async function pathCentre(file) {
  const img = await Jimp.read(file);
  const S = 4, W = Math.ceil(img.bitmap.width / S), H = Math.ceil(img.bitmap.height / S);
  const small = img.clone().resize(W, H);
  const INF = 1e9, d = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) d[i] = small.bitmap.data[i * 4] < 128 ? INF : 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : d[y * W + x];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!d[y * W + x]) continue;
    d[y * W + x] = Math.min(d[y * W + x], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.414, at(x + 1, y - 1) + 1.414);
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    if (!d[y * W + x]) continue;
    d[y * W + x] = Math.min(d[y * W + x], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.414, at(x - 1, y + 1) + 1.414);
  }
  const rough = [[0.10, 0.02], [0.14, 0.07], [0.42, 0.11], [0.50, 0.16], [0.30, 0.19], [-0.02, 0.22], [-0.10, 0.26],
    [0.10, 0.29], [0.42, 0.32], [0.52, 0.36], [0.36, 0.39], [0.02, 0.405], [-0.09, 0.425], [0.10, 0.445], [0.34, 0.46],
    [0.40, 0.49], [0.26, 0.53], [-0.02, 0.58], [-0.08, 0.63], [0.10, 0.67], [0.34, 0.72], [0.40, 0.77], [0.26, 0.83],
    [0.08, 0.90], [0.02, 0.97]].map(([x, y]) => [(0.5 + x * 0.9) * W, y * H]);
  // densify
  let pts = [];
  for (let i = 0; i < rough.length - 1; i++) for (let k = 0; k < 6; k++) {
    const t = k / 6; pts.push([rough[i][0] + (rough[i + 1][0] - rough[i][0]) * t, rough[i][1] + (rough[i + 1][1] - rough[i][1]) * t]);
  }
  pts.push(rough[rough.length - 1]);
  const samp = (x, y) => at(Math.round(x), Math.round(y));
  for (let it = 0; it < 40; it++) {
    // climb the distance field
    // (only sideways, across the ribbon, so points do not bunch up at wide spots)
    pts = pts.map(([x, y], i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      let bx = x, by = y, bv = samp(x, y);
      for (let k = -3; k <= 3; k += 0.5) {
        const px = x - ty * k, py = y + tx * k, v = samp(px, py);
        if (v > bv + 0.01) { bv = v; bx = px; by = py; }
      }
      return [bx, by];
    });
    // keep spacing even (laplacian smoothing, ends fixed in x only)
    pts = pts.map((p, i) => (i === 0 || i === pts.length - 1) ? p :
      [(pts[i - 1][0] + p[0] * 2 + pts[i + 1][0]) / 4, (pts[i - 1][1] + p[1] * 2 + pts[i + 1][1]) / 4]);
  }
  const bad = pts.filter(([x, y]) => samp(x, y) < 3).length;
  console.log('path centre points', pts.length, 'off-path', bad);
  return pts.map(([x, y]) => [+(x * S).toFixed(1), +(y * S).toFixed(1)]);
}

(async () => {
  fs.mkdirSync(svgDir, { recursive: true });
  const out = {};
  for (const [name, [src, turd]] of Object.entries(MAP)) {
    const file = path.join(partsDir, src + '.png');
    const img = await Jimp.read(file);
    const w = img.bitmap.width, h = img.bitmap.height;
    const d = await trace(file, turd);
    out[name] = { w, h, d };
    fs.writeFileSync(path.join(svgDir, name + '.svg'),
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><path fill="#000" fill-rule="evenodd" d="${d}"/></svg>\n`);
    console.log(name, w, h, (d.length / 1024).toFixed(1) + 'kB');
  }
  out.path.centre = await pathCentre(path.join(partsDir, 'path_0.png'));
  fs.writeFileSync(outJson, JSON.stringify(out));
  console.log('total', (fs.statSync(outJson).size / 1024).toFixed(0) + 'kB');
})();
