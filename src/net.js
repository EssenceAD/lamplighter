// 등불지기 — friends: tonight's ranking and the weekly league (Supabase project "clockfall").
// Only the publishable key is used; all writes go through the ll_submit function.
const URL = 'https://kbogamdispdcnxfnusci.supabase.co/rest/v1/rpc/';
const KEY = 'sb_publishable_dcgZxLuI8Z9DftA1XpuRAg_WHmEJJTz';
async function rpc(fn, body) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 7000);
  try {
    const r = await fetch(URL + fn, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), signal: ctl.signal });
    if (!r.ok) throw new Error(fn + ' ' + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
}
export const submitScore = (player, nick, score) => rpc('ll_submit', { p_player: player, p_nick: nick, p_score: Math.round(score) });
export const dailyTop = (n = 20) => rpc('ll_daily_top', { p_limit: n });
export const weeklyTop = (n = 20) => rpc('ll_weekly_top', { p_limit: n });
// the shared "day" is the Asia/Seoul calendar day, same as the server
export const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
