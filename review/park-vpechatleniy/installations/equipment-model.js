/**
 * Equipment quantities are the editable inputs. Sources, areas and visitor facts
 * stay in equipment-data.json; quantities never manufacture a visitor forecast.
 * This module has no DOM, storage, rendering or network side effects.
 */

const owns = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const numeric = value => (value == null || typeof value === 'boolean' || typeof value === 'string' && value.trim() === '') ? NaN : Number(value);
const round = value => Math.round((value + Number.EPSILON) * 1e6) / 1e6;
const list = value => Array.isArray(value) ? value : [];

export function normalizeHallId(value) {
  if (value == null || value === '') return null;
  const match = /^(?:RGO-)?(\d{1,2})$/.exec(String(value));
  return match ? `RGO-${match[1].padStart(2, '0')}` : String(value);
}

function validQuantity(group, value, fallback = group.defaultQuantity || 0) {
  const number = numeric(value);
  const maximum = finite(group.maxQuantity) ? Math.max(0, Math.floor(group.maxQuantity)) : 100;
  return Math.min(maximum, Math.max(0, Math.round(Number.isFinite(number) ? number : fallback)));
}

function validPosition(value, floorId) {
  if (!value || !finite(value.x) || !finite(value.z)) return null;
  const floor = ['main', 'upper'].includes(value.floorId) ? value.floorId : floorId;
  return { x: value.x, z: value.z, yaw: finite(value.yaw) ? value.yaw : finite(value.rotationY) ? value.rotationY : 0,
    floorId: floor, y: finite(value.y) ? value.y : floor === 'upper' ? 13.2 : 7.2,
    ...(value.sourceId ? { sourceId: String(value.sourceId) } : {}) };
}

/** A fresh state has one quantity per group and no edited coordinates. */
export function createDefaultState(data) {
  const quantities = {};
  for (const group of list(data?.groups)) quantities[group.id] = validQuantity(group, group.defaultQuantity);
  return { quantities, positions: {} };
}

/** Ignore obsolete groups and malformed data without allowing negative counts. */
export function normalizeState(data, state) {
  const next = createDefaultState(data);
  for (const group of list(data?.groups)) {
    if (owns(state?.quantities, group.id)) next.quantities[group.id] = validQuantity(group, state.quantities[group.id]);
    for (let index = 1; index <= next.quantities[group.id]; index++) {
      const id = `${group.id}::${index}`;
      const position = validPosition(state?.positions?.[id], group.floorId);
      if (position) next.positions[id] = position;
    }
  }
  return next;
}

/** Pure quantity edit. Removing a copy does not renumber the remaining copies. */
export function setQuantity(data, state, groupId, count) {
  const next = normalizeState(data, state);
  const group = list(data?.groups).find(item => item.id === groupId);
  if (!group) return next;
  next.quantities[groupId] = validQuantity(group, count, next.quantities[groupId]);
  return normalizeState(data, next);
}

function typeMap(data) {
  return new Map((Array.isArray(data?.catalog) ? data.catalog : Object.values(data?.catalog || {})).map(type => [type.id, type]));
}

function matchesScope(item, scope = {}) {
  return (!scope.regionId || scope.regionId === item.regionId)
    && (!scope.hallId || normalizeHallId(scope.hallId) === normalizeHallId(item.hallId))
    && (!scope.floorId || scope.floorId === item.floorId)
    && (!scope.zoneId || scope.zoneId === item.zoneId)
    && (!scope.exhibitId || scope.exhibitId === item.exhibitId);
}

/**
 * Expand quantities to stable physical identities. Unseeded copies have no
 * invented location: the spatial planner must find and validate their position.
 */
