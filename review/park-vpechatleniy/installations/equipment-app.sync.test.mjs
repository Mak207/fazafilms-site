/** Integration of the actual planner, SVG pointer editing and same-origin equipment channel. */
import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createEquipmentPlanner} from './equipment-app.js';
import {createEquipmentMap} from './equipment-map.js';
import {getInstances} from './equipment-model.js';
import {createEquipmentChannel,readEquipmentVariant,decodeEquipmentVariant,EQUIPMENT_STORAGE_KEY} from './equipment-state.js';

async function loadDOM(){try{return await import('happy-dom');}catch(error){const path=process.env.PARK_HAPPY_DOM_MODULE;if(!path)throw new Error('Install happy-dom or set PARK_HAPPY_DOM_MODULE.',{cause:error});return import(path.startsWith('file:')?path:pathToFileURL(resolve(path)).href);}}
const {Window}=await loadDOM();
const source=JSON.parse(await readFile(new URL('./equipment-data.json',import.meta.url),'utf8'));
const group={...source.groups.find(g=>g.id==='equipment-RGO-05-INT-01'),defaultQuantity:1,seedInstances:[{x:0,z:0,y:7.2,yaw:0,floorId:'main'}]};
const data={...source,groups:[group],regions:source.regions.filter(r=>r.id==='rgo'),halls:source.halls.filter(h=>h.id===group.hallId)};
const id=`${group.id}::1`;
const baseURL='https://fazafilms.ru/review/park-vpechatleniy/#installations';
const rectangle=(a,b,c,d)=>[[a,b],[c,b],[c,d],[a,d]];
function geometryFixture(){
  const ring=rectangle(-20,-20,20,20);
  return {zones:[{id:group.zoneId,regionId:'rgo',floorId:'main',title:'Аллея РГО',polygonsWithHoles:[[ring]],labelXZ:[0,0]}],halls:[{id:group.hallId,regionId:'rgo',floorId:'main',name:'Полярная наука',color:'#ddeeff',polygonsWithHoles:[[ring]],labelXZ:[0,0]}],floors:[{id:'main',floorY:7.2,polygons:[[ring]],grid:{width:160,height:160,cellSize:.25,originXZ:[-20,-20],mask:new Uint8Array(160*160).fill(1)}}],exhibits:[],reservations:[],overhead:[],route:[],rgoWalls:[],supportObstacles:[],raw:{world:{}}};
}
function storageBacking(){
  const values=new Map(),writes=[];
  return {values,writes,client:name=>({getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,String(value));writes.push({name,key,value:String(value)});},removeItem:key=>values.delete(key)})};
}
function broadcastBus(){
  const clients=new Set();
  return class MockBroadcastChannel {
    constructor(name){this.name=name;this.closed=false;this.onmessage=null;clients.add(this);}
    postMessage(message){for(const peer of [...clients])if(peer!==this&&!peer.closed&&peer.name===this.name){const copy=structuredClone(message);queueMicrotask(()=>{if(!peer.closed)peer.onmessage?.({data:copy});});}}
    close(){this.closed=true;clients.delete(this);}
  };
}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const fixtures=new Set();
async function fixture({backing=storageBacking(),href=baseURL}={}){
  const win=new Window({url:href}),peerWin=new Window({url:'https://fazafilms.ru/review/park-vpechatleniy/tour/'}),BroadcastChannel=broadcastBus();
  win.BroadcastChannel=BroadcastChannel;peerWin.BroadcastChannel=BroadcastChannel;
  for(const [key,value] of Object.entries({window:win,document:win.document,navigator:win.navigator,AbortController:win.AbortController}))Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  const storage=backing.client('plan'),peerStorage=backing.client('3d'),peerEvents=[],previewPositions=new Map();
  const peer=createEquipmentChannel({data,variant:readEquipmentVariant(data,{storage:peerStorage,locationObject:peerWin.location}).variant,storage:peerStorage,windowObject:peerWin,
    onVariant:variant=>peerEvents.push({type:'variant',variant}),
    onPreview:(instance,position)=>{previewPositions.set(instance,position);peerEvents.push({type:'preview',id:instance,position});},
    onPreviewEnd:(instance,result)=>{if(instance)previewPositions.delete(instance);else previewPositions.clear();peerEvents.push({type:'preview-end',id:instance,...result});},
  });
  let clipboardText='';Object.defineProperty(win.navigator,'clipboard',{configurable:true,value:{writeText:async value=>{clipboardText=String(value);}}});
  const mount=win.document.createElement('div');win.document.body.append(mount);const geometry=geometryFixture();let map;
  const planner=createEquipmentPlanner(mount,{data,storage,locationObject:win.location,mapFactory:(node,callbacks)=>{
    map=createEquipmentMap(node,{...callbacks,geometry});const svg=node.querySelector('svg');
    svg.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,right:800,bottom:600,width:800,height:600});
    svg.getScreenCTM=()=>{const [x,y,w,h]=(svg.getAttribute('viewBox')||'-20 -20 40 40').split(' ').map(Number),s=Math.min(800/w,600/h),e=(800-w*s)/2-x*s,f=(600-h*s)/2-y*s;return {a:s,b:0,c:0,d:s,e,f,inverse:()=>({a:1/s,b:0,c:0,d:1/s,e:-e/s,f:-f/s})};};
    svg.createSVGPoint=()=>({x:0,y:0,matrixTransform(m){return{x:m.a*this.x+m.c*this.y+m.e,y:m.b*this.x+m.d*this.y+m.f};}});
    svg.setPointerCapture=()=>{};svg.releasePointerCapture=()=>{};return map;
  }});
  await map.ready;peer.request();await flush();const svg=mount.querySelector('svg');let closed=false;
  const f={win,peerWin,mount,svg,planner,map,peer,peerEvents,previewPositions,storage,backing,
    node:()=>mount.querySelector(`[data-instance-id="${id}"]`),handle:()=>mount.querySelector('.epm-rotate-handle'),
    position:()=>getInstances(data,planner.getState()).find(i=>i.id===id).position,
    peerPosition:()=>getInstances(data,peer.getVariant().state).find(i=>i.id===id).position,
    screen:([x,y])=>{const m=svg.getScreenCTM();return[x*m.a+m.e,y*m.d+m.f];},world:(x,z)=>f.screen([z,-x]),
    pointer(type,target,point,extra={}){const [clientX,clientY]=point;target.dispatchEvent(new win.PointerEvent(type,{bubbles:true,cancelable:true,button:0,pointerId:1,clientX,clientY,...extra}));},
    click(selector){const target=mount.querySelector(selector);assert.ok(target,selector);target.click();return target;},
    clipboard:()=>clipboardText,
    close(){if(closed)return;closed=true;planner.destroy();peer.dispose();win.close();peerWin.close();fixtures.delete(f);},
  };fixtures.add(f);return f;
}
afterEach(()=>{for(const f of [...fixtures])f.close();});
function beginRotation(f,yaw){
  if(!f.handle())f.node().dispatchEvent(new f.win.MouseEvent('click',{bubbles:true}));
  const handle=f.handle();assert.ok(handle);
  const match=/translate\(([-\d.e]+) ([-\d.e]+)\)/.exec(handle.getAttribute('transform')),start=[Number(match[1]),Number(match[2])],p=f.position(),centre=[p.z,-p.x],radius=Math.hypot(start[0]-centre[0],start[1]-centre[1]);
  f.pointer('pointerdown',handle,f.screen(start));
  f.pointer('pointermove',f.svg,f.screen([centre[0]+radius*Math.cos(yaw),centre[1]-radius*Math.sin(yaw)]));
}
const approx=(actual,expected,label='')=>assert.ok(Math.abs(actual-expected)<1e-6,`${label}: ${actual} versus ${expected}`);

