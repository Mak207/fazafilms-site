import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const ZONES = [
  { name: "Шпиль", pattern: "Гжель", color: "#2176d2" },
  { name: "Кольцевой экран", pattern: "Хохлома", color: "#e83a2f" },
  { name: "Верхний конус", pattern: "Мезень", color: "#d34a32" },
  { name: "Переход к поясу", pattern: "Городец", color: "#f5b34d" },
  { name: "Центральный пояс", pattern: "Жостово", color: "#dd5ba1" },
  { name: "Нижний конус", pattern: "Пермогорье", color: "#db5b3e" },
];

const SHOW_BEATS = [
  [0, 2, "Перехват скорости"], [2, 6, "Гжель — штрихи"],
  [6, 10, "Гжель"], [10, 12, "Переход"],
  [12, 16, "Хохлома"], [16, 18, "Переход"],
  [18, 22, "Шесть промыслов"], [22, 24, "Выход к апогею"],
  [24, 26.5, "Апогей"], [26.5, 33.5, "ХОРОВОД"],
  [33.5, 39, "Возврат в ожидание"],
];

const MODE_COPY = {
  auto: ["Автоматический цикл", "Ничего — сценарий идёт автоматически.", "Ожидание → включение шести зон → народное световое шоу → снова ожидание.", "109 секунд, затем повторяется."],
  wait: ["Режим ожидания", "Ничего. Зелёный свет приглашает подойти к пультам.", "Световые потоки спокойно поднимаются по трубкам; конструкция не вращается.", "30 секунд по кругу."],
  active: ["Участники управляют", "Двигайте шесть ползунков, тяните мышью или нажимайте клавиши 1–6.", "Каждая секция меняет направление и скорость. Когда все шесть активны 7 секунд, запускается шоу.", "До совместного запуска."],
  show: ["Народное световое шоу", "Наблюдайте или переключайте главы на шкале.", "Шесть промыслов проходят по шести раздельным секциям с разными направлениями и скоростями.", "39 секунд."],
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

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(wrap.clientWidth, wrap.clientHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.setClearColor(0x07100c, 1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x07100c, 0.035);
const camera = new THREE.PerspectiveCamera(38, wrap.clientWidth / wrap.clientHeight, 0.05, 100);
camera.position.set(8.2, 4.2, 10.5);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.target.set(0, 1.25, 0);
controls.minDistance = 5.5;
controls.maxDistance = 22;
controls.maxPolarAngle = Math.PI * 0.54;

scene.add(new THREE.HemisphereLight(0x8ee6c4, 0x17100c, 1.35));
const key = new THREE.SpotLight(0xffd4a2, 270, 35, Math.PI / 5, 0.55, 1.3);
key.position.set(7, 12, 6); key.target.position.set(0, 1.4, 0); key.castShadow = true;
key.shadow.mapSize.set(1024, 1024); scene.add(key, key.target);
const rim = new THREE.PointLight(0x5dd9ff, 75, 20, 2); rim.position.set(-6, 5, -5); scene.add(rim);

const environment = new THREE.Group();
scene.add(environment);
const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 96), new THREE.MeshStandardMaterial({ color: 0x15191a, roughness: 0.72, metalness: 0.1 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -3.4; floor.receiveShadow = true; environment.add(floor);
const halo = new THREE.Mesh(new THREE.RingGeometry(3.1, 4.5, 96), new THREE.MeshBasicMaterial({ color: 0x3a160a, transparent: true, opacity: 0.32, side: THREE.DoubleSide }));
halo.rotation.x = -Math.PI / 2; halo.position.y = -3.37; environment.add(halo);
const wallMat = new THREE.MeshStandardMaterial({ color: 0x171b1b, roughness: 0.88 });
const backWall = new THREE.Mesh(new THREE.PlaneGeometry(24, 13), wallMat); backWall.position.set(0, 2.6, -8); environment.add(backWall);
const sideWall = new THREE.Mesh(new THREE.PlaneGeometry(17, 13), wallMat); sideWall.rotation.y = Math.PI / 2; sideWall.position.set(-9, 2.6, -0.5); environment.add(sideWall);

for (let i = 0; i < 6; i++) {
  const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
  const pult = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.9, 24), new THREE.MeshPhysicalMaterial({ color: 0xc54419, roughness: 0.28, clearcoat: 0.45 }));
  body.castShadow = true; pult.add(body);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.1, 32), new THREE.MeshStandardMaterial({ color: 0xe7d8bd, roughness: 0.38 }));
  top.position.y = 0.49; top.castShadow = true; pult.add(top);
  const light = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 20), new THREE.MeshBasicMaterial({ color: ZONES[i].color }));
  light.position.y = 0.56; pult.add(light);
  pult.position.set(Math.cos(a) * 4.2, -2.9, Math.sin(a) * 4.2); environment.add(pult);
}

