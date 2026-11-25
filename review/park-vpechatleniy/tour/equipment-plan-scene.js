import * as THREE from 'three';
import { createLiveMedia } from './live-media.js?v=equipment-3d-20261125';
import { getUnitMetrics } from '../installations/equipment-model.js?v=equipment-3d-20261125';

const clonePosition = p => ({x:p.x,z:p.z,y:p.y ?? (p.floorId==='upper'?13.2:7.2),yaw:p.yaw||0,floorId:p.floorId||'main'});
const hall = id => id?.replace(/^RGO-/,'') || null;
function stableId(value){let h=2166136261;for(const c of value){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return 'EQ_'+(h>>>0).toString(16).toUpperCase();}
function box(root,size,p,material){const m=new THREE.Mesh(new THREE.BoxGeometry(...size),material);m.position.fromArray(p);root.add(m);return m;}
function themeFor(item){return ({northwest:'arctic',south:'heritage',siberia:'flight',volga:'grain',central:'central',ural:'energy',caucasus:'caucasus','far-east':'ocean'})[item.regionId]||'future';}

/** New additions are proper devices at their declared dimensions; source copies
 * below reuse the actual Hitem3D/parametric assembly and shared programme texture. */
export function createPlannedEquipment(item,data,{mediaFactory=createLiveMedia}={}){
  const root=new THREE.Group(),d=item.dimensions,w=d.widthM,h=d.heightM,depth=Math.max(.05,d.depthM||.2),bottom=item.mountingBottomM||0;
  const dark=new THREE.MeshStandardMaterial({color:0x183039,roughness:.58,metalness:.25});
  const frame=new THREE.MeshStandardMaterial({color:0x526962,roughness:.45,metalness:.45});
  const light=new THREE.MeshBasicMaterial({color:0xe4c987,toneMapped:false});
  const glass=new THREE.MeshPhysicalMaterial({color:0xc6e8e7,transparent:true,opacity:.17,roughness:.1,depthWrite:false});
  let media=null,face=null;const pickTargets=[];
  const metrics=getUnitMetrics(data,data.groups.find(g=>g.id===item.groupId)||item);
  if(item.typeId==='showcase'){
    box(root,[w,h*.59,depth],[0,h*.295,0],dark);box(root,[w-.04,.035,depth-.04],[0,h*.61,0],light);
    box(root,[w,h*.38,depth],[0,h*.81,0],glass);
    for(let i=0;i<3;i++){const object=new THREE.Mesh(new THREE.IcosahedronGeometry(Math.min(w,depth)*.13,1),frame);object.position.set((i-1)*w*.26,h*.69,0);root.add(object);}
  }else if(item.typeId==='vr-station'){
    const ring=new THREE.Mesh(new THREE.TorusGeometry(Math.min(w,depth)*.43,.025,6,48),light);ring.rotation.x=-Math.PI/2;ring.position.y=.04;root.add(ring);
    box(root,[.3,1.25,.25],[-w*.3,.625,-depth*.3],dark);box(root,[.28,.14,.17],[-w*.3,1.34,-depth*.3],frame);
  }else if(item.typeId==='projector'){
    box(root,[w,h,depth],[0,bottom+h/2,0],frame);const lens=new THREE.Mesh(new THREE.CylinderGeometry(Math.min(w,h)*.25,Math.min(w,h)*.25,.09,20),dark);lens.rotation.x=Math.PI/2;lens.position.set(0,bottom+h/2,depth/2);root.add(lens);
  }else{
    const display=item.displayDimensions||d,dw=display.widthM||w,dh=display.heightM||h;
    const horizontal=['touch-table','projection-map'].includes(item.typeId);
    const displayHeight=horizontal?Math.min(h,.95):bottom+dh/2;
    box(root,[w,h,depth],[0,bottom+h/2,0],dark);
    media=mediaFactory({theme:themeFor(item),title:item.name,width:dw>3?1024:640,height:dw>3?576:360,fps:10});
    face=new THREE.Mesh(new THREE.PlaneGeometry(dw,dh),new THREE.MeshBasicMaterial({map:media.texture,color:0xffffff,toneMapped:false,side:THREE.FrontSide}));
    if(horizontal){face.rotation.x=-Math.PI/2;face.position.set(0,displayHeight+.025,0);face.scale.y=Math.min(depth/dh,1);}
    else face.position.set(0,displayHeight,depth/2+.006);
    root.add(face);pickTargets.push(face);
    if(bottom>0){for(const x of[-w*.32,w*.32])box(root,[.07,bottom,.07],[x,bottom/2,0],frame);box(root,[Math.min(w,2.8),.05,depth],[0,.025,0],dark);}
    if(item.typeId==='led-interactive'||item.typeId==='led-navigation')box(root,[.42,.12,.18],[Math.min(.4,w*.25),.9,depth/2+.05],frame);
    if(metrics.ledCabinets){const matrix=new THREE.Matrix4(),back=new THREE.InstancedMesh(new THREE.BoxGeometry(.598,.332,.025),frame,metrics.ledCabinets);let n=0;for(let row=0;row<metrics.cabinetRows;row++)for(let col=0;col<metrics.cabinetColumns;col++){matrix.makeTranslation(-dw/2+(col+.5)*.608,bottom+(row+.5)*.342,-depth/2-.015);back.setMatrixAt(n++,matrix);}root.add(back);}
  }
  const parts=[{id:'equipment',min:[-w/2,0,-depth/2],max:[w/2,Math.max(h+bottom,.1),depth/2],socialTarget:item.typeId!=='vr-station'}];
  root.name=item.name;root.userData.collisionParts=parts;
  return {root,media,face,parts,pickTargets,ownedMedia:Boolean(media),update:dt=>media?.update(dt)||false};
}

/** Pure mapping, used by both the live adapter and regression checks. */
export function planSourceBindings(data){const result=new Map();for(const group of data.groups||[])for(const [index,seed] of (group.seedInstances||[]).entries())if(seed.sourceId)result.set(seed.sourceId,{planId:`${group.id}::${index+1}`,group,index});return result;}

export function createEquipmentPlanScene({exhibits,bindings=new Map(),requestRender=()=>{},onChange=()=>{},factory=createPlannedEquipment}={}){
  if(!exhibits?.updateInstances)throw new TypeError('Нужен модуль совместной расстановки оборудования.');
  const pool=new Map(),records=new Map(),sourceRecords=new Map(bindings),previews=new Map();
  let active=false,disposed=false,revision=0,lastError=null,lastSnapshot=null,unplaced=[];
  function metadata(record,item){
    record.item=item;record.id=item.id;record.name=item.name;record.displayName=item.name;
    record.regionId=item.regionId;record.hallId=hall(item.hallId);record.anchorId=item.exhibitId;record.anchorIds=[item.exhibitId].filter(Boolean);
    record.width=item.displayDimensions?.widthM||item.dimensions.widthM;record.height=item.displayDimensions?.heightM||item.dimensions.heightM;
    record.category=item.category;record.categoryLabel=item.typeName;record.theme=record.theme||themeFor(item);
    const m=getUnitMetrics(lastSnapshot.data,lastSnapshot.data.groups.find(g=>g.id===item.groupId));Object.assign(record,{cabinetCount:m.ledCabinets,cabinetColumns:m.cabinetColumns,cabinetRows:m.cabinetRows});
    record.root.traverse(node=>{if(node.isMesh){node.userData.equipmentPlanId=item.id;if(record.media)node.userData.equipmentId=item.id;}});
    exhibits.manageInstance(record.instanceId,item.id,item.name);
  }
  function createRecord(item){
    let existing=item.sourceId&&sourceRecords.get(item.sourceId);
    if(existing){const record={...existing,id:item.id,item,ownedMedia:false};pool.set(item.id,record);return record;}
    const group=lastSnapshot.data.groups.find(g=>g.id===item.groupId);
    const template=(group?.seedInstances||[]).map(seed=>sourceRecords.get(seed.sourceId)).find(Boolean);
    let built;
    if(template){
      const root=template.root.clone(true);root.position.set(0,0,0);root.rotation.set(0,0,0);root.scale.setScalar(1);
      built={root,media:template.media,parts:template.parts||template.root.userData.collisionParts,pickTargets:[],ownedMedia:false};
      root.traverse(node=>{if(node.isMesh&&node.userData.equipmentId)built.pickTargets.push(node);});
    }else built=factory(item,lastSnapshot.data);
    const id=stableId(item.id),p=clonePosition(item.position);
    const result=exhibits.addAssembly({id,name:item.name,root:built.root,placement:{id:id+'-1',x:p.x,z:p.z,floorY:p.y,rotationY:p.yaw,zone:item.regionId},collisionParts:built.parts,
      equipmentPlanId:item.id,initiallyVisible:false,notify:false,provenance:'equipment-plan-shared-placement'});
    if(!result.ok){if(built.ownedMedia)built.media?.dispose();return {error:result.error};}
    const record={...built,instanceId:result.instanceId,id:item.id,item};pool.set(item.id,record);return record;
  }
  function sync(snapshot){
    if(disposed)return {ok:false,error:'Схема оборудования закрыта.'};
    if(!snapshot?.data||!Array.isArray(snapshot.report?.placed))return {ok:false,error:'Нет расстановки оборудования.'};
    lastSnapshot=snapshot;
    const sources=planSourceBindings(snapshot.data);
    for(const [sourceId,binding]of sourceRecords){const source=sources.get(sourceId);if(source){exhibits.manageInstance(binding.instanceId,source.planId);if(!pool.has(source.planId))pool.set(source.planId,{...binding,id:source.planId,ownedMedia:false});}}
    const next=new Map(),changes=[],errors=[];
    for(const item of snapshot.report.placed){
      let record=pool.get(item.id);if(!record)record=createRecord(item);
      if(record.error){errors.push({id:item.id,name:item.name,error:record.error});continue;}
      metadata(record,item);next.set(item.id,record);
      const p=clonePosition(item.position);
      changes.push({instanceId:record.instanceId,patch:{x:p.x,z:p.z,rotationY:p.yaw,visible:true},options:{floorY:p.y}});
      record.pendingPosition=p;
    }
    for(const [id,record]of pool)if(!next.has(id)&&exhibits.getInstance(record.instanceId)?.visible)changes.push({instanceId:record.instanceId,patch:{visible:false}});
    if(errors.length){lastError=errors[0].error;return {ok:false,error:lastError,errors};}
    const result=exhibits.updateInstances(changes,{source:'equipment-plan'});
    if(!result.ok){lastError=result.error;onChange(getState());return {...result,errors:[{error:result.error}]};}
    records.clear();for(const [id,record]of next){record.position=record.pendingPosition;delete record.pendingPosition;records.set(id,record);}
    const nameKey=record=>[record.regionId,record.hallId||'',record.name].join('|'),counts=new Map(),ordinals=new Map();
    for(const record of records.values()){const key=nameKey(record);counts.set(key,(counts.get(key)||0)+1);}
    for(const record of records.values()){const key=nameKey(record),ordinal=(ordinals.get(key)||0)+1;ordinals.set(key,ordinal);record.displayName=counts.get(key)>1?record.name+' · '+ordinal:record.name;exhibits.manageInstance(record.instanceId,record.id,record.displayName);}
    cancelPreview();unplaced=snapshot.report.unplaced||[];active=true;lastError=null;revision++;requestRender();onChange(getState());
    return {ok:true,placed:records.size,unplaced:unplaced.length,errors:[]};
  }
  // A drag is visual only until mouse release. Visitors keep the committed
  // obstacle, so Escape can always cancel without moving people or bypassing a guard.
  function preview(id,position){
    const record=records.get(id);if(!record)return {ok:false,error:'Оборудование ещё не размещено.'};
    const p=clonePosition(position);if(![p.x,p.y,p.z,p.yaw].every(Number.isFinite))return {ok:false,error:'Некорректное положение оборудования.'};
    let ghost=previews.get(id);
    if(!ghost){
      const root=record.root.clone(true),materials=new Map();
      root.name=record.name;root.userData.equipmentPreview=true;
      root.traverse(node=>{if(node.isLight){node.visible=false;return;}if(!node.isMesh)return;const replace=original=>{if(!materials.has(original)){const material=original.clone();material.transparent=true;material.opacity=.42;material.depthWrite=false;materials.set(original,material);}return materials.get(original);};node.material=Array.isArray(node.material)?node.material.map(replace):replace(node.material);node.userData={equipmentPreview:true};node.renderOrder=10;node.castShadow=false;});
      const parent=exhibits.group.parent||exhibits.group;parent.add(root);
      ghost={root,materials};previews.set(id,ghost);
    }
    ghost.root.position.set(p.x,p.y,p.z);ghost.root.rotation.y=p.yaw;ghost.root.visible=true;ghost.root.updateWorldMatrix(true,true);requestRender();
    return {ok:true,preview:true};
  }
  function cancelPreview(id){
    for(const key of id?[id]:[...previews.keys()]){const ghost=previews.get(key);if(!ghost)continue;ghost.root.removeFromParent();for(const material of ghost.materials.values())material.dispose();previews.delete(key);}
    requestRender();return {ok:true};
  }
  function getPose(id){const r=records.get(id);if(!r)return null;r.root.updateWorldMatrix(true,true);const h=r.item.mountingBottomM+(r.item.dimensions.heightM||1.4)/2;return {instanceId:r.instanceId,label:r.displayName||r.name,position:r.root.localToWorld(new THREE.Vector3(0,1.65,Math.max(3.2,r.width*1.15))),target:r.root.localToWorld(new THREE.Vector3(0,Math.max(1,h),0)),fov:58};}
  function getItems(filter={}){return [...records.values()].filter(r=>(!filter.regionId||r.regionId===filter.regionId)&&(!filter.hallId||hall(filter.hallId)===r.hallId)&&(!filter.anchorId||r.anchorIds.includes(filter.anchorId))).map(r=>({id:r.id,name:r.displayName||r.name,displayName:r.displayName||r.name,sourceTitle:r.name,instanceId:r.instanceId,category:r.category,categoryLabel:r.categoryLabel,regionId:r.regionId,hallId:r.hallId,anchorId:r.anchorId,anchorIds:r.anchorIds,theme:r.theme,width:r.width,height:r.height,cabinetCount:r.cabinetCount,cabinetColumns:r.cabinetColumns,cabinetRows:r.cabinetRows,embedded:false}));}
  function getState(){return {active,count:records.size,revision,previewCount:previews.size,unplaced:unplaced.map(x=>({id:x.id,name:x.name})),lastError,items:[...records.values()].map(r=>({id:r.id,instanceId:r.instanceId,position:{...r.position},visible:r.root.visible}))};}
  return {records,pool,sync,preview,cancelPreview,getState,getPose,getItems,get active(){return active;},get pickTargets(){return [...records.values()].flatMap(r=>r.pickTargets||[r.face].filter(Boolean));},
    interact(id,action='next'){const r=records.get(id);if(!r?.media)return false;const changed=r.media.interact?.(action);requestRender();return Boolean(changed);},
    update(dt){let changed=false;for(const r of records.values())if(r.ownedMedia&&r.media?.update(dt))changed=true;return changed;},
    dispose(){if(disposed)return;disposed=true;for(const r of pool.values())if(r.ownedMedia)r.media?.dispose();records.clear();cancelPreview();}
  };
}
