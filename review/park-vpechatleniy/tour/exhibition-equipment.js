import * as THREE from 'three';
import {createLiveMedia} from './live-media.js?v=park-exhibition-20261125-r2';

const CATEGORY={media:'LED-экран',interactive:'Интерактивная станция',navigation:'Навигация',projection:'Проекционный экран'};
const REGION={rgo:'РГО','rgo-museum':'Музей РГО','far-east':'Дальний Восток',siberia:'Сибирь',ural:'Урал',volga:'Поволжье',central:'Центр и Черноземье',northwest:'Арктика и северо-запад',south:'Юг России',caucasus:'Северный Кавказ','central-square':'Центральная площадь',history:'Зал правителей'};

/** All equipment is registered before visitor routing and participates in the same editor/obstacles. */
export function createExhibitionEquipment({exhibits,layout,onChange=()=>{}}){
  const records=new Map(),errors=[],pickTargets=[];
  const dark=new THREE.MeshStandardMaterial({color:0x15272e,roughness:.6,metalness:.35});
  const frame=new THREE.MeshStandardMaterial({color:0x3a535b,roughness:.48,metalness:.5});
  const bronze=new THREE.MeshStandardMaterial({color:0xac9670,roughness:.5,metalness:.5});
  const frustum=new THREE.Frustum(),clipMatrix=new THREE.Matrix4(),worldCentre=new THREE.Vector3(),viewDirection=new THREE.Vector3(),frontNormal=new THREE.Vector3(),sphere=new THREE.Sphere();
  let visibleMediaCount=0,updatedMediaCount=0;
  function box(parent,size,position,material){const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material);mesh.position.fromArray(position);parent.add(mesh);return mesh;}
  for(const item of layout.items){
    const root=new THREE.Group(),w=item.width,h=item.height,y=item.bottom+h/2;
    const media=createLiveMedia({theme:item.theme,title:item.name,width:w>3?1024:640,height:w>3?576:360,fps:10});
    const body=box(root,[w+.08,h+.06,.12],[0,y,0],dark);body.name=CATEGORY[item.category]+' · '+item.name;
    const screen=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:media.texture,toneMapped:false,side:THREE.FrontSide}));screen.position.set(0,y,.066);screen.userData.equipmentId=item.id;screen.userData.zoneAction='equipment-next';root.add(screen);pickTargets.push(screen);
    if(item.cabinetCount){
      // Cabinet backs show the real modular assembly; one continuous content face hides technical seams.
      const geo=new THREE.BoxGeometry(.598,.332,.038),cabinets=new THREE.InstancedMesh(geo,frame,item.cabinetCount),matrix=new THREE.Matrix4();let k=0;
      for(let row=0;row<item.cabinetRows;row++)for(let col=0;col<item.cabinetColumns;col++){
        matrix.makeTranslation(-w/2+(col+.5)*.608,item.bottom+(row+.5)*.342,-.08);cabinets.setMatrixAt(k++,matrix);
      }
      cabinets.name='LED-кабинеты · '+item.cabinetColumns+' × '+item.cabinetRows;root.add(cabinets);
    }
    const span=Math.min(w*.62,2.5);
    for(const x of[-span/2,span/2])box(root,[.075,item.bottom,.075],[x,item.bottom/2,0],frame);
    box(root,[Math.min(w+.08,Math.max(1.1,span+.45)),.065,.46],[0,.0325,0],dark);
    if(item.category==='interactive'||item.category==='navigation'){
      const console=box(root,[.46,.11,.18],[Math.min(w*.24,.45),.87,.13],bronze);console.userData.equipmentId=item.id;console.userData.zoneAction='equipment-next';pickTargets.push(console);
      for(let n=0;n<3;n++){const b=new THREE.Mesh(new THREE.CylinderGeometry(.028,.028,.015,16),new THREE.MeshBasicMaterial({color:[0x87d7c1,0xe4ca75,0x75b4e4][n]}));b.position.set(Math.min(w*.24,.45)+(n-1)*.10,.934,.13);b.userData.equipmentId=item.id;b.userData.zoneAction='equipment-next';root.add(b);pickTargets.push(b);}
    }
    const id=('E_'+item.id).toUpperCase().replace(/[^A-Z0-9_-]/g,'_').slice(0,35),instanceId=id+'-1';
    root.userData.equipment={id:item.id,regionId:item.regionId,hallId:item.hallId,anchorId:item.anchorId,anchorIds:item.anchorIds||[item.anchorId].filter(Boolean),theme:item.theme,category:item.category};
    const parts=[{id:'display',min:[-(w+.08)/2,item.bottom-.03,-.10],max:[(w+.08)/2,item.bottom+h+.03,.10],socialTarget:true},
      {id:'stand',min:[-Math.min(w+.08,Math.max(1.1,span+.45))/2,0,-.23],max:[Math.min(w+.08,Math.max(1.1,span+.45))/2,Math.max(item.bottom,.99),.23],socialTarget:false}];
    const placement={id:instanceId,x:item.position[0],z:item.position[2],floorY:item.floorY,rotationY:item.rotationY,zone:REGION[item.regionId]||item.regionId};
    const result=exhibits.addAssembly({id,name:item.name,root,placement,collisionParts:parts,provenance:'primary-zone-equipment-with-actual-CAD-BVH-placement-and-live-content'});
    if(!result.ok){media.dispose();for(let i=pickTargets.length-1;i>=0;i--){let parent=pickTargets[i];while(parent&&parent!==root)parent=parent.parent;if(parent===root)pickTargets.splice(i,1);}errors.push({id:item.id,error:result.error});continue;}
    root.updateWorldMatrix(true,true);
    const cameraWorld=new THREE.Vector3(...(item.cameraPosition||item.viewPosition));
    const pose={position:root.worldToLocal(cameraWorld).toArray(),target:[0,y,0]};
    screen.geometry.computeBoundingSphere();
    records.set(item.id,{...item,instanceId,root,media,screen,parts,pose,supportEvidence:result.evidence,mediaTime:0});
  }
  function getItems(filter={}){return [...records.values()].filter(r=>(!filter.regionId||r.regionId===filter.regionId)&&(!filter.hallId||r.hallId===filter.hallId)&&(!filter.anchorId||(r.anchorIds||[r.anchorId]).includes(filter.anchorId))).map(r=>({id:r.id,name:r.name,instanceId:r.instanceId,category:r.category,categoryLabel:CATEGORY[r.category],regionId:r.regionId,hallId:r.hallId,anchorId:r.anchorId,anchorIds:r.anchorIds||[r.anchorId],theme:r.theme,width:r.width,height:r.height,cabinetCount:r.cabinetCount,cabinetColumns:r.cabinetColumns,cabinetRows:r.cabinetRows,source:r.source}));}
  return {records,pickTargets,getItems,
    getPose(id){const r=records.get(id);if(!r)return null;r.root.updateWorldMatrix(true,true);return {instanceId:r.instanceId,position:r.root.localToWorld(new THREE.Vector3(...r.pose.position)),target:r.root.localToWorld(new THREE.Vector3(...r.pose.target)),fov:r.width>3?68:58,label:r.name};},
    interact(id,action='next'){const r=records.get(id);if(!r)return false;const changed=r.media.interact(action);onChange();return changed;},
    update(dt,camera){
      let changed=false;visibleMediaCount=0;updatedMediaCount=0;
      if(camera){camera.updateWorldMatrix(true,false);clipMatrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(clipMatrix);}
      for(const r of records.values()){
        if(!r.root.visible)continue;
        r.screen.updateWorldMatrix(true,false);r.screen.getWorldPosition(worldCentre);
        const distance=camera?.position.distanceToSquared(worldCentre)??0;
        if(distance>10000)continue;
        if(camera){
          r.screen.getWorldDirection(frontNormal);viewDirection.subVectors(camera.position,worldCentre);
          if(frontNormal.dot(viewDirection)<=0)continue;
          sphere.copy(r.screen.geometry.boundingSphere).applyMatrix4(r.screen.matrixWorld);
          if(!frustum.intersectsSphere(sphere))continue;
        }
        visibleMediaCount++;r.mediaTime+=dt;
        if(distance>1225&&r.mediaTime<.2)continue;
        const refreshed=r.media.update(r.mediaTime);r.mediaTime=0;if(refreshed)updatedMediaCount++;changed=refreshed||changed;
      }
      return changed;
    },
    getState(){return {count:records.size,errors,cabinetCount:[...records.values()].reduce((s,r)=>s+r.cabinetCount,0),animatedCount:records.size,visibleMediaCount,updatedMediaCount,items:[...records.values()].map(r=>({id:r.id,instanceId:r.instanceId,regionId:r.regionId,hallId:r.hallId,anchorId:r.anchorId,...r.media.getState()}))};},
    dispose(){for(const r of records.values())r.media.dispose();},
  };
}
