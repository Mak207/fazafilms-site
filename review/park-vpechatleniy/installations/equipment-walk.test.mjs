import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createEquipmentWalk,INSTALLATIONS_WALK_PROTOCOL as protocol} from './equipment-walk.js';

let Window;
try{({Window}=await import('happy-dom'));}
catch(error){
  if(!process.env.PARK_HAPPY_DOM_MODULE)throw error;
  ({Window}=await import(pathToFileURL(resolve(process.env.PARK_HAPPY_DOM_MODULE)).href));
}
const url='https://fazafilms.ru/review/park-vpechatleniy/?v=test#installations';
const fixtures=new Set();
function fixture({hidden=false}={}){
  const win=new Window({url,settings:{disableIframePageLoading:true}});
  win.document.body.innerHTML='<section id="installations"><div id="host"></div></section>';
  const section=win.document.querySelector('section');section.hidden=hidden;
  const host=win.document.getElementById('host');
  const controller=createEquipmentWalk(host,{scope:{regionId:'rgo',hallId:null,floorId:'main'},label:'РГО · Нижний уровень'});
  const frame=host.querySelector('iframe'),messages=[],child=new Window({url});
  // Iframe navigation is deliberately disabled; this explicit window tests only the transport.
  Object.defineProperty(frame,'contentWindow',{value:child,configurable:true});
  const installSpy=()=>{frame.contentWindow.postMessage=(message,targetOrigin)=>messages.push({message,targetOrigin});};
  installSpy();
  const f={win,section,host,controller,frame,messages,installSpy,send(data,{origin=win.location.origin,source=frame.contentWindow}={}){win.dispatchEvent(new win.MessageEvent('message',{origin,source,data:{protocol,...data}}));},close(){controller.destroy();child.close();win.close();fixtures.delete(f);}};
  fixtures.add(f);return f;
}
afterEach(()=>{for(const f of [...fixtures])f.close();});

test('hidden installations do not load another scene until the section opens',()=>{
  const f=fixture({hidden:true});
  assert.equal(f.frame.hasAttribute('src'),false);
  f.section.hidden=false;
  f.win.dispatchEvent(new f.win.CustomEvent('park-folder-change',{detail:{folder:'installations'}}));
  const source=new URL(f.frame.src);
  assert.equal(source.origin,f.win.location.origin);
  assert.equal(source.pathname,'/review/park-vpechatleniy/tour/index.html');
  assert.equal(source.searchParams.get('embedded'),'installations');
  assert.equal(source.searchParams.get('v'),'installations-walk-20261125');
});

test('ready receives the latest selected zone without replacing the iframe',()=>{
  const f=fixture(),frame=f.frame,src=frame.src;
  f.controller.updateScope({regionId:'rgo',hallId:'RGO-05',floorId:'main'},'Полярная наука');
  f.messages.length=0;f.send({kind:'ready'});
  assert.deepEqual(f.messages.map(x=>x.message.kind),['visibility','zone']);
  assert.equal(f.messages[0].message.visible,true);
  assert.deepEqual(f.messages[1].message.scope,{regionId:'rgo',hallId:'RGO-05',floorId:'main'});
  assert.ok(f.messages.every(x=>x.targetOrigin===f.win.location.origin));
  assert.equal(f.host.querySelector('iframe'),frame);
  assert.equal(frame.src,src);
  assert.equal(f.host.querySelector('.ep-walk-zone').textContent,'Полярная наука');
  assert.equal(f.host.querySelector('.ep-walk-loading').hidden,true);
});

test('same scope does not move the camera; explicit restart does',()=>{
  const f=fixture();f.send({kind:'ready'});f.messages.length=0;
  f.controller.updateScope({regionId:'rgo',hallId:null,floorId:'main'},'РГО');
  assert.equal(f.messages.length,0);
  f.host.querySelector('[data-walk-restart]').click();
  assert.equal(f.messages.length,1);
  assert.equal(f.messages[0].message.kind,'zone');
  assert.equal(f.messages[0].message.restart,true);
});

test('changing tabs pauses and resumes the existing iframe without another zone command',()=>{
  const f=fixture();f.send({kind:'ready'});f.messages.length=0;
  const src=f.frame.src;
  f.section.hidden=true;f.win.dispatchEvent(new f.win.CustomEvent('park-folder-change'));
  f.section.hidden=false;f.win.dispatchEvent(new f.win.CustomEvent('park-folder-change'));
  assert.deepEqual(f.messages.map(x=>[x.message.kind,x.message.visible]),[['visibility',false],['visibility',true]]);
  assert.equal(f.frame.src,src);
  assert.equal(f.messages.some(x=>x.message.kind==='zone'),false);
});

test('unrelated windows and origins cannot signal ready or inject status',()=>{
  const f=fixture(),initialStatus=f.host.querySelector('.ep-walk-status').textContent;
  f.send({kind:'ready'},{origin:'https://example.net'});
  f.send({kind:'ready'},{source:f.win});
  f.send({kind:'status',text:'Wrong source'},{source:f.win});
  assert.equal(f.host.querySelector('[data-walk-restart]').disabled,true);
  assert.equal(f.host.querySelector('.ep-walk-status').textContent,initialStatus);
  f.send({kind:'status',text:'<img src=x onerror=alert(1)>'});
  assert.equal(f.host.querySelector('.ep-walk-status').textContent,'<img src=x onerror=alert(1)>');
  assert.equal(f.host.querySelector('.ep-walk-status img'),null);
});

