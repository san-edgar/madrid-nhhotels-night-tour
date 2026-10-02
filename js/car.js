// car.js — Stage C3 authored hero: low-slung neon-noir fastback coupe.
// Hand-built BufferGeometry (no primitive boxes as final surfaces):
// detailed side profile + separate front/rear bumper extrusions, dark
// shut-line strips for panel breaks (hood, doors, decklid), glasshouse
// canopy with body-color A-pillars and fastback C-sails, 4 detailed wheels
// (tire + dark multi-spoke rim + lit brake disc + caliper, fronts steered),
// clearcoat physical paint, cyan sill underglow, headlight clusters +
// feathered cones + real spots, full-width rear light blade.
// Nose faces +x in local space; main.js sets group.rotation.y = heading.
// Materials come from the look module (mats).
import * as THREE from 'three';
import { SHADOW_DIR, SHADOW_PHI } from './render/rig.js';

function toNI(g) { return g.index ? g.toNonIndexed() : g; }

// merge position/normal/uv (single-material parts)
function mergeParts(list) {
  const parts = list.map(toNI);
  let vCount = 0;
  for (const g of parts) vCount += g.attributes.position.count;
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  let o = 0, ou = 0;
  for (const g of parts) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, ou * 2);
    o += n; ou += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

// merge position/normal/uv/color (multi-tone parts, e.g. wheels)
function mergeColored(list) {
  const parts = list.map(toNI);
  let vCount = 0;
  for (const g of parts) vCount += g.attributes.position.count;
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const col = new Float32Array(vCount * 3);
  let o = 0;
  for (const g of parts) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    col.set(g.attributes.color.array, o * 3);
    o += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

function paint(geo, r, g, b) {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// C3-T1 (steer2 §4.2/4.4): re-value the existing hero body geometry —
// rear-face VALUE BANDS (decklid+blade / shadow gap / bumper / lower
// shadow) so the rear reads as horizontal bands, plus near-black arch
// cutouts around the wheels. Zero new meshes.
function paintHeroBody(geo) {
  const pos = geo.attributes.position;
  const n = pos.count;
  const col = new Float32Array(n * 3);
  const wheels = [[1.45, 0.85], [1.45, -0.85], [-1.35, 0.85], [-1.35, -0.85]];
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let r = 1, g = 1, b = 1;
    if (x < -2.28) { // tail cap: main body rear edge + rear bumper face
      if (y >= 0.68) { r = 1.15; g = 1.15; b = 1.15; }       // decklid + blade zone
      else if (y >= 0.60) { r = 0.42; g = 0.42; b = 0.44; }  // shadow gap line
      else if (y >= 0.44) { r = 0.72; g = 0.72; b = 0.74; }  // bumper zone (recessed)
      else { r = 0.50; g = 0.50; b = 0.52; }                 // lower shadow
    }
    // C3-T1h: ducktail lip darkening — its horizontal top face (x≈-2.18,
    // y≈0.795) catches the key light and blew to a white streak on the
    // lightened body; darken it back into the decklid value structure.
    if (x >= -2.27 && x <= -2.09 && y >= 0.76 && y <= 0.83) { r = 0.45; g = 0.45; b = 0.48; }
    // C3-T1i: decklid TOP darkening — the horizontal deck surface (x -2.3..
    // -1.5, y>0.80) was left at full bright and the key light blows it to a
    // white streak; the rear cap bands don't cover the top face.
    if (x >= -2.32 && x <= -1.50 && y > 0.80) { r = 0.55; g = 0.55; b = 0.58; }
    if (Math.abs(z) > 0.90) { // arch cutouts on the body sides
      for (const [cx, cz] of wheels) {
        if ((z > 0) !== (cz > 0)) continue;
        if (Math.hypot(x - cx, y - 0.36) < 0.52) { r = 0.07; g = 0.07; b = 0.08; break; }
      }
    }
    col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

// C3-T1 (steer2 §4.3): hero rear glass lighter than the body, carrying
// neon streak reflections — the fastback slope stops reading as a black
// hole above the decklid.
function paintHeroGlass(geo) {
  const pos = geo.attributes.position;
  const n = pos.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    let r = 1, g = 1, b = 1;
    if (x < -0.55 && y > 0.90) { r = 1.35; g = 1.50; b = 1.75; }
    col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

// side-profile extrusion, centered across z
function profileGeo(pts, width, bevel = 0.05, bevelSeg = 2) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth: width, bevelEnabled: true,
    bevelThickness: bevel, bevelSize: bevel, bevelSegments: bevelSeg, steps: 1,
  });
  g.translate(0, 0, -width / 2);
  return g;
}

// box strut between two points (pillars, fins)
function strut(p0, p1, w, d, parts) {
  const a = new THREE.Vector3(p0[0], p0[1], p0[2]);
  const b = new THREE.Vector3(p1[0], p1[1], p1[2]);
  const dir = b.clone().sub(a);
  const len = dir.length();
  const g = new THREE.BoxGeometry(w, len, d);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), dir.normalize()));
  const mid = a.add(b).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  parts.push(g);
}

