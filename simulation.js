import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.179.1/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.179.1/examples/jsm/controls/OrbitControls.js';

const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const rand = (a=0,b=1)=>a+Math.random()*(b-a);
const choice = a=>a[(Math.random()*a.length)|0];
const sigmoid = x=>1/(1+Math.exp(-x));
const tanh = Math.tanh;

const CONFIG = {
  WORLD: 34,
  START_AGENTS: 32,
  START_FOOD: 150,
  MAX_AGENTS: 260,
  FOOD_MAX: 350,
  FOOD_RESPAWN: 1.1,
  BASE_METABOLISM: 0.21,
  MOVE_COST: 0.12,
  REPRO_MIN_ENERGY: 72,
  REPRO_COST: 34,
  REPRO_COOLDOWN: 12,
  START_ENERGY: 48,
  MAX_ENERGY: 100,
  WATER_DRAIN: 0.35,
  MAX_AGE: 240,
  SENSE_RADIUS: 8.5,
  BITE_RADIUS: 0.8,
};

let mutationRate = 0.10;
let sunFactor = 1.0;
let timeScale = 1.0;
let paused = false;
let worldAge = 0;
let births = 0;
let deaths = 0;
let nextId = 1;
let selectedAgent = null;

const app = document.getElementById('app');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x091016);
scene.fog = new THREE.FogExp2(0x091016, 0.018);

const camera = new THREE.PerspectiveCamera(58, innerWidth/innerHeight, 0.1, 400);
camera.position.set(22, 20, 26);

const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0,0,0);
controls.maxPolarAngle = Math.PI*0.48;
controls.minDistance = 8;
controls.maxDistance = 70;

scene.add(new THREE.HemisphereLight(0xaad7ff, 0x17301e, 0.9));
const sun = new THREE.DirectionalLight(0xfff2cf, 1.3);
sun.position.set(-12,22,9);
sun.castShadow = true;
sun.shadow.mapSize.set(1024,1024);
sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
scene.add(sun);

const groundMat = new THREE.MeshStandardMaterial({color:0x203e29, roughness:0.95});
const ground = new THREE.Mesh(new THREE.CircleGeometry(CONFIG.WORLD, 96), groundMat);
ground.rotation.x = -Math.PI/2;
ground.receiveShadow = true;
scene.add(ground);

// Water pond: universal environmental hazard/resource-like zone.
const pond = new THREE.Mesh(
  new THREE.CircleGeometry(7.5, 64),
  new THREE.MeshStandardMaterial({color:0x1d6683, transparent:true, opacity:0.75, roughness:0.25, metalness:0.05})
);
pond.rotation.x = -Math.PI/2;
pond.position.set(-8,0.025,7);
scene.add(pond);

const ring = new THREE.Mesh(
  new THREE.RingGeometry(CONFIG.WORLD, CONFIG.WORLD+0.3, 96),
  new THREE.MeshBasicMaterial({color:0x4d6a52, side:THREE.DoubleSide})
);
ring.rotation.x = -Math.PI/2;
ring.position.y = 0.015;
scene.add(ring);

const foodGroup = new THREE.Group();
const agentGroup = new THREE.Group();
scene.add(foodGroup, agentGroup);

const food = [];
const agents = [];

function randomGroundPos(){
  const r = Math.sqrt(Math.random())*(CONFIG.WORLD-1.5);
  const a = Math.random()*Math.PI*2;
  return new THREE.Vector3(Math.cos(a)*r,0,Math.sin(a)*r);
}

function makeFood(pos=randomGroundPos(), energy=rand(5,10)){
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(rand(.12,.22),0),
    new THREE.MeshStandardMaterial({color:0x9fe76e, emissive:0x112208, roughness:0.85})
  );
  mesh.position.copy(pos); mesh.position.y=.18;
  mesh.castShadow = true;
  foodGroup.add(mesh);
  const f = {mesh, energy, nutrient:1};
  food.push(f);
  return f;
}

