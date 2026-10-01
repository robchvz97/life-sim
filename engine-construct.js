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
document.title = 'Life Sim — redes abiertas';

const panel = document.createElement('div');
panel.innerHTML = `
  <style>
    #buildHud{position:fixed;left:12px;top:12px;width:min(400px,calc(100vw - 24px));z-index:30;
      background:rgba(12,18,26,.92);color:#e8f0f7;border:1px solid #2a3c4e;border-radius:16px;
      padding:14px;font:13px/1.4 Inter,system-ui,sans-serif;backdrop-filter:blur(10px);max-height:calc(100vh - 24px);overflow:auto}
    #buildHud h1{font-size:16px;margin:0 0 4px}
    #buildHud .sub{color:#93a4b5;font-size:12px;margin-bottom:8px}
    #buildHud .grid{display:grid;grid-template-columns:1fr 1fr;gap:7px 12px}
    #buildHud .stat{color:#93a4b5;font-size:11px}
    #buildHud .stat b{display:block;color:#e8f0f7;font-size:15px;margin-top:1px}
    #skillChart{width:100%;height:56px;margin:8px 0;background:#0d1620;border-radius:8px}
    #buildHud button{font:inherit;background:#172434;color:#e8f0f7;border:1px solid #30465d;border-radius:10px;padding:8px 10px;margin-right:6px}
    #buildLog{margin-top:8px;font-size:11px;color:#b7c6d4}
  </style>
  <div id="buildHud">
    <h1>Life Sim — redes abiertas</h1>
    <div class="sub">No hay reglas de casa, idioma ni amistad. Solo sienten, actúan y corrigen su predicción. Si aparece orden, salió de la red.</div>
    <canvas id="skillChart" width="680" height="110"></canvas>
    <div class="grid">
      <div class="stat">Error predictivo<b id="mErr">—</b></div>
      <div class="stat">Caída del error<b id="mDrop">0%</b></div>
      <div class="stat">Neuronas promedio<b id="mNeurons">0</b></div>
      <div class="stat">Bloques que se sostienen<b id="mBlocks">0</b></div>
      <div class="stat">Señales distintas<b id="mSignals">0</b></div>
      <div class="stat">Alineación de señales<b id="mAlign">0%</b></div>
      <div class="stat">Cercanía entre ellos<b id="mCluster">0%</b></div>
      <div class="stat">Altura máxima<b id="mHeight">0</b></div>
    </div>
    <div style="margin-top:10px"><button id="bPause">Pausar</button><button id="bSpeed">Velocidad 1×</button></div>
    <div id="buildLog">Observando. Nada de esto está ordenado.</div>
  </div>`;
document.body.appendChild(panel);

