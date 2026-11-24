import * as THREE from 'three';

export const ICEBREAKER_LAYOUT = Object.freeze({
  instanceId: 'O12-1', x: 33.05, y: 7.2, z: -47, rotationY: Math.PI, length: 25.2,
  bridgeHeight: 13.2, bridgeWidth: 1.2,
  path: [[28.2, 13.2, -61.567], [28.2, 13.2, -54.14], [29.97, 13.2, -54.14]],
});

export const ICEBREAKER_OPENING = Object.freeze({
  id: 'icebreaker-mezzanine-access', label: 'Рабочий вход с антресоли к ледоколу',
  mesh: 'Ограждение__7f7f7fff', min: [27.6, 13.18, -61.56], max: [28.8, 14.22, -61.52],
});

/** A reviewable access deck, calibrated to the wheelhouse wing, not an invented interior. */
export function createIcebreakerAccess({ scene, exhibits }) {
  const config = ICEBREAKER_LAYOUT, group = new THREE.Group();
  group.name = 'Переход с антресоли к рубке · рабочая стыковка';
  group.userData.workingIcebreakerAccess = true;
  const geometries = [], materials = [];
  const steel = new THREE.MeshStandardMaterial({ color: 0x8e9a9b, metalness: .38, roughness: .6 });
  const deckMaterial = new THREE.MeshStandardMaterial({ color: 0x9dabb0, metalness: .2, roughness: .76 });
  const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0xffbc78, metalness: .08, roughness: .65 });
  materials.push(steel, deckMaterial, edgeMaterial);
  // Union of the two verified deck segments and the verified 0.6 m elbow fill.
  const outline = [[27.6,-61.567],[28.8,-61.567],[28.8,-54.74],[29.97,-54.74],[29.97,-53.54],[27.6,-53.54]];
  const shape = new THREE.Shape();
  outline.forEach(([x,z], i) => i ? shape.lineTo(x,-z) : shape.moveTo(x,-z)); shape.closePath();
  const deckGeometry = new THREE.ExtrudeGeometry(shape, { depth: .12, bevelEnabled: false, steps: 1 });
  deckGeometry.rotateX(-Math.PI/2); geometries.push(deckGeometry);
  const deck = new THREE.Mesh(deckGeometry, deckMaterial); deck.position.y = 13.08; deck.name = 'Настил перехода · верх13.2м'; group.add(deck);
  const tube = (a, b, radius, material) => {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), direction = to.clone().sub(from);
    const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), 8); geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.copy(from.add(to).multiplyScalar(.5));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), direction.normalize()); group.add(mesh); return mesh;
  };
  // The ends at the mezzanine and the ship stay open. Rails follow only outer edges.
  const rails = [
    [[27.64,-61.567],[27.64,-53.58]],
    [[27.64,-53.58],[29.97,-53.58]],
    [[28.76,-61.567],[28.76,-54.78]],
    [[28.76,-54.78],[29.97,-54.78]],
  ];
  for (const [a,b] of rails) {
    for (const y of [13.72,14.27]) tube([a[0],y,a[1]],[b[0],y,b[1]],.025,steel);
    const length = Math.hypot(b[0]-a[0],b[1]-a[1]), steps = Math.max(1,Math.ceil(length/1.5));
    for(let i=0;i<=steps;i++) {
      const t=i/steps,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;
      tube([x,13.2,z],[x,14.27,z],.025,steel);
    }
    tube([a[0],13.215,a[1]],[b[0],13.215,b[1]],.015,edgeMaterial);
  }
  scene.add(group);
  let connected = false, reason = 'loading';
  function update() {
    const pose = exhibits.getInstance(config.instanceId);
    const atDefault = pose && Math.abs(pose.x-config.x)<.001 && Math.abs(pose.y-config.y)<.001 && Math.abs(pose.z-config.z)<.001
      && Math.abs(Math.atan2(Math.sin(pose.rotationY-config.rotationY),Math.cos(pose.rotationY-config.rotationY)))<.001
      && Math.abs(pose.scaleFactor-1)<.001;
    connected = Boolean(atDefault && pose.visible && exhibits.group.visible);
    reason = !pose?.visible || !exhibits.group.visible ? 'hidden' : atDefault ? 'connected-working-layout' : 'ship-edited';
    const changed=group.visible!==connected; group.visible=connected; return changed;
  }
  update();
  return { group, update, getState:()=>({connected,reason,provisional:true,height:13.2,width:1.2,path:config.path,
    note:'Переход к наружному крылу рубки рассчитан для исходной рабочей позы и размера; после редактирования корабля скрывается.'}),
    dispose(){group.removeFromParent();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());} };
}