export function getInstances(data, state) {
  const normalized = normalizeState(data, state);
  const types = typeMap(data), instances = [];
  for (const group of list(data?.groups)) {
    const type = types.get(group.typeId) || {};
    const count = normalized.quantities[group.id];
    for (let index = 0; index < count; index++) {
      const id = `${group.id}::${index + 1}`;
      const seed = list(group.seedInstances)[index];
      const seedPosition = validPosition(seed, group.floorId);
      const position = validPosition(normalized.positions[id], group.floorId) || seedPosition;
      instances.push({
        id, groupId: group.id, index: index + 1, name: group.name,
        typeId: group.typeId, typeName: type.name || group.name, category: type.category || 'equipment', color: type.color || '#aebcb5',
        regionId: group.regionId, zoneId: group.zoneId, hallId: normalizeHallId(group.hallId), hallName: group.hallName || null,
        floorId: position?.floorId || group.floorId, exhibitId: group.exhibitId || null, exhibitName: group.exhibitName || group.name,
        dimensions: { ...group.dimensions }, displayDimensions: { ...(group.displayDimensions || group.dimensions) },
        contentIds: [...list(group.contentIds)], contentChannel: group.contentChannel || null,
        position: position ? { ...position } : null, seedPosition: seedPosition ? { ...seedPosition } : null,
        sourceId: seed?.sourceId || seed?.id || null, anchor: group.anchor ? { ...group.anchor } : null,
        mountingBottomM: finite(group.mountingBottomM) ? Math.max(0,group.mountingBottomM) : 0,
        embedded: Boolean(group.embedded), installationMode: group.embedded ? 'embedded' : 'standalone',
        footprint: seed?.footprint || null,
      });
    }
  }
  return instances;
}

function unitNumber(group, type, key, fallback = 0) {
  const value = owns(group, key) ? group[key] : type[key];
  return finite(value) ? Math.max(0, value) : fallback;
}

/** Real cabinet grids are integer products; tiny floating error cannot add a row. */
export function getUnitMetrics(data, group) {
  const type = typeMap(data).get(group.typeId) || {};
  const d = group.displayDimensions || group.dimensions || {};
  const width = finite(d.widthM) ? Math.max(0, d.widthM) : 0;
  const height = finite(d.heightM) ? Math.max(0, d.heightM) : 0;
  const screenUnits = unitNumber(group, type, 'screenUnits');
  const led = Boolean(type.led);
  const profile = data.cabinetProfile || {};
  const columns = led && profile.widthM > 0 ? Math.ceil(width / profile.widthM - 1e-8) : 0;
  const rows = led && profile.heightM > 0 ? Math.ceil(height / profile.heightM - 1e-8) : 0;
  const ledAreaM2 = columns * rows * (profile.widthM || 0) * (profile.heightM || 0) * screenUnits;
  const passive = group.powerRequired === false;
  const declaredPowerW = finite(group.maximumPowerW) ? group.maximumPowerW : finite(type.maximumPowerW) ? type.maximumPowerW : null;
  const ledMaximumW = led && finite(profile.maximumWPerM2) ? ledAreaM2 * profile.maximumWPerM2 : null;
  const maximumPowerW = passive ? 0 : declaredPowerW ?? ledMaximumW;
  return {
    screens: screenUnits, ledScreens: led ? screenUnits : 0, ledCabinets: columns * rows * screenUnits,
    cabinetColumns: columns, cabinetRows: rows,
    pixelWidth: columns * (profile.pixelsWide || 0), pixelHeight: rows * (profile.pixelsHigh || 0),
    screenAreaM2: round(led ? ledAreaM2 : width * height * screenUnits), ledAreaM2: round(ledAreaM2),
    interactiveStations: unitNumber(group, type, 'interactiveUnits'), interactivePlaces: unitNumber(group, type, 'interactivePlaces'),
    showcases: unitNumber(group, type, 'showcaseUnits'), vrStations: unitNumber(group, type, 'vrUnits'), projectors: unitNumber(group, type, 'projectorUnits'),
    footprintM2: round(Math.max(0, group.dimensions?.widthM || 0) * Math.max(0, group.dimensions?.depthM || 0)),
    maximumPowerW, powerKnown: maximumPowerW !== null, powerRequired: !passive,
    // LED values cover panels only. Their player/control hardware stays unknown.
    powerScope: led ? 'led-panels' : passive ? 'passive' : declaredPowerW !== null ? 'declared-equipment' : 'not-specified',
    knownLedMaximumW: ledMaximumW,
  };
}

