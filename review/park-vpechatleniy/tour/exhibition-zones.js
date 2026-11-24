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

export function createIcebreakerEnvironment({panoramaUrl='assets/zones/arctic-aurora-panorama.webp',layout}={}){
  if(!layout?.ship||!layout?.led||!layout?.iceIsland)throw new Error('Не загружена согласованная схема «Лидера».');
  const group=new THREE.Group();group.name='Арктика · льды и северное сияние';
  const parts=[],pickables=[],ship=layout.ship,yaw=ship.rotationY,c=Math.cos(yaw),s=Math.sin(yaw);
  const local=([x,y,z])=>[c*(x-ship.x)-s*(z-ship.z),y-ship.y,s*(x-ship.x)+c*(z-ship.z)];
  const rings=layout.iceIsland.geometry.coordinates.map(r=>r.map(([x,z])=>{const p=local([x,ship.y,z]);return [p[0],p[2]];}));
  const hull=layout.ship.footprint.coordinates[0].map(([x,z])=>{const p=local([x,ship.y,z]);return [p[0],p[2]];});
  const inside=(x,z,p)=>{let found=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>z)!==(p[j][1]>z)&&x<(p[j][0]-p[i][0])*(z-p[i][1])/(p[j][1]-p[i][1])+p[i][0])found=!found;return found;};
  const water=new THREE.MeshStandardMaterial({color:0x21658b,metalness:.24,roughness:.25});
  const iceMaterial=new THREE.MeshPhysicalMaterial({color:0xbceaf6,roughness:.32,metalness:.04,transparent:true,opacity:.98});
  const dark=new THREE.MeshStandardMaterial({color:0x102534,roughness:.6});
  const glow=new THREE.MeshBasicMaterial({color:0x73d6f4,toneMapped:false});
  const shape=new THREE.Shape(rings[0].map(([x,z])=>new THREE.Vector2(x,-z)));
  for(const ring of rings.slice(1))shape.holes.push(new THREE.Path(ring.map(([x,z])=>new THREE.Vector2(x,-z))));
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:layout.iceIsland.height,bevelEnabled:false,steps:1});geometry.rotateX(-Math.PI/2);
  const floor=new THREE.Mesh(geometry,water);floor.position.y=layout.iceIsland.baseY-ship.y;floor.name='Ледовый остров по контуру зоны СЗФО';group.add(floor);
  const top=floor.position.y+layout.iceIsland.height;
  for(const ring of rings)for(let i=1;i<ring.length;i++){
    const a=ring[i-1],b=ring[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<.02)continue;
    group.add(tubeBetween([a[0],top+.015,a[1]],[b[0],top+.015,b[1]],.014,glow,5));
    parts.push({id:'Кромка ледового острова '+parts.length,min:[-length/2,0,-.06],max:[length/2,.25,.06],position:[(a[0]+b[0])/2,floor.position.y,(a[1]+b[1])/2],rotationY:-Math.atan2(b[1]-a[1],b[0]-a[0]),socialTarget:false});
  }
  const bounds=new THREE.Box2().setFromPoints(rings[0].map(p=>new THREE.Vector2(...p))),random=seeded(2030),positions=[];
  for(let attempt=0;attempt<18000&&positions.length<160;attempt++){
    const x=bounds.min.x+random()*(bounds.max.x-bounds.min.x),z=bounds.min.y+random()*(bounds.max.y-bounds.min.y),size=.06+random()*.07;
    if(!inside(x,z,rings[0])||rings.slice(1).some(p=>inside(x,z,p))||inside(x,z,hull))continue;
    if(![[-size,-size],[-size,size],[size,-size],[size,size]].every(([dx,dz])=>inside(x+dx,z+dz,rings[0])))continue;
    positions.push({x,z,size,angle:random()*Math.PI*2});
  }
  const ice=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),iceMaterial,positions.length),matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion();
  positions.forEach((p,i)=>{rotation.setFromEuler(new THREE.Euler(.15,p.angle,.2));matrix.compose(new THREE.Vector3(p.x,top+.015,p.z),rotation,new THREE.Vector3(p.size,p.size*.45,p.size));ice.setMatrixAt(i,matrix);});ice.instanceMatrix.needsUpdate=true;group.add(ice);
  const led=layout.led,centre=local(led.center),angle=led.rotationY-yaw;
  const frame=new THREE.Mesh(new THREE.BoxGeometry(led.width,led.height,led.thickness-.01),dark);frame.position.fromArray(centre);frame.rotation.y=angle;frame.name='LED-фон «Полярные льды и северное сияние»';group.add(frame);
  const image=new THREE.TextureLoader().load(panoramaUrl);image.colorSpace=THREE.SRGBColorSpace;
  const cover=(led.width-.12)/(led.height-.12)/3;image.repeat.set(cover,1);image.offset.set((1-cover)/2,0);
  const face=new THREE.Mesh(new THREE.PlaneGeometry(led.width-.12,led.height-.12),new THREE.MeshBasicMaterial({map:image,side:THREE.DoubleSide,toneMapped:false}));face.position.fromArray(centre);face.rotation.y=angle;face.translateZ(led.thickness/2-.001);group.add(face);
  parts.push({id:'Арктическая LED-медиапанорама',min:[-led.width/2,-led.height/2,-led.thickness/2],max:[led.width/2,led.height/2,led.thickness/2],position:centre,rotationY:angle});
  for(const z of [-4,4]){const light=new THREE.PointLight(0x67c7ef,5,7,2);light.position.set(1.6,1.8,z);group.add(light);}
  const overviewPose={position:local([8,13.0,30]),target:local([-7.5,9.6,42]),fov:51};
  let time=0;
  return {group,pickables,getCollisionParts:()=>parts,overviewPose,interiorPose:overviewPose,
    update(dt){time+=Math.max(0,dt);water.roughness=.24+Math.sin(time*.5)*.025;return dt>0;},
    getState:()=>({iceBlocks:positions.length,panoramas:1,ledSizeMetres:[led.width,led.height],iceIslandSquareMetres:layout.iceIsland.area,sourceZone:'northwest-main',screenContent:'Полярные льды и северное сияние',originalGLBUnchanged:true}),
    dispose(){group.removeFromParent();const gs=new Set(),ms=new Set(),ts=new Set();group.traverse(node=>{if(node.geometry)gs.add(node.geometry);for(const m of Array.isArray(node.material)?node.material:[node.material])if(m){ms.add(m);if(m.map)ts.add(m.map);}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());},
  };
}
