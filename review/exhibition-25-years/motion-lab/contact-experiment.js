import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { createFootIKExperiment, FOOT_IK_UPSTREAM } from './foot-ik-experiment.js';

const ACTORS = { emma: { speed: .90, asset: './assets/emma-native-motions.glb' },
  ethan: { speed: .84, asset: './assets/ethan-native-motions.glb' } };
const SIDES = ['left', 'right'];
const normalize = (name) => name.replace(/^mixamorig:?/i, '').toLowerCase();
const vec = (a) => new THREE.Vector3(...a);
const jsonClone = (value) => JSON.parse(JSON.stringify(value));
const state = { ready: false, actor: null, ids: [], lab: null, experiment: null,
  runtimes: [], profiles: {}, base: [], time: 0, frames: [], last: null, metadata: null,
  running: false, raf: 0, errors: [], fixedDelta: 1 / 60, view: 'three-quarter' };
const ROOT_LIFT_CONTROL = Object.freeze({ capMetres: .02, releaseTauSeconds: .08 });
const nativeCache = new Map();

function finite(value, label) {
  if (!Number.isFinite(value)) throw new Error(`Non-finite ${label}`);
  return value;
}
function cubic(track) { return Boolean(track.createInterpolant?.isInterpolantFactoryMethodGLTFCubicSpline); }
function valuesAt(track, time) { return Array.from(track.createInterpolant().evaluate(time)); }

/** Preserve the source clip; remove only constant + linear Hips XZ translation. */
export function deriveLocomotionClip(source, runtime, speed) {
  const duration = finite(source.duration, 'source duration');
  if (duration <= 0 || speed <= 0) throw new Error('Duration and speed must be positive.');
  const hipsName = normalize(runtime.roles.hips.name);
  const rootTracks = source.tracks.filter((track) => {
    const parsed = THREE.PropertyBinding.parseTrackName(track.name);
    const target = parsed.objectName === 'bones' ? parsed.objectIndex : parsed.nodeName;
    return parsed.propertyName === 'position' && typeof target === 'string' && normalize(target) === hipsName;
  });
  if (rootTracks.length !== 1) throw new Error(`Expected one Hips.position track; found ${rootTracks.length}.`);
  const sourceRoot = rootTracks[0];
  const start = valuesAt(sourceRoot, 0), end = valuesAt(sourceRoot, duration);
  if (start.length !== 3 || end.length !== 3) throw new Error('Hips track must interpolate VEC3.');
  const displacementLocal = new THREE.Vector3(end[0]-start[0], 0, end[2]-start[2]);
  runtime.root.updateWorldMatrix(true, true);
  const displacementWorld = displacementLocal.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(runtime.roles.hips.parent.matrixWorld));
  const stride = Math.hypot(displacementWorld.x, displacementWorld.z);
  if (stride < .05 || stride > 5) throw new Error(`Unexpected world stride ${stride}m; inspect units before proceeding.`);
  if (Math.abs(displacementWorld.y) > 1e-4) throw new Error('Hips local XZ does not map to horizontal world displacement.');
  const cycleDuration = stride / speed, timeScale = cycleDuration / duration;
  const derived = source.clone();
  derived.name = 'Contact · Walk';
  const targetRoot = derived.tracks[source.tracks.indexOf(sourceRoot)];
  for (const track of derived.tracks) {
    const isCubic = cubic(track), width = track.getValueSize(), valueSize = isCubic ? width/3 : width;
    if (isCubic && !Number.isInteger(valueSize)) throw new Error('Invalid cubic track width.');
    for (let key = 0; key < track.times.length; key++) {
      const oldTime = track.times[key];
      if (track === targetRoot) {
        const valueOffset = key*width + (isCubic ? valueSize : 0);
        for (const axis of [0, 2]) {
          const displacement = end[axis]-start[axis];
          track.values[valueOffset+axis] -= start[axis] + displacement*oldTime/duration;
          if (isCubic) {
            track.values[key*width+axis] -= displacement/duration;
            track.values[key*width+2*valueSize+axis] -= displacement/duration;
          }
        }
      }
      if (isCubic) {
        for (let axis = 0; axis < valueSize; axis++) {
          track.values[key*width+axis] /= timeScale;
          track.values[key*width+2*valueSize+axis] /= timeScale;
        }
      }
      track.times[key] = oldTime*timeScale;
    }
  }
  derived.duration = cycleDuration;
  let reconstructionError = 0, otherTracksError = 0;
  for (let sample = 0; sample <= 32; sample++) {
    const phase = sample/32;
    for (let i = 0; i < source.tracks.length; i++) {
      const a = valuesAt(source.tracks[i], phase*duration);
      const b = valuesAt(derived.tracks[i], phase*cycleDuration);
      if (source.tracks[i] === sourceRoot) {
        b[0] += start[0] + (end[0]-start[0])*phase;
        b[2] += start[2] + (end[2]-start[2])*phase;
        reconstructionError = Math.max(reconstructionError, ...a.map((v,j)=>Math.abs(v-b[j])));
      } else otherTracksError = Math.max(otherTracksError, ...a.map((v,j)=>Math.abs(v-b[j])));
    }
  }
  if (reconstructionError > 1e-4 || otherTracksError > 1e-4) throw new Error('Retiming/reconstruction did not preserve source motion.');
  const raw = source.clone(); raw.name = 'Contact · Raw source Walk';
  return { raw, derived, direction: displacementWorld.clone().setY(0).normalize(),
    report: { sourceClip: source.name, sourceDurationSeconds: duration, sourceTrackCount: source.tracks.length,
      hipsTrack: sourceRoot.name, hipsStartLocal: start, hipsEndLocal: end,
      extractedDisplacementLocal: displacementLocal.toArray(), extractedDisplacementWorldM: displacementWorld.toArray(),
      strideLengthM: stride, sourceAverageSpeedMps: stride/duration, requestedSpeedMps: speed,
      derivedClip: derived.name, derivedDurationSeconds: cycleDuration, trackTimeMultiplier: timeScale,
      equivalentPlaybackTimeScale: duration/cycleDuration,
      maxHipsReconstructionErrorLocal: reconstructionError, maxOtherTrackRetimingError: otherTracksError,
      hipsResidualStart: valuesAt(targetRoot,0), hipsResidualEnd: valuesAt(targetRoot,cycleDuration),
      preserved: ['Y channel','residual XZ sway','all other channel values; cubic tangents rescaled for changed time units'],
      changed: ['Hips XZ constant and linear cycle displacement removed','all track times retimed'],
      sourceClipMutated: false,
    } };
}

