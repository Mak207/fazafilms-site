import * as THREE from "three";

// Native clips were retargeted offline to the unchanged exhibition skeleton.
// This module owns the mixer. No leg solver or viewer runtime is involved.
const normal = name => name.replace(/^mixamorig:?/i, "").toLowerCase();
const wrap = THREE.MathUtils.euclideanModulo;
const clamp = THREE.MathUtils.clamp;
const getters = ["getX", "getY", "getZ", "getW"];
const sample = (track, time) => Array.from(track.createInterpolant().evaluate(time));
const cubic = track => Boolean(track.createInterpolant?.isInterpolantFactoryMethodGLTFCubicSpline);

function rootTrack(clip, hips) {
  const tracks = clip.tracks.filter(track => {
    const parsed = THREE.PropertyBinding.parseTrackName(track.name);
    const target = parsed.objectName === "bones" ? parsed.objectIndex : parsed.nodeName;
    return parsed.propertyName === "position" && typeof target === "string" && normal(target) === normal(hips.name);
  });
  if (tracks.length !== 1) throw new Error(`${clip.name}: expected one Hips position track, got ${tracks.length}`);
  return tracks[0];
}

function normalizeRootXZ(source, hips, name, cyclic = true) {
  const clip = source.clone();
  clip.name = name;
  const track = rootTrack(clip, hips);
  const start = sample(track, 0), end = sample(track, source.duration);
  if (start.length !== 3 || end.length !== 3 || !(source.duration > 0)) throw new Error(`Invalid root track: ${source.name}`);
  const spline = cubic(track), width = track.getValueSize(), size = spline ? width / 3 : width;
  for (let key = 0; key < track.times.length; key++) {
    const valueOffset = key * width + (spline ? size : 0);
    for (const axis of [0, 2]) {
      const drift = cyclic ? (end[axis] - start[axis]) / source.duration : 0;
      track.values[valueOffset + axis] -= start[axis] + drift * track.times[key];
      if (spline) {
        track.values[key * width + axis] -= drift;
        track.values[key * width + 2 * size + axis] -= drift;
      }
    }
  }
  return { clip, start, end };
}

function prepareTurn(source, hips) {
  const clip = source.clone(); clip.name = source.name.replace(/^UPF · /, "Native · ") + " extracted root";
  const position = rootTrack(clip, hips), sourcePosition = rootTrack(source, hips);
  const rotation = clip.tracks.find(track => {
    const parsed = THREE.PropertyBinding.parseTrackName(track.name);
    return parsed.propertyName === "quaternion" && normal(parsed.nodeName || "") === normal(hips.name);
  });
  if (!rotation || cubic(rotation) || cubic(position)) throw new Error(`${source.name}: expected baked linear root tracks`);
  const q = new THREE.Quaternion(), q0 = new THREE.Quaternion().fromArray(rotation.createInterpolant().evaluate(0)).normalize();
  const inverseStart = q0.clone().invert(), yawQ = new THREE.Quaternion(), axis = new THREE.Vector3(0, 1, 0);
  const yawValues = [], start = sample(sourcePosition, 0);
  let previous = 0;
  for (let i = 0; i < rotation.times.length; i++) {
    q.fromArray(rotation.values, i * 4).normalize();
    const relative = q.clone().multiply(inverseStart);
    const raw = 2 * Math.atan2(relative.y, relative.w);
    const yaw = previous + Math.atan2(Math.sin(raw - previous), Math.cos(raw - previous));
    previous = yaw; yawValues.push(yaw);
    q.premultiply(yawQ.setFromAxisAngle(axis, -yaw)).normalize().toArray(rotation.values, i * 4);
  }
  for (let i = 0; i < position.values.length; i += 3) { position.values[i] = 0; position.values[i + 2] = 0; }
  const yawTrack = new THREE.NumberKeyframeTrack("rootYaw", rotation.times, yawValues);
  const yawSample = yawTrack.createInterpolant(), positionSample = sourcePosition.createInterpolant();
  const at = time => {
    const t = clamp(time, 0, source.duration), p = positionSample.evaluate(t);
    return { x: p[0] - start[0], z: p[2] - start[2], yaw: yawSample.evaluate(t)[0] };
  };
  return { name: source.name.replace(/^(UPF|Native) · /, ""), clip, source, duration: source.duration,
    angle: at(source.duration).yaw, at, path: Array.from({ length: Math.ceil(source.duration * 60) + 1 }, (_, i) => at(Math.min(i / 60, source.duration))) };
}

