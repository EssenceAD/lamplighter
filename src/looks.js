// which silhouette each enemy wears (shared by both renderers)
const WALKERS = ['w_ant', 'w_horn', 'w_ear'];
export const lookOf = e => e.type === 'walker' ? WALKERS[e.v % 3] : e.type === 'boss' ? 'boss_' + e.boss : { fast: 'e_fast', fat: 'e_fat', umbrella: 'e_umb', color: 'e_color' }[e.type];
