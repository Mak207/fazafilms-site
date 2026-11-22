#!/usr/bin/env node
/**
 * Offline Rocketbox turn conversion; no GPU, network, model mesh or IBM writes.
 * Node >=20.6; dependencies are the existing pinned Three r169 / UPF vendor.
 *
 * node tools/retarget_rocketbox_turns.mjs --actor emma \
 *   --world-samples ./world-samples --target ./walking-woman.glb \
 *   --out ./emma-native-turns.glb
 *
 * Optional: --report <json>, --clips left90 (default: all),
 * --three <three.module.js>, --upf <retargeting.js>.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  if (!process.argv[i].startsWith('--') || process.argv[i + 1] === undefined) throw new Error('CLI arguments must be --name value pairs');
  args[process.argv[i].slice(2)] = process.argv[i + 1];
}
const actor = args.actor;
if (!['emma', 'ethan'].includes(actor) || !args['world-samples'] || !args.target || !args.out)
  throw new Error('Required: --actor emma|ethan --world-samples <directory> --target <current.glb> --out <motions.glb>');
if (args.clips && !['all', 'left90'].includes(args.clips)) throw new Error('--clips must be all or left90');
const samplesPath = path.resolve(args['world-samples']), targetPath = path.resolve(args.target), outputPath = path.resolve(args.out);
const reportPath = path.resolve(args.report || outputPath.replace(/\.glb$/i, '') + '.report.json');
if (outputPath === targetPath || reportPath === targetPath || outputPath === reportPath) throw new Error('Output paths must not replace the input model or one another');
const threePath = args.three ? path.resolve(args.three) : fileURLToPath(new URL('../vendor/three/build/three.module.js', import.meta.url));
const upfPath = args.upf ? path.resolve(args.upf) : fileURLToPath(new URL('../vendor/upf/retargeting.js', import.meta.url));
const threeURL = pathToFileURL(threePath).href, upfURL = pathToFileURL(upfPath).href;
// Resolve the vendor's bare "three" import with Node's public ESM loader API.
// Force only these known browser modules to ESM; no source is copied or patched.
const loader = `import { readFile } from 'node:fs/promises';
const three = ${JSON.stringify(threeURL)}, upf = ${JSON.stringify(upfURL)};
export async function resolve(specifier, context, next) {
  if (specifier === 'three') return { url: three, shortCircuit: true };
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url === three || url === upf) return { format: 'module', source: await readFile(new URL(url), 'utf8'), shortCircuit: true };
  return next(url, context);
}`;
register('data:text/javascript;base64,' + Buffer.from(loader).toString('base64'), import.meta.url);
const THREE = await import(threeURL);
const { AnimationRetargeting, applyTPose } = await import(upfURL);
if (THREE.REVISION !== '169') throw new Error(`Expected pinned Three r169, got ${THREE.REVISION}`);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

const normal = name => name.toLowerCase().replace(/^mixamorig:?/, '').replace(/[^a-z0-9]/g, '');

function openGLB(filename) {
  const fd = fs.openSync(filename, 'r'), header = Buffer.alloc(20);
  fs.readSync(fd, header, 0, 20, 0);
  if (header.readUInt32LE(0) !== 0x46546c67) throw new Error(`Not GLB: ${filename}`);
  const length = header.readUInt32LE(12), jsonBytes = Buffer.alloc(length);
  fs.readSync(fd, jsonBytes, 0, length, 20);
  const json = JSON.parse(jsonBytes.toString('utf8'));
  return { json, close: () => fs.closeSync(fd), filename };
}

function skeletonFromJSON(json) {
  const joints = json.skins[0].joints, jointSet = new Set(joints);
  const objects = json.nodes.map((node, index) => {
    const object = jointSet.has(index) ? new THREE.Bone() : new THREE.Object3D();
    object.name = THREE.PropertyBinding.sanitizeNodeName(node.name || `node_${index}`);
    if (node.matrix) new THREE.Matrix4().fromArray(node.matrix).decompose(object.position, object.quaternion, object.scale);
    else {
      if (node.translation) object.position.fromArray(node.translation);
      if (node.rotation) object.quaternion.fromArray(node.rotation);
      if (node.scale) object.scale.fromArray(node.scale);
    }
    return object;
  });
  json.nodes.forEach((node, index) => (node.children || []).forEach(child => objects[index].add(objects[child])));
  const root = new THREE.Group();
  (json.scenes[json.scene || 0].nodes || []).forEach(index => root.add(objects[index]));
  root.updateMatrixWorld(true);
  const bones = joints.map(index => objects[index]);
  const skeleton = new THREE.Skeleton(bones);
  const byName = new Map(bones.map(bone => [normal(bone.name), bone]));
  const rest = bones.map(bone => ({ bone, p: bone.position.clone(), q: bone.quaternion.clone(), s: bone.scale.clone() }));
  return { root, skeleton, bones, byName, rest, objects };
}

function restore(rig) {
  for (const { bone, p, q, s } of rig.rest) { bone.position.copy(p); bone.quaternion.copy(q); bone.scale.copy(s); }
  rig.root.updateMatrixWorld(true);
}

function evaluate(rig, clip, time) {
  restore(rig);
  for (const track of clip.tracks) {
    const at = track.name.lastIndexOf('.'), bone = rig.byName.get(normal(track.name.slice(0, at)));
    if (!bone) throw new Error(`Unbound ${track.name}`);
    bone[track.name.slice(at + 1)].fromArray(track.createInterpolant().evaluate(time));
  }
  rig.root.updateMatrixWorld(true);
}

function normalizedClips(solver, clips) {
  return clips.map(clip => {
    const result = solver.retargetAnimation(clip);
    result.name = `UPF · ${clip.name}`;
    for (const track of result.tracks) if (track.name.endsWith('.quaternion')) for (let i = 0; i < track.values.length; i += 4) {
      const length = Math.hypot(...track.values.subarray(i, i + 4));
      if (!(length > .001)) throw new Error('Invalid output quaternion');
      for (let j = 0; j < 4; j++) track.values[i + j] /= length;
    }
    return result;
  });
}

function tposeMap(rig) {
  const names = { Hips: 'hips', BelowStomach: 'spine', Stomach: 'spine1', ShouldersUnion: 'spine2', Neck: 'neck', Head: 'head',
    LShoulder: 'leftshoulder', LArm: 'leftarm', LElbow: 'leftforearm', LWrist: 'lefthand',
    RShoulder: 'rightshoulder', RArm: 'rightarm', RElbow: 'rightforearm', RWrist: 'righthand',
    LUpLeg: 'leftupleg', LLeg: 'leftleg', LFoot: 'leftfoot', RUpLeg: 'rightupleg', RLeg: 'rightleg', RFoot: 'rightfoot' };
  return Object.fromEntries(Object.entries(names).map(([key, value]) => [key, rig.byName.get(value).name]));
}

function anatomical(rig) {
  const pos = name => rig.byName.get(name).getWorldPosition(new THREE.Vector3());
  const hips = pos('hips'), up = pos('spine2').sub(hips).normalize();
  const lateral = pos('leftarm').sub(pos('rightarm')).normalize();
  const forward = new THREE.Vector3().crossVectors(lateral, up).normalize();
  lateral.crossVectors(up, forward).normalize();
  const inFrame = vector => [vector.dot(lateral), vector.dot(up), vector.dot(forward)];
  const directions = {}, knees = {}, wrists = {};
  for (const side of ['left', 'right']) {
    for (const [part, a, b] of [['upper', 'arm', 'forearm'], ['fore', 'forearm', 'hand'], ['thigh', 'upleg', 'leg'], ['shin', 'leg', 'foot'], ['foot', 'foot', 'toebase']]) {
      directions[`${side}-${part}`] = inFrame(pos(side + b).sub(pos(side + a)).normalize());
    }
    knees[side] = new THREE.Vector3(...directions[`${side}-thigh`]).angleTo(new THREE.Vector3(...directions[`${side}-shin`])) * 180 / Math.PI;
    wrists[side] = inFrame(pos(side + 'hand').sub(hips));
  }
  return { directions, knees, wrists };
}

function compare(a, b) {
  return { directionDegrees: Object.fromEntries(Object.keys(a.directions).map(key => [key, new THREE.Vector3(...a.directions[key]).angleTo(new THREE.Vector3(...b.directions[key])) * 180 / Math.PI])),
    kneeDeltaDegrees: Object.fromEntries(['left', 'right'].map(side => [side, b.knees[side] - a.knees[side]])),
    wristForwardDeltaM: Object.fromEntries(['left', 'right'].map(side => [side, b.wrists[side][2] - a.wrists[side][2]])) };
}

function writeBoneOnlyGLB(filename, rig, clips) {
  const indexByName = new Map(rig.bones.map((bone, index) => [bone.name, index]));
  const nodes = rig.bones.map(bone => ({ name: bone.name, translation: bone.position.toArray(), rotation: bone.quaternion.toArray(), scale: bone.scale.toArray(),
    children: bone.children.filter(child => indexByName.has(child.name)).map(child => indexByName.get(child.name)) }));
  const chunks = [], views = [], accessors = []; let bytes = 0;
  function add(values, size, type, bounds = false) {
    const data = Buffer.from(Float32Array.from(values).buffer), view = views.length;
    views.push({ buffer: 0, byteOffset: bytes, byteLength: data.length }); chunks.push(data); bytes += data.length;
    const accessor = { bufferView: view, componentType: 5126, count: values.length / size, type };
    if (bounds) { accessor.min = [Math.min(...values)]; accessor.max = [Math.max(...values)]; }
    accessors.push(accessor); return accessors.length - 1;
  }
  const animations = clips.map(clip => {
    const samplers = [], channels = [];
    for (const track of clip.tracks) {
      const at = track.name.lastIndexOf('.'), name = track.name.slice(0, at), property = track.name.slice(at + 1);
      if (!indexByName.has(name)) throw new Error(`Export target missing ${name}`);
      const input = add(track.times, 1, 'SCALAR', true), output = add(track.values, property === 'quaternion' ? 4 : 3, property === 'quaternion' ? 'VEC4' : 'VEC3');
      samplers.push({ input, output, interpolation: track.getInterpolation() === THREE.InterpolateDiscrete ? 'STEP' : 'LINEAR' });
      channels.push({ sampler: samplers.length - 1, target: { node: indexByName.get(name), path: { position: 'translation', quaternion: 'rotation', scale: 'scale' }[property] } });
    }
    return { name: clip.name, samplers, channels };
  });
  const document = { asset: { version: '2.0', generator: 'UPF canonical-pose CPU retarget, Three r169' }, scene: 0,
    scenes: [{ nodes: rig.bones.map((bone, i) => !bone.parent?.isBone ? i : -1).filter(i => i >= 0) }], nodes,
    buffers: [{ byteLength: bytes }], bufferViews: views, accessors, animations };
  let json = Buffer.from(JSON.stringify(document)); json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]);
  const bin = Buffer.concat(chunks), header = Buffer.alloc(12), jhead = Buffer.alloc(8), bhead = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
  jhead.writeUInt32LE(json.length, 0); jhead.writeUInt32LE(0x4e4f534a, 4); bhead.writeUInt32LE(bin.length, 0); bhead.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(filename, Buffer.concat([header, jhead, json, bhead, bin]));
}

// The FBX includes animated external Armature motion. The CPU sample export
// includes it in every world matrix; do not discard it or infer it from names.
function worldSampleRig(document, target) {
  const definitions = document.bones;
  const indexByName = new Map(definitions.map((bone, i) => [normal(bone.name), i]));
  const bones = definitions.map(bone => { const node = new THREE.Bone(); node.name = bone.threeBindingName; return node; });
  const root = new THREE.Group(), parents = [];
  definitions.forEach((definition, i) => {
    let parent = target.byName.get(normal(definition.name))?.parent;
    while (parent?.isBone && !indexByName.has(normal(parent.name))) parent = parent.parent;
    const parentIndex = parent?.isBone ? indexByName.get(normal(parent.name)) : -1;
    parents.push(parentIndex);
    (parentIndex >= 0 ? bones[parentIndex] : root).add(bones[i]);
  });
  const m = new THREE.Matrix4(), pm = new THREE.Matrix4();
  function applyWorld(matrices) {
    matrices.forEach((matrix, i) => {
      m.fromArray(matrix);
      if (parents[i] >= 0) m.premultiply(pm.fromArray(matrices[parents[i]]).invert());
      m.decompose(bones[i].position, bones[i].quaternion, bones[i].scale);
      bones[i].quaternion.normalize(); bones[i].scale.set(1, 1, 1);
    });
    root.updateMatrixWorld(true);
  }
  applyWorld(definitions.map(bone => bone.restWorldRigid));
  const rest = bones.map(bone => ({ bone, p: bone.position.clone(), q: bone.quaternion.clone(), s: bone.scale.clone() }));
  const rig = { root, bones, rest, byName: new Map(bones.map(bone => [normal(bone.name), bone])), skeleton: new THREE.Skeleton(bones) };
  const tracks = [], values = bones.map(() => ({ position: [], quaternion: [] }));
  let reconstructionMaxPosition = 0, reconstructionMaxAngle = 0, localOffsetVariation = 0;
  document.samplesRigid.forEach(matrices => {
    applyWorld(matrices);
    bones.forEach((bone, i) => {
      values[i].position.push(...bone.position); values[i].quaternion.push(...bone.quaternion);
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      m.fromArray(matrices[i]).decompose(p, q, s); q.normalize();
      reconstructionMaxPosition = Math.max(reconstructionMaxPosition, p.distanceTo(bone.getWorldPosition(new THREE.Vector3())));
      reconstructionMaxAngle = Math.max(reconstructionMaxAngle, q.angleTo(bone.getWorldQuaternion(new THREE.Quaternion()).normalize()));
      if (i > 0) localOffsetVariation = Math.max(localOffsetVariation, bone.position.distanceTo(rest[i].p));
    });
  });
  for (let i = 0; i < bones.length; i++) {
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bones[i].name}.quaternion`, document.times, values[i].quaternion));
    // Preserve all translations in the reference rig; UPF intentionally emits
    // only Hips translation, retaining the exhibition's original limb offsets.
    tracks.push(new THREE.VectorKeyframeTrack(`${bones[i].name}.position`, document.times, values[i].position));
  }
  restore(rig);
  const clip = new THREE.AnimationClip('temporary-turn', document.duration, tracks);
  return { rig, clip, applyWorld, reconstructionMaxPosition, reconstructionMaxAngle, localOffsetVariation };
}

function rootMotion(rig) {
  const hips = rig.byName.get('hips');
  return { position: hips.getWorldPosition(new THREE.Vector3()), quaternion: hips.getWorldQuaternion(new THREE.Quaternion()).normalize() };
}
function relativeYaw(q, first) {
  const relative = q.clone().multiply(first.clone().invert()).normalize();
  return 2 * Math.atan2(relative.y, relative.w);
}

function worldDirections(rig) {
  const result = {}, p = name => rig.byName.get(name).getWorldPosition(new THREE.Vector3());
  for (const side of ['left','right']) for (const [part,a,b] of [['upper','arm','forearm'],['fore','forearm','hand'],['thigh','upleg','leg'],['shin','leg','foot'],['foot','foot','toebase']])
    result[side+'-'+part] = p(side+b).sub(p(side+a)).normalize();
  return result;
}

// FBX Biped has ToeBase but no extra ToeEnd. applyTPose selects a grandchild
// when present, so pin the semantic body segments explicitly on both temporary
// calibration skeletons. This changes reference orientations only; no offsets
// or animated target poses are corrected after retargeting.
function semanticCanonicalPose(rig) {
  applyTPose(rig.skeleton, tposeMap(rig));
  const v = new THREE.Vector3(), childPosition = new THREE.Vector3(), parentQ = new THREE.Quaternion();
  function align(name, childName, axis) {
    const bone = rig.byName.get(name), child = rig.byName.get(childName);
    if (!bone || !child) return;
    rig.root.updateMatrixWorld(true);
    child.getWorldPosition(childPosition); bone.getWorldPosition(v); v.subVectors(childPosition, v).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(v, axis).multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
    if (bone.parent) q.premultiply(bone.parent.getWorldQuaternion(parentQ).invert());
    bone.quaternion.copy(q).normalize();
  }
  const up = new THREE.Vector3(0, 1, 0), down = up.clone().negate(), forward = new THREE.Vector3(0, 0, 1);
  for (const [parent, child] of [['hips','spine'],['spine','spine1'],['spine1','spine2'],['spine2','neck'],['neck','head']]) align(parent,child,up);
  for (const side of ['left', 'right']) {
    const lateral = new THREE.Vector3(side === 'left' ? 1 : -1, 0, 0);
    align(side+'arm', side+'forearm', lateral); align(side+'forearm', side+'hand', lateral);
    align(side+'upleg', side+'leg', down); align(side+'leg', side+'foot', down);
    align(side+'foot', side+'toebase', forward);
  }
  rig.root.updateMatrixWorld(true);
}

const targetGLB = openGLB(targetPath);
const targetJSON = targetGLB.json; targetGLB.close();
const targetOriginal = skeletonFromJSON(targetJSON);
const target = skeletonFromJSON(targetJSON);
const specs = args.clips === 'left90' ? [['left', 90]] : [['left', 90], ['right', 90], ['left', 180], ['right', 180]];
const outputClips = [], reports = [];
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
for (const [direction, angle] of specs) {
  const filename = path.join(samplesPath, `${actor === 'emma' ? 'f' : 'm'}_turn_${direction}_${angle}.json`);
  const sourceBytes = fs.readFileSync(filename);
  const document = JSON.parse(sourceBytes.toString('utf8'));
  if (document.format !== 'rocketbox-world-samples-v1' || document.coordinates.up !== '+Y' || document.coordinates.units !== 'metres') throw new Error('Expected exported Rocketbox Y-up metre world samples');
  const prepared = worldSampleRig(document, targetOriginal), source = prepared.rig;
  const name = `Turn${direction === 'left' ? 'Left' : 'Right'}${angle}`; prepared.clip.name = name;
  const originalSamples = [];
  for (let i = 0; i <= 8; i++) {
    const time = document.duration * i / 8;
    evaluate(source, prepared.clip, time);
    originalSamples.push({ time, pose: anatomical(source), root: rootMotion(source), world: worldDirections(source) });
  }
  restore(source); restore(target);
  semanticCanonicalPose(source); semanticCanonicalPose(target);
  source.root.updateMatrixWorld(true); target.root.updateMatrixWorld(true);
  const sourceRootY = source.byName.get('hips').getWorldPosition(new THREE.Vector3()).y;
  const targetRootY = target.byName.get('hips').getWorldPosition(new THREE.Vector3()).y;
  const ratio = targetRootY / sourceRootY;
  const mapping = Object.fromEntries(source.bones.map(bone => [bone.name, target.byName.get(normal(bone.name)).name]));
  const solver = new AnimationRetargeting(source.skeleton, target.skeleton, {
    srcPoseMode: AnimationRetargeting.BindPoseModes.CURRENT, trgPoseMode: AnimationRetargeting.BindPoseModes.CURRENT,
    srcEmbedWorldTransforms: false, trgEmbedWorldTransforms: false, boneNameMap: mapping,
  });
  const clip = normalizedClips(solver, [prepared.clip])[0]; outputClips.push(clip);
  const rows = [];
  let firstTarget;
  for (const original of originalSamples) {
    evaluate(target, clip, original.time);
    const current = rootMotion(target); firstTarget ||= current;
    const a = original.root, a0 = originalSamples[0].root;
    let yawDifference = relativeYaw(current.quaternion, firstTarget.quaternion) - relativeYaw(a.quaternion, a0.quaternion);
    yawDifference = Math.atan2(Math.sin(yawDifference), Math.cos(yawDifference));
    const deltaSource = a.position.clone().sub(a0.position).multiplyScalar(ratio), deltaTarget = current.position.clone().sub(firstTarget.position);
    const world = worldDirections(target);
    rows.push({ time: original.time, difference: compare(original.pose, anatomical(target)),
      worldDirectionDegrees: Object.fromEntries(Object.keys(world).map(key => [key, world[key].angleTo(original.world[key]) * 180 / Math.PI])),
      rootYawDeltaDegrees: yawDifference * 180 / Math.PI,
      rootPositionScaledDeltaError: deltaSource.distanceTo(deltaTarget),
      sourceRootPosition: a.position.toArray(), targetRootPosition: current.position.toArray(),
      sourceRelativeYaw: relativeYaw(a.quaternion, a0.quaternion), targetRelativeYaw: relativeYaw(current.quaternion, firstTarget.quaternion) });
  }
  const report = { actor, name, source: path.basename(filename), sourceJSONSHA256: sha256(sourceBytes), sourceRevision: document.source_revision, sourceFBXSHA256: document.sha256_fbx,
    clipDuration: clip.duration, trackCount: clip.tracks.length, sourceRootY, targetRootY, translationRatio: ratio,
    reconstructionMaxPosition: prepared.reconstructionMaxPosition, reconstructionMaxAngle: prepared.reconstructionMaxAngle,
    sourceNonRootOffsetVariationM: prepared.localOffsetVariation, rows,
    maxima: { directions: Object.fromEntries(Object.keys(rows[0].difference.directionDegrees).map(key => [key, Math.max(...rows.map(row => row.difference.directionDegrees[key]))])),
      worldDirections: Object.fromEntries(Object.keys(rows[0].worldDirectionDegrees).map(key => [key, Math.max(...rows.map(row => row.worldDirectionDegrees[key]))])),
      kneeDelta: Math.max(...rows.flatMap(row => Object.values(row.difference.kneeDeltaDegrees).map(Math.abs))),
      rootYawDeltaDegrees: Math.max(...rows.map(row => Math.abs(row.rootYawDeltaDegrees))),
      rootPositionScaledDeltaError: Math.max(...rows.map(row => row.rootPositionScaledDeltaError)) } };
  reports.push(report); console.log(JSON.stringify({ actor, name, maxima: report.maxima, reconstructionMaxPosition: report.reconstructionMaxPosition, sourceNonRootOffsetVariationM: report.sourceNonRootOffsetVariationM, end: rows.at(-1) }));
}
restore(targetOriginal);
writeBoneOnlyGLB(outputPath, targetOriginal, outputClips);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify({ actor, method: 'FBX world samples including Armature -> common hierarchy -> UPF applyTPose plus explicit common semantic segments on temporary source/target -> CURRENT', targetSHA256: sha256(fs.readFileSync(targetPath)), dependencies: { threeRevision: THREE.REVISION, threeSHA256: sha256(fs.readFileSync(threePath)), upfSHA256: sha256(fs.readFileSync(upfPath)) }, outputSHA256: sha256(fs.readFileSync(outputPath)), reports }, null, 2));
console.log(JSON.stringify({ output: outputPath, report: reportPath, bytes: fs.statSync(outputPath).size, clips: outputClips.map(clip => clip.name) }));
