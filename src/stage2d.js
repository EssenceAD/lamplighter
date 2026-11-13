// 등불지기 — the 2D fallback theatre (Canvas 2D). Same interface as stage.js, same world and
// camera, flat silhouettes. Used when WebGL is missing or the device stays too slow even at
// the lowest 3D resolution, or when "가벼운 화면" is switched on in the settings.
import { clamp, WAVE_V, lampStats } from './sim.js';
import { buildWorld } from './world.js';
import { lookOf } from './looks.js';

const LOOK_H = { w_ant: 1.25, w_horn: 1.25, w_ear: 1.2, e_fast: 0.8, e_fat: 1.9, e_color: 1.05, e_umb: 1.75, boss_0: 3.3, boss_1: 2.9, boss_2: 3.2, boss_3: 3.2, boss_4: 3.0 };
const EYES = { w_ant: [[0.36, 0.6], [0.64, 0.6]], w_horn: [[0.33, 0.54], [0.67, 0.54]], w_ear: [[0.37, 0.45], [0.63, 0.45]], e_fast: [[0.7, 0.38]], e_fat: [[0.37, 0.22], [0.66, 0.22]], e_color: [[0.4, 0.4], [0.6, 0.4]], e_umb: [[0.27, 0.47], [0.47, 0.47]],
  boss_0: [[0.38, 0.38], [0.62, 0.38]], boss_1: [[0.13, 0.52]], boss_2: [[0.38, 0.3], [0.62, 0.3]], boss_3: [[0.38, 0.32], [0.62, 0.32]], boss_4: [[0.43, 0.3], [0.57, 0.3]] };
const TOOL_SHAPE = { mirror: ['t_mirror', 1.25], prism: ['t_prism', 1.0], lens: ['t_lens', 1.35], glass: ['t_glass', 1.15], jar: ['t_jar', 0.75] };
const TOOL_COL = { mirror: '255,220,150', prism: '200,225,255', lens: '255,180,80', glass: '120,255,235', jar: '190,255,100' };
const HOUSE_SET = [['house_a', 2.0], ['house_d', 3.1], ['house_c', 1.5], ['house_b', 1.7], ['house_e', 1.35]], HOUSE_POS = [[-2.75, -3.3], [2.75, -4.3], [2.9, 0.1], [-2.9, 0.5], [2.3, 2.9]];
const VILLAGE_IDS = ['h0', 'h1', 'well', 'h2', 'h3', 'plaza', 'h4'];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

