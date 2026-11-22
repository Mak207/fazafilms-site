import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Diagnostic playback only. No locomotion, foot IK, automatic grounding,
// automatic scaling, root-motion extraction, or production v42 code is used.
const $ = (id) => document.getElementById(id);
const ui = Object.fromEntries([
  'viewport', 'stage-labels', 'empty-stage', 'model-selectors', 'model-cards',
  'global-clip', 'play-toggle', 'restart', 'speed', 'loop', 'phase',
  'phase-readout', 'step-back', 'step-forward', 'show-skeleton', 'show-soles',
  'show-grid', 'fit-view', 'status-dot', 'status-text', 'active-count',
  'export-snapshot', 'errors-panel', 'errors-list', 'fps', 'toast',
  'processing-badge', 'processing-note',
].map((id) => [id, $(id)]));

const CONTACT_EPSILON = 0.015;
const MAX_SOLE_VERTICES = 64;
const SOURCE_WARDROBE = new Set([
  'Outfit_original', 'Skin_original', 'Outfit_formal', 'Skin_formal',
  'Top_shirt', 'Skin_shirt', 'Top_tee', 'Skin_tee', 'Trousers', 'Shoes',
]);
const SOURCE_ORIGINAL = new Set(['Outfit_original', 'Skin_original']);
const VIEWS = {
  front: new THREE.Vector3(0, 0.08, 1),
  side: new THREE.Vector3(1, 0.08, 0),
  back: new THREE.Vector3(0, 0.08, -1),
  'three-quarter': new THREE.Vector3(1, 0.25, 1.6),
};
const BONE_ALIASES = {
  hips: ['hips', 'pelvis', 'bip01pelvis', 'bip001pelvis'],
  head: ['head', 'bip01head', 'bip001head'],
  leftThigh: ['leftupleg', 'thighl', 'leftthigh', 'bip01lthigh', 'bip001lthigh'],
  rightThigh: ['rightupleg', 'thighr', 'rightthigh', 'bip01rthigh', 'bip001rthigh'],
  leftShin: ['leftleg', 'calfl', 'leftcalf', 'bip01lcalf', 'bip001lcalf'],
  rightShin: ['rightleg', 'calfr', 'rightcalf', 'bip01rcalf', 'bip001rcalf'],
  leftFoot: ['leftfoot', 'footl', 'lfoot', 'bip01lfoot', 'bip001lfoot'],
  rightFoot: ['rightfoot', 'footr', 'rfoot', 'bip01rfoot', 'bip001rfoot'],
  leftToe: ['lefttoebase', 'lefttoe', 'balll', 'bip01ltoe0', 'bip001ltoe0'],
  rightToe: ['righttoebase', 'righttoe', 'ballr', 'bip01rtoe0', 'bip001rtoe0'],
};
const state = {
  manifest: null,
  manifestURL: new URL(new URLSearchParams(location.search).get('manifest') || './manifest.json', location.href),
  definitions: new Map(),
  cache: new Map(),
  pending: new Map(),
  activeIds: [],
  selectedIds: [],
  loading: false,
  ready: false,
  running: false,
  speed: 1,
  loop: true,
  view: 'three-quarter',
  revision: 0,
  explicitLoadRequested: false,
  errors: [],
  warnings: [],
  lastMetrics: 0,
  fpsFrames: 0,
  fpsTime: 0,
  renderCount: 0,
};
const scratch = {
  position: new THREE.Vector3(),
  quaternion: new THREE.Quaternion(),
  scale: new THREE.Vector3(),
  projected: new THREE.Vector3(),
};
let renderer;
let scene;
let camera;
let controls;
let grid;
let ground;
let lastFrame = 0;
let toastTimer;
let bootPromise;

function errorRecord(error, context = {}) {
  const record = {
    message: error?.message || String(error),
    ...context,
    timestamp: new Date().toISOString(),
  };
  state.errors.push(record);
  ui['errors-panel'].hidden = false;
  const item = document.createElement('li');
  item.textContent = `${context.modelId ? `${context.modelId}: ` : ''}${record.message}`;
  ui['errors-list'].append(item);
  console.error('[motion-lab]', record);
  return record;
}

function warning(message, modelId) {
  const record = { message, modelId: modelId || null };
  state.warnings.push(record);
  return record;
}

function status(message, kind = '') {
  ui['status-text'].textContent = message;
  ui['status-dot'].className = `status-dot ${kind}`;
}

function toast(message) {
  clearTimeout(toastTimer);
  ui.toast.textContent = message;
  ui.toast.hidden = false;
  toastTimer = setTimeout(() => { ui.toast.hidden = true; }, 4800);
}

const format = (value, digits = 3) => Number.isFinite(value)
  ? value.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
const vectorArray = (vector) => vector.toArray().map((value) => +value.toFixed(7));
const kindLabel = (kind) => kind === 'source' ? 'Исходная' : kind === 'current' ? 'Рабочая' : (kind || 'Модель');
const normalizeBoneName = (name) => name.toLowerCase().replace(/^mixamorig:?/, '').replace(/[^a-z0-9]/g, '');
const meshLabel = (object) => object.name && !/^mesh_\d|_\d+$/.test(object.name)
  ? object.name : object.parent?.name || object.name;
const activeEntries = () => state.activeIds.map((id) => state.cache.get(id)).filter(Boolean);

function initializeScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#f3f6fa');
  camera = new THREE.PerspectiveCamera(40, 1, 0.01, 300);
  camera.position.set(4.5, 2.7, 7.2);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-label', 'Сравнение трёхмерных моделей Emma и Ethan');
  renderer.domElement.setAttribute('role', 'img');
  ui.viewport.prepend(renderer.domElement);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.95, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.2;
  controls.maxDistance = 100;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.addEventListener('start', () => {
    document.querySelectorAll('[data-view]').forEach((button) => button.classList.remove('active'));
  });

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9c7d7, 2.5));
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(4, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -12;
  key.shadow.camera.right = 12;
  key.shadow.camera.top = 12;
  key.shadow.camera.bottom = -12;
  key.shadow.camera.near = 0.1;
  key.shadow.camera.far = 35;
  key.shadow.normalBias = 0.012;
  key.shadow.bias = -0.0001;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xe8f0ff, 1.4);
  fill.position.set(-5, 4, -4);
  scene.add(fill);
  ground = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({ color: 0xe9eef5, roughness: 1, metalness: 0 }),
  );
  ground.name = 'diagnostic-floor-y-zero';
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  scene.add(ground);
  grid = new THREE.GridHelper(40, 40, 0xb4c3d8, 0xd3deec);
  grid.position.y = 0.0002;
  grid.material.transparent = true;
  grid.material.opacity = 0.62;
  grid.material.depthWrite = false;
  scene.add(grid);

  const resize = () => {
    const width = ui.viewport.clientWidth;
    const height = ui.viewport.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderOnce();
  };
  new ResizeObserver(resize).observe(ui.viewport);
  resize();
}

