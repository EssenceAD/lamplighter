// 등불지기 — service worker: offline play and the "new version" strip.
// Bump VERSION on every release; the page shows the strip when a new worker is waiting.
const VERSION = '3.0.0';
const CACHE = 'lamplighter-' + VERSION;
const CORE = ['./', './index.html', './manifest.webmanifest', './src/app.js', './src/game.js', './src/harbour.js', './src/audio.js', './src/net.js', './assets/shapes.json', './assets/paper/torn.png', './assets/icon-192.png', './assets/icon-512.png',
  './assets/paper/Paper001_Color.jpg', './assets/paper/Paper001_NormalGL.jpg', './assets/paper/Paper003_NormalGL.jpg',
  './assets/particles/circle_05.png', './assets/particles/spark_05.png', './assets/particles/flare_01.png', './assets/particles/light_01.png', './assets/particles/star_07.png'];
const T = 'https://cdn.jsdelivr.net/npm/three@0.170.0/', A = T + 'examples/jsm/';
const CDN = [T + 'build/three.module.js', A + 'loaders/SVGLoader.js', A + 'postprocessing/EffectComposer.js', A + 'postprocessing/RenderPass.js', A + 'postprocessing/UnrealBloomPass.js', A + 'postprocessing/ShaderPass.js',
  A + 'postprocessing/OutputPass.js', A + 'postprocessing/Pass.js', A + 'postprocessing/MaskPass.js', A + 'shaders/CopyShader.js', A + 'shaders/LuminosityHighPassShader.js', A + 'shaders/OutputShader.js'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' }))).then(() => Promise.all(CDN.map(u => c.add(u).catch(() => {})))))));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('lamplighter-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.hostname.endsWith('supabase.co')) return;            // rankings always go to the network
  e.respondWith(caches.match(e.request, { ignoreSearch: url.origin === location.origin }).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok && (url.origin === location.origin || url.hostname === 'cdn.jsdelivr.net' || url.hostname.endsWith('gstatic.com') || url.hostname === 'fonts.googleapis.com')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  })));
});
