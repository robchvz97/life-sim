import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.179.1/build/three.module.js';

const VERSION = 'v19.0.0-construct';
const WORLD = 28;
const MAX_AGENTS = 28;
const MAX_BLOCKS = 900;
const SITE = 7;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const tanh = Math.tanh;

const BLOCKS = [
  { id: 'base', name: 'cimiento', color: 0x8d8474, h: 0.42 },
  { id: 'wall', name: 'muro', color: 0xc4a574, h: 0.92 },
  { id: 'roof', name: 'techo', color: 0x6e8494, h: 0.28 },
  { id: 'open', name: 'vano', color: 0xd7c4a3, h: 0.92 }
];

function hideLegacy() {
  for (const id of ['hud', 'discoveries', 'notice', 'selected', 'extinction', 'mobileGestureHint']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
}
hideLegacy();
document.title = 'Life Sim — Constructores';

const panel = document.createElement('div');
panel.innerHTML = `
  <style>
    #buildHud{position:fixed;left:12px;top:12px;width:min(390px,calc(100vw - 24px));z-index:30;
      background:rgba(12,18,26,.92);color:#e8f0f7;border:1px solid #2a3c4e;border-radius:16px;
      padding:14px;font:13px/1.4 Inter,system-ui,sans-serif;backdrop-filter:blur(10px);
      max-height:calc(100vh - 24px);overflow:auto;box-shadow:0 12px 32px rgba(0,0,0,.35)}
    #buildHud h1{font-size:16px;margin:0 0 4px}
    #buildHud .sub{color:#93a4b5;font-size:12px;margin-bottom:10px}
    #buildHud .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px}
    #buildHud .stat{color:#93a4b5;font-size:11px}
    #buildHud .stat b{display:block;color:#e8f0f7;font-size:15px;margin-top:1px}
    #skillChart{width:100%;height:72px;margin:10px 0 8px;background:#0d1620;border-radius:8px}
    #buildHud button{font:inherit;background:#17351f;color:#dfffe6;border:1px solid #2c6c3a;border-radius:10px;padding:8px 10px;margin-right:6px}
    #buildLog{margin-top:8px;font-size:11px;color:#b7c6d4;max-height:88px;overflow:auto}
  </style>
  <div id="buildHud">
    <h1>Life Sim — solo construir</h1>
    <div class="sub">Sin hambre, sol, enfermedad ni supervivencia. Las redes crecen si la obra mejora.</div>
    <canvas id="skillChart" width="680" height="140"></canvas>
    <div class="grid">
      <div class="stat">Habilidad media<b id="mSkill">0</b></div>
      <div class="stat">Mejora desde el inicio<b id="mGain">0%</b></div>
      <div class="stat">Neuronas promedio<b id="mNeurons">0</b></div>
      <div class="stat">Conexiones promedio<b id="mLinks">0</b></div>
      <div class="stat">Obras cerradas<b id="mWorks">0</b></div>
      <div class="stat">Altura máxima<b id="mHeight">0</b></div>
      <div class="stat">Bloques colocados<b id="mBlocks">0</b></div>
      <div class="stat">Generación de alumnos<b id="mGen">1</b></div>
    </div>
    <div style="margin-top:10px">
      <button id="bPause">Pausar</button>
      <button id="bSpeed">Velocidad 1×</button>
    </div>
    <div id="buildLog"></div>
  </div>`;
document.body.appendChild(panel);

const logEl = document.getElementById('buildLog');
const notes = [];
function note(text) {
  notes.unshift(text);
  logEl.innerHTML = notes.slice(0, 5).map(t => `<div>${t}</div>`).join('');
}

const app = document.getElementById('app');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101820);
scene.fog = new THREE.FogExp2(0x101820, 0.02);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200);
camera.position.set(16, 18, 20);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight);
app.appendChild(renderer.domElement);
scene.add(new THREE.AmbientLight(0xffffff, 0.72));
const sun = new THREE.DirectionalLight(0xfff2dd, 0.85);
sun.position.set(12, 22, 8);
scene.add(sun);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(WORLD * 2, WORLD * 2),
  new THREE.MeshStandardMaterial({ color: 0x1c2a28, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const grid = new THREE.GridHelper(WORLD * 2, 28, 0x345046, 0x24362f);
grid.position.y = 0.01;
scene.add(grid);

let theta = 0.7, phi = 1.05, radius = 26, dragging = false, lx = 0, ly = 0;
function aim() {
  const s = Math.sin(phi);
  camera.position.set(radius * s * Math.sin(theta), radius * Math.cos(phi), radius * s * Math.cos(theta));
  camera.lookAt(0, 1.2, 0);
}
aim();
renderer.domElement.addEventListener('pointerdown', e => { dragging = true; lx = e.clientX; ly = e.clientY; });
window.addEventListener('pointerup', () => { dragging = false; });
window.addEventListener('pointermove', e => {
  if (!dragging) return;
  theta -= (e.clientX - lx) * 0.005;
  phi = clamp(phi + (e.clientY - ly) * 0.004, 0.25, 1.35);
  lx = e.clientX; ly = e.clientY; aim();
});
renderer.domElement.addEventListener('wheel', e => { radius = clamp(radius * Math.exp(e.deltaY * 0.001), 10, 60); aim(); }, { passive: true });

const cell = new Map();
function key(x, z, y) { return `${x}|${z}|${y}`; }
function occupied(x, z, y) { return cell.has(key(x, z, y)); }
function supported(x, z, y, type) {
  if (y === 0) return type === 0;
  const below = cell.get(key(x, z, y - 1));
  if (!below) return false;
  if (type === 2) return below.type === 1 || below.type === 3;
  return below.type !== 2;
}

const blockGeo = [0, 1, 2, 3].map(i => new THREE.BoxGeometry(0.92, BLOCKS[i].h, 0.92));
const blockMat = BLOCKS.map(b => new THREE.MeshStandardMaterial({ color: b.color, roughness: 0.8 }));
const blocks = [];
let works = 0, maxHeight = 0, bestScore = 0;

function placeBlock(gx, gz, gy, type, owner) {
  if (blocks.length >= MAX_BLOCKS || occupied(gx, gz, gy) || !supported(gx, gz, gy, type)) return false;
  const spec = BLOCKS[type];
  const mesh = new THREE.Mesh(blockGeo[type], blockMat[type]);
  const y = gy === 0 ? spec.h / 2 : stackHeight(gx, gz) + spec.h / 2;
  mesh.position.set(gx, y, gz);
  scene.add(mesh);
  const rec = { x: gx, z: gz, y: gy, type, mesh };
  cell.set(key(gx, gz, gy), rec);
  blocks.push(rec);
  maxHeight = Math.max(maxHeight, gy + 1);
  owner && owner.placed++;
  return true;
}
function stackHeight(gx, gz) {
  let h = 0;
  for (let y = 0; y < 8; y++) {
    const b = cell.get(key(gx, gz, y));
    if (!b) break;
    h += BLOCKS[b.type].h;
  }
  return h;
}
function topLevel(gx, gz) {
  let y = -1;
  while (cell.has(key(gx, gz, y + 1))) y++;
  return y;
}

function enclosureScore(cx, cz) {
  let closed = 0;
  for (let x = cx - 2; x <= cx + 2; x++) {
    for (let z = cz - 2; z <= cz + 2; z++) {
      const edge = x === cx - 2 || x === cx + 2 || z === cz - 2 || z === cz + 2;
      const wall = occupied(x, z, 1) && (cell.get(key(x, z, 1)).type === 1 || cell.get(key(x, z, 1)).type === 3);
      const roof = occupied(x, z, 2) && cell.get(key(x, z, 2)).type === 2;
      const base = occupied(x, z, 0);
      if (edge && wall) closed += 0.35;
      if (!edge && base && roof) closed += 0.8;
      if (!edge && base && wall) closed += 0.15;
    }
  }
  return closed;
}

class Net {
  constructor(hidden = 5) {
    this.nIn = 10;
    this.nH = hidden;
    this.nOut = 5;
    this.w1 = Array.from({ length: this.nH }, () => Array.from({ length: this.nIn }, () => rand(-0.45, 0.45)));
    this.b1 = Array.from({ length: this.nH }, () => rand(-0.1, 0.1));
    this.w2 = Array.from({ length: this.nOut }, () => Array.from({ length: this.nH }, () => rand(-0.45, 0.45)));
    this.b2 = Array.from({ length: this.nOut }, () => 0);
    this.e1 = this.w1.map(r => r.map(() => 0));
    this.e2 = this.w2.map(r => r.map(() => 0));
    this.lastH = [];
    this.lastX = [];
    this.skill = 0.15;
  }
  connections() { return this.nH * this.nIn + this.nOut * this.nH; }
  forward(x) {
    this.lastX = x;
    const h = [];
    for (let i = 0; i < this.nH; i++) {
      let s = this.b1[i];
      for (let j = 0; j < this.nIn; j++) s += this.w1[i][j] * x[j];
      h.push(tanh(s));
    }
    this.lastH = h;
    const o = [];
    for (let i = 0; i < this.nOut; i++) {
      let s = this.b2[i];
      for (let j = 0; j < this.nH; j++) s += this.w2[i][j] * h[j];
      o.push(tanh(s));
    }
    for (let i = 0; i < this.nH; i++) {
      for (let j = 0; j < this.nIn; j++) this.e1[i][j] = 0.92 * this.e1[i][j] + h[i] * x[j];
    }
    for (let i = 0; i < this.nOut; i++) {
      for (let j = 0; j < this.nH; j++) this.e2[i][j] = 0.92 * this.e2[i][j] + o[i] * h[j];
    }
    return o;
  }
  learn(reward) {
    const r = clamp(reward, -1.2, 1.6);
    const lr = 0.035;
    for (let i = 0; i < this.nOut; i++) {
      this.b2[i] = clamp(this.b2[i] + lr * r * 0.2, -2, 2);
      for (let j = 0; j < this.nH; j++) this.w2[i][j] = clamp(this.w2[i][j] + lr * r * this.e2[i][j], -3, 3);
    }
    for (let i = 0; i < this.nH; i++) {
      this.b1[i] = clamp(this.b1[i] + lr * r * 0.15, -2, 2);
      for (let j = 0; j < this.nIn; j++) this.w1[i][j] = clamp(this.w1[i][j] + lr * 0.65 * r * this.e1[i][j], -3, 3);
    }
    this.skill = clamp(this.skill * 0.985 + Math.max(0, r) * 0.08, 0, 8);
    if (this.skill > 0.8 + this.nH * 0.18 && this.nH < 18 && Math.random() < 0.04) this.grow();
  }
  grow() {
    const row = Array.from({ length: this.nIn }, () => rand(-0.2, 0.2));
    this.w1.push(row);
    this.b1.push(0);
    this.e1.push(row.map(() => 0));
    for (let i = 0; i < this.nOut; i++) { this.w2[i].push(rand(-0.2, 0.2)); this.e2[i].push(0); }
    this.nH++;
  }
  clone() {
    const n = new Net(this.nH);
    n.w1 = this.w1.map(r => r.map(v => clamp(v + rand(-0.08, 0.08), -3, 3)));
    n.b1 = this.b1.map(v => v + rand(-0.03, 0.03));
    n.w2 = this.w2.map(r => r.map(v => clamp(v + rand(-0.08, 0.08), -3, 3)));
    n.b2 = this.b2.slice();
    n.e1 = n.w1.map(r => r.map(() => 0));
    n.e2 = n.w2.map(r => r.map(() => 0));
    n.skill = this.skill * 0.72;
    return n;
  }
}

const bodyGeo = new THREE.CapsuleGeometry(0.28, 0.55, 4, 8);
const agents = [];
let nextId = 1, generation = 1;
const history = [];
let startSkill = 0.15;

function spawn(net, x, z, gen) {
  if (agents.length >= MAX_AGENTS) return null;
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.08 + gen * 0.07, 0.55, 0.55) });
  const mesh = new THREE.Mesh(bodyGeo, mat);
  mesh.position.set(x, 0.7, z);
  scene.add(mesh);
  const a = {
    id: nextId++, net, mesh, gen, heading: rand(0, Math.PI * 2),
    site: { x: Math.round(x), z: Math.round(z) },
    placed: 0, cool: 0, taught: false
  };
  agents.push(a);
  return a;
}
for (let i = 0; i < 10; i++) spawn(new Net(5), rand(-8, 8), rand(-8, 8), 1);

