import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.179.1/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.179.1/examples/jsm/controls/OrbitControls.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rand=(a=0,b=1)=>a+Math.random()*(b-a);
const sigmoid=x=>1/(1+Math.exp(-x));
const tanh=Math.tanh;

const CONFIG={
  WORLD:36,
  START_AGENTS:38,
  START_FOOD:175,
  START_MATERIALS:120,
  MAX_AGENTS:280,
  FOOD_MAX:430,
  MATERIAL_MAX:270,
  FOOD_RESPAWN:1.08,
  MATERIAL_RESPAWN:.08,
  BASE_METABOLISM:.19,
  MOVE_COST:.105,
  REPRO_MIN_ENERGY:74,
  REPRO_COST:35,
  REPRO_COOLDOWN:12,
  START_ENERGY:52,
  MAX_ENERGY:100,
  MAX_HEALTH:100,
  WATER_DRAIN:.31,
  MAX_AGE:275,
  SENSE_RADIUS:9.7,
  BITE_RADIUS:.82,
  MEMORY_LIMIT:24,
  SOCIAL_RADIUS:6.5,
  CONTACT_RADIUS:.95,
  MATERIAL_SENSE:7.2,
  MANIP_RADIUS:1.05,
  MAX_STRUCTURES:95,
  ATTACK_COOLDOWN:.8,
  AFFILIATE_COOLDOWN:1.0
};

let mutationRate=.10;
let sunFactor=1;
let timeScale=1;
let paused=false;
let worldAge=0;
let births=0,deaths=0,nextId=1;
let nextMaterialId=1,nextStructureId=1;
let totalAttacks=0,totalAffiliations=0;
let selectedAgent=null;

let audioCtx=null,masterGain=null,audioEnabled=false;
const voiceNodes=new Map();

const app=document.getElementById('app');
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x091016);
scene.fog=new THREE.FogExp2(0x091016,.017);

const camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.1,420);
camera.position.set(24,21,28);

const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;
controls.target.set(0,0,0);
controls.maxPolarAngle=Math.PI*.48;
controls.minDistance=8;
controls.maxDistance=75;

scene.add(new THREE.HemisphereLight(0xaad7ff,0x17301e,.92));
const sun=new THREE.DirectionalLight(0xfff2cf,1.3);
sun.position.set(-12,24,10);
sun.castShadow=true;
sun.shadow.mapSize.set(1024,1024);
sun.shadow.camera.left=-42;sun.shadow.camera.right=42;
sun.shadow.camera.top=42;sun.shadow.camera.bottom=-42;
scene.add(sun);

const ground=new THREE.Mesh(
  new THREE.CircleGeometry(CONFIG.WORLD,96),
  new THREE.MeshStandardMaterial({color:0x203e29,roughness:.95})
);
ground.rotation.x=-Math.PI/2;
ground.receiveShadow=true;
scene.add(ground);

const pond=new THREE.Mesh(
  new THREE.CircleGeometry(7.6,64),
  new THREE.MeshStandardMaterial({color:0x1d6683,transparent:true,opacity:.76,roughness:.25})
);
pond.rotation.x=-Math.PI/2;
pond.position.set(-9,.025,8);
scene.add(pond);

const ring=new THREE.Mesh(
  new THREE.RingGeometry(CONFIG.WORLD,CONFIG.WORLD+.3,96),
  new THREE.MeshBasicMaterial({color:0x4d6a52,side:THREE.DoubleSide})
);
ring.rotation.x=-Math.PI/2;
ring.position.y=.015;
scene.add(ring);

const foodGroup=new THREE.Group();
const agentGroup=new THREE.Group();
const materialGroup=new THREE.Group();
const structureGroup=new THREE.Group();
scene.add(foodGroup,agentGroup,materialGroup,structureGroup);

const food=[];
const agents=[];
const materials=[];
const structures=[];

const MATERIAL_TYPES={
  fiber:{color:0xa4774c,mass:.55,hardness:.18,length:1.35,fertility:.10,energy:.5},
  stone:{color:0x9aa2aa,mass:1.45,hardness:.92,length:.55,fertility:0,energy:0},
  mineral:{color:0xd4c17a,mass:1.05,hardness:.72,length:.72,fertility:0,energy:0},
  biomass:{color:0x62a968,mass:.48,hardness:.10,length:.65,fertility:.85,energy:3.2}
};

function randomGroundPos(){
  const r=Math.sqrt(Math.random())*(CONFIG.WORLD-1.6);
  const a=Math.random()*Math.PI*2;
  return new THREE.Vector3(Math.cos(a)*r,0,Math.sin(a)*r);
}
function inPond(pos){return ((pos.x+9)**2+(pos.z-8)**2)<7.6**2;}

function makeFood(pos=randomGroundPos(),energy=rand(5,10)){
  const mesh=new THREE.Mesh(
    new THREE.IcosahedronGeometry(rand(.12,.22),0),
    new THREE.MeshStandardMaterial({color:0x9fe76e,emissive:0x112208,roughness:.85})
  );
  mesh.position.copy(pos);mesh.position.y=.18;mesh.castShadow=true;
  foodGroup.add(mesh);
  const f={mesh,energy};food.push(f);return f;
}

function makeMaterial(type=null,pos=randomGroundPos()){
  if(materials.length>=CONFIG.MATERIAL_MAX)return null;
  const names=Object.keys(MATERIAL_TYPES);
  type=type||names[(Math.random()*names.length)|0];
  const p=MATERIAL_TYPES[type];
  let geo;
  if(type==='fiber')geo=new THREE.CylinderGeometry(.07,.09,.8,6);
  else if(type==='stone')geo=new THREE.DodecahedronGeometry(.24,0);
  else if(type==='mineral')geo=new THREE.OctahedronGeometry(.25,0);
  else geo=new THREE.IcosahedronGeometry(.23,1);

  const mesh=new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({color:p.color,roughness:type==='mineral'?.45:.88,metalness:type==='mineral'?.15:0})
  );
  mesh.position.copy(pos);mesh.position.y=type==='fiber'?.28:.24;
  if(type==='fiber')mesh.rotation.z=Math.PI/2;
  mesh.castShadow=true;materialGroup.add(mesh);

  const m={id:nextMaterialId++,type,props:{...p},mesh,carriedBy:null,staticTime:0,lastPos:mesh.position.clone()};
  materials.push(m);return m;
}

