import * as THREE from 'three';
import { FootIK as PinnedFootIK } from './vendor/foot-ik.mjs';

/**
 * Experimental, flat-ground host for the UNMODIFIED hh-hang FootIK plugin.
 *
 * Pinned source contract:
 *   FootIK.ts onAttach(FootIKPlayer), onBeforeAnimationUpdate, onAfterAnimationUpdate;
 *   types.ts FootIKPlayer; plugins/types.ts animation lifecycle ordering.
 * No PlayerController, keyboard/camera input, physics or navigation is instantiated.
 *
 * Host order, including fixed-step trials:
 *   caller moves holder -> beforeAnimation -> caller evaluates mixer -> afterAnimation.
 * The host never changes clip time, translates the holder, or adds a second IK solver.
 * A diagnostic raw-GLB baseline is NOT the preserved exhibition runtime v42 baseline.
 *
 * Before construction, put the model into a fixed known rest/calibration pose.
 * For discontinuous seek/clip changes, call reset BEFORE the next mixer evaluation.
 * reset reattaches through public methods at that same fixed calibration pose.
 *
 * All exported distance options are METRES. The upstream context's scale=.01 is
 * an explicit conversion from its nominal centimetre distance constants to metres;
 * it DOES NOT change Object3D.scale. This also converts upstream non-configurable
 * ray/snap constants (90, 440, .02) to .9m, 4.4m and .0002m.
 */

export const FOOT_IK_UPSTREAM = Object.freeze({
  repository: 'https://github.com/hh-hang/three-player-controller',
  commit: '29403c7dcc48c43153c2d6126571e685ca012617',
  packageVersion: '0.6.3', license: 'MIT',
  bundleSHA256: '765d7ecb8038debc1bedef1935a1d376b4ff5f5289ee47e01673817764469eae',
  testedThreeRevision: '169',
});

const SIDES = ['left', 'right'];
const DISTANCES = new Set([
  'maxPelvisDrop', 'maxPelvisRaise', 'maxFootRaise', 'maxFootDrop',
  'plantedHeightSpeed', 'penetrationLiftSpeed', 'soleHalfWidth', 'soleToeExtend',
  'soleHeelExtend', 'soleSkinThickness', 'moveLiftThreshold', 'footPhaseGroundThreshold',
  'predictionSearchRadius', 'maxPredictionCorrection', 'swingClearance', 'maxPredictionClearance',
]);
const ALLOWED_OPTIONS = new Set([...DISTANCES, 'footAlignWeight', 'maxFootTilt',
  'minKneeBend', 'maxKneeBend', 'pelvisKneeBend', 'straightPoleEnabled',
  'footPhaseSampleCount', 'footPhaseMinContactRatio', 'footPhaseSpeedSlack',
  'predictivePlacement', 'predictionHorizon', 'predictionProbeFrames',
  'predictionMinNormalY', 'debug']);

// Initial experiment parameters, NOT measurements of Emma's or Ethan's shoes.
export const DEFAULT_FOOT_IK_METRE_OPTIONS = Object.freeze({
  maxPelvisDrop: 0.15, maxPelvisRaise: 0.15,
  maxFootRaise: 0.20, maxFootDrop: 0.20,
  plantedHeightSpeed: 2, penetrationLiftSpeed: 2,
  soleHalfWidth: 0.035, soleToeExtend: 0.03,
  soleHeelExtend: 0.03, soleSkinThickness: 0.02,
  moveLiftThreshold: 0.001, footPhaseGroundThreshold: 0.035,
  predictionSearchRadius: 0.20, maxPredictionCorrection: 0.25,
  swingClearance: 0.04, maxPredictionClearance: 0.20,
  footAlignWeight: 1, maxFootTilt: Math.PI / 4,
  minKneeBend: THREE.MathUtils.degToRad(2), maxKneeBend: THREE.MathUtils.degToRad(145),
  pelvisKneeBend: THREE.MathUtils.degToRad(2),
  straightPoleEnabled: false, predictivePlacement: false,
  predictionHorizon: 0.45, predictionProbeFrames: 10, predictionMinNormalY: 0.55,
  footPhaseSampleCount: 96, footPhaseMinContactRatio: 0.04, footPhaseSpeedSlack: 1.35,
  debug: false,
});