test('destroy pauses the child and removes all message and visibility handling',()=>{
  const f=fixture();f.send({kind:'ready'});f.messages.length=0;
  f.controller.destroy();
  assert.deepEqual(f.messages.map(x=>[x.message.kind,x.message.visible]),[['visibility',false]]);
  f.send({kind:'ready'});f.win.dispatchEvent(new f.win.CustomEvent('park-folder-change'));
  assert.equal(f.messages.length,1);
  assert.equal(f.host.children.length,0);
});

test('a child boot error removes the loading cover and a later ready clears it',()=>{
  const f=fixture();f.send({kind:'status',error:true,ok:false,text:'Не удалось загрузить прогулку.'});
  assert.equal(f.host.querySelector('.ep-walk-loading').hidden,true);
  assert.equal(f.host.querySelector('[data-walk-restart]').disabled,true);
  assert.equal(f.host.querySelector('.ep-walk-status').textContent,'Не удалось загрузить прогулку.');
  f.send({kind:'ready'});
  assert.equal(f.host.querySelector('[data-walk-restart]').disabled,false);
  assert.equal(f.host.querySelector('.ep-walk-status').textContent,'');
});

function setGlobals(win){
  for(const [key,value] of Object.entries({window:win,document:win.document,navigator:win.navigator,HTMLElement:win.HTMLElement,Node:win.Node,Event:win.Event,AbortController:win.AbortController}))Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
}
const bootstrap=new Window({url,settings:{disableIframePageLoading:true}});setGlobals(bootstrap);
const {createEquipmentPlanner}=await import('./equipment-app.js');bootstrap.close();
const data=JSON.parse(await readFile(new URL('./equipment-data.json',import.meta.url),'utf8'));
function plannerFixture(){
  const win=new Window({url,settings:{disableIframePageLoading:true}});setGlobals(win);
  const host=win.document.createElement('div');win.document.body.append(host);
  const calls={initial:null,scopes:[],destroyed:false};
  const planner=createEquipmentPlanner(host,{data,storage:null,locationObject:win.location,
    mapFactory:()=>({update(){},destroy(){}}),
    walkFactory:(mount,options)=>{calls.initial=options;mount.innerHTML='<iframe title="Прогулка"></iframe>';return {updateScope:(scope,label)=>calls.scopes.push({scope,label}),destroy(){calls.destroyed=true;}};}
  });
  const f={win,host,planner,calls,close(){planner.destroy();win.close();fixtures.delete(f);}};fixtures.add(f);return f;
}

test('walkthrough is the first block and the original sections retain their order',()=>{
  const f=plannerFixture();
  assert.deepEqual(Array.from(f.host.firstElementChild.children).slice(0,10).map(n=>n.id||n.className),[
    'ep-walk','ep-heading','ep-basis','ep-toolbar','ep-tabs','ep-summary','ep-panel-plan','ep-panel-equipment','ep-panel-content','ep-panel-basis'
  ]);
  assert.deepEqual(Array.from(f.host.querySelectorAll('[role=tab]')).map(n=>n.textContent),['План и количество','Оборудование','Контент','Как считаем']);
  assert.deepEqual(f.calls.initial.scope,{regionId:'rgo',hallId:null,floorId:'main'});
});

test('explicit zone, hall and floor selections update the walkthrough scope',()=>{
  const f=plannerFixture(),hall=data.halls.find(h=>h.regionId==='rgo');
  f.planner.selectScope({regionId:'rgo',hallId:hall.id});
  assert.deepEqual(f.calls.scopes.at(-1).scope,{regionId:'rgo',hallId:hall.id,floorId:'main'});
  const region=data.regions.find(r=>r.floors?.some(x=>x.id==='upper')&&r.id!=='rgo');
  assert.ok(region);f.planner.selectScope({regionId:region.id,hallId:null});
  const floor=f.host.querySelector('#ep-floor');floor.value='upper';floor.dispatchEvent(new f.win.Event('change',{bubbles:true}));
  assert.deepEqual(f.calls.scopes.at(-1).scope,{regionId:region.id,hallId:null,floorId:'upper'});
});

test('quantity and plan view updates keep the same walkthrough and never teleport to another floor',()=>{
  const f=plannerFixture(),frame=f.host.querySelector('#ep-walk iframe');
  f.planner.selectScope({regionId:null,hallId:null,floorId:'main'});f.calls.scopes.length=0;
  const upper=data.groups.find(g=>g.floorId==='upper'&&g.defaultQuantity<(g.maxQuantity??99));assert.ok(upper);
  f.planner.setQuantity(upper.id,upper.defaultQuantity+1);
  assert.equal(f.host.querySelector('#ep-floor').value,'upper','Existing plan behaviour remains intact.');
  assert.equal(f.calls.scopes.length,0,'Changing quantity must not move the walker.');
  f.planner.selectView('equipment');f.planner.selectView('content');f.planner.selectView('plan');
  assert.equal(f.calls.scopes.length,0);
  assert.equal(f.host.querySelector('#ep-walk iframe'),frame);
});
