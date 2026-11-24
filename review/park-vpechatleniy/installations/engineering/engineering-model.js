import { CONTENT_DEFAULTS, computeContentPlan } from '../content-model.js';
import { computeScreenScenario, countsFromContentModel, DEFAULT_SCREEN_INPUT, SCREEN_CATEGORY_KEYS, validateScreenInput } from './screen-model.js';
import { computeLedPlan } from './led-model.js?v=20261124-led-zones1';

export const AUXILIARY_DEFAULTS = Object.freeze({ stationComputer:180, heroServer:600, commonServer:400, mediaPlayer:25, navigationPlayer:15, zoneSwitch:80, coreControl:600 });
export const AUXILIARY_LABELS = Object.freeze({ stationComputer:'Вычислитель интерактивной станции', heroServer:'Сервер главного шоу', commonServer:'Сервер общей инсталляции', mediaPlayer:'Медиаплеер медийной точки', navigationPlayer:'Плеер навигации', zoneSwitch:'Коммутация и управление территории', coreControl:'Центральное управление' });

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const issue = (field, message) => ({ field, message });
const invalid = (errors, details = {}) => ({
  valid:false, errors, content:null, screen:null, auxiliaryGroups:[], auxiliaryBudgets:null,
  reservePercent:null, reservedBudgetW:null, distribution:null, input:null, led:null, ...details,
});

// Zero devices consume zero even when a unit budget is unknown. A present device
// with an unknown budget makes the group total unknown; it never becomes zero.
function sumLoads(loads) {
  let partialKnownW = 0, unknownDeviceCount = 0;
  for (const { count, budgetInputW } of loads) {
    if (count === 0) continue;
    if (budgetInputW === null) unknownDeviceCount += count;
    else partialKnownW += count * budgetInputW;
  }
  return { partialKnownW, unknownDeviceCount, totalW:unknownDeviceCount ? null : partialKnownW };
}

