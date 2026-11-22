import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// This module imports animation clips only. The bundle's scene is never added
// to the viewer: current exhibition geometry, materials and wardrobe stay intact.
const PREFIX = 'Native · ';
const ACTORS = [
  { actor: 'Emma', currentId: 'emma-current', sourceId: 'emma-source', file: './assets/emma-native-motions.glb' },
  { actor: 'Ethan', currentId: 'ethan-current', sourceId: 'ethan-source', file: './assets/ethan-native-motions.glb' },
].map((actor) => ({ ...actor, url: new URL(actor.file, import.meta.url).href }));
const CLIP_LABELS = new Map([
  ['Idle', 'Спокойная поза'], ['Walk', 'Ходьба'], ['Wave', 'Приветствие'],
  ['Talk', 'Разговор'], ['Confident', 'Уверенный разговор'], ['Argue', 'Спор'],
  ['Cheer', 'Радость'], ['Laugh', 'Смех'], ['Drink', 'Питьё'],
  ['Clap', 'Аплодисменты'], ['Think', 'Размышление'], ['Shrug', 'Пожать плечами'],
  ['Phone', 'Разговор по телефону'],
]);
const state = {
  lab: null, busy: false, ready: false, clip: 'Wave', mode: 'current',
  bundles: new Map(), bundlePromises: new Map(), names: [], errors: [],
  operation: Promise.resolve(), initialPromise: null,
};

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = text;
  return element;
}

