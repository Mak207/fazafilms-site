import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createDefaultState,setQuantity,getInstances} from './equipment-model.js';
import {prepareEquipmentGeometry} from './equipment-map.js';
import {equipmentVariant,readEquipmentVariant,createEquipmentChannel,encodeEquipmentVariant,decodeEquipmentVariant,consumeEquipmentShare,EQUIPMENT_STORAGE_KEY} from './equipment-state.js';
import {createEquipmentSceneLink} from './equipment-link.js';

const read=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const data=await read('./equipment-data.json');
const geometry=prepareEquipmentGeometry({zones:await read('../tour/assets/zones/source-zones.json'),colors:await read('../tour/assets/zones/floor-colors.json'),world:await read('../tour/crowd/data/park-world.json'),floorShapes:await read('./engineering/placement-frontal.json'),placements:await read('../tour/assets/zones/placements-final.json'),rgo:await read('../tour/assets/zones/rgo-layout.json'),manifest:await read('../tour/assets/exhibits/manifest.json')});
const baseline=createDefaultState(data),groupId='equipment-RGO-05-INT-01';
const disposables=[];
class FakeChannel {
  static channels=new Set();
  constructor(name){this.name=name;this.closed=false;FakeChannel.channels.add(this);}
  postMessage(value){for(const channel of FakeChannel.channels)if(channel!==this&&!channel.closed&&channel.name===this.name)queueMicrotask(()=>{if(!channel.closed)channel.onmessage?.({data:structuredClone(value)});});}
  close(){this.closed=true;FakeChannel.channels.delete(this);}
}
class FakeWindow extends EventTarget {
  constructor(storage){super();this.location=new URL('https://fazafilms.ru/review/park-vpechatleniy/');this.document={querySelectorAll:()=>[]};this.parent=this;this.localStorage=storage;this.BroadcastChannel=FakeChannel;this.crypto={randomUUID:()=>crypto.randomUUID()};this.CustomEvent=class extends Event{constructor(type,options){super(type);this.detail=options.detail;}};}
}
const storage=()=>{const map=new Map();return {getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,String(value))};};
const settle=async()=>{await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));};
const keep=value=>{disposables.push(value);return value;};
afterEach(()=>{disposables.splice(0).forEach(d=>d.dispose());assert.equal(FakeChannel.channels.size,0);});
function channel(sharedStore,callbacks={}){const win=new FakeWindow(sharedStore);return keep(createEquipmentChannel({data,variant:readEquipmentVariant(data,{storage:sharedStore}).variant,storage:sharedStore,windowObject:win,...callbacks}));}

test('Russian share links preserve compact quantities, exact position and yaw',()=>{
  const state=setQuantity(data,baseline,groupId,4);state.positions[groupId+'::4']={x:4.25,z:-28.5,yaw:-1.234,y:7.2,floorId:'main'};
  const value=equipmentVariant(data,state,{scope:{regionId:'rgo',hallId:'RGO-05'}});
  assert.deepEqual(decodeEquipmentVariant(encodeEquipmentVariant(value)),value);
  const saved=readEquipmentVariant(data,{locationObject:{href:'https://fazafilms.ru/?equipmentPlan='+encodeEquipmentVariant(value)}});
  assert.equal(saved.shared,true);assert.equal(saved.variant.state.positions[groupId+'::4'].yaw,-1.234);
  assert.equal(getInstances(data,saved.variant.state).length,100);
});

test('committed count and rotation travel in both directions without feedback or defaults overwriting',async()=>{
  const store=storage(),receivedA=[],receivedB=[];
  const a=channel(store,{onVariant:v=>receivedA.push(v)}),b=channel(store,{onVariant:v=>receivedB.push(v)});
  const changed=setQuantity(data,baseline,groupId,4);changed.positions[groupId+'::1']={x:4,z:-30,yaw:.7,y:7.2,floorId:'main'};
  a.publish(equipmentVariant(data,changed));await settle();
  assert.equal(receivedB.length,1);assert.equal(receivedA.length,0);assert.equal(receivedB[0].state.positions[groupId+'::1'].yaw,.7);
  const from3D=structuredClone(b.getVariant());from3D.state.positions[groupId+'::1'].yaw=-.4;b.publish(from3D);await settle();
  assert.equal(receivedA.length,1);assert.equal(a.getVariant().state.positions[groupId+'::1'].yaw,-.4);
  const newcomer=channel(store);newcomer.request();await settle();
  assert.equal(a.getVariant().state.quantities[groupId],4);assert.equal(newcomer.getVariant().state.positions[groupId+'::1'].yaw,-.4);
});

