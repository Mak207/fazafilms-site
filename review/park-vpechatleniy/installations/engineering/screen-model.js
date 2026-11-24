/** Pure scenario model. All defaults are editable proposals, not an AV specification.
 * Dimensions use metres; power is counted by unique equipment id, never content id.
 * BDM is an axial preliminary check using AVIXA's public factor 200, not full compliance.
 */
export const SCREEN_CATEGORY_KEYS = Object.freeze(['hero', 'interactive', 'media', 'common', 'navigation']);

export function geometry16x9(diagonalIn) {
  if (!Number.isFinite(diagonalIn) || diagonalIn <= 0) {
    return { valid: false, diagonalIn: null, widthM: null, heightM: null, areaM2: null, error: 'diagonalIn must be finite and positive' };
  }
  const diagonalM = diagonalIn * 0.0254;
  const widthM = diagonalM * 16 / Math.sqrt(337);
  const heightM = diagonalM * 9 / Math.sqrt(337);
  if (![widthM, heightM, widthM * heightM].every(Number.isFinite)) return { valid: false, diagonalIn: null, widthM: null, heightM: null, areaM2: null, error: 'geometry arithmetic overflow' };
  return { valid: true, diagonalIn, widthM, heightM, areaM2: widthM * heightM, error: null };
}

const dimensions = d => {
  const g = geometry16x9(d);
  return [g.widthM, g.heightM];
};
const type = (label, size, minimum, maximum, near, far, elementPercent, budget) => ({
  label, widthM: size[0], heightM: size[1],
  minDimensionsM: minimum, maxDimensionsM: maximum,
  nearDistanceM: near, farDistanceM: far, elementPercent,
  assumedDeviceBudgetW: budget,
});

export const DEFAULT_SCREEN_INPUT = Object.freeze({
  status: 'proposal',
  counts: { hero: 24, interactive: 72, media: 32, common: 12, navigation: 12, unassigned: 0 },
  types: {
    hero: type('Главные поверхности', [4, 2.25], [3, 1.6875], [5, 2.8125], 3, 10, 3, 700),
    interactive: type('Интерактивные поверхности', dimensions(75), dimensions(55), dimensions(86), 1.5, 3, 3, 320),
    media: type('Медийные поверхности', dimensions(75), dimensions(65), dimensions(86), 2, 6, 4, 320),
    common: type('Общепарковые поверхности', dimensions(98), dimensions(86), dimensions(120), 3, 8, 4, 500),
    navigation: type('Навигационные поверхности', dimensions(55), dimensions(55), dimensions(75), 1.5, 6, 5, 180),
  },
  auxiliaryEquipment: [],
  powerScopeComplete: false,
  missingPowerSubsystems: ['медиасерверы и плееры', 'контроллеры и органы ввода', 'сеть', 'звук', 'технологическое охлаждение'],
});

const issue = (field, message) => ({ field, message });
const positiveOrNull = x => x === null || (Number.isFinite(x) && x > 0);
const nonnegativeOrNull = x => x === null || (Number.isFinite(x) && x >= 0);
const clone = x => structuredClone(x);

/** Convert content-model's actual result counts; object displays stay unassigned. */
export function countsFromContentModel(result) {
  const c = result?.counts ?? result;
  if (!c || typeof c !== 'object') throw new TypeError('content-model counts are required');
  return {
    hero: c.heroSurfaces,
    interactive: c.interactiveSurfaces,
    media: c.mediaSurfaces,
    common: c.commonSurfaces,
    navigation: c.navigationSurfaces,
    unassigned: c.objectSurfaces ?? 0,
  };
}

/** q is a fraction: 3% => 0.03. Unknown inputs remain null. */
export function bdmPreview({ imageHeightM, elementFraction, farDistanceM }) {
  const errors = [];
  if (!positiveOrNull(imageHeightM)) errors.push(issue('imageHeightM', 'positive metres or null required'));
  if (!positiveOrNull(farDistanceM)) errors.push(issue('farDistanceM', 'positive metres or null required'));
  if (!positiveOrNull(elementFraction) || (elementFraction !== null && elementFraction > 1)) errors.push(issue('elementFraction', 'fraction in (0,1] or null required'));
  if (errors.length) return { valid: false, errors, pass: null, maxDistanceM: null, requiredImageHeightM: null, requiredElementFraction: null, marginM: null };
  const maxDistanceM = imageHeightM !== null && elementFraction !== null ? 200 * imageHeightM * elementFraction : null;
  const requiredImageHeightM = farDistanceM !== null && elementFraction !== null ? farDistanceM / (200 * elementFraction) : null;
  const requiredElementFraction = farDistanceM !== null && imageHeightM !== null ? farDistanceM / (200 * imageHeightM) : null;
  const marginM = maxDistanceM !== null && farDistanceM !== null ? maxDistanceM - farDistanceM : null;
  if (![maxDistanceM, requiredImageHeightM, requiredElementFraction, marginM].every(x => x === null || Number.isFinite(x))) return { valid: false, errors: [issue('BDM', 'arithmetic overflow')], pass: null, maxDistanceM: null, requiredImageHeightM: null, requiredElementFraction: null, marginM: null };
  return { valid: true, errors, pass: marginM === null ? null : marginM >= -1e-9, maxDistanceM, requiredImageHeightM, requiredElementFraction, marginM,
    method: 'axial_BDM_preview_factor_200', status: 'proposal', fullDiscasCompliance: false };
}

