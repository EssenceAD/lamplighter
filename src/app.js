// 등불지기 (Lamplighter) 2.0.1 — boot, screens, input and the loop for the harbour night.
// Every piece of interface is cut paper pinned over the stage: no glyph symbols, icons are drawn as silhouettes.
import { Game, PlanBot, PLANS, BUILDS, BUILD_ORDER, SLOTS, LAST_WAVE, sellValue, clamp } from './game.js';
import { createHarbour } from './harbour.js';
import * as audio from './audio.js';
import * as net from './net.js';

export const VERSION = '2.0.3';
const Q = new URLSearchParams(location.search), DEBUG = Q.has('debug'), AUTO = Q.has('auto');
const $ = (s, el = document) => el.querySelector(s), ui = $('#ui'), frame = $('#frame');
const h = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const KEY = AUTO ? 'lamplighter.v2.auto' : 'lamplighter.v2';
const fresh = () => ({ v: 2, stars: 0, perks: {}, best: 0, bestStars: 0, runs: 0, nick: '', asked: false, pid: (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)), set: { music: true, sfx: true, mv: 0.6, sv: 0.8 } });
let save = fresh(); try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.v === 2 && !AUTO) save = Object.assign(fresh(), d, { set: Object.assign(fresh().set, d.set) }); } catch (e) { /* first run */ }
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* private mode */ } };
audio.configure(save.set);
const PERKS = [
  { id: 'shards', name: '두둑한 주머니', desc: '시작 빛조각 +40', max: 2, cost: [2, 4] }, { id: 'lamp', name: '굵은 심지', desc: '등대 빛 +15%', max: 2, cost: [2, 4] },
  { id: 'windows', name: '덧창', desc: '창문 +3', max: 2, cost: [2, 3] }, { id: 'flash', name: '기름통', desc: '섬광 충전 15% 빠르게', max: 2, cost: [2, 4] },
  { id: 'refund', name: '단골 고물상', desc: '판매 환급 80%', max: 1, cost: [3] }, { id: 'reroll', name: '카드 다시 뽑기', desc: '판마다 다시 뽑기 +1', max: 2, cost: [3, 5] },
];

