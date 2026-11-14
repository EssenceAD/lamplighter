// 등불지기 4.0 — the rules of one night on the island. Pure logic (no DOM, no three.js), so the
// same code runs in the browser and headless in node (tools/builds.mjs) for the difficulty checks.
// A classic lane defence: four kinds of towers on eleven build spots, each with three levels, two specialities and
// their own abilities; a hero who levels up; two spells; 15 waves; three difficulty modes.
// Nothing here is auto-calibrated: every number below was set by hand.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export function rng(seed) { let s = seed >>> 0; return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- map 1: the island of the approved look-dev. Sea entries at the bottom of the screen (z = +11), the village at the top (z = -13) ----------
export const Z0 = -21.5, Z1 = 11.4, STEP = [0.8, -7.2, -12.2];                // island from back to shore; the terraces rise at these lines
export const hAt = z => (z > STEP[0] ? 0 : z > STEP[1] ? 0.5 : z > STEP[2] ? 1.0 : 1.5);
export const halfW = z => { const t = clamp((z - Z0) / (Z1 - Z0)); return 8.5 * Math.pow(Math.sin(Math.PI * clamp(t * 0.93 + 0.035)), 0.4) * (1 + 0.045 * Math.sin(z * 0.85) + 0.03 * Math.sin(z * 2.3 + 1)); };
export const ROAD = [[0, 1.5], [-1.2, 0.4], [-3.6, -0.6], [-6.2, -1.2], [-7.0, -2.9], [-5.6, -4.3], [-3.0, -4.6], [-1.2, -5.8], [0.8, -5.9], [2.2, -4.4], [4.2, -4.3], [5.4, -5.6], [6.6, -7.0], [6.4, -8.9], [4.4, -9.9], [2.0, -9.2], [0.2, -8.4], [-2.0, -9.0], [-3.4, -10.6], [-5.4, -11.2], [-5.6, -12.6], [-3.6, -13.2]];
export const ROUTES = [[[-5.5, 11.2], [-5.6, 8.6], [-4.2, 7.2], [-1.6, 6.9], [-0.9, 5.6], [-3.4, 4.9], [-6.4, 4.2], [-6.6, 2.6], [-4.2, 1.9], [-1.6, 2.2], ...ROAD], [[5.6, 11.2], [6.2, 9], [5.2, 7.2], [3.2, 6.4], [3.6, 5.0], [5.6, 4.2], [6.2, 2.9], [4.4, 1.9], [2.2, 2.0], ...ROAD]];
export const SPOTS = [[-3.5, 8.9], [4.2, 8.6], [-4.6, 3.3], [7.5, 1.6], [0.6, 3.7], [-2.4, -2.6], [-5.2, -2.7], [0.9, -3.4], [3.2, -7.4], [0.9, -11.3], [-2.8, -7.4]];
export const TOWER = { x: 7.0, z: 9.6 };                                      // the lighthouse on its rock (scenery, where the flare comes from and where the keeper comes back to life)
export const spline = (pts, n = 9) => { const o = []; for (let i = 0; i < pts.length - 1; i++) { const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
  for (let k = 0; k < n; k++) { const t = k / n, t2 = t * t, t3 = t2 * t, f = j => 0.5 * (2 * p1[j] + (p2[j] - p0[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * t3); o.push([f(0), f(1)]); } } o.push(pts[pts.length - 1]); return o; };
class Lane {
  constructor(raw) { this.pts = spline(raw).map(p => ({ x: p[0], z: p[1] })); this.len = [0]; for (let i = 1; i < this.pts.length; i++) this.len.push(this.len[i - 1] + Math.hypot(this.pts[i].x - this.pts[i - 1].x, this.pts[i].z - this.pts[i - 1].z)); this.total = this.len[this.len.length - 1]; }
  at(s, out) { s = clamp(s, 0, this.total); let i = 1; const L = this.len; while (i < L.length - 1 && L[i] < s) i++; const a = this.pts[i - 1], b = this.pts[i], t = (s - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1]);
    out.x = a.x + (b.x - a.x) * t; out.z = a.z + (b.z - a.z) * t; const d = Math.hypot(b.x - a.x, b.z - a.z) || 1; out.hx = (b.x - a.x) / d; out.hz = (b.z - a.z) / d; return out; }
}
export const LANES = ROUTES.map(r => new Lane(r));
export const SLOTS = SPOTS.map(([x, z]) => ({ x, z }));
const nearestRoad = (x, z) => { let best = null, bd = 1e9; for (const L of LANES) for (const p of L.pts) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } } return { x: best.x, z: best.z, d: bd }; };
export const onLand = (x, z) => { z = clamp(z, Z0 + 8.6, Z1 - 0.5); const w = halfW(z) - 0.7; return { x: clamp(x, -w, w), z }; };   // where feet may stand: the island below the village

