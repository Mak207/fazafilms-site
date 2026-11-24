/**
 * Representative-point planning model for «Парк впечатлений».
 * Units: people/hour, minutes, m²; input percentages are 0–100.
 * This is a scenario model, not a measured equipment register, a queue simulation,
 * an evacuation calculation, or proof that equipment fits in the building.
 *
 * Every representative point receives λg·pg + λi·pi users/hour. Never divide
 * that flow by eight districts or by the number of points. Participation already
 * describes the fraction of the incoming stream using that particular point.
 * Stations are rounded UP per point before multiplying by point count.
 */

export const AREA = Object.freeze({
  total: 18884.055,
  totalM2: 18884.055,
  lowerLevelM2: 12312.971,
  upperLevelM2: 6571.084,
  districtCount: 8,
});

export const DEFAULT_INPUT = Object.freeze({
  guidedFlow: 300,
  independentFlow: 500,
  guidedMinutes: 240,
  independentMinutes: 120,
  groupSize: 30,
  pointsPerDistrict: 10,
  interactivePointsPerDistrict: 9,
  transitionPerDistrictMinutes: 6,
  commonArea: 3420,
  heroPercent: 30,
  interactivePercent: 30,
  servicePercent: 30,
  guidedParticipation: 40,
  independentParticipation: 40,
  experienceMinutes: 2,
  turnoverSeconds: 15,
  usersPerStation: 6,
  targetUtilization: 80,
  existingStationsPerPoint: 2,
  surfacesPerStation: 1,
  fixedContentSurfaces: 12,
  navigationSurfaces: 12,
  spectatorsPerGroupScreen: 30,
  guidedVisitAllPoints: true,
  guidedPointsVisitedPerDistrict: 10,
  // Optional eight measured/planned district areas. Sum must be total−commonArea.
  // null means an explicitly assumed equal distribution, not measured boundaries.
  districtAreas: null,
});

const INTEGER_FIELDS = new Set([
  'groupSize', 'pointsPerDistrict', 'interactivePointsPerDistrict',
  'usersPerStation', 'existingStationsPerPoint', 'surfacesPerStation',
  'fixedContentSurfaces', 'navigationSurfaces', 'spectatorsPerGroupScreen',
  'guidedPointsVisitedPerDistrict',
]);
const PERCENT_FIELDS = new Set([
  'heroPercent', 'interactivePercent', 'servicePercent',
  'guidedParticipation', 'independentParticipation', 'targetUtilization',
]);
const POSITIVE_FIELDS = new Set([
  'pointsPerDistrict', 'usersPerStation', 'spectatorsPerGroupScreen',
  'guidedPointsVisitedPerDistrict', 'targetUtilization',
]);

const issue = (code, field, message) => ({ code, field, message });
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const almostEqual = (a, b, tolerance = 1e-8) => Math.abs(a - b) <= tolerance;

function ceilCount(value) {
  if (value <= 0) return 0;
  const nearest = Math.round(value);
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(value)) * 8;
  return nearest > 0 && Math.abs(value - nearest) <= tolerance ? nearest : Math.ceil(value);
}

function floorCount(value) {
  if (value <= 0) return 0;
  const nearest = Math.round(value);
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(value)) * 8;
  return Math.abs(value - nearest) <= tolerance ? nearest : Math.floor(value);
}

function finiteTree(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (value && typeof value === 'object') return Object.values(value).every(finiteTree);
  return true;
}

/**
 * Normalize numeric form strings; missing fields use defaults. Invalid values
 * are rejected, never silently clamped. Returns {valid,input,errors,warnings}.
 */
