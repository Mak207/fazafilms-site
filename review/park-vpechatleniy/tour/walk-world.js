import * as THREE from 'three';
import { RasterGrid } from './crowd/engine/grid.js';
import { normalizeProxies, bodyHitsProxy, proxyBounds } from './crowd/engine/obstacles.js';
import { pointInPolygon } from './crowd/engine/geometry.js';

const EPS = 1e-7;
const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
const distance2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
const xz = p => Array.isArray(p) ? { x: p[0], z: p.length > 2 ? p[2] : p[1] } : p;
const levelOf = p => String(p.level ?? p.floorId ?? 'main').replace(/^mezzanine$/, 'upper');

function normalizeLiveObstacle(record) {
  const item = { ...record };
  if (item.shape === 'cylinder') {
    item.shape = 'circle'; item.centerXZ = record.centerXZ || [record.x, record.z];
  } else if (item.shape === 'capsule') {
    const a = record.start, b = record.end, r = record.radius;
    if (a?.length !== 3 || b?.length !== 3 || ![...a, ...b, r].every(Number.isFinite) || r <= 0) throw new Error('Некорректная форма препятствия.');
    const dx = b[0] - a[0], dz = b[2] - a[2];
    item.shape = 'obb'; item.centerXZ = [(a[0] + b[0]) / 2, (a[2] + b[2]) / 2];
    item.halfSizeXZ = [Math.hypot(dx, dz) / 2 + r, r];
    item.rotationY = Math.atan2(-dz, dx);
    item.minY = record.minY ?? Math.min(a[1], b[1]) - r;
    item.maxY = record.maxY ?? Math.max(a[1], b[1]) + r;
  }
  return item;
}

/**
 * A person on the measured CAD floors, not a flying camera.
 * Positions use feet Y and level "main"/"upper". Camera Y is feet Y + eyeHeight.
 * The clean CAD cells conservatively include the entire standing body and
 * their complete area. Live exhibit parts are swept continuously, separately.
 * getDynamicObstacles replaces the historical scene proxies; pass ALL current
 * exhibit parts, screens, track/station bodies and moving vehicles together.
 */
