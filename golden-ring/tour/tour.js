import * as THREE from '../interactives/vendor/three-0.180/three.module.min.js';
import { GLTFLoader } from '../interactives/vendor/three-0.180/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/meshopt_decoder.mjs';

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

const views = {
  overview: {
    kicker: 'Общий вид',
    title: 'Павильон целиком',
    description: 'Архитектура и сценография без добавленных объектов интерактивов.',
    position: [55, 31, 43], target: [5, 0.8, 1]
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
    position: [-10, 5.2, -4], target: [-20, 1.7, -12]
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

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd8d0bf);
scene.fog = new THREE.FogExp2(0xd8d0bf, 0.0065);

const camera = new THREE.PerspectiveCamera(46, 1, 0.08, 260);
camera.position.fromArray(views.overview.position);
let target = new THREE.Vector3(...views.overview.target);
camera.lookAt(target);

scene.add(new THREE.HemisphereLight(0xfff5df, 0x52635c, 2.55));
const key = new THREE.DirectionalLight(0xffe3b6, 4.1);
key.position.set(34, 48, 28);
scene.add(key);
const fill = new THREE.DirectionalLight(0xc6e4dc, 2.15);
fill.position.set(-35, 24, -28);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffb36d, 1.4);
rim.position.set(10, 18, -46);
scene.add(rim);

let pavilion = null;
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

function resize() {
  const width = Math.max(1, stage.clientWidth);
  const height = Math.max(1, stage.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function setView(name, immediate = false) {
  const view = views[name] || views.overview;
  if (mode === 'walk') setWalk(false, false);
  viewKicker.textContent = view.kicker;
  viewTitle.textContent = view.title;
  viewDescription.textContent = view.description;
  document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('is-active', button.dataset.view === name));
  const endPosition = new THREE.Vector3(...view.position);
  const endTarget = new THREE.Vector3(...view.target);
  if (immediate || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    camera.position.copy(endPosition);
    target.copy(endTarget);
    orbitDistance = camera.position.distanceTo(target);
    camera.lookAt(target);
    cameraMotion = null;
    return;
  }
  cameraMotion = {
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
  camera.position.lerpVectors(cameraMotion.startPosition, cameraMotion.endPosition, eased);
  target.lerpVectors(cameraMotion.startTarget, cameraMotion.endTarget, eased);
  orbitDistance = camera.position.distanceTo(target);
  camera.lookAt(target);
  if (t >= 1) cameraMotion = null;
}

function orbit(dx, dy) {
  const offset = camera.position.clone().sub(target);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  spherical.theta -= dx * 0.006;
  spherical.phi = THREE.MathUtils.clamp(spherical.phi - dy * 0.006, 0.12, Math.PI * 0.485);
  spherical.radius = THREE.MathUtils.clamp(spherical.radius, 3.5, 130);
  camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(spherical));
  orbitDistance = spherical.radius;
  camera.lookAt(target);
}

function zoom(factor) {
  const offset = camera.position.clone().sub(target);
  const distance = THREE.MathUtils.clamp(offset.length() * factor, 3.5, 130);
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
  mode = enabled ? 'walk' : 'orbit';
  root.dataset.mode = mode;
  walkButton.setAttribute('aria-pressed', String(enabled));
  walkButton.textContent = enabled ? 'Выйти из прогулки' : 'Прогулка';
  walkHint.hidden = !enabled;
  activeMoves.clear();
  cameraMotion = null;
  if (enabled) {
    if (moveToStart) camera.position.set(40, 1.65, 14);
    const direction = new THREE.Vector3(32, 1.55, 8).sub(camera.position).normalize();
    yaw = Math.atan2(direction.x, -direction.z);
    pitch = Math.asin(direction.y);
    updateWalkTarget();
    viewKicker.textContent = 'Свободное перемещение';
    viewTitle.textContent = 'Прогулка по павильону';
    viewDescription.textContent = 'Осмотрите пространство с высоты глаз посетителя.';
    document.querySelectorAll('[data-view]').forEach(button => button.classList.remove('is-active'));
    canvas.focus({ preventScroll: true });
  } else {
    setView('overview');
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

function animate() {
  updateCameraMotion();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
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
      'assets/pavilion.glb?v=20261121-empty',
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
    scene.add(pavilion);
    if (renderer.compileAsync) {
      await Promise.race([
        renderer.compileAsync(scene, camera),
        new Promise(resolve => setTimeout(resolve, 7000))
      ]);
    }
    progress.style.width = '100%';
    root.dataset.state = 'ready';
    loading.setAttribute('aria-hidden', 'true');
    setView('overview', true);
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
  canvas.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  lastPointer = { x: event.clientX, y: event.clientY };
  cameraMotion = null;
  if (pointers.size === 2) {
    const points = [...pointers.values()];
    lastPinch = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }
});

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

document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
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
  showNotice('3D-контекст остановлен. Перезагрузите тур.');
});
window.addEventListener('resize', resize);
retry.addEventListener('click', () => {
  if (pavilion) scene.remove(pavilion);
  loadModel();
});

window.__GOLDEN_RING_TOUR = {
  state: () => ({ mode, ready: root.dataset.state === 'ready', view: viewTitle.textContent }),
  camera: () => ({
    position: camera.position.toArray().map(value => Number(value.toFixed(4))),
    target: target.toArray().map(value => Number(value.toFixed(4)))
  })
};

resize();
requestAnimationFrame(animate);
loadModel();
