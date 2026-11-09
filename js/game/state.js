// Explicit game states with allowed transitions.
//   menu -> ready -> playing <-> paused
//   playing -> completed | gameover | victory ; those three -> playing (restart)
const NEXT = {
  boot: ['menu', 'ready'], menu: ['ready'], ready: ['playing'], playing: ['paused', 'completed', 'gameover', 'victory'],
  paused: ['playing'], completed: ['playing'], gameover: ['playing'], victory: ['playing'],
};
export class GameState {
  constructor(onChange) { this.current = 'boot'; this.onChange = onChange; }
  is(...names) { return names.includes(this.current); }
  set(next) {
    if (next === this.current) return true;
    if (!NEXT[this.current].includes(next)) { console.warn(`Blocked state change ${this.current} -> ${next}`); return false; }
    const prev = this.current; this.current = next; this.onChange(next, prev); return true;
  }
}