const normalized = (name) => name.replace(/^mixamorig:?/i, '').toLowerCase();
const finiteOrNull = (n) => Number.isFinite(n) ? n : null;
const vector = (v) => v.toArray();
const horizontalDistance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const cloneJSON = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value, (_key, v) =>
  typeof v === 'number' && !Number.isFinite(v) ? null : v));

function updateWorld(root) { root.updateWorldMatrix(true, true); }
function capturePose(root) {
  const result = [];
  root.traverse((node) => result.push({ node, position: node.position.clone(),
    quaternion: node.quaternion.clone(), scale: node.scale.clone(), matrix: node.matrix.clone() }));
  return result;
}
function restorePose(saved, root) {
  for (const pose of saved) {
    pose.node.position.copy(pose.position);
    pose.node.quaternion.copy(pose.quaternion);
    pose.node.scale.copy(pose.scale);
    if (!pose.node.matrixAutoUpdate) pose.node.matrix.copy(pose.matrix);
  }
  updateWorld(root);
}

function resolveSkeleton(root, explicit = {}, roles = {}) {
  const bones = [];
  root.traverse((node) => { if (node.isBone) bones.push(node); });
  const choose = (ref, names, role) => {
    const candidates = ref?.isBone ? [ref] : bones.filter((bone) =>
      typeof ref === 'string' ? bone.name === ref : names.includes(normalized(bone.name)));
    if (candidates.length !== 1 || !bones.includes(candidates[0])) {
      throw new Error(`FootIK requires one explicit bone for ${role}; found ${candidates.length}.`);
    }
    return candidates[0];
  };
  const hips = choose(explicit.hips || roles.hips, ['hips', 'pelvis'], 'hips');
  const legs = {};
  for (const side of SIDES) {
    const suffix = side === 'left' ? 'l' : 'r';
    const refs = explicit.legs?.[side] || {};
    const leg = {
      upper: choose(refs.upper || roles[`${side}Thigh`], [`${side}upleg`, `thigh_${suffix}`], `${side}.upper`),
      lower: choose(refs.lower || roles[`${side}Shin`], [`${side}leg`, `calf_${suffix}`], `${side}.lower`),
      foot: choose(refs.foot || roles[`${side}Foot`], [`${side}foot`, `foot_${suffix}`], `${side}.foot`),
      toe: choose(refs.toe || roles[`${side}Toe`], [`${side}toebase`, `ball_${suffix}`], `${side}.toe`),
    };
    if (leg.lower.parent !== leg.upper || leg.foot.parent !== leg.lower) {
      throw new Error(`FootIK ${side}: expected direct upper -> lower -> foot chain.`);
    }
    let ancestor = leg.upper;
    while (ancestor && ancestor !== hips) ancestor = ancestor.parent;
    if (!ancestor) throw new Error(`FootIK ${side}: configured hips is not an ancestor of upper leg.`);
    legs[side] = leg;
  }
  return { hips, legs };
}

function convertOptions(optionsMeters, unit) {
  const result = {};
  for (const [key, value] of Object.entries(optionsMeters)) {
    if (!ALLOWED_OPTIONS.has(key)) throw new Error(`Unsupported FootIK option: ${key}`);
    if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) {
      throw new Error(`FootIK option ${key} must be finite and nonnegative.`);
    }
    result[key] = DISTANCES.has(key) ? value / unit : value;
  }
  return result;
}

/** Text format verified in pinned internal/debug.ts; this is an inferred phase. */
export function parsePinnedFootPhaseHeuristic(text) {
  const match = /: (plant|swing) (\d+)%$/.exec(text);
  return match ? { stance: match[1] === 'plant', phase: match[1], progressPercent: Number(match[2]),
    source: 'pinned upstream sampled-animation phase heuristic; NOT ground truth' }
    : { stance: null, phase: null, progressPercent: null, source: 'phase unavailable' };
}

