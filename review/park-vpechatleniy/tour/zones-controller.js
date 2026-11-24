import {createIcebreakerWheelhouse} from './icebreaker-wheelhouse.js?v=park-zones-20261124';
import {applyChersonesusCompactFit} from './chersonesus-fit.js?v=park-zones-20261124';
import * as THREE from 'three';
import {createIcebreakerEnvironment,loadZoneAssets} from './exhibition-zones.js?v=park-zones-20261124';
import {createMappedRgoGallery} from './rgo-gallery.js?v=park-zones-20261124';
import {createGrainSilos,createFlightCockpits,createChersonesusInterior,getInstallationAction} from './exhibition-interactives.js?v=park-zones-20261124';

function fitModel(source,dimensions,{rotationY=0}={}){
  if(!source)return null;
  const orientation=new THREE.Group();orientation.rotation.y=rotationY;orientation.add(source.clone(true));orientation.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(orientation,true),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  const factor=Math.min(...dimensions.map((d,i)=>d/size.getComponent(i)));
  const root=new THREE.Group(),holder=new THREE.Group();holder.scale.setScalar(factor);holder.position.set(-center.x*factor,-box.min.y*factor,-center.z*factor);holder.add(orientation);root.add(holder);
  root.userData.hitemSource=true;root.userData.fittedBounds=dimensions;return root;
}
const actionLabels={
  'lider-left':'Лево на борт','lider-right':'Право на борт','lider-toggle':'Ход / пауза','lider-reset':'Прямо по курсу','lider-lift-down':'Подъёмник: к рубке','lider-lift-up':'Подъёмник: к антресоли','lider-entry':'Вход с мостика',
  'grain-toggle':'Поток зерна: пуск / пауза','rgo-next':'Следующий зал','rgo-previous':'Предыдущий зал',
  'flight-1-toggle':'Полёт: пуск / пауза','flight-1-left':'Крен влево','flight-1-right':'Крен вправо','flight-1-reset':'Сброс полёта',
  'chersonesus-scene':'Другая панорама','chersonesus-vr-1':'VR-площадка 1','chersonesus-vr-2':'VR-площадка 2',
};
export async function createExhibitionZones({exhibits,loader,camera,requestRender=()=>{},onFocus=()=>{},onOverview=()=>{},onStationFocus=()=>false,getIcebreakerAccess=()=>null}){
  const modules=[],zones=new Map(),assemblies=[],errors=[];
  const sources=await loadZoneAssets(loader).catch(error=>({models:new Map(),errors:[{error:error.message}]}));
  errors.push(...sources.errors);
  const assets=sources.models;
  const [rgoLayout,rgoProgram,liderLayout,aircraftParts]=await Promise.all(['rgo-layout.json','rgo-primary-program.json','lider-layout.json','o05-collision-parts.json'].map(async name=>{const response=await fetch('assets/zones/'+name,{cache:'no-store'});if(!response.ok)throw new Error('Не загружена первичная схема РГО.');return response.json();}));
  exhibits.refreshInstanceGeometry('O05-1',{collisionParts:aircraftParts.collisionParts});
  const rgo=createMappedRgoGallery({assets,layout:rgoLayout,program:rgoProgram});
  const rgoPlacement={id:'Z01-1',x:0,z:0,floorY:7.2,rotationY:0,zone:'РГО'};
  const rgoResult=exhibits.addAssembly({id:'Z01',name:'РГО · Музей и Аллея открытий',root:rgo.group,placement:rgoPlacement,collisionParts:rgo.getCollisionParts(),supportSamples:rgo.supportSamples,provenance:'primary-plan-018-mapped-to-CAD-with-reference-finishes-and-Hitem3D-components'});
  if(!rgoResult.ok)throw new Error(rgoResult.error);
  modules.push(rgo);assemblies.push({id:'Z01',...rgoResult});
  zones.set('rgo',{name:'РГО',id:'Z01-1',root:rgo.group,module:rgo,description:'Музей и Аллея РГО · девять залов по исходной схеме',actions:['rgo-previous','rgo-next']});

  const iceRoot=exhibits.getInstanceRoot('O12-1');
  if(iceRoot){
    const wheelhouse=createIcebreakerWheelhouse({shipRoot:iceRoot,...liderLayout.wheelhouse,onChange:requestRender});
    const ice=createIcebreakerEnvironment({layout:liderLayout});iceRoot.add(ice.group);
    exhibits.refreshInstanceGeometry('O12-1',{collisionParts:[...wheelhouse.getCollisionParts(),...ice.getCollisionParts()],extendFootprint:true});
    const module={pickTargets:wheelhouse.pickTargets,update(dt){const a=wheelhouse.update(dt),b=ice.update(dt);return a||b;},
      getState:()=>({...ice.getState(),wheelhouse:wheelhouse.getState(),lift:getIcebreakerAccess()?.getState().lift}),
      interact(action){if(action==='lider-lift-up'||action==='lider-lift-down')return getIcebreakerAccess()?.requestLift(action==='lider-lift-up'?'upper':'lower')||false;return wheelhouse.interact(action);},
      dispose(){wheelhouse.dispose();ice.dispose();}};
    modules.push(module);zones.set('lider',{name:'Ледокол «Лидер»',id:'O12-1',root:iceRoot,module,defaultInside:false,
      description:'СЗФО · Арктика · проходимая рубка и переход через подъёмник · льды и северное сияние',
      actions:['lider-left','lider-toggle','lider-right','lider-reset','lider-entry','lider-lift-down','lider-lift-up'],
      interiorPose:{...wheelhouse.interiorPose,fov:66},overviewPose:ice.overviewPose});
  }

  const silos=createGrainSilos({id:'Z02',onChange:requestRender});
  const silosResult=exhibits.addAssembly({id:'Z02',name:'Агротехнологии · прозрачные силосы',root:silos.root,
    placement:{id:'Z02-1',x:.75,z:-1,floorY:13.2,rotationY:-Math.PI/4,zone:'Приволжский ФО'},collisionParts:silos.getCollisionParts()});
  if(!silosResult.ok)throw new Error(silosResult.error);
  modules.push(silos);assemblies.push({id:'Z02',...silosResult});
  zones.set('grain',{name:'Зерновые силосы',id:'Z02-1',root:silos.root,module:silos,description:'Три прозрачных цилиндра с раздельными потоками зёрен',actions:['grain-toggle'],
    interiorPose:{position:[6,2.7,6],target:[0,2.5,0]},overviewPose:{position:[9,6,10],target:[0,2.5,0]}});

  const cockpitSource=assets.get('X04_COCKPIT');
  for(let index=0;index<2;index++){
    const id=index?'Z04':'Z03',shell=cockpitSource;
    const cockpit=createFlightCockpits({id,count:1,stationNumber:index+1,shell,onChange:requestRender});
    const placement={id:id+'-1',x:index?-2.25:-1.75,z:index?-42:-49.25,floorY:7.2,rotationY:index?255*Math.PI/180:270*Math.PI/180,zone:'Сибирский ФО · МС-21'};
    const result=exhibits.addAssembly({id,name:'МС-21 · кабина '+(index+1),root:cockpit.root,placement,collisionParts:cockpit.getCollisionParts(),provenance:'Hitem3D-cockpit-with-functional-flight-media'});
    if(!result.ok)throw new Error(result.error);
    modules.push(cockpit);assemblies.push({id,...result});
    zones.set(index?'flight2':'flight',{name:'МС-21 · кабина '+(index+1),id:id+'-1',root:cockpit.root,module:cockpit,description:'Полноразмерная кабина · два места · управляемая полётная панорама',
      actions:['flight-1-toggle','flight-1-left','flight-1-right','flight-1-reset'],
      interiorPose:{position:[-.93,1.54,1.4],target:[-.4,1.83,-.28]},overviewPose:{position:[5.9,4.1,7.8],target:[0,1.25,0]}});
  }

  const chersonesusRoot=exhibits.getInstanceRoot('O16-1');
  if(chersonesusRoot){
    applyChersonesusCompactFit(chersonesusRoot);
    const panorama=new Image();panorama.src='assets/zones/chersonesus-panorama.webp';panorama.onload=requestRender;
    const archaeology=fitModel(assets.get('X05_ARCHAEOLOGY'),[.70,.40,1.35],{rotationY:Math.PI/2});
    const museum=createChersonesusInterior({layout:'compact-source-zone',panoramaImage:panorama,archaeology,onChange:requestRender});chersonesusRoot.add(museum.root);
    const response=await fetch('assets/zones/o16-compact-collision-parts.json',{cache:'no-store'});if(!response.ok)throw new Error('Нет геометрии проходов Херсонеса.');
    const evidence=await response.json();
    const shellParts=evidence.parts.map(p=>({...p,socialTarget:false}));
    exhibits.refreshInstanceGeometry('O16-1',{collisionParts:[...shellParts,...museum.getCollisionParts()],extendFootprint:true});
    modules.push(museum);zones.set('chersonesus',{name:'Херсонес',id:'O16-1',root:chersonesusRoot,module:museum,description:'Аркада человеческого масштаба · музейные витрины · VR и панорамный экран',actions:['chersonesus-scene','chersonesus-vr-1','chersonesus-vr-2'],
      interiorPose:{position:[.65,1.65,-4.3],target:[.35,1.7,4.05],fov:65},overviewPose:{position:[13,10,-15],target:[0,1.8,0],fov:46}});
  }

  const select=document.getElementById('section-select'),bar=document.getElementById('zone-actions'),buttons=document.getElementById('zone-action-buttons'),info=document.getElementById('zone-description');
  const hallSelect=document.getElementById('rgo-hall-select'),hallControl=document.getElementById('rgo-hall-control');
  for(const hall of rgoProgram.halls){const option=document.createElement('option');option.value=hall.id;option.textContent=hall.id+' · '+hall.title;hallSelect.add(option);}
  hallSelect.onchange=()=>act('rgo-hall-'+hallSelect.value);
  let selected=null,pointerStart=null;
  function updatePanel(){
    const zone=zones.get(selected);bar.hidden=!zone;buttons.replaceChildren();if(!zone)return;
    info.textContent=selected==='rgo'?'РГО · '+rgoProgram.halls.find(h=>h.id===rgo.activeHall).title:zone.description;
    hallControl.hidden=selected!=='rgo';hallSelect.value=rgo.activeHall;
    for(const action of zone.actions){const button=document.createElement('button');button.type='button';button.textContent=actionLabels[action]||action;
      button.dataset.zoneAction=action;button.onclick=()=>act(action);buttons.append(button);}
    document.getElementById('zone-inside').textContent=selected==='lider'?'В рубку':selected==='grain'?'Ближе к экспонату':'Внутри раздела';
  }
  function focus(id,{inside}={}){
    if(id.startsWith('station:')){bar.hidden=true;return Boolean(onStationFocus(id.slice(8)));}
    if(id.startsWith('rgo-')){rgo.setHall(id.slice(4));id='rgo';}
    if(id==='all'){selected=null;select.value='all';bar.hidden=true;rgo.setCutaway(true);onOverview();return true;}
    const zone=zones.get(id);if(!zone)return false;inside??=zone.defaultInside!==false;
    selected=id;select.value=id;updatePanel();
    const pose=(inside?zone.interiorPose:zone.overviewPose)||(inside?zone.module.interiorPose:zone.module.overviewPose);
    zone.root.updateWorldMatrix(true,true);rgo.setCutaway(!inside||id!=='rgo');
    if(pose)onFocus(zone.id,zone.root.localToWorld(new THREE.Vector3(...pose.position)),zone.root.localToWorld(new THREE.Vector3(...pose.target)),zone.name,pose.fov||(inside?62:43));
    else onFocus(zone.id,null,null,zone.name);
    requestRender();return true;
  }
  function act(action){
    const zone=zones.get(selected);if(!zone)return false;
    if(action==='lider-entry'){const pose=getIcebreakerAccess()?.getEntrancePose();if(!pose)return false;onFocus(zone.id,pose.position,pose.target,'Вход в рубку «Лидера»',62);requestRender();return true;}
    const result=typeof zone.module.interact==='function'?zone.module.interact(action):zone.module.action?.(action);
    if(result&&selected==='rgo')focus('rgo');requestRender();return Boolean(result);
  }
  select.disabled=false;select.onchange=()=>focus(select.value);
  document.getElementById('zone-inside').onclick=()=>focus(selected,{inside:true});
  document.getElementById('zone-overview').onclick=()=>focus(selected,{inside:false});
  document.getElementById('zone-close').onclick=()=>{bar.hidden=true;};
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),canvas=document.getElementById('canvas');
  function onDown(event){if(event.button===0||event.pointerType!=='mouse')pointerStart={id:event.pointerId,x:event.clientX,y:event.clientY,time:performance.now()};}
  function onUp(event){
    if(!pointerStart||pointerStart.id!==event.pointerId)return;const start=pointerStart;pointerStart=null;
    if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>5||performance.now()-start.time>600||!selected)return;
    const zone=zones.get(selected),rect=canvas.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2);raycaster.setFromCamera(pointer,camera);
    const targets=zone.module.pickTargets||zone.module.pickables||[];
    const hits=raycaster.intersectObjects(targets,true).filter(hit=>{for(let node=hit.object;node;node=node.parent)if(!node.visible)return false;return true;});
    const first=hits[0];if(!first)return;
    const action=getInstallationAction(first);if(action)act(action.action);else if(first.object.userData.zoneAction)act(first.object.userData.zoneAction);
    requestRender();
  }
  canvas.addEventListener('pointerdown',onDown);canvas.addEventListener('pointerup',onUp);
  return {focus,act,zones,assemblies,assets,hidePanel(){bar.hidden=true;selected=null;pointerStart=null;select.value='all';},
    update(dt){let changed=false;for(const module of modules)if(module.update?.(dt,camera))changed=true;return changed;},
    getState:()=>({ready:true,selected,modelsLoaded:assets.size,assetErrors:errors,assemblies:assemblies.map(({id,evidence})=>({id,matchedSamples:evidence.matchedSamples,requiredSamples:evidence.requiredSamples})),zones:[...zones.entries()].map(([id,zone])=>({...zone.module.getState(),id,name:zone.name,instanceId:zone.id}))}),
    dispose(){canvas.removeEventListener('pointerdown',onDown);canvas.removeEventListener('pointerup',onUp);modules.forEach(m=>m.dispose?.());},
  };
}
