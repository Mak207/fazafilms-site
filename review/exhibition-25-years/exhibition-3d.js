import { addWalkers } from "./visitors.js?v=36";
import { mountRailPanel, signPlinth } from "./plinths.js?v=33";
import { createWallProgram } from "./wall-program.js?v=32";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { createExhibitLoader } from "./exhibit-lod.js?v=37";

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
// CMF for the clean parametric exhibits. The colours follow the recognisable
// livery/material language of the referenced Russian prototypes instead of
// tinting every object with one generic zone colour.
const prototypePalettes = {
  reactor: [0xb9c2c5, 0xc97942, 0x27343b, 0x70b8d6],
  robot: [0xe5e8e6, 0xc5292e, 0x26323a, 0x71b9d2],
  satellite: [0xc8c8bd, 0x224c9a, 0x8b6a28, 0x315f9b],
  earthSatellite: [0xe4e1d5, 0x214a98, 0x9b7930, 0x315f9b],
  terminal: [0x2b3f57, 0xe9ece7, 0x151d25, 0x2c92c7],
  combine: [0xc72b2f, 0x262e31, 0x171d20, 0x5e8da4],
  drone: [0x353c42, 0xe2e5df, 0x14191d, 0x446c82],
  rover: [0xe1e2dc, 0xc92e35, 0x252c31, 0x4f8299],
  coin: [0xc3232c, 0xf0eee8, 0x6e171c, 0x8b252d],
  aiCore: [0x2576b7, 0x5bd7d4, 0x12283c, 0x54b7d0],
  server: [0x202932, 0x3b91c7, 0x11171d, 0x2d6f99],
  quantum: [0xd2d5d2, 0xb58b45, 0x30373c, 0x69a5bf],
  biotech: [0xd4d8d5, 0x4a9fb1, 0x29343a, 0x60b4c9],
  materials: [0x242a2d, 0x9ca6a6, 0x111517, 0x526b73],
  rocket: [0xe7e9e4, 0x2e639d, 0x252d35, 0x5385a7],
  doubleTrain: [0xe6e4de, 0xb5232c, 0x30353a, 0x5b7f96],
  car: [0x14191d, 0xa6a9a5, 0x080a0c, 0x345267],
  locomotive: [0x2d669c, 0xc12c34, 0x202b34, 0x4f7892],
  hydrofoil: [0xe4e8e5, 0x2f6ea3, 0x222d35, 0x4d819d],
  ship: [0xf0eee7, 0x223e5b, 0x273038, 0x54798f],
  iceShip: [0xd5443e, 0xf0eee7, 0x202a32, 0x4e748b],
  icebreaker: [0xc92d31, 0x202b34, 0xf0eee7, 0x557a91],
  airliner: [0xe8e9e4, 0x315f96, 0x252f39, 0x547d98],
  helicopter: [0x566b75, 0xe2e4df, 0x252e34, 0x385d73],
  fastTrain: [0xe7e8e2, 0xc42b32, 0x2c6396, 0x4d7f9d],
  bus: [0xe4e7e3, 0x2e73ae, 0x263039, 0x4f829e],
  autocar: [0xe4e5df, 0x222a30, 0x111619, 0x4a7188],
  spacecraft: [0xc9c9bf, 0xb28a45, 0x33383a, 0x5a7e90],
  pipeline: [0xd7d4c9, 0xd3a94c, 0x4b5353, 0x668c98],
  stadium: [0xe5e3dc, 0x8d6b43, 0x343d40, 0x6a8d98],
  airport: [0xd8d8d2, 0x447ca2, 0x3b4448, 0x648c9e],
  bridge: [0xe5e4dc, 0x315f75, 0x3a4346, 0x658d9b],
  highway: [0x4b5354, 0xe5dfca, 0x242b2e, 0x66818a],
  railway: [0x555c5d, 0xc8b277, 0x252c2f, 0x607d87],
  port: [0xc84c35, 0x3e6480, 0x293337, 0x5f8291],
  cosmodrome: [0xe5e5df, 0xd67c34, 0x384348, 0x678c9b],
  hospital: [0xe2e3dd, 0x68a79a, 0x394347, 0x71a0aa],
  school: [0xe2d9c7, 0xb96b3e, 0x41484a, 0x76929a],
  technopark: [0xdfe1dd, 0x4e8499, 0x313c42, 0x6a98a9],
  district: [0xdad7cc, 0xb67b50, 0x3b4448, 0x7196a0],
  social: [0xe0ddd3, 0x658aa0, 0x343f44, 0x7096a4],
  utilities: [0xb9bec0, 0xd0a548, 0x343d41, 0x658d98]
};
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
const exhibits = createExhibitLoader(gltfLoader, useGalleryMaterials, (anchor, level) => {
  const id = anchor.userData.modelId;
  physicalModels[id].status = level === "detail"
    ? "HiTem · крупный план · текстура 2048 × 2048"
    : "HiTem · общий вид · текстура 512 × 512";
  if (anchor.userData.assetId === "center-01") {
    const view = level === "detail" ? "крупный план" : "общий вид";
    physicalModels[id].status = "HiTem · " + view + " · Эволюция, Федерация, Меркурий и Город Столиц";
  }
  if (id === selectedModelId) selectModel(id);
});
let updateWalkers;

