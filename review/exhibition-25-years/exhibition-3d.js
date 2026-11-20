import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

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
  { id: "center-01", dims: [2.35, 1.85, 1.75], position: [0, 0.30, -2.35], rotation: 0, placement: "станция 01 · город" },
  { id: "center-02", dims: [3.35, 0.90, 0.62], position: [0, 0.20, 0.15], rotation: -0.08, placement: "станция 02 · инфраструктура" },
  { id: "center-03", dims: [3.20, 0.72, 0.68], position: [0, 0.22, 2.45], rotation: 0.06, placement: "станция 03 · движение" }
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
  camera.position.set(4.35, 5.4, 7.8);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.target.set(0, 0.95, -2.0);
  controls.minDistance = 2.2;
  controls.maxDistance = 34;
  controls.maxPolarAngle = Math.PI * 0.49;

  addExhibitionLighting(scene);

  buildPavilion(scene);
  buildPhysicalModels(scene);
  buildCentralMoscow(scene);

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

function addExhibitionLighting(scene) {
  scene.add(new THREE.HemisphereLight(0xe2ebe5, 0x151a16, 1.18));

  const key = new THREE.DirectionalLight(0xfff4e5, 1.72);
  key.position.set(4.5, 10.5, 8.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -11;
  key.shadow.camera.right = 11;
  key.shadow.camera.top = 14;
  key.shadow.camera.bottom = -14;
  key.shadow.bias = -0.00012;
  scene.add(key);

  const addSpot = (position, targetPosition, intensity, color, angle = 0.38) => {
    const target = new THREE.Object3D();
    target.position.set(...targetPosition);
    scene.add(target);
    const spot = new THREE.SpotLight(color, intensity, 12, angle, 0.72, 1.75);
    spot.position.set(...position);
    spot.target = target;
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    scene.add(spot);
  };

  addSpot([-2.8, 4.7, -0.6], [0, 0.8, -2.35], 54, 0xffead0, 0.34);
  addSpot([2.9, 4.3, 1.2], [0, 0.45, 0.15], 46, 0xfff0dc, 0.31);
  addSpot([-2.3, 4.0, 4.5], [0, 0.45, 2.45], 44, 0xffe8cc, 0.30);

  const technologyWash = new THREE.PointLight(0x52d5d7, 7, 10, 2);
  technologyWash.position.set(-4.0, 2.25, -2.2);
  scene.add(technologyWash);
  const transportWash = new THREE.PointLight(0x89a8ff, 6, 10, 2);
  transportWash.position.set(4.0, 2.25, -2.2);
  scene.add(transportWash);
}

function buildPavilion(scene) {
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x1c231f, roughness: 0.76, metalness: 0.08 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12.5, 20), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = 0.4;
  floor.receiveShadow = true;
  scene.add(floor);

  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x222925, roughness: 0.8, metalness: 0.12 });
  addBox(scene, [0.32, 4, 17], [-5.16, 2, 0], wallMaterial);
  addBox(scene, [0.32, 4, 17], [5.16, 2, 0], wallMaterial);
  addBox(scene, [10.0, 4, 0.32], [0, 2, -8.66], wallMaterial);

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

  createScreenLayers(zoneLengths);

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

  buildStrip(0, 0.5, zones.map((zone) => screenMaterials[zone].lower));
  buildStrip(1.5, 4, zones.map((zone) => screenMaterials[zone].upper));
  const niche = new THREE.MeshStandardMaterial({ color: 0x070a08, roughness: 0.92, metalness: 0.06 });
  buildStrip(0.5, 1.5, [niche, niche, niche]);
}

