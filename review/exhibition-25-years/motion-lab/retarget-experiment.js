import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { AnimationRetargeting, applyTPose } from './vendor/upf/retargeting.js';

// UPF GTI, pinned 82f1b8218813547224dd96df1638c950d241824d.
// The exhibition mesh and its skin remain unchanged. This adapter makes the
// two source UpLeg parents match the target on a temporary source clone.
const normal = (name) => name.toLowerCase().replace(/^mixamorig:?/, '').replace(/[^a-z0-9]/g, '');
const firstSkeleton = (root) => {
  let skeleton;
  root.traverse((o) => { if (!skeleton && o.isSkinnedMesh) skeleton = o.skeleton; });
  if (!skeleton) throw new Error('No skinned skeleton found');
  return skeleton;
};
const pose = (bones) => bones.map((b) => ({ p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() }));
const restore = (bones, saved) => bones.forEach((b, i) => {
  b.position.copy(saved[i].p); b.quaternion.copy(saved[i].q); b.scale.copy(saved[i].s);
});

function calibrateCanonicalPose(skeleton) {
  const names = new Map(skeleton.bones.map((bone) => [normal(bone.name), bone.name]));
  const roles = {
    Hips: 'hips', BelowStomach: 'spine', Stomach: 'spine1', ShouldersUnion: 'spine2', Neck: 'neck', Head: 'head',
    LShoulder: 'leftshoulder', LArm: 'leftarm', LElbow: 'leftforearm', LWrist: 'lefthand',
    RShoulder: 'rightshoulder', RArm: 'rightarm', RElbow: 'rightforearm', RWrist: 'righthand',
    LUpLeg: 'leftupleg', LLeg: 'leftleg', LFoot: 'leftfoot', RUpLeg: 'rightupleg', RLeg: 'rightleg', RFoot: 'rightfoot',
  };
  const map = Object.fromEntries(Object.entries(roles).map(([role, name]) => {
    if (!names.has(name)) throw new Error(`Missing canonical-pose bone: ${name}`);
    return [role, names.get(name)];
  }));
  const offsets = skeleton.bones.map((bone) => bone.position.clone());
  // CURRENT alone retains the anatomical difference between the two rest
  // stances. A shared calibration pose is required by UPF's retarget formula.
  // Only temporary skeletons are changed; mesh, IBM and target offsets stay put.
  applyTPose(skeleton, map);
  skeleton.bones[0].updateWorldMatrix(true, true);
  const maxOffsetDeltaM = Math.max(...skeleton.bones.map((bone, i) => bone.position.distanceTo(offsets[i])));
  if (maxOffsetDeltaM > 1e-8) throw new Error('Canonical-pose calibration changed a target bone offset');
  return { method: 'UPF applyTPose with explicit anatomical map', maxOffsetDeltaM };
}

