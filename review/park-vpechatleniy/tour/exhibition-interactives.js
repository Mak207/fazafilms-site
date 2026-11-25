import * as THREE from 'three';
import {createLiveMedia} from './live-media.js?v=park-exhibition-20261125-r2';

// Metres, Y up. These are controllable exhibition assemblies; their provenance
// is procedural Three.js geometry, never an ungenerated Hitem3D asset.
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function makeKit(id, title, { parent = null, position = [0, 0, 0], rotationY = 0, onChange = () => {}, canvasFactory, id: customId } = {}) {
  id = customId || id;
  const root = new THREE.Group(); root.name = title;
  root.position.fromArray(position); root.rotation.y = rotationY;
  root.userData = { installationId: id, exhibitName: title, proceduralExhibition: true, workingLayout: true };
  parent?.add(root);
  const geometries = new Set(), materials = new Set(), textures = new Set(), colliders = [], actions = new Map();
  const targets = [], screens = []; let disposed = false;
  const geometry = value => { geometries.add(value); return value; };
  const material = value => { materials.add(value); return value; };
  const standard = (color, extra = {}) => material(new THREE.MeshStandardMaterial({ color, roughness: .62, ...extra }));
  const basic = (color, extra = {}) => material(new THREE.MeshBasicMaterial({ color, ...extra }));
  const glass = material(new THREE.MeshPhysicalMaterial({ color: 0xd9f2f0, roughness: .13, metalness: .05,
    transparent: true, opacity: .16, side: THREE.DoubleSide, depthWrite: false }));
  const mesh = (geo, mat, p, owner = root, name = '') => {
    const node = new THREE.Mesh(geometry(geo), mat); if (p) node.position.fromArray(p);
    node.name = name; node.receiveShadow = true; owner.add(node); return node;
  };
  const box = (size, p, mat, owner = root, name = '') => mesh(new THREE.BoxGeometry(...size), mat, p, owner, name);
  const cyl = (top, bottom, height, p, mat, owner = root, open = false, sides = 24) =>
    mesh(new THREE.CylinderGeometry(top, bottom, height, sides, 1, open), mat, p, owner);
  const tube = (a, b, radius, mat, owner = root) => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), direction = end.clone().sub(start);
    const node = cyl(radius, radius, direction.length(), start.clone().add(end).multiplyScalar(.5).toArray(), mat, owner, false, 10);
    node.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()); return node;
  };
  function collider(name, bounds, owner = root, kind = 'exhibit') {
    const part = new THREE.Group(); part.name = title + ' · ' + name; owner.add(part);
    part.userData = { installationId: id, instanceId: id + ':' + name, exhibitId: id,
      exhibitName: title, editorVisible: true, floating: false,
      collisionBounds: { min: bounds[0], max: bounds[1] }, kind };
    colliders.push(part); return part;
  }
  function action(node, name, callback) {
    actions.set(name, callback); targets.push(node);
    node.traverse(child => { child.userData.installationAction = name; child.userData.installationId = id; });
    return node;
  }
  function surface(width = 1024, height = 512) {
    let canvas;
    if (canvasFactory) canvas = canvasFactory(width, height);
    else if (typeof document !== 'undefined') { canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; }
    const context = canvas?.getContext?.('2d');
    if (!context) return { canvas: null, context: null, texture: null };
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter; texture.generateMipmaps = false;
    textures.add(texture); return { canvas, context, texture };
  }
  function screen(size, p, draw, owner = root, options = {}) {
    const s = surface(options.resolution?.[0] || 1024, options.resolution?.[1] || 512);
    const group = new THREE.Group(); group.position.fromArray(p); owner.add(group);
    group.rotation.y = options.rotationY || 0;
    box([size[0] + .08, size[1] + .08, .09], [0, 0, -.025], standard(0x1b2429), group);
    const face = mesh(new THREE.PlaneGeometry(...size), basic(0xffffff, { map: s.texture, color: s.texture ? 0xffffff : 0x355f71,
      toneMapped: false, side: THREE.FrontSide }), [0, 0, .024], group);
    const item = { ...s, group, face, draw, size, redraw(time = 0) {
      if (!s.context) return;
      draw(s.context, s.canvas.width, s.canvas.height, time); s.texture.needsUpdate = true;
    } };
    item.redraw(); screens.push(item); return item;
  }
  function label(text, size, p, owner = root, { color = '#f8eddd', background = '#172d35', rotationY = 0 } = {}) {
    return screen(size, p, (ctx, w, h) => {
      ctx.fillStyle = background; ctx.fillRect(0, 0, w, h); ctx.fillStyle = color;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `600 ${Math.floor(h * .35)}px sans-serif`;
      ctx.fillText(text, w / 2, h / 2, w * .93);
    }, owner, { rotationY, resolution: [1024, 160] });
  }
  function obstacles() {
    if (!root.visible) return [];
    root.updateWorldMatrix(true, true);
    return colliders.filter(part => {
      for (let node = part; node; node = node.parent) if (!node.visible || node.userData.editorVisible === false) return false;
      return true;
    }).map(part => {
      const b = new THREE.Box3(new THREE.Vector3(...part.userData.collisionBounds.min), new THREE.Vector3(...part.userData.collisionBounds.max));
      const size = b.getSize(new THREE.Vector3()), center = b.getCenter(new THREE.Vector3()).applyMatrix4(part.matrixWorld);
      const x = new THREE.Vector3().setFromMatrixColumn(part.matrixWorld, 0), y = new THREE.Vector3().setFromMatrixColumn(part.matrixWorld, 1), z = new THREE.Vector3().setFromMatrixColumn(part.matrixWorld, 2);
      const upright = Math.abs(x.y) < 1e-7 && Math.abs(z.y) < 1e-7 && Math.hypot(y.x, y.z) < 1e-7 && Math.abs(x.dot(z)) < 1e-7;
      if (!upright) {
        const world = b.applyMatrix4(part.matrixWorld); world.getCenter(center); world.getSize(size);
        return { id: part.userData.instanceId, objectId: id, kind: part.userData.kind, shape: 'obb', centerXZ: [center.x, center.z],
          halfSizeXZ: [size.x / 2, size.z / 2], rotationY: 0, minY: world.min.y, maxY: world.max.y, conservativeTransform: true };
      }
      return { id: part.userData.instanceId, objectId: id, kind: part.userData.kind, shape: 'obb', centerXZ: [center.x, center.z],
        halfSizeXZ: [size.x * x.length() / 2, size.z * z.length() / 2], rotationY: Math.atan2(-x.z, x.x),
        minY: center.y - size.y * y.length() / 2, maxY: center.y + size.y * y.length() / 2 };
    });
  }
  return { root, geometry, material, standard, basic, glass, mesh, box, cyl, tube, collider, action, surface, screen, label, screens,
    getObstacles: obstacles, getCollisionRoots: () => colliders.slice(), pickTargets: targets,
    getCollisionParts() {
      root.updateWorldMatrix(true, true);
      const inverse = root.matrixWorld.clone().invert();
      return colliders.filter(part => { let node=part; while(node&&node!==root)node=node.parent; return node===root; }).map(part => {
        const b = new THREE.Box3(new THREE.Vector3(...part.userData.collisionBounds.min), new THREE.Vector3(...part.userData.collisionBounds.max));
        b.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, part.matrixWorld));
        return { id: part.userData.instanceId, min: b.min.toArray(), max: b.max.toArray(), kind: part.userData.kind };
      });
    },
    interact(name, ...args) { const callback = actions.get(name); if (!callback || disposed) return false; callback(...args); onChange(); return true; },
    changed: onChange,
    setSection(enabled, plane) { for (const mat of materials) { mat.clippingPlanes = enabled && plane ? [plane] : []; mat.needsUpdate = true; } },
    getBounds() { root.updateWorldMatrix(true, true); return new THREE.Box3().setFromObject(root); },
    dispose() { if (disposed) return; disposed = true; root.removeFromParent();
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); actions.clear(); },
  };
}