function sense(a) {
  const aheadX = Math.round(a.mesh.position.x + Math.sin(a.heading) * 1.2);
  const aheadZ = Math.round(a.mesh.position.z + Math.cos(a.heading) * 1.2);
  const y = topLevel(aheadX, aheadZ);
  const localWalls = [-1, 0, 1].reduce((s, dx) => s + [-1, 0, 1].reduce((t, dz) => t + (occupied(aheadX + dx, aheadZ + dz, 1) ? 1 : 0), 0), 0) / 9;
  const localRoof = occupied(aheadX, aheadZ, 2) ? 1 : 0;
  return [
    clamp(a.mesh.position.x / WORLD, -1, 1),
    clamp(a.mesh.position.z / WORLD, -1, 1),
    Math.sin(a.heading), Math.cos(a.heading),
    clamp((y + 1) / 4, 0, 1),
    localWalls, localRoof,
    clamp(a.net.skill / 4, 0, 1),
    clamp((a.site.x - a.mesh.position.x) / SITE, -1, 1),
    clamp((a.site.z - a.mesh.position.z) / SITE, -1, 1)
  ];
}

function act(a, dt) {
  const o = a.net.forward(sense(a));
  a.heading += o[0] * dt * 1.8;
  const speed = 1.35 + Math.max(0, o[1]) * 1.1;
  a.mesh.position.x = clamp(a.mesh.position.x + Math.sin(a.heading) * speed * dt, -WORLD + 1, WORLD - 1);
  a.mesh.position.z = clamp(a.mesh.position.z + Math.cos(a.heading) * speed * dt, -WORLD + 1, WORLD - 1);
  a.mesh.position.y = 0.7;
  a.mesh.rotation.y = a.heading;
  const hue = clamp(0.08 + a.net.nH / 40, 0, 0.45);
  a.mesh.material.color.setHSL(hue, 0.6, 0.42 + clamp(a.net.skill / 10, 0, 0.25));
  a.cool -= dt;
  if (a.cool > 0 || o[2] < 0.15) return;
  const gx = Math.round(a.mesh.position.x + Math.sin(a.heading));
  const gz = Math.round(a.mesh.position.z + Math.cos(a.heading));
  if (Math.hypot(gx - a.site.x, gz - a.site.z) > SITE) return;
  const prefs = [o[3], o[4], 0.15, -0.05];
  let type = 0, best = -9;
  const level = topLevel(gx, gz);
  const options = level < 0 ? [0] : level === 0 ? [1, 3] : [2];
  for (const t of options) if (prefs[t] > best) { best = prefs[t]; type = t; }
  const before = enclosureScore(a.site.x, a.site.z);
  const ok = placeBlock(gx, gz, level + 1, type, a);
  a.cool = 0.55;
  if (!ok) { a.net.learn(-0.25); return; }
  const after = enclosureScore(a.site.x, a.site.z);
  const heightBonus = (level + 1) * 0.08;
  const reward = (after - before) * 1.4 + heightBonus + 0.05;
  a.net.learn(reward);
  if (after > 6.5 && before <= 6.5) {
    works++;
    note(`Obra cerrada cerca de ${a.site.x},${a.site.z}. Red con ${a.net.nH} neuronas.`);
    if (!a.taught && agents.length < MAX_AGENTS) {
      a.taught = true;
      generation = Math.max(generation, a.gen + 1);
      spawn(a.net.clone(), a.mesh.position.x + rand(-2, 2), a.mesh.position.z + rand(-2, 2), a.gen + 1);
      note(`Alumno generación ${a.gen + 1} copió una red de ${a.net.nH} neuronas.`);
    }
  }
}

