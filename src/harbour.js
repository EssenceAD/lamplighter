// 등불지기 2.0 — the harbour stage (three.js): lighthouse on its cliff, village under it, the sea as
// layers of rocking paper strips in front. Same look rules as the approved look-dev scene: one
// shadow-casting light, night shadows baked once, capped bloom, automatic resolution scaling.
// Enemies are drawn with instancing (one draw call per kind, plus one for their projected shadows).
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { clamp, rng, WAVE_V, LANES, SLOTS, TOWER, BUILDS } from './game.js';

const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
// silhouette, height on stage, round amber eyes (fractions of the outline box), eye size
const LOOK = {
  fry: ['e_fry', 0.7, [[0.36, 0.3], [0.66, 0.3]], 0.095], fish: ['e_fish', 0.7, [[0.74, 0.5]], 0.11], crab: ['e_crab', 1.0, [[0.42, 0.42], [0.6, 0.42]], 0.08],
  octo: ['e_octo', 1.2, [[0.4, 0.3], [0.62, 0.3]], 0.08], baby: ['e_octo', 0.58, [[0.4, 0.3], [0.62, 0.3]], 0.095], fog: ['cloud_b', 1.1, [[0.4, 0.55], [0.6, 0.55]], 0.1],
  turtle: ['e_turtle', 1.3, [[0.86, 0.3]], 0.075], boss: ['e_boss', 3.0, [[0.2, 0.36], [0.42, 0.36]], 0.035],
};
const CAP = { fry: 1500, fish: 240, crab: 140, octo: 100, baby: 320, fog: 48, turtle: 70, boss: 4 };
const TOOL_SHAPE = { mirror: ['t_mirror', 1.05], prism: ['t_prism', 0.85], lens: ['t_lens', 1.15], bell: ['t_bell', 1.2], beacon: ['t_beacon', 1.25], jar: ['t_jar', 0.7] };

