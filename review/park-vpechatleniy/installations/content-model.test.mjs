import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

// Deployment uses installation/content-model.js → ../calculator/model.js.
// The development workspace also supports the earlier park-calculator folder.
let capacityUrl = new URL('../calculator/model.js', import.meta.url);
try { await access(capacityUrl); }
catch { capacityUrl = new URL('../park-calculator/model.js', import.meta.url); }
await access(capacityUrl);
const source = await readFile(new URL('./content-model.js', import.meta.url), 'utf8');
const loadableSource = source.replace("from '../calculator/model.js'", `from '${capacityUrl.href}'`);
const { CONTENT_DEFAULTS, computeContentPlan, validateContentInput } =
  await import(`data:text/javascript;base64,${Buffer.from(loadableSource).toString('base64')}`);

const close = (actual, expected, epsilon = 1e-8) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
const warning = (result, code) => result.warnings.some(item => item.code === code);
const finite = value => typeof value === 'number' ? Number.isFinite(value)
  : value && typeof value === 'object' ? Object.values(value).every(finite) : true;

test('proposed baseline independently reconciles installations, equipment, content and runtime', () => {
  const result = computeContentPlan();
  assert.equal(result.valid, true);
  assert.equal(result.status, 'proposal');
  assert.equal(result.counts.pointsPerDistrict, 10);
  assert.equal(result.counts.districtInstallations, 80);
  assert.equal(result.counts.totalInstallations, 84);
  assert.equal(result.counts.heroInstallations, 8);
  assert.equal(result.counts.interactiveInstallations, 24);
  assert.equal(result.counts.mediaInstallations, 32);
  assert.equal(result.counts.objectInstallations, 16);
  assert.equal(result.counts.interactiveStations, 72);
  assert.equal(result.counts.duplicateInteractiveStations, 48);
  assert.equal(result.counts.physicalSurfaces, 152);
  assert.equal(result.counts.digitalPackages, 69);
  assert.equal(result.counts.objectPackages, 16);
  assert.equal(result.counts.scopedPackages, 85);
  assert.equal(result.content.interactiveApplications, 3);
  assert.equal(result.content.interactiveContentPackages, 24);
  assert.equal(result.content.linearPrograms, 44);
  assert.equal(result.runtime.uniqueLinearMinutes, 114);
  assert.equal(result.runtime.uniqueChannelMinutes, 194);
  close(result.route.districtMinutes, 28.75);
  assert.equal(result.route.totalMinutes, 240);
  assert.equal(result.route.feasible, true);
  assert.equal(result.route.spareMinutes, 0);
  assert.ok(warning(result, 'route_has_no_spare_time'));
  assert.equal(result.flows.totalOccupancy, 2200);
});

test('table sums use installations and stations as different units', () => {
  const result = computeContentPlan();
  const sum = field => result.table.reduce((total, row) => total + (row[field] ?? 0), 0);
  assert.equal(sum('installations'), 84);
  assert.equal(sum('stations'), 72);
  assert.equal(sum('physicalSurfaces'), 152);
  assert.equal(sum('uniquePackages'), 85);
  assert.equal(sum('linearMinutes'), 114);
  assert.equal(sum('channelMinutes'), 194);
  const navigation = result.table.find(row => row.id === 'navigation');
  assert.equal(navigation.installations, 0);
  assert.equal(navigation.systems, 1);
  assert.equal(navigation.physicalSurfaces, 12);
  assert.ok(result.table.every(row => row.status === 'proposal'));
});

test('the interactive load uses 24 points, not nine identical interactives per territory', () => {
  const result = computeContentPlan();
  assert.equal(result.capacity.demandPerPointPerHour, 320);
  assert.equal(result.capacity.sustainablePerStationPerHour, 128);
  assert.equal(result.capacity.meanStationsPerPoint, 3);
  assert.equal(result.capacity.groupStationsPerPoint, 2);
  assert.equal(result.capacity.requiredStationsPerPoint, 3);
  assert.equal(result.capacity.totalStations, 24 * 3);
});

