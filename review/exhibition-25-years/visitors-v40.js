import * as THREE from "three";

const profiles=[
  {model:"woman",speed:.90,start:0,seed:0x7254a11,stance:{Right:.25,Left:.75}},
  {model:"man",speed:.84,start:3,seed:0x39cb7d2,stance:{Left:.24,Right:.74}}
];
const stations=[
  {name:"Робот и реактор",position:[-3.55,.45],target:[-3.55,2.55]},
  {name:"Поезд Москва-2024",position:[3.55,.45],target:[3.55,2.55]},
  {name:"Москва-Сити",position:[0,3.62],target:[0,5.48]},
  {name:"Новый жилой микрорайон",position:[-3.35,-1.88],target:[-3.35,-3.55]},
  {name:"Большая спортивная арена",position:[3.35,-1.88],target:[3.35,-3.55]},
  {name:"Видеокуб",position:[-1.96,-.35],target:[0,-.35]}
];

// Bounds measured from the rendered Three.js scene. Each footprint is expanded
// by the visitor capsule radius, so a valid centreline also clears shoulders.
const clearance=.48,obstacles=[
  [-1.22,1.22,-1.56,.86],      // media cube and pedestal
  [-4.28,-2.82,1.14,3.96],    // technology plinth
  [2.85,4.25,1.07,4.03],      // train plinth
  [-4.62,-2.08,-4.37,-2.73],  // residential plinth
  [2.08,4.62,-4.37,-2.73],    // arena plinth
  [-1.92,1.92,4.34,6.62]      // Moscow City plinth
].map(([minX,maxX,minZ,maxZ])=>({minX:minX-clearance,maxX:maxX+clearance,minZ:minZ-clearance,maxZ:maxZ+clearance}));
const nav={minX:-5.18,maxX:5.18,minZ:-8.75,maxZ:8.75,step:.38};
const routeCache=new Map();
const ramp=1.18,params=new URLSearchParams(location.search),demoPeriod=Math.max(1,Number(params.get("visitorDemoEvery"))||300),demoOnly=params.has("visitorDemoOnly");
const sessionSeed=(Number(params.get("visitorSeed"))||crypto.getRandomValues(new Uint32Array(1))[0])>>>0;
const demoKinds=["wave","point","clap","look-around","nod","bow","stretch","shoulder-roll"];
const demoDurations={wave:3.2,point:2.8,clap:3.0,"look-around":3.4,nod:2.6,bow:3.0,stretch:3.4,"shoulder-roll":3.2};
const forcedDemo=params.get("visitorDemoAction");
const smooth=THREE.MathUtils.smoothstep,clamp=THREE.MathUtils.clamp,wrap=THREE.MathUtils.euclideanModulo;

function rng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function demoForSlot(slot){
  if(forcedDemo&&demoKinds.includes(forcedDemo))return forcedDemo;
  const cycle=Math.floor((slot-1)/demoKinds.length),random=rng(0x45f21a9^cycle^sessionSeed),bag=demoKinds.slice();
  for(let i=bag.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}
  return bag[(slot-1)%bag.length];
}
function point(index){const [x,z]=stations[index].position;return new THREE.Vector3(x,0,z);}
function viewYaw(index){const s=stations[index];return Math.atan2(s.target[0]-s.position[0],s.target[1]-s.position[1]);}
function angleMix(a,b,t){return a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;}

