import { AREA, computePark } from '../calculator/model.js';

/**
 * Proposed installation/content register. Counts are deliberately independent
 * of area percentages. Physical surfaces, simultaneous stations, unique content
 * packages, reusable applications and delivery versions are different units.
 */
export { AREA };

export const CONTENT_DEFAULTS = Object.freeze({
  heroPointsPerDistrict: 1,
  interactivePointsPerDistrict: 3,
  mediaPointsPerDistrict: 4,
  objectPointsPerDistrict: 2,
  commonInstallations: 4,
  commonPackages: 4,
  commonSurfaces: 12,
  navigationSurfaces: 12,
  navigationSystems: 1,
  heroSurfacesPerInstallation: 3,
  mediaSurfacesPerInstallation: 1,
  objectSurfacesPerInstallation: 0,
  surfacesPerInteractiveStation: 1,
  minimumStationsPerInteractive: 1,
  heroChannelMode: 'unique',
  interactiveApplicationMode: 'shared-by-type',
  objectContentInScope: true,
  // null = one unique regional package per corresponding installation.
  heroUniqueShowCount: null,
  mediaUniqueProgramCount: null,
  interactiveContentPackageCount: null,
  objectEditorialPackageCount: null,
  languageCount: 1,
  deliveryVersions: 1,
  heroMinutes: 5,
  interactiveStopMinutes: 2.25,
  mediaMinutes: 2,
  objectStopMinutes: 1.5,
  transitionPerDistrictMinutes: 6,
  commonMinutesPerPackage: 2.5,
  commonRouteMinutes: 10,
  guidedFlow: 300,
  independentFlow: 500,
  guidedMinutes: 240,
  independentMinutes: 120,
  groupSize: 30,
  guidedParticipation: 40,
  independentParticipation: 40,
  usersPerStation: 6,
  experienceMinutes: 2,
  turnoverSeconds: 15,
  targetUtilization: 80,
  commonArea: 3420,
  heroPercent: 30,
  museumPercent: 30,
  servicePercent: 30,
  interactiveMuseumPercent: 50,
  mediaMuseumPercent: 30,
  objectMuseumPercent: 20,
});

const COUNT_FIELDS = new Set([
  'heroPointsPerDistrict', 'interactivePointsPerDistrict', 'mediaPointsPerDistrict',
  'objectPointsPerDistrict', 'commonInstallations', 'commonPackages', 'commonSurfaces',
  'navigationSurfaces', 'navigationSystems', 'heroSurfacesPerInstallation',
  'mediaSurfacesPerInstallation', 'objectSurfacesPerInstallation',
  'surfacesPerInteractiveStation', 'languageCount', 'deliveryVersions',
  'minimumStationsPerInteractive',
  'groupSize', 'usersPerStation', 'heroUniqueShowCount', 'mediaUniqueProgramCount',
  'interactiveContentPackageCount', 'objectEditorialPackageCount',
]);
const OPTIONAL_COUNTS = new Set([
  'heroUniqueShowCount', 'mediaUniqueProgramCount', 'interactiveContentPackageCount',
  'objectEditorialPackageCount',
]);
const PERCENT_FIELDS = new Set([
  'guidedParticipation', 'independentParticipation', 'targetUtilization', 'heroPercent',
  'museumPercent', 'servicePercent', 'interactiveMuseumPercent', 'mediaMuseumPercent',
  'objectMuseumPercent',
]);
const STRICTLY_POSITIVE = new Set(['usersPerStation', 'targetUtilization', 'languageCount', 'deliveryVersions']);
const ENUM_FIELDS = {
  heroChannelMode: ['mirror', 'unique'],
  interactiveApplicationMode: ['shared-by-type', 'unique-per-point'],
};
const issue = (code, field, message, severity = 'warning') => ({ code, field, message, severity });
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finiteTree = value => typeof value === 'number' ? Number.isFinite(value)
  : value && typeof value === 'object' ? Object.values(value).every(finiteTree) : true;
const ceil = value => {
  if (value <= 0) return 0;
  const rounded = Math.round(value);
  return rounded > 0 && Math.abs(rounded - value) <= Number.EPSILON * Math.max(1, value) * 8
    ? rounded : Math.ceil(value);
};
const floor = value => {
  if (value <= 0) return 0;
  const rounded = Math.round(value);
  return Math.abs(rounded - value) <= Number.EPSILON * Math.max(1, value) * 8
    ? rounded : Math.floor(value);
};
const perItem = (area, count) => count > 0 ? area / count : null;

