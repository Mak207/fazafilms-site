// Metalwork is constructed from the same bracket and M8 hole centres as the assembly drawing.
export function mountSpeaker(T,holder,params){
  if(!params?.['BL-07'])return;
  const satin=new T.MeshStandardMaterial({color:0x383737,roughness:.53,metalness:.73});
  const dark=new T.MeshStandardMaterial({color:0x25272a,roughness:.80,metalness:.32});
  const bright=new T.MeshStandardMaterial({color:0x9a9b97,roughness:.29,metalness:.82});
  const add=(geom,mat,pos)=>{const m=new T.Mesh(geom,mat);m.position.set(...pos);m.receiveShadow=m.castShadow=true;holder.add(m);return m;};
  for(const key of ['BL-08','BL-09']){const p=params[key];if(p)add(new T.BoxGeometry(...p.size),satin,p.position);}
  const box=params['BL-07'],[w,h,d]=box.size,[x,y,z]=box.position,r=.010,s=new T.Shape();
  s.moveTo(-w/2+r,-h/2);s.lineTo(w/2-r,-h/2);s.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);s.lineTo(w/2,h/2-r);s.quadraticCurveTo(w/2,h/2,w/2-r,h/2);s.lineTo(-w/2+r,h/2);s.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);s.lineTo(-w/2,-h/2+r);s.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);
  add(new T.ExtrudeGeometry(s,{depth:d-.005,bevelEnabled:true,bevelThickness:.0025,bevelSize:.0025,bevelSegments:2}),dark,[x,y,z-d/2+.0025]);
  // The grille faces away from the timber post, on the outside of the stationary frame.
  const plate=add(new T.CylinderGeometry(.064,.064,.004,48),satin,[x+w/2+.002,y,z]);plate.rotation.z=-Math.PI/2;
  const holes=[];for(let a=-7;a<=7;a++)for(let b=-7;b<=7;b++){if(a*a+b*b<52)holes.push([a,b]);}
  const im=new T.InstancedMesh(new T.CircleGeometry(.0023,7),dark,holes.length),dummy=new T.Object3D();
  holes.forEach(([a,b],i)=>{dummy.position.set(x+w/2+.0044,y+a*.008,z+b*.008);dummy.rotation.y=Math.PI/2;dummy.updateMatrix();im.setMatrixAt(i,dummy.matrix);});holder.add(im);
  for(const p of params.bolts||[]){const washer=add(new T.CylinderGeometry(.008,.008,.002,20),bright,p);washer.rotation.x=Math.PI/2;const head=add(new T.CylinderGeometry(.0064,.0064,.005,6),satin,[p[0],p[1],p[2]+.003]);head.rotation.x=Math.PI/2;}
}