function profileFromRest(runtime, full) {
  const result = {};
  for (const side of SIDES) {
    const samples = full.soleSamples?.[side]?.vertices;
    if (!samples?.length) throw new Error(`No skinned sole samples for ${runtime.id}/${side}.`);
    const foot = runtime.roles[`${side}Foot`].getWorldPosition(new THREE.Vector3());
    const toe = runtime.roles[`${side}Toe`].getWorldPosition(new THREE.Vector3());
    const forward = toe.clone().sub(foot).setY(0).normalize();
    const lateral = forward.clone().cross(new THREE.Vector3(0,1,0)).normalize();
    const rows = samples.map((sample) => {
      const delta = vec(sample.world).sub(foot);
      return { ...sample, along: delta.dot(forward), lateral: delta.dot(lateral) };
    });
    const minAlong = Math.min(...rows.map((r)=>r.along)), maxAlong = Math.max(...rows.map((r)=>r.along));
    const span = maxAlong-minAlong;
    const key = (v) => `${v.mesh}:${v.vertexIndex}`;
    const heelKeys = rows.filter((r)=>r.along <= minAlong+.20*span).map(key);
    const toeKeys = rows.filter((r)=>r.along >= maxAlong-.20*span).map(key);
    const bottom = Math.min(...rows.map((r)=>r.world[1]));
    result[side] = { heelKeys, toeKeys, keys: rows.map(key),
      soleHalfWidth: Math.max(...rows.map((r)=>Math.abs(r.lateral))),
      soleHeelExtend: Math.max(0,-minAlong),
      soleToeExtend: Math.max(0,maxAlong-toe.clone().sub(foot).dot(forward)),
      soleSkinThickness: Math.max(0,toe.y-bottom),
      restSoleMinY: bottom, restFootWorld: foot.toArray(), restToeWorld: toe.toArray(),
      source: 'Fixed skinned-sole samples selected by motion-lab in the original rest pose; 20% forward-extreme bands define heel/toe.',
    };
  }
  return result;
}

