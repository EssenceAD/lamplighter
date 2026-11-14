// 등불지기 — the board as folded paper craft (DESIGN.md §3 camera, §4 art). Stage 1: a still look-dev of map 1.
// Everything on the land is an angular folded solid with flat faces, real paper-scan grain and a pale line on its folds.
// Only the sea waves are flat cut sheets. One light casts shadows (the moon); lanterns, windows and lamps are amber point lights.
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { rng, LANES, SLOTS, TOWER } from './game.js';

const TILT = THREE.MathUtils.degToRad(55), HALF_W = 4.55, SEA_Z = 4.25, SEA_AT = 0.865;   // orthographic, 55 degrees down, shore at 86.5 % of the height
const FACE = -(Math.PI / 2 - TILT);                                                       // a flat piece turned to face the camera (eyes, bars, waves)

export async function createStage(frame, SHAPES) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  frame.prepend(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x070a1c);
  const camera = new THREE.OrthographicCamera(-HALF_W, HALF_W, 8, -8, 1, 120);
  const TL = new THREE.TextureLoader(), tex = (url, srgb = true) => new Promise((res, rej) => TL.load(url, t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.6, 1.6); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; res(t); }, undefined, rej));
  const [paper, paperN, pLight] = await Promise.all([tex('./assets/paper/Paper001_Color.jpg'), tex('./assets/paper/Paper003_NormalGL.jpg', false), tex('./assets/particles/light_01.png')]); pLight.repeat.set(1, 1);

  // ---------- paper ----------
  const mats = new Map(), lines = new Map(), r0 = rng(77);
  const grain = m => { m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= clamp( 1.0 + ( texture2D( map, vMapUv ).g - texture2D( map, vMapUv, 5.0 ).g ) * 4.0, 0.55, 1.5 );'); }; return m; };
  const pm = col => { if (!mats.has(col)) mats.set(col, grain(new THREE.MeshLambertMaterial({ color: col, map: paper, flatShading: true }))); return mats.get(col); };
  const glow = (r, g, b) => grain(new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), map: paper }));   // lit paper: lamps, windows, eyes, effects
  const foldLine = col => { if (!lines.has(col)) lines.set(col, new THREE.LineBasicMaterial({ color: new THREE.Color(col).lerp(new THREE.Color(0xdfe6ff), 0.22), transparent: true, opacity: 0.5 })); return lines.get(col); };
  // one folded piece: a flat-shaded solid with a pale line along every fold
  const piece = (geo, col, x, y, z, o = {}) => { const m = new THREE.Mesh(geo, typeof col === 'number' ? pm(col) : col); m.position.set(x, y, z); if (o.r) m.rotation.set(o.r[0], o.r[1], o.r[2]); if (o.s) m.scale.set(o.s[0], o.s[1], o.s[2]);
    m.castShadow = o.cast ?? typeof col === 'number'; m.receiveShadow = typeof col === 'number'; (o.to || scene).add(m); if (typeof col === 'number' && o.fold !== false) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 22), foldLine(col))); return m; };
  const G = { box: (w, h, d) => new THREE.BoxGeometry(w, h, d), cyl: (a, b, h, n) => new THREE.CylinderGeometry(a, b, h, n), cone: (r, h, n) => new THREE.ConeGeometry(r, h, n), ico: r => new THREE.IcosahedronGeometry(r, 0), oct: r => new THREE.OctahedronGeometry(r, 0),
    roof: (w, d, h) => { const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]), g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2); return g; } };
  const group = (x, z, ry = 0) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g); return g; };
  const lamps = [];
  const lamp = (x, y, z, power = 5, reach = 3.4) => { const l = new THREE.PointLight(0xffa348, power, reach, 1.5); l.position.set(x, y, z); scene.add(l); lamps.push({ l, power, ph: lamps.length * 1.7 });
    const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: pLight, color: 0xff9a3c, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.4 })); h.position.set(x, y, z); h.scale.setScalar(0.5 + power * 0.05); scene.add(h); return l; };
  const AMBER = glow(1.5, 0.86, 0.3), FLAME = glow(1.7, 1.1, 0.42), WINDOW = glow(1.25, 0.72, 0.24);

  // ---------- land: dark blue paper sheets with real thickness, a cream road, build spots ----------
  { const g = new THREE.PlaneGeometry(60, 60); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, grain(new THREE.MeshLambertMaterial({ color: 0x161c40, map: paper, normalMap: paperN }))); m.receiveShadow = true; scene.add(m); }
  const sheet = (pts, y, col, seed, thick = 0.035) => { const r = rng(seed), o = [];
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], d = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(2, Math.round(d / 0.2)), nx = (b[1] - a[1]) / d, nz = -(b[0] - a[0]) / d;
      for (let j = 0; j < k; j++) { const t = j / k, w = Math.sin((i * 7 + t * d) * 1.9 + seed) * 0.09 + (r() - 0.5) * 0.1; o.push(new THREE.Vector2(a[0] + (b[0] - a[0]) * t + nx * w, -(a[1] + (b[1] - a[1]) * t + nz * w))); } }
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(o), { depth: thick, bevelEnabled: false }); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, [grain(new THREE.MeshLambertMaterial({ color: col, map: paper, normalMap: paperN })), pm(0x8f97c4)]); m.position.y = y; m.receiveShadow = true; m.castShadow = true; scene.add(m); };
  sheet([[-5.4, -9.6], [5.4, -9.7], [5.5, -1], [5.4, 4.2], [1.5, 4.32], [-1.5, 4.12], [-5.4, 4.28], [-5.5, -0.5]], 0.0, 0x1e2650, 3);
  sheet([[-5.6, -9.9], [5.6, -9.9], [5.6, -4.7], [2.6, -4.4], [0.4, -4.85], [-2.4, -4.45], [-5.6, -4.8]], 0.035, 0x262d5a, 8);
  sheet([[-5.6, 3.55], [-2.6, 3.85], [-0.2, 3.5], [2.2, 3.8], [5.6, 3.55], [5.6, 4.9], [-5.6, 4.9]], 0.035, 0x2b3158, 13);
  sheet([[-3.3, -1.3], [-1.2, -0.95], [-0.1, -1.05], [0.75, -0.2], [0.6, 0.75], [-0.9, 0.95], [-2.6, 0.9], [-3.6, 0.1]], 0.035, 0x1d3052, 21);
  sheet([[1.9, 1.2], [3.9, 1.0], [4.5, 2.6], [3.2, 3.3], [1.6, 2.9]], 0.035, 0x1d3052, 34);
  { const mat = grain(new THREE.MeshLambertMaterial({ color: 0xa2978a, map: paper, normalMap: paperN })), under = pm(0x8f97c4);   // the road: one cream strip, torn edges, a pale underside showing
    const strip = (L, hw, y, m) => { const P = L.pts, pos = [], uv = [], e = [];
      for (let i = 0; i < P.length; i++) { const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], d = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = -(b.z - a.z) / d, nz = (b.x - a.x) / d, q = rng(Math.round(P[i].x * 31 + P[i].z * 57) * 13 + 7);
        const wl = hw + (q() - 0.5) * 0.07, wr = hw + (q() - 0.5) * 0.07; e.push([P[i].x + nx * wl, P[i].z + nz * wl, P[i].x - nx * wr, P[i].z - nz * wr]); }
      for (let i = 0; i < e.length - 1; i++) { const a = e[i], b = e[i + 1], q = [[a[0], a[1]], [a[2], a[3]], [b[0], b[1]], [b[2], b[3]]]; for (const k of [0, 2, 1, 1, 2, 3]) { pos.push(q[k][0], y, q[k][1]); uv.push(q[k][0] * 0.5, q[k][1] * 0.5); } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); const s = new THREE.Mesh(g, m); s.receiveShadow = true; scene.add(s); };
    for (const L of LANES) strip(L, 0.53, 0.076, under); for (const L of LANES) strip(L, 0.48, 0.084, mat); }
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.25, 0.7, 0.2), transparent: true, opacity: 0.9 }), rings = [];
  const BUILT = { 4: 'archer', 1: 'barracks', 2: 'lens', 5: 'beacon' };
  SLOTS.forEach((s, i) => { piece(G.cyl(0.44, 0.5, 0.07, 6), 0x4c5488, s.x, 0.11, s.z, { r: [0, i * 0.5, 0] }); if (BUILT[i]) return;
    const r = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.31, 6), ringMat); r.rotation.x = -Math.PI / 2; r.position.set(s.x, 0.152, s.z); scene.add(r); rings.push(r); });

  // ---------- folded buildings, trees, rocks ----------
  const house = (x, z, w, h, d, ry, body, roofC, lit = 2) => { const g = group(x, z, ry); piece(G.box(w, h, d), body, 0, h / 2 + 0.03, 0, { to: g }); piece(G.roof(w * 1.12, d * 1.1, w * 0.55), roofC, 0, h + 0.03, 0, { to: g });
    piece(G.box(0.14, 0.3, 0.14), body, w * 0.25, h + w * 0.42, -d * 0.2, { to: g });
    for (let i = 0; i < lit; i++) piece(new THREE.PlaneGeometry(w * 0.18, h * 0.3), WINDOW, (i - (lit - 1) / 2) * w * 0.42, h * 0.58, d / 2 + 0.012, { to: g });
    piece(new THREE.PlaneGeometry(w * 0.2, h * 0.42), pm(0x3a2c3c), -w * 0.02 + (lit === 1 ? w * 0.28 : 0), h * 0.24, d / 2 + 0.011, { to: g, cast: false }); return g; };
  const tree = (x, z, s = 1, col = 0x3a6478) => { const g = group(x, z, r0() * 3); piece(G.cyl(0.05 * s, 0.07 * s, 0.3 * s, 5), 0x3a3148, 0, 0.15 * s, 0, { to: g });
    for (let i = 0; i < 3; i++) piece(G.cone((0.42 - i * 0.1) * s, 0.5 * s, 6), col, 0, (0.5 + i * 0.3) * s, 0, { to: g, r: [0, i * 0.5, 0] }); };
  const rock = (x, z, s, col = 0x666e98) => piece(G.ico(s), col, x, s * 0.45, z, { s: [1.1, 0.7, 0.9], r: [r0(), r0() * 3, r0()] });
  const HB = [0x8086a6, 0x8c849e, 0x8490a6, 0x948a9e], HR = [0x8a5a6c, 0x5f6c9c, 0x92626e, 0x66709c];
  [[-3.6, -5.5, 1.25, 0.95, 1.0, 0.1], [-1.9, -5.75, 0.95, 1.7, 0.9, -0.05], [-0.1, -5.45, 1.2, 0.9, 1.0, 0.04], [1.7, -5.7, 1.35, 1.1, 1.0, -0.08], [3.5, -5.5, 1.15, 0.9, 1.0, 0.06],
    [-2.9, -7.4, 1.3, 1.2, 1.0, 0.03], [-0.9, -7.6, 1.1, 1.0, 1.0, -0.04], [1.0, -7.4, 1.25, 1.5, 0.95, 0.05], [3.0, -7.6, 1.2, 1.0, 1.0, -0.03]].forEach(([x, z, w, h, d, ry], i) => house(x, z, w, h, d, ry, HB[i % 4], HR[i % 4], 1 + (i % 2)));
  for (const [x, z] of [[-3.2, -4.75], [0.9, -4.7], [2.9, -4.75]]) lamp(x, 0.7, z, 3.2, 3.2);                                 // window light spilling on the village ground
  for (const [x, z, s] of [[-4.5, -4.2, 1.2], [4.4, -3.9, 1.1], [-4.4, 0.7, 1.0], [4.4, 1.3, 1.0], [4.2, -1.7, 0.9], [-4.6, -2.6, 1.1], [-4.2, -6.6, 1.2], [4.5, -6.7, 1.3], [0.1, -8.6, 1.2], [-1.9, -8.9, 1.4], [2.2, -8.8, 1.3], [-4.3, -8.7, 1.5], [4.3, -8.9, 1.4]]) tree(x, z, s);
  rock(-4.3, 2.9, 0.55); rock(3.9, -0.9, 0.35); rock(-3.9, -3.9, 0.3);
  // folded mountains closing the top of the picture
  for (const [x, z, r, h, c] of [[-3.4, -11.2, 2.6, 2.6, 0x303866], [0.6, -11.8, 3.2, 3.4, 0x2c3460], [4.0, -11.0, 2.4, 2.4, 0x323a68], [-1.2, -13.6, 3.6, 3.8, 0x282f58], [3.0, -14.0, 3.4, 3.4, 0x282f58], [-4.6, -14.2, 3.2, 3.2, 0x242a50], [0.4, -16.5, 4.6, 4.4, 0x20264a], [-4.4, -17, 4, 4, 0x20264a], [4.6, -17, 4, 4, 0x20264a]]) piece(G.cone(r, h, 5), c, x, h / 2, z, { r: [0, r0() * 2, 0] });

  // ---------- lighthouse on its rock ----------
  { const g = group(TOWER.x, TOWER.z); piece(G.ico(0.95), 0x5c648e, 0, 0.3, 0.1, { to: g, s: [1.25, 0.6, 1.0], r: [0.3, 0.6, 0] }); piece(G.ico(0.5), 0x687098, 0.75, 0.2, 0.45, { to: g, s: [1, 0.7, 1] });
    piece(G.cyl(0.3, 0.46, 2.0, 8), 0xb9b4c4, 0, 1.55, 0, { to: g }); piece(G.cyl(0.39, 0.42, 0.42, 8), 0x9a4a52, 0, 1.3, 0, { to: g }); piece(G.cyl(0.46, 0.42, 0.1, 8), 0x565c86, 0, 2.6, 0, { to: g });
    piece(G.cyl(0.25, 0.25, 0.4, 8), FLAME, 0, 2.85, 0, { to: g }); piece(G.cone(0.38, 0.42, 8), 0x9a4a52, 0, 3.26, 0, { to: g }); lamp(TOWER.x, 2.9, TOWER.z, 9, 5.5); }

  // ---------- the four towers (one of each on four of the eight spots) ----------
  const TW = {
    archer: g => { piece(G.cyl(0.33, 0.45, 1.0, 4), 0xa98463, 0, 0.64, 0, { to: g, r: [0, Math.PI / 4, 0] }); piece(G.box(0.86, 0.09, 0.86), 0x8a6a52, 0, 1.18, 0, { to: g }); piece(G.box(0.6, 0.3, 0.6), 0xb89270, 0, 1.36, 0, { to: g });
      piece(G.cone(0.66, 0.55, 4), 0xa8504a, 0, 1.78, 0, { to: g, r: [0, Math.PI / 4, 0] }); piece(G.box(0.12, 0.18, 0.12), AMBER, 0.5, 1.2, 0.3, { to: g }); return [0.5, 1.2, 0.3]; },
    barracks: g => { piece(G.box(0.95, 0.62, 0.8), 0xa7a2bc, 0, 0.45, 0, { to: g }); piece(G.roof(1.08, 0.9, 0.5), 0x56679c, 0, 0.76, 0, { to: g }); piece(new THREE.PlaneGeometry(0.26, 0.4), WINDOW, 0, 0.36, 0.412, { to: g });
      piece(G.box(0.04, 0.6, 0.04), 0x5a4a52, 0.34, 1.38, 0, { to: g }); piece(G.roof(0.34, 0.02, 0.2), 0xd8452a, 0.52, 1.5, 0, { to: g, r: [0, 0, -Math.PI / 2] }); return [0, 0.5, 0.6]; },
    lens: g => { piece(G.cyl(0.34, 0.46, 0.85, 8), 0x8f9ac0, 0, 0.56, 0, { to: g }); piece(G.cyl(0.42, 0.38, 0.1, 8), 0x6f7aa6, 0, 1.02, 0, { to: g });
      const ring = piece(new THREE.TorusGeometry(0.36, 0.07, 4, 10), 0xc9a45a, 0, 1.5, 0, { to: g, r: [FACE * 0.5, 0, 0] }); piece(new THREE.CircleGeometry(0.31, 10), glow(0.95, 1.05, 1.2), 0, 0, 0.01, { to: ring });
      piece(G.box(0.1, 0.16, 0.1), AMBER, 0.38, 0.7, 0.28, { to: g }); return [0.38, 0.7, 0.3]; },
    beacon: g => { piece(G.cyl(0.3, 0.44, 0.62, 6), 0x9a93ae, 0, 0.45, 0, { to: g }); piece(G.cyl(0.46, 0.26, 0.24, 6), 0x5a5470, 0, 0.88, 0, { to: g });
      piece(G.oct(0.27), FLAME, 0, 1.24, 0, { to: g, s: [1, 1.7, 1] }); piece(G.oct(0.17), glow(1.9, 0.75, 0.2), 0.12, 1.12, 0.1, { to: g, s: [1, 1.5, 1] }); return [0, 1.2, 0]; },
  };
  for (const [i, t] of Object.entries(BUILT)) { const s = SLOTS[i], g = group(s.x, s.z), p = TW[t](g); lamp(s.x + p[0], p[1], s.z + p[2], 4.2, 3.0); }
  // paper lantern posts along the road
  for (const [x, z] of [[-3.15, 2.9], [1.4, 3.5], [-0.85, 2.1], [1.8, 1.05], [1.25, -2.25], [-1.55, -1.05], [-2.9, -3.3], [-0.35, -4.2]]) { const g = group(x, z); piece(G.box(0.06, 0.95, 0.06), 0x5a5078, 0, 0.5, 0, { to: g }); piece(G.box(0.34, 0.05, 0.05), 0x5a5078, 0.14, 0.95, 0, { to: g });
    piece(G.cyl(0.1, 0.1, 0.24, 6), AMBER, 0.28, 0.76, 0, { to: g }); piece(G.cone(0.13, 0.08, 6), 0x7a4a52, 0.28, 0.92, 0, { to: g }); lamp(x + 0.28, 0.72, z + 0.05, 4.6, 3.2); }

  // ---------- characters: folded paper, round amber eyes, a health bar over every head ----------
  const EYE = glow(1.5, 0.84, 0.22), PUPIL = new THREE.MeshBasicMaterial({ color: 0x120e1c }), GLINT = new THREE.MeshBasicMaterial({ color: 0xfff6e0 });
  const eyes = (g, y, z, gap, r) => { for (const s of [-1, 1]) { const e = piece(new THREE.CircleGeometry(r, 16), EYE, s * gap, y, z, { to: g, r: [FACE, 0, 0] }); piece(new THREE.CircleGeometry(r * 0.45, 12), PUPIL, 0, -r * 0.08, 0.004, { to: e }); piece(new THREE.CircleGeometry(r * 0.18, 8), GLINT, r * 0.25, r * 0.28, 0.008, { to: e }); } };
  const barBack = new THREE.MeshBasicMaterial({ color: 0x0b0a14 }), barEnemy = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.5, 0.16) }), barAlly = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 0.95, 0.55) });
  const bar = (g, y, w, k, ally) => { const b = piece(new THREE.PlaneGeometry(w + 0.06, 0.13), barBack, 0, y, 0, { to: g, r: [FACE, 0, 0] }); piece(new THREE.PlaneGeometry(w * k, 0.075), ally ? barAlly : barEnemy, -w * (1 - k) / 2, 0, 0.004, { to: b }); };
  const UNIT = {
    fry: (g, c = 0x8d84dc) => { piece(G.ico(0.4), c, 0, 0.4, 0, { to: g, s: [1.05, 0.95, 0.95], r: [0.2, 0.4, 0] }); piece(G.cone(0.13, 0.26, 4), c, 0, 0.84, -0.05, { to: g }); piece(G.cone(0.1, 0.22, 4), c, -0.42, 0.34, 0, { to: g, r: [0, 0, 1.2] }); piece(G.cone(0.1, 0.22, 4), c, 0.42, 0.34, 0, { to: g, r: [0, 0, -1.2] }); eyes(g, 0.5, 0.34, 0.15, 0.11); return [0.95, 0.8]; },
    crab: (g, c = 0xd07a7e) => { piece(G.cyl(0.46, 0.38, 0.34, 6), c, 0, 0.3, 0, { to: g, s: [1.1, 1, 0.8] }); for (const s of [-1, 1]) { piece(G.oct(0.2), c, s * 0.58, 0.42, 0.12, { to: g, s: [1, 1.2, 0.7] }); piece(G.cone(0.06, 0.24, 4), c, s * 0.36, 0.1, 0.22, { to: g, r: [0, 0, s * 2.4] }); } eyes(g, 0.56, 0.24, 0.14, 0.1); return [0.72, 1.0]; },
    octo: (g, c = 0xb07ad8) => { piece(G.ico(0.42), c, 0, 0.62, 0, { to: g, s: [1, 1.15, 1], r: [0.1, 0.3, 0] }); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283 + 0.4; piece(G.cone(0.1, 0.42, 4), c, Math.cos(a) * 0.34, 0.2, Math.sin(a) * 0.3, { to: g, r: [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9] }); } eyes(g, 0.66, 0.36, 0.15, 0.11); return [1.2, 0.85]; },
    boss: (g, c = 0x6f7fe0) => { piece(G.ico(1.0), c, 0, 0.85, 0, { to: g, s: [1.12, 0.8, 1.0], r: [0.25, 0.5, 0] }); piece(G.cone(0.42, 0.9, 4), c, 0, 1.0, -1.0, { to: g, r: [-1.2, 0, 0] }); piece(G.cone(0.22, 0.5, 4), c, -1.0, 0.6, 0.1, { to: g, r: [0, 0, 1.3] }); piece(G.cone(0.22, 0.5, 4), c, 1.0, 0.6, 0.1, { to: g, r: [0, 0, -1.3] });
      piece(G.box(1.1, 0.1, 0.5), 0xd9d3ec, 0, 0.32, 0.62, { to: g }); eyes(g, 1.1, 0.78, 0.36, 0.2); return [2.0, 2.0]; },
    hero: g => { piece(G.cone(0.44, 0.95, 6), 0xdc4a2c, 0, 0.5, 0, { to: g, r: [0, 0.5, 0] }); piece(G.ico(0.2), 0xecd6b4, 0, 1.08, 0.02, { to: g }); piece(G.cyl(0.36, 0.36, 0.045, 8), 0x4a4470, 0, 1.24, 0, { to: g }); piece(G.cone(0.2, 0.26, 6), 0x4a4470, 0, 1.38, 0, { to: g });
      piece(G.box(0.05, 0.36, 0.05), 0x6a5a52, 0.44, 0.78, 0.1, { to: g }); piece(G.cyl(0.085, 0.085, 0.17, 6), FLAME, 0.44, 0.55, 0.1, { to: g }); return [1.62, 0.7]; },
    soldier: g => { piece(G.cone(0.22, 0.5, 5), 0x8fa2d2, 0, 0.27, 0, { to: g }); piece(G.ico(0.13), 0xecd6b4, 0, 0.6, 0.01, { to: g }); piece(G.cone(0.16, 0.14, 6), 0x5a6494, 0, 0.74, 0, { to: g }); piece(G.box(0.03, 0.5, 0.03), 0x6a5a52, 0.22, 0.42, 0.04, { to: g }); piece(G.box(0.07, 0.09, 0.07), AMBER, 0.22, 0.7, 0.04, { to: g }); return [0.92, 0.42]; },
  };
  const units = [];
  const put = (kind, x, z, hp = 1, ally = false, sc = 1) => { const g = group(x, z + 0.02); g.scale.setScalar(sc); const [top, w] = UNIT[kind](g); bar(g, top + 0.16, Math.max(0.5, w * 0.8), hp, ally); units.push({ g, kind, y0: 0 }); return g; };
  const at = (lane, s, off = 0) => { const p = LANES[lane].at(s, {}); return [p.x - p.hz * off, p.z + p.hx * off]; };
  // ten shadows from the sea (three kinds and the boss), the keeper, three lantern soldiers
  for (const [k, lane, s, off, hp] of [['fry', 0, 2.6, 0.1, 1], ['fry', 0, 3.5, -0.15, 0.6], ['fry', 1, 2.9, 0.12, 1], ['fry', 1, 5.2, -0.1, 0.35], ['fry', 0, 10.4, 0.1, 0.8], ['crab', 0, 5.6, 0, 0.75], ['crab', 0, 8.9, 0.05, 1], ['octo', 0, 6.6, -0.05, 0.9], ['octo', 0, 12.6, 0.05, 0.5]]) { const [x, z] = at(lane, s, off); put(k, x, z, hp); }
  { const [x, z] = at(0, 4.3, 0); put('boss', x, z, 0.82); }
  put('hero', 1.5, -0.35, 0.9, true); lamp(1.97, 0.6, -0.2, 4.4, 2.8);
  { const s = SLOTS[1], p = (() => { let b = null, bd = 9; for (const q of LANES[0].pts) { const d = Math.hypot(q.x - s.x, q.z - s.z); if (d < bd) { bd = d; b = q; } } return b; })(); [[-0.32, 0.1], [0.3, -0.05], [0, 0.34]].forEach(([dx, dz], i) => put('soldier', p.x + dx, p.z + dz, i === 1 ? 0.6 : 1, true)); }
  // one hit caught in mid-air: the "pop" ring, paper scraps and sparks, and the burning arrow that did it (the brightest things on the board)
  { const [x, z] = at(1, 5.2, -0.1), g = group(x, z + 0.1), white = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 1.8, 1.5), side: THREE.DoubleSide });
    piece(new THREE.RingGeometry(0.52, 0.6, 28), white, 0, 0.55, 0.2, { to: g, r: [FACE, 0, 0] });
    for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283, c = [glow(1.6, 0.42, 0.18), glow(1.7, 1.0, 0.28), glow(1.7, 1.6, 1.25)][i % 3]; c.side = THREE.DoubleSide; piece(new THREE.CircleGeometry(0.075, 5), c, Math.cos(a) * 0.72, 0.6 + Math.sin(a) * 0.55, 0.25, { to: g, r: [FACE + r0(), r0() * 3, r0() * 3] }); }
    const s = SLOTS[4], a = new THREE.Vector3(s.x, 1.45, s.z), b = new THREE.Vector3(x, 0.6, z), mid = a.clone().lerp(b, 0.62), arrow = piece(G.box(0.05, 0.05, 0.75), glow(2.0, 1.25, 0.4), mid.x, mid.y, mid.z); arrow.lookAt(b); }

  // ---------- sea: the flat cut-paper wave layers (the one place flat sheets are allowed) ----------
  const waves = [], svg = new SVGLoader();
  { const cols = [0x4a7fc0, 0x3f70b0, 0x3462a0, 0x2a548e, 0x22467c, 0x1b3a6a], rim = [0.16, 0.22, 0.32, 0.5, 0.8, 1.0], floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 12), grain(new THREE.MeshBasicMaterial({ color: new THREE.Color(0x1b3a6a).multiplyScalar(0.36), map: paper }))); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.05, 10.2); scene.add(floor);
    const shapeOf = name => { const S = SHAPES[name]; return { S, shapes: svg.parse(`<svg xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="${S.d}"/></svg>`).paths.flatMap(p => SVGLoader.createShapes(p)) }; }, src = { wave_a: shapeOf('wave_a'), wave_c: shapeOf('wave_c') };
    [['wave_c', 4.35, 0.8, 3], ['wave_a', 4.8, 1.0, 2], ['wave_c', 5.3, 1.2, 2], ['wave_a', 5.9, 1.45, 2], ['wave_c', 6.6, 1.75, 2], ['wave_a', 7.4, 2.1, 1]].forEach(([name, z, h, count], i) => { const { S, shapes } = src[name], k = h / S.h, w = S.w * k, g = new THREE.Group();
      const geo = new THREE.ShapeGeometry(shapes, 3); geo.scale(k, -k, 1); geo.translate(-w / 2, h, 0); const uv = geo.attributes.uv; for (let j = 0; j < uv.count; j++) uv.setXY(j, geo.attributes.position.getX(j) * 0.5, geo.attributes.position.getY(j) * 0.5);
      const rimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(cols[i]).lerp(new THREE.Color(0.42, 0.56, 0.9), rim[i]), side: THREE.DoubleSide }), body = grain(new THREE.MeshBasicMaterial({ color: new THREE.Color(cols[i]).multiplyScalar(0.36), map: paper, side: THREE.DoubleSide }));
      for (let c = 0; c < count; c++) { const x = (c - (count - 1) / 2) * w * 0.9; const r = new THREE.Mesh(geo, rimMat); r.position.set(x - 0.012, 0.03 + h * 0.006, -0.012); const b = new THREE.Mesh(geo, body); b.position.set(x, 0, 0); g.add(r, b); }
      g.rotation.x = FACE; g.scale.x = i % 2 ? -1 : 1; g.position.set(0, 0.02, z); scene.add(g); waves.push({ g, sp: [0.62, 0.95, 0.7, 1.1, 0.55, 0.82][i], ph: i * 1.9, drift: 0.3 + 0.05 * i }); }); }

  // ---------- light: the moon casts the shadows; everything warm is a point light ----------
  scene.add(new THREE.HemisphereLight(0x4656a8, 0x0c0e20, 1.15));
  const moon = new THREE.DirectionalLight(0xb4c4ff, 2.1); moon.position.set(-9, 15, -7); moon.target.position.set(0, 0, -2); moon.castShadow = true; moon.shadow.mapSize.set(2048, 2048); moon.shadow.bias = -0.0012; moon.shadow.normalBias = 0.03; moon.shadow.radius = 2.5;
  Object.assign(moon.shadow.camera, { left: -11, right: 11, top: 13, bottom: -13, near: 1, far: 60 }); moon.shadow.autoUpdate = false; moon.shadow.needsUpdate = true; scene.add(moon, moon.target);

  // ---------- post (fixed canvas; the render target carries any resolution change) ----------
  const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera)); const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.6, 0.9); composer.addPass(bloom); composer.addPass(new OutputPass());
  const basePR = Math.min(devicePixelRatio || 1, 2); let W = 1, H = 1, scale = 1, baked = 0;
  const FQ = new URLSearchParams(location.search), FW = +FQ.get('w') || 0, FH = +FQ.get('h') || 0;   // ?w=390&h=844 pins the board size (capture tool: desktop Chrome cannot open a window that narrow)
  function resize() { H = FH || innerHeight; W = FW || Math.min(innerWidth, Math.round(H * 9 / 16)); frame.style.width = W + 'px'; frame.style.height = H + 'px'; renderer.setPixelRatio(basePR); renderer.setSize(W, H); composer.setPixelRatio(basePR * scale); composer.setSize(W, H);
    const hh = HALF_W * H / W, zt = SEA_Z - (SEA_AT - 0.5) * 2 * hh / Math.sin(TILT); camera.top = hh; camera.bottom = -hh; camera.position.set(0, 40 * Math.sin(TILT), zt + 40 * Math.cos(TILT)); camera.lookAt(0, 0, zt); camera.updateProjectionMatrix(); camera.updateMatrixWorld(); baked = 0; }
  addEventListener('resize', resize); resize();
  const _v = new THREE.Vector3(), st = { freeze: 0, fps: 60, hold: true, dawn: 0, probe: false, luma: 0 };
  const toScreen = (x, y, z) => { _v.set(x, y, z).project(camera); return { x: (_v.x * 0.5 + 0.5) * W, y: (-_v.y * 0.5 + 0.5) * H }; };
  function frameUpdate() { const t = performance.now() * 0.001;
    for (const w of waves) { w.g.position.x = Math.sin(t * w.sp + w.ph) * w.drift; w.g.position.y = 0.02 + Math.sin(t * w.sp * 1.7 + w.ph * 2) * 0.03; }
    for (const a of lamps) a.l.intensity = a.power * (0.94 + 0.06 * Math.sin(t * 5 + a.ph));
    for (let i = 0; i < rings.length; i++) rings[i].scale.setScalar(1 + 0.07 * Math.sin(t * 2.6 + i));
    for (const u of units) u.g.position.y = u.kind === 'hero' || u.kind === 'soldier' ? 0 : Math.abs(Math.sin(t * 3 + u.g.position.x * 3)) * 0.03;
    if (baked < 3) { moon.shadow.needsUpdate = true; baked++; }
    composer.render();
    if (st.probe) { const gl = renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, buf = st.buf && st.buf.length === w * h * 4 ? st.buf : (st.buf = new Uint8Array(w * h * 4)); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf); let s = 0, n = 0; for (let i = 0; i < buf.length; i += 148) { s += 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2]; n++; } st.luma = s / n / 255; renderer.resetState(); } }
  const none = () => {};
  return { frame: frameUpdate, reset: none, onEvent: none, select: none, range: none, heroSel: none, setGather: none, fadeIn: none, heroAt: () => false, slotAt: () => -1, pickGround: () => null, toScreen, resize, st, canvas: renderer.domElement,
    setScale: k => { scale = k; composer.setPixelRatio(basePR * scale); }, info: () => ({ tris: renderer.info.render.triangles, calls: renderer.info.render.calls, pixelRatio: scale, fps: st.fps, alive: 10 }), _dbg: { renderer, scene, camera, composer, bloom, moon } };
}
