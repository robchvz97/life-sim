import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.179.1/build/three.module.js';

const WORLD = 26, N = 12, MAX_BLOCKS = 700;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const tanh = Math.tanh;
const TYPES = [
  { h: 0.4, color: 0x8a8172 },
  { h: 0.9, color: 0xb08968 },
  { h: 0.28, color: 0x6d7f90 },
  { h: 0.9, color: 0xd9c7a4 }
];

for (const id of ['hud', 'discoveries', 'notice', 'selected', 'extinction', 'mobileGestureHint']) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}
const nav = document.getElementById('mobileNav');
if (nav) nav.style.display = 'flex';
document.title = 'Life Sim — redes abiertas';

const panel = document.createElement('div');
panel.innerHTML = `
  <style>
    #buildHud{position:fixed;left:12px;top:12px;width:min(400px,calc(100vw - 24px));z-index:30;
      background:rgba(12,18,26,.92);color:#e8f0f7;border:1px solid #2a3c4e;border-radius:16px;
      padding:14px;font:13px/1.4 Inter,system-ui,sans-serif;backdrop-filter:blur(10px);max-height:calc(100vh - 24px);overflow:auto}
    #buildHud.hidden{width:46px;height:46px;padding:0;overflow:hidden}
    #buildHud.hidden .body{display:none}
    #hideHud{position:absolute;right:8px;top:8px;width:30px;height:30px;border-radius:8px;border:1px solid #30465d;background:#172434;color:#e8f0f7}
    #buildHud h1{font-size:16px;margin:0 28px 4px 0}
    #buildHud .sub{color:#93a4b5;font-size:12px;margin-bottom:8px}
    #buildHud .grid{display:grid;grid-template-columns:1fr 1fr;gap:7px 12px}
    #buildHud .stat{color:#93a4b5;font-size:11px}
    #buildHud .stat b{display:block;color:#e8f0f7;font-size:15px;margin-top:1px}
    #skillChart{width:100%;height:56px;margin:8px 0;background:#0d1620;border-radius:8px}
    #buildHud button.ctrl{font:inherit;background:#172434;color:#e8f0f7;border:1px solid #30465d;border-radius:10px;padding:8px 10px;margin-right:6px}
    #buildLog{margin-top:8px;font-size:11px;color:#b7c6d4}
  </style>
  <div id="buildHud">
    <button id="hideHud" title="Ocultar métricas">–</button>
    <div class="body">
      <h1>Life Sim — redes abiertas</h1>
      <div class="sub">El cuerpo no tiene paso escrito. La red decide zancada y impulso. Si brincan o corren, lo encontraron solas.</div>
      <canvas id="skillChart" width="680" height="110"></canvas>
      <div class="grid">
        <div class="stat">Error predictivo<b id="mErr">—</b></div>
        <div class="stat">Caída del error<b id="mDrop">0%</b></div>
        <div class="stat">Neuronas promedio<b id="mNeurons">0</b></div>
        <div class="stat">Bloques que se sostienen<b id="mBlocks">0</b></div>
        <div class="stat">Señales distintas<b id="mSignals">0</b></div>
        <div class="stat">Alineación de señales<b id="mAlign">0%</b></div>
        <div class="stat">En el aire<b id="mAir">0</b></div>
        <div class="stat">Altura máxima<b id="mHeight">0</b></div>
      </div>
      <div style="margin-top:10px"><button class="ctrl" id="bPause">Pausar</button><button class="ctrl" id="bSpeed">Velocidad 1×</button></div>
      <div id="buildLog">El joystick de abajo mueve la cámara, no a las criaturas.</div>
    </div>
  </div>`;
document.body.appendChild(panel);
const hud = document.getElementById('buildHud');
document.getElementById('hideHud').onclick = () => {
  const hidden = hud.classList.toggle('hidden');
  document.getElementById('hideHud').textContent = hidden ? '+' : '–';
};

