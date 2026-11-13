// 등불지기 (Lamplighter) — look-dev scene. No game logic, no audio: only what is seen.
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const Q = new URLSearchParams(location.search);
const SEEK = Q.has('t') ? parseFloat(Q.get('t')) : null; // ?t=19.4 freezes the loop there (for review)
const LOOP = 37;

// ---------- small helpers ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function rng(seed) { let s = seed >>> 0; return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- renderer ----------
const frame = document.getElementById('frame');
const cap = document.getElementById('cap');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
frame.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060f);
const camera = new THREE.PerspectiveCamera(36, 9 / 16, 0.5, 80);
camera.position.set(0, 10.5, 15);
camera.lookAt(0, 2.2, -1.3);

// ---------- assets ----------
const TL = new THREE.TextureLoader();
const tex = (url, srgb = true, repeat = 1) => new Promise(res => TL.load(url, t => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4; res(t);
}));
const [SHAPES, paperW, paperWN, paperCreaseN, paperBeige, pCircle, pSpark, pFlare, pLight, pStar, pSmoke, pMagic] = await Promise.all([
  fetch('./assets/shapes.json').then(r => r.json()),
  tex('./assets/paper/Paper001_Color.jpg', true, 0.45),
  tex('./assets/paper/Paper001_NormalGL.jpg', false, 0.45),
  tex('./assets/paper/Paper003_NormalGL.jpg', false, 0.2),
  tex('./assets/paper/Paper006_Color.jpg', true, 0.5),
  tex('./assets/particles/circle_05.png'), tex('./assets/particles/spark_05.png'),
  tex('./assets/particles/flare_01.png'), tex('./assets/particles/light_01.png'),
  tex('./assets/particles/star_07.png'), tex('./assets/particles/smoke_04_alpha.png'),
  tex('./assets/particles/magic_05.png'),
]);
document.getElementById('load').remove();

// ---------- paper cut-outs ----------
const svgLoader = new SVGLoader();
const dawnMats = []; // materials whose colour shifts at dawn
function paperMat(night, dawn, map = paperW) {
  const m = new THREE.MeshStandardMaterial({
    color: night, map, normalMap: paperWN, normalScale: new THREE.Vector2(0.7, 0.7),
    roughness: 1, metalness: 0, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide,
  });
  m.userData.night = new THREE.Color(night); m.userData.dawn = new THREE.Color(dawn ?? night);
  dawnMats.push(m);
  return m;
}
const CORE = paperMat(0x8f95b8, 0xe9cdb6); // the pale torn fibre showing at every cut edge

// Builds a standing paper piece from a potrace outline. The outline is resampled and
// jittered so no edge is clean, and a second, slightly larger pale layer sits just behind
// it as the torn fibre fringe.
function cutout(name, o) {
  const S = SHAPES[name];
  const k = o.height / S.h, sy = o.squash ?? 1;
  const step = o.step ?? 5, rough = o.rough ?? 0.9, fr0 = o.fr0 ?? 0.8, fr1 = o.fr1 ?? 2.2;
  const rnd = rng(o.seed ?? name.length * 977 + S.w);
  const data = svgLoader.parse(`<svg xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="${S.d}"/></svg>`);
  const shapes = data.paths.flatMap(p => SVGLoader.createShapes(p));
  const W = (x, y) => new THREE.Vector2((x - S.w / 2) * k, (S.h - y) * k * sy);
  const mainShapes = [], fringeShapes = [], holes = [];

  const contour = (pts, isHole) => {
    let P = pts.map(p => [p.x, p.y]);
    if (P.length > 1 && Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < 0.01) P.pop();
    const R = [];
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      if (R.length && Math.hypot(a[0] - R[R.length - 1][0], a[1] - R[R.length - 1][1]) < step * 0.3) continue;
      R.push(a);
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.floor(d / step);
      for (let j = 1; j < n; j++) R.push([a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n]);
    }
    let area = 0, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < R.length; i++) {
      const a = R[i], b = R[(i + 1) % R.length]; area += a[0] * b[1] - b[0] * a[1];
      x0 = Math.min(x0, a[0]); x1 = Math.max(x1, a[0]); y0 = Math.min(y0, a[1]); y1 = Math.max(y1, a[1]);
    }
    area /= 2;
    const sign = (area > 0 ? 1 : -1) * (isHole ? -1 : 1); // points away from the paper
    const tiny = Math.abs(area) < 260;
    const main = [], fringe = [];
    for (let i = 0; i < R.length; i++) {
      const a = R[(i - 1 + R.length) % R.length], b = R[(i + 1) % R.length], p = R[i];
      let nx = (b[1] - a[1]), ny = -(b[0] - a[0]); const nl = Math.hypot(nx, ny) || 1; nx = nx / nl * sign; ny = ny / nl * sign;
      const j = (rnd() - 0.5) * 2 * rough + (rnd() < 0.04 ? -rough * 2.2 * rnd() : 0); // the odd deeper nick
      main.push(W(p[0] + nx * j, p[1] + ny * j));
      const f = tiny ? 0 : fr0 + rnd() * rnd() * fr1 + (rnd() < 0.06 ? fr1 * 0.9 : 0);
      fringe.push(W(p[0] + nx * f, p[1] + ny * f));
    }
    return { main, fringe, area: Math.abs(area), box: [x0, y0, x1, y1], n: R.length };
  };

  for (const sh of shapes) {
    const outer = contour(sh.getPoints(3), false);
    if (outer.n < 3) continue;
    const ms = new THREE.Shape(outer.main), fs = new THREE.Shape(outer.fringe);
    for (const h of sh.holes) {
      const c = contour(h.getPoints(3), true);
      if (c.n < 3 || c.area < 8) continue;
      ms.holes.push(new THREE.Path(c.main)); fs.holes.push(new THREE.Path(c.fringe));
      const a = W(c.box[0], c.box[3]), b = W(c.box[2], c.box[1]);
      holes.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, w: b.x - a.x, h: b.y - a.y, pw: c.box[2] - c.box[0], ph: c.box[3] - c.box[1], py: (c.box[1] + c.box[3]) / 2 / S.h });
    }
    mainShapes.push(ms); fringeShapes.push(fs);
  }
  const g = new THREE.Group();
  const depth = o.depth ?? 0.03;
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(mainShapes, { depth, bevelEnabled: false, curveSegments: 1 }), [o.mat, CORE]);
  const fringe = new THREE.Mesh(new THREE.ShapeGeometry(fringeShapes, 1), o.core ?? CORE);
  fringe.position.z = -0.006;
  for (const m of [body, fringe]) { m.castShadow = o.cast ?? true; m.receiveShadow = true; g.add(m); }
  g.userData = { holes, w: S.w * k, h: o.height * sy, body, fringe, outline: mainShapes };
  return g;
}

