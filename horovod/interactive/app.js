import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const ZONES = [
  { name: "Нижняя опора", pattern: "Мезень", color: "#c8452d" },
  { name: "Нижний пояс", pattern: "Хохлома", color: "#e8a32f" },
  { name: "Широкий экран", pattern: "Гжель", color: "#2c6fc2" },
  { name: "Переход", pattern: "Городец", color: "#46a0ad" },
  { name: "Верхний конус", pattern: "Жостово", color: "#cb4e84" },
  { name: "Шпиль", pattern: "Пермогорье", color: "#d95b37" },
];

const SHOW_BEATS = [
  [0, 4, "Мезень"], [4, 8, "Хохлома"], [8, 12, "Гжель"],
  [12, 16, "Городец"], [16, 20, "Жостово"], [20, 24, "Пермогорье"],
  [24, 30, "Финальный хоровод"], [30, 39, "Возврат в ожидание"],
];

const MODE_COPY = {
  auto: ["Автоматический цикл", "Ничего — сценарий идёт автоматически.", "Ожидание → включение шести зон → шесть народных орнаментов по очереди → снова ожидание.", "109 секунд, затем повторяется."],
  wait: ["Режим ожидания", "Ничего. Зелёный свет приглашает подойти к пультам.", "Световые потоки спокойно поднимаются по трубкам; конструкция не вращается.", "30 секунд по кругу."],
  active: ["Участники управляют", "Двигайте шесть ползунков, тяните мышью или нажимайте клавиши 1–6.", "Каждая секция меняет направление и скорость. Когда все шесть активны 7 секунд, запускается шоу.", "До совместного запуска."],
  show: ["Народное световое шоу", "Наблюдайте или переключайте промыслы на шкале.", "Мезень, Хохлома, Гжель, Городец, Жостово и Пермогорье заполняют все 90 трубок по очереди.", "39 секунд."],
};

const canvas = document.querySelector("#stage");
const wrap = document.querySelector("#stage-wrap");
const statusEl = document.querySelector("#status");
const badgeEl = document.querySelector("#stage-badge");
const chapterEl = document.querySelector("#chapter");
const clockEl = document.querySelector("#clock");
const progressEl = document.querySelector("#progress");
const timelineEl = document.querySelector("#timeline");
const zoneListEl = document.querySelector("#zone-list");
const referenceImage = document.querySelector("#reference-image");
const referenceCounter = document.querySelector("#reference-counter");
const initialStageWidth = Math.max(1, wrap.clientWidth);
const initialStageHeight = Math.max(1, wrap.clientHeight);