/** One physical device per id. Only explicit AC building loads enter this sum.
 * A repeated identical id is deduplicated; conflicting duplicate data are errors.
 */
export function summarizeEquipmentPower(equipment, { basis = 'budget' } = {}) {
  const field = { budget: 'budgetInputW', maximum: 'maximumInputW', operating: 'operatingInputW' }[basis];
  const errors = [];
  if (!field) errors.push(issue('basis', 'budget, maximum or operating required'));
  if (!Array.isArray(equipment)) errors.push(issue('equipment', 'array required'));
  if (errors.length) return { valid: false, errors, basis, totalW: null, partialKnownW: 0, unknownCount: 0 };
  const unique = new Map();
  for (const e of equipment) {
    if (!e || typeof e.id !== 'string' || !e.id.length) { errors.push(issue('equipment.id', 'nonempty physical equipment id required')); continue; }
    if (unique.has(e.id)) {
      const prior = unique.get(e.id);
      for (const k of ['powerBoundary', 'countAsBuildingLoad', 'budgetInputW', 'maximumInputW', 'operatingInputW']) {
        if ((prior[k] ?? null) !== (e[k] ?? null)) errors.push(issue(e.id, `conflicting duplicate ${k}`));
      }
      continue;
    }
    unique.set(e.id, e);
  }
  let knownCount = 0, unknownCount = 0, excludedCount = 0, partialKnownW = 0;
  for (const e of unique.values()) {
    if (e.countAsBuildingLoad === false || e.powerBoundary === 'passive') { excludedCount++; continue; }
    if (e.countAsBuildingLoad !== true || e.powerBoundary !== 'AC_input') { unknownCount++; continue; }
    const value = e[field] ?? null;
    if (!nonnegativeOrNull(value)) { errors.push(issue(`${e.id}.${field}`, 'nonnegative finite watts or null required')); unknownCount++; continue; }
    if (value === null) { unknownCount++; continue; }
    if (!Number.isFinite(partialKnownW + value)) { errors.push(issue('power', 'arithmetic overflow')); unknownCount++; continue; }
    knownCount++;
    partialKnownW += value;
  }
  return { valid: !errors.length, errors, basis, equipmentCount: unique.size, knownCount, unknownCount, excludedCount, partialKnownW,
    totalW: !errors.length && unknownCount === 0 ? partialKnownW : null,
    scope: 'listed_unique_equipment_only', status: basis === 'budget' ? 'proposal' : 'depends_on_equipment_evidence' };
}

function sizeResult(widthM, heightM) {
  if (widthM === null || heightM === null) return { widthM, heightM, areaM2: null, diagonalIn: null };
  return { widthM, heightM, areaM2: widthM * heightM, diagonalIn: Math.hypot(widthM, heightM) / 0.0254 };
}

function sumArea(rows, path, unassigned) {
  let knownAreaSumM2 = 0, specifiedAreaSurfaceCount = 0, unknownAreaSurfaceCount = unassigned;
  for (const row of rows) {
    const area = path(row);
    if (area === null) unknownAreaSurfaceCount += row.count;
    else { knownAreaSumM2 += area * row.count; specifiedAreaSurfaceCount += row.count; }
  }
  return { knownAreaSumM2, specifiedAreaSurfaceCount, unknownAreaSurfaceCount, totalActiveAreaM2: unknownAreaSurfaceCount ? null : knownAreaSumM2 };
}

