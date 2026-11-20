import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const root = document.querySelector(".viewer-shell");
const canvas = document.getElementById("exhibitionCanvas");

if (!root || !canvas) {
  throw new Error("Exhibition 3D root is missing");
}

const allItems = window.EXHIBITION_ITEMS || [];
const zones = ["technology", "construction", "transport"];
const zoneLabels = { technology: "Технологии", construction: "Строительство", transport: "Транспорт" };
const zoneColors = { technology: "#52d5d7", construction: "#b7df78", transport: "#89a8ff" };
const exhibitionPeriod = "2000–2025";

const content = Object.fromEntries(zones.map((zone) => [zone, allItems.filter((item) => item.zone === zone)]));
const state = {
  zone: "technology",
  indices: { technology: 0, construction: 0, transport: 0 },
  playing: false,
  walking: false,
  camera: "overview",
  reviews: loadReviews()
};

const physicalModels = {
  "technology-robot-arm": { title: "Промышленный робот", size: "0,38 × 0,42 × 0,55 м", dims: [0.38, 0.42, 0.55], placement: "левая ниша", status: "Hi3D · загрузка", zone: "technology" },
  "technology-glonass": { title: "Спутник ГЛОНАСС", size: "0,55 × 0,55 × 0,42 м", dims: [0.55, 0.55, 0.42], placement: "левая ниша", status: "Hi3D · загрузка", zone: "technology" },
  "construction-stadium": { title: "Современный стадион", size: "0,58 × 0,45 × 0,18 м", dims: [0.58, 0.45, 0.18], placement: "торцевая ниша", status: "Hi3D · загрузка", zone: "construction" },
  "construction-bridge": { title: "Арочный мост", size: "1,60 × 0,22 × 0,32 м", dims: [1.60, 0.22, 0.32], placement: "торцевая ниша", status: "Hi3D · загрузка", zone: "construction" },
  "transport-angara": { title: "Ракета-носитель «Ангара»", size: "0,12 × 0,12 × 0,58 м", dims: [0.12, 0.12, 0.58], placement: "правая ниша", status: "Hi3D · загрузка", zone: "transport" },
  "transport-icebreaker": { title: "Атомный ледокол", size: "0,85 × 0,18 × 0,28 м", dims: [0.85, 0.18, 0.28], placement: "правая ниша", status: "Hi3D · загрузка", zone: "transport" }
};

const modelSlots = {
  "technology-robot-arm": { position: [-4.58, 0.56, -3.4], rotation: [0, Math.PI / 2, 0] },
  "technology-glonass": { position: [-4.58, 0.56, 2.2], rotation: [0, Math.PI / 2, 0] },
  "construction-stadium": { position: [-2.7, 0.56, -8.08], rotation: [0, 0, 0] },
  "construction-bridge": { position: [2.4, 0.56, -8.08], rotation: [0, 0, 0] },
  "transport-angara": { position: [4.58, 0.56, -3.4], rotation: [0, -Math.PI / 2, 0] },
  "transport-icebreaker": { position: [4.58, 0.56, 2.2], rotation: [0, -Math.PI / 2, 0] }
};

const screenCanvases = {};
const screenTextures = {};
const screenMaterials = {};
const clickTargets = [];
const modelObjects = {};
let selectedModelId = "technology-robot-arm";
let autoTimer = 0;
let lastScreenDraw = 0;
let cameraMotion = null;
const activeMoves = new Set();

try {
  if (!allItems.length) throw new Error("Не загрузился список из 42 позиций");
  init();
  root.dataset.viewerState = "ready";
} catch (error) {
  root.dataset.viewerState = "error";
  document.getElementById("viewerLoading").textContent = "3D-просмотр не запустился: " + error.message;
}

