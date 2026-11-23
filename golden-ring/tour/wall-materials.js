import * as THREE from '../interactives/vendor/three-0.180/three.module.min.js';

const VERSION = '20261123-wall-design-01';
const SELECTION_URL = new URL('./assets/finishes/wall-selections.json?v=' + VERSION, import.meta.url);

const FINISHES = {
  chalk: {color:'#E9E2D3', label:'Тёплый мел', tile:1.45, roughness:.96, minRoughness:.89, relief:.20, grain:.13, base:.18},
  stone: {color:'#D4C6AC', label:'Светлый известняк', tile:1.15, roughness:.93, minRoughness:.85, relief:.31, grain:.22, base:.26},
  sage: {color:'#7B8C7A', label:'Минеральный шалфей', tile:1.6, roughness:.97, minRoughness:.91, relief:.17, grain:.12, base:.48},
  water: {color:'#527A75', label:'Волжский зелёный', tile:1.55, roughness:.96, minRoughness:.90, relief:.17, grain:.12, base:.34},
  oak: {color:'#97734E', label:'Тёплый шпон', tile:1.8, roughness:.78, minRoughness:.70, relief:.23, grain:.68, base:.10, texture:'veneer'},
  graphite: {color:'#374944', label:'Тёплый графит', tile:1.5, roughness:.97, minRoughness:.91, relief:.16, grain:.10, base:.22}
};

function indexFingerprint(index) {
  let value = 2166136261;
  for (let i = 0; i < index.count; i++) value = Math.imul(value ^ index.getX(i), 16777619) >>> 0;
  return value;
}

// Reuse the licensed Poly Haven maps already loaded by finishGallery.
// The architectural colour is controlled independently from a scan's baked colour.
// No new network texture requests or bitmap variants are needed.
function textureSet(model, name) {
  const mesh = model.getObjectByName(name === 'veneer' ? 'Pavilion_veneer' : 'Pavilion_plaster');
  const material = mesh?.material;
  if (!material?.map || !material.normalMap || !material.roughnessMap) {
    throw new Error('Wall finish texture set is not ready: ' + name);
  }
  return {map:material.map, normalMap:material.normalMap, roughnessMap:material.roughnessMap,
    aoMap:material.aoMap};
}

