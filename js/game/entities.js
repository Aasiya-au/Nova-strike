// Reusable game objects: Player, Enemy (recycled per type), ProjectilePool, ExplosionPool, SparkPool.
// Geometry and materials are created once and shared.
import * as THREE from 'three';
const { clamp } = THREE.MathUtils;

const std = (color, glow = 0.5) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: glow, flatShading: true, roughness: 0.6, metalness: 0.2 });
const additive = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
const cached = (map, key, make) => { if (!map.has(key)) map.set(key, make(key)); return map.get(key); };

const M = {
  hull: new THREE.MeshStandardMaterial({ color: 0xdde6ff, emissive: 0x223355, emissiveIntensity: 0.3, flatShading: true, metalness: 0.4, roughness: 0.4 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x241d45, flatShading: true, metalness: 0.5, roughness: 0.5 }),
  rock: new THREE.MeshStandardMaterial({ color: 0x8a6a52, flatShading: true, roughness: 1 }),
  red: std(0xff3355), magenta: std(0xff44ff), amber: std(0xffcc00),
  eyeRed: new THREE.MeshBasicMaterial({ color: 0xff8899 }), eyePink: new THREE.MeshBasicMaterial({ color: 0xffaaff }), eyeAmber: new THREE.MeshBasicMaterial({ color: 0xffee88 }),
  cockpit: new THREE.MeshBasicMaterial({ color: 0x9ff4ff }), white: new THREE.MeshBasicMaterial({ color: 0xffffff }),
};
const G = {
  box: new THREE.BoxGeometry(1, 1, 1), sphere: new THREE.SphereGeometry(1, 12, 10), octa: new THREE.OctahedronGeometry(1),
  cone: new THREE.ConeGeometry(1, 1, 6), cyl: new THREE.CylinderGeometry(1, 1, 1, 8), rock: new THREE.DodecahedronGeometry(1),
};
const part = (geo, mat, { pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0] } = {}) => {
  const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.scale.set(...scale); m.rotation.set(...rot); m.userData.orig = mat; return m;
};
const group = (...kids) => { const g = new THREE.Group(); g.add(...kids); return g; };
const accentMats = new Map(), flameMats = new Map(), muzzleMats = new Map();
const accentMat = (c) => cached(accentMats, c, (k) => std(k, 0.55));
const flameMat = (c) => cached(flameMats, c, (k) => new THREE.MeshBasicMaterial({ color: k }));
const muzzleMat = (c) => cached(muzzleMats, c, (k) => additive(k, 0.9));

/** Segment-vs-sphere test, so fast projectiles can't tunnel through a target between frames. */
const _ab = new THREE.Vector3(), _ac = new THREE.Vector3();
export function segmentHitsSphere(a, b, center, r) {
  _ab.subVectors(b, a); const len2 = _ab.lengthSq();
  const t = len2 > 0 ? clamp(_ac.subVectors(center, a).dot(_ab) / len2, 0, 1) : 0;
  return _ac.copy(_ab).multiplyScalar(t).add(a).distanceToSquared(center) <= r * r;
}

// ---------------- Player (nose points to -Z, away from the chase camera) ----------------
function buildShip(accent) {
  const a = accentMat(accent), flames = [-0.5, 0.5].map((x) => part(G.sphere, flameMat(accent), { pos: [x, 0, 1.3], scale: [0.2, 0.2, 0.55] }));
  const muzzle = part(G.sphere, muzzleMat(accent), { pos: [0, 0, -1.8], scale: [0.01, 0.01, 0.01] }); muzzle.visible = false;
  const g = group(
    part(G.cone, M.hull, { scale: [0.6, 2.9, 0.6], rot: [-Math.PI / 2, 0, 0] }),
    part(G.sphere, M.cockpit, { pos: [0, 0.3, 0.1], scale: [0.28, 0.2, 0.55] }),
    part(G.box, a, { pos: [-1.05, 0, 0.55], scale: [1.8, 0.07, 1.0], rot: [0, 0.35, 0.08] }),
    part(G.box, a, { pos: [1.05, 0, 0.55], scale: [1.8, 0.07, 1.0], rot: [0, -0.35, -0.08] }),
    part(G.box, a, { pos: [0, 0.4, 0.85], scale: [0.08, 0.65, 0.7] }),
    part(G.cyl, M.dark, { pos: [-0.5, 0, 0.95], scale: [0.18, 0.55, 0.18], rot: [Math.PI / 2, 0, 0] }),
    part(G.cyl, M.dark, { pos: [0.5, 0, 0.95], scale: [0.18, 0.55, 0.18], rot: [Math.PI / 2, 0, 0] }),
    muzzle, ...flames);
  g.userData.flames = flames; g.userData.muzzle = muzzle; return g;
}