export function validateScreenInput(input) {
  const errors = [];
  const allowedCounts = [...SCREEN_CATEGORY_KEYS, 'unassigned'];
  for (const key of Object.keys(input?.counts ?? {})) if (!allowedCounts.includes(key)) errors.push(issue(`counts.${key}`, 'unknown count key; use unassigned for unclassified surfaces'));
  for (const key of [...SCREEN_CATEGORY_KEYS, 'unassigned']) {
    const value = input?.counts?.[key];
    if (!Number.isInteger(value) || value < 0) errors.push(issue(`counts.${key}`, 'nonnegative integer required'));
  }
  const totalCount = allowedCounts.reduce((sum, key) => sum + (input?.counts?.[key] ?? 0), 0);
  if (totalCount > 10000) errors.push(issue('counts', 'scenario data guard: maximum 10000 surfaces; this is a software limit, not an AV norm'));
  for (const key of SCREEN_CATEGORY_KEYS) {
    const t = input?.types?.[key];
    if (!t || typeof t !== 'object') { errors.push(issue(`types.${key}`, 'type settings required')); continue; }
    for (const field of ['widthM', 'heightM', 'nearDistanceM', 'farDistanceM']) if (!positiveOrNull(t[field])) errors.push(issue(`types.${key}.${field}`, 'positive metres or null required'));
    if (!positiveOrNull(t.elementPercent) || (t.elementPercent !== null && t.elementPercent > 100)) errors.push(issue(`types.${key}.elementPercent`, '(0,100] or null required'));
    if (t.nearDistanceM !== null && t.farDistanceM !== null && t.nearDistanceM > t.farDistanceM) errors.push(issue(`types.${key}.nearDistanceM`, 'near must not exceed far'));
    if (!nonnegativeOrNull(t.assumedDeviceBudgetW)) errors.push(issue(`types.${key}.assumedDeviceBudgetW`, 'nonnegative watts or null required'));
    if (t.widthM !== null && t.heightM !== null && !Number.isFinite(t.widthM * t.heightM * (input.counts[key] ?? 0))) errors.push(issue(`types.${key}`, 'area arithmetic overflow'));
    const preview = bdmPreview({ imageHeightM: t.heightM, elementFraction: t.elementPercent === null ? null : t.elementPercent / 100, farDistanceM: t.farDistanceM });
    if (!preview.valid) errors.push(issue(`types.${key}`, 'invalid or overflowing BDM input'));
    for (const field of ['minDimensionsM', 'maxDimensionsM']) {
      const d = t[field];
      if (d !== null && (!Array.isArray(d) || d.length !== 2 || !d.every(positiveOrNull))) errors.push(issue(`types.${key}.${field}`, 'pair of positive metres/null, or null required'));
      if (Array.isArray(d) && d.length === 2 && d.every(x => x !== null) && !Number.isFinite(d[0] * d[1] * (input.counts[key] ?? 0))) errors.push(issue(`types.${key}.${field}`, 'area arithmetic overflow'));
    }
    if (Array.isArray(t.minDimensionsM) && Array.isArray(t.maxDimensionsM) && t.minDimensionsM.length === 2 && t.maxDimensionsM.length === 2) {
      for (let i = 0; i < 2; i++) if (t.minDimensionsM[i] !== null && t.maxDimensionsM[i] !== null && t.minDimensionsM[i] > t.maxDimensionsM[i]) errors.push(issue(`types.${key}.minDimensionsM`, 'range minimum exceeds maximum'));
    }
  }
  for (const rangeField of [null, 'minDimensionsM', 'maxDimensionsM']) {
    const sum = SCREEN_CATEGORY_KEYS.reduce((acc, key) => {
      const t = input?.types?.[key];
      const d = rangeField ? t?.[rangeField] : [t?.widthM, t?.heightM];
      return acc + (Array.isArray(d) && d.every(x => x !== null && Number.isFinite(x)) ? d[0] * d[1] * (input.counts[key] ?? 0) : 0);
    }, 0);
    if (!Number.isFinite(sum)) errors.push(issue('area', 'aggregate area arithmetic overflow'));
  }
  if (!Array.isArray(input?.auxiliaryEquipment)) errors.push(issue('auxiliaryEquipment', 'array required'));
  if (typeof input?.powerScopeComplete !== 'boolean') errors.push(issue('powerScopeComplete', 'boolean required'));
  return { valid: !errors.length, errors };
}

/** Override counts/types explicitly; no coordinates or mounting clearances are generated.
 * `equipment` optionally replaces generated device assumptions; `auxiliaryEquipment` adds shared devices.
 */
