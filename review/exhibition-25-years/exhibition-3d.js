import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

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
const pavilion = {
  width: 13,
  depth: 21,
  height: 4,
  atriumWidth: 19,
  atriumDepth: 28,
  atriumHeight: 8,
  screenX: 6.45,
  screenFrontZ: 10.35,
  screenCornerZ: -9.20,
  screenBackZ: -10.30,
  screenBackHalf: 5.35
};
const showRawHi3DCandidates = new URLSearchParams(window.location.search).get("quality") === "raw";

const content = Object.fromEntries(zones.map((zone) => [zone, allItems.filter((item) => item.zone === zone)]));
const metricGroups = window.EXHIBIT_METRICS || {};
const programTopics = zones.map((zone) => ({ zone, ...(metricGroups[zone] || {}) }));
const state = {
  zone: "technology",
  programIndex: 0,
  programPlaying: true,
  indices: { technology: 0, construction: 0, transport: 0 },
  mode: "film",
  walking: false,
  camera: "overview",
  reviews: loadReviews()
};

const physicalModels = Object.fromEntries(exhibitCatalog.map((item) => [item.id, {
  ...item,
  title: item.objectTitle,
  placement: item.zone === "technology" ? "левая ниша" : item.zone === "transport" ? "правая ниша" : "торцевая ниша"
}]));
// Kept empty so the retired Moscow-centre builder remains inert during cache transitions.
const centerEnvelopes = [];
const cubeProposal = (window.CENTER_PROPOSAL || [])[0];
if (cubeProposal) physicalModels["media-cube"] = {
  ...cubeProposal,
  id: "media-cube",
  title: cubeProposal.objectTitle,
  placement: cubeProposal.placement,
  status: "3 видеограни · ребро 1,50 м · единая синхронная программа"
};

const gltfLoader = new GLTFLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

const screenCanvases = {};
const screenTextures = {};
const screenMaterials = {};
const clickTargets = [];
const modelObjects = {};
let selectedModelId = "media-cube";
let programPhase = 0;
let programAdvance = 0;
const programDwell = 12;
let lastProgramMetricKey = "";
let cameraMotion = null;
const activeMoves = new Set();
const screenFrames = {};
const screenVideos = {};
const cubeFaceCanvases = {};
const cubeFaceTextures = {};
zones.forEach((zone) => {
  const image = new Image();
  image.src = `./assets/frames/${zone}-anchor.webp`;
  image.onload = () => drawProgramScreen(performance.now() / 1000);
  screenFrames[zone] = image;

  const video = document.createElement("video");
  video.src = `./assets/video/${zone}-h3-panorama.mp4`;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "auto";
  video.addEventListener("loadeddata", () => {
    syncProgramPlayback();
    drawProgramScreen(performance.now() / 1000);
  });
  screenVideos[zone] = video;
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
  renderer.toneMappingExposure = 0.68;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xaebfc7);
  scene.fog = new THREE.FogExp2(0xb9c9cf, 0.0075);
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.035).texture;
  pmremGenerator.dispose();

  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 80);
  camera.position.set(0, 4.25, 12.4);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.target.set(0, 1.78, -2.35);
  controls.minDistance = 2.2;
  controls.maxDistance = 44;
  controls.maxPolarAngle = Math.PI * 0.49;

  addExhibitionLighting(scene);

  buildAtriumShell(scene);
  buildPavilion(scene);
  addNicheLighting(scene);
  buildPhysicalModels(scene);
  buildMediaCube(scene);
  buildFeatureIslands(scene);
  addSuspendedHeroModels(scene);
  addVisitorFigures(scene);

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
  updateProgramUi();
  selectModel(selectedModelId);
  resize();
  window.addEventListener("resize", resize);

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) state.programPlaying = false;
  syncProgramPlayback();
  updateProgramPlaybackUi();
  let programLastTick = performance.now();
  window.setInterval(() => {
    const now = performance.now();
    const programDelta = Math.max(0, (now - programLastTick) / 1000);
    programLastTick = now;
    if (!state.programPlaying) return;
    programPhase += programDelta;
    programAdvance += programDelta;
    if (programAdvance >= programDwell) stepProgram(1);
    else drawProgramScreen(programPhase);
  }, 80);
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const delta = Math.min(clock.getDelta(), 0.05);
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
    camera.fov = camera.aspect < 0.82 ? 56 : camera.aspect < 1.10 ? 48 : 42;
    camera.updateProjectionMatrix();
  }
}

function addExhibitionLighting(scene) {
  scene.add(new THREE.HemisphereLight(0xf0f7fa, 0x56666c, 0.78));

  const key = new THREE.DirectionalLight(0xffefd8, 1.18);
  key.position.set(-3.5, 13.5, 9.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -16;
  key.shadow.camera.right = 16;
  key.shadow.camera.top = 18;
  key.shadow.camera.bottom = -18;
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

  addSpot([0, 7.25, 0.45], [0, 1.95, 0.15], 34, 0xffe5c3, 0.48);
  addSpot([-4.4, 6.9, 3.8], [-2.8, 1.45, 3.2], 18, 0xc7e8f3, 0.34);
  addSpot([4.4, 6.9, 3.8], [2.8, 1.45, 3.2], 18, 0xffe4bd, 0.34);
  addSpot([-3.4, 6.7, -4.8], [-4.5, 1.15, -4.8], 15, 0xcce9f1, 0.32);
  addSpot([3.4, 6.7, -4.8], [4.5, 1.15, -4.8], 15, 0xffe8c9, 0.32);

  const technologyWash = new THREE.PointLight(0x52d5d7, 2.8, 14, 2);
  technologyWash.position.set(-5.5, 2.4, -2.2);
  scene.add(technologyWash);
  const transportWash = new THREE.PointLight(0x89a8ff, 2.8, 14, 2);
  transportWash.position.set(5.5, 2.4, -2.2);
  scene.add(transportWash);

  [
    [-0.88, 0.34, 0.72, 0x52d5d7],
    [0.88, 0.34, 0.72, 0xb7df78],
    [0, 0.34, -0.42, 0x89a8ff]
  ].forEach(([x, y, z, color]) => {
    const glow = new THREE.PointLight(color, 2.6, 4.8, 2);
    glow.position.set(x, y, z);
    scene.add(glow);
  });
}

function buildAtriumShell(scene) {
  const steel = new THREE.MeshStandardMaterial({ color: 0x89989e, roughness: 0.34, metalness: 0.62, envMapIntensity: 0.72 });
  const white = new THREE.MeshPhysicalMaterial({ color: 0xd9ddda, roughness: 0.34, metalness: 0.10, clearcoat: 0.24, clearcoatRoughness: 0.30, envMapIntensity: 0.72 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x7ba4b6, roughness: 0.12, metalness: 0.02, transmission: 0.18, transparent: true, opacity: 0.27, depthWrite: false, side: THREE.DoubleSide });
  const ceilingY = pavilion.atriumHeight;
  const halfW = pavilion.atriumWidth / 2;
  const halfD = pavilion.atriumDepth / 2;

  const addMullion = (x, z, height = ceilingY) => addBox(scene, [0.07, height, 0.07], [x, height / 2, z], steel);
  for (let z = -halfD; z <= halfD + 0.01; z += 2) {
    addMullion(-halfW, z);
    addMullion(halfW, z);
    addBox(scene, [pavilion.atriumWidth, 0.07, 0.07], [0, ceilingY, z], steel);
    addBox(scene, [pavilion.atriumWidth, 0.035, 0.035], [0, ceilingY - 0.32, z], white);
  }
  for (let x = -halfW; x <= halfW + 0.01; x += 1.9) {
    addMullion(x, -halfD);
    addBox(scene, [0.07, 0.07, pavilion.atriumDepth], [x, ceilingY, 0], steel);
  }

  const sideGlass = new THREE.Mesh(new THREE.PlaneGeometry(pavilion.atriumDepth, ceilingY), glass);
  sideGlass.rotation.y = Math.PI / 2;
  sideGlass.position.set(-halfW, ceilingY / 2, 0);
  scene.add(sideGlass);
  const sideGlassRight = sideGlass.clone();
  sideGlassRight.position.x = halfW;
  scene.add(sideGlassRight);
  const rearGlass = new THREE.Mesh(new THREE.PlaneGeometry(pavilion.atriumWidth, ceilingY), glass);
  rearGlass.position.set(0, ceilingY / 2, -halfD);
  scene.add(rearGlass);

  const trackMaterial = new THREE.MeshStandardMaterial({ color: 0x8f999c, roughness: 0.32, metalness: 0.70 });
  const lampMaterial = new THREE.MeshBasicMaterial({ color: 0xfff0d4, toneMapped: false });
  [-5.7, 5.7].forEach((x) => {
    addBox(scene, [0.09, 0.09, pavilion.atriumDepth - 1.5], [x, ceilingY - 0.42, 0], trackMaterial);
    for (let z = -11.5; z <= 11.5; z += 1.55) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 8), lampMaterial);
      lamp.position.set(x, ceilingY - 0.51, z);
      scene.add(lamp);
    }
  });

  for (let z = -12; z <= 12; z += 4) {
    const left = [-halfW + 0.4, ceilingY - 0.15, z];
    const right = [halfW - 0.4, ceilingY - 0.15, z];
    scene.add(cylinderBetween(left, right, 0.035, steel));
    scene.add(cylinderBetween([-halfW + 0.4, ceilingY - 0.15, z], [0, ceilingY - 0.85, z], 0.028, steel));
    scene.add(cylinderBetween([halfW - 0.4, ceilingY - 0.15, z], [0, ceilingY - 0.85, z], 0.028, steel));
  }
}

