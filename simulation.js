import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.179.1/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.179.1/examples/jsm/controls/OrbitControls.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rand=(a=0,b=1)=>a+Math.random()*(b-a);
const sigmoid=x=>1/(1+Math.exp(-x));
const tanh=Math.tanh;

const MODE_NAMES=['inercia','comida','ser cercano','material','estructura','recuerdo','zona nueva','evitación'];
const MODE_COUNT=8;

const CONFIG={
  WORLD:36, START_AGENTS:38, START_FOOD:180, START_MATERIALS:120,
  MAX_AGENTS:280, FOOD_MAX:440, MATERIAL_MAX:275, MAX_STRUCTURES:100,
  FOOD_RESPAWN:1.10, MATERIAL_RESPAWN:.08,
  BASE_METABOLISM:.185, MOVE_COST:.10, WATER_DRAIN:.31,
  START_ENERGY:54, MAX_ENERGY:100, MAX_HEALTH:100, MAX_AGE:285,
  REPRO_MIN_ENERGY:75, REPRO_COST:35, REPRO_COOLDOWN:12,
  SENSE_RADIUS:10.2, SOCIAL_RADIUS:6.7, CONTACT_RADIUS:.95,
  MATERIAL_SENSE:7.5, MANIP_RADIUS:1.05,
  MEMORY_LIMIT:26, SPATIAL_MEMORY_LIMIT:28,
  CELL_SIZE:3.0, DECISION_MIN:.45, DECISION_MAX:1.35,
  ATTACK_COOLDOWN:.8, AFFILIATE_COOLDOWN:1.0
};

let mutationRate=.10, sunFactor=1, timeScale=1, paused=false, worldAge=0;
let births=0,deaths=0,nextId=1,nextMaterialId=1,nextStructureId=1;
let selectedAgent=null;

let audioCtx=null,masterGain=null,audioEnabled=false,masterVolume=.18;

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
ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);

const pond=new THREE.Mesh(
  new THREE.CircleGeometry(7.6,64),
  new THREE.MeshStandardMaterial({color:0x1d6683,transparent:true,opacity:.76,roughness:.25})
);
pond.rotation.x=-Math.PI/2;pond.position.set(-9,.025,8);scene.add(pond);

const ring=new THREE.Mesh(
  new THREE.RingGeometry(CONFIG.WORLD,CONFIG.WORLD+.3,96),
  new THREE.MeshBasicMaterial({color:0x4d6a52,side:THREE.DoubleSide})
);
ring.rotation.x=-Math.PI/2;ring.position.y=.015;scene.add(ring);

const foodGroup=new THREE.Group(),agentGroup=new THREE.Group(),materialGroup=new THREE.Group(),structureGroup=new THREE.Group();
scene.add(foodGroup,agentGroup,materialGroup,structureGroup);

const food=[],agents=[],materials=[],structures=[];

const MATERIAL_TYPES={
  fiber:{color:0xa4774c,mass:.55,hardness:.18,length:1.35,fertility:.10,energy:.5},
  stone:{color:0x9aa2aa,mass:1.45,hardness:.92,length:.55,fertility:0,energy:0},
  mineral:{color:0xd4c17a,mass:1.05,hardness:.72,length:.72,fertility:0,energy:0},
  biomass:{color:0x62a968,mass:.48,hardness:.10,length:.65,fertility:.85,energy:3.2}
};

function randomGroundPos(radius=CONFIG.WORLD-1.6){
  const r=Math.sqrt(Math.random())*radius,a=Math.random()*Math.PI*2;
  return new THREE.Vector3(Math.cos(a)*r,0,Math.sin(a)*r);
}
function inPond(pos){return ((pos.x+9)**2+(pos.z-8)**2)<7.6**2;}
function cellKey(pos){
  return `${Math.floor(pos.x/CONFIG.CELL_SIZE)},${Math.floor(pos.z/CONFIG.CELL_SIZE)}`;
}

function makeFood(pos=randomGroundPos(),energy=rand(5,10)){
  const mesh=new THREE.Mesh(
    new THREE.IcosahedronGeometry(rand(.12,.22),0),
    new THREE.MeshStandardMaterial({color:0x9fe76e,emissive:0x112208,roughness:.85})
  );
  mesh.position.copy(pos);mesh.position.y=.18;mesh.castShadow=true;foodGroup.add(mesh);
  const f={mesh,energy};food.push(f);return f;
}

function makeMaterial(type=null,pos=randomGroundPos()){
  if(materials.length>=CONFIG.MATERIAL_MAX)return null;
  const names=Object.keys(MATERIAL_TYPES);type=type||names[(Math.random()*names.length)|0];
  const p=MATERIAL_TYPES[type];
  let geo;
  if(type==='fiber')geo=new THREE.CylinderGeometry(.07,.09,.8,6);
  else if(type==='stone')geo=new THREE.DodecahedronGeometry(.24,0);
  else if(type==='mineral')geo=new THREE.OctahedronGeometry(.25,0);
  else geo=new THREE.IcosahedronGeometry(.23,1);

  const mesh=new THREE.Mesh(
    geo,new THREE.MeshStandardMaterial({color:p.color,roughness:type==='mineral'?.45:.88,metalness:type==='mineral'?.15:0})
  );
  mesh.position.copy(pos);mesh.position.y=type==='fiber'?.28:.24;
  if(type==='fiber')mesh.rotation.z=Math.PI/2;
  mesh.castShadow=true;materialGroup.add(mesh);

  const m={id:nextMaterialId++,type,props:{...p},mesh,carriedBy:null,staticTime:0,lastPos:mesh.position.clone()};
  materials.push(m);return m;
}

function randomBrain(ni=44,nh=22,no=18){
  return {
    weights1:Array.from({length:nh},()=>Array.from({length:ni},()=>rand(-.9,.9))),
    weightsR:Array.from({length:nh},()=>Array.from({length:nh},()=>rand(-.22,.22))),
    bias1:Array.from({length:nh},()=>rand(-.16,.16)),
    weights2:Array.from({length:no},()=>Array.from({length:nh},()=>rand(-.9,.9))),
    bias2:Array.from({length:no},()=>rand(-.16,.16))
  };
}

