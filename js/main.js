// main.js — boot, state machine, frame loop. Wires gameplay (sim/input/
// camera/hud/debug) to the renderer (rig + look module). Gameplay modules
// never import the look module; the look is chosen here by ?look=.
import * as THREE from 'three';
import { CFG } from './config.js';
import { loadData, loadTitleArt } from './data.js';
import { createInput } from './input.js';
import { createSim } from './sim.js';
import { newRig } from './render/rig.js';
import { buildGround, buildRoads, buildSidewalks, buildBuildings, buildLamps, buildNeonSigns, buildSignColumns, buildHotspotPracticals, buildDeckGlow, buildParks, buildParkedCars, buildBollards, buildTextSigns, buildGantries, buildStreetTrees } from './city.js';
import { buildCar } from './car.js';
import { buildTraffic } from './traffic.js';
import { buildBeacons } from './beacons.js';
import { createChaseCam } from './camera.js';
import { createHud } from './hud.js';
import { createDebug } from './debug.js';

const params = new URLSearchParams(location.search);
const lookName = params.get('look') === 'alt' ? 'alt' : 'default';

// capture-harness contract: window.MND.sim.state is a string
// ('loading' | 'title' | 'running' | 'done'); MND_BOOT_ERROR on failure.
let simRef = null;
window.MND = {
  version: 'stage-b', look: lookName,
  get sim() { return simRef ? { state: simRef.state.state, x: simRef.state.x, y: simRef.state.y, heading: simRef.state.heading } : { state: 'loading' }; },
};
const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

// nearest road segment direction at (x,y) — for spawn/teleport headings
function nearestRoadDir(roads, x, y) {
  let bx = 1, by = 0, bd = Infinity;
  for (const r of roads) {
    const p = r.pts;
    for (let i = 0; i < p.length - 1; i++) {
      const ax = p[i][0], ay = p[i][1];
      const dx = p[i + 1][0] - ax, dy = p[i + 1][1] - ay;
      const L2 = dx * dx + dy * dy || 1;
      let t = ((x - ax) * dx + (y - ay) * dy) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + t * dx, qy = ay + t * dy;
      const d = (x - qx) * (x - qx) + (y - qy) * (y - qy);
      if (d < bd) { bd = d; bx = dx; by = dy; }
    }
  }
  return Math.atan2(by, bx);
}

