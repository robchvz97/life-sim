import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.179.1/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.179.1/examples/jsm/controls/OrbitControls.js';

const ENGINE_VERSION='v9.0.3';
const engineVersionEl=document.getElementById('engineVersion');
const renderStatusEl=document.getElementById('renderStatus');
if(engineVersionEl) engineVersionEl.textContent=ENGINE_VERSION;

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
let totalMentalSims=0,totalImitations=0;
let selectedAgent=null;
let extinct=false,originCount=1,extinctionAge=0,peakGeneration=0;
let anatomyView=false;
let totalTouchSignals=0,totalReflexes=0;

let audioCtx=null,masterGain=null,audioEnabled=false,masterVolume=.18;

const app=document.getElementById('app');
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x0d1720);
scene.fog=new THREE.FogExp2(0x091016,.017);

const camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.1,420);
camera.position.set(24,21,28);

const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.domElement.style.position='absolute';
renderer.domElement.style.inset='0';
renderer.domElement.style.width='100%';
renderer.domElement.style.height='100%';
renderer.domElement.style.zIndex='0';
app.appendChild(renderer.domElement);

const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;
controls.target.set(0,0,0);
controls.maxPolarAngle=Math.PI*.48;
controls.minDistance=8;
controls.maxDistance=75;
camera.lookAt(0,0,0);
controls.update();

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
  new THREE.MeshStandardMaterial({color:0x315f3c,roughness:.92})
);
ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
const grid=new THREE.GridHelper(CONFIG.WORLD*1.55,24,0x456454,0x284136);
grid.position.y=.035;
grid.material.transparent=true;
grid.material.opacity=.22;
scene.add(grid);


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
const originBeacon=new THREE.Mesh(
  new THREE.CylinderGeometry(.10,.10,2.2,10),
  new THREE.MeshStandardMaterial({color:0x7de38f,emissive:0x173a1f,roughness:.5})
);
originBeacon.position.set(0,1.1,0);
scene.add(originBeacon);


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

function randomBrain(ni=56,nh=22,no=18){
  return {
    weights1:Array.from({length:nh},()=>Array.from({length:ni},()=>rand(-.9,.9))),
    weightsR:Array.from({length:nh},()=>Array.from({length:nh},()=>rand(-.22,.22))),
    bias1:Array.from({length:nh},()=>rand(-.16,.16)),
    weights2:Array.from({length:no},()=>Array.from({length:nh},()=>rand(-.9,.9))),
    bias2:Array.from({length:no},()=>rand(-.16,.16))
  };
}

function resizeBrain(brain,newHidden,ni=44,no=18){
  const old=brain.bias1.length;
  newHidden=clamp(Math.round(newHidden),12,42);
  if(newHidden===old)return brain;

  if(newHidden>old){
    for(let j=old;j<newHidden;j++){
      brain.weights1.push(Array.from({length:ni},()=>rand(-.55,.55)));
      brain.bias1.push(rand(-.12,.12));
    }
    for(let r=0;r<old;r++){
      for(let c=old;c<newHidden;c++)brain.weightsR[r].push(rand(-.12,.12));
    }
    for(let r=old;r<newHidden;r++){
      brain.weightsR.push(Array.from({length:newHidden},()=>rand(-.12,.12)));
    }
    for(let o=0;o<no;o++){
      for(let c=old;c<newHidden;c++)brain.weights2[o].push(rand(-.45,.45));
    }
  }else{
    brain.weights1=brain.weights1.slice(0,newHidden);
    brain.bias1=brain.bias1.slice(0,newHidden);
    brain.weightsR=brain.weightsR.slice(0,newHidden).map(row=>row.slice(0,newHidden));
    brain.weights2=brain.weights2.map(row=>row.slice(0,newHidden));
  }
  return brain;
}