const app = document.getElementById('app');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101820);
scene.fog = new THREE.FogExp2(0x101820, 0.02);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 180);
camera.position.set(18, 16, 18);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight);
app.appendChild(renderer.domElement);
scene.add(new THREE.AmbientLight(0xffffff, 0.75));
const sun = new THREE.DirectionalLight(0xfff1d8, 0.7);
sun.position.set(10, 18, 6);
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD * 2, WORLD * 2), new THREE.MeshStandardMaterial({ color: 0x1b2926 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
scene.add(new THREE.GridHelper(WORLD * 2, 26, 0x345046, 0x24362f));

let theta = 0.8, phi = 1.02, radius = 24, dragging = false, lx = 0, ly = 0;
function aim() {
  const s = Math.sin(phi);
  camera.position.set(radius * s * Math.sin(theta), radius * Math.cos(phi), radius * s * Math.cos(theta));
  camera.lookAt(0, 0.6, 0);
}
aim();
renderer.domElement.addEventListener('pointerdown', e => { dragging = true; lx = e.clientX; ly = e.clientY; });
window.addEventListener('pointerup', () => { dragging = false; });
window.addEventListener('pointermove', e => {
  if (!dragging) return;
  theta -= (e.clientX - lx) * 0.005;
  phi = clamp(phi + (e.clientY - ly) * 0.004, 0.3, 1.35);
  lx = e.clientX; ly = e.clientY; aim();
});

const cell = new Map();
const k = (x, z, y) => `${x}|${z}|${y}`;
function heightAt(x, z) { let y = 0; while (cell.has(k(x, z, y))) y++; return y; }
function canPlace(x, z, y, type) {
  if (y === 0) return true;
  return cell.has(k(x, z, y - 1));
}
const geos = TYPES.map(t => new THREE.BoxGeometry(0.9, t.h, 0.9));
const mats = TYPES.map(t => new THREE.MeshStandardMaterial({ color: t.color }));
let held = 0, maxH = 0;
function place(x, z, type) {
  const y = heightAt(x, z);
  if (y > 6 || !canPlace(x, z, y, type)) return 0;
  const mesh = new THREE.Mesh(geos[type], mats[type]);
  let base = 0;
  for (let i = 0; i < y; i++) base += TYPES[cell.get(k(x, z, i)).type].h;
  mesh.position.set(x, base + TYPES[type].h / 2, z);
  scene.add(mesh);
  cell.set(k(x, z, y), { type, mesh });
  held++;
  maxH = Math.max(maxH, y + 1);
  return 1;
}

class Net {
  constructor(h = 8) {
    this.nIn = 22; this.nH = h; this.nOut = 8;
    this.w1 = Array.from({ length: h }, () => Array.from({ length: this.nIn }, () => rand(-0.35, 0.35)));
    this.w2 = Array.from({ length: this.nOut }, () => Array.from({ length: h }, () => rand(-0.35, 0.35)));
    this.e1 = this.w1.map(r => r.map(() => 0));
    this.e2 = this.w2.map(r => r.map(() => 0));
    this.pred = Array.from({ length: 6 }, () => Array.from({ length: h }, () => rand(-0.2, 0.2)));
    this.err = 1;
  }
  step(x) {
    const hid = this.w1.map(row => tanh(row.reduce((s, w, j) => s + w * x[j], 0)));
    const out = this.w2.map(row => tanh(row.reduce((s, w, j) => s + w * hid[j], 0)));
    const guess = this.pred.map(row => tanh(row.reduce((s, w, j) => s + w * hid[j], 0)));
    for (let i = 0; i < this.nH; i++) for (let j = 0; j < this.nIn; j++) this.e1[i][j] = 0.92 * this.e1[i][j] + hid[i] * x[j];
    for (let i = 0; i < this.nOut; i++) for (let j = 0; j < this.nH; j++) this.e2[i][j] = 0.92 * this.e2[i][j] + out[i] * hid[j];
    this._h = hid; this._g = guess;
    return out;
  }
  learn(reward, target) {
    const r = clamp(reward, -1, 1);
    for (let i = 0; i < this.nOut; i++) for (let j = 0; j < this.nH; j++) this.w2[i][j] = clamp(this.w2[i][j] + 0.03 * r * this.e2[i][j], -2.5, 2.5);
    for (let i = 0; i < this.nH; i++) for (let j = 0; j < this.nIn; j++) this.w1[i][j] = clamp(this.w1[i][j] + 0.02 * r * this.e1[i][j], -2.5, 2.5);
    let e = 0;
    for (let i = 0; i < target.length; i++) {
      const diff = target[i] - this._g[i];
      e += diff * diff;
      for (let j = 0; j < this.nH; j++) this.pred[i][j] = clamp(this.pred[i][j] + 0.05 * diff * this._h[j], -2, 2);
    }
    this.err = this.err * 0.96 + e / target.length;
    if (this.err > 0.35 && this.nH < 20 && Math.random() < 0.01) this.grow();
  }
  grow() {
    this.w1.push(Array.from({ length: this.nIn }, () => rand(-0.15, 0.15)));
    this.e1.push(Array(this.nIn).fill(0));
    for (let i = 0; i < this.nOut; i++) { this.w2[i].push(rand(-0.15, 0.15)); this.e2[i].push(0); }
    for (let i = 0; i < this.pred.length; i++) this.pred[i].push(rand(-0.1, 0.1));
    this.nH++;
  }
}

const geo = new THREE.CapsuleGeometry(0.26, 0.5, 3, 8);
const agents = [];
for (let i = 0; i < N; i++) {
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xc9b89a }));
  mesh.position.set(rand(-8, 8), 0.65, rand(-8, 8));
  scene.add(mesh);
  const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), new THREE.MeshBasicMaterial({ color: 0xf0d78a, transparent: true, opacity: 0.0 }));
  scene.add(pulse);
  agents.push({ mesh, pulse, net: new Net(8), heading: rand(0, 6), signal: [0, 0, 0, 0], cool: 0 });
}
function sense(a) {
  const x = Math.round(a.mesh.position.x), z = Math.round(a.mesh.position.z);
  const local = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) local.push(heightAt(x + dx, z + dz) / 6);
  let nx = 0, nz = 0, heard = [0, 0, 0, 0], near = 0;
  for (const b of agents) if (b !== a) {
    const dx = b.mesh.position.x - a.mesh.position.x, dz = b.mesh.position.z - a.mesh.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 6) { nx += dx / 6; nz += dz / 6; near++; for (let i = 0; i < 4; i++) heard[i] += b.signal[i] / (1 + d); }
  }
  return [...local, nx, nz, near / N, ...heard, Math.sin(a.heading), Math.cos(a.heading), ...a.signal];
}
function act(a, dt) {
  const before = sense(a).slice(0, 6);
  const o = a.net.step(sense(a));
  a.heading += o[0] * dt * 1.4;
  a.mesh.position.x = clamp(a.mesh.position.x + Math.sin(a.heading) * (0.8 + Math.max(0, o[1])) * dt, -WORLD + 1, WORLD - 1);
  a.mesh.position.z = clamp(a.mesh.position.z + Math.cos(a.heading) * (0.8 + Math.max(0, o[1])) * dt, -WORLD + 1, WORLD - 1);
  a.mesh.rotation.y = a.heading;
  a.signal = [o[4], o[5], o[6], o[7]].map(v => clamp(v, -1, 1));
  const loud = a.signal.reduce((s, v) => s + Math.abs(v), 0) / 4;
  a.pulse.position.set(a.mesh.position.x, 1.15, a.mesh.position.z);
  a.pulse.material.opacity = clamp(loud, 0, 0.85);
  a.pulse.material.color.setRGB(0.5 + a.signal[0] * 0.5, 0.5 + a.signal[1] * 0.5, 0.4 + a.signal[2] * 0.4);
  a.mesh.material.color.setHSL(0.08 + a.net.nH / 50, 0.35, 0.5);
  a.cool -= dt;
  let placed = 0;
  if (a.cool <= 0 && o[2] > 0.25) {
    const gx = Math.round(a.mesh.position.x + Math.sin(a.heading));
    const gz = Math.round(a.mesh.position.z + Math.cos(a.heading));
    const type = clamp(Math.floor((o[3] + 1) * 2), 0, 3);
    placed = place(gx, gz, type);
    a.cool = 0.45;
  }
  const after = sense(a).slice(0, 6);
  const predicted = a.net._g;
  const surprise = after.reduce((s, v, i) => s + Math.abs(v - (predicted[i] || 0)), 0);
  a.net.learn(placed * 0.35 - surprise * 0.15, after);
}
function signalBins() {
  const bins = new Set();
  for (const a of agents) bins.add(a.signal.map(v => Math.round(v * 2)).join(','));
  return bins.size;
}
function alignment() {
  let s = 0, n = 0;
  for (let i = 0; i < agents.length; i++) for (let j = i + 1; j < agents.length; j++) {
    const d = agents[i].mesh.position.distanceTo(agents[j].mesh.position);
    if (d > 5) continue;
    let dot = 0;
    for (let k = 0; k < 4; k++) dot += agents[i].signal[k] * agents[j].signal[k];
    s += clamp(dot / 4, 0, 1); n++;
  }
  return n ? s / n : 0;
}
function cluster() {
  let near = 0, n = 0;
  for (let i = 0; i < agents.length; i++) for (let j = i + 1; j < agents.length; j++) {
    n++; if (agents[i].mesh.position.distanceTo(agents[j].mesh.position) < 4) near++;
  }
  return n ? near / n : 0;
}

