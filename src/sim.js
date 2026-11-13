// 등불지기 — game rules. Pure logic: no DOM, no three.js, so it also runs headless in node
// (tools/autoplay.js) for balance checks and the automated play-through.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export function rng(seed) { let s = seed >>> 0; return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- path ----------
export class Path {
  constructor(pts) { // pts: [{x,z}] from the village entrance (near) to the lantern tower (far)
    this.pts = pts; this.len = [0];
    for (let i = 1; i < pts.length; i++) this.len.push(this.len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    this.total = this.len[this.len.length - 1];
  }
  at(s, out = {}) {
    s = clamp(s, 0, this.total); let i = 1; const L = this.len; while (i < L.length - 1 && L[i] < s) i++;
    const a = this.pts[i - 1], b = this.pts[i], t = (s - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1]);
    out.x = a.x + (b.x - a.x) * t; out.z = a.z + (b.z - a.z) * t;
    const d = Math.hypot(b.x - a.x, b.z - a.z) || 1; out.hx = (b.x - a.x) / d; out.hz = (b.z - a.z) / d;
    return out;
  }
}

// ---------- tools ----------
// dir is 0..7, a 45 degree step: angle = dir * 45deg, vector (cos, sin) on the ground (x, z).
export const TOOL_ORDER = ['mirror', 'prism', 'lens', 'glass', 'jar'];
export const TOOLS = {
  mirror: { name: '거울', kind: 'beam', len: 5.0, hw: 0.40, dps: 1.5 },
  prism: { name: '프리즘', kind: 'fan', len: 3.5, hw: 0.32, dps: 0.95, spread: 0.52 },
  lens: { name: '렌즈', kind: 'spot', dist: 2.4, rad: 0.8, dps: 6.5, focused: true },
  glass: { name: '색유리', kind: 'beam', len: 4.6, hw: 0.40, dps: 1.6, colored: true },
  jar: { name: '반딧불 병', kind: 'aura', rad: 2.3, dps: 0.7, slow: 0.6 },
};
export const dirVec = d => { const a = d * Math.PI / 4; return { x: Math.cos(a), z: Math.sin(a) }; };
const toolScale = lvl => 1 + 0.3 * lvl;

// the shapes a tool lights up, in world space (also used by the renderer to draw the light)
export function toolLight(type, slot, dir, lvl = 0) {
  const T = TOOLS[type], v = dirVec(dir), k = toolScale(lvl), reach = 1 + 0.1 * lvl;
  if (T.kind === 'beam') return [{ kind: 'seg', x0: slot.x, z0: slot.z, x1: slot.x + v.x * T.len * reach, z1: slot.z + v.z * T.len * reach, hw: T.hw, dps: T.dps * k, dx: v.x, dz: v.z }];
  if (T.kind === 'fan') return [-T.spread, 0, T.spread].map(o => { const a = dir * Math.PI / 4 + o, x = Math.cos(a), z = Math.sin(a);
    return { kind: 'seg', x0: slot.x, z0: slot.z, x1: slot.x + x * T.len * reach, z1: slot.z + z * T.len * reach, hw: T.hw, dps: T.dps * k, dx: x, dz: z }; });
  if (T.kind === 'spot') return [{ kind: 'disc', x: slot.x + v.x * T.dist, z: slot.z + v.z * T.dist, r: T.rad * reach, dps: T.dps * k, dx: v.x, dz: v.z }];
  return [{ kind: 'disc', x: slot.x, z: slot.z, r: T.rad * reach, dps: T.dps * k, dx: 0, dz: 0 }];
}
function inLight(L, x, z, pad) {
  if (L.kind === 'disc') return Math.hypot(x - L.x, z - L.z) < L.r + pad;
  const ax = L.x1 - L.x0, az = L.z1 - L.z0, l2 = ax * ax + az * az, t = clamp(((x - L.x0) * ax + (z - L.z0) * az) / l2);
  return Math.hypot(x - (L.x0 + ax * t), z - (L.z0 + az * t)) < L.hw + pad;
}
// how much of the path a tool would cover from a slot: used for hints and by the autoplay bot
export function bestDir(path, type, slot, lvl = 0) {
  let best = 0, bestScore = -1;
  for (let d = 0; d < 8; d++) {
    const Ls = toolLight(type, slot, d, lvl); let sc = 0; const p = {};
    for (let s = 0; s < path.total; s += 0.25) { path.at(s, p); if (Ls.some(L => inLight(L, p.x, p.z, 0.1))) sc++; }
    if (sc > bestScore) { bestScore = sc; best = d; }
    if (TOOLS[type].kind === 'aura') break;
  }
  return { dir: best, score: bestScore };
}

