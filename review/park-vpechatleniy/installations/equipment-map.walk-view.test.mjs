/** Walking telemetry updates only SVG overlay nodes, never the equipment editor state. */
import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createEquipmentMap} from './equipment-map.js';

let Window;
try{({Window}=await import('happy-dom'));}
catch(error){if(!process.env.PARK_HAPPY_DOM_MODULE)throw error;({Window}=await import(pathToFileURL(resolve(process.env.PARK_HAPPY_DOM_MODULE)).href));}
const stylesheet=await readFile(new URL('./equipment-map.css',import.meta.url),'utf8');
const rectangle=[[-20,-20],[20,-20],[20,20],[-20,20]];
const item={id:'screen::1',groupId:'screen',name:'Экран',typeId:'touch',regionId:'test',zoneId:'test-main',floorId:'main',dimensions:{widthM:2,heightM:1.5,depthM:.4},position:{x:0,z:0,y:7.2,yaw:0,floorId:'main'},seedPosition:{x:0,z:0,y:7.2,yaw:0,floorId:'main'}};
function geometryFixture(){return {
  zones:['main','upper'].map(floorId=>({id:'test-'+floorId,regionId:'test',floorId,title:'Зона',polygonsWithHoles:[[rectangle]],labelXZ:[0,0]})),halls:[],
  floors:['main','upper'].map(id=>({id,floorY:id==='main'?7.2:13.2,polygons:[[rectangle]],grid:{width:160,height:160,cellSize:.25,originXZ:[-20,-20],mask:new Uint8Array(160*160).fill(1)}})),
  exhibits:[],reservations:[],overhead:[],route:[],rgoWalls:[],supportObstacles:[],raw:{world:{}}
};}
const baseView={x:3,z:4,y:8.85,floorId:'main',directionXZ:[1,0],horizontalFovRad:Math.PI/3,maxDistanceM:10};
const fixtures=new Set();
async function fixture(){
  const win=new Window({url:'https://fazafilms.ru/review/park-vpechatleniy/#installations'});
  for(const [key,value] of Object.entries({window:win,document:win.document,AbortController:win.AbortController}))Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  const style=win.document.createElement('style');style.textContent=stylesheet;win.document.head.append(style);
  const mount=win.document.createElement('div');win.document.body.append(mount);
  const geometry=geometryFixture(),events=[];let positions={},reports=0,map;
  map=createEquipmentMap(mount,{geometry,onReport:()=>reports++,onSelect:id=>map.update({selectedId:id}),
    onMove:(id,position)=>{events.push({kind:'move',id,position});positions={...positions,[id]:position};map.update({positions});},
    onPreview:(id,position,meta)=>events.push({kind:'preview',id,position,...meta}),onPreviewEnd:(id,meta)=>events.push({kind:'end',id,...meta})});
  const svg=mount.querySelector('svg'),size={width:800,height:600};
  svg.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,right:size.width,bottom:size.height,width:size.width,height:size.height});
  svg.getScreenCTM=()=>{const [x,y,w,h]=(svg.getAttribute('viewBox')||'-20 -20 40 40').split(' ').map(Number),s=Math.min(size.width/w,size.height/h),e=(size.width-w*s)/2-x*s,f=(size.height-h*s)/2-y*s;return {a:s,b:0,c:0,d:s,e,f,inverse:()=>({a:1/s,b:0,c:0,d:1/s,e:-e/s,f:-f/s})};};
  svg.createSVGPoint=()=>({x:0,y:0,matrixTransform(m){return{x:m.a*this.x+m.e,y:m.d*this.y+m.f};}});svg.setPointerCapture=()=>{};svg.releasePointerCapture=()=>{};
  map.update({data:{catalog:[{id:'touch',category:'interactive'}]},instances:[structuredClone(item)],positions,scope:{regionId:'test',floorId:'main'}});await map.ready;
  const f={win,mount,map,svg,size,events,reports:()=>reports,
    query:selector=>mount.querySelector(selector),node:()=>mount.querySelector('[data-instance-id="screen::1"]'),
    pointer(type,target,x,z){const m=svg.getScreenCTM();target.dispatchEvent(new win.PointerEvent(type,{bubbles:true,cancelable:true,pointerId:1,button:0,clientX:z*m.a+m.e,clientY:-x*m.d+m.f}));},
    close(){map.destroy();win.close();fixtures.delete(f);}};fixtures.add(f);return f;
}
afterEach(()=>{for(const f of [...fixtures])f.close();});
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-6,`${actual} versus ${expected}`);
const numbers=value=>(value.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi)||[]).map(Number);

