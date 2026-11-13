// 등불지기 — the paper theatre (three.js). Draws whatever the rules (sim.js) say is happening.
// The look is the approved look-dev scene: one shadow-casting light at a time, baked night
// shadows, projected monster shadows, capped bloom, automatic resolution scaling.
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { clamp, rng, WAVE_V, TOOLS, lampStats } from './sim.js';
import { buildWorld, PATH_L, PATH_Z0 } from './world.js';

const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// which silhouette each enemy wears, and where its round amber eyes sit (fractions of the outline box)
const LOOK = {
  w_ant: { h: 1.25, eyes: [[0.36, 0.6], [0.64, 0.6]], r: 0.075 }, w_horn: { h: 1.25, eyes: [[0.33, 0.54], [0.67, 0.54]], r: 0.085 },
  w_ear: { h: 1.2, eyes: [[0.37, 0.45], [0.63, 0.45]], r: 0.08 }, e_fast: { h: 0.8, eyes: [[0.7, 0.38]], r: 0.1 },
  e_fat: { h: 1.9, eyes: [[0.37, 0.22], [0.66, 0.22]], r: 0.05 }, e_color: { h: 1.05, eyes: [[0.4, 0.4], [0.6, 0.4]], r: 0.1 },
  e_umb: { h: 1.75, eyes: [[0.27, 0.47], [0.47, 0.47]], r: 0.05 },
  boss_0: { h: 3.3, eyes: [[0.38, 0.38], [0.62, 0.38]], r: 0.05 }, boss_1: { h: 2.9, eyes: [[0.13, 0.52]], r: 0.05 },
  boss_2: { h: 3.2, eyes: [[0.38, 0.3], [0.62, 0.3]], r: 0.055 }, boss_3: { h: 3.2, eyes: [[0.38, 0.32], [0.62, 0.32]], r: 0.055 },
  boss_4: { h: 3.0, eyes: [[0.43, 0.3], [0.57, 0.3]], r: 0.05 },
};
const WALKERS = ['w_ant', 'w_horn', 'w_ear'];
export const lookOf = e => e.type === 'walker' ? WALKERS[e.v % 3] : e.type === 'boss' ? 'boss_' + e.boss : { fast: 'e_fast', fat: 'e_fat', umbrella: 'e_umb', color: 'e_color' }[e.type];
const TOOL_SHAPE = { mirror: ['t_mirror', 1.25], prism: ['t_prism', 1.0], lens: ['t_lens', 1.35], glass: ['t_glass', 1.15], jar: ['t_jar', 0.75] };
const TOOL_COL = { mirror: [1.0, 0.86, 0.6], prism: [0.8, 0.9, 1.0], lens: [1.0, 0.7, 0.32], glass: [0.5, 1.0, 0.92], jar: [0.75, 1.0, 0.4] };
// night palettes per village: ground, three hills, ridge
const PALETTE = [
  [0x3c4879, 0x232b58, 0x2c376c, 0x36447f, 0x41528f], [0x2f5270, 0x1c3550, 0x254664, 0x2f5878, 0x3a6a8c],
  [0x4a3f7c, 0x2c2558, 0x38306c, 0x463c82, 0x554a96], [0x5a3a66, 0x33203f, 0x432a52, 0x543564, 0x664278],
  [0x2c5560, 0x183840, 0x204850, 0x2a5a62, 0x356d74],
];