const app = document.getElementById('app');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101820);
scene.fog = new THREE.FogExp2(0x101820, 0.02);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 180);
const look = new THREE.Vector3(0, 0.4, 0);
let theta = 0.8, phi = 1.02, radius = 24, dragging = false, lx = 0, ly = 0;
const pan = { x: 0, z: 0 };
function aim() {
  const s = Math.sin(phi);
  camera.position.set(look.x + radius * s * Math.sin(theta), look.y + radius * Math.cos(phi), look.z + radius * s * Math.cos(theta));
  camera.lookAt(look);
}
aim();
rendererSetup();
function rendererSetup() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight);
  app.appendChild(renderer.domElement);
  scene.add(new THREE.AmbientLight(0xffffff, 0.78));
  const sun = new THREE.DirectionalLight(0xfff1d8, 0.75);
  sun.position.set(10, 18, 6);
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD * 2, WORLD * 2), new THREE.MeshStandardMaterial({ color: 0x1b2926 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  scene.add(new THREE.GridHelper(WORLD * 2, 26, 0x345046, 0x24362f));
  renderer.domElement.addEventListener('pointerdown', e => { if (e.target.closest('#buildHud,#mobileNav')) return; dragging = true; lx = e.clientX; ly = e.clientY; });
  window.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('pointermove', e => {
    if (!dragging) return;
    theta -= (e.clientX - lx) * 0.005;
    phi = clamp(phi + (e.clientY - ly) * 0.004, 0.35, 1.35);
    lx = e.clientX; ly = e.clientY; aim();
  });
  window.__lifeRenderer = renderer;
}
const pad = document.getElementById('movePad');
const knob = document.getElementById('moveKnob');
if (pad) {
  const set = (cx, cy) => {
    const r = pad.getBoundingClientRect();
    const x = clamp(cx - r.left - r.width / 2, -42, 42);
    const y = clamp(cy - r.top - r.height / 2, -42, 42);
    if (knob) knob.style.transform = `translate(${x}px, ${y}px)`;
    pan.x = x / 42; pan.z = y / 42;
  };
  pad.addEventListener('pointerdown', e => { pad.setPointerCapture(e.pointerId); set(e.clientX, e.clientY); });
  pad.addEventListener('pointermove', e => { if (pad.hasPointerCapture(e.pointerId)) set(e.clientX, e.clientY); });
  const end = () => { pan.x = 0; pan.z = 0; if (knob) knob.style.transform = 'translate(0,0)'; };
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);
}
const center = document.getElementById('mobileCenter');
if (center) center.onclick = () => { look.set(0, 0.4, 0); aim(); };

const cell = new Map();
const key = (x, z, y) => `${x}|${z}|${y}`;
function heightAt(x, z) { let y = 0; while (cell.has(key(x, z, y))) y++; return y; }
const geos = TYPES.map(t => new THREE.BoxGeometry(0.9, t.h, 0.9));
const mats = TYPES.map(t => new THREE.MeshStandardMaterial({ color: t.color }));
let held = 0, maxH = 0;
function place(x, z, type) {
  const y = heightAt(x, z);
  if (y > 6 || (y > 0 && !cell.has(key(x, z, y - 1)))) return 0;
  const mesh = new THREE.Mesh(geos[type], mats[type]);
  let base = 0;
  for (let i = 0; i < y; i++) base += TYPES[cell.get(key(x, z, i)).type].h;
  mesh.position.set(x, base + TYPES[type].h / 2, z);
  scene.add(mesh);
  cell.set(key(x, z, y), { type });
  held++; maxH = Math.max(maxH, y + 1);
  return 1;
}