document.querySelectorAll(".reference-thumb").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".reference-thumb").forEach((item) => item.classList.toggle("active", item === button));
    referenceImage.style.opacity = "0.25";
    window.setTimeout(() => {
      referenceImage.src = button.dataset.src;
      referenceImage.alt = button.dataset.alt;
      referenceCounter.textContent = button.dataset.count;
      referenceImage.style.opacity = "1";
    }, 120);
  });
});

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(initialStageWidth, initialStageHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.setClearColor(0x15130f, 1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x15130f, 0.026);
const camera = new THREE.PerspectiveCamera(36, initialStageWidth / initialStageHeight, 0.05, 100);
camera.position.set(7.4, 5.2, 8.8);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.target.set(0, 2.35, 0);
controls.minDistance = 3.2;
controls.maxDistance = 18;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minPolarAngle = Math.PI * 0.05;
controls.saveState();

scene.add(new THREE.HemisphereLight(0xffead2, 0x19140f, 1.48));
const key = new THREE.SpotLight(0xffdfb7, 330, 34, Math.PI / 5, 0.5, 1.15);
key.position.set(6.5, 11, 5.5); key.target.position.set(0, 2.2, 0); key.castShadow = true;
key.shadow.mapSize.set(1024, 1024); scene.add(key, key.target);
const rim = new THREE.PointLight(0x80b4d7, 54, 18, 1.7); rim.position.set(-5.5, 4.6, -4.5); scene.add(rim);
const warmFill = new THREE.PointLight(0xff7b3d, 34, 13, 1.7); warmFill.position.set(4.5, 2.8, 3.8); scene.add(warmFill);

const environment = new THREE.Group();
scene.add(environment);
const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 128), new THREE.MeshStandardMaterial({ color: 0x24211c, roughness: 0.72, metalness: 0.04 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -0.03; floor.receiveShadow = true; environment.add(floor);
const halo = new THREE.Mesh(new THREE.RingGeometry(2.0, 3.25, 128), new THREE.MeshBasicMaterial({ color: 0x6b2c15, transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
halo.rotation.x = -Math.PI / 2; halo.position.y = -0.015; environment.add(halo);
const wallMat = new THREE.MeshStandardMaterial({ color: 0x5d584d, roughness: 0.92 });
const backWall = new THREE.Mesh(new THREE.PlaneGeometry(22, 10), wallMat); backWall.position.set(0, 4.0, -6.2); environment.add(backWall);
for (let x = -10; x <= 10; x += 2) {
  const joint = new THREE.Mesh(new THREE.BoxGeometry(0.014, 8, 0.018), new THREE.MeshStandardMaterial({ color: 0x26231f, roughness: 0.8 }));
  joint.position.set(x, 4, -6.18); environment.add(joint);
}

const support = new THREE.Group(); environment.add(support);
const supportMat = new THREE.MeshStandardMaterial({ color: 0x101010, metalness: 0.72, roughness: 0.34 });
const baseHoop = new THREE.Mesh(new THREE.TorusGeometry(1.95, 0.045, 8, 96), supportMat);
baseHoop.rotation.x = Math.PI / 2; baseHoop.position.y = 0.16; baseHoop.castShadow = true; support.add(baseHoop);
const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.22, 48), supportMat);
hub.position.y = 0.18; hub.castShadow = true; support.add(hub);
for (let i = 0; i < 12; i++) {
  const a = i / 12 * Math.PI * 2;
  const spoke = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.055, 0.08), supportMat);
  spoke.position.set(Math.cos(a) * 0.93, 0.19, Math.sin(a) * 0.93);
  spoke.rotation.y = -a; spoke.castShadow = true; support.add(spoke);
}

const controllerRig = new THREE.Group();
environment.add(controllerRig);
new GLTFLoader().load(
  "assets/horovod-controllers-v13.glb",
  (gltf) => {
    controllerRig.add(gltf.scene);
    gltf.scene.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });
    statusEl.textContent = "Точный профиль v13 и шесть пультов из мастер‑сцены загружены.";
  },
  undefined,
  () => { statusEl.textContent = "Профиль v13 загружен; модель пультов будет показана после обновления соединения."; },
);

const spinner = new THREE.Group();
spinner.position.y = 0;
scene.add(spinner);
const rings = [];
const ringMaterials = [];
// Measured from the 90 physical tube objects in the approved v13 Blender
// scene (circumference / 2π), bottom to top.  This replaces the former smooth
// approximation and preserves the characteristic brim, transitions and spire.
const RING_RADII = [
  0.248931,0.250278,0.257146,0.26088,0.267113,0.275353,0.282512,0.295021,0.310365,0.327232,
  0.349519,0.375119,0.405049,0.438969,0.47934,0.525619,0.588618,0.659952,0.778927,0.929932,
  1.249501,1.719874,1.719874,1.719874,1.719314,1.719874,1.719314,1.67933,1.448477,1.259497,
  1.119553,0.999601,0.899641,0.819673,0.749457,0.699493,0.649741,0.619551,0.599565,0.589765,
  0.569216,0.569773,0.578081,0.589188,0.519285,0.44982,0.409569,0.39971,0.389087,0.379848,
  0.369732,0.359505,0.34918,0.338875,0.329976,0.319768,0.31367,0.307977,0.299685,0.28979,
  0.279615,0.26998,0.259896,0.255898,0.247901,0.233754,0.203522,0.20978,0.217842,0.225983,
  0.209916,0.15189,0.15135,0.151791,0.151989,0.149794,0.147796,0.145942,0.143802,0.14199,
  0.13999,0.139807,0.139807,0.139043,0.13777,0.13799,0.135946,0.13399,0.131606,0.12999,
];
const state = {
  mode: "auto", elapsed: 0, modeStart: performance.now(), last: performance.now(),
  tubeMm: 30, gapMm: 20, shellOpacity: 0.32, diffuseX: 0.18, diffuseY: 0.10,
  zoneSpeeds: [36, -54, 72, -44, 61, -32], zonePhases: [0, 0, 0, 0, 0, 0],
  activeTogether: 0, recording: false, transparent: false,
};

