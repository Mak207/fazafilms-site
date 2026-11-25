import { createZoneMap } from './zone-map.js?v=park-floor-colors-20261125';
import { createExhibitionZones } from './zones-controller.js?v=park-walk-20261125';
import { createWalkMode } from './walk-mode.js?v=installations-walk-20261125';
import { createInstallationsWalkBridge } from './installations-walk-bridge.js?v=installations-walk-20261125';
import { loadEquipmentSceneLink } from '../installations/equipment-link.js?v=equipment-3d-20261125';
import * as THREE from 'three';
import { GLTFLoader } from '/golden-ring/interactives/vendor/three-0.180/GLTFLoader.js';
import { MeshoptDecoder } from '/golden-ring/tour/vendor/meshopt_decoder.mjs';
import { OrbitControls } from './vendor/OrbitControls.js';
import { createTramStationControls } from './tram-station-controls.js?v=park-exhibition-20261125-r2';
import { createTramSystem, MONORAIL_ROUTE_CONFIG, MONORAIL_BOARDING_GATE } from './tram-system.js?v=park-exhibition-20261125-r2';
import { KTX2Loader } from './vendor/ktx2/loaders/KTX2Loader.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { createExhibitSystem } from './exhibits.js?v=equipment-3d-20261125';
import { createExhibitEditor } from './exhibit-editor.js?v=equipment-3d-20261125';
import { startParkCrowd } from './crowd/park-crowd.js?v=park-exhibition-20261125-r2';
import { createDynamicObstacleAdapter } from './crowd/dynamic-obstacles.js?v=park-walk-20261125';
import { attachIcebreakerDetails } from './icebreaker-details.js?v=park-exhibition-20261125-r2';
import { applyWorkingOpenings } from './cad-openings.js?v=park-exhibition-20261125-r2';
import { initViewerUI } from './ui-module.js?v=park-exhibition-20261125-r2';
import { createRgoZones } from './rgo-zones.js?v=park-floor-colors-20261125';
import { MeshBVH, acceleratedRaycast, CENTER } from './vendor/three-mesh-bvh/index.module.js';

const $ = id => document.getElementById(id);
const root = $('viewer'), stage = $('stage'), canvas = $('canvas');
const loading = $('loading'), progress = $('progress'), detail = $('loading-detail');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Keep the initial request while selection handlers update the address bar.
const initialNavigation=new URLSearchParams(location.search);
const installationsWalkEmbedded=initialNavigation.get('embedded')==='installations'&&window.parent!==window;
if(installationsWalkEmbedded)document.documentElement.dataset.installationsWalk='true';
window.addEventListener('beforeunload',()=>{equipmentLink?.dispose();installationsWalkBridge.dispose();},{once:true});
const exhibitQuality=initialNavigation.get('quality')==='high'?'high':'fast';
const exhibitManifestPath=exhibitQuality==='high'?'assets/exhibits/manifest.json':'assets/exhibits/preview/manifest.json';
const diagnostics = window.__parkViewer = { state:'loading', errors:[], source:'выставка_3D вид.dwg' };
function qualityUrl(value){
  const url=new URL(location.href);
  url.searchParams.set('quality',value==='high'?'high':'fast');
  return url.href;
}
Object.defineProperty(diagnostics,'quality',{enumerable:true,get:()=>({
  mode:exhibitQuality,manifestUrl:exhibitManifestPath,
  urls:{fast:qualityUrl('fast'),high:qualityUrl('high')}
})});
$('exhibit-quality').value=exhibitQuality;$('exhibit-quality').disabled=false;
$('exhibit-quality').onchange=()=>{
  const value=$('exhibit-quality').value;
  if(value!==exhibitQuality)location.assign(qualityUrl(value));
};
Object.defineProperty(diagnostics,'camera',{get:()=>({position:camera.position.toArray(),target:controls?.target.toArray(),fov:camera.fov,aspect:camera.aspect,near:camera.near,far:camera.far})});
let renderer, controls, model, bounds, size, center, crowd;
let rgoZones=null,rgoSectionBackup=null;
Object.defineProperty(diagnostics,'rgo',{enumerable:true,get:()=>rgoZones?.getState()||{ready:false}});
let captureMode=false;
let sourceMaterials=[],sourceMeshes=[],envelopeMeshes=[],roofMeshes=[];
const crowdMaterials=[];
let stationControls=null;
let monorail=null,followVehicle=-1,onboardVehicle=-1,lastOnboardVehicle=0,hallOpen=true,lastFrameTime=null;
const passenger={yaw:-Math.PI/2,pitch:-.16,eye:new THREE.Vector3(-.52,2.05,.55),normalFov:43,normalNear:.05};
const passengerPointers=new Map();let pinchDistance=0;
Object.defineProperty(diagnostics,'onboard',{get:()=>({active:onboardVehicle>=0,vehicle:onboardVehicle>=0?onboardVehicle:null,yaw:passenger.yaw,pitch:passenger.pitch,eyeLocal:passenger.eye.toArray(),fov:camera.fov})});
let exhibitionZones=null,zoneMap=null;
let walkMode=null,walkStartPromise=null,walkBackup=null;
Object.defineProperty(diagnostics,'walk',{enumerable:true,get:()=>walkMode?.getState()||{ready:false,active:false}});
Object.defineProperty(diagnostics,'zones',{get:()=>exhibitionZones?.getState()||{ready:false}});
Object.defineProperty(diagnostics,'zoneMap',{get:()=>zoneMap?.getState()||{ready:false}});
let exhibits=null,icebreakerAccess=null,exhibitProgress={state:'waiting',loadedObjects:0,placedInstances:0,objects:[]};
Object.defineProperty(diagnostics,'exhibits',{get:()=>exhibits?.getState()||exhibitProgress});
let exhibitEditor=null,editingInstanceId=null,editCutawayTimer=null,dynamicObstacles=null,visitorPlacementReady=false,placementNotice=null;
let equipmentLink=null,pendingEquipmentFocus=null;
Object.defineProperty(diagnostics,'equipmentPlan',{enumerable:true,get:()=>exhibitionZones?.equipmentPlanState?.()||{active:false}});
function focusEquipmentFromPlan(request){
  // The embedded walk has its own selected-zone channel. General 3D focus must not steal its camera.
  if(installationsWalkEmbedded)return;
  pendingEquipmentFocus=request;
  if(!inspectionReady||!rgoZones||!exhibitionZones)return;
  pendingEquipmentFocus=null;
  walkMode?.stop({restore:true,focus:false});
  if(request.id){if(exhibitionZones.focusEquipment(request.id))return;}
  if(request.hallId){exhibitionZones.focus('rgo-'+request.hallId.replace('RGO-',''));return;}
  if(request.regionId){exhibitionZones.focusRegion(request.regionId);return;}
  exhibitionZones.focus('all');
}
Object.defineProperty(diagnostics,'editor',{enumerable:true,get:()=>exhibitEditor?.getState()||{ready:false,selectedInstanceId:null,dragging:false}});
Object.defineProperty(diagnostics,'dynamicObstacles',{enumerable:true,get:()=>dynamicObstacles?.getState()||{ready:false}});
const viewerUI=initViewerUI();
Object.defineProperty(diagnostics,'ui',{enumerable:true,get:()=>viewerUI.getState()});
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
  hiddenSelectedMeshes:[...inspectionHidden.keys()].filter(mesh=>mesh.userData.exhibitId===inspectedExhibitId||mesh.userData.instanceId===inspectedExhibitId).length,
  visibleInstances:exhibits?.group.visible?exhibits.roots.filter(instance=>{
    let visible=false;instance.traverse(node=>{if(node.isMesh&&isObjectVisible(node))visible=true;});return visible;
  }).length:0
})});
const monorailRoute=MONORAIL_ROUTE_CONFIG;
Object.defineProperty(diagnostics,'icebreakerAccess',{enumerable:true,get:()=>icebreakerAccess?.getState()||{connected:false}});
Object.defineProperty(diagnostics,'monorail',{get:()=>monorail?.getState()||{status:diagnostics.monorailStatus||'waiting',loaded:false,vehicleCount:0}});
// The upper enclosure slabs start at 16.8 m. The 13.2 m mezzanine stays
// visible; exhibits, vehicles and the reconstructed station are never cut.
const DEFAULT_BUILDING_CUT=16.7;
let needsRender = true, active = true, transition = null, currentView = 'overview', sectionOn = true;
const clipPlane = new THREE.Plane(new THREE.Vector3(0,-1,0), 0);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(43, 1, 0.05, 4000);
camera.position.set(90,70,100);
const viewDirections = {overview:new THREE.Vector3(1.9,1.12,.72), top:new THREE.Vector3(0,1,.001), front:new THREE.Vector3(0,.16,1), back:new THREE.Vector3(-1,.55,-1.25)};
const viewNames = {overview:'Общий вид',top:'Вид сверху',front:'Вид спереди',back:'С другой стороны'};
const installationsWalkBridge=createInstallationsWalkBridge({onVisibility(visible){
  active=visible;
  if(visible){window.dispatchEvent(new Event('resize'));needsRender=true;}
}});
Object.defineProperty(diagnostics,'installationsWalk',{enumerable:true,get:()=>installationsWalkBridge.getState()});

