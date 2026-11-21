import * as THREE from "three";

// Each placement owns its near mesh. Copies of the overview mesh share their GPU resources.
export function createExhibitLoader(loader, prepare, changed) {
  const entries = [];
  const previews = new Map();
  const frustum = new THREE.Frustum();
  const matrix = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  const screen = new THREE.Vector3();
  let loading = 0;
  let nextCheck = 0;

  function fetchModel(folder, id) {
    return loader.loadAsync(`./assets/models/${folder}/${id}.glb?v=30`).then(({scene}) => {
      scene.traverse(object => {
        if (object.isMesh && !object.geometry.hasAttribute("normal")) object.geometry.computeVertexNormals();
      });
      prepare(scene);
      return scene;
    });
  }

  function fit(model, entry) {
    const [width, depth, height] = entry.dims;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const scale = Math.min(width/size.x, depth/size.z, height/size.y);
    const turned = Math.min(width/size.z, depth/size.x, height/size.y);
    entry.turn ??= turned > scale * 1.03;
    const frame = new THREE.Group();
    frame.add(model);
    frame.rotation.y = entry.turn ? Math.PI/2 : 0;
    frame.scale.setScalar(entry.turn ? turned : scale);
    box.setFromObject(frame);
    const center = box.getCenter(new THREE.Vector3());
    frame.position.set(-center.x, -box.min.y, -center.z);
    return frame;
  }

  function show(entry, model, level) {
    if (entry.current) {
      entry.anchor.remove(entry.current);
      if (!entry.anchor.userData.lod) release(entry.current);
    }
    entry.current = model;
    entry.anchor.add(model);
    entry.anchor.userData.lod = level;
    changed(entry.anchor, level);
  }

  function release(model) {
    const resources = new Set();
    model.traverse(obj => {
      if (!obj.isMesh) return;
      resources.add(obj.geometry);
      for (const mat of [].concat(obj.material)) {
        resources.add(mat);
        for (const value of Object.values(mat)) if (value?.isTexture) resources.add(value);
      }
    });
    for (const item of resources) {
      item.dispose();
      if (item.isTexture) item.source.data?.close?.();
    }
  }

  function register(anchor, id, dims, placeholder = null) {
    const entry = {anchor, id, dims, current:placeholder, wanted:false, retry:0};
    anchor.userData.assetId = id;
    entries.push(entry);
  }

  function overview(entry) {
    entry.pending = true;
    loading++;
    let promise = previews.get(entry.id);
    if (!promise) {
      promise = fetchModel("hitem", entry.id);
      previews.set(entry.id, promise);
      promise.catch(() => previews.delete(entry.id));
    }
    promise.then(scene => {
      entry.preview = fit(scene.clone(true),entry);
      show(entry, entry.preview, "overview");
    }).catch(() => { entry.retry = performance.now() + 15000; })
      .finally(() => { entry.pending = false; loading--; });
  }

  function upgrade(entry) {
    entry.pending = true;
    loading++;
    fetchModel("hitem-detail", entry.id).then(scene => {
      if (!entry.wanted) { release(scene); return; }
      entry.detail = fit(scene,entry);
      show(entry, entry.detail,"detail");
    }).catch(() => { entry.retry = performance.now() + 15000; })
      .finally(() => { entry.pending = false; loading--; });
  }

  function update(camera, now, selectedId) {
    if (now < nextCheck) return;
    nextCheck = now + 200;
    camera.updateMatrixWorld();
    frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    const nearby = [];
    for (const entry of entries) {
      entry.anchor.getWorldPosition(sphere.center);
      sphere.center.y += entry.dims[2] * 0.4;
      sphere.radius = Math.hypot(...entry.dims) / 2;
      const visible = frustum.intersectsSphere(sphere);
      const distance = Math.max(0,camera.position.distanceTo(sphere.center)-sphere.radius);
      screen.copy(sphere.center).project(camera);
      entry.rank = distance + (visible ? Math.min(3,Math.hypot(screen.x, screen.y)) : 100);
      if (visible && entry.anchor.userData.modelId === selectedId) entry.rank -= 3;
      if (visible && distance < (entry.wanted ? 5 : 4.2)) nearby.push(entry);
    }
    nearby.sort((a,b) => a.rank-b.rank);
    const wanted = new Set(nearby.slice(0, window.innerWidth <= 740 ? 2 : 3));
    for (const entry of entries) {
      entry.wanted = wanted.has(entry);
      if (entry.detail && !entry.wanted) {
        show(entry,entry.preview,"overview");
        release(entry.detail);
        entry.detail = null;
      }
    }
    for (const entry of [...entries].sort((a,b) => a.rank-b.rank)) {
      if (loading >= 3) break;
      if (entry.pending || now < entry.retry) continue;
      if (!entry.preview) overview(entry);
      else if (entry.wanted && !entry.detail) upgrade(entry);
    }
  }
  return {register,update};
}