function addNicheLighting(scene) {
  const warm = 0xffe8c5;
  const ledMaterial = new THREE.MeshBasicMaterial({ color: warm, transparent: true, opacity: 0.88, toneMapped: false });
  const accentMaterials = {
    technology: new THREE.MeshBasicMaterial({ color: zoneColors.technology, transparent: true, opacity: 0.72, toneMapped: false }),
    construction: new THREE.MeshBasicMaterial({ color: zoneColors.construction, transparent: true, opacity: 0.72, toneMapped: false }),
    transport: new THREE.MeshBasicMaterial({ color: zoneColors.transport, transparent: true, opacity: 0.72, toneMapped: false })
  };

  addBox(scene, [0.035, 0.045, 20.15], [-5.80, 1.465, 0.18], ledMaterial);
  addBox(scene, [0.035, 0.045, 20.15], [5.80, 1.465, 0.18], ledMaterial);
  addBox(scene, [12.0, 0.045, 0.035], [0, 1.465, -9.67], ledMaterial);
  addBox(scene, [0.035, 0.025, 20.15], [-5.78, 0.595, 0.18], accentMaterials.technology);
  addBox(scene, [0.035, 0.025, 20.15], [5.78, 0.595, 0.18], accentMaterials.transport);
  addBox(scene, [12.0, 0.025, 0.035], [0, 0.595, -9.65], accentMaterials.construction);

  const addNicheSpot = (position, targetPosition, color = warm) => {
    const target = new THREE.Object3D();
    target.position.set(...targetPosition);
    scene.add(target);
    const light = new THREE.SpotLight(color, 13, 1.65, 0.72, 0.78, 1.5);
    light.position.set(...position);
    light.target = target;
    light.castShadow = false;
    scene.add(light);
  };

  for (let i = 0; i < 8; i += 1) {
    const z = THREE.MathUtils.lerp(-8.75, 8.75, i / 7);
    addNicheSpot([-5.48, 1.40, z], [-6.02, 0.91, z]);
    addNicheSpot([5.48, 1.40, z], [6.02, 0.91, z]);
    const x = THREE.MathUtils.lerp(-5.15, 5.15, i / 7);
    addNicheSpot([x, 1.40, -9.35], [x, 0.91, -9.95]);
  }
}

function buildPavilion(scene) {
  const floorMaterial = new THREE.MeshPhysicalMaterial({ color: 0xb8c1c2, roughness: 0.34, metalness: 0.10, clearcoat: 0.22, clearcoatRoughness: 0.30, envMapIntensity: 0.72 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(pavilion.atriumWidth - 0.8, pavilion.atriumDepth - 0.8), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = 0;
  floor.receiveShadow = true;
  scene.add(floor);

  const wallMaterial = new THREE.MeshPhysicalMaterial({ color: 0xc5ceca, roughness: 0.40, metalness: 0.08, clearcoat: 0.18, envMapIntensity: 0.68 });
  addBox(scene, [0.36, pavilion.height, pavilion.depth + 0.6], [-6.68, 2, 0], wallMaterial);
  addBox(scene, [0.36, pavilion.height, pavilion.depth + 0.6], [6.68, 2, 0], wallMaterial);
  addBox(scene, [pavilion.width + 0.1, pavilion.height, 0.36], [0, 2, -10.48], wallMaterial);

  addSeamlessMediaWalls(scene);

  const shelfMaterial = new THREE.MeshPhysicalMaterial({ color: 0xd9ded9, roughness: 0.34, metalness: 0.10, clearcoat: 0.20, clearcoatRoughness: 0.28, envMapIntensity: 0.72 });
  addBox(scene, [0.72, 0.10, 20.55], [-6.02, 0.54, 0.12], shelfMaterial);
  addBox(scene, [0.72, 0.10, 20.55], [6.02, 0.54, 0.12], shelfMaterial);
  addBox(scene, [12.25, 0.10, 0.72], [0, 0.54, -9.94], shelfMaterial);

  addDimension(scene, [-7.05, 0, 10.25], [-7.05, 4, 10.25], "4 м");
  addDimension(scene, [-6.5, 0.02, 11.15], [6.5, 0.02, 11.15], "13 м");
}

function addSeamlessMediaWalls(scene) {
  const path = [];
  const add = (x, z) => path.push({ x, z });
  add(-pavilion.screenX, pavilion.screenFrontZ);
  add(-pavilion.screenX, pavilion.screenCornerZ);
  for (let i = 1; i <= 8; i += 1) {
    const a = Math.PI + (Math.PI / 2) * (i / 8);
    add(-pavilion.screenBackHalf + Math.cos(a) * 1.10, pavilion.screenCornerZ + Math.sin(a) * 1.10);
  }
  add(pavilion.screenBackHalf, pavilion.screenBackZ);
  for (let i = 1; i <= 8; i += 1) {
    const a = -Math.PI / 2 + (Math.PI / 2) * (i / 8);
    add(pavilion.screenBackHalf + Math.cos(a) * 1.10, pavilion.screenCornerZ + Math.sin(a) * 1.10);
  }
  add(pavilion.screenX, pavilion.screenFrontZ);

  const segments = [];
  let totalLength = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    segments.push({ a, b, start: totalLength, length, index: i });
    totalLength += length;
  }

  createScreenLayers(totalLength);

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

  const buildStrip = (y0, y1, material) => {
    const positions = [];
    const uvs = [];
    const indices = [];
    let vertex = 0;
    segments.forEach((segment) => {
      const offsetA = pathOffsets[segment.index];
      const offsetB = pathOffsets[segment.index + 1];
      const u0 = segment.start / totalLength;
      const u1 = (segment.start + segment.length) / totalLength;
      positions.push(
        segment.a.x + offsetA.x, y0, segment.a.z + offsetA.y,
        segment.b.x + offsetB.x, y0, segment.b.z + offsetB.y,
        segment.b.x + offsetB.x, y1, segment.b.z + offsetB.y,
        segment.a.x + offsetA.x, y1, segment.a.z + offsetA.y
      );
      uvs.push(u0, 0, u1, 0, u1, 1, u0, 1);
      indices.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3);
      vertex += 4;
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    scene.add(new THREE.Mesh(geometry, material));
  };

  buildStrip(0, 0.5, screenMaterials.lower);
  buildStrip(1.5, 4, screenMaterials.upper);
  const niche = new THREE.MeshPhysicalMaterial({ color: 0xc5ceca, roughness: 0.46, metalness: 0.06, clearcoat: 0.10, envMapIntensity: 0.62 });
  buildStrip(0.5, 1.5, niche);

  const portalMaterial = new THREE.MeshPhysicalMaterial({ color: 0xdce0dc, roughness: 0.30, metalness: 0.08, clearcoat: 0.24, envMapIntensity: 0.76 });
  const portalGlow = new THREE.MeshBasicMaterial({ color: 0xe9fbff, transparent: true, opacity: 0.86, toneMapped: false });
  const curve = new THREE.CurvePath();
  for (let i = 0; i < path.length - 1; i += 1) {
    curve.add(new THREE.LineCurve3(new THREE.Vector3(path[i].x, 4.08, path[i].z), new THREE.Vector3(path[i + 1].x, 4.08, path[i + 1].z)));
  }
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 320, 0.105, 10, false), portalMaterial));
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 320, 0.026, 8, false), portalGlow));
  [path[0], path[path.length - 1]].forEach((point) => {
    const post = new THREE.Mesh(new RoundedBoxGeometry(0.25, 4.14, 0.25, 6, 0.11), portalMaterial);
    post.position.set(point.x, 2.04, point.z);
    scene.add(post);
  });
}

function createScreenLayers(lengthMeters) {
  [
    ["upper", 2.5, 190],
    ["lower", 0.5, 210]
  ].forEach(([band, heightMeters, pixelsPerMeter]) => {
    const layer = document.createElement("canvas");
    layer.width = Math.min(8192, Math.max(4096, Math.round(lengthMeters * pixelsPerMeter)));
    layer.height = Math.max(112, Math.round(layer.width * heightMeters / lengthMeters));
    screenCanvases[band] = layer;
    const texture = new THREE.CanvasTexture(layer);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    screenTextures[band] = texture;
    screenMaterials[band] = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  });
  drawProgramScreen(0);
}

function buildPhysicalModels(scene) {
  Object.entries(physicalModels).forEach(([id, meta]) => {
    if (id === "media-cube") return;
    const t = meta.index / 13;
    const slot = meta.zone === "technology"
      ? { position: [-5.88, 0.58, THREE.MathUtils.lerp(-8.88, 8.88, t)], rotation: [0, Math.PI / 2, 0] }
      : meta.zone === "transport"
        ? { position: [5.88, 0.58, THREE.MathUtils.lerp(-8.88, 8.88, t)], rotation: [0, -Math.PI / 2, 0] }
        : { position: [THREE.MathUtils.lerp(-5.70, 5.70, t), 0.58, -9.80], rotation: [0, 0, 0] };
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
    if (showRawHi3DCandidates) {
      loadHi3D(id, meta, anchor, proxy);
    } else {
      meta.status = "Параметрический выставочный макет · очищенная форма по реальному прототипу";
    }
  });
}