function fail(error) {
  const message = error?.message || String(error);
  diagnostics.errors.push(message);diagnostics.state='error';root.dataset.state='error';
  installationsWalkBridge.error('Не удалось загрузить прогулку. Обновите страницу, чтобы повторить.');
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
  controls.minPolarAngle=.001;controls.maxPolarAngle=Math.PI-.001;
  controls.addEventListener('change',()=>{needsRender=true});
  controls.addEventListener('start',()=>{
    if(rgoZones?.getState().activeView){
      stopFollowing();currentView=null;transition=null;needsRender=true;return;
    }
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
      diagnostics.workingOpenings=applyWorkingOpenings(sourceMeshes,[MONORAIL_BOARDING_GATE]);
      envelopeMeshes=sourceMeshes.filter(node=>/^A-(ROOF|WALL|CLNG|GLAZ)/.test(node.name));
      roofMeshes=sourceMeshes.filter(node=>/^A-ROOF__/.test(node.name));
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
      $('section-height').step='0.05';
      $('section-height').value=String(THREE.MathUtils.clamp(DEFAULT_BUILDING_CUT,bounds.min.y,bounds.max.y));
      $('section-toggle').setAttribute('aria-pressed','true');$('section-controls').hidden=false;
      updateSection();
      Object.assign(diagnostics,{state:'ready',meshes,triangles:Math.round(triangles),materials:materials.size,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},sourceUnits:'meters'});
      root.dataset.state='ready';$('model-info').textContent='3D-предпросмотр из DWG';
      setView('overview',true);progress.style.width='100%';loading.hidden=true;
      root.querySelectorAll('[data-view],#section-toggle,#reset,#envelope-toggle').forEach(button=>button.disabled=false);
      root.querySelector('[data-view="exhibits"]').disabled=true;
      needsRender=true;
      const monorailReady=startMonorail(loader);
      const exhibitsReady=startExhibits(loader,monorailReady);
      Promise.allSettled([monorailReady,exhibitsReady]).then(async()=>{await startRgoLayer();await startVisitors(loader);return startWalkingMode();});
    }catch(error){fail(error);}
  },event=>{
    if(event.lengthComputable&&event.total){const percent=Math.min(99,Math.round(event.loaded/event.total*100));progress.style.width=percent+'%';detail.textContent=percent===99?'Подготавливаем геометрию…':'Загружено '+percent+'%';}
    else{detail.textContent='Загружено '+(event.loaded/1048576).toFixed(1).replace('.',',')+' МБ';}
  },fail);

  function frame(time){
    requestAnimationFrame(frame);
    const delta=lastFrameTime===null?0:Math.min(.1,Math.max(0,(time-lastFrameTime)/1000));lastFrameTime=time;
    if(captureMode||!active||document.hidden)return;
    if(monorail){
      if(monorail.update(delta))needsRender=true;
      if(onboardVehicle>=0&&!walkMode?.active){
        updatePassengerCamera();
      }else if(followVehicle>=0&&!walkMode?.active){
        const pose=monorail.getFollowPose(followVehicle),blend=1-Math.exp(-delta*7);
        if(camera.position.distanceToSquared(pose.position)>1e-8||controls.target.distanceToSquared(pose.target)>1e-8){
          camera.position.lerp(pose.position,blend);controls.target.lerp(pose.target,blend);needsRender=true;
        }
      }
    }
    if(transition&&!walkMode?.active){
      const t=Math.min(1,(time-transition.start)/transition.duration),e=t*t*(3-2*t);
      camera.position.lerpVectors(transition.from,transition.to,e);controls.target.lerpVectors(transition.fromTarget,transition.toTarget,e);needsRender=true;
      if(t===1)transition=null;
    }
    if(dynamicObstacles?.sync())needsRender=true;
    if(icebreakerAccess?.update(delta))needsRender=true;
    if(crowd?.update(delta))needsRender=true;
    if(exhibitionZones?.update(delta))needsRender=true;
    if(walkMode?.update(delta))needsRender=true;
    if(onboardVehicle<0&&!walkMode?.active)controls.update();
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
    if(!node.isMesh||!isObjectVisible(node))return;
    const positions=node.geometry.attributes.position;
    if(!positions)return;
    for(let i=0;i<positions.count;i++){
      p.fromBufferAttribute(positions,i).applyMatrix4(node.matrixWorld);
      if(sectionOn&&p.y>clipPlane.constant+1e-4)continue;
      p.sub(center);
      const x=p.dot(right),y=p.dot(up),z=p.dot(d);
      rightLimit=Math.max(rightLimit,x/hTan+z);leftLimit=Math.max(leftLimit,-x/hTan+z);
      topLimit=Math.max(topLimit,y/vTan+z);bottomLimit=Math.max(bottomLimit,-y/vTan+z);
    }
  });
  if(!Number.isFinite(rightLimit))return fitBox(exhibits?.getBounds()||bounds,direction);
  const target=center.clone().addScaledVector(right,(rightLimit-leftLimit)*hTan/2).addScaledVector(up,(topLimit-bottomLimit)*vTan/2);
  const distance=Math.max((rightLimit+leftLimit)/2,(topLimit+bottomLimit)/2)*1.12;
  return {position:target.clone().addScaledVector(d,distance),target};
}
function moveCamera(position,target,instant=false){
  if(!controls)return;
  walkMode?.stop({restore:false,focus:false});
  if(instant||reduceMotion){camera.position.copy(position);controls.target.copy(target);controls.update();transition=null;}
  else transition={from:camera.position.clone(),to:position,fromTarget:controls.target.clone(),toTarget:target.clone(),start:performance.now(),duration:650};
  needsRender=true;
}
function setView(view,instant=false){
  if(!model)return;
  walkMode?.stop({restore:true,focus:false});
  leaveRgoView();
  exhibitEditor?.clearSelection();editingInstanceId=null;
  clearExhibitInspection();stopFollowing();
  camera.fov=43;camera.updateProjectionMatrix();
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
    $('view-name').textContent='Трасса монорельса';diagnostics.view='route';return;
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
  for(const material of [...sourceMaterials,...crowdMaterials]){
    if(Boolean(material.clippingPlanes?.length)!==sectionOn){material.clippingPlanes=sectionOn?[clipPlane]:[];material.clipShadows=true;material.needsUpdate=true;}
  }
  $('section-value').textContent=height.toLocaleString('ru-RU',{maximumFractionDigits:1})+' м';
  // A building cut must never trim a suspended model, the rocket or a wagon.
  roofMeshes.forEach(mesh=>{mesh.visible=!hallOpen&&!sectionOn;});
  diagnostics.section={enabled:sectionOn,height,scope:'building',defaultHeight:DEFAULT_BUILDING_CUT};
  diagnostics.roof={hidden:roofMeshes.every(mesh=>!mesh.visible),meshCount:roofMeshes.length};needsRender=true;
}
root.querySelectorAll('[data-view],#section-toggle,#reset,#envelope-toggle').forEach(button=>button.disabled=true);
document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>setView(button.dataset.view));
$('reset').onclick=()=>{walkMode?.stop({restore:true,focus:false});leaveRgoView();sectionOn=true;$('section-height').value=String(DEFAULT_BUILDING_CUT);$('section-toggle').setAttribute('aria-pressed','true');$('section-controls').hidden=false;setHallOpen(true);updateSection();setView(exhibits?.roots.length?'exhibits':monorail?'route':'overview');};
$('section-toggle').onclick=()=>{walkMode?.stop({restore:true,focus:false});sectionOn=!sectionOn;$('section-toggle').setAttribute('aria-pressed',String(sectionOn));$('section-controls').hidden=!sectionOn;updateSection();};
$('section-height').addEventListener('input',()=>{const value=$('section-height').value;walkMode?.stop({restore:true,focus:false});$('section-height').value=value;updateSection();});
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
  if(installationsWalkEmbedded)return;
  if(event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='park-tour-visibility')return;
  active=Boolean(event.data.visible);if(active){window.dispatchEvent(new Event('resize'));needsRender=true;}
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)needsRender=true;});
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
canvas.addEventListener('dblclick',event=>{
  if(!model||!controls)return;
  if(walkMode?.active){event.preventDefault();return;}
  if(onboardVehicle>=0){passenger.yaw=-Math.PI/2;passenger.pitch=-.16;camera.fov=68;camera.updateProjectionMatrix();needsRender=true;return;}
  const rect=canvas.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2);raycaster.setFromCamera(pointer,camera);
  const targets=[...sourceMeshes.filter(mesh=>mesh.visible),...(monorail?.vehicles||[]),...(exhibits?.group.visible?exhibits.roots:[])];
  const hits=raycaster.intersectObjects(targets,true);const hit=hits.find(item=>item.object.isMesh&&isObjectVisible(item.object)&&(item.object.userData.monorail||item.object.userData.exhibitId||!sectionOn||item.point.y<=clipPlane.constant));if(!hit)return;
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
  walkMode?.stop({restore:false,focus:false});
  crowd?.releaseCamera();
  followVehicle=-1;diagnostics.followVehicle=null;
  exhibitEditor?.setEnabled(visitorPlacementReady&&!walkMode?.active);
  if(onboardVehicle>=0){
    monorail?.cancelDisembarkRequest();
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
  if(!monorail||!monorail.vehicles[index])return false;
  if(onboardVehicle!==index&&!monorail.getBoardingOptions().some(option=>option.canBoard&&option.vehicleIndex===index))return false;
  walkMode?.stop({restore:true,focus:false});
  leaveRgoView();
  crowd?.releaseCamera();
  exhibitEditor?.clearSelection();editingInstanceId=null;
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
  updatePassengerCamera();canvas.focus({preventScroll:true});stationControls?.update();return true;
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
  walkMode?.stop({restore:true,focus:false});
  leaveRgoView();
  clearExhibitInspection();stopFollowing();currentView=null;transition=null;$('tram-camera').value='free';
  $('view-name').textContent='Свободный обзор';diagnostics.view='free';
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed','false'));
}
function setHallOpen(open){
  clearExhibitInspection();hallOpen=Boolean(open);envelopeMeshes.forEach(mesh=>{mesh.visible=!hallOpen});
  roofMeshes.forEach(mesh=>{mesh.visible=!hallOpen&&!sectionOn;});
  $('envelope-toggle').setAttribute('aria-pressed',String(hallOpen));
  diagnostics.hallOpen=hallOpen;diagnostics.roof={hidden:roofMeshes.every(mesh=>!mesh.visible),meshCount:roofMeshes.length};needsRender=true;
}
$('envelope-toggle').onclick=()=>{walkMode?.stop({restore:true,focus:false});setHallOpen(!hallOpen);};
function syncMonorailControls(state){
  $('tram-play').textContent=state.playing?'Пауза':'Пуск';
  $('tram-play').setAttribute('aria-label',state.playing?'Приостановить оба вагона':'Запустить оба вагона');
  $('tram-play').setAttribute('aria-pressed',String(state.playing));
  const board=monorail?.getBoardingOptions().find(option=>option.canBoard);
  $('tram-onboard').disabled=onboardVehicle<0&&!board;
  $('tram-onboard').textContent=onboardVehicle>=0?'Выйти на станции':board?'Сесть в вагон '+(board.vehicleIndex+1):'Ждём посадку';
  for(const option of $('tram-camera').options)if(option.value.startsWith('inside-')){const index=Number(option.value.slice(-1));option.disabled=onboardVehicle!==index&&board?.vehicleIndex!==index;}
  stationControls?.update(state);
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
    root.querySelectorAll('#tram-play,#tram-onboard,#tram-camera,#tram-speed,#tram-station').forEach(control=>control.disabled=false);
    stationControls=createTramStationControls({container:$('tram-stations'),getSystem:()=>monorail,getPassengerVehicle:()=>onboardVehicle,onFocus:focusTramStation,onBoard:index=>{if(setPassengerView(index))viewerUI.closePanels();},onDisembark:pose=>{stopFollowing();controls.enabled=true;moveCamera(pose.position,pose.target);$('view-name').textContent='Высадка · площадка '+pose.stationNumber;diagnostics.view='station';needsRender=true;}});
    for(const item of stationControls.getMenuItems())$('section-select').add(new Option(item.label,item.value));
    diagnostics.focusStation=id=>stationControls.focusStation(id);
    diagnostics.boardMonorail=index=>setPassengerView(index);
    diagnostics.requestMonorailExit=()=>onboardVehicle>=0&&monorail.requestDisembark(onboardVehicle);
    syncMonorailControls(monorail.getState());
    if(currentView==='route')setView('route',true);
    needsRender=true;
  }catch(error){
    diagnostics.monorailStatus='error';diagnostics.errors.push('Монорельс: '+(error?.message||error));
    $('model-info').textContent='Модель здания';$('scene-notice').textContent='Вагоны не загрузились. Обновите страницу, чтобы повторить загрузку монорельса.';$('scene-notice').hidden=false;
    console.error('Monorail:',error);
  }
}
$('tram-play').onclick=()=>{if(monorail){monorail.setPlaying(!monorail.getState().playing);needsRender=true;}};
$('tram-speed').onchange=()=>{if(monorail)monorail.setSpeed(Number($('tram-speed').value));};
$('tram-onboard').onclick=()=>{if(!monorail)return;if(onboardVehicle>=0){monorail.requestDisembark(onboardVehicle);stationControls?.update();}else{const option=monorail.getBoardingOptions().find(row=>row.canBoard);if(option)setPassengerView(option.vehicleIndex);}};
function focusTramStation(pose){
  walkMode?.stop({restore:true,focus:false});
  leaveRgoView();
  exhibitEditor?.clearSelection();editingInstanceId=null;clearExhibitInspection();stopFollowing();
  exhibitionZones?.hidePanel();zoneMap?.setVisible(false);
  currentView=null;transition=null;setHallOpen(true);$('tram-camera').value='free';
  sectionOn=true;$('section-height').value=String(DEFAULT_BUILDING_CUT);$('section-toggle').setAttribute('aria-pressed','true');updateSection();
  moveCamera(pose.position,pose.target);
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed','false'));
  $('view-name').textContent='Площадка '+pose.station.number+' · '+pose.station.label;diagnostics.view='station';needsRender=true;
}
if($('tram-station'))$('tram-station').onclick=()=>{if(monorail)focusTramStation(monorail.getStationPose());};
$('tram-camera').onchange=()=>{
  if(!monorail)return;
  walkMode?.stop({restore:true,focus:false});
  const value=$('tram-camera').value;
  if(value==='route'){setView('route');return;}
  if(value==='free'){setFreeView();return;}
  if(value.startsWith('inside-')){if(!setPassengerView(Number(value.slice(-1))))$('tram-camera').value=onboardVehicle>=0?'inside-'+onboardVehicle:'free';return;}
  leaveRgoView();
  clearExhibitInspection();stopFollowing();
  exhibitEditor?.clearSelection();editingInstanceId=null;
  followVehicle=value==='follow-1'?1:0;currentView=null;transition=null;diagnostics.followVehicle=followVehicle;
  setHallOpen(true);
  const pose=monorail.getFollowPose(followVehicle);
  camera.position.copy(pose.position);controls.target.copy(pose.target);controls.update();
  $('view-name').textContent='За вагоном '+(followVehicle+1);diagnostics.view='follow';
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed','false'));needsRender=true;
};

