// 등불지기 (Lamplighter) v1.0 — boot, screens, input and the game loop.
import { Sim, Bot, TOOLS, clamp } from './sim.js';
import { makeLevel, dailyLevel, CHAPTERS, STAGES, UPGRADES, VILLAGE, SKINS, DAILY_UPGRADES, levelId } from './levels.js';
import { buildWorld } from './world.js';
import { load, store, totalStars, stats } from './save.js';
import * as audio from './audio.js';
import * as net from './net.js';

export const VERSION = '1.0.1';
const Q = new URLSearchParams(location.search);
const DEBUG = Q.has('debug'), AUTO = Q.has('auto');
const SAVE_KEY = AUTO ? 'lamplighter.auto' : undefined;          // the automated play-through never touches a real save
const $ = (s, el = document) => el.querySelector(s);
const ui = $('#ui'), frame = $('#frame');
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

let save = load(SAVE_KEY);
if (AUTO) { save = load('__none__'); save.nick = ''; save.asked = true; }
const persist = () => store(save, SAVE_KEY ?? undefined);
audio.configure(save.set);

const SHAPES = await fetch('./assets/shapes.json').then(r => r.json());
const icon = name => { const S = SHAPES[name]; return `<svg viewBox="0 0 ${S.w} ${S.h}" aria-hidden="true"><path fill-rule="evenodd" d="${S.d}"/></svg>`; };
const TOOL_ICON = { mirror: 't_mirror', prism: 't_prism', lens: 't_lens', glass: 't_glass', jar: 't_jar' };

// ---------- the theatre: three.js, or the flat 2D fallback ----------
let stage, making = null;
async function makeStage(force2d) {
  if (stage) { stage.dispose(); stage = null; }
  if (!force2d && !save.set.low && !Q.has('2d')) {
    try { const { createStage } = await import('./stage.js'); stage = await createStage(frame, SHAPES, { chapter: 0 }); return; }
    catch (e) { console.warn('3D stage unavailable, using the 2D path', e); }
  }
  const { createStage2D } = await import('./stage2d.js'); stage = await createStage2D(frame, SHAPES, { chapter: 0 });
}
await makeStage(false);
$('#load').remove();
const applySkin = () => stage.setSkin((SKINS.find(s => s.id === save.skin) ?? SKINS[0]).color);
applySkin();

// ---------- progress helpers ----------
const starsOf = (c, s) => save.stars[levelId(c, s)] || 0;
const stageOpen = (c, s) => AUTO || (s === 0 ? chapterOpen(c) : starsOf(c, s - 1) > 0);
const chapterOpen = c => c === 0 || starsOf(c - 1, STAGES - 1) > 0;
const litOf = c => save.lit[c] || [];
const myStats = () => stats(save, STAGES);
const skinOpen = sk => !sk.need || sk.need(myStats());
function nextNight() { for (let c = 0; c < CHAPTERS.length; c++) for (let s = 0; s < STAGES; s++) if (!starsOf(c, s)) return chapterOpen(c) ? [c, s] : [c - 1, STAGES - 1]; return [CHAPTERS.length - 1, STAGES - 1]; }

// ---------- game state ----------
let sim = null, bot = null, level = null, playing = false, paused = false, speed = 1, selTool = null, endTimer = -1, ended = false;
let viewCh = nextNight()[0], tab = 'night', hold = null, flashHold = -1, tipTimer = 0, lastRes = null, silentEnd = false;

