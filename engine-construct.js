import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.179.1/build/three.module.js';

const VERSION = 'v19.1.0-mind';
const WORLD = 28;
const MAX_AGENTS = 26;
const MAX_BLOCKS = 900;
const SITE = 7;
const GLYPHS = ['ka', 'mi', 'tor', 'su', 'na', 'vek', 'li', 'oro', 'pa', 'zen', 'ul', 'dra'];
const MEANINGS = ['cimiento', 'muro', 'techo', 'aquí', 'sígueme'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const tanh = Math.tanh;

const BLOCKS = [
  { id: 'base', name: 'cimiento', color: 0x8d8474, h: 0.42 },
  { id: 'wall', name: 'muro', color: 0xc4a574, h: 0.92 },
  { id: 'roof', name: 'techo', color: 0x6e8494, h: 0.28 },
  { id: 'open', name: 'vano', color: 0xd7c4a3, h: 0.92 }
];

for (const id of ['hud', 'discoveries', 'notice', 'selected', 'extinction', 'mobileGestureHint']) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}
document.title = 'Life Sim — Mente y obra';

const panel = document.createElement('div');
panel.innerHTML = `
  <style>
    #buildHud{position:fixed;left:12px;top:12px;width:min(400px,calc(100vw - 24px));z-index:30;
      background:rgba(12,18,26,.92);color:#e8f0f7;border:1px solid #2a3c4e;border-radius:16px;
      padding:14px;font:13px/1.4 Inter,system-ui,sans-serif;backdrop-filter:blur(10px);
      max-height:calc(100vh - 24px);overflow:auto;box-shadow:0 12px 32px rgba(0,0,0,.35)}
    #buildHud h1{font-size:16px;margin:0 0 4px}
    #buildHud .sub{color:#93a4b5;font-size:12px;margin-bottom:10px}
    #buildHud .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px}
    #buildHud .stat{color:#93a4b5;font-size:11px}
    #buildHud .stat b{display:block;color:#e8f0f7;font-size:15px;margin-top:1px}
    #skillChart{width:100%;height:64px;margin:8px 0;background:#0d1620;border-radius:8px}
    #buildHud button{font:inherit;background:#17351f;color:#dfffe6;border:1px solid #2c6c3a;border-radius:10px;padding:8px 10px;margin-right:6px}
    #buildLog{margin-top:8px;font-size:11px;color:#b7c6d4;max-height:110px;overflow:auto}
    .say{color:#f0d78a}
  </style>
  <div id="buildHud">
    <h1>Life Sim — mente y obra</h1>
    <div class="sub">Construyen, se hablan con sílabas inventadas y copian el plan que funcionó. Sin hambre ni clima.</div>
    <canvas id="skillChart" width="680" height="120"></canvas>
    <div class="grid">
      <div class="stat">Habilidad media<b id="mSkill">0</b></div>
      <div class="stat">Mejora neuronal<b id="mGain">0%</b></div>
      <div class="stat">Neuronas promedio<b id="mNeurons">0</b></div>
      <div class="stat">Idioma compartido<b id="mLang">0%</b></div>
      <div class="stat">Mensajes útiles<b id="mTalk">0</b></div>
      <div class="stat">Planes copiados<b id="mPlans">0</b></div>
      <div class="stat">Obras cerradas<b id="mWorks">0</b></div>
      <div class="stat">Generación<b id="mGen">1</b></div>
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
function note(text, say = false) {
  notes.unshift(say ? `<span class="say">${text}</span>` : text);
  logEl.innerHTML = notes.slice(0, 6).join('<br>');
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
const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD * 2, WORLD * 2), new THREE.MeshStandardMaterial({ color: 0x1c2a28 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
scene.add(new THREE.GridHelper(WORLD * 2, 28, 0x345046, 0x24362f));

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

const cell = new Map();
const key = (x, z, y) => `${x}|${z}|${y}`;
const occupied = (x, z, y) => cell.has(key(x, z, y));
function supported(x, z, y, type) {
  if (y === 0) return type === 0;
  const below = cell.get(key(x, z, y - 1));
  if (!below) return false;
  if (type === 2) return below.type === 1 || below.type === 3;
  return below.type !== 2;
}
const blockGeo = BLOCKS.map(b => new THREE.BoxGeometry(0.92, b.h, 0.92));
const blockMat = BLOCKS.map(b => new THREE.MeshStandardMaterial({ color: b.color }));
const blocks = [];
let works = 0, usefulTalks = 0, plansCopied = 0, generation = 1;

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
function placeBlock(gx, gz, gy, type, owner) {
  if (blocks.length >= MAX_BLOCKS || occupied(gx, gz, gy) || !supported(gx, gz, gy, type)) return false;
  const spec = BLOCKS[type];
  const mesh = new THREE.Mesh(blockGeo[type], blockMat[type]);
  mesh.position.set(gx, gy === 0 ? spec.h / 2 : stackHeight(gx, gz) + spec.h / 2, gz);
  scene.add(mesh);
  cell.set(key(gx, gz, gy), { x: gx, z: gz, y: gy, type, mesh });
  blocks.push(1);
  owner && owner.placed.push(type);
  return true;
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
    }
  }
  return closed;
}

class Net {
  constructor(hidden = 6) {
    this.nIn = 12; this.nH = hidden; this.nOut = 6;
    this.w1 = Array.from({ length: this.nH }, () => Array.from({ length: this.nIn }, () => rand(-0.4, 0.4)));
    this.b1 = Array.from({ length: this.nH }, () => 0);
    this.w2 = Array.from({ length: this.nOut }, () => Array.from({ length: this.nH }, () => rand(-0.4, 0.4)));
    this.b2 = Array.from({ length: this.nOut }, () => 0);
    this.e1 = this.w1.map(r => r.map(() => 0));
    this.e2 = this.w2.map(r => r.map(() => 0));
    this.skill = 0.15;
    this.lex = MEANINGS.map(() => Math.floor(rand(0, GLYPHS.length)));
  }
  connections() { return this.nH * this.nIn + this.nOut * this.nH; }
  forward(x) {
    const h = this.w1.map((row, i) => tanh(this.b1[i] + row.reduce((s, w, j) => s + w * x[j], 0)));
    const o = this.w2.map((row, i) => tanh(this.b2[i] + row.reduce((s, w, j) => s + w * h[j], 0)));
    for (let i = 0; i < this.nH; i++) for (let j = 0; j < this.nIn; j++) this.e1[i][j] = 0.9 * this.e1[i][j] + h[i] * x[j];
    for (let i = 0; i < this.nOut; i++) for (let j = 0; j < this.nH; j++) this.e2[i][j] = 0.9 * this.e2[i][j] + o[i] * h[j];
    return o;
  }
  learn(reward) {
    const r = clamp(reward, -1.2, 1.6), lr = 0.04;
    for (let i = 0; i < this.nOut; i++) for (let j = 0; j < this.nH; j++) this.w2[i][j] = clamp(this.w2[i][j] + lr * r * this.e2[i][j], -3, 3);
    for (let i = 0; i < this.nH; i++) for (let j = 0; j < this.nIn; j++) this.w1[i][j] = clamp(this.w1[i][j] + lr * 0.6 * r * this.e1[i][j], -3, 3);
    this.skill = clamp(this.skill * 0.99 + Math.max(0, r) * 0.08, 0, 8);
    if (this.skill > 0.7 + this.nH * 0.16 && this.nH < 18 && Math.random() < 0.05) this.grow();
  }
  grow() {
    this.w1.push(Array.from({ length: this.nIn }, () => rand(-0.2, 0.2)));
    this.b1.push(0); this.e1.push(Array(this.nIn).fill(0));
    for (let i = 0; i < this.nOut; i++) { this.w2[i].push(rand(-0.2, 0.2)); this.e2[i].push(0); }
    this.nH++;
  }
  say(meaning) { return this.lex[meaning]; }
  hear(meaning, glyph) {
    if (this.lex[meaning] !== glyph && Math.random() < 0.55) this.lex[meaning] = glyph;
  }
  clone() {
    const n = new Net(this.nH);
    n.w1 = this.w1.map(r => r.map(v => clamp(v + rand(-0.07, 0.07), -3, 3)));
    n.w2 = this.w2.map(r => r.map(v => clamp(v + rand(-0.07, 0.07), -3, 3)));
    n.e1 = n.w1.map(r => r.map(() => 0));
    n.e2 = n.w2.map(r => r.map(() => 0));
    n.lex = this.lex.slice();
    n.skill = this.skill * 0.75;
    return n;
  }
}

const bodyGeo = new THREE.CapsuleGeometry(0.28, 0.55, 4, 8);
const agents = [];
let nextId = 1;
const labelMat = new THREE.SpriteMaterial({ color: 0xf0d78a });

function makeLabel() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 48;
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.6, 0.6, 1);
  sprite.visible = false;
  scene.add(sprite);
  return { sprite, c, tex, g: c.getContext('2d'), ttl: 0, text: '' };
}
function spawn(net, x, z, gen) {
  if (agents.length >= MAX_AGENTS) return null;
  const mesh = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0xd7c4a3 }));
  mesh.position.set(x, 0.7, z);
  scene.add(mesh);
  const a = { id: nextId++, net, mesh, gen, heading: rand(0, 6.2), site: { x: Math.round(x), z: Math.round(z) }, placed: [], cool: 0, talk: 0, taught: false, label: makeLabel(), heard: null, plan: [] };
  agents.push(a);
  return a;
}
for (let i = 0; i < 10; i++) spawn(new Net(6), rand(-8, 8), rand(-8, 8), 1);

function showSay(a, text) {
  const l = a.label;
  l.g.clearRect(0, 0, 128, 48);
  l.g.fillStyle = 'rgba(20,16,8,.8)';
  l.g.fillRect(0, 8, 128, 32);
  l.g.fillStyle = '#f0d78a';
  l.g.font = 'bold 22px sans-serif';
  l.g.textAlign = 'center';
  l.g.fillText(text, 64, 30);
  l.tex.needsUpdate = true;
  l.sprite.visible = true;
  l.ttl = 1.4;
  l.sprite.position.set(a.mesh.position.x, 1.8, a.mesh.position.z);
}
function sense(a) {
  const aheadX = Math.round(a.mesh.position.x + Math.sin(a.heading) * 1.2);
  const aheadZ = Math.round(a.mesh.position.z + Math.cos(a.heading) * 1.2);
  const y = topLevel(aheadX, aheadZ);
  const heard = a.heard ? (a.heard.meaning + 1) / 5 : 0;
  return [a.mesh.position.x / WORLD, a.mesh.position.z / WORLD, Math.sin(a.heading), Math.cos(a.heading), clamp((y + 1) / 4, 0, 1), clamp(a.net.skill / 4, 0, 1), (a.site.x - a.mesh.position.x) / SITE, (a.site.z - a.mesh.position.z) / SITE, heard, a.plan[0] === 0 ? 1 : 0, a.plan[0] === 1 ? 1 : 0, a.plan[0] === 2 ? 1 : 0];
}
function nearest(a) {
  let best = null, d = 4.2;
  for (const b of agents) {
    if (b === a) continue;
    const dd = a.mesh.position.distanceTo(b.mesh.position);
    if (dd < d) { d = dd; best = b; }
  }
  return best;
}
function speak(a, other) {
  const level = topLevel(a.site.x, a.site.z);
  const meaning = level < 0 ? 0 : level === 0 ? 1 : 2;
  const glyph = a.net.say(meaning);
  other.heard = { meaning, glyph, from: a.id };
  other.net.hear(meaning, glyph);
  if (meaning === 4 || a.net.skill > 1.2) other.site = { ...a.site };
  showSay(a, GLYPHS[glyph]);
  showSay(other, GLYPHS[other.net.say(meaning)]);
  a.talk = 2.2;
  usefulTalks++;
  note(`${a.id} dice “${GLYPHS[glyph]}” por ${MEANINGS[meaning]}`, true);
}
function act(a, dt) {
  const o = a.net.forward(sense(a));
  a.heading += o[0] * dt * 1.8;
  a.mesh.position.x = clamp(a.mesh.position.x + Math.sin(a.heading) * (1.3 + Math.max(0, o[1])) * dt, -WORLD + 1, WORLD - 1);
  a.mesh.position.z = clamp(a.mesh.position.z + Math.cos(a.heading) * (1.3 + Math.max(0, o[1])) * dt, -WORLD + 1, WORLD - 1);
  a.mesh.rotation.y = a.heading;
  a.mesh.material.color.setHSL(0.08 + a.net.nH / 42, 0.55, 0.42 + clamp(a.net.skill / 12, 0, 0.22));
  a.cool -= dt; a.talk -= dt;
  if (a.label.ttl > 0) { a.label.ttl -= dt; a.label.sprite.position.set(a.mesh.position.x, 1.8, a.mesh.position.z); if (a.label.ttl <= 0) a.label.sprite.visible = false; }
  const other = nearest(a);
  if (other && a.talk <= 0 && o[5] > 0.2) speak(a, other);
  if (a.cool > 0 || o[2] < 0.12) return;
  const gx = Math.round(a.mesh.position.x + Math.sin(a.heading));
  const gz = Math.round(a.mesh.position.z + Math.cos(a.heading));
  if (Math.hypot(gx - a.site.x, gz - a.site.z) > SITE) return;
  const level = topLevel(gx, gz);
  let type = a.plan.length ? a.plan.shift() : (level < 0 ? 0 : level === 0 ? 1 : 2);
  if (a.heard && a.heard.meaning <= 2) type = a.heard.meaning;
  const before = enclosureScore(a.site.x, a.site.z);
  const ok = placeBlock(gx, gz, level + 1, type, a);
  a.cool = 0.5;
  if (!ok) { a.net.learn(-0.2); return; }
  const after = enclosureScore(a.site.x, a.site.z);
  const reward = (after - before) * 1.5 + 0.06 + (a.heard ? 0.12 : 0);
  a.net.learn(reward);
  if (a.placed.length >= 3 && a.placed.length <= 5) a.plan = a.placed.slice(-3);
  if (after > 6.2 && before <= 6.2) {
    works++;
    note(`Obra cerrada. ${a.id} tiene ${a.net.nH} neuronas y dice “${GLYPHS[a.net.say(2)]}” para techo.`);
    if (other && other.plan.length === 0) { other.plan = a.placed.slice(-4); plansCopied++; }
    if (!a.taught) {
      a.taught = true;
      generation = Math.max(generation, a.gen + 1);
      spawn(a.net.clone(), a.mesh.position.x + 1.5, a.mesh.position.z, a.gen + 1);
    }
  }
  a.heard = null;
}
function languageScore() {
  if (agents.length < 2) return 0;
  let agree = 0, total = 0;
  for (let i = 0; i < agents.length; i++) for (let j = i + 1; j < agents.length; j++) {
    for (let m = 0; m < MEANINGS.length; m++) { total++; if (agents[i].net.lex[m] === agents[j].net.lex[m]) agree++; }
  }
  return agree / total;
}
const history = [];
let startSkill = 0.15, paused = false, speed = 1, acc = 0, last = performance.now(), sample = 0;
document.getElementById('bPause').onclick = e => { paused = !paused; e.target.textContent = paused ? 'Seguir' : 'Pausar'; };
document.getElementById('bSpeed').onclick = e => { speed = speed === 1 ? 3 : speed === 3 ? 8 : 1; e.target.textContent = `Velocidad ${speed}×`; };
note('Al principio cada quien nombra distinto. Si se escuchan, el idioma se alinea.');
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000) * (paused ? 0 : speed);
  last = now; acc += dt;
  while (acc > 0.05) { for (const a of agents) act(a, 0.05); acc -= 0.05; }
  sample += dt;
  if (sample > 1.2) {
    sample = 0;
    const n = agents.length || 1;
    const skill = agents.reduce((s, a) => s + a.net.skill, 0) / n;
    const neurons = agents.reduce((s, a) => s + a.net.nH, 0) / n;
    if (!history.length) startSkill = skill;
    history.push(skill); if (history.length > 80) history.shift();
    document.getElementById('mSkill').textContent = skill.toFixed(2);
    document.getElementById('mGain').textContent = `${Math.round((skill / startSkill - 1) * 100)}%`;
    document.getElementById('mNeurons').textContent = neurons.toFixed(1);
    document.getElementById('mLang').textContent = `${Math.round(languageScore() * 100)}%`;
    document.getElementById('mTalk').textContent = usefulTalks;
    document.getElementById('mPlans').textContent = plansCopied;
    document.getElementById('mWorks').textContent = works;
    document.getElementById('mGen').textContent = generation;
    const c = document.getElementById('skillChart'), g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height); g.strokeStyle = '#f0d78a'; g.lineWidth = 3; g.beginPath();
    history.forEach((v, i) => { const x = (i / Math.max(1, history.length - 1)) * c.width; const y = c.height - 8 - (v / 4) * (c.height - 16); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
