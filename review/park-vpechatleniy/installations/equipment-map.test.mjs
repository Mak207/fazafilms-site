import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const moduleFrom=async path=>import(`data:text/javascript;base64,${Buffer.from(await readFile(new URL(path,import.meta.url),'utf8')).toString('base64')}`);
const {prepareEquipmentGeometry,layoutEquipment,checkEquipmentPosition,pointInPolygons}=await moduleFrom('./equipment-map.js');
const {createDefaultState,getInstances,setQuantity,getSummary}=await moduleFrom('./equipment-model.js');
const data=await read('./equipment-data.json');
const geometry=prepareEquipmentGeometry({
  zones:await read('../tour/assets/zones/source-zones.json'),
  colors:await read('../tour/assets/zones/floor-colors.json'),
  world:await read('../tour/crowd/data/park-world.json'),
  floorShapes:await read('./engineering/placement-frontal.json'),
  placements:await read('../tour/assets/zones/placements-final.json'),
  rgo:await read('../tour/assets/zones/rgo-layout.json'),
  manifest:await read('../tour/assets/exhibits/manifest.json'),
});
const initialState=createDefaultState(data),initialItems=getInstances(data,initialState),initialReport=layoutEquipment(initialItems,geometry,{data});
const samePoint=(a,b)=>Math.abs(a.x-b.x)<.001&&Math.abs(a.z-b.z)<.001&&Math.abs(a.yaw-b.yaw)<.001;

test('map uses source zones, CAD floors and independent RGO programme boundaries',()=>{
  assert.equal(geometry.zones.length,20);
  assert.equal(geometry.halls.length,9);
  assert.equal(geometry.floors.length,2);
  assert.ok(geometry.floors.every(f=>f.polygons.length&&f.grid.mask.length===f.grid.width*f.grid.height));
  assert.equal(geometry.halls.reduce((n,h)=>n+h.programmeNetAreaSquareMetres,0),1120);
  assert.ok(geometry.reservations.some(r=>r.kind==='rgo-route'));
  assert.equal(geometry.exhibits.some(e=>['Z03','Z04'].includes(e.objectId)),false,'editable flight cabins must not remain as immutable obstacles');
});

test('all initial equipment is physically represented without orphaned or duplicate items',()=>{
  assert.equal(initialReport.total,initialItems.length);
  assert.equal(initialReport.placedCount,initialItems.length);
  assert.equal(initialReport.unplacedCount,0);
  assert.equal(new Set(initialReport.placed.map(p=>p.id)).size,initialItems.length);
  assert.equal(initialReport.warnings.length,0);
  for(const item of initialReport.placed){
    assert.ok(Number.isFinite(item.position.x)&&Number.isFinite(item.position.z));
    const target=item.hallId?geometry.halls.find(h=>h.id===item.hallId):geometry.zones.find(z=>z.id===item.zoneId);
    assert.ok(pointInPolygons([item.position.x,item.position.z],target.polygonsWithHoles,.25),item.name);
    if(item.placement!=='existing')assert.equal(checkEquipmentPosition(item,item.position,geometry,initialReport.placed,data).valid,true,item.name);
  }
});

test('fourth polar terminal appears inside its hall and changes exactly one physical quantity',()=>{
  const groupId='equipment-RGO-05-INT-01';
  const nextState=setQuantity(data,initialState,groupId,4),nextItems=getInstances(data,nextState);
  const report=layoutEquipment(nextItems,geometry,{data,previousPositions:initialReport.positions});
  assert.equal(report.placedCount,initialReport.placedCount+1);
  assert.equal(report.unplacedCount,0);
  const added=report.placed.find(i=>i.id===`${groupId}::4`);
  assert.ok(added);
  assert.equal(added.hallId,'RGO-05');
  assert.equal(checkEquipmentPosition(added,added.position,geometry,report.placed,data).valid,true);
  for(const before of initialReport.placed)assert.ok(samePoint(before.position,report.positions[before.id]),before.name);
  const beforeMetrics=getSummary(data,initialState,{hallId:'RGO-05'}),afterMetrics=getSummary(data,nextState,{hallId:'RGO-05'});
  assert.equal(afterMetrics.screens,beforeMetrics.screens+1);
  assert.equal(afterMetrics.ledCabinets,beforeMetrics.ledCabinets+9);
  assert.equal(afterMetrics.digitalPrograms,beforeMetrics.digitalPrograms);
});

