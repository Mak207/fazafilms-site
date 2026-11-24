import * as THREE from 'three';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const EPS = 1e-7;

/** Subtract an axis-aligned void in ship-local metres from a cloned mesh geometry.
 * Triangle clipping is geometric: raycasts and collision probes see the opening.
 * UVs/normals are interpolated along cut edges. Loader-owned source buffers stay intact.
 */
export function cutGeometryBox(source, meshToShip, minimum, maximum) {
  if (!source?.attributes?.position) return null;
  const names = Object.keys(source.attributes), position = source.attributes.position;
  const count = position.count, indices = source.index;
  const triangleCount = Math.floor((indices ? indices.count : count) / 3);
  const localAttributes = Object.fromEntries(names.map(name => {
    const a = source.attributes[name], values = new Float32Array(count * a.itemSize);
    for (let i = 0; i < count; i++) for (let k = 0; k < a.itemSize; k++) values[i * a.itemSize + k] = a.getComponent(i, k);
    return [name, { values, size: a.itemSize, extra: [] }];
  }));
  const shipPositions = new Float64Array(count * 3), point = new THREE.Vector3();
  for (let i = 0; i < count; i++) point.fromBufferAttribute(position, i).applyMatrix4(meshToShip).toArray(shipPositions, i * 3);
  const planes = [0, 1, 2].flatMap(axis => [{ axis, boundary: minimum[axis], sign: 1 }, { axis, boundary: maximum[axis], sign: -1 }]);
  const output = [], groups = []; let extraCount = 0, removedTriangles = 0, clippedTriangles = 0, groupCursor = 0;
  const triangleIndex = i => indices ? indices.getX(i) : i;
  const vertex = i => ({ index: i, p: Array.from(shipPositions.subarray(i * 3, i * 3 + 3)), values: null });
  function valueAt(v, name) {
    if (v.values) return v.values[name];
    const a = localAttributes[name]; return Array.from(a.values.subarray(v.index * a.size, (v.index + 1) * a.size));
  }
  function interpolate(a, b, t) {
    const values = {};
    for (const name of names) { const av = valueAt(a, name), bv = valueAt(b, name); values[name] = av.map((value, k) => value + (bv[k] - value) * t); }
    return { index: -1, p: a.p.map((value, k) => value + (b.p[k] - value) * t), values };
  }
  function clip(polygon, plane, inside) {
    if (polygon.length < 3) return [];
    const result = [], distance = v => plane.sign * (v.p[plane.axis] - plane.boundary);
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length], da = distance(a), db = distance(b);
      const aKeep = inside ? da >= -EPS : da <= EPS, bKeep = inside ? db >= -EPS : db <= EPS;
      if (aKeep) result.push(a);
      if (aKeep !== bKeep) result.push(interpolate(a, b, clamp(da / (da - db), 0, 1)));
    }
    return result;
  }
  function appendVertex(v) {
    if (v.index >= 0) return v.index;
    const next = count + extraCount++;
    for (const name of names) localAttributes[name].extra.push(...v.values[name]);
    v.index = next; return next;
  }
  function appendTriangle(a, b, c, materialIndex) {
    const ab = new THREE.Vector3(...b.p).sub(new THREE.Vector3(...a.p)), ac = new THREE.Vector3(...c.p).sub(new THREE.Vector3(...a.p));
    if (ab.cross(ac).lengthSq() < 1e-14) return;
    const offset = output.length; output.push(appendVertex(a), appendVertex(b), appendVertex(c));
    const previous = groups.at(-1);
    if (previous?.materialIndex === materialIndex && previous.start + previous.count === offset) previous.count += 3;
    else groups.push({ start: offset, count: 3, materialIndex });
  }
  for (let tri = 0; tri < triangleCount; tri++) {
    const offset = tri * 3;
    while (groupCursor + 1 < source.groups.length && offset >= source.groups[groupCursor].start + source.groups[groupCursor].count) groupCursor++;
    const materialIndex = source.groups[groupCursor]?.materialIndex || 0;
    const ids = [triangleIndex(offset), triangleIndex(offset + 1), triangleIndex(offset + 2)];
    const p = ids.map(i => [shipPositions[i * 3], shipPositions[i * 3 + 1], shipPositions[i * 3 + 2]]);
    const outside = [0, 1, 2].some(axis => Math.max(...p.map(v => v[axis])) < minimum[axis] - EPS || Math.min(...p.map(v => v[axis])) > maximum[axis] + EPS);
    if (outside) {
      const start = output.length; output.push(...ids); const previous = groups.at(-1);
      if (previous?.materialIndex === materialIndex && previous.start + previous.count === start) previous.count += 3;
      else groups.push({ start, count: 3, materialIndex });
      continue;
    }
    if (p.every(v => v.every((n, axis) => n >= minimum[axis] - EPS && n <= maximum[axis] + EPS))) { removedTriangles++; continue; }
    let remainder = ids.map(vertex); const kept = [];
    for (const plane of planes) {
      const outsidePart = clip(remainder, plane, false); if (outsidePart.length >= 3) kept.push(outsidePart);
      remainder = clip(remainder, plane, true); if (remainder.length < 3) break;
    }
    clippedTriangles++;
    for (const polygon of kept) for (let i = 1; i + 1 < polygon.length; i++) appendTriangle(polygon[0], polygon[i], polygon[i + 1], materialIndex);
  }
  if (!removedTriangles && !clippedTriangles) return null;
  // Compact referenced vertices so removed parts also disappear from exact bounds.
  const remap = new Int32Array(count + extraCount); remap.fill(-1); const used = [];
  const compactIndex = output.map(index => { if (remap[index] < 0) { remap[index] = used.length; used.push(index); } return remap[index]; });
  const geometry = new THREE.BufferGeometry(); geometry.name = (source.name || 'O12') + ' · runtime wheelhouse opening';
  for (const name of names) {
    const a = localAttributes[name], values = new Float32Array(used.length * a.size);
    used.forEach((index, target) => { for (let k = 0; k < a.size; k++) values[target * a.size + k] = index < count ? a.values[index * a.size + k] : a.extra[(index - count) * a.size + k]; });
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, a.size));
  }
  geometry.setIndex(compactIndex); for (const group of groups) geometry.addGroup(group.start, group.count, group.materialIndex);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData = { ...source.userData, runtimeCut: true, cutSpace: 'ship-local metres', cutMin: minimum.slice(), cutMax: maximum.slice() };
  return { geometry, report: { sourceTriangles: triangleCount, retainedTriangles: output.length / 3, removedTriangles, clippedTriangles, interpolatedVertices: extraCount } };
}