/** Cache topology/weights once; evaluate every eligible deformed vertex each pose. */
function prepareFullShoeCache(runtime) {
  const accepted=Object.fromEntries(SIDES.map((side)=>{
    const nodes=new Set();runtime.roles[`${side}Foot`].traverse((o)=>nodes.add(o));return[side,nodes];
  }));
  const cache={meshes:[],counts:{left:0,right:0},threshold:.25};
  const getters=['getX','getY','getZ','getW'];
  runtime.root.traverse((mesh)=>{
    if(!mesh.isSkinnedMesh)return;
    const index=mesh.geometry.getAttribute('skinIndex'),weight=mesh.geometry.getAttribute('skinWeight');
    const position=mesh.geometry.getAttribute('position');
    if(!index||!weight||index.itemSize!==4||weight.itemSize!==4)throw new Error('Expected four decoded skin influences.');
    const boneMasks=mesh.skeleton.bones.map((bone)=>(accepted.left.has(bone)?1:0)|(accepted.right.has(bone)?2:0));
    const vertices=[];
    for(let i=0;i<position.count;i++){
      let left=0,right=0;
      for(let k=0;k<4;k++){
        const mask=boneMasks[index[getters[k]](i)],value=weight[getters[k]](i);
        if(mask&1)left+=value;if(mask&2)right+=value;
      }
      const mask=(left>=cache.threshold?1:0)|(right>=cache.threshold?2:0);
      if(mask){vertices.push({index:i,mask});if(mask&1)cache.counts.left++;if(mask&2)cache.counts.right++;}
    }
    cache.meshes.push({mesh,vertices,totalVertexCount:position.count});
  });
  if(SIDES.some((side)=>!cache.counts[side]))throw new Error('No full weighted shoe vertices.');
  return cache;
}

function measureFullShoe(id) {
  const runtime=state.runtimes.find((r)=>r.id===id),cache=state.fullShoeCaches[id];
  runtime.holder.updateMatrixWorld(true);
  runtime.root.traverse((o)=>{if(o.isSkinnedMesh)o.skeleton.update();});
  const sides=Object.fromEntries(SIDES.map((side)=>[side,{minY:Infinity,count:cache.counts[side],lowestWorld:null,lowestVertex:null}]));
  const point=new THREE.Vector3();
  for(const {mesh,vertices} of cache.meshes)for(const row of vertices){
    mesh.getVertexPosition(row.index,point).applyMatrix4(mesh.matrixWorld);
    for(let i=0;i<SIDES.length;i++)if(row.mask&(1<<i)){
      const out=sides[SIDES[i]];
      if(point.y<out.minY){out.minY=point.y;out.lowestWorld=point.toArray();out.lowestVertex={mesh:mesh.name,index:row.index};}
    }
  }
  return {scope:'ALL decoded SkinnedMesh vertices with summed weight >=.25 on Foot and descendants; cached indices, live skinning',sides};
}

function exactMeasurement(id) {
  const model = state.lab.snapshot({ ids: [id], allBones: true }).models[0];
  const profile = state.profiles[id];
  const sideMeasurements = {};
  for (const side of SIDES) {
    const samples = model.soleSamples[side].vertices;
    const select = (keys) => samples.filter((s)=>keys.includes(`${s.mesh}:${s.vertexIndex}`));
    const measure = (points) => {
      if (!points.length) throw new Error('Empty exact sole sample group.');
      const mean = [0,0,0];
      for (const p of points) for (let i=0;i<3;i++) mean[i]+=p.world[i]/points.length;
      const low = points.reduce((a,b)=>a.world[1]<b.world[1]?a:b);
      return { minY: finite(low.world[1],'sole Y'), centroidWorld: mean,
        centroidActor: mean.map((v,i)=>v-model.placement[i]),
        lowestWorld: low.world, lowestVertex: {mesh:low.mesh,index:low.vertexIndex}, count:points.length };
    };
    sideMeasurements[side] = { sole:measure(samples), heel:measure(select(profile[side].heelKeys)), toe:measure(select(profile[side].toeKeys)) };
  }
  return { id, time:model.time, phase:model.phase, placement:model.placement,
    sides:sideMeasurements, fullWeightedShoe:measureFullShoe(id),segmentLengths:model.segmentLengthsWorld };
}

