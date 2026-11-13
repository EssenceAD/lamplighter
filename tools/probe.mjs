import fs from 'node:fs'; import { Sim, Bot } from '../src/sim.js'; import { buildWorld } from '../src/world.js'; import { makeLevel } from '../src/levels.js';
const S = JSON.parse(fs.readFileSync(new URL('../assets/shapes.json', import.meta.url)));
const up = JSON.parse(process.argv[2] || '{}');
for (const [c, s] of [[0, 3], [0, 7], [0, 11], [1, 7], [2, 7], [3, 11], [4, 11]]) {
  const w = buildWorld(S, c % 2 === 1), L = makeLevel(c, s, w.slots), n = L.waves.reduce((a, b) => a + b.n, 0);
  const sim = new Sim({ path: w.path, tower: w.tower, level: L, upgrades: up, seed: 3 }), bot = new Bot(sim); let maxS = 0; const by = {};
  for (let i = 0; i < 30 * 400 && !sim.done; i++) { bot.step(1 / 30); sim.step(1 / 30); for (const e of sim.enemies) maxS = Math.max(maxS, e.s); for (const e of sim.events) if (e.type === 'kill') by[e.by] = (by[e.by] || 0) + 1; sim.events.length = 0; }
  console.log(L.name, L.tierName, 'spawns', n, 'kills', sim.kills, 'leak', sim.leaked, 'maxS', maxS.toFixed(1), 'fl', sim.flashCount, JSON.stringify(by), sim.phase, 'win', sim.windows, 'sparkles', sim.sparkles);
}