class Net {
  constructor(h = 8) {
    this.nIn = 20; this.nH = h; this.nOut = 8;
    this.w1 = Array.from({ length: h }, () => Array.from({ length: this.nIn }, () => rand(-0.35, 0.35)));
    this.w2 = Array.from({ length: this.nOut }, () => Array.from({ length: h }, () => rand(-0.35, 0.35)));
    this.e1 = this.w1.map(r => r.map(() => 0));
    this.e2 = this.w2.map(r => r.map(() => 0));
    this.pred = Array.from({ length: 4 }, () => Array.from({ length: h }, () => rand(-0.2, 0.2)));
    this.err = 0.8;
  }
  step(x) {
    const hid = this.w1.map(row => tanh(row.reduce((s, w, j) => s + w * x[j], 0)));
    const out = this.w2.map(row => tanh(row.reduce((s, w, j) => s + w * hid[j], 0)));
    this._h = hid;
    this._g = this.pred.map(row => tanh(row.reduce((s, w, j) => s + w * hid[j], 0)));
    for (let i = 0; i < this.nH; i++) for (let j = 0; j < this.nIn; j++) this.e1[i][j] = 0.92 * this.e1[i][j] + hid[i] * x[j];
    for (let i = 0; i < this.nOut; i++) for (let j = 0; j < this.nH; j++) this.e2[i][j] = 0.92 * this.e2[i][j] + out[i] * hid[j];
    return out;
  }
  learn(reward, target) {
    const r = clamp(reward, -1, 1);
    for (let i = 0; i < this.nOut; i++) for (let j = 0; j < this.nH; j++) this.w2[i][j] = clamp(this.w2[i][j] + 0.03 * r * this.e2[i][j], -2.5, 2.5);
    for (let i = 0; i < this.nH; i++) for (let j = 0; j < this.nIn; j++) this.w1[i][j] = clamp(this.w1[i][j] + 0.018 * r * this.e1[i][j], -2.5, 2.5);
    let e = 0;
    for (let i = 0; i < target.length; i++) {
      const diff = target[i] - this._g[i];
      e += diff * diff;
      for (let j = 0; j < this.nH; j++) this.pred[i][j] = clamp(this.pred[i][j] + 0.05 * diff * this._h[j], -2, 2);
    }
    this.err = this.err * 0.97 + e / target.length;
    if (this.err > 0.4 && this.nH < 20 && Math.random() < 0.008) this.grow();
  }
  grow() {
    this.w1.push(Array.from({ length: this.nIn }, () => rand(-0.15, 0.15)));
    this.e1.push(Array(this.nIn).fill(0));
    for (let i = 0; i < this.nOut; i++) { this.w2[i].push(rand(-0.15, 0.15)); this.e2[i].push(0); }
    for (let i = 0; i < this.pred.length; i++) this.pred[i].push(rand(-0.1, 0.1));
    this.nH++;
  }
}

function makeBody(hue) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue, 0.45, 0.55) });
  const limb = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue, 0.3, 0.35) });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.42, 4, 8), mat);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), mat);
  head.position.y = 0.48;
  g.add(torso, head);
  const legs = [], arms = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.34, 3, 6), limb);
    leg.position.set(side * 0.14, -0.42, 0);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.28, 3, 6), limb);
    arm.position.set(side * 0.36, 0.12, 0);
    g.add(leg, arm);
    legs.push(leg); arms.push(arm);
  }
  return { g, legs, arms, mat };
}

