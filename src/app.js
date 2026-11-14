// 등불지기 (Lamplighter) 3.0 — boot, screens, input and the loop for the harbour night.
// Every piece of interface is cut paper pinned over the stage: no glyph symbols, icons are drawn as silhouettes.
import { Game, Bot, TOWERS, TOWER_ORDER, towerStat, SLOTS, LAST_WAVE, PERKS as PERK_DEF, perkCost, SKILLS, starsFor, sellValue, clamp } from './game.js';
import { createHarbour } from './harbour.js';
import { createStage } from './stage.js';
import * as audio from './audio.js';
import * as net from './net.js';

export const VERSION = '3.1.0';
const Q = new URLSearchParams(location.search), DEBUG = Q.has('debug'), AUTO = Q.has('auto');
const $ = (s, el = document) => el.querySelector(s), ui = $('#ui'), frame = $('#frame');
const h = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const KEY = AUTO ? 'lamplighter.v3.auto' : 'lamplighter.v3';
const fresh = () => ({ v: 3, stars: 0, perks: {}, best: 0, bestStars: 0, runs: 0, nick: '', asked: false, pid: (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)), set: { music: true, sfx: true, mv: 0.6, sv: 0.8 } });
let save = fresh();
try { const d = JSON.parse(localStorage.getItem(KEY));
  if (d && d.v === 3 && !AUTO) save = Object.assign(fresh(), d, { set: Object.assign(fresh().set, d.set) });
  else if (!AUTO) { const o = JSON.parse(localStorage.getItem('lamplighter.v2')); if (o) Object.assign(save, { nick: o.nick || '', pid: o.pid || save.pid, asked: !!o.asked, set: Object.assign(save.set, o.set) }); }   // 2.0 saves: keep the name and settings, the old upgrades no longer exist
} catch (e) { /* first run */ }
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* private mode */ } };
audio.configure(save.set);
const PERKS = Object.entries(PERK_DEF).map(([id, p]) => ({ id, ...p, cost: Array.from({ length: p.max }, (_, i) => perkCost(i)) }));

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
  check: 'M3.6 12.6 L9.4 18.6 L20.8 5.6 L18 3.4 L9.2 13.4 L6.2 10.2 Z', flag: 'M5.6 3 L8 3.2 L8.2 21 L5.8 21 Z M8 4 L19.4 7.6 L8.1 11.8 Z',
  fast: 'M4 5 L12 12 L4.3 19 Z M12.5 5.2 L20.5 12 L12.4 19 Z', slow: 'M7 5 L17 12 L7.3 19 Z',
};
const ic = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="${I[name]}"/></svg>`;
const shapeIc = (name, cls = 'ic') => { const S = SHAPES[name]; return `<svg class="${cls}" viewBox="-12 -12 ${S.w + 24} ${S.h + 24}" aria-hidden="true"><path fill-rule="evenodd" vector-effect="non-scaling-stroke" d="${S.d}"/></svg>`; };
const moonIc = f => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><defs><mask id="mm"><circle cx="12" cy="12" r="9.6" fill="#fff"/><circle cx="${(4.5 + 17 * clamp(f)).toFixed(1)}" cy="10.5" r="9.6" fill="#000"/></mask></defs><path mask="url(#mm)" d="M12 2.3 L16 3.3 L19.6 6 L21.6 10.4 L21.2 14.6 L18.8 18.6 L14.6 21.3 L10 21.6 L5.8 19.6 L3 15.8 L2.3 11.4 L3.8 7 L7.4 3.6 Z"/></svg>`;
// a piece of cut paper: the outer element carries the shadow and the pin, the inner one the ragged edge
const paper = (inner, cls = '', o = {}) => `<${o.tag || 'div'} class="lift ${o.pin ? 'pin' : ''} ${o.out || ''}" ${o.attrs || ''}><span class="paper ${cls}">${inner}</span></${o.tag || 'div'}>`;
const btn = (label, a, cls = '', extra = '') => paper(label, 'btn ' + cls, { tag: 'button', attrs: `data-a="${a}" ${extra}` });
const tab = (inner, a, label) => paper(inner, 'tab', { tag: 'button', attrs: `data-a="${a}" aria-label="${label}"` });
const TOOL_ICON = { archer: 'tw_archer', barracks: 'hut', lens: 'tw_lens', beacon: 'tw_beacon' };
const LAMP = { body: 'M22 62 C30 56 74 56 82 62 L90 57 L95 63 L84 72 C80 84 66 90 62 92 L66 100 L38 100 L42 92 C36 90 24 84 21 72 L8 66 L10 59 Z M45 57 L46 48 L58 47.6 L59 57 Z', flame: 'M52 6 C63 21 67 30 60 40 C57 46 47 46 44 40 C38 30 45 21 52 6 Z' };
const lampIc = `<svg class="ic" viewBox="0 0 104 104" aria-hidden="true"><path fill-rule="evenodd" d="${LAMP.body} ${LAMP.flame}"/></svg>`;