const SHAPES = await fetch('./assets/shapes.json').then(r => r.json());
// ---------- paper pieces and hand-cut icons ----------
const I = { // 24 x 24 silhouettes, cut by hand (slightly crooked on purpose)
  house: 'M3 11.2 L12 3 L15 5.7 L15.1 4 L17.6 4.1 L17.4 7.9 L21 11 L19 11.5 L19.2 21 L4.8 20.8 L5 11.4 Z M10 13 L9.9 17.1 L14 17.2 L14.1 13.1 Z',
  star: 'M12 2 L14.6 8.6 L21.6 9.2 L16.2 13.8 L18 20.8 L12 17 L6.2 21 L7.8 13.9 L2.4 9.4 L9.3 8.7 Z',
  note: 'M9 4 L19 2.5 L19 15.5 a3 2.6 0 1 1 -2 -2.4 L17 7 L11 8 L11 18 a3 2.6 0 1 1 -2 -2.4 Z',
  pause: 'M6 4 L10.5 4.3 L10 20 L5.6 19.6 Z M14 4.2 L18.4 4 L18.8 19.7 L14.2 20 Z',
  back: 'M4 12 L12 4.5 L11.6 9 L20 8.6 L20.2 15.6 L11.8 15.2 L12.3 19.8 Z',
  up: 'M12 3 L20 12 L15.2 11.6 L15.6 21 L8.6 20.8 L9 11.7 L4 12.2 Z',
  turn: 'M12.2 4.2 a8 8 0 1 1 -7.7 5.6 L7.3 10.6 a5.2 5.2 0 1 0 4.9 -3.6 L12.3 9.8 L7.2 5.6 L12.1 1.4 Z',
  sell: 'M9 3 L15 3.2 L13.6 6.4 C18 8 20 12 19.4 17 C19 20.4 15.8 21.4 12 21.4 C8.2 21.4 5 20.4 4.6 17 C4 12 6 8 10.4 6.4 Z',
  fast: 'M4 5 L12 12 L4.3 19 Z M12.5 5.2 L20.5 12 L12.4 19 Z', slow: 'M7 5 L17 12 L7.3 19 Z',
};
const ic = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="${I[name]}"/></svg>`;
const shapeIc = (name, cls = 'ic') => { const S = SHAPES[name]; return `<svg class="${cls}" viewBox="-12 -12 ${S.w + 24} ${S.h + 24}" aria-hidden="true"><path fill-rule="evenodd" vector-effect="non-scaling-stroke" d="${S.d}"/></svg>`; };
const moonIc = f => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><defs><mask id="mm"><circle cx="12" cy="12" r="9.6" fill="#fff"/><circle cx="${(4.5 + 17 * clamp(f)).toFixed(1)}" cy="10.5" r="9.6" fill="#000"/></mask></defs><path mask="url(#mm)" d="M12 2.3 L16 3.3 L19.6 6 L21.6 10.4 L21.2 14.6 L18.8 18.6 L14.6 21.3 L10 21.6 L5.8 19.6 L3 15.8 L2.3 11.4 L3.8 7 L7.4 3.6 Z"/></svg>`;
// a piece of cut paper: the outer element carries the shadow and the pin, the inner one the ragged edge
const paper = (inner, cls = '', o = {}) => `<${o.tag || 'div'} class="lift ${o.pin ? 'pin' : ''} ${o.out || ''}" ${o.attrs || ''}><span class="paper ${cls}">${inner}</span></${o.tag || 'div'}>`;
const btn = (label, a, cls = '', extra = '') => paper(label, 'btn ' + cls, { tag: 'button', attrs: `data-a="${a}" ${extra}` });
const tab = (inner, a, label) => paper(inner, 'tab', { tag: 'button', attrs: `data-a="${a}" aria-label="${label}"` });
const TOOL_ICON = { mirror: 't_mirror', prism: 't_prism', lens: 't_lens', bell: 't_bell', beacon: 't_beacon', jar: 't_jar' };
const DIRECTED = { mirror: 1, prism: 1, lens: 1, beacon: 1 };
// reward cards: an ink drawing and one line, no sentences
const CARD_UI = { prism4: ['t_prism', '프리즘 +1갈래'], fishslow: ['e_fish', '날치 속도 −25%'], shard20: ['*star', '빛조각 +20%'], lamp25: ['tower', '등대 빛 +25%'], lampwide: ['tower', '빛 웅덩이 +20%'],
  flashfast: ['*lamp', '섬광 충전 +25%'], flashhard: ['*lamp', '섬광 피해 +60%'], mirrorlong: ['t_mirror', '거울 길이 +30%'], lenshot: ['t_lens', '렌즈 빛 +30%'], bellstun: ['t_bell', '기절 +0.6초'], burn: ['t_beacon', '불길 +35%'],
  chain1: ['t_jar', '번개 +1마리'], link: ['t_prism', '연결마다 +12%'], feed: ['tower', '등대 빛 더 멀리'], refund: ['barrels', '판매 환급 90%'], gift: ['*star', '빛조각 +70'], window: ['house_c', '창문 +3'],
  fryslow: ['e_fry', '잔챙이 속도 −12%'], shield: ['e_crab', '방패 약화'], octo2: ['e_octo', '분열 3 → 2'], fogthin: ['cloud_b', '안개 옅게'], shell: ['e_turtle', '등딱지 약화'], early: ['moon', '미리 부르기 2배'], interest: ['*star', '웨이브마다 +8%'], cheap: ['barrels', '값 −12%'] };
const LAMP = { body: 'M22 62 C30 56 74 56 82 62 L90 57 L95 63 L84 72 C80 84 66 90 62 92 L66 100 L38 100 L42 92 C36 90 24 84 21 72 L8 66 L10 59 Z M45 57 L46 48 L58 47.6 L59 57 Z', flame: 'M52 6 C63 21 67 30 60 40 C57 46 47 46 44 40 C38 30 45 21 52 6 Z' };
const cardIc = k => k === '*star' ? `<svg class="ink" viewBox="0 0 24 24"><path vector-effect="non-scaling-stroke" d="${I.star}"/></svg>` : k === '*lamp' ? `<svg class="ink" viewBox="0 0 104 104"><path vector-effect="non-scaling-stroke" d="${LAMP.body} ${LAMP.flame}"/></svg>` : shapeIc(k, 'ink');

const stage = await createHarbour(frame, SHAPES);
$('#load').remove();

// ---------- state ----------
let game = null, bot = null, playing = false, paused = false, speed = 1, hold = null, menuSlot = -1, tipT = 0, endT = -1, submitted = false, starsPaid = false, hudKey = '';
const TIPS = { 1: '자리를 눌러 거울을 세워요. 등대 곁 자리만 빛을 바로 받아요.', 2: '날치는 뛰는 동안 빛이 닿지 않아요.', 3: '방패게는 정면 빛을 막아요. 옆이나 뒤에서 비춰요.', 4: '문어는 사라지면 셋으로 갈라져요.',
  5: '안개는 종소리로 걷어내요.', 6: '거울만으로는 모자라요. 빛을 이어 프리즘과 렌즈를 켜요.', 7: '거북은 렌즈로 모은 빛이 필요해요.', 15: '큰 고래 그림자가 와요.' };

