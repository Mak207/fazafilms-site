import * as THREE from 'three';
import { GLTFLoader } from '/golden-ring/interactives/vendor/three-0.180/GLTFLoader.js';
import { MeshoptDecoder } from '/golden-ring/tour/vendor/meshopt_decoder.mjs';
import { OrbitControls } from './vendor/OrbitControls.js';
import { createTramSystem } from './tram-system.js?v=monorail-20261124';
import { KTX2Loader } from './vendor/ktx2/loaders/KTX2Loader.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { createExhibitSystem } from './exhibits.js?v=hitem-20261124';
import { MeshBVH, acceleratedRaycast, CENTER } from './vendor/three-mesh-bvh/index.module.js';

const $ = id => document.getElementById(id);
const root = $('viewer'), stage = $('stage'), canvas = $('canvas');
const loading = $('loading'), progress = $('progress'), detail = $('loading-detail');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const diagnostics = window.__parkViewer = { state:'loading', errors:[], source:'выставка_3D вид.dwg' };
Object.defineProperty(diagnostics,'camera',{get:()=>({position:camera.position.toArray(),target:controls?.target.toArray()})});
let renderer, controls, model, bounds, size, center;
let sourceMaterials=[],sourceMeshes=[],envelopeMeshes=[];
let monorail=null,followVehicle=-1,onboardVehicle=-1,lastOnboardVehicle=0,hallOpen=true,lastFrameTime=null;
const passenger={yaw:-Math.PI/2,pitch:-.16,eye:new THREE.Vector3(-.52,2.05,.55),normalFov:43,normalNear:.05};
const passengerPointers=new Map();let pinchDistance=0;
Object.defineProperty(diagnostics,'onboard',{get:()=>({active:onboardVehicle>=0,vehicle:onboardVehicle>=0?onboardVehicle:null,yaw:passenger.yaw,pitch:passenger.pitch,eyeLocal:passenger.eye.toArray(),fov:camera.fov})});
let exhibits=null,exhibitProgress={state:'waiting',loadedObjects:0,placedInstances:0,objects:[]};
Object.defineProperty(diagnostics,'exhibits',{get:()=>exhibits?.getState()||exhibitProgress});
let inspectedExhibitId=null,inspectionTimer=null,inspectionNotice=null,inspectionSamples=0;
let inspectionReady=false,inspectionBuildTimeMs=0,inspectionGeometryCount=0,inspectionElapsedMs=0,inspectionError=null;
const inspectionHidden=new Map(),inspectionRay=new THREE.Raycaster();
inspectionRay.firstHitOnly=true;
const inspectionMessage='Осмотр: мешающие поверхности скрыты. «Экспозиция» вернёт общий вид.';
Object.defineProperty(diagnostics,'inspection',{enumerable:true,get:()=>({
  active:inspectedExhibitId!==null,exhibitId:inspectedExhibitId,
  ready:inspectionReady,error:inspectionError,geometryCount:inspectionGeometryCount,
  buildTimeMs:Number(inspectionBuildTimeMs.toFixed(2)),elapsedMs:Number(inspectionElapsedMs.toFixed(2)),
  hiddenMeshes:inspectionHidden.size,sampleCount:inspectionSamples,
  hiddenExhibitMeshes:[...inspectionHidden.keys()].filter(mesh=>mesh.userData.exhibitId).length,
  hiddenSelectedMeshes:[...inspectionHidden.keys()].filter(mesh=>mesh.userData.exhibitId===inspectedExhibitId).length,
  visibleInstances:exhibits?.group.visible?exhibits.roots.filter(instance=>{
    let visible=false;instance.traverse(node=>{if(node.isMesh&&isObjectVisible(node))visible=true;});return visible;
  }).length:0
})});
const monorailRoute={centerX:5,centerZ:-15.75,width:46,length:99.5,cornerRadius:22.5,height:19.2,floorHeight:13.2};
Object.defineProperty(diagnostics,'monorail',{get:()=>monorail?.getState()||{status:diagnostics.monorailStatus||'waiting',loaded:false,vehicleCount:0}});
let needsRender = true, active = true, transition = null, currentView = 'overview', sectionOn = false;
const clipPlane = new THREE.Plane(new THREE.Vector3(0,-1,0), 0);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(43, 1, 0.05, 4000);
camera.position.set(90,70,100);
const viewDirections = {overview:new THREE.Vector3(1.9,1.12,.72), top:new THREE.Vector3(0,1,.001), front:new THREE.Vector3(0,.16,1), back:new THREE.Vector3(-1,.55,-1.25)};
const viewNames = {overview:'Общий вид',top:'Вид сверху',front:'Вид спереди',back:'С другой стороны'};

