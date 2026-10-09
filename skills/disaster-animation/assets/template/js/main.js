'use strict';
// =====================================================================
// MAIN — renderer, fixed-step deterministic loop, seeking, shot mode.
//   ?shot=41   render one frame at 41 s, then set title to SHOT_READY
//   ?t=30      start playback at 30 s
//   ?cam=x,y,z&look=x,y,z&fov=50   override the camera for inspection
//   ?clean     hide the progress bar for recording
// =====================================================================

const Q = new URLSearchParams(location.search);
const SHOT = Q.has('shot') ? parseFloat(Q.get('shot')) : null;
const START = parseFloat(Q.get('t') || '0');
const DURATION = 61;
const DT = 1 / 60;

const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, powerPreference: 'high-performance',
  preserveDrawingBuffer: SHOT != null,       // without this the screenshot can come back blank
});
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x777777, 0.0008);
const camera = new THREE.PerspectiveCamera(50, 9 / 16, 0.3, 12000);

// Minimal gradient sky so the scaffold looks like a place, not a void. Replace with a
// directional storm sky (dark toward the event, bright clear slot behind) per
// references/sky-and-fx.md — it is the biggest single lever on believability.
const sky = new THREE.Mesh(new THREE.SphereGeometry(5200, 32, 16), new THREE.ShaderMaterial({
  uniforms: { uDark: { value: 0 }, uFog: { value: new THREE.Color(0x777777) } },
  side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: `varying vec3 vD; void main(){ vD = normalize(position);
    vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }`,
  fragmentShader: `uniform float uDark; uniform vec3 uFog; varying vec3 vD;
    void main(){ float el = normalize(vD).y;
      vec3 hi = mix(vec3(0.42,0.56,0.72), vec3(0.13,0.14,0.16), uDark);
      vec3 lo = mix(vec3(0.78,0.80,0.80), vec3(0.26,0.27,0.28), uDark);
      vec3 c = mix(lo, hi, smoothstep(0.0, 0.45, el));
      c = mix(c, uFog, 1.0 - smoothstep(0.0, 0.10, el));     // haze the horizon into the fog
      gl_FragColor = vec4(c, 1.0); }`,
}));
sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);

const hemi = new THREE.HemisphereLight(0xa8b4bc, 0x4a4436, 1.1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0dd, 1.2);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 10; sc.far = 600;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
scene.add(sun); scene.add(sun.target);

buildWorld(scene);
updateField(0);

const el = {
  hook: document.getElementById('hook'), counters: document.getElementById('counters'),
  caption: document.getElementById('caption'), dist: document.getElementById('cDist'),
  distBox: document.getElementById('distBox'), main: document.getElementById('cMain'),
  lost: document.getElementById('cLost'), end: document.getElementById('endcard'),
  start: document.getElementById('start'), bar: document.querySelector('#timebar i'),
};

const EVENTS = [];
let simT = 0, acc = 0, playing = false;

function stepSim() {
  updateField(simT);
  stepWorld(DT, simT);
  simT += DT;
}
// Fast-forward with rendering skipped. Because the sim is deterministic and fixed-step,
// the frame this lands on is exactly what playback shows at that time.
function fastForward(T) {
  while (simT < T - 1e-6) { stepSim(); EVENTS.length = 0; }
}

function resize() {
  const r = document.getElementById('stage').getBoundingClientRect();
  // Supersample: on a 1x display devicePixelRatio is 1 and nothing is antialiased beyond
  // MSAA. Rendering above CSS size and letting the browser downsample is what makes
  // thin geometry and text edges crisp.
  const pr = Math.min(Math.max(window.devicePixelRatio || 1, 1.75), 2160 / Math.max(1, r.height), 2.5);
  renderer.setPixelRatio(pr);
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height;
}
window.addEventListener('resize', resize); resize();

const grain = document.getElementById('grain'), gctx = grain.getContext('2d');
grain.width = 360; grain.height = 640;
const gimg = gctx.createImageData(360, 640);
function drawGrain() {
  const d = gimg.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * 150;     // low contrast; high contrast reads as blur
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  gctx.putImageData(gimg, 0, 0);
}