test('preview is transient and cancellation never changes storage or committed state',async()=>{
  const store=storage(),previews=[],ends=[];const a=channel(store),b=channel(store,{onPreview:(...args)=>previews.push(args),onPreviewEnd:(...args)=>ends.push(args)});
  a.publish(equipmentVariant(data,baseline),{force:true});await settle();const before=store.getItem(EQUIPMENT_STORAGE_KEY),committed=JSON.stringify(b.getVariant());
  a.preview(groupId+'::1',{x:4,z:-30,yaw:.8,y:7.2,floorId:'main'});await settle();
  assert.equal(previews.length,1);assert.equal(previews[0][1].yaw,.8);assert.equal(store.getItem(EQUIPMENT_STORAGE_KEY),before);assert.equal(JSON.stringify(b.getVariant()),committed);
  a.endPreview(groupId+'::1');await settle();assert.equal(ends.at(-1)[0],groupId+'::1');assert.equal(store.getItem(EQUIPMENT_STORAGE_KEY),before);
  a.preview('unknown',{x:1,z:1,yaw:0});a.preview(groupId+'::1',{x:NaN,z:1,yaw:0});await settle();assert.equal(previews.length,1);
});

test('storage events restore the same variant when BroadcastChannel is unavailable',async()=>{
  const store=storage(),seen=[],win=new FakeWindow(store);win.BroadcastChannel=undefined;
  const bus=keep(createEquipmentChannel({data,variant:equipmentVariant(data,baseline),storage:store,windowObject:win,onVariant:v=>seen.push(v)}));
  const value=equipmentVariant(data,setQuantity(data,baseline,groupId,4));value._sync={revision:Date.now(),sender:'another-tab'};
  const event=new Event('storage');Object.assign(event,{key:EQUIPMENT_STORAGE_KEY,newValue:JSON.stringify(value)});win.dispatchEvent(event);
  assert.equal(seen.length,1);assert.equal(bus.getVariant().state.quantities[groupId],4);
  const older=new Event('storage');Object.assign(older,{key:EQUIPMENT_STORAGE_KEY,newValue:JSON.stringify({...equipmentVariant(data,baseline),_sync:{revision:1,sender:'old'}})});win.dispatchEvent(older);assert.equal(seen.length,1);
});

test('the scene link produces every initial instance and a new copy at the same plan coordinates',async()=>{
  const store=storage(),snapshots=[];const scene=keep(createEquipmentSceneLink({data,geometry,storage:store,windowObject:new FakeWindow(store),onSnapshot:s=>{snapshots.push(s);return {ok:true};}}));
  const plan=channel(store);
  assert.equal(scene.getSnapshot().report.placedCount,99);assert.equal(scene.getSnapshot().report.unplacedCount,0);
  plan.publish(equipmentVariant(data,setQuantity(data,baseline,groupId,4)));await settle();
  const state=scene.getSnapshot();assert.equal(state.report.placedCount,100);
  const added=state.report.placed.find(i=>i.id===groupId+'::4');assert.ok(added);assert.equal(added.hallId,'RGO-05');
  assert.deepEqual(state.state.positions[added.id],{...added.position,y:7.2});
  assert.equal(scene.validateMove(added.id,{...added.position,x:500}).ok,false);
  let position=null;for(const delta of [.02,-.02,.05,-.05]){const candidate={...added.position,yaw:added.position.yaw+delta};if(scene.validateMove(added.id,candidate).ok){position=candidate;break;}}
  assert.ok(position,'a small valid rotation exists');assert.equal(scene.move(added.id,position).ok,true);await settle();
  assert.equal(plan.getVariant().state.positions[added.id].yaw,position.yaw);
});