function createScreenLayers(zoneLengths) {
  zones.forEach((zone) => {
    const lengthMeters = zoneLengths[zone];
    screenCanvases[zone] = {};
    screenTextures[zone] = {};
    screenMaterials[zone] = {};
    [
      ["upper", 2.5, 210],
      ["lower", 0.5, 240]
    ].forEach(([band, heightMeters, pixelsPerMeter]) => {
      const layer = document.createElement("canvas");
      layer.width = Math.min(4096, Math.max(1536, Math.round(lengthMeters * pixelsPerMeter)));
      layer.height = Math.max(112, Math.round(layer.width * heightMeters / lengthMeters));
      screenCanvases[zone][band] = layer;
      const texture = new THREE.CanvasTexture(layer);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      screenTextures[zone][band] = texture;
      screenMaterials[zone][band] = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    });
    drawScreen(zone, 0);
  });
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
    const fittedSize = normalized.getSize(new THREE.Vector3());
    model.position.sub(center);
    model.position.y -= normalized.min.y - center.y;
    model.traverse((child) => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; child.userData.modelId = id; } });
    anchor.remove(proxy);
    anchor.add(model);
    meta.occupancy = {
      width: Math.min(100, Math.round(fittedSize.x / meta.dims[0] * 100)),
      depth: Math.min(100, Math.round(fittedSize.z / meta.dims[1] * 100)),
      height: Math.min(100, Math.round(fittedSize.y / meta.dims[2] * 100))
    };
    const axisOccupancy = [
      ["ширина", meta.occupancy.width],
      ["высота", meta.occupancy.height],
      ["глубина", meta.occupancy.depth]
    ];
    const limitingAxis = axisOccupancy.reduce((best, entry) => entry[1] > best[1] ? entry : best, axisOccupancy[0]);
    meta.status = `Hi3D · максимум: ${meta.occupancy.width}% ш / ${meta.occupancy.height}% в / ${meta.occupancy.depth}% гл · ограничитель — ${limitingAxis[0]}`;
    if (selectedModelId === id) selectModel(id);
  }, undefined, () => {
    meta.status = "Размерный прокси";
    if (selectedModelId === id) selectModel(id);
  });
}

function buildCentralMoscow(scene) {
  const stations = [
    { id: "center-01", base: [2.85, 0.28, 2.20], color: 0xffb26f, label: "ГОРОД · МОСКВА-СИТИ" },
    { id: "center-02", base: [3.80, 0.18, 1.22], color: 0xb7df78, label: "ИНФРАСТРУКТУРА · ЗАРЯДЬЕ" },
    { id: "center-03", base: [3.62, 0.20, 1.18], color: 0x89a8ff, label: "ДВИЖЕНИЕ · МОСКВА-2024" }
  ];
  const plinthMaterial = new THREE.MeshStandardMaterial({ color: 0x2a332d, roughness: 0.64, metalness: 0.10 });

  centerEnvelopes.forEach((entry, index) => {
    const meta = physicalModels[entry.id];
    if (!meta) return;
    const station = stations[index];
    const plinth = new THREE.Mesh(new RoundedBoxGeometry(...station.base, 5, 0.07), plinthMaterial);
    plinth.position.set(entry.position[0], station.base[1] / 2, entry.position[2]);
    plinth.rotation.y = entry.rotation;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    scene.add(plinth);

    const underlight = new THREE.Mesh(
      new RoundedBoxGeometry(station.base[0] + 0.05, 0.025, station.base[2] + 0.05, 4, 0.06),
      new THREE.MeshBasicMaterial({ color: station.color, transparent: true, opacity: 0.34 })
    );
    underlight.position.set(entry.position[0], 0.018, entry.position[2]);
    underlight.rotation.y = entry.rotation;
    scene.add(underlight);

    const label = createStationLabel(station.label, String(index + 1).padStart(2, "0"), station.color);
    label.position.set(entry.position[0], station.base[1] + 0.008, entry.position[2] + station.base[2] * 0.36);
    label.rotation.set(-Math.PI / 2, 0, entry.rotation);
    scene.add(label);

    const anchor = new THREE.Group();
    anchor.name = entry.id;
    anchor.position.set(...entry.position);
    anchor.rotation.y = entry.rotation;
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
}

function createStationLabel(title, index, color) {
  const layer = document.createElement("canvas");
  layer.width = 1024;
  layer.height = 160;
  const ctx = layer.getContext("2d");
  ctx.fillStyle = "#111713";
  roundedRect(ctx, 0, 0, layer.width, layer.height, 28);
  ctx.fill();
  ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  ctx.fillRect(34, 34, 8, 92);
  ctx.font = "700 42px 'IBM Plex Mono', Consolas, monospace";
  ctx.fillText(index, 72, 102);
  ctx.fillStyle = "#e5e2da";
  ctx.font = "600 37px Oswald, Arial";
  ctx.fillText(title, 172, 102);
  const texture = new THREE.CanvasTexture(layer);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(1.90, 0.30), new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false }));
}