function randomBrain(ni=31,nh=20,no=15){
  return {
    weights1:Array.from({length:nh},()=>Array.from({length:ni},()=>rand(-1,1))),
    weightsR:Array.from({length:nh},()=>Array.from({length:nh},()=>rand(-.25,.25))),
    bias1:Array.from({length:nh},()=>rand(-.2,.2)),
    weights2:Array.from({length:no},()=>Array.from({length:nh},()=>rand(-1,1))),
    bias2:Array.from({length:no},()=>rand(-.2,.2))
  };
}

function randomGenome(){
  return {
    body:{
      size:rand(.55,1.15),segments:Math.floor(rand(1,4)),segmentStretch:rand(.72,1.28),
      limbPairs:Math.floor(rand(1,4)),limbLength:rand(.35,1),limbThickness:rand(.035,.085),
      speed:rand(1,2.6),turn:rand(.8,2.2),hue:rand(0,1),sensor:rand(.65,1.35),
      eyeCount:Math.floor(rand(1,4)),eyeSpread:rand(.12,.34),voice:rand(.15,1),
      hearing:rand(.65,1.45),pitchBase:rand(170,690),pitchRange:rand(80,540),
      pulseRate:rand(.5,4.5),grip:rand(.45,1.65),reach:rand(.55,1.4)
    },
    temperament:{
      sociability:rand(-1,1),
      aggression:rand(-.7,.8),
      fearfulness:rand(.15,1.15),
      attachment:rand(.2,1.25),
      curiosity:rand(.1,1.3),
      empathy:rand(-.2,1.2),
      impulsivity:rand(.1,1.3),
      plasticity:rand(.0001,.0045)
    },
    brain:randomBrain()
  };
}

function mutateGenome(g){
  const ng=structuredClone(g),m=mutationRate;
  const maybe=(x,s=1)=>Math.random()<m?x+rand(-s,s):x;
  const b=ng.body,t=ng.temperament;

  b.size=clamp(maybe(b.size,.16),.35,1.7);
  b.segments=clamp(Math.round(maybe(b.segments,1.1)),1,7);
  b.segmentStretch=clamp(maybe(b.segmentStretch,.18),.45,1.7);
  b.limbPairs=clamp(Math.round(maybe(b.limbPairs,1)),0,5);
  b.limbLength=clamp(maybe(b.limbLength,.18),.15,1.6);
  b.limbThickness=clamp(maybe(b.limbThickness,.018),.018,.14);
  b.speed=clamp(maybe(b.speed,.35),.4,4.8);
  b.turn=clamp(maybe(b.turn,.3),.3,3.6);
  b.hue=(maybe(b.hue,.12)+1)%1;
  b.sensor=clamp(maybe(b.sensor,.18),.3,2.1);
  b.eyeCount=clamp(Math.round(maybe(b.eyeCount,1)),0,6);
  b.eyeSpread=clamp(maybe(b.eyeSpread,.08),.04,.55);
  b.voice=clamp(maybe(b.voice,.2),0,1.7);
  b.hearing=clamp(maybe(b.hearing,.18),.2,2);
  b.pitchBase=clamp(maybe(b.pitchBase,90),80,1300);
  b.pitchRange=clamp(maybe(b.pitchRange,80),30,900);
  b.pulseRate=clamp(maybe(b.pulseRate,.6),.1,8);
  b.grip=clamp(maybe(b.grip,.22),.2,2.4);
  b.reach=clamp(maybe(b.reach,.18),.3,2.2);

  t.sociability=clamp(maybe(t.sociability,.3),-1.5,1.5);
  t.aggression=clamp(maybe(t.aggression,.3),-1.5,1.5);
  t.fearfulness=clamp(maybe(t.fearfulness,.22),0,2);
  t.attachment=clamp(maybe(t.attachment,.22),0,2);
  t.curiosity=clamp(maybe(t.curiosity,.22),0,2);
  t.empathy=clamp(maybe(t.empathy,.22),-.5,2);
  t.impulsivity=clamp(maybe(t.impulsivity,.22),0,2);
  t.plasticity=clamp(maybe(t.plasticity,.001),0,.012);

  for(const row of ng.brain.weights1)for(let i=0;i<row.length;i++)row[i]=maybe(row[i],.30);
  for(const row of ng.brain.weightsR)for(let i=0;i<row.length;i++)row[i]=maybe(row[i],.15);
  for(let i=0;i<ng.brain.bias1.length;i++)ng.brain.bias1[i]=maybe(ng.brain.bias1[i],.15);
  for(const row of ng.brain.weights2)for(let i=0;i<row.length;i++)row[i]=maybe(row[i],.30);
  for(let i=0;i<ng.brain.bias2.length;i++)ng.brain.bias2[i]=maybe(ng.brain.bias2[i],.15);
  return ng;
}

function createBody(genome){
  const g=genome.body;
  const root=new THREE.Group();
  const baseColor=new THREE.Color().setHSL(g.hue,.58,.52);
  const bodyMat=new THREE.MeshStandardMaterial({color:baseColor,roughness:.72});
  const limbMat=new THREE.MeshStandardMaterial({color:baseColor.clone().offsetHSL(0,-.08,-.08),roughness:.86});
  const eyeMat=new THREE.MeshStandardMaterial({color:0xf4f6f8,roughness:.3});
  const pupilMat=new THREE.MeshStandardMaterial({color:0x111111,roughness:.4});

  for(let s=0;s<g.segments;s++){
    const seg=new THREE.Mesh(new THREE.SphereGeometry(.34*g.size,12,10),bodyMat);
    seg.scale.set(1.15*g.segmentStretch,.8,1);
    seg.position.set(0,.45*g.size,-s*.45*g.size*g.segmentStretch);
    seg.castShadow=true;root.add(seg);
  }
  for(let p=0;p<g.limbPairs;p++){
    const z=-(p/Math.max(1,g.limbPairs-1))*(g.segments-1)*.45*g.size*g.segmentStretch;
    for(const side of [-1,1]){
      const limb=new THREE.Mesh(
        new THREE.CylinderGeometry(g.limbThickness*g.size,g.limbThickness*1.25*g.size,g.limbLength*g.size,6),
        limbMat
      );
      limb.position.set(side*.38*g.size,.22*g.size,z);
      limb.rotation.z=side*Math.PI/2.7;limb.castShadow=true;root.add(limb);
    }
  }
  for(let i=0;i<g.eyeCount;i++){
    const t=g.eyeCount===1?0:(i/(g.eyeCount-1)-.5)*2;
    const eye=new THREE.Mesh(new THREE.SphereGeometry(.065*g.size,8,6),eyeMat);
    eye.position.set(t*g.eyeSpread*g.size,.56*g.size,.31*g.size);
    const pupil=new THREE.Mesh(new THREE.SphereGeometry(.029*g.size,7,5),pupilMat);
    pupil.position.set(0,0,.055*g.size);eye.add(pupil);root.add(eye);
  }

  const signalColors=[0x5ec9ff,0xffd45e,0xff7eb6];
  root.userData.signalNodes=[];
  for(let i=0;i<3;i++){
    const mat=new THREE.MeshStandardMaterial({color:signalColors[i],emissive:signalColors[i],emissiveIntensity:.05,roughness:.4});
    const node=new THREE.Mesh(new THREE.SphereGeometry(.045*g.size,7,5),mat);
    node.position.set((i-1)*.13*g.size,.78*g.size,-.02*g.size);
    root.add(node);root.userData.signalNodes.push(node);
  }

  // Halo shows internal arousal/valence to the observer only; agents cannot read it directly.
  const haloMat=new THREE.MeshBasicMaterial({color:0x7de38f,transparent:true,opacity:.10,side:THREE.DoubleSide});
  const halo=new THREE.Mesh(new THREE.RingGeometry(.48*g.size,.54*g.size,24),haloMat);
  halo.rotation.x=-Math.PI/2;halo.position.y=.03;root.add(halo);
  root.userData.halo=halo;
  return root;
}