function init() {
  readUrlState();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080b0a);
  scene.fog = new THREE.FogExp2(0x080b0a, 0.022);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 80);
  camera.position.set(12.8, 10.8, 20.4);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.target.set(0, 1.5, -1.5);
  controls.minDistance = 2.2;
  controls.maxDistance = 34;
  controls.maxPolarAngle = Math.PI * 0.49;

  scene.add(new THREE.HemisphereLight(0xd8fff4, 0x11130f, 1.55));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(5, 12, 10);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -14;
  key.shadow.camera.right = 14;
  key.shadow.camera.top = 18;
  key.shadow.camera.bottom = -18;
  scene.add(key);
  const cyan = new THREE.PointLight(0x52d5d7, 24, 16, 2);
  cyan.position.set(-3.8, 3.2, -5);
  scene.add(cyan);
  const orange = new THREE.PointLight(0xff8a45, 18, 14, 2);
  orange.position.set(3.5, 2.6, 3);
  scene.add(orange);

  buildPavilion(scene);
  buildPhysicalModels(scene);
  buildCentralMoscow(scene);
  buildSuspendedObjects(scene);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  canvas.addEventListener("pointerup", (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(clickTargets, true).find((entry) => findModelId(entry.object));
    if (hit) selectModel(findModelId(hit.object));
  });

  setupUi(camera, controls);
  updateZoneUi();
  selectModel(selectedModelId);
  resize();
  window.addEventListener("resize", resize);

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const delta = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.elapsedTime;
    if (!reducedMotion && elapsed - lastScreenDraw > 0.08) {
      zones.forEach((zone) => drawScreen(zone, elapsed));
      lastScreenDraw = elapsed;
    }
    if (state.playing && elapsed - autoTimer > 6) {
      stepScreen(1);
      autoTimer = elapsed;
    }
    if (cameraMotion) updateCameraMotion(camera, controls);
    if (state.walking) updateWalk(camera, controls, delta);
    controls.update();
    renderer.render(scene, camera);
  });

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  }
}

function buildPavilion(scene) {
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x151a17, roughness: 0.76, metalness: 0.08 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12.5, 20), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = 0.4;
  floor.receiveShadow = true;
  scene.add(floor);

  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x222925, roughness: 0.8, metalness: 0.12 });
  addBox(scene, [0.32, 4, 17], [-5.16, 2, 0], wallMaterial);
  addBox(scene, [0.32, 4, 17], [5.16, 2, 0], wallMaterial);
  addBox(scene, [10.0, 4, 0.32], [0, 2, -8.66], wallMaterial);

  zones.forEach((zone) => {
    const layer = document.createElement("canvas");
    layer.width = 1024;
    layer.height = 1024;
    screenCanvases[zone] = layer;
    drawScreen(zone, 0);
    const texture = new THREE.CanvasTexture(layer);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    screenTextures[zone] = texture;
    screenMaterials[zone] = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  });

  addWallLayers(scene, "technology", "left");
  addWallLayers(scene, "transport", "right");
  addWallLayers(scene, "construction", "back");

  const shelfMaterial = new THREE.MeshStandardMaterial({ color: 0x303933, roughness: 0.52, metalness: 0.34 });
  addBox(scene, [0.62, 0.08, 16.6], [-4.72, 0.54, 0], shelfMaterial);
  addBox(scene, [0.62, 0.08, 16.6], [4.72, 0.54, 0], shelfMaterial);
  addBox(scene, [9.6, 0.08, 0.62], [0, 0.54, -8.22], shelfMaterial);

  addDimension(scene, [-5.55, 0, 8.2], [-5.55, 4, 8.2], "4 м");
  addDimension(scene, [-5, 0.02, 9.1], [5, 0.02, 9.1], "10 м");
}

function addWallLayers(scene, zone, side) {
  const material = screenMaterials[zone];
  const nicheMaterial = new THREE.MeshStandardMaterial({ color: 0x070a08, roughness: 0.92, metalness: 0.06 });
  let upper, lower, niche;
  if (side === "left" || side === "right") {
    upper = new THREE.Mesh(new THREE.PlaneGeometry(17, 2.5), material);
    lower = new THREE.Mesh(new THREE.PlaneGeometry(17, 0.5), material);
    niche = new THREE.Mesh(new THREE.PlaneGeometry(17, 1), nicheMaterial);
    const x = side === "left" ? -4.985 : 4.985;
    const rotation = side === "left" ? Math.PI / 2 : -Math.PI / 2;
    [upper, lower, niche].forEach((mesh) => { mesh.rotation.y = rotation; mesh.position.x = x; scene.add(mesh); });
    upper.position.set(x, 2.75, 0);
    lower.position.set(x, 0.25, 0);
    niche.position.set(side === "left" ? -5.02 : 5.02, 1, 0);
  } else {
    upper = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), material);
    lower = new THREE.Mesh(new THREE.PlaneGeometry(10, 0.5), material);
    niche = new THREE.Mesh(new THREE.PlaneGeometry(10, 1), nicheMaterial);
    upper.position.set(0, 2.75, -8.485);
    lower.position.set(0, 0.25, -8.485);
    niche.position.set(0, 1, -8.52);
    scene.add(upper, lower, niche);
  }
}

