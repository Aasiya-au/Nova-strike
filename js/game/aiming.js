// Aiming: a Raycaster projects the cursor into the scene to pick a target; an invisible plane gives the aim point otherwise.
import * as THREE from 'three';

function buildMarker() {
  const mat = new THREE.MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.95, depthTest: false, fog: false, side: THREE.DoubleSide });
  const spin = new THREE.Group();
  spin.add(new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 40), mat));
  const tick = new THREE.BoxGeometry(0.3, 0.09, 0.01);
  [[1.3, 0, 0], [-1.3, 0, 0], [0, 1.3, Math.PI / 2], [0, -1.3, Math.PI / 2]].forEach(([x, y, r]) => {
    const m = new THREE.Mesh(tick, mat); m.position.set(x, y, 0); m.rotation.z = r; spin.add(m);
  });
  const g = new THREE.Group(); g.add(spin); g.userData.spin = spin; g.renderOrder = 20; g.traverse((o) => { o.renderOrder = 20; }); g.visible = false;
  return g;
}

export class Aimer {
  constructor(scene, camera, { planeZ = -60 } = {}) {
    this.camera = camera; this.ray = new THREE.Raycaster(); this.ray.far = 300;
    this.plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -planeZ);   // invisible plane at z = planeZ
    this.point = new THREE.Vector3(); this.target = null; this.tmp = new THREE.Vector3(); this.meshes = [];
    this.marker = buildMarker(); scene.add(this.marker);
  }

  /** Enemy under the cursor: exact mesh hit first, then a forgiving sphere test (small aim assist). */
  pick(enemies) {
    if (!enemies.length) return null;
    this.meshes.length = 0;
    for (let i = 0; i < enemies.length; i++) { enemies[i].mesh.updateMatrixWorld(true); this.meshes.push(enemies[i].mesh); }
    const hits = this.ray.intersectObjects(this.meshes, true);
    if (hits.length) { let o = hits[0].object; while (o && !o.userData.enemy) o = o.parent; if (o) return o.userData.enemy; }
    const { origin, direction } = this.ray.ray; let best = null, bestD = Infinity;
    for (const e of enemies) {
      const p = e.mesh.position, d = origin.distanceTo(p);
      if (this.tmp.subVectors(p, origin).dot(direction) <= 0) continue;           // behind the camera
      const r = e.radius * 1.4 + d * 0.025;
      if (d < bestD && this.ray.ray.distanceSqToPoint(p) <= r * r) { best = e; bestD = d; }
    }
    return best;
  }

  /** ndc: cursor in normalized device coordinates. `from` is the muzzle, `speed` the bolt speed (used to lead a locked target). */
  update(ndc, enemies, from, speed) {
    this.ray.setFromCamera(ndc, this.camera);
    this.target = this.pick(enemies);
    if (this.target) {
      const e = this.target; this.point.copy(e.mesh.position);
      for (let i = 0; i < 2; i++) this.point.copy(e.mesh.position).addScaledVector(e.vel, from.distanceTo(this.point) / speed);
      const m = this.marker, d = this.camera.position.distanceTo(e.mesh.position);
      m.visible = true; m.position.copy(e.mesh.position); m.quaternion.copy(this.camera.quaternion);
      m.scale.setScalar(Math.max(e.radius * 2.4, d * 0.05)); m.userData.spin.rotation.z = performance.now() * 0.002;
    } else {
      if (!this.ray.ray.intersectPlane(this.plane, this.point)) this.ray.ray.at(100, this.point);
      this.marker.visible = false;
    }
    return this.target;
  }
  /** Call after enemies have moved: puts the marker on the target's final position for this frame (or hides it if the target is gone). */
  sync() {
    const t = this.target, m = this.marker; if (!t) return;
    if (!t.mesh.parent) { m.visible = false; this.target = null; return; }
    const d = this.camera.position.distanceTo(t.mesh.position);
    m.position.copy(t.mesh.position); m.scale.setScalar(Math.max(t.radius * 2.4, d * 0.05));
  }
  hide() { this.marker.visible = false; this.target = null; }
}