function randomGenome(){
  const hiddenSize=Math.floor(rand(16,29));
  return {
    body:{
      size:rand(.55,1.15),segments:Math.floor(rand(1,4)),segmentStretch:rand(.72,1.28),
      limbPairs:Math.floor(rand(1,4)),limbLength:rand(.35,1),limbThickness:rand(.035,.085),
      speed:rand(1,2.6),turn:rand(.8,2.1),hue:rand(0,1),sensor:rand(.65,1.35),
      eyeCount:Math.floor(rand(1,4)),eyeSpread:rand(.12,.34),
      voice:rand(.2,1),hearing:rand(.65,1.45),pitchBase:rand(180,720),pitchRange:rand(80,560),
      pulseRate:rand(.5,4.5),grip:rand(.45,1.65),reach:rand(.55,1.4),
      adultScale:rand(.78,1.35),heightRatio:rand(.72,1.38),widthRatio:rand(.72,1.35),
      legRatio:rand(.72,1.45),boneThickness:rand(.62,1.42),
      musclePotential:rand(.65,1.55),fatStorage:rand(.55,1.55),
      growthRate:rand(.75,1.30),agingRate:rand(.78,1.22),
      bodyCurve:rand(-.55,.55),spineArch:rand(-.20,.30),headRatio:rand(.72,1.35),
      skinPattern:Math.floor(rand(0,4)),skinHue2:rand(0,1),
      skinContrast:rand(.18,.78),skinRoughness:rand(.38,.92),skinScale:rand(.65,1.8),
      jointSize:rand(.75,1.30),
      tactileDensity:rand(.55,1.7),nociception:rand(.45,1.7),proprioception:rand(.55,1.65),
      thermalSense:rand(.35,1.55),interoception:rand(.45,1.65),reflexSpeed:rand(.45,1.55),nerveDelay:rand(.05,.45)
    },
    temperament:{
      sociability:rand(-1,1),aggression:rand(-.7,.8),fearfulness:rand(.15,1.15),
      attachment:rand(.2,1.25),curiosity:rand(.2,1.45),empathy:rand(-.2,1.2),
      impulsivity:rand(.1,1.3),plasticity:rand(.0005,.006),
      persistence:rand(.35,1.4),exploration:rand(.2,1.3)
    },
    cognition:{
      hiddenSize,
      planningDepth:Math.floor(rand(1,4)),
      sequenceSpan:Math.floor(rand(2,5)),
      imitation:rand(.15,1.35),
      foresight:rand(.25,1.35),
      cultureBias:rand(.1,1.25)
    },
    brain:randomBrain(56,hiddenSize,18)
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
  b.adultScale=clamp(maybe(b.adultScale,.12),.55,1.65);
  b.heightRatio=clamp(maybe(b.heightRatio,.12),.55,1.65);
  b.widthRatio=clamp(maybe(b.widthRatio,.12),.55,1.65);
  b.legRatio=clamp(maybe(b.legRatio,.14),.45,1.85);
  b.boneThickness=clamp(maybe(b.boneThickness,.12),.45,1.8);
  b.musclePotential=clamp(maybe(b.musclePotential,.14),.45,1.9);
  b.fatStorage=clamp(maybe(b.fatStorage,.14),.35,2.0);
  b.growthRate=clamp(maybe(b.growthRate,.10),.5,1.6);
  b.agingRate=clamp(maybe(b.agingRate,.10),.55,1.55);
  b.bodyCurve=clamp(maybe(b.bodyCurve,.12),-.85,.85);
  b.spineArch=clamp(maybe(b.spineArch,.08),-.40,.50);
  b.headRatio=clamp(maybe(b.headRatio,.12),.55,1.65);
  if(Math.random()<m*.45)b.skinPattern=clamp(Math.round(b.skinPattern+rand(-1.2,1.2)),0,3);
  b.skinHue2=(maybe(b.skinHue2,.14)+1)%1;
  b.skinContrast=clamp(maybe(b.skinContrast,.12),.05,.95);
  b.skinRoughness=clamp(maybe(b.skinRoughness,.10),.20,1.0);
  b.skinScale=clamp(maybe(b.skinScale,.18),.35,2.8);
  b.jointSize=clamp(maybe(b.jointSize,.12),.55,1.55);
  b.tactileDensity=clamp(maybe(b.tactileDensity,.16),.25,2.2);
  b.nociception=clamp(maybe(b.nociception,.16),.2,2.2);
  b.proprioception=clamp(maybe(b.proprioception,.16),.25,2.2);
  b.thermalSense=clamp(maybe(b.thermalSense,.16),.15,2.0);
  b.interoception=clamp(maybe(b.interoception,.16),.2,2.1);
  b.reflexSpeed=clamp(maybe(b.reflexSpeed,.14),.2,2.0);
  b.nerveDelay=clamp(maybe(b.nerveDelay,.08),.01,.75);

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

  const c=ng.cognition||(ng.cognition={
    hiddenSize:ng.brain.bias1.length,planningDepth:2,sequenceSpan:3,imitation:.6,foresight:.7,cultureBias:.5
  });
  let newHidden=c.hiddenSize;
  if(Math.random()<m*.7)newHidden+=Math.random()<.5?-2:2;
  c.hiddenSize=clamp(Math.round(newHidden),12,42);
  c.planningDepth=clamp(Math.round(maybe(c.planningDepth,1)),1,5);
  c.sequenceSpan=clamp(Math.round(maybe(c.sequenceSpan,1)),2,5);
  c.imitation=clamp(maybe(c.imitation,.22),0,2);
  c.foresight=clamp(maybe(c.foresight,.22),0,2);
  c.cultureBias=clamp(maybe(c.cultureBias,.22),0,2);
  resizeBrain(ng.brain,c.hiddenSize,56,18);

  for(const row of ng.brain.weights1)for(let i=0;i<row.length;i++)row[i]=maybe(row[i],.28);
  for(const row of ng.brain.weightsR)for(let i=0;i<row.length;i++)row[i]=maybe(row[i],.14);
  for(let i=0;i<ng.brain.bias1.length;i++)ng.brain.bias1[i]=maybe(ng.brain.bias1[i],.14);
  for(const row of ng.brain.weights2)for(let i=0;i<row.length;i++)row[i]=maybe(row[i],.28);
  for(let i=0;i<ng.brain.bias2.length;i++)ng.brain.bias2[i]=maybe(ng.brain.bias2[i],.14);
  return ng;
}

function seededNoise(seed){
  let s=(Math.floor(Math.abs(seed)*2147483647)||1)>>>0;
  return ()=>{
    s=(s*1664525+1013904223)>>>0;
    return s/4294967296;
  };
}

function makeSkinTexture(g){
  const canvas=document.createElement('canvas');
  canvas.width=64;canvas.height=64;
  const ctx=canvas.getContext('2d');
  const base=new THREE.Color().setHSL(g.hue,.55,.53);
  const alt=new THREE.Color().setHSL(g.skinHue2,.50,.46);
  const baseCss=`#${base.getHexString()}`,altCss=`#${alt.getHexString()}`;
  ctx.fillStyle=baseCss;ctx.fillRect(0,0,64,64);

  const rng=seededNoise(
    g.hue*13.7+g.skinHue2*31.9+g.skinPattern*17.3+g.bodyCurve*7.1+g.skinScale*3.7
  );
  ctx.fillStyle=altCss;ctx.strokeStyle=altCss;

  if(g.skinPattern===0){
    for(let i=0;i<55;i++){
      ctx.globalAlpha=.025+rng()*.08;
      ctx.fillStyle=rng()>.5?altCss:baseCss;
      ctx.fillRect(rng()*64,rng()*64,1+rng()*3,1+rng()*3);
    }
  }else if(g.skinPattern===1){
    ctx.globalAlpha=.25+.55*g.skinContrast;
    for(let i=0;i<18;i++){
      const r=(1.5+rng()*5)*g.skinScale;
      ctx.beginPath();ctx.arc(rng()*64,rng()*64,r,0,Math.PI*2);ctx.fill();
    }
  }else if(g.skinPattern===2){
    ctx.lineWidth=2.2*g.skinScale;
    ctx.globalAlpha=.28+.55*g.skinContrast;
    for(let y=-20;y<90;y+=Math.max(4,9*g.skinScale)){
      ctx.beginPath();
      for(let x=0;x<=64;x+=4){
        const yy=y+Math.sin(x*.16+rng()*2)*3.5;
        if(x===0)ctx.moveTo(x,yy);else ctx.lineTo(x,yy);
      }
      ctx.stroke();
    }
  }else{
    ctx.globalAlpha=.20+.58*g.skinContrast;
    for(let i=0;i<12;i++){
      const x=rng()*64,y=rng()*64,rx=(4+rng()*10)*g.skinScale,ry=(2+rng()*7)*g.skinScale;
      ctx.save();ctx.translate(x,y);ctx.rotate(rng()*Math.PI);
      ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.fill();ctx.restore();
    }
  }

  ctx.globalAlpha=1;
  const tex=new THREE.CanvasTexture(canvas);
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  tex.repeat.set(1.3,1.3);
  tex.colorSpace=THREE.SRGBColorSpace;
  tex.needsUpdate=true;
  return tex;
}

function cylinderBetween(a,b,radius,material,radial=7){
  const dir=b.clone().sub(a);
  const len=Math.max(.001,dir.length());
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,len,radial),material);
  mesh.position.copy(a).add(b).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());
  return mesh;
}