function randomGenome(){
  // Body genes
  const body = {
    size: rand(0.55,1.15),
    limbCount: Math.floor(rand(2,7)),
    limbLength: rand(0.35,0.95),
    speed: rand(1.0,2.6),
    turn: rand(0.8,2.2),
    hue: rand(0,1),
    sensor: rand(0.65,1.35),
    voice: rand(0.1,1.0),
    sociability: rand(-1,1),
  };

  // Tiny recurrent neural net: 11 inputs -> 10 hidden -> 5 outputs
  const ni=11, nh=10, no=5;
  const weights1 = Array.from({length:nh},()=>Array.from({length:ni},()=>rand(-1.2,1.2)));
  const weightsR = Array.from({length:nh},()=>Array.from({length:nh},()=>rand(-.35,.35)));
  const bias1 = Array.from({length:nh},()=>rand(-.25,.25));
  const weights2 = Array.from({length:no},()=>Array.from({length:nh},()=>rand(-1.2,1.2)));
  const bias2 = Array.from({length:no},()=>rand(-.25,.25));
  return {body, brain:{weights1,weightsR,bias1,weights2,bias2}};
}

function mutateGenome(g){
  const ng = structuredClone(g);
  const m = mutationRate;
  const maybe = (x,scale=1)=>{
    if(Math.random()<m) x += rand(-scale,scale);
    return x;
  };
  const b=ng.body;
  b.size=clamp(maybe(b.size,.16),.35,1.6);
  b.limbCount=clamp(Math.round(maybe(b.limbCount,1.4)),0,10);
  b.limbLength=clamp(maybe(b.limbLength,.18),.15,1.5);
  b.speed=clamp(maybe(b.speed,.35),.4,4.5);
  b.turn=clamp(maybe(b.turn,.3),.3,3.4);
  b.hue=(maybe(b.hue,.12)+1)%1;
  b.sensor=clamp(maybe(b.sensor,.18),.3,2.0);
  b.voice=clamp(maybe(b.voice,.2),0,1.5);
  b.sociability=clamp(maybe(b.sociability,.35),-1.5,1.5);
  for(const row of ng.brain.weights1) for(let i=0;i<row.length;i++) row[i]=maybe(row[i],.35);
  for(const row of ng.brain.weightsR) for(let i=0;i<row.length;i++) row[i]=maybe(row[i],.18);
  for(let i=0;i<ng.brain.bias1.length;i++) ng.brain.bias1[i]=maybe(ng.brain.bias1[i],.18);
  for(const row of ng.brain.weights2) for(let i=0;i<row.length;i++) row[i]=maybe(row[i],.35);
  for(let i=0;i<ng.brain.bias2.length;i++) ng.brain.bias2[i]=maybe(ng.brain.bias2[i],.18);
  return ng;
}

function createBody(genome){
  const g=genome.body;
  const root = new THREE.Group();
  const color = new THREE.Color().setHSL(g.hue,.58,.52);
  const mat = new THREE.MeshStandardMaterial({color, roughness:.72});
  const core = new THREE.Mesh(new THREE.SphereGeometry(.42*g.size,12,10), mat);
  core.scale.set(1.2,0.85,1.0);
  core.position.y=.46*g.size;
  core.castShadow=true;
  root.add(core);

  const eyeMat = new THREE.MeshStandardMaterial({color:0xf4f6f8, roughness:.3});
  const pupilMat = new THREE.MeshStandardMaterial({color:0x111111, roughness:.4});
  for(const sx of [-1,1]){
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.07*g.size,8,6),eyeMat);
    eye.position.set(.26*sx*g.size,.55*g.size,.31*g.size);
    const p = new THREE.Mesh(new THREE.SphereGeometry(.032*g.size,7,5),pupilMat);
    p.position.set(0,0,.058*g.size);
    eye.add(p); root.add(eye);
  }

  const limbMat = new THREE.MeshStandardMaterial({color:color.clone().offsetHSL(0,-.08,-.08),roughness:.85});
  for(let i=0;i<g.limbCount;i++){
    const a=(i/g.limbCount)*Math.PI*2;
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(.045*g.size,.06*g.size,g.limbLength*g.size,6),limbMat);
    limb.position.set(Math.cos(a)*.36*g.size,.24*g.size,Math.sin(a)*.36*g.size);
    limb.rotation.z = Math.PI/2.5;
    limb.rotation.y = -a;
    limb.castShadow=true;
    root.add(limb);
  }
  return root;
}