function makeSoleProxy(leg, options) {
  const foot = leg.foot.getWorldPosition(new THREE.Vector3());
  const toe = leg.toe.getWorldPosition(new THREE.Vector3());
  const forward = toe.clone().sub(foot).setY(0);
  if (forward.lengthSq() < 1e-10) throw new Error('Foot/toe calibration direction is degenerate.');
  forward.normalize();
  const lateral = forward.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
  const heel = foot.clone().addScaledVector(forward, -options.soleHeelExtend);
  const tip = toe.clone().addScaledVector(forward, options.soleToeExtend);
  heel.y = tip.y;
  return [heel.clone().addScaledVector(lateral, options.soleHalfWidth),
    heel.clone().addScaledVector(lateral, -options.soleHalfWidth),
    tip.clone().addScaledVector(lateral, options.soleHalfWidth),
    tip.clone().addScaledVector(lateral, -options.soleHalfWidth)].map((point) => {
    point.y -= options.soleSkinThickness;
    return leg.foot.worldToLocal(point);
  });
}

/**
 * Returns { beforeAnimation, afterAnimation, reset, setEnabled, snapshot,
 *           poseHook, dispose }. Call snapshot() freely: it never runs IK.
 * getAction() must return the real AnimationAction driven by the caller.
 * measurePose(stage,context) may return the lab's exact skinned-sole metrics;
 * its result is copied immediately and is kept separately from bone proxies.
 */
