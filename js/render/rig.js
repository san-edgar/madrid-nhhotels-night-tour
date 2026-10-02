// rig.js — the renderer. Owns: three scene, lights (from the look module),
// sky, fog, shadow-follow, post chain. Gameplay never touches these; the only
// input from gameplay is car pose + sim state each frame.
// RENDERER CONTRACT: newRig(lookModule) -> { scene, camera, mats, api, render(dt), setCarPose(...) }
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CFG } from '../config.js';

// C1-R3: key-light ground offset, shared with the baked shadow decals.
// followCar() keeps this offset relative to the car, so every cast shadow
// in the scene falls along the same ground direction.
export const KEY_GROUND = { x: 65, z: 40 };
export const SHADOW_DIR = (() => {
  const l = Math.hypot(KEY_GROUND.x, KEY_GROUND.z);
  return { x: -KEY_GROUND.x / l, z: -KEY_GROUND.z / l };
})();
// yaw that aligns a flat quad's +X axis with SHADOW_DIR
export const SHADOW_PHI = Math.atan2(-SHADOW_DIR.z, SHADOW_DIR.x);

// Neon-noir grade, applied in linear HDR between bloom and the output
// (tonemap) pass: navy shadow lift, warm highlight bias, animated film
// grain, vignette.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uShadowLift: { value: new THREE.Vector3(0.014, 0.022, 0.05) },
    uWarm: { value: 0.07 },
    uVig: { value: 0.32 },
    uGrain: { value: 0.035 },
    uTime: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; varying vec2 vUv;
    uniform vec3 uShadowLift; uniform float uWarm; uniform float uVig;
    uniform float uGrain; uniform float uTime;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime * 61.7) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      vec3 lifted = c.rgb + uShadowLift * (1.0 - smoothstep(0.0, 0.35, l));
      vec3 warm = lifted * vec3(1.0 + uWarm, 1.0 + uWarm * 0.35, 1.0 - uWarm * 0.4);
      vec3 g = mix(warm, lifted, smoothstep(0.9, 0.45, l));
      g += (hash(vUv * vec2(1920.0, 1080.0)) - 0.5) * uGrain;
      vec2 d = vUv - 0.5;
      g *= 1.0 - uVig * smoothstep(0.35, 0.85, length(d) * 1.4142);
      gl_FragColor = vec4(g, c.a);
    }`,
};

function canvasRadial(size, stops) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) r.addColorStop(o, col);
  g.fillStyle = r; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeSky(top, horizon, starCount) {
  const geo = new THREE.SphereGeometry(4000, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, horizon: { value: new THREE.Color(horizon) } },
    vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    // C1-R2: luminous storm banding — indigo/violet cloud mass with
    // magenta-pink illuminated bands low on the dome (ref-03); the bands
    // are brightest just above the horizon and dissolve toward the zenith
    fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 horizon;
      void main(){
        vec3 d = normalize(vP);
        float h = d.y * 0.5 + 0.5;
        vec3 c = mix(horizon, top, smoothstep(0.45, 1.0, h));
        c = mix(vec3(0.015,0.02,0.035), c, smoothstep(0.42, 0.5, h));
        float ang = atan(d.z, d.x);
        float nse = sin(ang * 3.0 + sin(d.y * 14.0) * 1.7)
                  * sin(d.y * 23.0 + sin(ang * 5.0) * 2.1);
        float bands = smoothstep(0.05, 0.95, nse * 0.5 + 0.5);
        float bandZone = smoothstep(0.015, 0.16, d.y) * (1.0 - smoothstep(0.42, 0.72, d.y));
        vec3 bandCol = mix(vec3(0.10, 0.07, 0.24), vec3(0.52, 0.15, 0.40), bands);
        c = mix(c, bandCol * (0.45 + 0.55 * bands), bandZone * 0.85);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.frustumCulled = false;
  const group = new THREE.Group();
  group.add(sky);
  // stars: cheap points in the upper dome
  const n = starCount, pos = new Float32Array(n * 3);
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < n; i++) {
    const th = rnd() * Math.PI * 2, ph = rnd() * Math.PI * 0.42 + 0.08;
    const r = 3800;
    pos[i * 3] = r * Math.cos(th) * Math.cos(ph);
    pos[i * 3 + 1] = r * Math.sin(ph);
    pos[i * 3 + 2] = r * Math.sin(th) * Math.cos(ph);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xbfd0ff, size: 1.8, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.38 }));
  stars.frustumCulled = false;
  group.add(stars);
  // moon disc + haze halo, procedural canvas sprites, fixed local direction
  // (east-northeast, high — matches the key light); fog-exempt
  const moonDisc = new THREE.Sprite(new THREE.SpriteMaterial({
    map: canvasRadial(128, [[0, 'rgba(224,236,255,1)'], [0.42, 'rgba(210,226,255,1)'], [0.5, 'rgba(180,200,240,0.9)'], [0.56, 'rgba(140,170,230,0)']]),
    transparent: true, fog: false, depthWrite: false }));
  moonDisc.position.set(1500, 2100, -700);
  moonDisc.scale.set(220, 220, 1);
  const moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: canvasRadial(128, [[0, 'rgba(150,180,240,0.5)'], [0.6, 'rgba(120,150,220,0.18)'], [1, 'rgba(100,130,210,0)']]),
    transparent: true, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  moonHalo.position.set(1500, 2100, -700);
  moonHalo.scale.set(640, 640, 1);
  group.add(moonDisc, moonHalo);
  return group;
}

export function newRig(look) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const postCfg = look.post();
  renderer.toneMappingExposure = postCfg.exposure;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(look.fog.color, look.fog.density);
  scene.background = new THREE.Color(look.fog.color);

  const camera = new THREE.PerspectiveCamera(CFG.camera.fov, window.innerWidth / window.innerHeight, 0.5, 9000);

  const api = {};
  const sky = makeSky(look.sky.top, look.sky.horizon, look.sky.stars);
  scene.add(sky);
  const lights = look.lights(scene, api);
  const mats = look.materials();

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    postCfg.bloom.strength, postCfg.bloom.radius, postCfg.bloom.threshold);
  composer.addPass(bloom);
  // grade + grain + vignette in linear HDR, before the tonemap/output pass
  const gradePass = new ShaderPass(GradeShader);
  const gc = postCfg.grade || {};
  gradePass.uniforms.uShadowLift.value.set(...(gc.shadowLift || [0.014, 0.022, 0.05]));
  gradePass.uniforms.uWarm.value = gc.highlightWarm ?? 0.07;
  gradePass.uniforms.uVig.value = gc.vignette ?? 0.32;
  gradePass.uniforms.uGrain.value = gc.grain ?? 0.035;
  composer.addPass(gradePass);
  composer.addPass(new OutputPass());

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  });

  // shadow rig follows the car
  const keyTarget = new THREE.Vector3();
  function followCar(x, z) {
    sky.position.set(x, 0, z);
    if (api.keyLight) {
      // C1-R2: lower elevation (~37 deg) so poles, the beacon mast and the
      // car throw long readable soft shadows across the road (punch item 4);
      // C1-R3: offset shared via KEY_GROUND so baked decals match it
      api.keyLight.position.set(x + KEY_GROUND.x, 70, z + KEY_GROUND.z);
      keyTarget.set(x, 0, z);
      api.keyLight.target.position.copy(keyTarget);
    }
  }

  let elapsed = 0;
  function render(dt) {
    elapsed += dt;
    gradePass.uniforms.uTime.value = elapsed;
    composer.render();
  }

  return { renderer, scene, camera, mats, api, lights, followCar, render, lookName: look.name, composer };
}
