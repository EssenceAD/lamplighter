// 등불지기 — the 5 x 15 nights. Levels are generated from a few rules so the whole
// curve can be tuned in one place (and checked by tools/autoplay.js).
import { rng, ENEMIES, TOOL_ORDER } from './sim.js';
import { TUNE } from './tuning.js';

export const CHAPTERS = [
  { name: '첫 등불 마을', tool: 'mirror', toolName: '거울' },
  { name: '무지개 언덕 마을', tool: 'prism', toolName: '프리즘' },
  { name: '돋보기 골짜기 마을', tool: 'lens', toolName: '렌즈' },
  { name: '색유리 장터 마을', tool: 'glass', toolName: '색유리' },
  { name: '반딧불 숲 마을', tool: 'jar', toolName: '반딧불 병' },
];
export const STAGES = 15;
export const levelId = (c, s) => c * STAGES + s;
const TIER = ['쉬움', '쉬움', '보통', '어려움'];

// which night first shows what (chapter, stage are 0-based). A first night shows only the new thing.
const FIRST_TOOL = { mirror: [0, 2], prism: [1, 0], lens: [2, 0], glass: [3, 0], jar: [4, 0] };
const FIRST_ENEMY = { walker: [0, 0], fast: [0, 5], umbrella: [0, 9], fat: [2, 1], color: [3, 1] };
const after = (c, s, [fc, fs]) => c > fc || (c === fc && s >= fs);

export function makeLevel(c, s, slotsAll) {
  const r = rng(1000 + c * 97 + s * 13);
  const tier = c === 0 && s < 3 ? 0 : [0, 0, 1, 2][s % 4];
  const boss = s === STAGES - 1 ? c : null;
  const L = { c, s, id: levelId(c, s), name: `${c + 1}-${s + 1}`, tierName: boss != null ? '보스' : TIER[s % 4], tier, boss, windows: 5, prep: 9, waitStart: true };

  // tools you may place tonight
  let tools = TOOL_ORDER.filter(t => after(c, s, FIRST_TOOL[t]));
  const newTool = TOOL_ORDER.find(t => FIRST_TOOL[t][0] === c && FIRST_TOOL[t][1] === s);
  if (newTool) { tools = [newTool]; L.newTool = newTool; }
  L.tools = tools;
  const nSlots = !tools.length ? 0 : newTool ? 3 : Math.min(slotsAll.length, 3 + Math.floor((c * 15 + s) / 14));
  L.slots = slotsAll.slice(0, nSlots);

  // who comes tonight
  let pool = Object.keys(FIRST_ENEMY).filter(e => after(c, s, FIRST_ENEMY[e]));
  const newEnemy = Object.keys(FIRST_ENEMY).find(e => FIRST_ENEMY[e][0] === c && FIRST_ENEMY[e][1] === s && e !== 'walker');
  if (newEnemy) { pool = [newEnemy]; L.newEnemy = newEnemy; }
  if (newTool && c > 0) pool = pool.filter(e => e === 'walker' || e === 'fast');        // a new tool's first night stays gentle
  if (newTool === 'lens') pool = ['walker'];
  // what the bot (and the hint arrow) would build
  L.hint = tools.length ? hintFor(tools, pool) : [];

  L.duration = Math.min(170, 100 + tier * 14 + c * 6 + (boss != null ? 20 : 0));
  // how much shadow comes: grows with chapter and stage, wobbles easy/easy/normal/hard
  let budget = (22 + c * 11 + s * 2.2) * [0.8, 0.9, 1.1, 1.3][tier];
  if (c === 0 && s === 0) budget = 5; if (c === 0 && s === 1) budget = 8; if (c === 0 && s === 2) budget = 9;
  if (newTool || newEnemy) budget *= 0.7;
  if (boss != null) budget *= 0.75;
  L.hpMul = (globalThis.__TUNE ?? TUNE)[c * STAGES + s] ?? 1;   // per-night toughness, set by tools/calibrate.mjs
  if (c === 0) L.hpMul *= 0.55 + 0.45 * s / 14;                         // the first village ramps up gently
  L.spdMul = 1 + c * 0.03;

  const waves = [], groups = Math.max(3, Math.round(5 + tier + c * 0.8 + s * 0.15));
  const span = L.duration - 22;
  for (let g = 0; g < groups; g++) {
    const share = budget * (0.6 + 0.8 * (g / Math.max(1, groups - 1))) / groups;      // later groups are heavier
    const type = pool[Math.floor(r() * pool.length)];
    const th = ENEMIES[type].threat;
    const n = Math.max(1, Math.round(share / th + (r() - 0.5) * 0.6));
    waves.push({ t: 3 + span * (g / groups) + r() * 3, type, n, gap: type === 'fast' ? 0.8 : type === 'fat' ? 5 : 1.7, v: Math.floor(r() * 3) });
  }
  L.waves = waves;
  L.reward = Math.round(14 + L.id * 0.95 + tier * 4 + (boss != null ? 25 : 0));   // sparkles for a clean night
  if (boss != null) L.bossAt = 14;

  // guided first nights
  if (c === 0 && s === 0) L.guide = 'drag';
  if (c === 0 && s === 1) { L.guide = 'flash'; L.flashStart = 1; }
  if (c === 0 && s === 2) L.guide = 'tool';
  if (newTool && c > 0) L.guide = 'tool';
  L.intro = newTool ? `새 도구 · ${CHAPTERS[c].toolName}` : newEnemy ? `새 그림자 · ${ENEMY_NAMES[newEnemy]}` : boss != null ? '챕터 보스' : '';
  L.tip = newTool ? TOOL_TIPS[newTool] : newEnemy ? ENEMY_TIPS[newEnemy] : boss != null ? '큰 그림자가 와요. 창문 셋을 한 번에 꺼뜨려요.' : '';
  return L;
}
function hintFor(tools, pool) {
  const h = [];
  if (pool.includes('fat') && tools.includes('lens')) h.push('lens');
  if (pool.includes('color') && tools.includes('glass')) h.push('glass', 'glass');
  if (tools.includes('mirror')) h.push('mirror');
  if (tools.includes('jar')) h.push('jar');
  if (tools.includes('prism')) h.push('prism');
  if (pool.includes('fat') && tools.includes('lens')) h.push('lens');
  if (pool.includes('color') && tools.includes('glass')) h.push('glass');
  return h.length ? h : tools.slice();
}
export const ENEMY_NAMES = { walker: '걷는 그림자', fast: '빠른 그림자', fat: '뚱뚱한 그림자', umbrella: '그림자 우산', color: '색 그림자', boss: '보스' };
export const TOOL_TIPS = {
  mirror: '빈 자리를 눌러 거울을 세우고, 끌어서 방향을 돌려요.',
  prism: '프리즘은 빛을 세 갈래로 나눠요.',
  lens: '렌즈는 빛을 한 점에 모아요. 아주 세요.',
  glass: '색유리는 빛에 색을 입혀요.',
  jar: '반딧불 병은 가까이 온 그림자를 느리게 해요.',
};
export const ENEMY_TIPS = {
  fast: '빠른 그림자예요. 빛줄기를 손가락으로 끌어 따라가요.',
  umbrella: '우산은 앞에서 오는 빛을 막아요. 옆이나 뒤에서 비추거나 섬광으로 뒤집어요.',
  fat: '뚱뚱한 그림자는 렌즈로 모은 빛이 필요해요.',
  color: '색 그림자는 색유리 빛에만 사라져요.',
};