function startNight(c, s, opt = {}) {
  const daily = opt.daily;
  stage.setChapter(daily ? daily.c : c);
  const world = stage.world;
  level = daily ? daily : makeLevel(c, s, world.slots);
  sim = new Sim({ path: world.path, tower: world.tower, level, upgrades: daily ? DAILY_UPGRADES : save.up, seed: (Date.now() & 0xffff) + 1 });
  bot = opt.bot ? new Bot(sim) : null;
  stage.reset(sim); stage.fadeIn(); stage.st.guideSlots = level.guide === 'tool';
  selTool = level.tools[0] ?? null; playing = true; paused = false; ended = false; lastRes = null; endTimer = -1; speed = opt.speed ?? 1; guideOk = {};
  audio.setMood('menu'); showHud();
}
function finishNight() {
  if (ended && lastRes) return lastRes;
  ended = true; endTimer = -1;
  const won = sim.phase === 'won', stars = sim.stars, res = { won, stars, daily: !!level.daily, sparkles: 0, oil: 0, name: level.name };
  if (won && !level.daily) {
    res.sparkles = sim.sparkles + (stars === 3 ? Math.round(level.reward * 0.2) : 0);
    const prev = save.stars[level.id] || 0; res.oil = Math.max(0, stars - prev);
    save.sparkles += res.sparkles; save.oil += res.oil; save.stars[level.id] = Math.max(prev, stars); persist();
  }
  if (level.daily) { res.score = sim.score; const d = save.daily[level.daily] || 0; if (res.score > d) { save.daily = { [level.daily]: res.score }; persist(); }
    if (save.nick && won) net.submitScore(save.pid, save.nick, res.score).then(r => { res.rank = r; const el = $('#rankline'); if (el) el.textContent = r ? `오늘 ${r}등` : '순위에 올렸어요'; }).catch(() => { const el = $('#rankline'); if (el) el.textContent = '순위를 올리지 못했어요. 나중에 다시 도전해 주세요.'; }); }
  lastRes = res; playing = false; audio.setMood(won ? 'menu' : 'hush');
  if (!silentEnd) showResult(res);
  return res;
}