/** Explicit C control, not a library or IK: one vertical translation of the whole root. */
function createRootLiftControl(runtime) {
  let previousLift=0,last=null;
  const reset=()=>{previousLift=0;last=null;};
  return {reset,get last(){return last;},poseHook:{
    label:'C control: whole-root Y lift only; cap 20mm, release tau 80ms',
    onReset:(ctx)=>{if(ctx.reason!=='loop-wrap')reset();},
    afterPose:(ctx)=>{
      const before=exactMeasurement(runtime.id);
      const rawMin=Math.min(...SIDES.map((side)=>before.fullWeightedShoe.sides[side].minY));
      const requested=Math.max(0,-rawMin),target=Math.min(ROOT_LIFT_CONTROL.capMetres,requested);
      const lift=target>=previousLift || ctx.delta<=0 ? target
        :target+(previousLift-target)*Math.exp(-ctx.delta/ROOT_LIFT_CONTROL.releaseTauSeconds);
      const localPose=runtime.bones.map((bone)=>({bone,p:bone.position.clone(),q:bone.quaternion.clone(),s:bone.scale.clone()}));
      runtime.root.updateWorldMatrix(true,true);
      const localDelta=new THREE.Vector3(0,lift,0);
      if(runtime.root.parent)localDelta.applyMatrix3(new THREE.Matrix3().setFromMatrix4(runtime.root.parent.matrixWorld).invert());
      runtime.root.position.add(localDelta);
      runtime.root.updateWorldMatrix(true,true);
      const after=exactMeasurement(runtime.id);
      let boneLocalTransformDelta=0;
      for(const saved of localPose)boneLocalTransformDelta=Math.max(boneLocalTransformDelta,
        saved.p.distanceTo(saved.bone.position),...saved.q.toArray().map((v,i)=>Math.abs(v-saved.bone.quaternion.toArray()[i])),saved.s.distanceTo(saved.bone.scale));
      let maxXZChange=0,maxYTranslationError=0;
      for(const side of SIDES)for(const part of ['sole','heel','toe']){
        const a=before.sides[side][part],b=after.sides[side][part];
        maxXZChange=Math.max(maxXZChange,Math.abs(a.centroidWorld[0]-b.centroidWorld[0]),Math.abs(a.centroidWorld[2]-b.centroidWorld[2]));
        maxYTranslationError=Math.max(maxYTranslationError,Math.abs(b.minY-a.minY-lift));
      }
      previousLift=lift;
      last={before,after,rawMinYM:rawMin,requestedLiftM:requested,targetLiftM:target,appliedLiftM:lift,
        capExceeded:requested>ROOT_LIFT_CONTROL.capMetres+1e-9,maxXZChangeM:maxXZChange,
        maxYTranslationErrorM:maxYTranslationError,boneLocalTransformDelta,
        method:'Whole-root world Y translation only; no joint changes, XZ edits, foot lock or IK.'};
    },onDetach:reset}};
}

async function loadNative(actor) {
  if (!nativeCache.has(actor)) {
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    nativeCache.set(actor, loader.loadAsync(ACTORS[actor].asset));
  }
  return nativeCache.get(actor);
}

function pause() { state.running=false; cancelAnimationFrame(state.raf); updateUI(); }
function followCamera() {
  const runtime=state.runtimes[0]; if (!runtime) return;
  const center=state.runtimes.reduce((v,r)=>v.add(r.holder.position),new THREE.Vector3()).multiplyScalar(1/state.runtimes.length);
  if (runtime.controls && state.cameraOffset) {
    runtime.controls.target.copy(center).add(new THREE.Vector3(0,.9,0));
    runtime.camera.position.copy(runtime.controls.target).add(state.cameraOffset);
    runtime.controls.update();
  }
}

