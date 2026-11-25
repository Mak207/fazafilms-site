import * as THREE from 'three';

const hasParent = (node, ancestor) => { for (let n = node; n; n = n.parent) if (n === ancestor) return true; return false; };
const isVisible = object => { if (!object) return false; for (let n = object; n; n = n.parent) if (n.visible === false) return false; return true; };
const materialsOf = object => Array.isArray(object?.material) ? object.material : object?.material ? [object.material] : [];
const videoElement = source => source?.tagName?.toLowerCase() === 'video';

/** Live records come from the same equipment plan as editor, calculations and obstacles. */
export function createWalkInteractionAPI({ mediaRecords = new Map(), getMediaRecords = () => mediaRecords, getAllMediaRecords = getMediaRecords, zones, exhibits, actionLabels = {}, requestRender = () => {} }) {
  const videoRecords = new Map(), videoEntries = new Set(), mediaObjects = new Map(), actionRecords = new Map();
  const objectCache = new WeakMap(), originalActions = [], actionModules = new Map(), restoredMaterials = new Map();
  let disposed = false, records = new Map();
  function rootOf(record) {
    if (record.root) return record.root;
    let owner = null;
    for (let node = record.face || record.screen; node; node = node.parent) if (node.userData?.instanceId) owner = node;
    return owner || exhibits.getInstanceRoot(record.instanceId) || record.zone?.root;
  }
  function mapOf(object) { return materialsOf(object).find(m => m?.map)?.map || null; }
  function actionOf(object) {
    for (let node = object; node; node = node.parent) {
      const action = node.userData?.installationAction || node.userData?.zoneAction;
      if (action) return { action, installationId: node.userData?.installationId || '', node };
    }
    return null;
  }
  function surfaceOf(record) {
    if (!record.media) return null;
    if (record.face || record.screen) return record.face || record.screen;
    const owner = rootOf(record), cached = objectCache.get(record);
    if (cached && hasParent(cached, owner)) return cached;
    const texture = record.media.texture, canvas = record.media.canvas;
    let found = null;
    owner?.traverse(node => {
      if (found || !node.isMesh) return;
      if (materialsOf(node).some(m => m.map && (m.map === texture || canvas && m.map.image === canvas || [...videoEntries].some(entry => m.map === entry.texture && entry.roots.has(owner))))) found = node;
    });
    // Cloned interactive cabins expose media through their original face texture.
    if (!found) for (const target of record.pickTargets || []) target.traverse?.(node => {
      if (!found && node.isMesh && mapOf(node)) found = node;
    });
    if (found) objectCache.set(record, found);
    return found;
  }
  for (const [zoneId, zone] of zones) {
    (zone.module.pickTargets || zone.module.pickables || []).forEach((object, index) => {
      const spec = actionOf(object);
      if (!spec || spec.action.startsWith('rgo-')) return;
      actionModules.set(spec.installationId + '|' + spec.action, zone);
      originalActions.push({ id: `walk-action:${zoneId}:${spec.action}:${index}`, zone, object, action: spec.action, instanceId: zone.id });
    });
  }
  function restoreForeignVideoMaterials(record) {
    const owner = rootOf(record); if (!owner) return;
    // Three.js clones share materials. A new physical copy starts with the
    // programme canvas, not a local file assigned to its source instance.
    owner.traverse(node => {
      if (!node.isMesh) return;
      let changed = false;
      const replacements = materialsOf(node).map(material => {
        const foreign = [...videoEntries].find(entry => material?.map === entry.texture && !entry.roots.has(owner));
        if (!foreign) return material;
        const original = foreign.assignedToOriginal.get(material);
        let restored = restoredMaterials.get(material);
        if (!restored) { restored = material.clone(); restored.map = original?.map || [...foreign.originalTextures][0] || null; restored.needsUpdate = true; restoredMaterials.set(material, restored); }
        changed = true; return restored;
      });
      if (changed) node.material = Array.isArray(node.material) ? replacements : replacements[0];
    });
  }
  function applyVideoToRecord(entry, record, surface) {
    const owner = rootOf(record), texture = mapOf(surface);
    entry.roots.add(owner); entry.surfaces.add(surface);
    if (texture && texture !== entry.texture) entry.originalTextures.add(texture);
    owner?.traverse(node => {
      if (!node.isMesh || entry.boundObjects.has(node)) return;
      let changed = false;
      const previous = node.material;
      const originalMaterials = materialsOf(node).map(material => entry.assignedToOriginal.get(material) || material);
      const replacements = originalMaterials.map(material => {
        if (!material?.map || !entry.originalTextures.has(material.map) && node !== surface) return material;
        let replacement = entry.originalToAssigned.get(material);
        if (!replacement) {
          replacement = material.clone(); replacement.map = entry.texture; replacement.needsUpdate = true;
          entry.originalToAssigned.set(material, replacement); entry.assignedToOriginal.set(replacement, material);
        }
        changed = true; return replacement;
      });
      if (!changed) return;
      const original = Array.isArray(previous) ? originalMaterials : originalMaterials[0];
      const assigned = Array.isArray(previous) ? replacements : replacements[0];
      node.material = assigned; entry.materials.push({ node, original, assigned }); entry.boundObjects.add(node);
    });
  }
  function entryFor(record, surface) {
    const owner = rootOf(record), texture = mapOf(surface);
    return [...videoEntries].find(entry => entry.roots.has(owner) && (entry.surfaces.has(surface) || texture === entry.texture || entry.originalTextures.has(texture)));
  }
  function sync() {
    if (disposed) return;
    records = getMediaRecords() || new Map();
    const all = getAllMediaRecords() || records;
    mediaObjects.clear(); videoRecords.clear(); actionRecords.clear();
    const retained = new Set(), visibleVideos = new Set();
    for (const record of all.values()) {
      restoreForeignVideoMaterials(record);
      const object = surfaceOf(record); if (!object) continue;
      const entry = entryFor(record, object);
      if (entry) { retained.add(entry); applyVideoToRecord(entry, record, object); }
    }
    for (const record of records.values()) {
      restoreForeignVideoMaterials(record);
      const object = surfaceOf(record); if (!object) continue;
      mediaObjects.set(record.id, object);
      const entry = entryFor(record, object);
      if (entry) { retained.add(entry); applyVideoToRecord(entry, record, object); videoRecords.set(record.id, entry); if (isVisible(object)) visibleVideos.add(entry); }
    }
    for (const entry of [...videoEntries]) {
      if (!retained.has(entry)) releaseVideo(entry);
      else if (!visibleVideos.has(entry) && !entry.video.paused) { entry.operation++; entry.video.pause(); }
    }
    const faces = [...mediaObjects.values()], seen = new Set();
    function addAction(record, instanceId, ownerRecord = null) {
      if (!isVisible(record.object) || faces.some(face => hasParent(face, record.object) || hasParent(record.object, face))) return;
      const key = record.object.uuid + '|' + record.action; if (seen.has(key)) return; seen.add(key);
      const label = actionLabels[record.action] || (/chersonesus-case-/.test(record.action) ? 'Посмотреть историю предмета' : /chersonesus-info-/.test(record.action) ? 'Открыть историю' : 'Включить интерактив');
      actionRecords.set(record.id, { ...record, instanceId, label, name: ownerRecord?.displayName || ownerRecord?.name || record.zone.name });
    }
    for (const record of originalActions) {
      const ownerRecord = [...records.values()].find(item => hasParent(record.object, rootOf(item)));
      // A source removed from the plan is hidden by its existing assembly; keep independent host controls.
      addAction(record, ownerRecord?.instanceId || record.instanceId, ownerRecord);
    }
    for (const record of records.values()) for (const object of record.pickTargets || []) {
      const spec = actionOf(object); if (!spec || spec.action.startsWith('rgo-')) continue;
      const zone = actionModules.get(spec.installationId + '|' + spec.action); if (!zone) continue;
      let target = object;
      while (target.parent && hasParent(target.parent, rootOf(record)) && (target.parent.userData?.installationAction || target.parent.userData?.zoneAction) === spec.action) target = target.parent;
      addAction({ id: `walk-action:${record.id}:${spec.action}:${target.uuid}`, zone, object: target, action: spec.action }, record.instanceId, record);
    }
  }
  function geometry(object) {
    object.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(object, true);
    if (bounds.isEmpty()) return null;
    const position = bounds.getCenter(new THREE.Vector3());
    return position.toArray().every(Number.isFinite) ? { object, position, bounds } : null;
  }
  function mediaState(record) {
    const entry = videoRecords.get(record.id);
    if (entry) return { playing: !entry.video.paused && !entry.video.ended, kind: 'video', error: entry.error, ready: entry.video.readyState >= 2 };
    return record.media?.getState?.() || { playing: false, kind: 'canvas' };
  }
  function describeMedia(record) {
    if (!record || !isVisible(mediaObjects.get(record.id))) return null;
    const entry = videoRecords.get(record.id), object = mediaObjects.get(record.id), source = entry?.video || record.media?.canvas || record.media?.texture?.image || mapOf(object)?.image;
    if (!source) return null;
    const state = mediaState(record), kind = entry || videoElement(source) ? 'video' : 'canvas';
    return { id: record.id, kind, source, object, url: entry?.url || (videoElement(source) ? source.currentSrc || source.src : undefined),
      title: entry?.title || record.displayName || record.name, sourceKind: kind === 'video' ? 'video' : state.kind || 'original-generated-animation',
      label: kind === 'video' ? 'Смотреть ролик' : 'Смотреть экран', playing: state.playing,
      ready: kind === 'video' ? source.readyState >= 2 : true, error: entry?.error || null,
      canPlay: !entry?.error, width: source.videoWidth || source.width || record.width || 16, height: source.videoHeight || source.height || record.height || 9 };
  }
  function getWalkMedia(id) { sync(); return describeMedia(records.get(id)); }
  function getWalkTargets() {
    sync(); if (disposed) return [];
    const targets = [];
    for (const record of records.values()) {
      const object = mediaObjects.get(record.id);
      if (!isVisible(object) || !record.media) continue;
      const shape = geometry(object); if (!shape) continue;
      const state = mediaState(record), content = describeMedia(record), interactive = record.category === 'interactive' || /^interactive-/.test(state.kind || '');
      const title = record.displayName || record.name;
      const actions = [
        { id: 'toggle', label: state.playing ? 'Пауза' : interactive ? 'Включить интерактив' : 'Воспроизвести' },
        ...(content ? [{ id: 'view', label: content.label }] : []),
        ...(content?.kind === 'video' ? [] : [{ id: 'next', label: interactive ? 'Другой режим' : 'Следующая сцена' }]),
        { id: 'reset', label: 'Начать сначала' },
      ];
      targets.push({ id: record.id, name: title, title, actionLabel: actions[0].label, viewLabel: content?.label,
        kind: interactive ? 'interactive' : content?.kind === 'video' ? 'video' : 'screen', sourceKind: content?.sourceKind || state.kind,
        instanceId: rootOf(record)?.userData?.instanceId || record.instanceId, regionId: record.regionId, hallId: record.hallId, playing: state.playing, actions, ...shape });
    }
    for (const record of actionRecords.values()) {
      const shape = geometry(record.object); if (!shape) continue;
      targets.push({ id: record.id, name: record.name + ' · ' + record.label, title: record.name + ' · ' + record.label,
        actionLabel: record.label, kind: 'interactive', sourceKind: 'interactive-control', instanceId: record.instanceId,
        actions: [{ id: 'activate', label: record.label }], ...shape });
    }
    return targets;
  }
  async function activateWalkTarget(id, action = 'toggle') {
    sync(); if (disposed) return { ok: false, message: 'Просмотр закрыт.' };
    const control = actionRecords.get(id);
    if (control) {
      if (!isVisible(control.object) || !['activate', 'toggle'].includes(action)) return { ok: false };
      const module = control.zone.module;
      const ok = Boolean(module.interact ? module.interact(control.action) : module.action?.(control.action));
      requestRender(); return { ok, id, action, message: control.label };
    }
    const record = records.get(id);
    if (!record || !record.media || !isVisible(mediaObjects.get(id))) return { ok: false, message: 'Этот экран сейчас скрыт.' };
    if (action === 'view') return { ok: Boolean(describeMedia(record)), id, action, media: describeMedia(record) };
    if (!['toggle', 'play', 'pause', 'next', 'reset'].includes(action)) return { ok: false };
    const entry = videoRecords.get(id);
    if (entry) {
      if (entry.error) return { ok: false, message: entry.error };
      const operation = ++entry.operation;
      try {
        if (action === 'pause' || action === 'toggle' && !entry.video.paused && !entry.video.ended) entry.video.pause();
        else {
          if (action === 'reset' || entry.video.ended) entry.video.currentTime = 0;
          if (action !== 'next') await entry.video.play();
        }
        requestRender(); return { ok: true, id, action, playing: !entry.video.paused, media: getWalkMedia(id), superseded: entry.operation !== operation };
      } catch {
        if (entry.operation !== operation) return { ok: true, id, action, superseded: true };
        return { ok: false, id, message: 'Не удалось запустить ролик. Нажмите «Воспроизвести» ещё раз или выберите другой файл.' };
      }
    }
    const playing = Boolean(record.media.getState?.().playing);
    const command = action === 'play' || action === 'pause' ? 'toggle' : action;
    const changed = (action === 'play' && playing || action === 'pause' && !playing) ? true : record.media.interact?.(command);
    requestRender(); return { ok: Boolean(changed), id, action, playing: Boolean(record.media.getState?.().playing), media: describeMedia(record) };
  }
  function releaseVideo(entry) {
    entry.operation++;
    for (const { node, original, assigned } of entry.materials) if (node.material === assigned) node.material = original;
    for (const material of entry.assignedToOriginal.keys()) material.dispose();
    entry.abort.abort(); entry.video.pause(); entry.video.removeAttribute('src'); entry.video.load(); entry.texture.dispose();
    if (entry.revokeOnDispose && entry.url.startsWith('blob:')) URL.revokeObjectURL(entry.url);
    for (const [id, item] of videoRecords) if (item === entry) videoRecords.delete(id);
    videoEntries.delete(entry);
  }
  function setWalkVideos(definitions = []) {
    sync(); const results = [];
    for (const definition of definitions) {
      const id = definition.mediaId || definition.id, record = records.get(id);
      if (!record?.media || !mediaObjects.has(id)) { results.push({ id, ok: false, message: 'Экран не найден.' }); continue; }
      let url;
      try { if (typeof definition.url !== 'string' || !definition.url.trim()) throw new Error(); url = new URL(definition.url, document.baseURI || location.href); if (!['https:', 'http:', 'blob:'].includes(url.protocol)) throw new Error(); }
      catch { results.push({ id, ok: false, message: 'Неподдерживаемый адрес ролика.' }); continue; }
      const old = videoRecords.get(id); if (old) releaseVideo(old);
      const sourceTexture = mapOf(mediaObjects.get(id));
      // Only surfaces of this physical assembly share its selected file.
      const owner = rootOf(record);
      const aliases = [...records.values()].filter(r => r.media && rootOf(r) === owner && (r.media === record.media || mapOf(mediaObjects.get(r.id)) === sourceTexture));
      const video = document.createElement('video'); video.preload = 'metadata'; video.playsInline = true; video.loop = false;
      video.crossOrigin = 'anonymous'; video.muted = definition.muted === true; video.src = url.href;
      const texture = new THREE.VideoTexture(video); texture.colorSpace = THREE.SRGBColorSpace; texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter; texture.generateMipmaps = false;
      const entry = { video, texture, url: url.href, title: definition.title || record.displayName || record.name,
        revokeOnDispose: definition.revokeOnDispose !== false, materials: [], boundObjects: new Set(), originalToAssigned: new Map(), assignedToOriginal: new Map(), roots: new Set(), surfaces: new Set(), originalTextures: new Set(sourceTexture ? [sourceTexture] : []), abort: new AbortController(), error: null, operation: 0 };
      videoEntries.add(entry);
      for (const alias of aliases) { applyVideoToRecord(entry, alias, mediaObjects.get(alias.id)); videoRecords.set(alias.id, entry); }
      const notify = () => requestRender();
      for (const event of ['loadeddata', 'canplay', 'play', 'pause', 'ended', 'seeked', 'volumechange']) video.addEventListener(event, notify, { signal: entry.abort.signal });
      video.addEventListener('error', () => { entry.error = 'Этот ролик не удалось открыть. Выберите поддерживаемый видеофайл.'; requestRender(); }, { signal: entry.abort.signal });
      video.load(); results.push({ id, ok: true, media: describeMedia(record) });
    }
    requestRender(); return results;
  }
  function pauseWalkVideos(exceptId = null) {
    sync(); const except = exceptId ? videoRecords.get(exceptId) : null; let paused = 0;
    for (const entry of videoEntries) if (entry !== except && !entry.video.paused) { entry.operation++; entry.video.pause(); paused++; }
    requestRender(); return { paused };
  }
  function updateWalkMedia() {
    sync(); return [...videoEntries].some(entry => !entry.error && !entry.video.paused && !entry.video.ended && entry.video.readyState >= 2);
  }
  sync();
  return { getWalkTargets, activateWalkTarget, getWalkMedia, setWalkVideos, pauseWalkVideos, updateWalkMedia, sync,
    dispose() { if (disposed) return; disposed = true; for (const entry of [...videoEntries]) releaseVideo(entry); for (const material of restoredMaterials.values()) material.dispose(); restoredMaterials.clear(); } };
}
