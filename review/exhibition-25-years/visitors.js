import * as THREE from "three";

const routes = [
  {
    model: "woman", speed: .967, offset: 13.5, pause: 3.8, look: [-6.1,-5.8],
    points: [[-5,-5.8],[-4.8,-7],[-3.75,-7.65],[-2.52,-7.04],[-1.7,-5.72],[-1.7,-3.53],[-1.90,-1.5],[-2.35,.8],[-2.31,3.15],[-2.46,4.18],[-3.16,4.86],[-4.35,4.62],[-4.82,3.46],[-4.92,1.12],[-4.96,-1.60],[-5.01,-3.7]]
  },
  {
    model: "man", speed: .874, offset: 6.2, pause: 4.5, look: [3.55,2.55],
    points: [[2.34,2.55],[2.17,.92],[2.36,-1.15],[3.41,-1.82],[4.50,-1.48],[4.86,-.14],[4.86,1.65],[4.84,3.7],[4.54,5.18],[3.74,6.48],[2.85,6.89],[2.4,6.2],[2.41,4.56]]
  }
];

// One lap starts at an exhibit. Integrating the acceleration ramps gives the
// travelled distance; that same distance advances the gait and its footfalls.
function lap(time, length, speed, pause) {
  const ramp = .85;
  const travel = length/speed + ramp;
  const t = time % (pause+travel) - pause;
  if (t <= 0) return {distance:0, weight:0};
  if (t < ramp) return {distance:speed*t*t/(2*ramp),weight:t/ramp};
  const remaining = travel-t;
  if (remaining < ramp) return {distance:length-speed*remaining*remaining/(2*ramp),weight:remaining/ramp};
  return {distance:speed*(t-ramp/2),weight:1};
}

export function addWalkers(scene, loader, contactMaterial) {
  const actors = [];
  for (const route of routes) {
    loader.load(`./assets/models/visitors/walking-${route.model}.glb`, ({scene:rig, animations}) => {
      const holder = new THREE.Group();
      holder.name = "visitor-"+route.model;
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(.76,.56), contactMaterial);
      shadow.rotation.x = -Math.PI/2;
      shadow.position.y = .009;
      holder.add(shadow, rig);
      const feet=[];
      rig.traverse(bone => {
        if(!bone.isBone || !/(Left|Right)Foot$/.test(bone.name)) return;
        const contact=new THREE.Mesh(new THREE.PlaneGeometry(.18,.31),contactMaterial.clone());
        contact.rotation.x=-Math.PI/2;
        holder.add(contact);
        feet.push({bone,contact});
      });
      rig.traverse(object => { if (object.isSkinnedMesh) object.frustumCulled=false; });
      const mixer = new THREE.AnimationMixer(rig);
      const action = name => mixer.clipAction(THREE.AnimationClip.findByName(animations,name)).play();
      const curve = new THREE.CatmullRomCurve3(route.points.map(([x,z])=>new THREE.Vector3(x,0,z)),true);
      curve.arcLengthDivisions=512;
      const actor={route,holder,feet,curve,mixer,walk:action("Walk"),idle:action("Observe"),length:curve.getLength()};
      updateActor(actor,performance.now()/1000);
      actors.push(actor);
      scene.add(holder);
    });
  }
  return time => { for(const actor of actors) updateActor(actor,time); };
}

const tangent = new THREE.Vector3();
function updateActor({route,holder,feet,curve,mixer,walk,idle,length},time) {
  const {distance,weight}=lap(time+route.offset,length,route.speed,route.pause);
  const u=distance/length;
  curve.getPointAt(u,holder.position);
  curve.getTangentAt(u,tangent);
  const heading=Math.atan2(tangent.x,tangent.z);
  const gaze=Math.atan2(route.look[0]-holder.position.x,route.look[1]-holder.position.z);
  const turn=Math.atan2(Math.sin(gaze-heading),Math.cos(gaze-heading));
  holder.rotation.y=heading+turn*(1-THREE.MathUtils.smoothstep(weight,0,1));
  walk.time=(distance/route.speed)%walk.getClip().duration;
  idle.time=time%idle.getClip().duration;
  walk.setEffectiveWeight(weight);
  idle.setEffectiveWeight(1-weight);
  mixer.update(0);
  for(const {bone,contact} of feet) {
    bone.getWorldPosition(contact.position);
    holder.worldToLocal(contact.position);
    contact.material.opacity=.85*(1-THREE.MathUtils.smoothstep(contact.position.y,.095,.24));
    contact.position.y=.011;
    contact.position.z+=.045;
  }
}
