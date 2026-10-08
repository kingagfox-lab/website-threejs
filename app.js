import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ------------------------------------------------------------------ */
/*  Palette (matches the livery baked into the model's textures)       */
/* ------------------------------------------------------------------ */
const C = {
  light: 0x81c4ff,
  blue: 0x1c69d4,
  dark: 0x0653b6,
  red: 0xe7222e,
};

const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.82;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);

/* Reflections: studio environment (gives the clearcoat paint something to mirror) */
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envTex;
scene.environmentIntensity = 0.32;

/* ------------------------------------------------------------------ */
/*  Lights: white key + livery-coloured rims                           */
/* ------------------------------------------------------------------ */
const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x0a0f18, 0.18);
scene.add(hemi);

const key = new THREE.SpotLight(0xffffff, 42, 18, Math.PI / 5, 0.7, 1.6);
key.position.set(2.2, 4.6, 2.4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0002;
key.shadow.normalBias = 0.02;
key.shadow.radius = 6;
key.shadow.blurSamples = 20;
scene.add(key, key.target);

const rimBlue = new THREE.SpotLight(C.light, 38, 14, Math.PI / 4, 0.8, 1.5);
rimBlue.position.set(-3.2, 1.8, -2.6);
scene.add(rimBlue, rimBlue.target);

const rimRed = new THREE.SpotLight(C.red, 28, 14, Math.PI / 4, 0.8, 1.5);
rimRed.position.set(3.4, 1.3, -2.8);
scene.add(rimRed, rimRed.target);

const fill = new THREE.DirectionalLight(0xdfeaff, 0.22);
fill.position.set(-3, 2, 3);
scene.add(fill);

/* ------------------------------------------------------------------ */
/*  Floor: glossy plinth, tricolour ring, soft contact shadow          */
/* ------------------------------------------------------------------ */
const stageGroup = new THREE.Group();
scene.add(stageGroup);

function makeFloorTexture() {
  const s = 1024;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, '#16233a');
  grd.addColorStop(0.55, '#0b1220');
  grd.addColorStop(1, '#05080e');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);

  // fine concentric grid lines (showroom turntable)
  g.strokeStyle = 'rgba(129,196,255,0.10)';
  g.lineWidth = 1;
  for (let r = 60; r < s / 2; r += 48) {
    g.beginPath();
    g.arc(s / 2, s / 2, r, 0, Math.PI * 2);
    g.stroke();
  }
  // radial ticks
  g.strokeStyle = 'rgba(129,196,255,0.08)';
  for (let a = 0; a < 360; a += 7.5) {
    const r1 = s * 0.455, r2 = s * 0.47, rad = (a * Math.PI) / 180;
    g.beginPath();
    g.moveTo(s / 2 + Math.cos(rad) * r1, s / 2 + Math.sin(rad) * r1);
    g.lineTo(s / 2 + Math.cos(rad) * r2, s / 2 + Math.sin(rad) * r2);
    g.stroke();
  }
  // tricolour edge rings (light blue / dark blue / red)
  const ring = (r, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(s / 2, s / 2, r, 0, Math.PI * 2); g.stroke(); };
  ring(s * 0.488, 3, '#81c4ff');
  ring(s * 0.478, 3, '#0653b6');
  ring(s * 0.468, 3, '#e7222e');
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const floorMat = new THREE.MeshPhysicalMaterial({
  map: makeFloorTexture(),
  color: 0x5a687e,
  roughness: 0.75,
  metalness: 0.1,
  clearcoat: 0.25,
  clearcoatRoughness: 0.55,
  envMapIntensity: 0.2,
  transparent: true,
});
const FLOOR_R = 3.6;
const floor = new THREE.Mesh(new THREE.CircleGeometry(FLOOR_R, 128), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
stageGroup.add(floor);

// fade the plinth out at the edges so it melts into the background
const fadeTex = (() => {
  const s = 512, cv = document.createElement('canvas'); cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, '#fff'); grd.addColorStop(0.8, '#fff'); grd.addColorStop(1, '#000');
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(cv);
})();
floorMat.alphaMap = fadeTex;

// soft blob under the bike (ambient occlusion feel)
const blobTex = (() => {
  const s = 256, cv = document.createElement('canvas'); cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(0,0,0,0.85)'); grd.addColorStop(0.5, 'rgba(0,0,0,0.4)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(cv); return t;
})();
const blob = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.95 })
);
blob.rotation.x = -Math.PI / 2;
blob.position.y = 0.004;
stageGroup.add(blob);