const screenCanvases = {};
const screenTextures = {};
const screenMaterials = {};
const clickTargets = [];
const modelObjects = {};
let selectedModelId = "media-cube";
let programPhase = 0;
let programAdvance = 0;
const programDwell = 24;
const cubeTurnMs = 120000;
let cubeRotor;
let trainPanel;
const islandFootprints = [];
let panoramaTime = 0;
let wallTextureLimit = 8192;
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
  image.onload = () => drawProgramScreen(programPhase);
  screenFrames[zone] = image;

  const video = document.createElement("video");
  video.src = `./assets/video/${zone}-h3-panorama.mp4`;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "auto";
  video.addEventListener("loadeddata", () => {
    syncProgramPlayback();
    drawProgramScreen(programPhase);
  });
  screenVideos[zone] = video;
});

const panoramaArt = new Image();
const paintWall = createWallProgram(programTopics, exhibitCatalog, pavilion, screenVideos, panoramaArt, drawObjectAction, () => drawProgramScreen(programPhase));

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
  wallTextureLimit = Math.min(8192, renderer.capabilities.maxTextureSize);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // Keep the review deterministic. Automatic exposure made the same scene
  // look washed out on bright displays and grey on dark ones.
  renderer.toneMappingExposure = 0.82;
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdce8eb);
  // A pale, dense fog was the main source of the previous "white veil".
  // The atrium is only 28 m deep, so use a restrained cool haze instead.
  scene.fog = new THREE.FogExp2(0xdce8eb, 0.00055);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 80);
  const initialView = getCameraView("overview", isNarrowScene());
  camera.position.set(...initialView.position);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.target.set(...initialView.target);
  controls.minDistance = 0.65;
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
  addPlanters(scene);
  useGalleryMaterials(scene);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let tapStart;
  canvas.addEventListener("pointerdown", (event) => {
    tapStart = event.isPrimary && event.button === 0 ? [event.clientX, event.clientY] : null;
  });
  canvas.addEventListener("pointercancel", () => { tapStart = null; });
  canvas.addEventListener("pointerup", (event) => {
    if (!tapStart || Math.hypot(event.clientX-tapStart[0], event.clientY-tapStart[1]) > 7) return;
    tapStart = null;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(clickTargets, true).find((entry) => findModelId(entry.object));
    if (!hit) return;
    const id = findModelId(hit.object);
    selectModel(id);
    if (id === "island-center-03") trainPanel.toggle();
    const anchor = modelObjects[id];
    if (!state.walking && anchor.userData.assetId) {
      const bounds = new THREE.Box3().setFromObject(anchor);
      const target = bounds.getCenter(new THREE.Vector3());
      const direction = camera.position.clone().sub(target);
      if (physicalModels[id].zone) direction.set(0,0,1).applyQuaternion(anchor.quaternion);
      if (id === "island-center-03") direction.set(-1, 0, .48);
      direction.y = 0;
      direction.normalize();
      const size = bounds.getSize(new THREE.Vector3());
      const distance = Math.max(0.9, Math.max(size.x,size.z)/Math.min(1,camera.aspect)*1.5, size.y*1.8);
      const position = target.clone().addScaledVector(direction,distance);
      position.y += distance*0.32;
      cameraMotion = {startPosition:camera.position.clone(), startTarget:controls.target.clone(),
        endPosition:position, endTarget:target, started:performance.now(), duration:700};
      document.querySelectorAll(".viewer-cameras [data-camera]").forEach(button => button.classList.remove("is-active"));
    }
  });

  setupUi(camera, controls);
  updateProgramUi();
  selectModel(selectedModelId);
  resize();
  new ResizeObserver(resize).observe(canvas);
  window.addEventListener("resize", resize);

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) state.programPlaying = false;
  syncProgramPlayback();
  updateProgramPlaybackUi();
  const cubeStart = performance.now();
  let lastTick = cubeStart;
  let lastPaint = -Infinity;
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const elapsed = (now - lastTick) / 1000;
    lastTick = now;
    cubeRotor.rotation.y = ((now - cubeStart) % cubeTurnMs) * Math.PI * 2 / cubeTurnMs;
    if (state.programPlaying) {
      panoramaTime += elapsed;
      programPhase += elapsed;
      programAdvance += elapsed;
      if (programAdvance >= programDwell) {
        stepProgram(1);
        lastPaint = now;
      } else if (now - lastPaint >= 1000 / 24) {
        drawProgramScreen(programPhase);
        lastPaint = now;
      }
    }
    const delta = Math.min(clock.getDelta(), 0.05);
    if (cameraMotion) updateCameraMotion(camera, controls);
    if (state.walking) updateWalk(camera, controls, delta);
    trainPanel.update(Math.min(elapsed,.15), camera, state.walking);
    updateWalkers(now/1000);
    controls.update();
    exhibits.update(camera, performance.now(), selectedModelId);
    renderer.render(scene, camera);
  });

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.fov = camera.aspect < 0.82 ? 44 : camera.aspect < 1.10 ? 46 : 42;
    camera.updateProjectionMatrix();
  }
}