// ---------- enemies ----------
export const ENEMIES = {
  walker: { hp: 13, spd: 0.62, size: 1.0, sparkle: 1, threat: 1 },
  fast: { hp: 6, spd: 1.25, size: 0.8, sparkle: 1, threat: 1.3 },
  fat: { hp: 70, spd: 0.34, size: 1.75, sparkle: 4, threat: 6, bar: true },        // needs gathered (lens) light
  umbrella: { hp: 13, spd: 0.52, size: 1.1, sparkle: 2, threat: 2.4 },               // shrugs off light from the front
  color: { hp: 12, spd: 0.58, size: 1.0, sparkle: 2, threat: 2.6 },                  // only stained-glass light bites
  boss: { hp: 300, spd: 0.2, size: 2.6, sparkle: 30, threat: 30, bar: true, windows: 3 },
};
export const BOSSES = [
  { name: '왕관 그림자', hp: 260, trait: null, summon: null },
  { name: '뿔 그림자', hp: 420, trait: null, summon: { type: 'fast', every: 9 } },
  { name: '두꺼비 그림자', hp: 520, trait: 'fat', summon: { type: 'walker', every: 11 } },
  { name: '물든 그림자', hp: 480, trait: 'color', summon: { type: 'color', every: 13 } },
  { name: '밤의 날개', hp: 820, trait: 'umbrella', summon: { type: 'fast', every: 7 } },
];

// ---------- upgrades -> numbers ----------
export const UPGRADE_MAX = { lamp: 5, wide: 5, oil: 5, mirror: 3, prism: 3, lens: 3, glass: 3, jar: 3 };
export function lampStats(up = {}) {
  const l = up.lamp || 0, w = up.wide || 0, o = up.oil || 0;
  return { dps: 2.4 * (1 + 0.3 * l), radius: 1.2 * (1 + 0.12 * w), reach: 8.4 + 0.55 * w, flashEvery: 26 / (1 + 0.2 * o), flashDmg: 7 * (1 + 0.3 * o + 0.15 * l), flashReach: 9.5 + 0.55 * w, aimSpeed: 5.5 + 0.5 * l };
}

export const WAVE_V = 8.0; // shock ring speed

