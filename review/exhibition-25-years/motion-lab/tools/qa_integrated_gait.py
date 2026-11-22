"""QA of the REAL exhibition entry (?visitorQA=1), never a replacement scene.

Reads the v43 public updater contract. Fixed physical steps; independent cloned
clip evaluation; geometry probes; actual-scene front/side/back captures.
No runtime, model, animation or navigation edits. Optional video replays the
same seed and records the real exhibition canvas, not the diagnostic lab.
"""
from pathlib import Path
import argparse
import functools
import hashlib
import http.server
import json
import math
import shutil
import subprocess
import threading
import time
import traceback
from playwright.sync_api import sync_playwright


INSTALL_PROBE = r"""async () => {
  const q=window.__EXHIBITION_VISITOR_QA__;
  if(!q)throw new Error('Real exhibition visitorQA API is absent');
  await q.ready();q.pause();
  const T=q.refs.THREE,updater=q.refs.updateWalkers;
  if(typeof updater.describe!=='function')throw new Error('updater.describe is required');
  const {clone:cloneSkeleton}=await import('three/addons/utils/SkeletonUtils.js');
  const normalize=n=>n.replace(/^mixamorig:?/i,'');
  const defaultBonePoses=new Map();
  async function loadDefaultBones(a){
    const url=new URL(`./assets/models/visitors/walking-${a.model}.glb`,location.href);
    const response=await fetch(url);if(!response.ok)throw new Error('Cannot read current GLB defaults: '+response.status);
    const buffer=await response.arrayBuffer(),view=new DataView(buffer);
    if(view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(16,true)!==0x4e4f534a)throw new Error('Expected JSON-first GLB2');
    const json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,view.getUint32(12,true))).replace(/\u0000+$/,''));
    const map=new Map(),joints=new Set(json.skins.flatMap(s=>s.joints));
    for(const i of joints){const node=json.nodes[i],name=normalize(T.PropertyBinding.sanitizeNodeName(node.name));if(map.has(name))throw new Error('Ambiguous default bone '+name);map.set(name,node);}
    defaultBonePoses.set(a.id,map);
  }
  function restoreDefaultBones(root,id){
    const defaults=defaultBonePoses.get(id);
    root.traverse(b=>{if(!b.isBone)return;const node=defaults.get(normalize(b.name));if(!node)throw new Error('Missing current GLB rest bone '+b.name);
      if(node.matrix)new T.Matrix4().fromArray(node.matrix).decompose(b.position,b.quaternion,b.scale);
      else{b.position.fromArray(node.translation||[0,0,0]);b.quaternion.fromArray(node.rotation||[0,0,0,1]);b.scale.fromArray(node.scale||[1,1,1]);}
    });root.updateMatrixWorld(true);
  }
  const sides=['Left','Right'],core=['Hips','Spine','Head',...sides.flatMap(s=>[s+'UpLeg',s+'Leg',s+'Foot',s+'ToeBase'])];
  const roles=root=>{const b={};root.traverse(o=>{if(o.isBone)b[normalize(o.name)]=o;});return b;};
  const arr=v=>v.toArray();
  const angle=(a,b)=>a.clone().normalize().angleTo(b.clone().normalize())*180/Math.PI;
  const capture=root=>{const rows=[];root.traverse(o=>rows.push({o,p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone()}));return rows;};
  const restore=rows=>{for(const r of rows){r.o.position.copy(r.p);r.o.quaternion.copy(r.q);r.o.scale.copy(r.s);}};
  const save=rows=>{for(const r of rows){r.p.copy(r.o.position);r.q.copy(r.o.quaternion);r.s.copy(r.o.scale);}};
  const localSnapshot=bones=>Object.fromEntries(Object.entries(bones).map(([n,b])=>[n,{p:arr(b.position),q:arr(b.quaternion),s:arr(b.scale)}]));
  const localError=(a,b)=>{
    const result={maxPositionM:0,maxRotationDegrees:0,maxScale:0,worstPositionBone:null,worstRotationBone:null};
    for(const[n,bone]of Object.entries(a)){
      if(!b[n])continue;
      const dp=bone.position.distanceTo(b[n].position),dq=angle(bone.quaternion,b[n].quaternion),ds=bone.scale.distanceTo(b[n].scale);
      if(dp>result.maxPositionM){result.maxPositionM=dp;result.worstPositionBone=n;}
      if(dq>result.maxRotationDegrees){result.maxRotationDegrees=dq;result.worstRotationBone=n;}
      result.maxScale=Math.max(result.maxScale,ds);
    }return result;
  };
  const makeReference=a=>{
    const root=cloneSkeleton(a.rig);restoreDefaultBones(root,a.id);
    const bones=roles(root),mixer=new T.AnimationMixer(root),base=capture(root),actions=new Map();
    const sourceRoot=cloneSkeleton(a.rig);restoreDefaultBones(sourceRoot,a.id);
    const sourceBones=roles(sourceRoot),sourceMixer=new T.AnimationMixer(sourceRoot);
    const sourceClip=a.motion.sourceWalk,sourceAction=sourceMixer.clipAction(sourceClip);sourceAction.play();sourceAction.paused=true;
    const hipTrack=sourceClip.tracks.find(t=>/Hips\.position$/.test(t.name));
    if(!hipTrack)throw new Error(a.id+': source Walk has no Hips position track');
    const first=Array.from(hipTrack.createInterpolant().evaluate(0)),last=Array.from(hipTrack.createInterpolant().evaluate(sourceClip.duration));
    let previousRawHips=sourceBones.Hips.position.clone();
    return {root,bones,mixer,base,sourceRoot,sourceBones,sourceClip,
      evaluate(){
        restore(base);
        for(const action of actions.values())action.setEffectiveWeight(0);
        for(const active of Object.values(a.actions)){
          if(!active||typeof active.getClip!=='function')continue;
          const clip=active.getClip();let action=actions.get(clip.uuid);
          if(!action){action=mixer.clipAction(clip);action.play();action.paused=true;actions.set(clip.uuid,action);}
          action.enabled=true;action.time=active.time;action.setEffectiveWeight(active.enabled?active.getEffectiveWeight():0);
        }
        mixer.update(0);save(base);root.updateMatrixWorld(true);
        return localError(roles(a.rig),bones);
      },
      evaluateSource(){
        const actual=a.actions.walk,phase=actual.time/actual.getClip().duration;
        sourceBones.Hips.position.copy(previousRawHips);sourceAction.time=phase*sourceClip.duration;sourceMixer.update(0);
        previousRawHips.copy(sourceBones.Hips.position);
        sourceBones.Hips.position.x-=first[0]+(last[0]-first[0])*phase;
        sourceBones.Hips.position.z-=first[2]+(last[2]-first[2])*phase;
        sourceRoot.updateMatrixWorld(true);
        return {phase,sourceTimeSeconds:sourceAction.time,sourceClip:sourceClip.name,
          scope:'Native sourceWalk on current target rig, same normalized phase; independent Hips XZ detrend. Not the original source rig.',
          error:localError(roles(a.rig),sourceBones)};
      }};
  };
  const makeShoeCache=a=>{
    a.holder.updateMatrixWorld(true);a.rig.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});
    const b=roles(a.rig),accepted={};for(const side of sides){accepted[side]=new Set();b[side+'Foot'].traverse(o=>accepted[side].add(o));}
    const data=[],all={Left:[],Right:[]},getters=['getX','getY','getZ','getW'],v=new T.Vector3();
    a.rig.traverse(mesh=>{
      if(!mesh.isSkinnedMesh)return;
      const ix=mesh.geometry.getAttribute('skinIndex'),w=mesh.geometry.getAttribute('skinWeight'),pos=mesh.geometry.getAttribute('position');
      if(!ix||!w||ix.itemSize!==4||w.itemSize!==4)throw new Error('Expected four skin influences');
      const masks=mesh.skeleton.bones.map(b=>(accepted.Left.has(b)?1:0)|(accepted.Right.has(b)?2:0));
      const rows=[];
      for(let i=0;i<pos.count;i++){
        const sums=[0,0];for(let k=0;k<4;k++){const mask=masks[ix[getters[k]](i)],weight=w[getters[k]](i);if(mask&1)sums[0]+=weight;if(mask&2)sums[1]+=weight;}
        const mask=(sums[0]>=.25?1:0)|(sums[1]>=.25?2:0);if(sums[0]+sums[1]<.25)continue;
        mesh.getVertexPosition(i,v).applyMatrix4(mesh.matrixWorld);
        const row={i,mask,initial:v.clone(),groups:{}};rows.push(row);
        for(let j=0;j<2;j++)if(mask&(1<<j))all[sides[j]].push(row);
      }data.push({mesh,rows,totalVertices:pos.count});
    });
    for(const side of sides){
      const points=all[side];if(!points.length)throw new Error('No weighted shoe vertices');
      const floor=Math.min(...points.map(r=>r.initial.y));
      const origin=b[side+'Foot'].getWorldPosition(new T.Vector3()),forward=b[side+'ToeBase'].getWorldPosition(new T.Vector3()).sub(origin).setY(0).normalize();
      const sole=points.filter(r=>r.initial.y<=floor+.025),values=sole.map(r=>r.initial.clone().sub(origin).dot(forward));
      const lo=Math.min(...values),hi=Math.max(...values);
      for(let i=0;i<sole.length;i++)sole[i].groups[side]={heel:values[i]<=lo+.2*(hi-lo),toe:values[i]>=hi-.2*(hi-lo)};
    }return {data,counts:{...Object.fromEntries(sides.map(s=>[s,all[s].length])),Union:data.reduce((n,d)=>n+d.rows.length,0),unionOnly:data.reduce((n,d)=>n+d.rows.filter(r=>!r.mask).length,0),bothFeet:data.reduce((n,d)=>n+d.rows.filter(r=>r.mask===3).length,0)}};
  };
  const actors=updater.describe();if(!Array.isArray(actors)||actors.length!==2)throw new Error('Expected two real exhibition actors');
  await Promise.all(actors.map(loadDefaultBones));
  const records=new Map(actors.map(a=>[a.id,{actor:a,bones:roles(a.rig),reference:makeReference(a),shoe:makeShoeCache(a),previous:null}]));
  let frame=0;const sidePreferences=new Map();
  function feetFor(a,bones){
    a.holder.updateMatrixWorld(true);const output={};
    const fwd=new T.Vector3(0,0,1).applyQuaternion(a.holder.getWorldQuaternion(new T.Quaternion()));
    for(const side of sides){
      const hip=bones[side+'UpLeg'].getWorldPosition(new T.Vector3()),knee=bones[side+'Leg'].getWorldPosition(new T.Vector3()),foot=bones[side+'Foot'].getWorldPosition(new T.Vector3()),toe=bones[side+'ToeBase'].getWorldPosition(new T.Vector3());
      const axis=foot.clone().sub(hip).normalize(),bend=knee.clone().sub(hip);bend.addScaledVector(axis,-bend.dot(axis));
      const kneeDegrees=180-angle(hip.clone().sub(knee),foot.clone().sub(knee));
      const local=a.holder.worldToLocal(foot.clone());
      output[side]={hip:arr(hip),knee:arr(knee),foot:arr(foot),toe:arr(toe),footHolderLocal:arr(local),kneeBendDegrees:kneeDegrees,
        bendRadiusM:bend.length(),bendForwardDot:bend.length()>.005?bend.normalize().dot(fwd):null,
        thighLengthM:hip.distanceTo(knee),shinLengthM:knee.distanceTo(foot)};
    }return output;
  }
  function fullShoe(rec){
    const a=rec.actor;a.holder.updateMatrixWorld(true);a.rig.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});
    const output=Object.fromEntries(sides.map(s=>[s,{count:rec.shoe.counts[s],minY:Infinity,lowest:null,heel:{count:0,minY:Infinity,sum:[0,0,0]},toe:{count:0,minY:Infinity,sum:[0,0,0]}}]));
    output.Union={count:rec.shoe.counts.Union,minY:Infinity,lowest:null};
    const v=new T.Vector3();
    for(const{mesh,rows}of rec.shoe.data)for(const row of rows){
      mesh.getVertexPosition(row.i,v).applyMatrix4(mesh.matrixWorld);
      if(v.y<output.Union.minY){const indices=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight'),getters=['getX','getY','getZ','getW'];output.Union.minY=v.y;output.Union.lowest={mesh:mesh.name,index:row.i,world:arr(v),influences:getters.map(g=>({bone:mesh.skeleton.bones[indices[g](row.i)].name,weight:weights[g](row.i)})).filter(x=>x.weight>0)};}
      for(let j=0;j<2;j++)if(row.mask&(1<<j)){
        const side=sides[j],out=output[side];if(v.y<out.minY){out.minY=v.y;out.lowest={mesh:mesh.name,index:row.i,world:arr(v)};}
        for(const part of ['heel','toe'])if(row.groups[side]?.[part]){const g=out[part];g.count++;g.minY=Math.min(g.minY,v.y);g.sum[0]+=v.x;g.sum[1]+=v.y;g.sum[2]+=v.z;}
      }
    }
    for(const side of sides)for(const part of ['heel','toe']){const g=output[side][part];g.centroidWorld=g.count?g.sum.map(v=>v/g.count):null;delete g.sum;}
    return output;
  }
  function sample(full=false){
    const snap=updater.snapshot(),rows=[];
    for(const state of snap.actors){
      const rec=records.get(state.id),a=rec.actor,feet=feetFor(a,rec.bones);
      const lateral=new T.Vector3(...feet.Left.hip).sub(new T.Vector3(...feet.Right.hip));
      const torsoUp=rec.bones.Spine.getWorldPosition(new T.Vector3()).sub(rec.bones.Hips.getWorldPosition(new T.Vector3()));
      const pelvisForward=lateral.cross(torsoUp).setY(0).normalize();
      const row={id:a.id,model:a.model,state:state.state,time:snap.time,frame,phase:state.phase,walk:state.walk,idle:state.idle,
        transition:state.transition||null,navigation:state.navigation||null,gesture:state.gesture||null,
        pelvisForwardWorld:arr(pelvisForward),pelvisYaw:Math.atan2(pelvisForward.x,pelvisForward.z),
        speed:state.speed,cruiseSpeed:state.cruiseSpeed,yaw:state.yaw,yawRate:state.yawRate,distance:state.distance,routeLength:state.routeLength,
        verticalLift:state.verticalLift,groundingOffsetY:a.grounding.position.y,requestedLift:state.requestedLift,liftCapExceeded:state.liftCapExceeded,dropCapExceeded:state.dropCapExceeded||false,
        runtimeRawShoeMin:state.rawShoeMinimumY,runtimeShoeMin:state.correctedShoeMinimumY,runtimeUnionVertexCount:state.weightedShoeVertexCount,holderPosition:arr(a.holder.position),feet};
      if(rec.previous){const dt=snap.time-rec.previous.time;if(dt>0){
        const delta=a.holder.position.clone().sub(new T.Vector3(...rec.previous.holderPosition)),speed=Math.hypot(delta.x,delta.z)/dt;
        row.measuredRootSpeedMps=speed;
        row.groundingOffsetSpeedMps=(row.groundingOffsetY-rec.previous.groundingOffsetY)/dt;
        const forward=new T.Vector3(0,0,1).applyQuaternion(a.holder.quaternion);
        row.travelVsFacingDegrees=speed>.08?angle(delta.setY(0),forward.setY(0)):null;
        row.travelVsPelvisForwardDegrees=speed>.08?angle(delta,pelvisForward):null;
        row.pelvisYawSpeedDegreesPerSecond=Math.atan2(Math.sin(row.pelvisYaw-rec.previous.pelvisYaw),Math.cos(row.pelvisYaw-rec.previous.pelvisYaw))*180/Math.PI/dt;
        for(const side of sides){row.feet[side].kneeAngularSpeedDegreesPerSecond=Math.abs(feet[side].kneeBendDegrees-rec.previous.feet[side].kneeBendDegrees)/dt;row.feet[side].footHorizontalSpeedMps=Math.hypot(feet[side].foot[0]-rec.previous.feet[side].foot[0],feet[side].foot[2]-rec.previous.feet[side].foot[2])/dt;}
      }}
      if(full){row.fullWeightedShoe=fullShoe(rec);row.canonicalReference=rec.reference.evaluate();
        const weight=a.actions.walk.getEffectiveWeight();if(weight>1-1e-8&&a.actions.idle.getEffectiveWeight()<1e-8)row.nativeSourceReference=rec.reference.evaluateSource();
      }
      rec.previous=row;rows.push(row);
    }return {frame,time:snap.time,actors:rows,errors:snap.errors};
  }
  function batch(count,dt=1/60,fullEvery=6){const out=[];for(let i=0;i<count;i++){q.step(dt,{render:false});frame++;out.push(sample(frame%fullEvery===0));}return out;}
  function reset(){q.reset();frame=0;sidePreferences.clear();for(const r of records.values())r.previous=null;return sample(true);}
  function camera(id,view='front',sideSignOverride=null,worldYawOverride=null){
    const a=records.get(id).actor,b=records.get(id).bones;
    a.holder.updateMatrixWorld(true);const ankle=b.LeftFoot.getWorldPosition(new T.Vector3()).add(b.RightFoot.getWorldPosition(new T.Vector3())).multiplyScalar(.5);
    const target=new T.Vector3(a.holder.position.x,.9,a.holder.position.z),yaw=Number.isFinite(worldYawOverride)?worldYawOverride:a.holder.rotation.y;
    const dir=new T.Vector3(Math.sin(yaw),0,Math.cos(yaw));
    if(view==='back')dir.negate();if(view==='side')dir.set(Math.cos(yaw),0,-Math.sin(yaw));
    const mobile=q.refs.renderer.domElement.clientWidth<600,distance=mobile?3.3:2.4;
    let sideSign=1;
    if(view==='side'){
      const others=actors.filter(other=>other.id!==id);
      const clearance=sign=>Math.min(...others.map(other=>target.clone().addScaledVector(dir,distance*sign).distanceTo(other.holder.position)));
      if(sideSignOverride===1||sideSignOverride===-1)sidePreferences.set(id,sideSignOverride);
      if(!sidePreferences.has(id))sidePreferences.set(id,clearance(-1)>clearance(1)?-1:1);
      sideSign=sidePreferences.get(id);if(sideSign<0)dir.negate();
    }
    const pos=target.clone().addScaledVector(dir,distance);pos.y=1.8;
    const fov=mobile?42:50;
    q.setCamera(arr(pos),arr(target),fov);q.render();return {id,view,sideSign,worldYawOverride,orientationFixedInWorld:Number.isFinite(worldYawOverride),position:arr(pos),target:arr(target),fov,frame,time:updater.snapshot().time,ankleCenter:arr(ankle)};
  }
  function replay(target){reset();for(let i=0;i<target;i++)q.step(1/60,{render:false});frame=target;return sample(true);}
  function referenceScene(id){
    const rec=records.get(id),a=rec.actor;rec.reference.evaluate();const raw=rec.reference.evaluateSource();
    const scene=new T.Scene();scene.background=new T.Color(0xe8edf3);
    scene.add(new T.HemisphereLight(0xffffff,0x777b85,2.2));const light=new T.DirectionalLight(0xffffff,2.5);light.position.set(3,6,4);scene.add(light);
    const floor=new T.Mesh(new T.PlaneGeometry(15,15),new T.MeshStandardMaterial({color:0xd9e0e8,roughness:1}));floor.rotation.x=-Math.PI/2;scene.add(floor);
    const specs=[['Native sourceWalk on current rig',rec.reference.sourceRoot,-2.2,0],['Canonical mixer reference',rec.reference.root,0,0],['Actual exhibition pose',a.rig,2.2,a.grounding.position.y]];
    for(const[label,original,x,y]of specs){const holder=new T.Group(),rig=cloneSkeleton(original);holder.position.set(x,y,0);holder.add(rig);scene.add(holder);
      const canvas=document.createElement('canvas');canvas.width=768;canvas.height=80;const c=canvas.getContext('2d');c.fillStyle='#ffffff';c.fillRect(0,0,768,80);c.fillStyle='#172a48';c.font='30px sans-serif';c.textAlign='center';c.fillText(label,384,50);
      const sprite=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(canvas),depthTest:false}));sprite.position.set(x,1.93,0);sprite.scale.set(2.1,.22,1);scene.add(sprite);
    }
    const actual=q.refs.renderer.domElement,cam=new T.PerspectiveCamera(35,actual.clientWidth/actual.clientHeight,.01,100);cam.position.set(.5,1.3,9.2);cam.lookAt(0,.95,0);scene.updateMatrixWorld(true);q.refs.renderer.render(scene,cam);
    return {id,frame,time:updater.snapshot().time,source:raw,scope:'Same phase: retargeted Native sourceWalk on current rig, canonical mixer reference, actual exhibition pose. These isolated clones do not replace the real-scene transition proof.'};
  }
  window.__INTEGRATED_GAIT_PROBE__={sample,batch,reset,replay,camera,referenceScene,metadata:()=>({three:T.REVISION,version:updater.snapshot().version,actors:actors.map(a=>({id:a.id,model:a.model,sourceWalk:a.motion.sourceWalk.name,sourceWalkDuration:a.motion.sourceWalk.duration,walk:a.motion.walk.name,walkDuration:a.motion.walk.duration,idle:a.motion.idle.name,stride:a.motion.stride,forwardYaw:a.motion.forwardYaw,weightedCounts:records.get(a.id).shoe.counts})),measurementNotes:['Actual exhibition scene and updater. No body/leg pose edits by QA.','Full weighted vertices checked at10Hz and capture frames. Runtime grounding telemetry is logged each60Hz step.','Heel/toe bands are fixed initial-idle sole regions; trajectories are not labelled confirmed stance or slip.','Canonical reference independently evaluates actual public clips/times/weights on cloned current rig.','Source reference is retargeted Native on current rig, with independent linear Hips XZ removal. No claim that it is the original source skeleton.']})};
  return window.__INTEGRATED_GAIT_PROBE__.metadata();
}"""


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def summarize(samples):
    result = {}
    for actor in ('emma', 'ethan'):
        rows = [a for f in samples for a in f['actors'] if a['id'] == actor]
        if not rows:
            continue
        events = []
        last_state = None
        for row in rows:
            if row['state'] != last_state:
                events.append({'frame': row['frame'], 'time': row['time'], 'state': row['state']})
                last_state = row['state']
        full = [r for r in rows if 'fullWeightedShoe' in r]
        canonical = [r['canonicalReference'] for r in full]
        source = [r['nativeSourceReference'] for r in full if 'nativeSourceReference' in r]
        moving = [r for r in rows if r['state']=='walk' and r.get('measuredRootSpeedMps', 0) > .08]
        first_move=moving[0]['frame'] if moving else None
        stats = {'frames': len(rows), 'events': events, 'states': sorted(set(r['state'] for r in rows)),
                 'completedFirstJourney': first_move is not None and any(r['state']=='observe' and r['frame']>first_move for r in rows),
                 'fullGeometrySamples': len(full), 'sourceReferenceSamples': len(source),
                 'maxCanonicalLocalPositionErrorM': max((x['maxPositionM'] for x in canonical), default=None),
                 'maxCanonicalLocalRotationErrorDegrees': max((x['maxRotationDegrees'] for x in canonical), default=None),
                 'maxNativeSourceRotationDeltaDegrees': max((x['error']['maxRotationDegrees'] for x in source), default=None),
                 'maxTravelVsFacingDegrees': max((r['travelVsFacingDegrees'] for r in moving if r.get('travelVsFacingDegrees') is not None), default=None),
                 'maxTravelVsPelvisForwardDegrees': max((r['travelVsPelvisForwardDegrees'] for r in moving if r.get('travelVsPelvisForwardDegrees') is not None), default=None),
                 'maxAbsPelvisYawSpeedDegreesPerSecond':max((abs(r.get('pelvisYawSpeedDegreesPerSecond',0)) for r in rows),default=0),
                 'maxRootStepM': max((math.dist(a['holderPosition'], b['holderPosition']) for a,b in zip(rows,rows[1:])), default=0),
                 'maxVerticalLiftM': max((r.get('verticalLift',0) or 0 for r in rows), default=0),
                 'minSignedGroundingOffsetM': min((r['groundingOffsetY'] for r in rows),default=0),
                 'maxSignedGroundingOffsetM': max((r['groundingOffsetY'] for r in rows),default=0),
                 'maxAbsGroundingOffsetSpeedMps': max((abs(r.get('groundingOffsetSpeedMps',0)) for r in rows),default=0),
                 'maxRequestedLiftM': max((r.get('requestedLift',0) or 0 for r in rows),default=0),
                 'runtimeUnionMinAt60HzM': min((r['runtimeShoeMin'] for r in rows),default=None),
                 'runtimeUnionMaxAt60HzM': max((r['runtimeShoeMin'] for r in rows),default=None),
                 'positiveGapOver2mmFramesByState': {state:sum(r['state']==state and r['runtimeShoeMin']>.002 for r in rows) for state in sorted(set(r['state'] for r in rows))},
                 'fullUnionMinYM': min((r['fullWeightedShoe']['Union']['minY'] for r in full),default=None),
                 'maxRuntimeIndependentUnionDeltaM': max((abs(r['runtimeShoeMin']-r['fullWeightedShoe']['Union']['minY']) for r in full),default=None),
                 'unionVertexCountMatchesRuntime': all(r['runtimeUnionVertexCount']==r['fullWeightedShoe']['Union']['count'] for r in full),
                 'liftCapExceededFrames': sum(bool(r.get('liftCapExceeded')) for r in rows),
                 'dropCapExceededFrames': sum(bool(r.get('dropCapExceeded')) for r in rows), 'feet': {}}
        for side in ('Left','Right'):
            fs = [r['feet'][side] for r in rows]
            lengths = {key:[f[key] for f in fs] for key in ('thighLengthM','shinLengthM')}
            stats['feet'][side] = {'kneeMinDegrees': min(f['kneeBendDegrees'] for f in fs),
              'kneeMaxDegrees': max(f['kneeBendDegrees'] for f in fs),
              'maxKneeAngularSpeedDegreesPerSecond': max((f.get('kneeAngularSpeedDegreesPerSecond',0) for f in fs)),
              'maxFootHorizontalSpeedMps': max((f.get('footHorizontalSpeedMps',0) for f in fs)),
              'maxAbsFootHolderX': max(abs(f['footHolderLocal'][0]) for f in fs),
              'lengthRangeM': {k:max(v)-min(v) for k,v in lengths.items()},
              'fullWeightedMinYM': min((r['fullWeightedShoe'][side]['minY'] for r in full), default=None)}
        result[actor] = stats
    return result


