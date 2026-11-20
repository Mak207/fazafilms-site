import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const root = document.querySelector(".viewer-shell");
const canvas = document.getElementById("exhibitionCanvas");

if (!root || !canvas) {
  throw new Error("Exhibition 3D root is missing");
}

const allItems = window.EXHIBITION_ITEMS || [];
const exhibitCatalog = window.EXHIBIT_CATALOG || [];
const zones = ["technology", "construction", "transport"];
const zoneLabels = { technology: "Технологии", construction: "Строительство", transport: "Транспорт" };
const zoneColors = { technology: "#52d5d7", construction: "#b7df78", transport: "#89a8ff" };
const exhibitionPeriod = "2000–2025";

const content = Object.fromEntries(zones.map((zone) => [zone, allItems.filter((item) => item.zone === zone)]));
const state = {
  zone: "technology",
  indices: { technology: 0, construction: 0, transport: 0 },
  playing: false,
  mode: "plate",
  walking: false,
  camera: "overview",
  reviews: loadReviews()
};

const physicalModels = Object.fromEntries(exhibitCatalog.map((item) => [item.id, {
  ...item,
  title: item.objectTitle,
  placement: item.zone === "technology" ? "левая ниша" : item.zone === "transport" ? "правая ниша" : "торцевая ниша"
}]));
const centerEnvelopes = [
  { id: "center-01", dims: [1.90, 1.35, 1.65], position: [0, 0.19, -1.55], placement: "центральный подиум" },
  { id: "center-02", dims: [3.20, 0.75, 0.55], position: [0, 0.19, 0.52], placement: "центральный подиум" },
  { id: "center-03", dims: [2.80, 0.60, 0.52], position: [0, 0.19, 2.15], placement: "центральный подиум" }
];
(window.CENTER_PROPOSAL || []).forEach((item, index) => {
  const envelope = centerEnvelopes[index];
  if (!envelope) return;
  physicalModels[envelope.id] = {
    ...item,
    ...envelope,
    title: item.objectTitle,
    status: "Hi3D · модель из референсной фотографии"
  };
});

const gltfLoader = new GLTFLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

const screenCanvases = {};
const screenTextures = {};
const screenMaterials = {};
const clickTargets = [];
const modelObjects = {};
let selectedModelId = "technology-01";
let autoTimer = 0;
let lastScreenDraw = 0;
let cameraMotion = null;
const activeMoves = new Set();
const screenFrames = {};
zones.forEach((zone) => {
  const image = new Image();
  image.src = `./assets/frames/${zone}-anchor.webp`;
  image.onload = () => drawScreen(zone, performance.now() / 1000);
  screenFrames[zone] = image;
});

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

  addSeamlessMediaWalls(scene);

  const shelfMaterial = new THREE.MeshStandardMaterial({ color: 0x303933, roughness: 0.52, metalness: 0.34 });
  addBox(scene, [0.62, 0.08, 16.6], [-4.72, 0.54, 0], shelfMaterial);
  addBox(scene, [0.62, 0.08, 16.6], [4.72, 0.54, 0], shelfMaterial);
  addBox(scene, [9.6, 0.08, 0.62], [0, 0.54, -8.22], shelfMaterial);

  addDimension(scene, [-5.55, 0, 8.2], [-5.55, 4, 8.2], "4 м");
  addDimension(scene, [-5, 0.02, 9.1], [5, 0.02, 9.1], "10 м");
}