function makeAgent(genome=randomGenome(), pos=randomGroundPos(), generation=0){
  if(agents.length>=CONFIG.MAX_AGENTS) return null;
  const mesh=createBody(genome);
  mesh.position.copy(pos);
  mesh.rotation.y=rand(0,Math.PI*2);
  agentGroup.add(mesh);
  const a={
    id:nextId++,
    mesh, genome,
    generation,
    age:0,
    energy:CONFIG.START_ENERGY,
    heading:mesh.rotation.y,
    hidden:Array(10).fill(0),
    memory:Array(8).fill(0), // long-lived recurrent summary
    reproCooldown:rand(2,8),
    signal:0,
    signalPhase:rand(0,Math.PI*2),
    lastFoodDir:0,
    lastNeighborDir:0,
    children:0,
    lineage: Math.random().toString(36).slice(2,7),
  };
  mesh.userData.agent=a;
  agents.push(a);
  births++;
  return a;
}

function removeAgent(a){
  const i=agents.indexOf(a); if(i<0) return;
  // Corpse returns nutrients/energy to the world.
  const drops = Math.max(1,Math.min(5,Math.round(a.energy/12)+2));
  for(let k=0;k<drops;k++){
    const p=a.mesh.position.clone();
    p.x+=rand(-.7,.7); p.z+=rand(-.7,.7);
    makeFood(p,rand(3,7));
  }
  agentGroup.remove(a.mesh);
  a.mesh.traverse(o=>{
    if(o.geometry) o.geometry.dispose();
    if(o.material) o.material.dispose();
  });
  agents.splice(i,1);
  deaths++;
  if(selectedAgent===a){ selectedAgent=null; document.getElementById('selected').style.display='none'; }
}

function nearestFood(a){
  let best=null, bd=1e9;
  for(const f of food){
    const d=a.mesh.position.distanceToSquared(f.mesh.position);
    if(d<bd){bd=d;best=f;}
  }
  return best ? [best,Math.sqrt(bd)] : [null,999];
}

function nearestAgent(a){
  let best=null,bd=1e9;
  for(const o of agents){
    if(o===a) continue;
    const d=a.mesh.position.distanceToSquared(o.mesh.position);
    if(d<bd){bd=d;best=o;}
  }
  return best ? [best,Math.sqrt(bd)] : [null,999];
}

function localAngle(a, targetPos){
  const dx=targetPos.x-a.mesh.position.x, dz=targetPos.z-a.mesh.position.z;
  const worldAngle=Math.atan2(dx,dz);
  let d=worldAngle-a.heading;
  while(d>Math.PI)d-=Math.PI*2;
  while(d<-Math.PI)d+=Math.PI*2;
  return d/Math.PI;
}

function brainStep(a, inputs){
  const b=a.genome.brain;
  const h=new Array(10).fill(0);
  for(let j=0;j<10;j++){
    let s=b.bias1[j];
    for(let i=0;i<inputs.length;i++) s+=b.weights1[j][i]*inputs[i];
    for(let k=0;k<10;k++) s+=b.weightsR[j][k]*a.hidden[k];
    h[j]=tanh(s);
  }
  a.hidden=h;
  const out=new Array(5).fill(0);
  for(let j=0;j<5;j++){
    let s=b.bias2[j];
    for(let k=0;k<10;k++) s+=b.weights2[j][k]*h[k];
    out[j]=tanh(s);
  }
  return out;
}

