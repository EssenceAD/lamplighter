// Builds the three round monsters from the generated reference sheet ref/monsters3.png.
// The sheet came out as standing figures, so only the round heads (with their ears,
// antennae and almond eye holes) and the feet are kept and joined into lumps. The third
// one borrows its two small horns from ref/parts2/monsters2_1.png (an earlier sheet).
const Jimp = require('jimp');

// [head x0,y0,x1,y1] and [feet x0,y0,x1,y1] in sheet pixels
const PARTS = {
  monster_cut_a: { head: [150, 290, 690, 870], feet: [190, 1740, 640, 1890] },
  monster_cut_b: { head: [770, 270, 1340, 860], feet: [830, 1740, 1290, 1890] },
  monster_cut_c: { head: [1410, 450, 1990, 880], feet: [1470, 1740, 1920, 1890], horns: true },
};
const ink = (img, x, y) => img.bitmap.data[(y * img.bitmap.width + x) * 4] < 110;

(async () => {
  const sheet = await Jimp.read('../ref/monsters3.png');
  const donor = await Jimp.read('../ref/parts2/monsters2_1.png');
  for (const [name, p] of Object.entries(PARTS)) {
    const [hx0, hy0, hx1, hy1] = p.head, [fx0, fy0, fx1, fy1] = p.feet;
    const hw = hx1 - hx0, hh = hy1 - hy0, fw = fx1 - fx0, fh = fy1 - fy0;
    const lift = p.horns ? 34 : 0, pad = 14, overlap = 26;
    const W = hw + pad * 2, H = lift + hh + fh - overlap + pad * 2;
    const out = new Jimp(W, H, 0xffffffff);
    const put = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) out.setPixelColor(0x000000ff, x, y); };
    for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) if (ink(sheet, hx0 + x, hy0 + y)) put(pad + x, pad + lift + y);
    const fox = pad + Math.round((hw - fw) / 2), foy = pad + lift + hh - overlap;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) if (ink(sheet, fx0 + x, fy0 + y)) put(fox + x, foy + y);
    if (p.horns) {
      const h = donor.clone().crop(0, 0, donor.bitmap.width, 150).scale(0.72);
      const ox = Math.round((W - h.bitmap.width) / 2);
      for (let y = 0; y < h.bitmap.height; y++) for (let x = 0; x < h.bitmap.width; x++) if (ink(h, x, y)) put(ox + x, pad + y);
    }
    await out.writeAsync(`../ref/parts2/${name}.png`);
    await out.clone().resize(260, Jimp.AUTO).writeAsync(`../ref/parts2/${name}.prev.jpg`);
    console.log(name, W, H);
  }
})();