function fail(error) {
  const message = error?.message || String(error);
  diagnostics.errors.push(message);diagnostics.state='error';root.dataset.state='error';
  loading.hidden=false;$('loading-title').textContent='Не удалось открыть 3D-модель';
  detail.textContent='Проверьте соединение и повторите загрузку.';$('retry').hidden=false;
  console.error('Park viewer:',error);
}
$('retry').onclick=()=>location.reload();

try {
  renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1,1.6));
  renderer.setClearColor(0x000000,0);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  renderer.localClippingEnabled=true;
  const environmentGenerator=new THREE.PMREMGenerator(renderer),environmentRoom=new RoomEnvironment();
  scene.environment=environmentGenerator.fromScene(environmentRoom,.04).texture;
  scene.environmentIntensity=.55;environmentRoom.dispose();environmentGenerator.dispose();
  controls=new OrbitControls(camera,canvas);
  controls.enableDamping=true;controls.dampingFactor=.08;
  controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.PAN};
  controls.touches={ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_PAN};
  controls.screenSpacePanning=true;controls.zoomToCursor=true;
  controls.minPolarAngle=.001;controls.maxPolarAngle=Math.PI*.499;
  controls.addEventListener('change',()=>{needsRender=true});
  controls.addEventListener('start',()=>{
    if(inspectedExhibitId!==null){
      clearTimeout(inspectionTimer);inspectionTimer=null;
      stopFollowing();currentView=null;transition=null;
    }else setFreeView();
  });
  controls.addEventListener('end',queueInspectionCutaway);
  canvas.addEventListener('contextmenu',event=>event.preventDefault());
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();fail(new Error('WebGL context lost'))});
  const ambient = new THREE.HemisphereLight(0xf2f5ef,0x6a7667,1.2);scene.add(ambient);
  const key = new THREE.DirectionalLight(0xfff3df,2.1);key.position.set(90,140,80);scene.add(key);
  const fill = new THREE.DirectionalLight(0xd0e4f1,.7);fill.position.set(-100,55,-50);scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff,.3);rim.position.set(15,20,-110);scene.add(rim);
  function resize(){
    const width=stage.clientWidth,height=stage.clientHeight;if(!width||!height)return;
    renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
    if(model&&inspectedExhibitId!==null)focusExhibit(inspectedExhibitId,true);
    else if(model&&currentView)setView(currentView,true);
    needsRender=true;
  }
  new ResizeObserver(resize).observe(stage);resize();
  const loader=new GLTFLoader();loader.setMeshoptDecoder(MeshoptDecoder);
  const textureLoader=new KTX2Loader().setTranscoderPath('vendor/ktx2/libs/basis/').setWorkerLimit(2);
  textureLoader.detectSupport(renderer);loader.setKTX2Loader(textureLoader);
  loader.load('assets/park.glb?v=1',gltf=>{
    try {
      model=gltf.scene;model.updateMatrixWorld(true);
      bounds=new THREE.Box3().setFromObject(model);size=bounds.getSize(new THREE.Vector3());center=bounds.getCenter(new THREE.Vector3());
      if(bounds.isEmpty()||!Number.isFinite(size.length())||size.length()===0)throw new Error('Empty model bounds');
      let meshes=0,triangles=0;const materials=new Set();
      model.traverse(node=>{
        if(!node.isMesh)return;
        meshes++;triangles+=(node.geometry.index?.count || node.geometry.attributes.position?.count || 0)/3;
        for(const material of Array.isArray(node.material)?node.material:[node.material]){
          if(material){materials.add(material);material.clippingPlanes=[];}
        }
      });
      // Thin crease lines make the original CAD structure readable without replacing its materials.
      const edgeMaterial=new THREE.LineBasicMaterial({color:0x26382e,transparent:true,opacity:.22,depthWrite:false});
      const edgeCache=new Map();
      sourceMeshes=[];model.traverse(node=>{if(node.isMesh&&!node.isInstancedMesh)sourceMeshes.push(node)});
      envelopeMeshes=sourceMeshes.filter(node=>/^A-(ROOF|WALL|CLNG|GLAZ)/.test(node.name));
      let edgeBudget=500000;
      for(const node of [...sourceMeshes].sort((a,b)=>a.geometry.attributes.position.count-b.geometry.attributes.position.count)){
        const vertices=node.geometry.attributes.position.count;
        if(vertices>120000||vertices>edgeBudget)continue;
        edgeBudget-=vertices;
        let geometry=edgeCache.get(node.geometry);
        if(!geometry){geometry=new THREE.EdgesGeometry(node.geometry,32);edgeCache.set(node.geometry,geometry);}
        const edges=new THREE.LineSegments(geometry,edgeMaterial);edges.name='CAD surface edges';edges.renderOrder=1;node.add(edges);
      }
      materials.add(edgeMaterial);
      sourceMaterials=[...materials];
      scene.add(model);
      setHallOpen(true);
      camera.near=Math.max(.02,size.length()/15000);camera.far=size.length()*12;camera.updateProjectionMatrix();
      controls.minDistance=Math.max(.3,size.length()/700);controls.maxDistance=size.length()*4;
      $('section-height').min=String(Math.max(0,bounds.min.y));
      $('section-height').max=String(bounds.max.y);
      $('section-height').step=String(Math.max(.05,Number((size.y/500).toFixed(2))));
      $('section-height').value=String(bounds.min.y+size.y*.5);
      updateSection();
      Object.assign(diagnostics,{state:'ready',meshes,triangles:Math.round(triangles),materials:materials.size,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},sourceUnits:'meters'});
      root.dataset.state='ready';$('model-info').textContent='3D-предпросмотр из DWG';
      setView('overview',true);progress.style.width='100%';loading.hidden=true;
      root.querySelectorAll('[data-view],#section-toggle,#reset,#envelope-toggle').forEach(button=>button.disabled=false);
      root.querySelector('[data-view="exhibits"]').disabled=true;
      needsRender=true;
      const monorailReady=startMonorail(loader);
      startExhibits(loader,monorailReady);
    }catch(error){fail(error);}
  },event=>{
    if(event.lengthComputable&&event.total){const percent=Math.min(99,Math.round(event.loaded/event.total*100));progress.style.width=percent+'%';detail.textContent=percent===99?'Подготавливаем геометрию…':'Загружено '+percent+'%';}
    else{detail.textContent='Загружено '+(event.loaded/1048576).toFixed(1).replace('.',',')+' МБ';}
  },fail);

  function frame(time){
    requestAnimationFrame(frame);
    const delta=lastFrameTime===null?0:Math.min(.1,Math.max(0,(time-lastFrameTime)/1000));lastFrameTime=time;
    if(!active||document.hidden)return;
    if(monorail){
      if(monorail.update(delta))needsRender=true;
      if(onboardVehicle>=0){
        updatePassengerCamera();
      }else if(followVehicle>=0){
        const pose=monorail.getFollowPose(followVehicle),blend=1-Math.exp(-delta*7);
        if(camera.position.distanceToSquared(pose.position)>1e-8||controls.target.distanceToSquared(pose.target)>1e-8){
          camera.position.lerp(pose.position,blend);controls.target.lerp(pose.target,blend);needsRender=true;
        }
      }
    }
    if(transition){
      const t=Math.min(1,(time-transition.start)/transition.duration),e=t*t*(3-2*t);
      camera.position.lerpVectors(transition.from,transition.to,e);controls.target.lerpVectors(transition.fromTarget,transition.toTarget,e);needsRender=true;
      if(t===1)transition=null;
    }
    if(onboardVehicle<0)controls.update();
    if(needsRender){renderer.render(scene,camera);needsRender=false;diagnostics.renderedFrames=(diagnostics.renderedFrames||0)+1;diagnostics.renderTriangles=renderer.info.render.triangles;}
  }
  requestAnimationFrame(frame);
}catch(error){fail(error);}

