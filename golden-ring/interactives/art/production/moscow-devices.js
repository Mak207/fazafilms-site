import { GLTFLoader } from '../../vendor/three-0.180/GLTFLoader.js';

const sources = new Map();
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const file = {loom:'moscow-loom-receiver', shadow:'moscow-shadow-carriage'};

function load(name) {
  if (!sources.has(name)) {
    const url = new URL('./' + name + '.glb', import.meta.url);
    sources.set(name, new GLTFLoader().loadAsync(url.href).then(gltf => gltf.scene));
  }
  return sources.get(name);
}

export function loadMoscowTemplates(id) {
  return Promise.all([load('moscow-guide'),load(file[id])]);
}

export async function loadLoomEntryShell() {
  return (await load('moscow-loom-entry-shell')).getObjectByName('LoomEntryShell');
}

// Only the ground shaft and bed change in length. Feet, end stops, screw
// sizes, enclosure thickness and switch lever keep their original proportions.
export function guide(template, length) {
  const model = template.clone(true);
  for (const name of ['Shaft','Bed']) model.getObjectByName(name).scale.x *= length / .48;
  model.getObjectByName('EndLeft').position.x = -length / 2;
  model.getObjectByName('EndRight').position.x = length / 2;
  return model;
}

export function receiver(template) {
  const root = template.clone(true);
  const indicators = Array.from({length:3}, (_, i) => {
    const top = root.getObjectByName('Signal' + i);
    const inside = root.getObjectByName('ServiceSignal' + i);
    const material = top.material.clone();
    top.material = inside.material = material;
    return material;
  });
  return {root, indicators, hood:root.getObjectByName('Hood'), trigger:root.getObjectByName('Trigger')};
}

function mount(id, templates, THREE) {
  const root = new THREE.Group();
  root.name = 'MoscowDevice_' + id;
  const receivers = [];
  if (id === 'loom') {
    for (const z of [-.066,.143]) {
      const rail = guide(templates[0], 3.57);
      rail.position.set(-.965,1.014,z);
      root.add(rail);
    }
    for (const [i,x] of [-2.79,.78].entries()) {
      const unit = receiver(templates[1]);
      unit.root.position.set(x,1.02,.06);
      unit.root.scale.setScalar(1.25);
      unit.root.rotation.y = i * Math.PI;
      receivers.push(unit);
      root.add(unit.root);
    }
  } else {
    for (const x of [-.91,-.75]) {
      const rail = guide(templates[0], 3.22);
      rail.position.set(x,.454,-.88);
      rail.rotation.y = -Math.PI / 2;
      root.add(rail);
    }
    const unit = receiver(templates[1]);
    unit.root.position.set(-.83,.534,-2.39);
    unit.root.scale.setScalar(1.16);
    unit.root.rotation.y = -Math.PI / 2;
    receivers.push(unit);
    root.add(unit.root);
  }
  root.traverse(node => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
  return {root, receivers};
}

export function createMoscowDevices(scene, THREE) {
  const stages = new Map(), loading = new Set();
  let active, disposed = false;
  return {
    sync(state) {
      const {id, hardware, detailView} = state;
      if (active) active.root.visible = false;
      active = stages.get(id);
      if (!file[id]) return {guide:false, device:false};
      if (!active && !loading.has(id) && !disposed) {
        loading.add(id);
        loadMoscowTemplates(id).then(templates => {
          if (disposed) return;
          const stage = mount(id, templates, THREE);
          stage.root.visible = false;
          scene.add(stage.root);
          stages.set(id, stage);
          window.dispatchEvent(new Event('ringtexture'));
        }).catch(error => console.warn('Exhibit device remained in the basic view', error));
      }
      if (!active) return {guide:false, device:false};
      active.root.visible = true;
      const progress = clamp(Number(state.progress) || 0, 0, 3);
      const leg = Math.min(2, Math.floor(progress)), fraction = progress - leg;
      const travel = leg % 2 ? 1 - fraction : fraction;
      const distance = clamp(Number.isFinite(state.distance) ? state.distance : progress / 3, 0, 1);
      const service = state.open ?? Boolean(hardware || detailView);
      const mask = id === 'loom' ? (1 << Math.floor(progress + .00001)) - 1 : 1 << Math.min(2, Math.floor(3 * distance));
      active.receivers.forEach((unit, i) => {
        unit.hood.visible = !service;
        if (unit.trigger) unit.trigger.rotation.z = -.17 * clamp(1 - Math.abs(travel-i)/.07,0,1);
        if (id === 'shadow') unit.root.position.z = -2.39 + distance * 1.88;
        unit.indicators.forEach((mat, bit) => {
          const on = mask & (1 << bit);
          mat.color.set(on ? 0xefb668 : 0x394446);
          mat.emissive.set(on ? 0xffa82c : 0x000000);
          mat.emissiveIntensity = on ? 1.05 : 0;
        });
      });
      return {guide:true,device:true,service,mask};
    },
    dispose() {
      disposed = true;
      for (const {root,receivers} of stages.values()) {
        scene.remove(root);
        for (const unit of receivers) for (const mat of unit.indicators) mat.dispose();
      }
      stages.clear(); active = undefined;
    }
  };
}
