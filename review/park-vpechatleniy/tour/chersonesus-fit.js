import * as THREE from 'three';

// A deliberate exhibition adaptation of O16, after max24 normalization and
// floorDatumOffset=.31. The human-height axis stays unchanged. A real opening
// is cut from the triangles; it is never a visual shader or a collision bypass.
export const CHERSONESUS_COMPACT_FIT = Object.freeze({
  sourceWidth:10.58707196484, sourceLength:24,
  width:8.9, length:14, height:5.5306885186,
  portal:{ min:[2.75,-.08,-6.2], max:[4.7,2.7,-3.5],
    clearWidth:2.4, clearHeight:2.5, centerZ:-4.85 },
  frame:[
    // Recess the two real stone posts 0.45 m from the outer facade. The
    // existing lift queue remains clear; their colliders follow the geometry.
    {id:'compact-portal-left',min:[3.25,0,-6.21],max:[4,2.7,-6.05]},
    {id:'compact-portal-right',min:[3.25,0,-3.65],max:[4,2.7,-3.49]},
    {id:'compact-portal-lintel',min:[3.7,2.5,-6.21],max:[4.45,2.7,-3.49]},
  ],
});
function halfspace(poly,axis,value,greater){
  const out=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],da=(a[axis]-value)*(greater?1:-1),db=(b[axis]-value)*(greater?1:-1);
    const ia=da>=-1e-8,ib=db>=-1e-8;
    if(ia)out.push(a);
    if(ia!==ib){const t=da/(da-db);out.push(a.map((v,k)=>v+t*(b[k]-v)));}
  }
  return out;
}
export function subtractBoxFromTriangle(vertices,min,max){
  let remaining=vertices;const pieces=[];
  for(let axis=0;axis<3;axis++)for(const [value,greater]of [[min[axis],true],[max[axis],false]]){
    if(!remaining.length)break;
    const outside=halfspace(remaining,axis,value,!greater);
    if(outside.length>=3)pieces.push(outside);
    remaining=halfspace(remaining,axis,value,greater);
  }
  return pieces;
}
export function fitCompactTriangleSoup(input,fit=CHERSONESUS_COMPACT_FIT){
  const sx=fit.width/fit.sourceWidth,sz=fit.length/fit.sourceLength,out=[];
  for(let i=0;i<input.length;i+=9){
    const tri=[];for(let k=0;k<3;k++)tri.push([input[i+k*3]*sx,input[i+k*3+1],input[i+k*3+2]*sz]);
    for(const poly of subtractBoxFromTriangle(tri,fit.portal.min,fit.portal.max))for(let k=1;k+1<poly.length;k++)out.push(...poly[0],...poly[k],...poly[k+1]);
  }
  return new Float32Array(out);
}