function makeAgent(genome=randomGenome(),pos=randomGroundPos(),generation=0,lineage=null){
  if(agents.length>=CONFIG.MAX_AGENTS)return null;
  const mesh=createBody(genome);
  mesh.position.copy(pos);mesh.rotation.y=rand(0,Math.PI*2);
  agentGroup.add(mesh);

  const a={
    id:nextId++,mesh,genome,generation,age:0,energy:CONFIG.START_ENERGY,health:CONFIG.MAX_HEALTH,
    heading:mesh.rotation.y,
    hidden:Array(20).fill(0),
    learnedW2:genome.brain.weights2.map(r=>r.slice()),
    episodic:[0,0,0,0,0,0],
    socialMemory:new Map(),
    affect:{valence:0,arousal:.15,fear:0,anger:0,attachment:0,curiosity:.2},
    reproCooldown:rand(2,8),attackCooldown:0,affiliateCooldown:0,
    signal:[0,0,0],sound:{freq:genome.body.pitchBase,amp:0,pulse:0},
    signalPhase:rand(0,Math.PI*2),
    lastFoodDir:0,lastNeighborDir:0,lastMaterialDir:0,
    children:0,lineage:lineage||Math.random().toString(36).slice(2,7),
    parentId:null,carrying:null,lastEnergy:CONFIG.START_ENERGY,lastHealth:CONFIG.MAX_HEALTH,
    lastReward:0
  };
  mesh.userData.agent=a;
  agents.push(a);births++;return a;
}

function destroyVoice(id){
  const v=voiceNodes.get(id);if(!v)return;
  try{v.osc.stop();}catch{}
  try{v.osc.disconnect();v.gain.disconnect();}catch{}
  voiceNodes.delete(id);
}

function removeAgent(a){
  const i=agents.indexOf(a);if(i<0)return;
  if(a.carrying)dropMaterial(a,true);

  const drops=Math.max(1,Math.min(6,Math.round(a.energy/11)+2));
  for(let k=0;k<drops;k++){
    const p=a.mesh.position.clone();p.x+=rand(-.7,.7);p.z+=rand(-.7,.7);
    makeFood(p,rand(3,7));
  }
  if(Math.random()<.85)makeMaterial('biomass',a.mesh.position.clone());

  destroyVoice(a.id);
  agentGroup.remove(a.mesh);
  a.mesh.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});
  agents.splice(i,1);deaths++;
  if(selectedAgent===a){
    selectedAgent=null;document.getElementById('selected').style.display='none';
  }
}

function nearestFood(a){
  let best=null,bd=1e9;
  for(const f of food){
    const d=a.mesh.position.distanceToSquared(f.mesh.position);
    if(d<bd){bd=d;best=f;}
  }
  return best?[best,Math.sqrt(bd)]:[null,999];
}
function nearestAgent(a){
  let best=null,bd=1e9;
  for(const o of agents){
    if(o===a)continue;
    const d=a.mesh.position.distanceToSquared(o.mesh.position);
    if(d<bd){bd=d;best=o;}
  }
  return best?[best,Math.sqrt(bd)]:[null,999];
}
function nearestMaterial(a){
  let best=null,bd=1e9;
  for(const m of materials){
    if(m.carriedBy||a.carrying===m)continue;
    const d=a.mesh.position.distanceToSquared(m.mesh.position);
    if(d<bd){bd=d;best=m;}
  }
  return best?[best,Math.sqrt(bd)]:[null,999];
}
function nearestStructure(a){
  let best=null,bd=1e9;
  for(const s of structures){
    const d=a.mesh.position.distanceToSquared(s.group.position);
    if(d<bd){bd=d;best=s;}
  }
  return best?[best,Math.sqrt(bd)]:[null,999];
}
function localAngle(a,targetPos){
  const dx=targetPos.x-a.mesh.position.x,dz=targetPos.z-a.mesh.position.z;
  const worldAngle=Math.atan2(dx,dz);
  let d=worldAngle-a.heading;
  while(d>Math.PI)d-=Math.PI*2;
  while(d<-Math.PI)d+=Math.PI*2;
  return d/Math.PI;
}

function brainStep(a,inputs){
  const b=a.genome.brain,nh=b.bias1.length;
  const h=new Array(nh).fill(0);
  for(let j=0;j<nh;j++){
    let s=b.bias1[j];
    for(let i=0;i<inputs.length;i++)s+=b.weights1[j][i]*inputs[i];
    for(let k=0;k<nh;k++)s+=b.weightsR[j][k]*a.hidden[k];
    h[j]=tanh(s);
  }
  a.hidden=h;
  const out=new Array(b.bias2.length).fill(0);
  for(let j=0;j<out.length;j++){
    let s=b.bias2[j];
    for(let k=0;k<nh;k++)s+=a.learnedW2[j][k]*h[k];
    out[j]=tanh(s);
  }
  return out;
}