function fittedView(direction){
  const d=direction.clone().normalize(),right=new THREE.Vector3().crossVectors(camera.up,d).normalize(),up=new THREE.Vector3().crossVectors(d,right).normalize();
  const vTan=Math.tan(THREE.MathUtils.degToRad(camera.fov)/2),hTan=vTan*camera.aspect;
  let rightLimit=-Infinity,leftLimit=-Infinity,topLimit=-Infinity,bottomLimit=-Infinity;
  const p=new THREE.Vector3();
  model.updateMatrixWorld(true);
  // Fit the actual source vertices: a sparse CAD assembly can have a much larger bounding box than its visible silhouette.
  model.traverse(node=>{
    if(!node.isMesh)return;
    const positions=node.geometry.attributes.position;
    if(!positions)return;
    for(let i=0;i<positions.count;i++){
      p.fromBufferAttribute(positions,i).applyMatrix4(node.matrixWorld).sub(center);
      const x=p.dot(right),y=p.dot(up),z=p.dot(d);
      rightLimit=Math.max(rightLimit,x/hTan+z);leftLimit=Math.max(leftLimit,-x/hTan+z);
      topLimit=Math.max(topLimit,y/vTan+z);bottomLimit=Math.max(bottomLimit,-y/vTan+z);
    }
  });
  const target=center.clone().addScaledVector(right,(rightLimit-leftLimit)*hTan/2).addScaledVector(up,(topLimit-bottomLimit)*vTan/2);
  const distance=Math.max((rightLimit+leftLimit)/2,(topLimit+bottomLimit)/2)*1.12;
  return {position:target.clone().addScaledVector(d,distance),target};
}
function moveCamera(position,target,instant=false){
  if(!controls)return;
  if(instant||reduceMotion){camera.position.copy(position);controls.target.copy(target);controls.update();transition=null;}
  else transition={from:camera.position.clone(),to:position,fromTarget:controls.target.clone(),toTarget:target.clone(),start:performance.now(),duration:650};
  needsRender=true;
}
function setView(view,instant=false){
  if(!model)return;
  clearExhibitInspection();stopFollowing();
  if(view==='exhibits'){
    const box=exhibits?.getBounds();
    if(!box||box.isEmpty())return;
    currentView='exhibits';$('tram-camera').value='free';$('exhibit-select').value='all';
    exhibits.setVisible(true);setHallOpen(true);
    const d=camera.aspect<1?new THREE.Vector3(.45,1.4,2.1):new THREE.Vector3(1.7,1.25,.9);
    const fitted=fitBox(box,d);moveCamera(fitted.position,fitted.target,instant);
    document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===view)));
    $('view-name').textContent='Экспонаты парка';diagnostics.view='exhibits';return;
  }
  if(view==='route'){
    if(!monorail)return setView('overview',instant);
    currentView='route';$('tram-camera').value='route';
    const box=new THREE.Box3().setFromObject(monorail.group);
    const d=camera.aspect<1?new THREE.Vector3(.45,1.55,2.1):new THREE.Vector3(1.9,1.2,.7);
    const fitted=fitBox(box,d);moveCamera(fitted.position,fitted.target,instant);
    document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===view)));
    $('view-name').textContent='Кольцо монорельса';diagnostics.view='route';return;
  }
  $('tram-camera').value='free';
  currentView=view;
  const direction=view==='overview'&&camera.aspect<1 ? new THREE.Vector3(.45,1.6,2.3) : view==='top'&&camera.aspect>1 ? new THREE.Vector3(.001,1,0) : viewDirections[view];
  const fitted=fittedView(direction);moveCamera(fitted.position,fitted.target,instant);
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===view)));
  $('view-name').textContent=viewNames[view];diagnostics.view=view;
}
function updateSection(){
  if(!model)return;
  clearExhibitInspection();
  const height=Number($('section-height').value);clipPlane.constant=height;
  for(const material of sourceMaterials){
    if(Boolean(material.clippingPlanes?.length)!==sectionOn){material.clippingPlanes=sectionOn?[clipPlane]:[];material.clipShadows=true;material.needsUpdate=true;}
  }
  $('section-value').textContent=height.toLocaleString('ru-RU',{maximumFractionDigits:1})+' м';
  diagnostics.section={enabled:sectionOn,height};needsRender=true;
  exhibits?.setSection(sectionOn,clipPlane);
}
root.querySelectorAll('[data-view],#section-toggle,#reset,#envelope-toggle').forEach(button=>button.disabled=true);
document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>setView(button.dataset.view));
$('reset').onclick=()=>{sectionOn=false;$('section-toggle').setAttribute('aria-pressed','false');$('section-controls').hidden=true;setHallOpen(true);updateSection();setView(exhibits?.roots.length?'exhibits':monorail?'route':'overview');};
$('section-toggle').onclick=()=>{sectionOn=!sectionOn;$('section-toggle').setAttribute('aria-pressed',String(sectionOn));$('section-controls').hidden=!sectionOn;updateSection();};
$('section-height').addEventListener('input',updateSection);
function showHelp(show){$('help').hidden=!show;$('help-toggle').setAttribute('aria-expanded',String(show));}
$('help-toggle').onclick=()=>showHelp($('help').hidden);$('close-help').onclick=()=>showHelp(false);
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){showHelp(false);if(onboardVehicle>=0)setView('route');}
  if(document.activeElement!==canvas)return;
  if(event.key==='Home'){event.preventDefault();setView('overview');}
  if(onboardVehicle>=0&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
    event.preventDefault();passenger.yaw+=event.key==='ArrowLeft'?-.075:event.key==='ArrowRight'?.075:0;
    passenger.pitch=THREE.MathUtils.clamp(passenger.pitch+(event.key==='ArrowUp'?.05:event.key==='ArrowDown'?-.05:0),-.85,.55);needsRender=true;
  }
});
$('fullscreen').onclick=async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await root.requestFullscreen();}
  catch{const notice=$('scene-notice');notice.textContent='Для просмотра во весь экран откройте 3D-тур отдельно.';notice.hidden=false;}
};
document.addEventListener('fullscreenchange',()=>{$('fullscreen').textContent=document.fullscreenElement?'Свернуть':'На весь экран';needsRender=true;});
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='park-tour-visibility')return;
  active=Boolean(event.data.visible);if(active){window.dispatchEvent(new Event('resize'));needsRender=true;}
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)needsRender=true;});
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
canvas.addEventListener('dblclick',event=>{
  if(!model||!controls)return;
  if(onboardVehicle>=0){passenger.yaw=-Math.PI/2;passenger.pitch=-.16;camera.fov=68;camera.updateProjectionMatrix();needsRender=true;return;}
  const rect=canvas.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2);raycaster.setFromCamera(pointer,camera);
  const targets=[...sourceMeshes.filter(mesh=>mesh.visible),...(monorail?.vehicles||[]),...(exhibits?.group.visible?exhibits.roots:[])];
  const hits=raycaster.intersectObjects(targets,true);const hit=hits.find(item=>item.object.isMesh&&(item.object.userData.monorail||!sectionOn||item.point.y<=Number($('section-height').value)));if(!hit)return;
  clearExhibitInspection();stopFollowing();$('tram-camera').value='free';
  const direction=camera.position.clone().sub(controls.target).normalize();const distance=Math.max(size.length()*.055,camera.position.distanceTo(hit.point)*.4);
  currentView=null;moveCamera(hit.point.clone().addScaledVector(direction,distance),hit.point);document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed','false'));$('view-name').textContent='Детальный обзор';diagnostics.view='detail';
});

