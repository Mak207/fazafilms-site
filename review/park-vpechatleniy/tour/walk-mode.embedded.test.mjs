import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

const threeUrl = new URL('../../../golden-ring/interactives/vendor/three-0.180/three.module.min.js', import.meta.url).href;
registerHooks({ resolve(specifier, context, nextResolve) { return specifier === 'three' ? { url: threeUrl, shortCircuit: true } : nextResolve(specifier, context); } });
const THREE = await import('three');
const { createWalkMode } = await import('./walk-mode.js');
const domModule = process.env.PARK_HAPPY_DOM_MODULE;
const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');

async function fixture() {
  const { Window } = await import(domModule ? pathToFileURL(domModule).href : 'happy-dom');
  const win = new Window({ url: 'https://fazafilms.ru/review/park-vpechatleniy/tour/?embedded=installations' });
  const previous = {};
  for (const key of ['window', 'document', 'location', 'history', 'CustomEvent', 'AbortController']) {
    previous[key] = globalThis[key]; globalThis[key] = key === 'window' ? win : win[key];
  }
  win.document.body.innerHTML = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const canvas = document.getElementById('canvas');
  const stats = { focus: 0, activations: 0, pauses: 0 };
  canvas.focus = () => { stats.focus++; };
  canvas.setPointerCapture = () => {};
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
  document.getElementById('walk-media-canvas').getContext = () => ({ drawImage() {} });
  const camera = new THREE.PerspectiveCamera(68, 4 / 3, .04, 1000);
  const grid = { originXZ: [-10, -10], cellSize: .25, width: 80, height: 80, clearanceRadius: .51, bodyHeight: 2.17, rows: Array.from({ length: 80 }, () => [[0, 80]]) };
  const worldData = { floors: [{ id: 'main', elevation: 7.2, baseGrid: grid }], reservedLiftThresholds: [] };
  const sourceZones = { zones: [{ id: 'rgo-main', title: 'Аллея РГО', regionId: 'rgo', floorId: 'main', labelXZ: [0, 0], polygons: [[[-8, -8], [8, -8], [8, 8], [-8, 8], [-8, -8]]] }] };
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  screen.position.set(0, 8.85, -3); screen.updateWorldMatrix(true, true);
  const source = { width: 640, height: 360, paused: true, currentTime: 0, duration: 10, muted: true };
  let delayed = null;
  const controller = {
    setWalkMode() {},
    getWalkTargets: () => [{ id: 'screen', name: 'Экран', object: screen, bounds: new THREE.Box3().setFromObject(screen), actions: [{ id: 'toggle', label: 'Включить' }] }],
    getWalkMedia: () => ({ kind: 'video', source, title: 'Экран', playing: !source.paused }),
    async activateWalkTarget() { stats.activations++; if (delayed) await delayed; source.paused = false; return { ok: true }; },
    pauseWalkVideos() { stats.pauses++; source.paused = true; },
  };
  const walk = await createWalkMode({ camera, canvas, sourceMeshes: [], sourceZones, controller, getDynamicObstacles: () => [],
    worldData, floorColors: { rgo: { halls: [] } }, onEnter: () => ({ ok: true }) });
  const key = code => { const event = new win.KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true }); canvas.dispatchEvent(event); return event; };
  return { win, walk, camera, canvas, source, stats, key, controller, delay: promise => delayed = promise,
    async close() { walk.dispose(); await win.happyDOM.close(); for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } },
  };
}

test('automatic zone entry keeps the outer controls focused and retains real eye height', async () => {
  const f = await fixture(); try {
    assert.equal(f.walk.start('rgo-main', { focus: false }).ok, true);
    assert.equal(f.stats.focus, 0); assert.equal(f.camera.position.y, 8.85);
    assert.deepEqual(f.walk.getZones().map(row => [row.id, row.regionId, row.level]), [['rgo-main', 'rgo', 'main']]);
    f.walk.start('rgo-main'); assert.equal(f.stats.focus, 1);
  } finally { await f.close(); }
});

test('hidden embedded view clears held input and does not consume keys or interact', async () => {
  const f = await fixture(); try {
    f.walk.start('rgo-main', { focus: false }); f.key('KeyW'); f.walk.update(.1);
    assert.equal(f.walk.getState().keysHeld, 1);
    f.walk.setPaused(true); const point = f.walk.getState().position, angle = f.walk.getState().yaw;
    assert.equal(f.walk.getState().paused, true); assert.equal(f.walk.getState().keysHeld, 0);
    assert.equal(f.key('KeyW').defaultPrevented, false); assert.equal(f.key('KeyE').defaultPrevented, false);
    assert.equal((await f.walk.activate('screen')).ok, false); assert.equal(f.walk.openMedia('screen'), false);
    f.walk.update(.1); assert.deepEqual(f.walk.getState().position, point); assert.equal(f.walk.getState().yaw, angle); assert.equal(f.stats.activations, 0);
    f.walk.setPaused(false); f.walk.update(.1); assert.deepEqual(f.walk.getState().position, point); assert.equal(f.walk.active, true);
  } finally { await f.close(); }
});

test('hide pauses sound and return preserves viewpoint without automatically resuming media', async () => {
  const f = await fixture(); try {
    f.walk.start('rgo-main', { focus: false }); await f.walk.activate('screen');
    assert.equal(f.source.paused, false); const point = f.walk.getState().position;
    f.walk.setPaused(true); assert.equal(f.source.paused, true);
    f.walk.setPaused(false); assert.equal(f.source.paused, true); assert.equal(f.stats.activations, 1); assert.deepEqual(f.walk.getState().position, point);
  } finally { await f.close(); }
});

test('late asynchronous media completion is paused again after the iframe becomes hidden', async () => {
  const f = await fixture(); try {
    f.walk.start('rgo-main', { focus: false }); let finish;
    f.delay(new Promise(resolve => { finish = resolve; }));
    const activation = f.walk.activate('screen'); f.walk.setPaused(true); finish(); await activation;
    assert.equal(f.source.paused, true); assert.equal(f.walk.getState().lastInteraction, null);
  } finally { await f.close(); }
});
