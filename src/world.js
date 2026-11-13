// 등불지기 — where things are on the ground. Shared by the rules (sim), both renderers and
// the headless autoplay, so they always agree.
import { Path } from './sim.js';

export const PATH_L = 13.4, PATH_Z0 = PATH_L / 2 + 0.2;
export function buildWorld(SHAPES, mirror = false) {
  const PS = SHAPES.path, pk = PATH_L / PS.h, mx = mirror ? -1 : 1;
  const pts = PS.centre.map(([x, y]) => ({ x: (x - PS.w / 2) * pk * mx, z: PATH_Z0 - (PS.h - y) * pk })).reverse();
  const path = new Path(pts);
  const end = pts[pts.length - 1];
  const tower = { x: end.x, z: end.z - 0.75 };
  // fixed build spots beside the path (Kingdom Rush style)
  const slots = [];
  const fr = [0.36, 0.52, 0.68, 0.44, 0.60, 0.78], p = {};
  fr.forEach((f, i) => {
    path.at(f * path.total, p);
    const side = i % 2 ? 1 : -1; let best = null;
    for (const off of [1.15, 1.4, 1.7, 2.0]) for (const sd of [side, -side]) {
      const x = p.x - p.hz * off * sd, z = p.z + p.hx * off * sd;
      if (Math.abs(x) > 2.9) continue;
      let dmin = 9; const q = {};
      for (let s = 0; s < path.total; s += 0.2) { path.at(s, q); dmin = Math.min(dmin, Math.hypot(q.x - x, q.z - z)); }
      const far = slots.every(o => Math.hypot(o.x - x, o.z - z) > 1.5);
      if (dmin > 0.85 && far && !best) best = { x, z };
    }
    slots.push(best ?? { x: p.x - p.hz * 1.3 * side, z: p.z + p.hx * 1.3 * side });
  });
  return { path, tower, slots, mirror, pk };
}