// ---------- towers: three levels, then one of two specialities, each with abilities bought level by level ----------
export const TOWER_ORDER = ['archer', 'barracks', 'lens', 'beacon'];
export const TOWERS = {
  archer: { name: '횃불 궁수탑', hint: '빠른 화살 · 하늘도 맞혀요', cost: [70, 110, 160, 230], kind: 'phys', air: true,
    lv: [{ range: 4.0, rate: 0.8, dmg: [4, 6] }, { range: 4.3, rate: 0.8, dmg: [7, 11] }, { range: 4.6, rate: 0.7, dmg: [11, 17] }],
    spec: { rapid: { name: '속사', desc: '두 배 빨리 쏴요', range: 4.7, rate: 0.36, dmg: [12, 18], abil: { fire: { name: '불화살', desc: '맞으면 불이 붙어요', cost: [90, 90, 90] }, twin: { name: '겹화살', desc: '가끔 한 발 더', cost: [100, 100] } } },
      long: { name: '장궁', desc: '멀리, 아주 세게', range: 6.1, rate: 1.3, dmg: [50, 70], abil: { pierce: { name: '꿰뚫기', desc: '껍데기를 조금 뚫어요', cost: [100, 100, 100] }, snipe: { name: '급소', desc: '가장 큰 놈에게 한 방', cost: [130, 110, 110] } } } } },
  barracks: { name: '등잔병 초소', hint: '등잔병 셋이 길을 막아요', cost: [70, 110, 160, 230], range: 3.0,
    lv: [{ hp: 50, dmg: [1, 3], armor: 0 }, { hp: 95, dmg: [3, 5], armor: 0.15 }, { hp: 150, dmg: [6, 10], armor: 0.3 }],
    spec: { guard: { name: '방패지기', desc: '아주 단단해요', hp: 340, dmg: [9, 14], armor: 0.55, abil: { mend: { name: '따뜻한 죽', desc: '싸우면서도 회복해요', cost: [80, 80, 80] }, thorn: { name: '가시 방패', desc: '때린 놈이 다쳐요', cost: [90, 90] } } },
      lancer: { name: '창잡이', desc: '세게 찔러요', hp: 210, dmg: [21, 31], armor: 0.3, rate: 0.8, abil: { throw: { name: '창 던지기', desc: '하늘의 그림자도 맞혀요', cost: [110, 90, 90] }, crit: { name: '급소 찌르기', desc: '가끔 세 배', cost: [90, 90] } } } } },
  lens: { name: '렌즈탑', hint: '껍데기를 뚫는 빛(마법)', cost: [85, 150, 240, 310], kind: 'magic', air: false,
    lv: [{ range: 3.7, rate: 2.2, dmg: [13, 22] }, { range: 3.9, rate: 2.2, dmg: [28, 52] }, { range: 4.1, rate: 2.2, dmg: [48, 88] }],
    spec: { burn: { name: '태움빛', desc: '큰 피해, 느려짐', range: 4.4, rate: 2.2, dmg: [84, 140], slow: 0.5, abil: { melt: { name: '껍데기 녹이기', desc: '맞을수록 물러져요', cost: [100, 100, 100] }, glare: { name: '눈부심', desc: '가끔 멈칫해요', cost: [100, 100] } } },
      split: { name: '갈래빛', desc: '셋을 한꺼번에', range: 4.4, rate: 2.2, dmg: [54, 94], multi: 3, abil: { more: { name: '갈래 더', desc: '한 줄기씩 늘어요', cost: [120, 120] }, weak: { name: '힘 빼기', desc: '맞은 놈이 약하게 때려요', cost: [80, 80] } } } } },
  beacon: { name: '봉화대', hint: '터지는 불덩이 · 여럿을 한번에', cost: [95, 180, 280, 360], kind: 'phys', air: false,
    lv: [{ range: 4.2, rate: 2.6, dmg: [14, 21], r: 1.4 }, { range: 4.4, rate: 2.6, dmg: [26, 44], r: 1.5 }, { range: 4.6, rate: 2.6, dmg: [37, 64], r: 1.65 }],
    spec: { big: { name: '큰불', desc: '넓게 크게 터져요', range: 4.9, rate: 3, dmg: [66, 112], r: 2.35, abil: { quake: { name: '땅울림', desc: '터지면 멈칫해요', cost: [110, 110, 110] }, wide: { name: '더 넓게', desc: '불길이 넓어져요', cost: [100, 100] } } },
      ember: { name: '잔불', desc: '바닥에 불이 남아요', range: 4.9, rate: 3, dmg: [40, 70], r: 1.75, burn: { dps: 14, t: 3.5 }, abil: { hot: { name: '뜨거운 잔불', desc: '잔불이 더 아파요', cost: [100, 100, 100] }, long: { name: '오래 타기', desc: '잔불이 오래 남아요', cost: [80, 80] } } } } },
};
export const towerStat = t => t.lvl < 4 ? TOWERS[t.type].lv[t.lvl - 1] : TOWERS[t.type].spec[t.spec];
export const sellValue = t => Math.round(t.spent * 0.6);
const ab = (t, id) => (t.ab && t.ab[id]) || 0;
const SOLDIER = { rate: 1.0, spd: 3.2, respawn: 10, reach: 1.7 };

