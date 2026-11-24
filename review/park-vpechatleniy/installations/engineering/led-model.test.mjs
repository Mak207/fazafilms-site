import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LED_CONFIG, LED_PROFILES, computeLedPlan } from './led-model.js';
import { computeEngineering } from './engineering-model.js';
import { DEFAULT_SCREEN_INPUT } from './screen-model.js';

const near=(actual,expected,tolerance=1e-6)=>assert(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const withLed=extra=>computeEngineering({led:DEFAULT_LED_CONFIG,...extra});

test('baseline uses whole cabinets, exact pixel maps and source-qualified series data',()=>{
  const plan=computeLedPlan();
  assert(plan.valid);
  assert.equal(plan.totals.surfaceCount,152);
  assert.equal(plan.totals.cabinetCount,2352);
  near(plan.totals.totalAreaM2,489.065472);
  near(plan.totals.totalMassKg,20697.6);
  near(plan.totals.totalMaximumW,317892.5568);
  near(plan.totals.totalAverageW,158946.2784);
  assert.deepEqual(plan.rows.map(r=>[r.key,r.columns,r.rows]),[
    ['hero',7,7],['interactive',3,3],['media',3,3],['common',4,4],['navigation',2,2],
  ]);
  const hero=plan.rows[0];
  assert.deepEqual([hero.pixelWidth,hero.pixelHeight],[2688,1512]);
  assert.equal(hero.targetWidthM,4);near(hero.widthM,4.256);
  assert.match(plan.maximumEvidence,/not_delivery_passport/);
  assert(LED_PROFILES.every(p=>Array.isArray(p.notes)&&p.serviceLabel&&p.sourceUrl));
});

test('nearest and ceil differ only by explicit grid policy, including exact boundaries',()=>{
  const types={hero:{widthM:.608*3,heightM:.342*2}};
  let plan=computeLedPlan({counts:{hero:1},types,config:{...DEFAULT_LED_CONFIG,rounding:'ceil'}});
  assert(plan.valid);assert.equal(plan.rows[0].columns,3);assert.equal(plan.rows[0].rows,2);
  types.hero.widthM+=1e-6;
  const nearest=computeLedPlan({counts:{hero:1},types});
  plan=computeLedPlan({counts:{hero:1},types,config:{...DEFAULT_LED_CONFIG,rounding:'ceil'}});
  assert.equal(nearest.rows[0].columns,3);assert.equal(plan.rows[0].columns,4);
  assert(plan.rows[0].widthM>=types.hero.widthM);
  const small=computeLedPlan({counts:{hero:1},types:{hero:{widthM:.1,heightM:.1}}});
  assert.equal(small.rows[0].cabinetsPerSurface,1);
});

test('engineering preserves targets while actual geometry, BDM and ranges use LED dimensions',()=>{
  const result=withLed();
  assert(result.valid);assert.deepEqual(result.input.led,DEFAULT_LED_CONFIG);
  assert.equal(result.input.types.hero.widthM,4);near(result.screen.input.types.hero.widthM,4.256);
  near(result.screen.input.types.hero.heightM,2.394);
  near(result.screen.categories[0].bdm.maxDistanceM,200*.03*2.394);
  near(result.screen.range.lower.totalActiveAreaM2,result.led.range.lower.totals.totalAreaM2);
  near(result.screen.range.upper.totalActiveAreaM2,result.led.range.upper.totals.totalAreaM2);
  near(result.screen.range.lower.totalActiveAreaM2,243.700992);
  assert.match(result.screen.range.status,/cabinet_rounded/);
  const roundtrip=computeEngineering(JSON.parse(JSON.stringify(result.input)));
  assert(roundtrip.valid);assert.equal(roundtrip.led.totals.cabinetCount,2352);
  assert.equal(roundtrip.input.types.hero.widthM,4);
});

test('one record per cabinet, shared surface IDs and auxiliary devices are not duplicated',()=>{
  const result=withLed(),equipment=result.screen.equipment;
  assert.equal(result.screen.totals.surfaceCount,152);
  assert.equal(equipment.length,2489);assert.equal(result.screen.power.physicalEquipmentCount,2489);
  assert.equal(new Set(equipment.map(e=>e.id)).size,2489);
  const cabinets=equipment.filter(e=>e.profileId);
  assert.equal(cabinets.length,2352);assert.equal(new Set(cabinets.map(e=>e.surfaceId)).size,152);
  assert.equal(cabinets.filter(e=>e.surfaceId==='hero-surface-001').length,49);
  near(cabinets[0].maximumInputW,.608*.342*650);assert.equal(cabinets[0].massKg,8.8);
  assert.equal(cabinets[0].operatingInputW,null);
  near(result.screen.power.budget.totalW,339472.5568);
  near(result.reservedBudgetW,407367.06816);
  assert.equal(result.screen.power.maximum.totalW,null);assert.equal(result.screen.power.maximum.unknownCount,137);
  assert.equal(result.screen.power.fullParkMaximumW,null);
  near(result.distribution.floorW*2+result.distribution.coreW,result.screen.power.budget.totalW);
  const doubled=withLed({flow:{surfacesPerInteractiveStation:2}});
  assert.equal(doubled.content.counts.interactiveSurfaces,144);
  assert.equal(doubled.auxiliaryGroups.find(g=>g.key==='stationComputer').count,72);
  assert.equal(doubled.auxiliaryGroups.find(g=>g.key==='heroServer').count,8);
  assert.equal(doubled.auxiliaryGroups.find(g=>g.key==='commonServer').count,4);
});

test('flow cliff rebuilds cabinet counts, PC counts, area and power together',()=>{
  const before=withLed({flow:{independentFlow:660}}),after=withLed({flow:{independentFlow:670}});
  assert(before.valid&&after.valid);
  assert.equal(before.led.totals.cabinetCount,2352);
  assert.equal(after.led.totals.cabinetCount,2568);
  assert.equal(after.screen.totals.surfaceCount,176);
  assert.equal(after.screen.equipment.length,2729);
  near(after.screen.power.budget.totalW-before.screen.power.budget.totalW,24*9*.608*.342*650+24*180);
  const dwell=withLed({flow:{independentMinutes:180}});
  assert.equal(dwell.led.totals.cabinetCount,2352);
  near(dwell.screen.power.budget.totalW,339472.5568);
  assert.notEqual(dwell.content.flows.totalOccupancy,before.content.flows.totalOccupancy);
});

test('unverified supplier profile has a budget but no invented maximum or average',()=>{
  const led={profileId:'displayrent-uhp-19-unverified',rounding:'nearest'};
  const result=withLed({led});assert(result.valid);
  assert.equal(result.led.profile.sourceConflict,true);
  assert.equal(result.led.totals.totalMaximumW,null);assert.equal(result.led.totals.totalAverageW,null);
  assert.equal(result.led.totals.totalBudgetW,136320);
  assert.equal(result.screen.power.budget.totalW,157900);
  assert.equal(result.screen.power.maximum.totalW,null);
  assert(result.screen.equipment.filter(e=>e.profileId).every(e=>e.maximumInputW===null));
});

test('unknown dimension propagates without hiding the presence of an unresolved assembly',()=>{
  const result=withLed({types:{hero:{widthM:null}}});assert(result.valid);
  assert.equal(result.input.types.hero.widthM,null);
  for(const key of ['cabinetCount','totalAreaM2','totalMassKg','totalMaximumW','totalAverageW','totalBudgetW'])assert.equal(result.led.totals[key],null,key);
  assert.equal(result.led.totals.unknownCabinetSurfaceCount,24);
  assert.equal(result.screen.power.physicalEquipmentCount,null);
  assert.equal(result.screen.power.unresolvedAssemblyCount,24);
  assert.equal(result.screen.power.budget.totalW,null);assert.equal(result.reservedBudgetW,null);
  assert.equal(result.distribution.floorW,null);
  assert(result.distribution.commonPerFloorW>0);
  assert.equal(result.screen.equipment.filter(e=>e.isUnresolvedAssembly).length,24);
});

test('zero count contributes zero despite unknown geometry or supplier maximum',()=>{
  const result=computeLedPlan({counts:{hero:0},types:{hero:{widthM:null,heightM:null}},config:{profileId:'displayrent-uhp-19-unverified'}});
  assert(result.valid);
  for(const key of ['cabinetCount','totalAreaM2','totalMassKg','totalMaximumW','totalAverageW','totalBudgetW'])assert.equal(result.totals[key],0,key);
  const integrated=withLed({flow:{heroPointsPerDistrict:0},types:{hero:{widthM:null,heightM:null}}});
  assert(integrated.valid);assert.equal(integrated.led.totals.unknownCabinetSurfaceCount,0);
  assert(Number.isFinite(integrated.screen.power.budget.totalW));
});

test('unassigned object surfaces remain unknown, not silently mapped to another LED type',()=>{
  const result=withLed({flow:{objectSurfacesPerInstallation:1}});assert(result.valid);
  assert.equal(result.screen.totals.surfaceCount,168);
  assert.equal(result.led.totals.surfaceCount,168);assert.equal(result.led.totals.cabinetCount,null);
  assert.equal(result.led.totals.unknownCabinetSurfaceCount,16);
  assert.equal(result.screen.power.budget.totalW,null);assert.equal(result.distribution.floorW,null);
});

test('software guard uses cabinet count before allocating the registry',()=>{
  const result=withLed({types:{hero:{widthM:100,heightM:100}}});
  assert.equal(result.valid,false);assert.equal(result.screen,null);
  assert(result.errors.some(e=>e.field==='equipment'));
  assert(result.led.totals.cabinetCount>20000);
  assert.equal(result.input.types.hero.widthM,100);
});

test('invalid inputs fail cleanly and pure calculation does not mutate its inputs',()=>{
  for(const input of [null,[],{counts:null},{counts:{hero:null}},{counts:{hero:-1}},{counts:{hero:1.2}},
    {config:{profileId:'missing'}},{config:{rounding:'floor'}},{types:{hero:null}},
    ...[0,-1,NaN,Infinity,1e308].map(widthM=>({types:{hero:{widthM}}}))]){
    let result;assert.doesNotThrow(()=>{result=computeLedPlan(input);});assert.equal(result.valid,false);
  }
  const types=structuredClone(DEFAULT_SCREEN_INPUT.types),snapshot=structuredClone(types);
  computeLedPlan({types});assert.deepEqual(types,snapshot);
  assert.equal(withLed({led:[]}).valid,false);
  assert.equal(withLed({types:{hero:'invalid'}}).valid,false);
  assert.equal(withLed({reservePercent:null}).valid,false);
});

test('no LED config retains the original public model and manual budgets',()=>{
  const manual=computeEngineering(),disabled=computeEngineering({led:null});
  assert(manual.valid&&disabled.valid);assert.equal(manual.led,null);
  assert.equal(manual.screen.equipment.length,289);assert.equal(manual.screen.power.budget.totalW,79820);
  near(manual.screen.totals.totalActiveAreaM2,419.0491047653829);
  assert.equal(disabled.screen.power.budget.totalW,79820);
  assert.equal(Object.hasOwn(manual.input,'led'),false);
});