function getMemory(a,n){
  let mem=a.socialMemory.get(n.id);
  if(!mem){
    mem={
      affinity:0,threat:0,trust:0,lastSeen:worldAge,meetings:0,
      helped:0,harmed:0,received:0,attacked:0,
      signal:[0,0,0],pitch:0
    };
    a.socialMemory.set(n.id,mem);
  }
  return mem;
}

function trimMemory(a){
  if(a.socialMemory.size<=CONFIG.MEMORY_LIMIT)return;
  let worstId=null,score=Infinity;
  for(const [id,m] of a.socialMemory){
    const salience=Math.abs(m.affinity)+Math.abs(m.threat)+m.meetings*.01-(worldAge-m.lastSeen)*.001;
    if(salience<score){score=salience;worstId=id;}
  }
  if(worstId!==null)a.socialMemory.delete(worstId);
}

function updateRelationshipMemory(a,n,proximity,dt){
  const mem=getMemory(a,n);
  mem.lastSeen=worldAge;
  mem.meetings+=dt;
  for(let i=0;i<3;i++)mem.signal[i]=mem.signal[i]*.96+n.signal[i]*.04;
  mem.pitch=mem.pitch*.96+(n.sound.freq/1300)*.04;

  const t=a.genome.temperament;
  mem.affinity=clamp(mem.affinity + proximity*.0015*dt*t.attachment - mem.threat*.0003*dt,-1,1);
  mem.trust=clamp(mem.trust + proximity*.001*dt - mem.threat*.0004*dt,-1,1);

  trimMemory(a);
  return mem;
}

function affectLabel(a){
  const e=a.affect;
  if(e.fear>.66)return 'temeroso/evitativo';
  if(e.anger>.66&&e.arousal>.55)return 'hostil/exaltado';
  if(e.attachment>.62&&e.valence>.2)return 'vinculado/afiliativo';
  if(e.curiosity>.66&&e.fear<.4)return 'explorador/curioso';
  if(e.valence>.45&&e.arousal<.55)return 'positivo/tranquilo';
  if(e.valence<-.45)return 'aversivo/tenso';
  return 'neutral/variable';
}

function updateAffect(a,n,mem,dt){
  const t=a.genome.temperament;
  const hunger=1-a.energy/CONFIG.MAX_ENERGY;
  const injury=1-a.health/CONFIG.MAX_HEALTH;

  a.affect.valence += dt*((a.energy/CONFIG.MAX_ENERGY-.5)*.08 - injury*.12 - a.affect.valence*.12);
  a.affect.arousal += dt*(hunger*.08 + injury*.18 + a.affect.fear*.13 + a.affect.anger*.15 - a.affect.arousal*.16);
  a.affect.fear += dt*(injury*.10 - a.affect.fear*.08);
  a.affect.anger += dt*(-a.affect.anger*.07);
  a.affect.curiosity += dt*((.25+t.curiosity*.25)-a.affect.curiosity)*.05;
  a.affect.attachment += dt*(-a.affect.attachment*.025);

  if(n&&mem){
    a.affect.fear += dt*Math.max(0,mem.threat)*.12*t.fearfulness;
    a.affect.anger += dt*Math.max(0,mem.threat)*.10*(.5+t.aggression);
    a.affect.attachment += dt*Math.max(0,mem.affinity)*.08*t.attachment;
    a.affect.valence += dt*(mem.affinity-mem.threat)*.04;
  }

  for(const k of Object.keys(a.affect))a.affect[k]=clamp(a.affect[k],k==='valence'?-1:0,1);
}

function applyPlasticity(a,reward){
  const rate=a.genome.temperament.plasticity;
  if(rate<=0)return;
  const r=clamp(reward,-1,1);
  for(let j=0;j<a.learnedW2.length;j++){
    for(let k=0;k<a.hidden.length;k++){
      a.learnedW2[j][k]=clamp(a.learnedW2[j][k]+rate*r*a.hidden[k]*.08,-3,3);
    }
  }
}

function socialAffiliation(a,n){
  if(a.affiliateCooldown>0||n.health<=0)return;
  a.affiliateCooldown=CONFIG.AFFILIATE_COOLDOWN;
  totalAffiliations++;

  const am=getMemory(a,n),nm=getMemory(n,a);
  const empathy=clamp((a.genome.temperament.empathy+1)/2,0,1);
  const attachment=a.genome.temperament.attachment;

  am.affinity=clamp(am.affinity+.045*(.5+attachment),-1,1);
  am.trust=clamp(am.trust+.035,-1,1);
  am.helped+=1;

  nm.affinity=clamp(nm.affinity+.03*(.5+empathy),-1,1);
  nm.trust=clamp(nm.trust+.025,-1,1);
  nm.received+=1;

  a.affect.valence=clamp(a.affect.valence+.06, -1,1);
  a.affect.attachment=clamp(a.affect.attachment+.04,0,1);
  n.affect.valence=clamp(n.affect.valence+.035,-1,1);

  // Sharing is an affordance, not a social rule: highly energetic agents may transfer a little energy.
  if(a.energy>68 && n.energy<45 && empathy>.45){
    const gift=Math.min(3.5,a.energy-65);
    if(gift>0){a.energy-=gift;n.energy=clamp(n.energy+gift,0,CONFIG.MAX_ENERGY);}
  }
}

function socialAttack(a,n,attackIntent){
  if(a.attackCooldown>0||n.health<=0)return;
  a.attackCooldown=CONFIG.ATTACK_COOLDOWN;
  totalAttacks++;

  const t=a.genome.temperament;
  const weapon=a.carrying?a.carrying.props:null;
  const weaponFactor=weapon?1+weapon.hardness*.7+weapon.length*.15:1;
  const impulse=.65+t.aggression*.3+a.affect.anger*.45+a.affect.arousal*.25;
  const damage=clamp((3.2+gPower(a)*2.1)*weaponFactor*Math.max(.35,impulse)*attackIntent,1.2,14);

  n.health=clamp(n.health-damage,0,CONFIG.MAX_HEALTH);
  a.energy=Math.max(0,a.energy-1.1*weaponFactor);
  n.affect.fear=clamp(n.affect.fear+.16*n.genome.temperament.fearfulness,0,1);
  n.affect.anger=clamp(n.affect.anger+.12*(.5+n.genome.temperament.aggression),0,1);
  n.affect.valence=clamp(n.affect.valence-.13,-1,1);
  a.affect.arousal=clamp(a.affect.arousal+.08,0,1);

  const nm=getMemory(n,a);
  nm.threat=clamp(nm.threat+.15+damage/100,-1,1);
  nm.affinity=clamp(nm.affinity-.10-damage/140,-1,1);
  nm.attacked+=1;

  const am=getMemory(a,n);
  am.harmed+=1;
  am.threat=clamp(am.threat+.015,-1,1);

  if(n.health<=0)removeAgent(n);
}
function gPower(a){
  const b=a.genome.body;
  return clamp((b.size*.55+b.grip*.25+b.limbPairs*.06),.3,2);
}