// ---------- the shadows from the sea ----------
// hp, speed (units/s), armor (share of physical damage ignored), mres (share of magic damage ignored), gold, damage per hit, lives = windows put out
export const ENEMIES = {
  fry: { name: '잔챙이', line: '혼자선 아무것도 못 해요. 그래서 스무 마리씩 와요.', hp: 18, spd: 1.25, armor: 0, mres: 0, gold: 5, dmg: [1, 3] },
  fish: { name: '날치', line: '급한 일은 없어요. 그냥 뛰는 게 좋대요.', hp: 16, spd: 2.5, armor: 0, mres: 0, gold: 5, dmg: [1, 2] },
  crab: { name: '방패게', line: '화살은 간지럽대요. 빛은 좀 싫어해요.', hp: 44, spd: 0.95, armor: 0.95, mres: 0, gold: 12, dmg: [3, 6] },
  gull: { name: '갈매기 그림자', line: '길이 뭔지 몰라요. 그래서 막을 수가 없어요.', hp: 28, spd: 1.8, armor: 0, mres: 0, gold: 8, dmg: [0, 0], fly: true },
  turtle: { name: '거북', line: '느려요. 하지만 한 번도 멈춘 적이 없어요.', hp: 300, spd: 0.64, armor: 0.62, mres: 0, gold: 32, dmg: [8, 14] },
  octo: { name: '문어', line: '쓰러뜨리면 셋이 돼요. 계산이 안 맞죠.', hp: 110, spd: 1.0, armor: 0, mres: 0.5, gold: 12, dmg: [3, 6], split: 3 },
  baby: { name: '새끼 문어', line: '엄마가 어디 갔는지 아직 몰라요.', hp: 22, spd: 1.6, armor: 0, mres: 0.3, gold: 3, dmg: [1, 2] },
  boss: { name: '큰 고래 그림자', line: '마을 불빛이 궁금했을 뿐인데, 너무 커요.', hp: 1350, spd: 0.42, armor: 0.5, mres: 0, gold: 0, dmg: [30, 50], lives: 10 },
};
export const armorWord = v => v >= 0.7 ? '높음' : v >= 0.45 ? '중간' : v > 0 ? '낮음' : '없음';
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
export const BREAK = 20, START_GOLD = 250, WINDOWS = 20;
export const starsFor = windows => windows >= 18 ? 3 : windows >= 6 ? 2 : windows > 0 ? 1 : 0;
// three ways to play the same night. Veteran is built to need specialities, Storm to need the keeper and the spells as well.
export const MODE_ORDER = ['normal', 'veteran', 'storm'];
export const MODES = { normal: { name: '보통', desc: '처음 지키는 밤', hp: 0.86, spd: 1, gold: 1 }, veteran: { name: '숙련', desc: '특화 없이는 버티기 어려워요', hp: 1.76, spd: 1.04, gold: 1 }, storm: { name: '폭풍', desc: '등대지기와 주문까지 다 써야 해요', hp: 1.64, spd: 1.1, gold: 1 } };
// permanent upgrades bought with stars: one line per tower and per spell, three steps each (1, 1 and 2 stars)
export const PERKS = {
  archer: { name: '횃불 궁수탑', desc: '화살 피해 +6%', max: 3 }, barracks: { name: '등잔병 초소', desc: '등잔병 체력 +10%', max: 3 }, lens: { name: '렌즈탑', desc: '빛 피해 +6%', max: 3 }, beacon: { name: '봉화대', desc: '불덩이 피해 +6%', max: 3 },
  flash: { name: '섬광', desc: '피해 +12% · 대기 -6%', max: 3 }, rein: { name: '마을 지원군', desc: '체력 +15% · 대기 -6%', max: 3 },
};
export const perkCost = lvl => (lvl >= 2 ? 2 : 1);
export const SKILLS = { flash: { cd: 45, r: 2.6, dmg: 80, stun: 0.8 }, rein: { cd: 16, n: 2, hp: 55, dmg: [2, 4], life: 20 }, hero: { cd: 24, r: 2.3, dmg: 50, stun: 1.5 } };
export const HERO = { hp: 260, dmg: [11, 17], armor: 0.2, rate: 0.8, spd: 3.8, respawn: 14, reach: 2.2, xp: [0, 50, 120, 210, 330, 480], grow: 1.13, home: { x: -0.4, z: 0.7 } };

export class Game {
  // cfg: { seed, mode: 'normal' | 'veteran' | 'storm', perks: { archer, barracks, lens, beacon, flash, rein } }
  constructor(cfg = {}) {
    const p = cfg.perks || {}; this.rnd = rng(cfg.seed ?? 1); this.events = []; this.mode = Object.hasOwn(MODES, cfg.mode ?? '') ? cfg.mode : 'normal'; this.M = MODES[this.mode];
    this.m = { archer: 1 + 0.06 * (p.archer || 0), lens: 1 + 0.06 * (p.lens || 0), beacon: 1 + 0.06 * (p.beacon || 0), troop: 1 + 0.1 * (p.barracks || 0), flash: 1 + 0.12 * (p.flash || 0), flashCd: 1 - 0.06 * (p.flash || 0), rein: 1 + 0.15 * (p.rein || 0), reinCd: 1 - 0.06 * (p.rein || 0) };
    this.shards = START_GOLD; this.windowsMax = WINDOWS; this.windows = WINDOWS;
    this.wave = 0; this.phase = 'break'; this.breakT = Infinity; this.queue = []; this.time = 0; this.done = false; this.kills = 0; this.earned = 0; this.leaks = 0; this.nextId = 1; this.met = {};
    this.enemies = []; this.units = []; this.bombs = []; this.fires = []; this.tools = SLOTS.map(() => null); this.cd = { flash: 0, rein: 0, hero: 0 };
    const h = HERO; this.hero = this.unit('hero', h.home.x, h.home.z, { hp: h.hp, dmg: h.dmg.slice(), armor: h.armor, rate: h.rate, spd: h.spd, reach: h.reach }); this.hero.lvl = 1; this.hero.xp = 0;
  }
  ev(type, o) { this.events.push(Object.assign({ type }, o)); }
  roll(d) { return d[0] + (d[1] - d[0]) * this.rnd(); }
  unit(kind, x, z, s) { const u = { id: this.nextId++, kind, x, z, hp: s.hp, max: s.hp, dmg: s.dmg, armor: s.armor || 0, rate: s.rate || 1, spd: s.spd || SOLDIER.spd, reach: s.reach || SOLDIER.reach, cd: 0, home: { x, z }, tgt: null, dead: false, walking: false, idle: 0, hx: 1, ph: this.rnd() * 6.28, life: s.life ?? Infinity, hitT: 0 }; this.units.push(u); return u; }
  cdMax(k) { return k === 'flash' ? SKILLS.flash.cd * this.m.flashCd : k === 'rein' ? SKILLS.rein.cd * this.m.reinCd : SKILLS.hero.cd; }