test('650 and 660 independent visitors/hour fit three stations; 670 requires four', () => {
  const a = computeContentPlan({ independentFlow: 650 });
  const b = computeContentPlan({ independentFlow: 660 });
  const c = computeContentPlan({ independentFlow: 670 });
  assert.equal(a.capacity.requiredStationsPerPoint, 3);
  assert.equal(b.capacity.requiredStationsPerPoint, 3);
  assert.equal(c.capacity.requiredStationsPerPoint, 4);
  assert.equal(a.counts.physicalSurfaces, 152);
  assert.equal(b.counts.physicalSurfaces, 152);
  assert.equal(c.counts.physicalSurfaces, 176);
  close(a.sensitivities.nextIndependentFlowThresholdPerHour, 660);
  assert.equal(c.counts.digitalPackages, a.counts.digitalPackages);
  assert.equal(c.content.interactiveApplications, a.content.interactiveApplications);
});

test('750 independent visitors increase equipment, not unique stories or runtime', () => {
  const base = computeContentPlan();
  const busy = computeContentPlan({ independentFlow: 750 });
  assert.equal(busy.capacity.demandPerPointPerHour, 420);
  assert.equal(busy.capacity.requiredStationsPerPoint, 4);
  assert.equal(busy.counts.physicalSurfaces, 176);
  assert.equal(busy.counts.physicalSurfaces - base.counts.physicalSurfaces, 24);
  assert.equal(busy.counts.scopedPackages, base.counts.scopedPackages);
  assert.equal(busy.runtime.uniqueLinearMinutes, base.runtime.uniqueLinearMinutes);
});

test('100% participation is computed per point without dividing flow by eight or eighty', () => {
  const result = computeContentPlan({ guidedParticipation: 100, independentParticipation: 100 });
  assert.equal(result.capacity.demandPerPointPerHour, 800);
  assert.equal(result.capacity.meanStationsPerPoint, 7);
  assert.equal(result.capacity.groupStationsPerPoint, 5);
  assert.equal(result.capacity.requiredStationsPerPoint, 7);
  assert.equal(result.counts.interactiveStations, 168);
  assert.equal(result.counts.physicalSurfaces, 248);
});

test('zero flows preserve the base equipment of the planned interactive installations', () => {
  const result = computeContentPlan({ guidedFlow: 0, independentFlow: 0 });
  assert.equal(result.valid, true);
  assert.equal(result.flows.totalOccupancy, 0);
  assert.equal(result.capacity.meanStationsPerPoint, 0);
  assert.equal(result.capacity.groupStationsPerPoint, 0);
  assert.equal(result.capacity.requiredStationsPerPoint, 1);
  assert.equal(result.counts.interactiveStations, 24);
  assert.equal(result.counts.duplicateInteractiveStations, 0);
  assert.equal(result.counts.physicalSurfaces, 104);
  assert.equal(result.counts.totalInstallations, 84);
  assert.equal(result.counts.scopedPackages, 85);
  assert.ok(finite(result));
});

test('explicit zero minimum is a load-only mode, without claiming baseline provision', () => {
  const result = computeContentPlan({ guidedFlow: 0, independentFlow: 0, minimumStationsPerInteractive: 0 });
  assert.equal(result.capacity.requiredStationsPerPoint, 0);
  assert.equal(result.counts.interactiveStations, 0);
  assert.equal(result.counts.duplicateInteractiveStations, null);
  assert.ok(warning(result, 'no_installation_minimum'));
  assert.ok(finite(result));
});

