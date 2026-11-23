import * as THREE from 'three';
import { createNativeMotion } from '/review/exhibition-25-years/visitor-motion-v43.js?v=43';

// Reuse the exhibition's original meshes and native clips without retargeting,
// joint edits, IK, or changes to the exhibition runtime.
export const VISITOR_ROUTE = Object.freeze({
  id: 'central-hall',
  leftX: 5,
  rightX: 14,
  centerZ: 2.6,
  radius: 3.4,
  floorY: .0067,
  speed: 1.04,
  bodyRadius: .70,
  minimumStaticClearance: .9661,
});
const ASSET_ROOT = '/review/exhibition-25-years/assets/models/visitors/';
const PEOPLE = [
  { id: 'emma', model: 'walking-woman', offset: 0, gaitPhase: .35 },
  { id: 'ethan', model: 'walking-man', offset: .5, gaitPhase: .80 },
];
const modulo = THREE.MathUtils.euclideanModulo;

function makeRoute() {
  const { leftX, rightX, centerZ, radius } = VISITOR_ROUTE;
  // Standard Three.js paths provide arc-length parameterization. Both joins
  // and the loop seam have matching position and tangent.
  const path = new THREE.Path();
  path.moveTo(leftX, centerZ - radius);
  path.lineTo(rightX, centerZ - radius);
  path.absarc(rightX, centerZ, radius, -Math.PI / 2, Math.PI / 2, false);
  path.lineTo(leftX, centerZ + radius);
  path.absarc(leftX, centerZ, radius, Math.PI / 2, 3 * Math.PI / 2, false);
  path.arcLengthDivisions = 4096;
  for (const curve of path.curves) curve.arcLengthDivisions = 1024;
  path.updateArcLengths();
  return path;
}

function makeContactMaterial() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 12, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(42,38,34,.54)');
  gradient.addColorStop(.64, 'rgba(52,47,43,.27)');
  gradient.addColorStop(1, 'rgba(52,47,43,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(canvas),
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
}

