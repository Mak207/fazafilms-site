/**
 * Observer/clock adapter around the unchanged production v42 visitors-v40.js.
 * No retargeting, pose edits, replacement navigation or additional IK is applied.
 * The runtime's own Walk/Observe, foot IK, grounding, gaze and gesture code run.
 * All distances are metres.  Use a separate identity scene and GLTFLoader.
 */

export const V42_RUNTIME_SHA256 = Object.freeze([
  '10e7a2e5a60461d377669733d8315b367e77b3ae24747cafd3478fe6c2b6968d', // LF
  'db1673c0cf29181dd33d31ff9041c234aee16f26da9b1e28a0edffa8058435fa', // CRLF checkout
]);

const MODEL_NAMES = ['woman', 'man'];
const BONE_NAMES = ['Hips', 'Spine', 'Head', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];
const plainVector = v => ({ x: v.x, y: v.y, z: v.z });
const plainQuaternion = q => ({ x: q.x, y: q.y, z: q.z, w: q.w });
const copyJSON = value => JSON.parse(JSON.stringify(value));
const namedBone = name => name.replace(/^mixamorig:?/, '');
const length3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

async function fingerprint(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Frozen v42 runtime: HTTP ${response.status} at ${url}`);
  const hash = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
  return [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2, '0')).join('');
}

function makeContactMaterial(THREE) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(0,0,0,.46)');
  gradient.addColorStop(.45, 'rgba(0,0,0,.22)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const map = new THREE.CanvasTexture(canvas);
  return new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, opacity: .42 });
}

function captureSoleSamples(THREE, rig) {
  // Same bind-pose selection/grid as frozen outsoleSamples(); side is an
  // additional read-only label, using skin weights where possible.
  rig.updateMatrixWorld(true);
  const point = new THREE.Vector3();
  const samples = [];
  const getters = ['getX', 'getY', 'getZ', 'getW'];
  rig.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    const cells = new Map();
    const position = mesh.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
      if (point.y > .035) continue;
      const key = Math.floor(point.x / .04) + ',' + Math.floor(point.z / .045);
      if (!cells.has(key) || point.y < cells.get(key).y) cells.set(key, { i, y: point.y, bindWorld: plainVector(point) });
    }
    const indices = mesh.geometry.attributes.skinIndex;
    const weights = mesh.geometry.attributes.skinWeight;
    for (const cell of cells.values()) {
      const influences = { Left: 0, Right: 0 };
      if (indices && weights) for (const get of getters) {
        const bone = mesh.skeleton.bones[indices[get](cell.i)];
        const side = bone?.name.match(/(Left|Right)(?:Foot|ToeBase)$/)?.[1];
        if (side) influences[side] += weights[get](cell.i);
      }
      const side = influences.Left > influences.Right ? 'Left' : influences.Right > influences.Left ? 'Right' : null;
      samples.push({ mesh, index: cell.i, side, bindWorld: cell.bindWorld });
    }
  });
  return samples;
}

function emptyStats() {
  return { samples: 0, maxFootLateralM: 0, minSoleYMetres: null, maxSoleYMetres: null,
    maxFootHorizontalSpeedMps: 0, estimatedContactIntervals: 0, maxEstimatedContactFootSpeedMps: 0 };
}

/**
 * @returns {Promise<{step:Function,advance:Function,snapshot:Function,summary:Function,
 * samples:Function,dispose:Function,navigation:object,fixedStep:number}>}
 * The page URL must already contain a nonzero visitorSeed before this is called.
 * An empty loader.path is resolved against assetBaseURL. If loader.setPath('../')
 * was used by a standalone page, its explicit path is respected unchanged.
 */
export async function createV42Baseline({
  THREE, scene, loader, contactMaterial = null,
  runtimeURL = new URL('../visitors-v40.js', import.meta.url),
  assetBaseURL = new URL('../', import.meta.url),
  fixedStep = 1 / 60, seed = 424242, maxHistory = 20000,
  onStatus = () => {},
} = {}) {
  if (!THREE || !scene || !loader?.load) throw new TypeError('THREE, scene and GLTFLoader are required.');
  if (!(fixedStep > 0 && fixedStep <= .25)) throw new RangeError('fixedStep must be in (0, .25], matching v42 dt clamp.');
  if (!Number.isInteger(seed) || seed < 1 || seed > 0xffffffff) throw new RangeError('seed must be a nonzero uint32.');
  if (!Number.isInteger(maxHistory) || maxHistory < 0) throw new RangeError('maxHistory must be a nonnegative integer.');
  const urlSeed = Number(new URLSearchParams(location.search).get('visitorSeed')) >>> 0;
  if (!urlSeed || urlSeed !== seed) throw new Error(`Set ?visitorSeed=${seed} before importing the frozen runtime.`);
  if (MODEL_NAMES.some(model => scene.getObjectByName('visitor-' + model))) throw new Error('This scene already contains v42 visitor holders.');
  scene.updateMatrixWorld(true);
  const sceneScale = scene.getWorldScale(new THREE.Vector3());
  const scenePosition = scene.getWorldPosition(new THREE.Vector3());
  const sceneRotation = scene.getWorldQuaternion(new THREE.Quaternion());
  if (sceneScale.distanceTo(new THREE.Vector3(1, 1, 1)) > 1e-8 || scenePosition.length() > 1e-8 ||
      Math.abs(sceneRotation.x) + Math.abs(sceneRotation.y) + Math.abs(sceneRotation.z) > 1e-8) {
    throw new Error('The baseline scene must have identity world transform; measurements are in physical metres.');
  }

  const runtime = new URL(runtimeURL, document.baseURI);
  const assetBase = new URL(assetBaseURL, document.baseURI);
  onStatus('Checking the frozen v42 runtime');
  const runtimeSha256 = await fingerprint(runtime.href);
  if (!V42_RUNTIME_SHA256.includes(runtimeSha256)) throw new Error(`Frozen v42 SHA256 mismatch: ${runtimeSha256}`);
  // The actual code still reads visitorSeed from location.search, not this URL.
  // A distinct module key prevents reuse of another seed's module instance.
  runtime.searchParams.set('motionLabBaselineSeed', String(seed));
  const frozen = await import(runtime.href);
  if (typeof frozen.addWalkers !== 'function' || typeof frozen.auditVisitorNavigation !== 'function') {
    throw new Error('The frozen module does not expose the expected v42 API.');
  }
  const materialOwned = !contactMaterial;
  const contact = contactMaterial || makeContactMaterial(THREE);
  const records = new Map();
  let frame = 0, disposed = false, previous = null;
  const history = [];
  const aggregates = {};
  let resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const wrapper = {
    load(request, onLoad, onProgress, onError) {
      const model = request.match(/walking-(woman|man)\.glb(?:\?|$)/)?.[1];
      if (!model) throw new Error(`Unexpected asset requested by v42: ${request}`);
      const delegatedURL = loader.path ? request : new URL(request, assetBase).href;
      const resolvedURL = loader.path ? new URL(loader.path + request, document.baseURI).href : delegatedURL;
      onStatus(`Loading v42 ${model}`);
      return loader.load(delegatedURL, gltf => {
        try {
          for (const name of ['Walk', 'Observe']) if (!gltf.animations.some(clip => clip.name === name)) {
            throw new Error(`${model}: missing v42 clip ${name}`);
          }
          const bones = {};
          gltf.scene.traverse(node => { if (node.isBone) bones[namedBone(node.name)] = node; });
          for (const name of BONE_NAMES) if (!bones[name]) throw new Error(`${model}: missing bone ${name}`);
          const soleSamples = captureSoleSamples(THREE, gltf.scene);
          onLoad(gltf); // The real frozen code creates actor, mixer, IK and holder.
          const holder = scene.children.find(child => child.name === 'visitor-' + model && child.children.includes(gltf.scene));
          if (!holder) throw new Error(`${model}: frozen addWalkers did not add its holder`);
          records.set(model, { model, holder, rig: gltf.scene, parser: gltf.parser, bones, soleSamples, resolvedURL,
            clips: gltf.animations.map(clip => ({ name: clip.name, durationSeconds: clip.duration, tracks: clip.tracks.length })) });
          if (records.size === MODEL_NAMES.length) resolveReady();
        } catch (error) { rejectReady(error); }
      }, onProgress, error => { onError?.(error); rejectReady(error); });
    },
  };
  const update = frozen.addWalkers(scene, wrapper, contact);
  await ready;
  // auditVisitorNavigation fills the module's private routeCache. Do not let
  // this observer pre-populate the live runtime's cache or alter A* tie choices.
  const navigationURL = new URL(runtime.href);
  navigationURL.searchParams.set('motionLabNavigationOnly', '1');
  const navigationModule = await import(navigationURL.href);
  const navigation = navigationModule.auditVisitorNavigation();
  const world = new THREE.Vector3(), local = new THREE.Vector3(), vertex = new THREE.Vector3();

  function readFrame({ allBones = false } = {}) {
    scene.updateMatrixWorld(true);
    const time = frame * fixedStep;
    const actors = MODEL_NAMES.map(model => {
      const record = records.get(model);
      const { holder, rig, bones } = record;
      const soleMin = { Left: Infinity, Right: Infinity, all: Infinity };
      const soleCount = { Left: 0, Right: 0, unknown: 0 };
      for (const sample of record.soleSamples) {
        sample.mesh.getVertexPosition(sample.index, vertex).applyMatrix4(sample.mesh.matrixWorld);
        soleMin.all = Math.min(soleMin.all, vertex.y);
        if (sample.side) { soleMin[sample.side] = Math.min(soleMin[sample.side], vertex.y); soleCount[sample.side]++; }
        else soleCount.unknown++;
      }
      const observed = {};
      for (const name of allBones ? Object.keys(bones) : BONE_NAMES) {
        bones[name].getWorldPosition(world);
        local.copy(world); holder.worldToLocal(local);
        observed[name] = { world: plainVector(world), actorLocal: plainVector(local) };
      }
      const old = previous?.actors.find(actor => actor.model === model);
      const dt = old && time > previous.timeSeconds ? time - previous.timeSeconds : 0;
      const feet = ['Left', 'Right'].map(side => {
        const foot = observed[side + 'Foot'];
        const previousFoot = old?.feet.find(value => value.side === side);
        const horizontalSpeed = dt ? Math.hypot(foot.world.x - previousFoot.world.x, foot.world.z - previousFoot.world.z) / dt : null;
        const soleY = Number.isFinite(soleMin[side]) ? soleMin[side] : null;
        const nearGround = soleY !== null && soleY >= -.02 && soleY <= .02;
        const continuousContactEstimate = Boolean(dt && nearGround && previousFoot?.nearGroundEstimate);
        return { side, ...foot, toeWorld: observed[side + 'ToeBase'].world,
          thighLengthM: length3(observed[side + 'UpLeg'].world, observed[side + 'Leg'].world),
          shinLengthM: length3(observed[side + 'Leg'].world, foot.world),
          soleMinYMetres: soleY, soleSampleCount: soleCount[side],
          horizontalSpeedMps: horizontalSpeed, nearGroundEstimate: nearGround,
          estimatedContactHorizontalSpeedMps: continuousContactEstimate ? horizontalSpeed : null };
      });
      holder.getWorldPosition(world);
      const holderWorld = plainVector(world);
      return { model, label: model === 'woman' ? 'Emma · runtime v42' : 'Ethan · runtime v42',
        phase: holder.userData.visitorState, station: holder.userData.visitorStation,
        demoKind: holder.userData.demoKind, demoTimeSeconds: holder.userData.demoTime,
        demoCount: holder.userData.demoCount, holderWorld,
        holderQuaternion: plainQuaternion(holder.getWorldQuaternion(new THREE.Quaternion())),
        rigLocalPosition: plainVector(rig.position),
        rootHorizontalSpeedMps: dt ? Math.hypot(holderWorld.x - old.holderWorld.x, holderWorld.z - old.holderWorld.z) / dt : null,
        lowestSoleYMetres: Number.isFinite(soleMin.all) ? soleMin.all : null,
        unclassifiedSoleSamples: soleCount.unknown, bones: observed, feet };
    });
    return { schema: 'v42-baseline-snapshot/1', units: { distance: 'metres', time: 'seconds', speed: 'metres/second' },
      frame, timeSeconds: time, fixedStepSeconds: fixedStep, seed, actors };
  }

  function recordFrame() {
    const current = readFrame();
    for (const actor of current.actors) for (const phase of ['all', actor.phase]) {
      const key = actor.model + ':' + phase;
      const stats = aggregates[key] ||= emptyStats();
      stats.samples++;
      for (const foot of actor.feet) {
        stats.maxFootLateralM = Math.max(stats.maxFootLateralM, Math.abs(foot.actorLocal.x));
        if (foot.soleMinYMetres !== null) {
          stats.minSoleYMetres = stats.minSoleYMetres === null ? foot.soleMinYMetres : Math.min(stats.minSoleYMetres, foot.soleMinYMetres);
          stats.maxSoleYMetres = stats.maxSoleYMetres === null ? foot.soleMinYMetres : Math.max(stats.maxSoleYMetres, foot.soleMinYMetres);
        }
        stats.maxFootHorizontalSpeedMps = Math.max(stats.maxFootHorizontalSpeedMps, foot.horizontalSpeedMps || 0);
        if (foot.estimatedContactHorizontalSpeedMps !== null) {
          stats.estimatedContactIntervals++;
          stats.maxEstimatedContactFootSpeedMps = Math.max(stats.maxEstimatedContactFootSpeedMps, foot.estimatedContactHorizontalSpeedMps);
        }
      }
    }
    previous = current;
    if (maxHistory) { history.push(current); if (history.length > maxHistory) history.shift(); }
    return current;
  }

  function step(count = 1) {
    if (disposed) throw new Error('This baseline has been disposed.');
    if (!Number.isInteger(count) || count < 0 || count > 100000) throw new RangeError('step count must be an integer from 0 to 100000.');
    for (let i = 0; i < count; i++) { frame++; update(frame * fixedStep); recordFrame(); }
    return snapshot();
  }

  function snapshot(options = {}) {
    if (disposed) throw new Error('This baseline has been disposed.');
    if (options.allBones) {
      const value = readFrame(options);
      // Re-reading at the same time must retain velocities from the last step.
      for (const actor of value.actors) {
        const recorded = previous.actors.find(row => row.model === actor.model);
        actor.rootHorizontalSpeedMps = recorded.rootHorizontalSpeedMps;
        for (const foot of actor.feet) {
          const old = recorded.feet.find(row => row.side === foot.side);
          foot.horizontalSpeedMps = old.horizontalSpeedMps;
          foot.estimatedContactHorizontalSpeedMps = old.estimatedContactHorizontalSpeedMps;
        }
      }
      return value;
    }
    return copyJSON(previous);
  }

  function summary() {
    return { schema: 'v42-baseline-summary/1', runtime: 'production v42, unchanged visitors-v40.js',
      runtimeURL: runtime.href, runtimeSha256, threeRevision: THREE.REVISION, seed,
      frames: frame, timeSeconds: frame * fixedStep, fixedStepSeconds: fixedStep,
      assets: MODEL_NAMES.map(model => ({ model, url: records.get(model).resolvedURL, clips: records.get(model).clips })),
      byActorAndPhase: copyJSON(aggregates),
      measurementNotes: [
        'All positions and distances are metres; the scene has identity transform.',
        'actorLocal removes the actual visitor holder translation and yaw, not the foot bone transform.',
        'Phases are the frozen holder.userData.visitorState; internal mixer weights are not exposed.',
        'Foot slip is an estimate: foot-bone horizontal speed over consecutive sole samples within +/-0.02 m of the floor.',
        'Sole samples use the frozen bind-pose grid; they are not every deformed mesh vertex.',
        'Navigation, Walk/Observe blending, foot IK, grounding and gaze are the original v42 code.',
        'This adapter never sets pose, animation weight, actor scale or navigation state.',
      ],
      navigation: copyJSON(navigation), snapshot: snapshot() };
  }

  function soleDetails(model = 'woman') {
    if (disposed) throw new Error('This baseline has been disposed.');
    const record = records.get(model);
    if (!record) throw new Error('soleDetails requires woman or man');
    scene.updateMatrixWorld(true);
    const getters = ['getX', 'getY', 'getZ', 'getW'];
    const samples = record.soleSamples.map(sample => {
      const mesh = sample.mesh, position = mesh.geometry.attributes.position;
      mesh.getVertexPosition(sample.index, vertex).applyMatrix4(mesh.matrixWorld);
      local.copy(vertex); record.holder.worldToLocal(local);
      const skinIndex = mesh.geometry.attributes.skinIndex, skinWeight = mesh.geometry.attributes.skinWeight;
      const influences = skinIndex && skinWeight ? getters.map(get => {
        const jointIndex = skinIndex[get](sample.index), bone = mesh.skeleton.bones[jointIndex];
        return { jointIndex, bone: bone?.name ?? null, weight: skinWeight[get](sample.index) };
      }) : [];
      const association = record.parser?.associations?.get(mesh);
      return { meshName: mesh.name, gltfAssociation: association ? { ...association } : null,
        positionAccessorVertexIndex: sample.index, positionAccessorVertexCount: position.count,
        side: sample.side, bindWorldMetres: { ...sample.bindWorld }, posedWorldMetres: plainVector(vertex),
        posedActorLocalMetres: plainVector(local),
        rawPositionAttribute: [position.getX(sample.index), position.getY(sample.index), position.getZ(sample.index)],
        skinInfluences: influences };
    }).sort((a, b) => a.posedWorldMetres.y - b.posedWorldMetres.y);
    return { model, frame, timeSeconds: frame * fixedStep, assetURL: record.resolvedURL,
      indexMeaning: 'Vertex index in the current GLB mesh POSITION accessor after lossless Meshopt decode; not an upstream Avatar Studio vertex index.',
      sampleSelection: 'Original frozen v42 bind-pose outsole grid: world Y <= 0.035 m, lowest vertex in each 0.04 x 0.045 m XZ cell.',
      samples };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const record of records.values()) scene.remove(record.holder);
    if (materialOwned) { contact.map?.dispose(); contact.dispose(); }
    history.length = 0;
  }

  recordFrame(); // addWalkers already ran updateActor(actor, 0), exactly as frozen.
  onStatus('v42 baseline ready');
  return { step, advance(seconds) {
    const count = Math.round(seconds / fixedStep);
    if (!Number.isFinite(seconds) || seconds < 0 || Math.abs(seconds - count * fixedStep) > 1e-8) {
      throw new RangeError('advance seconds must be a nonnegative whole number of fixed steps.');
    }
    return step(count);
  }, snapshot, summary, soleDetails, samples({ sinceFrame = 0 } = {}) {
    return copyJSON(history.filter(sample => sample.frame >= sinceFrame));
  }, dispose, navigation: copyJSON(navigation), fixedStep };
}

/** Add diagnostic floor/path context only. It does not collide or affect v42. */
export function addV42NavigationGuide({ THREE, scene, navigation }) {
  const group = new THREE.Group();
  group.name = 'v42-diagnostic-navigation-guide';
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 19), new THREE.MeshStandardMaterial({ color: 0xecf1f7, roughness: .94 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.005; floor.receiveShadow = true; group.add(floor);
  const grid = new THREE.GridHelper(18, 18, 0xc8d2df, 0xdce3ec); grid.position.y = -.003; group.add(grid);
  for (const route of navigation.routes) {
    const vertices = route.points.map(([x, z]) => new THREE.Vector3(x, .003, z));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(vertices), new THREE.LineBasicMaterial({ color: 0x91afcb, transparent: true, opacity: .4 }));
    group.add(line);
  }
  // Actual unexpanded plinth footprints copied from frozen v42 lines 19–24.
  const footprints = [[-1.22,1.22,-1.56,.86],[-4.28,-2.82,1.14,3.96],[2.85,4.25,1.07,4.03],[-4.62,-2.08,-4.37,-2.73],[2.08,4.62,-4.37,-2.73],[-1.92,1.92,4.34,6.62]];
  for (const [minX,maxX,minZ,maxZ] of footprints) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(maxX-minX,.12,maxZ-minZ),new THREE.MeshStandardMaterial({color:0xd5deea,roughness:.9}));
    box.position.set((minX+maxX)/2,.06,(minZ+maxZ)/2);group.add(box);
  }
  const metre = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1,.015,-7),new THREE.Vector3(0,.015,-7)]),new THREE.LineBasicMaterial({color:0x315f9b}));
  group.add(metre);scene.add(group);return group;
}