function syncExhibitControls(state){
  exhibitProgress=state;
  const count=state.visibleInstances??state.placedInstances??0,total=state.requestedInstances||0;
  const noun=count%100>=11&&count%100<=14?'экспонатов':count%10===1?'экспонат':[2,3,4].includes(count%10)?'экспоната':'экспонатов';
  $('exhibit-status').textContent=state.state==='loading'?'Загружаем экспонаты · '+count+' / '+total:state.state==='error'?'Экспонаты не загрузились':!inspectionReady?'Подготавливаем осмотр экспонатов…':'В парке · '+count+' '+noun;
  const select=$('exhibit-select'),selected=select.value;
  select.replaceChildren(new Option('Все экспонаты','all'));
  for(const row of state.objects||[]){
    const visible=(row.placements||[]).filter(item=>item.visible!==false);
    if(row.status!=='loaded'||!visible.length)continue;
    const option=document.createElement('option');option.value=row.id;
    option.textContent=row.name+(visible.length>1?' · '+visible.length+' шт.':'');select.append(option);
  }
  select.append(...[...select.options].filter(option=>option.value!=='all').sort((a,b)=>a.value.localeCompare(b.value)));
  const interactive=Boolean(exhibits)&&inspectionReady&&count>0;
  select.value=[...select.options].some(option=>option.value===selected)?selected:'all';select.disabled=!interactive;
  $('exhibit-visible').disabled=!interactive;$('exhibit-visible').setAttribute('aria-pressed',String(state.visible!==false));
  root.querySelector('[data-view="exhibits"]').disabled=!interactive;
  needsRender=true;
}
async function startExhibits(loader,monorailReady){
  try{
    exhibits=await createExhibitSystem({scene,loader,sourceMeshes,manifestUrl:exhibitManifestPath+'?v=park-exhibition-20261125-r2',
      anisotropy:Math.min(8,renderer.capabilities.getMaxAnisotropy()),onChange:()=>{needsRender=true;},onProgress:syncExhibitControls});
    const icebreaker=exhibits.getInstance('O12-1');
    if(icebreaker){
      const lettering=attachIcebreakerDetails(exhibits.getInstanceRoot('O12-1'),icebreaker.originalDimensions||icebreaker.dimensions);
      diagnostics.icebreaker={lettering:lettering?.text||'АТОМФЛОТ',labelledSides:lettering?.sides||2,dimensions:icebreaker.originalDimensions||icebreaker.dimensions};
      // Original whole ship: no added walk-in wheelhouse or CAD access opening.
      icebreakerAccess=null;
    }
    exhibitionZones=await createExhibitionZones({exhibits,loader,camera,getIcebreakerAccess:()=>icebreakerAccess,onStationFocus:id=>{const focused=stationControls?.focusStation(id);if(focused)viewerUI.openPanel('monorail-panel');return focused;},requestRender:()=>{needsRender=true;},
      onOverview:()=>{zoneMap?.setVisible(true);setView('exhibits');},onFocus:(id,position,target,label,fov=62)=>{
        walkMode?.stop({restore:true,focus:false});
        const keepNavigationOpen=!$('rgo-panel').hidden;
        leaveRgoView();
        zoneMap?.setVisible(false);
        if(!keepNavigationOpen)viewerUI.closePanels();
        exhibitEditor?.clearSelection();editingInstanceId=null;clearExhibitInspection();stopFollowing();
        setHallOpen(true);exhibits.setVisible(true);currentView=null;
        if(position&&target){camera.fov=camera.aspect<.8?Math.min(86,Math.max(fov,82)):fov;camera.updateProjectionMatrix();moveCamera(position,target);inspectedExhibitId=id;applyInspectionCutaway(position);}
        else focusExhibit(id);
        $('view-name').textContent=label;diagnostics.selectedExhibit=id;diagnostics.view='section';
      }});
    equipmentLink=await loadEquipmentSceneLink({
      onSnapshot(snapshot){
        const result=exhibitionZones.setEquipmentPlan(snapshot);
        if(result.ok){walkMode?.refreshLayout();exhibitEditor?.refresh?.();rgoZones?.refresh?.();syncExhibitControls(exhibits.getState());needsRender=true;}
        return result;
      },
      onPreview:(id,position)=>{if(walkMode?.active)return {ok:true,preview:false};const result=exhibitionZones.previewEquipment(id,position);if(result?.ok)needsRender=true;return result;},
      onPreviewEnd:id=>{exhibitionZones.cancelEquipmentPreview(id);needsRender=true;},
      onFocus:focusEquipmentFromPlan,
      onError(message){$('scene-notice').textContent=message;$('scene-notice').hidden=false;needsRender=true;}
    });
    zoneMap=await createZoneMap({scene,getNavigation:()=>exhibitionZones?.getNavigation(),requestRender:()=>{needsRender=true;},onFocus:(position,target,label,regionId)=>{
      walkMode?.stop({restore:true,focus:false});
      leaveRgoView();
      exhibitEditor?.clearSelection();editingInstanceId=null;clearExhibitInspection();stopFollowing();
      setHallOpen(true);exhibits.setVisible(true);currentView=null;
      exhibitionZones.focusRegion(regionId,{navigate:false});moveCamera(position,target);
      $('view-name').textContent=label;diagnostics.view='zone-map';
    }});
    diagnostics.focusZone=(id)=>zoneMap.focus(id);
    diagnostics.focusSection=(id,options)=>exhibitionZones.focus(id,options);
    diagnostics.interact=(action)=>exhibitionZones.act(action);
    await monorailReady;
    // The zone selector is rebuilt after loading the exhibits. Keep station
    // destinations regardless of which asynchronous subsystem finished first.
    for(const item of stationControls?.getMenuItems()||[]){
      if(![...$('section-select').options].some(option=>option.value===item.value))$('section-select').add(new Option(item.label,item.value));
    }
    await prepareInspectionRaycasts();
    inspectionReady=true;
    exhibits.setSection(false,null);
    dynamicObstacles=createDynamicObstacleAdapter({exhibits,onChange:state=>{
      if(state.lastError){placementNotice=state.lastError;$('scene-notice').textContent=state.lastError;$('scene-notice').hidden=false;}
      else if(placementNotice){
        // A cutaway may temporarily cover the placement warning. Clear its
        // saved copy too, so leaving inspection cannot resurrect an old error.
        if(inspectionNotice?.placement)inspectionNotice={text:'',hidden:true,placement:false};
        const notice=$('scene-notice');
        if(notice.textContent===placementNotice){notice.textContent='';notice.hidden=true;}
        placementNotice=null;
      }
      needsRender=true;
    }});
    exhibitEditor=createExhibitEditor({system:exhibits,scene,camera,controls,domElement:canvas,deferRestore:true,
      onFocus:id=>focusExhibit(id),onEditStart:beginExhibitEdit,onEditEnd:endExhibitEdit,onChange:exhibitEditorChanged,
      validateManagedChange:(id,position)=>equipmentLink?.validateMove(id,position)||{ok:false,error:'План оборудования ещё загружается.'},
      onManagedChange:(id,position)=>equipmentLink?.move(id,position)});
    exhibitEditor.setEnabled(false);
    syncExhibitControls(exhibits.getState());
    const state=exhibits.getState();
    if(state.state==='partial'){
      $('scene-notice').textContent=state.rejectedInstances?'Часть экспонатов ещё требует уточнения позиции. Показаны подтверждённые размещения.':'Часть экспонатов не загрузилась. Обновите страницу для повторной загрузки.';$('scene-notice').hidden=false;
    }
    if(currentView==='overview')setView('overview',true);
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
  clearTimeout(editCutawayTimer);editCutawayTimer=null;
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
  const buildingMeshes=meshes.filter(mesh=>!mesh.userData.exhibitId&&!mesh.userData.monorail);
  const independentMeshes=meshes.filter(mesh=>mesh.userData.exhibitId||mesh.userData.monorail);
  // From inside a wall, the exit face may be back-facing. CPU-only DoubleSide
  // catches it without altering rendered material properties or shared textures.
  for(const mesh of meshes)for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
    if(material&&!materialSides.has(material)){materialSides.set(material,material.side);material.side=THREE.DoubleSide;}
  }
  try{
    const direction=new THREE.Vector3();
    const hideHits=(targets,near,far)=>{
      if(far<=near)return;
      inspectionRay.near=near;inspectionRay.far=far;
      for(const hit of inspectionRay.intersectObjects(targets.filter(mesh=>!inspectionHidden.has(mesh)),false)){
        const mesh=hit.object;
        if(!inspectionHidden.has(mesh)){inspectionHidden.set(mesh,mesh.visible);mesh.visible=false;}
      }
    };
    for(const point of points){
      direction.subVectors(point,origin);
      const distance=direction.length();
      if(distance<=camera.near)continue;
      inspectionRay.set(origin,direction.divideScalar(distance));
      const end=Math.max(camera.near,distance-.015);
      hideHits(independentMeshes,camera.near,end);
      let start=camera.near,finish=end;
      // Raycast only the visible half-space of the building. A clipped roof
      // cannot hide a whole mixed CAD mesh that still contains a useful floor.
      if(sectionOn){
        if(Math.abs(direction.y)<1e-9){if(origin.y>clipPlane.constant)continue;}
        else{
          const crossing=(clipPlane.constant-origin.y)/direction.y;
          if(direction.y<0)start=Math.max(start,crossing+1e-4);
          else finish=Math.min(finish,crossing-1e-4);
        }
      }
      hideHits(buildingMeshes,start,finish);
    }
  }finally{
    for(const [material,side] of materialSides)material.side=side;
  }
  if(inspectionHidden.size){
    const notice=$('scene-notice');
    if(!inspectionNotice)inspectionNotice={text:notice.textContent,hidden:notice.hidden,
      placement:Boolean(placementNotice&&notice.textContent===placementNotice)};
    notice.textContent=inspectionMessage;notice.hidden=false;
  }else clearInspectionNotice();
  inspectionElapsedMs=performance.now()-started;needsRender=true;
}
function focusExhibit(id,instant=false){
  if(!exhibits||!inspectionReady)return;
  walkMode?.stop({restore:true,focus:false});
  leaveRgoView();
  if(id==='all'){setView('exhibits');return;}
  const box=exhibits.getBounds(id);if(!box||box.isEmpty())return;
  stopFollowing();$('tram-camera').value='free';currentView=null;setHallOpen(true);exhibits.setVisible(true);
  const fitted=fitBox(box,new THREE.Vector3(1.4,.85,1.5));
  inspectedExhibitId=id;applyInspectionCutaway(fitted.position);moveCamera(fitted.position,fitted.target,instant);
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed','false'));
  const row=exhibits.getState().objects.find(object=>object.id===id||object.placements.some(placement=>placement.instanceId===id));
  $('exhibit-select').value=row?.id||'all';$('view-name').textContent=row?.name||'Экспонат';diagnostics.view='exhibit';diagnostics.selectedExhibit=id;
}