function buildPhysicalModels(scene) {
  Object.entries(physicalModels).forEach(([id, meta]) => {
    const slot = modelSlots[id];
    const anchor = new THREE.Group();
    anchor.name = id;
    anchor.position.set(...slot.position);
    anchor.rotation.set(...slot.rotation);
    anchor.userData.modelId = id;
    const proxy = createProxy(id, meta);
    proxy.userData.modelId = id;
    anchor.add(proxy);
    scene.add(anchor);
    modelObjects[id] = anchor;
    anchor.traverse((child) => { child.userData.modelId = id; });
    clickTargets.push(anchor);
    loadHi3D(id, meta, anchor, proxy);
  });
}

function createProxy(id, meta) {
  const group = new THREE.Group();
  const color = new THREE.Color(zoneColors[meta.zone]);
  const body = new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.34 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x18201c, roughness: 0.5, metalness: 0.42 });
  if (id.includes("robot")) {
    const joints = [[0, 0.06, 0], [0.02, 0.20, 0], [0.13, 0.35, 0], [0.24, 0.47, 0]];
    group.add(meshOf(new THREE.CylinderGeometry(0.10, 0.12, 0.08, 24), dark, [0, 0.04, 0]));
    joints.forEach((p, index) => group.add(meshOf(new THREE.SphereGeometry(index === 3 ? 0.035 : 0.052, 20, 12), dark, p)));
    for (let i = 0; i < joints.length - 1; i += 1) group.add(cylinderBetween(joints[i], joints[i + 1], i < 2 ? 0.038 : 0.027, body));
  } else if (id.includes("glonass")) {
    group.add(meshOf(new THREE.BoxGeometry(0.17, 0.18, 0.17), body, [0, 0.22, 0]));
    group.add(meshOf(new THREE.BoxGeometry(0.52, 0.018, 0.15), dark, [0, 0.22, 0]));
    group.add(meshOf(new THREE.SphereGeometry(0.08, 24, 12), body, [0, 0.40, 0]));
  } else if (id.includes("angara")) {
    group.add(meshOf(new THREE.CylinderGeometry(0.031, 0.031, 0.43, 28), body, [0, 0.26, 0]));
    const cone = meshOf(new THREE.ConeGeometry(0.031, 0.11, 28), body, [0, 0.53, 0]); group.add(cone);
    [-1, 1].forEach((sign) => group.add(meshOf(new THREE.CylinderGeometry(0.015, 0.015, 0.36, 20), dark, [sign * 0.043, 0.23, 0])));
  } else if (id.includes("icebreaker")) {
    group.add(meshOf(new THREE.BoxGeometry(0.82, 0.13, 0.17), body, [0, 0.12, 0]));
    group.add(meshOf(new THREE.BoxGeometry(0.36, 0.13, 0.14), dark, [-0.08, 0.23, 0]));
  } else if (id.includes("stadium")) {
    const ring = meshOf(new THREE.TorusGeometry(0.20, 0.055, 12, 48), body, [0, 0.10, 0], [Math.PI / 2, 0, 0]);
    ring.scale.set(1.35, 1, 1);
    group.add(ring);
  } else {
    group.add(meshOf(new THREE.BoxGeometry(1.55, 0.05, 0.18), dark, [0, 0.16, 0]));
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.72, 0.18, 0), new THREE.Vector3(0, 0.42, 0), new THREE.Vector3(0.72, 0.18, 0)]);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.018, 10, false), body));
  }
  group.traverse((child) => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
  return group;
}

function loadHi3D(id, meta, anchor, proxy) {
  const loader = new GLTFLoader();
  loader.load(`./assets/models/${id}.glb`, (gltf) => {
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const scale = Math.min(meta.dims[0] / Math.max(size.x, 0.0001), meta.dims[2] / Math.max(size.y, 0.0001), meta.dims[1] / Math.max(size.z, 0.0001));
    model.scale.setScalar(scale);
    model.updateMatrixWorld(true);
    const normalized = new THREE.Box3().setFromObject(model);
    const center = normalized.getCenter(new THREE.Vector3());
    model.position.sub(center);
    model.position.y -= normalized.min.y - center.y;
    model.traverse((child) => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; child.userData.modelId = id; } });
    anchor.remove(proxy);
    anchor.add(model);
    meta.status = "Hi3D · web-модель";
    if (selectedModelId === id) selectModel(id);
  }, undefined, () => {
    meta.status = "Размерный прокси";
    if (selectedModelId === id) selectModel(id);
  });
}