// Compact material path for mobile GPUs, including desktop-site mode.
function useGalleryMaterials(group) {
  const materials = new Map();
  function convert(original) {
    if (!original.isMeshStandardMaterial) return original;
    if (!materials.has(original)) materials.set(original, new THREE.MeshLambertMaterial({
      color: original.color, map: original.map, emissive: original.emissive,
      emissiveMap: original.emissiveMap, emissiveIntensity: original.emissiveIntensity,
      vertexColors: original.vertexColors, transparent: original.transparent,
      opacity: original.opacity, alphaTest: original.alphaTest, alphaMap: original.alphaMap,
      side: original.side, depthWrite: original.depthWrite
    }));
    return materials.get(original);
  }
  group.traverse(object => {
    if (object.isMesh) object.material = Array.isArray(object.material)
      ? object.material.map(convert) : convert(object.material);
  });
  for (const original of materials.keys()) original.dispose();
}

function addExhibitionLighting(scene) {
  // Exhibition-lighting hierarchy.  The atrium is lit by a cool daylight
  // key plus a restrained sky/ground fill.  Every other source owns one
  // object group; there are no broad coloured point lights washing the room.
  const ambient = new THREE.HemisphereLight(0xffffff, 0x9eaaa7, 1.02);
  ambient.name = "LGT_BASE_ATRIUM";
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xffffff, 1.34);
  key.name = "LGT_KEY_DAYLIGHT";
  key.position.set(-7.5, 14.5, 7.0);
  // The reference atrium is filled by diffuse daylight. Hard shadows from the
  // roof truss produced the black grid that made the pavilion look unfinished.
  key.castShadow = false;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -16;
  key.shadow.camera.right = 16;
  key.shadow.camera.top = 18;
  key.shadow.camera.bottom = -18;
  key.shadow.bias = -0.00012;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffe6c6, 0.62);
  fill.position.set(6, 5, -4);
  scene.add(fill);
}