// ---------- palette ----------
const M = {
  house: paperMat(0x2b2f55, 0x3a2f4a), house2: paperMat(0x33294f, 0x44304a),
  tower: paperMat(0x2a2440, 0x3b2a44), tree: paperMat(0x1c2c44, 0x2e3350),
  prop: paperMat(0x24284a, 0x3a3048), monster: paperMat(0x0d0c18, 0x15101c),
  hill1: paperMat(0x232b58, 0x5f4a70), hill2: paperMat(0x2c376c, 0x8a6585),
  hill3: paperMat(0x36447f, 0xb07f8e), ridge: paperMat(0x41528f, 0xd29a92),
  front: paperMat(0x11152c, 0x2a2238), cloud: paperMat(0x55659f, 0xffd9c4),
  ground: paperMat(0x3c4879, 0x9a7f95), path: paperMat(0x8d8a9e, 0xf3d6b4),
};
M.ground.normalMap = paperCreaseN; M.ground.normalScale.set(1.1, 1.1);

// ---------- the stage ----------
const flats = []; // every standing sheet, so the shock wave can shake them
const stand = (g, x, z, opt = {}) => {
  g.position.set(x, opt.y ?? 0, z); scene.add(g);
  flats.push({ g, amp: opt.amp ?? 1, seed: flats.length * 1.7, x, z });
  return g;
};

const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), M.ground);
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
{ // paper texture on the ground uses plane uv 0..1 -> tile it
  const uv = ground.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 60, uv.getY(i) * 60);
}

// winding path, laid flat
const PATH_L = 13.4, PS = SHAPES.path, pk = PATH_L / PS.h;
const pathG = cutout('path', { height: PATH_L, mat: M.path, step: 7, rough: 1.4, fr0: 1.5, fr1: 4, depth: 0.012 });
pathG.rotation.x = -Math.PI / 2; pathG.position.set(0, 0.012, PATH_L / 2 + 0.2);
pathG.children.forEach(m => { m.castShadow = false; });
scene.add(pathG);
const PZ0 = PATH_L / 2 + 0.2; // world z of the image's bottom edge
// centre line -> world polyline, u = 0 at the near end, 1 at the tower
const pathPts = PS.centre.map(([x, y]) => new THREE.Vector3((x - PS.w / 2) * pk, 0, PZ0 - (PS.h - y) * pk)).reverse();
const pathLen = [0]; for (let i = 1; i < pathPts.length; i++) pathLen.push(pathLen[i - 1] + pathPts[i].distanceTo(pathPts[i - 1]));
const pathTotal = pathLen[pathLen.length - 1];
function pathAt(u, out = new THREE.Vector3()) {
  const s = clamp(u) * pathTotal; let i = 1; while (i < pathLen.length - 1 && pathLen[i] < s) i++;
  const t = (s - pathLen[i - 1]) / Math.max(1e-6, pathLen[i] - pathLen[i - 1]);
  return out.lerpVectors(pathPts[i - 1], pathPts[i], clamp(t));
}

// lantern tower at the far end of the path
const towerPos = pathAt(1).clone(); towerPos.z -= 0.75;
const tower = stand(cutout('tower', { height: 4.7, mat: M.tower, step: 4 }), towerPos.x, towerPos.z, { amp: 0.5 });
const chamber = tower.userData.holes.filter(h => h.py < 0.3).sort((a, b) => b.w * b.h - a.w * a.h)[0] ?? { x: 0, y: 3.6, w: 0.3, h: 0.4 };
const LANTERN = new THREE.Vector3(towerPos.x + chamber.x, chamber.y, towerPos.z + 0.3);

// emissive panes behind the cut-out windows
function glowPanes(g, test, color, z = -0.02) {
  const mat = new THREE.MeshBasicMaterial({ color });
  mat.userData.base = mat.color.clone();
  for (const h of g.userData.holes) {
    if (!test(h)) continue;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(h.w + 0.03, h.h + 0.03), mat);
    p.position.set(h.x, h.y, z); g.add(p);
  }
  return mat;
}
const AMBER = new THREE.Color(2.1, 1.0, 0.26);
const towerGlow = glowPanes(tower, h => h.pw > 24 && h.ph > 24, AMBER);

// village
const houses = [
  ['house_a', -2.35, -3.3, 2.0, M.house, 0.42], ['house_d', 2.45, -4.3, 3.1, M.house2, 0.2],
  ['house_c', 2.3, 0.1, 1.5, M.house, 0.42], ['house_b', -2.4, 0.5, 1.7, M.house2, 0.42],
  ['house_e', 1.6, 2.7, 1.35, M.house, 0.42],
].map(([n, x, z, h, mat, roof]) => {
  const g = stand(cutout(n, { height: h, mat }), x, z);
  g.userData.glow = glowPanes(g, q => q.pw > 22 && q.ph > 22 && q.py > roof, AMBER);
  return g;
});
const BLINK = houses[3]; // the window that goes out
stand(cutout('tree_a', { height: 2.9, mat: M.tree, step: 6 }), -3.5, -5.4);
stand(cutout('tree_b', { height: 2.5, mat: M.tree, step: 6 }), 3.7, -1.9);
stand(cutout('tree_c', { height: 2.0, mat: M.tree, step: 6 }), -3.6, -1.3);
stand(cutout('tree_d', { height: 2.1, mat: M.tree, step: 6 }), 4.0, -6.2);
stand(cutout('bush', { height: 1.5, mat: M.tree, step: 6 }), -3.1, 2.6);
stand(cutout('well', { height: 1.05, mat: M.prop, step: 4 }), -1.75, -1.9);
stand(cutout('fence', { height: 0.62, mat: M.prop }), 3.0, 3.3);
stand(cutout('fence', { height: 0.6, mat: M.prop, seed: 5 }), -1.7, -6.2);

