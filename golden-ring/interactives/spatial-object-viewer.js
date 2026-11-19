import * as THREE from './vendor/three-0.180/three.module.min.js';
import {loadObjects,objectName} from './spatial-objects.js';

let studio,unavailable=false;
function makeViewer(canvas){
  const gl=canvas.getContext('webgl2',{antialias:true,alpha:false});
  if(!gl)return null;
  const renderer=new THREE.WebGLRenderer({canvas,context:gl,antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.14;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(33,1,.015,30);
  scene.background=new THREE.Color('#ded7c9');
  scene.add(new THREE.HemisphereLight('#fff1db','#aca89f',1.55));
  const sun=new THREE.DirectionalLight('#fff0d9',2.55);sun.position.set(-2.5,4,3);scene.add(sun);
  sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.bias=-.00015;sun.shadow.normalBias=.0007;
  const rim=new THREE.DirectionalLight('#d7e6fc',1.42);rim.position.set(2.4,2,-2.9);scene.add(rim);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(18,18),new THREE.MeshStandardMaterial({color:'#d0c6b5',roughness:.93}));
  floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
  const environment=new THREE.Scene();environment.background=new THREE.Color('#a3a19b');
  for(const [x,y,z,intensity] of [[-2,2,2,4],[2,1,-1,2.5],[.2,3,-2,3]]){
    const card=new THREE.Mesh(new THREE.PlaneGeometry(2.6,3.4),new THREE.MeshBasicMaterial({color:new THREE.Color(intensity,intensity*.97,intensity*.90),side:THREE.DoubleSide}));
    card.position.set(x,y,z);card.lookAt(0,0,0);environment.add(card);
  }
  const pmrem=new THREE.PMREMGenerator(renderer);
  scene.environment=pmrem.fromScene(environment,.025,.1,10).texture;scene.environmentIntensity=.66;
  pmrem.dispose();environment.traverse(o=>{o.material?.dispose();o.geometry?.dispose();});
  const center=new THREE.Vector3();
  const offsets=[];
  let object,radius=.4,yaw,pitch,drag=null;
  function paint(){
    if(!object || canvas.hidden)return;
    const w=canvas.clientWidth,h=canvas.clientHeight;
    if(!w||!h)return;
    const pixelRatio=renderer.getPixelRatio();
    if(Math.abs(canvas.width-w*pixelRatio)>1||Math.abs(canvas.height-h*pixelRatio)>1)renderer.setSize(w,h,false);
    camera.aspect=w/h;camera.updateProjectionMatrix();
    const vertical=THREE.MathUtils.degToRad(camera.fov)*.5;
    const direction=new THREE.Vector3(Math.cos(pitch)*Math.sin(yaw),Math.sin(pitch),Math.cos(pitch)*Math.cos(yaw));
    const right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
    const up=direction.clone().cross(right),slope=.83*Math.tan(vertical);
    const dist=Math.max(...offsets.map(v=>v.dot(direction)+Math.max(Math.abs(v.dot(up))/slope,Math.abs(v.dot(right))/(slope*camera.aspect))));
    camera.position.copy(center).addScaledVector(direction,dist);
    camera.lookAt(center);renderer.render(scene,camera);
  }
  function reset(){yaw=.38;pitch=.34;paint();}
  function turn(delta){yaw+=delta;paint();}
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{
    if(!drag)return;yaw-=(e.clientX-drag[0])*.012;pitch=THREE.MathUtils.clamp(pitch+(e.clientY-drag[1])*.008,.06,1.42);
    drag=[e.clientX,e.clientY];paint();
  });
  for(const ev of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(ev,()=>{drag=null;});
  canvas.addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight','Home'].includes(e.key))return;
    e.preventDefault();if(e.key==='Home')reset();else turn(e.key==='ArrowLeft'?-.25:.25);
  });
  new ResizeObserver(paint).observe(canvas);
  return {turn,reset,display(source){
    if(object)scene.remove(object);
    object=source.clone(true);scene.add(object);
    const box=new THREE.Box3().setFromObject(object);
    box.getCenter(center);radius=box.getSize(new THREE.Vector3()).length()*.5;
    offsets.length=0;
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
      offsets.push(new THREE.Vector3(x,y,z).sub(center));
    }
    floor.position.y=box.min.y-.001;
    Object.assign(sun.shadow.camera,{left:-radius*2,right:radius*2,top:radius*2,bottom:-radius*2,near:.15,far:10});
    sun.shadow.camera.updateProjectionMatrix();reset();
  }};
}
let request=0;
export async function displayObject(id) {
  const sequence=++request,canvas=document.getElementById('object-model'),still=document.getElementById('object-still'),tools=document.getElementById('object-tools');
  still.hidden=false;canvas.hidden=true;tools.hidden=true;
  document.getElementById('object-title').textContent=objectName(id);
  still.alt='Студийный рендер — '+objectName(id);
  if(unavailable)return;
  try{
    studio ||= makeViewer(canvas);
    if(!studio){unavailable=true;return;}
    const library=await loadObjects();
    if(sequence!==request || !document.getElementById('object-dialog').open)return;
    const source=library.getObjectByName(id);
    if(!source)return;
    canvas.hidden=false;still.hidden=true;tools.hidden=false;
    studio.display(source);
  }catch{canvas.hidden=true;still.hidden=false;tools.hidden=true;}
}
export function turnObject(delta){if(delta)studio?.turn(delta);else studio?.reset();}