function visibleInModel(object, root) {
  for (let current = object; current && current !== root.parent; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}

function visibleBounds(root) {
  // SkinnedMesh.updateMatrixWorld also refreshes attached bindMatrixInverse.
  // Updating only Object3D.updateWorldMatrix would skip that override.
  if (root.parent) root.parent.updateMatrixWorld(true);
  else root.updateMatrixWorld(true);
  root.traverse((object) => { if (object.isSkinnedMesh) object.skeleton.update(); });
  const result = new THREE.Box3();
  root.traverse((object) => {
    if (object.isMesh && visibleInModel(object, root)) {
      result.union(new THREE.Box3().setFromObject(object, true));
    }
  });
  return result;
}

function applyVisibility(root, definition) {
  const changed = [];
  root.traverse((object) => {
    if (!object.isMesh) return;
    const label = meshLabel(object);
    // This reproduces Avatar Studio's original outfit selection. In particular,
    // Shoes is the donor outfit's footwear; original footwear stays in Outfit_original.
    if (definition.kind === 'source' && SOURCE_WARDROBE.has(label)) {
      object.visible = SOURCE_ORIGINAL.has(label);
      changed.push({ name: object.name, label, visible: object.visible, reason: 'source-original-outfit' });
    }
  });
  const explicit = definition.visibility || {};
  const show = new Set(Array.isArray(explicit.show) ? explicit.show : []);
  const hide = new Set(Array.isArray(explicit.hide) ? explicit.hide : []);
  root.traverse((object) => {
    const label = object.isMesh ? meshLabel(object) : object.name;
    const shouldShow = show.has(object.name) || show.has(label);
    const shouldHide = hide.has(object.name) || hide.has(label);
    if (shouldShow || shouldHide) {
      object.visible = shouldHide ? false : true;
      changed.push({ name: object.name, label, visible: object.visible, reason: 'manifest-visibility' });
    }
  });
  return changed;
}

function mapBones(root) {
  const bones = [];
  root.traverse((object) => { if (object.isBone) bones.push(object); });
  const roles = {};
  for (const [role, aliases] of Object.entries(BONE_ALIASES)) {
    roles[role] = bones.find((bone) => aliases.includes(normalizeBoneName(bone.name))) || null;
  }
  return { bones, roles };
}

function vertexWorld(mesh, index, result) {
  mesh.getVertexPosition(index, result);
  return result.applyMatrix4(mesh.matrixWorld);
}

function footDescendants(foot, toe) {
  const names = new Set();
  for (const start of [foot, toe]) {
    start?.traverse((object) => { if (object.isBone) names.add(object.uuid); });
  }
  return names;
}

function prepareSoleSamples(entry, side) {
  const foot = entry.roles[`${side}Foot`];
  const toe = entry.roles[`${side}Toe`];
  const involvedBones = footDescendants(foot, toe);
  if (!involvedBones.size) return { method: 'unavailable', samples: [], reason: 'foot-bones-not-found' };
  const candidates = [];
  const point = new THREE.Vector3();
  entry.root.traverse((mesh) => {
    if (!mesh.isSkinnedMesh || !visibleInModel(mesh, entry.root)) return;
    const positions = mesh.geometry.getAttribute('position');
    const skinIndices = mesh.geometry.getAttribute('skinIndex');
    const skinWeights = mesh.geometry.getAttribute('skinWeight');
    if (!positions || !skinIndices || !skinWeights) return;
    const boneIndices = new Set(mesh.skeleton.bones.map((bone, index) => involvedBones.has(bone.uuid) ? index : -1).filter((index) => index >= 0));
    if (!boneIndices.size) return;
    mesh.skeleton.update();
    for (let index = 0; index < positions.count; index += 1) {
      let influence = 0;
      for (let component = 0; component < Math.min(skinIndices.itemSize, 4); component += 1) {
        if (boneIndices.has(skinIndices.getComponent(index, component))) influence += skinWeights.getComponent(index, component);
      }
      if (influence < 0.25) continue;
      vertexWorld(mesh, index, point);
      if (Number.isFinite(point.y)) candidates.push({ mesh, index, restY: point.y });
    }
  });
  if (!candidates.length) return { method: 'unavailable', samples: [], reason: 'no-visible-foot-weighted-vertices' };
  candidates.sort((a, b) => a.restY - b.restY);
  const minY = candidates[0].restY;
  const band = Math.max(entry.restHeight * 0.006, 0.0001);
  const bottom = candidates.filter((candidate) => candidate.restY <= minY + band);
  const samples = bottom.length <= MAX_SOLE_VERTICES ? bottom : Array.from({ length: MAX_SOLE_VERTICES }, (_, index) => bottom[Math.floor(index * (bottom.length - 1) / (MAX_SOLE_VERTICES - 1))]);
  return {
    method: 'skinned-vertex-sample', samples,
    candidateCount: candidates.length, bottomBand: band, restMinY: minY,
    caveat: 'Vertices selected near the lowest visible foot-weighted geometry in the loaded rest pose; proximity is not a stance label.',
  };
}

function createMarker(color) {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.016, 12, 8),
    new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 }),
  );
  marker.renderOrder = 10;
  marker.visible = false;
  scene.add(marker);
  return marker;
}

function capturePose(root) {
  const pose = [];
  root.traverse((object) => pose.push({
    object, position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone(),
    morphs: object.morphTargetInfluences ? [...object.morphTargetInfluences] : null,
  }));
  return pose;
}

function savePose(pose) {
  for (const saved of pose) {
    saved.position.copy(saved.object.position);
    saved.quaternion.copy(saved.object.quaternion);
    saved.scale.copy(saved.object.scale);
    if (saved.morphs && saved.object.morphTargetInfluences) {
      saved.morphs = [...saved.object.morphTargetInfluences];
    }
  }
}

function restorePose(pose) {
  for (const saved of pose) {
    saved.object.position.copy(saved.position);
    saved.object.quaternion.copy(saved.quaternion);
    saved.object.scale.copy(saved.scale);
    if (saved.morphs && saved.object.morphTargetInfluences) {
      saved.morphs.forEach((value, index) => { saved.object.morphTargetInfluences[index] = value; });
    }
  }
}

function updateActorMatrices(entry) {
  entry.holder.updateMatrixWorld(true);
  entry.root.traverse((object) => { if (object.isSkinnedMesh) object.skeleton.update(); });
}