/** Unique programmes are a set union; copies are delivery devices, not new films. */
export function getContentPlan(data, state, scope = {}) {
  const instances = getInstances(data, state).filter(item => matchesScope(item, scope));
  const groups = new Map(list(data?.groups).map(g => [g.id, g]));
  const active = new Map();
  for (const instance of instances) {
    const metrics = getUnitMetrics(data, groups.get(instance.groupId));
    for (const cid of instance.contentIds) {
      if (!active.has(cid)) active.set(cid, { devices: new Set(), screens: 0, groups: new Set(), regions: new Set(), halls: new Set(), channels: new Set(), formats: new Map() });
      const a = active.get(cid); a.devices.add(instance.id); a.screens += metrics.screens; a.groups.add(instance.groupId);
      if (instance.regionId) a.regions.add(instance.regionId);
      if (instance.hallId) a.halls.add(instance.hallId);
      a.channels.add(instance.contentChannel || 1);
      if (metrics.screens) {
        const format = { widthM: instance.displayDimensions.widthM, heightM: instance.displayDimensions.heightM,
          pixelWidth: metrics.pixelWidth || null, pixelHeight: metrics.pixelHeight || null };
        a.formats.set(JSON.stringify(format), format);
      }
    }
  }
  return list(data?.content).filter(c => {
    if (active.has(c.id)) return true;
    if (!c.alwaysRequired) return false;
    if (scope.exhibitId) return instances.some(i => i.contentIds.includes(c.id));
    if (scope.regionId && c.regionId !== scope.regionId) return false;
    if (scope.hallId && normalizeHallId(c.hallId) !== normalizeHallId(scope.hallId)) return false;
    if (scope.zoneId || scope.floorId) {
      // A hall still needs source texts when its equipment is removed. Source
      // programme work is not conditional on the number of new museum cases.
      const hall = list(data.halls).find(h => normalizeHallId(h.id) === normalizeHallId(c.hallId));
      if (hall) return (!scope.floorId || hall.floorId === scope.floorId) && (!scope.zoneId || hall.zoneId === scope.zoneId);
      const region = list(data.regions).find(r => r.id === c.regionId);
      return list(region?.floors).some(f => (!scope.floorId || f.id === scope.floorId) && (!scope.zoneId || f.zoneId === scope.zoneId));
    }
    return true;
  }).map(c => {
    const a = active.get(c.id);
    const channels = Math.max(1, a?.channels.size || 0);
    return { ...c, channels, deviceCount: a?.devices.size || 0, screenCount: a?.screens || 0,
      groupIds: [...(a?.groups || [])], regionIds: [...(a?.regions || [])], hallIds: [...(a?.halls || [])],
      deliveryFormats: [...(a?.formats.values() || [])], deliveryFormatCount: a?.formats.size || 0,
      linearMinutes: c.type === 'linear' && finite(c.durationMinutes) ? c.durationMinutes : 0,
      channelMinutes: c.type === 'linear' && finite(c.durationMinutes) ? round(c.durationMinutes * channels) : 0,
    };
  });
}

