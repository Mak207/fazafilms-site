import * as THREE from 'three';

const EPS = 1e-7;
const sameNumber = (a, b) => Math.abs(a - b) <= EPS;
const normalAngle = value => Math.atan2(Math.sin(value), Math.cos(value));
const dataBox = box => new THREE.Box3(new THREE.Vector3(...box.min), new THREE.Vector3(...box.max));

/** Preserve the measured track's fixed bodies in the engine's circle/OBB schema. */
export function normalizeFixedObstacles(records) {
  if (!Array.isArray(records)) throw new TypeError('Нужен список неподвижных препятствий.');
  const seen = new Set();
  return records.map(record => {
    const item = { ...record, id: String(record.id), kind: record.kind || 'fixed' };
    if (!item.id || item.id === 'undefined' || seen.has(item.id) || item.kind === 'exhibit') {
      throw new Error('Неверный или повторный ID неподвижного препятствия: ' + item.id);
    }
    seen.add(item.id);
    if (item.shape === 'cylinder') {
      item.shape = 'circle'; item.centerXZ = record.centerXZ ? [...record.centerXZ] : [record.x, record.z];
    } else if (item.shape === 'capsule') {
      if (!Array.isArray(record.start) || !Array.isArray(record.end) || record.start.length !== 3 ||
          record.end.length !== 3 || ![...record.start, ...record.end, record.radius].every(Number.isFinite) || record.radius <= 0) {
        throw new Error('Некорректная балка монорельса: ' + item.id);
      }
      const dx = record.end[0] - record.start[0], dz = record.end[2] - record.start[2];
      const length = Math.hypot(dx, dz);
      // This enclosing OBB includes the round ends. The original vertical span
      // stays intact, so a low beam still excludes a visitor's full body height.
      item.shape = 'obb';
      item.centerXZ = [(record.start[0] + record.end[0]) / 2, (record.start[2] + record.end[2]) / 2];
      item.halfSizeXZ = [length / 2 + record.radius, record.radius];
      item.rotationY = length > EPS ? Math.atan2(-dz, dx) : 0;
      item.conservativeCapsule = true;
    } else if (record.centerXZ) item.centerXZ = [...record.centerXZ];
    if (!Array.isArray(item.centerXZ) || item.centerXZ.length !== 2 || !item.centerXZ.every(Number.isFinite) ||
        !Number.isFinite(item.minY) || !Number.isFinite(item.maxY) || item.maxY <= item.minY) {
      throw new Error('Некорректные границы неподвижного препятствия: ' + item.id);
    }
    if (item.shape === 'circle') {
      if (!Number.isFinite(item.radius) || item.radius <= 0) throw new Error('Некорректный радиус опоры: ' + item.id);
    } else if (item.shape === 'obb') {
      item.halfSizeXZ = [...(item.halfSizeXZ || [])]; item.rotationY = item.rotationY ?? 0;
      if (item.halfSizeXZ.length !== 2 || !item.halfSizeXZ.every(value => Number.isFinite(value) && value > 0) || !Number.isFinite(item.rotationY)) {
        throw new Error('Некорректный размер препятствия: ' + item.id);
      }
    } else throw new Error('Неизвестная форма неподвижного препятствия: ' + item.shape);
    return item;
  });
}

function savePose(root) {
  return {
    root, parent: root.parent, position: root.position.clone(), quaternion: root.quaternion.clone(),
    scale: root.scale.clone(), matrix: root.matrix.clone(), matrixAutoUpdate: root.matrixAutoUpdate,
    visible: root.visible, editorVisible: root.userData.editorVisible,
  };
}

function restorePose(pose) {
  const root = pose.root;
  if (root.parent !== pose.parent) {
    root.removeFromParent();
    pose.parent?.add(root);
  }
  root.position.copy(pose.position); root.quaternion.copy(pose.quaternion); root.scale.copy(pose.scale);
  root.matrix.copy(pose.matrix); root.matrixAutoUpdate = pose.matrixAutoUpdate;
  root.visible = pose.visible;
  if (pose.editorVisible === undefined) delete root.userData.editorVisible;
  else root.userData.editorVisible = pose.editorVisible;
  root.updateWorldMatrix(true, true);
}

function candidateMatrix(root, placement) {
  root.updateWorldMatrix(true, false);
  if (!placement) return root.matrixWorld.clone();
  const rotation = root.rotation.clone(); rotation.y = placement.rotationY;
  const local = new THREE.Matrix4().compose(
    new THREE.Vector3(placement.x, placement.baseY, placement.z),
    new THREE.Quaternion().setFromEuler(rotation),
    Number.isFinite(placement.scaleFactor) ? new THREE.Vector3().setScalar(placement.scaleFactor) : root.scale,
  );
  return root.parent ? new THREE.Matrix4().multiplyMatrices(root.parent.matrixWorld, local) : local;
}

