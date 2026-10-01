import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.179.1/build/three.module.js';

const WORLD = 28, MAX_AGENTS = 24, MAX_BLOCKS = 900, SITE = 7;
const GLYPHS = ['ka', 'mi', 'tor', 'su', 'na', 'vek', 'li', 'oro', 'pa', 'zen', 'ul', 'dra'];
const MEANINGS = ['cimiento', 'muro', 'techo', 'aquí', 'sígueme'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const tanh = Math.tanh;
const BLOCKS = [
  { name: 'cimiento', color: 0x8d8474, h: 0.42 },
  { name: 'muro', color: 0xc4a574, h: 0.92 },
  { name: 'techo', color: 0x6e8494, h: 0.28 },
  { name: 'vano', color: 0xd7c4a3, h: 0.92 }
];

for (const id of ['hud', 'discoveries', 'notice', 'selected', 'extinction', 'mobileGestureHint']) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}
document.title = 'Life Sim — Sociedad';

const panel = document.createElement('div');
panel.innerHTML = `
  <style>
    #buildHud{position:fixed;left:12px;top:12px;width:min(400px,calc(100vw - 24px));z-index:30;
      background:rgba(12,18,26,.92);color:#e8f0f7;border:1px solid #2a3c4e;border-radius:16px;
      padding:14px;font:13px/1.4 Inter,system-ui,sans-serif;backdrop-filter:blur(10px);
      max-height:calc(100vh - 24px);overflow:auto}
    #buildHud h1{font-size:16px;margin:0 0 4px}
    #buildHud .sub{color:#93a4b5;font-size:12px;margin-bottom:8px}
    #buildHud .grid{display:grid;grid-template-columns:1fr 1fr;gap:7px 12px}
    #buildHud .stat{color:#93a4b5;font-size:11px}
    #buildHud .stat b{display:block;color:#e8f0f7;font-size:15px;margin-top:1px}
    #skillChart{width:100%;height:56px;margin:8px 0;background:#0d1620;border-radius:8px}
    #buildHud button{font:inherit;background:#17351f;color:#dfffe6;border:1px solid #2c6c3a;border-radius:10px;padding:8px 10px;margin-right:6px}
    #buildLog{margin-top:8px;font-size:11px;color:#b7c6d4;max-height:120px;overflow:auto}
    .say{color:#f0d78a}.friend{color:#8ee0a2}.hate{color:#ff8d8d}
  </style>
  <div id="buildHud">
    <h1>Life Sim — sociedad</h1>
    <div class="sub">Construyen, inventan idioma y forman grupos. La línea verde es amistad; la roja, rivalidad. Sin hambre ni clima.</div>
    <canvas id="skillChart" width="680" height="110"></canvas>
    <div class="grid">
      <div class="stat">Habilidad<b id="mSkill">0</b></div>
      <div class="stat">Mejora neuronal<b id="mGain">0%</b></div>
      <div class="stat">Idioma compartido<b id="mLang">0%</b></div>
      <div class="stat">Grupos<b id="mGroups">0</b></div>
      <div class="stat">Amistades<b id="mFriends">0</b></div>
      <div class="stat">Rivalidades<b id="mHates">0</b></div>
      <div class="stat">Obras cerradas<b id="mWorks">0</b></div>
      <div class="stat">Generación<b id="mGen">1</b></div>
    </div>
    <div style="margin-top:10px"><button id="bPause">Pausar</button><button id="bSpeed">Velocidad 1×</button></div>
    <div id="buildLog"></div>
  </div>`;
document.body.appendChild(panel);
const logEl = document.getElementById('buildLog');
const notes = [];
function note(text, cls = '') {
  notes.unshift(cls ? `<span class="${cls}">${text}</span>` : text);
  logEl.innerHTML = notes.slice(0, 6).join('<br>');
}

