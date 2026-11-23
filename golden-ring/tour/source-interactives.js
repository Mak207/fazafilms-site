import * as THREE from '../interactives/vendor/three-0.180/three.module.min.js';
import {
  SOURCE_INTERACTIVE_DEFINITIONS, SOURCE_CITIES, SOURCE_INTERESTS, SOURCE_CRAFTS, SOURCE_MAP_LAYERS,
  SOURCE_SCROLL_CHAPTERS, SOURCE_WELL_THEMES, SOURCE_BOBBIN_THEMES, SOURCE_GLASS_STAGE_NAMES, sourceJourney
} from './source-interactive-data.js?v=2';

const TAU = Math.PI * 2;
const clamp = (n, low = 0, high = 1) => Math.min(high, Math.max(low, Number(n) || 0));
const wrap = n => ((n % 1) + 1) % 1;
const valid = (items, value) => items.some(item => item.id === value);
const cityTitle = id => SOURCE_CITIES.find(city => city.id === id)?.title || id;
const ROTATING_ROLES = {
  scroll: ['roller'], bobbins: ['spool', 'bobbin'], yarn: ['spindle', 'segment'],
  ornament: ['wheel'], boats: ['hull', 'boat']
};
const THEME_COLORS = { filigree: 0xf3d998, capital: 0xdf9e53, salt: 0xd9edee };
const INITIAL = {
  scroll: () => ({ running: false, progress: 0, chapter: 0, direction: 1 }),
  well: () => ({ running: false, theme: 'kalyazin', phase: 0, steam: 0 }),
  boats: () => ({ running: false, progress: 0 }),
  bells: () => ({ running: false, struckIndex: -1, pulse: 0 }),
  bobbins: () => ({ running: false, theme: 'filigree', angle: 0, brightness: .62 }),
  yarn: () => ({ running: false, phase: 0 }),
  ornament: () => ({ running: false, progress: 0, pattern: 0, stitchQuality: 1 }),
  finale: () => ({ running: false, city: 'vladimir', interest: 'architecture', daylight: .78,
    phase: .17, route: sourceJourney('vladimir', 'architecture') }),
  map: () => ({ running: false, layer: 'cities' }),
  workshops: () => ({ running: false, craft: 'pottery', step: 0 })
};

/**
 * Source-original installations only. Geometry is supplied by prepareSourceGeometry;
 * this module does not create replacement apparatus or alter visitors/skeletons.
 * Axis vectors are local to part.group, whose origin is the source-verified pivot.
 *
 * setDisplayState(id, state) receives a stable plain object; renderers should read it,
 * not mutate it. Continuous display changes are capped at 18 updates per second.
 * invoke() is useful for deterministic QA and external controls. It NEVER starts
 * audio; bell audio requires a trusted click on a button owned by this controller.
 */
