// camera.js — chase cam: ~7 m behind, ~3 m up, look-ahead, spring lag,
// speed-based FOV kick. Locked at Stage B.
import * as THREE from 'three';
import { CFG } from './config.js';

export function createChaseCam(camera) {
  const desired = new THREE.Vector3();
  const look = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const cur = new THREE.Vector3(0, 3.2, -7);
  const baseFov = CFG.camera.fov;
  return {
    snap(x, y, heading) {
      const fx = Math.cos(heading), fy = Math.sin(heading);
      const [px, pz] = [x, -y];
      cur.set(px - fx * CFG.camera.dist, CFG.camera.height, pz + fy * CFG.camera.dist);
      camera.position.copy(cur);
    },
    update(dt, x, y, heading, speedKmh, steerVis) {
      const fx = Math.cos(heading), fy = Math.sin(heading);
      const [px, pz] = [x, -y];
      desired.set(
        px - fx * CFG.camera.dist - fy * steerVis * 1.2,
        CFG.camera.height,
        pz + fy * CFG.camera.dist - fx * steerVis * 1.2);
      const k = 1 - Math.exp(-7 * dt);
      cur.lerp(desired, k);
      camera.position.copy(cur);
      look.set(
        px + fx * CFG.camera.lookAhead + fy * steerVis * 2.5,
        1.5,
        pz - fy * CFG.camera.lookAhead + fx * steerVis * 2.5);
      camera.lookAt(look);
      const targetFov = baseFov + Math.min(10, speedKmh / 151 * 10);
      if (Math.abs(camera.fov - targetFov) > 0.05) {
        camera.fov += (targetFov - camera.fov) * Math.min(1, 4 * dt);
        camera.updateProjectionMatrix();
      }
    },
  };
}
