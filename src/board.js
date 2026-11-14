// 등불지기 — the board as a folded-paper miniature (DESIGN.md §3 camera, §4 art). The approved stage-1 look-dev, now drawn live from the rules.
// A paper-model island on a dark sea, seen from far above: stacked sheets with a visible cut edge, a long winding road with
// stairs, two bridges and a ford, a dense little village, a harbour, fields. Matte paper only; the only bright things are
// windows, lanterns, enemy eyes and effects. One light casts shadows (the moon, baked while nothing static changes).
// Performance (DESIGN.md §7): everything that never moves is merged into a handful of meshes; the warm lantern light is baked
// (per vertex on the scenery, as a light map on the ground) instead of being dozens of live point lights; three live point
// lights remain (the keeper's lantern and two for effects). Resolution is only ever scaled inside the render targets.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { rng, clamp, Z0, Z1, STEP, hAt, halfW, ROUTES, SPOTS, TOWER as LIGHTHOUSE, spline, towerStat, TOWERS } from './game.js';

const TILT = THREE.MathUtils.degToRad(53), HALF_W = 9.2, SEA_Z = 11.6, SEA_AT = 0.875, FACE = -(Math.PI / 2 - TILT);
// palette: deep navy, kraft, cream, muted vermilion; amber is for light only
const C = { navy: 0x1d2742, navy2: 0x243050, navy3: 0x2a3757, field: 0x26384a, kraft: 0x8a6c4c, kraftD: 0x66503a, cream: 0xcfc4aa, creamD: 0xa89e88, verm: 0xa9523c, slate: 0x4a5670, stone: 0x8a8a86, road: 0x9a8c74, black: 0x17161c, wood: 0x6e5540, leaf: 0x2c4a44, leaf2: 0x35524a, water: 0x1e3c56 };
const CREEK = [[8.9, -7.4], [5.2, -5.6], [3.2, -2.8], [1.8, 1.75], [2.9, 4.0], [4.55, 4.75], [6.9, 6.4], [9, 8.8]];
const lift = (z, w = 0.7) => { let s = 0; for (let k = -3; k <= 3; k++) s += hAt(z + k * w / 3); return s / 7; };   // the road and the creek ramp over a terrace edge instead of jumping