function drawScreen(zone, phase) {
  const layers = screenCanvases[zone];
  if (!layers?.upper || !layers?.lower || !content[zone].length) return;
  const item = content[zone][state.indices[zone]];
  const accent = zoneColors[zone];
  const frame = screenFrames[zone];
  drawUpperScreen(layers.upper, zone, item, accent, frame, phase);
  drawLowerScreen(layers.lower, zone, item, accent, phase);
  screenTextures[zone].upper.needsUpdate = true;
  screenTextures[zone].lower.needsUpdate = true;
}

function drawUpperScreen(layer, zone, item, accent, frame, phase) {
  const ctx = layer.getContext("2d");
  const { width: w, height: h } = layer;
  ctx.clearRect(0, 0, w, h);
  paintScreenGround(ctx, w, h, accent);

  const hasFrame = state.mode !== "plate" && frame?.complete && frame.naturalWidth;
  const reverse = zone === "transport";
  const heroX = reverse ? w * 0.025 : w * 0.565;
  const heroW = w * 0.41;
  const heroY = h * 0.08;
  const heroH = h * 0.84;
  const drift = Math.sin(phase * 0.16) * w * 0.006;

  if (hasFrame) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.filter = `blur(${Math.max(10, h * 0.035)}px) saturate(.72)`;
    drawImageCover(ctx, frame, -w * 0.03 + drift, -h * 0.08, w * 1.06, h * 1.16);
    ctx.restore();

    ctx.save();
    roundedRect(ctx, heroX, heroY, heroW, heroH, h * 0.055);
    ctx.clip();
    drawImageCover(ctx, frame, heroX, heroY, heroW, heroH);
    const heroShade = ctx.createLinearGradient(heroX, heroY, heroX + heroW, heroY + heroH);
    heroShade.addColorStop(0, "rgba(5,9,8,.03)");
    heroShade.addColorStop(1, "rgba(5,9,8,.48)");
    ctx.fillStyle = heroShade;
    ctx.fillRect(heroX, heroY, heroW, heroH);
    ctx.restore();
    ctx.strokeStyle = "rgba(229,238,232,.18)";
    ctx.lineWidth = Math.max(1, h * 0.004);
    roundedRect(ctx, heroX, heroY, heroW, heroH, h * 0.055);
    ctx.stroke();
  }

  drawScreenPattern(ctx, zone, accent, w, h, phase);

  const textX = reverse ? w * 0.52 : w * 0.055;
  const textW = w * 0.41;
  const safeTop = h * 0.13;
  if (state.mode === "frame") {
    ctx.fillStyle = "rgba(7,12,10,.78)";
    roundedRect(ctx, textX, h * 0.68, textW * 0.76, h * 0.20, h * 0.035);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.font = `700 ${Math.round(h * 0.055)}px 'IBM Plex Mono', Consolas, monospace`;
    ctx.fillText(`${zoneLabels[zone].toUpperCase()} · КАДР 01`, textX + h * 0.06, h * 0.80);
  } else {
    ctx.fillStyle = accent;
    ctx.font = `700 ${Math.round(h * 0.047)}px 'IBM Plex Mono', Consolas, monospace`;
    ctx.fillText(`${exhibitionPeriod}  /  ${zoneLabels[zone].toUpperCase()}`, textX, safeTop);

    const titleGradient = ctx.createLinearGradient(textX, h * 0.25, textX, h * 0.68);
    titleGradient.addColorStop(0, "#f3f0e7");
    titleGradient.addColorStop(1, "#aeb9b3");
    ctx.fillStyle = titleGradient;
    drawFittedWrappedText(ctx, item.title.toUpperCase(), textX, h * 0.32, textW, h * 0.34, Math.round(h * 0.155), Math.round(h * 0.09), 2, "600", "Oswald, Arial");

    const motto = { technology: "точность", construction: "создавать", transport: "движение" }[zone];
    ctx.fillStyle = accent;
    ctx.font = `italic 600 ${Math.round(h * 0.078)}px 'Playfair Display', Georgia, serif`;
    ctx.fillText(motto, textX, h * 0.74);

    ctx.fillStyle = "rgba(218,224,218,.72)";
    ctx.font = `500 ${Math.round(h * 0.047)}px Inter, Arial`;
    const support = shortenWords(item.text, 9);
    drawWrappedLines(ctx, support, textX, h * 0.84, textW, h * 0.063, 2);
  }

  ctx.fillStyle = accent;
  ctx.fillRect(textX, h * 0.93, Math.min(textW * 0.25, h * 0.45), Math.max(3, h * 0.012));
  ctx.fillStyle = "#d9ddd7";
  ctx.font = `600 ${Math.round(h * 0.048)}px 'IBM Plex Mono', Consolas, monospace`;
  ctx.fillText(`${String(state.indices[zone] + 1).padStart(2, "0")} / 14`, textX + Math.min(textW * 0.29, h * 0.54), h * 0.955);
  addScreenGrain(ctx, w, h, accent);
}