function disposeRings() {
  for (const ring of rings) {
    ring.internal.geometry.dispose(); ring.shell.geometry.dispose();
    spinner.remove(ring.group);
  }
  for (const m of ringMaterials) m.dispose();
  rings.length = 0; ringMaterials.length = 0;
}

function buildRings() {
  disposeRings();
  const tube = state.tubeMm / 1000;
  const pitch = (state.tubeMm + state.gapMm) / 1000;
  for (let i = 0; i < 90; i++) {
    const u = i / 89;
    const radius = RING_RADII[i];
    const geometry = new THREE.TorusGeometry(radius, tube * 0.5, 8, 128);
    const shellGeometry = geometry.clone();
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const internalMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.96, toneMapped: false });
    const shellMat = new THREE.MeshPhysicalMaterial({ color: 0xe8e4dc, roughness: 0.82, transmission: 0.38, transparent: true, opacity: state.shellOpacity, thickness: tube * 0.5, side: THREE.DoubleSide, depthWrite: false });
    ringMaterials.push(internalMat, shellMat);
    const internal = new THREE.Mesh(geometry, internalMat);
    const shell = new THREE.Mesh(shellGeometry, shellMat);
    internal.rotation.x = shell.rotation.x = Math.PI / 2;
    internal.scale.setScalar(0.78);
    shell.castShadow = true;
    const group = new THREE.Group();
    group.position.y = 0.54 + i * pitch;
    group.add(internal, shell); spinner.add(group);
    rings.push({ group, internal, shell, index: i, zone: Math.min(5, Math.floor(i / 15)), u, radius });
  }
}

