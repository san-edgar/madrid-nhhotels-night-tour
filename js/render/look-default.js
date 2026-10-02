// look-default.js — "Neon-noir Madrid" look preset.
// RENDERER CONTRACT: a look module exports exactly:
//   { name, sky, fog, lights(scene, api), materials(), post() }
// gameplay (sim/input/camera/hud/debug) never imports this file.
// Swapping the look = booting with ?look=<name>; no gameplay edit.
//
// C1 tune (2026-10-01, against art/LOOK.md): cool moon key with real
// shadows, dim blue hemisphere fill, deep-navy fog, disciplined bloom,
// neon-noir grade (navy shadow lift, warm highlight bias, vignette).
import * as THREE from 'three';
import { facadeMaps, asphaltMaps, groundMaps, parkMaps } from './textures.js';

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// soft radial falloff: bright center -> transparent edge
function radialTex(size) {
  return canvasTex(size, size, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, h);
  });
}

// vertical fade: bright at top (v=1) -> transparent at bottom (v=0)
function fadeVTex(w, h) {
  return canvasTex(w, h, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}

// C3/P09: neon tube text billboard — original words only, tube glow with a
// hot core so the sign blooms. Canvas 256x96, transparent.
function neonTextTex(word, color) {
  const t = canvasTex(256, 96, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.font = '900 58px "Arial Narrow", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    // tube halo
    g.shadowColor = color; g.shadowBlur = 22;
    g.fillStyle = color;
    g.fillText(word, w / 2, h / 2 + 2);
    g.fillText(word, w / 2, h / 2 + 2);
    // hot core
    g.shadowBlur = 6;
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.fillText(word, w / 2, h / 2 + 2);
    // underline tube
    g.shadowBlur = 14;
    g.fillStyle = color;
    g.fillRect(28, h - 18, w - 56, 4);
  });
  t.anisotropy = 4;
  return t;
}