function buildAtriumShell(scene) {
  const steel = new THREE.MeshStandardMaterial({ color: 0xaab8bd, roughness: 0.38, metalness: 0.48, envMapIntensity: 0.62 });
  const white = new THREE.MeshPhysicalMaterial({ color: 0xf4f5f1, roughness: 0.44, metalness: 0.03, clearcoat: 0.12, clearcoatRoughness: 0.42, envMapIntensity: 0.55 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xbfd8e1, roughness: 0.18, metalness: 0.01, transmission: 0.12, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
  const ceilingY = pavilion.atriumHeight;
  const halfW = pavilion.atriumWidth / 2;
  const halfD = pavilion.atriumDepth / 2;

  const addMullion = (x, z, height = ceilingY) => addBox(scene, [0.095, height, 0.095], [x, height / 2, z], steel);
  for (let z = -halfD; z <= halfD + 0.01; z += 2) {
    addMullion(-halfW, z);
    addMullion(halfW, z);
    addBox(scene, [pavilion.atriumWidth, 0.095, 0.095], [0, ceilingY, z], steel);
    addBox(scene, [pavilion.atriumWidth, 0.035, 0.035], [0, ceilingY - 0.32, z], white);
  }
  for (let x = -halfW; x <= halfW + 0.01; x += 1.9) {
    addMullion(x, -halfD);
    addBox(scene, [0.095, 0.095, pavilion.atriumDepth], [x, ceilingY, 0], steel);
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

  const trackMaterial = new THREE.MeshStandardMaterial({ color: 0x859399, roughness: 0.34, metalness: 0.68 });
  const lampMaterial = new THREE.MeshBasicMaterial({ color: 0xfff1d8, toneMapped: false });
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
  const ledMaterial = new THREE.MeshBasicMaterial({ color: warm, transparent: true, opacity: 0.68, toneMapped: true });
  const accentMaterials = {
    technology: new THREE.MeshBasicMaterial({ color: zoneColors.technology, transparent: true, opacity: 0.52, toneMapped: true }),
    construction: new THREE.MeshBasicMaterial({ color: zoneColors.construction, transparent: true, opacity: 0.52, toneMapped: true }),
    transport: new THREE.MeshBasicMaterial({ color: zoneColors.transport, transparent: true, opacity: 0.52, toneMapped: true })
  };

  addBox(scene, [0.035, 0.045, 20.15], [-5.80, 1.465, 0.18], ledMaterial);
  addBox(scene, [0.035, 0.045, 20.15], [5.80, 1.465, 0.18], ledMaterial);
  addBox(scene, [12.0, 0.045, 0.035], [0, 1.465, -9.67], ledMaterial);
  addBox(scene, [0.035, 0.025, 20.15], [-5.78, 0.595, 0.18], accentMaterials.technology);
  addBox(scene, [0.035, 0.025, 20.15], [5.78, 0.595, 0.18], accentMaterials.transport);
  addBox(scene, [12.0, 0.025, 0.035], [0, 0.595, -9.65], accentMaterials.construction);

}

function buildPavilion(scene) {
  const floorMaterial = new THREE.MeshPhysicalMaterial({ color: 0xcbd3d0, roughness: 0.38, metalness: 0.02, clearcoat: 0.24, clearcoatRoughness: 0.34, envMapIntensity: 0.72 });
  // Static daylight falloff and grazing light from the plinths, in metres.
  const ground = document.createElement("canvas");
  ground.width = 512;
  ground.height = 768;
  const paint = ground.getContext("2d");
  const dx = ground.width / (pavilion.atriumWidth - .8);
  const dz = ground.height / (pavilion.atriumDepth - .8);
  paint.setTransform(dx, 0, 0, dz, ground.width / 2, ground.height / 2);
  const daylight = paint.createLinearGradient(-9,-7,8,6);
  daylight.addColorStop(0, "#fcfaf4");
  daylight.addColorStop(.52, "#c8ccce");
  daylight.addColorStop(1, "#b1babd");
  paint.fillStyle = daylight;
  paint.fillRect(-10,-15,20,30);
  paint.strokeStyle = "rgba(90,95,98,.19)";
  paint.lineWidth = .018;
  paint.beginPath();
  for (let x = -9; x <= 9; x += 1.5) { paint.moveTo(x,-15); paint.lineTo(x,15); }
  for (let z = -15; z <= 15; z += 1.5) { paint.moveTo(-10,z); paint.lineTo(10,z); }
  paint.stroke();
  for (const [x,z,r] of [[0,-.35,2.4],[-3.55,2.55,2.2],[3.55,2.55,2.2],[0,5.48,2.7]]) {
    const bounce = paint.createRadialGradient(x,z,.5,x,z,r);
    bounce.addColorStop(0,"rgba(255,230,191,.72)");
    bounce.addColorStop(1,"rgba(255,230,191,0)");
    paint.fillStyle = bounce;
    paint.fillRect(x-r,z-r,2*r,2*r);
  }
  floorMaterial.map = new THREE.CanvasTexture(ground);
  floorMaterial.map.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(pavilion.atriumWidth - 0.8, pavilion.atriumDepth - 0.8), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = 0;
  floor.receiveShadow = true;
  scene.add(floor);
  // Soft contact pools anchor the plinths to the floor without GPU shadow maps.
  const tile = document.createElement("canvas");
  tile.width = tile.height = 128;
  const brush = tile.getContext("2d");
  const shade = brush.createRadialGradient(64, 64, 12, 64, 64, 64);
  shade.addColorStop(0, "rgba(42,38,34,.54)");
  shade.addColorStop(.64, "rgba(52,47,43,.27)");
  shade.addColorStop(1, "rgba(52,47,43,0)");
  brush.fillStyle = shade;
  brush.fillRect(0, 0, 128, 128);
  const contact = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(tile), transparent: true, depthWrite: false, toneMapped: false });
  updateWalkers = addWalkers(scene,gltfLoader,contact);
  for (const [x,z,width,depth] of [[0,-.35,3.8,3.8],[0,4.55,7.4,3.2],[-3.6,2.65,4.6,3],[3.6,2.65,4.6,3],[-3.35,-3.55,3.8,2.7],[3.35,-3.55,3.8,2.7]]) {
    scene.add(meshOf(new THREE.PlaneGeometry(width, depth), contact, [x,.008,z], [-Math.PI/2,0,0]));
  }

  const wallMaterial = new THREE.MeshPhysicalMaterial({ color: 0xe7e9e4, roughness: 0.42, metalness: 0.03, clearcoat: 0.12, envMapIntensity: 0.58 });
  addBox(scene, [0.36, pavilion.height, pavilion.depth + 0.6], [-6.68, 2, 0], wallMaterial);
  addBox(scene, [0.36, pavilion.height, pavilion.depth + 0.6], [6.68, 2, 0], wallMaterial);
  addBox(scene, [pavilion.width + 0.1, pavilion.height, 0.36], [0, 2, -10.48], wallMaterial);

  addSeamlessMediaWalls(scene);

  const shelfMaterial = new THREE.MeshPhysicalMaterial({ color: 0xeff1ec, roughness: 0.34, metalness: 0.03, clearcoat: 0.22, clearcoatRoughness: 0.36, envMapIntensity: 0.68 });
  addBox(scene, [0.72, 0.10, 20.55], [-6.02, 0.54, 0.12], shelfMaterial);
  addBox(scene, [0.72, 0.10, 20.55], [6.02, 0.54, 0.12], shelfMaterial);
  addBox(scene, [12.25, 0.10, 0.72], [0, 0.54, -9.94], shelfMaterial);

  if (!isNarrowScene()) {
    addDimension(scene, [-7.05, 0, 10.25], [-7.05, 4, 10.25], "4 м");
    addDimension(scene, [-6.5, 0.02, 11.15], [6.5, 0.02, 11.15], "13 м");
  }
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
  const niche = new THREE.MeshPhysicalMaterial({ color: 0xe5e8e3, roughness: 0.46, metalness: 0.02, clearcoat: 0.16, envMapIntensity: 0.62 });
  const wash = document.createElement("canvas");
  wash.width = 128;
  wash.height = 96;
  const brush = wash.getContext("2d");
  const pool = brush.createRadialGradient(64, 15, 2, 64, 20, 72);
  pool.addColorStop(0, "#fff3db");
  pool.addColorStop(0.55, "#e5ded2");
  pool.addColorStop(1, "#c8c9c4");
  brush.fillStyle = pool;
  brush.fillRect(0, 0, wash.width, wash.height);
  niche.map = new THREE.CanvasTexture(wash);
  niche.map.colorSpace = THREE.SRGBColorSpace;
  niche.map.wrapS = THREE.RepeatWrapping;
  niche.map.repeat.x = 42;
  buildStrip(0.5, 1.5, niche);

  const portalMaterial = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.24, metalness: 0.04, clearcoat: 0.32, envMapIntensity: 0.86 });
  const portalGlow = new THREE.MeshBasicMaterial({ color: 0xe8fdff, transparent: true, opacity: 0.92, toneMapped: false });
  const curve = new THREE.CurvePath();
  for (let i = 0; i < path.length - 1; i += 1) {
    curve.add(new THREE.LineCurve3(new THREE.Vector3(path[i].x, 4.08, path[i].z), new THREE.Vector3(path[i + 1].x, 4.08, path[i + 1].z)));
  }
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 320, 0.145, 12, false), portalMaterial));
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 320, 0.036, 8, false), portalGlow));
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
    layer.width = Math.min(wallTextureLimit, Math.max(4096, Math.round(lengthMeters * pixelsPerMeter)));
    layer.height = Math.round(layer.width * heightMeters / lengthMeters);
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
    meta.status = "Загружается модель HiTem";
    exhibits.register(anchor, id, meta.dims, proxy);
  });
}