async function setup(actor='emma') {
  if (!ACTORS[actor]) throw new Error(`Unknown actor ${actor}`);
  pause(); state.ready=false;
  if (state.experiment) { state.lab.detachPoseHook(state.ids[1]); state.lab.detachPoseHook(state.ids[2]); state.experiment=null;state.liftControl=null; }
  state.actor=actor; state.ids=[`${actor}-raw`,`${actor}-ik`,`${actor}-lift`];
  await state.lab.load(state.ids); state.lab.pause(); state.lab.setRestPose(state.ids);
  state.runtimes=state.ids.map((id)=>state.lab.getRuntime(id));
  state.profiles={};state.fullShoeCaches={};
  for (const runtime of state.runtimes) {
    state.profiles[runtime.id]=profileFromRest(runtime,state.lab.snapshot({ids:[runtime.id],allBones:true}).models[0]);
    state.fullShoeCaches[runtime.id]=prepareFullShoeCache(runtime);
  }
  const native=await loadNative(actor);
  const candidates=native.animations.filter((clip)=>clip.name==='UPF · Walk');
  if(candidates.length!==1) throw new Error(`Expected one UPF · Walk in native asset; found ${candidates.length}.`);
  const source=candidates[0]; const sourceSignature=JSON.stringify(source.toJSON());
  const motion=deriveLocomotionClip(source,state.runtimes[0],ACTORS[actor].speed);
  if(JSON.stringify(source.toJSON())!==sourceSignature) throw new Error('Source Walk was mutated.');
  for(const runtime of state.runtimes) {
    const existing=new Set(runtime.clips.map((clip)=>clip.name));
    const additions=[motion.raw,motion.derived].filter((clip)=>!existing.has(clip.name));
    if(additions.length) state.lab.addClips(runtime.id,additions,{prefix:'Contact · '});
  }
  state.direction=motion.direction; state.speed=ACTORS[actor].speed;
  state.base=state.runtimes.map((runtime)=>runtime.holder.position.clone());
  const left=state.profiles[state.ids[1]].left,right=state.profiles[state.ids[1]].right;
  const soleOptions={};
  for(const key of ['soleHalfWidth','soleToeExtend','soleHeelExtend']) soleOptions[key]=Math.max(left[key],right[key]);
  soleOptions.soleSkinThickness=(left.soleSkinThickness+right.soleSkinThickness)/2;
  const ikRuntime=state.runtimes[1];
  state.experiment=createFootIKExperiment({root:ikRuntime.root,scene:ikRuntime.scene,
    clips:ikRuntime.clips,roles:ikRuntime.roles,getAction:ikRuntime.getAction,floorMeshes:ikRuntime.floorMeshes,
    calibrationLabel:`${actor}: original current GLB rest pose; measured fixed sole samples`,
    locomotionClipNames:{walkAnim:motion.derived.name,runAnim:''},optionsMeters:soleOptions,
    measurePose:()=>exactMeasurement(state.ids[1]),staticPreviewSteps:24});
  state.lab.attachPoseHook(state.ids[1],state.experiment.poseHook);
  state.liftControl=createRootLiftControl(state.runtimes[2]);
  state.lab.attachPoseHook(state.ids[2],state.liftControl.poseHook);
  state.lab.setClip(motion.derived.name,state.ids); state.lab.setLoop(true);
  state.metadata={actor,units:'metres',sourceNativeAsset:ACTORS[actor].asset,
    geometrySource:state.runtimes[0].definition.url,geometrySameForAandB:true,
    A:'Same current model + derived Walk; no external IK',B:'Same current model + same derived Walk + pinned FootIK only',
    C:'Same current model + same derived Walk + one world-vertical root translation; explicit control, not a ready library',
    rootLiftControl:{...ROOT_LIFT_CONTROL,
      target:'max(0,-minimum of ALL exact skinned weighted Foot/Toe vertices), no constant extra offset',
      update:'Immediate rise; fall: target+(previous-target)*exp(-physicalDelta/tau); report cap exceed as failure',
      preserves:'All joint local transforms and all XZ vertex positions; does not lock feet'},
    frozenV42:'Separate reference, not executed by this bench',motion:motion.report,
    phaseHeuristic:'Pinned FootIK sampled-animation phase, same mask applied to A and B; NOT contact ground truth',
    measurement:'Contact minima: ALL vertices with summed weight >=.25 on Foot and descendants, cached indices and live skinning every pose. Comparable centroid drift and heel/toe groups: original fixed 64-point samples.',
    fullWeightedShoeCounts:state.fullShoeCaches[state.ids[0]].counts,
    profiles:state.profiles,soleCalibrationOptionsMetres:soleOptions,
    soleCalibrationPolicy:'Before the trial, take max(left,right) width/toe/heel and mean toe-to-bottom thickness. No parameter sweep or post-result tuning.',
    footIK:FOOT_IK_UPSTREAM,initialization:'Reset at t=0; all 480 measured dynamic frames include startup; no warmup discarded.'};
  state.lab.setDisplay({soles:true,grid:true}); state.lab.setView(state.view);
  const r=state.runtimes[0];state.cameraOffset=r.controls?r.camera.position.clone().sub(r.controls.target):null;
  state.ready=true; reset();
  document.querySelectorAll('.model-card select').forEach((select)=>{select.disabled=true;});
  updateUI();return snapshot();
}

function reset() {
  pause(); if(!state.experiment) return;
  state.time=0;state.frames=[];state.last=null;
  state.runtimes.forEach((runtime,i)=>runtime.holder.position.copy(state.base[i]));
  state.lab.seek(0,{ids:state.ids});state.experiment.reset('contact-trial-start',{clearStatistics:true});
  state.liftControl.reset();
  followCamera();updateUI();
}

function step(delta=1/60,{record=true}={}) {
  if(!state.ready) throw new Error('Contact bench is not ready.');
  if(!Number.isFinite(delta)||delta<=0||delta>.1) throw new Error('Contact delta must be in (0,.1].');
  state.time+=delta;
  state.runtimes.forEach((runtime,i)=>runtime.holder.position.copy(state.base[i]).addScaledVector(state.direction,state.speed*state.time));
  followCamera();
  state.lab.advanceFixedStep(delta,state.ids);
  const ik=state.experiment.snapshot().last;
  if(ik.frameMode!=='continuous-dynamic-step') throw new Error('Expected a dynamic FootIK step.');
  const raw=exactMeasurement(state.ids[0]),before=ik.exactExternalMeasurement.before,after=ik.exactExternalMeasurement.after;
  const lift=state.liftControl.last;
  if(!lift)throw new Error('C root-lift control did not evaluate.');
  let parity=0;
  for(const side of SIDES) for(const part of ['sole','heel','toe']) {
    const a=raw.sides[side][part],b=before.sides[side][part];
    const c=lift.before.sides[side][part];
    parity=Math.max(parity,Math.abs(a.minY-b.minY),...a.centroidActor.map((v,i)=>Math.abs(v-b.centroidActor[i])),
      Math.abs(a.minY-c.minY),...a.centroidActor.map((v,i)=>Math.abs(v-c.centroidActor[i])));
  }
  for(const side of SIDES)parity=Math.max(parity,
    Math.abs(raw.fullWeightedShoe.sides[side].minY-before.fullWeightedShoe.sides[side].minY),
    Math.abs(raw.fullWeightedShoe.sides[side].minY-lift.before.fullWeightedShoe.sides[side].minY));
  const row={frame:Math.round(state.time/state.fixedDelta),time:state.time,delta,
    raw,before,after,afterC:lift.after,liftControl:lift,preIKParityMaxM:parity,contactHeuristics:ik.contactHeuristics,
    telemetry:ik.telemetry,kneeBendDegrees:Object.fromEntries(SIDES.map((side)=>[side,{before:ik.before.feet[side].kneeBendDegrees,after:ik.after.feet[side].kneeBendDegrees}])),
    correction:ik.correction,rootVelocityMps:ik.rootVelocityMps,resetCount:ik.resetCount};
  if(parity>1e-5) throw new Error(`A vs B pre-IK parity failed: ${parity}m.`);
  state.last=row;if(record)state.frames.push(row);updateUI();return row;
}

