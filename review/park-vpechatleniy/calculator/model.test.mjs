import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA, DEFAULT_INPUT, validateInput, computePark } from './model.js';

const close = (actual, expected, tolerance = 1e-8) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const hasWarning = (result, code) => result.warnings.some(warning => warning.code === code);
const allNumbersFinite = value => typeof value === 'number' ? Number.isFinite(value)
  : value && typeof value === 'object' ? Object.values(value).every(allNumbersFinite) : true;

test('default scenario is derived, not fitted: 168 installed, 240 required, +72', () => {
  const result = computePark();
  assert.equal(result.valid, true);
  assert.equal(result.capacity.pointCount, 80);
  assert.equal(result.capacity.interactivePointCount, 72);
  assert.equal(result.capacity.demandPerPointPerHour, 320);
  close(result.time.stationCycleMinutes, 2.25);
  close(result.time.guidedPointBudgetMinutes, 2.4);
  close(result.capacity.nominalCapacityPerStationPerHour, 160);
  close(result.capacity.sustainableCapacityPerStationPerHour, 128);
  assert.equal(result.capacity.averageRequiredStationsPerPoint, 3);
  assert.equal(result.capacity.requiredGroupParallelStations, 2);
  assert.equal(result.capacity.requiredStationsPerPoint, 3);
  assert.equal(result.capacity.requiredStationsTotal, 216);
  assert.equal(result.surfaces.existingTotal, 168);
  assert.equal(result.surfaces.total, 240);
  assert.equal(result.surfaces.additional, 72);
  close(result.capacity.existingUtilization, 1);
  close(result.capacity.proposedUtilization, 2 / 3);
  close(result.capacity.sustainableCapacityDeltaPerPointPerHour, 128);
  close(result.capacity.existingCapacityHeadroomPerPointPerHour, -64);
  close(result.capacity.proposedCapacityHeadroomPerPointPerHour, 64);
  assert.equal(result.flows.guidedOccupancy, 1200);
  assert.equal(result.flows.independentOccupancy, 1000);
  assert.equal(result.flows.totalOccupancy, 2200);
  assert.ok(hasWarning(result, 'installed_capacity_below_target'));
});

test('mandatory point throughput is not divided by 8 districts or 80 points', () => {
  const manyPoints = computePark({ guidedParticipation: 100, independentParticipation: 100 });
  const fewerPoints = computePark({
    guidedParticipation: 100, independentParticipation: 100,
    pointsPerDistrict: 2, interactivePointsPerDistrict: 1,
  });
  assert.equal(manyPoints.capacity.demandPerPointPerHour, 800);
  assert.equal(fewerPoints.capacity.demandPerPointPerHour, 800);
  assert.equal(manyPoints.capacity.averageRequiredStationsPerPoint, 7);
  assert.equal(fewerPoints.capacity.averageRequiredStationsPerPoint, 7);
  assert.equal(manyPoints.capacity.requiredStationsTotal, 7 * 72);
  assert.equal(fewerPoints.capacity.requiredStationsTotal, 7 * 8);
});

test('a guided batch can require more stations than the hourly average', () => {
  const result = computePark({ independentFlow: 0 });
  assert.equal(result.capacity.demandPerPointPerHour, 120);
  assert.equal(result.capacity.averageRequiredStationsPerPoint, 1);
  assert.equal(result.capacity.guidedBatchParticipants, 12);
  assert.equal(result.capacity.requiredGroupParallelStations, 2);
  assert.equal(result.capacity.requiredStationsPerPoint, 2);
  assert.equal(result.surfaces.total, 168);
  assert.equal(result.surfaces.additional, 0);
  const oneInstalled = computePark({ independentFlow: 0, existingStationsPerPoint: 1 });
  close(oneInstalled.capacity.guidedExistingBatchDurationMinutes, 4.5);
  close(oneInstalled.capacity.guidedBatchDurationMinutes, 2.25);
  assert.equal(oneInstalled.capacity.guidedExistingBatchFitsBudget, false);
  assert.equal(oneInstalled.capacity.guidedBatchFitsBudget, true);
  assert.ok(hasWarning(oneInstalled, 'installed_batch_does_not_fit'));
});