// glowing ground ring light that follows the livery colours
const glowRing = new THREE.Mesh(
  new THREE.RingGeometry(FLOOR_R * 0.955, FLOOR_R * 0.965, 128),
  new THREE.MeshBasicMaterial({ color: C.light, transparent: true, opacity: 0.55, side: THREE.DoubleSide, toneMapped: false })
);
glowRing.rotation.x = -Math.PI / 2;
glowRing.position.y = 0.006;
stageGroup.add(glowRing);

/* ------------------------------------------------------------------ */
/*  Controls                                                           */
/* ------------------------------------------------------------------ */
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 1.2;
controls.maxDistance = 7;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minPolarAngle = 0.15;
controls.enablePan = false;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.9;

/* ------------------------------------------------------------------ */
/*  Load the bike                                                      */
/* ------------------------------------------------------------------ */
const loaderEl = document.getElementById('loader');
const fillEl = document.getElementById('loader-fill');
const pctEl = document.getElementById('loader-pct');

const gltfLoader = new GLTFLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

const bike = new THREE.Group();   // normalised: length along +X (front = +X), centred on origin, wheels on y=0
scene.add(bike);
let bikeSize = new THREE.Vector3(2, 1, 0.7);
let ready = false;
const hotspots = [];

gltfLoader.load(
  './assets/bmw-s1000rr.glb',
  (gltf) => {
    const model = gltf.scene;

    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (!m) return;
        if (m.map) { m.map.anisotropy = 8; }
        if (m.envMapIntensity !== undefined) m.envMapIntensity = 1.0;
        // The source file exports every material as BLEND – that makes sorting glitchy.
        // Keep real transparency only for glass / lights, otherwise render opaque.
        const n = (m.name || '').toLowerCase();
        const isGlass = n.includes('glass') || n.includes('light') || n.includes('lights');
        if (!isGlass && m.transparent && m.alphaTest === 0) {
          m.transparent = false;
          m.depthWrite = true;
        }
        if (isGlass) { m.depthWrite = false; o.castShadow = false; }

        // The source textures are game-style masks (white / light-grey bases meant to be tinted),
        // so give those parts their real-world colours to match the livery.
        if (n === 'tire') {            // dark rubber, tread + lettering stay readable
          m.color.setScalar(0.13); m.roughness = 0.92; m.metalness = 0;
        } else if (n === 'rim') {      // forged wheel in graphite
          m.color.set(0x15181d); m.metalness = 0.85; m.roughness = 0.32;
        } else if (n === 'hand') {     // levers / clip-ons
          m.color.setScalar(0.5);
        } else if (n === 'ex_1') {     // titanium silencer
          m.color.setScalar(0.78);
        } else if (n === 'disk') {     // brake discs
          m.metalness = 0.9; m.roughness = 0.35;
        }
        m.needsUpdate = true;
      });
    });

    bike.add(model);
    normaliseBike(model);
    buildHotspots();
    ready = true;
    window.__ready = true;
    applyView('hero', true);

    fillEl.style.width = '100%';
    pctEl.textContent = '100';
    setTimeout(() => loaderEl.classList.add('done'), 350);
  },
  (e) => {
    if (e.total) {
      const p = Math.min(99, Math.round((e.loaded / e.total) * 100));
      fillEl.style.width = p + '%';
      pctEl.textContent = p;
    }
  },
  (err) => {
    console.error(err);
    document.querySelector('.loader-pct').textContent = 'Could not load the model — serve this folder over http(s).';
  }
);

