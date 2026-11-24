/** Small, mutually exclusive context panels; scene and editor actions stay with their owners. */
export function initViewerUI() {
  const stage = document.getElementById('stage');
  const tabs = [...document.querySelectorAll('.workspace-tab[data-panel]')];
  const panels = new Map(tabs.map(tab => [tab.dataset.panel, document.getElementById(tab.dataset.panel)]));
  const events = new AbortController(), signal = events.signal;
  let disposed = false;

  function updateState() {
    const active = [...panels].find(([, panel]) => panel && !panel.hidden)?.[0] || '';
    stage.dataset.panelOpen = active;
    for (const tab of tabs) tab.setAttribute('aria-expanded', String(!panels.get(tab.dataset.panel)?.hidden));
  }

  function closeOne(id) {
    const panel = panels.get(id);
    if (!panel) return;
    if (id === 'exhibit-editor' && !panel.hidden) panel.dispatchEvent(new Event('park-panel-close'));
    panel.hidden = true;
  }

  function closePanels({ focusCanvas = false } = {}) {
    for (const id of panels.keys()) closeOne(id);
    updateState();
    if (focusCanvas) document.getElementById('canvas')?.focus({ preventScroll: true });
  }

  function openPanel(id) {
    if (disposed || !panels.has(id)) return false;
    const panel = panels.get(id), tab = tabs.find(item => item.dataset.panel === id);
    if (tab?.disabled) return false;
    if (id === 'exhibit-editor') {
      if (panel.hidden) tab.click();
      return !panel.hidden;
    }
    for (const other of panels.keys()) if (other !== id) closeOne(other);
    const help = document.getElementById('help');
    if (help) help.hidden = true;
    document.getElementById('help-toggle')?.setAttribute('aria-expanded', 'false');
    panel.hidden = false;
    updateState();
    return true;
  }

  for (const tab of tabs) {
    if (tab.dataset.panel === 'exhibit-editor') continue;
    tab.addEventListener('click', () => {
      const panel = panels.get(tab.dataset.panel);
      if (panel.hidden) openPanel(tab.dataset.panel);
      else { closeOne(tab.dataset.panel); updateState(); }
    }, { signal });
  }
  for (const button of document.querySelectorAll('[data-close-panel]')) {
    button.addEventListener('click', () => {
      closeOne(button.dataset.closePanel); updateState();
      tabs.find(tab => tab.dataset.panel === button.dataset.closePanel)?.focus();
    }, { signal });
  }
  // The editor already owns its toggle and focus workflow. Listen to its state
  // instead of binding a competing click handler to the same button.
  document.addEventListener('park-panel-visibility', event => {
    if (event.target.id !== 'exhibit-editor') return;
    if (event.detail?.open) {
      for (const id of panels.keys()) if (id !== 'exhibit-editor') closeOne(id);
      const help = document.getElementById('help');
      if (help) help.hidden = true;
      document.getElementById('help-toggle')?.setAttribute('aria-expanded', 'false');
    } else if (event.target.contains(document.activeElement)) {
      document.getElementById('canvas')?.focus({ preventScroll: true });
    }
    updateState();
  }, { signal });
  document.getElementById('help-toggle')?.addEventListener('click', () => queueMicrotask(() => {
    if (!document.getElementById('help')?.hidden) closePanels();
  }), { signal });
  document.addEventListener('click', event => {
    const action = event.target.closest?.('[data-view],[data-crowd-view],#tram-onboard,#tram-station,#reset');
    if (action && !action.disabled && action.closest('.context-panel')) {
      queueMicrotask(() => closePanels({ focusCanvas: true }));
    }
  }, { signal });
  document.getElementById('tram-camera')?.addEventListener('change', () => {
    queueMicrotask(() => closePanels({ focusCanvas: true }));
  }, { signal });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.defaultPrevented && [...panels.values()].some(panel => !panel.hidden)) {
      event.preventDefault(); closePanels({ focusCanvas: true });
    }
  }, { signal });

  updateState();
  return {
    openPanel, closePanels,
    getState() {
      const states = [...panels].map(([id, panel]) => ({ id, open: !panel.hidden }));
      return { openPanel: states.find(row => row.open)?.id || null, panels: states,
        stageHeight: stage.getBoundingClientRect().height,
        toolbarHeight: document.querySelector('.viewer-toolbar').getBoundingClientRect().height,
        viewportHeight: innerHeight };
    },
    dispose() { if (!disposed) { closePanels(); events.abort(); disposed = true; } },
  };
}
