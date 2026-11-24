import * as THREE from 'three';

const FLOOR_TOLERANCE = 0.5;
const FLOOR_NAMES = /^(A-FLOR|S-SLAB)/;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const rounded = value => Math.round(value * 1e6) / 1e6;
const vectorData = value => value.toArray().map(rounded);
const boxData = box => ({ min: vectorData(box.min), max: vectorData(box.max) });

function requireNumber(value, name) {
  if (!finite(value)) throw new TypeError('Некорректное число: ' + name);
  return value;
}

/** World AABB of a source box centred on XZ with its bottom at local Y=0. */
export function getPlacementBounds(dimensions, placement, baseY = placement.floorY + (placement.offsetY || 0)) {
  const size = Array.isArray(dimensions) ? new THREE.Vector3(...dimensions) : dimensions.clone();
  const matrix = new THREE.Matrix4().makeRotationY(placement.rotationY || 0);
  matrix.setPosition(placement.x, baseY, placement.z);
  return new THREE.Box3(
    new THREE.Vector3(-size.x / 2, 0, -size.z / 2),
    new THREE.Vector3(size.x / 2, size.y, size.z / 2),
  ).applyMatrix4(matrix);
}

/**
 * Load genuine Hitem3D GLBs and position them against the source CAD floors.
 * object.url is relative to manifestUrl; model geometry and textures are shared
 * between instances. Positions remain a documented working reconstruction.
 */
