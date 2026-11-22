import * as THREE from "three";
import { createNativeMotion } from "./visitor-motion-v43.js?v=43";
import { createReadyCrowd, READY_CROWD_FIXED_DT } from "./ready-crowd-v1.js?v=44";

// v44 owns behaviour and the connection between two existing systems:
// DetourCrowd owns ALL world positions; the unchanged v43 mixer owns ALL bones.
// No A*, Bezier path follower, IK, joint offsets, or synthetic foot placement.
const profiles = [
  { id: "emma", model: "woman", speed: 1.14, start: 0, seed: 0x7254a11 },
  { id: "ethan", model: "man", speed: 1.04, start: 3, seed: 0x39cb7d2 },
];
const stationInfo = [
  { name: "Робот и реактор", target: [-3.55, 2.55] },
  { name: "Поезд Москва-2024", target: [3.55, 2.55] },
  { name: "Москва-Сити", target: [0, 5.48] },
  { name: "Новый жилой микрорайон", target: [-3.35, -3.55] },
  { name: "Большая спортивная арена", target: [3.35, -3.55] },
  { name: "Видеокуб", target: [0, -.35] },
];
const radius = .70;
const envelopeRadius = .68;
const leadDistance = .65;
const intermediateLookahead = .18;
const facingAngularSpeed = 2.4;
const facingVelocityThreshold = .10;
const upAxis = new THREE.Vector3(0, 1, 0);
const facingQuaternion = new THREE.Quaternion();
const holderYaw = actor => {
  const q = actor.holder.quaternion;
  return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.x * q.x + q.y * q.y));
};
const turnBlend = .18;
const locomotionBlendDuration = .18;
const waitLimit = 12;
const stallLimit = 12;
const yieldPause = .6;
const lateYieldReplanAfter = 3;
const recoveryTotalLimit = 24;
const recoveryReplanLimit = 3;
const dt = READY_CROWD_FIXED_DT;
const clamp = THREE.MathUtils.clamp;
const smooth = THREE.MathUtils.smoothstep;
const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const ease = t => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };
const xz = value => Array.isArray(value)
  ? { x: value[0], y: 0, z: value.length > 2 ? value[2] : value[1] }
  : { x: value.x, y: 0, z: value.z };
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const facing = yaw => ({ x: Math.sin(yaw), y: 0, z: Math.cos(yaw) });
const along = (p, direction, amount) => ({ x: p.x + direction.x * amount, y: 0, z: p.z + direction.z * amount });
const turnPoint = (origin, yaw, local) => ({
  x: origin.x + local.x * Math.cos(yaw) + local.z * Math.sin(yaw),
  y: 0,
  z: origin.z - local.x * Math.sin(yaw) + local.z * Math.cos(yaw),
});
const pathLength = path => path.slice(1).reduce((sum, p, i) => sum + distance(path[i], p), 0);
function randomGenerator(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function shuffled(values, random) {
  const bag = values.slice();
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}
const params = new URLSearchParams(location.search);
const sessionSeed = (Number(params.get("visitorSeed")) || crypto.getRandomValues(new Uint32Array(1))[0]) >>> 0;
const demoPeriod = Math.max(1, Number(params.get("visitorDemoEvery")) || 300);
const demoOnly = params.has("visitorDemoOnly");
const forcedDemo = params.get("visitorDemoAction");
const gestureNames = { wave: "Wave", talk: "Talk", clap: "Clap", think: "Think", cheer: "Cheer", shrug: "Shrug" };
// Existing bundles remain intact. A clip is enabled only after its CURRENT rig
// and the actual Idle/gesture blend fit the .68 m envelope. Never substitute an
// unsupported forced action with a different gesture.
const allowedGestures = ["clap", "think", "shrug"];
const gesturePolicy = {
  envelopeRadius,
  supported: allowedGestures,
  pending: [],
  compactGestureGate: { fullSkinVertices: true, pureMaximumRadius: .513107, sampledBlendMaximumRadius: .398786,
    blendDuration: .24, idlePhases: 4, edgeTimes: 24, weights: [.25, .5, .75], minimumPureMargin: .166893 },
  disabled: {
    wave: "Current-rig skin exceeds the .68 m envelope.",
    cheer: "Emma current-rig skin exceeds the .68 m envelope.",
    talk: "Ethan has only .525 mm pure-clip margin; blend margin is unverified.",
  },
  sourceClipsRetained: true,
};
function demoForSlot(slot) {
  if (forcedDemo) return allowedGestures.includes(forcedDemo) ? forcedDemo : null;
  if (!allowedGestures.length) return null;
  const cycle = Math.floor((slot - 1) / allowedGestures.length);
  return shuffled(allowedGestures, randomGenerator(0x45f21a9 ^ cycle ^ sessionSeed))[(slot - 1) % allowedGestures.length];
}
function rawClearance(p, layout) {
  const b = layout.bounds;
  let result = Math.min(p.x - b.minX, b.maxX - p.x, p.z - b.minZ, b.maxZ - p.z);
  for (const [minX, maxX, minZ, maxZ] of layout.obstacles) {
    const dx = Math.max(minX - p.x, 0, p.x - maxX);
    const dz = Math.max(minZ - p.z, 0, p.z - maxZ);
    const d = dx || dz ? Math.hypot(dx, dz) : -Math.min(p.x - minX, maxX - p.x, p.z - minZ, maxZ - p.z);
    result = Math.min(result, d);
  }
  return result;
}
function poseNumbers(bone) {
  return { name: bone.name, position: bone.position.toArray(), quaternion: bone.quaternion.toArray(), scale: bone.scale.toArray() };
}

export function addWalkers(scene, loader, contactMaterial) {
  const actors = [], errors = [], failures = [], egressEvents = [];
  let world = null, layout = null, stations = [];
  let ready = false, paused = false, previousInput = null, accumulator = 0, simulationTime = 0, droppedTime = 0;
  let yieldingId = null;
  const diagnostics = {
    fixedSteps: 0, minimumPairDistance: Infinity, minimumStaticClearance: Infinity,
    maximumRenderedWorldDeviation: 0, maximumRootMotionDeviation: 0,
    rejectedRootSteps: 0, appliedRootSteps: 0, rootPoseAdvancedWithoutApplication: 0,
    navigationPreflightFailures: 0, completedJourneys: 0,
    maximumYawStep: 0, maximumFacingVelocityAngle: 0, maximumFacingVelocityLagSeconds: 0, facingVelocityOver45DegreesTime: 0,
    reversedExitCandidates: 0, reversedEntryCandidates: 0, occupiedExitCandidates: 0, recentHistoryFallbacks: 0, recoveryBlockedCandidates: 0, egressGrants: 0, maximumRecoverySeconds: 0, recoveryCompletions: 0, yieldCount: 0, yieldResumes: 0, yieldReplans: 0, totalYieldSeconds: 0, maximumYieldSeconds: 0, secondaryYieldSignals: 0,
  };
  const stationPoint = index => stations[index];
  const viewYaw = index => Math.atan2(stationInfo[index].target[0] - stations[index].x, stationInfo[index].target[1] - stations[index].z);

  function failActor(actor, code, detail) {
    if (actor.behavior.phase === "failed") return;
    world.stop(actor.id);
    world.releaseReservation(actor.id);
    if (yieldingId === actor.id) yieldingId = null;
    actor.motion.activateTurn(null);
    actor.motion.activateGesture(null);
    actor.pendingTurn = null;
    actor.behavior.phase = "failed";
    actor.behavior.failure = { code, detail, time: simulationTime };
    actor.poseRequest = { walkDistance: actor.walkDistance, walkWeight: actor.walkBlend || 0, idleTime: actor.idleTime };
    const failure = { id: actor.id, code, detail, time: simulationTime };
    failures.push(failure);
    errors.push(actor.id + ": " + code + ": " + detail);
    console.error("[visitors-v44]", failure);
  }

  function clearPoint(actor, point, checkPeers = true) {
    const clearance = rawClearance(point, layout);
    if (clearance < radius - 1e-6) return { clear: false, reason: "static-clearance", clearance };
    let projected;
    try { projected = world.project(point); } catch { return { clear: false, reason: "outside-navmesh" }; }
    const shift = distance(point, projected);
    if (shift > .01 + 1e-6) return { clear: false, reason: "inexact-navmesh-projection", shift };
    if (checkPeers) for (const other of actors) {
      if (other === actor) continue;
      const gap = distance(point, world.get(other.id).position);
      if (gap < 2 * radius - 1e-6) return { clear: false, reason: "agent-clearance", other: other.id, gap };
    }
    return { clear: true, clearance, projectionShift: shift };
  }

  function turnPreflight(actor, turn, origin, yaw) {
    const samples = turn ? turn.path : [{ x: 0, z: 0, yaw: 0 }];
    let minimumClearance = Infinity, minimumPeerDistance = Infinity, maximumProjectionShift = 0;
    for (const sample of samples) {
      const p = turnPoint(origin, yaw, sample);
      const result = clearPoint(actor, p);
      if (!result.clear) return { clear: false, ...result };
      minimumClearance = Math.min(minimumClearance, result.clearance);
      maximumProjectionShift = Math.max(maximumProjectionShift, result.projectionShift);
      for (const other of actors) if (other !== actor) minimumPeerDistance = Math.min(minimumPeerDistance, distance(p, world.get(other.id).position));
    }
    return { clear: true, sampleCount: samples.length, minimumClearance, minimumPeerDistance, maximumProjectionShift };
  }

  function pathBetween(a, b, straight = false) {
    const result = world.queryPath(a, b);
    if (!result.success || distance(result.start, a) > .01 || distance(result.target, b) > .01) return null;
    if (straight) {
      const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
      if (length < .01) return null;
      for (const p of result.path) {
        const offset = Math.abs((p.x - a.x) * dz - (p.z - a.z) * dx) / length;
        const progress = ((p.x - a.x) * dx + (p.z - a.z) * dz) / length;
        if (offset > .02 || progress < -.02 || progress > length + .02) return null;
      }
    }
    return { path: result.path.map(xz), length: pathLength(result.path) };
  }

  function journeyChoice(actor) {
    const b = actor.behavior, origin = xz(world.get(actor.id).position), yaw = holderYaw(actor);
    const banned = new Set(b.recent.slice(-2));
    const available = stations.map((_, i) => i).filter(i => i !== b.current && i !== b.replanExclude && (world.stationOwner(i) === null || world.stationOwner(i) === actor.id));
    const preferred = available.filter(i => !banned.has(i));
    const primary = shuffled(preferred.length ? preferred : available, actor.random);
    const fallback = preferred.length ? available.filter(i => banned.has(i)) : [];
    const starts = [];
    for (const turn of [null, ...actor.motion.turns.values()]) {
      const preflight = turnPreflight(actor, turn, origin, yaw);
      if (!preflight.clear) { diagnostics.navigationPreflightFailures++; continue; }
      const end = turn ? turn.at(turn.duration) : { x: 0, z: 0, yaw: 0 };
      const endpoint = turnPoint(origin, yaw, end), endYaw = yaw + end.yaw;
      starts.push({ turn, preflight, origin, yaw, endpoint, endYaw });
    }
    function choose(destinations) {
      for (const destination of destinations) {
        const goal = stationPoint(destination);
        const entry = along(goal, facing(viewYaw(destination) + actor.motion.forwardYaw), -leadDistance);
        const finalLead = pathBetween(entry, goal, true);
        if (!finalLead) continue;
        const choices = [];
        for (const start of starts) {
          // Detour chooses the route directly from the authored turn endpoint.
          // There is no fabricated exit waypoint to create an extra corner.
          const middle = pathBetween(start.endpoint, entry);
          if (!middle) continue;
          const departurePath = [...middle.path, ...finalLead.path.slice(1)];
          const prefix = pathPrefix(departurePath, leadDistance);
          const occupied = actors.some(other => {
            if (other === actor || other.behavior.phase === "walk" || other.behavior.phase === "turn") return false;
            const peer = world.get(other.id);
            if (peer.actualSpeed > .02) return false;
            return prefix.slice(1).some((p, i) => pointSegmentDistance(peer.position, prefix[i], p) < 2 * radius);
          });
          if (occupied) { diagnostics.occupiedExitCandidates++; continue; }
          if (b.recoveryStartedAt !== null && prefixReservationCheck(actor, prefix).conflict) {
            diagnostics.recoveryBlockedCandidates++;
            continue;
          }
          const first = departurePath.find(p => distance(p, start.endpoint) > .001);
          const exitDirection = facing(start.endYaw + actor.motion.forwardYaw);
          const exitDirectionDot = first
            ? ((first.x - start.endpoint.x) * exitDirection.x + (first.z - start.endpoint.z) * exitDirection.z) / distance(first, start.endpoint) : 1;
          if (exitDirectionDot < 0) { diagnostics.reversedExitCandidates++; continue; }
          const beforeEntry = middle.path.slice().reverse().find(p => distance(p, entry) > .001);
          const finalDirection = facing(viewYaw(destination) + actor.motion.forwardYaw);
          const entryDirectionDot = beforeEntry
            ? ((entry.x - beforeEntry.x) * finalDirection.x + (entry.z - beforeEntry.z) * finalDirection.z) / distance(beforeEntry, entry) : 1;
          if (entryDirectionDot < 0) { diagnostics.reversedEntryCandidates++; continue; }
          const length = middle.length + finalLead.length;
          const alignmentAngle = Math.acos(clamp(exitDirectionDot, -1, 1));
          choices.push({ ...start, destination, entry, goal, length, exitDirectionDot, entryDirectionDot, alignmentAngle,
            departurePrefix: prefix, paths: [middle.path, finalLead.path],
            cost: length / actor.profile.speed + (start.turn ? start.turn.duration + 2 * turnBlend : 0) });
        }
        choices.sort((a, b) => a.alignmentAngle - b.alignmentAngle || a.cost - b.cost);
        for (const choice of choices) {
          const claim = world.reserveStation(actor.id, destination);
          if (claim.accepted) return choice;
        }
      }
      return null;
    }
    const chosen = choose(primary);
    if (chosen || !fallback.length) return chosen;
    // History is a preference. All physical/turn/path gates remain mandatory
    // when every preferred destination has failed the feasibility checks.
    diagnostics.recentHistoryFallbacks++;
    return choose(shuffled(fallback, actor.random));
  }

  // Two real navigation goals: approach point, then the reserved station.
  function stageGoal(actor, stage = actor.behavior.stage) {
    return stage === 0 ? actor.plan.entry : actor.plan.goal;
  }

  function pathPrefix(points, limit) {
    if (!points.length) return [];
    const prefix = [xz(points[0])];
    let remaining = limit;
    for (let i = 1; i < points.length && remaining > 1e-9; i++) {
      const a = prefix.at(-1), b = xz(points[i]), length = distance(a, b);
      if (length <= 1e-9) continue;
      if (length <= remaining) { prefix.push(b); remaining -= length; }
      else { prefix.push({ x: a.x + (b.x - a.x) * remaining / length, z: a.z + (b.z - a.z) * remaining / length }); break; }
    }
    return prefix;
  }

  function pointSegmentDistance(p, a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, lengthSq = dx * dx + dz * dz;
    const t = lengthSq > 1e-12 ? clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / lengthSq, 0, 1) : 0;
    return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
  }

  function segmentDistance(a, b, c, d) {
    const cross = (p, q, r) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
    const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
    if (abC * abD < 0 && cdA * cdB < 0) return 0;
    return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d),
      pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
  }

  function remainingCorridor(actor) {
    const b = actor.behavior;
    if (!actor.plan || b.phase !== "walk") return [];
    const current = world.queryPath(world.get(actor.id).position, stageGoal(actor));
    if (!current.success) return [];
    const path = current.path.map(xz);
    // Future pieces are the unmodified upstream queryPath results. Past pieces
    // are omitted, so a visitor which has passed cannot keep the lead reserved.
    for (let stage = b.stage + 1; stage < actor.plan.paths.length; stage++) {
      const piece = actor.plan.paths[stage];
      for (const p of piece) if (!path.length || distance(path.at(-1), p) > .001) path.push(xz(p));
    }
    return path;
  }

  function prefixReservationCheck(actor, prefix) {
    const egress = [];
    if (!prefix.length) return { conflict: { id: null, reason: "departure-upstream-path-unavailable" }, egress };
    for (const other of actors) {
      if (other === actor) continue;
      const peer = world.get(other.id).position;
      let minimumGap = distance(prefix[0], peer);
      for (let j = 1; j < prefix.length; j++) minimumGap = Math.min(minimumGap, pointSegmentDistance(peer, prefix[j - 1], prefix[j]));
      // Physical capsules always take precedence over the reservation exception.
      if (minimumGap < 2 * radius)
        return { conflict: { id: other.id, gap: minimumGap, reason: "ready-path-prefix-current-agent-volume" }, egress: [] };
      if (other.behavior.phase !== "walk") continue;
      const path = remainingCorridor(other);
      let futureGap = Infinity, actorCorridorGap = Infinity;
      for (let i = 1; i < path.length; i++) {
        actorCorridorGap = Math.min(actorCorridorGap, pointSegmentDistance(world.get(actor.id).position, path[i - 1], path[i]));
        for (let j = 1; j < prefix.length; j++)
          futureGap = Math.min(futureGap, segmentDistance(prefix[j - 1], prefix[j], path[i - 1], path[i]));
      }
      if (futureGap >= 2 * radius) continue;
      const initialDistance = distance(prefix[0], peer);
      let previousDistance = initialDistance, nonDecreasing = true;
      for (let j = 1; j < prefix.length; j++) {
        const closest = pointSegmentDistance(peer, prefix[j - 1], prefix[j]);
        const endpointDistance = distance(prefix[j], peer);
        if (closest + 1e-8 < previousDistance || endpointDistance + 1e-8 < previousDistance) nonDecreasing = false;
        previousDistance = endpointDistance;
      }
      // A stationary body already inside this corridor must be able to leave.
      // Only a ready-path prefix which continuously moves farther from the
      // current peer can bypass its future reservation. Detour still moves it.
      if (actorCorridorGap < 2 * radius && nonDecreasing && previousDistance > initialDistance + 1e-8) {
        egress.push({ peer: other.id, actorCorridorGap, minimumCurrentCapsuleGap: minimumGap,
          initialDistance, finalDistance: previousDistance, nonDecreasing, prefix: prefix.map(xz) });
        continue;
      }
      return { conflict: { id: other.id, gap: futureGap, reason: "ready-path-prefix-overlaps-active-upstream-corridor" }, egress: [] };
    }
    return { conflict: null, egress };
  }

  function departureConflict(actor) {
    const current = world.queryPath(world.get(actor.id).position, actor.plan.entry);
    actor.departureEgress = [];
    if (!current.success) return { id: null, reason: "departure-upstream-path-unavailable" };
    const prefix = pathPrefix([...current.path.map(xz), ...actor.plan.paths[1].slice(1)], leadDistance);
    const checked = prefixReservationCheck(actor, prefix);
    actor.departureEgress = checked.egress;
    return checked.conflict;
  }

  function nearbyPathFree(actor) {
    const result = world.queryPath(world.get(actor.id).position, stageGoal(actor, actor.behavior.yieldStage));
    if (!result.success) return false;
    let remaining = leadDistance;
    for (let i = 1; i < result.path.length && remaining > 0; i++) {
      const a = xz(result.path[i - 1]), end = xz(result.path[i]), length = distance(a, end);
      if (length < 1e-6) continue;
      const part = Math.min(length, remaining);
      const b = { x: a.x + (end.x - a.x) * part / length, y: 0, z: a.z + (end.z - a.z) * part / length };
      for (const other of actors) if (other !== actor && pointSegmentDistance(world.get(other.id).position, a, b) < 2 * radius) return false;
      remaining -= part;
    }
    return true;
  }

  function beginYield(actor, kind, reason, peer = null) {
    if (yieldingId && yieldingId !== actor.id) { diagnostics.secondaryYieldSignals++; return false; }
    const b = actor.behavior;
    yieldingId = actor.id;
    world.stop(actor.id);
    b.yieldStage = b.stage ?? 0; b.yieldKind = kind; b.yieldReason = reason;
    b.yieldPeer = peer; b.yieldElapsed = 0; b.yieldStoppedFor = 0; b.phase = "yield";
    b.yieldCount++; diagnostics.yieldCount++;
    if (b.recoveryStartedAt === null) {
      b.recoveryStartedAt = simulationTime; b.recoveryAnchor = xz(world.get(actor.id).position); b.recoveryReplans = 0;
    }
    actor.facingTargetYaw = holderYaw(actor);
    b.yieldHeldYaw = actor.facingTargetYaw;
    return true;
  }

  function replanYield(actor) {
    const b = actor.behavior, oldDestination = b.destination;
    if (b.recoveryReplans >= recoveryReplanLimit) {
      failActor(actor, "yield-replan-budget-exhausted", "No real forward progress after " + recoveryReplanLimit + " replans.");
      return;
    }
    b.recoveryReplans++;
    world.stop(actor.id); world.releaseReservation(actor.id);
    if (yieldingId === actor.id) yieldingId = null;
    b.yieldReplans++; diagnostics.yieldReplans++;
    b.replanExclude = oldDestination; b.destination = null;
    b.phase = "waiting"; b.waitKind = "departure"; b.waitElapsed = 0; b.retryTime = 0;
    beginJourney(actor);
  }

  function updateYield(actor) {
    const b = actor.behavior;
    b.yieldElapsed += dt; diagnostics.totalYieldSeconds += dt;
    diagnostics.maximumYieldSeconds = Math.max(diagnostics.maximumYieldSeconds, b.yieldElapsed);
    b.yieldStoppedFor = world.get(actor.id).actualSpeed < .02 ? b.yieldStoppedFor + dt : 0;
    const clear = b.yieldKind === "pre-departure" ? !departureConflict(actor) : nearbyPathFree(actor);
    if (clear && b.yieldElapsed >= yieldPause && b.yieldStoppedFor >= yieldPause) {
      const stage = b.yieldStage;
      if (yieldingId === actor.id) yieldingId = null;
      diagnostics.yieldResumes++;
      b.phase = "waiting";
      requestStage(actor, stage);
      return;
    }
    if (b.yieldElapsed > (b.yieldKind === "pre-departure" ? waitLimit : lateYieldReplanAfter)) replanYield(actor);
  }

  function backstepAgainstCorridor(actor, state) {
    if (state.arrived || state.actualSpeed <= .05) return false;
    const target = state.pathCorners.find(p => distance(p, state.position) > .03) || state.target;
    if (!target || distance(target, state.position) < .03) return false;
    const forwardProgress = state.actualVelocity.x * (target.x - state.position.x)
      + state.actualVelocity.z * (target.z - state.position.z);
    return forwardProgress < 0;
  }

  function requestStage(actor, index) {
    const b = actor.behavior, plan = actor.plan;
    actor.departureEgress = [];
    if (index === 0 && (!yieldingId || yieldingId === actor.id)) {
      const conflict = departureConflict(actor);
      if (conflict) {
        b.stage = 0;
        beginYield(actor, "pre-departure", conflict.reason, conflict.id);
        return false;
      }
    }
    const result = index === 1 ? world.requestStation(actor.id, b.destination) : world.moveTo(actor.id, plan.entry);
    if (!result.accepted) {
      world.stop(actor.id);
      b.phase = "waiting"; b.waitKind = "goal"; b.pendingStage = index;
      b.retryTime = .5; b.waitElapsed = b.waitElapsed || 0; b.lastWaitReason = result.reason;
      return false;
    }
    if (index === 0 && actor.departureEgress.length) {
      diagnostics.egressGrants++;
      egressEvents.push({ time: simulationTime, actor: actor.id, destination: b.destination, checks: actor.departureEgress });
      if (egressEvents.length > 32) egressEvents.shift();
    }
    b.phase = "walk"; b.stage = index; b.time = 0; b.waitElapsed = 0;
    b.lastWaitReason = null; actor.progressTime = simulationTime; actor.progressDistance = actor.totalDistance;
    return true;
  }

  function beginJourney(actor) {
    const b = actor.behavior, choice = journeyChoice(actor);
    if (!choice) {
      b.phase = "waiting"; b.waitKind = "departure"; b.retryTime = 1;
      b.waitElapsed = b.waitElapsed || 0; b.lastWaitReason = "no-safe-authored-turn-or-navmesh-route";
      b.navigationRetries++;
      return;
    }
    actor.plan = choice;
    b.replanExclude = null;
    b.destination = choice.destination; b.stationName = stationInfo[choice.destination].name;
    b.waitElapsed = 0; b.lastWaitReason = null;
    actor.distance = 0;
    if (choice.turn) {
      world.stop(actor.id);
      actor.motion.activateTurn(choice.turn.name);
      b.phase = "turn"; b.time = 0; b.turnElapsed = 0; b.turnBlockedTime = 0;
      b.turnName = choice.turn.name; b.turnOrigin = choice.origin; b.turnStart = choice.yaw;
      b.turnDuration = choice.turn.duration + 2 * turnBlend;
      b.turnEndpoint = choice.endpoint; b.turnEndYaw = choice.endYaw; b.turnAfter = "walk";
      actor.pendingTurn = null;
    } else {
      b.turnName = null;
      requestStage(actor, 0);
    }
  }

  function clearRecovery(actor) {
    const b = actor.behavior;
    if (b.recoveryStartedAt !== null) diagnostics.recoveryCompletions++;
    b.recoveryStartedAt = null; b.recoveryAnchor = null; b.recoveryReplans = 0;
  }

  function arrive(actor) {
    const b = actor.behavior;
    b.current = b.destination; b.destination = null;
    b.recent = [...b.recent, b.current].slice(-3);
    b.stationName = stationInfo[b.current].name;
    b.completedJourneys++; diagnostics.completedJourneys++;
    clearRecovery(actor);
    actor.motion.activateTurn(null);
    b.phase = "observe"; b.time = 0; b.pause = 5 + actor.random() * 6;
    b.turnAfter = null; b.turnName = null; b.stage = null; b.waitElapsed = 0;
    // Keep this tick's actual locomotion pose: Detour may still be decelerating.
  }

  function beginDemo(actor, slot) {
    const b = actor.behavior, kind = demoForSlot(slot);
    b.lastDemoSlot = slot;
    if (!kind) {
      b.lastSkippedDemo = { slot, requested: forcedDemo || null, reason: "gesture-envelope-gate" };
      return;
    }
    const space = clearPoint(actor, world.get(actor.id).position);
    if (!space.clear) {
      b.lastSkippedDemo = { slot, requested: kind, reason: "gesture-space-gate", detail: space };
      return;
    }
    const clip = actor.motion.activateGesture(gestureNames[kind]);
    if (!clip) { failActor(actor, "missing-gesture", kind); return; }
    world.stop(actor.id);
    b.phase = "demo"; b.time = 0; b.demoKind = kind; b.demoDuration = clip.duration;
    b.demoClip = clip.name; b.demoCount++;
  }

  function prepareActor(actor) {
    const b = actor.behavior;
    actor.idleTime += dt; b.time += dt; actor.pendingTurn = null;
    if (b.phase === "failed") return;
    if (b.recoveryStartedAt !== null) {
      const elapsed = simulationTime - b.recoveryStartedAt;
      diagnostics.maximumRecoverySeconds = Math.max(diagnostics.maximumRecoverySeconds, elapsed);
      if (elapsed > recoveryTotalLimit) {
        failActor(actor, "recovery-total-timeout", "Yield/replan episode exceeded " + recoveryTotalLimit + " seconds without net forward progress.");
        return;
      }
    }
    if (b.phase === "observe") {
      const slot = Math.floor(simulationTime / demoPeriod);
      if (slot > 0 && (slot - 1) % profiles.length === actor.index && slot > b.lastDemoSlot) beginDemo(actor, slot);
      if (!demoOnly && b.phase === "observe" && b.time >= b.pause) beginJourney(actor);
    } else if (b.phase === "yield") {
      updateYield(actor);
    } else if (b.phase === "waiting") {
      b.waitElapsed += dt; b.retryTime -= dt;
      if (b.waitElapsed > waitLimit) { failActor(actor, "navigation-wait-timeout", b.lastWaitReason || b.waitKind); return; }
      if (b.retryTime <= 0) {
        if (b.waitKind === "departure") beginJourney(actor);
        else requestStage(actor, b.pendingStage);
      }
    } else if (b.phase === "demo" && b.time >= b.demoDuration) {
      actor.motion.activateGesture(null);
      b.phase = "observe"; b.time = 0; b.pause = 3.8 + actor.random() * 2;
    }
    if (b.phase === "turn") {
      const turn = actor.motion.turns.get(b.turnName);
      const nextElapsed = Math.min(b.turnDuration, b.turnElapsed + dt);
      const clipTime = clamp(nextElapsed - turnBlend, 0, turn.duration);
      const local = turn.at(clipTime);
      const position = turnPoint(b.turnOrigin, b.turnStart, local);
      const queued = world.queueRootMotion(actor.id, position);
      if (queued.accepted) {
        actor.pendingTurn = { sequence: queued.sequence, elapsed: nextElapsed, clipTime, yaw: b.turnStart + local.yaw };
      } else {
        diagnostics.rejectedRootSteps++; b.turnBlockedTime += dt;
        b.lastWaitReason = queued.reason;
        if (b.turnBlockedTime > waitLimit) failActor(actor, "authored-turn-blocked", queued.reason || "unknown");
      }
    }
  }

  function applyWorldActor(actor, state, events) {
    const b = actor.behavior, previousYaw = holderYaw(actor);
    const moved = distance(state.previousPosition, state.position);
    // The only writes to a visitor's WORLD translation are from Detour snapshots.
    actor.holder.position.set(state.position.x, state.position.y, state.position.z);
    actor.worldState = state; actor.totalDistance = state.distanceTravelled; actor.speed = state.actualSpeed;
    if (b.phase === "walk" && backstepAgainstCorridor(actor, state))
      beginYield(actor, "late-backstep", "actual-velocity-opposes-upstream-corridor");
    // stop() changes a goal, not physical velocity. Waiting, observing and failed
    // agents still consume real travel and retain Walk/Idle until they stop.
    if (b.phase !== "turn" && b.phase !== "demo") {
      actor.walkDistance += moved;
      // Temporal Idle/Walk crossfade only. Changing speed changes the native
      // clip phase rate, never its sustained stride amplitude.
      actor.walkBlendTarget = moved > 1e-6 ? 1 : 0;
      actor.walkBlend = clamp(actor.walkBlend + (actor.walkBlendTarget ? 1 : -1) * dt / locomotionBlendDuration, 0, 1);
      if (b.destination !== null) actor.distance += moved;
      if (b.phase !== "yield" && state.actualSpeed >= facingVelocityThreshold)
        actor.facingTargetYaw = Math.atan2(state.actualVelocity.x, state.actualVelocity.z) - actor.motion.forwardYaw;
      // Stock Three.js whole-object rotation. Low-speed avoidance noise cannot
      // select a new facing target. Authored turn yaw bypasses this entirely.
      actor.holder.quaternion.rotateTowards(facingQuaternion.setFromAxisAngle(upAxis, actor.facingTargetYaw), facingAngularSpeed * dt);
    }
    if (b.phase === "walk") {
      actor.poseRequest = { walkDistance: actor.walkDistance, walkWeight: actor.walkBlend, idleTime: actor.idleTime };
      if (actor.totalDistance - actor.progressDistance > .08) {
        actor.progressDistance = actor.totalDistance; actor.progressTime = simulationTime;
      } else if (simulationTime - actor.progressTime > stallLimit) {
        failActor(actor, "crowd-stalled", "No .08 m of actual progress for " + stallLimit + " seconds.");
      }
      if (b.phase === "walk") {
        // These are internal handoff goals, not arrival tolerances. The final
        // station must satisfy Detour's actual arrived state. A small lookahead
        // avoids forcing a complete Idle at every internal navigation goal.
        if (b.stage === 0 && (state.arrived || distance(state.position, actor.plan.entry) <= intermediateLookahead)) requestStage(actor, 1);
        else if (b.stage === 1 && state.arrived && state.currentStation === b.destination) arrive(actor);
      }
    } else if (b.phase === "turn") {
      actor.walkBlend = 0; actor.walkBlendTarget = 0;
      actor.turnDistance += moved;
      const pending = actor.pendingTurn;
      const event = pending && events.find(event => event.id === actor.id && event.sequence === pending.sequence);
      if (pending && event?.status === "applied" && event.authoredTrajectoryPreserved) {
        b.turnElapsed = pending.elapsed; b.turnBlockedTime = 0;
        actor.holder.quaternion.setFromAxisAngle(upAxis, pending.yaw);
        actor.facingTargetYaw = pending.yaw;
        diagnostics.appliedRootSteps++;
        diagnostics.maximumRootMotionDeviation = Math.max(diagnostics.maximumRootMotionDeviation, event.positionDeviation || 0);
      } else if (pending) {
        diagnostics.rejectedRootSteps++; b.turnBlockedTime += dt;
        b.lastWaitReason = event?.reason || "no-applied-root-step";
        if (event?.positionDeviation) diagnostics.maximumRootMotionDeviation = Math.max(diagnostics.maximumRootMotionDeviation, event.positionDeviation);
        if (b.turnBlockedTime > waitLimit) failActor(actor, "authored-turn-commit-timeout", b.lastWaitReason);
      }
      if (b.phase === "turn") {
        const turn = actor.motion.turns.get(b.turnName);
        actor.poseRequest = { walkDistance: actor.walkDistance, walkWeight: 0, idleTime: actor.idleTime,
          turnTime: clamp(b.turnElapsed - turnBlend, 0, turn.duration),
          turnWeight: ease(b.turnElapsed / turnBlend) * ease((b.turnDuration - b.turnElapsed) / turnBlend) };
        if (b.turnElapsed >= b.turnDuration - 1e-9) {
          actor.motion.activateTurn(null);
          actor.poseRequest.turnWeight = 0;
          requestStage(actor, 0);
        }
      }
    } else if (b.phase === "demo") {
      actor.walkBlend = 0; actor.walkBlendTarget = 0;
      actor.poseRequest = { walkDistance: actor.walkDistance, walkWeight: 0, idleTime: actor.idleTime,
        gestureTime: b.time, gestureWeight: ease(b.time / .24) * ease((b.demoDuration - b.time) / .24) };
    } else actor.poseRequest = { walkDistance: actor.walkDistance, walkWeight: actor.walkBlend, idleTime: actor.idleTime };
    // Reset recovery on a real arrival or net displacement of one lead
    // observed during forward Walk. Replans do not reset its clock.
    if (b.recoveryStartedAt !== null && b.phase === "walk" && state.actualSpeed > .02
      && distance(state.position, b.recoveryAnchor) >= leadDistance && !backstepAgainstCorridor(actor, state)) clearRecovery(actor);
    const currentYaw = holderYaw(actor);
    const yawStep = Math.abs(angleDelta(previousYaw, currentYaw));
    actor.yawRate = angleDelta(previousYaw, currentYaw) / dt;
    diagnostics.maximumYawStep = Math.max(diagnostics.maximumYawStep, yawStep);
    actor.facingVelocityAngle = state.actualSpeed > .02
      ? Math.abs(angleDelta(currentYaw, Math.atan2(state.actualVelocity.x, state.actualVelocity.z) - actor.motion.forwardYaw)) : 0;
    if (state.actualSpeed > .25 && b.phase !== "turn" && b.phase !== "demo") {
      diagnostics.maximumFacingVelocityAngle = Math.max(diagnostics.maximumFacingVelocityAngle, actor.facingVelocityAngle);
      actor.facingLagRun = actor.facingVelocityAngle > Math.PI / 4 ? actor.facingLagRun + dt : 0;
      if (actor.facingVelocityAngle > Math.PI / 4) diagnostics.facingVelocityOver45DegreesTime += dt;
      diagnostics.maximumFacingVelocityLagSeconds = Math.max(diagnostics.maximumFacingVelocityLagSeconds, actor.facingLagRun);
    } else actor.facingLagRun = 0;
    actor.pendingTurn = null;
    diagnostics.maximumRenderedWorldDeviation = Math.max(diagnostics.maximumRenderedWorldDeviation, distance(actor.holder.position, state.position));
  }

  function updateMetadata(actor) {
    const b = actor.behavior;
    Object.assign(actor.holder.userData, { visitorVersion: 44, visitorId: actor.id, visitorState: b.phase,
      visitorStation: b.stationName, nativeStride: actor.motion.stride, walkPhase: actor.motion.snapshot()?.phase || 0,
      demoKind: b.demoKind || "", demoCount: b.demoCount || 0, demoTime: b.phase === "demo" ? b.time : 0,
      demoDuration: b.demoDuration || 0, demoClip: b.demoClip || "" });
    actor.holder.updateWorldMatrix(true, true);
    // Existing soft contact shadows are drawing only. They do not move a foot.
    for (const { bone, contact } of actor.feet) {
      bone.getWorldPosition(contact.position); actor.holder.worldToLocal(contact.position);
      contact.material.opacity = .85 * (1 - smooth(contact.position.y, .095, .24));
      contact.position.y = .011; contact.position.z += .045;
    }
  }

  function resetActor(actor) {
    const state = world.get(actor.id);
    actor.random = randomGenerator(actor.profile.seed ^ sessionSeed);
    actor.walkDistance = 0; actor.turnDistance = 0; actor.totalDistance = 0; actor.distance = 0;
    actor.speed = 0; actor.yawRate = 0; actor.idleTime = 0; actor.walkBlend = 0; actor.walkBlendTarget = 0; actor.plan = null; actor.pendingTurn = null;
    actor.progressTime = 0; actor.progressDistance = 0; actor.worldState = state; actor.departureEgress = [];
    actor.holder.position.set(state.position.x, state.position.y, state.position.z);
    actor.facingTargetYaw = viewYaw(actor.profile.start); actor.facingVelocityAngle = 0; actor.facingLagRun = 0;
    actor.holder.quaternion.setFromAxisAngle(upAxis, actor.facingTargetYaw);
    actor.behavior = { phase: "observe", time: actor.index * 1.7, current: actor.profile.start, destination: null,
      recent: [actor.profile.start], pause: 4.8 + actor.random() * 4, stationName: stationInfo[actor.profile.start].name,
      stage: null, lastDemoSlot: 0, demoCount: 0, navigationRetries: 0, completedJourneys: 0, waitElapsed: 0,
      turnName: null, turnAfter: null, replanExclude: null, yieldCount: 0, yieldReplans: 0,
      yieldElapsed: 0, yieldStoppedFor: 0, yieldReason: null, yieldPeer: null, yieldKind: null,
      recoveryStartedAt: null, recoveryAnchor: null, recoveryReplans: 0 };
    actor.motion.reset();
    actor.poseRequest = { walkDistance: 0, walkWeight: 0, idleTime: 0 };
    updateMetadata(actor);
  }

  function fixedStep() {
    simulationTime += dt;
    for (const actor of actors) prepareActor(actor);
    const result = world.update(dt); // exactly ONE engine tick for all agents
    for (const actor of actors) applyWorldActor(actor, result.agents.find(row => row.id === actor.id), result.rootMotionEvents);
    diagnostics.fixedSteps++;
    for (const actor of actors) diagnostics.minimumStaticClearance = Math.min(diagnostics.minimumStaticClearance, rawClearance(actor.worldState.position, layout));
    for (let i = 0; i < actors.length; i++) for (let j = i + 1; j < actors.length; j++)
      diagnostics.minimumPairDistance = Math.min(diagnostics.minimumPairDistance, distance(actors[i].worldState.position, actors[j].worldState.position));
  }

  function advance(delta) {
    if (!ready || delta <= 0) return;
    accumulator += delta;
    while (accumulator + 1e-10 >= dt) {
      fixedStep();
      accumulator = Math.max(0, accumulator - dt);
    }
    for (const actor of actors) {
      actor.motion.evaluate({ ...actor.poseRequest, delta });
      updateMetadata(actor);
    }
  }

  const update = time => {
    if (!Number.isFinite(time)) return;
    const delta = previousInput === null ? 0 : time - previousInput;
    previousInput = time;
    if (!paused && delta >= 0) {
      const accepted = Math.min(delta, .25);
      droppedTime += delta - accepted;
      advance(accepted);
    }
  };
  update.isReady = () => ready;
  update.setPaused = value => (paused = Boolean(value));
  update.actors = () => actors.slice();
  update.describe = update.actors;
  update.step = delta => {
    if (!Number.isFinite(delta) || delta <= 0 || delta > .1) throw new Error("Visitor fixed step must be in (0, .1]");
    advance(delta); return update.snapshot();
  };
  update.reset = () => {
    if (!ready) throw new Error("Visitors are not ready");
    simulationTime = 0; accumulator = 0; previousInput = null; droppedTime = 0; yieldingId = null;
    errors.length = 0; failures.length = 0; egressEvents.length = 0;
    for (const key of Object.keys(diagnostics)) diagnostics[key] = key.startsWith("minimum") ? Infinity : 0;
    world.reset();
    for (const actor of actors) resetActor(actor);
    return update.snapshot();
  };
  update.snapshot = ({ includeBones = false } = {}) => ({
    version: 44, ready, paused, time: simulationTime, sessionSeed, errors: errors.slice(), failures: failures.slice(),
    gesturePolicy: { ...gesturePolicy, requested: forcedDemo || null, demoOnly, period: demoPeriod },
    world: world?.snapshot() || null,
    diagnostics: { ...diagnostics, droppedTime, fixedAccumulator: accumulator, engine: "recast-navigation@0.44.0",
      worldTranslationAuthority: "DetourCrowd snapshot", intermediateLookahead, finalArrivalUsesEngine: true,
      routeStages: ["ready-path-to-approach", "reserved-station"], mandatoryExitWaypoint: false, departurePrefixLength: leadDistance,
      egressEvents: egressEvents.slice(), egressPolicy: "Only leave an already occupied peer corridor along a physically clear, monotonically distancing ready-path prefix.",
      yieldingId, yieldPause, lateYieldReplanAfter, recoveryTotalLimit, recoveryReplanLimit,
      facingAngularSpeed, facingVelocityThreshold, facingMethod: "THREE.Quaternion.rotateTowards; authored turns bypass it",
      sourceWalkHasNonzeroContactSlip: true, locomotionBlendDuration, startStop: "Temporal .18 s Idle/Walk crossfade; full native Walk during physical movement. Dedicated start/stop clips are not installed." },
    actors: actors.map(actor => {
      const b = actor.behavior, pose = actor.motion.snapshot();
      return { id: actor.id, model: actor.model, state: b.phase, station: b.stationName,
        currentStation: b.current, destinationStation: b.destination, turnAfter: b.turnAfter,
        phase: pose?.phase || 0, ...pose,
        stride: actor.motion.stride, nativeForwardYaw: actor.motion.forwardYaw, sourceSpeed: actor.motion.sourceSpeed,
        speed: actor.speed, cruiseSpeed: actor.profile.speed, walkBlend: actor.walkBlend, walkBlendTarget: actor.walkBlendTarget, yaw: holderYaw(actor), yawRate: actor.yawRate,
        distance: actor.distance, totalDistance: actor.totalDistance, phaseDistance: actor.walkDistance,
        turnPhaseDistance: actor.turnDistance, routeLength: actor.plan?.length || 0,
        holder: { position: actor.holder.position.toArray(), quaternion: actor.holder.quaternion.toArray() },
        root: { position: actor.rig.position.toArray(), quaternion: actor.rig.quaternion.toArray(), scale: actor.rig.scale.toArray() },
        weightedShoeVertexCount: actor.motion.weightedShoeVertexCount,
        world: actor.worldState,
        completedJourneys: b.completedJourneys, failure: b.failure || null,
        navigation: { engine: "DetourCrowd", stage: b.stage, yawWarp: 0, rootMotionDoubleApplied: false,
          facingTargetYaw: actor.facingTargetYaw, facingVelocityAngle: actor.facingVelocityAngle, facingLagSeconds: actor.facingLagRun,
          exitDirectionDot: actor.plan?.exitDirectionDot ?? null, entryDirectionDot: actor.plan?.entryDirectionDot ?? null,
          initialAlignmentAngle: actor.plan?.alignmentAngle ?? null, departurePrefixPath: actor.plan?.departurePrefix ?? null,
          recoveryTime: b.recoveryStartedAt === null ? 0 : simulationTime - b.recoveryStartedAt, recoveryReplans: b.recoveryReplans,
          yieldCount: b.yieldCount, yieldReplans: b.yieldReplans, yieldKind: b.yieldKind, yieldReason: b.yieldReason,
          yieldPeer: b.yieldPeer, yieldTime: b.yieldElapsed, yieldHeldYaw: b.yieldHeldYaw ?? null,
          turnName: b.turnName, turnEndpoint: b.turnEndpoint ? [b.turnEndpoint.x, 0, b.turnEndpoint.z] : null,
          turnPreflight: actor.plan?.preflight || null, turnElapsed: b.turnElapsed || 0, turnBlockedTime: b.turnBlockedTime || 0,
          approachLead: leadDistance, departurePrefix: leadDistance, mandatoryExitWaypoint: false, retries: b.navigationRetries,
          waitTime: b.waitElapsed || 0, waitReason: b.lastWaitReason || null,
          arrivalYawError: b.phase === "observe" ? angleDelta(holderYaw(actor), viewYaw(b.current)) : null,
          requestedPath: actor.plan?.paths || null },
        demo: { kind: b.demoKind || null, count: b.demoCount, skipped: b.lastSkippedDemo || null },
        ...(includeBones ? { bones: Object.values(actor.bones).map(poseNumbers) } : {}),
      };
    }),
  });

  update.ready = (async () => {
    const layoutResponse = await fetch(new URL("./ready-crowd-layout-v1.json", import.meta.url));
    if (!layoutResponse.ok) throw new Error("Crowd layout HTTP " + layoutResponse.status);
    layout = await layoutResponse.json();
    await Promise.all(profiles.map(async (profile, index) => {
      const [model, bundle, turns] = await Promise.all([
        loader.loadAsync(new URL("./assets/models/visitors/walking-" + profile.model + ".glb?v=43", import.meta.url).href),
        loader.loadAsync(new URL("./assets/models/visitors/motions/" + profile.id + "-native-motions.glb?v=43", import.meta.url).href),
        loader.loadAsync(new URL("./assets/models/visitors/motions/" + profile.id + "-native-turns.glb?v=43", import.meta.url).href),
      ]);
      const rig = model.scene, holder = new THREE.Group(), grounding = new THREE.Group();
      holder.name = "visitor-" + profile.model; grounding.name = "visitor-" + profile.id + "-floor-offset";
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(.76, .56), contactMaterial.clone());
      shadow.rotation.x = -Math.PI / 2; shadow.position.y = .009;
      grounding.add(rig); holder.add(shadow, grounding);
      const motion = createNativeMotion(rig, [...bundle.animations, ...turns.animations], grounding);
      const feet = ["Left", "Right"].map(side => {
        const contact = new THREE.Mesh(new THREE.PlaneGeometry(.18, .31), contactMaterial.clone());
        contact.rotation.x = -Math.PI / 2; holder.add(contact);
        return { side, bone: motion.bones[side + "Foot"], contact };
      });
      actors.push({ id: profile.id, model: profile.model, profile, index, holder, grounding, rig,
        bones: motion.bones, mixer: motion.mixer, motion, actions: motion.actions, feet, shadow });
    }));
    actors.sort((a, b) => a.index - b.index);
    world = await createReadyCrowd({ layout, radius, envelopeRadius, agents: profiles.map(profile => ({
      id: profile.id, position: layout.stations[profile.start].position, maxSpeed: profile.speed, station: profile.start,
    })) });
    stations = world.snapshot().projectedStations.map(xz);
    for (const actor of actors) {
      resetActor(actor);
      scene.add(actor.holder);
    }
    ready = true;
    return update.snapshot();
  })();
  update.ready.catch(error => {
    errors.push(String(error));
    console.error("[visitors-v44] Ready Crowd/native animation loading failed", error);
  });
  return update;
}
