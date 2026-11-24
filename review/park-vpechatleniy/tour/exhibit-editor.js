import * as THREE from 'three';
import { getPlacementBounds } from './exhibits.js?v=park-zones-20261124';

const STORAGE_KEY = 'park-exhibit-layout-v2-source-zones-20261124';
const MAX_UNDO = 50;
const degrees = radians => radians * 180 / Math.PI;
const radians = value => value * Math.PI / 180;
const number = value => Math.round(value * 1000) / 1000;
const dimensionFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 });
const dimensionLabel = dimensions => dimensions.map(value => dimensionFormat.format(value)).join(' × ') + ' м';
const sameLayout = (a, b) => JSON.stringify(a.instances) === JSON.stringify(b.instances);
const ICONS = {
  O01: '<ellipse cx="16" cy="9" rx="12" ry="4"/><path d="M4 9v14c0 5 24 5 24 0V9M12 27v-9h8v9M7 14h3m12 0h3"/>',
  O02: '<path d="M3 26a13 18 0 0 1 26 0ZM3 26l7-11 6-7 6 7 7 11M10 15h12M7 21h18M10 15l6 11 6-11M16 8v7"/>',
  O03: '<circle cx="16" cy="12" r="9"/><path d="M12 21l-3 8h14l-3-8M12 9h.1M19 7h.1M20 15h.1M13 15h.1"/>',
  O04: '<rect x="10" y="3" width="12" height="10" rx="5"/><path d="M12 7h8M10 14l-4 8m16-8 4 8M10 14v8l-2 7m14-15v8l2 7M10 22h12M14 16h4"/>',
  O05: '<path d="M16 2l3 11 11 7v3l-11-3v6l4 3v1l-7-2-7 2v-1l4-3v-6L2 23v-3l11-7Z"/>',
  O06: '<path d="M5 4h22l-3 19H8ZM12 4l-1 19m9-19 1 19M2 27q4-4 8 0t8 0 8 0l4-1M4 10h24"/>',
  O07: '<path d="M3 16c2-8 17-8 19 0l7-7-1 7 2 6-9-3C12 28 4 24 3 16ZM8 14h.1M13 21l3 5M8 7l-2-3m3 3 2-4"/>',
  O08: '<path d="M2 16c2-10 19-11 21 0l7-7-2 8 2 7-9-3C12 28 3 24 2 16ZM7 14h.1M5 20c5 2 9 2 13-1M11 23l5 5"/>',
  O09: '<path d="M12 23V10l4-8 4 8v13ZM12 18l-5 7h5m8-7 5 7h-5M14 26l2 4 2-4M12 11h8"/>',
  O10: '<path d="M8 29V4h12v25M8 4l12 8-12 8 12 9M20 7h7v4h-7M20 16h6v4h-6M5 29h19M8 12h12M8 20h12"/>',
  O11: '<rect x="11" y="6" width="11" height="20" rx="5"/><path d="M11 13H4v13H1m21-9h7v-8h-7M14 2v4m5-4v4M10 29h14M14 11h5m-5 5h5"/>',
  O12: '<path d="M2 20h28l-7 8H8ZM7 20v-6h17v6M12 14V8h8v6M16 8V3m-6 22h.1m5 0h.1m5 0h.1M3 30q4-3 8 0t8 0 8 0"/>',
  O13: '<circle cx="10" cy="24" r="5"/><circle cx="24" cy="25" r="3"/><path d="M5 20V9h13v13m0-11h8v11M8 9V5h10v4M2 17H0m0 0v10m0-5h5M8 13h6v5H8Z"/>',
  O14: '<rect x="12" y="12" width="8" height="8" rx="2"/><path d="M12 12 6 6m14 6 6-6M12 20l-6 6m14-6 6 6"/><ellipse cx="6" cy="6" rx="5" ry="3"/><ellipse cx="26" cy="6" rx="5" ry="3"/><ellipse cx="6" cy="26" rx="5" ry="3"/><ellipse cx="26" cy="26" rx="5" ry="3"/>',
  O15: '<path d="M2 23h28M3 23C5 3 27 3 29 23M7 23V13m6 10V9m6 14V9m6 14V13M3 23v6m26-6v6M7 13l6 10 6-14 6 14"/>',
  O16: '<path d="M2 11 16 3l14 8ZM5 12v15h22V12M3 29h26M9 27V17a3 3 0 0 1 6 0v10m2 0V17a3 3 0 0 1 6 0v10M5 12h22"/>',
};

