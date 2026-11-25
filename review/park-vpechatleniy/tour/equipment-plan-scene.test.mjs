import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import {createDefaultState,getInstances,setQuantity} from '../installations/equipment-model.js';
const threeUrl=new URL('../../../golden-ring/interactives/vendor/three-0.180/three.module.min.js',import.meta.url).href;
registerHooks({resolve(specifier,context,nextResolve){return specifier==='three'?{url:threeUrl,shortCircuit:true}:nextResolve(specifier,context);}});
const THREE=await import('three');
const {createExhibitSystem}=await import('./exhibits.js');
const {createDynamicObstacleAdapter}=await import('./crowd/dynamic-obstacles.js');
const {createEquipmentPlanScene,createPlannedEquipment,planSourceBindings}=await import('./equipment-plan-scene.js');

const actual=JSON.parse(await readFile(new URL('../installations/equipment-data.json',import.meta.url)));
const layout=JSON.parse(await readFile(new URL('./assets/zones/equipment-layout.json',import.meta.url)));
const mediaFactory=()=>({texture:new THREE.Texture(),update:()=>true,interact:()=>true,getState:()=>({playing:true}),dispose(){}});
function simpleRoot(){const r=new THREE.Group();const b=new THREE.Mesh(new THREE.BoxGeometry(2,1,.3),new THREE.MeshBasicMaterial());b.position.y=.5;r.add(b);return r;}
async function makeSystem(){
 const scene=new THREE.Scene(),floors=[7.2,13.2].map(y=>{const f=new THREE.Mesh(new THREE.PlaneGeometry(400,400),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));f.name='A-FLOR-test';f.rotation.x=-Math.PI/2;f.position.y=y;scene.add(f);f.updateMatrixWorld(true);return f;});
 const manifest={version:1,objects:[{id:'O01',name:'Исходный экспонат',url:'object.glb',scaleTo:{axis:'x',meters:2},instances:[{id:'O01-1',x:-60,z:-60,floorY:7.2},{id:'O01-2',x:-60,z:-60,floorY:13.2}]}]};
 const fetchOld=globalThis.fetch;globalThis.fetch=async()=>({ok:true,json:async()=>manifest});
 try{return await createExhibitSystem({scene,sourceMeshes:floors,manifestUrl:'https://test.invalid/manifest.json',loader:{load(url,done){done({scene:simpleRoot()});}}});}
 finally{globalThis.fetch=fetchOld;}
}
function fixtureData(){return {catalog:[{id:'lcd-screen',category:'screen',screenUnits:1,name:'Экран'}],cabinetProfile:{},content:[],groups:[{id:'screens',name:'Экран экспедиции',typeId:'lcd-screen',regionId:'rgo',hallId:'RGO-05',floorId:'main',defaultQuantity:1,maxQuantity:12,dimensions:{widthM:2,heightM:1,depthM:.3},mountingBottomM:0,seedInstances:[{sourceId:'SOURCE-A',x:1,z:2,y:7.2,yaw:0,floorId:'main'}],contentIds:[]}]};}
function snapshot(data,count,positions={}){let state=setQuantity(data,createDefaultState(data),'screens',count);state.positions=positions;const placed=getInstances(data,state).map((r,i)=>({...r,position:positions[r.id]||r.position||{x:5+i*3,z:4,y:7.2,yaw:0,floorId:'main'}}));return {data,state,report:{placed,unplaced:[]}};}
async function setup(){const exhibits=await makeSystem(),data=fixtureData(),root=simpleRoot();const original=exhibits.addAssembly({id:'E_SOURCE_A',name:'Исходный экран',root,placement:{id:'E_SOURCE_A-1',x:1,z:2,floorY:7.2},collisionParts:[{id:'screen',min:[-1,0,-.15],max:[1,1,.15]}]});assert.equal(original.ok,true);const adapter=createEquipmentPlanScene({exhibits,bindings:new Map([['SOURCE-A',{root,instanceId:original.instanceId,media:mediaFactory(),pickTargets:[root]}]]),factory:(item,d)=>createPlannedEquipment(item,d,{mediaFactory})});assert.equal(adapter.sync(snapshot(data,1)).ok,true);return {exhibits,data,root,adapter};}

test('every original standalone screen maps once; embedded seeds stay distinct',()=>{const sources=planSourceBindings(actual);assert.equal(sources.size,76);for(const row of layout.items)assert.ok(sources.has(row.id),row.id);assert.notEqual(sources.get('chersonesus-info--1').planId,sources.get('chersonesus-info-1').planId);assert.equal(new Set([...sources.values()].map(x=>x.planId)).size,76);});

test('source screen is reused, added copy becomes a guarded real root, removal and re-add do not duplicate',async()=>{
 const {exhibits,data,root,adapter}=await setup();const obstacles=createDynamicObstacleAdapter({exhibits});
 assert.equal(adapter.records.get('screens::1').root,root);assert.equal(adapter.sync(snapshot(data,2)).ok,true);
 assert.deepEqual(adapter.getItems().map(item=>item.name),['Экран экспедиции · 1','Экран экспедиции · 2']);
 const added=adapter.records.get('screens::2').root,addedId=added.userData.instanceId;
 assert.notEqual(added,root);assert.equal(exhibits.getInstance(addedId).managedEquipment,true);
 assert.equal(obstacles.snapshot().proxies.filter(p=>p.instanceId===addedId).length,1);
 assert.equal(adapter.sync(snapshot(data,0)).ok,true);assert.equal(root.visible,false);assert.equal(added.visible,false);assert.equal(adapter.getState().count,0);
 assert.equal(adapter.sync(snapshot(data,2)).ok,true);assert.equal(adapter.records.get('screens::2').root,added);assert.equal(exhibits.roots.filter(r=>r.userData.equipmentPlanId).length,2);
});

