// textures.js — C2 procedural material atlas generation (generation pass,
// in-engine canvas; no external input, no ref images, no model identifiers).
//
// Vocabulary from art/LOOK.md: deep-navy night, warm-gold / cool-cyan lit
// window grids, wet asphalt with stretched reflections, muted-teal parks.
//
// All atlases are tileable (RepeatWrapping), power-of-two, and share a
// consistent texel density per family. Facade maps are tile-aligned: the
// same (u,v) addresses wall tone, glazing roughness, frame recess, and
// lit windows across albedo / roughness / normal / emissive.
import * as THREE from 'three';

// deterministic RNG so the atlases are identical every boot
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function toTex(canvas, srgb, repeat) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat, repeat);
  t.anisotropy = 8; // C2-R2: keep window detail crisp at grazing view angles
  return t;
}

// height-field canvas -> tangent-space normal canvas (Sobel, wrap-around
// so the result stays tileable). Strength scales the relief.
function heightToNormal(src, strength) {
  const w = src.width, h = src.height;
  const sd = src.getContext('2d').getImageData(0, 0, w, h).data;
  const out = src.getContext('2d').createImageData(w, h);
  const od = out.data;
  const hv = (x, y) => sd[((((y + h) % h) * w) + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (hv(x + 1, y) - hv(x - 1, y)) * strength;
      const dy = (hv(x, y + 1) - hv(x, y - 1)) * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const o = (y * w + x) * 4;
      od[o] = (-dx * inv * 0.5 + 0.5) * 255;
      od[o + 1] = (dy * inv * 0.5 + 0.5) * 255;
      od[o + 2] = (inv * 0.5 + 0.5) * 255;
      od[o + 3] = 255;
    }
  }
  const c = makeCanvas(w, h);
  c.getContext('2d').putImageData(out, 0, 0);
  return c;
}

// ---------------------------------------------------------------- facade
// One tile = 18 m x 18 m of facade (6 bays x 6 floors, 3 m bays).
// Tile-aligned: albedo / roughness / height / emissive share this layout.
const FAC = { S: 1024, TILE_M: 18, BAYS: 6, SEED: 4102 };

function facadeLayout() {
  const { S, BAYS } = FAC;
  const bay = S / BAYS;                 // 3 m in px
  const winW = S * (1.7 / FAC.TILE_M);   // 1.7 m glazing
  const winH = S * (1.5 / FAC.TILE_M);   // 1.5 m glazing
  const cells = [];
  for (let r = 0; r < BAYS; r++) {
    for (let c = 0; c < BAYS; c++) {
      const x = c * bay + (bay - winW) / 2;
      const y = r * bay + (bay - winH) / 2;
      cells.push({ x, y, w: winW, h: winH, col: c, row: r });
    }
  }
  return { bay, cells };
}