function fitBox(box,direction){
  const target=box.getCenter(new THREE.Vector3()),d=direction.clone().normalize();
  const right=new THREE.Vector3().crossVectors(camera.up,d).normalize(),up=new THREE.Vector3().crossVectors(d,right).normalize();
  const vt=Math.tan(THREE.MathUtils.degToRad(camera.fov)/2),ht=vt*camera.aspect;
  let distance=0;
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
    const p=new THREE.Vector3(x,y,z).sub(target),depth=p.dot(d);
    distance=Math.max(distance,Math.abs(p.dot(right))/ht+depth,Math.abs(p.dot(up))/vt+depth);
  }
  return {position:target.clone().addScaledVector(d,distance*1.13),target};
}
function stopFollowing(){
  followVehicle=-1;diagnostics.followVehicle=null;
  if(onboardVehicle>=0){
    onboardVehicle=-1;passengerPointers.clear();pinchDistance=0;
    controls.enabled=true;camera.fov=passenger.normalFov;camera.near=passenger.normalNear;camera.updateProjectionMatrix();
    $('tram-onboard').setAttribute('aria-pressed','false');$('onboard-hint').hidden=true;canvas.classList.remove('onboard');
    canvas.setAttribute('aria-label','3D-модель. Левая кнопка — вращение, правая — сдвиг, колесо — масштаб. Двойной щелчок — приблизить выбранное место.');
  }
}

