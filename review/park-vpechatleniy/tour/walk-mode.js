import * as THREE from 'three';
import { createWalkWorld } from './walk-world.js?v=park-walk-20261125';

const EYE_HEIGHT = 1.65;
const SPEED = 1.5;
const MAX_REACH = 5;
const editable = node => Boolean(node?.closest?.('input,select,textarea,[contenteditable="true"]'));
const json = async path => {
  const response = await fetch(new URL(path, import.meta.url));
  if (!response.ok) throw new Error('Не удалось загрузить пространство для прогулки.');
  return response.json();
};
const shown = object => {
  for (let current = object; current; current = current.parent) if (!current.visible) return false;
  return true;
};
const timestamp = seconds => Number.isFinite(seconds) ? Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0') : '0:00';

/** First-person input owns the camera only while walking; the existing scene owns media. */
export async function createWalkMode({
  camera, canvas, sourceMeshes, sourceZones, getDynamicObstacles,
  getCollisionMeshes = () => [], controller, onEnter, onExit,
  openPanel, closePanels, requestRender = () => {},
  worldData: suppliedWorld, floorColors: suppliedColors,
}) {
  const [worldData, floorColors] = await Promise.all([
    suppliedWorld || json('./crowd/data/park-world.json'),
    suppliedColors || json('./assets/zones/floor-colors.json?v=park-floor-colors-20261125'),
  ]);
  const world = createWalkWorld({ worldData, sourceMeshes, getDynamicObstacles, getCollisionMeshes });
  const $ = id => document.getElementById(id);
  const ui = Object.fromEntries(['walk-toggle', 'walk-panel', 'walk-zone', 'walk-start', 'walk-stop',
    'walk-status', 'walk-hud', 'walk-zone-name', 'walk-change-zone', 'walk-exit', 'walk-crosshair',
    'walk-target', 'walk-target-name', 'walk-target-actions', 'walk-feedback', 'walk-movement',
    'walk-media-dialog', 'walk-media-title', 'walk-media-note', 'walk-media-canvas', 'walk-media-play',
    'walk-media-mute', 'walk-media-close', 'walk-media-seek', 'walk-media-time', 'walk-media-next', 'walk-media-restart', 'walk-video-file',
    'walk-video-choose', 'walk-video-status'].map(id => [id.replaceAll('-', '_'), $(id)]));
  const events = new AbortController(), signal = events.signal;
  const zones = new Map(), keys = new Set(), heldButtons = new Map(), pointers = new Map(), videoIds = new Set(), operations = new Map();
  const ray = new THREE.Raycaster(), pointer = new THREE.Vector2(), direction = new THREE.Vector3();
  const probe = new THREE.Vector3(), expanded = new THREE.Box3();
  let active = false, disposed = false, position = null, yaw = 0, pitch = 0, zoneId = '';
  let target = null, targetSignature = '', mediaId = null, mediaFocus = null, mediaDraw = 0;
  let targetTimer = 0, validationTimer = 0, lastMessage = '', totalDistance = 0, collisionCount = 0;
  let lookChanges = 0, lastInteraction = null, paused = false;

  const groups = new Map();
  function addZone(groupName, zone) {
    if (!groups.has(groupName)) {
      const group = document.createElement('optgroup'); group.label = groupName;
      groups.set(groupName, group); ui.walk_zone.append(group);
    }
    zones.set(zone.id, zone);
    const option = document.createElement('option'); option.value = zone.id; option.textContent = zone.name;
    groups.get(groupName).append(option);
  }
  ui.walk_zone.replaceChildren();
  for (const level of ['main', 'upper']) for (const zone of sourceZones.zones.filter(item => item.floorId === level)) {
    addZone(level === 'main' ? 'Основной уровень' : 'Антресоль', {
      id: zone.id, name: zone.title + (level === 'upper' ? ' · антресоль' : ''),
      level, x: zone.labelXZ[0], z: zone.labelXZ[1], polygons: zone.polygons, regionId: zone.regionId,
    });
  }
  for (const hall of floorColors.rgo.halls) addZone('РГО · залы', {
    id: 'rgo-' + hall.id, name: hall.name, level: 'main',
    x: hall.sourceLabelWorldXZ[0], z: hall.sourceLabelWorldXZ[1],
    polygons: hall.polygonsWorldXZ, regionId: 'rgo', hallId: hall.id,
  });
  ui.walk_zone.value = zones.has('rgo-00') ? 'rgo-00' : zones.keys().next().value;

  function feedback(message = '') {
    if (message !== lastMessage) { ui.walk_feedback.textContent = message; lastMessage = message; }
    ui.walk_feedback.hidden = !message;
  }
  function clearInput() {
    keys.clear(); heldButtons.clear(); pointers.clear();
    ui.walk_movement.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', 'false'));
  }
  function panelOpen() {
    return Boolean(document.querySelector('.context-panel:not([hidden]),#help:not([hidden])'));
  }
  function blockedInput() { return !active || Boolean(mediaId) || panelOpen() || document.hidden || paused; }
  function updateCamera() {
    if (!position) return;
    camera.position.set(position.x, position.y + EYE_HEIGHT, position.z);
    camera.up.set(0, 1, 0);
    direction.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    camera.lookAt(probe.copy(camera.position).add(direction));
    camera.updateMatrixWorld(); requestRender();
  }
  function setUi() {
    document.documentElement.dataset.walking = String(active);
    ui.walk_hud.hidden = ui.walk_crosshair.hidden = ui.walk_movement.hidden = !active;
    ui.walk_stop.hidden = !active; ui.walk_start.textContent = active ? 'Перейти в выбранную зону' : 'Начать прогулку';
    ui.walk_toggle.setAttribute('aria-pressed', String(active));
    ui.walk_status.textContent = active ? 'Вы идёте по парку. Выберите другую зону, чтобы перейти туда.' : 'Выберите зону и начните прогулку.';
    ui.walk_zone_name.textContent = zones.get(zoneId)?.name || '';
    canvas.classList.toggle('walking', active);
    canvas.setAttribute('aria-label', active
      ? 'Прогулка. WASD — идти, стрелки — идти и поворачивать, мышь или палец — оглядеться. E — взаимодействовать. Escape — закончить прогулку.'
      : '3D-модель. Левая кнопка — вращение, правая — сдвиг, колесо — масштаб. Двойной щелчок — приблизить выбранное место.');
  }
  function writeUrl() {
    const url = new URL(location.href);
    if (active) url.searchParams.set('walk', zoneId); else url.searchParams.delete('walk');
    history.replaceState(null, '', url);
  }
  function start(id = ui.walk_zone.value) {
    const zone = zones.get(id); if (!zone || disposed) return { ok: false, reason: 'unknown-zone' };
    clearInput();
    const spawn = world.spawnNear({ x: zone.x, z: zone.z, level: zone.level, polygons: zone.polygons, maxDistance: 24 });
    if (!spawn) {
      ui.walk_status.textContent = 'В этой зоне сейчас нет свободного места для начала прогулки. Выберите другую зону или измените расстановку.';
      return { ok: false, reason: 'blocked-zone' };
    }
    if (!active) {
      const entered = onEnter?.();
      if (entered?.ok === false) { ui.walk_status.textContent = entered.message || 'Не удалось начать прогулку.'; return entered; }
      active = true; controller.setWalkMode(true);
      camera.fov = 68; camera.near = .04; camera.updateProjectionMatrix();
    }
    pauseOtherVideos(); closeMedia(false); position = { ...spawn }; zoneId = id; ui.walk_zone.value = id;
    yaw = Math.atan2(zone.x - spawn.x, -(zone.z - spawn.z));
    if (Math.hypot(zone.x - spawn.x, zone.z - spawn.z) < .5) yaw = 0;
    pitch = -.04; paused = false; target = null; targetSignature = ''; validationTimer = 0;
    setUi(); feedback(''); closePanels?.(); updateCamera(); updateTarget(); writeUrl();
    canvas.focus({ preventScroll: true });
    document.dispatchEvent(new CustomEvent('park-walk-change', { detail: { active, zoneId, level: position.level } }));
    return { ok: true, position: { ...position }, zoneId };
  }
  function stop({ restore = true, focus = true } = {}) {
    if (!active) return false;
    pauseOtherVideos();
    clearInput(); closeMedia(false); active = false; paused = false; target = null;
    controller.setWalkMode(false); setUi(); ui.walk_target.hidden = true; feedback('');
    onExit?.({ restore }); writeUrl();
    if (focus) canvas.focus({ preventScroll: true });
    document.dispatchEvent(new CustomEvent('park-walk-change', { detail: { active: false } }));
    return true;
  }

  function targetAt(x = 0, y = 0) {
    if (!active || !position) return null;
    pointer.set(x, y); ray.setFromCamera(pointer, camera); ray.far = MAX_REACH;
    const candidates = [];
    for (const item of controller.getWalkTargets()) {
      if (!item.object || !shown(item.object) || !item.bounds || item.bounds.isEmpty()) continue;
      expanded.copy(item.bounds).expandByScalar(.07);
      if (!ray.ray.intersectBox(expanded, probe) || probe.distanceTo(camera.position) > MAX_REACH) continue;
      const hit = ray.intersectObject(item.object, true).find(entry => shown(entry.object));
      if (!hit || hit.distance > MAX_REACH) continue;
      const point = hit.point.clone();
      if (!world.isLineClear(camera.position, point, { ignoreIds: [item.id, item.instanceId].filter(Boolean), ignoreObjects: [item.object] })) continue;
      candidates.push({ ...item, point, distance: hit.distance });
    }
    return candidates.sort((a, b) => a.distance - b.distance)[0] || null;
  }
  function updateTarget() {
    if (blockedInput()) { ui.walk_target.hidden = true; return; }
    target = targetAt();
    const signature = target ? JSON.stringify([target.id, target.playing, target.sourceKind, target.actions]) : '';
    ui.walk_crosshair.classList.toggle('has-target', Boolean(target));
    ui.walk_target.hidden = !target;
    if (!target || signature === targetSignature) return;
    targetSignature = signature;
    ui.walk_target_name.textContent = target.name;
    ui.walk_target_actions.replaceChildren();
    const actions = target.actions?.length ? target.actions.filter(action => ['toggle', 'view', 'activate'].includes(action.id)) : [{ id: 'toggle', label: target.actionLabel || 'Включить' }];
    for (const action of actions) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = action.label;
      button.dataset.walkAction = action.id;
      const id = target.id;
      button.addEventListener('click', () => activate(id, action.id), { signal });
      ui.walk_target_actions.append(button);
    }
  }
  function stillReachable(id) {
    const item = controller.getWalkTargets().find(row => row.id === id);
    if (!item?.object || !shown(item.object)) return null;
    const point = item.bounds.clampPoint(camera.position, new THREE.Vector3());
    if (point.distanceTo(camera.position) > MAX_REACH || !world.isLineClear(camera.position, point, {
      ignoreIds: [item.id, item.instanceId].filter(Boolean), ignoreObjects: [item.object],
    })) return null;
    return item;
  }
  async function activate(id = target?.id, action) {
    if (!active || !id || mediaId) return { ok: false };
    const item = stillReachable(id);
    if (!item) { feedback('Подойдите ближе к экрану или интерактиву.'); return { ok: false }; }
    const selectedAction = action || item.actions?.find(row => row.id === 'toggle' || row.id === 'activate')?.id || item.actions?.[0]?.id || 'toggle';
    clearInput();
    if (selectedAction === 'view') { openMedia(id); return { ok: true }; }
    try {
      if (controller.getWalkMedia(id)?.kind === 'video' && !controller.getWalkMedia(id).playing) pauseOtherVideos(id);
      const token = (operations.get(id) || 0) + 1; operations.set(id, token);
      const startingZone = zoneId;
      const result = await controller.activateWalkTarget(id, selectedAction);
      if (!active || zoneId !== startingZone || operations.get(id) !== token) return result;
      lastInteraction = { id, action: selectedAction, ok: Boolean(result?.ok) };
      feedback(result?.message || (result?.ok ? '' : 'Не удалось включить объект. Попробуйте ещё раз.'));
      targetSignature = ''; updateTarget(); requestRender(); return result;
    } catch { feedback('Не удалось включить объект. Попробуйте ещё раз.'); return { ok: false }; }
  }

  function openMedia(id) {
    const item = stillReachable(id), media = controller.getWalkMedia(id);
    if (!item || !media?.source) { feedback('На этом объекте пока нет экрана для просмотра.'); return false; }
    clearInput(); mediaFocus = document.activeElement; mediaId = id; mediaDraw = 1;
    ui.walk_media_dialog.hidden = false; ui.walk_media_title.textContent = media.title || item.name;
    ui.walk_media_note.textContent = media.kind === 'video' ? 'Ролик на выбранном экране' : 'Анимированная демонстрация на выбранном экране';
    ui.walk_video_status.textContent = '';
    ui.walk_target.hidden = true; ui.walk_crosshair.hidden = true;
    ui.walk_media_close.focus({ preventScroll: true }); renderMedia(true); return true;
  }
  function closeMedia(focus = true) {
    if (!mediaId) return;
    mediaId = null; clearInput(); ui.walk_media_dialog.hidden = true;
    ui.walk_crosshair.hidden = !active;
    if (focus) (active ? canvas : mediaFocus)?.focus?.({ preventScroll: true });
    mediaFocus = null; targetSignature = ''; requestRender();
  }
  function renderMedia(force = false) {
    if (!mediaId) return;
    const media = controller.getWalkMedia(mediaId);
    if (!media?.source) { closeMedia(); feedback('Экран убран из расстановки. Выберите другой объект.'); return; }
    const source = media.source, width = source.videoWidth || source.width || media.width || 1280;
    const height = source.videoHeight || source.height || media.height || 720;
    const output = ui.walk_media_canvas;
    if (output.width !== width || output.height !== height) { output.width = width; output.height = height; }
    if (force || mediaDraw >= 1 / 24) {
      mediaDraw = 0;
      try { output.getContext('2d').drawImage(source, 0, 0, width, height); }
      catch { /* A newly selected video may not have decoded its first frame yet. */ }
    }
    ui.walk_media_play.textContent = media.playing ? 'Пауза' : 'Воспроизвести';
    ui.walk_media_play.disabled = Boolean(media.error);
    const video = media.kind === 'video';
    ui.walk_media_next.hidden = video;
    ui.walk_media_next.textContent = /^interactive-/.test(media.sourceKind || '') ? 'Другой режим' : 'Следующая сцена';
    ui.walk_media_mute.hidden = !video; ui.walk_media_seek.hidden = !video; ui.walk_media_time.hidden = !video;
    if (video) {
      ui.walk_media_mute.textContent = source.muted ? 'Включить звук' : 'Выключить звук';
      ui.walk_media_mute.setAttribute('aria-pressed', String(!source.muted));
      ui.walk_media_seek.max = Number.isFinite(source.duration) ? String(source.duration) : '0';
      ui.walk_media_seek.disabled = !Number.isFinite(source.duration) || source.duration <= 0;
      if (document.activeElement !== ui.walk_media_seek) ui.walk_media_seek.value = String(source.currentTime || 0);
      ui.walk_media_time.textContent = timestamp(source.currentTime) + ' / ' + timestamp(source.duration);
    }
    if (media.error) ui.walk_video_status.textContent = media.error;
  }
  async function chooseVideo(file) {
    if (!file || !mediaId) return;
    if (!/^video\//.test(file.type) && !/\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name)) {
      ui.walk_video_status.textContent = 'Выберите видеофайл MP4 или WebM.'; return;
    }
    const id = mediaId, url = URL.createObjectURL(file);
    pauseOtherVideos(id);
    const result = controller.setWalkVideos([{ mediaId: id, url, title: file.name, muted: false }]);
    const row = result?.find(item => item.id === id) || result?.[0];
    if (!row?.ok) { URL.revokeObjectURL(url); ui.walk_video_status.textContent = row?.message || 'Не удалось открыть ролик.'; return; }
    videoIds.add(id);
    ui.walk_media_title.textContent = file.name; ui.walk_media_note.textContent = 'Ролик на выбранном экране';
    ui.walk_video_status.textContent = 'Видео открыто на этом экране до закрытия страницы.';
    const token = (operations.get(id) || 0) + 1; operations.set(id, token);
    const play = await controller.activateWalkTarget(id, 'play');
    if (!active || mediaId !== id || operations.get(id) !== token) return;
    if (!play?.ok && play?.message) ui.walk_video_status.textContent = play.message;
    renderMedia(true); requestRender();
  }
  function pauseOtherVideos(except = null) {
    for (const id of videoIds) if (id !== except) operations.set(id, (operations.get(id) || 0) + 1);
    if (controller.pauseWalkVideos) { controller.pauseWalkVideos(except); return; }
    for (const id of videoIds) if (id !== except) {
      const media = controller.getWalkMedia(id);
      if (media?.kind === 'video') {
        controller.activateWalkTarget(id, 'pause').catch(() => {});
      }
    }
  }

  function update(dt) {
    if (!active || disposed) return false;
    dt = Math.min(.1, Math.max(0, dt || 0));
    validationTimer += dt;
    if (validationTimer >= .2) {
      validationTimer = 0;
      const valid = world.revalidate(position, { maxDistance: 3 });
      if (!valid.position) {
        stop({ restore: true }); openPanel?.('walk-panel');
        ui.walk_status.textContent = 'Проход изменился. Выберите свободную зону, чтобы продолжить прогулку.';
        return true;
      }
      if (valid.relocated) { position = { ...valid.position }; feedback('Расстановка изменилась. Вы перемещены на ближайшее свободное место.'); updateCamera(); }
      if (mediaId && !stillReachable(mediaId)) {
        pauseOtherVideos(); closeMedia(); feedback('Экран перемещён. Подойдите к нему, чтобы продолжить просмотр.');
      }
    }
    if (mediaId) { mediaDraw += dt; renderMedia(); }
    const blocked = blockedInput();
    ui.walk_movement.hidden = blocked; ui.walk_crosshair.hidden = blocked;
    if (blocked) { clearInput(); ui.walk_target.hidden = true; return false; }
    let forward = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    let sideways = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    for (const value of heldButtons.values()) {
      if (value === 'forward') forward += 1;
      if (value === 'back') forward -= 1;
      if (value === 'left') sideways -= 1;
      if (value === 'right') sideways += 1;
    }
    let changed = false;
    const turning = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
    if (turning) { yaw += turning * dt * 1.5; changed = true; }
    const length = Math.hypot(forward, sideways);
    if (length) {
      const step = SPEED * dt / Math.max(1, length);
      const dx = (Math.sin(yaw) * forward + Math.cos(yaw) * sideways) * step;
      const dz = (-Math.cos(yaw) * forward + Math.sin(yaw) * sideways) * step;
      const result = world.move(position, dx, dz);
      if (result.position) {
        totalDistance += Math.hypot(result.position.x - position.x, result.position.z - position.z);
        position = { ...result.position }; changed ||= result.moved;
      }
      if (result.blocked) { collisionCount++; feedback('Преграда. Обойдите её сбоку.'); }
      else if (result.moved) feedback('');
    }
    if (changed) updateCamera();
    targetTimer += dt;
    if (targetTimer >= .1 || changed) { targetTimer = 0; updateTarget(); }
    return changed || Boolean(mediaId);
  }

  ui.walk_start.addEventListener('click', () => start(), { signal });
  ui.walk_stop.addEventListener('click', () => stop(), { signal });
  ui.walk_exit.addEventListener('click', () => stop(), { signal });
  ui.walk_change_zone.addEventListener('click', () => { clearInput(); openPanel?.('walk-panel'); }, { signal });
  ui.walk_toggle.addEventListener('click', clearInput, { signal });
  ui.walk_media_close.addEventListener('click', () => closeMedia(), { signal });
  ui.walk_media_play.addEventListener('click', async () => {
    clearInput(); const id = mediaId; if (!id) return;
    if (controller.getWalkMedia(id)?.kind === 'video' && !controller.getWalkMedia(id).playing) pauseOtherVideos(id);
    const token = (operations.get(id) || 0) + 1; operations.set(id, token);
    const result = await controller.activateWalkTarget(id, 'toggle');
    if (!active || mediaId !== id || operations.get(id) !== token) return;
    if (result?.message) ui.walk_video_status.textContent = result.message;
    renderMedia(true); requestRender();
  }, { signal });
  ui.walk_media_mute.addEventListener('click', () => {
    const media = controller.getWalkMedia(mediaId); if (media?.kind === 'video') media.source.muted = !media.source.muted;
    renderMedia(true);
  }, { signal });
  for (const [button, action] of [[ui.walk_media_next, 'next'], [ui.walk_media_restart, 'reset']]) button.addEventListener('click', async () => {
    const id = mediaId; if (!id) return;
    const result = await controller.activateWalkTarget(id, action);
    if (!active || mediaId !== id) return;
    if (result?.message) ui.walk_video_status.textContent = result.message;
    renderMedia(true); requestRender();
  }, { signal });
  ui.walk_media_seek.addEventListener('input', () => {
    const media = controller.getWalkMedia(mediaId);
    if (media?.kind === 'video' && Number.isFinite(media.source.duration)) media.source.currentTime = Math.max(0, Math.min(media.source.duration, Number(ui.walk_media_seek.value)));
    renderMedia(true); requestRender();
  }, { signal });
  ui.walk_video_choose.addEventListener('click', () => ui.walk_video_file.click(), { signal });
  ui.walk_video_file.addEventListener('change', async () => {
    await chooseVideo(ui.walk_video_file.files?.[0]); ui.walk_video_file.value = '';
  }, { signal });
  ui.walk_media_dialog.addEventListener('click', event => { if (event.target === ui.walk_media_dialog) closeMedia(); }, { signal });

  for (const button of ui.walk_movement.querySelectorAll('[data-walk-move]')) {
    button.addEventListener('pointerdown', event => {
      if (blockedInput()) return;
      event.preventDefault(); button.setPointerCapture?.(event.pointerId);
      heldButtons.set(event.pointerId, button.dataset.walkMove); button.setAttribute('aria-pressed', 'true');
      canvas.focus({ preventScroll: true });
    }, { signal });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(name, event => {
      heldButtons.delete(event.pointerId); button.setAttribute('aria-pressed', 'false');
    }, { signal });
  }
  canvas.addEventListener('pointerdown', event => {
    if (blockedInput() || event.pointerType === 'mouse' && ![0, 2].includes(event.button)) return;
    event.preventDefault(); canvas.focus({ preventScroll: true }); canvas.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: 0, button: event.button });
  }, { signal });
  canvas.addEventListener('pointermove', event => {
    const previous = pointers.get(event.pointerId); if (!previous || blockedInput()) return;
    const dx = event.clientX - previous.x, dy = event.clientY - previous.y;
    previous.x = event.clientX; previous.y = event.clientY; previous.moved += Math.hypot(dx, dy);
    yaw += dx * .0035; pitch = THREE.MathUtils.clamp(pitch - dy * .003, -1.2, 1.15);
    lookChanges++; updateCamera(); updateTarget(); event.preventDefault();
  }, { signal });
  canvas.addEventListener('pointerup', event => {
    const previous = pointers.get(event.pointerId); pointers.delete(event.pointerId);
    if (!previous || blockedInput() || previous.moved > 7 || previous.button === 2) return;
    const rect = canvas.getBoundingClientRect();
    const hit = targetAt((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    if (hit) { target = hit; activate(hit.id); }
  }, { signal });
  for (const name of ['pointercancel', 'lostpointercapture']) canvas.addEventListener(name, event => pointers.delete(event.pointerId), { signal });
  canvas.addEventListener('wheel', event => { if (active) event.preventDefault(); }, { passive: false, signal });
  document.addEventListener('keydown', event => {
    if (!active) return;
    if (mediaId) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); closeMedia(); }
      if (event.key === 'Tab') {
        const focusable = [...ui.walk_media_dialog.querySelectorAll('button,input')].filter(element => !element.hidden && !element.disabled && element.type !== 'file');
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
      return;
    }
    if (event.key === 'Escape') {
      if (panelOpen()) { clearInput(); return; }
      event.preventDefault(); event.stopImmediatePropagation(); stop(); return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey || editable(event.target) || panelOpen()) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault(); keys.add(event.code);
    } else if (event.code === 'KeyE' && !event.repeat) { event.preventDefault(); activate(); }
  }, { capture: true, signal });
  document.addEventListener('keyup', event => keys.delete(event.code), { signal });
  window.addEventListener('blur', clearInput, { signal });
  document.addEventListener('visibilitychange', () => { clearInput(); if (document.hidden) pauseOtherVideos(); }, { signal });
  window.addEventListener('message', event => {
    if (event.origin === location.origin && event.source === window.parent && event.data?.type === 'park-tour-visibility') {
      paused = !event.data.visible; clearInput(); if (paused) pauseOtherVideos();
    }
  }, { signal });
  document.addEventListener('focusin', event => { if (active && editable(event.target)) clearInput(); }, { signal });
  ui.walk_toggle.disabled = false; ui.walk_start.disabled = false; setUi();

  return {
    start, stop, update, activate, openMedia, closeMedia, clearInput, world,
    refreshLayout() { if (!active) return; clearInput(); world.sync(true); validationTimer = 1; update(0); targetSignature = ''; updateTarget(); },
    get active() { return active; },
    getState: () => ({ ready: true, active, zoneId, position: position ? { ...position } : null,
      eyeHeight: EYE_HEIGHT, yaw, pitch, distance: totalDistance, collisionCount, lookChanges,
      targetId: target?.id || null, mediaId, lastInteraction, zoneCount: zones.size,
      world: world.getState(), keysHeld: keys.size + heldButtons.size }),
    dispose() {
      if (disposed) return; stop({ restore: true, focus: false }); disposed = true; events.abort();
      videoIds.clear(); operations.clear(); world.dispose?.();
    },
  };
}
