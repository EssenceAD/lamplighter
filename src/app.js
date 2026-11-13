// 등불지기 (Lamplighter) 2.0 — boot, screens, input and the loop for the harbour night.
import { Game, PlanBot, PLANS, BUILDS, BUILD_ORDER, SLOTS, LAST_WAVE, sellValue, clamp } from './game.js';
import { createHarbour } from './harbour.js';
import * as audio from './audio.js';
import * as net from './net.js';

export const VERSION = '2.0.0';
const Q = new URLSearchParams(location.search), DEBUG = Q.has('debug'), AUTO = Q.has('auto');
const $ = (s, el = document) => el.querySelector(s), ui = $('#ui'), frame = $('#frame');
const h = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- save (v2: the 1.0 stage progress is retired with the old design) ----------
const KEY = AUTO ? 'lamplighter.v2.auto' : 'lamplighter.v2';
const fresh = () => ({ v: 2, stars: 0, perks: {}, best: 0, bestStars: 0, runs: 0, nick: '', asked: false, pid: (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)), set: { music: true, sfx: true, mv: 0.6, sv: 0.8 } });
let save = fresh(); try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.v === 2 && !AUTO) save = Object.assign(fresh(), d, { set: Object.assign(fresh().set, d.set) }); } catch (e) { /* first run */ }
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* private mode */ } };
audio.configure(save.set);
// permanent upgrades bought with stars: a few nodes only
const PERKS = [
  { id: 'shards', name: '두둑한 주머니', desc: '시작 빛조각 +40', max: 2, cost: [2, 4] }, { id: 'lamp', name: '굵은 심지', desc: '등대 빛 +15%', max: 2, cost: [2, 4] },
  { id: 'windows', name: '덧창', desc: '창문 +3', max: 2, cost: [2, 3] }, { id: 'flash', name: '기름통', desc: '섬광이 15% 빨리 차요', max: 2, cost: [2, 4] },
  { id: 'refund', name: '단골 고물상', desc: '판매 환급 80%', max: 1, cost: [3] }, { id: 'reroll', name: '카드 다시 뽑기', desc: '판마다 다시 뽑기 +1', max: 2, cost: [3, 5] },
];

const SHAPES = await fetch('./assets/shapes.json').then(r => r.json());
const icon = name => { const S = SHAPES[name]; return `<svg viewBox="0 0 ${S.w} ${S.h}" aria-hidden="true"><path fill-rule="evenodd" d="${S.d}"/></svg>`; };
const TOOL_ICON = { mirror: 't_mirror', prism: 't_prism', lens: 't_lens', bell: 't_bell', beacon: 't_beacon', jar: 't_jar' };
const DIRECTED = { mirror: 1, prism: 1, lens: 1, beacon: 1 };
const stage = await createHarbour(frame, SHAPES);
$('#load').remove();

// ---------- state ----------
let game = null, bot = null, playing = false, paused = false, speed = 1, hold = null, flashHold = -1, menuSlot = -1, tipT = 0, endT = -1, submitted = false;
const TIPS = { 1: '둥근 자리를 눌러 거울을 세워요. 거울은 등대 빛(가는 선)이 닿아야 켜져요.', 2: '날치는 뛰어오른 동안 빛이 닿지 않아요. 종과 번개는 닿아요.', 3: '방패게는 정면 빛을 막아요. 거울 빛을 옆이나 뒤에서 맞혀요.', 4: '문어는 사라지면 셋으로 갈라져요.',
  5: '안개는 주변 빛을 약하게 해요. 종소리로 걷어내요.', 6: '이제 거울만으로는 부족해요. 빛을 이어 프리즘과 렌즈를 켜 보세요.', 7: '거북은 렌즈로 모은 빛이 필요해요.', 15: '큰 고래 그림자가 와요!' };

