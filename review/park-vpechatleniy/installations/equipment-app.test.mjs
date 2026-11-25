/**
 * User journeys in the DOM. Spatial placement itself is covered separately;
 * this stub only records what the application sends to the map.
 *
 * Run with an installed happy-dom package:
 *   node --test equipment-app.test.mjs
 * Or supply its entry file without embedding a machine-specific dependency:
 *   PARK_HAPPY_DOM_MODULE=/path/to/happy-dom/lib/index.js node --test equipment-app.test.mjs
 */
import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createDefaultState, getInstances, getSummary, getUnitMetrics} from './equipment-model.js';

async function loadHappyDOM() {
  try {return await import('happy-dom');}
  catch (error) {
    const modulePath=process.env.PARK_HAPPY_DOM_MODULE;
    if(!modulePath) throw new Error('Install happy-dom or set PARK_HAPPY_DOM_MODULE to its lib/index.js entry file.', {cause:error});
    return import(modulePath.startsWith('file:')?modulePath:pathToFileURL(resolve(modulePath)).href);
  }
}
const {Window}=await loadHappyDOM();
const data=JSON.parse(await readFile(new URL('./equipment-data.json',import.meta.url),'utf8'));
const baseline=createDefaultState(data);
const STORAGE_KEY='faza.park.equipment-plan.v1';
const baseURL='https://fazafilms.ru/review/park-vpechatleniy/#installations';
const interactive=data.groups.find(g=>g.regionId==='rgo' && g.defaultQuantity>=3 && getUnitMetrics(data,g).interactiveStations>0 && getUnitMetrics(data,g).ledCabinets>0);
assert.ok(interactive,'A repeated RGO interactive is needed for the production-data journeys.');

function setGlobals(win) {
  for(const [key,value] of Object.entries({window:win,document:win.document,navigator:win.navigator,HTMLElement:win.HTMLElement,Node:win.Node,Event:win.Event,MouseEvent:win.MouseEvent,KeyboardEvent:win.KeyboardEvent,AbortController:win.AbortController})) {
    Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  }
}
const bootstrap=new Window({url:baseURL});
setGlobals(bootstrap);
// Deliberately no #park-installations: importing must not start the page loader.
assert.equal(document.getElementById('park-installations'),null);
const {createEquipmentPlanner}=await import('./equipment-app.js');
bootstrap.close();

function memoryStorage() {
  const values=new Map();
  return {getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),values};
}
const fixtures=new Set();
function fixture({storage=memoryStorage(),href=baseURL,initialState}={}) {
  const win=new Window({url:href});setGlobals(win);
  const mount=win.document.createElement('div');mount.id='equipment-test-fixture';win.document.body.append(mount);
  const mapState={updates:[],last:null,callbacks:null,report:null,destroyed:false};
  const mapFactory=(_mount,callbacks)=>{
    mapState.callbacks=callbacks;
    return {
      update(value) {
        mapState.last=value;
        mapState.updates.push(value);
        const scope=value.scope||{};
        const placed=value.instances.filter(i=>(!scope.regionId||i.regionId===scope.regionId)&&(!scope.hallId||i.hallId===scope.hallId)&&(!scope.floorId||i.floorId===scope.floorId));
        mapState.report={placed,unplaced:[],total:placed.length};
        callbacks.onReport?.(mapState.report);
      },
      getPlacementReport:()=>mapState.report,
      ready:Promise.resolve(),
      destroy(){mapState.destroyed=true;},
    };
  };
  const planner=createEquipmentPlanner(mount,{data,mapFactory,storage,initialState,locationObject:win.location});
  let closed=false;
  const f={win,mount,planner,map:mapState,storage,
    query:selector=>mount.querySelector(selector),
    all:selector=>Array.from(mount.querySelectorAll(selector)),
    close(){if(!closed){closed=true;planner.destroy();win.close();fixtures.delete(f);}},
  };
  fixtures.add(f);return f;
}
afterEach(()=>{for(const f of [...fixtures])f.close();});
test('new automatic placements survive local restoration with their chosen coordinates',()=>{
  const f=fixture();useHall(f);
  f.planner.setQuantity(interactive.id,interactive.defaultQuantity+1);
  const item=getInstances(data,f.planner.getState()).find(i=>i.groupId===interactive.id&&!i.seedPosition);
  assert.ok(item);
  const position={x:5.25,z:-28.5,yaw:.5,floorId:'main'};
  const placed=[{...item,position}];
  f.map.callbacks.onReport({placed,unplaced:[],total:1,all:{placed,unplaced:[],total:1}});
  assert.equal(f.planner.getState().positions[item.id].x,position.x);
  const storage=f.storage;f.close();
  const reopened=fixture({storage});
  assert.equal(reopened.planner.getState().positions[item.id].z,position.z);
});
function click(f,selector) {const el=typeof selector==='string'?f.query(selector):selector;assert.ok(el,`Missing control: ${selector}`);el.focus();el.click();return el;}
function change(f,selector,value) {const el=f.query(selector);assert.ok(el);el.value=value;el.dispatchEvent(new f.win.Event('change',{bubbles:true}));return el;}
function countField(f,g=interactive,location='editor') {return f.all('[data-equipment-count]').find(el=>el.dataset.equipmentCount===g.id&&el.dataset.location===location);}
function countButton(f,step,g=interactive) {return f.all('[data-count-step]').find(el=>el.dataset.group===g.id&&el.dataset.countStep===String(step));}
function edit(f,field,value,type='input') {assert.ok(field,'Quantity field must remain available.');field.focus();field.value=value;field.dispatchEvent(new f.win.Event(type,{bubbles:true}));}
function useHall(f,g=interactive) {f.planner.selectScope({regionId:g.regionId,hallId:g.hallId});}
function countOnMap(f,g=interactive) {return f.map.last.instances.filter(i=>i.groupId===g.id).length;}
const flush=async()=>{await Promise.resolve();await Promise.resolve();};

