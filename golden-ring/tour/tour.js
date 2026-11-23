import * as THREE from '../interactives/vendor/three-0.180/three.module.min.js';
import { GLTFLoader } from '../interactives/vendor/three-0.180/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/meshopt_decoder.mjs';
import { lightGallery, finishGallery, screens } from './gallery.js?v=3';
import { sourceZones } from './source-zones.js?v=3';
import { createZoneLabels } from './zone-labels.js?v=1';
import { prepareSourceGeometry } from './source-geometry.js?v=4';
import { installSourceDisplays } from './source-display-content.js?v=2';
import { createSourceInteractives } from './source-interactives.js?v=2';

const root = document.getElementById('tour');
const stage = document.getElementById('stage');
const canvas = document.getElementById('canvas');
const loading = document.getElementById('loading');
const loadingTitle = document.getElementById('loading-title');
const loadingDetail = document.getElementById('loading-detail');
const progress = document.getElementById('progress');
const retry = document.getElementById('retry');
const viewKicker = document.getElementById('view-kicker');
const viewTitle = document.getElementById('view-title');
const viewDescription = document.getElementById('view-description');
const walkButton = document.getElementById('walk');
const walkHint = document.getElementById('walk-hint');
const fullscreenButton = document.getElementById('fullscreen');
const notice = document.getElementById('notice');
const screenControls = document.getElementById('screen-controls');
const motionButton = document.getElementById('screen-motion');
const visitorMotionButton = document.getElementById('visitor-motion');
const visitorControls = document.getElementById('visitor-controls');
const nextVisitorButton = document.getElementById('next-visitor');
const zoneToggle = document.getElementById('zone-label-toggle');
const zoneDetails = document.getElementById('source-zone-details');
const zoneConcept = document.getElementById('source-zone-concept');
const zoneReference = document.getElementById('source-zone-reference');
const zoneObjects = document.getElementById('source-zone-objects');
const sourceZoneById = new Map(sourceZones.map(zone => [zone.id, zone]));
const interactiveMount = document.getElementById('source-interactive-controls');
const interactivePicker = document.getElementById('interactive-picker');
const screenPicker = document.getElementById('screen-picker');
const navigationPanel = document.querySelector('.camera-nav');
const navigationGroups = [...navigationPanel.querySelectorAll('[data-nav-group]')];
let sourceGeometry = null;
let sourceDisplays = null;
let sourceInteractives = null;
let interactiveFrameTime = 0;
let choosingSourceView = false;
let focusedCraft = 'pottery';
const mediaViews = screens.map((screen,index) => ({...screen, fov:[72,61,64,70][index],
  zoneId:index===3?'finale':'tver', id:'original-screen-'+(index+1)}));
let screenIndex = 0;
let interactiveIndex = 0;
const mediaTime = { value: 0 };
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let motionEnabled = !motionPreference.matches;
let lastFrameTime;
let visitors = null;
let visitorLoader = null;
let visitorLoadPromise = null;
let visitorStatus = 'waiting';
let visitorsEnabled = !motionPreference.matches;
let visitorFrameTime = 0;
let visitorFollow = false;
let followedVisitor = 1;

const views = {
  overview: {
    kicker: 'Общий вид',
    title: 'Павильон целиком',
    description: 'Исходная сборка заказчика. Нажмите название города, чтобы рассмотреть зал и его объекты.',
    position: [55, 31, 43], target: [5, 0.8, 1]
  },
  visitors: {
    kicker: 'Посетители павильона',
    title: 'Прогулка по павильону',
    description: 'Камера следит за посетителем. Выберите другого человека или перетащите обзор для свободного осмотра.',
    position: [9.5, 2.6, 2.6], target: [14, 1, 6]
  },
  entrance: {
    kicker: 'Точка посетителя',
    title: 'Вход в экспозицию',
    description: 'Первое считывание маршрута и последовательности залов.',
    position: [40, 1.7, 14], target: [32, 1.45, 8]
  },
  center: {
    kicker: 'Главный ориентир',
    title: 'Центральная зона',
    description: 'Круговая сценография связывает вход, региональные блоки и продолжение маршрута.',
    position: [29, 5.8, 13], target: [23, 1.7, 1]
  },
  regions: {
    kicker: 'Экспозиционный маршрут',
    title: 'Региональные залы',
    description: 'Последовательность пространств вдоль северной части павильона.',
    position: [-16.1, 2.4, -5.8], target: [-20, 1.75, -12.1]
  },
  workshops: {
    kicker: 'Рабочие зоны',
    title: 'Мастерские',
    description: 'Ячейки ремёсел и подходы посетителей в южной части экспозиции.',
    position: [23, 4.5, 17], target: [13, 1.4, 12]
  },
  plan: {
    kicker: 'Пространственная схема',
    title: 'План сверху',
    description: 'Взаимное положение залов, переходов и ключевых пространственных ориентиров.',
    position: [4, 68, 1], target: [4, 0, 0]
  }
};