function updatePassengerCamera(){
  if(!monorail||onboardVehicle<0)return;
  const vehicle=monorail.vehicles[onboardVehicle];vehicle.updateWorldMatrix(true,false);
  const quaternion=vehicle.getWorldQuaternion(new THREE.Quaternion());
  const direction=new THREE.Vector3(Math.sin(passenger.yaw)*Math.cos(passenger.pitch),Math.sin(passenger.pitch),Math.cos(passenger.yaw)*Math.cos(passenger.pitch)).applyQuaternion(quaternion);
  const position=vehicle.localToWorld(passenger.eye.clone()),target=position.clone().addScaledVector(direction,20);
  if(camera.position.distanceToSquared(position)>1e-10||controls.target.distanceToSquared(target)>1e-10)needsRender=true;
  camera.position.copy(position);controls.target.copy(target);
  camera.up.set(0,1,0);camera.lookAt(controls.target);
}

function setPassengerView(index=0){
  if(!monorail||!monorail.vehicles[index])return;
  clearExhibitInspection();
  if(onboardVehicle<0){passenger.normalFov=camera.fov;passenger.normalNear=camera.near;}
  followVehicle=-1;diagnostics.followVehicle=null;onboardVehicle=index;lastOnboardVehicle=index;
  currentView=null;transition=null;controls.enabled=false;
  passenger.yaw=-Math.PI/2;passenger.pitch=-.16;camera.fov=68;camera.near=.025;camera.updateProjectionMatrix();
  setHallOpen(true);$('tram-camera').value='inside-'+index;
  $('tram-onboard').setAttribute('aria-pressed','true');$('onboard-hint').hidden=false;canvas.classList.add('onboard');
  canvas.setAttribute('aria-label','Вид из вагона. Потяните мышью или пальцем либо нажмите стрелки, чтобы оглядеться. Колесо или щипок — приближение. Escape — весь маршрут.');
  $('view-name').textContent='Из вагона '+(index+1)+' · выставка';diagnostics.view='onboard';
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed','false'));
  updatePassengerCamera();canvas.focus({preventScroll:true});
}

