/** Two actual SVG editors, one planner state and the real 3D equipment channel.
 * The DOM fixture supplies viewport geometry and iframe message delivery only.
 * It does not load a browser page or render WebGL.
 */
import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createEquipmentMap} from './equipment-map.js';
import {createEquipmentWalk} from './equipment-walk.js';
import {createEquipmentChannel,readEquipmentVariant} from './equipment-state.js';
import {getInstances} from './equipment-model.js';
import {createInstallationsWalkBridge} from '../tour/installations-walk-bridge.js';

let Window;
try {({Window}=await import('happy-dom'));}
catch(error) {
  if(!process.env.PARK_HAPPY_DOM_MODULE)throw error;
  ({Window}=await import(pathToFileURL(resolve(process.env.PARK_HAPPY_DOM_MODULE)).href));
}
const source=JSON.parse(await readFile(new URL('./equipment-data.json',import.meta.url),'utf8'));
const mainGroup={...source.groups.find(g=>g.id==='equipment-RGO-05-INT-01'),defaultQuantity:1,
  seedInstances:[{x:0,z:0,y:7.2,yaw:0,floorId:'main'}]};
const upperSource=source.groups.find(g=>g.regionId==='far-east'&&g.floorId==='upper');
assert.ok(upperSource);
const upperGroup={...upperSource,defaultQuantity:1,seedInstances:[{x:0,z:0,y:13.2,yaw:0,floorId:'upper'}]};
const data={...source,groups:[mainGroup,upperGroup],regions:source.regions.filter(r=>['rgo','far-east'].includes(r.id)),
  halls:source.halls.filter(h=>h.id===mainGroup.hallId)};
const mainId=mainGroup.id+'::1';
const url='https://fazafilms.ru/review/park-vpechatleniy/#installations';
const ring=[[-20,-20],[20,-20],[20,20],[-20,20]];
function geometryFixture(){
  return {zones:[
    {id:mainGroup.zoneId,regionId:'rgo',floorId:'main',title:'РГО',polygonsWithHoles:[[ring]],labelXZ:[0,0]},
    {id:upperGroup.zoneId,regionId:'far-east',floorId:'upper',title:'Дальний Восток',polygonsWithHoles:[[ring]],labelXZ:[0,0]},
  ],halls:[{id:mainGroup.hallId.replace('RGO-',''),regionId:'rgo',floorId:'main',name:'Полярная наука',polygonsWithHoles:[[ring]],labelXZ:[0,0]}],
  floors:['main','upper'].map(id=>({id,floorY:id==='main'?7.2:13.2,polygons:[[ring]],grid:{width:160,height:160,cellSize:.25,originXZ:[-20,-20],mask:new Uint8Array(160*160).fill(1)}})),
  exhibits:[],reservations:[],overhead:[],route:[],rgoWalls:[],supportObstacles:[],raw:{world:{}}};
}
function globals(win){for(const [key,value] of Object.entries({window:win,document:win.document,navigator:win.navigator,AbortController:win.AbortController}))Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
const bootstrap=new Window({url,settings:{disableIframePageLoading:true}});globals(bootstrap);
const {createEquipmentPlanner}=await import('./equipment-app.js');bootstrap.close();
const storage=()=>{const values=new Map(),writes=[];return {writes,getItem:key=>values.get(key)||null,setItem:(key,value)=>{values.set(key,String(value));writes.push({key,value});}};};
const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
const approx=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-6,`${actual} versus ${expected}`);
const physicalPose=position=>({...position,y:position.y??(position.floorId==='upper'?13.2:7.2)});
const fixtures=new Set();