function beginExhibitEdit(id){
  if(id)leaveRgoView();
  if(!exhibitEditor&&id===null){clearExhibitInspection();return;}
  stopFollowing();transition=null;currentView=null;
  clearExhibitInspection();editingInstanceId=id||null;
  $('tram-camera').value='free';
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed','false'));
  if(id&&exhibits?.getInstanceRoot(id)?.visible){
    inspectedExhibitId=id;diagnostics.selectedExhibit=id;applyInspectionCutaway(camera.position);
  }
  $('view-name').textContent='Расстановка экспонатов';diagnostics.view='editing';needsRender=true;
}
function endExhibitEdit(id){
  clearExhibitInspection();editingInstanceId=null;
  if(id&&exhibits?.getInstanceRoot(id)?.visible){
    inspectedExhibitId=id;diagnostics.selectedExhibit=id;applyInspectionCutaway(camera.position);
  }
  needsRender=true;
}
function exhibitEditorChanged(){
  icebreakerAccess?.update();rgoZones?.refresh();
  needsRender=true;
  if(!editingInstanceId||editCutawayTimer)return;
  editCutawayTimer=setTimeout(()=>{
    editCutawayTimer=null;
    const id=editingInstanceId;
    if(id&&exhibits?.getInstanceRoot(id)?.visible){
      inspectedExhibitId=id;applyInspectionCutaway(camera.position);
    }
  },80);
}
$('exhibit-select').onchange=()=>focusExhibit($('exhibit-select').value);
$('exhibit-visible').onclick=()=>{
  exhibitEditor?.clearSelection();editingInstanceId=null;clearExhibitInspection();
  if(!exhibits)return;
  const result=exhibits.setVisible(!exhibits.group.visible);
  if(result?.ok===false){$('scene-notice').textContent=result.error;$('scene-notice').hidden=false;}
};