test('live position and direction reuse overlay nodes and keep equipment, placement and map navigation untouched',async()=>{
  const f=await fixture();f.query('[aria-label="Увеличить схему"]').click();
  const node=f.node(),box=f.svg.getAttribute('viewBox'),reports=f.reports(),before=f.map.getPlacementReport();
  assert.equal(f.map.setWalkView(baseView),true);
  const overlay=f.query('.epm-walk-view'),marker=f.query('.epm-walk-marker');
  assert.equal(overlay.getAttribute('display'),'inline');assert.equal(f.query('.epm-walk-label').textContent,'Вы');
  assert.deepEqual(numbers(marker.getAttribute('transform')).slice(0,2),[4,-3]);
  near(numbers(f.query('.epm-walk-direction').getAttribute('transform'))[0],0);
  for(let i=0;i<25;i++)f.map.setWalkView({...baseView,x:3+i*.1,z:4+i*.2,directionXZ:[0,1]});
  assert.equal(f.query('.epm-walk-view'),overlay);assert.equal(f.query('.epm-walk-marker'),marker);assert.equal(f.node(),node);
  assert.equal(f.svg.getAttribute('viewBox'),box);assert.equal(f.reports(),reports);assert.deepEqual(f.map.getPlacementReport(),before);assert.equal(f.events.length,0);
  assert.deepEqual(numbers(marker.getAttribute('transform')).slice(0,2),[8.8,-5.4]);
  near(numbers(f.query('.epm-walk-direction').getAttribute('transform'))[0],90);
});

test('the camera visibility polygon is drawn exactly and clipped to the current floor without an extra unbounded sector',async()=>{
  const f=await fixture(),polygon=[[3,4],[7,2],[7,5],[5,6]];
  f.map.setWalkView({...baseView,visiblePolygonXZ:polygon});
  const sector=f.query('.epm-walk-sector');assert.deepEqual(numbers(sector.getAttribute('d')),[4,-3,2,-7,5,-7,6,-5]);
  const clipId=f.query('clipPath').id;assert.equal(sector.getAttribute('clip-path'),`url(#${clipId})`);
  polygon[1][0]=1000;f.map.update({selectedId:'screen::1'});
  assert.deepEqual(numbers(f.query('.epm-walk-sector').getAttribute('d')),[4,-3,2,-7,5,-7,6,-5],'Telemetry is retained by value across equipment renders.');
  f.map.setWalkView({...baseView,visiblePolygonXZ:[]});
  assert.equal(f.query('.epm-walk-sector').getAttribute('display'),'none');assert.equal(f.query('.epm-walk-view').getAttribute('display'),'inline');
});

test('horizontal field of view changes the fallback sector while the same marker stays at the camera position',async()=>{
  const f=await fixture();f.map.setWalkView({...baseView,x:0,z:0,horizontalFovRad:Math.PI/3});
  const narrow=numbers(f.query('.epm-walk-sector').getAttribute('d')),marker=f.query('.epm-walk-marker');
  const width=values=>{const x=values.filter((_,index)=>index%2===0);return Math.max(...x)-Math.min(...x);};
  near(width(narrow),10);
  f.map.setWalkView({...baseView,x:0,z:0,horizontalFovRad:Math.PI*2/3});
  const wide=numbers(f.query('.epm-walk-sector').getAttribute('d'));assert.ok(width(wide)>width(narrow)*1.7);
  assert.equal(f.query('.epm-walk-marker'),marker);assert.deepEqual(numbers(marker.getAttribute('transform')).slice(0,2),[0,0]);
});

test('the marker is hidden on a different floor and on exit, then restored from current telemetry',async()=>{
  const f=await fixture();f.map.setWalkView(baseView);f.map.update({scope:{regionId:'test',floorId:'upper'}});
  assert.equal(f.query('.epm-walk-view').getAttribute('display'),'none');assert.equal(f.query('.epm-walk-view').getAttribute('aria-hidden'),'true');
  f.map.setWalkView({...baseView,floorId:'upper',y:14.85});assert.equal(f.query('.epm-walk-view').getAttribute('display'),'inline');
  f.map.setWalkView(null);assert.equal(f.query('.epm-walk-view').getAttribute('display'),'none');
  f.map.setWalkView({...baseView,floorId:'upper'});assert.equal(f.query('.epm-walk-view').getAttribute('display'),'inline');
  assert.equal(f.map.setWalkView({...baseView,x:NaN}),false);assert.equal(f.query('.epm-walk-view').getAttribute('display'),'none');
  assert.equal(f.map.setWalkView({...baseView,directionXZ:[0,0]}),false);
});

test('camera marker keeps a readable screen size after zoom and fullscreen-style resize',async()=>{
  const f=await fixture();f.map.setWalkView(baseView);
  function check(){const marker=f.query('.epm-walk-marker'),scale=numbers(marker.getAttribute('transform'))[2],radius=Number(f.query('.epm-walk-halo').getAttribute('r'));near(scale*f.svg.getScreenCTM().a,1);near(radius*scale*f.svg.getScreenCTM().a,10.5);}
  check();f.query('[aria-label="Увеличить схему"]').click();check();
  f.size.width=1250;f.size.height=750;f.map.refreshLayout();check();
});