function blocked(x,z){return x<nav.minX||x>nav.maxX||z<nav.minZ||z>nav.maxZ||obstacles.some(o=>x>o.minX&&x<o.maxX&&z>o.minZ&&z<o.maxZ);}
function segmentClear(a,b){const n=Math.max(2,Math.ceil(a.distanceTo(b)/.09));for(let i=0;i<=n;i++){const t=i/n;if(blocked(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t))return false;}return true;}
function navPath(startIndex,goalIndex){
  const cacheKey=`${startIndex}:${goalIndex}`;if(routeCache.has(cacheKey))return routeCache.get(cacheKey).map(p=>p.clone());
  const start=point(startIndex),goal=point(goalIndex),cols=Math.floor((nav.maxX-nav.minX)/nav.step)+1,rows=Math.floor((nav.maxZ-nav.minZ)/nav.step)+1;
  const key=(x,z)=>z*cols+x,position=(x,z)=>new THREE.Vector3(nav.minX+x*nav.step,0,nav.minZ+z*nav.step),valid=(x,z)=>x>=0&&x<cols&&z>=0&&z<rows&&!blocked(position(x,z).x,position(x,z).z);
  function snap(origin){const cx=Math.round((origin.x-nav.minX)/nav.step),cz=Math.round((origin.z-nav.minZ)/nav.step);for(let r=0;r<12;r++)for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){if(Math.max(Math.abs(dx),Math.abs(dz))!==r)continue;const x=cx+dx,z=cz+dz,p=position(x,z);if(valid(x,z)&&segmentClear(origin,p))return[x,z];}throw new Error("No free navigation cell");}
  const [sx,sz]=snap(start),[gx,gz]=snap(goal),startKey=key(sx,sz),goalKey=key(gx,gz),open=[startKey],cost=new Map([[startKey,0]]),previous=new Map(),cell=new Map([[startKey,[sx,sz]]]);
  while(open.length){let best=0;for(let i=1;i<open.length;i++){const [ax,az]=cell.get(open[i]),[bx,bz]=cell.get(open[best]);if((cost.get(open[i])+Math.hypot(gx-ax,gz-az))<(cost.get(open[best])+Math.hypot(gx-bx,gz-bz)))best=i;}const current=open.splice(best,1)[0];if(current===goalKey)break;const [x,z]=cell.get(current);
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const nx=x+dx,nz=z+dz;if(!valid(nx,nz))continue;if(dx&&dz&&(!valid(x+dx,z)||!valid(x,z+dz)))continue;const next=key(nx,nz),candidate=cost.get(current)+Math.hypot(dx,dz);if(candidate>= (cost.get(next)??Infinity))continue;cost.set(next,candidate);previous.set(next,current);cell.set(next,[nx,nz]);if(!open.includes(next))open.push(next);}
  }
  if(!cost.has(goalKey))throw new Error(`No route ${startIndex} -> ${goalIndex}`);const grid=[];for(let cursor=goalKey;;cursor=previous.get(cursor)){const [x,z]=cell.get(cursor);grid.push(position(x,z));if(cursor===startKey)break;}grid.reverse();const raw=[start,...grid,goal],simple=[raw[0]];for(let i=0;i<raw.length-1;){let j=raw.length-1;while(j>i+1&&!segmentClear(raw[i],raw[j]))j--;simple.push(raw[j]);i=j;}routeCache.set(cacheKey,simple.map(p=>p.clone()));routeCache.set(`${goalIndex}:${startIndex}`,simple.slice().reverse().map(p=>p.clone()));return simple;
}
function roundedPath(points,maxRadius=.34){
  const path=new THREE.CurvePath(),line=(a,b)=>{if(a.distanceToSquared(b)>1e-6)path.add(new THREE.LineCurve3(a.clone(),b.clone()));};let current=points[0].clone();
  for(let i=1;i<points.length-1;i++){const previous=points[i-1],corner=points[i],next=points[i+1],radius=Math.min(maxRadius,corner.distanceTo(previous)*.24,corner.distanceTo(next)*.24);if(radius<=0){line(current,corner);current=corner.clone();continue;}const entry=corner.clone().lerp(previous,radius/corner.distanceTo(previous)),exit=corner.clone().lerp(next,radius/corner.distanceTo(next));line(current,entry);path.add(new THREE.QuadraticBezierCurve3(entry,corner.clone(),exit));current=exit;}
  line(current,points.at(-1));return path;
}
function curveClear(curve,length){const sample=new THREE.Vector3();for(let d=0;d<=length;d+=.055){curve.getPointAt(Math.min(1,d/length),sample);if(blocked(sample.x,sample.z))return false;}return true;}
export function auditVisitorNavigation(){const routes=[];for(let a=0;a<stations.length;a++)for(let b=a+1;b<stations.length;b++){const points=navPath(a,b),curve=roundedPath(points),length=curve.getLength(),clear=curveClear(curve,length);routes.push({from:stations[a].name,to:stations[b].name,points:points.map(p=>[+p.x.toFixed(2),+p.z.toFixed(2)]),length:+length.toFixed(2),clear});}return{capsuleRadius:clearance,routes};}
function travel(time,length,speed){const total=length/speed+ramp;if(time>=total)return{distance:length,weight:0,direction:-1,done:true};if(time<ramp)return{distance:speed*time*time/(2*ramp),weight:time/ramp,direction:1};const remaining=total-time;if(remaining<ramp)return{distance:length-speed*remaining*remaining/(2*ramp),weight:remaining/ramp,direction:-1};return{distance:speed*(time-ramp/2),weight:1,direction:0};}