function drawLowerScreen(layer, zone, item, accent, phase) {
  const ctx = layer.getContext("2d");
  const { width: w, height: h } = layer;
  ctx.clearRect(0, 0, w, h);
  const gradient = ctx.createLinearGradient(0, 0, w, 0);
  gradient.addColorStop(0, "#07100e");
  gradient.addColorStop(0.5, "#0b1512");
  gradient.addColorStop(1, "#07100e");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, w, Math.max(2, h * 0.045));

  const repeat = Math.max(2, Math.round(w / (h * 8.4)));
  const cellW = w / repeat;
  for (let i = 0; i < repeat; i += 1) {
    const x = i * cellW + h * 0.34;
    ctx.fillStyle = "rgba(205,214,207,.52)";
    ctx.font = `700 ${Math.round(h * 0.18)}px 'IBM Plex Mono', Consolas, monospace`;
    ctx.fillText(`${zoneLabels[zone].toUpperCase()} · ${exhibitionPeriod}`, x, h * 0.35);
    ctx.fillStyle = "#e5e2da";
    ctx.font = `600 ${Math.round(h * 0.29)}px Oswald, Arial`;
    drawFittedSingleLine(ctx, item.title.toUpperCase(), x, h * 0.76, cellW - h * 1.55, Math.round(h * 0.29), Math.round(h * 0.18), "600", "Oswald, Arial");
    ctx.fillStyle = accent;
    ctx.font = `700 ${Math.round(h * 0.24)}px 'IBM Plex Mono', Consolas, monospace`;
    ctx.fillText(String(state.indices[zone] + 1).padStart(2, "0"), (i + 1) * cellW - h * 0.78, h * 0.68);
    ctx.strokeStyle = "rgba(229,238,232,.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo((i + 1) * cellW - h * 0.18, h * 0.20);
    ctx.lineTo((i + 1) * cellW - h * 0.18, h * 0.82);
    ctx.stroke();
  }
  const pulse = (phase * 0.035) % 1;
  ctx.fillStyle = `${accent}aa`;
  ctx.fillRect(pulse * w, h * 0.93, Math.max(h * 0.65, w * 0.015), Math.max(2, h * 0.025));
  addScreenGrain(ctx, w, h, accent, 0.035);
}