function run(seconds=8,delta=1/60) {
  reset(); state.fixedDelta=delta;
  const count=Math.round(seconds/delta);
  if(count<1||count>3600)throw new Error('Trial must contain 1..3600 steps.');
  for(let i=0;i<count;i++)step(delta);
  return {metadata:jsonClone(state.metadata),summary:summary(),frames:jsonClone(state.frames)};
}

function frame(index,delta=1/60) {
  if(!Number.isInteger(index)||index<0||index>3600)throw new Error('Invalid frame index.');
  reset();state.fixedDelta=delta;
  for(let i=0;i<index;i++)step(delta,{record:false});
  state.lab.setView(state.view);
  const r=state.runtimes[0];state.cameraOffset=r.controls?r.camera.position.clone().sub(r.controls.target):null;
  return snapshot();
}

/** Independent cloned A rig: exact endpoints, without LoopRepeat wrapping. */
function seamCheck() {
  if(!state.ready)throw new Error('Contact bench is not ready.');
  const runtime=state.runtimes[0],clip=runtime.clips.find((c)=>c.name==='Contact · Walk');
  const root=cloneSkeleton(runtime.root),mixer=new THREE.AnimationMixer(root);
  const action=mixer.clipAction(clip);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
  const capture=(time)=>{
    mixer.setTime(time);root.updateMatrixWorld(true);
    const result={};root.traverse((bone)=>{
      if(!bone.isBone)return;
      result[bone.name]={position:bone.getWorldPosition(new THREE.Vector3()).toArray(),
        quaternion:bone.getWorldQuaternion(new THREE.Quaternion()).normalize().toArray(),
        scale:bone.getWorldScale(new THREE.Vector3()).toArray()};
    });return result;
  };
  const start=capture(0),end=capture(clip.duration),bones=[];
  for(const[name,a]of Object.entries(start)){
    const b=end[name],delta=b.position.map((v,i)=>v-a.position[i]);
    bones.push({name,worldPositionDeltaM:delta,distanceM:Math.hypot(...delta),
      worldRotationDeltaDegrees:new THREE.Quaternion(...a.quaternion).angleTo(new THREE.Quaternion(...b.quaternion))*180/Math.PI,
      maxWorldScaleDelta:Math.max(...b.scale.map((v,i)=>Math.abs(v-a.scale[i])))});
  }
  mixer.stopAllAction();mixer.uncacheRoot(root);
  return {actor:state.actor,clip:clip.name,durationSeconds:clip.duration,
    scope:'A derived clip after linear Hips XZ removal; isolated cloned rig; LoopOnce exact t=0 and t=duration; comparison holder translation omitted equally. Endpoint C0 pose only, not velocity or perceptual continuity.',
    boneCount:bones.length,maxWorldPositionDeltaM:Math.max(...bones.map((b)=>b.distanceM)),
    maxWorldRotationDeltaDegrees:Math.max(...bones.map((b)=>b.worldRotationDeltaDegrees)),
    maxWorldScaleDelta:Math.max(...bones.map((b)=>b.maxWorldScaleDelta)),bones};
}

