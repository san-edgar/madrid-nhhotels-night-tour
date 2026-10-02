// debug.js — ?debug hooks for capture purposes ONLY (never in normal play).
//   ?debug=drive      skip title, autopilot forward with a weave
//   ?debug=drive&drift=1  autopilot + periodic handbrake drifts
//   ?debug=drivefrom&cp=N  teleport to beacon N, then autopilot drive
//   ?debug=cp:N[&back=M][&yaw=D]  teleport next to beacon N (arrival fires);
//     back = metres behind the beacon along the road (default 0),
//     yaw = extra spawn heading degrees (default 0). C3-steer: keeps the
//     beacon pillar off-axis so the corridor stays open in the frame.
//   ?debug=arrival&cp=N[&back=M][&yaw=D]  frozen arrival at beacon N
//   ?debug=win        mark all but last visited, teleport to last -> win screen
//   ?debug=tour       auto-teleport through every beacon in sequence
// Exposed as window.MND.debug; window.MND.sim.state mirrors the sim state.
// C3-T1 (steer2 §4.8): capture-staging lateral offset — shifts the hero a
// few metres perpendicular to its heading at boot so the nearest traffic
// car presents a rear-3/4 (wheels/arches can geometrically read) instead
// of the dead-rear worst case. Staging only; the locked camera survives it.
function applyLat(S, params) {
  const lat = parseFloat(params.get('lat') || '0') || 0;
  if (!lat) return;
  S.x += -Math.sin(S.heading) * lat;
  S.y += Math.cos(S.heading) * lat;
}

export function createDebug(params, hooks) {
  const mode = params.get('debug');
  const api = { mode, active: !!mode, t: 0 };
  const cpN = (S) => Math.max(0, Math.min(S.hotels.length - 1, parseInt(params.get('cp') || '0', 10) || 0));
  api.apply = (cmd, S) => {
    if (!mode) return;
    api.t += 1 / 120;
    if (mode === 'drive' || mode === 'drivefrom') {
      cmd.throttle = 1; cmd.brake = 0; cmd.handbrake = false;
      cmd.steer = Math.sin(api.t * 0.35) * 0.45;
      if (params.get('drift') === '1' && (api.t % 5) > 4.2) {
        cmd.handbrake = true; cmd.steer = 1; cmd.throttle = 0.4;
      }
    }
  };
  api.boot = (S) => {
    if (!mode) return;
    if (mode === 'cp') {
      const n = cpN(S);
      S.state = 'running';
      hooks.teleport(n, parseFloat(params.get('back') || '0') || 0, parseFloat(params.get('yaw') || '0') || 0);
    } else if (mode === 'drivefrom') {
      // C3-steer: a genuinely distinct drive hotspot — teleport to beacon N
      // (far from the drive start), then autopilot forward.
      const n = cpN(S);
      S.state = 'running';
      hooks.teleport(n, 0, 0);
      applyLat(S, params);
    } else if (mode === 'arrival') {
      // teleport just short of a beacon, let arrival fire, then FREEZE the
      // sim so the arrival toast stays on screen for the capture
      const n = cpN(S);
      S.state = 'running';
      hooks.teleport(n, parseFloat(params.get('back') || '18') || 0, parseFloat(params.get('yaw') || '0') || 0);
      hooks.nudge();
      api.frozen = true;
    } else if (mode === 'win') {
      S.state = 'running';
      S.hotels.forEach((h, i) => { if (i < S.hotels.length - 1) { h.done = true; S.visited++; S.score += 500; } });
      hooks.teleport(S.hotels.length - 1);
    } else if (mode === 'tour') {
      S.state = 'running';
      api.tourIdx = 0; api.tourTimer = 0;
      hooks.teleport(0);
    } else if (mode === 'drive') {
      S.state = 'running';
      applyLat(S, params);
    }
  };
  api.tick = (S) => {
    if (mode !== 'tour') return;
    api.tourTimer += 1 / 120;
    if (api.tourTimer > 2.0) {
      api.tourTimer = 0;
      api.tourIdx++;
      if (api.tourIdx < S.hotels.length) hooks.teleport(api.tourIdx);
    }
  };
  return api;
}