def select_captures(samples, actor):
    rows = [a for f in samples for a in f['actors'] if a['id'] == actor]
    def weight(r): return r.get('walk',{}).get('weight',0)
    moving = [r for r in rows if r['state']=='walk' and r.get('measuredRootSpeedMps',0)>.08]
    clean = [r for r in moving if weight(r)>.995 and abs(r.get('yawRate',0))<.15]
    turning = [r for r in rows if r['state']=='turn']
    events=[]
    if moving:
        first=moving[0]['frame']
        end=next((r['frame'] for r in rows if r['frame']>first and r['state'] not in ('walk','start','stop')),rows[-1]['frame'])
        episode=[r for r in rows if first<=r['frame']<end]
        first_full=next((r['frame'] for r in episode if weight(r)>.995),end)
        starts=[r for r in episode if r['frame']<=first_full]
        events.append(('start',min(starts,key=lambda r:abs(weight(r)-.5)) if starts else moving[0]))
        cruise=[r for r in clean if first<=r['frame']<end]
        if cruise:events.append(('cruise',cruise[len(cruise)//2]))
        elif clean:events.append(('cruise',clean[len(clean)//3]))
        last_full=next((r['frame'] for r in reversed(episode) if weight(r)>.995),first)
        stops=[r for r in episode if r['frame']>=last_full]
        if stops:events.append(('deceleration',min(stops,key=lambda r:abs(weight(r)-.5))))
    if turning: events.append(('turn',max(turning,key=lambda r:abs(r.get('yawRate',0)))))
    if moving:
        start=moving[0]['frame']
        stops=[r for r in rows if r['frame']>start+30 and r['state']=='observe']
        if stops: events.append(('stop',stops[0]))
    return [(name,r['frame']) for name,r in events]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo',required=True,type=Path)
    parser.add_argument('--evidence',required=True,type=Path)
    parser.add_argument('--seconds',type=float,default=45)
    parser.add_argument('--seed',type=int,default=424242)
    parser.add_argument('--viewports',nargs='+',choices=['desktop','mobile'],default=['desktop','mobile'])
    parser.add_argument('--video',action='store_true')
    parser.add_argument('--video-fps',type=int,default=30)
    parser.add_argument('--skip-captures',action='store_true',help='Compact numeric pass; actual-scene images can be replayed after its verdict')
    args=parser.parse_args()
    args.evidence.mkdir(parents=True,exist_ok=True)
    exhibit=args.repo/'review/exhibition-25-years'
    report={'scope':'Real exhibition integrated gait QA','seed':args.seed,'seconds':args.seconds,'dt':1/60,
            'renderMode':'Controlled manual render of the real scene: renderer animation loop stopped after ready, background screen animation frozen, visitor updater advances at fixed physical dt. This is not a real-time FPS benchmark.',
            'sourceHashes':{},'viewports':{},'errors':[]}
    for name in ['index.html','exhibition-3d.js','visitors-v43.js','visitor-motion-v43.js',
                 'assets/models/visitors/walking-woman.glb','assets/models/visitors/walking-man.glb',
                 'assets/models/visitors/motions/emma-native-motions.glb','assets/models/visitors/motions/ethan-native-motions.glb',
                 'assets/models/visitors/motions/emma-native-turns.glb','assets/models/visitors/motions/ethan-native-turns.glb']:
        p=exhibit/name
        if p.exists():report['sourceHashes'][name]=digest(p)
    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*unused):pass
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(args.repo)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    url=f'http://127.0.0.1:{server.server_port}/review/exhibition-25-years/?visitorQA=1&visitorSeed={args.seed}&visitorDemoEvery=9999'
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',headless=True,args=['--enable-unsafe-swiftshader'])
            for viewport in args.viewports:
                size={'width':1440,'height':1000} if viewport=='desktop' else {'width':390,'height':844}
                page=browser.new_page(viewport=size,device_scale_factor=1)
                record={'viewport':size,'pageErrors':[],'console':[],'captures':[],'videos':[]}
                report['viewports'][viewport]=record
                page.on('pageerror',lambda error,r=record:r['pageErrors'].append(str(error)))
                page.on('console',lambda msg,r=record:r['console'].append({'type':msg.type,'text':msg.text}) if msg.type in ('error','warning') or 'context lost' in msg.text.lower() else None)
                page.goto(url,wait_until='domcontentloaded',timeout=90000)
                page.wait_for_function('window.__EXHIBITION_VISITOR_QA__',timeout=120000)
                page.evaluate('window.__EXHIBITION_VISITOR_QA__.ready()')
                page.evaluate("""()=>{const q=__EXHIBITION_VISITOR_QA__;window.__QA_WEBGL_EVENTS__=[];for(const name of ['webglcontextlost','webglcontextrestored'])q.refs.renderer.domElement.addEventListener(name,()=>__QA_WEBGL_EVENTS__.push({name,time:q.time}));}""")
                page.evaluate('__EXHIBITION_VISITOR_QA__.refs.renderer.setAnimationLoop(null)')
                record['rendererProfile']=page.evaluate("""()=>{const renderer=__EXHIBITION_VISITOR_QA__.refs.renderer,gl=renderer.getContext(),d=gl.getExtension('WEBGL_debug_renderer_info');return {version:gl.getParameter(gl.VERSION),unmaskedRenderer:d?gl.getParameter(d.UNMASKED_RENDERER_WEBGL):null,unmaskedVendor:d?gl.getParameter(d.UNMASKED_VENDOR_WEBGL):null,maxTextureSize:gl.getParameter(gl.MAX_TEXTURE_SIZE),attributes:gl.getContextAttributes(),isContextLost:gl.isContextLost(),pixelRatio:renderer.getPixelRatio()};}""")
                page.locator('#exhibitionCanvas').scroll_into_view_if_needed()
                record['metadata']=page.evaluate(INSTALL_PROBE)
                if record['metadata']['version']<43:raise RuntimeError('Real entry still uses old runtime')
                samples=[page.evaluate('__INTEGRATED_GAIT_PROBE__.reset()')]
                started=time.monotonic()
                count=round(args.seconds*60)
                for offset in range(0,count,30):
                    # JSON avoids Playwright's recursive per-value object wrapper;
                    # the bounded half-second payload remains ordinary evidence.
                    payload=page.evaluate('n=>JSON.stringify(__INTEGRATED_GAIT_PROBE__.batch(n,1/60,6))',min(30,count-offset))
                    samples.extend(json.loads(payload))
                    if (offset//30+1)%20==0:
                        print(json.dumps({'viewport':viewport,'physicalSeconds':samples[-1]['time'],'wallSeconds':round(time.monotonic()-started,1)}),flush=True)
                        (args.evidence/f'{viewport}-partial-samples.json').write_text(json.dumps(samples,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
                record['summary']=summarize(samples)
                output=args.evidence/f'{viewport}-samples.json'
                output.write_text(json.dumps(samples,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
                record['samplesFile']=str(output)
                record['completedSampleFrames']=len(samples)
                print(json.dumps({'viewport':viewport,'summary':record['summary']},ensure_ascii=False),flush=True)
                for actor in ('emma','ethan'):
                    if args.skip_captures:continue
                    selected=select_captures(samples,actor)
                    for stage,frame in selected:
                        page.evaluate('frame=>__INTEGRATED_GAIT_PROBE__.replay(frame)',frame)
                        for view in ('front','side','back'):
                            camera=page.evaluate('o=>__INTEGRATED_GAIT_PROBE__.camera(o.actor,o.view)',{'actor':actor,'view':view})
                            health=page.evaluate('({lost:__EXHIBITION_VISITOR_QA__.refs.renderer.getContext().isContextLost(),events:__QA_WEBGL_EVENTS__})')
                            record['webglHealth']=health
                            if health['lost'] or health['events']:raise RuntimeError('WebGL context lost: visual captures are invalid; stop this run')
                            name=f'{viewport}-{actor}-{stage}-{view}-frame-{frame}.png'
                            page.locator('#exhibitionCanvas').screenshot(path=str(args.evidence/name))
                            record['captures'].append({'actor':actor,'stage':stage,'frame':frame,'view':view,'file':name,'camera':camera})
                        if stage=='cruise':
                            proof=page.evaluate('id=>__INTEGRATED_GAIT_PROBE__.referenceScene(id)',actor)
                            name=f'{viewport}-{actor}-same-phase-reference-frame-{frame}.png'
                            page.locator('#exhibitionCanvas').screenshot(path=str(args.evidence/name))
                            record['captures'].append({'actor':actor,'stage':'same-phase-reference','file':name,'proof':proof})
                            page.evaluate('__EXHIBITION_VISITOR_QA__.render()')
                    if args.video:
                        ffmpeg=shutil.which('ffmpeg')
                        if not ffmpeg:raise RuntimeError('ffmpeg is required for --video')
                        rows=[a for f in samples for a in f['actors'] if a['id']==actor]
                        moving=[r for r in rows if r.get('measuredRootSpeedMps',0)>.08]
                        if not moving:raise RuntimeError(actor+': no real movement to record')
                        first=max(0,moving[0]['frame']-60)
                        stops=[r for r in rows if r['frame']>moving[0]['frame']+30 and r['state']=='observe']
                        end=min(count,(stops[0]['frame']+60) if stops else moving[-1]['frame']+60)
                        page.evaluate('n=>__INTEGRATED_GAIT_PROBE__.replay(n)',first)
                        target=args.evidence/f'{viewport}-{actor}-real-journey.mp4'
                        cmd=[ffmpeg,'-y','-loglevel','error','-f','image2pipe','-vcodec','png','-framerate',str(args.video_fps),'-i','-','-an','-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','-crf','21','-movflags','+faststart',str(target)]
                        proc=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=subprocess.PIPE)
                        steps=round(60/args.video_fps)
                        try:
                            for n in range(first,end,steps):
                                page.evaluate('n=>__INTEGRATED_GAIT_PROBE__.batch(n,1/60,1000000)',min(steps,end-n))
                                view=('front','side','back')[min(2,int(3*(n-first)/max(1,end-first)))]
                                page.evaluate('o=>__INTEGRATED_GAIT_PROBE__.camera(o.actor,o.view)',{'actor':actor,'view':view})
                                proc.stdin.write(page.locator('#exhibitionCanvas').screenshot(type='png'))
                            proc.stdin.close();stderr=proc.stderr.read().decode('utf-8',errors='replace');code=proc.wait()
                            if code:raise RuntimeError(stderr)
                        finally:
                            if proc.poll() is None:proc.kill()
                        record['videos'].append({'actor':actor,'file':str(target),'fps':args.video_fps,'startFrame':first,'endFrame':end,'physicalDurationSeconds':(end-first)/60,'views':'front/side/back in chronological thirds; real exhibition scene'})
                record['finalSnapshot']=page.evaluate('__EXHIBITION_VISITOR_QA__.refs.updateWalkers.snapshot()')
                page.close()
            browser.close()
    except Exception as exc:
        report['exception']=str(exc);report['traceback']=traceback.format_exc()
        print(report['traceback'],flush=True)
    finally:
        server.shutdown()
        report['sourceHashesAfter']={name:digest(exhibit/name)for name in report['sourceHashes']}
        report['sourcesUnchangedByQA']=report['sourceHashesAfter']==report['sourceHashes']
        report['passedNumericalGates']=not report.get('exception') and report['sourcesUnchangedByQA'] and all(
            not v['pageErrors'] and not any('context lost' in m['text'].lower() or 'context_lost' in m['text'].lower() for m in v['console']) and v.get('completedSampleFrames')==round(args.seconds*60)+1 and len(v.get('summary',{}))==2 and all(
                s['maxCanonicalLocalPositionErrorM'] is not None and s['maxCanonicalLocalPositionErrorM']<1e-5
                and s['maxCanonicalLocalRotationErrorDegrees']<.02
                and s['completedFirstJourney'] and {'observe','walk','turn'}.issubset(s['states'])
                and s['liftCapExceededFrames']==0 and s['dropCapExceededFrames']==0 and s['fullUnionMinYM']>-.002
                and s['runtimeUnionMaxAt60HzM']<=.002
                and s['maxRuntimeIndependentUnionDeltaM']<1e-6 and s['unionVertexCountMatchesRuntime']
                and all(f['fullWeightedMinYM'] is not None and f['fullWeightedMinYM']>-.002 and max(f['lengthRangeM'].values())<.002 for f in s['feet'].values())
                for s in v.get('summary',{}).values())
            for v in report['viewports'].values())
        report['visualReviewRequired']='Numerical gates do not certify gait naturalness. Review real-scene front/side/back start/cruise/turn/stop and normal-speed videos.'
        (args.evidence/'integrated-gait-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'report':str(args.evidence/'integrated-gait-report.json'),'numericalGates':report['passedNumericalGates'],'exception':report.get('exception')},ensure_ascii=False),flush=True)
    raise SystemExit(0 if report['passedNumericalGates'] else 1)


if __name__=='__main__':
    main()