// ---------- screens ----------
function clearUi() { ui.replaceChildren(); }
function showTitle() {
  clearUi(); playing = false; sim = null; stage.setChapter(viewCh); stage.reset(null); stage.fadeIn(); audio.setMood('menu');
  const [c, s] = nextNight(), fresh = totalStars(save) === 0;
  const el = h(`<div class="screen" id="title"><h1>등불지기</h1><p>종이 마을의 밤을 지켜요</p>
    <button class="btn" data-a="go">${fresh ? '첫 밤 시작' : `이어하기 · ${c + 1}-${s + 1}`}</button>
    <button class="btn ghost" data-a="map">마을 지도</button></div>`);
  el.onclick = e => { const a = e.target.dataset.a; if (!a) return; audio.unlock(); audio.sfx('tap'); if (a === 'go') startNight(c, s); else showMap(); };
  ui.append(el);
}
const purse = () => `<div class="purse"><span>반짝이 <b>${save.sparkles}</b></span><span>기름 <b>${save.oil}</b></span><span>별 <b>${totalStars(save)}</b></span></div>`;
const nav = () => `<div class="nav">${[['night', '밤'], ['lamp', '등불'], ['town', '마을'], ['friend', '친구']].map(([k, n]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>`;
function showMap() {
  if (making) return;
  if (!Q.has('2d') && (stage.kind === '2d') !== !!save.set.low && !(stage.kind === '2d' && stage.forced)) { making = makeStage(save.set.low).then(() => { if (stage.kind === '2d' && !save.set.low) stage.forced = true; making = null; applySkin(); showMap(); }); return; }
  clearUi(); playing = false; sim = null; audio.setMood('menu');
  viewCh = clamp(viewCh, 0, CHAPTERS.length - 1);
  stage.setChapter(viewCh);
  if (tab === 'town') stage.setTown(litOf(viewCh), !!save.festival[viewCh] && litOf(viewCh).length >= VILLAGE.length); else stage.reset(null);
  const ch = CHAPTERS[viewCh], open = chapterOpen(viewCh);
  let body = '';
  if (tab === 'night') {
    const [nc, ns] = nextNight();
    body = `<div class="grid">${Array.from({ length: STAGES }, (_, s) => { const st = starsOf(viewCh, s), ok = open && stageOpen(viewCh, s), L = makeLevel(viewCh, s, stage.world.slots);
      return `<button class="night ${ok ? '' : 'lock'} ${s === STAGES - 1 ? 'boss' : ''} ${nc === viewCh && ns === s ? 'next' : ''}" data-s="${s}">${L.newTool || L.newEnemy ? '<i>새</i>' : ''}${s + 1}<small>${'★'.repeat(st)}</small></button>`; }).join('')}</div>
      ${open ? '' : '<div class="card"><div class="t"><b>잠긴 마을</b><small>앞 마을의 보스를 물리치면 열려요</small></div></div>'}
      <h3>오늘의 밤</h3><div class="card"><div class="t"><b>모두 같은 밤</b><small>${chapterOpen(1) ? '같은 등불로 겨뤄요 · 최고 ' + (save.daily[net.today()] || 0) : '1챕터를 마치면 열려요'}</small></div><button class="btn" data-a="daily" ${chapterOpen(1) || AUTO ? '' : 'disabled'}>도전</button></div>`;
  } else if (tab === 'lamp') {
    body = `<h3>업그레이드 · 빛이 굵고 밝아져요</h3>` + UPGRADES.filter(u => u.ch == null || chapterOpen(u.ch) && (u.ch < viewCh + 1 || starsOf(u.ch, 0) > 0 || u.ch === 0 && starsOf(0, 2) > 0)).map(u => { const l = save.up[u.id] || 0, max = u.cost.length, cost = u.cost[l];
      return `<div class="card ${l >= max ? 'done' : ''}"><div class="t"><b>${u.name}</b><small>${u.desc}</small><div class="pips">${'●'.repeat(l)}${'○'.repeat(max - l)}</div></div>${l >= max ? '<small>최고</small>' : `<button class="btn" data-up="${u.id}" ${save.sparkles >= cost ? '' : 'disabled'}>반짝이 ${cost}</button>`}</div>`; }).join('')
      + `<h3>등불 스킨</h3>` + SKINS.map(sk => { const ok = skinOpen(sk), c = sk.color.map(v => Math.round(v * 255));
        return `<div class="card ${save.skin === sk.id ? 'sel' : ''} ${ok ? '' : 'done'}"><span class="swatch" style="color:rgb(${c})"></span><div class="t"><b>${sk.name}</b><small>${ok ? '모았어요' : sk.how}</small></div>${ok ? `<button class="btn ghost" data-skin="${sk.id}">${save.skin === sk.id ? '쓰는 중' : '쓰기'}</button>` : ''}</div>`; }).join('');
  } else if (tab === 'town') {
    const lit = litOf(viewCh), nextI = lit.length, all = nextI >= VILLAGE.length;
    body = `<div style="height:38vh"></div><h3>마을 되살리기 · 기름으로 하나씩 밝혀요</h3>` + (all ? `<div class="card"><div class="t"><b>${save.festival[viewCh] ? '축제가 열렸어요' : '모두 밝혔어요!'}</b><small>마을 사람들이 돌아왔어요</small></div><button class="btn" data-a="fest">${save.festival[viewCh] ? '다시 보기' : '축제 열기'}</button></div>` : '')
      + VILLAGE.map((v, i) => `<div class="card ${i < nextI ? 'done' : ''}"><div class="t"><b>${v.name}</b><small>${i < nextI ? '불이 켜졌어요' : i === nextI ? '다음 차례' : '앞에서부터 밝혀요'}</small></div>${i === nextI ? `<button class="btn" data-lit="${v.id}" ${save.oil >= v.cost && open ? '' : 'disabled'}>기름 ${v.cost}</button>` : i < nextI ? '<small>✓</small>' : `<small>기름 ${v.cost}</small>`}</div>`).join('');
  } else {
    body = `<div class="card"><div class="t"><b>${escapeHtml(save.nick) || '이름 없음'}</b><small>순위에 보이는 이름</small></div><button class="btn ghost" data-a="nick">바꾸기</button></div>
      <h3>오늘의 밤 순위</h3><div id="rk-d"><div class="rank"><span>불러오는 중…</span></div></div><h3>주간 리그</h3><div id="rk-w"><div class="rank"><span>불러오는 중…</span></div></div>`;
  }
  const el = h(`<div class="screen ${tab === 'town' ? '' : 'veil'}"><div class="top"><button class="round" data-a="prev" ${viewCh ? '' : 'disabled style="opacity:.3"'}>‹</button><h2>${viewCh + 1}. ${ch.name}</h2><button class="round" data-a="next" ${viewCh < CHAPTERS.length - 1 ? '' : 'disabled style="opacity:.3"'}>›</button><button class="round" data-a="set">⚙</button></div>
    ${purse()}<div class="body">${body}</div>${nav()}</div>`);
  el.onclick = e => {
    const t = e.target.closest('button'); if (!t) return; audio.unlock(); audio.sfx('tap'); const d = t.dataset;
    if (d.tab) { tab = d.tab; showMap(); }
    else if (d.s != null) startNight(viewCh, +d.s);
    else if (d.up) { const u = UPGRADES.find(x => x.id === d.up), l = save.up[u.id] || 0; if (save.sparkles >= u.cost[l]) { save.sparkles -= u.cost[l]; save.up[u.id] = l + 1; persist(); audio.sfx('sparkle'); showMap(); } }
    else if (d.skin) { save.skin = d.skin; persist(); applySkin(); showMap(); }
    else if (d.lit) { const v = VILLAGE.find(x => x.id === d.lit); if (save.oil >= v.cost) { save.oil -= v.cost; save.lit[viewCh] = [...litOf(viewCh), v.id]; persist(); audio.sfx('sparkle'); showMap(); stage.celebrate?.(); } }
    else if (d.a === 'fest') { save.festival[viewCh] = true; persist(); stage.setTown(litOf(viewCh), true); audio.setMood('festival'); showFestival(); }
    else if (d.a === 'prev') { viewCh--; showMap(); } else if (d.a === 'next') { viewCh++; showMap(); }
    else if (d.a === 'set') showSettings(); else if (d.a === 'nick') askNick(showMap);
    else if (d.a === 'daily') startNight(0, 0, { daily: dailyLevel(net.today(), c => buildWorld(SHAPES, c % 2 === 1).slots) });
  };
  ui.append(el);
  if (tab === 'friend') loadRanks();
}
function loadRanks() {
  const fill = (id, rows, unit) => { const el = $(id); if (!el) return; el.innerHTML = rows.length ? rows.map(r => `<div class="rank ${r.nick === save.nick ? 'me' : ''}"><b>${r.rank}</b><span>${escapeHtml(r.nick)}</span><em>${r.score}${unit(r)}</em></div>`).join('') : '<div class="rank"><span>아직 아무도 없어요. 첫 등불지기가 되어 보세요.</span></div>'; };
  net.dailyTop(20).then(r => fill('#rk-d', r, () => '')).catch(() => { const el = $('#rk-d'); if (el) el.innerHTML = '<div class="rank"><span>순위를 불러오지 못했어요.</span></div>'; });
  net.weeklyTop(20).then(r => fill('#rk-w', r, x => ` · ${x.nights}밤`)).catch(() => { const el = $('#rk-w'); if (el) el.innerHTML = '<div class="rank"><span>순위를 불러오지 못했어요.</span></div>'; });
}
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function showFestival() {
  clearUi();
  const el = h(`<div class="screen" style="justify-content:flex-end;align-items:center;gap:10px"><div class="card" style="text-align:center"><div class="t"><b>${CHAPTERS[viewCh].name} 축제</b><small>불빛이 돌아오고, 마을 사람들이 춤을 춰요</small></div></div><button class="btn" data-a="x">돌아가기</button></div>`);
  el.onclick = e => { if (e.target.dataset.a) { audio.setMood('menu'); showMap(); } };
  ui.append(el);
}