function createProxy(meta) {
  const group = new THREE.Group();
  const kind = meta.kind;
  const isShip = ["ship", "iceShip", "icebreaker", "hydrofoil"].includes(kind);
  const isRail = ["doubleTrain", "locomotive", "fastTrain", "bus"].includes(kind);
  const isAir = ["airliner", "rocket", "spacecraft", "helicopter"].includes(kind);
  const primary = meta.zone === "transport"
    ? isShip ? 0xc9434b : isRail ? 0x2e75b7 : isAir ? 0xe4e8e5 : 0x315c83
    : meta.zone === "construction"
      ? 0xb7aa87
      : kind === "robot" ? 0xf2a51a : 0xb9c8c7;
  const secondary = meta.zone === "transport"
    ? isShip ? 0xf1f1eb : isRail ? 0xe9ece8 : 0x2a6092
    : meta.zone === "construction" ? 0xd8d2c2 : 0x2b638d;
  const body = new THREE.MeshPhysicalMaterial({ color: primary, roughness: 0.30, metalness: 0.22, clearcoat: 0.30, clearcoatRoughness: 0.24, envMapIntensity: 0.84 });
  const dark = new THREE.MeshStandardMaterial({ color: meta.zone === "transport" ? 0x172c42 : 0x29353a, roughness: 0.42, metalness: 0.48, envMapIntensity: 0.74 });
  const pale = new THREE.MeshPhysicalMaterial({ color: secondary, roughness: 0.34, metalness: 0.12, clearcoat: 0.20, clearcoatRoughness: 0.26, envMapIntensity: 0.76 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x17486c, roughness: 0.10, metalness: 0.10, clearcoat: 0.46, transparent: true, opacity: 0.76, envMapIntensity: 0.92 });

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

function applyMuseumFinish(model, meta, id) {
  const finish = id === "center-01"
    ? { primary: 0xd9ddd8, secondary: 0xaeb9b4, accent: 0xffb26f }
    : id === "center-02"
      ? { primary: 0xd7d3c8, secondary: 0x7d8780, accent: 0xb7df78 }
      : id === "center-03"
        ? { primary: 0xe1e5e2, secondary: 0x526a82, accent: 0x89a8ff }
        : meta.zone === "technology"
          ? { primary: 0xc9d8d4, secondary: 0x607d79, accent: 0x52d5d7 }
          : meta.zone === "construction"
            ? { primary: 0xd8d4c7, secondary: 0x7f8775, accent: 0xb7df78 }
            : { primary: 0xd6dce4, secondary: 0x65758b, accent: 0x89a8ff };

  const makeMaterial = (color, metalness, roughness, clearcoat = 0.18) => new THREE.MeshPhysicalMaterial({
    color,
    metalness,
    roughness,
    clearcoat,
    clearcoatRoughness: 0.32,
    envMapIntensity: 0.82,
    side: THREE.FrontSide
  });
  const materials = [
    makeMaterial(finish.primary, 0.08, 0.34, 0.24),
    makeMaterial(finish.secondary, 0.18, 0.30, 0.16),
    makeMaterial(finish.accent, 0.12, 0.28, 0.22)
  ];

  let meshIndex = 0;
  model.traverse((child) => {
    if (!child.isMesh) return;
    if (child.geometry?.attributes?.position && !child.geometry.morphAttributes?.position?.length) {
      child.geometry.computeVertexNormals();
    }
    const materialIndex = meshIndex > 0 && meshIndex % 7 === 0 ? 2 : meshIndex % 3 === 0 ? 1 : 0;
    child.material = materials[materialIndex];
    child.castShadow = true;
    child.receiveShadow = true;
    child.userData.modelId = id;
    meshIndex += 1;
  });
  model.userData.finish = "museum-maquette-v1";
}

function loadHi3D(id, meta, anchor, proxy) {
  gltfLoader.load(`./assets/models/hitem/${id}.glb`, (gltf) => {
    const model = gltf.scene;
    applyMuseumFinish(model, meta, id);
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
    meta.status = `Hi3D · музейная отделка · максимум: ${meta.occupancy.width}% ш / ${meta.occupancy.height}% в / ${meta.occupancy.depth}% гл · ограничитель — ${limitingAxis[0]}`;
    if (selectedModelId === id) selectModel(id);
  }, undefined, () => {
    meta.status = "Размерный прокси";
    if (selectedModelId === id) selectModel(id);
  });
}

function buildMediaCube(scene) {
  const id = "media-cube";
  const meta = physicalModels[id];
  if (!meta) return;

  const group = new THREE.Group();
  group.name = id;
  group.position.set(0, 0, -0.35);
  group.userData.modelId = id;

  const graphite = new THREE.MeshPhysicalMaterial({ color: 0xe2e4e0, roughness: 0.29, metalness: 0.12, clearcoat: 0.30, clearcoatRoughness: 0.24, envMapIntensity: 0.78 });
  const blackMetal = new THREE.MeshStandardMaterial({ color: 0x070b09, roughness: 0.28, metalness: 0.78, envMapIntensity: 0.9 });
  const base = meshOf(new RoundedBoxGeometry(3.05, 0.22, 2.72, 8, 0.11), graphite, [0, 0.11, 0]);
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const underlight = new THREE.Mesh(
    new RoundedBoxGeometry(3.18, 0.045, 2.85, 8, 0.12),
    new THREE.MeshBasicMaterial({ color: 0xc9f5ff, transparent: true, opacity: 0.92, toneMapped: false })
  );
  underlight.position.y = 0.026;
  group.add(underlight);

  const inset = meshOf(new RoundedBoxGeometry(1.86, 0.085, 1.62, 7, 0.08), blackMetal, [0, 0.255, 0]);
  inset.receiveShadow = true;
  group.add(inset);

  const post = meshOf(new THREE.CylinderGeometry(0.13, 0.21, 0.62, 32), blackMetal, [0, 0.58, 0]);
  post.castShadow = true;
  group.add(post);
  const collar = meshOf(new THREE.CylinderGeometry(0.25, 0.25, 0.08, 32), graphite, [0, 0.88, 0]);
  group.add(collar);

  zones.forEach((zone) => {
    const layer = document.createElement("canvas");
    layer.width = 1024;
    layer.height = 1024;
    cubeFaceCanvases[zone] = layer;
    const texture = new THREE.CanvasTexture(layer);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    cubeFaceTextures[zone] = texture;
  });
  drawCubeFaces();
  const videoMaterial = (zone) => new THREE.MeshBasicMaterial({ map: cubeFaceTextures[zone], toneMapped: false });
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), [
    videoMaterial("technology"), videoMaterial("construction"),
    videoMaterial("transport"), videoMaterial("technology"),
    videoMaterial("construction"), videoMaterial("transport")
  ]);
  const bottomVertex = 0.96;
  cube.position.y = bottomVertex + Math.sqrt(3) * 0.75;
  cube.quaternion.setFromUnitVectors(new THREE.Vector3(1, 1, 1).normalize(), new THREE.Vector3(0, 1, 0));
  cube.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), Math.PI * 0.14);
  cube.castShadow = true;
  cube.userData.modelId = id;
  group.add(cube);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.5, 1.5, 1.5), 12),
    new THREE.LineBasicMaterial({ color: 0xe4e9e2, transparent: true, opacity: 0.78, toneMapped: false })
  );
  edges.position.copy(cube.position);
  edges.quaternion.copy(cube.quaternion);
  edges.scale.setScalar(1.006);
  edges.userData.modelId = id;
  group.add(edges);

  group.traverse((child) => { child.userData.modelId = id; });
  scene.add(group);
  modelObjects[id] = group;
  clickTargets.push(group);
}

function buildFeatureIslands(scene) {
  const plinth = new THREE.MeshPhysicalMaterial({ color: 0xf0f1ee, roughness: 0.25, metalness: 0.12, clearcoat: 0.42, clearcoatRoughness: 0.22, envMapIntensity: 1.05 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xe7fbff, transparent: true, opacity: 0.88, toneMapped: false });
  const tabletGlass = new THREE.MeshPhysicalMaterial({ color: 0x143f62, roughness: 0.14, metalness: 0.18, clearcoat: 0.46, envMapIntensity: 1.0 });
  const islandSpecs = [
    { position: [-3.45, 0, 2.35], model: "technology-02", rotation: 0.28, accent: zoneColors.technology },
    { position: [3.45, 0, 2.35], model: "transport-11", rotation: -0.20, accent: zoneColors.transport }
  ];

  islandSpecs.forEach((spec) => {
    const group = new THREE.Group();
    group.position.set(...spec.position);
    const base = meshOf(new RoundedBoxGeometry(2.75, 0.22, 1.48, 8, 0.13), plinth, [0, 0.11, 0]);
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);
    group.add(meshOf(new RoundedBoxGeometry(2.84, 0.035, 1.57, 8, 0.14), glow, [0, 0.025, 0]));

    const meta = physicalModels[spec.model];
    if (meta) {
      const model = createProxy(meta);
      model.scale.multiplyScalar(1.48);
      model.position.set(-0.18, 0.24, 0);
      model.rotation.y = spec.rotation;
      group.add(model);
    }

    const tablet = new THREE.Group();
    tablet.position.set(0.94, 0.48, 0.34);
    tablet.rotation.set(-0.42, -0.22, 0);
    tablet.add(meshOf(new RoundedBoxGeometry(0.48, 0.035, 0.34, 5, 0.045), tabletGlass, [0, 0, 0]));
    group.add(tablet);
    scene.add(group);
  });
}

function addSuspendedHeroModels(scene) {
  const white = new THREE.MeshPhysicalMaterial({ color: 0xf2f3f0, roughness: 0.23, metalness: 0.18, clearcoat: 0.34, envMapIntensity: 1.0 });
  const blue = new THREE.MeshPhysicalMaterial({ color: 0x18589b, roughness: 0.26, metalness: 0.34, clearcoat: 0.28, envMapIntensity: 0.95 });
  const red = new THREE.MeshPhysicalMaterial({ color: 0xcf3340, roughness: 0.28, metalness: 0.24, clearcoat: 0.30, envMapIntensity: 0.92 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x20313b, roughness: 0.32, metalness: 0.54 });
  const cable = new THREE.MeshStandardMaterial({ color: 0x7a8589, roughness: 0.38, metalness: 0.66 });

  const satellite = new THREE.Group();
  satellite.position.set(-3.85, 5.75, 0.45);
  satellite.rotation.set(0.10, -0.24, -0.10);
  satellite.add(meshOf(new THREE.CylinderGeometry(0.28, 0.33, 0.72, 28), white, [0, 0, 0], [0, 0, Math.PI / 2]));
  satellite.add(meshOf(new THREE.CylinderGeometry(0.16, 0.22, 0.30, 24), dark, [0.46, 0, 0], [0, 0, Math.PI / 2]));
  [-1, 1].forEach((side) => {
    const panel = meshOf(new RoundedBoxGeometry(1.28, 0.06, 0.70, 3, 0.035), blue, [side * 1.00, 0, 0]);
    satellite.add(panel);
    for (let i = -2; i <= 2; i += 1) satellite.add(meshOf(new THREE.BoxGeometry(0.012, 0.065, 0.68), white, [side * (1.00 + i * 0.12), 0.035, 0]));
  });
  scene.add(satellite);
  scene.add(cylinderBetween([-4.35, pavilion.atriumHeight - 0.10, 0.45], [-4.35, 6.02, 0.45], 0.008, cable));
  scene.add(cylinderBetween([-3.35, pavilion.atriumHeight - 0.10, 0.45], [-3.35, 6.02, 0.45], 0.008, cable));

  const plane = new THREE.Group();
  plane.position.set(4.0, 5.9, -1.0);
  plane.rotation.set(0.02, -0.34, -0.05);
  plane.add(meshOf(new THREE.CylinderGeometry(0.18, 0.20, 2.1, 28), white, [0, 0, 0], [0, 0, Math.PI / 2]));
  plane.add(meshOf(new THREE.ConeGeometry(0.19, 0.55, 28), white, [1.30, 0, 0], [0, 0, -Math.PI / 2]));
  plane.add(meshOf(new THREE.BoxGeometry(0.55, 0.055, 2.45), blue, [0.0, 0, 0]));
  plane.add(meshOf(new THREE.BoxGeometry(0.45, 0.045, 0.92), blue, [-0.86, 0.08, 0]));
  plane.add(meshOf(new THREE.BoxGeometry(0.14, 0.70, 0.055), blue, [-0.91, 0.26, 0]));
  [-1, 1].forEach((side) => {
    plane.add(meshOf(new THREE.BoxGeometry(1.34, 0.025, 0.018), red, [0.13, -0.05, side * 0.195]));
    for (let i = 0; i < 7; i += 1) plane.add(meshOf(new RoundedBoxGeometry(0.09, 0.055, 0.016, 2, 0.012), dark, [-0.52 + i * 0.20, 0.075, side * 0.202]));
  });
  scene.add(plane);
  scene.add(cylinderBetween([3.15, pavilion.atriumHeight - 0.10, -1.0], [3.15, 6.15, -1.0], 0.008, cable));
  scene.add(cylinderBetween([4.85, pavilion.atriumHeight - 0.10, -1.0], [4.85, 6.15, -1.0], 0.008, cable));
}