test('larger batches change station needs and intervals, not guided occupancy', () => {
  const base = computePark({ independentFlow: 0 });
  const larger = computePark({ independentFlow: 0, groupSize: 60 });
  assert.equal(base.flows.groupLaunchIntervalMinutes, 6);
  assert.equal(larger.flows.groupLaunchIntervalMinutes, 12);
  assert.equal(larger.capacity.requiredGroupParallelStations, 4);
  assert.equal(larger.capacity.requiredStationsPerPoint, 4);
  assert.equal(larger.flows.guidedOccupancy, base.flows.guidedOccupancy);
  assert.equal(larger.flows.guidedGroupsInPark, 20);
});

test('independent dwell time affects simultaneous presence, not steady throughput', () => {
  const shorter = computePark({ independentMinutes: 120 });
  const longer = computePark({ independentMinutes: 240 });
  assert.equal(shorter.flows.totalOccupancy, 2200);
  assert.equal(longer.flows.totalOccupancy, 3200);
  assert.equal(shorter.capacity.demandPerPointPerHour, longer.capacity.demandPerPointPerHour);
  assert.equal(shorter.capacity.requiredStationsPerPoint, longer.capacity.requiredStationsPerPoint);
  assert.deepEqual(shorter.surfaces, longer.surfaces);
  assert.ok(longer.areas.accessibleM2PerVisitor < shorter.areas.accessibleM2PerVisitor);
});

test('round the required station count at each point before summing', () => {
  const result = computePark({ guidedFlow: 0, independentFlow: 10 });
  assert.equal(result.capacity.demandPerPointPerHour, 4);
  assert.equal(result.capacity.averageRequiredStationsPerPoint, 1);
  assert.equal(result.capacity.requiredStationsTotal, 72);
  const incorrectGlobalPooling = Math.ceil(result.capacity.demandAllPointsPerHour
    / result.capacity.sustainableCapacityPerStationPerHour);
  assert.equal(incorrectGlobalPooling, 3);
  assert.notEqual(result.capacity.requiredStationsTotal, incorrectGlobalPooling);
});

test('route budget includes transitions; a shorter optional route changes the batch budget', () => {
  const all = computePark({ independentFlow: 0 });
  const selected = computePark({
    independentFlow: 0, guidedVisitAllPoints: false, guidedPointsVisitedPerDistrict: 5,
  });
  assert.equal(all.time.guidedRoutePointCount, 80);
  assert.equal(all.time.guidedTransitionMinutes, 48);
  close(all.time.guidedPointBudgetMinutes, (240 - 48) / 80);
  assert.equal(selected.time.guidedRoutePointCount, 40);
  close(selected.time.guidedPointBudgetMinutes, 4.8);
  assert.equal(selected.time.wavesWithinBudget, 2);
  assert.equal(selected.capacity.requiredGroupParallelStations, 1);
  assert.equal(selected.capacity.requiredStationsPerPoint, 1);
  // Selecting a shorter route does not silently alter participation at a point.
  assert.equal(selected.capacity.demandPerPointPerHour, all.capacity.demandPerPointPerHour);
});

test('adding stations cannot cure a cycle longer than the stop budget', () => {
  const result = computePark({ experienceMinutes: 3, existingStationsPerPoint: 100 });
  assert.equal(result.valid, true);
  assert.equal(result.capacity.requiredGroupParallelStations, null);
  assert.equal(result.capacity.guidedBatchFeasible, false);
  assert.equal(result.capacity.guidedBatchFitsBudget, false);
  assert.equal(result.capacity.guidedExistingBatchFitsBudget, false);
  assert.ok(hasWarning(result, 'cycle_exceeds_point_budget'));
  assert.ok(allNumbersFinite(result));
});

test('no point time remains when transitions consume the district', () => {
  const result = computePark({ transitionPerDistrictMinutes: 30 });
  assert.equal(result.valid, true);
  assert.equal(result.time.guidedPointBudgetMinutes, 0);
  assert.equal(result.capacity.guidedBatchFeasible, false);
  assert.ok(hasWarning(result, 'no_guided_point_budget'));
  assert.ok(allNumbersFinite(result));
});

test('zero flows and zero group size produce finite outputs and no fictitious demand', () => {
  const result = computePark({
    guidedFlow: 0, independentFlow: 0, groupSize: 0,
    guidedMinutes: 0, independentMinutes: 0, existingStationsPerPoint: 0,
  });
  assert.equal(result.valid, true);
  assert.equal(result.flows.totalOccupancy, 0);
  assert.equal(result.flows.groupLaunchIntervalMinutes, null);
  assert.equal(result.capacity.requiredStationsTotal, 0);
  assert.equal(result.capacity.existingUtilization, 0);
  assert.equal(result.surfaces.total, 24);
  assert.equal(result.areas.accessibleM2PerVisitor, null);
  assert.ok(allNumbersFinite(result));
});

