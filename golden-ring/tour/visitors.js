import * as THREE from 'three';
import { clone as cloneSkeleton } from '../interactives/vendor/three-0.180/SkeletonUtils.js';
import { createVisitorRoutes } from './visitor-routes.js?v=2';
import { focusViewAtDistance } from './visitor-camera.js?v=1';
import { createShoeGrounding } from './visitor-grounding.js?v=1';
import { createNativeMotion } from '/review/exhibition-25-years/visitor-motion-v43.js?v=43';

// Reuse the exhibition's original meshes and native clips without retargeting,
// joint edits, IK, or changes to the exhibition runtime.
const ASSET_ROOT = '/review/exhibition-25-years/assets/models/visitors/';
const PEOPLE = [
  { id: 'emma', routeId: 'west', sourceId: 'emma', model: 'walking-woman', offset: 0, gaitPhase: .35 },
  { id: 'ethan', routeId: 'east', sourceId: 'ethan', model: 'walking-man', offset: .25, gaitPhase: .80 },
  { id: 'emma-2', routeId: 'northwest', sourceId: 'emma', model: 'walking-woman', offset: .5, gaitPhase: .10 },
  { id: 'ethan-2', routeId: 'northeast', sourceId: 'ethan', model: 'walking-man', offset: .75, gaitPhase: .60 },
];
const modulo = THREE.MathUtils.euclideanModulo;

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
  // Load the two original appearances and their motion bundles only once.
  // Keep their source skeletons pristine: clone every rig before any mixer runs.
  const sourcePeople = [...new Map(PEOPLE.map(person => [person.sourceId, person])).values()];
  const sources = new Map(await Promise.all(sourcePeople.map(async person => {
    const urls = {
      model: ASSET_ROOT + person.model + '.glb?v=43',
      motion: ASSET_ROOT + 'motions/' + person.sourceId + '-native-motions.glb?v=43',
      turns: ASSET_ROOT + 'motions/' + person.sourceId + '-native-turns.glb?v=43',
    };
    const [model, motion, turns] = await Promise.all([
      loader.loadAsync(urls.model),
      loader.loadAsync(urls.motion),
      loader.loadAsync(urls.turns),
    ]);
    return [person.sourceId, { urls, model, motion, turns }];
  })));
  const prepared = PEOPLE.map(person => {
    const source = sources.get(person.sourceId);
    return {
      ...person,
      urls: { ...source.urls },
      rig: cloneSkeleton(source.model.scene),
      animations: [...source.motion.animations, ...source.turns.animations],
    };
  });

  const group = new THREE.Group();
  group.name = 'GoldenRingVisitors';
  const routes = createVisitorRoutes();
  const routesById = new Map(routes.map(route => [route.id, route]));
  const contactMaterial = makeContactMaterial();
  const shadowGeometry = new THREE.PlaneGeometry(.76, .56);
  const footGeometry = new THREE.PlaneGeometry(.18, .31);
  const footPosition = new THREE.Vector3();
  const shadowPosition = new THREE.Vector3();
  let elapsed = 0;
  let disposed = false;
  const actors = prepared.map(person => {
    const route = routesById.get(person.routeId);
    if (!route) throw new Error('Missing visitor route: ' + person.routeId);
    if (route.sourceAvatar && route.sourceAvatar !== person.sourceId) {
      throw new Error('Visitor body does not match the verified route: ' + person.routeId);
    }
    const holder = new THREE.Group();
    holder.name = 'Visitor_' + person.id;
    const grounding = new THREE.Group();
    grounding.name = 'NativeGrounding';
    const rig = person.rig;
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
      person.animations,
      grounding,
      { floorY: route.floorY },
    );
    const terrain = route.requiresTerrainGrounding
      ? createShoeGrounding(rig, motion.bones, route.groundAt) : null;
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
    return { ...person, route, holder, grounding, rig, motion, terrain, shadow, footShadows,
      previous: null, distance: 0, phase: 0, pose: null, height: 0, groundCorrection: null };
  });

  function poseActor(actor, delta) {
    const route = actor.route;
    actor.phase = modulo(elapsed * route.speed / route.length + actor.offset, 1);
    const point = route.pointAtDistance(actor.phase * route.length);
    const tangent = route.tangentAtDistance(actor.phase * route.length);
    actor.holder.position.copy(point);
    actor.room = route.roomAt(actor.phase);
    actor.holder.rotation.y = Math.atan2(tangent.x, tangent.z) - actor.motion.forwardYaw;
    if (actor.previous) {
      actor.distance += Math.hypot(point.x - actor.previous.x, point.z - actor.previous.z);
    }
    actor.previous = point;
    actor.pose = actor.motion.evaluate({
      walkDistance: actor.distance + actor.gaitPhase * actor.motion.stride,
      walkWeight: 1,
      idleTime: elapsed,
      delta,
    });
    actor.groundCorrection = actor.terrain ? actor.terrain.correct(actor.holder) : {
      requestedLift: 0, appliedLift: 0, maxLift: 0, vertexCount: 0,
      capExceeded: false, minimumClearance: actor.pose.correctedShoeMinimumY - route.floorY,
    };
    actor.shadow.position.y = route.groundAt(point.x, point.z) - actor.holder.position.y + .009;
    for (const { bone, mesh } of actor.footShadows) {
      bone.getWorldPosition(footPosition);
      const floor = route.groundAt(footPosition.x, footPosition.z);
      const footHeight = footPosition.y - floor;
      actor.holder.worldToLocal(footPosition);
      // Sample the actual shadow centre after its small local forward offset.
      shadowPosition.set(footPosition.x, 0, footPosition.z + .045);
      actor.holder.localToWorld(shadowPosition);
      const shadowFloor = route.groundAt(shadowPosition.x, shadowPosition.z);
      mesh.position.set(footPosition.x, shadowFloor - actor.holder.position.y + .011, footPosition.z + .045);
      mesh.material.opacity = .85 * (1 - THREE.MathUtils.smoothstep(footHeight, .095, .24));
    }
  }

  for (const actor of actors) {
    poseActor(actor, 0);
    const bounds = new THREE.Box3().setFromObject(actor.rig);
    actor.height = bounds.max.y - bounds.min.y;
  }
  scene.add(group);

  function snapshot() {
    let minimumPairDistance = Infinity;
    for (let i = 0; i < actors.length; i++) {
      for (let j = i + 1; j < actors.length; j++) {
        minimumPairDistance = Math.min(minimumPairDistance,
          actors[i].holder.position.distanceTo(actors[j].holder.position));
      }
    }
    return {
      ready: !disposed,
      count: actors.length,
      elapsed,
      minimumPairDistance,
      version: 2,
      routes: routes.map(route => ({
        id: route.id, title: route.title, floorY: route.floorY, speed: route.speed,
        length: route.length, period: route.length / route.speed,
        rooms: [...route.rooms], roomLabels: { ...route.roomLabels },
        waypoints: route.waypoints.map(row => ({ ...row, point: [...row.point] })),
        clearance: { ...route.clearance },
      })),
      nativeModule: '/review/exhibition-25-years/visitor-motion-v43.js?v=43',
      actors: actors.map(actor => ({
        id: actor.id,
        sourceId: actor.sourceId,
        model: actor.model,
        routeId: actor.route.id,
        roomId: actor.room.id,
        room: actor.room.title,
        floorY: actor.route.floorY,
        surfaceFloorY: actor.route.groundAt(actor.holder.position.x, actor.holder.position.z),
        groundCorrection: { ...actor.groundCorrection },
        worldShoeMinimumY: actor.pose.correctedShoeMinimumY + actor.groundCorrection.appliedLift,
        minShoeClearance: actor.groundCorrection.minimumClearance,
        position: actor.holder.position.toArray(),
        yaw: actor.holder.rotation.y,
        height: actor.height,
        scale: actor.rig.scale.toArray(),
        speed: actor.route.speed,
        sourceSpeed: actor.motion.sourceSpeed,
        stride: actor.motion.stride,
        forwardYaw: actor.motion.forwardYaw,
        distance: actor.distance,
        routePhase: actor.phase,
        lap: Math.floor(elapsed * actor.route.speed / actor.route.length + actor.offset),
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
    count: actors.length,
    update(delta) {
      if (disposed || !Number.isFinite(delta) || delta < 0) return;
      elapsed += delta;
      for (const actor of actors) poseActor(actor, delta);
    },
    snapshot,
    focusView(index) {
      const actor = actors[index % actors.length];
      const view = focusViewAtDistance(actor.phase * actor.route.length, actor.route, actor.route.camera);
      return {
        position: new THREE.Vector3(...view.position),
        target: actor.holder.position.clone().add(new THREE.Vector3(0, 1, 0)),
        room: actor.room.title,
        fov: view.fov,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.remove(group);
      const geometries = new Set([shadowGeometry, footGeometry]);
      const materials = new Set([contactMaterial]);
      const textures = new Set([contactMaterial.map]);
      const skeletons = new Set();
      group.traverse(object => {
        if (!object.isMesh) return;
        if (object.isSkinnedMesh) skeletons.add(object.skeleton);
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          materials.add(material);
          for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
        }
      });
      for (const actor of actors) {
        actor.motion.mixer.stopAllAction();
        actor.motion.mixer.uncacheRoot(actor.rig);
      }
      // Geometry, materials and textures are shared by the appearance clones.
      // Dispose them once for this whole visitor group; skeletons are independent.
      for (const skeleton of skeletons) skeleton.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
    },
  };
}
