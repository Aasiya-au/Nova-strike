// Procedural sound effects (WebAudio, no audio files). The context starts on the first user gesture.
export class Sfx {
  constructor() { this.ctx = null; this.muted = localStorage.getItem('ns-muted') === '1'; this.last = {}; }
  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.5; this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  setMuted(m) {
    this.muted = m; try { localStorage.setItem('ns-muted', m ? '1' : '0'); } catch { /* storage may be unavailable */ }
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }
  tone({ type = 'square', f0, f1 = f0, dur = 0.1, vol = 0.15, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  noise({ dur = 0.2, vol = 0.25, lp = 1200 }) {
    if (!this.ctx || this.muted) return;
    if (!this.buf) { this.buf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate); const d = this.buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const t = this.ctx.currentTime, s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.buf; f.type = 'lowpass'; f.frequency.value = lp; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.master); s.start(t); s.stop(t + dur);
  }
  once(name, gap, fn) { const now = performance.now(); if (now - (this.last[name] || 0) < gap * 1000) return; this.last[name] = now; fn(); }
  shoot()      { this.once('shoot', 0.05, () => this.tone({ type: 'square', f0: 900, f1: 200, dur: 0.09, vol: 0.07 })); }
  enemyShoot() { this.once('eshoot', 0.1, () => this.tone({ type: 'sawtooth', f0: 320, f1: 110, dur: 0.2, vol: 0.06 })); }
  hit()        { this.once('hit', 0.04, () => { this.noise({ dur: 0.06, vol: 0.12, lp: 3000 }); this.tone({ type: 'triangle', f0: 520, f1: 200, dur: 0.06, vol: 0.1 }); }); }
  explode()    { this.noise({ dur: 0.45, vol: 0.3, lp: 700 }); this.tone({ type: 'sine', f0: 130, f1: 40, dur: 0.4, vol: 0.25 }); }
  hurt()       { this.tone({ type: 'sawtooth', f0: 170, f1: 50, dur: 0.28, vol: 0.2 }); this.noise({ dur: 0.15, vol: 0.2, lp: 1500 }); }
  win()        { [523, 659, 784, 1047].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.18, vol: 0.14, delay: i * 0.12 })); }
  lose()       { [400, 320, 240, 160].forEach((f, i) => this.tone({ type: 'sawtooth', f0: f, f1: f * 0.8, dur: 0.22, vol: 0.12, delay: i * 0.15 })); }
}
