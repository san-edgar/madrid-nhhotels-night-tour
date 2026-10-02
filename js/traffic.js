// traffic.js — C3/P11 ambient traffic: 5 authored car variants circulating
// on arterial roads. VISUAL ONLY: cars follow road polylines at constant
// speed, no collision with the player, no gameplay interaction (the sim,
// camera, and checkpoint loop are untouched).
// Per variant: one InstancedMesh each for bodies (vertex colors x
// instanceColor paint), glasshouse (own reflective material, no
// instanceColor), wheels (tire + lighter rim, no instanceColor), and light
// quads (HDR vertex colors, unlit), roof (fixed light two-tone paint).
// Shared instanced cone + blob-shadow meshes for all cars. 27 draw calls total.
import * as THREE from 'three';
import { CFG } from './config.js';
import { hash2 } from './sim.js';

const tx = (x, y) => [x, -y];

function paintC(geo, r, g, b) {
  const gg = geo.index ? geo.toNonIndexed() : geo;
  const n = gg.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b; }
  gg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return gg;
}

function mergeC(list) {
  let vCount = 0;
  for (const g of list) vCount += g.attributes.position.count;
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const col = new Float32Array(vCount * 3);
  let o = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    o += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

function xprof(pts, w, bevel = 0.05) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth: w, bevelEnabled: true,
    bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, steps: 1,
  });
  g.translate(0, 0, -w / 2);
  return g;
}