export class Sim {
  // cfg: { path: Path, tower: {x,z}, level, upgrades, seed }
  constructor(cfg) {
    this.path = cfg.path; this.tower = cfg.tower; this.level = cfg.level; this.up = cfg.upgrades || {};
    this.lamp = lampStats(this.up); this.rnd = rng(cfg.seed ?? 1);
    this.t = 0; this.prep = cfg.level.prep ?? 8; this.phase = 'prep';
    this.enemies = []; this.nextId = 1;
    this.tools = cfg.level.slots.map(() => null);
    this.aim = { x: this.tower.x, z: this.tower.z + 5 }; this.manual = false; this.want = { x: this.aim.x, z: this.aim.z };
    this.charge = cfg.level.flashStart ?? 0.6; this.flashT = -1; this.flashCount = 0;
    this.windowsMax = cfg.level.windows ?? 5; this.windows = this.windowsMax;
    this.kills = 0; this.sparkles = 0; this.leaked = 0; this.spark = 0;
    this.spawnQ = []; // expand waves into single spawns
    for (const w of cfg.level.waves) for (let i = 0; i < w.n; i++) this.spawnQ.push({ t: w.t + i * (w.gap ?? 1.2), type: w.type, v: (w.v ?? 0) + i });
    if (cfg.level.boss != null) this.spawnQ.push({ t: cfg.level.bossAt ?? cfg.level.duration * 0.45, type: 'boss', boss: cfg.level.boss });
    this.spawnQ.sort((a, b) => a.t - b.t); this.spawnI = 0;
    { let worth = 0; for (const q of this.spawnQ) worth += ENEMIES[q.type].sparkle; this.sparkRate = (cfg.level.reward ?? 20) / Math.max(1, worth); }
    this.events = []; this.lights = []; this._lightsDirty = true;
  }
  ev(type, d = {}) { this.events.push({ type, ...d }); }
  get progress() { return clamp(this.t / this.level.duration); }
  get done() { return this.phase === 'won' || this.phase === 'lost'; }
  get stars() { return this.phase !== 'won' ? 0 : this.windows >= this.windowsMax ? 3 : this.windows >= Math.ceil(this.windowsMax / 2) ? 2 : 1; }
  get score() { return this.phase !== 'won' ? this.kills * 5 : this.windows * 1000 + this.kills * 10 + this.sparkles; }

  // ----- player input
  startNight() { if (this.phase === 'prep') { this.phase = 'night'; this.t = 0; this.ev('night'); } }
  setAim(x, z) { this.manual = true; this.want.x = x; this.want.z = z; }
  releaseAim() { this.manual = false; }
  canFlash() { return this.phase === 'night' && this.charge >= 1 && this.flashT < 0; }
  flash() { if (!this.canFlash()) return false; this.charge = 0; this.flashT = 0; this.flashCount++; for (const e of this.enemies) e.flashed = false; this.ev('flash'); return true; }
  place(slot, type) {
    if (this.done || !this.level.tools.includes(type) || !this.level.slots[slot]) return false;
    const old = this.tools[slot];
    this.tools[slot] = { type, dir: old ? old.dir : bestDir(this.path, type, this.level.slots[slot], this.up[type] || 0).dir, ready: this.phase === 'prep' ? 0.3 : 1.2 };
    this._lightsDirty = true; this.ev('place', { slot, tool: type }); return true;
  }
  remove(slot) { if (this.tools[slot]) { this.tools[slot] = null; this._lightsDirty = true; this.ev('remove', { slot }); } }
  rotate(slot, dir) { const t = this.tools[slot]; if (!t || t.dir === ((dir % 8) + 8) % 8) return; t.dir = ((dir % 8) + 8) % 8; this._lightsDirty = true; this.ev('rotate', { slot }); }

  spawn(q) {
    const base = ENEMIES[q.type], lv = this.level;
    const e = { id: this.nextId++, type: q.type, v: q.v || 0, s: 0, x: 0, z: 0, hx: 0, hz: 1, hp: base.hp * (lv.hpMul ?? 1), spd: base.spd * (lv.spdMul ?? 1), size: base.size,
      lit: 0, blocked: 0, stun: 0, blown: 0, slow: 1, flashed: true, wob: this.rnd() * 6.28, trait: null, summonT: 0 };
    if (q.type === 'boss') { const B = BOSSES[q.boss]; e.boss = q.boss; e.hp = B.hp * (lv.hpMul ?? 1); e.trait = B.trait; e.summon = B.summon; }
    e.max = e.hp; this.path.at(0, e); this.enemies.push(e); this.ev('spawn', { id: e.id, enemy: q.type });
    return e;
  }

