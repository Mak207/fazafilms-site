// Uses the park's existing THREE, scene, camera and avatar factory.
// Every simulated visitor keeps its own pose/position. Only visual detail changes.
import {socialVisualCode} from './social-pose.js?v=social-20261124';
const PROXY_HEIGHT=1.78;
const clamp=(value,lo,hi)=>Math.min(hi,Math.max(lo,value));
const finitePoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z);
const clock=()=>globalThis.performance?.now?.()??Date.now();

function buildPersonGeometry(THREE){
  const positions=[],normals=[],parts=[],pivots=[];
  const point=new THREE.Vector3(),normal=new THREE.Vector3(),transform=new THREE.Matrix4(),normalMatrix=new THREE.Matrix3();
  function part(geometry,position,scale,code,band,pivot=[0,0,0]){
    transform.compose(new THREE.Vector3(...position),new THREE.Quaternion(),new THREE.Vector3(...scale));normalMatrix.getNormalMatrix(transform);
    const p=geometry.attributes.position,n=geometry.attributes.normal,index=geometry.index;
    for(let k=0;k<(index?.count??p.count);k++){
      const i=index?index.getX(k):k;point.fromBufferAttribute(p,i).applyMatrix4(transform);normal.fromBufferAttribute(n,i).applyMatrix3(normalMatrix).normalize();
      positions.push(point.x,point.y,point.z);normals.push(normal.x,normal.y,normal.z);parts.push(code,band);pivots.push(...pivot);
    }
    geometry.dispose();
  }
  const cylinder=(top,bottom,height,closed=false)=>new THREE.CylinderGeometry(top,bottom,height,5,1,!closed);
  part(cylinder(.20,.155,.46,true),[0,1.22,0],[1,1,.66],0,1);
  part(cylinder(.16,.17,.23,true),[0,.885,0],[1,1,.68],0,2);
  part(cylinder(.052,.057,.10),[0,1.485,0],[1,1,1],0,0);
  part(new THREE.SphereGeometry(1,8,5),[0,1.625,0],[.115,.14,.105],1,0);
  part(new THREE.SphereGeometry(1,8,4,0,Math.PI*2,0,1.72),[0,1.63,-.008],[.121,.15,.114],2,3);
  for(const side of [-1,1]){
    const right=side===1,arm=right?11:10,leg=right?21:20,x=.225*side,hip=.088*side;
    part(cylinder(.051,.042,.29),[x,1.215,0],[1,1,.95],arm,1,[x,1.36,0]);
    part(cylinder(.042,.031,.255),[x, .945,0],[1,1,.95],arm+2,5,[x,1.36,0]);
    part(new THREE.SphereGeometry(1,6,3),[x,.795,0],[.036,.065,.03],arm+2,0,[x,1.36,0]);
    part(cylinder(.078,.062,.415),[hip,.6825,0],[1,1,1],leg,2,[hip,.89,0]);
    part(cylinder(.060,.045,.405),[hip,.2725,0],[1,1,1],leg+2,2,[hip,.89,0]);
    part(new THREE.BoxGeometry(.105,.12,.25),[hip,.065,.047],[1,1,1],leg+4,4,[hip,.89,0]);
  }
  // The phone is part of the same instanced draw. Inactive phones collapse to a
  // point in the vertex shader; each active visitor has an independent gesture.
  part(new THREE.BoxGeometry(.084,.154,.014),[0,0,0],[1,1,1],30,6);
  part(new THREE.BoxGeometry(.071,.132,.002),[0,0,-.008],[1,1,1],31,7);
  part(new THREE.BoxGeometry(.014,.014,.003),[-.022,.05,.009],[1,1,1],32,4);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('crowdPart',new THREE.Float32BufferAttribute(parts,2));geometry.setAttribute('crowdPivot',new THREE.Float32BufferAttribute(pivots,3));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

const vertexDeclarations=`
attribute vec2 crowdPart;
attribute vec3 crowdPivot;
attribute vec4 crowdPose;
attribute vec4 crowdSocial;
attribute vec3 crowdSkin;
attribute vec3 crowdTop;
attribute vec3 crowdBottom;
attribute vec3 crowdHair;
varying vec3 vCrowdTint;
vec3 crowdRotateX(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x,c*p.y-s*p.z,s*p.y+c*p.z);}
vec3 crowdRotateY(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);}
vec3 crowdRotateZ(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(c*p.x-s*p.y,s*p.x+c*p.y,p.z);}
bool crowdHeld(){return crowdSocial.x>1.5&&crowdSocial.x<4.5||crowdSocial.x>5.5;}
vec3 crowdPhoneCenter(){return crowdSocial.x>5.5?vec3(0.,1.12,.275):crowdSocial.x>2.5&&crowdSocial.x<3.5?vec3(.065,1.49,.335):vec3(0.,1.45,.315);}
vec3 crowdPhoneRotate(vec3 p){if(crowdSocial.x>3.5&&crowdSocial.x<4.5)p=crowdRotateZ(p,1.57079632679);return crowdRotateX(p,crowdSocial.x>5.5?.55:.12);}
vec3 crowdRotateFromDown(vec3 p,vec3 direction){
  vec3 a=vec3(0.,-1.,0.),b=normalize(direction),v=cross(a,b);float c=dot(a,b);
  if(c<-.9999)return vec3(-p.x,-p.y,p.z);
  return p+cross(v,p)+cross(v,cross(v,p))/max(.0001,1.+c);
}
bool crowdSocialArm(){
  if(crowdPart.x<10.||crowdPart.x>=20.||crowdSocial.x<1.5)return false;
  float side=crowdPivot.x<0.?-1.:1.;
  return !((crowdSocial.x>2.5&&crowdSocial.x<3.5||crowdSocial.x>4.5&&crowdSocial.x<5.5)&&side<0.);
}
void crowdArmJoints(out vec3 shoulder,out vec3 elbow,out vec3 hand){
  float side=crowdPivot.x<0.?-1.:1.,code=crowdSocial.x;
  shoulder=vec3(side*.225,1.36,0.);vec3 phone=crowdPhoneCenter();
  hand=vec3(side*(code>3.5&&code<4.5?.093:.059),phone.y-(code>3.5&&code<4.5?.025:.060),phone.z-.034);
  if(code>2.5&&code<3.5)hand.x=.095;
  if(code>4.5&&code<5.5)hand=vec3(.15,1.02,.12);
  vec3 direction=hand-shoulder;float d=clamp(length(direction),.02,.563);direction=normalize(direction);
  float along=(.29*.29-.275*.275+d*d)/(2.*d),rise=sqrt(max(0.,.29*.29-along*along));
  vec3 hint=code>4.5&&code<5.5?vec3(side*.18,1.10,.20):vec3(side*.23,code>5.5?.94:1.16,.08);
  vec3 bend=hint-shoulder;bend=normalize(bend-direction*dot(bend,direction));
  elbow=shoulder+direction*along+bend*rise;
}
void crowdJointAngles(out float primary,out float secondary){
  float side=mod(crowdPart.x,2.0)<0.5?1.0:-1.0;
  float phase=sin(crowdPose.x*6.28318530718)*side;
  float walk=crowdPose.y;
  primary=0.0;secondary=0.0;
  if(crowdPart.x>=20.0){primary=-phase*.52*walk;secondary=max(0.0,-phase)*.85*walk;}
  else if(crowdPart.x>=10.0){primary=phase*.48*walk;secondary=-.12-.18*max(0.0,phase)*walk;}
}
vec3 crowdPosition(vec3 p){
  if(crowdPart.x>=30.)return crowdHeld()?crowdPhoneRotate(p)+crowdPhoneCenter():vec3(0.);
  if(crowdSocialArm()){
    vec3 shoulder,elbow,hand;crowdArmJoints(shoulder,elbow,hand);
    if(crowdPart.x<12.)return crowdRotateFromDown(p-shoulder,elbow-shoulder)+shoulder;
    return crowdRotateFromDown(p-vec3(shoulder.x,1.07,0.),hand-elbow)+elbow;
  }
  if(crowdPart.x>0.5&&crowdPart.x<2.5){vec3 neck=vec3(0.,1.49,0.);return crowdRotateY(crowdRotateX(p-neck,crowdSocial.z),crowdSocial.y)+neck;}
  float primary,secondary;crowdJointAngles(primary,secondary);
  if(crowdPart.x>=22.0){vec3 knee=vec3(crowdPivot.x,.475,0.0);p=crowdRotateX(p-knee,secondary)+knee;}
  else if(crowdPart.x>=12.0&&crowdPart.x<20.0){vec3 elbow=vec3(crowdPivot.x,1.07,0.0);p=crowdRotateX(p-elbow,secondary)+elbow;}
  if(crowdPart.x>=10.0)p=crowdRotateX(p-crowdPivot,primary)+crowdPivot;
  p.y+=.012*(1.0-cos(crowdPose.x*12.56637061436))*crowdPose.y;
  return p;
}
vec3 crowdNormal(vec3 n){
  if(crowdPart.x>=30.)return crowdPhoneRotate(n);
  if(crowdSocialArm()){vec3 shoulder,elbow,hand;crowdArmJoints(shoulder,elbow,hand);return crowdRotateFromDown(n,crowdPart.x<12.?elbow-shoulder:hand-elbow);}
  if(crowdPart.x>0.5&&crowdPart.x<2.5)return crowdRotateY(crowdRotateX(n,crowdSocial.z),crowdSocial.y);
  float primary,secondary;crowdJointAngles(primary,secondary);
  if(crowdPart.x>=22.0||(crowdPart.x>=12.0&&crowdPart.x<20.0))n=crowdRotateX(n,secondary);
  return crowdPart.x>=10.0?crowdRotateX(n,primary):n;
}
vec3 crowdColor(){
  if(crowdPart.y<.5)return crowdSkin;
  if(crowdPart.y<1.5)return crowdTop;
  if(crowdPart.y<2.5)return crowdBottom;
  if(crowdPart.y<3.5)return crowdHair;
  if(crowdPart.y<4.5)return vec3(.024,.028,.032);
  if(crowdPart.y<5.5)return mix(crowdSkin,crowdTop,crowdPose.w);
  return crowdPart.y<6.5?vec3(.016,.024,.033):vec3(.35,.65,.78);
}
`;

function makeProxyMaterial(THREE){
  const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.88,metalness:0});
  material.name='Instanced visitor clothing and skin';
  material.onBeforeCompile=shader=>{
    shader.vertexShader=vertexDeclarations+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nobjectNormal=crowdNormal(objectNormal);');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed=crowdPosition(transformed);vCrowdTint=crowdColor();');
    shader.fragmentShader='varying vec3 vCrowdTint;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=vCrowdTint;');
  };
  material.customProgramCacheKey=()=> 'park-crowd-instanced-social-v2';return material;
}

