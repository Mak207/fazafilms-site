/* MIT hh-hang/three-player-controller 0.6.3 source commit 29403c7dcc48c43153c2d6126571e685ca012617; built with esbuild 0.25.12; external three. See LICENSE.hh-hang. */
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// ../hh-hang/src/plugins/foot-ik/FootIK.ts
import {
  Matrix3 as Matrix32,
  MathUtils as MathUtils4,
  Quaternion as Quaternion5,
  Raycaster,
  Vector3 as Vector37
} from "three";

// ../hh-hang/src/plugins/foot-ik/internal/twoBoneIK.ts
import { MathUtils, Quaternion, Vector3 } from "three";
function createTwoBoneIKScratch() {
  return {
    v1: new Vector3(),
    v2: new Vector3(),
    v3: new Vector3(),
    v4: new Vector3(),
    v5: new Vector3(),
    v6: new Vector3(),
    v7: new Vector3(),
    v8: new Vector3(),
    v9: new Vector3(),
    v10: new Vector3(),
    v11: new Vector3(),
    v12: new Vector3(),
    v13: new Vector3(),
    q1: new Quaternion(),
    q2: new Quaternion(),
    q3: new Quaternion(),
    identityQ: new Quaternion()
  };
}
function solveTwoBoneIK(leg, target, weight, options = {}) {
  if (!leg?.upper || !leg?.lower || !leg?.foot || weight <= 1e-3) return;
  const scratch = options.scratch ?? createTwoBoneIKScratch();
  const capture = options.capture ?? (() => {
  });
  const minBend = options.minKneeBend ?? MathUtils.degToRad(2);
  const maxBend = options.maxKneeBend ?? MathUtils.degToRad(145);
  const solveWeight = MathUtils.clamp(weight, 0, 1);
  const restPole = getRestPole(leg, scratch);
  const hip = leg.upper.getWorldPosition(scratch.v1);
  const knee = leg.lower.getWorldPosition(scratch.v2);
  const foot = leg.foot.getWorldPosition(scratch.v3);
  const upperLen = Math.max(1e-4, hip.distanceTo(knee));
  const lowerLen = Math.max(1e-4, knee.distanceTo(foot));
  const hipToTarget = scratch.v4.copy(target).sub(hip);
  const targetDistance = hipToTarget.length();
  if (targetDistance < 1e-4) return;
  const maxReach = reachFromBend(upperLen, lowerLen, minBend);
  const minReach = reachFromBend(upperLen, lowerLen, maxBend);
  const clampedDistance = MathUtils.clamp(targetDistance, minReach, maxReach);
  const clampedTarget = scratch.v5.copy(hip).addScaledVector(hipToTarget, clampedDistance / targetDistance);
  const chainDir = scratch.v6.copy(clampedTarget).sub(hip).normalize();
  const pole = getStablePole(
    leg,
    restPole,
    options.kneePlaneNormal,
    MathUtils.clamp(options.kneePlaneWeight ?? 1, 0, 1),
    chainDir,
    scratch.v7,
    scratch.v4,
    scratch.q1,
    scratch.identityQ
  );
  const along = (upperLen * upperLen - lowerLen * lowerLen + clampedDistance * clampedDistance) / (2 * clampedDistance);
  const height = Math.sqrt(Math.max(0, upperLen * upperLen - along * along));
  const desiredKnee = scratch.v8.copy(hip).addScaledVector(chainDir, along).addScaledVector(pole, height);
  rotateBoneToward(leg.upper, leg.lower.getWorldPosition(scratch.v9), desiredKnee, solveWeight, capture, scratch);
  leg.upper.updateMatrixWorld(true);
  leg.lower.updateMatrixWorld(true);
  rotateBoneToward(leg.lower, leg.foot.getWorldPosition(scratch.v9), clampedTarget, solveWeight, capture, scratch);
  leg.lower.updateMatrixWorld(true);
}
function reachFromBend(upperLen, lowerLen, bend) {
  return Math.sqrt(upperLen * upperLen + lowerLen * lowerLen + 2 * upperLen * lowerLen * Math.cos(bend));
}
function getRestPole(leg, scratch) {
  const hip = leg.upper.getWorldPosition(scratch.v9);
  const knee = leg.lower.getWorldPosition(scratch.v10);
  const foot = leg.foot.getWorldPosition(scratch.v11);
  const restChain = scratch.v12.copy(foot).sub(hip).normalize();
  const restPole = scratch.v13.copy(knee).sub(hip).addScaledVector(restChain, -scratch.v10.copy(knee).sub(hip).dot(restChain));
  if (restPole.lengthSq() < 1e-6) restPole.set(0, 0, 1);
  return scratch.v13.normalize();
}
function getStablePole(leg, restPole, kneePlaneNormal, kneePlaneWeight, chainDir, target, straightPole, poleRotation, identityRotation) {
  const hasRestPole = projectPoleToChainPlane(restPole, chainDir, target);
  if (kneePlaneNormal && kneePlaneWeight > 0) {
    straightPole.crossVectors(chainDir, kneePlaneNormal);
    if (normalizePole(straightPole)) {
      if (hasRestPole && kneePlaneWeight < 1) {
        poleRotation.setFromUnitVectors(target, straightPole).slerp(identityRotation, 1 - kneePlaneWeight);
        target.applyQuaternion(poleRotation).normalize();
      } else {
        target.copy(straightPole);
      }
      rememberPole(leg, target);
      return target;
    }
    if (leg.hasLastPole && leg.lastPole && projectPoleToChainPlane(leg.lastPole, chainDir, target)) {
      rememberPole(leg, target);
      return target;
    }
  }
  if (hasRestPole) {
    projectPoleToChainPlane(restPole, chainDir, target);
    rememberPole(leg, target);
    return target;
  }
  target.set(0, chainDir.z, -chainDir.y);
  if (!normalizePole(target)) {
    target.set(-chainDir.y, chainDir.x, 0);
    normalizePole(target);
  }
  rememberPole(leg, target);
  return target;
}
function projectPoleToChainPlane(direction, chainDir, target) {
  target.copy(direction).addScaledVector(chainDir, -direction.dot(chainDir));
  return normalizePole(target);
}
function normalizePole(pole) {
  const lengthSq = pole.lengthSq();
  if (lengthSq < 1e-6) return false;
  pole.multiplyScalar(1 / Math.sqrt(lengthSq));
  return true;
}
function rememberPole(leg, pole) {
  if (!leg.lastPole) return;
  leg.lastPole.copy(pole);
  leg.hasLastPole = true;
}
function rotateBoneToward(bone, effectorWorld, targetWorld, weight, capture, scratch) {
  capture(bone);
  const jointWorld = bone.getWorldPosition(scratch.v10);
  const from = scratch.v11.copy(effectorWorld).sub(jointWorld).normalize();
  const to = scratch.v12.copy(targetWorld).sub(jointWorld).normalize();
  if (from.lengthSq() < 1e-4 || to.lengthSq() < 1e-4) return;
  const deltaWorldQ = scratch.q1.setFromUnitVectors(from, to);
  deltaWorldQ.slerp(scratch.identityQ, 1 - weight);
  const jointWorldQ = bone.getWorldQuaternion(scratch.q2);
  const targetWorldQ = deltaWorldQ.multiply(jointWorldQ);
  const parent = bone.parent;
  if (!parent) return;
  const parentWorldQ = parent.getWorldQuaternion(scratch.q3);
  bone.quaternion.copy(parentWorldQ.invert().multiply(targetWorldQ));
  bone.updateMatrixWorld(true);
}

// ../hh-hang/src/plugins/foot-ik/internal/footPhase.ts
import {
  AnimationMixer,
  MathUtils as MathUtils2,
  Quaternion as Quaternion3,
  Vector3 as Vector34
} from "three";

// ../hh-hang/src/plugins/foot-ik/internal/skeleton.ts
import { Vector3 as Vector33 } from "three";

// ../hh-hang/src/plugins/foot-ik/internal/predictivePlacement.ts
import { Matrix3, Quaternion as Quaternion2, Vector3 as Vector32 } from "three";
var PREDICTION_DEMAND_ENTER = 8;
var PREDICTION_DEMAND_EXIT = 4;
function createPredictiveScratch() {
  return {
    v1: new Vector32(),
    v2: new Vector32(),
    v4: new Vector32(),
    v5: new Vector32(),
    v6: new Vector32(),
    v7: new Vector32(),
    v8: new Vector32(),
    v9: new Vector32(),
    q1: new Quaternion2(),
    q2: new Quaternion2(),
    q3: new Quaternion2(),
    normalMatrix: new Matrix3(),
    trajectoryStart: new Vector32(),
    demandEnter: 0,
    demandExit: 0,
    candidates: Array.from({ length: 1 }, () => ({
      target: new Vector32(),
      point: new Vector32(),
      normal: new Vector32(),
      object: null,
      score: 0,
      debugIndex: -1
    })),
    centerSupport: {
      target: new Vector32(),
      point: new Vector32(),
      normal: new Vector32(),
      object: null,
      score: 0,
      debugIndex: 0
    },
    plannedPoints: Array.from({ length: 13 }, () => new Vector32()),
    currentLocalPosition: new Vector32(),
    currentLocalRotation: new Quaternion2(),
    animationBias: new Vector32(),
    landingCorrection: new Vector32(),
    continuityOffset: new Vector32(),
    modelWorldRotation: new Quaternion2(),
    landingRotation: new Quaternion2(),
    worldScale: new Vector32(),
    localPosition: new Vector32(),
    localRotation: new Quaternion2(),
    pathPosition: new Vector32(),
    pathRotation: new Quaternion2(),
    solePoint: new Vector32(),
    soleOffset: new Vector32(),
    supportHits: Array.from({ length: 4 }, () => ({
      point: new Vector32(),
      normal: new Vector32(0, 1, 0)
    })),
    supportHitList: [],
    clearanceSamples: Array.from({ length: 12 }, () => ({
      progress: 0,
      requiredLift: 0
    })),
    clearanceSampleCount: 0
  };
}
function createPredictiveFootState() {
  return {
    mode: "none",
    landingTarget: new Vector32(),
    landingNormal: new Vector32(0, 1, 0),
    supportPoint: new Vector32(),
    animatedLanding: new Vector32(),
    animatedLandingRotation: new Quaternion2(),
    trajectoryStartOffset: new Vector32(),
    trajectoryCurrentTarget: new Vector32(),
    trajectoryStartProgress: 0,
    trajectoryProgress: 0,
    trajectoryClearance: 0,
    predictionWeight: 0,
    usesOffsetLanding: false,
    releaseOffset: new Vector32(),
    releaseStartProgress: 0,
    releaseActive: false,
    supportObject: null,
    supportLocalTarget: new Vector32(),
    supportLocalPoint: new Vector32(),
    supportLocalNormal: new Vector32(0, 1, 0),
    probeElapsed: Infinity,
    score: Infinity,
    debugPlaneLift: 0,
    debugSwingLift: 0,
    debugTrajectory: Array.from({ length: 13 }, () => new Vector32()),
    debugTrajectoryVisible: false,
    debugSupportVisible: false,
    debugSupportCorners: Array.from({ length: 4 }, () => new Vector32()),
    debugCandidates: Array.from({ length: 1 }, () => ({
      point: new Vector32(),
      evaluated: false,
      valid: false,
      selected: false
    }))
  };
}
function resetPredictiveFootState(state) {
  state.mode = "none";
  state.supportObject = null;
  state.probeElapsed = Infinity;
  state.score = Infinity;
  state.debugPlaneLift = 0;
  state.debugSwingLift = 0;
  state.trajectoryStartOffset.set(0, 0, 0);
  state.trajectoryCurrentTarget.set(0, 0, 0);
  state.trajectoryStartProgress = 0;
  state.trajectoryProgress = 0;
  state.trajectoryClearance = 0;
  state.predictionWeight = 0;
  state.usesOffsetLanding = false;
  state.releaseOffset.set(0, 0, 0);
  state.releaseStartProgress = 0;
  state.releaseActive = false;
  state.debugTrajectoryVisible = false;
  state.debugSupportVisible = false;
  for (const candidate of state.debugCandidates) {
    candidate.evaluated = false;
    candidate.valid = false;
    candidate.selected = false;
  }
}
function getPredictiveDemandThresholds(appliedScale, snapEpsilon, scratch) {
  scratch.demandEnter = Math.max(
    snapEpsilon,
    PREDICTION_DEMAND_ENTER * appliedScale
  );
  scratch.demandExit = Math.min(
    scratch.demandEnter,
    Math.max(snapEpsilon, PREDICTION_DEMAND_EXIT * appliedScale)
  );
  return { enter: scratch.demandEnter, exit: scratch.demandExit };
}
function shiftPredictiveDebugTrajectory(points, delta) {
  if (delta.lengthSq() <= 1e-12 || points.length < 2) return;
  for (let i = 0; i < points.length; i++) {
    points[i].addScaledVector(delta, i / (points.length - 1));
  }
}
function selectPredictiveDebugCandidate(state, selectedIndex) {
  for (let i = 0; i < state.debugCandidates.length; i++) {
    state.debugCandidates[i].selected = i === selectedIndex;
  }
}
function getPointPlaneLift(support, point, fallbackY, scratch) {
  if (!support) return Math.max(0, point.y - fallbackY);
  return Math.max(0, support.normal.dot(scratch.copy(point).sub(support.point)));
}
function getPredictivePlaneDistance(ctx, candidate) {
  return getPointPlaneLift(
    ctx.castCapsuleGround(),
    candidate.point,
    candidate.point.y,
    ctx.scratch.v5
  );
}
function getPredictiveTerrainDemand(planeLift, swingLift) {
  return Math.max(planeLift, Math.max(0, swingLift));
}
function acceptPredictiveFootCandidate(state, candidate, scratch) {
  state.landingTarget.copy(candidate.target);
  state.supportPoint.copy(candidate.point);
  state.landingNormal.copy(candidate.normal);
  state.score = candidate.score;
  state.usesOffsetLanding = candidate.debugIndex !== 0;
  state.supportObject = candidate.object;
  if (state.supportObject) {
    state.supportObject.updateMatrixWorld(true);
    state.supportLocalTarget.copy(state.landingTarget);
    state.supportObject.worldToLocal(state.supportLocalTarget);
    state.supportLocalPoint.copy(state.supportPoint);
    state.supportObject.worldToLocal(state.supportLocalPoint);
    scratch.normalMatrix.getNormalMatrix(state.supportObject.matrixWorld).invert();
    state.supportLocalNormal.copy(state.landingNormal).applyMatrix3(scratch.normalMatrix).normalize();
  }
}
function refreshPredictiveSupportAnchor(leg, scratch, debug = false) {
  const state = leg.predictive;
  if (!state.supportObject || state.mode === "active" && !state.usesOffsetLanding) {
    return;
  }
  const previousTarget = debug ? scratch.v1.copy(state.landingTarget) : null;
  state.supportObject.updateMatrixWorld(true);
  state.landingTarget.copy(state.supportLocalTarget);
  state.supportObject.localToWorld(state.landingTarget);
  state.supportPoint.copy(state.supportLocalPoint);
  state.supportObject.localToWorld(state.supportPoint);
  scratch.normalMatrix.getNormalMatrix(state.supportObject.matrixWorld);
  state.landingNormal.copy(state.supportLocalNormal).applyMatrix3(scratch.normalMatrix).normalize();
  if (previousTarget) {
    shiftPredictiveDebugTrajectory(
      state.debugTrajectory,
      scratch.v2.subVectors(state.landingTarget, previousTarget)
    );
  }
}
function copyPredictiveFootCandidate(source, target) {
  target.target.copy(source.target);
  target.point.copy(source.point);
  target.normal.copy(source.normal);
  target.object = source.object;
  target.score = source.score;
  target.debugIndex = source.debugIndex;
}
function findPredictiveFootCandidates(ctx, leg, phase, expected, expectedRotation) {
  const scratch = ctx.scratch;
  const futureRootDelta = scratch.v8.copy(ctx.predictionVelocity).multiplyScalar(Math.min(phase.timeToLand, ctx.predictionHorizon));
  const debugCandidate = leg.predictive.debugCandidates[0];
  debugCandidate.evaluated = true;
  debugCandidate.valid = false;
  debugCandidate.selected = false;
  debugCandidate.point.copy(expected);
  const state = leg.predictive;
  state.debugSupportVisible = false;
  const probed = probePredictiveFootSupport(
    ctx,
    leg,
    expected.x,
    expected.z,
    expected,
    expectedRotation
  );
  if (!probed) {
    return { candidate: null, centerSupport: null };
  }
  if (ctx.debug) {
    fillDebugSupportCorners(
      ctx,
      leg,
      expected.x,
      expected.z,
      expectedRotation,
      probed.candidate
    );
    state.debugSupportVisible = true;
  }
  debugCandidate.point.copy(probed.candidate.point);
  if (!probed.accepted) {
    return { candidate: null, centerSupport: null };
  }
  copyPredictiveFootCandidate(probed.candidate, scratch.centerSupport);
  const candidate = finalizePredictiveFootCandidate(
    ctx,
    leg,
    probed.candidate,
    probed.supportCount,
    expected.x,
    expected.z,
    expected,
    expectedRotation,
    futureRootDelta
  );
  if (!candidate) {
    return { candidate: null, centerSupport: scratch.centerSupport };
  }
  debugCandidate.valid = true;
  debugCandidate.selected = true;
  debugCandidate.point.copy(candidate.target);
  return { candidate, centerSupport: scratch.centerSupport };
}
function fillDebugSupportCorners(ctx, leg, centerX, centerZ, expectedRotation, support) {
  const scratch = ctx.scratch;
  const worldScale = leg.foot.getWorldScale(scratch.v9);
  const corners = leg.predictive.debugSupportCorners;
  const lift = Math.max(ctx.snapEpsilon, ctx.appliedScale * 0.4);
  for (let i = 0; i < corners.length; i++) {
    const sample = leg.soleSamples[i];
    if (!sample) {
      corners[i].copy(support.point).addScaledVector(support.normal, lift);
      continue;
    }
    scratch.v4.copy(sample.local).multiply(worldScale).applyQuaternion(expectedRotation);
    const corner = corners[i];
    corner.set(
      centerX + scratch.v4.x,
      support.point.y,
      centerZ + scratch.v4.z
    );
    corner.addScaledVector(
      support.normal,
      lift - support.normal.dot(scratch.v1.subVectors(corner, support.point))
    );
  }
}
function probePredictiveFootSupport(ctx, leg, centerX, centerZ, expected, expectedRotation) {
  const scratch = ctx.scratch;
  const footWorldQ = expectedRotation;
  const worldScale = leg.foot.getWorldScale(scratch.v9);
  const hits = scratch.supportHitList;
  hits.length = 0;
  let highestHit = null;
  for (const sample of leg.soleSamples) {
    const relative = scratch.v4.copy(sample.local).multiply(worldScale).applyQuaternion(footWorldQ);
    const hit = ctx.castGroundFrom(
      centerX + relative.x,
      expected.y + ctx.sampleRayOriginY,
      centerZ + relative.z
    );
    if (!hit) continue;
    const stored = scratch.supportHits[hits.length];
    stored.point.copy(hit.point);
    stored.normal.copy(hit.normal);
    stored.object = hit.object;
    hits.push(stored);
    if (!highestHit || stored.point.y > highestHit.point.y) highestHit = stored;
  }
  if (!highestHit) return null;
  const pooled = scratch.candidates[0];
  const supportCount = ctx.mergeCoplanarHits(
    hits,
    highestHit,
    pooled.point,
    pooled.normal
  );
  pooled.target.set(centerX, pooled.point.y, centerZ);
  pooled.object = highestHit.object ?? null;
  pooled.score = 0;
  pooled.debugIndex = 0;
  const accepted = supportCount >= 1 && pooled.normal.y >= ctx.predictionMinNormalY;
  return { candidate: pooled, supportCount, accepted };
}
function finalizePredictiveFootCandidate(ctx, leg, pooled, supportCount, centerX, centerZ, expected, expectedRotation, futureRootDelta) {
  const scratch = ctx.scratch;
  const correctionSq = (centerX - expected.x) ** 2 + (centerZ - expected.z) ** 2;
  const maxCorrectionSq = ctx.maxPredictionCorrection * ctx.maxPredictionCorrection;
  if (correctionSq > maxCorrectionSq) return null;
  const worldScale = leg.foot.getWorldScale(scratch.v9);
  const alignQ = ctx.getConstrainedFootAlign(
    pooled.normal,
    ctx.footAlignWeight,
    scratch.q2
  );
  const targetWorldQ = scratch.q3.copy(alignQ).multiply(expectedRotation);
  let targetY = -Infinity;
  for (const sample of leg.soleSamples) {
    const relative = scratch.v4.copy(sample.local).multiply(worldScale).applyQuaternion(targetWorldQ);
    const sampleX = centerX + relative.x;
    const sampleZ = centerZ + relative.z;
    const planeY = pooled.point.y - (pooled.normal.x * (sampleX - pooled.point.x) + pooled.normal.z * (sampleZ - pooled.point.z)) / pooled.normal.y;
    targetY = Math.max(targetY, planeY - relative.y);
  }
  if (!Number.isFinite(targetY)) return null;
  pooled.target.set(centerX, targetY, centerZ);
  const heightDelta = targetY - expected.y;
  if (heightDelta > ctx.maxFootRaise || heightDelta < -ctx.maxFootDrop) return null;
  const hip = leg.upper.getWorldPosition(scratch.v5);
  const knee = leg.lower.getWorldPosition(scratch.v6);
  const foot = leg.foot.getWorldPosition(scratch.v7);
  const upperLen = hip.distanceTo(knee);
  const lowerLen = knee.distanceTo(foot);
  const maxReach = ctx.getSafeLegReach(upperLen, lowerLen, ctx.pelvisKneeBend);
  hip.add(futureRootDelta);
  const reachRatio = maxReach > 1e-6 ? hip.distanceTo(pooled.target) / maxReach : Infinity;
  if (reachRatio > 1) return null;
  const correctionRatio = ctx.maxPredictionCorrection > 1e-6 ? Math.sqrt(correctionSq) / ctx.maxPredictionCorrection : 0;
  const heightRange = Math.max(ctx.maxFootRaise, ctx.maxFootDrop, 1e-6);
  pooled.score = correctionRatio + (1 - pooled.normal.y) * 0.7 + Math.abs(heightDelta) / heightRange * 0.4 + (4 - supportCount) * 2 + Math.max(0, reachRatio - 0.85) / 0.2 * 3;
  return pooled;
}