export async function createHarbour(frame, SHAPES) {
  const SPOT_FLOOR = { value: 0.05 }, GRAIN = { value: 5.0 };
  { const a = 'return smoothstep( coneCosine, penumbraCosine, angleCosine );';
    if (THREE.ShaderChunk.lights_pars_begin.includes(a)) THREE.ShaderChunk.lights_pars_begin = 'uniform float uSpotFloor;\n' + THREE.ShaderChunk.lights_pars_begin.replace(a, 'return mix( uSpotFloor, 1.0, smoothstep( coneCosine, penumbraCosine, angleCosine ) );'); }
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' }); renderer.info.autoReset = false;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  frame.prepend(renderer.domElement);
  try {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x05060f);
  const camera = new THREE.PerspectiveCamera(40, 9 / 16, 0.5, 80); camera.position.set(0, 15.5, 14.5); camera.lookAt(0, 0, 0.35);
  const LEAN = -0.26;   // every standing sheet leans back a little, like a pop-up book, so it still reads from this higher view
  const TL = new THREE.TextureLoader();
  const tex = (url, srgb = true, repeat = 1) => new Promise((res, rej) => TL.load(url, t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; res(t); }, undefined, rej));
  const [paperW, paperWN, paperCreaseN, pCircle, pSpark, pFlare, pLight, pStar] = await Promise.all([
    tex('./assets/paper/Paper001_Color.jpg', true, 0.45), tex('./assets/paper/Paper001_NormalGL.jpg', false, 0.45), tex('./assets/paper/Paper003_NormalGL.jpg', false, 0.2),
    tex('./assets/particles/circle_05.png'), tex('./assets/particles/spark_05.png'), tex('./assets/particles/flare_01.png'), tex('./assets/particles/light_01.png'), tex('./assets/particles/star_07.png')]);

  // ---------- paper ----------
  const svgLoader = new SVGLoader(), dawnMats = [];
  const dawnTint = (m, night, dawn) => { m.userData.night = new THREE.Color(night); m.userData.dawn = new THREE.Color(dawn ?? night); dawnMats.push(m); return m; };
  function paperMat(night, dawn) {
    const m = new THREE.MeshLambertMaterial({ color: night, map: paperW, normalMap: paperWN, normalScale: new THREE.Vector2(1, 1), side: THREE.DoubleSide, shadowSide: THREE.DoubleSide });
    m.onBeforeCompile = sh => { sh.uniforms.uSpotFloor = SPOT_FLOOR; sh.uniforms.uGrain = GRAIN;
      sh.fragmentShader = 'uniform float uGrain;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= clamp( 1.0 + ( texture2D( map, vMapUv ).g - texture2D( map, vMapUv, 5.0 ).g ) * uGrain, 0.45, 1.7 );'); };
    return dawnTint(m, night, dawn);
  }
  const CORE = paperMat(0x8f95b8, 0xe9cdb6), geoCache = new Map();
  function outline(name, o) { // potrace outline -> resampled, jittered paper shapes + a fringe layer
    const key = name + JSON.stringify([o.height, o.squash, o.step, o.rough, o.fr0, o.fr1, o.solid]); if (geoCache.has(key)) return geoCache.get(key);
    const S = SHAPES[name], k = o.height / S.h, sy = o.squash ?? 1, step = o.step ?? 5, rough = o.rough ?? 0.9, fr0 = o.fr0 ?? 0.8, fr1 = o.fr1 ?? 2.2, rnd = rng(name.length * 977 + S.w);
    const shapes = svgLoader.parse(`<svg xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="${S.d}"/></svg>`).paths.flatMap(p => SVGLoader.createShapes(p));
    const W = (x, y) => new THREE.Vector2((x - S.w / 2) * k, (S.h - y) * k * sy), main = [], fringe = [], holes = [];
    const contour = (pts, isHole) => {
      let P = pts.map(p => [p.x, p.y]); if (P.length > 1 && Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < 0.01) P.pop();
      const R = []; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; if (R.length && Math.hypot(a[0] - R[R.length - 1][0], a[1] - R[R.length - 1][1]) < step * 0.3) continue; R.push(a); const d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.floor(d / step); for (let j = 1; j < n; j++) R.push([a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n]); }
      let area = 0, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (let i = 0; i < R.length; i++) { const a = R[i], b = R[(i + 1) % R.length]; area += a[0] * b[1] - b[0] * a[1]; x0 = Math.min(x0, a[0]); x1 = Math.max(x1, a[0]); y0 = Math.min(y0, a[1]); y1 = Math.max(y1, a[1]); } area /= 2;
      const sign = (area > 0 ? 1 : -1) * (isHole ? -1 : 1), flat = Math.abs(area) < 260, m = [], f = [];
      for (let i = 0; i < R.length; i++) { const a = R[(i - 1 + R.length) % R.length], b = R[(i + 1) % R.length], p = R[i]; let nx = (b[1] - a[1]), ny = -(b[0] - a[0]); const nl = Math.hypot(nx, ny) || 1; nx = nx / nl * sign; ny = ny / nl * sign;
        const j = (rnd() - 0.5) * 2 * rough + (rnd() < 0.04 ? -rough * 2.2 * rnd() : 0); m.push(W(p[0] + nx * j, p[1] + ny * j)); const ff = flat ? 0 : fr0 + rnd() * rnd() * fr1; f.push(W(p[0] + nx * ff, p[1] + ny * ff)); }
      return { m, f, area: Math.abs(area), box: [x0, y0, x1, y1], n: R.length };
    };
    for (const sh of shapes) { const out = contour(sh.getPoints(3), false); if (out.n < 3) continue; const ms = new THREE.Shape(out.m), fs = new THREE.Shape(out.f);
      if (!o.solid) for (const h of sh.holes) { const c = contour(h.getPoints(3), true); if (c.n < 3 || c.area < 8) continue; ms.holes.push(new THREE.Path(c.m)); fs.holes.push(new THREE.Path(c.f)); const a = W(c.box[0], c.box[3]), b = W(c.box[2], c.box[1]);
        holes.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, w: b.x - a.x, h: b.y - a.y, pw: c.box[2] - c.box[0], ph: c.box[3] - c.box[1], py: (c.box[1] + c.box[3]) / 2 / S.h }); }
      main.push(ms); fringe.push(fs); }
    const r = { main, fringe, holes, w: S.w * k, h: o.height * sy, k, S }; geoCache.set(key, r); return r;
  }
  function cutout(name, o) {
    const O = outline(name, o), g = new THREE.Group();
    const body = new THREE.Mesh(O.gBody ??= new THREE.ExtrudeGeometry(O.main, { depth: 0.03, bevelEnabled: false, curveSegments: 1 }), [o.mat, o.side ?? CORE]);
    const fr = new THREE.Mesh(O.gFringe ??= new THREE.ShapeGeometry(O.fringe, 1), o.core ?? CORE); fr.position.z = -0.006;
    for (const m of [body, fr]) { m.castShadow = o.cast ?? true; m.receiveShadow = o.receive ?? true; g.add(m); }
    g.userData = { holes: O.holes, w: O.w, h: O.h, O, fringe: fr }; return g;
  }
  const M = { house: paperMat(0x2b2f55, 0x3a2f4a), house2: paperMat(0x33294f, 0x44304a), tower: paperMat(0x2a2440, 0x3b2a44), tree: paperMat(0x1c2c44, 0x2e3350), prop: paperMat(0x24284a, 0x3a3048),
    cliff: paperMat(0x2c3663, 0x5a4660), cliff2: paperMat(0x3a4678, 0x6e556c), far0: paperMat(0x232b58, 0x5f4a70), far1: paperMat(0x2c376c, 0x8a6585), far2: paperMat(0x36447f, 0xb07f8e),
    sea: [paperMat(0x3f72b2, 0xe2b0a6), paperMat(0x3462a0, 0xcf9c9e), paperMat(0x2a538c, 0xb98a98), paperMat(0x214477, 0xa07890), paperMat(0x193661, 0x886a88), paperMat(0x12284c, 0x705a7e), paperMat(0x0d1f3d, 0x5e4c70)], seaFloor: paperMat(0x0d1f3d, 0x5e4c70),
    cloud: paperMat(0x26326e, 0x8a6480), ground: paperMat(0x3c4879, 0x9a7f95), path: paperMat(0x8d8a9e, 0xf3d6b4), slot: paperMat(0x6f759c, 0xcbb0a4) };
  M.ground.normalMap = paperCreaseN; M.ground.normalScale.set(1.3, 1.3);

  // ---------- scenery ----------
  const flats = [], waves = [];
  const stand = (g, x, z, o = {}) => { g.position.set(x, o.y ?? 0, z); scene.add(g); flats.push({ g, amp: o.amp ?? 1, seed: flats.length * 1.7, x, z }); return g; };
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), M.ground); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  { const uv = ground.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 60, uv.getY(i) * 60); }
  // the three ways up from the beach: paper ribbons with ragged edges
  { const r = rng(5), pos = [], uv = [];
    for (const L of LANES) { const P = L.pts; for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1], d = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = -(b.z - a.z) / d, nz = (b.x - a.x) / d, w0 = 0.42 + (i ? L._w : 0.03), w1 = 0.42 + (L._w = (r() - 0.5) * 0.09);
      const q = [[a.x + nx * w0, a.z + nz * w0], [a.x - nx * w0, a.z - nz * w0], [b.x + nx * w1, b.z + nz * w1], [b.x - nx * w1, b.z - nz * w1]];
      for (const k of [0, 2, 1, 1, 2, 3]) { pos.push(q[k][0], 0.014 + LANES.indexOf(L) * 0.002, q[k][1]); uv.push(q[k][0], q[k][1]); } } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, M.path); m.receiveShadow = true; scene.add(m); }
  // far: sky, moon, stars, horizon sea, the cliff and its lighthouse
  const skyMat = new THREE.ShaderMaterial({ uniforms: { map: { value: paperW }, uDawn: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `uniform sampler2D map; uniform float uDawn; varying vec2 vUv; void main(){ float h = vUv.y;
      vec3 night = mix(vec3(0.020,0.029,0.10), vec3(0.008,0.011,0.055), smoothstep(0.12,0.42,h)); vec3 dawn = mix(vec3(0.95,0.47,0.29), vec3(0.30,0.26,0.50), smoothstep(0.28,0.62,h)); dawn = mix(dawn, vec3(1.15,0.70,0.38), smoothstep(0.36,0.22,h));
      vec3 c = mix(night, dawn, uDawn); vec2 q = vUv * vec2(9.0, 7.0); c *= 0.9 + (texture2D(map, q).g - texture2D(map, q, 5.0).g) * 5.0; gl_FragColor = vec4(c, 1.0); }` });
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(34, 24), skyMat); sky.position.set(0, 9, -10.9); scene.add(sky);
  const moonMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.96, 0.8), map: paperW });
  const moon = cutout('moon', { height: 0.95, mat: moonMat, core: moonMat, cast: false, receive: false }); moon.position.set(1.3, 2.35, -10.7); moon.rotation.z = -0.35; scene.add(moon);
  const starGeo = new THREE.BufferGeometry(); { const r = rng(11), p = []; for (let i = 0; i < 46; i++) p.push((r() - 0.5) * 13, 1.5 + r() * 4.5, -10.8); starGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); }
  const starMat = new THREE.PointsMaterial({ map: pStar, size: 0.26, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xaab4e0 }); scene.add(new THREE.Points(starGeo, starMat));
  const cloudRim = dawnTint(new THREE.MeshBasicMaterial({ color: 0xffffff }), new THREE.Color(0.10, 0.14, 0.34), new THREE.Color(0.80, 0.52, 0.46));
  const cloudA = stand(cutout('cloud_a', { height: 0.7, mat: M.cloud, core: cloudRim, fr0: 2, fr1: 2, step: 6, cast: false, receive: false }), -2.9, -10.6, { y: 3.6, amp: 0.3 });
  const wide = (name, x, z, w, h, mat) => { const S = SHAPES[name], h0 = w * S.h / S.w; return stand(cutout(name, { height: h0, squash: h / h0, mat, step: 8, rough: 1.2, cast: false }), x, z, { amp: 0.1 }); };
  wide('ridge', 0.5, -10.4, 27, 1.7, M.far2); wide('hill_far', -1.5, -9.5, 25, 1.25, M.far1); wide('hill_low', 1.2, -8.2, 23, 0.9, M.far0);
  // the lighthouse rock: two cut-paper crags (outlines traced from rock references); the tower rises from behind them
  stand(cutout('crag_a', { height: 1.55, mat: M.cliff, step: 16, rough: 2.2, solid: true, cast: false }), TOWER.x - 0.2, TOWER.z + 0.14, { y: -0.07, amp: 0.08 });
  stand(cutout('crag_b', { height: 0.8, mat: M.cliff2, step: 16, rough: 2.2, solid: true, cast: false }), TOWER.x + 0.6, TOWER.z + 0.36, { y: -0.05, amp: 0.08 }).scale.x = -1;
  const CLIFF_Y = 0.8, tower = stand(cutout('tower', { height: 2.9, mat: M.tower, step: 4, cast: false }), TOWER.x, TOWER.z, { y: CLIFF_Y, amp: 0.3 });
  const chamber = tower.userData.holes.filter(h => h.py < 0.3).sort((a, b) => b.w * b.h - a.w * a.h)[0] ?? { x: 0, y: 2.7 };
  const LANTERN = new THREE.Vector3(TOWER.x + chamber.x, CLIFF_Y + chamber.y, TOWER.z - 0.25);
  function glowPanes(g, test, color, k = 1) { const mat = new THREE.MeshBasicMaterial({ color }); mat.userData.base = mat.color.clone();
    for (const h of g.userData.holes) { if (!test(h)) continue; const p = new THREE.Mesh(new THREE.PlaneGeometry((h.w + 0.03) * k, (h.h + 0.03) * k), mat); p.position.set(h.x, h.y, -0.02); g.add(p); } return mat; }
  const towerGlow = glowPanes(tower, h => h.pw > 24 && h.ph > 24, new THREE.Color(0.95, 0.5, 0.15));
  const AMBER = new THREE.Color(1.15, 0.56, 0.15);
  const houses = [['house_a', 2.55, -3.5, -5.2, 0.42], ['house_d', 3.25, -1.75, -5.95, 0.2], ['house_c', 2.0, 0.45, -5.15, 0.42], ['house_b', 2.25, 2.15, -5.85, 0.42], ['house_e', 1.95, 3.7, -5.2, 0.42]].map(([n, h, x, z, roof], i) => {
    const g = stand(cutout(n, { height: h, mat: i % 2 ? M.house2 : M.house }), x, z); g.userData.glow = glowPanes(g, q => q.pw > 22 && q.ph > 22 && q.py > roof, AMBER); return g; });
  stand(cutout('tree_a', { height: 2.3, mat: M.tree, step: 6 }), -4.3, -3.9); stand(cutout('tree_c', { height: 1.7, mat: M.tree, step: 6 }), 4.3, -3.6); stand(cutout('bush', { height: 1.2, mat: M.tree, step: 6 }), -4.2, 0.6); stand(cutout('tree_d', { height: 1.6, mat: M.tree, step: 6 }), 4.3, 1.2);
  stand(cutout('barrels', { height: 0.5, mat: M.prop }), 3.7, 2.6); stand(cutout('rock', { height: 1.0, mat: M.cliff, step: 7, rough: 1.6 }), -4.3, 2.9); stand(cutout('well', { height: 0.85, mat: M.prop, step: 4 }), 3.6, -1.6);
  stand(cutout('pier', { height: 0.55, mat: M.prop, cast: false }), -3.5, 4.55, { amp: 0.3 }); const boat = stand(cutout('boat', { height: 1.1, mat: M.prop, cast: false }), 2.4, 6.2, { y: 0.75, amp: 0.3 });
  // the sea in front: six layers of cut-paper waves (curled crests traced from a reference), each its own blue,
  // the nearest the darkest, each rocking at its own pace. A pale sheet just behind each layer shows as a thin moonlit line along the crests.
  { const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 8), M.seaFloor); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.03, 8.15); floor.receiveShadow = true; scene.add(floor); }
  const RIM = [0.1, 0.14, 0.2, 0.28, 0.4, 0.82, 1.0];   // how strongly each layer's crest catches the moon, back to front
  const seaLayer = (name, z, h, count, sp, amp, dir) => { const S = SHAPES[name], w = h * S.w / S.h, g = new THREE.Group(), mat = M.sea[waves.length], rs = RIM[waves.length], mc = mat.userData.night, md = mat.userData.dawn,
      rimMat = dawnTint(new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }), new THREE.Color(lerp(mc.r * 1.3, 0.42, rs), lerp(mc.g * 1.3, 0.56, rs), lerp(mc.b * 1.3, 0.95, rs)), new THREE.Color(lerp(md.r, 1.0, rs), lerp(md.g, 0.8, rs), lerp(md.b, 0.62, rs)));
    for (let k = 0; k < count; k++) { const s = cutout(name, { height: h, mat, side: mat, core: mat, step: 13, rough: 0.7, fr0: 1, fr1: 2, cast: false }), O = s.userData.O, rim = new THREE.Mesh(O.gRim ??= new THREE.ShapeGeometry(O.main, 1), rimMat);
      rim.position.set(-0.012 * rs, (0.026 + h * 0.005) * (0.35 + 0.65 * rs), -0.012); s.add(rim); s.position.set((k - (count - 1) / 2) * w * 0.9, 0, -k * 0.004); g.add(s); }
    g.scale.x = dir; g.position.set(0, -h * 0.05, z); scene.add(g); waves.push({ g, y: -h * 0.05, amp, sp, ph: waves.length * 1.9, drift: 0.34 + 0.05 * waves.length }); };
  // each layer stands close enough behind the next that the floor never shows through a trough (no flat bands anywhere)
  seaLayer('wave_c', 4.3, 0.8, 3, 0.62, 0.02, 1); seaLayer('wave_a', 4.7, 1.0, 2, 0.95, 0.025, -1); seaLayer('wave_c', 5.2, 1.25, 2, 0.7, 0.03, 1);
  seaLayer('wave_a', 5.82, 1.55, 2, 1.1, 0.035, -1); seaLayer('wave_c', 6.6, 1.95, 1, 0.55, 0.04, 1); seaLayer('wave_a', 7.55, 2.45, 1, 0.82, 0.045, -1); seaLayer('wave_c', 8.6, 2.9, 1, 0.66, 0.05, 1);
  // build spots: a paper base plate with a soft amber circle breathing on it (brighter while something can be afforded)
  const plateGeo = new THREE.CircleGeometry(0.4, 9), spotGeo = new THREE.PlaneGeometry(1.5, 1.5);
  const slotMarks = SLOTS.map((s, i) => { const g = new THREE.Group(), plate = new THREE.Mesh(plateGeo, M.slot);
    const spot = new THREE.Mesh(spotGeo, new THREE.ShaderMaterial({ uniforms: { uI: { value: 0.4 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
      fragmentShader: `uniform float uI; varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0; float ring = smoothstep(0.36, 0.41, r) * (1.0 - smoothstep(0.46, 0.51, r)); float core = (1.0 - smoothstep(0.0, 0.42, r)) * 0.42; float halo = (1.0 - smoothstep(0.4, 1.0, r)) * 0.22;
        float a = (ring * 0.9 + core + halo) * uI; gl_FragColor = vec4(vec3(1.0, 0.58, 0.16) * a, a); }` }));
    plate.rotation.x = -Math.PI / 2; plate.rotation.z = i * 0.7; plate.position.y = 0.03; plate.receiveShadow = true; spot.rotation.x = -Math.PI / 2; spot.position.y = 0.05; spot.renderOrder = 2; g.add(plate, spot); g.position.set(s.x, 0, s.z); scene.add(g); return { g, spot }; });

  // ---------- light ----------
  const hemi = new THREE.HemisphereLight(0x3d4c9c, 0x0a0c1c, 1.15); scene.add(hemi);
  const fill = new THREE.DirectionalLight(0x5c70d8, 0.75); fill.position.set(4, 7, 12); scene.add(fill);
  const beam = new THREE.SpotLight(0xffa54a, 0, 46, 0.27, 0.55, 1.1); beam.castShadow = true; beam.position.copy(LANTERN);
  beam.shadow.mapSize.set(2048, 2048); beam.shadow.bias = -0.0025; beam.shadow.normalBias = 0.03; beam.shadow.radius = 2.5; beam.shadow.autoUpdate = false;
  { const cam = beam.shadow.camera, look = new THREE.Vector3(0, 0, -1.8), pm = new THREE.Matrix4(); cam.fov = 100; cam.aspect = 1; cam.near = 0.25; cam.far = 40; cam.updateProjectionMatrix();
    beam.shadow.updateMatrices = function (light) { cam.position.setFromMatrixPosition(light.matrixWorld); cam.lookAt(look); cam.updateMatrixWorld(); pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); this._frustum.setFromProjectionMatrix(pm); this.matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(pm); }; }
  scene.add(beam, beam.target);
  const sun = new THREE.DirectionalLight(0xffb98a, 0); sun.castShadow = false; sun.shadow.mapSize.set(1536, 1536); sun.shadow.autoUpdate = false;
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 70 }); sun.shadow.bias = -0.0015; sun.shadow.normalBias = 0.04; sun.shadow.radius = 2.5; scene.add(sun, sun.target);
  let shadowMode = '', bake = 3; const setShadowMode = m => { if (m === shadowMode) return; shadowMode = m; beam.castShadow = m === 'night'; sun.castShadow = m === 'dawn'; beam.shadow.needsUpdate = true; sun.shadow.needsUpdate = true; };
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: pLight, color: 0xffb060, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); halo.position.copy(LANTERN); halo.position.z += 0.1; scene.add(halo);
  const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: pFlare, color: 0xffd9a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); flare.position.copy(halo.position); scene.add(flare);
  const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`;
  const coneMat = new THREE.ShaderMaterial({ uniforms: { uI: { value: 0 }, uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec2 vUv; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uI, uTime; varying vec3 vN; varying vec3 vV; varying vec2 vUv; void main(){ float soft = pow(abs(dot(normalize(vN), normalize(vV))), 1.8); float l = 1.0 - vUv.y;
      float along = mix(0.8, 0.3, smoothstep(0.0, 0.6, l)) * smoothstep(0.0, 0.03, l) * (1.0 - 0.8 * smoothstep(0.5, 0.69, l)); float streak = 0.8 + 0.2 * sin(vUv.x * 60.0 + sin(uTime * 0.4 + vUv.x * 9.0) * 2.0); float a = soft * along * streak * uI; gl_FragColor = vec4(vec3(1.0, 0.6, 0.24) * a, a); }` });
  const coneGeo = new THREE.CylinderGeometry(0.04, 1, 1, 48, 1, true); coneGeo.translate(0, -0.5, 0); coneGeo.rotateX(-Math.PI / 2);
  const cone = new THREE.Mesh(coneGeo, coneMat); cone.frustumCulled = false; cone.renderOrder = 5; scene.add(cone);
  const dustGeo = new THREE.BufferGeometry(); { const r = rng(3), p = [], s = []; for (let i = 0; i < 460; i++) { p.push(r() * 6.283, Math.sqrt(r()), r()); s.push(0.5 + r(), r(), 0.4 + r() * 1.2); } dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); dustGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(s, 3)); }
  const dustMat = new THREE.ShaderMaterial({ uniforms: { map: { value: pCircle }, uTime: { value: 0 }, uI: { value: 0 }, uO: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3(0, 0, 1) }, uRight: { value: new THREE.Vector3(1, 0, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) }, uLen: { value: 1 }, uRad: { value: 1 }, uPx: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float uTime, uLen, uRad, uPx, uI; uniform vec3 uO, uDir, uRight, uUp; attribute vec3 aSeed; varying float vA; void main(){ float l = fract(position.z + uTime * 0.010 * aSeed.z); float ang = position.x + uTime * 0.10 * (aSeed.y - 0.5); float rf = position.y;
      float rad = mix(0.04, uRad, l) * rf; vec3 w = uO + uDir * (l * uLen) + (uRight * cos(ang) + uUp * sin(ang)) * rad; vec4 mv = viewMatrix * vec4(w, 1.0); gl_Position = projectionMatrix * mv; float tw = 0.5 + 0.5 * sin(uTime * (1.0 + aSeed.x * 2.0) + aSeed.y * 30.0);
      vA = (1.0 - rf * rf * rf) * smoothstep(0.0, 0.1, l) * step(0.02, w.y) * tw * uI; gl_PointSize = max(1.5, uPx * (0.05 + 0.07 * aSeed.x) / -mv.z); }`,
    fragmentShader: `uniform sampler2D map; varying float vA; void main(){ float t = texture2D(map, gl_PointCoord).r; gl_FragColor = vec4(vec3(1.0,0.86,0.6) * t * vA, t * vA); }` });
  const dust = new THREE.Points(dustGeo, dustMat); dust.frustumCulled = false; dust.renderOrder = 6; scene.add(dust);

  // ---------- particles: embers / sparks, paper scraps ----------
  const EMAX = 900, eGeo = new THREE.BufferGeometry(), eStart = new Float32Array(EMAX * 3), eVel = new Float32Array(EMAX * 3), eData = new Float32Array(EMAX * 4), eCol = new Float32Array(EMAX * 4);
  eGeo.setAttribute('position', new THREE.BufferAttribute(eStart, 3)); eGeo.setAttribute('aVel', new THREE.BufferAttribute(eVel, 3)); eGeo.setAttribute('aData', new THREE.BufferAttribute(eData, 4)); eGeo.setAttribute('aCol', new THREE.BufferAttribute(eCol, 4));
  const eMat = new THREE.ShaderMaterial({ uniforms: { map: { value: pSpark }, map2: { value: pCircle }, uTime: { value: 0 }, uPx: { value: 1 } }, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float uTime, uPx; attribute vec3 aVel; attribute vec4 aData; attribute vec4 aCol; varying vec4 vC; varying float vRot; void main(){ float age = uTime - aData.x, life = max(aData.y, 0.001), a = clamp(age / life, 0.0, 1.0); vec3 p;
      if (age < 0.0 || age > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vC = vec4(0.0); vRot = 0.0; return; }
      if (aCol.a > 0.5) p = mix(position, aVel, pow(clamp(a,0.,1.), 2.4)); else { float d = 1.6; p = position + aVel * (1.0 - exp(-d * age)) / d; p.y += 0.5 * aData.w * age * age; p.x += sin(age * 5.0 + aData.x * 13.0) * 0.07 * age; }
      vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; float vis = step(0.0, age) * step(age, life); vC = vec4(aCol.rgb, vis * smoothstep(0.0, 0.08, a) * (1.0 - a * a) * (0.7 + 0.3 * sin(uTime * 23.0 + aData.x * 91.0)));
      vRot = aData.x * 17.0 + age * 2.0; gl_PointSize = uPx * aData.z * (1.0 - 0.6 * a) / -mv.z * vis; }`,
    fragmentShader: `uniform sampler2D map, map2; varying vec4 vC; varying float vRot; void main(){ vec2 q = gl_PointCoord - 0.5; float c = cos(vRot), s = sin(vRot); q = mat2(c,-s,s,c) * q + 0.5; float t = max(texture2D(map, q).r * 0.9, texture2D(map2, gl_PointCoord).r * 0.7); gl_FragColor = vec4(vC.rgb * t * vC.a, t * vC.a); }` });
  const embers = new THREE.Points(eGeo, eMat); embers.frustumCulled = false; embers.renderOrder = 9; scene.add(embers);
  let eHead = 0, clock = 0; for (let i = 0; i < EMAX; i++) eData[i * 4] = -999;
  function ember(px, py, pz, vx, vy, vz, delay, life, size, buoy, col, conv = 0) { const i = eHead; eHead = (eHead + 1) % EMAX; eStart.set([px, py, pz], i * 3); eVel.set([vx, vy, vz], i * 3); eData.set([clock + delay, life, size, buoy], i * 4); eCol.set([col[0], col[1], col[2], conv], i * 4); eDirty = true; }
  let eDirty = false;
  const SMAX = 240, chipPts = [[-0.5, -0.32], [0.36, -0.5], [0.5, 0.1], [0.08, 0.5], [-0.42, 0.28]], chipGeo = new THREE.BufferGeometry();
  { const pos = [], col = [], fan = (k, z, c) => { for (let i = 1; i < chipPts.length - 1; i++) for (const p of [chipPts[0], chipPts[i], chipPts[i + 1]]) { pos.push(p[0] * k, p[1] * k, z); col.push(c, c, c); } }; fan(1, 0, 0.06); fan(0.78, 0.03, 1); fan(0.78, -0.03, 1);
    chipGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); chipGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); }
  const scraps = new THREE.InstancedMesh(chipGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }), SMAX); scraps.frustumCulled = false; scene.add(scraps);
  const scrapData = []; let sHead = 0;
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _t = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();
  const CHIP = [[1.0, 0.27, 0.12], [1.0, 0.62, 0.16], [0.99, 0.92, 0.74]], FEST = [[1, 0.3, 0.3], [1, 0.8, 0.2], [0.4, 0.9, 0.7], [0.6, 0.7, 1], [1, 0.6, 0.9]];
  const scrapPos = (d, t, o) => { const k = 1 - Math.exp(-13 * t), f = Math.max(0, t - 0.2), drop = d.fall * (f - (1 - Math.exp(-3 * f)) / 3), sw = Math.min(1, f * 2) * d.sway; return o.set(d.ox + d.dx * d.R * k + Math.sin(f * 4.5 + d.ph) * sw, d.oy + d.dy * d.R * k - drop, d.oz + d.dz * d.R * k); };
  function burst(x, z, H, n, cols = CHIP, nEmb = 6) {
    const r = Math.random, dist = Math.hypot(camera.position.x - x, camera.position.y, camera.position.z - z), upp = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / frame.clientHeight;
    for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + r() * 0.8, d = { ox: x, oy: H * 0.5, oz: z + 0.12, dx: Math.cos(a) * 0.85, dy: Math.sin(a) * 0.7 + 0.4, dz: 0.2 + r() * 0.4, R: Math.max(0.5, H) * (0.75 + r() * 0.7), fall: 1.15 + r() * 0.7, sway: 0.1 + r() * 0.16, ph: r() * 6.283, birth: clock,
        size: (11 + r() * 6) * upp, rot: [r() * 6, r() * 6, r() * 6], w: [(r() - 0.5) * 30, (r() - 0.5) * 30, (r() - 0.5) * 20], yaw: r() * 6.283 };
      let t = 0.2; while (t < 5 && scrapPos(d, t, _v).y > 0.045) t += 0.03; d.land = t; scrapData[sHead] = d; const c = cols[(i + sHead) % cols.length]; scraps.setColorAt(sHead, _c.setRGB(c[0], c[1], c[2])); sHead = (sHead + 1) % SMAX; }
    scraps.instanceColor.needsUpdate = true;
    for (let i = 0; i < nEmb; i++) { const a = r() * 6.283, sp = 0.3 + r() * 1.2; ember(x + (r() - 0.5) * 0.4 * H, H * (0.2 + r() * 0.6), z + 0.1, Math.cos(a) * sp, 1.0 + r() * 1.8, (r() - 0.5) * 0.8, r() * 0.1, 0.9 + r() * 1.2, 0.22 + r() * 0.24, 1.6 + r() * 2.0, r() < 0.2 ? [2.2, 1.9, 1.3] : [2.6, 1.15 + r() * 0.5, 0.22]); }
  }
  function updateScraps() { for (let i = 0; i < SMAX; i++) { const d = scrapData[i];
      if (d) { const age = clock - d.birth, rest = 0.9, fade = 0.4; if (age >= 0 && age < d.land + rest + fade) { const t = Math.min(age, d.land), f = Math.max(0, t - 0.2), sp = (1 - Math.exp(-6 * t)) / 6, fl = Math.min(1, f * 3); scrapPos(d, t, _v);
          _e.set(d.rot[0] + d.w[0] * sp + Math.sin(f * 8 + d.ph) * 0.9 * fl, d.rot[1] + d.w[1] * sp, d.rot[2] + d.w[2] * sp); _q.setFromEuler(_e); if (age > d.land) { _e.set(-Math.PI / 2, 0, d.yaw); _q2.setFromEuler(_e); _q.slerp(_q2, sstep(0, 0.15, age - d.land)); _v.y = 0.045 + (i % 5) * 0.003; }
          const s = d.size * sstep(0, 0.04, age) * (1 - sstep(d.land + rest, d.land + rest + fade, age)); _m.compose(_v, _q, _s.set(s, s, s)); scraps.setMatrixAt(i, _m); continue; } scrapData[i] = null; }
      _m.makeScale(0, 0, 0); scraps.setMatrixAt(i, _m); } scraps.instanceMatrix.needsUpdate = true; }

  // ---------- enemies: one instanced mesh per kind (rim + body + round amber eyes in one geometry) ----------
  const castMat = new THREE.ShaderMaterial({ uniforms: { uL: { value: LANTERN }, uDir: { value: new THREE.Vector3(0, -1, 0) }, uCone: { value: 0.9 }, uPen: { value: 0.95 }, uA: { value: 1 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `uniform vec3 uL; varying vec3 vW; void main(){ vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); float t = min(6.0, (uL.y - 0.035) / max(0.3, uL.y - w.y)); vW = uL + (w.xyz - uL) * t; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
    fragmentShader: `uniform vec3 uL, uDir; uniform float uCone, uPen, uA; varying vec3 vW; void main(){ vec3 d = vW - uL; float k = smoothstep(uCone, uPen, dot(d / max(length(d), 0.001), uDir)); gl_FragColor = vec4(0.015, 0.02, 0.06, clamp(uA * mix(0.3, 0.85, k), 0.0, 1.0)); }` });
  const kinds = {};
  for (const [kind, [shape, h, eyes, er]] of Object.entries(LOOK)) {
    const O = outline(shape, { height: h, step: 20, rough: 2.6, fr0: kind === 'boss' ? 7 : 12, fr1: 2, solid: true }), S = SHAPES[shape], pos = [], col = [];
    const add = (geo, z, c) => { const g = geo.toNonIndexed(), p = g.attributes.position; for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), z); col.push(c[0], c[1], c[2]); } };
    const fogK = kind === 'fog';
    add(new THREE.ShapeGeometry(O.fringe, 1), -0.006, fogK ? [0.5, 0.56, 0.8] : kind === 'turtle' ? [0.45, 0.85, 0.75] : kind === 'boss' ? [1.0, 0.45, 0.6] : [0.6, 0.5, 1.0]);
    const flat = new THREE.ShapeGeometry(O.main, 1); add(flat, 0, fogK ? [0.2, 0.24, 0.42] : [0.028, 0.026, 0.05]);
    const disc = (cx, cy, r, c, z) => { for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283, b = (i + 1) / 14 * 6.283; pos.push(cx, cy, z, cx + Math.cos(a) * r, cy + Math.sin(a) * r, z, cx + Math.cos(b) * r, cy + Math.sin(b) * r, z); col.push(...c, ...c, ...c); } };
    for (const [fx, fy] of eyes) { const x = (fx - 0.5) * S.w * O.k, y = (1 - fy) * h, r = Math.max(0.03, er * h * 1.15); disc(x, y, r, [1.25, 0.66, 0.16], 0.01); disc(x, y - r * 0.1, r * 0.42, [0.05, 0.04, 0.08], 0.012); disc(x + r * 0.22, y + r * 0.24, r * 0.17, [1.6, 1.5, 1.2], 0.014); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: fogK, opacity: fogK ? 0.55 : 1 }), CAP[kind]); mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = fogK ? 3 : 0; scene.add(mesh);
    mesh.setColorAt(0, _c.setRGB(1, 1, 1));
    const cast = new THREE.InstancedMesh(flat, castMat, CAP[kind]); cast.frustumCulled = false; cast.count = 0; cast.renderOrder = 2; if (!fogK) scene.add(cast);
    kinds[kind] = { mesh, cast, h, n: 0 };
  }
  const ghosts = [], pops = [], popMeshes = [], bars = [];
  const popMat = new THREE.ShaderMaterial({ uniforms: { uR: { value: 0 }, uI: { value: 0 }, uW: { value: 0.05 }, uCol: { value: new THREE.Color(1, 0.97, 0.88) } }, transparent: true, depthWrite: false, depthTest: false, vertexShader: VS,
    fragmentShader: `uniform float uR, uI, uW; uniform vec3 uCol; varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0; float e = 0.012; float a = smoothstep(uR - uW - e, uR - uW, r) * (1.0 - smoothstep(uR, uR + e, r)) * uI; gl_FragColor = vec4(uCol, a); }` });
  for (let i = 0; i < 28; i++) { const pm = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), popMat.clone()); pm.renderOrder = 8; pm.visible = false; scene.add(pm); popMeshes.push(pm); }
  const barGeo = new THREE.PlaneGeometry(1, 1), barBack = new THREE.MeshBasicMaterial({ color: 0x0b0a14, depthTest: false, transparent: true }), barFill = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.7, 0.25), depthTest: false, transparent: true });
  for (let i = 0; i < 40; i++) { const g = new THREE.Group(), bb = new THREE.Mesh(barGeo, barBack), bf = new THREE.Mesh(barGeo, barFill); bb.scale.set(1.04, 0.13, 1); bf.scale.set(1, 0.08, 1); bb.renderOrder = 10; bf.renderOrder = 11; g.add(bb, bf); g.visible = false; scene.add(g); bars.push({ g, bf }); }

  // ---------- what is built: paper stands, the light they pass on, fire, bells, lightning ----------
  const lightMat = () => new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Color(1, 1, 1) }, uI: { value: 1 }, uMode: { value: 0 }, uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexShader: VS,
    fragmentShader: `uniform vec3 uCol; uniform float uI, uMode, uTime; varying vec2 vUv; void main(){ float a;
      if (uMode > 1.5) { float r = length(vUv - 0.5) * 2.0; float f = sin(atan(vUv.y - 0.5, vUv.x - 0.5) * 7.0 + uTime * 6.0) * 0.12; a = smoothstep(1.0 + f, 0.35, r) * (0.7 + 0.3 * sin(uTime * 11.0 + r * 9.0)); }
      else if (uMode > 0.5) { float r = length(vUv - 0.5) * 2.0; a = smoothstep(1.0, 0.5, r); }
      else { float w = 1.0 - abs(vUv.x - 0.5) * 2.0; a = smoothstep(0.0, 0.5, w) * mix(1.0, 0.55, vUv.y) * smoothstep(0.0, 0.03, vUv.y) * (0.9 + 0.1 * sin(vUv.y * 40.0 - uTime * 8.0)); }
      gl_FragColor = vec4(uCol * a * uI, a * uI); }` });
  const segGeo = new THREE.PlaneGeometry(1, 1); segGeo.translate(0, 0.5, 0); segGeo.rotateX(-Math.PI / 2);
  const discGeo = new THREE.PlaneGeometry(2, 2); discGeo.rotateX(-Math.PI / 2);
  const toolObjs = [], lightObjs = [], feedLines = [], zaps = [];
  const lineMat = new THREE.LineBasicMaterial({ color: new THREE.Color(1.6, 1.25, 0.7), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const zapMat = new THREE.LineBasicMaterial({ color: new THREE.Color(1.6, 2.4, 0.9), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
  const DEPTH_COL = [[1, 0.56, 0.2], [1.0, 0.56, 0.2], [1.05, 0.64, 0.26], [1.1, 0.72, 0.33], [1.15, 0.8, 0.42], [1.2, 0.88, 0.52]];   // passed-on light stays amber; deeper chains only grow a little paler
  const pipGeo = new THREE.CircleGeometry(0.055, 8), pipMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.8, 0.3) }), pipMax = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.3, 0.5) });
  function syncTools(game) {
    const bornAt = new Map(toolObjs.map(o => [o.slot + o.type + o.lvl, o.born]));
    for (const o of toolObjs) { scene.remove(o.g); o.glow?.dispose(); } toolObjs.length = 0; for (const o of lightObjs) { scene.remove(o); o.material.dispose(); } lightObjs.length = 0; for (const l of feedLines) { scene.remove(l); l.geometry.dispose(); } feedLines.length = 0;
    game.tools.forEach((t, i) => { if (!t) return; const [shape, h] = TOOL_SHAPE[t.type], s = SLOTS[i], g = cutout(shape, { height: h * (1 + 0.09 * (t.lvl - 1)), mat: M.prop, step: 6, rough: 1.2, cast: false, receive: false });
      const lit = !BUILDS[t.type].optic || t.depth > 0, glow = null;
      for (let k = 0; k < t.lvl; k++) { const pip = new THREE.Mesh(pipGeo, t.lvl === 4 ? pipMax : pipMat); pip.position.set((k - (t.lvl - 1) / 2) * 0.15, g.userData.h + 0.14, 0.02); g.add(pip); }
      g.position.set(s.x, 0, s.z + 0.05); scene.add(g); toolObjs.push({ g, glow, slot: i, type: t.type, lvl: t.lvl, lit, born: bornAt.get(i + t.type + t.lvl) ?? clock }); });
    for (const i of game.feeds) { const s = SLOTS[i], g = new THREE.BufferGeometry().setFromPoints([LANTERN, new THREE.Vector3(s.x, TOOL_SHAPE[game.tools[i].type][1] * 0.75, s.z)]), l = new THREE.Line(g, lineMat); l.renderOrder = 6; scene.add(l); feedLines.push(l); }
    for (const L of game.lights) { const t = game.tools[L.slot], m = new THREE.Mesh(L.kind === 'seg' || L.kind === 'link' ? segGeo : discGeo, lightMat()), u = m.material.uniforms, c = L.kind === 'fire' ? [1.3, 0.5, 0.12] : DEPTH_COL[L.depth || 1];
      u.uCol.value.setRGB(c[0], c[1], c[2]); u.uMode.value = L.kind === 'fire' ? 2 : L.kind === 'disc' ? 1 : 0;
      if (L.kind === 'seg' || L.kind === 'link') { m.position.set(L.x0, 0.04, L.z0); m.rotation.y = Math.atan2(-(L.x1 - L.x0), -(L.z1 - L.z0)); m.scale.set((L.hw || 0.2) * 2.6, 1, Math.hypot(L.x1 - L.x0, L.z1 - L.z0)); } else { m.position.set(L.x, 0.045, L.z); m.scale.set(L.r * 1.15, 1, L.r * 1.15); }
      m.userData = { L, base: L.kind === 'link' ? 0.28 : L.kind === 'fire' ? 0.8 : L.kind === 'disc' ? 0.62 : 0.4 + 0.07 * (L.depth || 1) }; m.renderOrder = 3; scene.add(m); lightObjs.push(m); }
  }
  const ringMat = new THREE.ShaderMaterial({ uniforms: { uR: { value: 0 }, uI: { value: 0 }, uW: { value: 0.012 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexShader: VS,
    fragmentShader: `uniform float uR, uI, uW; varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0; float e = 0.0012; float a = smoothstep(uR - uW - e, uR - uW, r) * (1.0 - smoothstep(uR, uR + e, r)) * uI; gl_FragColor = vec4(vec3(1.0, 0.86, 0.6) * a, a); }` });
  const RING = 36, ring = new THREE.Mesh(new THREE.PlaneGeometry(RING, RING), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.set(TOWER.x, 0.05, TOWER.z); ring.renderOrder = 3; scene.add(ring);
  const aimRing = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 0, depthWrite: false })); aimRing.rotation.x = -Math.PI / 2; aimRing.renderOrder = 4; scene.add(aimRing);
  const selRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.58, 28), new THREE.MeshBasicMaterial({ color: 0xffd28a, transparent: true, opacity: 0.9, depthWrite: false })); selRing.rotation.x = -Math.PI / 2; selRing.visible = false; selRing.renderOrder = 4; scene.add(selRing);

  // ---------- post ----------
  const BLOOM_MAX = 0.42, composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.24, 0.55, 0.92); composer.addPass(bloom);
  const grade = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uDawn: { value: 0 }, uFade: { value: 1 }, uVig: { value: 0.75 }, uExp: { value: 1 }, uTime: { value: 0 } }, vertexShader: VS,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uDawn, uFade, uVig, uExp, uTime; varying vec2 vUv; float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb * uExp; float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); vec3 sh = mix(vec3(0.80, 0.93, 1.30), vec3(1.10, 0.96, 0.98), uDawn), hi = mix(vec3(1.10, 1.00, 0.84), vec3(1.08, 1.00, 0.90), uDawn);
        c *= mix(sh, hi, smoothstep(0.0, 0.5, l)); c = mix(vec3(l), c, mix(1.18, 1.10, uDawn)); c = pow(max(c, 0.0), vec3(1.08)); if (!(c.r + c.g + c.b < 1e6)) c = vec3(0.02, 0.03, 0.08); float v = smoothstep(1.02, 0.28, length((vUv - vec2(0.5, 0.52)) * vec2(0.95, 1.12))); c *= mix(1.0, v, uVig); c += (hash(vUv * 900.0 + uTime) - 0.5) * 0.012;
        gl_FragColor = vec4(max(c, 0.0) * uFade, 1.0); }` });
  composer.addPass(grade); composer.addPass(new OutputPass());
  // The canvas never changes size while playing. Slow devices get a smaller internal render target instead,
  // switched at the start of a frame, so the screen never shows a cleared (black) frame.
  const basePR = Math.min(devicePixelRatio || 1, 1.5); let scale = 1, wantScale = 1, pixelRatio = basePR, W = 1, H = 1;
  const setPx = () => { dustMat.uniforms.uPx.value = eMat.uniforms.uPx.value = H * pixelRatio / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))); };
  let redraw = false;
  const applyScale = () => { scale = wantScale; pixelRatio = basePR * scale; composer.setPixelRatio(pixelRatio); setPx(); redraw = true; };
  function resize() { H = innerHeight; W = Math.min(innerWidth, Math.round(H * 9 / 16)); frame.style.width = W + 'px'; frame.style.height = H + 'px'; renderer.setPixelRatio(basePR); renderer.setSize(W, H); composer.setPixelRatio(pixelRatio); composer.setSize(W, H);
    camera.aspect = W / H; camera.fov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(20)) * Math.max(1, 0.5625 / camera.aspect)) * 180 / Math.PI; camera.updateProjectionMatrix(); dustMat.uniforms.uPx.value = eMat.uniforms.uPx.value = H * pixelRatio / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))); }
  addEventListener('resize', resize); resize();
  setShadowMode('dawn'); renderer.compile(scene, camera); setShadowMode('night'); renderer.compile(scene, camera);

  const st = { dawn: 0, dawnTarget: 0, gather: 0, flashT: -1, lost: 0, fade: 0, freeze: 0, lastStop: -9, slow: 0, fast: 0, fps: 60, fpsAcc: 0, fpsN: 0, sel: -1, alive: 0 };
  const LOOKDEV = { POOL: 32, BEAM_MAX: 820, CONE: 1.15 }; let { POOL, BEAM_MAX, CONE } = LOOKDEV;
  const beamAim = new THREE.Vector3(0, 0, -1), ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ndc = new THREE.Vector2(), ID = new THREE.Quaternion().setFromEuler(new THREE.Euler(LEAN, 0, 0));
  let frameNo = 0, shakeUntil = -1;
  function reset(game) { ghosts.length = 0; pops.length = 0; for (let i = 0; i < scrapData.length; i++) scrapData[i] = null; Object.assign(st, { dawn: 0, dawnTarget: 0, flashT: -1, lost: 0, gather: 0, sel: -1 }); syncTools(game ?? { tools: [], lights: [], feeds: [] }); for (const z of zaps) { scene.remove(z.l); z.l.geometry.dispose(); } zaps.length = 0; bake = 2; }
  function onEvent(e, game) {
    if (e.type === 'kill') { ghosts.push({ kind: e.enemy, x: e.x, z: e.z, t: 0, shard: e.shard }); if (ENEMY_BIG[e.enemy] && clock - st.lastStop > 0.7) { st.lastStop = clock; st.freeze = 0.05; } }
    else if (e.type === 'flash') { st.flashT = 0; shakeUntil = clock + 4; for (let i = 0; i < 60; i++) { const r = Math.random, a = r() * 6.283, el = (r() - 0.3) * 1.4, sp = 3 + r() * 7; ember(LANTERN.x, LANTERN.y, LANTERN.z, Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp * 0.6, Math.abs(Math.sin(a)) * Math.cos(el) * sp + 0.5, r() * 0.1, 0.8 + r() * 1.4, 0.14 + r() * 0.2, 0.5 + r(), [2.0, 1.2 + r() * 0.5, 0.35]); } }
    else if (e.type === 'build' || e.type === 'upgrade' || e.type === 'sell' || e.type === 'rotate' || e.type === 'card') { if (game.dirty) game.relink(); syncTools(game); if (e.type === 'build' || e.type === 'upgrade') { const s = SLOTS[e.slot]; pops.push({ t: 0, x: s.x, y: 0.5, z: s.z + 0.2, s: 1.6, col: [1, 0.85, 0.5] }); } }
    else if (e.type === 'bell') { const s = SLOTS[e.slot]; pops.push({ t: 0, x: s.x, y: 0.06, z: s.z, s: e.r * 2, flat: true, col: [0.75, 0.85, 1.0], dur: 0.5 }); }
    else if (e.type === 'zap') { const pts = e.pts.map((p, i) => new THREE.Vector3(p.x + (i ? (Math.random() - 0.5) * 0.15 : 0), i ? 0.35 : 0.6, p.z)); const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), zapMat); l.renderOrder = 9; scene.add(l); zaps.push({ l, t: 0 }); }
    else if (e.type === 'won') st.dawnTarget = 1; else if (e.type === 'lost') st.lost = 0.001;
  }
  const ENEMY_BIG = { turtle: 1, boss: 1 };
  function pickGround(cx, cy) { const r = renderer.domElement.getBoundingClientRect(); ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); return ray.ray.intersectPlane(plane, _v) ? { x: _v.x, z: _v.z } : null; }
  function slotAt(cx, cy, game) { const r = renderer.domElement.getBoundingClientRect(), px = cx - r.left, py = cy - r.top; let best = -1, bd = 1e9;
    SLOTS.forEach((s, i) => { const b = toScreen(s.x, 0, s.z), t = toScreen(s.x, 1.25, s.z), hh = b.y - t.y, built = game ? !!game.tools[i] : toolObjs.some(o => o.slot === i);
      if (Math.abs(px - b.x) > hh * 0.5 || py > b.y + hh * 0.35 || py < (built ? t.y - 8 : b.y - hh * 0.4)) return; const d = Math.hypot(px - b.x, py - (b.y - (built ? hh * 0.4 : 0))); if (d < bd) { bd = d; best = i; } }); return best; }
  function toScreen(x, y, z) { _v.set(x, y, z).project(camera); return { x: (_v.x * 0.5 + 0.5) * W, y: (-_v.y * 0.5 + 0.5) * H }; }

  function frameUpdate(dt, game, real) {
    frameNo++; const ti = performance.now() * 0.001; if (st.freeze > 0) { st.freeze -= dt; dt = 0; } clock += dt;
    if (wantScale !== scale) applyScale();
    st.dawn += clamp(st.dawnTarget - st.dawn, -dt / 4, dt / 3.5); const D = sstep(0, 1, st.dawn);
    if (st.lost > 0) st.lost = Math.min(1, st.lost + dt / 2.5); if (st.flashT >= 0) { st.flashT += dt; if (st.flashT > 4) st.flashT = -1; }
    const tf = st.flashT, flashSpike = tf >= 0 ? Math.exp(-tf * 7) * sstep(0, 0.14, tf) : 0, after = tf >= 0 ? Math.exp(-tf * 0.6) * sstep(0, 0.3, tf) : 0, gather = st.gather;
    setShadowMode(st.dawn < 0.04 ? 'night' : 'dawn');
    // --- enemies (instanced)
    for (const k in kinds) kinds[k].n = 0; let nb = 0, hitPulse = 0;
    const put = (kind, x, y, z, sx, sy, flip, bright) => { const K = kinds[kind]; if (K.n >= CAP[kind]) return; _m.compose(_v.set(x, y, z), ID, _s.set(sx * flip, sy, 1)); K.mesh.setMatrixAt(K.n, _m); K.cast.setMatrixAt(K.n, _m); K.mesh.setColorAt(K.n, _c.setRGB(bright, bright, bright)); K.n++; };
    if (game) { st.alive = game.enemies.length;
      for (const e of game.enemies) { const K = kinds[e.type]; if (!K) continue; const ph = clock * (5 + e.spd * 3) + e.ph, hop = e.stun > 0 ? 0 : Math.abs(Math.sin(ph)), lift = (e.air > 0 ? Math.sin(e.air * Math.PI) * 0.9 : hop * 0.06 * Math.min(2, K.h * 2)) - Math.max(0, 1 - e.s) * K.h * 0.55;   // they crawl up out of the waves
        if (e.lit > 0.1) hitPulse = 1;
        const sw = e.type === 'fry' || e.type === 'baby' || e.type === 'fish' ? 1 : 0;   // a little scatter so a swarm reads as many small things, not one mass
        put(e.type, e.x + Math.cos(e.ph * 7) * 0.2 * sw, lift, e.z + 0.02 + Math.sin(e.ph * 5) * 0.14 * sw, 1 + 0.07 * (0.5 - hop), 1 - 0.09 * (0.5 - hop), e.hx > 0.35 ? -1 : 1, e.blocked > 0 ? 9 : e.lit > 0 ? 2.4 : e.stun > 0 ? 1.6 : e.z > 4.2 ? 1.6 : 1);   // still in the water: rim and eyes a little brighter so they read against the waves
        if ((e.type === 'turtle' || e.type === 'boss') && nb < bars.length) { const b = bars[nb++], k = clamp(e.hp / e.max), w = Math.min(2.2, K.h * 0.9); b.g.visible = true; b.g.position.set(e.x, K.h + 0.22, e.z); b.g.quaternion.copy(camera.quaternion); b.g.scale.set(w, 1, 1); b.bf.scale.x = Math.max(0.001, k * 0.98); b.bf.position.x = -(1 - k) * 0.49; } } }
    for (; nb < bars.length; nb++) bars[nb].g.visible = false;
    for (let i = ghosts.length - 1; i >= 0; i--) { const g = ghosts[i], K = kinds[g.kind]; g.t += dt; const big = ENEMY_BIG[g.kind], T1 = big ? 0.28 : 0.16, k = Math.sin(clamp(g.t / 0.1) * Math.PI * 0.5);   // squash, edge flashes white, pop + scraps
      if (g.t < T1) { put(g.kind, g.x, 0, g.z + 0.02, 1 + 0.42 * k, 1 - 0.46 * k, 1, g.t > T1 * 0.55 ? 16 : 1.5); continue; }
      const small = g.kind === 'fry' || g.kind === 'baby'; burst(g.x, g.z, K.h, big ? 14 : small ? 2 : 4, CHIP, big ? 24 : 2); if (!small) pops.push({ t: 0, x: g.x, y: K.h * 0.5, z: g.z + 0.2, s: Math.max(0.7, K.h * 1.7) });
      if (g.shard > 0) ember(g.x, K.h * 0.6, g.z, 2.6 + Math.random() * 0.3, 9.4, -6, 0, 0.8, 0.42, 0, [1.3, 1.6, 2.3], 1);
      ghosts.splice(i, 1); }
    for (const k in kinds) { const K = kinds[k]; K.mesh.count = K.n; K.cast.count = K.n; K.mesh.instanceMatrix.needsUpdate = true; K.cast.instanceMatrix.needsUpdate = true; if (K.mesh.instanceColor) K.mesh.instanceColor.needsUpdate = true; }
    while (pops.length > popMeshes.length) pops.shift();
    for (let i = 0; i < popMeshes.length; i++) { const p = pops[i], pm = popMeshes[i]; if (!p) { pm.visible = false; continue; } p.t += dt; const a = p.t / (p.dur || 0.34); if (a >= 1) { pops.splice(i, 1); i--; continue; }
      const k = 1 - Math.pow(1 - a, 3); pm.visible = true; pm.position.set(p.x, p.y, p.z); if (p.flat) pm.rotation.set(-Math.PI / 2, 0, 0); else pm.quaternion.copy(camera.quaternion); pm.scale.setScalar(p.s); const u = pm.material.uniforms; u.uR.value = 0.18 + 0.8 * k; u.uI.value = 1 - sstep(0.5, 1, a); u.uW.value = 0.09 * (1 - 0.6 * k); const c = p.col || [1, 0.97, 0.88]; u.uCol.value.setRGB(c[0], c[1], c[2]); }
    for (let i = popMeshes.length - 1; i >= pops.length; i--) popMeshes[i].visible = false;
    for (let i = zaps.length - 1; i >= 0; i--) { const z = zaps[i]; z.t += dt; if (z.t > 0.14) { scene.remove(z.l); z.l.geometry.dispose(); zaps.splice(i, 1); } }

    // --- the lighthouse beam
    const lampOn = (1 - sstep(0.15, 0.8, st.dawn)) * (1 - st.lost * 0.92), radius = game ? game.lamp.radius : 1.05;
    if (game && !game.done) beamAim.set(game.aim.x, 0, game.aim.z); else beamAim.lerp(_v.set(Math.sin(ti * 0.42 + 0.6) * 3.0, 0, -1.4 + Math.sin(ti * 0.27 + 2) * 2.8), 1 - Math.exp(-dt * 0.9));
    const bI = (1 - 0.55 * gather) * (tf >= 0 ? sstep(0.3, 1.2, tf) * 0.4 + 0.6 : 1) * lampOn * (0.92 + 0.08 * Math.sin(ti * 1.7)) * (1 + 0.25 * hitPulse), flick = 0.94 + 0.06 * Math.sin(ti * 9.1) * Math.sin(ti * 5.3), glow = (1 + flashSpike * 2.2 + after * 0.9) * lampOn * flick;
    _t.copy(beamAim).sub(LANTERN); const dist = _t.length(), len = dist * 1.45;
    // the pool on the ground keeps one brightness wherever the beam points: amber, never burnt out to white
    const BEAM = Math.min(BEAM_MAX, POOL * Math.pow(dist, 1.1) * clamp(dist / LANTERN.y, 1, 2.4)), GLOW = 19; beam.intensity = Math.max(BEAM * bI, GLOW * glow, 0.001); SPOT_FLOOR.value = clamp(GLOW * glow / beam.intensity); beam.angle = clamp(Math.atan(radius * 1.25 / dist) * (1 - 0.3 * gather), 0.05, 0.6); beam.target.position.copy(beamAim);
    _t.normalize(); _r.crossVectors(_t, _u.set(0, 1, 0)).normalize(); _u.crossVectors(_r, _t).normalize(); const rad = Math.tan(beam.angle) * len; cone.position.copy(LANTERN); cone.lookAt(beamAim); cone.scale.set(rad, rad, len);
    coneMat.uniforms.uI.value = CONE * bI; coneMat.uniforms.uTime.value = ti; const du = dustMat.uniforms; du.uO.value.copy(LANTERN); du.uDir.value.copy(_t); du.uRight.value.copy(_r); du.uUp.value.copy(_u); du.uLen.value = len; du.uRad.value = rad; du.uI.value = 2.4 * bI; du.uTime.value = ti;
    const cu = castMat.uniforms; cu.uDir.value.copy(_t); cu.uCone.value = Math.cos(beam.angle); cu.uPen.value = Math.cos(beam.angle * (1 - beam.penumbra)); cu.uA.value = clamp(bI + 0.4) * (1 - D);
    const hs = 0.55 * Math.sqrt(lampOn) + flashSpike * 2.6 + after * 0.25; halo.scale.setScalar(hs); halo.material.opacity = clamp(0.5 * lampOn + flashSpike); flare.scale.setScalar(hs * 1.5 + flashSpike * 5); flare.material.opacity = clamp(0.12 * lampOn + flashSpike * 0.9);
    towerGlow.color.copy(towerGlow.userData.base).multiplyScalar(clamp(lampOn * flick + flashSpike, 0, 2));
    aimRing.position.set(beamAim.x, 0.05, beamAim.z); aimRing.scale.setScalar(radius); aimRing.material.opacity = game && game.manual ? 0.5 : 0;
    selRing.visible = st.sel >= 0; if (st.sel >= 0) { selRing.position.set(SLOTS[st.sel].x, 0.05, SLOTS[st.sel].z); selRing.scale.setScalar(1 + 0.06 * Math.sin(ti * 6)); }
    lineMat.opacity = 0.5 * lampOn * (0.8 + 0.2 * Math.sin(ti * 7));
    // --- stands and their light
    for (const o of toolObjs) { const a = clamp((clock - o.born) / 0.25); o.g.scale.setScalar(0.6 + 0.4 * (1 - Math.pow(1 - a, 3))); o.g.rotation.z = Math.sin(ti * 1.3 + o.slot) * 0.02 + (o.lit ? 0 : Math.sin(ti * 9 + o.slot) * 0.015); o.g.rotation.x = LEAN; }
    for (const m of lightObjs) { m.material.uniforms.uI.value = m.userData.base * (1 - D) * (0.9 + 0.1 * Math.sin(ti * 2.3 + m.userData.L.slot)); m.material.uniforms.uTime.value = ti; }
    if (game && frameNo % 4 === 0) for (const L of game.lights) if (L.kind === 'fire') { const a = Math.random() * 6.283, r = Math.random() * L.r; ember(L.x + Math.cos(a) * r, 0.1, L.z + Math.sin(a) * r, (Math.random() - 0.5) * 0.4, 0.9, (Math.random() - 0.5) * 0.4, 0, 0.8, 0.2, 2.2, [2.6, 1.0, 0.2]); }
    if (game && frameNo % 6 === 0) game.tools.forEach((t, i) => { if (t && t.type === 'jar') { const s = SLOTS[i]; ember(s.x + (Math.random() - 0.5) * 0.5, 0.5 + Math.random() * 0.4, s.z + 0.1, (Math.random() - 0.5) * 0.5, 0.2, (Math.random() - 0.5) * 0.5, 0, 1.3, 0.14, 0.1, [1.2, 1.9, 0.5]); } });
    { const can = game && !game.done && game.shards >= Math.min(...Object.keys(BUILDS).map(t => game.cost(-1, t)));
      slotMarks.forEach((d, i) => { d.g.visible = !game || !game.tools[i]; d.spot.material.uniforms.uI.value = (can ? 1.0 : 0.42) * (0.78 + 0.22 * Math.sin(ti * 2.6 + i * 0.8)) * (1 - 0.8 * D); }); }
    // --- windows: the village goes dark house by house as shadows get through
    const frac = game ? game.windows / game.windowsMax : 1;
    houses.forEach((h, i) => { const on = clamp(frac * houses.length - (houses.length - 1 - i)), w = on * (1 - sstep(0.3, 0.9, st.dawn)) * (0.95 + 0.05 * Math.sin(ti * 6 + i * 3)) * (1 - st.lost * 0.9); h.userData.glow.color.copy(h.userData.glow.userData.base).multiplyScalar(w); });
    // --- flash ring, paper shake, the sea
    ringMat.uniforms.uR.value = Math.max(0, tf) * WAVE_V / (RING / 2); ringMat.uniforms.uI.value = tf >= 0 ? 0.95 * (1 - sstep(0.9, 1.3, tf)) : 0; ringMat.uniforms.uW.value = 0.009 + 0.004 * clamp(tf);
    const shaking = clock < shakeUntil;
    for (const f of flats) { const d = Math.hypot(f.x - TOWER.x, f.z - TOWER.z), tw = tf - d / WAVE_V; let a = Math.sin(ti * 0.9 + f.seed) * 0.005; if (tf >= 0 && tw > 0 && tw < 3.5) a += f.amp * (0.24 / (1 + d * 0.06)) * Math.exp(-tw * 1.9) * Math.sin(tw * 15); f.g.rotation.x = LEAN + a; f.g.rotation.z = a * 0.35 * Math.sin(f.seed * 3); }
    for (const w of waves) { w.g.position.x = Math.sin(ti * w.sp + w.ph) * w.drift; w.g.position.y = w.y + Math.sin(ti * w.sp * 1.7 + w.ph * 2) * w.amp; w.g.rotation.z = Math.sin(ti * w.sp * 0.8 + w.ph) * 0.01; w.g.rotation.x = LEAN + Math.sin(ti * w.sp + w.ph * 3) * 0.04; }
    boat.position.y = 0.75 + Math.sin(ti * 0.55 * 1.7 + 7.6) * 0.07; boat.rotation.z += Math.sin(ti * 0.9) * 0.02; cloudA.position.x = -2.9 + Math.sin(ti * 0.05) * 0.5;
    // --- dawn after the last wave
    for (const m of dawnMats) m.color.lerpColors(m.userData.night, m.userData.dawn, D); skyMat.uniforms.uDawn.value = D;
    hemi.color.setRGB(lerp(0.045, 1.0, D), lerp(0.07, 0.62, D), lerp(0.33, 0.52, D)); hemi.groundColor.setRGB(lerp(0.003, 0.2, D), lerp(0.004, 0.11, D), lerp(0.012, 0.16, D)); hemi.intensity = lerp(1.15, 0.8, D); fill.intensity = lerp(0.75, 0.25, D);
    const el = lerp(0.62, 0.115, sstep(0, 1, st.dawn)), az = 0.62; sun.position.set(-Math.sin(az) * Math.cos(el) * 30, Math.sin(el) * 30, -Math.cos(az) * Math.cos(el) * 30 - 2); sun.target.position.set(0, 0, -1.5); sun.intensity = 2.6 * D * clamp(0.45 / Math.sin(el), 1, 4.2); sun.color.setRGB(1, lerp(0.55, 0.72, D), lerp(0.36, 0.5, D));
    moonMat.color.setRGB(1.0 - 0.5 * D, 0.96 - 0.5 * D, 0.8 - 0.35 * D); starMat.opacity = (1 - D) * (0.7 + 0.2 * Math.sin(ti * 2));
    if (D > 0.6 && D < 0.999 && frameNo % 40 === 0) burst((Math.random() - 0.5) * 5, -1 + Math.random() * 3, 2.5, 10, FEST, 6);
    if (shadowMode === 'night') { if (bake > 0 || (shaking && frameNo % 3 === 0)) { beam.shadow.needsUpdate = true; bake--; } if (!shaking && st.wasShaking) beam.shadow.needsUpdate = true; } else if ((st.dawn < 0.999 && frameNo % 3 === 0) || bake > 0) { sun.shadow.needsUpdate = true; bake--; }
    st.wasShaking = shaking; st.fade = 1;
    grade.uniforms.uDawn.value = D; grade.uniforms.uFade.value = st.fade; grade.uniforms.uTime.value = ti % 10; grade.uniforms.uExp.value = lerp(1, 0.5, gather) * (1 - 0.45 * st.lost);
    bloom.strength = Math.min(BLOOM_MAX, 0.24 + flashSpike * 0.3); eMat.uniforms.uTime.value = clock; if (eDirty) { for (const k of ['position', 'aVel', 'aData', 'aCol']) eGeo.attributes[k].needsUpdate = true; eDirty = false; } updateScraps();
    st.calls = renderer.info.render.calls; st.tris = renderer.info.render.triangles; renderer.info.reset();
    composer.render();
    if (redraw) { redraw = false; composer.render(); }   // freshly sized targets: draw the frame again so nothing unfinished reaches the screen
    if (st.probe) { // test only: mean brightness of the frame just drawn, read straight from the GL back buffer
      const gl = renderer.getContext(), w = gl.drawingBufferWidth, hh = gl.drawingBufferHeight; if (!st.buf || st.buf.length !== w * hh * 4) st.buf = new Uint8Array(w * hh * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, w, hh, gl.RGBA, gl.UNSIGNED_BYTE, st.buf); let sum = 0, n = 0; for (let i = 0; i < st.buf.length; i += 4 * 37) { sum += 0.2126 * st.buf[i] + 0.7152 * st.buf[i + 1] + 0.0722 * st.buf[i + 2]; n++; } st.luma = sum / n / 255; renderer.resetState(); }
    dt = real ?? dt;
    if (!document.hidden && dt > 0) { st.fpsAcc += dt; st.fpsN++; if (st.fpsAcc > 0.5) { st.fps = st.fpsN / st.fpsAcc; st.fpsAcc = 0; st.fpsN = 0; }
      if (dt > 1 / 45) { st.slow += dt; st.fast = 0; } else { st.fast += dt; if (st.fast > 1) st.slow = 0; } if (st.slow > 1.2 && !st.hold) { st.slow = 0; wantScale = Math.max(0.5, scale - 0.15); } }
  }
  return { reset, onEvent, frame: frameUpdate, pickGround, slotAt, toScreen, resize, st, setGather: k => { st.gather = k; }, select: i => { st.sel = i; }, fadeIn: () => {}, setScale: k => { wantScale = k; }, canvas: renderer.domElement, _dbg: { composer, bloom, grade, renderer, scene, camera, beam, sun, dust, embers, scraps, cone, kinds, hemi, fill, M, tune: o => { ({ POOL, BEAM_MAX, CONE } = { POOL, BEAM_MAX, CONE, ...o }); } },
    info: () => ({ tris: renderer.info.render.triangles || st.tris, calls: renderer.info.render.calls || st.calls, pixelRatio: scale, fps: st.fps, alive: st.alive }) };
  } catch (err) { renderer.dispose(); renderer.domElement.remove(); throw err; }
}