function makeShadowTexture(THREE){
  const size=32,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const d=Math.hypot((x+.5-size/2)/(size/2),(y+.5-size/2)/(size/2)),i=(y*size+x)*4;
    data[i+3]=Math.round(90*Math.max(0,1-d)**2);
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearFilter;texture.needsUpdate=true;return texture;
}

/**
 * factory must be preloaded before add()/describe(). No simulation agents are
 * created or removed here. Appearance: {baseId,variantIndex,seed,heightScale?,widthScale?}.
 * Detailed handles are a bounded visual cache; simulation.order is authoritative.
 */
export function createCrowdRenderer({THREE,scene,camera,factory,registerMaterial=()=>{},capacity=2200,
  maxDetailed=64,maxResidentDetailed=80,detailedDistance=24,nearDistance=12,midHz=12,
  maxCreatesPerFrame=4,faceDistance=9,activityFor}={}){
  if(!THREE||!scene?.add||!camera||typeof factory?.describe!=='function')throw new Error('Inject THREE, scene, camera, and a preloaded avatar factory');
  maxDetailed=Math.max(0,Math.floor(maxDetailed));maxResidentDetailed=Math.max(maxDetailed,Math.floor(maxResidentDetailed));
  if(!(detailedDistance>0&&midHz>0&&maxCreatesPerFrame>0))throw new Error('Invalid crowd detail budget');
  const records=new Map(),handles=new Map(),resident=new Map(),group=new THREE.Group();group.name='Park visitors — adaptive detail';scene.add(group);
  const baseGeometry=buildPersonGeometry(THREE),proxyMaterial=makeProxyMaterial(THREE),shadowTexture=makeShadowTexture(THREE);
  const shadowGeometry=new THREE.PlaneGeometry(1,1);shadowGeometry.rotateX(-Math.PI/2);
  const shadowMaterial=new THREE.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
  shadowMaterial.name='Visitor contact shadows';registerMaterial(proxyMaterial);registerMaterial(shadowMaterial);
  const frustum=new THREE.Frustum(),projection=new THREE.Matrix4(),sphere=new THREE.Sphere(),matrix=new THREE.Matrix4();
  const position=new THREE.Vector3(),scale=new THREE.Vector3(),up=new THREE.Vector3(0,1,0),quaternion=new THREE.Quaternion(),identity=new THREE.Quaternion();
  let proxy,shadows,allocated=0,dead=false,frame=0,lastStats={agents:0,visible:0,detailed:0,instanced:0,missing:0};
  function assertLive(){if(dead)throw new Error('Crowd renderer has been disposed');}
  function ensureCapacity(required){
    assertLive();required=Math.max(1,Math.ceil(Number(required)||0));if(required<=allocated)return allocated;
    const next=Math.max(required,allocated?Math.ceil(allocated*1.5):Math.ceil(Number(capacity)||1));
    const geometry=baseGeometry.clone();
    for(const [name,size]of [['crowdPose',4],['crowdSocial',4],['crowdSkin',3],['crowdTop',3],['crowdBottom',3],['crowdHair',3]])geometry.setAttribute(name,new THREE.InstancedBufferAttribute(new Float32Array(next*size),size).setUsage(THREE.DynamicDrawUsage));
    const replacement=new THREE.InstancedMesh(geometry,proxyMaterial,next);replacement.name='Instanced animated visitors';replacement.count=0;replacement.frustumCulled=false;replacement.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const newShadows=new THREE.InstancedMesh(shadowGeometry,shadowMaterial,next);newShadows.name='Visitor contact shadows';newShadows.count=0;newShadows.frustumCulled=false;newShadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if(proxy){proxy.removeFromParent();proxy.dispose();proxy.geometry.dispose();shadows.removeFromParent();shadows.dispose();}
    proxy=replacement;shadows=newShadows;group.add(proxy,shadows);allocated=next;return allocated;
  }
  function describe(appearance){assertLive();return factory.describe(appearance);}
  function add(id,appearance){
    assertLive();id=String(id);if(!id)throw new Error('Visitor ID is required');
    if(records.has(id))throw new Error(`Visitor renderer already contains ${id}`);
    const description=describe(appearance);ensureCapacity(records.size+1);
    records.set(id,{id,appearance:{...appearance},description,x:0,y:0,z:0,distance:Infinity,visible:false,activity:'idle',agent:null});return description;
  }
  function remove(id){
    id=String(id);const state=resident.get(id);if(state){state.handle.dispose();resident.delete(id);handles.delete(id);}return records.delete(id);
  }
  function clear(){for(const id of [...records.keys()])remove(id);proxy.count=0;shadows.count=0;lastStats={agents:0,visible:0,detailed:0,instanced:0,missing:0};}
  function createDetail(record,selected){
    if(resident.size>=maxResidentDetailed){
      let victim;for(const [id,state]of resident)if(!selected.has(id)&&(!victim||state.lastFrame<victim[1].lastFrame))victim=[id,state];
      if(!victim)return null;victim[1].handle.dispose();resident.delete(victim[0]);handles.delete(victim[0]);
    }
    const handle=factory.create(record.appearance);group.add(handle.root);
    handle.root.traverse(node=>{if(node.isMesh)for(const material of Array.isArray(node.material)?node.material:[node.material])registerMaterial(material);});
    const state={handle,lastFrame:frame,age:0,activity:null,socialCode:null,first:true};resident.set(record.id,state);handles.set(record.id,handle);return state;
  }
  function update(dt,{simulation,interpolationAlpha=1,sectionHeight=Infinity,focusId=null}={}){
    assertLive();if(!Array.isArray(simulation?.order))throw new Error('Supply the existing CrowdSimulation');
    const start=clock();dt=Math.max(0,Number.isFinite(dt)?dt:0);const alpha=clamp(Number.isFinite(interpolationAlpha)?interpolationAlpha:1,0,1);frame++;
    camera.updateMatrixWorld();projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(projection);
    if(!Number.isFinite(sectionHeight))sectionHeight=Infinity;
    const visible=[],candidates=[];let missing=0,positioned=0,sectionCulled=0,viewCulled=0;
    for(const agent of simulation.order){
      const record=records.get(String(agent.id));if(!record){missing++;continue;}
      const p=agent.position,previous=finitePoint(agent.previousPosition)?agent.previousPosition:p;if(!finitePoint(p)){missing++;continue;}
      record.agent=agent;record.x=previous.x+(p.x-previous.x)*alpha;record.y=previous.y+(p.y-previous.y)*alpha;record.z=previous.z+(p.z-previous.z)*alpha;positioned++;
      record.activity=activityFor?.(agent,agent)||(agent.activity!=='elevator_ride'&&agent.speed>.03?'walk':'idle');
      record.socialStopped=!agent.transit&&agent.activity!=='elevator_ride'&&Math.abs(agent.speed||0)<.08;
      record.socialCode=socialVisualCode(agent.social,record.socialStopped);
      if(record.socialCode)record.activity='idle';
      const walkingYaw=Number.isFinite(agent.yaw)?agent.yaw:0,look=agent.social?.lookAt;
      let targetYaw=walkingYaw;record.headYaw=0;record.headPitch=0;
      if(finitePoint(look)){
        const dx=look.x-record.x,dz=look.z-record.z,distance=Math.hypot(dx,dz),lookYaw=Math.atan2(dx,dz);
        if(record.socialStopped&&distance>.01)targetYaw=lookYaw;
        if(!Number.isFinite(record.renderYaw))record.renderYaw=walkingYaw;
        const difference=Math.atan2(Math.sin(targetYaw-record.renderYaw),Math.cos(targetYaw-record.renderYaw));
        record.renderYaw=record.socialStopped?record.renderYaw+clamp(difference,-dt*3.2,dt*3.2):walkingYaw;
        record.headYaw=clamp(Math.atan2(Math.sin(lookYaw-record.renderYaw),Math.cos(lookYaw-record.renderYaw)),-.65,.65);
        record.headPitch=clamp(-Math.atan2(look.y-(record.y+record.description.heightMeters*.89),Math.max(.1,distance)),-.30,.38);
      }else record.renderYaw=walkingYaw;
      if(record.socialCode===6)record.headPitch=.34;
      const info=record.description.info,height=record.activity==='wave'?info.waveHeightMeters:info.heightMeters;
      record.visible=false;
      if(record.y+height+.08>sectionHeight){sectionCulled++;continue;}
      sphere.center.set(record.x,record.y+height/2,record.z);sphere.radius=Math.hypot(height/2,info.radius);
      if(!frustum.intersectsSphere(sphere)){viewCulled++;continue;}
      record.visible=true;record.distance=camera.position.distanceTo(sphere.center);visible.push(record);
      if(record.distance<=detailedDistance||record.id===String(focusId)){
        record.priority=record.id===String(focusId)?-1:record.distance*(handles.get(record.id)?.root.visible===true?.82:1);
        candidates.push(record);
      }
    }
    candidates.sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));
    const selected=new Set(candidates.slice(0,maxDetailed).map(record=>record.id));
    for(const state of resident.values())state.handle.root.visible=false;
    let created=0,detailed=0,instanced=0,shadowCount=0,animated=0,phoneDetailed=0,phoneInstanced=0,socialVisible=0;
    const pose=proxy.geometry.attributes.crowdPose,social=proxy.geometry.attributes.crowdSocial,skin=proxy.geometry.attributes.crowdSkin,top=proxy.geometry.attributes.crowdTop,bottom=proxy.geometry.attributes.crowdBottom,hair=proxy.geometry.attributes.crowdHair;
    for(const record of visible){
      const a=record.agent,d=record.description,yaw=record.renderYaw,held=[2,3,4,6].includes(record.socialCode);
      if(record.socialCode)socialVisible++;
      const phase=Number.isFinite(a.gaitCycles)?((a.gaitCycles%1)+1)%1:(a.gaitPhase||0);
      let detail=selected.has(record.id)?resident.get(record.id):null;
      if(selected.has(record.id)&&!detail&&created<maxCreatesPerFrame){detail=createDetail(record,selected);if(detail)created++;}
      if(detail){
        const handle=detail.handle;handle.root.visible=true;handle.root.position.set(record.x,record.y,record.z);handle.root.rotation.y=yaw;detail.lastFrame=frame;
        if(detail.first){handle.pose(record.activity,record.activity==='walk'?phase*d.info.walkDurationSeconds:(a.animationTime||0),{loop:true});detail.first=false;}
        detail.age+=dt;const period=record.distance<=nearDistance?0:1/midHz,animate=detail.activity!==record.activity||detail.socialCode!==record.socialCode||detail.age+1e-9>=period;
        handle.update(dt,{gaitPhase:phase,activity:record.activity,animate,face:record.distance<=faceDistance,
          social:a.social,socialStopped:record.socialStopped,socialHeadYaw:record.headYaw,socialHeadPitch:record.headPitch});
        if(animate){detail.age=period?detail.age%period:0;animated++;}detail.activity=record.activity;detail.socialCode=record.socialCode;detailed++;if(handle.phone.visible)phoneDetailed++;
      }else{
        position.set(record.x,record.y,record.z);quaternion.setFromAxisAngle(up,yaw);
        const heightScale=d.heightMeters/PROXY_HEIGHT;scale.set(heightScale*d.variant.widthScale,heightScale,heightScale);
        matrix.compose(position,quaternion,scale);proxy.setMatrixAt(instanced,matrix);
        pose.setXYZW(instanced,phase,record.activity==='walk'?clamp(a.speed/1.05,.15,1):0,a.animationTime||0,d.variant.outfit==='tee'?0:1);
        social.setXYZW(instanced,record.socialCode,record.headYaw,record.headPitch,a.animationTime||0);if(held)phoneInstanced++;
        skin.setXYZ(instanced,...d.lodColors.skin);top.setXYZ(instanced,...d.lodColors.top);bottom.setXYZ(instanced,...d.lodColors.trousers);hair.setXYZ(instanced,...d.lodColors.hair);instanced++;
      }
      position.set(record.x,record.y+.012,record.z);const shadowSize=Math.max(.7,d.radius*1.8);scale.set(shadowSize,1,shadowSize);matrix.compose(position,identity,scale);shadows.setMatrixAt(shadowCount++,matrix);
    }
    proxy.count=instanced;shadows.count=shadowCount;proxy.instanceMatrix.needsUpdate=true;shadows.instanceMatrix.needsUpdate=true;
    for(const attribute of [pose,social,skin,top,bottom,hair])attribute.needsUpdate=true;
    lastStats={agents:records.size,simulated:simulation.order.length,positioned,visible:visible.length,detailed,instanced,animated,
      residentDetailed:resident.size,detailBudget:maxDetailed,residentBudget:maxResidentDetailed,capacity:allocated,created,missing,
      sectionCulled,viewCulled,instancedDrawCalls:instanced?1:0,shadowDrawCalls:shadowCount?1:0,
      socialVisible,phoneDetailed,phoneInstanced,
      proxyTrianglesPerPerson:baseGeometry.attributes.position.count/3,cpuMilliseconds:clock()-start};return {...lastStats};
  }
  ensureCapacity(capacity);
  return {add,remove,clear,describe,ensureCapacity,update,handles,group,
    get stats(){return {...lastStats,capacity:allocated,residentDetailed:resident.size,detailBudget:maxDetailed,residentBudget:maxResidentDetailed};},
    get objects(){return {group,proxy,shadows};},
    getDescription:id=>records.get(String(id))?.description,
    dispose(){if(dead)return;clear();proxy.dispose();proxy.geometry.dispose();shadows.dispose();baseGeometry.dispose();shadowGeometry.dispose();proxyMaterial.dispose();shadowMaterial.dispose();shadowTexture.dispose();group.removeFromParent();dead=true;},
  };
}