for (const zone of sourceZones) {
  views['zone-' + zone.id] = {
    kicker: 'Модель заказчика · ' + (zone.region || 'зона экспозиции'),
    title: zone.title, description: zone.model,
    position: zone.camera.position, target: zone.camera.target,
    fov: zone.camera.fov || 50, bounds: zone.bounds, zoneId: zone.id
  };
  for (const object of zone.objects || []) {
    views['object-' + zone.id + '-' + object.id] = {
      kicker: zone.title + ' · объект исходной сборки',
      title: object.title, description: object.model,
      position: object.camera.position, target: object.camera.target,
      fov: object.camera.fov || 50, zoneId: zone.id, objectId: object.id,
      concept: object.concept, reference: object.reference
    };
  }
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.transmissionResolutionScale = .5;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
lightGallery(scene, renderer);

const camera = new THREE.PerspectiveCamera(46, 1, 0.08, 600);
camera.position.fromArray(views.overview.position);
let target = new THREE.Vector3(...views.overview.target);
camera.lookAt(target);


let pavilion = null;
let pavilionBounds = null;
let activeView = 'overview';
let walkReturnView = 'overview';
let cameraMotion = null;
let orbitDistance = camera.position.distanceTo(target);
let mode = 'orbit';
let yaw = 0;
let pitch = 0;
const activeMoves = new Set();
const pointers = new Map();
let lastPointer = null;
let lastPinch = 0;
let noticeTimer = 0;
const mediaMeshes = [];
const frustum = new THREE.Frustum();
const projectionView = new THREE.Matrix4();
const previousProjectionView = new THREE.Matrix4();
let refreshFrame = true;
let screenInView = false;
let webglLost = false;
let lastDraw = 0;
const zoneLabels = createZoneLabels({ stage, camera, zones: sourceZones, toggle: zoneToggle,
  selectZone: zone => {
    setView('zone-' + zone.id);
  }
});
zoneToggle.addEventListener('click', () => {
  refreshFrame = true;
  zoneLabels.update(true);
});
zoneDetails.addEventListener('toggle', () => {
  zoneLabels.invalidate();
  refreshFrame = true;
});

function fittedViewPosition(view, name, fov = view.fov || 46) {
  const position = new THREE.Vector3(...view.position);
  const center = new THREE.Vector3(...view.target);
  const bounds = view.bounds ? new THREE.Box3(
    new THREE.Vector3(...view.bounds.min), new THREE.Vector3(...view.bounds.max)
  ) : (name === 'overview' || name === 'plan') ? pavilionBounds : null;
  if (!bounds || bounds.isEmpty()) return position;
  const direction = position.clone().sub(center).normalize();
  const forward = direction.clone().negate();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  const tanV = Math.tan(THREE.MathUtils.degToRad(fov / 2)) * .90;
  const tanH = tanV * camera.aspect;
  let distance = position.distanceTo(center);
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y])
    for (const z of [bounds.min.z, bounds.max.z]) {
      const relative = new THREE.Vector3(x, y, z).sub(center);
      const depth = relative.dot(direction);
      distance = Math.max(distance, depth + Math.abs(relative.dot(right)) / tanH,
        depth + Math.abs(relative.dot(up)) / tanV);
    }
  return center.addScaledVector(direction, distance * 1.035);
}