function facadeAlbedo() {
  const { S, SEED } = FAC;
  const rnd = mulberry32(SEED);
  const { bay, cells } = facadeLayout();
  const c = makeCanvas(S, S), g = c.getContext('2d');
  // base wall tone: neutral mid-grey so per-building vertex tints read
  g.fillStyle = 'rgb(148,152,162)'; g.fillRect(0, 0, S, S);
  // large tonal blotches (weathering / tone shifts)
  for (let i = 0; i < 14; i++) {
    const x = rnd() * S, y = rnd() * S, r = 90 + rnd() * 220;
    const v = rnd() < 0.5 ? -1 : 1, a = 0.05 + rnd() * 0.07;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const col = v < 0 ? '20,22,30' : '200,204,214';
    gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // spandrel bands + frames + glazing, per window
  for (const wcell of cells) {
    const { x, y, w, h } = wcell;
    // spandrel band under the window (slightly darker render band)
    g.fillStyle = 'rgba(30,32,40,0.28)';
    g.fillRect(x - (bay - w) / 2, y + h, bay, S * (0.8 / FAC.TILE_M));
    // frame: proud darker border
    g.strokeStyle = 'rgba(52,54,64,0.95)'; g.lineWidth = 7;
    g.strokeRect(x - 3, y - 3, w + 6, h + 6);
    // glazing: dark blue-grey with a faint vertical sheen
    const gg = g.createLinearGradient(0, y, 0, y + h);
    gg.addColorStop(0, 'rgb(44,54,70)'); gg.addColorStop(1, 'rgb(30,38,52)');
    g.fillStyle = gg; g.fillRect(x, y, w, h);
    // grime streak bleeding down from the sill
    const sw = w * 0.7, sx = x + (w - sw) / 2, sy = y + h;
    const sh = S * (1.6 / FAC.TILE_M);
    const sgr = g.createLinearGradient(0, sy, 0, sy + sh);
    sgr.addColorStop(0, 'rgba(18,20,26,0.20)'); sgr.addColorStop(1, 'rgba(18,20,26,0)');
    g.fillStyle = sgr; g.fillRect(sx, sy, sw, sh);
  }
  // panel lines on bay boundaries
  g.strokeStyle = 'rgba(40,42,52,0.30)'; g.lineWidth = 2;
  for (let i = 0; i <= FAC.BAYS; i++) {
    g.beginPath(); g.moveTo(i * bay, 0); g.lineTo(i * bay, S); g.stroke();
    g.beginPath(); g.moveTo(0, i * bay); g.lineTo(S, i * bay); g.stroke();
  }
  // fine aggregate noise
  for (let i = 0; i < 5200; i++) {
    const v = 120 + rnd() * 60;
    g.fillStyle = `rgba(${v | 0},${v | 0},${(v + 6) | 0},0.16)`;
    g.fillRect(rnd() * S, rnd() * S, 1.6, 1.6);
  }
  return c;
}

function facadeRoughness() {
  const { S } = FAC;
  const { cells } = facadeLayout();
  const c = makeCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = 'rgb(218,218,218)'; g.fillRect(0, 0, S, S); // wall: rough
  for (const { x, y, w, h } of cells) {
    g.fillStyle = 'rgb(140,140,140)';                       // frame: mid
    g.fillRect(x - 6, y - 6, w + 12, h + 12);
    g.fillStyle = 'rgb(36,36,36)';                          // glazing: slick
    g.fillRect(x, y, w, h);
  }
  return c;
}

function facadeHeight() {
  const { S } = FAC;
  const { bay, cells } = facadeLayout();
  const c = makeCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, S, S);
  for (const { x, y, w, h } of cells) {
    g.fillStyle = 'rgb(104,104,104)';                       // spandrel recess
    g.fillRect(x - (bay - w) / 2, y + h, bay, S * (0.8 / FAC.TILE_M));
    g.fillStyle = 'rgb(202,202,202)';                       // frame: proud
    g.fillRect(x - 6, y - 6, w + 12, h + 12);
    g.fillStyle = 'rgb(66,66,66)';                          // glazing: recessed
    g.fillRect(x, y, w, h);
  }
  g.strokeStyle = 'rgb(92,92,92)'; g.lineWidth = 2;          // panel grooves
  for (let i = 0; i <= FAC.BAYS; i++) {
    g.beginPath(); g.moveTo(i * bay, 0); g.lineTo(i * bay, S); g.stroke();
    g.beginPath(); g.moveTo(0, i * bay); g.lineTo(S, i * bay); g.stroke();
  }
  return c;
}

function facadeEmissive() {
  const { S, BAYS } = FAC;
  const rnd = mulberry32(FAC.SEED + 7);
  const { cells } = facadeLayout();
  const c = makeCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = 'rgb(0,0,0)'; g.fillRect(0, 0, S, S);
  // C2-R2: denser lit grid — a few whole floors stay dark, like the refs'
  // towers, but the lit ratio rises so near faces read as dense warm/cool
  // window grids instead of sparse dots on dark navy (punch item 2).
  // C3-steer (rung 1): lit ratio 62%->70%, dark floors 8%->4% — no face in
  // a capture hotspot may read as a near-black monolith. Plus a faint warm
  // gold in the plain atlas corner (u 0.004-0.010, v 0.972-0.988 — canvas
  // x 4..10, y 12..29 with flipY): relief bands (podium ledges, cornices,
  // pilasters) sample that corner, so the R3 relief gets a thin gold
  // emissive trim — a warm raking wash with zero new geometry. The soffit
  // sub-corner (u 0.010-0.016) stays black so the shadow lines stay dark.
  const darkRow = new Set();
  for (let r = 0; r < BAYS; r++) if (rnd() < 0.04) darkRow.add(r);
  for (const wcell of cells) {
    if (darkRow.has(wcell.row)) continue;
    const r2 = mulberry32(FAC.SEED * 31 + wcell.row * 131 + wcell.col * 17 + 5);
    if (r2() > 0.70) continue;                              // ~70% lit
    const warm = r2() < 0.62;                               // warm/cool mix
    const b = 0.68 + r2() * 0.32;
    const col = warm
      ? [Math.round(255 * b), Math.round(193 * b), Math.round(126 * b)]
      : [Math.round(172 * b), Math.round(218 * b), Math.round(255 * b)];
    const { x, y, w, h } = wcell;
    g.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
    g.fillRect(x, y, w, h);
    // mullion cross: dark bars over the lit pane
    g.fillStyle = 'rgba(8,8,10,0.85)';
    g.fillRect(x + w / 2 - 3, y, 6, h);
    g.fillRect(x, y + h / 2 - 3, w, 6);
    // soft inner falloff so panes are not flat quads
    const gr = g.createRadialGradient(x + w / 2, y + h / 2, 2, x + w / 2, y + h / 2, w / 1.4);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.38)');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
  }
  // C3-steer: faint warm gold in the plain atlas corner's relief sub-region
  // (u 0.004-0.010 -> x 4..10, v 0.972-0.988 -> y 12..29 with flipY).
  // Cornice/string-course/pilaster bands sample this corner; the gold reads
  // as a thin emissive trim / warm raking wash on the relief. Soffits sample
  // the u 0.010-0.016 sub-region, which stays black.
  g.fillStyle = 'rgb(120,72,32)';
  g.fillRect(4, 12, 7, 17);
  return c;
}