test('zero installed stations with demand gives an undefined ratio, not Infinity', () => {
  const result = computePark({ existingStationsPerPoint: 0 });
  assert.equal(result.valid, true);
  assert.equal(result.capacity.existingUtilization, null);
  assert.equal(result.capacity.guidedExistingBatchDurationMinutes, null);
  assert.equal(result.capacity.additionalStationsTotal, result.capacity.requiredStationsTotal);
  assert.ok(allNumbersFinite(result));
});

test('zero interactive points leaves only explicitly configured fixed surfaces', () => {
  const result = computePark({ interactivePointsPerDistrict: 0 });
  assert.equal(result.valid, true);
  assert.equal(result.capacity.representativePointExists, false);
  assert.equal(result.capacity.demandPerPointPerHour, 0);
  assert.equal(result.capacity.requiredStationsTotal, 0);
  assert.equal(result.surfaces.total, 24);
  assert.equal(result.surfaces.existingTotal, 24);
  assert.ok(allNumbersFinite(result));
});

test('area allocation conserves measured total; reserve and service are explicit', () => {
  const result = computePark();
  close(AREA.lowerLevelM2 + AREA.upperLevelM2, AREA.totalM2);
  close(result.areas.commonAreaM2 + result.areas.heroAreaM2 + result.areas.interactiveAreaM2
    + result.areas.serviceAreaM2 + result.areas.reserveAreaM2, AREA.totalM2);
  assert.equal(result.areas.reservePercent, 10);
  close(result.areas.visitorAccessibleAreaM2,
    result.areas.commonAreaM2 + result.areas.heroAreaM2 + result.areas.interactiveAreaM2);
  close(result.districts.reduce((sum, district) => sum + district.areaM2, 0), result.areas.districtAreaTotalM2);
  close(result.districts.reduce((sum, district) => sum + district.totalOccupancy, 0), result.flows.totalOccupancy);
  close(result.districts.reduce((sum, district) => sum + district.accessibleWithCommonAllocationM2, 0), result.areas.visitorAccessibleAreaM2);
  assert.equal(result.districts.reduce((sum, district) => sum + district.interactiveSurfaces, 0), result.surfaces.interactive);
  assert.equal(result.surfaces.total - result.surfaces.interactive, 24);
});

test('optional unequal district areas change area, not assumed district dwell or point counts', () => {
  const areas = [1000, 1200, 1500, 1700, 1900, 2200, 2500, 3464.055];
  const result = computePark({ districtAreas: areas });
  assert.equal(result.valid, true);
  assert.equal(result.areas.districtDistribution, 'provided-areas');
  assert.equal(result.districts[0].areaM2, 1000);
  assert.equal(result.districts[7].areaM2, 3464.055);
  close(result.districts[0].interactiveAreaM2, 300);
  assert.equal(result.districts[0].totalOccupancy, result.districts[7].totalOccupancy);
  assert.equal(result.districts[0].interactiveSurfaces, result.districts[7].interactiveSurfaces);
  assert.ok(result.districts[7].accessibleM2PerVisitor > result.districts[0].accessibleM2PerVisitor);
});

test('surface count is distinct from station count and fixed surfaces are not duplicated', () => {
  const result = computePark({ surfacesPerStation: 3, fixedContentSurfaces: 13, navigationSurfaces: 7 });
  assert.equal(result.capacity.requiredStationsTotal, 216);
  assert.equal(result.surfaces.interactive, 648);
  assert.equal(result.surfaces.total, 668);
  assert.equal(result.surfaces.existingTotal, 452);
  assert.equal(result.surfaces.additional, 216);
  assert.equal(result.surfaces.plannedTotal, result.surfaces.existingTotal + result.surfaces.additional);
});

test('zero surfaces per station can represent a screenless interactive', () => {
  const result = computePark({ surfacesPerStation: 0 });
  assert.equal(result.valid, true);
  assert.equal(result.capacity.requiredStationsTotal, 216);
  assert.equal(result.surfaces.total, 24);
});

test('group-screen viewing capacity is separate from interactive capacity and fixed totals', () => {
  const result = computePark({ spectatorsPerGroupScreen: 10 });
  assert.equal(result.capacity.spectatorScreensForOneGroup, 3);
  assert.equal(result.capacity.requiredStationsTotal, 216);
  assert.equal(result.surfaces.total, 240);
});

