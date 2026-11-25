import * as THREE from 'three';
import { acceleratedRaycast } from './vendor/three-mesh-bvh/index.module.js';

const finite = Number.isFinite;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const noSight = value => value?.occludesSight === false || ['interactive-safety-zone', 'reserved-lift-threshold'].includes(value?.collisionKind) || ['interactive-safety-zone', 'reserved-lift-threshold'].includes(value?.kind);
const visible = object => { for (let node = object; node; node = node.parent) if (!node.visible) return false; return true; };

export function horizontalCameraFov(camera) {
  const degrees = camera.getEffectiveFOV?.() ?? (2 * Math.atan(Math.tan((camera.fov || 68) * Math.PI / 360) / (camera.zoom || 1)) * 180 / Math.PI);
  if (!finite(degrees) || !finite(camera.aspect) || camera.aspect <= 0) return null;
  return 2 * Math.atan(Math.tan(degrees * Math.PI / 360) * camera.aspect);
}

function normalizeSightProxy(value, eyeY) {
  if (!value || noSight(value)) return null;
  let item = value;
  if (item.shape === 'capsule') {
    const [a, b, r] = [item.start, item.end, item.radius];
    if (!a?.every(finite) || !b?.every(finite) || a.length !== 3 || b.length !== 3 || !finite(r) || r <= 0) return null;
    item = { ...item, shape: 'obb', centerXZ: [(a[0] + b[0]) / 2, (a[2] + b[2]) / 2],
      halfSizeXZ: [Math.hypot(b[0] - a[0], b[2] - a[2]) / 2 + r, r], rotationY: Math.atan2(-(b[2] - a[2]), b[0] - a[0]),
      minY: item.minY ?? Math.min(a[1], b[1]) - r, maxY: item.maxY ?? Math.max(a[1], b[1]) + r };
  } else if (item.shape === 'cylinder') item = { ...item, shape: 'circle', centerXZ: item.centerXZ || [item.x, item.z] };
  if (!finite(item.minY) || !finite(item.maxY) || eyeY < item.minY || eyeY > item.maxY || item.centerXZ?.length !== 2 || !item.centerXZ.every(finite)) return null;
  if (item.shape === 'circle' && finite(item.radius) && item.radius > 0) return item;
  if (item.shape === 'obb' && item.halfSizeXZ?.length === 2 && item.halfSizeXZ.every(value => finite(value) && value > 0) && finite(item.rotationY ?? 0)) return item;
  return null;
}

function proxyDistance(proxy, x, z, dx, dz, limit) {
  const ox = x - proxy.centerXZ[0], oz = z - proxy.centerXZ[1];
  if (proxy.shape === 'circle') {
    const dot = ox * dx + oz * dz, c = ox * ox + oz * oz - proxy.radius * proxy.radius;
    if (c <= 0) return 0;
    const discriminant = dot * dot - c; if (discriminant < 0) return limit;
    const near = -dot - Math.sqrt(discriminant); return near >= 0 ? Math.min(limit, near) : limit;
  }
  const cos = Math.cos(proxy.rotationY || 0), sin = Math.sin(proxy.rotationY || 0);
  const origin = [cos * ox - sin * oz, sin * ox + cos * oz], direction = [cos * dx - sin * dz, sin * dx + cos * dz];
  let near = 0, far = limit;
  for (let axis = 0; axis < 2; axis++) {
    const half = proxy.halfSizeXZ[axis];
    if (Math.abs(direction[axis]) < 1e-9) { if (Math.abs(origin[axis]) > half) return limit; continue; }
    let a = (-half - origin[axis]) / direction[axis], b = (half - origin[axis]) / direction[axis];
    if (a > b) [a, b] = [b, a]; near = Math.max(near, a); far = Math.min(far, b);
    if (near > far) return limit;
  }
  return near;
}