function createProxy(meta) {
  const group = new THREE.Group();
  const kind = meta.kind;
  const isShip = ["ship", "iceShip", "icebreaker", "hydrofoil"].includes(kind);
  const isRail = ["doubleTrain", "locomotive", "fastTrain", "bus"].includes(kind);
  const isAir = ["airliner", "rocket", "spacecraft", "helicopter"].includes(kind);
  const fallbackPrimary = meta.zone === "transport"
    ? isShip ? 0xc9434b : isRail ? 0x2e75b7 : isAir ? 0xe4e8e5 : 0x315c83
    : meta.zone === "construction"
      ? 0xb7aa87
      : kind === "robot" ? 0xf2a51a : 0xb9c8c7;
  const fallbackSecondary = meta.zone === "transport"
    ? isShip ? 0xf1f1eb : isRail ? 0xe9ece8 : 0x2a6092
    : meta.zone === "construction" ? 0xd8d2c2 : 0x2b638d;
  const palette = prototypePalettes[kind] || [fallbackPrimary, fallbackSecondary, meta.zone === "transport" ? 0x172c42 : 0x29353a, 0x17486c];
  const [primary, secondary, darkColor, glassColor] = palette;
  const body = new THREE.MeshPhysicalMaterial({ color: primary, roughness: 0.30, metalness: 0.22, clearcoat: 0.30, clearcoatRoughness: 0.24, envMapIntensity: 0.84 });
  const dark = new THREE.MeshStandardMaterial({ color: darkColor, roughness: 0.42, metalness: 0.48, envMapIntensity: 0.74 });
  const pale = new THREE.MeshPhysicalMaterial({ color: secondary, roughness: 0.34, metalness: 0.12, clearcoat: 0.20, clearcoatRoughness: 0.26, envMapIntensity: 0.76 });
  const glass = new THREE.MeshPhysicalMaterial({ color: glassColor, roughness: 0.10, metalness: 0.10, clearcoat: 0.46, transparent: true, opacity: 0.76, envMapIntensity: 0.92 });

  if (kind === "robot") {
    const joints = [[0, 0.06, 0], [0.02, 0.20, 0], [0.13, 0.35, 0], [0.24, 0.47, 0]];
    group.add(meshOf(new THREE.CylinderGeometry(0.10, 0.12, 0.08, 24), dark, [0, 0.04, 0]));
    joints.forEach((p, index) => group.add(meshOf(new THREE.SphereGeometry(index === 3 ? 0.035 : 0.052, 20, 12), dark, p)));
    for (let i = 0; i < joints.length - 1; i += 1) group.add(cylinderBetween(joints[i], joints[i + 1], i < 2 ? 0.038 : 0.027, body));
  } else if (["satellite", "earthSatellite"].includes(kind)) {
    group.add(meshOf(new RoundedBoxGeometry(0.22, 0.24, 0.22, 4, 0.025), body, [0, 0.25, 0]));
    group.add(meshOf(new THREE.CylinderGeometry(0.075, 0.10, 0.18, 24), pale, [0, 0.46, 0]));
    group.add(meshOf(new THREE.SphereGeometry(0.055, 24, 12), dark, [0, 0.58, 0]));
    [-1, 1].forEach((side) => {
      group.add(meshOf(new RoundedBoxGeometry(0.42, 0.022, 0.22, 3, 0.015), dark, [side * 0.34, 0.27, 0]));
      [-0.08, 0, 0.08].forEach((z) => group.add(meshOf(new THREE.BoxGeometry(0.38, 0.024, 0.008), body, [side * 0.34, 0.282, z])));
    });
  } else if (kind === "rocket") {
    group.add(meshOf(new THREE.CylinderGeometry(0.031, 0.031, 0.43, 28), body, [0, 0.26, 0]));
    const cone = meshOf(new THREE.ConeGeometry(0.031, 0.11, 28), body, [0, 0.53, 0]); group.add(cone);
    [-1, 1].forEach((sign) => group.add(meshOf(new THREE.CylinderGeometry(0.015, 0.015, 0.36, 20), dark, [sign * 0.043, 0.23, 0])));
  } else if (["ship", "iceShip", "icebreaker", "hydrofoil"].includes(kind)) {
    const hull = meshOf(new THREE.CapsuleGeometry(0.15, 0.58, 8, 24), body, [-0.04, 0.14, 0], [0, 0, Math.PI / 2]);
    hull.scale.set(1, 0.72, 0.82);
    group.add(hull);
    group.add(meshOf(new THREE.ConeGeometry(0.15, 0.25, 24), body, [0.48, 0.14, 0], [0, 0, -Math.PI / 2]));
    group.add(meshOf(new RoundedBoxGeometry(0.40, 0.14, 0.19, 3, 0.025), pale, [-0.10, 0.27, 0]));
    group.add(meshOf(new RoundedBoxGeometry(0.23, 0.09, 0.205, 3, 0.018), glass, [0.04, 0.36, 0]));
    group.add(meshOf(new THREE.CylinderGeometry(0.018, 0.023, 0.20, 12), dark, [-0.18, 0.47, 0]));
    group.add(meshOf(new THREE.BoxGeometry(0.70, 0.018, 0.24), pale, [-0.03, 0.21, 0]));
    if (kind === "hydrofoil") {
      group.add(meshOf(new THREE.BoxGeometry(0.52, 0.018, 0.40), dark, [0.04, 0.045, 0]));
      [-0.20, 0.22].forEach((x) => group.add(meshOf(new THREE.BoxGeometry(0.025, 0.15, 0.025), dark, [x, 0.03, 0])));
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
    group.add(meshOf(new RoundedBoxGeometry(long ? 0.86 : 0.58, h, long ? 0.24 : 0.3, 5, 0.055), body, [0, h * 0.65 + 0.08, 0]));
    if (kind === "fastTrain") group.add(meshOf(new THREE.ConeGeometry(0.16, 0.30, 20), body, [0.56, 0.20, 0], [0, 0, -Math.PI / 2]));
    [-0.28, 0.28].forEach((x) => [-1, 1].forEach((z) => group.add(meshOf(new THREE.CylinderGeometry(0.055, 0.055, 0.025, 16), dark, [x, 0.055, z * (long ? 0.105 : 0.13)], [Math.PI / 2, 0, 0]))));
    [-1, 1].forEach((side) => {
      const z = side * (long ? 0.126 : 0.156);
      for (let i = 0; i < (long ? 5 : 3); i += 1) {
        group.add(meshOf(new RoundedBoxGeometry(long ? 0.105 : 0.12, h * 0.34, 0.012, 2, 0.015), glass, [-0.30 + i * (long ? 0.15 : 0.20), h * 0.78 + 0.08, z]));
      }
    });
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
  const modelBase = new THREE.MeshPhysicalMaterial({ color: 0xe9ebe7, roughness: 0.34, metalness: 0.03, clearcoat: 0.18, envMapIntensity: 0.68 });
  const base = meshOf(new RoundedBoxGeometry(meta.dims[0] * 0.92, 0.025, meta.dims[1] * 0.82, 3, 0.015), modelBase, [0, -0.012, 0]);
  group.add(base);
  group.traverse((child) => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
  return group;
}

function fitToEnvelope(group, dims) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const scale = Math.min((dims[0] * 0.96) / Math.max(size.x, 0.001), (dims[2] * 0.96) / Math.max(size.y, 0.001), (dims[1] * 0.96) / Math.max(size.z, 0.001));
  group.scale.setScalar(scale);
  group.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(group);
  group.position.y -= fitted.min.y;
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
  const base = meshOf(new RoundedBoxGeometry(2.28, 0.20, 2.28, 8, 0.12), graphite, [0, 0.10, 0]);
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const underlight = new THREE.Mesh(
    new RoundedBoxGeometry(2.42, 0.045, 2.42, 8, 0.14),
    new THREE.MeshBasicMaterial({ color: 0xc9f5ff, transparent: true, opacity: 0.92, toneMapped: false })
  );
  underlight.position.y = 0.026;
  group.add(underlight);
  signPlinth(group, "Видеокуб", 2.28, 2.28, .20);

  const inset = meshOf(new RoundedBoxGeometry(1.12, 0.09, 1.12, 7, 0.08), blackMetal, [0, 0.245, 0]);
  inset.receiveShadow = true;
  group.add(inset);

  const post = meshOf(new THREE.CylinderGeometry(0.18, 0.42, 0.58, 4), blackMetal, [0, 0.56, 0], [0, Math.PI / 4, 0]);
  post.castShadow = true;
  group.add(post);
  const collar = meshOf(new THREE.CylinderGeometry(0.22, 0.22, 0.07, 24), graphite, [0, 0.86, 0]);
  group.add(collar);

  zones.forEach((zone) => {
    const layer = document.createElement("canvas");
    layer.width = 768;
    layer.height = 768;
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
    videoMaterial("technology"), videoMaterial("technology"),
    videoMaterial("construction"), videoMaterial("construction"),
    videoMaterial("transport"), videoMaterial("transport")
  ]);
  const bottomVertex = 0.92;
  cube.position.y = bottomVertex + Math.sqrt(3) * 0.75;
  cube.quaternion.setFromUnitVectors(new THREE.Vector3(1, 1, 1).normalize(), new THREE.Vector3(0, 1, 0));
  const worldUp = new THREE.Vector3(0, 1, 0);
  const frontNormal = worldUp.clone().applyQuaternion(cube.quaternion);
  cube.rotateOnWorldAxis(worldUp, -Math.atan2(frontNormal.x, frontNormal.z));
  const { position, normal, uv } = cube.geometry.attributes;
  for (let i = 0; i < position.count; i++) {
    const n = new THREE.Vector3().fromBufferAttribute(normal, i).applyQuaternion(cube.quaternion);
    const right = new THREE.Vector3().crossVectors(worldUp, n).normalize();
    const up = new THREE.Vector3().crossVectors(n, right);
    const point = new THREE.Vector3().fromBufferAttribute(position, i).applyQuaternion(cube.quaternion);
    const diagonal = 1.5 * Math.SQRT2;
    uv.setXY(i, .5 + point.dot(right) / diagonal, .5 + point.dot(up) / diagonal);
  }
  cube.castShadow = true;
  cube.userData.modelId = id;
  cubeRotor = new THREE.Group();
  cubeRotor.name = "media-cube-rotor";
  group.add(cubeRotor);
  cubeRotor.add(cube);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.5, 1.5, 1.5), 12),
    new THREE.LineBasicMaterial({ color: 0xe4e9e2, transparent: true, opacity: 0.78, toneMapped: false })
  );
  edges.position.copy(cube.position);
  edges.quaternion.copy(cube.quaternion);
  edges.scale.setScalar(1.006);
  edges.userData.modelId = id;
  cubeRotor.add(edges);

  group.traverse((child) => { child.userData.modelId = id; });
  scene.add(group);
  modelObjects[id] = group;
  clickTargets.push(group);
}

