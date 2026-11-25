import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createInstallationsWalkBridge, resolveInstallationsWalkZone, INSTALLATIONS_WALK_PROTOCOL } from './installations-walk-bridge.js';

const source = JSON.parse(await readFile(new URL('./assets/zones/source-zones.json', import.meta.url), 'utf8'));
const colors = JSON.parse(await readFile(new URL('./assets/zones/floor-colors.json', import.meta.url), 'utf8'));
const equipment = JSON.parse(await readFile(new URL('../installations/equipment-data.json', import.meta.url), 'utf8'));
const zones = source.zones.map(row => ({ id: row.id, name: row.title, level: row.floorId, regionId: row.regionId }));
zones.push(...colors.rgo.halls.map(row => ({ id: 'rgo-' + row.id, name: row.name, level: 'main', regionId: 'rgo', hallId: row.id })));

function fixture({ embedded = true } = {}) {
  const sent = [], displays = [], calls = [], pauses = [];
  const win = new EventTarget(), parent = { postMessage: (data, origin) => sent.push({ data, origin }) };
  win.parent = parent; win.document = new EventTarget(); win.location = new URL('https://fazafilms.ru/review/park-vpechatleniy/tour/' + (embedded ? '?embedded=installations' : ''));
  let current = { active: false, zoneId: null }, fail = false;
  const walk = { getZones: () => zones, getState: () => current,
    start(id, options) { calls.push({ id, options }); if (fail) return { ok: false }; current = { ...current, active: true, zoneId: id }; return { ok: true }; },
    setPaused(value) { pauses.push(value); },
  };
  const bridge = createInstallationsWalkBridge({ windowObject: win, onVisibility: value => displays.push(value) });
  function receive(kind, payload = {}, { origin = win.location.origin, source = parent } = {}) {
    const event = new Event('message'); Object.assign(event, { origin, source, data: { protocol: INSTALLATIONS_WALK_PROTOCOL, kind, sequence: 1, ...payload } }); win.dispatchEvent(event);
  }
  return { win, parent, sent, displays, calls, pauses, walk, bridge, receive, fail: value => fail = value };
}

test('every equipment region, floor and RGO hall resolves to its existing walk start', () => {
  let mapped = 0;
  for (const region of equipment.regions) for (const floor of region.floors) {
    const resolved = resolveInstallationsWalkZone({ regionId: region.id, floorId: floor.id }, zones);
    assert.equal(resolved.zone.id, floor.zoneId); assert.equal(resolved.zone.regionId, region.id); mapped++;
  }
  for (const hall of equipment.halls) {
    assert.equal(resolveInstallationsWalkZone({ regionId: 'rgo', hallId: hall.id, floorId: hall.floorId }, zones).zone.id, hall.id.toLowerCase()); mapped++;
  }
  assert.equal(mapped, 29);
});

test('whole park chooses a real start on the selected floor; invalid halls never select another zone', () => {
  assert.equal(resolveInstallationsWalkZone({ floorId: 'main' }, zones).zone.id, 'central-square-main');
  assert.equal(resolveInstallationsWalkZone({ floorId: 'upper' }, zones).zone.id, 'central-upper');
  for (const scope of [null, [], { regionId: 'missing' }, { floorId: 'roof' }, { regionId: 'south', hallId: 'RGO-01' }, { regionId: 'rgo', hallId: 'RGO-99' }, { regionId: '<script>' }]) assert.equal(resolveInstallationsWalkZone(scope, zones), null);
});

test('latest selected zone queues through load and starts only when the parent is visible', () => {
  const f = fixture();
  f.receive('zone', { sequence: 1, scope: { regionId: 'rgo', hallId: 'RGO-01', floorId: 'main' } });
  f.receive('zone', { sequence: 2, scope: { regionId: 'south', floorId: 'upper' } });
  f.bridge.attach(f.walk); assert.equal(f.calls.length, 0); assert.equal(f.sent[0].data.kind, 'ready');
  f.receive('visibility', { visible: true });
  assert.deepEqual(f.calls, [{ id: 'south-upper', options: { focus: false } }]); assert.equal(f.pauses.at(-1), false);
  f.bridge.dispose();
});

