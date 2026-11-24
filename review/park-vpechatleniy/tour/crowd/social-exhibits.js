export const SOCIAL_EXHIBIT_VERSION = '2026-11-24.social-poi.1';

const distanceXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const frozenPoint = point => Object.freeze({ x: point.x, y: point.y, z: point.z });
const bodyClearance = (point, proxy) => {
  const dx = point.x - proxy.centerXZ[0], dz = point.z - proxy.centerXZ[1];
  if (proxy.shape === 'circle') return Math.hypot(dx, dz) - proxy.radius;
  const c = Math.cos(proxy.rotationY || 0), s = Math.sin(proxy.rotationY || 0);
  return Math.hypot(Math.max(0, Math.abs(c * dx - s * dz) - proxy.halfSizeXZ[0]),
    Math.max(0, Math.abs(s * dx + c * dz) - proxy.halfSizeXZ[1]));
};

/**
 * Pure target generation from accepted scene obstacles and the current CAD mask.
 * No decorative marker is a destination: every stopping point has body clearance,
 * a real floor and a clear short approach to the visible side of its exhibit.
 */
export function buildSocialExhibits(simulation, {
  proxies = simulation.world.staticObstacleProxies,
  radius = Math.max(.51, simulation.defaultRadius || 0),
  height = Math.max(2.17, simulation.defaultHeight || 0),
  slotsPerFloor = 12,
} = {}) {
  const world = simulation.world, records = [], allocated = new Map();
  const minimumSpacing = Math.max(1.12, radius * 2 + .10);
  const visible = proxies.filter(proxy => proxy.kind === 'exhibit' && proxy.visible !== false && proxy.socialTarget !== false).slice().sort((a, b) => a.id.localeCompare(b.id));
  for (const proxy of visible) {
    const cx = proxy.centerXZ[0], cz = proxy.centerXZ[1], angle = proxy.rotationY || 0;
    const c = Math.cos(angle), s = Math.sin(angle);
    const hx = proxy.shape === 'circle' ? proxy.radius : proxy.halfSizeXZ[0];
    const hz = proxy.shape === 'circle' ? proxy.radius : proxy.halfSizeXZ[1];
    const localToWorld = (x, z, y) => ({ x: cx + c * x + s * z, y, z: cz - s * x + c * z });
    const slots = [];
    for (const floor of world.floors.values()) {
      const y = floor.elevation;
      // Do not attract people on a lower floor to a model above the ceiling, or
      // to an object whose top is already below this walking level.
      if (proxy.minY > y + 3.25 || proxy.maxY <= y + .15 || height > floor.bodyHeight + 1e-6) continue;
      const lookY = clamp(y + 1.5, proxy.minY + Math.min(.15, (proxy.maxY - proxy.minY) / 3), proxy.maxY - .05);
      const lookAt = frozenPoint({ x: cx, y: lookY, z: cz });
      const used = allocated.get(floor.id) || [];
      const snap = point => {
        if (!floor.grid) return point;
        const cell = floor.grid.cell(point);
        return floor.grid.centre(cell.x, cell.z);
      };
      let best = null;
      // Each candidate is a compact 3 x 4 group area: 1.5 m pitch and a diagonal
      // below 6 m. Several sides are tried; constrained floors can retain fewer
      // places for pairs/solos without opening CAD cells or shrinking bodies.
      const faces = [{ nx: 0, nz: 1, extent: hz, span: hx, id: 'front' },
        { nx: 1, nz: 0, extent: hx, span: hz, id: 'right' },
        { nx: 0, nz: -1, extent: hz, span: hx, id: 'back' },
        { nx: -1, nz: 0, extent: hx, span: hz, id: 'left' }];
      for (const face of faces) {
        const tx = -face.nz, tz = face.nx;
        const centers = face.span > 3 ? [0, -face.span * .65, face.span * .65] : [0];
        for (let centerIndex = 0; centerIndex < centers.length; centerIndex++) {
          const cluster = [], base = centers[centerIndex];
          for (let row = 0; row < 3; row++) for (let column = 0; column < 4; column++) {
            const outward = face.extent + 1.3 + row * 1.5, tangent = base + (column - 1.5) * 1.5;
            const point = snap(localToWorld(face.nx * outward + tx * tangent, face.nz * outward + tz * tangent, y));
            if (!world.pointAllowed(floor.id, point, radius) || bodyClearance(point, proxy) < radius + .35) continue;
            if (simulation.inTransitionCorridor(point, radius, height)) continue;
            if (used.some(other => distanceXZ(other, point) < minimumSpacing)
              || cluster.some(other => distanceXZ(other.position, point) < minimumSpacing)) continue;
            // A wall between the stopping point and the object's nearest side
            // must not turn a geometrically close target into an invisible one.
            const dx = point.x - cx, dz = point.z - cz;
            const lx = c * dx - s * dz, lz = s * dx + c * dz;
            let sx, sz;
            if (proxy.shape === 'circle') {
              const length = Math.hypot(lx, lz) || 1; sx = lx * proxy.radius / length; sz = lz * proxy.radius / length;
            } else { sx = clamp(lx, -hx, hx); sz = clamp(lz, -hz, hz); }
            const length = Math.hypot(lx - sx, lz - sz) || 1;
            const near = localToWorld(sx + (lx - sx) / length, sz + (lz - sz) / length, y);
            if (!world.segmentAllowed(floor.id, point, near, radius)) continue;
            cluster.push(Object.freeze({
              id: `${proxy.id}:${floor.id}:${face.id}:${centerIndex}:${row}:${column}`,
              floorId: floor.id, position: frozenPoint(point), lookAt,
              kind: row === 2 ? 'photo' : 'view',
            }));
          }
          if (!best || cluster.length > best.length) best = cluster;
        }
      }
      if (!best?.length) continue;
      const selected = best.slice(0, Math.max(1, slotsPerFloor));
      slots.push(...selected); used.push(...selected.map(slot => slot.position)); allocated.set(floor.id, used);
    }
    if (!slots.length) continue;
    const center = frozenPoint({ x: cx, y: (proxy.minY + proxy.maxY) / 2, z: cz });
    records.push(Object.freeze({
      id: proxy.id, instanceId: proxy.instanceId || proxy.id, objectId: proxy.objectId || proxy.id,
      name: proxy.name || proxy.exhibitName || proxy.objectId || proxy.id,
      visible: true, center, lookAt: center, slots: Object.freeze(slots),
    }));
  }
  return Object.freeze(records);
}