let paused = false, speed = 1, acc = 0, last = performance.now();
document.getElementById('bPause').onclick = e => { paused = !paused; e.target.textContent = paused ? 'Seguir' : 'Pausar'; };
document.getElementById('bSpeed').onclick = e => {
  speed = speed === 1 ? 3 : speed === 3 ? 8 : 1;
  e.target.textContent = `Velocidad ${speed}×`;
};
note('Empiezan sin saber construir. El premio es cerrar un volumen, no comer.');

function metrics() {
  const n = agents.length || 1;
  const skill = agents.reduce((s, a) => s + a.net.skill, 0) / n;
  const neurons = agents.reduce((s, a) => s + a.net.nH, 0) / n;
  const links = agents.reduce((s, a) => s + a.net.connections(), 0) / n;
  if (!startSkill) startSkill = skill;
  return { skill, neurons, links };
}
function drawChart() {
  const c = document.getElementById('skillChart');
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.strokeStyle = '#7de38f';
  g.lineWidth = 3;
  g.beginPath();
  history.forEach((v, i) => {
    const x = (i / Math.max(1, history.length - 1)) * c.width;
    const y = c.height - 8 - (v / 4) * (c.height - 16);
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  });
  g.stroke();
}
let sample = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000) * (paused ? 0 : speed);
  last = now;
  acc += dt;
  while (acc > 0.05) {
    for (const a of agents) act(a, 0.05);
    acc -= 0.05;
  }
  sample += dt;
  if (sample > 1.2) {
    sample = 0;
    const m = metrics();
    history.push(m.skill);
    if (history.length > 80) history.shift();
    bestScore = Math.max(bestScore, m.skill);
    document.getElementById('mSkill').textContent = m.skill.toFixed(2);
    document.getElementById('mGain').textContent = `${Math.round((m.skill / startSkill - 1) * 100)}%`;
    document.getElementById('mNeurons').textContent = m.neurons.toFixed(1);
    document.getElementById('mLinks').textContent = Math.round(m.links);
    document.getElementById('mWorks').textContent = works;
    document.getElementById('mHeight').textContent = maxHeight;
    document.getElementById('mBlocks').textContent = blocks.length;
    document.getElementById('mGen').textContent = generation;
    drawChart();
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