export function addWalkers(scene,loader,contactMaterial){
  const actors=[];
  profiles.forEach((profile,index)=>loader.load(`./assets/models/visitors/walking-${profile.model}.glb?v=41`,({scene:rig,animations})=>{
    const holder=new THREE.Group();holder.name="visitor-"+profile.model;const shadow=new THREE.Mesh(new THREE.PlaneGeometry(.76,.56),contactMaterial.clone());shadow.rotation.x=-Math.PI/2;shadow.position.y=.009;holder.add(shadow,rig);
    const bones={},feet=[];rig.traverse(b=>{if(b.isBone)bones[b.name.replace(/^mixamorig:?/,"")]=b;});
    rig.traverse(b=>{if(!b.isBone||!/(Left|Right)Foot$/.test(b.name))return;const contact=new THREE.Mesh(new THREE.PlaneGeometry(.18,.31),contactMaterial.clone());contact.rotation.x=-Math.PI/2;holder.add(contact);const side=b.name.endsWith("LeftFoot")?"Left":"Right";feet.push({bone:b,contact,shin:b.parent,thigh:b.parent.parent,phase:profile.stance[side],mid:new THREE.Vector3(),side});});
    rig.traverse(o=>{if(o.isSkinnedMesh)o.frustumCulled=false;});const mixer=new THREE.AnimationMixer(rig),action=n=>mixer.clipAction(THREE.AnimationClip.findByName(animations,n)).play();
    const actor={profile,index,holder,rig,bones,feet,mixer,walk:action("Walk"),idle:action("Observe"),shadow,random:rng(profile.seed^sessionSeed)};
    actor.soles=outsoleSamples(rig);actor.hips=bones.Hips;actor.hipBase=bones.Hips.position.clone();actor.upperBody=[[bones.Spine2,.22],[bones.Neck,.32],[bones.Head,.46]].filter(([b])=>b);actor.arms=["Left","Right"].map(side=>({side,upper:bones[side+"Arm"],lower:bones[side+"ForeArm"],hand:bones[side+"Hand"]})).filter(a=>a.upper&&a.lower&&a.hand);
    actor.savedPose=[...feet.flatMap(f=>[f.thigh,f.shin,f.bone]),...actor.upperBody.map(([b])=>b),...actor.arms.flatMap(a=>[a.upper,a.lower,a.hand])].filter((b,i,a)=>a.indexOf(b)===i).map(bone=>({bone,rotation:bone.quaternion.clone()}));
    actor.walkDuration=actor.walk.getClip().duration;actor.stride=profile.speed*actor.walkDuration;actor.idle.setEffectiveWeight(1);actor.walk.setEffectiveWeight(0);holder.position.copy(point(profile.start));holder.rotation.y=viewYaw(profile.start);
    actor.behavior={phase:"observe",time:index*1.7,current:profile.start,recent:[profile.start],pause:4.8+actor.random()*4,lastTime:null,lastDemoSlot:0,stationName:stations[profile.start].name};
    // A planted-foot offset belongs to the character frame, never the pavilion.
    actor.walk.setEffectiveWeight(1);actor.idle.setEffectiveWeight(0);
    for(const foot of feet){actor.walk.time=actor.walkDuration*foot.phase;mixer.update(0);holder.worldToLocal(foot.bone.getWorldPosition(foot.mid));}sampleTransitions(actor);capturePose(actor);updateActor(actor,0);actors.push(actor);scene.add(holder);
  }));
  return time=>{for(const actor of actors)updateActor(actor,time);};
}