// ../hh-hang/src/plugins/foot-ik/internal/skeleton.ts
function collectBones(root) {
  const bones = [];
  root?.traverse((obj) => {
    if (obj.isBone) bones.push(obj);
  });
  return bones;
}
function findHips(bones) {
  return bones.find((bone) => /hips|pelvis/i.test(bone.name)) ?? null;
}
function createLeg(side, bones, skeletonConfig = null) {
  const legConfig = skeletonConfig?.legs?.[side] ?? null;
  const upper = resolveConfiguredBone(legConfig?.upper, bones, `${side}.upper`) ?? findBone(bones, side, "upper");
  const lower = resolveConfiguredBone(legConfig?.lower, bones, `${side}.lower`) ?? findBone(bones, side, "lower");
  const foot = resolveConfiguredBone(legConfig?.foot, bones, `${side}.foot`) ?? findBone(bones, side, "foot");
  const toe = resolveConfiguredBone(legConfig?.toe, bones, `${side}.toe`) ?? findBone(bones, side, "toe");
  return {
    side,
    upper,
    lower,
    foot,
    toe,
    ready: !!(upper && lower && foot),
    // IK 运行时目标和地面命中信息。
    smoothedTarget: new Vector33(),
    heightSupport: null,
    heightSupportLocal: new Vector33(),
    heightSupportWorldY: 0,
    heightSupportScale: 1,
    pelvisTarget: new Vector33(),
    hasPelvisTarget: false,
    hitPoint: new Vector33(),
    hitNormal: new Vector33(0, 1, 0),
    supportPoint: new Vector33(),
    supportNormal: new Vector33(0, 1, 0),
    footSamplePoint: new Vector33(),
    soleSamples: ["heelL", "heelR", "toeL", "toeR"].map((name) => ({
      name,
      local: new Vector33(),
      point: new Vector33(),
      hitPoint: new Vector33(),
      hasHit: false,
      marker: null,
      rayLine: null,
      footMarker: null
    })),
    bestGroundSampleIndex: -1,
    // 本帧脚部目标对动画脚位的修正量。
    offsetY: 0,
    movePenetrating: false,
    // weight 为最终 IK 权重，plantedWeight 只负责支撑脚渐入/渐出。
    weight: 0,
    plantedWeight: 0,
    planted: false,
    predictive: createPredictiveFootState(),
    // 上一帧 pole 只在弯曲平面退化时使用。
    lastPole: new Vector33(),
    hasLastPole: false,
    marker: null,
    hitMarker: null,
    rayLine: null,
    raiseLimitLine: null,
    predictiveLine: null,
    predictiveCandidateMarkers: [],
    predictiveSupportMesh: null,
    predictiveSupportOutline: null
  };
}
function isReadyLeg(leg) {
  return !!(leg.ready && leg.upper && leg.lower && leg.foot);
}
function resolveConfiguredBone(ref, bones, label, warnMissing = true) {
  if (!ref) return null;
  if (typeof ref !== "string" && ref.isBone) return ref;
  if (typeof ref === "string") {
    const bone = bones.find((item) => item.name === ref) ?? null;
    if (!bone && warnMissing) {
      console.warn(`[FootIK] \u914D\u7F6E\u9AA8\u9ABC\u672A\u627E\u5230\uFF1A${label} -> "${ref}"`);
    }
    return bone;
  }
  console.warn(`[FootIK] \u65E0\u6548\u9AA8\u9ABC\u914D\u7F6E\uFF1A${label}`, ref);
  return null;
}
function findBone(bones, side, type) {
  const candidates = bones.filter((bone) => matchesSide(bone.name, side));
  const score = (bone) => {
    const name = compactName(bone.name);
    if (type === "upper") return Number(name.includes("upleg") || name.includes("thigh"));
    if (type === "lower") return Number((name.includes("leg") || name.includes("calf") || name.includes("shin")) && !name.includes("upleg") && !name.includes("foot"));
    if (type === "foot") return Number((name.includes("foot") || name.includes("ankle")) && !name.includes("toe") && !name.includes("ball"));
    return Number(name.includes("toe") || name.includes("ball") && !name.includes("leaf"));
  };
  return candidates.map((bone) => ({ bone, score: score(bone) })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score)[0]?.bone ?? null;
}
function matchesSide(name, side) {
  const lower = name.toLowerCase();
  const compact = compactName(name);
  if (side === "left") return compact.includes("left") || lower.includes("_l") || lower.includes(".l") || lower.includes(" l");
  return compact.includes("right") || lower.includes("_r") || lower.includes(".r") || lower.includes(" r");
}
function compactName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ../hh-hang/src/plugins/foot-ik/internal/footPhase.ts
var tmpFoot = new Vector34();
var tmpToe = new Vector34();
var tmpFootRotation = new Quaternion3();
var tmpModelRotation = new Quaternion3();
function createFootPhaseRuntimeState() {
  return {
    planted: false,
    progress: 0,
    timeToLand: Infinity,
    nextLanding: null
  };
}
function createFootPhaseOptions(options = {}) {
  return {
    sampleCount: Math.max(16, Math.round(options.footPhaseSampleCount ?? 96)),
    groundThreshold: Math.max(0, options.footPhaseGroundThreshold ?? 5),
    minContactRatio: MathUtils2.clamp(options.footPhaseMinContactRatio ?? 0.04, 0, 1),
    speedSlack: Math.max(0, options.footPhaseSpeedSlack ?? 1.35)
  };
}
function buildFootPhaseDatabase(model, clips, legs, options, isLocomotionClip) {
  const phaseClips = /* @__PURE__ */ new Map();
  if (!model || !clips.length || !isReadyLeg(legs.left) || !isReadyLeg(legs.right)) return phaseClips;
  const bones = collectBones(model);
  const savedPoses = bones.map((bone) => ({
    bone,
    position: bone.position.clone(),
    quaternion: bone.quaternion.clone(),
    scale: bone.scale.clone()
  }));
  const savedModelMatrixNeedsUpdate = model.matrixWorldNeedsUpdate;
  const mixer = new AnimationMixer(model);
  try {
    for (const clip of clips) {
      if (!shouldAnalyzeFootPhaseClip(clip, isLocomotionClip)) continue;
      phaseClips.set(clip.name, sampleFootPhaseClip(model, mixer, clip, legs, options));
    }
  } finally {
    mixer.stopAllAction();
    mixer.uncacheRoot(model);
    for (const pose of savedPoses) {
      pose.bone.position.copy(pose.position);
      pose.bone.quaternion.copy(pose.quaternion);
      pose.bone.scale.copy(pose.scale);
    }
    model.matrixWorldNeedsUpdate = savedModelMatrixNeedsUpdate;
    model.updateMatrixWorld(true);
  }
  return phaseClips;
}
function sampleFootPhaseRuntime(phaseClip, normalizedTime, duration) {
  if (!phaseClip) {
    return {
      left: createFootPhaseRuntimeState(),
      right: createFootPhaseRuntimeState()
    };
  }
  return {
    left: sampleFootPhaseRuntimeSide(phaseClip.left, normalizedTime, duration),
    right: sampleFootPhaseRuntimeSide(phaseClip.right, normalizedTime, duration)
  };
}
function shouldAnalyzeFootPhaseClip(clip, isLocomotionClip) {
  return clip.duration > 0 && isLocomotionClip(clip.name);
}
function sampleFootPhaseClip(model, mixer, clip, legs, options) {
  if (!isReadyLeg(legs.left) || !isReadyLeg(legs.right)) {
    throw new Error("[FootIK] \u811A\u6B65\u76F8\u4F4D\u91C7\u6837\u65F6\u817F\u90E8\u9AA8\u9ABC\u4E0D\u5B8C\u6574\u3002");
  }
  const action = mixer.clipAction(clip);
  action.reset();
  action.setEffectiveWeight(1);
  action.play();
  const samples = [];
  for (let i = 0; i < options.sampleCount; i++) {
    const normalizedTime = i / options.sampleCount;
    mixer.setTime(normalizedTime * clip.duration);
    model.updateMatrixWorld(true);
    samples.push({
      time: normalizedTime,
      left: getFootPhaseSample(model, legs.left),
      right: getFootPhaseSample(model, legs.right)
    });
  }
  action.stop();
  return {
    name: clip.name,
    duration: clip.duration,
    left: analyzeFootPhaseSide(samples, "left", options),
    right: analyzeFootPhaseSide(samples, "right", options)
  };
}
function getFootPhaseSample(model, leg) {
  const foot = leg.foot.getWorldPosition(tmpFoot);
  const toeY = leg.toe ? leg.toe.getWorldPosition(tmpToe).y : foot.y;
  const contactY = Math.min(foot.y, toeY);
  const footWorldRotation = leg.foot.getWorldQuaternion(tmpFootRotation);
  const localRotation = model.getWorldQuaternion(tmpModelRotation).invert().multiply(footWorldRotation).clone();
  model.worldToLocal(foot);
  return {
    y: contactY,
    x: foot.x,
    localY: foot.y,
    z: foot.z,
    localRotation
  };
}
function sampleFootPhasePose(sideData, normalizedTime, position, rotation) {
  const poses = sideData.poses;
  if (poses.length === 0) return false;
  const wrappedTime = (normalizedTime % 1 + 1) % 1;
  const sample = wrappedTime * poses.length;
  const fromIndex = Math.floor(sample) % poses.length;
  const toIndex = (fromIndex + 1) % poses.length;
  const alpha = sample - Math.floor(sample);
  position.lerpVectors(
    poses[fromIndex].localPosition,
    poses[toIndex].localPosition,
    alpha
  );
  rotation.copy(poses[fromIndex].localRotation).slerp(poses[toIndex].localRotation, alpha);
  return true;
}
function analyzeFootPhaseSide(samples, side, options) {
  let minY = Infinity;
  for (const sample of samples) minY = Math.min(minY, sample[side].y);
  const speeds = calculateFootPhaseSpeeds(samples, side);
  const heightContacts = samples.map((sample) => sample[side].y <= minY + options.groundThreshold);
  const speedContacts = filterFootPhaseBySpeed(heightContacts, speeds, options.speedSlack);
  const contacts = keepMainFootContactRun(filterShortFootContacts(speedContacts, options.minContactRatio));
  const land = [];
  const lift = [];
  const landings = [];
  const poses = samples.map((sample) => {
    const point = sample[side];
    return {
      localPosition: new Vector34(point.x, point.localY, point.z),
      localRotation: point.localRotation.clone()
    };
  });
  for (let i = 0; i < contacts.length; i++) {
    const prev = contacts[(i - 1 + contacts.length) % contacts.length];
    const current = contacts[i];
    if (!prev && current) {
      land.push(samples[i].time);
      const point = samples[i][side];
      landings.push({
        phase: samples[i].time,
        localPosition: new Vector34(point.x, point.localY, point.z),
        localRotation: point.localRotation.clone()
      });
    }
    if (prev && !current) lift.push(samples[i].time);
  }
  return {
    contacts,
    land,
    lift,
    landings,
    poses
  };
}
function calculateFootPhaseSpeeds(samples, side) {
  const speeds = [];
  for (let i = 0; i < samples.length; i++) {
    const prev = samples[(i - 1 + samples.length) % samples.length][side];
    const next = samples[(i + 1) % samples.length][side];
    speeds.push(Math.hypot(next.x - prev.x, next.z - prev.z));
  }
  return speeds;
}
function filterFootPhaseBySpeed(contacts, speeds, speedSlack) {
  const contactSpeeds = speeds.filter((_speed, index) => contacts[index]).sort((a, b) => a - b);
  if (contactSpeeds.length === 0) return contacts.slice();
  const median = contactSpeeds[Math.floor(contactSpeeds.length * 0.5)];
  const p75 = contactSpeeds[Math.floor(contactSpeeds.length * 0.75)];
  const threshold = Math.max(median, p75) * speedSlack;
  return contacts.map((contact, index) => contact && speeds[index] <= threshold);
}
function filterShortFootContacts(contacts, minContactRatio) {
  const minLength = Math.max(1, Math.round(contacts.length * minContactRatio));
  const filtered = contacts.slice();
  for (const run of getCircularContactRuns(contacts, true)) {
    if (run.indices.length >= minLength) continue;
    for (const index of run.indices) filtered[index] = false;
  }
  return filtered;
}
function keepMainFootContactRun(contacts) {
  const runs = getCircularContactRuns(contacts, true);
  if (runs.length <= 1) return contacts.slice();
  const mainRun = runs.sort((a, b) => b.indices.length - a.indices.length)[0];
  const filtered = new Array(contacts.length).fill(false);
  for (const index of mainRun.indices) filtered[index] = true;
  return filtered;
}
function getCircularContactRuns(values, targetValue) {
  const runs = [];
  if (values.length === 0) return runs;
  const visited = new Array(values.length).fill(false);
  const start = values.findIndex((value, index) => {
    const prev = values[(index - 1 + values.length) % values.length];
    return value === targetValue && prev !== targetValue;
  });
  if (start < 0) {
    return values[0] === targetValue ? [{ indices: values.map((_value, index) => index) }] : runs;
  }
  for (let offset = 0; offset < values.length; offset++) {
    const index = (start + offset) % values.length;
    if (visited[index] || values[index] !== targetValue) continue;
    const indices = [];
    let cursor = index;
    while (!visited[cursor] && values[cursor] === targetValue) {
      visited[cursor] = true;
      indices.push(cursor);
      cursor = (cursor + 1) % values.length;
      if (cursor === index) break;
    }
    runs.push({ indices });
  }
  return runs;
}
function sampleFootPhaseRuntimeSide(sideData, normalizedTime, duration) {
  const sampleCount = sideData.contacts.length;
  if (sampleCount === 0) return createFootPhaseRuntimeState();
  const sampleIndex = Math.floor(normalizedTime * sampleCount) % sampleCount;
  const planted = !!sideData.contacts[sampleIndex];
  const nextLanding = nextLandingEvent(sideData.landings, normalizedTime);
  const nextLand = nextLanding?.phase ?? null;
  const prevLift = prevPhaseEvent(sideData.lift, normalizedTime);
  const swingSpan = wrapPhaseDistance(prevLift, nextLand) || 1;
  const swingDone = wrapPhaseDistance(prevLift, normalizedTime);
  return {
    planted,
    progress: planted ? 1 : MathUtils2.clamp(swingDone / swingSpan, 0, 1),
    timeToLand: nextLand === null ? Infinity : wrapPhaseDistance(normalizedTime, nextLand) * duration,
    nextLanding
  };
}
function nextLandingEvent(events, normalizedTime) {
  if (!events.length) return null;
  let best = events[0];
  let bestDistance = Infinity;
  for (const event of events) {
    const distance = wrapPhaseDistance(normalizedTime, event.phase);
    if (distance < bestDistance) {
      best = event;
      bestDistance = distance;
    }
  }
  return best;
}
function prevPhaseEvent(events, normalizedTime) {
  if (!events.length) return normalizedTime;
  let best = events[0];
  let bestDistance = Infinity;
  for (const eventTime of events) {
    const distance = wrapPhaseDistance(eventTime, normalizedTime);
    if (distance < bestDistance) {
      best = eventTime;
      bestDistance = distance;
    }
  }
  return best;
}
function wrapPhaseDistance(from, to) {
  if (from === null || to === null) return 0;
  return (to - from + 1) % 1;
}