export function validateInput(raw = {}) {
  const errors = [];
  const warnings = [];
  if (!isRecord(raw)) {
    return {
      valid: false, input: { ...DEFAULT_INPUT },
      errors: [issue('invalid_input', null, 'Параметры должны быть объектом.')], warnings,
    };
  }
  const input = {};
  for (const [field, fallback] of Object.entries(DEFAULT_INPUT)) {
    const value = raw[field] === undefined ? fallback : raw[field];
    if (field === 'districtAreas') continue;
    if (field === 'guidedVisitAllPoints') {
      input[field] = typeof value === 'boolean' ? value : null;
      if (input[field] === null) errors.push(issue('invalid_boolean', field, 'Нужен логический переключатель маршрута.'));
      continue;
    }
    const number = typeof value === 'number' ? value
      : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
    if (!Number.isFinite(number)) {
      input[field] = null;
      errors.push(issue('invalid_number', field, 'Введите конечное числовое значение.'));
      continue;
    }
    input[field] = number;
    if (number < 0 || (POSITIVE_FIELDS.has(field) && number === 0)) {
      errors.push(issue('out_of_range', field, POSITIVE_FIELDS.has(field)
        ? 'Значение должно быть больше нуля.' : 'Значение не может быть отрицательным.'));
    }
    if (INTEGER_FIELDS.has(field) && !Number.isSafeInteger(number)) {
      errors.push(issue('integer_required', field, 'Количество должно быть целым числом в допустимом числовом диапазоне.'));
    }
    if (PERCENT_FIELDS.has(field) && number > 100) {
      errors.push(issue('percentage_over_100', field, 'Процент не может превышать 100.'));
    }
  }
  if (input.guidedFlow > 0 && input.groupSize === 0) {
    errors.push(issue('zero_group_size', 'groupSize', 'При экскурсионном потоке размер группы должен быть больше нуля.'));
  }
  if (input.guidedFlow > 0 && input.guidedMinutes === 0) {
    errors.push(issue('zero_guided_duration', 'guidedMinutes', 'Для экскурсионного потока задайте длительность посещения больше нуля.'));
  }
  if (input.independentFlow > 0 && input.independentMinutes === 0) {
    errors.push(issue('zero_independent_duration', 'independentMinutes', 'Для самостоятельного потока задайте длительность посещения больше нуля.'));
  }
  if (input.experienceMinutes === 0 && input.turnoverSeconds === 0) {
    errors.push(issue('zero_station_cycle', 'experienceMinutes', 'Цикл станции вместе со сменой пользователя должен быть больше нуля.'));
  }
  if (input.interactivePointsPerDistrict > input.pointsPerDistrict) {
    errors.push(issue('too_many_interactive_points', 'interactivePointsPerDistrict', 'Интерактивных точек не может быть больше общего числа точек.'));
  }
  if (input.guidedVisitAllPoints === false && input.guidedPointsVisitedPerDistrict > input.pointsPerDistrict) {
    errors.push(issue('too_many_route_points', 'guidedPointsVisitedPerDistrict', 'Маршрут не может содержать больше точек, чем есть в округе.'));
  }
  if (input.commonArea > AREA.totalM2) {
    errors.push(issue('common_area_exceeds_total', 'commonArea', 'Общая зона превышает площадь модели.'));
  }
  const percentSum = input.heroPercent + input.interactivePercent + input.servicePercent;
  if (percentSum > 100 + 1e-9) {
    errors.push(issue('area_percentages_over_100', 'heroPercent', 'Сумма долей главной инсталляции, интерактивов и служебной зоны превышает 100%.'));
  }
  const districtAreas = raw.districtAreas === undefined ? null : raw.districtAreas;
  input.districtAreas = null;
  if (districtAreas !== null) {
    if (!Array.isArray(districtAreas) || districtAreas.length !== AREA.districtCount) {
      errors.push(issue('invalid_district_areas', 'districtAreas', 'Нужны площади ровно восьми округов.'));
    } else {
      const normalized = districtAreas.map(value => typeof value === 'number' ? value
        : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN);
      input.districtAreas = normalized.map(value => Number.isFinite(value) ? value : null);
      if (normalized.some(value => !Number.isFinite(value) || value < 0)) {
        errors.push(issue('invalid_district_area', 'districtAreas', 'Площади округов должны быть конечными неотрицательными числами.'));
      } else if (Number.isFinite(input.commonArea)
        && !almostEqual(normalized.reduce((sum, value) => sum + value, 0), AREA.totalM2 - input.commonArea, 0.01)) {
        errors.push(issue('district_area_sum_mismatch', 'districtAreas', 'Сумма площадей округов должна равняться площади модели за вычетом общей зоны.'));
      }
    }
  }
  if (input.targetUtilization === 100) {
    warnings.push(issue('no_utilization_reserve', 'targetUtilization', 'Загрузка 100% не оставляет резерва на колебания потока; расчёт не гарантирует отсутствие очереди.'));
  }
  return { valid: errors.length === 0, input, errors, warnings };
}