  // light multiplier for an enemy: what bites, what bounces off
  mod(e, src) { // src: {focused, colored, firefly, dx, dz, flash}
    const kind = e.type === 'boss' ? e.trait : e.type;
    if (kind === 'color') return src.colored ? 1 : src.flash ? 0.3 : 0.1;
    if (kind === 'fat') return src.focused ? 1 : src.flash ? 0.5 : 0.15;
    if (kind === 'umbrella') {
      if (e.blown > 0 || src.firefly) return 1;
      if (src.flash) return 0.35;
      return (src.dx * e.hx + src.dz * e.hz) < -0.3 ? 0.06 : 1;   // light meeting it head-on is blocked
    }
    return 1;
  }
  hurt(e, dmg, x) {
    if (dmg <= 0) return;
    e.hp -= dmg; e.lit = 0.2;
    if (e.hp <= 0 && !e.dead) {
      e.dead = true; this.kills++; this.spark += (e.summoned ? 0 : ENEMIES[e.type].sparkle) * this.sparkRate; const sp = Math.floor(this.spark); this.spark -= sp; this.sparkles += sp;   // sparkles drop now and then
      this.ev('kill', { id: e.id, enemy: e.type, x: e.x, z: e.z, size: e.size, sparkle: sp, by: x });
    }
  }

  step(dt) {
    if (this.done) return;
    if (this._lightsDirty) {
      this.lights = [];
      this.tools.forEach((t, i) => { if (!t) return; const T = TOOLS[t.type];
        for (const L of toolLight(t.type, this.level.slots[i], t.dir, this.up[t.type] || 0)) this.lights.push({ ...L, slot: i, focused: !!T.focused, colored: !!T.colored, firefly: T.kind === 'aura', slow: T.slow || 1 }); });
      this._lightsDirty = false;
    }
    for (const t of this.tools) if (t && t.ready > 0) t.ready = Math.max(0, t.ready - dt);
    if (this.phase === 'prep') { this.prep -= dt; if (this.prep <= 0 && !this.level.waitStart) this.startNight(); return; }

    this.t += dt;
    while (this.spawnI < this.spawnQ.length && this.spawnQ[this.spawnI].t <= this.t && this.t < this.level.duration) this.spawn(this.spawnQ[this.spawnI++]);

    // --- lantern aim
    const P = this.lamp;
    if (!this.manual) {
      let best = null, bs = -1;
      for (const e of this.enemies) { if (e.dead || Math.hypot(e.x - this.tower.x, e.z - this.tower.z) > P.reach + P.radius * 0.5) continue; const m = this.mod(e, { dx: e.x - this.tower.x, dz: e.z - this.tower.z, n: 1 }); const sc = e.s + (m > 0.5 ? 1000 : m > 0.1 ? 500 : 0); if (sc > bs) { bs = sc; best = e; } }
      if (best) { this.want.x = best.x; this.want.z = best.z; }
      else { this.want.x = this.tower.x + Math.sin(this.t * 0.42) * 2.4; this.want.z = this.tower.z + 6 + Math.sin(this.t * 0.27) * 2.4; }
    }
    { const wx = this.want.x - this.tower.x, wz = this.want.z - this.tower.z, wd = Math.hypot(wx, wz);       // the light only reaches so far
      if (wd > P.reach) { this.want.x = this.tower.x + wx / wd * P.reach; this.want.z = this.tower.z + wz / wd * P.reach; } }
    { const dx = this.want.x - this.aim.x, dz = this.want.z - this.aim.z, d = Math.hypot(dx, dz), sp = (this.manual ? 3 : 1) * P.aimSpeed * dt;
      if (d <= sp) { this.aim.x = this.want.x; this.aim.z = this.want.z; } else { this.aim.x += dx / d * sp; this.aim.z += dz / d * sp; } }

    // --- flash ring
    this.charge = Math.min(1, this.charge + dt / P.flashEvery);
    let ringR = -1;
    if (this.flashT >= 0) { this.flashT += dt; ringR = this.flashT * WAVE_V; if (ringR > P.flashReach) { this.flashT = -1; ringR = -1; } }

    // --- enemies
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.lit = Math.max(0, e.lit - dt); e.blocked = Math.max(0, e.blocked - dt); e.stun = Math.max(0, e.stun - dt); e.blown = Math.max(0, e.blown - dt); e.slow = 1;
      const pad = e.size * 0.22;
      // lantern pool
      const d = Math.hypot(e.x - this.aim.x, e.z - this.aim.z);
      if (d < P.radius + pad) {
        let lx = e.x - this.tower.x, lz = e.z - this.tower.z; const ll = Math.hypot(lx, lz) || 1; lx /= ll; lz /= ll;
        const m = this.mod(e, { dx: lx, dz: lz });
        if (m < 0.2) e.blocked = 0.25;
        this.hurt(e, P.dps * m * (1 - 0.45 * Math.min(1, d / P.radius) ** 2) * dt, 'lamp');
      }
      // tools
      for (const L of this.lights) {
        const t = this.tools[L.slot]; if (!t || t.ready > 0 || e.dead) continue;
        if (!inLight(L, e.x, e.z, pad)) continue;
        const m = this.mod(e, L);
        if (m < 0.2) e.blocked = 0.25;
        if (L.slow < 1 && m > 0) e.slow = Math.min(e.slow, L.slow);
        this.hurt(e, L.dps * m * dt, t.type);
      }
      if (e.dead) continue;
      // shock ring
      if (ringR >= 0 && !e.flashed && Math.hypot(e.x - this.tower.x, e.z - this.tower.z) <= ringR) {
        e.flashed = true; const m = this.mod(e, { flash: true });
        if ((e.type === 'umbrella' || e.trait === 'umbrella')) { e.blown = 4; this.ev('blown', { id: e.id }); }
        e.stun = e.type === 'boss' ? 0.5 : 1.0;
        this.hurt(e, P.flashDmg * m * (e.type === 'boss' ? 1.6 : 1), 'flash');
        if (e.dead) continue;
      }
      // walk
      if (e.stun <= 0) e.s += e.spd * e.slow * dt;
      this.path.at(e.s, e);
      if (e.summon) { e.summonT += dt; if (e.summonT >= e.summon.every) { e.summonT = 0; const c = this.spawn({ type: e.summon.type, v: this.nextId }); c.summoned = true; c.s = Math.max(0, e.s - 0.9); this.path.at(c.s, c); } }
      if (e.s >= this.path.total) {
        e.dead = true; e.leak = true; const n = ENEMIES[e.type].windows || 1; this.leaked++;
        for (let i = 0; i < n && this.windows > 0; i++) { this.windows--; this.ev('window', { left: this.windows }); }
        this.ev('leak', { id: e.id, enemy: e.type });
      }
    }
    this.enemies = this.enemies.filter(e => !e.dead);

