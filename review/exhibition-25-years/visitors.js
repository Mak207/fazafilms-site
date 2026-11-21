import * as THREE from "three";

const routes = [
  {
    model: "woman", stance: {Right: .25, Left: .75}, speed: .967, offset: 13.5, pause: 3.8, look: [-6.1,-5.8],
    points: [[-5,-5.8],[-4.8,-7],[-3.75,-7.65],[-2.52,-7.04],[-1.7,-5.72],[-1.7,-3.53],[-1.90,-1.5],[-2.35,.8],[-2.31,3.15],[-2.46,4.18],[-3.16,4.86],[-4.35,4.62],[-4.82,3.46],[-4.92,1.12],[-4.96,-1.60],[-5.01,-3.7]]
  },
  {
    model: "man", stance: {Left: .24, Right: .74}, speed: .874, offset: 6.2, pause: 4.5, look: [3.55,2.55],
    points: [[2.34,2.55],[2.17,.92],[2.36,-1.15],[3.41,-1.82],[4.50,-1.48],[4.86,-.14],[4.86,1.65],[4.84,3.7],[4.54,5.18],[3.74,6.48],[2.85,6.89],[2.4,6.2],[2.41,4.56]]
  }
];

// One lap starts at an exhibit. Integrating the acceleration ramps gives the
// travelled distance; that same distance advances the gait and its footfalls.
const ramp = 1.22;
function lap(time, length, speed, pause) {
  const travel = length/speed + ramp;
  const t = time % (pause+travel) - pause;
  if (t <= 0) return {distance:0, weight:0, direction:0, rest:t+pause};
  if (t < ramp) return {distance:speed*t*t/(2*ramp),weight:t/ramp,direction:1};
  const remaining = travel-t;
  if (remaining < ramp) return {distance:length-speed*remaining*remaining/(2*ramp),weight:remaining/ramp,direction:-1};
  return {distance:speed*(t-ramp/2),weight:1,direction:0};
}

export function addWalkers(scene, loader, contactMaterial) {
  const actors = [];
  for (const route of routes) {
    loader.load(`./assets/models/visitors/walking-${route.model}.glb?v=39`, ({scene:rig, animations}) => {
      const holder = new THREE.Group();
      holder.name = "visitor-"+route.model;
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(.76,.56), contactMaterial);
      shadow.rotation.x = -Math.PI/2;
      shadow.position.y = .009;
      holder.add(shadow, rig);
      const feet=[];
      const bones = {};
      rig.traverse(bone => { if (bone.isBone) bones[bone.name.replace(/^mixamorig:?/, "")] = bone; });
      rig.traverse(bone => {
        if(!bone.isBone || !/(Left|Right)Foot$/.test(bone.name)) return;
        const contact=new THREE.Mesh(new THREE.PlaneGeometry(.18,.31),contactMaterial.clone());
        contact.rotation.x=-Math.PI/2;
        holder.add(contact);
        const side = bone.name.endsWith("LeftFoot") ? "Left" : "Right";
        feet.push({bone, contact, shin:bone.parent, thigh:bone.parent.parent, phase:route.stance[side],
          mid:new THREE.Vector3()});
      });
      rig.traverse(object => { if (object.isSkinnedMesh) object.frustumCulled=false; });
      const mixer = new THREE.AnimationMixer(rig);
      const action = name => mixer.clipAction(THREE.AnimationClip.findByName(animations,name)).play();
      const curve = new THREE.CatmullRomCurve3(route.points.map(([x,z])=>new THREE.Vector3(x,0,z)),true);
      curve.arcLengthDivisions=512;
      const actor={route,holder,feet,curve,mixer,walk:action("Walk"),idle:action("Observe"),length:curve.getLength()};
      actor.rig=rig;
      actor.soles=outsoleSamples(rig);
      actor.upperBody = [[bones.Spine2, .22], [bones.Neck, .32], [bones.Head, .46]].filter(([bone])=>bone);
      actor.savedPose = [...feet.flatMap(f=>[f.thigh,f.shin,f.bone]), ...actor.upperBody.map(([b])=>b)]
        .map(bone=>({bone, rotation:bone.quaternion.clone()}));
      const duration = actor.walk.getClip().duration;
      // End each circuit in the same double-support pose as the next departure.
      actor.stride = actor.length / Math.round(actor.length / (route.speed * duration));
      actor.idle.setEffectiveWeight(0);
      for (const foot of feet) {
        actor.walk.time = duration * foot.phase;
        mixer.update(0);
        foot.bone.getWorldPosition(foot.mid);
      }
      actor.hips = bones.Hips;
      actor.hipBase = bones.Hips.position.clone();
      planSteps(actor);
      capturePose(actor);
      updateActor(actor,0);
      actors.push(actor);
      scene.add(holder);
    });
  }
  return time => { for(const actor of actors) updateActor(actor,time); };
}