const ahead=new THREE.Vector3(),behind=new THREE.Vector3();
function headingAt(curve,length,distance){curve.getPointAt(clamp((distance+.16)/length,0,1),ahead);curve.getPointAt(clamp((distance-.16)/length,0,1),behind);return Math.atan2(ahead.x-behind.x,ahead.z-behind.z);}
function capturePose(actor){for(const {bone,rotation} of actor.savedPose)rotation.copy(bone.quaternion);}
function restorePose(actor){for(const {bone,rotation} of actor.savedPose)bone.quaternion.copy(rotation);}
const hip=new THREE.Vector3(),knee=new THREE.Vector3(),ankle=new THREE.Vector3(),target=new THREE.Vector3(),bend=new THREE.Vector3(),axis=new THREE.Vector3(),desiredKnee=new THREE.Vector3(),from=new THREE.Vector3(),to=new THREE.Vector3();
const worldQ=new THREE.Quaternion(),parentQ=new THREE.Quaternion(),footQ=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0),shoePoint=new THREE.Vector3(),headPoint=new THREE.Vector3(),localTarget=new THREE.Vector3();
function pointJoint(bone,origin,child,goal){from.subVectors(child,origin).normalize();to.subVectors(goal,origin).normalize();bone.getWorldQuaternion(worldQ);bone.parent.getWorldQuaternion(parentQ);bone.quaternion.setFromUnitVectors(from,to).multiply(worldQ).premultiply(parentQ.invert());}
function outsoleSamples(rig){rig.updateMatrixWorld(true);const samples=[];rig.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const cells=new Map();for(let i=0;i<mesh.geometry.attributes.position.count;i++){mesh.getVertexPosition(i,shoePoint).applyMatrix4(mesh.matrixWorld);if(shoePoint.y>.035)continue;const k=Math.floor(shoePoint.x/.04)+","+Math.floor(shoePoint.z/.045);if(!cells.has(k)||shoePoint.y<cells.get(k).y)cells.set(k,{i,y:shoePoint.y});}if(cells.size)samples.push({mesh,indices:Array.from(cells.values(),c=>c.i)});});return samples;}
function groundShoes(actor){actor.holder.updateMatrixWorld(true);let lowest=Infinity;for(const {mesh,indices} of actor.soles)for(const i of indices){mesh.getVertexPosition(i,shoePoint).applyMatrix4(mesh.matrixWorld);lowest=Math.min(lowest,shoePoint.y);}if(Number.isFinite(lowest))actor.rig.position.y=.001-lowest;}
function sampleTransitions(actor){const {feet,profile,holder,idle,walk,mixer}=actor,origin=holder.position.clone(),yaw=holder.rotation.y;holder.position.set(0,0,0);holder.rotation.y=0;for(const direction of [0,-1,1]){const d=direction*profile.speed*ramp/2;holder.position.z=d;walk.setEffectiveWeight(direction===0?0:1);idle.setEffectiveWeight(direction===0?1:0);idle.time=0;walk.time=actor.walkDuration*wrap(d/actor.stride,1);mixer.update(0);for(const f of feet){f.marks??={};f.marks[direction]=holder.worldToLocal(f.bone.getWorldPosition(new THREE.Vector3()));}}for(const direction of [-1,1]){const first=feet.reduce((a,b)=>a.marks[direction].distanceTo(a.marks[0])>b.marks[direction].distanceTo(b.marks[0])?a:b);for(const f of feet){f.first??={};f.first[direction]=f===first;}}holder.position.copy(origin);holder.rotation.y=yaw;}
function markWorld(actor,mark,out){out.copy(mark);actor.holder.localToWorld(out);return out;}
function transitionFoot(foot,actor,direction,t){const leading=foot.first[direction],start=leading?.08:.53,end=leading?.72:1,progress=smooth(t,start,end);markWorld(actor,foot.marks[0],target);markWorld(actor,foot.marks[direction],ankle);target.lerp(ankle,progress);target.y+=(leading?.075:.043)*Math.sin(Math.PI*progress);const blend=1-smooth(t,.72,1);if(blend)solveFoot(foot,blend);}
function plantFoot(foot,actor,distance,phase,speedWeight){const offset=wrap(phase-foot.phase+.5,1)-.5,lock=(1-smooth(Math.abs(offset),.13,.235))*smooth(speedWeight,.28,.84);if(!lock)return;const d=clamp(distance-offset*actor.stride,0,actor.length);actor.curve.getPointAt(d/actor.length,target);const yaw=headingAt(actor.curve,actor.length,d);target.x+=foot.mid.x*Math.cos(yaw)+foot.mid.z*Math.sin(yaw);target.z+=foot.mid.z*Math.cos(yaw)-foot.mid.x*Math.sin(yaw);foot.bone.getWorldPosition(ankle);target.y=ankle.y;solveFoot(foot,lock);}
function solveFoot(foot,weight){solveChain(foot.thigh,foot.shin,foot.bone,target,weight,true);}
function solveChain(root,middle,end,goal,weight,preserveEnd=false){root.getWorldPosition(hip);middle.getWorldPosition(knee);end.getWorldPosition(ankle);if(preserveEnd)end.getWorldQuaternion(footQ);target.copy(goal).lerp(ankle,1-weight);const a=hip.distanceTo(knee),b=knee.distanceTo(ankle);axis.subVectors(target,hip);const reach=clamp(axis.length(),Math.abs(a-b)+.001,a+b-.0001);axis.normalize();target.copy(hip).addScaledVector(axis,reach);bend.subVectors(knee,hip);bend.addScaledVector(axis,-bend.dot(axis));if(bend.lengthSq()<1e-8)return;bend.normalize();const along=(a*a-b*b+reach*reach)/(2*reach);desiredKnee.copy(hip).addScaledVector(axis,along).addScaledVector(bend,Math.sqrt(Math.max(0,a*a-along*along)));pointJoint(root,hip,knee,desiredKnee);end.getWorldPosition(ankle);pointJoint(middle,desiredKnee,ankle,target);if(preserveEnd){middle.getWorldQuaternion(parentQ);end.quaternion.copy(parentQ.invert()).multiply(footQ);}}

