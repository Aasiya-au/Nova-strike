// Third-person chase camera: behind and above the ship, looking down the flight path (never top-down).
import * as THREE from 'three';

export class ChaseCamera {
  constructor(camera, { height = 2.4, distance = 9, follow = 0.7, lookAhead = 40, stiffness = 5 } = {}) {
    Object.assign(this, { camera, height, distance, follow, lookAhead, stiffness });
    this.look = new THREE.Vector3(); this.aimPoint = new THREE.Vector3(); this.roll = 0; this.shakeAmt = 0;
  }
  snap(t) {
    const c = this.camera;
    c.position.set(t.x * this.follow, t.y * this.follow + this.height, t.z + this.distance);
    this.look.set(t.x * 0.55, t.y * 0.55 + 0.3, t.z - this.lookAhead);
    c.lookAt(this.look); c.updateMatrixWorld();
  }
  shake(amount) { this.shakeAmt = Math.max(this.shakeAmt, amount); }
  /** Frame-rate independent smoothing (exponential damping). */
  update(dt, t, vel) {
    const c = this.camera, k = 1 - Math.exp(-this.stiffness * dt);
    c.position.x += (t.x * this.follow - c.position.x) * k;
    c.position.y += (t.y * this.follow + this.height - c.position.y) * k;
    c.position.z = t.z + this.distance;
    this.look.x += (t.x * 0.55 - this.look.x) * k;
    this.look.y += (t.y * 0.55 + 0.3 - this.look.y) * k;
    this.look.z = t.z - this.lookAhead;
    this.roll += (-vel.x * 0.006 - this.roll) * k;
    const s = this.shakeAmt;   // damage shake: jitter the look target (the camera's follow state stays clean)
    this.aimPoint.copy(this.look); this.aimPoint.x += (Math.random() - 0.5) * s * 2; this.aimPoint.y += (Math.random() - 0.5) * s * 2;
    c.lookAt(this.aimPoint); c.rotateZ(this.roll + (Math.random() - 0.5) * s * 0.03);
    this.shakeAmt = s > 0.005 ? s * Math.exp(-8 * dt) : 0;
    c.updateMatrixWorld();
  }
}