  // ----- building
  cost(slot, type) { const t = this.tools[slot]; return t ? (t.lvl >= 4 ? Infinity : TOWERS[t.type].cost[t.lvl]) : TOWERS[type].cost[0]; }
  build(slot, type) { if (this.done || !SLOTS[slot] || this.tools[slot] || !Object.hasOwn(TOWERS, type)) return false; const c = this.cost(slot, type); if (this.shards < c) return false; this.shards -= c;
    const t = this.tools[slot] = { type, lvl: 1, spec: null, ab: {}, abT: 0, cd: 0.3, spent: c, slot, x: SLOTS[slot].x, z: SLOTS[slot].z };
    if (type === 'barracks') { const r = nearestRoad(t.x, t.z); t.rally = { x: r.x, z: r.z }; t.men = []; t.wait = [0, 0, 0]; for (let i = 0; i < 3; i++) this.muster(t, i); }
    this.ev('build', { slot, tool: type }); return true; }
  upgrade(slot, spec) { const t = this.tools[slot]; if (!t || this.done || t.lvl >= 4) return false; const T = TOWERS[t.type]; if (t.lvl === 3 && !Object.hasOwn(T.spec, spec ?? '')) return false; const c = this.cost(slot); if (this.shards < c) return false;
    this.shards -= c; t.spent += c; t.lvl++; if (t.lvl === 4) t.spec = spec;
    if (t.type === 'barracks') { const s = towerStat(t); for (const u of t.men) if (u && !u.dead) { const k = u.hp / u.max; u.max = s.hp * this.m.troop; u.hp = Math.max(u.hp, u.max * Math.max(k, 0.5)); u.dmg = s.dmg; u.armor = s.armor; u.rate = s.rate || SOLDIER.rate; } }
    this.ev('upgrade', { slot, lvl: t.lvl }); return true; }
  // abilities of a specialised tower: each is bought one level at a time
  abilCost(slot, id) { const t = this.tools[slot]; if (!t || t.lvl < 4) return Infinity; const A = TOWERS[t.type].spec[t.spec].abil; if (!Object.hasOwn(A, id ?? '')) return Infinity; const l = ab(t, id); return l >= A[id].cost.length ? Infinity : A[id].cost[l]; }
  ability(slot, id) { const t = this.tools[slot], c = this.abilCost(slot, id); if (this.done || !t || c === Infinity || this.shards < c) return false; this.shards -= c; t.spent += c; t.ab[id] = ab(t, id) + 1; this.ev('upgrade', { slot, lvl: 4, abil: id }); return true; }
  sell(slot) { const t = this.tools[slot]; if (!t || this.done) return false; this.shards += sellValue(t); if (t.men) for (const u of t.men) if (u) this.dismiss(u); this.tools[slot] = null; this.ev('sell', { slot }); return true; }
  spot(t, i) { const a = i * 2.094 + 0.5; return { x: t.rally.x + Math.cos(a) * 0.5, z: t.rally.z + Math.sin(a) * 0.4 }; }
  muster(t, i) { const s = towerStat(t), u = this.unit('soldier', t.x, t.z + 0.3, { hp: s.hp * this.m.troop, dmg: s.dmg, armor: s.armor, rate: s.rate || SOLDIER.rate, spd: SOLDIER.spd, reach: SOLDIER.reach }); u.home = this.spot(t, i); u.walking = true; u.post = t; t.men[i] = u; return u; }
  setRally(slot, x, z) { const t = this.tools[slot]; if (this.done || !t || !t.men || !Number.isFinite(x) || !Number.isFinite(z)) return false; const d = Math.hypot(x - t.x, z - t.z), R = TOWERS.barracks.range; if (d > R) { x = t.x + (x - t.x) / d * R; z = t.z + (z - t.z) / d * R; }
    const p = onLand(x, z); t.rally = p; t.men.forEach((u, i) => { if (u && !u.dead) { u.home = this.spot(t, i); this.release(u); u.walking = true; } }); this.ev('rally', { slot, x: p.x, z: p.z }); return true; }
  release(u) { if (u.tgt && u.tgt.blocker === u) u.tgt.blocker = null; u.tgt = null; }
  dismiss(u) { this.release(u); u.dead = true; u.gone = true; }

  // ----- the keeper and the two spells
  moveHero(x, z) { const h = this.hero; if (this.done) return false; h.home = onLand(x, z); if (!h.dead) { this.release(h); h.walking = true; } return true; }
  heroSkill() { const h = this.hero, S = SKILLS.hero; if (this.done || h.dead || this.cd.hero > 0) return false; this.cd.hero = S.cd; const k = 1 + 0.18 * (h.lvl - 1);
    for (const e of this.enemies.slice()) if (!e.fly && Math.hypot(e.x - h.x, e.z - h.z) < S.r) { e.stun = Math.max(e.stun, S.stun); this.hurt(e, S.dmg * k, 'phys', h, 0.3); } this.ev('hskill', { x: h.x, z: h.z, r: S.r }); return true; }
  heroXp(n) { const h = this.hero; if (h.lvl >= HERO.xp.length) return; h.xp += n; while (h.lvl < HERO.xp.length && h.xp >= HERO.xp[h.lvl]) { h.lvl++; h.max *= HERO.grow; h.dmg = [h.dmg[0] * HERO.grow, h.dmg[1] * HERO.grow]; if (!h.dead) h.hp = h.max; this.ev('heroLvl', { lvl: h.lvl, x: h.x, z: h.z }); } }
  canFlash() { return !this.done && this.cd.flash <= 0; }
  flash(x, z) { const S = SKILLS.flash; if (!this.canFlash()) return false; this.cd.flash = this.cdMax('flash'); for (const e of this.enemies.slice()) if (Math.hypot(e.x - x, e.z - z) < S.r) { e.stun = Math.max(e.stun, S.stun); this.hurt(e, S.dmg * this.m.flash, 'phys'); } this.ev('flash', { x, z, r: S.r }); return true; }
  reinforce(x, z) { const S = SKILLS.rein; if (this.done || this.cd.rein > 0) return false; this.cd.rein = this.cdMax('rein'); const p = onLand(x, z);
    for (let i = 0; i < S.n; i++) this.unit('villager', p.x + (i - 0.5) * 0.9, p.z, { hp: S.hp * this.m.rein, dmg: S.dmg, life: S.life }); this.ev('reinforce', { x: p.x, z: p.z }); return true; }

