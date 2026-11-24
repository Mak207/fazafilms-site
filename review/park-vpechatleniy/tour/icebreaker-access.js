import * as THREE from 'three';

export const LIDER_ACCESS_CONFIG = Object.freeze({"ship":{"instanceId":"O12-1","x":-8.5,"y":7.2,"z":42,"rotationY":1.3089969389957472,"length":16,"scaleFactor":1,"sourceModelLength":25.2,"noseDirection":[0.9659258262890683,0,0.25881904510252074],"footprint":{"type":"Polygon","coordinates":[[[-16.2547058315221,40.03132878394041],[-16.380904356779155,40.50608404720055],[-16.369527600200623,40.82964273755406],[-16.307937593581602,41.1959772062457],[-16.302616108302516,41.21762458556239],[-16.08107616973483,41.609629272803886],[-16.03900126907465,41.67145693754146],[-15.91605043182748,41.75596606800931],[-15.846193480161688,41.7858060648791],[-15.630018758581475,41.87709539948939],[-14.866136182095875,42.16569618387695],[-14.477076872421081,42.302298666982544],[-14.224783897544397,42.387088759118875],[-14.176488092944235,42.403062679330844],[-14.068324100558279,42.437100506649195],[-4.923372080207157,45.06037651804412],[-4.556528241813819,45.15159469427843],[-4.47413663335406,45.168616086319915],[-4.402930230264662,45.17455178361842],[-3.306116404199571,45.19039696603128],[-3.200931300781196,45.19027110991757],[-3.066366535764235,45.18992903912315],[-3.048122552642143,45.18976197004216],[-2.725827559296902,45.183101979779195],[-2.664424245069471,45.18034459387383],[-1.8935288491310382,45.023929915602935],[-1.827323511598033,45.00324879524071],[-1.7527443695143718,44.97773385995858],[-1.7095670656181108,44.959982005128495],[-1.6117568857329116,44.919459335479445],[-1.4890133458943282,44.86135173386246],[-1.3741866523738313,44.79505638784955],[-1.2987630622150528,44.74752419065202],[-1.214832657837352,44.687105190370964],[-1.1543178357077686,44.63861137754986],[-1.0400100486698651,44.53274518414439],[-0.8681299155504343,44.313899013847696],[-0.7981233502925722,44.1658300672129],[-0.7354182905074014,43.916719475067495],[-0.7331515872079395,43.81015303455279],[-0.7331106226017079,43.723211671401884],[-0.7637884929961842,43.547153352633664],[-0.817124791822537,43.38018980581137],[-0.8732779449553112,43.253925488150486],[-0.924800271585914,43.14811250779322],[-1.0349906358564285,42.96692597977951],[-1.0465451637887906,42.949674893535885],[-1.0969754092814172,42.877520027976466],[-1.2358038852394486,42.708881354338516],[-1.7183426551535668,42.20043282592663],[-1.7239354236471902,42.19489001248534],[-1.7353725360216545,42.18474795673246],[-2.176644772335136,41.941136231928276],[-3.3799528398237637,41.28505650847781],[-3.5714339697414053,41.21858333234223],[-3.908023021671098,41.13142782278493],[-13.082735498729042,38.826754172124794],[-14.421801727877371,38.53771638414509],[-14.584513086003804,38.50726216475785],[-14.915243802765312,38.4661634535682],[-14.97154200311124,38.46118914206699],[-15.21724090739669,38.49140640434221],[-15.25959280781138,38.502301856281775],[-15.642705460890749,38.758578136625204],[-15.65687326388421,38.7699480039798],[-15.85038798416807,39.03557301184203],[-16.09364260348198,39.441553480641275],[-16.099641370510387,39.46016756831484],[-16.2547058315221,40.03132878394041]]]},"originalAssetUnchanged":true},"wheelhouse":{"deckY":2.4,"modelLength":16,"roomWidth":3,"roomLength":3.2,"rearZ":2.4,"approachZ":0,"cutVolume":{"min":[-2.5,2.2,-2.3],"max":[2.5,7,5.8]},"worldDeckY":9.6,"clearHeight":2.35,"doorWidth":1.2,"doorHeight":2.2,"worldApproachPoint":[-8.5,9.6,42.0],"worldDoorThreshold":[-6.181778016906236,9.6,42.62116570824605],"worldInteriorEye":[-5.215852190617168,11.25,42.87998475334857],"roofWorldY":12.07},"lift":{"id":"lider-access-lift","centerXZ":[1.4,40.5],"outerSizeXZ":[2.4,2.4],"baseY":7.2,"roofY":15.7,"levels":{"lower":9.6,"upper":13.2},"travelMetres":3.6,"doorSide":"west","doorX":0.2,"doorWidth":1.8,"guardHeight":1.2,"clearHeight":2.3,"upperLanding":[0.2,13.2,40.5],"lowerLanding":[0.2,9.6,40.5],"initialLevel":"upper"},"upperBridge":{"id":"lider-upper-bridge","floorY":13.2,"thickness":0.14,"width":1.8,"guardHeight":1.2,"outline":[[0.2,41.4],[0.2,39.6],[-3.3137584675207545,39.6],[-1.1686023704557127,41.4],[0.2,41.4]],"path":[[-3.6,13.2,40.5],[0.2,13.2,40.5]],"cadContactLine":[[-3.3137586230931197,13.2,39.6],[-1.1686025260280775,13.2,41.4]],"endOpenings":[{"axis":"x","value":0.2},{"kind":"cad-edge"}]},"lowerBridge":{"id":"lider-lower-bridge","floorY":9.6,"thickness":0.14,"width":1.6,"guardHeight":1.2,"outline":[[-9.075471809323403,37.939875942267264],[-9.22425902968138,37.95376422395083],[-9.367867662296254,37.99508107219051],[-9.50128699524474,38.06238488267369],[-9.61986183593689,38.15332732856562],[-9.719454937486914,38.26473529701322],[-9.796591353212799,38.392721603620366],[-9.848579682528388,38.53282062190725],[-10.625036817835952,41.43059810077445],[-10.65058329539558,41.585330833472355],[-10.645452045903745,41.742074290632516],[-10.609840260400782,41.894804909099],[-10.545116479832247,42.03765333685647],[-10.453768002787879,42.16512998893653],[-10.339305300011672,42.272336009089464],[-10.206127108979896,42.35515153008262],[-10.059351392886711,42.41039399788773],[-8.707055236082015,42.77274066103126],[-8.292944763917985,41.22725933896874],[-8.872500259691423,41.07196791190723],[-8.495318634365022,39.6643069225077],[0.2,41.314275212745606],[0.2,39.6857247872544],[-8.926697401526788,37.95390080928058],[-9.075471809323403,37.939875942267264]],"path":[[0.2,9.6,40.5],[-9.075839021497133,9.6,38.73987585798927],[-9.852296156804696,9.6,41.637653336856474],[-8.5,9.6,42.0]],"length":13.841357240779416,"minimumMainFloorHeadroomBelowDeck":2.259999999999999,"endOpenings":[{"axis":"x","value":0.2},{"kind":"ship-apron","point":[-8.5,42],"direction":[0.9659258262890683,0.25881904510252074]}]},"railOpening":{"id":"icebreaker-mezzanine-access","label":"Рабочая калитка с антресоли на переход к Лидеру","mesh":"Ограждение__7f7f7fff","min":[-3.39,13.0,39.54],"max":[-1.09,14.25,41.46],"provisional":true,"sourceGLBModified":false}});
export const ICEBREAKER_LAYOUT = Object.freeze({ ...LIDER_ACCESS_CONFIG.ship,
  bridgeHeight:9.6, mezzanineHeight:13.2, bridgeWidth:1.6,
  path:LIDER_ACCESS_CONFIG.lowerBridge.path });