function createFinish(id, textures) {
  const finish = FINISHES[id];
  const material = new THREE.MeshStandardMaterial({
    name:'ExhibitionWall_' + id, color:finish.color, ...textures,
    roughness:finish.roughness, metalness:0, aoMapIntensity:.22,
    normalScale:new THREE.Vector2(finish.relief, -finish.relief),
    envMapIntensity:.28, side:THREE.DoubleSide
  });
  material.userData.wallFinish = {id, ...finish, textureSource:'Existing Poly Haven CC0 scan'};
  material.customProgramCacheKey = () => 'golden-ring-walls-' + VERSION + '-' + id;
  material.onBeforeCompile = shader => {
    shader.uniforms.wallMetersPerTile = {value:finish.tile};
    shader.uniforms.wallGrainContrast = {value:finish.grain};
    shader.uniforms.wallMinRoughness = {value:finish.minRoughness};
    shader.uniforms.wallBaseContrast = {value:finish.base};
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float wallMetersPerTile;\nvarying vec3 vWallWorldPosition;')
      .replace('#include <worldpos_vertex>', String.raw`#include <worldpos_vertex>
        vWallWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
        // Quantized GLB meshes retain their transforms; derive metric mapping
        // from actual world coordinates, independently of the old category UVs.
        vec3 wallNormal = abs(normalize(mat3(modelMatrix) * objectNormal));
        vec2 wallUv = wallNormal.y > max(wallNormal.x, wallNormal.z)
          ? vWallWorldPosition.xz
          : (wallNormal.x > wallNormal.z ? vWallWorldPosition.zy : vWallWorldPosition.xy);
        wallUv /= wallMetersPerTile;
        #ifdef USE_MAP
          vMapUv = wallUv;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = wallUv;
        #endif
        #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv = wallUv;
        #endif
        #ifdef USE_AOMAP
          vAoMapUv = wallUv;
        #endif
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', String.raw`#include <common>
        varying vec3 vWallWorldPosition;
        uniform float wallGrainContrast;
        uniform float wallMinRoughness;
        uniform float wallBaseContrast;
      `)
      .replace('#include <map_fragment>', String.raw`
        #ifdef USE_MAP
          vec3 scanColour = texture2D(map, vMapUv).rgb;
          float scanLuma = dot(scanColour, vec3(.2126, .7152, .0722));
          // Retain photographic microstructure without dirty patches or a
          // competing warm/cool cast over the interpretive images.
          float grain = clamp((scanLuma - .5) * wallGrainContrast, -.24, .18);
          diffuseColor.rgb *= 1.0 + grain;
        #endif
        // A quiet painted base grounds the walls at visitor eye level.
        // This changes finish only: no plinth geometry is introduced.
        float lowerWall = 1.0 - smoothstep(.12, .23, vWallWorldPosition.y);
        diffuseColor.rgb *= 1.0 - lowerWall * wallBaseContrast;
      `)
      .replace('#include <roughnessmap_fragment>', String.raw`#include <roughnessmap_fragment>
        roughnessFactor = max(roughnessFactor, wallMinRoughness);
      `);
  };
  return material;
}

/**
 * Apply the exhibition material scheme after prepareSourceGeometry.
 * Every selected triangle comes from a named object in the customer 1911 file
 * and the original export category. The current index fingerprints are checked
 * before any mutation. Position/normal/UV buffers are retained byte-for-byte;
 * the index is only reordered into material batches with the identical triangles.
 */
export async function finishWallMaterials(model, renderer) {
  if (model.userData.wallFinishReport) return model.userData.wallFinishReport;
  if (!model.userData.sourceGeometryPrepared) throw new Error('Apply wall finishes after source geometry');
  const response = await fetch(SELECTION_URL);
  if (!response.ok) throw new Error('Wall selection metadata: HTTP ' + response.status);
  const manifest = await response.json();
  if (manifest.version !== VERSION) throw new Error('Wall selection version mismatch');

  const staged = [];
  let triangleCount = 0;
  for (const selection of manifest.selections) {
    const mesh = model.getObjectByName(selection.mesh);
    const geometry = mesh?.geometry;
    if (!mesh?.isMesh || !geometry?.index ||
        geometry.attributes.position.count !== selection.expectedVertices ||
        geometry.index.count !== selection.expectedTriangles * 3 ||
        indexFingerprint(geometry.index) !== selection.indexFNV) {
      throw new Error('Wall source does not match prepared pavilion: ' + selection.mesh);
    }
    if (Array.isArray(mesh.material)) throw new Error('Wall materials already grouped: ' + mesh.name);
    const owner = new Int8Array(selection.expectedTriangles).fill(-1);
    for (let group = 0; group < selection.selections.length; group++) {
      const item = selection.selections[group];
      if (!FINISHES[item.finish]) throw new Error('Unknown wall finish: ' + item.finish);
      let count = 0;
      for (const [start, length] of item.ranges) {
        if (start < 0 || start + length > owner.length) throw new Error('Invalid wall selection range');
        for (let i = start; i < start + length; i++) {
          if (owner[i] !== -1) throw new Error('Overlapping wall selections: ' + mesh.name);
          owner[i] = group;
          count++;
        }
      }
      if (count !== item.triangles) throw new Error('Wall selection count mismatch');
      triangleCount += count;
    }
    const buckets = Array.from({length:selection.selections.length + 1}, () => []);
    for (let i = 0; i < owner.length; i++) {
      const bucket = buckets[owner[i] + 1];
      for (let k = 0; k < 3; k++) bucket.push(geometry.index.getX(i * 3 + k));
    }
    const reordered = new Uint32Array(geometry.index.count);
    const groups = [];
    let offset = 0;
    for (let i = 0; i < buckets.length; i++) {
      const bucket = buckets[i];
      if (!bucket.length) continue;
      reordered.set(bucket, offset);
      groups.push({start:offset, count:bucket.length, materialIndex:i});
      offset += bucket.length;
    }
    if (offset !== geometry.index.count) throw new Error('Wall batching lost triangles');
    staged.push({mesh, geometry, selection, reordered, groups});
  }

  const wall = textureSet(model, 'wall');
  const wood = textureSet(model, 'veneer');
  const materials = Object.fromEntries(Object.keys(FINISHES).map(id =>
    [id, createFinish(id, FINISHES[id].texture === 'veneer' ? wood : wall)]));

  const geometryCounts = [];
  for (const item of staged) {
    const {mesh, geometry, selection, reordered, groups} = item;
    const positionBuffer = geometry.attributes.position.array;
    const previousTriangles = geometry.index.count / 3;
    mesh.material = [mesh.material, ...selection.selections.map(x => materials[x.finish])];
    geometry.setIndex(new THREE.BufferAttribute(reordered, 1));
    geometry.clearGroups();
    for (const group of groups) geometry.addGroup(group.start, group.count, group.materialIndex);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.wallFinishes = selection.selections.map(x => ({
      finish:x.finish, triangles:x.triangles, areaM2:x.areaM2, sources:x.sources
    }));
    geometryCounts.push({mesh:mesh.name, vertices:geometry.attributes.position.count,
      trianglesBefore:previousTriangles, trianglesAfter:geometry.index.count / 3,
      samePositionBuffer:positionBuffer === geometry.attributes.position.array,
      drawGroups:groups.length});
  }
  const report = {
    version:VERSION, sourceSha256:manifest.sourceSha256,
    sourceRemovalVersion:manifest.sourceRemovalVersion,
    method:manifest.method, status:'applied',
    sourceCount:manifest.sources.length,
    matchedSources:manifest.sources.filter(x => x.matchedTriangles > 0).length,
    unclassified:manifest.unmatchedSources,
    protected:manifest.protected,
    replacedSourceMedia:manifest.replacedSourceMedia || [],
    meshes:staged.length, triangles:triangleCount,
    areaM2:Number(Object.values(manifest.coverage).reduce((sum, item) => sum + item.areaM2, 0).toFixed(2)),
    coverage:manifest.coverage, coverageByZone:manifest.coverageByZone,
    zoneMethod:manifest.zoneMethod, palette:manifest.palette,
    sources:manifest.sources.map(x => ({source:x.source, finish:x.finish, role:x.role,
      triangles:x.matchedTriangles, areaM2:x.matchedAreaM2})),
    geometryPreserved:geometryCounts.every(x => x.samePositionBuffer && x.trianglesBefore === x.trianglesAfter),
    geometryCounts,
    materials:Object.fromEntries(Object.entries(FINISHES).map(([id, value]) =>
      [id,{...value, textureSource:value.texture === 'veneer' ? 'walnut_veneer' : 'plastered_wall_04'}])),
    designMethods:[
      'Source concept and room sequence determine the material language.',
      'Light mineral architecture, quieter coloured backdrop and small timber accents keep exhibits legible.',
      'World-scale matte texture retains close detail without noisy large-scale mottling or gloss.',
      'Check wide view, visitor eye height and close detail under unchanged exposure; screens retain their own shaders.'
    ],
    skills:[
      'interactive-exhibition-web-3d',
      'interactive-exhibition-systems',
      'scenario-blender-lighting-rendering'
    ],
    reference:'interactive-exhibition-systems/references/authority-and-reading-map-ru.md: А. И. Михайловская, concept → spatial sequence → material language → review.',
    physicalColourMatch:'Digital review palette; no verified physical paint or lighting specification.'
  };
  model.userData.wallFinishReport = report;
  renderer.shadowMap.needsUpdate = true;
  return report;
}