function createBody(genome){
  const g=genome.body,root=new THREE.Group();

  const skinTexture=makeSkinTexture(g);
  const skinMat=new THREE.MeshStandardMaterial({
    map:skinTexture,color:0xffffff,roughness:g.skinRoughness,metalness:0,
    transparent:false,opacity:1
  });
  const skinMatSoft=skinMat.clone();
  skinMatSoft.roughness=clamp(g.skinRoughness+.06,.2,1);

  const boneMat=new THREE.MeshStandardMaterial({
    color:0xe5dcc5,roughness:.72,metalness:0,transparent:true,opacity:.92
  });
  const jointMat=new THREE.MeshStandardMaterial({
    color:0xd8ceb6,roughness:.68,transparent:true,opacity:.92
  });
  const eyeMat=new THREE.MeshStandardMaterial({color:0xf5f7f8,roughness:.25});
  const pupilMat=new THREE.MeshStandardMaterial({color:0x0b0e11,roughness:.3});

  root.userData.skinParts=[];
  root.userData.skinMaterials=[skinMat,skinMatSoft];
  root.userData.boneParts=[];
  root.userData.jointParts=[];
  root.userData.signalNodes=[];

  const count=Math.max(1,g.segments);
  const spine=[];
  for(let s=0;s<count;s++){
    const u=count===1?0:s/(count-1);
    const z=-s*.43*g.size*g.segmentStretch;
    const x=Math.sin(u*Math.PI)*g.bodyCurve*g.size;
    const y=.46*g.size+Math.sin(u*Math.PI)*g.spineArch*g.size;
    spine.push(new THREE.Vector3(x,y,z));
  }

  for(let i=0;i<spine.length;i++){
    const joint=new THREE.Mesh(
      new THREE.SphereGeometry(.075*g.size*g.boneThickness*g.jointSize,9,7),jointMat
    );
    joint.position.copy(spine[i]);joint.visible=false;joint.castShadow=true;
    root.add(joint);root.userData.jointParts.push(joint);

    if(i<spine.length-1){
      const bone=cylinderBetween(spine[i],spine[i+1],.045*g.size*g.boneThickness,boneMat,7);
      bone.visible=false;bone.castShadow=true;
      root.add(bone);root.userData.boneParts.push(bone);
    }
  }

  for(let s=0;s<count;s++){
    const u=count===1?0:s/(count-1);
    const seg=new THREE.Mesh(new THREE.SphereGeometry(.36*g.size,18,14),skinMat);
    const taper=.86+.18*Math.sin((1-u)*Math.PI*.85);
    seg.scale.set(
      g.widthRatio*g.segmentStretch*taper,
      g.heightRatio*(.76+.10*Math.cos(u*Math.PI)),
      .90+.12*taper
    );
    seg.position.copy(spine[s]);
    seg.castShadow=true;
    seg.userData.partType='core';
    seg.userData.baseScale=seg.scale.clone();
    root.add(seg);root.userData.skinParts.push(seg);
  }

  const front=spine[0].clone();
  const head=new THREE.Mesh(new THREE.SphereGeometry(.31*g.size*g.headRatio,18,14),skinMatSoft);
  head.position.set(front.x,front.y+.10*g.size,front.z+.27*g.size);
  head.scale.set(1.02*g.widthRatio,.90*g.heightRatio,1.05);
  head.castShadow=true;
  head.userData.partType='head';
  head.userData.baseScale=head.scale.clone();
  root.add(head);root.userData.skinParts.push(head);

  const skull=new THREE.Mesh(
    new THREE.SphereGeometry(.205*g.size*g.headRatio*g.boneThickness,12,10),boneMat
  );
  skull.position.copy(head.position);skull.scale.set(.95,.82,.96);
  skull.visible=false;skull.castShadow=true;
  root.add(skull);root.userData.boneParts.push(skull);

  for(let i=0;i<g.eyeCount;i++){
    const t=g.eyeCount===1?0:(i/(g.eyeCount-1)-.5)*2;
    const eye=new THREE.Mesh(new THREE.SphereGeometry(.058*g.size,9,7),eyeMat);
    eye.position.set(
      head.position.x+t*g.eyeSpread*g.size*g.headRatio,
      head.position.y+.045*g.size,
      head.position.z+.265*g.size*g.headRatio
    );
    const pupil=new THREE.Mesh(new THREE.SphereGeometry(.026*g.size,8,6),pupilMat);
    pupil.position.set(0,0,.051*g.size);
    eye.add(pupil);root.add(eye);
  }

  const pairs=Math.max(0,g.limbPairs);
  for(let p=0;p<pairs;p++){
    const spineIndex=pairs<=1?0:Math.round((p/(pairs-1))*(spine.length-1));
    const anchor=spine[spineIndex];
    for(const side of [-1,1]){
      const outward=side*(.36+.12*g.widthRatio)*g.size;
      const length=g.limbLength*g.legRatio*g.size;
      const bend=(.12+.16*Math.abs(g.bodyCurve))*g.size;
      const p0=anchor.clone().add(new THREE.Vector3(side*.28*g.size*g.widthRatio,-.03*g.size,0));
      const p1=p0.clone().add(new THREE.Vector3(outward*.65,-length*.36,bend*(p%2===0?1:-1)));
      const p2=p0.clone().add(new THREE.Vector3(outward,-length*.76,-bend*.35));

      const curve=new THREE.CatmullRomCurve3([p0,p1,p2]);
      const radius=Math.max(.022,g.limbThickness*g.size*(.78+.35*g.boneThickness));
      const limb=new THREE.Mesh(new THREE.TubeGeometry(curve,10,radius,8,false),skinMatSoft);
      limb.castShadow=true;limb.userData.partType='limbTube';
      root.add(limb);root.userData.skinParts.push(limb);

      const bone=new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3([p0,p1,p2]),8,radius*.34*g.boneThickness,6,false),
        boneMat
      );
      bone.visible=false;bone.castShadow=true;
      root.add(bone);root.userData.boneParts.push(bone);

      for(const jp of [p0,p1,p2]){
        const j=new THREE.Mesh(new THREE.SphereGeometry(radius*.52*g.jointSize,8,6),jointMat);
        j.position.copy(jp);j.visible=false;j.castShadow=true;
        root.add(j);root.userData.jointParts.push(j);
      }

      const muscle1=new THREE.Mesh(new THREE.SphereGeometry(radius*1.8,10,8),skinMatSoft);
      muscle1.position.copy(p1);
      muscle1.scale.set(1.0,1.35,1.0);
      muscle1.userData.partType='muscle';
      muscle1.userData.baseScale=muscle1.scale.clone();
      root.add(muscle1);root.userData.skinParts.push(muscle1);
    }
  }

  const signalColors=[0x5ec9ff,0xffd45e,0xff7eb6];
  for(let i=0;i<3;i++){
    const mat=new THREE.MeshStandardMaterial({
      color:signalColors[i],emissive:signalColors[i],emissiveIntensity:.05,roughness:.4
    });
    const node=new THREE.Mesh(new THREE.SphereGeometry(.040*g.size,8,6),mat);
    node.position.set(
      head.position.x+(i-1)*.12*g.size,
      head.position.y+.25*g.size,
      head.position.z-.02*g.size
    );
    root.add(node);root.userData.signalNodes.push(node);
  }

  const haloMat=new THREE.MeshBasicMaterial({
    color:0x7de38f,transparent:true,opacity:.08,side:THREE.DoubleSide
  });
  const halo=new THREE.Mesh(new THREE.RingGeometry(.48*g.size,.54*g.size,24),haloMat);
  halo.rotation.x=-Math.PI/2;halo.position.y=.03;
  root.add(halo);root.userData.halo=halo;

  setBodyAnatomy(root,anatomyView);
  return root;
}

function setBodyAnatomy(root,enabled){
  const mats=root.userData.skinMaterials||[];
  const bones=root.userData.boneParts||[];
  const joints=root.userData.jointParts||[];
  const skins=root.userData.skinParts||[];

  for(const m of mats){
    m.transparent=enabled;
    m.opacity=enabled?.20:1;
    m.depthWrite=!enabled;
    m.needsUpdate=true;
  }
  for(const b of bones)b.visible=enabled;
  for(const j of joints)j.visible=enabled;
  for(const s of skins)s.renderOrder=enabled?2:0;
}

function setAnatomyView(enabled){
  anatomyView=enabled;
  for(const a of agents)setBodyAnatomy(a.mesh,enabled);
  const btn=document.getElementById('anatomy');
  if(btn)btn.textContent=enabled?'Ocultar anatomía':'Mostrar anatomía';
}

function makeAgent(genome=randomGenome(),pos=randomGroundPos(),generation=0,lineage=null){
  if(agents.length>=CONFIG.MAX_AGENTS)return null;
  const mesh=createBody(genome);mesh.position.copy(pos);mesh.rotation.y=rand(0,Math.PI*2);agentGroup.add(mesh);

  const a={
    id:nextId++,mesh,genome,generation,age:0,energy:CONFIG.START_ENERGY,health:CONFIG.MAX_HEALTH,
    phenotype:{
      growth:.38,
      muscle:.34,
      fat:.24,
      condition:1,
      skeletalMaturity:.45,
      senescence:0,
      lastLoad:0,
      fatigue:0,
      bodyTemp:.50
    },
    nervous:{
      current:{touch:[0,0,0,0],pain:[0,0,0,0],temperature:0,pressure:0,proprio:0,balance:0,intero:0},
      pending:[],lastTouch:[0,0,0,0],lastPain:[0,0,0,0],reflexCooldown:0,signals:0,reflexes:0
    },
    heading:mesh.rotation.y,targetHeading:mesh.rotation.y,
    hidden:Array(genome.brain.bias1.length).fill(0),learnedW2:genome.brain.weights2.map(r=>r.slice()),
    socialMemory:new Map(),spatialMemory:[],visited:new Map(),lastVisitTick:-1,
    affect:{valence:0,arousal:.15,fear:0,anger:0,attachment:0,curiosity:.25},
    decision:{timer:rand(.1,.4),mode:0,target:null,context:'',q:0,plan:0,lastMode:0,lastContext:'',duration:0},
    actionModel:new Map(),sequenceHistory:[],sequenceModel:new Map(),observedModel:new Map(),
    mentalSimulations:0,imitations:0,lastPlanTable:[],
    rewardBuffer:0,lastEnergy:CONFIG.START_ENERGY,lastHealth:CONFIG.MAX_HEALTH,lastReward:0,
    reproCooldown:rand(2,8),attackCooldown:0,affiliateCooldown:0,
    signal:[0,0,0],sound:{freq:genome.body.pitchBase,amp:.25,pulse:.5,nextChirp:worldAge+rand(.3,1.2)},
    signalPhase:rand(0,Math.PI*2),children:0,lineage:lineage||Math.random().toString(36).slice(2,7),
    parentId:null,carrying:null,thought:'observando'
  };
  mesh.userData.agent=a;agents.push(a);births++;
  peakGeneration=Math.max(peakGeneration,generation);
  rememberVisit(a,true);
  applyMorphologyVisual(a);
  return a;
}