function addSeamlessMediaWalls(scene) {
  const path = [];
  const add = (x, z, zone) => path.push({ x, z, zone });
  add(-4.985, 8.35, "technology");
  add(-4.985, -7.6, "technology");
  for (let i = 1; i <= 8; i += 1) {
    const a = Math.PI + (Math.PI / 2) * (i / 8);
    add(-4.085 + Math.cos(a) * 0.9, -7.6 + Math.sin(a) * 0.9, i <= 4 ? "technology" : "construction");
  }
  add(4.085, -8.5, "construction");
  for (let i = 1; i <= 8; i += 1) {
    const a = -Math.PI / 2 + (Math.PI / 2) * (i / 8);
    add(4.085 + Math.cos(a) * 0.9, -7.6 + Math.sin(a) * 0.9, i <= 4 ? "construction" : "transport");
  }
  add(4.985, 8.35, "transport");

  const zoneLengths = { technology: 0, construction: 0, transport: 0 };
  const segments = [];
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    const zone = b.zone || a.zone;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    segments.push({ a, b, zone, start: zoneLengths[zone], length, index: i });
    zoneLengths[zone] += length;
  }

  const pathOffsets = path.map((point, index) => {
    const normalFor = (from, to) => {
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const inv = 1 / Math.max(Math.hypot(dx, dz), 0.0001);
      return new THREE.Vector2(-dz * inv, dx * inv);
    };
    const previous = index > 0 ? normalFor(path[index - 1], point) : null;
    const next = index < path.length - 1 ? normalFor(point, path[index + 1]) : null;
    if (!previous) return next.multiplyScalar(0.012);
    if (!next) return previous.multiplyScalar(0.012);
    const miter = previous.clone().add(next).normalize();
    return miter.multiplyScalar(0.012 / Math.max(miter.dot(next), 0.25));
  });

  const buildStrip = (y0, y1, materials) => {
    const positions = [];
    const uvs = [];
    const indices = [];
    const groups = [];
    let vertex = 0;
    segments.forEach((segment) => {
      const offsetA = pathOffsets[segment.index];
      const offsetB = pathOffsets[segment.index + 1];
      const u0 = segment.start / zoneLengths[segment.zone];
      const u1 = (segment.start + segment.length) / zoneLengths[segment.zone];
      positions.push(
        segment.a.x + offsetA.x, y0, segment.a.z + offsetA.y,
        segment.b.x + offsetB.x, y0, segment.b.z + offsetB.y,
        segment.b.x + offsetB.x, y1, segment.b.z + offsetB.y,
        segment.a.x + offsetA.x, y1, segment.a.z + offsetA.y
      );
      uvs.push(u0, 0, u1, 0, u1, 1, u0, 1);
      indices.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3);
      groups.push({ start: indices.length - 6, count: 6, materialIndex: zones.indexOf(segment.zone) });
      vertex += 4;
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    groups.forEach((group) => geometry.addGroup(group.start, group.count, group.materialIndex));
    scene.add(new THREE.Mesh(geometry, materials));
  };

  const mediaMaterials = zones.map((zone) => screenMaterials[zone]);
  buildStrip(0, 0.5, mediaMaterials);
  buildStrip(1.5, 4, mediaMaterials);
  const niche = new THREE.MeshStandardMaterial({ color: 0x070a08, roughness: 0.92, metalness: 0.06 });
  buildStrip(0.5, 1.5, [niche, niche, niche]);
}

function buildPhysicalModels(scene) {
  Object.entries(physicalModels).forEach(([id, meta]) => {
    const t = meta.index / 13;
    const slot = meta.zone === "technology"
      ? { position: [-4.58, 0.58, THREE.MathUtils.lerp(-7.42, 7.42, t)], rotation: [0, Math.PI / 2, 0] }
      : meta.zone === "transport"
        ? { position: [4.58, 0.58, THREE.MathUtils.lerp(-7.42, 7.42, t)], rotation: [0, -Math.PI / 2, 0] }
        : { position: [THREE.MathUtils.lerp(-4.45, 4.45, t), 0.58, -8.08], rotation: [0, 0, 0] };
    const anchor = new THREE.Group();
    anchor.name = id;
    anchor.position.set(...slot.position);
    anchor.rotation.set(...slot.rotation);
    anchor.userData.modelId = id;
    const proxy = createProxy(meta);
    proxy.userData.modelId = id;
    anchor.add(proxy);
    scene.add(anchor);
    modelObjects[id] = anchor;
    anchor.traverse((child) => { child.userData.modelId = id; });
    clickTargets.push(anchor);
    loadHi3D(id, meta, anchor, proxy);
  });
}