async function loadEntry(definition) {
  if (state.cache.has(definition.id)) return state.cache.get(definition.id);
  if (state.pending.has(definition.id)) return state.pending.get(definition.id);
  const promise = (async () => {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const url = new URL(definition.url, state.manifestURL).href;
    const gltf = await loader.loadAsync(url);
    const root = gltf.scene;
    const holder = new THREE.Group();
    holder.name = `motion-lab-placement:${definition.id}`;
    holder.visible = false;
    holder.add(root);
    scene.add(holder);
    const visibilityChanges = applyVisibility(root, definition);
    const restTransforms = capturePose(root);
    root.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
        if (object.isSkinnedMesh) object.frustumCulled = false;
      }
    });
    root.updateWorldMatrix(true, true);
    const { bones, roles } = mapBones(root);
    const bounds = visibleBounds(root);
    const restSize = bounds.isEmpty() ? new THREE.Vector3() : bounds.getSize(new THREE.Vector3());
    const entry = {
      definition, url, root, holder, bones, roles, restTransforms, visibilityChanges,
      clips: gltf.animations || [], mixer: new THREE.AnimationMixer(root),
      clip: null, action: null, time: 0, sampleTime: 0, phase: 0,
      restHeight: restSize.y, restSize: vectorArray(restSize), restBounds: bounds.clone(),
      warnings: [], metrics: null, labelElement: null, cardElements: null,
      animatedPose: capturePose(root), poseHook: null, evaluationCount: 0,
    };
    if (restSize.y < 0.5 || restSize.y > 3) entry.warnings.push(warning(`Высота исходной модели ${format(restSize.y)} единицы: проверьте единицы GLB. Автоматическое масштабирование выключено.`, definition.id));
    for (const role of ['hips', 'leftThigh', 'leftShin', 'leftFoot', 'rightThigh', 'rightShin', 'rightFoot']) {
      if (!roles[role]) entry.warnings.push(warning(`Не найдена роль кости ${role}; соответствующая метрика будет пустой.`, definition.id));
    }
    entry.soles = { left: prepareSoleSamples(entry, 'left'), right: prepareSoleSamples(entry, 'right') };
    entry.skeletonHelper = new THREE.SkeletonHelper(root);
    entry.skeletonHelper.visible = false;
    entry.skeletonHelper.material.depthTest = false;
    entry.skeletonHelper.material.transparent = true;
    entry.skeletonHelper.material.opacity = 0.8;
    entry.skeletonHelper.renderOrder = 8;
    scene.add(entry.skeletonHelper);
    entry.markers = { left: createMarker(0x329a71), right: createMarker(0x329a71) };
    const label = document.createElement('div');
    label.className = `model-label ${definition.kind === 'current' ? 'current' : ''}`;
    label.textContent = `${definition.label} · ${kindLabel(definition.kind)}`;
    label.title = label.textContent;
    label.hidden = true;
    ui['stage-labels'].append(label);
    entry.labelElement = label;
    state.cache.set(definition.id, entry);
    const preferred = [definition.clip, 'Idle', 'Observe', 'Walk'].filter(Boolean);
    const first = preferred.map((name) => entry.clips.find((clip) => clip.name === name)).find(Boolean) || entry.clips[0];
    if (first) chooseClip(entry, first.name);
    return entry;
  })();
  state.pending.set(definition.id, promise);
  try {
    return await promise;
  } finally {
    state.pending.delete(definition.id);
  }
}

function restoreRest(entry) {
  entry.mixer.stopAllAction();
  restorePose(entry.restTransforms);
  savePose(entry.animatedPose);
  updateActorMatrices(entry);
}

function chooseClip(entry, clipName) {
  const clip = entry.clips.find((candidate) => candidate.name === clipName);
  if (!clip) return false;
  restoreRest(entry);
  entry.clip = clip;
  entry.time = 0;
  entry.action = entry.mixer.clipAction(clip);
  // Time is assigned explicitly, so seek is deterministic at any requested frame.
  entry.action.setLoop(THREE.LoopOnce, 1);
  entry.action.clampWhenFinished = true;
  entry.action.enabled = true;
  entry.action.setEffectiveWeight(1);
  entry.action.play();
  entry.action.paused = true;
  evaluateEntry(entry, { reason: 'clip-change', discontinuity: true });
  if (entry.cardElements) entry.cardElements.select.value = clip.name;
  return true;
}

function evaluateEntry(entry, options = {}) {
  const duration = entry.clip?.duration || 0;
  const previousSampleTime = entry.sampleTime;
  let sampleTime = Math.max(0, Math.min(entry.time, duration));
  if (state.loop && duration > 0 && (entry.time > duration || entry.time < 0)) sampleTime = ((entry.time % duration) + duration) % duration;
  entry.sampleTime = sampleTime;
  entry.phase = duration > 0 ? sampleTime / duration : 0;
  const wrapped = state.loop && options.reason === 'playback' && sampleTime + 1e-8 < previousSampleTime;
  const hook = entry.poseHook;
  const context = {
    ...runtimeForEntry(entry),
    delta: options.delta || 0,
    reason: wrapped ? 'loop-wrap' : options.reason || 'evaluate',
    discontinuity: Boolean(options.discontinuity || wrapped),
    time: sampleTime, timelineTime: entry.time, phase: entry.phase, duration,
    evaluation: entry.evaluationCount + 1,
  };
  try {
    if (hook && context.discontinuity) hook.onReset?.(context);
    // Let a plugin restore its previous adjustments before we restore our base.
    if (hook && !options.skipHooks) hook.beforePose?.(context);
  } catch (error) {
    errorRecord(error, { modelId: entry.definition.id, stage: 'pose-hook-before' });
    entry.poseHook = null;
  }
  // AnimationMixer caches equal bindings. Restoring the last clean animated pose
  // is essential when seeking the same frame or evaluating while paused.
  restorePose(entry.animatedPose);
  if (entry.action && entry.clip) {
    entry.action.enabled = true;
    entry.action.paused = true;
    entry.action.time = sampleTime;
    entry.mixer.update(0);
  }
  savePose(entry.animatedPose);
  updateActorMatrices(entry);
  try {
    if (entry.poseHook && !options.skipHooks) entry.poseHook.afterPose?.(context);
  } catch (error) {
    errorRecord(error, { modelId: entry.definition.id, stage: 'pose-hook-after' });
    entry.poseHook = null;
    restorePose(entry.animatedPose);
  }
  updateActorMatrices(entry);
  entry.evaluationCount += 1;
}

function setEntriesVisible() {
  const active = new Set(state.activeIds);
  for (const [id, entry] of state.cache) {
    const visible = active.has(id);
    entry.holder.visible = visible;
    entry.skeletonHelper.visible = visible && ui['show-skeleton'].checked;
    entry.labelElement.hidden = !visible;
    if (!visible) Object.values(entry.markers).forEach((marker) => { marker.visible = false; });
  }
}

function placeEntries() {
  const entries = activeEntries();
  // Comparison placement is a separate outer group, never baked into the asset.
  const largestWidth = Math.max(0.8, ...entries.map((entry) => entry.restSize[0]));
  const spacing = Math.max(2.15, Math.min(5, largestWidth + 0.7));
  entries.forEach((entry, index) => {
    entry.holder.position.set((index - (entries.length - 1) / 2) * spacing, 0, 0);
    evaluateEntry(entry, { reason: 'placement', discontinuity: true });
  });
}

