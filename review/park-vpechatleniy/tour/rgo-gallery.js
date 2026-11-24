import * as THREE from 'three';
import {canvasTexture,textTexture,woodMaterial,tubeBetween,normalise} from './exhibition-zones.js?v=park-zones-20261124';

/** Source plan controls the footprint. Furnishing and finish are explicit design choices. */
export function createMappedRgoGallery({assets,layout,program}){
  const group=new THREE.Group();group.name='Музей и Аллея РГО · по первичной схеме';
  const canopy=new THREE.Group(),shell=new THREE.Group();group.add(shell,canopy);
  const wood=woodMaterial(),dark=new THREE.MeshStandardMaterial({color:0x18313b,roughness:.6});
  const brass=new THREE.MeshStandardMaterial({color:0xb99a60,roughness:.3,metalness:.6});
  const glow=new THREE.MeshBasicMaterial({color:0xffe5b0,toneMapped:false});
  const glass=new THREE.MeshPhysicalMaterial({color:0xc5e4e6,transparent:true,opacity:.16,roughness:.12,depthWrite:false,side:THREE.DoubleSide});
  const parts=[],pickables=[],caseRecords=[],screenRecords=[],hallViews=new Map(),movingGlobes=[];
  let activeHall='00',elapsed=0,cutaway=false;
  const halls=new Map(program.halls.map(h=>[h.id,h]));
  function collider(id,size,position,yaw=0,bottom=0){parts.push({id,min:[-size[0]/2,bottom,-size[2]/2],max:[size[0]/2,bottom+size[1],size[2]/2],position:[position[0],position[1]||0,position[2]],rotationY:yaw});}
  function box(name,size,position,material,parent=group,yaw=0){const m=new THREE.Mesh(new THREE.BoxGeometry(...size),material);m.name=name;m.position.fromArray(position);m.rotation.y=yaw;parent.add(m);return m;}
  function panel(title,subtitle,width,height,x,y,z,yaw,options={}){
    const plane=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:textTexture(title,subtitle,{width:1200,height:640,...options}),side:THREE.DoubleSide,toneMapped:false}));
    plane.position.set(x,y,z);plane.rotation.y=yaw;group.add(plane);return plane;
  }
  const points=layout.routePolygon;
  const shape=new THREE.Shape(points.map(([x,z])=>new THREE.Vector2(x,-z)));
  const floor=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshStandardMaterial({color:0xb5a68d,roughness:.48,metalness:.03,side:THREE.DoubleSide}));floor.rotation.x=-Math.PI/2;floor.position.y=.025;floor.name='Пол РГО · первичный контур';group.add(floor);
  const outline=new THREE.BufferGeometry().setFromPoints(points.map(([x,z])=>new THREE.Vector3(x,.035,z)));
  group.add(new THREE.LineLoop(outline,new THREE.LineBasicMaterial({color:0xe8c88b})));
  for(const [index,[a,b]] of layout.wallSegments.entries()){
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]),yaw=-Math.atan2(b[1]-a[1],b[0]-a[0]),x=(a[0]+b[0])/2,z=(a[1]+b[1])/2;
    box('Деревянная оболочка РГО '+index,[length,4.18,.13],[x,2.09,z],wood,shell,yaw);
    collider('wall-'+index,[length,4.18,.15],[x,0,z],yaw);
    const light=tubeBetween([a[0],.72,a[1]],[b[0],.72,b[1]],.016,glow,5);shell.add(light);
  }
  // Slats follow the complete museum envelope. Cutouts preserve actual columns.
  for(const [index,[a,b]] of layout.ceilingStrips.entries()){
    const x=a[0],start=Math.min(a[1],b[1]),end=Math.max(a[1],b[1]),s=new THREE.Shape();
    const height=z=>4.06+.075*Math.sin(z*.56+x*.31);
    s.moveTo(start,height(start));for(let z=start;z<end;z+=.45)s.lineTo(z,height(z));s.lineTo(end,height(end));s.lineTo(end,height(end)+.12);
    for(let z=end;z>start;z-=.45)s.lineTo(z,height(z)+.12);s.lineTo(start,height(start)+.12);s.closePath();
    const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(s,{depth:.06,bevelEnabled:false}),wood);mesh.rotation.y=-Math.PI/2;mesh.position.set(x,0,0);canopy.add(mesh);
    collider('slat-'+index,[.09,.30,end-start],[x,0,(start+end)/2],0,3.98);
  }
  // Cladding is hollow around the original CAD columns, rather than a second
  // solid column intersecting the structural model.
  for(const [index,c] of layout.columns.entries()){
    const radius=Math.max(c.bounds[2]-c.bounds[0],c.bounds[3]-c.bounds[1])/2+.05;
    if(radius>.85)continue;
    const holder=new THREE.Group();holder.position.set(c.x,0,c.z);group.add(holder);
    for(let tier=0;tier<25;tier++){
      const y=.085+tier*.162,r=radius+.6*Math.pow(y/4.05,5);
      const ring=new THREE.Mesh(new THREE.TorusGeometry(r,.055,4,36),wood);ring.rotation.x=Math.PI/2;ring.position.y=y;holder.add(ring);
    }
    for(const y of [3.42,3.91]){const r=radius+.6*Math.pow(y/4.05,5)+.065;const light=new THREE.Mesh(new THREE.TorusGeometry(r,.015,4,48),glow);light.rotation.x=Math.PI/2;light.position.y=y;holder.add(light);}
    collider('column-finish-'+index,[radius*2+.16,4.1,radius*2+.16],[c.x,0,c.z]);
  }
  const walk=layout.routePolyline.map(([x,z])=>new THREE.Vector3(x,.045,z));
  const path=new THREE.CatmullRomCurve3(walk,false,'centripetal');
  group.add(new THREE.Mesh(new THREE.TubeGeometry(path,420,.018,5,false),glow));
  const caseTitles={
    '00':['Проложить путь','Измерить мир','Зафиксировать открытие','Увидеть невидимое'],
    '01':['Карты и путевые записи'], '03':['Морская навигация'], '04':['Инструменты экспедиции','Измерение России'],
    '05':['Полярные наблюдения'], '07':['От наблюдения к открытию'],
  };
  const caseCounts={};
  for(const f of layout.furniture){
    const [x,z]=f.centerXZ,yaw=f.rotationY,w=f.sizeXZ[0],depth=f.sizeXZ[1],hall=halls.get(f.hall);
    if(f.kind==='case'){
      const holder=new THREE.Group();holder.position.set(x,0,z);holder.rotation.y=yaw;group.add(holder);
      const body=new THREE.Mesh(new THREE.CylinderGeometry(1,1,.65,48),wood);body.scale.set(w/2,1,depth/2);body.position.y=.36;holder.add(body);
      const edge=new THREE.Mesh(new THREE.CylinderGeometry(1,1,.025,48),glow);edge.scale.set(w/2+.015,1,depth/2+.015);edge.position.y=.70;holder.add(edge);
      box('Стеклянная витрина',[w-.08,.46,depth-.08],[0,.95,0],glass,holder);
      box('Крышка витрины',[w-.06,.012,depth-.06],[0,1.185,0],glass,holder);
      if(assets.get('X03_NAVIGATION'))holder.add(normalise(assets.get('X03_NAVIGATION'),2.1,{y:.72,maxDimensions:[w-.28,.41,depth-.2]}));
      const i=caseCounts[f.hall]||0;caseCounts[f.hall]=i+1;const title=caseTitles[f.hall]?.[i%caseTitles[f.hall].length]||'Экспедиционные приборы';
      const sign=new THREE.Mesh(new THREE.PlaneGeometry(Math.min(1.8,w-.2),.22),new THREE.MeshBasicMaterial({map:textTexture(title,'',{width:1000,height:140,background:'#533b2a'}),side:THREE.DoubleSide}));sign.position.set(0,.48,depth/2+.015);holder.add(sign);
      collider(f.id,[w,1.22,depth],[x,0,z],yaw);caseRecords.push({id:f.id,hall:f.hall,title});
    }else if(f.kind==='mir'){
      const holder=new THREE.Group();holder.position.set(x,0,z);holder.rotation.y=yaw;group.add(holder);
      box('Подиум «МИР»',[w,.20,depth],[0,.1,0],dark,holder);
      const model=assets.get('X01_MIR');if(model)holder.add(normalise(model,4.15,{y:.21,rotationY:Math.PI/2,maxDimensions:[depth-.2,2.55,w-.2]}));
      collider(f.id,[w,2.9,depth],[x,0,z],yaw);
      const label=new THREE.Mesh(new THREE.PlaneGeometry(2.8,.5),new THREE.MeshBasicMaterial({map:textTexture('«МИР»','Глубоководные исследования',{width:1000,height:230}),side:THREE.DoubleSide}));label.position.set(0,.51,depth/2+.02);holder.add(label);
    }else if(f.kind==='screen'||f.kind==='future-wall'){
      const anchor=layout.hallAnchors.find(h=>h.id===f.hall).position;
      const facing=yaw+(Math.sin(yaw)*(anchor[0]-x)+Math.cos(yaw)*(anchor[1]-z)<0?Math.PI:0),width=f.kind==='future-wall'?7:2.7,height=f.kind==='future-wall'?2.6:1.55,bottom=f.kind==='future-wall'?.65:.85;
      const subtitle=(f.kind==='future-wall'?'Куда отправится следующая экспедиция?\nМечта становится маршрутом':hall.primaryExhibits.slice(0,3).map(t=>t.length>65?t.slice(0,62)+'…':t).join('\n'));
      box('Экран РГО '+f.hall,[width+.1,height+.1,.12],[x,bottom+height/2,z],dark,group,facing);
      const front=new THREE.Vector3(0,0,.072).applyAxisAngle(new THREE.Vector3(0,1,0),facing);
      const screen=panel(f.hall+'  '+hall.title,subtitle,width,height,x+front.x,bottom+height/2,z+front.z,facing,{background:f.hall==='06'?'#0b3655':'#102c3e',accent:'#d6b273'});
      screen.userData.zoneAction='rgo-hall-'+f.hall;pickables.push(screen);
      collider(f.id,[width+.1,height+.1,.16],[x,0,z],facing,bottom-.05);
      screenRecords.push({id:f.id,hall:f.hall,width,height,bottom,position:[x,bottom+height/2,z],rotationY:facing});
      if(!hallViews.has(f.hall))hallViews.set(f.hall,{position:[...anchor.slice(0,1),1.65,anchor[1]],target:[x,1.62,z]});
    }
  }
  // Suspended display models stay above the visitor envelope, and are explicitly
  // expedition sailships rather than mislabeled full-size historical vessels.
  if(assets.get('X02_SAILSHIP'))for(const id of ['03','04']){
    const a=layout.hallAnchors.find(h=>h.id===id).position;
    const holder=normalise(assets.get('X02_SAILSHIP'),2.1,{x:a[0],y:2.68,z:a[1],rotationY:Math.PI/2,maxDimensions:[2.1,1.25,2.1]});group.add(holder);
    group.add(tubeBetween([a[0]-.45,4.05,a[1]],[a[0]-.45,3.83,a[1]],.009,dark),tubeBetween([a[0]+.45,4.05,a[1]],[a[0]+.45,3.83,a[1]],.009,dark));
    collider('suspended-ship-'+id,[2.1,1.25,2.1],[a[0],0,a[1]],0,2.68);
  }
  // The entrance globe is an exact spherical construction with the source's
  // 23.5-degree axis. The final cartographic relief remains a content work item.
  const center=layout.hallAnchors[0].position,globeRoot=new THREE.Group();globeRoot.position.set(center[0]+.15,0,center[1]-2.1);group.add(globeRoot);
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.42,.7,.5,40),wood);base.position.y=.27;globeRoot.add(base);
  const earth=new THREE.Group();earth.position.y=1.48;earth.rotation.z=23.5*Math.PI/180;globeRoot.add(earth);
  const globe=new THREE.Mesh(new THREE.SphereGeometry(.79,40,28),new THREE.MeshStandardMaterial({color:0x215778,metalness:.25,roughness:.4}));earth.add(globe);
  for(let i=0;i<12;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(.795,.008,4,72),brass);ring.rotation.y=i*Math.PI/12;earth.add(ring);}
  for(const lat of [-60,-30,0,30,60]){const r=.798*Math.cos(lat*Math.PI/180);const ring=new THREE.Mesh(new THREE.TorusGeometry(r,.008,4,72),brass);ring.rotation.x=Math.PI/2;ring.position.y=.798*Math.sin(lat*Math.PI/180);earth.add(ring);}
  movingGlobes.push(earth);collider('entrance-globe',[1.75,2.35,1.75],globeRoot.position.toArray());
  panel('МУЗЕЙ И АЛЛЕЯ РГО','Девять залов · путь открытий России',4.2,.8,-14.7,3.1,-59.7,Math.PI/2,{background:'#61432e'});
  for(const [index,h] of layout.hallAnchors.entries()){
    const sign=panel(h.id+'  '+h.name,'',4.2,.48,h.position[0],3.55,h.position[1],index<3?-Math.PI/2:0,{width:1400,height:160,background:'#634630'});
    sign.userData.zoneAction='rgo-hall-'+h.id;pickables.push(sign);
    const light=new THREE.PointLight(0xffd5a0,7,11,2);light.position.set(h.position[0],3.75,h.position[1]);group.add(light);
    if(!hallViews.has(h.id))hallViews.set(h.id,{position:[h.position[0],1.65,h.position[1]],target:[h.position[0]+2,1.7,h.position[1]]});
  }
  const defaultPose={position:[center[0]+.7,1.65,center[1]+.45],target:[center[0]+.15,1.48,center[1]-2.1]};hallViews.set('00',defaultPose);
  return {group,pickables,supportSamples:layout.supportSamples,
    getCollisionParts:()=>parts,
    setHall(id){if(!halls.has(id))return false;activeHall=id;return true;},
    get activeHall(){return activeHall;},
    get interiorPose(){return hallViews.get(activeHall)||defaultPose;},
    overviewPose:{position:[-41,47,-8],target:[7,1,-31]},
    setCutaway(value){cutaway=Boolean(value);canopy.visible=!cutaway;},
    action(action){if(action==='rgo-next'){activeHall=String((Number(activeHall)+1)%9).padStart(2,'0');return true;}if(action==='rgo-previous'){activeHall=String((Number(activeHall)+8)%9).padStart(2,'0');return true;}if(action.startsWith('rgo-hall-'))return this.setHall(action.slice(9));return false;},
    update(dt,camera){elapsed+=Math.max(0,dt);for(const globe of movingGlobes)globe.rotation.y=elapsed*.045;let change=false;if(camera){const local=group.worldToLocal(camera.position.clone());const show=!cutaway&&local.y<4.5;if(canopy.visible!==show){canopy.visible=show;change=true;}}return dt>0||change;},
    getState:()=>({scope:'primary-nine-hall-route',hallCount:9,activeHall,programmeHallAreaM2:1120,programmeOverallM2:1400,displayCases:caseRecords.length,ships:assets.has('X02_SAILSHIP')?2:0,mir:assets.has('X01_MIR'),screens:screenRecords.length,screenRecords,caseRecords,referenceStyle:'warm-timber-lamellae-sand-floor-amber-light-blue-media',plannedHeroes:['Полноразмерный коч','Трёхпалубная «Надежда» в разрезе','«Таймыр»','АНТ-25','«Консул»','«Орёл»'],sourceLayout:'rgo-primary-layout.json',workingRouteReserveMetres:2.9}),
  };
}