function randomGenome(){
  return {
    body:{
      size:rand(.55,1.15),segments:Math.floor(rand(1,4)),segmentStretch:rand(.72,1.28),
      limbPairs:Math.floor(rand(1,4)),limbLength:rand(.35,1),limbThickness:rand(.035,.085),
      speed:rand(1,2.6),turn:rand(.8,2.1),hue:rand(0,1),sensor:rand(.65,1.35),
      eyeCount:Math.floor(rand(1,4)),eyeSpread:rand(.12,.34),
      voice:rand(.2,1),hearing:rand(.65,1.45),pitchBase:rand(180,720),pitchRange:rand(80,560),
      pulseRate:rand(.5,4.5),grip:rand(.45,1.65),reach:rand(.55,1.4)
    },
    temperament:{
      sociability:rand(-1,1),aggression:rand(-.7,.8),fearfulness:rand(.15,1.15),
      attachment:rand(.2,1.25),curiosity:rand(.2,1.45),empathy:rand(-.2,1.2),
      impulsivity:rand(.1,1.3),plasticity:rand(.0005,.006),
      persistence:rand(.35,1.4),exploration:rand(.2,1.3)
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
  b.turn=clamp(maybe(b.turn,.25),.25,3.2);
  b.hue=(maybe(b.hue,.12)+1)%1;
  b.sensor=clamp(maybe(b.sensor,.18),.3,2.1);
  b.eyeCount=clamp(Math.round(maybe(b.eyeCount,1)),0,6);
  b.eyeSpread=clamp(maybe(b.eyeSpread,.08),.04,.55);
  b.voice=clamp(maybe(b.voice,.2),0,1.7);
  b.hearing=clamp(maybe(b.hearing,.18),.2,2);
  b.pitchBase=clamp(maybe(b.pitchBase,90),90,1400);
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
  t.plasticity=clamp(maybe(t.plasticity,.0012),0,.014);
  t.persistence=clamp(maybe(t.persistence,.2),.1,2);
  t.exploration=clamp(maybe(t.exploration,.2),0,2);

  for(const row of ng.brain.weights1)for(let i=0;i<row.length;i++)row[i]=maybe(row[i],.28);
  for(const row of ng.brain.weightsR)for(let i=0;i<row.length;i++)row[i]=maybe(row[i],.14);
  for(let i=0;i<ng.brain.bias1.length;i++)ng.brain.bias1[i]=maybe(ng.brain.bias1[i],.14);
  for(const row of ng.brain.weights2)for(let i=0;i<row.length;i++)row[i]=maybe(row[i],.28);
  for(let i=0;i<ng.brain.bias2.length;i++)ng.brain.bias2[i]=maybe(ng.brain.bias2[i],.14);
  return ng;
}

function createBody(genome){
  const g=genome.body,root=new THREE.Group();
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
        new THREE.CylinderGeometry(g.limbThickness*g.size,g.limbThickness*1.25*g.size,g.limbLength*g.size,6),limbMat
      );
      limb.position.set(side*.38*g.size,.22*g.size,z);limb.rotation.z=side*Math.PI/2.7;
      limb.castShadow=true;root.add(limb);
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
  const haloMat=new THREE.MeshBasicMaterial({color:0x7de38f,transparent:true,opacity:.08,side:THREE.DoubleSide});
  const halo=new THREE.Mesh(new THREE.RingGeometry(.48*g.size,.54*g.size,24),haloMat);
  halo.rotation.x=-Math.PI/2;halo.position.y=.03;root.add(halo);root.userData.halo=halo;
  return root;
}

function makeAgent(genome=randomGenome(),pos=randomGroundPos(),generation=0,lineage=null){
  if(agents.length>=CONFIG.MAX_AGENTS)return null;
  const mesh=createBody(genome);mesh.position.copy(pos);mesh.rotation.y=rand(0,Math.PI*2);agentGroup.add(mesh);

  const a={
    id:nextId++,mesh,genome,generation,age:0,energy:CONFIG.START_ENERGY,health:CONFIG.MAX_HEALTH,
    heading:mesh.rotation.y,targetHeading:mesh.rotation.y,
    hidden:Array(22).fill(0),learnedW2:genome.brain.weights2.map(r=>r.slice()),
    socialMemory:new Map(),spatialMemory:[],visited:new Map(),lastVisitTick:-1,
    affect:{valence:0,arousal:.15,fear:0,anger:0,attachment:0,curiosity:.25},
    decision:{timer:rand(.1,.4),mode:0,target:null,context:'',q:0,lastMode:0,lastContext:'',duration:0},
    actionModel:new Map(),rewardBuffer:0,lastEnergy:CONFIG.START_ENERGY,lastHealth:CONFIG.MAX_HEALTH,lastReward:0,
    reproCooldown:rand(2,8),attackCooldown:0,affiliateCooldown:0,
    signal:[0,0,0],sound:{freq:genome.body.pitchBase,amp:.25,pulse:.5,nextChirp:worldAge+rand(.3,1.2)},
    signalPhase:rand(0,Math.PI*2),children:0,lineage:lineage||Math.random().toString(36).slice(2,7),
    parentId:null,carrying:null,thought:'observando'
  };
  mesh.userData.agent=a;agents.push(a);births++;
  rememberVisit(a,true);
  return a;
}

function destroyAgentMesh(a){
  agentGroup.remove(a.mesh);
  a.mesh.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});
}

function removeAgent(a){
  const i=agents.indexOf(a);if(i<0)return;
  if(a.carrying)dropMaterial(a,true);
  const drops=Math.max(1,Math.min(6,Math.round(a.energy/11)+2));
  for(let k=0;k<drops;k++){
    const p=a.mesh.position.clone();p.x+=rand(-.7,.7);p.z+=rand(-.7,.7);makeFood(p,rand(3,7));
  }
  if(Math.random()<.85)makeMaterial('biomass',a.mesh.position.clone());
  destroyAgentMesh(a);agents.splice(i,1);deaths++;
  if(selectedAgent===a){selectedAgent=null;document.getElementById('selected').style.display='none';}
}

