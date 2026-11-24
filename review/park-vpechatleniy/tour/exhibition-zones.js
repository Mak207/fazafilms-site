import * as THREE from 'three';

// Exhibition design drawn from the three supplied references. All dimensions
// below are explicit working choices in metres, not extracted survey dimensions.
export const ZONE_PALETTE = Object.freeze({
  wood: '#795033', woodLight: '#a87e52', floor: '#a99c86', light: '#ffe2ad',
  arctic: '#4cb8ed', stone: '#c6af87', glass: '#bed9dc', dark: '#17282f',
});

function canvasTexture(width, height, draw) {
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d');draw(context,width,height);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=4;return {canvas,context,texture};
}
function textTexture(title, subtitle='', options={}) {
  return canvasTexture(options.width||1024,options.height||512,(c,w,h)=>{
    c.fillStyle=options.background||'#17282f';c.fillRect(0,0,w,h);
    if(options.draw)options.draw(c,w,h);
    c.textAlign='left';c.fillStyle=options.color||'#fff3db';
    c.font=`500 ${Math.round(h*.13)}px Georgia,serif`;c.fillText(title,w*.07,h*.29,w*.86);
    c.font=`400 ${Math.round(h*.068)}px Arial,sans-serif`;
    String(subtitle).split('\n').slice(0,5).forEach((line,i)=>c.fillText(line,w*.07,h*(.47+i*.105),w*.86));
    c.fillStyle=options.accent||'#b9d9db';c.fillRect(w*.07,h*.85,w*.19,Math.max(2,h*.008));
  }).texture;
}
function boxPart(id,center,size){return {id,min:center.map((v,i)=>v-size[i]/2),max:center.map((v,i)=>v+size[i]/2)};}
function seeded(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function woodMaterial(){
  const {texture}=canvasTexture(512,512,(c,w,h)=>{
    c.fillStyle='#89603e';c.fillRect(0,0,w,h);const random=seeded(34);
    for(let i=0;i<550;i++){
      const y=random()*h;c.strokeStyle=`rgba(${random()>.5?'50,25,10':'222,178,112'},${.025+random()*.12})`;c.lineWidth=.4+random()*2;
      c.beginPath();c.moveTo(0,y);for(let x=0;x<=w;x+=16)c.lineTo(x,y+Math.sin(x*.018+i)*random()*4);c.stroke();
    }
    for(let y=0;y<h;y+=64){c.fillStyle='rgba(24,13,5,.16)';c.fillRect(0,y,w,1);}
  });
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(2,2);
  return new THREE.MeshStandardMaterial({map:texture,color:0xb39069,roughness:.58,metalness:.02});
}
function tubeBetween(a,b,radius,material,segments=8){
  const direction=new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,direction.length(),segments),material);
  mesh.position.fromArray(a).addScaledVector(direction,.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());return mesh;
}
function normalise(source, longest, {x=0,y=0,z=0,rotationY=0,maxDimensions=null}={}){
  const content=source.clone(true);content.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(content,true);
  const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  const factor=Math.min(longest/Math.max(size.x,size.y,size.z),...(maxDimensions?maxDimensions.map((v,i)=>v/size.getComponent(i)):[]));
  const holder=new THREE.Group(),offset=new THREE.Group();offset.scale.setScalar(factor);
  offset.position.set(-center.x*factor,-box.min.y*factor,-center.z*factor);offset.add(content);holder.add(offset);
  holder.position.set(x,y,z);holder.rotation.y=rotationY;holder.userData.assetPlacement={factor,longest};return holder;
}
function localBoxPart(root,id){root.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(root,true);return {id,min:b.min.toArray(),max:b.max.toArray()};}
export async function loadZoneAssets(loader,manifestUrl='assets/zones/manifest.json'){
  const address=new URL(manifestUrl,document.baseURI);
  const response=await fetch(address,{cache:'no-store'});if(!response.ok)throw new Error('Не загружен реестр новых моделей: '+response.status);
  const manifest=await response.json(),models=new Map(),errors=[];
  await Promise.all(manifest.objects.map(async entry=>{
    try{
      const high=new URLSearchParams(location.search).get('quality')==='high';
      const gltf=await new Promise((resolve,reject)=>loader.load(new URL(high&&entry.highUrl?entry.highUrl:entry.url,address).href,resolve,undefined,reject));
      if(!gltf.scene?.isObject3D)throw new Error('Пустая GLB');models.set(entry.id,gltf.scene);
    }catch(error){errors.push({id:entry.id,error:error.message||String(error)});}
  }));
  return {models,manifest,errors};
}

export {canvasTexture,textTexture,woodMaterial,tubeBetween,normalise,boxPart,localBoxPart};