export class Player {
  constructor(accent, { speed = 13, bounds = { x: 9, y: 5 } } = {}) {
    this.mesh = buildShip(accent); this.vel = new THREE.Vector3(); this.speed = speed; this.bounds = bounds; this.t = 0; this.flash = 0;
  }
  reset() { this.mesh.position.set(0, 0, 0); this.mesh.rotation.set(0, 0, 0); this.vel.set(0, 0, 0); this.flash = 0; this.mesh.visible = true; }
  /** Shooting animation: muzzle flash at the nose. */
  fire() { this.flash = 1; }
  update(dt, ax, ay) {
    this.t += dt;
    const k = 1 - Math.exp(-10 * dt), p = this.mesh.position, v = this.vel, b = this.bounds, u = this.mesh.userData;
    v.x += (ax * this.speed - v.x) * k; v.y += (ay * this.speed - v.y) * k;
    p.x = clamp(p.x + v.x * dt, -b.x, b.x); p.y = clamp(p.y + v.y * dt, -b.y, b.y);
    if (Math.abs(p.x) >= b.x) v.x = 0; if (Math.abs(p.y) >= b.y) v.y = 0;
    this.mesh.rotation.z += (-v.x * 0.045 - this.mesh.rotation.z) * k;
    this.mesh.rotation.x += (v.y * 0.02 - this.mesh.rotation.x) * k;
    const f = 0.55 * (1 + Math.sin(this.t * 40) * 0.25); u.flames[0].scale.z = f; u.flames[1].scale.z = f;
    this.flash = Math.max(0, this.flash - dt * 14);
    u.muzzle.visible = this.flash > 0.02; u.muzzle.scale.setScalar(0.15 + this.flash * 0.5);
  }
}

// ---------------- Enemies (nose points to +Z, toward the player) ----------------
export const ENEMY_TYPES = {
  drone:    { hp: 1, points: 100, radius: 1.1, speed: 14, counts: true,  color: 0xff3355 },
  gunner:   { hp: 2, points: 250, radius: 1.4, speed: 10, counts: true,  color: 0xff44ff, fire: 2, hold: -55 },
  weaver:   { hp: 2, points: 300, radius: 1.2, speed: 12, counts: true,  color: 0xffcc00, fire: 1.3 },
  asteroid: { hp: 3, points: 50,  radius: 1.7, speed: 16, counts: false, color: 0xffa060, damage: 20 },
};
const withEye = (g, eye) => { eye.userData.base = eye.scale.x; g.userData.eye = eye; return g; };
const BUILD = {
  drone: () => { const eye = part(G.sphere, M.eyeRed, { scale: [0.25, 0.25, 0.25], pos: [0, 0, 1.2] });
    return withEye(group(part(G.octa, M.red, { scale: [0.9, 0.5, 1.4] }), part(G.box, M.dark, { scale: [3.0, 0.08, 0.7], pos: [0, 0, -0.2] }), eye), eye); },
  gunner: () => { const eye = part(G.sphere, M.eyePink, { scale: [0.3, 0.3, 0.3], pos: [0, 0.45, 0.6] });
    return withEye(group(part(G.box, M.magenta, { scale: [1.8, 0.7, 2.4] }), part(G.cyl, M.dark, { scale: [0.22, 1.7, 0.22], pos: [0, 0, 1.8], rot: [Math.PI / 2, 0, 0] }),
      part(G.sphere, M.dark, { scale: [0.5, 0.5, 0.8], pos: [-1.3, 0, 0] }), part(G.sphere, M.dark, { scale: [0.5, 0.5, 0.8], pos: [1.3, 0, 0] }), eye), eye); },
  weaver: () => { const eye = part(G.sphere, M.eyeAmber, { scale: [0.2, 0.2, 0.2], pos: [0, 0.25, 0.4] });
    return withEye(group(part(G.cone, M.amber, { scale: [0.7, 2.4, 0.7], rot: [Math.PI / 2, 0, 0] }),
      part(G.box, M.dark, { scale: [2.4, 0.06, 0.6], pos: [-1.1, 0, -0.4], rot: [0, 0.6, 0] }), part(G.box, M.dark, { scale: [2.4, 0.06, 0.6], pos: [1.1, 0, -0.4], rot: [0, -0.6, 0] }), eye), eye); },
  asteroid: () => group(part(G.rock, M.rock, { scale: [1.7, 1.7, 1.7] })),
};

const CHARGE = 0.5;   // seconds an enemy visibly charges before firing (reaction time)