function resize() {
  const width = Math.max(1, stage.clientWidth);
  const height = Math.max(1, stage.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  const currentView = views[activeView];
  if (pavilion && mode === 'orbit' && currentView
    && (activeView === 'overview' || activeView === 'plan' || currentView.zoneId)) {
    cameraMotion = null;
    camera.fov = currentView.fov || 46;
    camera.updateProjectionMatrix();
    camera.position.copy(fittedViewPosition(currentView, activeView));
    target.fromArray(currentView.target);
    camera.lookAt(target);
    orbitDistance = camera.position.distanceTo(target);
  }
  updateNavigationSpace();
  zoneLabels.invalidate();
  refreshFrame = true;
}

function cyclicIndex(index, count) {
  return count > 0 ? ((Math.trunc(index) % count) + count) % count : 0;
}

function currentNavigationCategory() {
  if (mode === 'walk') return null;
  if (activeView === 'visitors') return 'visitors';
  if (activeView.startsWith('screen-')) return 'media';
  return views[activeView]?.interactiveId ? 'interactives' : null;
}

function navigationSnapshot() {
  const definitions = sourceInteractives?.definitions || [];
  return {
    view: activeView, mode, active: currentNavigationCategory(),
    visitors: { index: followedVisitor, total: visitors?.count || 0 },
    media: { index: screenIndex, total: mediaViews.length, id: mediaViews[screenIndex]?.id || null },
    interactives: { index: interactiveIndex, total: definitions.length, id: definitions[interactiveIndex]?.id || null },
    motion: { screens: motionEnabled, visitors: visitorsEnabled }
  };
}

function updateNavigation() {
  const state = navigationSnapshot();
  const labels = { visitors: 'Посетители', media: 'Экраны', interactives: 'Интерактивы' };
  for (const button of navigationPanel.querySelectorAll('[data-view]')) {
    const selected = button.dataset.view === activeView || button.dataset.view === state.active;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
  for (const group of navigationGroups) {
    const category = group.dataset.navGroup, entry = state[category];
    const main = group.querySelector('[data-view]');
    const counter = group.querySelector('[data-nav-counter]');
    group.classList.toggle('is-active', state.active === category);
    counter.textContent = entry.total ? (entry.index + 1) + '/' + entry.total : '…';
    main.setAttribute('aria-label', labels[category] + (entry.total
      ? ': ' + (entry.index + 1) + ' из ' + entry.total : ': загружаются'));
    main.disabled = category === 'interactives' && !entry.total;
    for (const arrow of group.querySelectorAll('[data-nav-step]')) arrow.disabled = entry.total < 2;
  }
}

function updateNavigationSpace() {
  const bottom = parseFloat(getComputedStyle(navigationPanel).bottom) || 0;
  const space = Math.ceil(navigationPanel.getBoundingClientRect().height + bottom + 12);
  stage.style.setProperty('--nav-space', space + 'px');
  zoneLabels.invalidate();
  refreshFrame = true;
}

// All category controls use the same retained index and the same view transition.
// Navigation never starts or pauses a mechanism, screen sequence, or visitor.
function selectNavigation(category, { step = 0, index, immediate = false } = {}) {
  const entry = navigationSnapshot()[category];
  if (!entry) return;
  if (!entry.total) {
    if (category === 'visitors') setView('visitors', immediate);
    else showNotice('Подготавливаем интерактивы…');
    return;
  }
  const selected = cyclicIndex(Number.isFinite(index) ? index : entry.index + step, entry.total);
  if (category === 'visitors') {
    followedVisitor = selected;
    setView('visitors', immediate);
  } else if (category === 'media') {
    screenIndex = selected;
    setView('screen-' + mediaViews[selected].id, immediate);
  } else {
    interactiveIndex = selected;
    setView(sourceInteractives.definitions[selected].viewId, immediate);
  }
}

function setView(name, immediate = false) {
  if (name === 'interactives') {
    const definition = sourceInteractives?.definitions[interactiveIndex] || sourceInteractives?.definitions[0];
    if (!definition) return showNotice('Подготавливаем интерактивы…');
    name = definition.viewId;
  }
  if (name === 'media') name = 'screen-' + mediaViews[screenIndex].id;
  const visitorLink = /^visitor-(\d+)$/.exec(name);
  if (visitorLink) { followedVisitor = Math.max(0, Number(visitorLink[1]) - 1); name = 'visitors'; }
  if (visitors) followedVisitor = cyclicIndex(followedVisitor, visitors.count);
  const selectedScreenIndex = mediaViews.findIndex(item => 'screen-' + item.id === name);
  const isScreen = selectedScreenIndex >= 0;
  if (isScreen) screenIndex = selectedScreenIndex;
  if (mode === 'walk') setWalk(false, false);
  activeView = isScreen || views[name] ? name : 'overview';
  name = activeView;
  root.dataset.view = activeView;
  zoneLabels.setView(activeView);
  history.replaceState(null, '', '#' + (name === 'visitors' ? 'visitor-' + (followedVisitor + 1) : name));
  const selectedScreen = mediaViews[screenIndex];
  const hall = sourceZoneById.get(selectedScreen.zoneId)?.title || 'Экспозиция';
  const view = isScreen ? { ...views[name], ...selectedScreen, objectId: selectedScreen.id,
    kicker: `${hall} · Экран ${screenIndex + 1} из ${mediaViews.length}`,
    description: selectedScreen.description || '' } : views[name] || views.overview;
  if (view.interactiveId) {
    const index = sourceInteractives?.definitions.findIndex(item => item.id === view.interactiveId) ?? -1;
    if (index >= 0) interactiveIndex = index;
  }
  if (view.interactiveId) root.dataset.activeInteractive = view.interactiveId;
  else delete root.dataset.activeInteractive;
  if(view.interactiveId==='workshops'&&view.craftId&&view.craftId!==focusedCraft) {
    choosingSourceView=true;
    try { sourceInteractives?.invoke('workshops','craft',view.craftId); }
    finally { choosingSourceView=false; }
  }
  sourceInteractives?.setActive(view.interactiveId || null);
  interactiveMount.hidden = !view.interactiveId;
  interactivePicker.hidden = !view.interactiveId;
  if (view.interactiveId) interactivePicker.value = view.interactiveId;
  screenPicker.value = String(screenIndex);
  const zone = sourceZoneById.get(view.zoneId);
  if (zone) root.dataset.sourceZone = zone.id;
  else delete root.dataset.sourceZone;
  zoneDetails.hidden = !zone;
  zoneDetails.open = false;
  zoneConcept.textContent = view.concept || zone?.concept || '';
  zoneReference.textContent = view.reference || zone?.reference || '';
  zoneObjects.replaceChildren();
  const addObjectButton = (label, nextView) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.sourceView = nextView;
    button.addEventListener('click', () => {
      setView(nextView);
    });
    zoneObjects.append(button);
  };
  if (view.objectId) addObjectButton('Вернуться в зал', 'zone-' + zone.id);
  for (const object of zone?.objects || []) {
    if (object.id !== view.objectId) addObjectButton(object.button, object.viewId || 'object-' + zone.id + '-' + object.id);
  }
  zoneObjects.hidden = !zoneObjects.childElementCount;
  refreshFrame = true;
  visitorFollow = name === 'visitors';
  visitorControls.hidden = !visitorFollow;
  screenControls.hidden = !isScreen;
  viewKicker.textContent = visitorFollow && visitors
    ? `Посетитель ${followedVisitor + 1} из ${visitors.count}` : view.kicker;
  viewTitle.textContent = view.title;
  viewDescription.textContent = view.description;
  updateNavigation();
  const followView = visitorFollow && visitors ? visitors.focusView(followedVisitor) : null;
  const endFov = followView?.fov || view.fov || 46;
  const endPosition = followView?.position || fittedViewPosition(view, name, endFov);
  const endTarget = followView?.target || new THREE.Vector3(...view.target);
  if (followView) viewTitle.textContent = followView.room;
  if (immediate || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    camera.fov = endFov;
    camera.updateProjectionMatrix();
    camera.position.copy(endPosition);
    target.copy(endTarget);
    orbitDistance = camera.position.distanceTo(target);
    camera.lookAt(target);
    cameraMotion = null;
    return;
  }
  cameraMotion = {
    startFov: camera.fov, endFov,
    startPosition: camera.position.clone(),
    startTarget: target.clone(),
    endPosition,
    endTarget,
    started: performance.now(),
    duration: 950
  };
}

function updateCameraMotion() {
  if (!cameraMotion) return;
  const t = Math.min(1, (performance.now() - cameraMotion.started) / cameraMotion.duration);
  const eased = 1 - Math.pow(1 - t, 3);
  camera.fov = THREE.MathUtils.lerp(cameraMotion.startFov,cameraMotion.endFov,eased);
  camera.updateProjectionMatrix();
  camera.position.lerpVectors(cameraMotion.startPosition, cameraMotion.endPosition, eased);
  target.lerpVectors(cameraMotion.startTarget, cameraMotion.endTarget, eased);
  orbitDistance = camera.position.distanceTo(target);
  camera.lookAt(target);
  if (t >= 1) cameraMotion = null;
}

function orbit(dx, dy) {
  visitorFollow = false;
  const offset = camera.position.clone().sub(target);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  spherical.theta -= dx * 0.006;
  spherical.phi = THREE.MathUtils.clamp(spherical.phi - dy * 0.006, 0.12, Math.PI * 0.485);
  spherical.radius = THREE.MathUtils.clamp(spherical.radius, views[activeView]?.objectId ? .35 : 3.5, 420);
  camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(spherical));
  orbitDistance = spherical.radius;
  camera.lookAt(target);
}

