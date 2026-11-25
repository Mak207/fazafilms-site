import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const data = JSON.parse(await readFile(new URL('./equipment-data.json', import.meta.url), 'utf8'));
const source = await readFile(new URL('./equipment-model.js', import.meta.url), 'utf8');
const { createDefaultState, normalizeState, setQuantity, getInstances, getSummary, getContentPlan, getUnitMetrics } =
  await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('inventory references real regions, halls and content with clear names', () => {
  const ids = data.groups.map(g => g.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const g of data.groups) {
    assert.ok(data.regions.some(r => r.id === g.regionId), g.id);
    assert.ok(data.catalog.some(t => t.id === g.typeId), g.id);
    assert.ok(g.name && g.exhibitName && !/S\d{2}-|RGO-\d{2}|MEDIA-/.test(g.name), g.name);
    if (g.hallId) assert.ok(data.halls.some(h => h.id === g.hallId), g.id);
    for (const cid of g.contentIds) assert.ok(data.content.some(c => c.id === cid), cid);
    assert.ok(['main', 'upper'].includes(g.floorId));
    assert.ok(g.defaultQuantity >= 0 && g.defaultQuantity <= g.maxQuantity);
  }
  assert.equal(data.regions[0].id, 'rgo');
  assert.equal(data.halls.length, 9);
});

test('initial proposal is grounded in placed screens and programme furniture', () => {
  const state = createDefaultState(data);
  const all = getSummary(data, state);
  assert.equal(all.equipmentCount, 99);
  assert.equal(all.screens, 74);
  assert.equal(all.ledScreens, 58);
  assert.equal(all.ledCabinets, 997);
  assert.equal(all.showcases, 23);
  assert.equal(all.vrStations, 2);
  assert.equal(all.equipmentWithCoordinates, 76);
  const rgo = getSummary(data, state, { regionId: 'rgo' });
  assert.equal(rgo.ledScreens, 26);
  assert.equal(rgo.ledCabinets, 326);
  assert.equal(rgo.showcases, 8);
  assert.equal(rgo.areaM2, 1120);
  assert.equal(rgo.editorialPackages, 9);
});

test('adding a terminal adds a physical copy, cabinet grid and places without another programme', () => {
  const state = createDefaultState(data), id = 'equipment-RGO-05-INT-01';
  const before = getSummary(data, state, { hallId: 'RGO-05' });
  const next = setQuantity(data, state, id, 4);
  const after = getSummary(data, next, { hallId: '05' });
  assert.equal(state.quantities[id], 3, 'input state stays untouched');
  assert.equal(after.equipmentCount, before.equipmentCount + 1);
  assert.equal(after.screens, before.screens + 1);
  assert.equal(after.ledCabinets, before.ledCabinets + 9);
  assert.equal(after.interactivePlaces, before.interactivePlaces + 2);
  assert.equal(after.digitalPrograms, before.digitalPrograms);
  assert.equal(after.linearMinutes, before.linearMinutes);
  const copies = getInstances(data, next).filter(i => i.groupId === id);
  assert.equal(copies.length, 4);
  assert.equal(copies[3].id, id + '::4');
  assert.equal(copies[3].position, null, 'spatial planner must place new copies');
  assert.ok(copies.slice(0, 3).every(i => i.position && i.seedPosition));
});

test('removing the last device removes its programme but keeps source editorial work', () => {
  const state = createDefaultState(data), id = 'equipment-RGO-05-INT-01';
  const before = getSummary(data, state, { hallId: 'RGO-05' });
  const next = setQuantity(data, state, id, 0);
  const after = getSummary(data, next, { hallId: 'RGO-05' });
  assert.equal(after.digitalPrograms, before.digitalPrograms - 1);
  assert.equal(after.editorialPackages, before.editorialPackages);
  assert.ok(!getContentPlan(data, next, { hallId: 'RGO-05' }).some(c => c.id === 'RGO-05-PKG-APP'));
});