const agents = [];
for (let i = 0; i < N; i++) {
  const body = makeBody(i / N);
  body.g.position.set(rand(-6, 6), 0.7, rand(-6, 6));
  scene.add(body.g);
  agents.push({ ...body, net: new Net(8), heading: rand(0, 6), vy: 0, signal: [0, 0, 0, 0], cool: 0, phase: rand(0, 6), air: 0 });
}
function sense(a) {
  const x = Math.round(a.g.position.x), z = Math.round(a.g.position.z);
  const local = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) local.push(heightAt(x + dx, z + dz) / 6);
  let nx = 0, nz = 0, heard = [0, 0, 0, 0];
  for (const b of agents) if (b !== a) {
    const d = a.g.position.distanceTo(b.g.position);
    if (d < 6) { nx += (b.g.position.x - a.g.position.x) / 6; nz += (b.g.position.z - a.g.position.z) / 6; for (let i = 0; i < 4; i++) heard[i] += b.signal[i] / (1 + d); }
  }
  return [...local, nx, nz, a.vy, a.g.position.y / 3, ...heard, Math.sin(a.heading), Math.cos(a.heading)];
}
function act(a, dt) {
  const before = [a.g.position.y / 3, a.vy, a.signal[0], a.signal[1]];
  const o = a.net.step(sense(a));
  a.heading += o[0] * dt * 1.6;
  const stride = Math.max(0, o[1]);
  const speed = stride * 2.4;
  a.g.position.x = clamp(a.g.position.x + Math.sin(a.heading) * speed * dt, -WORLD + 1, WORLD - 1);
  a.g.position.z = clamp(a.g.position.z + Math.cos(a.heading) * speed * dt, -WORLD + 1, WORLD - 1);
  const grounded = a.g.position.y <= 0.72;
  if (grounded && o[2] > 0.55) a.vy = 1.6 + o[2] * 2.2;
  a.vy -= 4.2 * dt;
  a.g.position.y = Math.max(0.7, a.g.position.y + a.vy * dt);
  if (a.g.position.y <= 0.72) { a.g.position.y = 0.7; if (a.vy < 0) a.vy = 0; a.air = 0; }
  else a.air = 1;
  a.phase += stride * dt * 9;
  a.legs[0].rotation.x = Math.sin(a.phase) * stride;
  a.legs[1].rotation.x = Math.sin(a.phase + Math.PI) * stride;
  a.arms[0].rotation.x = Math.sin(a.phase + Math.PI) * stride * 0.7;
  a.arms[1].rotation.x = Math.sin(a.phase) * stride * 0.7;
  a.g.rotation.y = a.heading;
  a.g.rotation.z = clamp(a.vy * 0.08, -0.3, 0.3);
  a.signal = [o[4], o[5], o[6], o[7]].map(v => clamp(v, -1, 1));
  a.cool -= dt;
  let placed = 0;
  if (a.cool <= 0 && o[3] > 0.35) {
    placed = place(Math.round(a.g.position.x + Math.sin(a.heading)), Math.round(a.g.position.z + Math.cos(a.heading)), clamp(Math.floor((o[3] + 1) * 1.5), 0, 3));
    a.cool = 0.5;
  }
  const after = [a.g.position.y / 3, a.vy, a.signal[0], a.signal[1]];
  const changed = after.reduce((s, v, i) => s + Math.abs(v - before[i]), 0);
  const surprise = after.reduce((s, v, i) => s + Math.abs(v - (a.net._g[i] || 0)), 0);
  a.net.learn(placed * 0.3 + changed * 0.4 - (changed < 0.03 ? 0.05 : surprise * 0.2), changed < 0.03 ? before : after);
  if (changed < 0.03) a.net.err = Math.max(a.net.err, 0.4);
}
function signalBins() {
  const bins = new Set();
  for (const a of agents) bins.add(a.signal.map(v => Math.round(v * 2)).join(','));
  return bins.size;
}
function alignment() {
  let s = 0, n = 0;
  for (let i = 0; i < agents.length; i++) for (let j = i + 1; j < agents.length; j++) {
    if (agents[i].g.position.distanceTo(agents[j].g.position) > 5) continue;
    let dot = 0;
    for (let k = 0; k < 4; k++) dot += agents[i].signal[k] * agents[j].signal[k];
    s += clamp(dot / 4, 0, 1); n++;
  }
  return n ? s / n : 0;
}
let paused = false, speed = 1, acc = 0, last = performance.now(), sample = 0, startErr = 0;
const history = [];
document.getElementById('bPause').onclick = e => { paused = !paused; e.target.textContent = paused ? 'Seguir' : 'Pausar'; };
document.getElementById('bSpeed').onclick = e => { speed = speed === 1 ? 3 : speed === 3 ? 8 : 1; e.target.textContent = `Velocidad ${speed}×`; };
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const right = Math.cos(theta), forward = -Math.sin(theta);
  look.x = clamp(look.x + (pan.x * right + pan.z * Math.sin(theta)) * dt * 10, -WORLD, WORLD);
  look.z = clamp(look.z + (pan.x * forward + pan.z * Math.cos(theta)) * dt * 10, -WORLD, WORLD);
  aim();
  const sim = dt * (paused ? 0 : speed);
  acc += sim;
  while (acc > 0.05) { for (const a of agents) act(a, 0.05); acc -= 0.05; }
  sample += sim;
  if (sample > 1) {
    sample = 0;
    const err = agents.reduce((s, a) => s + a.net.err, 0) / agents.length;
    const neurons = agents.reduce((s, a) => s + a.net.nH, 0) / agents.length;
    const air = agents.filter(a => a.air).length;
    if (!startErr) startErr = err || 0.8;
    history.push(err); if (history.length > 70) history.shift();
    document.getElementById('mErr').textContent = err.toFixed(3);
    document.getElementById('mDrop').textContent = `${Math.round((1 - err / startErr) * 100)}%`;
    document.getElementById('mNeurons').textContent = neurons.toFixed(1);
    document.getElementById('mBlocks').textContent = held;
    document.getElementById('mSignals').textContent = signalBins();
    document.getElementById('mAlign').textContent = `${Math.round(alignment() * 100)}%`;
    document.getElementById('mAir').textContent = air;
    document.getElementById('mHeight').textContent = maxH;
    const c = document.getElementById('skillChart'), g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height); g.strokeStyle = '#9fd0ff'; g.lineWidth = 3; g.beginPath();
    history.forEach((v, i) => { const x = (i / Math.max(1, history.length - 1)) * c.width; const y = 8 + clamp(v, 0, 1.2) * 36; i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
  }
  window.__lifeRenderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); window.__lifeRenderer.setSize(innerWidth, innerHeight); });