function createProxy(meta) {
  const group = new THREE.Group();
  const color = new THREE.Color(zoneColors[meta.zone]);
  const body = new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.34 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x18201c, roughness: 0.5, metalness: 0.42 });
  const pale = new THREE.MeshStandardMaterial({ color: 0xd8ded8, roughness: 0.42, metalness: 0.18 });
  const glass = new THREE.MeshStandardMaterial({ color, roughness: 0.12, metalness: 0.12, transparent: true, opacity: 0.62 });
  const kind = meta.kind;

  if (kind === "robot") {
    const joints = [[0, 0.06, 0], [0.02, 0.20, 0], [0.13, 0.35, 0], [0.24, 0.47, 0]];
    group.add(meshOf(new THREE.CylinderGeometry(0.10, 0.12, 0.08, 24), dark, [0, 0.04, 0]));
    joints.forEach((p, index) => group.add(meshOf(new THREE.SphereGeometry(index === 3 ? 0.035 : 0.052, 20, 12), dark, p)));
    for (let i = 0; i < joints.length - 1; i += 1) group.add(cylinderBetween(joints[i], joints[i + 1], i < 2 ? 0.038 : 0.027, body));
  } else if (["satellite", "earthSatellite"].includes(kind)) {
    group.add(meshOf(new THREE.BoxGeometry(0.17, 0.18, 0.17), body, [0, 0.22, 0]));
    group.add(meshOf(new THREE.BoxGeometry(0.52, 0.018, 0.15), dark, [0, 0.22, 0]));
    group.add(meshOf(new THREE.SphereGeometry(0.08, 24, 12), body, [0, 0.40, 0]));
  } else if (kind === "rocket") {
    group.add(meshOf(new THREE.CylinderGeometry(0.031, 0.031, 0.43, 28), body, [0, 0.26, 0]));
    const cone = meshOf(new THREE.ConeGeometry(0.031, 0.11, 28), body, [0, 0.53, 0]); group.add(cone);
    [-1, 1].forEach((sign) => group.add(meshOf(new THREE.CylinderGeometry(0.015, 0.015, 0.36, 20), dark, [sign * 0.043, 0.23, 0])));
  } else if (["ship", "iceShip", "icebreaker", "hydrofoil"].includes(kind)) {
    const hull = meshOf(new THREE.ConeGeometry(0.18, 0.92, 4), body, [0, 0.14, 0], [0, 0, Math.PI / 2]);
    hull.scale.z = 0.55;
    group.add(hull);
    group.add(meshOf(new THREE.BoxGeometry(0.38, 0.13, 0.14), dark, [-0.08, 0.23, 0]));
    if (kind === "hydrofoil") {
      group.add(meshOf(new THREE.BoxGeometry(0.48, 0.018, 0.38), pale, [0.04, 0.04, 0]));
      group.add(meshOf(new THREE.BoxGeometry(0.04, 0.16, 0.02), dark, [-0.18, 0.02, 0]));
    }
  } else if (kind === "stadium") {
    const ring = meshOf(new THREE.TorusGeometry(0.20, 0.055, 12, 48), body, [0, 0.10, 0], [Math.PI / 2, 0, 0]);
    ring.scale.set(1.35, 1, 1);
    group.add(ring);
  } else if (kind === "bridge") {
    group.add(meshOf(new THREE.BoxGeometry(1.55, 0.05, 0.18), dark, [0, 0.16, 0]));
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.72, 0.18, 0), new THREE.Vector3(0, 0.42, 0), new THREE.Vector3(0.72, 0.18, 0)]);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.018, 10, false), body));
    [-0.55, -0.3, 0, 0.3, 0.55].forEach((x) => group.add(meshOf(new THREE.BoxGeometry(0.008, 0.23, 0.008), pale, [x, 0.28 + (0.14 * (1 - Math.abs(x))), 0])));
  } else if (["car", "autocar", "bus", "doubleTrain", "locomotive", "fastTrain"].includes(kind)) {
    const long = ["bus", "doubleTrain", "locomotive", "fastTrain"].includes(kind);
    const h = kind === "doubleTrain" ? 0.34 : long ? 0.25 : 0.18;
    group.add(meshOf(new THREE.BoxGeometry(long ? 0.9 : 0.62, h, long ? 0.24 : 0.3), body, [0, h * 0.65 + 0.08, 0]));
    if (kind === "fastTrain") group.add(meshOf(new THREE.ConeGeometry(0.17, 0.34, 4), body, [0.55, 0.20, 0], [0, 0, -Math.PI / 2]));
    [-0.28, 0.28].forEach((x) => [-1, 1].forEach((z) => group.add(meshOf(new THREE.CylinderGeometry(0.055, 0.055, 0.025, 16), dark, [x, 0.055, z * (long ? 0.105 : 0.13)], [Math.PI / 2, 0, 0]))));
    group.add(meshOf(new THREE.BoxGeometry(long ? 0.62 : 0.34, h * 0.34, 0.012), glass, [0.04, h * 0.78 + 0.08, 0.126]));
  } else if (kind === "airliner") {
    group.add(meshOf(new THREE.CylinderGeometry(0.085, 0.085, 0.86, 20), pale, [0, 0.24, 0], [0, 0, Math.PI / 2]));
    group.add(meshOf(new THREE.ConeGeometry(0.085, 0.18, 20), pale, [0.52, 0.24, 0], [0, 0, -Math.PI / 2]));
    group.add(meshOf(new THREE.BoxGeometry(0.24, 0.025, 0.82), body, [-0.03, 0.24, 0]));
    group.add(meshOf(new THREE.BoxGeometry(0.18, 0.018, 0.32), body, [-0.35, 0.28, 0]));
  } else if (kind === "helicopter") {
    const fuselage = meshOf(new THREE.SphereGeometry(0.19, 20, 12), body, [0, 0.25, 0]); fuselage.scale.set(1.5, 0.9, 0.9); group.add(fuselage);
    group.add(meshOf(new THREE.BoxGeometry(0.56, 0.05, 0.05), dark, [-0.30, 0.25, 0]));
    group.add(meshOf(new THREE.BoxGeometry(0.85, 0.015, 0.055), pale, [0, 0.46, 0]));
  } else if (kind === "spacecraft") {
    group.add(meshOf(new THREE.CylinderGeometry(0.16, 0.22, 0.28, 24), body, [0, 0.17, 0]));
    group.add(meshOf(new THREE.ConeGeometry(0.16, 0.18, 24), pale, [0, 0.40, 0]));
    group.add(meshOf(new THREE.TorusGeometry(0.20, 0.025, 8, 24), dark, [0, 0.10, 0], [Math.PI / 2, 0, 0]));
  } else if (["pipeline", "highway", "railway", "utilities"].includes(kind)) {
    const rails = kind === "pipeline" || kind === "utilities" ? 3 : 2;
    for (let i = 0; i < rails; i += 1) {
      const z = (i - (rails - 1) / 2) * 0.13;
      group.add(meshOf(kind === "pipeline" || kind === "utilities" ? new THREE.CylinderGeometry(0.04, 0.04, 0.85, 14) : new THREE.BoxGeometry(0.9, 0.035, 0.055), i === 0 ? body : pale, [0, 0.12, z], kind === "pipeline" || kind === "utilities" ? [0, 0, Math.PI / 2] : [0, 0, 0]));
    }
  } else if (["airport", "hospital", "school", "technopark", "district", "social"].includes(kind)) {
    const blocks = kind === "district" ? 7 : 4;
    for (let i = 0; i < blocks; i += 1) {
      const x = ((i % 4) - 1.5) * 0.18;
      const z = (Math.floor(i / 4) - 0.4) * 0.23;
      const h = 0.16 + ((i * 7) % 4) * 0.07;
      group.add(meshOf(new THREE.BoxGeometry(0.14, h, 0.15), i % 2 ? pale : body, [x, h / 2, z]));
    }
    if (kind === "airport") group.add(meshOf(new THREE.TorusGeometry(0.42, 0.035, 8, 36, Math.PI), body, [0, 0.16, 0.05], [Math.PI / 2, 0, 0]));
  } else if (kind === "port") {
    for (let i = 0; i < 5; i += 1) group.add(meshOf(new THREE.BoxGeometry(0.16, 0.10, 0.14), i % 2 ? body : pale, [-0.34 + i * 0.17, 0.05, 0]));
    [-0.25, 0.25].forEach((x) => { group.add(meshOf(new THREE.BoxGeometry(0.035, 0.48, 0.035), dark, [x, 0.24, -0.18])); group.add(meshOf(new THREE.BoxGeometry(0.3, 0.025, 0.025), body, [x + 0.12, 0.44, -0.18])); });
  } else if (kind === "cosmodrome") {
    group.add(meshOf(new THREE.CylinderGeometry(0.045, 0.045, 0.52, 20), pale, [0, 0.28, 0]));
    group.add(meshOf(new THREE.ConeGeometry(0.045, 0.12, 20), pale, [0, 0.60, 0]));
    group.add(meshOf(new THREE.BoxGeometry(0.18, 0.54, 0.08), body, [-0.22, 0.27, 0]));
  } else if (kind === "reactor") {
    group.add(meshOf(new THREE.CylinderGeometry(0.23, 0.28, 0.42, 28), body, [0, 0.23, 0]));
    group.add(meshOf(new THREE.TorusGeometry(0.25, 0.035, 10, 36), pale, [0, 0.43, 0], [Math.PI / 2, 0, 0]));
  } else if (kind === "terminal") {
    group.add(meshOf(new THREE.BoxGeometry(0.48, 0.42, 0.08), dark, [0, 0.28, 0]));
    group.add(meshOf(new THREE.BoxGeometry(0.39, 0.31, 0.012), glass, [0, 0.31, 0.046]));
  } else if (kind === "combine") {
    group.add(meshOf(new THREE.BoxGeometry(0.52, 0.28, 0.32), body, [0.05, 0.22, 0]));
    group.add(meshOf(new THREE.BoxGeometry(0.82, 0.07, 0.12), pale, [0.26, 0.08, 0]));
    [-0.15, 0.22].forEach((x) => group.add(meshOf(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 18), dark, [x, 0.10, 0.18], [Math.PI / 2, 0, 0])));
  } else if (kind === "drone") {
    group.add(meshOf(new THREE.BoxGeometry(0.28, 0.08, 0.16), body, [0, 0.26, 0]));
    [[-1,-1],[-1,1],[1,-1],[1,1]].forEach(([x,z]) => { group.add(meshOf(new THREE.BoxGeometry(0.42, 0.025, 0.035), dark, [x * 0.13, 0.28, z * 0.13], [0, x * z * 0.5, 0])); group.add(meshOf(new THREE.TorusGeometry(0.09, 0.01, 6, 24), pale, [x * 0.30, 0.29, z * 0.30], [Math.PI / 2, 0, 0])); });
  } else if (kind === "rover") {
    group.add(meshOf(new THREE.BoxGeometry(0.43, 0.36, 0.38), body, [0, 0.22, 0]));
    group.add(meshOf(new THREE.BoxGeometry(0.24, 0.10, 0.06), glass, [0, 0.27, 0.22]));
    [-1,1].forEach((x) => [-1,1].forEach((z) => group.add(meshOf(new THREE.CylinderGeometry(0.055, 0.055, 0.035, 14), dark, [x * 0.16, 0.04, z * 0.14], [Math.PI / 2, 0, 0]))));
  } else if (kind === "coin") {
    group.add(meshOf(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 36), body, [0, 0.27, 0], [Math.PI / 2, 0, 0]));
    group.add(meshOf(new THREE.TorusGeometry(0.15, 0.018, 8, 32), pale, [0, 0.27, 0.035]));
  } else if (kind === "aiCore") {
    group.add(meshOf(new THREE.IcosahedronGeometry(0.26, 1), body, [0, 0.29, 0]));
    group.add(meshOf(new THREE.IcosahedronGeometry(0.39, 1), glass, [0, 0.29, 0]));
  } else if (kind === "server") {
    [-0.22, 0, 0.22].forEach((x) => { group.add(meshOf(new THREE.BoxGeometry(0.18, 0.52, 0.26), dark, [x, 0.26, 0])); for (let i = 0; i < 5; i += 1) group.add(meshOf(new THREE.BoxGeometry(0.13, 0.025, 0.012), body, [x, 0.10 + i * 0.08, 0.137])); });
  } else if (kind === "quantum") {
    [0.28, 0.21, 0.15, 0.09].forEach((r, i) => group.add(meshOf(new THREE.CylinderGeometry(r, r * 0.88, 0.09, 28), i % 2 ? body : pale, [0, 0.08 + i * 0.11, 0])));
  } else if (kind === "biotech") {
    group.add(meshOf(new THREE.CylinderGeometry(0.18, 0.18, 0.43, 24), glass, [-0.16, 0.23, 0]));
    group.add(meshOf(new THREE.SphereGeometry(0.22, 24, 16), body, [0.22, 0.27, 0]));
  } else if (kind === "materials") {
    for (let i = 0; i < 5; i += 1) group.add(meshOf(new THREE.BoxGeometry(0.58, 0.035, 0.34), i % 2 ? body : pale, [0, 0.05 + i * 0.08, 0], [0, i * 0.06, 0]));
  } else {
    group.add(meshOf(new THREE.BoxGeometry(0.62, 0.32, 0.38), body, [0, 0.18, 0]));
  }
  fitToEnvelope(group, meta.dims);
  const base = meshOf(new THREE.BoxGeometry(meta.dims[0] * 0.92, 0.025, meta.dims[1] * 0.82), dark, [0, -0.012, 0]);
  group.add(base);
  group.traverse((child) => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
  return group;
}