/** Human-scale accessible exhibition bridge at local Y=6.00, intended to meet the13.20m mezzanine.
 * Call with the loaded, already metre-normalized O12 instance root BEFORE adding its surroundings.
 * This swaps only that instance's geometry for derived runtime buffers. dispose() restores the source.
 */
export function createIcebreakerWheelhouse({ shipRoot, deckY = 6, modelLength = 25.2, roomWidth = 6.2, roomLength = 4, rearZ = 5, approachZ = rearZ - 1.3, cutVolume = null, onChange = () => {}, canvasFactory, id = 'lider-wheelhouse' } = {}) {
  if (!shipRoot?.isObject3D) throw new TypeError('A normalized O12 instance root is required.');
  if (!Number.isFinite(deckY)) throw new TypeError('A finite ship-local deck elevation is required.');
  const group = new THREE.Group(); group.name = 'Лидер · проходимая капитанская рубка';
  group.userData = { installationId: id, exhibitId: 'O12', runtimeExhibitionAdaptation: true };
  const geometries = new Set(), materials = new Set(), textures = new Set(), replacements = [], collisionParts = [], actions = new Map(), pickTargets = [], screens = [];
  let disposed = false, elapsed = 0, lastFrame = -1;
  const state = { active: true, heading: 0, rudder: 0, speed: 7.5 };
  const ws=roomWidth/6.2, hs=modelLength/25.2, z=v=>rearZ+(v-5)*roomLength/4, frontZ=rearZ+roomLength, middleZ=(rearZ+frontZ)/2, apronLength=rearZ-approachZ;
  const cutMin = cutVolume?.min || [-roomWidth/2-.16, deckY-.12, approachZ], cutMax = cutVolume?.max || [roomWidth/2+.16, deckY+3.12,frontZ+.1];
  shipRoot.updateWorldMatrix(true, true); const inverse = shipRoot.matrixWorld.clone().invert();
  const candidates = [];
  shipRoot.traverse(mesh => { if (mesh.isMesh && mesh.geometry?.attributes?.position && !mesh.userData.runtimeExhibitionAdaptation) candidates.push(mesh); });
  for (const mesh of candidates) {
    if (mesh.isSkinnedMesh || mesh.geometry.morphAttributes.position?.length) throw new Error('O12 cutting expects a static mesh.');
    const matrix = new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
    const cut = cutGeometryBox(mesh.geometry, matrix, cutMin, cutMax);
    if (cut) replacements.push({ mesh, source: mesh.geometry, derived: cut.geometry, report: cut.report });
  }
  if (!replacements.length) throw new Error('No O12 geometry intersected the expected bridge region; verify normalized hull and configured cut volume.');
  const material = m => { materials.add(m); return m; };
  const white = material(new THREE.MeshStandardMaterial({ color: 0xe7eeee, roughness: .45 }));
  const navy = material(new THREE.MeshStandardMaterial({ color: 0x193c55, roughness: .5 }));
  const metal = material(new THREE.MeshStandardMaterial({ color: 0x7e929e, metalness: .55, roughness: .3 }));
  const floorMaterial = material(new THREE.MeshStandardMaterial({ color: 0x718187, roughness: .9 }));
  const glass = material(new THREE.MeshPhysicalMaterial({ color: 0xbee3ec, roughness: .12, metalness: .03, transparent: true, opacity: .16, side: THREE.DoubleSide, depthWrite: false }));
  const glow = material(new THREE.MeshBasicMaterial({ color: 0xd9f5ff, toneMapped: false }));
  function mesh(geometry, mat, position, name = '') {
    geometries.add(geometry); const node = new THREE.Mesh(geometry, mat); node.position.fromArray(position); node.name = name;
    node.userData = { installationId: id, exhibitId: 'O12', runtimeExhibitionAdaptation: true }; node.receiveShadow = true; group.add(node); return node;
  }
  function box(size, position, mat, name = '', collides = true) {
    const node = mesh(new THREE.BoxGeometry(...size), mat, position, name);
    if (collides) collisionParts.push({ id: `${id}:${name || collisionParts.length}`, min: position.map((n, i) => n - size[i] / 2), max: position.map((n, i) => n + size[i] / 2), kind: 'wheelhouse' });
    return node;
  }
  function beam(a, b, radius, mat) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), direction = end.clone().sub(start);
    const node = mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 12), mat, start.add(end).multiplyScalar(.5).toArray());
    node.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()); return node;
  }
  const floorTop = deckY, clearHeight = 2.35, doorWidth = 1.2, doorHeight = 2.2;
  box([roomWidth, .14, roomLength], [0, floorTop-.07,middleZ], floorMaterial, 'пол рубки');
  box([roomWidth+.08,.12,roomLength+.08],[0,deckY+clearHeight+.06,middleZ], white, 'крыша');
  // The side/front glass is genuine transparent runtime geometry, with solid low spandrels.
  for (const sign of [-1, 1]) {
    box([.12,.82,roomLength],[sign*(roomWidth/2-.06),deckY+.41,middleZ], white, `борт-${sign}-низ`);
    box([.045,clearHeight-.82,roomLength-.15],[sign*(roomWidth/2-.06),deckY+.82+(clearHeight-.82)/2,middleZ], glass, `борт-${sign}-стекло`);
    for(const value of [5.06,6.35,7.65,8.94])box([.10,clearHeight,.10],[sign*(roomWidth/2-.06),deckY+clearHeight/2,z(value)],white,`стойка-${sign}-${value}`);
  }
  box([roomWidth-.12,.82,.12],[0,deckY+.41,frontZ-.06], white, 'фронт-низ');
  box([roomWidth-.24,clearHeight-.82,.045],[0,deckY+.82+(clearHeight-.82)/2,frontZ-.06], glass, 'панорамное стекло');
  for(const x of [-1.48*ws,0,1.48*ws]) box([.07, clearHeight - .82, .08], [x, deckY + .82 + (clearHeight - .82) /2,frontZ-.06],white,`стойка-фронт-${x}`);
  // Two separate rear wall pieces and a lintel leave a physical1.20×2.20m opening.
  const rearWidth = (roomWidth-doorWidth)/2;
  for (const sign of [-1, 1]) box([rearWidth, clearHeight, .12], [sign * (doorWidth / 2 + rearWidth / 2), deckY + clearHeight/2,rearZ+.06], white, `задняя стенка-${sign}`);
  box([doorWidth, clearHeight - doorHeight, .12], [0, deckY + doorHeight + (clearHeight - doorHeight) /2,rearZ+.06], white, 'дверная перемычка');
  // Flush approach apron; no invisible source mesh or closed door remains in the approach.
  box([1.6,.14,apronLength],[0,deckY-.07,(rearZ+approachZ)/2], floorMaterial, 'входная площадка');
  for (const sign of [-1, 1]) {
    box([.05,1.1,apronLength-.1],[sign*.775,deckY+.55,(rearZ+approachZ)/2], glass, `ограждение входа-${sign}`);
    beam([sign*.775,deckY+1.1,approachZ+.05],[sign*.775,deckY+1.1,rearZ-.1], .032, metal);
  }
  // Standing console keeps the rear2.55m of room depth clear for a small visitor group.
  box([5*ws,.96,.66],[0,deckY+.48,z(8.2)], navy, 'пульт');
  box([5.12*ws,.08,.78],[0,deckY+1,z(8.18)], metal, 'столешница');
  for(const x of [-2.75*ws,2.75*ws])box([.045,.028,roomLength-.44],[x,deckY+clearHeight-.055,middleZ], glow, 'световая линия', false);
  function surface(width, height) {
    let canvas;
    if (canvasFactory) canvas = canvasFactory(width, height);
    else if (typeof document !== 'undefined') { canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; }
    const context = canvas?.getContext?.('2d'); if (!context) return { canvas: null, context: null, texture: null };
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter; texture.generateMipmaps = false; textures.add(texture);
    return { canvas, context, texture };
  }
  function screen(size, position, draw, name, resolution = [1024, 512]) {
    const s = surface(...resolution);
    box([size[0] + .06, size[1] + .06, .065], [position[0], position[1], position[2] + .045], navy, `${name}-рамка`, false);
    const face = mesh(new THREE.PlaneGeometry(...size), material(new THREE.MeshBasicMaterial({ color: s.texture ? 0xffffff : 0x39778d, map: s.texture, toneMapped: false, side: THREE.DoubleSide })), position, name); face.rotation.y = Math.PI;
    const item = { ...s, face, redraw() { if (!s.context) return; draw(s.context, s.canvas.width, s.canvas.height); s.texture.needsUpdate = true; } }; item.redraw(); screens.push(item); return item;
  }
  function navigation(ctx, w, h) {
    ctx.fillStyle = '#061c2b'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#164454'; ctx.lineWidth = 2;
    for (let x = 0; x < w; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.fillStyle = '#d4edf3'; ctx.font = '600 44px sans-serif'; ctx.fillText('ЛИДЕР · КАПИТАНСКИЙ МОСТИК', 35, 65);
    ctx.strokeStyle = '#6edebc'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(w * .25, h * .84); ctx.bezierCurveTo(w * .37, h * .60, w * .65, h * .64, w * .71, h * .26); ctx.stroke();
    ctx.save(); ctx.translate(w * .5, h * .6); ctx.rotate(state.heading); ctx.fillStyle = '#ffe09a'; ctx.beginPath(); ctx.moveTo(0, -35); ctx.lineTo(20, 24); ctx.lineTo(0, 13); ctx.lineTo(-20, 24); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#a7d5de'; ctx.font = '32px sans-serif'; ctx.fillText(`Курс ${((Math.round(state.heading * 180 / Math.PI) % 360) + 360) % 360}°`, 35, h - 35);
    ctx.fillText(`${state.speed.toFixed(1)} уз · ${state.active ? 'ХОД' : 'ПАУЗА'}`, w * .55, h - 35);
  }
  screen([1.7*ws,.70],[0,deckY+1.43,z(8.03)], navigation, 'навигационная карта');
  for (const sign of [-1, 1]) screen([1.45*ws,.62],[sign*1.72*ws,deckY+1.39,z(8.03)], (ctx, w, h) => {
    ctx.fillStyle = '#0b2635'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#d8eef2'; ctx.font = '600 56px sans-serif'; ctx.fillText(sign < 0 ? 'ЛЕДОВАЯ ОБСТАНОВКА' : 'ЭНЕРГИЯ И ДВИЖЕНИЕ', 30, 90);
    ctx.strokeStyle = '#72d7cc'; ctx.lineWidth = 7; ctx.beginPath();
    for (let i = 0; i <= 24; i++) { const x = 30 + i * (w - 60) / 24, y = h * .55 + Math.sin(i * .42 + elapsed * .5 + sign) * h * .09; if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke();
    ctx.font = '42px sans-serif'; ctx.fillStyle = '#a9ced8'; ctx.fillText(sign < 0 ? 'ПУТЬ ВО ЛЬДАХ' : 'ВСЕ СИСТЕМЫ В НОРМЕ', 30, h - 55);
  }, sign < 0 ? 'ледовый монитор' : 'системный монитор');
  function action(node, name, callback) { node.userData.installationAction = name; node.userData.installationId = id; pickTargets.push(node); actions.set(name, callback); }
  const refresh = () => { for (const s of screens) s.redraw(); };
  const controls = [
    ['lider-left', 'ЛЕВО НА БОРТ', () => { state.rudder = clamp(state.rudder - .15, -.65, .65); state.active = true; }],
    ['lider-toggle', 'ХОД / ПАУЗА', () => { state.active = !state.active; }],
    ['lider-right', 'ПРАВО НА БОРТ', () => { state.rudder = clamp(state.rudder + .15, -.65, .65); state.active = true; }],
    ['lider-reset', 'ПРЯМО ПО КУРСУ', () => { state.heading = 0; state.rudder = 0; state.active = true; }],
  ];
  controls.forEach(([name, title, callback], index) => {
    const panel = screen([1.02*ws,.18],[(1.8-index*1.2)*ws,deckY+.79,z(7.84)], (ctx, w, h) => { ctx.fillStyle = '#194353'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#f0f2de'; ctx.font = '600 61px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(title, w / 2, h * .65); }, name, [1024, 160]);
    action(panel.face, name, () => { callback(); refresh(); });
  });
  const wheel = mesh(new THREE.TorusGeometry(.22, .027, 10, 40), metal, [0,deckY+1.08,z(7.65)], 'штурвал');
  for (const angle of [0, 2 * Math.PI / 3, 4 * Math.PI / 3]) beam([0,deckY+1.08,z(7.65)], [.22 * Math.sin(angle), deckY+1.08+.22*Math.cos(angle),z(7.65)], .014, metal);
  collisionParts.push({ id: 'O12:wheel', min:[-.27,deckY+.8,z(7.65)-.05],max:[.27,deckY+1.36,z(7.65)+.05], kind: 'wheelhouse' });
  action(wheel, 'lider-toggle', () => { state.active = !state.active; refresh(); });
  // Install derived geometry last, so a construction error never leaves a partly cut instance.
  for (const replacement of replacements) { replacement.mesh.geometry = replacement.derived; replacement.mesh.userData.runtimeWheelhouseCut = true; }
  shipRoot.add(group);
  const cutReport = replacements.map(r => ({ mesh: r.mesh.name, ...r.report }));
  function update(delta) {
    if (disposed || !Number.isFinite(delta) || delta < 0 || !group.visible) return false;
    const dt = Math.min(delta, .12); if (state.active) { elapsed += dt; state.heading += state.rudder * dt * .10; }
    const frame = Math.floor(elapsed * 10); if (frame !== lastFrame) { refresh(); lastFrame = frame; }
    wheel.rotation.z = -state.rudder * .8; return state.active;
  }
  // Conservative occupied parts are split around the new route; never re-add the full-height hull AABB.
  const retainedHullParts = [
    {id:'O12:hull-below-access-deck',min:[-3.198*hs,0,-modelLength/2],max:[3.198*hs,cutMin[1],modelLength/2],kind:'hull'},
    {id:'O12:aft-upper-superstructure',min:[-3.198*hs,cutMin[1],-modelLength/2],max:[3.198*hs,8.84*hs,cutMin[2]],kind:'hull'},
    {id:'O12:foredeck',min:[-3.198*hs,cutMin[1],cutMax[2]],max:[3.198*hs,8.84*hs,modelLength/2],kind:'hull'},
  ].filter(p=>p.max.every((v,i)=>v>p.min[i]));
  return { group, root: group, update, screens, pickTargets, cutReport,
    entrance: { threshold:[0,deckY,rearZ],approach:[0,deckY,approachZ], inward: [0, 0, 1], clearWidth: doorWidth, clearHeight: doorHeight },
    interiorPose:{position:[0,deckY+1.65,rearZ+1],target:[0,deckY+1.5,frontZ-.2]},
    entryPose:{position:[0,deckY+1.55,approachZ+.2],target:[0,deckY+1.4,frontZ-.4]},
    walkableSurfaces:[{id:'wheelhouse-floor',y:deckY,polygon:[[-roomWidth/2+.12,rearZ+.12],[roomWidth/2-.12,rearZ+.12],[roomWidth/2-.12,frontZ-.13],[-roomWidth/2+.12,frontZ-.13]]},{id:'wheelhouse-apron',y:deckY,polygon:[[-.75,approachZ],[.75,approachZ],[.75,rearZ+.13],[-.75,rearZ+.13]]}],
    getCollisionParts: () => [...retainedHullParts, ...collisionParts].map(p => ({ ...p, min: p.min.slice(), max: p.max.slice() })),
    getState: () => ({ id, ...state, elapsed, deckLocalY: deckY, clearHeightMetres: clearHeight, entranceMetres: [doorWidth, doorHeight], modelLengthMetres:modelLength,localPlan:{min:[-roomWidth/2,rearZ],max:[roomWidth/2,frontZ]}, cutVolume: { min: cutMin.slice(), max: cutMax.slice() }, runtimeCut: true, originalGLBUnchanged: true, actions: [...actions.keys()] }),
    interact(name) { if (disposed || !actions.has(name)) return false; actions.get(name)(); onChange(); return true; },
    setSection(enabled, plane) { for (const mat of materials) { mat.clippingPlanes = enabled && plane ? [plane] : []; mat.needsUpdate = true; } },
    dispose() { if (disposed) return; disposed = true; group.removeFromParent();
      for (const r of replacements) { if (r.mesh.geometry === r.derived) r.mesh.geometry = r.source; delete r.mesh.userData.runtimeWheelhouseCut; r.derived.dispose(); }
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); actions.clear();
    },
  };
}
