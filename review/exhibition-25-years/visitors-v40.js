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
  {name:"Видеокуб",position:[-1.72,-.35],target:[0,-.35]}
];

// A small navigation graph follows the real aisles and keeps planned routes out
// of the six plinth envelopes. The first six nodes are the viewing stations.
const nodes=[...stations.map(s=>s.position),[-5,-1],[-5,3.8],[-3,7.7],[0,7.8],[3,7.7],[5,3.8],[5,-1],[-5,-6.5],[-2.5,-7.6],[2.5,-7.6],[5,-6.5],[0,-2.2],[-2.5,-.45],[2.5,-.45],[-2.8,3.55],[2.8,3.55],[-2.35,-1.7],[2.35,-1.7]];
const edges=[[0,6],[0,18],[1,12],[1,19],[2,20],[2,21],[3,6],[3,22],[4,12],[4,23],[5,18],[5,22],[6,7],[6,13],[6,22],[7,8],[7,20],[8,9],[9,10],[10,11],[11,21],[11,12],[12,16],[12,23],[13,14],[14,15],[15,16],[17,22],[17,23],[18,22],[19,23]];
const links=nodes.map(()=>[]);for(const [a,b] of edges){links[a].push(b);links[b].push(a);}
const ramp=1.18,params=new URLSearchParams(location.search),demoPeriod=Math.max(1,Number(params.get("visitorDemoEvery"))||300),demoOnly=params.has("visitorDemoOnly");
const sessionSeed=(Number(params.get("visitorSeed"))||crypto.getRandomValues(new Uint32Array(1))[0])>>>0;
const demoKinds=["Greeting","Clapping","HeadNod","Reject","Confused","Kneel","Meditate","Burpee","Pushup","JumpingJacks","Jump","Roll","Dodge","Moonwalk","DanceSimple","Charleston","Victory","Kick","Backflip","Tumbling","PowerUp"];
const forcedDemo=params.get("visitorDemoAction");
const smooth=THREE.MathUtils.smoothstep,clamp=THREE.MathUtils.clamp,wrap=THREE.MathUtils.euclideanModulo;

function rng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function demoForSlot(slot){
  if(forcedDemo&&demoKinds.includes(forcedDemo))return forcedDemo;
  const cycle=Math.floor((slot-1)/demoKinds.length),random=rng(0x45f21a9^cycle^sessionSeed),bag=demoKinds.slice();
  for(let i=bag.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}
  return bag[(slot-1)%bag.length];
}
function point(index){return new THREE.Vector3(nodes[index][0],0,nodes[index][1]);}
function viewYaw(index){const s=stations[index];return Math.atan2(s.target[0]-s.position[0],s.target[1]-s.position[1]);}
function angleMix(a,b,t){return a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;}

function shortestPath(start,goal){
  const open=[start],cost=new Array(nodes.length).fill(Infinity),previous=new Array(nodes.length).fill(-1);cost[start]=0;
  while(open.length){let best=0;for(let i=1;i<open.length;i++)if(cost[open[i]]<cost[open[best]])best=i;const current=open.splice(best,1)[0];if(current===goal)break;
    for(const next of links[current]){const c=cost[current]+Math.hypot(nodes[next][0]-nodes[current][0],nodes[next][1]-nodes[current][1]);if(c>=cost[next])continue;cost[next]=c;previous[next]=current;open.push(next);}
  }
  const route=[];for(let cursor=goal;cursor>=0;cursor=previous[cursor]){route.push(point(cursor));if(cursor===start)break;}return route.reverse();
}
function roundedPath(points){
  const path=new THREE.CurvePath(),line=(a,b)=>{if(a.distanceToSquared(b)>1e-6)path.add(new THREE.LineCurve3(a.clone(),b.clone()));};let current=points[0].clone();
  for(let i=1;i<points.length-1;i++){const previous=points[i-1],corner=points[i],next=points[i+1],radius=Math.min(.34,corner.distanceTo(previous)*.24,corner.distanceTo(next)*.24);const entry=corner.clone().lerp(previous,radius/corner.distanceTo(previous)),exit=corner.clone().lerp(next,radius/corner.distanceTo(next));line(current,entry);path.add(new THREE.QuadraticBezierCurve3(entry,corner.clone(),exit));current=exit;}
  line(current,points.at(-1));return path;
}
function travel(time,length,speed){const total=length/speed+ramp;if(time>=total)return{distance:length,weight:0,direction:-1,done:true};if(time<ramp)return{distance:speed*time*time/(2*ramp),weight:time/ramp,direction:1};const remaining=total-time;if(remaining<ramp)return{distance:length-speed*remaining*remaining/(2*ramp),weight:remaining/ramp,direction:-1};return{distance:speed*(time-ramp/2),weight:1,direction:0};}