  // ----- waves
  // what the next wave brings up each of the two sea roads (for the flags at the entries)
  preview() { if (this.wave >= LAST_WAVE) return [[], []]; const out = [new Map(), new Map()]; for (const [kind, n, , , lane] of WAVES[this.wave]) for (const l of lane === 2 ? [0, 1] : [lane]) out[l].set(kind, (out[l].get(kind) || 0) + (lane === 2 ? Math.ceil(n / 2) : n)); return out.map(m => [...m.entries()]); }
  bonus() { return this.wave > 0 && this.breakT < Infinity ? Math.round(Math.max(0, this.breakT) * 1.5) : 0; }   // calling the wave early pays for every second still on the clock
  callWave() { if (this.done || this.phase !== 'break' || this.wave >= LAST_WAVE) return false; const n = this.bonus(); if (n) { this.shards += n; this.ev('bonus', { n }); } this.startWave(); return true; }
  startWave() { this.wave++; this.phase = 'wave'; let alt = 0; this.queue = [];
    for (const [kind, n, gap, t0, lane] of WAVES[this.wave - 1]) for (let i = 0; i < n; i++) this.queue.push({ t: this.time + 0.8 + t0 + i * gap, kind, lane: lane === 2 ? (alt++ & 1) : lane });
    this.queue.sort((a, b) => a.t - b.t); this.ev('wave', { n: this.wave }); }
  spawn(kind, lane, s = 0, off) { const E = ENEMIES[kind], hp = E.hp * waveHp(this.wave) * this.M.hp, e = { id: this.nextId++, type: kind, lane, s, x: 0, z: 0, hx: 0, hz: -1, hp, max: hp, spd: E.spd * this.M.spd * (0.94 + this.rnd() * 0.12), armor: E.armor, mres: E.mres, fly: !!E.fly, off: off ?? (this.rnd() - 0.5) * (E.fly ? 1.6 : 0.7), cd: 0.5, stun: 0, slowT: 0, slowK: 1, weakT: 0, weakK: 1, blocker: null, ph: this.rnd() * 6.28, born: this.time, hitT: 0, burnT: 0, burnD: 0 };
    this.place(e); this.enemies.push(e); if (!this.met[kind]) { this.met[kind] = true; this.ev('meet', { enemy: kind }); } return e; }
  place(e) { const L = LANES[e.lane]; L.at(e.s, e); e.x += -e.hz * e.off; e.z += e.hx * e.off; }
  // kind: 'phys' is cut by armor, 'magic' by magic resistance, 'true' by nothing. src: the keeper, when the blow is his
  hurt(e, dmg, kind, src, pierce = 0) { if (e.dead) return; e.hp -= kind === 'magic' ? dmg * (1 - e.mres) : kind === 'phys' ? dmg * (1 - e.armor * (1 - pierce)) : dmg; e.hitT = 0.12; if (e.hp <= 0) this.kill(e, src); }
  kill(e, src) { e.dead = true; this.kills++; const g = Math.round(ENEMIES[e.type].gold * this.M.gold); this.shards += g; this.earned += g; if (e.blocker) e.blocker.tgt = null;
    const h = this.hero; if (src === h) this.heroXp(ENEMIES[e.type].gold); else if (!h.dead && Math.hypot(e.x - h.x, e.z - h.z) < 3.2) this.heroXp(ENEMIES[e.type].gold * 0.5);
    this.ev('kill', { enemy: e.type, x: e.x, z: e.z, shard: g, fly: e.fly });
    if (ENEMIES[e.type].split) for (let i = 0; i < ENEMIES[e.type].split; i++) { const b = this.spawn('baby', e.lane, Math.max(0, e.s - i * 0.5), (i - 1) * 0.3); b.born = -9; } }