    if (this.windows <= 0) { this.phase = 'lost'; this.ev('lost'); return; }
    if (this.t >= this.level.duration) { // dawn: what is left of the night burns away
      for (const e of this.enemies) this.ev('kill', { id: e.id, enemy: e.type, x: e.x, z: e.z, size: e.size, sparkle: 0, by: 'dawn' });
      this.enemies = []; this.phase = 'won'; this.ev('won', { stars: this.stars });
    }
  }
}

// ---------- a simple player, for the automated play-through and balance runs ----------
export class Bot {
  constructor(sim, opt = {}) { this.sim = sim; this.skill = opt.skill ?? 1; this.placed = false; this.t = 0; }
  step(dt) {
    const s = this.sim, lv = s.level; this.t += dt;
    if (!this.placed) { // fill the slots with what the level teaches, each turned to cover the most path
      this.placed = true;
      const want = lv.hint ?? lv.tools; let k = 0;
      lv.slots.forEach((slot, i) => { if (!want.length) return; const type = want[k++ % want.length]; s.place(i, type); s.rotate(i, bestDir(s.path, type, slot, s.up[type] || 0).dir); });
      if (lv.waitStart) s.startNight();
    }
    if (s.phase !== 'night') return;
    if (s.canFlash()) {
      let near = 0, deep = 0;
      for (const e of s.enemies) { if (Math.hypot(e.x - s.tower.x, e.z - s.tower.z) < 9) near++; if (e.s > s.path.total * 0.72) deep++; }
      if (near >= 4 || deep >= 1 || s.enemies.some(e => e.type === 'umbrella' && e.s > s.path.total * 0.4)) s.flash();
    }
  }
}