function addVisitorFigures(scene) {
  const skin = new THREE.MeshStandardMaterial({ color: 0xd1aa91, roughness: 0.68, metalness: 0 });
  const palette = [0x263746, 0xc5b59f, 0x617481, 0xd7d8d2, 0x425263, 0xb8a48d];
  const placements = [
    [-2.3, 2.8, 0.04], [-1.45, 1.95, -0.10], [2.25, 1.2, 0.18],
    [3.2, -3.2, -0.16], [-3.35, -4.15, 0.24], [1.25, -6.15, -0.06]
  ];
  placements.forEach(([x, z, rotation], index) => {
    const cloth = new THREE.MeshStandardMaterial({ color: palette[index % palette.length], roughness: 0.62, metalness: 0.02 });
    const figure = new THREE.Group();
    figure.position.set(x, 0, z);
    figure.rotation.y = rotation;
    figure.add(meshOf(new THREE.SphereGeometry(0.105, 18, 12), skin, [0, 1.66, 0]));
    const torso = meshOf(new THREE.CylinderGeometry(0.18, 0.24, 0.72, 18), cloth, [0, 1.18, 0]);
    figure.add(torso);
    [-0.10, 0.10].forEach((legX) => figure.add(meshOf(new THREE.CylinderGeometry(0.055, 0.065, 0.78, 14), cloth, [legX, 0.48, 0])));
    [-1, 1].forEach((side) => {
      const arm = meshOf(new THREE.CylinderGeometry(0.045, 0.05, 0.64, 14), cloth, [side * 0.22, 1.14, 0], [0, 0, side * 0.14]);
      figure.add(arm);
    });
    figure.scale.setScalar(0.96 + (index % 3) * 0.035);
    figure.traverse((child) => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
    scene.add(figure);
  });

  const planter = new THREE.MeshPhysicalMaterial({ color: 0xf0f1ee, roughness: 0.28, metalness: 0.08, clearcoat: 0.24 });
  const trunk = new THREE.MeshStandardMaterial({ color: 0x765e45, roughness: 0.86 });
  const leaf = new THREE.MeshStandardMaterial({ color: 0x3d714f, roughness: 0.72 });
  [-8.0, 8.0].forEach((x) => {
    const plant = new THREE.Group();
    plant.position.set(x, 0, 8.4);
    plant.add(meshOf(new RoundedBoxGeometry(0.78, 0.88, 0.78, 5, 0.08), planter, [0, 0.44, 0]));
    plant.add(meshOf(new THREE.CylinderGeometry(0.055, 0.08, 1.22, 12), trunk, [0, 1.42, 0]));
    for (let i = 0; i < 9; i += 1) {
      const angle = i * Math.PI * 2 / 9;
      const crown = meshOf(new THREE.SphereGeometry(0.34, 16, 12), leaf, [Math.cos(angle) * 0.25, 2.0 + (i % 3) * 0.16, Math.sin(angle) * 0.25]);
      crown.scale.set(1.15, 0.82, 1.15);
      plant.add(crown);
    }
    scene.add(plant);
  });
}

function drawCubeFaces() {
  zones.forEach((zone, index) => {
    const layer = cubeFaceCanvases[zone];
    if (!layer) return;
    const ctx = layer.getContext("2d");
    const video = screenVideos[zone];
    const frame = screenFrames[zone];
    const media = video?.readyState >= 2 && video.videoWidth ? video : frame;
    ctx.clearRect(0, 0, layer.width, layer.height);
    paintScreenGround(ctx, layer.width, layer.height, zoneColors[zone]);
    const viewport = { x: 48, y: 176, width: 928, height: 522 };
    ctx.fillStyle = "rgba(2,18,48,.84)";
    roundedRect(ctx, viewport.x, viewport.y, viewport.width, viewport.height, 22);
    ctx.fill();
    ctx.save();
    roundedRect(ctx, viewport.x, viewport.y, viewport.width, viewport.height, 22);
    ctx.clip();
    if (getMediaWidth(media)) drawImageCoverPan(ctx, media, viewport.x, viewport.y, viewport.width, viewport.height, Math.sin(programPhase * 0.10 + index) * 0.08, 0);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const wash = ctx.createLinearGradient(viewport.x, viewport.y, viewport.x + viewport.width, viewport.y + viewport.height);
    wash.addColorStop(0, "rgba(0,88,220,.34)");
    wash.addColorStop(0.55, hexToRgba(zoneColors[zone], 0.24));
    wash.addColorStop(1, "rgba(0,52,150,.42)");
    ctx.fillStyle = wash;
    ctx.fillRect(viewport.x, viewport.y, viewport.width, viewport.height);
    ctx.restore();
    ctx.save();
    ctx.translate(viewport.x, viewport.y);
    drawLivingScreenBackground(ctx, viewport.width, viewport.height, zoneColors[zone], programPhase + index, zone, true);
    ctx.restore();
    ctx.restore();
    ctx.strokeStyle = "rgba(236,248,255,.72)";
    ctx.lineWidth = 5;
    roundedRect(ctx, viewport.x, viewport.y, viewport.width, viewport.height, 22);
    ctx.stroke();
    const shade = ctx.createLinearGradient(0, 0, 0, layer.height);
    shade.addColorStop(0, "rgba(3,8,7,.05)");
    shade.addColorStop(0.72, "rgba(3,8,7,.04)");
    shade.addColorStop(1, "rgba(2,21,58,.58)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, layer.width, layer.height);
    ctx.fillStyle = "#f3f0e7";
    ctx.font = "700 60px Oswald, Arial";
    ctx.fillText(zoneLabels[zone].toUpperCase(), 52, 105);
    ctx.fillStyle = zoneColors[zone];
    ctx.font = "700 32px 'IBM Plex Mono', Consolas, monospace";
    ctx.fillText(exhibitionPeriod, 52, 148);
    ctx.fillRect(52, 770, 142 + index * 34, 9);
    ctx.font = "700 34px 'IBM Plex Mono', Consolas, monospace";
    ctx.fillText(`ГРАНЬ 0${index + 1}  /  СИНХРОННЫЙ ЭФИР`, 52, 836);
    ctx.fillStyle = "#f3f0e7";
    ctx.font = "600 58px Oswald, Arial";
    ctx.fillText("25 ЛЕТ ДОСТИЖЕНИЙ", 52, 922);
    cubeFaceTextures[zone].needsUpdate = true;
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
    const maquette = createCenterMaquette(entry.id, meta);
    maquette.userData.modelId = entry.id;
    anchor.add(maquette);
    scene.add(anchor);
    modelObjects[entry.id] = anchor;
    anchor.traverse((child) => { child.userData.modelId = entry.id; });
    clickTargets.push(anchor);
    if (showRawHi3DCandidates) {
      loadHi3D(entry.id, meta, anchor, maquette);
    } else {
      meta.status = "Параметрический выставочный макет · очищенная форма по прототипу";
    }
  });
}

function createCenterMaquette(id, meta) {
  const group = new THREE.Group();
  const ivory = new THREE.MeshPhysicalMaterial({ color: 0xe2e3dd, roughness: 0.30, metalness: 0.08, clearcoat: 0.22, clearcoatRoughness: 0.28, envMapIntensity: 0.78 });
  const silver = new THREE.MeshPhysicalMaterial({ color: 0xaab6ba, roughness: 0.27, metalness: 0.26, clearcoat: 0.18, envMapIntensity: 0.84 });
  const graphite = new THREE.MeshPhysicalMaterial({ color: 0x263036, roughness: 0.34, metalness: 0.32, envMapIntensity: 0.72 });
  const blue = new THREE.MeshPhysicalMaterial({ color: 0x466b91, roughness: 0.28, metalness: 0.18, clearcoat: 0.26, envMapIntensity: 0.82 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x172b3a, roughness: 0.12, metalness: 0.22, clearcoat: 0.42, envMapIntensity: 1.0 });

  if (id === "center-01") {
    group.add(meshOf(new RoundedBoxGeometry(1.88, 0.06, 1.32, 4, 0.05), graphite, [0, 0.03, 0]));
    const towers = [
      [-0.56, -0.26, 0.24, 0.28, 0.88, -0.08],
      [-0.28, 0.27, 0.22, 0.24, 1.18, 0.04],
      [0.03, -0.08, 0.28, 0.30, 1.55, -0.03],
      [0.34, 0.23, 0.24, 0.25, 1.02, 0.08],
      [0.62, -0.20, 0.20, 0.23, 0.74, -0.10],
      [-0.70, 0.30, 0.18, 0.20, 0.60, 0.10]
    ];
    towers.forEach(([x, z, w, d, h, rotation], index) => {
      const tower = meshOf(new RoundedBoxGeometry(w, h, d, 4, Math.min(w, d) * 0.14), index % 2 ? silver : ivory, [x, h / 2 + 0.06, z], [0, rotation, 0]);
      group.add(tower);
      if (index === 2) group.add(meshOf(new THREE.ConeGeometry(0.035, 0.28, 18), silver, [x, h + 0.20, z]));
    });
  } else if (id === "center-02") {
    const points = [
      new THREE.Vector3(-1.52, 0.18, -0.24),
      new THREE.Vector3(-0.58, 0.18, -0.06),
      new THREE.Vector3(0.30, 0.18, 0.20),
      new THREE.Vector3(1.55, 0.18, 0.30)
    ];
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const length = Math.hypot(dx, dz);
      const segment = new THREE.Group();
      segment.position.set((a.x + b.x) / 2, a.y, (a.z + b.z) / 2);
      segment.rotation.y = -Math.atan2(dz, dx);
      segment.add(meshOf(new RoundedBoxGeometry(length + 0.03, 0.10, 0.42, 4, 0.04), ivory, [0, 0, 0]));
      segment.add(meshOf(new THREE.BoxGeometry(length, 0.045, 0.035), silver, [0, 0.095, -0.18]));
      segment.add(meshOf(new THREE.BoxGeometry(length, 0.045, 0.035), silver, [0, 0.095, 0.18]));
      group.add(segment);
    }
    [-0.72, 0.62].forEach((x) => group.add(meshOf(new THREE.CylinderGeometry(0.055, 0.075, 0.18, 20), graphite, [x, 0.09, 0.02])));
  } else {
    group.add(meshOf(new RoundedBoxGeometry(2.84, 0.46, 0.56, 8, 0.10), ivory, [0, 0.32, 0]));
    group.add(meshOf(new RoundedBoxGeometry(2.64, 0.08, 0.49, 6, 0.05), silver, [0, 0.58, 0]));
    group.add(meshOf(new THREE.BoxGeometry(2.46, 0.12, 0.43), graphite, [0, 0.12, 0]));
    [-0.98, 0.98].forEach((x) => [-1, 1].forEach((z) => group.add(meshOf(new THREE.CylinderGeometry(0.105, 0.105, 0.055, 24), graphite, [x, 0.09, z * 0.235], [Math.PI / 2, 0, 0]))));
    [-1, 1].forEach((side) => {
      const z = side * 0.286;
      [-1.02, -0.67, -0.31, 0.31, 0.67, 1.02].forEach((x) => group.add(meshOf(new RoundedBoxGeometry(0.25, 0.17, 0.018, 3, 0.025), glass, [x, 0.39, z])));
      [-0.49, 0.49].forEach((x) => group.add(meshOf(new RoundedBoxGeometry(0.30, 0.34, 0.020, 3, 0.025), blue, [x, 0.31, z])));
      group.add(meshOf(new THREE.BoxGeometry(2.60, 0.035, 0.022), blue, [0, 0.22, z + side * 0.004]));
    });
    group.add(meshOf(new RoundedBoxGeometry(0.02, 0.22, 0.32, 3, 0.03), glass, [1.425, 0.39, 0]));
    group.add(meshOf(new RoundedBoxGeometry(0.02, 0.22, 0.32, 3, 0.03), glass, [-1.425, 0.39, 0]));
  }

  fitToEnvelope(group, meta.dims);
  group.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    child.userData.modelId = id;
  });
  return group;
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