// theatre flats at the back and the front
const back = (n, z, h, mat, y = 0, x = 0, sq = 1) => {
  const g = stand(cutout(n, { height: h, mat, squash: sq, step: 10, cast: false, fr0: 2, fr1: 5 }), x, z, { y, amp: 0.35 });
  return g;
};
back('hill_grass', -9.5, 1.9, M.hill1, 0, 0.5, 0.55);
back('hill_pines', -11.0, 2.1, M.hill2, 0.45, -1.0, 0.68);
back('hill_far', -12.5, 1.6, M.hill3, 1.15, 1.5, 0.85);
back('ridge', -14.0, 3.0, M.ridge, 1.3, -0.5, 0.72);
const cloudA = back('cloud_a', -15.2, 0.75, M.cloud, 4.05, -2.9);
const cloudB = back('cloud_b', -15.4, 0.8, M.cloud, 4.6, 2.6);
const front = stand(cutout('hill_low', { height: 1.5, mat: M.front, step: 10, cast: false, fr0: 2, fr1: 5 }), 0.4, 5.3, { amp: 0.3 });
front.scale.set(0.62, 1, 1);

// sky sheet + moon + pin-prick stars
const skyMat = new THREE.ShaderMaterial({
  uniforms: { map: { value: paperW }, uDawn: { value: 0 }, uGlow: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
  fragmentShader: `uniform sampler2D map; uniform float uDawn, uGlow; varying vec2 vUv;
    void main(){
      float h = vUv.y;
      vec3 night = mix(vec3(0.060,0.085,0.26), vec3(0.012,0.016,0.075), smoothstep(0.25,0.95,h));
      vec3 dawn  = mix(vec3(0.95,0.47,0.29), vec3(0.30,0.26,0.50), smoothstep(0.28,0.62,h));
      dawn = mix(dawn, vec3(1.15,0.70,0.38), smoothstep(0.36,0.22,h));
      vec3 c = mix(night, dawn, uDawn);
      float p = texture2D(map, vUv * vec2(9.0, 7.0)).g;
      c *= 0.55 + 0.6 * p;
      c += vec3(1.0,0.55,0.2) * uGlow * smoothstep(0.75,0.2,h) * 0.12;
      gl_FragColor = vec4(c, 1.0);
    }`,
});
const sky = new THREE.Mesh(new THREE.PlaneGeometry(34, 24), skyMat); sky.position.set(0, 9, -17); scene.add(sky);
const moonMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.42, 1.15), map: paperW });
const moon = cutout('moon', { height: 0.95, mat: moonMat, core: moonMat, cast: false });
moon.children.forEach(m => { m.receiveShadow = false; });
moon.position.set(-1.9, 4.25, -16.4); moon.rotation.z = -0.35; scene.add(moon);
const starGeo = new THREE.BufferGeometry();
{ const r = rng(11), p = []; for (let i = 0; i < 46; i++) p.push((r() - 0.5) * 12, 3.5 + r() * 2.6, -16.7); starGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); }
const starMat = new THREE.PointsMaterial({ map: pStar, size: 0.26, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xcfd8ff });
scene.add(new THREE.Points(starGeo, starMat));

// ---------- light ----------
const hemi = new THREE.HemisphereLight(0x3d4c9c, 0x0a0c1c, 1.0); scene.add(hemi);
const fill = new THREE.DirectionalLight(0x5c70d8, 0.55); fill.position.set(4, 7, 12); scene.add(fill);
const lantern = new THREE.PointLight(0xffa348, 0, 0, 1.85);
lantern.position.copy(LANTERN); lantern.castShadow = true;
lantern.shadow.mapSize.set(1024, 1024); lantern.shadow.camera.near = 0.15; lantern.shadow.camera.far = 40;
lantern.shadow.bias = -0.004; lantern.shadow.normalBias = 0.04; lantern.shadow.radius = 2.5;
scene.add(lantern);
const beam = new THREE.SpotLight(0xffc27a, 0, 40, 0.19, 0.75, 1.1);
beam.position.copy(LANTERN); beam.castShadow = true;
beam.shadow.mapSize.set(1024, 1024); beam.shadow.camera.near = 0.3; beam.shadow.camera.far = 30;
beam.shadow.bias = -0.002; beam.shadow.normalBias = 0.03; beam.shadow.radius = 3;
scene.add(beam, beam.target);
const sun = new THREE.DirectionalLight(0xffb98a, 0);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 70 });
sun.shadow.bias = -0.0015; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
scene.add(sun, sun.target);

// lantern halo (bloom catches it) and flare
const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: pLight, color: 0xffb060, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
halo.position.copy(LANTERN).add(new THREE.Vector3(0, 0, 0.1)); scene.add(halo);
const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: pFlare, color: 0xffd9a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
flare.position.copy(halo.position); scene.add(flare);

// soft light cone
const coneMat = new THREE.ShaderMaterial({
  uniforms: { uI: { value: 0 }, uTime: { value: 0 } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: `varying vec3 vN; varying vec3 vV; varying vec2 vUv;
    void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform float uI, uTime; varying vec3 vN; varying vec3 vV; varying vec2 vUv;
    void main(){
      float soft = pow(abs(dot(normalize(vN), normalize(vV))), 2.2);
      float l = 1.0 - vUv.y;                         // 0 at the lantern, 1 at the far end
      float along = mix(1.0, 0.10, smoothstep(0.0, 1.0, l)) * smoothstep(1.0, 0.82, l);
      float streak = 0.82 + 0.18 * sin(vUv.x * 60.0 + sin(uTime * 0.4 + vUv.x * 9.0) * 2.0);
      float a = soft * along * streak * uI;
      gl_FragColor = vec4(vec3(1.0, 0.62, 0.26) * a, a);
    }`,
});
const coneGeo = new THREE.CylinderGeometry(0.05, 1, 1, 48, 1, true); coneGeo.translate(0, -0.5, 0); coneGeo.rotateX(-Math.PI / 2);
const cone = new THREE.Mesh(coneGeo, coneMat); cone.frustumCulled = false; cone.renderOrder = 5; scene.add(cone);

// dust drifting inside the cone
const DUST = 260;
const dustGeo = new THREE.BufferGeometry();
{ const r = rng(3), p = [], s = []; for (let i = 0; i < DUST; i++) { p.push(r() * 6.283, Math.sqrt(r()), r()); s.push(0.5 + r(), r(), 0.4 + r() * 1.2); }
  dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); dustGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(s, 3)); }
