import * as THREE from 'three';

/**
 * Monorail for the Park Impressions viewer. Three.js r180, metres, Y up.
 * The alignment is a presentation reconstruction, not a surveyed CAD axis.
 * No DOM, animation loop, network dependency, or substitute wagon is created.
 */
export const DEFAULT_ROUTE_CONFIG = Object.freeze({
  centerX: 5, centerZ: -15.75, width: 46, length: 99.5,
  cornerRadius: 22.5, height: 19.2, floorHeight: 13.2,
});

export const TRAM_CONSTANTS = Object.freeze({
  vehicleLength: 12,
  vehicleCount: 2,
  baseSpeed: 3,
  maxDeltaSeconds: 0.1,
  maxSpeedMultiplier: 4,
  beamWidth: 0.95,
  beamDepth: 0.72,
  runningSurfaceWidth: 0.30,
  runningSurfaceDepth: 0.06,
  supportSpacing: 12,
  geometryStep: 0.9,
});

const UP = new THREE.Vector3(0, 1, 0);
const modulo = (value, length) => ((value % length) + length) % length;

function finiteNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`Монорельс: ${name} должен быть конечным числом.`);
  }
  return value;
}

function normalizedConfig(input = {}) {
  const config = { ...DEFAULT_ROUTE_CONFIG };
  for (const key of Object.keys(config)) {
    if (input[key] !== undefined) config[key] = finiteNumber(input[key], key);
  }
  if (config.width <= 0 || config.length <= 0) {
    throw new RangeError('Монорельс: width и length должны быть положительными.');
  }
  if (config.cornerRadius <= 0 || config.cornerRadius > Math.min(config.width, config.length) / 2) {
    throw new RangeError('Монорельс: cornerRadius должен быть > 0 и не больше половины меньшего габарита.');
  }
  if (config.height - config.floorHeight <= 1.2) {
    throw new RangeError('Монорельс: между floorHeight и верхом направляющей height требуется более 1,2 м.');
  }
  return Object.freeze(config);
}

/**
 * Exact arc-length route: four lines and four quarter circles in XZ.
 * width/length are centreline extents, height is the TOP of the running surface.
 * The initial point is on the +X side, heading +Z. The direction is a demo choice.
 * Curvature changes at line/arc joins; position and unit tangent are continuous.
 */
export function createRoundedRectangleRoute(input = {}) {
  const config = normalizedConfig(input);
  const { centerX: cx, centerZ: cz, width, length, cornerRadius: r, height } = config;
  const hx = width / 2, hz = length / 2;
  const segments = [];
  let total = 0;
  const add = segment => {
    if (segment.length <= 1e-12) return;
    segments.push(Object.freeze({ ...segment, start: total, end: total + segment.length }));
    total += segment.length;
  };
  const line = (x, z, tx, tz, distance) => add({ type: 'line', x, z, tx, tz, length: distance });
  const arc = (x, z, angle) => add({ type: 'arc', x, z, angle, radius: r, length: Math.PI * r / 2 });

  line(cx + hx, cz - hz + r, 0, 1, length - 2 * r);
  arc(cx + hx - r, cz + hz - r, 0);
  line(cx + hx - r, cz + hz, -1, 0, width - 2 * r);
  arc(cx - hx + r, cz + hz - r, Math.PI / 2);
  line(cx - hx, cz + hz - r, 0, -1, length - 2 * r);
  arc(cx - hx + r, cz - hz + r, Math.PI);
  line(cx - hx + r, cz - hz, 1, 0, width - 2 * r);
  arc(cx + hx - r, cz - hz + r, Math.PI * 1.5);

  function sampleDistance(distance, target) {
    finiteNumber(distance, 'distance');
    const d = modulo(distance, total);
    const segment = segments.find(item => d < item.end) || segments[segments.length - 1];
    const local = Math.max(0, Math.min(segment.length, d - segment.start));
    const result = target || { position: new THREE.Vector3(), tangent: new THREE.Vector3() };
    if (segment.type === 'line') {
      result.position.set(segment.x + segment.tx * local, height, segment.z + segment.tz * local);
      result.tangent.set(segment.tx, 0, segment.tz);
    } else {
      const angle = segment.angle + local / segment.radius;
      result.position.set(segment.x + r * Math.cos(angle), height, segment.z + r * Math.sin(angle));
      result.tangent.set(-Math.sin(angle), 0, Math.cos(angle));
    }
    result.distance = d;
    result.phase = d / total;
    // Three.js positive Y rotation maps the wagon's +Z nose to this tangent.
    result.heading = Math.atan2(result.tangent.x, result.tangent.z);
    return result;
  }

  return Object.freeze({
    config,
    length: total,
    segments: Object.freeze(segments),
    sampleDistance,
    getPointAt(phase, target = new THREE.Vector3()) {
      return target.copy(sampleDistance(finiteNumber(phase, 'phase') * total).position);
    },
    getTangentAt(phase, target = new THREE.Vector3()) {
      return target.copy(sampleDistance(finiteNumber(phase, 'phase') * total).tangent);
    },
  });
}