/** A bounded horizontal slice at eye height; this is not a pixel-perfect 3D visibility solution. */
export function createWalkViewFootprint({ getStaticMeshes = () => [], getDynamicRoots = () => [], getObstacles = () => [], maxDistanceM = 24, rayCount = 31 } = {}) {
  const range = clamp(maxDistanceM, 1, 50), count = clamp(Math.round(rayCount), 9, 61);
  const cache = new WeakMap(), queryMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const caster = new THREE.Raycaster(), direction = new THREE.Vector3(), forward = new THREE.Vector3(), origin = new THREE.Vector3(), hitPoint = new THREE.Vector3();
  caster.firstHitOnly = true;
  let disposed = false, lastStats = null;
  function collect(cameraPosition) {
    const all = new Set(getStaticMeshes() || []);
    for (const root of getDynamicRoots() || []) if (visible(root)) root.traverse?.(mesh => { if (mesh.isMesh && visible(mesh)) all.add(mesh); });
    const candidates = [], boxes = [];
    for (const mesh of all) {
      if (!mesh?.isMesh || !mesh.geometry?.attributes?.position || mesh.userData?.equipmentPreview) continue;
      mesh.updateWorldMatrix(true, false);
      let record = cache.get(mesh);
      if (!record || record.geometry !== mesh.geometry) {
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        record = { geometry: mesh.geometry, box: new THREE.Box3(), query: new THREE.Mesh(mesh.geometry, queryMaterial) }; cache.set(mesh, record);
      }
      record.box.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
      if (record.box.isEmpty() || cameraPosition.y < record.box.min.y || cameraPosition.y > record.box.max.y || record.box.distanceToPoint(cameraPosition) > range) continue;
      const triangles = (mesh.geometry.index?.count || mesh.geometry.attributes.position.count) / 3;
      // Skinned/instanced meshes and not-yet-indexed heavy geometry use a conservative bound.
      if (mesh.isSkinnedMesh || mesh.isInstancedMesh || mesh.isBatchedMesh || triangles > 2000 && !mesh.geometry.boundsTree) {
        boxes.push({ shape: 'obb', centerXZ: [(record.box.min.x + record.box.max.x) / 2, (record.box.min.z + record.box.max.z) / 2],
          halfSizeXZ: [(record.box.max.x - record.box.min.x) / 2, (record.box.max.z - record.box.min.z) / 2], rotationY: 0 }); continue;
      }
      record.query.matrixWorld.copy(mesh.matrixWorld);
      record.query.morphTargetInfluences = mesh.morphTargetInfluences;
      record.query.raycast = mesh.geometry.boundsTree ? acceleratedRaycast : THREE.Mesh.prototype.raycast;
      candidates.push(record);
    }
    return { candidates, boxes, meshCount: all.size };
  }
  function sample(camera, { floorId, zoneId } = {}) {
    if (disposed || !camera?.isPerspectiveCamera || !['main', 'upper'].includes(floorId)) return null;
    camera.updateWorldMatrix(true, false); camera.getWorldPosition(origin); camera.getWorldDirection(forward);
    const fov = horizontalCameraFov(camera), length = Math.hypot(forward.x, forward.z);
    if (!finite(fov) || fov <= 0 || fov >= Math.PI || ![origin.x, origin.y, origin.z, length].every(finite) || length < 1e-6) return null;
    const dx = forward.x / length, dz = forward.z / length, heading = Math.atan2(dx, -dz);
    const { candidates, boxes, meshCount } = collect(origin);
    const proxies = (getObstacles() || []).map(item => normalizeSightProxy(item, origin.y)).filter(Boolean).concat(boxes);
    const polygon = [[origin.x, origin.z]], hits = [];
    let meshQueries = 0;
    for (let index = 0; index < count; index++) {
      const angle = heading - fov / 2 + fov * index / (count - 1);
      direction.set(Math.sin(angle), 0, -Math.cos(angle));
      let distance = range;
      for (const proxy of proxies) distance = proxyDistance(proxy, origin.x, origin.z, direction.x, direction.z, distance);
      caster.set(origin, direction); caster.near = .025; caster.far = distance;
      for (const record of candidates) {
        // From inside a compound CAD bound intersectBox returns its exit, not an
        // entry. A wall inside that bound may still be closer than that exit.
        if (!record.box.containsPoint(origin) && (!caster.ray.intersectBox(record.box, hitPoint) || hitPoint.distanceTo(origin) > distance + .03)) continue;
        hits.length = 0; record.query.raycast(caster, hits); meshQueries++;
        for (const hit of hits) if (finite(hit.distance) && hit.distance >= 0 && hit.distance < distance) distance = hit.distance;
        caster.far = distance;
      }
      distance = Math.max(0, distance < range ? distance - .035 : distance);
      polygon.push([origin.x + direction.x * distance, origin.z + direction.z * distance]);
    }
    lastStats = { rays: count, meshCount, candidateMeshes: candidates.length, conservativeBounds: boxes.length, proxyCount: proxies.length, meshQueries };
    return { x: origin.x, y: origin.y, z: origin.z, floorId, zoneId: zoneId || null, directionXZ: [dx, dz], horizontalFovRad: fov,
      visiblePolygonXZ: polygon, maxDistanceM: range };
  }
  return { sample, getStats: () => lastStats ? { ...lastStats } : null, dispose() { if (disposed) return; disposed = true; queryMaterial.dispose(); } };
}

/** Sampling is capped even when many layout changes request a fresh packet in one frame. */
export function createWalkViewTelemetry({ getCamera, getWalkState, getBridgeState, footprint, sendView, intervalMs = 100 } = {}) {
  const interval = Math.max(100, intervalMs);
  let lastSample = -Infinity, signature = '', dirty = true, samples = 0, sent = 0, lastError = null;
  return {
    request() { dirty = true; },
    update(time) {
      const bridge = getBridgeState(), walk = getWalkState();
      if (!finite(time) || !bridge.enabled || !bridge.visible || !bridge.split || !walk.active || walk.paused || bridge.pending || bridge.zoneSequence < 0 || bridge.appliedZoneSequence !== bridge.zoneSequence || time - lastSample < interval) return false;
      lastSample = time; samples++;
      let view = null;
      try { view = footprint.sample(getCamera(), { floorId: walk.position?.level || walk.position?.floorId, zoneId: walk.zoneId }); lastError = null; }
      catch (error) { lastError = error?.message || String(error); }
      const next = JSON.stringify(view);
      if (!dirty && signature === next) return false;
      signature = next; dirty = false;
      if (sendView(view)) { sent++; return true; }
      dirty = true; return false;
    },
    getStats: () => ({ samples, sent, lastError, intervalMs: interval }),
  };
}