function startRun(opt = {}) {
  game = new Game({ seed: opt.seed ?? ((Date.now() & 0xffff) + 1), perks: save.perks }); bot = opt.bot ? new PlanBot(game, PLANS[opt.bot], ['link', 'lenshot', 'prism4', 'lamp25', 'shard20', 'chain1', 'burn', 'window', 'gift']) : null;
  stage.reset(game); stage.fadeIn(); playing = true; paused = false; speed = 1; endT = -1; submitted = false; menuSlot = -1; save.runs++; persist(); audio.setMood('night'); showHud(); showTip(TIPS[1], 14);
}
function reached() { return game ? (game.phase === 'won' || game.phase === 'cards' || game.phase === 'break' ? game.wave : Math.max(0, game.wave - 1)) : 0; }
function bank() { // record the run once: stars, best wave, ranking
  if (!game || submitted) return null; submitted = true;
  const cleared = reached(), stars = cleared >= LAST_WAVE ? Math.max(1, game.stars) : 0, gain = Math.max(0, stars - (save.bestStars || 0)) + (cleared >= LAST_WAVE ? 1 : 0);
  save.stars += gain; save.bestStars = Math.max(save.bestStars || 0, stars); save.best = Math.max(save.best, cleared); persist();
  const res = { cleared, stars, gain, score: cleared * 100 + Math.max(0, game.windows) };
  if (save.nick && cleared > 0 && !AUTO) net.submitScore(save.pid, save.nick, res.score).then(r => { const el = $('#rankline'); if (el) el.textContent = r ? `오늘 ${r}등` : '순위에 올렸어요'; }).catch(() => { const el = $('#rankline'); if (el) el.textContent = '순위를 올리지 못했어요.'; });
  return res;
}

