import * as THREE from 'three';
import { TransformControls } from './vendor/TransformControls.js';
import { getPlacementBounds } from './exhibits.js?v=equipment-3d-20261125';

const STORAGE_KEY = 'park-exhibit-layout-v3-exhibition-20261125';
const PREVIOUS_STORAGE_KEY = 'park-exhibit-layout-v2-source-zones-20261124';
const MAX_UNDO = 50;
const degrees = radians => radians * 180 / Math.PI;
const radians = value => value * Math.PI / 180;
const number = value => Math.round(value * 1000) / 1000;
const dimensionFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 });
const dimensionLabel = dimensions => dimensions.map(value => dimensionFormat.format(value)).join(' × ') + ' м';
const sameLayout = (a, b) => JSON.stringify(a.instances) === JSON.stringify(b.instances);
const editKeys = ['x', 'y', 'z', 'rotationY', 'scaleFactor', 'visible', 'floorY'];
const managedRow = (row, isManaged = () => false) => Boolean(row?.managedEquipment || row?.equipmentPlanId || isManaged(row?.instanceId));
const rowChanged = (before, after) => editKeys.some(key => before?.[key] !== after?.[key]);

/** Old exhibit saves may predate added equipment. The current plan owns its poses. */
export function mergeSavedExhibitLayout(saved, current, isManaged = () => false) {
  if (saved?.schema !== 'park-exhibit-layout' || saved.version !== 1 || saved.units !== 'meters' || saved.upAxis !== 'Y' || !Array.isArray(saved.instances)) {
    throw new Error('Нужен файл расстановки Парка впечатлений, версия 1, метры / Y вверх.');
  }
  const known = new Map(current.instances.map(row => [row.instanceId, row])), rows = new Map();
  let preservedEquipment = 0;
  for (const row of saved.instances) {
    if (!row || typeof row.instanceId !== 'string' || rows.has(row.instanceId)) throw new Error('Неизвестный или повторный экземпляр в сохранении.');
    rows.set(row.instanceId, row);
    if (managedRow(row, isManaged) || managedRow(known.get(row.instanceId), isManaged)) { preservedEquipment++; continue; }
    if (!known.has(row.instanceId)) throw new Error('В сохранении есть неизвестный экспонат.');
  }
  return {
    layout: { ...current, instances: current.instances.map(row => ({ ...((managedRow(row, isManaged) ? null : rows.get(row.instanceId)) || row) })) },
    preservedEquipment,
  };
}

/** Apply only an edit's changed objects; a newer plan keeps its other positions. */
export function rebaseExhibitHistory(target, current, changedIds) {
  const ids = new Set(changedIds), rows = new Map(target.instances.map(row => [row.instanceId, row]));
  return { ...current, instances: current.instances.map(row => {
    if (row.equipmentPlanId && !row.visible) return { ...row };
    const previous = ids.has(row.instanceId) && rows.get(row.instanceId);
    return previous ? { ...row, ...previous, ...(row.equipmentPlanId ? {equipmentPlanId:row.equipmentPlanId, managedEquipment:true} : {}) } : { ...row };
  }) };
}

export function changedExhibitIds(before, after) {
  const rows = new Map(before.instances.map(row => [row.instanceId, row]));
  return after.instances.filter(row => rows.has(row.instanceId) && rowChanged(rows.get(row.instanceId), row)).map(row => row.instanceId);
}

export function managedExhibitChanges(before, after) {
  const ids = new Set(changedExhibitIds(before, after));
  return after.instances.filter(row => ids.has(row.instanceId) && row.equipmentPlanId).map(row => ({
    id: row.equipmentPlanId,
    position: { x:row.x, y:row.y, z:row.z, yaw:row.rotationY, floorId:Number(row.floorY ?? row.y) > 10 ? 'upper' : 'main' },
  }));
}