const LOOKDEV = Q.has('lookdev');   // DESIGN.md stage 1: the folded-paper board as a still picture, nothing wired to the rules yet
const stage = LOOKDEV ? await createStage(frame, SHAPES) : await createHarbour(frame, SHAPES);
$('#load').remove();

// ---------- state ----------
let game = null, bot = null, playing = false, paused = false, speed = 1, menuSlot = -1, pending = '', aiming = '', rallySlot = -1, heroSelT = 0, tipT = 0, endT = -1, submitted = false, hudKey = '';
const TIPS = { 1: '빛나는 자리를 눌러 탑을 세워요.', 2: '땅을 누르면 등대지기가 그리로 가요.', 3: '방패게는 화살이 잘 안 들어요. 렌즈탑으로 비춰요.', 4: '갈매기 그림자는 궁수탑만 맞혀요.',
  5: '문어는 쓰러지면 셋으로 갈라져요.', 6: '거북은 단단해요. 길을 막고 렌즈로 비춰요.', 15: '큰 고래 그림자가 와요.' };

function startRun(opt = {}) {
  const seed = opt.seed ?? ((Date.now() & 0xffff) + 1);
  game = new Game({ seed, perks: save.perks }); bot = opt.bot ? new Bot(game, opt.bot, seed) : null;
  stage.reset(game); playing = true; paused = false; speed = 1; endT = -1; submitted = false; menuSlot = -1; pending = ''; aiming = ''; rallySlot = -1; save.runs++; persist(); audio.setMood('night'); showHud(); showTip(TIPS[1], 14);
}
function reached() { return game ? (game.phase === 'won' ? LAST_WAVE : Math.max(0, game.wave - 1)) : 0; }
function bank() { // record the run once: stars (earned again every night that is held), best wave, ranking
  if (!game || submitted) return null; submitted = true;
  const cleared = reached(), stars = game.phase === 'won' ? starsFor(game.windows) : 0;
  if (bot) return { cleared, stars, gain: 0, score: 0 };   // a scripted demo run earns nothing
  save.stars += stars; save.bestStars = Math.max(save.bestStars || 0, stars); save.best = Math.max(save.best, cleared); persist();
  const res = { cleared, stars, gain: stars, score: cleared * 100 + Math.max(0, game.windows) };
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
  const el = h(`<div class="screen veil">${topBar(`강화 ${ic('star')} <span class="num">${save.stars}</span>`)}<div class="body"><h3>별로 사는 영구 강화. 밤을 지켜 낼 때마다 별을 얻어요(창문 18개 이상이면 셋).</h3>${PERKS.map(p => { const l = save.perks[p.id] || 0, c = p.cost[l];
    return paper(`<div class="t"><b>${p.name}</b><span>${p.desc}</span><div class="dots">${Array.from({ length: p.max }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('')}</div></div>${l >= p.max ? '<span>최고</span>' : paper(`${ic('star')}<span class="num">${c}</span>`, 'btn', { tag: 'button', attrs: `data-perk="${p.id}" ${save.stars >= c ? '' : 'disabled'}` })}`, 'strip ' + (l >= p.max ? 'done' : ''), { out: 'block' }); }).join('')}</div></div>`);
  onTap(el, d => { if (d.a === 'back') return showTitle(); const p = PERKS.find(x => x.id === d.perk); if (!p) return; const l = save.perks[p.id] || 0; if (l < p.max && save.stars >= p.cost[l]) { save.stars -= p.cost[l]; save.perks[p.id] = l + 1; persist(); audio.sfx('sparkle'); showPerks(); } });
  ui.append(el);
}
function showRank() {
  clearUi();
  const el = h(`<div class="screen veil">${topBar('친구 순위')}<div class="body">
    ${paper(`<div class="t"><b>${esc(save.nick) || '이름 없음'}</b><span>점수는 넘긴 웨이브와 남은 창문</span></div>${btn('바꾸기', 'nick', 'plain')}`, 'strip', { out: 'block' })}
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
const skillBtn = (a, icon, label) => `<button class="sk lift" data-a="${a}" id="sk-${a}" aria-label="${label}"><span class="paper">${icon}<i class="veil2"></i></span><em>${label}</em></button>`;
function showHud() {
  clearUi();
  const el = h(`<div id="hud"><div class="notes">${paper('', 'note', { pin: true, attrs: 'id="n-wave"' })}${paper('', 'note', { pin: true, attrs: 'id="n-win"' })}${paper('', 'note', { pin: true, attrs: 'id="n-shard"' })}</div>
    <div class="tabs">${tab(ic('note'), 'note', '배경음')}${tab(ic('pause'), 'pause', '멈춤')}</div>
    <div id="tip" class="lift pin hide"><span class="paper"></span></div><div id="menu" class="hide"></div>
    <div class="bottom">${skillBtn('hero', shapeIc('keeper'), '등대지기')}${skillBtn('flash', lampIc, '섬광')}${skillBtn('rein', shapeIc('guard'), '지원군')}<span style="flex:1"></span><span id="call"></span>${paper(ic('slow'), 'tab', { tag: 'button', attrs: 'data-a="spd" id="spd" aria-label="빠르기"' })}</div>${DEBUG ? '<div id="dbg"></div>' : ''}</div>`);
  onTap(el, (d, t) => { if (!game) return;
    if (d.a === 'note') { save.set.music = !save.set.music; persist(); audio.configure(save.set); } else if (d.a === 'pause') showPause();
    else if (d.a === 'call') game.callWave(); else if (d.a === 'spd') { speed = speed === 1 ? 2 : 1; $('.paper', t).innerHTML = ic(speed === 2 ? 'fast' : 'slow'); $('.paper', t).classList.toggle('on', speed === 2); }
    else if (d.a === 'hero') { heroSelT = 3; if (!game.heroSkill()) showTip(game.hero.dead ? '등대지기가 곧 돌아와요.' : '등불 휘두르기는 아직 준비 중이에요.', 3); }
    else if (d.a === 'flash' || d.a === 'rein') aim(aiming === d.a ? '' : d.a);
    else if (d.m) menuAct(d.m, d.x); });
  ui.append(el);
}
function showTip(text, sec = 6) { const tip = $('#tip'); if (!tip || !text) return; $('.paper', tip).innerHTML = text; tip.classList.remove('hide'); tip.style.opacity = 1; tip.style.animation = 'none'; void tip.offsetWidth; tip.style.animation = ''; tipT = sec; }
function hideTip() { tipT = 0; $('#tip')?.classList.add('hide'); }
// a spell is armed with its button, then thrown with a tap on the ground
function aim(k) { if (k && game.cd[k] > 0) { showTip('아직 준비 중이에요.', 3); return; } rallySlot = -1; stage.range(null); if (k) closeMenu(); aiming = k; for (const a of ['flash', 'rein']) $('#sk-' + a)?.classList.toggle('on', a === k); if (k) showTip(k === 'flash' ? '터뜨릴 곳을 눌러요.' : '주민을 부를 곳을 눌러요.', 6); else hideTip(); }
// the round menu around a build spot: the first tap on a token shows what it does and its reach, the second confirms
function openMenu(slot) {
  const m = $('#menu'); if (!m || !game) return; if (menuSlot !== slot) pending = ''; if (aiming) aim(''); menuSlot = slot; stage.select(slot);
  const t = game.tools[slot], S = SLOTS[slot], p = stage.toScreen(S.x, 0.3, S.z), items = [];
  if (!t) for (const k of TOWER_ORDER) items.push({ m: 'build', x: k, ic: shapeIc(TOOL_ICON[k]), cost: game.cost(slot, k), label: TOWERS[k].name, info: `${TOWERS[k].name} · ${TOWERS[k].hint}`, range: k === 'barracks' ? TOWERS.barracks.range : TOWERS[k].lv[0].range });
  else { const T = TOWERS[t.type];
    if (t.lvl < 3) items.push({ m: 'up', x: '', ic: ic('up'), cost: game.cost(slot), label: '올리기', info: `${T.name} <span class="num">${t.lvl + 1}</span>단계로`, range: T.lv[t.lvl].range });
    else if (t.lvl === 3) for (const [id, s] of Object.entries(T.spec)) items.push({ m: 'up', x: id, ic: ic('star'), cost: game.cost(slot), label: s.name, info: `${s.name} · ${s.desc}`, range: s.range });
    if (t.type === 'barracks') items.push({ m: 'rally', x: '', ic: ic('flag'), label: '모일 곳' });
    items.push({ m: 'sell', x: '', ic: ic('sell'), gain: sellValue(t), label: '팔기', info: `팔면 빛조각 <span class="num">+${sellValue(t)}</span>` }); }
  const cur = t ? (t.type === 'barracks' ? TOWERS.barracks.range : towerStat(t).range) : 0, pick = items.find(it => it.m + ':' + it.x === pending), r = (pick && pick.range) || cur;
  stage.range(r ? { x: S.x, z: S.z, r } : null);
  const R = 82, fw = frame.clientWidth, cx = clamp(p.x, R + 40, fw - R - 40), cy = clamp(p.y, R + 110, frame.clientHeight - R - 190);
  m.innerHTML = items.map((it, i) => { const a = -Math.PI / 2 + (i - (items.length - 1) / 2) * 1.15, x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R, sel = pick === it;
    return `<button class="mi lift ${it.cost > game.shards ? 'poor' : ''} ${sel ? 'sel' : ''}" data-m="${it.m}" data-x="${it.x}" style="left:${x}px;top:${y}px" aria-label="${it.label}"><span class="paper">${sel ? ic('check') : it.ic}</span><small class="num">${it.cost != null ? it.cost : it.gain != null ? '+' + it.gain : ''}</small><i>${it.label}</i></button>`; }).join('')
    + `<div class="mt lift" style="left:${cx}px;top:${cy + R + 44}px"><span class="paper mtp">${pick ? pick.info : t ? `${TOWERS[t.type].name} ${t.lvl < 4 ? `<span class="num">${t.lvl}</span>단계` : TOWERS[t.type].spec[t.spec].name}` : '무엇을 세울까요'}</span></div>`;
  m.classList.remove('hide');
}
function closeMenu() { const m = $('#menu'); if (m) m.classList.add('hide'); menuSlot = -1; pending = ''; stage.select(-1); if (rallySlot < 0) stage.range(null); }
function menuAct(kind, x) {
  const s = menuSlot; if (s < 0 || !game) return; const key = kind + ':' + (x || '');
  if (kind === 'rally') { closeMenu(); rallySlot = s; stage.range({ x: SLOTS[s].x, z: SLOTS[s].z, r: TOWERS.barracks.range }); showTip('등잔병이 모일 곳을 눌러요.', 6); return; }
  if (pending !== key) { pending = key; openMenu(s); return; }
  const ok = kind === 'build' ? game.build(s, x) : kind === 'up' ? game.upgrade(s, x || undefined) : game.sell(s); pending = '';
  if (!ok) { openMenu(s); showTip('빛조각이 모자라요.', 3); return; } audio.sfx('rustle');
  for (const e of game.events) stage.onEvent(e, game); game.events.length = 0; closeMenu();
}
function showPause() {
  if (!playing || paused) return; paused = true;
  modal(`<h2>잠깐 멈춤</h2><p><span class="num">${game.wave}</span>웨이브 · 창문 <span class="num">${game.windows}</span></p><div class="row">${btn('계속', 'go')}</div><div class="row">${btn('설정', 'set', 'plain')}${btn('그만하기', 'quit', 'plain')}</div>`,
    (a, el) => { if (a === 'set') { showSettings(); return; } el.remove(); paused = false; if (a === 'quit') { bank(); showTitle(); } });
}
function showEnd() {
  const won = game.phase === 'won', r = bank() ?? { cleared: reached(), stars: 0, gain: 0, score: 0 }; closeMenu(); hideTip(); for (const m of document.querySelectorAll('.modal')) m.remove();
  const body = won ? `<h2>동이 텄어요</h2><div class="stars">${[1, 2, 3].map(i => ic('star', i <= r.stars ? 'on' : '')).join('')}</div><p>남은 창문 <span class="num">${game.windows}</span> · 별 <span class="num">+${r.gain}</span></p>`
    : `<h2>창문이 모두 꺼졌어요</h2><p><span class="num">${r.cleared}</span>웨이브까지 버텼어요</p>`;
  modal(`${body}<p id="rankline">${save.nick ? (r.cleared ? '순위 올리는 중' : '') : '이름을 정하면 순위에 올라가요'}</p><div class="row">${btn('처음으로', 'home', 'plain')}${btn('다시', 'again')}</div>`,
    (a, el) => { el.remove(); const go = () => (a === 'again' ? startRun() : showTitle());
      if (!save.asked) askNick(() => { if (save.nick && r.cleared && !AUTO) net.submitScore(save.pid, save.nick, r.score).catch(() => {}); go(); }); else go(); });
}
function updateHud(dt) {
  const hud = $('#hud'); if (!hud || !game) return;
  const key = [game.wave, game.windows, game.shards, game.phase, Math.round(Math.max(0, game.breakT) * 1.5)].join();
  if (key !== hudKey) { hudKey = key;   // only touch the paper notes when a number changes
    const set = (id, html) => { const n = $(id + ' .paper'); if (n.innerHTML !== html) { n.innerHTML = html; n.parentElement.classList.remove('bump'); void n.offsetWidth; n.parentElement.classList.add('bump'); } };
    set('#n-wave', `${moonIc(Math.max(1, game.wave) / LAST_WAVE)}<span class="lbl">웨이브</span><span class="num">${Math.max(1, game.wave)}</span> / <span class="num">${LAST_WAVE}</span>`);
    set('#n-win', `${ic('house')}<span class="lbl">창문</span><span class="num">${game.windows}</span>`); set('#n-shard', `${ic('star')}<span class="lbl">빛조각</span><span class="num">${game.shards}</span>`);
    const call = $('#call'), want = game.phase === 'break' ? (game.wave === 0 ? '웨이브 시작' : `다음 ${ic('star')}<span class="num">+${Math.round(Math.max(0, game.breakT) * 1.5)}</span>`) : '';
    if (call.dataset.t !== want) { call.dataset.t = want; call.innerHTML = want ? btn(want, 'call', game.wave === 0 ? '' : 'plain') : ''; }
    if (menuSlot >= 0) for (const b of hud.querySelectorAll('.mi')) { const c = b.dataset.m === 'build' ? game.cost(menuSlot, b.dataset.x) : b.dataset.m === 'up' ? game.cost(menuSlot) : 0; b.classList.toggle('poor', c > game.shards); } }
  const veil = (id, k) => { const b = $(id); if (b) { $('.veil2', b).style.height = (clamp(k) * 100).toFixed(0) + '%'; b.classList.toggle('ready', k <= 0); } };
  veil('#sk-flash', game.cd.flash / (SKILLS.flash.cd * game.m.skill)); veil('#sk-rein', game.cd.rein / (SKILLS.rein.cd * game.m.skill)); veil('#sk-hero', game.hero.dead ? 1 : game.cd.hero / SKILLS.hero.cd);
  const hb = $('#sk-hero'); hb.classList.toggle('down', game.hero.dead); hb.style.setProperty('--hp', clamp(game.hero.hp / game.hero.max).toFixed(2));
  if (heroSelT > 0) heroSelT -= dt; stage.heroSel(heroSelT > 0 || game.hero.walking); $('#sk-hero').classList.toggle('on', heroSelT > 0);
  $('[data-a=note]', hud).style.opacity = save.set.music ? 1 : 0.5;
  if (tipT > 0) { tipT -= dt; const tip = $('#tip'); if (tipT <= 0) tip.classList.add('hide'); else tip.style.opacity = Math.min(1, tipT); }
  if (DEBUG) { const i = stage.info(); $('#dbg').textContent = `적 ${game.enemies.length} · ${Math.round(i.fps)}fps · 해상도 ${i.pixelRatio.toFixed(2)} · 호출 ${i.calls}`; }
}

// ---------- input on the stage: a tap on a spot opens its menu, a tap on open ground sends the keeper there ----------
frame.addEventListener('pointerdown', e => {
  if (!playing || paused || !game || game.done || e.target.closest('button, .modal')) return; audio.unlock();
  const p = stage.pickGround(e.clientX, e.clientY);
  if (aiming) { if (p) { if (aiming === 'flash') game.flash(p.x, p.z); else game.reinforce(p.x, p.z); } aim(''); return; }
  if (rallySlot >= 0) { if (p) game.setRally(rallySlot, p.x, p.z); rallySlot = -1; stage.range(null); hideTip(); return; }
  const slot = stage.slotAt(e.clientX, e.clientY, game);
  if (menuSlot >= 0) { const was = menuSlot; closeMenu(); if (slot < 0 || slot === was) return; }
  if (stage.heroAt(e.clientX, e.clientY, game)) { heroSelT = 5; audio.sfx('tap'); showTip('등대지기가 갈 곳을 눌러요.', 4); return; }   // picking the keeper: an amber ring under his feet
  if (slot >= 0) { openMenu(slot); audio.sfx('tap'); return; }
  if (p && game.moveHero(p.x, p.z) && (heroSelT = 1.5)) stage.onEvent({ type: 'go', x: game.hero.home.x, z: game.hero.home.z }, game);
});
addEventListener('keydown', e => { if (e.key === 'Escape') showPause(); });
document.addEventListener('visibilitychange', () => { audio.background(document.hidden); if (document.hidden && playing && !paused && !AUTO) showPause(); });

// ---------- loop ----------
let popT = 0;
function advance(dt) {
  if (stage.st.freeze > 0 || !game) return;
  bot?.step(dt); game.step(dt);
  for (const e of game.events) { stage.onEvent(e, game);
    if (e.type === 'kill' || e.type === 'boom') { if (performance.now() - popT > 45) { popT = performance.now(); audio.sfx('pop'); } } else if (e.type === 'flash') audio.sfx('flash'); else if (e.type === 'leak' || e.type === 'heroDown') audio.sfx('snuff');
    else if (e.type === 'hskill') audio.sfx('bell'); else if (e.type === 'reinforce') audio.sfx('rustle'); else if (e.type === 'won') audio.sfx('win'); else if (e.type === 'lost') audio.sfx('lose');
    else if (e.type === 'wave') { if (TIPS[e.n] && e.n > 1) showTip(TIPS[e.n], 7); else if (e.n === 1) hideTip(); }
    else if (e.type === 'bonus' || e.type === 'heroUp') audio.sfx('sparkle'); }
  game.events.length = 0;
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
      const frozen = i > N * 0.3 && i < N * 0.36;          // a pause, and any card sheet: the picture must hold
      if (i === Math.round(N * 0.3)) showPause(); if (i === Math.round(N * 0.36)) { for (const m of document.querySelectorAll('.modal')) m.remove(); paused = false; }
      if (!frozen && game && !game.done) { stage.st.freeze = 0; advance(dt); }
      stage.frame(frozen ? 0 : dt, game, dt); const l = luma(); L.push(l);
      if (l < 0.004) { black++; if (blackAt.length < 24) blackAt.push(i); }
      if (i > 0) { const d = Math.abs(l - L[i - 1]); if (d > maxD) { maxD = d; worst = i; } if (d > 0.04 && d > L[i - 1] * 0.3) spikes++; }
    }
    stage.st.probe = false;
    return { frames: N, spikes, black, blackAt, maxDelta: +maxD.toFixed(4), worstFrame: worst, meanLuma: +(L.reduce((a, b) => a + b, 0) / N).toFixed(3), minLuma: +Math.min(...L).toFixed(4), wave: game ? game.wave : 0 };
  },
};
showTitle();
if (LOOKDEV) { game = new Game({ seed: 1, perks: {} }); game.shards = 900; for (const [s, t] of [[4, 'archer'], [1, 'barracks'], [2, 'lens'], [5, 'beacon']]) game.build(s, t);
  Object.assign(game, { shards: 285, wave: 3, phase: 'wave', windows: 18 }); game.events.length = 0; game.cd.rein = 9; game.hero.hp = game.hero.max * 0.9; playing = true; paused = true; showHud(); updateHud(0); hideTip(); }
// ?shot=N (tools/artcheck): a scripted night played up to wave N, then held still with the interface hidden, for a picture of the stage alone
if (Q.has('shot')) { const want = +Q.get('shot') || 6; document.body.classList.add('shot'); startRun({ bot: 'smart', seed: 3 }); stage.st.hold = true; stage.setScale(1);
  for (let t = 0; t < 900 && !game.done && !(game.wave >= want && game.enemies.length >= 6 && game.enemies.some(e => e.z < 2)); t += 0.5) { for (let i = 0; i < 15; i++) advance(1 / 30); stage.frame(0.5, game); }
  for (let i = 0; i < 40; i++) stage.frame(1 / 30, game);
  paused = true; }
requestAnimationFrame(tick);