function decayArray(arr,f){for(let i=0;i<arr.length;i++)arr[i]*=f;}
function sumArray(arr){return arr.reduce((s,v)=>s+v,0);}
function maxArray(arr){return arr.reduce((m,v)=>Math.max(m,v),0);}
function queueNerveSignal(a,kind,value,region=-1,extraDelay=0){
  const g=a.genome.body;
  const delay=(g.nerveDelay + a.genome.body.adultScale*.05 + extraDelay)/Math.max(.35,g.reflexSpeed);
  a.nervous.pending.push({t:worldAge+delay,kind,value:clamp(value,0,1),region});
}
function processNerveSignals(a){
  const cur=a.nervous.current;
  decayArray(cur.touch,.90); decayArray(cur.pain,.92);
  cur.temperature*=.92; cur.pressure*=.88; cur.proprio*=.86; cur.balance*=.88; cur.intero*=.90;

  if(!a.nervous.pending.length)return;
  const keep=[];
  for(const sig of a.nervous.pending){
    if(sig.t>worldAge){ keep.push(sig); continue; }
    if(sig.kind==='touch' && sig.region>=0){ cur.touch[sig.region]=Math.max(cur.touch[sig.region],sig.value); totalTouchSignals++; a.nervous.signals++; }
    else if(sig.kind==='pain' && sig.region>=0){ cur.pain[sig.region]=Math.max(cur.pain[sig.region],sig.value); }
    else if(sig.kind==='temperature'){ cur.temperature=Math.max(cur.temperature,sig.value); }
    else if(sig.kind==='pressure'){ cur.pressure=Math.max(cur.pressure,sig.value); }
    else if(sig.kind==='proprio'){ cur.proprio=Math.max(cur.proprio,sig.value); }
    else if(sig.kind==='balance'){ cur.balance=Math.max(cur.balance,sig.value); }
    else if(sig.kind==='intero'){ cur.intero=Math.max(cur.intero,sig.value); }
  }
  a.nervous.pending=keep;
}
function regionForAngleLocal(angleNorm){
  if(angleNorm>0.25)return 3; // right
  if(angleNorm<-0.25)return 2; // left
  return 1; // trunk/front default
}
function emitBodyContactSignals(a,p,speed){
  const g=a.genome.body;
  const senseMul=g.tactileDensity;
  // Food/material/structure/other contacts.
  if(p.fVisible && p.fd<1.5*g.reach){
    queueNerveSignal(a,'touch',clamp((1-p.fd/(1.5*g.reach))*senseMul,0,1), regionForAngleLocal(localAngle(a,p.f.mesh.position)));
  }
  if(p.mVisible && p.md<1.7*g.reach){
    queueNerveSignal(a,'touch',clamp((1-p.md/(1.7*g.reach))*senseMul*.95,0,1), regionForAngleLocal(localAngle(a,p.m.mesh.position)));
    queueNerveSignal(a,'pressure',clamp((p.m.props.hardness*.6+p.m.props.mass*.25)*senseMul,0,1));
  }
  if(p.sVisible && p.sd<1.8){
    queueNerveSignal(a,'touch',clamp((1-p.sd/1.8)*senseMul,0,1),1);
    queueNerveSignal(a,'pressure',clamp((1-p.sd/1.8)*.5,0,1));
  }
  if(p.nVisible && p.nd<1.35){
    const reg=regionForAngleLocal(localAngle(a,p.n.mesh.position));
    queueNerveSignal(a,'touch',clamp((1-p.nd/1.35)*senseMul,0,1),reg);
  }
  if(a.carrying){
    queueNerveSignal(a,'pressure',clamp((a.carrying.props.mass/(g.grip+0.2))*.65,0,1));
    queueNerveSignal(a,'touch',clamp(.25+a.carrying.props.hardness*.35,0,1),3);
  }
  if(inPond(a.mesh.position)){
    queueNerveSignal(a,'temperature',clamp(.25+g.thermalSense*.18,0,1));
    queueNerveSignal(a,'touch',.18,1);
  }
  const r=Math.hypot(a.mesh.position.x,a.mesh.position.z);
  if(r>CONFIG.WORLD-1.2){
    queueNerveSignal(a,'touch',.75,1);
    queueNerveSignal(a,'pain',.12,1);
  }
  const turnStress=clamp(Math.abs(a.targetHeading-a.heading)/Math.PI,0,1);
  queueNerveSignal(a,'proprio',clamp((speed/Math.max(.4,g.speed))*.55 + turnStress*.45,0,1));
  queueNerveSignal(a,'balance',clamp(turnStress*.85 + maxArray(a.nervous.current.touch)*.12,0,1));
  const hunger=clamp(1-a.energy/CONFIG.MAX_ENERGY,0,1);
  const fatigue=clamp(a.phenotype.fatigue,0,1);
  queueNerveSignal(a,'intero',clamp((hunger*.6 + fatigue*.4)*g.interoception,0,1));
}
function maybeTriggerReflex(a){
  const cur=a.nervous.current, g=a.genome.body;
  const danger=maxArray(cur.pain)*.7 + cur.balance*.2 + cur.pressure*.1;
  a.nervous.reflexCooldown=Math.max(0,a.nervous.reflexCooldown-0.016);
  if(danger>.72 && a.nervous.reflexCooldown<=0){
    a.nervous.reflexCooldown=.55/Math.max(.35,g.reflexSpeed);
    a.targetHeading=a.heading+Math.PI+rand(-.7,.7);
    a.decision.timer=Math.min(a.decision.timer,.08);
    a.affect.fear=clamp(a.affect.fear+.12,0,1);
    a.rewardBuffer-=.03;
    a.nervous.reflexes++;
    totalReflexes++;
    return true;
  }
  return false;
}
function morphologyMetrics(a){
  const g=a.genome.body,p=a.phenotype;
  const growthScale=.45+.55*p.growth;
  const adultMass=g.adultScale*g.adultScale*(.72+g.widthRatio*.28);
  const lean=adultMass*(.55+.45*p.muscle*g.musclePotential);
  const fat=adultMass*p.fat*g.fatStorage*.55;
  const bone=adultMass*.16*g.boneThickness*(.7+.3*p.skeletalMaturity);
  const mass=Math.max(.25,(lean+fat+bone)*growthScale);
  const strength=(.45+p.muscle*.95)*g.musclePotential*g.boneThickness*.55*growthScale;
  const endurance=clamp((.65+p.condition*.45)*(1-p.fat*.12)*(1-p.senescence*.4),.25,1.7);
  const agility=clamp((1.22/(.68+mass*.28))*(1+.18*g.legRatio)*(1-p.senescence*.35),.28,1.8);
  const durability=clamp((.55+g.boneThickness*.55)*(1+p.muscle*.18)*(1-p.senescence*.28),.35,2.0);
  return {mass,strength,endurance,agility,durability};
}

function updateMorphology(a,dt,speed){
  const g=a.genome.body,p=a.phenotype;
  const maturityAge=38/Math.max(.5,g.growthRate);
  p.growth=clamp(a.age/maturityAge,0,1);
  p.skeletalMaturity=clamp(a.age/(maturityAge*.8),0,1);

  const energyRatio=a.energy/CONFIG.MAX_ENERGY;
  const load=a.carrying?a.carrying.props.mass:0;
  const activity=clamp(speed/Math.max(.5,g.speed),0,1.5);
  p.lastLoad=load;

  // Fat changes according to sustained energy surplus/deficit.
  if(energyRatio>.72){
    p.fat=clamp(p.fat+dt*.0035*g.fatStorage*(energyRatio-.70),.03,1.0);
  }else if(energyRatio<.38){
    p.fat=clamp(p.fat-dt*.007*(.40-energyRatio),.03,1.0);
  }

  // Muscle adapts to movement and carrying; starvation causes atrophy.
  const training=activity*.55+clamp(load/1.4,0,1)*.9;
  if(energyRatio>.48 && training>.22){
    p.muscle=clamp(p.muscle+dt*.0028*training*g.musclePotential*(1-p.muscle*.65),.08,1.0);
  }else if(energyRatio<.28){
    p.muscle=clamp(p.muscle-dt*.0055*(.30-energyRatio),.08,1.0);
  }else{
    p.muscle=clamp(p.muscle-dt*.00018*(1-training),.08,1.0);
  }

  // Conditioning responds faster than muscle.
  p.condition=clamp(p.condition+dt*(activity*.0022-.00055),.45,1.35);

  // Fatigue responds to activity and recovers with calm states.
  p.fatigue=clamp(p.fatigue + dt*(activity*.006 + load*.003 - (a.energy>55 && activity<.4 ? .004 : .0015)),0,1);
  const thermalEnv=inPond(a.mesh.position)?0.28:clamp(.35+sunFactor*.22,0,1);
  p.bodyTemp=clamp(p.bodyTemp + (thermalEnv-p.bodyTemp)*dt*.9,0,1);

  // Aging gradually degrades condition after late adulthood.
  const ageFrac=a.age/(CONFIG.MAX_AGE/Math.max(.6,g.agingRate));
  p.senescence=clamp((ageFrac-.58)/.42,0,1);
  if(p.senescence>0){
    p.muscle=clamp(p.muscle-dt*.0008*p.senescence,.08,1);
    p.condition=clamp(p.condition-dt*.0009*p.senescence,.35,1.35);
  }
}