function fitToEnvelope(group, dims) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const scale = Math.min((dims[0] * 0.9) / Math.max(size.x, 0.001), (dims[2] * 0.9) / Math.max(size.y, 0.001), (dims[1] * 0.9) / Math.max(size.z, 0.001));
  group.scale.setScalar(scale);
  group.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(group);
  group.position.y -= fitted.min.y;
}

function loadHi3D(id, meta, anchor, proxy) {
  gltfLoader.load(`./assets/models/hitem/${id}.glb`, (gltf) => {
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    let size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    const regularScale = Math.min(meta.dims[0] / Math.max(size.x, 0.0001), meta.dims[2] / Math.max(size.y, 0.0001), meta.dims[1] / Math.max(size.z, 0.0001));
    const rotatedScale = Math.min(meta.dims[0] / Math.max(size.z, 0.0001), meta.dims[2] / Math.max(size.y, 0.0001), meta.dims[1] / Math.max(size.x, 0.0001));
    if (rotatedScale > regularScale * 1.03) {
      model.rotation.y = Math.PI / 2;
      model.updateMatrixWorld(true);
      size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    }
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
    meta.status = "Hi3D · модель из референсной фотографии";
    if (selectedModelId === id) selectModel(id);
  }, undefined, () => {
    meta.status = "Размерный прокси";
    if (selectedModelId === id) selectModel(id);
  });
}