test('visitor guard receives additions, poses and removals as one atomic transaction',async()=>{
 const {exhibits,data,adapter}=await setup();const obstacles=createDynamicObstacleAdapter({exhibits});let accepted=[];const simulation={order:[],world:{revision:0},updateObstacles(proxies,{dryRun,expectedRevision}={}){if(proxies.some(p=>p.centerXZ[0]>40))return {ok:false,reason:'no_clearance'};if(dryRun)return {ok:true,revision:this.world.revision};assert.equal(expectedRevision,this.world.revision);accepted=proxies;this.world.revision++;return {ok:true,revision:this.world.revision};}};
 assert.equal(obstacles.bindSimulation(simulation).ok,true);
 assert.equal(adapter.sync(snapshot(data,2,{'screens::1':{x:4,z:8,y:7.2,yaw:1.1,floorId:'main'},'screens::2':{x:12,z:3,y:7.2,yaw:-.8,floorId:'main'}})).ok,true);
 assert.equal(exhibits.getInstance(adapter.records.get('screens::1').instanceId).rotationY,1.1);
 const before=JSON.stringify(exhibits.getLayout()),acceptedBefore=accepted;
 const rejected=adapter.sync(snapshot(data,2,{'screens::1':{x:14,z:8,y:7.2,yaw:2,floorId:'main'},'screens::2':{x:50,z:3,y:7.2,yaw:0,floorId:'main'}}));
 assert.equal(rejected.ok,false);assert.equal(JSON.stringify(exhibits.getLayout()),before);assert.equal(accepted,acceptedBefore);
 assert.equal(adapter.sync(snapshot(data,0)).ok,true);assert.equal(accepted.filter(p=>p.instanceId.startsWith('E_SOURCE')||p.instanceId.startsWith('EQ_')).length,0);
});

test('mouse preview is a temporary ghost; cancellation never changes physical roots or visitor obstacles',async()=>{
 const {data,adapter,exhibits}=await setup();const obstacles=createDynamicObstacleAdapter({exhibits});const id=adapter.records.get('screens::1').instanceId,root=exhibits.getInstanceRoot(id),before=JSON.stringify(obstacles.snapshot());
 assert.equal(adapter.preview('screens::1',{x:8,z:5,y:7.2,yaw:Math.PI/2,floorId:'main'}).ok,true);
 assert.equal(exhibits.getInstance(id).rotationY,0);assert.equal(root.position.x,1);assert.equal(adapter.getState().previewCount,1);assert.equal(JSON.stringify(obstacles.snapshot()),before);
 const ghost=exhibits.group.parent.children.find(r=>r.userData.equipmentPreview);assert.ok(ghost);assert.equal(ghost.position.x,8);assert.equal(ghost.rotation.y,Math.PI/2);assert.ok(!exhibits.roots.includes(ghost));
 exhibits.setPlacementGuard(()=>({ok:false,error:'Посетитель на пути'}));
 assert.equal(adapter.cancelPreview('screens::1').ok,true);assert.equal(ghost.parent,null);assert.equal(root.position.x,1);assert.equal(adapter.getState().previewCount,0);
 exhibits.setPlacementGuard(null);assert.equal(adapter.preview('screens::1',{x:8,z:5,y:7.2,yaw:.7,floorId:'main'}).ok,true);
 assert.equal(adapter.sync(snapshot(data,1,{'screens::1':{x:8,z:5,y:7.2,yaw:.7,floorId:'main'}})).ok,true);assert.equal(adapter.getState().previewCount,0);assert.equal(exhibits.getInstance(id).x,8);
});

test('floor and reset use the shared equipment pose and do not revive quantity-zero copies',async()=>{
 const {data,adapter,exhibits}=await setup();assert.equal(adapter.sync(snapshot(data,2)).ok,true);
 assert.equal(adapter.sync(snapshot(data,1,{'screens::1':{x:4,z:8,y:13.2,yaw:1.5,floorId:'upper'}})).ok,true);
 const id=adapter.records.get('screens::1').instanceId;assert.equal(exhibits.getInstance(id).floorY,13.2);const before=exhibits.getLayout().instances.filter(x=>x.managedEquipment);
 assert.equal(exhibits.resetLayout().ok,true);assert.deepEqual(exhibits.getLayout().instances.filter(x=>x.managedEquipment),before);
 assert.equal(adapter.getItems({regionId:'rgo',hallId:'05'}).length,1);const pose=adapter.getPose('screens::1');assert.equal(pose.instanceId,id);assert.ok(pose.target.y>13.2);
});

test('new catalogue equipment has real geometry and the same LED cabinet grid as calculations',()=>{
 for(const type of actual.catalog){const group=actual.groups.find(g=>g.typeId===type.id);if(!group)continue;const instance=getInstances({...actual,groups:[{...group,defaultQuantity:1}]},createDefaultState({...actual,groups:[{...group,defaultQuantity:1}]}))[0];const built=createPlannedEquipment(instance,actual,{mediaFactory});assert.ok(new THREE.Box3().setFromObject(built.root).getSize(new THREE.Vector3()).length()>0,type.id);assert.ok(built.parts[0].max.every((v,i)=>v>built.parts[0].min[i]));}
});