/** A conservative world OBB, retaining actual yaw, scale and vertical span. */
export function boxToObstacle(localBox, matrixWorld, metadata = {}) {
  const size = localBox.getSize(new THREE.Vector3()), center = localBox.getCenter(new THREE.Vector3()).applyMatrix4(matrixWorld);
  const x = new THREE.Vector3().setFromMatrixColumn(matrixWorld, 0);
  const y = new THREE.Vector3().setFromMatrixColumn(matrixWorld, 1);
  const z = new THREE.Vector3().setFromMatrixColumn(matrixWorld, 2);
  const sx = x.length(), sy = y.length(), sz = z.length();
  if (![...matrixWorld.elements, size.x, size.y, size.z].every(Number.isFinite) || Math.min(sx, sy, sz) <= EPS || localBox.isEmpty()) {
    throw new Error('Некорректные габариты или масштаб экспоната.');
  }
  // Normal editor poses remain exact OBBs. Tilt/shear from an external tool
  // falls back to an enclosing box, never an underestimated footprint.
  const upright = Math.abs(x.y) < EPS * sx && Math.abs(z.y) < EPS * sz &&
    Math.hypot(y.x, y.z) < EPS * sy && Math.abs(x.dot(z)) < EPS * sx * sz;
  if (upright) return {
    ...metadata, shape: 'obb', centerXZ: [center.x, center.z],
    halfSizeXZ: [size.x * sx / 2, size.z * sz / 2], rotationY: Math.atan2(-x.z, x.x),
    minY: center.y - size.y * sy / 2, maxY: center.y + size.y * sy / 2,
  };
  const worldBox = localBox.clone().applyMatrix4(matrixWorld);
  worldBox.getCenter(center); worldBox.getSize(size);
  return {
    ...metadata, shape: 'obb', centerXZ: [center.x, center.z], halfSizeXZ: [size.x / 2, size.z / 2],
    rotationY: 0, minY: worldBox.min.y, maxY: worldBox.max.y, conservativeTransform: true,
  };
}

function equalObstacle(a, b) {
  return a && b && a.id === b.id && a.shape === b.shape &&
    ['minY', 'maxY'].every(key => sameNumber(a[key], b[key])) &&
    sameNumber(normalAngle(a.rotationY - b.rotationY), 0) &&
    a.centerXZ.every((v, i) => sameNumber(v, b.centerXZ[i])) &&
    a.halfSizeXZ.every((v, i) => sameNumber(v, b.halfSizeXZ[i]));
}

function equalList(a, b) {
  return a.length === b.length && a.every((item, i) => equalObstacle(item, b[i]));
}

function pointTouchesBox(position, radius, center, halfSize, angle, margin = 0) {
  const dx = position.x - center[0], dz = position.z - center[1], c = Math.cos(angle), s = Math.sin(angle);
  const x = c * dx - s * dz, z = s * dx + c * dz;
  return Math.hypot(Math.max(0, Math.abs(x) - halfSize[0] - margin),
    Math.max(0, Math.abs(z) - halfSize[1] - margin)) < radius + EPS;
}

/** Detect continuous drag/rotation contacts even when both endpoint poses are free. */
export function sweptVisitorConflicts(previous, next, visitors, contactMargin = 0) {
  const before = new Map(previous.map(p => [p.id, p])), conflicts = [];
  for (const target of next) {
    const old = before.get(target.id);
    if (!old || equalObstacle(old, target)) continue;
    const halfSize = target.halfSizeXZ.map((v, i) => Math.max(v, old.halfSizeXZ[i]));
    const radius = Math.hypot(...halfSize), distance = Math.hypot(...target.centerXZ.map((v, i) => v - old.centerXZ[i]));
    const angle = normalAngle(target.rotationY - old.rotationY);
    const motion = distance + radius * Math.abs(angle);
    // Midpoint samples enclose the complete interval with a Lipschitz bound.
    // Capping the sample count only enlarges the bound; it cannot create gaps.
    const steps = Math.max(1, Math.min(240, Math.ceil(motion / 0.12)));
    const margin = motion / (2 * steps) + EPS;
    const minY = Math.min(old.minY, target.minY), maxY = Math.max(old.maxY, target.maxY);
    const minX = Math.min(old.centerXZ[0], target.centerXZ[0]) - radius;
    const maxX = Math.max(old.centerXZ[0], target.centerXZ[0]) + radius;
    const minZ = Math.min(old.centerXZ[1], target.centerXZ[1]) - radius;
    const maxZ = Math.max(old.centerXZ[1], target.centerXZ[1]) + radius;
    for (const visitor of visitors) {
      const p = visitor.position, r = visitor.radius + contactMargin, h = visitor.height ?? 2.05;
      if (p.y + h <= minY + EPS || p.y >= maxY - EPS || p.x + r < minX || p.x - r > maxX || p.z + r < minZ || p.z - r > maxZ) continue;
      for (let i = 0; i < steps; i++) {
        const t = (i + 0.5) / steps;
        const center = old.centerXZ.map((v, axis) => v + (target.centerXZ[axis] - v) * t);
        if (pointTouchesBox(p, r, center, halfSize, old.rotationY + angle * t, margin)) {
          conflicts.push({ instanceId: target.id, visitorId: visitor.id, phase: 'swept-motion' });
          break;
        }
      }
    }
  }
  return conflicts;
}

