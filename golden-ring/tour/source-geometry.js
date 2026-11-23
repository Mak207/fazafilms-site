import * as THREE from '../interactives/vendor/three-0.180/three.module.min.js';

const ASSET_URL = new URL('./assets/source-objects.glb?v=20261123-source-07', import.meta.url);
const SELECTION_URL = new URL('./assets/source-surface-selections.json?v=20261123-source-07', import.meta.url);

function indexFingerprint(index) {
  let value = 2166136261;
  for (let i = 0; i < index.count; i++) value = Math.imul(value ^ index.getX(i), 16777619) >>> 0;
  return value;
}

/**
 * Replace only source-verified triangles of the original pavilion.
 * Source objects keep native geometry; front screens and FR20 mating transforms are documented corrections. Pavilion walls,
 * supports and visitor rigs are never selected by a bounding-box guess.
 *
 * @returns {Promise<{bindings:Object,surfaces:Array,report:Object,root:THREE.Group}>}
 */
export async function prepareSourceGeometry(model, loader) {
  if (model.userData.sourceGeometryPrepared) return model.userData.sourceGeometryPrepared;
  const [response, source] = await Promise.all([
    fetch(SELECTION_URL),
    loader.loadAsync(ASSET_URL.href),
  ]);
  if (!response.ok) throw new Error('Source surface metadata: HTTP ' + response.status);
  const metadata = await response.json();
  // Versioned metadata refines inspection cameras without recompressing source geometry.
  const surfaceMetadata = new Map((metadata.surfaces || []).map(surface => [surface.id, surface]));
  const staged = [];
  // Validate every original index buffer before changing any mesh.
  for (const selection of metadata.removals) {
    const mesh = model.getObjectByName(selection.mesh);
    if (!mesh?.isMesh || !mesh.geometry.index) throw new Error('Source mesh missing: ' + selection.mesh);
    const geometry = mesh.geometry;
    if (geometry.attributes.position.count !== selection.expectedVertices ||
        geometry.index.count / 3 !== selection.expectedTriangles ||
        indexFingerprint(geometry.index) !== selection.indexFNV) {
      throw new Error('Pavilion version does not match source selections: ' + selection.mesh);
    }
    const removed = new Uint8Array(selection.expectedTriangles);
    for (const [start, count] of selection.ranges) removed.fill(1, start, start + count);
    const next = [];
    for (let triangle = 0; triangle < removed.length; triangle++) {
      if (!removed[triangle]) for (let k = 0; k < 3; k++) next.push(geometry.index.getX(triangle * 3 + k));
    }
    if (geometry.index.count - next.length !== selection.removedTriangles * 3) {
      throw new Error('Invalid source selection count: ' + selection.mesh);
    }
    const replacement = geometry.clone();
    replacement.setIndex(next);
    // Original merged pavilion groups each use one material. Keep the original
    // material and attributes; only verified object triangles are omitted.
    replacement.clearGroups();
    replacement.computeBoundingBox();
    replacement.computeBoundingSphere();
    staged.push({mesh, replacement, removed: selection.removedTriangles});
  }

  const root = source.scene;
  root.name = 'CustomerSourceObjects';
  const bindings = {};
  const surfaces = [];
  const sourceGroups = {};
  root.traverse(object => {
    const nativeData = object.userData || {};
    const data = nativeData.role === 'surface' && surfaceMetadata.has(nativeData.id)
      ? {...nativeData, ...surfaceMetadata.get(nativeData.id)} : nativeData;
    object.userData = data;
    if (object.isMesh) {
      object.castShadow = data.role !== 'surface';
      object.receiveShadow = true;
      if (object.material) {
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          material.side = THREE.DoubleSide;
        }
      }
    }
    if (data.interactiveId) {
      const id = data.interactiveId;
      const binding = bindings[id] ||= {id, root, parts: [], roles: {}, sourceGroups: []};
      if (data.partId && (object.isGroup || !object.isMesh)) sourceGroups[id + ':' + data.partId] = object;
      if (object.isMesh) {
        const part = {...data, mesh: object, object, isSurface: data.role === 'surface', role: data.interactiveRole || data.role || 'body', partId: data.partId || object.name,
          pivot: data.pivot || [0, 0, 0], axis: data.axis || [0, 1, 0],
          sourceObject: data.sourceObject, sourceGroup: data.sourceGroup};
        binding.parts.push(part);
        (binding.roles[part.role] ||= []).push(part);
      }
    }
    if (object.isMesh && data.role === 'surface') {
      surfaces.push({mesh: object, ...data, interactiveId: data.interactiveId || null,
        UVorientation: data.UVorientation || 'v-up', aspect: Number(data.aspect) || 1});
    }
  });
  for (const binding of Object.values(bindings)) {
    binding.sourceGroups = Object.entries(sourceGroups).filter(([key]) => key.startsWith(binding.id + ':')).map(([, value]) => value);
    for (const part of binding.parts) part.group = sourceGroups[binding.id + ':' + part.partId] || part.mesh;
  }
  // Commit replacement only after asset loading and every version check passes.
  for (const {mesh, replacement} of staged) {
    const previous = mesh.geometry;
    mesh.geometry = replacement;
    previous.dispose();
  }
  model.add(root);
  root.updateMatrixWorld(true);
  const report = {version: metadata.version, revision: metadata.revision, status: metadata.status, sourceSha256: metadata.sourceSha256,
    robotAssemblyRepair: metadata.robotAssemblyRepair || null, robotRig: metadata.robotRig || null,
    surfaces: surfaces.length, bindings: Object.keys(bindings),
    replacedMeshes: staged.length, removedTriangles: staged.reduce((sum, item) => sum + item.removed, 0),
    sourceAsset: ASSET_URL.pathname, coverage: metadata.coverage || []};
  const prepared = {bindings, surfaces, report, root};
  model.userData.sourceGeometryPrepared = prepared;
  return prepared;
}