test('one panorama is one programme; active output channels are distinct from copies', () => {
  const state = createDefaultState(data);
  let content = getContentPlan(data, state, { regionId: 'northwest' });
  let panorama = content.find(c => c.id === 'lider-polar-night');
  assert.equal(panorama.deviceCount, 2);
  assert.equal(panorama.channels, 2);
  assert.equal(panorama.linearMinutes, 6);
  assert.equal(panorama.channelMinutes, 12);
  const duplicated = setQuantity(data, state, 'lider-panorama-1', 2);
  panorama = getContentPlan(data, duplicated, { regionId: 'northwest' }).find(c => c.id === 'lider-polar-night');
  assert.equal(panorama.deviceCount, 3);
  assert.equal(panorama.channels, 2, 'same channel copies do not create a new render');
  const removed = setQuantity(data, state, 'lider-panorama-2', 0);
  panorama = getContentPlan(data, removed, { regionId: 'northwest' }).find(c => c.id === 'lider-polar-night');
  assert.equal(panorama.channels, 1);
  assert.equal(panorama.channelMinutes, 6);
});

test('different synchronised screens and repeated terminal formats count correctly', () => {
  const state = createDefaultState(data);
  const content = getContentPlan(data, state, { hallId: 'RGO-02' });
  const movie = content.find(c => c.id === 'RGO-02-PKG-LINEAR');
  const app = content.find(c => c.id === 'RGO-02-PKG-APP');
  assert.equal(movie.channels, 2);
  assert.equal(movie.deliveryFormatCount, 1);
  assert.equal(app.deviceCount, 3);
  assert.equal(app.deliveryFormatCount, 1);
  const next = setQuantity(data, state, 'equipment-RGO-02-LED-02', 0);
  assert.equal(getContentPlan(data, next, { hallId: 'RGO-02' }).find(c => c.id === movie.id).channels, 1);
});

test('normalization bounds quantities and drops obsolete or invalid coordinates', () => {
  const group = data.groups[0], id = group.id;
  const state = normalizeState(data, { quantities: { [id]: -4, stale: 1000 }, positions: { [id + '::1']: { x: 0, z: 0 }, unknown: { x: 1, z: 1 } } });
  assert.equal(state.quantities[id], 0);
  assert.ok(!Object.hasOwn(state.quantities, 'stale'));
  assert.equal(Object.keys(state.positions).length, 0);
  assert.equal(setQuantity(data, state, id, 1e20).quantities[id], group.maxQuantity);
  assert.equal(setQuantity(data, state, id, '4').quantities[id], 4);
  assert.equal(setQuantity(data, state, id, 'bad').quantities[id], 0);
  assert.equal(normalizeState(data, { quantities: { [id]: null } }).quantities[id], group.defaultQuantity);
  assert.deepEqual(setQuantity(data, state, 'not-a-group', 8), state);
});

test('edited positions survive quantity changes for remaining stable copies', () => {
  const id = 'equipment-RGO-05-INT-01', state = createDefaultState(data);
  state.positions[id + '::1'] = { x: 21.1, z: -32.5, yaw: 1.2, floorId: 'main' };
  const next = setQuantity(data, state, id, 1);
  const instance = getInstances(data, next).find(i => i.id === id + '::1');
  assert.equal(instance.position.x, 21.1);
  assert.equal(instance.position.yaw, 1.2);
  assert.notEqual(instance.seedPosition.x, 21.1);
});

test('cabinet math rounds up once and accounts for active image instead of its outer frame', () => {
  const group = data.groups.find(g => g.id === 'lider-panorama-1');
  const m = getUnitMetrics(data, group);
  assert.equal(m.ledCabinets, 130);
  assert.equal(m.cabinetColumns, 10);
  assert.equal(m.cabinetRows, 13);
  assert.equal(m.pixelWidth, 3840);
  assert.equal(m.pixelHeight, 2808);
  const modified = { ...group, displayDimensions: { widthM: 6.09, heightM: 4.446 } };
  assert.equal(getUnitMetrics(data, modified).ledCabinets, 143);
  const floatError = { ...group, displayDimensions: { widthM: 6.08 + 1e-12, heightM: 4.446 } };
  assert.equal(getUnitMetrics(data, floatError).ledCabinets, 130);
});