export default {
  name: 'neon-noir-default',

  // C1-R2: indigo storm horizon feeding the banded sky shader; deep
  // indigo fog, denser so it swallows the towers (ref-03)
  sky: { top: 0x040614, horizon: 0x17123c, stars: 220 },

  fog: { color: 0x0a0d20, density: 0.0021 },

  lights(scene, api) {
    // C1-R2: magenta-purple ambient lift — ref-01's "pervasive magenta-pink
    // ambient lifts everything; shadows are pink, not black" (art/LOOK.md)
    const hemi = new THREE.HemisphereLight(0x4a3a6e, 0x0a0a12, 0.6);
    scene.add(hemi);
    // cool moon key: from the east-northeast, high; the rig's followCar()
    // keeps this offset relative to the car so shadows track the chase cam
    const key = new THREE.DirectionalLight(0x9fbfff, 1.6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -60; key.shadow.camera.right = 60;
    key.shadow.camera.top = 60; key.shadow.camera.bottom = -60;
    key.shadow.camera.near = 10; key.shadow.camera.far = 300;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.6;
    scene.add(key); scene.add(key.target);
    api.keyLight = key; // rig moves it to follow the car
    return { hemi, key };
  },

  // per-class lamp tinting: cool white on arterials, warm sodium on
  // tertiary — resolved per road class; city.buildLamps applies these as
  // instance colors on the orb/glow/pool/streak instanced meshes.
  // C1-R2: arterial pools shifted teal-cyan toward the ref-04 deck accents.
  lampTints: {
    arterial: { orb: 0xdceaff, glow: 0xbfe0ff, pool: 0x9fe4d8, streak: 0x8fd8cc },
    sodium: { orb: 0xffd9a8, glow: 0xffbe78, pool: 0xffab5e, streak: 0xff9e55 },
  },

  lampTint(cls) {
    return ['motorway', 'trunk', 'primary', 'secondary'].includes(cls)
      ? this.lampTints.arterial
      : this.lampTints.sodium;
  },

  carSpots(carGroup) {
    const spots = [];
    for (const sx of [-0.7, 0.7]) {
      const s = new THREE.SpotLight(0xd8ecff, 320, 70, 0.46, 0.5, 1.6);
      s.position.set(2.0, 0.9, sx);
      s.target.position.set(30, -0.5, sx * 2.2);
      carGroup.add(s); carGroup.add(s.target);
      spots.push(s);
    }
    return spots;
  },

  materials() {
    // C2 material pass (procedural canvas atlases, tileable, power-of-two,
    // tile-aligned per family; see game/js/render/textures.js).
    const fac = facadeMaps();   // 1024px tile = 18 m facade: albedo/rough/normal/emissive
    const asp = asphaltMaps();  // 512px tile = 12 m wet asphalt: albedo/rough/normal
    const gnd = groundMaps();   // 256px dark city base (repeat baked in)
    const prk = parkMaps();     // muted-teal park ground + foliage-dot sprite
    // C3/P10: fake neon environment for the hero car's clearcoat — equirect
    // gradient with navy sky, gold/cyan/magenta neon streak bands at the
    // horizon and dark road below. Gives the fresnel neon-rim response so
    // the paint picks up the street's neon instead of reading flat.
    const carEnvTex = canvasTex(256, 128, (g, w, h) => {
      const v = g.createLinearGradient(0, 0, 0, h);
      v.addColorStop(0, '#05081a');
      v.addColorStop(0.42, '#101736');
      v.addColorStop(0.52, '#1a1440');
      v.addColorStop(0.62, '#0a0c18');
      v.addColorStop(1, '#03040a');
      g.fillStyle = v; g.fillRect(0, 0, w, h);
      let s = 31337;
      const srnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      // neon streak bands at the horizon (sign rows / street glow).
      // C3-T1 (steer2 §4.1): the bands are the ref-01 "streaky speculars"
      // mechanism on clearcoat paint — made taller, brighter, and more
      // numerous so flat rear faces at chase distance carry visible
      // pink/cyan streak reflections instead of crushing uniform.
      const bands = [
        ['#ffc94d', 54, 7], ['#37e6ff', 61, 6], ['#ff3df0', 68, 7],
        ['#ffd9a8', 58, 3], ['#2ee6d8', 64, 3], ['#ff5ec4', 72, 5],
        ['#4df3ff', 66, 3], ['#ffb13d', 75, 4],
      ];
      for (const [col, y, bh] of bands) {
        g.fillStyle = col; g.globalAlpha = 1.0;
        for (let x = 0; x < w; x += 3) {
          if (srnd() < 0.86) g.fillRect(x, y + (srnd() - 0.5) * 8, 2.6, bh);
        }
      }
      g.globalAlpha = 1;
      // window-light blobs above the horizon
      for (let i = 0; i < 90; i++) {
        const x = srnd() * w, y = 18 + srnd() * 30;
        g.fillStyle = srnd() < 0.6 ? 'rgba(255,190,120,0.5)' : 'rgba(140,200,255,0.5)';
        g.fillRect(x, y, 2, 3);
      }
    });
    carEnvTex.mapping = THREE.EquirectangularReflectionMapping;
    // C3/P10: metallic-flake roughness variation for the clearcoat paint
    const flakeTex = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = 'rgb(190,190,190)'; g.fillRect(0, 0, w, h);
      let s = 271;
      const srnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      for (let i = 0; i < 2600; i++) {
        const v = 120 + ((srnd() * 135) | 0);
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(srnd() * w, srnd() * h, 1.6, 1.6);
      }
    });
    flakeTex.wrapS = flakeTex.wrapT = THREE.RepeatWrapping;
    const beaconTex = canvasTex(128, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, h, 0, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0.18)');
      gr.addColorStop(0.18, 'rgba(255,255,255,0.30)');
      gr.addColorStop(0.45, 'rgba(255,255,255,0.85)');
      gr.addColorStop(0.75, 'rgba(255,255,255,0.55)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      // C2-R2: deep energy grooves carved into the glow + bright ribs —
      // the column needs readable surface variation up close, not a flat
      // wash. Deterministic.
      let s = 4242;
      const srnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 16; i++) {
        const x = srnd() * w, bw = 2 + srnd() * 5;
        g.fillStyle = `rgba(0,0,0,${0.25 + srnd() * 0.25})`;
        g.fillRect(x, 0, bw, h);
      }
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = 'rgba(255,255,255,0.20)';
      for (let i = 0; i < 12; i++) {
        const x = srnd() * w, bw = 1.5 + srnd() * 2.5;
        g.fillRect(x, 0, bw, h);
      }
    });
    const poolTex = radialTex(128);
    const coneTex = fadeVTex(32, 128); // fades along the cone length
    // wet-smear: bright under the lamp, fading symmetrically along the road
    const smearTex = canvasTex(32, 128, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.42, 'rgba(255,255,255,0.55)');
      gr.addColorStop(0.5, 'rgba(255,255,255,1)');
      gr.addColorStop(0.58, 'rgba(255,255,255,0.55)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    // sidewalk slab pattern: dark concrete, slightly lighter 2 m slabs
    const slabTex = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#20262f'; g.fillRect(0, 0, w, h);
      let s = 987;
      const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      for (let i = 0; i < 260; i++) {
        const v = 26 + rnd() * 14;
        g.fillStyle = `rgb(${v | 0},${(v + 4) | 0},${(v + 9) | 0})`;
        g.fillRect(rnd() * w, rnd() * h, 2, 2);
      }
      g.strokeStyle = 'rgba(8,10,14,0.9)'; g.lineWidth = 3;
      for (let i = 0; i <= 4; i++) {
        g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.stroke();
        g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke();
      }
    });
    slabTex.wrapS = slabTex.wrapT = THREE.RepeatWrapping;
    // C1-R2: warm lamp halo — hot core fading to a warm tint, then clear.
    // Billboards (Points) with this map give lamp heads gradient falloff
    // instead of flat blown-out polygons (punch item 6).
    const glowTex = canvasTex(128, 128, (g, w, h) => {
      const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      r.addColorStop(0, 'rgba(255,244,224,1)');
      r.addColorStop(0.18, 'rgba(255,236,200,0.85)');
      r.addColorStop(0.45, 'rgba(255,214,160,0.38)');
      r.addColorStop(0.75, 'rgba(255,190,130,0.12)');
      r.addColorStop(1, 'rgba(255,180,120,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, h);
    });
    // C1-R3: contact darkening — flatter, wider falloff so the dark core
    // survives past the object's footprint (R2's gradient hid its strong
    // center under the car body, leaving only a faint rim visible)
    // C1-R4: stronger blob-shadow profile — the R3 gradient still faded to
    // near-zero exactly where the car's visible margin sits (body edge at
    // u~0.7-0.9, gradient there ~0.1 alpha). Keep a dark core out to ~65%
    // radius so the deck stays visibly darkened past the body silhouette,
    // then fall off smoothly to zero at the plane edge.
    const contactTex = canvasTex(128, 128, (g, w, h) => {
      const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      r.addColorStop(0, 'rgba(0,0,0,0.95)');
      r.addColorStop(0.45, 'rgba(0,0,0,0.88)');
      r.addColorStop(0.65, 'rgba(0,0,0,0.68)');
      r.addColorStop(0.85, 'rgba(0,0,0,0.38)');
      r.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, h);
    });
    // C1-R3: baked directional cast-shadow wedge — dark at the caster's
    // base (u=0), fading along the length; soft across the width. Normal
    // blending, drawn after the additive lamp pools so the shadow reads
    // over them (the shadow-mapped key light is washed out by the pools).
    const castShadowTex = canvasTex(128, 128, (g, w, h) => {
      const along = g.createLinearGradient(0, 0, w, 0);
      along.addColorStop(0, 'rgba(0,0,0,0.62)');
      along.addColorStop(0.45, 'rgba(0,0,0,0.34)');
      along.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = along; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'destination-in';
      const across = g.createLinearGradient(0, 0, 0, h);
      across.addColorStop(0, 'rgba(0,0,0,0)');
      across.addColorStop(0.3, 'rgba(0,0,0,1)');
      across.addColorStop(0.7, 'rgba(0,0,0,1)');
      across.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = across; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'source-over';
    });
    // C1-R2: hot-pink neon panel — abstract sign face (no text; text is C2),
    // bright core washing to deep magenta at the edges
    const signTex = canvasTex(128, 80, (g, w, h) => {
      const r = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 1.6);
      r.addColorStop(0, 'rgba(255,120,190,1)');
      r.addColorStop(0.45, 'rgba(255,45,150,0.9)');
      r.addColorStop(0.8, 'rgba(200,20,110,0.55)');
      r.addColorStop(1, 'rgba(140,10,80,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,190,225,0.9)'; g.fillRect(0, h * 0.44, w, h * 0.12);
    });
    // pink halo for the sign clusters (same family as glowTex, magenta)
    const signHaloTex = canvasTex(128, 128, (g, w, h) => {
      const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      r.addColorStop(0, 'rgba(255,150,205,0.9)');
      r.addColorStop(0.4, 'rgba(255,60,160,0.42)');
      r.addColorStop(0.75, 'rgba(220,30,130,0.13)');
      r.addColorStop(1, 'rgba(200,20,120,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, h);
    });
    // C2-R2: beacon mast surface — the mast read as a flat black band in the
    // near beacon cameras (punch item 1). It still occludes the key light for
    // the C1 baked-shadow read, but now carries material response: dark
    // brushed-metal albedo with vertical variation, and a warm emissive
    // falloff from the beacon glow (strong at the base, fading up).
    const mastAlbedoTex = canvasTex(64, 256, (g, w, h) => {
      g.fillStyle = '#151b28'; g.fillRect(0, 0, w, h);
      let s = 9182;
      const srnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      for (let i = 0; i < 46; i++) {
        const x = srnd() * w, bw = 1 + srnd() * 3;
        const v = srnd();
        g.fillStyle = v < 0.5 ? `rgba(4,6,10,${0.18 + srnd() * 0.22})` : `rgba(70,84,112,${0.14 + srnd() * 0.18})`;
        g.fillRect(x, 0, bw, h);
      }
      // faint panel-segment bands so the 130 m shaft has vertical rhythm
      g.fillStyle = 'rgba(8,10,16,0.35)';
      for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 2);
      g.fillStyle = 'rgba(70,82,110,0.10)';
      for (let y = 2; y < h; y += 32) g.fillRect(0, y, w, 1);
    });
    mastAlbedoTex.wrapS = mastAlbedoTex.wrapT = THREE.RepeatWrapping;
    mastAlbedoTex.repeat.set(3, 10);
    // C2-R2: the mast's camera-facing side is backlit (key comes from ENE,
    // camera looks from SSW) so it lives in its own shadow — diffuse detail
    // can't read there. The emissive map therefore carries the surface
    // variation itself: vertical energy streaks + panel bands in warm gold,
    // bright at the base and fading up. A beacon mast should glow.
    const mastGlowTex = canvasTex(64, 256, (g, w, h) => {
      g.fillStyle = '#000000'; g.fillRect(0, 0, w, h);
      let s = 777;
      const srnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      for (let i = 0; i < 30; i++) {
        const x = srnd() * w, bw = 1 + srnd() * 4;
        const a = 0.22 + srnd() * 0.62;
        const gg = 165 + ((srnd() * 45) | 0), bb = 75 + ((srnd() * 45) | 0);
        g.fillStyle = `rgba(255,${gg},${bb},${a.toFixed(2)})`;
        g.fillRect(x, 0, bw, h);
      }
      // panel-segment gaps so the 130 m shaft keeps vertical rhythm
      g.fillStyle = 'rgba(0,0,0,0.55)';
      for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 2);
      // vertical falloff mask: bright at the base, fading up
      g.globalCompositeOperation = 'destination-in';
      const gr = g.createLinearGradient(0, h, 0, 0);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.3, 'rgba(255,255,255,0.72)');
      gr.addColorStop(0.7, 'rgba(255,255,255,0.32)');
      gr.addColorStop(1, 'rgba(255,255,255,0.10)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'source-over';
    });
    // brushed-metal roughness variation for the mast: streaks of slicker /
    // rougher metal so the key light breaks into a lively vertical sheen
    const mastRoughTex = canvasTex(64, 256, (g, w, h) => {
      g.fillStyle = 'rgb(115,115,115)'; g.fillRect(0, 0, w, h);
      let s = 5511;
      const srnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      for (let i = 0; i < 60; i++) {
        const x = srnd() * w, bw = 1 + srnd() * 4;
        const v = 70 + srnd() * 110;
        g.fillStyle = `rgba(${v | 0},${v | 0},${v | 0},0.5)`;
        g.fillRect(x, 0, bw, h);
      }
    });
    mastRoughTex.wrapS = mastRoughTex.wrapT = THREE.RepeatWrapping;
    mastRoughTex.repeat.set(3, 10);
    return {
      ground: new THREE.MeshStandardMaterial({ map: gnd.albedo, color: 0xffffff, roughness: 0.96, metalness: 0 }),
      // C2/P15: wet asphalt — roughness-variation atlas (puddle blotches +
      // polished wheel tracks), aggregate normal detail, tonal albedo.
      // Responds to the key light + lamp pools; C1 smear decals stack above.
      asphalt: new THREE.MeshStandardMaterial({
        map: asp.albedo, roughnessMap: asp.roughness, normalMap: asp.normal,
        normalScale: new THREE.Vector2(0.7, 0.7),
        color: 0xffffff, roughness: 1.0, metalness: 0.3, vertexColors: true,
      }),
      marking: new THREE.MeshBasicMaterial({ color: 0xe8efff }), // C2/P04: bolder, brighter dashes
      skirt: new THREE.MeshBasicMaterial({ color: 0x04060b }), // casing shadow under roads/sidewalks
      sidewalk: new THREE.MeshStandardMaterial({ map: slabTex, roughness: 0.95, metalness: 0, vertexColors: true }),
      // C2/P06: facade material set — albedo variation (tone shifts, grime,
      // panel lines) x per-building vertex tint; glazing slick in the
      // roughness map; frame recess + panel grooves in the normal map;
      // warm/cool lit-window grid in the emissive map (BAR C8).
      building: new THREE.MeshStandardMaterial({
        map: fac.albedo, roughnessMap: fac.roughness, normalMap: fac.normal,
        normalScale: new THREE.Vector2(0.9, 0.9),
        emissiveMap: fac.emissive, emissive: 0xffffff, emissiveIntensity: 1.3,
        color: 0xffffff, roughness: 1.0, metalness: 0.08, vertexColors: true,
      }),
      // C2/P06: rooftops — dark, slight per-building vertex variation
      roof: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0, vertexColors: true }),
      // C2/P07: muted-teal park ground + instanced foliage dots
      parkGround: new THREE.MeshStandardMaterial({ map: prk.albedo, color: 0xffffff, roughness: 0.97, metalness: 0 }),
      foliage: new THREE.PointsMaterial({
        map: prk.sprite, size: 3.1, sizeAttenuation: true, vertexColors: true,
        transparent: true, depthWrite: false, opacity: 0.96,
      }),
      lampPost: new THREE.MeshStandardMaterial({ color: 0x1c2230, roughness: 0.7, metalness: 0.6 }),
      // orb/pool/streak carry per-class instance colors; base white.
      // C1-R2: the orb is now a small warm core sphere; the visible falloff
      // comes from the lampGlow Points billboards (punch item 6).
      lampOrb: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      lampGlowTex: glowTex,
      // dark contact gradient decals (normal blending, drawn over pools)
      // C1-R4: opacity 0.7 -> 0.85 so the car contact reads on the bright deck
      contactShadow: new THREE.MeshBasicMaterial({ color: 0x000000, map: contactTex, transparent: true, opacity: 0.85, depthWrite: false }),
      // C1-R3: baked directional cast-shadow decals (normal blending,
      // drawn over the additive pools so shadows read on the road)
      castShadow: new THREE.MeshBasicMaterial({ color: 0x000000, map: castShadowTex, transparent: true, opacity: 0.6, depthWrite: false }),
      // C1-R2: pink neon practicals (Gran Via corridor wash, punch item 1)
      signPanel: new THREE.MeshBasicMaterial({ map: signTex, color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide }),
      signHaloTex: signHaloTex,
      signPool: new THREE.MeshBasicMaterial({ color: 0xffffff, map: poolTex, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.32, depthWrite: false }),
      // C1-R2: luminous teal road deck (ref-04, punch item 3)
      deckGlow: new THREE.MeshBasicMaterial({ color: 0x18d8c0, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
      deckEdge: new THREE.MeshBasicMaterial({ color: 0x2ef2d8, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }),
      // C2-R2: lit, textured mast — was a flat near-black band in the near
      // beacon cameras (punch item 1). Keeps occluding the key light (shadow
      // casting is depth-based, unaffected by color/emissive); brushed-metal
      // albedo + beacon-glow emissive falloff give it surface variation and
      // light response instead of flat black.
      mastCore: new THREE.MeshStandardMaterial({
        map: mastAlbedoTex, roughnessMap: mastRoughTex, emissiveMap: mastGlowTex,
        emissive: 0xffffff, emissiveIntensity: 0.9,
        color: 0xffffff, roughness: 1.0, metalness: 0.35,
      }),
      lampPool: new THREE.MeshBasicMaterial({ color: 0xffffff, map: poolTex, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.5, depthWrite: false }),
      lampStreak: new THREE.MeshBasicMaterial({ color: 0xffffff, map: smearTex, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.4, depthWrite: false }),
      beaconPillar: new THREE.MeshBasicMaterial({ map: beaconTex, color: 0xffc94d, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
      beaconRing: new THREE.MeshBasicMaterial({ color: 0xffc25e, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }),
      carBody: new THREE.MeshStandardMaterial({ color: 0x22304a, roughness: 0.32, metalness: 0.85 }),
      carGlass: new THREE.MeshStandardMaterial({ color: 0x0a0f18, roughness: 0.12, metalness: 0.9 }),
      carTrim: new THREE.MeshStandardMaterial({ color: 0x0c0e13, roughness: 0.6, metalness: 0.3 }),
      carTire: new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.95 }),
      carRim: new THREE.MeshStandardMaterial({ color: 0x9aa2b5, roughness: 0.35, metalness: 0.9 }),
      // C3/P10: hero car material set — clearcoat physical paint with
      // metallic-flake roughness variation and a fake neon environment map
      // (fresnel neon-rim response); dark glazing; lit brake discs.
      // NOTE: look-alt.js mutates carBody/underglow/tailLight by name —
      // keep those names stable.
      // C3-T1 (steer2 §4.1): hero paint OUT OF THE CRUSH ZONE — 0x1a2440
      // went black under the night grade at chase distance. vertexColors
      // on so car.js can paint rear-face value bands + arch cutouts into
      // the existing geometry (re-value, no new meshes).
      carBody: new THREE.MeshPhysicalMaterial({
        color: 0x46587c, metalness: 0.9, roughness: 0.38, roughnessMap: flakeTex,
        clearcoat: 1.0, clearcoatRoughness: 0.30,
        envMap: carEnvTex, envMapIntensity: 1.9,
        vertexColors: true,
      }),
      // C3-T1 (steer2 §4.2/4.3): hero rear glass to dark blue-grey, clearly
      // LIGHTER than the body, carrying neon streak reflections (the old
      // 0x060a12 read as a black hole). vertexColors on for the rear-glass
      // streak band painted in car.js.
      carGlass: new THREE.MeshPhysicalMaterial({
        color: 0x18263f, metalness: 0.9, roughness: 0.08,
        clearcoat: 1.0, clearcoatRoughness: 0.06,
        envMap: carEnvTex, envMapIntensity: 1.4,
        vertexColors: true,
      }),
      carTrim: new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.55, metalness: 0.4 }),
      // C3-S2: hero rear breakup — one vertex-colored mesh carrying the
      // groove frame around the tail blade, chrome bumper-separation strip,
      // light license plate, bright exhaust tips + dark inners, decklid side
      // shut lines. The blade sits in an articulated rear, not a slab.
      rearDetail: new THREE.MeshStandardMaterial({
        vertexColors: true, metalness: 0.85, roughness: 0.35,
        envMap: carEnvTex, envMapIntensity: 0.9,
      }),
      carTireC3: new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.9, metalness: 0.05 }),
      carRimC3: new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.32, metalness: 0.95, envMap: carEnvTex, envMapIntensity: 0.8 }),
      brakeDisc: new THREE.MeshStandardMaterial({
        color: 0x35383f, metalness: 0.9, roughness: 0.42,
        emissive: 0xff5a1a, emissiveIntensity: 0.45,
      }),
      caliper: new THREE.MeshStandardMaterial({ color: 0x8a1622, roughness: 0.45, metalness: 0.5 }),
      // whole-wheel material: vertex colors carry tire/rim/disc/caliper
      // tones; faint warm emissive so the bright disc verts read "lit"
      wheelAll: new THREE.MeshStandardMaterial({
        vertexColors: true, metalness: 0.85, roughness: 0.4,
        emissive: 0xff5a1a, emissiveIntensity: 0.18,
        envMap: carEnvTex, envMapIntensity: 0.7,
      }),
      // HDR light signatures so the bloom pass reads them as light sources
      // C3-T1 (steer2 §4.5): hero blade re-exposed — (2.6,0.22,0.32) blew
      // to clipped white. Saturated red glow reads as a light source, not
      // a white blob (max channel < 245 in the bar region).
      // C3-T1d/e: cooled to (1.25,0.11,0.16), still clipped under bloom.
      // Now non-HDR (0.85,0.06,0.10): bright saturated red, below the 0.85
      // bloom threshold — reads as a taillight glow without blooming white.
      tailLight: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.85, 0.06, 0.10) }),
      headLight: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 2.3, 2.7) }),
      headCone: new THREE.MeshBasicMaterial({ color: 0xbcd8ff, map: coneTex, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }),
      underglow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.5, 1.9), blending: THREE.AdditiveBlending, transparent: true, opacity: 0.5, depthWrite: false }),
      driftSmoke: new THREE.MeshBasicMaterial({ color: 0x8b95a8, transparent: true, opacity: 0.28, depthWrite: false }),
      // C3/P12: parked-car shells — vertex colors (body white, glass/tires
      // dark), instanceColor carries the paint tint.
      // C3-steer: same clearcoat neon-env treatment as trafficBody — parked
      // shells share the traffic night-read pass.
      parkedBody: new THREE.MeshPhysicalMaterial({
        vertexColors: true, metalness: 0.8, roughness: 0.36,
        roughnessMap: flakeTex,
        clearcoat: 1.0, clearcoatRoughness: 0.22,
        envMap: carEnvTex, envMapIntensity: 1.2,
      }),
      // C3/P11: ambient traffic — bodies lit (vertex colors x instanceColor),
      // light quads unlit with HDR baked into vertex colors.
      // C3-steer (ESCALATE rung 1): clearcoat physical paint so every
      // traffic variant carries streaky neon-env reflections from the
      // pink/cyan practicals the way the hero car already does — the R2/R3
      // geometry goes black under the night grade without it.
      trafficBody: new THREE.MeshPhysicalMaterial({
        vertexColors: true, metalness: 0.85, roughness: 0.32,
        roughnessMap: flakeTex,
        clearcoat: 1.0, clearcoatRoughness: 0.25,
        envMap: carEnvTex, envMapIntensity: 1.7,
      }),
      // C3-R2: glasshouse band — its own reflective material (NO
      // instanceColor) so the cabin reads as neon-streaked glass at night
      // instead of crushing to black under the paint multiply.
      // C3-steer: stronger neon-env response so the glasshouse carries
      // visible pink/cyan reflections (replaces the matte-black read).
      // C3-T1 (steer2 §4.2/4.3): to dark blue-grey, clearly LIGHTER than
      // the body; vertexColors on so traffic.js paints pillar breaks and
      // a lighter rear-glass band into the existing glass geometry.
      trafficGlass: new THREE.MeshPhysicalMaterial({
        color: 0x22334f, metalness: 0.9, roughness: 0.1,
        clearcoat: 1.0, clearcoatRoughness: 0.08,
        envMap: carEnvTex, envMapIntensity: 2.4,
        emissive: 0x0c1626, emissiveIntensity: 0.8,
        vertexColors: true,
      }),
      // C3-R2: wheels — vertex colors only (tire dark, rim lighter, dark
      // hub), no instanceColor, so wheels survive the night grade.
      // C3-T1 (steer2 §4.4): SUBTRACTIVE fix — the uniform warm emissive
      // manufactured the "flat pink disc" read. Emissive killed; the tire
      // goes near-black and only a thin red trim ring + bright hub dot
      // (rim specular) stay in the vertex colors painted in traffic.js.
      trafficWheel: new THREE.MeshStandardMaterial({
        vertexColors: true, metalness: 0.75, roughness: 0.42,
        envMap: carEnvTex, envMapIntensity: 1.0,
        emissive: 0x000000, emissiveIntensity: 0.0,
      }),
      trafficLight: new THREE.MeshBasicMaterial({ vertexColors: true }),
      trafficCone: new THREE.MeshBasicMaterial({ color: 0xffe2ae, map: coneTex, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
      // C3-S2: two-tone roof — fixed light-silver physical paint (NO
      // instanceColor) so every traffic/parked car carries a light roof band
      // over the dark body (steer §4.5: the two-tone scheme that already
      // reads). The roof panel geometry moved here from the body bucket.
      trafficRoof: new THREE.MeshPhysicalMaterial({
        color: 0xb9bec7, metalness: 0.65, roughness: 0.34,
        clearcoat: 1.0, clearcoatRoughness: 0.2,
        envMap: carEnvTex, envMapIntensity: 1.2,
      }),
      // C3-S2: vertical neon sign columns (steer §4.6, ref-04 density
      // carrier) — HDR instance colors (gold/cyan), unlit so they read as
      // neon tubes on the near faces; bloom does the glow work. No
      // vertexColors (the box has no color attribute); the HDR instanceColor
      // path carries the tone, like the lamp streaks.
      signColumn: new THREE.MeshBasicMaterial(),
      // C3: street furniture — bollards (dark post + amber band) and
      // planters (dark box + foliage), single instanced mesh each.
      bollard: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.5, roughness: 0.55 }),
      planter: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.1, roughness: 0.9 }),
      // C3/P09: neon text billboards — original words, one material per word
      // (each drives one InstancedMesh in city.js).
      signText: [
        ['NOCHE', '#37f2ff'], ['CINE', '#ff4df3'],
        ['BAR', '#ffc94d'], ['MADRID', '#ff6aa8'],
      ].map(([word, color]) => new THREE.MeshBasicMaterial({
        map: neonTextTex(word, color), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })),
    };
  },

  post() {
    return {
      exposure: 1.05,
      bloom: { strength: 0.45, radius: 0.5, threshold: 0.85 },
      grade: {
        // deep-navy lift so shadows never crush to pure black (ref-02/03)
        shadowLift: [0.014, 0.022, 0.05],
        // warm bias toward gold on highlights (ref-01/04 neon-noir)
        highlightWarm: 0.07,
        vignette: 0.32,
        grain: 0.035,
      },
    };
  },
};