function normaliseBike(model) {
  model.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(model);
  let size = box.getSize(new THREE.Vector3());

  // make the longest horizontal axis run along X
  if (size.z > size.x) {
    bike.rotation.y = Math.PI / 2;
    bike.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(bike);
    size = box.getSize(new THREE.Vector3());
  }

  // find the front: headlight mesh should sit towards the front
  let headX = null, tailX = null;
  const tmp = new THREE.Box3(), cen = new THREE.Vector3();
  model.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const names = mats.map((m) => (m && m.name ? m.name.toLowerCase() : ''));
    if (names.some((n) => n === 'lights_f')) { tmp.setFromObject(o).getCenter(cen); headX = cen.x; }
    if (names.some((n) => n === 'light_t')) { tmp.setFromObject(o).getCenter(cen); tailX = cen.x; }
  });
  const mid = (box.min.x + box.max.x) / 2;
  let frontPositive = true;
  if (headX !== null && tailX !== null) frontPositive = headX > tailX;
  else if (headX !== null) frontPositive = headX > mid;
  if (!frontPositive) bike.rotation.y += Math.PI;

  bike.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(bike);
  size = box.getSize(new THREE.Vector3());

  // scale to ~2.05 m long (real S 1000 RR is 2.07 m)
  const s = 2.05 / size.x;
  bike.scale.setScalar(s);
  bike.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(bike);
  const c = box.getCenter(new THREE.Vector3());
  bike.position.x -= c.x;
  bike.position.z -= c.z;
  bike.position.y -= box.min.y;
  bike.updateMatrixWorld(true);

  box = new THREE.Box3().setFromObject(bike);
  bikeSize = box.getSize(new THREE.Vector3());

  blob.scale.set(bikeSize.x * 1.25, bikeSize.z * 3.4, 1);
  // plane is rotated, so swap: width along X, depth along Z
  blob.scale.set(bikeSize.x * 1.3, bikeSize.z * 3.2, 1);
  key.target.position.set(0, bikeSize.y * 0.4, 0);
  rimBlue.target.position.set(0, bikeSize.y * 0.45, 0);
  rimRed.target.position.set(0, bikeSize.y * 0.45, 0);
}

/* ------------------------------------------------------------------ */
/*  Camera views                                                       */
/* ------------------------------------------------------------------ */
function viewDefs() {
  const L = bikeSize.x, H = bikeSize.y, W = bikeSize.z;
  return {
    hero:    { pos: [L * 0.95, H * 0.85, L * 1.35],  look: [L * 0.0, H * 0.42, 0], fov: 32 },
    side:    { pos: [0, H * 0.55, L * 2.0],          look: [0, H * 0.45, 0],        fov: 30 },
    front:   { pos: [L * 1.8, H * 0.7, L * 0.14],    look: [0, H * 0.5, 0],          fov: 30 },
    rear:    { pos: [-L * 1.7, H * 0.85, -L * 0.4],  look: [-L * 0.05, H * 0.5, 0],  fov: 32 },
    top:     { pos: [L * 0.05, H * 3.4, L * 0.55],   look: [0, 0, 0],                fov: 30 },
    cockpit: { pos: [L * 0.0, H * 1.35, L * 0.46],   look: [L * 0.2, H * 0.82, 0],   fov: 34 },
  };
}

let tween = null;
let currentView = 'hero';

function flyTo(pos, look, fov = 32, dur = 1.6) {
  const p0 = camera.position.clone();
  const t0 = controls.target.clone();
  const f0 = camera.fov;
  const p1 = new THREE.Vector3(...pos);
  const t1 = new THREE.Vector3(...look);
  tween = { t: 0, dur, p0, t0, f0, p1, t1, f1: fov };
}