export const ICEBREAKER_OPENING = Object.freeze(LIDER_ACCESS_CONFIG.railOpening);

/** A continuous two-level connection to the real human-size wheelhouse doorway.
 * Existing CAD is retained; only the separately exported local railing gate is a
 * proposed runtime opening. Lift dimensions describe a scene concept, not a product.
 */
export function createIcebreakerAccess({scene,exhibits,onState=()=>{}}={}) {
  const config=LIDER_ACCESS_CONFIG, group=new THREE.Group();
  group.name='Лидер · переход с антресоли и подъёмник к рубке';
  group.userData={workingIcebreakerAccess:true,sourceCadFileModified:false,conceptualLift:true};
  const geometries=new Set(),materials=new Set(),proxies=[];
  const steel=new THREE.MeshStandardMaterial({color:0x7896a6,metalness:.45,roughness:.43});
  const deckMaterial=new THREE.MeshStandardMaterial({color:0x718b99,roughness:.76,metalness:.18});
  const glass=new THREE.MeshPhysicalMaterial({color:0xc5edf2,transparent:true,opacity:.23,roughness:.18,side:THREE.DoubleSide,depthWrite:false});
  const line=new THREE.MeshBasicMaterial({color:0x7fe7f1,toneMapped:false});
  [steel,deckMaterial,glass,line].forEach(m=>materials.add(m));
  function add(geometry,material,position,name,parent=group){geometries.add(geometry);const node=new THREE.Mesh(geometry,material);node.position.fromArray(position);node.name=name;node.receiveShadow=true;parent.add(node);return node;}
  const box=(size,position,material,name,parent=group)=>add(new THREE.BoxGeometry(...size),material,position,name,parent);
  function tube(a,b,radius,material,name,parent=group){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),v=end.clone().sub(start),node=add(new THREE.CylinderGeometry(radius,radius,v.length(),8),material,start.add(end).multiplyScalar(.5).toArray(),name,parent);node.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return node;}
  function isOpenEdge(bridge,a,b){
    if(Math.abs(a[0]-.2)<1e-5&&Math.abs(b[0]-.2)<1e-5)return true;
    if(bridge.id==='lider-upper-bridge')return Math.abs(a[0]-b[0])>.1&&Math.abs(a[1]-b[1])>.1;
    const end=config.lowerBridge.path.at(-1),mx=(a[0]+b[0])/2,mz=(a[1]+b[1])/2;
    return Math.hypot(mx-end[0],mz-end[2])<.05;
  }
  function bridge(record){
    const shape=new THREE.Shape(),outline=record.outline;
    outline.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:record.thickness,steps:1,bevelEnabled:false});geometry.rotateX(-Math.PI/2);
    const deck=add(geometry,deckMaterial,[0,record.floorY-record.thickness,0],record.id+' · настил');deck.userData.walkable=true;
    for(let i=0;i<outline.length-1;i++){
      const a=outline[i],b=outline[i+1];if(isOpenEdge(record,a,b))continue;
      const length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<1e-6)continue;
      for(const h of [.6,1.2])tube([a[0],record.floorY+h,a[1]],[b[0],record.floorY+h,b[1]],.025,steel,record.id+' · поручень');
      tube([a[0],record.floorY+.025,a[1]],[b[0],record.floorY+.025,b[1]],.012,line,record.id+' · край');
      const count=Math.max(1,Math.ceil(length/1.8));
      for(let j=0;j<=count;j++){const t=j/count,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;tube([x,record.floorY,z],[x,record.floorY+1.2,z],.025,steel,record.id+' · стойка');}
    }
    const points=record.path;
    for(let i=0;i<points.length-1;i++){
      const a=points[i],b=points[i+1],dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz);
      proxies.push({id:record.id+'-'+i,kind:'icebreaker-access',shape:'obb',centerXZ:[(a[0]+b[0])/2,(a[2]+b[2])/2],halfSizeXZ:[length/2,record.width/2],rotationY:Math.atan2(-dz,dx),minY:record.floorY-record.thickness,maxY:record.floorY});
    }
  }
  bridge(config.upperBridge);bridge(config.lowerBridge);
  const lift=config.lift,[lx,lz]=lift.centerXZ,[sx,sz]=lift.outerSizeXZ;
  const roof=box([sx,.12,sz],[lx,lift.roofY-.06,lz],deckMaterial,'Подъёмник · крыша');
  box([sx,.16,sz],[lx,lift.baseY+.08,lz],steel,'Подъёмник · основание');
  for(const x of [lx-sx/2+.06,lx+sx/2-.06])for(const z of [lz-sz/2+.06,lz+sz/2-.06])tube([x,lift.baseY,z],[x,lift.roofY-.12,z],.055,steel,'Подъёмник · стойка шахты');
  const shaftH=lift.roofY-.12-lift.baseY;
  box([.03,shaftH,sz-.12],[lx+sx/2-.035,lift.baseY+shaftH/2,lz],glass,'Подъёмник · заднее стекло');
  for(const sign of [-1,1])box([sx-.12,shaftH,.03],[lx,lift.baseY+shaftH/2,lz+sign*(sz/2-.035)],glass,'Подъёмник · боковое стекло');
  const cabin=new THREE.Group();cabin.name='Подъёмник · подвижная кабина';group.add(cabin);
  box([sx,.14,sz],[lx,-.07,lz],deckMaterial,'Подъёмник · пол кабины',cabin);
  box([sx-.1,.08,sz-.1],[lx,lift.clearHeight+.04,lz],steel,'Подъёмник · потолок кабины',cabin);
  for(const sign of [-1,1])box([sx-.14,1.2,.025],[lx,.6,lz+sign*(sz/2-.10)],glass,'Подъёмник · ограждение кабины',cabin);
  box([.025,1.2,sz-.14],[lx+sx/2-.10,.6,lz],glass,'Подъёмник · ограждение кабины',cabin);
  const cabinGate=box([.045,1.2,lift.doorWidth],[lift.doorX+.035,.6,lz],glass,'Подъёмник · дверь кабины',cabin);
  const landingGates={};
  for(const [level,y] of Object.entries(lift.levels)){
    const gate=box([.045,1.2,lift.doorWidth],[lift.doorX-.025,y+.6,lz],glass,'Подъёмник · дверь '+level);landingGates[level]=gate;
    for(const sign of [-1,1])box([.06,2.25,.06],[lift.doorX,y+1.125,lz+sign*(lift.doorWidth/2+.04)],steel,'Подъёмник · дверная стойка');
    box([.06,.06,lift.doorWidth+.14],[lift.doorX,y+2.23,lz],steel,'Подъёмник · дверная перемычка');
  }
  proxies.push({id:lift.id,kind:'icebreaker-access',shape:'obb',centerXZ:[lx,lz],halfSizeXZ:[sx/2,sz/2],rotationY:0,minY:lift.baseY,maxY:lift.roofY});
  let connected=false,reason='loading',level=lift.initialLevel,targetLevel=level,phase='idle',phaseTime=0,floorY=lift.levels[level],lastTime=typeof performance!=='undefined'?performance.now():Date.now();
  function liftState(){return {level,targetLevel,phase,floorY,moving:phase!=='idle',doorOpen:phase==='idle',travelMetres:lift.travelMetres,conceptual:true};}
  function applyLift(){cabin.position.y=floorY;cabinGate.visible=phase!=='idle';for(const key of Object.keys(landingGates))landingGates[key].visible=phase!=='idle'||key!==level;}
  function requestLift(next){if(!(next in lift.levels)||!connected||phase!=='idle')return false;if(next===level)return true;targetLevel=next;phase='closing';phaseTime=0;applyLift();onState(getState());return true;}
  function advance(dt){
    if(phase==='idle')return false;phaseTime+=dt;
    if(phase==='closing'&&phaseTime>=.6){phase='moving';phaseTime=0;}
    else if(phase==='moving'){
      const destination=lift.levels[targetLevel],step=.85*dt;floorY+=Math.sign(destination-floorY)*Math.min(Math.abs(destination-floorY),step);
      if(Math.abs(destination-floorY)<1e-7){floorY=destination;level=targetLevel;phase='opening';phaseTime=0;}
    }else if(phase==='opening'&&phaseTime>=.6){phase='idle';phaseTime=0;onState(getState());}
    applyLift();return true;
  }
  function update(deltaSeconds){
    const pose=exhibits?.getInstance?.(config.ship.instanceId),atPose=pose&&Math.abs(pose.x-config.ship.x)<.001&&Math.abs(pose.y-config.ship.y)<.001&&Math.abs(pose.z-config.ship.z)<.001&&Math.abs(Math.atan2(Math.sin(pose.rotationY-config.ship.rotationY),Math.cos(pose.rotationY-config.ship.rotationY)))<.001&&Math.abs((pose.scaleFactor??1)-1)<.001;
    const visible=pose?.visible!==false&&exhibits?.group?.visible!==false;connected=Boolean(atPose&&visible);reason=!visible?'hidden':atPose?'connected-human-wheelhouse':'ship-edited';
    const changed=group.visible!==connected;group.visible=connected;
    const now=typeof performance!=='undefined'?performance.now():Date.now(),dt=Number.isFinite(deltaSeconds)&&deltaSeconds>=0&&deltaSeconds<=1?deltaSeconds:Math.min(.1,Math.max(0,(now-lastTime)/1000));lastTime=now;
    return changed||(connected&&advance(dt));
  }
  function getState(){return {connected,reason,provisional:true,sourceCadFileModified:false,ship:config.ship,mezzanineHeight:13.2,wheelhouseHeight:9.6,lowerBridgeLength:config.lowerBridge.length,path:config.lowerBridge.path,upperPath:config.upperBridge.path,lift:liftState(),note:'Переход через подъёмник ведёт в настоящий проём человеческой рубки. Корпус полностью в исходной зоне7. Размеры подъёмника — рабочая геометрическая концепция.'};}
  function getLiftPose(){return {position:new THREE.Vector3(lx,floorY+1.65,lz),target:new THREE.Vector3(lx-5,floorY+1.45,lz),up:new THREE.Vector3(0,1,0),floorY,station:'lider-lift',state:liftState()};}
  function getEntrancePose(){const point=config.wheelhouse.worldApproachPoint,door=config.wheelhouse.worldDoorThreshold;return {position:new THREE.Vector3(point[0],point[1]+1.65,point[2]),target:new THREE.Vector3(door[0],door[1]+1.5,door[2]),feet:new THREE.Vector3(...point),up:new THREE.Vector3(0,1,0)};}
  scene?.add(group);applyLift();update(0);
  return {group,update,getState,requestLift,getLiftPose,getEntrancePose,getWayfinding:()=>config,
    getCollisionObstacles:()=>connected?proxies.map(v=>({...v,centerXZ:[...v.centerXZ],halfSizeXZ:[...v.halfSizeXZ]})):[],
    getWalkableSurfaces:()=>[config.upperBridge,config.lowerBridge].map(v=>({id:v.id,floorY:v.floorY,polygon:v.outline})),
    dispose(){group.removeFromParent();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}
  };
}
