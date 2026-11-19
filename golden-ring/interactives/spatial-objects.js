import { GLTFLoader } from './vendor/three-0.180/GLTFLoader.js';

const definitions={
  barge:['Такелажный блок',[1.93,.24,-.42]],
  glass:['Образцы выдувного стекла',[.17,1.08,-.16]],
  regional:['Оконный шпингалет',[-1.76,1.05,-2.933]],
  bells:['Бронзовый колокол',[2.49,1.70,-.448]],
  craft:['Кисть и чашечки с краской',[-2.27,1.03,-.12]],
  passport:['Штамп путешественника',[-2.43,1.025,-.22]],
  loom:['Челнок с катушкой',[-2.45,1.10,.04]],
  soundmap:['Направленный динамик',[1.20,1.042,-.97]],
  shadow:['Фигурки театра теней',[-1.23,.97,1.12]]
};
const benches=new Set(['passport','soundmap','bells','shadow']);
let collection,bench;
function load(name){
  return new GLTFLoader().loadAsync(new URL('art/'+name+'.glb',import.meta.url).href).then(result=>{
    result.scene.traverse(node=>{
      if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}
    });
    return result.scene;
  });
}
export function objectName(id){return definitions[id][0];}
export function loadObjects(){return collection ||= load('exhibit-objects');}

export function stageObjects(scene){
  let installation=null,seat=null,loading=false,pendingSeat=false;
  let active;
  const ready=()=>window.dispatchEvent(new Event('ringtexture'));
  return function place(geometry,settings){
    const id=geometry.sceneId, spec=definitions[id];
    if(!spec)return {object:false,bench:false};
    if(!installation && !loading){
      loading=true;
      loadObjects().then(root=>{installation=root.clone(true);scene.add(installation);ready();}).catch(()=>{});
    }
    if(benches.has(id) && !seat && !pendingSeat && settings.gallery){
      pendingSeat=true;
      (bench ||= load('visitor-bench')).then(root=>{
        seat=root.clone(true);
        seat.position.set(-5.78,0,.92);seat.rotation.y=Math.PI/2;
        scene.add(seat);ready();
      }).catch(()=>{});
    }
    if(installation){
      if(active?.name!==id){
        installation.children.forEach(node=>{node.visible=node.name===id;});
        active=installation.getObjectByName(id);
      }
      active?.position.fromArray(id==='loom'&&geometry.shuttlePosition?geometry.shuttlePosition:spec[1]);
    }
    if(seat)seat.visible=Boolean(settings.gallery && benches.has(id));
    return {object:Boolean(active),bench:Boolean(seat?.visible)};
  };
}
