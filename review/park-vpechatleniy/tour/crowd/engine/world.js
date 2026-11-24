import { EPS, xyz, xz, distanceXZ, distance3, pointInPolygon, polygonEdges, unionBoundary,
  pointSegmentDistance, segmentDistance, makePolyline, MinHeap } from './geometry.js';
import { RasterGrid } from './grid.js';
import { normalizeProxies, bodyHitsProxy, bakeProxyMask } from './obstacles.js';

const polygon = p => (p.polygon || p).map(xz);
const lengthOf = points => points.slice(1).reduce((s, p, i) => s + distance3(points[i], p), 0);
const pathKey = (floorId, radius, a, b) => `${floorId}|${radius}|${a.x.toFixed(4)},${a.z.toFixed(4)}|${b.x.toFixed(4)},${b.z.toFixed(4)}`;

export function elevatorSlotFits(elevator, slot, radius, height = 0) {
  const cabin = elevator.proposedCabin; if (!cabin) return true;
  const nx = elevator.outward?.[0] ?? 1, nz = elevator.outward?.[2] ?? 0;
  const side = -nz * slot.x + nx * slot.z;
  const depth = nx * slot.x + nz * slot.z - (cabin.center_offset_outward || 0);
  return (cabin.width === undefined || Math.abs(side) + radius + .005 <= cabin.width / 2 + EPS)
    && (cabin.depth === undefined || Math.abs(depth) + radius + .005 <= cabin.depth / 2 + EPS)
    && (cabin.height === undefined || height + .01 <= cabin.height + EPS);
}

