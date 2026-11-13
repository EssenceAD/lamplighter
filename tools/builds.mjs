// Build checks for 2.0: three scripted players, each with a different build, play the 15 waves.
// Pass criteria (set by the design, not tuned automatically): the mirrors-only build must lose
// before wave 10, the no-optics build must not clear wave 15, the light-chain build must clear.
// Run: node tools/builds.mjs [-v]
import { Game, PlanBot, PLANS, LAST_WAVE } from '../src/game.js';
const V = process.argv.includes('-v');
function play(name, seed) {
  const g = new Game({ seed }), bot = new PlanBot(g, PLANS[name], name === 'bells' ? ['bellstun', 'chain1', 'window', 'lamp25', 'shard20', 'gift'] : ['link', 'lenshot', 'prism4', 'lamp25', 'shard20', 'chain1', 'burn', 'window', 'gift']);
  let maxAlive = 0; const log = [];
  for (let i = 0; i < 30 * 60 * 40 && !g.done; i++) { bot.step(); g.step(1 / 30); maxAlive = Math.max(maxAlive, g.enemies.length);
    for (const e of g.events) if (e.type === 'cleared') log.push(`w${e.n}:${g.windows}/${g.shards}`); g.events.length = 0; }
  if (V) console.log(' ', name, log.join(' '));
  return { name, phase: g.phase, wave: g.wave, windows: g.windows, kills: g.kills, maxAlive, built: g.tools.filter(Boolean).length, plan: bot.i + '/' + bot.plan.length };
}
let ok = true;
for (const name of Object.keys(PLANS)) {
  const rs = [1, 2, 3].map(s => play(name, s));
  console.log(name.padEnd(8), rs.map(r => `${r.phase}@w${r.wave} win${r.windows} alive${r.maxAlive} plan${r.plan}`).join(' | '));
  if (name === 'mirrors' && !rs.every(r => r.phase === 'lost' && r.wave < 10)) ok = false;
  if ((name === 'solo' || name === 'bells') && !rs.every(r => r.phase === 'lost')) ok = false;
  if (name === 'combo' && !rs.every(r => r.phase === 'won' && r.wave === LAST_WAVE)) ok = false;
}
console.log(ok ? 'PASS: only the light-chain build clears' : 'FAIL: build spread is not what the design asks for');
process.exit(ok ? 0 : 1);
