import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
const threeUrl = new URL('../../../golden-ring/interactives/vendor/three-0.180/three.module.min.js', import.meta.url).href;
registerHooks({ resolve(specifier, context, nextResolve) { return specifier === 'three' ? { url: threeUrl, shortCircuit: true } : nextResolve(specifier, context); } });
const THREE = await import('three');
const { GLTFLoader } = await import('../../../golden-ring/interactives/vendor/three-0.180/GLTFLoader.js');
const { MeshoptDecoder } = await import('../../../golden-ring/tour/vendor/meshopt_decoder.mjs');
const { MeshBVH, CENTER } = await import('./vendor/three-mesh-bvh/index.module.js');
const { createWalkWorld } = await import('./walk-world.js');
const { createWalkViewFootprint } = await import('./walk-view-footprint.js');
const json = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));

test('real published CAD and measured starts yield nonempty footprints within a bounded CPU packet time', async t => {
  const [raw, worldData, zones, colors, evidence] = await Promise.all([
    readFile(new URL('./assets/park.glb', import.meta.url)), json('./crowd/data/park-world.json'), json('./assets/zones/source-zones.json'), json('./assets/zones/floor-colors.json'), json('./assets/zones/physical-revisions-runtime-obstacles.json'),
  ]);
  const sha256 = createHash('sha256').update(raw).digest('hex'); assert.equal(sha256, worldData.source.sha256);
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const model = (await loader.parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), '')).scene;
  model.updateMatrixWorld(true); const meshes = [], indexed = new Set(); let triangles = 0;
  model.traverse(mesh => {
    if (!mesh.isMesh || mesh.isInstancedMesh) return;
    meshes.push(mesh); const geometry = mesh.geometry, count = (geometry.index?.count || geometry.attributes.position.count) / 3; triangles += count;
    if (count >= 1000 && !geometry.boundsTree) { geometry.boundsTree = new MeshBVH(geometry, { strategy: CENTER, indirect: true }); indexed.add(geometry); }
  });
  const recordedObstacles = evidence.obstacles.map(item => ({ id: item.id, shape: 'obb', centerXZ: [item.center[0], item.center[2]], halfSizeXZ: [item.size[0] / 2, item.size[2] / 2], rotationY: item.yaw || 0, minY: item.center[1] - item.size[1] / 2, maxY: item.center[1] + item.size[1] / 2 }));
  const world = createWalkWorld({ worldData, getDynamicObstacles: () => recordedObstacles });
  const footprint = createWalkViewFootprint({ getStaticMeshes: () => meshes, getObstacles: () => recordedObstacles });
  const camera = new THREE.PerspectiveCamera(68, 1.7, .04, 1000), durations = [], results = [];
  try {
    const selected = zones.zones.filter(zone => ['rgo-main', 'central-square-main', 'central-upper'].includes(zone.id)).map(zone => ({ id: zone.id, level: zone.floorId, x: zone.labelXZ[0], z: zone.labelXZ[1], polygons: zone.polygons }));
    const hall = colors.rgo.halls.find(item => item.id === '05'); selected.push({ id: 'rgo-05', level: 'main', x: hall.sourceLabelWorldXZ[0], z: hall.sourceLabelWorldXZ[1], polygons: hall.polygonsWorldXZ });
    for (const zone of selected) {
      const point = world.spawnNear({ ...zone, maxDistance: 24 }); assert.ok(point, zone.id);
      camera.position.set(point.x, point.y + 1.65, point.z);
      let maxDistance = 0, maxArea = 0, boundsCount = 0;
      for (const aspect of [.8, 1.7]) for (let turn = 0; turn < 4; turn++) {
        camera.aspect = aspect; camera.updateProjectionMatrix(); const angle = turn * Math.PI / 2;
        camera.lookAt(point.x + Math.sin(angle), point.y + 1.65, point.z - Math.cos(angle)); camera.updateMatrixWorld(true);
        footprint.sample(camera, { floorId: zone.level, zoneId: zone.id });
        const start = performance.now(), view = footprint.sample(camera, { floorId: zone.level, zoneId: zone.id }); durations.push(performance.now() - start);
        assert.ok(view); assert.equal(view.visiblePolygonXZ.length, 32); assert.ok(view.visiblePolygonXZ.every(p => p.every(Number.isFinite)));
        maxDistance = Math.max(maxDistance, ...view.visiblePolygonXZ.map(p => Math.hypot(p[0] - point.x, p[1] - point.z)));
        const polygon = view.visiblePolygonXZ; let area = 0; for (let i = 0; i < polygon.length; i++) { const a = polygon[i], b = polygon[(i + 1) % polygon.length]; area += a[0] * b[1] - b[0] * a[1]; }
        maxArea = Math.max(maxArea, Math.abs(area) / 2); boundsCount = Math.max(boundsCount, footprint.getStats().conservativeBounds);
      }
      assert.equal(boundsCount, 0, 'Prepared CAD geometry must use its existing BVH: ' + zone.id);
      assert.ok(maxDistance > .5 && maxArea > .05, 'A coarse CAD bound must not erase the visible footprint: ' + zone.id);
      results.push({ zoneId: zone.id, point, maxDistanceM: maxDistance, maxAreaM2: maxArea, conservativeBounds: boundsCount });
    }
    const sorted = [...durations].sort((a, b) => a - b), p95 = sorted[Math.ceil(sorted.length * .95) - 1], maximum = sorted.at(-1);
    assert.ok(p95 < 100, 'Footprint p95 must stay below its 100 ms sampling interval; measured ' + p95);
    const report = { success: true, modelSha256: sha256, meshCount: meshes.length, triangles, indexedGeometries: indexed.size, recordedObstacleParts: recordedObstacles.length,
      samples: durations.length, packetMs: { min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], p95, max: maximum }, results,
      qualification: 'Actual published CAD and recorded obstacle parts; CPU footprint only, no GPU or full live-scene visual acceptance. Dynamic mesh movement is covered by the companion fixture test.' };
    if (process.env.PARK_VIEW_BENCHMARK_PATH) { await mkdir(dirname(process.env.PARK_VIEW_BENCHMARK_PATH), { recursive: true }); await writeFile(process.env.PARK_VIEW_BENCHMARK_PATH, JSON.stringify(report, null, 2) + '\n'); }
    t.diagnostic(JSON.stringify(report));
  } finally { footprint.dispose(); world.dispose(); for (const mesh of meshes) mesh.geometry.dispose(); }
});