function nearestFood(a){
  let best=null,bd=1e9;
  for(const f of food){const d=a.mesh.position.distanceToSquared(f.mesh.position);if(d<bd){bd=d;best=f;}}
  return best?[best,Math.sqrt(bd)]:[null,999];
}
function nearestAgent(a){
  let best=null,bd=1e9;
  for(const o of agents){if(o===a)continue;const d=a.mesh.position.distanceToSquared(o.mesh.position);if(d<bd){bd=d;best=o;}}
  return best?[best,Math.sqrt(bd)]:[null,999];
}
function nearestMaterial(a){
  let best=null,bd=1e9;
  for(const m of materials){
    if(m.carriedBy||a.carrying===m)continue;
    const d=a.mesh.position.distanceToSquared(m.mesh.position);if(d<bd){bd=d;best=m;}
  }
  return best?[best,Math.sqrt(bd)]:[null,999];
}
function nearestStructure(a){
  let best=null,bd=1e9;
  for(const s of structures){const d=a.mesh.position.distanceToSquared(s.group.position);if(d<bd){bd=d;best=s;}}
  return best?[best,Math.sqrt(bd)]:[null,999];
}
function localAngle(a,targetPos){
  const dx=targetPos.x-a.mesh.position.x,dz=targetPos.z-a.mesh.position.z;
  const worldAngle=Math.atan2(dx,dz);let d=worldAngle-a.heading;
  while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;return d/Math.PI;
}
function angleTo(a,targetPos){return Math.atan2(targetPos.x-a.mesh.position.x,targetPos.z-a.mesh.position.z);}