function addDisplayExhibit(group, asset, title, placement, dims, position, rotation = 0, location = "island") {
  const id = location + "-" + asset;
  const source = physicalModels[asset];
  physicalModels[id] = {
    title: title || source.title, placement, dims, reference: source?.reference,
    size: dims.map(value => value.toLocaleString("ru-RU")).join(" × ") + " м",
    status: "Загружается модель HiTem"
  };
  const anchor = new THREE.Group();
  anchor.name = id;
  anchor.userData.modelId = id;
  anchor.position.set(...position);
  anchor.rotation.y = rotation;
  group.add(anchor);
  clickTargets.push(anchor);
  modelObjects[id] = anchor;
  exhibits.register(anchor, asset, dims);
}

function buildFeatureIslands(scene) {
  const plinth = new THREE.MeshPhysicalMaterial({ color: 0xf0f1ee, roughness: 0.25, metalness: 0.12, clearcoat: 0.42, clearcoatRoughness: 0.22, envMapIntensity: 1.05 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xe7fbff, transparent: true, opacity: 0.88, toneMapped: false });
  const islands = [
    { x:-3.55, z:2.55, yaw:Math.PI/2, size:[2.78,.40,1.42], title:"Робот-манипулятор и реактор БРЕСТ-ОД-300",
      models:[["technology-02",[1.20,.95,1.02],[.66,.40,0]],["technology-01",[1.02,.96,.96],[-.72,.40,0]]] },
    { x:3.55, z:2.55, yaw:Math.PI/2, size:[2.92,.40,1.36], title:"Поезд «Москва-2024»", train:true },
    { x:-3.35, z:-3.55, yaw:.08, size:[2.40,.38,1.42], title:physicalModels["construction-12"].title,
      models:[["construction-12",[2.08,1.10,1.05],[0,.38,0]]] },
    { x:3.35, z:-3.55, yaw:-.08, size:[2.40,.38,1.42], title:physicalModels["construction-02"].title,
      models:[["construction-02",[2.08,1.10,1.05],[0,.38,0]]] },
    { x:0, z:5.48, yaw:0, size:[3.80,.38,2.25], title:"Москва-Сити", reference:"./assets/reference/moscow-city/",
      models:[["center-01",[3.747,2.199,2.124],[0,.38,0]]] }
  ];
  for (const spec of islands) {
    const group = new THREE.Group();
    group.position.set(spec.x,0,spec.z);
    group.rotation.y = spec.yaw;
    group.name = "Постамент · " + spec.title;
    const [width,top,depth] = spec.size;
    islandFootprints.push({x:spec.x,z:spec.z,yaw:spec.yaw,width,depth});
    const base=meshOf(new RoundedBoxGeometry(width,top,depth,6,.035),plinth,[0,top/2,0]);
    base.castShadow=true; base.receiveShadow=true; group.add(base);
    group.add(meshOf(new RoundedBoxGeometry(width+.035,.028,depth+.035,5,.029),glow,[0,.025,0]));
    let placement=(spec.z<0?"дальний ":"передний ")+(spec.x<0?"левый":"правый")+" подиум";
    if(spec.x===0) placement="передний центральный подиум";
    if (spec.train) {
      trainPanel=mountRailPanel(group,top);
      addDisplayExhibit(group,"center-03",spec.title,placement,[2.02,.65,.63],[0,trainPanel.contactY,0]);
    } else {
      for (const [asset,dims,position] of spec.models) {
        addDisplayExhibit(group,asset,physicalModels[asset]?.title || spec.title,placement,dims,position);
        if (spec.reference) physicalModels["island-"+asset].reference = spec.reference;
      }
    }
    signPlinth(group,spec.title,width,depth,top,spec.train?"Нажмите на вагон · движение пути":"");
    scene.add(group);
  }
}