function applyView(name, instant = false) {
  const v = viewDefs()[name];
  if (!v) return;
  currentView = name;
  document.querySelectorAll('.view').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  if (instant) {
    camera.position.set(...v.pos);
    controls.target.set(...v.look);
    camera.fov = v.fov;
    camera.updateProjectionMatrix();
    controls.update();
  } else {
    flyTo(v.pos, v.look, v.fov);
  }
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* ------------------------------------------------------------------ */
/*  Hotspots                                                           */
/* ------------------------------------------------------------------ */
// positions are fractions of the normalised bounding box:  u = rear→front, v = ground→top, w = centre→right side
const SPOTS = [
  { id: 'head', n: '01', label: 'Headlight', u: 0.9, v: 0.68, w: 0.0, kicker: 'Lighting',
    text: 'Asymmetric twin-headlight face with full-LED illumination. The aggressive mask is a direct nod to the Motorsport race bike.',
    cam: { off: [0.85, 0.15, 0.55], look: [0.9, 0.66, 0] } },
  { id: 'cockpit', n: '02', label: 'Cockpit', u: 0.77, v: 0.78, w: 0.0, kicker: 'Rider interface',
    text: 'Compact race-style dash with a clear rev display, clip-on bars and the switchgear for the riding modes and traction control.',
    cam: { off: [-0.25, 0.45, 0.7], look: [0.78, 0.72, 0] } },
  { id: 'engine', n: '03', label: 'Inline-4 engine', u: 0.52, v: 0.34, w: 0.18, kicker: 'Powertrain',
    text: '999 cc water-cooled inline-four with ShiftCam variable valve timing, delivering a claimed 207 hp and a very wide, usable torque curve.',
    cam: { off: [0.05, 0.1, 0.85], look: [0.52, 0.34, 0] } },
  { id: 'exhaust', n: '04', label: 'Titanium exhaust', u: 0.24, v: 0.3, w: 0.2, kicker: 'Exhaust',
    text: 'Slim titanium silencer finished in carbon-look trim. It keeps the rear end light and helps centralise mass.',
    cam: { off: [-0.45, 0.05, 0.75], look: [0.24, 0.3, 0] } },
  { id: 'brake', n: '05', label: 'Front brakes', u: 0.86, v: 0.2, w: 0.14, kicker: 'Braking',
    text: 'Twin floating discs with radial four-piston calipers and cornering ABS Pro. Stopping power to match the speed.',
    cam: { off: [0.45, -0.05, 0.75], look: [0.86, 0.2, 0] } },
  { id: 'tail', n: '06', label: 'Tail unit', u: 0.06, v: 0.62, w: 0.0, kicker: 'Aerodynamics',
    text: 'Short, sharp tail section with an integrated LED light — a clean finish that keeps the bike’s silhouette compact and light.',
    cam: { off: [-0.7, 0.2, 0.65], look: [0.06, 0.58, 0] } },
];

const hsLayer = document.getElementById('hotspots');
const infoEl = document.getElementById('info');
const infoKicker = document.getElementById('info-kicker');
const infoTitle = document.getElementById('info-title');
const infoText = document.getElementById('info-text');
const listEl = document.getElementById('detail-list');

function spotWorld(s) {
  const L = bikeSize.x, H = bikeSize.y, W = bikeSize.z;
  return new THREE.Vector3((s.u - 0.5) * L, s.v * H, s.w * W);
}

function buildHotspots() {
  SPOTS.forEach((s) => {
    const el = document.createElement('button');
    el.className = 'hs';
    el.innerHTML = `<span class="ring"></span><span class="dot"></span><span class="lbl">${s.label}</span>`;
    el.addEventListener('click', () => openSpot(s));
    hsLayer.appendChild(el);
    hotspots.push({ s, el, pos: spotWorld(s) });

    const li = document.createElement('li');
    li.innerHTML = `<button><span class="n">${s.n}</span><span class="t">${s.label}</span><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>`;
    li.firstChild.addEventListener('click', () => openSpot(s));
    listEl.appendChild(li);
  });
}

function openSpot(s) {
  const L = bikeSize.x, H = bikeSize.y, W = bikeSize.z;
  const look = [(s.cam.look[0] - 0.5) * L, s.cam.look[1] * H, s.cam.look[2] * W];
  // camera sits on the side of the bike where the part is visible
  const sideSign = 1;
  const pos = [look[0] + s.cam.off[0] * L * 0.9, look[1] + s.cam.off[1] * H, sideSign * (Math.abs(s.cam.off[2]) * L * 0.9)];
  flyTo(pos, look, 28, 1.5);
  controls.autoRotate = false;
  syncRotateBtn();
  document.querySelectorAll('.view').forEach((b) => b.classList.remove('active'));
  hotspots.forEach((h) => h.el.classList.toggle('on', h.s === s));
  document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  shiftGoal = 0.06;
  infoKicker.textContent = `${s.n} · ${s.kicker}`;
  infoTitle.textContent = s.label;
  infoText.textContent = s.text;
  infoEl.classList.add('show');
}
function closeInfo() {
  infoEl.classList.remove('show');
  hotspots.forEach((h) => h.el.classList.remove('on'));
}
document.getElementById('info-close').addEventListener('click', closeInfo);

const _v = new THREE.Vector3();
function updateHotspots() {
  const w = window.innerWidth, h = window.innerHeight;
  const camDir = camera.position;
  hotspots.forEach((hs) => {
    const world = hs.pos.clone();
    bike.localToWorld; // (bike is rotated only by the normalisation; hotspot coords are already in world space of the stage)
    _v.copy(world).project(camera);
    // hide when behind the camera or when the part is on the far side of the bike
    const behind = _v.z > 1;
    // far-side test: part lies on +w (camera's near side) when camera.z > 0
    const farSide = hs.s.w !== 0 && Math.sign(hs.s.w) !== Math.sign(camera.position.z || 1) && Math.abs(camera.position.z) > 0.25;
    const hidden = behind || farSide;
    hs.el.classList.toggle('hidden', hidden);
    if (!hidden) {
      const x = (_v.x * 0.5 + 0.5) * w;
      const y = (-_v.y * 0.5 + 0.5) * h;
      hs.el.style.transform = `translate(${x}px,${y}px)`;
      hs.el.classList.toggle('flip', x > w - 230);
    }
  });
}

/* ------------------------------------------------------------------ */
/*  UI wiring                                                          */
/* ------------------------------------------------------------------ */
document.querySelectorAll('[data-view]').forEach((b) => {
  b.addEventListener('click', () => {
    closeInfo();
    applyView(b.dataset.view);
    if (b.classList.contains('cta')) setPanel('specs');
  });
});

function setPanel(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.panel === name));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + name));
  shiftGoal = name === 'overview' ? 0.13 : -0.15;
  if (name === 'specs') runCounters();
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => { setPanel(t.dataset.panel); closeInfo(); }));