function seedRandom(seed) {
  let state = seed >>> 0;
  return () => { state = (1664525 * state + 1013904223) >>> 0; return state / 4294967296; };
}

/** Three clear physical envelopes, separate solid piles, and individual falling kernels. */
export function createGrainSilos(options = {}) {
  const kit = makeKit('grain-silos', 'Прозрачные силосы · движение зерна', options);
  const { root, standard, basic, box, cyl, tube, collider, action } = kit;
  // The limiting roof triangle over the complete cylinder/return-pipe envelope
  // is at Y=30.3458336. The floor is Y=13.20: 16.89m leaves 0.2558m clear.
  // Only the storage cylinder is extended; kernels, hopper and controls retain
  // their physical sizes. The original CAD is never changed to make this fit.
  const heightMetres = clamp(Number(options.heightMetres) || 16.89, 5.0, 16.89);
  const cylinderBottom = 1.26, cylinderTop = heightMetres - .46;
  const cylinderHeight = cylinderTop - cylinderBottom, returnTop = heightMetres - .09;
  const clearance = { floorY:13.2, firstRoofY:30.345833587646485,
    designHeightMetres:heightMetres, topWorldY:13.2 + heightMetres,
    roofClearanceMetres:30.345833587646485 - 13.2 - heightMetres,
    method:'Full conservative cylinder and return-pipe OBBs against all 2,927,007 CAD triangles',
    evidence:'assets/zones/physical-revisions-qa.json' };
  root.userData.heightFit = clearance;
  const metal = standard(0x71848c, { metalness: .7, roughness: .34 }), ivory = standard(0xe6e2d7);
  const grainMat = standard(0xc99b48, { roughness: .91 }), dark = standard(0x263a3e), light = basic(0xffcf75, { toneMapped: false });
  const grainCanvas=document.createElement('canvas');grainCanvas.width=grainCanvas.height=512;
  const grainContext=grainCanvas.getContext('2d'),grainRandom=seedRandom(4108);
  grainContext.fillStyle='#ab7a32';grainContext.fillRect(0,0,512,512);
  for(let i=0;i<4200;i++){
    const x=grainRandom()*512,y=grainRandom()*512,angle=grainRandom()*TAU;
    grainContext.save();grainContext.translate(x,y);grainContext.rotate(angle);
    const shade=172+Math.round(grainRandom()*65);grainContext.fillStyle=`rgb(${shade},${Math.round(shade*.8)},${Math.round(shade*.43)})`;
    grainContext.beginPath();grainContext.ellipse(0,0,1.8+grainRandom()*1.2,4+grainRandom()*2,0,0,TAU);grainContext.fill();
    grainContext.strokeStyle='rgba(80,48,15,.3)';grainContext.lineWidth=.65;grainContext.beginPath();grainContext.moveTo(0,-3);grainContext.lineTo(.3,3);grainContext.stroke();grainContext.restore();
  }
  const grainTexture=new THREE.CanvasTexture(grainCanvas);grainTexture.colorSpace=THREE.SRGBColorSpace;
  grainTexture.wrapS=grainTexture.wrapT=THREE.RepeatWrapping;grainTexture.repeat.set(2,2);grainTexture.anisotropy=4;
  const pileMaterial=standard(0xffffff,{map:grainTexture,bumpMap:grainTexture,bumpScale:.008,roughness:.96});
  box([7.5, .07, 3.1], [0, .035, 0], standard(0x8e7d5c));
  const count = 3, fallingPerSilo = 144, pilePerSilo = 900, silos = [];
  const kernelGeo = kit.geometry(new THREE.SphereGeometry(1, 5, 4));
  const dummy = new THREE.Object3D(), random = seedRandom(20261124);
  let elapsed = 0, flowing = true, intensity = 1, lastPileStep = -1, lastTextStep = -1;
  for (let i = 0; i < count; i++) {
    const x = (i - 1) * 2.35;
    const assembly = new THREE.Group(); assembly.position.x = x; assembly.name = `Прозрачный силос ${i + 1}`; root.add(assembly);
    collider(`silo-${i + 1}`, [[-.94, 0, -.94], [.94, heightMetres, .94]], assembly);
    // Cylindrical acrylic wall and a visible lower conical hopper are separate parts.
    cyl(.86, .86, cylinderHeight, [0, cylinderBottom + cylinderHeight / 2, 0], kit.glass, assembly, true, 48);
    cyl(.86, .13, .79, [0, .865, 0], kit.glass, assembly, true, 48);
    for (const y of Array.from({length:9},(_,j)=>cylinderBottom+cylinderHeight*j/8)) {
      const ring = kit.mesh(new THREE.TorusGeometry(.872, .026, 6, 48), metal, [0, y, 0], assembly); ring.rotation.x = Math.PI / 2;
    }
    cyl(.9, .9, .1, [0, cylinderTop + .06, 0], ivory, assembly);
    for (const angle of [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4]) {
      const px = Math.cos(angle) * .73, pz = Math.sin(angle) * .73;
      tube([px, .08, pz], [px, 1.4, pz], .04, metal, assembly);
    }
    cyl(.09, .09, .30, [0, cylinderTop + .20, 0], metal, assembly);
    tube([0, .32, 0], [0, .32, -1.03], .09, metal, assembly);
    tube([0, .32, -1.03], [0, returnTop, -1.03], .065, metal, assembly);
    tube([0, returnTop, -1.03], [0, returnTop, 0], .065, metal, assembly);
    collider(`silo-${i+1}-return`,[[-.16,.23,-1.12],[.16,heightMetres,-.9]],assembly);
    cyl(.8,.13,.72,[0,.89,0],pileMaterial,assembly,false,48);
    const pile = cyl(.8, .8, 1, [0, 1.76, 0], pileMaterial, assembly, false, 48);
    const mound = cyl(.015, .79, .28, [0, 2.4, 0], pileMaterial, assembly, false, 48);
    const falling = new THREE.InstancedMesh(kernelGeo, grainMat, fallingPerSilo);
    falling.instanceMatrix.setUsage(THREE.DynamicDrawUsage); falling.frustumCulled = false; falling.name = 'Падающие отдельные зёрна'; assembly.add(falling);
    const surface = new THREE.InstancedMesh(kernelGeo, grainMat, pilePerSilo);
    surface.instanceMatrix.setUsage(THREE.DynamicDrawUsage); surface.frustumCulled = false; surface.name = 'Отдельные зёрна на поверхности насыпи'; assembly.add(surface);
    const phases = Array.from({ length: fallingPerSilo }, () => ({ p: random(), angle: random() * TAU, r: Math.sqrt(random()) * .23,
      size: .009 + random() * .004, spin: random() * TAU }));
    const pileSeeds = Array.from({ length: pilePerSilo }, () => ({ r: Math.sqrt(random()) * .77, angle: random() * TAU,
      yaw: random() * TAU, size: .009 + random() * .004 }));
    kit.label(['ПШЕНИЦА', 'ЯЧМЕНЬ', 'ОВЁС'][i], [1.17, .24], [0, 1, .96], assembly, { background: '#2a403f' });
    silos.push({ assembly, pile, mound, falling, surface, phases, pileSeeds, level: 1.6 });
  }
  const controls = new THREE.Group(); controls.position.set(0, 0, 1.85); root.add(controls);
  collider('control', [[-.67, 0, -.25], [.67, 1.2, .25]], controls);
  box([.82, .95, .35], [0, .475, 0], dark, controls);
  const controlScreen = kit.screen([1.15, .58], [0, 1.17, .1], (ctx, w, h) => {
    ctx.fillStyle = '#102b31'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#f6deae';
    ctx.font = '600 48px sans-serif'; ctx.fillText('ЖИВОЕ ЗЕРНО', 52, 84);
    ctx.fillStyle = '#ffffff'; ctx.font = '34px sans-serif'; ctx.fillText(flowing ? 'Зерно движется' : 'Поток на паузе', 52, 157);
    ctx.fillStyle = flowing ? '#75d9ab' : '#e9bc69'; ctx.fillRect(52, 198, 390, 88);
    ctx.fillStyle = '#112d31'; ctx.font = '600 36px sans-serif'; ctx.fillText(flowing ? 'ПРИОСТАНОВИТЬ' : 'ЗАПУСТИТЬ', 78, 256);
    ctx.fillStyle = '#a9c5c6'; ctx.font = '27px sans-serif'; ctx.fillText('Нажмите на панель', 52, 354);
    ctx.fillText('Подача · насыпь · возврат', 52, 418);
    for(let i=0;i<silos.length;i++){
      const y=205+i*70,level=silos[i].level;
      ctx.fillStyle='#a9c5c6';ctx.font='25px sans-serif';ctx.fillText(['Пшеница','Ячмень','Овёс'][i]+' · '+level.toFixed(1)+' м',535,y,430);
      ctx.fillStyle='#26464b';ctx.fillRect(535,y+12,420,15);ctx.fillStyle='#d2b568';ctx.fillRect(535,y+12,420*clamp(level/cylinderTop,0,1),15);
    }
    ctx.fillStyle='#284a50';ctx.fillRect(535,439,420,4);ctx.fillStyle=flowing?'#75d9ab':'#e9bc69';ctx.beginPath();ctx.arc(535+(elapsed*.18%1)*420,441,9,0,TAU);ctx.fill();
  }, controls);
  controlScreen.group.rotation.x = -.22;
  action(controlScreen.group, 'grain-toggle', () => { flowing = !flowing; controlScreen.redraw(); });
  kit.label('ЭЛЕВАТОР · ЗЕРНО В ДВИЖЕНИИ', [5.6, .39], [0, 2.65, 1.03]);
  function update(delta) {
    if (!Number.isFinite(delta) || delta < 0) return false;
    if (flowing) elapsed += Math.min(delta, .12) * intensity;
    const step = Math.floor(elapsed * 12), pileChanged = step !== lastPileStep;
    for (let index = 0; index < silos.length; index++) {
      const silo = silos[index];
      // Continuous closed-loop demonstration: the return pipe regulates the bed.
      silo.level = cylinderBottom + cylinderHeight * .29 + Math.sin(elapsed * .1 + index * .7) * .28;
      const peak = silo.level + .27, top = cylinderTop - .06, duration = Math.sqrt(2 * (top - peak) / 9.81);
      for (let i = 0; i < fallingPerSilo; i++) {
        const grain = silo.phases[i], t = ((elapsed / duration + grain.p) % 1) * duration;
        dummy.position.set(Math.cos(grain.angle) * grain.r, top - 4.905 * t * t, Math.sin(grain.angle) * grain.r);
        dummy.rotation.set(grain.spin + elapsed * 1.3, grain.angle + elapsed * .7, grain.spin);
        dummy.scale.set(grain.size * .48, grain.size, grain.size * .36); dummy.updateMatrix();
        silo.falling.setMatrixAt(i, dummy.matrix);
      }
      silo.falling.instanceMatrix.needsUpdate = true;
      if (pileChanged) {
        const depth = silo.level - 1.26;
        silo.pile.scale.y = depth; silo.pile.position.y = 1.26 + depth / 2;
        silo.mound.position.y = silo.level + .14;
        for (let i = 0; i < pilePerSilo; i++) {
          const grain = silo.pileSeeds[i];
          dummy.position.set(Math.cos(grain.angle) * grain.r, silo.level + .27 * (1 - grain.r / .79) + grain.size * .5, Math.sin(grain.angle) * grain.r);
          dummy.rotation.set(Math.PI / 2, grain.yaw, grain.angle); dummy.scale.set(grain.size * .48, grain.size, grain.size * .36); dummy.updateMatrix();
          silo.surface.setMatrixAt(i, dummy.matrix);
        }
        silo.surface.instanceMatrix.needsUpdate = true;
      }
    }
    lastPileStep = step;
    if (step !== lastTextStep && step % 12 === 0) { controlScreen.redraw(); lastTextStep = step; }
    return flowing && root.visible;
  }
  update(0);
  return { ...kit, update, setFlowing(value) { flowing = Boolean(value); controlScreen.redraw(); kit.changed(); },
    setIntensity(value) { if (Number.isFinite(value)) intensity = clamp(value, .2, 2); },
    getEquipmentParts:()=>[{sourceId:'grain-control',root:controls}],
    getMediaEntries:()=>[{id:'grain-control',name:'Живое зерно · пульт',width:1.15,height:.58,theme:'grain',face:controlScreen.face,
      interact(action){if(action==='toggle')flowing=!flowing;else if(action==='reset'){elapsed=0;flowing=true;}else intensity=intensity<1.5?2:1;controlScreen.redraw();kit.changed();return true;},
      getState:()=>({theme:'grain',playing:flowing,animated:true,kind:'interactive-grain-control',elapsed,intensity})}],
    getState: () => ({ id: root.userData.installationId, flowing, elapsed, intensity, silos: count, fallingKernels: count * fallingPerSilo,
      surfaceKernels: count * pilePerSilo, floorFootprintMetres: [7.5, 4.2], heightMetres,
      heightFit:clearance, controlHeightMetres:1.17, individualKernelSizePreserved:true,
      provenance: 'procedural-threejs', physics: 'gravity-based looping particles; illustrative flow, not a process-engineering calculation',
      actions: ['grain-toggle'], levels: silos.map(s => s.level) }) };
}