const support = new THREE.Group(); environment.add(support);
const supportMat = new THREE.MeshStandardMaterial({ color: 0x151515, metalness: 0.65, roughness: 0.35 });
for (let i = 0; i < 6; i++) {
  const a = i / 6 * Math.PI * 2;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 5.9, 10), supportMat);
  post.position.set(Math.cos(a) * 0.65, -0.4, Math.sin(a) * 0.65); post.castShadow = true; support.add(post);
}

const spinner = new THREE.Group();
spinner.position.y = 0;
scene.add(spinner);
const rings = [];
const ringMaterials = [];
const state = {
  mode: "auto", elapsed: 0, modeStart: performance.now(), last: performance.now(),
  tubeMm: 30, gapMm: 20, shellOpacity: 0.32, diffuseX: 0.18, diffuseY: 0.10,
  zoneSpeeds: [36, -54, 72, -44, 61, -32], zonePhases: [0, 0, 0, 0, 0, 0],
  activeTogether: 0, recording: false, transparent: false,
};

function radiusProfile(u) {
  if (u < 0.10) return THREE.MathUtils.lerp(0.38, 0.78, u / 0.10);
  if (u < 0.25) return THREE.MathUtils.lerp(0.78, 2.65, (u - 0.10) / 0.15);
  if (u < 0.38) return THREE.MathUtils.lerp(2.65, 2.35, (u - 0.25) / 0.13);
  if (u < 0.58) return THREE.MathUtils.lerp(2.35, 1.35, (u - 0.38) / 0.20);
  if (u < 0.79) return THREE.MathUtils.lerp(1.35, 0.58, (u - 0.58) / 0.21);
  return 0.58;
}

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
  const scale = 0.00148;
  const tube = state.tubeMm * scale;
  const pitch = (state.tubeMm + state.gapMm) * scale;
  const fullHeight = pitch * 89;
  for (let i = 0; i < 90; i++) {
    const u = i / 89;
    const radius = radiusProfile(u);
    const geometry = new THREE.TorusGeometry(radius, tube * 0.43, 6, 128);
    const shellGeometry = geometry.clone();
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const internalMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.96, toneMapped: false });
    const shellMat = new THREE.MeshPhysicalMaterial({ color: 0xe8e4dc, roughness: 0.82, transmission: 0.38, transparent: true, opacity: state.shellOpacity, thickness: tube * 0.5, side: THREE.DoubleSide, depthWrite: false });
    ringMaterials.push(internalMat, shellMat);
    const internal = new THREE.Mesh(geometry, internalMat);
    const shell = new THREE.Mesh(shellGeometry, shellMat);
    internal.rotation.x = shell.rotation.x = Math.PI / 2;
    internal.scale.setScalar(0.84);
    shell.castShadow = true;
    const group = new THREE.Group();
    group.position.y = i * pitch - fullHeight * 0.5;
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
  if (t < 2) return 2;
  return (zone + Math.floor(Math.max(0, t - 2) / 6.2)) % 6;
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
  if (index < 0 || index > 5 || event.repeat) return;
  setMode("active");
  state.zoneSpeeds[index] = Math.abs(state.zoneSpeeds[index]) > 8 ? -state.zoneSpeeds[index] : [36, -54, 72, -44, 61, -32][index];
  ZONES[index].input.value = state.zoneSpeeds[index]; updateZoneUI();
});

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
  controls.reset(); camera.position.set(8.2, 4.2, 10.5); controls.target.set(0, 1.25, 0); controls.update();
  statusEl.textContent = "Возвращены физические параметры проекта: D30, просвет 20 мм, 90 раздельных трубок.";
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
    environment.visible = true; scene.fog = new THREE.FogExp2(0x07100c, 0.035); renderer.setClearColor(0x07100c, 1);
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
  const width = wrap.clientWidth, height = wrap.clientHeight;
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