/** Independent instance editor. Camera modes and cutaway remain viewer-owned. */
export function createExhibitEditor({
  system, scene, camera, controls, domElement,
  onFocus = () => {}, onEditStart = () => {}, onEditEnd = () => {}, onChange = () => {},
  validateManagedChange = () => ({ok:true}), onManagedChange = () => {},
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
  const selector = $('editor-instances');
  let catalogSignature = '', lastRememberRejected = false;
  let enabled = true, disposed = false, selectedId = null, mode = 'move', floorMode = 'auto';
  let drag = null, pendingMove = null, moveFrame = 0, busy = false;
  let gizmoDrag = null, wheelEdit = null, wheelTimer = 0, snap = false;
  const proxy = new THREE.Object3D();
  proxy.name = 'Редактор · опорная точка';
  proxy.userData.editorHelper = true;
  scene.add(proxy);
  // Route the documented TransformControls pointer methods in capture phase.
  // OrbitControls never receives the same gesture, and geometry changes always
  // pass through the exhibit system's collision transaction.
  const gizmo = new TransformControls(camera, domElement);
  gizmo.disconnect(); gizmo.domElement = domElement; domElement.style.touchAction = 'none';
  const gizmoHelper = gizmo.getHelper();
  gizmoHelper.name = 'Перенос · поворот · размер';
  gizmoHelper.traverse(node => { node.userData.editorHelper = true; node.renderOrder = 1001; });
  scene.add(gizmoHelper); gizmo.enabled = false; gizmoHelper.visible = false;
  gizmo.setSize(1.15);
  const modeNames = { move: 'translate', rotate: 'rotate', scale: 'scale', view: 'translate' };

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
    const instances = system.listInstances().filter(row => !managedRow(row, system.isManagedInstance) || row.visible);
    return {
      enabled, open: !panel.hidden, selectedInstanceId: selectedId, mode, floorMode,
      dragging: Boolean(drag || gizmoDrag || wheelEdit), gizmo: { visible: gizmoHelper.visible, mode: gizmo.mode, axis: gizmo.axis, snap }, busy, totalInstances: instances.length,
      visibleInstances: instances.filter(row => row.visible).length,
      hiddenInstances: instances.filter(row => !row.visible).length,
      modifiedInstances: instances.filter(row => row.modified).length,
      undoDepth: undo.length, redoDepth: redo.length,
      storageKey: STORAGE_KEY, saveState, saveError, restored, lastAction, lastError, instances,
      rejectedSavedPreserved: rejectedSavedRaw !== null, rejectedSavedBackupKey,
    };
  }

  function notify() { invoke(onChange, getState()); }

  function syncCatalog() {
    const items = system.listInstances().filter(row => !managedRow(row, system.isManagedInstance) || row.visible);
    const signature = items.map(row => [row.instanceId,row.name,row.zone,row.copies,row.ordinal].join('|')).join('\n');
    if (selectedId && !items.some(row => row.instanceId === selectedId)) { selectedId = null; gizmo.detach(); }
    if (signature === catalogSignature) return;
    catalogSignature = signature; cards.clear(); selector.replaceChildren();
    const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Выберите объект в списке или в 3D'; selector.append(placeholder);
    const groups = new Map();
    for (const item of items) {
      const zone = item.zone || 'Общие пространства';
      if (!groups.has(zone)) { const group = document.createElement('optgroup'); group.label = zone; groups.set(zone, group); selector.append(group); }
      const option = document.createElement('option'); option.value = item.instanceId;
      option.textContent = item.name + (item.copies > 1 ? ' · ' + item.ordinal : '');
      groups.get(zone).append(option); cards.set(item.instanceId, option);
    }
    selector.value = selectedId || '';
  }

  function validatePosition(id, position) {
    try {
      const result = validateManagedChange(id, position);
      if (result?.then) return {ok:false,error:'Проверка положения ещё не завершена.'};
      return result?.ok === false ? result : {ok:true};
    } catch (error) { return {ok:false,error:error.message || 'Положение оборудования не принято.'}; }
  }

  function updateEditableInstance(id, patch, options = {}) {
    const item = system.getInstance(id);
    if (item?.equipmentPlanId) {
      if ((patch.scaleFactor !== undefined && patch.scaleFactor !== item.scaleFactor) || (patch.visible !== undefined && patch.visible !== item.visible)) {
        return {ok:false,error:'Количество оборудования меняется на схеме зоны. Здесь можно переместить и повернуть его.'};
      }
      const floorY = options.floorY ?? patch.floorY ?? item.floorY ?? item.y;
      const result = validatePosition(item.equipmentPlanId, {x:patch.x ?? item.x,z:patch.z ?? item.z,y:patch.y ?? floorY,yaw:patch.rotationY ?? item.rotationY,floorId:floorY > 10 ? 'upper' : 'main'});
      if (!result.ok) return result;
    }
    return system.updateInstance(id, patch, options);
  }

  function validateChanges(before, after) {
    for (const change of managedExhibitChanges(before, after)) {
      const result = validatePosition(change.id, change.position);
      if (!result.ok) return result;
    }
    return {ok:true};
  }

  function publishChanges(before, after) {
    for (const change of managedExhibitChanges(before, after)) invoke(onManagedChange, change.id, change.position);
  }

  function renderSelection({ fields = true } = {}) {
    syncCatalog();
    const item = selectedId && system.getInstance(selectedId);
    const managed = Boolean(item?.equipmentPlanId);
    if (managed && mode === 'scale') mode = 'move';
    $('editor-selection').hidden = !item;
    $('editor-empty').hidden = Boolean(item);
    for (const [id, button] of cards) {
      const current = system.getInstance(id);
      button.setAttribute('aria-pressed', String(id === selectedId));
      button.classList.toggle('is-hidden', !current.visible);
      button.classList.toggle('is-modified', current.modified);
      button.textContent = current.name + (current.copies > 1 ? ' · ' + current.ordinal : '') + (current.visible ? '' : ' · скрыт');
      button.title = current.name + (current.visible ? '' : ' · скрыт');
    }
    $('editor-instances').value = item?.instanceId || '';
    if (item) {
      $('editor-selected-name').textContent = item.name;
      $('editor-selected-id').textContent = (managed ? '' : item.instanceId + ' · ') + (item.floating ? 'подвесной' : item.floorY < 10 ? 'основной этаж' : 'антресоль');
      if ($('editor-dimensions')) $('editor-dimensions').textContent = dimensionLabel(item.dimensions);
      if ($('editor-instance-note')) {
        $('editor-instance-note').hidden = true;
        $('editor-instance-note').textContent = '';
      }
      $('editor-visibility').textContent = item.visible ? 'Скрыть' : 'Показать';
      $('editor-visibility').setAttribute('aria-pressed', String(!item.visible));
      $('editor-visibility').hidden = managed;
      $('editor-floor-row').hidden = item.floating || managed;
      $('editor-height-row').hidden = !item.floating;
      $('editor-floor-current').textContent = item.floating ? '' : `Сейчас: ${item.floorY < 10 ? 'основной этаж' : 'антресоль'}`;
      $('editor-gesture-hint').textContent = !item.visible ? 'Нажмите «Показать», чтобы изменить экземпляр.' :
        mode === 'view' ? 'Мышью или пальцами осмотрите объект.' :
        mode === 'rotate' ? 'Тяните кольцо вокруг объекта или сам объект влево / вправо.' :
        mode === 'scale' ? 'Тяните ручку размера или крутите колесо над сценой. Пропорции сохраняются.' :
        item.floating ? 'Тяните объект по горизонтали; зелёная стрелка меняет высоту.' : 'Тяните объект или стрелки. Правая кнопка сдвигает вид, колесо приближает.';
      for (const button of panel.querySelectorAll('[data-editor-mode]')) {
        button.setAttribute('aria-pressed', String(button.dataset.editorMode === mode));
        button.disabled = !enabled || busy || !item.visible || managed && button.dataset.editorMode === 'scale';
      }
      for (const input of $('editor-transform').querySelectorAll('input, button')) input.disabled = !enabled || busy || !item.visible;
      if ($('editor-scale')) $('editor-scale').disabled = !enabled || busy || !item.visible || managed;
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
    updateHighlight(); syncGizmo();
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
      const layout = system.getLayout();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...layout, instances:layout.instances.filter(row => !managedRow(row, system.isManagedInstance)), equipmentSource:'zone-plan', savedAt: new Date().toISOString() }));
      saveState = 'saved'; saveError = null;
      $('editor-save-status').textContent = 'Сохранено в этом браузере · одинаково для 2K и 4K';
    } catch (error) {
      saveState = 'unavailable'; saveError = error.message || String(error);
      $('editor-save-status').textContent = 'Автосохранение недоступно. Скачайте JSON, чтобы сохранить изменения.';
    }
  }

  function remember(before, action) {
    lastRememberRejected = false;
    const after = system.getLayout();
    if (sameLayout(before, after)) return false;
    const changedIds = changedExhibitIds(before, after), validation = validateChanges(before, after);
    if (!validation.ok) {
      const restored = system.applyLayout(rebaseExhibitHistory(before, after, changedIds), {notify:false});
      lastRememberRejected = true;
      setMessage(validation.error + (restored.ok ? ' Положение восстановлено.' : ' ' + restored.error), true);
      return false;
    }
    undo.push({before, after, changedIds});
    if (undo.length > MAX_UNDO) undo.shift();
    redo.length = 0;
    lastAction = action; lastError = null;
    persist();
    publishChanges(before, after);
    return true;
  }

  function transact(action, operation) {
    if (!enabled || busy || drag || gizmoDrag || wheelEdit) return false;
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
    if (gizmoDrag) finishGizmo(false);
    finishWheel();
    selectedId = id;
    setOpen(true);
    panel.scrollTop = 0;
    renderSelection();
    setMessage('Изменения сохраняются автоматически в этом браузере.');
    if (focus) invoke(onFocus, id);
    notify();
    return true;
  }

  function clearSelection() {
    if (drag) finishDrag(false);
    if (gizmoDrag) finishGizmo(false);
    finishWheel();
    selectedId = null;
    $('editor-instances').value = '';
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
    if (value === 'scale' && system.getInstance(selectedId)?.equipmentPlanId) return;
    if (drag) finishDrag(false);
    if (gizmoDrag) finishGizmo(false);
    finishWheel();
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


  function syncGizmo() {
    const item = selectedId && system.getInstance(selectedId);
    const active = Boolean(enabled && !busy && !panel.hidden && item?.visible && system.group.visible && mode !== 'view');
    gizmo.enabled = active; gizmoHelper.visible = active;
    if (!active) { if (!gizmoDrag) gizmo.detach(); return; }
    gizmo.setMode(modeNames[mode]); gizmo.setSpace(mode === 'rotate' ? 'world' : 'local');
    gizmo.showX = mode !== 'rotate';
    gizmo.showY = mode !== 'move' || Boolean(item.floating);
    gizmo.showZ = mode !== 'rotate';
    gizmo.setTranslationSnap(snap ? .25 : null);
    gizmo.setRotationSnap(snap ? Math.PI / 12 : null);
    gizmo.setScaleSnap(null);
    if (!gizmoDrag) {
      proxy.position.set(item.x, item.y + item.dimensions[1] * .5, item.z);
      proxy.rotation.set(0, item.rotationY, 0);
      proxy.scale.setScalar(item.scaleFactor);
      proxy.updateMatrixWorld(true);
      if (gizmo.object !== proxy) gizmo.attach(proxy);
      gizmoHelper.updateMatrixWorld(true);
    }
    $('editor-snap')?.setAttribute('aria-pressed', String(snap));
  }

  function gizmoPointer(event) {
    pointerRay(event);
    return { x: pointer.x, y: pointer.y, button: event.button ?? -1 };
  }

  function finishGizmo(commit = true) {
    if (!gizmoDrag) return;
    const current = gizmoDrag; gizmoDrag = null; gizmo.dragging = false; gizmo.axis = null;
    if (domElement.hasPointerCapture(current.pointerId)) domElement.releasePointerCapture(current.pointerId);
    controls.enabled = current.wasEnabled;
    domElement.classList.remove('editing-exhibit');
    if (commit) {
      remember(current.before, current.mode === 'scale' ? 'Размер экземпляра изменён' : current.mode === 'rotate' ? 'Экземпляр повёрнут' : 'Экземпляр перемещён');
      if (!lastRememberRejected) setMessage(current.invalid ? 'Позиция с пересечением отклонена. Сохранено последнее допустимое положение.' : 'Изменение сохранено.', current.invalid);
    } else {
      const result = system.applyLayout(rebaseExhibitHistory(current.before, system.getLayout(), [current.id]), { notify: false });
      setMessage(result.ok ? 'Изменение отменено.' : result.error, !result.ok);
    }
    $('editor-message').setAttribute('aria-live', 'polite');
    renderSelection(); invoke(onEditEnd, current.id); notify();
  }

  function applyGizmoChange() {
    if (!gizmoDrag) return;
    const current = gizmoDrag, item = system.getInstance(current.id), patch = {};
    const options = { floorMode: 'auto', notify: false };
    if (!item.floating) options.floorY = item.floorY;
    if (current.mode === 'rotate') {
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(proxy.quaternion);
      patch.rotationY = Math.atan2(forward.x, forward.z);
    }
    else if (current.mode === 'scale') {
      const axis = (gizmo.axis || 'X').replace(/[^XYZ]/g, '')[0]?.toLowerCase() || 'x';
      patch.scaleFactor = THREE.MathUtils.clamp(Math.abs(proxy.scale[axis]), .05, 30);
      proxy.scale.setScalar(patch.scaleFactor);
    } else {
      patch.x = proxy.position.x; patch.z = proxy.position.z;
      if (item.floating) patch.y = proxy.position.y - current.offsetY;
    }
    const candidate = { ...item, ...patch };
    if (patch.scaleFactor !== undefined) candidate.dimensions = item.originalDimensions.map(n => n * patch.scaleFactor);
    const result = updateEditableInstance(current.id, patch, options);
    current.invalid = !result.ok;
    renderSelection();
    if (!result.ok) { updateHighlight(candidate, true); setMessage(result.error + ' Оставлено последнее допустимое положение.', true); }
    else { lastError = null; setMessage(current.mode === 'scale' ? 'Размер: ' + dimensionLabel(result.instance.dimensions) : 'Отпустите мышь, чтобы сохранить.'); }
    notify();
  }

  function finishWheel() {
    if (wheelTimer) clearTimeout(wheelTimer); wheelTimer = 0;
    if (!wheelEdit) return;
    const current = wheelEdit; wheelEdit = null;
    remember(current.before, 'Размер экземпляра изменён');
    renderSelection(); invoke(onEditEnd, current.id); notify();
  }

  function wheelScale(event) {
    if (drag || gizmoDrag) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    const item = selectedId && system.getInstance(selectedId);
    if (!enabled || busy || panel.hidden || mode !== 'scale' || !item?.visible || item.equipmentPlanId || event.ctrlKey || event.metaKey) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!wheelEdit) { wheelEdit = { id: selectedId, before: system.getLayout() }; invoke(onEditStart, selectedId); }
    const options = { floorMode: 'auto', notify: false };
    if (!item.floating) options.floorY = item.floorY;
    const step = THREE.MathUtils.clamp(-event.deltaY * .0015, -.12, .12);
    const scaleFactor = THREE.MathUtils.clamp(item.scaleFactor * Math.exp(step), .05, 30);
    const result = updateEditableInstance(selectedId, { scaleFactor }, options);
    renderSelection();
    setMessage(result.ok ? 'Размер: ' + dimensionLabel(result.instance.dimensions) : result.error, !result.ok);
    if (wheelTimer) clearTimeout(wheelTimer);
    wheelTimer = setTimeout(finishWheel, 260); notify();
  }

  gizmo.addEventListener('objectChange', applyGizmoChange);
  gizmo.addEventListener('mouseUp', () => finishGizmo(true));

  function pickInstance(event) {
    pointerRay(event); system.group.updateWorldMatrix(true, true);
    for (const hit of raycaster.intersectObject(system.group, true)) {
      let node = hit.object, visible = true, id = null;
      while (node && node !== scene) {
        if (!node.visible || node.userData?.editorHelper) visible = false;
        if (node.userData?.instanceId) id = node.userData.instanceId;
        node = node.parent;
      }
      if (visible && id && system.getInstance(id)?.visible) return { hit, id };
    }
    return null;
  }

  function pointerDown(event) {
    // The Objects panel enables direct manipulation; regular viewing retains
    // orbit / right-button pan / wheel zoom, and touch keeps two-finger gestures.
    if (!enabled || busy || panel.hidden || mode === 'view' || event.button !== 0 || event.pointerType === 'touch' || drag || gizmoDrag) return;
    finishWheel();
    if (selectedId && gizmo.enabled) {
      const p = gizmoPointer(event);
      gizmoHelper.updateMatrixWorld(true); gizmo.pointerHover(p);
      if (gizmo.axis) {
        const item = system.getInstance(selectedId);
        gizmoDrag = { id: selectedId, pointerId: event.pointerId, mode, before: system.getLayout(), start: item,
          wasEnabled: controls.enabled, offsetY: item.dimensions[1] * .5, invalid: false };
        event.preventDefault(); event.stopImmediatePropagation();
        invoke(onEditStart, selectedId); controls.enabled = false;
        domElement.setPointerCapture(event.pointerId); domElement.classList.add('editing-exhibit');
        $('editor-message').setAttribute('aria-live', 'off'); gizmo.pointerDown(p); notify(); return;
      }
    }
    const picked = pickInstance(event);
    if (!picked) return;
    if (selectedId !== picked.id) selectInstance(picked.id, { focus: false });
    const item = system.getInstance(selectedId), root = system.getInstanceRoot(selectedId), hit = picked.hit;
    event.preventDefault(); event.stopImmediatePropagation();
    const before = system.getLayout(), wasEnabled = controls.enabled;
    invoke(onEditStart, selectedId);
    controls.enabled = false;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -hit.point.y);
    const point = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    drag = {
      id: selectedId, pointerId: event.pointerId, mode, before, start: item,
      startX: event.clientX, startY: event.clientY, wasEnabled, plane,
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
      if (snap) patch.rotationY = Math.round(patch.rotationY / (Math.PI / 12)) * (Math.PI / 12);
      options.floorMode = 'auto';
      if (!item.floating) options.floorY = item.floorY;
      candidate = { ...item, ...patch };
    } else if (drag.mode === 'scale') {
      const exponent = THREE.MathUtils.clamp(((event.clientX - drag.startX) - (event.clientY - drag.startY)) * 0.006, -5, 5);
      patch.scaleFactor = THREE.MathUtils.clamp(drag.start.scaleFactor * Math.exp(exponent), .05, 30);
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
      if (snap) { patch.x = Math.round(patch.x * 4) / 4; patch.z = Math.round(patch.z * 4) / 4; }
      candidate = { ...item, ...patch, y: item.floating ? item.y : options.floorY };
    }
    const result = updateEditableInstance(drag.id, patch, options);
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
    if (gizmoDrag && event.pointerId === gizmoDrag.pointerId) {
      event.preventDefault(); event.stopImmediatePropagation(); gizmo.pointerMove(gizmoPointer(event)); return;
    }
    if (!drag && gizmo.enabled && event.pointerType !== 'touch') {
      const axis = gizmo.axis; gizmo.pointerHover(gizmoPointer(event));
      domElement.classList.toggle('over-exhibit-handle', Boolean(gizmo.axis));
      if (axis !== gizmo.axis) notify();
    }
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
      if (!lastRememberRejected) setMessage(current.invalid ? 'Неподдерживаемая позиция отклонена. Сохранена последняя допустимая.' :
        changed ? (saveState === 'saved' ? 'Расстановка сохранена в этом браузере.' : 'Изменения применены. Для сохранения скачайте JSON.') : 'Положение не изменено.', current.invalid);
    } else {
      const result = system.applyLayout(rebaseExhibitHistory(current.before, system.getLayout(), [current.id]), { notify: false });
      if (!result.ok) remember(current.before, 'Сохранена последняя допустимая позиция');
      setMessage(result.ok ? 'Перемещение отменено.' : 'Отмена недоступна: ' + result.error + ' Сохранена текущая допустимая позиция.', !result.ok);
    }
    renderSelection();
    invoke(onEditEnd, current.id);
    notify();
  }

  function pointerUp(event) {
    if (gizmoDrag && event.pointerId === gizmoDrag.pointerId) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.type === 'pointerup') gizmo.pointerUp({ button: 0 }); else finishGizmo(false);
      return;
    }
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault(); event.stopImmediatePropagation();
    finishDrag(event.type === 'pointerup');
  }

  function travelHistory(from, to, label) {
    if (!enabled || busy || drag || gizmoDrag || wheelEdit || !from.length) return;
    const entry = from.at(-1), before = system.getLayout();
    const target = rebaseExhibitHistory(from === undo ? entry.before : entry.after, before, entry.changedIds);
    invoke(onEditStart, selectedId);
    const validation = validateChanges(before, target);
    const result = validation.ok ? system.applyLayout(target, { notify: false }) : validation;
    if (result.ok) {
      from.pop(); to.push(entry); persist(); publishChanges(before, system.getLayout()); lastAction = label; lastError = null;
      setMessage(label + (saveState === 'saved' ? '. Расстановка сохранена.' : '. Для сохранения скачайте JSON.'));
    } else setMessage(result.error, true);
    renderSelection(); invoke(onEditEnd, selectedId); notify();
  }

  syncCatalog();
  selector.addEventListener('change', () => { if (selector.value) selectInstance(selector.value); else clearSelection(); }, { signal });
  $('editor-snap')?.addEventListener('click', () => { snap = !snap; syncGizmo(); notify(); }, { signal });
  document.addEventListener('park-edit-instance', event => {
    if (event.detail?.instanceId) { if (mode === 'view') mode = 'move'; selectInstance(event.detail.instanceId, { focus: false }); }
  }, { signal });
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
    transact(item.visible ? 'Экземпляр скрыт' : 'Экземпляр показан', () => updateEditableInstance(selectedId, { visible: !item.visible }, { notify: false }));
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
    if (scaleInput && !item.equipmentPlanId) patch.scaleFactor = scaleInput.valueAsNumber;
    transact('Координаты обновлены', () => updateEditableInstance(selectedId, patch, { floorMode, notify: false }));
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
    if (!file || busy || drag || gizmoDrag || wheelEdit) return;
    if (file.size > 512 * 1024) { setMessage('Файл расстановки превышает допустимый размер.', true); return; }
    busy = true; renderSelection();
    try {
      const layout = JSON.parse(await file.text());
      if (disposed) return;
      busy = false;
      transact('Расстановка экспонатов импортирована', () => system.applyLayout(mergeSavedExhibitLayout(layout, system.getLayout(), system.isManagedInstance).layout, { notify: false }));
    } catch (error) { setMessage('Не удалось прочитать JSON: ' + error.message, true); }
    finally { busy = false; if (!disposed) { renderSelection(); notify(); } }
  }, { signal });
  domElement.addEventListener('pointerdown', pointerDown, { capture: true, signal });
  domElement.addEventListener('pointermove', pointerMove, { capture: true, signal });
  domElement.addEventListener('pointerup', pointerUp, { capture: true, signal });
  domElement.addEventListener('pointercancel', pointerUp, { capture: true, signal });
  domElement.addEventListener('lostpointercapture', () => { if (drag) finishDrag(false); if (gizmoDrag) finishGizmo(false); }, { signal });
  domElement.addEventListener('dblclick', event => {
    if (!panel.hidden && selectedId && mode !== 'view') { event.preventDefault(); event.stopImmediatePropagation(); }
  }, { capture: true, signal });
  domElement.addEventListener('wheel', wheelScale, { capture: true, passive: false, signal });
  window.addEventListener('blur', () => { if (drag) finishDrag(false); if (gizmoDrag) finishGizmo(false); }, { signal });
  document.addEventListener('keydown', event => {
    if (panel.hidden || !enabled || /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName)) return;
    if (event.key === 'Escape' && (drag || gizmoDrag)) { event.preventDefault(); event.stopImmediatePropagation(); if (drag) finishDrag(false); if (gizmoDrag) finishGizmo(false); }
    if (!event.ctrlKey && !event.metaKey && !event.altKey && !drag && !gizmoDrag) {
      const shortcut = { g: 'move', r: 'rotate', s: 'scale', v: 'view' }[event.key.toLowerCase()];
      if (shortcut) { event.preventDefault(); setMode(shortcut); }
    }
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
    if (disposed || busy || drag || gizmoDrag || wheelEdit) return { ok: false, error: 'Редактор пока не готов к восстановлению.' };
    let saved, editing = false;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        const previous=localStorage.getItem(PREVIOUS_STORAGE_KEY)||localStorage.getItem('park-exhibit-layout-v1');
        if(previous){retainRejectedSave(previous);saveState='source-zones-updated';$('editor-save-status').textContent='Показана обновлённая расстановка. Прежнюю можно скачать.';}
        return { ok: true, restored: false, previousLayoutPreserved:Boolean(previous) };
      }
      const layout = mergeSavedExhibitLayout(JSON.parse(saved), system.getLayout(), system.isManagedInstance).layout;
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
    getState, selectInstance, clearSelection, restoreSavedLayout, setMode, setOpen,
    refresh() {
      if (disposed) return;
      renderSelection({fields:!drag && !gizmoDrag && !wheelEdit}); notify();
    },
    setEnabled(value) {
      enabled = Boolean(value); toggle.disabled = !enabled;
      if (!enabled) setOpen(false);
      renderSelection(); notify();
    },
    dispose() {
      if (disposed) return;
      if (drag) finishDrag(false);
      if (gizmoDrag) finishGizmo(false);
      finishWheel();
      disposed = true; enabled = false;
      events.abort(); if (moveFrame) cancelAnimationFrame(moveFrame);
      gizmo.dispose(); gizmoHelper.removeFromParent(); proxy.removeFromParent();
      domElement.classList.remove('editing-exhibit', 'over-exhibit-handle'); domElement.style.touchAction = 'none';
      highlight.removeFromParent(); highlight.geometry.dispose(); highlight.material.dispose();
      recoveryExport?.remove();
      $('editor-instances').replaceChildren(); panel.hidden = true;
      toggle.disabled = true; toggle.setAttribute('aria-expanded', 'false');
    },
  };
}