function chooseStation(actor){const banned=new Set(actor.behavior.recent.slice(-2));let choices=stations.map((_,i)=>i).filter(i=>i!==actor.behavior.current&&!banned.has(i));if(!choices.length)choices=stations.map((_,i)=>i).filter(i=>i!==actor.behavior.current);return choices[Math.floor(actor.random()*choices.length)];}
function beginJourney(actor){const destination=chooseStation(actor),route=navPath(actor.behavior.current,destination);actor.curve=roundedPath(route);actor.length=actor.curve.getLength();if(!curveClear(actor.curve,actor.length))actor.curve=roundedPath(route,.0);actor.length=actor.curve.getLength();actor.stride=actor.length/Math.max(2,Math.round(actor.length/(actor.profile.speed*actor.walkDuration)));Object.assign(actor.behavior,{phase:"walk",time:0,destination,startYaw:actor.holder.rotation.y,stationName:stations[destination].name});}
function beginObserve(actor){const b=actor.behavior;Object.assign(b,{phase:"observe",time:0,current:b.destination,pause:5+actor.random()*6,arriveYaw:actor.holder.rotation.y,stationName:stations[b.destination].name});b.recent.push(b.current);b.recent=b.recent.slice(-3);}
function beginDemo(actor,slot){const b=actor.behavior,kind=demoForSlot(slot);Object.assign(b,{phase:"demo",time:0,lastDemoSlot:slot,lastDemoKind:kind,demoKind:kind,demoCount:(b.demoCount||0)+1,demoYaw:actor.holder.rotation.y});}