function fitView(view = state.view) {
  if (view in VIEWS) state.view = view;
  const bounds = new THREE.Box3();
  for (const entry of activeEntries()) bounds.union(visibleBounds(entry.root));
  if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-1.1, 0, -0.6), new THREE.Vector3(1.1, 2, 0.6));
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(0.5, size.length() / 2);
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  const distance = radius / Math.sin(Math.min(verticalFov, horizontalFov) / 2) * 1.12;
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(VIEWS[state.view].clone().normalize(), distance);
  camera.near = Math.max(0.005, radius / 1000);
  camera.far = Math.max(200, distance * 10);
  controls.maxDistance = Math.max(100, distance * 5);
  camera.updateProjectionMatrix();
  controls.update();
  document.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === state.view));
  renderOnce();
  return { view: state.view, position: vectorArray(camera.position), target: vectorArray(controls.target) };
}

function boneMetric(bone, entry) {
  if (!bone) return null;
  bone.getWorldPosition(scratch.position);
  const world = vectorArray(scratch.position);
  const actorWorld = vectorArray(scratch.position.clone().sub(entry.holder.position));
  bone.getWorldQuaternion(scratch.quaternion);
  bone.getWorldScale(scratch.scale);
  return {
    name: bone.name, parent: bone.parent?.name || null,
    world, actorWorld, quaternionWorld: scratch.quaternion.toArray(),
    scaleWorld: vectorArray(scratch.scale), local: vectorArray(bone.position),
  };
}

function soleMetric(entry, side) {
  const definition = entry.soles[side];
  const foot = entry.roles[`${side}Foot`];
  const toe = entry.roles[`${side}Toe`];
  const footBone = boneMetric(foot, entry);
  const toeBone = boneMetric(toe, entry);
  if (!definition.samples.length) return { method: definition.method, reason: definition.reason, footBone, toeBone, lowestWorld: null, contact: null };
  const lowest = new THREE.Vector3(0, Infinity, 0);
  const centroid = new THREE.Vector3();
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  let lowestSample = null;
  for (const sample of definition.samples) {
    vertexWorld(sample.mesh, sample.index, point);
    if (point.y < lowest.y) {
      lowest.copy(point);
      lowestSample = { mesh: sample.mesh.name, vertexIndex: sample.index };
    }
    centroid.add(point);
    bounds.expandByPoint(point);
  }
  centroid.divideScalar(definition.samples.length);
  const height = lowest.y;
  const classification = height < -CONTACT_EPSILON ? 'below-floor' : Math.abs(height) <= CONTACT_EPSILON ? 'near-floor' : 'above-floor';
  return {
    method: definition.method, sampleCount: definition.samples.length,
    candidateCount: definition.candidateCount, restBottomBand: definition.bottomBand,
    footBone, toeBone, lowestWorld: vectorArray(lowest),
    lowestActorWorld: vectorArray(lowest.clone().sub(entry.holder.position)),
    centroidWorld: vectorArray(centroid), centroidActorWorld: vectorArray(centroid.clone().sub(entry.holder.position)),
    boundsWorld: { min: vectorArray(bounds.min), max: vectorArray(bounds.max) },
    lowestSample, heightAboveFloor: height, penetrationDepth: Math.max(0, -height),
    contact: { basis: 'height-only', classification, nearFloor: classification === 'near-floor', epsilon: CONTACT_EPSILON, isStanceLabel: false },
  };
}

function distanceBetween(a, b) {
  if (!a || !b) return null;
  return a.getWorldPosition(new THREE.Vector3()).distanceTo(b.getWorldPosition(new THREE.Vector3()));
}

function collectMetrics(entry, includeAllBones = false) {
  // Measurement is read-only with respect to pose hooks and their time/state.
  updateActorMatrices(entry);
  const roles = Object.fromEntries(Object.entries(entry.roles).map(([role, bone]) => [role, boneMetric(bone, entry)]));
  const metrics = {
    id: entry.definition.id, actor: entry.definition.actor, label: entry.definition.label,
    kind: entry.definition.kind, url: entry.url,
    clip: entry.clip?.name || null, duration: entry.clip?.duration || 0,
    time: entry.sampleTime, timelineTime: entry.time, phase: entry.phase,
    placement: vectorArray(entry.holder.position), boneCount: entry.bones.length,
    restHeight: entry.restHeight, restSize: entry.restSize,
    poseHook: entry.poseHook?.label || null, poseEvaluation: entry.evaluationCount,
    root: { name: entry.root.name, position: vectorArray(entry.root.position), world: vectorArray(entry.root.getWorldPosition(new THREE.Vector3())) },
    roles,
    soles: { left: soleMetric(entry, 'left'), right: soleMetric(entry, 'right') },
    segmentLengthsWorld: {
      leftThigh: distanceBetween(entry.roles.leftThigh, entry.roles.leftShin),
      leftShin: distanceBetween(entry.roles.leftShin, entry.roles.leftFoot),
      rightThigh: distanceBetween(entry.roles.rightThigh, entry.roles.rightShin),
      rightShin: distanceBetween(entry.roles.rightShin, entry.roles.rightFoot),
    },
    clips: entry.clips.map((clip) => ({ name: clip.name, duration: clip.duration, tracks: clip.tracks.length })),
    visibilityChanges: entry.visibilityChanges, warnings: entry.warnings,
  };
  if (includeAllBones) {
    metrics.bones = entry.bones.map((bone) => boneMetric(bone, entry));
    metrics.meshes = [];
    entry.root.traverse((object) => {
      if (object.isMesh) metrics.meshes.push({ name: object.name, parent: object.parent?.name || null, label: meshLabel(object), visible: visibleInModel(object, entry.root), skinned: Boolean(object.isSkinnedMesh) });
    });
    metrics.trackNames = entry.clip?.tracks.map((track) => track.name) || [];
    metrics.soleSamples = Object.fromEntries(Object.entries(entry.soles).map(([side, sole]) => [side, {
      method: sole.method, caveat: sole.caveat || sole.reason,
      vertices: sole.samples.map((sample) => ({
        mesh: sample.mesh.name, vertexIndex: sample.index, restY: sample.restY,
        world: vectorArray(vertexWorld(sample.mesh, sample.index, new THREE.Vector3())),
      })),
    }]));
  }
  entry.metrics = metrics;
  return metrics;
}

function updateMarkers(entry, metrics) {
  for (const side of ['left', 'right']) {
    const sole = metrics.soles[side];
    const marker = entry.markers[side];
    marker.visible = ui['show-soles'].checked && entry.holder.visible && Boolean(sole.lowestWorld);
    if (!sole.lowestWorld) continue;
    marker.position.fromArray(sole.lowestWorld);
    const color = sole.contact.classification === 'below-floor' ? 0xd2554b : sole.contact.classification === 'near-floor' ? 0x329a71 : 0x4e83d7;
    marker.material.color.setHex(color);
  }
}