function addSuspendedHeroModels(scene) {
  const cable = new THREE.MeshStandardMaterial({ color: 0x7a8589, roughness: 0.38, metalness: 0.66 });
  const fixtures = [
    {asset: "technology-03", x: -3.85, y: 5.34, z: 0.45, dims: [3.2, 1.24, 1.00], yaw: -0.18},
    {asset: "transport-09", x: 4.00, y: 5.44, z: -1.0, dims: [3.1, 2.85, 1.12], yaw: -0.34}
  ];
  for (const {asset, x, y, z, dims, yaw} of fixtures) {
    addDisplayExhibit(scene, asset, null, "подвес над экспозицией", dims, [x, y, z], yaw, "suspended");
    for (const dx of [-0.30, 0.30]) {
      scene.add(cylinderBetween([x+dx, pavilion.atriumHeight-0.10, z], [x+dx, y+dims[2]*0.55, z], 0.008, cable));
    }
  }
}

function addPlanters(scene) {
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
    // Fill the square face from the horizontal master by a centred crop. The
    // source aspect ratio and horizontal orientation are preserved: no stretch
    // and no 90-degree rotation, while the face no longer looks letterboxed.
    const viewport = { x: 0, y: 0, width: layer.width, height: layer.height };
    if (getMediaWidth(media)) drawImageCover(ctx, media, viewport.x, viewport.y, viewport.width, viewport.height);
    if (panoramaArt.naturalWidth) {
      const row = panoramaArt.naturalHeight / zones.length;
      const crop = row - 4;
      const focus = { technology: 0.26, construction: 0.68, transport: 0.20 }[zone];
      const pan = focus + 0.035 * Math.sin(panoramaTime * 0.12 + index);
      ctx.save();
      const filmMix = (1 - Math.cos(panoramaTime * Math.PI / 12)) / 2;
      ctx.globalAlpha = video?.readyState >= 2 ? 0.94 - 0.77 * filmMix : 1;
      ctx.drawImage(panoramaArt, (panoramaArt.naturalWidth - crop) * pan, row * index + 2, crop, crop,
        0, 0, layer.width, layer.height);
      ctx.restore();
    }
    const shade = ctx.createLinearGradient(0, 0, 0, layer.height);
    shade.addColorStop(0, "rgba(3,8,7,.42)");
    shade.addColorStop(0.26, "rgba(3,8,7,.04)");
    shade.addColorStop(0.68, "rgba(3,8,7,.04)");
    shade.addColorStop(1, "rgba(2,21,58,.68)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, layer.width, layer.height);
    // The safe title area is inside the diamond cutout on all six faces.
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = `600 ${layer.width * 0.053}px Oswald, Arial`;
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "#142635";
    ctx.shadowBlur = 8;
    ctx.fillText(zoneLabels[zone].toUpperCase(), layer.width * .5, layer.height * .376, layer.width * .523);
    ctx.restore();
    cubeFaceTextures[zone].needsUpdate = true;
  });
}