export async function createStage2D(frame, SHAPES, opt = {}) {
  const cv = document.createElement('canvas'); frame.prepend(cv); const g = cv.getContext('2d');
  const paths = {}; const P = n => paths[n] ??= new Path2D(SHAPES[n].d);
  let W = 1, H = 1, dpr = 1, world = buildWorld(SHAPES, false), chapter = -1, mx = 1, skin = [255, 184, 102], clock = 0;
  const st = { freeze: 0, gather: 0, dawn: 0, dawnTarget: 0, flashT: -1, lost: 0, fade: 0, town: null, festival: 0, radius: 1.2, guideSlots: false, low: false, fps: 60 };
  let items = [], houses = [], tower = null, lantern = { x: 0, y: 3.7, z: -7 }, live = new Map(), ghosts = [], pops = [], bits = [], lastStop = -9;
  // the same camera as the 3D stage
  const eye = [0, 10.5, 15], tgt = [0, 2.2, -1.3]; let f, r, u, tanV = Math.tan(Math.PI / 10), aspect = 9 / 16;
  { const d = [tgt[0] - eye[0], tgt[1] - eye[1], tgt[2] - eye[2]], l = Math.hypot(...d); f = d.map(v => v / l); const rr = [-f[2], 0, f[0]], rl = Math.hypot(...rr); r = rr.map(v => v / rl); u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]]; }
  function proj(x, y, z) { const d = [x - eye[0], y - eye[1], z - eye[2]], zc = d[0] * f[0] + d[1] * f[1] + d[2] * f[2], xc = d[0] * r[0] + d[1] * r[1] + d[2] * r[2], yc = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
    return { x: (xc / (zc * tanV * aspect) * 0.5 + 0.5) * W, y: (-yc / (zc * tanV) * 0.5 + 0.5) * H, s: H / (2 * zc * tanV) }; }
  function resize() { H = innerHeight; W = Math.min(innerWidth, Math.round(H * 9 / 16)); frame.style.width = W + 'px'; frame.style.height = H + 'px'; dpr = Math.min(devicePixelRatio || 1, 1.5); cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    aspect = W / H; tanV = Math.tan(Math.PI / 10) * Math.max(1, 0.5625 / aspect); }
  addEventListener('resize', resize); resize();
  function setChapter(c) { if (c === chapter) return; chapter = c; mx = c % 2 ? -1 : 1; world = buildWorld(SHAPES, mx < 0);
    tower = { n: 'tower', x: world.tower.x, z: world.tower.z, h: 4.7 }; lantern = { x: world.tower.x, y: 3.75, z: world.tower.z + 0.3 };
    houses = HOUSE_POS.map(([x, z], i) => ({ n: HOUSE_SET[(i + c) % 5][0], h: HOUSE_SET[(i + c) % 5][1], x: x * mx, z, house: i, on: true, outT: -1 }));
    const T = [['tree_a', 2.9, -3.9, -5.6], ['tree_b', 2.5, 4.0, -1.9], ['tree_c', 2.0, -4.0, -1.3], ['tree_d', 2.1, 4.1, -6.2], ['bush', 1.5, -3.6, 2.8]];
    items = [tower, ...houses, ...T.map(([n, h, x, z], i) => ({ n: T[(i + c) % 5][0], h, x: x * mx, z })), { n: 'well', h: 1.05, x: -2.2 * mx, z: -1.9 }, { n: 'fence', h: 0.62, x: 3.3 * mx, z: 3.4 }]; }
  setChapter(opt.chapter ?? 0);
  function sil(n, x, z, h, fill, sx = 1, sy = 1, lift = 0) { const S = SHAPES[n], a = proj(x, lift, z), k = a.s * h / S.h; g.save(); g.translate(a.x, a.y); g.scale(k * sx, k * sy); g.translate(-S.w / 2, -S.h); g.fillStyle = fill; g.fill(P(n), 'evenodd'); g.restore(); return { a, k, S }; }
  function groundPoly(pts) { g.beginPath(); pts.forEach(([x, z], i) => { const p = proj(x, 0, z); i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); }); }
  const circlePts = (cx, cz, rad, n = 28) => Array.from({ length: n }, (_, i) => [cx + Math.cos(i / n * 6.283) * rad, cz + Math.sin(i / n * 6.283) * rad]);

  function reset(sim) { live.clear(); ghosts = []; pops = []; bits = []; st.dawn = 0; st.dawnTarget = 0; st.flashT = -1; st.lost = 0; st.gather = 0; st.town = null; st.festival = 0; for (const h of houses) { h.on = true; h.outT = -1; }
    if (sim) st.radius = lampStats(sim.up).radius; }
  function burst(x, y, n, cols) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, sp = 40 + Math.random() * 110; bits.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 90, t: 0, c: cols[i % cols.length], s: 5 + Math.random() * 4, r: Math.random() * 6 }); } }
  function onEvent(e) {
    if (e.type === 'kill') { const m = live.get(e.id); live.delete(e.id); if (m) ghosts.push({ ...m, t: 0, x: e.x, z: e.z }); if (clock - lastStop > 0.7 && e.by !== 'dawn') { lastStop = clock; st.freeze = 0.05; } }
    else if (e.type === 'leak') live.delete(e.id);
    else if (e.type === 'window') { const h = houses.find(x => x.on); if (h) { h.on = false; h.outT = clock; } }
    else if (e.type === 'flash') st.flashT = 0; else if (e.type === 'won') st.dawnTarget = 1; else if (e.type === 'lost') st.lost = 0.001;
  }
  const pick = (cx, cy) => { const b = cv.getBoundingClientRect(), nx = ((cx - b.left) / b.width * 2 - 1) * tanV * aspect, ny = -((cy - b.top) / b.height * 2 - 1) * tanV;
    const d = [f[0] + r[0] * nx + u[0] * ny, f[1] + r[1] * nx + u[1] * ny, f[2] + r[2] * nx + u[2] * ny]; if (d[1] >= 0) return null; const t = -eye[1] / d[1]; return { x: eye[0] + d[0] * t, z: eye[2] + d[2] * t }; };
  function slotAt(cx, cy, slots) { const p = pick(cx, cy); if (!p) return -1; let best = -1, bd = 0.62; slots.forEach((s, i) => { const d = Math.hypot(s.x - p.x, s.z + 0.35 - p.z); if (d < bd) { bd = d; best = i; } }); return best; }
  const CH = [[1, 0.27, 0.12], [1, 0.62, 0.16], [0.99, 0.92, 0.74]].map(c => `rgb(${c.map(v => Math.round(v * 255))})`), FEST = ['#ff5555', '#ffcc33', '#66e6b3', '#99b3ff', '#ff99e6'];

  function frameUpdate(dt, sim) {
    if (st.freeze > 0) { st.freeze -= dt; dt = 0; } clock += dt; const ti = performance.now() / 1000;
    if (dt > 0) st.fps = st.fps * 0.9 + (1 / dt) * 0.1;
    const town = st.town; if (st.festival > 0) st.festival = Math.min(1, st.festival + dt / 4);
    st.dawn += clamp((town ? (st.festival > 0 ? 1 : 0) : st.dawnTarget) - st.dawn, -dt / 4, dt / 3.5); const D = st.dawn * st.dawn * (3 - 2 * st.dawn);
    if (st.lost > 0) st.lost = Math.min(1, st.lost + dt / 2.5); if (st.flashT >= 0) { st.flashT += dt; if (st.flashT > 4) st.flashT = -1; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // sky and ground
    const hz = proj(0, 0, -60).y, sky = g.createLinearGradient(0, 0, 0, H * 0.4); sky.addColorStop(0, `rgb(${mix([8, 12, 46], [92, 78, 140], D)})`); sky.addColorStop(1, `rgb(${mix([30, 44, 120], [255, 170, 110], D)})`); g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const prog = sim ? sim.progress : 0.25; g.fillStyle = `rgba(255,243,207,${1 - 0.6 * D})`; g.beginPath(); g.arc(W * (0.15 + 0.7 * prog), H * (0.07 + 0.05 * Math.pow(prog * 2 - 1, 2) + 0.03 * D), W * 0.03, 0, 6.283); g.fill();
    for (const [n, z, h, y, c1, c2] of [['ridge', -14, 3.0 * 0.72, 1.3, [50, 66, 130], [210, 154, 146]], ['hill_far', -12.5, 1.36, 1.15, [42, 56, 112], [176, 127, 142]], ['hill_pines', -11, 1.43, 0.45, [34, 46, 96], [138, 101, 133]], ['hill_grass', -9.5, 1.05, 0, [28, 36, 80], [95, 74, 112]]]) {
      const S = SHAPES[n], a = proj(0, y, z), k = a.s * h / S.h, kx = a.s * 16 / S.w; g.save(); g.translate(a.x, a.y); g.scale(kx, k); g.translate(-S.w / 2, -S.h); g.fillStyle = `rgb(${mix(c1, c2, D)})`; g.fill(P(n)); g.restore(); }
    const g0 = proj(0, 0, -9.4).y; const gr = g.createLinearGradient(0, g0, 0, H); gr.addColorStop(0, `rgb(${mix([40, 50, 100], [150, 120, 140], D)})`); gr.addColorStop(1, `rgb(${mix([22, 28, 64], [110, 84, 110], D)})`); g.fillStyle = gr; g.fillRect(0, g0, W, H - g0);
    // path
    g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = `rgb(${mix([118, 112, 140], [243, 214, 180], D)})`;
    const pp = world.path.pts; for (let i = 1; i < pp.length; i++) { const a = proj(pp[i - 1].x, 0, pp[i - 1].z), b = proj(pp[i].x, 0, pp[i].z); g.lineWidth = Math.max(2, b.s * 1.05); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
    const lampOn = (1 - clamp((st.dawn - 0.15) / 0.65)) * (1 - st.lost * 0.9), sk = skin.join(',');
    // slots, tool light, lantern pool
    if (sim) {
      sim.level.slots.forEach(s => { groundPoly(circlePts(s.x, s.z, 0.42, 12)); g.fillStyle = 'rgba(190,196,230,.55)'; g.fill(); });
      for (const L of sim.lights) { const t = sim.tools[L.slot], al = (t && t.ready <= 0 ? 0.42 : 0.12) * (1 - D); g.fillStyle = `rgba(${TOOL_COL[t.type]},${al})`;
        if (L.kind === 'disc') { groundPoly(circlePts(L.x, L.z, L.r)); g.fill(); } else { const nx = -L.dz * L.hw, nz = L.dx * L.hw; groundPoly([[L.x0 + nx, L.z0 + nz], [L.x1 + nx, L.z1 + nz], [L.x1 - nx, L.z1 - nz], [L.x0 - nx, L.z0 - nz]]); g.fill(); } }
    }
    const aim = sim && sim.phase !== 'prep' ? sim.aim : { x: world.tower.x + Math.sin(ti * 0.42) * 2.5, z: world.tower.z + 6 + Math.sin(ti * 0.27) * 2.6 };
    if (lampOn > 0.02) { const c = proj(aim.x, 0, aim.z), L = proj(lantern.x, lantern.y, lantern.z), rx = c.s * st.radius * 1.15, k = lampOn * (1 - 0.5 * st.gather);
      g.fillStyle = `rgba(${sk},${0.13 * k})`; g.beginPath(); g.moveTo(L.x, L.y); g.lineTo(c.x - rx, c.y); g.lineTo(c.x + rx, c.y); g.closePath(); g.fill();
      g.save(); g.translate(c.x, c.y); g.scale(1, 0.48); const rg = g.createRadialGradient(0, 0, 0, 0, 0, rx); rg.addColorStop(0, `rgba(255,235,190,${0.85 * k})`); rg.addColorStop(0.7, `rgba(${sk},${0.5 * k})`); rg.addColorStop(1, `rgba(${sk},0)`); g.fillStyle = rg; g.beginPath(); g.arc(0, 0, rx, 0, 6.283); g.fill(); g.restore(); }
    if (st.flashT >= 0 && st.flashT < 1.4) { groundPoly(circlePts(world.tower.x, world.tower.z + 0.3, st.flashT * WAVE_V, 48)); g.closePath(); g.lineWidth = 3; g.strokeStyle = `rgba(255,225,160,${1 - st.flashT / 1.4})`; g.stroke(); }
    // everything that stands, back to front
    const draw = items.map(it => ({ z: it.z, it }));
    if (sim) { sim.tools.forEach((t, i) => { if (t) draw.push({ z: sim.level.slots[i].z + 0.05, tool: t, slot: sim.level.slots[i] }); });
      for (const e of sim.enemies) { if (!live.has(e.id)) live.set(e.id, { look: lookOf(e) }); draw.push({ z: e.z, e }); } }
    for (const gh of ghosts) draw.push({ z: gh.z, gh });
    if (town) { const spots = [...houses.map(h => [h.x + 0.9 * mx * (h.x * mx > 0 ? -1 : 1), h.z + 0.5]), [-1.4 * mx, -1.4], [1.6 * mx, 3.6]];
      [['v_old', 0], ['v_woman', 1], ['v_child', 5], ['v_music', 2], ['v_music2', 3], ['v_old', 6], ['v_woman', 4]].forEach(([n, si], k) => { if (town.lit.has(si < 5 ? 'h' + si : si === 5 ? 'well' : 'plaza')) draw.push({ z: spots[si][1], folk: n, x: spots[si][0], k }); });
      for (const [id, x, z] of [['well', -2.2 * mx, -1.9], ['plaza', 3.3 * mx, 3.4]]) if (town.lit.has(id)) { const c = proj(x, 0.9, z), rr = c.s * 0.8, rg = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, rr); rg.addColorStop(0, 'rgba(255,190,100,.7)'); rg.addColorStop(1, 'rgba(255,190,100,0)'); g.fillStyle = rg; g.beginPath(); g.arc(c.x, c.y, rr, 0, 6.283); g.fill(); } }
    draw.sort((a, b) => a.z - b.z);
    const dark = `rgb(${mix([22, 22, 44], [48, 36, 58], D)})`;
    for (const d of draw) {
      if (d.it) { const it = d.it; let lit = it.house != null || it === tower ? 1 - clamp((st.dawn - 0.3) / 0.6) : 0;
        if (it.house != null) { if (town) lit *= town.lit.has('h' + it.house) ? 1 : 0; else if (!it.on) { const tb = clock - it.outT; lit *= tb < 1.5 ? (Math.floor(tb / 0.25) % 2 ? 1 : 0.06) : 0; } }
        if (it === tower) lit *= lampOn;
        if (lit > 0.02) { const S = SHAPES[it.n], a = proj(it.x, 0, it.z), k = a.s * it.h / S.h; g.fillStyle = `rgba(255,170,70,${0.9 * lit * (1 - st.lost * 0.9)})`; g.fillRect(a.x - S.w * k * 0.42, a.y - S.h * k * (it === tower ? 0.95 : 0.6), S.w * k * 0.84, S.h * k * (it === tower ? 0.9 : 0.55)); }
        sil(it.n, it.x, it.z, it.h, dark); }
      else if (d.tool) { const [n, h] = TOOL_SHAPE[d.tool.type]; sil(n, d.slot.x, d.slot.z, h, 'rgb(40,42,74)'); }
      else if (d.folk) { const hop = st.festival > 0 ? Math.abs(Math.sin(ti * 4 + d.k)) * 0.22 : 0; sil(d.folk, d.x, d.z, 1.05, 'rgb(26,24,48)', 1, 1, hop); }
      else { const e = d.e, gh = d.gh, look = e ? live.get(e.id).look : gh.look, h = LOOK_H[look], x = e ? e.x : gh.x, z = e ? e.z : gh.z; let sx = 1, sy = 1, lift = 0, rim = e && (e.type === 'color' || e.trait === 'color') ? '64,255,217' : '153,128,255';
        if (e) { const hop = e.stun > 0 ? 0 : Math.abs(Math.sin(clock * (5 + e.spd * 2.4) + e.wob)); sx = 1 + 0.07 * (0.5 - hop); sy = 1 - 0.09 * (0.5 - hop); lift = hop * 0.1; if (e.blocked > 0 || e.lit > 0.12) rim = '255,255,255'; }
        else { gh.t += dt; const k = Math.sin(clamp(gh.t / 0.1) * Math.PI / 2); sx = 1 + 0.42 * k; sy = 1 - 0.46 * k; if (gh.t >= 0.2) rim = '255,255,255'; }
        sil(look, x, z, h * 1.06, `rgba(${rim},.95)`, sx, sy, lift); const o = sil(look, x, z, h, 'rgb(13,12,24)', sx, sy, lift + 0.02);
        for (const [fx, fy] of EYES[look]) { const ex = o.a.x + (fx - 0.5) * o.S.w * o.k * sx, ey = o.a.y - (1 - fy) * o.S.h * o.k * sy, er = Math.max(1.5, o.S.h * o.k * 0.075); g.fillStyle = '#ffab2b'; g.beginPath(); g.arc(ex, ey, er, 0, 6.283); g.fill(); g.fillStyle = '#0d0c14'; g.beginPath(); g.arc(ex, ey + er * 0.12, er * 0.42, 0, 6.283); g.fill(); }
        if (e && (e.max > 40 || e.type === 'boss' || e.type === 'fat')) { const w = Math.min(60, o.S.w * o.k * 0.8), y = o.a.y - o.S.h * o.k - 9; g.fillStyle = '#0b0a14'; g.fillRect(o.a.x - w / 2 - 1, y - 1, w + 2, 6); g.fillStyle = '#ffb340'; g.fillRect(o.a.x - w / 2, y, w * clamp(e.hp / e.max), 4); }
        if (gh && gh.t >= 0.28) { const c = proj(x, h * 0.5, z); pops.push({ x: c.x, y: c.y, t: 0, r: c.s * h * 0.85 }); burst(c.x, c.y, 9, CH); gh.done = true; } }
    }
    ghosts = ghosts.filter(x => !x.done);
    for (const p of pops) { p.t += dt; const a = p.t / 0.34; if (a < 1) { g.strokeStyle = `rgba(255,247,224,${1 - a})`; g.lineWidth = 2.5; g.beginPath(); g.arc(p.x, p.y, p.r * (0.2 + 0.8 * (1 - Math.pow(1 - a, 3))), 0, 6.283); g.stroke(); } } pops = pops.filter(p => p.t < 0.34);
    for (const b of bits) { b.t += dt; b.vy += 260 * dt; b.vx *= 1 - 1.5 * dt; b.x += b.vx * dt; b.y += b.vy * dt; g.save(); g.translate(b.x, b.y); g.rotate(b.r + b.t * 7); g.globalAlpha = clamp(2 - b.t); g.fillStyle = '#0f0e18'; g.fillRect(-b.s / 2 - 1, -b.s / 2 - 1, b.s + 2, b.s + 2); g.fillStyle = b.c; g.fillRect(-b.s / 2, -b.s / 2, b.s, b.s); g.restore(); } bits = bits.filter(b => b.t < 2);
    if (st.festival > 0 && Math.random() < 0.05) burst(W * (0.2 + Math.random() * 0.6), H * (0.25 + Math.random() * 0.3), 12, FEST);
    const dim = 0.5 * st.gather + 0.45 * st.lost + (1 - (st.fade = Math.min(1, st.fade + dt / 0.8))); if (dim > 0.01) { g.fillStyle = `rgba(5,6,15,${clamp(dim)})`; g.fillRect(0, 0, W, H); }
  }
  return { kind: '2d', setChapter, reset, onEvent, frame: frameUpdate, pickGround: pick, slotAt, toScreen: (x, y, z) => proj(x, y, z), setTown: (lit, fest) => { reset(null); st.town = { lit: new Set(lit) }; st.festival = fest ? 0.001 : 0; },
    celebrate: () => burst(W / 2, H * 0.35, 30, FEST), resize, st, setSkin: c => { skin = c.map(v => Math.round(v * 255)); }, setGather: k => { st.gather = k; }, get world() { return world; },
    info: () => ({ fps: st.fps, pixelRatio: dpr, calls: 0, tris: 0 }), fadeIn: () => { st.fade = 0; }, dispose: () => { removeEventListener('resize', resize); cv.remove(); } };
}