test('removing a device removes its footprint and restoring quantities keeps survivors still',()=>{
  const groupId='equipment-RGO-05-INT-01';
  const reduced=setQuantity(data,initialState,groupId,2),reducedReport=layoutEquipment(getInstances(data,reduced),geometry,{data,previousPositions:initialReport.positions});
  assert.equal(reducedReport.placedCount,initialReport.placedCount-1);
  assert.ok(!reducedReport.placed.some(p=>p.id===`${groupId}::3`));
  for(const kept of reducedReport.placed)assert.ok(samePoint(kept.position,initialReport.positions[kept.id]));
  const restored=layoutEquipment(initialItems,geometry,{data,previousPositions:reducedReport.positions});
  assert.equal(restored.placedCount,initialReport.placedCount);
  assert.ok(restored.placed.every(p=>samePoint(p.position,initialReport.positions[p.id])));
});

test('full rooms show unplaced equipment instead of overlapping or dropping requested units',()=>{
  const groupId='equipment-RGO-00-LED-01',group=data.groups.find(g=>g.id===groupId);
  const crowded=setQuantity(data,initialState,groupId,group.maxQuantity);
  const items=getInstances(data,crowded),report=layoutEquipment(items,geometry,{data,previousPositions:initialReport.positions});
  assert.equal(report.placedCount+report.unplacedCount,items.length);
  assert.ok(report.unplacedCount>0);
  assert.equal(new Set([...report.placed,...report.unplaced].map(p=>p.id)).size,items.length);
  assert.ok(report.unplaced.every(p=>p.reason==='Не найдено свободного места с площадкой для посетителей'));
  for(const before of initialReport.placed)assert.ok(samePoint(before.position,report.positions[before.id]));
  for(const item of report.placed.filter(p=>p.placement!=='existing'))assert.equal(checkEquipmentPosition(item,item.position,geometry,report.placed,data).valid,true);
});

test('manual placement rejects another exhibit, equipment or any point outside the zone',()=>{
  const record=initialReport.placed.find(p=>p.placement!=='existing');
  assert.ok(record);
  assert.equal(checkEquipmentPosition(record,{...record.position,x:-500,z:500},geometry,initialReport.placed,data).valid,false);
  assert.equal(checkEquipmentPosition(record,record.position,geometry,initialReport.placed,data).valid,true);
  const other=initialReport.placed.find(p=>p.id!==record.id&&p.regionId===record.regionId&&p.floorId===record.floorId);
  assert.ok(other);
  assert.equal(checkEquipmentPosition(record,other.position,geometry,initialReport.placed,data).valid,false);
});

test('mounting height is checked below the current monorail',()=>{
  assert.equal(geometry.transport.supports.length,33);
  assert.ok(geometry.transport.points.length>350);
  assert.ok(Math.abs(geometry.transport.lengthM-354.304589)<.001);
  const item={id:'height-probe',zoneId:'far-east-upper',regionId:'far-east',floorId:'upper',typeId:'projector',dimensions:{widthM:.3,heightM:.5,depthM:.3},mountingBottomM:0};
  const position={x:-6.1921,z:-75.7831,yaw:0};
  assert.equal(checkEquipmentPosition(item,position,geometry,[],{}).valid,true);
  const blocked=checkEquipmentPosition({...item,mountingBottomM:4},position,geometry,[],{});
  assert.equal(blocked.valid,false);
  assert.equal(blocked.reason,'Недостаточно высоты под монорельсом');
});

test('a source coordinate outside its assigned zone is not silently retained',()=>{
  const source=initialItems.find(i=>i.regionId==='far-east');
  const bad={...source,id:source.id+'-moved-source',seedPosition:{x:-500,z:500,yaw:0,floorId:source.floorId},position:null};
  const report=layoutEquipment([bad],geometry,{data});
  assert.equal(report.placedCount,1);
  assert.notEqual(report.placed[0].position.x,-500);
  assert.equal(report.warnings.length,1);
  assert.equal(report.warnings[0].reason,'Место уточнено внутри своей зоны');
});