function zoom(factor) {
  visitorFollow = false;
  const offset = camera.position.clone().sub(target);
  const distance = THREE.MathUtils.clamp(offset.length() * factor, views[activeView]?.objectId ? .35 : 3.5, 420);
  camera.position.copy(target).add(offset.setLength(distance));
  orbitDistance = distance;
  camera.lookAt(target);
}

function lookAround(dx, dy) {
  yaw -= dx * 0.0045;
  pitch = THREE.MathUtils.clamp(pitch - dy * 0.0037, -0.72, 0.58);
  updateWalkTarget();
}

function updateWalkTarget() {
  const horizontal = Math.cos(pitch);
  const direction = new THREE.Vector3(Math.sin(yaw) * horizontal, Math.sin(pitch), -Math.cos(yaw) * horizontal);
  target.copy(camera.position).add(direction);
  camera.lookAt(target);
}

function setWalk(enabled, moveToStart = true) {
  if (enabled && mode !== 'walk') walkReturnView = activeView;
  visitorFollow = false;
  visitorControls.hidden = true;
  mode = enabled ? 'walk' : 'orbit';
  root.dataset.mode = mode;
  if (enabled) {
    sourceInteractives?.setActive(null);
    interactiveMount.hidden = true;
    interactivePicker.hidden = true;
    delete root.dataset.activeInteractive;
    activeView = 'walk';
    root.dataset.view = activeView;
    zoneLabels.setView(activeView);
    zoneDetails.hidden = true;
    zoneObjects.hidden = true;
    delete root.dataset.sourceZone;
    refreshFrame = true;
  }
  walkButton.setAttribute('aria-pressed', String(enabled));
  walkButton.textContent = enabled ? 'Выйти из прогулки' : 'Прогулка';
  walkHint.hidden = !enabled;
  activeMoves.clear();
  cameraMotion = null;
  if (enabled) {
    camera.fov = 52;
    camera.updateProjectionMatrix();
    screenControls.hidden = true;
    if (moveToStart) camera.position.set(40, 1.65, 14);
    const direction = new THREE.Vector3(32, 1.55, 8).sub(camera.position).normalize();
    yaw = Math.atan2(direction.x, -direction.z);
    pitch = Math.asin(direction.y);
    updateWalkTarget();
    viewKicker.textContent = 'Свободное перемещение';
    viewTitle.textContent = 'Прогулка по павильону';
    viewDescription.textContent = 'Осмотрите пространство с высоты глаз посетителя.';
    history.replaceState(null, '', '#walk');
    updateNavigation();
    canvas.focus({ preventScroll: true });
  } else if (moveToStart) {
    setView(walkReturnView);
  }
}

function updateWalk(delta) {
  if (mode !== 'walk' || !activeMoves.size) return;
  const forward = target.clone().sub(camera.position);
  forward.y = 0;
  if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
  forward.normalize();
  const right = new THREE.Vector3(-forward.z, 0, forward.x);
  const movement = new THREE.Vector3();
  if (activeMoves.has('forward')) movement.add(forward);
  if (activeMoves.has('back')) movement.sub(forward);
  if (activeMoves.has('right')) movement.add(right);
  if (activeMoves.has('left')) movement.sub(right);
  if (!movement.lengthSq()) return;
  const speed = activeMoves.has('fast') ? 7.2 : 3.25;
  movement.normalize().multiplyScalar(speed * delta);
  const next = camera.position.clone().add(movement);
  next.x = THREE.MathUtils.clamp(next.x, -35.2, 41.8);
  next.z = THREE.MathUtils.clamp(next.z, -15.6, 16.2);
  next.y = 1.65;
  camera.position.copy(next);
  updateWalkTarget();
}