class Floor {
  constructor(data, options) {
    this.id = String(data.id); this.elevation = data.elevation ?? 0;
    this.grid = data.grid ? new RasterGrid(data.grid, this.elevation) : null;
    this.baseGrid = data.baseGrid ? new RasterGrid(data.baseGrid, this.elevation) : this.grid;
    this.baseMask = this.baseGrid ? new Uint8Array(this.baseGrid.mask) : null;
    this.bodyHeight = data.baseGrid?.bodyHeight || data.grid?.bodyHeight || 2.05;
    this.runtimeProxies = [];
    const meshRegions = data.navmesh?.polygons?.map(indices => indices.map(i => data.navmesh.vertices[i]));
    this.regions = (data.regions || meshRegions || []).map(polygon);
    if ((!this.regions.length && !this.grid) || this.regions.some(p => p.length < 3)) throw new Error(`Floor ${this.id}: walkable polygons or a conservative grid are required`);
    this.obstacles = [...(data.obstacles || []), ...(data.exclusions || []), ...(data.regions || []).flatMap(r => r.holes || [])].map(polygon);
    this.boundary = data.boundarySegments?.map(e => e.map(xz)) || (this.grid ? [] : unionBoundary(this.regions));
    this.walls = [...this.boundary, ...this.obstacles.flatMap(polygonEdges)];
    this.graphDefinition = data.graph;
    this.gridSize = data.gridSize || options.gridSize || 0.5;
    this.maxGridNodes = options.maxGridNodes || 120000;
    this.navigation = new Map();
    const points = this.regions.flat();
    if (this.grid) points.push(this.grid.origin, { x: this.grid.origin.x + this.grid.width * this.grid.cellSize, z: this.grid.origin.z + this.grid.height * this.grid.cellSize });
    this.bounds = {
      minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)),
      minZ: Math.min(...points.map(p => p.z)), maxZ: Math.max(...points.map(p => p.z))
    };
  }
  pointAllowed(p, radius = 0) {
    if (this.runtimeProxies.some(proxy => bodyHitsProxy(p, p, radius, this.bodyHeight, proxy))) return false;
    if (this.grid && !this.grid.pointAllowed(p, radius)) return false;
    if (this.grid) return !this.obstacles.some(poly => pointInPolygon(p, poly)) && !this.walls.some(([a, b]) => pointSegmentDistance(p, a, b) < radius - EPS);
    if (!this.regions.some(poly => pointInPolygon(p, poly))) return false;
    if (this.obstacles.some(poly => pointInPolygon(p, poly))) return false;
    return !this.walls.some(([a, b]) => pointSegmentDistance(p, a, b) < radius - EPS);
  }
  segmentAllowed(a, b, radius) {
    if (this.runtimeProxies.some(proxy => bodyHitsProxy(a, b, radius, this.bodyHeight, proxy))) return false;
    if (this.grid && !this.grid.segmentAllowed(a, b, radius)) return false;
    return this.pointAllowed(a, radius) && this.pointAllowed(b, radius)
      && !this.walls.some(([c, d]) => segmentDistance(a, b, c, d) < Math.max(radius, EPS * 2) - EPS);
  }
  graph(radius) {
    const key = Math.ceil(radius * 1000) / 1000;
    if (this.navigation.has(key)) return this.navigation.get(key);
    const nodes = [], neighbours = [];
    if (this.graphDefinition) {
      const byId = new Map();
      for (const item of this.graphDefinition.nodes) {
        const p = xyz(item.position, this.elevation); p.y = this.elevation;
        if (!this.pointAllowed(p, key)) continue;
        byId.set(String(item.id), nodes.length); nodes.push(p); neighbours.push([]);
      }
      for (const edge of this.graphDefinition.edges) {
        const a = byId.get(String(edge.from)), b = byId.get(String(edge.to));
        if (a === undefined || b === undefined || !this.segmentAllowed(nodes[a], nodes[b], key)) continue;
        neighbours[a].push(b); if (edge.bidirectional !== false) neighbours[b].push(a);
      }
    } else if (this.grid) {
      const grid = this.grid, cells = new Int32Array(grid.width * grid.height); cells.fill(-1);
      const coordinates = [];
      for (let z = 0; z < grid.height; z++) for (let x = 0; x < grid.width; x++) {
        const p = grid.centre(x, z); if (!this.pointAllowed(p, key)) continue;
        cells[z * grid.width + x] = nodes.length; nodes.push(p); coordinates.push([x, z]); neighbours.push([]);
      }
      for (let i = 0; i < nodes.length; i++) {
        const [x, z] = coordinates[i];
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dz) || x + dx < 0 || z + dz < 0 || x + dx >= grid.width || z + dz >= grid.height) continue;
          const j = cells[(z + dz) * grid.width + x + dx];
          if (j >= 0 && this.segmentAllowed(nodes[i], nodes[j], key)) neighbours[i].push(j);
        }
      }
    } else {
      const s = this.gridSize, b = this.bounds;
      const nx = Math.ceil((b.maxX - b.minX) / s), nz = Math.ceil((b.maxZ - b.minZ) / s);
      if (nx * nz > this.maxGridNodes) throw new Error(`Floor ${this.id}: grid would contain ${nx * nz} cells; supply a graph/route provider or a larger gridSize`);
      const cells = new Map(), coordinates = [];
      for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
        const p = { x: b.minX + (ix + .5) * s, y: this.elevation, z: b.minZ + (iz + .5) * s };
        if (!this.pointAllowed(p, key)) continue;
        cells.set(`${ix},${iz}`, nodes.length); coordinates.push([ix, iz]); nodes.push(p); neighbours.push([]);
      }
      for (let i = 0; i < nodes.length; i++) {
        const [ix, iz] = coordinates[i];
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const j = cells.get(`${ix + dx},${iz + dz}`);
          if (j !== undefined && this.segmentAllowed(nodes[i], nodes[j], key)) neighbours[i].push(j);
        }
      }
    }
    const graph = { nodes, neighbours, radius: key }; this.navigation.set(key, graph); return graph;
  }
}