const clamp01 = v => Math.max(0, Math.min(1, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mixInto = (out, a, b, t) => out.copy(a).lerp(b, clamp01(t));
const C = hex => new THREE.Color(hex);
const palette = {
  cream: C("#f3d8a5"), white: C("#e7ecf2"), blue: C("#1452a4"), navy: C("#071c45"),
  red: C("#d73425"), darkRed: C("#751b19"), gold: C("#e2a72e"), black: C("#100d0b"),
  green: C("#1f8a4c"), pink: C("#d94e8f"), cyan: C("#2a9fb0"), orange: C("#e96929"),
  waitDark: C("#07271a"), waitLight: C("#73f6a7"),
};

function motif(out, pattern, theta, v, time, zone) {
  const blur = state.diffuseX * 0.45;
  const q = theta + state.zonePhases[zone];
  const wave = Math.sin(q * (4 + zone) + Math.sin(v * 18 - time * 0.3) * 1.3);
  const flower = Math.max(0, Math.cos(q * 6 + v * 9) * Math.cos(v * 20 - q * 2));
  if (pattern === 0) {
    const ink = smooth(0.30 + blur, 0.72 - blur * 0.3, Math.abs(Math.sin(q * 3 + v * 13) * Math.cos(q * 7 - v * 5)));
    return mixInto(out, palette.white, flower > 0.55 ? palette.navy : palette.blue, ink * 0.92);
  }
  if (pattern === 1) {
    const vine = smooth(0.46 + blur, 0.82, Math.sin(q * 5 + v * 16) * 0.5 + 0.5);
    const berry = flower > 0.58 ? 1 : 0;
    return berry ? out.copy(palette.red) : mixInto(out, palette.black, palette.gold, vine);
  }
  if (pattern === 2) {
    const geometry = Math.abs(Math.sin(q * 8) * Math.sin(v * 26));
    return out.copy(geometry > 0.48 + blur ? (wave > 0 ? palette.red : palette.black) : palette.cream);
  }
  if (pattern === 3) {
    const petals = smooth(0.38 + blur, 0.72, flower);
    const accent = wave > 0 ? palette.pink : palette.cyan;
    return mixInto(out, palette.cream, accent, petals * 0.95);
  }
  if (pattern === 4) {
    const petals = smooth(0.34 + blur, 0.65, flower);
    const accent = Math.sin(q * 4 + v * 7) > 0 ? palette.pink : palette.orange;
    return mixInto(out, palette.black, accent, petals);
  }
  const braid = Math.abs(Math.sin(q * 5 + v * 19));
  return out.copy(braid > 0.48 + blur ? (wave > 0 ? palette.red : palette.darkRed) : palette.cream);
}

function waitColor(out, theta, v, time, zone) {
  const lava = Math.sin(theta * 3 + v * 16 - time * 1.1 + zone) * 0.5 + 0.5;
  return mixInto(out, palette.waitDark, palette.waitLight, smooth(0.32, 0.83, lava));
}

function effectiveModeTime(now) {
  state.elapsed = (now - state.modeStart) / 1000;
  if (state.mode !== "auto") return { mode: state.mode, time: state.elapsed };
  const t = state.elapsed % 109;
  if (t < 30) return { mode: "wait", time: t };
  if (t < 70) return { mode: "active", time: t - 30 };
  return { mode: "show", time: t - 70 };
}

function showPattern(zone, t) {
  if (t < 24) return Math.min(5, Math.floor(t / 4));
  if (t < 30) return zone;
  return 5;
}

function updateColors(mode, t) {
  const tmp = new THREE.Color();
  const other = new THREE.Color();
  const rpmByZone = mode === "show" ? [32, -48, 64, -38, 54, -72] : state.zoneSpeeds;
  for (let z = 0; z < 6; z++) state.zonePhases[z] += rpmByZone[z] * 0.00012;
  for (const ring of rings) {
    const pos = ring.internal.geometry.attributes.position;
    const colors = ring.internal.geometry.attributes.color;
    const zone = ring.zone;
    const ringBlend = state.diffuseY;
    for (let i = 0; i < pos.count; i++) {
      const theta = Math.atan2(pos.getY(i), pos.getX(i));
      const v = ring.u;
      if (mode === "wait") waitColor(tmp, theta, v, t, zone);
      else {
        const p = mode === "show" ? showPattern(zone, t) : zone;
        motif(tmp, p, theta, v, t, zone);
        if (ringBlend > 0) {
          motif(other, p, theta, v + 1 / 89, t, zone);
          tmp.lerp(other, ringBlend * 0.4);
        }
      }
      tmp.multiplyScalar(mode === "wait" ? 0.9 : 1.25);
      colors.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    colors.needsUpdate = true;
    ring.shell.material.opacity = state.shellOpacity;
    ring.group.rotation.y = mode === "wait" ? 0 : state.zonePhases[zone];
  }
}

function createZoneControls() {
  ZONES.forEach((zone, index) => {
    const el = document.createElement("article");
    el.className = "zone";
    el.style.setProperty("--strip", `repeating-linear-gradient(90deg,${zone.color} 0 7px,#f2d38f 7px 12px,#171717 12px 15px)`);
    el.innerHTML = `<div class="dial"><i></i><b>${index + 1}</b></div><h2>${zone.name}</h2><output>${zone.pattern} · 0 об/мин</output><input aria-label="${zone.name}" type="range" min="-100" max="100" value="${state.zoneSpeeds[index]}"><div class="pattern-strip"></div>`;
    const input = el.querySelector("input");
    input.addEventListener("input", () => {
      state.zoneSpeeds[index] = Number(input.value);
      if (state.mode !== "active") setMode("active");
      updateZoneUI();
    });
    zoneListEl.append(el);
    zone.el = el; zone.input = input; zone.output = el.querySelector("output"); zone.needle = el.querySelector(".dial i");
  });
}

function updateZoneUI(autoActiveTime = null) {
  ZONES.forEach((zone, i) => {
    let speed = state.zoneSpeeds[i];
    if (autoActiveTime !== null) {
      const enabled = autoActiveTime > i * 4.2;
      speed = enabled ? [36, -54, 72, -44, 61, -32][i] : 0;
      state.zoneSpeeds[i] = speed;
      zone.input.value = speed;
    }
    zone.el.classList.toggle("active", Math.abs(speed) > 8);
    zone.needle.style.setProperty("--angle", `${speed * 1.05}deg`);
    zone.output.textContent = `${zone.pattern} · ${speed > 0 ? "+" : ""}${Math.round(speed * 0.42)} об/мин`;
  });
}

SHOW_BEATS.forEach(([start, end, title], index) => {
  const button = document.createElement("button");
  button.type = "button"; button.textContent = `${start}–${end} ${title}`;
  button.addEventListener("click", () => { setMode("show"); state.modeStart = performance.now() - start * 1000; });
  timelineEl.append(button); SHOW_BEATS[index].button = button;
});

function setMode(mode) {
  state.mode = mode; state.modeStart = performance.now(); state.elapsed = 0; state.activeTogether = 0;
  document.querySelectorAll(".mode").forEach(button => button.classList.toggle("active", button.dataset.mode === mode));
  const copy = MODE_COPY[mode];
  chapterEl.textContent = copy[0];
  document.querySelector("#what-press").textContent = copy[1];
  document.querySelector("#what-happens").textContent = copy[2];
  document.querySelector("#how-long").textContent = copy[3];
  badgeEl.textContent = mode === "auto" ? "АВТО" : mode === "wait" ? "ОЖИДАНИЕ" : mode === "active" ? "УПРАВЛЕНИЕ" : "ШОУ";
}

document.querySelectorAll(".mode").forEach(button => button.addEventListener("click", () => setMode(button.dataset.mode)));
document.addEventListener("keydown", event => {
  const index = Number(event.key) - 1;
  if (!Number.isInteger(index) || index < 0 || index > 5 || event.repeat) return;
  setMode("active");
  state.zoneSpeeds[index] = Math.abs(state.zoneSpeeds[index]) > 8 ? -state.zoneSpeeds[index] : [36, -54, 72, -44, 61, -32][index];
  ZONES[index].input.value = state.zoneSpeeds[index]; updateZoneUI();
});

const CAMERA_VIEWS = {
  hero: { position: new THREE.Vector3(7.4, 5.2, 8.8), target: new THREE.Vector3(0, 2.35, 0) },
  top: { position: new THREE.Vector3(0.2, 10.4, 4.8), target: new THREE.Vector3(0, 2.05, 0) },
  eye: { position: new THREE.Vector3(8.4, 2.75, 6.4), target: new THREE.Vector3(0, 2.15, 0) },
  detail: { position: new THREE.Vector3(3.1, 3.0, 3.7), target: new THREE.Vector3(0.35, 2.65, 0) },
};

function setCameraView(name) {
  const preset = CAMERA_VIEWS[name];
  if (!preset) return;
  document.querySelectorAll(".view").forEach((button) => button.classList.toggle("active", button.dataset.view === name));
  const fromPosition = camera.position.clone();
  const fromTarget = controls.target.clone();
  const started = performance.now();
  controls.enabled = false;
  const move = (now) => {
    const raw = Math.min(1, (now - started) / 680);
    const eased = 1 - Math.pow(1 - raw, 3);
    camera.position.lerpVectors(fromPosition, preset.position, eased);
    controls.target.lerpVectors(fromTarget, preset.target, eased);
    controls.update();
    if (raw < 1) requestAnimationFrame(move);
    else controls.enabled = true;
  };
  requestAnimationFrame(move);
}

document.querySelectorAll(".view").forEach((button) => button.addEventListener("click", () => setCameraView(button.dataset.view)));

function bindRange(id, key, suffix, rebuild = false) {
  const input = document.querySelector(`#${id}`); const out = document.querySelector(`#${id}-out`);
  input.addEventListener("input", () => {
    const raw = Number(input.value); state[key] = key.includes("Opacity") || key.startsWith("diffuse") ? raw / 100 : raw;
    out.textContent = `${raw} ${suffix}`; if (rebuild) buildRings();
  });
}
bindRange("tube", "tubeMm", "мм", true); bindRange("gap", "gapMm", "мм", true);
bindRange("shell", "shellOpacity", "%"); bindRange("diff-x", "diffuseX", "%"); bindRange("diff-y", "diffuseY", "%");

document.querySelector("#reset-view").addEventListener("click", () => {
  const values = { tube: 30, gap: 20, shell: 32, "diff-x": 18, "diff-y": 10 };
  Object.entries(values).forEach(([id, value]) => { const el = document.querySelector(`#${id}`); el.value = value; el.dispatchEvent(new Event("input")); });
  setCameraView("hero");
  statusEl.textContent = "Возвращены параметры мастер‑сцены: D30, просвет 20 мм, 90 раздельных трубок и профиль v13.";
});

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}

document.querySelector("#snapshot").addEventListener("click", () => {
  renderer.render(scene, camera);
  canvas.toBlob(blob => { if (blob) downloadBlob(blob, "horovod-interactive.png"); }, "image/png");
  statusEl.textContent = "PNG-снимок подготовлен.";
});

async function recordTransparent(seconds, name) {
  if (state.recording) return;
  if (!canvas.captureStream || !window.MediaRecorder) { statusEl.textContent = "Запись WebM не поддерживается этим браузером."; return; }
  state.recording = true; environment.visible = false; scene.fog = null; renderer.setClearColor(0x000000, 0);
  const stream = canvas.captureStream(30);
  const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
  const chunks = []; recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
  recorder.onstop = () => {
    downloadBlob(new Blob(chunks, { type: mime }), name);
    environment.visible = true; scene.fog = new THREE.FogExp2(0x15130f, 0.026); renderer.setClearColor(0x15130f, 1);
    state.recording = false; statusEl.textContent = `Видео ${seconds} с сохранено. Прозрачность WebM зависит от браузера.`;
  };
  recorder.start(250); statusEl.textContent = `Запись ${seconds} секунд…`; setTimeout(() => recorder.stop(), seconds * 1000);
}

document.querySelector("#record").addEventListener("click", () => recordTransparent(8, "horovod-stage-transparent.webm"));
document.querySelector("#test-bundle").addEventListener("click", () => {
  const spec = {
    project: "Интерактивный Хоровод", exportedAt: new Date().toISOString(), rings: 90,
    tubeDiameterMm: state.tubeMm, airGapMm: state.gapMm, pitchMm: state.tubeMm + state.gapMm,
    ledPositionsPerMeter: 48, estimatedPixels: 13712, zones: ZONES.map((z, i) => ({ id: i + 1, name: z.name, pattern: z.pattern, speed: state.zoneSpeeds[i] })),
    note: "Смешивание выполняется внутри каждой трубки и не закрывает реальные воздушные просветы."
  };
  downloadBlob(new Blob([JSON.stringify(spec, null, 2)], { type: "application/json" }), "horovod-test-settings.json");
  recordTransparent(6, "horovod-test-stage.webm");
});

function updateScenario(effective, delta) {
  const { mode, time } = effective;
  let duration = mode === "wait" ? 30 : mode === "show" ? 39 : mode === "active" ? 40 : 109;
  let displayTime = time;
  if (state.mode === "auto") {
    displayTime = state.elapsed % 109; duration = 109;
    chapterEl.textContent = mode === "wait" ? "Авто · ожидание" : mode === "active" ? "Авто · участники включают зоны" : "Авто · народное шоу";
    if (mode === "active") updateZoneUI(time);
  }
  if (state.mode === "active") {
    const allActive = state.zoneSpeeds.every(speed => Math.abs(speed) > 8);
    state.activeTogether = allActive ? state.activeTogether + delta : 0;
    chapterEl.textContent = allActive ? `Совместный запуск: ${Math.max(0, 7 - state.activeTogether).toFixed(1)} с` : "Включите все шесть зон";
    if (state.activeTogether >= 7) setMode("show");
  }
  if (mode === "show") {
    const beatIndex = SHOW_BEATS.findIndex(([start, end]) => time >= start && time < end);
    SHOW_BEATS.forEach((beat, i) => beat.button.classList.toggle("current", i === beatIndex));
    if (beatIndex >= 0) badgeEl.textContent = SHOW_BEATS[beatIndex][2].toUpperCase();
    if (state.mode === "show" && time >= 39) setMode("wait");
  } else SHOW_BEATS.forEach(beat => beat.button.classList.remove("current"));
  clockEl.textContent = `${displayTime.toFixed(1).replace(".", ",")} / ${duration} с`;
  progressEl.style.width = `${Math.min(100, (displayTime / duration) * 100)}%`;
  return mode;
}

function resize() {
  const width = Math.max(1, wrap.clientWidth), height = Math.max(1, wrap.clientHeight);
  const pixelRatio = Math.min(devicePixelRatio, 2);
  if (canvas.width !== Math.floor(width * pixelRatio) || canvas.height !== Math.floor(height * pixelRatio)) {
    renderer.setPixelRatio(pixelRatio); renderer.setSize(width, height, false);
    camera.aspect = width / height; camera.updateProjectionMatrix();
  }
}

function animate(now) {
  const delta = Math.min(0.05, (now - state.last) / 1000); state.last = now;
  resize(); const effective = effectiveModeTime(now); const visibleMode = updateScenario(effective, delta);
  updateColors(visibleMode, effective.time); controls.update(); renderer.render(scene, camera);
}

createZoneControls(); updateZoneUI(); buildRings(); setMode("auto");
renderer.setAnimationLoop(animate);