class Enemy {
  constructor(type) {
    this.type = type; this.def = ENEMY_TYPES[type]; this.mesh = BUILD[type](); this.mesh.userData.enemy = this;
    this.spin = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.prev = new THREE.Vector3(); this.flashT = 0;
  }
  reset(x, y, speedMul, mods = {}) {
    const d = this.def; this.unflash(); this.setCharge(0);
    Object.assign(this, { hp: d.hp, t: Math.random() * 6, speedMul, fireT: Math.random(), radius: d.radius, holding: false, holdT: 0,
      fireInterval: mods.fire ?? d.fire, burst: mods.burst ?? 1, spread: mods.spread ?? 1, burstLeft: 0, burstT: 0 });
    this.baseX = this.type === 'gunner' || this.type === 'weaver' ? clamp(x, -5, 5) : x; this.baseY = y;
    this.holdZ = (d.hold ?? 0) + (Math.random() * 14 - 8);
    this.mesh.position.set(this.baseX, y, -120); this.mesh.rotation.set(0, 0, 0); this.mesh.scale.setScalar(1);
    this.prev.copy(this.mesh.position); this.vel.set(0, 0, 0);
    if (this.type === 'asteroid') {
      const s = 0.8 + Math.random() * 0.6; this.mesh.scale.setScalar(s); this.radius = d.radius * s;
      this.spin.set(Math.random() - 0.5, Math.random() - 0.5, 0).multiplyScalar(2.5);
    }
  }
  /** Hit effect: the whole ship flashes white for a moment. */
  hitFlash() { this.flashT = 0.09; this.mesh.traverse((o) => { if (o.isMesh) o.material = M.white; }); }
  unflash() { this.flashT = 0; this.mesh.traverse((o) => { if (o.isMesh) o.material = o.userData.orig; }); }
  setCharge(c) { const eye = this.mesh.userData.eye; if (eye && this.charge !== c) { this.charge = c; eye.scale.setScalar(eye.userData.base * (1 + c * 2.5)); } }
}
const freeEnemies = { drone: [], gunner: [], weaver: [], asteroid: [] };
export const spawnEnemy = (type, x, y, mul, mods) => { const e = freeEnemies[type].pop() || new Enemy(type); e.reset(x, y, mul, mods); return e; };
export const releaseEnemy = (e) => freeEnemies[e.type].push(e);

/** Movement patterns and firing. `ship` is the player position; `shoot(pos)` fires an enemy bolt. */
export function updateEnemy(e, dt, ship, shoot) {
  const d = e.def, m = e.mesh, p = m.position; e.t += dt;
  if (e.flashT > 0 && (e.flashT -= dt) <= 0) e.unflash();
  const step = d.speed * e.speedMul * dt;
  switch (e.type) {
    case 'drone':       // charges, drifting toward the player's lane
      p.z += step; p.x += clamp(ship.x - p.x, -1, 1) * 3 * dt; p.y += clamp(ship.y - p.y, -1, 1) * 3 * dt; m.rotation.z += dt * 3; break;
    case 'gunner':      // closes to range, then strafes and shoots
      if (!e.holding && p.z >= e.holdZ) { e.holding = true; e.holdX = p.x; e.holdY = p.y; }
      if (e.holding) { e.holdT += dt; p.x = clamp(e.holdX + Math.sin(e.holdT * 0.9) * 5, -10, 10); p.y = e.holdY + Math.sin(e.holdT * 1.3) * 1.5; m.rotation.z = Math.sin(e.holdT * 0.9) * 0.25; }
      else p.z += step;
      break;
    case 'weaver':      // sine-wave approach with banking
      p.z += step; p.x = e.baseX + Math.sin(e.t * 2.2) * 4.5; p.y = e.baseY + Math.sin(e.t * 1.7) * 1.5; m.rotation.z = Math.cos(e.t * 2.2) * 0.7; break;
    default:            // asteroid: straight drift, tumbling
      p.z += step; m.rotation.x += e.spin.x * dt; m.rotation.y += e.spin.y * dt;
  }
  // Fire only while in view and not point-blank; the eye swells for CHARGE seconds first, so shots can be seen coming.
  if (e.burstLeft > 0 && (e.burstT -= dt) <= 0) { shoot(p, e); e.burstLeft--; e.burstT = 0.16; }   // rest of a burst volley
  if (e.fireInterval && p.z > -95 && p.z < -12 && (e.type !== 'gunner' || e.holding)) {
    e.fireT += dt; e.setCharge(clamp((e.fireT - (e.fireInterval - CHARGE)) / CHARGE, 0, 1));
    if (e.fireT >= e.fireInterval) { e.fireT = 0; e.setCharge(0); shoot(p, e); e.burstLeft = e.burst - 1; e.burstT = 0.16; }
  } else e.setCharge(0);
  if (dt > 0) { e.vel.copy(p).sub(e.prev).divideScalar(dt); e.prev.copy(p); }
}