async function fixture(){
  const win=new Window({url,settings:{disableIframePageLoading:true}});globals(win);win.BroadcastChannel=undefined;
  win.requestAnimationFrame=callback=>{queueMicrotask(()=>callback(0));return 1;};win.cancelAnimationFrame=()=>{};
  let fullscreen=null;
  Object.defineProperty(win.document,'fullscreenElement',{get:()=>fullscreen});
  win.HTMLElement.prototype.requestFullscreen=async function(){fullscreen=this;win.document.dispatchEvent(new win.Event('fullscreenchange'));};
  win.document.exitFullscreen=async()=>{fullscreen=null;win.document.dispatchEvent(new win.Event('fullscreenchange'));};
  win.document.body.innerHTML='<section id="installations" hidden><div id="split-fixture"></div></section>';
  const section=win.document.querySelector('section'),mount=win.document.getElementById('split-fixture');
  const child=new win.EventTarget();
  Object.assign(child,{location:new URL('https://fazafilms.ru/review/park-vpechatleniy/tour/?embedded=installations'),parent:win,document:{querySelectorAll:()=>[]},CustomEvent:win.CustomEvent,crypto:win.crypto});
  const messages=[],childMessages=[];
  child.postMessage=(message,origin)=>{messages.push(structuredClone(message));queueMicrotask(()=>child.dispatchEvent(new win.MessageEvent('message',{data:structuredClone(message),origin,source:win})));};
  win.postMessage=(message,origin)=>{childMessages.push(structuredClone(message));queueMicrotask(()=>win.dispatchEvent(new win.MessageEvent('message',{data:structuredClone(message),origin,source:child})));};
  const starts=[],walkState={active:false,zoneId:null,paused:true};
  const walk={getState:()=>({...walkState}),getZones:()=>[
    {id:'rgo-main',regionId:'rgo',level:'main',name:'РГО'},
    {id:'rgo-05',regionId:'rgo',hallId:'05',level:'main',name:'Полярная наука'},
    {id:'far-east-upper',regionId:'far-east',level:'upper',name:'Дальний Восток'},
    {id:'central-square-main',regionId:'central-square',level:'main',name:'Площадь'},
    {id:'central-upper',regionId:'central',level:'upper',name:'Центр'},
  ],start(id){starts.push(id);Object.assign(walkState,{active:true,zoneId:id});return {ok:true};},setPaused(value){walkState.paused=value;}};
  const bridge=createInstallationsWalkBridge({windowObject:child});
  const maps=new Map(),preview=new Map(),peerEvents=[],backing=storage(),peerStorage=storage();
  let walkUI,frame,closed=false;
  const geometry=geometryFixture();
  const planner=createEquipmentPlanner(mount,{data,storage:backing,locationObject:win.location,
    walkFactory:(host,options)=>{walkUI=createEquipmentWalk(host,options);frame=host.querySelector('iframe');Object.defineProperty(frame,'contentWindow',{configurable:true,value:child});return walkUI;},
    mapFactory:(host,callbacks)=>{
      const name=host.id==='ep-map'?'bottom':'top';
      const record={name,host,api:null,svg:null,width:name==='top'?450:800,height:520,reports:0};
      const api=createEquipmentMap(host,{...callbacks,geometry,onReport:report=>{record.reports++;assert.ok(record.reports<150,'Map reports must not recursively trigger updates.');callbacks.onReport?.(report);}});
      const svg=host.querySelector('svg');record.api=api;record.svg=svg;maps.set(name,record);
      svg.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,right:record.width,bottom:record.height,width:record.width,height:record.height});
      svg.getScreenCTM=()=>{const [x,y,w,h]=(svg.getAttribute('viewBox')||'-20 -20 40 40').split(' ').map(Number),s=Math.min(record.width/w,record.height/h),e=(record.width-w*s)/2-x*s,f=(record.height-h*s)/2-y*s;return {a:s,b:0,c:0,d:s,e,f,inverse:()=>({a:1/s,b:0,c:0,d:1/s,e:-e/s,f:-f/s})};};
      svg.createSVGPoint=()=>({x:0,y:0,matrixTransform(m){return {x:m.a*this.x+m.e,y:m.d*this.y+m.f};}});svg.setPointerCapture=()=>{};svg.releasePointerCapture=()=>{};
      return api;
    },
  });
  const peer=createEquipmentChannel({data,variant:readEquipmentVariant(data,{storage:peerStorage}).variant,storage:peerStorage,windowObject:child,
    onVariant:value=>peerEvents.push({kind:'variant',value}),onPreview:(id,position)=>{preview.set(id,position);peerEvents.push({kind:'preview',id,position});},
    onPreviewEnd:(id,meta)=>{if(id)preview.delete(id);else preview.clear();peerEvents.push({kind:'preview-end',id,...meta});}});
  const f={win,mount,section,planner,maps,peer,peerEvents,preview,backing,peerStorage,bridge,starts,walkState,messages,childMessages,frame,walkUI,
    query:selector=>mount.querySelector(selector),
    position:(id=mainId)=>getInstances(data,planner.getState()).find(i=>i.id===id)?.position,
    peerPosition:(id=mainId)=>getInstances(data,peer.getVariant().state).find(i=>i.id===id)?.position,
    mapPosition:(name,id=mainId)=>maps.get(name).api.getPlacementReport().all.placed.find(i=>i.id===id)?.position,
    node:(name,id=mainId)=>maps.get(name).host.querySelector(`[data-instance-id="${id}"]`),
    handle:name=>maps.get(name).host.querySelector('.epm-rotate-handle'),
    screen(name,[x,y]){const m=maps.get(name).svg.getScreenCTM();return [m.a*x+m.e,m.d*y+m.f];},
    world(name,x,z){return this.screen(name,[z,-x]);},
    pointer(name,type,target,x,z,extra={}){const [clientX,clientY]=this.world(name,x,z);target.dispatchEvent(new win.PointerEvent(type,{bubbles:true,cancelable:true,pointerId:1,button:0,clientX,clientY,...extra}));},
    show(value){section.hidden=!value;win.dispatchEvent(new win.CustomEvent('park-folder-change',{detail:{folder:value?'installations':'tour'}}));},
    async split(value=true){walkUI.setSplitVisible(value);await settle();if(value)await maps.get('top').api.ready;await settle();},
    close(){if(closed)return;closed=true;planner.destroy();peer.dispose();bridge.dispose();win.close();fixtures.delete(f);},
  };
  fixtures.add(f);await maps.get('bottom').api.ready;f.show(true);bridge.attach(walk);peer.request();await settle();
  return f;
}
afterEach(()=>{for(const f of [...fixtures])f.close();});