// Use a short chord of the route for the pelvis direction, including across the lap seam.
const ahead = new THREE.Vector3(), behind = new THREE.Vector3();
const wrap = THREE.MathUtils.euclideanModulo, smooth = THREE.MathUtils.smoothstep;
function headingAt(curve, length, distance) {
  curve.getPointAt(wrap((distance+.16)/length,1), ahead);
  curve.getPointAt(wrap((distance-.16)/length,1), behind);
  return Math.atan2(ahead.x-behind.x, ahead.z-behind.z);
}

function capturePose(actor) {
  for (const {bone,rotation} of actor.savedPose) rotation.copy(bone.quaternion);
}

const hip = new THREE.Vector3(), knee = new THREE.Vector3(), ankle = new THREE.Vector3();
const target = new THREE.Vector3(), bend = new THREE.Vector3(), axis = new THREE.Vector3();
const desiredKnee = new THREE.Vector3(), from = new THREE.Vector3(), to = new THREE.Vector3();
const worldQ = new THREE.Quaternion(), parentQ = new THREE.Quaternion(), footQ = new THREE.Quaternion();
const up = new THREE.Vector3(0,1,0);

function pointJoint(bone, origin, child, goal) {
  from.subVectors(child,origin).normalize();
  to.subVectors(goal,origin).normalize();
  bone.getWorldQuaternion(worldQ);
  bone.parent.getWorldQuaternion(parentQ);
  bone.quaternion.setFromUnitVectors(from,to).multiply(worldQ).premultiply(parentQ.invert());
}

// Keep a sparse sample of the actual outsole, including the heel and toe edges.
const shoePoint=new THREE.Vector3();
function outsoleSamples(rig) {
  rig.updateMatrixWorld(true);
  const samples=[];
  rig.traverse(mesh=>{
    if(!mesh.isSkinnedMesh) return;
    const cells=new Map();
    for(let i=0;i<mesh.geometry.attributes.position.count;i++) {
      mesh.getVertexPosition(i,shoePoint).applyMatrix4(mesh.matrixWorld);
      if(shoePoint.y>.035) continue;
      const key=Math.floor(shoePoint.x/.04)+","+Math.floor(shoePoint.z/.045);
      if(!cells.has(key) || shoePoint.y<cells.get(key).y) cells.set(key,{i,y:shoePoint.y});
    }
    if(cells.size) samples.push({mesh,indices:Array.from(cells.values(),c=>c.i)});
  });
  return samples;
}

function groundShoes(actor) {
  actor.holder.updateMatrixWorld(true);
  let lowest=Infinity;
  for(const {mesh,indices} of actor.soles) {
    for(const i of indices){
      mesh.getVertexPosition(i,shoePoint).applyMatrix4(mesh.matrixWorld);
      lowest=Math.min(lowest,shoePoint.y);
    }
  }
  if(Number.isFinite(lowest)) actor.rig.position.y=.001-lowest;
}

function planSteps(actor) {
  const {feet,route,curve,length,stride,holder,idle,walk,mixer}=actor;
  // Measure both shoes on this rig at the exact gait phases that bound the transition.
  for (const direction of [0,-1,1]) {
    const d=direction*route.speed*ramp/2;
    curve.getPointAt(wrap(d/length,1),holder.position);
    holder.rotation.y=headingAt(curve,length,d);
    walk.setEffectiveWeight(direction===0 ? 0 : 1);
    idle.setEffectiveWeight(direction===0 ? 1 : 0);
    idle.time=0;
    walk.time=walk.getClip().duration*wrap(d/stride,1);
    mixer.update(0);
    for(const f of feet) {
      f.marks ??= {};
      f.marks[direction]=f.bone.getWorldPosition(new THREE.Vector3());
    }
  }
  for(const direction of [-1,1]){
    const first=feet.reduce((a,b)=>a.marks[direction].distanceTo(a.marks[0])>b.marks[direction].distanceTo(b.marks[0]) ? a : b);
    for(const f of feet){
      f.first ??= {};
      f.first[direction]=f===first;
    }
  }
}

function transitionFoot(foot,direction,t) {
  const leading=foot.first[direction];
  const start=leading ? .08 : .53, end=leading ? .72 : 1;
  const progress=smooth(t,start,end);
  target.copy(foot.marks[0]).lerp(foot.marks[direction],progress);
  target.y+=(leading ? .075 : .043)*Math.sin(Math.PI*progress);
  // Match velocity on entering the captured stride as well as position.
  const blend=1-smooth(t,.72,1);
  if(blend) solveFoot(foot,blend);
}