function quad(w, h, x, y, z, facing /* +1 nose / -1 tail */) {
  const g = new THREE.PlaneGeometry(w, h);
  g.rotateY(facing > 0 ? Math.PI / 2 : -Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

// one authored variant -> { body, glass, wheel, light } merged colored geoms
// C3-R2: split into three buckets so each reads at chase distance —
//   body: paint areas white (x instanceColor) + breakup parts in darker
//     shades of the same paint (bumpers, skirts, grille, mirrors)
//   glass: white verts, rendered by mats.trafficGlass (no instanceColor) so
//     the glasshouse band reads as reflective neon-streaked glass
//   wheel: tire + lighter rim disc, rendered by mats.trafficWheel (no
//     instanceColor) so wheels survive the night grade
// C3-R3: wheels enlarged (r 0.37) and brightened so they read against the
//   dark asphalt at chase distance; body side profile lifted to 0.40 for
//   wheel-arch clearance; a painted roof panel caps the glasshouse so the
//   glass band reads as glasshouse (not a light roof band); breakup parts
//   brightened/enlarged (bumpers, grille, mirrors) + side rub strips for
//   panel breakup at distance.
function makeVariant(kind) {
  const body = [], glass = [], wheel = [], light = [], roofG = [];
  const tire = (wx, wz) => {
    const g = new THREE.CylinderGeometry(0.37, 0.37, 0.30, 14);
    g.rotateX(Math.PI / 2);
    g.translate(wx, 0.37, wz);
    // C3-T1 (steer2 §4.4): tire to NEAR-BLACK — the bright tire + warm
    // emissive manufactured the "flat pink disc" read. Only the red trim
    // ring + bright hub dot (rim specular) stay.
    wheel.push(paintC(g, 0.035, 0.035, 0.04));
    // rim face: thin red trim ring (was a bright disc protruding past the
    // tire cheeks)
    const r = new THREE.CylinderGeometry(0.21, 0.21, 0.33, 10);
    r.rotateX(Math.PI / 2);
    r.translate(wx, 0.37, wz);
    wheel.push(paintC(r, 0.42, 0.10, 0.12));
    // hub dot: the small rim specular
    const hub = new THREE.CylinderGeometry(0.07, 0.07, 0.34, 8);
    hub.rotateX(Math.PI / 2);
    hub.translate(wx, 0.37, wz);
    wheel.push(paintC(hub, 0.72, 0.75, 0.80));
  };
  const glassPane = (pts, w) => glass.push(paintC(xprof(pts, w, 0.05), 1, 1, 1));
  // breakup helpers (vertex shades multiply the paint via instanceColor)
  const bumperF = (x, y, wdt) => {
    const g = new THREE.BoxGeometry(0.30, 0.24, wdt);
    g.translate(x, y, 0);
    body.push(paintC(g, 0.55, 0.55, 0.58));
  };
  const skirt = (z) => {
    const g = new THREE.BoxGeometry(2.9, 0.16, 0.14);
    g.translate(0, 0.30, z);
    body.push(paintC(g, 0.28, 0.28, 0.30));
  };
  const mirror = (x, z) => {
    const g = new THREE.BoxGeometry(0.16, 0.12, 0.20);
    g.translate(x, 1.02, z);
    body.push(paintC(g, 0.55, 0.55, 0.58));
  };
  const grille = (x, wdt) => {
    const g = new THREE.BoxGeometry(0.12, 0.26, wdt);
    g.translate(x, 0.55, 0);
    body.push(paintC(g, 0.28, 0.30, 0.33));
  };
  const rubStrip = (s, wdt) => {
    const g = new THREE.BoxGeometry(2.6, 0.09, 0.06);
    g.translate(-0.1, 0.68, s * (wdt / 2 + 0.05));
    body.push(paintC(g, 0.62, 0.62, 0.65));
  };
  // z-facing quad (for the side window band): normal outward on side s
  const bandQuad = (x0, x1, y, z, s, r, g, b) => {
    const q = new THREE.PlaneGeometry(x1 - x0, 0.09);
    if (s < 0) q.rotateY(Math.PI);
    q.translate((x0 + x1) / 2, y, z);
    light.push(paintC(q, r, g, b));
  };
  let noseX = 2.05, tailX = -2.05, bodyW = 1.74, roof = null, glassW = 1.50;
  if (kind === 'sedan') {
    glassW = 1.50;
    body.push(paintC(xprof([
      [-2.05, 0.40], [-2.12, 0.58], [-1.98, 0.76], [-1.50, 0.84],
      [-0.90, 0.88], [-0.20, 0.90], [0.60, 0.88], [1.40, 0.84],
      [1.95, 0.74], [2.05, 0.55], [2.02, 0.42], [1.90, 0.40], [1.55, 0.40], [-1.55, 0.40],
    ], bodyW, 0.06), 1, 1, 1));
    glassPane([[-1.45, 0.86], [-0.95, 1.12], [-0.30, 1.24], [0.40, 1.22], [1.00, 0.92], [0.95, 0.86], [-1.40, 0.84]], 1.50);
    roof = { x0: -1.35, x1: 0.90, y: 1.24, w: 1.58 };
  } else if (kind === 'hatch') {
    bodyW = 1.70; noseX = 1.95; tailX = -1.90;
    body.push(paintC(xprof([
      [-1.85, 0.40], [-1.92, 0.64], [-1.80, 0.90], [-1.15, 1.04],
      [-0.30, 1.10], [0.60, 1.04], [1.30, 0.90], [1.80, 0.78],
      [1.90, 0.55], [1.87, 0.42], [1.75, 0.40], [1.45, 0.40], [-1.40, 0.40],
    ], bodyW, 0.06), 1, 1, 1));
    glassPane([[-1.75, 0.88], [-1.10, 1.08], [-0.30, 1.14], [0.50, 1.08], [1.05, 0.92], [1.00, 0.86], [-1.70, 0.84]], 1.46);
    glassW = 1.46;
    roof = { x0: -1.65, x1: 0.95, y: 1.14, w: 1.54 };
  } else if (kind === 'suv') {
    bodyW = 1.80; noseX = 2.05; tailX = -2.00;
    body.push(paintC(xprof([
      [-1.95, 0.40], [-2.02, 0.72], [-1.90, 1.00], [-1.40, 1.12],
      [-0.60, 1.18], [0.50, 1.16], [1.30, 1.06], [1.85, 0.92],
      [2.00, 0.66], [1.97, 0.44], [1.85, 0.40], [1.55, 0.40], [-1.50, 0.40],
    ], bodyW, 0.06), 1, 1, 1));
    glassPane([[-1.85, 1.00], [-1.30, 1.22], [-0.50, 1.30], [0.55, 1.28], [1.25, 1.02], [1.20, 0.94], [-1.80, 0.92]], 1.54);
    glassW = 1.54;
    roof = { x0: -1.75, x1: 1.15, y: 1.30, w: 1.62 };
  } else if (kind === 'van') {
    bodyW = 1.82; noseX = 2.15; tailX = -2.15;
    body.push(paintC(xprof([
      [-2.10, 0.40], [-2.18, 0.95], [-2.05, 1.30], [-1.50, 1.45],
      [0.80, 1.45], [1.60, 1.25], [2.05, 0.88], [2.10, 0.55],
      [2.07, 0.44], [1.95, 0.40], [1.65, 0.40], [-1.65, 0.40],
    ], bodyW, 0.05), 1, 1, 1));
    glassPane([[1.30, 1.05], [1.55, 1.22], [1.05, 1.38], [0.55, 1.40], [0.60, 1.02], [1.28, 0.98]], 1.56);
    glassW = 1.56;
    roof = { x0: 0.45, x1: 1.60, y: 1.40, w: 1.64 };
  } else { // taxi: sedan + roof sign
    bodyW = 1.74;
    body.push(paintC(xprof([
      [-2.05, 0.40], [-2.12, 0.58], [-1.98, 0.76], [-1.50, 0.84],
      [-0.90, 0.88], [-0.20, 0.90], [0.60, 0.88], [1.40, 0.84],
      [1.95, 0.74], [2.05, 0.55], [2.02, 0.42], [1.90, 0.40], [1.55, 0.40], [-1.55, 0.40],
    ], bodyW, 0.06), 1, 1, 1));
    glassPane([[-1.45, 0.86], [-0.95, 1.12], [-0.30, 1.24], [0.40, 1.22], [1.00, 0.92], [0.95, 0.86], [-1.40, 0.84]], 1.50);
    roof = { x0: -1.35, x1: 0.90, y: 1.24, w: 1.58 };
    const sign = new THREE.BoxGeometry(0.50, 0.14, 0.24);
    sign.translate(-0.20, 1.35, 0);
    body.push(paintC(sign, 1.0, 0.62, 0.15));
  }
  // C3-S2 two-tone: the roof panel lives in its own bucket with the fixed
  // light-silver trafficRoof material (no instanceColor) — dark body, light
  // roof band, the scheme that already reads (steer §4.5). White verts; the
  // material color carries the tone.
  // thin emissive window-band along the top of the glasshouse (ref-01
  // "light roof band" treatment): warm HDR quads in the light bucket,
  // proud of the glass bevel, both flanks. `band` is per-variant: the
  // glasshouse is not a rectangle, so the band sits where the glass top
  // edge stays above it.
  const band = { x0: -0.95, x1: 0.45, y: 1.06 };
  if (kind === 'hatch') Object.assign(band, { x0: -1.05, x1: 0.45, y: 1.00 });
  if (kind === 'suv') Object.assign(band, { x0: -1.25, x1: 0.55, y: 1.16 });
  if (kind === 'van') Object.assign(band, { x0: 0.60, x1: 1.00, y: 1.30 });
  if (roof) {
    const rp = new THREE.BoxGeometry(roof.x1 - roof.x0, 0.12, roof.w);
    rp.translate((roof.x0 + roof.x1) / 2, roof.y - 0.02, 0);
    roofG.push(paintC(rp, 1, 1, 1));
    for (const s of [1, -1])
      bandQuad(band.x0, band.x1, band.y, s * (glassW / 2 + 0.06), s, 1.35, 1.10, 0.80);
  }
  // front/rear breakup: grille inset, bumper bands, side skirts, mirrors,
  // side rub strips — all pushed proud of the 0.06 extrude bevel so they
  // stay visible instead of being swallowed by the body shell
  grille(noseX + 0.02, bodyW * 0.58);
  bumperF(noseX - 0.05, 0.36, bodyW - 0.12);
  bumperF(tailX + 0.04, 0.36, bodyW - 0.12);
  skirt(bodyW / 2 + 0.02); skirt(-(bodyW / 2 + 0.02));
  mirror(0.55, bodyW / 2 + 0.06); mirror(0.55, -(bodyW / 2 + 0.06));
  rubStrip(1, bodyW); rubStrip(-1, bodyW);
  const wx = kind === 'van' ? 1.45 : 1.35;
  // C3-T1 (steer2 §4.4): SUBTRACTIVE wheel/arch fix — kill the proud mount
  // that manufactured "pink discs overlapping the body side". Wheels recess
  // INSIDE the body silhouette (tire outer face flush with the bevel's
  // inner face); black arch openings are painted into the body sides below.
  const wz = bodyW / 2 - 0.16;
  const wheelC = [];
  const tireAt = (x, z) => { wheelC.push([x, z]); tire(x, z); };
  tireAt(wx, wz); tireAt(wx, -wz); tireAt(-wx * 0.94, wz); tireAt(-wx * 0.94, -wz);
  // lights: pushed proud of the bevelled nose/tail for the same reason.
  // C3-steer: the tail bar sat at tailX-0.08, inside the 0.06 bevel's extreme
  // (-2.18) at bar height — occluded from directly behind. Moved to
  // tailX-0.20 so the red glow actually reads (light repositioning, not new
  // geometry).
  for (const s of [1, -1]) {
    light.push(paintC(quad(0.30, 0.13, noseX + 0.08, 0.60, s * (bodyW / 2 - 0.45), 1), 2.4, 2.2, 1.9));
  }
  light.push(paintC(quad(bodyW - 0.5, 0.11, tailX - 0.20, 0.66, 0, -1), 0.85, 0.06, 0.10)); // C3-T1 (steer2 §4.5): re-exposed saturated red glow, max channel < 245. C3-T1e: non-HDR — HDR values bloomed white.
  // ---- C3-T1 (steer2 §4.2/4.3/4.4): re-value the existing geometry, zero
  // new meshes. (a) rear-face VALUE BANDS on the tail cap — decklid+tail
  // blade / shadow gap / bumper+exhaust / lower shadow — so the rear reads
  // as ≥4 horizontal bands, not one dark plane. (b) near-black arch
  // cutouts painted into the body sides around the recessed wheels.
  // (c) glasshouse as a band — lighter rear glass + dark pillar breaks.
  const glassP = kind === 'hatch'
    ? { rear: -1.00, pillars: [[0.55, 0.67], [-1.05, -0.93]] }
    : kind === 'suv'
      ? { rear: -1.20, pillars: [[0.60, 0.72], [-1.28, -1.16]] }
      : kind === 'van'
        ? { rear: null, pillars: [[1.05, 1.17]] }
        : { rear: -0.90, pillars: [[0.50, 0.62], [-0.98, -0.86]] }; // sedan + taxi
  const bodyGeo = mergeC(body);
  paintRearBands(bodyGeo, tailX);
  paintArches(bodyGeo, bodyW, wheelC);
  const glassGeo = mergeC(glass);
  paintGlassBand(glassGeo, glassP);
  return { body: bodyGeo, glass: glassGeo, wheel: mergeC(wheel), light: mergeC(light), roof: mergeC(roofG), noseX };
}

// rear-face value bands: verts on the tail cap (x <= tailX+0.08) are
// re-valued by height into decklid / shadow-gap / bumper / lower-shadow
// bands; bumper verts flanking the center get an exhaust specular catch.
// Multiplies the existing vertex colors (paint x breakup shades).
function paintRearBands(geo, tailX) {
  const pos = geo.attributes.position, col = geo.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (x > tailX + 0.08) continue;
    let v;
    if (y >= 0.60) v = [1.18, 1.18, 1.18];            // decklid + tail blade zone
    else if (y >= 0.52) v = [0.40, 0.40, 0.42];       // shadow gap line
    else if (y >= 0.30) v = [0.72, 0.72, 0.74];       // bumper zone
    else v = [0.45, 0.45, 0.47];                       // lower shadow
    const az = Math.abs(z);
    if (y >= 0.30 && y < 0.52 && az > 0.55 && az < 0.80) v = [1.05, 1.05, 1.10]; // exhaust catch
    col.setXYZ(i, col.getX(i) * v[0], col.getY(i) * v[1], col.getZ(i) * v[2]);
  }
}

// black arch openings: body side verts within r 0.50 of a wheel center go
// near-black, so the recessed wheels read as dark circles inside a body
// cutout instead of discs pasted on the side.
function paintArches(geo, bodyW, wheelC) {
  const pos = geo.attributes.position, col = geo.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    if (Math.abs(z) < bodyW / 2 - 0.02) continue;
    const x = pos.getX(i), y = pos.getY(i);
    for (const [cx, cz] of wheelC) {
      if ((z > 0) !== (cz > 0)) continue;
      if (Math.hypot(x - cx, y - 0.37) < 0.50) { col.setXYZ(i, 0.06, 0.06, 0.07); break; }
    }
  }
}

