// App icon: the traced lantern tower silhouette on a night-blue square with an amber glow.
const Jimp = require('jimp');
(async () => {
  const src = await Jimp.read('../ref/parts2/tower_0.png');
  for (const N of [512, 192]) {
    const out = new Jimp(N, N, 0x141a3cff);
    out.scan(0, 0, N, N, function (x, y, i) { const d = Math.hypot(x - N / 2, y - N * 0.3) / N, g = Math.max(0, 1 - d * 2.2); this.bitmap.data[i] = 20 + 235 * g * g; this.bitmap.data[i + 1] = 26 + 150 * g * g; this.bitmap.data[i + 2] = 60 + 30 * g * g; });
    const t = src.clone().resize(Jimp.AUTO, Math.round(N * 0.8));
    const ox = Math.round((N - t.bitmap.width) / 2), oy = Math.round(N * 0.1);
    t.scan(0, 0, t.bitmap.width, t.bitmap.height, function (x, y, i) { if (this.bitmap.data[i] < 128) out.setPixelColor(0x0b0c1cff, x + ox, y + oy); });
    await out.writeAsync(`../assets/icon-${N}.png`);
  }
})();