function routeStations(route) {
  const result = [];
  // Every exact line/arc boundary is represented; no smoothing spline cuts corners.
  for (const segment of route.segments) {
    const count = Math.max(1, Math.ceil(segment.length / TRAM_CONSTANTS.geometryStep));
    for (let i = 0; i < count; i++) result.push(route.sampleDistance(segment.start + segment.length * i / count));
  }
  result.push(route.sampleDistance(0));
  return result;
}

/** Closed rectangular sweep, with explicit hard top/bottom edges and smooth side normals. */
function sweptRectangle(stations, width, top, bottom) {
  const positions = [], normals = [], indices = [];
  const half = width / 2;
  function at(s, offset, y) {
    return [s.position.x + s.tangent.z * offset, y, s.position.z - s.tangent.x * offset];
  }
  function quad(points, faceNormals) {
    const base = positions.length / 3;
    for (let i = 0; i < 4; i++) { positions.push(...points[i]); normals.push(...faceNormals[i]); }
    const u = points[1].map((v, i) => v - points[0][i]);
    const v = points[2].map((v, i) => v - points[0][i]);
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const forward = cross.reduce((sum, value, i) => sum + value * faceNormals[0][i], 0) >= 0;
    if (forward) indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  const yUp = [0, 1, 0], yDown = [0, -1, 0];
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i], b = stations[i + 1];
    const ar = [a.tangent.z, 0, -a.tangent.x], br = [b.tangent.z, 0, -b.tangent.x];
    const al = ar.map(value => -value), bl = br.map(value => -value);
    quad([at(a, -half, top), at(b, -half, top), at(b, half, top), at(a, half, top)], [yUp, yUp, yUp, yUp]);
    quad([at(a, -half, bottom), at(b, -half, bottom), at(b, half, bottom), at(a, half, bottom)], [yDown, yDown, yDown, yDown]);
    quad([at(a, half, bottom), at(b, half, bottom), at(b, half, top), at(a, half, top)], [ar, br, br, ar]);
    quad([at(a, -half, bottom), at(b, -half, bottom), at(b, -half, top), at(a, -half, top)], [al, bl, bl, al]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function buildMonorail(route, supportFloorHeight) {
  const group = new THREE.Group();
  group.name = 'Монорельс — одна центральная направляющая';
  const c = TRAM_CONSTANTS, { height, floorHeight } = route.config;
  const beamTop = height - c.runningSurfaceDepth, beamBottom = beamTop - c.beamDepth;
  const stations = routeStations(route);
  const concrete = new THREE.MeshStandardMaterial({ color: 0xd2cabb, roughness: 0.88, metalness: 0 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x9c9d96, roughness: 0.36, metalness: 0.72 });
  const glow = new THREE.MeshStandardMaterial({ color: 0xc8a57a, emissive: 0xd1a56b, emissiveIntensity: 0.40, roughness: 0.75, metalness: 0 });
  const addSweep = (name, width, top, bottom, material) => {
    const mesh = new THREE.Mesh(sweptRectangle(stations, width, top, bottom), material);
    mesh.name = name;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    group.add(mesh);
    return mesh;
  };
  addSweep('Единственная несущая балка 0,95 × 0,72 м', c.beamWidth, beamTop, beamBottom, concrete);
  addSweep('Одна центральная металлическая рабочая поверхность', c.runningSurfaceWidth, height, beamTop, metal);
  // A single discreet strip UNDER the centre of the beam; no second visual rail.
  addSweep('Одна тёплая линия под балкой', 0.055, beamBottom + 0.006, beamBottom - 0.018, glow);

  const supportCount = Math.max(4, Math.ceil(route.length / c.supportSpacing));
  const footHeight = 0.20, capHeight = 0.20;
  const columnTop = beamBottom - capHeight;
  let minFloorHeight = Infinity, maxFloorHeight = -Infinity;
  const columns = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.27, 0.34, 1, 10, 1), concrete, supportCount);
  const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(1.12, capHeight, 0.58), concrete, supportCount);
  const feet = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.52, 0.60, footHeight, 12, 1), concrete, supportCount);
  columns.name = 'Опоры монорельса'; caps.name = 'Оголовки опор'; feet.name = 'Основания опор';
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3(), scale = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < supportCount; i++) {
    const sample = route.sampleDistance(i * route.length / supportCount);
    let baseY = floorHeight;
    try {
      const candidate = typeof supportFloorHeight === 'function' ? supportFloorHeight(sample.position.x, sample.position.z) : floorHeight;
      if (Number.isFinite(candidate) && candidate <= columnTop - footHeight - 0.25) baseY = candidate;
    } catch { /* Failed surface query: retain the configured floor height. */ }
    const columnBottom = baseY + footHeight, columnHeight = columnTop - columnBottom;
    minFloorHeight = Math.min(minFloorHeight, baseY); maxFloorHeight = Math.max(maxFloorHeight, baseY);
    position.set(sample.position.x, (columnTop + columnBottom) / 2, sample.position.z);
    matrix.compose(position, quaternion.identity(), scale.set(1, columnHeight, 1)); columns.setMatrixAt(i, matrix);
    position.y = beamBottom - capHeight / 2;
    quaternion.setFromAxisAngle(UP, sample.heading);
    matrix.compose(position, quaternion, scale.set(1, 1, 1)); caps.setMatrixAt(i, matrix);
    position.y = baseY + footHeight / 2;
    matrix.compose(position, quaternion.identity(), scale); feet.setMatrixAt(i, matrix);
  }
  for (const mesh of [columns, caps, feet]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  group.userData = { supportCount, supportSpacing: route.length / supportCount, beamTop, beamBottom, floorHeight, minFloorHeight, maxFloorHeight };
  return group;
}

