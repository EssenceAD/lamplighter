// 등불지기 2.0 — the rules of one night at the harbour. Pure logic (no DOM, no three.js), so the
// same code runs in the browser and headless in node (tools/builds.mjs) for the build checks.
// Nothing here is auto-calibrated: every number below was set by hand.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export function rng(seed) { let s = seed >>> 0; return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- the map: sea at the bottom of the screen (z = +5), village and lighthouse at the top ----------
export const TOWER = { x: 0, z: -7.4 };                       // the lighthouse on its cliff
const smooth = pts => { const o = []; for (let i = 0; i < pts.length - 1; i++) { const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
  for (let k = 0; k < 6; k++) { const t = k / 6, t2 = t * t, t3 = t2 * t; o.push({ x: 0.5 * (2 * p1[0] + (p2[0] - p0[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (3 * p1[0] - p0[0] - 3 * p2[0] + p3[0]) * t3),
    z: 0.5 * (2 * p1[1] + (p2[1] - p0[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (3 * p1[1] - p0[1] - 3 * p2[1] + p3[1]) * t3) }); } }
  const l = pts[pts.length - 1]; o.push({ x: l[0], z: l[1] }); return o; };
class Lane {
  constructor(raw) { this.pts = smooth(raw); this.len = [0]; for (let i = 1; i < this.pts.length; i++) this.len.push(this.len[i - 1] + Math.hypot(this.pts[i].x - this.pts[i - 1].x, this.pts[i].z - this.pts[i - 1].z)); this.total = this.len[this.len.length - 1]; }
  at(s, out) { s = clamp(s, 0, this.total); let i = 1; const L = this.len; while (i < L.length - 1 && L[i] < s) i++; const a = this.pts[i - 1], b = this.pts[i], t = (s - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1]);
    out.x = a.x + (b.x - a.x) * t; out.z = a.z + (b.z - a.z) * t; const d = Math.hypot(b.x - a.x, b.z - a.z) || 1; out.hx = (b.x - a.x) / d; out.hz = (b.z - a.z) / d; return out; }
}
export const LANES = [
  new Lane([[-2.7, 5.4], [-2.7, 3.0], [-2.5, 1.5], [-2.65, 0], [-2.5, -1.5], [-2.3, -3.0], [-1.5, -4.5]]),
  new Lane([[0.75, 5.4], [0.75, 3.0], [0.75, 1.4], [0.5, 0.5], [-0.5, -0.5], [-0.75, -1.5], [-0.75, -3.0], [-0.6, -4.5]]),
  new Lane([[2.7, 5.4], [2.7, 3.0], [2.55, 1.5], [2.7, 0], [2.5, -1.5], [2.3, -3.0], [1.5, -4.5]]),
];
// build spots sit on a 1.5 lattice so 45 degree turns line optics up with each other
export const SLOTS = [{ x: -1.5, z: -3 }, { x: 1.5, z: -3 }, { x: 0, z: -1.5 }, { x: -1.5, z: 0 }, { x: 1.5, z: 0 }, { x: 0, z: 1.5 }, { x: -1.5, z: 3 }, { x: 1.5, z: 3 }, { x: 0, z: 3 }];
export const dirVec = d => { const a = (((d % 8) + 8) % 8) * Math.PI / 4; return { x: Math.round(Math.cos(a) * 1e6) / 1e6, z: Math.round(Math.sin(a) * 1e6) / 1e6 }; };

// ---------- what can be built ----------
export const BUILD_ORDER = ['mirror', 'prism', 'lens', 'bell', 'beacon', 'jar'];
export const BUILDS = {
  mirror: { name: '거울', cost: 40, optic: true, len: 4.4, hw: 0.36, dps: 3.2, desc: '받은 빛을 한 줄로 반사',
    spec: [{ id: 'twin', name: '쌍거울', desc: '반대쪽으로도 한 줄 더' }, { id: 'pierce', name: '꿰뚫는 빛', desc: '방패를 무시하고 더 멀리' }] },
  prism: { name: '프리즘', cost: 65, optic: true, len: 3.4, hw: 0.3, dps: 1.9, desc: '받은 빛을 세 갈래로',
    spec: [{ id: 'five', name: '다섯 갈래', desc: '빛이 다섯 갈래로' }, { id: 'rainbow', name: '무지개', desc: '닿은 적이 느려져요' }] },
  lens: { name: '렌즈', cost: 85, optic: true, dist: 1.1, rad: 0.6, dps: 15, desc: '받은 빛을 한 점에 모음',
    spec: [{ id: 'sun', name: '햇덩이', desc: '빛 점이 훨씬 커져요' }, { id: 'cutter', name: '절단광', desc: '작지만 아주 뜨겁게' }] },
  bell: { name: '종', cost: 70, rad: 2.3, every: 5.5, stun: 1.2, dmg: 1.5, desc: '주변 기절 · 안개 걷어냄',
    spec: [{ id: 'big', name: '큰 종', desc: '더 넓게, 더 오래' }, { id: 'quick', name: '빠른 종', desc: '훨씬 자주 울려요' }] },
  beacon: { name: '봉화', cost: 70, dist: 1.25, rad: 0.8, dps: 3.4, linger: 2.2, desc: '바닥 불길로 계속 태움',
    spec: [{ id: 'wild', name: '들불', desc: '불길이 넓게 번져요' }, { id: 'hell', name: '숯불', desc: '훨씬 세게, 오래 타요' }] },
  jar: { name: '반딧불 병', cost: 90, rad: 2.6, every: 1.15, dmg: 6.5, chain: 3, desc: '가까운 적에 연쇄 번개',
    spec: [{ id: 'long', name: '긴 사슬', desc: '세 마리 더 이어져요' }, { id: 'over', name: '과충전', desc: '두 배로 세게' }] },
};
const LVL_MUL = [0, 1, 1.5, 2.2, 3.4];
export const upgradeCost = (type, lvl, disc = 1) => Math.round(BUILDS[type].cost * [0, 1, 0.8, 1.2, 2.1][lvl + 1] * disc);   // cost to reach lvl + 1
export const sellValue = (t, refund = 0.7) => Math.round(t.spent * refund);

// ---------- who comes out of the sea ----------
export const ENEMIES = {
  fry: { name: '잔챙이', hp: 4, spd: 0.62, size: 0.42, shard: 0.8 },                                   // tiny, in swarms
  fish: { name: '날치', hp: 5, spd: 1.2, size: 0.5, shard: 3, hop: [0.9, 0.55] },                    // leaps over light
  crab: { name: '방패게', hp: 16, spd: 0.42, size: 0.62, shard: 6 },                                 // blocks light from the front
  octo: { name: '문어', hp: 30, spd: 0.4, size: 0.72, shard: 8, split: 3 },                          // splits into three
  baby: { name: '새끼 문어', hp: 6, spd: 0.7, size: 0.4, shard: 1 },
  fog: { name: '안개', hp: 26, spd: 0.36, size: 0.9, shard: 9, fog: 1.7 },                           // dims light around it; a bell clears it
  turtle: { name: '거북', hp: 120, spd: 0.26, size: 0.95, shard: 20, bar: true },                    // hard shell; needs gathered (lens) light
  boss: { name: '큰 고래 그림자', hp: 1500, spd: 0.15, size: 2.3, shard: 200, bar: true, windows: 10 },
};
// 15 hand-written waves: [type, count, lanes, gap seconds, start second]
export const WAVES = [
  [['fry', 14, [1], 1.0, 0]],
  [['fry', 16, [0, 2], 0.9, 0], ['fish', 6, [1], 1.4, 6]],
  [['fry', 20, [0, 1, 2], 0.8, 0], ['crab', 5, [1], 2.6, 4]],
  [['fry', 24, [0, 2], 0.7, 0], ['octo', 4, [1], 3.5, 3], ['fish', 6, [0], 1.2, 12]],
  [['fry', 30, [0, 1, 2], 0.6, 0], ['fog', 3, [1, 0, 2], 5, 2], ['fish', 8, [2], 1.0, 10]],
  [['fry', 46, [0, 1, 2], 0.45, 0], ['crab', 8, [0, 2], 2.2, 3], ['fish', 12, [1], 0.8, 9], ['fog', 2, [1], 6, 12]],
  [['turtle', 3, [1, 0, 2], 7, 1], ['fry', 52, [0, 1, 2], 0.42, 0], ['fog', 3, [0, 2, 1], 5, 6], ['crab', 6, [1], 2.4, 10]],
  [['octo', 8, [0, 1, 2], 2.6, 0], ['crab', 10, [0, 2], 1.9, 4], ['fish', 18, [1, 0], 0.6, 8], ['fry', 54, [0, 1, 2], 0.4, 2], ['turtle', 2, [1], 9, 14]],
  [['fry', 96, [0, 1, 2], 0.26, 0], ['turtle', 4, [0, 2], 6, 3], ['fog', 4, [1, 0, 2, 1], 4.5, 5], ['octo', 5, [1], 3, 10]],
  [['fish', 30, [0, 1, 2], 0.45, 0], ['crab', 14, [0, 1, 2], 1.6, 3], ['octo', 10, [0, 2], 2.2, 6], ['fry', 76, [0, 1, 2], 0.3, 2], ['turtle', 4, [1], 6, 9]],
  [['fry', 128, [0, 1, 2], 0.2, 0], ['turtle', 6, [0, 1, 2], 5, 2], ['fog', 5, [0, 1, 2], 4, 4], ['crab', 12, [1, 0], 1.8, 8]],
  [['fry', 230, [0, 1, 2], 0.085, 0], ['fish', 32, [0, 1, 2], 0.42, 3], ['octo', 12, [0, 1, 2], 2, 5], ['fog', 4, [1, 2], 5, 8], ['turtle', 5, [0, 2], 6, 6]],
  [['turtle', 9, [0, 1, 2], 4, 1], ['crab', 18, [0, 1, 2], 1.4, 2], ['fog', 6, [0, 1, 2], 3.6, 4], ['fry', 128, [0, 1, 2], 0.2, 0], ['octo', 8, [1], 2.4, 9]],
  [['fry', 440, [0, 1, 2], 0.03, 0], ['fish', 36, [0, 1, 2], 0.4, 4], ['octo', 14, [0, 1, 2], 1.8, 6], ['crab', 14, [0, 2], 1.6, 8], ['turtle', 6, [1, 0, 2], 5, 5], ['fog', 5, [1], 4, 10]],
  [['boss', 1, [1], 1, 6], ['fry', 360, [0, 1, 2], 0.045, 0], ['turtle', 6, [0, 2], 5, 4], ['fog', 6, [0, 1, 2], 4, 3], ['crab', 12, [0, 2], 1.8, 9], ['fish', 24, [1], 0.5, 12]],
];
export const LAST_WAVE = WAVES.length;
function waveSpawns(n, r) { // -> [{t, type, lane}]
  const out = []; let defs = WAVES[Math.min(n, LAST_WAVE) - 1];
  const extra = Math.max(0, n - LAST_WAVE), cnt = 1 + extra * 0.22;                                   // the storm night keeps growing
  if (extra) defs = WAVES[9 + (extra % 5)].concat(extra % 5 === 4 ? [['boss', 1, [1], 1, 6]] : []);
  for (const [type, c, lanes, gap, t0] of defs) { const m = type === 'boss' ? c : Math.round(c * cnt); for (let i = 0; i < m; i++) out.push({ t: t0 + i * gap / (type === 'boss' ? 1 : cnt) + r() * 0.2, type, lane: lanes[i % lanes.length] }); }
  return out.sort((a, b) => a.t - b.t);
}
export const waveHp = n => (1 + 0.08 * (n - 1)) * (n > LAST_WAVE ? Math.pow(1.16, n - LAST_WAVE) : 1);

// ---------- between-wave cards ----------
export const CARDS = [
  { id: 'prism4', name: '네 갈래 프리즘', desc: '프리즘 빛이 한 갈래 늘어요', f: m => { m.prismExtra += 1; } },
  { id: 'fishslow', name: '젖은 날개', desc: '날치가 25% 느려져요', f: m => { m.fishSpd *= 0.75; } },
  { id: 'shard20', name: '빛 줍는 손', desc: '처치 시 빛조각 +20%', f: m => { m.shard *= 1.2; } },
  { id: 'lamp25', name: '밝은 심지', desc: '등대 빛 +25%', f: m => { m.lamp *= 1.25; } },
  { id: 'lampwide', name: '넓은 등갓', desc: '등대 빛 웅덩이 +20%', f: m => { m.lampRad *= 1.2; } },
  { id: 'flashfast', name: '기름 한 통', desc: '섬광이 25% 빨리 차요', f: m => { m.flashEvery *= 0.75; } },
  { id: 'flashhard', name: '큰 섬광', desc: '섬광 피해 +60%', f: m => { m.flashDmg *= 1.6; } },
  { id: 'mirrorlong', name: '맑은 거울', desc: '거울 빛 길이 +30%', f: m => { m.mirrorLen *= 1.3; } },
  { id: 'lenshot', name: '두꺼운 렌즈', desc: '렌즈 빛 +30%', f: m => { m.lens *= 1.3; } },
  { id: 'bellstun', name: '깊은 종소리', desc: '종 기절 +0.6초', f: m => { m.bellStun += 0.6; } },
  { id: 'burn', name: '마른 장작', desc: '봉화 불길 +35%', f: m => { m.beacon *= 1.35; } },
  { id: 'chain1', name: '반딧불 한 마리 더', desc: '번개가 한 마리 더 이어져요', f: m => { m.chain += 1; } },
  { id: 'link', name: '빛의 이음', desc: '연결 단계마다 위력 +12% 더', f: m => { m.link += 0.12; } },
  { id: 'feed', name: '높은 등대', desc: '등대 빛이 더 먼 자리까지 닿아요', f: m => { m.feed += 1.6; } },
  { id: 'refund', name: '후한 고물상', desc: '판매 환급 90%', f: m => { m.refund = 0.9; } },
  { id: 'gift', name: '밀물 선물', desc: '지금 빛조각 +70', f: (m, g) => { g.shards += 70; } },
  { id: 'window', name: '창문 고치기', desc: '꺼진 창문 3개가 다시 켜져요', f: (m, g) => { g.windows = Math.min(g.windowsMax, g.windows + 3); } },
  { id: 'fryslow', name: '끈적한 모래', desc: '잔챙이가 12% 느려져요', f: m => { m.frySpd *= 0.88; } },
  { id: 'shield', name: '금 간 방패', desc: '방패게가 정면 빛도 조금 맞아요', f: m => { m.crabFront = 0.4; } },
  { id: 'octo2', name: '지친 문어', desc: '문어가 둘로만 갈라져요', f: m => { m.split = 2; } },
  { id: 'fogthin', name: '옅은 안개', desc: '안개가 빛을 덜 가려요', f: m => { m.fogDim = 0.6; } },
  { id: 'shell', name: '무른 등딱지', desc: '거북이 다른 빛에도 조금 약해져요', f: m => { m.turtle = 0.32; } },
  { id: 'early', name: '성급한 등불지기', desc: '웨이브를 미리 부르면 보너스 두 배', f: m => { m.early *= 2; } },
  { id: 'interest', name: '아껴 둔 빛', desc: '웨이브마다 가진 빛조각의 8% 덤(최대 40)', f: m => { m.interest = 0.08; } },
  { id: 'cheap', name: '솜씨 좋은 목수', desc: '설치·강화 값 -12%', f: m => { m.disc *= 0.88; } },
];

export const WAVE_V = 8.0, BREAK = 12;
const HIT = 0.5;                                                                                      // how close a beam must pass to light an optic

export class Game {
  // cfg: { seed, perks: {shards, lamp, windows, flash, refund, reroll} }
  constructor(cfg = {}) {
    const p = cfg.perks || {};
    this.rnd = rng(cfg.seed ?? 1);
    this.m = { prismExtra: 0, fishSpd: 1, frySpd: 1, shard: 1, lamp: 1 + 0.15 * (p.lamp || 0), lampRad: 1, flashEvery: 1 - 0.15 * (p.flash || 0), flashDmg: 1, mirrorLen: 1, lens: 1, bellStun: 0, beacon: 1, chain: 0, link: 0, feed: 0,
      refund: p.refund ? 0.8 : 0.7, crabFront: 0.06, split: 3, fogDim: 0.3, turtle: 0.15, early: 1, interest: 0, disc: 1 };
    this.wave = 0; this.phase = 'break'; this.breakT = 20; this.t = 0; this.wt = 0;
    this.shards = 150 + 40 * (p.shards || 0); this.windowsMax = 20 + 3 * (p.windows || 0); this.windows = this.windowsMax;
    this.rerolls = p.reroll || 0; this.kills = 0; this.earned = 0; this.cards = []; this.offer = null; this.endless = false;
    this.enemies = []; this.nextId = 1; this.q = []; this.qi = 0;
    this.tools = SLOTS.map(() => null); this.lights = []; this.feeds = []; this.dirty = true;
    this.aim = { x: 0, z: -2 }; this.want = { x: 0, z: -2 }; this.manual = false; this.charge = 0.5; this.flashT = -1; this.bossId = 0;
    this.events = [];
  }
  ev(type, d = {}) { this.events.push({ type, ...d }); }
  get lamp() { return { dps: 5.2 * this.m.lamp, radius: 1.05 * this.m.lampRad, reach: 9.2, flashEvery: 24 * this.m.flashEvery, flashDmg: 7 * this.m.flashDmg, flashReach: 10, aimSpeed: 6 }; }
  get done() { return this.phase === 'won' || this.phase === 'lost'; }
  get stars() { return this.wave < LAST_WAVE && this.phase !== 'won' ? 0 : this.windows >= this.windowsMax * 0.75 ? 3 : this.windows >= this.windowsMax * 0.4 ? 2 : 1; }

  // ----- building
  cost(slot, type) { const t = this.tools[slot]; return t ? (t.lvl >= 4 ? Infinity : upgradeCost(t.type, t.lvl, this.m.disc)) : Math.round(BUILDS[type].cost * this.m.disc); }
  build(slot, type, dir) {
    if (this.done || this.tools[slot] || !BUILDS[type]) return false; const c = this.cost(slot, type); if (this.shards < c) return false;
    this.shards -= c; this.tools[slot] = { type, lvl: 1, spec: null, dir: dir ?? 2, cd: 0.5, depth: 0, spent: c }; this.dirty = true; this.ev('build', { slot, tool: type }); return true;
  }
  upgrade(slot, spec) {
    const t = this.tools[slot]; if (this.done || !t || t.lvl >= 4) return false; const c = this.cost(slot);
    if (t.lvl === 3 && !BUILDS[t.type].spec.some(s => s.id === spec)) return false;
    if (this.shards < c) return false; this.shards -= c; t.spent += c; t.lvl++; if (t.lvl === 4) t.spec = spec; this.dirty = true; this.ev('upgrade', { slot, lvl: t.lvl }); return true;
  }
  sell(slot) { const t = this.tools[slot]; if (!t || this.done) return false; this.shards += sellValue(t, this.m.refund); this.tools[slot] = null; this.dirty = true; this.ev('sell', { slot }); return true; }
  rotate(slot, dir) { const t = this.tools[slot]; if (!t) return; const d = ((dir % 8) + 8) % 8; if (d === t.dir) return; t.dir = d; this.dirty = true; this.ev('rotate', { slot }); }
  setAim(x, z) { this.manual = true; this.want.x = x; this.want.z = z; }
  releaseAim() { this.manual = false; }
  canFlash() { return !this.done && this.phase !== 'cards' && this.charge >= 1 && this.flashT < 0; }
  flash() { if (!this.canFlash()) return false; this.charge = 0; this.flashT = 0; for (const e of this.enemies) e.flashed = false; this.ev('flash'); return true; }

  // ----- waves
  callWave() { // start the next wave now; calling early pays a bonus
    if (this.phase !== 'break') return false;
    const bonus = this.wave > 0 ? Math.round(Math.max(0, this.breakT) * 2.5 * this.m.early) : 0; if (bonus) { this.shards += bonus; this.ev('bonus', { n: bonus }); }
    this.wave++; this.phase = 'wave'; this.wt = 0; this.q = waveSpawns(this.wave, this.rnd); this.qi = 0; this.ev('wave', { n: this.wave }); return true;
  }
  pickCard(i) { if (this.phase !== 'cards' || !this.offer[i]) return false; const c = this.offer[i]; this.cards.push(c.id); c.f(this.m, this); this.offer = null; this.phase = 'break'; this.breakT = BREAK; this.dirty = true; this.ev('card', { id: c.id }); return true; }
  reroll() { if (this.phase !== 'cards' || this.rerolls <= 0) return false; this.rerolls--; this.deal(); return true; }
  deal() { const pool = CARDS.filter(c => !this.cards.includes(c.id) || c.id === 'gift' || c.id === 'window'), pick = []; while (pick.length < 3 && pool.length) pick.push(pool.splice(Math.floor(this.rnd() * pool.length), 1)[0]); this.offer = pick; }
  continueEndless() { if (this.phase !== 'won') return false; this.endless = true; this.phase = 'cards'; this.deal(); return true; }

  spawn(type, lane, s = 0) {
    const B = ENEMIES[type], e = { id: this.nextId++, type, lane, s, x: 0, z: 0, hx: 0, hz: -1, hp: B.hp * waveHp(Math.max(1, this.wave)), spd: B.spd * (type === 'fish' ? this.m.fishSpd : type === 'fry' ? this.m.frySpd : 1), size: B.size,
      lit: 0, blocked: 0, stun: 0, slow: 1, burn: 0, burnDps: 0, air: 0, ph: this.rnd() * 6.28, off: (this.rnd() - 0.5) * 0.5, flashed: true, fogOff: 0, dim: 1 };
    e.max = e.hp; LANES[lane].at(s, e); e.x += -e.hz * e.off; e.z += e.hx * e.off; this.enemies.push(e); if (type === 'boss') this.bossId = e.id; return e;
  }

  // ----- light network: optics only work when lit by the lighthouse or by another lit optic
  relink() {
    this.dirty = false; const T = this.tools, m = this.m; for (const t of T) if (t) t.depth = 0;
    const feed = 5.0 + m.feed; this.feeds = [];
    T.forEach((t, i) => { if (t && BUILDS[t.type].optic && Math.hypot(SLOTS[i].x - TOWER.x, SLOTS[i].z - TOWER.z) <= feed) { t.depth = 1; this.feeds.push(i); } });
    const outs = (t, i) => { // rays an optic sends out: [{dx, dz, len}]
      const B = BUILDS[t.type], k = 1 + 0.08 * (t.lvl - 1);
      if (t.type === 'mirror') { const len = B.len * k * m.mirrorLen * (t.spec === 'pierce' ? 1.35 : 1); return (t.spec === 'twin' ? [t.dir, t.dir + 4] : [t.dir]).map(d => ({ ...dirVec(d), len })); }
      if (t.type === 'prism') { const n = (t.spec === 'five' ? 5 : 3) + m.prismExtra, r = []; for (let j = 0; j < n; j++) { const o = Math.ceil(j / 2) * (j % 2 ? 1 : -1); r.push({ ...dirVec(t.dir + o), len: B.len * k }); } return r; }
      return [{ ...dirVec(t.dir), len: B.dist, lens: true }];
    };
    const rays = [];
    for (let pass = 0; pass < 6; pass++) { // breadth first: each pass lights the optics one link further out
      let changed = false; rays.length = 0;
      T.forEach((t, i) => { if (!t || !t.depth || !BUILDS[t.type].optic) return; const s = SLOTS[i];
        for (const o of outs(t, i)) { let len = o.len, hit = -1;
          if (!o.lens) T.forEach((u, j) => { if (!u || j === i || !BUILDS[u.type].optic) return; const rx = SLOTS[j].x - s.x, rz = SLOTS[j].z - s.z, al = rx * o.x + rz * o.z, off = Math.abs(rx * o.z - rz * o.x) / Math.hypot(o.x, o.z); if (al > 0.3 && al <= len + 0.1 && off < HIT) { len = al; hit = j; } });
          if (hit >= 0 && !T[hit].depth) { T[hit].depth = Math.min(5, t.depth + 1); changed = true; }
          rays.push({ src: i, x0: s.x, z0: s.z, dx: o.x / Math.hypot(o.x, o.z), dz: o.z / Math.hypot(o.x, o.z), len, hit, lens: !!o.lens }); } });
      if (!changed) break;
    }
    // what actually burns: beams, lens spots, fire patches
    this.lights = [];
    for (const r of rays) { const t = T[r.src], B = BUILDS[t.type], mul = LVL_MUL[t.lvl] * (1 + (0.4 + m.link) * (t.depth - 1));
      if (r.lens) { const big = t.spec === 'sun' ? 1.75 : t.spec === 'cutter' ? 0.7 : 1; this.lights.push({ kind: 'disc', slot: r.src, x: r.x0 + r.dx * B.dist, z: r.z0 + r.dz * B.dist, r: B.rad * big, dps: B.dps * mul * m.lens * (t.spec === 'cutter' ? 2.4 : 1), dx: r.dx, dz: r.dz, focused: true, depth: t.depth });
        this.lights.push({ kind: 'link', slot: r.src, x0: r.x0, z0: r.z0, x1: r.x0 + r.dx * B.dist, z1: r.z0 + r.dz * B.dist, depth: t.depth }); }
      else this.lights.push({ kind: 'seg', slot: r.src, x0: r.x0, z0: r.z0, x1: r.x0 + r.dx * r.len, z1: r.z0 + r.dz * r.len, hw: B.hw, dps: B.dps * mul, dx: r.dx, dz: r.dz, depth: t.depth, pierce: t.spec === 'pierce', slow: t.spec === 'rainbow' ? 0.7 : 1, hit: r.hit }); }
    T.forEach((t, i) => { if (!t || t.type !== 'beacon') return; const B = BUILDS.beacon, v = dirVec(t.dir), nv = Math.hypot(v.x, v.z);
      this.lights.push({ kind: 'fire', slot: i, x: SLOTS[i].x + v.x / nv * B.dist, z: SLOTS[i].z + v.z / nv * B.dist, r: B.rad * (t.spec === 'wild' ? 1.6 : 1) * (1 + 0.06 * (t.lvl - 1)), dps: B.dps * LVL_MUL[t.lvl] * m.beacon * (t.spec === 'hell' ? 1.9 : 1), linger: B.linger * (t.spec === 'hell' ? 1.8 : 1) }); });
  }

  // how much of a light an enemy takes
  mod(e, L) { // L: {focused, dx, dz, pierce, fire, zap, flash}
    if (e.air > 0 && !L.zap && !L.flash) return 0;                                                   // a leaping flying fish is out of reach
    let k = 1;
    if (e.type === 'turtle') k = L.focused ? 1 : L.fire || L.zap ? 0.5 : L.flash ? 0.4 : this.m.turtle;
    else if (e.type === 'crab' || e.type === 'boss') { if (!L.fire && !L.zap && !L.flash && !L.pierce && (L.dx * e.hx + L.dz * e.hz) < -0.3) { k = e.type === 'boss' ? 0.5 : this.m.crabFront; e.blocked = 0.25; } }
    else if (e.type === 'fog') k = L.fire || L.zap ? 1 : 0.35;
    if (!L.fire && !L.zap) k *= e.dim;                                                                // standing in fog
    return k;
  }
  hurt(e, dmg, by) {
    if (dmg <= 0 || e.dead) return; e.hp -= dmg; e.lit = 0.18;
    if (e.hp > 0) return;
    e.dead = true; this.kills++; const sh = Math.round(ENEMIES[e.type].shard * this.m.shard * 100) / 100; this.shardAcc = (this.shardAcc || 0) + sh; const n = Math.floor(this.shardAcc); this.shardAcc -= n; this.shards += n; this.earned += n;
    this.ev('kill', { id: e.id, enemy: e.type, x: e.x, z: e.z, size: e.size, shard: n, by });
    if (e.type === 'octo') for (let i = 0; i < this.m.split; i++) { const b = this.spawn('baby', e.lane, Math.max(0, e.s - 0.25 * i)); b.off = (i - 1) * 0.3; }
  }

  step(dt) {
    if (this.done || this.phase === 'cards') return;
    if (this.dirty) this.relink();
    this.t += dt; const P = this.lamp, T = this.tools;
    if (this.phase === 'break') { this.breakT -= dt; if (this.breakT <= 0) this.callWave(); }
    if (this.phase === 'wave') { this.wt += dt; while (this.qi < this.q.length && this.q[this.qi].t <= this.wt) { const s = this.q[this.qi++]; this.spawn(s.type, s.lane); } }

    // lighthouse aim: the shadow deepest into the village that the light can bite
    if (!this.manual) { let best = null, bs = -1;
      for (const e of this.enemies) { if (Math.hypot(e.x - TOWER.x, e.z - TOWER.z) > P.reach + P.radius * 0.5) continue; const hard = e.type === 'turtle' || e.type === 'crab' || e.type === 'fog' ? 0 : 100; const sc = e.s / LANES[e.lane].total + hard; if (sc > bs) { bs = sc; best = e; } }
      if (best) { this.want.x = best.x; this.want.z = best.z; } else { this.want.x = Math.sin(this.t * 0.42) * 2.4; this.want.z = -1.5 + Math.sin(this.t * 0.27) * 2.2; } }
    { const wx = this.want.x - TOWER.x, wz = this.want.z - TOWER.z, wd = Math.hypot(wx, wz); if (wd > P.reach) { this.want.x = TOWER.x + wx / wd * P.reach; this.want.z = TOWER.z + wz / wd * P.reach; }
      const dx = this.want.x - this.aim.x, dz = this.want.z - this.aim.z, d = Math.hypot(dx, dz), sp = (this.manual ? 3 : 1) * P.aimSpeed * dt; if (d <= sp) { this.aim.x = this.want.x; this.aim.z = this.want.z; } else { this.aim.x += dx / d * sp; this.aim.z += dz / d * sp; } }
    this.charge = Math.min(1, this.charge + dt / P.flashEvery);
    let ringR = -1; if (this.flashT >= 0) { this.flashT += dt; ringR = this.flashT * WAVE_V; if (ringR > P.flashReach) { this.flashT = -1; ringR = -1; } }

    // bells and firefly jars act on their own clock
    T.forEach((t, i) => { if (!t) return; const B = BUILDS[t.type], s = SLOTS[i];
      if (t.type === 'bell') { t.cd -= dt; if (t.cd <= 0) { const rad = B.rad * (t.spec === 'big' ? 1.5 : 1) * (1 + 0.07 * (t.lvl - 1)); let any = false;
          for (const e of this.enemies) if (Math.hypot(e.x - s.x, e.z - s.z) < rad + e.size * 0.3) { any = true; if (e.type !== 'boss') e.stun = Math.max(e.stun, (B.stun + this.m.bellStun) * (t.spec === 'big' ? 1.5 : 1) * (1 + 0.1 * (t.lvl - 1))); e.air = 0; if (e.type === 'fog') { e.fogOff = 7; this.hurt(e, 9 * LVL_MUL[t.lvl], 'bell'); } else this.hurt(e, B.dmg * LVL_MUL[t.lvl], 'bell'); }
          if (any) { t.cd = B.every * (t.spec === 'quick' ? 0.5 : 1); this.ev('bell', { slot: i, r: rad }); } else t.cd = 0.25; } }
      else if (t.type === 'jar') { t.cd -= dt; if (t.cd <= 0) { let cur = null, cd = B.rad; for (const e of this.enemies) { const d = Math.hypot(e.x - s.x, e.z - s.z); if (!e.dead && d < cd) { cd = d; cur = e; } }
          if (!cur) { t.cd = 0.15; return; } t.cd = B.every; const pts = [{ x: s.x, z: s.z }], seen = new Set(); let dmg = B.dmg * LVL_MUL[t.lvl] * (t.spec === 'over' ? 2 : 1); const n = B.chain + this.m.chain + (t.spec === 'long' ? 3 : 0);
          for (let c = 0; c < n && cur; c++) { seen.add(cur.id); pts.push({ x: cur.x, z: cur.z }); this.hurt(cur, dmg * this.mod(cur, { zap: true }), 'jar'); dmg *= 0.78; let nx = null, nd = 1.7; for (const e of this.enemies) { if (e.dead || seen.has(e.id)) continue; const d = Math.hypot(e.x - cur.x, e.z - cur.z); if (d < nd) { nd = d; nx = e; } } cur = nx; }
          this.ev('zap', { pts }); } } });

    // fog dims the light on everything near it
    const fogs = this.enemies.filter(e => e.type === 'fog' && e.fogOff <= 0);
    for (const e of this.enemies) {
      e.lit = Math.max(0, e.lit - dt); e.blocked = Math.max(0, e.blocked - dt); e.slow = 1; e.fogOff = Math.max(0, e.fogOff - dt); e.dim = 1;
      for (const f of fogs) if (Math.hypot(e.x - f.x, e.z - f.z) < ENEMIES.fog.fog) { e.dim = this.m.fogDim; break; }
      const hop = ENEMIES[e.type].hop; if (hop && e.stun <= 0) { const c = (this.t + e.ph) % (hop[0] + hop[1]); e.air = c > hop[0] ? 1 - (c - hop[0]) / hop[1] : 0; } else e.air = 0;
      const pad = e.size * 0.3;
      const d = Math.hypot(e.x - this.aim.x, e.z - this.aim.z);
      if (d < P.radius + pad) { let lx = e.x - TOWER.x, lz = e.z - TOWER.z; const ll = Math.hypot(lx, lz) || 1; this.hurt(e, P.dps * this.mod(e, { dx: lx / ll, dz: lz / ll }) * (1 - 0.4 * Math.min(1, d / P.radius) ** 2) * dt, 'lamp'); }
      for (const L of this.lights) { if (e.dead) break; if (L.kind === 'link') continue;
        if (L.kind === 'seg') { const ax = L.x1 - L.x0, az = L.z1 - L.z0, l2 = ax * ax + az * az, tt = clamp(((e.x - L.x0) * ax + (e.z - L.z0) * az) / l2); if (Math.hypot(e.x - (L.x0 + ax * tt), e.z - (L.z0 + az * tt)) > L.hw + pad) continue; const k = this.mod(e, L); if (k > 0 && L.slow < 1) e.slow = Math.min(e.slow, L.slow); this.hurt(e, L.dps * k * dt, T[L.slot].type); }
        else if (Math.hypot(e.x - L.x, e.z - L.z) < L.r + pad) { if (L.kind === 'fire') { if (e.air > 0) continue; e.burn = L.linger; e.burnDps = Math.max(e.burnDps, L.dps * this.mod(e, { fire: true })); } else this.hurt(e, L.dps * this.mod(e, L) * dt, 'lens'); } }
      if (e.dead) continue;
      if (e.burn > 0) { e.burn -= dt; this.hurt(e, e.burnDps * dt, 'beacon'); if (e.burn <= 0) e.burnDps = 0; if (e.dead) continue; }
      if (ringR >= 0 && !e.flashed && Math.hypot(e.x - TOWER.x, e.z - TOWER.z) <= ringR) { e.flashed = true; if (e.type !== 'boss') e.stun = Math.max(e.stun, 1.6); e.air = 0; this.hurt(e, P.flashDmg * this.mod(e, { flash: true }), 'flash'); if (e.dead) continue; }
      if (e.stun > 0) e.stun -= dt; else e.s += e.spd * e.slow * dt;
      const L = LANES[e.lane]; L.at(e.s, e); e.x += -e.hz * e.off; e.z += e.hx * e.off;
      if (e.type === 'boss') { e.summonT = (e.summonT || 0) + dt; if (e.summonT > 3.2) { e.summonT = 0; for (const ln of [0, 2]) this.spawn('fry', ln, Math.min(LANES[ln].total * 0.5, e.s)); } }
      if (e.s >= L.total) { e.dead = true; const n = Math.min(this.windows, ENEMIES[e.type].windows || (e.type === 'turtle' ? 3 : e.type === 'fry' || e.type === 'baby' ? 1 : 2)); this.windows -= n; this.ev('leak', { id: e.id, enemy: e.type, n, left: this.windows }); }
    }
    this.enemies = this.enemies.filter(e => !e.dead);
    if (this.windows <= 0) { this.phase = 'lost'; this.ev('lost', { wave: this.wave }); return; }
    if (this.phase === 'wave' && this.qi >= this.q.length && !this.enemies.length) { // wave cleared
      if (this.m.interest) { const n = Math.min(40, Math.floor(this.shards * this.m.interest)); this.shards += n; }
      { const pay = 20 + 4 * this.wave; this.shards += pay; this.ev('cleared', { n: this.wave, pay }); }
      if (this.wave === LAST_WAVE && !this.endless) { this.phase = 'won'; this.ev('won', { stars: this.stars }); }
      else { this.phase = 'cards'; this.deal(); }
    }
  }
}

// ---------- scripted players for the build checks ----------
// plan: [['b', slot, type, dir], ['u', slot, spec?], ...] carried out in order as shards allow
export const PLANS = {
  // mirrors only, each lit straight from the lighthouse or from one other mirror: no prism, no lens, no bell
  mirrors: [['b', 0, 'mirror', 0], ['b', 1, 'mirror', 3], ['b', 2, 'mirror', 0], ['b', 3, 'mirror', 0], ['u', 0], ['u', 1], ['b', 5, 'mirror', 0], ['b', 4, 'mirror', 4], ['u', 3], ['u', 2], ['u', 0], ['u', 1], ['b', 6, 'mirror', 0], ['b', 8, 'mirror', 4], ['u', 5], ['u', 3], ['u', 0, 'twin'], ['u', 1, 'twin'], ['u', 2], ['u', 4], ['b', 7, 'mirror', 4], ['u', 5], ['u', 6], ['u', 2, 'pierce'], ['u', 3, 'pierce']],
  // no optics at all: bells, beacons and firefly jars, no light links
  solo: [['b', 2, 'beacon', 4], ['b', 3, 'jar', 0], ['b', 4, 'beacon', 0], ['b', 0, 'bell', 0], ['u', 2], ['b', 5, 'jar', 0], ['u', 3], ['b', 1, 'beacon', 0], ['u', 4], ['b', 6, 'beacon', 4], ['u', 2], ['b', 7, 'jar', 0], ['u', 5], ['b', 8, 'bell', 0], ['u', 3], ['u', 0], ['u', 4], ['u', 2, 'hell'], ['u', 3, 'long'], ['u', 5], ['u', 7], ['u', 6], ['u', 1]],
  // the light chain: two mirrors feed a prism, the prism feeds two lenses and a mirror, with a bell, a beacon and a jar around it
  combo: [['b', 0, 'mirror', 0], ['b', 1, 'mirror', 3], ['b', 2, 'prism', 2], ['b', 3, 'lens', 4], ['b', 4, 'lens', 0], ['b', 5, 'lens', 0], ['b', 8, 'bell', 0], ['u', 2], ['b', 6, 'beacon', 4], ['u', 3], ['u', 4], ['b', 7, 'jar', 0], ['u', 0], ['u', 2], ['u', 5], ['u', 3], ['u', 4], ['u', 8], ['u', 1], ['u', 7], ['u', 6], ['u', 2, 'five'], ['u', 3, 'sun'], ['u', 4, 'sun'], ['u', 5], ['u', 8, 'quick'], ['u', 7], ['u', 0], ['u', 5, 'sun'], ['u', 7, 'long'], ['u', 6], ['u', 6, 'hell'], ['u', 0, 'pierce'], ['u', 1], ['u', 1, 'pierce']],
};
export class PlanBot {
  constructor(game, plan, cards = []) { this.g = game; this.plan = plan.slice(); this.cards = cards; this.i = 0; }
  step() {
    const g = this.g;
    if (g.phase === 'cards') { let k = g.offer.findIndex(c => this.cards.includes(c.id)); g.pickCard(k < 0 ? 0 : k); }
    if (g.phase === 'break') { if (g.wave === 0 || g.breakT < BREAK - 2) g.callWave(); }
    for (let n = 0; n < 4 && this.i < this.plan.length; n++) { const [a, slot, x, dir] = this.plan[this.i]; const ok = a === 'b' ? g.build(slot, x, dir) : g.upgrade(slot, x); if (ok) this.i++; else if (a === 'u' && (!g.tools[slot] || g.tools[slot].lvl >= 4)) this.i++; else break; }
    if (g.canFlash()) { let deep = 0, near = 0; for (const e of g.enemies) { if (e.s > LANES[e.lane].total * 0.75) deep++; if (Math.hypot(e.x - TOWER.x, e.z - TOWER.z) < 9) near++; } if (deep >= 2 || near >= 14) g.flash(); }
  }
}