function weightedShoeVertices(rig, bones) {
  const accepted = new Set();
  for (const name of ["LeftFoot", "RightFoot"]) bones[name]?.traverse(node => accepted.add(node));
  const rows = [];
  rig.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    const indices = mesh.geometry.getAttribute("skinIndex"), weights = mesh.geometry.getAttribute("skinWeight");
    if (!indices || !weights || indices.itemSize !== 4) return;
    const mask = mesh.skeleton.bones.map(bone => accepted.has(bone));
    const vertices = [];
    for (let vertex = 0; vertex < mesh.geometry.getAttribute("position").count; vertex++) {
      let influence = 0;
      for (let i = 0; i < 4; i++) if (mask[indices[getters[i]](vertex)]) influence += weights[getters[i]](vertex);
      if (influence >= .25) vertices.push(vertex);
    }
    if (vertices.length) rows.push({ mesh, vertices });
  });
  if (!rows.length) throw new Error("Current model has no weighted Foot/Toe geometry");
  return rows;
}

export function createNativeMotion(rig, animations, grounding, options = {}) {
  const bones = {};
  rig.traverse(object => {
    if (object.isBone) bones[object.name.replace(/^mixamorig:?/i, "")] = object;
    if (object.isSkinnedMesh) object.frustumCulled = false;
  });
  if (!bones.Hips || !bones.LeftFoot || !bones.RightFoot) throw new Error("Native runtime requires Hips and both feet");
  const find = name => animations.find(clip => clip.name === `UPF · ${name}` || clip.name === `Native · ${name}` || clip.name === name);
  const sourceWalk = find("Walk"), sourceIdle = find("Idle");
  if (!sourceWalk || !sourceIdle) throw new Error("Native animation bundle must contain Idle and Walk");
  rig.updateWorldMatrix(true, true);
  const walking = normalizeRootXZ(sourceWalk, bones.Hips, "Native · Walk in place");
  const standing = normalizeRootXZ(sourceIdle, bones.Hips, "Native · Idle in place");
  const displacement = new THREE.Vector3(walking.end[0] - walking.start[0], 0, walking.end[2] - walking.start[2]);
  displacement.applyMatrix3(new THREE.Matrix3().setFromMatrix4(bones.Hips.parent.matrixWorld));
  const stride = Math.hypot(displacement.x, displacement.z);
  if (stride < .4 || stride > 2.5 || Math.abs(displacement.y) > .0001) throw new Error(`Unexpected native stride ${stride}`);
  const forwardYaw = Math.atan2(displacement.x, displacement.z);
  const mixer = new THREE.AnimationMixer(rig);
  const makeAction = clip => {
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.enabled = true;
    action.paused = true;
    action.setEffectiveWeight(0).play();
    return action;
  };
  const actions = { walk: makeAction(walking.clip), idle: makeAction(standing.clip), gesture: null, turn: null };
  const gestureActions = new Map();
  const turns = new Map(["TurnLeft90", "TurnRight90", "TurnLeft180", "TurnRight180"].map(name => {
    const source = find(name);
    if (!source) throw new Error(`Native animation bundle must contain ${name}`);
    const turn = prepareTurn(source, bones.Hips); turn.action = makeAction(turn.clip); return [name, turn];
  }));
  let activeTurn = null;
  const shoes = weightedShoeVertices(rig, bones);
  const point = new THREE.Vector3();
  const floorY = options.floorY ?? 0, maxLift = options.maxLift ?? .035, maxDrop = options.maxDrop ?? .030;
  let lastPose = null;

  function updateSkinMatrices() {
    // updateWorldMatrix alone skips SkinnedMesh.updateMatrixWorld's attached
    // bindMatrixInverse refresh. A previous floor lift would then be counted
    // again as penetration. Refresh ancestors, then the overridden hierarchy.
    grounding.updateWorldMatrix(true, false);
    grounding.updateMatrixWorld(true);
    for (const { mesh } of shoes) mesh.skeleton.update();
  }

  function activateGesture(name) {
    if (!name) { actions.gesture = null; return null; }
    if (!gestureActions.has(name)) {
      const source = find(name);
      if (!source) return null;
      gestureActions.set(name, makeAction(normalizeRootXZ(source, bones.Hips, `Native · ${name}`, false).clip));
    }
    actions.gesture = gestureActions.get(name);
    return actions.gesture.getClip();
  }

  function activateTurn(name) {
    activeTurn = turns.get(name) || null;
    actions.turn = activeTurn?.action || null;
    return activeTurn;
  }

  function evaluate({ walkDistance = 0, walkWeight = 0, idleTime = 0, gestureTime = 0, gestureWeight = 0,
    turnTime = 0, turnWeight = 0, delta = 0 }) {
    const gesture = actions.gesture;
    const g = gesture ? clamp(gestureWeight, 0, 1) : 0;
    const t = activeTurn ? clamp(turnWeight, 0, 1) * (1 - g) : 0;
    const w = clamp(walkWeight, 0, 1) * (1 - g - t);
    for (const action of gestureActions.values()) action.setEffectiveWeight(action === gesture ? g : 0);
    for (const turn of turns.values()) turn.action.setEffectiveWeight(turn === activeTurn ? t : 0);
    actions.walk.setEffectiveWeight(w);
    actions.idle.setEffectiveWeight(1 - w - g - t);
    actions.walk.time = wrap(walkDistance / stride, 1) * walking.clip.duration;
    actions.idle.time = wrap(idleTime, standing.clip.duration);
    if (gesture) gesture.time = clamp(gestureTime, 0, gesture.getClip().duration);
    if (activeTurn) activeTurn.action.time = clamp(turnTime, 0, activeTurn.duration);
    mixer.update(0);

    // Flat-floor safety only: never edits joints or claims to lock a foot.
    // All weighted shoe vertices are measured; a sparse ankle/sole proxy missed
    // real penetration in the earlier experiment.
    grounding.position.y = 0;
    updateSkinMatrices();
    let minimum = Infinity;
    for (const { mesh, vertices } of shoes) for (const index of vertices) {
      mesh.getVertexPosition(index, point).applyMatrix4(mesh.matrixWorld);
      minimum = Math.min(minimum, point.y);
    }
    // These authored Idle/Walk/Turn clips always have a supporting foot. Signed
    // whole-root alignment closes the measured 6–13 mm air gap without changing
    // knee shape or leaving a release-filter residue. A full gesture may leave
    // the floor; its negative correction is disabled by the gesture weight.
    const requested = floorY - minimum;
    const lift = requested >= 0 ? Math.min(maxLift, requested) : Math.max(-maxDrop, requested) * (1 - g);
    grounding.position.y = lift;
    updateSkinMatrices();
    lastPose = {
      phase: actions.walk.time / walking.clip.duration,
      walk: { name: walking.clip.name, time: actions.walk.time, duration: walking.clip.duration, weight: w },
      idle: { name: standing.clip.name, time: actions.idle.time, duration: standing.clip.duration, weight: 1 - w - g - t },
      gesture: gesture ? { name: gesture.getClip().name, time: gesture.time, duration: gesture.getClip().duration, weight: g } : null,
      transition: activeTurn ? { name: activeTurn.clip.name, time: activeTurn.action.time, duration: activeTurn.duration, weight: t,
        yaw: activeTurn.at(activeTurn.action.time).yaw, rootXZ: [activeTurn.at(activeTurn.action.time).x, activeTurn.at(activeTurn.action.time).z], yawWarp: 0 } : null,
      verticalLift: lift, requestedLift: requested, liftCap: maxLift, dropCap: maxDrop,
      liftCapExceeded: requested > maxLift + 1e-6, dropCapExceeded: requested < -maxDrop - 1e-6 && g < .001,
      groundedWeight: 1 - g, positiveFloorGap: Math.max(0, minimum + lift - floorY),
      rawShoeMinimumY: minimum, correctedShoeMinimumY: minimum + lift,
    };
    return lastPose;
  }

  function reset() {
    grounding.position.y = 0;
    actions.gesture = null;
    activateTurn(null);
    for (const action of gestureActions.values()) action.setEffectiveWeight(0);
    return evaluate({});
  }

  return {
    bones, mixer, actions, walk: walking.clip, idle: standing.clip, sourceWalk, sourceIdle,
    stride, forwardYaw, sourceSpeed: stride / walking.clip.duration,
    rootNormalization: { walkStart: walking.start, walkEnd: walking.end, idleStart: standing.start, idleEnd: standing.end },
    weightedShoeVertexCount: shoes.reduce((sum, row) => sum + row.vertices.length, 0),
    activateGesture, activateTurn, turns, evaluate, reset, snapshot: () => lastPose,
  };
}