function beginDrag(f,name,dx,dz){const p=f.position();f.pointer(name,'pointerdown',f.node(name),p.x,p.z);f.pointer(name,'pointermove',f.maps.get(name).svg,p.x+dx,p.z+dz);}
function finishDrag(f,name,x,z){f.pointer(name,'pointerup',f.maps.get(name).svg,x,z);}
function beginRotation(f,name,yaw){
  const handle=f.handle(name);assert.ok(handle);
  const match=/translate\(([-\d.e]+) ([-\d.e]+)\)/.exec(handle.getAttribute('transform')),start=[Number(match[1]),Number(match[2])],p=f.position(),centre=[p.z,-p.x],r=Math.hypot(start[0]-centre[0],start[1]-centre[1]);
  for(const [type,target,point] of [['pointerdown',handle,start],['pointermove',f.maps.get(name).svg,[centre[0]+r*Math.cos(yaw),centre[1]-r*Math.sin(yaw)]]]){
    const [clientX,clientY]=f.screen(name,point);target.dispatchEvent(new f.win.PointerEvent(type,{bubbles:true,cancelable:true,pointerId:1,button:0,clientX,clientY}));
  }
}

test('split creates a second editable SVG once and keeps one iframe and the original planner layout',async()=>{
  const f=await fixture(),original=f.query('#ep-panel-plan'),frame=f.frame;
  assert.equal(f.maps.size,1);await f.split();assert.equal(f.maps.size,2);
  const top=f.maps.get('top');assert.ok(top.host.closest('.ep-walk-stage.is-split'));
  assert.deepEqual(f.mapPosition('top'),f.mapPosition('bottom'));
  assert.equal(f.query('#ep-panel-plan'),original);assert.equal(f.query('#ep-walk iframe'),frame);
  await f.split(false);await f.split(true);
  assert.equal(f.maps.get('top'),top);assert.equal(f.query('#ep-walk iframe'),frame);
  assert.equal(f.maps.size,2);
});

