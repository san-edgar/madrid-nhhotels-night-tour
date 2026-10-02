// hud.js — DOM HUD bound to sim.state (no separate copies) + round minimap
// canvas (bottom-right) with road lines, hotel pins, car arrow. Unstyled
// Stage B greybox: plain monospace panels; art comes at Stage C4.
import { CFG } from './config.js';

function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60), d = Math.floor((t % 1) * 10);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + d;
}

export function createHud(root, roads, hotels) {
  root.innerHTML = `
    <div id="hud-tl" class="hud-panel"><div class="hud-title">Madrid NH Hotels Night Tour</div><div>TIME <span id="hud-time">00:00.0</span></div>
      <div>SPEED <span id="hud-speed">0</span> km/h</div><div>SCORE <span id="hud-score">0</span></div></div>
    <div id="hud-tr" class="hud-panel">CHECKPOINTS <span id="hud-cp">0/14</span></div>
    <div id="hud-toast"></div>
    <div id="hud-hint" class="hud-panel">WASD/arrows drive · SPACE handbrake · R reset · ENTER start</div>
    <canvas id="minimap" width="440" height="440"></canvas>
    <div id="title" class="overlay"><div class="title-inner">
      <h1>Madrid NH Hotels Night Tour</h1><p class="sub">Night drive · 14 checkpoints</p>
      <p class="press">Press ENTER to drive</p>
      <p class="controls">WASD / arrows — drive · SPACE — handbrake · R — reset</p>
      <p class="loading" id="loading">loading city…</p></div></div>
    <div id="win" class="overlay hidden"><div class="title-inner">
      <h1>TOUR COMPLETE</h1><p class="sub">All 14 hotels visited</p>
      <p>TIME <span id="win-time"></span> · SCORE <span id="win-score"></span></p>
      <p class="press">Press R to drive again</p></div></div>`;

  const el = (id) => root.querySelector('#' + id);
  const timeEl = el('hud-time'), speedEl = el('hud-speed'), scoreEl = el('hud-score');
  const cpEl = el('hud-cp'), toastEl = el('hud-toast');
  const titleEl = el('title'), winEl = el('win'), loadingEl = el('loading');

  // minimap: prerender roads once
  const mm = el('minimap');
  const mg = mm.getContext('2d');
  const base = document.createElement('canvas');
  base.width = base.height = 440;
  const bg = base.getContext('2d');
  const E = CFG.extent;
  const W = E.xmax - E.xmin, H = E.ymax - E.ymin;
  const sx = (x) => (x - E.xmin) / W * 440;
  const sy = (y) => 440 - (y - E.ymin) / H * 440; // north-up
  bg.fillStyle = '#060a12';
  bg.beginPath(); bg.arc(220, 220, 218, 0, 7); bg.fill();
  bg.strokeStyle = '#22314d'; bg.lineWidth = 3;
  bg.beginPath(); bg.arc(220, 220, 218, 0, 7); bg.stroke();
  for (const r of roads) {
    bg.strokeStyle = r.class === 'motorway' || r.class === 'trunk' ? '#5a6f96' : '#33415e';
    bg.lineWidth = r.class === 'motorway' ? 2.4 : r.class === 'primary' ? 1.6 : 1;
    bg.beginPath();
    const p = r.pts;
    for (let i = 0; i < p.length; i += 3) {
      const X = sx(p[i][0]), Y = sy(p[i][1]);
      if (i === 0) bg.moveTo(X, Y); else bg.lineTo(X, Y);
    }
    bg.stroke();
  }
  let mmTick = 0;
  function drawMinimap(S, now) {
    mg.clearRect(0, 0, 440, 440);
    mg.drawImage(base, 0, 0);
    const pulse = 3 + Math.sin(now * 0.006) * 1.2;
    for (const h of S.hotels) {
      mg.beginPath();
      mg.arc(sx(h.x), sy(h.y), h.done ? 3 : pulse, 0, 7);
      mg.fillStyle = h.done ? '#3a4a6a' : '#ffc94d';
      mg.fill();
    }
    // car arrow
    const cx = sx(S.x), cy = sy(S.y);
    mg.save();
    mg.translate(cx, cy);
    mg.rotate(-S.heading); // map heading (x-east, y-north) -> canvas (x-right, y-down)
    mg.beginPath();
    mg.moveTo(0, -9); mg.lineTo(6, 7); mg.lineTo(-6, 7); mg.closePath();
    mg.fillStyle = '#7df3ff';
    mg.fill();
    mg.restore();
  }

  let lastToast = '';
  function update(S, now) {
    timeEl.textContent = fmtTime(S.timer);
    speedEl.textContent = Math.round(S.speedKmh);
    scoreEl.textContent = Math.round(S.score);
    cpEl.textContent = S.visited + '/' + S.total;
    const toast = S.toasts.length ? S.toasts[S.toasts.length - 1].text : '';
    if (toast !== lastToast) { toastEl.textContent = toast; lastToast = toast; }
    if (S.state === 'title') { titleEl.classList.remove('hidden'); }
    else titleEl.classList.add('hidden');
    if (S.state === 'done') {
      winEl.classList.remove('hidden');
      el('win-time').textContent = fmtTime(S.timer);
      el('win-score').textContent = Math.round(S.score);
    } else winEl.classList.add('hidden');
    mmTick++;
    // paint on the first frames too: on slow software renderers the 6th
    // frame may fall outside short capture windows, leaving a black disc
    if (mmTick % 6 === 0 || mmTick <= 2) drawMinimap(S, now); // ~10 Hz
  }
  function setLoading(t) { if (loadingEl) loadingEl.textContent = t; }
  return { update, setLoading };
}