function pickUpMaterial(a,m){
  if(!m||a.carrying||m.carriedBy)return;
  if(m.props.mass>a.genome.body.grip*1.25)return;
  a.carrying=m;m.carriedBy=a.id;
}
function dropMaterial(a,forced=false){
  const m=a.carrying;if(!m)return;
  m.carriedBy=null;
  m.mesh.parent?.remove(m.mesh);materialGroup.add(m.mesh);
  m.mesh.position.copy(a.mesh.position);
  const forward=new THREE.Vector3(Math.sin(a.heading),0,Math.cos(a.heading));
  m.mesh.position.addScaledVector(forward,.6*a.genome.body.reach);
  m.mesh.position.y=m.type==='fiber'?.28:.24;
  a.carrying=null;m.staticTime=forced?2:0;
}
function updateCarriedMaterial(a){
  const m=a.carrying;if(!m)return;
  if(m.mesh.parent!==a.mesh){
    m.mesh.parent?.remove(m.mesh);a.mesh.add(m.mesh);
  }
  m.mesh.position.set(0,.42*a.genome.body.size,.62*a.genome.body.size*a.genome.body.reach);
  m.mesh.rotation.set(0,0,m.type==='fiber'?Math.PI/2:0);
}

function maybeCreateStructure(dt){
  if(structures.length>=CONFIG.MAX_STRUCTURES)return;
  for(const m of materials){
    if(m.carriedBy)continue;
    const moved=m.mesh.position.distanceTo(m.lastPos);
    m.staticTime=moved<.015?m.staticTime+dt:0;
    m.lastPos.copy(m.mesh.position);
  }
  const candidates=materials.filter(m=>!m.carriedBy&&m.staticTime>2.2);
  for(const seed of candidates){
    const cluster=candidates.filter(m=>m.mesh.position.distanceTo(seed.mesh.position)<.9);
    if(cluster.length<3)continue;
    const chosen=cluster.slice(0,Math.min(6,cluster.length));
    const center=new THREE.Vector3();
    chosen.forEach(m=>center.add(m.mesh.position));center.multiplyScalar(1/chosen.length);

    const totalMass=chosen.reduce((s,m)=>s+m.props.mass,0);
    const hardness=chosen.reduce((s,m)=>s+m.props.hardness,0)/chosen.length;
    const fertility=chosen.reduce((s,m)=>s+m.props.fertility,0);
    const length=chosen.reduce((s,m)=>s+m.props.length,0);

    const group=new THREE.Group();group.position.copy(center);structureGroup.add(group);
    for(const m of chosen){
      materialGroup.remove(m.mesh);
      m.mesh.position.sub(center);group.add(m.mesh);
      const idx=materials.indexOf(m);if(idx>=0)materials.splice(idx,1);
    }
    structures.push({id:nextStructureId++,group,parts:chosen.map(m=>m.type),totalMass,hardness,fertility,length,age:0});
    break;
  }
}

function structureEffects(dt){
  for(const s of structures){
    s.age+=dt;
    if(s.fertility>1&&food.length<CONFIG.FOOD_MAX&&Math.random()<dt*.025*sunFactor*s.fertility){
      const p=s.group.position.clone();p.x+=rand(-1.2,1.2);p.z+=rand(-1.2,1.2);
      makeFood(p,rand(4,8));
    }
  }
}
function structureShelterFactor(a){
  let factor=1;
  for(const s of structures){
    const d=a.mesh.position.distanceTo(s.group.position);
    if(d<1.8&&s.hardness>.5&&s.totalMass>2.5)factor*=.88;
  }
  return factor;
}