function updateModelLabel(entry) {
  const label = entry.labelElement;
  if (!entry.holder.visible) { label.hidden = true; return; }
  const active = activeEntries();
  const canUseShortLabel = active.length > 2 && active.filter((other) =>
    other.definition.actor === entry.definition.actor && other.definition.kind === entry.definition.kind).length === 1;
  const labelText = entry.definition.shortLabel || (canUseShortLabel
    ? `${entry.definition.actor} · ${kindLabel(entry.definition.kind)}`
    : label.title);
  if (label.textContent !== labelText) label.textContent = labelText;
  if (entry.roles.head) entry.roles.head.getWorldPosition(scratch.projected);
  else scratch.projected.copy(entry.holder.position).add(new THREE.Vector3(0, entry.restHeight, 0));
  scratch.projected.y += Math.max(0.15, entry.restHeight * 0.12);
  scratch.projected.project(camera);
  const visible = scratch.projected.z >= -1 && scratch.projected.z <= 1 && Math.abs(scratch.projected.x) < 1.1 && Math.abs(scratch.projected.y) < 1.1;
  label.hidden = !visible;
  if (visible) {
    const width = ui.viewport.clientWidth;
    const height = ui.viewport.clientHeight;
    const halfLabel = label.offsetWidth / 2;
    const x = (scratch.projected.x * 0.5 + 0.5) * width;
    const y = (-scratch.projected.y * 0.5 + 0.5) * height;
    label.style.left = `${THREE.MathUtils.clamp(x, halfLabel + 10, width - halfLabel - 10)}px`;
    label.style.top = `${THREE.MathUtils.clamp(y, label.offsetHeight + 8, height - 8)}px`;
  }
}

function makeCard(entry) {
  const card = document.createElement('article');
  card.className = 'model-card';
  const heading = document.createElement('div');
  heading.className = 'model-card-title';
  const title = document.createElement('span');
  title.textContent = entry.definition.label;
  const pill = document.createElement('span');
  pill.className = `kind-pill ${entry.definition.kind === 'current' ? 'current' : ''}`;
  pill.textContent = kindLabel(entry.definition.kind);
  heading.append(title, pill);
  const select = document.createElement('select');
  select.setAttribute('aria-label', `Клип: ${entry.definition.label}, ${kindLabel(entry.definition.kind)}`);
  select.add(new Option(entry.clips.length ? 'Исходная rest-поза' : 'В GLB нет анимаций', ''));
  for (const clip of entry.clips) select.add(new Option(`${clip.name} · ${format(clip.duration, 2)} с`, clip.name));
  select.disabled = !entry.clips.length;
  select.value = entry.clip?.name || '';
  select.addEventListener('change', () => {
    if (select.value) chooseClip(entry, select.value);
    else setRestPose([entry.definition.id]);
    updateTransport();
    updateMetrics();
    renderOnce();
  });
  const meta = document.createElement('p');
  meta.className = 'model-meta';
  const table = document.createElement('table');
  table.className = 'metrics';
  const cells = {};
  for (const [key, text] of [['phase', 'Время / фаза'], ['left', 'Левая подошва · Y'], ['right', 'Правая подошва · Y'], ['hips', 'Таз · X / Y / Z']]) {
    const row = table.insertRow();
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = text;
    const td = document.createElement('td');
    td.textContent = '—';
    row.append(th, td);
    cells[key] = td;
  }
  const note = document.createElement('p');
  note.className = 'metric-note';
  note.textContent = entry.warnings.length ? entry.warnings.map((item) => item.message).join(' ') : 'Таз: мировые координаты без смещения площадки сравнения.';
  card.append(heading, select, meta, table, note);
  entry.cardElements = { card, select, meta, cells };
  return card;
}

function rebuildCards() {
  ui['model-cards'].replaceChildren();
  const entries = activeEntries();
  for (const entry of entries) ui['model-cards'].append(makeCard(entry));
  if (!entries.length) {
    const paragraph = document.createElement('p');
    paragraph.className = 'hint';
    paragraph.textContent = 'Выберите модель над сценой.';
    ui['model-cards'].append(paragraph);
  }
  ui['active-count'].textContent = `${entries.length} ${entries.length === 1 ? 'модель' : entries.length >= 2 && entries.length <= 4 ? 'модели' : 'моделей'}`;
  const previous = ui['global-clip'].value;
  ui['global-clip'].replaceChildren(new Option('Выберите клип', ''));
  const names = [...new Set(entries.flatMap((entry) => entry.clips.map((clip) => clip.name)))].sort((a, b) => a.localeCompare(b));
  for (const name of names) {
    const count = entries.filter((entry) => entry.clips.some((clip) => clip.name === name)).length;
    ui['global-clip'].add(new Option(`${name} · ${count}/${entries.length}`, name));
  }
  if (names.includes(previous)) ui['global-clip'].value = previous;
  ui['global-clip'].disabled = !names.length;
}

function updateMetrics() {
  for (const entry of activeEntries()) {
    const metrics = collectMetrics(entry);
    updateMarkers(entry, metrics);
    const card = entry.cardElements;
    if (!card) continue;
    card.meta.textContent = `${metrics.boneCount} костей · ${metrics.clips.length} клипов · высота ${format(metrics.restHeight, 3)}`;
    card.cells.phase.textContent = `${format(metrics.time, 2)} с / ${format(metrics.phase * 100, 1)} %`;
    for (const side of ['left', 'right']) {
      const sole = metrics.soles[side];
      card.cells[side].textContent = format(sole.heightAboveFloor);
      card.cells[side].className = sole.contact?.classification === 'below-floor' ? 'bad' : sole.contact?.classification === 'near-floor' ? 'good' : '';
    }
    card.cells.hips.textContent = metrics.roles.hips ? metrics.roles.hips.actorWorld.map((value) => format(value, 2)).join(' / ') : '—';
  }
}