// ../hh-hang/src/plugins/foot-ik/internal/debug.ts
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Line,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry
} from "three";
var FOOT_IK_SIDES = ["left", "right"];
var IK_MARKER_RADIUS = 3;
var HIT_MARKER_RADIUS = 2.5;
var SAMPLE_ORIGIN_RADIUS = 3;
var SAMPLE_HIT_RADIUS = 2.5;
var DEBUG_IK_PLANTED_COLOR = 2278750;
var DEBUG_IK_PENETRATION_COLOR = 3900150;
var DEBUG_IK_NOT_APPLIED_COLOR = 15680580;
var DEBUG_SOLID_COLOR = 3003583;
var DEBUG_HIT_COLOR = 16777062;
var DEBUG_HIT_OVER_RAISE_LIMIT_COLOR = 16724787;
var DEBUG_RAISE_LIMIT_COLOR = 6333946;
var DEBUG_RAISE_LIMIT_EXCEEDED_COLOR = 16724787;
var DEBUG_PREDICTIVE_TRACKING_COLOR = 3718648;
var DEBUG_PREDICTIVE_ACTIVE_COLOR = 16096779;
var DEBUG_PREDICTIVE_VALID_COLOR = 16638023;
var DEBUG_PREDICTIVE_INVALID_COLOR = 15680580;
var PREDICTIVE_CANDIDATE_RADIUS = 2;
var RAISE_LIMIT_POINT_COUNT = 16;
var SOLE_PERIMETER = [0, 1, 3, 2];
var PREDICTIVE_TRAJECTORY_POINT_COUNT = 13;
function createDebugLineGeometry(pointCount) {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(pointCount * 3), 3)
  );
  return geometry;
}
function writeDebugLinePositions(geometry, points, count = points.length) {
  const attribute = geometry.getAttribute("position");
  if (!attribute) return;
  const array = attribute.array;
  const pointCount = Math.min(count, array.length / 3 | 0);
  for (let i = 0; i < pointCount; i++) {
    const point = points[i];
    const offset = i * 3;
    array[offset] = point.x;
    array[offset + 1] = point.y;
    array[offset + 2] = point.z;
  }
  attribute.needsUpdate = true;
}
function writeDebugLinePair(geometry, from, to) {
  const attribute = geometry.getAttribute("position");
  if (!attribute || attribute.array.length < 6) return;
  const array = attribute.array;
  array[0] = from.x;
  array[1] = from.y;
  array[2] = from.z;
  array[3] = to.x;
  array[4] = to.y;
  array[5] = to.z;
  attribute.needsUpdate = true;
}
function getPredictiveModeColor(leg) {
  if (leg.predictive.mode === "active" || leg.predictive.mode === "planted") {
    return DEBUG_PREDICTIVE_ACTIVE_COLOR;
  }
  return DEBUG_PREDICTIVE_TRACKING_COLOR;
}
function setHitMarkerColor(mesh, overRaiseLimit) {
  const material = mesh.material;
  if (Array.isArray(material)) return;
  material.color.setHex(
    overRaiseLimit ? DEBUG_HIT_OVER_RAISE_LIMIT_COLOR : DEBUG_HIT_COLOR
  );
}
function setIKMarkerColor(mesh, leg, applied) {
  const material = mesh.material;
  if (Array.isArray(material)) return;
  let color = DEBUG_IK_NOT_APPLIED_COLOR;
  if (leg.predictive.mode !== "none" && Number.isFinite(leg.predictive.score)) {
    color = getPredictiveModeColor(leg);
  } else if (applied) {
    if (leg.planted) color = DEBUG_IK_PLANTED_COLOR;
    else if (leg.movePenetrating) color = DEBUG_IK_PENETRATION_COLOR;
    else color = DEBUG_IK_PLANTED_COLOR;
  }
  material.color.setHex(color);
}
function createDebugObjects(scene, legs, enabled) {
  if (!enabled || !scene) return;
  let ikGeometry = null;
  let hitGeometry = null;
  let sampleOriginGeometry = null;
  let sampleHitGeometry = null;
  let predictiveCandidateGeometry = null;
  for (const side of FOOT_IK_SIDES) {
    const leg = legs[side];
    if (!leg.marker) {
      ikGeometry ?? (ikGeometry = new SphereGeometry(IK_MARKER_RADIUS, 10, 8));
      leg.marker = new Mesh(
        ikGeometry,
        new MeshBasicMaterial({
          color: DEBUG_IK_NOT_APPLIED_COLOR,
          depthTest: false,
          transparent: true,
          opacity: 0.95
        })
      );
      leg.marker.renderOrder = 30;
      leg.marker.frustumCulled = false;
      scene.add(leg.marker);
    }
    if (!leg.hitMarker) {
      hitGeometry ?? (hitGeometry = new SphereGeometry(HIT_MARKER_RADIUS, 10, 8));
      leg.hitMarker = new Mesh(
        hitGeometry,
        new MeshBasicMaterial({
          color: DEBUG_HIT_COLOR,
          wireframe: true,
          depthTest: false,
          transparent: true,
          opacity: 0.9
        })
      );
      leg.hitMarker.renderOrder = 29;
      leg.hitMarker.frustumCulled = false;
      scene.add(leg.hitMarker);
    }
    if (!leg.rayLine) {
      leg.rayLine = new Line(
        createDebugLineGeometry(2),
        new LineBasicMaterial({
          color: DEBUG_SOLID_COLOR,
          depthTest: false,
          transparent: true,
          opacity: 0.85
        })
      );
      leg.rayLine.renderOrder = 28;
      leg.rayLine.frustumCulled = false;
      scene.add(leg.rayLine);
    }
    if (!leg.raiseLimitLine) {
      leg.raiseLimitLine = new LineSegments(
        createDebugLineGeometry(RAISE_LIMIT_POINT_COUNT),
        new LineBasicMaterial({
          color: DEBUG_RAISE_LIMIT_COLOR,
          depthTest: false,
          transparent: true,
          opacity: 0.75
        })
      );
      leg.raiseLimitLine.renderOrder = 24;
      leg.raiseLimitLine.frustumCulled = false;
      scene.add(leg.raiseLimitLine);
    }
    if (!leg.predictiveLine) {
      leg.predictiveLine = new Line(
        createDebugLineGeometry(PREDICTIVE_TRAJECTORY_POINT_COUNT),
        new LineBasicMaterial({
          color: DEBUG_PREDICTIVE_TRACKING_COLOR,
          depthTest: false,
          transparent: true,
          opacity: 0.95
        })
      );
      leg.predictiveLine.visible = false;
      leg.predictiveLine.renderOrder = 32;
      leg.predictiveLine.frustumCulled = false;
      scene.add(leg.predictiveLine);
    }
    if (leg.predictiveCandidateMarkers.length === 0) {
      predictiveCandidateGeometry ?? (predictiveCandidateGeometry = new SphereGeometry(PREDICTIVE_CANDIDATE_RADIUS, 10, 8));
      for (const _candidate of leg.predictive.debugCandidates) {
        const marker = new Mesh(
          predictiveCandidateGeometry,
          new MeshBasicMaterial({
            color: DEBUG_PREDICTIVE_INVALID_COLOR,
            wireframe: true,
            depthTest: false,
            transparent: true,
            opacity: 0.9
          })
        );
        marker.visible = false;
        marker.renderOrder = 31;
        marker.frustumCulled = false;
        leg.predictiveCandidateMarkers.push(marker);
        scene.add(marker);
      }
    }
    if (!leg.predictiveSupportMesh) {
      const supportGeometry = new BufferGeometry();
      supportGeometry.setAttribute("position", new BufferAttribute(new Float32Array(12), 3));
      supportGeometry.setIndex([0, 1, 3, 0, 3, 2]);
      leg.predictiveSupportMesh = new Mesh(
        supportGeometry,
        new MeshBasicMaterial({
          color: DEBUG_PREDICTIVE_TRACKING_COLOR,
          depthTest: false,
          transparent: true,
          opacity: 0.28,
          side: DoubleSide
        })
      );
      leg.predictiveSupportMesh.visible = false;
      leg.predictiveSupportMesh.renderOrder = 22;
      leg.predictiveSupportMesh.frustumCulled = false;
      scene.add(leg.predictiveSupportMesh);
    }
    if (!leg.predictiveSupportOutline) {
      leg.predictiveSupportOutline = new LineLoop(
        createDebugLineGeometry(4),
        new LineBasicMaterial({
          color: DEBUG_PREDICTIVE_TRACKING_COLOR,
          depthTest: false,
          transparent: true,
          opacity: 0.95
        })
      );
      leg.predictiveSupportOutline.visible = false;
      leg.predictiveSupportOutline.renderOrder = 23;
      leg.predictiveSupportOutline.frustumCulled = false;
      scene.add(leg.predictiveSupportOutline);
    }
    for (const sample of leg.soleSamples) {
      if (!sample.footMarker) {
        sampleOriginGeometry ?? (sampleOriginGeometry = new SphereGeometry(SAMPLE_ORIGIN_RADIUS, 10, 8));
        sample.footMarker = new Mesh(
          sampleOriginGeometry,
          new MeshBasicMaterial({
            color: DEBUG_SOLID_COLOR,
            depthTest: false,
            transparent: true,
            opacity: 0.85
          })
        );
        sample.footMarker.renderOrder = 27;
        sample.footMarker.frustumCulled = false;
        scene.add(sample.footMarker);
      }
      if (!sample.marker) {
        sampleHitGeometry ?? (sampleHitGeometry = new SphereGeometry(SAMPLE_HIT_RADIUS, 10, 8));
        sample.marker = new Mesh(
          sampleHitGeometry,
          new MeshBasicMaterial({
            color: DEBUG_HIT_COLOR,
            wireframe: true,
            depthTest: false,
            transparent: true,
            opacity: 0.8
          })
        );
        sample.marker.renderOrder = 26;
        sample.marker.frustumCulled = false;
        scene.add(sample.marker);
      }
      if (!sample.rayLine) {
        sample.rayLine = new Line(
          createDebugLineGeometry(2),
          new LineBasicMaterial({
            color: DEBUG_SOLID_COLOR,
            transparent: true,
            opacity: 0.45,
            depthTest: false
          })
        );
        sample.rayLine.renderOrder = 25;
        sample.rayLine.frustumCulled = false;
        scene.add(sample.rayLine);
      }
    }
  }
}
function updateFootDebug(enabled, leg, hitPoint, scale = 1, maxFootRaise = 0) {
  if (!enabled || !leg.marker || !leg.rayLine) return;
  const s = Math.max(1e-4, scale);
  const bestSample = leg.soleSamples[leg.bestGroundSampleIndex];
  const bestHitOverRaiseLimit = !!bestSample?.hasHit && hitPoint.y - bestSample.point.y > maxFootRaise;
  const ikApplied = leg.weight > 1e-3;
  leg.marker.visible = true;
  leg.marker.position.copy(leg.smoothedTarget);
  leg.marker.scale.setScalar(s);
  setIKMarkerColor(leg.marker, leg, ikApplied);
  if (leg.hitMarker) {
    leg.hitMarker.visible = true;
    leg.hitMarker.position.copy(hitPoint);
    leg.hitMarker.scale.setScalar(s);
    setHitMarkerColor(leg.hitMarker, bestHitOverRaiseLimit);
  }
  leg.rayLine.visible = ikApplied;
  if (ikApplied) {
    writeDebugLinePair(leg.rayLine.geometry, hitPoint, leg.smoothedTarget);
  }
  updatePredictiveDebug(leg, s);
  if (!showReactiveSoleDebug(leg)) {
    setReactiveSoleDebugVisible(leg, false);
    return;
  }
  updateRaiseLimitLine(leg, maxFootRaise);
  for (const sample of leg.soleSamples) {
    if (sample.footMarker) {
      sample.footMarker.visible = true;
      sample.footMarker.position.copy(sample.point);
      sample.footMarker.scale.setScalar(s);
    }
    if (sample.marker) {
      sample.marker.visible = sample.hasHit;
      if (sample.hasHit) {
        sample.marker.position.copy(sample.hitPoint);
        sample.marker.scale.setScalar(s);
        setHitMarkerColor(
          sample.marker,
          sample.hitPoint.y - sample.point.y > maxFootRaise
        );
      }
    }
    if (sample.rayLine) {
      sample.rayLine.visible = sample.hasHit;
      if (sample.hasHit) {
        writeDebugLinePair(sample.rayLine.geometry, sample.point, sample.hitPoint);
      }
    }
  }
}
function showReactiveSoleDebug(leg) {
  return leg.predictive.mode !== "active";
}
function setReactiveSoleDebugVisible(leg, visible) {
  if (leg.raiseLimitLine) leg.raiseLimitLine.visible = visible;
  for (const sample of leg.soleSamples) {
    if (sample.footMarker) sample.footMarker.visible = visible;
    if (sample.marker) sample.marker.visible = visible && sample.hasHit;
    if (sample.rayLine) sample.rayLine.visible = visible && sample.hasHit;
  }
}
function updatePredictiveDebug(leg, scale) {
  const state = leg.predictive;
  const showTrajectory = state.mode === "active";
  const showCandidates = state.mode === "tracking";
  if (leg.predictiveLine) {
    leg.predictiveLine.visible = showTrajectory && state.debugTrajectoryVisible;
    if (leg.predictiveLine.visible) {
      writeDebugLinePositions(
        leg.predictiveLine.geometry,
        state.debugTrajectory
      );
      const material = leg.predictiveLine.material;
      if (!Array.isArray(material)) {
        material.color.setHex(getPredictiveModeColor(leg));
      }
    }
  }
  for (let i = 0; i < leg.predictiveCandidateMarkers.length; i++) {
    const marker = leg.predictiveCandidateMarkers[i];
    const candidate = state.debugCandidates[i];
    marker.visible = showCandidates && !!candidate?.evaluated;
    if (!marker.visible || !candidate) continue;
    marker.position.copy(candidate.point);
    marker.scale.setScalar(scale * (candidate.selected ? 1.25 : 0.8));
    const material = marker.material;
    if (Array.isArray(material)) continue;
    const debugMaterial = material;
    debugMaterial.wireframe = !candidate.selected;
    debugMaterial.color.setHex(
      candidate.selected ? candidate.valid ? getPredictiveModeColor(leg) : DEBUG_PREDICTIVE_INVALID_COLOR : candidate.valid ? DEBUG_PREDICTIVE_VALID_COLOR : DEBUG_PREDICTIVE_INVALID_COLOR
    );
  }
  const landing = state.debugCandidates[0];
  const planeColor = landing?.valid ? getPredictiveModeColor(leg) : DEBUG_PREDICTIVE_INVALID_COLOR;
  updatePredictiveSupportPlane(leg, planeColor);
}
function updatePredictiveSupportPlane(leg, color) {
  const state = leg.predictive;
  const visible = state.debugSupportVisible && (state.mode === "tracking" || state.mode === "active") && state.debugSupportCorners.length >= 4;
  if (leg.predictiveSupportMesh) {
    leg.predictiveSupportMesh.visible = visible;
    if (visible) {
      const positions = leg.predictiveSupportMesh.geometry.getAttribute("position");
      for (let i = 0; i < 4; i++) {
        const corner = state.debugSupportCorners[i];
        positions.setXYZ(i, corner.x, corner.y, corner.z);
      }
      positions.needsUpdate = true;
      const material = leg.predictiveSupportMesh.material;
      if (!Array.isArray(material)) {
        material.color.setHex(color);
      }
    }
  }
  if (leg.predictiveSupportOutline) {
    leg.predictiveSupportOutline.visible = visible;
    if (visible) {
      const attribute = leg.predictiveSupportOutline.geometry.getAttribute("position");
      const array = attribute.array;
      for (let i = 0; i < SOLE_PERIMETER.length; i++) {
        const corner = state.debugSupportCorners[SOLE_PERIMETER[i]];
        const offset = i * 3;
        array[offset] = corner.x;
        array[offset + 1] = corner.y;
        array[offset + 2] = corner.z;
      }
      attribute.needsUpdate = true;
      const material = leg.predictiveSupportOutline.material;
      if (!Array.isArray(material)) {
        material.color.setHex(color);
      }
    }
  }
}
function setDebugVisible(legs, visible) {
  for (const side of FOOT_IK_SIDES) {
    const leg = legs[side];
    if (leg.marker) leg.marker.visible = visible;
    if (leg.hitMarker) leg.hitMarker.visible = visible;
    if (leg.rayLine) leg.rayLine.visible = visible && leg.weight > 1e-3;
    if (leg.predictiveLine) {
      leg.predictiveLine.visible = visible && leg.predictive.debugTrajectoryVisible && leg.predictive.mode === "active";
    }
    for (let i = 0; i < leg.predictiveCandidateMarkers.length; i++) {
      const candidate = leg.predictive.debugCandidates[i];
      leg.predictiveCandidateMarkers[i].visible = visible && !!candidate?.evaluated && leg.predictive.mode === "tracking";
    }
    if (leg.predictiveSupportMesh) {
      leg.predictiveSupportMesh.visible = visible && leg.predictive.debugSupportVisible && (leg.predictive.mode === "tracking" || leg.predictive.mode === "active");
    }
    if (leg.predictiveSupportOutline) {
      leg.predictiveSupportOutline.visible = visible && leg.predictive.debugSupportVisible && (leg.predictive.mode === "tracking" || leg.predictive.mode === "active");
    }
    setReactiveSoleDebugVisible(leg, visible && showReactiveSoleDebug(leg));
  }
}
function getFootPhaseDebugText(state, clips, side) {
  const sideState = state[side];
  const clipName = state.clipName || "none";
  const dataReady = clips.has(clipName);
  if (!dataReady) return `${clipName}: no phase`;
  const phase = sideState.planted ? "plant" : "swing";
  const progress = Number.isFinite(sideState.progress) ? `${Math.round(sideState.progress * 100)}%` : "--";
  return `${clipName}: ${phase} ${progress}`;
}
function disposeDebugObjects(legs) {
  const geometries = /* @__PURE__ */ new Set();
  const materials = /* @__PURE__ */ new Set();
  for (const side of FOOT_IK_SIDES) {
    const leg = legs[side];
    collectDebugObject(leg.marker, geometries, materials);
    collectDebugObject(leg.hitMarker, geometries, materials);
    collectDebugObject(leg.rayLine, geometries, materials);
    collectDebugObject(leg.raiseLimitLine, geometries, materials);
    collectDebugObject(leg.predictiveLine, geometries, materials);
    collectDebugObject(leg.predictiveSupportMesh, geometries, materials);
    collectDebugObject(leg.predictiveSupportOutline, geometries, materials);
    for (const marker of leg.predictiveCandidateMarkers) {
      collectDebugObject(marker, geometries, materials);
    }
    leg.marker = null;
    leg.hitMarker = null;
    leg.rayLine = null;
    leg.raiseLimitLine = null;
    leg.predictiveLine = null;
    leg.predictiveSupportMesh = null;
    leg.predictiveSupportOutline = null;
    leg.predictiveCandidateMarkers.length = 0;
    for (const sample of leg.soleSamples) {
      collectDebugObject(sample.marker, geometries, materials);
      collectDebugObject(sample.rayLine, geometries, materials);
      collectDebugObject(sample.footMarker, geometries, materials);
      sample.marker = null;
      sample.rayLine = null;
      sample.footMarker = null;
    }
  }
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}
function updateRaiseLimitLine(leg, maxFootRaise) {
  if (!leg.raiseLimitLine || leg.soleSamples.length < 4) return;
  const attribute = leg.raiseLimitLine.geometry.getAttribute("position");
  if (!attribute || attribute.array.length < RAISE_LIMIT_POINT_COUNT * 3) return;
  const array = attribute.array;
  let cursor = 0;
  let exceeded = false;
  const writePoint = (x, y, z) => {
    array[cursor++] = x;
    array[cursor++] = y;
    array[cursor++] = z;
  };
  for (const sample of leg.soleSamples) {
    writePoint(sample.point.x, sample.point.y, sample.point.z);
    writePoint(sample.point.x, sample.point.y + maxFootRaise, sample.point.z);
    exceeded || (exceeded = sample.hasHit && sample.hitPoint.y - sample.point.y > maxFootRaise);
  }
  for (let i = 0; i < SOLE_PERIMETER.length; i++) {
    const from = leg.soleSamples[SOLE_PERIMETER[i]].point;
    const to = leg.soleSamples[SOLE_PERIMETER[(i + 1) % SOLE_PERIMETER.length]].point;
    writePoint(from.x, from.y + maxFootRaise, from.z);
    writePoint(to.x, to.y + maxFootRaise, to.z);
  }
  attribute.needsUpdate = true;
  leg.raiseLimitLine.visible = true;
  const material = leg.raiseLimitLine.material;
  if (!Array.isArray(material)) {
    material.color.setHex(
      exceeded ? DEBUG_RAISE_LIMIT_EXCEEDED_COLOR : DEBUG_RAISE_LIMIT_COLOR
    );
  }
}
function collectDebugObject(object, geometries, materials) {
  if (!object) return;
  object.parent?.remove(object);
  geometries.add(object.geometry);
  const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
  for (const material of objectMaterials) materials.add(material);
}