test('whole-person batches round up, never down', () => {
  const result = computePark({ guidedParticipation: 41, independentFlow: 0 });
  assert.equal(result.capacity.guidedBatchParticipants, 13);
  assert.equal(result.capacity.requiredGroupParallelStations, 3);
});

test('reserve can be zero, but area percentages over 100 are invalid', () => {
  const valid = computePark({ heroPercent: 40, interactivePercent: 30, servicePercent: 30 });
  assert.equal(valid.valid, true);
  assert.equal(valid.areas.reserveAreaM2, 0);
  const invalid = computePark({ heroPercent: 40.01, interactivePercent: 30, servicePercent: 30 });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.areas, null);
  assert.ok(invalid.errors.some(error => error.code === 'area_percentages_over_100'));
});

test('no accessible area never produces infinite density', () => {
  const result = computePark({ commonArea: 0, heroPercent: 0, interactivePercent: 0, servicePercent: 100 });
  assert.equal(result.valid, true);
  assert.equal(result.areas.visitorAccessibleAreaM2, 0);
  assert.equal(result.areas.visitorsPerAccessibleM2, null);
  assert.ok(hasWarning(result, 'no_accessible_area'));
  assert.ok(allNumbersFinite(result));
});

test('incompatible participation and short visit are flagged rather than silently rescaled', () => {
  const independent = computePark({ independentMinutes: 10 });
  assert.ok(hasWarning(independent, 'independent_active_time_exceeds_visit'));
  assert.equal(independent.capacity.independentDemandPerPointPerHour, 200);
  const guided = computePark({ guidedVisitAllPoints: false, guidedPointsVisitedPerDistrict: 1 });
  assert.ok(hasWarning(guided, 'guided_participation_exceeds_route'));
});

test('numeric form strings are normalized without silently accepting blank fields', () => {
  const valid = validateInput({ guidedFlow: '300', independentFlow: '500', targetUtilization: '80' });
  assert.equal(valid.valid, true);
  assert.equal(valid.input.guidedFlow, 300);
  assert.equal(validateInput({ guidedFlow: '' }).valid, false);
  assert.equal(validateInput({ guidedFlow: null }).valid, false);
  assert.equal(validateInput({ guidedFlow: true }).valid, false);
});

test('input validation covers zero denominators, invalid counts and unsupported percentages', () => {
  const cases = [
    { groupSize: 0 }, { usersPerStation: 0 }, { targetUtilization: 0 },
    { spectatorsPerGroupScreen: 0 }, { experienceMinutes: 0, turnoverSeconds: 0 },
    { guidedParticipation: 101 }, { independentParticipation: -1 },
    { existingStationsPerPoint: 1.5 }, { pointsPerDistrict: 0 },
    { interactivePointsPerDistrict: 11 }, { commonArea: AREA.totalM2 + 1 },
    { guidedFlow: -1 }, { guidedMinutes: 0 }, { independentMinutes: 0 },
    { guidedVisitAllPoints: 'false' },
    { guidedVisitAllPoints: false, guidedPointsVisitedPerDistrict: 11 },
    { districtAreas: [1, 2] }, { districtAreas: Array(8).fill(1) },
  ];
  for (const input of cases) {
    const result = computePark(input);
    assert.equal(result.valid, false, JSON.stringify(input));
    assert.equal(result.capacity, null);
    assert.ok(allNumbersFinite(result));
  }
});

test('nonfinite input and extreme numerical ranges return errors, never nonfinite output', () => {
  for (const value of [NaN, Infinity, -Infinity, 'Infinity', 1e308]) {
    const result = computePark({ guidedFlow: value });
    assert.equal(result.valid, false);
    assert.ok(allNumbersFinite(result));
  }
  assert.equal(computePark(null).valid, false);
  assert.equal(computePark([]).valid, false);
});

test('100% target produces a reserve warning without inventing a queue guarantee', () => {
  const result = computePark({ targetUtilization: 100 });
  assert.equal(result.valid, true);
  assert.ok(hasWarning(result, 'no_utilization_reserve'));
});

test('compute is pure and does not mutate defaults, input objects or district areas', () => {
  const originalDefaults = JSON.stringify(DEFAULT_INPUT);
  const raw = {
    independentFlow: 400,
    districtAreas: [1000, 1200, 1500, 1700, 1900, 2200, 2500, 3464.055],
  };
  const before = JSON.stringify(raw);
  assert.deepEqual(computePark(raw), computePark(raw));
  assert.equal(JSON.stringify(raw), before);
  assert.equal(JSON.stringify(DEFAULT_INPUT), originalDefaults);
});