// glasshouse as a band: rear glass lighter blue-grey (carries the neon
// streaks), pillar breaks darker — the roof band stops reading as a
// floating slab. Overwrites the white glass verts (no instanceColor on
// trafficGlass, so these are absolute).
function paintGlassBand(geo, p) {
  const pos = geo.attributes.position, col = geo.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    let v = [1, 1, 1];
    if (p.rear !== null && x < p.rear) v = [1.30, 1.42, 1.65];
    for (const [a, b] of p.pillars) {
      if (x >= a && x <= b) { v = [0.30, 0.33, 0.40]; break; }
    }
    col.setXYZ(i, v[0], v[1], v[2]);
  }
}

const TRAFFIC_CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'];
const VARIANTS = ['sedan', 'hatch', 'suv', 'van', 'taxi'];
// C3-R2: brightened range — dark shells crushed to blobs under the night
// grade; the paints need to hold body shape at chase distance.
// C3-T1 (steer2 §4.1): the two near-black paints (0x2e3138 etc.) are out —
// body albedo must sit OUT OF THE CRUSH ZONE.
const PAINTS = [0x9aa0a8, 0xd0d4da, 0x8a2a24, 0x5a8ac2, 0x555b66, 0xd8a83a, 0x5a7a5a, 0x707880];