let counted = false;
function runCounters() {
  const els = document.querySelectorAll('[data-count]');
  els.forEach((el) => {
    const target = parseFloat(el.dataset.count);
    const dec = parseInt(el.dataset.dec || '0', 10);
    const suf = el.dataset.suffix || '';
    const t0 = performance.now(), dur = 1200;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const v = target * (1 - Math.pow(1 - k, 3));
      el.textContent = v.toFixed(dec) + suf;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

const rotBtn = document.getElementById('btn-rotate');
function syncRotateBtn() { rotBtn.setAttribute('aria-pressed', String(controls.autoRotate)); }
rotBtn.addEventListener('click', () => { controls.autoRotate = !controls.autoRotate; syncRotateBtn(); });

const lightBtn = document.getElementById('btn-light');
let day = false;
lightBtn.addEventListener('click', () => {
  day = !day;
  document.body.classList.toggle('day', day);
  lightBtn.setAttribute('aria-pressed', String(day));
  scene.environmentIntensity = day ? 0.7 : 0.32;
  renderer.toneMappingExposure = day ? 1.0 : 0.82;
  hemi.intensity = day ? 0.7 : 0.18;
  rimBlue.intensity = day ? 18 : 38;
  rimRed.intensity = day ? 14 : 28;
  floorMat.color.set(day ? 0xc9d6ea : 0x5a687e);
  floorMat.roughness = day ? 0.8 : 0.75;
});
// the toggle is a "light studio" mode – rename the tooltip accordingly
lightBtn.title = 'Toggle light / dark studio';

document.getElementById('btn-full').addEventListener('click', () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
});

// stop auto-rotation while the user interacts
controls.addEventListener('start', () => { tween = null; });
canvas.addEventListener('pointerdown', () => { if (controls.autoRotate) { controls.autoRotate = false; syncRotateBtn(); } });

/* ------------------------------------------------------------------ */
/*  Resize + loop                                                      */
/* ------------------------------------------------------------------ */
let shift = 0, shiftGoal = 0.13;   // fraction of width the scene is pushed sideways
function applyShift() {
  const w = window.innerWidth, h = window.innerHeight;
  if (w < 1000) { camera.clearViewOffset(); return; }
  camera.setViewOffset(w, h, -shift * w, 0, w, h);
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // keep the bike framed on narrow screens
  camera.zoom = w < 700 ? 0.78 : (w < 1000 ? 0.9 : 1);
  camera.updateProjectionMatrix();
  applyShift();
}
window.addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  if (window.__paused && !window.__once) return;
  window.__once = false;
  const dt = Math.min(clock.getDelta(), 0.05);

  if (tween) {
    tween.t += dt;
    const k = ease(Math.min(1, tween.t / tween.dur));
    camera.position.lerpVectors(tween.p0, tween.p1, k);
    controls.target.lerpVectors(tween.t0, tween.t1, k);
    camera.fov = tween.f0 + (tween.f1 - tween.f0) * k;
    camera.updateProjectionMatrix();
    if (tween.t >= tween.dur) tween = null;
  }

  // ease the scene sideways so it never sits under the open panel
  if (Math.abs(shift - shiftGoal) > 0.0005) { shift += (shiftGoal - shift) * Math.min(1, dt * 4); applyShift(); camera.updateProjectionMatrix(); }

  // slow idle spin of the glow ring for a showroom feel
  glowRing.rotation.z += dt * 0.15;

  controls.update();
  if (ready) updateHotspots();
  renderer.render(scene, camera);
}
loop();

// handy for debugging / screenshots
window.__applyView = applyView;
window.__openSpot = (i) => openSpot(SPOTS[i]);
window.__setPanel = setPanel;
window.__stop = () => { controls.autoRotate = false; syncRotateBtn(); };
window.__tweenDone = () => tween === null;