export function createFootIKExperiment({
  root, scene, clips, getAction, skeleton: explicitSkeleton, roles,
  floorMeshes, groundY = 0, optionsMeters = {}, distanceUnitMeters = 0.01,
  calibrationLabel = 'caller-provided rest pose',
  contactMask, contactMaskLabel = 'caller-provided heuristic; NOT ground truth',
  measurePose, getGrounded, enabled = true, staticPreviewSteps = 24,
  locomotionClipNames = { walkAnim: 'Walk', runAnim: '' },
  FootIK = PinnedFootIK,
} = {}) {
  if (THREE.REVISION !== FOOT_IK_UPSTREAM.testedThreeRevision) {
    throw new Error(`This pinned experiment expects Three r169; found r${THREE.REVISION}.`);
  }
  if (!root?.isObject3D || !scene?.isScene || !Array.isArray(clips) || typeof getAction !== 'function') {
    throw new TypeError('FootIK host requires root, scene, clips and getAction().');
  }
  if (!Array.isArray(floorMeshes) || !floorMeshes.length || floorMeshes.some((mesh) => !mesh?.isMesh)) {
    throw new TypeError('FootIK flat-ground experiment requires actual floor Mesh objects.');
  }
  if (!Number.isFinite(groundY) || !Number.isFinite(distanceUnitMeters) || distanceUnitMeters <= 0) {
    throw new TypeError('groundY and distanceUnitMeters must be finite; distanceUnitMeters must be positive.');
  }
  if (!Number.isInteger(staticPreviewSteps) || staticPreviewSteps < 1 || staticPreviewSteps > 120) {
    throw new TypeError('staticPreviewSteps must be an integer in [1,120].');
  }
  updateWorld(root);
  const calibrationPose = capturePose(root);
  const skeleton = resolveSkeleton(root, explicitSkeleton, roles);
  const metreOptions = { ...DEFAULT_FOOT_IK_METRE_OPTIONS, ...optionsMeters };
  const upstreamOptions = convertOptions(metreOptions, distanceUnitMeters);
  const soleProxies = Object.fromEntries(SIDES.map((side) => [side, makeSoleProxy(skeleton.legs[side], metreOptions)]));
  const capsule = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  capsule.visible = false; // Standalone proxy: position is WORLD, not a child-local position.
  capsule.name = 'FootIK diagnostic world-support proxy';
  const support = { point: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0) };
  const velocity = new THREE.Vector3();
  let previousRootPosition = null;
  const host = {
    scene, playerModel: root, playerCapsule: capsule,
    playerIsOnGround: true, isFlying: false,
    getColliderMeshes: () => floorMeshes,
    getVelocity: () => velocity,
    getGroundSupport: () => support,
    getControllerMode: () => 0,
    playerModelConfig: {
      scale: distanceUnitMeters,
      walkAnim: locomotionClipNames.walkAnim || '', runAnim: locomotionClipNames.runAnim || '',
      leftWalkAnim: locomotionClipNames.leftWalkAnim || '',
      rightWalkAnim: locomotionClipNames.rightWalkAnim || '',
      backwardAnim: locomotionClipNames.backwardAnim || '',
    },
    animation: { clips, state: getAction() || undefined },
  };
  const plugin = new FootIK({ ...upstreamOptions, skeleton, enabled });
  const requiredMethods = ['onAttach', 'onDetach', 'onBeforeAnimationUpdate', 'onAfterAnimationUpdate',
    'setEnabled', 'dispose', 'getFootPhaseDebugText', 'getFootIKWeight', 'getFootTimeToLand',
    'getPelvisOffset', 'getPredictiveFootDebugText', 'getPredictiveFootScore'];
  for (const method of requiredMethods) {
    if (typeof plugin[method] !== 'function') throw new Error(`Pinned FootIK method is absent: ${method}`);
  }
  let disposed = false, active = Boolean(enabled), last = null, previous = null;
  let resetCount = 0, resetReason = 'construction';
  let totals;
  const anchors = { left: null, right: null };
  const clearTotals = () => {
    totals = { dynamicFrames: 0, dynamicSeconds: 0, staticPreviews: 0,
      maxBoneLengthChangeM: 0, maxAnkleCorrectionM: 0,
      sides: Object.fromEntries(SIDES.map((side) => [side, {
        heuristicStanceSamples: 0, beforeMaxProxyPenetrationM: 0, afterMaxProxyPenetrationM: 0,
        beforeProxyPenetrationSeconds: 0, afterProxyPenetrationSeconds: 0,
        beforeMaxHeuristicStanceDriftM: null, afterMaxHeuristicStanceDriftM: null,
      }])),
    };
  };
  clearTotals();

  function assertLive() { if (disposed) throw new Error('FootIK experiment has been disposed.'); }
  function syncHost(delta = 0) {
    updateWorld(root);
    for (const mesh of floorMeshes) mesh.updateWorldMatrix(true, false);
    const position = root.getWorldPosition(new THREE.Vector3());
    capsule.position.copy(position);
    root.getWorldQuaternion(capsule.quaternion);
    capsule.updateMatrixWorld(true);
    support.point.set(position.x, groundY, position.z);
    velocity.set(0, 0, 0);
    if (previousRootPosition && delta > 0) velocity.subVectors(position, previousRootPosition).divideScalar(delta);
    host.animation.state = getAction() || undefined;
    host.playerIsOnGround = getGrounded ? Boolean(getGrounded()) : true;
    return position;
  }
  syncHost();
  plugin.onAttach(host);

  function measureBones() {
    updateWorld(root);
    const position = root.getWorldPosition(new THREE.Vector3());
    const orientation = root.getWorldQuaternion(new THREE.Quaternion());
    const inverseOrientation = orientation.clone().invert();
    const feet = {};
    for (const side of SIDES) {
      const leg = skeleton.legs[side];
      const hip = leg.upper.getWorldPosition(new THREE.Vector3());
      const knee = leg.lower.getWorldPosition(new THREE.Vector3());
      const foot = leg.foot.getWorldPosition(new THREE.Vector3());
      const toe = leg.toe.getWorldPosition(new THREE.Vector3());
      const thighLength = hip.distanceTo(knee), shinLength = knee.distanceTo(foot);
      const cosine = thighLength > 1e-10 && shinLength > 1e-10
        ? THREE.MathUtils.clamp(hip.clone().sub(knee).dot(foot.clone().sub(knee)) / (thighLength * shinLength), -1, 1) : null;
      const points = soleProxies[side].map((point) => leg.foot.localToWorld(point.clone()).toArray());
      const minHeight = Math.min(...points.map((point) => point[1] - groundY));
      feet[side] = {
        footWorld: vector(foot), toeWorld: vector(toe), kneeWorld: vector(knee), upperWorld: vector(hip),
        footRootRelativeMetres: vector(foot.clone().sub(position).applyQuaternion(inverseOrientation)),
        footWorldQuaternion: leg.foot.getWorldQuaternion(new THREE.Quaternion()).toArray(),
        thighLengthM: thighLength, shinLengthM: shinLength,
        kneeBendDegrees: cosine === null ? null : 180 - THREE.MathUtils.radToDeg(Math.acos(cosine)),
        proxySolePointsWorld: points, minProxySoleClearanceM: minHeight,
        proxyPenetrationM: Math.max(0, -minHeight),
      };
    }
    return { rootWorld: vector(position), rootWorldQuaternion: orientation.toArray(),
      pelvisWorld: vector(skeleton.hips.getWorldPosition(new THREE.Vector3())), feet };
  }

  function telemetry() {
    return {
      pelvisOffsetM: plugin.getPelvisOffset() * distanceUnitMeters,
      feet: Object.fromEntries(SIDES.map((side) => {
        const phaseText = plugin.getFootPhaseDebugText(side);
        return [side, { phaseText, phaseHeuristic: active ? parsePinnedFootPhaseHeuristic(phaseText)
          : { stance: null, phase: null, progressPercent: null, source: 'plugin disabled; phase telemetry is not current' },
          ikWeight: plugin.getFootIKWeight(side), timeToNextLandSeconds: finiteOrNull(plugin.getFootTimeToLand(side)),
          predictiveText: plugin.getPredictiveFootDebugText(side), predictiveScore: finiteOrNull(plugin.getPredictiveFootScore(side)) }];
      })),
    };
  }

  function beforeAnimation(delta = 0) {
    assertLive();
    plugin.onBeforeAnimationUpdate(delta); // Assigns cached clean TRS; never subtracts offsets twice.
  }

  function afterAnimation(delta = 0, context = {}) {
    assertLive();
    if (!Number.isFinite(delta) || delta < 0) throw new Error('FootIK delta must be finite and nonnegative.');
    const currentRoot = syncHost(delta);
    const before = measureBones();
    const externalBefore = measurePose ? cloneJSON(measurePose('before', context)) : null;
    const dynamic = delta > 0;
    const substeps = dynamic ? 1 : staticPreviewSteps;
    const previewPose = dynamic ? null : capturePose(root);
    for (let i = 0; i < substeps; i += 1) {
      if (i > 0) {
        plugin.onBeforeAnimationUpdate(1 / 60);
        restorePose(previewPose, root);
      }
      plugin.onAfterAnimationUpdate(dynamic ? delta : 1 / 60);
    }
    updateWorld(root);
    const after = measureBones();
    const externalAfter = measurePose ? cloneJSON(measurePose('after', context)) : null;
    const getters = telemetry();
    const suppliedMask = contactMask ? contactMask(context, { before, after, telemetry: getters }) : null;
    const contacts = Object.fromEntries(SIDES.map((side) => [side, {
      stance: contactMask ? (typeof suppliedMask?.[side] === 'boolean' ? suppliedMask[side] : null)
        : getters.feet[side].phaseHeuristic.stance,
      source: contactMask ? contactMaskLabel : getters.feet[side].phaseHeuristic.source,
      groundTruth: false,
    }]));
    const correction = { pelvisWorldDeltaM: after.pelvisWorld.map((n, i) => n - before.pelvisWorld[i]), feet: {} };
    if (dynamic) { totals.dynamicFrames += 1; totals.dynamicSeconds += delta; }
    else totals.staticPreviews += 1;
    for (const side of SIDES) {
      const a = before.feet[side], b = after.feet[side], stats = totals.sides[side];
      const ankleCorrection = Math.hypot(...b.footWorld.map((n, i) => n - a.footWorld[i]));
      correction.feet[side] = {
        ankleDeltaM: b.footWorld.map((n, i) => n - a.footWorld[i]), ankleDistanceM: ankleCorrection,
        thighLengthDeltaM: b.thighLengthM - a.thighLengthM, shinLengthDeltaM: b.shinLengthM - a.shinLengthM,
      };
      totals.maxAnkleCorrectionM = Math.max(totals.maxAnkleCorrectionM, ankleCorrection);
      totals.maxBoneLengthChangeM = Math.max(totals.maxBoneLengthChangeM,
        Math.abs(b.thighLengthM - a.thighLengthM), Math.abs(b.shinLengthM - a.shinLengthM));
      stats.beforeMaxProxyPenetrationM = Math.max(stats.beforeMaxProxyPenetrationM, a.proxyPenetrationM);
      stats.afterMaxProxyPenetrationM = Math.max(stats.afterMaxProxyPenetrationM, b.proxyPenetrationM);
      if (dynamic) {
        if (a.proxyPenetrationM > 0.002) stats.beforeProxyPenetrationSeconds += delta;
        if (b.proxyPenetrationM > 0.002) stats.afterProxyPenetrationSeconds += delta;
        if (contacts[side].stance === true) {
          stats.heuristicStanceSamples += 1;
          if (!anchors[side]) anchors[side] = { before: a.footWorld.slice(), after: b.footWorld.slice() };
          stats.beforeMaxHeuristicStanceDriftM = Math.max(stats.beforeMaxHeuristicStanceDriftM || 0,
            horizontalDistance(a.footWorld, anchors[side].before));
          stats.afterMaxHeuristicStanceDriftM = Math.max(stats.afterMaxHeuristicStanceDriftM || 0,
            horizontalDistance(b.footWorld, anchors[side].after));
        } else anchors[side] = null;
      }
      a.horizontalSpeedMps = dynamic && previous ? horizontalDistance(a.footWorld, previous.before.feet[side].footWorld) / delta : null;
      b.horizontalSpeedMps = dynamic && previous ? horizontalDistance(b.footWorld, previous.after.feet[side].footWorld) / delta : null;
    }
    last = { enabled: active, frameMode: dynamic ? 'continuous-dynamic-step' : 'settled-static-preview-not-gait-test',
      deltaSeconds: delta, previewSubsteps: dynamic ? 0 : substeps,
      time: context.time ?? getAction()?.time ?? null,
      clip: getAction()?.getClip().name ?? null,
      reason: context.reason || null, resetCount, resetReason,
      before, after, correction, contactHeuristics: contacts, telemetry: getters,
      exactExternalMeasurement: { before: externalBefore, after: externalAfter },
      rootVelocityMps: vector(velocity),
    };
    previous = dynamic ? last : null;
    previousRootPosition = currentRoot.clone();
    return cloneJSON(last);
  }

  function reset(reason = 'explicit-reset', { clearStatistics = false } = {}) {
    assertLive();
    plugin.onDetach();
    const cleanCurrentPose = capturePose(root);
    try {
      restorePose(calibrationPose, root);
      syncHost();
      plugin.onAttach(host); // Rebuilds sole samples/phases consistently at the fixed calibration pose.
    } finally { restorePose(cleanCurrentPose, root); }
    // A reset has an observed root pose. Keep it as the t=0 predecessor so the
    // first physical step reports displacement / dt instead of a false zero.
    previous = null;
    updateWorld(root);
    previousRootPosition = root.getWorldPosition(new THREE.Vector3());
    anchors.left = anchors.right = null;
    resetCount += 1; resetReason = String(reason);
    if (clearStatistics) clearTotals();
  }

  function setEnabled(value) {
    assertLive(); active = Boolean(value);
    plugin.setEnabled(active);
    reset('enabled-change');
  }
  function snapshot() {
    return cloneJSON({ upstream: FOOT_IK_UPSTREAM, enabled: active, disposed,
      baseline: { rawGLB: 'Same model/clip before this external FootIK; measured here.',
        runtimeV42: 'Separate preserved exhibition baseline; NOT exercised or certified by this adapter.' },
      calibrationLabel, optionsMetres: metreOptions, distanceUnitMeters, locomotionClipNames,
      modelScaleModified: false, rootMovementOwner: 'caller; adapter reads world pose only',
      measurementPlane: { y: groundY, normal: [0, 1, 0] },
      groundedPolicy: getGrounded ? 'caller-provided' : 'fixed true for flat-ground Walk/Observe experiment',
      proxySoleNote: 'Four foot-local points derived from calibration bone/toe geometry and explicit options; NOT exact skinned shoe vertices.',
      contactNote: 'Sampled animation phase or caller heuristic; IK weight and timeToLand are not a contact truth signal.',
      limitations: ['Initial shoe dimensions and limits are experiment parameters, not asset measurements.',
        'Stationary in-place walking is not a valid test of locomotion stance drift; provide matching holder displacement.',
        'Static seek settles one pose and is not a continuous gait result.',
        'Use external exact skinned-sole measurements to assess shoe penetration.',
        'Reactive FootIK with predictivePlacement=false does not promise horizontal foot locking.'],
      totals, last,
    });
  }
  function dispose() {
    if (disposed) return;
    plugin.dispose(); capsule.geometry.dispose(); capsule.material.dispose();
    disposed = true; previous = null;
  }
  const poseHook = {
    label: 'Experimental hh-hang FootIK 0.6.3; raw-GLB pre/post',
    beforePose: (context) => beforeAnimation(context.delta || 0),
    afterPose: (context) => afterAnimation(context.delta || 0, context),
    // Ordinary periodic clip wrapping is continuous movement, not a seek.
    onReset: (context) => { if (context.reason !== 'loop-wrap') reset(context.reason || 'lab-discontinuity'); },
    onDetach: () => dispose(),
  };
  return { beforeAnimation, afterAnimation, reset, setEnabled, snapshot, poseHook, dispose };
}