  step(dt) {
    if (this.done) return; this.time += dt; const T = this.time;
    for (const k in this.cd) if (this.cd[k] > 0) this.cd[k] = Math.max(0, this.cd[k] - dt);
    // spawning, and the pause before the next wave (it comes by itself; calling it early pays a bonus)
    if (this.phase === 'wave') { while (this.queue.length && this.queue[0].t <= T) { const q = this.queue.shift(); this.spawn(q.kind, q.lane); }
      if (!this.queue.length) { if (this.wave < LAST_WAVE) { this.phase = 'break'; this.breakT = BREAK; } else if (!this.enemies.length) { this.done = true; this.phase = 'won'; this.ev('won', { stars: starsFor(this.windows) }); return; } } }
    else if (this.phase === 'break' && this.wave > 0) { this.breakT -= dt; if (this.breakT <= 0) this.startWave(); }
    // enemies walk, or fight whoever stands in their way
    for (const e of this.enemies) { if (e.dead) continue; if (e.hitT > 0) e.hitT -= dt; if (e.burnT > 0) { e.burnT -= dt; this.hurt(e, e.burnD * dt, 'phys'); if (e.dead) continue; e.hitT = 0; } if (e.weakT > 0) e.weakT -= dt;
      if (e.stun > 0) { e.stun -= dt; continue; } if (e.slowT > 0) e.slowT -= dt;
      const b = e.blocker; if (b && (b.dead || b.tgt !== e)) e.blocker = null;
      if (e.blocker) { if (Math.hypot(b.x - e.x, b.z - e.z) < 1.1) { e.cd -= dt; if (e.cd <= 0) { e.cd = 1.0; this.wound(b, this.roll(ENEMIES[e.type].dmg) * (e.weakT > 0 ? e.weakK : 1), e); } } continue; }
      e.s += e.spd * (e.slowT > 0 ? e.slowK : 1) * dt; this.place(e);
      if (e.s >= LANES[e.lane].total) { e.dead = true; e.leaked = true; const n = ENEMIES[e.type].lives || 1; this.windows = Math.max(0, this.windows - n); this.leaks++; this.ev('leak', { enemy: e.type, n });
        if (this.windows <= 0) { this.done = true; this.phase = 'lost'; this.ev('lost', {}); return; } } }
    // fire left on the ground
    for (const f of this.fires) { f.t -= dt; for (const e of this.enemies.slice()) if (!e.dead && !e.fly && Math.hypot(e.x - f.x, e.z - f.z) < f.r) { this.hurt(e, f.dps * dt, 'magic'); e.hitT = 0; } }
    this.fires = this.fires.filter(f => f.t > 0);
    // fireballs in the air
    for (const b of this.bombs) { b.t -= dt; if (b.t <= 0) { for (const e of this.enemies.slice()) if (!e.dead && !e.fly && Math.hypot(e.x - b.x, e.z - b.z) < b.r) { if (b.stun) e.stun = Math.max(e.stun, b.stun); this.hurt(e, b.dmg, 'phys'); } if (b.burn) this.fires.push({ x: b.x, z: b.z, r: b.r, t: b.burn.t, dps: b.burn.dps }); this.ev('boom', { x: b.x, z: b.z, r: b.r, fire: b.burn ? b.burn.t : 0 }); } }
    this.bombs = this.bombs.filter(b => b.t > 0);
    // towers
    for (const t of this.tools) { if (!t) continue; const S = towerStat(t), D = TOWERS[t.type];
      if (t.type === 'barracks') { for (let i = 0; i < 3; i++) { const u = t.men[i]; if (u && u.dead) { t.men[i] = null; t.wait[i] = SOLDIER.respawn; } else if (!u) { t.wait[i] -= dt; if (t.wait[i] <= 0) this.muster(t, i); } else if (ab(t, 'mend') && u.hp < u.max) u.hp = Math.min(u.max, u.hp + u.max * 0.02 * ab(t, 'mend') * dt); }
        if (ab(t, 'throw')) { t.abT -= dt; if (t.abT <= 0) { let best = null, br = 1e9; for (const e of this.enemies) { if (e.dead || Math.hypot(e.x - t.rally.x, e.z - t.rally.z) > 3.4) continue; const rest = LANES[e.lane].total - e.s - (e.fly ? 1000 : 0); if (rest < br) { br = rest; best = e; } }   // spears go for what flies first
            if (best) { t.abT = 2.4; this.ev('shot', { kind: 'arrow', slot: t.slot, x: best.x, z: best.z, fly: best.fly, from: t.rally }); this.hurt(best, 16 * ab(t, 'throw') * this.m.troop, 'phys'); } else t.abT = 0.2; } }
        continue; }
      const mt = this.m[t.type];
      if (ab(t, 'snipe')) { t.abT -= dt; if (t.abT <= 0) { let big = null; for (const e of this.enemies) if (!e.dead && Math.hypot(e.x - t.x, e.z - t.z) < S.range && (!big || e.hp > big.hp)) big = e; if (big) { t.abT = 15 - 2 * ab(t, 'snipe'); this.ev('shot', { kind: 'arrow', slot: t.slot, x: big.x, z: big.z, fly: big.fly, big: true }); this.hurt(big, 140 * ab(t, 'snipe') * mt, 'phys'); } else t.abT = 0.3; } }
      t.cd -= dt; if (t.cd > 0) continue; const R2 = S.range * S.range, multi = S.multi ? S.multi + ab(t, 'more') : 0; let list = null, best = null, br = 1e9;
      for (const e of this.enemies) { if (e.dead || (e.fly && !D.air) || T - e.born < 0.6) continue; const dx = e.x - t.x, dz = e.z - t.z; if (dx * dx + dz * dz > R2) continue; const rest = LANES[e.lane].total - e.s; if (multi) (list ||= []).push([rest, e]); if (rest < br) { br = rest; best = e; } }
      if (!best) { t.cd = 0.1; continue; } t.cd = Math.max(t.cd, -dt) + S.rate;   // keep the overshoot, so the rate holds at any frame length
      if (t.type === 'beacon') { const fl = 0.8, k = best.blocker || best.stun > 0 ? 0 : best.spd * fl, burn = S.burn ? { dps: S.burn.dps * mt * (1 + 0.5 * ab(t, 'hot')), t: S.burn.t + 1.5 * ab(t, 'long') } : null;
        this.bombs.push({ t: fl, x: best.x + best.hx * k, z: best.z + best.hz * k, r: S.r * (1 + 0.12 * ab(t, 'wide')), dmg: this.roll(S.dmg) * mt, burn, stun: 0.3 * ab(t, 'quake') }); this.ev('shot', { kind: 'bomb', slot: t.slot, x: best.x + best.hx * k, z: best.z + best.hz * k, t: fl }); continue; }
      const hit = multi ? list.sort((a, b) => a[0] - b[0]).slice(0, multi).map(a => a[1]) : [best];
      for (const e of hit) { const n = ab(t, 'twin') && this.rnd() < 0.22 * ab(t, 'twin') ? 2 : 1;
        for (let i = 0; i < n && !e.dead; i++) { this.ev('shot', { kind: t.type === 'lens' ? 'ray' : 'arrow', slot: t.slot, x: e.x, z: e.z, fly: e.fly }); if (S.slow) { e.slowT = 1.5; e.slowK = S.slow; }
          if (ab(t, 'melt')) e.armor = Math.max(0, e.armor - 0.1 * ab(t, 'melt')); if (ab(t, 'glare') && this.rnd() < 0.15 * ab(t, 'glare')) e.stun = Math.max(e.stun, 0.8); if (ab(t, 'weak')) { e.weakT = 4; e.weakK = 1 - 0.25 * ab(t, 'weak'); }
          if (ab(t, 'fire')) { e.burnT = 3; e.burnD = Math.max(e.burnD, 4 * ab(t, 'fire') * mt); }
          this.hurt(e, this.roll(S.dmg) * mt, D.kind, null, 0.06 * ab(t, 'pierce')); } } }
    // soldiers, villagers and the keeper: stand at their post, stop and fight what comes near
    for (const u of this.units) { if (u.hitT > 0) u.hitT -= dt;
      if (u.dead) { if (u.kind === 'hero' && !u.gone) { u.wait -= dt; if (u.wait <= 0) { u.dead = false; u.hp = u.max; u.x = TOWER.x - 1.6; u.z = TOWER.z - 1.2; u.walking = true; this.ev('heroUp', {}); } } continue; }
      if (u.life < Infinity) { u.life -= dt; if (u.life <= 0) { this.dismiss(u); continue; } }
      if (u.tgt && u.tgt.dead) u.tgt = null;
      if (u.tgt) { const q = u.tgt; if (!q.blocker) q.blocker = u; else if (q.blocker !== u && Math.hypot(q.x - u.home.x, q.z - u.home.z) > u.reach + 1.0) u.tgt = null; }   // a helper takes over the block, and never chases beyond its post
      if (u.walking) { if (this.walk(u, u.home.x, u.home.z, dt)) u.walking = false; else continue; }
      if (!u.tgt) { let best = null, bd = 1e9; for (const e of this.enemies) { if (e.dead || e.fly || T - e.born < 0.6) continue; const d = Math.hypot(e.x - u.home.x, e.z - u.home.z); if (d > u.reach) continue; const sc = d + (e.blocker ? 8 : 0); if (sc < bd) { bd = sc; best = e; } }
        if (best) { u.tgt = best; if (!best.blocker) best.blocker = u; } }
      const e = u.tgt;
      if (e) { u.idle = 0; const side = u.x <= e.x ? -1 : 1; if (this.walk(u, e.x + side * 0.62, e.z + 0.04, dt, 0.2)) { u.hx = -side; u.cd -= dt; if (u.cd <= 0) { u.cd = Math.max(u.cd, -dt) + u.rate; const crit = u.post && ab(u.post, 'crit') && this.rnd() < 0.12 * ab(u.post, 'crit') ? 3 : 1; this.hurt(e, this.roll(u.dmg) * crit, 'phys', u); this.ev('hit', { x: e.x, z: e.z, crit: crit > 1 }); } } }
      else { this.walk(u, u.home.x, u.home.z, dt); u.idle += dt; if (u.idle > 3 && u.hp < u.max) u.hp = Math.min(u.max, u.hp + u.max * 0.12 * dt); } }
    this.enemies = this.enemies.filter(e => !e.dead); this.units = this.units.filter(u => !u.gone);
    if (this.phase === 'wave' && !this.queue.length && this.wave >= LAST_WAVE && !this.enemies.length) { this.done = true; this.phase = 'won'; this.ev('won', { stars: starsFor(this.windows) }); }
  }
  walk(u, x, z, dt, near = 0.08) { const dx = x - u.x, dz = z - u.z, d = Math.hypot(dx, dz); if (d <= near) return true; const st = Math.min(d, u.spd * dt); u.x += dx / d * st; u.z += dz / d * st; if (Math.abs(dx) > 0.05) u.hx = Math.sign(dx); u.moving = true; return d - st <= near; }
  wound(u, dmg, by) { if (u.dead) return; u.hp -= dmg * (1 - u.armor); u.hitT = 0.12; if (by && u.post && ab(u.post, 'thorn')) this.hurt(by, 5 * ab(u.post, 'thorn'), 'true'); if (u.hp > 0) return; this.release(u); u.dead = true;
    if (u.kind === 'hero') { u.wait = HERO.respawn; this.ev('heroDown', { x: u.x, z: u.z }); } else { u.gone = true; this.ev('fall', { x: u.x, z: u.z, kind: u.kind }); } }
}