function percentile(values,p) {const a=values.slice().sort((x,y)=>x-y);return a.length?a[Math.round((a.length-1)*p)]:null;}
function summary() {
  const frames=state.frames, results={};
  for(const branch of ['raw','after','afterC']) {
    results[branch]={};
    for(const side of SIDES) {
      const list=frames.map((f)=>f[branch].sides[side]);
      const stance=frames.filter((f)=>f.contactHeuristics[side].stance===true);
      const record={};
      for(const part of ['sole','heel','toe']) {
        const ys=list.map((v)=>v[part].minY);
        record[part]={minYM:ys.length?Math.min(...ys):null,maxPenetrationM:ys.length?Math.max(0,-Math.min(...ys)):null,
          secondsBelowMinus2mm:frames.reduce((sum,f)=>sum+(f[branch].sides[side][part].minY<-.002?f.delta:0),0),
          secondsBelowMinus15mm:frames.reduce((sum,f)=>sum+(f[branch].sides[side][part].minY<-.015?f.delta:0),0),
          heuristicStanceMedianYM:percentile(stance.map((f)=>f[branch].sides[side][part].minY),.5),
          heuristicStanceMaxYM:stance.length?Math.max(...stance.map((f)=>f[branch].sides[side][part].minY)):null,
          heuristicStanceSecondsAbove15mm:stance.reduce((sum,f)=>sum+(f[branch].sides[side][part].minY>.015?f.delta:0),0)};
      }
      let anchor=null,last=null,maxDrift=0;const speeds=[];
      for(const f of frames){
        if(f.contactHeuristics[side].stance!==true){anchor=null;last=null;continue;}
        const p=f[branch].sides[side].sole.centroidWorld;
        if(!anchor)anchor=p;
        maxDrift=Math.max(maxDrift,Math.hypot(p[0]-anchor[0],p[2]-anchor[2]));
        if(last)speeds.push(Math.hypot(p[0]-last[0],p[2]-last[2])/f.delta);
        last=p;
      }
      record.heuristicStanceCentroidDrift={maxSegmentDriftM:stance.length?maxDrift:null,
        medianHorizontalSpeedMps:percentile(speeds,.5),sampleCount:stance.length,
        note:'Fixed sampled-sole centroid during inferred stance; includes rolling-foot motion, not ground-truth contact-point slip.'};
      const fullYs=frames.map((f)=>f[branch].fullWeightedShoe.sides[side].minY);
      record.fullWeightedShoe={count:state.fullShoeCaches[state.ids[0]].counts[side],
        minYM:fullYs.length?Math.min(...fullYs):null,
        maxPenetrationM:fullYs.length?Math.max(0,-Math.min(...fullYs)):null,
        secondsBelowMinus2mm:frames.reduce((sum,f)=>sum+(f[branch].fullWeightedShoe.sides[side].minY<-.002?f.delta:0),0),
        heuristicStanceMedianYM:percentile(stance.map((f)=>f[branch].fullWeightedShoe.sides[side].minY),.5),
        heuristicStanceMaxYM:stance.length?Math.max(...stance.map((f)=>f[branch].fullWeightedShoe.sides[side].minY)):null};
      results[branch][side]=record;
    }
  }
  const ranked=frames.flatMap((f)=>{
    const sides=SIDES.filter((side)=>f.contactHeuristics[side].stance===true);
    return sides.length?[{frame:f.frame,time:f.time,
      score:Math.max(...sides.map((side)=>Math.abs(f.after.fullWeightedShoe.sides[side].minY))),
      heuristicStanceSides:sides}]:[];
  }).sort((a,b)=>a.score-b.score);
  const rootSpeeds=frames.map((f)=>Math.hypot(...f.rootVelocityMps));
  const resets=[...new Set(frames.map((f)=>f.resetCount))];
  return {actor:state.actor,frames:frames.length,dynamicSeconds:frames.reduce((s,f)=>s+f.delta,0),
    preIKParityMaxM:frames.length?Math.max(...frames.map((f)=>f.preIKParityMaxM)):null,
    sameSourceGeometryAndClip:true,results,
    validation:{rootSpeedMinMps:rootSpeeds.length?Math.min(...rootSpeeds):null,
      rootSpeedMaxMps:rootSpeeds.length?Math.max(...rootSpeeds):null,
      rootSpeedMaxErrorMps:rootSpeeds.length?Math.max(...rootSpeeds.map((v)=>Math.abs(v-state.speed))):null,
      distinctResetCounts:resets,continuousAcrossClipWrap:resets.length<=1},
    CControl:{method:state.metadata.C,parameters:ROOT_LIFT_CONTROL,
      maxRequestedLiftM:frames.length?Math.max(...frames.map((f)=>f.liftControl.requestedLiftM)):null,
      maxAppliedLiftM:frames.length?Math.max(...frames.map((f)=>f.liftControl.appliedLiftM)):null,
      capExceededFrames:frames.filter((f)=>f.liftControl.capExceeded).length,
      targetGeometry:'ALL weighted Foot/Toe vertices, not fixed64',
      maxFullWeightedShoePenetrationM:frames.length?Math.max(0,...frames.flatMap((f)=>SIDES.map((side)=>-f.afterC.fullWeightedShoe.sides[side].minY))):null,
      maxXZChangeM:frames.length?Math.max(...frames.map((f)=>f.liftControl.maxXZChangeM)):null,
      maxYTranslationErrorM:frames.length?Math.max(...frames.map((f)=>f.liftControl.maxYTranslationErrorM)):null,
      maxBoneLocalTransformDelta:frames.length?Math.max(...frames.map((f)=>f.liftControl.boneLocalTransformDelta)):null},
    imageSelection:{criterion:'Maximum absolute full-weighted-shoe minimum Y in B among feet labelled plant by the upstream phase heuristic. This ranks contact clearance for illustration, not overall animation quality; phase is not ground truth.',best:ranked[0]||null,worst:ranked.at(-1)||null},
    footIKRuntime:state.experiment.snapshot().totals,errors:state.errors.slice(),labErrors:state.lab.errors};
}