function drawFlight(ctx, w, h, state, time) {
  ctx.save(); ctx.fillStyle = '#87bbd2'; ctx.fillRect(0, 0, w, h);
  ctx.translate(w / 2, h * .47 + state.pitch * h * .3); ctx.rotate(-state.bank);
  const ground = ctx.createLinearGradient(0, 0, 0, h); ground.addColorStop(0, '#60855c'); ground.addColorStop(1, '#c1ad68');
  ctx.fillStyle = ground; ctx.fillRect(-w * 2, 0, w * 4, h * 3);
  ctx.fillStyle = '#76a39e'; ctx.beginPath(); ctx.moveTo(-w * 2, 0); ctx.lineTo(-w * .45, 0); ctx.lineTo(w * .3, h * 2); ctx.lineTo(-w * 2, h * 2); ctx.fill();
  const vanishing = Math.sin(state.heading) * w * .18;
  ctx.fillStyle = '#454d50'; ctx.beginPath(); ctx.moveTo(vanishing - 15, 0); ctx.lineTo(vanishing + 15, 0); ctx.lineTo(w * .33, h * 2); ctx.lineTo(-w * .33, h * 2); ctx.fill();
  ctx.strokeStyle = '#e7e3d4'; ctx.lineWidth = 3;
  for (let i = 0; i < 12; i++) { const q = ((i / 12 + time * .09) % 1) ** 2, y = q * h * 1.8;
    ctx.beginPath(); ctx.moveTo(vanishing * (1 - q), y); ctx.lineTo(vanishing * (1 - q), y + 6 + q * 36); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = 'rgba(6,23,35,.72)'; ctx.fillRect(0, 0, w, h * .14); ctx.fillRect(0, h * .83, w, h * .17);
  ctx.fillStyle = '#d8f4f1'; ctx.font = `600 ${Math.floor(h * .056)}px sans-serif`;
  ctx.fillText('МС-21 · ПОЛЁТ', w * .035, h * .09);
  ctx.font = `${Math.floor(h * .045)}px sans-serif`;
  ctx.fillText(state.active ? 'ПОЛЁТ ИДЁТ' : 'ГОТОВ К ЗАПУСКУ', w * .62, h * .09);
  ctx.fillText(`Высота ${Math.round(850 + state.pitch * 360 + Math.sin(time * .07) * 80)} м`, w * .035, h * .93);
  ctx.fillText(`Курс ${((Math.round(state.heading * 180 / Math.PI) % 360) + 360) % 360}°`, w * .48, h * .93);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.beginPath();
  ctx.moveTo(w * .43, h * .5); ctx.lineTo(w * .485, h * .5); ctx.lineTo(w * .5, h * .52); ctx.lineTo(w * .515, h * .5); ctx.lineTo(w * .57, h * .5); ctx.stroke();
}

/** Two visitors can try a separate human-scale flight station beside the aircraft. */
export function createFlightCockpits(options = {}) {
  const kit = makeKit('mc21-cockpits', 'МС-21 · интерактивные кабины', options);
  const { root, standard, basic, box, cyl, tube, collider, action } = kit;
  const body = standard(0xe1e5e3, { roughness: .37 }), navy = standard(0x142a38), seatMat = standard(0x40546a), frame = standard(0x8ca1ae, { metalness: .55 });
  const states = [], stations = [], cabinCount = options.count === 1 ? 1 : 2;
  const platformWidth = 4.65, platformDepth = 6.05, platformHeight = .06, cabinSpacing = 6.45;
  // X04_COCKPIT web, SHA256 1d12198f9089d1dcd0f2a15027c74a3e856934ffdaa2e25078f40b4d6ee68d8d.
  // Measured in the uniformly fitted 2.20m-high body: nose -Z, open entry +Z.
  // The 45mm inward offset is already included; preserve the existing centre frame.
  const windshieldQuads = [[[-0.7124148755959459,1.9637883013565638,-0.06354457754318947],[-0.16613781150351592,1.9707953187163887,-0.14519390705013308],[-0.16314381006820655,1.5763367485249833,-0.5135652476336102],[-0.8065393922353892,1.5873593586463655,-0.39733003689131147]],[[0.18197607313931652,1.9704484710349532,-0.14115226148598742],[0.7124609844847756,1.9637989020568545,-0.06366810229367863],[0.8060690084988207,1.5874833732951092,-0.39602228231475095],[0.17936726991642082,1.5764500658488678,-0.5123702980819677]]];
  const windshieldUVs = [[0,1,0.5,1,0.5,0,0,0],[0.5,1,1,1,1,0,0.5,0]];
  let elapsed = 0, lastRedraw = -1, externalShells = 0;
  for (let index = 0; index < cabinCount; index++) {
    const cabin = new THREE.Group(); cabin.position.x = (index - (cabinCount - 1) / 2) * cabinSpacing;
    root.add(cabin); cabin.name = `Кабина МС-21 ${index + 1}`;
    const state = { active: true, bank: 0, pitch: 0, heading: 0, elapsed: 0 }; states.push(state);
    const externalSource = options.shellFactory?.(index) || options.shells?.[index] || options.shell;
    let external = null, flight;
    // Source ownership stays with its loader: clones share GPU resources.
    if (externalSource?.isObject3D) {
      const candidate = externalSource.clone(true); candidate.updateWorldMatrix(true, true);
      const bounds = new THREE.Box3().setFromObject(candidate, true), size = bounds.getSize(new THREE.Vector3());
      if (!bounds.isEmpty() && Number.isFinite(size.y) && size.y > 0) {
        external = candidate; external.name = 'МС-21 · корпус и штатный интерьер Hitem3D';
        const factor = 2.2 / size.y, center = bounds.getCenter(new THREE.Vector3());
        const fitted = new THREE.Group(); fitted.name = 'МС-21 · корпус высотой 2,20 м';
        fitted.scale.setScalar(factor); fitted.position.set(-center.x * factor, -bounds.min.y * factor, -center.z * factor);
        fitted.add(external);
        const assembly = new THREE.Group(); assembly.name = 'МС-21 · корпус и проекции'; assembly.position.y = platformHeight;
        if (options.shellOffset) assembly.position.add(new THREE.Vector3(...options.shellOffset));
        if (Number.isFinite(options.shellRotationY)) assembly.rotation.y = options.shellRotationY;
        assembly.add(fitted); cabin.add(assembly); externalShells++;
        assembly.userData = { sourceAsset: 'X04_COCKPIT', bodyHeightMetres: 2.2, entranceLocalAxis: '+Z', noseLocalAxis: '-Z' };
        // The supplied GLB already includes both seats, dashboard and centre pedestal.
        // Individual approximate collision envelopes leave the rear and centre aisle open.
        for (const sign of [-1, 1]) {
          collider(`cabin-${index + 1}-side-${sign}`, [[sign * 2.14 - .065, 0, -1.28], [sign * 2.14 + .065, 1.7, 2.88]], assembly);
          const x = sign * .93;
          collider(`cabin-${index + 1}-seat-${sign < 0 ? 1 : 2}`, [[x - .4, .12, .53], [x + .4, 1.53, 1.86]], assembly);
        }
        collider(`cabin-${index + 1}-nose`, [[-1.7, 0, -2.883], [1.7, 1.45, -.75]], assembly);
        collider(`cabin-${index + 1}-console`, [[-1.65, .12, -.75], [1.65, 1.48, .31]], assembly);
        collider(`cabin-${index + 1}-pedestal`, [[-.3, .12, .31], [.3, 1.02, .95]], assembly);
        const s = kit.surface(1024, 512), projection = new THREE.Group(); projection.name = 'Полёт · две проекции в стёклах'; assembly.add(projection);
        const projectionMaterial = basic(s.texture ? 0xffffff : 0x355f71, { map: s.texture, toneMapped: false, side: THREE.DoubleSide, depthTest: true });
        const faces = windshieldQuads.map((corners, panelIndex) => {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(corners.flat(), 3));
          geometry.setAttribute('uv', new THREE.Float32BufferAttribute(windshieldUVs[panelIndex], 2));
          geometry.setIndex([0, 2, 1, 0, 3, 2]); geometry.computeVertexNormals();
          return kit.mesh(geometry, projectionMaterial, null, projection, panelIndex ? 'Правая полётная проекция' : 'Левая полётная проекция');
        });
        flight = { ...s, group: projection, face: faces[0], faces, size: [1.62, .55], redraw() {
          if (!s.context) return;
          drawFlight(s.context, s.canvas.width, s.canvas.height, state, state.elapsed); s.texture.needsUpdate = true;
        } };
        flight.redraw(); kit.screens.push(flight);
        const toggle = () => { state.active = !state.active; flight.redraw(); };
        action(projection, `flight-${index + 1}-toggle`, toggle);
        // Four controls beside the rear entry keep the central boarding route clear.
        const controls = new THREE.Group(); controls.name = 'Управление полётом у входа'; controls.position.set(-1.7, 0, 2.98); assembly.add(controls);
        box([.055, 1.77, .055], [0, .89, -.04], frame, controls);
        collider(`cabin-${index + 1}-entry-controls`, [[-.4, 0, -.09], [.4, 1.92, .045]], controls);
        const controlsSpec = [
          ['toggle', 'ПОЛЁТ · ПУСК / ПАУЗА', toggle],
          ['left', 'КРЕН ВЛЕВО', () => { state.active = true; state.bank = clamp(state.bank - .12, -.45, .45); flight.redraw(); }],
          ['right', 'КРЕН ВПРАВО', () => { state.active = true; state.bank = clamp(state.bank + .12, -.45, .45); flight.redraw(); }],
          ['reset', 'СБРОС', () => { Object.assign(state, { active: false, bank: 0, pitch: 0, heading: 0, elapsed: 0 }); flight.redraw(); }],
        ];
        controlsSpec.forEach(([name, text, callback], controlIndex) => {
          const button = kit.label(text, [.68, .17], [0, 1.73 - controlIndex * .24, 0], controls, { background: '#163a48' });
          action(button.group, `flight-${index + 1}-${name}`, callback);
        });
        kit.label('МС-21 · КАБИНА ' + (options.stationNumber || index + 1), [1.17, .22], [0, 2.04, 0], controls);
      }
    }
    box([platformWidth, platformHeight, platformDepth], [0, platformHeight / 2, 0], standard(0x83949a), cabin, 'Платформа кабины');
    if (!external) {
      // Clear rear entry: physical sidewalls, console and chairs get individual obstacles.
      for (const sign of [-1, 1]) {
        const fallbackWall = box([.12, 1.35, 3.35], [sign * 1.48, .735, -.35], body, cabin);
        collider(`cabin-${index + 1}-side-${sign}`, [[sign * 1.48 - .1, 0, -2.03], [sign * 1.48 + .1, 1.45, 1.33]], cabin);
        tube([sign * 1.47, 1.4, .95], [sign * 1.27, 2.32, -1.48], .045, frame, cabin);
        tube([sign * 1.27, 2.32, -1.48], [sign * .58, 2.56, -1.63], .045, frame, cabin);
      }
      tube([-.58, 2.56, -1.63], [.58, 2.56, -1.63], .045, frame, cabin);
      box([2.89, .82, .32], [0, .95, -1.25], navy, cabin);
      collider(`cabin-${index + 1}-console`, [[-1.46, 0, -1.55], [1.46, 1.42, -.95]], cabin);
      flight = kit.screen([2.68, 1.08], [0, 1.95, -1.43], (ctx, w, h) => drawFlight(ctx, w, h, state, state.elapsed), cabin);
      action(flight.group, `flight-${index + 1}-toggle`, () => { state.active = !state.active; flight.redraw(); });
      for (const seatX of [-.64, .64]) {
        const chair = new THREE.Group(); chair.position.set(seatX, 0, .31); cabin.add(chair);
        cyl(.13, .2, .42, [0, .27, 0], frame, chair);
        box([.55, .15, .56], [0, .52, 0], seatMat, chair);
        const back = box([.55, .71, .13], [0, .93, .25], seatMat, chair); back.rotation.x = -.08;
        box([.34, .21, .12], [0, 1.38, .26], seatMat, chair);
        for (const side of [-1, 1]) box([.075, .07, .42], [side * .33, .76, .04], navy, chair);
        collider(`cabin-${index + 1}-seat-${seatX < 0 ? 1 : 2}`, [[seatX - .38, 0, -.03], [seatX + .38, 1.52, .72]], cabin);
        const stickX = seatX + (seatX < 0 ? -.4 : .4);
        box([.17, .12, .24], [stickX, .72, -.2], navy, cabin);
        tube([stickX, .78, -.2], [stickX, 1.01, -.24], .027, frame, cabin);
        const stick = box([.055, .13, .06], [stickX, 1.06, -.24], navy, cabin);
        action(stick, `flight-${index + 1}-${seatX < 0 ? 'left' : 'right'}`, () => {
          state.active = true; state.bank = clamp(state.bank + (seatX < 0 ? -.12 : .12), -.45, .45); flight.redraw();
        });
      }
      box([.34, .67, .91], [0, .395, -.31], navy, cabin);
      collider(`cabin-${index + 1}-pedestal`, [[-.21, .06, -.83], [.21, .86, .22]], cabin);
      for (const x of [-.075, .075]) { tube([x, .75, -.31], [x, .93, -.43], .016, frame, cabin); box([.065, .055, .1], [x, .94, -.43], navy, cabin); }
      const instruments = kit.screen([2.5, .45], [0, 1.13, -1.065], (ctx, w, h) => {
        ctx.fillStyle = '#071c29'; ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 5; i++) { const left = 20 + i * 198; ctx.fillStyle = i % 2 ? '#193d42' : '#244c5f'; ctx.fillRect(left, 32, 172, h - 64);
          ctx.strokeStyle = '#8fcdbd'; ctx.lineWidth = 3; ctx.strokeRect(left + 11, 49, 150, h - 98);
          ctx.fillStyle = '#ffffff'; ctx.font = '24px sans-serif'; ctx.fillText(['ВЫСОТА', 'СКОРОСТЬ', 'МАРШРУТ', 'СИСТЕМЫ', 'КУРС'][i], left + 14, 96);
          ctx.fillStyle = '#8fdacb'; ctx.font = '42px sans-serif'; ctx.fillText(['850', '240', '01', 'НОРМА', '000'][i], left + 20, 202); }
      }, cabin, { resolution: [1024, 320] });
      action(instruments.group, `flight-${index + 1}-reset`, () => { Object.assign(state, { active: false, bank: 0, pitch: 0, heading: 0, elapsed: 0 }); flight.redraw(); });
      kit.label('МС-21 · КАБИНА ' + (options.stationNumber || index + 1), [2.9, .26], [0, 2.82, -1.45], cabin);
      kit.label('НАЖМИТЕ НА ЭКРАН · НАЧАТЬ ПОЛЁТ', [2.8, .22], [0, .15, 2.14], cabin, { background: '#163a48' });
    }
    stations.push({ cabin, state, screen: flight });
  }
  function update(delta) {
    if (!Number.isFinite(delta) || delta < 0) return false;
    const dt = Math.min(delta, .12); elapsed += dt;
    let active = false;
    for (const { state } of stations) if (state.active) { state.elapsed += dt; state.heading += Math.sin(state.bank) * dt * .2; active = true; }
    if (Math.floor(elapsed * 12) !== lastRedraw) { for (const item of stations) if (item.state.active) item.screen.redraw(item.state.elapsed); lastRedraw = Math.floor(elapsed * 12); }
    return active && root.visible;
  }
  return { ...kit, update,
    getMediaEntries:()=>stations.map(({state,screen},index)=>({id:`flight-panorama-${index+1}`,name:`Кабина ${options.stationNumber||index+1} · полёт`,
      width:screen.size[0],height:screen.size[1],theme:'flight',face:screen.face,
      interact(action){if(action==='toggle')state.active=!state.active;else if(action==='reset')Object.assign(state,{active:true,bank:0,pitch:0,heading:0,elapsed:0});else{state.active=true;state.bank=state.bank>=.12?-.18:.18;}screen.redraw();kit.changed();return true;},
      getState:()=>({theme:'flight',playing:state.active,animated:true,kind:'interactive-flight-panorama',elapsed:state.elapsed,bank:state.bank,pitch:state.pitch,heading:state.heading})})),
    control(index, patch = {}) { const state = states[index]; if (!state) return false;
      if (patch.active !== undefined) state.active = Boolean(patch.active);
      if (Number.isFinite(patch.bank)) state.bank = clamp(patch.bank, -.45, .45);
      if (Number.isFinite(patch.pitch)) state.pitch = clamp(patch.pitch, -.5, .5);
      stations[index].screen.redraw(); kit.changed(); return true;
    },
    getState: () => ({ id: root.userData.installationId, cabins: cabinCount, seats: 2 * cabinCount, externalShells,
      floorFootprintMetres: [platformWidth + (cabinCount - 1) * cabinSpacing, platformDepth], heightMetres: externalShells === cabinCount ? 2.26 : 2.98,
      bodyHeightMetres: externalShells ? 2.2 : null, clearRearEntryMetres: externalShells ? 1.06 : 2.84,
      entranceLocalAxis: '+Z', noseLocalAxis: '-Z', projectionPanels: externalShells * 2,
      provenance: externalShells ? 'Hitem3D-X04-verified-interior-with-runtime-flight-projections' : 'procedural-threejs-functional-interior',
      fidelity: 'exhibition interpretation; exact MC-21 instruments require validated production reference',
      stations: states.map(s => ({ ...s })), actions: stations.flatMap((_, i) => ['toggle', 'left', 'right', 'reset'].map(a => `flight-${i + 1}-${a}`)) }) };
}