function startRun(opt = {}) {
  game = new Game({ seed: opt.seed ?? ((Date.now() & 0xffff) + 1), perks: save.perks }); bot = opt.bot ? new PlanBot(game, PLANS[opt.bot], ['link', 'lenshot', 'prism4', 'lamp25', 'shard20', 'chain1', 'burn', 'window', 'gift']) : null;
  stage.reset(game); playing = true; paused = false; speed = 1; endT = -1; submitted = false; starsPaid = false; menuSlot = -1; save.runs++; persist(); audio.setMood('night'); showHud(); showTip(TIPS[1], 12);
}
function reached() { return game ? (game.phase === 'won' || game.phase === 'cards' || game.phase === 'break' ? game.wave : Math.max(0, game.wave - 1)) : 0; }
function bank() { // record the run once: stars, best wave, ranking
  if (!game || submitted) return null; submitted = true;
  const cleared = reached(), stars = cleared >= LAST_WAVE ? Math.max(1, game.stars) : 0, gain = starsPaid ? 0 : Math.max(0, stars - (save.bestStars || 0)) + (cleared >= LAST_WAVE ? 1 : 0);
  if (cleared >= LAST_WAVE) starsPaid = true;
  save.stars += gain; save.bestStars = Math.max(save.bestStars || 0, stars); save.best = Math.max(save.best, cleared); persist();
  const res = { cleared, stars, gain, score: cleared * 100 + Math.max(0, game.windows) };
  if (save.nick && cleared > 0 && !AUTO) net.submitScore(save.pid, save.nick, res.score).then(r => { const el = $('#rankline'); if (el) el.textContent = r ? `오늘 ${r}등` : '순위에 올렸어요'; }).catch(() => { const el = $('#rankline'); if (el) el.textContent = '순위를 올리지 못했어요'; });
  return res;
}

