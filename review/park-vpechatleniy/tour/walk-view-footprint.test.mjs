import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const threeUrl = new URL('../../../golden-ring/interactives/vendor/three-0.180/three.module.min.js', import.meta.url).href;
registerHooks({ resolve(specifier, context, nextResolve) { return specifier === 'three' ? { url: threeUrl, shortCircuit: true } : nextResolve(specifier, context); } });
const THREE = await import('three');
const { MeshBVH } = await import('./vendor/three-mesh-bvh/index.module.js');
const { createWalkViewFootprint, createWalkViewTelemetry, horizontalCameraFov } = await import('./walk-view-footprint.js');
const camera = (aspect = 1) => { const value = new THREE.PerspectiveCamera(68, aspect, .04, 1000); value.position.set(0, 1.65, 0); value.lookAt(0, 1.65, -10); value.updateMatrixWorld(true); return value; };
const scope = { floorId: 'main', zoneId: 'rgo-main' };
const middle = view => view.visiblePolygonXZ[16];

test('actual camera aspect and optical zoom determine horizontal FOV without moving the viewpoint', () => {
  const cam = camera(2), footprint = createWalkViewFootprint();
  try {
    const before = [...cam.position.toArray(), ...cam.quaternion.toArray()];
    const wide = footprint.sample(cam, scope); assert.ok(Math.abs(wide.horizontalFovRad - 2 * Math.atan(Math.tan(68 * Math.PI / 360) * 2)) < 1e-12);
    assert.ok(Math.abs(wide.directionXZ[0]) < 1e-12); assert.equal(wide.directionXZ[1], -1); assert.deepEqual([wide.x, wide.y, wide.z], [0, 1.65, 0]);
    assert.equal(wide.visiblePolygonXZ.length, 32); assert.equal(wide.maxDistanceM, 24);
    cam.aspect = .8; cam.updateProjectionMatrix(); const narrow = footprint.sample(cam, scope); assert.ok(narrow.horizontalFovRad < wide.horizontalFovRad);
    cam.zoom = 2; cam.updateProjectionMatrix(); assert.ok(horizontalCameraFov(cam) < narrow.horizontalFovRad);
    assert.deepEqual([...cam.position.toArray(), ...cam.quaternion.toArray()], before);
  } finally { footprint.dispose(); }
});

test('known CAD wall clips all fan rays from either material side using the existing BVH', () => {
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 5), new THREE.MeshBasicMaterial({ side: THREE.FrontSide }));
  wall.position.set(0, 1.65, -5); wall.rotation.y = Math.PI; wall.geometry.boundsTree = new MeshBVH(wall.geometry);
  const footprint = createWalkViewFootprint({ getStaticMeshes: () => [wall] });
  try {
    const view = footprint.sample(camera(2), scope);
    assert.ok(view.visiblePolygonXZ.slice(1).every(point => point[1] > -5 && point[1] < -4.9));
    assert.ok(Math.abs(middle(view)[1] + 4.965) < 1e-8);
    assert.equal(wall.material.side, THREE.FrontSide); assert.equal(footprint.getStats().conservativeBounds, 0); assert.equal(footprint.getStats().meshQueries, 31);
    wall.rotation.y = 0; assert.ok(Math.abs(middle(footprint.sample(camera(), scope))[1] + 4.965) < 1e-8);
  } finally { footprint.dispose(); wall.geometry.dispose(); wall.material.dispose(); }
});

test('moving or removing an actual screen changes occlusion at the next sample', () => {
  const root = new THREE.Group(), screen = new THREE.Mesh(new THREE.BoxGeometry(2, 3, .3), new THREE.MeshBasicMaterial()); root.add(screen); root.position.set(0, 1.5, -4);
  const footprint = createWalkViewFootprint({ getDynamicRoots: () => [root] });
  try {
    const blocked = footprint.sample(camera(), scope); assert.ok(middle(blocked)[1] > -4);
    root.position.x = 10; const moved = footprint.sample(camera(), scope); assert.equal(middle(moved)[1], -24);
    root.position.x = 0; root.visible = false; assert.equal(middle(footprint.sample(camera(), scope))[1], -24);
    root.visible = true; screen.userData.equipmentPreview = true; assert.equal(middle(footprint.sample(camera(), scope))[1], -24);
  } finally { footprint.dispose(); screen.geometry.dispose(); screen.material.dispose(); }
});