test('first-click drag in the upper SVG previews in 3D and commits one shared move with undo/redo',async()=>{
  const f=await fixture();await f.split();const before=f.planner.getState(),writes=f.backing.writes.length;
  beginDrag(f,'top',2,1);await settle();
  assert.ok(f.handle('top'));assert.equal(f.preview.get(mainId)?.x,2);assert.equal(f.preview.get(mainId)?.z,1);
  assert.deepEqual(f.planner.getState(),before);assert.equal(f.backing.writes.length,writes);
  finishDrag(f,'top',2,1);await settle();
  assert.equal(f.preview.size,0);
  for(const p of [f.position(),f.peerPosition(),f.mapPosition('bottom'),f.mapPosition('top')]){assert.equal(p.x,2);assert.equal(p.z,1);}
  f.query('[data-walk-undo]').click();await settle();
  assert.equal(f.position().x,0);assert.equal(f.mapPosition('bottom').x,0);assert.equal(f.peerPosition().x,0);
  assert.equal(f.query('[data-action="undo"]').disabled,true,'One completed pointer gesture is one undo entry.');
  f.query('[data-walk-redo]').click();await settle();assert.equal(f.mapPosition('top').x,2);
});

test('rotation, invalid placement and a lower-plan edit keep both maps and the 3D peer consistent',async()=>{
  const f=await fixture();await f.split();
  f.pointer('top','pointerdown',f.node('top'),0,0);finishDrag(f,'top',0,0);
  beginRotation(f,'top',Math.PI/2);await settle();approx(f.preview.get(mainId).yaw,Math.PI/2);
  finishDrag(f,'top',0,0);await settle();
  for(const p of [f.position(),f.peerPosition(),f.mapPosition('bottom'),f.mapPosition('top')])approx(p.yaw,Math.PI/2);
  const saved=f.planner.getState(),writes=f.backing.writes.length;
  beginDrag(f,'top',35,0);await settle();assert.equal(f.preview.size,0);assert.ok(f.node('top').classList.contains('is-invalid'));
  finishDrag(f,'top',35,0);await settle();assert.deepEqual(f.planner.getState(),saved);assert.equal(f.backing.writes.length,writes);
  beginDrag(f,'bottom',3,1);await settle();finishDrag(f,'bottom',3,1);await settle();
  assert.equal(f.mapPosition('top').x,3);assert.equal(f.peerPosition().z,1);approx(f.position().yaw,Math.PI/2);
});

test('closing split or hiding the section cancels an unfinished preview without committing or losing the camera',async()=>{
  const f=await fixture();await f.split();const before=f.planner.getState(),starts=f.starts.length;
  beginDrag(f,'top',2,0);await settle();assert.ok(f.preview.has(mainId));await f.split(false);
  assert.equal(f.preview.size,0);assert.deepEqual(f.planner.getState(),before);
  await f.split(true);beginDrag(f,'top',1,2);await settle();f.show(false);await settle();
  assert.equal(f.preview.size,0);assert.deepEqual(f.planner.getState(),before);assert.equal(f.walkState.paused,true);
  f.show(true);await settle();assert.equal(f.starts.length,starts);assert.equal(f.walkState.paused,false);
  assert.equal(f.query('[data-action="undo"]').disabled,true);
});

test('choosing a raw hall on the upper SVG cancels its gesture and resolves the same hall in both maps and walking',async()=>{
  const f=await fixture();await f.split();const before=f.planner.getState();
  beginDrag(f,'top',2,0);await settle();assert.ok(f.preview.has(mainId));
  const hall=f.maps.get('top').host.querySelector('.epm-hall');assert.ok(hall);
  hall.dispatchEvent(new f.win.MouseEvent('dblclick',{bubbles:true}));await settle();
  assert.equal(f.preview.size,0);assert.deepEqual(f.planner.getState(),before);
  assert.equal(f.planner.getScope().hallId,'RGO-05');assert.equal(f.query('#ep-hall').value,'RGO-05');
  assert.equal(f.maps.get('bottom').api.getPlacementReport().scope.hallId,'RGO-05');
  assert.equal(f.maps.get('top').api.getPlacementReport().scope.hallId,'RGO-05');assert.equal(f.walkState.zoneId,'rgo-05');
  finishDrag(f,'top',2,0);await settle();assert.deepEqual(f.planner.getState(),before);
  assert.equal(f.query('[data-action="undo"]').disabled,true);
});