// ../hh-hang/src/plugins/foot-ik/internal/predictiveTrajectory.ts
import { MathUtils as MathUtils3 } from "three";
var PREDICTION_MIN_TERRAIN_SAMPLE_COUNT = 4;
var PREDICTION_MAX_TERRAIN_SAMPLE_COUNT = 12;
var PREDICTION_TERRAIN_SAMPLE_SPACING = 10;
var PREDICTION_ROTATION_WARP_START = 0.55;
function getPredictiveClearanceShape(progress) {
  const t = MathUtils3.clamp(progress, 0, 1);
  return 4 * t * (1 - t);
}
function getPredictiveLocalProgress(progress, startProgress) {
  const remainingProgress = Math.max(1e-6, 1 - startProgress);
  return MathUtils3.clamp((progress - startProgress) / remainingProgress, 0, 1);
}
function solvePredictiveClearance(samples, margin, maxClearance, sampleCount = samples.length) {
  let requiredClearance = 0;
  let obstructed = false;
  const count = Math.min(sampleCount, samples.length);
  for (let i = 0; i < count; i++) {
    const sample = samples[i];
    if (sample.requiredLift <= 0) continue;
    const shape = getPredictiveClearanceShape(sample.progress);
    if (shape <= 1e-6) return null;
    obstructed = true;
    requiredClearance = Math.max(
      requiredClearance,
      sample.requiredLift / shape
    );
  }
  if (!obstructed) return 0;
  const clearance = requiredClearance + Math.max(0, margin);
  return clearance <= Math.max(0, maxClearance) ? clearance : null;
}
function planPredictiveFootTrajectory(ctx, leg, phase, footWorld, trajectoryStart, trajectoryStartProgress, candidate) {
  const phaseClip = ctx.footPhaseClips.get(ctx.clipName);
  if (!phaseClip || phaseClip.duration <= 0) return null;
  const sideData = phaseClip[leg.side];
  const scratch = ctx.scratch;
  if (!sampleFootPhasePose(
    sideData,
    ctx.normalizedTime,
    scratch.currentLocalPosition,
    scratch.currentLocalRotation
  )) {
    return null;
  }
  const currentSampleWorld = scratch.currentLocalPosition.applyMatrix4(
    ctx.model.matrixWorld
  );
  scratch.animationBias.subVectors(footWorld, currentSampleWorld);
  scratch.landingCorrection.subVectors(
    candidate.target,
    leg.predictive.animatedLanding
  );
  const currentTrajectoryProgress = getPredictiveLocalProgress(
    leg.predictive.trajectoryProgress,
    trajectoryStartProgress
  );
  const startWarpAlpha = MathUtils3.smoothstep(currentTrajectoryProgress, 0, 1);
  scratch.continuityOffset.subVectors(trajectoryStart, footWorld).addScaledVector(scratch.landingCorrection, -startWarpAlpha);
  ctx.model.getWorldQuaternion(scratch.modelWorldRotation);
  ctx.getConstrainedFootAlign(
    candidate.normal,
    ctx.footAlignWeight,
    scratch.q1
  );
  scratch.landingRotation.copy(scratch.q1).multiply(leg.predictive.animatedLandingRotation);
  leg.foot.getWorldScale(scratch.worldScale);
  const remainingPhase = phase.timeToLand / phaseClip.duration;
  const samplePath = (progress, position, rotation) => {
    const t = MathUtils3.clamp(progress, 0, 1);
    const normalizedTime = ctx.normalizedTime + remainingPhase * t;
    if (!sampleFootPhasePose(
      sideData,
      normalizedTime,
      scratch.localPosition,
      scratch.localRotation
    )) {
      return false;
    }
    const trajectoryProgress = MathUtils3.lerp(currentTrajectoryProgress, 1, t);
    const warpAlpha = MathUtils3.smoothstep(trajectoryProgress, 0, 1);
    position.copy(scratch.localPosition).applyMatrix4(ctx.model.matrixWorld).addScaledVector(
      ctx.predictionVelocity,
      Math.min(phase.timeToLand * t, ctx.predictionHorizon)
    ).addScaledVector(scratch.animationBias, 1 - t).addScaledVector(scratch.continuityOffset, 1 - t).addScaledVector(scratch.landingCorrection, warpAlpha);
    rotation.copy(scratch.modelWorldRotation).multiply(scratch.localRotation).slerp(
      scratch.landingRotation,
      MathUtils3.smoothstep(
        trajectoryProgress,
        PREDICTION_ROTATION_WARP_START,
        1
      )
    );
    return true;
  };
  if (!samplePath(0, scratch.pathPosition, scratch.pathRotation)) return null;
  let startSupportY = -Infinity;
  const startRayOriginY = Math.max(scratch.pathPosition.y, candidate.target.y) + ctx.sampleRayOriginY;
  for (const sample of leg.soleSamples) {
    scratch.soleOffset.copy(sample.local).multiply(scratch.worldScale).applyQuaternion(scratch.pathRotation);
    scratch.solePoint.copy(scratch.pathPosition).add(scratch.soleOffset);
    const hit = ctx.castGroundFrom(
      scratch.solePoint.x,
      startRayOriginY,
      scratch.solePoint.z
    );
    if (hit) startSupportY = Math.max(startSupportY, hit.point.y);
  }
  const currentSupport = ctx.castCapsuleGround();
  if (!Number.isFinite(startSupportY)) {
    startSupportY = currentSupport?.point.y ?? -Infinity;
  }
  if (!Number.isFinite(startSupportY)) startSupportY = candidate.point.y;
  const terrainEpsilon = Math.max(
    ctx.snapEpsilon,
    PREDICTION_DEMAND_ENTER * ctx.appliedScale
  );
  const horizontalDistance = Math.hypot(
    candidate.target.x - scratch.pathPosition.x,
    candidate.target.z - scratch.pathPosition.z
  );
  const sampleSpacing = Math.max(
    ctx.snapEpsilon,
    PREDICTION_TERRAIN_SAMPLE_SPACING * ctx.appliedScale
  );
  const terrainSampleCount = MathUtils3.clamp(
    Math.ceil(horizontalDistance / sampleSpacing),
    PREDICTION_MIN_TERRAIN_SAMPLE_COUNT,
    PREDICTION_MAX_TERRAIN_SAMPLE_COUNT
  );
  let maxPlaneLift = 0;
  scratch.clearanceSampleCount = 0;
  for (let i = 1; i <= terrainSampleCount; i++) {
    const progress = i / (terrainSampleCount + 1);
    if (!samplePath(progress, scratch.pathPosition, scratch.pathRotation)) {
      return null;
    }
    let requiredLift = 0;
    const rayOriginY = Math.max(scratch.pathPosition.y, candidate.target.y) + ctx.sampleRayOriginY;
    for (const sample of leg.soleSamples) {
      scratch.soleOffset.copy(sample.local).multiply(scratch.worldScale).applyQuaternion(scratch.pathRotation);
      scratch.solePoint.copy(scratch.pathPosition).add(scratch.soleOffset);
      const hit = ctx.castGroundFrom(
        scratch.solePoint.x,
        rayOriginY,
        scratch.solePoint.z
      );
      if (!hit) continue;
      const planeLift = getPointPlaneLift(
        currentSupport,
        hit.point,
        startSupportY,
        scratch.v5
      );
      if (planeLift <= terrainEpsilon) continue;
      maxPlaneLift = Math.max(maxPlaneLift, planeLift);
      requiredLift = Math.max(requiredLift, hit.point.y - scratch.solePoint.y);
    }
    const clearanceSample = scratch.clearanceSamples[scratch.clearanceSampleCount++];
    clearanceSample.progress = MathUtils3.lerp(
      currentTrajectoryProgress,
      1,
      progress
    );
    clearanceSample.requiredLift = Math.max(0, requiredLift);
  }
  const clearance = solvePredictiveClearance(
    scratch.clearanceSamples,
    ctx.swingClearance,
    ctx.maxPredictionClearance,
    scratch.clearanceSampleCount
  );
  if (clearance === null) return null;
  const points = scratch.plannedPoints;
  for (let i = 0; i < points.length; i++) {
    const progress = i / (points.length - 1);
    if (!samplePath(progress, points[i], scratch.pathRotation)) return null;
    const trajectoryProgress = MathUtils3.lerp(
      currentTrajectoryProgress,
      1,
      progress
    );
    const carriedClearance = clearance * getPredictiveClearanceShape(currentTrajectoryProgress) * (1 - progress);
    points[i].addScaledVector(
      ctx.up,
      clearance * getPredictiveClearanceShape(trajectoryProgress) - carriedClearance
    );
  }
  return {
    clearance,
    terrainDemand: Math.max(0, maxPlaneLift),
    points
  };
}

