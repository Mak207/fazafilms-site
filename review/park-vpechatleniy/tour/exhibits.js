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
export function getPlacementBounds(dimensions, placement, baseY = placement.y ?? placement.baseY ?? placement.floorY + (placement.offsetY || 0)) {
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
  const instances = new Map();
  let floorLevels = [], initialLayout = null, placementGuard = null;
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
      floorLevels: floorLevels.slice(),
      visibleInstances: [...instances.values()].filter(entry => entry.placement.visible).length,
      editedInstances: initialLayout ? listInstances().filter(instance => instance.modified).length : 0,
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
  function floorAt(x, z, expectedY, { visibleOnly = false } = {}) {
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
      if (visibleOnly) {
        for (let node = hit.object; node; node = node.parent) if (!node.visible) return false;
        const material = Array.isArray(hit.object.material) ? hit.object.material[hit.face.materialIndex] : hit.object.material;
        if (material?.visible === false) return false;
        const clipped = material?.clippingPlanes?.map(plane => plane.distanceToPoint(hit.point) < -1e-5) || [];
        if (clipped.length && (material.clipIntersection ? clipped.every(Boolean) : clipped.some(Boolean))) return false;
      }
      normalMatrix.getNormalMatrix(hit.object.matrixWorld);
      const normal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
      return Math.abs(normal.y) > 0.7;
    });
    possible.sort((a, b) => Math.abs(a.point.y - expectedY) - Math.abs(b.point.y - expectedY));
    const hit = possible[0];
    return hit ? { y: hit.point.y, mesh: hit.object.name } : null;
  }

  function supportEvidence(size, placement, supportPoints = null) {
    const custom=Array.isArray(supportPoints)&&supportPoints.length>0;
    const points = custom?supportPoints.map((point,index)=>({label:point.label||'area-'+index,x:point.x,z:point.z})):[{ label: 'center', x: 0, z: 0 }];
    if(custom&&!points.every(point=>finite(point.x)&&finite(point.z)))throw new TypeError('Некорректные точки опоры составного раздела.');
    if (!custom && !placement.floating) {
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
      requiredSamples: points.length,
      heightSpread: Number.isFinite(spread) ? rounded(spread) : null,
      supportMode: custom?'mapped-occupied-floor-samples':placement.floating ? 'floor-anchor-for-suspended-model' : 'centre-corners-and-edge-samples',
    };
  }

  function instanceData(entry) {
    const p = entry.placement;
    const initial = initialLayout?.instances.find(row => row.instanceId === p.instanceId);
    return {
      instanceId: p.instanceId, exhibitId: entry.row.id, name: entry.row.name,
      ordinal: entry.row.placements.indexOf(p) + 1, copies: entry.row.requestedInstances,
      zone: p.zone, floating: p.floating, x: p.x, y: p.baseY, z: p.z,
      rotationY: p.rotationY, scaleFactor: p.scaleFactor, visible: p.visible, floorY: p.floorY,
      originalDimensions: vectorData(entry.size),
      dimensions: p.dimensions.slice(), worldBounds: { min: p.worldBounds.min.slice(), max: p.worldBounds.max.slice() },
      modified: Boolean(initial && ['x', 'y', 'z', 'rotationY', 'scaleFactor', 'visible'].some(key =>
        key === 'visible' ? initial[key] !== p.visible : Math.abs(initial[key] - (key === 'y' ? p.baseY : p[key])) > 1e-5)),
    };
  }

  function listInstances() {
    return records.flatMap(row => row.placements.map(p => instances.get(p.instanceId))).filter(Boolean).map(instanceData);
  }

  function getLayout() {
    return {
      schema: 'park-exhibit-layout', version: 1, units: 'meters', upAxis: 'Y',
      instances: listInstances().map(p => ({
        instanceId: p.instanceId, exhibitId: p.exhibitId, floating: p.floating,
        x: rounded(p.x), y: rounded(p.y), z: rounded(p.z), rotationY: rounded(p.rotationY),
        scaleFactor: p.scaleFactor, visible: p.visible, floorY: p.floorY,
      })),
    };
  }

  function levelsForMode(mode = 'auto') {
    if (mode === 'main') return floorLevels.slice(0, 1);
    if (mode === 'mezzanine') return floorLevels.slice(1, 2);
    if (mode !== 'auto') throw new TypeError('Неизвестный уровень пола.');
    return floorLevels.slice();
  }

  // Only the occupied levels in the official layout are eligible. Roof slabs
  // bearing the same CAD layer name cannot become an accidental drop target.
  function pickFloor(ray, { floorMode = 'auto', preferredY = null } = {}) {
    if (disposed || !ray?.origin?.isVector3 || !ray?.direction?.isVector3) return null;
    const candidates = [];
    for (const level of levelsForMode(floorMode)) {
      const point = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -level), new THREE.Vector3());
      if (!point) continue;
      const floor = floorAt(point.x, point.z, level, { visibleOnly: floorMode === 'auto' });
      if (!floor) continue;
      const actual = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -floor.y), new THREE.Vector3());
      if (!actual) continue;
      candidates.push({ x: actual.x, y: floor.y, z: actual.z, floorY: floor.y,
        mesh: floor.mesh, distance: actual.distanceTo(ray.origin) });
    }
    candidates.sort((a, b) => floorMode === 'auto' && finite(preferredY)
      ? Math.abs(a.floorY - preferredY) - Math.abs(b.floorY - preferredY) || a.distance - b.distance
      : a.distance - b.distance);
    return candidates[0] || null;
  }

  function prepareUpdate(entry, patch, options = {}) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('Не указаны координаты экземпляра.');
    const old = entry.placement;
    const next = { ...old };
    for (const key of ['x', 'z', 'rotationY']) if (patch[key] !== undefined) next[key] = requireNumber(patch[key], key);
    if (patch.scaleFactor !== undefined) {
      next.scaleFactor = requireNumber(patch.scaleFactor, 'scaleFactor');
      if (next.scaleFactor <= 0) throw new TypeError('Масштаб должен быть больше нуля.');
    }
    const scaledSize = entry.size.clone().multiplyScalar(next.scaleFactor);
    if (!scaledSize.toArray().every(finite)) throw new TypeError('Слишком большой размер экспоната.');
    next.dimensions = vectorData(scaledSize);
    if (patch.y !== undefined) requireNumber(patch.y, 'y');
    if (patch.visible !== undefined) {
      if (typeof patch.visible !== 'boolean') throw new TypeError('Видимость должна быть логическим значением.');
      next.visible = patch.visible;
    }
    const changed = ['x', 'z', 'rotationY', 'scaleFactor'].some(key => Math.abs(next[key] - old[key]) > 1e-9);
    if (next.floating) {
      next.baseY = patch.y ?? old.baseY;
      if (changed || patch.y !== undefined) Object.assign(next, {
        floorY: null, requestedFloorY: null, offsetY: null, valid: true,
        floorSamples: [], matchedSamples: 0, requiredSamples: 0, heightSpread: 0,
        supportMode: 'suspended-free-position',
      });
    } else {
      const requestedFloor = options.floorY ?? patch.floorY;
      let levels = levelsForMode(options.floorMode);
      if (requestedFloor !== undefined && requestedFloor !== null) {
        requireNumber(requestedFloor, 'floorY');
        if (!levels.some(y => Math.abs(y - requestedFloor) <= FLOOR_TOLERANCE)) {
          throw new Error('Этот уровень не является доступным этажом.');
        }
        levels = [requestedFloor];
      } else if (next.x === old.x && next.z === old.z && (!options.floorMode || options.floorMode === 'auto')) {
        levels = [old.floorY];
      } else levels.sort((a, b) => Math.abs(a - old.floorY) - Math.abs(b - old.floorY));
      const needsSupport = changed || options.floorY !== undefined || patch.floorY !== undefined ||
        (options.floorMode && options.floorMode !== 'auto');
      if (needsSupport) {
        let evidence = null, best = null;
        for (const level of levels) {
          const samples=entry.supportSamples?.map(point=>({...point,x:point.x*next.scaleFactor,z:point.z*next.scaleFactor}));
          const test = supportEvidence(scaledSize, { ...next, floorY: level },samples);
          if (!best || test.matchedSamples > best.matchedSamples) best = test;
          if (test.valid) { evidence = test; break; }
        }
        if (!evidence) return { ok: false,
          error: 'Не хватает опоры: экспонат должен целиком помещаться на полу одного этажа.', evidence: best };
        Object.assign(next, evidence, { requestedFloorY: evidence.floorY, baseY: evidence.floorY, offsetY: 0 });
      }
      if (patch.y !== undefined && Math.abs(patch.y - next.baseY) > 0.02) {
        return { ok: false, error: 'Наземный экспонат должен стоять на полу. Высоту задаёт выбранный этаж.' };
      }
    }
    next.worldBounds = boxData(getPlacementBounds(scaledSize, next, next.baseY));
    return { ok: true, entry, next };
  }

  function applyPrepared(prepared) {
    const { entry, next } = prepared;
    Object.assign(entry.placement, next);
    entry.root.position.set(next.x, next.baseY, next.z);
    entry.root.rotation.y = next.rotationY;
    entry.root.scale.setScalar(next.scaleFactor);
    entry.root.visible = next.visible;
    entry.root.userData.editorVisible = next.visible;
    entry.root.updateMatrixWorld(true);
  }

  // All editing paths cross the same synchronous collision transaction. The
  // proposed record includes scaleFactor; root.matrixWorld remains the current
  // pose until the guard has accepted and committed its navigation update.
  function commitPlacements(prepared, source, groupVisible = group.visible) {
    const transaction = placementGuard ? placementGuard({
      source, groupVisible,
      changes: prepared.map(({ entry, next }) => ({
        instanceId: next.instanceId, root: entry.root,
        before: { ...entry.placement }, next: { ...next },
      })),
    }) : { ok: true };
    if (transaction?.then) return { ok: false, error: 'Проверка расстановки должна быть синхронной.' };
    if (!transaction?.ok) return transaction || { ok: false, error: 'Позиция не разрешена.' };
    const result = transaction.commit?.();
    if (result?.then || (result && !result.ok)) return result?.then
      ? { ok: false, error: 'Обновление проходов должно быть синхронным.' } : result;
    prepared.forEach(applyPrepared);
    group.visible = groupVisible;
    transaction.afterApply?.();
    return { ok: true };
  }

  function updateInstance(id, patch, options = {}) {
    const entry = instances.get(id);
    if (disposed || !entry) return { ok: false, error: 'Экземпляр не найден.' };
    try {
      const prepared = prepareUpdate(entry, patch, options);
      if (!prepared.ok) return prepared;
      const committed = commitPlacements([prepared], 'update-instance');
      if (!committed.ok) return committed;
      if (options.notify !== false) emit();
      return { ok: true, instance: instanceData(entry), evidence: {
        valid: entry.placement.valid, matchedSamples: entry.placement.matchedSamples,
        requiredSamples: entry.placement.requiredSamples, floorY: entry.placement.floorY,
      } };
    } catch (error) { return { ok: false, error: error.message || String(error) }; }
  }

  // Validate the complete document first so a failed import cannot partially
  // move the scene. Only known instances and explicitly editable fields apply.
  function applyLayout(layout, { notify = true } = {}) {
    try {
      if (disposed || layout?.schema !== 'park-exhibit-layout' || layout.version !== 1 ||
          layout.units !== 'meters' || layout.upAxis !== 'Y' || !Array.isArray(layout.instances)) {
        throw new Error('Нужен файл расстановки Парка впечатлений, версия 1, метры / Y вверх.');
      }
      if (layout.instances.length !== instances.size) throw new Error('Файл должен содержать все ' + instances.size + ' экземпляра.');
      const seen = new Set(), prepared = [];
      for (const row of layout.instances) {
        const entry = instances.get(row?.instanceId);
        if (!entry || seen.has(row.instanceId)) throw new Error('Неизвестный или повторный экземпляр: ' + (row?.instanceId || 'без ID'));
        seen.add(row.instanceId);
        if (row.exhibitId !== entry.row.id || row.floating !== entry.placement.floating) throw new Error(row.instanceId + ': тип экземпляра не совпадает.');
        for (const key of ['x', 'y', 'z', 'rotationY']) requireNumber(row[key], row.instanceId + '.' + key);
        if (typeof row.visible !== 'boolean') throw new TypeError(row.instanceId + ': не указана видимость.');
        const result = prepareUpdate(entry, { ...row, scaleFactor: row.scaleFactor === undefined ? 1 : row.scaleFactor },
          { floorMode: 'auto', floorY: row.floating ? undefined : row.floorY });
        if (!result.ok) return { ...result, instanceId: row.instanceId };
        prepared.push(result);
      }
      const committed = commitPlacements(prepared, 'apply-layout');
      if (!committed.ok) return committed;
      if (notify) emit();
      return { ok: true, count: prepared.length };
    } catch (error) { return { ok: false, error: error.message || String(error) }; }
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
      const floorDatumOffset = object.floorDatumOffset === undefined ? 0 : requireNumber(object.floorDatumOffset, 'floorDatumOffset');
      if (floorDatumOffset < 0 || floorDatumOffset >= originalSize.y * scale) throw new TypeError('Неверная привязка внутреннего пола.');
      const size = originalSize.clone().multiplyScalar(scale);
      size.y -= floorDatumOffset;
      const normalized = new THREE.Group();
      normalized.scale.setScalar(scale);
      normalized.position.set(-originalCenter.x * scale, -sourceBounds.min.y * scale - floorDatumOffset, -originalCenter.z * scale);
      normalized.userData.floorDatumOffset = floorDatumOffset;
      normalized.add(orientation);
      row.sourceBounds = boxData(sourceBounds); row.scale = rounded(scale);
      row.dimensions = vectorData(size); row.meshes = meshCount;
      for (let index = 0; index < object.instances.length; index++) {
        const placement = object.instances[index];
        const instanceId = placement.id || object.id + '-' + (index + 1);
        const supportSamples=placement.supportSamples||object.supportSamples||null;
        const evidence=supportEvidence(size,placement,supportSamples);
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
        instance.userData = { exhibitId: object.id, exhibitName: row.name, instanceId, zone: placement.zone || '', floating: Boolean(placement.floating), editorVisible: true };
        instance.add(normalized.clone(true));
        instance.traverse(node => { if (node.isMesh) Object.assign(node.userData, instance.userData); });
        group.add(instance); roots.push(instance); instance.updateMatrixWorld(true);
        row.placements.push({
          instanceId, zone: placement.zone || '', x: placement.x, z: placement.z,
          requestedFloorY: placement.floorY, floorY: evidence.floorY,
          baseY: rounded(baseY), rotationY: placement.rotationY || 0,
          floating: Boolean(placement.floating), offsetY: placement.offsetY || 0, scaleFactor: 1, visible: true,
          dimensions: vectorData(size), worldBounds: boxData(getPlacementBounds(size, placement, baseY)),
          ...evidence,
        });
        instances.set(instanceId, { root: instance, row, placement:row.placements.at(-1),size:size.clone(),supportSamples });
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
    floorLevels = [...new Set(manifest.objects.flatMap(object => object.instances.map(p => rounded(p.floorY))))].sort((a, b) => a - b);
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
    complete = true; initialLayout = getLayout(); emit();
  } catch (error) {
    group.removeFromParent();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materialSet) material.dispose();
    for (const texture of textures) texture.dispose();
    throw error;
  }

  // Complete exhibition assemblies participate in the same editor, persistence
  // and placement transaction as the imported models. Register before binding
  // navigation; there is no unguarded asynchronous addition after visitors start.
  function addAssembly({ id, name, root, placement, collisionParts, supportSamples = null, provenance = 'parametric-exhibition-assembly' }) {
    if (disposed || placementGuard) throw new Error('Добавление разделов возможно до запуска посетителей.');
    if (!root?.isObject3D || !/^[A-Z][A-Z0-9_-]{1,35}$/.test(id) || records.some(row => row.id === id)) throw new TypeError('Неверная или повторная сборка.');
    const instanceId = placement.id || id + '-1';
    if (instances.has(instanceId)) throw new TypeError('Повторный экземпляр.');
    for (const key of ['x','z','floorY']) requireNumber(placement[key], key);
    root.position.set(0,0,0); root.rotation.set(0,0,0); root.scale.setScalar(1); root.updateMatrixWorld(true);
    const localBox = new THREE.Box3().setFromObject(root, true), size = localBox.getSize(new THREE.Vector3());
    if (localBox.isEmpty() || !size.toArray().every(value => finite(value) && value > 0)) throw new Error('Сборка не содержит измеримой геометрии.');
    // Symmetric XZ envelope keeps editor support tests conservative even for an
    // asymmetric composition. Below-floor plinth geometry does not add height.
    size.x = 2 * Math.max(Math.abs(localBox.min.x), Math.abs(localBox.max.x));
    size.z = 2 * Math.max(Math.abs(localBox.min.z), Math.abs(localBox.max.z));
    size.y = Math.max(0,localBox.max.y);
    const evidence = supportEvidence(size, placement,supportSamples);
    if (!evidence.valid) return { ok:false, error:'Раздел не установлен: не подтверждены все точки пола.', evidence };
    const baseY = evidence.floorY + (placement.offsetY || 0);
    Object.assign(root.userData, { exhibitId:id, exhibitName:name, instanceId, zone:placement.zone || id,
      floating:Boolean(placement.floating), editorVisible:true, assembly:true, provenance });
    if (collisionParts) root.userData.collisionParts = collisionParts.map(part => ({...part,min:[...part.min],max:[...part.max]}));
    root.name = name + ' · ' + instanceId;
    root.traverse(node => { if (node.isMesh) Object.assign(node.userData, {
      exhibitId:id, exhibitName:name, instanceId, zone:root.userData.zone, floating:Boolean(placement.floating) }); });
    registerResources(root);
    const row = { id, name, status:'loaded', provenance, requestedInstances:1, rejectedInstances:[],
      dimensions:vectorData(size), meshes:0, placements:[] };
    root.traverse(node => { if(node.isMesh)row.meshes++; });
    const p = { instanceId, zone:placement.zone || id, x:placement.x,z:placement.z,
      requestedFloorY:placement.floorY,floorY:evidence.floorY,baseY:rounded(baseY),
      rotationY:placement.rotationY || 0, floating:Boolean(placement.floating),offsetY:placement.offsetY || 0,
      scaleFactor:1,visible:true,dimensions:vectorData(size),worldBounds:boxData(getPlacementBounds(size,placement,baseY)),...evidence };
    row.placements.push(p); records.push(row);
    root.position.set(p.x,p.baseY,p.z);root.rotation.y=p.rotationY;group.add(root);roots.push(root);
    root.updateMatrixWorld(true); instances.set(instanceId,{root,row,placement:p,size,supportSamples});
    initialLayout=getLayout();emit();return {ok:true,instanceId,evidence};
  }

  function refreshInstanceGeometry(id, { collisionParts, extendFootprint = false } = {}) {
    if (placementGuard) throw new Error('Обновление геометрии выполняется до привязки навигации.');
    const entry = instances.get(id);if(!entry)return {ok:false,error:'Экземпляр не найден.'};
    if(collisionParts)entry.root.userData.collisionParts=collisionParts;
    entry.root.traverse(node=>{if(node.isMesh)Object.assign(node.userData,{
      exhibitId:entry.row.id,exhibitName:entry.row.name,instanceId:id,
      zone:entry.root.userData.zone,floating:Boolean(entry.placement.floating)});});
    registerResources(entry.root);
    if(extendFootprint){
      entry.root.updateWorldMatrix(true,true);
      const inverse=entry.root.matrixWorld.clone().invert(),box=new THREE.Box3(),point=new THREE.Vector3();
      entry.root.traverse(node=>{if(!node.isMesh||!node.geometry?.attributes.position)return;
        const matrix=new THREE.Matrix4().multiplyMatrices(inverse,node.matrixWorld),vertices=node.geometry.attributes.position;
        for(let i=0;i<vertices.count;i++)box.expandByPoint(point.fromBufferAttribute(vertices,i).applyMatrix4(matrix));});
      entry.size.set(2*Math.max(Math.abs(box.min.x),Math.abs(box.max.x)),Math.max(0,box.max.y),2*Math.max(Math.abs(box.min.z),Math.abs(box.max.z)));
      entry.placement.dimensions=vectorData(entry.size.clone().multiplyScalar(entry.placement.scaleFactor));
      entry.placement.worldBounds=boxData(getPlacementBounds(entry.placement.dimensions,entry.placement,entry.placement.baseY));
      entry.row.dimensions=vectorData(entry.size);
    }
    initialLayout=getLayout();emit();return {ok:true};
  }

  return {
    group, roots, materials, getState, listInstances, getLayout, applyLayout, updateInstance, pickFloor,
    addAssembly, refreshInstanceGeometry,
    floorAt(x,z,y){return floorAt(x,z,y);},
    checkSupport(size,placement){return supportEvidence(new THREE.Vector3(...size),placement);},
    getInstance(id) { const entry = instances.get(id); return entry ? instanceData(entry) : null; },
    getInstanceRoot(id) { return instances.get(id)?.root || null; },
    resetLayout(options) { return applyLayout(initialLayout, options); },
    setPlacementGuard(guard) {
      if (guard !== null && typeof guard !== 'function') throw new TypeError('Нужна функция проверки расстановки.');
      placementGuard = guard;
      return () => { if (placementGuard === guard) placementGuard = null; };
    },
    setVisible(value) {
      if (disposed) return { ok: false, error: 'Экспонаты выгружены.' };
      try {
        const committed = commitPlacements([], 'group-visibility', Boolean(value));
        if (committed.ok) emit();
        return committed;
      } catch (error) { return { ok: false, error: error.message || String(error) }; }
    },
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
      instances.clear(); placementGuard = null;
      geometries.clear(); materialSet.clear(); textures.clear(); emit();
    },
  };
}

