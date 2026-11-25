import * as THREE from 'three';
const installed = new WeakMap();

/** Raise the complete source airframe; keep the assembly origin on the real floor.
 * Supports attach to measured underside points, not to an invented box. Their
 * collision parts move with the aircraft through the existing editor transaction.
 */
export function elevateAircraftOnColumns({root,sourceCollisionParts=[],liftMetres=.60}={}) {
  if(!root?.isObject3D)throw new TypeError('Нужен исходный экземпляр МС-21.');
  if(installed.has(root))return installed.get(root);
  const lift=Math.min(.60,Math.max(0,Number(liftMetres)||.60));
  const body=new THREE.Group();body.name='МС-21 · целый самолёт над опорами';
  for(const child of [...root.children])body.add(child);
  body.position.y=lift;root.add(body);root.updateWorldMatrix(true,true);
  const structure=new THREE.Group();structure.name='МС-21 · четыре несущие колонны';root.add(structure);
  const materials=new Set(),geometries=new Set();
  const steel=new THREE.MeshStandardMaterial({color:0x637680,metalness:.68,roughness:.35});
  const pad=new THREE.MeshStandardMaterial({color:0x263c47,metalness:.42,roughness:.53});
  const bolts=new THREE.MeshStandardMaterial({color:0xbfcbd0,metalness:.9,roughness:.28});
  [steel,pad,bolts].forEach(m=>materials.add(m));
  const add=(geo,mat,p,name)=>{geometries.add(geo);const mesh=new THREE.Mesh(geo,mat);mesh.position.fromArray(p);mesh.name=name;mesh.castShadow=mesh.receiveShadow=true;structure.add(mesh);return mesh;};
  const meshes=[];body.traverse(node=>{if(node.isMesh)meshes.push(node);});
  const ray=new THREE.Raycaster(),up=new THREE.Vector3(0,1,0),inverse=root.matrixWorld.clone().invert(),points=[];
  const parts=sourceCollisionParts.map(p=>({...p,min:[p.min[0],p.min[1]+lift,p.min[2]],max:[p.max[0],p.max[1]+lift,p.max[2]]}));
  for(const [index,[x,z]] of [[0,-5.5],[-.9,1],[.9,1],[0,4.8]].entries()){
    const origin=root.localToWorld(new THREE.Vector3(x,.1,z));ray.set(origin,up);ray.near=0;ray.far=8;
    const saved=new Map();for(const m of meshes)for(const mat of Array.isArray(m.material)?m.material:[m.material])if(mat&&!saved.has(mat)){saved.set(mat,mat.side);mat.side=THREE.DoubleSide;}
    let hits;try{hits=ray.intersectObjects(meshes,false);}finally{for(const [mat,side]of saved)mat.side=side;}
    const hit=hits.find(h=>h.point.clone().applyMatrix4(inverse).y>.15);
    if(!hit)throw new Error('Не найдена точка опоры под фюзеляжем МС-21.');
    const underside=hit.point.clone().applyMatrix4(inverse).y,top=underside+.012;
    add(new THREE.BoxGeometry(.50,.08,.50),pad,[x,.04,z],`МС-21 · плита опоры ${index+1}`);
    add(new THREE.CylinderGeometry(.145,.18,top-.11,20),steel,[x,.08+(top-.11)/2,z],`МС-21 · колонна ${index+1}`);
    add(new THREE.BoxGeometry(.40,.06,.40),steel,[x,top-.03,z],`МС-21 · оголовок ${index+1}`);
    for(const dx of[-.18,.18])for(const dz of[-.18,.18])add(new THREE.CylinderGeometry(.022,.022,.022,8),bolts,[x+dx,.091,z+dz],`МС-21 · анкер ${index+1}`);
    parts.push({id:`aircraft-column-${index+1}`,min:[x-.25,0,z-.25],max:[x+.25,top,z+.25],kind:'aircraft-support',socialTarget:false});
    points.push({localXZ:[x,z],heightMetres:top,measuredUndersideY:underside,topContactOverlapMetres:.012});
  }
  const state={liftMetres:lift,columns:points,sourceModelCut:false,sourceGeometryUnchanged:true,
    referenceFloorY:7.2,uppermostAirframeY:7.2+lift+4.153085515473356,
    limitingCeilingY:12.199999809265137,minimumTailCeilingClearanceMetres:12.199999809265137-7.2-lift-4.153085515473356,
    evidence:'assets/zones/physical-revisions-qa.json'};
  const api={root:structure,getState:()=>state,getCollisionParts:()=>parts,update:()=>false,
    dispose(){structure.removeFromParent();for(const child of [...body.children])root.add(child);body.removeFromParent();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());delete root.userData.aircraftSupports;installed.delete(root);}};
  root.userData.aircraftSupports=state;installed.set(root,api);return api;
}