function applyMorphologyVisual(a){
  const g=a.genome.body,p=a.phenotype;
  const growth=.38+.62*p.growth;
  const fatSoft=1+p.fat*.28*g.fatStorage;
  const muscleBulk=1+p.muscle*.20*g.musclePotential;
  const sen=1-p.senescence*.10;

  const overall=g.adultScale*growth;
  a.mesh.scale.set(overall,overall,overall);

  a.mesh.traverse(o=>{
    const type=o.userData?.partType;
    if(!type)return;
    const base=o.userData.baseScale||new THREE.Vector3(1,1,1);

    if(type==='core'){
      o.scale.set(
        base.x*fatSoft*muscleBulk,
        base.y*sen*(1+p.muscle*.05),
        base.z*fatSoft
      );
    }else if(type==='head'){
      o.scale.set(
        base.x*(1+p.fat*.08),
        base.y*sen,
        base.z*(1+p.fat*.08)
      );
    }else if(type==='muscle'){
      const thick=.72+p.muscle*.60*g.musclePotential;
      o.scale.set(base.x*thick,base.y*(.84+p.muscle*.30),base.z*thick);
    }
  });

  setBodyAnatomy(a.mesh,anatomyView);
}


function destroyAgentMesh(a){
  agentGroup.remove(a.mesh);
  const geos=new Set(),mats=new Set(),textures=new Set();
  a.mesh.traverse(o=>{
    if(o.geometry)geos.add(o.geometry);
    if(o.material){
      const arr=Array.isArray(o.material)?o.material:[o.material];
      for(const m of arr){
        mats.add(m);
        if(m.map)textures.add(m.map);
        if(m.normalMap)textures.add(m.normalMap);
      }
    }
  });
  geos.forEach(g=>g.dispose());
  textures.forEach(t=>t.dispose());
  mats.forEach(m=>m.dispose());
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

function updateSequenceModel(a,mode,reward){
  a.sequenceHistory.push(mode);
  if(a.sequenceHistory.length>8)a.sequenceHistory.shift();
  const maxSpan=Math.min(a.genome.cognition?.sequenceSpan||3,a.sequenceHistory.length);
  for(let span=2;span<=maxSpan;span++){
    const key=a.sequenceHistory.slice(-span).join('>');
    const rec=a.sequenceModel.get(key)||{q:0,n:0};
    rec.n++;
    const alpha=clamp(.28/Math.sqrt(rec.n),.04,.28);
    rec.q+=alpha*(reward-rec.q);
    a.sequenceModel.set(key,rec);
  }
}

function sequenceBias(a,candidateMode){
  const span=Math.min(a.genome.cognition?.sequenceSpan||3,5);
  let best=0;
  for(let s=span;s>=2;s--){
    if(a.sequenceHistory.length<s-1)continue;
    const key=[...a.sequenceHistory.slice(-(s-1)),candidateMode].join('>');
    const rec=a.sequenceModel.get(key);
    if(rec){best=rec.q;break;}
  }
  return best;
}

function updateActionModel(a,reward,nextContext){
  if(!a.decision.lastContext)return;
  const key=modelKey(a.decision.lastContext,a.decision.lastMode);
  const rec=a.actionModel.get(key)||{q:0,n:0,next:{}};
  rec.n++;
  const alpha=clamp(.24/Math.sqrt(rec.n),.035,.24);
  rec.q+=alpha*(reward-rec.q);
  if(nextContext)rec.next[nextContext]=(rec.next[nextContext]||0)+1;
  a.actionModel.set(key,rec);
  updateSequenceModel(a,a.decision.lastMode,reward);
}

function predictedNextContext(a,context,mode){
  const rec=a.actionModel.get(modelKey(context,mode));
  if(!rec?.next)return context;
  let best=context,bestN=0;
  for(const [ctx,n] of Object.entries(rec.next)){
    if(n>bestN){bestN=n;best=ctx;}
  }
  return best;
}

function observedQ(a,context,mode){
  return a.observedModel.get(modelKey(context,mode))?.q||0;
}

function mentalRollout(a,context,firstMode,depth){
  let ctx=context,mode=firstMode,total=0,discount=1;
  const foresight=a.genome.cognition?.foresight||.7;
  for(let step=0;step<depth;step++){
    const direct=modelQ(a,ctx,mode);
    const observed=observedQ(a,ctx,mode);
    const seq=sequenceBias(a,mode);
    total+=discount*(direct + observed*.30 + seq*.22);
    ctx=predictedNextContext(a,ctx,mode);
    let bestMode=0,best=-Infinity;
    for(let m=0;m<MODE_COUNT;m++){
      const v=modelQ(a,ctx,m)+observedQ(a,ctx,m)*.25;
      if(v>best){best=v;bestMode=m;}
    }
    mode=bestMode;
    discount*=clamp(.48+foresight*.18,.5,.82);
  }
  a.mentalSimulations+=depth;
  totalMentalSims+=depth;
  return total;
}

function observeNeighbor(a,n,dt){
  if(!n || !agents.includes(n))return;
  const imitation=a.genome.cognition?.imitation||.5;
  if(imitation<=0)return;
  const parentBoost=n.id===a.parentId?1.55:1;
  const salience=Math.abs(n.lastReward)+Math.max(0,n.rewardBuffer)*.4;
  if(salience<.003)return;

  const ctx=n.decision.context||contextKey(n,null);
  const key=modelKey(ctx,n.decision.mode);
  const rec=a.observedModel.get(key)||{q:0,n:0};
  rec.n+=dt*parentBoost;
  const alpha=clamp(.035*imitation*parentBoost,0,.12);
  const observedOutcome=clamp(n.lastReward+n.rewardBuffer*.25,-1,1);
  rec.q+=alpha*(observedOutcome-rec.q);
  a.observedModel.set(key,rec);
  a.imitations+=dt*imitation*parentBoost;
  totalImitations+=dt*imitation*parentBoost;

  // Strong positive observations can seed a weak cultural sequence.
  if(observedOutcome>.08 && n.sequenceHistory.length>=2 && Math.random()<dt*.08*(a.genome.cognition?.cultureBias||.5)){
    const span=Math.min(a.genome.cognition?.sequenceSpan||3,n.sequenceHistory.length);
    const seq=n.sequenceHistory.slice(-span);
    const seqKey=seq.join('>');
    const own=a.sequenceModel.get(seqKey)||{q:0,n:0};
    own.n+=.25;
    own.q+=clamp((observedOutcome-own.q)*.04*imitation,-.05,.05);
    a.sequenceModel.set(seqKey,own);
  }
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


function basalInstinctBias(a,per,mode){
  const hunger=clamp(1-a.energy/CONFIG.MAX_ENERGY,0,1);
  const injury=clamp(1-a.health/CONFIG.MAX_HEALTH,0,1);
  const threat=per.mem?.threat||0;
  let b=0;

  // Very weak interoceptive biases, not high-level commands.
  if(mode===1 && per.fVisible){
    const salience=1-per.fd/per.sense;
    b += hunger*hunger*salience*.95;
  }
  if(mode===7){
    b += injury*.48 + a.affect.fear*.44 + Math.max(0,threat)*.42;
  }
  if(mode===0 && hunger<.25 && injury<.2)b+=.05;
  if(mode===6 && hunger<.50)b+=a.genome.temperament.exploration*.04;

  return b;
}

function chooseDecision(a,per,out){
  const t=a.genome.temperament,cog=a.genome.cognition||{planningDepth:2,foresight:.7};
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

  const planRows=[];
  let best=null,bestScore=-Infinity;
  for(const c of candidates){
    if(!c.valid)continue;
    const direct=modelQ(a,context,c.mode);
    const observed=observedQ(a,context,c.mode);
    const seq=sequenceBias(a,c.mode);
    const plan=mentalRollout(a,context,c.mode,cog.planningDepth||2);
    let score=out[c.mode]+direct*.45+plan*.52*cog.foresight+observed*.22+seq*.20+rand(-.04,.04)*t.impulsivity;
    score+=basalInstinctBias(a,per,c.mode);

    if(c.mode===6)score+=novelScore*.34*t.curiosity*t.exploration;
    if(c.mode===5&&posMem)score+=posMem.value*.28;
    if(c.mode===7){
      const threat=per.mem?.threat||0;
      score+=a.affect.fear*.42+threat*.35 + maxArray(a.nervous.current.pain)*.45 + a.nervous.current.balance*.18;
    }
    if(c.mode===1){ score+=a.nervous.current.intero*.18; }
    if(c.mode===0){ score-=a.nervous.current.pressure*.08; }
    if(c.mode===0)score+=t.persistence*.08;

    planRows.push({mode:c.mode,label:c.label,score,plan,direct,observed,seq});
    if(score>bestScore){bestScore=score;best={...c,plan,direct,observed,seq};}
  }
  if(!best)best={...candidates[0],plan:0,direct:0,observed:0,seq:0};

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
  a.decision.q=best.direct;
  a.decision.plan=best.plan;
  a.decision.duration=rand(CONFIG.DECISION_MIN,CONFIG.DECISION_MAX)*(0.75+t.persistence*.45);
  a.decision.timer=a.decision.duration;
  a.decision.target=best.target;
  a.lastPlanTable=planRows.sort((x,y)=>y.score-x.score).slice(0,4);
  a.thought=`${best.label} · futuro ${best.plan.toFixed(2)} · experiencia ${best.direct.toFixed(2)}`;

  if(best.target)a.targetHeading=angleTo(a,best.target);
  else a.targetHeading=a.heading+rand(-.18,.18)*(1.1-t.persistence*.25);
}

function pickUpMaterial(a,m){
  if(!m||a.carrying||m.carriedBy)return false;
  const morph=morphologyMetrics(a);
  if(m.props.mass>a.genome.body.grip*1.15*morph.strength)return false;
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
  const am=morphologyMetrics(a),nm=morphologyMetrics(n);
  const damage=clamp((2.4+am.strength*3.0+a.genome.body.grip*.35)*weaponFactor*intent/Math.max(.55,nm.durability),.8,16);
  n.health=clamp(n.health-damage,0,CONFIG.MAX_HEALTH);a.energy=Math.max(0,a.energy-(.7+.3*am.mass)*weaponFactor);
  queueNerveSignal(n,'pain',clamp(damage/10,0,1),1,.02);
  queueNerveSignal(a,'pressure',clamp(.18+damage/30,0,1),3,.01);
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
  const ns=a.nervous.current;
  const totalTouch=clamp(sumArray(ns.touch)/4,0,1);
  const totalPain=clamp(sumArray(ns.pain)/4,0,1);

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
    Math.sin(worldAge*.15+a.signalPhase),
    // nervous system inputs
    totalTouch,totalPain,
    ns.touch[0],ns.touch[1],ns.touch[2],ns.touch[3],
    ns.pain[0],ns.pain[1],ns.pain[2],ns.pain[3],
    ns.temperature,ns.pressure,ns.proprio,ns.balance,ns.intero
  ];
}
}