function drawChersonesus(ctx, w, h, scene, time) {
  const scenes = [
    { title: 'ХЕРСОНЕС · ГОРОД И МОРЕ', subtitle: 'Порт · улицы · повседневная жизнь', top: '#457c9c', bottom: '#e7b374' },
    { title: 'ХЕРСОНЕС · ПЛОЩАДЬ И ХРАМ', subtitle: 'Архитектура · ремёсла · общественная жизнь', top: '#658b9b', bottom: '#f0ca8b' },
    { title: 'ХЕРСОНЕС · АРХЕОЛОГИЯ', subtitle: 'Предметы · фрагменты · слои истории', top: '#405d6b', bottom: '#c99566' },
  ];
  const s = scenes[scene % scenes.length], sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, s.top); sky.addColorStop(.58, s.bottom); sky.addColorStop(1, '#b39c79'); ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#d4e7e5'; ctx.globalAlpha = .25;
  for (let i = 0; i < 10; i++) { ctx.beginPath(); ctx.ellipse(((i * 167 + time * 3) % (w + 200)) - 100, h * (.18 + (i % 3) * .055), 110, 18, 0, 0, TAU); ctx.fill(); }
  ctx.globalAlpha = 1; ctx.fillStyle = '#467985'; ctx.fillRect(0, h * .59, w, h * .15);
  ctx.fillStyle = '#9c8d78'; ctx.beginPath(); ctx.moveTo(0, h * .67); ctx.lineTo(w * .41, h * .56); ctx.lineTo(w, h * .75); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();
  const random = seedRandom(780 + scene);
  for (let i = 0; i < 42; i++) {
    const x = random() * w, y = h * (.55 + random() * .3), bw = 25 + random() * 65, bh = 20 + random() * 55;
    ctx.fillStyle = ['#bdab8a', '#d0bb94', '#a68e6b'][i % 3]; ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = '#875e49'; ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x + bw / 2, y - bh * .4); ctx.lineTo(x + bw + 4, y); ctx.fill();
    ctx.fillStyle = '#625d51'; ctx.fillRect(x + bw * .4, y + bh * .45, bw * .17, bh * .55);
  }
  const tx = w * .51, ty = h * .5, tw = w * .2;
  ctx.fillStyle = '#e0c99e'; for (let i = 0; i < 6; i++) ctx.fillRect(tx + i * tw / 6, ty, tw / 13, h * .26);
  ctx.fillRect(tx - 12, ty + h * .25, tw + 18, h * .025); ctx.fillRect(tx - 12, ty - h * .03, tw + 18, h * .035);
  ctx.beginPath(); ctx.moveTo(tx - 22, ty - h * .035); ctx.lineTo(tx + tw * .5, ty - h * .15); ctx.lineTo(tx + tw + 18, ty - h * .035); ctx.fill();
  ctx.fillStyle = 'rgba(23,33,37,.76)'; ctx.fillRect(0, 0, w, h * .2);
  ctx.fillStyle = '#fff1cf'; ctx.font = `600 ${Math.floor(h * .056)}px sans-serif`; ctx.fillText(s.title, w * .04, h * .085);
  ctx.fillStyle = '#e6e3d7'; ctx.font = `${Math.floor(h * .033)}px sans-serif`; ctx.fillText(s.subtitle, w * .04, h * .15);
  ctx.fillStyle = 'rgba(23,33,37,.72)'; ctx.fillRect(0, h * .91, w, h * .09);
  ctx.fillStyle = '#f3e9d6'; ctx.font = `${Math.floor(h * .03)}px sans-serif`;
  ctx.fillText('Интерактивная сцена · нажмите, чтобы сменить тему', w * .04, h * .968);
}