export function addWalkers(scene,loader,contactMaterial){
  const actors=[];
  profiles.forEach((profile,index)=>loader.load(`./assets/models/visitors/walking-${profile.model}.glb?v=40`,({scene:rig,animations})=>{
    const holder=new THREE.Group();holder.name="visitor-"+profile.model;const shadow=new THREE.Mesh(new THREE.PlaneGeometry(.76,.56),contactMaterial.clone());shadow.rotation.x=-Math.PI/2;shadow.position.y=.009;holder.add(shadow,rig);
    const bones={},feet=[];rig.traverse(b=>{if(b.isBone)bones[b.name.replace(/^mixamorig:?/,"")]=b;});
    rig.traverse(b=>{if(!b.isBone||!/(Left|Right)Foot$/.test(b.name))return;const contact=new THREE.Mesh(new THREE.PlaneGeometry(.18,.31),contactMaterial.clone());contact.rotation.x=-Math.PI/2;holder.add(contact);const side=b.name.endsWith("LeftFoot")?"Left":"Right";feet.push({bone:b,contact,shin:b.parent,thigh:b.parent.parent,phase:profile.stance[side],mid:new THREE.Vector3(),side});});
    rig.traverse(o=>{if(o.isSkinnedMesh)o.frustumCulled=false;});const mixer=new THREE.AnimationMixer(rig),action=n=>mixer.clipAction(THREE.AnimationClip.findByName(animations,n)).play();
    const actor={profile,index,holder,rig,bones,feet,mixer,walk:action("Walk"),idle:action("Observe"),shadow,random:rng(profile.seed^sessionSeed),demoActions:new Map()};for(const clip of animations.filter(c=>c.name.startsWith("Demo_"))){const a=mixer.clipAction(clip);a.loop=THREE.LoopOnce;a.clampWhenFinished=true;a.enabled=true;a.setEffectiveWeight(0);actor.demoActions.set(clip.name.slice(5),a);}
    actor.soles=outsoleSamples(rig);actor.hips=bones.Hips;actor.hipBase=bones.Hips.position.clone();actor.upperBody=[[bones.Spine2,.22],[bones.Neck,.32],[bones.Head,.46]].filter(([b])=>b);actor.arms=["Left","Right"].map(side=>({side,upper:bones[side+"Arm"],lower:bones[side+"ForeArm"],hand:bones[side+"Hand"]})).filter(a=>a.upper&&a.lower&&a.hand);
    actor.savedPose=[...feet.flatMap(f=>[f.thigh,f.shin,f.bone]),...actor.upperBody.map(([b])=>b),...actor.arms.flatMap(a=>[a.upper,a.lower,a.hand])].filter((b,i,a)=>a.indexOf(b)===i).map(bone=>({bone,rotation:bone.quaternion.clone()}));
    actor.walkDuration=actor.walk.getClip().duration;actor.stride=profile.speed*actor.walkDuration;actor.idle.setEffectiveWeight(1);actor.walk.setEffectiveWeight(0);holder.position.copy(point(profile.start));holder.rotation.y=viewYaw(profile.start);
    actor.behavior={phase:"observe",time:index*1.7,current:profile.start,recent:[profile.start],pause:4.8+actor.random()*4,lastTime:null,lastDemoSlot:0,stationName:stations[profile.start].name};
    for(const foot of feet){actor.walk.time=actor.walkDuration*foot.phase;mixer.update(0);foot.bone.getWorldPosition(foot.mid);}sampleTransitions(actor);capturePose(actor);updateActor(actor,0);actors.push(actor);scene.add(holder);
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
function solveChain(root,middle,end,goal,weight,preserveEnd=false){root.getWorldPosition(hip);middle.getWorldPosition(knee);end.getWorldPosition(ankle);if(preserveEnd)end.getWorldQuaternion(footQ);target.copy(goal).lerp(ankle,1-weight);const a=hip.distanceTo(knee),b=knee.distanceTo(ankle);axis.subVectors(target,hip);const reach=clamp(axis.length(),Math.abs(a-b)+.001,a+b-.0001);axis.normalize();bend.subVectors(knee,hip);bend.addScaledVector(axis,-bend.dot(axis));if(bend.lengthSq()<1e-8)return;bend.normalize();const along=(a*a-b*b+reach*reach)/(2*reach);desiredKnee.copy(hip).addScaledVector(axis,along).addScaledVector(bend,Math.sqrt(Math.max(0,a*a-along*along)));pointJoint(root,hip,knee,desiredKnee);end.getWorldPosition(ankle);pointJoint(middle,desiredKnee,ankle,target);if(preserveEnd){middle.getWorldQuaternion(parentQ);end.quaternion.copy(parentQ.invert()).multiply(footQ);}}

function chooseStation(actor){const banned=new Set(actor.behavior.recent.slice(-2));let choices=stations.map((_,i)=>i).filter(i=>i!==actor.behavior.current&&!banned.has(i));if(!choices.length)choices=stations.map((_,i)=>i).filter(i=>i!==actor.behavior.current);return choices[Math.floor(actor.random()*choices.length)];}
function beginJourney(actor){const destination=chooseStation(actor);actor.curve=roundedPath(shortestPath(actor.behavior.current,destination));actor.length=actor.curve.getLength();actor.stride=actor.length/Math.max(2,Math.round(actor.length/(actor.profile.speed*actor.walkDuration)));Object.assign(actor.behavior,{phase:"walk",time:0,destination,startYaw:actor.holder.rotation.y,stationName:stations[destination].name});}
function beginObserve(actor){const b=actor.behavior;Object.assign(b,{phase:"observe",time:0,current:b.destination,pause:5+actor.random()*6,arriveYaw:actor.holder.rotation.y,stationName:stations[b.destination].name});b.recent.push(b.current);b.recent=b.recent.slice(-3);}
function beginDemo(actor,slot){const b=actor.behavior,kind=demoForSlot(slot),demo=actor.demoActions.get(kind);if(!demo){b.lastDemoSlot=slot;return;}for(const a of actor.demoActions.values())a.stop().setEffectiveWeight(0);demo.reset().play();Object.assign(b,{phase:"demo",time:0,lastDemoSlot:slot,lastDemoKind:kind,demoKind:kind,demoCount:(b.demoCount||0)+1,demoYaw:actor.holder.rotation.y,demo});}

function evaluatePose(actor,time,weight,distance=0,direction=0){restorePose(actor);actor.rig.position.y=0;actor.hips.position.copy(actor.hipBase);const phase=actor.curve?wrap(distance/actor.stride,1):0;actor.walk.time=phase*actor.walkDuration;actor.idle.time=time%actor.idle.getClip().duration;const blend=smooth(weight,0,1);actor.walk.setEffectiveWeight(blend);actor.idle.setEffectiveWeight(1-blend);actor.mixer.update(0);capturePose(actor);actor.hipBase.copy(actor.hips.position);if(actor.curve)for(const foot of actor.feet){plantFoot(foot,actor,distance,phase,weight);if(direction)transitionFoot(foot,actor,direction,weight);}}
function applyDemo(actor,time){
  const b=actor.behavior,d=b.demo.getClip().duration,blendIn=Math.min(.20,d*.22),blendOut=Math.min(.28,d*.24),weight=smooth(time,0,blendIn)*(1-smooth(time,d-blendOut,d));actor.holder.position.copy(point(b.current));actor.holder.rotation.y=b.demoYaw;restorePose(actor);actor.rig.position.y=0;actor.hips.position.copy(actor.hipBase);actor.walk.setEffectiveWeight(0);actor.idle.time=time%actor.idle.getClip().duration;actor.idle.setEffectiveWeight(1-weight);b.demo.time=Math.min(time,d);b.demo.setEffectiveWeight(weight);actor.mixer.update(0);actor.shadow.material.opacity=.42*(1-.58*smooth(actor.hips.position.y,.18,.55));return time>=d;
}
function applyGaze(actor,index,strength=1){const s=stations[index],gaze=Math.atan2(s.target[0]-actor.holder.position.x,s.target[1]-actor.holder.position.z),turn=clamp(Math.atan2(Math.sin(gaze-actor.holder.rotation.y),Math.cos(gaze-actor.holder.rotation.y)),-1.05,1.05)*strength;for(const [bone,share] of actor.upperBody){bone.parent.getWorldQuaternion(parentQ);axis.copy(up).applyQuaternion(parentQ.invert());bone.quaternion.premultiply(worldQ.setFromAxisAngle(axis,turn*share));}}

function updateActor(actor,time){
  const b=actor.behavior,dt=b.lastTime===null?0:clamp(time-b.lastTime,0,.25);b.lastTime=time;b.time+=dt;const slot=Math.floor(time/demoPeriod),assigned=slot>0&&(slot-1)%profiles.length===actor.index;
  if(b.phase==="observe"&&assigned&&slot>b.lastDemoSlot)beginDemo(actor,slot);if(!demoOnly&&b.phase==="observe"&&b.time>=b.pause)beginJourney(actor);
  if(b.phase==="walk"){const m=travel(b.time,actor.length,actor.profile.speed);actor.curve.getPointAt(m.distance/actor.length,actor.holder.position);actor.holder.rotation.y=angleMix(b.startYaw,headingAt(actor.curve,actor.length,m.distance),smooth(b.time,0,.82));evaluatePose(actor,time,m.weight,m.distance,m.direction);if(m.done)beginObserve(actor);
  }else if(b.phase==="observe"){actor.holder.position.copy(point(b.current));actor.holder.rotation.y=angleMix(b.arriveYaw??actor.holder.rotation.y,viewYaw(b.current),smooth(b.time,0,1.05));evaluatePose(actor,time,0);applyGaze(actor,b.current,1-smooth(b.time,0,.75));groundShoes(actor);
  }else if(b.phase==="demo"&&applyDemo(actor,b.time)){actor.holder.position.y=0;b.phase="observe";b.time=0;b.pause=3.8+actor.random()*2;}
  actor.holder.userData.visitorState=b.phase;actor.holder.userData.visitorStation=b.stationName;actor.holder.userData.demoKind=b.demoKind||"";actor.holder.userData.demoCount=b.demoCount||0;actor.holder.userData.demoTime=b.phase==="demo"?b.time:0;actor.holder.userData.demoDuration=b.demo?.getClip().duration||0;actor.holder.userData.demoClip=b.demo?.getClip().name||"";
  for(const {bone,contact} of actor.feet){bone.getWorldPosition(contact.position);actor.holder.worldToLocal(contact.position);contact.material.opacity=.85*(1-smooth(contact.position.y,.095,.24));contact.position.y=.011;contact.position.z+=.045;}
}