function animate(now) {
  requestAnimationFrame(animate);
  if (document.hidden) {
    lastFrameTime = undefined;
    visitorFrameTime = 0;
    interactiveFrameTime = 0;
    return;
  }
  const delta = lastFrameTime === undefined ? 0 : Math.min((now - lastFrameTime) / 1000, .25);
  lastFrameTime = now;
  if (motionEnabled) mediaTime.value += delta;
  if (visitors && visitorsEnabled) visitorFrameTime += delta;
  if (sourceInteractives?.isAnimating()) interactiveFrameTime += delta;
  updateCameraMotion();
  camera.updateMatrixWorld();
  projectionView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const cameraMoved = !projectionView.equals(previousProjectionView);
  if (refreshFrame || cameraMoved) {
    frustum.setFromProjectionMatrix(projectionView);
    screenInView = mediaMeshes.some(mesh => frustum.intersectsObject(mesh));
  } else {
    const hasAnimation = (motionEnabled && screenInView) || (visitors && visitorsEnabled) || sourceInteractives?.isAnimating();
    if (!hasAnimation || now - lastDraw < 1000 / 30) return;
  }
  if (sourceInteractives && interactiveFrameTime > 0) sourceInteractives.update(interactiveFrameTime);
  interactiveFrameTime = 0;
  if (visitors && visitorsEnabled && visitorFrameTime > 0) visitors.update(visitorFrameTime);
  visitorFrameTime = 0;
  if (visitorFollow && visitors) {
    const followView = visitors.focusView(followedVisitor);
    if (viewTitle.textContent !== followView.room) viewTitle.textContent = followView.room;
    root.dataset.visitorRoom = followView.room;
    if (cameraMotion) {
      cameraMotion.endPosition.copy(followView.position);
      cameraMotion.endTarget.copy(followView.target);
      cameraMotion.endFov = followView.fov;
    } else {
      camera.position.copy(followView.position);
      target.copy(followView.target);
      if (camera.fov !== followView.fov) {
        camera.fov = followView.fov;
        camera.updateProjectionMatrix();
      }
      orbitDistance = camera.position.distanceTo(target);
      camera.lookAt(target);
      camera.updateMatrixWorld();
      projectionView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projectionView);
      screenInView = mediaMeshes.some(mesh => frustum.intersectsObject(mesh));
    }
  }
  previousProjectionView.copy(projectionView);
  refreshFrame = false;
  lastDraw = now;
  renderer.render(scene, camera);
  zoneLabels.update();
}

let lastWalkUpdate = performance.now();
setInterval(() => {
  const now = performance.now();
  updateWalk(Math.min(0.05, (now - lastWalkUpdate) / 1000));
  lastWalkUpdate = now;
}, 16);

function showNotice(message) {
  clearTimeout(noticeTimer);
  notice.textContent = message;
  notice.classList.add('is-visible');
  noticeTimer = setTimeout(() => notice.classList.remove('is-visible'), 2800);
}

function updateVisitorButton() {
  const loadingVisitors = visitorStatus === 'waiting' || visitorStatus === 'loading';
  visitorMotionButton.disabled = loadingVisitors;
  nextVisitorButton.disabled = !visitors;
  updateNavigation();
  visitorMotionButton.setAttribute('aria-pressed', String(!visitorsEnabled));
  visitorMotionButton.textContent = loadingVisitors ? 'Загрузка посетителей…'
    : visitorStatus === 'error' ? 'Повторить загрузку посетителей'
      : visitorsEnabled ? 'Пауза посетителей' : 'Запустить посетителей';
}

function setVisitorMotion(enabled) {
  visitorsEnabled = enabled;
  visitorFrameTime = 0;
  updateVisitorButton();
  refreshFrame = true;
}

async function loadVisitors(loader) {
  if (visitors || visitorLoadPromise) return visitorLoadPromise;
  visitorLoader = loader;
  visitorStatus = 'loading';
  root.dataset.visitors = visitorStatus;
  updateVisitorButton();
  visitorLoadPromise = (async () => {
    try {
      const { createPavilionVisitors } = await import('./visitors.js?v=3');
      visitors = await createPavilionVisitors(scene, loader);
      visitorStatus = 'ready';
      root.dataset.visitorsCount = String(visitors.count);
      followedVisitor = cyclicIndex(followedVisitor, visitors.count);
      if (visitorFollow) setView('visitors', true);
      visitorFrameTime = 0;
      refreshFrame = true;
    } catch (error) {
      console.error('Pavilion visitors:', error);
      visitorStatus = 'error';
      showNotice('Посетители не загрузились. Можно повторить загрузку кнопкой внизу.');
    } finally {
      root.dataset.visitors = visitorStatus;
      visitorLoadPromise = null;
      updateVisitorButton();
    }
  })();
  return visitorLoadPromise;
}