test('a compound CAD bound surrounding the visitor cannot hide its nearby interior wall', () => {
  const shell = new THREE.BoxGeometry(80, 8, 80).toNonIndexed(); shell.translate(0, 1.65, 0);
  const wall = new THREE.PlaneGeometry(80, 8).toNonIndexed(); wall.translate(0, 1.65, -5);
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(shell.attributes.position.array.length + wall.attributes.position.array.length);
  positions.set(shell.attributes.position.array); positions.set(wall.attributes.position.array, shell.attributes.position.array.length);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.boundsTree = new MeshBVH(geometry);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()), footprint = createWalkViewFootprint({ getStaticMeshes: () => [mesh] });
  try {
    const cam = camera(); assert.ok(geometry.boundingBox.containsPoint(cam.position));
    const view = footprint.sample(cam, scope);
    assert.ok(view.visiblePolygonXZ.slice(1).every(point => point[1] > -5 && point[1] < -4.9));
    assert.ok(Math.abs(middle(view)[1] + 4.965) < 1e-8);
    assert.equal(footprint.getStats().meshQueries, 31);
  } finally { footprint.dispose(); shell.dispose(); wall.dispose(); geometry.dispose(); mesh.material.dispose(); }
});

test('eye-height obstacle bounds clip conservatively while safety clearances and other floors do not', () => {
  let rows = [{ shape: 'obb', centerXZ: [0, -3], halfSizeXZ: [3, .1], rotationY: 0, minY: 0, maxY: 3 }];
  const footprint = createWalkViewFootprint({ getObstacles: () => rows });
  try {
    assert.ok(middle(footprint.sample(camera(), scope))[1] > -3);
    rows[0].occludesSight = false; assert.equal(middle(footprint.sample(camera(), scope))[1], -24);
    delete rows[0].occludesSight; rows[0].maxY = 1; assert.equal(middle(footprint.sample(camera(), scope))[1], -24);
    rows = [{ shape: 'circle', centerXZ: [0, -4], radius: 1, minY: 0, maxY: 3 }]; assert.ok(Math.abs(middle(footprint.sample(camera(), scope))[1] + 2.965) < 1e-8);
    rows[0].minY = 13.2; rows[0].maxY = 16; assert.equal(middle(footprint.sample(camera(), scope))[1], -24);
  } finally { footprint.dispose(); }
});

test('heavy unindexed geometry uses a bounded conservative intersection instead of a triangle scan', () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(8, 4, .2, 30, 30, 30), new THREE.MeshBasicMaterial()); mesh.position.set(0, 1.5, -6);
  const footprint = createWalkViewFootprint({ getStaticMeshes: () => [mesh] });
  try {
    assert.ok(middle(footprint.sample(camera(), scope))[1] > -6);
    assert.equal(footprint.getStats().conservativeBounds, 1); assert.equal(footprint.getStats().meshQueries, 0);
  } finally { footprint.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); }
});

test('telemetry is capped at 10 Hz, gates hidden and mismatched scopes and refreshes resized views', () => {
  const cam = camera(2), bridge = { enabled: true, visible: true, split: true, zoneSequence: 1, appliedZoneSequence: 1 }, walk = { active: true, paused: false, position: { level: 'main' }, zoneId: 'rgo-main' }, sent = [];
  const footprint = createWalkViewFootprint(), telemetry = createWalkViewTelemetry({ getCamera: () => cam, getWalkState: () => walk, getBridgeState: () => bridge, footprint, sendView: view => { sent.push(view); return true; } });
  try {
    assert.equal(telemetry.update(0), true); cam.aspect = .8; cam.updateProjectionMatrix(); telemetry.request();
    for (let time = 1; time < 100; time++) { telemetry.request(); assert.equal(telemetry.update(time), false); }
    assert.equal(telemetry.update(100), true); assert.ok(sent[1].horizontalFovRad < sent[0].horizontalFovRad);
    assert.equal(telemetry.update(200), false); bridge.visible = false; telemetry.request(); assert.equal(telemetry.update(1000), false);
    bridge.visible = true; bridge.zoneSequence = 2; assert.equal(telemetry.update(1100), false);
    bridge.appliedZoneSequence = 2; assert.equal(telemetry.update(1200), true); assert.equal(telemetry.getStats().samples, 4); assert.equal(sent.length, 3);
    walk.active = false; assert.equal(telemetry.update(1300), false);
  } finally { footprint.dispose(); }
});