function updateAgent(a,dt){
  if(!agents.includes(a))return;
  const g=a.genome.body,t=a.genome.temperament;
  a.age+=dt;a.reproCooldown=Math.max(0,a.reproCooldown-dt);
  a.attackCooldown=Math.max(0,a.attackCooldown-dt);a.affiliateCooldown=Math.max(0,a.affiliateCooldown-dt);
  rememberVisit(a);

  const p=buildPerception(a);
  processNerveSignals(a);
  updateAffect(a,p.nVisible?p.n:null,p.mem,dt);
  const inputs=decisionInputs(a,p);
  const out=brainStep(a,inputs);

  a.decision.timer-=dt;
  if(a.decision.timer<=0){
    const nextContext=contextKey(a,p.mem);
    updateActionModel(a,clamp(a.rewardBuffer,-1,1),nextContext);
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

  const morph=morphologyMetrics(a);
  let speed=sigmoid(out[8])*g.speed*morph.agility*morph.endurance;
  if(a.decision.target){
    const d=a.mesh.position.distanceTo(a.decision.target);
    if(d<.8)speed*=clamp(d/.8,.08,1);
  }
  if(a.decision.mode===0)speed*=.75+.25*t.persistence;
  if(a.affect.fear>.65&&a.decision.mode===7)speed*=1.15;

  emitBodyContactSignals(a,p,speed);
  maybeTriggerReflex(a);
  let loadPenalty=1;if(a.carrying)loadPenalty=clamp(1-a.carrying.props.mass/(g.grip*4),.35,1);
  a.mesh.position.x+=Math.sin(a.heading)*speed*loadPenalty*dt;
  a.mesh.position.z+=Math.cos(a.heading)*speed*loadPenalty*dt;

  const r=Math.hypot(a.mesh.position.x,a.mesh.position.z);
  if(r>CONFIG.WORLD-.6){
    const s=(CONFIG.WORLD-.6)/r;a.mesh.position.x*=s;a.mesh.position.z*=s;
    queueNerveSignal(a,'pain',.16,1,.01);
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

  updateMorphology(a,dt,speed);
  applyMorphologyVisual(a);
  const morph2=morphologyMetrics(a);

  const shelter=structureShelterFactor(a);
  const moveCost=(speed/Math.max(.4,g.speed))*CONFIG.MOVE_COST*(.78+morph2.mass*.16);
  const carryCost=a.carrying?a.carrying.props.mass*.045/Math.max(.45,morph2.strength):0;
  const brainNeurons=a.hidden.length;
  const cognition=a.genome.cognition||{planningDepth:2};
  const brainCost=brainNeurons*.00034 + cognition.planningDepth*.00135;
  const nerveCost=(g.tactileDensity+g.nociception+g.proprioception+g.interoception)*.0018;
  const tissueCost=morph2.mass*.010 + a.phenotype.muscle*.007*g.musclePotential;
  a.energy-=dt*(CONFIG.BASE_METABOLISM*(.72+g.size*.28+g.segments*.03)+moveCost+carryCost+brainCost+nerveCost+tissueCost+(inPond(a.mesh.position)?CONFIG.WATER_DRAIN:0))*shelter;

  // Curiosity reward: discovering under-visited space is intrinsically useful.
  const novelty=noveltyAt(a,a.mesh.position);
  a.rewardBuffer+=dt*novelty*.012*t.curiosity*t.exploration;

  const hungerDrive=clamp(1-a.energy/CONFIG.MAX_ENERGY,0,1);
  const ingestDrive=out[9] + hungerDrive*.92;
  if(p.f&&p.fd<CONFIG.BITE_RADIUS*g.size&&ingestDrive>-.08){
    const before=a.energy;
    a.energy=clamp(a.energy+p.f.energy*sunFactor,0,CONFIG.MAX_ENERGY);
    const idx=food.indexOf(p.f);if(idx>=0)food.splice(idx,1);
    foodGroup.remove(p.f.mesh);p.f.mesh.geometry.dispose();p.f.mesh.material.dispose();
    const gain=a.energy-before;
    a.rewardBuffer+=gain*.045;
    queueNerveSignal(a,'touch',.35,0,.01);
    storeSpatialMemory(a,'food',a.mesh.position,.85);
    a.affect.valence=clamp(a.affect.valence+.06,-1,1);
    if(a.decision.mode===1)a.decision.timer=0;
  }

  if(p.nVisible&&p.mem){
    p.mem.meetings+=dt;
    for(let i=0;i<3;i++)p.mem.signal[i]=p.mem.signal[i]*.96+p.n.signal[i]*.04;
    p.mem.pitch=p.mem.pitch*.96+(p.n.sound.freq/1400)*.04;
    observeNeighbor(a,p.n,dt);
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

  if(a.energy>68&&a.reproCooldown<=0&&(out[12]+(a.energy/CONFIG.MAX_ENERGY-.68)*.65)>.08&&agents.length<CONFIG.MAX_AGENTS){
    a.energy-=CONFIG.REPRO_COST;a.reproCooldown=CONFIG.REPRO_COOLDOWN;
    const childPos=a.mesh.position.clone();childPos.x+=rand(-.7,.7);childPos.z+=rand(-.7,.7);
    const child=makeAgent(mutateGenome(a.genome),childPos,a.generation+1,a.lineage);
    if(child){
      child.energy=CONFIG.START_ENERGY*.82;child.parentId=a.id;a.children++;a.rewardBuffer+=.04;
      child.phenotype.growth=.22+rand(0,.08);
      child.phenotype.muscle=clamp(.25+rand(-.06,.08),.12,.5);
      child.phenotype.fat=clamp(.18+rand(-.05,.08),.08,.45);
      child.phenotype.condition=.92+rand(-.08,.08);
      applyMorphologyVisual(child);
      // No full memory inheritance: only a faint cultural prior from a few high-value parent patterns.
      const cultureBias=child.genome.cognition?.cultureBias||.5;
      const top=[...a.sequenceModel.entries()].sort((x,y)=>y[1].q-x[1].q).slice(0,2);
      for(const [key,rec] of top){
        if(rec.q>0){
          child.sequenceModel.set(key,{q:rec.q*.10*cultureBias,n:.1});
        }
      }
    }
  }

  if(a.energy>58&&a.affect.arousal<.45&&a.affect.fear<.35){
    a.health=clamp(a.health+dt*.18,0,CONFIG.MAX_HEALTH);a.energy=Math.max(0,a.energy-dt*.045);
  }

  const energyDelta=a.energy-a.lastEnergy,healthDelta=a.health-a.lastHealth;
  a.rewardBuffer+=energyDelta*.012+healthDelta*.02+a.affect.valence*.0008;
  a.lastEnergy=a.energy;a.lastHealth=a.health;

  if(a.energy<=0||a.health<=0||a.age>(CONFIG.MAX_AGE/g.agingRate)*(.75+g.size*.35))removeAgent(a);
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

function skinPatternName(n){
  return ['lisa/moteada','manchas','franjas','parches'][clamp(Math.round(n),0,3)];
}
function uniqueSkinPatterns(){
  return new Set(
    agents.map(a=>`${a.genome.body.skinPattern}-${Math.round(a.genome.body.hue*8)}-${Math.round(a.genome.body.skinHue2*8)}`)
  ).size;
}
function averageCurve(){
  return agents.length?agents.reduce((s,a)=>s+Math.abs(a.genome.body.bodyCurve),0)/agents.length:0;
}
function averagePain(){
  return agents.length?agents.reduce((s,a)=>s+sumArray(a.nervous.current.pain)/4,0)/agents.length:0;
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
function totalSequences(){return agents.reduce((s,a)=>s+a.sequenceModel.size,0);}
function averageNeurons(){
  return agents.length?(agents.reduce((s,a)=>s+a.hidden.length,0)/agents.length):0;
}
function averageMorphValue(key){
  return agents.length?(agents.reduce((s,a)=>s+(a.phenotype?.[key]||0),0)/agents.length):0;
}
function averageBodyMass(){
  return agents.length?(agents.reduce((s,a)=>s+morphologyMetrics(a).mass,0)/agents.length):0;
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
  document.getElementById('memories').textContent=totalMemories();
  document.getElementById('cells').textContent=totalCells();
  document.getElementById('positiveBonds').textContent=positive;
  document.getElementById('rivalries').textContent=rivals;
  document.getElementById('mentalSims').textContent=Math.round(totalMentalSims);
  document.getElementById('sequences').textContent=totalSequences();
  document.getElementById('imitations').textContent=Math.round(totalImitations);
  document.getElementById('avgNeurons').textContent=averageNeurons().toFixed(1);
  document.getElementById('originCount').textContent=originCount;
  document.getElementById('lineageState').textContent=extinct?'extinto':'vivo';
  document.getElementById('avgMuscle').textContent=averageMorphValue('muscle').toFixed(2);
  document.getElementById('avgFat').textContent=averageMorphValue('fat').toFixed(2);
  document.getElementById('avgBody').textContent=averageBodyMass().toFixed(2);
  document.getElementById('skinPatterns').textContent=uniqueSkinPatterns();
  document.getElementById('avgCurve').textContent=averageCurve().toFixed(2);
  document.getElementById('touchCount').textContent=Math.round(totalTouchSignals);
  document.getElementById('avgPain').textContent=averagePain().toFixed(2);
  document.getElementById('reflexCount').textContent=Math.round(totalReflexes);
  if(engineVersionEl) engineVersionEl.textContent=ENGINE_VERSION;
  if(renderStatusEl){
    const ok=renderer && renderer.domElement && renderer.domElement.width>0 && renderer.domElement.height>0;
    renderStatusEl.textContent=ok?`activo · ${agents.length} seres`:'sin canvas';
  }


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

CUERPO DINÁMICO
Crecimiento: ${a.phenotype.growth.toFixed(2)}
Músculo: ${a.phenotype.muscle.toFixed(2)}
Grasa: ${a.phenotype.fat.toFixed(2)}
Condición: ${a.phenotype.condition.toFixed(2)}
Madurez ósea: ${a.phenotype.skeletalMaturity.toFixed(2)}
Senescencia: ${a.phenotype.senescence.toFixed(2)}
Masa: ${morphologyMetrics(a).mass.toFixed(2)}
Fuerza: ${morphologyMetrics(a).strength.toFixed(2)}
Agilidad: ${morphologyMetrics(a).agility.toFixed(2)}
Resistencia estructural: ${morphologyMetrics(a).durability.toFixed(2)}

GENÉTICA CORPORAL
Escala adulta: ${a.genome.body.adultScale.toFixed(2)}
Altura relativa: ${a.genome.body.heightRatio.toFixed(2)}
Anchura relativa: ${a.genome.body.widthRatio.toFixed(2)}
Piernas/extremidades: ${a.genome.body.legRatio.toFixed(2)}
Grosor óseo: ${a.genome.body.boneThickness.toFixed(2)}
Potencial muscular: ${a.genome.body.musclePotential.toFixed(2)}
Capacidad de grasa: ${a.genome.body.fatStorage.toFixed(2)}
Velocidad de crecimiento: ${a.genome.body.growthRate.toFixed(2)}
Ritmo de envejecimiento: ${a.genome.body.agingRate.toFixed(2)}
Curvatura corporal: ${a.genome.body.bodyCurve.toFixed(2)}
Arco de columna: ${a.genome.body.spineArch.toFixed(2)}
Proporción de cabeza: ${a.genome.body.headRatio.toFixed(2)}
Patrón de piel: ${skinPatternName(a.genome.body.skinPattern)}
Contraste de piel: ${a.genome.body.skinContrast.toFixed(2)}
Rugosidad de piel: ${a.genome.body.skinRoughness.toFixed(2)}
Tamaño de articulación: ${a.genome.body.jointSize.toFixed(2)}

SISTEMA NERVIOSO
Tacto total: ${(sumArray(a.nervous.current.touch)/4).toFixed(2)}
Dolor total: ${(sumArray(a.nervous.current.pain)/4).toFixed(2)}
Temperatura: ${a.nervous.current.temperature.toFixed(2)}
Presión/carga: ${a.nervous.current.pressure.toFixed(2)}
Propiocepción: ${a.nervous.current.proprio.toFixed(2)}
Equilibrio/inestabilidad: ${a.nervous.current.balance.toFixed(2)}
Interocepción: ${a.nervous.current.intero.toFixed(2)}
Fatiga corporal: ${a.phenotype.fatigue.toFixed(2)}
Temperatura corporal: ${a.phenotype.bodyTemp.toFixed(2)}
Señales recibidas: ${a.nervous.signals}
Reflejos disparados: ${a.nervous.reflexes}

GENÉTICA SENSORIAL
Densidad táctil: ${a.genome.body.tactileDensity.toFixed(2)}
Nocicepción: ${a.genome.body.nociception.toFixed(2)}
Propiocepción: ${a.genome.body.proprioception.toFixed(2)}
Termosensibilidad: ${a.genome.body.thermalSense.toFixed(2)}
Interocepción: ${a.genome.body.interoception.toFixed(2)}
Velocidad de reflejo: ${a.genome.body.reflexSpeed.toFixed(2)}
Retraso nervioso: ${a.genome.body.nerveDelay.toFixed(2)}

AFECTO
Valencia: ${a.affect.valence.toFixed(2)}
Activación: ${a.affect.arousal.toFixed(2)}
Miedo: ${a.affect.fear.toFixed(2)}
Ira: ${a.affect.anger.toFixed(2)}
Apego: ${a.affect.attachment.toFixed(2)}
Curiosidad: ${a.affect.curiosity.toFixed(2)}

COGNICIÓN
Neuronas ocultas: ${a.hidden.length}
Profundidad de planificación: ${a.genome.cognition?.planningDepth||2}
Futuros simulados: ${a.mentalSimulations}
Secuencias aprendidas: ${a.sequenceModel.size}
Imitación acumulada: ${a.imitations.toFixed(1)}
Celdas conocidas: ${a.visited.size}
Memorias espaciales: ${a.spatialMemory.length}
Última recompensa: ${a.lastReward.toFixed(3)}
Plasticidad: ${t.plasticity.toFixed(4)}
Persistencia: ${t.persistence.toFixed(2)}
Exploración: ${t.exploration.toFixed(2)}
Imitación genética: ${(a.genome.cognition?.imitation||0).toFixed(2)}
Previsión genética: ${(a.genome.cognition?.foresight||0).toFixed(2)}

FUTUROS CONSIDERADOS
${(a.lastPlanTable||[]).map(x=>`${x.label}: total ${x.score.toFixed(2)} / futuro ${x.plan.toFixed(2)}`).join('\n')||'Aún no ha planeado'}

SONIDO
Frecuencia: ${Math.round(a.sound.freq)} Hz
Amplitud: ${a.sound.amp.toFixed(2)}
Pulso: ${a.sound.pulse.toFixed(2)}

MODELO DE RESULTADOS
${modelRows.join('\n')}

SECUENCIAS DESTACADAS
${[...a.sequenceModel.entries()].sort((x,y)=>y[1].q-x[1].q).slice(0,5).map(([k,v])=>`${k}: ${v.q.toFixed(2)}`).join('\n')||'Sin secuencias consolidadas'}

MEMORIAS ESPACIALES
${mems}`;
  }
}


function triggerExtinction(){
  extinct=true;
  extinctionAge=worldAge;
  paused=true;
  const overlay=document.getElementById('extinction');
  const stats=document.getElementById('extinctionStats');
  if(stats){
    stats.innerHTML=
      `Origen: <b>${originCount}</b><br>`+
      `Edad del mundo: <b>${worldAge.toFixed(1)}</b><br>`+
      `Generación máxima: <b>${peakGeneration}</b><br>`+
      `Nacimientos: <b>${births}</b><br>`+
      `Muertes: <b>${deaths}</b>`;
  }
  if(overlay)overlay.style.display='grid';
  const btn=document.getElementById('newOrigin');
  if(btn)btn.style.display='inline-block';
  const pauseBtn=document.getElementById('pause');
  if(pauseBtn)pauseBtn.textContent='Continuar';
}

function createNewOrigin(){
  if(!extinct)return;
  originCount++;
  extinct=false;
  paused=false;

  // Keep the existing world/material history, but create a fresh random lineage.
  const originSize=30;
  for(let i=0;i<originSize;i++){
    const p=randomGroundPos(CONFIG.WORLD*.55);
    makeAgent(randomGenome(),p,0,null);
  }

  const overlay=document.getElementById('extinction');
  if(overlay)overlay.style.display='none';
  const btn=document.getElementById('newOrigin');
  if(btn)btn.style.display='none';
  const pauseBtn=document.getElementById('pause');
  if(pauseBtn)pauseBtn.textContent='Pausar';
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

  births=0;deaths=0;worldAge=0;totalMentalSims=0;totalImitations=0;
  nextId=1;nextMaterialId=1;nextStructureId=1;selectedAgent=null;
  extinct=false;originCount=1;extinctionAge=0;peakGeneration=0;paused=false;totalTouchSignals=0;totalReflexes=0;
  const overlay=document.getElementById('extinction');if(overlay)overlay.style.display='none';
  const newOriginBtn=document.getElementById('newOrigin');if(newOriginBtn)newOriginBtn.style.display='none';
  document.getElementById('selected').style.display='none';
  for(let i=0;i<CONFIG.START_FOOD;i++)makeFood();
  for(let i=0;i<CONFIG.START_MATERIALS;i++)makeMaterial();
  for(let i=0;i<CONFIG.START_AGENTS;i++)makeAgent();
}

document.getElementById('pause').onclick=()=>{
  if(extinct)return;
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
document.getElementById('newOrigin').onclick=()=>createNewOrigin();
document.getElementById('extinctionOrigin').onclick=()=>createNewOrigin();

document.getElementById('anatomy').onclick=()=>setAnatomyView(!anatomyView);

const hud=document.getElementById('hud');
const hudToggle=document.getElementById('hudToggle');
function setHudCollapsed(collapsed){
  hud.classList.toggle('collapsed',collapsed);
  hudToggle.textContent=collapsed?'☰':'−';
  hudToggle.title=collapsed?'Mostrar panel':'Minimizar panel';
}
hudToggle.onclick=()=>setHudCollapsed(!hud.classList.contains('collapsed'));
if(window.innerWidth<=620)setHudCollapsed(true);

document.getElementById('selectedClose').onclick=()=>{
  selectedAgent=null;
  document.getElementById('selected').style.display='none';
};

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
console.info(`[Life Sim ${ENGINE_VERSION}] iniciada`, {
  agents: agents.length,
  food: food.length,
  materials: materials.length,
  visitedCells: agents.reduce((s,a)=>s+a.visited.size,0),
  avgNeurons: agents.reduce((s,a)=>s+a.hidden.length,0)/Math.max(1,agents.length),
  planningDepths: agents.slice(0,8).map(a=>a.genome.cognition?.planningDepth),
  avgBodyMass: averageBodyMass(),
  skinPatterns: uniqueSkinPatterns(),
  anatomyView,
  nervousInputDimension: 56
});
if(renderStatusEl) renderStatusEl.textContent='iniciando…';

let last=performance.now();
function loop(now){
  requestAnimationFrame(loop);
  const realDt=Math.min(.04,(now-last)/1000);last=now;controls.update();
  if(!paused){
    const scaled=realDt*timeScale;
    // Turbo mode: enough substeps for stability without exploding CPU cost at 100×.
    const steps=Math.max(1,Math.min(64,Math.ceil(scaled/.045)));
    const dt=Math.min(.085,scaled/steps);
    for(let s=0;s<steps;s++){
      worldAge+=dt;updateFood(dt);updateMaterials(dt);
      for(const a of [...agents])updateAgent(a,dt);
      if(agents.length===0&&!extinct){
        triggerExtinction();
        break;
      }
    }
  }
  updateAudio();
  updateHUD();
  if(!Number.isFinite(camera.position.x)||!Number.isFinite(camera.position.y)||!Number.isFinite(camera.position.z)){
    camera.position.set(24,21,28);
    controls.target.set(0,0,0);
    camera.lookAt(0,0,0);
    controls.update();
  }
  renderer.render(scene,camera);
}
requestAnimationFrame(loop);