function evaluatePose(actor,time,weight,distance=0,direction=0){restorePose(actor);actor.rig.position.y=0;actor.hips.position.copy(actor.hipBase);const phase=actor.curve?wrap(distance/actor.stride,1):0;actor.walk.time=phase*actor.walkDuration;actor.idle.time=time%actor.idle.getClip().duration;const blend=smooth(weight,0,1);actor.walk.setEffectiveWeight(blend);actor.idle.setEffectiveWeight(1-blend);actor.mixer.update(0);capturePose(actor);actor.hipBase.copy(actor.hips.position);if(actor.curve)for(const foot of actor.feet){plantFoot(foot,actor,distance,phase,weight);if(direction)transitionFoot(foot,actor,direction,weight);}}
function armTarget(actor,arm,offset,weight){actor.bones.Head.getWorldPosition(headPoint);localTarget.copy(offset).applyQuaternion(actor.holder.quaternion).add(headPoint);solveChain(arm.upper,arm.lower,arm.hand,localTarget,weight);}
function pulse(t,d,edge=.18){return smooth(t,0,d*edge)*(1-smooth(t,d*(1-edge),d));}
function applyDemo(actor,time){
  const b=actor.behavior,kind=b.demoKind,d=demoDurations[kind],strength=pulse(time,d);actor.holder.position.copy(point(b.current));actor.holder.rotation.y=b.demoYaw;evaluatePose(actor,time,0);const euler=new THREE.Euler();
  if(kind==="wave"){
    const arm=actor.arms[actor.index%actor.arms.length],side=arm.side==="Left"?1:-1;armTarget(actor,arm,new THREE.Vector3(side*(.31+.045*Math.sin(time*8)),.33,.03),strength);arm.hand.quaternion.multiply(worldQ.setFromEuler(euler.set(0,0,.22*Math.sin(time*9)*strength)));
  }else if(kind==="point"){
    const arm=actor.arms[actor.index%actor.arms.length],s=stations[b.current];localTarget.set(s.target[0],1.12,s.target[1]);solveChain(arm.upper,arm.lower,arm.hand,localTarget,strength*.82);
  }else if(kind==="clap"){
    const opening=.065+.055*(.5+.5*Math.cos(time*7));for(const arm of actor.arms){const side=arm.side==="Left"?1:-1;armTarget(actor,arm,new THREE.Vector3(side*opening,-.09,.28),strength*.78);}
  }else if(kind==="look-around"){
    actor.bones.Head.quaternion.multiply(worldQ.setFromEuler(euler.set(0,.38*Math.sin(time*1.8)*strength,0)));
  }else if(kind==="nod"){
    actor.bones.Head.quaternion.multiply(worldQ.setFromEuler(euler.set(.16*Math.sin(time*4.2)*strength,0,0)));
  }else if(kind==="bow"){
    actor.bones.Spine2.quaternion.multiply(worldQ.setFromEuler(euler.set(.24*strength,0,0)));
  }else if(kind==="stretch"){
    for(const arm of actor.arms)armTarget(actor,arm,new THREE.Vector3(arm.side==="Left"?.16:-.16,.48,.02),strength*.74);
  }else if(kind==="shoulder-roll"){
    const roll=.18*Math.sin(time*3.6)*strength;for(const arm of actor.arms)arm.upper.quaternion.multiply(worldQ.setFromEuler(euler.set(0,0,arm.side==="Left"?roll:-roll)));
  }
  groundShoes(actor);actor.shadow.material.opacity=.42;return time>=d;
}
function applyGaze(actor,index,strength=1){const s=stations[index],gaze=Math.atan2(s.target[0]-actor.holder.position.x,s.target[1]-actor.holder.position.z),turn=clamp(Math.atan2(Math.sin(gaze-actor.holder.rotation.y),Math.cos(gaze-actor.holder.rotation.y)),-1.05,1.05)*strength;for(const [bone,share] of actor.upperBody){bone.parent.getWorldQuaternion(parentQ);axis.copy(up).applyQuaternion(parentQ.invert());bone.quaternion.premultiply(worldQ.setFromAxisAngle(axis,turn*share));}}

function updateActor(actor,time){
  const b=actor.behavior,dt=b.lastTime===null?0:clamp(time-b.lastTime,0,.25);b.lastTime=time;b.time+=dt;const slot=Math.floor(time/demoPeriod),assigned=slot>0&&(slot-1)%profiles.length===actor.index;
  if(b.phase==="observe"&&assigned&&slot>b.lastDemoSlot)beginDemo(actor,slot);if(!demoOnly&&b.phase==="observe"&&b.time>=b.pause)beginJourney(actor);
  if(b.phase==="walk"){const m=travel(b.time,actor.length,actor.profile.speed);actor.curve.getPointAt(m.distance/actor.length,actor.holder.position);actor.holder.rotation.y=angleMix(b.startYaw,headingAt(actor.curve,actor.length,m.distance),smooth(b.time,0,.82));evaluatePose(actor,time,m.weight,m.distance,m.direction);if(m.done)beginObserve(actor);
  }else if(b.phase==="observe"){actor.holder.position.copy(point(b.current));actor.holder.rotation.y=angleMix(b.arriveYaw??actor.holder.rotation.y,viewYaw(b.current),smooth(b.time,0,1.05));evaluatePose(actor,time,0);applyGaze(actor,b.current,1-smooth(b.time,0,.75));groundShoes(actor);
  }else if(b.phase==="demo"&&applyDemo(actor,b.time)){actor.holder.position.y=0;b.phase="observe";b.time=0;b.pause=3.8+actor.random()*2;}
  actor.holder.userData.visitorState=b.phase;actor.holder.userData.visitorStation=b.stationName;actor.holder.userData.demoKind=b.demoKind||"";actor.holder.userData.demoCount=b.demoCount||0;actor.holder.userData.demoTime=b.phase==="demo"?b.time:0;actor.holder.userData.demoDuration=demoDurations[b.demoKind]||0;actor.holder.userData.demoClip=b.demoKind?"Gesture_"+b.demoKind:"";
  for(const {bone,contact} of actor.feet){bone.getWorldPosition(contact.position);actor.holder.worldToLocal(contact.position);contact.material.opacity=.85*(1-smooth(contact.position.y,.095,.24));contact.position.y=.011;contact.position.z+=.045;}
}