function showHud() {
  clearUi();
  const el = h(`<div id="hud"><div class="bar"><div class="moonbar"><u></u><em></em><s>☀</s></div><div class="wins"></div><button class="round" data-a="note" aria-label="배경음">♪</button><button class="round" data-a="pause" aria-label="멈춤">Ⅱ</button></div>
    <div id="tip" class="hide"></div><div id="finger" class="hide">👆</div>
    <button class="btn" id="start">밤 시작</button>
    <div class="bottom"><div class="tools">${level.tools.map(t => `<button class="tool" data-tool="${t}" aria-label="${TOOLS[t].name}">${icon(TOOL_ICON[t])}</button>`).join('')}</div><button id="flash"><span>섬광</span></button></div>
    ${DEBUG ? '<div id="dbg"></div>' : ''}</div>`);
  el.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return; audio.unlock(); const d = t.dataset;
    if (d.tool) { selTool = d.tool; audio.sfx('tap'); }
    else if (d.a === 'note') { save.set.music = !save.set.music; persist(); audio.configure(save.set); }
    else if (d.a === 'pause') showPause();
    else if (t.id === 'start') { sim.startNight(); audio.setMood('night'); audio.sfx('tap'); }
  });
  const fb = $('#flash', el);
  fb.addEventListener('pointerdown', e => { e.stopPropagation(); audio.unlock(); flashHold = performance.now(); fb.setPointerCapture(e.pointerId); });
  fb.addEventListener('pointerup', e => { e.stopPropagation(); if (flashHold > 0 && sim && sim.flash()) guideDone('flash'); flashHold = -1; stage.setGather(0); });
  fb.addEventListener('pointercancel', () => { flashHold = -1; stage.setGather(0); });
  ui.append(el);
  if (level.intro || level.tip) { const tip = $('#tip'); tip.innerHTML = `${level.intro ? `<b>${level.intro}</b>` : ''}${level.tip || ''}`; tip.classList.remove('hide'); tipTimer = 9; }
  else if (level.guide === 'drag') showTip('손가락으로 끌어 빛을 옮겨요', 12); else if (level.guide === 'flash') showTip('섬광 단추를 꾹 눌렀다 떼요', 12);
}
function showTip(text, sec = 5) { const tip = $('#tip'); if (!tip) return; tip.innerHTML = text; tip.classList.remove('hide'); tip.style.opacity = 1; tipTimer = sec; }
let guideOk = {};
function guideDone(k) { guideOk[k] = true; }
function updateHud(dt) {
  const hud = $('#hud'); if (!hud || !sim) return;
  $('.moonbar u', hud).style.width = (sim.progress * 100) + '%'; $('.moonbar em', hud).style.left = (sim.progress * 100) + '%';
  const wins = $('.wins', hud); if (wins.childElementCount !== sim.windowsMax || wins.dataset.n !== String(sim.windows)) { wins.dataset.n = sim.windows; wins.innerHTML = Array.from({ length: sim.windowsMax }, (_, i) => `<i class="${i < sim.windows ? '' : 'off'}"></i>`).join(''); }
  const fb = $('#flash', hud); fb.style.setProperty('--c', sim.charge.toFixed(3)); fb.classList.toggle('ready', sim.canFlash());
  $('#start', hud).classList.toggle('hide', sim.phase !== 'prep');
  for (const b of hud.querySelectorAll('.tool')) b.classList.toggle('on', b.dataset.tool === selTool);
  $('[data-a=note]', hud).style.opacity = save.set.music ? 1 : 0.4;
  if (tipTimer > 0) { tipTimer -= dt; const tip = $('#tip', hud); if (tipTimer <= 0) tip.classList.add('hide'); else tip.style.opacity = Math.min(1, tipTimer); }
  // finger guide for the first nights
  const f = $('#finger', hud); let at = null, dx = 0, dy = 0;
  if (level.guide === 'tool' && sim.tools.every(t => !t) && level.slots.length) { const s = level.slots[0]; at = stage.toScreen(s.x, 0.2, s.z); }
  else if (level.guide === 'tool' && sim.phase === 'prep') { const r = $('#start', hud).getBoundingClientRect(), fr = frame.getBoundingClientRect(); at = { x: r.left - fr.left + r.width / 2, y: r.top - fr.top + 10 }; }
  else if (level.guide === 'drag' && sim.phase === 'prep') { const r = $('#start', hud).getBoundingClientRect(), fr = frame.getBoundingClientRect(); at = { x: r.left - fr.left + r.width / 2, y: r.top - fr.top + 10 }; }
  else if (level.guide === 'drag' && !guideOk.drag && sim.enemies.length) { const e = sim.enemies[0]; at = stage.toScreen(sim.aim.x, 0, sim.aim.z); const to = stage.toScreen(e.x, 0.3, e.z); dx = to.x - at.x; dy = to.y - at.y; }
  else if (level.guide === 'flash' && !guideOk.flash && sim.canFlash() && sim.enemies.length) { const r = fb.getBoundingClientRect(), fr = frame.getBoundingClientRect(); at = { x: r.left - fr.left + r.width / 2, y: r.top - fr.top + 14 }; }
  f.classList.toggle('hide', !at); if (at) { f.style.left = at.x + 'px'; f.style.top = at.y + 'px'; f.style.setProperty('--dx', dx + 'px'); f.style.setProperty('--dy', dy + 'px'); }
  if (DEBUG) { const i = stage.info(); $('#dbg').textContent = `${level.name} t${sim.t.toFixed(0)} e${sim.enemies.length} · ${Math.round(i.fps)}fps x${(i.pixelRatio || 1).toFixed(2)} ${stage.kind}`; }
}
function modal(html, on) { const el = h(`<div class="modal"><div class="sheet">${html}</div></div>`); el.onclick = e => { const t = e.target.closest('[data-a]'); if (t) { audio.unlock(); audio.sfx('tap'); on(t.dataset.a, el, t); } }; ui.append(el); return el; }
function showPause() {
  if (!playing || paused) return; paused = true;
  modal(`<h2>잠깐 멈춤</h2><p>${level.name} · ${level.tierName}</p><div class="row"><button class="btn" data-a="go">계속</button></div><div class="row"><button class="btn ghost" data-a="retry">다시</button><button class="btn ghost" data-a="set">설정</button><button class="btn ghost" data-a="quit">나가기</button></div>`,
    (a, el) => { if (a === 'set') { showSettings(); return; } el.remove(); paused = false;
      if (a !== 'go' && sim && sim.phase === 'won' && !ended) { silentEnd = true; finishNight(); silentEnd = false; }   // leaving during the dawn still counts
      if (a === 'retry') startNight(level.c, level.s, level.daily ? { daily: level } : {}); if (a === 'quit') showMap(); });
}
function showSettings() {
  const tog = (k, on) => `<button class="tog ${on ? 'on' : ''}" data-a="${k}" aria-label="${k}"></button>`;
  const el = modal(`<h2>설정</h2>
    <div class="setrow"><span>배경음</span>${tog('music', save.set.music)}<input type="range" min="0" max="1" step="0.05" value="${save.set.mv}" data-v="mv"></div>
    <div class="setrow"><span>효과음</span>${tog('sfx', save.set.sfx)}<input type="range" min="0" max="1" step="0.05" value="${save.set.sv}" data-v="sv"></div>
    <div class="setrow"><span>가벼운 화면</span>${tog('low', save.set.low)}<small style="flex:1;color:#5a4a35">느린 기기용 2D 화면</small></div>
    <p style="font-size:12px">등불지기 ${VERSION}</p><div class="row"><button class="btn" data-a="ok">닫기</button></div>`,
    (a, el, t) => {
      if (a === 'ok') { el.remove(); return; }
      save.set[a] = !save.set[a]; t.classList.toggle('on', save.set[a]); persist(); audio.configure(save.set);
      if (a === 'low' && !playing) { el.remove(); showMap(); }
    });
  el.addEventListener('input', e => { const k = e.target.dataset.v; if (k) { save.set[k] = +e.target.value; persist(); audio.configure(save.set); } });
}
function askNick(then) {
  const el = modal(`<h2>등불지기의 이름</h2><p>친구들 순위에 보여요 (12자까지)</p><input type="text" maxlength="12" value="${escapeHtml(save.nick)}" placeholder="이름"><div class="row"><button class="btn ghost" data-a="skip">나중에</button><button class="btn" data-a="ok">정하기</button></div>`,
    (a, el) => { const v = $('input', el).value.trim().slice(0, 12); if (a === 'ok' && v) save.nick = v; save.asked = true; persist(); el.remove(); then && then(); });
  el.addEventListener('pointerdown', e => e.stopPropagation());
}
function showResult(r) {
  clearUi();
  const next = !r.daily && r.won && (level.s < STAGES - 1 ? [level.c, level.s + 1] : level.c < CHAPTERS.length - 1 ? [level.c + 1, 0] : null);
  const html = r.won ? `<h2>${r.daily ? '오늘의 밤을 지켰어요' : '동이 텄어요'}</h2><div class="stars">${[1, 2, 3].map(i => i <= r.stars ? '<b>★</b>' : '★').join('')}</div>
      ${r.daily ? `<p>점수 <b>${r.score}</b></p><p id="rankline">${save.nick ? '순위 올리는 중…' : '이름을 정하면 순위에 올라가요'}</p>` : `<p>반짝이 +${r.sparkles}${r.oil ? ` · 기름 +${r.oil}` : ''}</p>`}
      <div class="row"><button class="btn ghost" data-a="map">지도</button><button class="btn ghost" data-a="retry">다시</button>${next ? '<button class="btn" data-a="next">다음 밤</button>' : ''}</div>`
    : `<h2>창문이 모두 꺼졌어요</h2><p>등불을 키우거나 도구 방향을 바꿔 보세요</p><div class="row"><button class="btn ghost" data-a="map">지도</button><button class="btn" data-a="retry">다시</button></div>`;
  modal(html, a => {
    const go = () => { if (a === 'retry') startNight(level.c, level.s, level.daily ? { daily: level } : {}); else if (a === 'next') { viewCh = next[0]; startNight(next[0], next[1]); } else { if (!level.daily) viewCh = level.c; showMap(); } };
    if (r.won && !save.asked && level.c === 0 && level.s >= 2) askNick(go); else go();   // right after the tutorial nights
  });
}