function snapshot() {return {ready:state.ready,actor:state.actor,time:state.time,metadata:state.metadata,
  frame:state.last,summary:summary(),lab:state.lab.snapshot({ids:state.ids,allBones:false})};}
function play() {
  if(!state.ready)return;state.lab.pause();state.running=true;let previous=null,accumulator=0;
  const tick=(timestamp)=>{
    if(!state.running)return;
    if(previous!==null)accumulator+=Math.min((timestamp-previous)/1000,.1);
    previous=timestamp;
    try{while(accumulator>=1/60){step(1/60,{record:false});accumulator-=1/60;}}
    catch(error){state.errors.push(String(error));pause();throw error;}
    state.raf=requestAnimationFrame(tick);
  };state.raf=requestAnimationFrame(tick);updateUI();
}
function setView(view){state.view=view;state.lab.setView(view);const r=state.runtimes[0];state.cameraOffset=r?.controls?r.camera.position.clone().sub(r.controls.target):null;}
function updateUI(){
  const button=document.getElementById('contact-play');if(button)button.textContent=state.running?'Пауза':'Воспроизвести путь';
  const readout=document.getElementById('contact-readout');if(readout)readout.textContent=state.ready?`${state.actor==='emma'?'Emma':'Ethan'} · ${state.speed.toFixed(2)} м/с · ${state.time.toFixed(2)} с`:'Подготовка одинаковых моделей и клипов…';
}
function installUI(){
  const panel=document.createElement('section');panel.className='controls contact-controls';
  panel.innerHTML='<div class="transport-row"><select id="contact-actor" aria-label="Актёр"><option value="emma">Emma</option><option value="ethan">Ethan</option></select><button id="contact-play" class="primary">Воспроизвести путь</button><button id="contact-reset">В начало</button><span id="contact-readout" class="small-label"></span></div>';
  document.querySelector('.workspace').before(panel);
  document.getElementById('contact-play').onclick=()=>state.running?pause():play();
  document.getElementById('contact-reset').onclick=()=>reset();
  document.getElementById('contact-actor').onchange=(event)=>setup(event.target.value).catch(fail);
  document.querySelectorAll('[data-view]').forEach((button)=>button.addEventListener('click',()=>setView(button.dataset.view)));
  document.querySelector('h1').textContent='Контактный опыт A / B / C';
  document.querySelector('.lede').textContent='Одинаковая текущая модель, один Walk и одна скорость: A — исходное движение; B — готовый FootIK; C — только общий подъём при проникновении, до 20 мм. C сохраняет углы суставов и движение XZ. Перемещение корня вынесено в непрерывный путь.';
  document.querySelector('.footer').textContent='Отдельный эксперимент. Геометрия текущих моделей сохранена. Фаза опоры — эвристика из исходного движения; измерения пятки и носка используют фиксированные скиненные вершины. Runtime v42 остаётся отдельным замороженным эталоном.';
  updateUI();
}
function fail(error){state.errors.push(String(error));state.ready=false;console.error('[contact-bench]',error);updateUI();}

window.contactBench={get isReady(){return state.ready;},get errors(){return state.errors;},setup,reset,step,run,frame,seamCheck,snapshot,summary,play,pause,setView,
  get frames(){return state.frames;}};
installUI();
(async()=>{
  const deadline=performance.now()+90000;
  while(!window.motionLab?.isReady?.()){if(performance.now()>deadline)throw new Error('motionLab initialization timeout');await new Promise((resolve)=>setTimeout(resolve,30));}
  state.lab=window.motionLab;
  await state.lab.whenReady();
  if(typeof state.lab.advanceFixedStep!=='function')throw new Error('motionLab.advanceFixedStep is required.');
  await setup(new URLSearchParams(location.search).get('actor')||'emma');
})().catch(fail);