// ---------- screens ----------
const clearUi = () => { ui.replaceChildren(); menuSlot = -1; stage.select(-1); hudKey = ''; };
const onTap = (el, f) => { el.onclick = e => { const t = e.target.closest('[data-a], [data-perk], [data-m]'); if (!t) return; t.blur?.(); audio.unlock(); audio.sfx('tap'); f(t.dataset, t, e); }; };
function showTitle() {
  clearUi(); playing = false; game = null; stage.reset(null); audio.setMood('menu');
  const el = h(`<div class="screen" id="title">${paper('등불지기', '', { tag: 'h1', pin: true })}${paper('항구 마을의 밤을 지켜요', 'sub2', { out: 'sub' })}
    ${btn('밤 시작', 'go', 'big')}
    <div class="row3">${btn(`${ic('star')} 강화 <span class="num">${save.stars}</span>`, 'perk', 'plain')}${btn('순위', 'rank', 'plain')}${btn('설정', 'set', 'plain')}</div>
    ${paper(save.best ? `최고 <span class="num">${save.best}</span> 웨이브` : '열다섯 웨이브를 버티면 동이 터요', 'best')}</div>`);
  onTap(el, d => { if (d.a === 'go') startRun(); else if (d.a === 'perk') showPerks(); else if (d.a === 'rank') showRank(); else if (d.a === 'set') showSettings(); });
  ui.append(el);
}
const topBar = title => `<div class="top">${tab(ic('back'), 'back', '뒤로')}${paper(title, '', { tag: 'h2', out: 'grow' })}<span style="width:50px"></span></div>`;
function showPerks() {
  clearUi();
  const el = h(`<div class="screen veil">${topBar(`강화 ${ic('star')} <span class="num">${save.stars}</span>`)}<div class="body"><h3>별로 사는 영구 강화. 별은 열다섯 웨이브를 넘기면 얻어요.</h3>${PERKS.map(p => { const l = save.perks[p.id] || 0, c = p.cost[l];
    return paper(`<div class="t"><b>${p.name}</b><span>${p.desc}</span><div class="dots">${Array.from({ length: p.max }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('')}</div></div>${l >= p.max ? '<span>최고</span>' : paper(`${ic('star')}<span class="num">${c}</span>`, 'btn', { tag: 'button', attrs: `data-perk="${p.id}" ${save.stars >= c ? '' : 'disabled'}` })}`, 'strip ' + (l >= p.max ? 'done' : ''), { out: 'block' }); }).join('')}</div></div>`);
  onTap(el, d => { if (d.a === 'back') return showTitle(); const p = PERKS.find(x => x.id === d.perk); if (!p) return; const l = save.perks[p.id] || 0; if (l < p.max && save.stars >= p.cost[l]) { save.stars -= p.cost[l]; save.perks[p.id] = l + 1; persist(); audio.sfx('sparkle'); showPerks(); } });
  ui.append(el);
}
function showRank() {
  clearUi();
  const el = h(`<div class="screen veil">${topBar('친구 순위')}<div class="body">
    ${paper(`<div class="t"><b>${esc(save.nick) || '이름 없음'}</b><span>점수는 버틴 웨이브</span></div>${btn('바꾸기', 'nick', 'plain')}`, 'strip', { out: 'block' })}
    <h3>오늘</h3>${paper('<div id="rk-d" class="ranks"><div class="rank"><span>불러오는 중</span></div></div>', 'col', { out: 'block' })}<h3>이번 주</h3>${paper('<div id="rk-w" class="ranks"><div class="rank"><span>불러오는 중</span></div></div>', 'col', { out: 'block' })}</div></div>`);
  onTap(el, d => { if (d.a === 'back') showTitle(); else if (d.a === 'nick') askNick(showRank); });
  ui.append(el);
  const fill = (id, rows, f) => { const d = $(id); if (!d) return; d.innerHTML = rows.length ? rows.map(r => `<div class="rank ${r.nick === save.nick ? 'me' : ''}"><b>${r.rank}</b><span>${esc(r.nick)}</span><em class="num">${f(r)}</em></div>`).join('') : '<div class="rank"><span>아직 아무도 없어요</span></div>'; };
  const fail = id => () => { const d = $(id); if (d) d.innerHTML = '<div class="rank"><span>순위를 불러오지 못했어요</span></div>'; };
  net.dailyTop(20).then(r => fill('#rk-d', r, x => `${Math.floor(x.score / 100)} 웨이브`)).catch(fail('#rk-d')); net.weeklyTop(20).then(r => fill('#rk-w', r, x => `${x.score}`)).catch(fail('#rk-w'));
}
function modal(html, on, cls = '') { const el = h(`<div class="modal ${cls}">${paper(html, 'sheet', { pin: true, out: 'block sheetwrap' })}</div>`); onTap(el, (d, t) => on(d.a, el, t)); el.addEventListener('pointerdown', e => e.stopPropagation()); ui.append(el); return el; }
function askNick(then) { modal(`<h2>등불지기의 이름</h2><p>친구 순위에 보여요</p><input type="text" maxlength="12" value="${esc(save.nick)}" placeholder="이름"><div class="row">${btn('나중에', 'skip', 'plain')}${btn('정하기', 'ok')}</div>`,
  (a, el) => { const v = $('input', el).value.trim().slice(0, 12); if (a === 'ok' && v) save.nick = v; save.asked = true; persist(); el.remove(); then && then(); }); }
function showSettings() {
  const tog = (k, on) => `<button class="tog ${on ? 'on' : ''}" data-a="${k}" aria-label="${k}"></button>`;
  const el = modal(`<h2>설정</h2><div class="setrow"><span>배경음</span>${tog('music', save.set.music)}<input type="range" min="0" max="1" step="0.05" value="${save.set.mv}" data-v="mv"></div>
    <div class="setrow"><span>효과음</span>${tog('sfx', save.set.sfx)}<input type="range" min="0" max="1" step="0.05" value="${save.set.sv}" data-v="sv"></div><p>등불지기 <span class="num">${VERSION}</span></p><div class="row">${btn('닫기', 'ok')}</div>`,
    (a, el, t) => { if (a === 'ok') { el.remove(); return; } save.set[a] = !save.set[a]; t.classList.toggle('on', save.set[a]); persist(); audio.configure(save.set); });
  el.addEventListener('input', e => { const k = e.target.dataset.v; if (k) { save.set[k] = +e.target.value; persist(); audio.configure(save.set); } });
}
function showHud() {
  clearUi();
  const el = h(`<div id="hud"><div class="notes">${paper('', 'note', { pin: true, attrs: 'id="n-wave"' })}${paper('', 'note', { pin: true, attrs: 'id="n-win"' })}${paper('', 'note', { pin: true, attrs: 'id="n-shard"' })}</div>
    <div class="tabs">${tab(ic('note'), 'note', '배경음')}${tab(ic('pause'), 'pause', '멈춤')}</div>
    <div id="tip" class="lift pin hide"><span class="paper"></span></div><div id="menu" class="hide"></div>
    <div class="bottom"><span id="call"></span><span style="flex:1"></span>${paper(ic('slow'), 'tab', { tag: 'button', attrs: 'data-a="spd" id="spd" aria-label="빠르기"' })}
      <button id="flash" data-a="flash" aria-label="섬광"><svg viewBox="0 0 104 112"><defs><clipPath id="fl"><rect id="flr" x="30" y="46" width="44" height="0"/></clipPath></defs><path class="flame-bg" d="${LAMP.flame}"/><path class="flame" clip-path="url(#fl)" d="${LAMP.flame}"/><path class="lampbody" fill-rule="evenodd" d="${LAMP.body}"/></svg><em>섬광</em></button></div>${DEBUG ? '<div id="dbg"></div>' : ''}</div>`);
  onTap(el, (d, t) => { if (!game) return;
    if (d.a === 'note') { save.set.music = !save.set.music; persist(); audio.configure(save.set); } else if (d.a === 'pause') showPause();
    else if (d.a === 'call') game.callWave(); else if (d.a === 'spd') { speed = speed === 1 ? 2 : 1; $('.paper', t).innerHTML = ic(speed === 2 ? 'fast' : 'slow'); $('.paper', t).classList.toggle('on', speed === 2); }
    else if (d.a === 'flash') game.flash(); else if (d.m) menuAct(d.m, d.x); });
  ui.append(el);
}
function showTip(text, sec = 6) { const tip = $('#tip'); if (!tip || !text) return; $('.paper', tip).innerHTML = text; tip.classList.remove('hide'); tip.style.opacity = 1; tip.style.animation = 'none'; void tip.offsetWidth; tip.style.animation = ''; tipT = sec; }
// the round build menu around a spot (Kingdom Rush style): paper tokens
function openMenu(slot) {
  const m = $('#menu'); if (!m || !game) return; menuSlot = slot; stage.select(slot);
  const t = game.tools[slot], p = stage.toScreen(SLOTS[slot].x, 0.3, SLOTS[slot].z), items = [];
  if (!t) for (const k of BUILD_ORDER) items.push({ m: 'build', x: k, ic: shapeIc(TOOL_ICON[k]), cost: game.cost(slot, k), label: BUILDS[k].name });
  else { const B = BUILDS[t.type];
    if (t.lvl < 3) items.push({ m: 'up', x: '', ic: ic('up'), cost: game.cost(slot), label: '올리기' });
    else if (t.lvl === 3) for (const s of B.spec) items.push({ m: 'up', x: s.id, ic: ic('star'), cost: game.cost(slot), label: s.name });
    if (DIRECTED[t.type]) items.push({ m: 'rot', x: '', ic: ic('turn'), label: '돌리기' });
    items.push({ m: 'sell', x: '', ic: ic('sell'), gain: sellValue(t, game.m.refund), label: '팔기' }); }
  const R = items.length > 4 ? 96 : 80, fw = frame.clientWidth, cx = clamp(p.x, R + 40, fw - R - 40), cy = clamp(p.y, R + 150, frame.clientHeight - R - 170);
  m.innerHTML = items.map((it, i) => { const a = -Math.PI / 2 + (i - (items.length - 1) / 2) * (items.length > 4 ? 1.02 : 1.15), x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
    return `<button class="mi lift ${it.cost > game.shards ? 'poor' : ''}" data-m="${it.m}" data-x="${it.x}" style="left:${x}px;top:${y}px" aria-label="${it.label}"><span class="paper">${it.ic}</span><small class="num">${it.cost != null ? it.cost : it.gain != null ? '+' + it.gain : ''}</small><i>${it.label}</i></button>`; }).join('')
    + `<div class="mt lift" style="left:${cx}px;top:${cy + R + 40}px"><span class="paper mtp">${t ? `${BUILDS[t.type].name} <span class="num">${t.lvl}</span>단계${t.spec ? ' ' + BUILDS[t.type].spec.find(s => s.id === t.spec).name : ''}${BUILDS[t.type].optic ? (t.depth ? ` · 연결 <span class="num">${t.depth}</span>` : ' · 빛이 닿지 않아요') : ''}` : '무엇을 세울까요'}</span></div>`;
  m.classList.remove('hide');
}
function closeMenu() { const m = $('#menu'); if (m) m.classList.add('hide'); menuSlot = -1; stage.select(-1); }
function menuAct(kind, x) {
  const s = menuSlot; if (s < 0 || !game) return; let ok = false;
  if (kind === 'build') ok = game.build(s, x, 6); else if (kind === 'up') ok = game.upgrade(s, x || undefined); else if (kind === 'sell') ok = game.sell(s); else if (kind === 'rot') { game.rotate(s, game.tools[s].dir + 1); ok = true; }
  if (!ok) return; audio.sfx('rustle'); if (game.dirty) game.relink();
  for (const e of game.events) stage.onEvent(e, game); game.events.length = 0;
  if (kind === 'sell') closeMenu(); else openMenu(s);
}
function showCards() {
  const c = game.offer; if (!c) return; closeMenu(); $('#tip')?.classList.add('hide'); tipT = 0;
  modal(`<h2>${game.wave}웨이브를 넘겼어요</h2><div class="cards">${c.map((x, i) => { const [k, fx] = CARD_UI[x.id] || ['*star', x.desc]; return paper(`${cardIc(k)}<b>${x.name}</b><span>${fx}</span>`, 'pick', { tag: 'button', attrs: `data-a="${i}"` }); }).join('')}</div>${game.rerolls > 0 ? `<div class="row">${btn(`다시 뽑기 <span class="num">${game.rerolls}</span>`, 're', 'plain')}</div>` : ''}`,
    (a, el) => { if (a === 're') { game.reroll(); el.remove(); showCards(); return; } if (game.pickCard(+a)) { audio.sfx('sparkle'); el.remove(); showTip(TIPS[game.wave + 1] || '다음 웨이브를 준비해요', 7); } }, 'cardmodal');
}
function showPause() {
  if (!playing || paused) return; paused = true;
  modal(`<h2>잠깐 멈춤</h2><p><span class="num">${game.wave}</span>웨이브 · 창문 <span class="num">${game.windows}</span></p><div class="row">${btn('계속', 'go')}</div><div class="row">${btn('설정', 'set', 'plain')}${btn('그만하기', 'quit', 'plain')}</div>`,
    (a, el) => { if (a === 'set') { showSettings(); return; } el.remove(); paused = false; if (a === 'quit') { bank(); showTitle(); } });
}
function showEnd() {
  const won = game.phase === 'won', r = bank() ?? { cleared: reached(), stars: 0, gain: 0, score: 0 }; closeMenu(); for (const m of document.querySelectorAll('.modal')) m.remove();
  const body = won ? `<h2>동이 텄어요</h2><div class="stars">${[1, 2, 3].map(i => ic('star', i <= r.stars ? 'on' : '')).join('')}</div><p>남은 창문 <span class="num">${game.windows}</span>${r.gain ? ` · 별 <span class="num">+${r.gain}</span>` : ''}</p>`
    : `<h2>창문이 모두 꺼졌어요</h2><p><span class="num">${r.cleared}</span>웨이브까지 버텼어요${game.endless ? ' · 폭풍의 밤' : ''}</p>`;
  modal(`${body}<p id="rankline">${save.nick ? (r.cleared ? '순위 올리는 중' : '') : '이름을 정하면 순위에 올라가요'}</p><div class="row">${btn('처음으로', 'home', 'plain')}${won ? btn('폭풍의 밤', 'storm') : btn('다시', 'again')}</div>`,
    (a, el) => { el.remove();
      if (a === 'storm') { submitted = false; playing = true; endT = -1; stage.st.dawnTarget = 0; game.continueEndless(); audio.setMood('night'); showCards(); return; }
      const go = () => (a === 'again' ? startRun() : showTitle());
      if (!save.asked) askNick(() => { if (save.nick && r.cleared && !AUTO) net.submitScore(save.pid, save.nick, r.score).catch(() => {}); go(); }); else go(); });
}
function updateHud(dt) {
  const hud = $('#hud'); if (!hud || !game) return;
  const key = [game.wave, game.windows, game.shards, game.phase, Math.ceil(game.breakT), game.endless].join();
  if (key !== hudKey) { hudKey = key;   // only touch the paper notes when a number changes
    const set = (id, html) => { const n = $(id + ' .paper'); if (n.innerHTML !== html) { n.innerHTML = html; n.parentElement.classList.remove('bump'); void n.offsetWidth; n.parentElement.classList.add('bump'); } };
    set('#n-wave', `${moonIc(Math.max(1, game.wave) / LAST_WAVE)}<span class="lbl">웨이브</span><span class="num">${Math.max(1, game.wave)}</span>${game.endless ? '' : ` / <span class="num">${LAST_WAVE}</span>`}`);
    set('#n-win', `${ic('house')}<span class="lbl">창문</span><span class="num">${game.windows}</span>`); set('#n-shard', `${ic('star')}<span class="lbl">빛조각</span><span class="num">${game.shards}</span>`);
    const call = $('#call'), want = game.phase === 'break' ? (game.wave === 0 ? '첫 웨이브 부르기' : `다음 웨이브 ${ic('star')}<span class="num">+${Math.round(Math.max(0, game.breakT) * 2.5 * game.m.early)}</span>`) : '';
    if (call.dataset.t !== want) { call.dataset.t = want; call.innerHTML = want ? btn(want, 'call', 'plain') : ''; }
    if (menuSlot >= 0) for (const b of hud.querySelectorAll('.mi')) { const c = b.dataset.m === 'build' ? game.cost(menuSlot, b.dataset.x) : b.dataset.m === 'up' ? game.cost(menuSlot) : 0; b.classList.toggle('poor', c > game.shards); } }
  const fb = $('#flash'); $('#flr').setAttribute('y', (46 - 40 * game.charge).toFixed(1)); $('#flr').setAttribute('height', (40 * game.charge).toFixed(1)); fb.classList.toggle('ready', game.canFlash());
  $('[data-a=note]', hud).style.opacity = save.set.music ? 1 : 0.5;
  if (tipT > 0) { tipT -= dt; const tip = $('#tip'); if (tipT <= 0) tip.classList.add('hide'); else tip.style.opacity = Math.min(1, tipT); }
  if (DEBUG) { const i = stage.info(); $('#dbg').textContent = `적 ${game.enemies.length} · ${Math.round(i.fps)}fps · 해상도 ${i.pixelRatio.toFixed(2)} · 호출 ${i.calls}`; }
}

// ---------- input on the stage: drag steers the beam, a tap on a spot opens its menu (flash is the lamp button only) ----------
frame.addEventListener('pointerdown', e => {
  if (!playing || paused || !game || e.target.closest('button, .modal')) return; audio.unlock();
  const slot = stage.slotAt(e.clientX, e.clientY, game);
  if (menuSlot >= 0 && slot !== menuSlot) { closeMenu(); if (slot < 0) return; }
  if (slot >= 0) hold = { slot, x: e.clientX, y: e.clientY, moved: false };
  else { const p = stage.pickGround(e.clientX, e.clientY); if (p) { game.setAim(p.x, p.z); hold = { aim: true, x: e.clientX, y: e.clientY }; } }
  try { frame.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
});
frame.addEventListener('pointermove', e => {
  if (!hold || !game) return; const far = Math.hypot(e.clientX - hold.x, e.clientY - hold.y);
  if (hold.aim) { const p = stage.pickGround(e.clientX, e.clientY); if (p) game.setAim(p.x, p.z); }
  else if (far > 16 && game.tools[hold.slot] && DIRECTED[game.tools[hold.slot].type]) { const p = stage.pickGround(e.clientX, e.clientY), s = SLOTS[hold.slot]; if (p) { game.rotate(hold.slot, Math.round(Math.atan2(p.z - s.z, p.x - s.x) / (Math.PI / 4))); hold.moved = true; if (menuSlot >= 0) closeMenu(); } }
});
const endHold = () => { if (!hold || !game) { hold = null; return; }
  if (hold.aim) game.releaseAim();
  else if (!hold.moved && !paused && game.phase !== 'cards' && !$('.modal')) { if (menuSlot === hold.slot) closeMenu(); else { openMenu(hold.slot); audio.sfx('tap'); } }
  hold = null; };
frame.addEventListener('pointerup', endHold); frame.addEventListener('pointercancel', endHold);
addEventListener('keydown', e => { if (e.key === ' ' && playing && game && !paused) { e.preventDefault(); game.flash(); } if (e.key === 'Escape') showPause(); });
document.addEventListener('visibilitychange', () => { audio.background(document.hidden); if (document.hidden && playing && !paused && !AUTO) showPause(); });

// ---------- loop ----------
let popT = 0;
function advance(dt) {
  if (stage.st.freeze > 0 || !game) return;
  bot?.step(); game.step(dt);
  for (const e of game.events) { stage.onEvent(e, game);
    if (e.type === 'kill') { if (performance.now() - popT > 45) { popT = performance.now(); audio.sfx('pop'); } } else if (e.type === 'flash') audio.sfx('flash'); else if (e.type === 'leak') audio.sfx('snuff');
    else if (e.type === 'bell') audio.sfx('bell'); else if (e.type === 'zap') audio.sfx('zap'); else if (e.type === 'won') audio.sfx('win'); else if (e.type === 'lost') audio.sfx('lose');
    else if (e.type === 'wave' && TIPS[e.n] && e.n > 1) showTip(TIPS[e.n], 7);
    else if (e.type === 'bonus') audio.sfx('sparkle'); else if (e.type === 'cleared') audio.sfx('sparkle'); }
  game.events.length = 0;
  if (game.phase === 'cards' && !$('.cardmodal') && !bot) showCards();
  if (game.done && endT < 0 && playing) endT = game.phase === 'won' ? 3.4 : 2.2;
}
let last = performance.now();
function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (playing && game && !paused) {
    for (let i = 0; i < speed; i++) advance(dt);
    if (endT > 0) { endT -= dt; if (endT <= 0) { endT = -1; playing = false; audio.setMood(game.phase === 'won' ? 'menu' : 'hush'); showEnd(); } }
    updateHud(dt);
  }
  // the stage is drawn every frame, paused or not: a sheet over the stage never blanks it
  stage.frame(paused ? 0 : dt * (playing ? speed : 1), playing || (game && game.done) ? game : null, dt);
  requestAnimationFrame(tick);
}

// ---------- new version note + PWA ----------
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').then(reg => {
    const offer = w => { if (!w || $('#update')) return; const b = h(paper('새 버전이 있어요. 눌러서 새로 고침', 'btn', { tag: 'button', pin: true, attrs: 'id="update"' })); b.onclick = () => w.postMessage('skip'); frame.append(b); };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => { const w = reg.installing; w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); }); });
    setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
  }).catch(() => {});
  const hadWorker = !!navigator.serviceWorker.controller; let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadWorker && !reloaded) { reloaded = true; location.reload(); } });
}