// ---------- screens ----------
const clearUi = () => { ui.replaceChildren(); menuSlot = -1; stage.select(-1); };
function showTitle() {
  clearUi(); playing = false; game = null; stage.reset(null); stage.fadeIn(); audio.setMood('menu');
  const el = h(`<div class="screen" id="title"><h1>등불지기</h1><p>항구 마을의 밤을 지켜요</p>
    <button class="btn" data-a="go">밤 시작</button>
    <div class="row3"><button class="btn ghost" data-a="perk">강화 · 별 ${save.stars}</button><button class="btn ghost" data-a="rank">순위</button><button class="btn ghost" data-a="set">설정</button></div>
    <small class="best">${save.best ? `최고 ${save.best}웨이브` : '15웨이브를 버티면 동이 터요'}</small></div>`);
  el.onclick = e => { const a = e.target.closest('button')?.dataset.a; if (!a) return; audio.unlock(); audio.sfx('tap'); if (a === 'go') startRun(); else if (a === 'perk') showPerks(); else if (a === 'rank') showRank(); else showSettings(); };
  ui.append(el);
}
function showPerks() {
  clearUi();
  const el = h(`<div class="screen veil"><div class="top"><button class="round" data-a="back">‹</button><h2>강화</h2><span class="round" style="display:grid;place-items:center;font-size:13px">★${save.stars}</span></div>
    <div class="body"><h3>별로 사는 영구 강화 · 별은 15웨이브를 넘기면 얻어요</h3>${PERKS.map(p => { const l = save.perks[p.id] || 0, c = p.cost[l];
      return `<div class="card ${l >= p.max ? 'done' : ''}"><div class="t"><b>${p.name}</b><small>${p.desc}</small><div class="pips">${'●'.repeat(l)}${'○'.repeat(p.max - l)}</div></div>${l >= p.max ? '<small>최고</small>' : `<button class="btn" data-perk="${p.id}" ${save.stars >= c ? '' : 'disabled'}>★ ${c}</button>`}</div>`; }).join('')}</div></div>`);
  el.onclick = e => { const t = e.target.closest('button'); if (!t) return; audio.sfx('tap'); if (t.dataset.a === 'back') return showTitle();
    const p = PERKS.find(x => x.id === t.dataset.perk); if (!p) return; const l = save.perks[p.id] || 0; if (l < p.max && save.stars >= p.cost[l]) { save.stars -= p.cost[l]; save.perks[p.id] = l + 1; persist(); audio.sfx('sparkle'); showPerks(); } };
  ui.append(el);
}
function showRank() {
  clearUi();
  const el = h(`<div class="screen veil"><div class="top"><button class="round" data-a="back">‹</button><h2>친구 순위</h2><span style="width:44px"></span></div><div class="body">
    <div class="card"><div class="t"><b>${esc(save.nick) || '이름 없음'}</b><small>순위에 보이는 이름 · 점수는 버틴 웨이브</small></div><button class="btn ghost" data-a="nick">바꾸기</button></div>
    <h3>오늘</h3><div id="rk-d"><div class="rank"><span>불러오는 중…</span></div></div><h3>이번 주</h3><div id="rk-w"><div class="rank"><span>불러오는 중…</span></div></div></div></div>`);
  el.onclick = e => { const a = e.target.closest('button')?.dataset.a; if (a === 'back') showTitle(); else if (a === 'nick') askNick(showRank); };
  ui.append(el);
  const fill = (id, rows, f) => { const d = $(id); if (!d) return; d.innerHTML = rows.length ? rows.map(r => `<div class="rank ${r.nick === save.nick ? 'me' : ''}"><b>${r.rank}</b><span>${esc(r.nick)}</span><em>${f(r)}</em></div>`).join('') : '<div class="rank"><span>아직 아무도 없어요.</span></div>'; };
  const fail = id => () => { const d = $(id); if (d) d.innerHTML = '<div class="rank"><span>순위를 불러오지 못했어요.</span></div>'; };
  net.dailyTop(20).then(r => fill('#rk-d', r, x => `${Math.floor(x.score / 100)}웨이브`)).catch(fail('#rk-d')); net.weeklyTop(20).then(r => fill('#rk-w', r, x => `${x.score}점 · ${x.nights}밤`)).catch(fail('#rk-w'));
}
function modal(html, on) { const el = h(`<div class="modal"><div class="sheet">${html}</div></div>`); el.onclick = e => { const t = e.target.closest('[data-a]'); if (t) { audio.unlock(); audio.sfx('tap'); on(t.dataset.a, el, t); } }; el.addEventListener('pointerdown', e => e.stopPropagation()); ui.append(el); return el; }
function askNick(then) { modal(`<h2>등불지기의 이름</h2><p>친구 순위에 보여요 (12자까지)</p><input type="text" maxlength="12" value="${esc(save.nick)}" placeholder="이름"><div class="row"><button class="btn ghost" data-a="skip">나중에</button><button class="btn" data-a="ok">정하기</button></div>`,
  (a, el) => { const v = $('input', el).value.trim().slice(0, 12); if (a === 'ok' && v) save.nick = v; save.asked = true; persist(); el.remove(); then && then(); }); }