export function computeScreenScenario(overrides = {}) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return { valid: false, errors: [issue('input', 'object required')], totals: null, categories: [], power: null };
  const input = clone(DEFAULT_SCREEN_INPUT);
  input.counts = { ...input.counts, ...(overrides.counts ?? {}) };
  for (const key of SCREEN_CATEGORY_KEYS) input.types[key] = { ...input.types[key], ...(overrides.types?.[key] ?? {}) };
  for (const key of ['auxiliaryEquipment', 'powerScopeComplete', 'missingPowerSubsystems']) if (Object.hasOwn(overrides, key)) input[key] = overrides[key];
  const validation = validateScreenInput(input);
  if (!validation.valid) return { ...validation, input, totals: null, categories: [], power: null };
  const categories = SCREEN_CATEGORY_KEYS.map(key => {
    const t = input.types[key], count = input.counts[key];
    const size = sizeResult(t.widthM, t.heightM);
    const elementFraction = t.elementPercent === null ? null : t.elementPercent / 100;
    const bdm = bdmPreview({ imageHeightM: t.heightM, elementFraction, farDistanceM: t.farDistanceM });
    const lower = sizeResult(...(t.minDimensionsM ?? [null, null]));
    const upper = sizeResult(...(t.maxDimensionsM ?? [null, null]));
    lower.bdm = bdmPreview({ imageHeightM: lower.heightM, elementFraction, farDistanceM: t.farDistanceM });
    upper.bdm = bdmPreview({ imageHeightM: upper.heightM, elementFraction, farDistanceM: t.farDistanceM });
    return { key, label: t.label, count, ...size, totalAreaM2: count === 0 ? 0 : size.areaM2 === null ? null : count * size.areaM2,
      nearDistanceM: t.nearDistanceM, farDistanceM: t.farDistanceM, elementPercent: t.elementPercent, bdm, range: { lower, upper },
      assumedDeviceBudgetW: t.assumedDeviceBudgetW, maximumInputW: null, massKg: null, position: null, mounting: null, status: 'proposal' };
  });
  const area = sumArea(categories, row => row.areaM2, input.counts.unassigned);
  const range = {
    lower: sumArea(categories, row => row.range.lower.areaM2, input.counts.unassigned),
    upper: sumArea(categories, row => row.range.upper.areaM2, input.counts.unassigned),
    lowerReadabilityFailures: categories.filter(row => row.count > 0 && row.range.lower.bdm.pass === false).map(row => row.key),
    upperReadabilityFailures: categories.filter(row => row.count > 0 && row.range.upper.bdm.pass === false).map(row => row.key),
    status: 'independent_editable_size_scenarios_not_confidence_interval',
  };
  const generatedEquipment = categories.flatMap(row => Array.from({ length: row.count }, (_, i) => ({
    id: `${row.key}-display-${String(i + 1).padStart(3, '0')}`, category: row.key,
    surfaceId: `${row.key}-surface-${String(i + 1).padStart(3, '0')}`,
    powerBoundary: 'AC_input', countAsBuildingLoad: true,
    budgetInputW: row.assumedDeviceBudgetW, maximumInputW: null, operatingInputW: null,
    massKg: null, mounting: null, model: null, status: 'proposal',
  })));
  const baseEquipment = Object.hasOwn(overrides, 'equipment') ? overrides.equipment : generatedEquipment;
  if (!Array.isArray(baseEquipment)) return { valid: false, errors: [issue('equipment', 'array required')], input, categories, totals: null, power: null };
  const equipment = [...baseEquipment, ...input.auxiliaryEquipment];
  const budget = summarizeEquipmentPower(equipment, { basis: 'budget' });
  const maximum = summarizeEquipmentPower(equipment, { basis: 'maximum' });
  const operating = summarizeEquipmentPower(equipment, { basis: 'operating' });
  const errors = [...budget.errors, ...maximum.errors, ...operating.errors];
  const warnings = [];
  for (const row of categories) if (row.count > 0 && row.bdm.pass === false) warnings.push(issue(`types.${row.key}`, 'Дальняя позиция превышает предварительный осевой BDM-предел; увеличить изображение/важный элемент или уменьшить дистанцию.'));
  if (area.unknownAreaSurfaceCount) warnings.push(issue('area', 'Площадь части поверхностей неизвестна: показана только частичная сумма.'));
  if (input.counts.unassigned) warnings.push(issue('counts.unassigned', 'Есть поверхности без типоразмера и без установленной связи с оборудованием.'));
  const scopeComplete = input.powerScopeComplete && input.counts.unassigned === 0;
  return { valid: !errors.length, errors, warnings, input, categories, equipment,
    totals: { surfaceCount: Object.values(input.counts).reduce((a, b) => a + b, 0), ...area },
    range, power: { budget, maximum, operating, scopeComplete, missingSurfaceEquipmentMappings: input.counts.unassigned,
      fullParkBudgetW: scopeComplete ? budget.totalW : null, fullParkMaximumW: scopeComplete ? maximum.totalW : null,
      missingSubsystems: input.missingPowerSubsystems,
      generationAssumption: Object.hasOwn(overrides, 'equipment') ? 'explicit_equipment_registry' : 'one_display_device_per_surface_plus_listed_auxiliary',
      visitorUtilizationAffectsPower: false },
    status: 'proposal', positionsGenerated: false, fullDiscasCompliance: false,
  };
}