const dustMat = new THREE.ShaderMaterial({
  uniforms: { map: { value: pCircle }, uTime: { value: 0 }, uI: { value: 0 }, uO: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3(0, 0, 1) },
    uRight: { value: new THREE.Vector3(1, 0, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) }, uLen: { value: 1 }, uRad: { value: 1 }, uPx: { value: 1 } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `uniform float uTime, uLen, uRad, uPx, uI; uniform vec3 uO, uDir, uRight, uUp; attribute vec3 aSeed; varying float vA;
    void main(){
      float l = fract(position.z + uTime * 0.012 * aSeed.z);
      float ang = position.x + uTime * 0.12 * (aSeed.y - 0.5);
      float rf = position.y;
      float rad = mix(0.05, uRad, l) * rf;
      vec3 w = uO + uDir * (l * uLen) + (uRight * cos(ang) + uUp * sin(ang)) * rad;
      w.y += sin(uTime * 0.7 + aSeed.y * 40.0) * 0.04;
      vec4 mv = viewMatrix * vec4(w, 1.0);
      gl_Position = projectionMatrix * mv;
      float tw = 0.55 + 0.45 * sin(uTime * (1.0 + aSeed.x * 2.0) + aSeed.y * 30.0);
      vA = (1.0 - rf * rf) * smoothstep(0.0, 0.08, l) * smoothstep(1.0, 0.7, l) * tw * uI;
      gl_PointSize = uPx * (0.045 + 0.05 * aSeed.x) / -mv.z;
    }`,
  fragmentShader: `uniform sampler2D map; varying float vA;
    void main(){ float t = texture2D(map, gl_PointCoord).r; gl_FragColor = vec4(vec3(1.0,0.78,0.45) * t * vA, t * vA); }`,
});
const dust = new THREE.Points(dustGeo, dustMat); dust.frustumCulled = false; dust.renderOrder = 6; scene.add(dust);