const app = document.getElementById('app');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101820);
scene.fog = new THREE.FogExp2(0x101820, 0.018);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200);
camera.position.set(16, 18, 20);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight);
app.appendChild(renderer.domElement);
scene.add(new THREE.AmbientLight(0xffffff, 0.74));
const sun = new THREE.DirectionalLight(0xfff2dd, 0.8);
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
  return type === 2 ? below.type === 1 || below.type === 3 : below.type !== 2;
}
const blockGeo = BLOCKS.map(b => new THREE.BoxGeometry(0.92, b.h, 0.92));
const blockMat = BLOCKS.map(b => new THREE.MeshStandardMaterial({ color: b.color }));
const blocks = [];
let works = 0, generation = 1;
function stackHeight(gx, gz) {
  let h = 0;
  for (let y = 0; y < 8; y++) { const b = cell.get(key(gx, gz, y)); if (!b) break; h += BLOCKS[b.type].h; }
  return h;
}
function topLevel(gx, gz) { let y = -1; while (cell.has(key(gx, gz, y + 1))) y++; return y; }
function placeBlock(gx, gz, gy, type, owner) {
  if (blocks.length >= MAX_BLOCKS || occupied(gx, gz, gy) || !supported(gx, gz, gy, type)) return false;
  const spec = BLOCKS[type];
  const mesh = new THREE.Mesh(blockGeo[type], blockMat[type]);
  mesh.position.set(gx, gy === 0 ? spec.h / 2 : stackHeight(gx, gz) + spec.h / 2, gz);
  scene.add(mesh);
  cell.set(key(gx, gz, gy), { type });
  blocks.push(1);
  owner.placed.push(type);
  return true;
}
function enclosureScore(cx, cz) {
  let closed = 0;
  for (let x = cx - 2; x <= cx + 2; x++) for (let z = cz - 2; z <= cz + 2; z++) {
    const edge = x === cx - 2 || x === cx + 2 || z === cz - 2 || z === cz + 2;
    const wall = occupied(x, z, 1);
    const roof = occupied(x, z, 2);
    const base = occupied(x, z, 0);
    if (edge && wall) closed += 0.35;
    if (!edge && base && roof) closed += 0.8;
  }
  return closed;
}