function prepareSource(sourceRoot, targetRoot, clips) {
  const animatedRoot = cloneSkinned(sourceRoot);
  const virtualRoot = cloneSkinned(sourceRoot);
  animatedRoot.updateMatrixWorld(true); virtualRoot.updateMatrixWorld(true);
  const original = firstSkeleton(animatedRoot);
  const virtual = firstSkeleton(virtualRoot);
  const target = firstSkeleton(targetRoot);
  if (normal(original.bones[0].name) !== 'hips' || normal(target.bones[0].name) !== 'hips') {
    throw new Error('UPF expects Hips as the first skeleton joint; this asset does not satisfy it');
  }
  const sourceByName = new Map(original.bones.map((b) => [normal(b.name), b]));
  const virtualByName = new Map(virtual.bones.map((b) => [normal(b.name), b]));
  const targetByName = new Map(target.bones.map((b) => [normal(b.name), b]));
  const mapping = {};
  const changed = [];
  for (const bone of virtual.bones) {
    const targetBone = targetByName.get(normal(bone.name));
    if (!targetBone) throw new Error(`Missing target bone: ${bone.name}`);
    mapping[bone.name] = targetBone.name;
    if (!targetBone.parent?.isBone) continue;
    const wantedParent = virtualByName.get(normal(targetBone.parent.name));
    if (!wantedParent) throw new Error(`Missing mapped parent: ${targetBone.parent.name}`);
    if (bone.parent !== wantedParent) {
      // Reparent preserving the rest world transform, before any animation.
      const oldParent = bone.parent.name;
      wantedParent.attach(bone);
      changed.push({ name: bone.name, from: oldParent, to: wantedParent.name });
    }
  }
  virtualRoot.updateMatrixWorld(true);
  const virtualSkeleton = new THREE.Skeleton(virtual.bones);
  const originalRest = pose(original.bones);
  const mixer = new THREE.AnimationMixer(animatedRoot);
  let largestReparentPositionError = 0;
  let largestReparentAngleError = 0;
  const newClips = clips.map((clip) => {
    if (!changed.length) return clip.clone();
    restore(original.bones, originalRest);
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.reset().play();
    // Dense sampling plus every authored key time keeps parent motion represented.
    const endTime = Math.fround(clip.duration);
    const timeSet = new Set([0, endTime]);
    for (const track of clip.tracks) for (const t of track.times) timeSet.add(Math.fround(t));
    for (let frame = 0; frame / 60 < clip.duration; frame++) timeSet.add(Math.fround(frame / 60));
    const times = [...timeSet].filter((t) => t <= endTime).sort((a, b) => a - b);
    if (times.some((t, i) => i > 0 && t <= times[i - 1])) throw new Error(`Non-increasing key times: ${clip.name}`);
    const channels = new Map(changed.map((b) => [b.name, { position: [], quaternion: [], scale: [] }]));
    const m = new THREE.Matrix4(); const p = new THREE.Vector3(); const q = new THREE.Quaternion(); const s = new THREE.Vector3();
    const reconstructed = new THREE.Matrix4();
    for (const t of times) {
      mixer.setTime(t); animatedRoot.updateMatrixWorld(true);
      for (const item of changed) {
        const bone = sourceByName.get(normal(item.name));
        const parent = sourceByName.get(normal(item.to));
        m.copy(parent.matrixWorld).invert().multiply(bone.matrixWorld).decompose(p, q, s);
        q.normalize();
        const values = channels.get(item.name);
        values.position.push(...p); values.quaternion.push(...q); values.scale.push(...s);
        reconstructed.compose(p, q, s).premultiply(parent.matrixWorld);
        const actualP = new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld);
        const rebuiltP = new THREE.Vector3().setFromMatrixPosition(reconstructed);
        largestReparentPositionError = Math.max(largestReparentPositionError, actualP.distanceTo(rebuiltP));
        const aq = new THREE.Quaternion(), rq = new THREE.Quaternion();
        bone.matrixWorld.decompose(p, aq, s); reconstructed.decompose(p, rq, s);
        largestReparentAngleError = Math.max(largestReparentAngleError, aq.normalize().angleTo(rq.normalize()));
      }
    }
    mixer.stopAllAction();
    const changedNames = new Set(changed.map((x) => x.name));
    const tracks = clip.tracks.filter((track) => !changedNames.has(track.name.slice(0, track.name.lastIndexOf('.')))).map((t) => t.clone());
    for (const [name, values] of channels) {
      tracks.push(new THREE.VectorKeyframeTrack(`${name}.position`, times, values.position));
      tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, values.quaternion));
      tracks.push(new THREE.VectorKeyframeTrack(`${name}.scale`, times, values.scale));
    }
    return new THREE.AnimationClip(clip.name, clip.duration, tracks, clip.blendMode);
  });
  mixer.uncacheRoot(animatedRoot);
  return { skeleton: virtualSkeleton, clips: newClips, mapping, changed,
    reconstruction: { maxPositionM: largestReparentPositionError, maxAngleRad: largestReparentAngleError } };
}