export function validateContentInput(raw = {}) {
  const errors = [];
  const warnings = [];
  if (!isObject(raw)) return {
    valid: false, input: { ...CONTENT_DEFAULTS }, warnings,
    errors: [issue('invalid_input', null, 'Параметры должны быть объектом.', 'error')],
  };
  const input = {};
  for (const [field, fallback] of Object.entries(CONTENT_DEFAULTS)) {
    const value = raw[field] === undefined ? fallback : raw[field];
    if (field === 'objectContentInScope') {
      input[field] = typeof value === 'boolean' ? value : null;
      if (input[field] === null) errors.push(issue('invalid_boolean', field, 'Выберите, входят ли предметные редакционные пакеты в объём ФАЗА.', 'error'));
    } else if (ENUM_FIELDS[field]) {
      input[field] = ENUM_FIELDS[field].includes(value) ? value : null;
      if (input[field] === null) errors.push(issue('invalid_choice', field, 'Выберите предусмотренный вариант расчёта.', 'error'));
    } else if (OPTIONAL_COUNTS.has(field) && value === null) {
      input[field] = null;
    } else {
      const number = typeof value === 'number' ? value
        : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
      if (!Number.isFinite(number)) {
        input[field] = null;
        errors.push(issue('invalid_number', field, 'Введите конечное числовое значение.', 'error'));
        continue;
      }
      input[field] = number;
      if (number < 0 || (STRICTLY_POSITIVE.has(field) && number === 0)) {
        errors.push(issue('out_of_range', field, STRICTLY_POSITIVE.has(field)
          ? 'Значение должно быть больше нуля.' : 'Значение не может быть отрицательным.', 'error'));
      }
      if (COUNT_FIELDS.has(field) && !Number.isSafeInteger(number)) {
        errors.push(issue('integer_required', field, 'Количество должно быть целым числом в безопасном числовом диапазоне.', 'error'));
      }
      if (PERCENT_FIELDS.has(field) && number > 100) {
        errors.push(issue('percentage_over_100', field, 'Процент не может превышать 100.', 'error'));
      }
    }
  }
  const pointSum = input.heroPointsPerDistrict + input.interactivePointsPerDistrict
    + input.mediaPointsPerDistrict + input.objectPointsPerDistrict;
  if (pointSum <= 0) errors.push(issue('empty_district', 'heroPointsPerDistrict', 'В территории должна оставаться хотя бы одна посетительская точка.', 'error'));
  if (input.heroPercent + input.museumPercent + input.servicePercent > 100 + 1e-9) {
    errors.push(issue('area_over_100', 'heroPercent', 'Сумма главной, музейной и сервисной долей превышает 100%.', 'error'));
  }
  if (input.interactiveMuseumPercent + input.mediaMuseumPercent + input.objectMuseumPercent > 100 + 1e-9) {
    errors.push(issue('museum_area_over_100', 'interactiveMuseumPercent', 'Внутренние доли музейной части превышают 100%.', 'error'));
  }
  if (input.commonArea > AREA.totalM2) errors.push(issue('common_area_exceeds_model', 'commonArea', 'Общие пространства превышают площадь модели.', 'error'));
  if (input.guidedFlow > 0 && input.groupSize === 0) errors.push(issue('zero_group_size', 'groupSize', 'Для экскурсионного потока размер группы должен быть больше нуля.', 'error'));
  if (input.guidedFlow > 0 && input.guidedMinutes === 0) errors.push(issue('zero_guided_duration', 'guidedMinutes', 'Для экскурсионного потока нужна положительная длительность визита.', 'error'));
  if (input.independentFlow > 0 && input.independentMinutes === 0) errors.push(issue('zero_independent_duration', 'independentMinutes', 'Для самостоятельного потока нужна положительная длительность визита.', 'error'));
  if (input.experienceMinutes === 0 && input.turnoverSeconds === 0) errors.push(issue('zero_station_cycle', 'experienceMinutes', 'Цикл станции вместе со сменой участников должен быть больше нуля.', 'error'));
  return { valid: errors.length === 0, input, errors, warnings };
}

function invalid(validation) {
  return {
    ...validation, status: 'proposal', source: 'Предлагаемая расчётная матрица',
    areas: null, counts: null, flows: null, capacity: null, content: null,
    runtime: null, delivery: null, route: null, table: [], sensitivities: null,
    notes: [], unknownScope: [],
  };
}