export async function createStage(frame, SHAPES, opt = {}) {
  // The lantern is ONE light: a spot light whose cone never falls to zero, so the same
  // shadowed light gives both the dim all-round glow and the bright beam.
  const SPOT_FLOOR = { value: 0.05 }, GRAIN = { value: 5.0 };
  { const a = 'return smoothstep( coneCosine, penumbraCosine, angleCosine );';
    if (THREE.ShaderChunk.lights_pars_begin.includes(a)) THREE.ShaderChunk.lights_pars_begin = 'uniform float uSpotFloor;\n' + THREE.ShaderChunk.lights_pars_begin
      .replace(a, 'return mix( uSpotFloor, 1.0, smoothstep( coneCosine, penumbraCosine, angleCosine ) );'); }

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  frame.prepend(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x05060f);
  const camera = new THREE.PerspectiveCamera(36, 9 / 16, 0.5, 80);
  camera.position.set(0, 10.5, 15); camera.lookAt(0, 2.2, -1.3);

  try {
  const TL = new THREE.TextureLoader();
  const tex = (url, srgb = true, repeat = 1) => new Promise((res, rej) => TL.load(url, t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; res(t); }, undefined, rej));
  const [paperW, paperWN, paperCreaseN, pCircle, pSpark, pFlare, pLight, pStar, pSmoke] = await Promise.all([
    tex('./assets/paper/Paper001_Color.jpg', true, 0.45), tex('./assets/paper/Paper001_NormalGL.jpg', false, 0.45), tex('./assets/paper/Paper003_NormalGL.jpg', false, 0.2),
    tex('./assets/particles/circle_05.png'), tex('./assets/particles/spark_05.png'), tex('./assets/particles/flare_01.png'), tex('./assets/particles/light_01.png'),
    tex('./assets/particles/star_07.png'), tex('./assets/particles/smoke_04_alpha.png')]);

  // ---------- paper ----------
  const svgLoader = new SVGLoader(), dawnMats = [];
  const dawnTint = (m, night, dawn) => { m.userData.night = new THREE.Color(night); m.userData.dawn = new THREE.Color(dawn ?? night); dawnMats.push(m); return m; };
  function paperMat(night, dawn) {
    const m = new THREE.MeshLambertMaterial({ color: night, map: paperW, normalMap: paperWN, normalScale: new THREE.Vector2(1, 1), side: THREE.DoubleSide, shadowSide: THREE.DoubleSide });
    m.onBeforeCompile = sh => { sh.uniforms.uSpotFloor = SPOT_FLOOR; sh.uniforms.uGrain = GRAIN;
      sh.fragmentShader = 'uniform float uGrain;\n' + sh.fragmentShader.replace('#include <map_fragment>',
        '#include <map_fragment>\n  diffuseColor.rgb *= clamp( 1.0 + ( texture2D( map, vMapUv ).g - texture2D( map, vMapUv, 5.0 ).g ) * uGrain, 0.45, 1.7 );'); };
    return dawnTint(m, night, dawn);
  }
  const CORE = paperMat(0x8f95b8, 0xe9cdb6);
  const geoCache = new Map();
  // Outline -> jittered paper shapes (see look-dev notes): resampled so no edge is clean, plus a fringe layer.
  function outline(name, o) {
    const key = name + JSON.stringify([o.height, o.squash, o.step, o.rough, o.fr0, o.fr1, o.solid, o.holeFringe, o.seed]);
    if (geoCache.has(key)) return geoCache.get(key);
    const S = SHAPES[name], k = o.height / S.h, sy = o.squash ?? 1, step = o.step ?? 5, rough = o.rough ?? 0.9, fr0 = o.fr0 ?? 0.8, fr1 = o.fr1 ?? 2.2;
    const rnd = rng(o.seed ?? name.length * 977 + S.w);
    const shapes = svgLoader.parse(`<svg xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="${S.d}"/></svg>`).paths.flatMap(p => SVGLoader.createShapes(p));
    const W = (x, y) => new THREE.Vector2((x - S.w / 2) * k, (S.h - y) * k * sy);
    const main = [], fringe = [], holes = [];
    const contour = (pts, isHole) => {
      let P = pts.map(p => [p.x, p.y]);
      if (P.length > 1 && Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < 0.01) P.pop();
      const R = [];
      for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length];
        if (R.length && Math.hypot(a[0] - R[R.length - 1][0], a[1] - R[R.length - 1][1]) < step * 0.3) continue;
        R.push(a); const d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.floor(d / step);
        for (let j = 1; j < n; j++) R.push([a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n]);
      }
      let area = 0, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let i = 0; i < R.length; i++) { const a = R[i], b = R[(i + 1) % R.length]; area += a[0] * b[1] - b[0] * a[1]; x0 = Math.min(x0, a[0]); x1 = Math.max(x1, a[0]); y0 = Math.min(y0, a[1]); y1 = Math.max(y1, a[1]); }
      area /= 2;
      const sign = (area > 0 ? 1 : -1) * (isHole ? -1 : 1), flat = Math.abs(area) < 260 || (isHole && o.holeFringe === false);
      const m = [], f = [];
      for (let i = 0; i < R.length; i++) {
        const a = R[(i - 1 + R.length) % R.length], b = R[(i + 1) % R.length], p = R[i];
        let nx = (b[1] - a[1]), ny = -(b[0] - a[0]); const nl = Math.hypot(nx, ny) || 1; nx = nx / nl * sign; ny = ny / nl * sign;
        const j = (rnd() - 0.5) * 2 * rough + (rnd() < 0.04 ? -rough * 2.2 * rnd() : 0);
        m.push(W(p[0] + nx * j, p[1] + ny * j));
        const ff = flat ? 0 : fr0 + rnd() * rnd() * fr1 + (rnd() < 0.06 ? fr1 * 0.9 : 0);
        f.push(W(p[0] + nx * ff, p[1] + ny * ff));
      }
      return { m, f, area: Math.abs(area), box: [x0, y0, x1, y1], n: R.length };
    };
    for (const sh of shapes) {
      const out = contour(sh.getPoints(3), false); if (out.n < 3) continue;
      const ms = new THREE.Shape(out.m), fs = new THREE.Shape(out.f);
      if (!o.solid) for (const h of sh.holes) {
        const c = contour(h.getPoints(3), true); if (c.n < 3 || c.area < 8) continue;
        ms.holes.push(new THREE.Path(c.m)); fs.holes.push(new THREE.Path(c.f));
        const a = W(c.box[0], c.box[3]), b = W(c.box[2], c.box[1]);
        holes.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, w: b.x - a.x, h: b.y - a.y, pw: c.box[2] - c.box[0], ph: c.box[3] - c.box[1], py: (c.box[1] + c.box[3]) / 2 / S.h });
      }
      main.push(ms); fringe.push(fs);
    }
    const r = { main, fringe, holes, w: S.w * k, h: o.height * sy, k, S };
    geoCache.set(key, r); return r;
  }
  function cutout(name, o) {
    const O = outline(name, o), g = new THREE.Group();
    const body = o.flat ? new THREE.Mesh(O.gFlat ??= new THREE.ShapeGeometry(O.main, 1), o.mat)
      : new THREE.Mesh(O.gBody ??= new THREE.ExtrudeGeometry(O.main, { depth: o.depth ?? 0.03, bevelEnabled: false, curveSegments: 1 }), [o.mat, CORE]);
    const fringe = new THREE.Mesh(O.gFringe ??= new THREE.ShapeGeometry(O.fringe, 1), o.core ?? CORE); fringe.position.z = -0.006;
    for (const m of [body, fringe]) { m.castShadow = o.cast ?? true; m.receiveShadow = o.receive ?? true; g.add(m); }
    g.userData = { holes: O.holes, w: O.w, h: O.h, body, fringe, O };
    return g;
  }

  const M = {
    house: paperMat(0x2b2f55, 0x3a2f4a), house2: paperMat(0x33294f, 0x44304a), tower: paperMat(0x2a2440, 0x3b2a44), tree: paperMat(0x1c2c44, 0x2e3350),
    prop: paperMat(0x24284a, 0x3a3048), monster: paperMat(0x0d0c18, 0x15101c), hill1: paperMat(0x232b58, 0x5f4a70), hill2: paperMat(0x2c376c, 0x8a6585),
    hill3: paperMat(0x36447f, 0xb07f8e), ridge: paperMat(0x41528f, 0xd29a92), front: paperMat(0x11152c, 0x2a2238), cloud: paperMat(0x26326e, 0x8a6480),
    ground: paperMat(0x3c4879, 0x9a7f95), path: paperMat(0x8d8a9e, 0xf3d6b4), folk: paperMat(0x1a1830, 0x2a2036), slot: paperMat(0x6f759c, 0xcbb0a4),
  };
  M.ground.normalMap = paperCreaseN; M.ground.normalScale.set(1.3, 1.3);

  // ---------- fixed scenery ----------
  const village = new THREE.Group(); scene.add(village);
  const flats = [];
  const stand = (parent, g, x, z, o = {}) => { g.position.set(x, o.y ?? 0, z); parent.add(g); flats.push({ g, amp: o.amp ?? 1, seed: flats.length * 1.7, x, z, village: parent === village }); return g; };
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), M.ground); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  { const uv = ground.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 60, uv.getY(i) * 60); }
  const backdrop = new THREE.Group(); scene.add(backdrop);
  const back = (n, z, h, mat, y = 0, x = 0, sq = 1, extra = {}) => stand(backdrop, cutout(n, { height: h, mat, squash: sq, step: 10, cast: false, fr0: 2, fr1: 5, ...extra }), x, z, { y, amp: 0.35 });
  back('hill_grass', -9.5, 1.9, M.hill1, 0, 0.5, 0.55); back('hill_pines', -11.0, 2.1, M.hill2, 0.45, -1.0, 0.68);
  back('hill_far', -12.5, 1.6, M.hill3, 1.15, 1.5, 0.85); back('ridge', -14.0, 3.0, M.ridge, 1.3, -0.5, 0.72);
  const cloudRim = dawnTint(new THREE.MeshBasicMaterial({ color: 0xffffff }), new THREE.Color(0.10, 0.14, 0.34), new THREE.Color(0.80, 0.52, 0.46));
  const mkCloud = (n, z, h, y, x) => { const g = back(n, z, h, M.cloud, y, x, 1, { core: cloudRim, fr0: 2, fr1: 2, step: 6, receive: false }); g.userData.fringe.position.x -= 0.012; g.userData.fringe.position.y += 0.014; return g; };
  const cloudA = mkCloud('cloud_a', -15.2, 0.75, 4.05, -2.9), cloudB = mkCloud('cloud_b', -15.4, 0.8, 4.6, 2.6);
  const front = stand(backdrop, cutout('hill_low', { height: 1.5, mat: M.front, step: 10, cast: false, fr0: 2, fr1: 5 }), 0.4, 5.3, { amp: 0.3 }); front.scale.set(0.62, 1, 1);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: paperW }, uDawn: { value: 0 }, uGlow: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `uniform sampler2D map; uniform float uDawn, uGlow; varying vec2 vUv;
      void main(){ float h = vUv.y;
        vec3 night = mix(vec3(0.060,0.085,0.26), vec3(0.012,0.016,0.075), smoothstep(0.25,0.95,h));
        vec3 dawn = mix(vec3(0.95,0.47,0.29), vec3(0.30,0.26,0.50), smoothstep(0.28,0.62,h)); dawn = mix(dawn, vec3(1.15,0.70,0.38), smoothstep(0.36,0.22,h));
        vec3 c = mix(night, dawn, uDawn); vec2 q = vUv * vec2(9.0, 7.0);
        c *= 0.9 + (texture2D(map, q).g - texture2D(map, q, 5.0).g) * 5.0; c += vec3(1.0,0.55,0.2) * uGlow * smoothstep(0.75,0.2,h) * 0.06;
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(34, 24), skyMat); sky.position.set(0, 9, -17); scene.add(sky);
  const moonMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.96, 0.8), map: paperW });
  const moon = cutout('moon', { height: 0.95, mat: moonMat, core: moonMat, cast: false, receive: false }); moon.rotation.z = -0.35; scene.add(moon);
  const starGeo = new THREE.BufferGeometry();
  { const r = rng(11), p = []; for (let i = 0; i < 46; i++) p.push((r() - 0.5) * 12, 3.5 + r() * 2.6, -16.7); starGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); }
  const starMat = new THREE.PointsMaterial({ map: pStar, size: 0.26, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xaab4e0 });
  scene.add(new THREE.Points(starGeo, starMat));

  // ---------- the village (rebuilt per chapter) ----------
  const AMBER = new THREE.Color(1.15, 0.56, 0.15);
  function glowPanes(g, test, color, z = -0.02, k = 1) {
    const mat = new THREE.MeshBasicMaterial({ color }); mat.userData.base = mat.color.clone();
    for (const h of g.userData.holes) { if (!test(h)) continue; const p = new THREE.Mesh(new THREE.PlaneGeometry((h.w + 0.03) * k, (h.h + 0.03) * k), mat); p.position.set(h.x, h.y, z); g.add(p); }
    return mat;
  }
  const HOUSE_SET = [['house_a', 2.0, 0.42], ['house_d', 3.1, 0.2], ['house_c', 1.5, 0.42], ['house_b', 1.7, 0.42], ['house_e', 1.35, 0.42]];
  const HOUSE_POS = [[-2.75, -3.3], [2.75, -4.3], [2.9, 0.1], [-2.9, 0.5], [2.3, 2.9]];
  let world = buildWorld(SHAPES, false), houses = [], towerGlow = null, slotMarks = [], folk = [], extras = {}, chapter = -1;
  const LANTERN = new THREE.Vector3(), towerPos = new THREE.Vector3();
  function setChapter(c) {
    if (c === chapter) return; chapter = c;
    for (let i = flats.length - 1; i >= 0; i--) if (flats[i].village) flats.splice(i, 1);
    village.clear();
    const mx = c % 2 === 1 ? -1 : 1; world = buildWorld(SHAPES, mx < 0);
    const pal = PALETTE[c % PALETTE.length];
    [M.ground, M.hill1, M.hill2, M.hill3, M.ridge].forEach((m, i) => m.userData.night.set(pal[i]));
    const pathG = cutout('path', { height: PATH_L, mat: M.path, step: 7, rough: 1.4, fr0: 1.5, fr1: 4, depth: 0.012, cast: false });
    pathG.rotation.x = -Math.PI / 2; pathG.position.set(0, 0.012, PATH_Z0); pathG.scale.x = mx; village.add(pathG);
    towerPos.set(world.tower.x, 0, world.tower.z);
    const tower = stand(village, cutout('tower', { height: 4.7, mat: M.tower, step: 4 }), towerPos.x, towerPos.z, { amp: 0.5 });
    const chamber = tower.userData.holes.filter(h => h.py < 0.3).sort((a, b) => b.w * b.h - a.w * a.h)[0] ?? { x: 0, y: 3.6 };
    LANTERN.set(towerPos.x + chamber.x, chamber.y, towerPos.z + 0.3);
    towerGlow = glowPanes(tower, h => h.pw > 24 && h.ph > 24, new THREE.Color(0.95, 0.5, 0.15));
    houses = HOUSE_POS.map(([x, z], i) => {
      const [n, h, roof] = HOUSE_SET[(i + c) % HOUSE_SET.length];
      const g = stand(village, cutout(n, { height: h, mat: i % 2 ? M.house2 : M.house }), x * mx, z);
      g.userData.glow = glowPanes(g, q => q.pw > 22 && q.ph > 22 && q.py > roof, AMBER);
      const win = g.userData.holes.filter(q => q.pw > 22 && q.ph > 22 && q.py > roof).sort((a, b) => b.x - a.x)[0];
      g.userData.smokeAt = new THREE.Vector3(g.position.x + (win?.x ?? 0), (win?.y ?? 0.6) + 0.08, z + 0.08); g.userData.outT = -1; g.userData.on = true;
      return g;
    });
    const T = [['tree_a', 2.9, -3.9, -5.6], ['tree_b', 2.5, 4.0, -1.9], ['tree_c', 2.0, -4.0, -1.3], ['tree_d', 2.1, 4.1, -6.2], ['bush', 1.5, -3.6, 2.8]];
    T.forEach(([n, h, x, z], i) => stand(village, cutout(T[(i + c) % T.length][0], { height: h, mat: M.tree, step: 6 }), x * mx, z));
    extras.well = stand(village, cutout('well', { height: 1.05, mat: M.prop, step: 4 }), -2.2 * mx, -1.9);
    extras.plaza = stand(village, cutout('fence', { height: 0.62, mat: M.prop }), 3.3 * mx, 3.4);
    stand(village, cutout('fence', { height: 0.6, mat: M.prop, seed: 5 }), -1.9 * mx, -6.3);
    // build spots: a pale paper disc each
    slotMarks = world.slots.map(s => {
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.42, 9), M.slot); d.rotation.x = -Math.PI / 2; d.position.set(s.x, 0.03, s.z); d.receiveShadow = true; d.visible = false; village.add(d); return d;
    });
    // villagers (shown in the village view once their building is lit)
    const F = [['v_old', 1.05], ['v_woman', 1.0], ['v_child', 1.0], ['v_music', 1.15], ['v_music2', 1.1], ['v_old', 1.0], ['v_woman', 1.05]];
    const spots = [...houses.map(h => [h.position.x + 0.9 * mx * (h.position.x * mx > 0 ? -1 : 1), h.position.z + 0.5]), [extras.well.position.x + 0.8 * mx, -1.4], [1.6 * mx, 3.6]];
    folk = [0, 1, 5, 2, 3, 6, 4].map((si, k) => { const g = cutout(F[k][0], { height: F[k][1], mat: M.folk, step: 6, rough: 1.4, cast: true, receive: false }); g.position.set(spots[si][0], 0, spots[si][1]); g.visible = false; g.userData.ph = k * 1.3; g.userData.vid = si < 5 ? 'h' + si : si === 5 ? 'well' : 'plaza'; village.add(g); return g; });
    extras.lamps = [[extras.well, 'well', 1.2], [extras.plaza, 'plaza', 0.9]].map(([o, id, y]) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: pLight, color: 0xffb060, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); s.position.set(o.position.x, y, o.position.z + 0.15); s.scale.setScalar(1.3); s.visible = false; s.userData.vid = id; village.add(s); return s; });
    bakeShadows = 3;
  }
  // order matches levels.VILLAGE: h0 h1 well h2 h3 plaza h4
  const VILLAGE_IDS = ['h0', 'h1', 'well', 'h2', 'h3', 'plaza', 'h4'];

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight(0x3d4c9c, 0x0a0c1c, 1.0); scene.add(hemi);
  const fill = new THREE.DirectionalLight(0x5c70d8, 0.75); fill.position.set(4, 7, 12); scene.add(fill);
  const beam = new THREE.SpotLight(0xffb866, 0, 46, 0.27, 0.55, 1.1); beam.castShadow = true;
  beam.shadow.mapSize.set(2048, 2048); beam.shadow.bias = -0.0025; beam.shadow.normalBias = 0.03; beam.shadow.radius = 2.5; beam.shadow.autoUpdate = false;
  { const cam = beam.shadow.camera, look = new THREE.Vector3(0, 0, -2.4), pm = new THREE.Matrix4();
    cam.fov = 106; cam.aspect = 1; cam.near = 0.25; cam.far = 40; cam.updateProjectionMatrix();
    beam.shadow.updateMatrices = function (light) { cam.position.setFromMatrixPosition(light.matrixWorld); cam.lookAt(look); cam.updateMatrixWorld();
      pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); this._frustum.setFromProjectionMatrix(pm); this.matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(pm); }; }
  scene.add(beam, beam.target);
  const sun = new THREE.DirectionalLight(0xffb98a, 0); sun.castShadow = false; sun.shadow.mapSize.set(1536, 1536); sun.shadow.autoUpdate = false;
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 70 }); sun.shadow.bias = -0.0015; sun.shadow.normalBias = 0.04; sun.shadow.radius = 2.5;
  scene.add(sun, sun.target);
  let shadowMode = '', bakeShadows = 3;
  function setShadowMode(mode) { if (mode === shadowMode) return; shadowMode = mode; beam.castShadow = mode === 'night'; sun.castShadow = mode === 'dawn'; beam.shadow.needsUpdate = true; sun.shadow.needsUpdate = true; }

  const SKIN = new THREE.Color(1.0, 0.72, 0.4);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: pLight, color: 0xffb060, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); scene.add(halo);
  const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: pFlare, color: 0xffd9a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); scene.add(flare);
  const coneMat = new THREE.ShaderMaterial({
    uniforms: { uI: { value: 0 }, uTime: { value: 0 }, uCol: { value: new THREE.Color(1.0, 0.66, 0.3) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec2 vUv; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uI, uTime; uniform vec3 uCol; varying vec3 vN; varying vec3 vV; varying vec2 vUv;
      void main(){ float soft = pow(abs(dot(normalize(vN), normalize(vV))), 1.8); float l = 1.0 - vUv.y;
        float along = mix(0.75, 0.22, smoothstep(0.0, 0.8, l)) * smoothstep(0.0, 0.03, l);
        float streak = 0.84 + 0.16 * sin(vUv.x * 60.0 + sin(uTime * 0.4 + vUv.x * 9.0) * 2.0);
        float a = soft * along * streak * uI; gl_FragColor = vec4(uCol * a, a); }`,
  });
  const coneGeo = new THREE.CylinderGeometry(0.04, 1, 1, 48, 1, true); coneGeo.translate(0, -0.5, 0); coneGeo.rotateX(-Math.PI / 2);
  const cone = new THREE.Mesh(coneGeo, coneMat); cone.frustumCulled = false; cone.renderOrder = 5; scene.add(cone);
  const DUST = 320, dustGeo = new THREE.BufferGeometry();
  { const r = rng(3), p = [], s = []; for (let i = 0; i < DUST; i++) { p.push(r() * 6.283, Math.sqrt(r()), r()); s.push(0.5 + r(), r(), 0.4 + r() * 1.2); }
    dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); dustGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(s, 3)); }
  const dustMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: pCircle }, uTime: { value: 0 }, uI: { value: 0 }, uO: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3(0, 0, 1) }, uRight: { value: new THREE.Vector3(1, 0, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) }, uLen: { value: 1 }, uRad: { value: 1 }, uPx: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float uTime, uLen, uRad, uPx, uI; uniform vec3 uO, uDir, uRight, uUp; attribute vec3 aSeed; varying float vA;
      void main(){ float l = fract(position.z + uTime * 0.010 * aSeed.z); float ang = position.x + uTime * 0.10 * (aSeed.y - 0.5); float rf = position.y;
        float rad = mix(0.04, uRad, l) * rf; vec3 w = uO + uDir * (l * uLen) + (uRight * cos(ang) + uUp * sin(ang)) * rad; w.y += sin(uTime * 0.7 + aSeed.y * 40.0) * 0.05;
        vec4 mv = viewMatrix * vec4(w, 1.0); gl_Position = projectionMatrix * mv; float tw = 0.5 + 0.5 * sin(uTime * (1.0 + aSeed.x * 2.0) + aSeed.y * 30.0);
        vA = (1.0 - rf * rf * rf) * smoothstep(0.0, 0.1, l) * step(0.02, w.y) * tw * uI; gl_PointSize = max(1.5, uPx * (0.05 + 0.07 * aSeed.x) / -mv.z); }`,
    fragmentShader: `uniform sampler2D map; varying float vA; void main(){ float t = texture2D(map, gl_PointCoord).r; gl_FragColor = vec4(vec3(1.0,0.86,0.6) * t * vA, t * vA); }`,
  });
  const dust = new THREE.Points(dustGeo, dustMat); dust.frustumCulled = false; dust.renderOrder = 6; scene.add(dust);

  // ---------- embers (sparks, sparkles, fireflies) ----------
  const EMAX = 900, eGeo = new THREE.BufferGeometry();
  const eStart = new Float32Array(EMAX * 3), eVel = new Float32Array(EMAX * 3), eData = new Float32Array(EMAX * 4), eCol = new Float32Array(EMAX * 4);
  eGeo.setAttribute('position', new THREE.BufferAttribute(eStart, 3)); eGeo.setAttribute('aVel', new THREE.BufferAttribute(eVel, 3)); eGeo.setAttribute('aData', new THREE.BufferAttribute(eData, 4)); eGeo.setAttribute('aCol', new THREE.BufferAttribute(eCol, 4));
  const eMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: pSpark }, map2: { value: pCircle }, uTime: { value: 0 }, uPx: { value: 1 } }, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float uTime, uPx; attribute vec3 aVel; attribute vec4 aData; attribute vec4 aCol; varying vec4 vC; varying float vRot;
      void main(){ float age = uTime - aData.x, life = aData.y, a = age / life; vec3 p;
        if (aCol.a > 0.5) { p = mix(position, aVel, pow(clamp(a,0.,1.), 2.4)); p += vec3(sin(a*9.+aData.x*7.), cos(a*7.+aData.x*3.), 0.) * 0.25 * (1.-a) * a; }
        else { float d = 1.6; p = position + aVel * (1.0 - exp(-d * age)) / d; p.y += 0.5 * aData.w * age * age; p.x += sin(age * 5.0 + aData.x * 13.0) * 0.07 * age; }
        vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; float vis = step(0.0, age) * step(age, life);
        float fl = 0.7 + 0.3 * sin(uTime * 23.0 + aData.x * 91.0); vC = vec4(aCol.rgb, vis * smoothstep(0.0, 0.08, a) * (1.0 - a * a) * fl);
        vRot = aData.x * 17.0 + age * 2.0; gl_PointSize = uPx * aData.z * (1.0 - 0.6 * a) / -mv.z * vis; }`,
    fragmentShader: `uniform sampler2D map, map2; varying vec4 vC; varying float vRot;
      void main(){ vec2 q = gl_PointCoord - 0.5; float c = cos(vRot), s = sin(vRot); q = mat2(c,-s,s,c) * q + 0.5;
        float t = max(texture2D(map, q).r * 0.9, texture2D(map2, gl_PointCoord).r * 0.7); gl_FragColor = vec4(vC.rgb * t * vC.a, t * vC.a); }`,
  });
  const embers = new THREE.Points(eGeo, eMat); embers.frustumCulled = false; embers.renderOrder = 9; scene.add(embers);
  let eHead = 0, clock = 0; // clock: stage time, pauses with the game
  function ember(p, v, delay, life, size, buoy, col, converge = 0) {
    const i = eHead; eHead = (eHead + 1) % EMAX;
    eStart.set([p.x, p.y, p.z], i * 3); eVel.set([v.x, v.y, v.z], i * 3); eData.set([clock + delay, life, size, buoy], i * 4); eCol.set([col[0], col[1], col[2], converge], i * 4);
    for (const k of ['position', 'aVel', 'aData', 'aCol']) eGeo.attributes[k].needsUpdate = true;
  }
  for (let i = 0; i < EMAX; i++) eData[i * 4] = -999;

  // ---------- paper scraps ----------
  const SMAX = 60, chipPts = [[-0.5, -0.32], [0.36, -0.5], [0.5, 0.1], [0.08, 0.5], [-0.42, 0.28]], chipGeo = new THREE.BufferGeometry();
  { const pos = [], col = []; const fan = (k, z, c) => { for (let i = 1; i < chipPts.length - 1; i++) for (const p of [chipPts[0], chipPts[i], chipPts[i + 1]]) { pos.push(p[0] * k, p[1] * k, z); col.push(c, c, c); } };
    fan(1, 0, 0.06); fan(0.78, 0.03, 1); fan(0.78, -0.03, 1);
    chipGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); chipGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); }
  const scraps = new THREE.InstancedMesh(chipGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }), SMAX); scraps.frustumCulled = false; scene.add(scraps);
  const scrapData = []; let sHead = 0;
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
  const CHIP_COLS = [[1.0, 0.27, 0.12], [1.0, 0.62, 0.16], [0.99, 0.92, 0.74]], FEST_COLS = [[1, 0.3, 0.3], [1, 0.8, 0.2], [0.4, 0.9, 0.7], [0.6, 0.7, 1], [1, 0.6, 0.9]];
  function scrapPos(d, t, out) {
    const k = 1 - Math.exp(-13 * t), f = Math.max(0, t - 0.2), drop = d.fall * (f - (1 - Math.exp(-3 * f)) / 3), sw = Math.min(1, f * 2) * d.sway;
    return out.set(d.o.x + d.dir.x * d.R * k + Math.sin(f * 4.5 + d.ph) * sw, d.o.y + d.dir.y * d.R * k - drop, d.o.z + d.dir.z * d.R * k + Math.cos(f * 3.1 + d.ph) * sw * 0.4);
  }
  function burst(pos, H, n = 10, cols = CHIP_COLS, embersN = 30) {
    const r = Math.random, dist = camera.position.distanceTo(pos), unitPerPx = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / frame.clientHeight;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283 + r() * 0.5;
      const d = { o: pos.clone().add(new THREE.Vector3(0, H * 0.5, 0.12)), dir: new THREE.Vector3(Math.cos(a), Math.sin(a) * 0.8 + 0.35, 0.15 + r() * 0.5).normalize(), R: H * (0.75 + r() * 0.7), fall: 1.15 + r() * 0.7,
        sway: 0.1 + r() * 0.16, ph: r() * 6.283, birth: clock, size: (14 + r() * 5) * unitPerPx, rot: [r() * 6, r() * 6, r() * 6], w: [(r() - 0.5) * 30, (r() - 0.5) * 30, (r() - 0.5) * 20], yaw: r() * 6.283 };
      let t = 0.2; while (t < 6 && scrapPos(d, t, _v).y > 0.045) t += 0.02; d.land = t;
      scrapData[sHead] = d; const c = cols[i % cols.length]; scraps.setColorAt(sHead, _c.setRGB(c[0], c[1], c[2])); sHead = (sHead + 1) % SMAX;
    }
    scraps.instanceColor.needsUpdate = true;
    for (let i = 0; i < embersN; i++) { const a = r() * 6.283, sp = 0.3 + r() * 1.2;
      ember(_v.copy(pos).add(new THREE.Vector3((r() - 0.5) * 0.6 * H, H * (0.2 + r() * 0.6), 0.1)), new THREE.Vector3(Math.cos(a) * sp, 1.0 + r() * 1.8, (r() - 0.5) * 0.8), r() * 0.12, 1.0 + r() * 1.5, 0.26 + r() * 0.3, 1.6 + r() * 2.0, r() < 0.2 ? [2.2, 1.9, 1.3] : [2.6, 1.15 + r() * 0.5, 0.22]); }
  }
  function updateScraps() {
    for (let i = 0; i < SMAX; i++) {
      const d = scrapData[i];
      if (d) { const age = clock - d.birth, rest = 1.2, fade = 0.5;
        if (age >= 0 && age < d.land + rest + fade) {
          const t = Math.min(age, d.land), f = Math.max(0, t - 0.2), sp = (1 - Math.exp(-6 * t)) / 6, fl = Math.min(1, f * 3);
          scrapPos(d, t, _v); _e.set(d.rot[0] + d.w[0] * sp + Math.sin(f * 8 + d.ph) * 0.9 * fl, d.rot[1] + d.w[1] * sp, d.rot[2] + d.w[2] * sp + Math.sin(f * 6 + d.ph * 2) * 0.7 * fl); _q.setFromEuler(_e);
          if (age > d.land) { _e.set(-Math.PI / 2, 0, d.yaw); _q2.setFromEuler(_e); _q.slerp(_q2, sstep(0, 0.15, age - d.land)); _v.y = 0.045 + (i % 5) * 0.003; }
          const s = d.size * sstep(0, 0.04, age) * (1 - sstep(d.land + rest, d.land + rest + fade, age)); _m.compose(_v, _q, _s.set(s, s, s)); scraps.setMatrixAt(i, _m); continue; } }
      _m.makeScale(0, 0, 0); scraps.setMatrixAt(i, _m);
    }
    scraps.instanceMatrix.needsUpdate = true;
  }

  // ---------- monsters ----------
  const RIM = { def: new THREE.Color(0.6, 0.5, 1.0), color: new THREE.Color(0.25, 1.0, 0.85), fat: new THREE.Color(0.75, 0.6, 1.0), boss: new THREE.Color(1.0, 0.45, 0.6) }, WHITE = new THREE.Color(1.6, 1.6, 1.6);
  const castMat = new THREE.ShaderMaterial({
    uniforms: { uL: { value: LANTERN }, uDir: { value: new THREE.Vector3(0, -1, 0) }, uCone: { value: 0.9 }, uPen: { value: 0.95 }, uA: { value: 1 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `uniform vec3 uL; varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); float t = (uL.y - 0.035) / max(0.05, uL.y - w.y); vW = uL + (w.xyz - uL) * t; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
    fragmentShader: `uniform vec3 uL, uDir; uniform float uCone, uPen, uA; varying vec3 vW; void main(){ float k = smoothstep(uCone, uPen, dot(normalize(vW - uL), uDir)); gl_FragColor = vec4(0.015, 0.02, 0.06, uA * mix(0.34, 0.88, k)); }`,
  });
  const popMat = new THREE.ShaderMaterial({
    uniforms: { uR: { value: 0 }, uI: { value: 0 }, uW: { value: 0.05 } }, transparent: true, depthWrite: false, depthTest: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `uniform float uR, uI, uW; varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0; float e = 0.012; float a = smoothstep(uR - uW - e, uR - uW, r) * (1.0 - smoothstep(uR, uR + e, r)) * uI; gl_FragColor = vec4(vec3(1.0, 0.97, 0.88), a); }`,
  });
  const eyeGeoCache = new Map(), monsterPool = new Map(), live = new Map(), ghosts = [], pops = [];
  const barGeo = new THREE.PlaneGeometry(1, 1), barBack = new THREE.MeshBasicMaterial({ color: 0x0b0a14, depthTest: false, transparent: true }), barFill = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.7, 0.25), depthTest: false, transparent: true });
  function eyeGeo(look) { // round amber eyes with a small dark pupil and a catch-light: gentle, not fierce
    if (eyeGeoCache.has(look)) return eyeGeoCache.get(look);
    const L = LOOK[look], S = SHAPES[look], k = L.h / S.h, pos = [], col = [];
    const disc = (cx, cy, r, c, z) => { for (let i = 0; i < 18; i++) { const a = i / 18 * 6.283, b = (i + 1) / 18 * 6.283; pos.push(cx, cy, z, cx + Math.cos(a) * r, cy + Math.sin(a) * r, z, cx + Math.cos(b) * r, cy + Math.sin(b) * r, z); col.push(...c, ...c, ...c); } };
    for (const [fx, fy] of L.eyes) { const x = (fx - 0.5) * S.w * k, y = (1 - fy) * L.h, r = L.r * L.h;
      disc(x, y, r, [1.25, 0.66, 0.16], 0.04); disc(x, y - r * 0.12, r * 0.42, [0.05, 0.04, 0.08], 0.045); disc(x + r * 0.2, y + r * 0.22, r * 0.16, [1.6, 1.5, 1.2], 0.05); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    eyeGeoCache.set(look, g); return g;
  }
  const eyeMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  function monster(look, e) {
    const pool = monsterPool.get(look) ?? monsterPool.set(look, []).get(look);
    let m = pool.pop();
    if (!m) {
      const L = LOOK[look], rim = new THREE.MeshBasicMaterial({ color: RIM.def.clone() });
      const body = cutout(look, { height: L.h, mat: M.monster, core: rim, step: 22, rough: 3.2, fr0: 11, fr1: 2, solid: true, flat: true, cast: false, receive: false });
      const O = body.userData.O, eyes = new THREE.Mesh(eyeGeo(look), eyeMat); body.add(eyes);
      const cast = new THREE.Mesh(O.gFlat, castMat); cast.frustumCulled = false; cast.renderOrder = 2; body.add(cast);
      const g = new THREE.Group(); g.add(body);
      const bar = new THREE.Group(), bb = new THREE.Mesh(barGeo, barBack), bf = new THREE.Mesh(barGeo, barFill); bb.scale.set(1.04, 0.13, 1); bf.scale.set(1, 0.08, 1); bb.renderOrder = 10; bf.renderOrder = 11; bar.add(bb, bf); bar.position.y = L.h + 0.25; g.add(bar);
      m = { g, body, rim, fringe: body.userData.fringe, H: L.h, look, bar, bf, pool };
    }
    m.rimBase = e.type === 'color' || e.trait === 'color' ? RIM.color : e.type === 'boss' ? RIM.boss : e.type === 'fat' ? RIM.fat : RIM.def;
    m.bar.visible = false; m.g.visible = true; m.body.scale.set(1, 1, 1); m.body.rotation.z = 0; m.fringe.scale.setScalar(1); m.fringe.position.y = 0; m.rim.color.copy(m.rimBase);
    scene.add(m.g); return m;
  }
  const freeMonster = m => { scene.remove(m.g); m.pool.push(m); };

  // ---------- tools: paper stands + their light drawn on the ground ----------
  const lightMat = () => new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(1, 1, 1) }, uI: { value: 1 }, uDisc: { value: 0 }, uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `uniform vec3 uCol; uniform float uI, uDisc, uTime; varying vec2 vUv;
      void main(){ float a;
        if (uDisc > 0.5) { float r = length(vUv - 0.5) * 2.0; a = smoothstep(1.0, 0.55, r) * (0.75 + 0.25 * sin(uTime * 3.0 + r * 8.0)); }
        else { float w = 1.0 - abs(vUv.x - 0.5) * 2.0; a = smoothstep(0.0, 0.5, w) * mix(1.0, 0.35, vUv.y) * smoothstep(1.0, 0.9, vUv.y) * smoothstep(0.0, 0.04, vUv.y); }
        gl_FragColor = vec4(uCol * a * uI, a * uI); }`,
  });
  const segGeo = new THREE.PlaneGeometry(1, 1); segGeo.translate(0, 0.5, 0); segGeo.rotateX(-Math.PI / 2);   // runs along -z from the origin
  const discGeo = new THREE.PlaneGeometry(2, 2); discGeo.rotateX(-Math.PI / 2);
  const toolObjs = [], lightObjs = [];
  const PRISM_COLS = [[1.0, 0.5, 0.45], [1.0, 0.95, 0.6], [0.5, 0.75, 1.0]];
  function syncTools(sim) {
    const bornAt = new Map(toolObjs.map(o => [o.slot + o.type, o.born]));
    for (const o of toolObjs) { scene.remove(o.g); o.g.userData.glow?.dispose(); } toolObjs.length = 0; for (const o of lightObjs) { scene.remove(o); o.material.dispose(); } lightObjs.length = 0;
    sim.tools.forEach((t, i) => { if (!t) return; const [shape, h] = TOOL_SHAPE[t.type], s = sim.level.slots[i];
      const g = cutout(shape, { height: h, mat: M.prop, step: 6, rough: 1.2, cast: false, receive: false });
      const col = TOOL_COL[t.type]; g.userData.glow = glowPanes(g, q => q.pw > 12 && q.ph > 12, new THREE.Color(col[0] * 0.9, col[1] * 0.9, col[2] * 0.9), -0.02, 0.66);   // pane kept inside round frames
      g.position.set(s.x, 0, s.z + 0.05); scene.add(g); toolObjs.push({ g, slot: i, type: t.type, born: bornAt.get(i + t.type) ?? clock }); });
    let k = 0;
    for (const L of sim.lights) { const t = sim.tools[L.slot]; let col = TOOL_COL[t.type]; if (t.type === 'prism') col = PRISM_COLS[k++ % 3];
      const m = new THREE.Mesh(L.kind === 'seg' ? segGeo : discGeo, lightMat()); m.material.uniforms.uCol.value.setRGB(col[0], col[1], col[2]); m.material.uniforms.uDisc.value = L.kind === 'disc' ? 1 : 0;
      if (L.kind === 'seg') { const len = Math.hypot(L.x1 - L.x0, L.z1 - L.z0); m.position.set(L.x0, 0.04, L.z0); m.rotation.y = Math.atan2(-(L.x1 - L.x0), -(L.z1 - L.z0)); m.scale.set(L.hw * 2.6, 1, len); }
      else { m.position.set(L.x, 0.04, L.z); m.scale.set(L.r, 1, L.r); }
      m.userData = { slot: L.slot, type: t.type, L }; m.renderOrder = 3; scene.add(m); lightObjs.push(m); }
  }

  // ---------- smoke, shock ring ----------
  const smoke = []; for (let i = 0; i < 30; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: pSmoke, color: 0xd5dbf2, transparent: true, depthWrite: false, opacity: 0, rotation: i * 1.3 })); s.renderOrder = 4; s.userData.t0 = -99; scene.add(s); smoke.push(s); }
  let smokeHead = 0;
  const ringMat = new THREE.ShaderMaterial({
    uniforms: { uR: { value: 0 }, uI: { value: 0 }, uW: { value: 0.012 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `uniform float uR, uI, uW; varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0; float e = 0.0012; float a = smoothstep(uR - uW - e, uR - uW, r) * (1.0 - smoothstep(uR, uR + e, r)) * uI; gl_FragColor = vec4(vec3(1.0, 0.86, 0.6) * a, a); }`,
  });
  const RING_SIZE = 36, ring = new THREE.Mesh(new THREE.PlaneGeometry(RING_SIZE, RING_SIZE), ringMat); ring.rotation.x = -Math.PI / 2; ring.renderOrder = 3; scene.add(ring);
  // aim marker: a thin ring where the finger steers the beam
  const aimRing = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 0, depthWrite: false })); aimRing.rotation.x = -Math.PI / 2; aimRing.renderOrder = 4; scene.add(aimRing);

  // ---------- post ----------
  const BLOOM_MAX = 0.42, composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.26, 0.55, 0.92); composer.addPass(bloom);
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uDawn: { value: 0 }, uFade: { value: 1 }, uVig: { value: 0.75 }, uExp: { value: 1 }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uDawn, uFade, uVig, uExp, uTime; varying vec2 vUv; float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb * uExp; float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        vec3 sh = mix(vec3(0.80, 0.93, 1.30), vec3(1.10, 0.96, 0.98), uDawn), hi = mix(vec3(1.10, 1.00, 0.84), vec3(1.08, 1.00, 0.90), uDawn);
        c *= mix(sh, hi, smoothstep(0.0, 0.5, l)); c = mix(vec3(l), c, mix(1.18, 1.10, uDawn)); c = pow(max(c, 0.0), vec3(1.08));
        float v = smoothstep(1.02, 0.28, length((vUv - vec2(0.5, 0.52)) * vec2(0.95, 1.12))); c *= mix(1.0, v, uVig); c += (hash(vUv * 900.0 + uTime) - 0.5) * 0.012;
        gl_FragColor = vec4(max(c, 0.0) * uFade, 1.0); }`,
  });
  composer.addPass(grade); composer.addPass(new OutputPass());

  let pixelRatio = Math.min(devicePixelRatio || 1, 1.5), W = 1, H = 1;
  function resize() {
    H = innerHeight; W = Math.min(innerWidth, Math.round(H * 9 / 16)); frame.style.width = W + 'px'; frame.style.height = H + 'px';
    renderer.setPixelRatio(pixelRatio); renderer.setSize(W, H); composer.setPixelRatio(pixelRatio); composer.setSize(W, H);
    camera.aspect = W / H; camera.fov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(18)) * Math.max(1, 0.5625 / camera.aspect)) * 180 / Math.PI; camera.updateProjectionMatrix();
    dustMat.uniforms.uPx.value = eMat.uniforms.uPx.value = H * pixelRatio / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  }
  addEventListener('resize', resize); resize();
  setChapter(opt.chapter ?? 0);
  setShadowMode('dawn'); renderer.compile(scene, camera); setShadowMode('night'); renderer.compile(scene, camera);

  // ---------- state the game sets ----------
  const st = { dawn: 0, dawnTarget: 0, gather: 0, flashT: -1, lost: 0, fade: 0, freeze: 0, lastStop: -9, town: null, festival: 0, lampLvl: 0, radius: 1.2, guideSlots: false, slow: 0, fast: 0, low: false, fps: 60, fpsAcc: 0, fpsN: 0 };
  const beamAim = new THREE.Vector3(0, 0, -1), _t = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ndc = new THREE.Vector2();
  let frameNo = 0, shakeUntil = -1;

  function reset(sim) { // a new night
    for (const [, m] of live) freeMonster(m); live.clear(); for (const g of ghosts) freeMonster(g.m); ghosts.length = 0;
    scrapData.length = 0; st.dawn = 0; st.dawnTarget = 0; st.flashT = -1; st.lost = 0; st.gather = 0; st.town = null; st.festival = 0;
    for (const h of houses) { h.userData.on = true; h.userData.outT = -1; }
    for (const f of folk) f.visible = false; for (const s of extras.lamps ?? []) s.visible = false;
    if (sim) { const P = lampStats(sim.up); st.lampLvl = sim.up.lamp || 0; st.radius = P.radius; beamAim.set(sim.aim.x, 0, sim.aim.z); syncTools(sim); slotMarks.forEach((d, i) => { d.visible = i < sim.level.slots.length; }); }
    else { syncTools({ tools: [], lights: [], level: { slots: [] } }); slotMarks.forEach(d => { d.visible = false; }); }
    bakeShadows = 2;
  }
  function onEvent(e, sim) {
    if (e.type === 'kill') {
      const m = live.get(e.id); if (!m) return; live.delete(e.id);
      ghosts.push({ m, t: 0, x: e.x, z: e.z, quick: e.by === 'dawn', sparkle: e.sparkle });
      if (clock - st.lastStop > 0.7 && e.by !== 'dawn') { st.lastStop = clock; st.freeze = 0.05; }   // 0.05 s hit-stop, not on every single kill
    } else if (e.type === 'leak') { const m = live.get(e.id); if (m) { live.delete(e.id); freeMonster(m); } }
    else if (e.type === 'window') { const h = houses.filter(x => x.userData.on)[0]; if (h) { h.userData.on = false; h.userData.outT = clock; } }
    else if (e.type === 'flash') { st.flashT = 0; shakeUntil = clock + 4;
      for (let i = 0; i < 70; i++) { const r = Math.random, a = r() * 6.283, el = (r() - 0.3) * 1.4, sp = 3 + r() * 7;
        ember(LANTERN, new THREE.Vector3(Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp * 0.6, Math.abs(Math.sin(a)) * Math.cos(el) * sp + 0.5), r() * 0.1, 0.8 + r() * 1.4, 0.14 + r() * 0.2, 0.5 + r(), [2.0, 1.2 + r() * 0.5, 0.35]); } }
    else if (e.type === 'place' || e.type === 'remove' || e.type === 'rotate') { sim.step(0); syncTools(sim); }
    else if (e.type === 'won') st.dawnTarget = 1;
    else if (e.type === 'lost') st.lost = 0.001;
  }
  function pickGround(cx, cy) { const r = renderer.domElement.getBoundingClientRect(); ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); return ray.ray.intersectPlane(plane, _v) ? { x: _v.x, z: _v.z } : null; }
  function slotAt(cx, cy, slots) { const p = pickGround(cx, cy); if (!p) return -1; let best = -1, bd = 0.62; slots.forEach((s, i) => { const d = Math.hypot(s.x - p.x, s.z + 0.35 - p.z); if (d < bd) { bd = d; best = i; } }); return best; }
  function toScreen(x, y, z) { _v.set(x, y, z).project(camera); return { x: (_v.x * 0.5 + 0.5) * W, y: (-_v.y * 0.5 + 0.5) * H }; }
  function setTown(lit, festival) { reset(null); st.town = { lit: new Set(lit) }; st.festival = festival ? 0.001 : 0; }
  function celebrate() { for (let k = 0; k < 4; k++) burst(new THREE.Vector3((Math.random() - 0.5) * 5, 2.5 + Math.random() * 2, -1 + Math.random() * 3), 1.6, 12, FEST_COLS, 14); }

  // ---------- one frame ----------
  function frameUpdate(dt, sim) {
    frameNo++; const ti = performance.now() * 0.001;
    if (st.freeze > 0) { st.freeze -= dt; dt = 0; } clock += dt;
    const town = st.town, inTown = !!town;
    if (st.festival > 0) st.festival = Math.min(1, st.festival + dt / 4);
    st.dawn += clamp((inTown ? (st.festival > 0 ? 1 : 0) : st.dawnTarget) - st.dawn, -dt / 4, dt / 3.5);
    const D = sstep(0, 1, st.dawn), prog = sim ? sim.progress : 0.25;
    if (st.lost > 0) st.lost = Math.min(1, st.lost + dt / 2.5);
    if (st.flashT >= 0) { st.flashT += dt; if (st.flashT > 4) st.flashT = -1; }
    const tf = st.flashT, flashSpike = tf >= 0 ? Math.exp(-tf * 7) : 0, after = tf >= 0 ? Math.exp(-tf * 0.6) * sstep(0, 0.3, tf) : 0, gather = st.gather;
    setShadowMode(st.dawn < 0.04 ? 'night' : 'dawn');

    // --- monsters
    if (sim) {
      for (const e of sim.enemies) {
        let m = live.get(e.id); if (!m) { m = monster(lookOf(e), e); live.set(e.id, m); }
        const ph = clock * (5 + e.spd * 2.4) + e.wob, hop = e.stun > 0 ? 0 : Math.abs(Math.sin(ph));
        const sx = 1 + 0.07 * (0.5 - hop), sy = 1 - 0.09 * (0.5 - hop);
        m.g.position.set(e.x, hop * 0.1 * Math.min(1.5, m.H), e.z + 0.02); m.body.scale.set(sx * (e.hx < -0.4 && LOOK[m.look].eyes.length === 1 ? -1 : 1), sy, 1);
        m.body.rotation.z = e.stun > 0 ? Math.sin(clock * 40) * 0.05 : Math.sin(ph) * 0.06 + (e.blown > 0 ? 0.5 : 0);
        m.rim.color.copy(e.blocked > 0 ? WHITE : m.rimBase); if (e.lit > 0 && e.blocked <= 0) m.rim.color.lerp(WHITE, 0.45);
        const bar = e.max > 40 || e.type === 'boss' || e.type === 'fat'; m.bar.visible = bar;
        if (bar) { const k = clamp(e.hp / e.max), w = Math.min(2.2, m.H * 0.7); m.bar.quaternion.copy(camera.quaternion); m.bar.scale.set(w, 1, 1); m.bf.scale.x = Math.max(0.001, k * 0.98); m.bf.position.x = -(1 - k) * 0.49; }
      }
    }
    for (let i = ghosts.length - 1; i >= 0; i--) { // the death beat: squash 0.1 s, held, edge flashes white, pop + scraps
      const g = ghosts[i], m = g.m; g.t += dt * (g.quick ? 2 : 1); const tau = g.t, k = Math.sin(clamp(tau / 0.1) * Math.PI * 0.5);
      m.body.scale.set(1 + 0.42 * k, 1 - 0.46 * k, 1); m.body.rotation.z = 0; m.bar.visible = false;
      const fl = tau >= 0.2; m.rim.color.copy(fl ? WHITE : m.rimBase); m.fringe.scale.setScalar(fl ? 1.07 : 1); m.fringe.position.y = fl ? -0.035 * m.H : 0;
      if (tau >= 0.28) { const p = new THREE.Vector3(g.x, 0, g.z); burst(p, m.H, m.H > 2 ? 16 : 9, CHIP_COLS, m.H > 2 ? 40 : 16);
        pops.push({ t: 0, x: g.x, y: m.H * 0.5, z: g.z + 0.2, s: m.H * 1.7 });
        for (let s = 0; s < (g.sparkle || 0); s++) ember(_v.set(g.x, m.H * 0.6, g.z), _t.set(-2.2 + Math.random() * 0.4, 9.2, -6), s * 0.08, 0.9, 0.5, 0, [1.4, 1.6, 2.2], 1);  // sparkle flies up to the counter
        freeMonster(m); ghosts.splice(i, 1); }
    }
    while (pops.length > popMeshes.length) { const pm = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), popMat.clone()); pm.renderOrder = 8; scene.add(pm); popMeshes.push(pm); }
    for (let i = 0; i < popMeshes.length; i++) { const p = pops[i], pm = popMeshes[i]; if (!p) { pm.visible = false; continue; } p.t += dt; const a = p.t / 0.34; if (a >= 1) { pops.splice(i, 1); pm.visible = false; continue; }
      const k = 1 - Math.pow(1 - a, 3); pm.visible = true; pm.position.set(p.x, p.y, p.z); pm.quaternion.copy(camera.quaternion); pm.scale.setScalar(p.s); const u = pm.material.uniforms; u.uR.value = 0.18 + 0.8 * k; u.uI.value = 1 - sstep(0.5, 1, a); u.uW.value = 0.09 * (1 - 0.6 * k); }

    // --- beam
    const lampOn = (1 - sstep(0.15, 0.8, st.dawn)) * (1 - st.lost * 0.92);
    let hitPulse = 0;
    if (sim && sim.phase !== 'prep') { beamAim.set(sim.aim.x, 0, sim.aim.z); for (const e of sim.enemies) if (e.lit > 0.12) hitPulse = 1; }
    else { const tx = towerPos.x + Math.sin(ti * 0.42 + 0.6) * 2.5, tz = towerPos.z + 6 + Math.sin(ti * 0.27 + 2) * 2.6; beamAim.lerp(_v.set(tx, 0, tz), 1 - Math.exp(-dt * 0.9)); }
    const up = 1 + 0.09 * st.lampLvl;                                    // upgrades: visibly thicker, brighter light
    const bI = (1 - 0.55 * gather) * (tf >= 0 ? sstep(0.3, 1.2, tf) * 0.4 + 0.6 : 1) * lampOn * (0.92 + 0.08 * Math.sin(ti * 1.7)) * (1 + 0.25 * hitPulse);
    const flick = 0.94 + 0.06 * Math.sin(ti * 9.1) * Math.sin(ti * 5.3), glow = (1 + flashSpike * 2.2 + after * 0.9) * lampOn * flick;
    const BEAM = 390 * up, GLOW = 38;
    beam.position.copy(LANTERN); beam.color.setRGB(SKIN.r, SKIN.g * 0.98, SKIN.b * 0.95);
    beam.intensity = Math.max(BEAM * bI, GLOW * glow, 0.001); SPOT_FLOOR.value = clamp(GLOW * glow / beam.intensity);
    _t.copy(beamAim).sub(LANTERN); const dist = _t.length(), len = dist * 1.45;
    beam.angle = clamp(Math.atan(st.radius * 1.25 / dist) * (1 - 0.3 * gather), 0.06, 0.6); beam.target.position.copy(beamAim);
    _t.normalize(); _r.crossVectors(_t, _u.set(0, 1, 0)).normalize(); _u.crossVectors(_r, _t).normalize();
    const rad = Math.tan(beam.angle) * len; cone.position.copy(LANTERN); cone.lookAt(beamAim); cone.scale.set(rad, rad, len);
    coneMat.uniforms.uI.value = (0.8 + 0.1 * st.lampLvl) * bI; coneMat.uniforms.uTime.value = ti; coneMat.uniforms.uCol.value.setRGB(SKIN.r, SKIN.g * 0.92, SKIN.b * 0.75);
    const du = dustMat.uniforms; du.uO.value.copy(LANTERN); du.uDir.value.copy(_t); du.uRight.value.copy(_r); du.uUp.value.copy(_u); du.uLen.value = len; du.uRad.value = rad; du.uI.value = 2.4 * bI; du.uTime.value = ti;
    const cu = castMat.uniforms; cu.uDir.value.copy(_t); cu.uCone.value = Math.cos(beam.angle); cu.uPen.value = Math.cos(beam.angle * (1 - beam.penumbra)); cu.uA.value = clamp(bI + 0.4) * (1 - D);
    const hs = 0.55 * Math.sqrt(lampOn) + flashSpike * 2.6 + after * 0.25;
    halo.position.copy(LANTERN); halo.position.z += 0.1; flare.position.copy(halo.position); halo.material.color.copy(SKIN);
    halo.scale.setScalar(hs); halo.material.opacity = clamp(0.5 * lampOn + flashSpike); flare.scale.setScalar(hs * 1.5 + flashSpike * 5); flare.material.opacity = clamp(0.12 * lampOn + flashSpike * 0.9);
    if (towerGlow) towerGlow.color.copy(towerGlow.userData.base).multiplyScalar(clamp(lampOn * flick + flashSpike, 0, 2));
    aimRing.position.set(beamAim.x, 0.05, beamAim.z); aimRing.scale.setScalar(st.radius); aimRing.material.opacity = sim && sim.manual && sim.phase === 'night' ? 0.5 : 0;

    // --- tools: stands pop up, light breathes
    for (const o of toolObjs) { const a = clamp((clock - o.born) / 0.25), t = sim?.tools[o.slot]; o.g.scale.setScalar(0.6 + 0.4 * (1 - Math.pow(1 - a, 3))); o.g.rotation.z = Math.sin(ti * 1.3 + o.slot) * 0.02; if (o.g.userData.glow) o.g.userData.glow.color.copy(o.g.userData.glow.userData.base).multiplyScalar(t && t.ready <= 0 ? 1 : 0.3); }
    for (const m of lightObjs) { const t = sim?.tools[m.userData.slot]; m.material.uniforms.uI.value = (t && t.ready <= 0 ? 0.55 : 0.12) * (1 - D) * (0.9 + 0.1 * Math.sin(ti * 2.3 + m.userData.slot)); m.material.uniforms.uTime.value = ti; }
    if (sim && frameNo % 5 === 0) for (const m of lightObjs) if (m.userData.type === 'jar') { const L = m.userData.L, a = Math.random() * 6.283, r = Math.random() * L.r;   // fireflies
      ember(_v.set(L.x + Math.cos(a) * r, 0.2 + Math.random() * 0.8, L.z + Math.sin(a) * r), _t.set((Math.random() - 0.5) * 0.6, 0.3, (Math.random() - 0.5) * 0.6), 0, 1.6, 0.16, 0.2, [1.2, 1.9, 0.5]); }
    slotMarks.forEach((d, i) => { if (!d.visible) return; const empty = sim && !sim.tools[i]; d.material = M.slot; d.scale.setScalar(empty && st.guideSlots ? 1 + 0.12 * Math.sin(ti * 5) : 1); });

    // --- windows (village health) and the village view
    houses.forEach((h, i) => {
      let w = 1 - sstep(0.3, 0.9, st.dawn);
      if (inTown) w *= town.lit.has('h' + i) ? 1 : 0;
      else if (!h.userData.on) { const tb = clock - h.userData.outT; w *= tb < 1.5 ? (Math.floor(tb / 0.25) % 2 === 0 ? 0.06 : 1) : 0;
        if (tb >= 1.5 && tb < 4.5 && frameNo % 12 === 0) { const s = smoke[smokeHead++ % smoke.length]; s.userData.t0 = clock; s.userData.o = h.userData.smokeAt; } }
      w *= 0.95 + 0.05 * Math.sin(ti * 6 + i * 3); h.userData.glow.color.copy(h.userData.glow.userData.base).multiplyScalar(w * (1 - st.lost * 0.9));
    });
    for (const s of smoke) { const age = clock - s.userData.t0, life = 3.4; if (age > 0 && age < life && s.userData.o) { const a = age / life, o = s.userData.o;
      s.position.set(o.x + Math.sin(age * 1.7 + s.id) * 0.05 * age + 0.06 * age, o.y + 0.62 * age, o.z); s.scale.setScalar(0.16 + 0.27 * age); s.material.opacity = 0.8 * sstep(0, 0.12, a) * (1 - a) * (1 - a); } else s.material.opacity = 0; }
    for (const s of extras.lamps ?? []) { s.visible = inTown && town.lit.has(s.userData.vid); s.material.opacity = (0.75 + 0.1 * Math.sin(ti * 5 + s.position.x)) * (1 - 0.7 * D); }
    if (inTown) folk.forEach((f, k) => { f.visible = town.lit.has(f.userData.vid);
      const hop = st.festival > 0 ? Math.abs(Math.sin(ti * 4 + f.userData.ph)) * 0.22 : Math.max(0, Math.sin(ti * 1.2 + f.userData.ph)) * 0.03; f.position.y = hop; f.rotation.z = st.festival > 0 ? Math.sin(ti * 4 + f.userData.ph) * 0.12 : 0; });
    if (st.festival > 0 && frameNo % 50 === 0) celebrate();

    // --- shock ring + paper shake
    const R = Math.max(0, tf) * WAVE_V; ring.position.set(towerPos.x, 0.05, towerPos.z + 0.3);
    ringMat.uniforms.uR.value = R / (RING_SIZE / 2); ringMat.uniforms.uI.value = tf >= 0 ? 0.95 * (1 - sstep(0.9, 1.4, tf)) : 0; ringMat.uniforms.uW.value = 0.009 + 0.004 * clamp(tf);
    const shaking = clock < shakeUntil;
    for (const f of flats) { const d = Math.hypot(f.x - towerPos.x, f.z - towerPos.z), tw = tf - d / WAVE_V; let a = Math.sin(ti * 0.9 + f.seed) * 0.005;
      if (tf >= 0 && tw > 0 && tw < 3.5) a += f.amp * (0.26 / (1 + d * 0.06)) * Math.exp(-tw * 1.9) * Math.sin(tw * 15); f.g.rotation.x = a; f.g.rotation.z = a * 0.35 * Math.sin(f.seed * 3); }
    cloudA.position.x = -2.9 + Math.sin(ti * 0.05) * 0.5; cloudB.position.x = 2.6 + Math.cos(ti * 0.04) * 0.5;

    // --- night -> dawn; the moon crosses the sky as the night passes
    for (const m of dawnMats) m.color.lerpColors(m.userData.night, m.userData.dawn, D);
    skyMat.uniforms.uDawn.value = D; skyMat.uniforms.uGlow.value = after * (1 - D);
    hemi.color.setRGB(lerp(0.045, 1.0, D), lerp(0.07, 0.62, D), lerp(0.33, 0.52, D)); hemi.groundColor.setRGB(lerp(0.003, 0.2, D), lerp(0.004, 0.11, D), lerp(0.012, 0.16, D));
    hemi.intensity = lerp(1.15, 0.8, D); fill.intensity = lerp(0.75, 0.25, D);
    const el = lerp(0.62, 0.115, sstep(0, 1, st.dawn)), az = 0.62;
    sun.position.set(-Math.sin(az) * Math.cos(el) * 30, Math.sin(el) * 30, -Math.cos(az) * Math.cos(el) * 30 - 2); sun.target.position.set(0, 0, -1.5);
    sun.intensity = 2.6 * D * clamp(0.45 / Math.sin(el), 1, 4.2); sun.color.setRGB(1, lerp(0.55, 0.72, D), lerp(0.36, 0.5, D));
    moon.position.set(lerp(-2.6, 2.6, prog), 4.55 - 0.9 * Math.pow(prog * 2 - 1, 2) - 0.6 * prog - D * 1.4, -16.4); moonMat.color.setRGB(1.0 - 0.5 * D, 0.96 - 0.5 * D, 0.8 - 0.35 * D);
    starMat.opacity = (1 - D) * (0.7 + 0.2 * Math.sin(ti * 2));
    if (shadowMode === 'night') { if (bakeShadows > 0 || (shaking && frameNo % 3 === 0)) { beam.shadow.needsUpdate = true; bakeShadows--; } if (!shaking && st.wasShaking) beam.shadow.needsUpdate = true; }
    else if ((st.dawn < 0.999 && frameNo % 3 === 0) || bakeShadows > 0) { sun.shadow.needsUpdate = true; bakeShadows--; }
    st.wasShaking = shaking;
    st.fade = Math.min(1, st.fade + dt / 0.8);
    grade.uniforms.uDawn.value = D; grade.uniforms.uFade.value = st.fade; grade.uniforms.uTime.value = ti % 10;
    grade.uniforms.uExp.value = lerp(1, 0.5, gather) * (1 - 0.45 * st.lost);       // the hush darkens to 50 %, no further
    bloom.strength = Math.min(BLOOM_MAX, 0.24 + flashSpike * 0.3);
    eMat.uniforms.uTime.value = clock; updateScraps();
    composer.render();
    // keep the frame rate: under 45 fps for a while -> drop the resolution a step
    if (!document.hidden && dt > 0) { st.fpsAcc += dt; st.fpsN++; if (st.fpsAcc > 0.5) { st.fps = st.fpsN / st.fpsAcc; st.fpsAcc = 0; st.fpsN = 0; }
      if (dt > 1 / 45) { st.slow += dt; st.fast = 0; } else { st.fast += dt; if (st.fast > 1) st.slow = 0; }
      if (st.slow > 1.2) { st.slow = 0; if (pixelRatio > 0.75) { pixelRatio = Math.max(0.75, pixelRatio - 0.2); resize(); } else if (st.fps < 22) st.low = true; } }
  }
  const popMeshes = [];
  return { kind: '3d', setChapter, reset, onEvent, frame: frameUpdate, pickGround, slotAt, toScreen, setTown, celebrate, resize, st,
    setSkin: c => SKIN.setRGB(c[0], c[1], c[2]), setGather: k => { st.gather = k; }, get world() { return world; }, get pixelRatio() { return pixelRatio; },
    info: () => ({ tris: renderer.info.render.triangles, calls: renderer.info.render.calls, pixelRatio, fps: st.fps }), fadeIn: () => { st.fade = 0; },
    dispose: () => { removeEventListener('resize', resize); renderer.dispose(); renderer.domElement.remove(); } };
  } catch (err) { renderer.dispose(); renderer.domElement.remove(); throw err; }
}
