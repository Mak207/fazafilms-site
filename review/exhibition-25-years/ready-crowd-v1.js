/**
 * Thin lifecycle adapter for the unmodified, pinned DetourCrowd 0.44.0 engine.
 * Navigation and avoidance are entirely upstream. This file owns only:
 * initialization, fixed clock, station claims, and readable snapshots.
 *
 * Call update(frameSeconds) ONCE for the entire crowd, then render every actor
 * from its snapshot. Never also translate an actor along a Bezier/root path.
 * Native animation phase may consume distanceTravelled / actual horizontal speed.
 * No bone rotations, IK, leg spreading, or per-actor steering are applied here.
 * Authored root steps may be queued into the physical agent before a shared tick.
 * Teleport resets upstream velocity: this is a guarded kinematic feed, not a
 * promise of predictive avoidance or exact trajectory preservation under contact.
 */
import { init, Crowd, NavMeshQuery, importNavMesh } from './vendor/recast-navigation-0.44.0/core.mjs';
import RecastWasm from './vendor/recast-navigation-0.44.0/wasm-compat.mjs';

export const READY_CROWD_VERSION = 'recast-navigation@0.44.0';
export const READY_CROWD_FIXED_DT = 1 / 60;
const DEFAULT_RADIUS = .70;
const DEFAULT_ENVELOPE = .68;
const copy = p => ({ x: p.x, y: p.y, z: p.z });
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const point = value => {
  const p = Array.isArray(value) ? { x: value[0], y: 0, z: value[1] } : { x: value?.x, y: value?.y ?? 0, z: value?.z };
  if (![p.x, p.y, p.z].every(Number.isFinite)) throw new TypeError('Expected a finite XZ point');
  return p;
};
let initialization;
const initialize = () => initialization ??= init(RecastWasm);

