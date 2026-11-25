/** Parent planner, real equipment scene link and embedded walk transport.
 * DOM navigation and WebGL are deliberately not used. The walk camera is a
 * controlled fixture; equipment placement uses the project data and solver.
 */
import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import {createEquipmentWalk, INSTALLATIONS_WALK_PROTOCOL} from './equipment-walk.js';
import {createEquipmentSceneLink} from './equipment-link.js';
import {prepareEquipmentGeometry} from './equipment-map.js';
import {createInstallationsWalkBridge} from '../tour/installations-walk-bridge.js';

let Window;
try {({Window}=await import('happy-dom'));}
catch(error) {
  if(!process.env.PARK_HAPPY_DOM_MODULE)throw error;
  ({Window}=await import(pathToFileURL(resolve(process.env.PARK_HAPPY_DOM_MODULE)).href));
}
const read=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const [data,zones,colors,world,floorShapes,placements,rgo,manifest]=await Promise.all([
  read('./equipment-data.json'),read('../tour/assets/zones/source-zones.json'),
  read('../tour/assets/zones/floor-colors.json'),read('../tour/crowd/data/park-world.json'),
  read('./engineering/placement-frontal.json'),read('../tour/assets/zones/placements-final.json'),
  read('../tour/assets/zones/rgo-layout.json'),read('../tour/assets/exhibits/manifest.json'),
]);
const geometry=prepareEquipmentGeometry({zones,colors,world,floorShapes,placements,rgo,manifest});
const walkZones=[...zones.zones.map(z=>({id:z.id,name:z.title,level:z.floorId,regionId:z.regionId})),
  ...colors.rgo.halls.map(h=>({id:'rgo-'+h.id,name:h.name,level:'main',regionId:'rgo',hallId:h.id}))];
const groupId='equipment-RGO-05-INT-01', addedId=groupId+'::4';
const url='https://fazafilms.ru/review/park-vpechatleniy/#installations';
function globals(win) {
  for(const [key,value] of Object.entries({window:win,document:win.document,navigator:win.navigator,AbortController:win.AbortController}))
    Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
}
const bootstrap=new Window({url,settings:{disableIframePageLoading:true}});globals(bootstrap);
const {createEquipmentPlanner}=await import('./equipment-app.js');bootstrap.close();
const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value))};};
const settle=async()=>{for(let i=0;i<24;i++)await Promise.resolve();};
const fixtures=new Set();

function fixture() {
  const win=new Window({url,settings:{disableIframePageLoading:true}});globals(win);
  win.BroadcastChannel=undefined;
  win.document.body.innerHTML='<section id="installations" hidden><div id="planner-fixture"></div></section>';
  const section=win.document.querySelector('section'),mount=win.document.getElementById('planner-fixture');
  const child=new win.EventTarget();
  Object.assign(child,{location:new URL('https://fazafilms.ru/review/park-vpechatleniy/tour/?embedded=installations'),
    parent:win,document:{querySelectorAll:()=>[]},CustomEvent:win.CustomEvent,crypto:win.crypto});
  const outbound=[],inbound=[];
  child.postMessage=(message,origin)=>{
    assert.equal(origin,win.location.origin);outbound.push(structuredClone(message));
    queueMicrotask(()=>child.dispatchEvent(new win.MessageEvent('message',{data:structuredClone(message),source:win,origin})));
  };
  win.postMessage=(message,origin)=>{
    assert.equal(origin,win.location.origin);inbound.push(structuredClone(message));
    queueMicrotask(()=>win.dispatchEvent(new win.MessageEvent('message',{data:structuredClone(message),source:child,origin})));
  };
  const camera={active:false,zoneId:null,position:{x:0,z:0},yaw:0,paused:true};
  const starts=[],pauses=[],snapshots=[];let frame,walkUI,scene=null,closed=false;
  const walk={getZones:()=>walkZones,getState:()=>structuredClone(camera),
    start(id,options){starts.push({id,options});Object.assign(camera,{active:true,zoneId:id,position:{x:1,z:2},yaw:0});return {ok:true};},
    setPaused(value){camera.paused=value;pauses.push(value);}};
  const bridge=createInstallationsWalkBridge({windowObject:child});
  const planner=createEquipmentPlanner(mount,{data,storage:storage(),locationObject:win.location,
    mapFactory:()=>({update(){},destroy(){}}),
    walkFactory:(host,options)=>{
      walkUI=createEquipmentWalk(host,options);frame=host.querySelector('iframe');
      Object.defineProperty(frame,'contentWindow',{configurable:true,value:child});return walkUI;
    },
  });
  const f={win,child,mount,section,planner,frame,bridge,walk,camera,starts,pauses,snapshots,outbound,inbound,
    show(value){section.hidden=!value;win.dispatchEvent(new win.CustomEvent('park-folder-change',{detail:{folder:value?'installations':'tour'}}));},
    loadScene(){scene=createEquipmentSceneLink({data,geometry,storage:storage(),windowObject:child,onSnapshot:snapshot=>{snapshots.push(snapshot);return {ok:true};}});return scene;},
    scene:()=>scene,
    ready(){bridge.attach(walk);},
    query:selector=>mount.querySelector(selector),
    close(){if(closed)return;closed=true;planner.destroy();scene?.dispose();bridge.dispose();win.close();fixtures.delete(f);},
  };
  fixtures.add(f);return f;
}
afterEach(()=>{for(const f of [...fixtures])f.close();});
const zoneMessages=f=>f.outbound.filter(m=>m.protocol===INSTALLATIONS_WALK_PROTOCOL&&m.kind==='zone');