function updateTransport() {
  const entries = activeEntries();
  const animated = entries.some((entry) => entry.clip);
  for (const id of ['play-toggle', 'restart', 'phase', 'step-back', 'step-forward']) ui[id].disabled = !animated || state.loading;
  ui['export-snapshot'].disabled = !entries.length || state.loading;
  ui['play-toggle'].textContent = state.running ? 'Ⅱ Пауза' : '▶ Воспроизвести';
  ui['play-toggle'].setAttribute('aria-pressed', String(state.running));
  const first = entries.find((entry) => entry.clip);
  ui.phase.value = first ? String(Math.round(first.phase * 1000)) : '0';
  ui['phase-readout'].textContent = first ? `${format(first.sampleTime, 2)} / ${format(first.clip.duration, 2)} с · ${format(first.phase * 100, 0)} %` : '0,00 с · 0 %';
  ui['empty-stage'].hidden = entries.length > 0;
  const hooks = entries.filter((entry) => entry.poseHook);
  ui['processing-badge'].textContent = hooks.length ? 'Постобработка подключена' : 'Без внешнего IK';
  ui['processing-note'].textContent = hooks.length
    ? `Диагностическая постобработка: ${hooks.map((entry) => `${entry.definition.label} — ${entry.poseHook.label}`).join('; ')}. Контроллер v42 и навигация не запускаются.`
    : 'Проигрывается анимация из самого GLB. Внешний IK, навигация и контроллер v42 здесь не запускаются. Движение корня не удаляется.';
}

function renderSelectors() {
  ui['model-selectors'].replaceChildren();
  const groups = new Map();
  for (const definition of state.definitions.values()) {
    const actor = definition.actor || 'Модели';
    if (!groups.has(actor)) groups.set(actor, []);
    groups.get(actor).push(definition);
  }
  for (const [actor, definitions] of groups) {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'actor-select';
    const legend = document.createElement('legend');
    legend.textContent = actor;
    const list = document.createElement('div');
    list.className = 'choice-list';
    for (const definition of definitions) {
      const label = document.createElement('label');
      label.className = 'model-choice';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = definition.id;
      checkbox.dataset.modelId = definition.id;
      checkbox.checked = state.selectedIds.includes(definition.id);
      checkbox.addEventListener('change', () => {
        const ids = [...ui['model-selectors'].querySelectorAll('input:checked')].map((input) => input.value);
        loadModels(ids).catch((error) => errorRecord(error));
      });
      const text = document.createElement('span');
      text.textContent = kindLabel(definition.kind);
      label.title = definition.label;
      label.append(checkbox, text);
      list.append(label);
    }
    fieldset.append(legend, list);
    ui['model-selectors'].append(fieldset);
  }
}

async function readManifest() {
  const response = await fetch(state.manifestURL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`manifest.json: HTTP ${response.status}. Откройте стенд через HTTP-сервер и проверьте путь к manifest.`);
  const manifest = await response.json();
  if (!manifest || !Array.isArray(manifest.models)) throw new Error('В manifest.json нужен массив models.');
  for (const definition of manifest.models) {
    if (!definition || typeof definition.id !== 'string' || typeof definition.url !== 'string' || !definition.id || !definition.url) throw new Error('Каждая модель в manifest должна иметь непустые строковые id и url.');
    if (state.definitions.has(definition.id)) throw new Error(`Повторяющийся id модели: ${definition.id}`);
    state.definitions.set(definition.id, { ...definition, label: definition.label || definition.id, kind: definition.kind || 'model', actor: definition.actor || 'Модели' });
  }
  state.manifest = manifest;
  renderSelectors();
  return manifest;
}

let manifestPromise;
async function loadModels(ids, options = {}) {
  if (!options.initial) state.explicitLoadRequested = true;
  await manifestPromise;
  if (options.initial && state.explicitLoadRequested) return { superseded: true };
  const selected = typeof ids === 'string' ? [ids] : Array.isArray(ids) ? [...new Set(ids)] : [];
  for (const id of selected) if (!state.definitions.has(id)) throw new Error(`Нет модели ${id} в manifest.json.`);
  const revision = ++state.revision;
  state.selectedIds = selected;
  state.loading = true;
  state.ready = false;
  state.running = false;
  renderSelectors();
  updateTransport();
  status(selected.length ? `Загрузка ${selected.length} моделей…` : 'Ни одна модель не выбрана.', selected.length ? 'loading' : '');
  const results = await Promise.allSettled(selected.map((id) => loadEntry(state.definitions.get(id))));
  if (revision !== state.revision) return { superseded: true };
  const failed = [];
  state.activeIds = [];
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    if (result.status === 'fulfilled') state.activeIds.push(selected[index]);
    else {
      failed.push(selected[index]);
      errorRecord(result.reason, { modelId: selected[index], stage: 'load' });
    }
  }
  state.loading = false;
  state.ready = selected.length > 0 && failed.length === 0;
  setEntriesVisible();
  placeEntries();
  rebuildCards();
  updateMetrics();
  updateTransport();
  fitView();
  if (failed.length) status(`Загружено ${state.activeIds.length} из ${selected.length}. Проверьте ошибки загрузки.`, 'error');
  else if (!selected.length) {
    status('Выберите модели для просмотра.');
    ui['empty-stage'].textContent = 'Выберите исходные или рабочие модели над сценой.';
  } else status('Готово. Просмотр на паузе; исходный root motion сохранён.', 'ready');
  return { ready: state.ready, loaded: [...state.activeIds], failed };
}

function targetEntries(ids) {
  if (ids == null) return activeEntries();
  const requested = typeof ids === 'string' ? [ids] : ids;
  if (!Array.isArray(requested)) throw new TypeError('ids должен быть строкой или массивом id.');
  return requested.map((id) => {
    const entry = state.cache.get(id);
    if (!entry) throw new Error(`Сначала загрузите модель ${id}.`);
    return entry;
  });
}

function runtimeForEntry(entry) {
  if (!entry.restPoseData) {
    entry.restPoseData = entry.restTransforms.map((saved) => ({
      name: saved.object.name, parent: saved.object.parent?.name || null, isBone: Boolean(saved.object.isBone),
      position: vectorArray(saved.position), quaternion: saved.quaternion.toArray(), scale: vectorArray(saved.scale),
    }));
  }
  return {
    THREE, id: entry.definition.id, definition: { ...entry.definition },
    root: entry.root, rig: entry.root, holder: entry.holder,
    mixer: entry.mixer, clips: entry.clips, bones: entry.bones, roles: entry.roles,
    action: entry.action, clip: entry.clip, getAction: () => entry.action,
    restPose: entry.restPoseData, scene, camera, controls,
    ground, groundMeshes: [ground], floorMeshes: [ground],
    time: entry.sampleTime, phase: entry.phase,
  };
}

function getRuntime(id) {
  return runtimeForEntry(targetEntries([id])[0]);
}

function setRestPose(ids) {
  pause();
  for (const entry of targetEntries(ids)) {
    try {
      entry.poseHook?.onReset?.({ ...runtimeForEntry(entry), reason: 'rest-pose', discontinuity: true, delta: 0 });
    } catch (error) {
      errorRecord(error, { modelId: entry.definition.id, stage: 'pose-hook-reset' });
      entry.poseHook = null;
    }
    restoreRest(entry);
    entry.clip = null;
    entry.action = null;
    entry.time = 0;
    evaluateEntry(entry, { reason: 'rest-pose', skipHooks: true });
    if (entry.cardElements) entry.cardElements.select.value = '';
  }
  updateMetrics();
  updateTransport();
  renderOnce();
  return { ids: targetEntries(ids).map((entry) => entry.definition.id), mode: 'rest-pose', hooksApplied: false };
}

