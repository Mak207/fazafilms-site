import { CONTENT_DEFAULTS, computeContentPlan } from '../content-model.js';
import { computeScreenScenario, countsFromContentModel } from './screen-model.js';

export const AUXILIARY_DEFAULTS = Object.freeze({ stationComputer:180, heroServer:600, commonServer:400, mediaPlayer:25, navigationPlayer:15, zoneSwitch:80, coreControl:600 });
export const AUXILIARY_LABELS = Object.freeze({ stationComputer:'Вычислитель интерактивной станции', heroServer:'Сервер главного шоу', commonServer:'Сервер общей инсталляции', mediaPlayer:'Медиаплеер медийной точки', navigationPlayer:'Плеер навигации', zoneSwitch:'Коммутация и управление территории', coreControl:'Центральное управление' });

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const issue = (field, message) => ({ field, message });
const invalid = (errors, details = {}) => ({
  valid:false, errors, content:null, screen:null, auxiliaryGroups:[], auxiliaryBudgets:null,
  reservePercent:null, reservedBudgetW:null, distribution:null, input:null, ...details,
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

  // Guard allocation before Array.from: an arbitrary shared URL must not create
  // millions of per-device records. This is a software limit, not a design norm.
  const anticipatedDeviceCount = c.physicalSurfaces + groups.reduce((sum, group) => sum + group.count, 0);
  if (!Number.isSafeInteger(anticipatedDeviceCount) || anticipatedDeviceCount > 20000) {
    return invalid([issue('equipment', 'Для интерактивного сценария допускается не более 20 000 записей оборудования; уменьшите исходные количества.')], { content, auxiliaryGroups:groups, auxiliaryBudgets, reservePercent });
  }
  const equipment = groups.flatMap(group => Array.from({ length:group.count }, (_, i) => ({
    id:`aux-${group.key}-${String(i + 1).padStart(3, '0')}`, category:group.key,
    powerBoundary:'AC_input', countAsBuildingLoad:true, budgetInputW:group.budgetInputW,
    maximumInputW:null, operatingInputW:null, status:'assumption',
  })));
  const screen = computeScreenScenario({
    counts:countsFromContentModel(content), types:overrides.types, auxiliaryEquipment:equipment,
    powerScopeComplete:false,
    missingPowerSubsystems:['звук', 'эффекты и приводы экспонатов', 'выставочный свет', 'HVAC', 'лифты и монорельс'],
  });
  const input = { flow:content.input, types:screen.input?.types ?? null, auxiliaryBudgets, reservePercent };
  // Invalid screen inputs have no categories/power. Do not dereference them or
  // return a distribution made from stale/default values.
  if (!screen.valid) return invalid(screen.errors ?? [], { content, screen, auxiliaryGroups:groups, auxiliaryBudgets, reservePercent, input });

  const totalW = screen.power.budget.totalW;
  const reservedBudgetW = totalW === null ? null : totalW * (1 + reservePercent / 100);
  if (reservedBudgetW !== null && !Number.isFinite(reservedBudgetW)) {
    return invalid([issue('reservePercent', 'Расчёт мощности с резервом выходит за числовой диапазон.')], { content, screen, auxiliaryGroups:groups, auxiliaryBudgets, reservePercent, input });
  }
  const byType = Object.fromEntries(screen.categories.map(row => [row.key, row]));
  const displayLoad = key => ({ count:byType[key].count, budgetInputW:byType[key].assumedDeviceBudgetW });
  const auxiliaryLoad = key => groups.find(group => group.key === key);
  const territorial = sumLoads([
    ...['hero', 'interactive', 'media'].map(displayLoad),
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
    valid:true, errors:[], content, screen, auxiliaryGroups:groups, auxiliaryBudgets,
    reservePercent, reservedBudgetW,
    distribution:{
      status:'proposed_equal_4_territories_per_level', zoneW, commonPerFloorW,
      navigationPerFloorW, floorW, coreW:core.totalW,
      linkedToPlacementPlan:false,
    },
    input,
  };
}