function leaveRgoView(){
  if(!rgoZones?.getState().activeView&&!rgoSectionBackup)return;
  rgoZones?.deactivate();
  if(rgoSectionBackup){
    sectionOn=rgoSectionBackup.enabled;$('section-height').value=String(rgoSectionBackup.height);
    $('section-toggle').setAttribute('aria-pressed',String(sectionOn));$('section-controls').hidden=!sectionOn;
    rgoSectionBackup=null;updateSection();
  }
  const url=new URL(location.href);if(url.searchParams.has('rgo')){url.searchParams.delete('rgo');history.replaceState(null,'',url);}
}
function navigateRgo({box,direction,label},instant=false){
  if(!model||!controls)return;
  walkMode?.stop({restore:true,focus:false});
  zoneMap?.setVisible(false);exhibitionZones?.hidePanel();
  exhibitEditor?.clearSelection();editingInstanceId=null;clearExhibitInspection();stopFollowing();currentView=null;transition=null;
  if(!rgoSectionBackup)rgoSectionBackup={enabled:sectionOn,height:Number($('section-height').value)};
  sectionOn=true;$('section-height').value='10.8';$('section-toggle').setAttribute('aria-pressed','true');$('section-controls').hidden=false;
  setHallOpen(true);updateSection();$('tram-camera').value='free';
  const fitted=fitBox(box,direction);moveCamera(fitted.position,fitted.target,instant);
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed','false'));
  $('view-name').textContent=label;diagnostics.view='rgo';
  if(matchMedia('(max-width: 600px)').matches)viewerUI.closePanels({focusCanvas:true});
  needsRender=true;
}
async function startRgoLayer(){
  try{
    rgoZones=await createRgoZones({THREE,scene,canvas,camera,panel:$('rgo-panel'),controller:exhibitionZones,existingLayoutRevised:true,
      onNavigate:request=>navigateRgo(request),onOverview:()=>setView('overview'),requestRender:()=>{needsRender=true;},
      getExhibitRoot:id=>exhibits?.getInstanceRoot(id)||null,
      getExistingObstacles:()=>[...(dynamicObstacles?.snapshot().proxies||[]),...(monorail?.getCollisionObstacles()||[])]
    });
    $('rgo-toggle').disabled=false;
    $('rgo-toggle').addEventListener('click',()=>{
      if($('rgo-panel').hidden){rgoZones.setVisible(false);return;}
      if(!exhibitionZones.getNavigation().selectedRegion)rgoZones.showOverview();
      rgoZones.setVisible(true);
    });
    const requestedSection=initialNavigation.get('section'),requestedZone=initialNavigation.get('zone');
    if(requestedSection)exhibitionZones.focus(requestedSection);
    if(requestedZone)zoneMap.focus(requestedZone);
    const choice=initialNavigation.get('rgo');
    if(choice==='all'||/^0[0-8]$/.test(choice||'')){
      if(choice==='all')rgoZones.showOverview();else rgoZones.selectHall('RGO-'+choice);
    }
    const requestedObject=initialNavigation.get('object'),requestedMedia=initialNavigation.get('media');
    if(requestedObject)exhibitionZones.focusObject(requestedObject);
    if(requestedMedia)exhibitionZones.focusEquipment(requestedMedia);
    if((choice||requestedObject||requestedMedia)&&!matchMedia('(max-width: 600px)').matches){
      viewerUI.openPanel('rgo-panel');rgoZones.setVisible(true);
    }else rgoZones.setVisible(false);
    if(pendingEquipmentFocus)focusEquipmentFromPlan(pendingEquipmentFocus);
  }catch(error){
    diagnostics.errors.push('RGO: '+(error?.message||String(error)));
    $('rgo-toggle').disabled=false;const message=document.createElement('p');message.className='rgo-load-error';
    message.textContent='Не удалось загрузить проектный слой РГО. Обновите страницу, чтобы повторить.';$('rgo-panel').querySelector('.rgo-content').replaceChildren(message);
  }
}