// ---------- input on the stage ----------
frame.addEventListener('pointerdown', e => {
  if (!playing || paused || !sim || e.target.closest('button, .modal')) return;
  audio.unlock();
  const slot = stage.slotAt(e.clientX, e.clientY, level.slots);
  if (slot >= 0 && level.tools.length) {
    if (!sim.tools[slot] || sim.tools[slot].type !== selTool) { sim.place(slot, selTool ?? level.tools[0]); hold = { slot, x: e.clientX, y: e.clientY, moved: true }; guideDone('tool'); }
    else hold = { slot, x: e.clientX, y: e.clientY, moved: false };
  } else { const p = stage.pickGround(e.clientX, e.clientY); if (p && sim.phase === 'night') { sim.setAim(p.x, p.z); hold = { aim: true, x: e.clientX, y: e.clientY, moved: false, t: performance.now() }; } }
  try { frame.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
});
frame.addEventListener('pointermove', e => {
  if (!hold || !sim) return;
  const far = Math.hypot(e.clientX - hold.x, e.clientY - hold.y);
  if (hold.aim) { const p = stage.pickGround(e.clientX, e.clientY); if (p) sim.setAim(p.x, p.z); if (far > 12) { hold.moved = true; guideDone('drag'); } }
  else if (far > 14) { const p = stage.pickGround(e.clientX, e.clientY), s = level.slots[hold.slot]; if (p) { sim.rotate(hold.slot, Math.round(Math.atan2(p.z - s.z, p.x - s.x) / (Math.PI / 4))); hold.moved = true; } }   // drag turns it in 45 degree steps
});
const endHold = () => {
  if (!hold || !sim) { hold = null; return; }
  if (hold.aim) { sim.releaseAim(); if (!hold.moved && performance.now() - hold.t > 550 && sim.flash()) guideDone('flash'); stage.setGather(0); }   // press and hold, let go: flash
  else if (!hold.moved && sim.tools[hold.slot]) sim.rotate(hold.slot, sim.tools[hold.slot].dir + 1);                                           // tap turns it one step
  hold = null;
};
frame.addEventListener('pointerup', endHold); frame.addEventListener('pointercancel', endHold);
addEventListener('keydown', e => { if (e.key === ' ' && playing && sim && !paused) sim.flash(); if (e.key === 'Escape') showPause(); });
document.addEventListener('visibilitychange', () => { audio.background(document.hidden); if (document.hidden && playing && !paused && !AUTO) showPause(); });

// ---------- loop ----------
function advance(dt) { // one slice of game time
  if (stage.st.freeze > 0) return;
  bot?.step(dt); sim.step(dt);
  if (sim.events.length) { for (const e of sim.events) { stage.onEvent(e, sim); audio.onEvent(e); if (e.type === 'won') audio.setMood('menu'); } sim.events.length = 0; }
  if (sim.done && endTimer < 0 && !ended) endTimer = sim.phase === 'won' ? 3.6 : 2.4;
}
let last = performance.now();
function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (playing && sim && !paused) {
    for (let i = 0; i < speed; i++) advance(dt);
    // the hush before a flash: holding darkens the stage (to 50 % at most)
    const held = flashHold > 0 ? now - flashHold : hold && hold.aim && !hold.moved ? now - hold.t : 0;
    stage.setGather(sim.canFlash() ? clamp((held - 200) / 500) : 0);
    if (endTimer > 0) { endTimer -= dt * speed; if (endTimer <= 0) finishNight(); }
    updateHud(dt);
  }
  stage.frame(paused ? 0 : dt, playing ? sim : null);
  if (stage.st.low && stage.kind === '3d' && !save.set.low && !AUTO) { save.set.low = true; persist(); makeStage(true).then(() => { applySkin(); if (playing) { stage.setChapter(level.daily ? level.c : level.c); stage.reset(sim); } }); }   // too slow even at low resolution -> 2D path
  requestAnimationFrame(tick);
}

