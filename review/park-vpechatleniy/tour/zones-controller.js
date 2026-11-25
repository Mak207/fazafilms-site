import {createWalkInteractionAPI} from './walk-media.js?v=park-walk-20261125';
import {createEquipmentPlanScene} from './equipment-plan-scene.js?v=equipment-3d-20261125';
import {createExhibitionEquipment} from './exhibition-equipment.js?v=park-exhibition-20261125-r2';
import {elevateAircraftOnColumns} from './aircraft-supports.js?v=park-exhibition-20261125-r2';
import {applyChersonesusCompactFit} from './chersonesus-fit.js?v=park-exhibition-20261125-r2';
import * as THREE from 'three';
import {createIcebreakerEnvironment,loadZoneAssets} from './exhibition-zones.js?v=equipment-3d-20261125';
import {createMappedRgoGallery} from './rgo-gallery.js?v=park-exhibition-20261125-r2';
import {createGrainSilos,createFlightCockpits,createChersonesusInterior,getInstallationAction} from './exhibition-interactives.js?v=equipment-3d-20261125';

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
  const modules=[],zones=new Map(),assemblies=[],errors=[],equipmentBindings=new Map();
  let equipmentPlan=null;
  const sources=await loadZoneAssets(loader).catch(error=>({models:new Map(),errors:[{error:error.message}]}));
  errors.push(...sources.errors);
  const assets=sources.models;
  const [rgoLayout,rgoProgram,liderLayout,aircraftParts,equipmentLayout,sourceZones,sourceAssignments]=await Promise.all(['rgo-layout.json','rgo-primary-program.json','lider-layout.json','o05-collision-parts.json','equipment-layout.json','source-zones.json','object-regions-primary.json'].map(async name=>{const response=await fetch('assets/zones/'+name,{cache:'no-store'});if(!response.ok)throw new Error('Не загружена первичная схема РГО.');return response.json();}));
  const aircraft=elevateAircraftOnColumns({root:exhibits.getInstanceRoot('O05-1'),sourceCollisionParts:aircraftParts.collisionParts,liftMetres:.60});
  if(aircraft){exhibits.refreshInstanceGeometry('O05-1',{collisionParts:aircraft.getCollisionParts(),extendFootprint:true});modules.push(aircraft);}
  const rgo=createMappedRgoGallery({assets,layout:rgoLayout,program:rgoProgram});
  const rgoMovables=rgo.detachMovableExhibits();
  const rgoPlacement={id:'Z01-1',x:0,z:0,floorY:7.2,rotationY:0,zone:'РГО'};
  const rgoResult=exhibits.addAssembly({id:'Z01',name:'РГО · Музей и Аллея открытий',root:rgo.group,placement:rgoPlacement,collisionParts:rgo.getCollisionParts(),supportSamples:rgo.supportSamples,provenance:'primary-plan-018-mapped-to-CAD-with-reference-finishes-and-Hitem3D-components'});
  if(!rgoResult.ok)throw new Error(rgoResult.error);
  modules.push(rgo);assemblies.push({id:'Z01',...rgoResult});
  for(const item of rgoMovables){const result=exhibits.addAssembly({...item,provenance:'individually-editable-RGO-exhibit-from-primary-hall-layout'});if(!result.ok)throw new Error(item.name+': '+result.error);assemblies.push({id:item.id,...result});}
  zones.set('rgo',{name:'РГО',id:'Z01-1',root:rgo.group,module:rgo,description:'Музей и Аллея РГО · девять залов по исходной схеме',actions:['rgo-previous','rgo-next']});

  const iceRoot=exhibits.getInstanceRoot('O12-1');
  if(iceRoot){
    const ice=createIcebreakerEnvironment({layout:liderLayout});iceRoot.add(ice.group);
    exhibits.refreshInstanceGeometry('O12-1',{collisionParts:ice.getCollisionParts(),extendFootprint:true});
    modules.push(ice);zones.set('lider',{name:'Ледокол «Лидер»',id:'O12-1',root:iceRoot,module:ice,defaultInside:false,
      description:'СЗФО · цельный ледокол · полярная ночь, льды и северное сияние',
      actions:['arctic-toggle','arctic-next'],interiorPose:ice.overviewPose,overviewPose:ice.overviewPose});
  }

  const silos=createGrainSilos({id:'Z02',onChange:requestRender});
  const silosResult=exhibits.addAssembly({id:'Z02',name:'Агротехнологии · прозрачные силосы',root:silos.root,
    placement:{id:'Z02-1',x:.75,z:-1,floorY:13.2,rotationY:-Math.PI/4,zone:'Приволжский ФО'},collisionParts:silos.getCollisionParts()});
  if(!silosResult.ok)throw new Error(silosResult.error);
  modules.push(silos);assemblies.push({id:'Z02',...silosResult});
  zones.set('grain',{name:'Зерновые силосы',id:'Z02-1',root:silos.root,module:silos,defaultInside:false,description:'Три прозрачных цилиндра с раздельными потоками зёрен',actions:['grain-toggle'],
    interiorPose:{position:[6,2.7,6],target:[0,2.5,0]},overviewPose:{position:[15,12,21],target:[0,8.3,0],fov:50}});

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

  // Media embedded in a pavilion becomes a real independent assembly. Keep
  // the original geometry and animation; remove its old host collider once.
  for(const [key,zone]of zones){
    const parts=zone.module.getEquipmentParts?.()||[];
    if(!parts.length)continue;
    const before=zone.module.getCollisionParts?.()||[];
    for(const part of parts){
      const root=part.root;root.updateWorldMatrix(true,true);
      const position=root.getWorldPosition(new THREE.Vector3()),rotation=root.getWorldQuaternion(new THREE.Quaternion()),yaw=new THREE.Euler().setFromQuaternion(rotation,'YXZ').y;
      const inverse=root.matrixWorld.clone().invert(),collisionParts=part.collisionParts||[];
      if(!part.collisionParts)root.traverse(node=>{
        const b=node.userData.collisionBounds;if(!b)return;
        const box=new THREE.Box3(new THREE.Vector3(...b.min),new THREE.Vector3(...b.max)).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,node.matrixWorld));
        collisionParts.push({id:node.uuid,min:box.min.toArray(),max:box.max.toArray(),kind:node.userData.kind||'solid',occludesSight:node.userData.occludesSight,socialTarget:node.userData.kind!=='interactive-safety-zone'});
      });
      root.removeFromParent();root.position.set(0,0,0);root.rotation.set(0,0,0);
      const id=('EP_'+part.sourceId).toUpperCase().replace(/[^A-Z0-9_-]/g,'_').slice(0,35),floorY=exhibits.getInstance(zone.id)?.floorY||7.2;
      const result=exhibits.addAssembly({id,name:part.sourceId.startsWith('lider')?'Полярная панорама':root.name||zone.name,root,placement:{id:id+'-1',x:position.x,z:position.z,floorY,rotationY:yaw,zone:zone.name},collisionParts:collisionParts.length?collisionParts:undefined});
      if(!result.ok)throw new Error(result.error);
      const entries=zone.module.getMediaEntries?.()||zone.module.screens||[];
      const alias=part.sourceId==='chersonesus-info--1'?'chersonesus-information-1':part.sourceId==='chersonesus-info-1'?'chersonesus-information-2':part.sourceId;
      const media=entries.find(e=>e.id===alias),control=media?.media||media;
      equipmentBindings.set(part.sourceId,{sourceId:part.sourceId,root,instanceId:result.instanceId,parts:collisionParts,media:control,face:media?.face,pickTargets:[media?.face].filter(Boolean)});
    }
    const after=zone.module.getCollisionParts?.()||[];
    const previousIds=new Set(before.map(p=>p.id));
    const hostParts=(zone.root.userData.collisionParts||[]).filter(p=>!previousIds.has(p.id));
    // The ice module returns only the ship/ice body; its separated LED parts
    // were never added to the host's collision list.
    const combined=key==='lider'?after:[...hostParts,...after];
    exhibits.refreshInstanceGeometry(zone.id,{collisionParts:combined});
  }
  for(const item of rgoMovables)equipmentBindings.set(item.sourceId,{sourceId:item.sourceId,root:item.root,instanceId:item.placement.id,parts:item.collisionParts,media:item.media,pickTargets:item.media?[item.root]:[]});
  for(const key of ['flight','flight2']){const zone=zones.get(key);if(zone){const media=zone.module.getMediaEntries?.()[0];equipmentBindings.set(zone.id,{sourceId:zone.id,root:zone.root,instanceId:zone.id,parts:zone.module.getCollisionParts(),media,face:media?.face,pickTargets:zone.module.pickTargets||[]});}}

  const baseInstanceIds=new Set(exhibits.listInstances().map(p=>p.instanceId));
  const equipment=createExhibitionEquipment({exhibits,layout:equipmentLayout,onChange:requestRender});modules.push(equipment);
  for(const [id,record]of equipment.records)equipmentBindings.set(id,{...record,sourceId:id,pickTargets:[record.screen]});
  equipmentPlan=createEquipmentPlanScene({exhibits,bindings:equipmentBindings,requestRender});modules.push(equipmentPlan);
  // Existing embedded displays share the same selection and playback controls;
  // their host module remains responsible for animation and collision geometry.
  const mediaRecords=new Map(equipment.records),embeddedPickTargets=[];
  for(const [key,zone]of zones){
    const entries=zone.module.getMediaEntries?.()||zone.module.screens||[];
    for(const entry of entries){
      const id='embedded:'+zone.id+':'+entry.id,regionId=key==='lider'?'northwest':key.startsWith('flight')?'siberia':key==='chersonesus'?'south':key==='grain'?'volga':'rgo';
      const control=entry.media||{getState:()=>entry.getState?.()||{playing:true},interact:action=>entry.interact?.(action)};
      const cabinetCount=entry.cabinetCount||entry.cabinets?.count||0;
      const record={id,name:entry.name||entry.title||zone.name,instanceId:zone.id,regionId,hallId:entry.hallId||null,anchorId:zone.id,anchorIds:[zone.id],category:'media',categoryLabel:cabinetCount?'LED-панорама':'Экран экспоната',width:entry.width,height:entry.height,cabinetCount,cabinetColumns:entry.cabinetColumns||entry.cabinets?.columns||0,cabinetRows:entry.cabinetRows||entry.cabinets?.rows||0,theme:entry.theme||'heritage',media:control,face:entry.face,embedded:true,zone,entry};
      mediaRecords.set(id,record);if(entry.face){entry.face.userData.equipmentId=id;embeddedPickTargets.push(entry.face);}
    }
  }
  for(const item of rgoMovables.filter(i=>i.media)){
    const nav=rgo.getNavigationItems().find(i=>i.id===item.sourceId),id='embedded:'+item.placement.id;
    mediaRecords.set(id,{id,name:item.name,instanceId:item.placement.id,regionId:'rgo',hallId:nav.hallId,anchorId:'rgo-item:'+item.sourceId,anchorIds:['rgo-item:'+item.sourceId],category:'media',categoryLabel:'Панорамный экран',width:7,height:2.6,cabinetCount:0,theme:'future',media:item.media,embedded:true,rgoItem:item.sourceId});
  }
  const nameKey=r=>[r.regionId,r.hallId||'',r.name].join('|'),nameCounts=new Map(),nameOrdinals=new Map();
  for(const r of mediaRecords.values())nameCounts.set(nameKey(r),(nameCounts.get(nameKey(r))||0)+1);
  for(const r of mediaRecords.values()){const key=nameKey(r),ordinal=(nameOrdinals.get(key)||0)+1;nameOrdinals.set(key,ordinal);r.sourceTitle=r.name;r.displayName=nameCounts.get(key)>1?r.name+' · '+ordinal:r.name;}
  const media={get records(){return equipmentPlan?.active?equipmentPlan.records:mediaRecords;},
    getItems(filter={}){if(equipmentPlan?.active)return equipmentPlan.getItems(filter);return [...mediaRecords.values()].filter(r=>(!filter.regionId||r.regionId===filter.regionId)&&(!filter.hallId||r.hallId===filter.hallId)&&(!filter.anchorId||(r.anchorIds||[r.anchorId]).includes(filter.anchorId))).map(r=>({id:r.id,name:r.displayName,sourceTitle:r.sourceTitle,displayName:r.displayName,instanceId:r.instanceId,category:r.category,categoryLabel:r.categoryLabel,regionId:r.regionId,hallId:r.hallId,anchorId:r.anchorId,anchorIds:r.anchorIds||[r.anchorId],theme:r.theme,width:r.width,height:r.height,cabinetCount:r.cabinetCount,cabinetColumns:r.cabinetColumns,cabinetRows:r.cabinetRows,source:r.source,embedded:Boolean(r.embedded)}));},
    getPose(id){if(equipmentPlan?.active)return equipmentPlan.getPose(id);const r=mediaRecords.get(id);if(!r)return null;if(!r.embedded)return {...equipment.getPose(id),label:r.displayName};if(r.rgoItem){const p=rgo.getItemPose(r.rgoItem);return {instanceId:r.instanceId,label:r.displayName,position:new THREE.Vector3(...p.position),target:new THREE.Vector3(...p.target),fov:p.fov};}const pose=r.zone.interiorPose||r.zone.module.interiorPose||r.zone.overviewPose;r.zone.root.updateWorldMatrix(true,true);return {instanceId:r.instanceId,label:r.displayName,position:r.zone.root.localToWorld(new THREE.Vector3(...pose.position)),target:r.zone.root.localToWorld(new THREE.Vector3(...pose.target)),fov:pose.fov||62};},
    interact(id,action='next'){if(equipmentPlan?.active)return equipmentPlan.interact(id,action);const r=mediaRecords.get(id);if(!r)return false;const changed=r.media.interact(action);requestRender();return changed;},
  };
  const select=document.getElementById('section-select'),bar=document.getElementById('zone-actions'),buttons=document.getElementById('zone-action-buttons'),info=document.getElementById('zone-description');
  const hallSelect=document.getElementById('rgo-hall-select'),hallControl=document.getElementById('rgo-hall-control');
  const labelMap={rgo:'РГО · Аллея открытий','rgo-museum':'Музей РГО','far-east':'Дальний Восток',siberia:'Сибирь',ural:'Урал',volga:'Поволжье',central:'Центр и Черноземье',northwest:'Арктика и северо-запад',south:'Юг России',caucasus:'Северный Кавказ','central-square':'Центральная площадь',history:'Зал правителей'};
  Object.assign(actionLabels,{'arctic-toggle':'Полярная ночь: пуск / пауза','arctic-next':'Другой момент панорамы','media-toggle':'Контент: пуск / пауза','media-next':'Следующая сцена','media-reset':'Начать сначала'});
  const regionOrder=['rgo','far-east','siberia','ural','volga','central','northwest','south','caucasus','rgo-museum','central-square','history'];
  const aliases=new Map([...zones].map(([key,value])=>[value.id,key]));
  const originalRegions=new Map(sourceAssignments.instances.map(p=>[p.instanceId,p]));
  const fixedRegions={'Z01-1':'rgo','Z02-1':'volga','Z03-1':'siberia','Z04-1':'siberia','O12-1':'northwest','O16-1':'south'};
  for(const item of rgoMovables)fixedRegions[item.placement.id]='rgo';
  const fallbackRegions={O01:'ural',O02:'ural',O03:'ural',O04:'ural',O07:'central-square',O08:'central-square'};
  let selected=null,selectedRegion=null,selectedObject=null,selectedMedia=null,pointerStart=null,lastNavigation='',walkMode=false;
  function makeSelect(id,title){const label=document.createElement('label');label.className='exhibition-select-label';const caption=document.createElement('span');caption.textContent=title;const input=document.createElement('select');input.id=id;input.setAttribute('aria-label',title);label.append(caption,input);hallControl.after(label);return {label,input};}
  const mediaSelect=makeSelect('zone-media-select','Экраны и интерактивы'),objectSelect=makeSelect('zone-object-select','Экспонат');
  const status=document.createElement('p');status.className='exhibition-media-status';status.id='zone-media-status';mediaSelect.label.after(status);
  const edit=document.createElement('button');edit.type='button';edit.className='exhibition-edit-action';edit.textContent='Изменить мышью';edit.title='Положение, поворот и размер выбранного объекта';document.querySelector('.zone-navigation').append(edit);
  const emitNavigation=()=>{document.dispatchEvent(new CustomEvent('park-navigation-change'));};
  function option(value,text){const o=document.createElement('option');o.value=value;o.textContent=text;return o;}
  select.replaceChildren(option('rgo',labelMap.rgo));
  for(const id of regionOrder.slice(1))select.append(option('zone:'+id,labelMap[id]));
  const quick=document.createElement('optgroup');quick.label='Быстрый переход';for(const [id,z]of zones)if(id!=='rgo')quick.append(option(id,z.name));select.append(quick,option('all','Весь парк'));
  hallSelect.replaceChildren();for(const hall of rgoProgram.halls)hallSelect.append(option(hall.id,hall.id+' · '+hall.title));
  function objects(regionId=selectedRegion){
    if(regionId==='rgo')return rgo.getNavigationItems().filter(item=>!item.instanceId||exhibits.getInstance(item.instanceId)?.visible).map(item=>({...item,id:'rgo-item:'+item.id,regionId:'rgo',floorY:7.2}));
    return exhibits.listInstances().filter(p=>p.visible&&baseInstanceIds.has(p.instanceId)&&p.instanceId!=='Z01-1').map(p=>{
      const primary=originalRegions.get(p.instanceId),regionId=fixedRegions[p.instanceId]||primary?.regionId||fallbackRegions[p.exhibitId]||null;
      return {id:p.instanceId,instanceId:p.instanceId,name:p.name+(p.copies>1?' · '+p.ordinal:''),regionId,floorY:p.floorY,sourceStatus:primary?.status||'confirmed',position:[p.x,p.y,p.z],kind:'model'};
    }).filter(p=>!regionId||p.regionId===regionId);
  }
  function getNavigation(){return {selectedRegion,selectedObject,selectedMedia,activeHall:rgo.activeHall,regions:regionOrder.map(id=>({id,name:labelMap[id],objects:objects(id),equipment:media.getItems({regionId:id})})),halls:rgoProgram.halls.map(h=>({id:h.id,name:h.title,objects:objects('rgo').filter(x=>x.hallId===h.id),equipment:media.getItems({regionId:'rgo',hallId:h.id})}))};}
  function matchingMedia(){const filter={regionId:selectedRegion};if(selectedRegion==='rgo')filter.hallId=rgo.activeHall;else if(selectedObject)filter.anchorId=selectedObject;let result=media.getItems(filter);if(!result.length&&selectedRegion!=='rgo')result=media.getItems({regionId:selectedRegion});return result;}
  function updateUrl(){const u=new URL(location.href);u.searchParams.set('section',selectedRegion==='rgo'?'rgo':selected||'zone:'+selectedRegion);if(selectedRegion==='rgo')u.searchParams.set('rgo',rgo.activeHall);else u.searchParams.delete('rgo');if(selectedObject)u.searchParams.set('object',selectedObject);else u.searchParams.delete('object');if(selectedMedia)u.searchParams.set('media',selectedMedia);else u.searchParams.delete('media');history.replaceState(null,'',u);}
  function updatePanel(){
    bar.hidden=!selectedRegion;if(!selectedRegion)return;const zone=zones.get(selected);
    info.textContent=selectedRegion==='rgo'?'РГО · '+rgoProgram.halls.find(h=>h.id===rgo.activeHall)?.title:zone?.description||labelMap[selectedRegion];
    select.value=selectedRegion==='rgo'?'rgo':selected||'zone:'+selectedRegion;
    hallControl.hidden=selectedRegion!=='rgo';hallSelect.value=rgo.activeHall;
    const shown=objects().filter(o=>selectedRegion!=='rgo'||o.hallId===rgo.activeHall);
    objectSelect.input.replaceChildren(option('',selectedRegion==='rgo'?'Зал целиком':'Зона целиком'));
    for(const o of shown)objectSelect.input.append(option(o.id,o.name));objectSelect.input.value=selectedObject||'';
    objectSelect.label.hidden=!shown.length;
    const availableMedia=matchingMedia();mediaSelect.input.replaceChildren(option('','Выберите экран или интерактив'));
    for(const m of availableMedia)mediaSelect.input.append(option(m.id,m.name));mediaSelect.input.value=selectedMedia||'';mediaSelect.label.hidden=!availableMedia.length;
    const record=selectedMedia?media.records.get(selectedMedia):null;
    status.hidden=!record;status.textContent=record?(record.categoryLabel||(record.category==='projection'?'Проекционный экран':record.category==='interactive'?'Интерактивная станция':'LED-экран'))+' · '+record.width.toFixed(2)+' × '+record.height.toFixed(2)+' м'+(record.cabinetCount?' · '+record.cabinetColumns+' × '+record.cabinetRows+' кабинетов':'')+' · '+(record.media?.getState?.().playing?'контент воспроизводится':'пауза'):'';
    const actions=selectedMedia?(record?.media?['media-toggle','media-next','media-reset']:[]):(zone?.actions||[]);buttons.replaceChildren();
    for(const action of actions){const b=document.createElement('button');b.type='button';b.textContent=actionLabels[action]||action;b.dataset.zoneAction=action;b.onclick=()=>act(action);buttons.append(b);}
    const actionControls=document.getElementById('zone-action-controls');actionControls.hidden=!actions.length;actionControls.dataset.collapsible=String(actions.length>2);actionControls.open=!matchMedia('(max-width:600px)').matches||actions.length<=2;
    document.getElementById('zone-inside').textContent=selectedMedia?'К экрану':selectedObject?'К экспонату':selectedRegion==='rgo'?'В зал':'Ближе';
    document.getElementById('zone-overview').textContent=selectedRegion==='rgo'?'Зал целиком':'Зона целиком';
    edit.hidden=!(record||selectedObject||zone);emitNavigation();
  }
  function focusRegion(id,{navigate=true}={}){
    if(id==='rgo'){
      if(navigate)return focus('rgo');
      selectedRegion='rgo';selected='rgo';selectedObject=null;selectedMedia=null;
      rgo.setCutaway(true);updatePanel();updateUrl();requestRender();return true;
    }
    if(!labelMap[id])return false;
    selectedRegion=id;selected=null;selectedObject=null;selectedMedia=null;updatePanel();
    if(navigate){const entries=sourceZones.zones.filter(z=>z.regionId===id),box=new THREE.Box3();for(const z of entries)for(const poly of z.polygons)for(const [x,y]of poly)box.expandByPoint(new THREE.Vector3(x,z.floorY,y));if(!box.isEmpty()){const target=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),span=Math.max(size.x,size.z,14);onFocus('zone:'+id,target.clone().add(new THREE.Vector3(span*.4,span*.85,span*.55)),target,labelMap[id],48);}}
    rgo.setCutaway(true);updateUrl();requestRender();return true;
  }
  function focusObject(id,{navigate=true}={}){
    if(!id)return selectedRegion==='rgo'?focus('rgo'):focusRegion(selectedRegion,{navigate});
    if(id.startsWith('rgo-item:')){const item=objects('rgo').find(p=>p.id===id);if(!item)return false;selectedRegion='rgo';selected='rgo';selectedObject=id;selectedMedia=null;rgo.setHall(item.hallId);rgo.setCutaway(false);updatePanel();const pose=rgo.getItemPose(id.slice(9));if(navigate&&pose)onFocus(item.instanceId,pose.world?new THREE.Vector3(...pose.position):rgo.group.localToWorld(new THREE.Vector3(...pose.position)),pose.world?new THREE.Vector3(...pose.target):rgo.group.localToWorld(new THREE.Vector3(...pose.target)),item.name,pose.fov);}
    else {const item=objects(null).find(p=>p.id===id);if(!item)return false;selectedRegion=item.regionId;selected=aliases.get(id)||null;selectedObject=id;selectedMedia=null;updatePanel();if(navigate){const zone=zones.get(selected);if(zone){const pose=zone.overviewPose||zone.module.overviewPose;if(pose)onFocus(id,zone.root.localToWorld(new THREE.Vector3(...pose.position)),zone.root.localToWorld(new THREE.Vector3(...pose.target)),zone.name,pose.fov||48);else onFocus(id,null,null,item.name);}else if(id==='O05-1'){const root=exhibits.getInstanceRoot(id);root.updateWorldMatrix(true,true);onFocus(id,root.localToWorld(new THREE.Vector3(-13.26958309608666,2.1,14.174560467825845)),root.localToWorld(new THREE.Vector3(0,1.6,0)),item.name,55);}else onFocus(id,null,null,item.name);}}
    updateUrl();requestRender();return true;
  }
  function focusEquipment(id,{navigate=true}={}){const item=media.records.get(id);if(!item)return false;selectedRegion=item.regionId;if(item.regionId==='rgo'){selected='rgo';rgo.setHall(item.hallId);selectedObject=item.rgoItem?'rgo-item:'+item.rgoItem:null;rgo.setCutaway(false);}else{selectedObject=item.anchorId||null;selected=aliases.get(selectedObject)||null;rgo.setCutaway(true);}selectedMedia=id;updatePanel();if(navigate){const pose=media.getPose(id);onFocus(pose.instanceId,pose.position,pose.target,pose.label,pose.fov);}updateUrl();requestRender();return true;}
  function focus(id,{inside}={}){
    if(!id)return false;if(id.startsWith('station:')){bar.hidden=true;return Boolean(onStationFocus(id.slice(8)));}
    if(id.startsWith('zone:'))return focusRegion(id.slice(5));if(id.startsWith('rgo-item:')||baseInstanceIds.has(id))return focusObject(id);
    if(media.records.has(id))return focusEquipment(id);
    if(id.startsWith('rgo-')){rgo.setHall(id.slice(4));id='rgo';}
    if(id==='all'){selected=null;selectedRegion=null;selectedObject=null;selectedMedia=null;select.value='all';bar.hidden=true;rgo.setCutaway(true);onOverview();return true;}
    const zone=zones.get(id);if(!zone)return false;inside??=zone.defaultInside!==false;
    selected=id;selectedRegion=id==='rgo'?'rgo':fixedRegions[zone.id];selectedObject=id==='rgo'?null:zone.id;selectedMedia=null;updatePanel();
    const pose=(inside?zone.interiorPose:zone.overviewPose)||(inside?zone.module.interiorPose:zone.module.overviewPose);
    zone.root.updateWorldMatrix(true,true);rgo.setCutaway(!inside||id!=='rgo');
    if(pose)onFocus(zone.id,zone.root.localToWorld(new THREE.Vector3(...pose.position)),zone.root.localToWorld(new THREE.Vector3(...pose.target)),zone.name,pose.fov||(inside?62:43));else onFocus(zone.id,null,null,zone.name);
    updateUrl();requestRender();return true;
  }
  function act(action){
    if(action.startsWith('media-')){const ok=media.interact(selectedMedia,action.slice(6));updatePanel();return ok;}
    const zone=zones.get(selected);if(!zone)return false;const result=typeof zone.module.interact==='function'?zone.module.interact(action):zone.module.action?.(action);
    if(result&&selected==='rgo')focus('rgo');requestRender();return Boolean(result);
  }
  select.disabled=false;select.onchange=()=>focus(select.value);hallSelect.onchange=()=>focus('rgo-'+hallSelect.value);objectSelect.input.onchange=()=>focusObject(objectSelect.input.value);mediaSelect.input.onchange=()=>{if(mediaSelect.input.value)focusEquipment(mediaSelect.input.value);};
  document.getElementById('zone-inside').onclick=()=>{if(selectedMedia)focusEquipment(selectedMedia);else if(selected)focus(selected,{inside:true});else if(selectedObject)focusObject(selectedObject);else focusRegion(selectedRegion);};
  document.getElementById('zone-overview').onclick=()=>selectedRegion==='rgo'?focus('rgo',{inside:false}):focusRegion(selectedRegion);
  document.getElementById('zone-close').onclick=()=>{bar.hidden=true;};
  edit.onclick=()=>{const id=selectedMedia?media.records.get(selectedMedia)?.instanceId:selectedObject?.startsWith('rgo-item:')?objects('rgo').find(i=>i.id===selectedObject)?.instanceId:selectedObject||zones.get(selected)?.id;if(id)document.dispatchEvent(new CustomEvent('park-edit-instance',{detail:{instanceId:id}}));};
  const walkInteractions=createWalkInteractionAPI({getMediaRecords:()=>media.records,getAllMediaRecords:()=>equipmentPlan?.active?equipmentPlan.pool:mediaRecords,zones,exhibits,actionLabels,requestRender});
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),canvas=document.getElementById('canvas');
  function onDown(event){if(walkMode)return;if(event.button===0||event.pointerType!=='mouse')pointerStart={id:event.pointerId,x:event.clientX,y:event.clientY,time:performance.now()};}
  function onUp(event){if(walkMode){pointerStart=null;return;}if(!pointerStart||pointerStart.id!==event.pointerId)return;const start=pointerStart;pointerStart=null;if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>4||performance.now()-start.time>500||canvas.classList.contains('editing-exhibit'))return;
    const rect=canvas.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2);raycaster.setFromCamera(pointer,camera);
    const zone=zones.get(selected),targets=[...(equipmentPlan?.active?equipmentPlan.pickTargets:[...equipment.pickTargets,...embeddedPickTargets]),...(zone?.module.pickTargets||zone?.module.pickables||[])];const hit=raycaster.intersectObjects(targets,true).find(hit=>{for(let n=hit.object;n;n=n.parent)if(!n.visible)return false;return true;});if(!hit)return;
    if(hit.object.userData.equipmentId){const id=hit.object.userData.equipmentId;if(selectedMedia===id)act('media-next');else focusEquipment(id,{navigate:false});return;}
    const action=getInstallationAction(hit);if(action)act(action.action);else if(hit.object.userData.zoneAction)act(hit.object.userData.zoneAction);requestRender();
  }
  canvas.addEventListener('pointerdown',onDown);canvas.addEventListener('pointerup',onUp);
  return {focus,focusRegion,focusObject,focusEquipment,act,getNavigation,equipment,media,rgo,zones,assemblies,assets,
    getWalkTargets:walkInteractions.getWalkTargets,activateWalkTarget:walkInteractions.activateWalkTarget,getWalkMedia:walkInteractions.getWalkMedia,setWalkVideos:walkInteractions.setWalkVideos,pauseWalkVideos:walkInteractions.pauseWalkVideos,
    setWalkMode(value){walkMode=Boolean(value);pointerStart=null;},
    setEquipmentPlan(snapshot){const result=equipmentPlan.sync(snapshot);if(result.ok){walkInteractions.sync();if(selectedMedia&&!equipmentPlan.records.has(selectedMedia))selectedMedia=null;updatePanel();emitNavigation();}return result;},
    previewEquipment:(id,position)=>equipmentPlan.preview(id,position),
    cancelEquipmentPreview:id=>equipmentPlan.cancelPreview(id),
    equipmentPlanState:()=>equipmentPlan.getState(),
    getEquipmentPlanPose:id=>equipmentPlan.getPose(id),
    hidePanel(){bar.hidden=true;pointerStart=null;},
    refreshNavigation(){updatePanel();},
    update(dt){let changed=walkInteractions.updateWalkMedia();for(const module of modules)if(module.update?.(dt,camera))changed=true;return changed;},
    getState:()=>({ready:true,selected,selectedRegion,selectedObject,selectedMedia,modelsLoaded:assets.size,assetErrors:errors,equipment:equipment.getState(),navigation:getNavigation(),assemblies:assemblies.map(({id,evidence})=>({id,matchedSamples:evidence.matchedSamples,requiredSamples:evidence.requiredSamples})),zones:[...zones.entries()].map(([id,zone])=>({...zone.module.getState(),id,name:zone.name,instanceId:zone.id}))}),
    dispose(){walkInteractions.dispose();canvas.removeEventListener('pointerdown',onDown);canvas.removeEventListener('pointerup',onUp);modules.forEach(m=>m.dispose?.());},
  };
}