function buildCentralMoscow(scene) {
  const plinthMaterial = new THREE.MeshStandardMaterial({ color: 0x252d29, roughness: 0.62, metalness: 0.18 });
  addBox(scene, [3.6, 0.18, 6.4], [0, 0.09, 0.35], plinthMaterial);

  centerEnvelopes.forEach((entry) => {
    const meta = physicalModels[entry.id];
    if (!meta) return;
    const anchor = new THREE.Group();
    anchor.name = entry.id;
    anchor.position.set(...entry.position);
    anchor.userData.modelId = entry.id;
    const proxy = createProxy({ ...meta, zone: "technology", kind: entry.id === "center-02" ? "bridge" : entry.id === "center-03" ? "fastTrain" : "district" });
    proxy.userData.modelId = entry.id;
    anchor.add(proxy);
    scene.add(anchor);
    modelObjects[entry.id] = anchor;
    anchor.traverse((child) => { child.userData.modelId = entry.id; });
    clickTargets.push(anchor);
    loadHi3D(entry.id, meta, anchor, proxy);
  });

  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.035, 12, 96), new THREE.MeshBasicMaterial({ color: 0xff8a45 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 0.205, 0.35);
  scene.add(ring);
}

function buildSuspendedObjects(scene) {
  const material = new THREE.MeshStandardMaterial({ color: 0xe6e2d8, roughness: 0.32, metalness: 0.28 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x89a8ff, roughness: 0.28, metalness: 0.26 });
  const plane = new THREE.Group();
  plane.add(meshOf(new THREE.CylinderGeometry(0.10, 0.10, 1.65, 24), material, [0, 0, 0], [0, 0, Math.PI / 2]));
  plane.add(meshOf(new THREE.ConeGeometry(0.10, 0.28, 24), material, [0.96, 0, 0], [0, 0, -Math.PI / 2]));
  plane.add(meshOf(new THREE.BoxGeometry(0.42, 0.035, 1.36), accent, [0.05, 0, 0]));
  plane.position.set(3.0, 3.22, 3.9);
  plane.rotation.y = -0.35;
  scene.add(plane);
  const satellite = new THREE.Group();
  satellite.add(meshOf(new THREE.BoxGeometry(0.34, 0.34, 0.34), accent, [0, 0, 0]));
  satellite.add(meshOf(new THREE.BoxGeometry(1.55, 0.035, 0.38), material, [0, 0, 0]));
  satellite.position.set(-3.0, 3.15, 3.85);
  satellite.rotation.set(0.18, 0.28, 0.24);
  scene.add(satellite);
}