async function loadModel() {
  root.dataset.state = 'loading';
  retry.hidden = true;
  loadingTitle.textContent = 'Загружаем павильон';
  loadingDetail.textContent = 'Подготавливаем 3D-модель…';
  progress.style.width = '4%';
  try {
    await MeshoptDecoder.ready;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await new Promise((resolve, reject) => loader.load(
      'assets/pavilion.glb?v=gallery-3',
      resolve,
      event => {
        if (!event.total) return;
        const percent = Math.max(4, Math.min(98, Math.round(event.loaded / event.total * 100)));
        progress.style.width = `${percent}%`;
        loadingDetail.textContent = `Загружено ${percent}%`;
      },
      reject
    ));
    pavilion = gltf.scene;
    pavilion.name = 'GoldenRingPavilion';
    pavilion.traverse(object => {
      if (!object.isMesh) return;
      object.frustumCulled = true;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => {
        if (material.map) material.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        if (material.normalMap) material.normalMap.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        material.needsUpdate = true;
      });
    });
    await finishGallery(pavilion, renderer, mediaTime);
    loadingDetail.textContent = 'Наполняем исходные экраны и механизмы…';
    sourceGeometry = await prepareSourceGeometry(pavilion, loader);
    const sourceSurfaces = [...sourceGeometry.surfaces];
    // The existing final panorama is an original display, already installed by
    // finishGallery. Its content is now governed by the journey controls.
    const panorama = pavilion.getObjectByName('Pavilion_panorama');
    if (panorama) {
      sourceSurfaces.push({id:'finale-panorama',mesh:panorama,zoneId:'finale',
        interactiveId:'finale',kind:'panorama',ordinal:0,
        aspect:panorama.userData.faceAspect||5.6,UVorientation:'v-down',
        camera:{position:screens[3].position,target:screens[3].target,fov:70}});
      sourceGeometry.bindings.finale ||= {id:'finale',displayOnly:true,parts:[],roles:{}};
    }
    for (const surface of sourceSurfaces) if (surface.interactiveId && !sourceGeometry.bindings[surface.interactiveId]) {
      sourceGeometry.bindings[surface.interactiveId] = {id:surface.interactiveId,displayOnly:true,parts:[],roles:{}};
    }
    sourceDisplays = await installSourceDisplays({surfaces:sourceSurfaces,renderer,clock:mediaTime});
    sourceInteractives = createSourceInteractives({
      model:pavilion,bindings:sourceGeometry.bindings,renderer,clock:mediaTime,
      mount:interactiveMount,reducedMotion:motionPreference.matches,
      setDisplayState:(id,state)=>{
        sourceDisplays.setDisplayState(id,state);
        if(id!=='workshops')return;
        if(choosingSourceView){focusedCraft=state.craft;return;}
        if(state.craft===focusedCraft||!sourceInteractives||root.dataset.activeInteractive!=='workshops')return;
        focusedCraft=state.craft;
        const selected=mediaViews.find(item=>item.craftId===state.craft);
        if(selected)setView('screen-'+selected.id);
      },
      onChange:()=>{refreshFrame=true;zoneLabels.invalidate();},
      onSelectView:name=>setView(name)
    });
    sourceInteractives.setPaused(!motionEnabled);
    registerSourceViews(sourceSurfaces);
    scene.add(pavilion);
    pavilion.updateMatrixWorld(true);
    pavilionBounds = new THREE.Box3().setFromObject(pavilion);
    mediaMeshes.length = 0;
    pavilion.traverse(mesh => { if (mesh.isMesh && /^Pavilion_(display|panorama)/.test(mesh.name)) mediaMeshes.push(mesh); });
    mediaMeshes.push(...sourceDisplays.meshes.filter(mesh=>!mediaMeshes.includes(mesh)));
    refreshFrame = true;
    if (renderer.compileAsync) {
      await Promise.race([
        renderer.compileAsync(scene, camera),
        new Promise(resolve => setTimeout(resolve, 7000))
      ]);
    }
    progress.style.width = '100%';
    root.dataset.state = 'ready';
    loading.setAttribute('aria-hidden', 'true');
    openTourLocation();
    void loadVisitors(loader);
  } catch (error) {
    console.error(error);
    root.dataset.state = 'error';
    loadingTitle.textContent = 'Не удалось загрузить 3D';
    loadingDetail.textContent = 'Проверьте соединение и повторите загрузку.';
    retry.hidden = false;
  }
}

canvas.addEventListener('pointerdown', event => {
  canvas.focus({ preventScroll: true });
  visitorFollow = false;
  canvas.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  lastPointer = { x: event.clientX, y: event.clientY };
  cameraMotion = null;
  if (pointers.size === 2) {
    const points = [...pointers.values()];
    lastPinch = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }
});
function openTourLocation() {
  if (root.dataset.state !== 'ready') return;
  const name = location.hash.slice(1);
  if (name === 'panorama') {
    const index = mediaViews.findIndex(item => item.id === 'original-screen-4');
    selectNavigation('media', { index: Math.max(0, index), immediate: true });
  } else if (name === 'screens') {
    selectNavigation('media', { index: 0, immediate: true });
  } else if (name === 'media' || name === 'interactives' || name === 'visitors') {
    selectNavigation(name, { immediate: true });
  } else if (/^visitor-\d+$/.test(name)) {
    setView(name, true);
  } else if (name === 'walk') {
    setWalk(true);
  } else if (name === 'cities') {
    setView('plan', true);
  } else {
    setView(name || 'overview', true);
  }
}
window.addEventListener('hashchange', openTourLocation);

canvas.addEventListener('pointermove', event => {
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size === 2 && mode === 'orbit') {
    const points = [...pointers.values()];
    const pinch = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    if (lastPinch > 0 && pinch > 0) zoom(lastPinch / pinch);
    lastPinch = pinch;
    return;
  }
  if (pointers.size !== 1 || !lastPointer) return;
  const dx = event.clientX - lastPointer.x;
  const dy = event.clientY - lastPointer.y;
  if (mode === 'walk') lookAround(dx, dy);
  else orbit(dx, dy);
  lastPointer = { x: event.clientX, y: event.clientY };
});

function releasePointer(event) {
  pointers.delete(event.pointerId);
  lastPointer = pointers.size === 1 ? [...pointers.values()][0] : null;
  lastPinch = 0;
}
canvas.addEventListener('pointerup', releasePointer);
canvas.addEventListener('pointercancel', releasePointer);
canvas.addEventListener('wheel', event => {
  if (mode !== 'orbit') return;
  event.preventDefault();
  cameraMotion = null;
  zoom(Math.exp(event.deltaY * 0.0011));
}, { passive: false });

navigationPanel.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
  const name = button.dataset.view;
  if (['visitors', 'media', 'interactives'].includes(name)) selectNavigation(name);
  else setView(name);
}));
navigationPanel.querySelectorAll('[data-nav-step]').forEach(button => button.addEventListener('click', () => {
  selectNavigation(button.closest('[data-nav-group]').dataset.navGroup, { step: Number(button.dataset.navStep) });
}));
document.getElementById('next-screen').addEventListener('click', () => selectNavigation('media', { step: 1 }));
function setScreenMotion(enabled) {
  motionEnabled = enabled;
  sourceInteractives?.setPaused(!enabled);
  interactiveFrameTime = 0;
  refreshFrame = true;
  motionButton.textContent = enabled ? 'Пауза' : 'Запустить';
  motionButton.setAttribute('aria-label', enabled ? 'Остановить движение на экранах' : 'Включить движение на экранах');
}
setScreenMotion(motionEnabled);
motionButton.addEventListener('click', () => setScreenMotion(!motionEnabled));
motionPreference.addEventListener('change', event => {
  setScreenMotion(!event.matches);
  setVisitorMotion(!event.matches);
});
visitorMotionButton.addEventListener('click', () => {
  if (visitorStatus === 'error' && visitorLoader) void loadVisitors(visitorLoader);
  else setVisitorMotion(!visitorsEnabled);
});
nextVisitorButton.addEventListener('click', () => selectNavigation('visitors', { step: 1 }));
document.addEventListener('visibilitychange', () => {
  lastFrameTime = undefined;
  visitorFrameTime = 0;
  interactiveFrameTime = 0;
  refreshFrame = true;
});
updateVisitorButton();
walkButton.addEventListener('click', () => setWalk(mode !== 'walk'));