function showSettings() {
  const tog = (k, on) => `<button class="tog ${on ? 'on' : ''}" data-a="${k}" aria-label="${k}"></button>`;
  const el = modal(`<h2>설정</h2><div class="setrow"><span>배경음</span>${tog('music', save.set.music)}<input type="range" min="0" max="1" step="0.05" value="${save.set.mv}" data-v="mv"></div>
    <div class="setrow"><span>효과음</span>${tog('sfx', save.set.sfx)}<input type="range" min="0" max="1" step="0.05" value="${save.set.sv}" data-v="sv"></div><p style="font-size:12px">등불지기 ${VERSION}</p><div class="row"><button class="btn" data-a="ok">닫기</button></div>`,
    (a, el, t) => { if (a === 'ok') { el.remove(); return; } save.set[a] = !save.set[a]; t.classList.toggle('on', save.set[a]); persist(); audio.configure(save.set); });
  el.addEventListener('input', e => { const k = e.target.dataset.v; if (k) { save.set[k] = +e.target.value; persist(); audio.configure(save.set); } });
}
function showHud() {
  clearUi();
  const el = h(`<div id="hud"><div class="bar"><div class="stat" id="s-wave"></div><div class="stat" id="s-win"></div><div class="stat" id="s-shard"></div><span style="flex:1"></span><button class="round" data-a="note" aria-label="배경음">♪</button><button class="round" data-a="pause" aria-label="멈춤">Ⅱ</button></div>
    <div id="tip" class="hide"></div><div id="menu" class="hide"></div>
    <div class="bottom"><button class="btn ghost" id="call"></button><span style="flex:1"></span><button class="round" id="spd">1×</button><button id="flash"><span>섬광</span></button></div>${DEBUG ? '<div id="dbg"></div>' : ''}</div>`);
  el.addEventListener('click', e => { const t = e.target.closest('button'); if (!t || !game) return; audio.unlock(); const d = t.dataset;
    if (d.a === 'note') { save.set.music = !save.set.music; persist(); audio.configure(save.set); } else if (d.a === 'pause') showPause();
    else if (t.id === 'call') { if (game.callWave()) audio.sfx('tap'); } else if (t.id === 'spd') { speed = speed === 1 ? 2 : 1; t.textContent = speed + '×'; t.classList.toggle('on', speed === 2); }
    else if (d.m) menuAct(d.m, d.x); });
  const fb = $('#flash', el);
  fb.addEventListener('pointerdown', e => { e.stopPropagation(); audio.unlock(); flashHold = performance.now(); try { fb.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ } });
  fb.addEventListener('pointerup', e => { e.stopPropagation(); if (flashHold > 0 && game) game.flash(); flashHold = -1; stage.setGather(0); });
  fb.addEventListener('pointercancel', () => { flashHold = -1; stage.setGather(0); });
  ui.append(el);
}
function showTip(text, sec = 6) { const tip = $('#tip'); if (!tip || !text) return; tip.innerHTML = text; tip.classList.remove('hide'); tip.style.opacity = 1; tipT = sec; }
// the round build menu around a spot (Kingdom Rush style)
function openMenu(slot) {
  const m = $('#menu'); if (!m || !game) return; menuSlot = slot; stage.select(slot);
  const t = game.tools[slot], p = stage.toScreen(SLOTS[slot].x, 0.3, SLOTS[slot].z), items = [];
  if (!t) for (const k of BUILD_ORDER) items.push({ m: 'build', x: k, ic: icon(TOOL_ICON[k]), cost: game.cost(slot, k), label: BUILDS[k].name });
  else { const B = BUILDS[t.type];
    if (t.lvl < 3) items.push({ m: 'up', x: '', txt: '▲', cost: game.cost(slot), label: `${t.lvl + 1}단계` });
    else if (t.lvl === 3) for (const s of B.spec) items.push({ m: 'up', x: s.id, txt: '★', cost: game.cost(slot), label: s.name });
    if (DIRECTED[t.type]) items.push({ m: 'rot', x: '', txt: '↻', label: '돌리기' });
    items.push({ m: 'sell', x: '', txt: '✕', gain: sellValue(t, game.m.refund), label: '팔기' }); }
  const R = items.length > 4 ? 86 : 70, fw = frame.clientWidth, cx = clamp(p.x, R + 34, fw - R - 34), cy = clamp(p.y, R + 96, frame.clientHeight - R - 130);
  m.innerHTML = items.map((it, i) => { const a = -Math.PI / 2 + (i - (items.length - 1) / 2) * (items.length > 4 ? 1.02 : 1.15), x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
    return `<button class="mi ${it.cost > game.shards ? 'poor' : ''}" data-m="${it.m}" data-x="${it.x}" style="left:${x}px;top:${y}px" aria-label="${it.label}">${it.ic || `<b>${it.txt}</b>`}<small>${it.cost != null ? it.cost : it.gain != null ? '+' + it.gain : ''}</small><i>${it.label}</i></button>`; }).join('')
    + (t ? `<div class="mt" style="left:${cx}px;top:${cy + R + 34}px">${BUILDS[t.type].name} ${t.lvl}단계${t.spec ? ' · ' + BUILDS[t.type].spec.find(s => s.id === t.spec).name : ''}${BUILDS[t.type].optic && !t.depth ? ' · 빛이 닿지 않아요' : BUILDS[t.type].optic ? ` · 연결 ${t.depth}단계` : ''}</div>` : `<div class="mt" style="left:${cx}px;top:${cy + R + 34}px">무엇을 세울까요?</div>`);
  m.classList.remove('hide');
}
function closeMenu() { const m = $('#menu'); if (m) m.classList.add('hide'); menuSlot = -1; stage.select(-1); }
function menuAct(kind, x) {
  const s = menuSlot; if (s < 0 || !game) return; let ok = false;
  if (kind === 'build') ok = game.build(s, x, s === 0 ? 0 : s === 1 ? 4 : 2); else if (kind === 'up') ok = game.upgrade(s, x || undefined); else if (kind === 'sell') ok = game.sell(s); else if (kind === 'rot') { game.rotate(s, game.tools[s].dir + 1); ok = true; }
  audio.sfx(ok ? 'rustle' : 'tap'); if (!ok) return; if (game.dirty) game.relink(); if (kind === 'sell') closeMenu(); else openMenu(s);
}
function showCards() {
  const c = game.offer; if (!c) return; closeMenu();
  modal(`<h2>${game.wave}웨이브를 넘겼어요</h2><p>강화 하나를 골라요</p><div class="cards">${c.map((x, i) => `<button class="pick" data-a="${i}"><b>${x.name}</b><span>${x.desc}</span></button>`).join('')}</div>${game.rerolls > 0 ? `<div class="row"><button class="btn ghost" data-a="re">다시 뽑기 (${game.rerolls})</button></div>` : ''}`,
    (a, el) => { if (a === 're') { game.reroll(); el.remove(); showCards(); return; } if (game.pickCard(+a)) { audio.sfx('sparkle'); el.remove(); if (TIPS[game.wave + 1]) showTip(TIPS[game.wave + 1], 9); } }).classList.add('cardmodal');
}
function showPause() {
  if (!playing || paused) return; paused = true;
  modal(`<h2>잠깐 멈춤</h2><p>${game.wave}웨이브 · 창문 ${game.windows}</p><div class="row"><button class="btn" data-a="go">계속</button></div><div class="row"><button class="btn ghost" data-a="set">설정</button><button class="btn ghost" data-a="quit">그만하기</button></div>`,
    (a, el) => { if (a === 'set') { showSettings(); return; } el.remove(); paused = false; if (a === 'quit') { bank(); showTitle(); } });
}
function showEnd() {
  const won = game.phase === 'won', r = bank() ?? { cleared: reached(), stars: 0, gain: 0, score: 0 }; closeMenu();
  const body = won ? `<h2>동이 텄어요</h2><div class="stars">${[1, 2, 3].map(i => i <= r.stars ? '<b>★</b>' : '★').join('')}</div><p>15웨이브를 지켰어요 · 남은 창문 ${game.windows}${r.gain ? ` · 별 +${r.gain}` : ''}</p>`
    : `<h2>창문이 모두 꺼졌어요</h2><p>${r.cleared}웨이브까지 버텼어요${game.endless ? ' · 폭풍의 밤' : ''}${r.gain ? ` · 별 +${r.gain}` : ''}</p>`;
  modal(`${body}<p id="rankline">${save.nick ? (r.cleared ? '순위 올리는 중…' : '') : '이름을 정하면 순위에 올라가요'}</p><div class="row"><button class="btn ghost" data-a="home">처음으로</button>${won ? '<button class="btn" data-a="storm">폭풍의 밤 이어하기</button>' : '<button class="btn" data-a="again">다시</button>'}</div>`,
    (a, el) => { el.remove();
      if (a === 'storm') { submitted = false; playing = true; endT = -1; stage.st.dawnTarget = 0; game.continueEndless(); audio.setMood('night'); showCards(); return; }
      const go = () => (a === 'again' ? startRun() : showTitle());
      if (!save.asked) askNick(() => { if (save.nick && r.cleared && !AUTO) net.submitScore(save.pid, save.nick, r.score).catch(() => {}); go(); }); else go(); });
}
function updateHud(dt) {
  const hud = $('#hud'); if (!hud || !game) return;
  $('#s-wave').textContent = `웨이브 ${Math.max(1, game.wave)}${game.endless ? '' : '/' + LAST_WAVE}`; $('#s-win').innerHTML = `<i class="w"></i>${game.windows}`; $('#s-shard').innerHTML = `<i class="s"></i>${game.shards}`;
  const fb = $('#flash'); fb.style.setProperty('--c', game.charge.toFixed(3)); fb.classList.toggle('ready', game.canFlash());
  const call = $('#call'); call.classList.toggle('hide', game.phase !== 'break'); if (game.phase === 'break') call.textContent = game.wave === 0 ? '첫 웨이브 부르기' : `다음 웨이브 · +${Math.round(Math.max(0, game.breakT) * 2.5 * game.m.early)} (${Math.ceil(game.breakT)})`;
  $('[data-a=note]', hud).style.opacity = save.set.music ? 1 : 0.4;
  if (tipT > 0) { tipT -= dt; const tip = $('#tip'); if (tipT <= 0) tip.classList.add('hide'); else tip.style.opacity = Math.min(1, tipT); }
  if (menuSlot >= 0) for (const b of hud.querySelectorAll('.mi')) { const c = b.dataset.m === 'build' ? game.cost(menuSlot, b.dataset.x) : b.dataset.m === 'up' ? game.cost(menuSlot) : 0; b.classList.toggle('poor', c > game.shards); }
  if (DEBUG) { const i = stage.info(); $('#dbg').textContent = `적 ${game.enemies.length} · ${Math.round(i.fps)}fps · x${i.pixelRatio.toFixed(2)} · 호출 ${i.calls} · △${Math.round(i.tris / 1000)}k`; }
}