function updateAgent(a,dt){
  const g=a.genome.body;
  a.age+=dt;
  a.reproCooldown=Math.max(0,a.reproCooldown-dt);

  const [f,fd]=nearestFood(a);
  const [n,nd]=nearestAgent(a);
  const sense=CONFIG.SENSE_RADIUS*g.sensor;

  const fVisible = f && fd<sense;
  const nVisible = n && nd<sense;

  const fDir = fVisible?localAngle(a,f.mesh.position):a.lastFoodDir*.96;
  const nDir = nVisible?localAngle(a,n.mesh.position):a.lastNeighborDir*.96;
  if(fVisible) a.lastFoodDir=fDir;
  if(nVisible) a.lastNeighborDir=nDir;

  const x=a.mesh.position.x, z=a.mesh.position.z;
  const inWater = ((x+8)**2 + (z-7)**2) < 7.5**2;
  const edge = Math.sqrt(x*x+z*z)/CONFIG.WORLD;

  // Universal sensory channels only. No "goal" input.
  const inputs=[
    a.energy/CONFIG.MAX_ENERGY*2-1,
    clamp(a.age/CONFIG.MAX_AGE,0,1)*2-1,
    fVisible?1-fd/sense:-1,
    fDir,
    nVisible?1-nd/sense:-1,
    nDir,
    nVisible?n.signal:0,
    inWater?1:-1,
    edge,
    a.memory[0],
    Math.sin(worldAge*.15 + a.signalPhase)
  ];

  const out=brainStep(a,inputs);
  // outputs: forward, turn, interaction/eat tendency, signal, reproduction tendency
  const forward=sigmoid(out[0])*g.speed;
  const turn=out[1]*g.turn;
  a.heading+=turn*dt;
  a.mesh.rotation.y=a.heading;

  const vx=Math.sin(a.heading)*forward;
  const vz=Math.cos(a.heading)*forward;
  a.mesh.position.x+=vx*dt;
  a.mesh.position.z+=vz*dt;

  // World boundary is a physical rule, not a behavior.
  const r=Math.hypot(a.mesh.position.x,a.mesh.position.z);
  if(r>CONFIG.WORLD-0.6){
    const s=(CONFIG.WORLD-0.6)/r;
    a.mesh.position.x*=s; a.mesh.position.z*=s;
    a.heading+=Math.PI*rand(.5,1.5);
  }

  a.signal=out[3]*g.voice;

  // Metabolism.
  const moveCost=(Math.abs(forward)/Math.max(.4,g.speed))*CONFIG.MOVE_COST;
  a.energy-=dt*(CONFIG.BASE_METABOLISM*(.8+g.size*.35)+moveCost+(inWater?CONFIG.WATER_DRAIN:0));

  // Interact with food if close. Network controls willingness, but strong hunger can still bias survival.
  if(f && fd<CONFIG.BITE_RADIUS*g.size && out[2]>-.15){
    const gain=f.energy*sunFactor;
    a.energy=clamp(a.energy+gain,0,CONFIG.MAX_ENERGY);
    const idx=food.indexOf(f);
    if(idx>=0) food.splice(idx,1);
    foodGroup.remove(f.mesh);
    f.mesh.geometry.dispose(); f.mesh.material.dispose();
    a.memory[0]=clamp(a.memory[0]*.8+.4,-1,1);
  } else {
    a.memory[0]*=.997;
  }

  // Primitive social memory: remembers recent neighbour signal and proximity.
  a.memory[1]=a.memory[1]*.995 + (nVisible?n.signal*.005:0);
  a.memory[2]=a.memory[2]*.998 + (nVisible?(1-nd/sense)*.002:0);
  a.memory[3]=a.memory[3]*.999 + out[3]*.001;

  // Reproduction is possible, not mandatory. It costs energy.
  if(a.energy>CONFIG.REPRO_MIN_ENERGY && a.reproCooldown<=0 && out[4]>.18 && agents.length<CONFIG.MAX_AGENTS){
    a.energy-=CONFIG.REPRO_COST;
    a.reproCooldown=CONFIG.REPRO_COOLDOWN;
    const childPos=a.mesh.position.clone();
    childPos.x+=rand(-.7,.7); childPos.z+=rand(-.7,.7);
    const child=makeAgent(mutateGenome(a.genome),childPos,a.generation+1);
    if(child){
      child.energy=CONFIG.START_ENERGY*.82;
      child.lineage=a.lineage;
      child.memory=a.memory.map(v=>clamp(v+rand(-.08,.08),-1,1));
      a.children++;
    }
  }

  // Visual "voice": pulse size, not human language.
  const pulse=1 + Math.max(0,a.signal)*0.09*Math.sin(worldAge*8+a.signalPhase);
  a.mesh.scale.setScalar(pulse);

  if(a.energy<=0 || a.age>CONFIG.MAX_AGE*(.75+g.size*.35)) removeAgent(a);
}

function updateFood(dt){
  const targetRate=CONFIG.FOOD_RESPAWN*sunFactor;
  if(food.length<CONFIG.FOOD_MAX && Math.random()<dt*targetRate){
    makeFood();
  }
}

