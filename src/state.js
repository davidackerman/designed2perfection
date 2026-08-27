// Shared run-state constants. Both game engines (the reflex "classic" game
// and the Simon-style sequence game) use the same three states, so main.js
// can treat whichever engine is active identically.

export const STATE = { TITLE: 'title', PLAYING: 'playing', OVER: 'over' };
