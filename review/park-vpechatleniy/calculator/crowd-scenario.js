import { AREA, DEFAULT_INPUT, computePark } from './model.js';

export const CROWD_SCENARIO_KEY = 'park-impressions:scenario:v1';
export const CROWD_SCENARIO_CHANNEL = 'park-impressions-scenario-v1';
export const CROWD_SCENARIO_EVENT = 'park-scenario-change';

/** The slider follows the calculated simultaneous load, not an evacuation limit. */
export function capacityFromScenario(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.valid === false || raw.result?.valid === false) return null;
  const input = raw.input ?? raw;
  const result = computePark(input);
  const occupancy = result.flows?.totalOccupancy;
  if (!result.valid || !Number.isFinite(occupancy) || occupancy < 0) return null;
  const limit = Math.max(0, Math.ceil(occupancy - Number.EPSILON * Math.max(1, occupancy) * 8));
  if (!Number.isSafeInteger(limit)) return null;
  const share = raw.view?.floorShare;
  return {
    schema: 1, valid: true, limit, occupancy,
    input: result.input,
    view: { floorShare: Number.isFinite(share) && share >= 0 && share <= 100
      ? share : AREA.lowerLevelM2 / AREA.totalM2 * 100 },
    source: raw.source || 'calculator',
  };
}

export function parseStoredScenario(serialized) {
  try {
    if (typeof serialized !== 'string' || serialized.length > 16000) return null;
    const value = JSON.parse(serialized);
    return value?.schema === 1 ? capacityFromScenario(value) : null;
  } catch { return null; }
}

export function parseScenarioLink(href) {
  try {
    const encoded = new URL(href).searchParams.get('parkScenario');
    if (!encoded || encoded.length >= 6000) return null;
    const value = JSON.parse(decodeURIComponent(escape(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')))));
    return capacityFromScenario({ input: value, view: value, source: 'link' });
  } catch { return null; }
}

export const defaultCrowdCapacity = () => capacityFromScenario({ input: DEFAULT_INPUT, source: 'default' });

let lastPublished = '';
let channel = null;

/** Called after each calculator render. Shared state contains inputs, never a trusted count. */
export function publishCrowdScenario(raw, host = globalThis.window) {
  if (!host) return null;
  const capacity = capacityFromScenario(raw);
  const detail = capacity ? { schema: 1, valid: true, input: capacity.input, view: capacity.view, source: 'calculator' }
    : { schema: 1, valid: false, source: 'calculator' };
  const serialized = JSON.stringify(detail);
  if (serialized === lastPublished) return capacity;
  lastPublished = serialized;
  host.__parkCrowdScenario = detail;
  if (capacity) {
    try { host.localStorage.setItem(CROWD_SCENARIO_KEY, serialized); } catch { /* Private browsing still supports events. */ }
  }
  host.dispatchEvent(new host.CustomEvent(CROWD_SCENARIO_EVENT, { detail }));
  try {
    if (!channel && host.BroadcastChannel) channel = new host.BroadcastChannel(CROWD_SCENARIO_CHANNEL);
    channel?.postMessage(detail);
  } catch { /* Same-origin parent and storage are independent fallbacks. */ }
  return capacity;
}
