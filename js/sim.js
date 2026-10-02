// sim.js — fixed-step arcade driving sim + checkpoint logic. No three.js,
// no materials, no lights. Pure state in meters (x=east, y=north).
import { CFG } from './config.js';

function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

// uniform grid of items with AABBs
function makeGrid(cell) {
  const cells = new Map();
  const key = (cx, cy) => cx + ':' + cy;
  return {
    insert(minx, miny, maxx, maxy, item) {
      for (let cx = Math.floor(minx / cell); cx <= Math.floor(maxx / cell); cx++)
        for (let cy = Math.floor(miny / cell); cy <= Math.floor(maxy / cell); cy++) {
          const k = key(cx, cy);
          let a = cells.get(k);
          if (!a) { a = []; cells.set(k, a); }
          a.push(item);
        }
    },
    query(x, y, out) {
      out.length = 0;
      const a = cells.get(key(Math.floor(x / cell), Math.floor(y / cell)));
      if (a) for (let i = 0; i < a.length; i++) out.push(a[i]);
      return out;
    },
  };
}

export function createSim(data, startX, startY, startHeading) {
  const roads = data.roads;
  const C = CFG.car;

  // road segment spatial index (for off-road drag)
  const roadGrid = makeGrid(60);
  const maxHalf = Math.max(...Object.values(CFG.roadWidth)) / 2 + CFG.offroad.margin;
  const segList = [];
  for (const r of roads) {
    const hw = (CFG.roadWidth[r.class] || CFG.defaultRoadWidth) / 2;
    const p = r.pts;
    for (let i = 0; i < p.length - 1; i++) {
      const s = { ax: p[i][0], ay: p[i][1], bx: p[i + 1][0], by: p[i + 1][1], hw, name: r.name || '' };
      segList.push(s);
      roadGrid.insert(
        Math.min(s.ax, s.bx) - maxHalf, Math.min(s.ay, s.by) - maxHalf,
        Math.max(s.ax, s.bx) + maxHalf, Math.max(s.ay, s.by) + maxHalf, s);
    }
  }
  const _q = [];
  function nearestRoad(x, y) {
    roadGrid.query(x, y, _q);
    let best = 1e9, bestName = '';
    for (const s of _q) {
      const dx = s.bx - s.ax, dy = s.by - s.ay;
      const L2 = dx * dx + dy * dy;
      let t = L2 > 0 ? ((x - s.ax) * dx + (y - s.ay) * dy) / L2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = s.ax + t * dx, qy = s.ay + t * dy;
      const d = Math.hypot(x - qx, y - qy) - s.hw;
      if (d < best) { best = d; bestName = s.name; }
    }
    return { d: best, name: bestName };
  }
  function roadDist(x, y) { return nearestRoad(x, y).d; }

  // building AABB index (solid walls)
  const bGrid = makeGrid(100);
  for (const b of data.buildings) {
    const pts = b.pts;
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    for (const p of pts) {
      if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0];
      if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1];
    }
    if (maxx - minx < 0.5 || maxy - miny < 0.5) continue;
    // erode 1 m: arcade/passage footprints stop being invisible walls,
    // and near-misses don't wedge the car
    const e = 1.0;
    if (maxx - minx < 2 * e + 0.5 || maxy - miny < 2 * e + 0.5) continue;
    bGrid.insert(minx, miny, maxx, maxy, { minx: minx + e, miny: miny + e, maxx: maxx - e, maxy: maxy - e });
  }
  const _bq = [];
  function collideBuildings() {
    bGrid.query(S.x, S.y, _bq);
    const r = C.radius;
    for (let pass = 0; pass < 2; pass++) { // second pass settles wedges between two walls
    for (const b of _bq) {
      if (S.x > b.minx - r && S.x < b.maxx + r && S.y > b.miny - r && S.y < b.maxy + r) {
        const pl = S.x - (b.minx - r), pr = (b.maxx + r) - S.x;
        const pb = S.y - (b.miny - r), pt = (b.maxy + r) - S.y;
        const m = Math.min(pl, pr, pb, pt);
        if (m === pl) { S.x = b.minx - r; if (S.vx < 0) S.vx *= -0.25; }
        else if (m === pr) { S.x = b.maxx + r; if (S.vx > 0) S.vx *= -0.25; }
        else if (m === pb) { S.y = b.miny - r; if (S.vy < 0) S.vy *= -0.25; }
        else { S.y = b.maxy + r; if (S.vy > 0) S.vy *= -0.25; }
        S.hit = 0.25;
      }
    }
    }
  }

  const hotels = data.hotels.map((h, i) => ({
    idx: i, name: h.name, short: h.short, brand: h.brand,
    x: h.roadX, y: h.roadY, hx: h.x, hy: h.y, done: false,
  }));

  const S = {
    state: 'loading', // loading | title | running | done
    x: startX, y: startY, heading: startHeading, vx: 0, vy: 0,
    steerVis: 0, speedKmh: 0, drifting: false,
    timer: 0, score: 0, driftScore: 0,
    visited: 0, total: hotels.length,
    toasts: [], // {text, t}
    hit: 0, offroad: false, street: '',
    hotels,
  };

  function reset(toStart) {
    S.timer = 0; S.score = 0; S.driftScore = 0; S.visited = 0; S.toasts.length = 0;
    for (const h of hotels) h.done = false;
    if (toStart) { S.x = startX; S.y = startY; S.heading = startHeading; S.vx = 0; S.vy = 0; }
  }

  function respawnAtBeacon() {
    let b = hotels[hotels.length - 1];
    for (let i = hotels.length - 1; i >= 0; i--) if (hotels[i].done) { b = hotels[i]; break; }
    S.x = b.x; S.y = b.y; S.vx = 0; S.vy = 0;
  }

  function step(dt, cmd) {
    const fx = Math.cos(S.heading), fy = Math.sin(S.heading);
    let vf = S.vx * fx + S.vy * fy;
    let lx = S.vx - fx * vf, ly = S.vy - fy * vf;

    // steering
    const spd = Math.abs(vf);
    const steerMax = C.steerMax * (1 - Math.min(spd / 42, 0.55));
    let yaw = cmd.steer * steerMax * Math.max(-1, Math.min(1, vf / 6)) * C.yawGain;
    if (cmd.handbrake) yaw *= 1.6;
    S.heading += yaw * dt;
    S.steerVis += (cmd.steer - S.steerVis) * Math.min(1, 10 * dt);
    const nfx = Math.cos(S.heading), nfy = Math.sin(S.heading);
    // re-split velocity in the new frame (keeps momentum -> drift feel)
    vf = S.vx * nfx + S.vy * nfy;
    lx = S.vx - nfx * vf; ly = S.vy - nfy * vf;

    // longitudinal
    let a = 0;
    if (cmd.handbrake) { a -= vf * C.handbrakeDecel; }
    else if (cmd.throttle > 0) { a += C.accel * cmd.throttle; }
    else if (cmd.throttle < 0) { a += (vf > 0.5 ? -C.brake : C.accel * 0.55 * cmd.throttle); }
    a -= vf * C.drag;
    vf += a * dt;
    if (vf > C.maxFwd) vf = C.maxFwd;
    if (vf < -C.maxRev) vf = -C.maxRev;

    // lateral grip
    const grip = cmd.handbrake ? C.driftGrip : C.grip;
    const gk = Math.exp(-grip * dt);
    lx *= gk; ly *= gk;
    const latSpd = Math.hypot(lx, ly);
    S.drifting = latSpd > 3 && spd > 10;
    if (S.drifting) { const bonus = latSpd * dt * 2; S.driftScore += bonus; S.score += bonus; }

    // off-road drag
    const nr = nearestRoad(S.x, S.y);
    const rd = nr.d;
    S.street = rd < 30 ? nr.name : '';
    S.offroad = rd > CFG.offroad.margin;
    if (S.offroad) {
      const k = Math.exp(-CFG.offroad.drag * dt);
      vf *= k; lx *= k; ly *= k;
      if (vf > CFG.offroad.maxSpeed) vf = CFG.offroad.maxSpeed;
      if (vf < -CFG.offroad.maxSpeed) vf = -CFG.offroad.maxSpeed;
    }

    S.vx = nfx * vf + lx; S.vy = nfy * vf + ly;
    S.x += S.vx * dt; S.y += S.vy * dt;

    collideBuildings();
    if (S.hit > 0) S.hit -= dt;

    // world bounds (soft)
    const E = CFG.extent, m = 20;
    if (S.x < E.xmin + m) { S.x = E.xmin + m; S.vx = Math.abs(S.vx) * 0.3; }
    if (S.x > E.xmax - m) { S.x = E.xmax - m; S.vx = -Math.abs(S.vx) * 0.3; }
    if (S.y < E.ymin + m) { S.y = E.ymin + m; S.vy = Math.abs(S.vy) * 0.3; }
    if (S.y > E.ymax - m) { S.y = E.ymax - m; S.vy = -Math.abs(S.vy) * 0.3; }

    S.speedKmh = Math.abs(vf) * 3.6;
    S.timer += dt;

    // checkpoints
    const R2 = CFG.checkpointRadius * CFG.checkpointRadius;
    for (const h of hotels) {
      if (h.done) continue;
      const dx = S.x - h.x, dy = S.y - h.y;
      if (dx * dx + dy * dy < R2) {
        h.done = true; S.visited++;
        S.score += 500;
        S.toasts.push({ text: 'CHECKPOINT ' + S.visited + '/' + S.total + ' — ' + h.name, t: 3.2 });
        if (S.visited >= S.total) S.state = 'done';
        break;
      }
    }
    for (let i = S.toasts.length - 1; i >= 0; i--) {
      S.toasts[i].t -= dt;
      if (S.toasts[i].t <= 0) S.toasts.splice(i, 1);
    }
  }

  return { state: S, hotels, reset, respawnAtBeacon, step, roadDist };
}

export { hash2 };