function drawScreen(zone, phase) {
  const layer = screenCanvases[zone];
  if (!layer || !content[zone].length) return;
  const ctx = layer.getContext("2d");
  const item = content[zone][state.indices[zone]];
  const accent = zoneColors[zone];
  const frame = screenFrames[zone];
  ctx.clearRect(0, 0, 1024, 1024);
  if (state.mode !== "plate" && frame && frame.complete && frame.naturalWidth) {
    const drift = Math.sin(phase * 0.16) * 34;
    const scale = Math.max(1024 / frame.naturalWidth, 1024 / frame.naturalHeight);
    const width = frame.naturalWidth * scale;
    const height = frame.naturalHeight * scale;
    ctx.drawImage(frame, (1024 - width) / 2 + drift, (1024 - height) / 2, width, height);
    const shade = ctx.createLinearGradient(0, 0, 1024, 1024);
    shade.addColorStop(0, "rgba(6,10,8,.12)");
    shade.addColorStop(0.62, "rgba(6,10,8,.36)");
    shade.addColorStop(1, "rgba(6,10,8,.78)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, 1024, 1024);
  } else {
    ctx.fillStyle = "#07100e";
    ctx.fillRect(0, 0, 1024, 1024);
    const gradient = ctx.createLinearGradient(0, 0, 1024, 1024);
    gradient.addColorStop(0, `${accent}55`);
    gradient.addColorStop(0.42, "#0a1714");
    gradient.addColorStop(1, "#050706");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1024, 1024);
  }
  ctx.save();
  ctx.globalAlpha = state.mode === "frame" ? 0.14 : 0.28;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
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

  if (state.mode !== "frame") {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.44)";
    ctx.shadowBlur = 52;
    ctx.fillStyle = "rgba(13,20,17,.78)";
    roundedRect(ctx, 52, state.mode === "hybrid" ? 530 : 104, 880, state.mode === "hybrid" ? 390 : 760, 44);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(222,238,229,.16)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    const top = state.mode === "hybrid" ? 585 : 165;
    ctx.fillStyle = accent;
    ctx.font = "700 23px 'IBM Plex Mono', Consolas, monospace";
    ctx.fillText(`${exhibitionPeriod}  /  ${zoneLabels[zone].toUpperCase()}`, 92, top);
    const titleGradient = ctx.createLinearGradient(92, top + 42, 92, top + 255);
    titleGradient.addColorStop(0, "#f3f0e7");
    titleGradient.addColorStop(1, "#aeb9b3");
    ctx.fillStyle = titleGradient;
    ctx.font = "600 66px Oswald, Arial";
    wrapText(ctx, item.title.toUpperCase(), 92, top + 100, 790, 70, state.mode === "hybrid" ? 2 : 3);
    if (state.mode === "plate") {
      const accentWord = (item.title.match(/[А-ЯЁA-Z][а-яёa-z-]{4,}/) || [zoneLabels[zone]])[0];
      ctx.fillStyle = accent;
      ctx.font = "italic 600 42px 'Playfair Display', Georgia, serif";
      ctx.fillText(accentWord, 92, top + 330);
      ctx.fillStyle = "rgba(218,224,218,.72)";
      ctx.font = "500 28px Inter, Arial";
      wrapText(ctx, item.text, 92, top + 405, 760, 42, 4);
    }
    ctx.fillStyle = accent;
    ctx.fillRect(92, 902, 152, 6);
    ctx.fillStyle = "#d9ddd7";
    ctx.font = "600 23px 'IBM Plex Mono', Consolas, monospace";
    ctx.fillText(`${String(state.indices[zone] + 1).padStart(2, "0")} / 14`, 92, 954);
  } else {
    ctx.fillStyle = "rgba(7,12,10,.74)";
    roundedRect(ctx, 66, 840, 410, 104, 28);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.font = "700 22px 'IBM Plex Mono', Consolas, monospace";
    ctx.fillText(`${zoneLabels[zone].toUpperCase()}  ·  КАДР 01`, 96, 900);
  }
  ctx.save();
  ctx.globalAlpha = 0.055;
  for (let i = 0; i < 6200; i += 1) {
    const x = (i * 73) % 1024;
    const y = (i * 151) % 1024;
    ctx.fillStyle = i % 3 ? "#f3f0e7" : accent;
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.restore();
  if (screenTextures[zone]) screenTextures[zone].needsUpdate = true;
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
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
  document.getElementById("screenMode").addEventListener("change", (event) => {
    state.mode = event.target.value;
    zones.forEach((zone) => drawScreen(zone, performance.now() / 1000));
    writeUrlState();
  });
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
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && root.classList.contains("is-fullscreen-fallback")) {
      setFallbackFullscreen(false);
    }
  });
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
  document.getElementById("screenMode").value = state.mode;
  drawScreen(state.zone, performance.now() / 1000);
  selectModel(item.id || pickPhysicalModel(state.zone, item.title));
  loadReviewUi();
  writeUrlState();
}

