// Third monster: the round body of monsters2_5 plus the two little horns cut from
// monsters2_1 (both are segmented crops of the same generated reference sheet).
const Jimp = require('jimp');
(async () => {
  const body = await Jimp.read('../ref/parts2/monsters2_5.png');
  const donor = await Jimp.read('../ref/parts2/monsters2_1.png');
  const HORN_H = +(process.argv[2] || 150), LIFT = +(process.argv[3] || 70), SC = +(process.argv[4] || 0.8);
  const horns = donor.clone().crop(0, 0, donor.bitmap.width, HORN_H).scale(SC);
  const W = body.bitmap.width, H = body.bitmap.height + LIFT;
  const out = new Jimp(W, H, 0xffffffff);
  out.composite(body.clone().flip(true, false), 0, LIFT);
  const ox = Math.round((W - horns.bitmap.width) / 2);
  horns.scan(0, 0, horns.bitmap.width, horns.bitmap.height, function (x, y, i) {
    if (this.bitmap.data[i] < 128 && x + ox >= 0 && x + ox < W) out.setPixelColor(0x000000ff, x + ox, y);
  });
  await out.writeAsync('../ref/parts2/monster_horned.png');
  await out.clone().resize(300, Jimp.AUTO).writeAsync('../ref/parts2/monster_horned.prev.jpg');
  await donor.clone().resize(300, Jimp.AUTO).writeAsync('../ref/parts2/donor.prev.jpg');
  console.log(W, H);
})();