function startWalkingMode(){
  if(walkStartPromise)return walkStartPromise;
  if(!exhibits||!dynamicObstacles||!zoneMap||!exhibitionZones)return Promise.resolve(null);
  walkStartPromise=(async()=>{
    const fixed=[...(monorail?.getCollisionObstacles()||[]),...(icebreakerAccess?.getCollisionObstacles()||[])];
    const wagonBox=new THREE.Box3(),wagonCenter=new THREE.Vector3(),wagonSize=new THREE.Vector3();
    walkMode=await createWalkMode({
      camera,canvas,sourceMeshes,sourceZones:zoneMap.data,controller:exhibitionZones,
      getDynamicObstacles:()=>{
        if(!dynamicObstacles)throw new Error('Не загружены препятствия экспозиции.');
        const obstacles=[...dynamicObstacles.snapshot({groupVisible:true}).proxies,...fixed];
        for(const [index,vehicle] of (monorail?.vehicles||[]).entries()){
          vehicle.updateWorldMatrix(true,true);wagonBox.setFromObject(vehicle);
          if(wagonBox.isEmpty())continue;
          wagonBox.getCenter(wagonCenter);wagonBox.getSize(wagonSize);
          obstacles.push({id:'walk-moving-wagon-'+index,kind:'vehicle',shape:'obb',centerXZ:[wagonCenter.x,wagonCenter.z],
            halfSizeXZ:[wagonSize.x/2,wagonSize.z/2],rotationY:0,minY:wagonBox.min.y,maxY:wagonBox.max.y});
        }
        return obstacles;
      },
      getCollisionMeshes:()=>[
        ...exhibits.roots.filter(item=>item.visible&&item.userData.editorVisible!==false),
        ...(monorail?.vehicles||[]),...(crowd?.objects?.elevators?.root?[crowd.objects.elevators.root]:[]),
      ],
      openPanel:id=>viewerUI.openPanel(id),closePanels:()=>viewerUI.closePanels(),requestRender:()=>{needsRender=true;},
      onEnter(){
        const visible=exhibits.group.visible;
        if(!visible){const result=exhibits.setVisible(true);if(!result.ok)return {ok:false,message:result.error||'Не удалось показать экспонаты. Завершите перемещение объектов и повторите.'};}
        walkBackup={position:camera.position.clone(),target:controls.target.clone(),fov:camera.fov,near:camera.near,
          hallOpen,sectionOn,sectionHeight:$('section-height').value,view:currentView,label:$('view-name').textContent,
          diagnosticView:diagnostics.view,exhibitsVisible:visible,zoneMapVisible:zoneMap.getState().visible,damping:controls.enableDamping};
        exhibitionZones.cancelEquipmentPreview();
        leaveRgoView();clearExhibitInspection();stopFollowing();
        exhibitEditor?.clearSelection();editingInstanceId=null;exhibitEditor?.setEnabled(false);
        viewerUI.closePanels();exhibitionZones.hidePanel();zoneMap.setVisible(false);
        currentView=null;transition=null;followVehicle=-1;onboardVehicle=-1;
        // Flush orbit inertia before giving exclusive ownership to the walking camera.
        controls.enableDamping=false;controls.update();controls.enabled=false;
        sectionOn=false;$('section-toggle').setAttribute('aria-pressed','false');$('section-controls').hidden=true;
        setHallOpen(false);updateSection();$('tram-camera').value='free';
        $('view-name').textContent='Прогулка по парку';diagnostics.view='walk';
        document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed','false'));
        return {ok:true};
      },
      onExit({restore}){
        const saved=walkBackup;walkBackup=null;transition=null;
        controls.enabled=true;controls.enableDamping=false;
        if(saved&&restore){
          sectionOn=saved.sectionOn;$('section-height').value=saved.sectionHeight;
          $('section-toggle').setAttribute('aria-pressed',String(sectionOn));$('section-controls').hidden=!sectionOn;
          setHallOpen(saved.hallOpen);updateSection();zoneMap.setVisible(saved.zoneMapVisible);
          if(!saved.exhibitsVisible)exhibits.setVisible(false);
          camera.fov=saved.fov;camera.near=saved.near;camera.updateProjectionMatrix();
          camera.position.copy(saved.position);controls.target.copy(saved.target);
          currentView=saved.view;$('view-name').textContent=saved.label;diagnostics.view=saved.diagnosticView;
          document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===currentView)));
        }else{
          camera.getWorldDirection(wagonCenter);controls.target.copy(camera.position).addScaledVector(wagonCenter,5);
          currentView=null;
        }
        controls.update();controls.enableDamping=saved?.damping??true;
        exhibitEditor?.setEnabled(visitorPlacementReady);needsRender=true;
      },
    });
    diagnostics.startWalk=id=>walkMode.start(id);
    diagnostics.stopWalk=()=>walkMode.stop();
    if(installationsWalkEmbedded){installationsWalkBridge.attach(walkMode);return walkMode;}
    const requested=initialNavigation.get('walk');
    if(requested){
      viewerUI.openPanel('walk-panel');
      if(requested!=='choose')walkMode.start(requested==='1'?'rgo-00':requested);
    }
    return walkMode;
  })().catch(error=>{
    diagnostics.errors.push('Прогулка: '+(error?.message||String(error)));
    $('walk-toggle').disabled=false;
    $('walk-status').textContent='Не удалось подготовить прогулку. Обновите страницу, чтобы загрузить проходы и объекты.';
    installationsWalkBridge.error($('walk-status').textContent);
    return null;
  });
  return walkStartPromise;
}

