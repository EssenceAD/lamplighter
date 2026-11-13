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
  // fixed build spots beside the path (Kingdom Rush style): close to the road, never on it
  const slots = [], q = {};
  const clear = (x, z) => { let d = 9; for (let s = 0; s < path.total; s += 0.15) { path.at(s, q); d = Math.min(d, Math.hypot(q.x - x, q.z - z)); } return d; };
  const fr = [0.36, 0.52, 0.68, 0.44, 0.60, 0.78], p = {};
  fr.forEach((f, i) => {
    path.at(f * path.total, p);
    let best = null, bestCost = 1e9;
    for (let x = -2.9; x <= 2.9; x += 0.15) for (let z = p.z - 2.2; z <= p.z + 2.2; z += 0.15) {
      if (z > 3.6 || z < tower.z + 1.6) continue;                                        // stay on screen and off the tower's foot
      const d = clear(x, z); if (d < 1.0 || d > 1.7) continue;
      if (!slots.every(o => Math.hypot(o.x - x, o.z - z) > 1.7)) continue;
      const cost = Math.hypot(x - p.x, z - p.z) + (i % 2 ? -x : x) * 0.05 * mx;
      if (cost < bestCost) { bestCost = cost; best = { x: +x.toFixed(2), z: +z.toFixed(2) }; }
    }
    if (best) slots.push(best);
  });
  return { path, tower, slots, mirror, pk };
}
