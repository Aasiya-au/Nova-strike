// Keyboard, mouse and touch input. Mouse/touch aiming is stored as normalized device coordinates (ndc) for the Raycaster.
// Pass an AbortSignal and every listener this class adds is removed when it aborts (page leave / cleanup).
export class Input {
  constructor(canvas, { wrap, onPause, onMute, signal }) {
    this.keys = new Set(); this.mouseDown = false; this.touchFire = false; this.stick = { x: 0, y: 0 };
    this.ndc = { x: 0, y: 0 }; this.x = 0; this.y = 0; this.w = 1; this.h = 1; this.aimed = false; this.knob = null; this.signal = signal;
    wrap.classList.toggle('touch', matchMedia('(pointer: coarse)').matches);
    const opt = { signal };

    const blocked = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ']);
    addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (blocked.has(k)) e.preventDefault();
      if (!e.repeat) { if (k === 'p' || k === 'escape') onPause(); else if (k === 'm') onMute(); }
      this.keys.add(k);
    }, opt);
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()), opt);
    addEventListener('blur', () => this.reset(), opt);

    const aimAt = (e) => {
      const r = canvas.getBoundingClientRect();
      this.x = e.clientX - r.left; this.y = e.clientY - r.top; this.aimed = true;
      this.ndc.x = (this.x / r.width) * 2 - 1; this.ndc.y = -(this.y / r.height) * 2 + 1;
    };
    canvas.addEventListener('pointermove', aimAt, opt);
    canvas.addEventListener('pointerdown', (e) => {
      aimAt(e);
      if (e.pointerType === 'touch') wrap.classList.add('touch');             // touch drag only aims; the FIRE button shoots
      else if (e.button === 0) this.mouseDown = true;
    }, opt);
    addEventListener('pointerup', (e) => { if (e.pointerType !== 'touch') this.mouseDown = false; }, opt);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault(), opt);
  }

  setSize(w, h) {   // keep the crosshair centred until the player first aims
    this.w = w; this.h = h;
    if (!this.aimed) { this.x = w / 2; this.y = h / 2; this.ndc.x = 0; this.ndc.y = 0; }
  }

  bindStick(stick, knob) {
    this.knob = knob; const R = 48, opt = { signal: this.signal }; let id = null;
    const set = (e) => {
      const r = stick.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      this.stick.x = dx / R; this.stick.y = -dy / R; knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    stick.addEventListener('pointerdown', (e) => { e.preventDefault(); id = e.pointerId; stick.setPointerCapture(id); set(e); }, opt);
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); }, opt);
    const end = (e) => { if (e.pointerId !== id) return; id = null; this.stick.x = this.stick.y = 0; knob.style.transform = ''; };
    stick.addEventListener('pointerup', end, opt); stick.addEventListener('pointercancel', end, opt);
  }

  bindFire(btn) {
    const opt = { signal: this.signal };
    const on = (v) => (e) => { e.preventDefault(); this.touchFire = v; btn.classList.toggle('active', v); if (v) btn.setPointerCapture(e.pointerId); };
    btn.addEventListener('pointerdown', on(true), opt); btn.addEventListener('pointerup', on(false), opt); btn.addEventListener('pointercancel', on(false), opt);
  }

  // No arrays or closures here: these run every frame.
  get moveX() {
    const k = this.keys, v = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0) + (Math.abs(this.stick.x) > 0.15 ? this.stick.x : 0);
    return v > 1 ? 1 : v < -1 ? -1 : v;
  }
  get moveY() {
    const k = this.keys, v = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0) + (Math.abs(this.stick.y) > 0.15 ? this.stick.y : 0);
    return v > 1 ? 1 : v < -1 ? -1 : v;
  }
  get firing() { return this.mouseDown || this.touchFire || this.keys.has(' '); }
  reset() { this.keys.clear(); this.mouseDown = false; this.touchFire = false; this.stick.x = this.stick.y = 0; if (this.knob) this.knob.style.transform = ''; }
}
