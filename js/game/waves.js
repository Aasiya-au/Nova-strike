// Wave sequencing driven entirely by the level config. Only advances when update() is called, so it freezes while paused.
const totalOf = (w) => (w ? w.spawn.reduce((a, [, n]) => a + n, 0) : 0);
function shuffled(list) { for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } return list; }

export class WaveManager {
  constructor(waves) { this.waves = waves; this.reset(); }
  reset() { this.index = -1; this.queue = []; this.spawnT = 0; this.hazT = 0; this.gap = 1.2; this.state = 'gap'; this.done = false; }
  get total() { return this.waves.length; }
  get number() { return Math.max(1, this.index + 1); }
  get current() { return this.waves[this.index]; }
  /** An enemy that escaped past the player goes back into the wave, so every ship must be defeated. */
  requeue(type) { if (!this.done) this.queue.push(type); }
  remaining(alive) { return this.done ? 0 : this.queue.length + alive + (this.state === 'gap' ? totalOf(this.waves[this.index + 1]) : 0); }

  /** Returns 'wave' (a wave just began), 'cleared' (wave beaten), 'complete' (final wave beaten) or null. */
  update(dt, alive, spawn) {
    if (this.done) return null;
    if (this.state === 'gap') {
      if ((this.gap -= dt) > 0) return null;
      this.index++; const w = this.waves[this.index]; this.state = 'active'; this.spawnT = 0.6; this.hazT = w.hazards ? 1.5 : 0;
      this.queue = shuffled(w.spawn.flatMap(([type, n]) => Array(n).fill(type))); return 'wave';
    }
    const w = this.current;
    // `alive` was counted before this call, so count the enemy we spawn right now too; otherwise the last spawn of a wave
    // would look like an empty field and the wave would end with that enemy still alive.
    if (this.queue.length && alive < w.maxAlive && (this.spawnT -= dt) <= 0) { spawn(this.queue.shift()); this.spawnT = w.interval; alive++; }
    if (w.hazards && (this.hazT -= dt) <= 0) { this.hazT = w.hazards; spawn('asteroid'); }
    if (!this.queue.length && alive === 0) {
      if (this.index >= this.waves.length - 1) { this.done = true; return 'complete'; }
      this.state = 'gap'; this.gap = 2.4; return 'cleared';
    }
    return null;
  }
}
