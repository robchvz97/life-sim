import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.179.1/build/three.module.js';

const ENGINE_VERSION='v17.7.4';
let auditOnly=new URLSearchParams(location.search).get('audit')==='1';
let auditSource=null,auditReady=false;
const auditSamples=[];
let lastAuditSampleAt=0;
const engineVersionEl=document.getElementById('engineVersion');
const renderStatusEl=document.getElementById('renderStatus');
if(engineVersionEl) engineVersionEl.textContent=ENGINE_VERSION;

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rand=(a=0,b=1)=>a+Math.random()*(b-a);
const sigmoid=x=>1/(1+Math.exp(-x));
const tanh=Math.tanh;

let RAPIER=null;
let physicsEnabled=false;
let physicsLoadError=null;
try{
  const rapierModule=await import('https://esm.sh/@dimforge/rapier3d-compat@0.20.0');
  RAPIER=rapierModule.default||rapierModule;
  await RAPIER.init();
  physicsEnabled=true;
}catch(err){
  physicsLoadError=err;
  console.error('Rapier no pudo cargar; usando locomoción híbrida de respaldo.',err);
}

const MODE_NAMES=['inercia','comida','ser cercano','material','estructura','recuerdo','zona nueva','evitación'];
const MODE_COUNT=8;

const CONFIG={
  WORLD:36, START_AGENTS:64, START_FOOD:280, START_MATERIALS:120,
  MAX_AGENTS:280, FOOD_MAX:650, MATERIAL_MAX:360, MAX_STRUCTURES:180,
  MATERIAL_RECYCLE_TARGET:318, STRUCTURE_RECYCLE_TARGET:148,
  FOOD_RESPAWN:1.90, MATERIAL_RESPAWN:.08,
  BASE_METABOLISM:.160, MOVE_COST:.088, WATER_DRAIN:.12,
  START_ENERGY:58, MAX_ENERGY:100, MAX_HEALTH:100, MAX_AGE:310,
  REPRO_MIN_ENERGY:54, REPRO_COST:20, REPRO_COOLDOWN:8.5,
  MIN_REPRO_AGE:18, JUVENILE_END:28, EMBRYO_MAX_AGE:180,
  EMBRYO_MAX:150, ARCHIVE_MAX:16, DEMO_WINDOW:100,
  BIOSPHERE_LOW_POP:8, BIOSPHERE_SEED_TARGET:12,
  EMERGENCY_RESCUE_TARGET:12, RESCUE_COOLDOWN:180, RESCUE_BIRTH_GAP:120,
  SENSE_RADIUS:10.2, SOCIAL_RADIUS:6.7, CONTACT_RADIUS:.95, BITE_RADIUS:1.05,
  MATERIAL_SENSE:7.5, MANIP_RADIUS:1.05,
  CULTURE_MIN_POP:24, CULTURE_TARGET_POP:34,
  MEMORY_LIMIT:26, SPATIAL_MEMORY_LIMIT:28,
  CELL_SIZE:3.0, DECISION_MIN:.45, DECISION_MAX:1.35,
  ATTACK_COOLDOWN:.8, AFFILIATE_COOLDOWN:1.0,
  SOCIAL_BOND_RADIUS:3.8, SOCIAL_BOND_DECAY:.00022,
  COLLECTIVE_WORK_RADIUS:2.35, ACTIVITY_SITE_HALF_LIFE:95,
  NAV_SAMPLE_RADIUS:2.35, NAV_LOOP_WINDOW:18, NAV_REPLAN_TIME:2.35,
  ENV_GRID:36, DAY_LENGTH:52, ENV_STEP:.9,
  TERRAIN_HEIGHT_SCALE:3.15, TERRAIN_MAX_SLOPE:1.45
};

let mutationRate=.10, sunFactor=1, timeScale=1, paused=false, worldAge=0;
let births=0,deaths=0,naturalBirths=0,rescueInsertions=0,nextId=1,nextMaterialId=1,nextStructureId=1;
let totalMentalSims=0,totalImitations=0;
let selectedAgent=null;
let extinct=false,originCount=1,extinctionAge=0,peakGeneration=0;
let anatomyView=false;
let totalTouchSignals=0,totalReflexes=0,totalTerrainRecoveries=0;
const embryos=[];
const genomeArchive=[];
const birthEvents=[];
const deathEvents=[];
const mealEvents=[];
const rescueInsertionEvents=[];
const rescueEpisodeEvents=[];
const fertileEncounterEvents=[];
const matingEventTimes=[];
const fertilePairLastSeen=new Map();
let totalRescueEpisodes=0,rescuePopulationEpisodes=0,rescueFertilityEpisodes=0,rescueLoadEpisodes=0;
let lastRescueReason='—';
const discoveryEvents=[];
const discoverySeen=new Set();
let demographicRescueActive=false;
let lastRescueAt=-999;
let maxPopulationSeen=0;
let recolonizations=0;
let biosphereRescues=0;
const worldMarks=[];
const heatSources=[];
let nextMarkId=1,totalThermalTransforms=0,totalIgnitions=0,totalMotorImitations=0,totalExternalReads=0;
let activeBurningMaterials=[];
const transferEvents=[];
let totalRegionalTrade=0,totalMateEvents=0;
let totalShapingEvents=0,totalProcedureCopies=0,totalFluidTransfers=0,totalMechanicalWork=0,totalWaterContacts=0,totalRainCaptures=0;
let totalEnvironmentalWaterAcquired=0,inheritedWaterAtLoad=0;
let nextRecycleAt=0,totalRecycledMaterials=0,totalCollapsedStructures=0;
const SEASON_LENGTH=95;

const RIGID_MAX_TIMESCALE=12;
const PHYSICS_FIXED_DT=1/60;
const PHYSICS_MAX_STEPS_PER_FRAME=5;
let physicsWorld=null;
let physicsAccumulator=0;
let rigidModeActive=false;
let totalPhysicalContacts=0;
let physicsGround=null;

let audioCtx=null,masterGain=null,audioEnabled=false,masterVolume=.18;


class SimpleOrbitControls{
  constructor(camera,dom){
    this.camera=camera;this.dom=dom;
    this.target=new THREE.Vector3();
    this.minDistance=8;this.maxDistance=75;this.maxPolarAngle=Math.PI*.48;
    this.enableDamping=false;
    this.mode=null;this.lastX=0;this.lastY=0;
    this.theta=.72;this.phi=1.05;this.radius=42;
    this.keys=new Set();this.keySpeed=16;
    this.mobileMove={x:0,z:0};
    this.touchPointers=new Map();
    this.touchCenter=null;this.touchDistance=0;
    dom.style.touchAction='none';dom.style.overscrollBehavior='none';

    const sync=()=>{
      const off=this.camera.position.clone().sub(this.target);
      this.radius=Math.max(.1,off.length());
      this.phi=Math.acos(clamp(off.y/this.radius,-1,1));
      this.theta=Math.atan2(off.x,off.z);
    };
    sync();

    const interactiveTag=el=>{
      const tag=el?.tagName?.toLowerCase();
      return tag==='input'||tag==='button'||tag==='textarea'||tag==='select';
    };
    const touchMetrics=()=>{
      const pts=[...this.touchPointers.values()];
      if(!pts.length)return {center:null,distance:0};
      const center={
        x:pts.reduce((s,p)=>s+p.x,0)/pts.length,
        y:pts.reduce((s,p)=>s+p.y,0)/pts.length
      };
      let distance=0;
      if(pts.length>=2)distance=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);
      return {center,distance};
    };

    dom.addEventListener('contextmenu',e=>e.preventDefault());

    dom.addEventListener('pointerdown',e=>{
      if(e.pointerType==='touch'){
        e.preventDefault();
        this.touchPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
        const m=touchMetrics();this.touchCenter=m.center;this.touchDistance=m.distance;
        this.mode=this.touchPointers.size>=2?'touchGesture':'touchRotate';
        try{dom.setPointerCapture(e.pointerId);}catch{}
        return;
      }
      if(e.button===0)this.mode='rotate';
      else if(e.button===2||e.button===1)this.mode='pan';
      else return;
      this.lastX=e.clientX;this.lastY=e.clientY;
      try{dom.setPointerCapture(e.pointerId);}catch{}
    });

    dom.addEventListener('pointermove',e=>{
      if(e.pointerType==='touch'){
        if(!this.touchPointers.has(e.pointerId))return;
        e.preventDefault();
        this.touchPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
        const m=touchMetrics();
        if(this.touchPointers.size===1&&m.center&&this.touchCenter){
          const dx=m.center.x-this.touchCenter.x,dy=m.center.y-this.touchCenter.y;
          this.theta-=dx*.0045;
          this.phi=clamp(this.phi+dy*.0042,.12,this.maxPolarAngle);
        }else if(this.touchPointers.size>=2&&m.center&&this.touchCenter){
          const dx=m.center.x-this.touchCenter.x,dy=m.center.y-this.touchCenter.y;
          this.panPixels(dx,dy,.78);
          if(this.touchDistance>8&&m.distance>8){
            const ratio=this.touchDistance/m.distance;
            this.radius=clamp(this.radius*ratio,this.minDistance,this.maxDistance);
          }
        }
        this.touchCenter=m.center;this.touchDistance=m.distance;
        this.update();
        return;
      }

      if(!this.mode)return;
      const dx=e.clientX-this.lastX,dy=e.clientY-this.lastY;
      this.lastX=e.clientX;this.lastY=e.clientY;
      if(this.mode==='rotate'){
        this.theta-=dx*.006;
        this.phi=clamp(this.phi+dy*.006,.12,this.maxPolarAngle);
      }else if(this.mode==='pan'){
        this.panPixels(dx,dy);
      }
      this.update();
    },{passive:false});

    const end=e=>{
      if(e.pointerType==='touch'){
        this.touchPointers.delete(e.pointerId);
        const m=touchMetrics();this.touchCenter=m.center;this.touchDistance=m.distance;
        this.mode=this.touchPointers.size>=2?'touchGesture':this.touchPointers.size===1?'touchRotate':null;
      }else this.mode=null;
      try{dom.releasePointerCapture(e.pointerId);}catch{}
    };
    dom.addEventListener('pointerup',end);
    dom.addEventListener('pointercancel',end);

    dom.addEventListener('wheel',e=>{
      e.preventDefault();
      this.radius=clamp(this.radius*Math.exp(e.deltaY*.0012),this.minDistance,this.maxDistance);
      this.update();
    },{passive:false});

    window.addEventListener('keydown',e=>{
      if(interactiveTag(document.activeElement))return;
      const k=e.key.toLowerCase();
      if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift'].includes(k)){
        this.keys.add(k);
        if(k.startsWith('arrow'))e.preventDefault();
      }
    });
    window.addEventListener('keyup',e=>this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur',()=>{this.keys.clear();this.mobileMove.x=0;this.mobileMove.z=0;});
  }

  clampTarget(){
    const r=Math.hypot(this.target.x,this.target.z);
    const maxR=CONFIG.WORLD*.96;
    if(r>maxR){const s=maxR/r;this.target.x*=s;this.target.z*=s;}
    this.target.y=0;
  }

  groundAxes(){
    const forward=new THREE.Vector3(-Math.sin(this.theta),0,-Math.cos(this.theta)).normalize();
    const right=new THREE.Vector3(Math.cos(this.theta),0,-Math.sin(this.theta)).normalize();
    return {forward,right};
  }

  panPixels(dx,dy,mult=1){
    const {forward,right}=this.groundAxes();
    const scale=this.radius*.0019*mult;
    this.target.addScaledVector(right,-dx*scale);
    this.target.addScaledVector(forward,dy*scale);
    this.clampTarget();
  }

  setMobileMove(x,z){
    this.mobileMove.x=clamp(x,-1,1);this.mobileMove.z=clamp(z,-1,1);
  }

  moveTarget(dt){
    if(!dt)return;
    const {forward,right}=this.groundAxes();
    let x=this.mobileMove.x||0,z=this.mobileMove.z||0;
    if(this.keys.has('w')||this.keys.has('arrowup'))z+=1;
    if(this.keys.has('s')||this.keys.has('arrowdown'))z-=1;
    if(this.keys.has('d')||this.keys.has('arrowright'))x+=1;
    if(this.keys.has('a')||this.keys.has('arrowleft'))x-=1;
    if(!x&&!z)return;

    const mag=Math.min(1,Math.hypot(x,z));
    const dir=new THREE.Vector3();
    dir.addScaledVector(right,x).addScaledVector(forward,z);
    if(dir.lengthSq()>0)dir.normalize();
    const boost=this.keys.has('shift')?2.7:1;
    const speed=this.keySpeed*boost*(.52+this.radius/48)*(.32+.68*mag);
    this.target.addScaledVector(dir,speed*dt);
    this.clampTarget();
  }

  focusPoint(point){
    this.target.set(point.x,0,point.z);this.clampTarget();this.update();
  }

  update(dt=0){
    this.moveTarget(dt);
    this.radius=clamp(this.radius,this.minDistance,this.maxDistance);
    this.phi=clamp(this.phi,.12,this.maxPolarAngle);
    const s=Math.sin(this.phi);
    this.camera.position.set(
      this.target.x+this.radius*s*Math.sin(this.theta),
      this.target.y+this.radius*Math.cos(this.phi),
      this.target.z+this.radius*s*Math.cos(this.theta)
    );
    this.camera.lookAt(this.target);
  }
}

const app=document.getElementById('app');
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x0d1720);
scene.fog=new THREE.FogExp2(0x091016,.017);

const camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.1,420);
camera.position.set(24,21,28);

let renderer,graphicsAvailable=false;
try{
  if(auditOnly)throw new Error('Modo auditoría solicitado');
  renderer=new THREE.WebGLRenderer({antialias:true});graphicsAvailable=true;
}catch(error){
  auditOnly=true;
  console.warn('Life Sim: auditoría sin WebGL; partida principal protegida.',error.message);
  const canvas=document.createElement('canvas');
  renderer={domElement:canvas,shadowMap:{},capabilities:{getMaxAnisotropy:()=>1},
    setPixelRatio(){},setSize(w,h){canvas.width=w;canvas.height=h;},render(){}};
}
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.02;
renderer.domElement.style.position='absolute';
renderer.domElement.style.inset='0';
renderer.domElement.style.width='100%';
renderer.domElement.style.height='100%';
renderer.domElement.style.zIndex='0';
app.appendChild(renderer.domElement);

const controls=new SimpleOrbitControls(camera,renderer.domElement);
controls.enableDamping=true;
controls.target.set(0,0,0);
controls.maxPolarAngle=Math.PI*.48;
controls.minDistance=8;
controls.maxDistance=75;
camera.lookAt(0,0,0);
controls.update();

const movePad=document.getElementById('movePad'),moveKnob=document.getElementById('moveKnob');
if(movePad&&moveKnob){
  let navPointer=null;
  const resetPad=()=>{
    navPointer=null;moveKnob.style.transform='translate(0px,0px)';controls.setMobileMove(0,0);
  };
  const updatePad=e=>{
    const r=movePad.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
    let dx=e.clientX-cx,dy=e.clientY-cy;
    const max=r.width*.32,len=Math.hypot(dx,dy);
    if(len>max){dx*=max/len;dy*=max/len;}
    moveKnob.style.transform=`translate(${dx}px,${dy}px)`;
    controls.setMobileMove(dx/max,-dy/max);
  };
  movePad.addEventListener('pointerdown',e=>{
    navPointer=e.pointerId;movePad.setPointerCapture?.(e.pointerId);e.preventDefault();updatePad(e);
  });
  movePad.addEventListener('pointermove',e=>{if(e.pointerId===navPointer){e.preventDefault();updatePad(e);}});
  movePad.addEventListener('pointerup',e=>{if(e.pointerId===navPointer)resetPad();});
  movePad.addEventListener('pointercancel',resetPad);
}
const mobileCenter=document.getElementById('mobileCenter');
if(mobileCenter)mobileCenter.addEventListener('click',()=>{
  if(selectedAgent)controls.focusPoint(selectedAgent.mesh.position);
  else controls.focusPoint(new THREE.Vector3(0,0,0));
});

const skyLight=new THREE.HemisphereLight(0xaad7ff,0x17301e,.92);
scene.add(skyLight);

// Render-only lights for the human observer.
// These are deliberately NOT referenced by sensors, climate, energy or daylightLevel().
const moonLight=new THREE.DirectionalLight(0xb9d8ff,.12);
moonLight.position.set(-18,28,-12);
moonLight.castShadow=false;
scene.add(moonLight);

const observerFill=new THREE.HemisphereLight(0xd8edff,0x54634e,0);
scene.add(observerFill);
const observerKey=new THREE.DirectionalLight(0xffffff,0);
observerKey.position.set(18,30,22);
observerKey.castShadow=false;
scene.add(observerKey);

let observerVision=false;
try{observerVision=localStorage.getItem('lifeSimObserverVision')==='1';}catch{}

const sun=new THREE.DirectionalLight(0xfff2cf,1.3);
sun.position.set(-12,24,10);
sun.castShadow=true;
sun.shadow.mapSize.set(1024,1024);
sun.shadow.camera.left=-42;sun.shadow.camera.right=42;
sun.shadow.camera.top=42;sun.shadow.camera.bottom=-42;
scene.add(sun);

const ground=new THREE.Mesh(
  new THREE.CircleGeometry(CONFIG.WORLD,96),
  new THREE.MeshStandardMaterial({color:0x5a5639,roughness:.96})
);
ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;ground.visible=false;scene.add(ground);
const grid=new THREE.GridHelper(CONFIG.WORLD*1.55,24,0x456454,0x284136);
grid.position.y=.035;
grid.material.transparent=true;
grid.material.opacity=.018;
grid.visible=false;
scene.add(grid);


const pond=new THREE.Mesh(
  new THREE.CircleGeometry(7.6,64),
  new THREE.MeshStandardMaterial({color:0x1d6683,transparent:true,opacity:.76,roughness:.25})
);
pond.rotation.x=-Math.PI/2;pond.position.set(-9,.006,8);pond.visible=false;scene.add(pond);

const ring=new THREE.Mesh(
  new THREE.RingGeometry(CONFIG.WORLD,CONFIG.WORLD+.3,96),
  new THREE.MeshBasicMaterial({color:0x4d6a52,side:THREE.DoubleSide})
);
ring.rotation.x=-Math.PI/2;ring.position.y=.015;scene.add(ring);

const foodGroup=new THREE.Group(),agentGroup=new THREE.Group(),materialGroup=new THREE.Group(),structureGroup=new THREE.Group();
const markGroup=new THREE.Group(),phenomenaGroup=new THREE.Group(),terrainGroup=new THREE.Group();
scene.add(terrainGroup,foodGroup,agentGroup,materialGroup,structureGroup,markGroup,phenomenaGroup);
const originBeacon=new THREE.Mesh(
  new THREE.CylinderGeometry(.10,.10,2.2,10),
  new THREE.MeshStandardMaterial({color:0x7de38f,emissive:0x173a1f,roughness:.5})
);
originBeacon.position.set(0,1.1,0);
scene.add(originBeacon);


const food=[],agents=[],materials=[],structures=[];

const ENV_GRID=CONFIG.ENV_GRID;
const ENV_CELL_SIZE=(CONFIG.WORLD*2)/ENV_GRID;
let livingWorldCells=Array(ENV_GRID*ENV_GRID).fill(null);
let livingWorldActive=[];
let terrainSurfaceMesh=null,terrainWaterMesh=null,terrainMudMesh=null,grassBladeMesh=null;
let grassAnchors=[];
let livingWorldAccumulator=0,livingVisualAccumulator=0;

const DAY_SKY=new THREE.Color(0x8fc2db);
const DUSK_SKY=new THREE.Color(0xb47a69);
const NIGHT_SKY=new THREE.Color(0x07111d);
const DAY_FOG=new THREE.Color(0x90a99f);
const NIGHT_FOG=new THREE.Color(0x071016);
const DAY_SUN=new THREE.Color(0xfff0c2);
const DUSK_SUN=new THREE.Color(0xffa45b);

function initRigidWorld(){
  if(!physicsEnabled||!RAPIER)return;
  physicsWorld=new RAPIER.World({x:0,y:-9.81,z:0});
  physicsWorld.timestep=PHYSICS_FIXED_DT;
  physicsWorld.integrationParameters.maxCcdSubsteps=2;

  // Solid ground.
  physicsGround=physicsWorld.createCollider(
    RAPIER.ColliderDesc.cuboid(CONFIG.WORLD+4,.18,CONFIG.WORLD+4)
      .setTranslation(0,-.20,0)
      .setFriction(1.15)
      .setRestitution(.02)
  );

  // Circular boundary approximated by fixed rigid walls.
  const wallCount=28;
  const wallLen=(Math.PI*2*CONFIG.WORLD/wallCount)*.58;
  for(let i=0;i<wallCount;i++){
    const ang=i/wallCount*Math.PI*2;
    const x=Math.sin(ang)*(CONFIG.WORLD+.15);
    const z=Math.cos(ang)*(CONFIG.WORLD+.15);
    const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,ang,0));
    const desc=RAPIER.RigidBodyDesc.fixed()
      .setTranslation(x,1.0,z)
      .setRotation({x:q.x,y:q.y,z:q.z,w:q.w});
    const rb=physicsWorld.createRigidBody(desc);
    physicsWorld.createCollider(
      RAPIER.ColliderDesc.cuboid(wallLen,1.0,.16)
        .setFriction(.9)
        .setRestitution(.08),
      rb
    );
  }
}
initRigidWorld();


const MATERIAL_TYPES={
  fiber:{color:0xa4774c,mass:.55,hardness:.18,length:1.35,fertility:.10,energy:.5,bind:.92,flexibility:.92,edgePotential:.05,resonance:.18,durability:.42,heatCapacity:.72,conductivity:.18,flammability:.96,ignitionTemp:215,thermalTransform:360,fractureResistance:.22,abrasionResistance:.18,roundness:.08,hollowPotential:.18,sealPotential:.72,softeningTemp:150},
  stone:{color:0x9aa2aa,mass:1.45,hardness:.92,length:.55,fertility:0,energy:0,bind:.04,flexibility:.04,edgePotential:.64,resonance:.28,durability:.96,heatCapacity:.86,conductivity:.62,flammability:0,ignitionTemp:9999,thermalTransform:680,fractureResistance:.82,abrasionResistance:.91,roundness:.38,hollowPotential:.02,sealPotential:.05,softeningTemp:760},
  mineral:{color:0xd4c17a,mass:1.05,hardness:.72,length:.72,fertility:0,energy:0,bind:.08,flexibility:.08,edgePotential:.88,resonance:.82,durability:.82,heatCapacity:.58,conductivity:.84,flammability:0,ignitionTemp:9999,thermalTransform:520,fractureResistance:.65,abrasionResistance:.70,roundness:.52,hollowPotential:.03,sealPotential:.12,softeningTemp:540},
  biomass:{color:0x62a968,mass:.48,hardness:.10,length:.65,fertility:.85,energy:3.2,bind:.38,flexibility:.62,edgePotential:.02,resonance:.08,durability:.24,heatCapacity:.78,conductivity:.15,flammability:.86,ignitionTemp:175,thermalTransform:310,fractureResistance:.18,abrasionResistance:.12,roundness:.24,hollowPotential:.38,sealPotential:.28,softeningTemp:105}
};

function applyNaturalAffordances(p,type,custom=null){
  const explicit=!!(custom&&custom.props&&('capacity' in custom.props || 'hollowPotential' in custom.props || 'sealPotential' in custom.props || 'concavity' in custom.props));
  if(explicit)return p;
  const hardness=clamp(p.hardness||0,0,1.2)/1.2;
  const softnessBias=1-hardness;
  const flexBias=clamp(p.flexibility||0,0,1.4)/1.4;
  const lengthBias=clamp((p.length||.6)/1.8,0,1);
  const typeBonus=(type==='biomass'?.26:0)+(type==='fiber'?.20:0)+(type==='stone'?-0.15:0)+(type==='mineral'?-0.10:0);
  const hollowBase=clamp((p.hollowPotential||0)+softnessBias*.18+flexBias*.14+lengthBias*.08+typeBonus+rand(-.08,.18),0,1.45);
  const bowlChance=clamp(.05+hollowBase*.42+(p.sealPotential||0)*.12,0,.92);
  const formsBowl=Math.random()<bowlChance;
  const concavity=formsBowl?clamp(.18+hollowBase*.72+rand(-.05,.22),0,1.55):clamp(rand(0,.08)+hollowBase*.08,0,.18);
  const rim=formsBowl?clamp(.16+(p.sealPotential||0)*.72+rand(-.04,.16),0,1.25):clamp((p.sealPotential||0)*.08,0,.16);
  const weightPenalty=clamp((p.mass||1)*.12,0,.32);
  const capacity=formsBowl?clamp(concavity*(.16+.34*rim)*(1.08-weightPenalty),0,1.35):0;
  p.concavity=concavity;
  p.rimRetention=rim;
  p.capacity=Math.max(p.capacity||0,capacity);
  p.hollowPotential=Math.max(p.hollowPotential||0,concavity);
  p.sealPotential=Math.max(p.sealPotential||0,rim);
  p.containerLike=(p.capacity||0)>.045;
  return p;
}


function createHeatSources(){
  if(heatSources.length)return;
  const data=[
    {x:-17,z:-11,temp:540,strength:1.00},
    {x:14,z:15,temp:430,strength:.82},
    {x:18,z:-8,temp:610,strength:1.12}
  ];
  for(const d of data){
    const group=new THREE.Group();
    const rock=new THREE.Mesh(new THREE.CylinderGeometry(.55,.78,.26,10),new THREE.MeshStandardMaterial({color:0x45372f,emissive:0x6b1808,emissiveIntensity:.7,roughness:.85}));
    rock.position.y=.12;rock.castShadow=true;group.add(rock);
    const glow=new THREE.Mesh(new THREE.RingGeometry(.45,1.25,24),new THREE.MeshBasicMaterial({color:0xff5a22,transparent:true,opacity:.34,side:THREE.DoubleSide}));
    glow.rotation.x=-Math.PI/2;glow.position.y=.025;group.add(glow);
    const core=new THREE.Mesh(new THREE.SphereGeometry(.24,12,8),new THREE.MeshBasicMaterial({color:0xff6a22}));
    core.position.y=.24;group.add(core);
    const light=new THREE.PointLight(0xff6a22,1.35,6,2);light.position.y=.55;group.add(light);
    group.position.set(d.x,0,d.z);phenomenaGroup.add(group);heatSources.push({...d,group});
  }
}
createHeatSources();

function materialPosition(m){
  return m?.mesh?.getWorldPosition?m.mesh.getWorldPosition(new THREE.Vector3()):m.mesh.position;
}
function environmentTemperatureAt(pos){
  const cell=livingCellAt(pos);
  let temp=cell?.temperature??baseClimateTemperature(pos);
  for(const h of heatSources){
    const d=Math.hypot(pos.x-h.x,pos.z-h.z);
    if(d<6.5)temp+=h.strength*250*Math.pow(clamp(1-d/6.5,0,1),1.8);
  }
  for(const m of activeBurningMaterials){
    const mp=materialPosition(m),d=pos.distanceTo(mp);
    if(d<4.5)temp+=270*Math.pow(clamp(1-d/4.5,0,1),1.55);
  }
  return temp;
}

function renderDiscoveryLog(){
  const list=document.getElementById('discoveryList');if(!list)return;
  if(!discoveryEvents.length){list.innerHTML='<div class="discEvent"><span class="discTitle">Esperando descubrimientos…</span></div>';return;}
  list.innerHTML=discoveryEvents.slice(-28).reverse().map(e=>
    `<div class="discEvent"><span class="discTime">t ${e.time.toFixed(1)}</span><span class="discTitle">${e.icon} ${e.title}</span><div class="discDetail">${e.detail}</div></div>`
  ).join('');
}
function recordDiscovery(key,icon,title,detail,pos=null){
  if(key&&discoverySeen.has(key))return false;
  if(key)discoverySeen.add(key);
  discoveryEvents.push({key:key||`event:${worldAge}:${discoveryEvents.length}`,icon,title,detail,time:worldAge,pos:pos?vecToArray(pos):null});
  if(discoveryEvents.length>80)discoveryEvents.splice(0,discoveryEvents.length-80);
  renderDiscoveryLog();
  return true;
}
function createFireVisual(m){
  if(m.fireVisual)return m.fireVisual;
  const g=new THREE.Group();
  const flame1=new THREE.Mesh(new THREE.ConeGeometry(.15,.55,8),new THREE.MeshBasicMaterial({color:0xff6a18,transparent:true,opacity:.92}));
  flame1.position.y=.28;g.add(flame1);
  const flame2=new THREE.Mesh(new THREE.ConeGeometry(.09,.38,8),new THREE.MeshBasicMaterial({color:0xffd45a,transparent:true,opacity:.92}));
  flame2.position.y=.31;g.add(flame2);
  const smoke=new THREE.Mesh(new THREE.SphereGeometry(.13,8,6),new THREE.MeshBasicMaterial({color:0x5a5b5d,transparent:true,opacity:.28}));
  smoke.position.y=.68;g.add(smoke);
  phenomenaGroup.add(g);m.fireVisual=g;return g;
}
function removeFireVisual(m){
  if(!m?.fireVisual)return;
  const g=m.fireVisual;phenomenaGroup.remove(g);g.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});m.fireVisual=null;
}
function updateFireVisuals(){
  for(const m of materials){
    if(!m.burning){if(m.fireVisual)removeFireVisual(m);continue;}
    const g=createFireVisual(m),p=materialPosition(m);g.position.copy(p);g.position.y+=.18;
    const pulse=.86+.18*Math.sin(worldAge*8+m.id);g.scale.set(pulse,1/pulse,pulse);
    const smoke=g.children[2];if(smoke){smoke.position.y=.68+.08*Math.sin(worldAge*2+m.id);smoke.material.opacity=.20+.10*(.5+.5*Math.sin(worldAge*3+m.id));}
  }
}

function updateMaterialAppearance(m){
  const mat=m.mesh?.material;if(!mat)return;
  if(m.burning){mat.emissive?.setHex(0xff3a08);mat.emissiveIntensity=1.2;createFireVisual(m);}
  else{mat.emissive?.setHex(0x000000);mat.emissiveIntensity=0;removeFireVisual(m);}
  if(m.thermalState==='charred')mat.color.setHex(0x302b28);
  else if(m.thermalState==='heat-treated' && m.type==='mineral')mat.color.setHex(0xb68b55);
  else if(m.thermalState==='heat-treated' && m.type==='stone')mat.color.setHex(0x817b78);
}
function thermalTransformMaterial(m){
  if(m.transformedLevel>=1)return;
  m.transformedLevel=1;m.thermalState='heat-treated';totalThermalTransforms++;
  recordDiscovery(`thermal:${m.type}`,'♨️','Transformación térmica',`Un material ${m.type} cambió sus propiedades por exposición prolongada al calor.`,materialPosition(m));
  const p=m.props;
  if(m.type==='mineral'){
    p.hardness=clamp((p.hardness||.7)*1.14,0,1.35);p.edgePotential=clamp((p.edgePotential||.7)*1.10,0,1.35);p.durability=clamp((p.durability||.7)*1.06,0,1.4);
  }else if(m.type==='stone'){
    p.fractureResistance=clamp((p.fractureResistance||.8)*.88,.05,1.5);p.edgePotential=clamp((p.edgePotential||.6)*1.08,0,1.35);
  }else if(m.type==='composite'){
    p.bind=clamp((p.bind||.4)*(1.03-(p.flammability||0)*.16),0,1.4);p.hardness=clamp((p.hardness||.5)*1.04,0,1.35);
  }
  updateMaterialAppearance(m);
}
function finishCombustion(m){
  m.burning=false;m.burnTime=0;m.thermalState='charred';m.transformedLevel=Math.max(1,m.transformedLevel||0);
  m.props.flammability*=.08;m.props.fertility*=.08;m.props.energy*=.15;m.props.mass=Math.max(.10,m.props.mass*.58);
  m.props.durability*=.55;m.props.hardness=clamp(m.props.hardness*.75+.08,0,1);m.props.bind*=.52;m.temperature=Math.min(m.temperature,420);
  totalThermalTransforms++;updateMaterialAppearance(m);
}

function recordEnvironmentalWaterGain(m,before,source){
  const after=m?.waterAmount||0,delta=Math.max(0,after-before);
  if(delta<=0)return 0;
  totalEnvironmentalWaterAcquired+=delta;
  m.lastWaterSource=source;
  m.environmentalWaterGained=(m.environmentalWaterGained||0)+delta;
  return delta;
}

function updateThermodynamics(dt){
  activeBurningMaterials=materials.filter(m=>m.burning);
  for(const m of materials){
    const pos=materialPosition(m);let target=environmentTemperatureAt(pos);
    if(inPond(pos)){
      target=Math.min(target,16);m.wetness=clamp(m.wetness+dt*.18,0,1);
      const capacity=containerCapacity(m);
      if(capacity>.065){
        const before=m.waterAmount||0;
        const openness=clamp(.35+(m.props.hollowPotential||0)*.35+(m.props.sealPotential||0)*.15,.25,.9);
        m.waterAmount=clamp(before+dt*1.05*capacity*openness,0,capacity);
        recordEnvironmentalWaterGain(m,before,'pond');
        m.waterTemp+=(16-m.waterTemp)*clamp(dt*.28,0,.35);
        if(before<.008&&m.waterAmount>.008){
          totalWaterContacts++;
          recordDiscovery('container:water:first','💧','Primer objeto con agua','Un objeto con cavidad retuvo agua simplemente por inmersión.',pos);
        }
      }
    }else m.wetness=clamp(m.wetness-dt*.012,0,1);
    const rain=rainIntensity();
    if(rain>.03 && !m.carriedBy){
      m.wetness=clamp(m.wetness+dt*.12*rain,0,1);
      const capRain=containerCapacity(m);
      if(capRain>.065){
        const beforeRain=m.waterAmount||0;
        const openness=clamp(.30+(m.props.hollowPotential||0)*.42+(m.props.sealPotential||0)*.08,.22,.95);
        m.waterAmount=clamp(beforeRain+dt*.34*rain*capRain*openness,0,capRain);
        const rainDelta=recordEnvironmentalWaterGain(m,beforeRain,'rain');
        m.waterTemp+=(18-m.waterTemp)*clamp(dt*.12*rain,0,.22);
        if(beforeRain<.006&&rainDelta>.0015){
          totalRainCaptures++;
          recordDiscovery('rain:capture:first','🌧️','Primera captación de lluvia','Un objeto con cavidad acumuló agua de lluvia sin una acción especial.',pos);
        }
      }
    }

    if((m.waterAmount||0)>0){
      m.waterTemp+=(m.temperature-m.waterTemp)*clamp(dt*.018*(m.props.conductivity||.3),0,.12);
      if(m.waterTemp>82)m.waterAmount=Math.max(0,m.waterAmount-dt*.0025*(1+(m.waterTemp-82)/50));
    }
    for(const b of activeBurningMaterials){
      if(b===m)continue;const d=pos.distanceTo(materialPosition(b));
      if(d<2.7)target+=240*Math.pow(clamp(1-d/2.7,0,1),1.3)*(b.props.conductivity||.3);
    }
    const cap=Math.max(.18,m.props.heatCapacity||.7),cond=Math.max(.04,m.props.conductivity||.25);
    m.temperature+=(target-m.temperature)*clamp(dt*(.10+cond*.18)/cap,0,.32);
    updateMaterialSoftness(m);
    if(m.temperature>(m.props.thermalTransform||650)){m.thermalExposure+=dt;if(m.thermalExposure>4.5)thermalTransformMaterial(m);}
    else m.thermalExposure=Math.max(0,m.thermalExposure-dt*.25);
    if(!m.burning&&(m.props.flammability||0)>.05&&m.temperature>(m.props.ignitionTemp||9999)&&m.wetness<.62){
      const chance=clamp((m.temperature-m.props.ignitionTemp)/180,0,1)*(m.props.flammability||0)*(1-m.wetness);
      if(Math.random()<1-Math.exp(-dt*chance*.24)){m.burning=true;m.burnTime=0;totalIgnitions++;updateMaterialAppearance(m);recordDiscovery(`ignition:${m.type}`,'🔥','Combustión descubierta',`Un material ${m.type} alcanzó ignición.`,materialPosition(m));}
    }
    if(m.burning){
      m.burnTime+=dt;m.temperature+=(620-m.temperature)*clamp(dt*.34,0,.5);
      m.props.durability=Math.max(.03,m.props.durability-dt*.004*(m.props.flammability||.5));
      const burnLimit=24*(.55+(m.props.mass||1)*.35);
      if(m.burnTime>burnLimit||m.props.durability<.055)finishCombustion(m);
    }
  }
  activeBurningMaterials=materials.filter(m=>m.burning);
}
function activeCombustionCount(){return activeBurningMaterials.length;}
function transformedMaterialCount(){return materials.filter(m=>(m.transformedLevel||0)>0).length;}


function envHash(ix,iz,k=0){
  const x=Math.sin(ix*12.9898+iz*78.233+k*37.719)*43758.5453;
  return x-Math.floor(x);
}
function envIndex(ix,iz){return iz*ENV_GRID+ix;}
function livingCellAt(pos){
  const ix=Math.floor((pos.x+CONFIG.WORLD)/ENV_CELL_SIZE);
  const iz=Math.floor((pos.z+CONFIG.WORLD)/ENV_CELL_SIZE);
  if(ix<0||iz<0||ix>=ENV_GRID||iz>=ENV_GRID)return null;
  return livingWorldCells[envIndex(ix,iz)]||null;
}
function dayPhase01(){return ((worldAge%CONFIG.DAY_LENGTH)+CONFIG.DAY_LENGTH)%CONFIG.DAY_LENGTH/CONFIG.DAY_LENGTH;}
function daylightLevel(){
  const phase=dayPhase01();
  const solar=Math.sin((phase-.25)*Math.PI*2);
  return clamp((solar+.12)/1.12,.035,1);
}
function dayStateLabel(){
  const p=dayPhase01(),d=daylightLevel();
  if(d<.12)return 'noche';
  if(p<.34)return 'amanecer';
  if(p<.70)return 'día';
  return 'atardecer';
}
function baseClimateTemperature(pos){
  const cell=livingCellAt(pos);
  const altitude=terrainHeightAt(pos);
  const wet=cell?.moisture||0;
  const light=daylightLevel();
  return 12+14*light*sunFactor+seasonTemperatureOffset()-altitude*.72-wet*1.6;
}
function makeTerrainNoiseTexture(){
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#d9d2bd';ctx.fillRect(0,0,128,128);
  for(let i=0;i<1550;i++){
    const x=envHash(i,3,81)*128,y=envHash(i,7,82)*128;
    const r=.25+envHash(i,9,83)*1.15;
    const v=envHash(i,11,84);
    ctx.fillStyle=v>.55?'rgba(255,255,245,.20)':'rgba(80,62,38,.12)';
    ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  }
  const tex=new THREE.CanvasTexture(canvas);
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  tex.repeat.set(13,13);
  tex.colorSpace=THREE.SRGBColorSpace;
  tex.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
  return tex;
}
function makeCircleAlphaTexture(){
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
  const ctx=canvas.getContext('2d');
  const g=ctx.createRadialGradient(64,64,50,64,64,64);
  g.addColorStop(0,'white');g.addColorStop(.92,'white');g.addColorStop(1,'black');
  ctx.fillStyle='black';ctx.fillRect(0,0,128,128);
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(64,64,63,0,Math.PI*2);ctx.fill();
  const tex=new THREE.CanvasTexture(canvas);
  tex.wrapS=tex.wrapT=THREE.ClampToEdgeWrapping;
  return tex;
}
function initLivingWorldMeshes(){
  for(const obj of [terrainSurfaceMesh,terrainWaterMesh,terrainMudMesh,grassBladeMesh]){
    if(!obj)continue;
    terrainGroup.remove(obj);
    obj.geometry?.dispose();
    if(Array.isArray(obj.material))obj.material.forEach(m=>m.dispose());
    else obj.material?.dispose();
  }
  terrainSurfaceMesh=terrainWaterMesh=terrainMudMesh=grassBladeMesh=null;
  grassAnchors=[];

  // One continuous surface: vertex colors interpolate between environmental cells,
  // so the world no longer looks like a chessboard.
  const geo=new THREE.PlaneGeometry(CONFIG.WORLD*2,CONFIG.WORLD*2,ENV_GRID,ENV_GRID);
  const count=geo.attributes.position.count;
  const colors=new Float32Array(count*3);
  geo.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const circleAlpha=makeCircleAlphaTexture();
  const mat=new THREE.MeshStandardMaterial({
    color:0xffffff,vertexColors:true,roughness:.94,metalness:0,
    map:makeTerrainNoiseTexture(),alphaMap:circleAlpha,alphaTest:.10
  });
  terrainSurfaceMesh=new THREE.Mesh(geo,mat);
  terrainSurfaceMesh.rotation.x=-Math.PI/2;
  terrainSurfaceMesh.position.y=.008;
  terrainSurfaceMesh.receiveShadow=true;
  terrainSurfaceMesh.renderOrder=-2;
  terrainGroup.add(terrainSurfaceMesh);

  const countCells=Math.max(1,livingWorldActive.length);
  const wmat=new THREE.MeshPhysicalMaterial({
    color:0x4d9db7,transparent:true,opacity:.62,roughness:.18,metalness:0,
    transmission:.08,clearcoat:.36,clearcoatRoughness:.22,depthWrite:false,
    side:THREE.DoubleSide,vertexColors:true
  });
  terrainWaterMesh=new THREE.Mesh(new THREE.BufferGeometry(),wmat);
  terrainWaterMesh.frustumCulled=false;terrainWaterMesh.renderOrder=3;
  terrainGroup.add(terrainWaterMesh);

  const mudGeo=new THREE.CircleGeometry(ENV_CELL_SIZE*.56,12);
  const mudMat=new THREE.MeshStandardMaterial({
    color:0x4c3423,transparent:true,opacity:.36,roughness:.70,
    depthWrite:false
  });
  terrainMudMesh=new THREE.InstancedMesh(mudGeo,mudMat,countCells);
  terrainMudMesh.frustumCulled=false;terrainMudMesh.renderOrder=1;
  terrainGroup.add(terrainMudMesh);

  // Sparse 3D grass. The ecology decides whether each anchor is visible.
  const grassCount=1250;
  const grassGeo=new THREE.ConeGeometry(.035,.23,3,1);
  grassGeo.translate(0,.115,0);
  const grassMat=new THREE.MeshStandardMaterial({
    color:0xffffff,vertexColors:true,roughness:.88,metalness:0
  });
  grassBladeMesh=new THREE.InstancedMesh(grassGeo,grassMat,grassCount);
  grassBladeMesh.frustumCulled=false;
  grassBladeMesh.castShadow=false;
  terrainGroup.add(grassBladeMesh);

  for(let i=0;i<grassCount;i++){
    const ci=Math.floor(envHash(i,31,501)*livingWorldActive.length);
    const c=livingWorldActive[Math.min(livingWorldActive.length-1,Math.max(0,ci))];
    grassAnchors.push({
      cell:c,
      ox:(envHash(i,32,502)-.5)*ENV_CELL_SIZE*.78,
      oz:(envHash(i,33,503)-.5)*ENV_CELL_SIZE*.78,
      rot:envHash(i,34,504)*Math.PI*2,
      size:.65+envHash(i,35,505)*.80,
      threshold:.18+envHash(i,36,506)*.48
    });
  }
}

function gaussianHill(x,z,cx,cz,sx,sz){
  const dx=(x-cx)/sx,dz=(z-cz)/sz;
  return Math.exp(-(dx*dx+dz*dz)*.5);
}
function geologicalElevation(x,z,ix,iz,n1){
  const broad=
    Math.sin(x*.090)*.18+
    Math.cos(z*.078)*.16+
    Math.sin((x+z)*.052)*.14+
    Math.cos((x-z)*.041)*.10;
  const mountainA=gaussianHill(x,z,14,-13,8.5,10.5)*.80;
  const mountainB=gaussianHill(x,z,-19,-12,9.5,7.5)*.65;
  const ridge=gaussianHill(x,z,21,12,6.5,12.5)*.42;
  const valley=gaussianHill(x,z,-2,3,10,13)*.34;
  const local=(n1-.5)*.18;
  return clamp(broad+mountainA+mountainB+ridge-valley+local,-1.10,1.38);
}
function terrainWorldHeightFromElevation(e){
  if(e>=0){
    return e*CONFIG.TERRAIN_HEIGHT_SCALE+Math.max(0,e-.52)*2.10;
  }
  return e*1.65;
}
function cellWorldHeight(c){return c?terrainWorldHeightFromElevation(c.elevation||0):0;}
function terrainCellSafe(ix,iz,fallback=null){
  if(ix<0||iz<0||ix>=ENV_GRID||iz>=ENV_GRID)return fallback;
  return livingWorldCells[envIndex(ix,iz)]||fallback;
}
function terrainHeightAt(pos){
  if(!livingWorldActive.length)return 0;
  const gx=(pos.x+CONFIG.WORLD)/ENV_CELL_SIZE-.5;
  const gz=(pos.z+CONFIG.WORLD)/ENV_CELL_SIZE-.5;
  const ix=Math.floor(gx),iz=Math.floor(gz);
  const tx=clamp(gx-ix,0,1),tz=clamp(gz-iz,0,1);
  const base=livingCellAt(pos)||livingWorldActive[0];
  const c00=terrainCellSafe(ix,iz,base),c10=terrainCellSafe(ix+1,iz,c00);
  const c01=terrainCellSafe(ix,iz+1,c00),c11=terrainCellSafe(ix+1,iz+1,c01);
  const h0=THREE.MathUtils.lerp(cellWorldHeight(c00),cellWorldHeight(c10),tx);
  const h1=THREE.MathUtils.lerp(cellWorldHeight(c01),cellWorldHeight(c11),tx);
  return THREE.MathUtils.lerp(h0,h1,tz);
}
function terrainSlopeVectorAt(pos,step=.72){
  const hL=terrainHeightAt({x:pos.x-step,z:pos.z});
  const hR=terrainHeightAt({x:pos.x+step,z:pos.z});
  const hD=terrainHeightAt({x:pos.x,z:pos.z-step});
  const hU=terrainHeightAt({x:pos.x,z:pos.z+step});
  return {
    x:(hR-hL)/(step*2),
    z:(hU-hD)/(step*2)
  };
}
function terrainSlopeAt(pos){
  const g=terrainSlopeVectorAt(pos);
  return Math.hypot(g.x,g.z);
}
function terrainGradeAlongHeading(a,distance=.85){
  const h0=terrainHeightAt(a.mesh.position);
  const p={
    x:a.mesh.position.x+Math.sin(a.heading)*distance,
    z:a.mesh.position.z+Math.cos(a.heading)*distance
  };
  return (terrainHeightAt(p)-h0)/distance;
}
function terrainTravelFactor(a){
  const slope=terrainSlopeAt(a.mesh.position);
  const grade=terrainGradeAlongHeading(a);
  const uphill=clamp(grade,0,1.5);
  const downhill=clamp(-grade,0,1.2);
  return clamp(1-uphill*.30-slope*.09+downhill*.045,.42,1.06);
}
function terrainEffortMultiplier(a){
  const slope=terrainSlopeAt(a.mesh.position);
  const uphill=clamp(terrainGradeAlongHeading(a),0,1.5);
  return 1+slope*.22+uphill*.55;
}
function terrainReliefMetrics(){
  if(!livingWorldActive.length)return {max:0,min:0,avgSlope:0};
  let max=-Infinity,min=Infinity,s=0,n=0;
  for(const c of livingWorldActive){
    const h=cellWorldHeight(c);max=Math.max(max,h);min=Math.min(min,h);
    if((c.ix+c.iz)%3===0){s+=terrainSlopeAt({x:c.x,z:c.z});n++;}
  }
  return {max,min,avgSlope:n?s/n:0};
}
function terrainWaterSurfaceY(c){
  const groundH=terrainHeightAt({x:c.x,z:c.z});
  if(c.pond)return Math.max(-.28,groundH+.16);
  return groundH+.035+clamp(c.surfaceWater||0,0,1.2)*.24;
}
function rebuildTerrainPhysicsCollider(){
  if(!physicsEnabled||!physicsWorld||!RAPIER||!livingWorldActive.length)return;
  try{
    if(physicsGround)physicsWorld.removeCollider(physicsGround,true);
  }catch(err){
    console.warn('No se pudo retirar el suelo físico anterior',err);
  }
  physicsGround=null;

  try{
    const seg=ENV_GRID;
    const verts=new Float32Array((seg+1)*(seg+1)*3);
    const inds=new Uint32Array(seg*seg*6);
    let vi=0;
    for(let iz=0;iz<=seg;iz++){
      const z=-CONFIG.WORLD+(iz/seg)*CONFIG.WORLD*2;
      for(let ix=0;ix<=seg;ix++){
        const x=-CONFIG.WORLD+(ix/seg)*CONFIG.WORLD*2;
        verts[vi++]=x;
        verts[vi++]=terrainHeightAt({x,z});
        verts[vi++]=z;
      }
    }
    let ii=0;
    for(let iz=0;iz<seg;iz++){
      for(let ix=0;ix<seg;ix++){
        const a=iz*(seg+1)+ix,b=a+1,c=a+(seg+1),d=c+1;
        inds[ii++]=a;inds[ii++]=c;inds[ii++]=b;
        inds[ii++]=b;inds[ii++]=c;inds[ii++]=d;
      }
    }
    const desc=RAPIER.ColliderDesc.trimesh(verts,inds)
      .setFriction(1.18)
      .setRestitution(.015);
    physicsGround=physicsWorld.createCollider(desc);
  }catch(err){
    console.warn('Trimesh de terreno no disponible; se usa suelo físico plano de respaldo',err);
    physicsGround=physicsWorld.createCollider(
      RAPIER.ColliderDesc.cuboid(CONFIG.WORLD+4,.18,CONFIG.WORLD+4)
        .setTranslation(0,-.20,0)
        .setFriction(1.15)
        .setRestitution(.02)
    );
  }
}
function placeWorldObjectsOnTerrain(){
  originBeacon.position.y=terrainHeightAt(originBeacon.position)+1.1;
  for(const h of heatSources)if(h.group)h.group.position.y=terrainHeightAt(h.group.position);
}

function resetLivingWorld(saved=null){
  livingWorldCells=Array(ENV_GRID*ENV_GRID).fill(null);
  livingWorldActive=[];
  let instance=0;
  for(let iz=0;iz<ENV_GRID;iz++){
    for(let ix=0;ix<ENV_GRID;ix++){
      const x=-CONFIG.WORLD+(ix+.5)*ENV_CELL_SIZE;
      const z=-CONFIG.WORLD+(iz+.5)*ENV_CELL_SIZE;
      if(Math.hypot(x,z)>CONFIG.WORLD-.45)continue;
      const n1=envHash(ix,iz,1),n2=envHash(ix,iz,2),n3=envHash(ix,iz,3);
      const pd=Math.hypot(x+9,z-8)-7.6;
      const pond=pd<0;
      let elevation=geologicalElevation(x,z,ix,iz,n1);
      if(pd<3.0){
        const basin=clamp(1-(pd+7.6)/10.6,0,1);
        elevation=Math.min(elevation,-.20-basin*.62);
      }
      const permeability=clamp(.30+n2*.55+.08*Math.sin(x*.17-z*.12),.12,.92);
      const fertility=clamp(.32+n3*.48+.12*Math.cos(x*.08+z*.11)-Math.max(0,elevation)*.08,.10,1);
      const moisture=pond?1:clamp(.18+Math.exp(-Math.max(0,pd)/8.5)*.48+(n2-.5)*.16,0,1);
      const biomass=pond?.03:clamp(fertility*moisture*(.70+.35*n1),.02,.84);
      const cell={
        ix,iz,x,z,instance:instance++,elevation,permeability,fertility,
        moisture,surfaceWater:pond?.95:0,biomass,compaction:0,
        temperature:18,textureNoise:n1,pond
      };
      livingWorldCells[envIndex(ix,iz)]=cell;livingWorldActive.push(cell);
    }
  }

  if(saved?.cells){
    const byKey=new Map(saved.cells.map(r=>[`${r[0]},${r[1]}`,r]));
    for(const c of livingWorldActive){
      const r=byKey.get(`${c.ix},${c.iz}`);if(!r)continue;
      c.moisture=clamp(r[2]??c.moisture,0,1.3);
      c.surfaceWater=clamp(r[3]??c.surfaceWater,0,1.5);
      c.fertility=clamp(r[4]??c.fertility,.05,1.2);
      c.biomass=clamp(r[5]??c.biomass,0,1.2);
      c.compaction=clamp(r[6]??0,0,1);
      c.temperature=Number.isFinite(r[7])?r[7]:c.temperature;
    }
  }
  livingWorldAccumulator=0;livingVisualAccumulator=999;
  initLivingWorldMeshes();
  refreshLivingWorldVisuals(true);
  rebuildTerrainPhysicsCollider();
  placeWorldObjectsOnTerrain();
}
function exportLivingWorldState(){
  return {
    grid:ENV_GRID,
    cells:livingWorldActive.map(c=>[
      c.ix,c.iz,
      +c.moisture.toFixed(4),+c.surfaceWater.toFixed(4),+c.fertility.toFixed(4),
      +c.biomass.toFixed(4),+c.compaction.toFixed(4),+c.temperature.toFixed(2)
    ])
  };
}
function displayEnvAt(x,z){
  const p={x,z};
  const c=livingCellAt(p);
  if(!c)return {moisture:.12,biomass:.04,compaction:0,surfaceWater:0,fertility:.2,noise:.5};
  let moisture=0,biomass=0,compaction=0,water=0,fertility=0,noise=0,n=0;
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
    const ix=c.ix+dx,iz=c.iz+dz;
    if(ix<0||iz<0||ix>=ENV_GRID||iz>=ENV_GRID)continue;
    const q=livingWorldCells[envIndex(ix,iz)];if(!q)continue;
    const w=(dx===0&&dz===0)?2.6:((dx===0||dz===0)?1.25:.65);
    moisture+=q.moisture*w;biomass+=q.biomass*w;compaction+=q.compaction*w;
    water+=q.surfaceWater*w;fertility+=q.fertility*w;noise+=q.textureNoise*w;n+=w;
  }
  return {
    moisture:moisture/n,biomass:biomass/n,compaction:compaction/n,
    surfaceWater:water/n,fertility:fertility/n,noise:noise/n
  };
}
function terrainDisplayColor(env,out){
  const dry=new THREE.Color(0x9a7548);
  const earth=new THREE.Color(0x76563a);
  const wetSoil=new THREE.Color(0x49382c);
  const grass=new THREE.Color(0x557d3d);
  const lush=new THREE.Color(0x4f963d);
  const path=new THREE.Color(0xa08259);

  const wet=clamp(env.moisture,0,1.15);
  const bio=clamp(env.biomass,0,1);
  const compact=clamp(env.compaction,0,1);

  out.copy(dry).lerp(earth,clamp(wet*.72,0,.65));
  if(wet>.58)out.lerp(wetSoil,clamp((wet-.58)*.75,0,.36));
  out.lerp(grass,clamp((bio-.12)*.88,0,.70));
  if(bio>.58)out.lerp(lush,clamp((bio-.58)*.70,0,.25));
  if(compact>.10)out.lerp(path,clamp((compact-.10)*.60,0,.48));

  const variation=.94+(env.noise-.5)*.10;
  out.multiplyScalar(variation);
  return out;
}

function updateNaturalWaterGeometry(){
  if(!terrainWaterMesh)return;
  const positions=[],colors=[],indices=[];
  const deep=new THREE.Color(0x1f6f8b),shallow=new THREE.Color(0x62aec0),pondCol=new THREE.Color(0x2d7f9b);
  let base=0;

  for(const c of livingWorldActive){
    const water=clamp(c.surfaceWater||0,0,1.25);
    if(water<=.025)continue;

    const half=ENV_CELL_SIZE*.50;
    const x0=c.x-half,x1=c.x+half,z0=c.z-half,z1=c.z+half;
    // One quad per wet cell. Adjacent quads only share an edge; they never stack.
    // This removes the black alpha buildup produced by overlapping circles.
    let y=terrainWaterSurfaceY(c);
    if(c.pond){
      // Keep the permanent pond visually calmer and more level than runoff puddles.
      y=Math.max(y,terrainHeightAt({x:c.x,z:c.z})+.11);
    }
    const ripple=(envHash(c.ix,c.iz,911)-.5)*.008;
    y+=ripple;

    positions.push(
      x0,y,z0,
      x1,y,z0,
      x1,y,z1,
      x0,y,z1
    );
    indices.push(base,base+1,base+2, base,base+2,base+3);

    const col=(c.pond?pondCol:deep).clone().lerp(shallow,clamp(.32-water*.18,0,.28));
    for(let k=0;k<4;k++)colors.push(col.r,col.g,col.b);
    base+=4;
  }

  const geo=new THREE.BufferGeometry();
  if(positions.length){
    geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  }
  const old=terrainWaterMesh.geometry;
  terrainWaterMesh.geometry=geo;
  old?.dispose?.();
}

function refreshLivingWorldVisuals(force=false){
  if(!terrainSurfaceMesh||!terrainWaterMesh||!terrainMudMesh||!grassBladeMesh)return;

  // Smooth terrain vertex colors.
  const pos=terrainSurfaceMesh.geometry.attributes.position;
  const colorAttr=terrainSurfaceMesh.geometry.attributes.color;
  const color=new THREE.Color();
  for(let i=0;i<pos.count;i++){
    // Plane local X/Y becomes world X/Z after rotation.
    const x=pos.getX(i),z=-pos.getY(i);
    const env=displayEnvAt(x,z);
    terrainDisplayColor(env,color);
    colorAttr.setXYZ(i,color.r,color.g,color.b);
    if(force)pos.setZ(i,terrainHeightAt({x,z}));
  }
  colorAttr.needsUpdate=true;
  if(force){
    pos.needsUpdate=true;
    terrainSurfaceMesh.geometry.computeVertexNormals();
    terrainSurfaceMesh.geometry.computeBoundingSphere();
  }

  updateNaturalWaterGeometry();

  const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,0,0));
  const matrix=new THREE.Matrix4();
  for(const c of livingWorldActive){
    const water=clamp(c.surfaceWater,0,1.25);
    const jitterX=(c.textureNoise-.5)*ENV_CELL_SIZE*.18;
    const jitterZ=(envHash(c.ix,c.iz,702)-.5)*ENV_CELL_SIZE*.18;
    const angle=envHash(c.ix,c.iz,703)*Math.PI*2;
    const qq=new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,0,angle));

    const mud=clamp((c.moisture-.57)*1.65,0,1)*(1-clamp(c.surfaceWater*.65,0,.70));
    const mudScale=mud>.10?clamp(.22+mud*.72,.25,.90):.001;
    matrix.compose(
      new THREE.Vector3(c.x-jitterX*.45,terrainHeightAt({x:c.x-jitterX*.45,z:c.z-jitterZ*.45})+.024,c.z-jitterZ*.45),
      qq,new THREE.Vector3(mudScale,mudScale*(.72+.26*c.textureNoise),1)
    );
    terrainMudMesh.setMatrixAt(c.instance,matrix);
  }
  terrainMudMesh.instanceMatrix.needsUpdate=true;

  // Grass blades: ecologically dense cells get more visible anchors.
  const gmat=new THREE.Matrix4(),gcolor=new THREE.Color();
  for(let i=0;i<grassAnchors.length;i++){
    const a=grassAnchors[i],c=a.cell;
    const bio=clamp(c?.biomass||0,0,1.1);
    const wet=clamp(c?.moisture||0,0,1);
    const flooded=(c?.surfaceWater||0)>.22;
    const visible=!c?.pond&&!flooded&&bio>a.threshold;
    const scale=visible?clamp((bio-a.threshold)*2.6,.16,1.15)*a.size:.001;
    const rot=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,a.rot,0));
    gmat.compose(
      new THREE.Vector3((c?.x||0)+a.ox,terrainHeightAt({x:(c?.x||0)+a.ox,z:(c?.z||0)+a.oz})+.025,(c?.z||0)+a.oz),
      rot,new THREE.Vector3(.72+.28*a.size,scale,.72+.28*a.size)
    );
    grassBladeMesh.setMatrixAt(i,gmat);
    gcolor.set(wet>.55?0x5fa846:0x7f9a43);
    if(bio>.72)gcolor.lerp(new THREE.Color(0x69bd4f),.32);
    grassBladeMesh.setColorAt(i,gcolor);
  }
  grassBladeMesh.instanceMatrix.needsUpdate=true;
  if(grassBladeMesh.instanceColor)grassBladeMesh.instanceColor.needsUpdate=true;
}
function lowerNeighbor(c){
  let best=null,bestH=cellWorldHeight(c)+(c.surfaceWater||0)*.24;
  const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
  for(const [dx,dz] of dirs){
    const ix=c.ix+dx,iz=c.iz+dz;
    if(ix<0||iz<0||ix>=ENV_GRID||iz>=ENV_GRID)continue;
    const n=livingWorldCells[envIndex(ix,iz)];if(!n)continue;
    const h=cellWorldHeight(n)+(n.surfaceWater||0)*.24;
    if(h<bestH-.018){bestH=h;best=n;}
  }
  return best;
}
function updateLivingWorld(dt){
  livingWorldAccumulator+=dt;livingVisualAccumulator+=dt;
  if(livingWorldAccumulator<CONFIG.ENV_STEP)return;
  const h=Math.min(4,livingWorldAccumulator);livingWorldAccumulator=0;
  const rain=rainIntensity(),light=daylightLevel();

  for(const c of livingWorldActive){
    c.temperature=baseClimateTemperature({x:c.x,z:c.z});
    if(c.pond){
      c.surfaceWater=Math.max(c.surfaceWater,.92);
      c.moisture=Math.max(c.moisture,.94);
      c.biomass=Math.min(c.biomass,.10);
      continue;
    }

    const rainInput=rain*.020*h;
    c.surfaceWater=clamp(c.surfaceWater+rainInput*(.42-.18*c.permeability),0,1.45);
    c.moisture=clamp(c.moisture+rainInput*(.58+.26*c.permeability),0,1.25);

    const infiltration=Math.min(c.surfaceWater,c.permeability*.010*h);
    c.surfaceWater-=infiltration;c.moisture=clamp(c.moisture+infiltration*.72,0,1.25);

    const tempEvap=clamp((c.temperature-2)/34,.05,1.25);
    const evap=(.0015+.0052*light)*tempEvap*h*(1-.28*c.biomass);
    c.surfaceWater=Math.max(0,c.surfaceWater-evap);
    c.moisture=Math.max(0,c.moisture-evap*.34);

    // Deep drainage: saturated soil cannot remain indefinitely at the hard cap.
    // More permeable cells lose excess moisture faster into an unrendered groundwater reservoir.
    const fieldCapacity=.64+c.permeability*.18;
    const excessMoisture=Math.max(0,c.moisture-fieldCapacity);
    if(excessMoisture>0){
      const deepDrain=Math.min(excessMoisture,h*(.0045+.0105*c.permeability));
      c.moisture=Math.max(0,c.moisture-deepDrain);
      // A small fraction returns as local surface seepage and can continue downhill.
      c.surfaceWater=clamp(c.surfaceWater+deepDrain*.10,0,1.45);
    }

    if(c.surfaceWater>.055){
      const n=lowerNeighbor(c);
      if(n){
        const slope=clamp((cellWorldHeight(c)-cellWorldHeight(n))*.18+c.surfaceWater*.16,0,.55);
        const runoff=Math.min(c.surfaceWater-.025,slope*.025*h);
        if(runoff>0){c.surfaceWater-=runoff;n.surfaceWater=clamp(n.surfaceWater+runoff*.94,0,1.45);}
      }
    }

    const moistSuit=clamp(1-Math.abs(c.moisture-.62)/.62,0,1);
    const tempSuit=clamp(1-Math.abs(c.temperature-22)/25,0,1);
    const seedRecovery=c.biomass<.08?.0011*h*c.fertility*moistSuit*tempSuit:0;
    const growth=.0035*h*c.fertility*moistSuit*tempSuit*(.35+.65*light)*(1-c.compaction*.58);
    const stress=(c.moisture<.14?.0032:0)+(c.moisture>1.08?.0024:0)+(c.surfaceWater>.56?.0042:0);
    c.biomass=clamp(c.biomass+growth+seedRecovery-stress*h,0,1.12);
    c.compaction=Math.max(0,c.compaction-h*.00016*(.4+.6*rain));
    c.fertility=clamp(c.fertility+h*(.00006*(1-c.biomass)-.000025*c.compaction),.08,1.12);
  }
  if(livingVisualAccumulator>1.35){
    livingVisualAccumulator=0;refreshLivingWorldVisuals();
  }
}
function livingWorldMetrics(){
  if(!livingWorldActive.length)return {moisture:0,vegetation:0,water:0,compacted:0,saturated:0};
  let m=0,v=0,w=0,c=0,sat=0,land=0;
  for(const x of livingWorldActive){
    if(!x.pond){m+=x.moisture;land++;if(x.moisture>1.02)sat++;}
    w+=x.surfaceWater;
    if(x.biomass>.28)v++;
    if(x.compaction>.24)c++;
  }
  const n=livingWorldActive.length,ln=Math.max(1,land);
  return {moisture:m/ln,vegetation:v/n,water:w/n,compacted:c/n,saturated:sat/ln};
}
function ecologicalFoodSuitability(pos){
  const c=livingCellAt(pos);if(!c)return .2;
  return clamp(.12+c.biomass*.55+c.fertility*.28+
    (1-Math.abs(c.moisture-.60))*.16-c.surfaceWater*.48-c.compaction*.08,.02,1.2);
}
function randomEcologicalFoodPos(){
  let best=randomGroundPos(),bestScore=-1;
  for(let i=0;i<14;i++){
    const p=randomGroundPos();
    const score=ecologicalFoodSuitability(p)+rand(-.04,.04);
    if(score>bestScore){bestScore=score;best=p;}
  }
  return best;
}
function terrainMovementFactor(pos){
  const c=livingCellAt(pos);if(!c)return 1;
  const mud=clamp((c.moisture-.60)*1.65,0,1)*(1-c.compaction*.65);
  const shallow=clamp(c.surfaceWater*.95,0,.62);
  const pathBonus=clamp(c.compaction*.10,0,.09);
  const slope=terrainSlopeAt(pos);
  return clamp(1-mud*.22-shallow*.34-slope*.08+pathBonus,.40,1.08);
}
function markTerrainTraffic(a,moved){
  if(moved<=.0001)return;
  const c=livingCellAt(a.mesh.position);if(!c||c.pond)return;
  const mass=morphologyMetrics(a).mass;
  c.compaction=clamp(c.compaction+moved*.0065*(.55+.45*mass),0,1);
  c.biomass=Math.max(0,c.biomass-moved*.0012*(.55+.45*mass));
}
function enrichSoilAt(pos,amount=.04){
  const c=livingCellAt(pos);if(!c)return;
  c.fertility=clamp(c.fertility+amount,.08,1.12);
  c.moisture=clamp(c.moisture+amount*.18,0,1.25);
}
function environmentalWaterProximity(pos,maxDist=4){
  const c=livingCellAt(pos);
  if(c&&(c.surfaceWater||0)>.08)return clamp(c.surfaceWater*1.8,.15,1);
  const cells=Math.max(1,Math.ceil(maxDist/ENV_CELL_SIZE));
  const ix0=Math.floor((pos.x+CONFIG.WORLD)/ENV_CELL_SIZE);
  const iz0=Math.floor((pos.z+CONFIG.WORLD)/ENV_CELL_SIZE);
  let best=0;
  for(let dz=-cells;dz<=cells;dz++)for(let dx=-cells;dx<=cells;dx++){
    const ix=ix0+dx,iz=iz0+dz;if(ix<0||iz<0||ix>=ENV_GRID||iz>=ENV_GRID)continue;
    const n=livingWorldCells[envIndex(ix,iz)];if(!n||(n.surfaceWater||0)<.08)continue;
    const d=Math.hypot(pos.x-n.x,pos.z-n.z);
    if(d<=maxDist)best=Math.max(best,(1-d/maxDist)*clamp(n.surfaceWater*1.6,.1,1));
  }
  return best;
}
function updateClimateLighting(){
  const p=dayPhase01(),light=daylightLevel();
  const ang=(p-.25)*Math.PI*2;
  const horizon=Math.max(0,1-Math.abs(light-.16)/.16);
  const night=clamp(1-light*1.32,0,1);

  // Physical/environmental daylight remains the value returned by daylightLevel().
  // Everything below is only scene rendering.
  sun.position.set(Math.cos(ang)*31,2.5+light*30,Math.sin(ang)*31);
  sun.intensity=(.025+1.18*Math.pow(light,.82))*sunFactor;
  sun.color.copy(DAY_SUN).lerp(DUSK_SUN,horizon*.58);

  // Natural-looking moonlight floor: enough for the observer to retain silhouettes.
  moonLight.intensity=.035+.20*night;
  moonLight.position.set(-Math.cos(ang)*26,22+night*10,-Math.sin(ang)*26);

  skyLight.intensity=.16+.92*Math.sqrt(light)+.10*night;
  skyLight.color.set(light>.18?0xb8dcf2:0x71829e);
  skyLight.groundColor.set(light>.16?0x5f4b32:0x18241d);

  // Optional observer-only illumination. It never enters perception or simulation state.
  const observerNight=observerVision?(.30+.70*night):0;
  observerFill.intensity=observerNight*.95;
  observerKey.intensity=observerNight*.72;
  observerKey.position.copy(camera.position).add(new THREE.Vector3(5,10,5));

  const sky=scene.background;
  sky.copy(NIGHT_SKY).lerp(DAY_SKY,Math.pow(light,.62));
  if(horizon>0)sky.lerp(DUSK_SKY,horizon*.32);
  if(observerVision&&night>.15)sky.lerp(new THREE.Color(0x243449),.12*night);

  scene.fog.color.copy(NIGHT_FOG).lerp(DAY_FOG,Math.pow(light,.70));

  const naturalExposure=.86+.29*Math.sqrt(light);
  renderer.toneMappingExposure=observerVision
    ?naturalExposure+night*.48
    :naturalExposure;
}
function resolveHybridAgentOverlaps(dt){
  if(rigidModeActive||agents.length<2)return;
  const bucketSize=2.25,buckets=new Map();
  for(const a of agents){
    const bx=Math.floor(a.mesh.position.x/bucketSize),bz=Math.floor(a.mesh.position.z/bucketSize);
    const k=`${bx},${bz}`;if(!buckets.has(k))buckets.set(k,[]);
    buckets.get(k).push(a);
  }
  const seen=new Set();
  for(const a of agents){
    const bx=Math.floor(a.mesh.position.x/bucketSize),bz=Math.floor(a.mesh.position.z/bucketSize);
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
      const arr=buckets.get(`${bx+dx},${bz+dz}`);if(!arr)continue;
      for(const b of arr){
        if(a===b)continue;
        const lo=Math.min(a.id,b.id),hi=Math.max(a.id,b.id),key=`${lo}:${hi}`;
        if(seen.has(key))continue;seen.add(key);
        let vx=b.mesh.position.x-a.mesh.position.x,vz=b.mesh.position.z-a.mesh.position.z;
        let d=Math.hypot(vx,vz);
        const growthA=.48+.52*(a.phenotype?.growth??1),growthB=.48+.52*(b.phenotype?.growth??1);
        const minDist=.46*(a.genome.body.size*growthA+b.genome.body.size*growthB);
        if(d>=minDist)continue;
        if(d<.0001){
          const ang=((a.id*31+b.id*17)%360)*Math.PI/180;vx=Math.cos(ang);vz=Math.sin(ang);d=1;
        }else{vx/=d;vz/=d;}
        const overlap=minDist-d;
        const push=overlap*.52*clamp(dt*12,.30,1);
        a.mesh.position.x-=vx*push;a.mesh.position.z-=vz*push;
        b.mesh.position.x+=vx*push;b.mesh.position.z+=vz*push;
        queueNerveSignal(a,'pressure',clamp(overlap/minDist,0,1),1,.006);
        queueNerveSignal(b,'pressure',clamp(overlap/minDist,0,1),1,.006);
      }
    }
  }
}

function randomGroundPos(radius=CONFIG.WORLD-1.6){
  const r=Math.sqrt(Math.random())*radius,a=Math.random()*Math.PI*2;
  const p=new THREE.Vector3(Math.cos(a)*r,0,Math.sin(a)*r);
  p.y=terrainHeightAt(p);
  return p;
}
function pondSignedDistance(pos){return Math.hypot(pos.x+9,pos.z-8)-7.6;}
function inPond(pos){
  return pondSignedDistance(pos)<0||((livingCellAt(pos)?.surfaceWater||0)>.42);
}
function waterProximity(pos,maxDist=4){
  const d=pondSignedDistance(pos);
  const pond=d<=0?1:clamp(1-d/maxDist,0,1);
  return Math.max(pond,environmentalWaterProximity(pos,maxDist));
}
function canReachWater(a){
  const reach=.58+1.15*(a.genome.body.reach||1)*(a.genome.body.size||1);
  return pondSignedDistance(a.mesh.position)<=reach||environmentalWaterProximity(a.mesh.position,reach)>.10;
}
function cellKey(pos){
  return `${Math.floor(pos.x/CONFIG.CELL_SIZE)},${Math.floor(pos.z/CONFIG.CELL_SIZE)}`;
}

function makeFood(pos=randomGroundPos(),energy=rand(6.2,11.2)){
  const mesh=new THREE.Mesh(
    new THREE.IcosahedronGeometry(rand(.12,.22),0),
    new THREE.MeshStandardMaterial({color:0x9fe76e,emissive:0x112208,roughness:.85})
  );
  mesh.position.copy(pos);mesh.position.y=terrainHeightAt(pos)+.18;mesh.castShadow=true;foodGroup.add(mesh);
  const f={mesh,energy};food.push(f);return f;
}

function materialRestY(type,props){
  if(type==='fiber')return .28;
  if(type==='composite')return Math.max(.18,Math.min(.36,(props?.length||.8)*.18));
  return .24;
}
function makeMaterial(type=null,pos=randomGroundPos(),custom=null){
  if(materials.length>=CONFIG.MATERIAL_MAX)return null;
  const names=Object.keys(MATERIAL_TYPES);
  type=type||chooseRegionalMaterialType(pos);

  const fallbackComposite={color:0x92775d,mass:1,hardness:.5,length:1,fertility:0,energy:0,bind:.45,flexibility:.3,edgePotential:.3,resonance:.3,durability:.65,edge:.15,leverage:.5,complexity:1,heatCapacity:.65,conductivity:.35,flammability:.12,ignitionTemp:310,thermalTransform:470,fractureResistance:.5,abrasionResistance:.5,roundness:.35,hollowPotential:.28,sealPotential:.32,softeningTemp:420,capacity:0,rotationEfficiency:0,mechanicalPotential:0};
  const base=type==='composite'?fallbackComposite:MATERIAL_TYPES[type];
  const p={...base,...(custom?.props||{})};
  applyNaturalAffordances(p,type,custom);

  let geo;
  if(type==='fiber')geo=new THREE.CylinderGeometry(.07,.09,.8,6);
  else if(type==='stone')geo=new THREE.DodecahedronGeometry(.24,0);
  else if(type==='mineral')geo=new THREE.OctahedronGeometry(.25,0);
  else if(type==='composite'){
    const L=clamp(p.length||1,.45,2.2);
    geo=new THREE.CapsuleGeometry(clamp(.07+(p.mass||1)*.018,.07,.16),L*.55,4,8);
  }else geo=new THREE.IcosahedronGeometry(.23,1);

  const mesh=new THREE.Mesh(
    geo,new THREE.MeshStandardMaterial({
      color:p.color??0x92775d,
      roughness:type==='mineral'?.45:type==='composite'?.68:.88,
      metalness:type==='mineral'?.15:0
    })
  );
  mesh.position.copy(pos);mesh.position.y=terrainHeightAt(pos)+materialRestY(type,p);
  if(type==='fiber'||type==='composite')mesh.rotation.z=Math.PI/2;
  if(p.containerLike&&type!=='fiber'){mesh.scale.y*=.82;mesh.scale.x*=1.08;mesh.scale.z*=1.08;}
  mesh.castShadow=true;materialGroup.add(mesh);

  const m={
    id:nextMaterialId++,type,props:p,mesh,carriedBy:null,
    staticTime:custom?.staticTime||0,lastPos:mesh.position.clone(),
    placedBy:custom?.placedBy??null,placedAt:custom?.placedAt||0,
    manipCount:custom?.manipCount||0,work:custom?.work||0,
    parts:custom?.parts?structuredClone(custom.parts):null,
    builders:custom?.builders?[...custom.builders]:[],
    temperature:Number.isFinite(custom?.temperature)?custom.temperature:22,
    wetness:clamp(custom?.wetness||0,0,1),burning:!!custom?.burning,burnTime:custom?.burnTime||0,
    thermalExposure:custom?.thermalExposure||0,thermalState:custom?.thermalState||'raw',
    transformedLevel:custom?.transformedLevel||0,fracture:custom?.fracture||0,abrasion:custom?.abrasion||0,
    waterAmount:custom?.waterAmount||0,waterTemp:Number.isFinite(custom?.waterTemp)?custom.waterTemp:20,
    softness:custom?.softness||0,shaping:custom?.shaping||0,rotationTurns:custom?.rotationTurns||0,
    mechanicalWork:custom?.mechanicalWork||0,groundScrapeWork:custom?.groundScrapeWork||0,
    coldShapeWork:custom?.coldShapeWork||0,
    techTrace:custom?.techTrace?structuredClone(custom.techTrace):null,
    traceStrength:custom?.traceStrength||0,traceObservations:custom?.traceObservations||0,
    worksiteStrength:custom?.worksiteStrength||0,worksiteWork:custom?.worksiteWork||0,
    worksiteWorkers:custom?.worksiteWorkers?[...custom.worksiteWorkers]:[],lastWorkAt:custom?.lastWorkAt||0,
    originRegion:custom?.originRegion||regionFor(pos),lastRegion:custom?.lastRegion||regionFor(pos),
    regionalMoves:custom?.regionalMoves||0
  };
  materials.push(m);
  if(m.burning||m.thermalState!=='raw')updateMaterialAppearance(m);
  return m;
}

function deriveCompositeProps(chosen){
  const totalMass=chosen.reduce((s,m)=>s+(m.props.mass||0),0);
  const weighted=(key)=>chosen.reduce((s,m)=>s+(m.props[key]||0)*(m.props.mass||1),0)/Math.max(.01,totalMass);
  const maxLen=Math.max(...chosen.map(m=>m.props.length||.4));
  const bind=clamp(chosen.reduce((s,m)=>s+(m.props.bind||0),0)/chosen.length,0,1.4);
  const hardness=clamp(weighted('hardness'),0,1.2);
  const edgeSource=Math.max(...chosen.map(m=>(m.props.edgePotential||0)*(m.props.hardness||0)));
  const longBind=chosen.reduce((s,m)=>s+(m.props.length||0)*(m.props.bind||0),0)/chosen.length;
  const resonance=clamp(weighted('resonance')+.08*chosen.length,0,1.5);
  const diversity=new Set(chosen.map(m=>m.type)).size;
  return {
    color:0x92775d,mass:totalMass*.92,hardness,
    length:clamp(maxLen+longBind*.35,.45,2.4),
    fertility:chosen.reduce((s,m)=>s+(m.props.fertility||0),0)*.12,
    energy:0,bind,flexibility:clamp(weighted('flexibility')*.72+bind*.18,0,1.4),
    edgePotential:edgeSource,edge:clamp(edgeSource*(.72+.12*diversity),0,1.25),
    resonance,durability:clamp(weighted('durability')*.80+bind*.15,0,1.4),
    heatCapacity:clamp(weighted('heatCapacity'),.2,1.5),conductivity:clamp(weighted('conductivity'),.05,1.5),
    flammability:clamp(weighted('flammability'),0,1),ignitionTemp:chosen.reduce((s,m)=>s+(m.props.ignitionTemp||9999),0)/chosen.length,
    thermalTransform:chosen.reduce((s,m)=>s+(m.props.thermalTransform||650),0)/chosen.length,
    fractureResistance:clamp(weighted('fractureResistance'),.05,1.5),abrasionResistance:clamp(weighted('abrasionResistance'),.05,1.5),
    leverage:clamp((maxLen+longBind*.55)*(.35+hardness*.75),0,2.7),
    roundness:clamp(weighted('roundness')+.05*diversity,0,1.2),
    hollowPotential:clamp(weighted('hollowPotential')+.08*Math.max(0,chosen.length-2),0,1.3),
    sealPotential:clamp(weighted('sealPotential')*.72+bind*.28,0,1.3),
    softeningTemp:chosen.reduce((s,m)=>s+(m.props.softeningTemp||500),0)/chosen.length,
    capacity:clamp((weighted('hollowPotential')+.08*Math.max(0,chosen.length-2))*(.40+bind*.52)*weighted('sealPotential'),0,1.8),
    rotationEfficiency:clamp(weighted('roundness')*(.42+hardness*.55)*(1-clamp(weighted('flexibility')*.30,0,.45)),0,1.25),
    mechanicalPotential:clamp(weighted('roundness')*.45+longBind*.18+hardness*.24+diversity*.08,0,1.8),
    complexity:clamp(chosen.length*.42+diversity*.48+bind*.35,0,4)
  };
}
function makeCompositeArtifact(chosen,center){
  if(chosen.length<2)return null;
  const props=deriveCompositeProps(chosen);
  const parts=chosen.flatMap(m=>m.parts?.length?m.parts:[m.type]);
  const builders=[...new Set(chosen.map(m=>m.placedBy).filter(v=>v!=null))];
  const manipCount=chosen.reduce((s,m)=>s+(m.manipCount||0),0);
  const work=chosen.reduce((s,m)=>s+(m.work||0),0);
  const inheritedTrace=chosen.filter(m=>m.techTrace)
    .sort((a,b)=>(b.traceStrength||b.techTrace?.strength||0)-(a.traceStrength||a.techTrace?.strength||0))[0]?.techTrace||null;
  for(const m of chosen){
    const i=materials.indexOf(m);if(i>=0)materials.splice(i,1);
    m.mesh.parent?.remove(m.mesh);
    if(m.mesh.geometry)m.mesh.geometry.dispose();
    if(m.mesh.material)m.mesh.material.dispose();
  }
  const artifact=makeMaterial('composite',center,{props,parts,builders,placedBy:builders[0]??null,placedAt:worldAge,manipCount,work,staticTime:0,
    techTrace:inheritedTrace,traceStrength:inheritedTrace?.strength||0});
  if(artifact){
    if(inheritedTrace)artifact.traceStrength=clamp((artifact.traceStrength||0)+.12,0,1.6);
    recordDiscovery('artifact:first','🛠️','Primer artefacto compuesto',`Dos materiales fueron combinados en un objeto con propiedades derivadas.`,center);
  }
  return artifact;
}


function randomBinaryMask(rows,cols,density=.68){
  return Array.from({length:rows},()=>Array.from({length:cols},()=>Math.random()<density?1:0));
}
function normalizeMask(mask,rows,cols,defaultValue=1,density=.68){
  return Array.from({length:rows},(_,r)=>Array.from({length:cols},(_,c)=>{
    const old=mask?.[r]?.[c];
    return old===0||old===1?old:(defaultValue===1?1:(Math.random()<density?1:0));
  }));
}
function countBrainConnections(brain){
  let n=0;
  for(const row of brain.mask1||[])for(const v of row)n+=v?1:0;
  for(const row of brain.maskR||[])for(const v of row)n+=v?1:0;
  for(const row of brain.mask2||[])for(const v of row)n+=v?1:0;
  brain.activeConnections=n;return n;
}
function ensureBrainTopology(brain,ni=59,no=30,density=.68,legacyFull=true){
  const nh=brain.bias1.length;
  brain.mask1=normalizeMask(brain.mask1,nh,ni,legacyFull?1:0,density);
  brain.maskR=normalizeMask(brain.maskR,nh,nh,legacyFull?1:0,density*.55);
  brain.mask2=normalizeMask(brain.mask2,no,nh,legacyFull?1:0,density);
  brain.nodeGain=Array.from({length:nh},(_,i)=>Number.isFinite(brain.nodeGain?.[i])?brain.nodeGain[i]:rand(.78,1.22));
  for(let j=0;j<nh;j++){
    if(!brain.mask1[j].some(Boolean))brain.mask1[j][(Math.random()*ni)|0]=1;
    let reaches=false;for(let o=0;o<no;o++)if(brain.mask2[o][j]){reaches=true;break;}
    if(!reaches)brain.mask2[(Math.random()*no)|0][j]=1;
  }
  for(let o=0;o<no;o++)if(!brain.mask2[o].some(Boolean))brain.mask2[o][(Math.random()*nh)|0]=1;
  countBrainConnections(brain);return brain;
}
function randomBrain(ni=59,nh=22,no=30,density=.68){
  const brain={
    weights1:Array.from({length:nh},()=>Array.from({length:ni},()=>rand(-.9,.9))),
    weightsR:Array.from({length:nh},()=>Array.from({length:nh},()=>rand(-.22,.22))),
    bias1:Array.from({length:nh},()=>rand(-.16,.16)),
    weights2:Array.from({length:no},()=>Array.from({length:nh},()=>rand(-.9,.9))),
    bias2:Array.from({length:no},()=>rand(-.16,.16)),
    mask1:randomBinaryMask(nh,ni,density),maskR:randomBinaryMask(nh,nh,density*.48),mask2:randomBinaryMask(no,nh,density),
    nodeGain:Array.from({length:nh},()=>rand(.78,1.22))
  };
  return ensureBrainTopology(brain,ni,no,density,false);
}
function resizeBrain(brain,newHidden,ni=59,no=30){
  ensureBrainTopology(brain,ni,no,.68,true);
  const oldW1=brain.weights1,oldWR=brain.weightsR,oldW2=brain.weights2,oldM1=brain.mask1,oldMR=brain.maskR,oldM2=brain.mask2,oldBias=brain.bias1,oldGain=brain.nodeGain;
  newHidden=clamp(Math.round(newHidden),8,64);
  if(newHidden===oldBias.length)return brain;
  brain.weights1=Array.from({length:newHidden},(_,r)=>Array.from({length:ni},(_,c)=>oldW1?.[r]?.[c]??rand(-.5,.5)));
  brain.weightsR=Array.from({length:newHidden},(_,r)=>Array.from({length:newHidden},(_,c)=>oldWR?.[r]?.[c]??rand(-.12,.12)));
  brain.bias1=Array.from({length:newHidden},(_,r)=>oldBias?.[r]??rand(-.12,.12));
  brain.weights2=Array.from({length:no},(_,r)=>Array.from({length:newHidden},(_,c)=>oldW2?.[r]?.[c]??rand(-.45,.45)));
  brain.mask1=Array.from({length:newHidden},(_,r)=>Array.from({length:ni},(_,c)=>oldM1?.[r]?.[c]??(Math.random()<.62?1:0)));
  brain.maskR=Array.from({length:newHidden},(_,r)=>Array.from({length:newHidden},(_,c)=>oldMR?.[r]?.[c]??(Math.random()<.28?1:0)));
  brain.mask2=Array.from({length:no},(_,r)=>Array.from({length:newHidden},(_,c)=>oldM2?.[r]?.[c]??(Math.random()<.62?1:0)));
  brain.nodeGain=Array.from({length:newHidden},(_,i)=>oldGain?.[i]??rand(.78,1.22));
  return ensureBrainTopology(brain,ni,no,.64,false);
}
function mutateBrainTopology(brain,cognition,m){
  ensureBrainTopology(brain,59,30,.65,true);
  const rate=clamp((cognition.topologyMutation??.012)*(.45+m*5),.001,.08);
  const toggle=(mask,weights,scale)=>{
    for(let r=0;r<mask.length;r++)for(let c=0;c<mask[r].length;c++)if(Math.random()<rate){mask[r][c]=mask[r][c]?0:1;if(mask[r][c])weights[r][c]=rand(-scale,scale);}
  };
  toggle(brain.mask1,brain.weights1,.55);toggle(brain.maskR,brain.weightsR,.18);toggle(brain.mask2,brain.weights2,.55);
  for(let i=0;i<brain.nodeGain.length;i++)if(Math.random()<m*.35)brain.nodeGain[i]=clamp(brain.nodeGain[i]+rand(-.15,.15),.35,1.8);
  ensureBrainTopology(brain,59,30,.64,false);
}

function randomGenome(){
  const hiddenSize=Math.floor(rand(16,29));
  return {
    body:{
      size:rand(.55,1.15),segments:Math.floor(rand(1,4)),segmentStretch:rand(.72,1.28),
      limbPairs:Math.floor(rand(1,4)),limbLength:rand(.35,1),limbThickness:rand(.035,.085),
      speed:rand(1,2.6),turn:rand(.8,2.1),hue:rand(0,1),sensor:rand(.65,1.35),
      eyeCount:Math.floor(rand(1,4)),eyeSpread:rand(.12,.34),
      voice:rand(.2,1),hearing:rand(.65,1.45),pitchBase:rand(180,720),pitchRange:rand(80,560),vocalPrecision:rand(.35,1.35),
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
      thermalSense:rand(.35,1.55),interoception:rand(.45,1.65),reflexSpeed:rand(.45,1.55),nerveDelay:rand(.05,.45),
      jointStrength:rand(.60,1.55),jointFlexibility:rand(.60,1.55),jumpPower:rand(.55,1.45),motorPlasticity:rand(.45,1.55),
      developmentDuration:rand(28,62),limbOnset:rand(.08,.42),sensorOnset:rand(.04,.34),neuralOnset:rand(.03,.30),
      limbGrowthExponent:rand(.65,1.70),torsoGrowthExponent:rand(.65,1.45),juvenileHeadRatio:rand(.95,1.45),
      loadAdaptation:rand(.15,1.35),nutritionPlasticity:rand(.10,1.10),
      axialPosture:rand(.04,.58),limbDifferentiation:rand(.08,.72),
      manipulatorBias:rand(.20,1.12),supportBias:rand(.20,1.15),
      distalDexterity:rand(.18,1.20),supportFoot:rand(.38,1.38),headSeparation:rand(.15,1.05)
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
      cultureBias:rand(.1,1.25),
      topologyMutation:rand(.004,.024),
      predictiveDrive:rand(.15,1.35),
      modelLearning:rand(.06,.34),
      symbolLearning:rand(.15,1.45),
      conventionBias:rand(.10,1.25),
      teachingBias:rand(.05,1.10),reciprocityBias:rand(.10,1.40),kinBias:rand(.05,1.35),
      mateSelectivity:rand(.10,1.45),noveltyMateBias:rand(.05,1.15),reputationSensitivity:rand(.10,1.35),
      generosity:rand(.05,1.25),territoriality:rand(.05,1.20)
    },
    brain:randomBrain(59,hiddenSize,30,rand(.46,.82))
  };
}


function recombineGenome(g1,g2){
  g1=upgradeGenomeV13(structuredClone(g1));g2=upgradeGenomeV13(structuredClone(g2));
  const child=structuredClone(Math.random()<.5?g1:g2);
  for(const section of ['body','temperament','cognition']){
    const a=g1[section],b=g2[section],dst=child[section];
    for(const k of Object.keys(dst)){
      if(typeof dst[k]==='number'&&typeof a[k]==='number'&&typeof b[k]==='number'){
        dst[k]=Math.random()<.20?(a[k]+b[k])*.5:(Math.random()<.5?a[k]:b[k]);
      }
    }
  }
  const h1=g1.cognition.hiddenSize||g1.brain.bias1.length,h2=g2.cognition.hiddenSize||g2.brain.bias1.length;
  const target=clamp(Math.round((h1+h2)/2+rand(-3,3)),8,64);
  child.cognition.hiddenSize=target;
  const b1=resizeBrain(structuredClone(g1.brain),target,59,30),b2=resizeBrain(structuredClone(g2.brain),target,59,30);
  child.brain=resizeBrain(structuredClone(Math.random()<.5?b1:b2),target,59,30);
  for(let r=0;r<child.brain.weights1.length;r++)for(let c=0;c<child.brain.weights1[r].length;c++){
    child.brain.weights1[r][c]=Math.random()<.5?b1.weights1[r][c]:b2.weights1[r][c];
    child.brain.mask1[r][c]=Math.random()<.5?b1.mask1[r][c]:b2.mask1[r][c];
  }
  for(let r=0;r<child.brain.weightsR.length;r++)for(let c=0;c<child.brain.weightsR[r].length;c++){
    child.brain.weightsR[r][c]=Math.random()<.5?b1.weightsR[r][c]:b2.weightsR[r][c];
    child.brain.maskR[r][c]=Math.random()<.5?b1.maskR[r][c]:b2.maskR[r][c];
  }
  for(let r=0;r<child.brain.weights2.length;r++)for(let c=0;c<child.brain.weights2[r].length;c++){
    child.brain.weights2[r][c]=Math.random()<.5?b1.weights2[r][c]:b2.weights2[r][c];
    child.brain.mask2[r][c]=Math.random()<.5?b1.mask2[r][c]:b2.mask2[r][c];
  }
  ensureBrainTopology(child.brain,59,30,.64,false);
  return mutateGenome(child);
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
  b.vocalPrecision=clamp(maybe(b.vocalPrecision,.16),.15,2.0);
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
  b.jointStrength=clamp(maybe(b.jointStrength,.14),.30,2.1);
  b.jointFlexibility=clamp(maybe(b.jointFlexibility,.14),.30,2.1);
  b.jumpPower=clamp(maybe(b.jumpPower,.14),.25,2.0);
  b.motorPlasticity=clamp(maybe(b.motorPlasticity,.14),.20,2.0);
  b.developmentDuration=clamp(maybe(b.developmentDuration,5),16,90);
  b.limbOnset=clamp(maybe(b.limbOnset,.08),0,.72);
  b.sensorOnset=clamp(maybe(b.sensorOnset,.07),0,.70);
  b.neuralOnset=clamp(maybe(b.neuralOnset,.07),0,.70);
  b.limbGrowthExponent=clamp(maybe(b.limbGrowthExponent,.18),.35,2.6);
  b.torsoGrowthExponent=clamp(maybe(b.torsoGrowthExponent,.16),.35,2.2);
  b.juvenileHeadRatio=clamp(maybe(b.juvenileHeadRatio,.12),.70,1.75);
  b.loadAdaptation=clamp(maybe(b.loadAdaptation,.18),0,2.0);
  b.nutritionPlasticity=clamp(maybe(b.nutritionPlasticity,.16),0,1.8);
  b.axialPosture=clamp(maybe(b.axialPosture,.13),0,1);
  b.limbDifferentiation=clamp(maybe(b.limbDifferentiation,.14),0,1);
  b.manipulatorBias=clamp(maybe(b.manipulatorBias,.18),0,1.6);
  b.supportBias=clamp(maybe(b.supportBias,.18),0,1.6);
  b.distalDexterity=clamp(maybe(b.distalDexterity,.18),0,1.7);
  b.supportFoot=clamp(maybe(b.supportFoot,.16),.15,1.8);
  b.headSeparation=clamp(maybe(b.headSeparation,.15),0,1.5);

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
  if(Math.random()<m*.22)newHidden+=Math.random()<.5?-4:4;
  c.hiddenSize=clamp(Math.round(newHidden),8,64);
  c.planningDepth=clamp(Math.round(maybe(c.planningDepth,1)),1,6);
  c.sequenceSpan=clamp(Math.round(maybe(c.sequenceSpan,1)),2,6);
  c.imitation=clamp(maybe(c.imitation,.22),0,2);
  c.foresight=clamp(maybe(c.foresight,.22),0,2);
  c.cultureBias=clamp(maybe(c.cultureBias,.22),0,2);
  c.topologyMutation=clamp(maybe(c.topologyMutation,.005),.001,.06);
  c.predictiveDrive=clamp(maybe(c.predictiveDrive,.20),0,2.2);
  c.modelLearning=clamp(maybe(c.modelLearning,.05),.015,.65);
  c.symbolLearning=clamp(maybe(c.symbolLearning,.18),0,2.2);
  c.conventionBias=clamp(maybe(c.conventionBias,.16),0,2.0);
  c.teachingBias=clamp(maybe(c.teachingBias,.14),0,1.8);
  c.reciprocityBias=clamp(maybe(c.reciprocityBias,.16),0,2.0);c.kinBias=clamp(maybe(c.kinBias,.16),0,2.0);
  c.mateSelectivity=clamp(maybe(c.mateSelectivity,.16),0,2.0);c.noveltyMateBias=clamp(maybe(c.noveltyMateBias,.14),0,1.8);
  c.reputationSensitivity=clamp(maybe(c.reputationSensitivity,.16),0,2.0);c.generosity=clamp(maybe(c.generosity,.16),0,1.8);
  c.territoriality=clamp(maybe(c.territoriality,.14),0,1.8);
  resizeBrain(ng.brain,c.hiddenSize,59,30);

  for(const row of ng.brain.weights1)for(let i=0;i<row.length;i++)row[i]=maybe(row[i],.28);
  for(const row of ng.brain.weightsR)for(let i=0;i<row.length;i++)row[i]=maybe(row[i],.14);
  for(let i=0;i<ng.brain.bias1.length;i++)ng.brain.bias1[i]=maybe(ng.brain.bias1[i],.14);
  for(const row of ng.brain.weights2)for(let i=0;i<row.length;i++)row[i]=maybe(row[i],.28);
  for(let i=0;i<ng.brain.bias2.length;i++)ng.brain.bias2[i]=maybe(ng.brain.bias2[i],.14);
  mutateBrainTopology(ng.brain,c,m);
  return ng;
}

function upgradeGenomeV13(g){
  if(!g)return randomGenome();
  g.body=g.body||{};g.temperament=g.temperament||{};g.cognition=g.cognition||{};
  const b=g.body,c=g.cognition;
  const defaults={
    developmentDuration:44,limbOnset:.22,sensorOnset:.16,neuralOnset:.14,
    limbGrowthExponent:1.05,torsoGrowthExponent:1,juvenileHeadRatio:1.18,
    loadAdaptation:.65,nutritionPlasticity:.55,
    axialPosture:.24,limbDifferentiation:.32,manipulatorBias:.55,supportBias:.58,
    distalDexterity:.55,supportFoot:.72,headSeparation:.42
  };
  for(const [k,v] of Object.entries(defaults))if(!Number.isFinite(b[k]))b[k]=v;
  if(!Number.isFinite(c.topologyMutation))c.topologyMutation=.012;
  if(!Number.isFinite(c.predictiveDrive))c.predictiveDrive=.65;
  if(!Number.isFinite(c.modelLearning))c.modelLearning=.18;
  if(!Number.isFinite(b.vocalPrecision))b.vocalPrecision=.8;
  if(!Number.isFinite(c.symbolLearning))c.symbolLearning=.65;
  if(!Number.isFinite(c.conventionBias))c.conventionBias=.55;
  if(!Number.isFinite(c.teachingBias))c.teachingBias=.40;
  if(!Number.isFinite(c.reciprocityBias))c.reciprocityBias=.55;if(!Number.isFinite(c.kinBias))c.kinBias=.45;
  if(!Number.isFinite(c.mateSelectivity))c.mateSelectivity=.55;if(!Number.isFinite(c.noveltyMateBias))c.noveltyMateBias=.35;
  if(!Number.isFinite(c.reputationSensitivity))c.reputationSensitivity=.55;if(!Number.isFinite(c.generosity))c.generosity=.35;
  if(!Number.isFinite(c.territoriality))c.territoriality=.30;
  if(!Number.isFinite(c.hiddenSize))c.hiddenSize=g.brain?.bias1?.length||22;
  if(!g.brain)g.brain=randomBrain(59,c.hiddenSize,30,.68);
  ensureBrainTopology(g.brain,59,30,.68,true);c.hiddenSize=g.brain.bias1.length;return g;
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


function genomeLimbRoleProfile(g,pair){
  const pairs=Math.max(1,g.limbPairs||1);
  const u=pairs<=1?.5:pair/(pairs-1);
  const diff=clamp(g.limbDifferentiation??.32,0,1);
  const upper=1-u,lower=u;

  let manip=clamp((.18+upper*(g.manipulatorBias??.55))*(.52+.72*diff),0,1.45);
  let support=clamp((.20+lower*(g.supportBias??.58))*(.52+.72*diff),0,1.45);

  // With one pair the anatomy stays genuinely mixed rather than being labelled.
  if(pairs<=1){
    manip=clamp(.35+(g.manipulatorBias??.55)*.30,0,1);
    support=clamp(.35+(g.supportBias??.58)*.30,0,1);
  }
  return {u,manip,support,diff};
}
function ensureLimbUse(a){
  const n=Math.max(5,a.genome.body.limbPairs||0);
  if(!Array.isArray(a.phenotype.limbUse))a.phenotype.limbUse=[];
  while(a.phenotype.limbUse.length<n){
    a.phenotype.limbUse.push({support:0,manip:0,locomotion:0});
  }
  return a.phenotype.limbUse;
}
function limbFunctionalProfile(a,pair){
  const inherited=genomeLimbRoleProfile(a.genome.body,pair);
  const use=ensureLimbUse(a)[pair]||{support:0,manip:0,locomotion:0};
  const plastic=.18+.34*clamp(a.genome.body.loadAdaptation||.65,0,1.6);
  return {
    ...inherited,
    manip:clamp(inherited.manip+use.manip*plastic,0,1.65),
    support:clamp(inherited.support+(use.support*.68+use.locomotion*.32)*plastic,0,1.65),
    use
  };
}
function manipulatorSpecialization(a){
  const pairs=Math.max(0,a.genome.body.limbPairs||0);
  if(!pairs)return 0;
  let best=0;
  for(let p=0;p<pairs;p++)best=Math.max(best,limbFunctionalProfile(a,p).manip);
  return clamp(best/1.35,0,1.25);
}
function supportSpecialization(a){
  const pairs=Math.max(0,a.genome.body.limbPairs||0);
  if(!pairs)return 0;
  let best=0;
  for(let p=0;p<pairs;p++)best=Math.max(best,limbFunctionalProfile(a,p).support);
  return clamp(best/1.35,0,1.25);
}
function effectiveGripStrength(a){
  const g=a.genome.body;
  const manip=manipulatorSpecialization(a);
  const separation=clamp((g.axialPosture||0)*(g.limbDifferentiation||0),0,1);
  return g.grip*clamp(.76+manip*.32+(g.distalDexterity||.55)*.12+separation*.08,.62,1.55);
}
function effectiveManipReach(a){
  const g=a.genome.body;
  const manip=manipulatorSpecialization(a);
  return g.reach*clamp(.82+manip*.20+(g.distalDexterity||.55)*.07,.72,1.35);
}
function averageBodyPlanGene(key){
  return agents.length?agents.reduce((s,a)=>s+(a.genome.body?.[key]||0),0)/agents.length:0;
}
function averageManipulatorSpecialization(){
  return agents.length?agents.reduce((s,a)=>s+manipulatorSpecialization(a),0)/agents.length:0;
}
function averageSupportSpecialization(){
  return agents.length?agents.reduce((s,a)=>s+supportSpecialization(a),0)/agents.length:0;
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
  root.userData.limbPivots=[];
  root.userData.limbTips=[];
  root.userData.eyeParts=[];

  const count=Math.max(1,g.segments);
  const spine=[];
  const axial=clamp(g.axialPosture||0,0,1);
  for(let s=0;s<count;s++){
    const u=count===1?0:s/(count-1);
    const horizontalZ=-s*.43*g.size*g.segmentStretch;
    const uprightZ=-s*.075*g.size*g.segmentStretch;
    const horizontalY=.46*g.size+Math.sin(u*Math.PI)*g.spineArch*g.size;
    const uprightY=(.68-s*.46*g.segmentStretch)*g.size+Math.sin(u*Math.PI)*g.spineArch*g.size*.34;
    const z=THREE.MathUtils.lerp(horizontalZ,uprightZ,axial);
    const x=Math.sin(u*Math.PI)*g.bodyCurve*g.size*(1-axial*.42);
    const y=THREE.MathUtils.lerp(horizontalY,uprightY,axial);
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
      g.widthRatio*g.segmentStretch*taper*(1-axial*.08),
      g.heightRatio*(.76+.10*Math.cos(u*Math.PI))*(1+axial*.30),
      (.90+.12*taper)*(1-axial*.34)
    );
    seg.position.copy(spine[s]);
    seg.castShadow=true;
    seg.userData.partType='core';
    seg.userData.baseScale=seg.scale.clone();
    root.add(seg);root.userData.skinParts.push(seg);
  }

  const front=spine[0].clone();
  const head=new THREE.Mesh(new THREE.SphereGeometry(.31*g.size*g.headRatio,18,14),skinMatSoft);
  const headSep=clamp(g.headSeparation||.42,0,1.5);
  head.position.set(
    front.x,
    front.y+THREE.MathUtils.lerp(.10,.28+.10*headSep,axial)*g.size,
    front.z+THREE.MathUtils.lerp(.27,.08,axial)*g.size
  );
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
    eye.add(pupil);root.add(eye);root.userData.eyeParts.push(eye);
  }

  const pairs=Math.max(0,g.limbPairs);
  let motorIndex=0;
  for(let p=0;p<pairs;p++){
    const role=genomeLimbRoleProfile(g,p);
    const spineIndex=pairs<=1?0:Math.round((p/(pairs-1))*(spine.length-1));
    const anchor=spine[spineIndex];
    for(const side of [-1,1]){
      const outward=side*(.36+.12*g.widthRatio)*g.size;
      const roleLength=clamp(1+role.manip*.08*(g.distalDexterity||.55)+role.support*.06*(g.supportBias||.58),.82,1.28);
      const length=g.limbLength*g.legRatio*g.size*roleLength;
      const bend=(.12+.16*Math.abs(g.bodyCurve))*g.size;
      const p0=anchor.clone().add(new THREE.Vector3(side*.28*g.size*g.widthRatio,-.03*g.size,0));

      const p1Horizontal=p0.clone().add(new THREE.Vector3(outward*.65,-length*.36,bend*(p%2===0?1:-1)));
      const p2Horizontal=p0.clone().add(new THREE.Vector3(outward,-length*.76,-bend*.35));

      const upperness=1-role.u,lowerness=role.u;
      const p1Special=p0.clone().add(new THREE.Vector3(
        side*length*(.22+.22*role.manip),
        -length*(.36+.10*role.support),
        length*(.05+.05*upperness)
      ));
      const p2Special=p0.clone().add(new THREE.Vector3(
        side*length*(.14+.22*role.manip),
        -length*(.78+.16*role.support),
        length*(.05+.08*upperness)
      ));
      const roleBlend=clamp(axial*(.25+.75*role.diff),0,1);
      const p1=p1Horizontal.clone().lerp(p1Special,roleBlend);
      const p2=p2Horizontal.clone().lerp(p2Special,roleBlend);

      const pivot=new THREE.Group();
      pivot.position.copy(p0);
      pivot.userData.motorIndex=motorIndex;
      pivot.userData.motorSide=side;
      pivot.userData.motorPair=p;
      pivot.userData.inheritedManip=role.manip;
      pivot.userData.inheritedSupport=role.support;
      root.add(pivot);
      root.userData.limbPivots.push(pivot);

      const q0=new THREE.Vector3(0,0,0);
      const q1=p1.clone().sub(p0);
      const q2=p2.clone().sub(p0);
      const radius=Math.max(.022,g.limbThickness*g.size*(.78+.35*g.boneThickness));

      const limb=new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3([q0,q1,q2]),10,radius,8,false),skinMatSoft
      );
      limb.castShadow=true;limb.userData.partType='limbTube';
      pivot.add(limb);root.userData.skinParts.push(limb);

      const bone=new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3([q0,q1,q2]),8,radius*.34*g.boneThickness,6,false),
        boneMat
      );
      bone.visible=false;bone.castShadow=true;
      pivot.add(bone);root.userData.boneParts.push(bone);

      for(const qp of [q0,q1,q2]){
        const j=new THREE.Mesh(new THREE.SphereGeometry(radius*.52*g.jointSize,8,6),jointMat);
        j.position.copy(qp);j.visible=false;j.castShadow=true;
        pivot.add(j);root.userData.jointParts.push(j);
      }

      const muscle1=new THREE.Mesh(new THREE.SphereGeometry(radius*1.8,10,8),skinMatSoft);
      muscle1.position.copy(q1);
      muscle1.scale.set(1.0,1.35,1.0);
      muscle1.userData.partType='muscle';
      muscle1.userData.baseScale=muscle1.scale.clone();
      pivot.add(muscle1);root.userData.skinParts.push(muscle1);

      // Generic distal organ. Its proportions can become grip-like or support-like,
      // but it is never labelled as a hand or foot.
      const tip=new THREE.Mesh(new THREE.SphereGeometry(radius*1.22,10,8),skinMatSoft);
      tip.position.copy(q2);
      tip.userData.partType='limbTip';
      tip.userData.motorPair=p;
      tip.userData.baseScale=new THREE.Vector3(1,1,1);
      tip.castShadow=true;
      pivot.add(tip);root.userData.skinParts.push(tip);root.userData.limbTips.push(tip);
      motorIndex++;
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

function makeAgent(genome=randomGenome(),pos=randomGroundPos(),generation=0,lineage=null,opts={}){
  if(agents.length>=CONFIG.MAX_AGENTS)return null;
  genome=upgradeGenomeV13(genome);
  pos=pos.clone?pos.clone():new THREE.Vector3(pos.x||0,pos.y||0,pos.z||0);
  pos.y=terrainHeightAt(pos);
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
      bodyTemp:.50,
      developmentPhase:.08,devLimb:.05,devSensor:.10,devNeural:.10,
      devWidthBias:0,devHeightBias:0,devLimbBias:0,developmentalStress:0,
      limbUse:Array.from({length:5},()=>({support:0,manip:0,locomotion:0}))
    },
    nervous:{
      current:{touch:[0,0,0,0],pain:[0,0,0,0],temperature:0,pressure:0,proprio:0,balance:0,intero:0},
      pending:[],lastTouch:[0,0,0,0],lastPain:[0,0,0,0],reflexCooldown:0,signals:0,reflexes:0
    },
    motor:{
      joints:Array.from({length:10},()=>({angle:0,vel:0,drive:0,contact:1})),
      crouch:0,jumpY:0,jumpV:0,onGround:true,jumpCooldown:0,jumpRequest:false,
      efficiency:.28,effort:0,distance:0,jumps:0,lastX:pos.x,lastZ:pos.z
    },
    physics:null,
    heading:mesh.rotation.y,targetHeading:mesh.rotation.y,
    hidden:Array(genome.brain.bias1.length).fill(0),learnedW2:genome.brain.weights2.map(r=>r.slice()),
    socialMemory:new Map(),spatialMemory:[],visited:new Map(),lastVisitTick:-1,
    affect:{valence:0,arousal:.15,fear:0,anger:0,attachment:0,curiosity:.25},
    decision:{timer:rand(.1,.4),mode:0,target:null,context:'',q:0,plan:0,lastMode:0,lastContext:'',duration:0},
    nav:{lastDistance:null,lastMode:-1,lastTargetX:null,lastTargetZ:null,noProgress:0,progress:0,replans:0,
      path:[],pathTimer:0,loopScore:0,escapeSign:1,lastWaypoint:null,waypointTimer:0},
    actionModel:new Map(),sequenceHistory:[],sequenceModel:new Map(),observedModel:new Map(),
    predictive:{model:new Map(),lastError:0,intrinsic:0,totalUpdates:0},
    language:{lexicon:new Map(),production:new Map(),heardToken:null,heardAt:-999,lastProduced:null,lastScene:null,successfulExchanges:0,heardCount:0,producedCount:0,comprehension:0},
    externalMemory:{lexicon:new Map(),production:new Map(),lastSeen:null,lastSeenAt:-999,lastProduced:null,lastScene:null},
    motorCulture:{history:[],library:new Map(),activeKey:null,copied:0,sampleTimer:rand(0,.16)},
    markCooldown:rand(0,2),surfaceWork:0,materialDiscoveries:0,
    techSense:{current:null,last:null,surprise:0,changes:0},
    procedureMemory:{history:[],library:new Map(),pending:null,active:null,copied:0},
    mentalSimulations:0,imitations:0,lastPlanTable:[],
    rewardBuffer:0,lastEnergy:CONFIG.START_ENERGY,lastHealth:CONFIG.MAX_HEALTH,lastReward:0,
    reproCooldown:rand(2,8),attackCooldown:0,affiliateCooldown:0,
    signal:[0,0,0],sound:{freq:genome.body.pitchBase,amp:.25,pulse:.5,nextChirp:worldAge+rand(.3,1.2)},
    signalPhase:rand(0,Math.PI*2),children:0,lineage:lineage||Math.random().toString(36).slice(2,7),
    parentId:null,parentIds:[],mateHistory:new Map(),socialLedger:new Map(),reputationCache:new Map(),
    carrying:null,lastManipulatedMaterial:null,lastManipulatedAt:-999,
    currentManipIntent:0,currentWorkTargetId:null,currentWorkTargetKind:null,thought:'observando',
    bornAt:worldAge,foodEaten:0,energyGained:0,originBorn:originCount
  };
  a.parentId=opts.parentId??null;
  a.parentIds=Array.isArray(opts.parentIds)?[...opts.parentIds]:(a.parentId!=null?[a.parentId]:[]);
  mesh.userData.agent=a;agents.push(a);births++;
  maxPopulationSeen=Math.max(maxPopulationSeen,agents.length);
  if(!opts.originSeed){naturalBirths++;birthEvents.push(worldAge);}
  peakGeneration=Math.max(peakGeneration,generation);
  rememberVisit(a,true);
  applyMorphologyVisual(a);
  if(physicsEnabled&&timeScale<=RIGID_MAX_TIMESCALE)attachPhysicsRig(a);
  return a;
}




function pruneEvents(arr){
  const cutoff=worldAge-CONFIG.DEMO_WINDOW;
  while(arr.length && arr[0]<cutoff)arr.shift();
}
function recentDemography(){
  pruneEvents(birthEvents);pruneEvents(deathEvents);
  return {births:birthEvents.length,deaths:deathEvents.length,balance:birthEvents.length-deathEvents.length};
}
function individualMaxAge(a){
  const g=a.genome.body;
  return (CONFIG.MAX_AGE/Math.max(.45,g.agingRate))*(.75+g.size*.35);
}
function reproductiveMaxAge(a){
  return Math.max(CONFIG.MIN_REPRO_AGE+40,individualMaxAge(a)*.84);
}
function isFertile(a){
  return a.age>=CONFIG.MIN_REPRO_AGE &&
    a.age<reproductiveMaxAge(a) &&
    a.energy>=CONFIG.REPRO_MIN_ENERGY &&
    a.health>56 &&
    a.reproCooldown<=0;
}
function averageAge(){
  return agents.length?agents.reduce((s,a)=>s+a.age,0)/agents.length:0;
}
function fertilePopulation(){
  let n=0;for(const a of agents)if(isFertile(a))n++;return n;
}
function reproductiveAge(a){
  return a.age>=CONFIG.MIN_REPRO_AGE && a.age<reproductiveMaxAge(a) && a.health>56;
}
function currentFertilePairMetrics(maxDist=2.4){
  const fertile=agents.filter(isFertile);
  let pairs=0,nearestSum=0,nearestN=0,isolated=0;
  for(let i=0;i<fertile.length;i++){
    let nearest=Infinity;
    for(let j=0;j<fertile.length;j++){
      if(i===j)continue;
      const d=fertile[i].mesh.position.distanceTo(fertile[j].mesh.position);
      nearest=Math.min(nearest,d);
      if(j>i&&d<=maxDist)pairs++;
    }
    if(Number.isFinite(nearest)){
      nearestSum+=nearest;nearestN++;
      if(nearest>maxDist)isolated++;
    }else if(fertile.length===1){isolated++;}
  }
  return {pairs,avgNearest:nearestN?nearestSum/nearestN:Infinity,isolated};
}
function energyBlockedAdults(){
  let n=0;
  for(const a of agents)if(reproductiveAge(a)&&a.energy<CONFIG.REPRO_MIN_ENERGY)n++;
  return n;
}
function cooldownBlockedAdults(){
  let n=0;
  for(const a of agents)if(reproductiveAge(a)&&a.energy>=CONFIG.REPRO_MIN_ENERGY&&a.reproCooldown>0)n++;
  return n;
}
function noteFertileEncounter(a,b){
  if(!a||!b||a===b)return;
  const lo=Math.min(a.id,b.id),hi=Math.max(a.id,b.id),key=`${lo}:${hi}`;
  const last=fertilePairLastSeen.get(key)??-999;
  // Count one encounter episode per pair, not every simulation tick.
  if(worldAge-last>=6){fertileEncounterEvents.push(worldAge);fertilePairLastSeen.set(key,worldAge);}
}
function pruneDemographicDiagnosticEvents(){
  const cutoff=worldAge-CONFIG.DEMO_WINDOW;
  while(fertileEncounterEvents.length&&fertileEncounterEvents[0]<cutoff)fertileEncounterEvents.shift();
  while(matingEventTimes.length&&matingEventTimes[0]<cutoff)matingEventTimes.shift();
  while(rescueEpisodeEvents.length&&rescueEpisodeEvents[0]<cutoff)rescueEpisodeEvents.shift();
  for(const [k,t] of fertilePairLastSeen)if(t<worldAge-CONFIG.DEMO_WINDOW*2)fertilePairLastSeen.delete(k);
}
function fitnessScore(a){
  // Archive score favors realized reproduction and robust resource acquisition.
  // Raw age is intentionally almost neutral so the rescue bank does not artificially select longevity.
  return (
    a.generation*5.5 +
    a.children*30 +
    a.foodEaten*1.45 +
    a.energyGained*.065 +
    Math.max(0,a.health)*.025 +
    Math.max(0,a.energy)*.018 +
    Math.min(20,a.sequenceModel?.size||0)*.28 +
    Math.min(a.age,80)*.012
  );
}
function archiveAgent(a){
  const score=fitnessScore(a);
  if(score<7)return;
  genomeArchive.push({
    genome:structuredClone(a.genome),
    score,lineage:a.lineage,generation:a.generation,
    children:a.children,age:a.age,origin:a.originBorn
  });
  genomeArchive.sort((x,y)=>y.score-x.score);

  const counts=new Map(),filtered=[];
  for(const e of genomeArchive){
    const c=counts.get(e.lineage)||0;
    if(c>=3)continue;
    counts.set(e.lineage,c+1);
    filtered.push(e);
    if(filtered.length>=CONFIG.ARCHIVE_MAX)break;
  }
  genomeArchive.length=0;
  genomeArchive.push(...filtered);
}
function createEmbryo(parent,genome,pos,generation,lineage){
  if(embryos.length>=CONFIG.EMBRYO_MAX)return false;
  const embryo={
    genome:structuredClone(genome),
    pos:pos.clone(),
    generation,lineage,parentId:parent?.id??null,
    laidAt:worldAge,
    hatchAt:worldAge+rand(5,18),
    expiresAt:worldAge+rand(CONFIG.EMBRYO_MAX_AGE*.72,CONFIG.EMBRYO_MAX_AGE),
    languageSeed:parent?exportLanguageSeed(parent):[],
    motorSeed:parent?exportMotorCulture(parent):[],
    procedureSeed:parent?exportProcedures(parent):[],
    markSeed:parent?[...parent.externalMemory.lexicon.entries()].filter(([,r])=>r.success>0).slice(0,4).map(([k,r])=>[k,{...r,contexts:{},modeQ:r.modeQ.map(v=>v*.08),n:Math.min(.5,r.n*.08),success:0}]):[],
    culturalSeed:parent?[...parent.sequenceModel.entries()]
      .sort((x,y)=>y[1].q-x[1].q).slice(0,2)
      .filter(([,r])=>r.q>0)
      .map(([key,r])=>[key,r.q]):[]
  };
  embryos.push(embryo);
  return embryo;
}
function hatchEmbryo(e){
  if(agents.length>=CONFIG.MAX_AGENTS)return false;
  const p=e.pos.clone();
  p.x+=rand(-.8,.8);p.z+=rand(-.8,.8);
  const r=Math.hypot(p.x,p.z);
  if(r>CONFIG.WORLD-1)p.multiplyScalar((CONFIG.WORLD-1)/r);

  const pids=e.parentIds||[e.parentId].filter(v=>v!=null);
  const child=makeAgent(e.genome,p,e.generation,e.lineage,{parentIds:pids,originSeed:!!e.rescueSeed});
  if(!child)return false;
  child.parentId=pids[0]??null;child.parentIds=pids;
  if(e.rescueSeed){rescueInsertions++;rescueInsertionEvents.push(worldAge);}
  child.energy=clamp(CONFIG.START_ENERGY*(.88+.18*(e.parentalReserve??.55)),49,65);
  child.phenotype.growth=.20+rand(0,.07);
  child.phenotype.muscle=clamp(.23+rand(-.05,.07),.12,.45);
  child.phenotype.fat=clamp(.20+rand(-.04,.08),.08,.48);
  child.phenotype.condition=.95+rand(-.06,.06);
  for(const [key,q] of e.culturalSeed||[]){
    child.sequenceModel.set(key,{q:q*.08*(child.genome.cognition?.cultureBias||.5),n:.1});
  }
  importLanguageSeed(child,e.languageSeed||[],.85);
  importMotorCulture(child,e.motorSeed||[],.72);
  importProcedures(child,e.procedureSeed||[],.68);
  for(const [pat,r] of e.markSeed||[])child.externalMemory.lexicon.set(pat,r);
  applyMorphologyVisual(child);
  return true;
}
function updateEmbryos(dt){
  for(let i=embryos.length-1;i>=0;i--){
    const e=embryos[i];
    if(worldAge>=e.expiresAt){embryos.splice(i,1);continue;}
    if(worldAge<e.hatchAt)continue;

    const density=agents.length/CONFIG.MAX_AGENTS;
    const hatchChance=dt*(density<.18?1.8:density<.5?.55:.16);
    if(agents.length===0 || Math.random()<hatchChance){
      if(hatchEmbryo(e))embryos.splice(i,1);
    }
  }
}
function seedAgentFromArchive(){
  if(!genomeArchive.length)return {genome:randomGenome(),generation:0,lineage:null};
  if(Math.random()<.72){
    const pool=genomeArchive.slice(0,Math.min(8,genomeArchive.length));
    const chosen=pool[(Math.random()*pool.length)|0];
    return {
      genome:mutateGenome(structuredClone(chosen.genome)),
      generation:chosen.generation+1,
      lineage:chosen.lineage
    };
  }
  return {genome:randomGenome(),generation:0,lineage:null};
}
function diversifyOriginAgent(a){
  const age=rand(0,58);
  a.age=age;
  a.energy=rand(52,84);
  a.health=rand(82,100);
  a.reproCooldown=rand(0,CONFIG.REPRO_COOLDOWN);

  const maturity=38/Math.max(.5,a.genome.body.growthRate);
  a.phenotype.growth=clamp(age/maturity,0,1);
  a.phenotype.skeletalMaturity=clamp(age/(maturity*.8),0,1);
  a.phenotype.muscle=clamp(rand(.23,.48)+a.phenotype.growth*.12,.12,.70);
  a.phenotype.fat=rand(.14,.38);
  a.phenotype.condition=rand(.86,1.12);
  a.lastEnergy=a.energy;
  a.lastHealth=a.health;
  applyMorphologyVisual(a);
  if(a.physics)rebuildPhysicsRig(a);
}

function bodyScaleForPhysics(a){
  const g=a.genome.body,p=a.phenotype;
  return Math.max(.22,g.adultScale*(.38+.62*p.growth)*g.size);
}
function yawQuaternion(yaw){
  const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,yaw,0));
  return {x:q.x,y:q.y,z:q.z,w:q.w};
}
function removePhysicsRig(a){
  if(!a?.physics||!physicsWorld)return;
  try{
    if(a.physics.torso)physicsWorld.removeRigidBody(a.physics.torso);
    for(const limb of a.physics.limbs||[]){
      if(limb.body && limb.body.isValid?.())physicsWorld.removeRigidBody(limb.body);
    }
  }catch(err){
    console.warn('No se pudo retirar un rig físico limpiamente',err);
  }
  a.physics=null;
}
function attachPhysicsRig(a){
  if(!physicsEnabled||!physicsWorld||a.physics)return;
  const g=a.genome.body;
  const s=bodyScaleForPhysics(a);
  const pairs=Math.max(0,Math.min(5,g.limbPairs));
  const limbCount=Math.min(10,pairs*2);

  const axial=clamp(g.axialPosture||0,0,1);
  const hx=Math.max(.12,.26*s*g.widthRatio);
  const hy=Math.max(.10,.18*s*g.heightRatio*(1+axial*.65));
  const hz=Math.max(.14,(.24+.12*Math.max(1,g.segments))*s*(1-axial*.42));
  const devLimb=clamp(.16+.84*(a.phenotype.devLimb??1),.12,1.15)*(1+(a.phenotype.devLimbBias||0));
  const limbLengthBase=Math.max(.08,g.limbLength*g.legRatio*s*devLimb);
  const limbRadius=Math.max(.018,g.limbThickness*s*(.75+.25*g.boneThickness)*(.45+.55*devLimb));
  const torsoY=Math.max(.30,hy+limbLengthBase*.58+.08);

  const q=yawQuaternion(a.heading);
  const pos=a.mesh.position;
  pos.y=terrainHeightAt(pos)+Math.max(0,a.motor?.jumpY||0);
  const baseY=pos.y;
  const torsoDesc=RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(pos.x,torsoY+baseY,pos.z)
    .setRotation(q)
    .setLinearDamping(1.15)
    .setAngularDamping(3.2)
    .setCcdEnabled(true);
  const torso=physicsWorld.createRigidBody(torsoDesc);
  const torsoCollider=physicsWorld.createCollider(
    RAPIER.ColliderDesc.cuboid(hx,hy,hz)
      .setDensity(.75+g.boneThickness*.25)
      .setFriction(.72)
      .setRestitution(.02),
    torso
  );

  const rig={
    torso,torsoCollider,limbs:[],visualOffsetY:torsoY,torsoHalfHeight:hy,
    scale:s,devLimb:a.phenotype.devLimb??1,lastRebuildAge:a.age,contactCount:0,lastX:pos.x,lastZ:pos.z,
    terrainPenetrationTime:0,lastTerrainRecovery:-999
  };

  for(let p=0;p<pairs;p++){
    const role=genomeLimbRoleProfile(g,p);
    const limbLength=limbLengthBase*clamp(1+role.manip*.06*(g.distalDexterity||.55)+role.support*.05, .82,1.25);
    const u=pairs<=1?.5:p/(pairs-1);
    const zHorizontal=pairs<=1?0:(u-.5)*hz*1.42;
    const zLocal=THREE.MathUtils.lerp(zHorizontal,(.18-u*.26)*hz,axial);
    const yLocal=THREE.MathUtils.lerp(-hy*.70,THREE.MathUtils.lerp(hy*.58,-hy*.72,u),axial);
    for(const side of [-1,1]){
      const index=rig.limbs.length;
      if(index>=limbCount)break;
      const xLocal=side*hx*(.90+.08*role.manip);

      const local=new THREE.Vector3(xLocal,yLocal,zLocal);
      local.applyQuaternion(new THREE.Quaternion(q.x,q.y,q.z,q.w));
      const lx=pos.x+local.x;
      const lz=pos.z+local.z;
      const ly=baseY+torsoY-hy*.72-limbLength*.46;

      const limbDesc=RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(lx,Math.max(baseY+limbLength*.48+limbRadius,ly),lz)
        .setRotation(q)
        .setLinearDamping(.75)
        .setAngularDamping(1.35)
        .setCcdEnabled(true);
      const body=physicsWorld.createRigidBody(limbDesc);
      const collider=physicsWorld.createCollider(
        RAPIER.ColliderDesc.capsule(
          Math.max(.025,limbLength*.40-limbRadius),
          limbRadius
        )
          .setDensity(.42+.18*g.boneThickness)
          .setFriction(1.55)
          .setRestitution(.01),
        body
      );

      const jointData=RAPIER.JointData.revolute(
        {x:xLocal,y:yLocal,z:zLocal},
        {x:0,y:limbLength*.43,z:0},
        {x:1,y:0,z:0}
      );
      const joint=physicsWorld.createImpulseJoint(jointData,torso,body,true);
      const limit=.34+.48*g.jointFlexibility;
      try{joint.setLimits(-limit,limit);}catch{}

      rig.limbs.push({
        body,collider,joint,index,side,pair:p,
        length:limbLength,radius:limbRadius,contact:false
      });
    }
  }

  a.physics=rig;
}
function rebuildPhysicsRig(a){
  if(!physicsEnabled||!physicsWorld)return;
  let vel={x:0,y:0,z:0},ang={x:0,y:0,z:0},pos=a.mesh.position.clone();
  if(a.physics?.torso){
    const t=a.physics.torso.translation(),v=a.physics.torso.linvel(),w=a.physics.torso.angvel();
    pos.set(t.x,t.y-a.physics.visualOffsetY,t.z);
    vel={x:v.x,y:v.y,z:v.z};ang={x:w.x,y:w.y,z:w.z};
  }
  removePhysicsRig(a);
  a.mesh.position.copy(pos);
  attachPhysicsRig(a);
  if(a.physics?.torso){
    a.physics.torso.setLinvel(vel,true);
    a.physics.torso.setAngvel(ang,true);
  }
}
function syncAgentFromPhysics(a){
  const rig=a.physics;if(!rig?.torso)return;
  const t=rig.torso.translation(),r=rig.torso.rotation();
  const q=new THREE.Quaternion(r.x,r.y,r.z,r.w);

  const rootOffset=new THREE.Vector3(0,rig.visualOffsetY,0).applyQuaternion(q);
  a.mesh.position.set(t.x-rootOffset.x,t.y-rootOffset.y,t.z-rootOffset.z);
  a.mesh.quaternion.copy(q);

  const eul=new THREE.Euler().setFromQuaternion(q,'YXZ');
  if(Number.isFinite(eul.y))a.heading=eul.y;

  const dx=t.x-rig.lastX,dz=t.z-rig.lastZ;
  const moved=Math.hypot(dx,dz);
  a.motor.distance+=moved;
  rig.lastX=t.x;rig.lastZ=t.z;

  const torsoInv=q.clone().invert();
  const pivots=a.mesh.userData.limbPivots||[];
  let contacts=0;
  for(let i=0;i<rig.limbs.length;i++){
    const limb=rig.limbs[i];
    const lr=limb.body.rotation();
    const lq=new THREE.Quaternion(lr.x,lr.y,lr.z,lr.w);
    const localQ=torsoInv.clone().multiply(lq);
    if(pivots[i])pivots[i].quaternion.copy(localQ);

    const lt=limb.body.translation();
    const groundY=terrainHeightAt({x:lt.x,z:lt.z});
    const contact=lt.y-limb.length*.48-limb.radius<groundY+.11;
    limb.contact=contact;
    a.motor.joints[i].contact=contact?1:0;
    if(contact)contacts++;
  }
  rig.contactCount=contacts;
  const torsoGround=terrainHeightAt({x:t.x,z:t.z});
  a.motor.onGround=contacts>0 || t.y-rig.visualOffsetY<torsoGround+.10;
}
function applyRigidMotorForces(a,dt){
  const rig=a.physics;if(!rig?.torso)return;
  const g=a.genome.body,m=a.motor;
  const torso=rig.torso;
  const tr=torso.rotation();
  const tq=new THREE.Quaternion(tr.x,tr.y,tr.z,tr.w);

  // Active postural stabilization: a physically applied torque, not a teleport.
  const up=new THREE.Vector3(0,1,0).applyQuaternion(tq);
  const corr=new THREE.Vector3().crossVectors(up,new THREE.Vector3(0,1,0));
  const av=torso.angvel();
  const stabilize=clamp(g.jointStrength*(1-a.nervous.current.balance*.25),.25,2.5);
  torso.applyTorqueImpulse({
    x:(corr.x*1.8-av.x*.08)*stabilize*dt,
    y:0,
    z:(corr.z*1.8-av.z*.08)*stabilize*dt
  },true);

  // Physical yaw steering toward the cognitive target.
  const currentYaw=new THREE.Euler().setFromQuaternion(tq,'YXZ').y;
  let yawErr=a.targetHeading-currentYaw;
  while(yawErr>Math.PI)yawErr-=Math.PI*2;
  while(yawErr<-Math.PI)yawErr+=Math.PI*2;
  torso.applyTorqueImpulse({x:0,y:clamp(yawErr,-1,1)*g.turn*.028*dt,z:0},true);

  const forward=new THREE.Vector3(0,0,1).applyQuaternion(tq).normalize();
  const localX=new THREE.Vector3(1,0,0).applyQuaternion(tq).normalize();
  const gain=.45+.90*sigmoid(m.motorGain??0);
  let effort=0,contacts=0,leftV=0,rightV=0,leftN=0,rightN=0;

  for(let i=0;i<rig.limbs.length;i++){
    const limb=rig.limbs[i],j=m.joints[i];
    const drive=clamp(j.drive||0,-1,1);
    const torque=drive*g.jointStrength*gain*.105;
    limb.body.applyTorqueImpulse({
      x:localX.x*torque*dt,
      y:localX.y*torque*dt,
      z:localX.z*torque*dt
    },true);

    const w=limb.body.angvel();
    const signedVel=w.x*localX.x+w.y*localX.y+w.z*localX.z;
    j.vel=signedVel;
    effort+=Math.abs(drive*signedVel);

    const lt=limb.body.translation();
    const localGroundY=terrainHeightAt({x:lt.x,z:lt.z});
    limb.contact=lt.y-limb.length*.48-limb.radius<localGroundY+.11;
    j.contact=limb.contact?1:0;
    if(limb.contact){
      contacts++;
      // Limb pushes the ground backwards/forwards; joint + friction transfer reaction to torso.
      const role=limbFunctionalProfile(a,limb.pair);
      const supportGain=clamp(.72+.46*role.support,.62,1.38);
      const push=-drive*g.jointStrength*(.018+.010*gain)*supportGain;
      limb.body.applyImpulse({x:forward.x*push,y:0,z:forward.z*push},true);
      if(limb.side<0){leftV+=signedVel;leftN++;}else{rightV+=signedVel;rightN++;}
    }
  }

  const lv=leftN?leftV/leftN:0,rv=rightN?rightV/rightN:0;
  const alternating=clamp(Math.abs(lv-rv)/3,0,1);
  const activity=clamp((Math.abs(lv)+Math.abs(rv))/2.8,0,1);
  const support=rig.limbs.length?contacts/rig.limbs.length:0;
  const symmetry=1-clamp(Math.abs(Math.abs(lv)-Math.abs(rv))/2.8,0,1);
  const efficiency=rig.limbs.length
    ?clamp(.05+activity*.34+alternating*.31+support*.18+symmetry*.12,.04,1.05)
    :.12;

  m.efficiency=m.efficiency*.90+efficiency*.10;
  m.effort=m.effort*.88+(effort/Math.max(1,rig.limbs.length))*.12;
  rig.contactCount=contacts;

  // Jump is an actual upward impulse against gravity.
  if(m.jumpRequest&&m.jumpCooldown<=0&&contacts>=Math.min(2,Math.max(1,rig.limbs.length))&&a.energy>12){
    const impulse=(.72+1.15*g.jumpPower)*(1+.12*g.jointStrength);
    torso.applyImpulse({x:0,y:impulse,z:0},true);
    for(const limb of rig.limbs){
      if(limb.contact)limb.body.applyImpulse({x:0,y:-impulse*.08,z:0},true);
    }
    m.jumpCooldown=1.25;m.jumps++;m.jumpRequest=false;
    a.energy=Math.max(0,a.energy-(.8+.5*g.jumpPower));
  }
  m.jumpCooldown=Math.max(0,m.jumpCooldown-dt);
}

function recoverRigidTerrainPenetration(a,dt){
  const rig=a.physics;if(!rig?.torso)return false;
  const t=rig.torso.translation();
  const torsoGround=terrainHeightAt({x:t.x,z:t.z});
  const torsoBottom=t.y-(rig.torsoHalfHeight||.18);

  let maxPen=Math.max(0,torsoGround-torsoBottom);
  for(const limb of rig.limbs||[]){
    const lt=limb.body.translation();
    const ground=terrainHeightAt({x:lt.x,z:lt.z});
    const bottom=lt.y-limb.length*.48-limb.radius;
    maxPen=Math.max(maxPen,ground-bottom);
  }

  // Small contacts are normal on sloped triangles. Only sustained, deep penetration is corrected.
  if(maxPen>.16){
    rig.terrainPenetrationTime=(rig.terrainPenetrationTime||0)+dt;
  }else{
    rig.terrainPenetrationTime=Math.max(0,(rig.terrainPenetrationTime||0)-dt*2.2);
    return false;
  }

  if(rig.terrainPenetrationTime<.20 || worldAge-(rig.lastTerrainRecovery||-999)<.55)return false;

  const lift=clamp(maxPen+.16,.18,1.65);
  const liftBody=(body)=>{
    const p=body.translation();
    body.setTranslation({x:p.x,y:p.y+lift,z:p.z},true);
    const v=body.linvel();
    body.setLinvel({x:v.x*.58,y:Math.max(.10,v.y*.25),z:v.z*.58},true);
    const w=body.angvel();
    body.setAngvel({x:w.x*.45,y:w.y*.65,z:w.z*.45},true);
  };

  liftBody(rig.torso);
  for(const limb of rig.limbs||[])liftBody(limb.body);

  rig.terrainPenetrationTime=0;
  rig.lastTerrainRecovery=worldAge;
  totalTerrainRecoveries++;
  a.rewardBuffer-=.004; // tiny physical failure signal; not a behavioral command.
  queueNerveSignal(a,'pressure',clamp(maxPen/.7,.15,1),1,.01);
  queueNerveSignal(a,'balance',clamp(maxPen/.6,.18,1),-1,.01);
  return true;
}

function stepRigidPhysics(realDt){
  if(!physicsEnabled||!physicsWorld||!rigidModeActive)return;
  const physicsScale=Math.min(timeScale,RIGID_MAX_TIMESCALE);
  physicsAccumulator+=realDt*physicsScale;
  let steps=0;
  while(physicsAccumulator>=PHYSICS_FIXED_DT&&steps<PHYSICS_MAX_STEPS_PER_FRAME){
    for(const a of agents){
      if(a.physics)applyRigidMotorForces(a,PHYSICS_FIXED_DT);
    }
    physicsWorld.timestep=PHYSICS_FIXED_DT;
    physicsWorld.step();
    physicsAccumulator-=PHYSICS_FIXED_DT;
    steps++;
  }
  if(steps>=PHYSICS_MAX_STEPS_PER_FRAME)physicsAccumulator=Math.min(physicsAccumulator,PHYSICS_FIXED_DT);

  totalPhysicalContacts=0;
  const recoveryDt=Math.max(PHYSICS_FIXED_DT,steps*PHYSICS_FIXED_DT);
  for(const a of agents){
    if(!a.physics)continue;
    recoverRigidTerrainPenetration(a,recoveryDt);
    syncAgentFromPhysics(a);
    totalPhysicalContacts+=a.physics.contactCount||0;

    // Rebuild occasionally as a growing body changes size substantially.
    const s=bodyScaleForPhysics(a);
    const limbChange=Math.abs((a.phenotype.devLimb??1)-(a.physics.devLimb??1));
    if((Math.abs(s-a.physics.scale)/Math.max(.1,a.physics.scale)>.18 || limbChange>.20) && a.age-a.physics.lastRebuildAge>5){
      rebuildPhysicsRig(a);
    }
  }
}
function setRigidMode(active){
  active=!!(active&&physicsEnabled&&physicsWorld);
  if(active===rigidModeActive)return;
  rigidModeActive=active;
  physicsAccumulator=0;
  if(active){
    for(const a of agents){
      if(!a.physics){
        a.mesh.position.y=terrainHeightAt(a.mesh.position);
        a.motor.jumpY=0;a.motor.jumpV=0;a.motor.onGround=true;
        attachPhysicsRig(a);
      }
    }
  }else{
    for(const a of agents)removePhysicsRig(a);
  }
}
function updateRigidMode(){
  setRigidMode(physicsEnabled&&timeScale<=RIGID_MAX_TIMESCALE);
}
function physicsVelocity(a){
  if(!a.physics?.torso)return 0;
  const v=a.physics.torso.linvel();
  return Math.hypot(v.x,v.z);
}
function rigidBodyCount(){
  if(!rigidModeActive)return 0;
  let n=0;
  for(const a of agents)if(a.physics)n+=1+a.physics.limbs.length;
  return n;
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
    queueNerveSignal(a,'pressure',clamp((a.carrying.props.mass/(effectiveGripStrength(a)+0.2))*.65,0,1));
    queueNerveSignal(a,'touch',clamp(.25+a.carrying.props.hardness*.35,0,1),3);
  }
  if(inPond(a.mesh.position)){
    queueNerveSignal(a,'temperature',clamp(.25+g.thermalSense*.18,0,1));
    queueNerveSignal(a,'touch',.18,1);
  }
  const envTemp=environmentTemperatureAt(a.mesh.position);
  if(envTemp>42)queueNerveSignal(a,'temperature',clamp((envTemp-35)/180*g.thermalSense,0,1));
  const r=Math.hypot(a.mesh.position.x,a.mesh.position.z);
  if(r>CONFIG.WORLD-1.2){
    queueNerveSignal(a,'touch',.75,1);
    queueNerveSignal(a,'pain',.12,1);
  }
  const turnStress=clamp(Math.abs(a.targetHeading-a.heading)/Math.PI,0,1);
  const motorSense=clamp((a.motor?.effort||0)*.16,0,1);
  queueNerveSignal(a,'proprio',clamp((speed/Math.max(.4,g.speed))*.45 + turnStress*.30 + motorSense*.25,0,1));
  queueNerveSignal(a,'balance',clamp(turnStress*.72 + maxArray(a.nervous.current.touch)*.10 + (a.motor?.onGround===false?.22:0),0,1));
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
  const devDuration=Math.max(12,g.developmentDuration/Math.max(.5,g.growthRate));
  const phase=clamp(a.age/devDuration,0,1);
  p.developmentPhase=phase;
  const smoothOnset=(onset,exp=1)=>{const x=clamp((phase-onset)/Math.max(.05,1-onset),0,1);return Math.pow(x,exp);};
  p.growth=Math.pow(phase,g.torsoGrowthExponent);
  p.skeletalMaturity=clamp(Math.pow(phase,.82),0,1);
  p.devLimb=smoothOnset(g.limbOnset,g.limbGrowthExponent);
  p.devSensor=smoothOnset(g.sensorOnset,.82);
  p.devNeural=smoothOnset(g.neuralOnset,.78);

  // Limb roles are not assigned labels. Repeated support, locomotion and
  // manipulation change developmental specialization within inherited limits.
  const limbUse=ensureLimbUse(a);
  const pairCount=Math.max(0,g.limbPairs||0);
  const manipActivity=clamp(Math.max(0,a.currentManipIntent||0)+(a.carrying?.45:0),0,1.45);
  for(let pair=0;pair<pairCount;pair++){
    const j0=a.motor?.joints?.[pair*2],j1=a.motor?.joints?.[pair*2+1];
    const contact=((j0?.contact||0)+(j1?.contact||0))*.5;
    const drive=(Math.abs(j0?.drive||0)+Math.abs(j1?.drive||0))*.5;
    const inherited=genomeLimbRoleProfile(g,pair);
    const targetSupport=clamp(contact*(.35+.65*drive),0,1);
    const targetLoco=clamp(contact*drive,0,1);
    const targetManip=clamp(manipActivity*inherited.manip/(.45+inherited.manip),0,1);
    const rate=clamp(dt*(phase<1?.055:.018),0,.12);
    limbUse[pair].support+=(targetSupport-limbUse[pair].support)*rate;
    limbUse[pair].locomotion+=(targetLoco-limbUse[pair].locomotion)*rate;
    limbUse[pair].manip+=(targetManip-limbUse[pair].manip)*rate;
  }

  if(phase>.82&&(g.axialPosture||0)>.68&&(g.limbDifferentiation||0)>.66&&pairCount>=2){
    recordDiscovery('bodyplan:differentiated:first','🧬','Plan corporal altamente diferenciado',
      'Apareció un organismo adulto con eje corporal elevado y extremidades fuertemente diferenciadas. Esto describe su morfología, no una forma humana.',a.mesh.position);
  }

  const energyRatio=a.energy/CONFIG.MAX_ENERGY;
  const load=a.carrying?a.carrying.props.mass:0;
  const activity=clamp(speed/Math.max(.5,g.speed),0,1.5);
  p.lastLoad=load;
  if(phase<1){
    const nutrition=(energyRatio-.52)*g.nutritionPlasticity;
    const mech=(activity*.55+clamp(load/1.3,0,1)*.75)*g.loadAdaptation;
    p.devWidthBias=clamp((p.devWidthBias||0)+dt*(mech*.00022+Math.max(0,nutrition)*.00016),-.14,.24);
    p.devHeightBias=clamp((p.devHeightBias||0)+dt*(nutrition*.00018-mech*.000035),-.18,.18);
    p.devLimbBias=clamp((p.devLimbBias||0)+dt*(activity*.00016*g.loadAdaptation+nutrition*.00007),-.16,.22);
    const deficit=clamp(.38-energyRatio,0,.38);
    p.developmentalStress=clamp((p.developmentalStress||0)+dt*(deficit*.009-(p.developmentalStress||0)*.0025),0,1);
  }

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
  const envC=environmentTemperatureAt(a.mesh.position);
  const thermalEnv=inPond(a.mesh.position)?0.28:clamp((envC-5)/80,0,1);
  p.bodyTemp=clamp(p.bodyTemp + (thermalEnv-p.bodyTemp)*dt*.55,0,1);
  if(envC>95){const thermalDamage=(envC-95)/260;a.health-=dt*thermalDamage*.65;a.rewardBuffer-=dt*thermalDamage*.035;}

  // Aging gradually degrades condition after late adulthood.
  const ageFrac=a.age/Math.max(1,individualMaxAge(a));
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
  const adaptiveWidth=1+(p.devWidthBias||0),adaptiveHeight=1+(p.devHeightBias||0);
  const juvenileHead=1+(1-p.growth)*(g.juvenileHeadRatio-1);

  const overall=g.adultScale*growth;
  const crouch=(rigidModeActive&&a.physics)?0:(a.motor?.crouch||0);
  a.mesh.scale.set(overall,overall*(1-.16*crouch),overall);

  a.mesh.traverse(o=>{
    const type=o.userData?.partType;
    if(!type)return;
    const base=o.userData.baseScale||new THREE.Vector3(1,1,1);

    if(type==='core'){
      o.scale.set(
        base.x*fatSoft*muscleBulk*adaptiveWidth,
        base.y*sen*(1+p.muscle*.05)*adaptiveHeight,
        base.z*fatSoft*adaptiveWidth
      );
    }else if(type==='head'){
      o.scale.set(
        base.x*(1+p.fat*.08)*juvenileHead,
        base.y*sen*juvenileHead,
        base.z*(1+p.fat*.08)*juvenileHead
      );
    }else if(type==='muscle'){
      const thick=.72+p.muscle*.60*g.musclePotential;
      o.scale.set(base.x*thick,base.y*(.84+p.muscle*.30),base.z*thick);
    }
  });

  const limbScale=clamp(.12+.88*(p.devLimb||0),.10,1.12)*(1+(p.devLimbBias||0));
  for(const pivot of a.mesh.userData.limbPivots||[]){
    const pair=pivot.userData.motorPair||0;
    const role=limbFunctionalProfile(a,pair);
    const vertical=1+clamp(role.support*.05-role.manip*.02,-.04,.09);
    const lateral=1+clamp(role.manip*.045,.0,.07);
    pivot.scale.set(limbScale*lateral,limbScale*vertical,limbScale);
  }
  for(const tip of a.mesh.userData.limbTips||[]){
    const role=limbFunctionalProfile(a,tip.userData.motorPair||0);
    const base=tip.userData.baseScale||new THREE.Vector3(1,1,1);
    const manip=clamp(role.manip,0,1.4),support=clamp(role.support,0,1.4);
    if(manip>=support){
      const dex=clamp(g.distalDexterity||.55,0,1.7);
      tip.scale.set(base.x*(1+.42*manip),base.y*(.68+.10*dex),base.z*(.82+.12*dex));
    }else{
      const foot=clamp(g.supportFoot||.72,.15,1.8);
      tip.scale.set(base.x*(.90+.18*support),base.y*.62,base.z*(.95+.52*support*foot));
    }
  }
  const sensorScale=clamp(.18+.82*(p.devSensor||0),.14,1);
  for(const eye of a.mesh.userData.eyeParts||[])eye.scale.setScalar(sensorScale);
  setBodyAnatomy(a.mesh,anatomyView);
}


function destroyAgentMesh(a){
  removePhysicsRig(a);
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
  archiveAgent(a);
  deathEvents.push(worldAge);
  enrichSoilAt(a.mesh.position,.045);
  if(a.carrying)dropMaterial(a,true);
  const drops=Math.max(1,Math.min(6,Math.round(a.energy/11)+2));
  for(let k=0;k<drops;k++){
    const p=a.mesh.position.clone();p.x+=rand(-.7,.7);p.z+=rand(-.7,.7);makeFood(p,rand(3.8,7.8));
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
  ensureBrainTopology(b,inputs.length,b.bias2.length,.68,true);
  if(!b.weights1[0]||inputs.length!==b.weights1[0].length)throw new Error(`Dimensión neural incompatible: entradas ${inputs.length}, cerebro ${b.weights1[0]?.length??0}`);
  const maturity=.28+.72*(a.phenotype.devNeural??1);
  for(let j=0;j<nh;j++){
    let s=b.bias1[j];
    for(let i=0;i<inputs.length;i++)if(b.mask1[j][i])s+=b.weights1[j][i]*inputs[i];
    for(let k=0;k<nh;k++)if(b.maskR[j][k])s+=b.weightsR[j][k]*a.hidden[k];
    h[j]=tanh(s)*(b.nodeGain[j]||1)*maturity;
  }
  a.hidden=h;
  const out=new Array(b.bias2.length).fill(0);
  for(let j=0;j<out.length;j++){
    let s=b.bias2[j];
    for(let k=0;k<nh;k++)if(b.mask2[j][k])s+=a.learnedW2[j][k]*h[k];
    out[j]=tanh(s)*maturity;
  }
  return out;
}


function socialRecord(a,otherId){
  let r=a.socialLedger.get(otherId);
  if(!r){
    r={given:0,received:0,help:0,harm:0,attacks:0,trust:0,last:worldAge,
      foodGiven:0,foodReceived:0,materialGiven:0,materialReceived:0};
    a.socialLedger.set(otherId,r);
  }
  r.foodGiven=r.foodGiven||0;r.foodReceived=r.foodReceived||0;
  r.materialGiven=r.materialGiven||0;r.materialReceived=r.materialReceived||0;
  return r;
}
function kinshipScore(a,b){
  if(!a||!b)return 0;
  if(a.parentIds.includes(b.id)||b.parentIds.includes(a.id))return 1;
  const pa=new Set(a.parentIds),pb=new Set(b.parentIds);
  for(const x of pa)if(pb.has(x))return .72;
  return a.lineage===b.lineage?.18:0;
}

function socialBondScore(a,b){
  if(!a||!b)return 0;
  const m=a.socialMemory.get(b.id);
  const r=a.socialLedger.get(b.id);
  const affinity=m?.affinity||0,trust=m?.trust||0,threat=m?.threat||0;
  const meetings=clamp((m?.meetings||0)/8,0,1);
  const rep=reputationScore(a,b);
  const kin=kinshipScore(a,b);
  const exchange=r?clamp(Math.min(r.given||0,r.received||0)/5,0,1):0;
  return clamp(
    affinity*.34+trust*.27+meetings*.14+Math.max(0,rep)*.12+kin*.08+exchange*.10-threat*.30,
    -1,1
  );
}
function updateSocialFamiliarity(a,b,mem,dt,distance){
  if(!b||!mem)return;
  const proximity=clamp(1-distance/CONFIG.SOCIAL_BOND_RADIUS,0,1);
  if(proximity<=0)return;

  mem.meetings=(mem.meetings||0)+dt*(.16+.44*proximity);
  const t=a.genome.temperament;
  const rep=reputationScore(a,b),kin=kinshipScore(a,b);
  const safe=clamp(1-Math.max(0,mem.threat),0,1);
  const familiarity=clamp(mem.meetings/8,0,1);

  // Mere safe co-presence can create familiarity, but only very slowly.
  // Positive history, attachment and kinship make the effect stronger.
  const affinityGain=dt*proximity*safe*(.0012+.0018*Math.max(0,t.sociability)+.0020*t.attachment+
    .0015*Math.max(0,rep)+.0012*kin)*(.35+.65*familiarity);
  const trustGain=dt*proximity*safe*(.0007+.0014*Math.max(0,rep)+.0010*kin)*(.30+.70*familiarity);
  mem.affinity=clamp(mem.affinity+affinityGain,-1,1);
  mem.trust=clamp(mem.trust+trustGain,-1,1);

  // Safe repeated encounters slowly extinguish stale threat; actual attacks still dominate.
  if(mem.threat>0&&rep>=-.05)mem.threat=Math.max(0,mem.threat-dt*.0012*proximity);

  const bond=socialBondScore(a,b);
  if(bond>.16&&familiarity>.16){
    rememberSocialHub(a,b,clamp(.24+bond*.42,0,1));
  }
}
function decaySocialMemories(a,dt){
  for(const [id,m] of a.socialMemory){
    const age=worldAge-(m.lastSeen||worldAge);
    if(age<4)continue;
    const decay=CONFIG.SOCIAL_BOND_DECAY*dt*clamp(age/40,.25,2);
    if(m.affinity>0)m.affinity=Math.max(0,m.affinity-decay);
    else if(m.affinity<0)m.affinity=Math.min(0,m.affinity+decay*.45);
    if(m.trust>0)m.trust=Math.max(0,m.trust-decay*.72);
    if(m.threat>0)m.threat=Math.max(0,m.threat-decay*.30);
  }
}
function bondedPartnerCount(){
  const pairs=new Set();
  for(const a of agents){
    for(const [id] of a.socialMemory){
      const b=agents.find(x=>x.id===+id);
      if(!b)continue;
      const ab=socialBondScore(a,b),ba=socialBondScore(b,a);
      if(ab>.22&&ba>.22){
        const lo=Math.min(a.id,b.id),hi=Math.max(a.id,b.id);
        pairs.add(`${lo}:${hi}`);
      }
    }
  }
  return pairs.size;
}

function reputationScore(a,b){
  const r=a.socialLedger.get(b.id);
  return r?clamp((r.received-r.given)*.018+r.help*.03-r.harm*.04-r.attacks*.12+r.trust*.15,-1,1):0;
}
function mateCompatibility(a,b){
  if(!a||!b||a===b||!isFertile(a)||!isFertile(b))return -Infinity;
  const kin=kinshipScore(a,b),rep=(reputationScore(a,b)+1)/2;
  const health=(a.health+b.health)/(2*CONFIG.MAX_HEALTH),energy=(a.energy+b.energy)/(2*CONFIG.MAX_ENERGY);
  const novelty=clamp(Math.abs(a.hidden.length-b.hidden.length)/40+Math.abs(a.genome.body.size-b.genome.body.size)*.2,0,1);
  const bond=Math.max(0,(socialBondScore(a,b)+socialBondScore(b,a))*.5);
  const prior=Math.log1p((a.mateHistory.get(b.id)||0)+(b.mateHistory.get(a.id)||0))/Math.log(6);
  const c=a.genome.cognition;
  return health*.25+energy*.25+rep*.15+bond*.14+clamp(prior,0,1)*.05+
    novelty*.13*(c.noveltyMateBias||.4)-kin*.40*(c.kinBias||.5)+rand(-.025,.025);
}
function chooseMate(a,maxDist=2.4){
  let best=null,score=-Infinity;
  for(const b of agents){
    if(b===a||!isFertile(b))continue;
    const d=a.mesh.position.distanceTo(b.mesh.position);if(d>maxDist)continue;
    noteFertileEncounter(a,b);
    const s=mateCompatibility(a,b)-d*.035*(a.genome.cognition?.mateSelectivity||.5);
    if(s>score){score=s;best=b;}
  }
  return best;
}
function regionFor(pos){
  if(pos.x<-8&&pos.z<4)return 'stone-belt';
  if(pos.x>10&&pos.z<2)return 'mineral-east';
  if(pos.z>10)return 'biomass-north';
  if(pos.x<2&&pos.z<-12)return 'fiber-south';
  return 'mixed-core';
}

function rememberSocialHub(a,b,value=.55){
  if(!a||!b)return;
  const mid=a.mesh.position.clone().lerp(b.mesh.position,.5);
  storeSpatialMemory(a,'socialHub',mid,value);
  storeSpatialMemory(b,'socialHub',mid,value*.92);
}
function socialHubCount(){
  const cells=new Set();
  for(const a of agents){
    for(const m of a.spatialMemory){
      if(m.type==='socialHub'&&m.value>.18)cells.add(`${Math.round(m.x/3)},${Math.round(m.z/3)}`);
    }
  }
  return cells.size;
}
function reciprocalLinkCount(){
  const pairs=new Set();
  for(const a of agents){
    for(const [id,r] of a.socialLedger){
      if((r.given||0)>.35&&(r.received||0)>.35){
        const lo=Math.min(a.id,+id),hi=Math.max(a.id,+id);
        pairs.add(`${lo}:${hi}`);
      }
    }
  }
  return pairs.size;
}
function trackRegionalTransport(m,pos){
  if(!m)return;
  const now=regionFor(pos),prev=m.lastRegion||m.originRegion||now;
  if(now!==prev){
    m.regionalMoves=(m.regionalMoves||0)+1;
    totalRegionalTrade++;
    if(totalRegionalTrade===1){
      recordDiscovery('regional:first','🧭','Primer transporte regional','Un material manipulado cruzó de una región de recursos a otra.',pos);
    }
  }
  m.lastRegion=now;
}

function recordTransfer(giver,receiver,amount,type){
  const g=socialRecord(giver,receiver.id),r=socialRecord(receiver,giver.id);
  const wasReciprocal=(g.received||0)>0||(r.given||0)>0;
  g.given+=amount;g.help+=type==='food'?amount*.35:amount*.12;g.last=worldAge;g.trust+=.018;
  r.received+=amount;r.last=worldAge;r.trust+=.024;
  if(type==='food'){
    g.foodGiven+=amount;r.foodReceived+=amount;
  }else if(type==='material'){
    g.materialGiven+=amount;r.materialReceived+=amount;
  }
  const gm=memoryFor(giver,receiver),rm=memoryFor(receiver,giver);
  gm.affinity=clamp(gm.affinity+.018,-1,1);gm.trust=clamp(gm.trust+.026,-1,1);
  rm.affinity=clamp(rm.affinity+.028,-1,1);rm.trust=clamp(rm.trust+.035,-1,1);
  transferEvents.push({t:worldAge,giver:giver.id,receiver:receiver.id,amount,type});
  rememberSocialHub(giver,receiver,type==='food'?.72:.58);
  if(wasReciprocal)recordDiscovery('reciprocity:first','🤝','Primera reciprocidad','Un individuo devolvió recursos dentro de una relación previa.',giver.mesh.position);
  const complementary=(g.foodGiven>0&&g.materialReceived>0)||(g.materialGiven>0&&g.foodReceived>0)||
    (r.foodGiven>0&&r.materialReceived>0)||(r.materialGiven>0&&r.foodReceived>0);
  if(complementary){
    gm.trust=clamp(gm.trust+.018,-1,1);rm.trust=clamp(rm.trust+.018,-1,1);
    recordDiscovery('exchange:complementary:first','🔄','Primer intercambio complementario',
      'Una relación acumuló transferencias de tipos distintos en direcciones opuestas, sin moneda ni precio programado.',giver.mesh.position);
  }
  while(transferEvents.length&&worldAge-transferEvents[0].t>CONFIG.DEMO_WINDOW)transferEvents.shift();
}
function maybeTransferResources(a,p,dt){
  const b=p.n;if(!b||p.nd>1.45)return;
  const rec=a.socialLedger.get(b.id);
  const balance=rec?(rec.received-rec.given):0;
  const owed=clamp(balance/7,0,1);
  const debt=clamp(balance/16,-1,1);
  const reciprocity=a.genome.cognition?.reciprocityBias||.55;
  const generosity=a.genome.cognition?.generosity||.35;
  const kin=kinshipScore(a,b),bond=Math.max(0,socialBondScore(a,b));
  const willingness=generosity*.29+reciprocity*debt*.31+
    kin*(a.genome.cognition?.kinBias||.45)*.24+Math.max(0,reputationScore(a,b))*.20+bond*.24;

  // A return gift can be small. Reciprocity no longer requires an organism to be energy-rich;
  // it only avoids repayment during a severe deficit.
  const dependentNeed=(b.age<CONFIG.JUVENILE_END&&kin>.15&&b.energy<61);
  const bondedNeed=(bond>.24&&b.energy<54&&a.energy>b.energy+8);
  const needGift=(a.energy>64&&b.energy<57)||((dependentNeed||bondedNeed)&&a.energy>58);
  const returnGift=owed>.08&&a.energy>47&&a.energy>b.energy+1;
  const giftRate=(needGift?.030:0)+(returnGift?.115*reciprocity*(.35+.65*owed):0);

  if(giftRate>0&&Math.random()<1-Math.exp(-dt*giftRate*Math.max(.20,willingness+.25))){
    const desired=returnGift?1.4+2.8*owed:Math.max(1.8,60-b.energy);
    const reserve=returnGift?44:55;
    const amount=Math.min(returnGift?4.2:6.5,a.energy-reserve,desired);
    if(amount>.75){
      a.energy-=amount;
      b.energy=clamp(b.energy+amount*.92,0,CONFIG.MAX_ENERGY);
      recordTransfer(a,b,amount,'food');
    }
  }

  const materialReturn=owed>.10?1.25+1.15*owed:1;
  if(a.carrying&&!b.carrying&&Math.random()<1-Math.exp(-dt*.020*Math.max(.02,willingness)*materialReturn)){
    const m=a.carrying;
    dropMaterial(a,true);
    if(m&&!m.carriedBy&&m.mesh.position.distanceTo(b.mesh.position)<1.8){
      if(pickUpMaterial(b,m)){recordTransfer(a,b,1,'material');trackRegionalTransport(m,b.mesh.position);}
    }
  }
}
function recentTransferCount(){return transferEvents.length;}
function averageReciprocity(){
  let s=0,n=0;for(const a of agents)for(const r of a.socialLedger.values()){
    const t=r.given+r.received;if(t>0){s+=1-Math.abs(r.given-r.received)/t;n++;}
  }return n?s/n:0;
}
function socialGroupCount(){
  const seen=new Set();let groups=0;
  for(const a of agents){
    if(seen.has(a.id))continue;const q=[a];seen.add(a.id);let count=0;
    while(q.length){
      const x=q.shift();count++;
      for(const b of agents){
        if(seen.has(b.id))continue;
        const xb=x.socialMemory.get(b.id)?.affinity||0, bx=b.socialMemory.get(x.id)?.affinity||0;
        const mutualBond=Math.min(socialBondScore(x,b),socialBondScore(b,x));
        const linked=kinshipScore(x,b)>.15||mutualBond>.12||(xb>.14&&bx>.08);
        if(x.mesh.position.distanceTo(b.mesh.position)<5.2&&linked){seen.add(b.id);q.push(b);}
      }
    }
    if(count>=3)groups++;
  }return groups;
}
function seasonPhase(){
  const x=(worldAge%(SEASON_LENGTH*4))/SEASON_LENGTH,idx=Math.floor(x)%4;
  return {idx,name:['primavera','verano','otoño','invierno'][idx]};
}

function rainIntensity(){
  const s=seasonPhase().idx;
  const seasonal=[.82,.34,.64,.18][s];
  const slow=.5+.5*Math.sin(worldAge*.115+1.7);
  const fast=.5+.5*Math.sin(worldAge*.287+4.2);
  const pulse=clamp((slow*.72+fast*.28-.43)/.57,0,1);
  return clamp(seasonal*pulse,0,1);
}
function rainLabel(){
  const r=rainIntensity();
  if(r>.65)return 'fuerte';
  if(r>.28)return 'ligera';
  return 'seca';
}

function seasonProductivity(){return [1.18,1.00,.86,.68][seasonPhase().idx];}
function seasonTemperatureOffset(){return [2,8,-2,-10][seasonPhase().idx];}
function chooseRegionalMaterialType(pos){
  const r=regionFor(pos),w={
    'stone-belt':{stone:3.2,mineral:1,fiber:.45,biomass:.55},
    'mineral-east':{stone:1.1,mineral:3,fiber:.55,biomass:.45},
    'biomass-north':{stone:.55,mineral:.5,fiber:1.2,biomass:3},
    'fiber-south':{stone:.5,mineral:.45,fiber:3.1,biomass:1},
    'mixed-core':{stone:1,mineral:1,fiber:1,biomass:1}
  }[r];
  let total=0;for(const v of Object.values(w))total+=v;let x=Math.random()*total;
  for(const [k,v] of Object.entries(w)){x-=v;if(x<=0)return k;}return 'stone';
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
    const persistent=(m.type==='socialHub'||m.type==='activitySite');
    const score=m.value-age*(persistent?.00034:.0008)+
      (m.type==='socialHub'?.06:m.type==='activitySite'?.045:0);
    if(score>bestScore){bestScore=score;best=m;}
  }
  return best;
}

function bestMemoryOfType(a,type){
  let best=null,bestScore=-Infinity;
  for(const m of a.spatialMemory){
    if(m.type!==type||m.value<=0)continue;
    const age=worldAge-m.last;
    const d=Math.hypot(m.x-a.mesh.position.x,m.z-a.mesh.position.z);
    const score=m.value-age*.00055-d*.0025;
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
  // Exploration is systematic: scan a stable set of directions and choose the
  // least-visited reachable area. The phase changes slowly, not every decision.
  let best=null,bestScore=-Infinity;
  const golden=Math.PI*(3-Math.sqrt(5));
  const epoch=Math.floor(worldAge/55);
  const phase=((a.id*golden)+(epoch*.37))%(Math.PI*2);
  const distances=[4.8,7.4,10.2];

  for(let i=0;i<15;i++){
    const angle=phase+i*golden;
    const dist=distances[i%distances.length];
    const p=new THREE.Vector3(
      a.mesh.position.x+Math.cos(angle)*dist,
      0,
      a.mesh.position.z+Math.sin(angle)*dist
    );
    const r=Math.hypot(p.x,p.z);
    if(r>CONFIG.WORLD-1.2)p.multiplyScalar((CONFIG.WORLD-1.2)/r);

    const novelty=noveltyAt(a,p);
    let delta=angle-a.heading;
    while(delta>Math.PI)delta-=Math.PI*2;
    while(delta<-Math.PI)delta+=Math.PI*2;
    const continuity=.055*Math.cos(delta);
    const score=novelty+continuity;

    if(score>bestScore){bestScore=score;best=p;}
  }
  return [best,Math.max(0,bestScore)];
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

function predictiveFeatures(a,p){
  const ns=a.nervous.current;
  return [a.energy/CONFIG.MAX_ENERGY,a.health/CONFIG.MAX_HEALTH,p.fVisible?clamp(1-p.fd/p.sense,0,1):0,p.nVisible?clamp(1-p.nd/p.sense,0,1):0,p.mVisible?clamp(1-p.md/(CONFIG.MATERIAL_SENSE*a.genome.body.sensor),0,1):0,clamp(sumArray(ns.touch)/4,0,1),clamp(sumArray(ns.pain)/4,0,1),ns.proprio,ns.intero,clamp(a.motor?.efficiency||0,0,1)];
}
function predictionNovelty(a,context,mode){
  const rec=a.predictive?.model?.get(modelKey(context,mode));if(!rec)return .52;
  return clamp((rec.error||0)/(1+Math.sqrt(rec.n||1)*.10),0,1);
}
function updatePredictiveWorldModel(a,p){
  if(!a.predictive)a.predictive={model:new Map(),lastError:0,intrinsic:0,totalUpdates:0};
  const ctx=a.decision.context;if(!ctx)return 0;
  const key=modelKey(ctx,a.decision.mode),features=predictiveFeatures(a,p),learning=a.genome.cognition?.modelLearning||.18;
  let rec=a.predictive.model.get(key);
  if(!rec){rec={mean:features.slice(),n:1,error:.75};a.predictive.model.set(key,rec);a.predictive.lastError=.75;a.predictive.intrinsic=.018*(a.genome.cognition?.predictiveDrive||.6);return a.predictive.intrinsic;}
  let err=0;for(let i=0;i<features.length;i++)err+=Math.abs(features[i]-(rec.mean[i]??features[i]));err/=features.length;
  rec.n++;const alpha=clamp(learning/Math.sqrt(rec.n*.20),.025,.42);
  for(let i=0;i<features.length;i++)rec.mean[i]=(rec.mean[i]??features[i])+alpha*(features[i]-rec.mean[i]);
  rec.error=rec.error*.82+err*.18;a.predictive.model.set(key,rec);
  const novelty=clamp(rec.error/(1+Math.sqrt(rec.n)*.08),0,1),curiosity=a.genome.cognition?.predictiveDrive||.6;
  const intrinsic=clamp(novelty*curiosity*(.018+.032*a.affect.curiosity),0,.055);
  a.predictive.lastError=rec.error;a.predictive.intrinsic=intrinsic;a.predictive.totalUpdates++;return intrinsic;
}
function averagePredictionError(){return agents.length?agents.reduce((s,a)=>s+(a.predictive?.lastError||0),0)/agents.length:0;}



function markPatternFrom(a){
  const orient=(Math.round((((a.heading%(Math.PI*2))+Math.PI*2)%(Math.PI*2))/(Math.PI*2)*8))%8;
  const tool=a.carrying?.props,hardness=tool?Math.floor(clamp((tool.hardness||0)*3,0,3)):0;
  const signal=signalTokenFrom(a)||'p0r0c6',sm=/c(\d+)/.exec(signal);
  return `g${orient}h${hardness}c${sm?sm[1]:6}`;
}
function createMarkMesh(pattern,pos,angle=0,strength=1){
  const group=new THREE.Group(),parts=/g(\d+)h(\d+)c(\d+)/.exec(pattern||'')||['',0,0,0];
  const g=+parts[1],h=+parts[2],c=+parts[3],count=1+(c%3);
  for(let i=0;i<count;i++){
    const bar=new THREE.Mesh(new THREE.BoxGeometry(.68+.10*h,.028,.07),new THREE.MeshStandardMaterial({color:0x8b6a3f,emissive:0x1e1208,emissiveIntensity:.18,roughness:1}));
    bar.rotation.y=(g/8)*Math.PI*2+i*.55;bar.position.set((i-count/2)*.06,.015,(i%2)*.06);group.add(bar);
  }
  group.position.copy(pos);group.position.y=terrainHeightAt(pos)+.025;group.rotation.y=angle;group.scale.setScalar(.72+.28*strength);markGroup.add(group);return group;
}

function markCulturalScore(m){
  const age=Math.max(0,worldAge-(m.createdAt||worldAge));
  const recency=Math.exp(-Math.max(0,worldAge-(m.lastUsed||m.createdAt||worldAge))/220);
  return (m.reads||0)*1.8+(m.uses||0)*.45+(m.strength||0)*.35+recency*.55-age*.0007;
}
function removeWorldMarkAt(index){
  const m=worldMarks[index];if(!m)return;
  markGroup.remove(m.group);
  m.group?.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});
  worldMarks.splice(index,1);
}
function makeRoomForMark(){
  if(worldMarks.length<260)return true;
  let worst=-1,worstScore=Infinity;
  for(let i=0;i<worldMarks.length;i++){
    const s=markCulturalScore(worldMarks[i]);
    if(s<worstScore){worstScore=s;worst=i;}
  }
  if(worst>=0){removeWorldMarkAt(worst);return true;}
  return false;
}

function makeWorldMark(a,pattern=null,posOverride=null){
  if(worldMarks.length>=260&&!makeRoomForMark())return null;
  const p=posOverride?posOverride.clone():a.mesh.position.clone();
  if(!posOverride){p.x+=Math.sin(a.heading)*.48;p.z+=Math.cos(a.heading)*.48;}
  p.y=terrainHeightAt(p);
  const chosen=pattern||markPatternFrom(a);
  const nearby=worldMarks.find(m=>m.pos.distanceToSquared(p)<.18*.18&&m.pattern===chosen);
  if(nearby){nearby.strength=clamp(nearby.strength+.12,0,1.6);nearby.uses++;nearby.lastUsed=worldAge;nearby.group.scale.setScalar(.72+.28*nearby.strength);return nearby;}
  const m={id:nextMarkId++,pattern:chosen,pos:p.clone(),angle:a.heading,creatorId:a.id,createdAt:worldAge,strength:.72,uses:1,reads:0,lastUsed:worldAge};
  m.group=createMarkMesh(m.pattern,m.pos,m.angle,m.strength);worldMarks.push(m);
  recordDiscovery('mark:first','✎','Primera marca persistente',`Patrón ${m.pattern} dejado sobre el terreno.`,m.pos);
  return m;
}

function maybeLeaveSurfaceTrace(a,p,manipIntent,dt,speed){
  if(!a.carrying){a.surfaceWork=Math.max(0,(a.surfaceWork||0)-dt*.18);return;}
  const tool=a.carrying.props;
  const ability=(tool.hardness||0)*.42+(tool.edge||tool.edgePotential||0)*.58;
  if(ability<.14){a.surfaceWork=Math.max(0,(a.surfaceWork||0)-dt*.10);return;}

  const movement=clamp(speed/Math.max(.35,a.genome.body.speed||1),0,1.6);
  const pressure=clamp((a.motor?.effort||0)*.48+Math.abs(manipIntent)*.52,0,1.6);
  const contactWork=ability*(.10+.55*movement+.70*pressure)*dt;

  // Real repeated scraping accumulates work. A mark is the physical threshold outcome,
  // not a random symbolic action.
  if(movement>.06||Math.abs(manipIntent)>.18)a.surfaceWork=(a.surfaceWork||0)+contactWork;
  else a.surfaceWork=Math.max(0,(a.surfaceWork||0)-dt*.08);

  const threshold=.22+(.20/(.35+ability));
  if(a.surfaceWork>=threshold&&a.markCooldown<=0){
    const scene=sceneCode(a,p),known=a.externalMemory.production.get(scene);
    const mark=makeWorldMark(a,known?.q>.02?known.pattern:null);
    if(mark){
      a.externalMemory.lastProduced=mark.pattern;a.externalMemory.lastScene=scene;
      a.surfaceWork*=.18;
      a.markCooldown=rand(1.8,4.8);
    }
  }
}
function nearestWorldMark(a){
  let best=null,bd=1e9;for(const m of worldMarks){const d=a.mesh.position.distanceToSquared(m.pos);if(d<bd){bd=d;best=m;}}
  return best?[best,Math.sqrt(bd)]:[null,999];
}
function markRecord(a,pattern){
  let rec=a.externalMemory.lexicon.get(pattern);
  if(!rec){rec={n:0,confidence:0,contexts:{},modeQ:Array(MODE_COUNT).fill(0),success:0};a.externalMemory.lexicon.set(pattern,rec);}return rec;
}
function observeExternalMark(a,p,dt){
  if(!p.markVisible||!p.mark)return;
  const rec=markRecord(a,p.mark.pattern),scene=sceneCode(a,p);rec.n+=dt;rec.contexts[scene]=(rec.contexts[scene]||0)+dt;
  let total=0,best=0;for(const v of Object.values(rec.contexts)){total+=v;if(v>best)best=v;}rec.confidence=total?best/total:0;
  a.externalMemory.lastSeen=p.mark.pattern;a.externalMemory.lastSeenAt=worldAge;p.mark.reads+=dt;p.mark.lastUsed=worldAge;totalExternalReads+=dt;
  if(p.mark.creatorId!==a.id&&p.mark.reads>=.20)recordDiscovery('mark:read:first','👁️','Marca interpretada por otro individuo',`Un organismo distinto del creador observó el patrón ${p.mark.pattern}.`,p.mark.pos);
  if(a.externalMemory.lexicon.size>50){const ranked=[...a.externalMemory.lexicon.entries()].sort((x,y)=>(y[1].success+y[1].confidence*y[1].n)-(x[1].success+x[1].confidence*x[1].n));a.externalMemory.lexicon=new Map(ranked.slice(0,42));}
}
function externalMarkBias(a,p,mode){
  if(!p.markVisible||!p.mark)return 0;const rec=a.externalMemory.lexicon.get(p.mark.pattern);if(!rec)return 0;
  return (rec.modeQ?.[mode]||0)*clamp(rec.confidence+.1,0,1)*(a.genome.cognition?.symbolLearning||.65);
}
function reinforceExternalMemory(a,reward){
  if(a.externalMemory.lastSeen&&worldAge-a.externalMemory.lastSeenAt<4){
    const rec=markRecord(a,a.externalMemory.lastSeen),mode=a.decision.mode;rec.modeQ[mode]+=clamp(.065*(reward-rec.modeQ[mode]),-.06,.06);if(reward>.05)rec.success++;
  }
  if(a.externalMemory.lastProduced&&a.externalMemory.lastScene){
    let pr=a.externalMemory.production.get(a.externalMemory.lastScene);
    if(!pr||pr.pattern!==a.externalMemory.lastProduced){if(reward>.03)a.externalMemory.production.set(a.externalMemory.lastScene,{pattern:a.externalMemory.lastProduced,q:reward*.20,n:.2});}
    else{pr.n+=1;pr.q+=clamp((reward-pr.q)*.06,-.05,.05);}
  }
}
function sharedExternalSymbols(){
  const users=new Map();for(const a of agents)for(const [pat,r] of a.externalMemory.lexicon)if(r.n>1&&r.confidence>.22)users.set(pat,(users.get(pat)||0)+1);
  return [...users.values()].filter(v=>v>=2).length;
}
function updateWorldMarks(dt){
  const rain=rainIntensity();
  for(let i=worldMarks.length-1;i>=0;i--){
    const m=worldMarks[i];
    const age=worldAge-m.createdAt;
    const idle=worldAge-m.lastUsed;
    const cultural=markCulturalScore(m);

    // Environmental erosion competes with cultural reinforcement.
    const reinforcement=1+Math.min(4,m.reads||0)*.22+Math.min(5,m.uses||0)*.12;
    m.strength=Math.max(0,(m.strength||0)-dt*(.00045+rain*.0011)/reinforcement);
    if(m.group)m.group.scale.setScalar(.72+.28*clamp(m.strength,0,1.6));

    const disposable=(m.reads||0)<.12&&(m.uses||0)<=1&&age>55&&idle>42;
    const stale=cultural<.62&&age>145&&idle>82;
    const ancient=age>1200&&idle>280;
    const eroded=m.strength<.16;

    if(disposable||stale||ancient||eroded)removeWorldMarkAt(i);
  }

  // Surface capacity is not a museum. If marks accumulate faster than erosion,
  // remove the least culturally reinforced traces first.
  if(worldMarks.length>220){
    const excess=Math.min(6,worldMarks.length-210);
    const ranked=worldMarks.map((m,i)=>({i,score:markCulturalScore(m)}))
      .sort((a,b)=>a.score-b.score).slice(0,excess)
      .map(x=>x.i).sort((a,b)=>b-a);
    for(const i of ranked)removeWorldMarkAt(i);
  }
}
function signalTokenFrom(a){
  if(!a)return null;
  const pitchBin=clamp(Math.floor((a.sound.freq-90)/(1500-90)*8),0,7);
  const pulseBin=clamp(Math.floor((a.sound.pulse||0)*3),0,2);
  const sig=a.signal||[0,0,0];
  let best=0,mag=0;
  for(let i=0;i<3;i++)if(Math.abs(sig[i])>mag){mag=Math.abs(sig[i]);best=i;}
  const channel=mag<.14?6:(best*2+(sig[best]>=0?1:0));
  return `p${pitchBin}r${pulseBin}c${channel}`;
}
function tokenAcoustics(token){
  const m=/p(\d+)r(\d+)c(\d+)/.exec(token||'');
  if(!m)return null;
  return {freq:90+(+m[1]+.5)/8*(1500-90),pulse:(+m[2]+.5)/3,channel:+m[3]};
}
function sceneCode(a,p){
  const hunger=a.energy<42?'h':'s';
  const food=p.fVisible&&p.fd<p.sense*.55?'f':'x';
  const social=p.nVisible?(p.mem?.threat>.30?'t':p.mem?.affinity>.30?'a':'n'):'z';
  const material=p.mVisible&&p.md<CONFIG.MATERIAL_SENSE*a.genome.body.sensor*.65?'m':'x';
  const structure=p.sVisible&&p.sd<p.sense*.55?'b':'x';
  const body=sumArray(a.nervous.current.pain)>.8?'p':'o';
  const effort=Math.abs(a.currentManipIntent||0)>.34?'e':'q';
  const shared=p.nVisible&&p.n&&a.currentWorkTargetId!=null&&
    p.n.currentWorkTargetId===a.currentWorkTargetId&&p.n.currentWorkTargetKind===a.currentWorkTargetKind?'j':'i';
  return `${hunger}${food}${social}${material}${structure}${body}${effort}${shared}`;
}
function languageRecord(a,token){
  if(!token)return null;
  let rec=a.language.lexicon.get(token);
  if(!rec){
    rec={n:0,reward:0,confidence:0,contexts:{},modeQ:Array(MODE_COUNT).fill(0),success:0};
    a.language.lexicon.set(token,rec);
  }
  return rec;
}
function pruneLanguage(a){
  if(a.language.lexicon.size>52){
    const ranked=[...a.language.lexicon.entries()].sort((x,y)=>(y[1].n*(.25+y[1].confidence)+y[1].success)-(x[1].n*(.25+x[1].confidence)+x[1].success));
    a.language.lexicon=new Map(ranked.slice(0,44));
  }
  if(a.language.production.size>32){
    const ranked=[...a.language.production.entries()].sort((x,y)=>(y[1].q+y[1].n*.01)-(x[1].q+x[1].n*.01));
    a.language.production=new Map(ranked.slice(0,28));
  }
}
function observeLanguage(a,p,dt){
  if(!p.nVisible||!p.heardToken)return;
  const rec=languageRecord(a,p.heardToken),scene=sceneCode(a,p);
  rec.n+=dt;rec.contexts[scene]=(rec.contexts[scene]||0)+dt;
  let total=0,best=0;for(const v of Object.values(rec.contexts)){total+=v;if(v>best)best=v;}
  rec.confidence=total>0?best/total:0;
  a.language.heardToken=p.heardToken;a.language.heardAt=worldAge;a.language.heardCount+=dt;
  const n=p.n;
  if(n&&n.lastReward>.035&&Math.random()<dt*.055*(a.genome.cognition?.teachingBias||.4)*(a.genome.cognition?.cultureBias||.5)){
    const own=a.language.production.get(scene),q=n.lastReward*.35;
    if(!own||q>own.q)a.language.production.set(scene,{token:p.heardToken,q,n:.25});
    else if(own.token===p.heardToken){own.n+=.08;own.q+=.025*(q-own.q);}
  }
  pruneLanguage(a);
}
function languageBias(a,token,mode){
  if(!token)return 0;
  const rec=a.language.lexicon.get(token);if(!rec)return 0;
  const reliability=clamp(rec.confidence*.55+Math.log1p(rec.n)*.12,0,1);
  return (rec.modeQ?.[mode]||0)*(a.genome.cognition?.symbolLearning||.65)*reliability;
}
function reinforceLanguage(a,reward,p){
  const learn=a.genome.cognition?.symbolLearning||.65;
  if(a.language.heardToken&&worldAge-a.language.heardAt<3){
    const rec=languageRecord(a,a.language.heardToken),mode=a.decision.mode;
    rec.modeQ[mode]+=clamp(.075*learn*(reward-rec.modeQ[mode]),-.08,.08);
    rec.reward+=.04*(reward-rec.reward);
    if(reward>.045){rec.success++;a.language.successfulExchanges++;}
  }
  if(a.language.lastProduced&&a.language.lastScene){
    const scene=a.language.lastScene,token=a.language.lastProduced;
    let pr=a.language.production.get(scene);
    if(!pr||(pr.token!==token&&reward>pr.q+.04)){pr={token,q:reward*.25,n:.2};a.language.production.set(scene,pr);}
    else if(pr.token===token){pr.n+=1;const alpha=clamp(.16/Math.sqrt(pr.n),.025,.16);pr.q+=alpha*(reward-pr.q);}
    else pr.q*=.998;
  }
  let total=0,count=0;
  for(const rec of a.language.lexicon.values())if(rec.n>.5){total+=rec.confidence*clamp(Math.log1p(rec.n)/2,0,1);count++;}
  a.language.comprehension=count?total/count:0;
  pruneLanguage(a);
}
function shapeVocalization(a,p){
  const scene=sceneCode(a,p),pr=a.language.production.get(scene);
  if(pr&&pr.n>.35&&pr.q>-.02){
    const ac=tokenAcoustics(pr.token);
    if(ac){
      const bias=clamp((a.genome.cognition?.conventionBias||.55)*(.20+Math.max(0,pr.q))*(.45+a.genome.body.vocalPrecision*.35),0,.82);
      a.sound.freq=a.sound.freq*(1-bias)+ac.freq*bias;
      a.sound.pulse=a.sound.pulse*(1-bias)+ac.pulse*bias;
    }
  }
  a.language.lastScene=scene;a.language.lastProduced=signalTokenFrom(a);a.language.producedCount++;
}
function exportLanguageSeed(parent){
  if(!parent?.language)return [];
  return [...parent.language.lexicon.entries()].filter(([,r])=>r.n>.6)
    .sort((x,y)=>(y[1].success+y[1].confidence*y[1].n)-(x[1].success+x[1].confidence*x[1].n))
    .slice(0,5)
    .map(([token,r])=>[token,{n:Math.min(1.2,r.n*.12),reward:r.reward*.12,confidence:r.confidence*.45,contexts:{},modeQ:r.modeQ.map(v=>v*.12),success:0}]);
}
function importLanguageSeed(child,seed,strength=1){
  if(!child?.language||!Array.isArray(seed))return;
  for(const [token,r] of seed)child.language.lexicon.set(token,{n:(r.n||.1)*strength,reward:(r.reward||0)*strength,confidence:(r.confidence||0)*strength,contexts:{},modeQ:(r.modeQ||Array(MODE_COUNT).fill(0)).map(v=>v*strength),success:0});
}
function languagePopulationMetrics(){
  const tokenUsers=new Map(),signatureUsers=new Map();let score=0,nAgents=0;
  for(const a of agents){
    score+=a.language?.comprehension||0;nAgents++;
    const top=[...(a.language?.lexicon||new Map()).entries()]
      .filter(([,r])=>r.n>1.2&&r.confidence>.26)
      .sort((x,y)=>(y[1].confidence*y[1].n)-(x[1].confidence*x[1].n))
      .slice(0,4).map(([t])=>t);

    for(const tok of top)tokenUsers.set(tok,(tokenUsers.get(tok)||0)+1);
    if(top.length>=2){
      const signature=top.slice().sort().join('|');
      const row=signatureUsers.get(signature)||{count:0,positions:[]};
      row.count++;row.positions.push(a.mesh.position);signatureUsers.set(signature,row);
    }
  }

  let dialects=0;
  for(const row of signatureUsers.values()){
    if(row.count<3)continue;
    // A dialect should be shared by several organisms that actually occupy the same broad social area.
    let locallyShared=false;
    for(let i=0;i<row.positions.length&&!locallyShared;i++){
      let nearby=1;
      for(let j=0;j<row.positions.length;j++){
        if(i!==j&&row.positions[i].distanceTo(row.positions[j])<10)nearby++;
      }
      if(nearby>=3)locallyShared=true;
    }
    if(locallyShared)dialects++;
  }

  return {
    shared:[...tokenUsers.values()].filter(n=>n>=2).length,
    dialects,
    score:nAgents?score/nAgents:0
  };
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
    const info=predictionNovelty(a,ctx,mode)*(a.genome.cognition?.predictiveDrive||.6);
    total+=discount*(direct + observed*.30 + seq*.22 + info*.055);
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


function recordMotorCulture(a,out,dt){
  a.motorCulture.sampleTimer-=dt;if(a.motorCulture.sampleTimer>0)return;a.motorCulture.sampleTimer=.16;
  const vec=Array.from({length:12},(_,i)=>clamp(out[18+i]??0,-1,1));a.motorCulture.history.push({mode:a.decision.mode,vec,reward:a.lastReward,t:worldAge});
  if(a.motorCulture.history.length>20)a.motorCulture.history.shift();
}
function motorTechniqueKey(mode){return `m${mode}`;}
function imitateMotorTechnique(a,n,dt){
  if(!n?.motorCulture?.history?.length||n.lastReward<.045)return;
  const imitation=a.genome.cognition?.imitation||.5,culture=a.genome.cognition?.cultureBias||.5;
  if(Math.random()>1-Math.exp(-dt*.055*imitation*culture))return;
  const recent=n.motorCulture.history.filter(x=>worldAge-x.t<3.5);if(recent.length<2)return;
  const mode=n.decision.mode,key=motorTechniqueKey(mode),avg=Array(12).fill(0);for(const frame of recent)for(let i=0;i<12;i++)avg[i]+=frame.vec[i]/recent.length;
  const cur=a.motorCulture.library.get(key),quality=clamp(n.lastReward*.45+n.motor.efficiency*.18,0,.7);
  if(!cur||quality>cur.q){a.motorCulture.library.set(key,{vec:avg,q:quality,n:.25,source:n.id});a.motorCulture.copied++;totalMotorImitations++;recordDiscovery('motor:imitation:first','🧠','Primera técnica motora imitada',`El individuo ${a.id} copió una coordinación observada del individuo ${n.id}.`,a.mesh.position);}
  else{cur.n+=.12;for(let i=0;i<12;i++)cur.vec[i]+=clamp((avg[i]-cur.vec[i])*.035*imitation,-.05,.05);cur.q+=clamp((quality-cur.q)*.035,-.025,.025);}
}
function applyMotorTechnique(a,out){
  const key=motorTechniqueKey(a.decision.mode),tech=a.motorCulture.library.get(key);a.motorCulture.activeKey=null;if(!tech||tech.q<=0)return;
  const blend=clamp(tech.q*(a.genome.cognition?.cultureBias||.5)*.34,0,.32);for(let i=0;i<12;i++)out[18+i]=clamp((out[18+i]??0)*(1-blend)+tech.vec[i]*blend,-1,1);a.motorCulture.activeKey=key;
}
function reinforceMotorTechnique(a,reward){
  const key=a.motorCulture.activeKey;if(!key)return;const tech=a.motorCulture.library.get(key);if(!tech)return;tech.n+=1;const alpha=clamp(.09/Math.sqrt(tech.n),.018,.09);tech.q+=alpha*(reward-tech.q);if(tech.q<-.18)a.motorCulture.library.delete(key);
}
function exportMotorCulture(a){
  return [...a.motorCulture.library.entries()].filter(([,r])=>r.q>.02).sort((x,y)=>y[1].q-x[1].q).slice(0,3).map(([k,r])=>[k,{vec:r.vec.slice(),q:r.q*.12,n:.1,source:a.id}]);
}
function importMotorCulture(a,seed,strength=.8){for(const [k,r] of seed||[])a.motorCulture.library.set(k,{vec:r.vec.slice(),q:r.q*strength,n:(r.n||.1)*strength,source:r.source});}
function motorTechniqueCount(){return agents.reduce((s,a)=>s+(a.motorCulture?.library?.size||0),0);}

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
  imitateMotorTechnique(a,n,dt*parentBoost);

  const demonstrated=n.carrying||((worldAge-(n.lastManipulatedAt||-999)<2.5)?n.lastManipulatedMaterial:null);
  if(demonstrated&&a.mesh.position.distanceTo(n.mesh.position)<5.5){
    observeTechnicalTrace(a,demonstrated,dt,parentBoost*1.35);
  }

  // Strong positive observations can seed a weak cultural sequence.
  if(n.lastReward>.05&&a.language&&n.language){
    const token=signalTokenFrom(n);
    if(token&&Math.random()<dt*.045*imitation*(a.genome.cognition?.teachingBias||.4)){
      const pseudo={fVisible:false,nVisible:true,mVisible:false,sVisible:false,mem:memoryFor(a,n)};
      const scene=sceneCode(a,pseudo),cur=a.language.production.get(scene);
      if(!cur||n.lastReward*.25>cur.q)a.language.production.set(scene,{token,q:n.lastReward*.18,n:.15});
    }
  }

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
  let rate=a.genome.temperament.plasticity;if(rate<=0)return;
  if(a.age<CONFIG.JUVENILE_END){
    const youth=1-a.age/CONFIG.JUVENILE_END;
    rate*=1.35+youth*.85;
  }
  const r=clamp(reward,-1,1);
  for(let j=0;j<a.learnedW2.length;j++){
    for(let k=0;k<a.hidden.length;k++){
      if(a.genome.brain.mask2?.[j]?.[k])a.learnedW2[j][k]=clamp(a.learnedW2[j][k]+rate*r*a.hidden[k]*.12,-3,3);
    }
  }
}


function basalInstinctBias(a,per,mode){
  const hunger=clamp(1-a.energy/CONFIG.MAX_ENERGY,0,1);
  const injury=clamp(1-a.health/CONFIG.MAX_HEALTH,0,1);
  const threat=per.mem?.threat||0;
  let b=0;

  // Homeostasis is a low-level pressure, not a semantic plan.
  // At severe deficit it must be strong enough to compete with learned curiosity and culture.
  if(mode===1 && per.fVisible){
    const salience=clamp(1-per.fd/per.sense,0,1);
    b += (Math.pow(hunger,1.45)*1.85 + Math.max(0,hunger-.48)*1.55)*(.35+.65*salience);
  }
  if(mode===7)b += injury*.48 + a.affect.fear*.44 + Math.max(0,threat)*.42;
  if(mode===0 && hunger<.25 && injury<.2)b+=.05;
  if(mode===6 && hunger<.46)b+=a.genome.temperament.exploration*.04;

  if(hunger>.55){
    if(mode===6)b-=Math.min(.60,(hunger-.55)*1.65);
    if(mode===3||mode===4)b-=Math.min(.32,(hunger-.55)*.82);
    if(mode===2)b-=Math.min(.20,(hunger-.60)*.55);
  }
  return b;
}


function effectiveMaterialMass(m){
  if(!m)return 0;
  return Math.max(.01,(m.props?.mass||0)+(m.waterAmount||0)*.85);
}
function technicalSense(a,p){
  const held=a.carrying,target=p.mVisible?p.m:null;
  const capacity=containerCapacity(held);
  const fill=capacity>0?clamp((held?.waterAmount||0)/capacity,0,1):0;
  const resistance=target?clamp(effectiveMaterialMass(target)/(1+(target.props.rotationEfficiency||0)*1.5)/2.2,0,1):0;
  return {
    capacity:clamp(capacity/1.2,0,1),
    fill,
    carriedMass:clamp(effectiveMaterialMass(held)/2.5,0,1),
    carriedTemp:clamp(((held?.temperature||22)-15)/250,0,1),
    carriedWet:held?.wetness||0,
    targetTemp:clamp(((target?.temperature||22)-15)/250,0,1),
    targetSoft:target?.softness||0,
    targetRound:target?.props?.roundness||0,
    resistance,
    inWater:canReachWater(a)?1:0
  };
}
function technicalStateCode(a,p){
  const s=technicalSense(a,p);
  return `p${s.inWater>0?'1':'0'}c${s.capacity>.05?'1':'0'}w${s.fill>.12?'1':'0'}h${s.carriedTemp>.28?'1':'0'}t${s.targetTemp>.32?'1':'0'}s${s.targetSoft>.14?'1':'0'}r${s.targetRound>.32?'1':'0'}d${s.resistance>.45?'1':'0'}`;
}
function updateTechnicalSense(a,p,dt){
  const cur=technicalSense(a,p),vals=Object.values(cur);
  const last=a.techSense.last;
  if(last){
    let delta=0;
    for(let i=0;i<vals.length;i++)delta+=Math.abs(vals[i]-(last[i]||0));
    const surprise=clamp(delta/3,0,1);
    a.techSense.surprise=a.techSense.surprise*.88+surprise*.12;
    if(surprise>.08){
      a.techSense.changes++;
      a.rewardBuffer+=Math.min(.010,surprise*.009)*(a.genome.temperament.curiosity||.5);
    }
  }
  a.techSense.current=cur;a.techSense.last=vals;
}
function transitionKey(t){return `${t.s}@${t.a}->${t.o}`;}
function normalizeProcedureRecord(r){
  if(!r)return null;
  let steps=[];
  if(Array.isArray(r.steps))steps=r.steps.map(x=>({s:x.s||'legacy',a:+x.a||0,o:x.o||x.s||'legacy'}));
  else if(Array.isArray(r.seq))steps=r.seq.map(x=>typeof x==='number'?{s:'legacy',a:x,o:'legacy'}:{s:x.s||'legacy',a:+(x.a??x.mode??0),o:x.o||x.s||'legacy'});
  return {
    ...r,steps,
    q:Number.isFinite(r.q)?r.q:0,n:Number.isFinite(r.n)?r.n:0,
    physicalChange:r.physicalChange||0,beneficialChanges:r.beneficialChanges||0,
    successes:r.successes||0,failures:r.failures||0,
    transmissions:r.transmissions||0,bornAt:r.bornAt??worldAge,lastUsed:r.lastUsed??worldAge
  };
}
function procedureKey(steps){return steps.map(transitionKey).join('>');}
function procedureSuccessRate(raw){
  const r=normalizeProcedureRecord(raw),s=r.successes||0,f=r.failures||0;
  return (s+1)/(s+f+2);
}
function procedureCulturalScore(raw){
  const r=normalizeProcedureRecord(raw);if(!r?.steps?.length)return 0;
  const confidence=clamp(r.n/(r.n+4),0,1);
  const success=procedureSuccessRate(r);
  const usefulChange=clamp((r.beneficialChanges||0)/3,0,1);
  const recency=Math.exp(-Math.max(0,worldAge-(r.lastUsed||worldAge))/520);
  return Math.max(0,r.q)*confidence*(.40+.60*success)+usefulChange*.060+Math.log1p(r.transmissions||0)*.0045+recency*.003;
}

function actionTraceFromAgent(a,quality=.18){
  const hist=a?.procedureMemory?.history||[];
  if(hist.length<3)return null;
  const steps=hist.slice(-3).map(x=>({...x}));
  const key=procedureKey(steps);
  return {
    key,steps,
    q:clamp(Math.max(.008,a.lastReward||0,quality*.08),.008,.22),
    strength:clamp(quality,.04,1.4),
    repetitions:1,
    makerId:a.id,
    makerGeneration:a.generation,
    createdAt:worldAge,
    lastReinforced:worldAge,
    observations:0
  };
}
function stampTechnicalTrace(a,m,quality=.18){
  if(!a||!m)return;
  const tr=actionTraceFromAgent(a,quality);if(!tr)return;
  const cur=m.techTrace;
  if(cur&&cur.key===tr.key){
    cur.strength=clamp((cur.strength||0)+quality*.18,0,1.6);
    cur.repetitions=(cur.repetitions||1)+1;
    cur.q=clamp((cur.q||0)*.82+tr.q*.18,0,.30);
    cur.lastReinforced=worldAge;
  }else if(!cur||quality>(cur.strength||0)*.72){
    m.techTrace=tr;
  }
  m.traceStrength=clamp(Math.max(m.traceStrength||0,m.techTrace?.strength||0),0,1.6);
  a.lastManipulatedMaterial=m;a.lastManipulatedAt=worldAge;
}
function seedProcedureFromPhysicalTrace(a,trace,strength=.20){
  if(!a||!trace?.steps?.length)return false;
  const key=trace.key||procedureKey(trace.steps);
  let r=normalizeProcedureRecord(a.procedureMemory.library.get(key));
  const inferredQ=clamp((trace.q||.02)*strength,.002,.055);
  if(!r){
    r={
      steps:structuredClone(trace.steps),q:inferredQ,n:.32,source:trace.makerId??null,
      start:trace.steps[0]?.s||'trace',end:trace.steps.at(-1)?.o||'trace',
      physicalChange:1,beneficialChanges:0,successes:0,failures:0,transmissions:0,
      bornAt:worldAge,lastUsed:worldAge,environmentalSeed:true
    };
  }else{
    r.q=Math.max(r.q,inferredQ);
    r.n+=.10*strength;
    r.physicalChange=(r.physicalChange||0)+.08*strength;
    r.lastUsed=worldAge;
  }
  a.procedureMemory.library.set(key,r);
  return true;
}
function observeTechnicalTrace(a,m,dt,boost=1){
  const tr=m?.techTrace;if(!tr||!tr.steps?.length)return;
  const cognition=a.genome.cognition||{};
  const youth=a.age<CONFIG.JUVENILE_END?1.65:1;
  const salience=clamp((m.traceStrength||tr.strength||0)+
    (m.props?.complexity||0)*.10+(m.transformedLevel||0)*.10,0,1.8);
  if(salience<.06)return;
  const rate=.020*(cognition.imitation||.5)*(cognition.cultureBias||.5)*youth*boost*salience;
  if(Math.random()<1-Math.exp(-dt*rate)){
    if(seedProcedureFromPhysicalTrace(a,tr,.22*youth*boost)){
      tr.observations=(tr.observations||0)+1;
      m.traceObservations=(m.traceObservations||0)+1;
      if(tr.makerId!==a.id&&tr.observations>=2){
        recordDiscovery('culture:object-trace:first','🪨','Técnica aprendida desde un objeto',
          'Un organismo reconstruyó parte de una secuencia al observar un objeto modificado por otro individuo.',m.mesh.position);
      }
    }
  }
}
function absorbTraceIntoStructure(s,trace){
  if(!s||!trace?.steps?.length)return;
  s.techArchive=s.techArchive||[];
  const key=trace.key||procedureKey(trace.steps);
  const found=s.techArchive.find(x=>x.key===key);
  if(found){
    found.strength=clamp((found.strength||0)+(trace.strength||.1)*.16,0,1.8);
    found.repetitions=(found.repetitions||1)+(trace.repetitions||1);
    found.q=Math.max(found.q||0,trace.q||0);
    found.lastReinforced=worldAge;
  }else{
    s.techArchive.push({...structuredClone(trace),key,strength:clamp((trace.strength||.1)*.72,.04,1.4)});
    s.techArchive.sort((a,b)=>(b.strength||0)-(a.strength||0));
    if(s.techArchive.length>6)s.techArchive.length=6;
  }
}
function observeStructureTradition(a,s,dt){
  if(!s?.techArchive?.length)return;
  const archive=s.techArchive;
  const tr=archive[(Math.random()*Math.min(3,archive.length))|0];
  if(!tr)return;
  const youth=a.age<CONFIG.JUVENILE_END?1.8:1;
  const legacy=clamp(Math.log1p(s.useTime||0)*.12+(s.modifications||0)*.08+
    (s.builders?.length||0)*.05+(s.complexity||0)*.05,0,1.2);
  const rate=.010*(a.genome.cognition?.cultureBias||.5)*(a.genome.cognition?.imitation||.5)*youth*(.35+legacy);
  if(Math.random()<1-Math.exp(-dt*rate)){
    seedProcedureFromPhysicalTrace(a,tr,.16*youth*(.6+legacy));
    tr.observations=(tr.observations||0)+1;
    if((s.maxGeneration??a.generation)-(s.minGeneration??a.generation)>=2){
      recordDiscovery('culture:structure-memory:first','🏛️','Conocimiento preservado en una estructura',
        'Una construcción siguió transmitiendo una técnica después de varias generaciones de usuarios.',s.group.position);
    }
  }
}

function stableProcedure(raw){
  const r=normalizeProcedureRecord(raw);
  return !!(r?.steps?.length&&r.n>=3&&r.successes>=1&&r.q>.010&&procedureCulturalScore(r)>.009);
}
function updateProcedureMemory(a,p,reward){
  const pm=a.procedureMemory,outcome=technicalStateCode(a,p);
  if(pm.pending){
    const transition={s:pm.pending.s,a:pm.pending.a,o:outcome};
    pm.history.push(transition);
    if(pm.history.length>6)pm.history.shift();
    if(pm.history.length>=3){
      const steps=pm.history.slice(-3).map(x=>({...x})),key=procedureKey(steps);
      let r=normalizeProcedureRecord(pm.library.get(key));
      if(!r)r={steps,q:0,n:0,source:a.id,start:steps[0].s,end:steps[2].o,physicalChange:0,beneficialChanges:0,successes:0,failures:0,transmissions:0,bornAt:worldAge,lastUsed:worldAge};
      r.n++;r.lastUsed=worldAge;
      const changed=steps.some(x=>x.s!==x.o);
      if(changed)r.physicalChange++;
      if(reward>.015){r.successes++;if(changed)r.beneficialChanges++;}
      else if(reward<-.020)r.failures++;
      const alpha=clamp(.14/Math.sqrt(r.n),.022,.14);
      r.q+=alpha*(reward-r.q);r.start=steps[0].s;r.end=steps[2].o;
      pm.library.set(key,r);
      if(stableProcedure(r))recordDiscovery('culture:stable:first','🧠','Primera tradición estable','Una secuencia se repitió con resultados positivos suficientes para superar la selección cultural.');
    }
  }
  pm.pending=null;

  if(pm.library.size>32){
    const keep=[...pm.library.entries()]
      .map(([k,r])=>[k,normalizeProcedureRecord(r)])
      .filter(([,r])=>r.n>=2||r.q>.04)
      .sort((x,y)=>procedureCulturalScore(y[1])-procedureCulturalScore(x[1]))
      .slice(0,24);
    pm.library=new Map(keep);
  }
}
function procedureBias(a,p,mode){
  const pm=a.procedureMemory,state=technicalStateCode(a,p);
  const hist=pm.history||[];let best=0;
  for(const raw of pm.library.values()){
    const r=normalizeProcedureRecord(raw),steps=r.steps||[];
    const cultural=procedureCulturalScore(r);
    if(!steps.length||r.n<2||r.q<=0||cultural<=.004)continue;
    let candidate=0;
    if(hist.length>=2&&steps.length>=3){
      const h1=hist[hist.length-2],h2=hist[hist.length-1];
      if(transitionKey(h1)===transitionKey(steps[0])&&transitionKey(h2)===transitionKey(steps[1])&&steps[2].s===state&&steps[2].a===mode)candidate=r.q;
    }
    if(candidate===0&&hist.length>=1&&steps.length>=2){
      const h=hist[hist.length-1];
      if(transitionKey(h)===transitionKey(steps[0])&&steps[1].s===state&&steps[1].a===mode)candidate=r.q*.68;
    }
    if(candidate===0&&steps[0].s===state&&steps[0].a===mode)candidate=r.q*.34;
    best=Math.max(best,candidate*(.55+.45*clamp(cultural/.08,0,1)));
  }
  return best;
}
function imitateProcedure(a,n,dt){
  if(!n?.procedureMemory?.library?.size||n.lastReward<.035)return;
  const rate=.030*(a.genome.cognition?.imitation||.5)*(a.genome.cognition?.cultureBias||.5);
  if(Math.random()>1-Math.exp(-dt*rate))return;

  const ranked=[...n.procedureMemory.library.entries()]
    .map(([k,r])=>[k,normalizeProcedureRecord(r)])
    .filter(([,r])=>stableProcedure(r))
    .sort((x,y)=>procedureCulturalScore(y[1])-procedureCulturalScore(x[1]));
  const best=ranked[0];if(!best)return;
  const [key,r]=best,cur=normalizeProcedureRecord(a.procedureMemory.library.get(key));
  if(!cur||procedureCulturalScore(r)*.45>procedureCulturalScore(cur)){
    const sourceRaw=n.procedureMemory.library.get(key);
    if(sourceRaw)sourceRaw.transmissions=(sourceRaw.transmissions||0)+1;
    a.procedureMemory.library.set(key,{
      ...structuredClone(r),q:r.q*.14,n:.55,successes:0,failures:0,
      transmissions:0,source:n.id,bornAt:worldAge,lastUsed:worldAge
    });
    a.procedureMemory.copied++;totalProcedureCopies++;
  }
}
function exportProcedures(a){
  return [...a.procedureMemory.library.entries()]
    .map(([k,r])=>[k,normalizeProcedureRecord(r)])
    .filter(([,r])=>stableProcedure(r))
    .sort((x,y)=>procedureCulturalScore(y[1])-procedureCulturalScore(x[1]))
    .slice(0,3)
    .map(([k,r])=>[k,{...structuredClone(r),q:r.q*.10,n:.45,successes:0,failures:0,transmissions:0,source:a.id,bornAt:worldAge,lastUsed:worldAge}]);
}
function importProcedures(a,seed,strength=.7){
  for(const [k,raw] of seed||[]){
    const r=normalizeProcedureRecord(raw);if(!r?.steps?.length)continue;
    a.procedureMemory.library.set(k,{...structuredClone(r),q:(r.q||0)*strength,n:Math.max(.3,(r.n||.1)*strength),successes:0,failures:0,transmissions:0,source:r.source,lastUsed:worldAge});
  }
}
function normalizeProcedureMemory(a){
  const lib=new Map();
  for(const [k,raw] of a.procedureMemory.library||[]){
    const r=normalizeProcedureRecord(raw);
    if(r?.steps?.length)lib.set(k,r);
  }
  a.procedureMemory.library=lib;
  a.procedureMemory.history=(a.procedureMemory.history||[]).filter(x=>x&&typeof x==='object'&&'s' in x&&'a' in x&&'o' in x);
  a.procedureMemory.pending=null;
}
function procedureCount(){
  return agents.reduce((s,a)=>s+[...a.procedureMemory.library.values()].filter(r=>stableProcedure(r)).length,0);
}
function technicalProcedureCount(){
  return agents.reduce((s,a)=>s+[...a.procedureMemory.library.values()].filter(r=>{
    r=normalizeProcedureRecord(r);
    return stableProcedure(r)&&(r.beneficialChanges||0)>0;
  }).length,0);
}



function socialApproachPoint(a,b){
  if(!a||!b)return b?.mesh?.position?.clone?.()||null;
  const dx=a.mesh.position.x-b.mesh.position.x,dz=a.mesh.position.z-b.mesh.position.z;
  let d=Math.hypot(dx,dz);
  const desired=clamp(.78+.42*(a.genome.body.size+b.genome.body.size)+.16*a.genome.body.reach,1.05,2.15);
  if(d<.001){
    const ang=(a.id*2.399963229728653)%(Math.PI*2);
    return new THREE.Vector3(b.mesh.position.x+Math.sin(ang)*desired,0,b.mesh.position.z+Math.cos(ang)*desired);
  }
  return new THREE.Vector3(
    b.mesh.position.x+dx/d*desired,
    0,
    b.mesh.position.z+dz/d*desired
  );
}
function obstaclePenaltyAt(a,p){
  let penalty=0;
  const personal=.34+.32*a.genome.body.size;

  for(const o of agents){
    if(o===a)continue;
    const d=Math.hypot(p.x-o.mesh.position.x,p.z-o.mesh.position.z);
    const safe=personal+.30+.26*o.genome.body.size;
    if(d<safe)penalty+=(safe-d)/safe*1.25;
  }
  for(const m of materials){
    if(m.carriedBy||a.carrying===m)continue;
    const d=Math.hypot(p.x-m.mesh.position.x,p.z-m.mesh.position.z);
    const safe=personal+.18+clamp((m.props?.mass||.5)*.10,.05,.32);
    if(d<safe)penalty+=(safe-d)/safe*.70;
  }
  for(const s of structures){
    const d=Math.hypot(p.x-s.group.position.x,p.z-s.group.position.z);
    const safe=personal+.55+clamp((s.totalMass||1)*.025,0,.55);
    if(d<safe)penalty+=(safe-d)/safe*.95;
  }

  const r=Math.hypot(p.x,p.z);
  if(r>CONFIG.WORLD-1.1)penalty+=(r-(CONFIG.WORLD-1.1))*.9;
  return penalty;
}
function chooseLocalWaypoint(a,goal){
  if(!goal)return null;
  const dx=goal.x-a.mesh.position.x,dz=goal.z-a.mesh.position.z;
  const goalDist=Math.hypot(dx,dz);
  if(goalDist<.75)return goal.clone();

  const direct=Math.atan2(dx,dz);
  const offsets=[0,-.24,.24,-.48,.48,-.78,.78,-1.05,1.05];
  let best=goal.clone(),bestScore=-Infinity;
  const sampleDist=Math.min(CONFIG.NAV_SAMPLE_RADIUS,Math.max(.95,goalDist*.48));
  const escape=a.nav?.loopScore>.55?(a.nav.escapeSign||1):0;

  for(const off of offsets){
    const ang=direct+off;
    const p=new THREE.Vector3(
      a.mesh.position.x+Math.sin(ang)*sampleDist,
      0,
      a.mesh.position.z+Math.cos(ang)*sampleDist
    );
    const rr=Math.hypot(p.x,p.z);
    if(rr>CONFIG.WORLD-.75)p.multiplyScalar((CONFIG.WORLD-.75)/rr);

    const newDist=Math.hypot(goal.x-p.x,goal.z-p.z);
    const progress=(goalDist-newDist)/Math.max(.1,sampleDist);
    const obstacle=obstaclePenaltyAt(a,p);
    const turn=Math.abs(off);
    const climb=Math.max(0,terrainHeightAt(p)-terrainHeightAt(a.mesh.position));
    const slope=terrainSlopeAt(p);
    const steepPenalty=Math.max(0,slope-.42)*.34+Math.max(0,slope-CONFIG.TERRAIN_MAX_SLOPE)*1.25;
    const escapeBias=escape?Math.sign(off||escape)*escape*.10:0;
    const score=progress*1.05-obstacle*.82-turn*.08-climb*.075-steepPenalty+escapeBias;

    if(score>bestScore){bestScore=score;best=p;}
  }
  return best;
}
function recordNavigationPath(a,dt){
  if(!a.nav)return;
  a.nav.pathTimer=(a.nav.pathTimer||0)+dt;
  if(a.nav.pathTimer<.38)return;
  a.nav.pathTimer=0;

  const point={x:a.mesh.position.x,z:a.mesh.position.z,t:worldAge,d:a.nav.lastDistance??999};
  const path=a.nav.path||(a.nav.path=[]);
  path.push(point);
  while(path.length>CONFIG.NAV_LOOP_WINDOW)path.shift();
  if(path.length<8)return;

  let repeats=0;
  const current=path[path.length-1];
  for(let i=0;i<path.length-4;i++){
    if(Math.hypot(current.x-path[i].x,current.z-path[i].z)<.82)repeats++;
  }

  const old=path[Math.max(0,path.length-7)];
  const targetProgress=(old.d??999)-(current.d??999);
  const looping=repeats>=2&&targetProgress<.45;

  if(looping){
    a.nav.loopScore=clamp((a.nav.loopScore||0)+.34,0,1.4);
    a.nav.escapeSign=((a.id+(a.nav.replans||0))%2)?1:-1;
    a.rewardBuffer-=.035;
    a.decision.timer=0;
    a.nav.noProgress=Math.max(a.nav.noProgress||0,CONFIG.NAV_REPLAN_TIME);
    a.nav.replans=(a.nav.replans||0)+1;
  }else{
    a.nav.loopScore=Math.max(0,(a.nav.loopScore||0)-.06);
  }
}
function decisionUrgency(a,per){
  const pain=maxArray(a.nervous.current.pain);
  const starving=a.energy<34;
  const danger=a.affect.fear>.67||(per.mem?.threat||0)>.48||pain>.48;
  const immediateFood=starving&&per.fVisible;
  return danger||immediateFood;
}

function navigationTargetChanged(a,target,mode){
  if(!a.nav)return true;
  if(a.nav.lastMode!==mode)return true;
  if(!target)return a.nav.lastTargetX!=null;
  if(a.nav.lastTargetX==null||a.nav.lastTargetZ==null)return true;
  return Math.hypot(target.x-a.nav.lastTargetX,target.z-a.nav.lastTargetZ)>.85;
}
function resetNavigationProgress(a,target,mode){
  if(!a.nav)a.nav={lastDistance:null,lastMode:-1,lastTargetX:null,lastTargetZ:null,noProgress:0,progress:0,replans:0,path:[],pathTimer:0,loopScore:0,escapeSign:1,lastWaypoint:null,waypointTimer:0};
  a.nav.lastMode=mode;
  a.nav.lastTargetX=target?.x??null;
  a.nav.lastTargetZ=target?.z??null;
  a.nav.lastDistance=target?Math.hypot(target.x-a.mesh.position.x,target.z-a.mesh.position.z):null;
  a.nav.noProgress=0;
  a.nav.progress=0;
}
function evaluateNavigationProgress(a,dt){
  const target=a.decision?.target;
  if(!target){
    if(a.nav){a.nav.lastDistance=null;a.nav.noProgress=Math.max(0,a.nav.noProgress-dt);}
    return;
  }
  if(!a.nav)resetNavigationProgress(a,target,a.decision.mode);

  const d=Math.hypot(target.x-a.mesh.position.x,target.z-a.mesh.position.z);
  if(a.nav.lastDistance==null){
    a.nav.lastDistance=d;
    return;
  }

  const progress=a.nav.lastDistance-d;
  a.nav.progress=progress;
  if(d>.72){
    if(progress>0){
      a.rewardBuffer+=Math.min(.018,progress*.012)*a.genome.body.motorPlasticity;
      a.nav.noProgress=Math.max(0,a.nav.noProgress-dt*1.8);
    }else{
      a.nav.noProgress+=dt;
      if(progress<-.015)a.rewardBuffer-=Math.min(.006,-progress*.003);
    }
    if(a.nav.noProgress>CONFIG.NAV_REPLAN_TIME){
      a.rewardBuffer-=.022;
      a.decision.timer=0;
      a.nav.noProgress=0;
      a.nav.replans=(a.nav.replans||0)+1;
    }
  }else{
    a.nav.noProgress=0;
  }
  a.nav.lastDistance=d;
}
function navigationAlignmentFactor(diff){
  const x=Math.abs(diff);
  if(x>1.05)return .015;
  if(x>.72)return .07;
  if(x>.44)return .26;
  if(x>.22)return .62;
  return 1;
}
function hybridGroundLift(a){
  const g=a.genome.body,p=a.phenotype;
  if((g.limbPairs||0)<=0)return 0;
  const overall=g.adultScale*(.38+.62*p.growth);
  const limbDev=clamp(.12+.88*(p.devLimb||0),.10,1.12)*(1+(p.devLimbBias||0));
  const limbDrop=.76*g.limbLength*g.legRatio*g.size*limbDev;
  const anchorHeight=(.43+Math.min(0,g.spineArch)*.55)*g.size;
  const torsoDrop=(g.axialPosture||0)*Math.max(0,(g.segments-1)*.34*g.segmentStretch*g.size)*overall;
  const needed=Math.max(0,(limbDrop-anchorHeight)*overall)+torsoDrop*.72;
  return clamp(needed+.015,0,1.45*Math.max(.55,g.size)*overall);
}

function chooseDecision(a,per,out){
  const t=a.genome.temperament,cog=a.genome.cognition||{planningDepth:2,foresight:.7};
  const context=contextKey(a,per.mem);
  const [novelPos,novelScore]=noveltyPoint(a);
  const generalMem=bestPositiveMemory(a);
  const foodMem=bestMemoryOfType(a,'food');
  const posMem=(a.energy<62&&foodMem)?foodMem:generalMem;
  const negMem=nearestNegativeMemory(a);

  const candidates=[
    {mode:0,target:null,valid:true,label:'mantener trayectoria'},
    {mode:1,target:per.f?.mesh.position.clone()||null,valid:!!per.fVisible,label:'atender comida'},
    {mode:2,target:per.nVisible?socialApproachPoint(a,per.n):null,targetEntityId:per.nVisible?per.n.id:null,valid:!!per.nVisible,label:'atender otro ser'},
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
    let score=out[c.mode]+direct*.45+plan*.52*cog.foresight+observed*.22+seq*.20;
    score+=basalInstinctBias(a,per,c.mode);
    score+=languageBias(a,per.heardToken,c.mode)*.42;
    score+=externalMarkBias(a,per,c.mode)*.38;
    score+=procedureBias(a,per,c.mode)*.28*(a.genome.cognition?.cultureBias||.5);
    if(per.nVisible&&per.n){const kin=kinshipScore(a,per.n),rep=reputationScore(a,per.n);if(c.mode===2){const bond=Math.max(0,socialBondScore(a,per.n));score+=(kin*(a.genome.cognition?.kinBias||.4)+Math.max(0,rep)*(a.genome.cognition?.reciprocityBias||.5)+(per.mem?.affinity||0)*.52+(per.mem?.trust||0)*.34+bond*.72)*.16;}if(c.mode===7)score+=(Math.max(0,-rep)*(a.genome.cognition?.territoriality||.3)-kin*.08)*.05;}
    const predictiveNovelty=predictionNovelty(a,context,c.mode);
    score+=predictiveNovelty*(cog.predictiveDrive||.6)*t.curiosity*.075;

    if(c.mode===6)score+=novelScore*.34*t.curiosity*t.exploration;
    if(c.mode===3&&per.mVisible&&per.m){
      score+=worksiteAttentionBonus(per.m)*(a.genome.cognition?.cultureBias||.5);
    }
    if(c.mode===4&&per.sVisible&&per.st){
      const carryingFit=a.carrying?.props?.bind||0;
      score+=worksiteAttentionBonus(per.st)*(a.genome.cognition?.cultureBias||.5)+
        (a.carrying?.bind||carryingFit)*.025;
    }
    if(c.mode===5&&posMem){
      score+=posMem.value*.28;
      if(posMem.type==='socialHub'&&a.energy>48)score+=posMem.value*.16*Math.max(0,t.sociability*.35+t.attachment*.45);
      if(posMem.type==='activitySite'&&a.energy>42)score+=posMem.value*.12*(a.genome.cognition?.cultureBias||.5);
    }
    if(c.mode===7){
      const threat=per.mem?.threat||0;
      score+=a.affect.fear*.42+threat*.35 + maxArray(a.nervous.current.pain)*.45 + a.nervous.current.balance*.18;
    }
    if(c.mode===1){ score+=a.nervous.current.intero*.18; }
    if(c.mode===0){ score-=a.nervous.current.pressure*.08; }
    if(c.mode===0)score+=t.persistence*.08;

    planRows.push({mode:c.mode,label:c.label,score,plan,direct,observed,seq,predictive:predictionNovelty(a,context,c.mode)});
    if(score>bestScore){bestScore=score;best={...c,plan,direct,observed,seq};}
  }
  if(!best)best={...candidates[0],plan:0,direct:0,observed:0,seq:0};

  if(!decisionUrgency(a,per)&&a.decision.timer<=0){
    const currentRow=planRows.find(r=>r.mode===a.decision.mode);
    const currentCandidate=candidates.find(c=>c.mode===a.decision.mode&&c.valid);
    if(currentRow&&currentCandidate){
      const margin=clamp(.08+(t.persistence||.5)*.08-(t.impulsivity||.5)*.025,.045,.16);
      if(bestScore-currentRow.score<margin){
        best={
          ...currentCandidate,
          target:(a.decision.target?.clone?.()||currentCandidate.target),
          targetEntityId:a.decision.targetEntityId??currentCandidate.targetEntityId??null,
          plan:currentRow.plan,direct:currentRow.direct,observed:currentRow.observed,seq:currentRow.seq
        };
      }
    }
  }

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

  const previousMode=a.decision.mode;
  const previousTarget=a.decision.target?.clone?.()||null;

  if((best.mode===5||best.mode===6)&&previousMode===best.mode&&previousTarget&&a.nav?.noProgress<2.2){
    const remaining=Math.hypot(previousTarget.x-a.mesh.position.x,previousTarget.z-a.mesh.position.z);
    if(remaining>.85)best.target=previousTarget;
  }

  a.decision.lastMode=a.decision.mode;
  a.decision.lastContext=a.decision.context;
  a.decision.mode=best.mode;
  a.decision.context=context;
  a.decision.q=best.direct;
  a.decision.plan=best.plan;
  a.decision.duration=(CONFIG.DECISION_MIN+(CONFIG.DECISION_MAX-CONFIG.DECISION_MIN)*(.38+.34*(1-clamp(t.impulsivity,0,1))))*(.82+t.persistence*.52);
  a.decision.timer=a.decision.duration;
  a.decision.target=best.target;
  a.decision.targetEntityId=best.targetEntityId??null;
  a.procedureMemory.pending={s:technicalStateCode(a,per),a:best.mode,t:worldAge};
  a.lastPlanTable=planRows.sort((x,y)=>y.score-x.score).slice(0,4);
  a.thought=`${best.label} · futuro ${best.plan.toFixed(2)} · experiencia ${best.direct.toFixed(2)} · sorpresa ${(a.predictive?.lastError||0).toFixed(2)}`;

  if(navigationTargetChanged(a,best.target,best.mode))resetNavigationProgress(a,best.target,best.mode);

  if(best.target)a.targetHeading=angleTo(a,best.target);
  else a.targetHeading=a.heading;
}

function pickUpMaterial(a,m){
  if(!m||a.carrying||m.carriedBy)return false;
  const morph=morphologyMetrics(a);
  if(effectiveMaterialMass(m)>effectiveGripStrength(a)*1.15*morph.strength)return false;
  a.carrying=m;m.carriedBy=a.id;
  storeSpatialMemory(a,'material',a.mesh.position,.18);
  return true;
}
function dropMaterial(a,forced=false){
  const m=a.carrying;if(!m)return;
  m.carriedBy=null;m.mesh.parent?.remove(m.mesh);materialGroup.add(m.mesh);
  m.mesh.position.copy(a.mesh.position);
  const fwd=new THREE.Vector3(Math.sin(a.heading),0,Math.cos(a.heading));
  m.mesh.position.addScaledVector(fwd,.6*effectiveManipReach(a));
  m.mesh.position.y=terrainHeightAt(m.mesh.position)+materialRestY(m.type,m.props);
  m.placedBy=a.id;m.placedAt=worldAge;m.manipCount=(m.manipCount||0)+1;
  a.carrying=null;m.staticTime=forced?2:0;
  if(!forced)tryAttachMaterialToStructure(a,m);
}
function updateCarriedMaterial(a){
  const m=a.carrying;if(!m)return;
  if(m.mesh.parent!==a.mesh){m.mesh.parent?.remove(m.mesh);a.mesh.add(m.mesh);}
  m.mesh.position.set(0,.42*a.genome.body.size,.62*a.genome.body.size*effectiveManipReach(a));
  m.mesh.rotation.set(0,0,m.type==='fiber'?Math.PI/2:0);
  trackRegionalTransport(m,a.mesh.position);
}

function recalcStructure(s){
  const pp=s.partProps||[],count=Math.max(1,pp.length);
  s.totalMass=pp.reduce((z,p)=>z+(p.mass||0),0);
  s.hardness=pp.reduce((z,p)=>z+(p.hardness||0),0)/count;
  s.fertility=pp.reduce((z,p)=>z+(p.fertility||0),0);
  s.length=pp.reduce((z,p)=>z+(p.length||0),0);
  s.binding=pp.reduce((z,p)=>z+(p.bind||0),0)/count;
  s.insulation=pp.reduce((z,p)=>z+((p.flexibility||0)*.45+(p.bind||0)*.25+(p.hardness||0)*.12),0)/count;
  s.resonance=pp.reduce((z,p)=>z+(p.resonance||0),0)/count;
  s.stability=clamp(s.totalMass*.10+s.hardness*.42+s.binding*.34+Math.log1p(count)*.13,0,2.5);
  const unique=new Set(s.parts||[]).size;
  s.complexity=clamp(unique*.42+count*.16+(s.modifications||0)*.09+s.binding*.18,0,8);
}
function createStructureFromMaterials(chosen,center){
  if(structures.length>=CONFIG.MAX_STRUCTURES||chosen.length<3)return null;
  center=center.clone();center.y=terrainHeightAt(center);
  const group=new THREE.Group();group.position.copy(center);structureGroup.add(group);
  const builders=[...new Set(chosen.map(m=>m.placedBy).filter(v=>v!=null))],parts=[],partProps=[];
  for(const m of chosen){
    m.mesh.parent?.remove(m.mesh);m.mesh.position.sub(center);group.add(m.mesh);
    parts.push(m.type);partProps.push({...m.props});
    const idx=materials.indexOf(m);if(idx>=0)materials.splice(idx,1);
  }
  const traces=chosen.filter(m=>m.techTrace).map(m=>structuredClone(m.techTrace))
    .sort((a,b)=>(b.strength||0)-(a.strength||0)).slice(0,6);
  const builderAgents=builders.map(id=>agents.find(a=>a.id===id)).filter(Boolean);
  const gens=builderAgents.map(a=>a.generation);
  const s={id:nextStructureId++,group,parts,partProps,builders,modifications:0,useTime:0,maxOccupancy:0,lastUsed:worldAge,age:0,
    techArchive:traces,minGeneration:gens.length?Math.min(...gens):null,maxGeneration:gens.length?Math.max(...gens):null,
    worksiteStrength:.12,worksiteWork:0,worksiteWorkers:[...builders],lastWorkAt:worldAge};
  recalcStructure(s);structures.push(s);return s;
}
function tryAttachMaterialToStructure(a,m){
  if(!m||m.carriedBy||!structures.length)return false;
  let best=null,bd=Infinity;
  for(const s of structures){const d=m.mesh.position.distanceTo(s.group.position);if(d<1.15&&d<bd){best=s;bd=d;}}
  if(!best)return false;
  const worldPos=m.mesh.position.clone();
  m.mesh.parent?.remove(m.mesh);best.group.add(m.mesh);m.mesh.position.copy(worldPos.sub(best.group.position));
  best.parts.push(m.type);best.partProps.push({...m.props});
  if(m.techTrace)absorbTraceIntoStructure(best,m.techTrace);
  if(a){
    best.minGeneration=best.minGeneration==null?a.generation:Math.min(best.minGeneration,a.generation);
    best.maxGeneration=best.maxGeneration==null?a.generation:Math.max(best.maxGeneration,a.generation);
  }
  const newBuilder=!!(a&&!best.builders.includes(a.id));
  if(newBuilder)best.builders.push(a.id);
  if(a){
    noteStructureWorksite(a,best,.20+.05*(m.techTrace?1:0));
    a.rewardBuffer+=.006*(a.genome.temperament.curiosity||.5);
  }
  if(newBuilder&&best.builders.length>=2)recordDiscovery('structure:multi-builder:first','🏗️','Construcción colectiva',`Una estructura fue modificada por más de un constructor.`,best.group.position);
  best.modifications=(best.modifications||0)+1;best.lastUsed=worldAge;
  const idx=materials.indexOf(m);if(idx>=0)materials.splice(idx,1);
  recalcStructure(best);return true;
}

function disposeLooseMaterial(m){
  const i=materials.indexOf(m);if(i>=0)materials.splice(i,1);
  m.mesh.parent?.remove(m.mesh);
  if(m.mesh.geometry)m.mesh.geometry.dispose();
  if(m.mesh.material)m.mesh.material.dispose();
}
function materialLegacyScore(m){
  if(!m||m.carriedBy||m.burning)return 1e6;
  const age=Math.max(0,worldAge-(m.placedAt||0));
  const recency=Math.exp(-age/320);
  const tech=(m.type==='composite'?1.4:0)+(m.transformedLevel||0)*.55+(m.waterAmount||0)*3.0;
  const history=Math.log1p((m.manipCount||0)+(m.work||0)*.5+(m.regionalMoves||0)*2+(m.mechanicalWork||0)*2);
  const durability=(m.props?.durability||.4)*.18;
  return tech+history*.34+durability+recency*.22-age*.00045;
}
function structureLegacyScore(s){
  const idle=Math.max(0,worldAge-(s.lastUsed||0));
  const recency=Math.exp(-idle/420);
  return Math.log1p(s.useTime||0)*.20+(s.modifications||0)*.16+(s.maxOccupancy||0)*.09+
    (s.builders?.length||0)*.11+(s.complexity||0)*.11+(s.stability||0)*.08+
    (s.techArchive?.length||0)*.12+recency*.35-idle*.0007;
}
function collapseStructureForRecycling(s){
  const idx=structures.indexOf(s);if(idx<0)return;
  const pos=s.group.position.clone(),parts=s.parts||[],props=s.partProps||[];
  structures.splice(idx,1);structureGroup.remove(s.group);
  s.group.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});
  totalCollapsedStructures++;

  const salvage=Math.min(2,parts.length);
  for(let i=0;i<salvage&&materials.length<CONFIG.MATERIAL_RECYCLE_TARGET-4;i++){
    const k=(i*3+parts.length-1)%Math.max(1,parts.length),type=parts[k]||'stone';
    const p=pos.clone();p.x+=rand(-.45,.45);p.z+=rand(-.45,.45);
    makeMaterial(type,p,{props:props[k]||MATERIAL_TYPES[type],placedBy:null,placedAt:0,staticTime:0});
  }
  recordDiscovery('recycling:structure:first','♻️','Primera estructura reciclada','Una construcción abandonada perdió prioridad frente a materia y estructuras con uso cultural.',pos);
}
function runWorldRecycling(){
  if(worldAge<nextRecycleAt)return;
  nextRecycleAt=worldAge+2.5;

  const excessM=Math.max(0,materials.length-CONFIG.MATERIAL_RECYCLE_TARGET);
  if(excessM>0){
    const candidates=materials.filter(m=>!m.carriedBy&&!m.burning)
      .sort((a,b)=>materialLegacyScore(a)-materialLegacyScore(b));
    const removeN=Math.min(7,excessM,candidates.length);
    for(let i=0;i<removeN;i++){disposeLooseMaterial(candidates[i]);totalRecycledMaterials++;}
    if(removeN>0)recordDiscovery('recycling:matter:first','♻️','Reciclaje ecológico de materia','Objetos sin uso ni historia cultural fueron retirados para liberar espacio físico.');
  }

  const excessS=Math.max(0,structures.length-CONFIG.STRUCTURE_RECYCLE_TARGET);
  if(excessS>0){
    const candidates=structures
      .filter(s=>s.age>120&&worldAge-(s.lastUsed||0)>80)
      .sort((a,b)=>structureLegacyScore(a)-structureLegacyScore(b));
    const removeN=Math.min(3,excessS,candidates.length);
    for(let i=0;i<removeN;i++)collapseStructureForRecycling(candidates[i]);
  }
}

function maybeCreateStructure(dt){
  if(structures.length>=CONFIG.STRUCTURE_RECYCLE_TARGET+14)return;
  for(const m of materials){
    if(m.carriedBy)continue;
    const moved=m.mesh.position.distanceTo(m.lastPos);
    m.staticTime=moved<.015?m.staticTime+dt:0;m.lastPos.copy(m.mesh.position);
  }
  const candidates=materials.filter(m=>!m.carriedBy&&m.staticTime>1.25&&m.placedBy!=null&&worldAge-(m.placedAt||0)<150&&(m.manipCount||0)>.10);
  for(const seed of candidates){
    const cluster=candidates.filter(m=>m.mesh.position.distanceTo(seed.mesh.position)<.86);
    if(cluster.length===2){
      const chosen=cluster.slice(0,2),totalBind=chosen.reduce((s,m)=>s+(m.props.bind||0),0);
      const hard=Math.max(...chosen.map(m=>m.props.hardness||0)),diversity=new Set(chosen.map(m=>m.type)).size;
      if(totalBind>.58&&hard>.45&&diversity>=2){
        const center=chosen[0].mesh.position.clone().add(chosen[1].mesh.position).multiplyScalar(.5);
        makeCompositeArtifact(chosen,center);break;
      }
    }
    if(cluster.length<3)continue;
    const chosen=cluster.slice(0,Math.min(9,cluster.length)),center=new THREE.Vector3();
    chosen.forEach(m=>center.add(m.mesh.position));center.multiplyScalar(1/chosen.length);
    createStructureFromMaterials(chosen,center);break;
  }
}
function structureEffects(dt){
  for(const s of structures){
    s.age+=dt;let occupancy=0;
    const activeAge=Math.max(0,worldAge-(s.lastWorkAt||worldAge));
    s.worksiteStrength=activitySiteStrength(s);
    const legacy=clamp(Math.log1p(s.useTime||0)*.10+(s.modifications||0)*.07+
      (s.builders?.length||0)*.045+(s.techArchive?.length||0)*.055,0,1.15);
    for(const a of agents){
      if(a.mesh.position.distanceTo(s.group.position)<2.25){
        occupancy++;s.useTime=(s.useTime||0)+dt;s.lastUsed=worldAge;
        s.minGeneration=s.minGeneration==null?a.generation:Math.min(s.minGeneration,a.generation);
        s.maxGeneration=s.maxGeneration==null?a.generation:Math.max(s.maxGeneration,a.generation);

        const memoryValue=clamp(.12+s.stability*.10+s.complexity*.022+legacy*.20,0,.88);
        if(Math.random()<1-Math.exp(-dt*(.012+.018*legacy))){
          storeSpatialMemory(a,'structure',s.group.position,memoryValue);
        }
        if(occupancy>=2&&Math.random()<dt*.012){
          storeSpatialMemory(a,'socialHub',s.group.position,clamp(.18+legacy*.30,0,.72));
        }
        if((s.worksiteStrength||0)>.12&&Math.random()<dt*.018){
          rememberActivitySite(a,s.group.position,clamp(.18+s.worksiteStrength*.34,0,.72));
        }
        observeStructureTradition(a,s,dt*.55);
      }
    }
    s.maxOccupancy=Math.max(s.maxOccupancy||0,occupancy);
    if((s.maxGeneration??0)-(s.minGeneration??0)>=2&&(s.useTime||0)>22){
      recordDiscovery('structure:intergenerational:first','🏚️','Estructura reutilizada entre generaciones',
        'Individuos de generaciones posteriores continuaron usando una construcción creada antes de su nacimiento.',s.group.position);
    }
    if(s.fertility>1&&food.length<CONFIG.FOOD_MAX&&Math.random()<dt*.025*sunFactor*s.fertility){
      const p=s.group.position.clone();p.x+=rand(-1.2,1.2);p.z+=rand(-1.2,1.2);makeFood(p,rand(4,8));
    }
  }
}
function structureShelterFactor(a){
  let factor=1;
  for(const s of structures){
    if(a.mesh.position.distanceTo(s.group.position)<1.9){
      const protection=clamp((s.stability||0)*.055+(s.insulation||0)*.05,0,.26);
      factor*=1-protection;
    }
  }
  return clamp(factor,.62,1);
}
function artifactCount(){return materials.filter(m=>m.type==='composite').length;}
function settlementMetrics(){
  const visited=new Set();let largest=0,bestScore=0;
  for(let i=0;i<structures.length;i++){
    if(visited.has(i))continue;
    const q=[i];visited.add(i);let count=0,use=0,complexity=0;
    while(q.length){
      const x=q.shift(),sx=structures[x];count++;use+=sx.useTime||0;complexity+=sx.complexity||0;
      for(let j=0;j<structures.length;j++){
        if(visited.has(j))continue;
        if(sx.group.position.distanceTo(structures[j].group.position)<4.2){visited.add(j);q.push(j);}
      }
    }
    largest=Math.max(largest,count);bestScore=Math.max(bestScore,count+Math.log1p(use)*.35+complexity*.12);
  }
  return {largest,score:bestScore};
}
function materialTechnologyIndex(){
  let v=0;
  for(const m of materials)if(m.type==='composite')v+=(m.props.complexity||1)*(.55+Math.log1p(m.manipCount||0)*.15);
  for(const s of structures)v+=(s.complexity||0)*(.45+Math.log1p(s.useTime||0)*.055);
  return v;
}


function affiliate(a,n){
  if(a.affiliateCooldown>0)return;
  a.affiliateCooldown=CONFIG.AFFILIATE_COOLDOWN;
  const am=memoryFor(a,n),nm=memoryFor(n,a);
  const familiarity=clamp(((am.meetings||0)+(nm.meetings||0))/14,0,1);
  am.affinity=clamp(am.affinity+.045*(.6+a.genome.temperament.attachment)+.018*familiarity,-1,1);
  am.trust=clamp(am.trust+.035+.018*familiarity,-1,1);
  nm.affinity=clamp(nm.affinity+.032+.014*familiarity,-1,1);
  nm.trust=clamp(nm.trust+.027+.014*familiarity,-1,1);
  a.affect.valence=clamp(a.affect.valence+.055,-1,1);
  n.affect.valence=clamp(n.affect.valence+.035,-1,1);
  storeSpatialMemory(a,'social',a.mesh.position,.35);
  rememberSocialHub(a,n,.48);
  socialRecord(a,n.id).help+=.02;socialRecord(n,a.id).help+=.02;
  a.rewardBuffer+=.08;
}
function attack(a,n,intent){
  if(a.attackCooldown>0)return;
  a.attackCooldown=CONFIG.ATTACK_COOLDOWN;
  const weapon=a.carrying?a.carrying.props:null;
  const weaponFactor=weapon?1+(weapon.hardness||0)*.55+(weapon.length||0)*.10+(weapon.edge||0)*.38+(weapon.leverage||0)*.12:1;
  const attackerMorph=morphologyMetrics(a),targetMorph=morphologyMetrics(n);
  const damage=clamp(
    (2.4+attackerMorph.strength*3.0+a.genome.body.grip*.35)*weaponFactor*intent/
    Math.max(.55,targetMorph.durability),
    .8,16
  );
  n.health=clamp(n.health-damage,0,CONFIG.MAX_HEALTH);
  a.energy=Math.max(0,a.energy-(.7+.3*attackerMorph.mass)*weaponFactor);
  queueNerveSignal(n,'pain',clamp(damage/10,0,1),1,.02);
  queueNerveSignal(a,'pressure',clamp(.18+damage/30,0,1),3,.01);
  const targetMemory=memoryFor(n,a);
  targetMemory.threat=clamp(targetMemory.threat+.15+damage/100,-1,1);
  targetMemory.affinity=clamp(targetMemory.affinity-.11-damage/150,-1,1);
  n.affect.fear=clamp(n.affect.fear+.16,0,1);n.affect.anger=clamp(n.affect.anger+.12,0,1);
  socialRecord(a,n.id).harm+=damage;socialRecord(a,n.id).attacks++;
  socialRecord(n,a.id).harm+=damage;socialRecord(n,a.id).attacks++;socialRecord(n,a.id).trust-=.08;
  storeSpatialMemory(n,'danger',n.mesh.position,-.85);
  a.rewardBuffer+=.01;
  if(n.health<=0)removeAgent(n);
}

function buildPerception(a){
  const [f,fd]=nearestFood(a),[n,nd]=nearestAgent(a),[m,md]=nearestMaterial(a),[st,sd]=nearestStructure(a),[mark,markd]=nearestWorldMark(a);
  const sensorMaturity=.22+.78*(a.phenotype.devSensor??1);
  const baseSense=CONFIG.SENSE_RADIUS*a.genome.body.sensor*sensorMaturity;
  const visionLight=.34+.66*Math.sqrt(daylightLevel());
  const sense=baseSense*visionLight;
  const hearingSense=baseSense*(.72+.48*a.genome.body.hearing);
  const fVisible=f&&fd<sense,nVisible=n&&nd<sense,mVisible=m&&md<CONFIG.MATERIAL_SENSE*a.genome.body.sensor*visionLight,sVisible=st&&sd<sense;
  const markVisible=mark&&markd<sense*.82;
  let mem=null,heardPitch=0,heardAmp=0,heardToken=null,neighborSignals=[0,0,0];
  if(n&&nd<hearingSense){
    if(nVisible)mem=memoryFor(a,n);
    neighborSignals=n.signal;
    const att=clamp(1-nd/hearingSense,0,1);
    heardPitch=(n.sound.freq/1400)*att;heardAmp=n.sound.amp*att;
    if(att>.08)heardToken=signalTokenFrom(n);
  }
  if(nVisible&&!mem)mem=memoryFor(a,n);
  return {f,fd,n,nd,m,md,st,sd,mark,markd,sense,fVisible,nVisible,mVisible,sVisible,markVisible,mem,heardPitch,heardAmp,heardToken,neighborSignals,localTemp:environmentTemperatureAt(a.mesh.position)};
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
    clamp(a.age/Math.max(1,individualMaxAge(a)),0,1)*2-1,
    p.fVisible?1-p.fd/p.sense:-1,foodDir,
    p.nVisible?1-p.nd/p.sense:-1,nDir,
    p.neighborSignals[0],p.neighborSignals[1],p.neighborSignals[2],p.heardPitch,p.heardAmp,
    p.mem?.affinity||0,p.mem?.threat||0,p.mem?.trust||0,
    waterProximity(a.mesh.position,4)*2-1,Math.hypot(a.mesh.position.x,a.mesh.position.z)/CONFIG.WORLD,
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


function updateEmbodiedMotor(a,out,dt,moveIntent){
  const g=a.genome.body,m=a.motor;
  const pivots=a.mesh.userData.limbPivots||[];
  const limbCount=Math.min(10,pivots.length);
  const gain=.40+.85*sigmoid(out[29]??0);
  m.motorGain=out[29]??0;
  let effort=0;

  // Store neural motor commands regardless of physics mode.
  for(let i=0;i<10;i++){
    const j=m.joints[i];
    j.drive=i<limbCount?clamp(out[18+i]??0,-1,1):0;
  }

  const posture=clamp(out[28]??0,-1,1);
  const crouchTarget=clamp(-posture,0,1);
  m.crouch+=(crouchTarget-m.crouch)*clamp(dt*5,0,1);
  if(posture>.68&&m.crouch>.13)m.jumpRequest=true;
  else if(posture<.25)m.jumpRequest=false;

  if(rigidModeActive&&a.physics){
    // In rigid mode, Rapier owns joint angles, gravity, contacts and translation.
    for(let i=0;i<a.physics.limbs.length;i++){
      const limb=a.physics.limbs[i],j=m.joints[i];
      const w=limb.body.angvel();
      const r=a.physics.torso.rotation();
      const tq=new THREE.Quaternion(r.x,r.y,r.z,r.w);
      const axis=new THREE.Vector3(1,0,0).applyQuaternion(tq);
      j.vel=w.x*axis.x+w.y*axis.y+w.z*axis.z;
      effort+=Math.abs(j.drive*j.vel);
    }
    m.effort=m.effort*.90+(effort/Math.max(1,a.physics.limbs.length))*.10;
    return m.efficiency;
  }

  // Turbo/fallback mode: the v11 proxy remains available for >12× or if Rapier cannot load.
  const maxAngle=.38+.42*g.jointFlexibility;
  let leftVel=0,rightVel=0,leftN=0,rightN=0,contactSum=0;
  for(let i=0;i<10;i++){
    const j=m.joints[i],drive=j.drive;
    const torque=drive*g.jointStrength*gain*4.0;
    j.vel+=(torque-j.vel*2.15)*dt;
    j.vel=clamp(j.vel,-3.4,3.4);
    j.angle+=j.vel*dt;
    if(j.angle>maxAngle){j.angle=maxAngle;j.vel*=-.28;}
    if(j.angle<-maxAngle){j.angle=-maxAngle;j.vel*=-.28;}
    const pivot=pivots[i];
    if(pivot){
      const side=pivot.userData.motorSide||1;
      pivot.rotation.z=side*j.angle*.72;
      pivot.rotation.x=j.angle*.28;
      j.contact=clamp(.62+Math.cos(j.angle/maxAngle*Math.PI)*.38,0,1);
      contactSum+=j.contact;
      if(side<0){leftVel+=j.vel;leftN++;}else{rightVel+=j.vel;rightN++;}
    }else j.contact=0;
    effort+=Math.abs(drive*j.vel);
  }

  let efficiency;
  if(limbCount===0){
    efficiency=.16+.42*Math.abs(out[18]??0)*(.65+Math.abs(g.bodyCurve));
  }else{
    const lv=leftN?leftVel/leftN:0,rv=rightN?rightVel/rightN:0;
    const alternating=clamp(Math.abs(lv-rv)/2.4,0,1);
    const activity=clamp((Math.abs(lv)+Math.abs(rv))/2.2,0,1);
    const support=contactSum/limbCount;
    const symmetry=1-clamp(Math.abs(Math.abs(lv)-Math.abs(rv))/2.2,0,1);
    efficiency=clamp(.10+activity*.38+alternating*.28+support*.12+symmetry*.12,.08,1.12);
  }
  m.efficiency=m.efficiency*.92+efficiency*.08;
  m.effort=m.effort*.88+(effort/Math.max(1,limbCount))*.12;
  m.jumpCooldown=Math.max(0,m.jumpCooldown-dt);

  if(m.onGround&&m.jumpCooldown<=0&&m.jumpRequest&&a.energy>12){
    m.jumpV=(1.25+2.15*g.jumpPower);
    m.onGround=false;m.jumpCooldown=1.2;m.jumps++;m.jumpRequest=false;
    a.energy=Math.max(0,a.energy-(.7+.45*g.jumpPower));
  }
  if(!m.onGround){
    m.jumpV-=6.2*dt;m.jumpY+=m.jumpV*dt;
    if(m.jumpY<=0){m.jumpY=0;m.jumpV=0;m.onGround=true;}
  }
  a.mesh.position.y=terrainHeightAt(a.mesh.position)+m.jumpY+hybridGroundLift(a);
  const supportGain=clamp(.84+.28*supportSpecialization(a),.78,1.16);
  return clamp(m.efficiency*(.72+.28*moveIntent)*supportGain,.06,1.24);
}

function averageMotorEfficiency(){
  return agents.length?agents.reduce((s,a)=>s+(a.motor?.efficiency||0),0)/agents.length:0;
}
function totalJumps(){
  return agents.reduce((s,a)=>s+(a.motor?.jumps||0),0);
}


function containerCapacity(m){return Math.max(0,m?.props?.capacity||0);}
function totalStoredWater(){return materials.reduce((s,m)=>s+(m.waterAmount||0),0);}
function containerCount(){return materials.filter(m=>containerCapacity(m)>.065).length;}
function maxWaterInObject(){
  let best=0;
  for(const m of materials)best=Math.max(best,m.waterAmount||0);
  return best;
}
function mechanismCount(){return materials.filter(m=>(m.props.mechanicalPotential||0)>.42||(m.props.rotationEfficiency||0)>.30).length;}
function updateMaterialSoftness(m){
  const st=m.props.softeningTemp||600;
  m.softness=clamp((m.temperature-st)/Math.max(70,st*.32),0,1);
}
function applyFluidAndMechanics(a,p,manipIntent,dt){
  const held=a.carrying;
  if(!held||containerCapacity(held)<=.065)return;
  const cap=containerCapacity(held);
  const rain=rainIntensity();
  if(rain>.10){
    const beforeRain=held.waterAmount||0;
    const openness=clamp(.28+(held.props.hollowPotential||0)*.42+(held.props.sealPotential||0)*.08,.20,.92);
    held.waterAmount=clamp(beforeRain+dt*.20*rain*cap*openness,0,cap);
    const carriedRainDelta=recordEnvironmentalWaterGain(held,beforeRain,'rain');
    held.waterTemp+=(18-held.waterTemp)*clamp(dt*.10*rain,0,.18);
    if(beforeRain<.006&&carriedRainDelta>.0015){
      totalRainCaptures++;
      recordDiscovery('rain:carried:first','🌦️','Primer recipiente cargado bajo lluvia','Un organismo llevaba un objeto que comenzó a retener agua durante la lluvia.',a.mesh.position);
    }
  }

  // A body does not have to enter the pond: if its reach overlaps the shoreline,
  // manipulation can physically dip the carried object into the water.
  if(canReachWater(a)&&manipIntent>.16){
    const before=held.waterAmount||0;
    const openness=clamp(.36+(held.props.hollowPotential||0)*.35+(held.props.sealPotential||0)*.14,.26,.92);
    held.waterAmount=clamp(before+dt*1.20*cap*openness,0,cap);
    const pondDelta=recordEnvironmentalWaterGain(held,before,'pond');
    held.waterTemp+=(16-held.waterTemp)*clamp(dt*.42,0,.48);
    held.wetness=clamp((held.wetness||0)+dt*.30,0,1);

    if(before<.008&&pondDelta>.0015){
      totalWaterContacts++;
      recordDiscovery('container:water:first','💧','Primer recipiente con agua','Un organismo alcanzó el agua desde la orilla con un objeto capaz de retener líquido.',a.mesh.position);
    }
  }

  if(p.m&&p.m!==held&&p.md<1.3&&held.waterAmount>.015&&manipIntent>.52){
    const amount=Math.min(held.waterAmount,dt*.13),old=p.m.temperature;
    p.m.temperature+=(held.waterTemp-p.m.temperature)*clamp(amount*1.05,0,.36);
    held.waterAmount-=amount;totalFluidTransfers+=amount;
    if(old-p.m.temperature>2.2){
      recordDiscovery('cooling:first','🫗','Primer enfriamiento con agua','Un organismo transfirió agua almacenada hacia un material caliente.',p.m.mesh.position);
    }
  }
}
function shapeAndMoveMaterial(a,m,tool,manipIntent,dt,moved){
  if(!m)return;
  updateMaterialSoftness(m);
  const rot=m.props.rotationEfficiency||0;
  if(moved>0&&rot>.16){
    const radius=Math.max(.12,(m.props.length||.5)*.30);
    const turns=moved/(Math.PI*2*radius);
    m.rotationTurns=(m.rotationTurns||0)+turns;
    m.mesh.rotation.x+=turns*Math.PI*2;
    m.mechanicalWork=(m.mechanicalWork||0)+moved*rot;
    totalMechanicalWork+=moved*rot;
    if(m.rotationTurns>1.1&&rot>.30){
      recordDiscovery('rotation:first','⚙️','Primer rodamiento útil','Un objeto con geometría favorable giró repetidamente mientras era desplazado.',m.mesh.position);
    }
  }

  const intent=Math.abs(manipIntent),grip=a.genome.body.grip||1;
  if(m.softness>.16&&intent>.45){
    const work=dt*m.softness*grip*(.4+(tool?.hardness||.3));
    m.shaping=(m.shaping||0)+work;
    m.props.roundness=clamp((m.props.roundness||0)+work*.014,0,1.3);
    m.props.length=clamp((m.props.length||.5)*(1+work*.003),.18,2.8);
    stampTechnicalTrace(a,m,clamp(.10+work*.20,.10,.45));
    if(m.shaping>1){
      m.shaping=0;totalShapingEvents++;
      stampTechnicalTrace(a,m,.65);
      recordDiscovery('shaping:first','🔨','Primer moldeado térmico','Un material caliente cambió gradualmente de forma bajo trabajo físico.',m.mesh.position);
    }
  }

  // Flexible matter can also change form through repeated pressure without heat.
  if(m.softness<=.16&&intent>.58&&(m.props.flexibility||0)>.34){
    const pressureWork=dt*intent*grip*(m.props.flexibility||0)*(.30+(tool?.hardness||.22));
    m.coldShapeWork=(m.coldShapeWork||0)+pressureWork;
    m.props.length=clamp((m.props.length||.5)*(1-pressureWork*.0018),.18,2.8);
    m.props.roundness=clamp((m.props.roundness||0)+pressureWork*.0035,0,1.3);
    if(m.coldShapeWork>.72){
      m.coldShapeWork*=.18;totalShapingEvents++;
      stampTechnicalTrace(a,m,.48);
      recordDiscovery('shaping:cold:first','🪵','Primer moldeado por presión',
        'Un material cambió gradualmente de geometría por trabajo mecánico repetido, sin una receta predefinida.',m.mesh.position);
    }
  }
}



function activitySiteStrength(obj){
  if(!obj)return 0;
  const base=obj.worksiteStrength||0;
  const age=Math.max(0,worldAge-(obj.lastWorkAt||worldAge));
  return clamp(base*Math.exp(-age/CONFIG.ACTIVITY_SITE_HALF_LIFE),0,1.6);
}
function rememberActivitySite(a,pos,value=.35){
  if(!a||!pos)return;
  storeSpatialMemory(a,'activitySite',pos,clamp(value,0,1));
}
function noteMaterialWorksite(a,m,work){
  if(!a||!m||work<=0)return;
  const old=activitySiteStrength(m);
  m.worksiteWork=(m.worksiteWork||0)+work;
  m.worksiteStrength=clamp(old+work*.18,0,1.6);
  m.lastWorkAt=worldAge;
  m.worksiteWorkers=m.worksiteWorkers||[];
  if(!m.worksiteWorkers.includes(a.id)){
    m.worksiteWorkers.push(a.id);
    if(m.worksiteWorkers.length>12)m.worksiteWorkers.shift();
  }
  rememberActivitySite(a,m.mesh.position,clamp(.18+m.worksiteStrength*.42,0,.82));
  if(m.worksiteWorkers.length>=2&&m.worksiteWork>.16){
    recordDiscovery('collective:material:first','🫱🏽‍🫲🏼','Primer esfuerzo material compartido',
      'Más de un organismo aplicó trabajo sobre el mismo objeto; la cooperación surgió de fuerzas físicas concurrentes.',m.mesh.position);
  }
}
function noteStructureWorksite(a,s,work=.12){
  if(!a||!s)return;
  const resumed=(s.lastWorkAt||0)>0&&worldAge-(s.lastWorkAt||0)>26&&(s.modifications||0)>0;
  const old=activitySiteStrength(s);
  s.worksiteWork=(s.worksiteWork||0)+work;
  s.worksiteStrength=clamp(old+work*.22,0,1.7);
  s.lastWorkAt=worldAge;
  s.worksiteWorkers=s.worksiteWorkers||[];
  if(!s.worksiteWorkers.includes(a.id)){
    s.worksiteWorkers.push(a.id);
    if(s.worksiteWorkers.length>18)s.worksiteWorkers.shift();
  }
  rememberActivitySite(a,s.group.position,clamp(.24+s.worksiteStrength*.38,0,.88));
  if(resumed){
    recordDiscovery('collective:resumed:first','🧩','Trabajo retomado',
      'Un organismo volvió a modificar una estructura después de un periodo prolongado sin actividad.',s.group.position);
  }
}
function collectiveMaterialEffort(a,m,manipIntent){
  const ownMorph=morphologyMetrics(a);
  const ownGrip=effectiveGripStrength(a);
  let vx=Math.sin(a.heading)*ownGrip*ownMorph.strength;
  let vz=Math.cos(a.heading)*ownGrip*ownMorph.strength;
  let contributors=1,helperStrength=0;
  const workerIds=[a.id];

  for(const o of agents){
    if(o===a||o.currentWorkTargetKind!=='material'||o.currentWorkTargetId!==m.id)continue;
    if((o.currentManipIntent||0)<=.24)continue;
    if(o.mesh.position.distanceTo(m.mesh.position)>CONFIG.COLLECTIVE_WORK_RADIUS)continue;
    const om=morphologyMetrics(o);
    const force=effectiveGripStrength(o)*om.strength*clamp(Math.abs(o.currentManipIntent||0),.24,1);
    vx+=Math.sin(o.heading)*force;
    vz+=Math.cos(o.heading)*force;
    helperStrength+=force;contributors++;workerIds.push(o.id);
  }

  const force=Math.hypot(vx,vz);
  const dir=force>.001?new THREE.Vector3(vx/force,0,vz/force):
    new THREE.Vector3(Math.sin(a.heading),0,Math.cos(a.heading));
  return {dir,force,contributors,helperStrength,workerIds};
}
function worksiteAttentionBonus(obj){
  const activity=activitySiteStrength(obj);
  const workers=clamp((obj?.worksiteWorkers?.length||0)/4,0,1);
  return clamp(activity*.16+workers*.06,0,.30);
}

function materialInteractionStep(a,m,manipIntent,h,t){
  if(!m)return 0;
  const g=a.genome.body;
  const tool=a.carrying?.props,toolBonus=tool?1+(tool.leverage||0)*.65+(tool.edge||0)*.12:1;
  const rolling=1+(m.props.rotationEfficiency||0)*1.35;
  const friction=clamp(.92-(m.props.rotationEfficiency||0)*.42+.12*(m.props.flexibility||0),.28,1.05);
  const collective=collectiveMaterialEffort(a,m,manipIntent);
  const mass=effectiveMaterialMass(m);
  const ownCapacity=Math.max(.10,effectiveGripStrength(a)*morphologyMetrics(a).strength);
  const combinedCapacity=Math.max(ownCapacity,collective.force);
  const loadFactor=clamp(combinedCapacity/(mass*1.05+.08),.07,1.25);
  const pushStrength=combinedCapacity*toolBonus*rolling/(mass+.2)*loadFactor;
  const dir=collective.dir;
  const before=m.mesh.position.clone();

  // Heavy objects respond to the vector sum of nearby organisms working on the same target.
  m.mesh.position.addScaledVector(dir,h*.7*pushStrength/friction);
  const moved=m.mesh.position.distanceTo(before);
  shapeAndMoveMaterial(a,m,tool,manipIntent,h,moved);
  m.placedBy=a.id;m.placedAt=worldAge;m.manipCount=(m.manipCount||0)+h;
  if(Math.abs(manipIntent)>.24){
    noteMaterialWorksite(a,m,h*Math.abs(manipIntent)*(1+.28*Math.max(0,collective.contributors-1)));
    if(collective.contributors>=2&&moved>.0008){
      for(const id of collective.workerIds){
        const w=agents.find(x=>x.id===id);
        if(w&&w!==a){
          w.rewardBuffer+=Math.min(.004,moved*.004);
          rememberActivitySite(w,m.mesh.position,.28+activitySiteStrength(m)*.18);
        }
      }
    }
  }
  if(moved>.002&&Math.abs(manipIntent)>.24){
    a.lastManipulatedMaterial=m;a.lastManipulatedAt=worldAge;
  }

  // A hard object physically dragged across terrain can leave a trace even before
  // any organism has learned a symbolic marking convention.
  const groundAbility=(m.props.hardness||0)*.46+(m.props.edge||m.props.edgePotential||0)*.54;
  if(moved>.0008&&groundAbility>.20){
    m.groundScrapeWork=(m.groundScrapeWork||0)+moved*groundAbility*(.45+Math.abs(manipIntent)*.55);
    const scrapeThreshold=.095+.11/(.30+groundAbility);
    if(m.groundScrapeWork>=scrapeThreshold&&a.markCooldown<=0){
      const mark=makeWorldMark(a,null,m.mesh.position);
      if(mark){
        m.groundScrapeWork*=.16;
        a.markCooldown=rand(2.2,5.5);
      }
    }
  }

  if(a.carrying){
    a.carrying.work=(a.carrying.work||0)+h*Math.abs(manipIntent);
    a.carrying.manipCount=(a.carrying.manipCount||0)+h;
    const tp=a.carrying.props;
    const contactWork=h*Math.abs(manipIntent)*(tp.hardness||0)*(.5+(tp.edge||tp.edgePotential||0));
    m.abrasion=(m.abrasion||0)+contactWork/Math.max(.08,m.props.abrasionResistance||.5);
    m.fracture=(m.fracture||0)+contactWork*.32/Math.max(.08,m.props.fractureResistance||.5);
    m.coldShapeWork=(m.coldShapeWork||0)+contactWork*.34;
    if(contactWork>.001)stampTechnicalTrace(a,m,clamp(.08+contactWork*.35,.08,.36));

    if(m.abrasion>.7){
      m.abrasion=0;
      m.props.edgePotential=clamp((m.props.edgePotential||0)+.04*(tp.hardness||0),0,1.4);
      m.props.hardness=clamp((m.props.hardness||0)+.012,0,1.35);
      m.props.roundness=clamp((m.props.roundness||0)-.018,0,1.3);
      totalShapingEvents++;a.materialDiscoveries++;
      stampTechnicalTrace(a,m,.58);
      recordDiscovery('shaping:abrasion:first','🪨','Primer moldeado por abrasión',
        'El desgaste repetido cambió el borde y la forma de un material.',m.mesh.position);
    }
    if(m.fracture>1.25){
      m.fracture=.15;
      m.props.mass=Math.max(.12,m.props.mass*.86);
      m.props.length=Math.max(.22,m.props.length*.88);
      m.props.edgePotential=clamp((m.props.edgePotential||0)+.10,0,1.4);
      m.props.durability=Math.max(.08,m.props.durability*.90);
      totalShapingEvents++;stampTechnicalTrace(a,m,.72);
      a.rewardBuffer+=.008*t.curiosity;
      recordDiscovery('shaping:fracture:first','🧱','Primer moldeado por fractura',
        'Una fractura controlada produjo una geometría distinta que quedó disponible para usos posteriores.',m.mesh.position);
    }
  }
  return moved;
}
function runLocalInteractionMicrophysics(a,p,manipIntent,dt,t){
  if(!p.m)return 0;
  const maxStep=rigidModeActive?.032:.016;
  const steps=clamp(Math.ceil(dt/maxStep),1,10);
  const h=dt/steps;let moved=0;
  for(let i=0;i<steps;i++)moved+=materialInteractionStep(a,p.m,manipIntent,h,t);
  return moved;
}

function updateAgent(a,dt){
  if(!agents.includes(a))return;
  const g=a.genome.body,t=a.genome.temperament;
  a.age+=dt;a.reproCooldown=Math.max(0,a.reproCooldown-dt);
  a.attackCooldown=Math.max(0,a.attackCooldown-dt);a.affiliateCooldown=Math.max(0,a.affiliateCooldown-dt);
  rememberVisit(a);

  const p=buildPerception(a);
  updateTechnicalSense(a,p,dt);
  observeLanguage(a,p,dt);
  observeExternalMark(a,p,dt);
  if(p.mVisible&&p.m&&p.md<4.2)observeTechnicalTrace(a,p.m,dt,.75);
  if(p.sVisible&&p.st&&p.sd<4.8)observeStructureTradition(a,p.st,dt);
  processNerveSignals(a);
  updateAffect(a,p.nVisible?p.n:null,p.mem,dt);
  evaluateNavigationProgress(a,dt);
  decaySocialMemories(a,dt);
  if(p.nVisible&&p.n&&p.mem)updateSocialFamiliarity(a,p.n,p.mem,dt,p.nd);
  const inputs=decisionInputs(a,p);
  const out=brainStep(a,inputs);
  applyMotorTechnique(a,out);
  recordMotorCulture(a,out,dt);

  a.currentManipIntent=out[13]??0;
  a.currentWorkTargetId=null;a.currentWorkTargetKind=null;
  if(Math.abs(a.currentManipIntent)>.20){
    if(p.mVisible&&p.m){a.currentWorkTargetId=p.m.id;a.currentWorkTargetKind='material';}
    else if(p.sVisible&&p.st){a.currentWorkTargetId=p.st.id;a.currentWorkTargetKind='structure';}
  }

  a.decision.timer-=dt;
  if(a.decision.timer<=0){
    const intrinsic=updatePredictiveWorldModel(a,p);
    a.rewardBuffer+=intrinsic;
    const nextContext=contextKey(a,p.mem);
    updateActionModel(a,clamp(a.rewardBuffer,-1,1),nextContext);
    reinforceLanguage(a,clamp(a.rewardBuffer,-1,1),p);
    reinforceExternalMemory(a,clamp(a.rewardBuffer,-1,1));
    reinforceMotorTechnique(a,clamp(a.rewardBuffer,-1,1));
    updateProcedureMemory(a,p,clamp(a.rewardBuffer,-1,1));
    applyPlasticity(a,clamp(a.rewardBuffer,-1,1));
    a.lastReward=clamp(a.rewardBuffer,-1,1);a.rewardBuffer=0;
    chooseDecision(a,p,out);
  }

  if(a.decision.mode===2&&a.decision.targetEntityId!=null){
    const socialTarget=agents.find(x=>x.id===a.decision.targetEntityId);
    if(socialTarget){
      a.decision.target=socialApproachPoint(a,socialTarget);
    }else{
      a.decision.targetEntityId=null;a.decision.timer=0;
    }
  }

  recordNavigationPath(a,dt);

  if(a.decision.target){
    a.nav.waypointTimer=(a.nav.waypointTimer||0)-dt;
    const oldWp=a.nav.lastWaypoint;
    if(!oldWp||a.nav.waypointTimer<=0||a.nav.loopScore>.55){
      const wp=chooseLocalWaypoint(a,a.decision.target);
      a.nav.lastWaypoint=wp?{x:wp.x,z:wp.z}:null;
      a.nav.waypointTimer=.18;
    }
    const wp=a.nav.lastWaypoint?new THREE.Vector3(a.nav.lastWaypoint.x,0,a.nav.lastWaypoint.z):a.decision.target;
    a.targetHeading=angleTo(a,wp);
  }
  let diff=a.targetHeading-a.heading;
  while(diff>Math.PI)diff-=Math.PI*2;while(diff<-Math.PI)diff+=Math.PI*2;

  // Dead zone + angular inertia: removes the endless tight-circle failure mode.
  const dead=.055;
  const turnRate=g.turn*(1+.28*clamp(Math.abs(diff)/Math.PI,0,1));
  const turnCmd=Math.abs(diff)<dead?0:Math.sign(diff)*Math.min(Math.abs(diff),turnRate*dt);
  a.heading+=turnCmd;
  if(!rigidModeActive||!a.physics)a.mesh.rotation.y=a.heading;

  const morph=morphologyMetrics(a);
  const moveIntent=sigmoid(out[8]);
  const motorPropulsion=updateEmbodiedMotor(a,out,dt,moveIntent);
  let speed=rigidModeActive&&a.physics
    ?physicsVelocity(a)
    :moveIntent*g.speed*morph.agility*morph.endurance*motorPropulsion;

  if(!rigidModeActive||!a.physics){
    const alignment=navigationAlignmentFactor(diff);
    speed*=alignment;
    speed*=terrainMovementFactor(a.mesh.position)*terrainTravelFactor(a);
    if(Math.abs(diff)>.80&&speed>.08)a.rewardBuffer-=dt*speed*.0015;

    if(a.decision.target){
      const d=Math.hypot(
        a.mesh.position.x-a.decision.target.x,
        a.mesh.position.z-a.decision.target.z
      );
      if(d<.52)speed=0;
      else if(d<1.20)speed*=clamp((d-.45)/.75,.10,1);
    }
    if(a.decision.mode===0)speed*=.20+.24*t.persistence;
    if(a.affect.fear>.65&&a.decision.mode===7)speed*=1.15;

    let loadPenalty=1;
    if(a.carrying){
      const heldMass=effectiveMaterialMass(a.carrying);
      const gripNow=effectiveGripStrength(a);
      loadPenalty=clamp(1-heldMass/(gripNow*4),.30,1);
      queueNerveSignal(a,'pressure',clamp(heldMass/Math.max(.5,gripNow*3.2),0,1),3,.02);
    }
    const oldX=a.mesh.position.x,oldZ=a.mesh.position.z;
    a.mesh.position.x+=Math.sin(a.heading)*speed*loadPenalty*dt;
    a.mesh.position.z+=Math.cos(a.heading)*speed*loadPenalty*dt;
    const moved=Math.hypot(a.mesh.position.x-oldX,a.mesh.position.z-oldZ);
    a.motor.distance+=moved;
    a.mesh.position.y=terrainHeightAt(a.mesh.position)+a.motor.jumpY+hybridGroundLift(a);
    markTerrainTraffic(a,moved);
    // Movement itself is not rewarded; only reducing distance to the chosen goal is.
  }else{
    // Rigid-mode progress is evaluated on the next cognitive tick.
    const physicalSpeed=physicsVelocity(a);
    if(a.decision.target&&physicalSpeed>.015&&Math.abs(diff)>1.20){
      a.rewardBuffer-=dt*physicalSpeed*.0008;
    }
  }

  a.rewardBuffer-=dt*a.motor.effort*.0007;
  emitBodyContactSignals(a,p,speed);
  maybeTriggerReflex(a);

  const r=Math.hypot(a.mesh.position.x,a.mesh.position.z);
  if(r>CONFIG.WORLD-.4){
    queueNerveSignal(a,'pain',.16,1,.01);
    a.targetHeading=Math.atan2(-a.mesh.position.x,-a.mesh.position.z);a.decision.timer=0;
    if(rigidModeActive&&a.physics){
      const inward=new THREE.Vector3(-a.mesh.position.x,0,-a.mesh.position.z).normalize();
      a.physics.torso.applyImpulse({x:inward.x*.10,y:0,z:inward.z*.10},true);
    }else{
      const s=(CONFIG.WORLD-.6)/r;a.mesh.position.x*=s;a.mesh.position.z*=s;
    }
  }

  // Sound genes + neural control. Amplitude intentionally has a floor so calls are audible.
  a.signal[0]=out[14]*g.voice;
  a.signal[1]=out[15]*g.voice;
  a.signal[2]=out[16]*g.voice;
  a.sound.freq=clamp(g.pitchBase+a.signal[0]*g.pitchRange*(1+a.affect.arousal*.25),90,1500);
  a.sound.amp=clamp(.12+.88*sigmoid(out[15])*(.6+.4*a.affect.arousal),.08,1);
  a.sound.pulse=clamp(sigmoid(out[16]),.05,1);
  shapeVocalization(a,p);

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
  const substrateEffort=(1/terrainMovementFactor(a.mesh.position))*terrainEffortMultiplier(a);
  const moveCost=(speed/Math.max(.4,g.speed))*CONFIG.MOVE_COST*(.78+morph2.mass*.16)*substrateEffort;
  const carryCost=a.carrying?effectiveMaterialMass(a.carrying)*.045/Math.max(.45,morph2.strength):0;
  const brainNeurons=a.hidden.length;
  const cognition=a.genome.cognition||{planningDepth:2};
  const activeConnections=a.genome.brain.activeConnections??countBrainConnections(a.genome.brain);
  const brainCost=brainNeurons*.00027 + activeConnections*.0000025 + cognition.planningDepth*.00135;
  const nerveCost=(g.tactileDensity+g.nociception+g.proprioception+g.interoception)*.0018;
  const limbTissueCost=(g.limbPairs||0)*.0018*(.72+(g.limbDifferentiation||0)*.28);
  const tissueCost=morph2.mass*.010 + a.phenotype.muscle*.007*g.musclePotential+limbTissueCost;
  const juvenileFrac=clamp(a.age/CONFIG.JUVENILE_END,0,1);
  const youthCostFactor=a.age<CONFIG.JUVENILE_END ? (.54+.46*juvenileFrac) : 1;
  const basal=(CONFIG.BASE_METABOLISM*(.72+g.size*.28+g.segments*.03)+brainCost+nerveCost+tissueCost)*youthCostFactor;
  const motorCost=(a.motor?.effort||0)*.0065*g.jointStrength;
  a.energy-=dt*(basal+moveCost*youthCostFactor+carryCost+motorCost+(inPond(a.mesh.position)?CONFIG.WATER_DRAIN*(.22+.78*clamp(speed/Math.max(.4,g.speed),0,1.4)):0))*shelter;

  // Curiosity reward: discovering under-visited space is intrinsically useful.
  const novelty=noveltyAt(a,a.mesh.position);
  a.rewardBuffer+=dt*novelty*.012*t.curiosity*t.exploration*clamp((a.energy-24)/42,.12,1);

  const hungerDrive=clamp(1-a.energy/CONFIG.MAX_ENERGY,0,1);
  const ingestDrive=out[9] + hungerDrive*1.28;
  const contactFeedingReflex=a.energy<67&&hungerDrive>.32;
  if(p.f&&p.fd<CONFIG.BITE_RADIUS*g.size&&(contactFeedingReflex||ingestDrive>-.08)){
    const before=a.energy;
    a.energy=clamp(a.energy+p.f.energy*sunFactor,0,CONFIG.MAX_ENERGY);
    const idx=food.indexOf(p.f);if(idx>=0)food.splice(idx,1);
    foodGroup.remove(p.f.mesh);p.f.mesh.geometry.dispose();p.f.mesh.material.dispose();
    const gain=a.energy-before;
    a.foodEaten++;mealEvents.push(worldAge);
    const eatenCell=livingCellAt(a.mesh.position);if(eatenCell)eatenCell.biomass=Math.max(0,eatenCell.biomass-.012);
    a.energyGained+=Math.max(0,gain);
    a.rewardBuffer+=gain*.045;
    queueNerveSignal(a,'touch',.35,0,.01);
    storeSpatialMemory(a,'food',a.mesh.position,a.energy<62?.96:.85);
    a.affect.valence=clamp(a.affect.valence+.06,-1,1);
    if(a.decision.mode===1)a.decision.timer=0;
  }

  if(p.nVisible&&p.mem){
    p.mem.meetings+=dt;
    for(let i=0;i<3;i++)p.mem.signal[i]=p.mem.signal[i]*.96+p.n.signal[i]*.04;
    p.mem.pitch=p.mem.pitch*.96+(p.n.sound.freq/1400)*.04;
    observeNeighbor(a,p.n,dt);
    imitateProcedure(a,p.n,dt);
    const socialKin=kinshipScore(a,p.n),socialRep=reputationScore(a,p.n),socialAff=p.mem?.affinity||0;
    if(p.nd<3.0&&(socialKin>.15||socialRep>.05||socialAff>.16)&&Math.random()<1-Math.exp(-dt*.025))rememberSocialHub(a,p.n,.24);
    maybeTransferResources(a,p,dt);
  }

  if(p.nVisible&&p.nd<CONFIG.CONTACT_RADIUS*g.size&&agents.includes(p.n)){
    const affiliateIntent=sigmoid(out[10]+t.sociability*.25+t.attachment*.20+a.affect.attachment*.20-a.affect.fear*.3);
    const socialBond=Math.max(0,socialBondScore(a,p.n));
    const socialKin=kinshipScore(a,p.n);
    const attackIntent=sigmoid(out[11]+t.aggression*.34+a.affect.anger*.42+a.affect.arousal*.15-
      (p.mem?.affinity||0)*.34-(p.mem?.trust||0)*.28-socialBond*.40-socialKin*.16-sigmoid(out[17])*.3);
    if(attackIntent>.70&&attackIntent>affiliateIntent+.08)attack(a,p.n,attackIntent);
    else if(affiliateIntent>.64)affiliate(a,p.n);
  }

  const manipIntent=out[13],manipRadius=CONFIG.MANIP_RADIUS*effectiveManipReach(a);
  if(manipIntent>.28){
    if(!a.carrying&&p.m&&p.md<manipRadius){
      if(pickUpMaterial(a,p.m))a.rewardBuffer+=.02;
    }else if(p.m&&p.md<manipRadius*1.45){
      const moved=runLocalInteractionMicrophysics(a,p,manipIntent,dt,t);
      a.rewardBuffer+=Math.min(.006,moved*.012)*t.curiosity;
    }
  }else if(manipIntent<-.28&&a.carrying)dropMaterial(a);

  a.markCooldown=Math.max(0,a.markCooldown-dt);
  if(a.carrying&&manipIntent>.52&&a.markCooldown<=0){
    const tool=a.carrying.props,markAbility=(tool.hardness||0)*.40+(tool.edge||tool.edgePotential||0)*.60;
    const scene=sceneCode(a,p),known=a.externalMemory.production.get(scene);
    const learnedBoost=known?.q>.015?1.75:1;
    const pressure=markAbility*Math.abs(manipIntent)*effectiveGripStrength(a);
    if(markAbility>.26&&Math.random()<1-Math.exp(-dt*.34*pressure*learnedBoost)){
      const mark=makeWorldMark(a,known?.q>.015?known.pattern:null);
      if(mark){
        a.externalMemory.lastProduced=mark.pattern;a.externalMemory.lastScene=scene;
        a.markCooldown=rand(1.1,3.0);
      }
    }
  }
  maybeLeaveSurfaceTrace(a,p,manipIntent,dt,speed);
  applyFluidAndMechanics(a,p,manipIntent,dt);
  updateCarriedMaterial(a);

  if(a.carrying&&a.carrying.temperature>75){
    const hot=clamp((a.carrying.temperature-70)/280,0,1);queueNerveSignal(a,'temperature',hot,3,.01);if(hot>.45){a.health-=dt*hot*.18;a.rewardBuffer-=dt*hot*.008;}
  }

  if(a.carrying&&a.carrying.type==='biomass'&&out[9]>.58&&a.energy<90){
    a.energy=clamp(a.energy+a.carrying.props.energy*2,0,CONFIG.MAX_ENERGY);
    const mm=a.carrying;a.carrying=null;a.mesh.remove(mm.mesh);mm.mesh.geometry.dispose();mm.mesh.material.dispose();
    const idx=materials.indexOf(mm);if(idx>=0)materials.splice(idx,1);
    a.rewardBuffer+=.10;
  }

  // Reproduction now requires two nearby fertile organisms and recombines both genomes.
  if(isFertile(a) && agents.length+embryos.length<CONFIG.MAX_AGENTS+CONFIG.EMBRYO_MAX){
    const mate=chooseMate(a,2.4);
    if(mate){
      const ea=clamp((a.energy-CONFIG.REPRO_MIN_ENERGY)/(CONFIG.MAX_ENERGY-CONFIG.REPRO_MIN_ENERGY),0,1);
      const eb=clamp((mate.energy-CONFIG.REPRO_MIN_ENERGY)/(CONFIG.MAX_ENERGY-CONFIG.REPRO_MIN_ENERGY),0,1);
      const density=agents.length/CONFIG.MAX_AGENTS;
      const demo=recentDemography();
      const resourcePerCapita=food.length/Math.max(1,agents.length);
      const resourceSupport=clamp(resourcePerCapita/3.2,.38,1.28);
      const ecology=clamp((1.42-density*1.08)*(.72+.28*resourceSupport),.18,1.52);
      const fertileNow=fertilePopulation();
      const lowBoost=agents.length<12?2.65:agents.length<30?1.72:agents.length<60?1.18:1;
      const fertilityScarcity=fertileNow<4?1.24:fertileNow<8?1.10:1;
      const replacementPressure=clamp((demo.deaths-demo.births)/10,-.25,.45);
      const energyReserve=clamp((Math.min(a.energy,mate.energy)-CONFIG.REPRO_MIN_ENERGY)/28,0,1);
      const compatibility=clamp(mateCompatibility(a,mate)+.18,.12,1.35);
      const fertilityRate=.034*(.16+.42*ea+.42*eb)*(.62+.38*energyReserve)*ecology*
        lowBoost*fertilityScarcity*(1+replacementPressure)*compatibility;

      if(Math.random()<1-Math.exp(-dt*fertilityRate)){
        const cost=CONFIG.REPRO_COST*clamp(.54+.10/resourceSupport,.54,.72);
        a.energy=Math.max(31,a.energy-cost);mate.energy=Math.max(31,mate.energy-cost*.82);
        a.reproCooldown=CONFIG.REPRO_COOLDOWN*rand(.9,1.18);mate.reproCooldown=CONFIG.REPRO_COOLDOWN*rand(.9,1.18);

        const childGenome=recombineGenome(a.genome,mate.genome);
        const generation=Math.max(a.generation,mate.generation)+1;
        const lineage=Math.random()<.5?a.lineage:mate.lineage;
        const pos=a.mesh.position.clone().lerp(mate.mesh.position,.5);
        pos.x+=rand(-.7,.7);pos.z+=rand(-.7,.7);

        if(Math.random()<clamp(.16+(agents.length<24?.12:0),.12,.36)){
          const e=createEmbryo(a,childGenome,pos,generation,lineage);
          if(e){e.parentIds=[a.id,mate.id];e.parentalReserve=clamp((a.energy+mate.energy)/(2*CONFIG.MAX_ENERGY),.35,.95);e.languageSeed=[...exportLanguageSeed(a),...exportLanguageSeed(mate)].slice(0,6);e.motorSeed=[...exportMotorCulture(a),...exportMotorCulture(mate)].slice(0,4);e.procedureSeed=[...exportProcedures(a),...exportProcedures(mate)].slice(0,5);}
        }else{
          const child=makeAgent(childGenome,pos,generation,lineage,{parentIds:[a.id,mate.id]});
          if(child){
            const parentalReserve=clamp((a.energy+mate.energy)/(2*CONFIG.MAX_ENERGY),.35,.95);
            child.energy=clamp(CONFIG.START_ENERGY*(.90+.18*parentalReserve),50,66);child.phenotype.growth=.22+rand(0,.08);
            importLanguageSeed(child,[...exportLanguageSeed(a),...exportLanguageSeed(mate)].slice(0,6),.62);
            importMotorCulture(child,[...exportMotorCulture(a),...exportMotorCulture(mate)].slice(0,4),.55);
            importProcedures(child,[...exportProcedures(a),...exportProcedures(mate)].slice(0,5),.50);
            applyMorphologyVisual(child);
          }
        }
        a.children++;mate.children++;
        a.mateHistory.set(mate.id,(a.mateHistory.get(mate.id)||0)+1);
        mate.mateHistory.set(a.id,(mate.mateHistory.get(a.id)||0)+1);
        const am=memoryFor(a,mate),mm=memoryFor(mate,a);
        am.affinity=clamp(am.affinity+.035,-1,1);am.trust=clamp(am.trust+.025,-1,1);
        mm.affinity=clamp(mm.affinity+.035,-1,1);mm.trust=clamp(mm.trust+.025,-1,1);
        totalMateEvents++;matingEventTimes.push(worldAge);rememberSocialHub(a,mate,.78);a.rewardBuffer+=.035;mate.rewardBuffer+=.025;
      }
    }
  }

  if(a.energy>58&&a.affect.arousal<.45&&a.affect.fear<.35){
    a.health=clamp(a.health+dt*.18,0,CONFIG.MAX_HEALTH);a.energy=Math.max(0,a.energy-dt*.045);
  }

  const energyDelta=a.energy-a.lastEnergy,healthDelta=a.health-a.lastHealth;
  a.rewardBuffer+=energyDelta*.012+healthDelta*.02+a.affect.valence*.0008;
  a.lastEnergy=a.energy;a.lastHealth=a.health;

  if(a.energy<=0||a.health<=0||a.age>individualMaxAge(a))removeAgent(a);
}

function updateFood(dt){
  const emptyFrac=1-food.length/CONFIG.FOOD_MAX;
  const ecologicalRecovery=.55+1.35*clamp(emptyFrac,0,1);
  const env= livingWorldMetrics();
  const ecologyFactor=.58+.82*env.vegetation;
  if(food.length<CONFIG.FOOD_MAX&&Math.random()<dt*CONFIG.FOOD_RESPAWN*sunFactor*ecologicalRecovery*seasonProductivity()*ecologyFactor){
    const p=randomEcologicalFoodPos();makeFood(p);
    const c=livingCellAt(p);if(c)c.biomass=Math.max(0,c.biomass-.006);
  }
  for(const m of materials){
    if(m.carriedBy||m.type!=='biomass')continue;
    if(inPond(m.mesh.position)&&Math.random()<dt*.014*sunFactor*m.props.fertility){
      const p=m.mesh.position.clone();p.x+=rand(-.55,.55);p.z+=rand(-.55,.55);makeFood(p,rand(4,7));
    }
  }
}
function updateMaterials(dt){
  runWorldRecycling();
  if(materials.length<CONFIG.MATERIAL_MAX&&Math.random()<dt*CONFIG.MATERIAL_RESPAWN)makeMaterial();
  updateThermodynamics(dt);updateFireVisuals();updateWorldMarks(dt);
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
function averageConnections(){
  return agents.length?agents.reduce((s,a)=>s+(a.genome.brain.activeConnections??countBrainConnections(a.genome.brain)),0)/agents.length:0;
}
function topologyDiversity(){
  const sig=new Set();
  for(const a of agents){const b=a.genome.brain,c=b.activeConnections??countBrainConnections(b);sig.add(`${b.bias1.length}:${Math.round(c/100)}`);}
  return sig.size;
}
function averageDevelopment(){
  return agents.length?agents.reduce((s,a)=>s+(a.phenotype.developmentPhase||0),0)/agents.length:0;
}
function averageMorphValue(key){
  return agents.length?(agents.reduce((s,a)=>s+(a.phenotype?.[key]||0),0)/agents.length):0;
}
function averageBodyMass(){
  return agents.length?(agents.reduce((s,a)=>s+morphologyMetrics(a).mass,0)/agents.length):0;
}


function demographicSnapshot(){
  const d=recentDemography();
  return {
    ...d,
    avgAge:averageAge(),
    fertile:fertilePopulation(),
    embryos:embryos.length,
    archive:genomeArchive.length
  };
}

function updateHUD(){
  const [positive,rivals]=countBonds();
  document.getElementById('pop').textContent=agents.length;
  document.getElementById('gen').textContent=agents.length?Math.max(...agents.map(a=>a.generation)):0;
  document.getElementById('births').textContent=naturalBirths;
  document.getElementById('deaths').textContent=deaths;
  document.getElementById('age').textContent=worldAge.toFixed(1);
  document.getElementById('food').textContent=food.length;
  document.getElementById('materials').textContent=materials.length;
  document.getElementById('structures').textContent=structures.length;
  const settlement=settlementMetrics(),languagePop=languagePopulationMetrics();
  document.getElementById('artifacts').textContent=artifactCount();
  document.getElementById('settlementSize').textContent=settlement.largest;
  document.getElementById('technologyIndex').textContent=materialTechnologyIndex().toFixed(1);
  document.getElementById('activeCombustions').textContent=activeCombustionCount();
  document.getElementById('thermalTransforms').textContent=totalThermalTransforms;
  document.getElementById('worldMarks').textContent=worldMarks.length;
  document.getElementById('sharedMarks').textContent=sharedExternalSymbols();
  document.getElementById('motorTechniques').textContent=motorTechniqueCount();
  document.getElementById('motorImitations').textContent=totalMotorImitations;
  document.getElementById('activePairs').textContent=totalMateEvents;
  document.getElementById('recentTransfers').textContent=recentTransferCount();
  document.getElementById('reciprocityScore').textContent=averageReciprocity().toFixed(2);
  const currentSocialGroups=socialGroupCount();
  document.getElementById('socialGroups').textContent=currentSocialGroups;
  if(currentSocialGroups>0)recordDiscovery('social:group:first','👥','Primer grupo social persistente','Tres o más individuos forman una red local de parentesco, afinidad o reputación positiva.');
  document.getElementById('regionalTrade').textContent=totalRegionalTrade;
  document.getElementById('seasonLabel').textContent=seasonPhase().name;
  document.getElementById('storedWater').textContent=totalStoredWater().toFixed(2);
  document.getElementById('containers').textContent=containerCount();
  document.getElementById('mechanisms').textContent=mechanismCount();
  document.getElementById('shapingEvents').textContent=totalShapingEvents;
  document.getElementById('procedures').textContent=procedureCount();
  document.getElementById('procedureCopies').textContent=totalProcedureCopies;
  document.getElementById('techProcedures').textContent=technicalProcedureCount();
  document.getElementById('waterContainers').textContent=materials.filter(m=>(m.waterAmount||0)>.02).length;
  document.getElementById('socialHubs').textContent=socialHubCount();
  document.getElementById('reciprocalLinks').textContent=reciprocalLinkCount();
  document.getElementById('waterContacts').textContent=totalWaterContacts;
  document.getElementById('maxWaterFill').textContent=maxWaterInObject().toFixed(3);
  document.getElementById('rainState').textContent=rainLabel();
  const envMetrics=livingWorldMetrics();
  document.getElementById('dayState').textContent=dayStateLabel();
  document.getElementById('daylightLevel').textContent=daylightLevel().toFixed(2);
  const observerStateEl=document.getElementById('observerVisionState');
  if(observerStateEl)observerStateEl.textContent=observerVision?'ON':'OFF';
  document.getElementById('soilMoisture').textContent=envMetrics.moisture.toFixed(2);
  document.getElementById('saturatedSoil').textContent=`${Math.round(envMetrics.saturated*100)}%`;
  document.getElementById('vegetationCover').textContent=`${Math.round(envMetrics.vegetation*100)}%`;
  document.getElementById('surfaceWaterMetric').textContent=envMetrics.water.toFixed(2);
  document.getElementById('compactedSoil').textContent=`${Math.round(envMetrics.compacted*100)}%`;
  const relief=terrainReliefMetrics();
  document.getElementById('maxTerrainHeight').textContent=relief.max.toFixed(1);
  document.getElementById('avgTerrainSlope').textContent=relief.avgSlope.toFixed(2);
  document.getElementById('rainCaptures').textContent=totalRainCaptures;
  document.getElementById('sharedTokens').textContent=languagePop.shared;
  document.getElementById('dialects').textContent=languagePop.dialects;
  document.getElementById('languageScore').textContent=languagePop.score.toFixed(2);
  document.getElementById('memories').textContent=totalMemories();
  document.getElementById('cells').textContent=totalCells();
  document.getElementById('positiveBonds').textContent=positive;
  document.getElementById('rivalries').textContent=rivals;
  document.getElementById('mentalSims').textContent=Math.round(totalMentalSims);
  document.getElementById('sequences').textContent=totalSequences();
  document.getElementById('imitations').textContent=Math.round(totalImitations);
  document.getElementById('avgNeurons').textContent=averageNeurons().toFixed(1);
  document.getElementById('avgConnections').textContent=Math.round(averageConnections());
  document.getElementById('topologyDiversity').textContent=topologyDiversity();
  document.getElementById('predictionError').textContent=averagePredictionError().toFixed(3);
  document.getElementById('avgDevelopment').textContent=averageDevelopment().toFixed(2);
  document.getElementById('originCount').textContent=originCount;
  document.getElementById('lineageState').textContent=agents.length?'vivo':(embryos.length?'dormante':'recolonizando');
  document.getElementById('avgMuscle').textContent=averageMorphValue('muscle').toFixed(2);
  document.getElementById('avgFat').textContent=averageMorphValue('fat').toFixed(2);
  document.getElementById('avgBody').textContent=averageBodyMass().toFixed(2);
  document.getElementById('skinPatterns').textContent=uniqueSkinPatterns();
  document.getElementById('avgCurve').textContent=averageCurve().toFixed(2);
  document.getElementById('avgAxialPosture').textContent=averageBodyPlanGene('axialPosture').toFixed(2);
  document.getElementById('avgLimbDifferentiation').textContent=averageBodyPlanGene('limbDifferentiation').toFixed(2);
  document.getElementById('avgManipulatorSpecialization').textContent=averageManipulatorSpecialization().toFixed(2);
  document.getElementById('avgSupportSpecialization').textContent=averageSupportSpecialization().toFixed(2);
  document.getElementById('touchCount').textContent=Math.round(totalTouchSignals);
  document.getElementById('avgPain').textContent=averagePain().toFixed(2);
  document.getElementById('reflexCount').textContent=Math.round(totalReflexes);
  document.getElementById('terrainRecoveries').textContent=totalTerrainRecoveries;
  const demo=demographicSnapshot();
  document.getElementById('recentBirths').textContent=demo.births;
  document.getElementById('recentDeaths').textContent=demo.deaths;
  document.getElementById('popBalance').textContent=(demo.balance>=0?'+':'')+demo.balance;
  document.getElementById('avgAge').textContent=demo.avgAge.toFixed(1);
  document.getElementById('fertileCount').textContent=demo.fertile;
  document.getElementById('embryoCount').textContent=demo.embryos;
  document.getElementById('archiveCount').textContent=demo.archive;
  document.getElementById('recolonizations').textContent=recolonizations;
  document.getElementById('demographicRisk').textContent=demographicRiskLabel();
  pruneMealEvents();
  document.getElementById('avgEnergy').textContent=averageEnergy().toFixed(1);
  document.getElementById('avgHealth').textContent=averageHealth().toFixed(1);
  document.getElementById('recentMeals').textContent=mealEvents.length;
  document.getElementById('rescueState').textContent=demographicRescueActive?'activo':'inactivo';
  pruneRescueEvents();pruneDemographicDiagnosticEvents();
  document.getElementById('rescueInsertions').textContent=rescueInsertions;
  document.getElementById('recentRescues').textContent=rescueEpisodeEvents.length;
  document.getElementById('rescueEpisodesTotal').textContent=totalRescueEpisodes;
  document.getElementById('rescuePopulationEpisodes').textContent=rescuePopulationEpisodes;
  document.getElementById('rescueFertilityEpisodes').textContent=rescueFertilityEpisodes;
  document.getElementById('rescueLoadEpisodes').textContent=rescueLoadEpisodes;
  document.getElementById('lastRescueReason').textContent=lastRescueReason||'—';
  const fertileMetrics=currentFertilePairMetrics(2.4);
  document.getElementById('fertilePairsNearby').textContent=fertileMetrics.pairs;
  document.getElementById('fertileNearestDistance').textContent=Number.isFinite(fertileMetrics.avgNearest)?fertileMetrics.avgNearest.toFixed(2):'—';
  document.getElementById('isolatedFertile').textContent=fertileMetrics.isolated;
  document.getElementById('fertileEncountersRecent').textContent=fertileEncounterEvents.length;
  document.getElementById('matingEventsRecent').textContent=matingEventTimes.length;
  document.getElementById('energyBlockedAdults').textContent=energyBlockedAdults();
  document.getElementById('cooldownBlockedAdults').textContent=cooldownBlockedAdults();
  const gap=timeSinceNaturalBirth();document.getElementById('birthGap').textContent=Number.isFinite(gap)?gap.toFixed(1):'sin nacimientos';
  document.getElementById('newWaterAcquired').textContent=totalEnvironmentalWaterAcquired.toFixed(3);
  document.getElementById('inheritedWater').textContent=inheritedWaterAtLoad.toFixed(3);
  const langMilestone=languagePopulationMetrics();
  if(langMilestone.shared>0)recordDiscovery('language:shared:first','🔊','Primera convención vocal compartida',`${langMilestone.shared} símbolo(s) son reconocidos por más de un individuo.`);
  if(sharedExternalSymbols()>0)recordDiscovery('marks:shared:first','✎','Primer símbolo externo compartido',`Una marca persistente ya es reconocida por varios organismos.`);
  const settlementMilestone=settlementMetrics().largest;
  if(settlementMilestone>=3)recordDiscovery('settlement:3','🏘️','Primer núcleo construido',`Tres o más estructuras forman un mismo núcleo espacial.`);
  if(settlementMilestone>=10)recordDiscovery('settlement:10','🏙️','Asentamiento en expansión',`El mayor núcleo alcanzó al menos 10 estructuras.`);
  document.getElementById('motorEfficiency').textContent=averageMotorEfficiency().toFixed(2);
  document.getElementById('jumpCount').textContent=totalJumps();
  const persist=document.getElementById('persistState');
  if(persist&&!persistenceReady&&persist.textContent==='iniciando…')persist.textContent='solo sesión';
  const saveEl=document.getElementById('lastSave');if(saveEl)saveEl.textContent=lastSavedAt?`${Math.max(0,Math.round((Date.now()-lastSavedAt)/1000))} s`:'—';
  const offEl=document.getElementById('offlineAdvance');if(offEl)offEl.textContent=lastOfflineSeconds<60?`${Math.round(lastOfflineSeconds)} s`:`${(lastOfflineSeconds/60).toFixed(1)} min`;
  const physicsEl=document.getElementById('physicsState');
  if(physicsEl)physicsEl.textContent=!physicsEnabled?'respaldo':(rigidModeActive?'Rapier · rígida':'turbo híbrido + microfísica');
  const rbEl=document.getElementById('rigidBodyCount');if(rbEl)rbEl.textContent=rigidBodyCount();
  const pcEl=document.getElementById('physicalContacts');if(pcEl)pcEl.textContent=totalPhysicalContacts;
  if(engineVersionEl) engineVersionEl.textContent=ENGINE_VERSION;
  if(renderStatusEl){
    const ok=renderer && renderer.domElement && renderer.domElement.width>0 && renderer.domElement.height>0;
    renderStatusEl.textContent=graphicsAvailable?(ok?`activo · ${agents.length} seres`:'sin canvas'):'auditoría sin gráficos';
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
Hijos producidos: ${a.children}
Alimentos consumidos: ${a.foodEaten}
Fértil ahora: ${isFertile(a)?'sí':'no'}
Puntaje evolutivo: ${fitnessScore(a).toFixed(1)}

CUERPO DINÁMICO
Fase de desarrollo: ${(a.phenotype.developmentPhase||0).toFixed(2)}
Madurez de extremidades: ${(a.phenotype.devLimb||0).toFixed(2)}
Madurez sensorial: ${(a.phenotype.devSensor||0).toFixed(2)}
Madurez neural: ${(a.phenotype.devNeural||0).toFixed(2)}
Adaptación anchura: ${(a.phenotype.devWidthBias||0).toFixed(3)}
Adaptación altura: ${(a.phenotype.devHeightBias||0).toFixed(3)}
Adaptación extremidades: ${(a.phenotype.devLimbBias||0).toFixed(3)}
Estrés del desarrollo: ${(a.phenotype.developmentalStress||0).toFixed(2)}
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
Duración desarrollo: ${a.genome.body.developmentDuration.toFixed(1)}
Inicio extremidades: ${a.genome.body.limbOnset.toFixed(2)}
Inicio sensorial: ${a.genome.body.sensorOnset.toFixed(2)}
Inicio neural: ${a.genome.body.neuralOnset.toFixed(2)}
Plasticidad por carga: ${a.genome.body.loadAdaptation.toFixed(2)}
Plasticidad nutricional: ${a.genome.body.nutritionPlasticity.toFixed(2)}

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

SISTEMA MOTOR
Eficiencia motora: ${(a.motor?.efficiency||0).toFixed(2)}
Esfuerzo articular: ${(a.motor?.effort||0).toFixed(2)}
Distancia recorrida: ${(a.motor?.distance||0).toFixed(1)}
Agachamiento: ${(a.motor?.crouch||0).toFixed(2)}
En el suelo: ${a.motor?.onGround?'sí':'no'}
Saltos: ${a.motor?.jumps||0}
Fuerza articular genética: ${a.genome.body.jointStrength.toFixed(2)}
Flexibilidad genética: ${a.genome.body.jointFlexibility.toFixed(2)}
Potencia de salto: ${a.genome.body.jumpPower.toFixed(2)}
Plasticidad motora: ${a.genome.body.motorPlasticity.toFixed(2)}
Física corporal: ${a.physics?'Rapier rígida':'híbrida'}
Apoyos físicos: ${a.physics?.contactCount||0}
Velocidad física: ${physicsVelocity(a).toFixed(2)}

AFECTO
Valencia: ${a.affect.valence.toFixed(2)}
Activación: ${a.affect.arousal.toFixed(2)}
Miedo: ${a.affect.fear.toFixed(2)}
Ira: ${a.affect.anger.toFixed(2)}
Apego: ${a.affect.attachment.toFixed(2)}
Curiosidad: ${a.affect.curiosity.toFixed(2)}

COGNICIÓN / TOPOLOGÍA
Neuronas ocultas: ${a.hidden.length}
Conexiones activas: ${a.genome.brain.activeConnections??countBrainConnections(a.genome.brain)}
Densidad aprox.: ${((a.genome.brain.activeConnections??countBrainConnections(a.genome.brain))/(a.hidden.length*59+a.hidden.length*a.hidden.length+30*a.hidden.length)).toFixed(3)}
Mutación topológica: ${(a.genome.cognition?.topologyMutation||0).toFixed(3)}
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
Impulso predictivo: ${(a.genome.cognition?.predictiveDrive||0).toFixed(2)}
Aprendizaje del modelo: ${(a.genome.cognition?.modelLearning||0).toFixed(2)}
Error predictivo actual: ${(a.predictive?.lastError||0).toFixed(3)}
Recompensa de curiosidad: ${(a.predictive?.intrinsic||0).toFixed(4)}
Transiciones modeladas: ${a.predictive?.model?.size||0}

COMUNICACIÓN APRENDIDA
Símbolos conocidos: ${a.language?.lexicon?.size||0}
Convenciones de producción: ${a.language?.production?.size||0}
Comprensión estimada: ${(a.language?.comprehension||0).toFixed(2)}
Intercambios exitosos: ${a.language?.successfulExchanges||0}
Último símbolo oído: ${a.language?.heardToken||'—'}
Último símbolo producido: ${a.language?.lastProduced||'—'}
Aprendizaje simbólico: ${(a.genome.cognition?.symbolLearning||0).toFixed(2)}
Sesgo de convención: ${(a.genome.cognition?.conventionBias||0).toFixed(2)}
Tendencia a enseñar/imitar: ${(a.genome.cognition?.teachingBias||0).toFixed(2)}
Precisión vocal: ${(a.genome.body.vocalPrecision||0).toFixed(2)}

MEMORIA EXTERNA / PROTOESCRITURA
Patrones conocidos: ${a.externalMemory?.lexicon?.size||0}
Convenciones para marcar: ${a.externalMemory?.production?.size||0}
Última marca vista: ${a.externalMemory?.lastSeen||'—'}
Última marca producida: ${a.externalMemory?.lastProduced||'—'}

CULTURA MOTORA
Técnicas conocidas: ${a.motorCulture?.library?.size||0}
Técnicas copiadas: ${a.motorCulture?.copied||0}
Técnica activa: ${a.motorCulture?.activeKey||'—'}
Descubrimientos materiales: ${a.materialDiscoveries||0}

EVOLUCIÓN SOCIAL
Progenitores: ${a.parentIds?.length?a.parentIds.join(', '):'—'}
Parejas previas: ${a.mateHistory?.size||0}
Registros sociales: ${a.socialLedger?.size||0}
Reciprocidad genética: ${(a.genome.cognition?.reciprocityBias||0).toFixed(2)}
Sesgo parentesco: ${(a.genome.cognition?.kinBias||0).toFixed(2)}
Selectividad de pareja: ${(a.genome.cognition?.mateSelectivity||0).toFixed(2)}
Sensibilidad reputacional: ${(a.genome.cognition?.reputationSensitivity||0).toFixed(2)}
Generosidad: ${(a.genome.cognition?.generosity||0).toFixed(2)}
Territorialidad: ${(a.genome.cognition?.territoriality||0).toFixed(2)}

TECNOLOGÍA FÍSICA
Procedimientos conocidos: ${a.procedureMemory?.library?.size||0}
Procedimientos copiados: ${a.procedureMemory?.copied||0}
Objeto cargado: ${a.carrying?.type||'—'}
Agua cargada: ${(a.carrying?.waterAmount||0).toFixed(2)}
Capacidad del objeto: ${containerCapacity(a.carrying).toFixed(2)}
Eficiencia rotacional: ${(a.carrying?.props?.rotationEfficiency||0).toFixed(2)}
Potencial mecánico: ${(a.carrying?.props?.mechanicalPotential||0).toFixed(2)}
Masa efectiva cargada: ${effectiveMaterialMass(a.carrying).toFixed(2)}
Sorpresa física: ${(a.techSense?.surprise||0).toFixed(3)}
Cambios físicos detectados: ${a.techSense?.changes||0}
Estado técnico: ${a.techSense?.current?technicalStateCode(a,buildPerception(a)):'—'}

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



const SAVE_DB_NAME='life-sim-v11-world';
const SAVE_STORE='worlds';
const SAVE_KEY='main';
const AUTOSAVE_MS=12000;
const OFFLINE_SPEED_CAP=10;
let persistenceDB=null,persistenceReady=false,lastSavedAt=0,lastOfflineSeconds=0,saveInFlight=false;

function vecToArray(v){return [v.x,v.y,v.z];}
function arrToVec(a){return new THREE.Vector3(a?.[0]||0,a?.[1]||0,a?.[2]||0);}
function entriesOf(m){return [...m.entries()];}
function mapFromEntries(v){return new Map(Array.isArray(v)?v:[]);}

function openSaveDB(){
  return new Promise((resolve,reject)=>{
    if(!('indexedDB' in window)){reject(new Error('IndexedDB no disponible'));return;}
    const req=indexedDB.open(SAVE_DB_NAME,1);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(SAVE_STORE))db.createObjectStore(SAVE_STORE);
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('No se pudo abrir IndexedDB'));
  });
}
function idbGet(key){
  return new Promise((resolve,reject)=>{
    const tx=persistenceDB.transaction(SAVE_STORE,'readonly');
    const req=tx.objectStore(SAVE_STORE).get(key);
    req.onsuccess=()=>resolve(req.result||null);
    req.onerror=()=>reject(req.error);
  });
}
function idbPut(key,value){
  return new Promise((resolve,reject)=>{
    const tx=persistenceDB.transaction(SAVE_STORE,'readwrite');
    tx.objectStore(SAVE_STORE).put(value,key);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
  });
}

function snapshotAgent(a){
  return {
    id:a.id,genome:a.genome,generation:a.generation,age:a.age,energy:a.energy,health:a.health,
    phenotype:a.phenotype,
    nervous:{current:a.nervous.current,lastTouch:a.nervous.lastTouch,lastPain:a.nervous.lastPain,
      reflexCooldown:a.nervous.reflexCooldown,signals:a.nervous.signals,reflexes:a.nervous.reflexes},
    motor:a.motor,pos:[a.mesh.position.x,rigidModeActive?a.mesh.position.y:0,a.mesh.position.z],heading:a.heading,targetHeading:a.targetHeading,
    hidden:a.hidden,learnedW2:a.learnedW2,
    socialMemory:entriesOf(a.socialMemory),spatialMemory:a.spatialMemory,visited:entriesOf(a.visited),
    lastVisitTick:a.lastVisitTick,affect:a.affect,
    decision:{...a.decision,target:a.decision.target?vecToArray(a.decision.target):null},
    nav:{...a.nav,path:[...(a.nav?.path||[])],lastWaypoint:a.nav?.lastWaypoint?{...a.nav.lastWaypoint}:null},
    actionModel:entriesOf(a.actionModel),sequenceHistory:a.sequenceHistory,
    sequenceModel:entriesOf(a.sequenceModel),observedModel:entriesOf(a.observedModel),
    predictive:{model:entriesOf(a.predictive?.model||new Map()),lastError:a.predictive?.lastError||0,intrinsic:a.predictive?.intrinsic||0,totalUpdates:a.predictive?.totalUpdates||0},
    language:{lexicon:entriesOf(a.language?.lexicon||new Map()),production:entriesOf(a.language?.production||new Map()),heardToken:a.language?.heardToken||null,heardAt:a.language?.heardAt||-999,lastProduced:a.language?.lastProduced||null,lastScene:a.language?.lastScene||null,successfulExchanges:a.language?.successfulExchanges||0,heardCount:a.language?.heardCount||0,producedCount:a.language?.producedCount||0,comprehension:a.language?.comprehension||0},
    externalMemory:{lexicon:entriesOf(a.externalMemory?.lexicon||new Map()),production:entriesOf(a.externalMemory?.production||new Map()),lastSeen:a.externalMemory?.lastSeen||null,lastSeenAt:a.externalMemory?.lastSeenAt||-999,lastProduced:a.externalMemory?.lastProduced||null,lastScene:a.externalMemory?.lastScene||null},
    motorCulture:{library:entriesOf(a.motorCulture?.library||new Map()),copied:a.motorCulture?.copied||0},
    materialDiscoveries:a.materialDiscoveries||0,surfaceWork:a.surfaceWork||0,
    parentIds:a.parentIds||[],mateHistory:entriesOf(a.mateHistory||new Map()),socialLedger:entriesOf(a.socialLedger||new Map()),
    procedureMemory:{library:entriesOf(a.procedureMemory?.library||new Map()),history:a.procedureMemory?.history||[],copied:a.procedureMemory?.copied||0},
    techSense:{surprise:a.techSense?.surprise||0,changes:a.techSense?.changes||0},
    mentalSimulations:a.mentalSimulations,imitations:a.imitations,lastPlanTable:a.lastPlanTable,
    rewardBuffer:a.rewardBuffer,lastEnergy:a.lastEnergy,lastHealth:a.lastHealth,lastReward:a.lastReward,
    reproCooldown:a.reproCooldown,attackCooldown:a.attackCooldown,affiliateCooldown:a.affiliateCooldown,
    signal:a.signal,sound:a.sound,signalPhase:a.signalPhase,children:a.children,lineage:a.lineage,
    parentId:a.parentId,thought:a.thought,bornAt:a.bornAt,foodEaten:a.foodEaten,
    energyGained:a.energyGained,originBorn:a.originBorn,carryingType:a.carrying?.type||null,
    carryingData:a.carrying?{type:a.carrying.type,props:a.carrying.props,waterAmount:a.carrying.waterAmount,waterTemp:a.carrying.waterTemp,softness:a.carrying.softness,shaping:a.carrying.shaping,rotationTurns:a.carrying.rotationTurns,mechanicalWork:a.carrying.mechanicalWork,temperature:a.carrying.temperature,wetness:a.carrying.wetness,thermalState:a.carrying.thermalState,transformedLevel:a.carrying.transformedLevel,originRegion:a.carrying.originRegion,lastRegion:a.carrying.lastRegion,regionalMoves:a.carrying.regionalMoves,groundScrapeWork:a.carrying.groundScrapeWork||0,
      coldShapeWork:a.carrying.coldShapeWork||0,techTrace:a.carrying.techTrace?structuredClone(a.carrying.techTrace):null,
      traceStrength:a.carrying.traceStrength||0,traceObservations:a.carrying.traceObservations||0,
      worksiteStrength:a.carrying.worksiteStrength||0,worksiteWork:a.carrying.worksiteWork||0,
      worksiteWorkers:[...(a.carrying.worksiteWorkers||[])],lastWorkAt:a.carrying.lastWorkAt||0,
      lastWaterSource:a.carrying.lastWaterSource||null,environmentalWaterGained:a.carrying.environmentalWaterGained||0}:null
  };
}
function snapshotStructure(s){
  return {
    id:s.id,pos:vecToArray(s.group.position),parts:s.parts,partProps:s.partProps,
    totalMass:s.totalMass,hardness:s.hardness,fertility:s.fertility,length:s.length,age:s.age,
    binding:s.binding,insulation:s.insulation,resonance:s.resonance,stability:s.stability,complexity:s.complexity,
    builders:s.builders,modifications:s.modifications,useTime:s.useTime,maxOccupancy:s.maxOccupancy,lastUsed:s.lastUsed,
    techArchive:structuredClone(s.techArchive||[]),minGeneration:s.minGeneration,maxGeneration:s.maxGeneration,
    worksiteStrength:s.worksiteStrength||0,worksiteWork:s.worksiteWork||0,
    worksiteWorkers:[...(s.worksiteWorkers||[])],lastWorkAt:s.lastWorkAt||0,
    childPositions:s.group.children.map(c=>vecToArray(c.position))
  };
}
function snapshotWorld(){
  return {
    schema:1,engine:ENGINE_VERSION,savedAt:Date.now(),
    worldAge,births,deaths,naturalBirths,rescueInsertions,rescueInsertionEvents:[...rescueInsertionEvents],
    rescueEpisodeEvents:[...rescueEpisodeEvents],fertileEncounterEvents:[...fertileEncounterEvents],matingEventTimes:[...matingEventTimes],
    totalRescueEpisodes,rescuePopulationEpisodes,rescueFertilityEpisodes,rescueLoadEpisodes,lastRescueReason,
    nextId,nextMaterialId,nextStructureId,totalMentalSims,totalImitations,
    totalTouchSignals,totalReflexes,totalTerrainRecoveries,originCount,extinct,extinctionAge,peakGeneration,maxPopulationSeen,
    recolonizations,biosphereRescues,
    nextMarkId,totalThermalTransforms,totalIgnitions,totalMotorImitations,totalExternalReads,
    totalRegionalTrade,totalMateEvents,transferEvents:[...transferEvents],
    totalShapingEvents,totalProcedureCopies,totalFluidTransfers,totalMechanicalWork,totalWaterContacts,totalRainCaptures,
    totalEnvironmentalWaterAcquired,inheritedWaterAtLoad,
    nextRecycleAt,totalRecycledMaterials,totalCollapsedStructures,
    worldMarks:worldMarks.map(m=>({id:m.id,pattern:m.pattern,pos:vecToArray(m.pos),angle:m.angle,creatorId:m.creatorId,createdAt:m.createdAt,strength:m.strength,uses:m.uses,reads:m.reads,lastUsed:m.lastUsed})),
    mealEvents:[...mealEvents],discoveryEvents:structuredClone(discoveryEvents),
    mutationRate,sunFactor,timeScale,masterVolume,anatomyView,
    livingWorld:exportLivingWorldState(),
    agents:agents.map(snapshotAgent),
    food:food.map(f=>({pos:vecToArray(f.mesh.position),energy:f.energy})),
    materials:materials.filter(m=>!m.carriedBy).map(m=>({type:m.type,pos:vecToArray(m.mesh.position),staticTime:m.staticTime,props:m.props,parts:m.parts,builders:m.builders,placedBy:m.placedBy,placedAt:m.placedAt,manipCount:m.manipCount,work:m.work,temperature:m.temperature,wetness:m.wetness,burning:m.burning,burnTime:m.burnTime,thermalExposure:m.thermalExposure,thermalState:m.thermalState,transformedLevel:m.transformedLevel,fracture:m.fracture,abrasion:m.abrasion,waterAmount:m.waterAmount,waterTemp:m.waterTemp,softness:m.softness,shaping:m.shaping,rotationTurns:m.rotationTurns,mechanicalWork:m.mechanicalWork,originRegion:m.originRegion,lastRegion:m.lastRegion,regionalMoves:m.regionalMoves,groundScrapeWork:m.groundScrapeWork||0,
      coldShapeWork:m.coldShapeWork||0,techTrace:m.techTrace?structuredClone(m.techTrace):null,
      traceStrength:m.traceStrength||0,traceObservations:m.traceObservations||0,
      worksiteStrength:m.worksiteStrength||0,worksiteWork:m.worksiteWork||0,
      worksiteWorkers:[...(m.worksiteWorkers||[])],lastWorkAt:m.lastWorkAt||0,
      lastWaterSource:m.lastWaterSource||null,environmentalWaterGained:m.environmentalWaterGained||0})),
    structures:structures.map(snapshotStructure),
    embryos:embryos.map(e=>({...e,pos:vecToArray(e.pos)})),
    genomeArchive:structuredClone(genomeArchive),
    birthEvents:[...birthEvents],deathEvents:[...deathEvents]
  };
}
async function saveWorld(showStatus=false){
  if(auditOnly||!auditReady||!persistenceReady||saveInFlight)return;
  saveInFlight=true;
  try{
    const snap=snapshotWorld();
    await idbPut(SAVE_KEY,snap);
    lastSavedAt=snap.savedAt;
    const state=document.getElementById('persistState');
    if(state)state.textContent='activo';
    if(showStatus){
      const el=document.getElementById('lastSave');
      if(el)el.textContent='ahora';
    }
  }catch(err){
    console.error('Error guardando mundo',err);
    const state=document.getElementById('persistState');
    if(state)state.textContent='error';
  }finally{saveInFlight=false;}
}
function clearWorldVisuals(){
  while(food.length){
    const f=food.pop();foodGroup.remove(f.mesh);f.mesh.geometry.dispose();f.mesh.material.dispose();
  }
  while(materials.length){
    const m=materials.pop();m.mesh.parent?.remove(m.mesh);
    if(m.mesh.geometry)m.mesh.geometry.dispose();if(m.mesh.material)m.mesh.material.dispose();
  }
  while(structures.length){
    const s=structures.pop();structureGroup.remove(s.group);
    s.group.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});
  }
  while(agents.length){const a=agents.pop();destroyAgentMesh(a);}
}
function restoreStructureSnapshot(ss){
  const group=new THREE.Group();group.position.copy(arrToVec(ss.pos));
  group.position.y=terrainHeightAt(group.position);structureGroup.add(group);
  const parts=ss.parts||[],partProps=ss.partProps||[];
  for(let i=0;i<parts.length;i++){
    const custom={props:partProps[i]||MATERIAL_TYPES[parts[i]]};
    const temp=makeMaterial(parts[i],group.position.clone(),custom);
    if(!temp)continue;
    const mi=materials.indexOf(temp);if(mi>=0)materials.splice(mi,1);
    materialGroup.remove(temp.mesh);
    temp.mesh.position.copy(arrToVec(ss.childPositions?.[i]||[0,.2,0]));group.add(temp.mesh);
  }
  const s={
    id:ss.id||nextStructureId++,group,parts:[...parts],
    partProps:partProps.length?structuredClone(partProps):parts.map(t=>({...MATERIAL_TYPES[t]})),
    builders:[...(ss.builders||[])],modifications:ss.modifications||0,useTime:ss.useTime||0,
    maxOccupancy:ss.maxOccupancy||0,lastUsed:ss.lastUsed||worldAge,age:ss.age||0,
    techArchive:structuredClone(ss.techArchive||[]),minGeneration:ss.minGeneration??null,maxGeneration:ss.maxGeneration??null,
    worksiteStrength:ss.worksiteStrength||0,worksiteWork:ss.worksiteWork||0,
    worksiteWorkers:[...(ss.worksiteWorkers||[])],lastWorkAt:ss.lastWorkAt||0
  };
  recalcStructure(s);structures.push(s);
}

function restoreAgentSnapshot(s){
  const a=makeAgent(s.genome,arrToVec(s.pos),s.generation,s.lineage,{originSeed:true});
  if(!a)return null;
  a.id=s.id;a.mesh.userData.agent=a;
  a.age=s.age;a.energy=s.energy;a.health=s.health;
  Object.assign(a.phenotype,s.phenotype||{});
  if(s.nervous){
    a.nervous.current=s.nervous.current||a.nervous.current;a.nervous.pending=[];
    a.nervous.lastTouch=s.nervous.lastTouch||a.nervous.lastTouch;a.nervous.lastPain=s.nervous.lastPain||a.nervous.lastPain;
    a.nervous.reflexCooldown=s.nervous.reflexCooldown||0;a.nervous.signals=s.nervous.signals||0;a.nervous.reflexes=s.nervous.reflexes||0;
  }
  if(s.motor){
    a.motor={...a.motor,...s.motor};
    a.motor.joints=(s.motor.joints||a.motor.joints).map(j=>({...j}));
  }
  a.heading=s.heading;a.targetHeading=s.targetHeading;a.mesh.rotation.y=a.heading;
  a.hidden=s.hidden||a.hidden;a.learnedW2=s.learnedW2||a.learnedW2;
  a.socialMemory=mapFromEntries(s.socialMemory);a.spatialMemory=s.spatialMemory||[];
  a.visited=mapFromEntries(s.visited);a.lastVisitTick=s.lastVisitTick??-1;a.affect=s.affect||a.affect;
  a.decision={...a.decision,...(s.decision||{})};
  if(a.decision.target&&Array.isArray(a.decision.target))a.decision.target=arrToVec(a.decision.target);
  if(s.nav)a.nav={...a.nav,...s.nav,path:[...(s.nav.path||[])],lastWaypoint:s.nav.lastWaypoint?{...s.nav.lastWaypoint}:null};a.decision.target=s.decision?.target?arrToVec(s.decision.target):null;
  a.actionModel=mapFromEntries(s.actionModel);a.sequenceHistory=s.sequenceHistory||[];
  a.sequenceModel=mapFromEntries(s.sequenceModel);a.observedModel=mapFromEntries(s.observedModel);
  if(s.predictive)a.predictive={model:mapFromEntries(s.predictive.model),lastError:s.predictive.lastError||0,intrinsic:s.predictive.intrinsic||0,totalUpdates:s.predictive.totalUpdates||0};
  if(s.language){a.language={...a.language,...s.language,lexicon:mapFromEntries(s.language.lexicon),production:mapFromEntries(s.language.production)}};
  if(s.externalMemory){a.externalMemory={...a.externalMemory,...s.externalMemory,lexicon:mapFromEntries(s.externalMemory.lexicon),production:mapFromEntries(s.externalMemory.production)}};
  if(s.motorCulture){a.motorCulture={...a.motorCulture,...s.motorCulture,history:[],library:mapFromEntries(s.motorCulture.library),activeKey:null,sampleTimer:rand(0,.16)}};
  a.materialDiscoveries=s.materialDiscoveries||0;a.surfaceWork=s.surfaceWork||0;
  a.parentIds=s.parentIds||[s.parentId].filter(v=>v!=null);a.parentId=a.parentIds[0]??null;
  a.mateHistory=mapFromEntries(s.mateHistory);a.socialLedger=mapFromEntries(s.socialLedger);
  if(s.procedureMemory){a.procedureMemory={...a.procedureMemory,...s.procedureMemory,library:mapFromEntries(s.procedureMemory.library),history:s.procedureMemory.history||[],pending:null,active:null};normalizeProcedureMemory(a);}
  if(s.techSense){a.techSense.surprise=s.techSense.surprise||0;a.techSense.changes=s.techSense.changes||0;}
  a.mentalSimulations=s.mentalSimulations||0;a.imitations=s.imitations||0;a.lastPlanTable=s.lastPlanTable||[];
  a.rewardBuffer=s.rewardBuffer||0;a.lastEnergy=s.lastEnergy??a.energy;a.lastHealth=s.lastHealth??a.health;a.lastReward=s.lastReward||0;
  a.reproCooldown=s.reproCooldown||0;a.attackCooldown=s.attackCooldown||0;a.affiliateCooldown=s.affiliateCooldown||0;
  a.signal=s.signal||a.signal;a.sound=s.sound||a.sound;a.signalPhase=s.signalPhase||0;a.children=s.children||0;
  a.parentId=s.parentId??null;a.thought=s.thought||'observando';a.bornAt=s.bornAt??worldAge;
  a.foodEaten=s.foodEaten||0;a.energyGained=s.energyGained||0;a.originBorn=s.originBorn||originCount;
  applyMorphologyVisual(a);
  if(a.physics)rebuildPhysicsRig(a);
  if(s.carryingData||s.carryingType){
    const data=s.carryingData||{type:s.carryingType};
    const m=makeMaterial(data.type,a.mesh.position.clone(),data);
    if(m){a.carrying=m;m.carriedBy=a.id;updateCarriedMaterial(a);}
  }
  return a;
}
function restoreWorld(s){
  clearWorldVisuals();
  embryos.length=0;genomeArchive.length=0;birthEvents.length=0;deathEvents.length=0;mealEvents.length=0;discoveryEvents.length=0;discoverySeen.clear();renderDiscoveryLog();mealEvents.length=0;discoveryEvents.length=0;discoverySeen.clear();
  while(worldMarks.length){const wm=worldMarks.pop();markGroup.remove(wm.group);wm.group?.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});}
  worldAge=s.worldAge||0;originCount=s.originCount||1;extinct=false;extinctionAge=s.extinctionAge||0;
  peakGeneration=s.peakGeneration||0;maxPopulationSeen=s.maxPopulationSeen||0;
  recolonizations=s.recolonizations||0;biosphereRescues=s.biosphereRescues||0;
  nextMarkId=s.nextMarkId||1;totalThermalTransforms=s.totalThermalTransforms||0;totalIgnitions=s.totalIgnitions||0;
  totalMotorImitations=s.totalMotorImitations||0;totalExternalReads=s.totalExternalReads||0;
  totalRegionalTrade=s.totalRegionalTrade||0;totalMateEvents=s.totalMateEvents||0;
  totalShapingEvents=s.totalShapingEvents||0;totalProcedureCopies=s.totalProcedureCopies||0;
  totalFluidTransfers=s.totalFluidTransfers||0;totalMechanicalWork=s.totalMechanicalWork||0;totalWaterContacts=s.totalWaterContacts||0;totalRainCaptures=s.totalRainCaptures||0;
  totalEnvironmentalWaterAcquired=s.totalEnvironmentalWaterAcquired||0;
  nextRecycleAt=s.nextRecycleAt||worldAge;totalRecycledMaterials=s.totalRecycledMaterials||0;totalCollapsedStructures=s.totalCollapsedStructures||0;
  transferEvents.length=0;transferEvents.push(...(s.transferEvents||[]));
  mutationRate=s.mutationRate??.10;sunFactor=s.sunFactor??1;timeScale=s.timeScale??1;masterVolume=s.masterVolume??.18;
  anatomyView=!!s.anatomyView;
  resetLivingWorld(s.livingWorld||null);

  for(const f of s.food||[])makeFood(arrToVec(f.pos),f.energy);
  for(const m of s.materials||[]){const mm=makeMaterial(m.type,arrToVec(m.pos),m);if(mm)mm.staticTime=m.staticTime||0;}
  for(const st of s.structures||[])restoreStructureSnapshot(st);
  for(const wm of s.worldMarks||[]){const mark={...wm,pos:arrToVec(wm.pos)};mark.group=createMarkMesh(mark.pattern,mark.pos,mark.angle,mark.strength);worldMarks.push(mark);}
  for(const as of s.agents||[])restoreAgentSnapshot(as);
  for(const e of s.embryos||[])embryos.push({...e,pos:arrToVec(e.pos)});
  genomeArchive.push(...(s.genomeArchive||[]));birthEvents.push(...(s.birthEvents||[]));deathEvents.push(...(s.deathEvents||[]));mealEvents.push(...(s.mealEvents||[]));
  for(const e of s.discoveryEvents||[]){discoveryEvents.push(e);if(e.key)discoverySeen.add(e.key);}renderDiscoveryLog();

  births=s.births||agents.length;deaths=s.deaths||0;
  naturalBirths=s.naturalBirths??Math.max(0,(s.births||0)-(s.biosphereRescues||0));
  rescueInsertions=s.rescueInsertions??(s.biosphereRescues||0);
  rescueInsertionEvents.length=0;rescueInsertionEvents.push(...(s.rescueInsertionEvents||[]));
  rescueEpisodeEvents.length=0;rescueEpisodeEvents.push(...(s.rescueEpisodeEvents||[]));
  fertileEncounterEvents.length=0;fertileEncounterEvents.push(...(s.fertileEncounterEvents||[]));
  matingEventTimes.length=0;matingEventTimes.push(...(s.matingEventTimes||[]));
  totalRescueEpisodes=s.totalRescueEpisodes??0;
  rescuePopulationEpisodes=s.rescuePopulationEpisodes??0;
  rescueFertilityEpisodes=s.rescueFertilityEpisodes??0;
  rescueLoadEpisodes=s.rescueLoadEpisodes??0;
  lastRescueReason=s.lastRescueReason||'—';
  inheritedWaterAtLoad=totalStoredWater();
  totalEnvironmentalWaterAcquired=0;
  totalMentalSims=s.totalMentalSims||0;totalImitations=s.totalImitations||0;
  totalTouchSignals=s.totalTouchSignals||0;totalReflexes=s.totalReflexes||0;totalTerrainRecoveries=s.totalTerrainRecoveries||0;
  nextId=Math.max(s.nextId||1,...agents.map(a=>a.id+1),1);
  nextMaterialId=Math.max(s.nextMaterialId||1,nextMaterialId);nextStructureId=Math.max(s.nextStructureId||1,nextStructureId);

  document.getElementById('speed').value=String(timeScale);document.getElementById('speedOut').textContent=`${timeScale}×`;
  document.getElementById('mutation').value=String(mutationRate);document.getElementById('mutationOut').textContent=`${Math.round(mutationRate*100)}%`;
  document.getElementById('sun').value=String(sunFactor);document.getElementById('sunOut').textContent=sunFactor.toFixed(2);
  document.getElementById('volume').value=String(masterVolume);document.getElementById('volumeOut').textContent=`${Math.round(masterVolume*100)}%`;
  updateClimateLighting();setAnatomyView(anatomyView);
  selectedAgent=null;document.getElementById('selected').style.display='none';
  const overlay=document.getElementById('extinction');if(overlay)overlay.style.display='none';
  if(!auditOnly&&agents.length===0&&embryos.length===0)recolonizeBiosphere();
}
function coarseOfflineAdvance(realSeconds,savedScale){
  if(realSeconds<2)return 0;
  const offlineScale=Math.min(Math.max(.25,savedScale||1),OFFLINE_SPEED_CAP);
  const simAdvance=Math.min(realSeconds*offlineScale,60*60*24*30);
  const cycles=Math.max(1,Math.min(900,Math.ceil(simAdvance/4)));
  const step=simAdvance/cycles;

  for(let c=0;c<cycles;c++){
    worldAge+=step;
    updateLivingWorld(Math.min(step,4));
    const targetFood=Math.round(CONFIG.FOOD_MAX*clamp(.42+.22*(sunFactor/1.8),.30,.72));
    if(food.length<targetFood){
      const add=Math.min(targetFood-food.length,Math.max(1,Math.ceil(step*.10*sunFactor)));
      for(let i=0;i<add;i++)makeFood();
    }

    for(const a of [...agents]){
      if(!agents.includes(a))continue;
      a.age+=step;a.reproCooldown=Math.max(0,a.reproCooldown-step);
      const resourceRatio=clamp(food.length/Math.max(1,agents.length*3.2),0,1.25);
      const targetEnergy=35+46*clamp(resourceRatio,0,1);
      a.energy+=(targetEnergy-a.energy)*clamp(step*.012,0,.22);
      a.health=clamp(a.health+(resourceRatio>.35?.035:-.045)*step,0,CONFIG.MAX_HEALTH);

      if(isFertile(a)&&agents.length+embryos.length<CONFIG.MAX_AGENTS+CONFIG.EMBRYO_MAX){
        const density=agents.length/CONFIG.MAX_AGENTS;
        const chance=1-Math.exp(-step*.0028*clamp(1.25-density,.2,1.2));
        if(Math.random()<chance){
          createEmbryo(a,mutateGenome(a.genome),a.mesh.position.clone(),a.generation+1,a.lineage);
          a.children++;a.energy=Math.max(25,a.energy-CONFIG.REPRO_COST*.55);a.reproCooldown=CONFIG.REPRO_COOLDOWN;
        }
      }

      const maxAge=individualMaxAge(a);
      const ageHazard=a.age>maxAge*.72?.0018*(a.age/maxAge):.00015;
      const poorHealth=(1-a.health/CONFIG.MAX_HEALTH)*.004;
      if(a.age>maxAge||Math.random()<1-Math.exp(-(ageHazard+poorHealth)*step))removeAgent(a);
    }
    updateEmbryos(Math.min(step,3));
    updateThermodynamics(Math.min(step,2));updateWorldMarks(step);
    if(agents.length===0&&embryos.length===0)break;
  }
  if(agents.length===0&&embryos.length===0){
    recolonizeBiosphere();
  }else{
    extinct=false;paused=false;
  }
  return simAdvance;
}
async function initPersistenceAndWorld(){
  const state=document.getElementById('persistState');
  try{
    persistenceDB=await openSaveDB();persistenceReady=true;if(state)state.textContent='activo';
    const saved=await idbGet(SAVE_KEY);
    if(auditOnly){
      persistenceReady=false;paused=true;
      if(saved?.schema===1){restoreWorld(saved);paused=true;auditReady=true;auditSource={kind:'local-copy',engine:saved.engine,savedAt:saved.savedAt,worldAge:saved.worldAge};}
      if(state)state.textContent='copia de auditoría · sin guardado';
      return;
    }
    if(saved?.schema===1){
      // Keep the original snapshot before any restore/offline migration.
      if(!await idbGet('backup-before-v17.7.4'))await idbPut('backup-before-v17.7.4',saved);
      restoreWorld(saved);auditReady=true;lastSavedAt=saved.savedAt||0;
      const elapsed=Math.max(0,(Date.now()-(saved.savedAt||Date.now()))/1000);
      lastOfflineSeconds=coarseOfflineAdvance(elapsed,saved.timeScale||1);
      stabilizeLoadedPopulation();
      if(lastOfflineSeconds>0||demographicRescueActive)await saveWorld();
    }else{
      seed();auditReady=true;await saveWorld();
    }
  }catch(err){
    console.error('No se pudo cargar el mundo; no se creará ni guardará otro encima.',err);
    persistenceReady=false;auditReady=false;paused=true;
    if(state)state.textContent='error de carga · guardado detenido';
  }
}



function pruneMealEvents(){
  const cutoff=worldAge-CONFIG.DEMO_WINDOW;while(mealEvents.length&&mealEvents[0]<cutoff)mealEvents.shift();
}
function averageEnergy(){return agents.length?agents.reduce((s,a)=>s+a.energy,0)/agents.length:0;}
function averageHealth(){return agents.length?agents.reduce((s,a)=>s+a.health,0)/agents.length:0;}
function seedActiveFromBank(){
  if(agents.length>=CONFIG.MAX_AGENTS)return null;
  const source=seedBankGenome(),a=makeAgent(source.genome,randomGroundPos(CONFIG.WORLD*.68),source.generation,source.lineage,{originSeed:true});
  if(!a)return null;
  a.age=rand(4,38);a.energy=rand(74,94);a.health=rand(90,100);a.reproCooldown=rand(0,3.5);
  a.phenotype.growth=clamp(a.age/Math.max(24,a.genome.body.developmentDuration),.18,1);
  applyMorphologyVisual(a);if(a.physics)rebuildPhysicsRig(a);
  biosphereRescues++;rescueInsertions++;rescueInsertionEvents.push(worldAge);return a;
}
function emergencyDemographicRecovery(reason='emergencia biológica',reasonCode='other'){
  if(worldAge-lastRescueAt<CONFIG.RESCUE_COOLDOWN)return 0;
  const before=agents.length,target=CONFIG.EMERGENCY_RESCUE_TARGET;
  while(agents.length<target)if(!seedActiveFromBank())break;
  if(embryos.length<2)addDormantSeedFromBank();
  lastRescueAt=worldAge;demographicRescueActive=true;
  const added=agents.length-before;
  if(added>0){
    totalRescueEpisodes++;rescueEpisodeEvents.push(worldAge);lastRescueReason=reason;
    if(reasonCode==='population')rescuePopulationEpisodes++;
    else if(reasonCode==='fertility')rescueFertilityEpisodes++;
    else if(reasonCode==='load')rescueLoadEpisodes++;
    recordDiscovery(`rescue:${Math.floor(worldAge/CONFIG.RESCUE_COOLDOWN)}`,'🌱','Rescate biológico de emergencia',`${reason}: el banco evolutivo introdujo ${added} individuos. No cuentan como nacimientos naturales.`);
  }
  return added;
}

function timeSinceNaturalBirth(){
  pruneEvents(birthEvents);
  if(!birthEvents.length)return Infinity;
  return Math.max(0,worldAge-birthEvents[birthEvents.length-1]);
}
function pruneRescueEvents(){
  const cutoff=worldAge-CONFIG.DEMO_WINDOW;
  while(rescueInsertionEvents.length&&rescueInsertionEvents[0]<cutoff)rescueInsertionEvents.shift();
}

function stabilizeLoadedPopulation(){
  const noFertile=fertilePopulation()===0;
  const birthGap=timeSinceNaturalBirth();
  if(agents.length<=5 || (agents.length<CONFIG.BIOSPHERE_LOW_POP&&noFertile&&birthGap>CONFIG.RESCUE_BIRTH_GAP)){
    emergencyDemographicRecovery('mundo guardado en emergencia reproductiva severa','load');
  }
}

function demographicRiskLabel(){
  const demo=recentDemography();
  const viable=agents.length+embryos.length;
  const fertile=agents.filter(isFertile).length;
  const avgEnergy=agents.length?agents.reduce((s,a)=>s+a.energy,0)/agents.length:0;
  if(viable===0)return 'recolonizando';
  if(agents.length<6)return 'crítico';
  if(agents.length<14&&fertile<4)return 'alto';
  if((agents.length<24&&fertile<6)||demo.balance<-14||avgEnergy<24)return 'alto';
  if(agents.length<40||demo.balance<-4||avgEnergy<34)return 'medio';
  return 'estable';
}
function seedBankGenome(){
  if(genomeArchive.length){
    const pool=genomeArchive.slice(0,Math.min(10,genomeArchive.length));
    const chosen=pool[(Math.random()*pool.length)|0];
    return {
      genome:mutateGenome(structuredClone(chosen.genome)),
      generation:chosen.generation+1,
      lineage:chosen.lineage
    };
  }
  return {genome:randomGenome(),generation:0,lineage:null};
}
function addDormantSeedFromBank(){
  if(embryos.length>=CONFIG.EMBRYO_MAX)return false;
  const source=seedBankGenome();
  const p=randomGroundPos(CONFIG.WORLD*.72);
  const ok=createEmbryo(null,source.genome,p,source.generation,source.lineage);
  if(ok){
    const e=embryos[embryos.length-1];
    // A seed bank may remain dormant longer than an ordinary embryo.
    e.rescueSeed=true;
    e.hatchAt=worldAge+rand(1.5,10);
    e.expiresAt=worldAge+rand(CONFIG.EMBRYO_MAX_AGE*.85,CONFIG.EMBRYO_MAX_AGE*1.45);
    biosphereRescues++;
  }
  return ok;
}
function recolonizeBiosphere(){
  recolonizations++;
  originCount++;
  extinct=false;
  paused=false;
  const target=CONFIG.BIOSPHERE_SEED_TARGET;
  for(let i=0;i<target;i++)addDormantSeedFromBank();

  // Restore a basic producer layer so recolonizers are not born into an empty desert.
  const foodTarget=Math.min(CONFIG.FOOD_MAX,Math.max(180,Math.round(CONFIG.FOOD_MAX*.42)));
  while(food.length<foodTarget)makeFood();

  const overlay=document.getElementById('extinction');
  if(overlay)overlay.style.display='none';
  const btn=document.getElementById('newOrigin');
  if(btn)btn.style.display='none';
  const pauseBtn=document.getElementById('pause');
  if(pauseBtn)pauseBtn.textContent='Pausar';
  saveWorld(false);
}
function maintainBiosphereContinuity(dt){
  const viable=agents.length+embryos.length;
  if(viable===0){recolonizeBiosphere();return;}

  const fertile=fertilePopulation();
  const birthGap=timeSinceNaturalBirth();

  const absoluteEmergency=agents.length<=4&&embryos.length===0;
  const reproductiveEmergency=agents.length<CONFIG.BIOSPHERE_LOW_POP&&fertile===0&&birthGap>CONFIG.RESCUE_BIRTH_GAP;

  if(absoluteEmergency||reproductiveEmergency){
    const rate=absoluteEmergency?.22:.055;
    if(Math.random()<1-Math.exp(-dt*rate)){
      emergencyDemographicRecovery(absoluteEmergency?'población casi extinta':'sin fertilidad ni nacimientos naturales recientes',absoluteEmergency?'population':'fertility');
    }
  }else{
    demographicRescueActive=false;
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
      `Muertes: <b>${deaths}</b><br>`+
      `Población máxima: <b>${maxPopulationSeen}</b><br>`+
      `Genomas archivados: <b>${genomeArchive.length}</b>`;
  }
  if(overlay)overlay.style.display='grid';
  const btn=document.getElementById('newOrigin');
  if(btn)btn.style.display='inline-block';
  const pauseBtn=document.getElementById('pause');
  if(pauseBtn)pauseBtn.textContent='Continuar';
  saveWorld(false);
}

function createNewOrigin(){
  if(!extinct)return;
  originCount++;
  extinct=false;
  paused=false;

  const originSize=56;
  embryos.length=0;
  birthEvents.length=0;
  deathEvents.length=0;

  for(let i=0;i<originSize;i++){
    const source=seedAgentFromArchive();
    const p=randomGroundPos(CONFIG.WORLD*.62);
    const a=makeAgent(source.genome,p,source.generation,source.lineage,{originSeed:true});
    if(a)diversifyOriginAgent(a);
  }

  const overlay=document.getElementById('extinction');
  if(overlay)overlay.style.display='none';
  const btn=document.getElementById('newOrigin');
  if(btn)btn.style.display='none';
  const pauseBtn=document.getElementById('pause');
  if(pauseBtn)pauseBtn.textContent='Pausar';
  saveWorld(false);
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

  births=0;deaths=0;naturalBirths=0;rescueInsertions=0;rescueInsertionEvents.length=0;rescueEpisodeEvents.length=0;
  fertileEncounterEvents.length=0;matingEventTimes.length=0;fertilePairLastSeen.clear();
  totalRescueEpisodes=0;rescuePopulationEpisodes=0;rescueFertilityEpisodes=0;rescueLoadEpisodes=0;lastRescueReason='—';
  worldAge=0;totalMentalSims=0;totalImitations=0;
  totalEnvironmentalWaterAcquired=0;inheritedWaterAtLoad=0;
  nextId=1;nextMaterialId=1;nextStructureId=1;selectedAgent=null;
  extinct=false;originCount=1;extinctionAge=0;peakGeneration=0;paused=false;totalTouchSignals=0;totalReflexes=0;totalTerrainRecoveries=0;
  maxPopulationSeen=0;recolonizations=0;biosphereRescues=0;
  totalThermalTransforms=0;totalIgnitions=0;totalMotorImitations=0;totalExternalReads=0;nextMarkId=1;activeBurningMaterials=[];
  totalRegionalTrade=0;totalMateEvents=0;transferEvents.length=0;
  totalShapingEvents=0;totalProcedureCopies=0;totalFluidTransfers=0;totalMechanicalWork=0;totalWaterContacts=0;totalRainCaptures=0;
  nextRecycleAt=0;totalRecycledMaterials=0;totalCollapsedStructures=0;
  while(worldMarks.length){const wm=worldMarks.pop();markGroup.remove(wm.group);wm.group?.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});}
  embryos.length=0;genomeArchive.length=0;birthEvents.length=0;deathEvents.length=0;
  mealEvents.length=0;rescueInsertionEvents.length=0;discoveryEvents.length=0;discoverySeen.clear();
  renderDiscoveryLog();
  const overlay=document.getElementById('extinction');if(overlay)overlay.style.display='none';
  const newOriginBtn=document.getElementById('newOrigin');if(newOriginBtn)newOriginBtn.style.display='none';
  document.getElementById('selected').style.display='none';
  resetLivingWorld();
  for(let i=0;i<CONFIG.START_FOOD;i++)makeFood(randomEcologicalFoodPos());
  for(let i=0;i<CONFIG.START_MATERIALS;i++)makeMaterial();
  for(let i=0;i<CONFIG.START_AGENTS;i++){
    const a=makeAgent(randomGenome(),randomGroundPos(CONFIG.WORLD*.65),0,null,{originSeed:true});
    if(a)diversifyOriginAgent(a);
  }
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
document.getElementById('saveNow').onclick=()=>saveWorld(true);
document.getElementById('reset').onclick=()=>{seed();saveWorld(true);};
document.getElementById('newOrigin').onclick=()=>createNewOrigin();
document.getElementById('extinctionOrigin').onclick=()=>createNewOrigin();

document.getElementById('anatomy').onclick=()=>setAnatomyView(!anatomyView);

function refreshObserverVisionUI(){
  const b=document.getElementById('observerVision');
  if(b){
    b.textContent=observerVision?'👁 Visión del observador: ON':'👁 Visión del observador: OFF';
    b.classList.toggle('primary',observerVision);
  }
  const s=document.getElementById('observerVisionState');
  if(s)s.textContent=observerVision?'ON':'OFF';
}
const observerVisionBtn=document.getElementById('observerVision');
if(observerVisionBtn)observerVisionBtn.onclick=()=>{
  observerVision=!observerVision;
  try{localStorage.setItem('lifeSimObserverVision',observerVision?'1':'0');}catch{}
  refreshObserverVisionUI();
  updateClimateLighting();
};
refreshObserverVisionUI();

const hud=document.getElementById('hud');
const hudToggle=document.getElementById('hudToggle');
function setHudCollapsed(collapsed){
  hud.classList.toggle('collapsed',collapsed);
  hudToggle.textContent=collapsed?'☰':'−';
  hudToggle.title=collapsed?'Mostrar panel':'Minimizar panel';
}
hudToggle.onclick=()=>setHudCollapsed(!hud.classList.contains('collapsed'));
if(window.innerWidth<=620)setHudCollapsed(true);
const discoveriesPanel=document.getElementById('discoveries'),discToggle=document.getElementById('discToggle');
if(discToggle)discToggle.onclick=()=>{const c=discoveriesPanel.classList.toggle('collapsed');discToggle.textContent=c?'📜':'−';};
if(window.matchMedia('(pointer:coarse)').matches&&window.innerWidth<=900){discoveriesPanel.classList.add('collapsed');if(discToggle)discToggle.textContent='📜';}

document.getElementById('selectedClose').onclick=()=>{
  selectedAgent=null;
  document.getElementById('selected').style.display='none';
};

const speedEl=document.getElementById('speed');
speedEl.oninput=()=>{timeScale=+speedEl.value;document.getElementById('speedOut').textContent=`${timeScale}×`;};
const mutEl=document.getElementById('mutation');
mutEl.oninput=()=>{mutationRate=+mutEl.value;document.getElementById('mutationOut').textContent=`${Math.round(mutationRate*100)}%`;};
const sunEl=document.getElementById('sun');
sunEl.oninput=()=>{sunFactor=+sunEl.value;document.getElementById('sunOut').textContent=sunFactor.toFixed(2);updateClimateLighting();};
const volEl=document.getElementById('volume');
volEl.oninput=()=>{
  masterVolume=+volEl.value;
  document.getElementById('volumeOut').textContent=`${Math.round(masterVolume*100)}%`;
  if(masterGain)masterGain.gain.value=masterVolume;
};

const raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2();
let tapCandidate=null;
renderer.domElement.addEventListener('pointerdown',e=>{
  if(e.target!==renderer.domElement||e.button!==0||!e.isPrimary)return;
  tapCandidate={id:e.pointerId,x:e.clientX,y:e.clientY,t:performance.now()};
});
renderer.domElement.addEventListener('pointermove',e=>{
  if(tapCandidate&&e.pointerId===tapCandidate.id&&Math.hypot(e.clientX-tapCandidate.x,e.clientY-tapCandidate.y)>9)tapCandidate=null;
});
renderer.domElement.addEventListener('pointerup',e=>{
  if(!tapCandidate||e.pointerId!==tapCandidate.id)return;
  const c=tapCandidate;tapCandidate=null;
  if(performance.now()-c.t>450)return;
  mouse.x=(e.clientX/innerWidth)*2-1;mouse.y=-(e.clientY/innerHeight)*2+1;
  raycaster.setFromCamera(mouse,camera);
  const hits=raycaster.intersectObjects(agentGroup.children,true);if(!hits.length)return;
  let o=hits[0].object;while(o&&!o.userData.agent)o=o.parent;
  if(o?.userData.agent){selectedAgent=o.userData.agent;document.getElementById('selected').style.display='block';}
});
renderer.domElement.addEventListener('dblclick',e=>{
  if(e.button!==0)return;
  mouse.x=(e.clientX/innerWidth)*2-1;mouse.y=-(e.clientY/innerHeight)*2+1;
  raycaster.setFromCamera(mouse,camera);
  const hit=raycaster.intersectObject(ground,false)[0];
  if(hit)controls.focusPoint(hit.point);
});
window.addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);
});

function captureAuditSample(){
  if(!auditReady)return null;
  const pair=currentFertilePairMetrics(2.4);
  const previous=auditSamples.at(-1);
  const elapsed=previous?(Date.now()-Date.parse(previous.at))/1000:0;
  const row={at:new Date().toISOString(),worldAge,paused,timeScale,effectiveSpeed:elapsed>0?(worldAge-previous.worldAge)/elapsed:null,population:agents.length,
    embryos:embryos.length,fertile:agents.filter(isFertile).length,energy:averageEnergy(),health:averageHealth(),
    naturalBirths,deaths,rescueInsertions,totalRescueEpisodes,rescuePopulationEpisodes,
    rescueFertilityEpisodes,rescueLoadEpisodes,lastRescueReason,
    pairsNearby:pair.pairs,nearestFertile:Number.isFinite(pair.avgNearest)?pair.avgNearest:null,
    isolatedFertile:pair.isolated,energyBlocked:energyBlockedAdults(),cooldownBlocked:cooldownBlockedAdults(),
    birthGap:Number.isFinite(timeSinceNaturalBirth())?timeSinceNaturalBirth():null,
    totalMateEvents,peakGeneration,totalRegionalTrade,totalProcedureCopies,
    physicsEnabled,rigidModeActive,lastOfflineSeconds,
    invalidAgents:agents.filter(a=>![a.energy,a.health,a.age,a.mesh.position.x,a.mesh.position.y,a.mesh.position.z].every(Number.isFinite)).map(a=>a.id)};
  auditSamples.push(row);if(auditSamples.length>2160)auditSamples.shift();
  return row;
}
function downloadAuditJSON(value,name){
  const url=URL.createObjectURL(new Blob([JSON.stringify(value)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function validateAuditWorld(value){
  const s=value?.format==='life-sim-audit-v1'?value.world:value;
  if(!s||s.schema!==1||!Number.isFinite(s.worldAge)||s.worldAge<0||!Array.isArray(s.agents)||!Array.isArray(s.food)||!Array.isArray(s.materials)||!s.livingWorld)throw new Error('No es un respaldo compatible de Life Sim.');
  if(s.agents.length>2000||s.food.length>20000||s.materials.length>20000)throw new Error('El respaldo excede los límites de importación.');
  for(const a of s.agents){
    if(!a.genome||!Array.isArray(a.pos)||a.pos.length!==3||!a.pos.every(Number.isFinite)||![a.id,a.energy,a.health,a.age].every(Number.isFinite))throw new Error('El respaldo contiene individuos inválidos.');
  }
  return s;
}
function installAuditControls(){
  const panel=document.createElement('div');panel.style.cssText='margin:10px 0;padding:10px;border:1px solid #759baf;border-radius:8px';
  const status=document.createElement('p');status.id='auditStatus';status.style.cssText='font-size:12px;line-height:1.4';
  status.textContent=auditOnly?'COPIA DE AUDITORÍA · sin gráficos ni guardado en la partida principal. '+(auditReady?'Copia local cargada. Usa Continuar/Pausar.':'Carga un informe para comenzar.'):'Auditoría local activa: muestra cada 10 s; conserva las últimas 2160 muestras de esta sesión. Exporta antes de cerrar.';
  panel.appendChild(status);
  function button(label,handler){const b=document.createElement('button');b.textContent=label;b.onclick=async()=>{try{await handler();}catch(e){status.textContent=e.message;}};panel.appendChild(b);return b;}
  button('Exportar auditoría + respaldo',()=>{
    if(!auditReady)throw new Error('No hay un mundo cargado para exportar.');
    captureAuditSample();
    const metrics=Array.from(document.querySelectorAll('.stat')).map(el=>({label:el.textContent,value:el.querySelector('b')?.textContent}));
    downloadAuditJSON({format:'life-sim-audit-v1',engine:ENGINE_VERSION,exportedAt:new Date().toISOString(),
      mode:auditOnly?'audit-copy':'live-world',graphicsAvailable,source:auditSource,
      notes:['Historial limitado a esta sesión.','Una copia usa aleatoriedad nueva; no reproduce exactamente el futuro original.','Sin sincronización remota.','lastOfflineSeconds identifica avance offline aproximado al cargar.'],
      samples:auditSamples,metrics,world:snapshotWorld()},'life-sim-audit-'+Date.now()+'.json');
    status.textContent='Informe y respaldo descargados. Compártelo en el chat para revisar esta partida.';
  });
  if(!auditOnly){
    button('Descargar respaldo anterior al parche',async()=>{
      if(!persistenceDB)throw new Error('No hay almacenamiento disponible.');
      const saved=await idbGet('backup-before-v17.7.4');
      if(!saved)throw new Error('No hay respaldo anterior: este navegador no tenía una partida guardada al instalar el parche.');
      downloadAuditJSON(saved,'life-sim-before-v17.7.4.json');
    });
  }else{
    button('Crear mundo de prueba separado',()=>{
      if(auditReady)throw new Error('Ya hay una copia cargada. Abre otra pestaña de auditoría para una prueba nueva.');
      seed();paused=true;auditReady=true;auditSource={kind:'synthetic-test',createdAt:new Date().toISOString()};
      timeScale=100;document.getElementById('speed').value='100';document.getElementById('speedOut').textContent='100×';
      document.getElementById('pause').textContent='Continuar';captureAuditSample();
      status.textContent='MUNDO DE PRUEBA · no es tu partida. Objetivo 100×, limitado por rendimiento; sin guardado.';
    });
    const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.style.display='none';panel.appendChild(input);
    button('Cargar copia para auditar',()=>input.click());
    input.onchange=async()=>{
      const file=input.files?.[0];if(!file)return;
      try{
        if(file.size>80*1024*1024)throw new Error('Archivo demasiado grande (máximo 80 MB).');
        const saved=validateAuditWorld(JSON.parse(await file.text()));
        paused=true;auditReady=false;
        restoreWorld(saved);paused=true;lastOfflineSeconds=0;
        auditSource={kind:'imported-copy',name:file.name,engine:saved.engine,savedAt:saved.savedAt,worldAge:saved.worldAge};
        auditSamples.length=0;fertilePairLastSeen.clear();auditReady=true;
        timeScale=100;document.getElementById('speed').value='100';document.getElementById('speedOut').textContent='100×';
        document.getElementById('pause').textContent='Continuar';
        captureAuditSample();status.textContent='Copia cargada en pausa, a 100×. Pulsa Continuar para observarla. No se aplicó avance offline ni rescate al cargar.';
      }catch(e){status.textContent='No se pudo cargar: '+e.message;}finally{input.value='';}
    };
    for(const id of ['reset','saveNow']){const el=document.getElementById(id);if(el){el.disabled=true;el.title='Deshabilitado en la copia de auditoría';}}
    document.getElementById('pause').textContent='Continuar';
  }
  document.getElementById('saveNow').parentElement.after(panel);
  if(auditReady)captureAuditSample();
}

await initPersistenceAndWorld();
installAuditControls();
updateRigidMode();
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
  nervousInputDimension: 59,
  neuralOutputs: 30,
  evoDevo: true,
  evolvableBrainTopology: true,
  predictiveWorldModels: true,
  continuousBiosphere: true,
  rightDragPan: true,
  keyboardNavigation: true,
  cumulativeCulture: true,
  emergentSignaling: true,
  persistentConstruction: true,
  compositeArtifacts: true,
  thermodynamics: true,
  combustion: true,
  externalMemory: true,
  motorDemonstrationLearning: true,
  observableDiscoveries: true,
  biteRadius: CONFIG.BITE_RADIUS,
  demographicRecovery: true,
  sexualReproduction: true,
  kinshipMemory: true,
  reciprocityAndReputation: true,
  regionalEconomy: true,
  seasons: true,
  physicalTechnology: true,
  transportableWater: true,
  thermalShaping: true,
  rotationalMechanics: true,
  hierarchicalProcedures: true,
  contextualProcedures: true,
  physicalConsequenceSensing: true,
  socialPlaceMemory: true,
  accessibleExternalMarking: true,
  shorelineContainerInteraction: true,
  waterProximitySensing: true,
  seasonalRain: true,
  passiveRainCapture: true,
  cleanObservatory: true,
  culturalSelection: true,
  ecologicalRecycling: true,
  touchNavigation: true,
  mobileJoystick: true,
  evolutionBalance: true,
  adaptiveFertilityWindow: true,
  homeostaticPriority: true,
  physicalScrapeMarks: true,
  localInteractionMicrophysics: true,
  sharedDialectMetric: true,
  behavioralUnlock: true,
  reciprocityUnlock: true,
  groundScrapeMarks: true,
  balancedCultureThresholds: true,
  metabolicRebalance: true,
  naturalViabilityAccounting: true,
  emergencyOnlyRescue: true,
  environmentalWaterProvenance: true,
  socialCohesionDynamics: true,
  resourceCoupledFertility: true,
  bondedAid: true,
  relationshipAwareMating: true,
  intentionalNavigation: true,
  targetProgressLearning: true,
  deterministicExplorationScan: true,
  hybridGroundClearance: true,
  cumulativeCulture: true,
  objectTechnicalTraces: true,
  intergenerationalStructures: true,
  gradualColdShaping: true,
  markErosionSelection: true,
  collectiveIntent: true,
  sharedPhysicalEffort: true,
  persistentActivitySites: true,
  workContextLanguage: true,
  complementaryExchange: true,
  goalDirectedLocomotion: true,
  decisionHysteresis: true,
  localObstaclePlanner: true,
  spatialLoopDetection: true,
  socialStandoffDistance: true,
  livingWorldEcology: true,
  dynamicSoilMoisture: true,
  surfaceHydrology: true,
  dayNightCycle: true,
  vegetationDynamics: true,
  terrainLocomotion: true,
  hybridBodySeparation: true,
  visualEcology: true,
  proceduralTerrainTexture: true,
  smoothTerrainColors: true,
  instancedGrass: true,
  irregularSurfaceWater: true,
  physicalTerrainRelief: true,
  mountainValleyGeology: true,
  watershedRunoff: true,
  slopeAwareNavigation: true,
  terrainTrimeshPhysics: true,
  visibleMoonlight: true,
  observerNightVision: true,
  observerVisionRenderOnly: true,
  terrainPenetrationRecovery: true,
  deepSoilDrainage: true,
  vegetationSeedRecovery: true,
  evolvableBodyPlan: true,
  axialPostureEvolution: true,
  limbRoleSpecialization: true,
  useDependentLimbDevelopment: true,
  genericDistalOrgans: true,
  demographicDiagnostics: true,
  rescueEpisodeAudit: true,
  fertileEncounterTracking: true,
  naturalWaterSurface: true,
  nonOverlappingWaterGeometry: true,
  contactFeedingReflex: true,
  symbolicMarkSelection: true,
  culturePopulationFloor: true,
  rapierLoaded: physicsEnabled,
  rigidPhysicsMode: rigidModeActive,
  rapierError: physicsLoadError?.message||null,
  evolutionStability: true,
  persistentWorld: persistenceReady,
  offlineAdvanced: lastOfflineSeconds,
  foundingPopulation: CONFIG.START_AGENTS
});
if(renderStatusEl) renderStatusEl.textContent='iniciando…';

setInterval(()=>saveWorld(false),AUTOSAVE_MS);
document.addEventListener('visibilitychange',()=>{if(document.hidden)saveWorld(false);});
window.addEventListener('pagehide',()=>{saveWorld(false);});

let last=performance.now();
function loop(now){
  requestAnimationFrame(loop);
  const realDt=Math.min(.04,(now-last)/1000);last=now;controls.update(realDt);
  updateRigidMode();
  if(auditReady&&!paused){
    const scaled=realDt*timeScale;
    // Biology/evolution can turbo; rigid mechanics stay physically stable up to 12×.
    const steps=Math.max(1,Math.min(80,Math.ceil(scaled/.05)));
    const dt=Math.min(.05,scaled/steps);
    const auditFrameStart=performance.now();
    for(let s=0;s<steps;s++){
      worldAge+=dt;updateLivingWorld(dt);updateFood(dt);updateMaterials(dt);updateEmbryos(dt);
      for(const a of [...agents])updateAgent(a,dt);
      resolveHybridAgentOverlaps(dt);
      maintainBiosphereContinuity(dt);
      if(auditOnly&&performance.now()-auditFrameStart>=30)break;
    }
    stepRigidPhysics(realDt);
  }
  updateClimateLighting();
  updateAudio();
  updateHUD();
  if(!Number.isFinite(camera.position.x)||!Number.isFinite(camera.position.y)||!Number.isFinite(camera.position.z)){
    camera.position.set(24,21,28);
    controls.target.set(0,0,0);
    camera.lookAt(0,0,0);
    controls.update();
  }
  if(graphicsAvailable)renderer.render(scene,camera);
  if(auditReady&&now-lastAuditSampleAt>=10000){lastAuditSampleAt=now;captureAuditSample();}
}
requestAnimationFrame(loop);