let paused = false, speed = 1, acc = 0, last = performance.now(), sample = 0, startErr = 0;
const history = [];
document.getElementById('bPause').onclick = e => { paused = !paused; e.target.textContent = paused ? 'Seguir' : 'Pausar'; };
document.getElementById('bSpeed').onclick = e => { speed = speed === 1 ? 3 : speed === 3 ? 8 : 1; e.target.textContent = `Velocidad ${speed}×`; };
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000) * (paused ? 0 : speed);
  last = now; acc += dt;
  while (acc > 0.05) { for (const a of agents) act(a, 0.05); acc -= 0.05; }
  sample += dt;
  if (sample > 1) {
    sample = 0;
    const err = agents.reduce((s, a) => s + a.net.err, 0) / agents.length;
    const neurons = agents.reduce((s, a) => s + a.net.nH, 0) / agents.length;
    if (!startErr) startErr = err;
    history.push(err); if (history.length > 70) history.shift();
    document.getElementById('mErr').textContent = err.toFixed(3);
    document.getElementById('mDrop').textContent = `${Math.round((1 - err / startErr) * 100)}%`;
    document.getElementById('mNeurons').textContent = neurons.toFixed(1);
    document.getElementById('mBlocks').textContent = held;
    document.getElementById('mSignals').textContent = signalBins();
    document.getElementById('mAlign').textContent = `${Math.round(alignment() * 100)}%`;
    document.getElementById('mCluster').textContent = `${Math.round(cluster() * 100)}%`;
    document.getElementById('mHeight').textContent = maxH;
    const c = document.getElementById('skillChart'), g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height); g.strokeStyle = '#9fd0ff'; g.lineWidth = 3; g.beginPath();
    history.forEach((v, i) => { const x = (i / Math.max(1, history.length - 1)) * c.width; const y = 8 + v * (c.height - 16); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