test('real planner selection does not cancel first-click dragging and the 3D peer sees preview without persistence',async()=>{
  const f=await fixture(),before=f.planner.getState(),writes=f.backing.writes.length;
  assert.equal(f.handle(),null);
  f.pointer('pointerdown',f.node(),f.world(0,0));
  assert.ok(f.handle(),'onSelect → map.update must preserve the newly starting pointer gesture.');
  f.pointer('pointermove',f.svg,f.world(2,1));await flush();
  assert.equal(f.previewPositions.get(id).x,2);assert.equal(f.previewPositions.get(id).z,1);
  assert.deepEqual(f.planner.getState(),before);assert.equal(f.peerPosition().x,0);assert.equal(f.backing.writes.length,writes);
  f.pointer('pointermove',f.svg,f.world(3,1));await flush();
  assert.equal(f.previewPositions.get(id).x,3);assert.equal(f.backing.writes.length,writes);
  f.pointer('pointerup',f.svg,f.world(3,1));await flush();
  assert.equal(f.position().x,3);assert.equal(f.peerPosition().x,3);assert.equal(f.peerPosition().z,1);approx(f.peerPosition().yaw,0);
  assert.equal(f.previewPositions.size,0);assert.equal(JSON.parse(f.storage.getItem(EQUIPMENT_STORAGE_KEY)).state.positions[id].x,3);
  f.click('[data-action="undo"]');await flush();
  assert.equal(f.position().x,0);assert.equal(f.peerPosition().x,0);assert.equal(f.mount.querySelector('[data-action="undo"]').disabled,true,'One mouse gesture must create exactly one undo entry.');
  f.click('[data-action="redo"]');await flush();assert.equal(f.position().x,3);assert.equal(f.peerPosition().x,3);
});