function seed(){
  while(food.length) {
    const f=food.pop(); foodGroup.remove(f.mesh);
    f.mesh.geometry.dispose(); f.mesh.material.dispose();
  }
  while(agents.length) {
    const a=agents.pop(); agentGroup.remove(a.mesh);
  }
  births=0; deaths=0; worldAge=0; nextId=1; selectedAgent=null;
  document.getElementById('selected').style.display='none';
  for(let i=0;i<CONFIG.START_FOOD;i++) makeFood();
  for(let i=0;i<CONFIG.START_AGENTS;i++) makeAgent();
}

function updateHUD(){
  document.getElementById('pop').textContent=agents.length;
  document.getElementById('gen').textContent=agents.length?Math.max(...agents.map(a=>a.generation)):0;
  document.getElementById('births').textContent=births;
  document.getElementById('deaths').textContent=deaths;
  document.getElementById('age').textContent=worldAge.toFixed(1);
  document.getElementById('food').textContent=food.length;

  if(selectedAgent && agents.includes(selectedAgent)){
    const g=selectedAgent.genome.body;
    document.getElementById('selName').textContent=`Criatura #${selectedAgent.id}`;
    document.getElementById('selInfo').textContent=
`Generación: ${selectedAgent.generation}
Linaje: ${selectedAgent.lineage}
Edad: ${selectedAgent.age.toFixed(1)}
Energía: ${selectedAgent.energy.toFixed(1)}
Hijos: ${selectedAgent.children}
Extremidades: ${g.limbCount}
Tamaño: ${g.size.toFixed(2)}
Velocidad genética: ${g.speed.toFixed(2)}
Sensor: ${g.sensor.toFixed(2)}
Señal actual: ${selectedAgent.signal.toFixed(2)}
Memoria social: ${selectedAgent.memory[1].toFixed(2)}`;
  }
}

document.getElementById('pause').onclick=()=>{
  paused=!paused;
  document.getElementById('pause').textContent=paused?'Continuar':'Pausar';
};
document.getElementById('spawn').onclick=()=>makeAgent();
document.getElementById('foodBtn').onclick=()=>{ for(let i=0;i<30;i++) makeFood(); };
document.getElementById('reset').onclick=()=>seed();

const speedEl=document.getElementById('speed');
speedEl.oninput=()=>{timeScale=+speedEl.value;document.getElementById('speedOut').textContent=`${timeScale}×`;};
const mutEl=document.getElementById('mutation');
mutEl.oninput=()=>{mutationRate=+mutEl.value;document.getElementById('mutationOut').textContent=`${Math.round(mutationRate*100)}%`;};
const sunEl=document.getElementById('sun');
sunEl.oninput=()=>{sunFactor=+sunEl.value;document.getElementById('sunOut').textContent=sunFactor.toFixed(2);sun.intensity=1.3*sunFactor;};

const raycaster=new THREE.Raycaster();
const mouse=new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown',e=>{
  if(e.target!==renderer.domElement) return;
  mouse.x=(e.clientX/innerWidth)*2-1;
  mouse.y=-(e.clientY/innerHeight)*2+1;
  raycaster.setFromCamera(mouse,camera);
  const hits=raycaster.intersectObjects(agentGroup.children,true);
  if(!hits.length) return;
  let o=hits[0].object;
  while(o && !o.userData.agent) o=o.parent;
  if(o?.userData.agent){
    selectedAgent=o.userData.agent;
    document.getElementById('selected').style.display='block';
  }
});

window.addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
});

seed();

let last=performance.now();
function loop(now){
  requestAnimationFrame(loop);
  const realDt=Math.min(.04,(now-last)/1000); last=now;
  controls.update();
  if(!paused){
    let scaled=realDt*timeScale;
    // Substeps keep fast-forward stable.
    const steps=Math.max(1,Math.ceil(scaled/.035));
    const dt=scaled/steps;
    for(let s=0;s<steps;s++){
      worldAge+=dt;
      updateFood(dt);
      for(const a of [...agents]) updateAgent(a,dt);
      if(agents.length===0 && food.length>10) makeAgent();
    }
  }
  updateHUD();
  renderer.render(scene,camera);
}
requestAnimationFrame(loop);