export async function createReadyCrowd({
  navMeshBytes,
  navMeshUrl = new URL('./ready-crowd-navmesh-v1.bin', import.meta.url),
  layout,
  agents = [],
  maxAgents = Math.max(2, agents.length),
  stations = layout?.stations ?? [],
  obstacles = layout?.obstacles ?? [],
  groundY = 0,
  radius = DEFAULT_RADIUS,
  envelopeRadius = DEFAULT_ENVELOPE,
  onFixedStep,
} = {}) {
  if (!Array.isArray(agents) || !Number.isInteger(maxAgents) || maxAgents < agents.length || maxAgents < 1) throw new TypeError('Invalid agent list or capacity');
  if (!(radius >= envelopeRadius && envelopeRadius >= DEFAULT_ENVELOPE)) throw new RangeError('Radius must cover the measured native skin envelope');
  if (radius !== DEFAULT_RADIUS) throw new RangeError('This proof and baked navmesh use radius .70m; rebake and revalidate before changing it');
  if (new Set(agents.map(a => a.id)).size !== agents.length) throw new Error('Duplicate crowd agent id');
  await initialize();
  if (!navMeshBytes) {
    const response = await fetch(navMeshUrl);
    if (!response.ok) throw new Error('Navigation mesh HTTP ' + response.status);
    navMeshBytes = new Uint8Array(await response.arrayBuffer());
  }
  const bytes = navMeshBytes instanceof Uint8Array ? navMeshBytes : new Uint8Array(navMeshBytes);
  const { navMesh } = importNavMesh(bytes);
  const query = new NavMeshQuery(navMesh);
  const crowd = new Crowd(navMesh, { maxAgents, maxAgentRadius: radius });
  const avoid = crowd.raw.getObstacleAvoidanceParams(0);
  // Official RecastDemo v1.6.0 high-quality adaptive sampling settings.
  avoid.velBias = .5;
  avoid.adaptiveDivs = 7;
  avoid.adaptiveRings = 3;
  avoid.adaptiveDepth = 3;
  crowd.raw.setObstacleAvoidanceParams(0, avoid);
  let destroyed = false;
  let accumulator = 0;
  let simulationTime = 0;
  let totalFixedSteps = 0;
  let droppedTime = 0;
  const rows = new Map();
  const claims = new Map();
  const initialInputs = new Map();
  const pendingRootMotion = new Map();
  const rootMotionEvents = [];
  let rootMotionSequence = 0;
  let rootEventCount = 0;
  const ensureAlive = () => { if (destroyed) throw new Error('Crowd has been destroyed'); };
  const project = value => {
    const p = point(value);
    const found = query.findClosestPoint(p, { halfExtents: { x: 2, y: 3, z: 2 } });
    if (!found.success || !found.polyRef || distance(p, found.point) > .35) throw new RangeError('Requested point is outside the safe navigation surface');
    return found.point;
  };
  const stationPoints = stations.map(station => project(station.position ?? station));
  const row = id => {
    ensureAlive();
    const found = rows.get(id);
    if (!found) throw new Error('Unknown crowd agent ' + id);
    return found;
  };
  const release = (stationIndex, id) => {
    if (stationIndex !== null && claims.get(stationIndex) === id) claims.delete(stationIndex);
  };
  const stateOf = item => {
    const p = item.agent.position();
    const velocity = item.agent.velocity();
    const speed = Math.hypot(velocity.x, velocity.z);
    return {
      id: item.id,
      position: { x: p.x, y: groundY, z: p.z },
      navigationPosition: copy(p),
      previousPosition: { x: item.previous.x, y: groundY, z: item.previous.z },
      velocity,
      speed,
      heading: speed > .02 ? Math.atan2(velocity.x, velocity.z) : item.heading,
      radius,
      envelopeRadius,
      distanceTravelled: item.distanceTravelled,
      target: item.goal && copy(item.goal),
      currentStation: item.currentStation,
      reservedStation: item.reservedStation,
      rootMotion: item.lastRootMotion ? { ...item.lastRootMotion } : null,
      actualVelocity: { ...item.actualVelocity },
      actualSpeed: Math.hypot(item.actualVelocity.x, item.actualVelocity.z),
      targetStation: item.targetStation,
      arrived: item.arrived,
      state: item.agent.state(),
      targetState: item.agent.raw.get_targetState(),
      pathCorners: item.agent.corners(),
    };
  };
  const snapshot = () => {
    ensureAlive();
    return {
      engine: READY_CROWD_VERSION,
      simulationTime,
      totalFixedSteps,
      interpolationAlpha: Math.min(1, accumulator / READY_CROWD_FIXED_DT),
      droppedTime,
      agents: Array.from(rows.values(), stateOf),
      stationClaims: Object.fromEntries(claims),
      rootMotionEvents: rootMotionEvents.slice(-64),
      pendingRootMotion: Array.from(pendingRootMotion.values(), pending => ({ id: pending.id, sequence: pending.sequence, target: copy(pending.target), appliesAtStep: totalFixedSteps + 1 })),
      rootMotionLimits: { maximumStep: .08, maximumProjectionXZ: .01, staticClearance: radius, agentCenterDistance: 2 * radius },
      rootMotionCaveat: 'Upstream teleport clears velocity. Inspect post-step positionDeviation; predictive avoidance and exact authored travel under contact are not guaranteed.',
      projectedStations: stationPoints.map(copy),
      rawObstacles: obstacles.map(bounds => [...bounds]),
      bounds: layout?.bounds ? { ...layout.bounds } : null,
      testedEnvelope: { radius, envelopeRadius, clips: ['Idle', 'Walk'] },
    };
  };
  const addAgent = input => {
      ensureAlive();
      const index = rows.size;
      if (index >= maxAgents) throw new RangeError('Crowd capacity reached');
      if (typeof input.id !== 'string' || !input.id || rows.has(input.id)) throw new Error('Agent id must be a unique non-empty string');
      if (input.maxSpeed !== undefined && (!Number.isFinite(input.maxSpeed) || input.maxSpeed < 0 || input.maxSpeed > 1.3)) throw new RangeError('Walking speed must be 0..1.3 m/s');
      const start = project(input.position);
      for (const other of rows.values()) {
        if (distance(start, other.agent.position()) < 2 * radius) throw new RangeError('Overlapping initial crowd positions');
      }
      const initialStation = Number.isInteger(input.station) ? input.station : null;
      if (initialStation !== null && (!stationPoints[initialStation] || claims.has(initialStation) || distance(start, stationPoints[initialStation]) > .35)) throw new RangeError('Invalid initial station claim');
      const agent = crowd.addAgent(start, {
        radius, height: input.height ?? 1.8,
        maxAcceleration: 2,
        maxSpeed: input.maxSpeed ?? (index ? 1.04 : 1.14),
        collisionQueryRange: 2.5,
        pathOptimizationRange: radius * 30,
        // Upstream default: extra separation stalled a valid close waypoint.
        separationWeight: 0,
        updateFlags: 31,
        obstacleAvoidanceType: 0,
      });
      if (agent.state() !== 1) throw new Error('Detour agent could not enter the navigation surface');
      rows.set(input.id, {
        id: input.id, agent, previous: copy(start), goal: null, arrived: true,
        currentStation: initialStation, targetStation: null, reservedStation: null,
        heading: input.heading ?? 0, distanceTravelled: 0,
        actualVelocity: { x: 0, y: 0, z: 0 }, lastRootMotion: null,
      });
      if (initialStation !== null) claims.set(initialStation, input.id);
      initialInputs.set(input.id, { ...input, position: copy(point(input.position)) });
      return stateOf(rows.get(input.id));
  };
  try {
    for (const input of agents) addAgent(input);
  } catch (error) {
    crowd.destroy(); query.destroy(); navMesh.destroy();
    throw error;
  }
  const rawClearance = p => {
    if (!layout?.bounds || !Array.isArray(obstacles)) return null;
    const b = layout.bounds;
    return Math.min(p.x - b.minX, b.maxX - p.x, p.z - b.minZ, b.maxZ - p.z,
      ...obstacles.map(o => Math.hypot(Math.max(o[0] - p.x, 0, p.x - o[1]), Math.max(o[2] - p.z, 0, p.z - o[3]))));
  };
  const relativeSegmentDistance = (a0, a1, b0, b1) => {
    const x = a0.x - b0.x, z = a0.z - b0.z;
    const dx = a1.x - a0.x - (b1.x - b0.x), dz = a1.z - a0.z - (b1.z - b0.z);
    const lengthSq = dx * dx + dz * dz;
    const t = lengthSq > 1e-12 ? Math.max(0, Math.min(1, -(x * dx + z * dz) / lengthSq)) : 0;
    return Math.hypot(x + t * dx, z + t * dz);
  };
  const recordRootEvent = (item, event) => {
    const recorded = { eventIndex: ++rootEventCount, id: item.id, fixedStep: totalFixedSteps,
      simulationTime, ...event };
    item.lastRootMotion = recorded;
    rootMotionEvents.push(recorded);
    if (rootMotionEvents.length > 128) rootMotionEvents.shift();
    return recorded;
  };
  const validateRootStep = (item, value, committing = false) => {
    if (!committing && pendingRootMotion.has(item.id)) return { accepted: false, reason: 'root-motion-already-queued' };
    let requested;
    try { requested = point(value); } catch { return { accepted: false, reason: 'invalid-position' }; }
    const from = item.agent.position();
    const stepDistance = distance(from, requested);
    if (stepDistance > .08 + 1e-7) return { accepted: false, reason: 'root-step-too-large', stepDistance };
    const found = query.findClosestPoint(requested, { halfExtents: { x: .2, y: 3, z: .2 } });
    if (!found.success || !found.polyRef) return { accepted: false, reason: 'outside-navmesh' };
    const projectionDistanceXZ = distance(requested, found.point);
    if (projectionDistanceXZ > .01 + 1e-7) return { accepted: false, reason: 'inexact-navmesh-projection', projectionDistanceXZ };
    const target = found.point;
    const clearance = rawClearance(target);
    if (clearance === null) return { accepted: false, reason: 'missing-layout-clearance' };
    if (clearance < radius - 1e-7) return { accepted: false, reason: 'static-clearance', clearance };
    const start = query.findNearestPoly(from, { halfExtents: { x: .2, y: 3, z: .2 } });
    if (!start.success || !start.nearestRef) return { accepted: false, reason: 'invalid-start-poly' };
    const ray = query.raycast(start.nearestRef, from, target);
    if (!ray.success || ray.t < 1 - 1e-6) return { accepted: false, reason: 'root-step-leaves-navmesh' };
    for (const other of rows.values()) {
      if (other.id === item.id) continue;
      const otherPosition = other.agent.position();
      const nearestCurrent = relativeSegmentDistance(from, target, otherPosition, otherPosition);
      if (nearestCurrent < 2 * radius - 1e-7) return { accepted: false, reason: 'agent-clearance', other: other.id, clearance: nearestCurrent };
      const queued = pendingRootMotion.get(other.id);
      if (queued) {
        const nearestQueued = relativeSegmentDistance(from, target, otherPosition, queued.target);
        if (nearestQueued < 2 * radius - 1e-7) return { accepted: false, reason: 'queued-agent-clearance', other: other.id, clearance: nearestQueued };
      }
    }
    return { accepted: true, target: copy(target), stepDistance, projectionDistanceXZ, clearance };
  };
  const reservationCheck = (item, index) => {
    const target = stationPoints[index];
    if (!target) throw new RangeError('Unknown station');
    const owner = claims.get(index);
    if (owner !== undefined && owner !== item.id) return { accepted: false, reason: 'occupied', owner, station: index };
    for (const other of rows.values()) {
      if (other.id !== item.id && distance(other.agent.position(), target) < 2 * radius)
        return { accepted: false, reason: 'physically-occupied', owner: other.id, station: index };
    }
    return { accepted: true, station: index, target: copy(target) };
  };
  const issueMove = (item, target, stationIndex) => {
    if (pendingRootMotion.has(item.id)) return { accepted: false, reason: 'root-motion-pending' };
    if (!item.agent.requestMoveTarget(target)) return { accepted: false, reason: 'unreachable' };
    if (item.targetStation !== item.currentStation && item.targetStation !== item.reservedStation) release(item.targetStation, item.id);
    item.goal = copy(target);
    item.targetStation = stationIndex;
    item.arrived = false;
    if (stationIndex !== null) claims.set(stationIndex, item.id);
    return { accepted: true, target: copy(target), station: stationIndex };
  };
  return {
    ready: true,
    version: READY_CROWD_VERSION,
    addAgent: (id, position, maxSpeed, options = {}) => addAgent({ ...options, id, position, maxSpeed }),
    queryPath(fromValue, toValue) {
      ensureAlive();
      try {
        const start = project(fromValue), target = project(toValue);
        const result = query.computePath(start, target, { halfExtents: { x: 2, y: 3, z: 2 } });
        const path = result.path.map(copy);
        if (!result.success) return { ...result, path, start: copy(start), target: copy(target) };
        if (!path.length || distance(path[path.length - 1], target) > .02)
          return { success: false, path, error: { name: 'partial-path' }, start: copy(start), target: copy(target) };
        return { success: true, path, start: copy(start), target: copy(target) };
      } catch (error) {
        return { success: false, path: [], error: { name: String(error.message ?? error) } };
      }
    },
    queueRootMotion(id, absolutePosition) {
      const item = row(id), sequence = ++rootMotionSequence;
      const checked = validateRootStep(item, absolutePosition);
      if (!checked.accepted) {
        recordRootEvent(item, { sequence, status: 'rejected', stage: 'queue', reason: checked.reason, details: checked });
        return { ...checked, sequence, appliesAtStep: totalFixedSteps + 1 };
      }
      const pending = { id, sequence, target: checked.target };
      pendingRootMotion.set(id, pending);
      item.lastRootMotion = { id, sequence, status: 'queued', target: copy(checked.target), appliesAtStep: totalFixedSteps + 1 };
      return { ...checked, sequence, appliesAtStep: totalFixedSteps + 1 };
    },
    reserveStation(id, index) {
      const item = row(id), checked = reservationCheck(item, index);
      if (!checked.accepted) return checked;
      if (item.reservedStation !== item.currentStation && item.reservedStation !== item.targetStation)
        release(item.reservedStation, id);
      item.reservedStation = index;
      claims.set(index, id);
      return checked;
    },
    releaseReservation(id) {
      const item = row(id), index = item.reservedStation;
      if (index !== item.currentStation && index !== item.targetStation) release(index, id);
      item.reservedStation = null;
      return { released: index };
    },
    reset(inputs) {
      ensureAlive();
      const source = inputs === undefined ? Array.from(initialInputs.values()) : (Array.isArray(inputs) ? inputs : inputs.agents);
      if (!Array.isArray(source) || source.length > maxAgents) throw new RangeError('Invalid reset agent list');
      const prepared = source.map(input => ({ ...input, position: copy(point(input.position)) }));
      const ids = new Set(), stationsSeen = new Set(), projected = [];
      for (const input of prepared) {
        if (typeof input.id !== 'string' || !input.id || ids.has(input.id)) throw new Error('Invalid reset agent id');
        ids.add(input.id);
        if (input.maxSpeed !== undefined && (!Number.isFinite(input.maxSpeed) || input.maxSpeed < 0 || input.maxSpeed > 1.3)) throw new RangeError('Invalid reset speed');
        const p = project(input.position);
        if (projected.some(other => distance(p, other) < 2 * radius)) throw new RangeError('Overlapping reset positions');
        projected.push(p);
        if (Number.isInteger(input.station)) {
          if (!stationPoints[input.station] || stationsSeen.has(input.station) || distance(p, stationPoints[input.station]) > .35) throw new RangeError('Invalid reset station');
          stationsSeen.add(input.station);
        }
      }
      for (const item of rows.values()) crowd.removeAgent(item.agent);
      rows.clear(); claims.clear(); initialInputs.clear(); pendingRootMotion.clear();
      rootMotionEvents.length = 0; rootMotionSequence = 0; rootEventCount = 0;
      accumulator = 0; simulationTime = 0; totalFixedSteps = 0; droppedTime = 0;
      for (const input of prepared) addAgent(input);
      return snapshot();
    },
    snapshot,
    get: id => stateOf(row(id)),
    project: value => { ensureAlive(); return copy(project(value)); },
    stationOwner: index => { ensureAlive(); return claims.get(index) ?? null; },
    requestStation(id, index) {
      const item = row(id);
      const target = stationPoints[index];
      if (!target) throw new RangeError('Unknown station');
      const owner = claims.get(index);
      if (owner !== undefined && owner !== id) return { accepted: false, reason: 'occupied', owner, station: index };
      for (const other of rows.values()) {
        if (other.id !== id && distance(other.agent.position(), target) < 2 * radius) {
          return { accepted: false, reason: 'physically-occupied', owner: other.id, station: index };
        }
      }
      return issueMove(item, target, index);
    },
    moveTo(id, value) {
      return issueMove(row(id), project(value), null);
    },
    stop(id) {
      const item = row(id);
      const pending = pendingRootMotion.get(id);
      if (pending) recordRootEvent(item, { sequence: pending.sequence, status: 'rejected', stage: 'cancel', reason: 'stopped', requestedPosition: copy(pending.target) });
      pendingRootMotion.delete(id);
      item.agent.resetMoveTarget();
      if (item.targetStation !== item.currentStation && item.targetStation !== item.reservedStation) release(item.targetStation, id);
      item.goal = null;
      item.targetStation = null;
      item.arrived = true;
      // The stopped actor stays in DetourCrowd and retains physical avoidance.
    },
    setMaxSpeed(id, value) {
      if (!Number.isFinite(value) || value < 0 || value > 1.3) throw new RangeError('Walking speed must be 0..1.3 m/s');
      row(id).agent.updateParameters({ maxSpeed: value });
    },
    update(frameSeconds) {
      ensureAlive();
      if (!Number.isFinite(frameSeconds) || frameSeconds < 0) throw new RangeError('Expected non-negative frame time');
      const accepted = Math.min(frameSeconds, .25);
      droppedTime += frameSeconds - accepted;
      accumulator += accepted;
      const arrivals = [];
      const firstEvent = rootEventCount;
      while (accumulator + 1e-10 >= READY_CROWD_FIXED_DT) {
        for (const item of rows.values()) item.previous = copy(item.agent.position());
        // Queued authored root motion enters the physical agents FIRST.
        // Previous positions above intentionally predate teleport, so distance
        // and observed velocity include the root step as well as Crowd correction.
        const acceptedRootSteps = [];
        const pendingBatch = Array.from(pendingRootMotion.values());
        for (const pending of pendingBatch) {
          const item = rows.get(pending.id);
          const checked = validateRootStep(item, pending.target, true);
          if (!checked.accepted) {
            recordRootEvent(item, { sequence: pending.sequence, status: 'rejected', stage: 'commit', reason: checked.reason, details: checked, requestedPosition: copy(pending.target), fixedStep: totalFixedSteps + 1 });
          } else acceptedRootSteps.push({ item, pending, target: checked.target });
        }
        pendingRootMotion.clear();
        for (const step of acceptedRootSteps) {
          const item = step.item;
          item.agent.resetMoveTarget();
          if (item.targetStation !== item.currentStation && item.targetStation !== item.reservedStation) release(item.targetStation, item.id);
          item.goal = null; item.targetStation = null; item.arrived = true;
          item.agent.teleport(step.target);
        }
        // Exactly one shared upstream engine update for ALL actors.
        crowd.update(READY_CROWD_FIXED_DT);
        totalFixedSteps++;
        simulationTime += READY_CROWD_FIXED_DT;
        accumulator = Math.max(0, accumulator - READY_CROWD_FIXED_DT);
        for (const item of rows.values()) {
          const p = item.agent.position();
          const velocity = item.agent.velocity();
          const speed = Math.hypot(velocity.x, velocity.z);
          item.distanceTravelled += distance(p, item.previous);
          item.actualVelocity = { x: (p.x - item.previous.x) / READY_CROWD_FIXED_DT, y: 0, z: (p.z - item.previous.z) / READY_CROWD_FIXED_DT };
          if (speed > .02) item.heading = Math.atan2(velocity.x, velocity.z);
          if (item.currentStation !== null && distance(p, stationPoints[item.currentStation]) > 2 * radius + .05) {
            release(item.currentStation, item.id);
            item.currentStation = null;
          }
          if (item.goal && !item.arrived && distance(p, item.goal) < .12 && speed < .15) {
            item.arrived = true;
            item.agent.resetMoveTarget();
            // An intermediate waypoint is not a station. Keep an old current
            // claim until the physical clearance condition above releases it.
            if (item.targetStation !== null) {
              // Retire the old logical claim even when two station anchors are
              // close. reservationCheck still protects its physical occupancy.
              if (item.currentStation !== item.targetStation) release(item.currentStation, item.id);
              item.currentStation = item.targetStation;
              if (item.reservedStation === item.targetStation) item.reservedStation = null;
            }
            arrivals.push({ id: item.id, station: item.currentStation, simulationTime });
          }
        }
        for (const { item, pending, target } of acceptedRootSteps) {
          const actual = item.agent.position();
          const positionDeviation = distance(actual, target);
          recordRootEvent(item, { sequence: pending.sequence, status: 'applied', stage: 'post-step',
            requestedPosition: copy(target), actualPosition: copy(actual), positionDeviation,
            authoredTrajectoryPreserved: positionDeviation <= .01,
            reason: positionDeviation > .01 ? 'crowd-corrected-root-position' : null,
            distance: distance(actual, item.previous), fixedStep: totalFixedSteps });
        }
        if (onFixedStep) onFixedStep(snapshot(), READY_CROWD_FIXED_DT);
      }
      return { ...snapshot(), arrivals, rootMotionEvents: rootMotionEvents.filter(event => event.eventIndex > firstEvent) };
    },
    destroy() {
      if (destroyed) return;
      crowd.destroy(); query.destroy(); navMesh.destroy();
      rows.clear(); claims.clear(); pendingRootMotion.clear(); initialInputs.clear(); destroyed = true;
    },
  };
}