test('repeated mouse rotations commit yaw once per gesture and restore the same transform from storage and a shared link',async()=>{
  const f=await fixture();
  f.pointer('pointerdown',f.node(),f.world(0,0));f.pointer('pointermove',f.svg,f.world(2,1));f.pointer('pointerup',f.svg,f.world(2,1));await flush();
  beginRotation(f,Math.PI/6);const writes=f.backing.writes.length;await flush();
  approx(f.previewPositions.get(id).yaw,Math.PI/6);approx(f.position().yaw,0);approx(f.peerPosition().yaw,0);assert.equal(f.backing.writes.length,writes);
  f.pointer('pointerup',f.svg,f.world(2,1));await flush();approx(f.peerPosition().yaw,Math.PI/6);
  beginRotation(f,Math.PI/2);await flush();approx(f.previewPositions.get(id).yaw,Math.PI/2);
  f.pointer('pointerup',f.svg,f.world(2,1));await flush();approx(f.position().yaw,Math.PI/2);approx(f.peerPosition().yaw,Math.PI/2);
  assert.equal(f.position().x,2);assert.equal(f.position().z,1);
  f.click('[data-action="undo"]');await flush();approx(f.position().yaw,Math.PI/6);approx(f.peerPosition().yaw,Math.PI/6);
  f.click('[data-action="redo"]');await flush();approx(f.position().yaw,Math.PI/2);approx(f.peerPosition().yaw,Math.PI/2);
  f.click('[data-action="share"]');await flush();const href=f.clipboard(),raw=decodeEquipmentVariant(new URL(href).searchParams.get('equipmentPlan'));
  assert.equal(raw.state.positions[id].x,2);assert.equal(raw.state.positions[id].z,1);approx(raw.state.positions[id].yaw,Math.PI/2);
  const backing=f.backing;f.close();
  const reloaded=await fixture({backing});assert.equal(reloaded.position().x,2);assert.equal(reloaded.peerPosition().z,1);approx(reloaded.position().yaw,Math.PI/2);approx(reloaded.peerPosition().yaw,Math.PI/2);reloaded.close();
  const shared=await fixture({href});assert.equal(shared.position().x,2);assert.equal(shared.peerPosition().z,1);approx(shared.position().yaw,Math.PI/2);approx(shared.peerPosition().yaw,Math.PI/2);
});

test('cancelling a valid preview clears it in the 3D peer without changing storage or undo history',async()=>{
  const f=await fixture(),before=f.planner.getState(),writes=f.backing.writes.length;
  beginRotation(f,Math.PI/3);await flush();approx(f.previewPositions.get(id).yaw,Math.PI/3);
  f.svg.dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await flush();
  assert.equal(f.previewPositions.size,0);assert.deepEqual(f.planner.getState(),before);approx(f.peerPosition().yaw,0);assert.equal(f.backing.writes.length,writes);
  assert.equal(f.mount.querySelector('[data-action="undo"]').disabled,true);
});