test('only this same-origin parent can select a zone or change visibility', () => {
  const f = fixture(); f.bridge.attach(f.walk);
  f.receive('visibility', { visible: true }, { origin: 'https://other.example' });
  f.receive('visibility', { visible: true }, { source: {} });
  f.receive('zone', { scope: { regionId: 'rgo' } }, { origin: 'https://other.example' });
  assert.equal(f.bridge.getState().visible, false); assert.equal(f.bridge.getState().pending, null);
  f.receive('visibility', { visible: true }); f.receive('zone', { scope: { regionId: 'rgo' } });
  assert.equal(f.calls.length, 1); f.bridge.dispose();
});

test('same scope and hide/show preserve position; explicit restart alone returns to its start', () => {
  const f = fixture(); f.bridge.attach(f.walk); f.receive('visibility', { sequence: 10, visible: true });
  const scope = { regionId: 'rgo', hallId: 'RGO-05', floorId: 'main' };
  f.receive('zone', { sequence: 1, scope });
  f.receive('zone', { sequence: 2, scope }); assert.equal(f.calls.length, 1);
  f.receive('visibility', { sequence: 11, visible: false }); assert.equal(f.pauses.at(-1), true);
  f.receive('visibility', { sequence: 10, visible: true }); assert.equal(f.bridge.getState().visible, false);
  f.receive('visibility', { sequence: 12, visible: true }); assert.equal(f.calls.length, 1);
  f.receive('zone', { sequence: 1, scope: { regionId: 'south' } }); assert.equal(f.calls.length, 1);
  f.receive('zone', { sequence: 3, scope, restart: true }); assert.equal(f.calls.length, 2);
  f.bridge.dispose();
});

test('quantity and equipment messages have no camera effect; changed scope while hidden applies on return', () => {
  const f = fixture(); f.bridge.attach(f.walk); f.receive('visibility', { visible: true }); f.receive('zone', { scope: { regionId: 'rgo' } });
  f.receive('variant', { sequence: 8, variant: { state: { quantities: { screen: 5 } } } }); assert.equal(f.calls.length, 1);
  f.receive('visibility', { sequence: 2, visible: false }); f.receive('zone', { sequence: 2, scope: { regionId: 'central', floorId: 'upper' } });
  assert.equal(f.calls.length, 1); f.receive('visibility', { sequence: 3, visible: true }); assert.equal(f.calls.at(-1).id, 'central-upper');
  f.bridge.dispose();
});

test('blocked starts and boot failures produce a usable status without a false success', () => {
  const f = fixture(); f.bridge.attach(f.walk); f.receive('visibility', { visible: true }); f.fail(true);
  f.receive('zone', { scope: { regionId: 'rgo' } });
  assert.equal(f.sent.at(-1).data.ok, false); assert.equal(f.bridge.getState().appliedKey, null);
  f.bridge.error('Не удалось загрузить прогулку.'); assert.equal(f.sent.at(-1).data.error, true);
  f.fail(false); f.receive('zone', { sequence: 2, scope: { regionId: 'rgo' }, restart: true }); assert.equal(f.sent.at(-1).data.ok, true);
  f.bridge.dispose(); const count = f.calls.length; f.receive('zone', { sequence: 3, scope: { regionId: 'south' } }); assert.equal(f.calls.length, count);
});

test('standalone tour ignores the embed protocol', () => {
  const f = fixture({ embedded: false }); f.bridge.attach(f.walk); f.receive('visibility', { visible: true }); f.receive('zone', { scope: { regionId: 'rgo' } });
  assert.equal(f.bridge.enabled, false); assert.equal(f.calls.length, 0); assert.equal(f.sent.length, 0); assert.equal(f.displays.length, 0); f.bridge.dispose();
});