function areaForScope(data, scope) {
  if (scope.exhibitId) return null;
  if (scope.hallId) {
    const hall = list(data.halls).find(h => normalizeHallId(h.id) === normalizeHallId(scope.hallId));
    if (!hall || scope.regionId && hall.regionId !== scope.regionId) return null;
    if (scope.floorId && scope.floorId !== hall.floorId) return 0;
    return finite(hall.areaM2) ? hall.areaM2 : null;
  }
  if (scope.regionId) {
    const region = list(data.regions).find(r => r.id === scope.regionId);
    if (!region) return null;
    if (scope.floorId || scope.zoneId) {
      const floor = list(region.floors).find(f => (!scope.floorId || f.id === scope.floorId) && (!scope.zoneId || f.zoneId === scope.zoneId));
      return floor && finite(floor.areaM2) ? floor.areaM2 : floor ? null : 0;
    }
    return finite(region.areaM2) ? region.areaM2 : null;
  }
  if (scope.zoneId) {
    const floor = list(data.regions).flatMap(r => list(r.floors)).find(f => f.zoneId === scope.zoneId);
    return finite(floor?.areaM2) ? floor.areaM2 : null;
  }
  if (scope.floorId) return finite(data.facts?.floorAreasM2?.[scope.floorId]) ? data.facts.floorAreasM2[scope.floorId] : null;
  return finite(data.facts?.parkAreaM2) ? data.facts.parkAreaM2 : null;
}

/** Planned totals include unplaced additions. Map placement has separate totals. */
export function getSummary(data, state, scope = {}) {
  const instances = getInstances(data, state).filter(item => matchesScope(item, scope));
  const groups = new Map(list(data?.groups).map(g => [g.id, g]));
  const summary = { equipmentCount: instances.length, screens: 0, ledScreens: 0, ledCabinets: 0, screenAreaM2: 0, ledAreaM2: 0,
    interactiveStations: 0, interactivePlaces: 0, showcases: 0, vrStations: 0, projectors: 0, footprintM2: 0,
    powerKw: null, knownPowerKw: 0, knownPowerItems: 0, unknownPowerItems: 0, passiveItems: 0, digitalPrograms: 0, editorialPackages: 0,
    linearMinutes: 0, channelMinutes: 0, contentCount: 0, equipmentWithCoordinates: 0 };
  const summed = ['screens', 'ledScreens', 'ledCabinets', 'screenAreaM2', 'ledAreaM2', 'interactiveStations', 'interactivePlaces', 'showcases', 'vrStations', 'projectors', 'footprintM2'];
  let ledPanelOnly = false;
  for (const item of instances) {
    const metrics = getUnitMetrics(data, groups.get(item.groupId));
    for (const key of summed) summary[key] += metrics[key];
    if (item.position) summary.equipmentWithCoordinates++;
    if (!metrics.powerRequired) summary.passiveItems++;
    else if (metrics.powerKnown) { summary.knownPowerKw += metrics.maximumPowerW / 1000; summary.knownPowerItems++; }
    else summary.unknownPowerItems++;
    if (metrics.powerScope === 'led-panels') ledPanelOnly = true;
  }
  for (const key of ['screenAreaM2', 'ledAreaM2', 'footprintM2', 'knownPowerKw']) summary[key] = round(summary[key]);
  summary.powerCoverage = summary.unknownPowerItems || ledPanelOnly ? summary.knownPowerKw > 0 ? 'partial' : 'none' : 'complete';
  if (summary.powerCoverage === 'complete') summary.powerKw = summary.knownPowerKw;
  summary.powerLabel = summary.powerCoverage === 'complete' ? 'Мощность выбранного оборудования' : 'Мощность известных устройств';
  summary.powerIncludesPlayers = !ledPanelOnly && summary.unknownPowerItems === 0;
  const content = getContentPlan(data, state, scope);
  summary.contentCount = content.length;
  summary.digitalPrograms = content.filter(c => c.type !== 'editorial').length;
  summary.editorialPackages = content.filter(c => c.type === 'editorial').length;
  summary.interactivePrograms = content.filter(c => ['interactive', 'vr', 'navigation'].includes(c.type)).length;
  summary.linearPrograms = content.filter(c => c.type === 'linear').length;
  summary.linearMinutes = round(content.reduce((sum, c) => sum + c.linearMinutes, 0));
  summary.channelMinutes = round(content.reduce((sum, c) => sum + c.channelMinutes, 0));
  summary.areaM2 = areaForScope(data, scope); summary.areaKnown = summary.areaM2 !== null;
  summary.visitorsPerHour = null;
  return summary;
}