function buildCentralMoscow(scene) {
  const material = new THREE.MeshStandardMaterial({ color: 0x313a35, roughness: 0.63, metalness: 0.17 });
  const block = addBox(scene, [3.5, 1.1, 7.2], [0, 0.55, 0.3], material, 0.4);
  block.castShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.055, 12, 72), new THREE.MeshBasicMaterial({ color: 0xff8a45 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 1.14, 0.3);
  scene.add(ring);
}

function buildSuspendedObjects(scene) {
  const material = new THREE.MeshStandardMaterial({ color: 0xe6e2d8, roughness: 0.32, metalness: 0.28 });
  const transport = meshOf(new THREE.BoxGeometry(1.5, 0.08, 0.25), material, [3.1, 3.15, 4.3]);
  transport.rotation.y = -0.35;
  scene.add(transport);
  const tech = meshOf(new THREE.OctahedronGeometry(0.46, 0), material, [-3.1, 3.05, 4.1]);
  tech.rotation.z = 0.25;
  scene.add(tech);
}

function drawScreen(zone, phase) {
  const layer = screenCanvases[zone];
  if (!layer || !content[zone].length) return;
  const ctx = layer.getContext("2d");
  const item = content[zone][state.indices[zone]];
  const accent = zoneColors[zone];
  ctx.fillStyle = "#07100e";
  ctx.fillRect(0, 0, 1024, 1024);
  const gradient = ctx.createLinearGradient(0, 0, 1024, 1024);
  gradient.addColorStop(0, `${accent}55`);
  gradient.addColorStop(0.42, "#0a1714");
  gradient.addColorStop(1, "#050706");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  for (let i = 0; i < 10; i += 1) {
    const x = (i * 173 + phase * 24) % 1180 - 80;
    const y = (i * 97 + phase * 13) % 1040 - 20;
    if (zone === "technology") {
      ctx.beginPath(); ctx.moveTo(x, y + 48); ctx.lineTo(x + 28, y); ctx.lineTo(x + 56, y + 48); ctx.closePath(); ctx.stroke();
    } else if (zone === "construction") {
      ctx.strokeRect(x, y, 62, 62);
    } else {
      ctx.beginPath(); ctx.arc(x, y, 33, 0, Math.PI * 2); ctx.stroke();
    }
  }
  ctx.restore();
  ctx.fillStyle = accent;
  ctx.font = "700 25px Inter, Arial";
  ctx.fillText(`${exhibitionPeriod}  ·  ${zoneLabels[zone].toUpperCase()}`, 68, 92);
  ctx.fillStyle = "#f3f0e7";
  ctx.font = "600 64px Oswald, Arial";
  wrapText(ctx, item.title.toUpperCase(), 68, 195, 860, 72, 3);
  ctx.fillStyle = "#d0d2cb";
  ctx.font = "500 30px Inter, Arial";
  wrapText(ctx, item.text, 68, 520, 820, 45, 4);
  ctx.fillStyle = accent;
  ctx.fillRect(68, 890, 170, 7);
  ctx.fillStyle = "#f3f0e7";
  ctx.font = "600 24px Inter, Arial";
  ctx.fillText(`${String(state.indices[zone] + 1).padStart(2, "0")} / 14`, 68, 950);
  if (screenTextures[zone]) screenTextures[zone].needsUpdate = true;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = text.split(/\s+/);
  let line = "";
  let lines = 0;
  for (let i = 0; i < words.length; i += 1) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y + lines * lineHeight);
      lines += 1;
      line = words[i];
      if (lines >= maxLines - 1) break;
    } else line = test;
  }
  if (lines < maxLines) ctx.fillText(line, x, y + lines * lineHeight);
}