// ---------- scripted players for the difficulty checks (and the ?auto demo) ----------
// 'random': random towers on random spots, random upgrades, keeper never moved, spells thrown at the leader.
// 'smart': a mixed build with upgrades, specialities and abilities, keeper sent to the front, spells where they hurt most.
// 'nospec': the smart build that never specialises.   'idle': the smart build, but the keeper stays home and no spell is cast.
// 'mono:<tower>': only that tower everywhere, played as well as the smart one otherwise.
export const SMART_PLAN = [['b', 4, 'archer'], ['b', 2, 'barracks'], ['b', 5, 'archer'], ['b', 7, 'lens'], ['u', 4], ['b', 6, 'beacon'], ['u', 2], ['u', 5], ['b', 10, 'archer'], ['b', 8, 'lens'], ['u', 7], ['u', 4], ['u', 6], ['b', 9, 'barracks'], ['u', 7],
  ['u', 4, 'rapid'], ['u', 8], ['u', 2], ['u', 7, 'split'], ['u', 5], ['u', 6], ['u', 8], ['u', 10], ['u', 2, 'guard'], ['u', 5, 'long'], ['u', 6, 'big'], ['b', 0, 'archer'], ['b', 3, 'beacon'], ['u', 8, 'burn'], ['u', 10], ['u', 9], ['u', 10, 'rapid'], ['u', 9],
  ['a', 4, 'fire'], ['a', 7, 'more'], ['a', 5, 'snipe'], ['a', 8, 'melt'], ['u', 0], ['u', 3], ['a', 6, 'quake'], ['a', 4, 'fire'], ['a', 2, 'mend'], ['u', 0], ['u', 3], ['a', 7, 'more'], ['a', 5, 'pierce'], ['a', 10, 'fire'], ['u', 9, 'lancer'], ['a', 9, 'throw'], ['b', 1, 'archer'], ['u', 1], ['u', 1]];