test('default navigation starts at RGO and has native zone, hall and exhibit selects',()=>{
  const f=fixture();
  assert.equal(f.query('#ep-region').tagName,'SELECT');
  assert.equal(f.query('#ep-hall').tagName,'SELECT');
  assert.equal(f.query('#ep-exhibit').tagName,'SELECT');
  assert.equal(f.query('#ep-region').value,'rgo');
  assert.equal(f.query('#ep-region').options[1].value,'rgo');
  assert.equal(f.query('#ep-hall').options.length,10);
  assert.equal(f.query('#ep-tab-plan').getAttribute('aria-selected'),'true');
  assert.ok(f.map.last.instances.length>0);
});

test('plus and minus immediately update quantities, map instances and dependent metrics',()=>{
  const f=fixture();useHall(f);
  const before=f.planner.getSummary(),unit=getUnitMetrics(data,interactive),old=baseline.quantities[interactive.id];
  click(f,countButton(f,1));
  const after=f.planner.getSummary();
  assert.equal(f.planner.getState().quantities[interactive.id],old+1);
  assert.equal(countOnMap(f),old+1);
  assert.equal(after.screens,before.screens+unit.screens);
  assert.equal(after.ledCabinets,before.ledCabinets+unit.ledCabinets);
  assert.equal(after.interactivePlaces,before.interactivePlaces+unit.interactivePlaces);
  assert.equal(after.digitalPrograms,before.digitalPrograms,'A repeat station must reuse its content.');
  click(f,countButton(f,-1));
  assert.equal(countOnMap(f),old);
  assert.equal(f.planner.getSummary().ledCabinets,before.ledCabinets);
  assert.equal(f.planner.getSummary().interactivePlaces,before.interactivePlaces);
});

test('multi-digit quantity entry in the equipment table preserves focus',()=>{
  const f=fixture();useHall(f);f.planner.selectView('equipment');
  edit(f,countField(f,interactive,'table'),'1');
  let current=countField(f,interactive,'table');
  assert.equal(f.win.document.activeElement,current,'Focus should survive the first digit.');
  assert.equal(current.value,'1');
  edit(f,current,'12');
  current=countField(f,interactive,'table');
  assert.equal(f.win.document.activeElement,current,'Focus should survive subsequent digits.');
  assert.equal(current.value,'12');
  assert.equal(f.planner.getState().quantities[interactive.id],12);
  assert.equal(countOnMap(f),12);
});

