// Difficulty checks for map 1 (4.0): scripted players play the 15 waves with no permanent upgrades.
// Pass criteria (set by the design, not tuned automatically):
//  - first wave: two towers of any kind on any spots, nothing else done, lets nobody through
//  - Normal: random placement and random upgrades clears the night with at least one star in 14 of 20 runs
//  - Normal: a mixed build that is upgraded well keeps 18+ windows (three stars)
//  - Normal: no single kind of tower, however well played, earns three stars
//  - Veteran: the good build wins; the same build without specialities does not
//  - Storm: the good build with the keeper and the spells wins; the same build with the keeper left at home and no spells does not
// Run: node tools/builds.mjs [-v]
import { Game, Bot, TOWER_ORDER, SLOTS, LANES, starsFor, rng } from '../src/game.js';
const V = process.argv.includes('-v');
function play(kind, seed, mode = 'normal') {
  const g = new Game({ seed, mode }), bot = new Bot(g, kind, seed); let maxAlive = 0; const log = [];
  for (let i = 0; i < 30 * 60 * 40 && !g.done; i++) { bot.step(1 / 30); g.step(1 / 30); maxAlive = Math.max(maxAlive, g.enemies.length);
    for (const e of g.events) if (e.type === 'wave') log.push(`w${e.n}:${g.windows}/${g.shards}`); g.events.length = 0; }
  if (V) console.log('   ', kind, mode, seed, log.join(' '), 'hero lv', g.hero.lvl);
  return { phase: g.phase, wave: g.wave, windows: g.windows, stars: g.phase === 'won' ? starsFor(g.windows) : 0, maxAlive, min: Math.round(g.time / 60) };
}
function firstWave(seed) {   // a newcomer: two towers anywhere, then just watches
  const r = rng(seed * 31 + 5), g = new Game({ seed }), a = Math.floor(r() * SLOTS.length); let b = Math.floor(r() * SLOTS.length); if (b === a) b = (b + 1) % SLOTS.length;
  const ta = TOWER_ORDER[Math.floor(r() * 4)], tb = TOWER_ORDER[Math.floor(r() * 4)]; g.build(a, ta); g.build(b, tb); g.callWave();
  for (let i = 0; i < 30 * 300 && g.kills + g.leaks < 20; i++) { g.step(1 / 30); g.events.length = 0; if (g.phase === 'break') g.breakT = 99; }
  return { leaks: g.leaks, what: `${ta}@${a}+${tb}@${b}` };
}
let ok = true; const line = (name, rs, f) => console.log(name.padEnd(16), rs.map(f).join(' | ')), won = rs => rs.filter(r => r.phase === 'won').length, S6 = [1, 2, 3, 4, 5, 6];
const short = r => `${r.phase[0]}${r.wave}/${r.windows}`, full = r => `${r.phase}@w${r.wave} win${r.windows} ★${r.stars} ${r.min}m`;
console.log('lanes', LANES.map(l => l.total.toFixed(1)).join(' / '));
{ const rs = Array.from({ length: 20 }, (_, i) => firstWave(i + 1)), bad = rs.filter(r => r.leaks > 0); console.log('first wave'.padEnd(16), `${rs.length - bad.length}/${rs.length} without a leak`, bad.map(r => `${r.what}:${r.leaks}`).join(' ')); if (bad.length) ok = false; }
{ const rs = Array.from({ length: 20 }, (_, i) => play('random', i + 1)); line('random', rs, short); if (won(rs) < 14) ok = false; }
{ const rs = S6.map(s => play('smart', s)); line('smart', rs, full); if (!rs.every(r => r.stars === 3)) ok = false; }
for (const t of TOWER_ORDER) { const rs = [1, 2, 3, 4, 5].map(s => play('mono:' + t, s)); line('only ' + t, rs, r => `${r.phase}@w${r.wave} win${r.windows} ★${r.stars}`); if (rs.some(r => r.stars === 3)) ok = false; }
{ const a = S6.map(s => play('smart', s, 'veteran')), b = S6.map(s => play('nospec', s, 'veteran')); line('veteran smart', a, full); line('veteran nospec', b, short); if (won(a) < 5 || won(b) > 1) ok = false; }
{ const a = S6.map(s => play('smart', s, 'storm')), b = S6.map(s => play('idle', s, 'storm')); line('storm smart', a, full); line('storm idle', b, short); if (won(a) < 4 || won(b) > 0) ok = false; }
console.log(ok ? 'PASS' : 'FAIL: the difficulty spread is not what the design asks for');
process.exit(ok ? 0 : 1);
