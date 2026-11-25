/** Pointer journeys use the real SVG editor; only viewport coordinate geometry is supplied by the DOM fixture. */
import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createEquipmentMap,checkEquipmentPosition} from './equipment-map.js';

async function loadDOM(){try{return await import('happy-dom');}catch(error){const path=process.env.PARK_HAPPY_DOM_MODULE;if(!path)throw new Error('Install happy-dom or set PARK_HAPPY_DOM_MODULE.',{cause:error});return import(path.startsWith('file:')?path:pathToFileURL(resolve(path)).href);}}
const {Window}=await loadDOM();
const fixtures=new Set();
const rectangle=(minX,minZ,maxX,maxZ)=>[[minX,minZ],[maxX,minZ],[maxX,maxZ],[minX,maxZ]];
function geometryFixture(){
  const ring=rectangle(-20,-20,20,20);
  return {zones:[{id:'test-zone',regionId:'test',floorId:'main',title:'Зона',polygonsWithHoles:[[ring]],labelXZ:[0,0]}],halls:[],floors:[{id:'main',floorY:7.2,polygons:[[ring]],grid:{width:160,height:160,cellSize:.25,originXZ:[-20,-20],mask:new Uint8Array(160*160).fill(1)}}],exhibits:[],reservations:[],overhead:[],route:[],rgoWalls:[],supportObstacles:[],raw:{world:{}}};
}
const exampleItem={id:'interactive::1',groupId:'interactive',name:'Интерактивный экран',typeId:'touch',regionId:'test',zoneId:'test-zone',floorId:'main',dimensions:{widthM:2,heightM:1.5,depthM:.4},position:{x:0,z:0,y:7.2,yaw:0,floorId:'main'},seedPosition:{x:0,z:0,y:7.2,yaw:0,floorId:'main'}};
async function fixture({geometry=geometryFixture(),items=[structuredClone(exampleItem)]}={}){
  const win=new Window({url:'https://fazafilms.ru/review/park-vpechatleniy/#installations'});
  for(const [key,value] of Object.entries({window:win,document:win.document,AbortController:win.AbortController}))Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  const mount=win.document.createElement('div');win.document.body.append(mount);
  const events=[],data={catalog:[{id:'touch',category:'interactive'}]},scope={regionId:'test',floorId:'main'};
  let positions={},map;
  map=createEquipmentMap(mount,{geometry,
    onSelect:id=>map.update({selectedId:id}),
    onMove:(id,position)=>{events.push({type:'move',id,position});positions={...positions,[id]:position};map.update({positions});},
    onPreview:(id,position,meta)=>events.push({type:'preview',id,position,...meta}),
    onPreviewEnd:(id,result)=>events.push({type:'end',id,...result}),
  });
  const svg=mount.querySelector('svg');
  svg.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,right:800,bottom:600,width:800,height:600});
  svg.getScreenCTM=()=>{
    const [x,y,w,h]=svg.getAttribute('viewBox').split(' ').map(Number),s=Math.min(800/w,600/h),e=(800-w*s)/2-x*s,f=(600-h*s)/2-y*s;
    return {a:s,b:0,c:0,d:s,e,f,inverse:()=>({a:1/s,b:0,c:0,d:1/s,e:-e/s,f:-f/s})};
  };
  svg.createSVGPoint=()=>({x:0,y:0,matrixTransform(m){return{x:m.a*this.x+m.c*this.y+m.e,y:m.b*this.x+m.d*this.y+m.f};}});
  svg.setPointerCapture=()=>{};svg.releasePointerCapture=()=>{};
  map.update({data,instances:items,scope,positions});await map.ready;
  const f={win,mount,svg,map,events,geometry,items,
    node:id=>mount.querySelector(`[data-instance-id="${id||exampleItem.id}"]`),
    handle:()=>mount.querySelector('.epm-rotate-handle'),
    screen:([x,y])=>{const m=svg.getScreenCTM();return [x*m.a+m.e,y*m.d+m.f];},
    world:(x,z)=>f.screen([z,-x]),
    pointer(type,target,point,extra={}){const [clientX,clientY]=point;target.dispatchEvent(new win.PointerEvent(type,{bubbles:true,cancelable:true,button:0,pointerId:1,clientX,clientY,...extra}));},
    select(){f.node().dispatchEvent(new win.MouseEvent('click',{bubbles:true}));return f.handle();},
    close(){map.destroy();win.close();fixtures.delete(f);},
  };
  fixtures.add(f);return f;
}
afterEach(()=>{for(const f of [...fixtures])f.close();});
function handlePoint(f){const m=/translate\(([-\d.e]+) ([-\d.e]+)\)/.exec(f.handle().getAttribute('transform'));return [Number(m[1]),Number(m[2])];}
function rotateTo(f,radians,extra={}){
  const [sx,sy]=handlePoint(f),record=f.map.getPlacementReport().placed[0],centre=[record.position.z,-record.position.x],radius=Math.hypot(sx-centre[0],sy-centre[1]);
  f.pointer('pointerdown',f.handle(),f.screen([sx,sy]));
  f.pointer('pointermove',f.svg,f.screen([centre[0]+radius*Math.cos(radians),centre[1]-radius*Math.sin(radians)]),extra);
}

