import * as THREE from 'three';

const EPS = 1e-8;
const components = ['getX', 'getY', 'getZ', 'getW'];

function interpolate(a, b, t) {
  const attributes = {};
  for (const key of Object.keys(a.attributes)) {
    attributes[key] = a.attributes[key].map((v, i) => v + (b.attributes[key][i] - v) * t);
  }
  return { world: a.world.clone().lerp(b.world, t), attributes };
}

function clipPolygon(polygon, distance, keepInside) {
  if (!polygon.length) return [];
  const output = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const da = distance(a.world), db = distance(b.world);
    const aIn = keepInside ? da <= EPS : da > EPS;
    const bIn = keepInside ? db <= EPS : db > EPS;
    if (aIn) output.push(a);
    if (aIn !== bIn) output.push(interpolate(a, b, da / (da - db)));
  }
  return output.filter((v, i) => !i || v.world.distanceToSquared(output[i - 1].world) > EPS * EPS);
}

function area(a, b, c) {
  return new THREE.Vector3().subVectors(b.world, a.world)
    .cross(new THREE.Vector3().subVectors(c.world, a.world)).length() / 2;
}

function triangulate(polygon) {
  const result = [];
  for (let i = 1; i + 1 < polygon.length; i++) {
    const triangle = [polygon[0], polygon[i], polygon[i + 1]];
    if (area(...triangle) > 1e-12) result.push(triangle);
  }
  return result;
}

/** Subtract only the local opening, retaining the long triangle on both sides. */
export function subtractTriangleBox(triangle, box) {
  const planes = [
    p => box.min[0] - p.x, p => p.x - box.max[0],
    p => box.min[1] - p.y, p => p.y - box.max[1],
    p => box.min[2] - p.z, p => p.z - box.max[2],
  ];
  let inside = triangle;
  const retained = [];
  for (const plane of planes) {
    retained.push(...triangulate(clipPolygon(inside, plane, false)));
    inside = clipPolygon(inside, plane, true);
    if (inside.length < 3) break;
  }
  return { retained, removedArea: triangulate(inside).reduce((sum, t) => sum + area(...t), 0) };
}

/** Runtime geometry only. The source CAD/GLB and every unrelated mesh stay intact. */
export function applyWorkingOpenings(sourceMeshes, openings) {
  const results = [];
  for (const opening of openings) {
    const record = { id: opening.id, label: opening.label || opening.id, provisional: true,
      box: { min: opening.min, max: opening.max }, affectedMeshes: [], affectedTriangles: 0, removedArea: 0 };
    for (const mesh of sourceMeshes.filter(node => node.isMesh && node.name === (opening.mesh || opening.meshName))) {
      mesh.updateWorldMatrix(true, false);
      const source = mesh.geometry, position = source.attributes.position;
      if (!position || mesh.isSkinnedMesh || Object.keys(source.morphAttributes).length) continue;
      const keys = Object.keys(source.attributes);
      if (keys.some(key => source.attributes[key].itemSize > 4)) throw new Error('Unsupported CAD attribute size.');
      const resultAttributes = Object.fromEntries(keys.map(key => [key, []]));
      const count = source.index?.count || position.count;
      const groups = [];
      let changed = 0, removedArea = 0, written = 0;
      const readVertex = index => {
        const attributes = {};
        for (const key of keys) {
          const a = source.attributes[key];
          attributes[key] = Array.from({ length: a.itemSize }, (_, j) => a[components[j]](index));
        }
        return { attributes, world: new THREE.Vector3(...attributes.position).applyMatrix4(mesh.matrixWorld) };
      };
      const append = (triangle, materialIndex) => {
        if (!groups.length || groups.at(-1).materialIndex !== materialIndex) groups.push({ start: written, count: 0, materialIndex });
        for (const vertex of triangle) for (const key of keys) resultAttributes[key].push(...vertex.attributes[key]);
        groups.at(-1).count += 3; written += 3;
      };
      for (let offset = 0; offset < count; offset += 3) {
        const triangle = [0, 1, 2].map(i => readVertex(source.index ? source.index.getX(offset + i) : offset + i));
        const materialIndex = source.groups.find(group => offset >= group.start && offset < group.start + group.count)?.materialIndex || 0;
        const intersects = [0, 1, 2].every((axis) => {
          const key = ['x', 'y', 'z'][axis], values = triangle.map(v => v.world[key]);
          return Math.max(...values) >= opening.min[axis] - EPS && Math.min(...values) <= opening.max[axis] + EPS;
        });
        if (!intersects) { append(triangle, materialIndex); continue; }
        const result = subtractTriangleBox(triangle, opening);
        if (result.removedArea <= 1e-10) { append(triangle, materialIndex); continue; }
        changed++; removedArea += result.removedArea;
        result.retained.forEach(t => append(t, materialIndex));
      }
      if (!changed) continue;
      const geometry = new THREE.BufferGeometry();
      for (const key of keys) geometry.setAttribute(key, new THREE.Float32BufferAttribute(resultAttributes[key], source.attributes[key].itemSize));
      geometry.normalizeNormals();
      for (const group of groups) geometry.addGroup(group.start, group.count, group.materialIndex);
      geometry.name = source.name;
      geometry.userData = { ...source.userData, workingOpenings: [...(source.userData.workingOpenings || []), opening.id] };
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      mesh.geometry = geometry;
      record.affectedMeshes.push({ name: mesh.name, originalTriangles: count / 3, retainedTriangles: written / 3, changedTriangles: changed });
      record.affectedTriangles += changed; record.removedArea += removedArea;
    }
    record.removedArea = Number(record.removedArea.toFixed(8));
    results.push(record);
  }
  return results;
}