// Passenger look keeps the eye fixed in the moving wagon; OrbitControls only handles external views.
canvas.addEventListener('pointerdown',event=>{
  if(onboardVehicle<0||event.pointerType==='mouse'&&![0,2].includes(event.button))return;
  event.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);
  passengerPointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  const points=[...passengerPointers.values()];pinchDistance=points.length===2?Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y):0;
});
canvas.addEventListener('pointermove',event=>{
  if(onboardVehicle<0||!passengerPointers.has(event.pointerId))return;
  const previous=passengerPointers.get(event.pointerId);passengerPointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(passengerPointers.size===1){
    passenger.yaw-=(event.clientX-previous.x)*.004;
    passenger.pitch=THREE.MathUtils.clamp(passenger.pitch+(event.clientY-previous.y)*.003,-.85,.55);
  }else if(passengerPointers.size===2){
    const points=[...passengerPointers.values()],distance=Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);
    if(pinchDistance>0&&distance>0){camera.fov=THREE.MathUtils.clamp(camera.fov*pinchDistance/distance,45,85);camera.updateProjectionMatrix();}
    pinchDistance=distance;
  }
  event.preventDefault();needsRender=true;
});
for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,event=>{passengerPointers.delete(event.pointerId);pinchDistance=0;});
canvas.addEventListener('wheel',event=>{if(onboardVehicle<0)return;event.preventDefault();camera.fov=THREE.MathUtils.clamp(camera.fov+event.deltaY*.025,45,85);camera.updateProjectionMatrix();needsRender=true;},{passive:false});
function setFreeView(){
  clearExhibitInspection();stopFollowing();currentView=null;transition=null;$('tram-camera').value='free';
  $('view-name').textContent='Свободный обзор';diagnostics.view='free';
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed','false'));
}
function setHallOpen(open){
  clearExhibitInspection();hallOpen=Boolean(open);envelopeMeshes.forEach(mesh=>{mesh.visible=!hallOpen});
  $('envelope-toggle').setAttribute('aria-pressed',String(hallOpen));
  diagnostics.hallOpen=hallOpen;needsRender=true;
}
$('envelope-toggle').onclick=()=>setHallOpen(!hallOpen);
function syncMonorailControls(state){
  $('tram-play').textContent=state.playing?'Пауза':'Пуск';
  $('tram-play').setAttribute('aria-label',state.playing?'Приостановить оба вагона':'Запустить оба вагона');
  $('tram-play').setAttribute('aria-pressed',String(state.playing));
  if(state.loaded)$('model-info').textContent=state.playing?'Монорельс · два вагона в пути':'Монорельс · движение на паузе';
}
async function startMonorail(loader){
  diagnostics.monorailStatus='loading';$('model-info').textContent='Загружаем вагоны монорельса…';
  try{
    const floors=sourceMeshes.filter(mesh=>/^(A-FLOR|S-SLAB)/.test(mesh.name));
    const floorRay=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0),floorOrigin=new THREE.Vector3();
    diagnostics.supportFloors=[];
    const supportFloorHeight=(x,z)=>{
      floorOrigin.set(x,monorailRoute.height-1.2,z);floorRay.set(floorOrigin,down);
      floorRay.far=Math.max(30,monorailRoute.height-bounds.min.y+2);
      const hit=floorRay.intersectObjects(floors,false)[0],y=hit?hit.point.y:bounds.min.y;
      diagnostics.supportFloors.push({x,z,y,matchedFloor:Boolean(hit)});return y;
    };
    monorail=await createTramSystem({scene,loader,modelUrl:'assets/tram-monorail.glb?v=20261124',routeConfig:monorailRoute,supportFloorHeight,onState:state=>{diagnostics.monorailStatus=state.status;if(state.loaded)syncMonorailControls(state);}});
    // Respect a visitor's motion preference; an explicit press on «Пуск» always starts both wagons.
    if(reduceMotion)monorail.setPlaying(false);
    monorail.group.traverse(node=>{node.userData.monorail=true;for(const material of Array.isArray(node.material)?node.material:[node.material])if(material?.map)material.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());});
    root.querySelectorAll('#tram-play,#tram-onboard,#tram-camera,#tram-speed').forEach(control=>control.disabled=false);
    syncMonorailControls(monorail.getState());
    if(currentView==='overview'||currentView==='route')setView('route',true);
    needsRender=true;
  }catch(error){
    diagnostics.monorailStatus='error';diagnostics.errors.push('Монорельс: '+(error?.message||error));
    $('model-info').textContent='Модель здания';$('scene-notice').textContent='Вагоны не загрузились. Обновите страницу, чтобы повторить загрузку монорельса.';$('scene-notice').hidden=false;
    console.error('Monorail:',error);
  }
}
$('tram-play').onclick=()=>{if(monorail){monorail.setPlaying(!monorail.getState().playing);needsRender=true;}};
$('tram-speed').onchange=()=>{if(monorail)monorail.setSpeed(Number($('tram-speed').value));};
$('tram-onboard').onclick=()=>{if(onboardVehicle>=0)setView('route');else setPassengerView(followVehicle>=0?followVehicle:lastOnboardVehicle);};
$('tram-camera').onchange=()=>{
  if(!monorail)return;
  const value=$('tram-camera').value;
  if(value==='route'){setView('route');return;}
  if(value==='free'){setFreeView();return;}
  if(value.startsWith('inside-')){setPassengerView(Number(value.slice(-1)));return;}
  clearExhibitInspection();stopFollowing();
  followVehicle=value==='follow-1'?1:0;currentView=null;transition=null;diagnostics.followVehicle=followVehicle;
  setHallOpen(true);
  const pose=monorail.getFollowPose(followVehicle);
  camera.position.copy(pose.position);controls.target.copy(pose.target);controls.update();
  $('view-name').textContent='За вагоном '+(followVehicle+1);diagnostics.view='follow';
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed','false'));needsRender=true;
};

