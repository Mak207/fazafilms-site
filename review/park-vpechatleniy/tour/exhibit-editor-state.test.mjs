import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

const threeUrl = new URL('../../../golden-ring/interactives/vendor/three-0.180/three.module.min.js', import.meta.url).href;
registerHooks({resolve(specifier, context, nextResolve) { return specifier === 'three' ? {url:threeUrl,shortCircuit:true} : nextResolve(specifier,context); }});
const THREE = await import('three');
const {createExhibitEditor,mergeSavedExhibitLayout,rebaseExhibitHistory,changedExhibitIds,managedExhibitChanges} = await import('./exhibit-editor.js');
const clone = value => JSON.parse(JSON.stringify(value));
const item = (id,x,{managed=false,visible=true}={}) => ({instanceId:id,exhibitId:id.split('-')[0],floating:false,x,y:7.2,z:1,rotationY:.4,scaleFactor:1,visible,floorY:7.2,...(managed?{managedEquipment:true,equipmentPlanId:id+'::1'}:{})});
const layout = instances => ({schema:'park-exhibit-layout',version:1,units:'meters',upAxis:'Y',instances});

test('legacy save restores exhibits while preserving current managed equipment and new copies',()=>{
  const current=layout([item('O12-1',1),item('E_A-1',10,{managed:true}),item('EQ_NEW-1',13,{managed:true})]);
  const old=layout([item('O12-1',3),item('E_A-1',-20)]);
  const result=mergeSavedExhibitLayout(old,current,id=>id==='E_A-1');
  assert.equal(result.layout.instances[0].x,3);
  assert.equal(result.layout.instances[1].x,10);
  assert.equal(result.layout.instances[2].x,13);
  assert.equal(result.preservedEquipment,1);
  assert.equal(current.instances[0].x,1);
});

test('save with only non-managed exhibits restores without requiring equipment rows',()=>{
  const current=layout([item('O12-1',1),item('E_A-1',10,{managed:true})]);
  assert.deepEqual(mergeSavedExhibitLayout(layout([item('O12-1',4)]),current).layout.instances.map(x=>x.x),[4,10]);
  assert.throws(()=>mergeSavedExhibitLayout(layout([item('UNKNOWN',4)]),current),/неизвестный/);
  assert.throws(()=>mergeSavedExhibitLayout(layout([item('O12-1',4),item('O12-1',5)]),current),/повторный/);
  assert.throws(()=>mergeSavedExhibitLayout({...current,units:'feet'},current),/метры/);
});

test('undo changes only edited identities and never revives equipment removed on the plan',()=>{
  const before=layout([item('O12-1',1),item('E_A-1',10,{managed:true})]);
  const after=clone(before);after.instances[1].x=12;
  const latest=clone(after);latest.instances[0].x=99;latest.instances.push(item('EQ_NEW-1',25,{managed:true}));
  const ids=changedExhibitIds(before,after);
  const undo=rebaseExhibitHistory(before,latest,ids);
  assert.deepEqual(undo.instances.map(x=>x.x),[99,10,25]);
  latest.instances[1].visible=false;
  assert.equal(rebaseExhibitHistory(before,latest,ids).instances[1].visible,false);
});

test('managed change callback data retains yaw and both floor coordinates',()=>{
  const before=layout([item('E_A-1',10,{managed:true})]);
  const after=clone(before);Object.assign(after.instances[0],{x:13,z:-40,y:13.2,floorY:13.2,rotationY:Math.PI/2});
  assert.deepEqual(managedExhibitChanges(before,after),[{id:'E_A-1::1',position:{x:13,z:-40,y:13.2,yaw:Math.PI/2,floorId:'upper'}}]);
});