export function createWalkWorld({ worldData, sourceMeshes = [], getDynamicObstacles = null,
  getCollisionMeshes = () => [], radius = .30, height = 1.80, eyeHeight = 1.65 } = {}) {
  if (!worldData?.floors?.length) throw new Error('Не загружены проверенные проходы парка.');
  if (!(radius > 0 && height > eyeHeight && eyeHeight > 0)) throw new Error('Некорректные размеры посетителя.');
  const floors = new Map();
  for (const definition of worldData.floors) {
    const gridData = definition.baseGrid;
    // A baked historical exhibit mask cannot be used after objects are moved.
    if (!gridData) throw new Error('Нет чистой геометрии проходов уровня ' + definition.id + '.');
    if (radius > gridData.clearanceRadius + EPS || height > (gridData.bodyHeight || 0) + EPS) throw new Error('Размер посетителя превышает проверенный запас проходов.');
    const id = String(definition.id), grid = new RasterGrid(gridData, definition.elevation);
    floors.set(id, { id, name: definition.name || id, y: definition.elevation, grid });
  }
  const bucketSize = 6, bins = new Map(), raycaster = new THREE.Raycaster();
  raycaster.firstHitOnly = true;
  let proxies = [], revision = 0, signature = '', lastError = null, disposed = false, syncedInTask = false;
  const stats = { movementChecks: 0, blockedMoves: 0, safeSpawns: 0, relocations: 0 };
  const source = sourceMeshes.filter(mesh => mesh?.isMesh && mesh.geometry?.attributes?.position);
  const floor = level => floors.get(String(level).replace(/^mezzanine$/, 'upper'));
  const atFloor = (p, f) => ({ x: p.x, y: f.y, z: p.z, level: f.id });

  function sync(force = false) {
    if (disposed) return false;
    // A frame and all its ray queries are one JS task. Snapshot live assembly
    // parts once for that task, never rebuild 900 bodies per target/ray.
    // After an explicit same-task edit the caller may request sync(true).
    if (syncedInTask && !force) return false;
    syncedInTask = true; queueMicrotask(() => { syncedInTask = false; });
    try {
      const live = getDynamicObstacles ? getDynamicObstacles() : worldData.staticObstacleProxies || [];
      if (!Array.isArray(live)) throw new Error('Не получены препятствия экспозиции.');
      const records = [...(worldData.reservedLiftThresholds || []), ...live].map(normalizeLiveObstacle);
      const nextSignature = JSON.stringify(records.map(p => [p.id, p.shape, p.centerXZ, p.halfSizeXZ, p.rotationY, p.radius, p.minY, p.maxY, p.instanceId, p.objectId,p.collisionKind,p.occludesSight]));
      if (signature === nextSignature && !lastError) return false;
      // Duplicate IDs are an error, never a reason to silently discard a body.
      const next = normalizeProxies(records);
      bins.clear();
      for (const proxy of next) {
        const b = proxyBounds(proxy);
        for (let x = Math.floor(b[0] / bucketSize); x <= Math.floor(b[1] / bucketSize); x++) {
          for (let z = Math.floor(b[2] / bucketSize); z <= Math.floor(b[3] / bucketSize); z++) {
            const key = x + ',' + z; let bucket = bins.get(key);
            if (!bucket) bins.set(key, bucket = []);
            bucket.push(proxy);
          }
        }
      }
      proxies = next; signature = nextSignature; lastError = null; revision++;
      return true;
    } catch (error) {
      // Fail closed: malformed or unavailable bodies cannot permit walking.
      lastError = error.message || String(error); return false;
    }
  }

  function nearby(a, b, margin = radius) {
    const result = new Set();
    for (let x = Math.floor((Math.min(a.x, b.x) - margin) / bucketSize); x <= Math.floor((Math.max(a.x, b.x) + margin) / bucketSize); x++) {
      for (let z = Math.floor((Math.min(a.z, b.z) - margin) / bucketSize); z <= Math.floor((Math.max(a.z, b.z) + margin) / bucketSize); z++) {
        for (const proxy of bins.get(x + ',' + z) || []) result.add(proxy);
      }
    }
    return result;
  }
  function pointFree(p) {
    const f = floor(levelOf(p));
    return !disposed && !lastError && finitePoint(p) && f && Math.abs(p.y - f.y) < .03
      && f.grid.pointAllowed(p, radius)
      && ![...nearby(p, p)].some(proxy => bodyHitsProxy(p, p, radius, height, proxy));
  }
  function segmentFree(a, b, ignored = null) {
    const f = floor(levelOf(a));
    if (disposed || lastError || !finitePoint(a) || !finitePoint(b) || !f || levelOf(a) !== levelOf(b)
      || Math.abs(a.y - f.y) >= .03 || Math.abs(b.y - f.y) >= .03 || !f.grid.segmentAllowed(a, b, radius)) return false;
    for (const proxy of nearby(a, b)) if (!ignored?.has(proxy.id) && bodyHitsProxy(a, b, radius, height, proxy)) return false;
    return true;
  }

  function isFree(p) { sync(); return pointFree(p); }
  function segmentAllowed(a, b) { sync(); return segmentFree(a, b); }

  function zoneContains(p, { polygon, polygons } = {}) {
    const regions = polygons || (polygon ? [polygon] : null);
    if (!regions?.length) return true;
    return regions.some(region => {
      const outer = region.outer || region;
      return pointInPolygon(p, outer.map(xz)) && !(region.holes || []).some(hole => pointInPolygon(p, hole.map(xz)));
    });
  }
  function spawnCandidate(request, pathFrom = null, ignored = null) {
    const f = floor(levelOf(request));
    if (!f || !Number.isFinite(request.x) || !Number.isFinite(request.z) || lastError || disposed) return null;
    const centre = atFloor(request, f), distance = Math.max(0, Math.min(60, request.maxDistance ?? 18));
    const accept = p => zoneContains(p, request) && pointFree(p) && (!pathFrom || segmentFree(pathFrom, p, ignored));
    if (accept(centre)) return centre;
    const g = f.grid, start = g.cell({ x: centre.x - distance, z: centre.z - distance }), end = g.cell({ x: centre.x + distance, z: centre.z + distance });
    const candidates = [];
    for (let z = Math.max(0, start.z); z <= Math.min(g.height - 1, end.z); z++) {
      for (let x = Math.max(0, start.x); x <= Math.min(g.width - 1, end.x); x++) {
        if (!g.contains(x, z)) continue;
        const p = { ...g.centre(x, z), level: f.id }, d = distance2(p, centre);
        if (d <= distance * distance + EPS && zoneContains(p, request)) candidates.push({ p, d });
      }
    }
    candidates.sort((a, b) => a.d - b.d);
    for (const candidate of candidates) if (accept(candidate.p)) return candidate.p;
    return null;
  }
  function spawnNear(request) {
    sync(); const result = spawnCandidate(request);
    if (result) stats.safeSpawns++;
    return result;
  }

  function revalidate(position, { maxDistance = 3 } = {}) {
    sync();
    if (pointFree(position)) return { position: { ...position, level: levelOf(position) }, relocated: false, reason: null };
    const f = floor(levelOf(position));
    if (!f || lastError || !finitePoint(position) || !f.grid.pointAllowed(position, radius)) {
      return { position: null, relocated: false, reason: lastError || 'Нет подтверждённого прохода под посетителем.' };
    }
    // A moved object may cover the visitor. Relocate only through the overlap
    // that already contains the body, keeping every CAD cell and all other
    // obstacles intact. Never teleport through a wall or across a floor void.
    const occupying = new Set([...nearby(position, position)].filter(p => bodyHitsProxy(position, position, radius, height, p)).map(p => p.id));
    const replacement = spawnCandidate({ ...position, maxDistance }, position, occupying);
    if (replacement) stats.relocations++;
    return { position: replacement, relocated: Boolean(replacement), reason: replacement
      ? 'Расстановка изменилась. Вы перемещены в ближайшее свободное место.'
      : 'Здесь больше нет свободного прохода. Выберите зону заново.' };
  }

  function move(position, dx, dz) {
    sync(); stats.movementChecks++;
    if (!Number.isFinite(dx) || !Number.isFinite(dz) || !pointFree(position)) {
      return { position: { ...position }, moved: false, blocked: true, invalidStart: !pointFree(position) };
    }
    let p = { ...position, level: levelOf(position) }, blocked = false;
    // Every attempted segment is continuous; substeps make sliding stable and
    // cannot tunnel through a thin wall even after a long/slow animation frame.
    const length = Math.hypot(dx, dz), steps = Math.max(1, Math.ceil(length / .12));
    // An accidental giant delta must not create an expensive unbounded loop.
    if (steps > 1000) return { position: p, moved: false, blocked: true, invalidDelta: true };
    const sx = dx / steps, sz = dz / steps;
    for (let i = 0; i < steps; i++) {
      const next = { ...p, x: p.x + sx, z: p.z + sz };
      if (segmentFree(p, next)) { p = next; continue; }
      blocked = true;
      // Move up to the obstruction before sliding, keeping a small gap.
      let lo = 0, hi = 1;
      for (let j = 0; j < 9; j++) {
        const t = (lo + hi) / 2, q = { ...p, x: p.x + sx * t, z: p.z + sz * t };
        if (segmentFree(p, q)) lo = t; else hi = t;
      }
      if (lo > .005) p = { ...p, x: p.x + sx * Math.max(0, lo - .002), z: p.z + sz * Math.max(0, lo - .002) };
      const remainder = Math.max(0, 1 - lo), axes = Math.abs(sx) >= Math.abs(sz) ? ['x', 'z'] : ['z', 'x'];
      for (const axis of axes) {
        const q = { ...p, [axis]: p[axis] + (axis === 'x' ? sx : sz) * remainder };
        if (segmentFree(p, q)) p = q;
      }
    }
    if (blocked) stats.blockedMoves++;
    return { position: p, moved: distance2(position, p) > 1e-12, blocked };
  }

  const vector = p => new THREE.Vector3(p.x, p.y, p.z);
  function ignoredObject(object, ignored) {
    for (let node = object; node; node = node.parent) if (ignored.has(node)) return true;
    return false;
  }
  function isLineClear(from, to, { ignoreIds = [], ignoreObjects = [], endpointInset = .04 } = {}) {
    sync();
    if (disposed || lastError || !finitePoint(from) || !finitePoint(to)) return false;
    const a = vector(from), b = vector(to), length = a.distanceTo(b);
    if (length < .08) return true;
    const ignoredIds = new Set(ignoreIds.map(String)), ignoredMeshes = new Set(ignoreObjects);
    for (const proxy of nearby(from, to, .015)) {
      // These are empty operational clearances, not opaque physical surfaces.
      // pointFree/segmentFree continue to block walking through the reserves.
      if(proxy.occludesSight===false||proxy.collisionKind==='interactive-safety-zone'||proxy.kind==='interactive-safety-zone'||proxy.kind==='reserved-lift-threshold')continue;
      const belongsToTarget = ignoredIds.has(proxy.id) || ignoredIds.has(String(proxy.instanceId))
        || [...ignoredIds].some(id => proxy.id.startsWith(id + '::'));
      // Ignoring an owning assembly is limited to the part at the endpoint:
      // other walls of that same hall still occlude the interaction.
      if (belongsToTarget && bodyHitsProxy(to, to, .15, .02, proxy)) continue;
      if (bodyHitsProxy(from, to, .008, .015, proxy)) return false;
    }
    const objects = new Set(source);
    for (const root of getCollisionMeshes() || []) {
      if (root?.isMesh) objects.add(root);
      else root?.traverse?.(object => { if (object.isMesh) objects.add(object); });
    }
    const all = [...objects].filter(mesh => !ignoredObject(mesh, ignoredMeshes));
    all.forEach(mesh => mesh.updateWorldMatrix(true, false));
    const direction = b.clone().sub(a).normalize();
    raycaster.near = .025; raycaster.far = Math.max(.025, length - Math.max(.025, endpointInset));
    raycaster.set(a, direction);
    if (raycaster.intersectObjects(all, false).length) return false;
    // CAD materials may be one-sided. Reverse casting also catches their
    // backs without mutating materials or observing render clipping/visibility.
    raycaster.set(b, direction.negate());
    return raycaster.intersectObjects(all, false).length === 0;
  }

  sync();
  return {
    radius, height, eyeHeight, sync, isFree, segmentAllowed, spawnNear, move, revalidate, isLineClear,
    floorY: level => floor(level)?.y ?? null,
    getState: () => ({ ready: !disposed && !lastError, revision, radius, height, eyeHeight,
      levels: [...floors.values()].map(f => ({ id: f.id, name: f.name, floorY: f.y })),
      obstacles: proxies.length, cadMeshes: source.length, error: lastError, ...stats }),
    dispose() { disposed = true; bins.clear(); proxies = []; },
  };
}