function updateAgent(a,dt){
  if(!agents.includes(a))return;
  const g=a.genome.body,t=a.genome.temperament;
  a.age+=dt;
  a.reproCooldown=Math.max(0,a.reproCooldown-dt);
  a.attackCooldown=Math.max(0,a.attackCooldown-dt);
  a.affiliateCooldown=Math.max(0,a.affiliateCooldown-dt);

  const [f,fd]=nearestFood(a);
  const [n,nd]=nearestAgent(a);
  const [m,md]=nearestMaterial(a);
  const [st,sd]=nearestStructure(a);

  const sense=CONFIG.SENSE_RADIUS*g.sensor;
  const fVisible=f&&fd<sense;
  const nVisible=n&&nd<sense;
  const mVisible=m&&md<CONFIG.MATERIAL_SENSE*g.sensor;
  const sVisible=st&&sd<sense;

  const fDir=fVisible?localAngle(a,f.mesh.position):a.lastFoodDir*.96;
  const nDir=nVisible?localAngle(a,n.mesh.position):a.lastNeighborDir*.96;
  const mDir=mVisible?localAngle(a,m.mesh.position):a.lastMaterialDir*.96;
  if(fVisible)a.lastFoodDir=fDir;
  if(nVisible)a.lastNeighborDir=nDir;
  if(mVisible)a.lastMaterialDir=mDir;

  const x=a.mesh.position.x,z=a.mesh.position.z;
  const water=inPond(a.mesh.position);
  const edge=Math.hypot(x,z)/CONFIG.WORLD;

  let mem=null,neighborSignals=[0,0,0],heardPitch=0,heardAmp=0;
  if(nVisible){
    mem=updateRelationshipMemory(a,n,1-nd/sense,dt);
    neighborSignals=n.signal;
    const attenuation=clamp(1-nd/(sense*g.hearing),0,1);
    heardPitch=(n.sound.freq/1300)*attenuation;
    heardAmp=n.sound.amp*attenuation;
  }
  updateAffect(a,nVisible?n:null,mem,dt);

  const materialHard=mVisible?m.props.hardness:0;
  const materialMass=mVisible?clamp(m.props.mass/1.5,0,1):0;
  const structureNear=sVisible?1-sd/sense:-1;

  // 31 sensory/internal channels.
  const inputs=[
    a.energy/CONFIG.MAX_ENERGY*2-1,
    a.health/CONFIG.MAX_HEALTH*2-1,
    clamp(a.age/CONFIG.MAX_AGE,0,1)*2-1,
    fVisible?1-fd/sense:-1,fDir,
    nVisible?1-nd/sense:-1,nDir,
    neighborSignals[0],neighborSignals[1],neighborSignals[2],
    heardPitch,heardAmp,
    mem?mem.affinity:0,mem?mem.threat:0,mem?mem.trust:0,
    water?1:-1,edge,
    mVisible?1-md/(CONFIG.MATERIAL_SENSE*g.sensor):-1,mDir,materialHard,materialMass,
    a.carrying?1:-1,structureNear,
    a.affect.valence,a.affect.arousal,a.affect.fear,a.affect.anger,a.affect.attachment,a.affect.curiosity,
    a.lastReward,
    Math.sin(worldAge*.15+a.signalPhase)
  ];

  const out=brainStep(a,inputs);
  // outputs:
  // 0 move,1 turn,2 eat,3..5 sound,6 reproduce,7 approach/avoid,
  // 8 manipulate,9 structures,10 sound pulse,11 affiliate,12 attack,
  // 13 share/assist bias,14 inhibition/planning
  let forward=sigmoid(out[0])*g.speed;
  let turn=out[1]*g.turn;

  if(nVisible&&nd<CONFIG.SOCIAL_RADIUS){
    const attraction=
      out[7]*(1-a.affect.fear*.7) +
      (mem?mem.affinity*.28-mem.threat*.35:0) +
      t.sociability*.08;
    turn+=attraction*nDir*.36;
    if(a.affect.fear>.55)turn-=nDir*a.affect.fear*.38;
  }
  if(sVisible)turn+=out[9]*localAngle(a,st.group.position)*.16;

  a.heading+=turn*dt;
  a.mesh.rotation.y=a.heading;
  let loadPenalty=1;
  if(a.carrying)loadPenalty=clamp(1-a.carrying.props.mass/(g.grip*4),.35,1);

  const caution=clamp(1-a.affect.fear*.32+out[14]*.08,.55,1.15);
  a.mesh.position.x+=Math.sin(a.heading)*forward*loadPenalty*caution*dt;
  a.mesh.position.z+=Math.cos(a.heading)*forward*loadPenalty*caution*dt;

  const r=Math.hypot(a.mesh.position.x,a.mesh.position.z);
  if(r>CONFIG.WORLD-.6){
    const s=(CONFIG.WORLD-.6)/r;a.mesh.position.x*=s;a.mesh.position.z*=s;
    a.heading+=Math.PI*rand(.5,1.5);
  }

  for(let i=0;i<3;i++)a.signal[i]=out[3+i]*g.voice;
  const pulse=(Math.sin(worldAge*g.pulseRate*2*Math.PI+a.signalPhase)+1)/2;
  a.sound.freq=clamp(g.pitchBase+a.signal[0]*g.pitchRange*(1+a.affect.arousal*.35),70,1500);
  a.sound.amp=clamp(Math.abs(a.signal[1])*(.2+.8*pulse)*(.65+a.affect.arousal*.6),0,1);
  a.sound.pulse=clamp(sigmoid(out[10])*pulse,0,1);

  const nodes=a.mesh.userData.signalNodes||[];
  for(let i=0;i<nodes.length;i++){
    nodes[i].material.emissiveIntensity=.05+Math.abs(a.signal[i])*1.8;
    nodes[i].scale.setScalar(1+Math.abs(a.signal[i])*.9);
  }

  const halo=a.mesh.userData.halo;
  if(halo){
    const c=new THREE.Color();
    if(a.affect.valence>=0)c.setHSL(.33,.65,.48);
    else c.setHSL(.0,.68,.5);
    halo.material.color.copy(c);
    halo.material.opacity=.05+.22*a.affect.arousal;
    halo.scale.setScalar(1+a.affect.attachment*.25+a.affect.fear*.12);
  }

  const shelter=structureShelterFactor(a);
  const moveCost=(Math.abs(forward)/Math.max(.4,g.speed))*CONFIG.MOVE_COST;
  const carryCost=a.carrying?a.carrying.props.mass*.045:0;
  a.energy-=dt*(CONFIG.BASE_METABOLISM*(.8+g.size*.35+g.segments*.035)+moveCost+carryCost+(water?CONFIG.WATER_DRAIN:0))*shelter;

  // Slow healing if safe and well-fed.
  if(a.energy>58&&a.affect.arousal<.45&&a.affect.fear<.35){
    a.health=clamp(a.health+dt*.18,0,CONFIG.MAX_HEALTH);
    a.energy=Math.max(0,a.energy-dt*.045);
  }

  if(f&&fd<CONFIG.BITE_RADIUS*g.size&&out[2]>-.15){
    a.energy=clamp(a.energy+f.energy*sunFactor,0,CONFIG.MAX_ENERGY);
    const idx=food.indexOf(f);if(idx>=0)food.splice(idx,1);
    foodGroup.remove(f.mesh);f.mesh.geometry.dispose();f.mesh.material.dispose();
    a.affect.valence=clamp(a.affect.valence+.05,-1,1);
  }

  // Social interaction can become affiliative, aggressive, avoidant, or neutral.
  if(nVisible&&nd<CONFIG.CONTACT_RADIUS*g.size&&agents.includes(n)){
    const inhibition=sigmoid(out[14])* (1.15-t.impulsivity*.2);
    const affiliateIntent=sigmoid(out[11]+t.sociability*.25+t.attachment*.22+a.affect.attachment*.25-a.affect.fear*.35);
    const attackIntent=sigmoid(out[12]+t.aggression*.35+a.affect.anger*.45+a.affect.arousal*.18-(mem?mem.affinity*.35:0)-inhibition*.35);
    const assistIntent=sigmoid(out[13]+t.empathy*.3+(mem?mem.affinity*.25:0));

    if(attackIntent>.68&&attackIntent>affiliateIntent+.08){
      socialAttack(a,n,attackIntent);
    }else if(affiliateIntent>.62){
      socialAffiliation(a,n);
      if(assistIntent>.68&&a.energy>70&&n.energy<45){
        const gift=Math.min(4,a.energy-68);
        if(gift>0){a.energy-=gift;n.energy=clamp(n.energy+gift,0,CONFIG.MAX_ENERGY);}
      }
    }
  }

  const manipRadius=CONFIG.MANIP_RADIUS*g.reach;
  if(out[8]>.28){
    if(!a.carrying&&m&&md<manipRadius)pickUpMaterial(a,m);
    else if(!a.carrying&&m&&md<manipRadius*1.4){
      const pushStrength=g.grip/(m.props.mass+.2);
      const dir=new THREE.Vector3(Math.sin(a.heading),0,Math.cos(a.heading));
      m.mesh.position.addScaledVector(dir,dt*.7*pushStrength);
    }
  }else if(out[8]<-.28&&a.carrying)dropMaterial(a);
  updateCarriedMaterial(a);

  if(a.carrying){
    const tool=a.carrying.props;
    const effectiveReach=g.reach*(1+tool.length*.28);
    if(a.carrying.type==='biomass'&&out[2]>.55&&a.energy<90){
      a.energy=clamp(a.energy+a.carrying.props.energy*2,0,CONFIG.MAX_ENERGY);
      const mm=a.carrying;a.carrying=null;a.mesh.remove(mm.mesh);
      mm.mesh.geometry.dispose();mm.mesh.material.dispose();
      const idx=materials.indexOf(mm);if(idx>=0)materials.splice(idx,1);
    }
    if(tool.hardness>.65&&m&&md<effectiveReach*1.5&&out[8]>.5){
      const dir=new THREE.Vector3(Math.sin(a.heading),0,Math.cos(a.heading));
      m.mesh.position.addScaledVector(dir,dt*.9*tool.hardness);
    }
  }

  if(a.energy>CONFIG.REPRO_MIN_ENERGY&&a.reproCooldown<=0&&out[6]>.18&&agents.length<CONFIG.MAX_AGENTS){
    a.energy-=CONFIG.REPRO_COST;a.reproCooldown=CONFIG.REPRO_COOLDOWN;
    const childPos=a.mesh.position.clone();childPos.x+=rand(-.7,.7);childPos.z+=rand(-.7,.7);
    const child=makeAgent(mutateGenome(a.genome),childPos,a.generation+1,a.lineage);
    if(child){
      child.energy=CONFIG.START_ENERGY*.82;child.parentId=a.id;
      child.affect.valence=clamp(a.affect.valence*.08+rand(-.05,.05),-1,1);
      child.affect.curiosity=clamp(child.genome.temperament.curiosity*.35,0,1);
      a.children++;
    }
  }

  // Lifetime learning: energy/health/social outcomes reinforce recent network activity.
  const reward=
    (a.energy-a.lastEnergy)*.08 +
    (a.health-a.lastHealth)*.12 +
    a.affect.valence*.015 -
    a.affect.fear*.01;
  a.lastReward=clamp(reward,-1,1);
  applyPlasticity(a,a.lastReward);
  a.lastEnergy=a.energy;a.lastHealth=a.health;

  if(a.energy<=0||a.health<=0||a.age>CONFIG.MAX_AGE*(.75+g.size*.35))removeAgent(a);
}