const keyMap = { KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
window.addEventListener('keydown', event => {
  if (mode !== 'walk' || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return;
  if (event.key === 'Shift') activeMoves.add('fast');
  const move = keyMap[event.code];
  if (!move) return;
  activeMoves.add(move);
  event.preventDefault();
});
window.addEventListener('keyup', event => {
  if (event.key === 'Shift') activeMoves.delete('fast');
  if (keyMap[event.code]) activeMoves.delete(keyMap[event.code]);
});
window.addEventListener('blur', () => activeMoves.clear());
document.querySelectorAll('[data-move]').forEach(button => {
  const start = event => { activeMoves.add(button.dataset.move); event.preventDefault(); };
  const stop = () => activeMoves.delete(button.dataset.move);
  button.addEventListener('pointerdown', start);
  button.addEventListener('pointerup', stop);
  button.addEventListener('pointercancel', stop);
  button.addEventListener('pointerleave', stop);
});

document.getElementById('help-toggle').addEventListener('click', event => {
  const copy = document.getElementById('help-copy');
  const expanded = event.currentTarget.getAttribute('aria-expanded') === 'true';
  event.currentTarget.setAttribute('aria-expanded', String(!expanded));
  copy.hidden = expanded;
  zoneLabels.invalidate();
  refreshFrame = true;
});

async function toggleFullscreen() {
  if (document.fullscreenElement === root || root.classList.contains('is-fullscreen')) {
    if (document.fullscreenElement === root) {
      try { await document.exitFullscreen(); } catch { /* the CSS fallback still closes below */ }
    }
    root.classList.remove('is-fullscreen');
    document.documentElement.classList.remove('tour-fullscreen');
    fullscreenButton.textContent = 'На весь экран';
    resize();
    return;
  }
  root.classList.add('is-fullscreen');
  document.documentElement.classList.add('tour-fullscreen');
  fullscreenButton.textContent = 'Закрыть полный экран';
  resize();
  try {
    if (root.requestFullscreen) await root.requestFullscreen();
  } catch { /* CSS fallback is already active */ }
}
fullscreenButton.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => {
  const active = document.fullscreenElement === root;
  if (!active) {
    root.classList.remove('is-fullscreen');
    document.documentElement.classList.remove('tour-fullscreen');
  }
  fullscreenButton.textContent = active || root.classList.contains('is-fullscreen') ? 'Закрыть полный экран' : 'На весь экран';
  resize();
});
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && root.classList.contains('is-fullscreen')) toggleFullscreen();
});

canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  webglLost = true;
  showNotice('3D-контекст остановлен. Перезагрузите тур.');
});
canvas.addEventListener('webglcontextrestored', () => { webglLost = false; refreshFrame = true; });
window.addEventListener('resize', resize);
retry.addEventListener('click', () => {
  sourceInteractives?.dispose();
  sourceDisplays?.dispose();
  sourceInteractives = null;
  sourceDisplays = null;
  sourceGeometry = null;
  if (pavilion) scene.remove(pavilion);
  loadModel();
});