function attachPoseHook(id, hookOrCallback) {
  const entry = targetEntries([id])[0];
  if (entry.poseHook) throw new Error(`У ${id} уже есть pose-hook. Сначала вызовите detachPoseHook.`);
  const hook = typeof hookOrCallback === 'function' ? { afterPose: hookOrCallback } : hookOrCallback;
  if (!hook || (typeof hook.afterPose !== 'function' && typeof hook.beforePose !== 'function')) throw new TypeError('Pose-hook должен содержать функцию afterPose или beforePose.');
  for (const key of ['beforePose', 'afterPose', 'onReset', 'onDetach']) {
    if (hook[key] != null && typeof hook[key] !== 'function') throw new TypeError(`${key} должен быть функцией.`);
  }
  entry.poseHook = { ...hook, label: String(hook.label || 'Диагностический pose-hook') };
  evaluateEntry(entry, { reason: 'attach', discontinuity: true });
  updateMetrics();
  updateTransport();
  renderOnce();
  return { id, attached: Boolean(entry.poseHook), label: entry.poseHook?.label || null };
}

function detachPoseHook(id) {
  const entry = targetEntries([id])[0];
  const hook = entry.poseHook;
  entry.poseHook = null;
  try {
    hook?.onDetach?.({ ...runtimeForEntry(entry), reason: 'detach', discontinuity: true, delta: 0 });
  } catch (error) {
    errorRecord(error, { modelId: id, stage: 'pose-hook-detach' });
  }
  restorePose(entry.animatedPose);
  evaluateEntry(entry, { reason: 'detach' });
  updateMetrics();
  updateTransport();
  renderOnce();
  return { id, detached: Boolean(hook) };
}

function addClips(id, clips, options = {}) {
  const entry = targetEntries([id])[0];
  if (!Array.isArray(clips) || clips.some((clip) => !clip || typeof clip.clone !== 'function' || !Array.isArray(clip.tracks) || !Number.isFinite(clip.duration))) throw new TypeError('addClips ожидает массив AnimationClip.');
  const prefix = options.prefix ?? 'UPF · ';
  if (typeof prefix !== 'string' || !prefix.trim()) throw new TypeError('Для добавленных клипов нужен явный непустой prefix.');
  const usedNames = new Set(entry.clips.map((clip) => clip.name));
  const copies = clips.map((clip) => {
    const copy = clip.clone();
    copy.name = clip.name.startsWith(prefix) ? clip.name : `${prefix}${clip.name}`;
    if (usedNames.has(copy.name)) throw new Error(`Клип ${copy.name} уже существует у ${id}; исходные клипы не заменяются.`);
    usedNames.add(copy.name);
    return copy;
  });
  entry.clips.push(...copies);
  rebuildCards();
  updateMetrics();
  updateTransport();
  return { id, added: copies.map((clip) => clip.name), total: entry.clips.length };
}

function setClip(clipOrMapping, ids) {
  const changed = [];
  const missing = [];
  if (typeof clipOrMapping === 'string') {
    for (const entry of targetEntries(ids)) {
      if (chooseClip(entry, clipOrMapping)) changed.push(entry.definition.id);
      else missing.push({ id: entry.definition.id, clip: clipOrMapping });
    }
  } else if (clipOrMapping && typeof clipOrMapping === 'object' && !Array.isArray(clipOrMapping)) {
    for (const [id, clip] of Object.entries(clipOrMapping)) {
      const entry = targetEntries([id])[0];
      if (chooseClip(entry, clip)) changed.push(id);
      else missing.push({ id, clip });
    }
  } else throw new TypeError('setClip ожидает имя клипа или объект { modelId: clipName }.');
  updateMetrics();
  updateTransport();
  renderOnce();
  return { changed, missing };
}

function seek(value, options = {}) {
  if (!Number.isFinite(value)) throw new TypeError('seek ожидает конечное число.');
  for (const entry of targetEntries(options.ids)) {
    entry.time = options.normalized ? Math.max(0, Math.min(1, value)) * (entry.clip?.duration || 0) : value;
    evaluateEntry(entry, { reason: 'seek', discontinuity: true });
  }
  updateMetrics();
  updateTransport();
  renderOnce();
  return snapshot({ allBones: false });
}

function pause() {
  state.running = false;
  updateTransport();
  return false;
}

function play() {
  if (state.loading || !activeEntries().some((entry) => entry.clip)) return false;
  state.running = true;
  lastFrame = performance.now();
  updateTransport();
  return true;
}

function step(frames = 1, fps = 30) {
  if (!Number.isFinite(frames) || !(fps > 0)) throw new TypeError('step требует число кадров и положительный fps.');
  pause();
  for (const entry of activeEntries()) {
    entry.time += frames / fps;
    evaluateEntry(entry, { reason: 'step', discontinuity: true });
  }
  updateMetrics();
  updateTransport();
  renderOnce();
  return snapshot({ allBones: false });
}

function advanceFixedStep(delta, ids) {
  if (!Number.isFinite(delta) || delta <= 0 || delta > 0.1) throw new TypeError('advanceFixedStep требует 0 < delta <= 0.1 секунды.');
  for (const entry of targetEntries(ids)) {
    entry.time += delta;
    evaluateEntry(entry, { reason: 'playback', delta });
  }
  updateMetrics();
  updateTransport();
  renderOnce();
  return snapshot({ ids, allBones: false });
}

function setSpeed(speed) {
  if (!Number.isFinite(speed) || speed < 0 || speed > 8) throw new TypeError('Скорость должна быть в диапазоне 0…8.');
  state.speed = speed;
  if (![...ui.speed.options].some((option) => +option.value === speed)) ui.speed.add(new Option(`${format(speed, 2)}×`, String(speed)));
  ui.speed.value = String(speed);
  return speed;
}

function setLoop(enabled) {
  state.loop = Boolean(enabled);
  ui.loop.checked = state.loop;
  for (const entry of activeEntries()) evaluateEntry(entry, { reason: 'loop-change', discontinuity: true });
  updateMetrics();
  updateTransport();
  renderOnce();
  return state.loop;
}

function setDisplay(options = {}) {
  if ('skeleton' in options) ui['show-skeleton'].checked = Boolean(options.skeleton);
  if ('soles' in options) ui['show-soles'].checked = Boolean(options.soles);
  if ('grid' in options) ui['show-grid'].checked = Boolean(options.grid);
  grid.visible = ui['show-grid'].checked;
  setEntriesVisible();
  updateMetrics();
  renderOnce();
}