/** Fits a pavilion interior 7.4 × 16 m after the actual O16 shell is enlarged. */
export function createChersonesusInterior(options = {}) {
  const kit = makeKit('chersonesus-interior', 'Херсонес · панорама, VR и музей', options);
  const { root, standard, basic, box, cyl, tube, collider, action } = kit;
  const compact = options.layout === 'compact-source-zone';
  const floorWidth = compact ? 6.22 : 7.4, floorLength = compact ? 9.2 : 16;
  const screenWidth = compact ? 5.2 : 6.3, screenZ = compact ? 4.05 : -7.25, facing = compact ? Math.PI : 0;
  const sand = standard(0xc3ae88, { roughness: .93 }), pale = standard(0xd4c5a8, { roughness: .88 }), bronze = standard(0x705a42, { metalness: .22 }), dark = standard(0x282a29), led = basic(0xffcf87, { toneMapped: false });
  let sceneIndex = 0, elapsed = 0;
  const vrActive = [false, false], vrRings = [];
  const movingScreens=[],equipmentParts=[];
  function equipmentPart(sourceId,nodes,x,z,yaw=0){
    const holder=new THREE.Group();holder.position.set(x,0,z);holder.rotation.y=yaw;root.add(holder);root.updateWorldMatrix(true,true);
    for(const node of nodes)holder.attach(node);equipmentParts.push({sourceId,root:holder});return holder;
  }
  function attachMedia(screen,id,name,theme,extra={}){
    const media=createLiveMedia({theme,title:name,width:screen.canvas.width,height:screen.canvas.height,...extra});
    screen.face.material.map=media.texture;screen.face.material.needsUpdate=true;
    const item={id,name,width:screen.size[0],height:screen.size[1],theme,face:screen.face,media,
      interact(action){const changed=media.interact(action);kit.changed();return changed;},getState:()=>media.getState()};
    movingScreens.push(item);return media;
  }
  // Thin deck and patterned lines are visible; it is NOT declared as a new CAD floor.
  box([floorWidth, .035, floorLength], [0, .0175, 0], sand);
  for (let z = -floorLength / 2 + .5; z <= floorLength / 2 - .5; z += 1) box([floorWidth - .04, .006, .015], [0, .038, z], bronze);
  for (let x = -3; x <= 3; x += 1) box([.015, .006, floorLength - .04], [x, .038, 0], bronze);
  // Main screen faces along the long axis. Its 0.6-m lower edge keeps the
  // complete display below the actual roof triangles (verified against O16).
  const panorama = kit.screen([screenWidth, 2.2], [0, 1.7, screenZ], (ctx, w, h, t) => {
    if(options.panoramaImage?.complete && options.panoramaImage.naturalWidth){
      ctx.drawImage(options.panoramaImage,0,0,w,h);
      if(sceneIndex===1){ctx.fillStyle='rgba(18,76,95,.18)';ctx.fillRect(0,0,w,h);}
      if(sceneIndex===2){ctx.fillStyle='rgba(74,33,10,.22)';ctx.fillRect(0,0,w,h);}
    } else drawChersonesus(ctx,w,h,sceneIndex,t);
  }, root, { resolution: [2048, 1024], rotationY: facing });
  const panoramaMedia=attachMedia(panorama,'chersonesus-panorama','Херсонес · история и наследие','heritage',{image:options.panoramaImage,showText:false});
  panorama.redraw=()=>{panoramaMedia.interact('reset');for(let i=0;i<sceneIndex;i++)panoramaMedia.interact('next');};
  const panoramaCollider=collider('panorama-wall', [[-screenWidth / 2 - .1, .04, screenZ - .15], [screenWidth / 2 + .1, compact ? 3.06 : 3.1, screenZ + .15]]);
  equipmentPart('chersonesus-panorama',[panorama.group,panoramaCollider],0,screenZ,facing);
  action(panorama.group, 'chersonesus-scene', () => { sceneIndex = (sceneIndex + 1) % 3; panorama.redraw(elapsed); });
  kit.label('ХЕРСОНЕС ТАВРИЧЕСКИЙ', [compact ? 4.9 : 5.9, .2], [0, compact ? 2.9 : 2.95, screenZ - (compact ? -.01 : .01)], root, { background: '#655945', color: '#fff0cc', rotationY: facing });
  // A 2.2-m central viewing/through aisle remains free; cases are along the sides.
  const cases = compact ? [[2.55, -3], [2.55, -1], [2.55, 1], [2.55, 3], [-2.65, 3]] : [[2.92, -4.5], [2.92, -1.7], [2.92, 1.1], [2.92, 5.3], [-2.9, -2.5]];
  const caseNames = ['КЕРАМИКА', 'КАМЕННАЯ РЕЗЬБА', 'МОНЕТЫ И ТОРГОВЛЯ', 'БЫТ И РЕМЁСЛА', 'АРХИТЕКТУРНЫЕ ДЕТАЛИ'];
  cases.forEach(([x, z], index) => {
    const c = new THREE.Group(); c.position.set(x, 0, z); root.add(c);
    const w = compact ? .8 : .86, l = compact ? 1.5 : 1.75;
    box([w, .77, l], [0, .425, 0], bronze, c);
    box([w - .05, .055, l - .05], [0, .84, 0], pale, c);
    box([w, .46, l], [0, 1.105, 0], kit.glass, c);
    for (const dx of [-w / 2, w / 2]) box([.014, .016, l - .02], [dx, .86, 0], led, c);
    collider(`case-${index + 1}`, [[-w / 2 - .025, 0, -l / 2 - .025], [w / 2 + .025, 1.35, l / 2 + .025]], c);
    if(options.archaeology && [0,4].includes(index)){
      const items=options.archaeology.clone(true);items.updateMatrixWorld(true);
      const fittedSize=new THREE.Box3().setFromObject(items,true).getSize(new THREE.Vector3());
      const factor=Math.min(1,(w-.1)/fittedSize.x,.4/fittedSize.y,(l-.15)/fittedSize.z);
      items.scale.multiplyScalar(factor);items.position.set(0,.875,0);c.add(items);
    } else if (index % 2 === 0) {
      const points = [[.055, 0], [.1, .035], [.16, .13], [.14, .22], [.085, .29], [.075, .36], [.12, .37]].map(p => new THREE.Vector2(...p));
      for (const dz of [-.46, .38]) {
        const pot = kit.mesh(new THREE.LatheGeometry(points, 20), standard(index === 2 ? 0x85724c : 0xa37949), [0, .88, dz], c);
        const rim = kit.mesh(new THREE.TorusGeometry(.112, .013, 6, 20), bronze, [0, 1.25, dz], c); rim.rotation.x = Math.PI / 2;
      }
    } else {
      for (const dz of [-.4, .35]) {
        box([.49, .11, .5], [0, .93, dz], pale, c);
        for (let i = 0; i < 4; i++) { const carving = kit.mesh(new THREE.TorusGeometry(.055, .011, 5, 12), sand, [-.16 + i * .1, .995, dz], c); carving.rotation.x = Math.PI / 2; }
      }
    }
    const sign = kit.label(caseNames[index], [.76, .17], [0, .7, (l / 2 + .06) * (compact ? -1 : 1)], c, { background: '#252e2b', rotationY: facing });
    action(sign.group, `chersonesus-case-${index + 1}`, () => { sceneIndex = index % 3; panorama.redraw(elapsed); });
    equipmentParts.push({sourceId:`chersonesus-case-${index+1}`,root:c});
  });
  // Two separate 2.5 × 2.5-m VR bays, 0.7-m separation; controls never cross the central aisle.
  for (let i = 0; i < 2; i++) {
    const zone = new THREE.Group(); zone.position.set(compact ? -1.85 : -2.25, 0, (compact ? -2.6 : 1.65) + i * 3.2); root.add(zone);
    const ringMaterial = basic(0xe0bd78, { toneMapped: false });
    const ring = kit.mesh(new THREE.TorusGeometry(1.12, .025, 6, 48), ringMaterial, [0, .055, 0], zone); ring.rotation.x = Math.PI / 2; vrRings.push(ring);
    for (const x of [-1.25, 1.25]) box([.025, .012, 2.5], [x, .05, 0], led, zone);
    for (const z of [-1.25, 1.25]) box([2.5, .012, .025], [0, .05, z], led, zone);
    // The swept VR space is a semantic keep-clear volume for passing visitors.
    collider(`vr-bay-${i + 1}`, [[-1.25, .04, -1.25], [1.25, 2.3, 1.25]], zone, 'interactive-safety-zone');
    const stand = new THREE.Group(); stand.position.set(-.76, 0, -.75); zone.add(stand);
    cyl(.16, .25, .08, [0, .08, 0], dark, stand); tube([0, .12, 0], [0, 1.3, 0], .025, bronze, stand);
    box([.28, .135, .135], [0, 1.37, 0], standard(0xe4e4dc), stand);
    for (const x of [-.075, .075]) { const lens = cyl(.032, .032, .015, [x, 1.37, .075], dark, stand); lens.rotation.x = Math.PI / 2; }
    const strap = kit.mesh(new THREE.TorusGeometry(.12, .015, 6, 24, Math.PI * 1.5), dark, [0, 1.37, -.08], stand); strap.rotation.x = Math.PI / 2;
    for (const x of [-.2, .2]) { tube([x, 1.08, 0], [x, 1.21, -.03], .026, pale, stand); const handleRing = kit.mesh(new THREE.TorusGeometry(.046, .009, 6, 16), pale, [x, 1.245, -.03], stand); handleRing.rotation.x = .4; }
    const label = kit.label('VR · ХЕРСОНЕС ' + (i + 1), [1.05, .22], [0, 1.6, -1.13], zone, { rotationY: facing });
    action(label.group, `chersonesus-vr-${i + 1}`, () => { vrActive[i] = !vrActive[i]; sceneIndex = i; panorama.redraw(elapsed);
      ringMaterial.color.setHex(vrActive[i] ? 0x80dcc6 : 0xe0bd78); });
    equipmentParts.push({sourceId:`chersonesus-vr-${i+1}`,root:zone});
  }
  // Museum information screens flank the viewing area, away from the through aisle.
  for (const [side, title] of [[-1, 'ПОРТ И МОРСКИЕ ПУТИ'], [1, 'ГОРОД И ЕГО ЖИТЕЛИ']]) {
    const infoX = side * (compact ? 2.5 : 2.8), infoZ = compact ? 2.1 : -5.7, infoWidth = compact ? 1.1 : 1.6;
    const information = kit.screen([infoWidth, .92], [infoX, 1.85, infoZ], (ctx, w, h) => {
      ctx.fillStyle = '#203a3e'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#ead0a5'; ctx.font = '600 44px sans-serif'; ctx.fillText(title, 45, 92, w - 90);
      ctx.strokeStyle = '#bca477'; ctx.lineWidth = 4; ctx.strokeRect(45, 133, w - 90, h - 182);
      ctx.fillStyle = '#94bab9'; ctx.font = '34px sans-serif'; ctx.fillText('Выберите предмет в витрине', 75, 221, w - 150);
      ctx.fillText('или смените сцену на панораме', 75, 286, w - 150);
      ctx.fillStyle = '#ede5d3'; ctx.font = '30px sans-serif'; ctx.fillText('История · архитектура · археология', 75, 375, w - 150);
    }, root, { rotationY: facing });
    attachMedia(information,`chersonesus-information-${side<0?1:2}`,title,side<0?'sailing':'heritage');
    action(information.group, `chersonesus-info-${side < 0 ? 1 : 2}`, () => { sceneIndex = side < 0 ? 0 : 1; panorama.redraw(elapsed); });
    const infoCollider=collider(`information-${side}`, [[infoX - infoWidth / 2 - .04, .04, infoZ - .14], [infoX + infoWidth / 2 + .04, 2.36, infoZ + .14]]);
    equipmentPart(`chersonesus-info-${side}`,[information.group,infoCollider],infoX,infoZ,facing);
  }
  const bench = box([1.5, .45, .55], [0, .265, -2.55], standard(0x85755d));
  // The bench is kept to a short width and can be omitted by the integrator
  // when the final shell or tour requires a continuous 2.2-m through corridor.
  bench.visible = false;
  function update(delta) {
    if (!Number.isFinite(delta) || delta < 0) return false;
    elapsed += Math.min(delta, .12);
    for(const screen of movingScreens)screen.media.update(Math.min(delta,.12));
    for (let i = 0; i < vrRings.length; i++) if (vrActive[i]) vrRings[i].material.color.setRGB(.36, .72 + Math.sin(elapsed * 2) * .08, .61);
    return root.visible;
  }
  return { ...kit, update,
    getEquipmentParts:()=>equipmentParts.slice(),
    getMediaEntries:()=>movingScreens.map(({media,...entry})=>entry),
    dispose(){for(const screen of movingScreens)screen.media.dispose();kit.dispose();},
    setScene(index) { if (Number.isFinite(index)) sceneIndex = ((Math.trunc(index) % 3) + 3) % 3; panorama.redraw(elapsed); kit.changed(); },
    getState: () => ({ id: root.userData.installationId, provenance: 'procedural-threejs-functional-interior', museumCases: cases.length,
      vrBays: 2, vrBaySizeMetres: [2.5, 2.5], vrSeparationMetres: .7, screens: 3,
      mainScreenMetres: [screenWidth, 2.2], mainScreenBottomMetres: .6,
      footprintMetres: [floorWidth, floorLength], heightMetres: compact ? 3.06 : 3.1, centralAisleMetres: 2.2, centralAisleCentreX: compact ? .65 : .15,
      layout: compact ? 'compact-source-zone' : 'original-24m',
      hitemArchaeologyCases: options.archaeology ? 2 : 0, panoramaImageLoaded: Boolean(options.panoramaImage?.complete && options.panoramaImage?.naturalWidth),
      animatedScreens:movingScreens.length,media:movingScreens.map(screen=>({id:screen.id,...screen.media.getState()})),
      actualAisleRequiresShellVerification: true, safetyDimensionsAreDesignAllowancesNotCertifiedNorms: true,
      sceneIndex, vrActive: vrActive.slice(), actions: ['chersonesus-scene', 'chersonesus-vr-1', 'chersonesus-vr-2',
        ...cases.map((_, i) => `chersonesus-case-${i + 1}`), 'chersonesus-info-1', 'chersonesus-info-2'] }) };
}

/** Dispatch a raycast hit without duplicating pointer listeners or swallowing camera drags. */
export function getInstallationAction(hit) {
  let object = hit?.object || hit;
  while (object) { if (object.userData?.installationAction) return { installationId: object.userData.installationId, action: object.userData.installationAction }; object = object.parent; }
  return null;
}