function setupUi(camera, controls) {
  document.querySelectorAll(".viewer-zone-tabs button").forEach((button) => {
    button.addEventListener("click", () => { state.zone = button.dataset.zone; updateZoneUi(); focusCamera(button.dataset.zone, camera, controls); });
  });
  document.getElementById("screenSelect").addEventListener("change", (event) => { state.indices[state.zone] = Number(event.target.value); updateZoneUi(); });
  document.getElementById("screenPrev").addEventListener("click", () => stepScreen(-1));
  document.getElementById("screenNext").addEventListener("click", () => stepScreen(1));
  document.getElementById("screenPlay").addEventListener("click", (event) => {
    state.playing = !state.playing;
    event.currentTarget.setAttribute("aria-pressed", String(state.playing));
    event.currentTarget.textContent = state.playing ? "Пауза" : "Автопоказ";
  });
  document.querySelectorAll(".viewer-cameras [data-camera]").forEach((button) => button.addEventListener("click", () => {
    if (state.walking) setWalkMode(false, camera, controls, false);
    focusCamera(button.dataset.camera, camera, controls);
  }));
  document.getElementById("walkMode").addEventListener("click", () => setWalkMode(!state.walking, camera, controls, true));
  document.getElementById("viewerFullscreen").addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", updateFullscreenUi);
  setupWalkInput();
  document.querySelectorAll(".review-status button").forEach((button) => button.addEventListener("click", () => saveReview({ status: button.dataset.review })));
  document.getElementById("reviewNote").addEventListener("input", (event) => saveReview({ note: event.target.value }, false));
  document.getElementById("copyReviewLink").addEventListener("click", copyReviewLink);
  document.getElementById("downloadReview").addEventListener("click", downloadReviews);
}

function updateZoneUi() {
  const items = content[state.zone];
  const index = state.indices[state.zone];
  const item = items[index];
  document.querySelectorAll(".viewer-zone-tabs button").forEach((button) => button.setAttribute("aria-selected", String(button.dataset.zone === state.zone)));
  const select = document.getElementById("screenSelect");
  select.innerHTML = items.map((entry, itemIndex) => `<option value="${itemIndex}">${String(itemIndex + 1).padStart(2, "0")} · ${escapeHtml(entry.title)}</option>`).join("");
  select.value = String(index);
  document.getElementById("screenPeriod").textContent = exhibitionPeriod;
  document.getElementById("screenIndex").textContent = `${String(index + 1).padStart(2, "0")} / 14`;
  document.getElementById("screenTitle").textContent = item.title;
  document.getElementById("screenBody").textContent = item.text;
  drawScreen(state.zone, performance.now() / 1000);
  selectModel(pickPhysicalModel(state.zone, item.title));
  loadReviewUi();
  writeUrlState();
}

function stepScreen(direction) {
  const total = content[state.zone].length;
  state.indices[state.zone] = (state.indices[state.zone] + direction + total) % total;
  updateZoneUi();
}

function pickPhysicalModel(zone, title) {
  if (zone === "technology") return /ГЛОНАСС|спутник|космич/i.test(title) ? "technology-glonass" : "technology-robot-arm";
  if (zone === "construction") return /мост|дорог|магистрал/i.test(title) ? "construction-bridge" : "construction-stadium";
  return /Ангара|космич|рак/i.test(title) ? "transport-angara" : "transport-icebreaker";
}

function selectModel(id) {
  selectedModelId = id;
  Object.entries(modelObjects).forEach(([modelId, object]) => object.scale.setScalar(modelId === id ? 1.18 : 1));
  const meta = physicalModels[id];
  document.getElementById("modelTitle").textContent = meta.title;
  document.getElementById("modelSize").textContent = meta.size;
  document.getElementById("modelPlacement").textContent = meta.placement;
  document.getElementById("modelStatus").textContent = meta.status;
}

function focusCamera(name, camera, controls) {
  const views = {
    overview: { position: [12.8, 10.8, 20.4], target: [0, 1.5, -1.5] },
    visitor: { position: [0, 1.65, 7.2], target: [0, 1.55, -4] },
    technology: { position: [2.2, 1.8, 1.5], target: [-4.8, 1.65, -1.0] },
    construction: { position: [0, 1.9, 1.5], target: [0, 1.65, -8.4] },
    transport: { position: [-2.2, 1.8, 1.5], target: [4.8, 1.65, -1.0] }
  };
  const view = views[name] || views.overview;
  state.camera = name;
  cameraMotion = { startPosition: camera.position.clone(), startTarget: controls.target.clone(), endPosition: new THREE.Vector3(...view.position), endTarget: new THREE.Vector3(...view.target), started: performance.now(), duration: 850 };
  document.querySelectorAll(".viewer-cameras [data-camera]").forEach((button) => button.classList.toggle("is-active", button.dataset.camera === name));
  writeUrlState();
}