async function boot() {
  const hudRoot = document.getElementById('hud');
  let hud;
  try {
    const look = (await import(`./render/look-${lookName}.js`)).default;
    const data = await loadData();

    // start on the Gran Via road ribbon, 60 m before the NH Collection
    // Gran Via beacon so the first checkpoint is earned, not free
    const h0 = data.hotels[2]; // "NH Collection Madrid Gran Via" (sorted by name)
    const startHeading = nearestRoadDir(data.roads, h0.roadX, h0.roadY);
    const startX = h0.roadX - Math.cos(startHeading) * 60;
    const startY = h0.roadY - Math.sin(startHeading) * 60;
    // C3-R2: capture hotspot — the drive start in the Gran Via corridor.
    // All capture scenes sit here, so corridor-aware builders (parked cars,
    // furniture, signs, gantries, trees) densify inside a radius of it.
    const hotspot = { x: startX, y: startY };
    const sim = createSim(data, startX, startY, startHeading);
    const S = sim.state;
    simRef = sim;

    const rig = newRig(look);
    document.getElementById('app').appendChild(rig.renderer.domElement);

    hud = createHud(hudRoot, data.roads, data.hotels);
    hud.setLoading('building roads…'); await yieldFrame();
    const [roadMesh, markMesh, skirtMesh] = buildRoads(data.roads, rig.mats);
    const walkMesh = buildSidewalks(data.roads, rig.mats);
    rig.scene.add(buildGround(rig.mats), roadMesh, markMesh, skirtMesh, walkMesh);
    hud.setLoading('building towers…'); await yieldFrame();
    const bMeshes = buildBuildings(data.buildings, rig.mats, (f) => hud.setLoading(`building towers… ${Math.round(f * 100)}%`));
    for (const m of bMeshes) rig.scene.add(m);
    hud.setLoading('street lights…'); await yieldFrame();
    const lamps = buildLamps(data.roads, rig.mats, look);
    rig.scene.add(lamps.group);
    hud.setLoading('neon signs…'); await yieldFrame();
    const signs = buildNeonSigns(data.roads, rig.mats, hotspot);
    rig.scene.add(signs.group);
    hud.setLoading('road glow…'); await yieldFrame();
    rig.scene.add(buildDeckGlow(data.roads, rig.mats));
    hud.setLoading('parks…'); await yieldFrame();
    rig.scene.add(buildParks(data.buildings, data.roads, rig.mats));
    hud.setLoading('beacons…'); await yieldFrame();
    const beacons = buildBeacons(sim.hotels, rig.mats, rig.scene);
    hud.setLoading('parked cars…'); await yieldFrame();
    const parked = buildParkedCars(data.roads, rig.mats, data.hotels, hotspot);
    rig.scene.add(parked.group);
    hud.setLoading('street furniture…'); await yieldFrame();
    rig.scene.add(buildBollards(data.roads, rig.mats, hotspot).group);
    hud.setLoading('neon text…'); await yieldFrame();
    rig.scene.add(buildTextSigns(data.roads, rig.mats, hotspot).group);
    hud.setLoading('overhead signs…'); await yieldFrame();
    const gantries = buildGantries(data.roads, rig.mats, hotspot);
    rig.scene.add(gantries.group);
    hud.setLoading('street trees…'); await yieldFrame();
    const trees = buildStreetTrees(data.roads, rig.mats, hotspot);
    rig.scene.add(trees.group);
    hud.setLoading('sign columns…'); await yieldFrame();
    // C3-S2: vertical neon sign columns on the near faces (steer §4.6)
    // C3-T1 (steer2 §4.7): focus anchors — the S2 columns missed the scored
    // still-03/04 frustums (beacon 2, ~40 m ahead of the drive-start
    // hotspot), so placement is now anchor-sorted into those frustums.
    // washAnchor: the still-03/04 scored-frustum anchor — 20 m behind
    // beacon 2 (NH Collection Madrid Gran Via), covering both the
    // still-03 (back=25) and still-04 (back=18) cameras.
    const h2 = sim.hotels[2];
    const hd2 = nearestRoadDir(data.roads, h2.x, h2.y);
    const washAnchor = { x: h2.x - Math.cos(hd2) * 20, y: h2.y - Math.sin(hd2) * 20 };
    const signColumns = buildSignColumns(data.roads, rig.mats, hotspot, [hotspot, washAnchor]);
    rig.scene.add(signColumns.group);
    hud.setLoading('hotspot practicals…'); await yieldFrame();
    // C3-T1 (steer2 §4.1 + §4.6): warm raking wash for the R3 facade relief
    // + pink/cyan car-modeling pair at the scored-frustum anchor. Lights
    // only — C1 rig and C2 materials untouched.
    rig.scene.add(buildHotspotPracticals(data.roads, washAnchor).group);
    hud.setLoading('traffic…'); await yieldFrame();
    const traffic = buildTraffic(data.roads, rig.mats, startX, startY, startHeading);
    rig.scene.add(traffic.group);
    const car = buildCar(rig.mats, look);
    rig.scene.add(car.group);
    // draw-call probe hook (capture tooling only)
    window.MND.rig = rig;
    // C3 geometry probe hooks (capture tooling only)
    window.MND.c3 = { parked, traffic, gantries, trees };

    const input = createInput();
    const chase = createChaseCam(rig.camera);
    chase.snap(S.x, S.y, S.heading);

    const hooks = {
      teleport(i, backoff = 0, yawDeg = 0) {
        const h = sim.hotels[i];
        const hd = nearestRoadDir(data.roads, h.x, h.y);
        S.x = h.x - Math.cos(hd) * backoff;
        S.y = h.y - Math.sin(hd) * backoff;
        // C3-steer capture staging: yaw the spawn so the beacon pillar
        // sits off-axis and the corridor stays open in the frame.
        S.heading = hd + yawDeg * Math.PI / 180;
        S.vx = 0; S.vy = 0;
        chase.snap(S.x, S.y, S.heading);
      },
      // run a few sim steps without rendering (lets arrival detection fire)
      nudge() {
        const cmd = { throttle: 0, steer: 0, brake: 0, handbrake: false };
        for (let k = 0; k < 10; k++) sim.step(1 / 120, cmd);
      },
    };
    const debug = createDebug(params, hooks);
    window.MND.debug = { mode: debug.mode, teleport: (i) => hooks.teleport(i) };

    // Title art ships as base64 chunks; paint it once decoded (CSS fallback stays).
    try {
      const artUrl = await loadTitleArt();
      if (artUrl) {
        const titleEl = document.getElementById('title');
        if (titleEl) titleEl.style.backgroundImage = `url("${artUrl}")`;
      }
    } catch { /* fallback background remains */ }

    S.state = 'title';
    debug.boot(S);
    hud.setLoading('');

    // fixed-step accumulator
    const DT = 1 / CFG.simHz;
    let acc = 0, last = performance.now();
    const clock = { t: 0 };
    function frame(now) {
      requestAnimationFrame(frame);
      // debug capture mode: let sim time track wall clock even when the
      // software renderer is slow (capture tooling only)
      const dtCap = debug.active ? 2.0 : 0.1;
      let dt = Math.min(dtCap, (now - last) / 1000);
      last = now;
      clock.t += dt;

      if (S.state === 'title' && (input.consume('Enter') || input.consume('NumpadEnter'))) {
        S.state = 'running';
      }
      if (input.consume('KeyR')) {
        if (S.state === 'done') { sim.reset(true); S.state = 'running'; chase.snap(S.x, S.y, S.heading); }
        else if (S.state === 'running') { sim.respawnAtBeacon(); chase.snap(S.x, S.y, S.heading); }
      }

      if (S.state === 'running' && !debug.frozen) {
        const cmd = input.poll();
        debug.apply(cmd, S);
        acc += dt;
        // debug capture mode: run the sim in real time even when the
        // software renderer is slow (capture tooling only)
        const maxSteps = debug.active ? 240 : 12;
        let n = 0;
        while (acc >= DT && n < maxSteps) { sim.step(DT, cmd); debug.tick(S); acc -= DT; n++; }
        if (n === maxSteps) acc = 0;
      }

      // render sync from sim state
      const [cx, cz] = [S.x, -S.y];
      car.group.position.set(cx, 0, cz);
      car.group.rotation.y = S.heading;
      car.update(dt, S, rig.scene);
      chase.update(dt, S.x, S.y, S.heading, S.speedKmh, S.steerVis);
      rig.followCar(cx, cz);
      beacons.update(clock.t, rig.camera.position);
      traffic.update(dt);
      hud.update(S, now);
      rig.render(dt);
    }
    requestAnimationFrame(frame);
  } catch (err) {
    window.MND_BOOT_ERROR = String(err && err.stack || err);
    if (hud) hud.setLoading('boot failed: ' + (err && err.message));
    throw err;
  }
}
boot();
