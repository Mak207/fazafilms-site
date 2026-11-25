import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {registerHooks} from 'node:module';
import {readFile} from 'node:fs/promises';
const {Window}=process.env.PARK_HAPPY_DOM_MODULE?await import(pathToFileURL(process.env.PARK_HAPPY_DOM_MODULE).href):await import('happy-dom');
const threeUrl=new URL('../../../golden-ring/interactives/vendor/three-0.180/three.module.min.js',import.meta.url).href;
registerHooks({resolve(specifier,context,nextResolve){return specifier==='three'?{url:threeUrl,shortCircuit:true}:nextResolve(specifier,context);}});
const THREE=await import('three');
const {createExhibitSystem}=await import('./exhibits.js');
const {createExhibitionZones}=await import('./zones-controller.js');
import {getInstances,createDefaultState} from '../installations/equipment-model.js';
import {prepareEquipmentGeometry,layoutEquipment} from '../installations/equipment-map.js';
const dir=fileURLToPath(new URL('../',import.meta.url));
// This is a scene-graph integration test, not a browser/rendering or CAD survey.
// Actual module/data paths are used; asset geometry and floors are controlled fixtures.
test('all 99 planned assemblies boot once and detached media leaves no host collision ghosts',async()=>{
const previous=new Map(['window','document','location','history','matchMedia','CustomEvent','Image','fetch'].map(k=>[k,globalThis[k]]));
const window=new Window({url:'https://test.invalid/review/park-vpechatleniy/tour/'});
globalThis.window=window;globalThis.document=window.document;globalThis.location=window.location;globalThis.history=window.history;globalThis.matchMedia=()=>({matches:false});globalThis.CustomEvent=window.CustomEvent;globalThis.Image=class{set src(v){}get complete(){return false;}};
window.HTMLCanvasElement.prototype.getContext=function(){return new Proxy({canvas:this,createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),measureText:()=>({width:100})},{get(o,k){return k in o?o[k]:(()=>{});},set(o,k,v){o[k]=v;return true;}})};
document.body.innerHTML=(await readFile(dir+'tour/index.html','utf8')).match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
globalThis.fetch=async url=>{const pathname=new URL(url,location.href).pathname;const file=dir+pathname.replace('/review/park-vpechatleniy/','');try{const text=await readFile(file,'utf8');return {ok:true,json:async()=>JSON.parse(text)}}catch(e){throw Error('fetch '+file+': '+e.message)}};
const scene=new THREE.Scene(),floors=[7.2,13.2].map(y=>{const f=new THREE.Mesh(new THREE.PlaneGeometry(400,400),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));f.name='A-FLOR-test';f.rotation.x=-Math.PI/2;f.position.y=y;scene.add(f);f.updateMatrixWorld(true);return f;});
const loader={load(url,done){const r=new THREE.Group();const body=new THREE.Mesh(new THREE.BoxGeometry(2,1,2),new THREE.MeshStandardMaterial());body.position.y=.5;r.add(body);done({scene:r});}};
const exhibits=await createExhibitSystem({scene,loader,sourceMeshes:floors,manifestUrl:'assets/exhibits/manifest.json'});
const zones=await createExhibitionZones({exhibits,loader,camera:new THREE.PerspectiveCamera()});
const read=async p=>JSON.parse(await readFile(dir+p,'utf8'));
const data=await read('installations/equipment-data.json'),state=createDefaultState(data);
const geometry=prepareEquipmentGeometry({zones:await read('tour/assets/zones/source-zones.json'),colors:await read('tour/assets/zones/floor-colors.json'),world:await read('tour/crowd/data/park-world.json'),floorShapes:await read('installations/engineering/placement-frontal.json'),placements:await read('tour/assets/zones/placements-final.json'),rgo:await read('tour/assets/zones/rgo-layout.json'),manifest:await read('tour/assets/exhibits/manifest.json')});
const report=layoutEquipment(getInstances(data,state),geometry,{data});
const result=zones.setEquipmentPlan({data,state,report});
assert.equal(result.ok,true);assert.equal(result.placed,99);assert.equal(zones.equipmentPlanState().count,99);
assert.equal(exhibits.listInstances().filter(x=>x.managedEquipment&&x.visible).length,99);
assert.equal(new Set(exhibits.listInstances().filter(x=>x.managedEquipment).map(x=>x.equipmentPlanId)).size,99);
assert.ok(!exhibits.getInstanceRoot('Z02-1').userData.collisionParts.some(x=>/:control$/.test(x.id)));
assert.ok(!exhibits.getInstanceRoot('O16-1').userData.collisionParts.some(x=>/chersonesus-interior:(?:case-|vr-bay-|panorama-wall|information-)/.test(x.id)));
assert.ok(!exhibits.getInstanceRoot('O12-1').userData.collisionParts.some(x=>/LED/.test(x.id)));
const sourceIds=new Map(data.groups.flatMap(g=>g.seedInstances.map((s,i)=>[s.sourceId,`${g.id}::${i+1}`])));
for(const [source,planId]of sourceIds){const instance=exhibits.listInstances().find(x=>x.equipmentPlanId===planId);assert.ok(instance,source);}
const poses=zones.equipmentPlanState().items;for(const row of report.placed){const live=poses.find(x=>x.id===row.id);assert.ok(Math.abs(live.position.x-row.position.x)<1e-6);assert.ok(Math.abs(live.position.z-row.position.z)<1e-6);assert.ok(Math.abs(live.position.yaw-row.position.yaw)<1e-6);}
zones.dispose();exhibits.dispose();
await window.happyDOM.abort();
for(const [k,v]of previous){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}
});
