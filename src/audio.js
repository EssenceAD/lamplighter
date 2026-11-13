// 등불지기 — sound, all made in the browser with WebAudio (no audio files).
// Music: a warm little waltz for cello and accordion (bright but wistful). No chiptune, no music box.
// Nothing plays until the player has touched the screen; ?mute keeps it silent (used in tests).
const MUTED = new URLSearchParams(location.search).has('mute');
let ctx = null, master, musicBus, sfxBus, noiseBuf, nextBar = 0, bar = 0, mood = 'menu';
const set = { music: true, sfx: true, mv: 0.6, sv: 0.8 };
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
// waltz in D: bars of [bass, chord tones, melody notes (midi, beat, length)]
const PROG = [
  [38, [57, 62, 66], [[74, 0, 2], [78, 2, 1]]], [35, [59, 62, 66], [[76, 0, 1], [74, 1, 1], [71, 2, 1]]],
  [43, [59, 62, 67], [[74, 0, 2], [71, 2, 1]]], [45, [57, 61, 64], [[73, 0, 3]]],
  [38, [57, 62, 66], [[78, 0, 2], [81, 2, 1]]], [42, [57, 61, 66], [[80, 0, 1], [78, 1, 1], [76, 2, 1]]],
  [43, [59, 62, 67], [[79, 0, 1], [78, 1, 1], [76, 2, 1]]], [45, [55, 61, 64], [[76, 0, 2], [73, 2, 1]]],
  [35, [59, 62, 66], [[74, 0, 2], [78, 2, 1]]], [40, [59, 64, 67], [[79, 0, 2], [76, 2, 1]]],
  [45, [57, 61, 64], [[76, 0, 1], [73, 1, 1], [69, 2, 1]]], [38, [57, 62, 66], [[74, 0, 3]]],
];
function env(g, t, a, peak, d, rel, end) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.linearRampToValueAtTime(peak * d, t + a + 0.12); g.gain.setTargetAtTime(0.0001, end, rel); }
function cello(m, t, dur, vol) { // bowed: saw through a soft low-pass, slow attack, a little vibrato
  const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), l = ctx.createOscillator(), lg = ctx.createGain();
  o.type = 'sawtooth'; o.frequency.value = hz(m); f.type = 'lowpass'; f.frequency.value = 620; f.Q.value = 0.8; l.frequency.value = 5.2; lg.gain.value = hz(m) * 0.006;
  l.connect(lg); lg.connect(o.frequency); o.connect(f); f.connect(g); g.connect(musicBus); env(g, t, 0.09, vol, 0.8, 0.12, t + dur * 0.9);
  o.start(t); l.start(t); o.stop(t + dur + 0.6); l.stop(t + dur + 0.6);
}
function reed(m, t, dur, vol) { // accordion: two slightly detuned reeds, nasal band, bellows swell
  const g = ctx.createGain(), f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.55;
  for (const d of [-7, 8]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = hz(m); o.detune.value = d; o.connect(f); o.start(t); o.stop(t + dur + 0.4); }
  f.connect(g); g.connect(musicBus); env(g, t, 0.05, vol, 0.85, 0.07, t + dur * 0.85);
}
function schedule() {
  if (!ctx || !set.music) return;
  const beat = mood === 'night' ? 0.42 : mood === 'festival' ? 0.36 : 0.5;
  if (nextBar < ctx.currentTime) nextBar = ctx.currentTime + 0.05;
  while (nextBar < ctx.currentTime + 0.6) {
    const [bass, chord, mel] = PROG[bar % PROG.length], t = nextBar, quiet = mood === 'menu' ? 0.8 : 1;
    cello(bass, t, beat * 2.6, 0.2 * quiet);
    for (const b of [1, 2]) for (const n of chord) reed(n, t + beat * b, beat * 0.55, 0.028 * quiet);
    if (mood !== 'hush') for (const [n, b, l] of mel) reed(n, t + beat * b, beat * l * 0.95, 0.06 * quiet);
    if (mood === 'festival' || bar % 4 === 3) cello(bass + 12, t + beat * 2, beat * 0.9, 0.1);
    nextBar += beat * 3; bar++;
  }
}
function apply() { if (!ctx) return; musicBus.gain.setTargetAtTime(set.music ? set.mv * 0.9 : 0, ctx.currentTime, 0.08); sfxBus.gain.setTargetAtTime(set.sfx ? set.sv : 0, ctx.currentTime, 0.03); }
export function unlock() {
  if (MUTED) return;
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC(); master = ctx.createDynamicsCompressor(); master.connect(ctx.destination);
  musicBus = ctx.createGain(); sfxBus = ctx.createGain(); musicBus.connect(master); sfxBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  apply(); nextBar = ctx.currentTime + 0.15; setInterval(schedule, 120);
}
export function configure(s) { Object.assign(set, s); apply(); }
export function setMood(m) { mood = m; }
export const isMuted = () => MUTED;
function noise(t, dur, freq, q, vol, sweepTo) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noiseBuf; s.loop = true; f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t); s.stop(t + dur + 0.05);
}
function tone(t, f0, f1, dur, vol, type = 'sine') {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur + 0.05);
}
let lastPop = 0;
export function sfx(name) {
  if (!ctx || !set.sfx) return; const t = ctx.currentTime;
  if (name === 'pop') { if (t - lastPop < 0.05) return; lastPop = t; tone(t, 320, 880, 0.09, 0.22); noise(t, 0.12, 3200, 1.2, 0.1); noise(t + 0.03, 0.16, 5200, 2, 0.05); } // pop + paper
  else if (name === 'rustle') { noise(t, 0.09, 4200, 1.5, 0.09); noise(t + 0.06, 0.1, 2600, 1.2, 0.07); } // paper rustle
  else if (name === 'flash') { noise(t, 0.7, 500, 0.9, 0.3, 5200); tone(t, 180, 60, 0.5, 0.22); } // whoosh
  else if (name === 'sparkle') { [1568, 2093, 2637].forEach((f, i) => tone(t + i * 0.055, f, f * 1.01, 0.22, 0.07)); } // tinkle
  else if (name === 'snuff') { noise(t, 0.35, 900, 0.8, 0.2, 200); tone(t, 420, 110, 0.3, 0.1, 'triangle'); } // candle out
  else if (name === 'win') [587, 740, 880, 1175].forEach((f, i) => tone(t + i * 0.13, f, f, 0.5, 0.11, 'triangle'));
  else if (name === 'lose') [392, 330, 262].forEach((f, i) => tone(t + i * 0.2, f, f * 0.97, 0.6, 0.1, 'triangle'));
  else if (name === 'tap') tone(t, 660, 520, 0.05, 0.07, 'triangle');
}
export function onEvent(e) {
  if (e.type === 'kill') { sfx('pop'); if (e.sparkle) sfx('sparkle'); }
  else if (e.type === 'flash') sfx('flash'); else if (e.type === 'window') sfx('snuff');
  else if (e.type === 'place' || e.type === 'rotate') sfx('rustle'); else if (e.type === 'won') sfx('win'); else if (e.type === 'lost') sfx('lose');
}