export async function createPavilionVisitors(scene, loader) {
  const loaded = await Promise.all(PEOPLE.map(async person => {
    const urls = {
      model: ASSET_ROOT + person.model + '.glb?v=43',
      motion: ASSET_ROOT + 'motions/' + person.id + '-native-motions.glb?v=43',
      turns: ASSET_ROOT + 'motions/' + person.id + '-native-turns.glb?v=43',
    };
    const [model, motion, turns] = await Promise.all([
      loader.loadAsync(urls.model),
      loader.loadAsync(urls.motion),
      loader.loadAsync(urls.turns),
    ]);
    return { ...person, urls, model, motion, turns };
  }));

  const group = new THREE.Group();
  group.name = 'GoldenRingVisitors';
  const route = makeRoute();
  const routeLength = route.getLength();
  const contactMaterial = makeContactMaterial();
  const shadowGeometry = new THREE.PlaneGeometry(.76, .56);
  const footGeometry = new THREE.PlaneGeometry(.18, .31);
  const footPosition = new THREE.Vector3();
  let elapsed = 0;
  let disposed = false;
  const actors = loaded.map(person => {
    const holder = new THREE.Group();
    holder.name = 'Visitor_' + person.id;
    const grounding = new THREE.Group();
    grounding.name = 'NativeGrounding';
    const rig = person.model.scene;
    rig.traverse(object => {
      if (!object.isMesh) return;
      // Gallery shadow maps are static. Moving contact patches below stay with
      // the people instead of baking a frozen silhouette into those maps.
      object.castShadow = false;
      object.receiveShadow = true;
    });
    grounding.add(rig);
    holder.add(grounding);
    const motion = createNativeMotion(
      rig,
      [...person.motion.animations, ...person.turns.animations],
      grounding,
      { floorY: VISITOR_ROUTE.floorY },
    );
    const shadow = new THREE.Mesh(shadowGeometry, contactMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = .009;
    holder.add(shadow);
    const footShadows = ['LeftFoot', 'RightFoot'].map(name => {
      const mesh = new THREE.Mesh(footGeometry, contactMaterial.clone());
      mesh.rotation.x = -Math.PI / 2;
      holder.add(mesh);
      return { bone: motion.bones[name], mesh };
    });
    group.add(holder);
    return { ...person, holder, grounding, rig, motion, footShadows,
      previous: null, distance: 0, phase: 0, pose: null, height: 0 };
  });

  function poseActor(actor, delta) {
    actor.phase = modulo(elapsed * VISITOR_ROUTE.speed / routeLength + actor.offset, 1);
    const point = route.getPointAt(actor.phase);
    const tangent = route.getTangentAt(actor.phase);
    actor.holder.position.set(point.x, VISITOR_ROUTE.floorY, point.y);
    actor.holder.rotation.y = Math.atan2(tangent.x, tangent.y) - actor.motion.forwardYaw;
    if (actor.previous) {
      actor.distance += Math.hypot(point.x - actor.previous.x, point.y - actor.previous.y);
    }
    actor.previous = point;
    actor.pose = actor.motion.evaluate({
      walkDistance: actor.distance + actor.gaitPhase * actor.motion.stride,
      walkWeight: 1,
      idleTime: elapsed,
      delta,
    });
    for (const { bone, mesh } of actor.footShadows) {
      bone.getWorldPosition(footPosition);
      actor.holder.worldToLocal(footPosition);
      mesh.position.set(footPosition.x, .011, footPosition.z + .045);
      mesh.material.opacity = .85 * (1 - THREE.MathUtils.smoothstep(footPosition.y, .095, .24));
    }
  }

  for (const actor of actors) {
    poseActor(actor, 0);
    const bounds = new THREE.Box3().setFromObject(actor.rig);
    actor.height = bounds.max.y - bounds.min.y;
  }
  scene.add(group);

  function snapshot() {
    return {
      ready: !disposed,
      elapsed,
      route: { ...VISITOR_ROUTE, length: routeLength, period: routeLength / VISITOR_ROUTE.speed,
        minimumPairDistance: 2 * VISITOR_ROUTE.radius },
      nativeModule: '/review/exhibition-25-years/visitor-motion-v43.js?v=43',
      actors: actors.map(actor => ({
        id: actor.id,
        position: actor.holder.position.toArray(),
        yaw: actor.holder.rotation.y,
        height: actor.height,
        scale: actor.rig.scale.toArray(),
        speed: VISITOR_ROUTE.speed,
        sourceSpeed: actor.motion.sourceSpeed,
        stride: actor.motion.stride,
        forwardYaw: actor.motion.forwardYaw,
        distance: actor.distance,
        routePhase: actor.phase,
        lap: Math.floor(elapsed * VISITOR_ROUTE.speed / routeLength + actor.offset),
        source: { ...actor.urls },
        nativePose: actor.pose,
        feet: ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'].flatMap(name => {
          const bone = actor.motion.bones[name];
          return bone ? [{ name, position: bone.getWorldPosition(new THREE.Vector3()).toArray() }] : [];
        }),
      })),
    };
  }

  return {
    ready: true,
    update(delta) {
      if (disposed || !Number.isFinite(delta) || delta < 0) return;
      elapsed += delta;
      for (const actor of actors) poseActor(actor, delta);
    },
    snapshot,
    focusTarget(index) {
      return actors[index % actors.length].holder.position.clone().add(new THREE.Vector3(0, 1, 0));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.remove(group);
      const geometries = new Set([shadowGeometry, footGeometry]);
      const materials = new Set([contactMaterial]);
      const textures = new Set([contactMaterial.map]);
      group.traverse(object => {
        if (!object.isMesh) return;
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          materials.add(material);
          for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
        }
      });
      for (const actor of actors) actor.motion.mixer.uncacheRoot(actor.rig);
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
    },
  };
}