const reasons = {
  occupied_by_visitors: 'На пути экспоната находится посетитель. Оставлена последняя допустимая позиция.',
  transition_corridor: 'Эта позиция перекрывает лестницу или действующий проход к лифту.',
  no_clearance: 'В этой позиции не остаётся свободного прохода для посетителей.',
  stale_revision: 'Расстановка уже изменилась. Повторите действие.',
  revision_conflict: 'Расстановка уже изменилась. Повторите действие.',
  active_transfer: 'Посетитель проходит между этажами. Его путь должен оставаться свободным.',
  missing_clean_navigation_baseline: 'Не загружена основа проходов для изменения расстановки.',
};

/**
 * One adapter connects actual loaded exhibit roots to CrowdSimulation.
 * Clipping and inspection mesh visibility are rendering effects, not removals.
 * Individual editor visibility and the exhibit group visibility are semantic.
 */
export function createDynamicObstacleAdapter({ exhibits, onChange = () => {} }) {
  if (!exhibits?.setPlacementGuard || !Array.isArray(exhibits.roots)) throw new TypeError('Нужен совместимый модуль расстановки.');
  const boxes = new WeakMap();
  let simulation = null, bound = false, disposed = false, acceptedProxies = [], acceptedPoses = [], acceptedSignature = '';
  let rejected = 0, commits = 0, lastError = null, lastReason = null;

  function localBounds(root) {
    if (boxes.has(root)) return boxes.get(root);
    let box;
    if (root.userData.collisionBounds) box = dataBox(root.userData.collisionBounds);
    else {
      root.updateWorldMatrix(true, true);
      const inverse = root.matrixWorld.clone().invert(), point = new THREE.Vector3();
      box = new THREE.Box3();
      root.traverse(node => {
        if (!node.isMesh || !node.geometry?.attributes.position) return;
        const matrix = new THREE.Matrix4().multiplyMatrices(inverse, node.matrixWorld), positions = node.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) box.expandByPoint(point.fromBufferAttribute(positions, i).applyMatrix4(matrix));
      });
    }
    boxes.set(root, box); return box;
  }

  function snapshot({ changes = [], groupVisible = exhibits.group.visible } = {}) {
    const changed = new Map(changes.map(row => [row.instanceId, row.next]));
    const proxies = [];
    exhibits.group.updateWorldMatrix(true, false);
    if (groupVisible) for (const root of exhibits.roots) {
      const id = root.userData.instanceId, next = changed.get(id);
      const visible = next ? next.visible : root.visible && root.userData.editorVisible !== false;
      if (!visible || !root.parent) continue;
      const matrix=candidateMatrix(root,next);
      const metadata={kind:'exhibit',objectId:root.userData.exhibitId,instanceId:id,name:root.userData.exhibitName||id,floating:Boolean(root.userData.floating)};
      if(Array.isArray(root.userData.collisionParts)){
        const seen=new Set();
        for(const [index,part] of root.userData.collisionParts.entries()){
          const partId=String(part.id ?? index);
          if(seen.has(partId)||![...(part.min||[]),...(part.max||[])].every(Number.isFinite)||part.min?.length!==3||part.max?.length!==3||part.max.some((value,i)=>value<=part.min[i]))throw new Error('Некорректная часть препятствия: '+id+' / '+partId);
          seen.add(partId);
          let partMatrix=matrix;
          if(part.position||part.rotationY){
            const position=part.position||[0,0,0],yaw=part.rotationY||0;
            if(position.length!==3||!position.every(Number.isFinite)||!Number.isFinite(yaw))throw new Error('Некорректная ориентация части: '+partId);
            const local=new THREE.Matrix4().compose(new THREE.Vector3(...position),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw),new THREE.Vector3(1,1,1));
            partMatrix=matrix.clone().multiply(local);
          }
          proxies.push(boxToObstacle(dataBox(part),partMatrix,{...metadata,id:id+'::'+partId,socialTarget:part.socialTarget!==false}));
        }
      }else proxies.push(boxToObstacle(localBounds(root),matrix,{...metadata,id}));
    }
    proxies.sort((a, b) => a.id.localeCompare(b.id));
    return { proxies, instanceCount: exhibits.roots.length, visibleCount: proxies.length };
  }

  function signature() {
    const values = [exhibits.group.visible];
    for (const root of exhibits.roots) {
      root.updateWorldMatrix(true, false);
      values.push(root.uuid, root.parent?.uuid || '', root.visible, root.userData.editorVisible, ...root.matrixWorld.elements);
    }
    return values.join('|');
  }

  function remember(proxies) {
    acceptedProxies = proxies;
    acceptedPoses = [exhibits.group, ...exhibits.roots].map(savePose);
    acceptedSignature = signature();
  }

  function state() {
    return {
      ready: bound, revision: simulation?.world.revision ?? null,
      instances: exhibits.roots.length, activeObstacles: acceptedProxies.length,
      commits, rejected, lastReason, lastError,
    };
  }

  function emit() { onChange(state()); }
  function reject(result) {
    rejected++; lastReason = result.reason || 'invalid_transform';
    lastError = result.error || reasons[lastReason] || 'Экспонат не перемещён: нет безопасного свободного места.';
    const rejectedResult = { ...result, ok: false, error: lastError };
    emit(); return rejectedResult;
  }

  function validate(proxies) {
    if (!simulation) return { ok: true, revision: null };
    const conflicts = sweptVisitorConflicts(acceptedProxies, proxies, simulation.order, simulation.contactMargin || 0);
    if (conflicts.length) return { ok: false, reason: 'occupied_by_visitors', conflicts };
    return simulation.updateObstacles(proxies, { dryRun: true, expectedRevision: simulation.world.revision });
  }

  function prepare(change) {
    if (disposed) return { ok: false, error: 'Проверка расстановки отключена.' };
    try {
      const { proxies } = snapshot(change);
      if (equalList(acceptedProxies, proxies)) return { ok: true, afterApply: () => remember(proxies) };
      const validation = validate(proxies);
      if (!validation.ok) return reject(validation);
      return {
        ok: true,
        commit() {
          if (!simulation) return { ok: true };
          const result = simulation.updateObstacles(proxies, { expectedRevision: validation.revision });
          if (!result.ok) return reject(result);
          commits++; lastReason = null; lastError = null; return result;
        },
        afterApply() { remember(proxies); emit(); },
      };
    } catch (error) { return reject({ reason: 'invalid_transform', error: error.message || String(error) }); }
  }

  remember(snapshot().proxies);
  const detachGuard = exhibits.setPlacementGuard(prepare);
  return {
    snapshot, getState: state,
    bindSimulation(value) {
      if (!value?.updateObstacles || !value.world || !Array.isArray(value.order)) throw new TypeError('Нужен CrowdSimulation с updateObstacles.');
      simulation = value; bound = false;
      const current = snapshot().proxies;
      const result = simulation.updateObstacles(current, { expectedRevision: simulation.world.revision });
      if (!result.ok) return reject(result);
      bound = true; remember(current); lastError = null; lastReason = null; emit(); return result;
    },
    // Catch integrations that directly change a root instead of using the editor.
    // Call before every simulation/render step; a rejected change is rolled back.
    sync() {
      if (disposed || signature() === acceptedSignature) return false;
      const transaction = prepare({});
      const result = transaction.ok ? (transaction.commit?.() || { ok: true }) : transaction;
      if (!result.ok) {
        const known = new Set(acceptedPoses.map(row => row.root));
        acceptedPoses.forEach(restorePose);
        // Keep a newly loaded model in memory while rejecting its unsafe pose.
        for (const root of exhibits.roots) if (!known.has(root)) { root.visible = false; root.userData.editorVisible = false; }
        acceptedSignature = signature(); emit(); return true;
      }
      transaction.afterApply?.(); return true;
    },
    invalidateBounds(id) {
      for (const root of exhibits.roots) if (!id || root.userData.instanceId === id) boxes.delete(root);
      acceptedSignature = '';
    },
    dispose() { if (disposed) return; disposed = true; detachGuard(); simulation = null; bound = false; },
  };
}