export function computeEngineering(overrides = {}) {
  if (!isRecord(overrides)) return invalid([issue('input', 'Параметры должны быть объектом.')]);
  const inputErrors = [];
  for (const key of ['flow', 'types', 'auxiliaryBudgets']) {
    if (Object.hasOwn(overrides, key) && overrides[key] !== undefined && !isRecord(overrides[key])) {
      inputErrors.push(issue(key, 'Параметры должны быть объектом. Неизвестную мощность задайте null у конкретного прибора.'));
    }
  }
  if (inputErrors.length) return invalid(inputErrors);

  const flow = { ...CONTENT_DEFAULTS, ...overrides.flow };
  const content = computeContentPlan(flow);
  if (!content.valid) return invalid(content.errors, { content });
  const c = content.counts;
  const auxiliaryBudgets = { ...AUXILIARY_DEFAULTS, ...overrides.auxiliaryBudgets };
  const reservePercent = Object.hasOwn(overrides, 'reservePercent') ? overrides.reservePercent : 20;
  const errors = [];
  if (!Number.isFinite(reservePercent) || reservePercent < 0 || reservePercent > 100) {
    errors.push(issue('reservePercent', 'Резерв должен быть от 0 до 100%.'));
  }
  for (const key of Object.keys(AUXILIARY_DEFAULTS)) {
    const value = auxiliaryBudgets[key];
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      errors.push(issue(`auxiliaryBudgets.${key}`, 'Введите конечную неотрицательную мощность в ваттах или оставьте значение неизвестным.'));
    }
  }
  if (errors.length) return invalid(errors, { content, auxiliaryBudgets, reservePercent });

  const groups = [
    ['stationComputer', c.interactiveStations], ['heroServer', c.heroInstallations],
    ['commonServer', c.commonInstallations], ['mediaPlayer', c.mediaInstallations],
    ['navigationPlayer', c.navigationSurfaces], ['zoneSwitch', 8], ['coreControl', 1],
  ].map(([key, count]) => ({ key, label:AUXILIARY_LABELS[key], count, budgetInputW:auxiliaryBudgets[key] }));

  const counts = countsFromContentModel(content);
  const useLed = overrides.led !== undefined && overrides.led !== null;
  let led = null, screenTypes = overrides.types, targetTypes = null;
  if (useLed) {
    for (const key of SCREEN_CATEGORY_KEYS) {
      if (Object.hasOwn(overrides.types??{},key) && !isRecord(overrides.types[key])) {
        return invalid([issue(`types.${key}`,'Параметры типа LED должны быть объектом.')],{content});
      }
    }
    targetTypes = Object.fromEntries(SCREEN_CATEGORY_KEYS.map(key => [key, {
      ...DEFAULT_SCREEN_INPUT.types[key], ...overrides.types?.[key],
    }]));
    const targetValidation = validateScreenInput({ counts, types:targetTypes, auxiliaryEquipment:[], powerScopeComplete:false });
    if (!targetValidation.valid) return invalid(targetValidation.errors, { content });
    led = computeLedPlan({ counts, types:targetTypes, config:overrides.led });
    const targetInput = { flow:content.input, types:targetTypes, auxiliaryBudgets, reservePercent, led:led.config };
    if (!led.valid) return invalid(led.errors, { content, led, input:targetInput });
    // Quantise the range scenarios too; never compare a cabinet-rounded result
    // against silently continuous LCD/projection dimensions.
    const ranges = {};
    for (const [name, field] of [['lower','minDimensionsM'], ['upper','maxDimensionsM']]) {
      const rangeTypes = Object.fromEntries(SCREEN_CATEGORY_KEYS.map(key => [key, {
        widthM:targetTypes[key][field]?.[0] ?? null,
        heightM:targetTypes[key][field]?.[1] ?? null,
      }]));
      ranges[name] = computeLedPlan({ counts, types:rangeTypes, config:led.config });
      if (!ranges[name].valid) return invalid(ranges[name].errors, { content, led, input:targetInput });
    }
    led.range = ranges;
    screenTypes = Object.fromEntries(SCREEN_CATEGORY_KEYS.map(key => {
      const row=led.rows.find(r=>r.key===key), lower=ranges.lower.rows.find(r=>r.key===key), upper=ranges.upper.rows.find(r=>r.key===key);
      return [key, { ...targetTypes[key], widthM:row.widthM, heightM:row.heightM,
        assumedDeviceBudgetW:row.budgetW,
        minDimensionsM:[lower.widthM,lower.heightM], maxDimensionsM:[upper.widthM,upper.heightM] }];
    }));
  }

  // Guard allocation before Array.from: an arbitrary shared URL must not create
  // millions of per-device records. This is a software limit, not a design norm.
  // An unresolved LED surface gets one explicit unknown assembly record until its
  // cabinet count is known; this is not reported as an exact physical device count.
  const displayRecordCount = led ? led.totals.knownCabinetCount + led.totals.unknownCabinetSurfaceCount : c.physicalSurfaces;
  const anticipatedDeviceCount = displayRecordCount + groups.reduce((sum, group) => sum + group.count, 0);
  if (!Number.isSafeInteger(anticipatedDeviceCount) || anticipatedDeviceCount > 20000) {
    return invalid([issue('equipment', 'Для интерактивного сценария допускается не более 20 000 записей оборудования; уменьшите исходные количества.')], { content, led, auxiliaryGroups:groups, auxiliaryBudgets, reservePercent,
      ...(led ? { input:{flow:content.input,types:targetTypes,auxiliaryBudgets,reservePercent,led:led.config} } : {}) });
  }
  const equipment = groups.flatMap(group => Array.from({ length:group.count }, (_, i) => ({
    id:`aux-${group.key}-${String(i + 1).padStart(3, '0')}`, category:group.key,
    powerBoundary:'AC_input', countAsBuildingLoad:true, budgetInputW:group.budgetInputW,
    maximumInputW:null, operatingInputW:null, status:'assumption',
  })));
  let displayEquipment;
  if (led) {
    const p=led.profile, cabinetArea=p.cabinetWidthM*p.cabinetHeightM;
    const powerPerCabinet=density=>density===null?null:cabinetArea*density;
    displayEquipment=led.rows.flatMap(row=>Array.from({length:row.count},(_,surfaceIndex)=>{
      const surfaceId=`${row.key}-surface-${String(surfaceIndex+1).padStart(3,'0')}`;
      if(row.cabinetsPerSurface===null) return [{
        id:`${surfaceId}-unresolved-led-assembly`,category:row.key,surfaceId,
        powerBoundary:'AC_input',countAsBuildingLoad:true,budgetInputW:null,maximumInputW:null,operatingInputW:null,
        massKg:null,status:'unknown_cabinet_quantity',isUnresolvedAssembly:true,
      }];
      return Array.from({length:row.cabinetsPerSurface},(_,cabinetIndex)=>({
        id:`${surfaceId}-cabinet-${String(cabinetIndex+1).padStart(3,'0')}`,category:row.key,surfaceId,
        cabinetColumn:cabinetIndex%row.columns+1,cabinetRow:Math.floor(cabinetIndex/row.columns)+1,
        profileId:p.id,powerBoundary:'AC_input',countAsBuildingLoad:true,
        budgetInputW:powerPerCabinet(p.budgetDensityWm2),maximumInputW:powerPerCabinet(p.maximumDensityWm2),
        operatingInputW:null,publishedAverageInputW:powerPerCabinet(p.averageDensityWm2),massKg:p.massKg,
        mounting:null,model:p.label,status:p.status,
        maximumEvidence:'published_series_upper_bound_not_delivery_passport',
        sourceUrl:p.maximumDensityWm2===null?p.sourceUrl:(p.manufacturerUrl??p.sourceUrl),
      }));
    }).flat());
  }
  const screen = computeScreenScenario({
    counts, types:screenTypes, auxiliaryEquipment:equipment,
    ...(led ? { equipment:displayEquipment } : {}),
    powerScopeComplete:false,
    missingPowerSubsystems:[...(led?['внешние LED-процессоры и дополнительные контроллеры']:[]),'звук', 'эффекты и приводы экспонатов', 'выставочный свет', 'HVAC', 'лифты и монорельс'],
  });
  const input = { flow:content.input, types:led?targetTypes:(screen.input?.types ?? null), auxiliaryBudgets, reservePercent,
    ...(led?{led:led.config}:{}) };
  // Invalid screen inputs have no categories/power. Do not dereference them or
  // return a distribution made from stale/default values.
  if (!screen.valid) return invalid(screen.errors ?? [], { content, screen, led, auxiliaryGroups:groups, auxiliaryBudgets, reservePercent, input });
  if (led) {
    for (const category of screen.categories) {
      const row=led.rows.find(r=>r.key===category.key);
      Object.assign(category, { targetWidthM:row.targetWidthM,targetHeightM:row.targetHeightM,
        cabinetsPerSurface:row.cabinetsPerSurface,totalCabinets:row.totalCabinets,pixelWidth:row.pixelWidth,pixelHeight:row.pixelHeight,
        massKg:row.massKg,totalMassKg:row.totalMassKg,maximumInputW:row.maximumW,publishedAverageInputW:row.averageW,
        maximumEvidence:led.maximumEvidence });
    }
    screen.range.status='cabinet_rounded_size_scenarios_not_confidence_interval';
    screen.power.generationAssumption='individual_led_cabinets_plus_listed_auxiliary';
    screen.power.physicalEquipmentCount=led.totals.unknownCabinetSurfaceCount?null:anticipatedDeviceCount;
    screen.power.unresolvedAssemblyCount=led.totals.unknownCabinetSurfaceCount;
    screen.power.maximum.evidence=led.maximumEvidence;
    screen.warnings.push(...led.warnings);
  }

  const totalW = screen.power.budget.totalW;
  const reservedBudgetW = totalW === null ? null : totalW * (1 + reservePercent / 100);
  if (reservedBudgetW !== null && !Number.isFinite(reservedBudgetW)) {
    return invalid([issue('reservePercent', 'Расчёт мощности с резервом выходит за числовой диапазон.')], { content, screen, led, auxiliaryGroups:groups, auxiliaryBudgets, reservePercent, input });
  }
  const byType = Object.fromEntries(screen.categories.map(row => [row.key, row]));
  const displayLoad = key => ({ count:byType[key].count, budgetInputW:byType[key].assumedDeviceBudgetW });
  const auxiliaryLoad = key => groups.find(group => group.key === key);
  const territorial = sumLoads([
    ...['hero', 'interactive', 'media'].map(displayLoad),
    ...(led&&c.objectSurfaces?[{count:c.objectSurfaces,budgetInputW:null}]:[]),
    ...['stationComputer', 'heroServer', 'mediaPlayer', 'zoneSwitch'].map(auxiliaryLoad),
  ]);
  const common = sumLoads([displayLoad('common'), auxiliaryLoad('commonServer')]);
  const navigation = sumLoads([displayLoad('navigation'), auxiliaryLoad('navigationPlayer')]);
  const core = sumLoads([auxiliaryLoad('coreControl')]);
  const zoneW = territorial.totalW === null ? null : territorial.totalW / 8;
  const commonPerFloorW = common.totalW === null ? null : common.totalW / 2;
  const navigationPerFloorW = navigation.totalW === null ? null : navigation.totalW / 2;
  const floorW = zoneW === null || commonPerFloorW === null || navigationPerFloorW === null
    ? null : zoneW * 4 + commonPerFloorW + navigationPerFloorW;

  return {
    valid:true, errors:[], content, screen, led, auxiliaryGroups:groups, auxiliaryBudgets,
    reservePercent, reservedBudgetW,
    distribution:{
      status:'proposed_equal_4_territories_per_level', zoneW, commonPerFloorW,
      navigationPerFloorW, floorW, coreW:core.totalW,
      linkedToPlacementPlan:false,
    },
    input,
  };
}