function paintScreenGround(ctx, width, height, accent) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#07100e");
  gradient.addColorStop(0.46, "#0c1714");
  gradient.addColorStop(1, "#050706");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  const wash = ctx.createRadialGradient(width * 0.67, height * 0.40, 0, width * 0.67, height * 0.40, width * 0.44);
  wash.addColorStop(0, `${accent}3b`);
  wash.addColorStop(1, `${accent}00`);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height);
}

function drawScreenPattern(ctx, zone, accent, width, height, phase) {
  ctx.save();
  ctx.globalAlpha = state.mode === "frame" ? 0.14 : 0.28;
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1, height * 0.004);
  const count = Math.max(12, Math.round(width / Math.max(height * 0.55, 1)));
  for (let i = 0; i < count; i += 1) {
    const x = (i * height * 0.73 + phase * height * 0.08) % (width + height) - height * 0.5;
    const y = (i * height * 0.31 + phase * height * 0.04) % (height * 1.1) - height * 0.05;
    const unit = height * 0.075;
    if (zone === "technology") {
      ctx.beginPath(); ctx.moveTo(x, y + unit); ctx.lineTo(x + unit * 0.58, y); ctx.lineTo(x + unit * 1.16, y + unit); ctx.closePath(); ctx.stroke();
    } else if (zone === "construction") {
      ctx.strokeRect(x, y, unit, unit);
    } else {
      ctx.beginPath(); ctx.arc(x, y, unit * 0.5, 0, Math.PI * 2); ctx.stroke();
    }
  }
  ctx.restore();
}

function addScreenGrain(ctx, width, height, accent, alpha = 0.05) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const count = Math.min(7000, Math.round(width * height / 120));
  for (let i = 0; i < count; i += 1) {
    const x = (i * 73) % width;
    const y = (i * 151) % height;
    ctx.fillStyle = i % 3 ? "#f3f0e7" : accent;
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.restore();
}

function drawImageCover(ctx, image, x, y, width, height) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawFittedWrappedText(ctx, text, x, y, width, maxHeight, maxSize, minSize, maxLines, weight, family) {
  let size = maxSize;
  let lines = [];
  while (size >= minSize) {
    ctx.font = `${weight} ${size}px ${family}`;
    lines = getWrappedLines(ctx, text, width);
    const lineHeight = size * 1.02;
    if (lines.length <= maxLines && lines.length * lineHeight <= maxHeight) break;
    size -= 2;
  }
  const lineHeight = size * 1.02;
  lines.slice(0, maxLines).forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
}

function drawWrappedLines(ctx, text, x, y, width, lineHeight, maxLines) {
  getWrappedLines(ctx, text, width).slice(0, maxLines).forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
}

function getWrappedLines(ctx, text, width) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const test = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(test).width > width) {
      lines.push(line);
      line = word;
    } else line = test;
  });
  if (line) lines.push(line);
  return lines;
}

function drawFittedSingleLine(ctx, text, x, y, width, maxSize, minSize, weight, family) {
  let size = maxSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= width) break;
    size -= 1;
  }
  let output = text;
  while (ctx.measureText(output).width > width && output.length > 4) output = `${output.slice(0, -2).trim()}…`;
  ctx.fillText(output, x, y);
}

function shortenWords(text, maxWords) {
  const words = text.replace(/[.!?]+$/g, "").split(/\s+/);
  return words.length > maxWords ? `${words.slice(0, maxWords).join(" ")}…` : words.join(" ");
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
  Object.values(modelObjects).forEach((object) => object.scale.setScalar(1));
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
    overview: { position: [4.35, 5.4, 7.8], target: [0, 0.95, -2.0] },
    visitor: { position: [0, 1.65, 7.7], target: [0, 1.28, 1.2] },
    technology: { position: [-1.55, 1.75, -0.4], target: [-4.75, 1.42, -0.4] },
    construction: { position: [0, 3.2, 0.2], target: [0, 1.65, -8.25] },
    transport: { position: [1.55, 1.75, -0.4], target: [4.75, 1.42, -0.4] }
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