export async function createStage(frame, SHAPES) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  frame.prepend(renderer.domElement);
  const SC = new THREE.Scene(); SC.background = new THREE.Color(0x18274a);
  const scene = new THREE.Group(), DYN = new THREE.Group(); SC.add(DYN);          // `scene` collects everything that never moves; it is merged once it is complete
  const camera = new THREE.OrthographicCamera(-HALF_W, HALF_W, 16, -16, 1, 200);
  const TL = new THREE.TextureLoader(), tex = (url, srgb, rep) => new Promise((res, rej) => TL.load(url, t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; res(t); }, undefined, rej));
  const [paper, paperN, pLight] = await Promise.all([tex('./assets/paper/Paper001_Color.jpg', true, 2.2), tex('./assets/paper/Paper003_NormalGL.jpg', false, 0.5), tex('./assets/particles/light_01.png', true, 1)]);

  // ---------- baked lantern light: a light map of the ground (and the sea), and a per-vertex value on the merged scenery ----------
  const LAMPS = [], LW = 384, LH = 768, LX0 = -11, LZ0 = -25, LSX = 22, LSZ = 42, lampF = new Float32Array(LW * LH), lampH = new Uint16Array(LW * LH);
  const lampTex = new THREE.DataTexture(lampH, LW, LH, THREE.RedFormat, THREE.HalfFloatType); lampTex.minFilter = lampTex.magFilter = THREE.LinearFilter; lampTex.wrapS = lampTex.wrapT = THREE.ClampToEdgeWrapping;
  const LU = { uLampMap: { value: lampTex }, uLampCol: { value: new THREE.Color(0xffa040) }, uLampK: { value: 1 }, uLampA: { value: new THREE.Vector4(LX0, LZ0, 1 / LSX, 1 / LSZ) }, uT: { value: 0 } };
  // what a point light of three.js would give a surface at (x, y, z) facing (nx, ny, nz): intensity * N.L * distance falloff (decay 1.6, cut at its reach)
  const irr = (l, x, y, z, nx, ny, nz) => { const dx = l.x - x, dy = l.y - y, dz = l.z - z, d2 = dx * dx + dy * dy + dz * dz; if (d2 >= l.reach * l.reach) return 0; const d = Math.sqrt(d2) || 1e-4, nl = (nx * dx + ny * dy + nz * dz) / d; if (nl <= 0) return 0;
    const q = d / l.reach, c = 1 - q * q * q * q; return l.power * nl * c * c / Math.max(Math.pow(d, 1.6), 0.01); };
  const groundY = (x, z) => (z >= Z0 && z <= Z1 && Math.abs(x) < halfW(z) ? hAt(z) : -0.7);
  const lampToMap = (l, sign) => { const i0 = Math.max(0, Math.floor((l.x - l.reach - LX0) / LSX * LW)), i1 = Math.min(LW - 1, Math.ceil((l.x + l.reach - LX0) / LSX * LW)), j0 = Math.max(0, Math.floor((l.z - l.reach - LZ0) / LSZ * LH)), j1 = Math.min(LH - 1, Math.ceil((l.z + l.reach - LZ0) / LSZ * LH));
    for (let j = j0; j <= j1; j++) { const z = LZ0 + (j + 0.5) / LH * LSZ; for (let i = i0; i <= i1; i++) { const x = LX0 + (i + 0.5) / LW * LSX, k = j * LW + i; lampF[k] = Math.max(0, lampF[k] + sign * irr(l, x, groundY(x, z), z, 0, 1, 0)); lampH[k] = THREE.DataUtils.toHalfFloat(Math.min(60000, lampF[k])); } } lampTex.needsUpdate = true; };

  // ---------- paper: matte, grainy, a thin pale line on every fold, every fold a little off ----------
  const mats = new Map(), lines = new Map(), r0 = rng(77), _c = new THREE.Color();
  // every lit paper material: the grain of the scan is deepened, and the baked lantern light is added to the diffuse light
  // variant 'v': the light comes from a vertex attribute (merged scenery); 'sea': the folded strips bob; default: the light map by world position
  const grain = (m, variant = '') => { m.onBeforeCompile = sh => { Object.assign(sh.uniforms, LU); const v = variant === 'v', sea = variant === 'sea';
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; uniform float uT;\n' + (v ? 'attribute float aLamp; varying float vLamp;\n' : '') + (sea ? 'attribute vec2 aBob;\n' : ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + (sea ? '  transformed.x += sin( uT * aBob.y + aBob.x ) * 0.25; transformed.y += sin( uT * aBob.y * 1.6 + aBob.x ) * 0.05;\n' : ''))
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vWp = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;' + (v ? ' vLamp = aLamp;' : ''));
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; uniform sampler2D uLampMap; uniform vec3 uLampCol; uniform float uLampK; uniform vec4 uLampA;\n' + (v ? 'varying float vLamp;\n' : ''))
      .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= clamp( 1.0 + ( texture2D( map, vMapUv ).g - texture2D( map, vMapUv, 4.0 ).g ) * 3.2, 0.6, 1.4 );')
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n  reflectedLight.directDiffuse += uLampCol * ( uLampK * ' + (v ? 'vLamp' : 'texture2D( uLampMap, ( vWp.xz - uLampA.xy ) * uLampA.zw ).r') + ' ) * BRDF_Lambert( diffuseColor.rgb );'); };
    m.customProgramCacheKey = () => 'paper-' + variant; return m; };
  const bobBasic = m => { m.onBeforeCompile = sh => { sh.uniforms.uT = LU.uT; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT; attribute vec2 aBob;').replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed.x += sin( uT * aBob.y + aBob.x ) * 0.25; transformed.y += sin( uT * aBob.y * 1.6 + aBob.x ) * 0.05;'); }; m.customProgramCacheKey = () => 'bob'; return m; };
  const pm = col => { if (!mats.has(col)) { const m = grain(new THREE.MeshLambertMaterial({ color: col, map: paper, flatShading: true })); m.userData.cls = 'P'; mats.set(col, m); } return mats.get(col); };
  const glow = (r, g, b) => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), map: paper }); m.userData.cls = 'G'; return m; };
  const foldLine = (col, k = 0.3) => { const key = col + k; if (!lines.has(key)) lines.set(key, new THREE.LineBasicMaterial({ color: new THREE.Color(col).lerp(_c.set(0xe8e2d0), k), transparent: true, opacity: 0.6 })); return lines.get(key); };
  // the merged versions of the three kinds of material above: the colour of each piece travels with its vertices
  const PVs = grain(new THREE.MeshLambertMaterial({ map: paper, flatShading: true, vertexColors: true }), 'v'), PVd = grain(new THREE.MeshLambertMaterial({ map: paper, flatShading: true, vertexColors: true }));
  const GV = new THREE.MeshBasicMaterial({ map: paper, vertexColors: true, side: THREE.DoubleSide }), LV = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6 });
  const crumple = (g, a) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453, f = h - Math.floor(h); p.setXYZ(i, x + (f - 0.5) * a, y + (((f * 7.3) % 1) - 0.5) * a * 0.6, z + (((f * 3.1) % 1) - 0.5) * a); } g.computeVertexNormals(); return g; };
  const piece = (geo, col, x, y, z, o = {}) => { const solid = typeof col === 'number', m = new THREE.Mesh(solid && o.crumple !== 0 ? crumple(geo, o.crumple ?? 0.025) : geo, solid ? pm(col) : col); m.position.set(x, y, z); if (o.r) m.rotation.set(o.r[0], o.r[1], o.r[2]); if (o.s) m.scale.set(o.s[0], o.s[1], o.s[2]);
    m.castShadow = o.cast ?? solid; m.receiveShadow = solid; (o.to || scene).add(m); if (solid && o.fold !== false) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), foldLine(col, o.rim ?? 0.3))); return m; };
  const G = { box: (w, h, d) => new THREE.BoxGeometry(w, h, d), cyl: (a, b, h, n) => new THREE.CylinderGeometry(a, b, h, n), cone: (r, h, n) => new THREE.ConeGeometry(r, h, n), ico: r => new THREE.IcosahedronGeometry(r, 0), oct: r => new THREE.OctahedronGeometry(r, 0),
    roof: (w, d, h) => { const g = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]), { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2); return g; },
    shed: (w, d, h) => { const g = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(w / 2, h)]), { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2); return g; } };
  const group = (x, z, ry = 0, y) => { const g = new THREE.Group(); g.position.set(x, y ?? hAt(z), z); g.rotation.y = ry; scene.add(g); return g; };
  const AMBER = glow(1.45, 0.82, 0.28), FLAME = glow(1.7, 1.05, 0.4), WINDOW = glow(1.15, 0.66, 0.22), WIN = [];
  // a lantern: its light goes into the bake, its halo is a small glow that faces the (fixed) camera
  const haloMat = new THREE.MeshBasicMaterial({ map: pLight, color: 0xff9838, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.32 }), haloGeo = new THREE.PlaneGeometry(1, 1);
  const halo = (x, y, z, power, to = scene) => { const h = new THREE.Mesh(haloGeo, haloMat); h.position.set(x, y, z); h.rotation.x = FACE; h.scale.setScalar(0.6 + power * 0.07); h.renderOrder = 3; to.add(h); return h; };
  const lamp = (x, y, z, power = 5, reach = 4) => { LAMPS.push({ x, y, z, power, reach }); halo(x, y, z, power); };
  // soft contact shade under things and along the paper steps (ambient occlusion, painted in)
  const aoTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d'), g = x.createRadialGradient(32, 32, 2, 32, 32, 32); g.addColorStop(0, 'rgba(0,0,0,.6)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })();
  const aoMat = new THREE.MeshBasicMaterial({ map: aoTex, transparent: true, depthWrite: false, color: 0x02030a });
  const ao = (x, z, w, d = w, y) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), aoMat); m.rotation.x = -Math.PI / 2; m.position.set(x, (y ?? hAt(z)) + 0.012, z); m.renderOrder = 1; scene.add(m); };
  // merge everything under a root into one mesh per kind of material. Static scenery is merged in world space, a tower or a unit in its own space.
  const _m3 = new THREE.Matrix3(), _m4 = new THREE.Matrix4(), _p = new THREE.Vector3(), _n = new THREE.Vector3();
  const bake = (root, world) => { root.updateMatrixWorld(true); const inv = world ? null : new THREE.Matrix4().copy(root.matrixWorld).invert(), B = new Map();
    root.traverse(o => { if (!(o.isMesh || o.isLineSegments)) return; const M = inv ? _m4.multiplyMatrices(inv, o.matrixWorld) : o.matrixWorld; _m3.getNormalMatrix(M);
      let g = o.geometry; if (g.index) g = g.toNonIndexed(); const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, ms = Array.isArray(o.material) ? o.material : [o.material], groups = ms.length > 1 ? g.groups : [{ start: 0, count: P.count, materialIndex: 0 }], line = !!o.isLineSegments;
      for (const gr of groups) { const m = ms[gr.materialIndex], cls = line ? 'L' : m.userData.cls || '', flags = (o.castShadow ? 'c' : '') + (o.receiveShadow ? 'r' : ''), key = (cls === 'P' ? 'P' + flags : cls || m.uuid + flags);
        let b = B.get(key); if (!b) B.set(key, b = { pos: [], nor: [], uv: [], col: [], line, cls, mat: m, cast: o.castShadow, recv: o.receiveShadow, order: o.renderOrder });
        const c = m.color, end = Math.min(P.count, gr.start + gr.count); for (let i = gr.start; i < end; i++) { _p.fromBufferAttribute(P, i).applyMatrix4(M); b.pos.push(_p.x, _p.y, _p.z); b.col.push(c.r, c.g, c.b); if (line) continue;
          if (N) { _n.fromBufferAttribute(N, i).applyMatrix3(_m3).normalize(); b.nor.push(_n.x, _n.y, _n.z); } else b.nor.push(0, 1, 0); if (U) b.uv.push(U.getX(i), U.getY(i)); else b.uv.push(0, 0); } } });
    const out = []; for (const b of B.values()) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3)); if (!b.line) { g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2)); }
      if (b.cls) g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3)); const mat = b.line ? LV : b.cls === 'P' ? (world ? PVs : PVd) : b.cls === 'G' ? GV : b.mat, o = b.line ? new THREE.LineSegments(g, mat) : new THREE.Mesh(g, mat);
      o.castShadow = b.cast; o.receiveShadow = b.recv; o.renderOrder = b.order; o.userData.cls = b.cls; out.push(o); } return out; };

  // ---------- the island: stacked sheets of paper, each a little smaller than the one below, so the cut edge shows its layers ----------
  const outline = (z0, z1, inset, seed) => { const r = rng(seed), R = [], L = []; for (let z = z0; z <= z1 + 0.01; z += 0.3) { const w = Math.max(0.2, halfW(z) - inset); R.push(new THREE.Vector2(w + (r() - 0.5) * 0.12, -z)); L.unshift(new THREE.Vector2(-w + (r() - 0.5) * 0.12, -z)); } return new THREE.Shape([...R, ...L]); };
  const slab = (z0, z1, inset, y, thick, top, side, seed) => { const g = new THREE.ExtrudeGeometry(outline(z0, z1, inset, seed), { depth: thick, bevelEnabled: false }); g.rotateX(-Math.PI / 2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.25, uv.getY(i) * 0.25);
    const m = new THREE.Mesh(g, [grain(new THREE.MeshLambertMaterial({ color: top, map: paper, normalMap: paperN, normalScale: new THREE.Vector2(0.7, 0.7) })), pm(side)]); m.position.y = y; m.receiveShadow = true; m.castShadow = true; scene.add(m); };
  [[Z1, 0, [C.kraftD, C.creamD, C.kraft, C.creamD, C.navy]], [STEP[0], 0.5, [C.kraft, C.creamD, C.navy2]], [STEP[1], 1.0, [C.kraft, C.creamD, C.navy3]], [STEP[2], 1.5, [C.kraft, C.creamD, C.navy2]]].forEach(([z1, top, cols], k) => { const t = k ? 0.5 / cols.length : 0.2;
    cols.forEach((c, i) => { const last = i === cols.length - 1; slab(Z0, z1, (cols.length - 1 - i) * -0.09, top - (cols.length - i) * t, t, c, last ? C.creamD : c, 11 + k * 7 + i); }); });
  for (const b of STEP) for (let x = -8; x <= 8; x += 1.6) if (Math.abs(x) < halfW(b) - 0.6) ao(x, b + 0.45, 2.2, 1.3, hAt(b + 0.5));                 // shade at the foot of each paper step
  // fields: darker patches of paper on the land
  const patch = (pts, col, seed) => { const r = rng(seed), o = []; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(2, Math.round(d / 0.3)); for (let j = 0; j < n; j++) o.push(new THREE.Vector2(a[0] + (b[0] - a[0]) * j / n + (r() - 0.5) * 0.1, -(a[1] + (b[1] - a[1]) * j / n + (r() - 0.5) * 0.1))); }
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(o), { depth: 0.03, bevelEnabled: false }); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, [grain(new THREE.MeshLambertMaterial({ color: col, map: paper, normalMap: paperN })), pm(C.creamD)]); m.position.y = hAt(pts[0][1]) + 0.004; m.receiveShadow = true; scene.add(m); };
  patch([[-2.2, 5.4], [0.6, 5.0], [1.6, 3.2], [-0.6, 2.4], [-2.4, 3.4]], C.field, 5); patch([[-5.6, -0.2], [-2.6, -1.6], [-1.4, -3.8], [-4.2, -4.6], [-5.6, -3]], C.field, 6); patch([[1.4, -6.4], [4.6, -6.6], [5.4, -8.6], [2.6, -9], [1, -7.6]], C.field, 7); patch([[-7, -8.2], [-3.8, -7.4], [-3.6, -9.4], [-6.8, -10.2]], C.field, 8);

  // ---------- creek, road (stairs where it climbs a step), bridges, the ford ----------
  const ribbon = (pts, hw, yOff, mat, seed, uvk = 0.4) => { const pos = [], uv = [], e = [], r = rng(seed);
    for (let i = 0; i < pts.length; i++) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / d, nz = (b[0] - a[0]) / d, wl = hw + (r() - 0.5) * 0.09, wr = hw + (r() - 0.5) * 0.09, y = lift(pts[i][1]) + yOff; e.push([pts[i][0] + nx * wl, y, pts[i][1] + nz * wl, pts[i][0] - nx * wr, y, pts[i][1] - nz * wr]); }
    for (let i = 0; i < e.length - 1; i++) { const a = e[i], b = e[i + 1], q = [[a[0], a[1], a[2]], [a[3], a[4], a[5]], [b[0], b[1], b[2]], [b[3], b[4], b[5]]]; for (const k of [0, 2, 1, 1, 2, 3]) { pos.push(...q[k]); uv.push(q[k][0] * uvk, q[k][2] * uvk); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); const s = new THREE.Mesh(g, mat); s.receiveShadow = true; scene.add(s); };
  const paperFlat = col => grain(new THREE.MeshLambertMaterial({ color: col, map: paper, normalMap: paperN, side: THREE.DoubleSide }));
  const creek = spline(CREEK, 10); ribbon(creek, 0.5, 0.02, paperFlat(C.creamD), 3); ribbon(creek, 0.4, 0.03, paperFlat(C.water), 4);
  const lanes = ROUTES.map(r => spline(r, 9)), roadMat = paperFlat(C.road), underMat = paperFlat(C.kraftD);
  for (const L of lanes) ribbon(L, 0.7, 0.045, underMat, 21); for (const L of lanes) ribbon(L, 0.62, 0.055, roadMat, 22);
  const nearRoad = (x, z) => { let d = 9; for (const L of lanes) for (let i = 0; i < L.length; i += 2) d = Math.min(d, Math.hypot(L[i][0] - x, L[i][1] - z)); return d; };
  const POSTS2 = []; lanes.forEach((L, li) => { for (let i = 7 + li * 5; i < (li ? 80 : L.length - 3); i += 13) { const a = L[i - 1], b = L[i + 1], d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, s = (Math.round(i / 13) % 2 ? 1 : -1) * 1.0; POSTS2.push([L[i][0] - (b[1] - a[1]) / d * s, L[i][1] + (b[0] - a[0]) / d * s]); } });
  const along = (L, i) => { const a = L[Math.max(0, i - 1)], b = L[Math.min(L.length - 1, i + 1)]; return Math.atan2(b[0] - a[0], b[1] - a[1]); };
  { const done = new Set(); for (const L of lanes) for (let i = 1; i < L.length; i++) for (const b of STEP) if ((L[i - 1][1] - b) * (L[i][1] - b) < 0) { const key = Math.round(L[i][0] * 10) + ':' + b; if (done.has(key)) continue; done.add(key); const g = group(L[i][0], b, along(L, i), 0), up = hAt(b - 0.3), lo = hAt(b + 0.3);   // stairs: folded steps across the road
        for (let s = 0; s < 4; s++) piece(G.box(1.36, (up - lo) / 4 * (s + 1), 0.3), C.cream, 0, lo + (up - lo) / 8 * (s + 1) + 0.03, 0.75 - s * 0.3, { to: g, rim: 0.5, crumple: 0.015 }); } }
  const bridge = (x, z, ry) => { const g = group(x, z, ry, lift(z)); piece(G.box(1.5, 0.12, 1.9), C.kraft, 0, 0.2, 0, { to: g }); for (const s of [-1, 1]) { piece(G.box(0.07, 0.07, 1.9), C.wood, s * 0.72, 0.56, 0, { to: g, fold: false }); for (const q of [-0.85, 0, 0.85]) piece(G.box(0.09, 0.42, 0.09), C.wood, s * 0.72, 0.4, q, { to: g, fold: false }); } ao(x, z, 2.4, 2.4, lift(z)); };
  bridge(5.15, -5.3, 0.75); bridge(4.6, 4.6, 1.95);
  for (const [dx, dz] of [[-0.45, -0.3], [0, 0.05], [0.42, -0.1], [-0.15, 0.4], [0.3, 0.45]]) piece(G.cyl(0.2, 0.24, 0.1, 6), C.stone, 1.8 + dx, 0.09, 1.75 + dz, { r: [0, r0() * 3, 0] });   // the ford: stepping stones
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.62, 0.2), transparent: true, opacity: 0.85 }), rings = [];
  SPOTS.forEach(([x, z], i) => { const y = hAt(z); piece(G.cyl(0.62, 0.7, 0.09, 8), C.creamD, x, y + 0.05, z, { r: [0, i * 0.5, 0] }); ao(x, z, 2.2); const r = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.45, 8), ringMat); r.rotation.x = -Math.PI / 2; r.position.set(x, y + 0.105, z); DYN.add(r); rings.push(r); });

  // ---------- small things: houses, trees, walls, fences, plots, the harbour ----------
  const house = (x, z, w, h, d, ry, body, roofC, kind = 0, lit = 2) => { const g = group(x, z, ry); piece(G.box(w, h, d), body, 0, h / 2, 0, { to: g });
    if (kind === 0) piece(G.roof(w * 1.14, d * 1.12, w * 0.5), roofC, 0, h, 0, { to: g }); else if (kind === 1) piece(G.cone(Math.hypot(w, d) * 0.62, w * 0.55, 4), roofC, 0, h + w * 0.27, 0, { to: g, r: [0, Math.PI / 4, 0] }); else piece(G.shed(w * 1.1, d * 1.1, w * 0.34), roofC, 0, h, 0, { to: g });
    piece(G.box(0.16, 0.34, 0.16), C.kraftD, w * 0.24, h + w * 0.34, -d * 0.18, { to: g });
    for (let i = 0; i < lit; i++) WIN.push(piece(new THREE.PlaneGeometry(w * 0.16, h * 0.26), WINDOW, (i - (lit - 1) / 2) * w * 0.44, h * 0.6, d / 2 + 0.012, { to: g }));
    piece(new THREE.PlaneGeometry(w * 0.18, h * 0.42), pm(C.wood), w * (lit === 1 ? 0.26 : 0), h * 0.22, d / 2 + 0.011, { to: g, cast: false }); piece(G.box(w * 0.3, 0.06, 0.16), C.stone, w * (lit === 1 ? 0.26 : 0), 0.03, d / 2 + 0.09, { to: g });
    if (r0() < 0.6) { piece(G.cyl(0.06, 0.05, 0.09, 5), C.verm, -w * 0.38, 0.05, d / 2 + 0.12, { to: g }); piece(G.ico(0.07), C.leaf2, -w * 0.38, 0.14, d / 2 + 0.12, { to: g, fold: false }); }   // a flower pot by the door
    ao(x, z, w * 2.1, d * 2.3); return g; };
  const tree = (x, z, s = 1) => { if (nearRoad(x, z) < 1.0) return; const g = group(x, z, r0() * 3); piece(G.cyl(0.05 * s, 0.07 * s, 0.34 * s, 5), C.wood, 0, 0.17 * s, 0, { to: g, fold: false }); for (let i = 0; i < 3; i++) piece(G.cone((0.46 - i * 0.11) * s, 0.56 * s, 6), i % 2 ? C.leaf2 : C.leaf, 0, (0.56 + i * 0.33) * s, 0, { to: g, r: [0, i * 0.5, 0], crumple: 0.04 }); ao(x, z, 1.3 * s); };
  const bush = (x, z, s = 0.25) => piece(G.ico(s), C.leaf, x, hAt(z) + s * 0.5, z, { s: [1.2, 0.7, 1], r: [r0(), r0() * 3, 0], crumple: 0.04 });
  const rock = (x, z, s) => piece(G.ico(s), C.slate, x, hAt(z) + s * 0.4, z, { s: [1.1, 0.65, 0.9], r: [r0(), r0() * 3, r0()], crumple: 0.05 });
  const tuft = (x, z) => { for (let i = 0; i < 3; i++) piece(G.cone(0.05, 0.2, 3), C.leaf2, x + (r0() - 0.5) * 0.2, hAt(z) + 0.1, z + (r0() - 0.5) * 0.2, { fold: false, cast: false, r: [(r0() - 0.5) * 0.5, r0() * 3, (r0() - 0.5) * 0.5] }); };
  const wall = (x0, z0, x1, z1) => { const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.3); for (let i = 0; i <= n; i++) { const t = i / n; if (nearRoad(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t) < 0.85) continue; piece(G.box(0.26, 0.16 + r0() * 0.07, 0.2), C.stone, x0 + (x1 - x0) * t, hAt(z0) + 0.09, z0 + (z1 - z0) * t, { r: [0, Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2 + (r0() - 0.5) * 0.3, 0], fold: i % 2 === 0, crumple: 0.03 }); } };
  const fence = (x0, z0, x1, z1) => { const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.5), ry = Math.atan2(x1 - x0, z1 - z0), y = hAt(z0); for (let i = 0; i <= n; i++) piece(G.box(0.05, 0.32, 0.05), C.wood, x0 + (x1 - x0) * i / n, y + 0.16, z0 + (z1 - z0) * i / n, { fold: false });
    piece(G.box(0.03, 0.04, Math.hypot(x1 - x0, z1 - z0)), C.wood, (x0 + x1) / 2, y + 0.24, (z0 + z1) / 2, { r: [0, ry, 0], fold: false }); };
  const plot = (x, z, w, d, ry) => { if (nearRoad(x, z) < 0.75 + Math.max(w, d) / 2) return; const g = group(x, z, ry); piece(G.box(w, 0.04, d), C.kraftD, 0, 0.03, 0, { to: g }); for (let i = 0; i < 4; i++) for (let j = 0; j < Math.round(d / 0.28); j++) piece(G.cone(0.06, 0.13, 4), C.leaf2, (i - 1.5) * w * 0.22, 0.11, (j + 0.5) * 0.28 - d / 2, { to: g, fold: false, cast: false }); };
  // village on the top terraces: houses of different sizes and roofs, close together, with alleys between
  const HC = [C.cream, C.creamD, C.kraft, C.cream], RC = [C.slate, C.verm, C.kraftD, C.navy3];
  [[-5.6, -13.9, 1.5, 1.0, 1.2, 0.1, 0], [-3.9, -14.6, 1.2, 1.5, 1.1, -0.06, 1], [-1.7, -14.0, 1.6, 1.0, 1.2, 0.05, 0], [0.4, -14.5, 1.2, 1.2, 1.1, -0.04, 2], [2.2, -13.9, 1.5, 1.1, 1.2, 0.06, 0], [4.2, -14.4, 1.3, 1.6, 1.1, -0.08, 1], [5.9, -13.8, 1.2, 0.9, 1.1, 0.04, 2],
    [-4.9, -16.3, 1.4, 1.2, 1.2, 0.03, 1], [-2.9, -16.6, 1.3, 0.95, 1.1, -0.05, 0], [-0.9, -16.3, 1.5, 1.7, 1.2, 0.04, 0], [1.2, -16.7, 1.2, 1.0, 1.1, -0.03, 2], [3.2, -16.3, 1.6, 1.2, 1.2, 0.05, 0], [5.0, -16.6, 1.2, 1.0, 1.0, -0.04, 1],
    [-3.6, -18.5, 1.4, 1.1, 1.1, 0.04, 0], [-1.2, -18.7, 1.3, 1.3, 1.1, -0.03, 1], [1.4, -18.5, 1.5, 1.0, 1.2, 0.05, 2], [3.4, -18.8, 1.2, 1.2, 1.1, -0.04, 0], [-6.6, -9.2, 1.4, 1.0, 1.1, 0.3, 0], [7.0, -0.6, 1.3, 0.9, 1.1, -0.4, 2]].forEach(([x, z, w, h, d, ry, k], i) => house(x, z, w, h, d, ry, HC[i % 4], RC[(i * 3 + k) % 4], k, 1 + (i % 2)));
  for (const [x0, z0, x1, z1] of [[-4.9, -15.3, -2.7, -15.5], [2.4, -15.2, 4.6, -15.4], [-0.2, -17.5, 2.4, -17.6]]) { const y = hAt(z0) + 0.62, ry = Math.atan2(x1 - x0, z1 - z0);   // laundry lines across the alleys
    for (const [x, z] of [[x0, z0], [x1, z1]]) piece(G.box(0.05, 0.62, 0.05), C.wood, x, hAt(z0) + 0.31, z, { fold: false }); piece(G.box(0.015, 0.015, Math.hypot(x1 - x0, z1 - z0)), C.creamD, (x0 + x1) / 2, y, (z0 + z1) / 2, { r: [0, ry, 0], fold: false, cast: false });
    for (let i = 1; i < 6; i++) piece(G.box(0.02, 0.2 + (i % 2) * 0.06, 0.2), [C.cream, C.verm, C.creamD][i % 3], x0 + (x1 - x0) * i / 6, y - 0.12, z0 + (z1 - z0) * i / 6, { r: [0, ry, 0], fold: false }); }
  for (const [x, z] of [[-3.6, -13.6], [1.3, -13.5], [4.9, -15.5], [-1.9, -17.6]]) lamp(x, hAt(z) + 0.8, z, 3.4, 4.2);                                         // window light on the village streets
  for (const [x, z, s] of [[-7.2, -12.9, 1.1], [7.3, -12.6, 1.2], [-6.6, -17.6, 1.3], [6.6, -17.9, 1.2], [-5.2, -19.9, 1.4], [0.2, -20.3, 1.3], [4.6, -20.1, 1.4], [-2.6, -20.4, 1.2], [2.4, -20.6, 1.1], [-7.4, -6.6, 1.1], [7.6, -9.6, 1.2], [-7.6, 0.4, 1.0], [7.7, 0.9, 1.1], [-7.3, 6.6, 1.0], [1.4, 7.9, 0.9], [-0.9, 8.6, 1.0], [7.4, -3.6, 1.0], [-1.9, 5.9, 0.9], [0.6, -7.3, 1.0], [-5.3, -6.9, 1.0]]) tree(x, z, s);
  const stones = (x0, z0, x1, z1) => { const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.5); for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n + (r0() - 0.5) * 0.12, z = z0 + (z1 - z0) * i / n + (r0() - 0.5) * 0.12; if (nearRoad(x, z) > 0.7) piece(G.cyl(0.2, 0.23, 0.06, 6), 0xb4aa92, x, hAt(z) + 0.03, z, { r: [0, r0() * 3, 0], cast: false, crumple: 0.02 }); } };
  const flowers = (x, z) => { if (nearRoad(x, z) < 1.0) return; for (let i = 0; i < 12; i++) { const a = r0() * 6.283, d = 0.1 + r0() * 0.55; piece(G.oct(0.085), [C.cream, C.verm, C.cream, C.creamD][i % 4], x + Math.cos(a) * d, hAt(z) + 0.07, z + Math.sin(a) * d * 0.8, { fold: false, cast: false, crumple: 0 }); } };
  const GRASS = 0x304a52, CROP = 0x4a4436;
  for (const [x, z, w, d, s] of [[-1.2, 8.6, 2.6, 1.8, 41], [1.6, 9.6, 2.2, 1.4, 42], [-7.0, 6.4, 1.6, 2.4, 43], [7.3, 5.6, 1.4, 2.0, 44], [2.0, 3.6, 1.6, 1.2, 45], [-2.6, 3.6, 2.2, 1.0, 46], [3.6, -0.8, 2.6, 1.8, 47], [-1.2, -2.6, 1.8, 1.6, 48], [6.9, -2.6, 1.8, 2.2, 49], [-3.6, -6.6, 3.0, 1.2, 50], [-7.2, -6.0, 1.4, 2.0, 51], [2.4, -7.4, 2.4, 1.6, 52], [-0.6, -10.8, 2.6, 1.2, 53], [6.6, -11.0, 2.0, 1.4, 54], [-7.0, -9.6, 1.6, 2.0, 55], [3.2, -11.5, 1.8, 1.0, 56]])
    patch([[x - w / 2, z - d / 2], [x + w / 2, z - d / 2 + 0.2], [x + w / 2 + 0.2, z + d / 2], [x - w / 2 - 0.1, z + d / 2 - 0.15]], s % 3 ? GRASS : CROP, s);
  wall(-2.4, 9.6, 0.2, 9.4); wall(0.4, 4.6, 2.9, 4.3); wall(-7.6, 5.2, -7.2, 7.6); wall(2.2, 0.2, 5.0, -0.1); wall(-2.2, -1.7, -0.3, -3.4); wall(5.9, -1.5, 7.9, -1.9); wall(-5.2, -7.0, -2.0, -6.9); wall(1.2, -6.9, 3.6, -8.3); wall(-1.9, -11.5, 0.7, -11.6); wall(5.6, -10.4, 7.6, -10.6);
  fence(-2.0, 7.9, -0.4, 7.7); fence(3.0, -1.6, 4.8, -1.4); fence(-7.6, -8.6, -6.4, -10.6); fence(2.4, -11.0, 4.0, -11.9); fence(6.2, 4.6, 8.0, 6.6);
  plot(-1.2, 8.7, 1.5, 1.1, 0.1); plot(1.6, 9.6, 1.3, 0.9, -0.1); plot(-2.6, 3.6, 1.4, 0.7, 0.05); plot(3.6, -0.8, 1.6, 1.1, 0.1); plot(6.9, -2.9, 1.1, 1.3, 0); plot(-3.6, -6.6, 1.8, 0.8, 0.05); plot(2.4, -7.4, 1.5, 1.0, -0.2); plot(-0.6, -10.8, 1.6, 0.8, 0.05); plot(-7.0, -9.4, 1.0, 1.3, 0.1);
  stones(-2.4, 8.0, -3.4, 8.8); stones(0.6, 3.0, 0.4, 2.2); stones(-2.4, -2.0, -3.0, -1.1); stones(-5.2, -3.4, -5.5, -4.0); stones(1.0, -4.0, 1.6, -4.6); stones(3.2, -8.0, 3.9, -9.4); stones(0.9, -10.6, 1.4, -9.6); stones(-2.8, -8.0, -2.4, -8.8); stones(7.0, -1.2, 6.2, -0.2); stones(-6.6, -9.9, -5.8, -10.9);
  for (const [x, z] of [[-0.2, 7.8], [2.6, 8.9], [-7.2, 3.4], [7.6, 3.6], [1.9, 3.0], [-1.0, -1.4], [4.6, -2.4], [-7.4, -4.9], [-0.4, -7.2], [5.0, -8.0], [-4.4, -8.6], [1.8, -11.9], [7.0, -9.6], [-6.9, -11.9]]) flowers(x, z);
  for (let i = 0; i < 90; i++) { const z = Z0 + 1.5 + r0() * (Z1 - Z0 - 3), x = (r0() * 2 - 1) * (halfW(z) - 0.9); if (nearRoad(x, z) > 0.9) (i % 3 ? tuft : i % 2 ? bush : (a, b) => rock(a, b, 0.14 + r0() * 0.16))(x, z); }
  // harbour: a pier, rowboats on the water, lobster traps, a net laid out to dry
  { const g = group(-5.5, 12.6, 0, 0); piece(G.box(1.3, 0.1, 3.2), C.kraft, 0, 0.12, 0, { to: g }); for (const [x, z] of [[-0.6, -1.3], [0.6, -1.3], [-0.6, 0.2], [0.6, 0.2], [-0.6, 1.5], [0.6, 1.5]]) piece(G.box(0.1, 0.7, 0.1), C.wood, x, -0.15, z, { to: g, fold: false }); for (let i = 0; i < 7; i++) piece(G.box(1.32, 0.012, 0.03), C.kraftD, 0, 0.18, -1.4 + i * 0.47, { to: g, fold: false, cast: false }); }
  const boat = (x, z, ry) => { const g = group(x, z, ry, -0.32); piece(G.oct(0.5), C.kraft, 0, 0.12, 0, { to: g, s: [0.62, 0.42, 1.5] }); piece(G.box(0.5, 0.03, 0.1), C.creamD, 0, 0.2, -0.2, { to: g, fold: false }); piece(G.box(0.5, 0.03, 0.1), C.creamD, 0, 0.2, 0.25, { to: g, fold: false }); };
  boat(-7.3, 12.9, 0.3); boat(-3.9, 13.3, -0.5); boat(-6.9, 14.6, 1.2); boat(3.4, 12.9, 0.8);
  for (const [x, z] of [[-3.9, 10.3], [-3.5, 10.5], [-3.7, 10.0], [-6.9, 9.9]]) { const m = piece(G.box(0.34, 0.22, 0.26), C.kraftD, x, 0.11, z, { r: [0, r0(), 0] }); m.add(new THREE.LineSegments(new THREE.EdgesGeometry(G.box(0.34, 0.22, 0.09), 1), foldLine(C.cream, 0.6))); }
  { const pts = []; for (let i = 0; i <= 6; i++) { pts.push(-7.6 + i * 0.22, 0.02, 8.4, -7.6 + i * 0.22 + 0.4, 0.02, 9.6, -7.6, 0.02, 8.4 + i * 0.2, -6.0, 0.02, 8.5 + i * 0.2); } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); scene.add(new THREE.LineSegments(g, foldLine(C.creamD, 0.5))); }
  // lighthouse on its rock at the corner of the island
  { const x = 7.0, z = 9.6, g = group(x, z, 0, 0); piece(G.ico(1.3), C.slate, 0, 0.3, 0.1, { to: g, s: [1.2, 0.55, 1.0], r: [0.3, 0.6, 0], crumple: 0.08 }); piece(G.cyl(0.36, 0.56, 2.5, 8), C.cream, 0, 1.8, 0, { to: g }); piece(G.cyl(0.47, 0.51, 0.5, 8), C.verm, 0, 1.5, 0, { to: g }); piece(G.cyl(0.56, 0.5, 0.1, 8), C.slate, 0, 3.1, 0, { to: g });
    piece(G.cyl(0.3, 0.3, 0.45, 8), FLAME, 0, 3.38, 0, { to: g }); piece(G.cone(0.46, 0.5, 8), C.verm, 0, 3.85, 0, { to: g }); lamp(x, 3.4, z, 10, 7); ao(x, z, 3.4); }

  // ---------- towers: cream and kraft, told apart by silhouette alone ----------
  const TW = {
    archer: g => { for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) piece(G.box(0.09, 1.7, 0.09), C.wood, x, 0.9, z, { to: g, r: [z * -0.12, 0, x * 0.12] }); piece(G.box(0.7, 0.05, 0.05), C.wood, 0, 0.7, 0.3, { to: g, fold: false }); piece(G.box(0.7, 0.05, 0.05), C.wood, 0, 1.2, 0.27, { to: g, fold: false });
      piece(G.box(0.95, 0.09, 0.95), C.kraft, 0, 1.78, 0, { to: g }); piece(G.box(0.72, 0.34, 0.72), C.cream, 0, 2.0, 0, { to: g }); piece(G.cone(0.72, 0.6, 4), C.kraftD, 0, 2.48, 0, { to: g, r: [0, Math.PI / 4, 0] }); piece(G.box(0.1, 0.15, 0.1), AMBER, 0.52, 1.72, 0.4, { to: g }); return [0.52, 1.72, 0.4]; },
    barracks: g => { piece(G.cone(0.82, 1.05, 6), C.cream, 0, 0.6, 0, { to: g, r: [0, 0.5, 0], crumple: 0.05 }); piece(G.cone(0.5, 0.7, 5), C.creamD, 0.8, 0.42, 0.25, { to: g, crumple: 0.05 }); piece(G.box(0.04, 0.7, 0.04), C.wood, 0, 1.4, 0, { to: g, fold: false }); piece(G.shed(0.36, 0.02, 0.22), C.verm, 0.2, 1.52, 0, { to: g, fold: false });
      piece(new THREE.PlaneGeometry(0.24, 0.42), WINDOW, 0, 0.3, 0.68, { to: g, r: [-0.6, 0, 0] }); return [0, 0.5, 0.95]; },
    lens: g => { piece(G.cyl(0.46, 0.58, 1.15, 10), C.cream, 0, 0.62, 0, { to: g }); piece(G.cyl(0.6, 0.52, 0.12, 10), C.kraft, 0, 1.26, 0, { to: g }); const ring = piece(new THREE.TorusGeometry(0.52, 0.09, 4, 12), C.kraftD, 0, 1.95, 0, { to: g, r: [FACE * 0.45, 0, 0], crumple: 0 }); piece(new THREE.CircleGeometry(0.46, 12), glow(0.8, 0.86, 0.9), 0, 0, 0.012, { to: ring });
      piece(G.box(0.1, 0.15, 0.1), AMBER, 0.5, 0.8, 0.36, { to: g }); return [0.5, 0.8, 0.4]; },
    beacon: g => { piece(G.cyl(0.62, 0.74, 0.42, 6), C.stone, 0, 0.26, 0, { to: g }); piece(G.cyl(0.5, 0.58, 0.2, 6), C.creamD, 0, 0.56, 0, { to: g }); piece(G.cyl(0.62, 0.34, 0.26, 8), C.kraftD, 0, 0.8, 0, { to: g }); piece(G.oct(0.3), FLAME, 0, 1.2, 0, { to: g, s: [1, 1.6, 1] }); piece(G.oct(0.18), glow(1.8, 0.7, 0.2), 0.14, 1.06, 0.12, { to: g, s: [1, 1.5, 1] }); return [0, 1.2, 0.1]; },
  };
  for (const [x, z] of POSTS2) { const g = group(x, z); piece(G.box(0.06, 1.0, 0.06), C.wood, 0, 0.5, 0, { to: g, fold: false }); piece(G.box(0.34, 0.05, 0.05), C.wood, 0.14, 1.0, 0, { to: g, fold: false }); piece(G.cyl(0.1, 0.1, 0.24, 6), AMBER, 0.28, 0.8, 0, { to: g }); piece(G.cone(0.14, 0.09, 6), C.verm, 0.28, 0.97, 0, { to: g, fold: false }); lamp(x + 0.28, hAt(z) + 0.78, z + 0.05, 4.2, 3.6); }

  // ---------- units: black paper, round amber eyes, a thin pale rim; exaggerated about 1.5x against the houses ----------
  const EYE = glow(1.55, 0.86, 0.22), PUPIL = new THREE.MeshBasicMaterial({ color: 0x120e1c }), GLINT = new THREE.MeshBasicMaterial({ color: 0xfff6e0 }), RIM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.62, 0.68, 0.86), side: THREE.BackSide });
  const dark = (geo, x, y, z, o = {}) => { const m = piece(geo, C.black, x, y, z, { ...o, rim: 0.42 }); const r = new THREE.Mesh(geo, RIM); r.scale.setScalar(1.07); m.add(r); return m; };   // body + a slightly larger back-faced shell = the rim
  const eyes = (g, y, z, gap, r) => { for (const s of [-1, 1]) { const e = piece(new THREE.CircleGeometry(r, 16), EYE, s * gap, y, z, { to: g, r: [FACE, 0, 0] }); piece(new THREE.CircleGeometry(r * 0.45, 12), PUPIL, 0, -r * 0.08, 0.004, { to: e }); piece(new THREE.CircleGeometry(r * 0.18, 8), GLINT, r * 0.25, r * 0.28, 0.008, { to: e }); } };
  const barBack = new THREE.MeshBasicMaterial({ color: 0x08070e }), barEnemy = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.5, 0.16) }), barAlly = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.62, 0.9, 0.55) });
  const bar = (g, y, w, k, ally) => { const b = piece(new THREE.PlaneGeometry(w + 0.07, 0.15), barBack, 0, y, 0, { to: g, r: [FACE, 0, 0] }); piece(new THREE.PlaneGeometry(w * k, 0.085), ally ? barAlly : barEnemy, -w * (1 - k) / 2, 0, 0.004, { to: b }); };
  const UNIT = {
    fry: g => { dark(G.ico(0.5), 0, 0.5, 0, { to: g, s: [1.05, 0.95, 0.95], r: [0.2, 0.4, 0] }); dark(G.cone(0.16, 0.32, 4), 0, 1.04, -0.05, { to: g }); for (const s of [-1, 1]) dark(G.cone(0.12, 0.28, 4), s * 0.52, 0.42, 0, { to: g, r: [0, 0, -s * 1.2] }); eyes(g, 0.62, 0.42, 0.19, 0.14); return [1.2, 1.0]; },
    crab: g => { dark(G.cyl(0.56, 0.46, 0.4, 6), 0, 0.36, 0, { to: g, s: [1.1, 1, 0.8] }); for (const s of [-1, 1]) { dark(G.oct(0.24), s * 0.7, 0.5, 0.14, { to: g, s: [1, 1.2, 0.7] }); dark(G.cone(0.07, 0.28, 4), s * 0.44, 0.12, 0.26, { to: g, r: [0, 0, s * 2.4] }); } eyes(g, 0.68, 0.3, 0.17, 0.13); return [0.9, 1.25]; },
    octo: g => { dark(G.ico(0.5), 0, 0.74, 0, { to: g, s: [1, 1.15, 1], r: [0.1, 0.3, 0] }); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283 + 0.4; dark(G.cone(0.12, 0.5, 4), Math.cos(a) * 0.4, 0.24, Math.sin(a) * 0.36, { to: g, r: [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9] }); } eyes(g, 0.8, 0.44, 0.19, 0.14); return [1.45, 1.05]; },
    boss: g => { dark(G.ico(1.25), 0, 1.05, 0, { to: g, s: [1.12, 0.8, 1.0], r: [0.25, 0.5, 0] }); dark(G.cone(0.52, 1.1, 4), 0, 1.25, -1.25, { to: g, r: [-1.2, 0, 0] }); for (const s of [-1, 1]) dark(G.cone(0.27, 0.62, 4), s * 1.25, 0.75, 0.12, { to: g, r: [0, 0, -s * 1.3] }); piece(G.box(1.35, 0.12, 0.6), C.creamD, 0, 0.4, 0.78, { to: g }); eyes(g, 1.38, 0.98, 0.45, 0.26); return [2.5, 2.4]; },
    hero: g => { piece(G.cone(0.6, 1.3, 6), C.verm, 0, 0.68, 0, { to: g, r: [0, 0.5, 0], rim: 0.6, crumple: 0.05 }); piece(G.ico(0.27), C.cream, 0, 1.48, 0.02, { to: g, rim: 0.6 }); piece(G.cyl(0.5, 0.5, 0.06, 8), C.kraftD, 0, 1.7, 0, { to: g, rim: 0.6 }); piece(G.cone(0.27, 0.36, 6), C.kraftD, 0, 1.9, 0, { to: g, rim: 0.6 });
      piece(G.box(0.06, 0.5, 0.06), C.wood, 0.6, 1.06, 0.14, { to: g, fold: false }); piece(G.cyl(0.12, 0.12, 0.24, 6), FLAME, 0.6, 0.74, 0.14, { to: g }); return [2.2, 1.0]; },
    soldier: g => { piece(G.cone(0.3, 0.7, 5), C.cream, 0, 0.37, 0, { to: g, rim: 0.6 }); piece(G.ico(0.18), C.creamD, 0, 0.84, 0.01, { to: g }); piece(G.cone(0.22, 0.2, 6), C.kraft, 0, 1.04, 0, { to: g, rim: 0.6 }); piece(G.box(0.04, 0.7, 0.04), C.wood, 0.3, 0.6, 0.06, { to: g, fold: false }); piece(G.box(0.09, 0.12, 0.09), AMBER, 0.3, 0.98, 0.06, { to: g }); return [1.3, 0.6]; },
  };
  PUPIL.userData.cls = GLINT.userData.cls = 'G';
  // the rest of the cast, in the same folded black paper: flying fish, gull shadow, turtle, baby octopus; and the villagers who come to help
  Object.assign(UNIT, {
    fish: g => { dark(G.oct(0.44), 0, 0.46, 0, { to: g, s: [0.78, 0.86, 1.25] }); dark(G.cone(0.22, 0.42, 4), 0, 0.5, -0.62, { to: g, r: [-1.2, 0, 0] }); for (const s of [-1, 1]) dark(G.cone(0.1, 0.5, 3), s * 0.46, 0.56, -0.05, { to: g, r: [0, 0, -s * 1.0] }); dark(G.cone(0.1, 0.26, 3), 0, 0.92, -0.1, { to: g }); eyes(g, 0.56, 0.36, 0.15, 0.12); return [1.05, 0.8]; },
    gull: g => { dark(G.oct(0.36), 0, 0.5, 0, { to: g, s: [0.9, 0.8, 1.3] }); for (const s of [-1, 1]) dark(G.cone(0.3, 1.1, 3), s * 0.72, 0.6, -0.05, { to: g, r: [0.2, 0, -s * 1.35], s: [1, 1, 0.35] }); dark(G.cone(0.1, 0.3, 4), 0, 0.44, 0.5, { to: g, r: [1.4, 0, 0] }); eyes(g, 0.6, 0.3, 0.13, 0.1); return [1.05, 1.5]; },
    turtle: g => { dark(G.ico(0.8), 0, 0.5, 0, { to: g, s: [1.15, 0.62, 1.0], r: [0.2, 0.3, 0] }); dark(G.ico(0.3), 0, 0.5, 0.78, { to: g }); for (const [x, z] of [[-0.75, 0.45], [0.75, 0.45], [-0.75, -0.45], [0.75, -0.45]]) dark(G.cone(0.2, 0.3, 4), x, 0.15, z, { to: g }); piece(G.box(0.9, 0.08, 0.3), C.creamD, 0, 0.2, 0.5, { to: g }); eyes(g, 0.62, 1.03, 0.14, 0.11); return [1.25, 1.7]; },
    baby: g => { dark(G.ico(0.28), 0, 0.4, 0, { to: g, s: [1, 1.1, 1] }); for (let i = 0; i < 4; i++) { const a = i / 4 * 6.283 + 0.6; dark(G.cone(0.07, 0.26, 4), Math.cos(a) * 0.22, 0.13, Math.sin(a) * 0.2, { to: g, r: [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9] }); } eyes(g, 0.44, 0.25, 0.11, 0.09); return [0.8, 0.6]; },
    villager: g => { piece(G.cone(0.3, 0.7, 5), C.kraft, 0, 0.37, 0, { to: g, rim: 0.6 }); piece(G.ico(0.18), C.cream, 0, 0.84, 0.01, { to: g }); piece(G.cyl(0.26, 0.2, 0.08, 6), C.kraftD, 0, 1.0, 0, { to: g, rim: 0.6 }); piece(G.box(0.04, 0.9, 0.04), C.wood, 0.3, 0.6, 0.06, { to: g, fold: false }); return [1.2, 0.6]; },
  });

  // ---------- sea: deep navy paper folded into long bands that overlap and bob (one mesh; the bobbing is done in the vertex shader); cream only on the top of a fold ----------
  const reflections = [];
  { const sea = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), grain(new THREE.MeshLambertMaterial({ color: 0x18274a, map: paper }))); sea.rotation.x = -Math.PI / 2; sea.position.y = -0.95; SC.add(sea);
    const NAVY = [0x1f2f56, 0x273a63, 0x19264a, 0x2e416c, 0x22335b].map(c => new THREE.Color(c)), A = { pos: [], col: [], bob: [] }, CR = { pos: [], bob: [] }, RG = { pos: [], bob: [] };
    // each band is one folded strip: a long back slope that catches the moon, a sharp ridge, a short steep face towards the viewer
    let k = 0; for (let z = Z0 - 9; z < Z1 + 11; z += 1.2 + ((k * 7) % 5) * 0.15, k++) { const ph = k * 2.3, c = NAVY[k % 5], bob = [k * 1.3, 0.45 + (k % 3) * 0.14], H = x => 0.2 + 0.42 * Math.pow(Math.max(0, Math.sin(x * 0.55 + ph) * 0.6 + Math.sin(x * 1.3 + ph * 2) * 0.4), 1.4), ZO = x => Math.sin(x * 0.35 + ph) * 0.4 + Math.sin(x * 0.9 + ph * 1.7) * 0.12;
      const put3 = (T, v) => { for (let i = 0; i < v.length; i += 3) { T.pos.push(v[i], v[i + 1] - 0.92, v[i + 2] + z); T.bob.push(bob[0], bob[1]); if (T.col) T.col.push(c.r, c.g, c.b); } };
      for (let x = -14; x < 14; x += 0.7) { const x1 = x + 0.7, a = [x, H(x), ZO(x)], b = [x1, H(x1), ZO(x1)];
        put3(A, [a[0], 0, a[2] + 0.2, b[0], 0, b[2] + 0.2, a[0], a[1], a[2], a[0], a[1], a[2], b[0], 0, b[2] + 0.2, b[0], b[1], b[2], a[0], a[1], a[2], b[0], b[1], b[2], a[0], 0, a[2] - 1.5, a[0], 0, a[2] - 1.5, b[0], b[1], b[2], b[0], 0, b[2] - 1.5]);
        put3(RG, [a[0], a[1] + 0.01, a[2] + 0.02, b[0], b[1] + 0.01, b[2] + 0.02, a[0], a[1] + 0.01, a[2] - 0.05, a[0], a[1] + 0.01, a[2] - 0.05, b[0], b[1] + 0.01, b[2] + 0.02, b[0], b[1] + 0.01, b[2] - 0.05]);
        const wa = Math.min(1, Math.max(0, (a[1] - 0.36) / 0.2)), wb = Math.min(1, Math.max(0, (b[1] - 0.36) / 0.2));
        if (wa + wb > 0) put3(CR, [a[0], a[1] + 0.02, a[2] + 0.04 * wa, b[0], b[1] + 0.02, b[2] + 0.04 * wb, a[0], a[1] + 0.02, a[2] - 0.1 * wa, a[0], a[1] + 0.02, a[2] - 0.1 * wa, b[0], b[1] + 0.02, b[2] + 0.04 * wb, b[0], b[1] + 0.02, b[2] - 0.1 * wb]); } }
    const mk = (T, mat) => { const g = new THREE.BufferGeometry(), uv = []; for (let i = 0; i < T.pos.length; i += 3) uv.push(T.pos[i] * 0.4, T.pos[i + 2] * 0.4 + T.pos[i + 1]); g.setAttribute('position', new THREE.Float32BufferAttribute(T.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('aBob', new THREE.Float32BufferAttribute(T.bob, 2));
      if (T.col) g.setAttribute('color', new THREE.Float32BufferAttribute(T.col, 3)); g.computeVertexNormals(); const m = new THREE.Mesh(g, mat); m.frustumCulled = false; SC.add(m); return m; };
    mk(A, grain(new THREE.MeshLambertMaterial({ map: paper, flatShading: true, vertexColors: true, side: THREE.DoubleSide }), 'sea')).receiveShadow = true;
    mk(RG, bobBasic(new THREE.MeshBasicMaterial({ color: 0x384a74, map: paper, side: THREE.DoubleSide }))); mk(CR, bobBasic(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.48, 0.4), map: paper, side: THREE.DoubleSide })));
    // light on the water: one very soft amber streak under the lighthouse and one under the pier, no hard shape
    { const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128; const c2 = cv.getContext('2d'), im = c2.createImageData(64, 128);
      for (let y = 0; y < 128; y++) for (let x = 0; x < 64; x++) { const u = (x - 31.5) / 32, v = y / 127, w = Math.exp(-u * u * 7) * Math.pow(1 - v, 1.6) * Math.min(1, v * 8), o = (y * 64 + x) * 4; im.data[o] = 255 * w; im.data[o + 1] = 150 * w; im.data[o + 2] = 50 * w; im.data[o + 3] = 255; }
      c2.putImageData(im, 0, 0); const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
      const gm = new THREE.MeshBasicMaterial({ map: tx, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.16 });
      for (const [x, z, w, d] of [[7.0, 11.9, 1.7, 5.2], [-6.0, 12.3, 1.3, 4.2]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), gm); m.rotation.x = -Math.PI / 2; m.position.set(x, -0.18, z + d / 2); m.renderOrder = 2; SC.add(m); reflections.push({ m, x, ph: x }); } } }

  // ---------- light: the moon casts the shadows (baked; redone only when a tower goes up or comes down); the warm light of the lanterns is baked ----------
  SC.add(new THREE.HemisphereLight(0x5c6890, 0x0c0e18, 1.2));
  const moon = new THREE.DirectionalLight(0xc2cce6, 1.9); moon.position.set(-16, 26, -12); moon.target.position.set(0, 0, -4); moon.castShadow = true; moon.shadow.mapSize.set(4096, 4096); moon.shadow.bias = -0.0008; moon.shadow.normalBias = 0.04; moon.shadow.radius = 3;
  Object.assign(moon.shadow.camera, { left: -15, right: 15, top: 24, bottom: -24, near: 1, far: 90 }); moon.shadow.autoUpdate = false; moon.shadow.needsUpdate = true; SC.add(moon, moon.target);
  // three live point lights, always present so no shader is ever rebuilt mid-game: the keeper's lantern and two for flashes and fireballs
  const heroLight = new THREE.PointLight(0xffa040, 0, 3.6, 1.6), fxLights = [0, 1].map(() => ({ l: new THREE.PointLight(0xffc070, 0, 7, 1.6), t: 0, life: 1, power: 0 })); SC.add(heroLight); for (const f of fxLights) SC.add(f.l);

  // ---------- the village windows are the lives: twenty of them can go dark, one mesh ----------
  scene.updateMatrixWorld(true);
  const winLit = new THREE.Color(1.15, 0.66, 0.22), winOut = new THREE.Color(0.05, 0.045, 0.06), winOrder = [];
  const winMesh = (() => { const pos = [], col = [], uv = []; WIN.forEach(w => { const g = w.geometry.toNonIndexed(), P = g.attributes.position, U = g.attributes.uv; for (let i = 0; i < P.count; i++) { _p.fromBufferAttribute(P, i).applyMatrix4(w.matrixWorld); pos.push(_p.x, _p.y, _p.z); col.push(winLit.r, winLit.g, winLit.b); uv.push(U.getX(i), U.getY(i)); } w.removeFromParent(); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); const m = new THREE.Mesh(g, GV); SC.add(m); return m; })();
  { const r = rng(5), idx = WIN.map((_, i) => i); for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; } winOrder.push(...idx.slice(0, 20)); }
  let winShown = 20;
  const setWindows = n => { n = clamp(Math.round(n), 0, 20); if (n === winShown) return; winShown = n; const c = winMesh.geometry.attributes.color; winOrder.forEach((w, i) => { const k = i < n ? winLit : winOut; for (let v = 0; v < 6; v++) c.setXYZ(w * 6 + v, k.r, k.g, k.b); }); c.needsUpdate = true; };

  // ---------- merge the scenery, then bake the lantern light into it ----------
  const STAT = []; for (const o of bake(scene, true)) { SC.add(o); if (o.userData.cls === 'P') { o.geometry.setAttribute('aLamp', new THREE.Float32BufferAttribute(new Float32Array(o.geometry.attributes.position.count), 1)); STAT.push(o); } }
  const lampToStatic = (l, sign) => { const R2 = l.reach * l.reach; for (const o of STAT) { const P = o.geometry.attributes.position.array, N = o.geometry.attributes.normal.array, A = o.geometry.attributes.aLamp, a = A.array; let hit = false;
      for (let i = 0, v = 0; i < P.length; i += 3, v++) { const dx = P[i] - l.x, dz = P[i + 2] - l.z; if (dx * dx + dz * dz >= R2) continue; const e = irr(l, P[i], P[i + 1], P[i + 2], N[i], N[i + 1], N[i + 2]); if (e) { a[v] = Math.max(0, a[v] + sign * e); hit = true; } } if (hit) A.needsUpdate = true; } };
  const lampAll = (l, sign) => { lampToMap(l, sign); lampToStatic(l, sign); };
  for (const l of LAMPS) lampAll(l, 1); scene.clear(); renderer.info.autoReset = false;

  // ---------- towers: built from the same pieces as the look-dev, merged per tower; a level shows as size and pips, a speciality as a pennant ----------
  const TOP = { archer: 2.0, barracks: 0.9, lens: 1.95, beacon: 1.2 }, CREST = { archer: 2.78, barracks: 1.74, lens: 2.5, beacon: 1.6 }, towers = SPOTS.map(() => null);
  const setTower = (i, t) => { const cur = towers[i], key = t ? t.type + t.lvl + (t.spec || '') : ''; if ((cur ? cur.key : '') === key) return;
    if (cur) { DYN.remove(cur.h); for (const o of cur.h.children) if (o.geometry !== haloGeo) o.geometry.dispose(); lampAll(cur.lamp, -1); towers[i] = null; }
    rings[i].visible = !t; moon.shadow.needsUpdate = true; if (!t) return;
    const [x, z] = SPOTS[i], S = [0.86, 0.93, 1, 1.08][t.lvl - 1], g = new THREE.Group(), p = TW[t.type](g);
    for (let k = 0; k < Math.min(2, t.lvl - 1); k++) piece(G.box(0.17, 0.17, 0.17), C.verm, -0.42 + k * 0.26, 0.1, 0.68, { to: g, r: [0, 0.4, 0] });
    if (t.lvl === 4) { const second = Object.keys(TOWERS[t.type].spec)[1] === t.spec, y = CREST[t.type]; piece(G.box(0.04, 0.62, 0.04), C.wood, 0, y + 0.3, 0, { to: g, fold: false }); piece(G.shed(0.46, 0.03, 0.26), second ? C.slate : C.verm, 0.25, y + 0.32, 0, { to: g, rim: 0.6 }); }
    const h = new THREE.Group(); h.position.set(x, hAt(z), z); h.scale.setScalar(S); for (const o of bake(g, false)) h.add(o); halo(p[0], p[1], p[2], 4.6, h);
    const l = { x: x + p[0] * S, y: hAt(z) + p[1] * S, z: z + p[2] * S, power: 4.6, reach: 4.2 }; DYN.add(h); lampAll(l, 1); towers[i] = { key, h, S, lamp: l, top: hAt(z) + TOP[t.type] * S, pop: cur ? 0.18 : 0.3 }; };

  // ---------- units: one merged model per kind, shared by every instance; health bars and ground shade are drawn in two batches ----------
  const PROTO = {}, FREE = {}, proto = kind => PROTO[kind] || (PROTO[kind] = (() => { const g = new THREE.Group(), [top, w] = UNIT[kind](g); return { parts: bake(g, false), top, w }; })());
  const takeUnit = kind => { const f = FREE[kind] || (FREE[kind] = []); let u = f.pop(); if (!u) { const P = proto(kind), g = new THREE.Group(); for (const o of P.parts) { const c = o.isLineSegments ? new THREE.LineSegments(o.geometry, o.material) : new THREE.Mesh(o.geometry, o.material); c.receiveShadow = o.userData.cls === 'P'; g.add(c); } u = { g, kind, top: P.top, w: P.w }; } DYN.add(u.g); u.age = 0; u.sq = 0; return u; };
  const freeUnit = u => { DYN.remove(u.g); FREE[u.kind].push(u); };
  const quadBatch = (n, mat, order) => { const g = new THREE.BufferGeometry(), pos = new Float32Array(n * 12), col = new Float32Array(n * 12), uv = new Float32Array(n * 8), idx = new Uint16Array(n * 6);
    for (let i = 0; i < n; i++) { idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6); uv.set([0, 0, 1, 0, 0, 1, 1, 1], i * 8); }
    const pa = new THREE.BufferAttribute(pos, 3), ca = new THREE.BufferAttribute(col, 3); pa.setUsage(THREE.DynamicDrawUsage); ca.setUsage(THREE.DynamicDrawUsage); g.setAttribute('position', pa); g.setAttribute('color', ca); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(new THREE.BufferAttribute(idx, 1));
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = order; SC.add(m); let k = 0;
    return { begin() { k = 0; }, quad(cx, cy, cz, ax, ay, az, bx, by, bz, r = 1, gg = 1, b = 1) { if (k >= n) return; const o = k * 12; for (let c = 0; c < 4; c++) { const sa = c & 1 ? 1 : -1, sb = c & 2 ? 1 : -1, q = o + c * 3; pos[q] = cx + sa * ax + sb * bx; pos[q + 1] = cy + sa * ay + sb * by; pos[q + 2] = cz + sa * az + sb * bz; col[q] = r; col[q + 1] = gg; col[q + 2] = b; } k++; },
      end() { g.setDrawRange(0, k * 6); pa.needsUpdate = true; ca.needsUpdate = true; } }; };
  const UY = Math.cos(FACE), UZ = Math.sin(FACE);                                  // "up" of the paper pieces that face the viewer
  const bars = quadBatch(200, new THREE.MeshBasicMaterial({ vertexColors: true }), 4), blobs = quadBatch(120, new THREE.MeshBasicMaterial({ map: aoTex, transparent: true, depthWrite: false, color: 0x02030a, side: THREE.DoubleSide }), 1);
  const scrapB = quadBatch(260, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, map: paper }), 5), glowB = quadBatch(40, new THREE.MeshBasicMaterial({ map: pLight, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide }), 3);
  const drawBar = (x, y, z, w, k, ally) => { bars.quad(x, y, z, (w + 0.07) / 2, 0, 0, 0, 0.075 * UY, 0.075 * UZ, 0.03, 0.027, 0.055); const f = w * clamp(k); if (f > 0.01) bars.quad(x - (w - f) / 2, y + 0.004, z + 0.006, f / 2, 0, 0, 0, 0.0425 * UY, 0.0425 * UZ, ally ? 0.62 : 1.0, ally ? 0.9 : 0.5, ally ? 0.55 : 0.16); };
  const live = new Map();                                                          // id -> the model standing for an enemy, a soldier, a villager or the keeper
  const FLY = 1.7, unitY = (z, fly) => lift(z) + 0.06 + (fly ? FLY : 0);

  // ---------- effects: the brightest things on the board. Arrows, light rays, fireballs, the pop ring, scraps of paper and sparks, the flare from the lighthouse ----------
  const pool = make => { const free = []; return { take() { const o = free.pop() || make(); o.visible = true; return o; }, give(o) { o.visible = false; free.push(o); } }; };
  const fxM = (geo, mat) => () => { const m = new THREE.Mesh(geo, mat); DYN.add(m); return m; };
  const arrows = pool(fxM(G.box(0.06, 0.06, 0.9), glow(2.0, 1.25, 0.4))), rays = pool(fxM(G.box(0.1, 0.1, 1), glow(1.5, 1.7, 1.9))), balls = pool(fxM(G.oct(0.26), glow(1.9, 0.95, 0.3))), beams = pool(fxM(G.box(0.34, 0.34, 1), glow(2.0, 1.8, 1.3)));
  const ringGeo = new THREE.RingGeometry(0.88, 1, 40), ringsFx = pool(() => { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, depthWrite: false })); m.renderOrder = 5; DYN.add(m); return m; });
  const fx = [], parts = [], _a = new THREE.Vector3(), _b = new THREE.Vector3();
  const add = (life, step, end) => fx.push({ t: 0, life, step, end });
  const ring = (x, y, z, r0, r1, life, col, flat) => { const m = ringsFx.take(); m.position.set(x, y, z); m.rotation.set(flat ? -Math.PI / 2 : FACE, 0, 0); m.material.color.setRGB(col[0], col[1], col[2]); add(life, k => { m.scale.setScalar(r0 + (r1 - r0) * (1 - (1 - k) * (1 - k))); m.material.opacity = 1 - k * k; }, () => ringsFx.give(m)); };
  const SCRAP = [[1.6, 0.42, 0.18], [1.7, 1.0, 0.28], [1.7, 1.6, 1.25], [0.8, 0.76, 0.66]];
  const scraps = (x, y, z, n, speed = 3) => { for (let i = 0; i < n && parts.length < 250; i++) { const a = Math.random() * 6.283, s = speed * (0.5 + Math.random()), c = SCRAP[i % SCRAP.length]; parts.push({ x, y, z, vx: Math.cos(a) * s, vy: 2 + Math.random() * 3, vz: Math.sin(a) * s * 0.6, t: 0, life: 0.45 + Math.random() * 0.4, c, rot: Math.random() * 6, sz: 0.06 + Math.random() * 0.06 }); } };
  const light = (x, y, z, power, life) => { const f = fxLights[0].t >= fxLights[0].life ? fxLights[0] : fxLights[1].t >= fxLights[1].life ? fxLights[1] : fxLights[0].t / fxLights[0].life > fxLights[1].t / fxLights[1].life ? fxLights[0] : fxLights[1]; f.l.position.set(x, y, z); f.t = 0; f.life = life; f.power = power; };
  const fly = (pl, a, b, life, arc = 0, grow = 1) => { const m = pl.take(), ax = a.x, ay = a.y, az = a.z, bx = b.x, by = b.y, bz = b.z; m.scale.setScalar(grow); add(life, k => { m.position.set(ax + (bx - ax) * k, ay + (by - ay) * k + Math.sin(k * Math.PI) * arc, az + (bz - az) * k); _a.set(bx, by + (arc ? Math.cos(k * Math.PI) * arc : 0), bz); m.lookAt(_a); }, () => pl.give(m)); };
  const stretch = (pl, a, b, life, thin) => { const m = pl.take(); m.position.copy(a).lerp(b, 0.5); m.lookAt(b); const len = a.distanceTo(b); add(life, k => { const w = thin ? 1 - k : Math.min(1, k * 5) * (1 - k * k); m.scale.set(Math.max(0.02, w), Math.max(0.02, w), len); }, () => pl.give(m)); };
  const rangeRing = new THREE.Mesh(new THREE.RingGeometry(0.975, 1, 72), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.7, 0.24), transparent: true, opacity: 0.9, depthTest: false })), rangeFill = new THREE.Mesh(new THREE.CircleGeometry(1, 72), new THREE.MeshBasicMaterial({ color: 0xffb050, transparent: true, opacity: 0.08, depthTest: false, depthWrite: false }));
  const selRing = new THREE.Mesh(new THREE.RingGeometry(0.78, 0.9, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.9, 0.3), transparent: true, depthWrite: false })), heroRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.72, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.9, 0.3), transparent: true, depthWrite: false }));
  for (const m of [rangeRing, rangeFill, selRing, heroRing]) { m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 6; DYN.add(m); }
  let heroSelOn = false;
  const slotTop = i => towers[i] ? _a.set(SPOTS[i][0], towers[i].top, SPOTS[i][1]) : _a.set(SPOTS[i][0], hAt(SPOTS[i][1]) + 1, SPOTS[i][1]);
  function onEvent(e, game) { const y = e.x != null ? lift(e.z) : 0;
    if (e.type === 'shot') { const b = _b.set(e.x, y + 0.6 + (e.fly ? FLY : 0), e.z), a = e.from ? _a.set(e.from.x, lift(e.from.z) + 0.9, e.from.z) : slotTop(e.slot);
      if (e.kind === 'arrow') fly(arrows, a, b, 0.15, 0, e.big ? 1.9 : 1); else if (e.kind === 'ray') { stretch(rays, a.clone(), b.clone(), 0.2, true); scraps(e.x, b.y, e.z, 2, 1.5); } else { b.y = y + 0.2; fly(balls, a, b, e.t, 3.2); } }
    else if (e.type === 'boom') { ring(e.x, y + 0.1, e.z, 0.3, e.r, 0.4, [1.9, 1.2, 0.5], true); scraps(e.x, y + 0.3, e.z, 9, 4); light(e.x, y + 1, e.z, 5, 0.35); }
    else if (e.type === 'kill') { const yy = y + 0.7 + (e.fly ? FLY : 0); ring(e.x, yy, e.z + 0.25, 0.25, e.enemy === 'boss' ? 2.6 : 0.8, 0.32, [1.9, 1.8, 1.5]); scraps(e.x, yy, e.z, e.enemy === 'boss' ? 30 : 8, 3); }
    else if (e.type === 'hit') scraps(e.x, y + 0.6, e.z, e.crit ? 5 : 2, 1.6);
    else if (e.type === 'flash') { stretch(beams, _a.set(LIGHTHOUSE.x, 3.4, LIGHTHOUSE.z).clone(), _b.set(e.x, y + 0.3, e.z).clone(), 0.5, false); ring(e.x, y + 0.12, e.z, 0.4, e.r, 0.5, [2.0, 1.8, 1.3], true); scraps(e.x, y + 0.4, e.z, 14, 5); light(e.x, y + 1.6, e.z, 7, 0.55); }
    else if (e.type === 'hskill') { ring(e.x, y + 0.12, e.z, 0.4, e.r, 0.45, [1.9, 1.2, 0.45], true); scraps(e.x, y + 0.5, e.z, 8, 3.5); }
    else if (e.type === 'reinforce' || e.type === 'rally' || e.type === 'go') ring(e.x, y + 0.1, e.z, 0.2, e.type === 'go' ? 0.5 : 0.8, 0.4, [1.5, 0.95, 0.35], true);
    else if (e.type === 'heroLvl') { ring(e.x, y + 0.1, e.z, 0.4, 1.6, 0.6, [1.9, 1.6, 0.9], true); scraps(e.x, y + 1.2, e.z, 10, 2.5); }
    else if (e.type === 'heroDown' || e.type === 'fall') scraps(e.x, y + 0.6, e.z, 6, 2);
    else if (e.type === 'build' || e.type === 'upgrade') { const [x, z] = SPOTS[e.slot]; ring(x, hAt(z) + 0.12, z, 0.4, 1.3, 0.4, [1.6, 1.3, 0.8], true); scraps(x, hAt(z) + 0.8, z, 6, 2.5); }
    else if (e.type === 'sell') { const [x, z] = SPOTS[e.slot]; scraps(x, hAt(z) + 0.5, z, 8, 2.5); } }

  // ---------- post: capped bloom, then tilt-shift (only the sea margins above and below the island soften) ----------
  const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(SC, camera)); const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.26, 0.5, 0.92); composer.addPass(bloom);
  const tilt = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uPx: { value: new THREE.Vector2(1 / 450, 1 / 800) }, uAmt: { value: 1.3 }, uHi: { value: 2 }, uLo: { value: -1 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uPx; uniform float uAmt, uHi, uLo; varying vec2 vUv; void main(){ float k = max(smoothstep(0.0, 0.07, vUv.y - uHi), smoothstep(0.0, 0.07, uLo - vUv.y)) * uAmt; vec3 c = vec3(0.0);
      if (k < 0.001) c = texture2D(tDiffuse, vUv).rgb; else { float n = 0.0; for (int i = -3; i <= 3; i++) for (int j = -3; j <= 3; j++) { float w = 1.0 - length(vec2(float(i), float(j))) / 4.6; c += texture2D(tDiffuse, vUv + vec2(float(i), float(j)) * uPx * k).rgb * w; n += w; } c /= n; }
      float v = smoothstep(1.15, 0.35, length((vUv - 0.5) * vec2(0.9, 1.1))); gl_FragColor = vec4(c * mix(0.82, 1.0, v), 1.0); }` });
  composer.addPass(tilt); composer.addPass(new OutputPass());
  const basePR = Math.min(devicePixelRatio || 1, 2), FQ = new URLSearchParams(location.search), FW = +FQ.get('w') || 0, FH = +FQ.get('h') || 0; let W = 1, H = 1, scale = 1;   // ?w=390&h=844 pins the board size for the capture tools
  const _v = new THREE.Vector3(), _d = new THREE.Vector3();
  function resize() { H = FH || innerHeight; W = FW || Math.min(innerWidth, Math.round(H * 9 / 16)); frame.style.width = W + 'px'; frame.style.height = H + 'px'; renderer.setPixelRatio(basePR); renderer.setSize(W, H); composer.setPixelRatio(basePR * scale); composer.setSize(W, H); tilt.uniforms.uPx.value.set(1 / W, 1 / H);
    const hh = HALF_W * H / W, zt = SEA_Z - (SEA_AT - 0.5) * 2 * hh / Math.sin(TILT); camera.top = hh; camera.bottom = -hh; camera.position.set(0, 80 * Math.sin(TILT), zt + 80 * Math.cos(TILT)); camera.lookAt(0, 0, zt); camera.updateProjectionMatrix(); camera.updateMatrixWorld(); moon.shadow.needsUpdate = true;
    tilt.uniforms.uHi.value = _v.set(0, 4.2, Z0 - 0.6).project(camera).y * 0.5 + 0.5; tilt.uniforms.uLo.value = _v.set(0, -0.6, Z1 + 3.6).project(camera).y * 0.5 + 0.5; }   // top and bottom of the island on screen: nothing between them is ever blurred
  addEventListener('resize', resize); resize();
  const st = { freeze: 0, fps: 60, hold: false, probe: false, luma: 0 };
  const toScreen = (x, y, z) => { _v.set(x, y, z).project(camera); return { x: (_v.x * 0.5 + 0.5) * W, y: (-_v.y * 0.5 + 0.5) * H }; };
  const screenAt = (x, z, up = 0) => toScreen(x, lift(z) + up, z);
  const local = (cx, cy) => { const r = renderer.domElement.getBoundingClientRect(); return [(cx - r.left) / r.width * W, (cy - r.top) / r.height * H]; };
  function pickGround(cx, cy) { const [px, py] = local(cx, cy), o = _v.set(px / W * 2 - 1, -(py / H * 2 - 1), -1).unproject(camera), d = camera.getWorldDirection(_d);
    for (const h of [1.5, 1, 0.5, 0]) { const t = (h - o.y) / d.y, x = o.x + d.x * t, z = o.z + d.z * t; if (h > 0 && Math.abs(hAt(z) - h) > 0.01) continue; return z >= Z0 + 1 && z <= Z1 + 1.5 && Math.abs(x) < halfW(clamp(z, Z0, Z1)) + 0.6 ? { x, z } : null; } return null; }
  const near = (cx, cy, x, y, z) => { const [px, py] = local(cx, cy), p = toScreen(x, y, z); return Math.hypot(p.x - px, p.y - py); };
  const slotAt = (cx, cy) => { let best = -1, bd = Math.max(26, W * 0.07); SPOTS.forEach(([x, z], i) => { const d = near(cx, cy, x, hAt(z) + (towers[i] ? 0.7 : 0.1), z); if (d < bd) { bd = d; best = i; } }); return best; };
  const heroAt = (cx, cy, game) => !!game && !game.hero.dead && near(cx, cy, game.hero.x, unitY(game.hero.z) + 0.9, game.hero.z) < Math.max(24, W * 0.06);
  const enemyAt = (cx, cy, game) => { let best = null, bd = Math.max(22, W * 0.055); if (game) for (const e of game.enemies) { const u = live.get(e.id), d = near(cx, cy, e.x, unitY(e.z, e.fly) + (u ? u.top * 0.5 : 0.5), e.z) - (e.type === 'boss' ? W * 0.05 : 0); if (d < bd) { bd = d; best = e; } } return best; };

  // ---------- one frame: follow the rules, move the effects, draw ----------
  let clock = 0, slowT = 0, fastT = 0, selSlot = -1;
  function sync(game, dt) { const seen = new Set(); bars.begin(); blobs.begin();
    for (let i = 0; i < SPOTS.length; i++) { setTower(i, game ? game.tools[i] : null); const t = towers[i]; if (t && t.pop > 0) { t.pop = Math.max(0, t.pop - dt); t.h.scale.setScalar(t.S * (1 - 0.35 * t.pop / 0.3)); if (t.pop === 0) moon.shadow.needsUpdate = true; } }
    setWindows(game ? game.windows / game.windowsMax * 20 : 20);
    if (game) { const place = (o, kind, fly, ally, hpk) => { let u = live.get(o.id); if (!u) { u = takeUnit(kind); live.set(o.id, u); } seen.add(o.id); u.age += dt; const y = unitY(o.z, fly), grow = Math.min(1, u.age / 0.35), moving = ally ? o.moving : !(o.blocker || o.stun > 0);
        if (o.hitT > 0.1) u.sq = 0.16; u.sq = Math.max(0, u.sq - dt); const q = u.sq / 0.16, hop = moving ? Math.abs(Math.sin(clock * (ally ? 9 : 5) + o.ph)) * (fly ? 0.18 : 0.09) : 0;
        u.g.position.set(o.x, y + hop, o.z + 0.02); u.g.scale.set(grow * (1 + q * 0.22), grow * (1 - q * 0.25), grow); u.g.rotation.z = moving ? Math.sin(clock * (ally ? 9 : 5) + o.ph) * 0.06 : o.stun > 0 ? Math.sin(clock * 30) * 0.05 : 0; if (ally) o.moving = false;
        const bw = Math.max(0.6, u.w * 0.8); drawBar(o.x, y + u.top + 0.2, o.z + 0.02, bw, hpk, ally); const gy = lift(o.z) + 0.05, s = fly ? 0.6 : 1; blobs.quad(o.x, gy, o.z, u.w * 0.85 * s, 0, 0, 0, 0, u.w * 0.75 * s); return u; };
      for (const e of game.enemies) place(e, e.type, e.fly, false, e.hp / e.max);
      for (const u of game.units) { if (u.dead) continue; place(u, u.kind, false, true, u.hp / u.max); }
      const h = game.hero; if (!h.dead) { heroLight.position.set(h.x + 0.7, unitY(h.z) + 0.85, h.z + 0.2); heroLight.intensity = 5; heroRing.visible = heroSelOn; heroRing.position.set(h.x, lift(h.z) + 0.1, h.z); heroRing.material.opacity = 0.7 + 0.3 * Math.sin(clock * 6); } else { heroLight.intensity = 0; heroRing.visible = false; }
      glowB.begin(); for (const f of game.fires) { const k = Math.min(1, f.t) * (0.8 + 0.2 * Math.sin(clock * 17 + f.x)); glowB.quad(f.x, lift(f.z) + 0.08, f.z, f.r, 0, 0, 0, 0, f.r * 0.8, 1.5 * k, 0.6 * k, 0.15 * k); } glowB.end(); }
    else { heroLight.intensity = 0; heroRing.visible = false; glowB.begin(); glowB.end(); }
    for (const [id, u] of live) if (!seen.has(id)) { freeUnit(u); live.delete(id); }
    bars.end(); blobs.end(); }
  function frameUpdate(dt, game, real = dt) { clock += real; LU.uT.value = clock; LU.uLampK.value = 0.97 + 0.03 * Math.sin(clock * 5); st.freeze = 0;
    if (real > 0) { st.fps += (1 / Math.max(real, 1e-3) - st.fps) * 0.05; if (!st.hold) { if (st.fps < 40) { slowT += real; fastT = 0; } else if (st.fps > 55) { fastT += real; slowT = 0; } else slowT = fastT = 0;
        if (slowT > 2 && scale > 0.55) { slowT = 0; api.setScale(Math.max(0.55, scale - 0.15)); } else if (fastT > 8 && scale < 1) { fastT = 0; api.setScale(Math.min(1, scale + 0.15)); } } }
    sync(game, dt);
    for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t += dt; const k = Math.min(1, f.t / f.life); f.step(k); if (k >= 1) { f.end(); fx.splice(i, 1); } }
    scrapB.begin(); for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.t += dt; if (p.t >= p.life) { parts.splice(i, 1); continue; } p.vy -= 9 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += dt * 8; const s = p.sz * (1 - p.t / p.life * 0.5), c = Math.cos(p.rot) * s, sn = Math.sin(p.rot) * s; scrapB.quad(p.x, p.y, p.z, c, sn * UY, sn * UZ, -sn, c * UY, c * UZ, p.c[0], p.c[1], p.c[2]); } scrapB.end();
    for (const f of fxLights) { if (f.t < f.life) { f.t += dt; const k = Math.min(1, f.t / f.life); f.l.intensity = f.power * Math.min(1, k * 6) * (1 - k); } else f.l.intensity = 0; }
    for (const r of reflections) r.m.position.x = r.x + Math.sin(clock * 0.9 + r.ph) * 0.06;
    for (let i = 0; i < rings.length; i++) if (rings[i].visible) rings[i].scale.setScalar(1 + 0.07 * Math.sin(clock * 2.6 + i));
    if (selRing.visible) selRing.material.opacity = 0.7 + 0.3 * Math.sin(clock * 6);
    renderer.info.reset(); composer.render(); }
  function reset() { for (const [, u] of live) freeUnit(u); live.clear(); for (let i = fx.length - 1; i >= 0; i--) fx[i].end(); fx.length = 0; parts.length = 0; for (let i = 0; i < SPOTS.length; i++) setTower(i, null); for (const t of towers) if (t) t.pop = 0; setWindows(20); rangeRing.visible = rangeFill.visible = selRing.visible = false; selSlot = -1; heroSelOn = false; }
  const api = { frame: frameUpdate, reset, onEvent, toScreen, screenAt, resize, st, canvas: renderer.domElement, pickGround, slotAt, heroAt, enemyAt, setGather() {}, fadeIn() {},
    select(i) { selSlot = i; selRing.visible = i >= 0; if (i >= 0) selRing.position.set(SPOTS[i][0], hAt(SPOTS[i][1]) + 0.13, SPOTS[i][1]); },
    range(o) { rangeRing.visible = rangeFill.visible = !!o; if (o) for (const m of [rangeRing, rangeFill]) { m.position.set(o.x, hAt(o.z) + 0.2, o.z); m.scale.setScalar(o.r); } },
    heroSel(on) { heroSelOn = !!on; },
    setScale(k) { scale = k; composer.setPixelRatio(basePR * scale); },
    info: () => ({ tris: renderer.info.render.triangles, calls: renderer.info.render.calls, pixelRatio: scale, fps: st.fps, alive: live.size, lights: 3 }), _dbg: { renderer, scene: SC, camera, composer, bloom, moon } };
  return api;
}