// ../hh-hang/src/plugins/foot-ik/FootIK.ts
var FOOT_IK_IGNORED_DYNAMIC_KINDS = ["sphere"];
var PREDICTION_LOCK_PROGRESS = 0.88;
var PREDICTION_RELEASE_PROGRESS = 0.25;
var PREDICTIVE_SWING_CHASE_DAMP = 40;
var PREDICTIVE_SWING_FADE_DAMP = 40;
function createGroundHit() {
  return {
    point: new Vector37(),
    normal: new Vector37(0, 1, 0)
  };
}
function copyGroundHit(source, target) {
  target.point.copy(source.point);
  target.normal.copy(source.normal);
  target.object = source.object;
  return target;
}
var FootIK = class {
  /** 创建 FootIK 插件。 */
  constructor(options = {}) {
    /** 插件名称。 */
    __publicField(this, "name", "foot-ik");
    // 当前挂载的玩家控制器。
    __publicField(this, "player", null);
    // 生命周期与调试开关。
    __publicField(this, "enabled");
    __publicField(this, "disposed", false);
    __publicField(this, "debug");
    // IK 距离、角度和脚掌贴合配置。
    __publicField(this, "maxPelvisDrop", 50);
    __publicField(this, "maxPelvisRaise", 50);
    __publicField(this, "maxFootRaise", 50);
    __publicField(this, "maxFootDrop", 50);
    __publicField(this, "plantedHeightSpeed", Infinity);
    __publicField(this, "penetrationLiftSpeed", Infinity);
    __publicField(this, "straightPoleEnabled", false);
    __publicField(this, "soleHalfWidth", 7);
    __publicField(this, "soleToeExtend", 7);
    __publicField(this, "soleHeelExtend", 3);
    __publicField(this, "soleSkinThickness", 3);
    __publicField(this, "moveLiftThreshold", 0.1);
    __publicField(this, "footPhaseGroundThreshold", 5);
    __publicField(this, "fakeToeExtend", 24);
    __publicField(this, "sampleRayOriginY", 90);
    __publicField(this, "raycastFar", 440);
    __publicField(this, "snapEpsilon", 0.02);
    // 预测落脚开关与搜索、线路和摆动修正配置。
    __publicField(this, "predictivePlacement");
    __publicField(this, "predictionHorizon");
    __publicField(this, "predictionProbeFrames");
    __publicField(this, "predictionSearchRadius", 20);
    __publicField(this, "maxPredictionCorrection", 45);
    __publicField(this, "predictionMinNormalY");
    __publicField(this, "swingClearance", 8);
    __publicField(this, "maxPredictionClearance", 50);
    // 当前距离和速度字段已烘焙进去的 scale；改 scale 时按 ratio 连乘。
    __publicField(this, "appliedScale", 1);
    __publicField(this, "footAlignWeight");
    __publicField(this, "maxFootTilt");
    __publicField(this, "minKneeBend");
    __publicField(this, "maxKneeBend");
    __publicField(this, "pelvisKneeBend");
    // 骨盆垂直补偿。
    __publicField(this, "pelvisOffset", 0);
    __publicField(this, "pelvisOffsetOverride", null);
    // 地面检测与每帧复用的临时对象。
    __publicField(this, "colliderMeshes", []);
    __publicField(this, "groundHit", createGroundHit());
    __publicField(this, "capsuleHit", createGroundHit());
    __publicField(this, "bestGroundHit", createGroundHit());
    __publicField(this, "sampleGroundHits", [
      createGroundHit(),
      createGroundHit(),
      createGroundHit(),
      createGroundHit()
    ]);
    __publicField(this, "sampleGroundHitSlots", [
      null,
      null,
      null,
      null
    ]);
    __publicField(this, "raycaster");
    __publicField(this, "up", new Vector37(0, 1, 0));
    __publicField(this, "tmpV1", new Vector37());
    __publicField(this, "tmpV2", new Vector37());
    __publicField(this, "tmpV3", new Vector37());
    __publicField(this, "tmpV4", new Vector37());
    __publicField(this, "tmpV5", new Vector37());
    __publicField(this, "tmpV6", new Vector37());
    __publicField(this, "tmpV7", new Vector37());
    __publicField(this, "tmpV8", new Vector37());
    __publicField(this, "tmpV9", new Vector37());
    __publicField(this, "tmpV10", new Vector37());
    __publicField(this, "tmpQ1", new Quaternion5());
    __publicField(this, "tmpQ2", new Quaternion5());
    __publicField(this, "tmpQ3", new Quaternion5());
    __publicField(this, "tmpQ4", new Quaternion5());
    // IK 前的动画脚旋转，用于抵消腿链求解对子骨骼产生的被动旋转。
    __publicField(this, "savedFootWorldQ", new Quaternion5());
    // 脚掌贴坡后的旋转，用于二次接触校正时保持已完成的倾斜结果。
    __publicField(this, "savedAlignedFootWorldQ", new Quaternion5());
    // 四元数球面插值使用的单位旋转终点。
    __publicField(this, "identityQ", new Quaternion5());
    // 把碰撞面局部法线转换到世界空间。
    __publicField(this, "normalMatrix", new Matrix32());
    // 双骨骼 IK 解算器跨帧复用的临时对象。
    __publicField(this, "twoBoneIKScratch");
    // 预测落脚搜索和轨迹规划使用的专用临时对象。
    __publicField(this, "predictiveScratch");
    // 胶囊实际位移速度比输入速度更能反映碰撞后的真实运动，用于预测未来根节点位置。
    __publicField(this, "previousCapsulePosition", new Vector37());
    __publicField(this, "predictionVelocity", new Vector37());
    __publicField(this, "hasPreviousCapsulePosition", false);
    // 下一帧动画更新前需要恢复的骨骼及其动画原始姿态。
    __publicField(this, "adjusted", /* @__PURE__ */ new Set());
    __publicField(this, "poseCache", /* @__PURE__ */ new Map());
    // 骨骼绑定和脚步相位配置。
    __publicField(this, "skeletonConfig");
    __publicField(this, "footPhaseOptions");
    // 当前模型生成的脚步相位数据库和运行时状态。
    __publicField(this, "footPhaseClips", /* @__PURE__ */ new Map());
    __publicField(this, "footPhaseState");
    // 当前模型解析出的骨盆与左右腿链。
    __publicField(this, "hips", null);
    __publicField(this, "legs");
    this.enabled = options.enabled ?? true;
    this.debug = options.debug ?? false;
    this.maxPelvisDrop = Math.max(0, options.maxPelvisDrop ?? this.maxPelvisDrop);
    this.maxPelvisRaise = Math.max(0, options.maxPelvisRaise ?? this.maxPelvisRaise);
    this.maxFootRaise = Math.max(0, options.maxFootRaise ?? this.maxFootRaise);
    this.maxFootDrop = Math.max(0, options.maxFootDrop ?? this.maxFootDrop);
    this.plantedHeightSpeed = Math.max(0, options.plantedHeightSpeed ?? this.plantedHeightSpeed);
    this.penetrationLiftSpeed = Math.max(0, options.penetrationLiftSpeed ?? this.penetrationLiftSpeed);
    this.soleHalfWidth = Math.max(0, options.soleHalfWidth ?? this.soleHalfWidth);
    this.soleToeExtend = Math.max(0, options.soleToeExtend ?? this.soleToeExtend);
    this.soleHeelExtend = Math.max(0, options.soleHeelExtend ?? this.soleHeelExtend);
    this.soleSkinThickness = Math.max(0, options.soleSkinThickness ?? this.soleSkinThickness);
    this.moveLiftThreshold = Math.max(0, options.moveLiftThreshold ?? this.moveLiftThreshold);
    this.footPhaseGroundThreshold = Math.max(0, options.footPhaseGroundThreshold ?? this.footPhaseGroundThreshold);
    this.predictionSearchRadius = Math.max(0, options.predictionSearchRadius ?? this.predictionSearchRadius);
    this.maxPredictionCorrection = Math.max(0, options.maxPredictionCorrection ?? this.maxPredictionCorrection);
    this.swingClearance = Math.max(0, options.swingClearance ?? this.swingClearance);
    this.maxPredictionClearance = Math.max(
      0,
      options.maxPredictionClearance ?? this.maxFootRaise
    );
    this.predictivePlacement = options.predictivePlacement ?? false;
    this.predictionHorizon = Math.max(0, options.predictionHorizon ?? 0.45);
    this.predictionProbeFrames = Math.max(0, options.predictionProbeFrames ?? 10);
    this.predictionMinNormalY = MathUtils4.clamp(options.predictionMinNormalY ?? 0.55, 0, 1);
    this.footAlignWeight = MathUtils4.clamp(options.footAlignWeight ?? 1, 0, 1);
    this.maxFootTilt = MathUtils4.clamp(options.maxFootTilt ?? Math.PI / 2, 0, Math.PI);
    const configuredMinBend = MathUtils4.clamp(options.minKneeBend ?? MathUtils4.degToRad(2), 0, Math.PI);
    const configuredMaxBend = MathUtils4.clamp(options.maxKneeBend ?? MathUtils4.degToRad(145), 0, Math.PI);
    this.minKneeBend = Math.min(configuredMinBend, configuredMaxBend);
    this.maxKneeBend = Math.max(configuredMinBend, configuredMaxBend);
    this.pelvisKneeBend = MathUtils4.clamp(
      options.pelvisKneeBend ?? MathUtils4.degToRad(0),
      this.minKneeBend,
      this.maxKneeBend
    );
    this.straightPoleEnabled = options.straightPoleEnabled ?? false;
    this.raycaster = new Raycaster(new Vector37(), new Vector37(0, -1, 0), 0, this.raycastFar);
    this.raycaster.firstHitOnly = true;
    this.footPhaseOptions = createFootPhaseOptions({
      ...options,
      footPhaseGroundThreshold: this.footPhaseGroundThreshold
    });
    this.footPhaseState = {
      clipName: "",
      normalizedTime: 0,
      left: createFootPhaseRuntimeState(),
      right: createFootPhaseRuntimeState()
    };
    this.twoBoneIKScratch = createTwoBoneIKScratch();
    this.predictiveScratch = createPredictiveScratch();
    this.skeletonConfig = options.skeleton ?? null;
    this.legs = this.createEmptyLegs();
  }
  /** 挂载到玩家控制器并绑定当前模型骨骼。 */
  onAttach(player) {
    if (this.disposed) {
      throw new Error("[FootIK] \u5DF2\u9500\u6BC1\u7684\u63D2\u4EF6\u4E0D\u80FD\u518D\u6B21\u6302\u8F7D\u3002");
    }
    if (this.player && this.player !== player) this.detachPlayer();
    this.attachPlayer(player);
  }
  /** 从玩家控制器卸载并恢复插件修改。 */
  onDetach() {
    this.detachPlayer();
  }
  /** 在动画更新前恢复上一帧被 IK 修改的骨骼姿态。 */
  onBeforeAnimationUpdate(_delta) {
    if (!this.enabled || this.disposed) return;
    this.restore();
  }
  /** 在动画更新后应用当前帧 Foot IK。 */
  onAfterAnimationUpdate(delta) {
    if (!this.enabled || this.disposed) return;
    this.syncDistanceScale();
    this.update(delta);
  }
  /** 玩家模型切换后重新绑定骨骼和脚步相位数据。 */
  onPlayerModelChange() {
    if (this.disposed) return;
    this.rebind();
  }
  /** 终止使用插件并释放调试资源。 */
  dispose() {
    if (this.disposed) return;
    this.detachPlayer();
    this.disposed = true;
    this.footPhaseClips.clear();
    this.adjusted.clear();
    this.poseCache.clear();
  }
  // 模型切换后释放旧调试对象，并基于新模型重新绑定全部运行时数据。
  rebind() {
    if (!this.player?.playerModel) return;
    this.restore();
    disposeDebugObjects(this.legs);
    this.syncDistanceScale();
    this.bindSkeleton();
  }
  /** 读取当前角色 scale，未挂载时按 1 处理。 */
  getPlayerScale() {
    const scale = this.player?.playerModelConfig?.scale;
    return typeof scale === "number" && scale > 0 ? scale : 1;
  }
  /** 把 scale=1 基准距离写成当前世界值。 */
  scaleDistance(value) {
    return Math.max(0, value) * this.getPlayerScale();
  }
  /** 把已缩放的世界距离还原为 scale=1 基准值（供 getOptions 使用）。 */
  toBaseDistance(world) {
    return this.appliedScale > 0 ? world / this.appliedScale : world;
  }
  /** 若角色 scale 变化，对距离字段做 ratio 连乘。 */
  syncDistanceScale() {
    const scale = this.getPlayerScale();
    if (scale === this.appliedScale) return;
    this.rescaleDistances(scale);
  }
  /** 将距离字段从 appliedScale 换算到 newScale。 */
  rescaleDistances(newScale) {
    const next = newScale > 0 ? newScale : 1;
    const ratio = next / this.appliedScale;
    if (ratio === 1) {
      this.appliedScale = next;
      return;
    }
    this.maxPelvisDrop *= ratio;
    this.maxPelvisRaise *= ratio;
    this.maxFootRaise *= ratio;
    this.maxFootDrop *= ratio;
    this.plantedHeightSpeed *= ratio;
    this.penetrationLiftSpeed *= ratio;
    this.soleHalfWidth *= ratio;
    this.soleToeExtend *= ratio;
    this.soleHeelExtend *= ratio;
    this.soleSkinThickness *= ratio;
    this.moveLiftThreshold *= ratio;
    this.footPhaseGroundThreshold *= ratio;
    this.fakeToeExtend *= ratio;
    this.sampleRayOriginY *= ratio;
    this.raycastFar *= ratio;
    this.snapEpsilon *= ratio;
    this.predictionSearchRadius *= ratio;
    this.maxPredictionCorrection *= ratio;
    this.swingClearance *= ratio;
    this.maxPredictionClearance *= ratio;
    this.pelvisOffset *= ratio;
    for (const leg of Object.values(this.legs)) leg.offsetY *= ratio;
    if (this.pelvisOffsetOverride !== null) this.pelvisOffsetOverride *= ratio;
    this.raycaster.far = this.raycastFar;
    this.footPhaseOptions.groundThreshold = this.footPhaseGroundThreshold;
    this.appliedScale = next;
  }
  /** 启用或停用 Foot IK；停用时立即恢复插件修改。 */
  setEnabled(enabled) {
    if (this.disposed) return;
    this.enabled = enabled;
    if (!enabled) {
      this.restore();
      this.pelvisOffset = 0;
      this.resetPredictionRuntime();
      this.setDebugVisible(false);
    } else if (this.debug) {
      this.setDebugEnabled(true);
    }
  }
  // 保存玩家控制器引用并初始化模型相关状态。
  attachPlayer(player) {
    if (this.player === player && this.legs.left.ready) return;
    this.player = player;
    this.syncDistanceScale();
    this.pelvisOffset = 0;
    this.resetPredictionRuntime();
    this.bindSkeleton();
  }
  // 恢复骨骼，释放调试资源并清空所有控制器相关引用。
  detachPlayer() {
    this.restore();
    disposeDebugObjects(this.legs);
    this.footPhaseClips.clear();
    this.adjusted.clear();
    this.poseCache.clear();
    this.hips = null;
    this.legs = this.createEmptyLegs();
    this.rescaleDistances(1);
    this.player = null;
    this.pelvisOffset = 0;
    this.resetPredictionRuntime();
  }
  // 创建尚未绑定骨骼的左右腿占位状态。
  createEmptyLegs() {
    return {
      left: createLeg("left", []),
      right: createLeg("right", [])
    };
  }
  // 解析骨骼后初始化脚底采样、脚步相位数据库和调试对象。
  bindSkeleton() {
    const bones = collectBones(this.player?.playerModel);
    this.hips = resolveConfiguredBone(this.skeletonConfig?.hips, bones, "hips") ?? findHips(bones);
    this.legs = {
      left: createLeg("left", bones, this.skeletonConfig),
      right: createLeg("right", bones, this.skeletonConfig)
    };
    if (!this.hips || !isReadyLeg(this.legs.left) || !isReadyLeg(this.legs.right)) {
      console.warn("[FootIK] \u9AA8\u9ABC\u8BC6\u522B\u4E0D\u5B8C\u6574\uFF0C\u5F53\u524D\u6A21\u578B\u9AA8\u9ABC\u540D\uFF1A", bones.map((b) => b.name));
    }
    this.player?.playerModel?.updateMatrixWorld(true);
    this.initSoleLocalSamples(this.legs.left);
    this.initSoleLocalSamples(this.legs.right);
    this.buildFootPhaseDatabase();
    this.createDebugObjects();
    this.resetPredictionRuntime();
  }
  /** 清空胶囊速度历史和双脚预测目标，避免挂载、切模或开关切换后沿用旧落点。 */
  resetPredictionRuntime() {
    this.predictionVelocity.set(0, 0, 0);
    this.hasPreviousCapsulePosition = false;
    if (this.player?.playerCapsule) {
      this.previousCapsulePosition.copy(this.player.playerCapsule.position);
      this.hasPreviousCapsulePosition = true;
    }
    resetPredictiveFootState(this.legs.left.predictive);
    resetPredictiveFootState(this.legs.right.predictive);
    this.legs.left.heightSupport = null;
    this.legs.right.heightSupport = null;
  }
  /** 空中 / 停用贴地时丢掉反应式 IK 残留，避免落地从起飞前的世界高度往下坠。 */
  resetReactiveIkState() {
    this.pelvisOffset = 0;
    for (const leg of Object.values(this.legs)) {
      if (!isReadyLeg(leg)) continue;
      leg.weight = 0;
      leg.offsetY = 0;
      leg.heightSupport = null;
      leg.plantedWeight = 0;
      leg.hasPelvisTarget = false;
      leg.movePenetrating = false;
      leg.foot.getWorldPosition(leg.smoothedTarget);
    }
  }
  // 恢复上一帧 IK 修改前的骨骼姿态
  restore() {
    for (const bone of this.adjusted) {
      const pose = this.poseCache.get(bone);
      if (!pose) continue;
      bone.position.copy(pose.position);
      bone.quaternion.copy(pose.quaternion);
    }
    this.adjusted.clear();
  }
  // 在动画更新后执行每帧腿部 IK 修正。
  update(delta = 1 / 60) {
    if (!this.enabled || this.disposed) return;
    this.updateFootPhaseRuntime();
    if (this.predictivePlacement) this.updatePredictionVelocity(delta);
    this.refreshColliderMeshes();
    const player = this.player;
    if (!player || !this.colliderMeshes.length && !player.getDynamicBodies?.().length || !player.playerCapsule || !player.playerIsOnGround || player.isFlying || player.getControllerMode?.() === 1) {
      if (this.predictivePlacement) {
        resetPredictiveFootState(this.legs.left.predictive);
        resetPredictiveFootState(this.legs.right.predictive);
      }
      player?.playerModel?.updateMatrixWorld(true);
      this.resetReactiveIkState();
      this.setDebugVisible(false);
      return;
    }
    const model = player.playerModel;
    model?.updateMatrixWorld(true);
    const moving = this.isLocomotion();
    if (this.predictivePlacement && !moving) {
      resetPredictiveFootState(this.legs.left.predictive);
      resetPredictiveFootState(this.legs.right.predictive);
    }
    this.updateFoot("left", delta, moving);
    this.updateFoot("right", delta, moving);
    this.applyPelvis(delta);
    this.applyLeg("left", this.straightPoleEnabled && moving);
    this.applyLeg("right", this.straightPoleEnabled && moving);
  }
  /** 根据胶囊碰撞修正后的实际位移更新水平预测速度。 */
  updatePredictionVelocity(delta) {
    const capsule = this.player?.playerCapsule;
    if (!capsule) return;
    if (!this.hasPreviousCapsulePosition || delta <= 0) {
      this.previousCapsulePosition.copy(capsule.position);
      this.hasPreviousCapsulePosition = true;
      return;
    }
    const measured = this.tmpV6.subVectors(capsule.position, this.previousCapsulePosition).multiplyScalar(1 / delta).setY(0);
    const controllerVelocity = this.player?.getVelocity?.();
    if (controllerVelocity) {
      measured.lerp(this.tmpV7.copy(controllerVelocity).setY(0), 0.15);
    }
    const alpha = 1 - Math.exp(-12 * delta);
    this.predictionVelocity.lerp(measured, alpha);
    this.previousCapsulePosition.copy(capsule.position);
  }
  // 构建脚步相位库。具体采样和过滤逻辑在 footPhase.ts 中。
  buildFootPhaseDatabase() {
    const model = this.player?.playerModel;
    const clips = this.player?.animation?.clips ?? [];
    this.footPhaseClips = buildFootPhaseDatabase(
      model,
      clips,
      this.legs,
      this.footPhaseOptions,
      (name) => this.isLocomotionClipName(name)
    );
    if (this.debug && this.footPhaseClips.size === 0) {
      console.warn("[FootIK] \u6CA1\u6709\u751F\u6210\u811A\u6B65\u76F8\u4F4D\u6570\u636E\uFF0C\u8BF7\u786E\u8BA4\u79FB\u52A8\u52A8\u753B\u548C\u811A\u9AA8\u9ABC\u914D\u7F6E\u3002");
    }
  }
  // 根据当前动画播放时间更新左右脚相位。这里只同步状态，不直接驱动 IK。
  updateFootPhaseRuntime() {
    const action = this.player?.animation?.state;
    if (!action) {
      this.footPhaseState.clipName = "";
      return;
    }
    const clip = action.getClip();
    if (clip.duration <= 0) return;
    const data = this.footPhaseClips.get(clip.name);
    this.footPhaseState.clipName = clip.name;
    this.footPhaseState.normalizedTime = (action.time / clip.duration % 1 + 1) % 1;
    if (!data) {
      this.footPhaseState.left = createFootPhaseRuntimeState();
      this.footPhaseState.right = createFootPhaseRuntimeState();
      return;
    }
    const runtime = sampleFootPhaseRuntime(data, this.footPhaseState.normalizedTime, clip.duration);
    this.footPhaseState.left = runtime.left;
    this.footPhaseState.right = runtime.right;
  }
  // 计算单脚 IK 目标、权重和骨盆偏移。
  updateFoot(side, delta, moving) {
    const leg = this.legs[side];
    if (!isReadyLeg(leg)) return;
    const footWorld = leg.foot.getWorldPosition(this.tmpV10);
    leg.hasPelvisTarget = false;
    const phase = this.footPhaseState?.[side];
    const phasePlanted = moving && !!phase?.planted;
    const nextPlanted = !moving || phasePlanted;
    const wasPlanted = leg.planted;
    const startedSwing = wasPlanted && !nextPlanted;
    const previousWeight = leg.weight;
    const wasMovePenetrating = leg.movePenetrating;
    leg.planted = nextPlanted;
    if (this.predictivePlacement) {
      this.updatePredictiveFoot(
        leg,
        phase,
        footWorld,
        startedSwing,
        delta
      );
    } else if (leg.predictive.mode !== "none") {
      resetPredictiveFootState(leg.predictive);
    }
    if (leg.planted && this.resolvePredictivePlantedFoot(leg, footWorld, delta)) {
      leg.heightSupport = null;
      return;
    }
    if (!leg.planted && this.resolvePredictiveSwingFoot(leg, footWorld, phase, delta)) {
      leg.heightSupport = null;
      return;
    }
    if (!leg.planted && this.resolvePredictiveReleaseFoot(leg, footWorld)) {
      leg.heightSupport = null;
      return;
    }
    const hit = this.castBestFootGround(leg);
    this.transportFootHeight(leg, hit);
    if (!hit) {
      if (!leg.planted) {
        this.releaseSwingFoot(
          leg,
          footWorld,
          startedSwing || wasMovePenetrating,
          previousWeight,
          delta
        );
        this.updateFootDebug(leg, footWorld);
        return;
      }
      leg.plantedWeight = 0;
      leg.movePenetrating = false;
      leg.weight = 0;
      leg.offsetY = 0;
      this.updateFootDebug(leg, footWorld);
      return;
    }
    leg.hitNormal.copy(hit.normal);
    leg.hitPoint.copy(hit.point);
    const groundOffset = this.getFootGroundOffset(leg);
    const liftAmount = Math.max(0, groundOffset);
    const pelvisTargetOffset = this.getAlignedFootTargetOffset(leg, footWorld);
    if (leg.planted && pelvisTargetOffset < -this.maxFootDrop) {
      leg.weight = 0;
      leg.plantedWeight = 0;
      leg.offsetY = 0;
      leg.movePenetrating = false;
      leg.smoothedTarget.copy(footWorld);
      this.updateFootDebug(leg, hit.point);
      return;
    }
    const targetOffset = leg.planted ? pelvisTargetOffset : Math.max(0, pelvisTargetOffset);
    if (targetOffset > this.maxFootRaise) {
      if (!leg.planted) {
        this.releaseSwingFoot(
          leg,
          footWorld,
          startedSwing || wasMovePenetrating,
          previousWeight,
          delta
        );
        this.updateFootDebug(leg, hit.point);
        return;
      }
      leg.weight = 0;
      leg.plantedWeight = 0;
      leg.offsetY = 0;
      leg.movePenetrating = false;
      leg.smoothedTarget.copy(footWorld);
      this.updateFootDebug(leg, hit.point);
      return;
    }
    if (pelvisTargetOffset <= this.maxFootRaise && pelvisTargetOffset >= -this.maxFootDrop) {
      leg.hasPelvisTarget = true;
      leg.pelvisTarget.copy(footWorld).addScaledVector(this.up, pelvisTargetOffset);
    }
    leg.movePenetrating = liftAmount > this.moveLiftThreshold;
    const wantedPlantedWeight = leg.planted ? 1 : 0;
    if (startedSwing || wasMovePenetrating && !leg.movePenetrating) {
      leg.plantedWeight = previousWeight;
    } else {
      leg.plantedWeight = MathUtils4.damp(
        leg.plantedWeight ?? 0,
        wantedPlantedWeight,
        10,
        delta
      );
    }
    if (leg.movePenetrating) {
      leg.weight = 1;
    } else if (leg.plantedWeight > 1e-3) {
      leg.weight = leg.plantedWeight;
    } else {
      leg.weight = 0;
    }
    if (leg.planted) {
      this.moveFootHeightAlongUp(
        leg,
        footWorld,
        targetOffset,
        previousWeight,
        delta,
        this.getHeightSpeed(this.plantedHeightSpeed)
      );
    } else if (leg.movePenetrating) {
      this.moveFootHeightAlongUp(
        leg,
        footWorld,
        targetOffset,
        previousWeight,
        delta,
        this.getHeightSpeed(this.penetrationLiftSpeed)
      );
    } else if (!startedSwing) {
      leg.offsetY = MathUtils4.damp(leg.offsetY, 0, 10, delta);
      if (Math.abs(leg.offsetY) < this.snapEpsilon) leg.offsetY = 0;
      leg.smoothedTarget.copy(footWorld).addScaledVector(this.up, leg.offsetY);
    } else {
      leg.smoothedTarget.copy(footWorld).addScaledVector(this.up, leg.offsetY);
    }
    if (hit.object) {
      leg.heightSupport = hit.object;
      leg.heightSupportLocal.copy(hit.point);
      hit.object.worldToLocal(leg.heightSupportLocal);
      leg.heightSupportWorldY = hit.point.y;
      leg.heightSupportScale = this.appliedScale;
    }
    this.updateFootDebug(leg, hit.point);
  }
  /** 先把历史高度搬到本帧支撑面，再对剩余贴地误差限速。 */
  transportFootHeight(leg, hit) {
    if (leg.heightSupport && leg.heightSupport === hit?.object) {
      const anchor = leg.heightSupport.localToWorld(this.tmpV6.copy(leg.heightSupportLocal));
      const scaleRatio = this.appliedScale / leg.heightSupportScale;
      leg.smoothedTarget.y = anchor.y + (leg.smoothedTarget.y - leg.heightSupportWorldY) * scaleRatio;
    }
    leg.heightSupport = null;
  }
  /** 当前是跑步动画时高度速度不限制。 */
  getHeightSpeed(speed) {
    const clipName = this.player?.animation.state?.getClip().name ?? "";
    const runAnim = this.player?.playerModelConfig?.runAnim;
    return runAnim && clipName === runAnim ? Infinity : speed;
  }
  /** 从已同步支撑面变换的历史高度沿 up 限速移动；XZ 跟当前动画脚。 */
  moveFootHeightAlongUp(leg, footWorld, wantedOffset, previousWeight, delta, speed) {
    const footAlongUp = footWorld.dot(this.up);
    const wantedAlongUp = footAlongUp + wantedOffset;
    if (!Number.isFinite(speed)) {
      leg.offsetY = wantedOffset;
      leg.smoothedTarget.copy(footWorld).addScaledVector(this.up, leg.offsetY);
      return;
    }
    const hasPrevious = previousWeight > 1e-3 || Math.abs(leg.offsetY) > this.snapEpsilon;
    const previousAlongUp = hasPrevious ? leg.smoothedTarget.dot(this.up) : footAlongUp;
    const movedAlongUp = previousAlongUp + MathUtils4.clamp(
      wantedAlongUp - previousAlongUp,
      -speed * delta,
      speed * delta
    );
    leg.offsetY = MathUtils4.clamp(movedAlongUp - footAlongUp, -this.maxFootDrop, this.maxFootRaise);
    leg.smoothedTarget.copy(footWorld).addScaledVector(this.up, leg.offsetY);
  }
  // 摆动阶段命中失效时继续释放已有支撑修正，避免无命中分支把权重和目标直接清零。
  releaseSwingFoot(leg, footWorld, inheritOutputWeight, previousWeight, delta) {
    leg.movePenetrating = false;
    leg.plantedWeight = inheritOutputWeight ? previousWeight : MathUtils4.damp(leg.plantedWeight, 0, 10, delta);
    if (leg.plantedWeight < 1e-3) leg.plantedWeight = 0;
    leg.weight = leg.plantedWeight;
    if (!inheritOutputWeight) {
      leg.offsetY = MathUtils4.damp(leg.offsetY, 0, 10, delta);
      if (Math.abs(leg.offsetY) < this.snapEpsilon) leg.offsetY = 0;
    }
    leg.smoothedTarget.copy(footWorld).addScaledVector(this.up, leg.offsetY);
  }
  /** 摆动期间持续更新预测线路，并在末段锁定最终落脚结果。 */
  updatePredictiveFoot(leg, phase, footWorld, startedSwing, delta) {
    const state = leg.predictive;
    if (leg.planted) {
      if (state.mode === "active" && state.usesOffsetLanding) {
        state.mode = "planted";
        state.predictionWeight = 1;
        state.debugTrajectoryVisible = false;
      } else if (state.mode !== "planted" && state.mode !== "none") {
        resetPredictiveFootState(state);
      }
      return;
    }
    if (startedSwing) {
      const preserveRelease = state.mode === "planted" && state.usesOffsetLanding;
      if (preserveRelease) {
        this.tmpV1.subVectors(
          state.trajectoryCurrentTarget,
          footWorld
        );
      }
      resetPredictiveFootState(state);
      state.mode = "tracking";
      if (preserveRelease && this.tmpV1.lengthSq() > this.snapEpsilon * this.snapEpsilon) {
        state.releaseOffset.copy(this.tmpV1);
        state.releaseStartProgress = phase?.progress ?? 0;
        state.releaseActive = true;
      }
    }
    if (!phase?.nextLanding || !Number.isFinite(phase.timeToLand)) {
      resetPredictiveFootState(state);
      return;
    }
    if (state.mode === "none") {
      state.mode = "tracking";
    }
    state.trajectoryProgress = Math.max(
      state.trajectoryProgress,
      phase.progress
    );
    const model = this.player?.playerModel;
    if (!model) return;
    const predictionTime = Math.min(phase.timeToLand, this.predictionHorizon);
    state.animatedLanding.copy(phase.nextLanding.localPosition).applyMatrix4(model.matrixWorld).addScaledVector(this.predictionVelocity, predictionTime);
    state.animatedLandingRotation.copy(model.getWorldQuaternion(this.tmpQ4)).multiply(phase.nextLanding.localRotation);
    if (state.mode === "active" && !state.usesOffsetLanding) {
      this.followAnimatedLandingTarget(leg);
    }
    if (state.trajectoryProgress >= PREDICTION_LOCK_PROGRESS) {
      return;
    }
    state.probeElapsed += 1;
    if (this.predictionProbeFrames <= 0 || state.probeElapsed >= this.predictionProbeFrames) {
      state.probeElapsed = 0;
      const ctx = this.getPredictiveContext(model);
      const { candidate, centerSupport } = findPredictiveFootCandidates(
        ctx,
        leg,
        phase,
        state.animatedLanding,
        state.animatedLandingRotation
      );
      if (!centerSupport) {
        this.suppressFlatPredictiveFoot(leg);
        return;
      }
      const trajectoryStart = state.mode === "active" ? state.trajectoryCurrentTarget : state.releaseActive ? this.predictiveScratch.trajectoryStart.copy(footWorld).addScaledVector(
        state.releaseOffset,
        this.getPredictiveReleaseWeight(state)
      ) : this.getPredictiveSwingStart(leg, footWorld);
      const trajectoryStartProgress = state.mode === "active" ? state.trajectoryStartProgress : state.trajectoryProgress;
      const { enter: demandEnter, exit: demandExit } = getPredictiveDemandThresholds(
        this.appliedScale,
        this.snapEpsilon,
        this.predictiveScratch
      );
      const demandThreshold = state.mode === "active" ? demandExit : demandEnter;
      if (candidate) {
        const plan = planPredictiveFootTrajectory(
          ctx,
          leg,
          phase,
          footWorld,
          trajectoryStart,
          trajectoryStartProgress,
          candidate
        );
        const planeLift2 = getPredictivePlaneDistance(ctx, candidate);
        const swingLift = plan?.terrainDemand ?? 0;
        state.debugPlaneLift = planeLift2;
        state.debugSwingLift = swingLift;
        const terrainDemand = getPredictiveTerrainDemand(
          planeLift2,
          swingLift
        );
        if (terrainDemand < demandThreshold) {
          this.suppressFlatPredictiveFoot(leg);
          return;
        }
        if (!plan) {
          state.debugCandidates[0].valid = false;
          this.suppressFlatPredictiveFoot(leg);
          return;
        }
        acceptPredictiveFootCandidate(
          state,
          candidate,
          this.predictiveScratch
        );
        selectPredictiveDebugCandidate(state, 0);
        plan.terrainDemand = terrainDemand;
        this.updatePredictiveFootTrajectory(
          leg,
          footWorld,
          trajectoryStart,
          state.trajectoryProgress,
          plan,
          demandExit,
          demandEnter
        );
        return;
      }
      const planeLift = getPredictivePlaneDistance(ctx, centerSupport);
      state.debugPlaneLift = planeLift;
      state.debugSwingLift = 0;
      this.suppressFlatPredictiveFoot(leg);
    }
  }
  /** 组装预测候选搜索和轨迹规划共用的配置与回调。 */
  getPredictiveContext(model) {
    return {
      up: this.up,
      appliedScale: this.appliedScale,
      snapEpsilon: this.snapEpsilon,
      sampleRayOriginY: this.sampleRayOriginY,
      maxPredictionCorrection: this.maxPredictionCorrection,
      predictionMinNormalY: this.predictionMinNormalY,
      maxFootRaise: this.maxFootRaise,
      maxFootDrop: this.maxFootDrop,
      pelvisKneeBend: this.pelvisKneeBend,
      footAlignWeight: this.footAlignWeight,
      predictionHorizon: this.predictionHorizon,
      predictionVelocity: this.predictionVelocity,
      scratch: this.predictiveScratch,
      debug: this.debug,
      castGroundFrom: (x, y, z) => this.castGroundFrom(x, y, z),
      castCapsuleGround: () => this.castCapsuleGround(),
      getConstrainedFootAlign: (normal, alignWeight, target) => this.getConstrainedFootAlign(normal, alignWeight, target),
      mergeCoplanarHits: (hits, highest, supportPoint, supportNormal) => this.mergeCoplanarGroundHits(hits, highest, supportPoint, supportNormal),
      getSafeLegReach: (upperLen, lowerLen, kneeBend) => this.getSafeLegReach(upperLen, lowerLen, kneeBend),
      model,
      footPhaseClips: this.footPhaseClips,
      clipName: this.footPhaseState.clipName,
      normalizedTime: this.footPhaseState.normalizedTime,
      swingClearance: this.swingClearance,
      maxPredictionClearance: this.maxPredictionClearance
    };
  }
  // 地形需求退出阈值后立即交还动画和普通 Foot IK。
  suppressFlatPredictiveFoot(leg) {
    const state = leg.predictive;
    state.mode = "tracking";
    state.score = Infinity;
    state.supportObject = null;
    state.trajectoryStartOffset.set(0, 0, 0);
    state.trajectoryCurrentTarget.set(0, 0, 0);
    state.trajectoryStartProgress = state.trajectoryProgress;
    state.trajectoryClearance = 0;
    state.predictionWeight = 0;
    state.usesOffsetLanding = false;
    state.debugTrajectoryVisible = false;
  }
  /** 更新预测线路，并保持重规划首帧的世界空间目标连续。 */
  updatePredictiveFootTrajectory(leg, animationFoot, trajectoryStart, progress, plan, demandExit, demandEnter) {
    const state = leg.predictive;
    const wasActive = state.mode === "active";
    if (!wasActive) {
      state.mode = "active";
      state.trajectoryStartOffset.subVectors(
        trajectoryStart,
        animationFoot
      );
      state.trajectoryCurrentTarget.copy(trajectoryStart);
      state.trajectoryStartProgress = MathUtils4.clamp(progress, 0, 1);
    } else {
      const localProgress = getPredictiveLocalProgress(
        progress,
        state.trajectoryStartProgress
      );
      const warpAlpha = MathUtils4.smoothstep(localProgress, 0, 1);
      const remainingStartWeight = 1 - warpAlpha;
      if (remainingStartWeight > 1e-4) {
        const landingCorrection = this.tmpV1.subVectors(
          state.landingTarget,
          state.animatedLanding
        );
        const resolvedWithoutStart = this.tmpV2.copy(animationFoot).addScaledVector(landingCorrection, warpAlpha).addScaledVector(
          this.up,
          plan.clearance * getPredictiveClearanceShape(localProgress)
        );
        state.trajectoryStartOffset.subVectors(
          state.trajectoryCurrentTarget,
          resolvedWithoutStart
        ).multiplyScalar(1 / remainingStartWeight);
      } else {
        state.trajectoryStartOffset.set(0, 0, 0);
      }
    }
    state.trajectoryClearance = plan.clearance;
    state.predictionWeight = MathUtils4.smoothstep(
      plan.terrainDemand,
      demandExit,
      demandEnter
    );
    if (this.debug) {
      for (let i = 0; i < state.debugTrajectory.length; i++) {
        state.debugTrajectory[i].copy(plan.points[i]);
      }
    }
    this.rebuildPredictiveDebugTrajectory(leg);
  }
  /** 根据当前融合状态刷新预测摆动轨迹的调试可见性。 */
  rebuildPredictiveDebugTrajectory(leg) {
    const state = leg.predictive;
    state.debugTrajectoryVisible = this.debug && Number.isFinite(state.score) && state.mode === "active" && state.predictionWeight > 1e-3;
  }
  /** 让动画中心落点持续跟随实际落地帧，并保持当前支撑平面的高度关系。 */
  followAnimatedLandingTarget(leg) {
    const state = leg.predictive;
    const previousTarget = this.debug ? this.tmpV1.copy(state.landingTarget) : null;
    const deltaX = state.animatedLanding.x - state.landingTarget.x;
    const deltaZ = state.animatedLanding.z - state.landingTarget.z;
    state.landingTarget.x = state.animatedLanding.x;
    state.landingTarget.z = state.animatedLanding.z;
    if (state.landingNormal.y > 0.18) {
      state.landingTarget.y -= (state.landingNormal.x * deltaX + state.landingNormal.z * deltaZ) / state.landingNormal.y;
    }
    if (previousTarget) {
      shiftPredictiveDebugTrajectory(
        state.debugTrajectory,
        this.tmpV2.subVectors(state.landingTarget, previousTarget)
      );
    }
  }
  /** 支撑阶段沿用发生水平修正的预测落点，直到下一次摆腿开始。 */
  resolvePredictivePlantedFoot(leg, footWorld, delta) {
    const state = leg.predictive;
    if (state.mode !== "planted" || !state.usesOffsetLanding) return false;
    refreshPredictiveSupportAnchor(leg, this.predictiveScratch, this.debug);
    leg.smoothedTarget.copy(state.landingTarget);
    leg.hasPelvisTarget = true;
    leg.pelvisTarget.copy(leg.smoothedTarget);
    this.clampPredictiveTargetToReach(leg, leg.smoothedTarget);
    state.trajectoryCurrentTarget.copy(leg.smoothedTarget);
    leg.hitPoint.copy(state.supportPoint);
    leg.hitNormal.copy(state.landingNormal);
    leg.supportPoint.copy(state.supportPoint);
    leg.supportNormal.copy(state.landingNormal);
    leg.movePenetrating = false;
    leg.plantedWeight = MathUtils4.damp(
      Math.max(leg.plantedWeight, leg.weight),
      1,
      10,
      delta
    );
    leg.weight = leg.plantedWeight;
    leg.offsetY = leg.smoothedTarget.y - footWorld.y;
    this.updateFootDebug(leg, state.supportPoint);
    return true;
  }
  // 返回支撑残差在当前摆腿相位中尚未释放的权重。
  getPredictiveReleaseWeight(state) {
    if (!state.releaseActive) return 0;
    const localProgress = getPredictiveLocalProgress(
      state.trajectoryProgress,
      state.releaseStartProgress
    );
    return 1 - MathUtils4.smoothstep(
      localProgress,
      0,
      PREDICTION_RELEASE_PROGRESS
    );
  }
  /** 在新摆腿前段逐渐释放上一支撑落点相对动画脚的残差。 */
  resolvePredictiveReleaseFoot(leg, footWorld) {
    const state = leg.predictive;
    const releaseWeight = this.getPredictiveReleaseWeight(state);
    if (releaseWeight <= 1e-3) {
      state.releaseOffset.set(0, 0, 0);
      state.releaseActive = false;
      return false;
    }
    leg.smoothedTarget.copy(footWorld).addScaledVector(state.releaseOffset, releaseWeight);
    leg.hasPelvisTarget = true;
    leg.pelvisTarget.copy(leg.smoothedTarget);
    this.clampPredictiveTargetToReach(leg, leg.smoothedTarget);
    state.trajectoryCurrentTarget.copy(leg.smoothedTarget);
    leg.movePenetrating = false;
    leg.plantedWeight = 0;
    leg.weight = 1;
    leg.offsetY = leg.smoothedTarget.y - footWorld.y;
    this.updateFootDebug(leg, leg.smoothedTarget);
    return true;
  }
  /** 预测摆腿起点：已有反应式输出时从抬过的脚开始。 */
  getPredictiveSwingStart(leg, footWorld) {
    if (leg.weight > 1e-3 || Math.abs(leg.offsetY) > this.snapEpsilon) {
      return this.predictiveScratch.trajectoryStart.copy(leg.smoothedTarget);
    }
    return footWorld;
  }
  /** 根据地形需求权重统一融合动画轨迹、预测落点和摆动净空。 */
  resolvePredictiveSwingFoot(leg, footWorld, phase, delta) {
    if (!this.predictivePlacement || !phase || leg.planted) {
      return false;
    }
    const state = leg.predictive;
    if (state.mode !== "active" || !Number.isFinite(state.score) || state.predictionWeight <= 1e-3) {
      return false;
    }
    refreshPredictiveSupportAnchor(leg, this.predictiveScratch, this.debug);
    const landingCorrection = this.tmpV1.subVectors(
      state.landingTarget,
      state.animatedLanding
    );
    const localProgress = getPredictiveLocalProgress(
      state.trajectoryProgress,
      state.trajectoryStartProgress
    );
    const warpAlpha = MathUtils4.smoothstep(localProgress, 0, 1);
    const previousAlongUp = leg.weight > 1e-3 || Math.abs(leg.offsetY) > this.snapEpsilon ? leg.smoothedTarget.dot(this.up) : footWorld.dot(this.up);
    leg.smoothedTarget.copy(footWorld).addScaledVector(
      state.trajectoryStartOffset,
      1 - warpAlpha
    ).addScaledVector(
      landingCorrection,
      warpAlpha
    ).addScaledVector(
      this.up,
      state.trajectoryClearance * getPredictiveClearanceShape(localProgress)
    );
    const hit = this.castBestFootGround(leg);
    if (hit) {
      const groundOffset = Math.max(0, this.getFootGroundOffset(leg));
      if (groundOffset <= this.maxFootRaise) {
        leg.smoothedTarget.y = Math.max(
          leg.smoothedTarget.y,
          footWorld.y + groundOffset
        );
      }
    } else {
      leg.hitPoint.copy(state.supportPoint);
      leg.hitNormal.copy(state.landingNormal);
      leg.supportPoint.copy(state.supportPoint);
      leg.supportNormal.copy(state.landingNormal);
    }
    this.clampPredictiveTargetToReach(leg, leg.smoothedTarget);
    this.dampPredictiveSwingOutput(
      leg,
      footWorld,
      previousAlongUp,
      state.predictionWeight,
      delta
    );
    leg.pelvisTarget.copy(leg.smoothedTarget);
    state.trajectoryCurrentTarget.copy(leg.smoothedTarget);
    if (state.releaseActive) {
      state.releaseOffset.set(0, 0, 0);
      state.releaseActive = false;
    }
    leg.hasPelvisTarget = true;
    leg.movePenetrating = false;
    this.rebuildPredictiveDebugTrajectory(leg);
    this.updateFootDebug(leg, hit?.point ?? state.supportPoint);
    return true;
  }
  /** 从上一帧反应式输出阻尼到本帧预测目标。 */
  dampPredictiveSwingOutput(leg, footWorld, previousAlongUp, wantedWeight, delta) {
    const wantedAlongUp = leg.smoothedTarget.dot(this.up);
    const chase = wantedWeight > 1e-3;
    const damp = chase ? PREDICTIVE_SWING_CHASE_DAMP : PREDICTIVE_SWING_FADE_DAMP;
    let dampedAlongUp = MathUtils4.damp(
      previousAlongUp,
      wantedAlongUp,
      damp,
      delta
    );
    if (Math.abs(dampedAlongUp - wantedAlongUp) < this.snapEpsilon) {
      dampedAlongUp = wantedAlongUp;
    }
    leg.smoothedTarget.addScaledVector(
      this.up,
      dampedAlongUp - wantedAlongUp
    );
    leg.offsetY = leg.smoothedTarget.y - footWorld.y;
    leg.weight = MathUtils4.damp(leg.weight, wantedWeight, damp, delta);
    if (leg.weight < 1e-3) leg.weight = 0;
    leg.plantedWeight = MathUtils4.damp(
      leg.plantedWeight,
      0,
      PREDICTIVE_SWING_FADE_DAMP,
      delta
    );
    if (leg.plantedWeight < 1e-3) leg.plantedWeight = 0;
  }
  /** 把脚的 up 部分旋到地面法线，并施加最大倾角和对齐权重。 */
  getConstrainedFootAlign(normal, alignWeight, target) {
    target.setFromUnitVectors(this.up, normal);
    const realAngle = 2 * Math.acos(MathUtils4.clamp(target.w, -1, 1));
    if (realAngle > this.maxFootTilt && realAngle > 1e-6) {
      target.slerp(this.identityQ, 1 - this.maxFootTilt / realAngle);
    }
    target.slerp(this.identityQ, 1 - alignWeight);
    return target;
  }
  /** 只合并最高命中所在的近似共面点，避免跨台阶平均出不存在的斜面。 */
  mergeCoplanarGroundHits(hits, highest, supportPoint, supportNormal) {
    const planeEpsilon = Math.max(1e-6, 2 * this.appliedScale);
    supportPoint.set(0, 0, 0);
    supportNormal.set(0, 0, 0);
    let supportCount = 0;
    for (const hit of hits) {
      if (!hit) continue;
      const planeDistance = Math.abs(
        highest.normal.dot(this.tmpV5.copy(hit.point).sub(highest.point))
      );
      if (planeDistance > planeEpsilon || hit.normal.dot(highest.normal) < 0.95) continue;
      supportPoint.add(hit.point);
      supportNormal.add(hit.normal);
      supportCount++;
    }
    if (supportCount > 0) {
      supportPoint.multiplyScalar(1 / supportCount);
      supportNormal.normalize();
    }
    return supportCount;
  }
  /** 按指定膝盖弯曲角反算双骨链的安全伸展距离。 */
  getSafeLegReach(upperLen, lowerLen, kneeBend) {
    return Math.sqrt(
      upperLen * upperLen + lowerLen * lowerLen + 2 * upperLen * lowerLen * Math.cos(kneeBend)
    );
  }
  /** 将脚目标限制在当前髋部的安全可达区间；落地够不着时停在最大伸展上，避免硬踩。 */
  clampPredictiveTargetToReach(leg, target) {
    const hip = leg.upper.getWorldPosition(this.tmpV1);
    const knee = leg.lower.getWorldPosition(this.tmpV2);
    const foot = leg.foot.getWorldPosition(this.tmpV3);
    const upperLen = Math.max(1e-4, hip.distanceTo(knee));
    const lowerLen = Math.max(1e-4, knee.distanceTo(foot));
    const safeMaxReach = this.getSafeLegReach(upperLen, lowerLen, this.pelvisKneeBend);
    const safeMinReach = this.getSafeLegReach(upperLen, lowerLen, this.maxKneeBend);
    const hipToTarget = this.tmpV4.subVectors(target, hip);
    const targetDistance = hipToTarget.length();
    if (targetDistance < 1e-6) return;
    const safeDistance = MathUtils4.clamp(targetDistance, safeMinReach, safeMaxReach);
    if (Math.abs(safeDistance - targetDistance) <= 1e-6) return;
    target.copy(hip).addScaledVector(hipToTarget, safeDistance / targetDistance);
  }
  // 对一只脚的四个虚拟脚底点分别向下射线，选择命中高度最高的点作为本帧调试/法线参考。
  // 平地浮点抖动时用滞回。
  castBestFootGround(leg) {
    this.updateSoleSamples(leg);
    const samples = leg.soleSamples;
    const stickEpsilon = Math.max(1e-6, this.appliedScale);
    const hits = this.sampleGroundHitSlots;
    let maxY = -Infinity;
    let maxIndex = -1;
    let maxHit = null;
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      sample.hasHit = false;
      hits[i] = null;
      const hit = this.castGroundAtSample(sample.point);
      if (!hit) continue;
      sample.hasHit = true;
      sample.hitPoint.copy(hit.point);
      const stored = copyGroundHit(hit, this.sampleGroundHits[i]);
      hits[i] = stored;
      if (stored.point.y > maxY) {
        maxY = stored.point.y;
        maxIndex = i;
        maxHit = stored;
      }
    }
    if (maxIndex < 0 || !maxHit) {
      leg.bestGroundSampleIndex = -1;
      return null;
    }
    let bestIndex = maxIndex;
    let bestHit = maxHit;
    const prev = leg.bestGroundSampleIndex;
    if (prev >= 0 && prev < samples.length) {
      const prevHit = hits[prev];
      if (prevHit && prevHit.point.y >= maxY - stickEpsilon) {
        bestIndex = prev;
        bestHit = prevHit;
      }
    }
    const supportCount = this.mergeCoplanarGroundHits(
      hits,
      bestHit,
      leg.supportPoint,
      leg.supportNormal
    );
    if (supportCount <= 0) {
      leg.supportPoint.copy(bestHit.point);
      leg.supportNormal.copy(bestHit.normal);
    }
    leg.bestGroundSampleIndex = bestIndex;
    leg.footSamplePoint.copy(samples[bestIndex].point);
    this.bestGroundHit.point.copy(bestHit.point);
    this.bestGroundHit.normal.copy(leg.supportNormal);
    this.bestGroundHit.object = bestHit.object;
    return this.bestGroundHit;
  }
  // 基于初始化姿态，把脚底四个采样点固定到 foot 骨骼本地空间。
  initSoleLocalSamples(leg) {
    if (!isReadyLeg(leg)) return;
    const footWorld = leg.foot.getWorldPosition(this.tmpV1);
    const toeWorld = leg.toe ? leg.toe.getWorldPosition(this.tmpV2) : this.tmpV2.copy(footWorld).add(this.tmpV3.set(0, 0, 1).applyQuaternion(leg.foot.getWorldQuaternion(this.tmpQ1)).setY(0).normalize().multiplyScalar(this.fakeToeExtend));
    const forward = this.tmpV3.copy(toeWorld).sub(footWorld).setY(0);
    const minFwdSq = Math.max(1e-8, 1e-4 * this.appliedScale * this.appliedScale);
    if (forward.lengthSq() < minFwdSq) {
      forward.set(0, 0, 1).applyQuaternion(leg.foot.getWorldQuaternion(this.tmpQ1)).setY(0);
    }
    forward.normalize();
    const side = this.tmpV4.crossVectors(forward, this.up).normalize();
    const heelCenter = this.tmpV5.copy(footWorld).addScaledVector(forward, -this.soleHeelExtend);
    const toeCenter = this.tmpV2.copy(toeWorld).addScaledVector(forward, this.soleToeExtend);
    heelCenter.y = toeCenter.y;
    leg.foot.updateMatrixWorld(true);
    const samples = leg.soleSamples;
    samples[0].point.copy(heelCenter).addScaledVector(side, this.soleHalfWidth);
    samples[1].point.copy(heelCenter).addScaledVector(side, -this.soleHalfWidth);
    samples[2].point.copy(toeCenter).addScaledVector(side, this.soleHalfWidth);
    samples[3].point.copy(toeCenter).addScaledVector(side, -this.soleHalfWidth);
    for (const sample of samples) {
      sample.point.y -= this.soleSkinThickness;
      sample.local.copy(sample.point);
      leg.foot.worldToLocal(sample.local);
    }
    leg.footSamplePoint.copy(heelCenter);
  }
  // 把 foot-local 脚底四点转换到世界空间，供射线、穿透检测和调试使用。
  updateSoleSamples(leg) {
    if (!isReadyLeg(leg)) return;
    leg.foot.updateMatrixWorld(true);
    const samples = leg.soleSamples;
    for (const sample of samples) {
      sample.point.copy(sample.local).applyMatrix4(leg.foot.matrixWorld);
    }
    if (samples.length >= 2) {
      leg.footSamplePoint.copy(samples[0].point).add(samples[1].point).multiplyScalar(0.5);
    }
  }
  // 四个脚底采样点中取最高地面相对脚底的垂直偏移。
  getFootGroundOffset(leg) {
    let offset = -Infinity;
    for (const sample of leg.soleSamples) {
      if (!sample.hasHit) continue;
      offset = Math.max(offset, sample.hitPoint.y - sample.point.y);
    }
    return Number.isFinite(offset) ? offset : 0;
  }
  // 先把脚掌旋到支撑面方向，再计算四个脚底点同时不穿透时所需的踝骨垂直偏移。
  getAlignedFootTargetOffset(leg, footWorld) {
    const supportNormal = leg.supportNormal;
    if (supportNormal.y <= 0.18) return this.getFootGroundOffset(leg);
    const footWorldQ = leg.foot.getWorldQuaternion(this.tmpQ1);
    const alignQ = this.getConstrainedFootAlign(
      supportNormal,
      this.footAlignWeight,
      this.tmpQ2
    );
    const targetWorldQ = alignQ.multiply(footWorldQ);
    const worldScale = leg.foot.getWorldScale(this.tmpV4);
    let targetOffset = -Infinity;
    for (const sample of leg.soleSamples) {
      const alignedPoint = this.tmpV5.copy(sample.local).multiply(worldScale).applyQuaternion(targetWorldQ).add(footWorld);
      const planeOffset = supportNormal.dot(
        this.tmpV3.copy(leg.supportPoint).sub(alignedPoint)
      ) / supportNormal.y;
      targetOffset = Math.max(targetOffset, planeOffset);
    }
    return Number.isFinite(targetOffset) ? targetOffset : this.getFootGroundOffset(leg);
  }
  // 判断当前动画是否属于移动类动画。
  isLocomotion() {
    const name = this.player?.animation.state?.getClip().name ?? "";
    return this.isLocomotionClipName(name);
  }
  // 统一判断脚步相位采样和运行时移动状态：直接使用 playerModelConfig 中的移动动画名。
  isLocomotionClipName(name) {
    if (!name) return false;
    const config = this.player?.playerModelConfig;
    if (!config) return false;
    return [
      config.walkAnim,
      config.runAnim,
      config.leftWalkAnim,
      config.rightWalkAnim,
      config.backwardAnim
    ].filter((value) => !!value).includes(name);
  }
  // 从骨骼采样点上方发射射线。
  castGroundAtSample(sampleWorld) {
    return this.castGroundFrom(sampleWorld.x, sampleWorld.y + this.sampleRayOriginY, sampleWorld.z);
  }
  // 读取本帧碰撞网格，供后续脚底射线共用。
  refreshColliderMeshes() {
    this.colliderMeshes = this.player?.getColliderMeshes() ?? this.colliderMeshes;
  }
  // 优先读取移动系统最终采用的支撑。
  castCapsuleGround() {
    const capsule = this.player?.playerCapsule;
    if (!capsule) return null;
    const activeBody = this.player?.getActiveDynamicBody?.();
    const ignoreSupport = activeBody?.kind === "sphere";
    const getGroundSupport = this.player?.getGroundSupport;
    if (getGroundSupport && !ignoreSupport) {
      const support = getGroundSupport.call(this.player);
      if (!support) return null;
      this.capsuleHit.point.copy(support.point);
      this.capsuleHit.normal.copy(support.normal);
      this.capsuleHit.object = void 0;
      return this.capsuleHit;
    }
    const hit = this.castGroundFrom(
      capsule.position.x,
      capsule.position.y,
      capsule.position.z
    );
    return hit ? copyGroundHit(hit, this.capsuleHit) : null;
  }
  // 从指定世界坐标向下检测可踩踏地面，结果写入复用命中对象。
  castGroundFrom(x, y, z) {
    this.raycaster.ray.origin.set(x, y, z);
    const hits = this.raycaster.intersectObjects(this.colliderMeshes, false);
    let foundMesh = false;
    for (let i = 0; i < hits.length; i++) {
      const meshHit = hits[i];
      if (this.getMeshWorldHitNormal(meshHit, this.groundHit.normal).y <= 0.18) continue;
      this.groundHit.point.copy(meshHit.point);
      this.groundHit.object = meshHit.object;
      foundMesh = true;
      break;
    }
    const dynamicHit = this.player?.raycastDynamicGround?.(
      this.raycaster.ray.origin,
      0.18,
      FOOT_IK_IGNORED_DYNAMIC_KINDS
    );
    if (!dynamicHit) return foundMesh ? this.groundHit : null;
    const distance = y - dynamicHit.point.y;
    if (distance < this.raycaster.near || distance > this.raycaster.far) {
      return foundMesh ? this.groundHit : null;
    }
    if (foundMesh && this.groundHit.point.y >= dynamicHit.point.y) return this.groundHit;
    this.groundHit.point.copy(dynamicHit.point);
    this.groundHit.normal.copy(dynamicHit.normal);
    this.groundHit.object = dynamicHit.body?.mesh;
    return this.groundHit;
  }
  // 将 mesh 射线命中的局部法线转换为世界空间法线。
  getMeshWorldHitNormal(hit, target) {
    target.copy(hit.face?.normal ?? this.up);
    this.normalMatrix.getNormalMatrix(hit.object.matrixWorld);
    target.applyMatrix3(this.normalMatrix).normalize();
    return target;
  }
  // 根据双脚高台面和脚目标可达性对骨盆做平滑补偿。
  applyPelvis(delta) {
    if (!this.hips) return;
    if (this.pelvisOffsetOverride !== null) {
      this.pelvisOffset = this.pelvisOffsetOverride;
    } else {
      const raiseOffset = this.getRequiredPelvisRaise();
      const leftDrop = isReadyLeg(this.legs.left) ? this.getRequiredPelvisDrop(this.legs.left) : 0;
      const rightDrop = isReadyLeg(this.legs.right) ? this.getRequiredPelvisDrop(this.legs.right) : 0;
      const reachOffset = MathUtils4.clamp(
        Math.min(leftDrop, rightDrop, 0),
        -this.maxPelvisDrop,
        0
      );
      const wantedWorldOffset = raiseOffset > 0 ? raiseOffset : Math.max(reachOffset, this.getSupportLimitedPelvisDrop());
      this.pelvisOffset = MathUtils4.damp(this.pelvisOffset, wantedWorldOffset, 12, delta);
    }
    if (Math.abs(this.pelvisOffset) < this.snapEpsilon) return;
    const parent = this.hips.parent;
    if (!parent) return;
    this.capture(this.hips);
    const targetWorld = this.hips.getWorldPosition(this.tmpV1).addScaledVector(this.up, this.pelvisOffset);
    parent.worldToLocal(targetWorld);
    this.hips.position.copy(targetWorld);
    this.hips.updateMatrixWorld(true);
  }
  // 双脚都高于胶囊时，按较低脚与胶囊的高度差上抬骨盆。
  getRequiredPelvisRaise() {
    const left = this.legs.left;
    const right = this.legs.right;
    if (!isReadyLeg(left) || !isReadyLeg(right)) return 0;
    const leftSupportY = this.getLegSupportY(left);
    const rightSupportY = this.getLegSupportY(right);
    if (!Number.isFinite(leftSupportY) || !Number.isFinite(rightSupportY)) return 0;
    const capsuleHit = this.castCapsuleGround();
    if (!capsuleHit) return 0;
    const heightDelta = Math.min(leftSupportY, rightSupportY) - capsuleHit.point.y;
    if (heightDelta <= 0) return 0;
    return MathUtils4.clamp(heightDelta, 0, this.maxPelvisRaise);
  }
  // 计算脚骨骼水平位置在当前支撑平面上对应的高度。
  getLegSupportY(leg) {
    if (leg.supportNormal.y <= 0.18) return NaN;
    const footWorld = leg.foot.getWorldPosition(this.tmpV1);
    return leg.supportPoint.y - (leg.supportNormal.x * (footWorld.x - leg.supportPoint.x) + leg.supportNormal.z * (footWorld.z - leg.supportPoint.z)) / leg.supportNormal.y;
  }
  // 脚下支撑面只限制骨盆最多下沉到哪里，不直接推动骨盆，避免中心射线命中错误表面时抬动模型。
  getSupportLimitedPelvisDrop() {
    const capsuleHit = this.castCapsuleGround();
    if (!capsuleHit) return -this.maxPelvisDrop;
    let lowestSupportDelta = 0;
    let hasSupport = false;
    for (const leg of Object.values(this.legs)) {
      if (!isReadyLeg(leg) || !leg.hasPelvisTarget) continue;
      const supportY = this.getLegSupportY(leg);
      if (!Number.isFinite(supportY)) continue;
      lowestSupportDelta = Math.min(
        lowestSupportDelta,
        supportY - capsuleHit.point.y
      );
      hasSupport = true;
    }
    return hasSupport ? MathUtils4.clamp(lowestSupportDelta, -this.maxPelvisDrop, 0) : -this.maxPelvisDrop;
  }
  // 按双骨骼 IK 的最大伸展距离，反算脚目标进入可达范围所需的最小骨盆下沉量。
  getRequiredPelvisDrop(leg) {
    if (!leg.hasPelvisTarget) return 0;
    const hip = leg.upper.getWorldPosition(this.tmpV1);
    const knee = leg.lower.getWorldPosition(this.tmpV2);
    const foot = leg.foot.getWorldPosition(this.tmpV3);
    const upperLen = Math.max(1e-4, hip.distanceTo(knee));
    const lowerLen = Math.max(1e-4, knee.distanceTo(foot));
    const maxReach = Math.sqrt(
      upperLen * upperLen + lowerLen * lowerLen + 2 * upperLen * lowerLen * Math.cos(this.pelvisKneeBend)
    );
    const deltaX = leg.pelvisTarget.x - hip.x;
    const deltaY = leg.pelvisTarget.y - hip.y;
    const deltaZ = leg.pelvisTarget.z - hip.z;
    const horizontalSq = deltaX * deltaX + deltaZ * deltaZ;
    const maxReachSq = maxReach * maxReach;
    if (horizontalSq + deltaY * deltaY <= maxReachSq || deltaY >= 0) return 0;
    if (horizontalSq >= maxReachSq) return deltaY;
    const verticalReach = Math.sqrt(maxReachSq - horizontalSq);
    return Math.min(0, deltaY + verticalReach);
  }
  /** 在预测摆腿末段逐渐把脚掌旋转到落点支撑面。 */
  preAlignPredictiveLandingRotation(leg, phase) {
    if (!phase) return;
    const state = leg.predictive;
    if (state.mode !== "active" || leg.planted || state.landingNormal.y <= 0.18) {
      return;
    }
    const localProgress = getPredictiveLocalProgress(
      state.trajectoryProgress,
      state.trajectoryStartProgress
    );
    const rotationWeight = MathUtils4.smoothstep(
      localProgress,
      PREDICTION_ROTATION_WARP_START,
      1
    ) * state.predictionWeight;
    if (rotationWeight <= 1e-3) return;
    this.getConstrainedFootAlign(
      state.landingNormal,
      this.footAlignWeight,
      this.tmpQ2
    );
    const targetWorldQ = this.tmpQ3.copy(this.tmpQ2).multiply(state.animatedLandingRotation);
    const currentWorldQ = leg.foot.getWorldQuaternion(
      this.tmpQ1
    );
    currentWorldQ.slerp(
      targetWorldQ,
      rotationWeight
    );
    const parent = leg.foot.parent;
    if (!parent) return;
    const parentWorldQ = parent.getWorldQuaternion(
      this.tmpQ4
    );
    this.capture(leg.foot);
    leg.foot.quaternion.copy(
      parentWorldQ.invert().multiply(currentWorldQ)
    );
    leg.foot.updateMatrixWorld(true);
  }
  // 对指定腿执行 IK 求解并贴合脚掌。
  applyLeg(side, useStraightPole) {
    const leg = this.legs[side];
    if (!isReadyLeg(leg) || leg.weight <= 1e-3) return;
    this.savedFootWorldQ.copy(leg.foot.getWorldQuaternion(this.tmpQ1));
    const predictiveSwing = this.predictivePlacement && !leg.planted && leg.predictive.mode === "active";
    if (predictiveSwing) {
      this.clampPredictiveTargetToReach(leg, leg.smoothedTarget);
      leg.predictive.trajectoryCurrentTarget.copy(leg.smoothedTarget);
    } else if (leg.planted && leg.hasPelvisTarget) {
      if (!Number.isFinite(this.getHeightSpeed(this.plantedHeightSpeed))) {
        leg.smoothedTarget.copy(leg.pelvisTarget);
      }
      this.clampPredictiveTargetToReach(leg, leg.smoothedTarget);
    }
    this.solveLeg(
      leg,
      leg.smoothedTarget,
      leg.weight,
      useStraightPole ? 1 : 0
    );
    this.preserveFootWorldRotation(leg, this.savedFootWorldQ, leg.weight);
    if (predictiveSwing) {
      this.preAlignPredictiveLandingRotation(
        leg,
        this.footPhaseState?.[side]
      );
    }
    if (leg.planted || leg.movePenetrating || leg.plantedWeight > 1e-3) {
      this.alignFootToGround(leg);
    }
    if (leg.planted) {
      this.correctPostAlignSoleContact(leg);
    }
  }
  // 抵消腿部 IK 对 foot 子骨骼造成的被动旋转，保留动画本来的脚掌朝向。
  preserveFootWorldRotation(leg, animatedWorldQ, weight) {
    this.capture(leg.foot);
    const currentWorldQ = leg.foot.getWorldQuaternion(this.tmpQ1);
    currentWorldQ.slerp(animatedWorldQ, MathUtils4.clamp(weight, 0, 1));
    const parentWorldQ = leg.foot.parent?.getWorldQuaternion(this.tmpQ2);
    if (!parentWorldQ) return;
    leg.foot.quaternion.copy(parentWorldQ.invert().multiply(currentWorldQ));
    leg.foot.updateMatrixWorld(true);
  }
  // 使用受约束的双骨骼 IK，让脚靠近目标点。
  solveLeg(leg, target, weight, straightPoleWeight = 0) {
    let kneePlaneNormal;
    if (straightPoleWeight > 1e-3) {
      const capsule = this.player?.playerCapsule;
      if (!capsule) return;
      kneePlaneNormal = this.tmpV4.set(1, 0, 0).applyQuaternion(capsule.getWorldQuaternion(this.tmpQ3)).normalize();
    }
    solveTwoBoneIK(leg, target, weight, {
      capture: (bone) => this.capture(bone),
      minKneeBend: this.minKneeBend,
      maxKneeBend: this.maxKneeBend,
      kneePlaneNormal,
      kneePlaneWeight: straightPoleWeight,
      scratch: this.twoBoneIKScratch
    });
  }
  // 脚掌贴坡会绕 foot 骨骼旋转，旋转后重新校正脚底接触。
  correctPostAlignSoleContact(leg) {
    if (leg.weight <= 1e-3) return;
    const footWorld = leg.foot.getWorldPosition(this.tmpV1);
    this.updateSoleSamples(leg);
    let contactOffset = -Infinity;
    let anyContactHit = false;
    for (const sample of leg.soleSamples) {
      sample.hasHit = false;
      const hit = this.castGroundAtSample(sample.point);
      if (!hit) continue;
      sample.hasHit = true;
      sample.hitPoint.copy(hit.point);
      const sampleOffset = hit.point.y - sample.point.y;
      if (!leg.planted && sampleOffset < 0) continue;
      if (leg.planted && sampleOffset < -this.maxFootDrop) continue;
      if (sampleOffset > this.maxFootRaise) continue;
      anyContactHit = true;
      contactOffset = Math.max(contactOffset, sampleOffset);
    }
    if (!anyContactHit) return;
    if (leg.planted && contactOffset < -this.maxFootDrop) return;
    if (contactOffset > this.maxFootRaise) return;
    contactOffset = leg.planted ? contactOffset : MathUtils4.clamp(contactOffset, 0, this.maxFootRaise);
    if (Math.abs(contactOffset) <= this.snapEpsilon) return;
    if (leg.planted && Math.abs(contactOffset) > Math.max(this.snapEpsilon, 4 * this.appliedScale)) {
      return;
    }
    this.savedAlignedFootWorldQ.copy(leg.foot.getWorldQuaternion(this.tmpQ1));
    const correctedTarget = this.tmpV2.copy(footWorld).addScaledVector(this.up, contactOffset);
    this.solveLeg(leg, correctedTarget, leg.weight);
    this.preserveFootWorldRotation(leg, this.savedAlignedFootWorldQ, 1);
  }
  // 根据地面法线轻微调整脚掌朝向。
  alignFootToGround(leg) {
    if (leg.hitNormal.y < 0.35 || leg.weight <= 1e-3) return;
    this.capture(leg.foot);
    const footWorldQ = leg.foot.getWorldQuaternion(this.tmpQ1);
    const alignQ = this.getConstrainedFootAlign(
      leg.hitNormal,
      leg.weight * this.footAlignWeight,
      this.tmpQ2
    );
    const targetWorldQ = alignQ.multiply(footWorldQ);
    const parentWorldQ = leg.foot.parent?.getWorldQuaternion(this.tmpQ3);
    if (!parentWorldQ) return;
    leg.foot.quaternion.copy(parentWorldQ.invert().multiply(targetWorldQ));
    leg.foot.updateMatrixWorld(true);
  }
  // 保存骨骼原始姿态，便于下一帧恢复。
  capture(bone) {
    if (this.adjusted.has(bone)) return;
    let pose = this.poseCache.get(bone);
    if (!pose) {
      pose = {
        position: new Vector37(),
        quaternion: new Quaternion5()
      };
      this.poseCache.set(bone, pose);
    }
    pose.position.copy(bone.position);
    pose.quaternion.copy(bone.quaternion);
    this.adjusted.add(bone);
  }
  // 创建统一调试对象：IK 目标、最高命中、脚底四点。
  createDebugObjects() {
    createDebugObjects(this.player?.scene ?? null, this.legs, this.debug);
  }
  // 更新单脚调试标记（含脚底四点和最大上抬范围）；超出范围的线框命中球标红。
  updateFootDebug(leg, hitPoint) {
    updateFootDebug(
      this.debug,
      leg,
      hitPoint,
      this.appliedScale,
      this.maxFootRaise
    );
  }
  // 统一切换全部 Foot IK 调试对象的显示状态。
  setDebugVisible(visible) {
    setDebugVisible(this.legs, visible);
  }
  /** 控制 Foot IK 调试对象显隐（IK 目标、最高命中、脚底四点）。 */
  setDebugEnabled(enabled) {
    if (this.disposed) return;
    this.debug = enabled;
    if (enabled) {
      this.createDebugObjects();
    }
    this.setDebugVisible(enabled);
  }
  /** 读取当前可调配置（不含 skeleton）。距离和速度类参数返回 scale=1 基准值。 */
  getOptions() {
    return {
      enabled: this.enabled,
      debug: this.debug,
      maxPelvisDrop: this.toBaseDistance(this.maxPelvisDrop),
      maxPelvisRaise: this.toBaseDistance(this.maxPelvisRaise),
      maxFootRaise: this.toBaseDistance(this.maxFootRaise),
      maxFootDrop: this.toBaseDistance(this.maxFootDrop),
      plantedHeightSpeed: this.toBaseDistance(this.plantedHeightSpeed),
      penetrationLiftSpeed: this.toBaseDistance(this.penetrationLiftSpeed),
      soleHalfWidth: this.toBaseDistance(this.soleHalfWidth),
      soleToeExtend: this.toBaseDistance(this.soleToeExtend),
      soleHeelExtend: this.toBaseDistance(this.soleHeelExtend),
      soleSkinThickness: this.toBaseDistance(this.soleSkinThickness),
      footAlignWeight: this.footAlignWeight,
      maxFootTilt: this.maxFootTilt,
      minKneeBend: this.minKneeBend,
      maxKneeBend: this.maxKneeBend,
      pelvisKneeBend: this.pelvisKneeBend,
      straightPoleEnabled: this.straightPoleEnabled,
      moveLiftThreshold: this.toBaseDistance(this.moveLiftThreshold),
      footPhaseSampleCount: this.footPhaseOptions.sampleCount,
      footPhaseGroundThreshold: this.toBaseDistance(this.footPhaseGroundThreshold),
      footPhaseMinContactRatio: this.footPhaseOptions.minContactRatio,
      footPhaseSpeedSlack: this.footPhaseOptions.speedSlack,
      predictivePlacement: this.predictivePlacement,
      predictionHorizon: this.predictionHorizon,
      predictionProbeFrames: this.predictionProbeFrames,
      predictionSearchRadius: this.toBaseDistance(this.predictionSearchRadius),
      maxPredictionCorrection: this.toBaseDistance(this.maxPredictionCorrection),
      predictionMinNormalY: this.predictionMinNormalY,
      swingClearance: this.toBaseDistance(this.swingClearance),
      maxPredictionClearance: this.toBaseDistance(this.maxPredictionClearance)
    };
  }
  /**
   * 运行时更新部分配置。
   * 距离和速度类参数传入 scale=1 基准值，内部会乘以当前 playerModelConfig.scale。
   * sole 尺寸变化会重建本地采样点，脚步相位相关参数变化会重建相位库。
   */
  configure(options) {
    if (this.disposed) return;
    if (options.enabled !== void 0) this.setEnabled(options.enabled);
    if (options.debug !== void 0) this.setDebugEnabled(options.debug);
    if (options.predictivePlacement !== void 0 && options.predictivePlacement !== this.predictivePlacement) {
      this.predictivePlacement = options.predictivePlacement;
      this.resetPredictionRuntime();
    }
    let soleDirty = false;
    let phaseDirty = false;
    if (options.maxPelvisDrop !== void 0) {
      this.maxPelvisDrop = this.scaleDistance(options.maxPelvisDrop);
    }
    if (options.maxPelvisRaise !== void 0) {
      this.maxPelvisRaise = this.scaleDistance(options.maxPelvisRaise);
    }
    if (options.maxFootRaise !== void 0) {
      this.maxFootRaise = this.scaleDistance(options.maxFootRaise);
    }
    if (options.maxFootDrop !== void 0) {
      this.maxFootDrop = this.scaleDistance(options.maxFootDrop);
    }
    if (options.plantedHeightSpeed !== void 0) {
      this.plantedHeightSpeed = this.scaleDistance(options.plantedHeightSpeed);
    }
    if (options.penetrationLiftSpeed !== void 0) {
      this.penetrationLiftSpeed = this.scaleDistance(options.penetrationLiftSpeed);
    }
    if (options.soleHalfWidth !== void 0) {
      this.soleHalfWidth = this.scaleDistance(options.soleHalfWidth);
      soleDirty = true;
    }
    if (options.soleToeExtend !== void 0) {
      this.soleToeExtend = this.scaleDistance(options.soleToeExtend);
      soleDirty = true;
    }
    if (options.soleHeelExtend !== void 0) {
      this.soleHeelExtend = this.scaleDistance(options.soleHeelExtend);
      soleDirty = true;
    }
    if (options.soleSkinThickness !== void 0) {
      this.soleSkinThickness = this.scaleDistance(options.soleSkinThickness);
      soleDirty = true;
    }
    if (options.footAlignWeight !== void 0) {
      this.footAlignWeight = MathUtils4.clamp(options.footAlignWeight, 0, 1);
    }
    if (options.maxFootTilt !== void 0) {
      this.maxFootTilt = MathUtils4.clamp(options.maxFootTilt, 0, Math.PI);
    }
    if (options.minKneeBend !== void 0 || options.maxKneeBend !== void 0) {
      const minBend = MathUtils4.clamp(options.minKneeBend ?? this.minKneeBend, 0, Math.PI);
      const maxBend = MathUtils4.clamp(options.maxKneeBend ?? this.maxKneeBend, 0, Math.PI);
      this.minKneeBend = Math.min(minBend, maxBend);
      this.maxKneeBend = Math.max(minBend, maxBend);
      this.pelvisKneeBend = MathUtils4.clamp(
        this.pelvisKneeBend,
        this.minKneeBend,
        this.maxKneeBend
      );
    }
    if (options.pelvisKneeBend !== void 0) {
      this.pelvisKneeBend = MathUtils4.clamp(
        options.pelvisKneeBend,
        this.minKneeBend,
        this.maxKneeBend
      );
    }
    if (options.straightPoleEnabled !== void 0) {
      this.straightPoleEnabled = options.straightPoleEnabled;
    }
    if (options.moveLiftThreshold !== void 0) {
      this.moveLiftThreshold = this.scaleDistance(options.moveLiftThreshold);
    }
    if (options.predictionHorizon !== void 0) {
      this.predictionHorizon = Math.max(0, options.predictionHorizon);
    }
    if (options.predictionProbeFrames !== void 0) {
      this.predictionProbeFrames = Math.max(0, options.predictionProbeFrames);
    }
    if (options.predictionSearchRadius !== void 0) {
      this.predictionSearchRadius = this.scaleDistance(options.predictionSearchRadius);
    }
    if (options.maxPredictionCorrection !== void 0) {
      this.maxPredictionCorrection = this.scaleDistance(options.maxPredictionCorrection);
    }
    if (options.predictionMinNormalY !== void 0) {
      this.predictionMinNormalY = MathUtils4.clamp(options.predictionMinNormalY, 0, 1);
    }
    if (options.swingClearance !== void 0) {
      this.swingClearance = this.scaleDistance(options.swingClearance);
    }
    if (options.maxPredictionClearance !== void 0) {
      this.maxPredictionClearance = this.scaleDistance(options.maxPredictionClearance);
    }
    if (options.footPhaseGroundThreshold !== void 0) {
      this.footPhaseGroundThreshold = this.scaleDistance(options.footPhaseGroundThreshold);
      this.footPhaseOptions.groundThreshold = this.footPhaseGroundThreshold;
      phaseDirty = true;
    }
    if (options.footPhaseSampleCount !== void 0 || options.footPhaseMinContactRatio !== void 0 || options.footPhaseSpeedSlack !== void 0) {
      this.footPhaseOptions = createFootPhaseOptions({
        footPhaseSampleCount: options.footPhaseSampleCount ?? this.footPhaseOptions.sampleCount,
        footPhaseGroundThreshold: this.footPhaseGroundThreshold,
        footPhaseMinContactRatio: options.footPhaseMinContactRatio ?? this.footPhaseOptions.minContactRatio,
        footPhaseSpeedSlack: options.footPhaseSpeedSlack ?? this.footPhaseOptions.speedSlack
      });
      phaseDirty = true;
    }
    if (soleDirty) {
      this.initSoleLocalSamples(this.legs.left);
      this.initSoleLocalSamples(this.legs.right);
    }
    if (phaseDirty) {
      this.buildFootPhaseDatabase();
    }
  }
  /** 返回指定脚当前动画相位的调试文本。 */
  getFootPhaseDebugText(side) {
    return getFootPhaseDebugText(this.footPhaseState, this.footPhaseClips, side);
  }
  /** 返回指定脚当前的最终 IK 权重。 */
  getFootIKWeight(side) {
    return this.legs[side].weight;
  }
  /** 返回当前骨盆沿世界上方向的偏移，scale=1 基准值；上抬为正、下沉为负。 */
  getPelvisOffset() {
    return this.toBaseDistance(this.pelvisOffset);
  }
  /**
   * 每帧写入骨盆沿世界上方向的偏移，scale=1 基准值；上抬为正、下沉为负。
   * 写入后内部 wanted 不再覆盖，直到 clearPelvisOffset()。
   */
  setPelvisOffset(value) {
    if (this.disposed) return;
    this.pelvisOffsetOverride = Number.isFinite(value) ? value * this.getPlayerScale() : 0;
    this.pelvisOffset = this.pelvisOffsetOverride;
  }
  /** 取消外部骨盆偏移，恢复内部计算结果。 */
  clearPelvisOffset() {
    if (this.disposed) return;
    this.pelvisOffsetOverride = null;
  }
  /** 返回指定脚距离下一次落地的时间（秒）；无相位数据时为 Infinity。 */
  getFootTimeToLand(side) {
    return this.footPhaseState[side].timeToLand;
  }
  /** 返回指定脚的预测落脚调试状态；预测关闭时返回 disabled。 */
  getPredictiveFootDebugText(side) {
    if (!this.predictivePlacement) return "disabled";
    const state = this.legs[side].predictive;
    return `${state.mode} d=${state.debugPlaneLift.toFixed(2)} swing=${state.debugSwingLift.toFixed(2)}`;
  }
  /** 返回指定脚当前预测候选的调试评分；分数越小越好，无有效候选或预测关闭时返回 Infinity。 */
  getPredictiveFootScore(side) {
    if (!this.predictivePlacement) return Infinity;
    return this.legs[side].predictive.score;
  }
};
export {
  FootIK
};