function stepScreen(direction) {
  const total = content[state.zone].length;
  state.indices[state.zone] = (state.indices[state.zone] + direction + total) % total;
  updateZoneUi();
}

function pickPhysicalModel(zone, title) {
  const item = content[zone].find((entry) => entry.title === title);
  return item?.id || exhibitCatalog.find((entry) => entry.zone === zone)?.id;
}

function selectModel(id) {
  selectedModelId = id;
  Object.entries(modelObjects).forEach(([modelId, object]) => object.scale.setScalar(modelId === id ? 1.18 : 1));
  const meta = physicalModels[id];
  if (!meta) return;
  document.getElementById("modelTitle").textContent = meta.title;
  document.getElementById("modelSize").textContent = meta.size;
  document.getElementById("modelPlacement").textContent = meta.placement;
  document.getElementById("modelStatus").textContent = meta.status;
  const reference = document.getElementById("modelReference");
  reference.href = meta.reference || "#";
  reference.hidden = !meta.reference;
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
  if (root.classList.contains("is-fullscreen-fallback")) {
    setFallbackFullscreen(false);
    return;
  }
  try {
    if (!document.fullscreenElement) await root.requestFullscreen();
    else await document.exitFullscreen();
  } catch {
    setFallbackFullscreen(true);
    return;
  }
  if (!document.fullscreenElement) setFallbackFullscreen(true);
}

function updateFullscreenUi() {
  const active = document.fullscreenElement === root || root.classList.contains("is-fullscreen-fallback");
  const button = document.getElementById("viewerFullscreen");
  button.setAttribute("aria-pressed", String(active));
  button.textContent = active ? "Закрыть полный экран" : "На весь экран";
  window.dispatchEvent(new Event("resize"));
}

function setFallbackFullscreen(active) {
  root.classList.toggle("is-fullscreen-fallback", active);
  document.documentElement.classList.toggle("viewer-fallback-active", active);
  updateFullscreenUi();
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
  if (["plate", "frame", "hybrid"].includes(params.get("mode"))) state.mode = params.get("mode");
}

function writeUrlState() {
  const url = new URL(location.href);
  url.searchParams.set("zone", state.zone);
  url.searchParams.set("item", state.indices[state.zone]);
  url.searchParams.set("camera", state.camera);
  url.searchParams.set("mode", state.mode);
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
