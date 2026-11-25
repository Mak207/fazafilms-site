import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createEquipmentPreviewHooks } from './equipment-preview-hooks.js';
import { createInstallationsWalkBridge, INSTALLATIONS_WALK_PROTOCOL } from './installations-walk-bridge.js';
import { createDefaultState, getInstances } from '../installations/equipment-model.js';
import { createEquipmentChannel, equipmentVariant } from '../installations/equipment-state.js';
const threeUrl = new URL('../../../golden-ring/interactives/vendor/three-0.180/three.module.min.js', import.meta.url).href;
registerHooks({ resolve(specifier, context, nextResolve) { return specifier === 'three' ? { url: threeUrl, shortCircuit: true } : nextResolve(specifier, context); } });
const THREE = await import('three');
const { createExhibitSystem } = await import('./exhibits.js');
const { createDynamicObstacleAdapter } = await import('./crowd/dynamic-obstacles.js');
const { createEquipmentPlanScene } = await import('./equipment-plan-scene.js');

function simpleRoot() { const root = new THREE.Group(); root.add(new THREE.Mesh(new THREE.BoxGeometry(2, 1, .3), new THREE.MeshBasicMaterial())); return root; }
async function fixture() {
  const scene = new THREE.Scene(), floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  floor.name = 'A-FLOR-test'; floor.rotation.x = -Math.PI / 2; floor.position.y = 7.2; scene.add(floor); scene.updateMatrixWorld(true);
  const oldFetch = globalThis.fetch; globalThis.fetch = async () => ({ ok: true, json: async () => ({ version: 1, objects: [{ id: 'O01', name: 'Макет', url: 'fixture.glb', scaleTo: { axis: 'x', meters: 2 }, instances: [{ id: 'O01-1', x: -20, z: -20, floorY: 7.2 }] }] }) });
  let exhibits;
  try { exhibits = await createExhibitSystem({ scene, sourceMeshes: [floor], manifestUrl: 'https://test.invalid/manifest.json', loader: { load(_url, done) { done({ scene: simpleRoot() }); } } }); }
  finally { globalThis.fetch = oldFetch; }
  const root = simpleRoot(), original = exhibits.addAssembly({ id: 'SCREEN', name: 'Экран', root, placement: { id: 'SCREEN-1', x: 1, z: 2, floorY: 7.2 }, collisionParts: [{ id: 'screen', min: [-1, 0, -.15], max: [1, 1, .15] }] });
  const data = { catalog: [{ id: 'lcd-screen', category: 'screen', screenUnits: 1, name: 'Экран' }], regions: [{ id: 'rgo' }], halls: [], cabinetProfile: {}, content: [], groups: [{ id: 'screens', name: 'Экран', typeId: 'lcd-screen', regionId: 'rgo', floorId: 'main', defaultQuantity: 1, maxQuantity: 3, dimensions: { widthM: 2, heightM: 1, depthM: .3 }, mountingBottomM: 0, seedInstances: [{ sourceId: 'source', x: 1, z: 2, y: 7.2, yaw: 0, floorId: 'main' }], contentIds: [] }] };
  const state = createDefaultState(data), adapter = createEquipmentPlanScene({ exhibits, bindings: new Map([['source', { root, instanceId: original.instanceId, pickTargets: [root] }]]) });
  const snapshot = position => ({ data, state, report: { placed: getInstances(data, state).map(item => ({ ...item, position: position || item.position })), unplaced: [] } });
  assert.equal(adapter.sync(snapshot()).ok, true);
  const obstacles = createDynamicObstacleAdapter({ exhibits }), walking = { active: true, paused: false, zoneId: 'rgo-main' };
  const win = new EventTarget(), parent = { postMessage() {} }; win.parent = parent; win.location = new URL('https://fazafilms.ru/review/park-vpechatleniy/tour/?embedded=installations');
  win.document = new EventTarget(); win.document.querySelectorAll = () => []; win.CustomEvent = class extends Event { constructor(type, options) { super(type); this.detail = options.detail; } };
  let bridge;
  const hooks = createEquipmentPreviewHooks({ embedded: true, getWalkState: () => walking, getEmbeddedState: () => bridge.getState(), getScene: () => ({ previewEquipment: adapter.preview, cancelEquipmentPreview: adapter.cancelPreview }) });
  bridge = createInstallationsWalkBridge({ windowObject: win, onPreviewReset: () => hooks.cancel() });
  bridge.attach({ getState: () => walking, getZones: () => [{ id: 'rgo-main', name: 'Аллея РГО', regionId: 'rgo', level: 'main' }], setPaused: value => { walking.paused = value; }, start: id => { walking.active = true; walking.zoneId = id; return { ok: true }; } });
  const storage = { getItem: () => null, setItem() {} };
  const channel = createEquipmentChannel({ data, variant: equipmentVariant(data, state), windowObject: win, storage, onPreview: hooks.onPreview, onPreviewEnd: hooks.onPreviewEnd });
  function layout(kind, sequence, extra = {}) { const event = new Event('message'); Object.assign(event, { origin: win.location.origin, source: parent, data: { protocol: INSTALLATIONS_WALK_PROTOCOL, kind, sequence, ...extra } }); win.dispatchEvent(event); }
  function wire(kind, sequence, extra = {}) { win.dispatchEvent(new win.CustomEvent('faza.park.equipment-plan.live.v1', { detail: { protocol: 'faza.park.equipment-message.v1', sender: 'plan', kind, sequence, id: 'screens::1', ...extra } })); }
  return { root, exhibits, scene, adapter, obstacles, walking, hooks, bridge, layout, wire, snapshot, win,
    close() { channel.dispose(); bridge.dispose(); adapter.dispose(); } };
}
const position = { x: 7, z: 4, y: 7.2, yaw: Math.PI / 2, floorId: 'main' };