export function buildTraffic(roads, mats, hintX, hintY, hintHeading) {
  // candidate arterial polylines with arc-length tables, sorted nearest to
  // the city center first so traffic concentrates where the player drives
  const cands = [];
  roads.forEach((r, ri) => {
    if (!TRAFFIC_CLASSES.includes(r.class)) return;
    const p = r.pts;
    const cum = [0];
    for (let i = 0; i < p.length - 1; i++)
      cum.push(cum[i] + Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]));
    const mid = p[(p.length / 2) | 0];
    cands.push({ r, cum, len: cum[cum.length - 1], d0: Math.hypot(mid[0], mid[1]) });
  });
  // encounter seeding: the debug drive does not follow the road graph (it
  // weaves roughly straight along its start heading), so seed cars are
  // placed on the nearest road with real length to points cast along the
  // player's forward ray. Each car sits within metres of where the player
  // will be, guaranteeing drive-frame encounters.
  function nearestOnRoad(qx, qy, minLen) {
    let best = null, bd = Infinity;
    for (const c of cands) {
      if (c.len < minLen) continue;
      const p = c.r.pts, cum = c.cum;
      for (let i = 0; i < p.length - 1; i++) {
        const ax = p[i][0], ay = p[i][1];
        let dx = p[i + 1][0] - ax, dy = p[i + 1][1] - ay;
        const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
        let t = ((qx - ax) * dx + (qy - ay) * dy) / L;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = ax + dx * t * L, py = ay + dy * t * L;
        const d = Math.hypot(qx - px, qy - py);
        if (d < bd) { bd = d; best = { c, s: cum[i] + t * L }; }
      }
    }
    return best;
  }
  cands.sort((a, b) => a.d0 - b.d0);
  const pool = cands.filter((c) => c.len > 400).slice(0, 40); // central roads
  const NCAR = 24;
  const cars = [];
  const hx = Math.cos(hintHeading || 0), hy = Math.sin(hintHeading || 0);
  const SEED_CFG = [
    { d: 50, v: 0, sp: 6 },   // sedan
    { d: 110, v: 3, sp: 6 },  // van
    { d: 170, v: 1, sp: 7 },  // hatch
    { d: 230, v: 4, sp: 7 },  // taxi
  ];
  for (let k = 0; k < NCAR && pool.length; k++) {
    const c = pool[k % pool.length];
    const w = (CFG.roadWidth[c.r.class] || CFG.defaultRoadWidth) / 2;
    if (k < SEED_CFG.length && hintX !== undefined) {
      // encounter car: nearest road to the forward-ray point
      const sc = SEED_CFG[k];
      const hit = nearestOnRoad(hintX + hx * sc.d, hintY + hy * sc.d, 0);
      if (hit) {
        const w0 = (CFG.roadWidth[hit.c.r.class] || CFG.defaultRoadWidth) / 2;
        cars.push({
          c: hit.c, s: Math.max(4, Math.min(hit.c.len - 4, hit.s)),
          dir: hash2(k, 71) < 0.5 ? 1 : -1, speed: sc.sp,
          lane: (hash2(k, 83) < 0.5 ? 1 : -1) * (w0 / 4),
          variant: sc.v, paint: PAINTS[k % PAINTS.length],
        });
        continue;
      }
    }
    cars.push({
      c, s: hash2(k, 11) * c.len,
      dir: hash2(k, 23) < 0.5 ? 1 : -1,
      speed: 11 + hash2(k, 37) * 6,
      lane: (hash2(k, 51) < 0.5 ? 1 : -1) * (w / 4),
      variant: k % VARIANTS.length,
      paint: PAINTS[k % PAINTS.length],
    });
  }
  const geos = VARIANTS.map(makeVariant);
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const perVariant = VARIANTS.map(() => []);
  cars.forEach((car, i) => perVariant[car.variant].push(i));
  const bodyMeshes = [], glassMeshes = [], wheelMeshes = [], lightMeshes = [], roofMeshes = [];
  VARIANTS.forEach((v, vi) => {
    const idx = perVariant[vi];
    const bm = new THREE.InstancedMesh(geos[vi].body, mats.trafficBody, Math.max(1, idx.length));
    const gm = new THREE.InstancedMesh(geos[vi].glass, mats.trafficGlass, Math.max(1, idx.length));
    const wm = new THREE.InstancedMesh(geos[vi].wheel, mats.trafficWheel, Math.max(1, idx.length));
    const lm = new THREE.InstancedMesh(geos[vi].light, mats.trafficLight, Math.max(1, idx.length));
    // C3-S2: two-tone roof bucket — fixed light material, no instanceColor
    const rm = new THREE.InstancedMesh(geos[vi].roof, mats.trafficRoof, Math.max(1, idx.length));
    idx.forEach((ci, k) => {
      bm.setColorAt(k, col.setHex(cars[ci].paint));
      cars[ci].bi = k;
    });
    bm.count = idx.length; gm.count = idx.length;
    wm.count = idx.length; lm.count = idx.length; rm.count = idx.length;
    for (const m of [bm, gm, wm, lm, rm]) {
      m.instanceMatrix.needsUpdate = true;
      m.frustumCulled = false;
      group.add(m);
    }
    if (bm.instanceColor) bm.instanceColor.needsUpdate = true;
    bm.castShadow = true;
    bodyMeshes.push(bm); glassMeshes.push(gm);
    wheelMeshes.push(wm); lightMeshes.push(lm); roofMeshes.push(rm);
  });
  // shared headlight cones (apex at the nose, widening forward)
  const coneGeo = new THREE.ConeGeometry(1.05, 13, 10, 1, true);
  coneGeo.rotateZ(Math.PI / 2); // apex -> -x
  coneGeo.translate(2.1 + 6.5, 0.55, 0);
  const cones = new THREE.InstancedMesh(coneGeo, mats.trafficCone, Math.max(1, cars.length));
  cones.count = cars.length;
  cones.instanceMatrix.needsUpdate = true;
  cones.frustumCulled = false;
  cones.renderOrder = 2;
  group.add(cones);
  // shared soft blob shadows
  const shGeo = new THREE.PlaneGeometry(4.8, 2.6);
  shGeo.rotateX(-Math.PI / 2);
  shGeo.translate(0, 0.07, 0);
  const shadows = new THREE.InstancedMesh(shGeo, mats.contactShadow, Math.max(1, cars.length));
  shadows.count = cars.length;
  shadows.instanceMatrix.needsUpdate = true;
  shadows.frustumCulled = false;
  shadows.renderOrder = 2;
  group.add(shadows);

  function poseAt(car) {
    const { c } = car;
    const p = c.r.pts, cum = c.cum;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < car.s) lo = mid + 1; else hi = mid; }
    const i = Math.max(1, lo);
    const t = (car.s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
    const ax = p[i - 1][0], ay = p[i - 1][1];
    let dx = p[i][0] - ax, dy = p[i][1] - ay;
    const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    const px = ax + dx * (car.s - cum[i - 1]) - dy * car.lane * car.dir;
    const py = ay + dy * (car.s - cum[i - 1]) + dx * car.lane * car.dir;
    const heading = Math.atan2(dy * car.dir, dx * car.dir);
    const [qx, qz] = tx(px, py);
    return { qx, qz, heading };
  }
  function place(i) {
    const car = cars[i];
    const { qx, qz, heading } = poseAt(car);
    dummy.rotation.set(0, heading, 0);
    dummy.scale.set(1, 1, 1);
    dummy.position.set(qx, 0, qz);
    dummy.updateMatrix();
    bodyMeshes[car.variant].setMatrixAt(car.bi, dummy.matrix);
    glassMeshes[car.variant].setMatrixAt(car.bi, dummy.matrix);
    wheelMeshes[car.variant].setMatrixAt(car.bi, dummy.matrix);
    lightMeshes[car.variant].setMatrixAt(car.bi, dummy.matrix);
    roofMeshes[car.variant].setMatrixAt(car.bi, dummy.matrix);
    cones.setMatrixAt(i, dummy.matrix);
    shadows.setMatrixAt(i, dummy.matrix);
  }
  function update(dt) {
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      car.s += car.dir * car.speed * dt;
      if (car.s >= car.c.len) { car.s = car.c.len; car.dir = -1; car.lane = -car.lane; }
      else if (car.s <= 0) { car.s = 0; car.dir = 1; car.lane = -car.lane; }
      place(i);
    }
    for (const m of bodyMeshes) m.instanceMatrix.needsUpdate = true;
    for (const m of glassMeshes) m.instanceMatrix.needsUpdate = true;
    for (const m of wheelMeshes) m.instanceMatrix.needsUpdate = true;
    for (const m of lightMeshes) m.instanceMatrix.needsUpdate = true;
    for (const m of roofMeshes) m.instanceMatrix.needsUpdate = true;
    cones.instanceMatrix.needsUpdate = true;
    shadows.instanceMatrix.needsUpdate = true;
  }
  // initial placement (before first frame)
  for (let i = 0; i < cars.length; i++) place(i);
  for (const m of bodyMeshes) m.instanceMatrix.needsUpdate = true;
  for (const m of glassMeshes) m.instanceMatrix.needsUpdate = true;
  for (const m of wheelMeshes) m.instanceMatrix.needsUpdate = true;
  for (const m of lightMeshes) m.instanceMatrix.needsUpdate = true;
  for (const m of roofMeshes) m.instanceMatrix.needsUpdate = true;
  cones.instanceMatrix.needsUpdate = true;
  shadows.instanceMatrix.needsUpdate = true;
  const dbg = { n: cars.length, seed0: cars[0] ? cars[0].c.r.class + '/' + Math.round(cars[0].c.len) : 'none' };
  return { group, update, count: cars.length, dbg, cars };
}
