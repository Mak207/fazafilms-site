/* Pinch-only, independent controls/content reflow. No viewport/camera scaling. */
(function (global) {
  "use strict";
  const LEVELS = [100, 125, 150, 175, 200];
  const FACTORS = {
    100: [1, 1, 1, 44], 125: [1.22, 1.12, 1.08, 48],
    150: [1.42, 1.25, 1.16, 52], 175: [1.62, 1.40, 1.25, 56],
    200: [1.8, 1.55, 1.34, 60]
  };
  const STORAGE_KEY = "park-review:adaptive-zones:v1";
  const NATIVE = "canvas,iframe,video,audio,object,embed,model-viewer,img,picture,[data-az-native],.leaflet-container,.mapboxgl-map,.maplibregl-map,[data-map]";
  const CONTROL = 'button,input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]),select,textarea,summary,label,a[href],[role="button"]';
  const SKIP = "script,style,noscript,template,option,optgroup,[hidden],[aria-hidden=true],.sr-only,.mg-sr-only,.ic-sr-only,[data-az-table] thead";
  const GROUPS = "nav,[role=group],form,.ic-downloads,.ic-controls,.ic-floor-control,.ic-actions,.ic-presets,.ic-toggle,.mg-document-actions,.mg-error-actions,.mg-sources,.mg-lecture-chapters,.mg-lecture-reference-list,.iq-actions,.iq-remote-actions,.iq-field,.form-head,.send-row,.media-tools,body[data-az-page=engineering] .actions,body[data-az-page=engineering] .flow-inputs,body[data-az-page=engineering] .plan-toolbar,body[data-az-page=engineering] .reserve,body[data-az-page=engineering] .table-wrap:has(input)";
  const MOBILE = "(max-width: 900px), (pointer: coarse)";

  function cleanLevel(value) { return LEVELS.includes(Number(value)) ? Number(value) : 100; }
  function cleanState(value) {
    return { controls: cleanLevel(value && value.controls), content: cleanLevel(value && value.content) };
  }
  function distance(a, b) { return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }

  /* A touch's original target owns it until ALL fingers are lifted.
     Resolving ownership at touchmove would let fingers migrate across zones. */
  function createPinchController(options) {
    const origins = new Map();
    let owned = null, blocked = false, lastOwned = null;
    function reset() {
      if (lastOwned && options.onRelease) options.onRelease(lastOwned);
      origins.clear(); owned = null; blocked = false; lastOwned = null;
    }
    function start(event) {
      for (const touch of Array.from(event.changedTouches || [])) {
        if (!origins.has(touch.identifier)) origins.set(touch.identifier, options.resolveTarget(touch.target));
      }
      const touches = Array.from(event.touches || []);
      if (touches.length > 2) { blocked = true; owned = null; return; }
      if (touches.length !== 2 || blocked || owned) return;
      const [a, b] = touches;
      const first = origins.get(a.identifier), second = origins.get(b.identifier);
      if (!options.enabled() || !first || !second || first.zone !== second.zone ||
          first.kind !== second.kind || distance(a, b) < 24 || !event.cancelable) {
        blocked = true; return;
      }
      event.preventDefault();
      if (!event.defaultPrevented) { blocked = true; return; }
      owned = { zone: first.zone, kind: first.kind, ids: [a.identifier, b.identifier], distance: distance(a, b) };
      lastOwned = owned;
    }
    function move(event) {
      if (!owned || blocked) return;
      const touches = Array.from(event.touches || []);
      if (touches.length !== 2 || !options.enabled() || !event.cancelable) {
        blocked = true; owned = null; return;
      }
      const a = touches.find(t => t.identifier === owned.ids[0]);
      const b = touches.find(t => t.identifier === owned.ids[1]);
      if (!a || !b) { blocked = true; owned = null; return; }
      event.preventDefault();
      if (!event.defaultPrevented) { blocked = true; owned = null; return; }
      const next = distance(a, b), ratio = next / owned.distance;
      if (ratio > 1.14 || ratio < 0.88) {
        options.onStep(owned.kind, ratio > 1.14 ? 1 : -1, owned.zone);
        owned.distance = next;
      }
    }
    function end(event) {
      const remaining = Array.from(event.touches || []);
      const changed = Array.from(event.changedTouches || []);
      if (lastOwned && changed.some(touch => lastOwned.ids.includes(touch.identifier))) {
        if (event.cancelable) event.preventDefault();
        if (options.onRelease) options.onRelease(lastOwned);
      }
      for (const touch of changed) origins.delete(touch.identifier);
      if (!remaining.length) reset();
      else if (owned) { blocked = true; owned = null; }
    }
    return { start, move, end, cancel: reset };
  }
  /* Pure policy is exported for algorithm tests, without pretending to emulate a browser. */
  if (typeof module === "object" && module.exports) {
    module.exports = { LEVELS, FACTORS, cleanLevel, cleanState, createPinchController, NATIVE, CONTROL };
    return;
  }
  if (!global.document || global.ParkAdaptiveZoom) return;

  const document = global.document, root = document.documentElement;
  const media = global.matchMedia(MOBILE);
  let state = { controls: 100, content: 100 };
  try { state = cleanState(JSON.parse(global.localStorage.getItem(STORAGE_KEY))); } catch (_) {}
  let records = new WeakMap(), timer = 0, active = false, scanQueued = false, needRebase = false;
  let scrollGeneration = 0, released = null, observer = null, pendingScroll = null;
  let heightObserver = null, heightFrame = 0, lastEmbeddedHeight = 0;

  function publishState() {
    for (const kind of ["content", "controls"]) {
      const [font, control, space, touch] = FACTORS[state[kind]];
      root.setAttribute("data-az-" + kind, String(state[kind]));
      root.style.setProperty("--az-" + kind + "-font", String(kind === "controls" ? control : font));
      root.style.setProperty("--az-" + kind + "-space", String(space));
      root.style.setProperty("--az-" + kind + "-touch", touch + "px");
    }
  }
  publishState(); // This script is intentionally synchronous and precedes all styles.
  if (media.matches && (state.content !== 100 || state.controls !== 100)) {
    root.setAttribute("data-az-pending", "");
    timer = global.setTimeout(() => root.removeAttribute("data-az-pending"), 1800);
  }

  function element(value) {
    return value && value.nodeType === 1 ? value : value && value.parentElement;
  }
  function nativeTarget(node) {
    if (!node) return false;
    if (node.closest(NATIVE)) return true;
    const svg = node.closest("svg");
    /* Standalone SVG geometry keeps its native gesture. Decorative SVG inside
       a real control belongs to that control's region, like its text label. */
    return !!(svg && !svg.closest(CONTROL));
  }
  function originFor(value) {
    const node = element(value);
    if (!node || nativeTarget(node)) return null;
    const zone = node.closest("[data-az-zone]");
    if (!zone || !["controls", "content"].includes(zone.getAttribute("data-az-zone"))) return null;
    return { zone, kind: zone.getAttribute("data-az-zone") };
  }
  function directText(node) {
    return Array.from(node.childNodes).some(n => n.nodeType === 3 && n.textContent.trim());
  }
  function eligible(node) {
    return node.namespaceURI === "http://www.w3.org/1999/xhtml" &&
      !nativeTarget(node) && !node.closest("svg") && !node.closest(SKIP) && !!node.getClientRects().length &&
      (directText(node) || node.matches(CONTROL) || node.hasAttribute("data-az-label"));
  }
  function markZones() {
    for (const group of document.querySelectorAll(GROUPS)) {
      if (nativeTarget(group) || group.hasAttribute("data-az-zone")) continue;
      const parentZone = group.parentElement && group.parentElement.closest("[data-az-zone]");
      if (!parentZone || parentZone.getAttribute("data-az-zone") !== "controls") {
        group.setAttribute("data-az-zone", "controls");
      }
    }
    for (const node of document.querySelectorAll(CONTROL)) {
      if (nativeTarget(node) || node.closest(SKIP) || node.hasAttribute("data-az-zone")) continue;
      const parentZone = node.parentElement && node.parentElement.closest("[data-az-zone]");
      if (!parentZone || parentZone.getAttribute("data-az-zone") !== "controls") node.setAttribute("data-az-zone", "controls");
    }
  }
  function markTables() {
    for (const table of document.querySelectorAll(".ic-table-scroll table,body[data-az-page=engineering] .table-wrap table")) {
      const headings = Array.from(table.querySelectorAll("thead tr:first-child th")).map(n => n.textContent.trim());
      if (!headings.length) continue;
      table.setAttribute("data-az-table", "");
      for (const row of table.querySelectorAll("tbody tr,tfoot tr")) {
        Array.from(row.children).forEach((cell, index) => {
          if (index && headings[index]) cell.setAttribute("data-az-label", headings[index]);
        });
      }
    }
  }
  function queueEmbeddedHeight() {
    if (!document.body || document.body.getAttribute("data-az-page") !== "engineering" ||
        global.parent === global || heightFrame) return;
    heightFrame = global.requestAnimationFrame(() => {
      heightFrame = 0;
      /* Body's intrinsic height avoids a viewport/iframe-height feedback floor.
         Match the existing, origin/source-checked engineering bridge contract. */
      const height = Math.min(20000, Math.max(300, Math.ceil(document.body.getBoundingClientRect().height)));
      if (height === lastEmbeddedHeight) return;
      lastEmbeddedHeight = height;
      global.parent.postMessage({ type: "faza-engineering-height", height }, global.location.origin);
    });
  }
  function scrollRoots() {
    return [document.scrollingElement, ...document.querySelectorAll("[data-az-scroll],body[data-az-page=tour] .viewer-header")].filter(Boolean);
  }
  function snapshotScroll() {
    return scrollRoots().map(node => {
      const max = Math.max(0, node.scrollHeight - node.clientHeight);
      return { node, top: node.scrollTop, left: node.scrollLeft, ratio: max ? node.scrollTop / max : 0 };
    });
  }
  function restoreScroll(snapshot, relative) {
    for (const entry of snapshot) {
      if (!entry.node.isConnected) continue;
      const max = Math.max(0, entry.node.scrollHeight - entry.node.clientHeight);
      entry.node.scrollTop = relative ? Math.round(entry.ratio * max) : entry.top;
      entry.node.scrollLeft = entry.left;
    }
  }
  function measure(rebase) {
    if (!document.body || !media.matches) return;
    const savedScroll = snapshotScroll();
    root.setAttribute("data-az-adjusting", "");
    root.setAttribute("data-az-measuring", "");
    try {
      markZones(); markTables();
      if (rebase) records = new WeakMap();
      const targets = Array.from(document.body.querySelectorAll("*")).filter(eligible);
      /* Read all baselines with coverage disabled, including inherited text.
         New DOM can therefore never inherit a previously magnified font as its base. */
      const fresh = [];
      for (const node of targets) {
        const owner = originFor(node);
        if (!owner) continue;
        let record = records.get(node);
        if (!record) {
          const style = global.getComputedStyle(node), font = parseFloat(style.fontSize);
          if (!(font > 0)) continue;
          record = {
            font, line: parseFloat(style.lineHeight) || font * 1.45,
            height: Math.max(0, parseFloat(style.minHeight) || 0),
            padTop: parseFloat(style.paddingTop) || 0, padRight: parseFloat(style.paddingRight) || 0,
            padBottom: parseFloat(style.paddingBottom) || 0, padLeft: parseFloat(style.paddingLeft) || 0,
            pre: /^pre/.test(style.whiteSpace)
          };
          records.set(node, record);
        }
        fresh.push({ node, owner, record });
      }
      for (const { node, owner, record } of fresh) {
        node.setAttribute("data-az-text", "");
        node.setAttribute("data-az-kind", owner.kind);
        node.setAttribute("data-az-lines", record.pre ? "preserve" : "wrap");
        for (const key of ["font", "line", "height", "padTop", "padRight", "padBottom", "padLeft"]) {
          node.style.setProperty("--az-base-" + key, record[key] + "px");
        }
        if (node.matches(CONTROL)) node.setAttribute("data-az-control", "");
      }
      root.setAttribute("data-az-ready", "");
    } finally {
      root.removeAttribute("data-az-measuring");
      restoreScroll(savedScroll, false);
      root.removeAttribute("data-az-adjusting");
      root.removeAttribute("data-az-pending");
      global.clearTimeout(timer);
      queueEmbeddedHeight();
    }
  }
  function scheduleScan(rebase) {
    needRebase = needRebase || !!rebase;
    if (scanQueued) return;
    scanQueued = true;
    global.requestAnimationFrame(() => {
      scanQueued = false;
      const rebaseNow = needRebase; needRebase = false;
      measure(rebaseNow);
    });
  }
  function applyState(next, persist, preserve) {
    const snapshot = preserve ? (pendingScroll || snapshotScroll()) : [];
    if (preserve) pendingScroll = snapshot;
    const generation = ++scrollGeneration;
    root.setAttribute("data-az-adjusting", "");
    state = cleanState(next); publishState();
    queueEmbeddedHeight();
    if (persist) {
      try { global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
    }
    global.requestAnimationFrame(() => global.requestAnimationFrame(() => {
      if (generation !== scrollGeneration) return;
      if (preserve) restoreScroll(snapshot, true);
      pendingScroll = null;
      root.removeAttribute("data-az-adjusting");
    }));
    global.dispatchEvent(new CustomEvent("park-zoom-change", { detail: { ...state } }));
  }
  function step(kind, direction) {
    const level = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, LEVELS.indexOf(state[kind]) + direction))];
    if (state[kind] !== level) applyState({ ...state, [kind]: level }, true, true);
  }
  const pinch = createPinchController({
    resolveTarget: originFor,
    enabled: () => active && media.matches &&
      (!global.visualViewport || Math.abs(global.visualViewport.scale - 1) < 0.02),
    onStep: step,
    onRelease: ownership => { released = { zone: ownership.zone, until: Date.now() + 400 }; }
  });
  function start() {
    if (active || !document.body || !document.body.hasAttribute("data-az-page")) return;
    active = true;
    measure(true);
    document.addEventListener("touchstart", pinch.start, { passive: false, capture: true });
    document.addEventListener("touchmove", pinch.move, { passive: false, capture: true });
    document.addEventListener("touchend", pinch.end, { passive: false, capture: true });
    document.addEventListener("touchcancel", pinch.cancel, { passive: true, capture: true });
    document.addEventListener("click", event => {
      if (released && Date.now() < released.until && event.detail !== 0 && released.zone.contains(event.target)) {
        event.preventDefault(); event.stopPropagation();
      }
    }, true);
    observer = new MutationObserver(changes => {
      let scan = false, rebase = false;
      for (const change of changes) {
        if (change.type === "childList" || change.type === "characterData") scan = true;
        else if (change.attributeName === "class" || change.attributeName === "data-folder") { scan = true; rebase = true; }
        else scan = true;
      }
      if (scan) scheduleScan(rebase);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ["hidden", "open", "class", "data-folder"] });
    if (document.body.getAttribute("data-az-page") === "engineering" && "ResizeObserver" in global) {
      heightObserver = new global.ResizeObserver(queueEmbeddedHeight);
      heightObserver.observe(document.body);
    }
    queueEmbeddedHeight();
    document.addEventListener("toggle", () => scheduleScan(false), true);
    global.addEventListener("park-folder-change", () => scheduleScan(true));
    global.addEventListener("resize", () => scheduleScan(true));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => scheduleScan(true));
    media.addEventListener("change", () => { pinch.cancel(); scheduleScan(true); });
    global.addEventListener("storage", event => {
      if (event.key !== STORAGE_KEY) return;
      try { applyState(cleanState(JSON.parse(event.newValue)), false, true); } catch (_) {}
    });
  }
  global.ParkAdaptiveZoom = Object.freeze({
    state: () => ({ ...state }),
    refresh: () => scheduleScan(true)
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})(typeof window === "undefined" ? globalThis : window);