function plantFoot(foot, actor, distance, phase, speedWeight) {
  // Lock the flat part of stance. Keep the captured heel strike, toe-off and swing.
  const offset = wrap(phase-foot.phase+.5,1)-.5;
  const lock = (1-smooth(Math.abs(offset),.13,.235))*smooth(speedWeight,.28,.84);
  if (!lock) return;
  const {curve,length,stride} = actor;
  const anchorDistance = distance-offset*stride;
  curve.getPointAt(wrap(anchorDistance/length,1),target);
  const yaw = headingAt(curve,length,anchorDistance);
  target.x += foot.mid.x*Math.cos(yaw)+foot.mid.z*Math.sin(yaw);
  target.z += foot.mid.z*Math.cos(yaw)-foot.mid.x*Math.sin(yaw);
  foot.bone.getWorldPosition(ankle);
  target.y=ankle.y;
  solveFoot(foot,lock);
}

function solveFoot(foot,lock) {
  foot.thigh.getWorldPosition(hip);
  foot.shin.getWorldPosition(knee);
  foot.bone.getWorldPosition(ankle);
  foot.bone.getWorldQuaternion(footQ);
  target.lerp(ankle,1-lock);
  const thighLength=hip.distanceTo(knee), shinLength=knee.distanceTo(ankle);
  axis.subVectors(target,hip);
  const reach=THREE.MathUtils.clamp(axis.length(),Math.abs(thighLength-shinLength)+.001,thighLength+shinLength-.0001);
  axis.normalize();
  bend.subVectors(knee,hip);
  bend.addScaledVector(axis,-bend.dot(axis));
  if (bend.lengthSq()<1e-8) return;
  bend.normalize();
  const along=(thighLength**2-shinLength**2+reach**2)/(2*reach);
  desiredKnee.copy(hip).addScaledVector(axis,along).addScaledVector(bend,Math.sqrt(Math.max(0,thighLength**2-along**2)));
  pointJoint(foot.thigh,hip,knee,desiredKnee);
  foot.bone.getWorldPosition(ankle);
  pointJoint(foot.shin,desiredKnee,ankle,target);
  foot.shin.getWorldQuaternion(parentQ);
  foot.bone.quaternion.copy(parentQ.invert()).multiply(footQ);
}

function updateActor(actor,time) {
  const {route,holder,feet,curve,mixer,walk,idle,length,stride} = actor;
  const {distance,weight,direction,rest}=lap(time+route.offset,length,route.speed,route.pause);
  const phase=wrap(distance/stride,1);
  curve.getPointAt(distance/length,holder.position);
  const heading=headingAt(curve,length,distance);
  holder.rotation.y=heading;

  // Restore sampled rotations before evaluating a new frame (also when time stands still).
  for (const {bone,rotation} of actor.savedPose) bone.quaternion.copy(rotation);
  actor.rig.position.y=0;
  actor.hips.position.copy(actor.hipBase);
  walk.time=phase*walk.getClip().duration;
  idle.time=time%idle.getClip().duration;
  const blend=smooth(weight,0,1);
  walk.setEffectiveWeight(blend);
  idle.setEffectiveWeight(1-blend);
  mixer.update(0);
  capturePose(actor);
  actor.hipBase.copy(actor.hips.position);
  // Shift over the supporting shoe before the other heel leaves the floor.
  const departSupport=feet.find(f=>!f.first[1]);
  const supportSign=departSupport.bone.name.endsWith("LeftFoot") ? 1 : -1;
  const prep=rest!==undefined ? smooth(rest,route.pause-.42,route.pause) :
    direction===1 ? 1-smooth(weight,0,.52) : 0;
  actor.hips.position.x+=supportSign*.024*prep;
  if(direction) actor.hips.position.z+=direction*.018*Math.sin(Math.PI*weight);
  for (const foot of feet) {
    plantFoot(foot,actor,distance,phase,weight);
    if(direction) transitionFoot(foot,direction,weight);
    else if(rest!==undefined) {target.copy(foot.marks[0]);solveFoot(foot,1);}
  }

  const gaze=Math.atan2(route.look[0]-holder.position.x,route.look[1]-holder.position.z);
  const nearStop=Math.min(distance,length-distance);
  const turn=THREE.MathUtils.clamp(Math.atan2(Math.sin(gaze-heading),Math.cos(gaze-heading)),-1.05,1.05)
    * (1-smooth(nearStop,.10,1.18));
  for (const [bone,share] of actor.upperBody) {
    bone.parent.getWorldQuaternion(parentQ);
    axis.copy(up).applyQuaternion(parentQ.invert());
    bone.quaternion.premultiply(worldQ.setFromAxisAngle(axis,turn*share));
  }
  groundShoes(actor);
  for(const {bone,contact} of feet) {
    bone.getWorldPosition(contact.position);
    holder.worldToLocal(contact.position);
    contact.material.opacity=.85*(1-smooth(contact.position.y,.095,.24));
    contact.position.y=.011;
    contact.position.z+=.045;
  }
}
