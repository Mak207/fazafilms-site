import { pointSegmentDistance, segmentDistance, pointInPolygon } from './geometry.js';

const boundsCache = new WeakMap();
export function normalizeProxies(records) {
  if (!Array.isArray(records)) throw new Error('Obstacle update must be an array');
  const ids = new Set();
  return records.map(record => {
    const p = { ...record, id: String(record.id), kind: record.kind || 'exhibit', centerXZ: [...(record.centerXZ || [])] };
    if (!p.id || p.id === 'undefined' || ids.has(p.id)) throw new Error('Obstacle ids must be unique');
    ids.add(p.id);
    if (p.centerXZ.length !== 2 || !p.centerXZ.every(Number.isFinite) || !Number.isFinite(p.minY) || !Number.isFinite(p.maxY) || p.maxY <= p.minY) throw new Error(`Invalid obstacle bounds: ${p.id}`);
    if (p.shape === 'circle') {
      if (!(p.radius > 0) || !Number.isFinite(p.radius)) throw new Error(`Invalid obstacle radius: ${p.id}`);
    } else if (p.shape === 'obb') {
      p.halfSizeXZ = [...(p.halfSizeXZ || [])]; p.rotationY = p.rotationY ?? 0;
      if (p.halfSizeXZ.length !== 2 || !p.halfSizeXZ.every(v => Number.isFinite(v) && v > 0) || !Number.isFinite(p.rotationY)) throw new Error(`Invalid obstacle OBB: ${p.id}`);
    } else throw new Error(`Unsupported obstacle shape: ${p.shape}`);
    return p;
  });
}

export function proxyBounds(proxy) {
  let bounds = boundsCache.get(proxy); if (bounds) return bounds;
  const [x, z] = proxy.centerXZ, c = Math.abs(Math.cos(proxy.rotationY || 0)), s = Math.abs(Math.sin(proxy.rotationY || 0));
  const hx = proxy.shape === 'circle' ? proxy.radius : c * proxy.halfSizeXZ[0] + s * proxy.halfSizeXZ[1];
  const hz = proxy.shape === 'circle' ? proxy.radius : s * proxy.halfSizeXZ[0] + c * proxy.halfSizeXZ[1];
  bounds = [x - hx, x + hx, z - hz, z + hz]; boundsCache.set(proxy, bounds); return bounds;
}

// A swept vertical body cylinder against a fixed OBB/cylinder. This is a body
// envelope, not animated triangle/cloth collision. Vertical intervals are
// clipped before the horizontal swept-disc test (stairs and floating exhibits).
export function bodyHitsProxy(a, b, radius, height, proxy) {
  if (Math.min(a.y, b.y) >= proxy.maxY - .001 || Math.max(a.y, b.y) + height <= proxy.minY + .001) return false;
  const bounds = proxyBounds(proxy);
  if (Math.max(a.x, b.x) + radius <= bounds[0] || Math.min(a.x, b.x) - radius >= bounds[1]
    || Math.max(a.z, b.z) + radius <= bounds[2] || Math.min(a.z, b.z) - radius >= bounds[3]) return false;
  let lo = 0, hi = 1; const dy = b.y - a.y, bottom = proxy.minY - height + .001, top = proxy.maxY - .001;
  if (Math.abs(dy) < 1e-10) { if (a.y <= bottom || a.y >= top) return false; }
  else { let t0 = (bottom - a.y) / dy, t1 = (top - a.y) / dy; if (t0 > t1) [t0, t1] = [t1, t0]; lo = Math.max(0, t0); hi = Math.min(1, t1); if (lo > hi || hi < 0 || lo > 1) return false; }
  const p = { x: a.x + (b.x - a.x) * lo, z: a.z + (b.z - a.z) * lo };
  const q = { x: a.x + (b.x - a.x) * hi, z: a.z + (b.z - a.z) * hi }, [cx, cz] = proxy.centerXZ;
  if (proxy.shape === 'circle') return pointSegmentDistance({ x: cx, z: cz }, p, q) < proxy.radius + radius - 1e-6;
  const c = Math.cos(proxy.rotationY), s = Math.sin(proxy.rotationY), local = v => ({ x: c * (v.x - cx) - s * (v.z - cz), z: s * (v.x - cx) + c * (v.z - cz) });
  const u = local(p), v = local(q), [hx, hz] = proxy.halfSizeXZ;
  const box = [{ x: -hx, z: -hz }, { x: hx, z: -hz }, { x: hx, z: hz }, { x: -hx, z: hz }];
  return pointInPolygon(u, box) || pointInPolygon(v, box) || box.some((x, i) => segmentDistance(u, v, x, box[(i + 1) % 4]) < radius - 1e-6);
}

// Always starts from the immutable CAD mask. Moving/removing an exhibit thus
// reopens its former footprint instead of accumulating irreversible exclusions.
export function bakeProxyMask(grid, baseMask, proxies, bodyHeight) {
  const mask = new Uint8Array(baseMask), inset = grid.clearanceRadius + grid.cellSize / Math.SQRT2;
  for (const p of proxies) {
    if (p.minY >= grid.elevation + bodyHeight || p.maxY <= grid.elevation + .001) continue;
    const bounds = proxyBounds(p), s = grid.cellSize;
    const x0 = Math.max(0, Math.floor((bounds[0] - inset - grid.origin.x) / s));
    const x1 = Math.min(grid.width - 1, Math.floor((bounds[1] + inset - grid.origin.x) / s));
    const z0 = Math.max(0, Math.floor((bounds[2] - inset - grid.origin.z) / s));
    const z1 = Math.min(grid.height - 1, Math.floor((bounds[3] + inset - grid.origin.z) / s));
    const c = Math.cos(p.rotationY || 0), sn = Math.sin(p.rotationY || 0);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const index = z * grid.width + x; if (!mask[index]) continue;
      const dx = grid.origin.x + (x + .5) * s - p.centerXZ[0], dz = grid.origin.z + (z + .5) * s - p.centerXZ[1];
      const distance = p.shape === 'circle' ? Math.hypot(dx, dz) - p.radius
        : Math.hypot(Math.max(Math.abs(c * dx - sn * dz) - p.halfSizeXZ[0], 0), Math.max(Math.abs(sn * dx + c * dz) - p.halfSizeXZ[1], 0));
      if (distance < inset) mask[index] = 0;
    }
  }
  return mask;
}