test('fullscreen resizes the same SVG and keeps rotation hit targets at their screen size',async()=>{
  const f=await fixture();await f.split();f.pointer('top','pointerdown',f.node('top'),0,0);finishDrag(f,'top',0,0);
  const top=f.maps.get('top'),svg=top.svg,frame=f.frame;
  top.width=1000;top.height=800;f.query('[data-walk-fullscreen]').click();await settle();
  assert.equal(f.win.document.fullscreenElement,f.query('#ep-walk'));assert.equal(f.maps.get('top').svg,svg);assert.equal(f.frame,frame);
  const scale=Number(/scale\(([-\d.e]+)\)/.exec(f.handle('top').getAttribute('transform'))[1]);
  approx(scale*svg.getScreenCTM().a,1);
  beginRotation(f,'top',Math.PI/3);finishDrag(f,'top',0,0);await settle();approx(f.mapPosition('bottom').yaw,Math.PI/3);
});

test('new equipment has one automatic position and the upper map stays on the walkthrough floor after quantity edits',async()=>{
  const f=await fixture();await f.split();
  f.planner.setQuantity(mainGroup.id,2);await settle();const added=mainGroup.id+'::2';
  assert.ok(f.position(added));assert.deepEqual(physicalPose(f.mapPosition('top',added)),physicalPose(f.mapPosition('bottom',added)));assert.deepEqual(physicalPose(f.peerPosition(added)),physicalPose(f.position(added)));
  assert.ok([...f.maps.values()].every(m=>m.reports<25),'Auto placement must settle without mutually recursive map reports.');
  f.planner.selectScope({regionId:null,hallId:null,floorId:'main'});await settle();const starts=f.starts.length;
  f.planner.setQuantity(upperGroup.id,2);await settle();
  assert.equal(f.maps.get('bottom').api.getPlacementReport().scope.floorId,'upper');
  assert.equal(f.maps.get('top').api.getPlacementReport().scope.floorId,'main');
  assert.equal(f.starts.length,starts);
  const floor=f.query('#ep-floor');floor.value='upper';floor.dispatchEvent(new f.win.Event('change',{bubbles:true}));await settle();
  assert.equal(f.maps.get('top').api.getPlacementReport().scope.floorId,'upper');assert.equal(f.walkState.zoneId,'central-upper');
});

function cameraView({x=-4,z=-3,fov=Math.PI/3,directionXZ=[0,1]}={}){
  const heading=Math.atan2(directionXZ[1],directionXZ[0]),distance=8;
  return {x,y:8.85,z,floorId:'main',directionXZ,horizontalFovRad:fov,maxDistanceM:24,
    visiblePolygonXZ:[[x,z],...[heading-fov/2,heading,heading+fov/2].map(angle=>[x+Math.cos(angle)*distance,z+Math.sin(angle)*distance])]};
}
function markerPosition(f){
  const marker=f.maps.get('top').host.querySelector('.epm-walk-marker');assert.ok(marker,'The camera update reaches the real SVG marker.');
  const match=/translate\(([-\d.e]+) ([-\d.e]+)\)/.exec(marker.getAttribute('transform'));assert.ok(match);
  return {x:-Number(match[2]),z:Number(match[1])};
}
const viewPacket=f=>f.childMessages.filter(message=>message.kind==='view'&&message.view).at(-1);

test('actual child camera messages update the marker during an active equipment drag without cancelling it',async()=>{
  const f=await fixture();await f.split();
  assert.equal(f.bridge.sendView(cameraView()),true);await settle();
  assert.deepEqual(markerPosition(f),{x:-4,z:-3});
  beginDrag(f,'top',2,1);await settle();
  const grabbed=f.node('top'),handle=f.handle('top'),saved=f.planner.getState(),writes=f.backing.writes.length,peerWrites=f.peerStorage.writes.length;
  assert.equal(f.bridge.sendView(cameraView({x:-1,z:4,directionXZ:[1,0]})),true);await settle();
  assert.deepEqual(markerPosition(f),{x:-1,z:4});
  assert.equal(f.node('top'),grabbed,'A view message must not rebuild the grabbed equipment node.');
  assert.equal(f.handle('top'),handle,'Rotation controls retain the current pointer gesture.');
  assert.ok(f.maps.get('top').host.querySelector('.equipment-map').classList.contains('is-dragging'));
  assert.equal(f.preview.get(mainId)?.x,2);assert.equal(f.preview.get(mainId)?.z,1);
  assert.deepEqual(f.planner.getState(),saved);assert.equal(f.backing.writes.length,writes);assert.equal(f.peerStorage.writes.length,peerWrites);
  assert.equal(f.query('[data-action="undo"]').disabled,true);
  assert.equal(f.maps.get('top').host.querySelector('.epm-walk-view').getAttribute('pointer-events'),'none');
  finishDrag(f,'top',2,1);await settle();
  assert.equal(f.position().x,2);assert.equal(f.mapPosition('bottom').z,1);assert.equal(f.peerPosition().x,2);
  f.query('[data-walk-undo]').click();await settle();assert.equal(f.position().x,0);assert.equal(f.query('[data-action="undo"]').disabled,true);
});