// ---------- new version strip + PWA ----------
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').then(reg => {
    const offer = w => { if (!w || $('#update')) return; const b = h('<button id="update">새 버전이 있어요 · 눌러서 새로 고침</button>'); b.onclick = () => { w.postMessage('skip'); }; frame.append(b); };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => { const w = reg.installing; w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); }); });
    setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
  }).catch(() => {});
  const hadWorker = !!navigator.serviceWorker.controller; let reloaded = false;   // only an update reloads the page, never the first install
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadWorker && !reloaded) { reloaded = true; location.reload(); } });
}

// ---------- test hooks: scripted play-through without waiting on the display ----------
window.__ll = {
  get sim() { return sim; }, get save() { return save; }, get stage() { return stage; }, get level() { return level; },
  start: (c, s, o) => startNight(c, s, o), map: () => showMap(), title: () => showTitle(),
  // run game time forward synchronously (draws a frame now and then so the renderer is exercised too)
  run(seconds, step = 1 / 30) { let n = 0; for (let t = 0; t < seconds && sim && !sim.done; t += step) { stage.st.freeze = 0; advance(step); if (++n % 20 === 0) stage.frame(step, sim); } stage.frame(step, sim); updateHud(0); return sim ? { phase: sim.phase, t: sim.t, windows: sim.windows, kills: sim.kills, enemies: sim.enemies.length } : null; },
  playNight(c, s, o = {}) { startNight(c, s, { bot: true, ...o }); this.run(400); silentEnd = !!o.quiet; const r = finishNight(); silentEnd = false; return { name: level.name, ...r }; },
  buyAll() { for (;;) { const u = UPGRADES.filter(x => (save.up[x.id] || 0) < x.cost.length && (x.ch == null || chapterOpen(x.ch))).sort((a, b) => a.cost[save.up[a.id] || 0] - b.cost[save.up[b.id] || 0])[0]; if (!u || u.cost[save.up[u.id] || 0] > save.sparkles) return save.up; save.sparkles -= u.cost[save.up[u.id] || 0]; save.up[u.id] = (save.up[u.id] || 0) + 1; } },
  lightAll(c) { for (const v of VILLAGE) if (!litOf(c).includes(v.id) && save.oil >= v.cost) { save.oil -= v.cost; save.lit[c] = [...litOf(c), v.id]; } return litOf(c); },
  festival(c) { viewCh = c; tab = 'town'; save.festival[c] = true; showMap(); stage.setTown(litOf(c), true); showFestival(); },
  frame: (dt = 1 / 30) => stage.frame(dt, playing ? sim : null),
};
showTitle();
requestAnimationFrame(tick);
