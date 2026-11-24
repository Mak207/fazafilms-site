// Metres, Y up. Rendering and skeleton ownership intentionally live elsewhere.
export const EPS = 1e-8;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const xyz = (p, y = 0) => Array.isArray(p)
  ? { x: +p[0], y: p.length > 2 ? +p[1] : y, z: +p[p.length > 2 ? 2 : 1] }
  : { x: +p.x, y: p.y === undefined ? y : +p.y, z: +p.z };
export const xz = p => { const v = xyz(p); return { x: v.x, z: v.z }; };
export const distanceXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const distance3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const lerp3 = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
export const cross2 = (a, b) => a.x * b.z - a.z * b.x;

export function closestOnSegment(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return { x: a.x + dx * t, z: a.z + dz * t, t };
}
export function pointSegmentDistance(p, a, b) { return distanceXZ(p, closestOnSegment(p, a, b)); }
export function polygonEdges(poly) { return poly.map((a, i) => [a, poly[(i + 1) % poly.length]]); }
export function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i];
    if (pointSegmentDistance(p, a, b) < EPS) return true;
    if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
export function intersectionParameters(a, b, c, d) {
  const r = { x: b.x - a.x, z: b.z - a.z }, s = { x: d.x - c.x, z: d.z - c.z };
  const ca = { x: c.x - a.x, z: c.z - a.z }, den = cross2(r, s);
  if (Math.abs(den) < EPS) {
    if (Math.abs(cross2(ca, r)) > EPS) return [];
    const rr = r.x * r.x + r.z * r.z;
    if (rr < EPS) return [];
    return [((c.x - a.x) * r.x + (c.z - a.z) * r.z) / rr,
      ((d.x - a.x) * r.x + (d.z - a.z) * r.z) / rr].filter(t => t >= -EPS && t <= 1 + EPS).map(t => clamp(t, 0, 1));
  }
  const t = cross2(ca, s) / den, u = cross2(ca, r) / den;
  return t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS ? [clamp(t, 0, 1)] : [];
}
export function segmentDistance(a, b, c, d) {
  if (intersectionParameters(a, b, c, d).length || intersectionParameters(c, d, a, b).length) return 0;
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}

// Remove internal edges of touching/overlapping walkable polygons. A shared navmesh
// edge is not a wall. Split intersections first, then classify both sides.
export function unionBoundary(polygons) {
  const edges = polygons.flatMap(polygonEdges), result = [];
  const inside = p => polygons.some(poly => pointInPolygon(p, poly));
  for (const [a, b] of edges) {
    const ts = [0, 1];
    for (const [c, d] of edges) ts.push(...intersectionParameters(a, b, c, d));
    ts.sort((u, v) => u - v);
    const length = distanceXZ(a, b);
    if (length < EPS) continue;
    const nx = -(b.z - a.z) / length, nz = (b.x - a.x) / length;
    const delta = Math.max(1e-6, length * 1e-7);
    for (let i = 1; i < ts.length; i++) {
      if (ts[i] - ts[i - 1] < EPS) continue;
      const t = (ts[i] + ts[i - 1]) / 2;
      const m = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
      if (inside({ x: m.x + nx * delta, z: m.z + nz * delta }) === inside({ x: m.x - nx * delta, z: m.z - nz * delta })) continue;
      result.push([
        { x: a.x + (b.x - a.x) * ts[i - 1], z: a.z + (b.z - a.z) * ts[i - 1] },
        { x: a.x + (b.x - a.x) * ts[i], z: a.z + (b.z - a.z) * ts[i] }
      ]);
    }
  }
  return result;
}

export function makePolyline(points) {
  const vertices = points.map(p => xyz(p));
  if (vertices.length < 2) throw new Error('A transition polyline needs at least two points');
  const cumulative = [0];
  for (let i = 1; i < vertices.length; i++) cumulative.push(cumulative.at(-1) + distance3(vertices[i - 1], vertices[i]));
  return { points: vertices, cumulative, length: cumulative.at(-1) };
}
export function samplePolyline(path, distance) {
  const s = clamp(distance, 0, path.length);
  let i = 1;
  while (i < path.cumulative.length - 1 && path.cumulative[i] < s) i++;
  const start = path.cumulative[i - 1], span = path.cumulative[i] - start;
  return lerp3(path.points[i - 1], path.points[i], span > EPS ? (s - start) / span : 0);
}
export function sweptAgentDistance(a0, a1, b0, b1) {
  const relativeStart = { x: a0.x - b0.x, z: a0.z - b0.z };
  const relativeEnd = { x: a1.x - b1.x, z: a1.z - b1.z };
  return pointSegmentDistance({ x: 0, z: 0 }, relativeStart, relativeEnd);
}

export class SpatialHash {
  constructor(cellSize = 1.2) { this.cellSize = cellSize; this.cells = new Map(); this.membership = new Map(); }
  clear() { this.cells.clear(); this.membership.clear(); }
  insert(value, p = value.position) {
    const key = `${Math.floor(p.x / this.cellSize)},${Math.floor(p.z / this.cellSize)}`;
    if (this.membership.get(value) === key) return;
    this.remove(value);
    if (!this.cells.has(key)) this.cells.set(key, new Set());
    this.cells.get(key).add(value); this.membership.set(value, key);
  }
  remove(value) {
    const key = this.membership.get(value); if (key === undefined) return false;
    const bucket = this.cells.get(key); bucket.delete(value); if (!bucket.size) this.cells.delete(key);
    this.membership.delete(value); return true;
  }
  query(p, radius) {
    const result = [], s = this.cellSize;
    for (let x = Math.floor((p.x - radius) / s); x <= Math.floor((p.x + radius) / s); x++) {
      for (let z = Math.floor((p.z - radius) / s); z <= Math.floor((p.z + radius) / s); z++) {
        const bucket = this.cells.get(`${x},${z}`); if (bucket) result.push(...bucket);
      }
    }
    return result;
  }
}

export function seededRandom(seed = 1) {
  let state = typeof seed === 'number' ? seed >>> 0 : [...String(seed)].reduce((s, c) => Math.imul(s ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
  return () => { state += 0x6d2b79f5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export class MinHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(value, score) {
    const item = { value, score }; let i = this.items.length; this.items.push(item);
    while (i > 0) { const p = (i - 1) >> 1; if (this.items[p].score <= score) break; this.items[i] = this.items[p]; i = p; }
    this.items[i] = item;
  }
  pop() {
    const first = this.items[0], last = this.items.pop(); if (!this.items.length) return first.value;
    let i = 0;
    while (i * 2 + 1 < this.items.length) {
      let c = i * 2 + 1;
      if (c + 1 < this.items.length && this.items[c + 1].score < this.items[c].score) c++;
      if (this.items[c].score >= last.score) break;
      this.items[i] = this.items[c]; i = c;
    }
    this.items[i] = last; return first.value;
  }
}
