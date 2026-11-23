import * as THREE from '../interactives/vendor/three-0.180/three.module.min.js';

const SOURCE_URL = new URL('./assets/entrance-screen-source.json?v=1', import.meta.url);
const TITLES = ['Начало путешествия', 'Отправная точка — Москва', 'Города Золотого кольца', 'Рождение маршрута', 'Билет путешественника', 'В путь'];
const STORIES = [
  'Сначала — первый взгляд. Затем — история, города, ремёсла и своё путешествие.',
  'Из Москвы начинается знакомство с городами, их историями и людьми.',
  'Каждый город открывает собственную историю. Вместе они образуют большой маршрут.',
  'Авторское путешествие по старинным городам стало рассказом, связавшим их в Золотое кольцо.',
  'В концепции гость собирает штампы впечатлений, чтобы в финале выбрать своё путешествие.',
  'Исследуйте павильон. Нажимайте на предметы, чтобы запустить их истории.'
];
const CITIES = [
  ['Тверь',.17,.27],['Сергиев Посад',.12,.64],['Переславль',.31,.48],
  ['Ростов',.40,.28],['Ярославль',.53,.16],['Кострома',.74,.28],
  ['Иваново',.80,.50],['Суздаль',.61,.69],['Владимир',.45,.79],['Нижний Новгород',.90,.78]
];
const smooth = x => {x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
function wrapped(ctx,text,x,y,width,lineHeight) {
  const words=text.split(/\s+/);let line='';let row=0;
  for(const word of words){const next=line?line+' '+word:word;if(ctx.measureText(next).width>width&&line){ctx.fillText(line,x,y+row*lineHeight);row++;line=word;}else line=next;}
  if(line)ctx.fillText(line,x,y+row*lineHeight);return row+1;
}
/** Split the four proven source triangles. No guessed rectangle or wall overlay. */
export function extractEntranceSurface(model,source) {
  model.updateMatrixWorld(true);
  const native=source.positionsWorldGLB.map(p=>new THREE.Vector3(...p));
  const found=[],world=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  let area=0,maxError=0;
  model.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.geometry?.index||!/^Pavilion_/.test(mesh.name))return;
    const geometry=mesh.geometry,position=geometry.attributes.position,index=geometry.index;
    const matched=new Map();
    for(let i=0;i<position.count;i++){
      world.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
      // Native vertex matching, then topology/count/area assertions below.
      if(Math.abs(world.x-source.center[0])>.008)continue;
      let closest=-1,error=Infinity;
      native.forEach((p,k)=>{const e=p.distanceTo(world);if(e<error){error=e;closest=k;}});
      if(error<.008)matched.set(i,{native:closest,error,world:world.clone()});
    }
    if(matched.size<3)return;
    const triangles=[];
    for(let i=0;i<index.count;i+=3){
      const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];
      if(!ids.every(id=>matched.has(id)))continue;
      const points=ids.map(id=>matched.get(id));
      if(new Set(points.map(p=>p.native)).size!==3)continue;
      a.copy(points[0].world);b.copy(points[1].world).sub(a);c.copy(points[2].world).sub(a);
      area+=b.cross(c).length()*.5;maxError=Math.max(maxError,...points.map(p=>p.error));
      triangles.push({offset:i,points});
    }
    if(triangles.length)found.push({mesh,triangles});
  });
  const count=found.reduce((n,f)=>n+f.triangles.length,0);
  if(count!==source.expectedExportTriangles||Math.abs(area-source.expectedArea)>.035)
    throw new Error('Entrance source selection mismatch: '+JSON.stringify({count,area,expected:source.expectedArea}));
  const positions=[],uvs=[];
  const z0=source.min[2],z1=source.max[2],y0=source.min[1],y1=source.max[1];
  for(const {mesh,triangles} of found){
    const removed=new Set(triangles.map(t=>t.offset)),old=mesh.geometry,next=[];
    const groups=[];
    for(const group of old.groups.length?old.groups:[{start:0,count:old.index.count,materialIndex:0}]){
      const start=next.length;
      for(let i=group.start;i<group.start+group.count;i+=3)if(!removed.has(i))next.push(old.index.getX(i),old.index.getX(i+1),old.index.getX(i+2));
      if(next.length>start)groups.push({start,count:next.length-start,materialIndex:group.materialIndex});
    }
    const replacement=old.clone();replacement.setIndex(next);replacement.clearGroups();for(const group of groups)replacement.addGroup(group.start,group.count,group.materialIndex);replacement.computeBoundingBox();replacement.computeBoundingSphere();
    mesh.geometry=replacement;old.dispose();
    for(const triangle of triangles)for(const p of triangle.points){
      positions.push(...p.world.toArray());uvs.push((z1-p.world.z)/(z1-z0),(p.world.y-y0)/(y1-y0));
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.computeVertexNormals();geometry.computeBoundingSphere();
  return {geometry,report:{sourceObject:source.name,nativeTriangles:source.expectedTriangles,sourceTriangles:count,selectedArea:area,maxVertexError:maxError,sourceMeshes:found.map(f=>f.mesh.name),method:'native vertices + exported topology + area',sourcePreserved:true}};
}
export async function installEntranceScreen({model,renderer}) {
  const response=await fetch(SOURCE_URL);if(!response.ok)throw new Error('Entrance source metadata HTTP '+response.status);
  const source=await response.json(),{geometry,report}=extractEntranceSurface(model,source);
  const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=Math.round(2048/(6.50028/4.5));const ctx=canvas.getContext('2d');
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  const material=new THREE.MeshBasicMaterial({name:'EntrancePrologueContent',map:texture,toneMapped:false,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(geometry,material);mesh.name='SourceEntrancePrologue_Object174075923';mesh.userData={entranceScreen:true,sourceDisplayId:'entrance-prologue',sourceObject:source.name};mesh.castShadow=false;model.add(mesh);
  const state={running:false,paused:false,elapsed:0,ambient:0,chapter:0,playCount:0,drawCount:0};let lastFrame=-1;
  function draw(force=false){
    const time=state.running?state.elapsed:state.ambient*.35;
    const frame=Math.floor(time*18);if(!force&&frame===lastFrame)return;lastFrame=frame;
    const W=canvas.width,H=canvas.height;
    const chapter=state.running?Math.min(5,Math.floor(state.elapsed/6)):0;state.chapter=chapter;
    const local=state.running?(state.elapsed%6)/6:(state.ambient%18)/18;
    const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#102d2b');bg.addColorStop(1,'#193e38');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='rgba(221,186,112,.3)';ctx.lineWidth=3;ctx.strokeRect(54,54,W-108,H-108);
    ctx.fillStyle='#d9b56e';ctx.font='600 38px Arial,sans-serif';ctx.fillText('ЗОЛОТОЕ КОЛЬЦО РОССИИ',110,135);
    ctx.fillStyle='#f4ecd6';ctx.font='600 102px Georgia,serif';wrapped(ctx,state.running?TITLES[chapter]:'Больше, чем маршрут',110,266,W-220,118);
    const ox=126,oy=430,mw=W-250,mh=H-700;
    ctx.save();ctx.translate(ox,oy);
    const reveal=state.running?(chapter===1?.15:chapter===2?smooth(local):chapter>=3?1:.55):.85;
    ctx.strokeStyle='rgba(220,184,108,.18)';ctx.lineWidth=5;ctx.beginPath();
    const order=[1,2,3,4,5,6,7,8,1];order.forEach((n,i)=>{const p=CITIES[n];i?ctx.lineTo(p[1]*mw,p[2]*mh):ctx.moveTo(p[1]*mw,p[2]*mh);});ctx.stroke();
    ctx.strokeStyle='#e0bd76';ctx.lineWidth=7;ctx.beginPath();const route=order.length-1,visible=reveal*route;
    for(let i=0;i<=Math.floor(visible);i++){const p=CITIES[order[Math.min(i,route)]];i?ctx.lineTo(p[1]*mw,p[2]*mh):ctx.moveTo(p[1]*mw,p[2]*mh);}
    if(visible<route){const i=Math.floor(visible),p=CITIES[order[i]],n=CITIES[order[i+1]],t=visible-i;ctx.lineTo((p[1]+(n[1]-p[1])*t)*mw,(p[2]+(n[2]-p[2])*t)*mh);}ctx.stroke();
    for(let i=0;i<CITIES.length;i++){
      const [title,x,y]=CITIES[i],lit=!state.running||chapter>=3||chapter===2&&local>(i/12);
      const px=x*mw,py=y*mh;
      ctx.fillStyle=lit?'#efd293':'#47635a';ctx.beginPath();ctx.arc(px,py,lit?12:8,0,Math.PI*2);ctx.fill();
      if(lit){ctx.strokeStyle='rgba(239,210,147,.4)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(px,py,21+Math.sin(time*2+i)*3,0,Math.PI*2);ctx.stroke();}
      ctx.fillStyle=lit?'#f4ecd6':'#8b9a8c';ctx.font='500 38px Arial,sans-serif';ctx.textAlign='center';ctx.fillText(title,px,py-31);
    }
    if(chapter===1){ctx.fillStyle='#efd293';ctx.font='600 80px Georgia,serif';ctx.textAlign='left';ctx.fillText('Москва',mw*.07,mh*.93);}
    ctx.restore();ctx.textAlign='left';
    ctx.fillStyle='#dce1cf';ctx.font='38px Arial,sans-serif';wrapped(ctx,STORIES[chapter],110,H-245,W-220,51);
    ctx.fillStyle='#d9b56e';ctx.font='500 31px Arial,sans-serif';ctx.fillText(state.running?'ПРОЛОГ · '+(chapter+1)+' / 6':'НАЖМИТЕ НА ЭКРАН — НАЧАТЬ ПУТЕШЕСТВИЕ',110,H-87);
    if(state.running){ctx.fillStyle='rgba(226,194,125,.22)';ctx.fillRect(110,H-60,W-220,5);ctx.fillStyle='#e3c27b';ctx.fillRect(110,H-60,(W-220)*state.elapsed/36,5);}
    texture.needsUpdate=true;state.drawCount++;
  }
  draw(true);
  return {
    mesh, surface:{id:'entrance-prologue',mesh,zoneId:'prologue',kind:'entrance-prologue',title:'Входной экран · Пролог',description:'Шесть сцен по концепции: от первого взгляда до начала путешествия. Нажмите на экран, чтобы запустить.',aspect:6.50028/4.5,sourceObject:source.name,UVorientation:'v-up',camera:{position:[39,2.7,3.2],target:source.center,fov:64}},
    start(){state.running=true;state.paused=false;state.elapsed=0;state.playCount++;draw(true);},
    setPaused(value){state.paused=!!value;},
    update(dt){if(state.paused)return;state.ambient+=dt;if(state.running){state.elapsed=Math.min(36,state.elapsed+dt);if(state.elapsed>=36){state.running=false;state.elapsed=0;}}draw();},
    snapshot:()=>({...report,...state,enabled:true,title:TITLES[state.chapter],sourcePages:'7–12',contentType:'web adaptation of customer prologue'}),
    dispose(){model.remove(mesh);geometry.dispose();material.dispose();texture.dispose();}
  };
}
