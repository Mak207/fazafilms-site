import { xyz, pointSegmentDistance, samplePolyline } from './geometry.js';
import { normalizeProxies, bodyHitsProxy } from './obstacles.js';

export function transitionCorridors(sim) {
  if (sim.transitionCorridors) return sim.transitionCorridors;
  const records = [], add = (id, points, kind) => {
    for (let i = 0; i < Math.max(1, points.length - 1); i++) records.push({ id, kind, a: xyz(points[i]), b: xyz(points[Math.min(i + 1, points.length - 1)]) });
  };
  for (const stair of sim.world.stairs.values()) {
    add(stair.id, stair.path.points, 'stairs');
    for (const slots of Object.values(stair.queueSlots || {})) for (const point of slots) add(stair.id, [point], 'queue');
  }
  for (const lift of sim.world.elevators.values()) {
    for (const stop of lift.stops) {
      const entry = (stop.entryPath || [stop.lobby, stop.door]).map(p => xyz(p, stop.elevation));
      for (const slot of lift.slots) add(lift.id, [...entry, { x: lift.shaft.x + slot.x, y: stop.elevation, z: lift.shaft.z + slot.z }], 'elevator_entry');
      add(lift.id, (stop.exitPath || [stop.door, stop.lobby]).map(p => xyz(p, stop.elevation)), 'elevator_exit');
      for (const point of stop.queueSlots) add(lift.id, [point], 'queue');
    }
    for (const slot of lift.slots) add(lift.id, lift.stops.map(stop => ({ x: lift.shaft.x + slot.x, y: stop.elevation, z: lift.shaft.z + slot.z })), 'elevator_shaft');
  }
  sim.transitionCorridors = records; return records;
}

export function inTransitionCorridor(sim, point, radius, height) {
  const envelope = Math.max(sim.defaultRadius, sim.maxRadius), bodyHeight = Math.max(sim.defaultHeight, height);
  const clearance = radius + envelope + .08;
  for (const { a, b } of transitionCorridors(sim)) {
    if (point.y >= Math.max(a.y, b.y) + bodyHeight || point.y + height <= Math.min(a.y, b.y)) continue;
    if (point.x < Math.min(a.x, b.x) - clearance || point.x > Math.max(a.x, b.x) + clearance
      || point.z < Math.min(a.z, b.z) - clearance || point.z > Math.max(a.z, b.z) + clearance) continue;
    if (pointSegmentDistance(point, a, b) < clearance) return true;
  }
  return false;
}

const shapeKey = p => JSON.stringify([p.shape, p.centerXZ, p.halfSizeXZ, p.rotationY, p.radius, p.minY, p.maxY]);