/** Build the existing model's input without carrying its 168-screen hypothesis. */
function loadInput(input, pointsPerDistrict) {
  return {
    guidedFlow: input.guidedFlow, independentFlow: input.independentFlow,
    guidedMinutes: input.guidedMinutes, independentMinutes: input.independentMinutes,
    groupSize: input.groupSize, pointsPerDistrict,
    interactivePointsPerDistrict: input.interactivePointsPerDistrict,
    transitionPerDistrictMinutes: input.transitionPerDistrictMinutes,
    commonArea: input.commonArea, heroPercent: input.heroPercent,
    interactivePercent: input.museumPercent, servicePercent: input.servicePercent,
    guidedParticipation: input.guidedParticipation, independentParticipation: input.independentParticipation,
    experienceMinutes: input.experienceMinutes, turnoverSeconds: input.turnoverSeconds,
    usersPerStation: input.usersPerStation, targetUtilization: input.targetUtilization,
    existingStationsPerPoint: 0, surfacesPerStation: input.surfacesPerInteractiveStation,
    fixedContentSurfaces: 0, navigationSurfaces: 0,
  };
}

export function computeContentPlan(raw = {}) {
  const validation = validateContentInput(raw);
  if (!validation.valid) return invalid(validation);
  const { input } = validation;
  const warnings = [...validation.warnings];
  const districts = AREA.districtCount;
  const pointsPerDistrict = input.heroPointsPerDistrict + input.interactivePointsPerDistrict
    + input.mediaPointsPerDistrict + input.objectPointsPerDistrict;
  const heroInstallations = districts * input.heroPointsPerDistrict;
  const interactiveInstallations = districts * input.interactivePointsPerDistrict;
  const mediaInstallations = districts * input.mediaPointsPerDistrict;
  const objectInstallations = districts * input.objectPointsPerDistrict;
  const districtInstallations = districts * pointsPerDistrict;
  const totalInstallations = districtInstallations + input.commonInstallations;

  const load = computePark(loadInput(input, pointsPerDistrict));
  if (!load.valid) return invalid({ ...validation, valid: false, errors: load.errors });
  // The old model supplies hourly demand and mean throughput. Its equal-time
  // stop budget is replaced here by the explicitly allocated interactive stop.
  const cycle = load.time.stationCycleMinutes;
  const batch = load.capacity.guidedBatchParticipants;
  const cyclesInStop = floor(input.interactiveStopMinutes / cycle);
  const groupStationsPerPoint = batch === 0 ? 0
    : cyclesInStop > 0 ? ceil(batch / (input.usersPerStation * cyclesInStop)) : null;
  const meanStationsPerPoint = load.capacity.averageRequiredStationsPerPoint;
  const installationMinimumStationsPerPoint = interactiveInstallations > 0 ? input.minimumStationsPerInteractive : 0;
  const requiredStationsPerPoint = Math.max(installationMinimumStationsPerPoint, meanStationsPerPoint,
    groupStationsPerPoint ?? ceil(batch / input.usersPerStation));
  const interactiveStations = requiredStationsPerPoint * interactiveInstallations;
  const batchCycles = batch === 0 ? 0 : ceil(batch / (requiredStationsPerPoint * input.usersPerStation));
  const batchDurationMinutes = batchCycles * cycle;
  const batchFitsStop = batch === 0 || batchDurationMinutes <= input.interactiveStopMinutes + 1e-9;
  const requiredCapacityPerPoint = requiredStationsPerPoint * load.capacity.nominalCapacityPerStationPerHour;
  const capacity = {
    source: '../calculator/model.js',
    demandPerPointPerHour: load.capacity.demandPerPointPerHour,
    guidedDemandPerPointPerHour: load.capacity.guidedDemandPerPointPerHour,
    independentDemandPerPointPerHour: load.capacity.independentDemandPerPointPerHour,
    nominalPerStationPerHour: load.capacity.nominalCapacityPerStationPerHour,
    sustainablePerStationPerHour: load.capacity.sustainableCapacityPerStationPerHour,
    meanStationsPerPoint, groupStationsPerPoint, installationMinimumStationsPerPoint, requiredStationsPerPoint,
    totalStations: interactiveStations, batchParticipants: batch, cyclesInStop,
    cycleMinutes: cycle, batchDurationMinutes, batchFitsStop,
    sustainablePerPointPerHour: requiredStationsPerPoint * load.capacity.sustainableCapacityPerStationPerHour,
    utilizationPercent: requiredCapacityPerPoint > 0 ? load.capacity.demandPerPointPerHour / requiredCapacityPerPoint * 100 : 0,
    formula: 'max(базовый минимум, ceil(спрос / выпуск станции), ceil(участники группы / (места × циклы в остановке)))',
  };

  const heroShows = input.heroUniqueShowCount ?? heroInstallations;
  const linearMediaPrograms = input.mediaUniqueProgramCount ?? mediaInstallations;
  const interactiveContentPackages = input.interactiveContentPackageCount ?? interactiveInstallations;
  const objectEditorialPackages = input.objectEditorialPackageCount ?? objectInstallations;
  const scopedObjectPackages = input.objectContentInScope ? objectEditorialPackages : 0;
  const interactiveApplications = input.interactiveApplicationMode === 'shared-by-type'
    ? input.interactivePointsPerDistrict : interactiveInstallations;
  const digitalPackages = heroShows + interactiveContentPackages + linearMediaPrograms
    + input.commonPackages + input.navigationSystems;
  const scopedPackages = digitalPackages + scopedObjectPackages;
  const content = {
    heroShows, interactiveApplications, interactiveContentPackages,
    linearMediaPrograms, commonPackages: input.commonPackages,
    navigationSystems: input.navigationSystems,
    objectEditorialPackages, scopedObjectPackages,
    digitalPackages, scopedPackages,
    allPotentialPackages: digitalPackages + objectEditorialPackages,
    linearPrograms: heroShows + linearMediaPrograms + input.commonPackages,
    nonlinearPackages: interactiveContentPackages + input.navigationSystems,
    formula: 'главные шоу + территориальные интерактивные комплекты + медийные программы + общие пакеты + навигационные системы (+ предметные пакеты в объёме ФАЗА)',
  };

  const heroUniqueChannelsPerShow = input.heroChannelMode === 'unique'
    ? input.heroSurfacesPerInstallation : input.heroSurfacesPerInstallation > 0 ? 1 : 0;
  const heroLinearMinutes = heroShows * input.heroMinutes;
  const mediaLinearMinutes = linearMediaPrograms * input.mediaMinutes;
  const commonLinearMinutes = input.commonPackages * input.commonMinutesPerPackage;
  const uniqueLinearMinutes = heroLinearMinutes + mediaLinearMinutes + commonLinearMinutes;
  const heroChannelMinutes = heroLinearMinutes * heroUniqueChannelsPerShow;
  // Media/common surfaces repeat the corresponding program by default. Repeating
  // the same file never creates an additional unique program or master channel.
  const uniqueChannelMinutes = heroChannelMinutes + mediaLinearMinutes + commonLinearMinutes;
  const linearMasterChannels = heroShows * heroUniqueChannelsPerShow + linearMediaPrograms + input.commonPackages;
  const runtime = {
    heroLinearMinutes, mediaLinearMinutes, commonLinearMinutes,
    uniqueLinearMinutes, heroUniqueChannelsPerShow, heroChannelMinutes,
    uniqueChannelMinutes, linearMasterChannels,
    interactiveSessionMinutes: input.experienceMinutes,
    interactiveCycleMinutes: cycle,
    interactiveStopMinutes: input.interactiveStopMinutes,
    interactiveRuntimeIncludedInLinearTotal: false,
    navigationRuntimeIncludedInLinearTotal: false,
    unitNote: 'Минуты уникальных линейных программ и канал-минуты разных видеосигналов; это не оценка стоимости производства.',
  };
  const deliveryMultiplier = input.languageCount * input.deliveryVersions;
  const delivery = {
    languageCount: input.languageCount, versions: input.deliveryVersions,
    multiplier: deliveryMultiplier,
    digitalPackageSets: digitalPackages * deliveryMultiplier,
    objectPackageSets: scopedObjectPackages * deliveryMultiplier,
    scopedPackageSets: scopedPackages * deliveryMultiplier,
    linearProgramSets: content.linearPrograms * deliveryMultiplier,
    linearChannelSets: linearMasterChannels * deliveryMultiplier,
    linearChannelMinutes: uniqueChannelMinutes * deliveryMultiplier,
    formula: 'уникальные комплекты × языки × версии выдачи; количество исходных программ не умножается',
  };

  const heroSurfaces = heroInstallations * input.heroSurfacesPerInstallation;
  const interactiveSurfaces = interactiveStations * input.surfacesPerInteractiveStation;
  const mediaSurfaces = mediaInstallations * input.mediaSurfacesPerInstallation;
  const objectSurfaces = objectInstallations * input.objectSurfacesPerInstallation;
  const physicalSurfaces = heroSurfaces + interactiveSurfaces + mediaSurfaces
    + objectSurfaces + input.commonSurfaces + input.navigationSurfaces;
  const counts = {
    districts, territories: districts, pointsPerDistrict, districtInstallations,
    heroInstallations, interactiveInstallations, mediaInstallations, objectInstallations,
    commonInstallations: input.commonInstallations, totalInstallations,
    interactiveStations, physicalSurfaces,
    minimumInteractiveStations: installationMinimumStationsPerPoint * interactiveInstallations,
    duplicateInteractiveStations: input.minimumStationsPerInteractive >= 1
      ? Math.max(0, interactiveStations - interactiveInstallations) : null,
    duplicateInteractiveStationsLabel: 'Дополнительные параллельные станции',
    heroSurfaces, interactiveSurfaces, mediaSurfaces, objectSurfaces,
    commonSurfaces: input.commonSurfaces, navigationSurfaces: input.navigationSurfaces,
    digitalPackages, objectPackages: objectEditorialPackages, scopedObjectPackages,
    scopedPackages, allPotentialPackages: content.allPotentialPackages,
    navigationSystems: input.navigationSystems,
  };

  const effectiveInteractiveStop = input.guidedFlow > 0
    ? Math.max(input.interactiveStopMinutes, batchDurationMinutes) : input.interactiveStopMinutes;
  const heroStopTotal = input.heroPointsPerDistrict * input.heroMinutes;
  const interactiveStopTotal = input.interactivePointsPerDistrict * effectiveInteractiveStop;
  const mediaStopTotal = input.mediaPointsPerDistrict * input.mediaMinutes;
  const objectStopTotal = input.objectPointsPerDistrict * input.objectStopMinutes;
  const districtMinutes = heroStopTotal + interactiveStopTotal + mediaStopTotal
    + objectStopTotal + input.transitionPerDistrictMinutes;
  const plannedDistrictMinutes = heroStopTotal + input.interactivePointsPerDistrict * input.interactiveStopMinutes
    + mediaStopTotal + objectStopTotal + input.transitionPerDistrictMinutes;
  const totalMinutes = districtMinutes * districts + input.commonRouteMinutes;
  const overrunMinutes = Math.max(0, totalMinutes - input.guidedMinutes);
  const minimumGuidedOccupancy = input.guidedFlow * totalMinutes / 60;
  const minimumTotalOccupancy = minimumGuidedOccupancy + load.flows.independentOccupancy;
  const route = {
    heroMinutesPerDistrict: heroStopTotal,
    interactiveMinutesPerDistrict: interactiveStopTotal,
    mediaMinutesPerDistrict: mediaStopTotal,
    objectMinutesPerDistrict: objectStopTotal,
    transitionsPerDistrict: input.transitionPerDistrictMinutes,
    effectiveInteractiveStopMinutes: effectiveInteractiveStop,
    plannedDistrictMinutes, districtMinutes,
    commonMinutes: input.commonRouteMinutes, totalMinutes,
    targetMinutes: input.guidedMinutes, overrunMinutes,
    minimumGuidedOccupancy, minimumTotalOccupancy,
    spareMinutes: Math.max(0, input.guidedMinutes - totalMinutes),
    feasible: overrunMinutes <= 1e-9 && batchFitsStop,
    exactlyAtLimit: Math.abs(totalMinutes - input.guidedMinutes) <= 1e-9,
    fullCommonProgramsMinutes: commonLinearMinutes,
    coversFullCommonPrograms: input.commonRouteMinutes + 1e-9 >= commonLinearMinutes,
    formula: '8 × (главные + интерактивные + медийные + предметные остановки + переходы) + общепарковый блок',
  };

  const districtAreaTotal = AREA.totalM2 - input.commonArea;
  const heroArea = districtAreaTotal * input.heroPercent / 100;
  const museumArea = districtAreaTotal * input.museumPercent / 100;
  const serviceArea = districtAreaTotal * input.servicePercent / 100;
  const reservePercent = Math.max(0, 100 - input.heroPercent - input.museumPercent - input.servicePercent);
  const reserveArea = districtAreaTotal * reservePercent / 100;
  const interactiveArea = museumArea * input.interactiveMuseumPercent / 100;
  const mediaArea = museumArea * input.mediaMuseumPercent / 100;
  const objectArea = museumArea * input.objectMuseumPercent / 100;
  const museumUnallocatedArea = Math.max(0, museumArea - interactiveArea - mediaArea - objectArea);
  const areas = {
    totalM2: AREA.totalM2, lowerLevelM2: AREA.lowerLevelM2, upperLevelM2: AREA.upperLevelM2,
    source: 'main-floors.json', allocationStatus: 'proposal',
    sourceReconciliation: {
      figmaTerritoriesM2: 9980, figmaCommonM2: 3420, figmaTotalM2: 13400,
      modelDifferenceM2: 5484.055, status: 'unreconciled',
    },
    commonM2: input.commonArea, districtTotalM2: districtAreaTotal,
    districtAverageM2: districtAreaTotal / districts,
    heroM2: heroArea, museumM2: museumArea, serviceM2: serviceArea,
    reserveM2: reserveArea, reservePercent,
    interactiveM2: interactiveArea, mediaM2: mediaArea, objectM2: objectArea,
    museumUnallocatedM2: museumUnallocatedArea,
    heroPerInstallationM2: perItem(heroArea, heroInstallations),
    interactivePerInstallationM2: perItem(interactiveArea, interactiveInstallations),
    mediaPerInstallationM2: perItem(mediaArea, mediaInstallations),
    objectPerInstallationM2: perItem(objectArea, objectInstallations),
    interactivePerStationM2: perItem(interactiveArea, interactiveStations),
    assignedVisitorAreaM2: input.commonArea + heroArea + museumArea,
    perDistrict: {
      heroM2: heroArea / districts, museumM2: museumArea / districts,
      interactiveM2: interactiveArea / districts, mediaM2: mediaArea / districts,
      objectM2: objectArea / districts, serviceM2: serviceArea / districts,
      reserveM2: reserveArea / districts,
    },
  };

  const table = [
    { id: 'hero', label: 'Главные инсталляции', perDistrict: input.heroPointsPerDistrict,
      installations: heroInstallations, stations: 0, physicalSurfaces: heroSurfaces,
      uniquePackages: heroShows, uniqueApplications: 0, linearMinutes: heroLinearMinutes,
      channelMinutes: heroChannelMinutes, areaM2: heroArea,
      formula: `${districts} × ${input.heroPointsPerDistrict} инсталляций × ${input.heroSurfacesPerInstallation} поверхности`,
      contentFormula: `${heroShows} шоу × ${input.heroMinutes} мин; ${heroUniqueChannelsPerShow} разных видеоканала на шоу` },
    { id: 'interactive', label: 'Интерактивные инсталляции', perDistrict: input.interactivePointsPerDistrict,
      installations: interactiveInstallations, stations: interactiveStations, physicalSurfaces: interactiveSurfaces,
      uniquePackages: interactiveContentPackages, uniqueApplications: interactiveApplications,
      linearMinutes: 0, channelMinutes: 0, areaM2: interactiveArea,
      formula: `${interactiveInstallations} точек × ${requiredStationsPerPoint} станции × ${input.surfacesPerInteractiveStation} поверхности`,
      contentFormula: `${interactiveContentPackages} территориальных комплектов; ${interactiveApplications} приложений/шаблонов, повторные станции используют те же комплекты` },
    { id: 'media', label: 'Медийные инсталляции', perDistrict: input.mediaPointsPerDistrict,
      installations: mediaInstallations, stations: 0, physicalSurfaces: mediaSurfaces,
      uniquePackages: linearMediaPrograms, uniqueApplications: 0,
      linearMinutes: mediaLinearMinutes, channelMinutes: mediaLinearMinutes, areaM2: mediaArea,
      formula: `${mediaInstallations} точек × ${input.mediaSurfacesPerInstallation} поверхности`,
      contentFormula: `${linearMediaPrograms} уникальных программ × ${input.mediaMinutes} мин` },
    { id: 'objects', label: 'Предметные инсталляции', perDistrict: input.objectPointsPerDistrict,
      installations: objectInstallations, stations: 0, physicalSurfaces: objectSurfaces,
      uniquePackages: scopedObjectPackages, potentialPackages: objectEditorialPackages,
      uniqueApplications: 0, linearMinutes: 0, channelMinutes: 0, areaM2: objectArea,
      formula: `${objectInstallations} точек × ${input.objectSurfacesPerInstallation} поверхности`,
      contentFormula: `${objectEditorialPackages} редакционных/этикетажных комплектов; ${input.objectContentInScope ? 'включены' : 'не включены'} в объём ФАЗА` },
    { id: 'common', label: 'Общепарковые установки', perDistrict: null,
      installations: input.commonInstallations, stations: 0, physicalSurfaces: input.commonSurfaces,
      uniquePackages: input.commonPackages, uniqueApplications: 0,
      linearMinutes: commonLinearMinutes, channelMinutes: commonLinearMinutes, areaM2: input.commonArea,
      formula: `${input.commonInstallations} установки; ${input.commonSurfaces} поверхностей задано отдельно`,
      contentFormula: `${input.commonPackages} уникальных пакета × ${input.commonMinutesPerPackage} мин; повторные экраны не умножают программы` },
    { id: 'navigation', label: 'Навигационная система', perDistrict: null,
      installations: 0, systems: input.navigationSystems, stations: 0,
      physicalSurfaces: input.navigationSurfaces, uniquePackages: input.navigationSystems,
      uniqueApplications: 0, linearMinutes: 0, channelMinutes: 0, areaM2: 0,
      formula: `${input.navigationSystems} системы; ${input.navigationSurfaces} поверхностей`,
      contentFormula: 'Навигация считается системой, а не дополнительными экскурсионными инсталляциями или минутами фильма' },
  ].map(row => ({ ...row, status: 'proposal', source: 'Предлагаемая матрица и изменяемые параметры' }));

  const nextIndependentFlow = input.independentParticipation > 0
    ? (capacity.sustainablePerPointPerHour - capacity.guidedDemandPerPointPerHour)
      / (input.independentParticipation / 100) : null;
  const sensitivities = {
    oneExtraStationAtEachInteractive: {
      stations: interactiveInstallations,
      physicalSurfaces: interactiveInstallations * input.surfacesPerInteractiveStation,
      uniquePackages: 0,
    },
    oneExtraHeroMinute: {
      routeMinutes: heroInstallations,
      uniqueLinearMinutes: heroShows,
      uniqueChannelMinutes: heroShows * heroUniqueChannelsPerShow,
    },
    oneExtraMediaMinute: {
      routeMinutes: mediaInstallations,
      uniqueLinearMinutes: linearMediaPrograms,
    },
    oneExtraLanguage: {
      uniquePackages: 0, physicalSurfaces: 0,
      scopedDeliverySets: scopedPackages * input.deliveryVersions,
      deliveryChannelMinutes: uniqueChannelMinutes * input.deliveryVersions,
    },
    nextIndependentFlowThresholdPerHour: nextIndependentFlow,
    thresholdNote: 'При равенстве порогу средняя нагрузка ещё помещается; рост выше порога требует следующей станции. Порог не заменяет групповую проверку.',
  };

  if (!batchFitsStop) warnings.push(issue('interactive_stop_too_short', 'interactiveStopMinutes', 'Участвующая часть группы не помещается в заданную интерактивную остановку. Итог маршрута использует как минимум фактическую длительность группового цикла.'));
  if (overrunMinutes > 1e-9) warnings.push(issue('route_exceeds_visit', 'guidedMinutes', `Маршрут занимает ${Number(totalMinutes.toFixed(2))} мин и превышает заданный визит на ${Number(overrunMinutes.toFixed(2))} мин. Если сохранить всю программу, расчётное присутствие составит не менее ${Number(minimumGuidedOccupancy.toFixed(1))} экскурсионных посетителей и ${Number(minimumTotalOccupancy.toFixed(1))} посетителей всего.`));
  warnings.push(issue('area_sources_unreconciled', 'commonArea', 'В модели 18 884,055 м², в ведомости Figma 13 400 м². Разница 5 484,055 м² требует функциональной увязки и не является подтверждённым свободным резервом. Весь контур распределён здесь только как сценарное предложение.'));
  if (route.exactlyAtLimit) warnings.push(issue('route_has_no_spare_time', 'guidedMinutes', 'Расчётный маршрут ровно заполняет визит. Дополнительного запаса сверх заданных переходов нет.', 'info'));
  if (!route.coversFullCommonPrograms) warnings.push(issue('common_route_partial_viewing', 'commonRouteMinutes', 'Общепарковый блок короче полного хронометража его программ: маршрут предполагает выборочный просмотр.', 'info'));
  if (input.targetUtilization === 100) warnings.push(issue('no_utilization_reserve', 'targetUtilization', 'Загрузка 100% не оставляет резерва на колебания потока.'));
  if (input.minimumStationsPerInteractive === 0 && interactiveInstallations > 0) warnings.push(issue('no_installation_minimum', 'minimumStationsPerInteractive', 'Базовое оснащение интерактивных точек не закреплено: используется только потребность по потоку и группам.', 'info'));
  if (museumUnallocatedArea > 1e-8) warnings.push(issue('museum_area_unassigned', 'interactiveMuseumPercent', 'Часть музейной площади ещё не распределена между интерактивами, медийными и предметными точками.', 'info'));
  for (const [field, count, area] of [
    ['heroPercent', heroInstallations, heroArea],
    ['interactiveMuseumPercent', interactiveInstallations, interactiveArea],
    ['mediaMuseumPercent', mediaInstallations, mediaArea],
    ['objectMuseumPercent', objectInstallations, objectArea],
  ]) {
    if (count > 0 && area <= 0) warnings.push(issue('installations_without_area', field, 'Для одного из типов инсталляций задано количество, но не выделена площадь.'));
  }
  if (heroShows > 0 && heroSurfaces === 0) warnings.push(issue('hero_video_without_surface', 'heroSurfacesPerInstallation', 'Главные видеопрограммы предусмотрены, но экранные поверхности для них не заданы.'));
  if (linearMediaPrograms > 0 && mediaSurfaces === 0) warnings.push(issue('media_video_without_surface', 'mediaSurfacesPerInstallation', 'Медийные видеопрограммы предусмотрены, но экранные поверхности для них не заданы.'));
  if (input.commonPackages > 0 && (input.commonInstallations === 0 || input.commonSurfaces === 0)) warnings.push(issue('common_program_without_installation', 'commonInstallations', 'Общепарковые программы требуют уточнения установок и поверхностей показа.'));
  if (input.navigationSystems > 0 && input.navigationSurfaces === 0) warnings.push(issue('navigation_without_surfaces', 'navigationSurfaces', 'Для навигационной системы не заданы поверхности; уточните, предусмотрены ли мобильный или иной способ доступа.', 'info'));
  if (input.independentFlow > 0 && interactiveInstallations * input.independentParticipation / 100 * input.experienceMinutes > input.independentMinutes + 1e-9) {
    warnings.push(issue('independent_interactions_exceed_visit', 'independentMinutes', 'Одни активные взаимодействия уже длиннее самостоятельного визита; согласуйте долю участия и время.'));
  }

  const result = {
    valid: true, input, errors: [], warnings,
    status: 'proposal', source: 'Предлагаемая расчётная матрица; не монтажный план и не смета',
    areas, counts, flows: load.flows, capacity, content, runtime, delivery, route,
    table, sensitivities,
    unknownScope: [{
      id: 'rgo', name: 'Пространство РГО', status: 'unknown-additive-scope',
      reportedAreaM2: 1400, reportedZones: 9, reportedExhibitsAtLeast: 45,
      automaticallyAdded: false,
      note: 'Принадлежность этих зон к рассматриваемой модели и общей программе не установлена. Они не прибавляются к инсталляциям, поверхностям и площади автоматически.',
    }],
    notes: [
      'Матрица 1 главная + 3 интерактивные + 4 медийные + 2 предметные точки на географическую территорию — проектное предложение, а не установленный состав исходных материалов. Речь о восьми географических территориях, а не об административных федеральных округах.',
      '30% площади главной инсталляции и 30% музейной части не означают по 30% количества точек. Музейная часть обслуживает интерактивные, медийные и предметные точки вместе.',
      'Параллельные станции повторяют одну программу своей инсталляции. Они увеличивают оборудование и пропускную способность, но не количество уникальных пакетов контента.',
      'По умолчанию для каждой запланированной интерактивной инсталляции предусмотрена одна базовая станция даже при нулевом потоке; дополнительные станции рассчитываются по нагрузке и группе.',
      'Три типовых приложения при исходной матрице — переиспользуемые программные шаблоны; 24 территориальных комплекта содержат разные темы. Шаблоны повторно не прибавляются к сумме пакетов.',
      'Число приложений описывает структуру интеграции и само по себе не включает разработку программного обеспечения в договор ФАЗА.',
      'Главное шоу считается одной линейной программой. Разные синхронные видеоканалы увеличивают канал-минуты; зеркальные экраны не увеличивают уникальный хронометраж.',
      'Языки и версии выдачи увеличивают комплекты передачи материалов, но не исходные программы или инсталляции. Объём локализации и доступных версий уточняется отдельно.',
      'Ветвящиеся приложения, игровые циклы, навигация и редакционные комплекты не суммируются с минутами линейного фильма. Аудио и статическая графика внутри пакетов требуют отдельной производственной ведомости.',
      'Нагрузка рассчитана для типовой интерактивной точки и установившегося потока. Очереди, встречи групп и зрительские зоны главных/медийных инсталляций здесь не симулируются.',
      'Групповая проверка предполагает свободные станции к приходу группы. Площади — фонды для проектирования; реальные координаты, оборудование, проходы и очереди ещё необходимо разместить.',
      'Четыре общепарковые установки и 12 их поверхностей заданы отдельно. Навигация считается одной системой на нескольких поверхностях, а не дополнительными экскурсионными точками.',
      'По указанию пользователя фонд сценария использует всю площадь 3D-модели за вычетом общих пространств. Его условное распределение не устанавливает назначение разницы между моделью и ведомостью Figma и не доказывает размещение оборудования.',
    ],
  };
  const integerTotals = [totalInstallations, interactiveStations, physicalSurfaces, digitalPackages,
    scopedPackages, delivery.scopedPackageSets, delivery.linearChannelSets];
  if (!finiteTree(result) || integerTotals.some(value => !Number.isSafeInteger(value))) {
    return invalid({ valid: false, input, warnings: [],
      errors: [issue('numeric_range_exceeded', null, 'Параметры выходят за пределы безопасного числового расчёта.', 'error')] });
  }
  return result;
}