function render(dtFrame) {
  updateField(simT);
  updateCamera(simT, camera);
  if (Q.has('cam')) {
    const c = Q.get('cam').split(',').map(Number), l = (Q.get('look') || '0,50,0').split(',').map(Number);
    camera.position.set(c[0], c[1], c[2]);
    camera.lookAt(l[0], l[1], l[2]);
    camera.fov = +(Q.get('fov') || 50); camera.updateProjectionMatrix();
    camera.userData.target = new THREE.Vector3(l[0], 0, l[2]);
  }
  const tgt = camera.userData.target || new THREE.Vector3();
  sun.target.position.set(tgt.x, 0, tgt.z);
  sun.position.set(tgt.x - 160, 260, tgt.z - 120);
  sky.position.copy(camera.position);
  sky.material.uniforms.uDark.value = FIELD.dark;
  sky.material.uniforms.uFog.value.copy(scene.fog.color);
  hemi.intensity = lerp(1.15, 0.55, FIELD.dark);
  sun.intensity = lerp(1.3, 0.28, FIELD.dark);
  scene.fog.density = lerp(0.0006, 0.00095, FIELD.dark);

  writeWorld(simT);
  updateHUD(simT, el);
  EVENTS.length = 0;
  renderer.render(scene, camera);
  el.bar.style.width = (simT / DURATION * 100).toFixed(2) + '%';
}

let last = performance.now(), frameN = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (playing) {
    acc += dt; let n = 0;
    while (acc >= DT && n < 4) { stepSim(); acc -= DT; n++; }
    if (n === 4) acc = 0;               // drop time rather than spiral on a slow frame
    if (simT >= DURATION) {
      playing = false; el.start.classList.remove('gone');
      document.getElementById('playBtn').textContent = '↻  Replay';
    }
  }
  render(playing ? dt : 0);
  if ((frameN++ & 1) === 0) drawGrain();
  requestAnimationFrame(loop);
}

function restartAt(t, autoplay) {
  const q = new URLSearchParams(location.search);
  q.set('t', t.toFixed(2)); autoplay ? q.set('play', '1') : q.delete('play');
  location.search = q.toString();
}
document.getElementById('playBtn').addEventListener('click', () => {
  if (simT >= DURATION) { restartAt(0, true); return; }
  if (typeof initAudio === 'function') initAudio();
  playing = true; el.start.classList.add('gone');
});
window.addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); playing = !playing; el.start.classList.toggle('gone', playing); }
  if (e.code === 'KeyR') restartAt(0, true);
  if (e.code === 'ArrowRight') fastForward(Math.min(DURATION - 0.1, simT + 5));
  if (e.code === 'ArrowLeft') restartAt(Math.max(0, simT - 5), playing);
  if (e.code === 'KeyH') document.body.classList.toggle('hidehud');
});
if (Q.has('clean')) document.getElementById('timebar').style.display = 'none';

// Diagnostics for the headless harness.
window.simStats = () => ({ destroyed: WORLD.destroyed, total: WORLD.total });

// ---------- offline frame export ----------
// The sim is deterministic and fixed-step, so we can advance it exactly one output frame at
// a time with no wall clock involved: nothing is dropped and nothing stutters. Page
// screenshots also capture the HTML HUD, which a canvas MediaRecorder stream cannot.
// At 60 fps each output frame is exactly one 1/60 s sim step — a clean 1:1 mapping.
if (Q.has('render')) {
  const FPS = +(Q.get('fps') || 60);
  el.start.classList.add('gone');
  document.getElementById('timebar').style.display = 'none';
  window.exportInfo = { fps: FPS, frames: Math.round(DURATION * FPS), duration: DURATION };
  window.renderFrameAt = n => {
    const target = n / FPS;
    while (simT < target - 1e-6) { stepSim(); EVENTS.length = 0; }
    render(1 / FPS);
    drawGrain();
    return simT;
  };
  render(0); drawGrain();
  document.title = 'RENDER_READY';
} else if (SHOT != null) {
  el.start.classList.add('gone');
  fastForward(SHOT);
  render(DT);
  drawGrain();
  document.title = 'SHOT_READY';
} else {
  if (START > 0) fastForward(START);
  requestAnimationFrame(loop);
}