export function updateObstacles(sim, records, options = {}) {
  const world = sim.world, revision = world.revision, fail = (reason, conflicts = []) => ({ ok: false, applied: false, revision, reason, conflicts });
  if (options.expectedRevision !== undefined && options.expectedRevision !== revision) return fail('revision_conflict');
  if (!world.canReplaceObstacles) return fail('missing_clean_navigation_baseline');
  let proxies;
  try {
    const fixed = options.replaceAll ? [] : world.staticObstacleProxies.filter(p => p.kind !== 'exhibit');
    proxies = normalizeProxies([...fixed, ...records]);
  } catch (error) { return fail('invalid_obstacle_data', [{ message: error.message }]); }
  const previous = new Map(world.staticObstacleProxies.map(p => [p.id, shapeKey(p)]));
  const changed = proxies.filter(p => previous.get(p.id) !== shapeKey(p));
  const removed = world.staticObstacleProxies.filter(p => !proxies.some(next => next.id === p.id));
  if (!changed.length && !removed.length) return { ok: true, applied: false, revision, conflicts: [], unchanged: true };
  const conflicts = [], maxConflicts = 12, radius = Math.max(sim.defaultRadius, sim.maxRadius);
  const height = Math.max(sim.defaultHeight, ...sim.order.map(a => a.height));
  for (const obstacle of changed) {
    for (const agent of sim.occupancy.query({ x: obstacle.centerXZ[0], z: obstacle.centerXZ[1] },
      (obstacle.shape === 'circle' ? obstacle.radius : Math.hypot(...obstacle.halfSizeXZ)) + sim.maxRadius + 1)) {
      const current = agent.position;
      const next = agent.transit ? samplePolyline(agent.transit.path, Math.min(agent.transit.path.length, agent.transit.progress + agent.transit.speed * sim.fixedStep))
        : { x: current.x + agent.velocity.x * sim.fixedStep, y: current.y, z: current.z + agent.velocity.z * sim.fixedStep };
      if (bodyHitsProxy(current, next, agent.radius, agent.height, obstacle)
        || bodyHitsProxy(agent.previousPosition, current, agent.radius, agent.height, obstacle)) conflicts.push({ kind: 'occupied_by_visitors', agentId: agent.id, obstacleId: obstacle.id });
      if (conflicts.length >= maxConflicts) return fail('occupied_by_visitors', conflicts);
    }
    // Authored stairs, doorways, cabin travel and queue anchors retain their
    // narrow, measured swept-body corridors even when currently empty.
    for (const corridor of transitionCorridors(sim)) {
      if (bodyHitsProxy(corridor.a, corridor.b, radius, height, obstacle)) {
        conflicts.push({ kind: 'transition_corridor', transitionId: corridor.id, corridor: corridor.kind, obstacleId: obstacle.id }); break;
      }
    }
    for (const agent of sim.order) if (agent.transit) {
      const points = agent.transit.path.points;
      if (points.some((point, i) => i && bodyHitsProxy(points[i - 1], point, agent.radius, agent.height, obstacle))) {
        conflicts.push({ kind: 'active_transfer', agentId: agent.id, obstacleId: obstacle.id });
      }
      if (conflicts.length >= maxConflicts) return fail(conflicts[0].kind, conflicts);
    }
    if (conflicts.length >= maxConflicts) return fail(conflicts[0].kind, conflicts);
  }
  if (conflicts.length) return fail(conflicts[0].kind, conflicts);
  const prepared = world.prepareObstacleMasks(proxies);
  // The conservative cell guard is stricter than the exact current disc. A
  // placement cannot invalidate the cell under a walker and strand them there.
  for (const agent of sim.order) if (agent.floorId !== null && !agent.transit) {
    const floor = world.floor(agent.floorId), mask = prepared.masks.get(floor.id);
    if (mask) {
      const cell = floor.grid.cell(agent.position);
      if (!mask[cell.z * floor.grid.width + cell.x]) conflicts.push({ kind: 'no_clearance', agentId: agent.id });
    }
    if (conflicts.length >= maxConflicts) return fail('no_clearance', conflicts);
  }
  if (conflicts.length) return fail('no_clearance', conflicts);
  if (options.dryRun) return { ok: true, applied: false, revision, conflicts: [] };
  world.commitObstacleMasks(prepared);
  sim.spawnCandidates = null;
  const invalidPath = (agent, floorId, points, first = 1) => {
    for (let i = first; i < points.length; i++) if (!world.segmentAllowed(floorId, points[i - 1], points[i], agent.radius)) return true;
    return false;
  };
  const affected = new Set();
  for (const agent of sim.order) {
    if (agent.activity === 'blocked' || agent.activity === 'route_pending') { affected.add(agent.id); continue; }
    if (agent.activity === 'idle') { agent.routeRevision = world.revision; continue; }
    if (agent.queuePath && invalidPath(agent, agent.floorId, [agent.position, ...agent.queuePath.points.slice(agent.queuePath.waypoint)])) affected.add(agent.id);
    if (agent.activePath && invalidPath(agent, agent.floorId, [agent.position, ...agent.activePath.points.slice(agent.activePath.waypoint)])) affected.add(agent.id);
    for (const segment of agent.route?.segments.slice(agent.routeIndex + (agent.activePath ? 1 : 0)) || []) {
      if (segment.kind === 'walk' && invalidPath(agent, segment.floorId, segment.points)) { affected.add(agent.id); break; }
    }
    if (!affected.has(agent.id)) agent.routeRevision = world.revision;
  }
  const cancelIds = new Set(sim.order.filter(agent => affected.has(agent.id) && !agent.transit && agent.activity !== 'elevator_ride').map(agent => agent.id));
  for (const controller of sim.controllers) controller.cancelMany(cancelIds);
  for (const agent of sim.order) {
    if (!affected.has(agent.id)) continue;
    const destination = agent.pendingDestination || agent.goal;
    if (agent.transit || agent.activity === 'elevator_ride') { if (destination) agent.pendingAfterTransition = destination; continue; }
    sim.releaseDestination(agent);
    agent.route = null; agent.activePath = null; agent.queuePath = null; agent.queueReady = false; agent.elevatorId = null;
    agent.velocity = { x: 0, z: 0 }; agent.speed = 0;
    agent.activity = destination ? 'route_pending' : 'idle'; agent.pendingDestination = destination || null;
    agent.routeRevision = revision;
  }
  sim.emit('obstacles_updated', { revision: world.revision, changed: changed.map(p => p.id), removed: removed.map(p => p.id), replanned: affected.size });
  return { ok: true, applied: true, revision: world.revision, conflicts: [], replanned: affected.size };
}