function updateFood(dt){
  if(food.length<CONFIG.FOOD_MAX&&Math.random()<dt*CONFIG.FOOD_RESPAWN*sunFactor)makeFood();
  for(const m of materials){
    if(m.carriedBy||m.type!=='biomass')continue;
    if(inPond(m.mesh.position)&&Math.random()<dt*.014*sunFactor*m.props.fertility){
      const p=m.mesh.position.clone();p.x+=rand(-.55,.55);p.z+=rand(-.55,.55);
      makeFood(p,rand(4,7));
    }
  }
}
function updateMaterials(dt){
  if(materials.length<CONFIG.MATERIAL_MAX&&Math.random()<dt*CONFIG.MATERIAL_RESPAWN)makeMaterial();
  maybeCreateStructure(dt);structureEffects(dt);
}

function initAudio(){
  if(audioCtx)return;
  audioCtx=new (window.AudioContext||window.webkitAudioContext)();
  masterGain=audioCtx.createGain();masterGain.gain.value=.10;masterGain.connect(audioCtx.destination);
}
function ensureVoice(a){
  if(!audioCtx||!audioEnabled)return null;
  let v=voiceNodes.get(a.id);if(v)return v;
  const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();
  osc.type='sine';gain.gain.value=0;osc.connect(gain);gain.connect(masterGain);osc.start();
  v={osc,gain};voiceNodes.set(a.id,v);return v;
}
function updateAudio(){
  if(!audioEnabled||!audioCtx)return;
  const audible=[...agents]
    .sort((a,b)=>a.mesh.position.distanceToSquared(camera.position)-b.mesh.position.distanceToSquared(camera.position))
    .slice(0,7);
  const ids=new Set(audible.map(a=>a.id));
  for(const a of audible){
    const v=ensureVoice(a);if(!v)continue;
    const dist=a.mesh.position.distanceTo(camera.position);
    const att=clamp(1-dist/55,0,1);
    const targetGain=a.sound.amp*a.sound.pulse*att*.05;
    const now=audioCtx.currentTime;
    v.osc.frequency.cancelScheduledValues(now);
    v.osc.frequency.linearRampToValueAtTime(a.sound.freq,now+.05);
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.linearRampToValueAtTime(targetGain,now+.05);
  }
  for(const [id,v] of voiceNodes){
    if(!ids.has(id))v.gain.gain.setTargetAtTime(0,audioCtx.currentTime,.03);
  }
}

function countBonds(){
  let positive=0,rivals=0;
  for(const a of agents){
    for(const m of a.socialMemory.values()){
      if(m.affinity>.35&&m.trust>.1)positive++;
      if(m.threat>.35||m.affinity<-.4)rivals++;
    }
  }
  return [Math.floor(positive/2),Math.floor(rivals/2)];
}

