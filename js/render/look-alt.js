// look-alt.js — "Ember dusk" alternate preset for the Stage B renderer-contract
// swap test. Same exported interface as look-default.js; boot with ?look=alt.
// Gameplay code is untouched by the swap.
import * as THREE from 'three';
import base from './look-default.js';

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const alt = Object.create(base);
alt.name = 'ember-dusk-alt';
alt.sky = { top: 0x0d0605, horizon: 0x3f1d10, stars: 250 };
alt.fog = { color: 0x140b08, density: 0.0006 };

alt.lights = function (scene, api) {
  const hemi = new THREE.HemisphereLight(0x5f3a27, 0x0c0505, 0.6);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffc890, 1.6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -60; key.shadow.camera.right = 60;
  key.shadow.camera.top = 60; key.shadow.camera.bottom = -60;
  key.shadow.camera.near = 10; key.shadow.camera.far = 260;
  key.shadow.bias = -0.0004;
  scene.add(key); scene.add(key.target);
  api.keyLight = key;
  return { hemi, key };
};

alt.carSpots = function (carGroup) {
  const spots = [];
  for (const sx of [-0.7, 0.7]) {
    const s = new THREE.SpotLight(0xffd9a8, 420, 60, 0.5, 0.6, 1.6);
    s.position.set(2.0, 0.9, sx);
    s.target.position.set(26, -0.5, sx * 2.2);
    carGroup.add(s); carGroup.add(s.target);
    spots.push(s);
  }
  return spots;
};

alt.materials = function () {
  const m = base.materials();
  m.ground.color.set(0x120c0a);
  m.asphalt.color.set(0x1e1512); m.asphalt.roughness = 0.7;
  m.building.color.set(0xa89880);
  m.lampOrb.color.set(0xff9a4d);
  m.lampPool.color.set(0xff8a3d);
  m.beaconPillar.color.set(0xff5f8a);
  m.beaconRing.color.set(0xff7fa0);
  m.carBody.color.set(0x3c1a12); m.carBody.roughness = 0.45;
  m.underglow.color.set(0xff7a3c);
  m.tailLight.color.set(0xff7a2a);
  return m;
};

alt.post = function () {
  return { exposure: 1.25, bloom: { strength: 0.8, radius: 0.7, threshold: 0.68 } };
};

// neutral instance tints so the alt material colors carry the look
alt.lampTint = function () {
  return { orb: 0xffffff, pool: 0xffffff, streak: 0xffffff };
};

export default alt;