test('late embedded scene receives current quantities and the last selected zone through separate real channels',async()=>{
  const f=fixture();
  f.planner.selectScope({regionId:'rgo',hallId:'RGO-02'});
  f.planner.selectScope({regionId:'rgo',hallId:'RGO-05'});
  f.planner.setQuantity(groupId,4);
  f.show(true);await settle();
  f.loadScene();f.ready();await settle();
  assert.equal(f.scene().getSnapshot().report.placedCount,100);
  assert.ok(f.scene().getSnapshot().report.placed.some(item=>item.id===addedId));
  assert.deepEqual(f.starts.map(row=>row.id),['rgo-05']);
  assert.equal(f.starts[0].options.focus,false,'Parent controls retain keyboard focus.');
  assert.equal(f.camera.paused,false);
  assert.ok(f.inbound.some(m=>m.protocol==='faza.park.equipment-message.v1'&&m.kind==='request'));
  assert.ok(f.inbound.some(m=>m.protocol===INSTALLATIONS_WALK_PROTOCOL&&m.kind==='ready'));
  assert.equal(f.query('.equipment-planner').firstElementChild.id,'ep-walk');
});

test('quantity changes, undo and redo update actual scene placement without restarting the walk or rebuilding the page',async()=>{
  const f=fixture();f.planner.selectScope({regionId:'rgo',hallId:'RGO-05'});
  f.show(true);f.loadScene();f.ready();await settle();
  const frame=f.frame,source=frame.src,plan=f.query('#ep-panel-plan'),summary=f.query('#ep-summary');
  const startCount=f.starts.length,zoneCount=zoneMessages(f).length;
  f.camera.position={x:12.5,z:-9.25};f.camera.yaw=.73;
  f.planner.setQuantity(groupId,4);await settle();
  const added=f.scene().getSnapshot().report.placed.find(item=>item.id===addedId);
  assert.ok(added,'The added physical instance immediately reaches the 3D scene link.');
  assert.equal(added.hallId,'RGO-05');
  f.query('[data-action="undo"]').click();await settle();
  assert.equal(f.scene().getSnapshot().report.placed.some(item=>item.id===addedId),false);
  f.query('[data-action="redo"]').click();await settle();
  assert.ok(f.scene().getSnapshot().report.placed.some(item=>item.id===addedId));
  assert.equal(f.starts.length,startCount);assert.equal(zoneMessages(f).length,zoneCount);
  assert.deepEqual(f.camera.position,{x:12.5,z:-9.25});assert.equal(f.camera.yaw,.73);
  assert.equal(f.query('#ep-walk iframe'),frame);assert.equal(frame.src,source);
  assert.equal(f.query('#ep-panel-plan'),plan);assert.equal(f.query('#ep-summary'),summary);
});

test('hidden walkthrough keeps its pose, receives equipment updates and changes zones only when shown',async()=>{
  const f=fixture();f.planner.selectScope({regionId:'rgo',hallId:'RGO-05'});
  f.show(true);f.loadScene();f.ready();await settle();
  f.camera.position={x:8,z:-6};f.camera.yaw=-.4;
  const starts=f.starts.length,source=f.frame.src;
  f.show(false);await settle();assert.equal(f.camera.paused,true);
  f.planner.setQuantity(groupId,4);await settle();
  assert.ok(f.scene().getSnapshot().report.placed.some(item=>item.id===addedId));
  assert.equal(f.starts.length,starts);
  f.show(true);await settle();
  assert.equal(f.camera.paused,false);assert.equal(f.starts.length,starts);
  assert.deepEqual(f.camera.position,{x:8,z:-6});assert.equal(f.camera.yaw,-.4);
  f.show(false);f.planner.selectScope({regionId:'far-east',hallId:null,floorId:'upper'});await settle();
  assert.equal(f.starts.length,starts);
  f.show(true);await settle();
  assert.equal(f.starts.length,starts+1);assert.equal(f.camera.zoneId,'far-east-upper');
  assert.equal(f.frame.src,source);
});

test('the real bridge failure removes the parent loading cover and a successful retry can start walking',async()=>{
  const f=fixture();f.show(true);await settle();
  f.bridge.error('Не удалось загрузить прогулку.');await settle();
  assert.equal(f.query('.ep-walk-loading').hidden,true);
  assert.equal(f.query('[data-walk-restart]').disabled,true);
  assert.equal(f.query('.ep-walk-status').textContent,'Не удалось загрузить прогулку.');
  f.ready();await settle();
  assert.equal(f.query('[data-walk-restart]').disabled,false);
  assert.equal(f.camera.active,true);
  assert.equal(f.query('.ep-walk-status').textContent.startsWith('Прогулка:'),true);
});

test('the actual viewer focus callback ignores retained general-tour focus only in the embedded walk',async()=>{
  const source=await readFile(new URL('../tour/viewer.js',import.meta.url),'utf8');
  const begin=source.indexOf('function focusEquipmentFromPlan(request){');
  const end=source.indexOf("Object.defineProperty(diagnostics,'editor'",begin);
  assert.ok(begin>=0&&end>begin);
  const callback=source.slice(begin,end);
  for(const embedded of [true,false]){
    const calls=[];
    const context={installationsWalkEmbedded:embedded,pendingEquipmentFocus:null,inspectionReady:true,rgoZones:{},
      walkMode:{stop:()=>calls.push('stop')},exhibitionZones:{focusEquipment:()=>{calls.push('focus');return true;}}};
    vm.runInNewContext(callback+"\nfocusEquipmentFromPlan({id:'equipment-old::1'});",context);
    assert.deepEqual(calls,embedded?[]:['stop','focus']);
  }
});
