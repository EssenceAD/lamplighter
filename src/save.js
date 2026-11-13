// 등불지기 — progress kept on the device (localStorage).
const KEY = 'lamplighter.v1';
const fresh = () => ({ v: 1, stars: {}, up: {}, sparkles: 0, oil: 0, lit: {}, festival: {}, skin: 'amber', nick: '', pid: (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)),
  set: { music: true, sfx: true, mv: 0.6, sv: 0.8, low: false }, asked: false, daily: {} });
export function load(key = KEY) { try { const d = JSON.parse(localStorage.getItem(key)); if (d && d.v === 1) return Object.assign(fresh(), d, { set: Object.assign(fresh().set, d.set) }); } catch (e) { /* first run */ } return fresh(); }
export function store(save, key = KEY) { try { localStorage.setItem(key, JSON.stringify(save)); } catch (e) { /* private mode */ } }
export const totalStars = s => Object.values(s.stars).reduce((a, b) => a + b, 0);
export const stats = (s, STAGES) => ({ stars: totalStars(s), chapterDone: [0, 1, 2, 3, 4].filter(c => (s.stars[c * STAGES + STAGES - 1] || 0) > 0).length, festivals: Object.keys(s.festival).length });