export function createIcebreakerEnvironment({panoramaUrl='assets/zones/arctic-panorama.webp'}={}){
  const group=new THREE.Group();group.name='Арктическая среда «Лидера»';
  const parts=[],pickables=[];
  const water=new THREE.MeshStandardMaterial({color:0x174f75,metalness:.2,roughness:.23});
  const iceMaterial=new THREE.MeshPhysicalMaterial({color:0xa7def2,roughness:.34,metalness:.05,transparent:true,opacity:.96});
  const dark=new THREE.MeshStandardMaterial({color:0x162c3a,roughness:.7});
  const glow=new THREE.MeshBasicMaterial({color:0x58cbf9,toneMapped:false});
  const floor=new THREE.Mesh(new THREE.BoxGeometry(9.6,.12,28),water);floor.position.y=.03;group.add(floor);
  parts.push(boxPart('Ледовый остров',[0,.42,0],[9.6,.84,28]));
  const ice=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),iceMaterial,210);const random=seeded(2030),matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion();
  for(let i=0;i<210;i++){
    let x,z;for(let j=0;j<30;j++){x=(random()-.5)*9.3;z=(random()-.5)*27.4;if(Math.abs(x)>3.25||Math.abs(z)>12.5)break;}
    const size=.25+random()*.6;rotation.setFromEuler(new THREE.Euler(random(),random()*6.28,random()));
    matrix.compose(new THREE.Vector3(x,.12+size*.12,z),rotation,new THREE.Vector3(size,size*.28,size*1.3));ice.setMatrixAt(i,matrix);
  }ice.instanceMatrix.needsUpdate=true;group.add(ice);
  const image=new THREE.TextureLoader().load(panoramaUrl);image.colorSpace=THREE.SRGBColorSpace;
  const panoramaMaterial=new THREE.MeshBasicMaterial({map:image,side:THREE.DoubleSide,toneMapped:false});
  function screen(name,center,size,yaw){
    const frame=new THREE.Mesh(new THREE.BoxGeometry(size[0]+.12,size[1]+.12,.16),dark);frame.position.fromArray(center);frame.rotation.y=yaw;group.add(frame);
    const plane=new THREE.Mesh(new THREE.PlaneGeometry(...size),panoramaMaterial);plane.position.fromArray(center);plane.rotation.y=yaw;plane.translateZ(.087);plane.name=name;group.add(plane);
    const horizontal=[Math.abs(Math.cos(yaw))*size[0]+.18, size[1]+.12,Math.abs(Math.sin(yaw))*size[0]+.18];parts.push(boxPart(name,center,horizontal));
  }
  // Screen faces the public side. The open west edge retains the existing bridge.
  screen('Арктическая медиапанорама',[-5.25,3.8,0],[28.5,6.4],Math.PI/2);
  screen('Северное сияние',[0,3.8,14.35],[10.6,6.4],Math.PI);
  for(const z of [-10,0,10]){const light=new THREE.PointLight(0x2a92ef,11,10,2);light.position.set(4.2,2,z);group.add(light);}
  // Low museum barrier is a visual separation from the ice island, not a fall guard.
  const glass=new THREE.MeshPhysicalMaterial({color:0xa9dcf1,transparent:true,opacity:.18,roughness:.15,depthWrite:false,side:THREE.DoubleSide});
  const rail=new THREE.Mesh(new THREE.BoxGeometry(.035,.95,27.4),glass);rail.position.set(4.9,.5,0);group.add(rail);parts.push(boxPart('Кромка ледового острова',[4.9,.5,0],[.1,1,27.4]));
  for(let z=-13;z<=13;z+=2){const post=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,1,8),dark);post.position.set(4.92,.5,z);group.add(post);}
  group.add(tubeBetween([4.92,1,-13.6],[4.92,1,13.6],.025,dark));
  for(const z of [-5,5]){
    const panel=new THREE.Mesh(new THREE.BoxGeometry(.1,.8,2.6),dark);panel.position.set(4.98,.65,z);group.add(panel);
    const texture=textTexture('«ЛИДЕР»','Атомный ледокол\nСеверный морской путь',{width:1200,height:420,background:'#0b1d2d',accent:'#4dc7fb'});
    const face=new THREE.Mesh(new THREE.PlaneGeometry(2.5,.76),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));face.rotation.y=Math.PI/2;face.position.set(5.04,.65,z);group.add(face);
  }
  let time=0;
  return {group,pickables,getCollisionParts:()=>parts,
    update(dt){time+=Math.max(0,dt);water.roughness=.22+Math.sin(time*.5)*.025;return dt>0;},
    getState:()=>({iceBlocks:210,panoramas:2,informationPanels:2,iceIsland:[9.6,28],reference:'supplied-lider-image'}),
    overviewPose:{position:[23,15,-28],target:[0,3,0]},interiorPose:{position:[18,9,-22],target:[0,3,0]},
  };
}
