// config.js — gameplay constants. No visuals, no three.js imports.
// Everything the sim needs; art lives in render/look-*.js.
export const CFG = {
  // world projection: map.json meters, x=east, y=north -> three (x, -y)
  extent: { xmin: -3753.1, xmax: 2871.3, ymin: -3652.0, ymax: 3146.9 },
  roadWidth: { motorway: 22, trunk: 18, primary: 15, secondary: 12, tertiary: 10 },
  defaultRoadWidth: 8,
  lampSpacing: { motorway: 30, trunk: 25, primary: 25, secondary: 30, tertiary: 40 },
  simHz: 120,
  car: {
    accel: 16, maxFwd: 42, maxRev: 12, brake: 26,
    drag: 0.35, grip: 9.0, driftGrip: 1.3, handbrakeDecel: 3.5,
    steerMax: 0.62, yawGain: 2.6, radius: 2.2,
  },
  offroad: { margin: 4, drag: 2.2, maxSpeed: 14 },
  checkpointRadius: 25,
  camera: { dist: 7, height: 3.2, fov: 62, lookAhead: 7 },
};
export const toThree = (x, y) => [x, -y]; // map meters -> three x,z