function brainStep(a,inputs){
  const b=a.genome.brain,nh=b.bias1.length,h=new Array(nh).fill(0);
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

function memoryFor(a,n){
  let m=a.socialMemory.get(n.id);
  if(!m){
    m={affinity:0,threat:0,trust:0,lastSeen:worldAge,meetings:0,signal:[0,0,0],pitch:0};
    a.socialMemory.set(n.id,m);
  }
  m.lastSeen=worldAge;
  if(a.socialMemory.size>CONFIG.MEMORY_LIMIT){
    let worst=null,score=Infinity;
    for(const [id,x] of a.socialMemory){
      const s=Math.abs(x.affinity)+Math.abs(x.threat)+x.meetings*.01-(worldAge-x.lastSeen)*.001;
      if(s<score){score=s;worst=id;}
    }
    if(worst!==null)a.socialMemory.delete(worst);
  }
  return m;
}

function storeSpatialMemory(a,type,pos,value){
  const now=worldAge;
  const near=a.spatialMemory.find(m=>m.type===type&&Math.hypot(m.x-pos.x,m.z-pos.z)<2.2);
  if(near){
    near.value=clamp(near.value*.7+value*.3,-1,1);near.last=now;near.x=pos.x;near.z=pos.z;
  }else{
    a.spatialMemory.push({type,x:pos.x,z:pos.z,value:clamp(value,-1,1),last:now});
    if(a.spatialMemory.length>CONFIG.SPATIAL_MEMORY_LIMIT){
      a.spatialMemory.sort((x,y)=>(Math.abs(y.value)*.7-(now-y.last)*.0005)-(Math.abs(x.value)*.7-(now-x.last)*.0005));
      a.spatialMemory.length=CONFIG.SPATIAL_MEMORY_LIMIT;
    }
  }
}
function bestPositiveMemory(a){
  let best=null,bestScore=-Infinity;
  for(const m of a.spatialMemory){
    const age=worldAge-m.last;
    const score=m.value-age*.0008;
    if(score>bestScore){bestScore=score;best=m;}
  }
  return best;
}
function nearestNegativeMemory(a){
  let best=null,bestScore=Infinity;
  for(const m of a.spatialMemory){
    if(m.value>=-.15)continue;
    const d=Math.hypot(m.x-a.mesh.position.x,m.z-a.mesh.position.z);
    const score=m.value-.012*d;
    if(score<bestScore){bestScore=score;best=m;}
  }
  return best;
}
function rememberVisit(a,force=false){
  const key=cellKey(a.mesh.position),tick=Math.floor(worldAge);
  if(force||tick!==a.lastVisitTick){
    a.visited.set(key,(a.visited.get(key)||0)+1);
    a.lastVisitTick=tick;
  }
}
function noveltyAt(a,pos){
  return 1/Math.sqrt(1+(a.visited.get(cellKey(pos))||0));
}
function noveltyPoint(a){
  let best=null,bestScore=-1;
  for(let i=0;i<10;i++){
    const angle=rand(0,Math.PI*2),dist=rand(4,11);
    const p=new THREE.Vector3(a.mesh.position.x+Math.cos(angle)*dist,0,a.mesh.position.z+Math.sin(angle)*dist);
    const r=Math.hypot(p.x,p.z);
    if(r>CONFIG.WORLD-1.2){p.multiplyScalar((CONFIG.WORLD-1.2)/r);}
    const s=noveltyAt(a,p);
    if(s>bestScore){bestScore=s;best=p;}
  }
  return [best,bestScore];
}

function contextKey(a,mem){
  const e=a.energy<35?'L':a.energy>72?'H':'M';
  const h=a.health<55?'I':'O';
  const f=a.affect.fear>.55?'F':'C';
  const s=mem?(mem.threat>.35?'T':mem.affinity>.35?'A':'N'):'X';
  return `${e}${h}${f}${s}`;
}
function modelKey(context,mode){return `${context}|${mode}`;}
function modelQ(a,context,mode){return a.actionModel.get(modelKey(context,mode))?.q||0;}
function updateActionModel(a,reward){
  if(!a.decision.lastContext)return;
  const key=modelKey(a.decision.lastContext,a.decision.lastMode);
  const rec=a.actionModel.get(key)||{q:0,n:0};
  rec.n++;const alpha=clamp(.24/Math.sqrt(rec.n),.035,.24);
  rec.q+=alpha*(reward-rec.q);a.actionModel.set(key,rec);
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
  const t=a.genome.temperament,hunger=1-a.energy/CONFIG.MAX_ENERGY,injury=1-a.health/CONFIG.MAX_HEALTH;
  a.affect.valence+=dt*((a.energy/CONFIG.MAX_ENERGY-.5)*.08-injury*.12-a.affect.valence*.12);
  a.affect.arousal+=dt*(hunger*.08+injury*.18+a.affect.fear*.13+a.affect.anger*.15-a.affect.arousal*.16);
  a.affect.fear+=dt*(injury*.10-a.affect.fear*.08);
  a.affect.anger+=dt*(-a.affect.anger*.07);
  a.affect.curiosity+=dt*((.22+t.curiosity*.28)-a.affect.curiosity)*.05;
  a.affect.attachment+=dt*(-a.affect.attachment*.025);
  if(n&&mem){
    a.affect.fear+=dt*Math.max(0,mem.threat)*.12*t.fearfulness;
    a.affect.anger+=dt*Math.max(0,mem.threat)*.10*(.5+t.aggression);
    a.affect.attachment+=dt*Math.max(0,mem.affinity)*.08*t.attachment;
    a.affect.valence+=dt*(mem.affinity-mem.threat)*.04;
  }
  for(const k of Object.keys(a.affect))a.affect[k]=clamp(a.affect[k],k==='valence'?-1:0,1);
}
function applyPlasticity(a,reward){
  const rate=a.genome.temperament.plasticity;if(rate<=0)return;
  const r=clamp(reward,-1,1);
  for(let j=0;j<a.learnedW2.length;j++){
    for(let k=0;k<a.hidden.length;k++){
      a.learnedW2[j][k]=clamp(a.learnedW2[j][k]+rate*r*a.hidden[k]*.12,-3,3);
    }
  }
}

function chooseDecision(a,per,out){
  const t=a.genome.temperament;
  const context=contextKey(a,per.mem);
  const [novelPos,novelScore]=noveltyPoint(a);
  const posMem=bestPositiveMemory(a);
  const negMem=nearestNegativeMemory(a);

  const candidates=[
    {mode:0,target:null,valid:true,label:'mantener trayectoria'},
    {mode:1,target:per.f?.mesh.position.clone()||null,valid:!!per.fVisible,label:'atender comida'},
    {mode:2,target:per.n?.mesh.position.clone()||null,valid:!!per.nVisible,label:'atender otro ser'},
    {mode:3,target:per.m?.mesh.position.clone()||null,valid:!!per.mVisible,label:'atender material'},
    {mode:4,target:per.st?.group.position.clone()||null,valid:!!per.sVisible,label:'atender estructura'},
    {mode:5,target:posMem?new THREE.Vector3(posMem.x,0,posMem.z):null,valid:!!posMem,label:'volver a un recuerdo'},
    {mode:6,target:novelPos,valid:!!novelPos,label:'explorar zona nueva'},
    {mode:7,target:null,valid:!!(per.nVisible||negMem),label:'alejarse'}
  ];

  let best=null,bestScore=-Infinity;
  for(const c of candidates){
    if(!c.valid)continue;
    const q=modelQ(a,context,c.mode);
    let score=out[c.mode]+q*.85+rand(-.05,.05)*t.impulsivity;

    if(c.mode===6)score+=novelScore*.34*t.curiosity*t.exploration;
    if(c.mode===5&&posMem)score+=posMem.value*.28;
    if(c.mode===7){
      const threat=per.mem?.threat||0;
      score+=a.affect.fear*.42+threat*.35;
    }
    if(c.mode===0)score+=t.persistence*.08;

    if(score>bestScore){bestScore=score;best=c;}
  }
  if(!best)best=candidates[0];

  if(best.mode===7){
    let source=null;
    if(per.nVisible&&per.n)source=per.n.mesh.position;
    else if(negMem)source=new THREE.Vector3(negMem.x,0,negMem.z);
    if(source){
      const away=a.mesh.position.clone().sub(source).setY(0);
      if(away.lengthSq()<.001)away.set(rand(-1,1),0,rand(-1,1));
      away.normalize().multiplyScalar(rand(5,9));
      best.target=a.mesh.position.clone().add(away);
    }
  }

  a.decision.lastMode=a.decision.mode;
  a.decision.lastContext=a.decision.context;
  a.decision.mode=best.mode;
  a.decision.context=context;
  a.decision.q=modelQ(a,context,best.mode);
  a.decision.duration=rand(CONFIG.DECISION_MIN,CONFIG.DECISION_MAX)*(0.75+t.persistence*.45);
  a.decision.timer=a.decision.duration;
  a.decision.target=best.target;
  a.thought=`${best.label} · expectativa ${a.decision.q.toFixed(2)}`;

  if(best.target)a.targetHeading=angleTo(a,best.target);
  else a.targetHeading=a.heading+rand(-.18,.18)*(1.1-t.persistence*.25);
}

function pickUpMaterial(a,m){
  if(!m||a.carrying||m.carriedBy)return false;
  if(m.props.mass>a.genome.body.grip*1.25)return false;
  a.carrying=m;m.carriedBy=a.id;
  storeSpatialMemory(a,'material',a.mesh.position,.18);
  return true;
}
function dropMaterial(a,forced=false){
  const m=a.carrying;if(!m)return;
  m.carriedBy=null;m.mesh.parent?.remove(m.mesh);materialGroup.add(m.mesh);
  m.mesh.position.copy(a.mesh.position);
  const fwd=new THREE.Vector3(Math.sin(a.heading),0,Math.cos(a.heading));
  m.mesh.position.addScaledVector(fwd,.6*a.genome.body.reach);
  m.mesh.position.y=m.type==='fiber'?.28:.24;a.carrying=null;m.staticTime=forced?2:0;
}
function updateCarriedMaterial(a){
  const m=a.carrying;if(!m)return;
  if(m.mesh.parent!==a.mesh){m.mesh.parent?.remove(m.mesh);a.mesh.add(m.mesh);}
  m.mesh.position.set(0,.42*a.genome.body.size,.62*a.genome.body.size*a.genome.body.reach);
  m.mesh.rotation.set(0,0,m.type==='fiber'?Math.PI/2:0);
}

function maybeCreateStructure(dt){
  if(structures.length>=CONFIG.MAX_STRUCTURES)return;
  for(const m of materials){
    if(m.carriedBy)continue;
    const moved=m.mesh.position.distanceTo(m.lastPos);
    m.staticTime=moved<.015?m.staticTime+dt:0;m.lastPos.copy(m.mesh.position);
  }
  const candidates=materials.filter(m=>!m.carriedBy&&m.staticTime>2.2);
  for(const seed of candidates){
    const cluster=candidates.filter(m=>m.mesh.position.distanceTo(seed.mesh.position)<.9);
    if(cluster.length<3)continue;
    const chosen=cluster.slice(0,Math.min(6,cluster.length)),center=new THREE.Vector3();
    chosen.forEach(m=>center.add(m.mesh.position));center.multiplyScalar(1/chosen.length);
    const totalMass=chosen.reduce((s,m)=>s+m.props.mass,0);
    const hardness=chosen.reduce((s,m)=>s+m.props.hardness,0)/chosen.length;
    const fertility=chosen.reduce((s,m)=>s+m.props.fertility,0);
    const length=chosen.reduce((s,m)=>s+m.props.length,0);
    const group=new THREE.Group();group.position.copy(center);structureGroup.add(group);
    for(const m of chosen){
      materialGroup.remove(m.mesh);m.mesh.position.sub(center);group.add(m.mesh);
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
      const p=s.group.position.clone();p.x+=rand(-1.2,1.2);p.z+=rand(-1.2,1.2);makeFood(p,rand(4,8));
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

function affiliate(a,n){
  if(a.affiliateCooldown>0)return;
  a.affiliateCooldown=CONFIG.AFFILIATE_COOLDOWN;
  const am=memoryFor(a,n),nm=memoryFor(n,a);
  am.affinity=clamp(am.affinity+.05*(.6+a.genome.temperament.attachment),-1,1);
  am.trust=clamp(am.trust+.04,-1,1);
  nm.affinity=clamp(nm.affinity+.035,-1,1);
  nm.trust=clamp(nm.trust+.03,-1,1);
  a.affect.valence=clamp(a.affect.valence+.055,-1,1);
  n.affect.valence=clamp(n.affect.valence+.035,-1,1);
  storeSpatialMemory(a,'social',a.mesh.position,.35);
  a.rewardBuffer+=.08;
}
function attack(a,n,intent){
  if(a.attackCooldown>0)return;
  a.attackCooldown=CONFIG.ATTACK_COOLDOWN;
  const weapon=a.carrying?a.carrying.props:null;
  const weaponFactor=weapon?1+weapon.hardness*.7+weapon.length*.15:1;
  const damage=clamp((3.1+a.genome.body.size*1.6+a.genome.body.grip*.5)*weaponFactor*intent,1,13);
  n.health=clamp(n.health-damage,0,CONFIG.MAX_HEALTH);a.energy=Math.max(0,a.energy-1.0*weaponFactor);
  const nm=memoryFor(n,a);
  nm.threat=clamp(nm.threat+.15+damage/100,-1,1);nm.affinity=clamp(nm.affinity-.11-damage/150,-1,1);
  n.affect.fear=clamp(n.affect.fear+.16,0,1);n.affect.anger=clamp(n.affect.anger+.12,0,1);
  storeSpatialMemory(n,'danger',n.mesh.position,-.85);
  a.rewardBuffer+=.01;
  if(n.health<=0)removeAgent(n);
}

function buildPerception(a){
  const [f,fd]=nearestFood(a),[n,nd]=nearestAgent(a),[m,md]=nearestMaterial(a),[st,sd]=nearestStructure(a);
  const sense=CONFIG.SENSE_RADIUS*a.genome.body.sensor;
  const fVisible=f&&fd<sense,nVisible=n&&nd<sense,mVisible=m&&md<CONFIG.MATERIAL_SENSE*a.genome.body.sensor,sVisible=st&&sd<sense;
  let mem=null,heardPitch=0,heardAmp=0,neighborSignals=[0,0,0];
  if(nVisible){
    mem=memoryFor(a,n);mem.meetings+=.01;neighborSignals=n.signal;
    const att=clamp(1-nd/(sense*a.genome.body.hearing),0,1);
    heardPitch=(n.sound.freq/1400)*att;heardAmp=n.sound.amp*att;
  }
  return {f,fd,n,nd,m,md,st,sd,sense,fVisible,nVisible,mVisible,sVisible,mem,heardPitch,heardAmp,neighborSignals};
}

function decisionInputs(a,p){
  const posMem=bestPositiveMemory(a),negMem=nearestNegativeMemory(a);
  const qVals=Array.from({length:MODE_COUNT},(_,i)=>modelQ(a,contextKey(a,p.mem),i));
  const materialHard=p.mVisible?p.m.props.hardness:0,materialMass=p.mVisible?clamp(p.m.props.mass/1.5,0,1):0;
  const structureNear=p.sVisible?1-p.sd/p.sense:-1;
  const foodDir=p.fVisible?localAngle(a,p.f.mesh.position):0;
  const nDir=p.nVisible?localAngle(a,p.n.mesh.position):0;
  const mDir=p.mVisible?localAngle(a,p.m.mesh.position):0;
  const posMemDir=posMem?localAngle(a,new THREE.Vector3(posMem.x,0,posMem.z)):0;
  const negMemDir=negMem?localAngle(a,new THREE.Vector3(negMem.x,0,negMem.z)):0;

  return [
    a.energy/CONFIG.MAX_ENERGY*2-1,
    a.health/CONFIG.MAX_HEALTH*2-1,
    clamp(a.age/CONFIG.MAX_AGE,0,1)*2-1,
    p.fVisible?1-p.fd/p.sense:-1,foodDir,
    p.nVisible?1-p.nd/p.sense:-1,nDir,
    p.neighborSignals[0],p.neighborSignals[1],p.neighborSignals[2],p.heardPitch,p.heardAmp,
    p.mem?.affinity||0,p.mem?.threat||0,p.mem?.trust||0,
    inPond(a.mesh.position)?1:-1,Math.hypot(a.mesh.position.x,a.mesh.position.z)/CONFIG.WORLD,
    p.mVisible?1-p.md/(CONFIG.MATERIAL_SENSE*a.genome.body.sensor):-1,mDir,materialHard,materialMass,
    a.carrying?1:-1,structureNear,
    a.affect.valence,a.affect.arousal,a.affect.fear,a.affect.anger,a.affect.attachment,a.affect.curiosity,
    posMem?posMem.value:0,posMemDir,negMem?negMem.value:0,negMemDir,
    noveltyAt(a,a.mesh.position),
    ...qVals,
    a.lastReward,
    Math.sin(worldAge*.15+a.signalPhase)
  ];
}

function updateAgent(a,dt){
  if(!agents.includes(a))return;
  const g=a.genome.body,t=a.genome.temperament;
  a.age+=dt;a.reproCooldown=Math.max(0,a.reproCooldown-dt);
  a.attackCooldown=Math.max(0,a.attackCooldown-dt);a.affiliateCooldown=Math.max(0,a.affiliateCooldown-dt);
  rememberVisit(a);

  const p=buildPerception(a);
  updateAffect(a,p.nVisible?p.n:null,p.mem,dt);
  const inputs=decisionInputs(a,p);
  const out=brainStep(a,inputs);

  a.decision.timer-=dt;
  if(a.decision.timer<=0){
    updateActionModel(a,clamp(a.rewardBuffer,-1,1));
    applyPlasticity(a,clamp(a.rewardBuffer,-1,1));
    a.lastReward=clamp(a.rewardBuffer,-1,1);a.rewardBuffer=0;
    chooseDecision(a,p,out);
  }

  if(a.decision.target){
    const desired=angleTo(a,a.decision.target);
    a.targetHeading=desired;
  }
  let diff=a.targetHeading-a.heading;
  while(diff>Math.PI)diff-=Math.PI*2;while(diff<-Math.PI)diff+=Math.PI*2;

  // Dead zone + angular inertia: removes the endless tight-circle failure mode.
  const dead=.075;
  const turnCmd=Math.abs(diff)<dead?0:Math.sign(diff)*Math.min(Math.abs(diff),g.turn*dt);
  a.heading+=turnCmd;
  a.mesh.rotation.y=a.heading;

  let speed=sigmoid(out[8])*g.speed;
  if(a.decision.target){
    const d=a.mesh.position.distanceTo(a.decision.target);
    if(d<.8)speed*=clamp(d/.8,.08,1);
  }
  if(a.decision.mode===0)speed*=.75+.25*t.persistence;
  if(a.affect.fear>.65&&a.decision.mode===7)speed*=1.15;

  let loadPenalty=1;if(a.carrying)loadPenalty=clamp(1-a.carrying.props.mass/(g.grip*4),.35,1);
  a.mesh.position.x+=Math.sin(a.heading)*speed*loadPenalty*dt;
  a.mesh.position.z+=Math.cos(a.heading)*speed*loadPenalty*dt;

  const r=Math.hypot(a.mesh.position.x,a.mesh.position.z);
  if(r>CONFIG.WORLD-.6){
    const s=(CONFIG.WORLD-.6)/r;a.mesh.position.x*=s;a.mesh.position.z*=s;
    a.targetHeading=a.heading+Math.PI*rand(.65,1.35);a.decision.timer=0;
  }

  // Sound genes + neural control. Amplitude intentionally has a floor so calls are audible.
  a.signal[0]=out[14]*g.voice;
  a.signal[1]=out[15]*g.voice;
  a.signal[2]=out[16]*g.voice;
  a.sound.freq=clamp(g.pitchBase+a.signal[0]*g.pitchRange*(1+a.affect.arousal*.25),90,1500);
  a.sound.amp=clamp(.12+.88*sigmoid(out[15])*(.6+.4*a.affect.arousal),.08,1);
  a.sound.pulse=clamp(sigmoid(out[16]),.05,1);

  const nodes=a.mesh.userData.signalNodes||[];
  for(let i=0;i<nodes.length;i++){
    nodes[i].material.emissiveIntensity=.05+Math.abs(a.signal[i])*1.6;
    nodes[i].scale.setScalar(1+Math.abs(a.signal[i])*.75);
  }
  const halo=a.mesh.userData.halo;
  if(halo){
    const c=new THREE.Color().setHSL(a.affect.valence>=0?.33:0,.65,.48);
    halo.material.color.copy(c);halo.material.opacity=.04+.20*a.affect.arousal;
  }

  const shelter=structureShelterFactor(a);
  const moveCost=(speed/Math.max(.4,g.speed))*CONFIG.MOVE_COST;
  const carryCost=a.carrying?a.carrying.props.mass*.045:0;
  a.energy-=dt*(CONFIG.BASE_METABOLISM*(.8+g.size*.35+g.segments*.035)+moveCost+carryCost+(inPond(a.mesh.position)?CONFIG.WATER_DRAIN:0))*shelter;

  // Curiosity reward: discovering under-visited space is intrinsically useful.
  const novelty=noveltyAt(a,a.mesh.position);
  a.rewardBuffer+=dt*novelty*.012*t.curiosity*t.exploration;

  if(p.f&&p.fd<CONFIG.BITE_RADIUS*g.size&&out[9]>.05){
    const before=a.energy;
    a.energy=clamp(a.energy+p.f.energy*sunFactor,0,CONFIG.MAX_ENERGY);
    const idx=food.indexOf(p.f);if(idx>=0)food.splice(idx,1);
    foodGroup.remove(p.f.mesh);p.f.mesh.geometry.dispose();p.f.mesh.material.dispose();
    const gain=a.energy-before;
    a.rewardBuffer+=gain*.045;
    storeSpatialMemory(a,'food',a.mesh.position,.85);
    a.affect.valence=clamp(a.affect.valence+.06,-1,1);
    if(a.decision.mode===1)a.decision.timer=0;
  }

  if(p.nVisible&&p.mem){
    p.mem.meetings+=dt;
    for(let i=0;i<3;i++)p.mem.signal[i]=p.mem.signal[i]*.96+p.n.signal[i]*.04;
    p.mem.pitch=p.mem.pitch*.96+(p.n.sound.freq/1400)*.04;
  }

  if(p.nVisible&&p.nd<CONFIG.CONTACT_RADIUS*g.size&&agents.includes(p.n)){
    const affiliateIntent=sigmoid(out[10]+t.sociability*.25+t.attachment*.20+a.affect.attachment*.20-a.affect.fear*.3);
    const attackIntent=sigmoid(out[11]+t.aggression*.34+a.affect.anger*.42+a.affect.arousal*.15-(p.mem?.affinity||0)*.3-sigmoid(out[17])*.3);
    if(attackIntent>.70&&attackIntent>affiliateIntent+.08)attack(a,p.n,attackIntent);
    else if(affiliateIntent>.64)affiliate(a,p.n);
  }

  const manipIntent=out[13],manipRadius=CONFIG.MANIP_RADIUS*g.reach;
  if(manipIntent>.28){
    if(!a.carrying&&p.m&&p.md<manipRadius){
      if(pickUpMaterial(a,p.m))a.rewardBuffer+=.02;
    }else if(!a.carrying&&p.m&&p.md<manipRadius*1.4){
      const pushStrength=g.grip/(p.m.props.mass+.2);
      const dir=new THREE.Vector3(Math.sin(a.heading),0,Math.cos(a.heading));
      p.m.mesh.position.addScaledVector(dir,dt*.7*pushStrength);
    }
  }else if(manipIntent<-.28&&a.carrying)dropMaterial(a);
  updateCarriedMaterial(a);

  if(a.carrying&&a.carrying.type==='biomass'&&out[9]>.58&&a.energy<90){
    a.energy=clamp(a.energy+a.carrying.props.energy*2,0,CONFIG.MAX_ENERGY);
    const mm=a.carrying;a.carrying=null;a.mesh.remove(mm.mesh);mm.mesh.geometry.dispose();mm.mesh.material.dispose();
    const idx=materials.indexOf(mm);if(idx>=0)materials.splice(idx,1);
    a.rewardBuffer+=.10;
  }

  if(a.energy>CONFIG.REPRO_MIN_ENERGY&&a.reproCooldown<=0&&out[12]>.18&&agents.length<CONFIG.MAX_AGENTS){
    a.energy-=CONFIG.REPRO_COST;a.reproCooldown=CONFIG.REPRO_COOLDOWN;
    const childPos=a.mesh.position.clone();childPos.x+=rand(-.7,.7);childPos.z+=rand(-.7,.7);
    const child=makeAgent(mutateGenome(a.genome),childPos,a.generation+1,a.lineage);
    if(child){child.energy=CONFIG.START_ENERGY*.82;child.parentId=a.id;a.children++;a.rewardBuffer+=.04;}
  }

  if(a.energy>58&&a.affect.arousal<.45&&a.affect.fear<.35){
    a.health=clamp(a.health+dt*.18,0,CONFIG.MAX_HEALTH);a.energy=Math.max(0,a.energy-dt*.045);
  }

  const energyDelta=a.energy-a.lastEnergy,healthDelta=a.health-a.lastHealth;
  a.rewardBuffer+=energyDelta*.012+healthDelta*.02+a.affect.valence*.0008;
  a.lastEnergy=a.energy;a.lastHealth=a.health;

  if(a.energy<=0||a.health<=0||a.age>CONFIG.MAX_AGE*(.75+g.size*.35))removeAgent(a);
}

function updateFood(dt){
  if(food.length<CONFIG.FOOD_MAX&&Math.random()<dt*CONFIG.FOOD_RESPAWN*sunFactor)makeFood();
  for(const m of materials){
    if(m.carriedBy||m.type!=='biomass')continue;
    if(inPond(m.mesh.position)&&Math.random()<dt*.014*sunFactor*m.props.fertility){
      const p=m.mesh.position.clone();p.x+=rand(-.55,.55);p.z+=rand(-.55,.55);makeFood(p,rand(4,7));
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
  masterGain=audioCtx.createGain();
  masterGain.gain.value=masterVolume;
  masterGain.connect(audioCtx.destination);
}
async function ensureAudio(){
  initAudio();
  if(audioCtx.state==='suspended')await audioCtx.resume();
}
function chirp(freq=440,amp=.6,duration=.18,pan=0,wave='sine'){
  if(!audioCtx||!audioEnabled)return;
  const now=audioCtx.currentTime;
  const osc=audioCtx.createOscillator();
  const gain=audioCtx.createGain();
  const panner=audioCtx.createStereoPanner?audioCtx.createStereoPanner():null;

  osc.type=wave;
  osc.frequency.setValueAtTime(clamp(freq,80,1600),now);
  osc.frequency.exponentialRampToValueAtTime(clamp(freq*(1+rand(-.08,.12)),80,1600),now+duration);

  gain.gain.setValueAtTime(.0001,now);
  gain.gain.exponentialRampToValueAtTime(Math.max(.004,amp),now+.02);
  gain.gain.exponentialRampToValueAtTime(.0001,now+duration);

  if(panner){
    panner.pan.value=clamp(pan,-1,1);
    osc.connect(gain);gain.connect(panner);panner.connect(masterGain);
  }else{
    osc.connect(gain);gain.connect(masterGain);
  }
  osc.start(now);osc.stop(now+duration+.03);
}
function playTestSound(){
  if(!audioEnabled)return;
  chirp(420,.8,.22,-.2,'triangle');
  setTimeout(()=>chirp(620,.65,.18,.2,'sine'),160);
}
function updateAudio(){
  if(!audioEnabled||!audioCtx)return;
  const audible=[...agents]
    .sort((a,b)=>a.mesh.position.distanceToSquared(camera.position)-b.mesh.position.distanceToSquared(camera.position))
    .slice(0,8);

  for(const a of audible){
    if(worldAge<a.sound.nextChirp)continue;
    const d=a.mesh.position.distanceTo(camera.position);
    const attenuation=clamp(1-d/58,.18,1);
    const pan=clamp((a.mesh.position.x-camera.position.x)/30,-1,1);
    const amp=clamp(a.sound.amp*attenuation*.7,.04,.6);
    const duration=.10+.16*a.sound.pulse+.08*a.affect.arousal;
    const wave=a.affect.anger>.55?'sawtooth':a.affect.fear>.55?'triangle':'sine';
    chirp(a.sound.freq,amp,duration,pan,wave);

    const interval=.28+(1-a.sound.pulse)*1.25+rand(.08,.55);
    a.sound.nextChirp=worldAge+interval;
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
function totalMemories(){return agents.reduce((s,a)=>s+a.spatialMemory.length,0);}
function totalCells(){return agents.reduce((s,a)=>s+a.visited.size,0);}

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
  document.getElementById('memories').textContent=totalMemories();
  document.getElementById('cells').textContent=totalCells();
  document.getElementById('positiveBonds').textContent=positive;
  document.getElementById('rivalries').textContent=rivals;

  if(selectedAgent&&agents.includes(selectedAgent)){
    const a=selectedAgent,t=a.genome.temperament;
    const mems=a.spatialMemory
      .slice().sort((x,y)=>Math.abs(y.value)-Math.abs(x.value)).slice(0,5)
      .map(m=>`${m.type}: valor ${m.value.toFixed(2)} en (${m.x.toFixed(1)}, ${m.z.toFixed(1)})`).join('\n')||'Sin memorias todavía';

    const modelRows=[];
    for(let i=0;i<MODE_COUNT;i++){
      const q=modelQ(a,a.decision.context||contextKey(a,null),i);
      modelRows.push(`${MODE_NAMES[i]} ${q.toFixed(2)}`);
    }

    document.getElementById('selName').textContent=`Criatura #${a.id} — ${affectLabel(a)}`;
    document.getElementById('selInfo').textContent=
`PENSAMIENTO ACTUAL
${a.thought}
Modo: ${MODE_NAMES[a.decision.mode]}
Decisión restante: ${Math.max(0,a.decision.timer).toFixed(2)} s
Valor esperado: ${a.decision.q.toFixed(2)}

ESTADO
Energía: ${a.energy.toFixed(1)}
Salud: ${a.health.toFixed(1)}
Edad: ${a.age.toFixed(1)}
Generación: ${a.generation}
Linaje: ${a.lineage}

AFECTO
Valencia: ${a.affect.valence.toFixed(2)}
Activación: ${a.affect.arousal.toFixed(2)}
Miedo: ${a.affect.fear.toFixed(2)}
Ira: ${a.affect.anger.toFixed(2)}
Apego: ${a.affect.attachment.toFixed(2)}
Curiosidad: ${a.affect.curiosity.toFixed(2)}

COGNICIÓN
Celdas conocidas: ${a.visited.size}
Memorias espaciales: ${a.spatialMemory.length}
Última recompensa: ${a.lastReward.toFixed(3)}
Plasticidad: ${t.plasticity.toFixed(4)}
Persistencia: ${t.persistence.toFixed(2)}
Exploración: ${t.exploration.toFixed(2)}

SONIDO
Frecuencia: ${Math.round(a.sound.freq)} Hz
Amplitud: ${a.sound.amp.toFixed(2)}
Pulso: ${a.sound.pulse.toFixed(2)}

MODELO DE RESULTADOS
${modelRows.join('\n')}

MEMORIAS ESPACIALES
${mems}`;
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
  while(agents.length){const a=agents.pop();destroyAgentMesh(a);}

  births=0;deaths=0;worldAge=0;nextId=1;nextMaterialId=1;nextStructureId=1;selectedAgent=null;
  document.getElementById('selected').style.display='none';
  for(let i=0;i<CONFIG.START_FOOD;i++)makeFood();
  for(let i=0;i<CONFIG.START_MATERIALS;i++)makeMaterial();
  for(let i=0;i<CONFIG.START_AGENTS;i++)makeAgent();
}

document.getElementById('pause').onclick=()=>{
  paused=!paused;document.getElementById('pause').textContent=paused?'Continuar':'Pausar';
};
document.getElementById('sound').onclick=async()=>{
  await ensureAudio();audioEnabled=!audioEnabled;
  const b=document.getElementById('sound');
  b.textContent=audioEnabled?'Silenciar sonido':'Activar sonido';b.classList.toggle('soundOn',audioEnabled);
  if(audioEnabled)playTestSound();
};
document.getElementById('testSound').onclick=async()=>{
  await ensureAudio();
  const was=audioEnabled;audioEnabled=true;playTestSound();audioEnabled=was||true;
  const b=document.getElementById('sound');b.textContent='Silenciar sonido';b.classList.add('soundOn');
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
const volEl=document.getElementById('volume');
volEl.oninput=()=>{
  masterVolume=+volEl.value;
  document.getElementById('volumeOut').textContent=`${Math.round(masterVolume*100)}%`;
  if(masterGain)masterGain.gain.value=masterVolume;
};

const raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown',e=>{
  if(e.target!==renderer.domElement)return;
  mouse.x=(e.clientX/innerWidth)*2-1;mouse.y=-(e.clientY/innerHeight)*2+1;
  raycaster.setFromCamera(mouse,camera);
  const hits=raycaster.intersectObjects(agentGroup.children,true);if(!hits.length)return;
  let o=hits[0].object;while(o&&!o.userData.agent)o=o.parent;
  if(o?.userData.agent){selectedAgent=o.userData.agent;document.getElementById('selected').style.display='block';}
});
window.addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);
});

seed();

let last=performance.now();
function loop(now){
  requestAnimationFrame(loop);
  const realDt=Math.min(.04,(now-last)/1000);last=now;controls.update();
  if(!paused){
    const scaled=realDt*timeScale,steps=Math.max(1,Math.ceil(scaled/.035)),dt=scaled/steps;
    for(let s=0;s<steps;s++){
      worldAge+=dt;updateFood(dt);updateMaterials(dt);
      for(const a of [...agents])updateAgent(a,dt);
      if(agents.length===0&&food.length>10)makeAgent();
    }
  }
  updateAudio();updateHUD();renderer.render(scene,camera);
}
requestAnimationFrame(loop);
