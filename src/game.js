// 등불지기 3.0 — the rules of one night at the harbour. Pure logic (no DOM, no three.js), so the
// same code runs in the browser and headless in node (tools/builds.mjs) for the difficulty checks.
// A classic lane defence: four kinds of towers on eight build spots, a hero, two spells, 15 waves.
// Nothing here is auto-calibrated: every number below was set by hand.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export function rng(seed) { let s = seed >>> 0; return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- the map: sea at the bottom of the screen (z = +5.7), the village at the top (z = -4.7) ----------
export const TOWER = { x: 2.8, z: 3.75 };                     // the lighthouse on its crag (scenery, and where the keeper comes back to life)
const smooth = pts => { const o = []; for (let i = 0; i < pts.length - 1; i++) { const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
  for (let k = 0; k < 6; k++) { const t = k / 6, t2 = t * t, t3 = t2 * t; o.push({ x: 0.5 * (2 * p1[0] + (p2[0] - p0[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (3 * p1[0] - p0[0] - 3 * p2[0] + p3[0]) * t3),
    z: 0.5 * (2 * p1[1] + (p2[1] - p0[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (3 * p1[1] - p0[1] - 3 * p2[1] + p3[1]) * t3) }); } }
  const l = pts[pts.length - 1]; o.push({ x: l[0], z: l[1] }); return o; };
class Lane {
  constructor(raw) { this.pts = smooth(raw); this.len = [0]; for (let i = 1; i < this.pts.length; i++) this.len.push(this.len[i - 1] + Math.hypot(this.pts[i].x - this.pts[i - 1].x, this.pts[i].z - this.pts[i - 1].z)); this.total = this.len[this.len.length - 1]; }
  at(s, out) { s = clamp(s, 0, this.total); let i = 1; const L = this.len; while (i < L.length - 1 && L[i] < s) i++; const a = this.pts[i - 1], b = this.pts[i], t = (s - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1]);
    out.x = a.x + (b.x - a.x) * t; out.z = a.z + (b.z - a.z) * t; const d = Math.hypot(b.x - a.x, b.z - a.z) || 1; out.hx = (b.x - a.x) / d; out.hz = (b.z - a.z) / d; return out; }
}
// two ways out of the sea that join in the middle and wind up to the village
const ROAD = [[1.0, 0.6], [1.5, -0.6], [0.6, -1.6], [-1.0, -1.8], [-2.2, -2.6], [-2.0, -3.8], [-1.0, -4.7]];
export const LANES = [
  new Lane([[-2.3, 5.7], [-2.3, 3.8], [-2.5, 2.6], [-1.6, 1.6], [-0.2, 1.3], ...ROAD]),
  new Lane([[0.6, 5.7], [0.7, 4.0], [0.4, 2.6], [-0.2, 1.3], ...ROAD]),
];
export const SLOTS = [{ x: -0.95, z: 3.4 }, { x: -1.1, z: 0.3 }, { x: 0.95, z: 2.0 }, { x: 2.45, z: -0.5 }, { x: 0.3, z: -0.55 }, { x: -0.3, z: -2.95 }, { x: -3.2, z: -1.9 }, { x: -0.85, z: -3.65 }];
const nearestRoad = (x, z) => { let best = null, bd = 1e9; for (const L of LANES) for (const p of L.pts) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } } return { x: best.x, z: best.z, d: bd }; };

// ---------- towers: three levels, then one of two specialities ----------
export const TOWER_ORDER = ['archer', 'barracks', 'lens', 'beacon'];
export const TOWERS = {
  archer: { name: '횃불 궁수탑', hint: '빠른 화살', cost: [70, 110, 160, 230], kind: 'phys', air: true,
    lv: [{ range: 2.3, rate: 0.8, dmg: [4, 6] }, { range: 2.45, rate: 0.8, dmg: [7, 11] }, { range: 2.6, rate: 0.7, dmg: [11, 17] }],
    spec: { rapid: { name: '속사', desc: '두 배 빨리 쏴요', range: 2.7, rate: 0.36, dmg: [12, 18] }, long: { name: '장궁', desc: '멀리, 아주 세게', range: 3.5, rate: 1.3, dmg: [48, 66] } } },
  barracks: { name: '등잔병 초소', hint: '길을 막음', cost: [70, 110, 160, 230], range: 1.7,
    lv: [{ hp: 50, dmg: [1, 3], armor: 0 }, { hp: 95, dmg: [3, 5], armor: 0.15 }, { hp: 150, dmg: [6, 10], armor: 0.3 }],
    spec: { guard: { name: '방패지기', desc: '아주 단단해요', hp: 290, dmg: [8, 12], armor: 0.55 }, lancer: { name: '창잡이', desc: '세게 찔러요', hp: 190, dmg: [18, 26], armor: 0.3, rate: 0.8 } } },
  lens: { name: '렌즈탑', hint: '껍데기를 뚫는 빛', cost: [110, 170, 250, 310], kind: 'magic', air: false,
    lv: [{ range: 2.1, rate: 2.2, dmg: [10, 18] }, { range: 2.2, rate: 2.2, dmg: [23, 43] }, { range: 2.35, rate: 2.2, dmg: [40, 74] }],
    spec: { burn: { name: '태움빛', desc: '큰 피해, 느려짐', range: 2.5, rate: 2.2, dmg: [70, 120], slow: 0.5 }, split: { name: '갈래빛', desc: '셋을 한꺼번에', range: 2.5, rate: 2.2, dmg: [45, 80], multi: 3 } } },
  beacon: { name: '봉화대', hint: '터지는 불덩이', cost: [120, 200, 290, 360], kind: 'phys', air: false,
    lv: [{ range: 2.4, rate: 2.6, dmg: [12, 18], r: 0.8 }, { range: 2.5, rate: 2.6, dmg: [22, 38], r: 0.85 }, { range: 2.6, rate: 2.6, dmg: [32, 56], r: 0.95 }],
    spec: { big: { name: '큰불', desc: '넓게 크게 터져요', range: 2.8, rate: 3, dmg: [55, 95], r: 1.35 }, ember: { name: '잔불', desc: '바닥에 불이 남아요', range: 2.8, rate: 3, dmg: [34, 60], r: 1.0, burn: { dps: 14, t: 3.5 } } } },
};
export const towerStat = t => t.lvl < 4 ? TOWERS[t.type].lv[t.lvl - 1] : TOWERS[t.type].spec[t.spec];
export const sellValue = t => Math.round(t.spent * 0.6);
const SOLDIER = { rate: 1.0, spd: 1.5, respawn: 10, reach: 1.0 };

// ---------- the shadows from the sea: few and big ----------
// hp, speed (units/s), armour (share of physical damage ignored), gold, damage per hit
export const ENEMIES = {
  fry: { name: '잔챙이', hp: 18, spd: 0.55, armor: 0, gold: 5, dmg: [1, 3] },
  fish: { name: '날치', hp: 16, spd: 1.1, armor: 0, gold: 5, dmg: [1, 2] },
  crab: { name: '방패게', hp: 75, spd: 0.42, armor: 0.85, gold: 12, dmg: [3, 6] },
  gull: { name: '갈매기 그림자', hp: 28, spd: 0.8, armor: 0, gold: 8, dmg: [0, 0], fly: true },
  turtle: { name: '거북', hp: 300, spd: 0.28, armor: 0.6, gold: 32, dmg: [8, 14] },
  octo: { name: '문어', hp: 110, spd: 0.45, armor: 0, gold: 12, dmg: [3, 6], split: 3 },
  baby: { name: '새끼 문어', hp: 22, spd: 0.7, armor: 0, gold: 3, dmg: [1, 2] },
  boss: { name: '큰 고래 그림자', hp: 2400, spd: 0.2, armor: 0.3, gold: 0, dmg: [30, 50], lives: 99 },
};
// one wave = groups of [kind, how many, seconds between, seconds before the first, lane 0 | 1 | 2 (both, alternating)]
export const WAVES = [
  [['fry', 10, 2.2, 0, 0], ['fry', 10, 2.2, 22, 1]],
  [['fry', 14, 1.2, 0, 2], ['fish', 8, 1.0, 10, 0]],
  [['fry', 12, 1.0, 0, 2], ['fish', 8, 0.8, 6, 1], ['crab', 3, 3, 10, 0]],
  [['crab', 5, 2.4, 0, 2], ['fry', 16, 0.8, 4, 2], ['gull', 2, 6, 12, 0]],
  [['fish', 14, 0.6, 0, 2], ['octo', 3, 4, 6, 0], ['fry', 10, 0.8, 14, 1]],
  [['turtle', 2, 8, 0, 0], ['fry', 20, 0.7, 2, 2], ['crab', 6, 2, 10, 1]],
  [['octo', 6, 3, 0, 2], ['gull', 2, 5, 6, 1], ['fish', 14, 0.5, 14, 1], ['fry', 8, 0.8, 22, 0]],
  [['crab', 10, 1.6, 0, 2], ['turtle', 3, 7, 4, 1], ['fry', 18, 0.6, 12, 2]],
  [['gull', 3, 5, 0, 2], ['octo', 6, 2.5, 4, 0], ['fish', 16, 0.45, 16, 2], ['fry', 8, 0.7, 24, 2]],
  [['turtle', 5, 5, 0, 2], ['crab', 10, 1.5, 5, 2], ['fry', 20, 0.5, 14, 2]],
  [['fish', 26, 0.4, 0, 2], ['gull', 2, 6, 5, 0], ['octo', 6, 2, 12, 2]],
  [['octo', 10, 2, 0, 2], ['turtle', 4, 6, 4, 0], ['crab', 10, 1.4, 14, 1], ['fry', 12, 0.5, 20, 2]],
  [['turtle', 5, 6, 0, 2], ['gull', 3, 5, 4, 2], ['fish', 16, 0.4, 18, 2], ['crab', 8, 1.5, 24, 2]],
  [['crab', 11, 1.4, 0, 2], ['octo', 10, 2, 6, 2], ['turtle', 4, 6, 14, 2], ['fry', 12, 0.5, 24, 2]],
  [['fry', 14, 0.8, 0, 2], ['boss', 1, 0, 6, 1], ['crab', 8, 2, 12, 2], ['gull', 2, 6, 16, 2], ['turtle', 3, 8, 22, 0], ['fish', 8, 0.5, 30, 2]],
];
export const LAST_WAVE = WAVES.length;
export const waveHp = n => 1 + 0.03 * (n - 1);
export const BREAK = 16, START_GOLD = 230, WINDOWS = 20;
export const starsFor = windows => windows >= 18 ? 3 : windows >= 6 ? 2 : windows > 0 ? 1 : 0;
// permanent upgrades bought with stars: three steps each, costing 1, 2 and 3 stars
export const PERKS = {
  gold: { name: '든든한 주머니', desc: '시작 빛조각 +25', max: 3 }, tower: { name: '잘 벼린 화살', desc: '탑 피해 +5%', max: 3 }, troop: { name: '든든한 밥', desc: '등잔병·주민 체력 +12%', max: 3 },
  skill: { name: '빠른 손', desc: '섬광·지원군 대기 -8%', max: 3 }, hero: { name: '등대지기의 외투', desc: '등대지기 체력·힘 +15%', max: 3 },
};
export const perkCost = lvl => lvl + 1;
export const SKILLS = { flash: { cd: 45, r: 1.5, dmg: 80, stun: 0.8 }, rein: { cd: 16, n: 2, hp: 55, dmg: [2, 4], life: 20 }, hero: { cd: 24, r: 1.3, dmg: 50, stun: 1.5 } };
const HERO = { hp: 260, dmg: [11, 17], armor: 0.2, rate: 0.8, spd: 1.7, respawn: 14, reach: 1.3 };

export class Game {
  // cfg: { seed, perks: { gold, tower, troop, skill, hero } }
  constructor(cfg = {}) {
    const p = cfg.perks || {}; this.rnd = rng(cfg.seed ?? 1); this.events = [];
    this.m = { tower: 1 + 0.05 * (p.tower || 0), troop: 1 + 0.12 * (p.troop || 0), skill: 1 - 0.08 * (p.skill || 0), hero: 1 + 0.15 * (p.hero || 0) };
    this.shards = START_GOLD + 25 * (p.gold || 0); this.windowsMax = WINDOWS; this.windows = WINDOWS;
    this.wave = 0; this.phase = 'break'; this.breakT = Infinity; this.queue = []; this.time = 0; this.done = false; this.kills = 0; this.earned = 0; this.leaks = 0; this.nextId = 1;
    this.enemies = []; this.units = []; this.bombs = []; this.fires = []; this.tools = SLOTS.map(() => null); this.cd = { flash: 0, rein: 0, hero: 0 };
    const h = HERO, home = { x: 0.35, z: 1.75 };
    this.hero = this.unit('hero', home.x, home.z, { hp: h.hp * this.m.hero, dmg: [h.dmg[0] * this.m.hero, h.dmg[1] * this.m.hero], armor: h.armor, rate: h.rate, spd: h.spd, reach: h.reach });
  }
  ev(type, o) { this.events.push(Object.assign({ type }, o)); }
  roll(d) { return d[0] + (d[1] - d[0]) * this.rnd(); }
  unit(kind, x, z, s) { const u = { id: this.nextId++, kind, x, z, hp: s.hp, max: s.hp, dmg: s.dmg, armor: s.armor || 0, rate: s.rate || 1, spd: s.spd || 1.5, reach: s.reach || 1, cd: 0, home: { x, z }, tgt: null, dead: false, walking: false, idle: 0, hx: 1, ph: this.rnd() * 6.28, life: s.life ?? Infinity, hitT: 0 }; this.units.push(u); return u; }

  // ----- building
  cost(slot, type) { const t = this.tools[slot]; return t ? (t.lvl >= 4 ? Infinity : TOWERS[t.type].cost[t.lvl]) : TOWERS[type].cost[0]; }
  build(slot, type) { if (this.done || !SLOTS[slot] || this.tools[slot] || !Object.hasOwn(TOWERS, type)) return false; const c = this.cost(slot, type); if (this.shards < c) return false; this.shards -= c;
    const t = this.tools[slot] = { type, lvl: 1, spec: null, cd: 0.3, spent: c, slot, x: SLOTS[slot].x, z: SLOTS[slot].z };
    if (type === 'barracks') { const r = nearestRoad(t.x, t.z); t.rally = { x: r.x, z: r.z }; t.men = []; t.wait = [0, 0, 0]; for (let i = 0; i < 3; i++) this.muster(t, i); }
    this.ev('build', { slot, tool: type }); return true; }
  upgrade(slot, spec) { const t = this.tools[slot]; if (!t || this.done || t.lvl >= 4) return false; const T = TOWERS[t.type]; if (t.lvl === 3 && !Object.hasOwn(T.spec, spec ?? '')) return false; const c = this.cost(slot); if (this.shards < c) return false;
    this.shards -= c; t.spent += c; t.lvl++; if (t.lvl === 4) t.spec = spec;
    if (t.type === 'barracks') { const s = towerStat(t); for (const u of t.men) if (u && !u.dead) { const k = u.hp / u.max; u.max = s.hp * this.m.troop; u.hp = Math.max(u.hp, u.max * Math.max(k, 0.5)); u.dmg = s.dmg; u.armor = s.armor; u.rate = s.rate || SOLDIER.rate; } }
    this.ev('upgrade', { slot, lvl: t.lvl }); return true; }
  sell(slot) { const t = this.tools[slot]; if (!t || this.done) return false; this.shards += sellValue(t); if (t.men) for (const u of t.men) if (u) this.dismiss(u); this.tools[slot] = null; this.ev('sell', { slot }); return true; }
  spot(t, i) { const a = i * 2.094 + 0.5; return { x: t.rally.x + Math.cos(a) * 0.3, z: t.rally.z + Math.sin(a) * 0.24 }; }
  muster(t, i) { const s = towerStat(t), u = this.unit('soldier', t.x, t.z + 0.15, { hp: s.hp * this.m.troop, dmg: s.dmg, armor: s.armor, rate: s.rate || SOLDIER.rate, spd: SOLDIER.spd, reach: SOLDIER.reach }); u.home = this.spot(t, i); u.walking = true; t.men[i] = u; return u; }
  setRally(slot, x, z) { const t = this.tools[slot]; if (this.done || !t || !t.men || !Number.isFinite(x) || !Number.isFinite(z)) return false; const d = Math.hypot(x - t.x, z - t.z), R = TOWERS.barracks.range; if (d > R) { x = t.x + (x - t.x) / d * R; z = t.z + (z - t.z) / d * R; }
    x = clamp(x, -3.6, 3.6); z = clamp(z, -4.4, 3.7);
    t.rally = { x, z }; t.men.forEach((u, i) => { if (u && !u.dead) { u.home = this.spot(t, i); this.release(u); u.walking = true; } }); this.ev('rally', { slot, x, z }); return true; }
  release(u) { if (u.tgt && u.tgt.blocker === u) u.tgt.blocker = null; u.tgt = null; }
  dismiss(u) { this.release(u); u.dead = true; u.gone = true; }

  // ----- the keeper and the two spells
  moveHero(x, z) { const h = this.hero; if (this.done) return false; h.home = { x: clamp(x, -3.6, 3.6), z: clamp(z, -4.4, 3.7) }; if (!h.dead) { this.release(h); h.walking = true; } return true; }
  heroSkill() { const h = this.hero, S = SKILLS.hero; if (this.done || h.dead || this.cd.hero > 0) return false; this.cd.hero = S.cd; for (const e of this.enemies.slice()) if (!e.fly && Math.hypot(e.x - h.x, e.z - h.z) < S.r) { e.stun = Math.max(e.stun, S.stun); this.hurt(e, S.dmg, 'magic'); } this.ev('hskill', { x: h.x, z: h.z, r: S.r }); return true; }
  canFlash() { return !this.done && this.cd.flash <= 0; }
  flash(x, z) { const S = SKILLS.flash; if (!this.canFlash()) return false; this.cd.flash = S.cd * this.m.skill; for (const e of this.enemies.slice()) if (Math.hypot(e.x - x, e.z - z) < S.r) { e.stun = Math.max(e.stun, S.stun); this.hurt(e, S.dmg, 'magic'); } this.ev('flash', { x, z, r: S.r }); return true; }
  reinforce(x, z) { const S = SKILLS.rein; if (this.done || this.cd.rein > 0) return false; this.cd.rein = S.cd * this.m.skill; x = clamp(x, -3.6, 3.6); z = clamp(z, -4.4, 3.7);
    for (let i = 0; i < S.n; i++) this.unit('villager', x + (i - 0.5) * 0.5, z, { hp: S.hp * this.m.troop, dmg: S.dmg, life: S.life, reach: 1.0 }); this.ev('reinforce', { x, z }); return true; }

  // ----- waves
  callWave() { if (this.done || this.phase !== 'break' || this.wave >= LAST_WAVE) return false; if (this.wave > 0 && this.breakT < Infinity) { const n = Math.round(Math.max(0, this.breakT) * 1.5); if (n) { this.shards += n; this.ev('bonus', { n }); } } this.startWave(); return true; }
  startWave() { this.wave++; this.phase = 'wave'; let alt = 0; this.queue = [];
    for (const [kind, n, gap, t0, lane] of WAVES[this.wave - 1]) for (let i = 0; i < n; i++) this.queue.push({ t: this.time + 0.8 + t0 + i * gap, kind, lane: lane === 2 ? (alt++ & 1) : lane });
    this.queue.sort((a, b) => a.t - b.t); this.ev('wave', { n: this.wave }); }
  spawn(kind, lane, s = 0, off) { const E = ENEMIES[kind], hp = E.hp * waveHp(this.wave), e = { id: this.nextId++, type: kind, lane, s, x: 0, z: 0, hx: 0, hz: -1, hp, max: hp, spd: E.spd * (0.94 + this.rnd() * 0.12), armor: E.armor, fly: !!E.fly, off: off ?? (this.rnd() - 0.5) * (E.fly ? 0.9 : 0.5), cd: 0.5, stun: 0, slowT: 0, slowK: 1, blocker: null, ph: this.rnd() * 6.28, born: this.time, hitT: 0, burnT: 0 };
    this.place(e); this.enemies.push(e); return e; }
  place(e) { const L = LANES[e.lane]; L.at(e.s, e); e.x += -e.hz * e.off; e.z += e.hx * e.off; }
  hurt(e, dmg, kind) { if (e.dead) return; e.hp -= kind === 'magic' ? dmg : dmg * (1 - e.armor); e.hitT = 0.12; if (e.hp <= 0) this.kill(e); }
  kill(e) { e.dead = true; this.kills++; const g = ENEMIES[e.type].gold; this.shards += g; this.earned += g; if (e.blocker) e.blocker.tgt = null;
    this.ev('kill', { enemy: e.type, x: e.x, z: e.z, shard: g, fly: e.fly });
    if (ENEMIES[e.type].split) for (let i = 0; i < ENEMIES[e.type].split; i++) { const b = this.spawn('baby', e.lane, Math.max(0, e.s - i * 0.25), (i - 1) * 0.3); b.born = -9; } }

  step(dt) {
    if (this.done) return; this.time += dt; const T = this.time;
    for (const k in this.cd) if (this.cd[k] > 0) this.cd[k] = Math.max(0, this.cd[k] - dt);
    // spawning, and the pause before the next wave (it comes by itself; calling it early pays a bonus)
    if (this.phase === 'wave') { while (this.queue.length && this.queue[0].t <= T) { const q = this.queue.shift(); this.spawn(q.kind, q.lane); }
      if (!this.queue.length) { if (this.wave < LAST_WAVE) { this.phase = 'break'; this.breakT = BREAK; } else if (!this.enemies.length) { this.done = true; this.phase = 'won'; this.ev('won', { stars: starsFor(this.windows) }); return; } } }
    else if (this.phase === 'break' && this.wave > 0) { this.breakT -= dt; if (this.breakT <= 0) this.startWave(); }
    // enemies walk, or fight whoever stands in their way
    for (const e of this.enemies) { if (e.dead) continue; if (e.hitT > 0) e.hitT -= dt; if (e.stun > 0) { e.stun -= dt; continue; } if (e.slowT > 0) e.slowT -= dt;
      const b = e.blocker; if (b && (b.dead || b.tgt !== e)) e.blocker = null;
      if (e.blocker) { if (Math.hypot(b.x - e.x, b.z - e.z) < 0.6) { e.cd -= dt; if (e.cd <= 0) { e.cd = 1.0; this.wound(b, this.roll(ENEMIES[e.type].dmg)); } } continue; }
      e.s += e.spd * (e.slowT > 0 ? e.slowK : 1) * dt; this.place(e);
      if (e.s >= LANES[e.lane].total) { e.dead = true; e.leaked = true; const n = ENEMIES[e.type].lives || 1; this.windows = Math.max(0, this.windows - n); this.leaks++; this.ev('leak', { enemy: e.type, n });
        if (this.windows <= 0) { this.done = true; this.phase = 'lost'; this.ev('lost', {}); return; } } }
    // fire left on the ground
    for (const f of this.fires) { f.t -= dt; for (const e of this.enemies.slice()) if (!e.dead && !e.fly && Math.hypot(e.x - f.x, e.z - f.z) < f.r) this.hurt(e, f.dps * dt, 'magic'); }
    this.fires = this.fires.filter(f => f.t > 0);
    // fireballs in the air
    for (const b of this.bombs) { b.t -= dt; if (b.t <= 0) { for (const e of this.enemies.slice()) if (!e.dead && !e.fly && Math.hypot(e.x - b.x, e.z - b.z) < b.r) this.hurt(e, b.dmg, 'phys'); if (b.burn) this.fires.push({ x: b.x, z: b.z, r: b.r, t: b.burn.t, dps: b.burn.dps * this.m.tower }); this.ev('boom', { x: b.x, z: b.z, r: b.r }); } }
    this.bombs = this.bombs.filter(b => b.t > 0);
    // towers
    for (const t of this.tools) { if (!t) continue; const S = towerStat(t), D = TOWERS[t.type];
      if (t.type === 'barracks') { for (let i = 0; i < 3; i++) { const u = t.men[i]; if (u && u.dead) { t.men[i] = null; t.wait[i] = SOLDIER.respawn; } else if (!u) { t.wait[i] -= dt; if (t.wait[i] <= 0) this.muster(t, i); } } continue; }
      t.cd -= dt; if (t.cd > 0) continue; const R2 = S.range * S.range; let list = null, best = null, br = 1e9;
      for (const e of this.enemies) { if (e.dead || (e.fly && !D.air) || T - e.born < 0.6) continue; const dx = e.x - t.x, dz = e.z - t.z; if (dx * dx + dz * dz > R2) continue; const rest = LANES[e.lane].total - e.s; if (S.multi) (list ||= []).push([rest, e]); if (rest < br) { br = rest; best = e; } }
      if (!best) { t.cd = 0.1; continue; } t.cd = Math.max(t.cd, -dt) + S.rate;   // keep the overshoot, so the rate holds at any frame length
      if (t.type === 'beacon') { const fl = 0.8, k = best.blocker || best.stun > 0 ? 0 : best.spd * fl; this.bombs.push({ t: fl, x: best.x + best.hx * k, z: best.z + best.hz * k, r: S.r, dmg: this.roll(S.dmg) * this.m.tower, burn: S.burn }); this.ev('shot', { kind: 'bomb', slot: t.slot, x: best.x + best.hx * k, z: best.z + best.hz * k, t: fl }); continue; }
      const hit = S.multi ? list.sort((a, b) => a[0] - b[0]).slice(0, S.multi).map(a => a[1]) : [best];
      for (const e of hit) { this.ev('shot', { kind: t.type === 'lens' ? 'ray' : 'arrow', slot: t.slot, x: e.x, z: e.z, fly: e.fly }); if (S.slow) { e.slowT = 1.5; e.slowK = S.slow; } this.hurt(e, this.roll(S.dmg) * this.m.tower, D.kind); } }
    // soldiers, villagers and the keeper: stand at their post, stop and fight what comes near
    for (const u of this.units) { if (u.hitT > 0) u.hitT -= dt;
      if (u.dead) { if (u.kind === 'hero' && !u.gone) { u.wait -= dt; if (u.wait <= 0) { u.dead = false; u.hp = u.max; u.x = TOWER.x - 0.9; u.z = TOWER.z - 0.6; u.walking = true; this.ev('heroUp', {}); } } continue; }
      if (u.life < Infinity) { u.life -= dt; if (u.life <= 0) { this.dismiss(u); continue; } }
      if (u.tgt && u.tgt.dead) u.tgt = null;
      if (u.tgt) { const q = u.tgt; if (!q.blocker) q.blocker = u; else if (q.blocker !== u && Math.hypot(q.x - u.home.x, q.z - u.home.z) > u.reach + 0.6) u.tgt = null; }   // a helper takes over the block, and never chases beyond its post
      if (u.walking) { if (this.walk(u, u.home.x, u.home.z, dt)) u.walking = false; else continue; }
      if (!u.tgt) { let best = null, bd = 1e9; for (const e of this.enemies) { if (e.dead || e.fly || T - e.born < 0.6) continue; const d = Math.hypot(e.x - u.home.x, e.z - u.home.z); if (d > u.reach) continue; const sc = d + (e.blocker ? 5 : 0); if (sc < bd) { bd = sc; best = e; } }
        if (best) { u.tgt = best; if (!best.blocker) best.blocker = u; } }
      const e = u.tgt;
      if (e) { u.idle = 0; const side = u.x <= e.x ? -1 : 1; if (this.walk(u, e.x + side * 0.38, e.z + 0.02, dt, 0.12)) { u.hx = -side; u.cd -= dt; if (u.cd <= 0) { u.cd = Math.max(u.cd, -dt) + u.rate; this.hurt(e, this.roll(u.dmg), 'phys'); this.ev('hit', { x: e.x, z: e.z }); } } }
      else { this.walk(u, u.home.x, u.home.z, dt); u.idle += dt; if (u.idle > 3 && u.hp < u.max) u.hp = Math.min(u.max, u.hp + u.max * 0.12 * dt); } }
    this.enemies = this.enemies.filter(e => !e.dead); this.units = this.units.filter(u => !u.gone);
    if (this.phase === 'wave' && !this.queue.length && this.wave >= LAST_WAVE && !this.enemies.length) { this.done = true; this.phase = 'won'; this.ev('won', { stars: starsFor(this.windows) }); }
  }
  walk(u, x, z, dt, near = 0.05) { const dx = x - u.x, dz = z - u.z, d = Math.hypot(dx, dz); if (d <= near) return true; const st = Math.min(d, u.spd * dt); u.x += dx / d * st; u.z += dz / d * st; if (Math.abs(dx) > 0.05) u.hx = Math.sign(dx); u.moving = true; return d - st <= near; }
  wound(u, dmg) { if (u.dead) return; u.hp -= dmg * (1 - u.armor); u.hitT = 0.12; if (u.hp > 0) return; this.release(u); u.dead = true;
    if (u.kind === 'hero') { u.wait = HERO.respawn; this.ev('heroDown', { x: u.x, z: u.z }); } else { u.gone = true; this.ev('fall', { x: u.x, z: u.z, kind: u.kind }); } }
}

// ---------- scripted players for the difficulty checks (and the ?auto demo) ----------
// 'random': random towers on random spots, random upgrades, keeper never moved, spells thrown at the leader.
// 'smart': a mixed build with upgrades, keeper sent to the front, spells where they hurt most.
// 'mono:<tower>': only that tower everywhere, played as well as the smart one otherwise.
export const SMART_PLAN = [['b', 4, 'archer'], ['b', 1, 'barracks'], ['b', 2, 'archer'], ['b', 5, 'lens'], ['u', 4], ['b', 0, 'beacon'], ['u', 1], ['u', 2], ['b', 7, 'archer'], ['b', 3, 'lens'], ['u', 5], ['u', 4], ['u', 0], ['b', 6, 'barracks'], ['u', 5],
  ['u', 4, 'rapid'], ['u', 3], ['u', 1], ['u', 5, 'split'], ['u', 2], ['u', 0], ['u', 3], ['u', 7], ['u', 1, 'guard'], ['u', 2, 'long'], ['u', 0, 'big'], ['u', 3, 'burn'], ['u', 7], ['u', 6], ['u', 7, 'rapid'], ['u', 6]];
export class Bot {
  constructor(game, kind = 'smart', seed = 7) { this.g = game; this.kind = kind; this.rnd = rng(seed * 7919 + 13); this.i = 0; this.t = 0; this.want = null; this.mono = kind.startsWith('mono:') ? kind.slice(5) : null; }
  lead(ground) { let best = null, br = 1e9; for (const e of this.g.enemies) { if (ground && e.fly) continue; const r = LANES[e.lane].total - e.s; if (r < br) { br = r; best = e; } } return best; }
  crowd(r) { let best = null, bn = 0; for (const a of this.g.enemies) { let n = 0; for (const b of this.g.enemies) if (Math.hypot(a.x - b.x, a.z - b.z) < r) n += b.type === 'boss' ? 6 : b.type === 'turtle' ? 3 : 1; if (n > bn) { bn = n; best = a; } } return bn >= 4 ? best : null; }
  act(a) { const g = this.g; if (a[0] === 'b') return g.tools[a[1]] ? true : g.build(a[1], a[2]); const t = g.tools[a[1]]; if (!t || t.lvl >= 4) return true; return g.upgrade(a[1], a[2] || Object.keys(TOWERS[t.type].spec)[this.rnd() < 0.5 ? 0 : 1]); }
  step(dt = 1 / 30) { const g = this.g; if (g.done) return; this.t += dt;
    if (g.phase === 'break' && (g.wave === 0 ? this.t > 2 : this.kind !== 'random' && g.breakT < BREAK - 6 && g.enemies.length < 6)) g.callWave();
    // building
    if (this.kind === 'smart') { while (this.i < SMART_PLAN.length && this.act(SMART_PLAN[this.i])) this.i++; }
    else if (this.mono) { const empty = g.tools.findIndex(t => !t), order = [4, 1, 2, 5, 0, 3, 7, 6]; const low = g.tools.filter(Boolean).sort((a, b) => a.lvl - b.lvl)[0];
      if (empty >= 0 && (!low || low.lvl >= 2 || g.tools.filter(Boolean).length < 4)) { const s = order.find(i => !g.tools[i]); g.build(s, this.mono); } else if (low && low.lvl < 4) this.act(['u', low.slot]); }
    else { if (!this.want) { const empty = SLOTS.map((_, i) => i).filter(i => !g.tools[i]), built = g.tools.filter(t => t && t.lvl < 4); const doBuild = empty.length && (this.rnd() < 0.6 || !built.length);
        this.want = doBuild ? ['b', empty[Math.floor(this.rnd() * empty.length)], TOWER_ORDER[Math.floor(this.rnd() * 4)]] : built.length ? ['u', built[Math.floor(this.rnd() * built.length)].slot] : null; }
      if (this.want && this.act(this.want)) this.want = null; else if (this.want && (this.wantT = (this.wantT || 0) + dt) > 4) { this.want = null; this.wantT = 0; } }   // cannot pay for it yet: think of something else
    // spells and the keeper
    const c = this.crowd(SKILLS.flash.r); if (c && g.canFlash()) g.flash(c.x, c.z);
    const l = this.lead(true); if (l && g.cd.rein <= 0 && LANES[l.lane].total - l.s < LANES[l.lane].total * 0.75) { const p = LANES[l.lane].at(l.s + 0.6, {}); g.reinforce(p.x, p.z); }
    if (this.kind !== 'random') { const h = g.hero; if (!h.dead) { if (l && Math.floor(this.t * 2) !== Math.floor((this.t - dt) * 2) && !h.tgt) { const p = LANES[l.lane].at(l.s + 0.5, {}); if (Math.hypot(p.x - h.home.x, p.z - h.home.z) > 0.9) g.moveHero(p.x, p.z); }
        if (g.cd.hero <= 0 && g.enemies.filter(e => !e.fly && Math.hypot(e.x - h.x, e.z - h.z) < SKILLS.hero.r).length >= 3) g.heroSkill(); } }
  }
}