function drawProgramScreen(phase) {
  const upper = screenCanvases.upper;
  const lower = screenCanvases.lower;
  if (!upper || !lower) return;
  const topic = programTopics[state.programIndex] || programTopics[0];
  const zone = topic.zone;
  const accent = zoneColors[zone];
  const video = screenVideos[zone];
  const frame = screenFrames[zone];
  const media = video?.readyState >= 2 && video.videoWidth ? video : frame;
  const metricWindow = getProgramMetricWindow(topic, phase);

  drawUnifiedUpper(upper, topic, accent, media, phase, metricWindow);
  drawUnifiedLower(lower, topic, accent, phase, metricWindow);
  updateProgramMetricUi(topic, metricWindow);
  drawCubeFaces();
  screenTextures.upper.needsUpdate = true;
  screenTextures.lower.needsUpdate = true;
}

function getProgramMetricWindow(topic, phase) {
  const metrics = topic.metrics || [];
  const pageCount = Math.max(1, Math.ceil(metrics.length / 3));
  const pageDuration = programDwell / pageCount;
  const normalizedPhase = ((phase % programDwell) + programDwell) % programDwell;
  const page = Math.min(pageCount - 1, Math.floor(normalizedPhase / pageDuration));
  return {
    metrics: metrics.slice(page * 3, page * 3 + 3),
    page,
    pageCount,
    pageDuration,
    localProgress: (normalizedPhase % pageDuration) / pageDuration
  };
}

function drawUnifiedUpper(layer, topic, accent, media, phase, metricWindow) {
  const ctx = layer.getContext("2d");
  const { width: w, height: h } = layer;
  ctx.clearRect(0, 0, w, h);
  const ground = ctx.createLinearGradient(0, 0, w, h);
  ground.addColorStop(0, "#03275b");
  ground.addColorStop(0.46, "#075f9f");
  ground.addColorStop(1, "#031f57");
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, w, h);

  if (getMediaWidth(media)) {
    ctx.save();
    ctx.globalAlpha = 0.68;
    drawImageCoverPan(ctx, media, 0, 0, w, h, Math.sin(phase * 0.12) * 0.10, Math.cos(phase * 0.09) * 0.035);
    ctx.restore();
  }

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const blueWash = ctx.createLinearGradient(0, 0, w, h);
  blueWash.addColorStop(0, "rgba(0,118,255,.34)");
  blueWash.addColorStop(0.48, hexToRgba(accent, 0.20));
  blueWash.addColorStop(1, "rgba(0,58,168,.42)");
  ctx.fillStyle = blueWash;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  const shade = ctx.createLinearGradient(0, 0, 0, h);
  shade.addColorStop(0, "rgba(2,22,55,.18)");
  shade.addColorStop(0.55, "rgba(2,30,68,.20)");
  shade.addColorStop(1, "rgba(1,18,46,.72)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);

  drawLivingScreenBackground(ctx, w, h, accent, phase, topic.zone);

  ctx.fillStyle = "rgba(239,248,255,.96)";
  ctx.font = `600 ${Math.round(h * 0.078)}px Oswald, Arial`;
  ctx.fillText(`${(topic.title || zoneLabels[topic.zone]).toUpperCase()} РОССИИ`, w * 0.045, h * 0.115);
  ctx.fillStyle = accent;
  ctx.font = `700 ${Math.round(h * 0.040)}px 'IBM Plex Mono', Consolas, monospace`;
  ctx.fillText(`${exhibitionPeriod}  ·  ДОСТИЖЕНИЯ ЗА 25 ЛЕТ`, w * 0.045, h * 0.175);
  ctx.fillStyle = "rgba(235,247,255,.72)";
  ctx.textAlign = "right";
  ctx.fillText(`ТАКТ ${metricWindow.page + 1} / ${metricWindow.pageCount}`, w * 0.955, h * 0.145);
  ctx.textAlign = "left";

  const pulse = 0.72 + Math.sin(phase * 0.72) * 0.10;
  const transition = Math.min(1, metricWindow.localProgress * 5, (1 - metricWindow.localProgress) * 5);
  const displayedMetrics = topic.metrics || metricWindow.metrics;
  displayedMetrics.forEach((metric, index) => {
    const fraction = 0.017 + index * 0.108;
    const x = w * fraction;
    const cardW = w * 0.097;
    const cardY = h * (0.22 + (1 - transition) * 0.025);
    const cardH = h * 0.62;
    const metricNumber = index + 1;
    ctx.save();
    ctx.globalAlpha = 0.78 + transition * 0.16 + Math.sin(phase * 0.55 + index * 0.64) * 0.035;
    roundedRect(ctx, x, cardY, cardW, cardH, h * 0.026);
    const cardGround = ctx.createLinearGradient(x, cardY, x + cardW, cardY + cardH);
    cardGround.addColorStop(0, "rgba(4,61,125,.80)");
    cardGround.addColorStop(0.54, "rgba(6,103,163,.67)");
    cardGround.addColorStop(1, "rgba(3,38,96,.82)");
    ctx.fillStyle = cardGround;
    ctx.fill();
    ctx.strokeStyle = `rgba(211,241,255,${0.42 + pulse * 0.16})`;
    ctx.lineWidth = Math.max(2, h * 0.0035);
    ctx.stroke();

    ctx.save();
    roundedRect(ctx, x, cardY, cardW, cardH, h * 0.026);
    ctx.clip();
    const sweepX = x - h * 0.25 + ((phase * 0.13 + index * 0.31) % 1.25) * (cardW + h * 0.50);
    const sweep = ctx.createLinearGradient(sweepX - h * 0.18, 0, sweepX + h * 0.18, 0);
    sweep.addColorStop(0, "rgba(255,255,255,0)");
    sweep.addColorStop(0.5, "rgba(219,249,255,.20)");
    sweep.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sweep;
    ctx.fillRect(x, cardY, cardW, cardH);
    ctx.restore();

    const inset = h * 0.045;
    ctx.fillStyle = "rgba(228,247,255,.82)";
    ctx.font = `700 ${Math.round(h * 0.027)}px 'IBM Plex Mono', Consolas, monospace`;
    ctx.fillText(`${String(metricNumber).padStart(2, "0")} / ${String(displayedMetrics.length).padStart(2, "0")}`, x + inset, cardY + h * 0.07);
    drawMetricGlyph(ctx, topic.zone, x + cardW - inset * 1.05, cardY + h * 0.066, h * 0.052, accent, phase + index * 0.8);
    ctx.fillStyle = "#f1f8fb";
    drawFittedWrappedText(ctx, metric.value, x + inset, cardY + h * 0.15, cardW - inset * 2, h * 0.13, Math.round(h * 0.098), Math.round(h * 0.047), 1, "600", "Oswald, Arial");
    ctx.fillStyle = "rgba(241,249,252,.97)";
    drawFittedWrappedText(ctx, metric.label.toUpperCase(), x + inset, cardY + h * 0.32, cardW - inset * 2, h * 0.16, Math.round(h * 0.044), Math.round(h * 0.027), 3, "700", "Inter, Arial");
    ctx.fillStyle = "rgba(220,238,246,.78)";
    ctx.font = `500 ${Math.round(h * 0.027)}px Inter, Arial`;
    drawWrappedLines(ctx, metric.detail || exhibitionPeriod, x + inset, cardY + h * 0.51, cardW - inset * 2, h * 0.034, 3);
    ctx.fillStyle = "rgba(255,255,255,.20)";
    ctx.fillRect(x + inset, cardY + cardH - h * 0.045, cardW - inset * 2, Math.max(3, h * 0.008));
    ctx.fillStyle = accent;
    ctx.fillRect(x + inset, cardY + cardH - h * 0.045, (cardW - inset * 2) * ((programAdvance % programDwell) / programDwell), Math.max(3, h * 0.008));
    ctx.restore();
  });
  addScreenGrain(ctx, w, h, accent, 0.024);
}

