import {
  CROWD_SCENARIO_KEY, CROWD_SCENARIO_CHANNEL, CROWD_SCENARIO_EVENT,
  capacityFromScenario, parseStoredScenario, parseScenarioLink, defaultCrowdCapacity,
} from '../../calculator/crowd-scenario.js';

export function createCapacityLink({ onChange, onInvalid = () => {}, host = window }) {
  let current = defaultCrowdCapacity(), fingerprint = '', disposed = false, invalid = false, channel;
  const parents = [];
  for (const candidate of [host, host.parent, host.opener]) {
    try {
      if (candidate && candidate.location.origin === host.location.origin && !parents.includes(candidate)) parents.push(candidate);
    } catch { /* Cross-origin windows are never queried. */ }
  }
  const observed = new Map();
  function accept(raw, source) {
    const capacity = capacityFromScenario(raw);
    if (!capacity) { if (raw?.valid === false || raw?.result?.valid === false) { invalid = true; onInvalid(); } return false; }
    const wasInvalid = invalid; invalid = false;
    const key = JSON.stringify([capacity.input, capacity.view]);
    if (key === fingerprint) { if (wasInvalid) onChange(current); return true; }
    fingerprint = key;
    current = { ...capacity, source: source || capacity.source };
    onChange(current);
    return true;
  }
  function refresh() {
    if (disposed) return;
    for (const parent of parents) {
      try {
        const value = parent.__parkCalculator || parent.__parkCrowdScenario;
        if (value && observed.get(parent) !== value) {
          observed.set(parent, value);
          accept(value, 'calculator');
        }
      } catch { /* Parent may navigate while the 3D view remains open. */ }
    }
  }
  const eventHandler = event => accept(event.detail, 'calculator');
  const storageHandler = event => {
    if (event.key === CROWD_SCENARIO_KEY && event.newValue) {
      const stored = parseStoredScenario(event.newValue);
      if (stored) accept(stored, 'calculator');
    }
  };
  let initial;
  for (const parent of parents) {
    try { if (parent.__parkCalculator) initial = capacityFromScenario(parent.__parkCalculator) || initial; } catch {}
  }
  initial ||= parseScenarioLink(host.location.href);
  if (!initial) { try { initial = parseStoredScenario(host.localStorage.getItem(CROWD_SCENARIO_KEY)); } catch {} }
  accept(initial || current, initial?.source || 'default');
  for (const parent of parents) parent.addEventListener(CROWD_SCENARIO_EVENT, eventHandler);
  host.addEventListener('storage', storageHandler);
  try {
    if (host.BroadcastChannel) {
      channel = new host.BroadcastChannel(CROWD_SCENARIO_CHANNEL);
      channel.onmessage = event => accept(event.data, 'calculator');
    }
  } catch {}
  refresh();
  const timer = host.setInterval(refresh, 750);
  return {
    get current() { return current; }, refresh,
    dispose() {
      disposed = true; host.clearInterval(timer); channel?.close();
      for (const parent of parents) { try { parent.removeEventListener(CROWD_SCENARIO_EVENT, eventHandler); } catch {} }
      host.removeEventListener('storage', storageHandler);
    },
  };
}