const MONO_ORDER = [4, 5, 7, 2, 6, 8, 10, 9, 0, 3, 1];
export class Bot {
  constructor(game, kind = 'smart', seed = 7) { this.g = game; this.kind = kind; this.rnd = rng(seed * 7919 + 13); this.i = 0; this.t = 0; this.want = null; this.mono = kind.startsWith('mono:') ? kind.slice(5) : null; this.plan = kind === 'smart' || kind === 'nospec' || kind === 'idle'; }
  lead(ground) { let best = null, br = 1e9; for (const e of this.g.enemies) { if (ground && e.fly) continue; const r = LANES[e.lane].total - e.s; if (r < br) { br = r; best = e; } } return best; }
  crowd(r) { let best = null, bn = 0; for (const a of this.g.enemies) { let n = 0; for (const b of this.g.enemies) if (Math.hypot(a.x - b.x, a.z - b.z) < r) n += b.type === 'boss' ? 6 : b.type === 'turtle' ? 3 : 1; if (n > bn) { bn = n; best = a; } } return bn >= 4 ? best : null; }
  act(a) { const g = this.g; if (a[0] === 'b') return g.tools[a[1]] ? true : g.build(a[1], a[2]); const t = g.tools[a[1]]; if (!t) return true;
    if (a[0] === 'a') return this.kind === 'nospec' || t.lvl < 4 || g.abilCost(a[1], a[2]) === Infinity ? true : g.ability(a[1], a[2]);
    if (t.lvl >= 4 || (t.lvl === 3 && this.kind === 'nospec')) return true; return g.upgrade(a[1], a[2] || Object.keys(TOWERS[t.type].spec)[this.rnd() < 0.5 ? 0 : 1]); }
  step(dt = 1 / 30) { const g = this.g; if (g.done) return; this.t += dt;
    if (g.phase === 'break' && (g.wave === 0 ? this.t > 2 : this.kind !== 'random' && g.breakT < BREAK - 6 && g.enemies.length < 6)) g.callWave();
    // building
    if (this.plan) { while (this.i < SMART_PLAN.length && this.act(SMART_PLAN[this.i])) this.i++; }
    else if (this.mono) { const empty = g.tools.findIndex(t => !t), low = g.tools.filter(Boolean).sort((a, b) => a.lvl - b.lvl)[0];
      if (empty >= 0 && (!low || low.lvl >= 2 || g.tools.filter(Boolean).length < 4)) { const s = MONO_ORDER.find(i => !g.tools[i]); g.build(s, this.mono); } else if (low && low.lvl < 4) this.act(['u', low.slot]);
      else { const t = g.tools.find(t => t && Object.keys(TOWERS[t.type].spec[t.spec].abil).some(id => g.abilCost(t.slot, id) <= g.shards)); if (t) for (const id of Object.keys(TOWERS[t.type].spec[t.spec].abil)) if (g.ability(t.slot, id)) break; } }
    else { if (!this.want) { const empty = SLOTS.map((_, i) => i).filter(i => !g.tools[i]), built = g.tools.filter(t => t && t.lvl < 4); const doBuild = empty.length && (this.rnd() < 0.6 || !built.length);
        this.want = doBuild ? ['b', empty[Math.floor(this.rnd() * empty.length)], TOWER_ORDER[Math.floor(this.rnd() * 4)]] : built.length ? ['u', built[Math.floor(this.rnd() * built.length)].slot] : null; }
      if (this.want && this.act(this.want)) this.want = null; else if (this.want && (this.wantT = (this.wantT || 0) + dt) > 4) { this.want = null; this.wantT = 0; } }   // cannot pay for it yet: think of something else
    if (this.kind === 'idle') return;
    // spells and the keeper
    const c = this.crowd(SKILLS.flash.r); if (c && g.canFlash()) g.flash(c.x, c.z);
    const l = this.lead(true); if (l && g.cd.rein <= 0 && LANES[l.lane].total - l.s < LANES[l.lane].total * 0.75) { const p = LANES[l.lane].at(l.s + 1.2, {}); g.reinforce(p.x, p.z); }
    if (this.kind !== 'random') { const h = g.hero; if (!h.dead) { if (l && Math.floor(this.t * 2) !== Math.floor((this.t - dt) * 2) && !h.tgt) { const p = LANES[l.lane].at(l.s + 1.0, {}); if (Math.hypot(p.x - h.home.x, p.z - h.home.z) > 1.8) g.moveHero(p.x, p.z); }
        if (g.cd.hero <= 0 && g.enemies.filter(e => !e.fly && Math.hypot(e.x - h.x, e.z - h.z) < SKILLS.hero.r).length >= 3) g.heroSkill(); } }
  }
}
