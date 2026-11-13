// Cuts named rectangles out of a reference sheet (for sheets whose pieces touch each other and
// cannot be separated by segment.js). Output: pure black/white crops in ref/parts2.
// Usage: node crop.js
const Jimp = require('jimp');
const SHEETS = {
  '../ref/harbour.png': {
    cliff_a: [85, 115, 850, 660], cliff_b: [800, 125, 2040, 470], boat: [905, 610, 1280, 835], pier: [1310, 815, 1935, 1040],
    t_bell: [60, 830, 850, 1960], t_beacon: [890, 1065, 1160, 1740], barrels: [930, 1730, 1260, 1960], rock: [1190, 1270, 2040, 2040],
  },
  '../ref/waves.png': { wave_1: [70, 150, 2000, 592], wave_2: [80, 600, 2000, 870], wave_3: [70, 930, 2000, 1345] },
  '../ref/crag_a.png': { crag_a: [4, 230, 2044, 1900] },
  '../ref/crag_b.png': { crag_b: [4, 130, 2044, 1920] },
  '../ref/gull.png': { gull: [200, 60, 1730, 1790] },
  '../ref/guard.png': { guard: [160, 220, 1345, 1895] },
  '../ref/watch.png': { watch: [146, 300, 850, 1905] },
  '../ref/hut.png': { hut: [146, 146, 1775, 1905] },
};
(async () => {
  for (const [file, rects] of Object.entries(SHEETS)) {
    const img = await Jimp.read(file);
    for (const [name, [x0, y0, x1, y1]] of Object.entries(rects)) {
      const pad = 12, w = x1 - x0, h = y1 - y0, out = new Jimp(w + pad * 2, h + pad * 2, 0xffffffff);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = ((y0 + y) * img.bitmap.width + x0 + x) * 4, d = img.bitmap.data; if (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < 110) out.setPixelColor(0x000000ff, x + pad, y + pad); }
      await out.writeAsync(`../ref/parts2/${name}.png`);
      console.log(name, w, h);
    }
  }
})();