test('floor and region totals add up; shared programmes are not summed twice', () => {
  const state = createDefaultState(data), all = getSummary(data, state);
  const floors = ['main', 'upper'].map(floorId => getSummary(data, state, { floorId }));
  const regions = data.regions.map(region => getSummary(data, state, { regionId: region.id }));
  for (const key of ['equipmentCount', 'screens', 'ledCabinets', 'interactiveStations', 'showcases']) {
    assert.equal(floors.reduce((sum, s) => sum + s[key], 0), all[key], key);
    assert.equal(regions.reduce((sum, s) => sum + s[key], 0), all[key], key);
  }
  assert.ok(regions.reduce((sum, s) => sum + s.digitalPrograms, 0) >= all.digitalPrograms);
  assert.equal(all.areaM2, 18884.055);
  assert.equal(getSummary(data, state, { regionId: 'central' }).areaM2, 1412.1);
  assert.equal(getSummary(data, state, { regionId: 'rgo-museum' }).areaM2, null);
});

test('power and visitors never become a falsely complete engineering result', () => {
  const state = createDefaultState(data), summary = getSummary(data, state);
  assert.equal(summary.powerKw, null);
  assert.equal(summary.powerCoverage, 'partial');
  assert.ok(summary.knownPowerKw > 0);
  assert.ok(summary.unknownPowerItems > 0);
  assert.equal(summary.powerIncludesPlayers, false);
  assert.equal(summary.visitorsPerHour, null);
  assert.equal(data.facts.approvedGuidedVisitorsPerHour, null);
  assert.equal(summary.knownPowerItems + summary.unknownPowerItems + summary.passiveItems, summary.equipmentCount);
});

test('all zero quantities produce zero hardware and no active digital production', () => {
  const state = createDefaultState(data);
  for (const id of Object.keys(state.quantities)) state.quantities[id] = 0;
  const summary = getSummary(data, state);
  assert.equal(getInstances(data, state).length, 0);
  for (const key of ['equipmentCount', 'screens', 'ledCabinets', 'screenAreaM2', 'interactiveStations', 'interactivePlaces', 'showcases', 'vrStations', 'projectors', 'digitalPrograms', 'linearMinutes', 'channelMinutes']) assert.equal(summary[key], 0, key);
  assert.equal(summary.editorialPackages, 20, 'texts for existing source exhibits are independent of screens');
  assert.equal(summary.areaM2, 18884.055, 'approved floor facts remain fixed');
});

test('source hall editorial work is retained with a floor filter and no showcases', () => {
  const state = createDefaultState(data);
  assert.equal(getSummary(data, state, { regionId: 'rgo', floorId: 'main' }).editorialPackages, 9);
  const hall = getSummary(data, state, { hallId: 'RGO-02', floorId: 'main' });
  assert.equal(hall.showcases, 0);
  assert.equal(hall.editorialPackages, 1);
  for (const g of data.groups.filter(g => g.regionId === 'rgo')) state.quantities[g.id] = 0;
  const empty = getSummary(data, state, { regionId: 'rgo', floorId: 'main' });
  assert.equal(empty.digitalPrograms, 0);
  assert.equal(empty.editorialPackages, 9);
  assert.equal(getSummary(data, state, { regionId: 'rgo', floorId: 'upper' }).editorialPackages, 0);
});

test('RGO exhibit selection never silently includes equipment from another hall',()=>{
  const hallsByExhibit=new Map();
  for(const g of data.groups.filter(g=>g.regionId==='rgo'&&g.defaultQuantity>0)){
    if(!hallsByExhibit.has(g.exhibitId))hallsByExhibit.set(g.exhibitId,new Set());
    hallsByExhibit.get(g.exhibitId).add(g.hallId);
  }
  for(const [id,halls] of hallsByExhibit)assert.equal(halls.size,1,id);
});