test('invalid, negative, fractional and excessive input cannot change the plan',()=>{
  const f=fixture();useHall(f);
  const before=f.planner.getState().quantities[interactive.id],beforeMap=countOnMap(f);
  for(const value of ['', '-1','1.5',String(interactive.maxQuantity+1)]) {
    const field=countField(f);edit(f,field,value);
    assert.equal(field.getAttribute('aria-invalid'),'true',`Invalid value: ${value}`);
    assert.equal(f.planner.getState().quantities[interactive.id],before);
    assert.equal(countOnMap(f),beforeMap);
    field.dispatchEvent(new f.win.Event('change',{bubbles:true}));
    assert.equal(field.value,String(before));
    assert.equal(field.hasAttribute('aria-invalid'),false);
  }
});

test('zero removes all copies and exposes the group in the add dropdown',()=>{
  const f=fixture();useHall(f);
  for(let n=baseline.quantities[interactive.id];n>0;n--)click(f,countButton(f,-1));
  assert.equal(f.planner.getState().quantities[interactive.id],0);
  assert.equal(countOnMap(f),0);
  assert.ok(Array.from(f.query('#ep-add-type').options).some(o=>o.value===interactive.id));
  change(f,'#ep-add-type',interactive.id);click(f,'[data-action="add"]');
  assert.equal(f.planner.getState().quantities[interactive.id],1);
  assert.equal(countOnMap(f),1);
});

test('typing zero keeps the table field available to continue editing',()=>{
  const f=fixture();useHall(f);f.planner.selectView('equipment');
  edit(f,countField(f,interactive,'table'),'0');
  const current=countField(f,interactive,'table');
  assert.ok(current,'Removing the last copy while typing must not remove the focused input.');
  assert.equal(f.win.document.activeElement,current);
  edit(f,current,'2');
  assert.equal(countOnMap(f),2);
});

test('undo and redo restore the quantity and map together',()=>{
  const f=fixture();useHall(f);
  const old=baseline.quantities[interactive.id];
  click(f,countButton(f,1));
  click(f,'[data-action="undo"]');
  assert.equal(f.planner.getState().quantities[interactive.id],old);
  assert.equal(countOnMap(f),old);
  assert.equal(f.query('[data-action="redo"]').disabled,false);
  click(f,'[data-action="redo"]');
  assert.equal(f.planner.getState().quantities[interactive.id],old+1);
  assert.equal(countOnMap(f),old+1);
});

test('global totals include both floors and changing the map level does not alter them',()=>{
  const f=fixture();f.planner.selectScope({regionId:null,hallId:null});
  const before=f.planner.getSummary();
  assert.equal(before.screens,74,'Current proposed programme has 74 screens on both floors.');
  assert.equal(before.areaM2,18884.055);
  change(f,'#ep-floor','upper');
  assert.equal(f.map.last.scope.floorId,'upper');
  assert.equal(f.planner.getScope().floorId,null);
  assert.deepEqual(f.planner.getSummary(),before);
  change(f,'#ep-floor','main');
  assert.equal(f.planner.getSummary().screens,74);
  assert.equal(f.map.last.scope.floorId,'main');
});

test('editing equipment on another floor automatically shows that floor on the map',()=>{
  const f=fixture();f.planner.selectScope({regionId:null,hallId:null});
  const upper=data.groups.find(g=>g.floorId==='upper'&&g.defaultQuantity>0);
  assert.ok(upper);
  f.planner.setQuantity(upper.id,upper.defaultQuantity+1);
  assert.equal(f.query('#ep-floor').value,'upper');
  assert.equal(f.map.last.scope.floorId,'upper');
  assert.equal(f.planner.getSummary().screens,74+getUnitMetrics(data,upper).screens);
  useHall(f);
  assert.equal(f.map.last.scope.floorId,'main');
});

test('local storage restores a compact edit without erasing all unchanged defaults',()=>{
  const storage=memoryStorage(),first=fixture({storage});useHall(first);
  first.planner.setQuantity(interactive.id,interactive.defaultQuantity+2);
  const saved=JSON.parse(storage.getItem(STORAGE_KEY));
  assert.deepEqual(Object.keys(saved.state.quantities),[interactive.id]);
  assert.equal(saved.state.quantities[interactive.id],interactive.defaultQuantity+2);
  first.close();
  const restored=fixture({storage});
  assert.equal(restored.planner.getState().quantities[interactive.id],interactive.defaultQuantity+2);
  assert.equal(countOnMap(restored),interactive.defaultQuantity+2);
  assert.equal(restored.planner.getScope().hallId,interactive.hallId);
  const unchanged=data.groups.find(g=>g.defaultQuantity>0&&g.id!==interactive.id);
  assert.equal(restored.planner.getState().quantities[unchanged.id],unchanged.defaultQuantity);
});

