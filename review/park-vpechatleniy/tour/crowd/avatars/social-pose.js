// Procedural social gestures on the existing skeleton. No replacement GLB/engine.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const canonical=name=>name.replace(/^mixamorig:?/i,'');
export const SOCIAL_VISUAL_PHASES=Object.freeze({look:1,photo:2,selfie:3,group:4,pose:5,phone:6,gather:1});
export function socialVisualCode(social,stopped=true){
  if(!social||!stopped)return 0;
  if(social.phase==='photo')return social.photoStyle==='selfie'?3:social.photoStyle==='group'?4:2;
  return SOCIAL_VISUAL_PHASES[social.phase]||0;
}

export function createPhoneResources(THREE){
  const bodyGeometry=new THREE.BoxGeometry(.084,.154,.014),screenGeometry=new THREE.PlaneGeometry(.071,.132);
  const lensGeometry=new THREE.CylinderGeometry(.009,.009,.003,8),buttonGeometry=new THREE.CircleGeometry(.006,12);
  lensGeometry.rotateX(Math.PI/2);
  const bodyMaterial=new THREE.MeshStandardMaterial({color:0x202b33,metalness:.35,roughness:.55});
  const screenMaterial=new THREE.MeshStandardMaterial({color:0x92bac6,emissive:0x335e72,emissiveIntensity:.45,roughness:.5});
  const lensMaterial=new THREE.MeshStandardMaterial({color:0x090e16,metalness:.5,roughness:.25});
  const buttonMaterial=new THREE.MeshBasicMaterial({color:0xf0f6f4});
  return {
    create(){
      const group=new THREE.Group();group.name='Visitor smartphone';group.userData.phone=true;
      const body=new THREE.Mesh(bodyGeometry,bodyMaterial),screen=new THREE.Mesh(screenGeometry,screenMaterial),lens=new THREE.Mesh(lensGeometry,lensMaterial),button=new THREE.Mesh(buttonGeometry,buttonMaterial);
      screen.rotation.y=Math.PI;screen.position.z=-.0075;lens.position.set(-.022,.05,.008);button.rotation.y=Math.PI;button.position.set(0,-.052,-.008);
      group.add(body,screen,lens,button);group.visible=false;return group;
    },
    dispose(){for(const resource of [bodyGeometry,screenGeometry,lensGeometry,buttonGeometry,bodyMaterial,screenMaterial,lensMaterial,buttonMaterial])resource.dispose();},
  };
}

/** Arms bend inward; the furthest phone corner is <0.40m even on the largest
 * normal variant. The render tests additionally measure all skinned vertices
 * and phone vertices against each factory description's individual cylinder. */
