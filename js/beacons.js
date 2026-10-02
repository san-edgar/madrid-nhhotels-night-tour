// beacons.js — 14 hotel checkpoint beacons: instanced glowing pillars,
// instanced ground rings, per-hotel name sprites. Arrival detection lives in sim;
// this module only renders state (pending vs done).
import * as THREE from 'three';
import { SHADOW_PHI } from './render/rig.js';

function nameSprite(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(4,8,16,0.72)';
  const w = Math.min(500, 24 + text.length * 15);
  g.fillRect((512 - w) / 2, 18, w, 60);
  g.strokeStyle = 'rgba(255,201,77,0.9)'; g.lineWidth = 2;
  g.strokeRect((512 - w) / 2, 18, w, 60);
  g.font = '600 30px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#ffd97a';
  g.fillText(text, 256, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false });
  const sp = new THREE.Sprite(m);
  sp.scale.set(46, 8.6, 1);
  return sp;
}

export function buildBeacons(hotels, mats, scene) {
  const n = hotels.length;
  const pillarGeo = new THREE.CylinderGeometry(2.6, 3.4, 130, 12, 1, true);
  pillarGeo.translate(0, 65, 0);
  const pillars = new THREE.InstancedMesh(pillarGeo, mats.beaconPillar, n);
  pillars.renderOrder = 3;
  pillars.frustumCulled = false;
  // C1-R2: dark mast core inside the additive pillar so the beacon occludes
  // the key light and throws a readable soft shadow (punch item 4); slim so
  // it reads as structure inside the glow, not a wall
  const mastGeo = new THREE.CylinderGeometry(0.55, 0.7, 130, 8);
  mastGeo.translate(0, 65, 0);
  const masts = new THREE.InstancedMesh(mastGeo, mats.mastCore, n);
  masts.castShadow = true;
  masts.frustumCulled = false;
  // C1-R3: dark contact gradient at the beacon base (punch item 5)
  const baseGeo = new THREE.CircleGeometry(5.5, 24);
  baseGeo.rotateX(-Math.PI / 2);
  const bases = new THREE.InstancedMesh(baseGeo, mats.contactShadow, n);
  bases.renderOrder = 2;
  bases.frustumCulled = false;
  // C1-R3: baked cast-shadow wedge for the beacon mast (punch item 1) —
  // a 130 m mast would throw a ~140 m real shadow; the readable wedge near
  // the base carries the ref's grounding instead
  const mastShadowGeo = new THREE.PlaneGeometry(22, 4.5);
  mastShadowGeo.rotateX(-Math.PI / 2);
  mastShadowGeo.translate(11, 0, 0);
  const mastShadows = new THREE.InstancedMesh(mastShadowGeo, mats.castShadow, n);
  mastShadows.renderOrder = 2;
  mastShadows.frustumCulled = false;
  const ringGeo = new THREE.RingGeometry(6, 9, 40);
  ringGeo.rotateX(-Math.PI / 2);
  const rings = new THREE.InstancedMesh(ringGeo, mats.beaconRing, n);
  rings.renderOrder = 2;
  rings.frustumCulled = false;
  const dummy = new THREE.Object3D();
  const labels = [];
  const pos = [];
  const liveColor = new THREE.Color(0xffc94d);
  const doneColor = new THREE.Color(0x39445e);
  hotels.forEach((h, i) => {
    const [x, z] = [h.x, -h.y];
    pos.push([x, z]);
    dummy.position.set(x, 0, z);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    pillars.setMatrixAt(i, dummy.matrix);
    masts.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 0.08, z);
    dummy.updateMatrix();
    rings.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 0.075, z);
    dummy.updateMatrix();
    bases.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 0.085, z);
    dummy.rotation.set(0, SHADOW_PHI, 0);
    dummy.updateMatrix();
    mastShadows.setMatrixAt(i, dummy.matrix);
    dummy.rotation.set(0, 0, 0);
    pillars.setColorAt(i, liveColor);
    const sp = nameSprite(h.short.toUpperCase());
    sp.position.set(x, 142, z);
    scene.add(sp);
    labels.push(sp);
  });
  pillars.instanceMatrix.needsUpdate = true;
  masts.instanceMatrix.needsUpdate = true;
  bases.instanceMatrix.needsUpdate = true;
  mastShadows.instanceMatrix.needsUpdate = true;
  rings.instanceMatrix.needsUpdate = true;
  scene.add(pillars, masts, rings, bases, mastShadows);

  function update(t, camPos) {
    let colorDirty = false;
    for (let i = 0; i < n; i++) {
      const h = hotels[i];
      const s = 1 + Math.sin(t * 2.4 + i) * 0.06;
      dummy.position.set(pos[i][0], 0.08, pos[i][1]);
      dummy.scale.set(s * (h.done ? 0.7 : 1), 1, s * (h.done ? 0.7 : 1));
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      rings.setMatrixAt(i, dummy.matrix);
      const want = h.done ? doneColor : liveColor;
      pillars.setColorAt(i, want);
      colorDirty = true;
      const d2 = (pos[i][0] - camPos.x) ** 2 + (pos[i][1] - camPos.z) ** 2;
      labels[i].visible = d2 < 500 * 500 && !h.done;
    }
    rings.instanceMatrix.needsUpdate = true;
    if (colorDirty && pillars.instanceColor) pillars.instanceColor.needsUpdate = true;
  }
  function markDone(i) { /* rings shrink via update(); pillar stays */ }
  return { update, markDone };
}