class Net {
  constructor(hidden = 6) {
    this.nIn = 12; this.nH = hidden; this.nOut = 6;
    this.w1 = Array.from({ length: this.nH }, () => Array.from({ length: this.nIn }, () => rand(-0.4, 0.4)));
    this.w2 = Array.from({ length: this.nOut }, () => Array.from({ length: this.nH }, () => rand(-0.4, 0.4)));
    this.e1 = this.w1.map(r => r.map(() => 0));
    this.e2 = this.w2.map(r => r.map(() => 0));
    this.skill = 0.15;
    this.lex = MEANINGS.map(() => Math.floor(rand(0, GLYPHS.length)));
  }
  forward(x) {
    const h = this.w1.map(row => tanh(row.reduce((s, w, j) => s + w * x[j], 0)));
    const o = this.w2.map(row => tanh(row.reduce((s, w, j) => s + w * h[j], 0)));
    for (let i = 0; i < this.nH; i++) for (let j = 0; j < this.nIn; j++) this.e1[i][j] = 0.9 * this.e1[i][j] + h[i] * x[j];
    for (let i = 0; i < this.nOut; i++) for (let j = 0; j < this.nH; j++) this.e2[i][j] = 0.9 * this.e2[i][j] + o[i] * h[j];
    return o;
  }
  learn(reward) {
    const r = clamp(reward, -1.2, 1.6);
    for (let i = 0; i < this.nOut; i++) for (let j = 0; j < this.nH; j++) this.w2[i][j] = clamp(this.w2[i][j] + 0.04 * r * this.e2[i][j], -3, 3);
    for (let i = 0; i < this.nH; i++) for (let j = 0; j < this.nIn; j++) this.w1[i][j] = clamp(this.w1[i][j] + 0.025 * r * this.e1[i][j], -3, 3);
    this.skill = clamp(this.skill * 0.99 + Math.max(0, r) * 0.08, 0, 8);
    if (this.skill > 0.7 + this.nH * 0.16 && this.nH < 18 && Math.random() < 0.04) this.grow();
  }
  grow() {
    this.w1.push(Array.from({ length: this.nIn }, () => rand(-0.2, 0.2)));
    this.e1.push(Array(this.nIn).fill(0));
    for (let i = 0; i < this.nOut; i++) { this.w2[i].push(rand(-0.2, 0.2)); this.e2[i].push(0); }
    this.nH++;
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

const bonds = new Map();
const pairKey = (a, b) => a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
function bond(a, b) { return bonds.get(pairKey(a, b)) || 0; }
function shiftBond(a, b, d, why) {
  const k = pairKey(a, b);
  const before = bonds.get(k) || 0;
  const next = clamp(before + d, -1, 1);
  bonds.set(k, next);
  if (before < 0.45 && next >= 0.45) note(`${a.id} y ${b.id} se hacen amigos (${why})`, 'friend');
  if (before > -0.45 && next <= -0.45) note(`${a.id} y ${b.id} se vuelven rivales (${why})`, 'hate');
}

const lineMatFriend = new THREE.LineBasicMaterial({ color: 0x7de38f });
const lineMatHate = new THREE.LineBasicMaterial({ color: 0xff6d6d });
const socialLines = new THREE.Group();
scene.add(socialLines);
function redrawBonds() {
  while (socialLines.children.length) socialLines.remove(socialLines.children[0]);
  for (const a of agents) for (const b of agents) if (a.id < b.id) {
    const v = bond(a, b);
    if (Math.abs(v) < 0.45) continue;
    const geo = new THREE.BufferGeometry().setFromPoints([a.mesh.position.clone().setY(0.4), b.mesh.position.clone().setY(0.4)]);
    socialLines.add(new THREE.Line(geo, v > 0 ? lineMatFriend : lineMatHate));
  }
}

const bodyGeo = new THREE.CapsuleGeometry(0.28, 0.55, 4, 8);
const agents = [];
let nextId = 1;
function makeLabel() {
  const c = document.createElement('canvas');
  c.width = 160; c.height = 48;
  const tex = new THREE.CanvasTexture(c);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(1.8, 0.54, 1);
  sprite.visible = false;
  scene.add(sprite);
  return { sprite, c, tex, g: c.getContext('2d'), ttl: 0 };
}
function spawn(net, x, z, gen, parent) {
  if (agents.length >= MAX_AGENTS) return null;
  const mesh = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0xd7c4a3 }));
  mesh.position.set(x, 0.7, z);
  scene.add(mesh);
  const a = { id: nextId++, net, mesh, gen, heading: rand(0, 6.2), site: { x: Math.round(x), z: Math.round(z) }, placed: [], cool: 0, talk: 0, taught: false, label: makeLabel(), heard: null, plan: [], group: 0 };
  agents.push(a);
  if (parent) shiftBond(a, parent, 0.5, 'alumno');
  return a;
}
for (let i = 0; i < 10; i++) spawn(new Net(6), rand(-8, 8), rand(-8, 8), 1);