test('group batches use the assigned interactive stop, not the old average point budget', () => {
  const twoWaves = computeContentPlan({ independentFlow: 0, interactiveStopMinutes: 4.5 });
  assert.equal(twoWaves.capacity.meanStationsPerPoint, 1);
  assert.equal(twoWaves.capacity.groupStationsPerPoint, 1);
  assert.equal(twoWaves.capacity.requiredStationsPerPoint, 1);
  assert.equal(twoWaves.capacity.batchDurationMinutes, 4.5);
  const tight = computeContentPlan({ interactiveStopMinutes: 1 });
  assert.equal(tight.capacity.groupStationsPerPoint, null);
  assert.equal(tight.capacity.batchFitsStop, false);
  close(tight.route.effectiveInteractiveStopMinutes, 2.25);
  assert.equal(tight.route.feasible, false);
  assert.ok(warning(tight, 'interactive_stop_too_short'));
});

test('an extra hero minute adds eight route minutes and does not alter hardware', () => {
  const base = computeContentPlan();
  const longer = computeContentPlan({ heroMinutes: 6 });
  assert.equal(longer.route.totalMinutes, 248);
  assert.equal(longer.route.overrunMinutes, 8);
  assert.equal(longer.route.minimumGuidedOccupancy, 1240);
  assert.equal(longer.route.minimumTotalOccupancy, 2240);
  assert.equal(longer.route.feasible, false);
  assert.equal(longer.runtime.uniqueLinearMinutes - base.runtime.uniqueLinearMinutes, 8);
  assert.equal(longer.runtime.uniqueChannelMinutes - base.runtime.uniqueChannelMinutes, 24);
  assert.equal(longer.counts.physicalSurfaces, base.counts.physicalSurfaces);
  assert.ok(warning(longer, 'route_exceeds_visit'));
  assert.equal(base.sensitivities.oneExtraHeroMinute.routeMinutes, 8);
});

test('six-minute hero and twelve common minutes expose the 250-minute route', () => {
  const result = computeContentPlan({ heroMinutes: 6, commonRouteMinutes: 12, commonMinutesPerPackage: 3 });
  assert.equal(result.route.totalMinutes, 250);
  assert.equal(result.route.overrunMinutes, 10);
  assert.equal(result.runtime.uniqueLinearMinutes, 124);
  assert.equal(result.runtime.uniqueChannelMinutes, 220);
  assert.ok(warning(result, 'route_exceeds_visit'));
});

test('mirrored hero screens do not create new videos or channels', () => {
  const unique = computeContentPlan();
  const mirror = computeContentPlan({ heroChannelMode: 'mirror' });
  assert.equal(unique.counts.physicalSurfaces, mirror.counts.physicalSurfaces);
  assert.equal(unique.counts.digitalPackages, mirror.counts.digitalPackages);
  assert.equal(mirror.runtime.uniqueLinearMinutes, 114);
  assert.equal(mirror.runtime.uniqueChannelMinutes, 114);
  assert.equal(unique.runtime.linearMasterChannels, 60);
  assert.equal(mirror.runtime.linearMasterChannels, 44);
  const moreMirrors = computeContentPlan({ heroChannelMode: 'mirror', heroSurfacesPerInstallation: 5 });
  assert.equal(moreMirrors.counts.physicalSurfaces - mirror.counts.physicalSurfaces, 16);
  assert.equal(moreMirrors.runtime.uniqueChannelMinutes, mirror.runtime.uniqueChannelMinutes);
});

test('languages and delivery versions multiply deliveries, never stories or screens', () => {
  const result = computeContentPlan({ languageCount: 3, deliveryVersions: 2 });
  assert.equal(result.counts.digitalPackages, 69);
  assert.equal(result.counts.scopedPackages, 85);
  assert.equal(result.counts.physicalSurfaces, 152);
  assert.equal(result.runtime.uniqueLinearMinutes, 114);
  assert.equal(result.runtime.uniqueChannelMinutes, 194);
  assert.equal(result.delivery.digitalPackageSets, 414);
  assert.equal(result.delivery.objectPackageSets, 96);
  assert.equal(result.delivery.scopedPackageSets, 510);
  assert.equal(result.delivery.linearChannelMinutes, 1164);
});

