// Moving space environment: parallax star layers, distant planets, and a drifting asteroid field.
// Geometries are shared; the rock field is a single InstancedMesh.
import * as THREE from 'three';

const SPHERE = new THREE.SphereGeometry(1, 32, 24);
const RING = new THREE.RingGeometry(1.35, 2.2, 64);
const ROCK = new THREE.DodecahedronGeometry(1);
const rand = (a, b) => a + Math.random() * (b - a);

class StarLayer {
  constructor(scene, { count, spread, depth, speed, size, color, opacity = 1 }) {
    Object.assign(this, { count, spread, depth, speed });
    this.pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) this.place(i, rand(-depth, 20));
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, fog: false, transparent: true, opacity, depthWrite: false }));
    this.points.frustumCulled = false; scene.add(this.points);
  }
  place(i, z) { const p = this.pos; p[i * 3] = rand(-0.5, 0.5) * this.spread[0]; p[i * 3 + 1] = rand(-0.5, 0.5) * this.spread[1]; p[i * 3 + 2] = z; }
  update(dt) {
    for (let i = 0; i < this.count; i++) if ((this.pos[i * 3 + 2] += this.speed * dt) > 20) this.place(i, -this.depth - rand(0, 20));
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

function makePlanet(def) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(SPHERE, new THREE.MeshStandardMaterial({ color: def.color, emissive: def.emissive ?? 0, roughness: 0.9, fog: false }));
  body.scale.setScalar(def.r); g.add(body);
  const glow = new THREE.Mesh(SPHERE, new THREE.MeshBasicMaterial({ color: def.glow ?? def.color, transparent: true, opacity: 0.14, side: THREE.BackSide, fog: false, depthWrite: false }));
  glow.scale.setScalar(def.r * 1.12); g.add(glow);
  if (def.ring) {
    const ring = new THREE.Mesh(RING, new THREE.MeshBasicMaterial({ color: def.ring.color, transparent: true, opacity: 0.45, side: THREE.DoubleSide, fog: false, depthWrite: false }));
    ring.scale.setScalar(def.r); ring.rotation.x = Math.PI / 2 + def.ring.tilt; g.add(ring);
  }
  g.position.set(...def.pos); g.userData = { body, spin: def.spin ?? 0.05 };
  return g;
}

class RockField {
  constructor(scene, { count, color }) {
    this.count = count; this.dummy = new THREE.Object3D();
    if (!count) { this.d = []; this.mesh = null; return; }
    this.mesh = new THREE.InstancedMesh(ROCK, new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1 }), count);
    this.mesh.frustumCulled = false;
    this.d = Array.from({ length: count }, (_, i) => {
      const d = {}; this.reset(d, true);
      this.mesh.setColorAt(i, new THREE.Color(color).offsetHSL(0, 0, rand(-0.08, 0.08))); return d;
    });
    this.mesh.instanceColor.needsUpdate = true; scene.add(this.mesh);
  }
  reset(d, initial) {   // rocks live outside the central play lane, so they never read as hittable enemies
    d.x = (Math.random() < 0.5 ? -1 : 1) * rand(16, 86); d.y = rand(-30, 30); d.z = initial ? rand(-250, 15) : -250 - rand(0, 20);
    d.s = rand(0.6, 3.2); d.v = rand(18, 32); d.rx = rand(-1, 1); d.ry = rand(-1, 1); d.ax = rand(0, 6); d.ay = rand(0, 6);
  }
  update(dt) {
    if (!this.mesh) return;
    for (let i = 0; i < this.d.length; i++) {
      const d = this.d[i];
      if ((d.z += d.v * dt) > 20) this.reset(d, false);
      d.ax += d.rx * dt; d.ay += d.ry * dt;
      this.dummy.position.set(d.x, d.y, d.z); this.dummy.rotation.set(d.ax, d.ay, 0); this.dummy.scale.setScalar(d.s);
      this.dummy.updateMatrix(); this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class Environment {
  constructor(scene, cfg) {
    const e = cfg.env;
    this.layers = [
      new StarLayer(scene, { count: 900, spread: [460, 280], depth: 260, speed: 12, size: 1.6, color: e.starColor }),
      new StarLayer(scene, { count: 450, spread: [220, 130], depth: 220, speed: 40, size: 1.0, color: e.starColor }),
      new StarLayer(scene, { count: 170, spread: [60, 40], depth: 120, speed: 75, size: 0.4, color: e.dustColor, opacity: 0.7 }),
    ];
    this.planets = e.planets.map(makePlanet); this.planets.forEach((p) => scene.add(p));
    this.rocks = new RockField(scene, { count: e.rocks, color: e.rockColor });
  }
  update(dt) {
    for (let i = 0; i < this.layers.length; i++) this.layers[i].update(dt);
    for (let i = 0; i < this.planets.length; i++) { const p = this.planets[i]; p.userData.body.rotation.y += p.userData.spin * dt; p.position.z += 0.8 * dt; }
    this.rocks.update(dt);
  }
}