const domModule=process.env.PARK_HAPPY_DOM_MODULE;
test('3D editor restores old layouts, publishes accepted changes and keeps added copies in undo', {skip:!domModule}, async()=>{
  const {Window}=await import(pathToFileURL(domModule).href);
  const window=new Window({url:'https://fazafilms.ru/review/park-vpechatleniy/tour/'});
  const previous={};
  for(const key of ['window','document','localStorage','CustomEvent','HTMLElement','requestAnimationFrame','cancelAnimationFrame','AbortController']){previous[key]=globalThis[key];globalThis[key]=typeof window[key]==='function'&&/AnimationFrame/.test(key)?window[key].bind(window):window[key];}
  const html=await readFile(new URL('./index.html',import.meta.url),'utf8');
  window.document.body.innerHTML=html;
  const scene=new THREE.Scene(),group=new THREE.Group();scene.add(group);
  const rows=[item('O12-1',1),item('E_A-1',10,{managed:true})], roots=new Map();
  const rootFor=row=>{if(!roots.has(row.instanceId)){const r=new THREE.Group();r.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial()));group.add(r);roots.set(row.instanceId,r);}const r=roots.get(row.instanceId);r.position.set(row.x,row.y,row.z);r.rotation.y=row.rotationY;r.visible=row.visible;return r;};rows.forEach(rootFor);
  const expose=row=>row?{...clone(row),name:row.instanceId==='O12-1'?'Ледокол':'Интерактив',zone:'РГО',ordinal:1,copies:1,dimensions:[1,1,1],originalDimensions:[1,1,1],modified:true}:null;
  const system={group,
    isManagedInstance:id=>Boolean(rows.find(row=>row.instanceId===id)?.equipmentPlanId),
    getInstance:id=>expose(rows.find(row=>row.instanceId===id)),getInstanceRoot:id=>roots.get(id),listInstances:()=>rows.map(expose),getLayout:()=>layout(clone(rows)),
    updateInstance(id,patch,options={}){const row=rows.find(row=>row.instanceId===id);Object.assign(row,patch);if(options.floorY!==undefined)row.y=row.floorY=options.floorY;rootFor(row);return {ok:true,instance:expose(row)};},
    applyLayout(next){if(next.instances.length!==rows.length)return {ok:false,error:'count'};for(const row of rows){Object.assign(row,next.instances.find(x=>x.instanceId===row.instanceId));rootFor(row);}return {ok:true};},
    resetLayout(){return {ok:true};},pickFloor(){return null;},
  };
  const storageKey='park-exhibit-layout-v3-exhibition-20261125';
  window.localStorage.setItem(storageKey,JSON.stringify(layout([item('O12-1',5),item('E_A-1',-8)])));
  const changes=[], editor=createExhibitEditor({system,scene,camera:new THREE.PerspectiveCamera(),controls:{enabled:true},domElement:window.document.querySelector('canvas'),deferRestore:true,
    validateManagedChange:(_id,p)=>p.x>20?{ok:false,error:'Оборудование выходит за границу зоны'}:{ok:true},onManagedChange:(id,p)=>changes.push({id,p})});
  try{
    assert.equal(editor.restoreSavedLayout().ok,true);
    assert.equal(rows[0].x,5);assert.equal(rows[1].x,10);
    editor.selectInstance('E_A-1',{focus:false});
    const doc=window.document;
    doc.getElementById('editor-x').value='12';doc.getElementById('editor-angle').value='90';
    doc.getElementById('editor-transform').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
    assert.equal(rows[1].x,12);assert.equal(rows[1].rotationY,Math.PI/2);assert.equal(changes.length,1);
    assert.equal(changes[0].id,'E_A-1::1');
    assert.deepEqual(JSON.parse(window.localStorage.getItem(storageKey)).instances.map(x=>x.instanceId),['O12-1']);
    doc.getElementById('editor-x').value='21';doc.getElementById('editor-transform').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
    assert.equal(rows[1].x,12);assert.equal(changes.length,1);assert.equal(editor.getState().undoDepth,1);
    rows.push(item('EQ_NEW-1',17,{managed:true}));rootFor(rows.at(-1));editor.refresh();
    assert.ok(doc.querySelector('option[value="EQ_NEW-1"]'));
    doc.getElementById('editor-undo').click();
    assert.equal(rows[1].x,10);assert.equal(rows[2].x,17);assert.equal(changes.length,2);
    doc.getElementById('editor-redo').click();assert.equal(rows[1].x,12);assert.equal(changes.length,3);
    rows[2].visible=false;editor.refresh();assert.equal(doc.querySelector('option[value="EQ_NEW-1"]'),null);
    assert.equal(doc.getElementById('editor-scale').disabled,true);
  }finally{editor.dispose();window.happyDOM.abort();for(const [key,value]of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