export async function createExhibitSystem({
  scene, loader, sourceMeshes, manifestUrl = 'assets/exhibits/manifest.json',
  onChange = () => {}, onProgress = () => {}, anisotropy = 4,
}) {
  if (!scene?.isScene || !loader || !Array.isArray(sourceMeshes)) {
    throw new TypeError('Экспонатам нужны сцена, GLTFLoader и исходные меши здания.');
  }
  const group = new THREE.Group();
  group.name = 'Экспонаты Парка впечатлений';
  group.userData.exhibits = true;
  const roots = [], materials = [];
  const geometries = new Set(), materialSet = new Set(), textures = new Set();
  const records = [], errors = [];
  const floors = sourceMeshes.filter(mesh => mesh.isMesh && FLOOR_NAMES.test(mesh.name));
  const floorRay = new THREE.Raycaster();
  const downward = new THREE.Vector3(0, -1, 0);
  const normalMatrix = new THREE.Matrix3();
  let disposed = false, complete = false, sectionEnabled = false, sectionPlane = null;
  let manifest;
  const base = typeof document !== 'undefined' ? document.baseURI : import.meta.url;
  const manifestAddress = new URL(manifestUrl, base);

  function getState() {
    const loadedObjects = records.filter(row => row.status === 'loaded').length;
    const failedObjects = records.filter(row => row.status === 'error').length;
    const requestedInstances = records.reduce((count, row) => count + row.requestedInstances, 0);
    const issues = errors.length;
    return {
      state: disposed ? 'disposed' : !complete ? 'loading' : issues ? (roots.length ? 'partial' : 'error') : 'ready',
      version: manifest?.version ?? null,
      qualityNote: manifest?.qualityNote || '',
      visible: group.visible,
      totalObjects: records.length,
      loadedObjects,
      failedObjects,
      pendingObjects: records.length - loadedObjects - failedObjects,
      requestedInstances,
      placedInstances: roots.length,
      rejectedInstances: records.reduce((count, row) => count + row.rejectedInstances.length, 0),
      floorMeshes: floors.length,
      objects: records.map(row => ({
        ...row,
        dimensions: row.dimensions?.slice(),
        placements: row.placements.map(placement => ({ ...placement, floorSamples: placement.floorSamples.map(point => ({ ...point })) })),
        rejectedInstances: row.rejectedInstances.map(placement => ({ ...placement, floorSamples: placement.floorSamples?.map(point => ({ ...point })) })),
      })),
      errors: errors.map(error => ({ ...error })),
    };
  }

  function emit() {
    try { onProgress(getState()); } catch (error) { console.error('Exhibit progress callback:', error); }
    try { onChange(); } catch (error) { console.error('Exhibit change callback:', error); }
  }

  function problem(row, instanceId, message, evidence) {
    const issue = { objectId: row.id, instanceId: instanceId || null, message };
    errors.push(issue);
    if (instanceId) row.rejectedInstances.push({ ...issue, ...evidence });
    return issue;
  }

  // Source CAD normals may be reversed. Double-sided CPU raycasting is limited
  // to this synchronous query; source material values are restored immediately.
  function floorAt(x, z, expectedY) {
    floorRay.set(new THREE.Vector3(x, expectedY + FLOOR_TOLERANCE + 0.05, z), downward);
    floorRay.near = 0;
    floorRay.far = 2 * FLOOR_TOLERANCE + 0.1;
    const originalSides = new Map();
    for (const mesh of floors) {
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (material && !originalSides.has(material)) {
          originalSides.set(material, material.side);
          material.side = THREE.DoubleSide;
        }
      }
    }
    let hits;
    try { hits = floorRay.intersectObjects(floors, false); }
    finally { for (const [material, side] of originalSides) material.side = side; }
    const possible = hits.filter(hit => {
      if (Math.abs(hit.point.y - expectedY) > FLOOR_TOLERANCE) return false;
      if (!hit.face) return false;
      normalMatrix.getNormalMatrix(hit.object.matrixWorld);
      const normal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
      return Math.abs(normal.y) > 0.7;
    });
    possible.sort((a, b) => Math.abs(a.point.y - expectedY) - Math.abs(b.point.y - expectedY));
    const hit = possible[0];
    return hit ? { y: hit.point.y, mesh: hit.object.name } : null;
  }

  function supportEvidence(size, placement) {
    const points = [{ label: 'center', x: 0, z: 0 }];
    if (!placement.floating) {
      const hx = size.x * 0.45, hz = size.z * 0.45;
      points.push(
        { label: 'corner-1', x: -hx, z: -hz }, { label: 'corner-2', x: hx, z: -hz },
        { label: 'corner-3', x: hx, z: hz }, { label: 'corner-4', x: -hx, z: hz },
        { label: 'edge-1', x: 0, z: -hz }, { label: 'edge-2', x: hx, z: 0 },
        { label: 'edge-3', x: 0, z: hz }, { label: 'edge-4', x: -hx, z: 0 },
      );
    }
    const angle = placement.rotationY || 0, cos = Math.cos(angle), sin = Math.sin(angle);
    const samples = points.map(point => {
      const x = placement.x + point.x * cos + point.z * sin;
      const z = placement.z - point.x * sin + point.z * cos;
      const floor = floorAt(x, z, placement.floorY);
      return { label: point.label, x: rounded(x), z: rounded(z), matched: Boolean(floor),
        y: floor ? rounded(floor.y) : null, mesh: floor?.mesh || null };
    });
    const matched = samples.filter(sample => sample.matched);
    // A grounded model needs confirmed support at all nine sampled points.
    // Suspended models use a real floor anchor and their explicit height offset.
    const enough = samples.every(sample => sample.matched);
    const spread = matched.length ? Math.max(...matched.map(point => point.y)) - Math.min(...matched.map(point => point.y)) : Infinity;
    return {
      valid: enough && spread <= 0.12,
      floorY: matched.length ? Math.max(...matched.map(point => point.y)) : null,
      floorSamples: samples,
      matchedSamples: matched.length,
      requiredSamples: placement.floating ? 1 : 9,
      heightSpread: Number.isFinite(spread) ? rounded(spread) : null,
      supportMode: placement.floating ? 'floor-anchor-for-suspended-model' : 'centre-corners-and-edge-samples',
    };
  }

  function registerResources(source) {
    source.traverse(node => {
      if (!node.isMesh) return;
      if (node.geometry) geometries.add(node.geometry);
      node.castShadow = false;
      node.receiveShadow = true;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (!material || materialSet.has(material)) continue;
        materialSet.add(material); materials.push(material);
        material.clippingPlanes = sectionEnabled && sectionPlane ? [sectionPlane] : [];
        for (const value of Object.values(material)) if (value?.isTexture) {
          textures.add(value);
          value.anisotropy = Math.max(1, Math.min(16, anisotropy));
        }
      }
    });
  }

  function validateObject(object, objectIds, instanceIds) {
    if (!object || typeof object.id !== 'string' || !/^O\d{2}$/.test(object.id) || objectIds.has(object.id)) {
      throw new TypeError('Повторный или неверный идентификатор экспоната.');
    }
    objectIds.add(object.id);
    if (typeof object.url !== 'string' || !object.url.trim()) throw new TypeError(object.id + ': не указан GLB.');
    if (!['x', 'y', 'z', 'max'].includes(object.scaleTo?.axis) || !(requireNumber(object.scaleTo?.meters, 'scaleTo.meters') > 0)) {
      throw new TypeError(object.id + ': не указан размер экспоната в метрах.');
    }
    if (object.rotation !== undefined && (!Array.isArray(object.rotation) || object.rotation.length !== 3 || !object.rotation.every(finite))) {
      throw new TypeError(object.id + ': поворот должен содержать три угла в радианах.');
    }
    if (!Array.isArray(object.instances) || object.instances.length === 0) throw new TypeError(object.id + ': отсутствуют позиции.');
    object.instances.forEach((placement, index) => {
      for (const key of ['x', 'z', 'floorY']) requireNumber(placement[key], object.id + '.' + key);
      if (placement.rotationY !== undefined) requireNumber(placement.rotationY, 'rotationY');
      if (placement.offsetY !== undefined && requireNumber(placement.offsetY, 'offsetY') < 0) throw new TypeError('offsetY должен быть неотрицательным.');
      if (placement.floating !== undefined && typeof placement.floating !== 'boolean') throw new TypeError('floating должен быть логическим.');
      const id = placement.id || object.id + '-' + (index + 1);
      if (typeof id !== 'string' || instanceIds.has(id)) throw new TypeError('Повторный идентификатор экземпляра: ' + id);
      instanceIds.add(id);
    });
  }

  async function loadObject(object, row) {
    row.status = 'loading'; emit();
    try {
      const address = new URL(object.url, manifestAddress).href;
      const gltf = await new Promise((resolve, reject) => loader.load(address, resolve, undefined, reject));
      const source = gltf?.scene;
      if (!source?.isObject3D) throw new Error('GLB не содержит сцену.');
      let meshCount = 0, hasSkin = false;
      source.traverse(node => { if (node.isMesh) meshCount++; if (node.isSkinnedMesh) hasSkin = true; });
      if (!meshCount || hasSkin) throw new Error(hasSkin ? 'Для экспоната ожидается статическая модель.' : 'GLB не содержит геометрию.');
      registerResources(source);
      const orientation = new THREE.Group();
      if (object.rotation) orientation.rotation.set(...object.rotation, 'XYZ');
      orientation.add(source); orientation.updateMatrixWorld(true);
      const sourceBounds = new THREE.Box3().setFromObject(orientation, true);
      const originalSize = sourceBounds.getSize(new THREE.Vector3());
      const originalCenter = sourceBounds.getCenter(new THREE.Vector3());
      const referenceSize = object.scaleTo.axis === 'max' ? Math.max(originalSize.x, originalSize.y, originalSize.z) : originalSize[object.scaleTo.axis];
      if (sourceBounds.isEmpty() || !finite(referenceSize) || referenceSize <= 1e-8) throw new Error('Некорректные габариты GLB.');
      const scale = object.scaleTo.meters / referenceSize;
      const size = originalSize.clone().multiplyScalar(scale);
      const normalized = new THREE.Group();
      normalized.scale.setScalar(scale);
      normalized.position.set(-originalCenter.x * scale, -sourceBounds.min.y * scale, -originalCenter.z * scale);
      normalized.add(orientation);
      row.sourceBounds = boxData(sourceBounds); row.scale = rounded(scale);
      row.dimensions = vectorData(size); row.meshes = meshCount;
      for (let index = 0; index < object.instances.length; index++) {
        const placement = object.instances[index];
        const instanceId = placement.id || object.id + '-' + (index + 1);
        const evidence = supportEvidence(size, placement);
        if (!evidence.valid) {
          problem(row, instanceId, 'Позиция не добавлена: недостаточно подтверждённой опоры на выбранном уровне пола.', {
            x: placement.x, z: placement.z, requestedFloorY: placement.floorY, ...evidence,
          });
          continue;
        }
        const baseY = evidence.floorY + (placement.offsetY || 0);
        const instance = new THREE.Group();
        instance.name = row.name + ' · ' + instanceId;
        instance.position.set(placement.x, baseY, placement.z);
        instance.rotation.y = placement.rotationY || 0;
        instance.userData = { exhibitId: object.id, exhibitName: row.name, instanceId, zone: placement.zone || '', floating: Boolean(placement.floating) };
        instance.add(normalized.clone(true));
        instance.traverse(node => { if (node.isMesh) Object.assign(node.userData, instance.userData); });
        group.add(instance); roots.push(instance); instance.updateMatrixWorld(true);
        row.placements.push({
          instanceId, zone: placement.zone || '', x: placement.x, z: placement.z,
          requestedFloorY: placement.floorY, floorY: evidence.floorY,
          baseY: rounded(baseY), rotationY: placement.rotationY || 0,
          floating: Boolean(placement.floating), offsetY: placement.offsetY || 0,
          dimensions: vectorData(size), worldBounds: boxData(getPlacementBounds(size, placement, baseY)),
          ...evidence,
        });
      }
      row.status = 'loaded';
      emit();
    } catch (error) {
      row.status = 'error'; row.error = error?.message || String(error);
      problem(row, null, row.error); emit();
    }
  }

  try {
    const response = await fetch(manifestAddress, { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error('Не удалось получить список экспонатов: HTTP ' + response.status);
    manifest = await response.json();
    if (!Array.isArray(manifest.objects)) throw new TypeError('В списке экспонатов нет objects.');
    const objectIds = new Set(), instanceIds = new Set();
    for (const object of manifest.objects) validateObject(object, objectIds, instanceIds);
    if (!floors.length && manifest.objects.length) throw new Error('В исходном здании не найдены меши пола A-FLOR / S-SLAB.');
    floors.forEach(mesh => mesh.updateWorldMatrix(true, false));
    for (const object of manifest.objects) records.push({
      id: object.id, name: object.name || object.id, status: 'pending',
      requestedInstances: object.instances.length, placements: [], rejectedInstances: [],
    });
    scene.add(group); emit();
    let next = 0;
    async function worker() {
      while (next < manifest.objects.length && !disposed) {
        const index = next++;
        await loadObject(manifest.objects[index], records[index]);
      }
    }
    await Promise.all([worker(), worker()]);
    complete = true; emit();
  } catch (error) {
    group.removeFromParent();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materialSet) material.dispose();
    for (const texture of textures) texture.dispose();
    throw error;
  }

  return {
    group, roots, materials, getState,
    setVisible(value) { if (!disposed) { group.visible = Boolean(value); emit(); } },
    getBounds(id) {
      if (disposed) return null;
      const selected = id ? roots.filter(root => root.userData.exhibitId === id || root.userData.instanceId === id) : roots;
      if (!selected.length) return null;
      const bounds = new THREE.Box3();
      selected.forEach(root => { root.updateWorldMatrix(true, true); bounds.union(new THREE.Box3().setFromObject(root)); });
      return bounds;
    },
    setSection(enabled, plane) {
      if (disposed) return;
      sectionEnabled = Boolean(enabled); sectionPlane = plane;
      for (const material of materials) {
        material.clippingPlanes = sectionEnabled && plane ? [plane] : [];
        material.clipShadows = true; material.needsUpdate = true;
      }
      emit();
    },
    dispose() {
      if (disposed) return;
      disposed = true; group.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materialSet) material.dispose();
      for (const texture of textures) texture.dispose();
      roots.length = 0; materials.length = 0;
      geometries.clear(); materialSet.clear(); textures.clear(); emit();
    },
  };
}