// ---------- test hooks ----------
const probe = document.createElement('canvas'); probe.width = 36; probe.height = 64; const pctx = probe.getContext('2d', { willReadFrequently: true });
function luma() { if (stage.st.probe) return stage.st.luma; pctx.drawImage(stage.canvas, 0, 0, 36, 64); const d = pctx.getImageData(0, 0, 36, 64).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; return s / (d.length / 4) / 255; }
window.__ll = {
  get game() { return game; }, get save() { return save; }, get stage() { return stage; }, start: o => startRun(o), title: () => showTitle(), open: s => openMenu(s),
  run(seconds, step = 1 / 30) { let n = 0; for (let t = 0; t < seconds && game && !game.done; t += step) { stage.st.freeze = 0; advance(step); if (++n % 15 === 0) stage.frame(step, game); } stage.frame(step, game); updateHud(0); return game ? { phase: game.phase, wave: game.wave, windows: game.windows, shards: game.shards, alive: game.enemies.length } : null; },
  frame: (dt = 1 / 30) => stage.frame(dt, game),
  luma,
  finish() { if (game && game.done && playing) { playing = false; showEnd(); } },
  bench(n = 60) { const t0 = performance.now(); for (let i = 0; i < n; i++) { stage.st.freeze = 0; advance(1 / 60); stage.frame(1 / 60, game); } const ms = (performance.now() - t0) / n; return { msPerFrame: +ms.toFixed(2), fps: Math.round(1000 / ms), alive: game ? game.enemies.length : 0, ...stage.info() }; },
  // "record" game time frame by frame and measure the picture: mean brightness of every frame, and how many
  // frames jump against the one before. While it runs it also changes the render resolution, pauses and opens a card sheet.
  flicker(seconds = 30, fps = 30) {
    stage.st.probe = true; const N = Math.round(seconds * fps), dt = 1 / fps, L = [], blackAt = []; let spikes = 0, maxD = 0, black = 0, worst = -1;
    for (let i = 0; i < N; i++) {
      if (i === Math.round(N * 0.25)) stage.setScale(0.7); if (i === Math.round(N * 0.45)) stage.setScale(0.55); if (i === Math.round(N * 0.6)) stage.setScale(1);
      const frozen = (i > N * 0.3 && i < N * 0.36) || (game && game.phase === 'cards');          // a pause, and any card sheet: the picture must hold
      if (i === Math.round(N * 0.3)) showPause(); if (i === Math.round(N * 0.36)) { for (const m of document.querySelectorAll('.modal')) m.remove(); paused = false; }
      if (game && game.phase === 'cards' && i % 20 === 0) { if (!$('.cardmodal')) showCards(); else { game.pickCard(0); $('.cardmodal')?.remove(); } }
      if (!frozen && game && !game.done) { stage.st.freeze = 0; advance(dt); }
      stage.frame(frozen ? 0 : dt, game, dt); const l = luma(); L.push(l);
      if (l < 0.004) { black++; if (blackAt.length < 24) blackAt.push(i); }
      if (i > 0) { const d = Math.abs(l - L[i - 1]); if (d > maxD) { maxD = d; worst = i; } if (d > 0.04 && d > L[i - 1] * 0.3) spikes++; }
    }
    return { frames: N, spikes, black, blackAt, maxDelta: +maxD.toFixed(4), worstFrame: worst, meanLuma: +(L.reduce((a, b) => a + b, 0) / N).toFixed(3), minLuma: +Math.min(...L).toFixed(4), wave: game ? game.wave : 0 };
  },
};
showTitle();
requestAnimationFrame(tick);