function collectResources(root, resources) {
  root?.traverse(node => {
    if (node.geometry) resources.geometries.add(node.geometry);
    if (node.isInstancedMesh) resources.instances.add(node);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!material) continue;
      resources.materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) resources.textures.add(value);
    }
  });
}

/**
 * @param {object} options
 * @param {THREE.Scene|THREE.Group} options.scene Existing scene; metres, Y up.
 * @param {string} options.modelUrl Real static GLB; its nose points along +Z.
 * @param {object} options.loader Existing GLTFLoader with MeshoptDecoder configured.
 * @param {object} [options.routeConfig]
 * @param {(x:number,z:number)=>number} [options.supportFloorHeight] Surface Y beneath each support; invalid/failed queries use routeConfig.floorHeight.
 * @param {(state:object)=>void} [options.onState] Loading/ready/error/control changes; moving state at <=4 Hz.
 * @returns {Promise<object>} No replacement vehicle is used if the real GLB fails.
 */
export async function createTramSystem({ scene, modelUrl, loader, routeConfig, onState, supportFloorHeight } = {}) {
  if (!scene?.isObject3D || typeof scene.add !== 'function') throw new TypeError('Монорельс: scene должен быть Object3D.');
  if (typeof modelUrl !== 'string' || !modelUrl.trim()) throw new TypeError('Монорельс: нужен URL настоящего GLB вагона.');
  if (!loader || (typeof loader.loadAsync !== 'function' && typeof loader.load !== 'function')) {
    throw new TypeError('Монорельс: передайте настроенный GLTFLoader.');
  }
  const route = createRoundedRectangleRoute(routeConfig);
  const group = new THREE.Group(); group.name = 'Монорельс — два вагона';
  const resources = { geometries: new Set(), materials: new Set(), textures: new Set(), instances: new Set() };
  const vehicles = [];
  let track, sourceBounds, sourceSize, scaledSize, wagonScale;
  let loaded = false, disposed = false, playing = true, speedMultiplier = 1;
  let distance = 0, simulatedSeconds = 0, lastDelta = 0, sinceState = 0, errorMessage = null;
  let callbackError = null;
  const samples = Array.from({ length: TRAM_CONSTANTS.vehicleCount }, () => ({ position: new THREE.Vector3(), tangent: new THREE.Vector3() }));

  function getState() {
    return {
      status: disposed ? 'disposed' : errorMessage ? 'error' : loaded ? 'ready' : 'loading',
      loaded, playing: playing && !disposed, visible: group.visible && !disposed,
      vehicleCount: vehicles.length, expectedVehicleCount: TRAM_CONSTANTS.vehicleCount,
      trackLength: route.length, distance, phase: distance / route.length,
      baseSpeed: TRAM_CONSTANTS.baseSpeed, speedMultiplier,
      speedMetersPerSecond: playing && !disposed ? TRAM_CONSTANTS.baseSpeed * speedMultiplier : 0,
      simulatedSeconds, lastDeltaSeconds: lastDelta,
      dimensions: { ...route.config, beamWidth: TRAM_CONSTANTS.beamWidth, beamDepth: TRAM_CONSTANTS.beamDepth,
        vehicleLength: TRAM_CONSTANTS.vehicleLength, vehicleWidth: scaledSize?.x ?? null, vehicleHeight: scaledSize?.y ?? null },
      supports: track ? { count: track.userData.supportCount, spacing: track.userData.supportSpacing,
        minFloorHeight: track.userData.minFloorHeight, maxFloorHeight: track.userData.maxFloorHeight } : null,
      source: { modelUrl, scale: wagonScale ?? null, bounds: sourceBounds ? { min: sourceBounds.min.toArray(), max: sourceBounds.max.toArray() } : null },
      coordinateSystem: 'scene metres; Y up; route XZ; GLB nose +Z',
      alignmentStatus: 'presentation reconstruction, not surveyed or approved CAD alignment',
      vehicles: vehicles.map((vehicle, index) => ({
        index, position: vehicle.position.toArray(), heading: samples[index].heading,
        phase: samples[index].phase, distance: samples[index].distance,
      })),
      error: errorMessage, callbackError,
    };
  }
  function emit() {
    if (typeof onState !== 'function') return;
    try { onState(getState()); }
    catch (error) { callbackError = error?.message || String(error); }
  }
  function release() {
    group.removeFromParent();
    for (const instance of resources.instances) instance.dispose();
    for (const geometry of resources.geometries) geometry.dispose();
    for (const material of resources.materials) material.dispose();
    for (const texture of resources.textures) texture.dispose();
    for (const set of Object.values(resources)) set.clear();
    group.clear();
    for (const vehicle of vehicles) vehicle.clear();
    vehicles.length = 0;
  }
  function placeVehicles() {
    for (let index = 0; index < vehicles.length; index++) {
      const sample = route.sampleDistance(distance + index * route.length / TRAM_CONSTANTS.vehicleCount, samples[index]);
      vehicles[index].position.copy(sample.position);
      vehicles[index].rotation.set(0, sample.heading, 0);
      vehicles[index].updateMatrix();
    }
  }
  emit();

  try {
    const gltf = typeof loader.loadAsync === 'function'
      ? await loader.loadAsync(modelUrl)
      : await new Promise((resolve, reject) => loader.load(modelUrl, resolve, undefined, reject));
    const source = gltf?.scene;
    if (!source?.isObject3D) throw new Error('GLB не содержит сцену.');
    collectResources(source, resources);
    let meshCount = 0, hasSkin = false;
    source.traverse(node => { if (node.isMesh) meshCount++; if (node.isSkinnedMesh) hasSkin = true; });
    if (!meshCount) throw new Error('GLB не содержит геометрию вагона.');
    if (hasSkin) throw new Error('Ожидался статический GLB вагона; SkinnedMesh не поддерживается этим модулем.');
    source.updateMatrixWorld(true);
    sourceBounds = new THREE.Box3().setFromObject(source, true);
    sourceSize = sourceBounds.getSize(new THREE.Vector3());
    if (sourceBounds.isEmpty() || !Number.isFinite(sourceSize.length()) || sourceSize.z <= 1e-8 || sourceSize.x <= 0 || sourceSize.y <= 0) {
      throw new Error('Некорректные габариты GLB; продольная ось должна быть +Z.');
    }
    wagonScale = TRAM_CONSTANTS.vehicleLength / sourceSize.z;
    scaledSize = sourceSize.clone().multiplyScalar(wagonScale);
    const sourceCenter = sourceBounds.getCenter(new THREE.Vector3());
    track = buildMonorail(route, supportFloorHeight); group.add(track); collectResources(track, resources);
    for (let index = 0; index < TRAM_CONSTANTS.vehicleCount; index++) {
      const vehicle = new THREE.Group(); vehicle.name = `Вагон монорельса ${index + 1}`;
      const normalization = new THREE.Group(); normalization.name = 'Масштаб 12 м и опора нижней точки на направляющую';
      normalization.scale.setScalar(wagonScale);
      normalization.position.set(-sourceCenter.x * wagonScale, -sourceBounds.min.y * wagonScale, -sourceCenter.z * wagonScale);
      const clone = source.clone(true);
      clone.traverse(node => { if (node.isMesh) { node.castShadow = false; node.receiveShadow = true; } });
      normalization.add(clone); vehicle.add(normalization);
      vehicle.userData = { index, phaseOffset: index / TRAM_CONSTANTS.vehicleCount, sourceModelUrl: modelUrl };
      vehicles.push(vehicle); group.add(vehicle);
    }
    placeVehicles();
    loaded = true;
    scene.add(group);
    group.updateMatrixWorld(true);
    emit();
  } catch (cause) {
    loaded = false; playing = false;
    errorMessage = `Не удалось загрузить монорельс (${modelUrl}): ${cause?.message || String(cause)}`;
    release(); emit();
    const error = new Error(errorMessage); error.cause = cause; throw error;
  }

  return {
    group, route, vehicles,
    update(deltaSeconds) {
      if (disposed || !loaded) return false;
      if (typeof deltaSeconds !== 'number' || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return false;
      lastDelta = Math.min(deltaSeconds, TRAM_CONSTANTS.maxDeltaSeconds);
      if (!playing || speedMultiplier === 0) return false;
      simulatedSeconds += lastDelta;
      distance = modulo(distance + TRAM_CONSTANTS.baseSpeed * speedMultiplier * lastDelta, route.length);
      placeVehicles();
      sinceState += lastDelta;
      if (sinceState >= 0.25) { sinceState %= 0.25; emit(); }
      return group.visible;
    },
    setPlaying(value) {
      if (disposed) return;
      playing = Boolean(value); lastDelta = 0; emit();
    },
    setSpeed(value) {
      if (disposed) return;
      finiteNumber(value, 'speedMultiplier');
      if (value < 0) throw new RangeError('Монорельс: скорость не может быть отрицательной.');
      speedMultiplier = Math.min(value, TRAM_CONSTANTS.maxSpeedMultiplier); emit();
    },
    setVisible(value) {
      if (disposed) return;
      group.visible = Boolean(value); emit();
    },
    getState,
    getFollowPose(index = 0) {
      if (disposed || !loaded) return null;
      if (!Number.isInteger(index) || index < 0 || index >= vehicles.length) throw new RangeError('Монорельс: индекс вагона должен быть 0 или 1.');
      const vehicle = vehicles[index];
      vehicle.updateWorldMatrix(true, false);
      const vehiclePosition = vehicle.getWorldPosition(new THREE.Vector3());
      const worldQuaternion = vehicle.getWorldQuaternion(new THREE.Quaternion());
      const tangent = new THREE.Vector3(0, 0, 1).applyQuaternion(worldQuaternion).normalize();
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(worldQuaternion).normalize();
      return {
        index,
        position: vehiclePosition.clone().addScaledVector(tangent, -19.2).addScaledVector(up, Math.max(6, scaledSize.y * 1.4)),
        target: vehiclePosition.clone().addScaledVector(tangent, 4.2).addScaledVector(up, scaledSize.y * 0.55),
        up, tangent, vehiclePosition, heading: samples[index].heading,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true; loaded = false; playing = false;
      release(); emit();
    },
  };
}