export function createSourceInteractives({
  model, bindings = {}, renderer, clock, mount, onChange = () => {},
  onSelectView = () => {}, reducedMotion = false, setDisplayState = () => {}
} = {}) {
  const records = new Map();
  const meshOwners = new WeakMap();
  const claimedMotion = new WeakSet();
  const materialRestores = [];
  const warnings = [];
  const reduced = typeof reducedMotion === 'boolean' ? reducedMotion : Boolean(reducedMotion?.matches);
  let activeId = null, paused = false, disposed = false, frame = 0;
  let displayElapsed = 0, uiElapsed = 0, lastAction = null;
  let panel = null, ui = null, listeners = [];
  let audio = null, audioVoiceCount = 0, audioPlayCount = 0, audioGeneration = 0;
  const audioNodes = new Set();
  const q = new THREE.Quaternion();
  const tmpColor = new THREE.Color();

  function warn(message) {
    if (!warnings.includes(message) && warnings.length < 30) warnings.push(message);
  }

  function initialBinding(id) {
    const known = bindings instanceof Map ? bindings.get(id) : bindings[id];
    if (known) return known;
    if (!model?.traverse) return null;
    const parts = [];
    model.traverse(object => {
      if (!object.isMesh || object.userData?.interactiveId !== id) return;
      let group = object.parent;
      while (group && group !== model && group.userData?.partId !== object.userData.partId) group = group.parent;
      parts.push({ ...object.userData, mesh: object, object,
        group: group === model ? null : group, role: object.userData.role || 'body' });
    });
    return parts.length ? { id, parts } : null;
  }

  function normalizedParts(binding) {
    if (Array.isArray(binding.parts)) return binding.parts;
    const parts = [], seen = new Set();
    for (const [role, members] of Object.entries(binding.roles || {})) {
      for (const member of members) {
        const part = member.isObject3D ? { mesh: member, object: member, role } : { ...member, role };
        const key = part.mesh || part.object || part.group;
        if (key && !seen.has(key)) { seen.add(key); parts.push(part); }
      }
    }
    return parts;
  }

  function makeRotors(record) {
    const allowed = ROTATING_ROLES[record.id] || [];
    const seen = new Set();
    for (const part of record.parts) {
      const role = part.role || part.mesh?.userData.role;
      if (!allowed.includes(role)) continue;
      const group = part.group || part.pivotGroup;
      // A merged material mesh has absolute vertex coordinates: rotating it around
      // its zero origin would throw the apparatus across the pavilion.
      if (!group?.isObject3D || (group === part.mesh && !group.userData?.isMotionPivot)) {
        warn(record.id + ': no verified pivot for ' + (part.sourceObject || part.partId || role));
        continue;
      }
      if (seen.has(group)) continue;
      if (claimedMotion.has(group)) { warn(record.id + ': pivot already owned by another installation'); continue; }
      seen.add(group); claimedMotion.add(group);
      const axis = new THREE.Vector3().fromArray(part.axis || group.userData.axis || [0, 1, 0]);
      if (axis.lengthSq() < .00001) { warn(record.id + ': empty rotation axis'); continue; }
      axis.normalize();
      record.rotors.push({
        group, role, partId: part.partId || group.name, axis,
        quaternion: group.quaternion.clone(), position: group.position.clone(), scale: group.scale.clone(),
        angle: 0, direction: Number(part.direction) === -1 ? -1 : 1
      });
    }
  }

  function coupleScrollRollers(record) {
    if (record.id !== 'scroll' || record.rotors.length < 2) return;
    const paper = record.parts.find(part => part.role === 'scroll' || part.isSurface || part.role === 'surface');
    const paperMesh = paper?.mesh || paper?.object;
    if (!paperMesh) return;
    model?.updateMatrixWorld?.(true);
    const paperBox = new THREE.Box3().setFromObject(paperMesh);
    if (paperBox.isEmpty() || paperBox.max.y - paperBox.min.y > .03) return;
    const paperY = (paperBox.min.y + paperBox.max.y) * .5;
    const from = record.rotors[0].group.getWorldPosition(new THREE.Vector3());
    const to = record.rotors[1].group.getWorldPosition(new THREE.Vector3());
    const firstAxis = record.rotors[0].axis.clone()
      .applyQuaternion(record.rotors[0].group.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const feed = to.clone().sub(from); feed.y = 0;
    feed.addScaledVector(firstAxis, -feed.dot(firstAxis));
    record.scrollTravel = feed.length();
    if (record.scrollTravel < .01) return;
    feed.normalize();
    for (const rotor of record.rotors) {
      const pivot = rotor.group.getWorldPosition(new THREE.Vector3());
      const axis = rotor.axis.clone()
        .applyQuaternion(rotor.group.getWorldQuaternion(new THREE.Quaternion())).normalize();
      // The actual source sheet is below both axles. PCA axis signs are
      // arbitrary, so derive feed direction from the contact velocity omega × r.
      const contact = new THREE.Vector3(0, paperY - pivot.y, 0);
      contact.addScaledVector(axis, -contact.dot(axis));
      rotor.radius = Math.max(.005, contact.length());
      rotor.feedSign = Math.sign(new THREE.Vector3().crossVectors(axis, contact).dot(feed)) || 1;
    }
  }

  function makeHighlights(record) {
    if (!['bells', 'bobbins', 'yarn'].includes(record.id)) return;
    const groups = new Map();
    for (const part of record.parts) {
      const mesh = part.mesh || part.object;
      if (!mesh?.isMesh || (part.role === 'surface' || part.isSurface) || !mesh.material) continue;
      const original = mesh.material;
      const originals = Array.isArray(original) ? original : [original];
      const materials = originals.map(material => {
        if (!material.emissive || !material.clone) return material;
        const copy = material.clone();
        // Preserve any source finishing hook, and do not modify shared materials.
        copy.onBeforeCompile = material.onBeforeCompile;
        copy.customProgramCacheKey = material.customProgramCacheKey;
        return copy;
      });
      if (materials.every((material, index) => material === originals[index])) continue;
      mesh.material = Array.isArray(original) ? materials : materials[0];
      materialRestores.push({ mesh, original, owned: materials.filter((material, index) => material !== originals[index]) });
      const key = part.partId || part.group?.uuid || mesh.uuid;
      if (!groups.has(key)) groups.set(key, []);
      for (let i = 0; i < materials.length; i++) {
        const material = materials[i];
        if (material === originals[i] || !material.emissive) continue;
        groups.get(key).push({
          material, color: material.emissive.clone(),
          intensity: Number(material.emissiveIntensity) || 0
        });
      }
    }
    record.highlights = [...groups.values()];
    record.pulses = new Float32Array(record.highlights.length);
  }

  function makeClosedPath(record) {
    if (record.id !== 'boats' || !record.rotors.length) return;
    const binding = record.binding;
    const points = binding.pathPoints || binding.trackPoints || binding.path?.points;
    let curve = binding.path?.isCurve ? binding.path : null;
    if (!curve && Array.isArray(points) && points.length >= 4) {
      curve = new THREE.CatmullRomCurve3(points.map(point =>
        point.isVector3 ? point.clone() : new THREE.Vector3().fromArray(point)), true, 'centripetal');
    }
    if (!curve) {
      warn('boats: source hulls have no verified closed track; the truss remains static');
      return;
    }
    if ('closed' in curve && !curve.closed) {
      warn('boats: open track rejected; the source scenario requires a closed loop');
      return;
    }
    curve.arcLengthDivisions = 512;
    curve.updateArcLengths();
    record.curve = curve;
    model?.updateMatrixWorld?.(true);
    const sample = new THREE.Vector3();
    for (const rotor of record.rotors) {
      const parent = rotor.group.parent;
      parent?.updateMatrixWorld?.(true);
      const transform = new THREE.Matrix4();
      if (parent) transform.copy(parent.matrixWorld).invert();
      if (binding.pathSpace !== 'world' && model) transform.multiply(model.matrixWorld);
      let nearest = 0, best = Infinity;
      for (let i = 0; i < 256; i++) {
        curve.getPointAt(i / 256, sample).applyMatrix4(transform);
        const dx = sample.x - rotor.position.x, dz = sample.z - rotor.position.z;
        const distance = dx * dx + dz * dz;
        if (distance < best) { best = distance; nearest = i / 256; }
      }
      const point = curve.getPointAt(nearest, new THREE.Vector3()).applyMatrix4(transform);
      const tangent = curve.getTangentAt(nearest, new THREE.Vector3()).transformDirection(transform);
      rotor.track = { transform, phase: nearest, offset: rotor.position.clone().sub(point),
        point: new THREE.Vector3(), tangent: new THREE.Vector3(), yaw: Math.atan2(tangent.x, tangent.z) };
    }
  }

  for (const definition of SOURCE_INTERACTIVE_DEFINITIONS) {
    const binding = initialBinding(definition.id);
    if (!binding) continue;
    const parts = normalizedParts(binding);
    if (!parts.length && !binding.displayOnly) continue;
    const record = {
      id: definition.id, definition, binding, parts, rotors: [], highlights: [],
      pulses: new Float32Array(0), state: INITIAL[definition.id](), time: 0,
      displayDirty: true, curve: null, manualTime: 0, manualSpeed: 0, soundStatus: ''
    };
    records.set(record.id, record);
    for (const part of parts) {
      for (const object of [part.mesh, part.object, part.group]) {
        if (object?.isObject3D) meshOwners.set(object, definition.id);
      }
    }
    makeRotors(record);
    coupleScrollRollers(record);
    makeHighlights(record);
    makeClosedPath(record);
  }

  const definitions = [...records.values()].map(record => {
    const camera = record.binding.camera || record.binding.view || record.definition.camera;
    const item = {
      ...record.definition,
      camera: { position: [...camera.position], target: [...camera.target], fov: camera.fov || 55 },
      capabilities: {
        display: Boolean(record.binding.displayOnly || record.binding.surfaces?.length || record.parts.some(part => part.role === 'surface' || part.isSurface)),
        rotation: record.rotors.length > 0 && record.id !== 'boats',
        pathMotion: Boolean(record.curve), sound: record.id === 'bells'
      }
    };
    if (record.id === 'boats' && record.curve) {
      item.instruction = 'Запустите движение судов по замкнутому пути.';
      item.description = 'Исходные модели судов движутся с постоянной скоростью по замкнутой рейке.';
    }
    record.definition = item;
    return item;
  });

  function display(record) {
    setDisplayState(record.id, record.state);
    record.displayDirty = false;
  }

  function applyRotation(rotor, angle) {
    rotor.angle = angle;
    q.setFromAxisAngle(rotor.axis, angle * rotor.direction);
    rotor.group.quaternion.copy(rotor.quaternion).multiply(q);
  }

  function applyHighlight(group, amount, color) {
    tmpColor.setHex(color);
    for (const item of group) {
      item.material.emissive.copy(item.color).lerp(tmpColor, clamp(amount));
      item.material.emissiveIntensity = Math.max(item.intensity, .02) + amount * .78;
    }
  }

  function applyPose(record) {
    const state = record.state;
    if (record.id === 'scroll') {
      for (const rotor of record.rotors) {
        const angle = record.scrollTravel && rotor.radius
          ? state.progress * record.scrollTravel / rotor.radius * rotor.feedSign
          : -state.progress * TAU * 1.5;
        applyRotation(rotor, angle);
      }
    } else if (record.id === 'bobbins') {
      for (let i = 0; i < record.rotors.length; i++) {
        applyRotation(record.rotors[i], state.angle * (i % 2 ? -1 : 1));
      }
      const color = THEME_COLORS[state.theme] || THEME_COLORS.filigree;
      for (const group of record.highlights) applyHighlight(group, state.brightness * .45, color);
    } else if (record.id === 'yarn') {
      for (let i = 0; i < record.rotors.length; i++) {
        applyRotation(record.rotors[i], state.phase * TAU + i * .2);
      }
      for (let i = 0; i < record.highlights.length; i++) {
        const wave = .22 + .30 * (.5 + .5 * Math.sin(state.phase * TAU - i * .65));
        applyHighlight(record.highlights[i], wave, 0xeec977);
      }
    } else if (record.id === 'ornament') {
      for (const rotor of record.rotors) applyRotation(rotor, state.progress * TAU * 3);
    } else if (record.id === 'bells') {
      for (let i = 0; i < record.highlights.length; i++) {
        applyHighlight(record.highlights[i], record.pulses[i] * .7, 0xf0c66f);
      }
    } else if (record.id === 'boats' && record.curve) {
      for (const rotor of record.rotors) {
        const track = rotor.track;
        const position = wrap(track.phase + state.progress);
        record.curve.getPointAt(position, track.point).applyMatrix4(track.transform);
        rotor.group.position.copy(track.point).add(track.offset);
        record.curve.getTangentAt(position, track.tangent).transformDirection(track.transform);
        applyRotation(rotor, Math.atan2(track.tangent.x, track.tangent.z) - track.yaw);
      }
    }
  }

  function notify(record, action, value) {
    record.displayDirty = true;
    applyPose(record);
    display(record);
    lastAction = { id: record.id, action, value: value ?? null, frame };
    refreshUI();
    onChange();
  }

  function releaseManualPause() {
    if (!paused) return;
    for (const other of records.values()) other.state.running = false;
    paused = false;
  }

  function start(record) {
    releaseManualPause();
    if (record.id === 'ornament' && record.state.progress >= 1) record.state.progress = 0;
    record.state.running = true;
  }

  function stopAudio() {
    audioGeneration++;
    for (const node of audioNodes) {
      try { node.stop(); } catch { /* The voice may have ended naturally. */ }
      try { node.disconnect(); } catch { /* No outstanding audio connection. */ }
    }
    audioNodes.clear();
    audioVoiceCount = 0;
  }

  function bellTone(frequency, delay = 0, strength = 1) {
    const now = audio.currentTime + delay;
    const partials = [1, 2.01, 2.74, 4.07];
    const levels = [.038, .019, .009, .004];
    for (let i = 0; i < partials.length; i++) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency * partials[i];
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(levels[i] * strength, now + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, now + 2.35 - i * .25);
      oscillator.connect(gain); gain.connect(audio.destination);
      audioNodes.add(oscillator);
      audioVoiceCount++;
      oscillator.onended = () => {
        oscillator.disconnect(); gain.disconnect();
        if (audioNodes.delete(oscillator)) audioVoiceCount = Math.max(0, audioVoiceCount - 1);
      };
      oscillator.start(now); oscillator.stop(now + 2.5);
    }
  }

  async function playBellAudio(record, index) {
    const requested = ++audioGeneration;
    try {
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextClass) { record.soundStatus = 'Звук недоступен в этом браузере'; refreshUI(); return; }
      if (!audio) audio = new AudioContextClass();
      if (audio.state === 'suspended') await audio.resume();
      if (disposed || requested !== audioGeneration) return;
      stopAudio();
      audioPlayCount++;
      if (index === 'all') {
        bellTone(174.61, 0, .75);
        bellTone(261.63, .18, .65);
        bellTone(392, .38, .55);
      } else {
        bellTone([392, 261.63, 174.61][index] || 261.63);
      }
      record.soundStatus = 'Синтезированный перезвон';
      refreshUI();
    } catch {
      record.soundStatus = 'Нажмите колокол ещё раз для звука';
      refreshUI();
    }
  }

  function perform(id, action, value, trustedGesture = false) {
    if (disposed) return false;
    const record = records.get(id);
    if (!record) return false;
    const state = record.state;
    let handled = true;
    if (action === 'focus') { onSelectView(record.definition.viewId); return true; }
    if (['play', 'pause', 'toggle'].includes(action) &&
        (['map', 'workshops', 'bells'].includes(id) ||
         (id === 'boats' && !record.curve && !record.definition.capabilities.display))) return false;
    if (action === 'play') start(record);
    else if (action === 'pause') state.running = false;
    else if (action === 'toggle') {
      if (state.running && !paused) state.running = false; else start(record);
    } else if (action === 'reset') {
      record.state = INITIAL[id]();
      record.pulses.fill(0); record.time = 0;
      if (id === 'bells') stopAudio();
    } else if (action === 'progress' && ['scroll', 'ornament', 'boats'].includes(id)) {
      const next = clamp(value);
      if (id === 'ornament') {
        const now = globalThis.performance?.now?.() ?? Date.now();
        const elapsed = record.manualTime ? Math.max(.016, (now - record.manualTime) / 1000) : 0;
        const speed = elapsed ? Math.abs(next - state.progress) / elapsed : 0;
        if (elapsed && record.manualSpeed) {
          const variation = Math.abs(speed - record.manualSpeed) / Math.max(.15, record.manualSpeed);
          state.stitchQuality = clamp(state.stitchQuality * .9 + (1 - Math.min(1, variation * .3)) * .1, .35, 1);
        }
        record.manualTime = now; record.manualSpeed = speed;
      }
      state.running = false; state.progress = next;
      if (id === 'scroll') state.chapter = Math.min(2, Math.floor(next * 3));
    } else if (action === 'chapter' && id === 'scroll') {
      const chapter = Math.round(clamp(value, 0, 2));
      state.progress = SOURCE_SCROLL_CHAPTERS[chapter].at;
      state.chapter = chapter; state.running = false;
    } else if (action === 'direction' && id === 'scroll') {
      state.direction = Number(value) < 0 ? -1 : 1;
      start(record);
    } else if (action === 'theme' && id === 'well' && valid(SOURCE_WELL_THEMES, value)) {
      state.theme = value; state.steam = reduced || paused ? 0 : 1;
    } else if (action === 'theme' && id === 'bobbins' && valid(SOURCE_BOBBIN_THEMES, value)) {
      state.theme = value; state.brightness = .8;
    } else if (action === 'bell' && id === 'bells' && (value === 'all' || [0, 1, 2].includes(Number(value)))) {
      const index = value === 'all' ? 'all' : Number(value);
      releaseManualPause();
      state.struckIndex = index === 'all' ? -1 : index;
      state.pulse = 1;
      for (let i = 0; i < record.pulses.length; i++) {
        record.pulses[i] = index === 'all' || i % 3 === index ? 1 : 0;
      }
      if (trustedGesture) void playBellAudio(record, index);
    } else if (action === 'pattern' && id === 'ornament') {
      state.pattern = value == null ? (state.pattern + 1) % 3 : Math.round(clamp(value, 0, 2));
      state.progress = 0; state.stitchQuality = 1;
    } else if (action === 'city' && id === 'finale' && valid(SOURCE_CITIES, value)) {
      state.city = value; state.route = sourceJourney(state.city, state.interest);
    } else if (action === 'interest' && id === 'finale' && valid(SOURCE_INTERESTS, value)) {
      state.interest = value; state.route = sourceJourney(state.city, state.interest);
    } else if (action === 'daylight' && id === 'finale') {
      state.running = false; state.daylight = clamp(value);
      state.phase = Math.acos(clamp((state.daylight - .15) / .85) * 2 - 1) / TAU;
    } else if (action === 'layer' && id === 'map' && valid(SOURCE_MAP_LAYERS, value)) {
      state.layer = value;
    } else if (action === 'craft' && id === 'workshops' && valid(SOURCE_CRAFTS, value)) {
      state.craft = value; state.step = 0;
    } else if (action === 'step' && id === 'workshops' && state.craft === 'glass') {
      state.step = Math.round(clamp(value, 0, 3));
    } else handled = false;
    if (!handled) return false;
    notify(record, action, value);
    if (action === 'craft' && activeId === id) buildUI(record);
    return true;
  }

  function listen(element, event, handler) {
    element.addEventListener(event, handler);
    listeners.push(() => element.removeEventListener(event, handler));
  }

  function clearUI() {
    for (const remove of listeners) remove();
    listeners = []; ui = null;
    panel?.replaceChildren();
  }

  function makeElement(tag, className, text) {
    const element = mount.ownerDocument.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function row() {
    const element = makeElement('div', 'source-interactives__row');
    panel.append(element); return element;
  }

  function button(parent, label, action, value, options = {}) {
    const element = makeElement('button', options.primary ? 'source-interactives__primary' : '', label);
    element.type = 'button';
    if (options.pressed) element.setAttribute('aria-pressed', 'false');
    listen(element, 'click', event => perform(activeId, action, value, event.isTrusted));
    parent.append(element);
    ui.buttons.push({ element, action, value, label, ...options });
    return element;
  }

  function choices(items, action) {
    const parent = row(); parent.setAttribute('role', 'group');
    for (const item of items) button(parent, item.title, action, item.id, { pressed: true });
  }

  function range(label, action) {
    const wrapper = makeElement('label', 'source-interactives__label', label);
    const input = makeElement('input');
    input.type = 'range'; input.min = '0'; input.max = '100'; input.step = '1';
    input.setAttribute('aria-label', label);
    listen(input, 'input', event => perform(activeId, action, Number(input.value) / 100, event.isTrusted));
    wrapper.append(input); panel.append(wrapper);
    ui.range = { input, action };
  }

  function select(label, action, options) {
    const wrapper = makeElement('label', 'source-interactives__label', label);
    const element = makeElement('select');
    for (const option of options) {
      const child = makeElement('option', '', option.title);
      child.value = option.id; element.append(child);
    }
    listen(element, 'change', event => perform(activeId, action, element.value, event.isTrusted));
    wrapper.append(element); panel.append(wrapper);
    ui.selects.push({ element, action });
  }

  function playControl(label) {
    button(row(), label, 'toggle', undefined, { play: true, primary: true });
  }

  function buildUI(record) {
    if (!mount?.ownerDocument) return;
    if (!panel) {
      panel = makeElement('section', 'source-interactives');
      panel.setAttribute('aria-label', 'Управление установкой');
      mount.append(panel);
    }
    clearUI();
    if (record.id === 'boats' && !record.curve && !record.definition.capabilities.display) {
      panel.hidden = true; return;
    }
    panel.hidden = false;
    ui = { id: record.id, buttons: [], selects: [], range: null, status: null, route: null };
    if (record.definition.webDemo) panel.append(makeElement('p', 'source-interactives__hint', record.definition.webDemo));
    panel.append(makeElement('p', 'source-interactives__hint', record.definition.instruction));
    switch (record.id) {
      case 'scroll': {
        choices(SOURCE_SCROLL_CHAPTERS.map((chapter, index) => ({ id: index, title: chapter.title })), 'chapter');
        const controls = row();
        button(controls, 'Развернуть', 'direction', 1, { primary: true });
        button(controls, 'Свернуть', 'direction', -1);
        button(controls, 'Пауза', 'pause');
        range('Положение свитка', 'progress');
        break;
      }
      case 'well':
        choices(SOURCE_WELL_THEMES, 'theme');
        playControl('Оживить воду'); break;
      case 'boats':
        choices([{ id: 0, title: 'Начало пути' }, { id: .45, title: 'Волжский путь' },
          { id: .85, title: 'Продолжение' }], 'progress');
        playControl(record.curve ? 'Запустить суда' : 'Запустить речную историю'); break;
      case 'bells': {
        const controls = row();
        ['Малый звон', 'Средний звон', 'Большой звон'].forEach((name, index) => button(controls, name, 'bell', index));
        button(row(), 'Общий звон', 'bell', 'all', { primary: true });
        break;
      }
      case 'bobbins':
        choices(SOURCE_BOBBIN_THEMES, 'theme');
        playControl('Вращать бобины'); break;
      case 'yarn':
        playControl('Включить световую пряжу'); break;
      case 'ornament': {
        const controls = row();
        button(controls, 'Вышивать', 'toggle', undefined, { play: true, primary: true });
        button(controls, 'Сменить узор', 'pattern');
        button(controls, 'Заново', 'reset');
        range(record.rotors.length ? 'Поверните штурвал' : 'Стежки орнамента', 'progress');
        break;
      }
      case 'finale':
        select('Первый город маршрута', 'city', SOURCE_CITIES);
        choices(SOURCE_INTERESTS, 'interest');
        ui.route = makeElement('p', 'source-interactives__route');
        panel.append(ui.route);
        playControl('День и ночь');
        range('Свет панорамы', 'daylight'); break;
      case 'map':
        choices(SOURCE_MAP_LAYERS, 'layer'); break;
      case 'workshops':
        select('Ремесло', 'craft', SOURCE_CRAFTS);
        if (record.state.craft === 'glass') {
          choices(SOURCE_GLASS_STAGE_NAMES.map((title, index) => ({ id: index, title })), 'step');
        }
        break;
    }
    ui.status = makeElement('p', 'source-interactives__status');
    ui.status.setAttribute('role', 'status');
    ui.status.setAttribute('aria-live', 'polite');
    ui.status.setAttribute('aria-atomic', 'true');
    panel.append(ui.status);
    refreshUI();
  }

  function status(record) {
    const state = record.state;
    if (paused && state.running) return 'Движение приостановлено';
    if (record.id === 'scroll') return SOURCE_SCROLL_CHAPTERS[state.chapter].title + ' · ' + Math.round(state.progress * 100) + '%';
    if (record.id === 'ornament') return state.progress >= 1 ? 'Узор готов' :
      'Узор ' + (state.pattern + 1) + ' · ' + Math.round(state.progress * 100) + '%' +
      (state.stitchQuality < .75 ? ' · ведите ползунок плавнее' : '');
    if (record.id === 'bells') return record.soundStatus || 'Нажмите на голос колокола';
    if (record.id === 'well') return SOURCE_WELL_THEMES.find(item => item.id === state.theme)?.title || '';
    if (record.id === 'bobbins') return SOURCE_BOBBIN_THEMES.find(item => item.id === state.theme)?.title || '';
    if (record.id === 'finale') return state.daylight > .7 ? 'Дневная панорама' : state.daylight > .38 ? 'Сумерки' : 'Ночная панорама';
    if (record.id === 'boats' && !record.curve) return 'Медиарассказ на исходной композиции';
    if (record.id === 'workshops') return state.craft === 'glass' ? SOURCE_GLASS_STAGE_NAMES[state.step] : SOURCE_CRAFTS.find(item => item.id === state.craft)?.title || '';
    return state.running && !paused ? 'Движение включено' : 'Готово к запуску';
  }

  function refreshUI() {
    if (!ui) return;
    const record = records.get(ui.id);
    if (!record) return;
    const state = record.state;
    for (const item of ui.buttons) {
      if (item.play) item.element.textContent = state.running && !paused ? 'Пауза' : item.label;
      if (item.pressed) {
        const chosen = item.action === 'chapter' ? state.chapter : state[item.action];
        item.element.setAttribute('aria-pressed', String(chosen === item.value));
      }
      if (item.action === 'pause') item.element.disabled = !state.running || paused;
    }
    for (const item of ui.selects) item.element.value = state[item.action];
    if (ui.range && ui.range.input !== ui.range.input.ownerDocument.activeElement) {
      ui.range.input.value = String(Math.round(state[ui.range.action] * 100));
    }
    if (ui.route) ui.route.textContent = state.route.map(cityTitle).join(' → ');
    const message = status(record);
    if (ui.status) ui.status.setAttribute('aria-live', state.running && !paused ? 'off' : 'polite');
    if (ui.status && ui.status.textContent !== message) ui.status.textContent = message;
  }

  function update(delta) {
    if (disposed || paused) return false;
    const dt = clamp(delta, 0, .1);
    if (!dt) return false;
    frame++;
    displayElapsed += dt; uiElapsed += dt;
    const displayDue = displayElapsed >= 1 / 18;
    let changed = false;
    for (const record of records.values()) {
      const state = record.state;
      let moving = state.running;
      if (state.running) {
        record.time += dt;
        if (record.id === 'scroll') {
          const next = state.progress + state.direction * dt / 22;
          state.progress = clamp(next);
          if (next >= 1 || next <= 0) state.running = false;
          state.chapter = Math.min(2, Math.floor(state.progress * 3));
        } else if (record.id === 'well') state.phase = wrap(state.phase + dt / 18);
        else if (record.id === 'boats') state.progress = wrap(state.progress + dt / 42);
        else if (record.id === 'bobbins') {
          state.angle = (state.angle + dt * .25) % TAU;
          state.brightness = .48 + .24 * (.5 + .5 * Math.sin(record.time * .7));
        } else if (record.id === 'yarn') state.phase = wrap(state.phase + dt / 22);
        else if (record.id === 'ornament') {
          state.progress = clamp(state.progress + dt / 16);
          state.stitchQuality = Math.min(1, state.stitchQuality + dt * .05);
          if (state.progress >= 1) state.running = false;
        } else if (record.id === 'finale') {
          state.phase = wrap(state.phase + dt / 48);
          state.daylight = .15 + .85 * (.5 + .5 * Math.cos(state.phase * TAU));
        }
      }
      if (record.id === 'well' && state.steam > 0) {
        state.steam = Math.max(0, state.steam - dt / 1.3); moving = true;
      }
      if (record.id === 'bells' && state.pulse > 0) {
        const decay = Math.exp(-dt * 3.2);
        state.pulse *= decay;
        if (state.pulse < .003) state.pulse = 0;
        for (let i = 0; i < record.pulses.length; i++) {
          record.pulses[i] *= decay;
          if (record.pulses[i] < .003) record.pulses[i] = 0;
        }
        moving = true;
      }
      if (moving) {
        applyPose(record); record.displayDirty = true; changed = true;
      }
      if (record.displayDirty && (displayDue || !moving)) display(record);
    }
    if (displayDue) displayElapsed %= 1 / 18;
    if (uiElapsed >= .25) { refreshUI(); uiElapsed %= .25; }
    if (changed) onChange();
    return changed;
  }

  function setActive(id) {
    if (disposed) return false;
    if (id && typeof id === 'object') id = id.id;
    if (id && !records.has(id)) id = definitions.find(item => item.viewId === id)?.id || null;
    activeId = records.has(id) ? id : null;
    if (activeId) buildUI(records.get(activeId));
    else { clearUI(); if (panel) panel.hidden = true; }
    return Boolean(activeId);
  }

  function isAnimating() {
    if (disposed || paused) return false;
    for (const record of records.values()) {
      if (record.state.running || record.state.steam > 0 || record.state.pulse > 0) return true;
    }
    return false;
  }

  function findInteractive(object) {
    for (let current = object; current; current = current.parent) {
      const id = meshOwners.get(current) || current.userData?.interactiveId;
      if (records.has(id)) return records.get(id).definition;
    }
    return null;
  }

  function setPaused(value) {
    if (disposed) return;
    paused = Boolean(value);
    if (paused) stopAudio();
    refreshUI(); onChange();
  }

  function snapshot() {
    return {
      version: 1, activeId, paused, reducedMotion: reduced, disposed,
      frame, lastAction, warnings: [...warnings],
      audio: { created: Boolean(audio), state: audio?.state || 'not-created',
        voices: audioVoiceCount, playCount: audioPlayCount, type: 'synthesized' },
      installations: [...records.values()].map(record => ({
        id: record.id, zoneId: record.definition.zoneId, objectId: record.definition.objectId,
        capabilities: { ...record.definition.capabilities },
        parts: record.parts.length,
        sources: [...new Set(record.parts.map(part => part.sourceObject).filter(Boolean))],
        state: JSON.parse(JSON.stringify(record.state)),
        rotors: record.rotors.map(rotor => ({
          partId: rotor.partId, role: rotor.role,
          angle: rotor.angle, radius: rotor.radius || null, feedSign: rotor.feedSign || null,
          position: rotor.group.position.toArray(),
          quaternion: rotor.group.quaternion.toArray()
        }))
      }))
    };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clearUI(); panel?.remove(); panel = null;
    stopAudio();
    if (audio) { void audio.close().catch(() => {}); audio = null; }
    for (const record of records.values()) {
      for (const rotor of record.rotors) {
        rotor.group.position.copy(rotor.position);
        rotor.group.quaternion.copy(rotor.quaternion);
        rotor.group.scale.copy(rotor.scale);
      }
    }
    for (const item of materialRestores) {
      item.mesh.material = item.original;
      for (const material of item.owned) material.dispose();
    }
  }

  for (const record of records.values()) {
    applyPose(record); display(record);
  }
  return {
    definitions, setActive, update, isAnimating, setPaused, snapshot, findInteractive, dispose,
    invoke: (id, action, value) => perform(id, action, value, false)
  };
}