/** Install on one already loaded lab entry; save/restore its chosen clip. */
export function installFootIKExperiment(lab, id, options = {}) {
  lab.pause();
  const original = lab.getRuntime(id);
  const clipName = original.clip?.name || 'Walk';
  lab.setRestPose([id]);
  const runtime = lab.getRuntime(id);
  const experiment = createFootIKExperiment({ root: runtime.root, scene: runtime.scene,
    clips: runtime.clips, roles: runtime.roles, getAction: runtime.getAction,
    floorMeshes: runtime.floorMeshes, calibrationLabel: `${id}: original GLB default/rest pose`, ...options });
  try {
    lab.attachPoseHook(id, experiment.poseHook);
    if (runtime.clips.some((clip) => clip.name === clipName)) lab.setClip(clipName, [id]);
  } catch (error) { experiment.dispose(); throw error; }
  return experiment;
}

/**
 * Estimate in-place forward speed from PRE-IK foot displacement during the
 * labelled heuristic stance. Run a full raw Walk cycle at fixed dt first.
 * The result is a calibration estimate, never applied automatically to holder.
 */
export function estimateInPlaceForwardSpeed(frames, forward = [0, 0, 1]) {
  const axis = new THREE.Vector3(...forward).setY(0);
  if (axis.lengthSq() < 1e-10) throw new Error('Forward axis is degenerate.');
  axis.normalize();
  const values = [];
  for (let i = 1; i < frames.length; i += 1) {
    const a = frames[i - 1], b = frames[i];
    if (a.frameMode !== 'continuous-dynamic-step' || b.frameMode !== 'continuous-dynamic-step'
        || a.clip !== b.clip || a.resetCount !== b.resetCount || b.deltaSeconds <= 0) continue;
    for (const side of SIDES) {
      if (a.contactHeuristics?.[side]?.stance !== true || b.contactHeuristics?.[side]?.stance !== true) continue;
      const p = a.before.feet[side].footRootRelativeMetres;
      const q = b.before.feet[side].footRootRelativeMetres;
      const speed = -new THREE.Vector3(q[0]-p[0], q[1]-p[1], q[2]-p[2]).dot(axis) / b.deltaSeconds;
      if (Number.isFinite(speed)) values.push(speed);
    }
  }
  values.sort((a, b) => a - b);
  const percentile = (fraction) => {
    if (!values.length) return null;
    const index = (values.length - 1) * fraction, low = Math.floor(index), alpha = index-low;
    return values[low] * (1-alpha) + values[Math.min(low+1, values.length-1)] * alpha;
  };
  return { medianMps: percentile(.5), lowerQuartileMps: percentile(.25), upperQuartileMps: percentile(.75),
    meanMps: values.length ? values.reduce((a, b) => a+b, 0)/values.length : null,
    sampleCount: values.length, forwardAxis: axis.toArray(),
    method: 'Negative PRE-IK foot velocity relative to model root, projected onto forward, while consecutive upstream/caller heuristic masks both say stance.',
    limitations: ['Estimate assumes an in-place locomotion clip and a correct forward axis.',
      'Stance labels are heuristics. Inspect dispersion and sign before using this as a root speed.',
      'Actual root motion is not extracted or altered. No speed is silently applied.'] };
}