function drawUnifiedLower(layer, topic, accent, phase, metricWindow) {
  const ctx = layer.getContext("2d");
  const { width: w, height: h } = layer;
  ctx.clearRect(0, 0, w, h);
  const glow = ctx.createLinearGradient(0, 0, w, 0);
  glow.addColorStop(0, "#032e69");
  glow.addColorStop(0.48, "#087bb7");
  glow.addColorStop(1, "#03275f");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  drawLivingScreenBackground(ctx, w, h, accent, phase * 1.35, topic.zone, true);
  ctx.fillStyle = "rgba(231,249,255,.72)";
  ctx.fillRect(0, 0, w, Math.max(4, h * 0.025));

  metricWindow.metrics.forEach((metric, index) => {
    const x0 = index * w / 3;
    const inset = h * 0.18;
    if (index) {
      ctx.fillStyle = "rgba(232,248,255,.28)";
      ctx.fillRect(x0, h * 0.20, 2, h * 0.62);
    }
    ctx.fillStyle = "#eefaff";
    ctx.font = `500 ${Math.round(h * 0.35)}px Oswald, Arial`;
    ctx.fillText(metric.value, x0 + inset, h * 0.52);
    ctx.fillStyle = "rgba(238,249,253,.92)";
    ctx.font = `700 ${Math.round(h * 0.125)}px Inter, Arial`;
    drawWrappedLines(ctx, metric.label.toUpperCase(), x0 + inset, h * 0.72, w / 3 - inset * 2, h * 0.15, 2);
    ctx.fillStyle = "rgba(218,240,248,.72)";
    ctx.font = `500 ${Math.round(h * 0.092)}px 'IBM Plex Mono', Consolas, monospace`;
    const metricNumber = metricWindow.page * 3 + index + 1;
    ctx.fillText(`${String(metricNumber).padStart(2, "0")} / ${String((topic.metrics || []).length).padStart(2, "0")}  ·  ${metric.detail || exhibitionPeriod}`, x0 + inset, h * 0.92);
  });
  ctx.globalAlpha = 0.08 + Math.sin(phase * 0.9) * 0.025;
  ctx.fillStyle = "#dffaff";
  ctx.fillRect((phase * 96) % w, 0, Math.max(8, w * 0.002), h);
  ctx.globalAlpha = 1;
}

function drawLivingScreenBackground(ctx, width, height, accent, phase, zone, compact = false) {
  ctx.save();
  const horizon = compact ? height * 0.68 : height * 0.78;
  const step = compact ? height * 0.34 : height * 0.15;
  ctx.globalAlpha = compact ? 0.20 : 0.26;
  for (let x = -step; x < width + step; x += step) {
    const seed = Math.abs(Math.sin(x * 0.0037 + zone.length * 1.7));
    const buildingH = height * (compact ? 0.20 : 0.13 + seed * 0.17);
    ctx.fillStyle = x % (step * 2) < step ? "rgba(160,224,255,.52)" : hexToRgba(accent, 0.42);
    ctx.fillRect(x, horizon - buildingH, step * 0.64, buildingH);
  }

  ctx.lineWidth = Math.max(1.5, height * 0.006);
  for (let lane = 0; lane < 3; lane += 1) {
    const y = height * (0.72 + lane * 0.085);
    const offset = ((phase * (42 + lane * 18)) % (width * 0.22));
    const trail = ctx.createLinearGradient(0, 0, width, 0);
    trail.addColorStop(0, "rgba(105,231,255,.10)");
    trail.addColorStop(0.5, lane === 1 ? hexToRgba(accent, 0.82) : "rgba(139,222,255,.64)");
    trail.addColorStop(1, "rgba(105,231,255,.10)");
    ctx.strokeStyle = trail;
    ctx.beginPath();
    ctx.moveTo(-width * 0.05 + offset, y);
    ctx.bezierCurveTo(width * 0.28, y - height * (0.12 + lane * 0.025), width * 0.62, y + height * 0.08, width * 1.05 + offset, y - height * 0.04);
    ctx.stroke();
  }

  if (!compact) {
    ctx.globalAlpha = 0.34;
    ctx.strokeStyle = "rgba(184,239,255,.72)";
    ctx.lineWidth = Math.max(1, height * 0.003);
    const nodeCount = 18;
    const nodes = [];
    for (let i = 0; i < nodeCount; i += 1) {
      const x = width * (i / (nodeCount - 1));
      const y = height * (0.13 + 0.07 * Math.sin(i * 1.37 + phase * 0.28));
      nodes.push([x, y]);
    }
    ctx.beginPath();
    nodes.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.stroke();
    nodes.forEach(([x, y], index) => {
      const radius = height * (0.006 + 0.003 * Math.sin(phase * 1.2 + index));
      ctx.fillStyle = index % 3 ? "rgba(218,249,255,.82)" : accent;
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
    });
  }
  ctx.restore();
}