function boxAt(w, h, d, x, y, z, parts, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  parts.push(g);
  return g;
}

export function buildCar(mats, look) {
  const g = new THREE.Group();
  const bodyParts = [], glassParts = [], trimParts = [];

  // ---- main body: detailed fastback side profile ----
  const BODY = [
    [-2.30, 0.30], [-2.36, 0.52], [-2.34, 0.70], [-2.10, 0.78],
    [-1.62, 0.84], [-1.05, 0.88], [-0.35, 0.90], [0.55, 0.88],
    [1.05, 0.84], [1.55, 0.82], [1.95, 0.76], [2.18, 0.66],
    [2.28, 0.48], [2.26, 0.30], [2.12, 0.18], [1.70, 0.16],
    [-1.55, 0.16], [-2.05, 0.20],
  ];
  bodyParts.push(profileGeo(BODY, 1.78));

  // ---- front bumper (separate extrusion, proud of the nose) ----
  bodyParts.push(profileGeo([
    [1.88, 0.26], [2.14, 0.26], [2.30, 0.40], [2.33, 0.52],
    [2.24, 0.62], [2.02, 0.64], [1.90, 0.56], [1.88, 0.40],
  ], 1.80));
  // ---- rear bumper (separate extrusion, proud of the tail) ----
  bodyParts.push(profileGeo([
    [-2.00, 0.28], [-2.30, 0.28], [-2.42, 0.44], [-2.40, 0.62],
    [-2.28, 0.70], [-2.02, 0.68], [-2.00, 0.44],
  ], 1.80));
  // ducktail lip on the decklid
  boxAt(0.16, 0.045, 1.45, -2.18, 0.795, 0, bodyParts, -0.12);

  // ---- panel shut lines (dark strips = panel breaks) ----
  boxAt(0.028, 0.012, 1.50, 0.60, 0.945, 0, trimParts);          // hood rear
  boxAt(1.32, 0.012, 0.028, 1.26, 0.93, 0.755, trimParts);       // hood side L
  boxAt(1.32, 0.012, 0.028, 1.26, 0.93, -0.755, trimParts);      // hood side R
  boxAt(0.028, 0.54, 0.016, 0.52, 0.57, 0.952, trimParts);       // door front L
  boxAt(0.028, 0.54, 0.016, 0.52, 0.57, -0.952, trimParts);      // door front R
  boxAt(0.028, 0.54, 0.016, -1.40, 0.57, 0.952, trimParts);      // door rear L
  boxAt(0.028, 0.54, 0.016, -1.40, 0.57, -0.952, trimParts);     // door rear R
  boxAt(1.94, 0.028, 0.016, -0.44, 0.315, 0.952, trimParts);     // door lower L
  boxAt(1.94, 0.028, 0.016, -0.44, 0.315, -0.952, trimParts);    // door lower R
  boxAt(0.028, 0.012, 1.42, -1.62, 0.905, 0, trimParts);         // decklid edge
  // door handles
  boxAt(0.16, 0.03, 0.02, -0.30, 0.76, 0.955, trimParts);
  boxAt(0.16, 0.03, 0.02, -0.30, 0.76, -0.955, trimParts);

  // ---- aero trim: splitter, skirts, intakes, diffuser ----
  boxAt(0.38, 0.035, 1.80, 2.10, 0.145, 0, trimParts);           // splitter
  boxAt(0.10, 0.13, 1.05, 2.30, 0.40, 0, trimParts);             // front intake
  boxAt(2.75, 0.09, 0.10, -0.05, 0.135, 0.90, trimParts);        // skirt L
  boxAt(2.75, 0.09, 0.10, -0.05, 0.135, -0.90, trimParts);       // skirt R
  boxAt(0.30, 0.14, 1.45, -2.28, 0.20, 0, trimParts);            // diffuser
  for (const fz of [-0.54, -0.18, 0.18, 0.54])
    boxAt(0.28, 0.12, 0.025, -2.28, 0.20, fz, trimParts);        // diffuser fins
  // wheel-arch liners (dark half-tori over each wheel)
  for (const [wx, wz] of [[1.45, 0.85], [1.45, -0.85], [-1.35, 0.85], [-1.35, -0.85]]) {
    const t = new THREE.TorusGeometry(0.47, 0.10, 8, 10, Math.PI);
    t.translate(wx, 0.36, wz);
    trimParts.push(t);
  }

  // ---- glasshouse: dark canopy + body-color A-pillars + C-sails ----
  glassParts.push(profileGeo([
    [-1.72, 0.86], [-1.30, 1.06], [-0.72, 1.26], [-0.20, 1.32],
    [0.28, 1.28], [0.66, 0.90], [0.60, 0.86], [-1.66, 0.84],
  ], 1.44, 0.08));
  for (const s of [1, -1]) {
    strut([0.58, 0.88, s * 0.64], [0.22, 1.24, s * 0.56], 0.075, 0.06, bodyParts);   // A-pillar
    strut([-0.72, 1.22, s * 0.58], [-1.68, 0.88, s * 0.66], 0.30, 0.07, bodyParts);  // C-sail
  }

  const bodyGeo = mergeParts(bodyParts);
  paintHeroBody(bodyGeo);
  const bodyMesh = new THREE.Mesh(bodyGeo, mats.carBody);
  bodyMesh.castShadow = true;
  const glassGeo = mergeParts(glassParts);
  paintHeroGlass(glassGeo);
  const glassMesh = new THREE.Mesh(glassGeo, mats.carGlass);
  glassMesh.castShadow = true;
  const trimMesh = new THREE.Mesh(mergeParts(trimParts), mats.carTrim);
  g.add(bodyMesh, glassMesh, trimMesh);

  // ---- wheels: tire + dark multi-spoke rim + lit brake disc + caliper ----
  // one merged vertex-colored mesh per wheel (tire near-black, rim dark,
  // disc bright -> emissive read, caliper red)
  function wheelMeshes(outer) {
    const parts = [];
    parts.push(paint(toNI(new THREE.CylinderGeometry(0.36, 0.36, 0.30, 20).rotateX(Math.PI / 2)), 0.05, 0.05, 0.06));
    const ring = new THREE.TorusGeometry(0.20, 0.038, 8, 20);
    ring.translate(0, 0, outer * 0.13);
    parts.push(paint(toNI(ring), 0.14, 0.15, 0.18));
    for (let k = 0; k < 5; k++) {
      const sp = new THREE.BoxGeometry(0.17, 0.055, 0.05);
      sp.translate(0.105, 0, 0);
      sp.rotateZ((k * Math.PI * 2) / 5);
      sp.translate(0, 0, outer * 0.13);
      parts.push(paint(toNI(sp), 0.14, 0.15, 0.18));
    }
    const hub = new THREE.CylinderGeometry(0.055, 0.055, 0.34, 10);
    hub.rotateX(Math.PI / 2);
    parts.push(paint(toNI(hub), 0.10, 0.11, 0.13));
    const disc = new THREE.CylinderGeometry(0.15, 0.15, 0.055, 16);
    disc.rotateX(Math.PI / 2);
    disc.translate(0, 0, outer * 0.05);
    parts.push(paint(toNI(disc), 1.0, 1.0, 1.0));
    const cal = new THREE.BoxGeometry(0.10, 0.13, 0.08);
    cal.translate(0.02, 0.10, outer * 0.05);
    parts.push(paint(toNI(cal), 0.54, 0.09, 0.13));
    const m = new THREE.Mesh(mergeColored(parts), mats.wheelAll);
    m.castShadow = true;
    return m;
  }
  const wheels = [];
  const steerWheels = [];
  for (const [wx, wz, steer] of [[1.45, 0.85, true], [1.45, -0.85, true], [-1.35, 0.85, false], [-1.35, -0.85, false]]) {
    const steerG = new THREE.Group();
    const spinG = new THREE.Group();
    spinG.add(wheelMeshes(wz > 0 ? 1 : -1));
    steerG.add(spinG);
    steerG.position.set(wx, 0.36, wz);
    g.add(steerG);
    wheels.push(spinG);
    if (steer) steerWheels.push(steerG);
  }

  // ---- full-width rear light blade (night signature) + bumper reflectors ----
  // C3-S2: the blade sat at x=-2.53, ~0.2 floating behind the bumper face —
  // the "floating bar" read. Reseated at x=-2.36 (proud of the bumper face
  // ≈-2.31 at blade height, back embedded), inside a dark groove frame so
  // it reads seated in an articulated rear, not floating on a slab.
  const bladeParts = [];
  boxAt(0.06, 0.11, 1.58, -2.36, 0.68, 0, bladeParts);   // blade
  boxAt(0.05, 0.06, 0.28, -2.43, 0.45, 0.78, bladeParts);  // reflector L
  boxAt(0.05, 0.06, 0.28, -2.43, 0.45, -0.78, bladeParts); // reflector R
  g.add(new THREE.Mesh(mergeParts(bladeParts), mats.tailLight));

  // ---- C3-S2 hero rear breakup: groove frame, chrome bumper-separation
  // strip, light plate, bright exhaust tips + dark inners, decklid side
  // shut lines — one vertex-colored mesh (mats.rearDetail)
  const rearParts = [];
  const rBox = (w, h, d, x, y, z, r, g2, b) => rearParts.push(paint(toNI(new THREE.BoxGeometry(w, h, d).translate(x, y, z)), r, g2, b));
  const DARK = [0.05, 0.05, 0.07];
  rBox(0.02, 0.025, 1.66, -2.33, 0.752, 0, ...DARK);   // groove top
  rBox(0.02, 0.025, 1.66, -2.33, 0.608, 0, ...DARK);   // groove bottom
  rBox(0.02, 0.17, 0.06, -2.33, 0.68, 0.815, ...DARK); // groove end L
  rBox(0.02, 0.17, 0.06, -2.33, 0.68, -0.815, ...DARK);// groove end R
  rBox(0.02, 0.022, 1.50, -2.42, 0.545, 0, 0.60, 0.62, 0.66); // chrome bumper-separation strip
  rBox(0.02, 0.14, 0.38, -2.43, 0.44, 0, 0.66, 0.68, 0.72);   // license plate
  rBox(0.028, 0.012, 0.22, -1.62, 0.905, 0.80, ...DARK);  // decklid shut L
  rBox(0.028, 0.012, 0.22, -1.62, 0.905, -0.80, ...DARK); // decklid shut R
  for (const s of [1, -1]) {
    // bright exhaust tip flanking the diffuser + dark inner.
    // C3-T1 (steer2 §4.2): tips brightened for the specular catch.
    const tip = new THREE.CylinderGeometry(0.055, 0.055, 0.16, 12);
    tip.rotateZ(Math.PI / 2);
    tip.translate(-2.35, 0.30, s * 0.80);
    rearParts.push(paint(toNI(tip), 0.92, 0.94, 0.98));
    const inner = new THREE.CylinderGeometry(0.042, 0.042, 0.02, 12);
    inner.rotateZ(Math.PI / 2);
    inner.translate(-2.435, 0.30, s * 0.80);
    rearParts.push(paint(toNI(inner), 0.03, 0.03, 0.04));
  }
  g.add(new THREE.Mesh(mergeColored(rearParts), mats.rearDetail));

  // ---- headlight clusters (twin per side) + feathered cones ----
  const hlParts = [];
  for (const hz of [0.55, 0.80, -0.55, -0.80])
    boxAt(0.08, 0.09, 0.18, 2.43, 0.58, hz, hlParts);
  g.add(new THREE.Mesh(mergeParts(hlParts), mats.headLight));
  const coneParts = [];
  for (const hz of [-0.66, 0.66]) {
    const cone = new THREE.ConeGeometry(1.15, 16, 12, 1, true);
    cone.rotateZ(Math.PI / 2); // apex -> -x
    cone.translate(2.4 + 8, 0.45, hz);
    coneParts.push(cone);
  }
  const cones = new THREE.Mesh(mergeParts(coneParts), mats.headCone);
  g.add(cones);

  // ---- cyan underglow: sill strips + ground wash ----
  const ugParts = [];
  boxAt(2.8, 0.03, 0.07, -0.05, 0.10, 0.92, ugParts);
  boxAt(2.8, 0.03, 0.07, -0.05, 0.10, -0.92, ugParts);
  g.add(new THREE.Mesh(mergeParts(ugParts), mats.underglow));
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.9), mats.underglow);
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(0, 0.06, 0);
  glow.renderOrder = 2;
  g.add(glow);

  // C1-R4: dark contact gradient under the car (kept verbatim)
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 5.4), mats.contactShadow);
  contact.rotation.x = -Math.PI / 2;
  contact.position.set(0, 0.1, 0);
  contact.renderOrder = 3;
  g.add(contact);
  // C1-R3: baked cast shadow for the car (kept verbatim)
  const carShadowGeo = new THREE.PlaneGeometry(8.5, 3.8);
  carShadowGeo.rotateX(-Math.PI / 2);
  carShadowGeo.translate(3.4, 0, 0);
  const carShadow = new THREE.Mesh(carShadowGeo, mats.castShadow);
  carShadow.rotation.y = SHADOW_PHI;
  carShadow.renderOrder = 3;

  // real headlight spots from the look module
  const spots = look.carSpots(g);

  // C3-T1 (steer2 §4.1): car-modeling practical rig — a pink/cyan spot pair
  // parented to the car, hung behind-above (on the chase camera's side) and
  // aimed back at the rear face / decklid / body sides, so the clearcoat
  // throws elongated specular streak washes across the panels the dead-rear
  // camera actually sees (ref-01's mechanism). They ride with the hero, so
  // the nearest traffic car ahead gets raked too. No shadows, no meshes.
  // C3-T1b: cooled 200/160 -> 120/100 — at full intensity the clearcoat
  // specular blew to a white core on the decklid; the streaks must read as
  // COLORED (pink/cyan) washes, not white blobs.
  // C3-T1c: lowered to y=2.2 and cooled to 90/80, aimed at the rear face —
  // the high spots put a white-hot specular core on the DECKLID (horizontal
  // surface); the dead-rear camera needs the streak on the REAR FACE.
  // C3-T1e: moved low and wide (y=1.8, z=±3.5) with narrow cones — the
  // overhead position kept hotspotting the horizontal decklid; side-raking
  // beams put the streak on the vertical rear face where the camera looks.
  const streakPink = new THREE.SpotLight(0xff4dd2, 80, 17, 0.55, 0.9, 1.4);
  streakPink.position.set(-5.0, 1.8, 3.5);
  streakPink.target.position.set(-2.2, 0.55, 0);
  g.add(streakPink, streakPink.target);
  const streakCyan = new THREE.SpotLight(0x37e6ff, 70, 17, 0.55, 0.9, 1.4);
  streakCyan.position.set(-5.0, 1.8, -3.5);
  streakCyan.target.position.set(-2.2, 0.55, 0);
  g.add(streakCyan, streakCyan.target);

  // drift smoke puffs (billboard pool, world space)
  const smokeGeo = new THREE.PlaneGeometry(2.0, 2.0);
  const smokes = [];
  for (let i = 0; i < 24; i++) {
    const m = new THREE.Mesh(smokeGeo, mats.driftSmoke);
    m.visible = false;
    m.userData = { life: 0 };
    smokes.push(m);
  }
  let smokeIdx = 0, smokeTimer = 0;
  function update(dt, simState, scene) {
    if (!carShadow.parent) scene.add(carShadow);
    const wx = simState.x, wz = -simState.y;
    carShadow.position.set(wx + SHADOW_DIR.x * 1.2, 0.095, wz + SHADOW_DIR.z * 1.2);
    const spin = simState.speedKmh / 3.6 / 0.36;
    for (const w of wheels) w.rotation.z -= spin * dt;
    for (const w of steerWheels) w.rotation.y = simState.steerVis * 0.5;
    smokeTimer -= dt;
    if (simState.drifting && smokeTimer <= 0) {
      smokeTimer = 0.05;
      const m = smokes[smokeIdx++ % smokes.length];
      if (!m.parent) scene.add(m);
      const bx = simState.x - Math.cos(simState.heading) * 1.4;
      const by = simState.y - Math.sin(simState.heading) * 1.4;
      m.position.set(bx, 0.5, -by);
      m.rotation.y = Math.random() * Math.PI;
      m.userData.life = 0.9;
      m.visible = true;
    }
    for (const m of smokes) {
      if (!m.visible) continue;
      m.userData.life -= dt;
      m.scale.multiplyScalar(1 + dt * 2.2);
      m.position.y += dt * 1.2;
      if (m.userData.life <= 0) m.visible = false;
    }
  }
  return { group: g, update, spots };
}