function setWalkMode(enabled, camera, controls, moveToStart) {
  state.walking = enabled;
  root.dataset.walking = String(enabled);
  activeMoves.clear();
  const button = document.getElementById("walkMode");
  button.setAttribute("aria-pressed", String(enabled));
  button.textContent = enabled ? "Выйти из прогулки" : "Прогулка";
  controls.enablePan = !enabled;
  controls.enableZoom = !enabled;
  controls.minDistance = enabled ? 0.75 : 2.2;
  controls.maxDistance = enabled ? 1.25 : 34;
  controls.minPolarAngle = enabled ? Math.PI * 0.34 : 0;
  controls.maxPolarAngle = enabled ? Math.PI * 0.66 : Math.PI * 0.49;
  if (enabled && moveToStart) {
    cameraMotion = null;
    camera.position.set(0, 1.65, 7.2);
    controls.target.set(0, 1.65, 6.2);
    state.camera = "visitor";
    writeUrlState();
  }
  if (!enabled && moveToStart) focusCamera("overview", camera, controls);
}

function setupWalkInput() {
  const keyMap = {
    KeyW: "forward", ArrowUp: "forward", KeyS: "back", ArrowDown: "back",
    KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right"
  };
  window.addEventListener("keydown", (event) => {
    if (state.walking && event.key === "Shift") activeMoves.add("fast");
    if (!state.walking || !keyMap[event.code] || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) return;
    activeMoves.add(keyMap[event.code]);
    if (event.shiftKey) activeMoves.add("fast");
    event.preventDefault();
  });
  window.addEventListener("keyup", (event) => {
    if (keyMap[event.code]) activeMoves.delete(keyMap[event.code]);
    if (event.key === "Shift") activeMoves.delete("fast");
  });
  document.querySelectorAll(".walk-pad [data-move]").forEach((button) => {
    const start = (event) => { activeMoves.add(button.dataset.move); event.preventDefault(); };
    const stop = () => activeMoves.delete(button.dataset.move);
    button.addEventListener("pointerdown", start);
    button.addEventListener("pointerup", stop);
    button.addEventListener("pointercancel", stop);
    button.addEventListener("pointerleave", stop);
  });
  window.addEventListener("blur", () => activeMoves.clear());
}

function updateWalk(camera, controls, delta) {
  if (!activeMoves.size) return;
  const forward = controls.target.clone().sub(camera.position);
  forward.y = 0;
  if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
  forward.normalize();
  const right = new THREE.Vector3(-forward.z, 0, forward.x);
  const movement = new THREE.Vector3();
  if (activeMoves.has("forward")) movement.add(forward);
  if (activeMoves.has("back")) movement.sub(forward);
  if (activeMoves.has("right")) movement.add(right);
  if (activeMoves.has("left")) movement.sub(right);
  if (!movement.lengthSq()) return;
  movement.normalize().multiplyScalar((activeMoves.has("fast") ? 5.2 : 2.8) * delta);
  const current = camera.position.clone();
  const candidate = current.clone().add(movement);
  candidate.y = 1.65;
  const canStand = (point) => point.x >= -4.45 && point.x <= 4.45 && point.z >= -7.85 && point.z <= 8.45 && !(Math.abs(point.x) < 2.15 && point.z > -3.55 && point.z < 4.45);
  let next = candidate;
  if (!canStand(next)) {
    const slideX = current.clone(); slideX.x = candidate.x;
    const slideZ = current.clone(); slideZ.z = candidate.z;
    next = canStand(slideX) ? slideX : canStand(slideZ) ? slideZ : current;
  }
  const offset = next.clone().sub(camera.position);
  camera.position.add(offset);
  controls.target.add(offset);
  camera.position.y = 1.65;
  controls.target.y = 1.65;
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) await root.requestFullscreen();
    else await document.exitFullscreen();
  } catch {
    document.getElementById("reviewSaved").textContent = "Полноэкранный режим заблокирован браузером";
  }
}

function updateFullscreenUi() {
  const active = document.fullscreenElement === root;
  const button = document.getElementById("viewerFullscreen");
  button.setAttribute("aria-pressed", String(active));
  button.textContent = active ? "Закрыть полный экран" : "На весь экран";
  window.dispatchEvent(new Event("resize"));
}