/** Independent instance editor. Camera modes and cutaway remain viewer-owned. */
export function createExhibitEditor({
  system, scene, camera, controls, domElement,
  onFocus = () => {}, onEditStart = () => {}, onEditEnd = () => {}, onChange = () => {},
  deferRestore = false,
}) {
  if (!system?.updateInstance || !scene?.isScene || !camera || !controls || !domElement) {
    throw new TypeError('Редактору нужны экспонаты, сцена, камера и управление.');
  }
  const $ = id => document.getElementById(id);
  const panel = $('exhibit-editor'), toggle = $('editor-toggle'), catalog = $('editor-catalog');
  if (!panel || !toggle) throw new Error('Не найдена панель расстановки.');
  const events = new AbortController(), signal = events.signal;
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  raycaster.firstHitOnly = true;
  const highlight = new THREE.Box3Helper(new THREE.Box3(), 0xffad74);
  highlight.name = 'Выбранный экземпляр';
  highlight.userData.editorHelper = true;
  highlight.material.depthTest = false;
  highlight.material.depthWrite = false;
  highlight.material.transparent = true;
  highlight.material.opacity = 0.85;
  highlight.renderOrder = 1000;
  highlight.frustumCulled = false;
  highlight.visible = false;
  scene.add(highlight);
  const cards = new Map(), undo = [], redo = [];
  let enabled = true, disposed = false, selectedId = null, mode = 'move', floorMode = 'auto';
  let drag = null, pendingMove = null, moveFrame = 0, busy = false;
  let saveState = 'empty', saveError = null, restored = false, lastAction = null, lastError = null;
  let rejectedSavedRaw = null, rejectedSavedBackupKey = null, recoveryExport = null;

  function invoke(callback, ...args) {
    try {
      const result = callback(...args);
      if (result?.catch) result.catch(error => setMessage(error.message || String(error), true));
    } catch (error) { setMessage(error.message || String(error), true); }
  }

  function setMessage(text, error = false) {
    $('editor-message').textContent = text;
    $('editor-message').classList.toggle('is-error', error);
    if (error) lastError = text;
  }

  function updateHighlight(candidate = null, invalid = false) {
    const item = selectedId && system.getInstance(selectedId);
    highlight.visible = Boolean(enabled && !panel.hidden && item?.visible && system.group.visible);
    if (!highlight.visible) return;
    const pose = candidate || item;
    highlight.box.copy(getPlacementBounds(pose.dimensions || item.dimensions, pose, pose.y));
    highlight.material.color.setHex(invalid ? 0xff665c : 0xffad74);
    highlight.updateMatrixWorld(true);
  }

  function getState() {
    const instances = system.listInstances();
    return {
      enabled, open: !panel.hidden, selectedInstanceId: selectedId, mode, floorMode,
      dragging: Boolean(drag), busy, totalInstances: instances.length,
      visibleInstances: instances.filter(row => row.visible).length,
      hiddenInstances: instances.filter(row => !row.visible).length,
      modifiedInstances: instances.filter(row => row.modified).length,
      undoDepth: undo.length, redoDepth: redo.length,
      storageKey: STORAGE_KEY, saveState, saveError, restored, lastAction, lastError, instances,
      rejectedSavedPreserved: rejectedSavedRaw !== null, rejectedSavedBackupKey,
    };
  }

  function notify() { invoke(onChange, getState()); }

  function renderSelection({ fields = true } = {}) {
    const item = selectedId && system.getInstance(selectedId);
    $('editor-selection').hidden = !item;
    $('editor-empty').hidden = Boolean(item);
    for (const [id, button] of cards) {
      const current = system.getInstance(id);
      button.setAttribute('aria-pressed', String(id === selectedId));
      button.classList.toggle('is-hidden', !current.visible);
      button.classList.toggle('is-modified', current.modified);
      button.setAttribute('aria-label', `${current.name}, экземпляр ${current.ordinal} из ${current.copies}${current.visible ? '' : ', скрыт'}`);
      button.title = `${current.name} · ${id}${current.visible ? '' : ' · скрыт'}`;
    }
    if (item) {
      $('editor-selected-name').textContent = item.name;
      $('editor-selected-id').textContent = item.instanceId + (item.floating ? ' · подвесной' : item.floorY < 10 ? ' · основной этаж' : ' · антресоль');
      if ($('editor-dimensions')) $('editor-dimensions').textContent = dimensionLabel(item.dimensions);
      if ($('editor-instance-note')) {
        $('editor-instance-note').hidden = item.exhibitId !== 'O12';
        $('editor-instance-note').textContent = item.exhibitId === 'O12' ? 'Переход к рубке показан для исходного размера и положения.' : '';
      }
      $('editor-visibility').textContent = item.visible ? 'Скрыть' : 'Показать';
      $('editor-visibility').setAttribute('aria-pressed', String(!item.visible));
      $('editor-floor-row').hidden = item.floating;
      $('editor-height-row').hidden = !item.floating;
      $('editor-floor-current').textContent = item.floating ? '' : `Сейчас: ${item.floorY < 10 ? 'основной этаж' : 'антресоль'}`;
      $('editor-gesture-hint').textContent = !item.visible ? 'Нажмите «Показать», чтобы изменить экземпляр.' :
        mode === 'view' ? 'Мышью или пальцами осмотрите объект.' :
        mode === 'rotate' ? 'Потяните влево или вправо для поворота.' :
        mode === 'scale' ? 'Влево — меньше. Вправо — больше.' :
        item.floating ? 'Перетаскивание сохраняет высоту.' : 'Перетащите объект на нужное место.';
      for (const button of panel.querySelectorAll('[data-editor-mode]')) {
        button.setAttribute('aria-pressed', String(button.dataset.editorMode === mode));
        button.disabled = !enabled || busy || !item.visible;
      }
      for (const input of $('editor-transform').querySelectorAll('input, button')) input.disabled = !enabled || busy || !item.visible;
      if (fields) {
        $('editor-x').value = number(item.x);
        $('editor-z').value = number(item.z);
        $('editor-y').value = number(item.y);
        $('editor-angle').value = number(degrees(item.rotationY));
        if ($('editor-scale')) $('editor-scale').value = Number(item.scaleFactor.toPrecision(6));
      }
    }
    const state = getState();
    $('editor-count').textContent = `${state.totalInstances} экземпляра`;
    $('editor-summary').textContent = `${state.visibleInstances} видно · ${state.hiddenInstances} скрыто`;
    $('editor-undo').disabled = !enabled || busy || !undo.length;
    $('editor-redo').disabled = !enabled || busy || !redo.length;
    $('editor-reset').disabled = !enabled || busy || !state.modifiedInstances;
    const saveIndicator = $('editor-save-indicator');
    if (saveIndicator) {
      saveIndicator.textContent = saveState === 'saved' ? 'Сохранено' : saveState === 'restored' ? 'Восстановлено' :
        saveState === 'unavailable' ? 'Нужен экспорт' : saveState === 'invalid' ? 'Ошибка файла' : 'Автосохранение';
      saveIndicator.title = $('editor-save-status').textContent;
    }
    updateHighlight();
  }

  function persist() {
    try {
      // A later valid edit must not destroy the saved layout rejected at startup.
      // Back it up first; if storage is full, keep the original key untouched.
      if (rejectedSavedRaw !== null && !rejectedSavedBackupKey) {
        const prefix = STORAGE_KEY + '-rejected-' + Date.now();
        let key = prefix, suffix = 0;
        while (localStorage.getItem(key) !== null) key = prefix + '-' + ++suffix;
        localStorage.setItem(key, rejectedSavedRaw);
        rejectedSavedBackupKey = key;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...system.getLayout(), savedAt: new Date().toISOString() }));
      saveState = 'saved'; saveError = null;
      $('editor-save-status').textContent = 'Сохранено в этом браузере · одинаково для 2K и 4K';
    } catch (error) {
      saveState = 'unavailable'; saveError = error.message || String(error);
      $('editor-save-status').textContent = 'Автосохранение недоступно. Скачайте JSON, чтобы сохранить изменения.';
    }
  }

  function remember(before, action) {
    const after = system.getLayout();
    if (sameLayout(before, after)) return false;
    undo.push(before);
    if (undo.length > MAX_UNDO) undo.shift();
    redo.length = 0;
    lastAction = action; lastError = null;
    persist();
    return true;
  }

  function transact(action, operation) {
    if (!enabled || busy || drag) return false;
    const before = system.getLayout();
    invoke(onEditStart, selectedId);
    const result = operation();
    if (result?.ok) {
      if (remember(before, action)) setMessage(action + (saveState === 'saved' ? '. Изменения сохранены.' : '. Для сохранения скачайте JSON.'));
    } else setMessage(result?.error || 'Изменение не применено.', true);
    renderSelection();
    invoke(onEditEnd, selectedId);
    notify();
    return Boolean(result?.ok);
  }

  function selectInstance(id, { focus = true } = {}) {
    if (disposed || !enabled || !system.getInstance(id)) return false;
    if (drag) finishDrag(false);
    selectedId = id;
    setOpen(true);
    catalog.open = false; panel.scrollTop = 0;
    renderSelection();
    setMessage('Изменения сохраняются автоматически в этом браузере.');
    if (focus) invoke(onFocus, id);
    notify();
    return true;
  }

  function clearSelection() {
    if (drag) finishDrag(false);
    selectedId = null;
    catalog.open = true;
    renderSelection();
    notify();
  }

  function setOpen(open) {
    if (!enabled && open) return;
    if (!open) clearSelection();
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    panel.dispatchEvent(new CustomEvent('park-panel-visibility', { bubbles: true, detail: { open } }));
    updateHighlight(); notify();
  }

  function setMode(value) {
    if (!['view', 'move', 'rotate', 'scale'].includes(value)) return;
    if (drag) finishDrag(false);
    mode = value;
    renderSelection(); notify();
  }

  function pointerRay(event) {
    const rect = domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    camera.updateWorldMatrix(true, false);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.ray;
  }

  function pointerDown(event) {
    // Touch remains with OrbitControls, including two-finger zoom. All editing
    // operations also have explicit form controls for touch and keyboard use.
    if (!enabled || busy || panel.hidden || !selectedId || mode === 'view' ||
        event.button !== 0 || event.pointerType === 'touch' || drag) return;
    const item = system.getInstance(selectedId), root = system.getInstanceRoot(selectedId);
    if (!item?.visible || !system.group.visible || !root) return;
    pointerRay(event);
    root.updateWorldMatrix(true, true);
    const hit = raycaster.intersectObject(root, true)[0];
    if (!hit) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const before = system.getLayout(), wasEnabled = controls.enabled;
    invoke(onEditStart, selectedId);
    controls.enabled = false;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -hit.point.y);
    const point = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    drag = {
      id: selectedId, pointerId: event.pointerId, mode, before, start: item,
      startX: event.clientX, wasEnabled, plane,
      offset: point ? new THREE.Vector3(item.x - point.x, 0, item.z - point.z) : new THREE.Vector3(),
      invalid: false, lastResult: null,
    };
    if (!item.floating && mode === 'move') {
      const floor = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -item.y), new THREE.Vector3());
      drag.offset.set(floor ? item.x - floor.x : 0, 0, floor ? item.z - floor.z : 0);
    }
    domElement.setPointerCapture(event.pointerId);
    domElement.classList.add('editing-exhibit');
    $('editor-message').setAttribute('aria-live', 'off');
    notify();
  }

  function moveDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const item = system.getInstance(drag.id), patch = {};
    const options = { floorMode, notify: false };
    let candidate;
    if (drag.mode === 'rotate') {
      patch.rotationY = drag.start.rotationY + (event.clientX - drag.startX) * 0.012;
      options.floorMode = 'auto';
      if (!item.floating) options.floorY = item.floorY;
      candidate = { ...item, ...patch };
    } else if (drag.mode === 'scale') {
      const exponent = THREE.MathUtils.clamp((event.clientX - drag.startX) * 0.0075, -5, 5);
      patch.scaleFactor = drag.start.scaleFactor * Math.exp(exponent);
      options.floorMode = 'auto';
      if (!item.floating) options.floorY = item.floorY;
      candidate = { ...item, ...patch, dimensions: item.originalDimensions.map(value => value * patch.scaleFactor) };
    } else {
      const ray = pointerRay(event);
      if (item.floating) {
        const point = ray.intersectPlane(drag.plane, new THREE.Vector3());
        if (!point) { setMessage('Для переноса выберите более высокий ракурс.', true); return; }
        patch.x = point.x + drag.offset.x; patch.z = point.z + drag.offset.z;
      } else {
        const floor = system.pickFloor(ray, { floorMode });
        if (!floor) {
          drag.invalid = true;
          updateHighlight(null, true);
          setMessage('Под указателем нет пола выбранного этажа. Положение не изменено.', true);
          notify(); return;
        }
        patch.x = floor.x + drag.offset.x; patch.z = floor.z + drag.offset.z;
        options.floorY = floor.floorY;
      }
      candidate = { ...item, ...patch, y: item.floating ? item.y : options.floorY };
    }
    const result = system.updateInstance(drag.id, patch, options);
    drag.invalid = !result.ok; drag.lastResult = result;
    renderSelection();
    if (!result.ok) {
      updateHighlight(candidate, true);
      setMessage(result.error + ' Оставлена последняя допустимая позиция.', true);
    } else {
      lastError = null;
      setMessage(drag.mode === 'scale' ? 'Размер: ' + dimensionLabel(result.instance.dimensions) :
        item.floating ? 'Свободное положение · высота сохранена' :
        result.instance.floorY < 10 ? 'На полу основного этажа' : 'На полу антресоли');
    }
    notify();
  }

  function pointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault(); event.stopImmediatePropagation();
    pendingMove = { clientX: event.clientX, clientY: event.clientY, pointerId: event.pointerId };
    if (!moveFrame) moveFrame = requestAnimationFrame(() => {
      moveFrame = 0;
      const next = pendingMove; pendingMove = null;
      if (next) moveDrag(next);
    });
  }

  function finishDrag(commit = true) {
    if (!drag) return;
    if (moveFrame) cancelAnimationFrame(moveFrame);
    moveFrame = 0;
    if (commit && pendingMove) moveDrag(pendingMove);
    pendingMove = null;
    const current = drag; drag = null;
    if (domElement.hasPointerCapture(current.pointerId)) domElement.releasePointerCapture(current.pointerId);
    controls.enabled = current.wasEnabled;
    domElement.classList.remove('editing-exhibit');
    $('editor-message').setAttribute('aria-live', 'polite');
    if (commit) {
      const changed = remember(current.before, current.mode === 'scale' ? 'Размер экземпляра изменён' :
        current.mode === 'rotate' ? 'Экземпляр повёрнут' : 'Экземпляр перемещён');
      setMessage(current.invalid ? 'Неподдерживаемая позиция отклонена. Сохранена последняя допустимая.' :
        changed ? (saveState === 'saved' ? 'Расстановка сохранена в этом браузере.' : 'Изменения применены. Для сохранения скачайте JSON.') : 'Положение не изменено.', current.invalid);
    } else {
      const result = system.applyLayout(current.before, { notify: false });
      if (!result.ok) remember(current.before, 'Сохранена последняя допустимая позиция');
      setMessage(result.ok ? 'Перемещение отменено.' : 'Отмена недоступна: ' + result.error + ' Сохранена текущая допустимая позиция.', !result.ok);
    }
    renderSelection();
    invoke(onEditEnd, current.id);
    notify();
  }

  function pointerUp(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault(); event.stopImmediatePropagation();
    finishDrag(event.type === 'pointerup');
  }

  function travelHistory(from, to, label) {
    if (!enabled || busy || drag || !from.length) return;
    const target = from.at(-1), before = system.getLayout();
    invoke(onEditStart, selectedId);
    const result = system.applyLayout(target, { notify: false });
    if (result.ok) {
      from.pop(); to.push(before); persist(); lastAction = label; lastError = null;
      setMessage(label + (saveState === 'saved' ? '. Расстановка сохранена.' : '. Для сохранения скачайте JSON.'));
    } else setMessage(result.error, true);
    renderSelection(); invoke(onEditEnd, selectedId); notify();
  }

  for (const item of system.listInstances()) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'editor-instance';
    button.dataset.instanceId = item.instanceId;
    button.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">' + ICONS[item.exhibitId] + '</svg>';
    const label = document.createElement('span'); label.className = 'editor-card-id';
    label.textContent = item.exhibitId.slice(1) + (item.copies > 1 ? '·' + item.ordinal : '');
    button.append(label);
    button.addEventListener('click', () => selectInstance(item.instanceId), { signal });
    $('editor-instances').append(button); cards.set(item.instanceId, button);
  }
  toggle.disabled = false;
  toggle.addEventListener('click', () => setOpen(panel.hidden), { signal });
  panel.addEventListener('park-panel-close', () => setOpen(false), { signal });
  $('editor-close').addEventListener('click', () => setOpen(false), { signal });
  for (const button of panel.querySelectorAll('[data-editor-mode]')) {
    button.addEventListener('click', () => setMode(button.dataset.editorMode), { signal });
  }
  $('editor-floor').addEventListener('change', event => {
    floorMode = event.target.value;
    setMessage('Уровень будет применён при следующем переносе.'); notify();
  }, { signal });
  $('editor-visibility').addEventListener('click', () => {
    const item = system.getInstance(selectedId);
    if (!item) return;
    transact(item.visible ? 'Экземпляр скрыт' : 'Экземпляр показан', () => system.updateInstance(selectedId, { visible: !item.visible }, { notify: false }));
  }, { signal });
  $('editor-transform').addEventListener('submit', event => {
    event.preventDefault();
    const item = system.getInstance(selectedId);
    if (!item?.visible) return;
    const scaleInput = $('editor-scale');
    const values = ['editor-x', 'editor-z', 'editor-angle', ...(item.floating ? ['editor-y'] : []),
      ...(scaleInput ? ['editor-scale'] : [])].map(id => $(id).valueAsNumber);
    if (!values.every(Number.isFinite)) { setMessage('Введите числовые координаты и угол.', true); return; }
    const patch = { x: values[0], z: values[1], rotationY: radians(values[2]) };
    if (item.floating) patch.y = values[3];
    if (scaleInput) patch.scaleFactor = scaleInput.valueAsNumber;
    transact('Координаты обновлены', () => system.updateInstance(selectedId, patch, { floorMode, notify: false }));
  }, { signal });
  $('editor-undo').addEventListener('click', () => travelHistory(undo, redo, 'Изменение отменено'), { signal });
  $('editor-redo').addEventListener('click', () => travelHistory(redo, undo, 'Изменение повторено'), { signal });
  $('editor-reset').addEventListener('click', () => transact('Исходная расстановка восстановлена', () => system.resetLayout({ notify: false })), { signal });
  $('editor-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ ...system.getLayout(), exportedAt: new Date().toISOString() }, null, 2) + '\n'], { type: 'application/json' });
    const address = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = address; link.download = 'park-layout-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(address), 1000);
    setMessage('Файл расстановки скачан. Его можно импортировать на другом устройстве.');
  }, { signal });
  $('editor-import').addEventListener('click', () => $('editor-import-file').click(), { signal });
  $('editor-import-file').addEventListener('change', async event => {
    const file = event.target.files[0]; event.target.value = '';
    if (!file || busy || drag) return;
    if (file.size > 512 * 1024) { setMessage('Файл слишком большой для расстановки из 24 экземпляров.', true); return; }
    busy = true; renderSelection();
    try {
      const layout = JSON.parse(await file.text());
      if (disposed) return;
      busy = false;
      transact('Расстановка импортирована', () => system.applyLayout(layout, { notify: false }));
    } catch (error) { setMessage('Не удалось прочитать JSON: ' + error.message, true); }
    finally { busy = false; if (!disposed) { renderSelection(); notify(); } }
  }, { signal });
  domElement.addEventListener('pointerdown', pointerDown, { capture: true, signal });
  domElement.addEventListener('pointermove', pointerMove, { capture: true, signal });
  domElement.addEventListener('pointerup', pointerUp, { capture: true, signal });
  domElement.addEventListener('pointercancel', pointerUp, { capture: true, signal });
  domElement.addEventListener('lostpointercapture', () => { if (drag) finishDrag(false); }, { signal });
  domElement.addEventListener('dblclick', event => {
    if (!panel.hidden && selectedId && mode !== 'view') { event.preventDefault(); event.stopImmediatePropagation(); }
  }, { capture: true, signal });
  domElement.addEventListener('wheel', event => {
    if (drag) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, { capture: true, passive: false, signal });
  window.addEventListener('blur', () => { if (drag) finishDrag(false); }, { signal });
  document.addEventListener('keydown', event => {
    if (panel.hidden || !enabled || /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName)) return;
    if (event.key === 'Escape' && drag) { event.preventDefault(); event.stopImmediatePropagation(); finishDrag(false); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault(); event.stopImmediatePropagation();
      event.shiftKey ? travelHistory(redo, undo, 'Изменение повторено') : travelHistory(undo, redo, 'Изменение отменено');
    }
  }, { capture: true, signal });

  function retainRejectedSave(raw) {
    rejectedSavedRaw = raw;
    if (recoveryExport) return;
    recoveryExport = document.createElement('button');
    recoveryExport.type = 'button'; recoveryExport.id = 'editor-export-rejected';
    recoveryExport.textContent = 'Скачать прежнюю расстановку';
    recoveryExport.addEventListener('click', () => {
      const address = URL.createObjectURL(new Blob([rejectedSavedRaw], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = address; link.download = 'park-layout-preserved.json';
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(address), 1000);
    }, { signal });
    $('editor-export').parentElement.append(recoveryExport);
  }

  // Called after the live placement guard is bound, while the crowd is empty.
  // Failed imports are atomic in the exhibit system and never overwrite storage.
  function restoreSavedLayout() {
    if (disposed || busy || drag) return { ok: false, error: 'Редактор пока не готов к восстановлению.' };
    let saved, editing = false;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        const previous=localStorage.getItem('park-exhibit-layout-v1');
        if(previous){retainRejectedSave(previous);saveState='source-zones-updated';$('editor-save-status').textContent='Показана расстановка по исходным зонам. Прежнюю можно скачать.';}
        return { ok: true, restored: false, previousLayoutPreserved:Boolean(previous) };
      }
      const layout = JSON.parse(saved);
      invoke(onEditStart, null); editing = true;
      const result = system.applyLayout(layout, { notify: false });
      if (!result.ok) {
        const details = [...new Set((result.conflicts || []).flatMap(row => [row.obstacleId, row.transitionId]).filter(Boolean))].slice(0, 4).join(', ');
        const reason = (result.error || 'Расстановка не прошла проверку проходов.') + (details ? ' (' + details + ')' : '');
        const error = 'Сохранённая расстановка не применена: ' + reason + ' Показана исходная расстановка; сохранение оставлено без изменений.';
        retainRejectedSave(saved); saveState = 'invalid'; saveError = error; restored = false;
        $('editor-save-status').textContent = 'Прежнее сохранение не изменено. Его можно скачать отдельной кнопкой.';
        setMessage(error, true);
        return { ...result, ok: false, restored: false, error, originalPreserved: true };
      }
      saveState = 'restored'; saveError = null; restored = true; lastError = null;
      $('editor-save-status').textContent = 'Восстановлена ваша расстановка · сохранение в этом браузере';
      setMessage('Загружена ранее сохранённая расстановка.');
      return { ok: true, restored: true };
    } catch (error) {
      const message = 'Сохранённая расстановка не применена: ' + (error.message || String(error));
      if (saved !== undefined && saved !== null) retainRejectedSave(saved);
      saveState = saved ? 'invalid' : 'unavailable'; saveError = message; restored = false;
      $('editor-save-status').textContent = saved ? 'Прежнее сохранение не изменено. Его можно скачать отдельной кнопкой.' : 'Автосохранение недоступно. Используйте экспорт JSON.';
      setMessage(message, true);
      return { ok: false, restored: false, error: message, originalPreserved: Boolean(saved) };
    } finally {
      if (editing) invoke(onEditEnd, null);
      renderSelection(); notify();
    }
  }
  if (!deferRestore) restoreSavedLayout();
  renderSelection(); notify();

  return {
    getState, selectInstance, clearSelection, restoreSavedLayout,
    setEnabled(value) {
      enabled = Boolean(value); toggle.disabled = !enabled;
      if (!enabled) setOpen(false);
      renderSelection(); notify();
    },
    dispose() {
      if (disposed) return;
      if (drag) finishDrag(false);
      disposed = true; enabled = false;
      events.abort(); if (moveFrame) cancelAnimationFrame(moveFrame);
      highlight.removeFromParent(); highlight.geometry.dispose(); highlight.material.dispose();
      recoveryExport?.remove();
      $('editor-instances').replaceChildren(); panel.hidden = true;
      toggle.disabled = true; toggle.setAttribute('aria-expanded', 'false');
    },
  };
}