function snapshot(options = {}) {
  return {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    threeRevision: THREE.REVISION,
    ready: state.ready, loading: state.loading,
    playback: { playing: state.running, speed: state.speed, loop: state.loop },
    scope: activeEntries().some((entry) => entry.poseHook)
      ? 'GLB clip playback with explicitly attached diagnostic pose hooks; no v42 runtime'
      : 'GLB clip playback only; no external IK or v42 runtime',
    units: 'scene-units; asset scale unchanged',
    coordinateSpace: { up: 'Y', floorY: 0, worldIncludesComparisonPlacement: true, actorWorldExcludesComparisonTranslation: true },
    rootMotion: 'preserved; no automatic extraction or in-place correction',
    contactEstimate: { basis: 'height-only', epsilon: CONTACT_EPSILON, isStanceLabel: false },
    models: targetEntries(options.ids).map((entry) => collectMetrics(entry, options.allBones !== false)),
    camera: { view: state.view, position: vectorArray(camera.position), target: vectorArray(controls.target) },
    errors: state.errors.map((item) => ({ ...item })),
    warnings: state.warnings.map((item) => ({ ...item })),
    renderCount: state.renderCount,
  };
}

function exportSnapshot() {
  const blob = new Blob([JSON.stringify(snapshot(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `motion-lab-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderOnce() {
  if (!renderer || !scene || !camera) return;
  controls?.update();
  scene.updateMatrixWorld(true);
  renderer.render(scene, camera);
  state.renderCount += 1;
  activeEntries().forEach(updateModelLabel);
}

function animate(now) {
  requestAnimationFrame(animate);
  const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.1) : 0;
  lastFrame = now;
  const entries = activeEntries();
  if (state.running && !state.loading) {
    for (const entry of entries) {
      entry.time += dt * state.speed;
      evaluateEntry(entry, { reason: 'playback', delta: dt * state.speed });
    }
    if (!state.loop && entries.filter((entry) => entry.clip).every((entry) => entry.time >= entry.clip.duration)) state.running = false;
    updateTransport();
  }
  if (now - state.lastMetrics > 130) {
    state.lastMetrics = now;
    updateMetrics();
  } else if (ui['show-soles'].checked && state.running) {
    for (const entry of entries) updateMarkers(entry, { soles: { left: soleMetric(entry, 'left'), right: soleMetric(entry, 'right') } });
  }
  renderOnce();
  state.fpsFrames += 1;
  if (now - state.fpsTime >= 1000) {
    ui.fps.textContent = `${Math.round(state.fpsFrames * 1000 / Math.max(1, now - state.fpsTime))} кадр/с`;
    state.fpsFrames = 0;
    state.fpsTime = now;
  }
}

function wireControls() {
  window.addEventListener('error', (event) => {
    const message = event.error?.message || event.message;
    if (message && !state.errors.some((item) => item.message === message && item.stage === 'runtime')) errorRecord(event.error || new Error(message), { stage: 'runtime' });
  });
  window.addEventListener('unhandledrejection', (event) => {
    errorRecord(event.reason || new Error('Необработанная ошибка Promise.'), { stage: 'async-runtime' });
  });
  ui['play-toggle'].addEventListener('click', () => state.running ? pause() : play());
  ui.restart.addEventListener('click', () => seek(0));
  ui.speed.addEventListener('change', () => setSpeed(+ui.speed.value));
  ui.loop.addEventListener('change', () => setLoop(ui.loop.checked));
  ui.phase.addEventListener('input', () => {
    const phase = +ui.phase.value / 1000;
    pause();
    seek(phase, { normalized: true });
  });
  ui['step-back'].addEventListener('click', () => step(-1));
  ui['step-forward'].addEventListener('click', () => step(1));
  ui['global-clip'].addEventListener('change', () => {
    if (!ui['global-clip'].value) return;
    const result = setClip(ui['global-clip'].value);
    if (result.missing.length) toast(`Клип применён к ${result.changed.length} моделям. У ${result.missing.map((item) => state.definitions.get(item.id).label).join(', ')} такого клипа нет; их выбор сохранён.`);
  });
  document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => fitView(button.dataset.view)));
  ui['fit-view'].addEventListener('click', () => fitView());
  for (const id of ['show-skeleton', 'show-soles', 'show-grid']) ui[id].addEventListener('change', () => setDisplay());
  ui['export-snapshot'].addEventListener('click', exportSnapshot);
  for (const [id, kind] of [['select-source', 'source'], ['select-current', 'current'], ['select-all', null]]) {
    $(id).addEventListener('click', () => {
      const ids = [...state.definitions.values()].filter((definition) => !kind || definition.kind === kind).map((definition) => definition.id);
      loadModels(ids).catch((error) => errorRecord(error));
    });
  }
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(event.target.tagName)) return;
    event.preventDefault();
    state.running ? pause() : play();
  });
  document.addEventListener('visibilitychange', () => { lastFrame = performance.now(); });
}

window.motionLab = Object.freeze({
  version: '1.0.0',
  load: loadModels,
  setClip,
  seek,
  setPhase: (phase, ids) => seek(phase, { normalized: true, ids }),
  play, pause, step, advanceFixedStep, setSpeed, setLoop, setDisplay,
  setView: fitView,
  fit: () => fitView(),
  snapshot,
  getRuntime, setRestPose, attachPoseHook, detachPoseHook, addClips,
  isReady: () => state.ready && !state.loading,
  whenReady: () => bootPromise,
  get errors() { return state.errors.map((item) => ({ ...item })); },
  get warnings() { return state.warnings.map((item) => ({ ...item })); },
  get models() { return [...state.definitions.values()].map((definition) => ({ ...definition })); },
  get activeIds() { return [...state.activeIds]; },
});

try {
  initializeScene();
  wireControls();
  manifestPromise = readManifest();
  bootPromise = (async () => {
    const manifest = await manifestPromise;
    const defaults = Array.isArray(manifest.defaultIds) ? manifest.defaultIds : (() => {
      const byActor = new Map();
      for (const definition of state.definitions.values()) {
        const current = byActor.get(definition.actor);
        if (!current || definition.kind === 'source' && current.kind !== 'source') byActor.set(definition.actor, definition);
      }
      return [...byActor.values()].map((definition) => definition.id);
    })();
    return await loadModels(defaults, { initial: true });
  })().catch((error) => {
    errorRecord(error, { stage: 'initialization' });
    state.loading = false;
    state.ready = false;
    ui['empty-stage'].textContent = 'Модели пока не загружены. Проверьте manifest.json и список ошибок.';
    status(error.message, 'error');
    return { ready: false, error: error.message };
  });
  requestAnimationFrame(animate);
} catch (error) {
  errorRecord(error, { stage: 'webgl-initialization' });
  status('Не удалось создать WebGL-просмотр.', 'error');
  ui['empty-stage'].textContent = 'WebGL недоступен. Проверьте аппаратное ускорение браузера.';
  bootPromise = Promise.resolve({ ready: false, error: error.message });
}