/** Sync accepted move/rotation/hide edits before the next simulation step. */
export function createSocialExhibitTargets({ simulation, onChange = () => {} }) {
  let sourceRevision = -1, records = Object.freeze([]), disposed = false, updates = 0;
  const state = () => ({
    version: SOCIAL_EXHIBIT_VERSION, sourceRevision, updates,
    visibleInstances: new Set(simulation.world.staticObstacleProxies.filter(proxy => proxy.kind === 'exhibit').map(proxy=>proxy.instanceId||proxy.id)).size,
    exhibits: records.length, slots: records.reduce((sum, record) => sum + record.slots.length, 0),
    unavailableInstances: [...new Set(simulation.world.staticObstacleProxies.filter(proxy => proxy.kind === 'exhibit' && !records.some(record => record.instanceId === (proxy.instanceId||proxy.id))).map(proxy => proxy.instanceId||proxy.id))],
    floors: Object.fromEntries([...simulation.world.floors.keys()].map(id => [id,
      records.reduce((sum, record) => sum + record.slots.filter(slot => slot.floorId === id).length, 0)])),
  });
  return {
    sync({ force = false } = {}) {
      if (disposed || !force && sourceRevision === simulation.world.revision) return false;
      const next = buildSocialExhibits(simulation);
      simulation.setSocialExhibits(next);
      records = next; sourceRevision = simulation.world.revision; updates++;
      onChange(state()); return true;
    },
    getState: state,
    snapshot: () => records,
    dispose() { disposed = true; records = Object.freeze([]); },
  };
}