function invalidResult(validation) {
  return {
    ...validation, areas: null, flows: null, time: null, capacity: null,
    surfaces: null, districts: null, assumptions: [],
  };
}

/**
 * Pure API; no side effects. Fractions named *Utilization are 0–1 (may exceed 1
 * for overloaded installed equipment); explicit *Percent aliases are 0–100.
 * null denotes an undefined ratio/interval or an impossible batch constraint.
 * Required hardware can be less than installed hardware; `additional` is never
 * negative and `plannedTotal` retains installed equipment.
 */
export function computePark(raw = {}) {
  const validation = validateInput(raw);
  if (!validation.valid) return invalidResult(validation);
  const { input } = validation;
  const warnings = [...validation.warnings];
  const districtsCount = AREA.districtCount;
  const guidedFraction = input.guidedParticipation / 100;
  const independentFraction = input.independentParticipation / 100;
  const targetFraction = input.targetUtilization / 100;
  const pointCount = input.pointsPerDistrict * districtsCount;
  const interactivePointCount = input.interactivePointsPerDistrict * districtsCount;
  const hasInteractivePoints = interactivePointCount > 0;

  // Little's law: separate dwell times affect simultaneous presence, not the
  // steady hourly number of people arriving at a representative interactive.
  const guidedOccupancy = input.guidedFlow * input.guidedMinutes / 60;
  const independentOccupancy = input.independentFlow * input.independentMinutes / 60;
  const totalOccupancy = guidedOccupancy + independentOccupancy;
  const groupLaunchIntervalMinutes = input.guidedFlow > 0 ? 60 * input.groupSize / input.guidedFlow : null;
  const groupsPerHour = input.groupSize > 0 ? input.guidedFlow / input.groupSize : 0;
  const guidedGroupsInPark = input.groupSize > 0 ? guidedOccupancy / input.groupSize : 0;
  const flows = {
    guidedPerHour: input.guidedFlow,
    independentPerHour: input.independentFlow,
    totalPerHour: input.guidedFlow + input.independentFlow,
    guidedOccupancy, independentOccupancy, totalOccupancy,
    groupLaunchIntervalMinutes, groupsPerHour, guidedGroupsInPark,
    guidedGroupsInParkCeil: ceilCount(guidedGroupsInPark),
    guidedOccupancyPerDistrict: guidedOccupancy / districtsCount,
    independentOccupancyPerDistrict: independentOccupancy / districtsCount,
    totalOccupancyPerDistrict: totalOccupancy / districtsCount,
    guidedGroupsPerDistrictAverage: guidedGroupsInPark / districtsCount,
    guidedGroupsPerDistrictPeak: ceilCount(guidedGroupsInPark / districtsCount),
  };

  const districtVisitMinutes = input.guidedMinutes / districtsCount;
  const guidedVisitedPoints = input.guidedVisitAllPoints
    ? input.pointsPerDistrict : input.guidedPointsVisitedPerDistrict;
  const rawDistrictContentMinutes = districtVisitMinutes - input.transitionPerDistrictMinutes;
  const guidedPointBudgetMinutes = Math.max(0, rawDistrictContentMinutes) / guidedVisitedPoints;
  const stationCycleMinutes = input.experienceMinutes + input.turnoverSeconds / 60;
  const wavesWithinBudget = floorCount(guidedPointBudgetMinutes / stationCycleMinutes);
  const time = {
    districtVisitMinutes,
    independentDistrictVisitMinutes: input.independentMinutes / districtsCount,
    guidedPointsVisitedPerDistrict: guidedVisitedPoints,
    guidedRoutePointCount: guidedVisitedPoints * districtsCount,
    guidedTransitionMinutes: input.transitionPerDistrictMinutes * districtsCount,
    guidedContentBudgetPerDistrictMinutes: Math.max(0, rawDistrictContentMinutes),
    guidedPointBudgetMinutes, stationCycleMinutes, wavesWithinBudget,
    expectedGuidedInteractiveVisits: interactivePointCount * guidedFraction,
    expectedIndependentInteractiveVisits: interactivePointCount * independentFraction,
    expectedGuidedActiveMinutes: interactivePointCount * guidedFraction * input.experienceMinutes,
    expectedIndependentActiveMinutes: interactivePointCount * independentFraction * input.experienceMinutes,
  };

  const guidedDemandPerPointPerHour = hasInteractivePoints ? input.guidedFlow * guidedFraction : 0;
  const independentDemandPerPointPerHour = hasInteractivePoints ? input.independentFlow * independentFraction : 0;
  const demandPerPointPerHour = guidedDemandPerPointPerHour + independentDemandPerPointPerHour;
  const nominalCapacityPerStationPerHour = input.usersPerStation * 60 / stationCycleMinutes;
  const sustainableCapacityPerStationPerHour = nominalCapacityPerStationPerHour * targetFraction;
  const averageRequiredStationsPerPoint = ceilCount(demandPerPointPerHour / sustainableCapacityPerStationPerHour);

  // A guide arrives with a batch. The expected participating portion is rounded
  // up to whole people. Parallel stations must fit that batch into the point's
  // route budget, not just pass an hourly-average test.
  const guidedBatchParticipants = hasInteractivePoints && input.guidedFlow > 0
    ? ceilCount(input.groupSize * guidedFraction) : 0;
  const oneWaveStations = ceilCount(guidedBatchParticipants / input.usersPerStation);
  const requiredGroupParallelStations = guidedBatchParticipants === 0 ? 0
    : wavesWithinBudget > 0 ? ceilCount(guidedBatchParticipants / (input.usersPerStation * wavesWithinBudget)) : null;
  const guidedBatchFeasible = guidedBatchParticipants === 0 || requiredGroupParallelStations !== null;
  // When the cycle itself is too long, no finite station count can make it fit.
  // Keep an informative one-wave hardware estimate, but flag infeasibility.
  const requiredStationsPerPoint = Math.max(
    averageRequiredStationsPerPoint, requiredGroupParallelStations ?? oneWaveStations,
  );
  const requiredStationsTotal = requiredStationsPerPoint * interactivePointCount;
  const existingStationsTotal = input.existingStationsPerPoint * interactivePointCount;
  const additionalStationsPerPoint = Math.max(0, requiredStationsPerPoint - input.existingStationsPerPoint);
  const additionalStationsTotal = additionalStationsPerPoint * interactivePointCount;
  const existingCapacityPerPointPerHour = input.existingStationsPerPoint * nominalCapacityPerStationPerHour;
  const existingSustainableCapacityPerPointPerHour = existingCapacityPerPointPerHour * targetFraction;
  const nominalCapacityPerPointPerHour = requiredStationsPerPoint * nominalCapacityPerStationPerHour;
  const sustainableCapacityPerPointPerHour = nominalCapacityPerPointPerHour * targetFraction;
  const existingUtilization = existingCapacityPerPointPerHour > 0
    ? demandPerPointPerHour / existingCapacityPerPointPerHour : demandPerPointPerHour === 0 ? 0 : null;
  const proposedUtilization = nominalCapacityPerPointPerHour > 0 ? demandPerPointPerHour / nominalCapacityPerPointPerHour : 0;
  const guidedBatchWaves = guidedBatchParticipants === 0 ? 0
    : requiredStationsPerPoint > 0 ? ceilCount(guidedBatchParticipants / (requiredStationsPerPoint * input.usersPerStation)) : null;
  const guidedBatchDurationMinutes = guidedBatchWaves === null ? null : guidedBatchWaves * stationCycleMinutes;
  const guidedExistingBatchWaves = guidedBatchParticipants === 0 ? 0
    : input.existingStationsPerPoint > 0 ? ceilCount(guidedBatchParticipants / (input.existingStationsPerPoint * input.usersPerStation)) : null;
  const guidedExistingBatchDurationMinutes = guidedExistingBatchWaves === null ? null : guidedExistingBatchWaves * stationCycleMinutes;
  const capacity = {
    representativePointExists: hasInteractivePoints,
    pointCount, interactivePointCount,
    guidedDemandPerPointPerHour, independentDemandPerPointPerHour, demandPerPointPerHour,
    nominalCapacityPerStationPerHour, sustainableCapacityPerStationPerHour,
    averageRequiredStationsPerPoint, requiredGroupParallelStations,
    requiredStationsPerPoint, requiredStationsTotal,
    existingStationsPerPoint: input.existingStationsPerPoint,
    existingStationsTotal, additionalStationsPerPoint, additionalStationsTotal,
    plannedStationsTotal: existingStationsTotal + additionalStationsTotal,
    existingCapacityPerPointPerHour, existingSustainableCapacityPerPointPerHour,
    nominalCapacityPerPointPerHour, sustainableCapacityPerPointPerHour,
    sustainableCapacityDeltaPerPointPerHour: sustainableCapacityPerPointPerHour - existingSustainableCapacityPerPointPerHour,
    existingCapacityHeadroomPerPointPerHour: existingSustainableCapacityPerPointPerHour - demandPerPointPerHour,
    proposedCapacityHeadroomPerPointPerHour: sustainableCapacityPerPointPerHour - demandPerPointPerHour,
    // Alias makes it explicit which point-level capacity the UI displays.
    sustainableCapacity: sustainableCapacityPerPointPerHour,
    demandAllPointsPerHour: demandPerPointPerHour * interactivePointCount,
    simultaneousActiveUsersPerPoint: demandPerPointPerHour * input.experienceMinutes / 60,
    simultaneousOccupiedSlotsPerPoint: demandPerPointPerHour * stationCycleMinutes / 60,
    targetUtilization: targetFraction, existingUtilization, proposedUtilization,
    existingUtilizationPercent: existingUtilization === null ? null : existingUtilization * 100,
    proposedUtilizationPercent: proposedUtilization * 100,
    guidedBatchParticipants, guidedBatchFeasible,
    guidedBatchWaves, guidedBatchDurationMinutes,
    guidedExistingBatchWaves, guidedExistingBatchDurationMinutes,
    guidedBatchFitsBudget: guidedBatchParticipants === 0 || (guidedBatchDurationMinutes !== null
      && guidedBatchDurationMinutes <= guidedPointBudgetMinutes + 1e-9),
    guidedExistingBatchFitsBudget: guidedBatchParticipants === 0 || (guidedExistingBatchDurationMinutes !== null
      && guidedExistingBatchDurationMinutes <= guidedPointBudgetMinutes + 1e-9),
    fullGroupStationsForOneWave: input.guidedFlow > 0 ? ceilCount(input.groupSize / input.usersPerStation) : 0,
    spectatorScreensForOneGroup: input.guidedFlow > 0 ? ceilCount(input.groupSize / input.spectatorsPerGroupScreen) : 0,
  };

  const interactiveSurfaces = requiredStationsTotal * input.surfacesPerStation;
  const existingInteractiveSurfaces = existingStationsTotal * input.surfacesPerStation;
  const fixedSurfaces = input.fixedContentSurfaces + input.navigationSurfaces;
  const additionalSurfaces = additionalStationsTotal * input.surfacesPerStation;
  const surfaces = {
    interactive: interactiveSurfaces,
    fixedContent: input.fixedContentSurfaces,
    navigation: input.navigationSurfaces,
    total: interactiveSurfaces + fixedSurfaces,
    existingInteractive: existingInteractiveSurfaces,
    existingTotal: existingInteractiveSurfaces + fixedSurfaces,
    existingSurfacesTotal: existingInteractiveSurfaces + fixedSurfaces,
    additional: additionalSurfaces,
    additionalSurfaces,
    plannedTotal: existingInteractiveSurfaces + fixedSurfaces + additionalSurfaces,
    surplusComparedToMinimum: Math.max(0, existingInteractiveSurfaces - interactiveSurfaces),
  };

  const districtAreaTotalM2 = AREA.totalM2 - input.commonArea;
  const reservePercent = Math.max(0, 100 - input.heroPercent - input.interactivePercent - input.servicePercent);
  const heroAreaM2 = districtAreaTotalM2 * input.heroPercent / 100;
  const interactiveAreaM2 = districtAreaTotalM2 * input.interactivePercent / 100;
  const serviceAreaM2 = districtAreaTotalM2 * input.servicePercent / 100;
  const reserveAreaM2 = districtAreaTotalM2 * reservePercent / 100;
  // service contains an unspecified mix of technical rooms/corridors/rest areas;
  // reserve use is also unknown. Neither is automatically counted as accessible.
  const visitorAccessibleAreaM2 = input.commonArea + heroAreaM2 + interactiveAreaM2;
  const areas = {
    totalM2: AREA.totalM2,
    lowerLevelM2: AREA.lowerLevelM2,
    upperLevelM2: AREA.upperLevelM2,
    commonAreaM2: input.commonArea, districtAreaTotalM2,
    districtAreaAverageM2: districtAreaTotalM2 / districtsCount,
    heroAreaM2, interactiveAreaM2, serviceAreaM2, reserveAreaM2, reservePercent,
    visitorAccessibleAreaM2,
    visitorAccessibleIncludingReserveM2: visitorAccessibleAreaM2 + reserveAreaM2,
    grossM2PerVisitor: totalOccupancy > 0 ? AREA.totalM2 / totalOccupancy : null,
    accessibleM2PerVisitor: totalOccupancy > 0 ? visitorAccessibleAreaM2 / totalOccupancy : null,
    visitorsPerAccessibleM2: visitorAccessibleAreaM2 > 0 ? totalOccupancy / visitorAccessibleAreaM2
      : totalOccupancy === 0 ? 0 : null,
    interactiveAreaPerPointM2: interactivePointCount > 0 ? interactiveAreaM2 / interactivePointCount : null,
    interactiveAreaPerRequiredStationM2: requiredStationsTotal > 0 ? interactiveAreaM2 / requiredStationsTotal : null,
    districtDistribution: input.districtAreas === null ? 'equal-assumption' : 'provided-areas',
  };
  const districtAreas = input.districtAreas ?? Array(districtsCount).fill(districtAreaTotalM2 / districtsCount);
  const districts = districtAreas.map((areaM2, index) => {
    const commonAllocationM2 = input.commonArea / districtsCount;
    const accessibleWithCommonAllocationM2 = commonAllocationM2
      + areaM2 * (input.heroPercent + input.interactivePercent) / 100;
    return {
      id: `district-${index + 1}`, index, areaM2,
      heroAreaM2: areaM2 * input.heroPercent / 100,
      interactiveAreaM2: areaM2 * input.interactivePercent / 100,
      serviceAreaM2: areaM2 * input.servicePercent / 100,
      reserveAreaM2: areaM2 * reservePercent / 100,
      commonAllocationM2, accessibleWithCommonAllocationM2,
      guidedOccupancy: guidedOccupancy / districtsCount,
      independentOccupancy: independentOccupancy / districtsCount,
      totalOccupancy: totalOccupancy / districtsCount,
      guidedGroupsAverage: guidedGroupsInPark / districtsCount,
      guidedGroupsPeak: ceilCount(guidedGroupsInPark / districtsCount),
      accessibleM2PerVisitor: totalOccupancy > 0
        ? accessibleWithCommonAllocationM2 / (totalOccupancy / districtsCount) : null,
      points: input.pointsPerDistrict,
      interactivePoints: input.interactivePointsPerDistrict,
      requiredStations: requiredStationsPerPoint * input.interactivePointsPerDistrict,
      existingStations: input.existingStationsPerPoint * input.interactivePointsPerDistrict,
      additionalStations: additionalStationsPerPoint * input.interactivePointsPerDistrict,
      interactiveSurfaces: requiredStationsPerPoint * input.interactivePointsPerDistrict * input.surfacesPerStation,
    };
  });

  if (input.guidedFlow > 0 && rawDistrictContentMinutes <= 0) {
    warnings.push(issue('no_guided_point_budget', 'transitionPerDistrictMinutes', 'Переходы занимают всё время округа или больше; времени на точки не остаётся.'));
  }
  if (guidedBatchParticipants > 0 && !guidedBatchFeasible) {
    warnings.push(issue('cycle_exceeds_point_budget', 'experienceMinutes', 'Даже один цикл станции длиннее бюджета остановки. Добавление параллельных станций само по себе не исправит расписание.'));
  }
  if (guidedBatchParticipants > 0 && !capacity.guidedExistingBatchFitsBudget) {
    warnings.push(issue('installed_batch_does_not_fit', 'existingStationsPerPoint', 'Имеющиеся станции не обслужат участвующую часть экскурсионной группы за бюджет остановки.'));
  }
  if (demandPerPointPerHour > existingSustainableCapacityPerPointPerHour + 1e-9) {
    warnings.push(issue('installed_capacity_below_target', 'existingStationsPerPoint', 'Спрос выше пропускной способности имеющихся станций при выбранной целевой загрузке.'));
  }
  if (input.guidedFlow > 0 && time.expectedGuidedInteractiveVisits > time.guidedRoutePointCount + 1e-9) {
    warnings.push(issue('guided_participation_exceeds_route', 'guidedParticipation', 'Ожидаемое число активных посещений интерактивов больше числа остановок маршрута; согласуйте долю участия и маршрут.'));
  }
  if (input.guidedFlow > 0
    && time.expectedGuidedActiveMinutes + time.guidedTransitionMinutes > input.guidedMinutes + 1e-9) {
    warnings.push(issue('guided_active_time_exceeds_visit', 'guidedMinutes', 'Активное взаимодействие и переходы уже превышают длительность экскурсии, даже без просмотра главных инсталляций и ожидания.'));
  }
  if (input.independentFlow > 0 && time.expectedIndependentActiveMinutes > input.independentMinutes + 1e-9) {
    warnings.push(issue('independent_active_time_exceeds_visit', 'independentMinutes', 'Ожидаемое активное взаимодействие само по себе превышает самостоятельный визит; доли участия и длительность несовместимы.'));
  }
  if (hasInteractivePoints && demandPerPointPerHour > 0 && interactiveAreaM2 === 0) {
    warnings.push(issue('no_interactive_area', 'interactivePercent', 'Интерактивные точки предусмотрены, но площадь для них равна нулю.'));
  }
  if (totalOccupancy > 0 && visitorAccessibleAreaM2 === 0) {
    warnings.push(issue('no_accessible_area', 'commonArea', 'В выбранном распределении нет площади, явно отнесённой к доступной посетителям.'));
  }
  const result = {
    valid: true, input, errors: [], warnings, areas, flows, time, capacity, surfaces, districts,
    assumptions: [
      'Площадь двух уровней фиксирована по main-floors.json; эта модель не проверяет геометрию расстановки.',
      'Все интерактивные точки представлены одной типовой точкой. Доля участия относится к каждой такой точке, а не делится на число округов.',
      'Одновременное присутствие рассчитано для установившегося входного потока; длительность самостоятельного визита задаётся отдельно.',
      'Пребывание распределено поровну между восемью округами. При заданных разных площадях время по округам остаётся равным.',
      'Групповая проверка использует округлённую вверх участвующую часть группы и свободные станции. Она не моделирует столкновение с самостоятельным потоком и не гарантирует отсутствие очередей.',
      'Процент участия описывает активное использование; остальные посетители группы могут смотреть. Просмотр всеми участниками требует отдельной проверки зрительской зоны.',
      'Два установленных поста на точку и фиксированные 12 контентных плюс 12 навигационных поверхностей — редактируемая гипотеза, объясняющая базу 168, а не восстановленный реестр оборудования.',
      'Доступная посетителям площадь здесь включает общую зону, главные инсталляции и интерактивы. Служебная смешанная категория и резерв показаны отдельно; плотность не является нормативной вместимостью.',
      'Количество общих экранов для просмотра группой показано отдельным индикатором и не прибавляется автоматически к фиксированным поверхностям.',
    ],
  };
  if (!finiteTree(result)
    || !Number.isSafeInteger(pointCount)
    || !Number.isSafeInteger(interactivePointCount)
    || !Number.isSafeInteger(requiredStationsTotal)
    || !Number.isSafeInteger(existingStationsTotal)
    || !Number.isSafeInteger(capacity.plannedStationsTotal)
    || !Number.isSafeInteger(surfaces.total)
    || !Number.isSafeInteger(surfaces.existingTotal)) {
    return invalidResult({
      valid: false, input, warnings,
      errors: [issue('numeric_range_exceeded', null, 'Параметры выходят за пределы безопасного числового расчёта. Уменьшите значения.')],
    });
  }
  return result;
}