test('a compact share link works through the clipboard fallback and restores quantity and position',async()=>{
  const f=fixture();useHall(f);
  f.planner.setQuantity(interactive.id,interactive.defaultQuantity+1);
  const id=`${interactive.id}::1`,position={x:4,z:9,yaw:.25,floorId:'main'};
  f.map.callbacks.onMove(id,position);
  Object.defineProperty(f.win.navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('Clipboard unavailable in this test.');}}});
  click(f,'[data-action="share"]');await flush();
  const fallback=f.query('#ep-share-fallback');
  assert.equal(fallback.hidden,false);
  const input=fallback.querySelector('input'),sharedURL=new URL(input.value);
  assert.equal(f.win.document.activeElement,input);
  assert.equal(sharedURL.hash,'#installations');
  assert.ok(input.value.length<2000,'A single edit and move should produce a compact usable link.');
  const payload=JSON.parse(Buffer.from(sharedURL.searchParams.get('equipmentPlan'),'base64url').toString('utf8'));
  assert.deepEqual(Object.keys(payload.state.quantities),[interactive.id]);
  assert.equal(payload.state.positions[id].x,position.x);
  f.close();
  const reopened=fixture({href:sharedURL.href});
  assert.equal(reopened.planner.getState().quantities[interactive.id],interactive.defaultQuantity+1);
  assert.equal(reopened.planner.getState().positions[id].z,position.z);
  assert.equal(reopened.planner.getScope().hallId,interactive.hallId);
});

test('repeated stations keep one content programme while increasing its display copies',()=>{
  const f=fixture();useHall(f);
  const before=f.planner.getSummary().digitalPrograms;
  f.planner.setQuantity(interactive.id,interactive.defaultQuantity+2);
  f.planner.selectView('content');
  assert.equal(f.planner.getSummary().digitalPrograms,before);
  const title=data.content.find(c=>c.id===interactive.contentIds[0]).title;
  const cards=f.all('.ep-content-card').filter(el=>el.querySelector('h3')?.textContent===title);
  assert.equal(cards.length,1,'The repeated interactive must create a single content card.');
  assert.match(cards[0].textContent,new RegExp(`На ${interactive.defaultQuantity+2} `));
});

test('selection shows the cabinet grid for one physical screen, not all copies',()=>{
  const f=fixture();useHall(f);
  const unit=getUnitMetrics(data,interactive);
  f.map.callbacks.onSelect(`${interactive.id}::1`);
  const selection=f.query('#ep-selection');
  assert.equal(selection.hidden,false);
  assert.equal(selection.querySelectorAll('.ep-led-cell').length,unit.cabinetColumns*unit.cabinetRows);
  assert.equal(selection.querySelector('.ep-led-grid').getAttribute('aria-label'),`${unit.cabinetColumns} колонок и ${unit.cabinetRows} рядов LED-кабинетов`);
  assert.ok(selection.textContent.includes(`${unit.ledCabinets} LED-кабинетов`));
});

test('changing tabs by keyboard retains the selected zone and controls visibility',()=>{
  const f=fixture();useHall(f);
  const plan=f.query('#ep-tab-plan');plan.focus();plan.dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  assert.equal(f.query('#ep-tab-equipment').getAttribute('aria-selected'),'true');
  assert.equal(f.win.document.activeElement,f.query('#ep-tab-equipment'));
  assert.equal(f.query('#ep-panel-equipment').hidden,false);
  assert.equal(f.query('#ep-panel-plan').hidden,true);
  assert.equal(f.planner.getScope().hallId,interactive.hallId);
});

test('the current hall section stays open and its total updates after a quantity change',()=>{
  const f=fixture();
  const section=f.all('[data-section]').find(el=>el.dataset.section===interactive.hallId);assert.ok(section);section.open=true;
  const before=Number(section.querySelector('summary small').textContent.replace(/\s/g,''));
  click(f,countButton(f,1));
  const updated=f.all('[data-section]').find(el=>el.dataset.section===interactive.hallId);
  assert.equal(updated.open,true);
  assert.equal(Number(updated.querySelector('summary small').textContent.replace(/\s/g,'')),before+1);
});