function updateCameraMotion(camera, controls) {
  const t = Math.min(1, (performance.now() - cameraMotion.started) / cameraMotion.duration);
  const eased = 1 - Math.pow(1 - t, 3);
  camera.position.lerpVectors(cameraMotion.startPosition, cameraMotion.endPosition, eased);
  controls.target.lerpVectors(cameraMotion.startTarget, cameraMotion.endTarget, eased);
  if (t >= 1) cameraMotion = null;
}

function reviewKey() { return `${state.zone}:${state.indices[state.zone]}`; }

function saveReview(patch, announce = true) {
  const key = reviewKey();
  state.reviews[key] = { ...(state.reviews[key] || {}), ...patch, zone: state.zone, index: state.indices[state.zone], title: content[state.zone][state.indices[state.zone]].title, updatedAt: new Date().toISOString() };
  localStorage.setItem("faza-exhibition-review-v1", JSON.stringify(state.reviews));
  loadReviewUi();
  if (announce) {
    const saved = document.getElementById("reviewSaved");
    saved.textContent = "Решение сохранено в этом браузере";
    window.setTimeout(() => { saved.textContent = ""; }, 2200);
  }
}

function loadReviewUi() {
  const review = state.reviews[reviewKey()] || {};
  document.querySelectorAll(".review-status button").forEach((button) => button.classList.toggle("is-active", button.dataset.review === review.status));
  const note = document.getElementById("reviewNote");
  if (note.value !== (review.note || "")) note.value = review.note || "";
}

function loadReviews() {
  try { return JSON.parse(localStorage.getItem("faza-exhibition-review-v1") || "{}"); }
  catch { return {}; }
}

async function copyReviewLink() {
  writeUrlState();
  try {
    await navigator.clipboard.writeText(location.href);
    document.getElementById("reviewSaved").textContent = "Ссылка на этот вид скопирована";
  } catch {
    document.getElementById("reviewSaved").textContent = "Скопируйте адрес из строки браузера";
  }
}

function downloadReviews() {
  const payload = { project: "25-лет-развития-россии", exportedAt: new Date().toISOString(), reviews: Object.values(state.reviews) };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "resheniya-zakazchika.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

function readUrlState() {
  const params = new URLSearchParams(location.search);
  const zone = params.get("zone");
  if (zones.includes(zone)) state.zone = zone;
  const index = Number(params.get("item"));
  if (Number.isInteger(index) && index >= 0 && index < 14) state.indices[state.zone] = index;
  if (["overview", "visitor", ...zones].includes(params.get("camera"))) state.camera = params.get("camera");
}

function writeUrlState() {
  const url = new URL(location.href);
  url.searchParams.set("zone", state.zone);
  url.searchParams.set("item", state.indices[state.zone]);
  url.searchParams.set("camera", state.camera);
  history.replaceState(null, "", url);
}

function addBox(scene, size, position, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function meshOf(geometry, material, position, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  return mesh;
}

function cylinderBetween(a, b, radius, material) {
  const start = new THREE.Vector3(...a);
  const end = new THREE.Vector3(...b);
  const vector = end.clone().sub(start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, vector.length(), 20), material);
  mesh.position.copy(start.clone().add(end).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector.clone().normalize());
  return mesh;
}

function addDimension(scene, a, b, label) {
  const material = new THREE.LineBasicMaterial({ color: 0xff8a45, transparent: true, opacity: 0.74 });
  const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]);
  scene.add(new THREE.Line(geometry, material));
  const spriteCanvas = document.createElement("canvas");
  spriteCanvas.width = 256; spriteCanvas.height = 96;
  const ctx = spriteCanvas.getContext("2d");
  ctx.fillStyle = "rgba(7,10,8,.86)"; ctx.fillRect(0, 0, 256, 96);
  ctx.fillStyle = "#ff8a45"; ctx.font = "700 38px Inter, Arial"; ctx.textAlign = "center"; ctx.fillText(label, 128, 62);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(spriteCanvas), transparent: true }));
  sprite.position.copy(new THREE.Vector3(...a).add(new THREE.Vector3(...b)).multiplyScalar(0.5));
  sprite.scale.set(1.45, 0.54, 1);
  scene.add(sprite);
}

function findModelId(object) {
  let current = object;
  while (current) {
    if (current.userData && current.userData.modelId) return current.userData.modelId;
    current = current.parent;
  }
  return null;
}

function escapeHtml(value) {
  return value.replace(/[&<>\"]/g, (symbol) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[symbol]));
}