// the night of the day: same for everyone, seeded by the date
export function dailyLevel(dateStr, slotsFor) {
  let h = 0; for (const ch of dateStr) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const r = rng(h);
  const c = 2 + Math.floor(r() * 3), slotsAll = slotsFor(c);
  const L = makeLevel(c, 5 + Math.floor(r() * 9), slotsAll);
  L.daily = dateStr; L.name = '오늘의 밤'; L.tierName = '도전'; L.tools = TOOL_ORDER.slice(); L.slots = slotsAll.slice(); L.hint = ['lens', 'glass', 'mirror', 'jar', 'prism', 'mirror'];
  L.boss = null; L.guide = null; L.intro = '오늘의 밤'; L.tip = '모두 같은 밤을 지켜요. 점수는 순위에 올라가요.'; L.id = -1;
  return L;
}
// everyone plays the daily night with the same lantern, so the ranking is fair
export const DAILY_UPGRADES = { lamp: 3, wide: 3, oil: 3, mirror: 2, prism: 2, lens: 2, glass: 2, jar: 2 };

// ---------- meta: upgrades, village, skins ----------
export const UPGRADES = [
  { id: 'lamp', name: '등불 세기', desc: '빛이 더 굵고 밝아져요', cost: [20, 45, 90, 160, 260] },
  { id: 'wide', name: '등불 범위', desc: '빛 웅덩이가 넓어져요', cost: [20, 45, 90, 160, 260] },
  { id: 'oil', name: '기름통', desc: '섬광이 더 자주, 더 세게', cost: [25, 55, 100, 170, 280] },
  { id: 'mirror', name: '거울 강화', desc: '더 길고 센 반사', cost: [30, 80, 170], ch: 0 },
  { id: 'prism', name: '프리즘 강화', desc: '세 갈래가 더 세져요', cost: [40, 100, 200], ch: 1 },
  { id: 'lens', name: '렌즈 강화', desc: '모은 빛이 더 뜨거워져요', cost: [50, 120, 230], ch: 2 },
  { id: 'glass', name: '색유리 강화', desc: '색 빛이 더 멀리', cost: [60, 140, 260], ch: 3 },
  { id: 'jar', name: '반딧불 강화', desc: '반딧불이 더 많이', cost: [70, 160, 300], ch: 4 },
];
// each village: what the oil lights up, in order. Costs are in oil (1 oil per new star).
export const VILLAGE = [
  { id: 'h0', name: '첫째 집', cost: 2 }, { id: 'h1', name: '둘째 집', cost: 3 }, { id: 'well', name: '우물', cost: 3 },
  { id: 'h2', name: '셋째 집', cost: 4 }, { id: 'h3', name: '넷째 집', cost: 4 }, { id: 'plaza', name: '광장', cost: 5 }, { id: 'h4', name: '다섯째 집', cost: 5 },
];
export const SKINS = [
  { id: 'amber', name: '호박 등불', color: [1.0, 0.72, 0.4], need: null, how: '처음부터' },
  { id: 'rose', name: '장미 등불', color: [1.0, 0.56, 0.52], need: s => s.stars >= 20, how: '별 20개' },
  { id: 'mint', name: '박하 등불', color: [0.62, 1.0, 0.8], need: s => s.chapterDone >= 1, how: '1챕터 완료' },
  { id: 'moon', name: '달빛 등불', color: [0.72, 0.82, 1.0], need: s => s.stars >= 90, how: '별 90개' },
  { id: 'plum', name: '자두 등불', color: [0.86, 0.62, 1.0], need: s => s.festivals >= 1, how: '마을 축제 한 번' },
  { id: 'gold', name: '금빛 등불', color: [1.0, 0.86, 0.36], need: s => s.festivals >= 5, how: '모든 마을 축제' },
];
