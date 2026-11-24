import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeEngineering } from './engineering-model.js';

const close = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const group = (result, key) => result.auxiliaryGroups.find(item => item.key === key);

test('base integrates content, dimensions and unique equipment: 79.82 kW / 419.05 m² / 289', () => {
  const r = computeEngineering();
  assert.equal(r.valid, true);
  assert.equal(r.screen.totals.surfaceCount, 152);
  close(r.screen.totals.totalActiveAreaM2, 419.0491047653412);
  assert.equal(r.screen.power.budget.totalW, 79820);
  assert.equal(r.screen.power.budget.equipmentCount, 289);
  assert.equal(new Set(r.screen.equipment.map(e => e.id)).size, 289);
  assert.equal(r.screen.power.maximum.totalW, null);
  assert.equal(r.screen.power.maximum.unknownCount, 289);
  assert.equal(r.reservedBudgetW, 95784);
  close(2 * r.distribution.floorW + r.distribution.coreW, 79820);
});

test('flow cliff recomputes stations, area, PCs and loads together', () => {
  const baseline = computeEngineering();
  const below = computeEngineering({ flow:{ independentFlow:650 } });
  const boundary = computeEngineering({ flow:{ independentFlow:660 } });
  const above = computeEngineering({ flow:{ independentFlow:670 } });
  assert.ok([below, boundary, above].every(r => r.valid));
  assert.equal(below.content.counts.interactiveStations, 72);
  assert.equal(boundary.content.counts.interactiveStations, 72);
  assert.equal(above.content.counts.interactiveStations, 96);
  assert.equal(boundary.screen.power.budget.totalW, baseline.screen.power.budget.totalW);
  assert.equal(above.screen.totals.surfaceCount, 176);
  assert.equal(group(above, 'stationComputer').count, 96);
  assert.equal(above.screen.power.budget.equipmentCount, 337);
  assert.equal(above.screen.power.budget.totalW, 91820);
  close(above.screen.totals.totalActiveAreaM2 - baseline.screen.totals.totalActiveAreaM2, 24 * baseline.screen.categories.find(r => r.key === 'interactive').areaM2);
  close(2 * above.distribution.floorW + above.distribution.coreW, 91820);
});

test('shared computers and servers are counted by station/installation, not surface', () => {
  const baseline = computeEngineering();
  const doubleScreens = computeEngineering({ flow:{ surfacesPerInteractiveStation:2 } });
  assert.equal(doubleScreens.valid, true);
  assert.equal(doubleScreens.content.counts.interactiveSurfaces, 144);
  assert.equal(group(doubleScreens, 'stationComputer').count, 72);
  assert.equal(group(doubleScreens, 'heroServer').count, 8);
  assert.equal(group(doubleScreens, 'commonServer').count, 4);
  assert.equal(doubleScreens.screen.power.budget.totalW - baseline.screen.power.budget.totalW, 72 * 320);
  assert.equal(doubleScreens.screen.power.budget.equipmentCount, 361);
});

test('visit duration changes occupancy without inventing power diversity', () => {
  const baseline = computeEngineering();
  const longer = computeEngineering({ flow:{ independentMinutes:180 } });
  assert.equal(longer.valid, true);
  assert.equal(longer.content.flows.totalOccupancy - baseline.content.flows.totalOccupancy, 500);
  assert.equal(longer.screen.power.budget.totalW, baseline.screen.power.budget.totalW);
});

test('unknown display budget is null through total, reserve and affected distribution', () => {
  const r = computeEngineering({ types:{ hero:{ assumedDeviceBudgetW:null } } });
  assert.equal(r.valid, true);
  assert.equal(r.screen.power.budget.totalW, null);
  assert.equal(r.screen.power.budget.partialKnownW, 79820 - 24 * 700);
  assert.equal(r.screen.power.budget.unknownCount, 24);
  assert.equal(r.reservedBudgetW, null);
  assert.equal(r.distribution.zoneW, null);
  assert.equal(r.distribution.floorW, null);
  assert.equal(r.distribution.commonPerFloorW, 3800);
});

test('unknown shared central load does not erase known floor loads', () => {
  const r = computeEngineering({ auxiliaryBudgets:{ coreControl:null } });
  assert.equal(r.valid, true);
  assert.equal(r.screen.power.budget.totalW, null);
  assert.equal(r.screen.power.budget.partialKnownW, 79220);
  assert.equal(r.distribution.coreW, null);
  assert.equal(r.distribution.floorW, 39610);
});

test('zero devices with unknown unit budgets are zero, not unknown', () => {
  const r = computeEngineering({
    flow:{ navigationSurfaces:0, commonSurfaces:0, commonInstallations:0, commonPackages:0 },
    types:{ navigation:{ assumedDeviceBudgetW:null }, common:{ assumedDeviceBudgetW:null } },
    auxiliaryBudgets:{ navigationPlayer:null, commonServer:null },
  });
  assert.equal(r.valid, true);
  assert.equal(r.screen.power.budget.totalW, 69880);
  assert.equal(r.distribution.commonPerFloorW, 0);
  assert.equal(r.distribution.navigationPerFloorW, 0);
  assert.equal(r.distribution.floorW, 34640);
});

test('unknown physical dimension is retained, while invalid inputs never throw', () => {
  const unknown = computeEngineering({ types:{ hero:{ widthM:null } } });
  assert.equal(unknown.valid, true);
  assert.equal(unknown.screen.totals.totalActiveAreaM2, null);
  assert.equal(unknown.screen.power.budget.totalW, 79820);
  const invalidInputs = [null, [], { types:null }, { reservePercent:null }, { reservePercent:NaN },
    { types:{ hero:{ widthM:-1 } } }, { auxiliaryBudgets:{ stationComputer:-1 } },
    { flow:{ independentFlow:-1 } }, { flow:{ guidedFlow:300, groupSize:0 } },
    { flow:{ independentFlow:1e8 } }, { auxiliaryBudgets:{ coreControl:1e308 }, reservePercent:100 }];
  for (const input of invalidInputs) {
    let r;
    assert.doesNotThrow(() => { r = computeEngineering(input); });
    assert.equal(r.valid, false);
    assert.equal(r.distribution, null);
    assert.equal(r.reservedBudgetW, null);
    assert.ok(r.errors.length > 0);
  }
});

test('plan B counts match base, with explicit Y-up and hero viewing override', () => {
  const plan = JSON.parse(readFileSync(new URL('./placement-candidates.json', import.meta.url), 'utf8'));
  const r = computeEngineering();
  assert.equal(plan.variant, 'B');
  assert.equal(plan.coordinateSystem.upAxis, 'Y');
  assert.equal(plan.coordinateSystem.geojsonPlane, 'XZ');
  for (const category of r.screen.categories) assert.equal(plan.summary.byCategory[category.key].requestedSurfaces, category.count);
  assert.equal(plan.summary.placedScenes, plan.placements.length);
  assert.equal(plan.summary.placedSurfaces, plan.placements.reduce((sum, p) => sum + p.surfaces, 0));
  const hero = plan.placements.find(p => p.category === 'hero');
  assert.equal(hero.viewingFarM, 6);
  assert.equal(hero.scenarioOverride.baseViewingFarM, 10);
  assert.equal(hero.scenarioOverride.sideViewingVerified, false);
  assert.ok(hero.screenLines.filter(line => !line.frontPanel).every(line => line.viewingFarM === null));
  assert.equal(r.distribution.linkedToPlacementPlan, false);
});