function registerSourceViews(surfaces) {
  const rememberedScreenId = mediaViews[screenIndex]?.id;
  mediaViews.splice(screens.length);
  interactivePicker.replaceChildren();
  screenPicker.replaceChildren();
  for (const definition of sourceInteractives.definitions) {
    const zone = sourceZoneById.get(definition.zoneId);
    const firstSurface=surfaces.find(surface=>surface.interactiveId===definition.id&&surface.camera);
    const sourceCamera=['workshops','ornament'].includes(definition.id)&&firstSurface?firstSurface.camera:definition.camera;
    views[definition.viewId] = {
      kicker:(zone?.title||'Павильон')+' · предмет исходной 3D-сборки',
      title:definition.title,description:definition.description,
      ...sourceCamera,zoneId:definition.zoneId,objectId:definition.objectId,
      ...(definition.id==='workshops'?{craftId:'pottery'}:{}),
      ...(definition.id==='bobbins'?{position:[-6.5,7.5,13],target:[-6.5,1.5,8.9],bounds:definition.bounds}:{}),
      ...(definition.id==='map'?{position:[20,16,-4],target:[20,.52,-8],bounds:definition.bounds}:{}),
      interactiveId:definition.id,concept:definition.conceptDescription||zone?.concept,reference:definition.reference
    };
    for (const zoneId of definition.zoneIds || [definition.zoneId]) {
      const owner=sourceZoneById.get(zoneId);if(!owner)continue;
      owner.objects ||= [];
      const current=owner.objects.find(item=>item.id===definition.objectId);
      const entry={id:definition.objectId,button:definition.button,viewId:definition.viewId};
      if(current)Object.assign(current,entry);else owner.objects.push(entry);
    }
    const option=document.createElement('option');
    option.value=definition.id;option.textContent=(zone?.title||'')+' · '+definition.title;
    interactivePicker.append(option);
  }
  // Every verified source surface is reachable, including those outside the
  // four media views present in the previous version.
  const contentById=new Map(sourceDisplays.snapshot().surfaces.map(item=>[item.id,item]));
  for(const surface of surfaces) {
    if(surface.id==='finale-panorama')continue;
    const zone=sourceZoneById.get(surface.zoneId);
    const content=contentById.get(surface.id);
    let shot=surface.camera;
    if(!shot) {
      surface.mesh.updateWorldMatrix(true,false);
      const box=new THREE.Box3().setFromObject(surface.mesh), center=box.getCenter(new THREE.Vector3());
      const size=box.getSize(new THREE.Vector3());
      const normal=new THREE.Vector3(...(surface.normal||[0,0,1])).normalize();
      const position=center.clone().addScaledVector(normal,Math.max(2.5,size.length()*.85));
      position.y=Math.max(position.y,center.y+.5);
      shot={position:position.toArray(),target:center.toArray(),fov:55};
    }
    if(surface.kind==='history-ribbon') {
      const point=new THREE.Vector3(...shot.target);
      const direction=new THREE.Vector3(...shot.position).sub(point).normalize();
      const close=point.clone().addScaledVector(direction,3.2);close.y+=.25;
      shot={position:close.toArray(),target:point.toArray(),fov:58};
    }
    const detailBounds=surface.kind==='history-ribbon'?{
      min:[shot.target[0]-1.6,shot.target[1]-.6,shot.target[2]-.4],
      max:[shot.target[0]+1.6,shot.target[1]+.6,shot.target[2]+.4]
    }:undefined;
    if(surface.interactiveId==='map')shot={position:[20,16,-4],target:[20,.52,-8],fov:58};
    const mediaView={...shot,id:surface.id,zoneId:surface.zoneId,craftId:content?.craftId,
      bounds:surface.interactiveId==='map'?{min:[15.5,0,-10.6],max:[31.3,1.05,-5.5]}:detailBounds,
      title:content?.title||zone?.title||'Экран',description:content?.kind==='hanging-cloth'?'Проекционное полотно «Кружево памяти».':'',
      interactiveId:surface.interactiveId||undefined};
    mediaViews.push(mediaView);
    views['screen-'+surface.id]={...mediaView,kicker:(zone?.title||'Экспозиция')+' · экран',objectId:surface.id};
  }
  mediaViews.forEach((item,index)=>{
    views['screen-'+item.id] = {...item, ...views['screen-'+item.id],
      objectId:item.id, kicker:(sourceZoneById.get(item.zoneId)?.title||'Экспозиция')+' · экран'};
    const option=document.createElement('option');option.value=String(index);
    option.textContent=(index+1)+'. '+(sourceZoneById.get(item.zoneId)?.title||'')+' · '+item.title;
    screenPicker.append(option);
  });
  const rememberedIndex = mediaViews.findIndex(item => item.id === rememberedScreenId);
  screenIndex = rememberedIndex >= 0 ? rememberedIndex : cyclicIndex(screenIndex, mediaViews.length);
  interactiveIndex = cyclicIndex(interactiveIndex, sourceInteractives.definitions.length);
  updateNavigation();
}

interactivePicker.addEventListener('change',()=>{
  const index=sourceInteractives?.definitions.findIndex(item=>item.id===interactivePicker.value) ?? -1;
  if(index>=0) selectNavigation('interactives', { index });
});
screenPicker.addEventListener('change',()=>selectNavigation('media', { index:Number(screenPicker.value) }));

const sourceRaycaster=new THREE.Raycaster(), sourcePointer=new THREE.Vector2();
let sourcePointerDown=null;
canvas.addEventListener('pointerdown',event=>{sourcePointerDown={x:event.clientX,y:event.clientY,time:performance.now()};});
canvas.addEventListener('pointerup',event=>{
  if(!sourceInteractives||!pavilion||!sourcePointerDown||mode!=='orbit')return;
  const start=sourcePointerDown;sourcePointerDown=null;
  if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>6||performance.now()-start.time>550)return;
  const rect=canvas.getBoundingClientRect();
  sourcePointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
  sourceRaycaster.setFromCamera(sourcePointer,camera);
  const hit=sourceRaycaster.intersectObject(pavilion,true)[0];
  const definition=hit&&sourceInteractives.findInteractive(hit.object);
  if(definition)setView(definition.viewId);
});

window.__GOLDEN_RING_TOUR = {
  zones: () => zoneLabels.snapshot(),
  renderer: () => ({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
    textures:renderer.info.memory.textures,geometries:renderer.info.memory.geometries,webglLost}),
  sourceGeometry: () => sourceGeometry?.report || null,
  displays: () => sourceDisplays?.snapshot() || null,
  interactives: () => sourceInteractives?.snapshot() || null,
  sourceViews: () => sourceInteractives?.definitions.map(item=>({id:item.id,viewId:item.viewId,title:item.title})) || [],
  screens: () => mediaViews.map(item=>({id:item.id,title:item.title,zoneId:item.zoneId})),
  navigation: navigationSnapshot,
  state: () => ({ release:'source-navigation-20261123-1', mode, ready: root.dataset.state === 'ready' && !webglLost, webglLost, view: viewTitle.textContent,
    visitors: visitorStatus, visitorCount: visitors?.count || 0, visitorFollow, followedVisitor }),
  visitors: () => ({ status: visitorStatus, enabled: visitorsEnabled, ...(visitors?.snapshot() || { ready: false, actors: [] }) }),
  camera: () => ({
    fov: camera.fov,
    position: camera.position.toArray().map(value => Number(value.toFixed(4))),
    target: target.toArray().map(value => Number(value.toFixed(4)))
  })
};

new ResizeObserver(updateNavigationSpace).observe(navigationPanel);
updateNavigation();
resize();
requestAnimationFrame(animate);
loadModel();