function syncExhibitControls(state){
  exhibitProgress=state;
  const count=state.placedInstances||0,total=state.requestedInstances||0;
  const noun=count%100>=11&&count%100<=14?'экспонатов':count%10===1?'экспонат':[2,3,4].includes(count%10)?'экспоната':'экспонатов';
  $('exhibit-status').textContent=state.state==='loading'?'Загружаем экспонаты · '+count+' / '+total:state.state==='error'?'Экспонаты не загрузились':!inspectionReady?'Подготавливаем осмотр экспонатов…':'В парке · '+count+' '+noun;
  const select=$('exhibit-select'),selected=select.value;
  const options=[...select.options].map(option=>option.value);
  for(const row of state.objects||[]){
    if(row.status!=='loaded'||!row.placements?.length||options.includes(row.id))continue;
    const option=document.createElement('option');option.value=row.id;
    option.textContent=row.name+(row.placements.length>1?' · '+row.placements.length+' шт.':'');select.append(option);
  }
  select.append(...[...select.options].filter(option=>option.value!=='all').sort((a,b)=>a.value.localeCompare(b.value)));
  const interactive=Boolean(exhibits)&&inspectionReady&&count>0;
  select.value=selected||'all';select.disabled=!interactive;
  $('exhibit-visible').disabled=!interactive;$('exhibit-visible').setAttribute('aria-pressed',String(state.visible!==false));
  root.querySelector('[data-view="exhibits"]').disabled=!interactive;
  needsRender=true;
}
async function startExhibits(loader,monorailReady){
  try{
    exhibits=await createExhibitSystem({scene,loader,sourceMeshes,manifestUrl:'assets/exhibits/manifest.json?v=hitem-20261124',
      anisotropy:Math.min(8,renderer.capabilities.getMaxAnisotropy()),onChange:()=>{needsRender=true;},onProgress:syncExhibitControls});
    await monorailReady;
    await prepareInspectionRaycasts();
    inspectionReady=true;
    exhibits.setSection(sectionOn,clipPlane);syncExhibitControls(exhibits.getState());
    const state=exhibits.getState();
    if(state.state==='partial'){
      $('scene-notice').textContent=state.rejectedInstances?'Часть экспонатов ещё требует уточнения позиции. Показаны подтверждённые размещения.':'Часть экспонатов не загрузилась. Обновите страницу для повторной загрузки.';$('scene-notice').hidden=false;
    }
    if((currentView==='overview'||currentView==='route')&&exhibits.roots.length)setView('exhibits',true);
  }catch(error){
    inspectionError=error?.message||String(error);
    exhibitProgress={state:'error',loadedObjects:0,placedInstances:0,objects:[],errors:[inspectionError]};
    syncExhibitControls(exhibitProgress);diagnostics.errors.push('Экспонаты: '+(error?.message||error));console.error('Exhibits:',error);
  }
}
// Build one indirect BVH per shared geometry while the scene is loading.
// The original index order, geometry, transforms and rendered materials stay intact.
async function prepareInspectionRaycasts(){
  const meshes=new Set(),geometries=new Set();
  const collect=node=>{
    if(!node.isMesh||node.isInstancedMesh||node.isSkinnedMesh||node.isBatchedMesh)return;
    const geometry=node.geometry,triangles=(geometry.index?.count||geometry.attributes.position?.count||0)/3;
    if(triangles<1000)return;
    meshes.add(node);geometries.add(geometry);
  };
  sourceMeshes.forEach(collect);monorail?.group.traverse(collect);exhibits?.group.traverse(collect);
  for(const geometry of geometries){
    if(geometry.boundsTree)continue;
    // Yield between geometries so preparing inspection does not monopolize the UI.
    await new Promise(resolve=>setTimeout(resolve,0));
    const started=performance.now();
    geometry.boundsTree=new MeshBVH(geometry,{strategy:CENTER,indirect:true});
    inspectionBuildTimeMs+=performance.now()-started;inspectionGeometryCount++;
  }
  for(const mesh of meshes)mesh.raycast=acceleratedRaycast;
}