function showSay(a, text, color) {
  const l = a.label;
  l.g.clearRect(0, 0, 160, 48);
  l.g.fillStyle = 'rgba(20,16,8,.82)';
  l.g.fillRect(0, 6, 160, 34);
  l.g.fillStyle = color;
  l.g.font = 'bold 20px sans-serif';
  l.g.textAlign = 'center';
  l.g.fillText(text, 80, 30);
  l.tex.needsUpdate = true;
  l.sprite.visible = true;
  l.ttl = 1.3;
  l.sprite.position.set(a.mesh.position.x, 1.8, a.mesh.position.z);
}
function nearest(a) {
  let best = null, d = 4.4;
  for (const b of agents) {
    if (b === a) continue;
    const dd = a.mesh.position.distanceTo(b.mesh.position);
    if (dd < d) { d = dd; best = b; }
  }
  return best;
}
function speak(a, other) {
  const level = topLevel(a.site.x, a.site.z);
  const meaning = bond(a, other) < -0.3 ? 4 : level < 0 ? 0 : level === 0 ? 1 : 2;
  const glyph = a.net.lex[meaning];
  other.heard = { meaning, glyph };
  if (Math.random() < 0.5) other.net.lex[meaning] = glyph;
  if (bond(a, other) >= 0) other.site = { ...a.site };
  showSay(a, GLYPHS[glyph], bond(a, other) < -0.3 ? '#ff8d8d' : '#f0d78a');
  a.talk = 2.1;
  shiftBond(a, other, bond(a, other) < -0.3 ? -0.04 : 0.05, 'se hablaron');
}
function act(a, dt) {
  const other = nearest(a);
  const rival = other && bond(a, other) < -0.45;
  const o = a.net.forward([
    a.mesh.position.x / WORLD, a.mesh.position.z / WORLD, Math.sin(a.heading), Math.cos(a.heading),
    clamp(a.net.skill / 4, 0, 1), (a.site.x - a.mesh.position.x) / SITE, (a.site.z - a.mesh.position.z) / SITE,
    a.heard ? 1 : 0, a.plan[0] === 1 ? 1 : 0, other ? bond(a, other) : 0, rival ? 1 : 0, a.group ? 1 : 0
  ]);
  a.heading += o[0] * dt * (rival ? -1.4 : 1.6);
  const speed = 1.25 + Math.max(0, o[1]);
  a.mesh.position.x = clamp(a.mesh.position.x + Math.sin(a.heading) * speed * dt, -WORLD + 1, WORLD - 1);
  a.mesh.position.z = clamp(a.mesh.position.z + Math.cos(a.heading) * speed * dt, -WORLD + 1, WORLD - 1);
  a.mesh.rotation.y = a.heading;
  const groupHue = a.group ? (a.group * 0.17) % 1 : 0.08;
  a.mesh.material.color.setHSL(groupHue, 0.55, 0.4 + clamp(a.net.skill / 14, 0, 0.22));
  a.cool -= dt; a.talk -= dt;
  if (a.label.ttl > 0) {
    a.label.ttl -= dt;
    a.label.sprite.position.set(a.mesh.position.x, 1.8, a.mesh.position.z);
    if (a.label.ttl <= 0) a.label.sprite.visible = false;
  }
  if (other && a.talk <= 0 && o[5] > 0.05) speak(a, other);
  if (rival && other && Math.hypot(a.site.x - other.site.x, a.site.z - other.site.z) < 3 && Math.random() < 0.01) {
    a.site = { x: clamp(a.site.x + (Math.random() < 0.5 ? 4 : -4), -10, 10), z: a.site.z };
    shiftBond(a, other, -0.08, 'se disputan la obra');
  }
  if (a.cool > 0 || o[2] < 0.12) return;
  const gx = Math.round(a.mesh.position.x + Math.sin(a.heading));
  const gz = Math.round(a.mesh.position.z + Math.cos(a.heading));
  if (Math.hypot(gx - a.site.x, gz - a.site.z) > SITE) return;
  const level = topLevel(gx, gz);
  let type = a.plan.length ? a.plan.shift() : level < 0 ? 0 : level === 0 ? 1 : 2;
  if (a.heard && a.heard.meaning <= 2 && bond(a, other || a) >= 0) type = a.heard.meaning;
  const before = enclosureScore(a.site.x, a.site.z);
  const ok = placeBlock(gx, gz, Math.max(0, level + 1), type, a);
  a.cool = 0.5;
  if (!ok) { a.net.learn(-0.15); return; }
  const after = enclosureScore(a.site.x, a.site.z);
  a.net.learn((after - before) * 1.4 + 0.05 + (other && bond(a, other) > 0.3 ? 0.1 : 0));
  if (other && bond(a, other) > 0 && Math.hypot(a.site.x - other.site.x, a.site.z - other.site.z) < 2) shiftBond(a, other, 0.03, 'construyen juntos');
  if (a.placed.length >= 3) a.plan = a.placed.slice(-3);
  if (after > 6.2 && before <= 6.2) {
    works++;
    note(`El grupo ${a.group || 'suelto'} cierra una obra.`);
    if (other && bond(a, other) > 0.2) { other.plan = a.placed.slice(-4); shiftBond(a, other, 0.12, 'obra compartida'); }
    if (!a.taught) { a.taught = true; generation = Math.max(generation, a.gen + 1); spawn(a.net.clone(), a.mesh.position.x + 1.4, a.mesh.position.z, a.gen + 1, a); }
  }
  a.heard = null;
}
function languageScore() {
  if (agents.length < 2) return 0;
  let agree = 0, total = 0;
  for (let i = 0; i < agents.length; i++) for (let j = i + 1; j < agents.length; j++) for (let m = 0; m < 3; m++) {
    total++; if (agents[i].net.lex[m] === agents[j].net.lex[m]) agree++;
  }
  return agree / total;
}
function refreshGroups() {
  for (const a of agents) a.group = 0;
  let gid = 1;
  for (const a of agents) {
    if (a.group) continue;
    const members = [a];
    for (const b of agents) if (b !== a && bond(a, b) >= 0.45 && Math.hypot(a.site.x - b.site.x, a.site.z - b.site.z) < 6) members.push(b);
    if (members.length >= 3) { for (const m of members) if (!m.group) m.group = gid; gid++; }
  }
  return gid - 1;
}
function countBonds(sign) {
  let n = 0;
  for (let i = 0; i < agents.length; i++) for (let j = i + 1; j < agents.length; j++) {
    const v = bond(agents[i], agents[j]);
    if (sign > 0 && v >= 0.45) n++;
    if (sign < 0 && v <= -0.45) n++;
  }
  return n;
}