test('shared application templates are not counted again as additional content packages', () => {
  const templates = computeContentPlan();
  const separate = computeContentPlan({ interactiveApplicationMode: 'unique-per-point' });
  assert.equal(templates.content.interactiveApplications, 3);
  assert.equal(separate.content.interactiveApplications, 24);
  assert.equal(templates.content.interactiveContentPackages, 24);
  assert.equal(separate.content.interactiveContentPackages, 24);
  assert.equal(templates.counts.scopedPackages, separate.counts.scopedPackages);
  assert.equal(templates.counts.physicalSurfaces, separate.counts.physicalSurfaces);
});

test('turning object editorial scope off does not delete physical installations', () => {
  const result = computeContentPlan({ objectContentInScope: false });
  assert.equal(result.counts.totalInstallations, 84);
  assert.equal(result.counts.objectPackages, 16);
  assert.equal(result.counts.scopedObjectPackages, 0);
  assert.equal(result.counts.scopedPackages, 69);
  assert.equal(result.counts.allPotentialPackages, 85);
  assert.equal(result.counts.physicalSurfaces, 152);
});

test('explicit content reuse changes the content register without silently removing equipment', () => {
  const result = computeContentPlan({
    heroUniqueShowCount: 4, mediaUniqueProgramCount: 8,
    interactiveContentPackageCount: 3, objectContentInScope: false,
  });
  assert.equal(result.counts.physicalSurfaces, 152);
  assert.equal(result.counts.totalInstallations, 84);
  assert.equal(result.counts.digitalPackages, 20);
  assert.equal(result.runtime.uniqueLinearMinutes, 46);
  assert.equal(result.route.totalMinutes, 240);
});

test('changing dwell time changes occupancy, not the content or hourly throughput demand', () => {
  const a = computeContentPlan();
  const b = computeContentPlan({ independentMinutes: 240 });
  assert.equal(a.flows.totalOccupancy, 2200);
  assert.equal(b.flows.totalOccupancy, 3200);
  assert.equal(b.capacity.demandPerPointPerHour, a.capacity.demandPerPointPerHour);
  assert.equal(b.counts.physicalSurfaces, a.counts.physicalSurfaces);
  assert.equal(b.counts.scopedPackages, a.counts.scopedPackages);
});

test('area percentages do not become percentages of installation counts', () => {
  const base = computeContentPlan();
  const differentAreas = computeContentPlan({ heroPercent: 20, museumPercent: 40, servicePercent: 30 });
  assert.equal(base.counts.totalInstallations, differentAreas.counts.totalInstallations);
  assert.equal(base.counts.physicalSurfaces, differentAreas.counts.physicalSurfaces);
  assert.equal(base.counts.scopedPackages, differentAreas.counts.scopedPackages);
  assert.notEqual(base.areas.heroM2, differentAreas.areas.heroM2);
  close(base.areas.commonM2 + base.areas.heroM2 + base.areas.museumM2
    + base.areas.serviceM2 + base.areas.reserveM2, 18884.055);
  close(base.areas.interactiveM2 + base.areas.mediaM2 + base.areas.objectM2
    + base.areas.museumUnallocatedM2, base.areas.museumM2);
});

test('Figma/model difference is unresolved scope, not an extra free reserve', () => {
  const result = computeContentPlan();
  const r = result.areas.sourceReconciliation;
  assert.equal(r.figmaTerritoriesM2 + r.figmaCommonM2, r.figmaTotalM2);
  close(r.figmaTotalM2 + r.modelDifferenceM2, result.areas.totalM2);
  assert.equal(r.status, 'unreconciled');
  assert.notEqual(r.modelDifferenceM2, result.areas.reserveM2);
  assert.ok(warning(result, 'area_sources_unreconciled'));
});