// ---------- input on the stage ----------
frame.addEventListener('pointerdown', e => {
  if (!playing || paused || !game || e.target.closest('button, .modal')) return; audio.unlock();
  const slot = stage.slotAt(e.clientX, e.clientY);
  if (menuSlot >= 0 && slot !== menuSlot) { closeMenu(); if (slot < 0) return; }
  if (slot >= 0) hold = { slot, x: e.clientX, y: e.clientY, moved: false };
  else { const p = stage.pickGround(e.clientX, e.clientY); if (p) { game.setAim(p.x, p.z); hold = { aim: true, x: e.clientX, y: e.clientY, moved: false, t: performance.now() }; } }
  try { frame.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
});
frame.addEventListener('pointermove', e => {
  if (!hold || !game) return; const far = Math.hypot(e.clientX - hold.x, e.clientY - hold.y);
  if (hold.aim) { const p = stage.pickGround(e.clientX, e.clientY); if (p) game.setAim(p.x, p.z); if (far > 12) hold.moved = true; }
  else if (far > 16 && game.tools[hold.slot] && DIRECTED[game.tools[hold.slot].type]) { const p = stage.pickGround(e.clientX, e.clientY), s = SLOTS[hold.slot]; if (p) { game.rotate(hold.slot, Math.round(Math.atan2(p.z - s.z, p.x - s.x) / (Math.PI / 4))); hold.moved = true; if (menuSlot >= 0) closeMenu(); } }   // drag turns it in 45 degree steps
});
const endHold = () => { if (!hold || !game) { hold = null; return; }
  if (hold.aim) { game.releaseAim(); if (!hold.moved && performance.now() - hold.t > 550) game.flash(); stage.setGather(0); }                 // press and hold, let go: flash
  else if (!hold.moved) { if (menuSlot === hold.slot) closeMenu(); else { openMenu(hold.slot); audio.sfx('tap'); } }
  hold = null; };
frame.addEventListener('pointerup', endHold); frame.addEventListener('pointercancel', endHold);
addEventListener('keydown', e => { if (e.key === ' ' && playing && game && !paused) game.flash(); if (e.key === 'Escape') showPause(); });
document.addEventListener('visibilitychange', () => { audio.background(document.hidden); if (document.hidden && playing && !paused && !AUTO) showPause(); });

// ---------- loop ----------
let popT = 0;
function advance(dt) {
  if (stage.st.freeze > 0 || !game) return;
  bot?.step(); game.step(dt);
  for (const e of game.events) { stage.onEvent(e, game);
    if (e.type === 'kill') { if (performance.now() - popT > 45) { popT = performance.now(); audio.sfx('pop'); } } else if (e.type === 'flash') audio.sfx('flash'); else if (e.type === 'leak') audio.sfx('snuff');
    else if (e.type === 'bell') audio.sfx('bell'); else if (e.type === 'zap') audio.sfx('zap'); else if (e.type === 'won') audio.sfx('win'); else if (e.type === 'lost') audio.sfx('lose');
    else if (e.type === 'wave' && TIPS[e.n] && e.n > 1) showTip(TIPS[e.n], 8); }
  game.events.length = 0;
  if (game.phase === 'cards' && !$('.cardmodal') && !bot) showCards();
  if (game.done && endT < 0 && playing) endT = game.phase === 'won' ? 3.4 : 2.2;
}
let last = performance.now();
function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (playing && game && !paused) {
    for (let i = 0; i < speed; i++) advance(dt);
    const held = flashHold > 0 ? now - flashHold : hold && hold.aim && !hold.moved ? now - hold.t : 0; stage.setGather(game.canFlash() ? clamp((held - 200) / 500) : 0);
    if (endT > 0) { endT -= dt; if (endT <= 0) { endT = -1; playing = false; audio.setMood(game.phase === 'won' ? 'menu' : 'hush'); showEnd(); } }
    updateHud(dt);
  }
  stage.frame(paused ? 0 : dt * (playing ? speed : 1), playing || (game && game.done) ? game : null);
  requestAnimationFrame(tick);
}