test('split walk preview is a translucent isolated mesh; physical placement changes only on commit', async () => {
  const f = await fixture(); try {
    f.layout('visibility', 1, { visible: true }); f.wire('preview', 1, { position }); assert.equal(f.adapter.getState().previewCount, 0);
    f.layout('layout', 1, { split: true }); const before = JSON.stringify(f.obstacles.snapshot());
    f.wire('preview', 2, { position }); assert.equal(f.adapter.getState().previewCount, 1);
    const ghost = f.scene.children.find(item => item.userData.equipmentPreview); assert.ok(ghost); assert.equal(ghost.position.x, 7); assert.equal(ghost.rotation.y, Math.PI / 2);
    ghost.traverse(item => { if (item.isMesh) { assert.equal(item.material.transparent, true); assert.equal(item.material.opacity, .42); } });
    assert.equal(f.root.position.x, 1); assert.equal(f.root.rotation.y, 0); assert.equal(f.exhibits.roots.includes(ghost), false); assert.equal(JSON.stringify(f.obstacles.snapshot()), before);
    f.wire('preview-end', 3); assert.equal(f.adapter.getState().previewCount, 0); assert.equal(f.root.position.x, 1);
    assert.equal(f.adapter.sync(f.snapshot(position)).ok, true); assert.equal(f.root.position.x, 7); assert.equal(f.root.rotation.y, Math.PI / 2);
  } finally { f.close(); }
});

test('close split and hide clear ghosts; delayed transport previews cannot revive ended gestures', async () => {
  const f = await fixture(); try {
    f.layout('visibility', 1, { visible: true }); f.layout('layout', 1, { split: true }); f.wire('preview', 10, { position }); assert.equal(f.adapter.getState().previewCount, 1);
    f.wire('preview-end', 12); f.layout('layout', 2, { split: false });
    f.wire('preview', 11, { position }); assert.equal(f.adapter.getState().previewCount, 0);
    f.layout('layout', 3, { split: true }); f.wire('preview', 9, { position }); assert.equal(f.adapter.getState().previewCount, 0);
    f.wire('preview', 13, { position }); assert.equal(f.adapter.getState().previewCount, 1);
    f.layout('visibility', 2, { visible: false }); assert.equal(f.adapter.getState().previewCount, 0);
    f.wire('preview', 14, { position }); assert.equal(f.adapter.getState().previewCount, 0);
    f.layout('visibility', 3, { visible: true }); assert.equal(f.adapter.getState().previewCount, 0);
  } finally { f.close(); }
});

test('zone changes and walking exit cancel ghosts without a physical placement', async () => {
  const f = await fixture(); try {
    f.layout('visibility', 1, { visible: true }); f.layout('layout', 1, { split: true }); f.wire('preview', 1, { position });
    f.layout('zone', 1, { scope: { regionId: 'rgo', floorId: 'main' } }); assert.equal(f.adapter.getState().previewCount, 0);
    f.wire('preview', 2, { position }); assert.equal(f.adapter.getState().previewCount, 1);
    f.walking.active = false; const event = new Event('park-walk-change'); event.detail = { active: false }; f.win.document.dispatchEvent(event);
    assert.equal(f.adapter.getState().previewCount, 0); f.wire('preview', 3, { position }); assert.equal(f.adapter.getState().previewCount, 0); assert.equal(f.root.position.x, 1);
  } finally { f.close(); }
});

test('standalone walking still suppresses preview; ordinary 3D editing remains available', () => {
  const walking = { active: true }; let previews = 0, cancels = 0;
  const hooks = createEquipmentPreviewHooks({ getWalkState: () => walking, getScene: () => ({ previewEquipment() { previews++; return { ok: true }; }, cancelEquipmentPreview() { cancels++; } }) });
  assert.equal(hooks.onPreview('id', position).preview, false); assert.equal(previews, 0);
  walking.active = false; assert.equal(hooks.onPreview('id', position).ok, true); assert.equal(previews, 1); assert.ok(cancels > 0);
});