export function retargetNativeClips({ sourceRoot, targetRoot, sourceClips, prefix = 'UPF · ' }) {
  // Caller supplies unanimated default/rest poses. Temporary source and target
  // skeletons are then put in a shared anatomical reference pose. CURRENT avoids
  // treating the compressed mesh's coordinate transform as skeleton scale.
  const targetClone = cloneSkinned(targetRoot);
  targetClone.updateMatrixWorld(true);
  const source = prepareSource(sourceRoot, targetClone, sourceClips);
  const targetSkeleton = firstSkeleton(targetClone);
  const calibration = {
    source: calibrateCanonicalPose(source.skeleton),
    target: calibrateCanonicalPose(targetSkeleton),
  };
  const solver = new AnimationRetargeting(source.skeleton, targetSkeleton, {
    srcPoseMode: AnimationRetargeting.BindPoseModes.CURRENT,
    trgPoseMode: AnimationRetargeting.BindPoseModes.CURRENT,
    srcEmbedWorldTransforms: false, trgEmbedWorldTransforms: false,
    boneNameMap: source.mapping,
  });
  let maxQuaternionNormDeviation = 0;
  let normalizedQuaternionCount = 0;
  const clips = source.clips.map((clip) => {
    const result = solver.retargetAnimation(clip);
    result.name = `${prefix}${clip.name}`;
    if (!result.tracks.length || result.tracks.some((t) => [...t.values].some((v) => !Number.isFinite(v)))) {
      throw new Error(`UPF returned invalid tracks for ${clip.name}`);
    }
    for (const track of result.tracks) {
      if (!track.name.endsWith('.quaternion')) continue;
      for (let i = 0; i < track.values.length; i += 4) {
        const norm = Math.hypot(...track.values.subarray(i, i + 4));
        if (!Number.isFinite(norm) || norm < 1e-8) throw new Error(`Invalid quaternion in ${result.name}: ${track.name}`);
        maxQuaternionNormDeviation = Math.max(maxQuaternionNormDeviation, Math.abs(norm - 1));
        for (let component = 0; component < 4; component++) track.values[i + component] /= norm;
        normalizedQuaternionCount++;
      }
    }
    return result;
  });
  return {
    clips,
    report: {
      library: 'upf-gti/retargeting-threejs', revision: '82f1b8218813547224dd96df1638c950d241824d',
      mappedBones: Object.keys(source.mapping).length, reparented: source.changed,
      reconstruction: source.reconstruction, sourceClips: sourceClips.map((c) => c.name),
      quaternionNormalization: { maxInputNormDeviation: maxQuaternionNormDeviation, count: normalizedQuaternionCount },
      targetClips: clips.map((c) => ({ name: c.name, duration: c.duration, tracks: c.tracks.length })),
      poseModes: 'CURRENT after shared canonical T-pose calibration on temporary skeletons',
      calibration,
      targetGeometryModified: false,
      limitations: ['UPF retains target bone offsets; non-root translation animation is not transferred.',
        'Reparented source motion is baked at 60 Hz plus authored key times.',
        'Foot contacts require a separate playback/IK experiment.'],
    },
  };
}

export async function installRetargetedClips(lab, pairs = [['emma-source', 'emma-current'], ['ethan-source', 'ethan-current']]) {
  await lab.load([...new Set(pairs.flat())]);
  lab.pause(); lab.setRestPose(pairs.flat());
  const reports = [];
  for (const [sourceId, targetId] of pairs) {
    const source = lab.getRuntime(sourceId), target = lab.getRuntime(targetId);
    const result = retargetNativeClips({ sourceRoot: source.root || source.rig, targetRoot: target.root || target.rig, sourceClips: source.clips });
    lab.addClips(targetId, result.clips);
    reports.push({ sourceId, targetId, ...result.report });
  }
  window.retargetReports = reports;
  return reports;
}