export class ParkWorld {
  constructor(definition, options = {}) {
    if (definition.units && definition.units !== 'metres' && definition.units !== 'meters') throw new Error('World units must be metres');
    if (definition.up && definition.up !== 'Y') throw new Error('World must be transformed to Y-up before navigation');
    this.options = options; this.definition = definition; this.revision = 0;
    this.floors = new Map((definition.floors || []).map(f => [String(f.id), new Floor(f, options)]));
    if (!this.floors.size) throw new Error('At least one measured floor is required');
    this.destinations = new Map((definition.destinations || []).map(d => [String(d.id), { ...d, id: String(d.id), floorId: String(d.floorId), position: xyz(d.position, this.floor(d.floorId).elevation) }]));
    this.stairs = new Map(); this.elevators = new Map(); this.crossings = new Map(); this.portals = [];
    this.pathCache = new Map(); this.seededPaths = new Map(); this.cellSeededPaths = new Map(); this.transitionClearanceCache = new Map();
    this.staticObstacleProxies = normalizeProxies(definition.staticObstacleProxies || []);
    this.reservedLiftThresholds = normalizeProxies(definition.reservedLiftThresholds || []);
    this.canReplaceObstacles = !this.staticObstacleProxies.length || (definition.floors || []).every(f => !f.grid || f.baseGrid);
    if (this.canReplaceObstacles) this.commitObstacleMasks(this.prepareObstacleMasks(this.staticObstacleProxies), false);
    for (const data of definition.stairs || []) {
      const path = makePolyline(data.polyline), stair = { ...data, id: String(data.id), fromFloor: String(data.fromFloor), toFloor: String(data.toFloor), path };
      if ((data.landings || []).some(l => !Number.isInteger(l.index) || l.index < 1 || l.index >= path.points.length - 1)) throw new Error(`Stair ${stair.id}: landing indices must address internal polyline points`);
      this.floor(stair.fromFloor); this.floor(stair.toFloor);
      if (Math.abs(path.points[0].y - this.floor(stair.fromFloor).elevation) > .03 || Math.abs(path.points.at(-1).y - this.floor(stair.toFloor).elevation) > .03) throw new Error(`Stair ${stair.id}: endpoints do not match floor elevations`);
      this.stairs.set(stair.id, stair);
      this.portals.push({ id: `stairs:${stair.id}:from`, floorId: stair.fromFloor, position: path.points[0], kind: 'stairs', transitionId: stair.id, direction: 1 });
      this.portals.push({ id: `stairs:${stair.id}:to`, floorId: stair.toFloor, position: path.points.at(-1), kind: 'stairs', transitionId: stair.id, direction: -1 });
    }
    for (const data of definition.elevators || []) this.addElevator(data);
    for (const c of definition.crossings || []) {
      this.floor(c.floorId);
      this.crossings.set(String(c.id), { ...c, id: String(c.id), floorId: String(c.floorId), polygon: polygon(c), state: c.closed ? 'closed' : 'open', clearSince: null });
    }
    // Seeds were built for a particular mask and radius. A new CAD baseline is
    // authoritative; stale precomputed routes must never prevent construction.
    if (definition.seedFloorPaths) this.seedFloorPaths(definition.seedFloorPaths, { skipInvalid: (definition.floors || []).some(f => f.baseGrid) });
  }
  floor(id) { const floor = this.floors.get(String(id)); if (!floor) throw new Error(`Unknown floor ${id}`); return floor; }
  invalidate() { this.revision++; this.pathCache.clear(); this.transitionClearanceCache.clear(); }
  transitionPathClear(id, points, radius, height) {
    const key = `${id}|${radius}|${height}`;
    if (this.transitionClearanceCache.has(key)) return this.transitionClearanceCache.get(key);
    const allowed = points.every((point, i) => !i || !this.staticObstacleProxies.some(proxy => bodyHitsProxy(points[i - 1], point, radius, height, proxy)));
    this.transitionClearanceCache.set(key, allowed); return allowed;
  }
  prepareObstacleMasks(proxies) {
    const masks = new Map(), all = [...proxies, ...this.reservedLiftThresholds];
    for (const floor of this.floors.values()) if (floor.baseGrid) masks.set(floor.id, bakeProxyMask(floor.baseGrid, floor.baseMask, all, floor.bodyHeight));
    return { proxies, masks };
  }
  commitObstacleMasks(prepared, invalidate = true) {
    this.staticObstacleProxies = prepared.proxies;
    for (const floor of this.floors.values()) {
      if (floor.baseGrid) {
        // Reuse A* scratch buffers; only occupancy and connected components change.
        floor.grid = floor.baseGrid; floor.grid.mask.set(prepared.masks.get(floor.id));
        floor.grid.components = null; floor.grid.componentSizes = null;
        floor.runtimeProxies = [];
      } else floor.runtimeProxies = [...prepared.proxies, ...this.reservedLiftThresholds];
      floor.navigation.clear();
    }
    if (invalidate) { this.seededPaths.clear(); this.cellSeededPaths.clear(); this.invalidate(); }
  }
  cellPathKey(floorId, radius, a, b) {
    const grid = this.floor(floorId).grid; if (!grid) return null;
    const p = grid.cell(a), q = grid.cell(b); return `${floorId}|${radius}|${p.x},${p.z}|${q.x},${q.z}`;
  }
  addElevator(data) {
    const id = String(data.id); if (this.elevators.has(id)) throw new Error(`Duplicate elevator ${id}`);
    const capacity = data.capacity ?? data.slots?.length;
    if (!(capacity > 0) || !data.slots || capacity > data.slots.length) throw new Error(`Elevator ${id}: supply capacity and at least that many cabin slot offsets`);
    const elevator = { ...data, id, capacity, shaft: xz(data.shaft), slots: data.slots.map(xz), stops: data.stops.map(stop => {
      const elevation = this.floor(stop.floorId).elevation, queueSlots = [];
      for (const p of stop.queueSlots || []) { const point = xyz(p, elevation); if (!queueSlots.some(q => distance3(point, q) < 1e-5)) queueSlots.push(point); }
      return { ...stop, floorId: String(stop.floorId), elevation, lobby: xyz(stop.lobby, elevation), door: xyz(stop.door, elevation), queueSlots };
    }) };
    if (elevator.stops.length < 2 || elevator.stops.some(s => !s.queueSlots.length)) throw new Error(`Elevator ${id}: at least two stops with authored queue slots are required`);
    if (elevator.stops.some(s => [s.lobby, s.door, ...s.queueSlots].some(p => Math.abs(p.y - s.elevation) > .03))) throw new Error(`Elevator ${id}: stop anchors must match their floor elevation`);
    this.elevators.set(id, elevator);
    for (const stop of elevator.stops) this.portals.push({ id: `elevator:${id}:${stop.floorId}`, kind: 'elevator', transitionId: id, floorId: stop.floorId, position: stop.lobby });
    this.invalidate(); return elevator;
  }
  seedFloorPaths(records, { skipInvalid = false } = {}) {
    let count = 0;
    for (const record of records) {
      const floorId = String(record.floorId), radius = record.radius ?? .26, floor = this.floor(floorId);
      const a = xyz(record.from, floor.elevation), b = xyz(record.to, floor.elevation);
      if (!record.points?.length) continue;
      const points = record.points.map(p => xyz(p, floor.elevation));
      if (distance3(points[0], a) > 1e-5 || distance3(points.at(-1), b) > 1e-5 || points.some((p, i) => Math.abs(p.y - floor.elevation) > .03 || i && !floor.segmentAllowed(points[i - 1], p, radius))) {
        if (skipInvalid) continue;
        throw new Error(`Invalid seeded floor path on ${floorId}`);
      }
      const value = { points, length: lengthOf(points), source: 'seeded', floorId, radius };
      this.seededPaths.set(pathKey(floorId, radius, a, b), value); count++;
      const cellKey = this.cellPathKey(floorId, radius, a, b); if (cellKey) this.cellSeededPaths.set(cellKey, value);
      if (record.bidirectional !== false) {
        const reverse = { ...value, points: [...points].reverse() };
        this.seededPaths.set(pathKey(floorId, radius, b, a), reverse);
        const cellReverse = this.cellPathKey(floorId, radius, b, a); if (cellReverse) this.cellSeededPaths.set(cellReverse, reverse); count++;
      }
    }
    return count;
  }
  precomputeStaticConnections({ radius = .26, onProgress } = {}) {
    const records = [];
    for (let i = 0; i < this.portals.length; i++) for (let j = i + 1; j < this.portals.length; j++) {
      const a = this.portals[i], b = this.portals[j]; if (a.floorId !== b.floorId) continue;
      const path = this.floorPath(a.floorId, a.position, b.position, radius);
      if (path) records.push({ floorId: a.floorId, from: a.position, to: b.position, radius, points: path.points, bidirectional: true });
      onProgress?.({ from: a.id, to: b.id, reachable: !!path, count: records.length });
    }
    this.seedFloorPaths(records); return records;
  }
  exportFloorPaths() {
    const records = [], keys = new Set();
    for (const value of [...this.seededPaths.values(), ...this.pathCache.values()]) {
      if (!value?.points?.length || !value.floorId) continue;
      const from = value.points[0], to = value.points.at(-1), key = pathKey(value.floorId, value.radius, from, to); if (keys.has(key)) continue;
      keys.add(key); records.push({ floorId: value.floorId, from, to, radius: value.radius, points: value.points, bidirectional: true });
    }
    return records;
  }
  pointAllowed(floorId, p, radius = .26, ignoreCrossings = []) {
    if (!this.floor(floorId).pointAllowed(p, radius)) return false;
    for (const crossing of this.crossings.values()) if (crossing.floorId === String(floorId) && crossing.state !== 'open' && !ignoreCrossings.includes(crossing.id)) {
      if (pointInPolygon(p, crossing.polygon) || polygonEdges(crossing.polygon).some(([a, b]) => pointSegmentDistance(p, a, b) < radius)) return false;
    }
    return true;
  }
  segmentAllowed(floorId, a, b, radius = .26, ignoreCrossings = []) {
    if (!this.floor(floorId).segmentAllowed(a, b, radius)) return false;
    for (const crossing of this.crossings.values()) if (crossing.floorId === String(floorId) && crossing.state !== 'open' && !ignoreCrossings.includes(crossing.id)) {
      if (pointInPolygon(a, crossing.polygon) || pointInPolygon(b, crossing.polygon) || polygonEdges(crossing.polygon).some(([c, d]) => segmentDistance(a, b, c, d) < radius)) return false;
    }
    return true;
  }
  crossingOccupancy(position, radius, crossing) {
    return pointInPolygon(position, crossing.polygon) || polygonEdges(crossing.polygon).some(([a, b]) => pointSegmentDistance(position, a, b) < radius);
  }
  floorPath(floorId, from, to, radius = .26) {
    floorId = String(floorId); const floor = this.floor(floorId), a = xyz(from, floor.elevation), b = xyz(to, floor.elevation);
    a.y = b.y = floor.elevation;
    const seedKey = pathKey(floorId, radius, a, b), key = `${this.revision}|${seedKey}`;
    if (this.pathCache.has(key)) return this.pathCache.get(key);
    const save = value => { if (value) { value.floorId = floorId; value.radius = radius; } if (this.pathCache.size >= (this.options.pathCacheSize || 512)) this.pathCache.delete(this.pathCache.keys().next().value); this.pathCache.set(key, value); return value; };
    if (!this.pointAllowed(floorId, a, radius) || !this.pointAllowed(floorId, b, radius)) return save(null);
    const allowed = (p, q) => this.segmentAllowed(floorId, p, q, radius);
    const seeded = this.seededPaths.get(seedKey) || this.cellSeededPaths.get(this.cellPathKey(floorId, radius, a, b));
    if (seeded) {
      const points = [a, ...seeded.points.slice(1, -1), b];
      if (points.every((p, i) => !i || allowed(points[i - 1], p))) return save({ ...seeded, points, length: lengthOf(points) });
    }
    if (allowed(a, b)) return save({ points: [a, b], length: distanceXZ(a, b), source: 'direct' });
    if (this.options.floorRouteProvider) {
      const supplied = this.options.floorRouteProvider({ floorId, from: a, to: b, radius, revision: this.revision, avoidPolygons: [...this.crossings.values()].filter(c => c.floorId === floorId && c.state !== 'open').map(c => c.polygon) });
      if (!supplied) return save(null);
      const points = [a, ...(supplied.points || supplied).map(p => xyz(p, floor.elevation)), b];
      if (points.some((p, i) => i && !allowed(points[i - 1], p))) throw new Error(`Route provider returned a path through a forbidden area on ${floorId}`);
      return save({ points, length: lengthOf(points), source: 'provider' });
    }
    if (floor.grid) {
      const maskOnly = !floor.obstacles.length && ![...this.crossings.values()].some(c => c.floorId === floorId && c.state !== 'open');
      const points = floor.grid.findPath(a, b, { radius, segmentAllowed: allowed, pointAllowed: p => this.pointAllowed(floorId, p, radius), maskOnly });
      return save(points ? { points, length: lengthOf(points), source: 'raster_astar' } : null);
    }
    const graph = floor.graph(radius), { nodes, neighbours } = graph;
    const nearest = point => {
      const candidates = nodes.map((p, i) => ({ i, d: distanceXZ(p, point) })).sort((u, v) => u.d - v.d), result = [];
      for (const item of candidates) { if (allowed(point, nodes[item.i])) result.push(item); if (result.length >= (this.options.endpointConnections || 12)) break; }
      return result;
    };
    const starts = nearest(a), ends = nearest(b), endSet = new Set(ends.map(e => e.i));
    if (!starts.length || !ends.length) return save(null);
    const costs = new Float64Array(nodes.length); costs.fill(Infinity);
    const previous = new Int32Array(nodes.length); previous.fill(-1);
    const heap = new MinHeap();
    for (const { i, d } of starts) { costs[i] = d; heap.push({ i, g: d }, d + distanceXZ(nodes[i], b)); }
    let found = -1;
    while (heap.size) {
      const { i, g } = heap.pop(); if (g > costs[i] + EPS) continue;
      if (endSet.has(i)) { found = i; break; }
      for (const j of neighbours[i]) {
        if (!allowed(nodes[i], nodes[j])) continue;
        const next = g + distanceXZ(nodes[i], nodes[j]);
        if (next + EPS >= costs[j]) continue;
        costs[j] = next; previous[j] = i; heap.push({ i: j, g: next }, next + distanceXZ(nodes[j], b));
      }
    }
    if (found < 0) return save(null);
    const chain = [b]; for (let i = found; i >= 0; i = previous[i]) chain.push(nodes[i]); chain.push(a); chain.reverse();
    const points = [a]; let i = 0;
    while (i < chain.length - 1) { let j = chain.length - 1; while (j > i + 1 && !allowed(chain[i], chain[j])) j--; points.push(chain[j]); i = j; }
    return save({ points, length: lengthOf(points), source: floor.graphDefinition ? 'graph' : 'grid' });
  }
  planRoute(from, destination, radius = .26, options = {}) {
    const target = typeof destination === 'string' ? this.destinations.get(destination) : destination;
    if (!target) return { ok: false, reason: 'unknown_destination', segments: [] };
    const start = { id: '$start', floorId: String(from.floorId), position: xyz(from.position), kind: 'endpoint' };
    const end = { id: '$end', floorId: String(target.floorId), position: xyz(target.position), kind: 'endpoint' };
    if (!this.pointAllowed(start.floorId, start.position, radius) || !this.pointAllowed(end.floorId, end.position, radius)) return { ok: false, reason: 'endpoint_clearance', segments: [] };
    const fitsElevator = elevator => {
      const cabin = elevator.proposedCabin, height = from.height || this.floor(start.floorId).bodyHeight;
      return !elevator.disabled && (!cabin || (cabin.door_opening_width === undefined || radius * 2 + .01 <= cabin.door_opening_width + EPS)
        && (cabin.door_opening_height === undefined || height + .01 <= cabin.door_opening_height + EPS))
        && elevator.slots.some((slot, index) => {
          if (!elevatorSlotFits(elevator, slot, radius, height)) return false;
          const positions = elevator.stops.map(stop => ({ x: elevator.shaft.x + slot.x, y: stop.elevation, z: elevator.shaft.z + slot.z }));
          return this.transitionPathClear(`elevator:${elevator.id}:${index}:shaft`, positions, radius, height)
            && elevator.stops.every((stop, stopIndex) => this.transitionPathClear(`elevator:${elevator.id}:${index}:${stop.floorId}`,
              [...(stop.entryPath || [stop.lobby, stop.door]).map(p => xyz(p, stop.elevation)), positions[stopIndex], ...(stop.exitPath || [stop.door, stop.lobby]).map(p => xyz(p, stop.elevation))], radius, height));
        });
    };
    // Most of the 100 visitors stay on one floor. Do not evaluate every stair
    // portal just to discover that an ordinary floor path already exists.
    if (start.floorId === end.floorId) {
      const path = this.floorPath(start.floorId, start.position, end.position, radius);
      if (path) return { ok: true, segments: [{ kind: 'walk', floorId: start.floorId, points: path.points }], cost: path.length, target, revision: this.revision };
    }
    const portals = this.portals.filter(p => !(options.accessibleOnly && p.kind === 'stairs') && (!options.allowedTransitions || options.allowedTransitions.includes(p.kind)));
    if (this.floors.size === 2 && start.floorId !== end.floorId) {
      // The park has two measured floors. Evaluate direct real connectors by
      // admissible XZ distance bounds instead of expanding all 48 portals.
      const candidates = [];
      for (const a of portals) if (a.floorId === start.floorId) for (const b of portals) {
        if (b.floorId !== end.floorId || a.kind !== b.kind || a.transitionId !== b.transitionId) continue;
        let segment, weight;
        if (a.kind === 'stairs') {
          const stair = this.stairs.get(a.transitionId);
          if (stair.width !== undefined && stair.width < radius * 2 + .05 || a.direction < 0 && stair.bidirectional === false) continue;
          if (!this.transitionPathClear(`stairs:${stair.id}`, stair.path.points, radius, from.height || this.floor(start.floorId).bodyHeight)) continue;
          segment = { kind: 'stairs', id: stair.id, direction: a.direction, fromFloor: a.floorId, toFloor: b.floorId }; weight = stair.path.length / (stair.speedFactor || .65);
        } else {
          const elevator = this.elevators.get(a.transitionId); if (!fitsElevator(elevator)) continue;
          segment = { kind: 'elevator', id: elevator.id, fromFloor: a.floorId, toFloor: b.floorId };
          weight = (elevator.routeWaitEstimate || 8) + Math.abs(a.position.y - b.position.y) / (elevator.speed || 1.4);
        }
        candidates.push({ a, b, segment, weight, lowerBound: distanceXZ(start.position, a.position) + weight + distanceXZ(b.position, end.position) });
      }
      candidates.sort((a, b) => a.lowerBound - b.lowerBound); let best = null;
      for (const candidate of candidates) {
        if (best && candidate.lowerBound >= best.cost) break;
        const first = this.floorPath(start.floorId, start.position, candidate.a.position, radius); if (!first) continue;
        const last = this.floorPath(end.floorId, candidate.b.position, end.position, radius); if (!last) continue;
        const cost = first.length + candidate.weight + last.length;
        if (!best || cost < best.cost) best = { ok: true, cost, target, revision: this.revision, segments: [
          { kind: 'walk', floorId: start.floorId, points: first.points }, candidate.segment, { kind: 'walk', floorId: end.floorId, points: last.points }
        ] };
      }
      if (best) return best;
    }
    const nodes = [start, end, ...portals], distances = new Array(nodes.length).fill(Infinity), previous = new Map(), heap = new MinHeap();
    distances[0] = 0; heap.push({ i: 0, cost: 0 }, 0);
    while (heap.size) {
      const { i, cost } = heap.pop(); if (cost > distances[i] + EPS) continue;
      if (i === 1) break;
      const source = nodes[i];
      for (let j = 1; j < nodes.length; j++) {
        if (i === j) continue; const dest = nodes[j]; let segment, weight;
        if (source.floorId === dest.floorId) {
          const path = this.floorPath(source.floorId, source.position, dest.position, radius);
          if (!path) continue;
          segment = { kind: 'walk', floorId: source.floorId, points: path.points }; weight = path.length;
        } else if (source.kind === 'stairs' && dest.kind === 'stairs' && source.transitionId === dest.transitionId) {
          const stair = this.stairs.get(source.transitionId);
          if (stair.width !== undefined && stair.width < radius * 2 + .05) continue;
          if (!this.transitionPathClear(`stairs:${stair.id}`, stair.path.points, radius, from.height || this.floor(start.floorId).bodyHeight)) continue;
          if (source.direction < 0 && stair.bidirectional === false) continue;
          segment = { kind: 'stairs', id: stair.id, direction: source.direction, fromFloor: source.floorId, toFloor: dest.floorId }; weight = stair.path.length / (stair.speedFactor || .65);
        } else if (source.kind === 'elevator' && dest.kind === 'elevator' && source.transitionId === dest.transitionId) {
          const elevator = this.elevators.get(source.transitionId);
          if (!fitsElevator(elevator)) continue;
          segment = { kind: 'elevator', id: elevator.id, fromFloor: source.floorId, toFloor: dest.floorId };
          weight = (elevator.routeWaitEstimate || 8) + Math.abs(source.position.y - dest.position.y) / (elevator.speed || 1.4);
        } else continue;
        const next = cost + weight;
        if (next + EPS < distances[j]) { distances[j] = next; previous.set(j, { i, segment }); heap.push({ i: j, cost: next }, next); }
      }
    }
    if (!Number.isFinite(distances[1])) return { ok: false, reason: 'unreachable_for_clearance_or_graph_resolution', segments: [] };
    const segments = []; for (let i = 1; i !== 0;) { const edge = previous.get(i); segments.push(edge.segment); i = edge.i; } segments.reverse();
    return { ok: true, segments, cost: distances[1], target, revision: this.revision };
  }
}
