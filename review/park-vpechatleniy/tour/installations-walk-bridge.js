export const INSTALLATIONS_WALK_PROTOCOL = 'faza.park.installations-walk.v1';

const clone = value => JSON.parse(JSON.stringify(value));
const identifier = value => typeof value === 'string' && /^[a-z0-9-]{1,64}$/i.test(value);

/** Resolve only existing safe walk starts; the parent never supplies camera coordinates. */
export function resolveInstallationsWalkZone(scope, zones = []) {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) return null;
  const regionId = scope.regionId || null, hallId = scope.hallId || null;
  const floorId = scope.floorId || 'main';
  if ((regionId && !identifier(regionId)) || (hallId && !identifier(hallId)) || !['main', 'upper'].includes(floorId)) return null;
  if (hallId) {
    if (regionId !== 'rgo') return null;
    const match = /^RGO-(\d{2})$/i.exec(hallId);
    if (!match) return null;
    const zone = zones.find(item => item.regionId === 'rgo' && String(item.hallId) === match[1]);
    return zone ? { zone, scope: { regionId, hallId: 'RGO-' + match[1], floorId: zone.level } } : null;
  }
  if (regionId) {
    const candidates = zones.filter(item => item.regionId === regionId && !item.hallId);
    const zone = candidates.find(item => item.level === floorId) || (candidates.length === 1 ? candidates[0] : null);
    return zone ? { zone, scope: { regionId, hallId: null, floorId: zone.level } } : null;
  }
  const candidates = zones.filter(item => item.level === floorId && !item.hallId);
  const preferred = floorId === 'main' ? 'central-square-main' : 'central-upper';
  const zone = candidates.find(item => item.id === preferred) || candidates[0];
  return zone ? { zone, scope: { regionId: null, hallId: null, floorId } } : null;
}

/** Isolated same-origin channel for the single embedded walk; equipment uses its existing channel. */
export function createInstallationsWalkBridge({ windowObject = globalThis.window, onVisibility = () => {} } = {}) {
  const win = windowObject, parent = win?.parent, origin = win?.location?.origin;
  let enabled = false;
  try { enabled = Boolean(parent && parent !== win && origin && origin !== 'null' && new URL(win.location.href).searchParams.get('embedded') === 'installations'); } catch {}
  let walk = null, visible = false, disposed = false, pending = null, appliedKey = null, appliedScope = null;
  let zoneSequence = -1, visibilitySequence = -1;
  const post = payload => { if (enabled && !disposed) { try { parent.postMessage({ protocol: INSTALLATIONS_WALK_PROTOCOL, ...payload }, origin); } catch {} } };
  const state = () => walk?.getState?.() || { ready: false, active: false };
  function status({ ok = true, error = false, text = '', scope = appliedScope } = {}) {
    const current = state();
    post({ kind: 'status', ok, error, text, scope, active: Boolean(current.active), zoneId: current.zoneId || null });
  }
  function applyPending() {
    if (!walk || !visible || !pending) return false;
    const resolved = resolveInstallationsWalkZone(pending.scope, walk.getZones?.() || []);
    if (!resolved) { pending = null; status({ ok: false, text: 'Не удалось найти выбранную зону для прогулки.' }); return false; }
    const key = JSON.stringify(resolved.scope), current = state();
    if (!pending.restart && appliedKey === key && current.active && current.zoneId === resolved.zone.id) {
      pending = null; walk.setPaused?.(false); return true;
    }
    pending = null;
    const result = walk.start(resolved.zone.id, { focus: false });
    if (!result?.ok) {
      status({ ok: false, scope: resolved.scope, text: result?.message || 'В выбранной зоне нет свободного места для начала прогулки. Измените расстановку или выберите другую зону.' });
      return false;
    }
    appliedKey = key; appliedScope = resolved.scope; walk.setPaused?.(false);
    status({ scope: resolved.scope, text: 'Прогулка: ' + resolved.zone.name });
    return true;
  }
  function receive(event) {
    if (!enabled || disposed || event.origin !== origin || event.source !== parent) return;
    const message = event.data;
    if (message?.protocol !== INSTALLATIONS_WALK_PROTOCOL || !Number.isSafeInteger(message.sequence) || message.sequence < 0) return;
    if (message.kind === 'visibility') {
      const next = typeof message.visible === 'boolean' ? message.visible : message.active;
      if (typeof next !== 'boolean' || message.sequence <= visibilitySequence) return;
      visibilitySequence = message.sequence; visible = next;
      walk?.setPaused?.(!visible); onVisibility(visible);
      if (visible) applyPending();
    } else if (message.kind === 'zone') {
      if (message.sequence <= zoneSequence || !message.scope || typeof message.scope !== 'object' || Array.isArray(message.scope)) return;
      zoneSequence = message.sequence;
      pending = { scope: { regionId: message.scope.regionId || null, hallId: message.scope.hallId || null, floorId: message.scope.floorId || 'main' }, restart: message.restart === true };
      applyPending();
    }
  }
  function walkChanged(event) {
    if (!enabled || disposed || !walk || event.detail?.active !== false) return;
    status({ text: 'Прогулка остановлена. Нажмите «К началу зоны», чтобы продолжить.' });
  }
  if (enabled) { win.addEventListener('message', receive); win.document?.addEventListener?.('park-walk-change', walkChanged); onVisibility(false); }
  return {
    enabled,
    attach(mode) {
      if (!enabled || disposed) return;
      walk = mode; walk?.setPaused?.(!visible); post({ kind: 'ready' }); applyPending();
    },
    error(text) { status({ ok: false, error: true, text: String(text || 'Не удалось подготовить прогулку.') }); },
    getState: () => ({ enabled, ready: Boolean(walk), visible, pending: pending ? clone(pending.scope) : null, appliedKey }),
    dispose() { if (disposed) return; disposed = true; win?.removeEventListener?.('message', receive); win?.document?.removeEventListener?.('park-walk-change', walkChanged); walk?.setPaused?.(true); walk = null; pending = null; },
  };
}