test('a rejected 3D placement rolls the variant back and explains the rejection',async()=>{
  const store=storage(),messages=[];let reject=false;
  const scene=keep(createEquipmentSceneLink({data,geometry,storage:store,windowObject:new FakeWindow(store),onSnapshot:()=>reject?{ok:false,error:'Нужно оставить проход.'}:{ok:true}}));
  const plan=channel(store,{onStatus:message=>messages.push(message)});await settle();reject=true;
  plan.publish(equipmentVariant(data,setQuantity(data,baseline,groupId,4)));await settle();
  assert.equal(scene.getSnapshot().report.placedCount,99);assert.equal(getInstances(data,plan.getVariant().state).length,99);assert.deepEqual(messages,['Нужно оставить проход.']);
});

test('an explicit shared link wins over an older saved variant and preserves all untouched equipment',()=>{
  const store=storage(),old=equipmentVariant(data,setQuantity(data,baseline,groupId,1));store.setItem(EQUIPMENT_STORAGE_KEY,JSON.stringify(old));
  const shared=equipmentVariant(data,setQuantity(data,baseline,groupId,4));
  const restored=readEquipmentVariant(data,{storage:store,locationObject:{href:'https://fazafilms.ru/?equipmentPlan='+encodeEquipmentVariant(shared)}});
  assert.equal(restored.variant.state.quantities[groupId],4);assert.equal(getInstances(data,restored.variant.state).length,100);
});

test('consumed shared links cannot reset later edits when reloading or switching 3D quality',()=>{
  const store=storage(),win=new FakeWindow(store),old=equipmentVariant(data,setQuantity(data,baseline,groupId,4));
  win.location=new URL('https://fazafilms.ru/tour/?quality=fast&equipmentPlan='+encodeEquipmentVariant(old));
  win.history={state:{page:'tour'},replaceState:(state,title,url)=>{assert.deepEqual(state,{page:'tour'});win.location=new URL(url);}};
  assert.equal(consumeEquipmentShare(win),true);assert.equal(win.location.searchParams.has('equipmentPlan'),false);
  const edited=equipmentVariant(data,setQuantity(data,baseline,groupId,5));store.setItem(EQUIPMENT_STORAGE_KEY,JSON.stringify(edited));
  win.location.searchParams.set('quality','high');
  assert.equal(readEquipmentVariant(data,{storage:store,locationObject:win.location}).variant.state.quantities[groupId],5);
});

test('a delayed preview cannot restart a gesture after its end arrived on another transport',()=>{
  const store=storage(),win=new FakeWindow(store),previews=[],ends=[];
  keep(createEquipmentChannel({data,variant:equipmentVariant(data,baseline),storage:store,windowObject:win,onPreview:(...a)=>previews.push(a),onPreviewEnd:(...a)=>ends.push(a)}));
  const prefix={protocol:'faza.park.equipment-message.v1',sender:'other-window'};
  win.dispatchEvent(new win.CustomEvent('faza.park.equipment-plan.live.v1',{detail:{...prefix,sequence:11,kind:'preview-end',id:groupId+'::1'}}));
  win.dispatchEvent(new win.CustomEvent('faza.park.equipment-plan.live.v1',{detail:{...prefix,sequence:10,kind:'preview',id:groupId+'::1',position:{x:4,z:-30,yaw:1}}}));
  assert.equal(ends.length,1);assert.equal(previews.length,0);
});

test('opening a 3D reader without storage cannot overwrite edits in the existing plan',async()=>{
  const unavailable={getItem:()=>null,setItem(){throw Error('Storage unavailable');}};
  const plan=channel(unavailable);plan.publish(equipmentVariant(data,setQuantity(data,baseline,groupId,4)));await settle();
  const scene=keep(createEquipmentSceneLink({data,geometry,storage:unavailable,windowObject:new FakeWindow(unavailable)}));
  await settle();
  assert.equal(plan.getVariant().state.quantities[groupId],4);assert.equal(scene.getSnapshot().report.placedCount,100);
});