test('a resized camera field of view changes only the live sector and preserves the iframe and equipment history',async()=>{
  const f=await fixture();await f.split();f.bridge.sendView(cameraView());await settle();
  const top=f.maps.get('top'),saved=f.planner.getState(),writes=f.backing.writes.length,peerWrites=f.peerStorage.writes.length,frame=f.frame,src=frame.src,starts=f.starts.length;
  const sector=top.host.querySelector('.epm-walk-sector'),path=sector.getAttribute('d'),marker=markerPosition(f),zoneMessages=f.messages.filter(m=>m.kind==='zone').length;
  // This models the new camera snapshot after an aspect change; it does not render WebGL.
  top.width=760;top.height=420;f.win.dispatchEvent(new f.win.Event('resize'));await settle();
  assert.equal(f.bridge.sendView(cameraView({fov:Math.PI*.64})),true);await settle();
  assert.equal(top.host.querySelector('.epm-walk-sector'),sector);assert.notEqual(sector.getAttribute('d'),path);
  assert.deepEqual(markerPosition(f),marker);assert.deepEqual(f.planner.getState(),saved);
  assert.equal(f.backing.writes.length,writes);assert.equal(f.peerStorage.writes.length,peerWrites);
  assert.equal(f.query('[data-action="undo"]').disabled,true);assert.equal(f.query('[data-action="redo"]').disabled,true);
  assert.equal(f.query('#ep-walk iframe'),frame);assert.equal(frame.src,src);assert.equal(f.starts.length,starts);
  assert.equal(f.messages.filter(m=>m.kind==='zone').length,zoneMessages);
});

test('old-scope camera packets cannot erase or block the new marker and hiding clears queued camera updates',async()=>{
  const f=await fixture();await f.split();f.bridge.sendView(cameraView());await settle();const old=viewPacket(f);
  f.planner.selectScope({regionId:'rgo',hallId:'RGO-05'});await settle();
  f.bridge.sendView(cameraView({x:5,z:2}));await settle();const current=viewPacket(f);
  assert.notEqual(old.scopeSequence,current.scopeSequence);assert.deepEqual(markerPosition(f),{x:5,z:2});
  // A delayed producer still carrying the former scope must not consume the new scope's sequence.
  f.win.postMessage({...old,sequence:current.sequence+1,view:cameraView({x:18,z:18})},f.win.location.origin);await settle();
  assert.deepEqual(markerPosition(f),{x:5,z:2});
  f.bridge.sendView(cameraView({x:6,z:3}));await settle();assert.deepEqual(markerPosition(f),{x:6,z:3});
  const latest=viewPacket(f);
  f.win.postMessage({...old,sequence:latest.sequence+1,view:null},f.win.location.origin);await settle();
  assert.equal(f.maps.get('top').host.querySelector('.epm-walk-view').getAttribute('display'),'inline');
  assert.deepEqual(markerPosition(f),{x:6,z:3});
  const before=f.planner.getState(),writes=f.backing.writes.length,frame=f.frame,starts=f.starts.length;
  f.bridge.sendView(cameraView({x:7,z:4}));f.show(false);await settle();
  assert.equal(f.maps.get('top').host.querySelector('.epm-walk-view').getAttribute('display'),'none');
  assert.equal(f.bridge.sendView(cameraView()),false,'The child does not publish camera frames while hidden.');
  f.show(true);await settle();f.bridge.sendView(cameraView({x:8,z:5}));await settle();
  assert.deepEqual(markerPosition(f),{x:8,z:5});assert.equal(f.maps.get('top').host.querySelector('.epm-walk-view').getAttribute('display'),'inline');
  assert.deepEqual(f.planner.getState(),before);assert.equal(f.backing.writes.length,writes);assert.equal(f.frame,frame);assert.equal(f.starts.length,starts);
});