// Inspection hides only actual ray intersections in front of the selected models.
// Original visibility is restored on every recomputation and on leaving the view.
function isObjectVisible(object){
  for(let node=object;node;node=node.parent)if(!node.visible)return false;
  return true;
}
function restoreInspectionMeshes(){
  for(const [mesh,visible] of inspectionHidden)mesh.visible=visible;
  inspectionHidden.clear();
}
function clearInspectionNotice(){
  if(!inspectionNotice)return;
  const notice=$('scene-notice');
  if(notice.textContent===inspectionMessage){
    notice.textContent=inspectionNotice.text;notice.hidden=inspectionNotice.hidden;
  }
  inspectionNotice=null;
}
function clearExhibitInspection(){
  clearTimeout(inspectionTimer);inspectionTimer=null;
  restoreInspectionMeshes();clearInspectionNotice();
  inspectedExhibitId=null;inspectionSamples=0;diagnostics.selectedExhibit=null;
  $('exhibit-select').value='all';needsRender=true;
}
function queueInspectionCutaway(){
  clearTimeout(inspectionTimer);
  if(inspectedExhibitId===null)return;
  // Wait briefly for OrbitControls damping after pointer release or wheel input.
  inspectionTimer=setTimeout(()=>{
    inspectionTimer=null;
    if(inspectedExhibitId!==null)applyInspectionCutaway(camera.position);
  },240);
}
function inspectionBoxPoints(box){
  const middle=box.getCenter(new THREE.Vector3()),points=[middle];
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
    points.push(new THREE.Vector3(x,y,z));
  }
  for(const axis of ['x','y','z'])for(const edge of [box.min[axis],box.max[axis]]){
    const point=middle.clone();point[axis]=edge;points.push(point);
  }
  return points;
}
function applyInspectionCutaway(origin){
  if(inspectedExhibitId===null||!inspectionReady||!exhibits?.group.visible)return;
  const started=performance.now();
  restoreInspectionMeshes();
  const selected=exhibits.roots.filter(instance=>instance.userData.exhibitId===inspectedExhibitId||instance.userData.instanceId===inspectedExhibitId);
  if(!selected.length){clearExhibitInspection();return;}
  const selectedSet=new Set(selected),candidates=new Set();
  const addMesh=node=>{
    if(node.isMesh&&isObjectVisible(node))candidates.add(node);
  };
  scene.updateMatrixWorld(true);
  sourceMeshes.forEach(addMesh);monorail?.group.traverse(addMesh);
  for(const instance of exhibits.roots)if(!selectedSet.has(instance))instance.traverse(addMesh);
  const points=selected.flatMap(instance=>inspectionBoxPoints(new THREE.Box3().setFromObject(instance)));
  inspectionSamples=points.length;
  const meshes=[...candidates],materialSides=new Map();
  // From inside a wall, the exit face may be back-facing. CPU-only DoubleSide
  // catches it without altering rendered material properties or shared textures.
  for(const mesh of meshes)for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
    if(material&&!materialSides.has(material)){materialSides.set(material,material.side);material.side=THREE.DoubleSide;}
  }
  try{
    const direction=new THREE.Vector3();
    for(const point of points){
      direction.subVectors(point,origin);
      const distance=direction.length();
      if(distance<=camera.near)continue;
      inspectionRay.set(origin,direction.divideScalar(distance));
      inspectionRay.near=camera.near;inspectionRay.far=Math.max(camera.near,distance-.015);
      const hits=inspectionRay.intersectObjects(meshes.filter(mesh=>!inspectionHidden.has(mesh)),false);
      for(const hit of hits){
        const mesh=hit.object;
        if(!inspectionHidden.has(mesh)){inspectionHidden.set(mesh,mesh.visible);mesh.visible=false;}
      }
    }
  }finally{
    for(const [material,side] of materialSides)material.side=side;
  }
  if(inspectionHidden.size){
    const notice=$('scene-notice');
    if(!inspectionNotice)inspectionNotice={text:notice.textContent,hidden:notice.hidden};
    notice.textContent=inspectionMessage;notice.hidden=false;
  }else clearInspectionNotice();
  inspectionElapsedMs=performance.now()-started;needsRender=true;
}
function focusExhibit(id,instant=false){
  if(!exhibits||!inspectionReady)return;
  if(id==='all'){setView('exhibits');return;}
  const box=exhibits.getBounds(id);if(!box||box.isEmpty())return;
  stopFollowing();$('tram-camera').value='free';currentView=null;setHallOpen(true);exhibits.setVisible(true);
  sectionOn=false;$('section-toggle').setAttribute('aria-pressed','false');$('section-controls').hidden=true;updateSection();
  const fitted=fitBox(box,new THREE.Vector3(1.4,.85,1.5));
  inspectedExhibitId=id;applyInspectionCutaway(fitted.position);moveCamera(fitted.position,fitted.target,instant);
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed','false'));
  const row=exhibits.getState().objects.find(object=>object.id===id);
  $('exhibit-select').value=id;$('view-name').textContent=row?.name||'Экспонат';diagnostics.view='exhibit';diagnostics.selectedExhibit=id;
}
$('exhibit-select').onchange=()=>focusExhibit($('exhibit-select').value);
$('exhibit-visible').onclick=()=>{clearExhibitInspection();if(exhibits)exhibits.setVisible(!exhibits.group.visible);};