// ---------- embers / sparks (one pooled point cloud) ----------
const EMAX = 700;
const eGeo = new THREE.BufferGeometry();
const eStart = new Float32Array(EMAX * 3), eVel = new Float32Array(EMAX * 3), eData = new Float32Array(EMAX * 4), eCol = new Float32Array(EMAX * 4);
eGeo.setAttribute('position', new THREE.BufferAttribute(eStart, 3)); eGeo.setAttribute('aVel', new THREE.BufferAttribute(eVel, 3));
eGeo.setAttribute('aData', new THREE.BufferAttribute(eData, 4)); eGeo.setAttribute('aCol', new THREE.BufferAttribute(eCol, 4));
const eMat = new THREE.ShaderMaterial({
  uniforms: { map: { value: pSpark }, map2: { value: pCircle }, uTime: { value: 0 }, uPx: { value: 1 } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `uniform float uTime, uPx; attribute vec3 aVel; attribute vec4 aData; attribute vec4 aCol; varying vec4 vC; varying float vRot;
    void main(){
      float age = uTime - aData.x, life = aData.y, a = age / life;
      vec3 p;
      if (aCol.a > 0.5) { p = mix(position, aVel, pow(clamp(a,0.,1.), 2.4)); p += vec3(sin(a*9.+aData.x*7.), cos(a*7.+aData.x*3.), 0.) * 0.25 * (1.-a) * a; }
      else { float d = 1.6; p = position + aVel * (1.0 - exp(-d * age)) / d; p.y += 0.5 * aData.w * age * age; p.x += sin(age * 5.0 + aData.x * 13.0) * 0.07 * age; }
      vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
      float vis = step(0.0, age) * step(age, life);
      float fl = 0.7 + 0.3 * sin(uTime * 23.0 + aData.x * 91.0);
      vC = vec4(aCol.rgb, vis * smoothstep(0.0, 0.08, a) * (1.0 - a * a) * fl);
      vRot = aData.x * 17.0 + age * 2.0;
      gl_PointSize = uPx * aData.z * (1.0 - 0.5 * a) / -mv.z * vis;
    }`,
  fragmentShader: `uniform sampler2D map, map2; varying vec4 vC; varying float vRot;
    void main(){ vec2 q = gl_PointCoord - 0.5; float c = cos(vRot), s = sin(vRot); q = mat2(c,-s,s,c) * q + 0.5;
      float t = max(texture2D(map, q).r * 0.9, texture2D(map2, gl_PointCoord).r * 0.7); gl_FragColor = vec4(vC.rgb * t * vC.a, t * vC.a); }`,
});
const embers = new THREE.Points(eGeo, eMat); embers.frustumCulled = false; embers.renderOrder = 7; scene.add(embers);
let eHead = 0;
function ember(p, v, birth, life, size, buoy, col, converge = 0) {
  const i = eHead; eHead = (eHead + 1) % EMAX;
  eStart.set([p.x, p.y, p.z], i * 3); eVel.set([v.x, v.y, v.z], i * 3); eData.set([birth, life, size, buoy], i * 4); eCol.set([col[0], col[1], col[2], converge], i * 4);
  for (const k of ['position', 'aVel', 'aData', 'aCol']) eGeo.attributes[k].needsUpdate = true;
}
function clearEmbers() { eData.fill(0); for (let i = 0; i < EMAX; i++) eData[i * 4] = -999; eGeo.attributes.aData.needsUpdate = true; }

// ---------- paper scraps (lit, shadow-casting instanced chips) ----------
const SMAX = 120;
const chip = new THREE.Shape([[-0.5, -0.32], [0.36, -0.5], [0.5, 0.1], [0.08, 0.5], [-0.42, 0.28]].map(p => new THREE.Vector2(p[0], p[1])));
const scrapMat = new THREE.MeshStandardMaterial({ map: paperW, normalMap: paperWN, roughness: 1, side: THREE.DoubleSide });
const scraps = new THREE.InstancedMesh(new THREE.ShapeGeometry(chip), scrapMat, SMAX);
scraps.castShadow = true; scraps.frustumCulled = false; scene.add(scraps);
const scrapData = []; let sHead = 0;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
function burst(pos, T0, seed) {
  const r = rng(seed);
  for (let i = 0; i < 34; i++) {
    const a = r() * 6.283, sp = 1.2 + r() * 2.6;
    scrapData[sHead] = { o: pos.clone().add(new THREE.Vector3((r() - 0.5) * 0.4, 0.15 + r() * 0.5, (r() - 0.5) * 0.1)),
      v: new THREE.Vector3(Math.cos(a) * sp, Math.sin(a) * sp * 0.8 + 0.6, (r() - 0.5) * 1.6), birth: T0, life: 1.5 + r() * 1.3,
      size: 0.07 + r() * 0.12, rot: [r() * 6, r() * 6, r() * 6], w: [(r() - 0.5) * 9, (r() - 0.5) * 9, (r() - 0.5) * 9], buoy: 1.0 + r() * 1.6, ph: r() * 6 };
    scraps.setColorAt(sHead, r() < 0.3 ? _c.setRGB(0.75, 0.74, 0.86) : _c.setRGB(0.05 + r() * 0.05, 0.05, 0.1 + r() * 0.05));
    sHead = (sHead + 1) % SMAX;
  }
  scraps.instanceColor.needsUpdate = true;
  for (let i = 0; i < 46; i++) {
    const a = r() * 6.283, sp = 0.6 + r() * 2.4;
    ember(_v.copy(pos).add(new THREE.Vector3((r() - 0.5) * 0.4, 0.2 + r() * 0.4, 0.05)), new THREE.Vector3(Math.cos(a) * sp, Math.sin(a) * sp * 0.7 + 0.8, (r() - 0.5) * 1.2),
      T0 + r() * 0.08, 1.2 + r() * 1.6, 0.18 + r() * 0.28, 1.2 + r() * 2.2, r() < 0.25 ? [3.0, 2.6, 1.9] : [3.2, 1.3 + r() * 0.7, 0.25]);
  }
}
function updateScraps(T) {
  for (let i = 0; i < SMAX; i++) {
    const d = scrapData[i]; let s = 0;
    if (d) {
      const age = T - d.birth, a = age / d.life;
      if (age >= 0 && a < 1) {
        const k = 2.2, f = (1 - Math.exp(-k * age)) / k;
        _v.copy(d.o).addScaledVector(d.v, f); _v.y += 0.5 * d.buoy * age * age; _v.x += Math.sin(age * 4 + d.ph) * 0.12 * age;
        _e.set(d.rot[0] + d.w[0] * age, d.rot[1] + d.w[1] * age, d.rot[2] + d.w[2] * age); _q.setFromEuler(_e);
        s = d.size * (1 - sstep(0.55, 1, a));
        _m.compose(_v, _q, _s.set(s, s, s)); scraps.setMatrixAt(i, _m); continue;
      }
    }
    _m.makeScale(0, 0, 0); scraps.setMatrixAt(i, _m);
  }
  scraps.instanceMatrix.needsUpdate = true;
}

// ---------- shadow monsters ----------
const EYE = new THREE.Color(1.25, 1.15, 0.85);
const pupilMat = new THREE.MeshBasicMaterial({ color: 0x08070f });
const rimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 5, 5), side: THREE.DoubleSide });
const monsters = [
  { shape: 'monster_a', h: 0.82, squash: 1, u0: 0.255, v: 0.035, hit: 7.0 },
  { shape: 'monster_b', h: 0.74, squash: 1, u0: 0.0125, v: 0.035, hit: 10.5 },
  { shape: 'monster_c', h: 1.5, squash: 0.62, u0: -0.196, v: 0.048, hit: 99, stop: 17.0 },
].map((d, i) => {
  const body = cutout(d.shape, { height: d.h, squash: d.squash, mat: M.monster, step: 5, rough: 1.1, depth: 0.025 });
  const H = body.userData.h;
  const eyes = body.userData.holes.filter(h => h.pw > 50 && h.ph > 50);
  const eyeMat = new THREE.MeshBasicMaterial({ color: EYE.clone() });
  const pupils = [];
  for (const h of eyes) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(h.w + 0.03, h.h + 0.03), eyeMat); p.position.set(h.x, h.y, -0.03); body.add(p);
    const q = new THREE.Mesh(new THREE.CircleGeometry(Math.min(h.w, h.h) * 0.27, 20), pupilMat); q.position.set(h.x, h.y, -0.015); q.userData.home = [h.x, h.y, Math.min(h.w, h.h)]; body.add(q); pupils.push(q);
  }
  const rim = new THREE.Mesh(new THREE.ShapeGeometry(body.userData.outline.map(s => new THREE.Shape(s.getPoints())), 1), rimMat);
  rim.scale.set(1.16, 1.14, 1); rim.position.set(0, -0.07 * H, -0.04); rim.visible = false; body.add(rim);
  const g = new THREE.Group(); g.add(body); scene.add(g);
  return { ...d, i, g, body, H, pupils, rim, pos: new THREE.Vector3() };
});
const FLASH_T = 19.0, WAVE_V = 9.0;
{ // the third one is taken by the shock wave, when the ring reaches it
  const m = monsters[2]; pathAt(m.u0 + m.v * m.stop, m.pos); m.hit = FLASH_T + Math.hypot(m.pos.x - towerPos.x, m.pos.z - towerPos.z) / WAVE_V - 0.2;
}

// ---------- smoke wisp ----------
const smokeN = 16, smoke = [];
for (let i = 0; i < smokeN; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: pSmoke, color: 0xd5dbf2, transparent: true, depthWrite: false, opacity: 0, rotation: i * 1.3 }));
  s.renderOrder = 4; scene.add(s); smoke.push(s);
}
const blinkHole = BLINK.userData.holes.filter(q => q.pw > 22 && q.ph > 22 && q.py > 0.42).sort((a, b) => b.x - a.x)[0];
const SMOKE_O = new THREE.Vector3(BLINK.position.x + (blinkHole?.x ?? 0), (blinkHole?.y ?? 0.6) + 0.08, BLINK.position.z + 0.08);