function mountPanel() {
  const style = document.createElement('style');
  style.dataset.motionExperiments = 'true';
  style.textContent = `
    #motion-experiments{background:#fff;border:1px solid #dce3ed;border-radius:16px;margin:0 0 14px;padding:16px 18px;color:#233044;box-sizing:border-box}
    #motion-experiments *{box-sizing:border-box}
    #motion-experiments .me-heading{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:7px}
    #motion-experiments h2{font-size:15px;line-height:1.4;margin:0;font-weight:750;letter-spacing:-.01em}
    #motion-experiments .me-count{font-size:10px;color:#687a91;white-space:nowrap}
    #motion-experiments .me-description{font-size:12px;line-height:1.6;color:#66758b;margin:0 0 13px;max-width:1050px}
    #motion-experiments .me-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
    #motion-experiments button,#motion-experiments select{font:inherit;font-size:12px;min-height:36px;border:1px solid #ccd6e4;border-radius:9px;background:#fff;color:#233044;padding:7px 11px}
    #motion-experiments button{font-weight:650;cursor:pointer}
    #motion-experiments button:hover:not(:disabled){background:#f3f7ff;border-color:#93acd0}
    #motion-experiments .me-primary{background:#255de8;border-color:#255de8;color:#fff}
    #motion-experiments .me-primary:hover:not(:disabled){background:#1b4fcf}
    #motion-experiments button:disabled,#motion-experiments select:disabled{opacity:.5;cursor:not-allowed}
    #motion-experiments button:focus-visible,#motion-experiments select:focus-visible,#motion-experiments a:focus-visible{outline:3px solid #9fbcff;outline-offset:2px}
    #motion-experiments .me-select-label{display:flex;align-items:center;gap:7px;font-size:11px;color:#65748a;min-width:0}
    #motion-experiments select{min-width:190px;max-width:100%;padding-right:26px}
    #motion-experiments .me-link{font-size:11px;line-height:1.5;color:#365eb1;text-decoration:none;margin-left:auto;padding:6px 0}
    #motion-experiments .me-link:hover{text-decoration:underline}
    #motion-experiments .me-status{display:flex;gap:7px;align-items:flex-start;font-size:11px;line-height:1.6;color:#687a91;margin:11px 0 0;overflow-wrap:anywhere}
    #motion-experiments .me-dot{width:7px;height:7px;border-radius:50%;background:#9caec2;flex:none;margin-top:5px}
    #motion-experiments[data-state=busy] .me-dot{background:#c69328}
    #motion-experiments[data-state=ready] .me-dot{background:#2c9469}
    #motion-experiments[data-state=error]{border-color:#e8b9b2}
    #motion-experiments[data-state=error] .me-dot{background:#c65347}
    #motion-experiments[data-state=error] .me-status{color:#a44338}
    @media(max-width:650px){#motion-experiments{padding:13px}#motion-experiments .me-heading{flex-wrap:wrap;gap:4px}#motion-experiments .me-actions{gap:8px}#motion-experiments .me-select-label{flex:1;min-width:185px}#motion-experiments select{flex:1;min-width:0}#motion-experiments .me-link{margin-left:0;width:100%}}
  `;
  document.head.append(style);
  const panel = makeElement('section');
  panel.id = 'motion-experiments';
  panel.setAttribute('aria-label', 'Готовые движения на выставочных моделях');
  const heading = makeElement('div', 'me-heading');
  const count = makeElement('span', 'me-count', 'Проверенные наборы Emma / Ethan');
  heading.append(makeElement('h2', '', 'Движения на выставочных моделях'), count);
  const description = makeElement('p', 'me-description',
    'Добавляются только анимации. Рабочие GLB выставки, внешность и материалы Emma и Ethan сохраняются. Исходные модели доступны отдельно для сравнения.');
  const actions = makeElement('div', 'me-actions');
  const nativeButton = makeElement('button', 'me-primary', 'Готовые движения');
  nativeButton.type = 'button';
  const selectLabel = makeElement('label', 'me-select-label');
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Готовое движение');
  select.add(new Option('Загрузка списка…', ''));
  select.disabled = true;
  selectLabel.append(makeElement('span', '', 'Клип'), select);
  const compareButton = makeElement('button', '', 'Сравнить с исходниками');
  compareButton.type = 'button';
  compareButton.title = 'Показать исходную и рабочую модель для Emma и Ethan: четыре аватара';
  const baseline = makeElement('a', 'me-link', 'Походка v42 ↗');
  baseline.href = new URL('./baseline-v42.html?visitorSeed=424242', import.meta.url).href;
  baseline.target = '_blank';
  baseline.rel = 'noopener';
  const contact = makeElement('a', 'me-link', 'Контакт стоп A/B ↗');
  contact.href = new URL('./contact-bench.html', import.meta.url).href;
  contact.target = '_blank';
  contact.rel = 'noopener';
  actions.append(nativeButton, selectLabel, compareButton, baseline, contact);
  const status = makeElement('div', 'me-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const statusText = makeElement('span', '', 'Подготовка библиотеки движений…');
  status.append(makeElement('span', 'me-dot'), statusText);
  panel.append(heading, description, actions, status);
  const header = document.querySelector('.page-head');
  if (header) header.insertAdjacentElement('afterend', panel);
  else (document.querySelector('main') || document.body).prepend(panel);
  nativeButton.addEventListener('click', () => { loadNative().catch(() => {}); });
  compareButton.addEventListener('click', () => { compareSources().catch(() => {}); });
  select.addEventListener('change', () => { setNativeClip(select.value).catch(() => {}); });
  return { panel, count, nativeButton, compareButton, select, statusText };
}

const ui = mountPanel();

function setStatus(message, kind = 'ready') {
  ui.panel.dataset.state = kind;
  ui.statusText.textContent = message;
}

function refreshControls() {
  ui.nativeButton.disabled = state.busy;
  ui.compareButton.disabled = state.busy;
  ui.select.disabled = state.busy || !state.names.length;
  if (state.names.includes(state.clip)) ui.select.value = state.clip;
  ui.count.textContent = state.names.length
    ? `${state.names.length} движений · выставочные Emma / Ethan`
    : 'Проверенные наборы Emma / Ethan';
}

function recordError(error) {
  const record = { message: error?.message || String(error), timestamp: new Date().toISOString() };
  state.errors.push(record);
  state.ready = false;
  setStatus(`${record.message} Можно повторить загрузку кнопкой «Готовые движения».`, 'error');
  console.error('[motion-experiments]', record);
}

function runOperation(message, operation) {
  const task = state.operation.catch(() => {}).then(async () => {
    state.busy = true;
    refreshControls();
    setStatus(message, 'busy');
    try {
      const result = await operation();
      state.ready = true;
      return result;
    } catch (error) {
      recordError(error);
      throw error;
    } finally {
      state.busy = false;
      refreshControls();
    }
  });
  state.operation = task;
  return task;
}

async function getLab() {
  if (state.lab) return state.lab;
  const deadline = performance.now() + 20000;
  while (!window.motionLab) {
    if (performance.now() >= deadline) throw new Error('Основной просмотрщик не инициализировался. Проверьте загрузку motion-lab.js.');
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  const lab = window.motionLab;
  for (const name of ['load', 'getRuntime', 'addClips', 'setClip', 'setPhase', 'setLoop', 'pause']) {
    if (typeof lab[name] !== 'function') throw new Error(`Версия просмотрщика не поддерживает ${name}.`);
  }
  state.lab = lab;
  return lab;
}

function baseName(name) {
  return name.replace(/^UPF\s*·\s*/, '').replace(/^Native\s*·\s*/, '').trim();
}

function loadBundle(actor) {
  if (state.bundles.has(actor.currentId)) return Promise.resolve(state.bundles.get(actor.currentId));
  if (state.bundlePromises.has(actor.currentId)) return state.bundlePromises.get(actor.currentId);
  const promise = (async () => {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    let gltf;
    try { gltf = await loader.loadAsync(actor.url); }
    catch (error) { throw new Error(`${actor.actor}: не удалось загрузить ${actor.file}. ${error?.message || error}`); }
    if (!gltf.animations?.length) throw new Error(`${actor.actor}: в наборе нет анимационных клипов.`);
    const seen = new Set();
    const clips = gltf.animations.map((original) => {
      const clip = original.clone();
      clip.name = baseName(original.name);
      if (!clip.name || seen.has(clip.name)) throw new Error(`${actor.actor}: пустое или повторяющееся имя клипа «${clip.name}».`);
      if (!(clip.duration > 0) || !clip.tracks.length) throw new Error(`${actor.actor}: клип ${clip.name} не содержит корректной анимации.`);
      seen.add(clip.name);
      return clip;
    });
    // No gltf.scene is retained or attached to the lab.
    const bundle = { actor: actor.actor, url: actor.url, clips, names: clips.map((clip) => clip.name) };
    state.bundles.set(actor.currentId, bundle);
    return bundle;
  })();
  state.bundlePromises.set(actor.currentId, promise);
  promise.catch(() => { state.bundlePromises.delete(actor.currentId); });
  return promise;
}

function refreshCatalog() {
  const bundles = ACTORS.map((actor) => state.bundles.get(actor.currentId));
  if (bundles.some((bundle) => !bundle)) return;
  const common = bundles[0].names.filter((name) => bundles.every((bundle) => bundle.names.includes(name)));
  const rank = [...CLIP_LABELS.keys()];
  common.sort((a, b) => {
    const ai = rank.indexOf(a), bi = rank.indexOf(b);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.localeCompare(b);
  });
  if (!common.length) throw new Error('У наборов Emma и Ethan нет общих имён движений.');
  state.names = common;
  ui.select.replaceChildren();
  for (const name of common) ui.select.add(new Option(CLIP_LABELS.has(name) ? `${CLIP_LABELS.get(name)} · ${name}` : name, name));
  refreshControls();
}

async function ensureNativeClips(lab) {
  const bundles = await Promise.all(ACTORS.map(loadBundle));
  const added = {};
  for (let index = 0; index < ACTORS.length; index += 1) {
    const actor = ACTORS[index];
    const runtime = lab.getRuntime(actor.currentId);
    const existing = new Set(runtime.clips.map((clip) => clip.name));
    const missing = bundles[index].clips.filter((clip) => !existing.has(`${PREFIX}${clip.name}`));
    added[actor.currentId] = missing.length ? lab.addClips(actor.currentId, missing, { prefix: PREFIX }).added : [];
  }
  refreshCatalog();
  return added;
}

async function loadView(lab, ids) {
  const result = await lab.load(ids);
  if (result.superseded) throw new Error('Выбор моделей изменился во время загрузки.');
  if (!result.ready || result.failed?.length) throw new Error(`Не удалось подготовить модели: ${(result.failed || ids).join(', ')}.`);
  return result;
}

function chooseNativeClip(lab, name) {
  const cleanName = baseName(String(name));
  if (!state.names.includes(cleanName)) throw new Error(`Движение «${cleanName}» отсутствует в обоих готовых наборах.`);
  const mapping = Object.fromEntries(ACTORS.map((actor) => [actor.currentId, `${PREFIX}${cleanName}`]));
  // In comparison view the source plays its own original clip, while current
  // plays the verified converted clip. No source mesh replaces current.
  for (const actor of ACTORS) {
    if (lab.activeIds.includes(actor.sourceId)) mapping[actor.sourceId] = cleanName;
  }
  lab.pause();
  // These are original one-shot/root-motion clips. Repeating a moving root
  // would teleport it to the start; continuous locomotion has its own bench.
  lab.setLoop(false);
  const result = lab.setClip(mapping);
  if (result.missing.length) throw new Error(`Не найдены клипы: ${result.missing.map((item) => `${item.id} / ${item.clip}`).join(', ')}.`);
  lab.setPhase(0);
  state.clip = cleanName;
  refreshControls();
  return result;
}

function successMessage(comparing) {
  const clip = CLIP_LABELS.get(state.clip) || state.clip;
  const message = comparing
    ? `${clip}: исходные и выставочные модели стоят рядом. Клип каждого сохраняет собственную длительность; нажмите «Воспроизвести» для просмотра.`
    : `${clip} готово на двух выставочных моделях. Внешность сохранена; нажмите «Воспроизвести» для просмотра.`;
  const note = state.clip === 'Walk'
    ? ' Здесь показан исходный цикл со смещением. Для непрерывной ходьбы откройте «Контакт стоп».'
    : ' Повтор по умолчанию выключен; его можно включить флажком «Цикл».';
  setStatus(message + note, 'ready');
}

function snapshot() {
  return {
    ready: state.ready, busy: state.busy, clip: state.clip, mode: state.mode,
    prefix: PREFIX, activeIds: state.lab ? [...state.lab.activeIds] : [],
    names: [...state.names],
    bundles: ACTORS.map((actor) => ({ actor: actor.actor, currentId: actor.currentId, sourceId: actor.sourceId, url: actor.url, clips: state.bundles.get(actor.currentId)?.names || [] })),
    errors: state.errors.map((error) => ({ ...error })),
  };
}

export function loadNative() {
  return runOperation('Загружаем готовые движения и выставочные модели…', async () => {
    const lab = await getLab();
    // The explicit load can supersede the lab's initial source-only view.
    await Promise.all([
      loadView(lab, ACTORS.map((actor) => actor.currentId)),
      Promise.all(ACTORS.map(loadBundle)),
    ]);
    const added = await ensureNativeClips(lab);
    state.mode = 'current';
    const first = state.names.includes('Wave') ? 'Wave' : state.names[0];
    chooseNativeClip(lab, first);
    lab.setView?.('three-quarter');
    successMessage(false);
    return { ...snapshot(), ready: true, busy: false, added };
  });
}

export function setNativeClip(name) {
  return runOperation('Выбираем движение…', async () => {
    const lab = await getLab();
    const currentIds = ACTORS.map((actor) => actor.currentId);
    if (!currentIds.every((id) => lab.activeIds.includes(id))) {
      const sources = ACTORS.map((actor) => actor.sourceId).filter((id) => lab.activeIds.includes(id));
      await loadView(lab, [...currentIds, ...sources]);
    }
    await ensureNativeClips(lab);
    chooseNativeClip(lab, name);
    const comparing = ACTORS.some((actor) => lab.activeIds.includes(actor.sourceId));
    state.mode = comparing ? 'comparison' : 'current';
    successMessage(comparing);
    return { ...snapshot(), ready: true, busy: false };
  });
}

export function compareSources() {
  return runOperation('Готовим сравнение исходных и выставочных моделей…', async () => {
    const lab = await getLab();
    const ids = ACTORS.flatMap((actor) => [actor.sourceId, actor.currentId]);
    await loadView(lab, ids);
    await ensureNativeClips(lab);
    chooseNativeClip(lab, state.names.includes(state.clip) ? state.clip : state.names[0]);
    state.mode = 'comparison';
    lab.setView?.('three-quarter');
    successMessage(true);
    return { ...snapshot(), ready: true, busy: false };
  });
}

window.motionExperiments = Object.freeze({
  loadNative, setNativeClip, compareSources, snapshot,
  isReady: () => state.ready && !state.busy,
  whenReady: () => state.initialPromise,
  get errors() { return state.errors.map((error) => ({ ...error })); },
});

// Initial view: the two actual exhibition models, Native · Wave, paused.
// Failures remain visible in the panel; a click retries without dialogs.
state.initialPromise = loadNative().catch((error) => ({ ready: false, error: error.message }));