function drawProgramScreen(phase) {
  const upper = screenCanvases.upper;
  const lower = screenCanvases.lower;
  if (!upper || !lower) return;
  const topic = programTopics[state.programIndex] || programTopics[0];
  const metricWindow = getProgramMetricWindow(topic, phase);
  paintWall(upper, lower, panoramaTime, metricWindow.page, topic.zone, state.mode, state.programPlaying);
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

function drawImageContain(ctx, image, x, y, width, height) {
  const sourceWidth = getMediaWidth(image);
  const sourceHeight = getMediaHeight(image);
  if (!sourceWidth || !sourceHeight) return;
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
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
    drawProgramScreen(programPhase);
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
  updateProgramUi();
}

function stepProgram(direction) {
  setProgramTopic(state.programIndex + direction);
}

function toggleProgramPlayback() {
  state.programPlaying = !state.programPlaying;
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

function isNarrowScene() {
  return window.innerWidth <= 740;
}

function getCameraView(name, narrow = false) {
  const views = {
    overview: narrow
      ? { position: [0, 4.55, 17.0], target: [0, 1.00, 1.2] }
      : { position: [0, 4.85, 16.0], target: [0, 1.08, .9] },
    visitor: { position: [0, 1.65, 10.9], target: [0, 1.72, -1.25] },
    cube: narrow
      ? { position: [3.65, 2.75, 4.3], target: [0, 1.92, -0.35] }
      : { position: [4.8, 3.1, 5.4], target: [0, 1.92, -0.35] },
    technology: { position: [-3.15, 2.05, 3.25], target: [-6.12, 1.48, -1.4] },
    construction: { position: [-3.05, 2.35, -0.15], target: [0.35, 1.55, -10.05] },
    transport: { position: [3.15, 2.05, 3.25], target: [6.12, 1.48, -1.4] }
  };
  return views[name] || views.overview;
}

function focusCamera(name, camera, controls) {
  const view = getCameraView(name, isNarrowScene());
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
    const outsideIslands = islandFootprints.every(({x,z,yaw,width,depth}) => {
      const dx=point.x-x, dz=point.z-z;
      const along=dx*Math.cos(yaw)-dz*Math.sin(yaw);
      const across=dx*Math.sin(yaw)+dz*Math.cos(yaw);
      return Math.abs(along)>width/2+.18 || Math.abs(across)>depth/2+.18;
    });
    return point.x >= -5.65 && point.x <= 5.65 && point.z >= -9.45 && point.z <= 10.45 && outsideCube && outsideIslands;
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
  state.mode = ["hero", "cards", "grid"].includes(params.get("mode")) ? params.get("mode") : "film";
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
  mesh.castShadow = false;
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