export function facadeMaps() {
  const alb = facadeAlbedo();
  const rgh = facadeRoughness();
  const nrm = heightToNormal(facadeHeight(), 2.2);
  const emi = facadeEmissive();
  return {
    albedo: toTex(alb, true),
    roughness: toTex(rgh, false),
    normal: toTex(nrm, false),
    emissive: toTex(emi, true),
  };
}

// ---------------------------------------------------------------- asphalt
// One tile = 12 m x 12 m of wet asphalt. Puddles and wear stretch along v
// (the road direction) so reflections smear the way the refs show.
const ASP = { S: 512, TILE_M: 12, SEED: 9021 };

export function asphaltMaps() {
  const { S, TILE_M, SEED } = ASP;
  const rnd = mulberry32(SEED);
  const pxm = S / TILE_M; // px per meter

  // albedo: near-black asphalt, aggregate speckle, tonal patches
  const ac = makeCanvas(S, S), ag = ac.getContext('2d');
  ag.fillStyle = 'rgb(20,22,27)'; ag.fillRect(0, 0, S, S);
  for (let i = 0; i < 10; i++) {
    const x = rnd() * S, y = rnd() * S, r = 60 + rnd() * 150;
    const v = rnd() < 0.5 ? -1 : 1;
    const gr = ag.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${v < 0 ? '8,10,14' : '34,37,44'},0.10)`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ag.fillStyle = gr; ag.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // wheel-track polish: slightly darker bands at u 0.28 / 0.72
  for (const u of [0.28, 0.72]) {
    const x = u * S, w = 0.10 * S;
    const gr = ag.createLinearGradient(x - w, 0, x + w, 0);
    gr.addColorStop(0, 'rgba(6,7,10,0)'); gr.addColorStop(0.5, 'rgba(6,7,10,0.35)');
    gr.addColorStop(1, 'rgba(6,7,10,0)');
    ag.fillStyle = gr; ag.fillRect(x - w, 0, w * 2, S);
  }
  for (let i = 0; i < 4200; i++) {
    const v = 12 + rnd() * 26;
    ag.fillStyle = `rgba(${v | 0},${(v + 2) | 0},${(v + 6) | 0},0.5)`;
    ag.fillRect(rnd() * S, rnd() * S, 1.5, 1.5);
  }

  // roughness: high base; low (dark) = mirror-ish wet spots.
  const rc = makeCanvas(S, S), rg = rc.getContext('2d');
  rg.fillStyle = 'rgb(206,206,206)'; rg.fillRect(0, 0, S, S);
  // polished wheel tracks read wetter than the crown
  for (const u of [0.28, 0.72]) {
    const x = u * S, w = 0.11 * S;
    const gr = rg.createLinearGradient(x - w, 0, x + w, 0);
    gr.addColorStop(0, 'rgba(150,150,150,0)'); gr.addColorStop(0.5, 'rgba(150,150,150,0.85)');
    gr.addColorStop(1, 'rgba(150,150,150,0)');
    rg.fillStyle = gr; rg.fillRect(x - w, 0, w * 2, S);
  }
  // puddle blotches, elongated along v (road direction)
  for (let i = 0; i < 16; i++) {
    const x = rnd() * S, y = rnd() * S;
    const rx = (0.5 + rnd() * 0.9) * pxm, ry = (1.6 + rnd() * 3.2) * pxm;
    const v = 26 + rnd() * 34;
    rg.save(); rg.translate(x, y); rg.scale(rx / ry, 1);
    const gr = rg.createRadialGradient(0, 0, 0, 0, 0, ry);
    gr.addColorStop(0, `rgba(${v | 0},${v | 0},${v | 0},0.95)`);
    gr.addColorStop(0.7, `rgba(${v | 0},${v | 0},${v | 0},0.7)`);
    gr.addColorStop(1, `rgba(${v | 0},${v | 0},${v | 0},0)`);
    rg.fillStyle = gr;
    rg.beginPath(); rg.arc(0, 0, ry, 0, 7); rg.fill();
    rg.restore();
  }
  for (let i = 0; i < 2600; i++) {
    const v = 170 + rnd() * 70;
    rg.fillStyle = `rgba(${v | 0},${v | 0},${v | 0},0.4)`;
    rg.fillRect(rnd() * S, rnd() * S, 2, 2);
  }

  // height: fine aggregate + shallow puddle dishes -> subtle normal detail
  const hc = makeCanvas(S, S), hg = hc.getContext('2d');
  hg.fillStyle = 'rgb(128,128,128)'; hg.fillRect(0, 0, S, S);
  const hrnd = mulberry32(SEED + 3);
  for (let i = 0; i < 4200; i++) {
    const v = 96 + hrnd() * 64;
    hg.fillStyle = `rgb(${v | 0},${v | 0},${v | 0})`;
    hg.fillRect(hrnd() * S, hrnd() * S, 2, 2);
  }
  const nrm = heightToNormal(hc, 1.1);

  return {
    albedo: toTex(ac, true),
    roughness: toTex(rc, false),
    normal: toTex(nrm, false),
  };
}

// ---------------------------------------------------------------- ground
// Dark city base between the buildings: near-black navy with faint tonal
// patches. Tile = 64 m; this is background fill, not a hero surface.
export function groundMaps() {
  const S = 256;
  const rnd = mulberry32(5511);
  const c = makeCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = 'rgb(10,13,22)'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 16; i++) {
    const x = rnd() * S, y = rnd() * S, r = 30 + rnd() * 90;
    const up = rnd() < 0.5;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, up ? 'rgba(22,28,42,0.35)' : 'rgba(4,6,10,0.4)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 1500; i++) {
    const v = 6 + rnd() * 18;
    g.fillStyle = `rgba(${v | 0},${(v + 3) | 0},${(v + 8) | 0},0.5)`;
    g.fillRect(rnd() * S, rnd() * S, 1.5, 1.5);
  }
  return { albedo: toTex(c, true, 140) }; // 140 tiles over ~8.9 km
}

// ---------------------------------------------------------------- parks
// Muted-teal park ground (LOOK.md) + soft foliage-dot sprite.
export function parkMaps() {
  const S = 256;
  const rnd = mulberry32(777);
  const c = makeCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = 'rgb(13,29,26)'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S, y = rnd() * S, r = 20 + rnd() * 70;
    const pick = rnd();
    const col = pick < 0.45 ? '24,48,40' : pick < 0.8 ? '10,22,20' : '30,56,44';
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${col},0.5)`); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 1800; i++) {
    const v = rnd();
    g.fillStyle = v < 0.6 ? `rgba(16,36,30,0.6)` : `rgba(38,70,58,0.5)`;
    g.fillRect(rnd() * S, rnd() * S, 1.6, 1.6);
  }
  const albedo = toTex(c, true, 1);

  // foliage dot sprite: soft blob with light/dark dabs
  const F = 64;
  const fc = makeCanvas(F, F), fg = fc.getContext('2d');
  const fr = fg.createRadialGradient(F / 2, F / 2, 0, F / 2, F / 2, F / 2);
  fr.addColorStop(0, 'rgba(255,255,255,1)');
  fr.addColorStop(0.55, 'rgba(255,255,255,0.75)');
  fr.addColorStop(1, 'rgba(255,255,255,0)');
  fg.fillStyle = fr; fg.fillRect(0, 0, F, F);
  fg.globalCompositeOperation = 'source-atop';
  const frnd = mulberry32(778);
  for (let i = 0; i < 46; i++) {
    const a = frnd() * Math.PI * 2, rr = frnd() * F * 0.36;
    const x = F / 2 + Math.cos(a) * rr, y = F / 2 + Math.sin(a) * rr;
    const rad = 2 + frnd() * 5;
    const lite = frnd() < 0.4;
    fg.fillStyle = lite ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)';
    fg.beginPath(); fg.arc(x, y, rad, 0, 7); fg.fill();
  }
  fg.globalCompositeOperation = 'source-over';
  const sprite = toTex(fc, true);

  return { albedo, sprite };
}