// ---------- new version strip + PWA ----------
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').then(reg => {
    const offer = w => { if (!w || $('#update')) return; const b = h('<button id="update">새 버전이 있어요 · 눌러서 새로 고침</button>'); b.onclick = () => w.postMessage('skip'); frame.append(b); };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => { const w = reg.installing; w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); }); });
    setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
  }).catch(() => {});
  const hadWorker = !!navigator.serviceWorker.controller; let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadWorker && !reloaded) { reloaded = true; location.reload(); } });
}

// ---------- test hooks ----------
window.__ll = {
  get game() { return game; }, get save() { return save; }, get stage() { return stage; }, start: o => startRun(o), title: () => showTitle(), open: s => openMenu(s),
  // run game time forward without waiting on the display (draws a frame now and then)
  run(seconds, step = 1 / 30) { let n = 0; for (let t = 0; t < seconds && game && !game.done; t += step) { stage.st.freeze = 0; advance(step); if (++n % 15 === 0) stage.frame(step, game); } stage.frame(step, game); updateHud(0); return game ? { phase: game.phase, wave: game.wave, windows: game.windows, shards: game.shards, alive: game.enemies.length } : null; },
  frame: (dt = 1 / 30) => stage.frame(dt, game),
  // time real frames with the current scene: average ms per rendered frame
  bench(n = 60) { const t0 = performance.now(); for (let i = 0; i < n; i++) { stage.st.freeze = 0; advance(1 / 60); stage.frame(1 / 60, game); } const ms = (performance.now() - t0) / n; return { msPerFrame: +ms.toFixed(2), fps: Math.round(1000 / ms), alive: game ? game.enemies.length : 0, ...stage.info() }; },
};
showTitle();
requestAnimationFrame(tick);
