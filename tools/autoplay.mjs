// Headless play-through with the built-in bot: node tools/autoplay.js [all|ch1|firsts]
// Reports stars per night so the difficulty curve can be checked without a browser.
import fs from 'node:fs';
import { Sim, Bot, UPGRADE_MAX } from '../src/sim.js';
import { buildWorld } from '../src/world.js';
import { makeLevel, STAGES, CHAPTERS, UPGRADES } from '../src/levels.js';

const SHAPES = JSON.parse(fs.readFileSync(new URL('../assets/shapes.json', import.meta.url)));
const mode = process.argv[2] || 'all';
// a player who spends sparkles as they come: cheapest upgrade first
function spend(save) {
  for (;;) {
    let best = null;
    for (const u of UPGRADES) { const l = save.up[u.id] || 0; if (l >= u.cost.length || (u.ch != null && u.ch > save.ch)) continue; if (!best || u.cost[l] < best.c) best = { u, c: u.cost[l] }; }
    if (!best || best.c > save.sparkles) return;
    save.sparkles -= best.c; save.up[best.u.id] = (save.up[best.u.id] || 0) + 1;
  }
}
const save = { up: {}, sparkles: 0, ch: 0 };
let out = '', fails = 0, total = 0, stars = 0;
for (let c = 0; c < CHAPTERS.length; c++) {
  save.ch = c; const world = buildWorld(SHAPES, c % 2 === 1); let line = `ch${c + 1} `;
  for (let s = 0; s < STAGES; s++) {
    if (mode === 'ch1' && c > 0) continue;
    const level = makeLevel(c, s, world.slots);
    if (mode === 'firsts' && !level.newTool && !level.newEnemy) continue;
    let res = null;
    for (let attempt = 0; attempt < 3 && !(res && res.phase === 'won'); attempt++) {
      const sim = new Sim({ path: world.path, tower: world.tower, level, upgrades: save.up, seed: 7 + attempt });
      const bot = new Bot(sim);
      for (let i = 0; i < 60 * 400 && !sim.done; i++) { bot.step(1 / 30); sim.step(1 / 30); }
      res = sim;
    }
    total++; if (res.phase !== 'won') fails++; else stars += res.stars;
    line += res.phase === 'won' ? res.stars : 'x';
    if (res.phase === 'won') { save.sparkles += res.sparkles; spend(save); }
    if (process.argv.includes('-v')) console.log(level.name, level.tierName, res.phase, 'stars', res.stars, 'kills', res.kills, 'leak', res.leaked, 't', res.t.toFixed(0), JSON.stringify(save.up));
  }
  out += line + '\n';
}
console.log(out + `nights ${total}, lost ${fails}, stars ${stars}/${total * 3}`);
process.exit(fails ? 1 : 0);