async function startVisitors(loader){
  try{
    crowd=await startParkCrowd({THREE,scene,model,loader,camera,controls,
      exhibitObstacles:()=>dynamicObstacles?.snapshot().proxies||[],
      fixedObstacles:()=>[...(monorail?.getCollisionObstacles()||[]),...(icebreakerAccess?.getCollisionObstacles()||[])],
      onWorldReady(sim){
        if(dynamicObstacles){
          const binding=dynamicObstacles.bindSimulation(sim);
          if(!binding.ok)throw new Error(binding.error||'Не удалось проверить исходную расстановку.');
        }
        const restored=exhibitEditor?.restoreSavedLayout();rgoZones?.refresh();
        diagnostics.layoutRestore=restored||{ok:true,restored:false};
        if(restored&&!restored.ok){
          $('scene-notice').textContent=restored.error;$('scene-notice').hidden=false;
        }
        // The validated editor remains usable even if avatar loading later fails.
        visitorPlacementReady=true;exhibitEditor?.setEnabled(!walkMode?.active);
        startWalkingMode();
        needsRender=true;
      },
      registerMaterial(material){
        if(!crowdMaterials.includes(material))crowdMaterials.push(material);
        material.clippingPlanes=sectionOn?[clipPlane]:[];material.clipShadows=true;material.needsUpdate=true;
      },
      setSection(height,enabled=true){
        const changed=sectionOn!==enabled||Math.abs(Number($('section-height').value)-height)>.015;
        if(!changed)return;
        sectionOn=enabled;$('section-height').value=String(height);$('section-toggle').setAttribute('aria-pressed',String(enabled));
        $('section-controls').hidden=true;updateSection();
      },
      setCamera(position,target,label,instant=false){
        walkMode?.stop({restore:true,focus:false});
        leaveRgoView();
        exhibitEditor?.clearSelection();editingInstanceId=null;
        clearExhibitInspection();stopFollowing();currentView=null;transition=null;$('tram-camera').value='free';
        setHallOpen(true);moveCamera(position,target,instant);
        document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed','false'));
        $('view-name').textContent=label;diagnostics.view='visitors';
      },
      requestRender(){needsRender=true;}
    });
    if(dynamicObstacles){
      const binding=dynamicObstacles.bindSimulation(crowd.simulation);
      if(!binding.ok)throw new Error(binding.error||'Не удалось синхронизировать расстановку и проходы.');
    }
    visitorPlacementReady=true;exhibitEditor?.setEnabled(!walkMode?.active);
    crowd.objects.elevators.root.traverse(node=>{if(node.isMesh&&!sourceMeshes.includes(node))sourceMeshes.push(node);});
    if(reduceMotion)crowd.setPaused(true);
    needsRender=true;
    diagnostics.capture={
      begin(){captureMode=true;transition=null;},
      end(){captureMode=false;lastFrameTime=null;needsRender=true;},
      step(dt=1/24){
        captureMode=true;transition=null;
        const delta=Math.min(.1,Math.max(0,dt));
        exhibitionZones?.update(delta);dynamicObstacles?.sync();crowd.setPaused(false);crowd.update(delta);crowd.setPaused(true);
        if(monorail){const playing=monorail.getState().playing;monorail.setPlaying(true);monorail.update(delta);monorail.setPlaying(playing);}
        if(walkMode?.active)walkMode.update(delta);else if(onboardVehicle>=0)updatePassengerCamera();else controls.update();
        renderer.render(scene,camera);needsRender=false;return crowd.simulation.time;
      },
      focus(kind){crowd.focus(kind,{instant:true});},
      camera(position,target){clearExhibitInspection();stopFollowing();currentView=null;moveCamera(new THREE.Vector3(...position),new THREE.Vector3(...target),true);},
      section(height){sectionOn=true;$('section-height').value=String(height);updateSection();},
      render(){dynamicObstacles?.sync();crowd.update(0);if(walkMode?.active)walkMode.update(0);else if(onboardVehicle>=0)updatePassengerCamera();else controls.update();renderer.render(scene,camera);},
      get canvas(){return canvas;}
    };
  }catch(error){
    diagnostics.errors.push('Посетители: '+(error?.message||error));
    crowd?.dispose();crowd=null;dynamicObstacles?.dispose();
    // Walking and current exhibit obstacles must not depend on loading avatar textures.
    dynamicObstacles=exhibits?createDynamicObstacleAdapter({exhibits,onChange:()=>{needsRender=true;}}):null;
    visitorPlacementReady=true;exhibitEditor?.setEnabled(!walkMode?.active);
  }
}