function drawMetricGlyph(ctx, zone, x, y, size, accent, phase) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "rgba(224,248,255,.86)";
  ctx.fillStyle = hexToRgba(accent, 0.82);
  ctx.lineWidth = Math.max(2, size * 0.07);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (zone === "technology") {
    ctx.beginPath(); ctx.arc(0, 0, size * 0.20, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, size * 0.52, size * 0.22, phase * 0.22, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(Math.cos(phase) * size * 0.42, Math.sin(phase) * size * 0.18, size * 0.08, 0, Math.PI * 2); ctx.fill();
  } else if (zone === "construction") {
    [0.34, 0.62, 0.46].forEach((height, index) => ctx.strokeRect(-size * 0.48 + index * size * 0.34, size * (0.32 - height), size * 0.25, size * height));
    ctx.beginPath(); ctx.moveTo(-size * 0.56, size * 0.34); ctx.lineTo(size * 0.54, size * 0.34); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(-size * 0.52, size * 0.18); ctx.bezierCurveTo(-size * 0.12, -size * 0.35, size * 0.18, size * 0.30, size * 0.52, -size * 0.20); ctx.stroke();
    const t = (phase * 0.18) % 1;
    ctx.beginPath(); ctx.arc(-size * 0.52 + t * size * 1.04, Math.sin(t * Math.PI * 2) * size * 0.12, size * 0.09, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawScreen(zone, phase) {
  const layers = screenCanvases[zone];
  if (!layers?.upper || !layers?.lower || !content[zone].length) return;
  const item = content[zone][state.indices[zone]];
  const accent = zoneColors[zone];
  const frame = screenFrames[zone];
  const video = screenVideos[zone];
  if (state.mode === "film") drawUpperFilmScreen(layers.upper, zone, item, accent, video, frame);
  else drawUpperScreen(layers.upper, zone, item, accent, frame, phase);
  drawLowerScreen(layers.lower, zone, item, accent, phase);
  screenTextures[zone].upper.needsUpdate = true;
  screenTextures[zone].lower.needsUpdate = true;
}

function drawUpperFilmScreen(layer, zone, item, accent, video, frame) {
  const ctx = layer.getContext("2d");
  const { width: w, height: h } = layer;
  ctx.clearRect(0, 0, w, h);
  paintScreenGround(ctx, w, h, accent);

  const media = video?.readyState >= 2 && video.videoWidth ? video : frame;
  if (getMediaWidth(media)) drawImageCover(ctx, media, 0, 0, w, h);

  const shade = ctx.createLinearGradient(0, 0, w, 0);
  shade.addColorStop(0, "rgba(3,7,7,.36)");
  shade.addColorStop(0.32, "rgba(3,7,7,.10)");
  shade.addColorStop(0.72, "rgba(3,7,7,.08)");
  shade.addColorStop(1, "rgba(3,7,7,.38)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);

  const safeZones = {
    technology: { x: 0.365, width: 0.27, align: "center" },
    construction: { x: 0.34, width: 0.32, align: "center" },
    transport: { x: 0.69, width: 0.265, align: "left" }
  };
  const safe = safeZones[zone];
  const textX = w * safe.x;
  const textW = w * safe.width;
  const centered = safe.align === "center";
  const anchorX = centered ? textX + textW / 2 : textX;

  ctx.save();
  roundedRect(ctx, textX - h * 0.08, h * 0.13, textW + h * 0.16, h * 0.73, h * 0.055);
  ctx.fillStyle = "rgba(4,9,9,.58)";
  ctx.fill();
  ctx.strokeStyle = "rgba(235,241,235,.16)";
  ctx.lineWidth = Math.max(1, h * 0.0035);
  ctx.stroke();
  ctx.textAlign = centered ? "center" : "left";

  ctx.fillStyle = accent;
  ctx.font = `700 ${Math.round(h * 0.046)}px 'IBM Plex Mono', Consolas, monospace`;
  ctx.fillText(`${exhibitionPeriod}  /  ${zoneLabels[zone].toUpperCase()}`, anchorX, h * 0.25);

  const titleGradient = ctx.createLinearGradient(textX, h * 0.32, textX, h * 0.64);
  titleGradient.addColorStop(0, "#f7f3ea");
  titleGradient.addColorStop(1, "#c4ccc6");
  ctx.fillStyle = titleGradient;
  drawFittedWrappedText(
    ctx,
    item.title.toUpperCase(),
    anchorX,
    h * 0.39,
    textW,
    h * 0.27,
    Math.round(h * 0.145),
    Math.round(h * 0.082),
    2,
    "600",
    "Oswald, Arial"
  );

  ctx.fillStyle = "rgba(226,232,226,.80)";
  ctx.font = `500 ${Math.round(h * 0.045)}px Inter, Arial`;
  drawWrappedLines(ctx, shortenWords(item.text, 10), anchorX, h * 0.72, textW, h * 0.058, 2);

  const ruleW = Math.min(textW * 0.32, h * 0.54);
  const ruleX = centered ? anchorX - ruleW / 2 : anchorX;
  ctx.fillStyle = accent;
  ctx.fillRect(ruleX, h * 0.80, ruleW, Math.max(3, h * 0.010));
  ctx.fillStyle = "#eef0e9";
  ctx.font = `600 ${Math.round(h * 0.044)}px 'IBM Plex Mono', Consolas, monospace`;
  ctx.fillText(`${String(state.indices[zone] + 1).padStart(2, "0")} / 14`, anchorX, h * 0.89);
  ctx.restore();

  addScreenGrain(ctx, w, h, accent, 0.025);
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

  const exhibit = exhibitCatalog.find((entry) => entry.id === item.id);
  if (!hasFrame && exhibit) {
    const fieldGradient = ctx.createLinearGradient(heroX, heroY, heroX + heroW, heroY + heroH);
    fieldGradient.addColorStop(0, `${accent}12`);
    fieldGradient.addColorStop(0.62, "rgba(7,14,12,.18)");
    fieldGradient.addColorStop(1, `${accent}08`);
    ctx.fillStyle = fieldGradient;
    roundedRect(ctx, heroX, heroY, heroW, heroH, h * 0.055);
    ctx.fill();
    ctx.strokeStyle = `${accent}44`;
    ctx.lineWidth = Math.max(1, h * 0.004);
    roundedRect(ctx, heroX, heroY, heroW, heroH, h * 0.055);
    ctx.stroke();

    ctx.save();
    ctx.globalAlpha = 0.98;
    drawObjectAction(
      ctx,
      exhibit.kind,
      heroX + heroW * 0.50,
      heroY + heroH * 0.43,
      heroW * 0.58,
      heroH * 0.48,
      phase + exhibit.index * 0.41,
      accent
    );
    ctx.restore();

    ctx.fillStyle = `${accent}cc`;
    ctx.font = `700 ${Math.round(h * 0.046)}px 'IBM Plex Mono', Consolas, monospace`;
    ctx.fillText(
      `${String(exhibit.index + 1).padStart(2, "0")} · ${getObjectActionLabel(exhibit.kind)}`,
      heroX + heroW * 0.08,
      heroY + heroH * 0.76
    );
    ctx.fillStyle = "rgba(229,235,228,.84)";
    drawFittedWrappedText(
      ctx,
      exhibit.objectTitle.toUpperCase(),
      heroX + heroW * 0.08,
      heroY + heroH * 0.84,
      heroW * 0.84,
      heroH * 0.12,
      Math.round(h * 0.058),
      Math.round(h * 0.038),
      1,
      "600",
      "Oswald, Arial"
    );
  }

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

  const spatialOrder = exhibitCatalog
    .filter((entry) => entry.zone === zone)
    .sort((a, b) => a.index - b.index);
  if (zone === "technology") spatialOrder.reverse();
  const cellW = w / Math.max(spatialOrder.length, 1);
  spatialOrder.forEach((exhibit, displayIndex) => {
    const x = displayIndex * cellW;
    const selected = exhibit.id === item.id;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, 0, cellW, h);
    ctx.clip();

    if (selected) {
      const selectedWash = ctx.createLinearGradient(x, 0, x + cellW, h);
      selectedWash.addColorStop(0, `${accent}24`);
      selectedWash.addColorStop(1, `${accent}08`);
      ctx.fillStyle = selectedWash;
      ctx.fillRect(x, 0, cellW, h);
      ctx.fillStyle = accent;
      ctx.fillRect(x, 0, Math.max(2, h * 0.025), h);
    }

    const inset = Math.max(5, h * 0.09);
    const iconW = Math.min(cellW * 0.34, h * 0.58);
    drawObjectAction(ctx, exhibit.kind, x + inset + iconW * 0.5, h * 0.47, iconW, h * 0.50, phase + exhibit.index * 0.41, accent);

    const textX = x + inset + iconW + h * 0.07;
    const textW = Math.max(cellW - (textX - x) - inset, cellW * 0.36);
    ctx.fillStyle = selected ? accent : "rgba(205,214,207,.58)";
    ctx.font = `700 ${Math.round(h * 0.105)}px 'IBM Plex Mono', Consolas, monospace`;
    ctx.fillText(`${String(exhibit.index + 1).padStart(2, "0")} · ${getObjectActionLabel(exhibit.kind)}`, textX, h * 0.29);
    ctx.fillStyle = "#dfe4dc";
    drawFittedWrappedText(ctx, exhibit.objectTitle.toUpperCase(), textX, h * 0.49, textW, h * 0.39, Math.round(h * 0.17), Math.round(h * 0.095), 2, "600", "Oswald, Arial");

    ctx.strokeStyle = selected ? `${accent}88` : "rgba(229,238,232,.12)";
    ctx.lineWidth = selected ? Math.max(1, h * 0.012) : 1;
    ctx.beginPath();
    ctx.moveTo(x + cellW - 1, h * 0.16);
    ctx.lineTo(x + cellW - 1, h * 0.84);
    ctx.stroke();
    ctx.restore();
  });

  const pulse = (phase * 0.055) % 1;
  for (let i = 0; i < spatialOrder.length; i += 1) {
    const cellX = i * cellW;
    ctx.fillStyle = `${accent}${i % 2 ? "72" : "a8"}`;
    ctx.fillRect(cellX + pulse * Math.max(cellW - h * 0.38, 0), h * 0.92, h * 0.38, Math.max(2, h * 0.026));
  }
  addScreenGrain(ctx, w, h, accent, 0.035);
}

function getObjectActionLabel(kind) {
  if (["doubleTrain", "locomotive", "fastTrain", "car", "autocar", "bus", "combine", "rover"].includes(kind)) return "ДВИЖЕНИЕ";
  if (["ship", "iceShip", "icebreaker", "hydrofoil"].includes(kind)) return "МАРШРУТ";
  if (["rocket", "airliner", "helicopter", "drone", "spacecraft"].includes(kind)) return "ПОЛЁТ";
  if (["satellite", "earthSatellite"].includes(kind)) return "ОРБИТА";
  if (["bridge", "highway", "railway", "pipeline", "utilities", "port"].includes(kind)) return "ПОТОК";
  if (["airport", "hospital", "school", "technopark", "district", "social", "stadium", "cosmodrome"].includes(kind)) return "СБОРКА";
  if (kind === "robot") return "МАНИПУЛЯЦИЯ";
  if (["server", "terminal", "aiCore"].includes(kind)) return "ДАННЫЕ";
  if (["reactor", "quantum", "biotech", "coin", "materials"].includes(kind)) return "ПРОЦЕСС";
  return "В РАБОТЕ";
}

function drawObjectAction(ctx, kind, centerX, centerY, width, height, phase, accent) {
  const oscillation = Math.sin(phase * 1.65);
  const travel = (phase * 0.19) % 1;
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = accent;
  ctx.fillStyle = "rgba(223,228,220,.86)";
  ctx.lineWidth = Math.max(1.5, height * 0.035);

  if (["doubleTrain", "locomotive", "fastTrain", "car", "autocar", "bus", "combine", "rover"].includes(kind)) {
    const shift = oscillation * width * 0.055;
    roundedRect(ctx, -width * 0.38 + shift, -height * 0.19, width * 0.72, height * 0.31, height * 0.08);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.fillRect(-width * 0.25 + shift, -height * 0.12, width * 0.34, height * 0.08);
    ctx.beginPath(); ctx.arc(-width * 0.23 + shift, height * 0.14, height * 0.075, 0, Math.PI * 2); ctx.arc(width * 0.21 + shift, height * 0.14, height * 0.075, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.45;
    for (let i = 0; i < 3; i += 1) { ctx.beginPath(); ctx.moveTo(-width * (0.48 + i * 0.12), -height * (0.08 - i * 0.06)); ctx.lineTo(-width * (0.36 + i * 0.12), -height * (0.08 - i * 0.06)); ctx.stroke(); }
  } else if (["ship", "iceShip", "icebreaker", "hydrofoil"].includes(kind)) {
    ctx.translate(0, oscillation * height * 0.035);
    ctx.beginPath(); ctx.moveTo(-width * 0.42, -height * 0.02); ctx.lineTo(width * 0.38, -height * 0.02); ctx.lineTo(width * 0.24, height * 0.18); ctx.lineTo(-width * 0.28, height * 0.18); ctx.closePath(); ctx.fill();
    ctx.fillStyle = accent; ctx.fillRect(-width * 0.12, -height * 0.20, width * 0.28, height * 0.16);
    ctx.globalAlpha = 0.55;
    for (let i = 0; i < 2; i += 1) { const y = height * (0.25 + i * 0.12); ctx.beginPath(); ctx.moveTo(-width * 0.46 + travel * width * 0.12, y); ctx.quadraticCurveTo(0, y - height * 0.08, width * 0.46, y); ctx.stroke(); }
  } else if (["rocket", "spacecraft"].includes(kind)) {
    const lift = Math.sin(phase * 1.2) * height * 0.06;
    ctx.translate(0, lift);
    ctx.fillRect(-width * 0.08, -height * 0.34, width * 0.16, height * 0.48);
    ctx.beginPath(); ctx.moveTo(-width * 0.08, -height * 0.34); ctx.lineTo(0, -height * 0.49); ctx.lineTo(width * 0.08, -height * 0.34); ctx.closePath(); ctx.fill();
    ctx.fillStyle = accent; ctx.beginPath(); ctx.moveTo(-width * 0.07, height * 0.15); ctx.lineTo(0, height * (0.42 + travel * 0.08)); ctx.lineTo(width * 0.07, height * 0.15); ctx.closePath(); ctx.fill();
  } else if (["airliner", "helicopter", "drone"].includes(kind)) {
    const shift = oscillation * width * 0.05;
    ctx.translate(shift, 0);
    ctx.beginPath(); ctx.moveTo(-width * 0.42, 0); ctx.lineTo(width * 0.38, -height * 0.08); ctx.lineTo(width * 0.45, 0); ctx.lineTo(width * 0.10, height * 0.07); ctx.lineTo(width * 0.02, height * 0.28); ctx.lineTo(-width * 0.08, height * 0.27); ctx.lineTo(-width * 0.12, height * 0.08); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.45; ctx.beginPath(); ctx.moveTo(-width * 0.48, height * 0.28); ctx.lineTo(width * 0.30, height * 0.28); ctx.stroke();
  } else if (["satellite", "earthSatellite", "reactor", "quantum", "aiCore", "biotech", "coin"].includes(kind)) {
    const radius = Math.min(width, height) * 0.24;
    ctx.globalAlpha = 0.92;
    ctx.beginPath(); ctx.arc(0, 0, radius * (1 + oscillation * 0.06), 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.48;
    ctx.beginPath(); ctx.ellipse(0, 0, radius * 1.65, radius * 0.62, phase * 0.28, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(Math.cos(phase) * radius * 1.3, Math.sin(phase) * radius * 0.48, radius * 0.18, 0, Math.PI * 2); ctx.fill();
  } else if (kind === "robot") {
    const a = -0.8 + oscillation * 0.28;
    const b = 0.65 + Math.sin(phase * 1.3) * 0.25;
    const p1 = [Math.cos(a) * width * 0.24, -Math.sin(a) * height * 0.24];
    const p2 = [p1[0] + Math.cos(a + b) * width * 0.22, p1[1] - Math.sin(a + b) * height * 0.22];
    ctx.beginPath(); ctx.moveTo(-width * 0.28, height * 0.30); ctx.lineTo(0, 0); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
    [[-width * 0.28, height * 0.30],[0,0],p1,p2].forEach(([x,y])=>{ctx.beginPath();ctx.arc(x,y,height*0.07,0,Math.PI*2);ctx.fill();});
  } else if (["bridge", "highway", "railway", "pipeline", "utilities", "port"].includes(kind)) {
    ctx.beginPath(); ctx.moveTo(-width * 0.44, height * 0.18); ctx.bezierCurveTo(-width * 0.15, -height * 0.20, width * 0.18, height * 0.25, width * 0.44, -height * 0.12); ctx.stroke();
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(-width * 0.44 + travel * width * 0.88, Math.sin(travel * Math.PI * 2) * height * 0.10, height * 0.075, 0, Math.PI * 2); ctx.fill();
  } else if (["airport", "hospital", "school", "technopark", "district", "social", "stadium", "cosmodrome"].includes(kind)) {
    const heights = [0.38, 0.72, 0.52, 0.88];
    heights.forEach((value, index) => {
      const reveal = Math.max(0.15, Math.min(1, travel * 1.7 - index * 0.16));
      const bh = height * value * reveal;
      ctx.fillStyle = index === 2 ? accent : "rgba(223,228,220,.86)";
      ctx.fillRect(-width * 0.40 + index * width * 0.21, height * 0.34 - bh, width * 0.15, bh);
    });
  } else if (["server", "terminal", "materials"].includes(kind)) {
    ctx.strokeRect(-width * 0.34, -height * 0.34, width * 0.68, height * 0.68);
    for (let i = 0; i < 4; i += 1) {
      ctx.fillStyle = i === Math.floor(travel * 4) ? accent : "rgba(223,228,220,.72)";
      ctx.fillRect(-width * 0.24, -height * 0.23 + i * height * 0.15, width * 0.48, height * 0.055);
    }
  } else {
    ctx.beginPath(); ctx.arc(0, 0, Math.min(width, height) * 0.25, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
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
  const mediaWidth = getMediaWidth(image);
  const mediaHeight = getMediaHeight(image);
  if (!mediaWidth || !mediaHeight) return;
  const scale = Math.max(width / mediaWidth, height / mediaHeight);
  const drawWidth = mediaWidth * scale;
  const drawHeight = mediaHeight * scale;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawImageCoverPan(ctx, image, x, y, width, height, panX = 0, panY = 0) {
  const mediaWidth = getMediaWidth(image);
  const mediaHeight = getMediaHeight(image);
  if (!mediaWidth || !mediaHeight) return;
  const overscan = 1.12;
  const scale = Math.max(width / mediaWidth, height / mediaHeight) * overscan;
  const drawWidth = mediaWidth * scale;
  const drawHeight = mediaHeight * scale;
  const travelX = Math.max(0, drawWidth - width);
  const travelY = Math.max(0, drawHeight - height);
  const offsetX = (width - drawWidth) / 2 + travelX * panX;
  const offsetY = (height - drawHeight) / 2 + travelY * panY;
  ctx.drawImage(image, x + offsetX, y + offsetY, drawWidth, drawHeight);
}

function getMediaWidth(media) {
  return media?.videoWidth || media?.naturalWidth || 0;
}

function getMediaHeight(media) {
  return media?.videoHeight || media?.naturalHeight || 0;
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
    button.addEventListener("click", () => {
      setProgramTopic(zones.indexOf(button.dataset.zone));
      focusCamera(state.zone, camera, controls);
    });
  });
  document.getElementById("screenSelect").addEventListener("change", (event) => setProgramTopic(Number(event.target.value)));
  document.getElementById("screenMode").addEventListener("change", (event) => {
    state.mode = event.target.value;
    drawProgramScreen(performance.now() / 1000);
    writeUrlState();
  });
  document.getElementById("screenPrev").addEventListener("click", () => stepProgram(-1));
  document.getElementById("screenNext").addEventListener("click", () => stepProgram(1));
  document.getElementById("screenPlay").addEventListener("click", toggleProgramPlayback);
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

function updateProgramUi() {
  const topic = programTopics[state.programIndex] || programTopics[0];
  state.zone = topic.zone;
  document.querySelectorAll(".viewer-zone-tabs button").forEach((button) => button.setAttribute("aria-selected", String(button.dataset.zone === state.zone)));
  const select = document.getElementById("screenSelect");
  select.innerHTML = programTopics.map((entry, itemIndex) => `<option value="${itemIndex}">${String(itemIndex + 1).padStart(2, "0")} · ${escapeHtml(entry.title || zoneLabels[entry.zone])}</option>`).join("");
  select.value = String(state.programIndex);
  document.getElementById("screenPeriod").textContent = exhibitionPeriod;
  document.getElementById("screenIndex").textContent = `${String(state.programIndex + 1).padStart(2, "0")} / 03`;
  document.getElementById("screenTitle").textContent = topic.title || zoneLabels[topic.zone];
  document.getElementById("screenBody").textContent = topic.subtitle || "Достижения за 25 лет";
  document.getElementById("screenMode").value = state.mode;
  document.getElementById("programSubtitle").textContent = topic.subtitle || "Достижения за 25 лет";
  lastProgramMetricKey = "";
  drawProgramScreen(programPhase);
  loadReviewUi();
  updateProgramPlaybackUi();
  writeUrlState();
}

function updateProgramMetricUi(topic, metricWindow) {
  const key = `${topic.zone}:${metricWindow.page}`;
  if (key === lastProgramMetricKey) return;
  lastProgramMetricKey = key;
  const programKpis = document.getElementById("programKpis");
  if (!programKpis) return;
  programKpis.innerHTML = metricWindow.metrics.map((metric, index) => {
    const metricNumber = metricWindow.page * 3 + index + 1;
    return `<div style="--kpi-color:${zoneColors[topic.zone]}"><strong>${escapeHtml(metric.value)}</strong><span>${String(metricNumber).padStart(2, "0")} · ${escapeHtml(metric.label)}</span></div>`;
  }).join("");
  const subtitle = document.getElementById("programSubtitle");
  if (subtitle) subtitle.textContent = `${topic.subtitle || "Достижения за 25 лет"} · такт ${metricWindow.page + 1}/${metricWindow.pageCount}`;
}

function setProgramTopic(index) {
  state.programIndex = (index + programTopics.length) % programTopics.length;
  programPhase = 0;
  programAdvance = 0;
  const video = screenVideos[programTopics[state.programIndex].zone];
  if (video?.readyState >= 2) video.currentTime = 0;
  updateProgramUi();
}

function stepProgram(direction) {
  setProgramTopic(state.programIndex + direction);
}

function toggleProgramPlayback() {
  state.programPlaying = !state.programPlaying;
  programAdvance = 0;
  syncProgramPlayback();
  drawProgramScreen(programPhase);
  updateProgramPlaybackUi();
}

function syncProgramPlayback() {
  zones.forEach((zone) => {
    const video = screenVideos[zone];
    if (!video || video.readyState < 2) return;
    if (state.programPlaying) video.play().catch(() => {});
    else video.pause();
  });
}

function updateProgramPlaybackUi() {
  const console = document.querySelector(".program-console");
  console?.classList.toggle("is-paused", !state.programPlaying);
  const programState = document.getElementById("programState");
  if (programState) programState.textContent = state.programPlaying ? "в эфире" : "остановлен";
  const activePlay = document.getElementById("screenPlay");
  if (activePlay) {
    activePlay.setAttribute("aria-pressed", String(state.programPlaying));
    activePlay.textContent = state.programPlaying ? "Пауза" : "Пуск";
  }
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
    overview: { position: [0, 4.25, 12.4], target: [0, 1.78, -2.35] },
    visitor: { position: [0, 1.65, 10.6], target: [0, 1.72, -0.35] },
    cube: { position: [4.8, 3.1, 5.4], target: [0, 1.92, -0.35] },
    technology: { position: [-2.25, 1.80, -0.2], target: [-6.15, 1.52, -0.2] },
    construction: { position: [0, 3.5, 0.8], target: [0, 1.72, -10.15] },
    transport: { position: [2.25, 1.80, -0.2], target: [6.15, 1.52, -0.2] }
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
    camera.position.set(0, 1.65, 10.2);
    controls.target.set(0, 1.65, 9.2);
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
  const canStand = (point) => {
    const outsideCube = Math.hypot(point.x, point.z + 0.35) > 1.45;
    const outsideLeftIsland = Math.hypot((point.x + 3.45) / 1.55, (point.z - 2.35) / 0.95) > 1;
    const outsideRightIsland = Math.hypot((point.x - 3.45) / 1.55, (point.z - 2.35) / 0.95) > 1;
    return point.x >= -5.65 && point.x <= 5.65 && point.z >= -9.45 && point.z <= 10.45 && outsideCube && outsideLeftIsland && outsideRightIsland;
  };
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

function reviewKey() { return `program:${state.programIndex}`; }

function saveReview(patch, announce = true) {
  const key = reviewKey();
  const topic = programTopics[state.programIndex];
  state.reviews[key] = { ...(state.reviews[key] || {}), ...patch, zone: state.zone, index: state.programIndex, title: topic.title, updatedAt: new Date().toISOString() };
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
  if (zones.includes(zone)) {
    state.zone = zone;
    state.programIndex = zones.indexOf(zone);
  }
  if (["overview", "visitor", "cube", ...zones].includes(params.get("camera"))) state.camera = params.get("camera");
  state.mode = "film";
}

function writeUrlState() {
  const url = new URL(location.href);
  url.searchParams.set("zone", state.zone);
  url.searchParams.delete("item");
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
  return String(value).replace(/[&<>\"]/g, (symbol) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[symbol]));
}

function hexToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const number = Number.parseInt(value.length === 3 ? value.split("").map((part) => part + part).join("") : value, 16);
  return `rgba(${(number >> 16) & 255},${(number >> 8) & 255},${number & 255},${alpha})`;
}