function updateHUD(){
  const [positive,rivals]=countBonds();
  document.getElementById('pop').textContent=agents.length;
  document.getElementById('gen').textContent=agents.length?Math.max(...agents.map(a=>a.generation)):0;
  document.getElementById('births').textContent=births;
  document.getElementById('deaths').textContent=deaths;
  document.getElementById('age').textContent=worldAge.toFixed(1);
  document.getElementById('food').textContent=food.length;
  document.getElementById('materials').textContent=materials.length;
  document.getElementById('structures').textContent=structures.length;
  document.getElementById('positiveBonds').textContent=positive;
  document.getElementById('rivalries').textContent=rivals;
  document.getElementById('attacks').textContent=totalAttacks;
  document.getElementById('affiliations').textContent=totalAffiliations;

  if(selectedAgent&&agents.includes(selectedAgent)){
    const a=selectedAgent,g=a.genome.body,t=a.genome.temperament,e=a.affect;
    const memories=[...a.socialMemory.entries()]
      .sort((x,y)=>(Math.abs(y[1].affinity)+Math.abs(y[1].threat))-(Math.abs(x[1].affinity)+Math.abs(x[1].threat)))
      .slice(0,5)
      .map(([id,m])=>`#${id}: afinidad ${m.affinity.toFixed(2)}, amenaza ${m.threat.toFixed(2)}, confianza ${m.trust.toFixed(2)}`)
      .join('\n')||'Sin relaciones destacadas todavía';

    document.getElementById('selName').textContent=`Criatura #${a.id} — ${affectLabel(a)}`;
    document.getElementById('selInfo').textContent=
`Generación: ${a.generation}
Linaje: ${a.lineage}
Padre: ${a.parentId??'—'}
Edad: ${a.age.toFixed(1)}
Energía: ${a.energy.toFixed(1)}
Salud: ${a.health.toFixed(1)}
Hijos: ${a.children}

ESTADO INTERNO
Valencia: ${e.valence.toFixed(2)}
Activación: ${e.arousal.toFixed(2)}
Miedo: ${e.fear.toFixed(2)}
Ira: ${e.anger.toFixed(2)}
Apego: ${e.attachment.toFixed(2)}
Curiosidad: ${e.curiosity.toFixed(2)}

TEMPERAMENTO HEREDABLE
Sociabilidad: ${t.sociability.toFixed(2)}
Agresividad: ${t.aggression.toFixed(2)}
Temerosidad: ${t.fearfulness.toFixed(2)}
Apego: ${t.attachment.toFixed(2)}
Curiosidad: ${t.curiosity.toFixed(2)}
Empatía: ${t.empathy.toFixed(2)}
Impulsividad: ${t.impulsivity.toFixed(2)}
Plasticidad: ${t.plasticity.toFixed(4)}

SONIDO
Frecuencia: ${Math.round(a.sound.freq)} Hz
Amplitud: ${a.sound.amp.toFixed(2)}
Pulso: ${a.sound.pulse.toFixed(2)}

RELACIONES DESTACADAS
${memories}`;
  }
}

function seed(){
  while(food.length){
    const f=food.pop();foodGroup.remove(f.mesh);f.mesh.geometry.dispose();f.mesh.material.dispose();
  }
  while(materials.length){
    const m=materials.pop();m.mesh.parent?.remove(m.mesh);m.mesh.geometry.dispose();m.mesh.material.dispose();
  }
  while(structures.length){
    const s=structures.pop();structureGroup.remove(s.group);
    s.group.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});
  }
  while(agents.length){
    const a=agents.pop();destroyVoice(a.id);agentGroup.remove(a.mesh);
  }

  births=0;deaths=0;totalAttacks=0;totalAffiliations=0;worldAge=0;
  nextId=1;nextMaterialId=1;nextStructureId=1;selectedAgent=null;
  document.getElementById('selected').style.display='none';

  for(let i=0;i<CONFIG.START_FOOD;i++)makeFood();
  for(let i=0;i<CONFIG.START_MATERIALS;i++)makeMaterial();
  for(let i=0;i<CONFIG.START_AGENTS;i++)makeAgent();
}

document.getElementById('pause').onclick=()=>{
  paused=!paused;document.getElementById('pause').textContent=paused?'Continuar':'Pausar';
};
document.getElementById('sound').onclick=async()=>{
  initAudio();if(audioCtx.state==='suspended')await audioCtx.resume();
  audioEnabled=!audioEnabled;
  const b=document.getElementById('sound');
  b.textContent=audioEnabled?'Silenciar sonido':'Activar sonido';
  b.classList.toggle('soundOn',audioEnabled);
  if(!audioEnabled)for(const [,v] of voiceNodes)v.gain.gain.setTargetAtTime(0,audioCtx.currentTime,.03);
};
document.getElementById('spawn').onclick=()=>makeAgent();
document.getElementById('foodBtn').onclick=()=>{for(let i=0;i<30;i++)makeFood();};
document.getElementById('matBtn').onclick=()=>{for(let i=0;i<24;i++)makeMaterial();};
document.getElementById('reset').onclick=()=>seed();

const speedEl=document.getElementById('speed');
speedEl.oninput=()=>{timeScale=+speedEl.value;document.getElementById('speedOut').textContent=`${timeScale}×`;};
const mutEl=document.getElementById('mutation');
mutEl.oninput=()=>{mutationRate=+mutEl.value;document.getElementById('mutationOut').textContent=`${Math.round(mutationRate*100)}%`;};
const sunEl=document.getElementById('sun');
sunEl.oninput=()=>{sunFactor=+sunEl.value;document.getElementById('sunOut').textContent=sunFactor.toFixed(2);sun.intensity=1.3*sunFactor;};

const raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown',e=>{
  if(e.target!==renderer.domElement)return;
  mouse.x=(e.clientX/innerWidth)*2-1;mouse.y=-(e.clientY/innerHeight)*2+1;
  raycaster.setFromCamera(mouse,camera);
  const hits=raycaster.intersectObjects(agentGroup.children,true);if(!hits.length)return;
  let o=hits[0].object;
  while(o&&!o.userData.agent)o=o.parent;
  if(o?.userData.agent){
    selectedAgent=o.userData.agent;document.getElementById('selected').style.display='block';
  }
});

window.addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);
});

seed();

let last=performance.now();
function loop(now){
  requestAnimationFrame(loop);
  const realDt=Math.min(.04,(now-last)/1000);last=now;
  controls.update();

  if(!paused){
    const scaled=realDt*timeScale;
    const steps=Math.max(1,Math.ceil(scaled/.035));
    const dt=scaled/steps;
    for(let s=0;s<steps;s++){
      worldAge+=dt;
      updateFood(dt);updateMaterials(dt);
      for(const a of [...agents])updateAgent(a,dt);
      if(agents.length===0&&food.length>10)makeAgent();
    }
  }
  updateAudio();updateHUD();renderer.render(scene,camera);
}
requestAnimationFrame(loop);
