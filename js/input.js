// input.js — keyboard -> command struct. No three.js.
export function createInput() {
  const keys = new Set();
  const cmd = { throttle: 0, steer: 0, brake: 0, handbrake: false };
  const pressed = new Set(); // edge-triggered, consumed by main
  const code = (e) => e.code;
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (!e.repeat) pressed.add(e.code);
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  function poll() {
    const up = keys.has('KeyW') || keys.has('ArrowUp');
    const down = keys.has('KeyS') || keys.has('ArrowDown');
    const left = keys.has('KeyA') || keys.has('ArrowLeft');
    const right = keys.has('KeyD') || keys.has('ArrowRight');
    cmd.throttle = (up ? 1 : 0) + (down ? -1 : 0);
    cmd.brake = down ? 1 : 0;
    cmd.steer = (left ? 1 : 0) + (right ? -1 : 0);
    cmd.handbrake = keys.has('Space');
    return cmd;
  }
  function consume(what) { const h = pressed.has(what); pressed.delete(what); return h; }
  return { poll, consume, keys };
}
