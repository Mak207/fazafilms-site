import { xyz, EPS, distanceXZ, MinHeap } from './geometry.js';

// rows[z] = [[firstX, runLength], ...] for walkable cells, never alternating RLE.
// The producer must conservatively erode CAD free space for the entire cell,
// including body clearance; this module does not silently erode it a second time.
export class RasterGrid {
  constructor(definition, elevation = 0) {
    this.origin = xyz(definition.originXZ); this.cellSize = definition.cellSize;
    this.width = definition.width; this.height = definition.height;
    this.clearanceRadius = definition.clearanceRadius; this.elevation = elevation;
    if (!(this.cellSize > 0) || !Number.isInteger(this.width) || !Number.isInteger(this.height) || !(this.clearanceRadius > 0)) throw new Error('Invalid navigation grid dimensions/clearanceRadius');
    this.mask = new Uint8Array(this.width * this.height);
    if (definition.mask) {
      if (definition.mask.length !== this.mask.length) throw new Error('Grid mask size mismatch');
      this.mask.set(definition.mask);
    } else {
      if (!definition.rows || definition.rows.length !== this.height) throw new Error('Grid rows must match height');
      definition.rows.forEach((runs, z) => runs.forEach(([first, count]) => {
        if (!Number.isInteger(first) || !Number.isInteger(count) || first < 0 || count < 0 || first + count > this.width) throw new Error('Invalid grid row run');
        this.mask.fill(1, z * this.width + first, z * this.width + first + count);
      }));
    }
    this.searchSequence = 0;
    this.seen = new Uint32Array(this.mask.length); this.targets = new Uint32Array(this.mask.length);
    this.costs = new Float64Array(this.mask.length); this.parents = new Int32Array(this.mask.length);
  }
  cell(p) { return { x: Math.floor((p.x - this.origin.x) / this.cellSize), z: Math.floor((p.z - this.origin.z) / this.cellSize) }; }
  contains(x, z) { return x >= 0 && z >= 0 && x < this.width && z < this.height && this.mask[z * this.width + x] !== 0; }
  centre(x, z) { return { x: this.origin.x + (x + .5) * this.cellSize, y: this.elevation, z: this.origin.z + (z + .5) * this.cellSize }; }
  pointAllowed(p, radius) { if (radius > this.clearanceRadius + EPS) return false; const c = this.cell(p); return this.contains(c.x, c.z); }
  computeComponents() {
    if (this.components) return;
    this.components = new Int32Array(this.mask.length); this.componentSizes = [0];
    const queue = new Int32Array(this.mask.length); let label = 0;
    for (let index = 0; index < this.mask.length; index++) {
      if (!this.mask[index] || this.components[index]) continue;
      label++; let head = 0, tail = 1; queue[0] = index; this.components[index] = label;
      while (head < tail) {
        const current = queue[head++], x = current % this.width, z = Math.floor(current / this.width);
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dz) || !this.contains(x + dx, z + dz)) continue;
          if (dx && dz && (!this.contains(x + dx, z) || !this.contains(x, z + dz))) continue;
          const next = (z + dz) * this.width + x + dx; if (this.components[next]) continue;
          this.components[next] = label; queue[tail++] = next;
        }
      }
      this.componentSizes[label] = tail;
    }
  }
  componentAt(p) { this.computeComponents(); const c = this.cell(p); return this.contains(c.x, c.z) ? this.components[c.z * this.width + c.x] : 0; }
  segmentAllowed(a, b, radius) {
    if (!this.pointAllowed(a, radius) || !this.pointAllowed(b, radius)) return false;
    let { x, z } = this.cell(a); const end = this.cell(b);
    const dx = b.x - a.x, dz = b.z - a.z, sx = Math.sign(dx), sz = Math.sign(dz), s = this.cellSize;
    const stepX = Math.abs(dx) > EPS ? s / Math.abs(dx) : Infinity, stepZ = Math.abs(dz) > EPS ? s / Math.abs(dz) : Infinity;
    let tx = sx ? (this.origin.x + (x + (sx > 0 ? 1 : 0)) * s - a.x) / dx : Infinity;
    let tz = sz ? (this.origin.z + (z + (sz > 0 ? 1 : 0)) * s - a.z) / dz : Infinity;
    for (let guard = 0; guard < this.width + this.height + 4; guard++) {
      if (!this.contains(x, z)) return false;
      if (x === end.x && z === end.z) return true;
      // A negative-direction ray ending exactly on a cell boundary must not
      // continue into the cell beyond its endpoint.
      if (Math.min(tx, tz) >= 1 - EPS) return this.contains(end.x, end.z);
      if (Math.abs(tx - tz) < EPS) {
        // Touching a blocked corner does not permit diagonal tunnelling.
        if (!this.contains(x + sx, z) || !this.contains(x, z + sz)) return false;
        x += sx; z += sz; tx += stepX; tz += stepZ;
      } else if (tx < tz) { x += sx; tx += stepX; }
      else { z += sz; tz += stepZ; }
    }
    return false;
  }
  findPath(from, to, { radius, segmentAllowed, pointAllowed, maskOnly = false }) {
    const allowed = segmentAllowed || ((a, b) => this.segmentAllowed(a, b, radius));
    const pointOK = pointAllowed || (p => this.pointAllowed(p, radius));
    if (!pointOK(from) || !pointOK(to)) return null;
    if (this.componentAt(from) !== this.componentAt(to)) return null;
    const localConnections = p => {
      const c = this.cell(p), found = [];
      for (let ring = 0; ring <= 3; ring++) {
        for (let dz = -ring; dz <= ring; dz++) for (let dx = -ring; dx <= ring; dx++) {
          if (ring && Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const x = c.x + dx, z = c.z + dz; if (!this.contains(x, z)) continue;
          const position = this.centre(x, z); if (!pointOK(position) || !allowed(p, position)) continue;
          found.push({ index: z * this.width + x, position, distance: distanceXZ(p, position) });
        }
        if (found.length) break;
      }
      return found.sort((a, b) => a.distance - b.distance).slice(0, 8);
    };
    const starts = localConnections(from), ends = localConnections(to); if (!starts.length || !ends.length) return null;
    if (++this.searchSequence >= 0xffffffff) { this.seen.fill(0); this.targets.fill(0); this.searchSequence = 1; }
    const stamp = this.searchSequence, heap = new MinHeap(), endCell = this.cell(to), s = this.cellSize;
    const heuristic = (x, z) => Math.hypot(this.origin.x + (x + .5) * s - to.x, this.origin.z + (z + .5) * s - to.z);
    for (const end of ends) this.targets[end.index] = stamp;
    for (const start of starts) {
      this.seen[start.index] = stamp; this.costs[start.index] = start.distance; this.parents[start.index] = -1;
      heap.push({ index: start.index, cost: start.distance }, start.distance + distanceXZ(start.position, to));
    }
    let found = -1, expansions = 0;
    while (heap.size) {
      const { index, cost } = heap.pop(); if (this.seen[index] !== stamp || cost > this.costs[index] + EPS) continue;
      if (this.targets[index] === stamp) { found = index; break; }
      expansions++; const x = index % this.width, z = Math.floor(index / this.width);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dz) || !this.contains(x + dx, z + dz)) continue;
        if (dx && dz && (!this.contains(x + dx, z) || !this.contains(x, z + dz))) continue;
        const nextIndex = (z + dz) * this.width + x + dx;
        const nextCost = cost + (dx && dz ? Math.SQRT2 : 1) * s;
        if (this.seen[nextIndex] === stamp && nextCost + EPS >= this.costs[nextIndex]) continue;
        if (!maskOnly && !allowed(this.centre(x, z), this.centre(x + dx, z + dz))) continue;
        this.seen[nextIndex] = stamp; this.costs[nextIndex] = nextCost; this.parents[nextIndex] = index;
        heap.push({ index: nextIndex, cost: nextCost }, nextCost + heuristic(x + dx, z + dz));
      }
    }
    this.lastSearch = { expansions, totalCells: this.mask.length, endpointScan: starts.length + ends.length };
    if (found < 0) return null;
    const chain = [to]; for (let index = found; index >= 0; index = this.parents[index]) chain.push(this.centre(index % this.width, Math.floor(index / this.width)));
    chain.push(from); chain.reverse();
    const result = [from]; let anchor = 0;
    for (let i = 2; i < chain.length; i++) if (!allowed(chain[anchor], chain[i])) { result.push(chain[i - 1]); anchor = i - 1; }
    result.push(to); return result;
  }
}