// ---------- shock ring on the ground ----------
const ringMat = new THREE.ShaderMaterial({
  uniforms: { uR: { value: 0 }, uI: { value: 0 }, uAfter: { value: 0 } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
  fragmentShader: `uniform float uR, uI, uAfter; varying vec2 vUv;
    void main(){ float r = length(vUv - 0.5) * 2.0;
      float ring = exp(-pow((r - uR) / 0.022, 2.0)) + 0.35 * exp(-pow((r - uR + 0.05) / 0.06, 2.0));
      float a = ring * uI + exp(-r * 5.0) * uAfter;
      gl_FragColor = vec4(vec3(1.0, 0.66, 0.3) * a, a); }`,
});
const RING_SIZE = 36;
const ring = new THREE.Mesh(new THREE.PlaneGeometry(RING_SIZE, RING_SIZE), ringMat);
ring.rotation.x = -Math.PI / 2; ring.position.set(towerPos.x, 0.05, towerPos.z + 0.3); ring.renderOrder = 3; scene.add(ring);

// ---------- post ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.75, 0.7, 0.82);
composer.addPass(bloom);
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uDawn: { value: 0 }, uFade: { value: 1 }, uVig: { value: 0.75 }, uShockR: { value: 0 }, uShockAmt: { value: 0 },
    uShockC: { value: new THREE.Vector2(0.5, 0.6) }, uAspect: { value: 0.5625 }, uFlash: { value: 0 }, uExp: { value: 1 }, uTime: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uDawn, uFade, uVig, uShockR, uShockAmt, uAspect, uFlash, uExp, uTime; uniform vec2 uShockC; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      vec2 d = (uv - uShockC) * vec2(uAspect, 1.0); float r = length(d); vec2 dir = d / max(r, 1e-4) / vec2(uAspect, 1.0);
      float w = exp(-pow((r - uShockR) / 0.04, 2.0)) * uShockAmt;
      uv -= dir * w * 0.028;
      vec3 c = texture2D(tDiffuse, uv).rgb;
      c.r = mix(c.r, texture2D(tDiffuse, uv - dir * w * 0.012).r, step(0.0005, w));
      c *= uExp;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      vec3 sh = mix(vec3(0.80, 0.93, 1.30), vec3(1.10, 0.96, 0.98), uDawn);   // shadows: indigo at night
      vec3 hi = mix(vec3(1.10, 1.00, 0.84), vec3(1.08, 1.00, 0.90), uDawn);   // lights: amber
      c *= mix(sh, hi, smoothstep(0.0, 0.5, l));
      c = mix(vec3(l), c, mix(1.18, 1.10, uDawn));
      c = pow(max(c, 0.0), vec3(1.08));
      c += uFlash * vec3(1.0, 0.82, 0.55);
      float v = smoothstep(1.02, 0.28, length((vUv - vec2(0.5, 0.52)) * vec2(0.95, 1.12)));
      c *= mix(1.0, v, uVig);
      c += (hash(vUv * 900.0 + uTime) - 0.5) * 0.012;
      gl_FragColor = vec4(max(c, 0.0) * uFade, 1.0);
    }`,
});
composer.addPass(grade);
composer.addPass(new OutputPass());

function resize() {
  const H = innerHeight, W = Math.min(innerWidth, Math.round(H * 9 / 16));
  frame.style.width = W + 'px'; frame.style.height = H + 'px';
  const pr = Math.min(devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(pr); renderer.setSize(W, H); composer.setPixelRatio(pr); composer.setSize(W, H);
  camera.aspect = W / H;
  camera.fov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(18)) * Math.max(1, 0.5625 / camera.aspect)) * 180 / Math.PI;
  camera.updateProjectionMatrix();
  grade.uniforms.uAspect.value = camera.aspect;
  dustMat.uniforms.uPx.value = eMat.uniforms.uPx.value = H * pr / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
}
addEventListener('resize', resize); resize();

// ---------- the demo loop ----------
const CAPS = [[0, '밤 · 종이 그림자극 마을'], [4.4, '빛줄기 · 원뿔 · 먼지 · 후광'], [6.9, '명중 · 찌그러짐 → 테두리 번쩍 → 정지 → 조각 · 불티'],
  [12.8, '창문 꺼짐 · 세 번 깜빡 → 연기 한 줄'], [16.8, '섬광 · 어두워지며 모임'], [19, '충격파 → 종이 흔들림 → 잔광'], [24, '동틀 녘 · 남색 → 복숭아빛'], [35.6, '']];
let events = [], freeze = 0;
function buildEvents() {
  events = [];
  for (const m of monsters) {
    events.push({ t: m.hit + 0.2, fn: live => { if (live) freeze = 0.05; } });          // 0.05 s hit-stop
    events.push({ t: m.hit + 0.26, fn: () => burst(m.pos, m.hit + 0.26, 100 + m.i * 31) });
  }
  events.push({ t: 16.9, fn: () => { // motes gather into the lantern
    const r = rng(77);
    for (let i = 0; i < 170; i++) {
      const a = r() * 6.283, e = (r() - 0.35) * 1.6, R = 2.5 + r() * 5;
      const p = new THREE.Vector3(LANTERN.x + Math.cos(a) * Math.cos(e) * R, Math.max(0.1, LANTERN.y + Math.sin(e) * R * 0.7), LANTERN.z + 0.4 + Math.abs(Math.sin(a)) * Math.cos(e) * R);
      ember(p, LANTERN, 17.0 + r() * 1.5, 0.6 + r() * 0.7, 0.14 + r() * 0.2, 0, [3.0, 1.6 + r(), 0.5], 1);
    }
  } });
  events.push({ t: FLASH_T, fn: () => { // sparks thrown out by the flash
    const r = rng(78);
    for (let i = 0; i < 110; i++) {
      const a = r() * 6.283, e = (r() - 0.3) * 1.4, sp = 3 + r() * 7;
      ember(LANTERN, new THREE.Vector3(Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp * 0.6, Math.abs(Math.sin(a)) * Math.cos(e) * sp + 0.5), FLASH_T + r() * 0.1, 0.8 + r() * 1.6, 0.16 + r() * 0.26, 0.5 + r(), [3.2, 1.8 + r() * 0.8, 0.5]);
    }
  } });
  events.sort((a, b) => a.t - b.t).forEach(e => { e.done = false; });
}
buildEvents();

const beamAim = pathAt(0.5).clone(), _aim = new THREE.Vector3(), _t = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();
const _proj = new THREE.Vector3();
let T = SEEK ?? 0, lastT = -1, lastNow = performance.now(), capIdx = -1;

function update(T, dtReal) {
  const D = sstep(24, 32.5, T);                                       // dawn
  const gather = sstep(17, 18.9, T) * (T < FLASH_T ? 1 : 0);          // darkening before the flash
  const tf = T - FLASH_T;
  const flashSpike = tf >= 0 ? Math.exp(-tf * 9) : 0;
  const after = tf >= 0 ? Math.exp(-tf * 0.55) * sstep(0, 0.3, tf) * (1 - D) : 0;
  const fade = sstep(0, 1.3, T) * (1 - sstep(LOOP - 1.5, LOOP - 0.1, T));
  const night = 1 - D;

  // --- monsters
  let aimSet = false; const ti = performance.now() * 0.001;
  for (const m of monsters) {
    const u = m.u0 + m.v * Math.min(T, m.stop ?? 1e9, m.hit);
    const tau = T - m.hit;
    pathAt(u, m.pos);
    const alive = u > 0 && tau < 0.26;
    m.g.visible = alive; if (!alive) continue;
    const walking = T < Math.min(m.stop ?? 1e9, m.hit);
    const ph = T * 7.2 + m.i * 2.1, hop = walking ? Math.abs(Math.sin(ph)) : 0;
    let sx = 1 + 0.07 * (0.5 - hop), syy = 1 - 0.09 * (0.5 - hop), rz = walking ? Math.sin(ph) * 0.07 : Math.sin(T * 2) * 0.02;
    if (!walking && tau < 0) { const fear = sstep(17, 18.8, T); sx *= 1 - 0.05 * fear + Math.sin(T * 38) * 0.012 * fear; syy *= 1 + 0.08 * fear; } // it freezes and stares
    if (tau >= 0) { const k = Math.sin(clamp(tau / 0.18) * Math.PI * 0.5); sx *= 1 + 0.42 * k; syy *= 1 - 0.46 * k; rz = 0; } // squash
    m.g.position.set(m.pos.x, hop * 0.07, m.pos.z + 0.02);
    m.body.scale.set(sx, syy, 1); m.body.rotation.z = rz;
    m.rim.visible = tau >= 0.16 && tau < 0.26;
    const blink = (Math.sin(T * 1.3 + m.i * 2.3) > 0.985) ? 1 : 0;
    for (const p of m.pupils) {
      const [hx, hy, hs] = p.userData.home; const dx = clamp((LANTERN.x - m.pos.x) * 0.25, -1, 1);
      p.position.x = hx + dx * hs * 0.16; p.position.y = hy + hs * 0.03;
      const s = blink ? 2.2 : (tau >= 0 ? 0.45 : 1 + 0.25 * gather); p.scale.set(s, blink ? 2.2 : s, 1);
    }
  }
  // --- beam: where it points and how bright
  let bI = 1, wantU = 0.47 + 0.2 * Math.sin(T * 0.55);
  const seg = (a, b) => T >= a && T < b;
  if (seg(4.4, 7.9)) { _aim.copy(monsters[0].pos); aimSet = true; }
  else if (seg(8.6, 11.4)) { _aim.copy(monsters[1].pos); aimSet = true; }
  else if (seg(15.5, FLASH_T)) { _aim.copy(monsters[2].pos); aimSet = true; }
  if (!aimSet) { pathAt(wantU, _aim); _aim.x += Math.sin(T * 0.8) * 0.5; }
  _aim.y = 0.25;
  const follow = 1 - Math.exp(-dtReal * (aimSet ? 3.4 : 1.6));
  if (dtReal > 0.5) beamAim.copy(_aim); else beamAim.lerp(_aim, follow);
  const hitPulse = Math.max(...monsters.map(m => { const t = T - m.hit; return t > -0.5 && t < 0.4 ? sstep(-0.5, 0, t) * (1 - sstep(0.26, 0.4, t)) : 0; }));
  bI *= (1 - gather) * (tf >= 0 ? sstep(2.5, 5, tf) : 1) * night * (0.82 + 0.18 * Math.sin(ti * 1.7)) * (1 + 0.8 * hitPulse);
  beam.target.position.copy(beamAim); beam.intensity = 380 * bI;
  beam.angle = 0.19 - 0.05 * hitPulse;
  const len = _t.copy(beamAim).sub(LANTERN).length() + 1.2;
  _t.normalize(); _r.crossVectors(_t, _u.set(0, 1, 0)).normalize(); _u.crossVectors(_r, _t).normalize();
  const rad = Math.tan(beam.angle) * len * 0.92;
  cone.position.copy(LANTERN); cone.lookAt(beamAim); cone.scale.set(rad, rad, len);
  coneMat.uniforms.uI.value = 1.1 * bI; coneMat.uniforms.uTime.value = ti;
  const du = dustMat.uniforms; du.uO.value.copy(LANTERN); du.uDir.value.copy(_t); du.uRight.value.copy(_r); du.uUp.value.copy(_u);
  du.uLen.value = len; du.uRad.value = rad; du.uI.value = 1.5 * bI; du.uTime.value = ti;

  // --- lantern
  const flick = 0.93 + 0.07 * Math.sin(ti * 9.1) * Math.sin(ti * 5.3);
  const L = (lerp(1, 0.1, gather) + flashSpike * 4.5 + after * 1.3) * lerp(1, 0.0, sstep(25, 31, T)) * flick;
  lantern.intensity = 120 * L;
  const hs = 1.5 * Math.sqrt(L) * (1 - 0.55 * gather) + flashSpike * 5 + after * 1.2;
  halo.scale.setScalar(hs * 0.95); halo.material.opacity = clamp(0.75 * L); flare.scale.setScalar(hs * 1.7 + flashSpike * 6); flare.material.opacity = clamp(0.3 * L + flashSpike);
  towerGlow.color.copy(towerGlow.userData.base).multiplyScalar(clamp(L, 0, 3));

  // --- windows: the one on BLINK blinks three times and goes out
  for (const h of houses) {
    let w = 1 - sstep(25, 30, T);
    if (h === BLINK) { const tb = T - 13.0; if (tb >= 0) w *= tb < 1.5 ? (Math.floor(tb / 0.25) % 2 === 0 ? 0.06 : 1) : 0; }
    w *= lerp(1, 0.35, gather) * (0.95 + 0.05 * Math.sin(ti * 6 + h.position.x * 3));
    h.userData.glow.color.copy(h.userData.glow.userData.base).multiplyScalar(w);
  }
  for (let i = 0; i < smokeN; i++) {
    const s = smoke[i], age = T - (14.55 + i * 0.2), life = 3.4;
    if (age > 0 && age < life) {
      const a = age / life;
      s.position.set(SMOKE_O.x + Math.sin(age * 1.7 + i * 0.5) * 0.05 * age + 0.06 * age, SMOKE_O.y + 0.62 * age, SMOKE_O.z);
      s.scale.setScalar(0.16 + 0.27 * age); s.material.opacity = 0.8 * sstep(0, 0.12, a) * (1 - a) * (1 - a);
    } else s.material.opacity = 0;
  }

  // --- flash: ring, screen ripple, paper shake, afterglow
  const R = Math.max(0, tf) * WAVE_V;
  ringMat.uniforms.uR.value = R / (RING_SIZE / 2); ringMat.uniforms.uI.value = tf >= 0 ? 1.5 * Math.exp(-tf * 1.3) * sstep(0, 0.12, tf) : 0; ringMat.uniforms.uAfter.value = after * 0.5;
  _proj.set(towerPos.x, LANTERN.y * 0.55, towerPos.z).project(camera);
  grade.uniforms.uShockC.value.set(_proj.x * 0.5 + 0.5, _proj.y * 0.5 + 0.5);
  grade.uniforms.uShockR.value = Math.max(0, tf) * 0.62; grade.uniforms.uShockAmt.value = tf >= 0 ? Math.exp(-tf * 2.2) : 0;
  grade.uniforms.uFlash.value = Math.exp(-Math.max(0, tf) * 16) * (tf >= 0 ? 0.6 : 0);
  for (const f of flats) {
    const dist = Math.hypot(f.x - towerPos.x, f.z - towerPos.z), tw = T - (FLASH_T + dist / WAVE_V);
    let a = Math.sin(ti * 0.9 + f.seed) * 0.006;
    if (tw > 0) a += f.amp * (0.26 / (1 + dist * 0.06)) * Math.exp(-tw * 1.9) * Math.sin(tw * 15);
    f.g.rotation.x = a; f.g.rotation.z = a * 0.35 * Math.sin(f.seed * 3);
  }
  cloudA.position.x = -2.6 + Math.sin(ti * 0.05) * 0.5; cloudB.position.x = 2.9 + Math.cos(ti * 0.04) * 0.5;

  // --- dawn: indigo -> peach, the low sun stretches every shadow
  for (const m of dawnMats) m.color.lerpColors(m.userData.night, m.userData.dawn, D);
  skyMat.uniforms.uDawn.value = D; skyMat.uniforms.uGlow.value = after;
  hemi.color.setRGB(lerp(0.045, 1.0, D), lerp(0.07, 0.62, D), lerp(0.33, 0.52, D)); hemi.groundColor.setRGB(lerp(0.003, 0.2, D), lerp(0.004, 0.11, D), lerp(0.012, 0.16, D));
  hemi.intensity = lerp(1.0, 0.8, D) * lerp(1, 0.4, gather);
  fill.intensity = lerp(0.55, 0.25, D) * lerp(1, 0.4, gather);
  const el = lerp(0.62, 0.115, sstep(24, 35, T)), az = 0.62;
  sun.position.set(-Math.sin(az) * Math.cos(el) * 30, Math.sin(el) * 30, -Math.cos(az) * Math.cos(el) * 30 - 2); sun.target.position.set(0, 0, -1.5);
  sun.shadow.autoUpdate = D > 0; beam.shadow.autoUpdate = bI > 0.001;
  sun.intensity = 2.6 * D * clamp(0.45 / Math.sin(el), 1, 4.2); sun.color.setRGB(1, lerp(0.55, 0.72, D), lerp(0.36, 0.5, D));
  moon.position.y = 4.25 - D * 1.6; moonMat.color.setRGB(1.5 * (1 - 0.6 * D), 1.42 * (1 - 0.6 * D), 1.15 * (1 - 0.5 * D));
  starMat.opacity = (1 - D) * (0.8 + 0.2 * Math.sin(ti * 2));

  grade.uniforms.uDawn.value = D; grade.uniforms.uFade.value = fade; grade.uniforms.uTime.value = ti % 10;
  grade.uniforms.uExp.value = lerp(1, 0.62, gather) * (1 + after * 0.35);
  bloom.strength = 0.75 + flashSpike * 0.6 + after * 0.35 - D * 0.2;
  renderer.toneMappingExposure = 1.0;
  eMat.uniforms.uTime.value = T;
  updateScraps(T);

  let ci = 0; for (let i = 0; i < CAPS.length; i++) if (T >= CAPS[i][0]) ci = i;
  if (ci !== capIdx) { capIdx = ci; cap.textContent = CAPS[ci][1]; }
}

function tick(now) {
  const dtReal = Math.min(0.1, (now - lastNow) / 1000); lastNow = now;
  if (SEEK === null) {
    if (freeze > 0) freeze -= dtReal; else T += dtReal;
    if (T >= LOOP) T -= LOOP;
  }
  if (T < lastT) { clearEmbers(); scrapData.length = 0; events.forEach(e => { e.done = false; }); }
  for (const e of events) if (!e.done && T >= e.t) { e.done = true; e.fn(T - e.t < 0.1 && SEEK === null); }
  update(T, lastT < 0 || Math.abs(T - lastT) > 0.5 ? 1 : dtReal);
  lastT = T;
  composer.render();
  requestAnimationFrame(tick);
}
clearEmbers();
window.__lamplighter = { seek: t => { T = t; }, get time() { return T; } };
requestAnimationFrame(tick);