test('RGO reported zones and exhibits never silently add to the proposed register', () => {
  const result = computeContentPlan({ rgoScope: 'additional' });
  const rgo = result.unknownScope.find(item => item.id === 'rgo');
  assert.equal(rgo.reportedZones, 9);
  assert.equal(rgo.reportedExhibitsAtLeast, 45);
  assert.equal(rgo.reportedAreaM2, 1400);
  assert.equal(rgo.automaticallyAdded, false);
  assert.equal(result.counts.totalInstallations, 84);
  assert.equal(result.counts.physicalSurfaces, 152);
});

test('station needs round upward per location before totaling', () => {
  const result = computeContentPlan({ guidedFlow: 0, independentFlow: 10, minimumStationsPerInteractive: 0 });
  assert.equal(result.capacity.demandPerPointPerHour, 4);
  assert.equal(result.capacity.requiredStationsPerPoint, 1);
  assert.equal(result.counts.interactiveStations, 24);
  const incorrectPooled = Math.ceil(24 * 4 / 128);
  assert.equal(incorrectPooled, 1);
  assert.notEqual(result.counts.interactiveStations, incorrectPooled);
});

test('interactive and navigation cycles are excluded from linear video minutes', () => {
  const a = computeContentPlan();
  const b = computeContentPlan({ experienceMinutes: 4, navigationSurfaces: 50 });
  assert.equal(b.runtime.uniqueLinearMinutes, a.runtime.uniqueLinearMinutes);
  assert.equal(b.runtime.uniqueChannelMinutes, a.runtime.uniqueChannelMinutes);
  assert.equal(b.runtime.interactiveRuntimeIncludedInLinearTotal, false);
  assert.equal(b.runtime.navigationRuntimeIncludedInLinearTotal, false);
});

test('empty interactive category does not keep phantom station copies', () => {
  const result = computeContentPlan({ interactivePointsPerDistrict: 0 });
  assert.equal(result.valid, true);
  assert.equal(result.counts.interactiveInstallations, 0);
  assert.equal(result.counts.interactiveStations, 0);
  assert.equal(result.capacity.requiredStationsPerPoint, 0);
  assert.equal(result.content.interactiveApplications, 0);
  assert.equal(result.content.interactiveContentPackages, 0);
});

test('validation rejects impossible numbers and percentages without nonfinite results', () => {
  const cases = [
    { heroPercent: 70, museumPercent: 30, servicePercent: 30 },
    { interactiveMuseumPercent: 90, mediaMuseumPercent: 30 },
    { languageCount: 0 }, { deliveryVersions: 1.5 }, { usersPerStation: 0 },
    { groupSize: 0 }, { guidedParticipation: 101 }, { independentFlow: -1 },
    { experienceMinutes: 0, turnoverSeconds: 0 }, { commonArea: 18885 },
    { heroChannelMode: 'unknown' }, { objectContentInScope: 'false' },
    { heroPointsPerDistrict: 0, interactivePointsPerDistrict: 0, mediaPointsPerDistrict: 0, objectPointsPerDistrict: 0 },
    { independentFlow: Infinity }, { independentFlow: NaN }, { independentFlow: 1e308 },
  ];
  for (const input of cases) {
    const result = computeContentPlan(input);
    assert.equal(result.valid, false, JSON.stringify(input));
    assert.equal(result.counts, null);
    assert.ok(finite(result));
  }
  assert.equal(validateContentInput({ guidedFlow: '300' }).valid, true);
  assert.equal(validateContentInput({ guidedFlow: '' }).valid, false);
  assert.equal(computeContentPlan(null).valid, false);
});

test('model is pure and the default matrix remains unchanged after scenarios', () => {
  const before = JSON.stringify(CONTENT_DEFAULTS);
  const input = { independentFlow: 670, languageCount: 2 };
  const inputBefore = JSON.stringify(input);
  assert.deepEqual(computeContentPlan(input), computeContentPlan(input));
  assert.equal(JSON.stringify(input), inputBefore);
  assert.equal(JSON.stringify(CONTENT_DEFAULTS), before);
});
