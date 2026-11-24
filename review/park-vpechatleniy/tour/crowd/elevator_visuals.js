// Visuals for the 16 measured park lift shafts. Shared engine and frame loop.
// Geometry/door sizes are authored simulation choices, not equipment specifications.
const WALL_NAME = 'I-WALL__b9f5f9ff';
const EQUIPMENT_NAME = 'M-EQPM__7f7f7fff';
const clamp01 = value => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
const point = value => Array.isArray(value)
  ? { x:value[0], y:value.length === 3 ? value[1] : 0, z:value.length === 3 ? value[2] : value[1] }
  : value;
const list = values => values instanceof Map ? [...values.values()] : Array.isArray(values) ? values : Object.values(values || {});

export async function createElevatorVisuals({
  THREE, loader, scene, model, definitions, registerMaterial,
  wallPatchUrl = new URL('./portals-walls.glb', import.meta.url).href,
} = {}) {
  if (!THREE || !loader?.loadAsync || !scene?.add) throw new Error('Inject the existing THREE, GLTFLoader and scene');
  const sourceModel = model?.scene || model;
  const wall = sourceModel?.getObjectByName(WALL_NAME), equipment = sourceModel?.getObjectByName(EQUIPMENT_NAME);
  if (!wall?.isMesh || !equipment?.isMesh) throw new Error('Measured lift wall node14 and equipment node22 were not found');
  const defs = list(definitions);
  if (defs.length !== 16 || new Set(defs.map(d=>d.id)).size !== 16) throw new Error('This wall patch expects the 16 verified lift definitions');
  const patchGLTF = await loader.loadAsync(wallPatchUrl);
  const root = new THREE.Group(); root.name = 'Park_Operating_Elevators';
  const geometries = new Set(), materials = new Set(), textures = new Set();
  const boxGeometry = new THREE.BoxGeometry(1,1,1); geometries.add(boxGeometry);
  const labelGeometry = new THREE.PlaneGeometry(.76,.22); geometries.add(labelGeometry);
  const ownMaterial = material => { materials.add(material); registerMaterial?.(material); return material; };
  const makeMaterial = parameters => ownMaterial(new THREE.MeshStandardMaterial(parameters));
  const steel = makeMaterial({color:0x8b9ba4,metalness:.65,roughness:.32});
  const doorMaterial = makeMaterial({color:0x718895,metalness:.58,roughness:.33});
  const interior = makeMaterial({color:0xe4e0d5,metalness:.12,roughness:.6});
  const floorMaterial = makeMaterial({color:0x34444c,metalness:.3,roughness:.48});
  const dark = makeMaterial({color:0x182e3a,metalness:.25,roughness:.4});
  const light = makeMaterial({color:0xf0eddf,emissive:0xf0e8d0,emissiveIntensity:1.2,roughness:.3});
  const readyLight = makeMaterial({color:0x74eac4,emissive:0x28ad7f,emissiveIntensity:1,roughness:.4});
  const waitingLight = makeMaterial({color:0xe9bd62,emissive:0x9d6322,emissiveIntensity:.6,roughness:.4});
  const patch = patchGLTF.scene; patch.name = 'Lift_Shaft_Walls_With_32_Portals';
  const sourceWallMaterial = Array.isArray(wall.material) ? wall.material[0] : wall.material;
  const replacementWallMaterial = ownMaterial(sourceWallMaterial.clone());
  patch.traverse(object => {
    if (!object.isMesh) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
    object.material = replacementWallMaterial;
    object.receiveShadow = wall.receiveShadow; object.castShadow = wall.castShadow;
    object.userData.sourceLayer = 'I-WALL'; object.userData.replacesNode = 14;
  });
  root.add(patch);
  const byId = new Map(), cabins = new Map(), landings = new Map();

  function box(parent,name,w,h,d,x,y,z,material) {
    const mesh = new THREE.Mesh(boxGeometry,material); mesh.name = name;
    mesh.scale.set(w,h,d); mesh.position.set(x,y,z); mesh.castShadow=false; mesh.receiveShadow=true;
    parent.add(mesh); return mesh;
  }
  function doorPair(parent,width,height,depth,z,name) {
    const half = width/2;
    const left = box(parent,`${name}_left`,half-.002,height,depth,-width/4,height/2,z,doorMaterial);
    const right = box(parent,`${name}_right`,half-.002,height,depth,width/4,height/2,z,doorMaterial);
    return { left,right,width, fraction:0,
      set(fraction) { this.fraction=clamp01(fraction); const offset=this.width/4+(this.width/2+.018)*this.fraction;
        left.position.x=-offset; right.position.x=offset; } };
  }
  function labelMaterial(text) {
    if (typeof document==='undefined') return dark;
    const canvas=document.createElement('canvas'); canvas.width=384; canvas.height=112;
    const ctx=canvas.getContext('2d'); ctx.fillStyle='#152b35'; ctx.fillRect(0,0,384,112);
    ctx.fillStyle='#eff7f6'; ctx.font='bold 54px sans-serif'; ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,192,57);
    const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace; textures.add(texture);
    return ownMaterial(new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));
  }

  for (const def of defs) {
    const shaft=point(def.shaft), outward=point(def.outward), dimensions=def.proposedCabin || def.proposed_cabin || {};
    if (![shaft?.x,shaft?.z,outward?.x,outward?.z].every(Number.isFinite)) throw new Error(`Invalid lift axes: ${def.id}`);
    const length=Math.hypot(outward.x,outward.z), nx=outward.x/length,nz=outward.z/length;
    const yaw=Math.atan2(nx,nz), width=dimensions.width ?? 1.55,depth=dimensions.depth ?? 2.1,height=dimensions.height ?? 2.4;
    // A 0.20 m shift intersects an existing floor lip at lifts 20.11/20.12.
    // The verified safe shift is 0.10 m; the sill bridges the remaining 0.35 m.
    const offset=Math.min(dimensions.center_offset_outward ?? .10,.10);
    const opening=dimensions.door_opening_width ?? 1,doorHeight=dimensions.door_opening_height ?? 2.2;
    const stops=def.stops.map(stop=>({ ...stop, floorId:String(stop.floorId), elevation:stop.elevation ?? stop.y, door:point(stop.door || stop.door_threshold) }));
    const initial=stops.find(s=>s.floorId===String(def.initialFloor)) || stops[0];
    const car=new THREE.Group(); car.name=`${def.id}_car`; car.position.set(shaft.x+nx*offset,initial.elevation,shaft.z+nz*offset);car.rotation.y=yaw;root.add(car);
    box(car,'cabin_floor',width,.08,depth,0,-.04,0,floorMaterial);
    box(car,'cabin_back',width,height,.045,0,height/2,-depth/2+.0225,interior);
    for(const sign of [-1,1])box(car,`cabin_side_${sign}`,.045,height,depth,sign*(width/2-.0225),height/2,0,interior);
    box(car,'cabin_ceiling',width,.055,depth,0,height+.0275,0,interior);
    box(car,'ceiling_light',width*.62,.012,depth*.55,0,height-.012,-.05,light);
    // A two-person cabin with a clear front opening and its own moving doors.
    const cheek=(width-opening)/2;
    for(const sign of [-1,1])box(car,`cabin_front_cheek_${sign}`,cheek,doorHeight,.04,sign*(opening/2+cheek/2),doorHeight/2,depth/2-.02,steel);
    box(car,'cabin_front_header',width,height-doorHeight,.05,0,(height+doorHeight)/2,depth/2-.025,steel);
    const carDoors=doorPair(car,opening,doorHeight,.035,depth/2-.065,`${def.id}_car_door`);
    // Back handrail is inside the cabin and travels with the car.
    box(car,'cabin_handrail',width-.18,.035,.035,0,.96,-depth/2+.095,steel);
    const label=labelMaterial(def.name?.replace(/^Лифт\s*/,'') || def.id);
    const landingEntries=[];
    for(const stop of stops) {
      const group=new THREE.Group();group.name=`${def.id}_${stop.floorId}_landing`;
      group.position.set(stop.door.x,stop.elevation,stop.door.z);group.rotation.y=yaw;root.add(group);
      // The clear aperture remains 1.00 m wide. Posts occupy the retained wall.
      for(const sign of [-1,1])box(group,`jamb_${sign}`,.075,doorHeight,.25,sign*(opening/2+.0375),doorHeight/2,-.1,steel);
      box(group,'lintel',opening+.15,.10,.25,0,doorHeight+.05,-.1,steel);
      const projected=(stop.door.x-car.position.x)*nx+(stop.door.z-car.position.z)*nz;
      const sillDepth=Math.max(.002,projected-depth/2)+.002;
      box(group,'landing_sill',opening,.06,sillDepth,0,-.03,-sillDepth/2,floorMaterial);
      const doors=doorPair(group,opening,doorHeight,.045,.016,`${def.id}_${stop.floorId}_door`);
      const sign=new THREE.Mesh(labelGeometry,label);sign.name='lift_identity';sign.position.set(0,doorHeight+.24,.035);group.add(sign);
      box(group,'call_plate',.10,.24,.026,opening/2+.18,1.15,.033,dark);
      const indicator=box(group,'call_indicator',.045,.045,.012,opening/2+.18,1.18,.052,waitingLight);
      const entry={floorId:stop.floorId,elevation:stop.elevation,group,doors,indicator,sillDepth};
      landingEntries.push(entry);landings.set(`${def.id}:${stop.floorId}`,entry);
    }
    const entry={id:def.id,definition:def,car,carDoors,landings:landingEntries,centreOffset:offset};
    byId.set(def.id,entry);cabins.set(def.id,car);
  }
  // Commit the replacement only once loading and construction have succeeded.
  const hiddenOriginals=[{object:wall,visible:wall.visible},{object:equipment,visible:equipment.visible}];
  wall.visible=false; equipment.visible=false; scene.add(root);
  let dead=false;
  function update(elevatorSnapshots) {
    if(dead)return;
    for(const snapshot of list(elevatorSnapshots)) {
      const entry=byId.get(snapshot.id); if(!entry)continue;
      if(Number.isFinite(snapshot.carY))entry.car.position.y=snapshot.carY;
      const floorId=String(snapshot.floorId ?? snapshot.currentFloor ?? '');
      const atLanding=entry.landings.find(stop=>stop.floorId===floorId && Math.abs(stop.elevation-entry.car.position.y)<.035);
      const fraction=atLanding && snapshot.state!=='moving' ? clamp01(snapshot.doorFraction) : 0;
      entry.carDoors.set(fraction);
      for(const stop of entry.landings) {
        const open=stop===atLanding ? fraction : 0;stop.doors.set(open);
        stop.indicator.material=open>.96 ? readyLight : waitingLight;
      }
    }
  }
  return {update,
    objects:{root,wallPatch:patch,cabins,landings,byId,hiddenOriginals},
    dispose(){if(dead)return;dead=true;root.removeFromParent();for(const item of hiddenOriginals)item.object.visible=item.visible;
      for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();for(const texture of textures)texture.dispose();byId.clear();cabins.clear();landings.clear();},
  };
}
