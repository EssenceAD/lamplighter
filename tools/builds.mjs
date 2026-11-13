// Difficulty checks for 3.0: scripted players play the 15 waves with no permanent upgrades.
// Pass criteria (set by the design, not tuned automatically):
//  - first wave: two towers of any kind on any spots, nothing else done, lets nobody through
//  - random tower placement and random upgrades still clears the night (at least one star)
//  - a mixed build that is upgraded well keeps 18+ windows (three stars)
//  - no single kind of tower, however well played, earns three stars
// Run: node tools/builds.mjs [-v]
import { Game, Bot, LAST_WAVE, TOWER_ORDER, SLOTS, starsFor, rng } from '../src/game.js';
const V = process.argv.includes('-v');
function play(kind, seed) {
  const g = new Game({ seed }), bot = new Bot(g, kind, seed); let maxAlive = 0; const log = [];
  for (let i = 0; i < 30 * 60 * 40 && !g.done; i++) { bot.step(1 / 30); g.step(1 / 30); maxAlive = Math.max(maxAlive, g.enemies.length);
    for (const e of g.events) if (e.type === 'wave') log.push(`w${e.n}:${g.windows}/${g.shards}`); g.events.length = 0; }
  if (V) console.log('   ', kind, seed, log.join(' '));
  return { phase: g.phase, wave: g.wave, windows: g.windows, stars: g.phase === 'won' ? starsFor(g.windows) : 0, maxAlive, min: Math.round(g.time / 60) };
}
function firstWave(seed) {   // a newcomer: two towers anywhere, then just watches
  const r = rng(seed * 31 + 5), g = new Game({ seed }), a = Math.floor(r() * SLOTS.length); let b = Math.floor(r() * SLOTS.length); if (b === a) b = (b + 1) % SLOTS.length;
  const ta = TOWER_ORDER[Math.floor(r() * 4)], tb = TOWER_ORDER[Math.floor(r() * 4)]; g.build(a, ta); g.build(b, tb); g.callWave();
  for (let i = 0; i < 30 * 200 && g.kills + g.leaks < 20; i++) { g.step(1 / 30); g.events.length = 0; if (g.phase === 'break') g.breakT = 99; }
  return { leaks: g.leaks, what: `${ta}@${a}+${tb}@${b}` };
}
let ok = true; const line = (name, rs, f) => console.log(name.padEnd(14), rs.map(f).join(' | '));
{ const rs = Array.from({ length: 20 }, (_, i) => firstWave(i + 1)), bad = rs.filter(r => r.leaks > 0); console.log('first wave'.padEnd(14), `${rs.length - bad.length}/${rs.length} without a leak`, bad.map(r => `${r.what}:${r.leaks}`).join(' ')); if (bad.length) ok = false; }
{ const rs = Array.from({ length: 20 }, (_, i) => play("random", i + 1)); line('random', rs, r => `${r.phase[0]}${r.wave}/${r.windows}`); if (rs.filter(r => r.phase === "won").length < 14) ok = false; }
{ const rs = [1, 2, 3, 4, 5, 6].map(s => play('smart', s)); line('smart', rs, r => `${r.phase}@w${r.wave} win${r.windows} ★${r.stars} alive${r.maxAlive}`); if (!rs.every(r => r.stars === 3)) ok = false; }
for (const t of TOWER_ORDER) { const rs = [1, 2, 3, 4, 5].map(s => play('mono:' + t, s)); line('only ' + t, rs, r => `${r.phase}@w${r.wave} win${r.windows} ★${r.stars}`); if (rs.some(r => r.stars === 3)) ok = false; }
console.log(ok ? 'PASS' : 'FAIL: the difficulty spread is not what the design asks for');
process.exit(ok ? 0 : 1);
