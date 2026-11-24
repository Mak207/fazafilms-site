import { xyz, distanceXZ, seededRandom } from './geometry.js';

const finiteBody = (radius, height) => Number.isFinite(radius) && radius > 0 && Number.isFinite(height) && height > 0;

function candidatesFor(sim, radius, height, supplied) {
  if (supplied) return supplied.map(value => ({ floorId: String(value.floorId), position: xyz(value.position, sim.world.floor(value.floorId).elevation) }));
  const key = `${sim.world.revision}:${radius}:${height}`;
  if (sim.spawnCandidates?.key === key) return sim.spawnCandidates.points;
  const points = [], pitch = Math.max(radius * 2 + sim.contactMargin + .12, .5);
  for (const floor of sim.world.floors.values()) {
    const b = floor.bounds, grid = floor.grid;
    if (grid && radius > grid.clearanceRadius + 1e-8 || height > floor.bodyHeight + 1e-8) continue;
    grid?.computeComponents();
    for (let z = b.minZ + pitch / 2; z < b.maxZ; z += pitch) for (let x = b.minX + pitch / 2; x < b.maxX; x += pitch) {
      const position = { x, y: floor.elevation, z };
      if (!sim.world.pointAllowed(floor.id, position, radius)) continue;
      if (grid && grid.componentSizes[grid.componentAt(position)] < 48) continue;
      if (sim.inTransitionCorridor(position, radius, height)) continue;
      points.push({ floorId: floor.id, position });
    }
  }
  // Spread each small UI batch over the entire park instead of filling one
  // entrance/first grid row. This sequence remains deterministic for QA.
  const random = seededRandom(`park-population:${radius}:${height}`);
  for (let i = points.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [points[i], points[j]] = [points[j], points[i]]; }
  sim.spawnCandidates = { key, points, cursor: 0 }; return points;
}

export function localItinerary(sim, floorId, position, radius, seed) {
  const random = seededRandom(seed), result = [], floor = sim.world.floor(floorId);
  for (let attempt = 0; attempt < 36 && result.length < 4; attempt++) {
    const angle = random() * Math.PI * 2, distance = 2.5 + random() * 7.5;
    const p = { x: position.x + Math.cos(angle) * distance, y: position.y, z: position.z + Math.sin(angle) * distance };
    if (!sim.world.segmentAllowed(floorId, position, p, radius) || sim.inTransitionCorridor(p, radius, floor.bodyHeight)) continue;
    if (result.some(target => distanceXZ(target.position, p) < 1.5)) continue;
    // Anonymous targets deliberately do not reserve one of the 400 authored
    // destination slots. Added people receive independent wandering routes.
    result.push({ floorId, position: p, dwellSeconds: [1, 4] });
  }
  if (result.length) result.push({ floorId, position: { ...position }, dwellSeconds: [1, 4] });
  return result;
}

export function setPopulation(sim, target, options = {}) {
  if (!Number.isSafeInteger(target) || target < 0) throw new Error('Population target must be a nonnegative safe integer');
  const maxChanges = options.maxChanges ?? 64;
  if (!Number.isSafeInteger(maxChanges) || maxChanges < 1) throw new Error('maxChanges must be a positive safe integer');
  const added = [], removed = [], before = sim.order.length;
  sim.populationTarget = target;
  if (target < before) {
    const ids = sim.order.slice(Math.max(target, before - maxChanges)).map(agent => agent.id);
    sim.removeAgents(ids); removed.push(...ids);
  } else if (target > before) {
    const radius = options.radius ?? sim.defaultRadius, height = options.height ?? sim.defaultHeight;
    if (!finiteBody(radius, height)) throw new Error('Population body dimensions must be finite and positive');
    const candidates = candidatesFor(sim, radius, height, options.spawnCandidates), count = candidates.length;
    let cursor = options.spawnCandidates ? 0 : sim.spawnCandidates?.cursor || 0, scanned = 0;
    while (sim.order.length < target && added.length < maxChanges && scanned < count) {
      const candidate = candidates[cursor++ % count]; scanned++;
      if (!sim.spawnClear(candidate.floorId, candidate.position, radius, height)) continue;
      const id = `visitor-dynamic-${String(++sim.populationSequence).padStart(6, '0')}`;
      const defaultItinerary = localItinerary(sim, candidate.floorId, candidate.position, radius, id);
      if (!defaultItinerary.length && !options.spawnCandidates) continue;
      const supplied = options.makeAgent?.({ id, index: sim.order.length, floorId: candidate.floorId, position: { ...candidate.position }, defaultItinerary }) || {};
      const definition = { radius, height, strideMeters: sim.options.defaultStrideMeters, itinerary: defaultItinerary, autoWander: true, ...supplied,
        id: supplied.id ?? id, floorId: candidate.floorId, position: { ...candidate.position }, deferDestination: true };
      if (!finiteBody(definition.radius, definition.height)) throw new Error('makeAgent returned invalid body dimensions');
      if (!sim.spawnClear(candidate.floorId, candidate.position, definition.radius, definition.height)) continue;
      added.push(sim.addAgent(definition));
    }
    if (!options.spawnCandidates && sim.spawnCandidates) sim.spawnCandidates.cursor = cursor % Math.max(1, count);
    const capacityLimited = sim.order.length < target && added.length < maxChanges && scanned >= count;
    return { target, count: sim.order.length, added, removed, complete: sim.order.length === target,
      capacityLimited, reason: capacityLimited ? 'no_safe_spawn_locations' : null, candidateCount: count, scanned };
  }
  return { target, count: sim.order.length, added, removed, complete: sim.order.length === target, capacityLimited: false, reason: null };
}