test('the first mouse press selects and drags a device; preview does not commit intermediate state',async()=>{
  const f=await fixture();assert.equal(f.handle(),null);
  f.pointer('pointerdown',f.node(),f.world(0,0));
  assert.ok(f.handle(),'Selection exposes the rotation handle immediately.');
  f.pointer('pointermove',f.svg,f.world(1,0));f.pointer('pointermove',f.svg,f.world(2,0));
  assert.equal(f.events.filter(e=>e.type==='move').length,0);
  assert.equal(f.map.getPlacementReport().placed[0].position.x,0);
  assert.equal(f.events.at(-1).type,'preview');assert.equal(f.events.at(-1).position.x,2);assert.equal(f.events.at(-1).valid,true);
  f.pointer('pointerup',f.svg,f.world(2,0));
  assert.equal(f.events.filter(e=>e.type==='move').length,1);
  assert.equal(f.map.getPlacementReport().placed[0].position.x,2);
  assert.equal(f.events.at(-1).type,'end');assert.equal(f.events.at(-1).committed,true);assert.equal(f.events.at(-1).position.x,2);
});

test('the round handle rotates in world yaw and retains a large hit area after zoom',async()=>{
  const f=await fixture();f.select();
  const hit=f.handle().querySelector('.epm-rotate-hit');assert.ok(Number(hit.getAttribute('r'))*2>=24);
  rotateTo(f,Math.PI/2);
  assert.equal(f.events.at(-1).valid,true);assert.ok(Math.abs(f.events.at(-1).position.yaw-Math.PI/2)<1e-6);
  f.pointer('pointerup',f.svg,f.world(0,0));
  assert.equal(f.events.filter(e=>e.type==='move').length,1);assert.ok(Math.abs(f.map.getPlacementReport().placed[0].position.yaw-Math.PI/2)<1e-6);
  const zoom=f.mount.querySelector('[aria-label="Увеличить схему"]');zoom.click();
  const scale=Number(/scale\(([-\d.e]+)\)/.exec(f.handle().getAttribute('transform'))[1]);
  assert.ok(Math.abs(scale*f.svg.getScreenCTM().a-1)<1e-6,'Rotation control keeps its screen-pixel size.');
});

test('Shift snaps mouse rotation to 15 degrees while preserving the equipment centre',async()=>{
  const f=await fixture();f.select();rotateTo(f,44*Math.PI/180,{shiftKey:true});f.pointer('pointerup',f.svg,f.world(0,0));
  const final=f.events.find(e=>e.type==='move').position;
  assert.ok(Math.abs(final.yaw-Math.PI/4)<1e-6);assert.equal(final.x,0);assert.equal(final.z,0);
});

test('a rotation that takes the viewing space into a wall is shown as invalid and is not saved',async()=>{
  const geometry=geometryFixture(),ring=rectangle(1.4,-.5,1.8,.5);geometry.reservations.push({kind:'rgo-wall',floorId:'main',ring,bounds:[1.4,-.5,1.8,.5]});
  assert.equal(checkEquipmentPosition(exampleItem,exampleItem.position,geometry,[],{}).valid,true);
  const f=await fixture({geometry});f.select();rotateTo(f,Math.PI/2);
  assert.equal(f.events.at(-1).valid,false);assert.ok(f.node().classList.contains('is-invalid'));
  assert.match(f.mount.querySelector('.epm-status').textContent,/стенка/);
  f.pointer('pointerup',f.svg,f.world(0,0));
  assert.equal(f.events.filter(e=>e.type==='move').length,0);assert.equal(f.events.at(-1).committed,false);assert.equal(f.events.at(-1).position.yaw,0);
  assert.equal(f.node().hasAttribute('transform'),false);assert.equal(f.map.getPlacementReport().placed[0].position.yaw,0);
});

test('Escape and pointer cancellation restore the original transform without an undo entry',async()=>{
  const f=await fixture();f.select();rotateTo(f,Math.PI/3);
  f.svg.dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  assert.equal(f.events.filter(e=>e.type==='move').length,0);assert.equal(f.events.at(-1).committed,false);assert.equal(f.events.at(-1).position.yaw,0);
  assert.ok(f.handle(),'Cancelling a gesture keeps selection.');
  f.pointer('pointerdown',f.node(),f.world(0,0));f.pointer('pointermove',f.svg,f.world(2,1));f.pointer('pointercancel',f.svg,f.world(2,1));
  assert.equal(f.events.filter(e=>e.type==='move').length,0);assert.equal(f.events.at(-1).committed,false);assert.equal(f.events.at(-1).position.x,0);assert.equal(f.node().hasAttribute('transform'),false);
});

test('dragging beyond the zone is rejected, while an unrelated pointer does not change the gesture',async()=>{
  const f=await fixture();f.pointer('pointerdown',f.node(),f.world(0,0));
  f.pointer('pointermove',f.svg,f.world(4,0),{pointerId:2});assert.equal(f.events.length,0);
  f.pointer('pointermove',f.svg,f.world(30,0));assert.equal(f.events.at(-1).valid,false);assert.match(f.events.at(-1).reason,/границу/);
  f.pointer('pointerup',f.svg,f.world(30,0));assert.equal(f.events.filter(e=>e.type==='move').length,0);assert.equal(f.events.at(-1).committed,false);
});