// ---------------- Projectiles: visually distinct for player and enemy ----------------
const haloMats = new Map();
const halo = (c, o) => cached(haloMats, `${c}-${o}`, () => additive(c, o));
/** Player bolt: a long, thin laser streak with a soft glow, oriented along its flight path. */
export const makePlayerBolt = (color) => group(
  part(G.cyl, M.white, { scale: [0.08, 1.7, 0.08], rot: [Math.PI / 2, 0, 0] }),
  part(G.cyl, halo(color, 0.5), { scale: [0.24, 2.1, 0.24], rot: [Math.PI / 2, 0, 0] }));
/** Enemy bolt: a round, pulsing plasma orb. */
export const makeEnemyBolt = (color) => group(
  part(G.sphere, M.eyePink, { scale: [0.3, 0.3, 0.3] }),
  part(G.sphere, halo(color, 0.5), { scale: [0.7, 0.7, 0.7] }));

export class ProjectilePool {
  constructor(scene, { make, size = 48, orient = false, pulse = false }) {
    this.free = []; this.active = []; this.orient = orient; this.pulse = pulse;
    for (let i = 0; i < size; i++) {
      const mesh = make(); mesh.visible = false; scene.add(mesh);
      this.free.push({ mesh, vel: new THREE.Vector3(), prev: new THREE.Vector3(), life: 0, age: 0 });
    }
  }
  fire(pos, vel, life) {
    const p = this.free.pop(); if (!p) return false;
    p.mesh.position.copy(pos); p.prev.copy(pos); p.vel.copy(vel); p.life = life; p.age = 0; p.mesh.scale.setScalar(1);
    if (this.orient) p.mesh.lookAt(pos.x + vel.x, pos.y + vel.y, pos.z + vel.z);
    p.mesh.visible = true; this.active.push(p); return true;
  }
  /** Moves bolts by dt. `consume(pos, prevPos)` returns true when a bolt hit something; that bolt is recycled at once (one hit per bolt). */
  update(dt, consume) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i]; if (!p) continue;
      const pos = p.mesh.position;
      p.prev.copy(pos); pos.addScaledVector(p.vel, dt); p.life -= dt; p.age += dt;
      if (this.pulse) p.mesh.scale.setScalar(1 + 0.2 * Math.sin(p.age * 18));
      const out = p.life <= 0 || pos.z > 15 || pos.z < -260 || Math.abs(pos.x) > 120 || Math.abs(pos.y) > 80;
      if (out || consume(pos, p.prev)) this.release(i);
    }
  }
  release(i) { const p = this.active[i]; if (!p) return; p.mesh.visible = false; this.active.splice(i, 1); this.free.push(p); }
  clear() { while (this.active.length) this.release(this.active.length - 1); }
}

export class ExplosionPool {
  constructor(scene, size = 24) {
    this.free = []; this.active = [];
    for (let i = 0; i < size; i++) {
      const mesh = new THREE.Mesh(G.sphere, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
      mesh.visible = false; scene.add(mesh); this.free.push({ mesh, t: 0, size: 1 });
    }
  }
  spawn(pos, color, size = 1) {
    const e = this.free.pop() || this.active.shift(); if (!e) return;
    this.active.push(e); e.t = 0; e.size = size; e.mesh.material.color.setHex(color); e.mesh.position.copy(pos); e.mesh.visible = true;
  }
  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i]; e.t += dt;
      e.mesh.scale.setScalar((0.5 + e.t * 6) * e.size); e.mesh.material.opacity = Math.max(0, 0.9 - e.t * 2.4);
      if (e.t > 0.4) { e.mesh.visible = false; this.active.splice(i, 1); this.free.push(e); }
    }
  }
  clear() { while (this.active.length) { const e = this.active.pop(); e.mesh.visible = false; this.free.push(e); } }
}

/** Small glowing fragments thrown out on impacts. */
const sparkMats = new Map();
export class SparkPool {
  constructor(scene, size = 96) {
    this.free = []; this.active = [];
    for (let i = 0; i < size; i++) {
      const mesh = new THREE.Mesh(G.sphere, M.white); mesh.visible = false; scene.add(mesh);
      this.free.push({ mesh, vel: new THREE.Vector3(), life: 0, max: 1 });
    }
  }
  spawn(pos, color, count = 8, speed = 9) {
    for (let i = 0; i < count; i++) {
      const s = this.free.pop(); if (!s) return;
      s.mesh.material = cached(sparkMats, color, (c) => additive(c, 1)); s.mesh.position.copy(pos);
      s.vel.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      s.max = s.life = 0.3 + Math.random() * 0.25; s.mesh.visible = true; this.active.push(s);
    }
  }
  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const s = this.active[i]; s.life -= dt; s.mesh.position.addScaledVector(s.vel, dt); s.mesh.scale.setScalar(Math.max(0.001, 0.12 * (s.life / s.max)));
      if (s.life <= 0) { s.mesh.visible = false; this.active.splice(i, 1); this.free.push(s); }
    }
  }
  clear() { while (this.active.length) { const s = this.active.pop(); s.mesh.visible = false; this.free.push(s); } }
}