export function createSocialPose({THREE,root,rig,info,phoneResources}){
  const bones={};rig.traverse(node=>{if(node.isBone)bones[canonical(node.name)]=node;});
  const phone=phoneResources.create();root.add(phone);
  const parentInverse=new THREE.Matrix4(),parentLinear=new THREE.Matrix3();
  const current=new THREE.Vector3(),desired=new THREE.Vector3(),origin=new THREE.Vector3(),end=new THREE.Vector3();
  const rotation=new THREE.Quaternion(),worldRotation=new THREE.Quaternion(),parentRotation=new THREE.Quaternion();
  const rootRotation=new THREE.Quaternion(),headRotation=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0);
  const arms=['Left','Right'].map(side=>({side:1,upper:bones[side+'Arm'],lower:bones[side+'ForeArm'],hand:bones[side+'Hand'],middle:bones[side+'HandMiddle1']||bones[side+'HandIndex1']}));
  const modified=new Map();
  let state={phase:null,code:0,phoneVisible:false,headYaw:0,headPitch:0};
  function remember(bone){if(bone&&!modified.has(bone))modified.set(bone,bone.quaternion.clone());}
  function reset(){for(const [bone,q]of modified)bone.quaternion.copy(q);modified.clear();}
  function aim(bone,child,target){
    if(!bone||!child)return;
    remember(bone);
    bone.getWorldPosition(origin);child.getWorldPosition(end);
    parentInverse.copy(bone.parent.matrixWorld).invert();parentLinear.setFromMatrix4(parentInverse);
    current.copy(end).sub(origin).applyMatrix3(parentLinear).normalize();desired.copy(target).sub(origin).applyMatrix3(parentLinear).normalize();
    rotation.setFromUnitVectors(current,desired);bone.quaternion.premultiply(rotation);bone.updateWorldMatrix(false,true);
  }
  function solve(arm,targetLocal,bendLocal){
    if(!arm.upper||!arm.lower||!arm.hand)return;
    const shoulder=arm.upper.getWorldPosition(new THREE.Vector3()),elbow=arm.lower.getWorldPosition(new THREE.Vector3()),wrist=arm.hand.getWorldPosition(new THREE.Vector3());
    const target=root.localToWorld(targetLocal.clone()),first=shoulder.distanceTo(elbow),second=elbow.distanceTo(wrist);
    const direction=target.clone().sub(shoulder),distance=clamp(direction.length(),Math.abs(first-second)+.001,first+second-.002);direction.normalize();
    const along=(first*first-second*second+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,first*first-along*along));
    const bend=root.localToWorld(bendLocal.clone()).sub(shoulder);bend.addScaledVector(direction,-bend.dot(direction));
    if(bend.lengthSq()<1e-8)bend.set(0,-1,0).applyQuaternion(rootRotation).addScaledVector(direction,direction.y);
    bend.normalize();
    const joint=shoulder.clone().addScaledVector(direction,along).addScaledVector(bend,height);
    aim(arm.upper,arm.lower,joint);aim(arm.lower,arm.hand,target);
    if(arm.middle){
      remember(arm.hand);
      arm.hand.getWorldPosition(origin);arm.middle.getWorldPosition(end);
      current.copy(end).sub(origin).normalize();desired.copy(up).applyQuaternion(rootRotation);
      rotation.setFromUnitVectors(current,desired);arm.hand.getWorldQuaternion(worldRotation);worldRotation.premultiply(rotation);
      arm.hand.parent.getWorldQuaternion(parentRotation).invert();arm.hand.quaternion.copy(parentRotation.multiply(worldRotation));arm.hand.updateWorldMatrix(false,true);
    }
  }
  function update(social,{time=0,stopped=true,headYaw=0,headPitch=0}={}){
    reset();
    const code=socialVisualCode(social,stopped),held=code===2||code===3||code===4||code===6;
    phone.visible=held;state={phase:social?.phase||null,code,phoneVisible:held,headYaw,headPitch};
    if(!social)return state;
    root.updateWorldMatrix(true,true);root.getWorldQuaternion(rootRotation);
    for(const arm of arms)if(arm.upper){arm.upper.getWorldPosition(origin);arm.side=root.worldToLocal(origin).x<0?-1:1;}
    if(bones.Head){
      remember(bones.Head);
      const yaw=clamp(headYaw,-.65,.65),pitch=clamp(code===6?.34:headPitch,-.30,.38);
      const delta=new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch,yaw,code===5?.035*Math.sin(time*.8):0,'YXZ'));
      worldRotation.copy(rootRotation).multiply(delta).multiply(rootRotation.clone().invert());
      bones.Head.getWorldQuaternion(headRotation);headRotation.premultiply(worldRotation);bones.Head.parent.getWorldQuaternion(parentRotation).invert();bones.Head.quaternion.copy(parentRotation.multiply(headRotation));bones.Head.updateWorldMatrix(false,true);
    }
    if(!stopped||(!held&&code!==5))return state;
    const scale=info.heightMeters/1.78,compact=Math.min(1,(info.radius-.055)/(.375*scale));
    const bob=.003*Math.sin(time*1.7),phoneY=(code===6?1.12:code===3?1.49:1.45)*scale+bob;
    const phoneZ=(code===6?.275:code===3?.335:.315)*scale*compact,phoneX=(code===3?.065:0)*scale;
    const wristY=phoneY-(code===4?.025:.060)*scale;
    for(const arm of arms){
      if(code===3&&arm.side<0)continue;
      if(code===5&&arm.side<0)continue;
      const target=code===5?new THREE.Vector3(.15*scale,1.02*scale,.12*scale):new THREE.Vector3((code===3?.095:arm.side*(code===4?.093:.059))*scale,wristY,phoneZ-.034*scale);
      const elbow=new THREE.Vector3(arm.side*.23*scale,(code===6?.94:1.16)*scale,.08*scale);
      solve(arm,target,elbow);
    }
    if(held){
      phone.position.set(phoneX,phoneY,phoneZ);phone.scale.setScalar(scale);phone.rotation.set(code===6?.55:.12,0,code===4?Math.PI/2:0);
      phone.updateWorldMatrix(false,true);
    }
    return state;
  }
  return {phone,update,reset,get state(){return {...state};},dispose(){reset();phone.removeFromParent();}};
}