test('camera updates do not intercept pointer input or cancel an in-progress equipment drag',async()=>{
  const f=await fixture();f.map.setWalkView(baseView);
  const overlay=f.query('.epm-walk-view');assert.equal(overlay.getAttribute('pointer-events'),'none');
  assert.equal(f.win.getComputedStyle(f.query('.epm-walk-sector')).pointerEvents,'none');
  assert.equal(f.win.getComputedStyle(f.query('.epm-walk-label')).pointerEvents,'none');assert.equal(overlay.querySelector('[tabindex]'),null);
  f.pointer('pointerdown',f.node(),0,0);f.pointer('pointermove',f.svg,1,0);
  const grabbed=f.node();assert.ok(grabbed.hasAttribute('transform'));
  for(let i=0;i<20;i++)f.map.setWalkView({...baseView,x:3+i*.1,z:4,directionXZ:[0,-1]});
  assert.equal(f.node(),grabbed);assert.ok(f.query('.equipment-map').classList.contains('is-dragging'));
  f.pointer('pointermove',f.svg,2,1);f.pointer('pointerup',f.svg,2,1);
  const moves=f.events.filter(event=>event.kind==='move');assert.equal(moves.length,1);assert.equal(moves[0].position.x,2);assert.equal(moves[0].position.z,1);
  assert.equal(f.events.at(-1).committed,true);assert.equal(f.query('.epm-walk-view').getAttribute('display'),'inline');
});

test('a walking position beyond the visible edge shifts only the view centre enough to retain the marker',async()=>{
  const f=await fixture();f.map.focus('screen::1');
  const initial=numbers(f.svg.getAttribute('viewBox')),node=f.node(),reports=f.reports();
  f.map.setWalkView({...baseView,x:12,z:0});
  const first=numbers(f.svg.getAttribute('viewBox'));assert.deepEqual(first.slice(2),initial.slice(2));assert.notDeepEqual(first.slice(0,2),initial.slice(0,2));
  f.map.setWalkView({...baseView,x:13,z:8});
  const moved=numbers(f.svg.getAttribute('viewBox'));assert.deepEqual(moved.slice(2),initial.slice(2));
  const matrix=f.svg.getScreenCTM(),screenX=matrix.a*8+matrix.c*(-13)+matrix.e,screenY=matrix.b*8+matrix.d*(-13)+matrix.f;
  assert.ok(screenX>=37.9&&screenX<=f.size.width-37.9);assert.ok(screenY>=29.9&&screenY<=f.size.height-29.9);
  assert.ok(Math.abs(screenX-(f.size.width-38))<.1,'Only the overflow and the small marker padding should move the horizontal view.');
  assert.ok(Math.abs(screenY-30)<.1);
  assert.equal(f.node(),node);assert.equal(f.reports(),reports);assert.equal(f.events.length,0);
});

test('standing or turning never reverses user panning, and active pan, drag or rotation suppress camera following',async()=>{
  const f=await fixture();f.map.focus('screen::1');f.map.setWalkView({...baseView,x:0,z:0});
  f.pointer('pointerdown',f.svg,0,0);f.pointer('pointermove',f.svg,30,0);f.pointer('pointerup',f.svg,30,0);
  const panned=f.svg.getAttribute('viewBox');
  f.map.setWalkView({...baseView,x:0,z:0});f.map.setWalkView({...baseView,x:0,z:0,directionXZ:[0,1]});
  assert.equal(f.svg.getAttribute('viewBox'),panned);
  f.pointer('pointerdown',f.svg,0,0);f.map.setWalkView({...baseView,x:15,z:15});assert.equal(f.svg.getAttribute('viewBox'),panned);
  f.pointer('pointerup',f.svg,0,0);f.map.setWalkView({...baseView,x:15,z:15,directionXZ:[-1,0]});assert.equal(f.svg.getAttribute('viewBox'),panned,'No deferred return after the pan is released.');
  f.map.focus('screen::1');const focused=f.svg.getAttribute('viewBox');
  f.pointer('pointerdown',f.node(),0,0);f.pointer('pointermove',f.svg,1,1);
  f.map.setWalkView({...baseView,x:18,z:18});assert.equal(f.svg.getAttribute('viewBox'),focused);
  f.pointer('pointerup',f.svg,1,1);assert.equal(f.svg.getAttribute('viewBox'),focused);
  const handle=f.query('.epm-rotate-handle'),point=numbers(handle.getAttribute('transform')),matrix=f.svg.getScreenCTM();
  handle.dispatchEvent(new f.win.PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerId:2,button:0,clientX:point[0]*matrix.a+matrix.e,clientY:point[1]*matrix.d+matrix.f}));
  f.map.setWalkView({...baseView,x:19,z:19});assert.equal(f.svg.getAttribute('viewBox'),focused);
  f.svg.dispatchEvent(new f.win.PointerEvent('pointercancel',{bubbles:true,pointerId:2}));
  f.map.setWalkView({...baseView,x:19,z:19,directionXZ:[0,-1]});assert.equal(f.svg.getAttribute('viewBox'),focused);
});
