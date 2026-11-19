import {GLTFLoader} from './vendor/three-0.180/GLTFLoader.js';
import {clone as cloneSkeleton} from './vendor/three-0.180/SkeletonUtils.js';

// Model meshes, photographic textures and materials are shared. Each visible visitor owns a skeleton.
const assets=new Map();
function asset(name){
  if(assets.has(name))return assets.get(name);
  const entry={scene:null};
  assets.set(name,entry);
  new GLTFLoader().load(new URL('./people/'+name+'.glb',import.meta.url).href,gltf=>{
    entry.scene=gltf.scene;
    entry.scene.traverse(node=>{
      if(!node.isMesh)return;
      node.castShadow=true;
      node.receiveShadow=true;
      node.frustumCulled=false;
    });
    window.dispatchEvent(new Event('ringtexture'));
  },undefined,()=>{entry.failed=true;});
  return entry;
}

export function createPeople(scene,THREE){
  const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
  const Q=()=>new THREE.Quaternion();
  const clamp=THREE.MathUtils.clamp;
  const localForward=V(0,0,1), lateral=V(1,0,0), up=V(0,1,0);
  const holders=[],present=new Set();
  const world=(bone)=>bone.getWorldPosition(V());
  const direction=(a,b)=>world(b).sub(world(a)).normalize();
  function rotateWorld(bone,rotation){
    const parent=bone.parent.getWorldQuaternion(Q());
    const correction=parent.clone().invert().multiply(rotation).multiply(parent);
    bone.quaternion.premultiply(correction).normalize();
    bone.updateWorldMatrix(false,true);
  }
  function direct(bone,child,target){
    const old=direction(bone,child),next=target.clone().sub(world(bone));
    if(next.lengthSq()>1e-8)rotateWorld(bone,Q().setFromUnitVectors(old,next.normalize()));
  }
  function basis(along,across){
    const z=along.clone().normalize();
    const x=across.clone().addScaledVector(z,-across.dot(z)).normalize();
    const y=z.clone().cross(x).normalize();
    return Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
  }
  const fingerNames=['Index','Middle','Ring','Pinky'];
  function makeActor(template,name){
    const node=new THREE.Group(), rig=cloneSkeleton(template),bones={};
    node.add(rig);
    rig.traverse(b=>{
      if(b.isBone)bones[b.name.replace(/^mixamorig[:_]?/,'')]=b;
    });
    const required=['Hips','Spine','Spine1','Neck','Head'];
    for(const side of ['Right','Left']){
      required.push(...['Arm','ForeArm','Hand','HandIndex1','HandMiddle1','HandPinky1'].map(k=>side+k));
    }
    if(required.some(k=>!bones[k]))return null;
    scene.add(node);
    const rest=Object.values(bones).map(b=>[b,b.quaternion.clone()]);
    return {node,bones,rest,name,signature:''};
  }
  function removeActor(actor){
    if(!actor)return;
    scene.remove(actor.node);
    const skeletons=new Set();
    actor.node.traverse(node=>{if(node.isSkinnedMesh)skeletons.add(node.skeleton);});
    skeletons.forEach(s=>s.dispose());
  }

  function pose(actor,visitor,index){
    const {node,bones,rest}=actor;
    const active=visitor.role==='user',reach=Number(visitor.reach)||0;
    const supplied=active&&visitor.target?.length===3?V(...visitor.target):null;
    const signature=[visitor.x,visitor.z,visitor.heading,active,reach,index,...(supplied?.toArray()||[])].join('|');
    if(signature===actor.signature)return;
    actor.signature=signature;
    for(const [bone,q] of rest)bone.quaternion.copy(q);
    let yaw=visitor.heading || 0;
    if(supplied){
      const angle=Math.atan2(supplied.x-visitor.x,supplied.z-visitor.z);
      const turn=Math.atan2(Math.sin(angle-yaw),Math.cos(angle-yaw));
      yaw+=clamp(turn*.65,-.70,.70);
    }
    node.position.set(visitor.x,.004,visitor.z);
    node.rotation.y=yaw;
    node.updateWorldMatrix(true,true);
    const sideAxis=lateral.clone().applyAxisAngle(up,yaw);
    const forward=localForward.clone().applyAxisAngle(up,yaw);
    const transformed=v=>v.clone().applyAxisAngle(up,yaw);
    const place=v=>transformed(v).add(node.position);
    const tilt=(bone,axis,angle)=>rotateWorld(bone,Q().setFromAxisAngle(axis,angle));

    // The torso commits to the gesture before the arm extends. Both shoes remain on the floor.
    tilt(bones.Spine,sideAxis,active?.075+Math.min(reach,1.5)*.050:.005);
    tilt(bones.Spine1,forward,active?-.038:(index%2?.024:-.022));
    tilt(bones.Neck,sideAxis,active?.10:.018);
    tilt(bones.Head,up,active?-.055:(index%2?.12:-.13));
    if(supplied){
      // A distant contact is reached by stepping towards it, without scaling the skeleton.
      const shoulder=world(bones.RightArm),toPoint=supplied.clone().sub(shoulder);
      const span=world(bones.RightArm).distanceTo(world(bones.RightForeArm))+
        world(bones.RightForeArm).distanceTo(world(bones.RightHand));
      const horizontal=V(toPoint.x,0,toPoint.z),distance=horizontal.length();
      const allowance=Math.sqrt(Math.max(.025,(span+.018)**2-toPoint.y**2));
      if(distance>allowance){
        node.position.addScaledVector(horizontal.normalize(),distance-allowance);
        node.updateWorldMatrix(true,true);
      }
      const eyes=world(bones.Head),sight=supplied.clone().sub(eyes);
      const azimuth=Math.atan2(sight.dot(sideAxis),sight.dot(forward));
      const descent=Math.atan2(-sight.y,Math.hypot(sight.x,sight.z));
      tilt(bones.Head,up,clamp(azimuth*.45,-.32,.32));
      tilt(bones.Head,sideAxis,clamp(descent*.57-.11,-.20,.36));
    }
    for(const [side,sign] of [['Right',-1],['Left',1]]){
      const arm=bones[side+'Arm'],forearm=bones[side+'ForeArm'],hand=bones[side+'Hand'];
      const f=(finger,n=1)=>bones[side+'Hand'+finger+n];
      const far=active&&side==='Right'&&(supplied||reach>.25);
      const support=active&&side==='Left'&&reach>.45;
      const shoulder=world(arm);
      const a=shoulder.distanceTo(world(forearm)),b=world(forearm).distanceTo(world(hand));
      const knuckles=()=>fingerNames.reduce((v,key)=>v.add(world(f(key))),V()).multiplyScalar(.25);
      const palmLength=world(hand).distanceTo(knuckles())*.62;
      const handAxis=far?V(sign*.07,-.32,.94):support?V(sign*.14,-.58,.80):V(sign*.07,-.99,.10);
      const axis=transformed(handAxis.normalize());
      const thumb=transformed(far||support?V(-sign,.14,.04):V(-sign*.22,.06,1));
      let palm;
      if(far&&supplied)palm=supplied.clone();
      else if(far)palm=place(V(-.17,1.08+.13*Math.min(reach,1),.25+.17*Math.min(reach,1.5)));
      else if(support)palm=place(V(.20,1.05,.19));
      else {
        const resting=actor.name==='emma'?.056:0;
        palm=place(V(sign*(.193+resting*.3),.887+resting+(index%2&&side==='Left'?.045:0),
          .039+(index%2&&side==='Left'?.11:0)));
      }
      const wrist=palm.clone().addScaledVector(axis,-palmLength);
      const delta=wrist.clone().sub(shoulder),distance=delta.length();
      const d=clamp(distance,Math.abs(a-b)+.001,a+b-.001);
      const drive=delta.normalize();
      const pole=transformed(V(sign*.24,-.64,-.24));
      pole.addScaledVector(drive,-pole.dot(drive)).normalize();
      const u=(a*a-b*b+d*d)/(2*d);
      const elbow=shoulder.clone().addScaledVector(drive,u).addScaledVector(pole,Math.sqrt(Math.max(0,a*a-u*u)));
      direct(arm,forearm,elbow);
      direct(forearm,hand,shoulder.clone().addScaledVector(drive,d));
      const oldAxis=knuckles().sub(world(hand));
      const oldThumb=world(f('Index')).sub(world(f('Pinky')));
      const palmRotation=basis(axis,thumb).multiply(basis(oldAxis,oldThumb).invert());
      rotateWorld(hand,palmRotation);
      // Flex around the anatomical knuckle axis. The index stays legible when indicating a control.
      const across=world(f('Index')).sub(world(f('Pinky'))).normalize().multiplyScalar(-sign);
      fingerNames.forEach((finger,i)=>{
        const curl=far?(finger==='Index'?.045:.16+.047*i):support?.14:.07+.025*i;
        for(const n of [1,2,3])if(f(finger,n))tilt(f(finger,n),across,curl*(n===2?.80:n===3?.35:.60));
      });
    }
    node.updateWorldMatrix(false,true);
  }

  return {
    sync(visitors=[]){
      present.clear();
      const tally={user:0,guest:0};
      visitors.forEach((v,i)=>{
        const role=v.role==='user'?'user':'guest',rank=tally[role]++;
        const name=(role==='user'?rank%2===0:rank%2===1)?'emma':'ethan';
        const entry=asset(name);
        let actor=holders[i];
        if(actor&&actor.name!==name){removeActor(actor);holders[i]=actor=null;}
        if(!entry.scene)return;
        if(!actor)holders[i]=actor=makeActor(entry.scene,name);
        if(!actor)return;
        actor.node.visible=true;
        pose(actor,v,i);
        present.add(v);
      });
      for(let i=visitors.length;i<holders.length;i++)if(holders[i])holders[i].node.visible=false;
    },
    readyFor(visitor){return present.has(visitor);},
    dispose(){holders.forEach(removeActor);holders.length=0;present.clear();}
  };
}