const history = [];
let startSkill = 0.15, paused = false, speed = 1, acc = 0, last = performance.now(), sample = 0, lineTick = 0;
document.getElementById('bPause').onclick = e => { paused = !paused; e.target.textContent = paused ? 'Seguir' : 'Pausar'; };
document.getElementById('bSpeed').onclick = e => { speed = speed === 1 ? 3 : speed === 3 ? 8 : 1; e.target.textContent = `Velocidad ${speed}×`; };
note('Al inicio nadie se conoce. Construir juntos crea amistad; pelearse la obra, rivalidad.');
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000) * (paused ? 0 : speed);
  last = now; acc += dt; lineTick += dt;
  while (acc > 0.05) { for (const a of agents) act(a, 0.05); acc -= 0.05; }
  if (lineTick > 0.6) { lineTick = 0; redrawBonds(); }
  sample += dt;
  if (sample > 1.2) {
    sample = 0;
    const n = agents.length || 1;
    const skill = agents.reduce((s, a) => s + a.net.skill, 0) / n;
    if (!history.length) startSkill = skill;
    history.push(skill); if (history.length > 70) history.shift();
    document.getElementById('mSkill').textContent = skill.toFixed(2);
    document.getElementById('mGain').textContent = `${Math.round((skill / startSkill - 1) * 100)}%`;
    document.getElementById('mLang').textContent = `${Math.round(languageScore() * 100)}%`;
    document.getElementById('mGroups').textContent = refreshGroups();
    document.getElementById('mFriends').textContent = countBonds(1);
    document.getElementById('mHates').textContent = countBonds(-1);
    document.getElementById('mWorks').textContent = works;
    document.getElementById('mGen').textContent = generation;
    const c = document.getElementById('skillChart'), g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height); g.strokeStyle = '#8ee0a2'; g.lineWidth = 3; g.beginPath();
    history.forEach((v, i) => { const x = (i / Math.max(1, history.length - 1)) * c.width; const y = c.height - 6 - (v / 4) * (c.height - 14); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