/** Apply before attaching the interior, and after max24/datum normalization. */
export function applyChersonesusCompactFit(root,fit=CHERSONESUS_COMPACT_FIT){
  if(root.userData.chersonesusCompactFit)return root.userData.chersonesusCompactFit;
  root.updateWorldMatrix(true,true);
  const invRoot=root.matrixWorld.clone().invert(),sx=fit.width/fit.sourceWidth,sz=fit.length/fit.sourceLength;
  const meshes=[];root.traverse(o=>{if(o.isMesh&&o.geometry?.attributes.position)meshes.push(o);});
  let inputTriangles=0,outputTriangles=0;
  for(const mesh of meshes){
    const source=mesh.geometry,index=source.index,attrs=Object.entries(source.attributes).filter(([name])=>name!=='normal'&&name!=='tangent');
    const sourceToRoot=new THREE.Matrix4().multiplyMatrices(invRoot,mesh.matrixWorld),rootToSource=sourceToRoot.clone().invert();
    const layout=[],values={};let stride=3;
    for(const [name,attr]of attrs)if(name!=='position'){layout.push({name,attr,offset:stride});stride+=attr.itemSize;values[name]=[];}
    const positions=[],groups=[];const vertex=new THREE.Vector3();
    const groupsIn=source.groups.length?source.groups:[{start:0,count:index?index.count:source.attributes.position.count,materialIndex:0}];
    for(const group of groupsIn){
      const start=positions.length/3;
      for(let t=group.start;t<group.start+group.count;t+=3){
        const tri=[];inputTriangles++;
        for(let k=0;k<3;k++){
          const n=index?index.getX(t+k):t+k;vertex.fromBufferAttribute(source.attributes.position,n).applyMatrix4(sourceToRoot);
          const p=[vertex.x*sx,vertex.y,vertex.z*sz];
          // GLTFLoader may expose quantized/interleaved UVs. Attribute getters
          // apply normalization and byte stride; raw .array indexing does not.
          for(const item of layout)for(let c=0;c<item.attr.itemSize;c++)p.push(item.attr[['getX','getY','getZ','getW'][c]](n));
          tri.push(p);
        }
        for(const poly of subtractBoxFromTriangle(tri,fit.portal.min,fit.portal.max))for(let k=1;k+1<poly.length;k++){
          outputTriangles++;
          for(const p of [poly[0],poly[k],poly[k+1]]){
            vertex.set(p[0],p[1],p[2]).applyMatrix4(rootToSource);positions.push(...vertex.toArray());
            for(const item of layout)for(let c=0;c<item.attr.itemSize;c++)values[item.name].push(p[item.offset+c]);
          }
        }
      }
      groups.push({start,count:positions.length/3-start,materialIndex:group.materialIndex});
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    for(const item of layout)geometry.setAttribute(item.name,new THREE.Float32BufferAttribute(values[item.name],item.attr.itemSize));
    for(const group of groups)geometry.addGroup(group.start,group.count,group.materialIndex);
    geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();mesh.geometry=geometry;
    // The loader owns the source geometry; do not dispose a shared source here.
  }
  const frameRoot=new THREE.Group();frameRoot.name='Херсонес · открытый портал 2.4 × 2.5 м';root.add(frameRoot);
  const stone=new THREE.MeshStandardMaterial({color:0xc9b99d,roughness:.9});
  for(const part of fit.frame){
    const box=new THREE.Box3(new THREE.Vector3(...part.min),new THREE.Vector3(...part.max)),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size.toArray()),stone);mesh.position.copy(center);mesh.name=part.id;frameRoot.add(mesh);
  }
  const report={...fit,inputTriangles,outputTriangles,provenance:'Project fit of the supplied O16 mesh; horizontal proportions adapted, human height unchanged; triangles cut for an open entrance and a procedural stone frame added.'};
  root.userData.chersonesusCompactFit=report;return report;
}

/** Existing detailed body voxels follow the same fit and doorway subtraction. */
export function fitChersonesusCollisionParts(parts,fit=CHERSONESUS_COMPACT_FIT){
  const sx=fit.width/fit.sourceWidth,sz=fit.length/fit.sourceLength,out=[];
  for(const p of parts){
    const min=[p.min[0]*sx,p.min[1],p.min[2]*sz],max=[p.max[0]*sx,p.max[1],p.max[2]*sz];
    let remain={min,max};let serial=0;
    for(let axis=0;axis<3;axis++){
      if(!remain)break;
      if(remain.max[axis]<=fit.portal.min[axis]||remain.min[axis]>=fit.portal.max[axis]){out.push({id:p.id,min:remain.min,max:remain.max});remain=null;break;}
      if(remain.min[axis]<fit.portal.min[axis]){const hi=remain.max.slice();hi[axis]=fit.portal.min[axis];out.push({id:p.id+'-fit-'+serial++,min:remain.min.slice(),max:hi});remain.min=remain.min.slice();remain.min[axis]=fit.portal.min[axis];}
      if(remain.max[axis]>fit.portal.max[axis]){const lo=remain.min.slice();lo[axis]=fit.portal.max[axis];out.push({id:p.id+'-fit-'+serial++,min:lo,max:remain.max.slice()});remain.max=remain.max.slice();remain.max[axis]=fit.portal.max[axis];}
    }
  }
  return [...out,...fit.frame.map(p=>({id:p.id,min:p.min.slice(),max:p.max.slice()}))];
}
