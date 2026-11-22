import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xe8ebed);
scene.add(new THREE.HemisphereLight(0xffffff, 0x7b817f, 2.2));
const key = new THREE.DirectionalLight(0xffffff, 3); key.position.set(4,7,5); scene.add(key);
const fill = new THREE.DirectionalLight(0xe5eeff, 1.3); fill.position.set(-4,3,-3); scene.add(fill);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(30,30), new THREE.MeshStandardMaterial({color:0xcdd2d4,roughness:1}));
floor.rotation.x = -Math.PI / 2; scene.add(floor);
const grid = new THREE.GridHelper(30,60,0x849398,0xaeb9bd); scene.add(grid);
const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, .01, 100);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const actors = new Map(); let current, view = 'side', currentTime = 0, running = false, lastClock;
const normal = name => name.toLowerCase().replace(/^mixamorig:?/, '').replace(/[^a-z0-9]/g, '');
const hud = document.querySelector('#hud'), slider = document.querySelector('#time');
function pose(a, name, time) {
  a.mixer.stopAllAction();
  const action = a.actions[name];
  action.reset().setLoop(THREE.LoopOnce,1);
  action.clampWhenFinished = true; action.enabled = true; action.paused = true;
  action.setEffectiveWeight(1); action.play(); action.time = Math.max(0,Math.min(a.clips[name].duration,time));
  a.mixer.update(0); a.group.updateMatrixWorld(true);
}
function rawRoot(a,name,time) {
  a.group.position.set(0,0,0); pose(a,name,time);
  return a.hips.getWorldPosition(new THREE.Vector3());
}
function computeFloor(a) {
  a.group.position.set(0,0,0); pose(a,'Idle',a.clips.Idle.duration);
  let minimum = Infinity;
  a.model.traverse(o => {
    if (!o.isMesh) return;
    if (o.isSkinnedMesh) o.computeBoundingBox(); else o.geometry.computeBoundingBox();
    const box = (o.isSkinnedMesh ? o.boundingBox : o.geometry.boundingBox).clone().applyMatrix4(o.matrixWorld);
    minimum = Math.min(minimum,box.min.y);
  });
  if (!Number.isFinite(minimum)) throw new Error('No finite reference floor');
  return minimum;
}
async function loadActor(id) {
  if (actors.has(id)) return actors.get(id);
  const [model, motion] = await Promise.all([
    loader.loadAsync('../../../assets/models/visitors/walking-'+(id==='emma'?'woman':'man')+'.glb'),
    loader.loadAsync('./outputs/'+id+'-matched-locomotion.glb')
  ]);
  const group = new THREE.Group(); group.add(model.scene); group.visible=false; scene.add(group);
  const clips = Object.fromEntries(motion.animations.map(c=>[c.name.replace(/^UPF · /,''),c]));
  for (const name of ['Idle','Start','Walk','Stop']) if (!clips[name]) throw new Error('Missing '+name);
  let hips; model.scene.traverse(o=>{if(o.isBone&&normal(o.name)==='hips')hips=o;});
  if (!hips) throw new Error('No Hips bone');
  const mixer = new THREE.AnimationMixer(model.scene);
  const a={id,model:model.scene,group,hips,mixer,clips,actions:Object.fromEntries(Object.entries(clips).map(([n,c])=>[n,mixer.clipAction(c)]))};
  a.floorY=computeFloor(a);
  const plan=[['Idle',clips.Idle.duration-1,clips.Idle.duration],['Start',0,clips.Start.duration],['Walk',0,clips.Walk.duration],['Walk',0,clips.Walk.duration],['Stop',0,clips.Stop.duration],['Idle',0,1]];
  let globalTime=0, anchor=new THREE.Vector3(0,0,0);
  a.segments=plan.map(([name,from,to],i)=>{
    const start=rawRoot(a,name,from),end=rawRoot(a,name,to);
    const offset=new THREE.Vector3(anchor.x-start.x,0,anchor.z-start.z);
    const segment={index:i,name,from,to,start:globalTime,end:globalTime+to-from,offset:offset.toArray(),rootDelta:end.clone().sub(start).toArray()};
    globalTime=segment.end; anchor.x+=end.x-start.x;anchor.z+=end.z-start.z;return segment;
  });
  a.duration=globalTime; actors.set(id,a); return a;
}
function state() {
  if(!current)return null;
  const a=current, t=Math.max(0,Math.min(a.duration,currentTime));
  const s=a.segments.find(s=>t<s.end)||a.segments.at(-1);
  return {person:a.id,time:t,duration:a.duration,segment:s.index,clip:s.name,localTime:Math.min(s.to,s.from+t-s.start),weight:1,floorY:a.floorY,holderXZOffset:s.offset,sourceRootOnly:true,blend:false,footCorrection:false};
}
function seekTime(t) {
  if(!current)throw new Error('Await ready/setPerson first');
  currentTime=Math.max(0,Math.min(current.duration,Number(t)));
  const st=state(),a=current; a.group.position.fromArray(st.holderXZOffset);pose(a,st.clip,st.localTime);
  floor.position.y=a.floorY;grid.position.y=a.floorY+.0007;
  const h=a.hips.getWorldPosition(new THREE.Vector3()), focus=new THREE.Vector3(h.x,a.floorY+.91,h.z);
  camera.position.copy(focus).add(view==='front'?new THREE.Vector3(0,.27,4.6):new THREE.Vector3(4.6,.27,0));
  camera.lookAt(focus);camera.updateMatrixWorld();
  hud.textContent=(a.id==='emma'?'Emma':'Ethan')+' · '+(view==='front'?'спереди':'сбоку')+'\n'+st.clip+'  '+st.localTime.toFixed(3)+' с · вес 1\nГотовые ключи + исходное движение корня\n'+(a.id==='emma'?'Исходный шов правой ноги: 13.835 мм':'Без смешивания и коррекции стоп');
  slider.value=String(currentTime);document.querySelector('#status').textContent=currentTime.toFixed(2)+' / '+a.duration.toFixed(2)+' с';
  renderer.render(scene,camera);return st;
}
async function setPerson(id) {
  const a=await loadActor(id);if(current)current.group.visible=false;
  current=a;a.group.visible=true;document.querySelector('#person').value=id;slider.max=String(a.duration);seekTime(0);
  return {id,duration:a.duration,floorY:a.floorY,segments:a.segments};
}
function setView(name) {if(!['side','front'].includes(name))throw new Error('Invalid view');view=name;document.querySelector('#view').value=name;if(current)seekTime(currentTime);}
function frame(clock) {if(running&&current){const dt=lastClock===undefined?0:(clock-lastClock)/1000;seekTime(currentTime+dt);if(currentTime>=current.duration)running=false;}lastClock=clock;requestAnimationFrame(frame);}
requestAnimationFrame(frame);
document.querySelector('#person').onchange=e=>setPerson(e.target.value);
document.querySelector('#view').onchange=e=>setView(e.target.value);
slider.oninput=e=>{running=false;seekTime(Number(e.target.value));};
document.querySelector('#play').onclick=()=>{if(currentTime>=current.duration)seekTime(0);running=!running;lastClock=undefined;};
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();if(current)seekTime(currentTime);});
const api={setPerson,setView,seekTime,getState:state,get canvas(){return renderer.domElement;},get duration(){return current?.duration;}};
api.ready=(async()=>{await Promise.all([loadActor('emma'),loadActor('ethan')]);return setPerson('ethan');})();
window.__MATCHED_REPLAY=api;window.ready=api.ready;window.setPerson=setPerson;window.setView=setView;window.seekTime=seekTime;
api.ready.catch(e=>{hud.textContent='ERROR: '+e.message;console.error(e);});
