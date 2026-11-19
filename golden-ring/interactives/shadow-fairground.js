import {GLTFLoader} from './vendor/three-0.180/GLTFLoader.js';
import {mergeGeometries} from './vendor/three-0.180/BufferGeometryUtils.js';

const turn=Math.PI*2;
const clamp=x=>Math.min(1,Math.max(0,x));
const ease=x=>{x=clamp(x);return x*x*(3-2*x);};
const art=file=>new URL('./art/'+file,import.meta.url).href;
function batch(T,parent){
  parent.updateMatrixWorld(true);
  const inverse=new T.Matrix4().copy(parent.matrixWorld).invert(),groups=new Map();
  parent.traverse(n=>{
    if(!n.isMesh)return;
    let g=n.geometry.index?n.geometry.toNonIndexed():n.geometry.clone();
    for(const key of Object.keys(g.attributes))if(!['position','normal','uv'].includes(key))g.deleteAttribute(key);
    if(!g.attributes.uv)g.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
    g.applyMatrix4(new T.Matrix4().multiplyMatrices(inverse,n.matrixWorld));
    const list=groups.get(n.material)||[];list.push(g);groups.set(n.material,list);
  });
  parent.clear();
  for(const [m,parts] of groups){const result=mergeGeometries(parts);parent.add(new T.Mesh(result,m));parts.forEach(g=>g.dispose());}
}
export async function makeFairground(T){
  const loader=new T.TextureLoader(),tex=async file=>{
    const t=await loader.loadAsync(art(file));t.colorSpace=T.SRGBColorSpace;return t;
  };
  const [panorama,facade,puppet,profile]=await Promise.all([tex('fairground/fair-panorama.webp'),tex('fairground/show-booth.webp'),new GLTFLoader().loadAsync(art('fairground/puppet.glb')),fetch(art('fairground/crier-profile.json')).then(r=>r.json())]);
  const scene=new T.Scene(),camera=new T.OrthographicCamera(-8,8,3.22,-3.22,.1,45);
  camera.position.set(0,3.0,19);camera.lookAt(0,-.03,0);
  const target=new T.WebGLRenderTarget(1536,618,{depthBuffer:true,stencilBuffer:false});
  target.texture.colorSpace=T.SRGBColorSpace;target.texture.generateMipmaps=false;
  target.texture.minFilter=T.LinearFilter;
  const lit=(c,r=.71,m=.01)=>new T.MeshStandardMaterial({color:c,roughness:r,metalness:m,side:T.DoubleSide});
  const flat=c=>new T.MeshBasicMaterial({color:c,side:T.DoubleSide});
  const gild=lit(0xbc8d4b,.34,.40),chalk=lit(0xf5dfaf),red=lit(0x963327),blue=lit(0x36615a),umber=lit(0x543a2d),pine=lit(0x9c6840),iron=lit(0x554c48,.43,.3);
  function mesh(parent,geometry,material,x=0,y=0,z=0){const o=new T.Mesh(geometry,material);o.position.set(x,y,z);parent.add(o);return o;}
  function box(parent,x,y,z,w,h,d,m){return mesh(parent,new T.BoxGeometry(w,h,d),m,x,y,z);}
  function disc(parent,x,y,z,top,bottom,h,m,segments=36){return mesh(parent,new T.CylinderGeometry(top,bottom,h,segments),m,x,y,z);}
  function orb(parent,x,y,z,sx,sy,sz,m){const a=mesh(parent,new T.SphereGeometry(1,12,9),m,x,y,z);a.scale.set(sx,sy,sz);return a;}
  function plane(parent,t,x,y,z,w,h){
    const material=new T.MeshBasicMaterial({map:t,side:T.DoubleSide,alphaTest:.19,toneMapped:false});
    return mesh(parent,new T.PlaneGeometry(w,h),material,x,y,z);
  }
  function shape(points){
    const path=new T.Shape();points.forEach(([x,y],i)=>i?path.lineTo(x,y):path.moveTo(x,y));path.closePath();return path;
  }
  function cutout(parent,outline,thickness,material,x,y,z){
    return mesh(parent,new T.ExtrudeGeometry(outline,{depth:thickness,bevelEnabled:false,curveSegments:8}),material,x,y,z);
  }
  function fabric(parent,x,y,z,w,h,isLeft){
    const columns=44,rows=18,positions=[],indices=[];
    for(let iy=0;iy<=rows;iy++)for(let ix=0;ix<=columns;ix++){
      const u=ix/columns,v=iy/rows;
      positions.push(u,v,0);
      if(ix<columns&&iy<rows){const a=iy*(columns+1)+ix,b=a+1,c=a+columns+1,d=c+1;indices.push(a,b,d,a,d,c);}
    }
    const g=new T.BufferGeometry();const a=new T.Float32BufferAttribute(positions,3);g.setAttribute('position',a);g.setIndex(indices);
    const velvet=lit(0xb33228,.83);velvet.sheen=1;
    const panel=mesh(parent,g,velvet,x,y,z);
    const hemM=lit(0xd0a35a,.52,.16),positionsHem=new Float32Array((columns+1)*2*3);
    const hg=new T.BufferGeometry();const ha=new T.BufferAttribute(positionsHem,3);hg.setAttribute('position',ha);
    const hi=[];for(let i=0;i<columns;i++){const n=i*2;hi.push(n,n+2,n+3,n,n+3,n+1);}hg.setIndex(hi);
    const hem=mesh(parent,hg,hemM,x,y,z+.019);
    panel.frustumCulled=hem.frustumCulled=false;
    function xyz(u,v,op){
      const support=v*v,side=isLeft?1:-1,fold=Math.sin(u*turn*6.5+.7*v);
      const width=w*(1-op*(.80-.15*support));
      const innerEdgeLift=.36*op*Math.sin(.5*Math.PI*u)*Math.sin(v*Math.PI*.5);
      return [side*u*width,-h*v+innerEdgeLift+.045*Math.sin(6.5*turn*u)*v,.10*fold*(.6+.4*v)+.07*Math.sin(Math.PI*v)+.065*op*u];
    }
    return op=>{for(let iy=0;iy<=rows;iy++)for(let ix=0;ix<=columns;ix++)a.setXYZ(iy*(columns+1)+ix,...xyz(ix/columns,iy/rows,op));
      for(let i=0;i<=columns;i++){ha.setXYZ(i*2,...xyz(i/columns,.944,op));ha.setXYZ(i*2+1,...xyz(i/columns,.961,op));}
      a.needsUpdate=ha.needsUpdate=true;g.computeVertexNormals();hg.computeVertexNormals();};
  }

  scene.add(new T.HemisphereLight(0xffebc6,0xb8a18a,1.6));
  const sun=new T.DirectionalLight(0xffd197,2.3);sun.position.set(-4,7,9);scene.add(sun);
  const bounce=new T.DirectionalLight(0x9bc5dd,.56);bounce.position.set(7,4,-2);scene.add(bounce);
  const back=plane(scene,panorama,0,-.46,-3.2,16.8,7.2);
  // A painted stage set has a carpenter's depth, cloth in front of the performers and warm footlights.
  const booth=new T.Group();scene.add(booth);booth.position.set(-1.30,-2.54,.24);
  const frameW=6.55,frameH=5.50;
  const scenery=new T.Group();booth.add(scenery);
  box(scenery,0,2.13,-.46,4.45,3.14,.08,umber);
  const innerLight=flat(0xe8b467);
  box(scenery,0,2.15,-.40,4.23,2.96,.026,innerLight);
  for(let i=0;i<13;i++){
    const theta=i*turn/13;
    const r=1.53,w=.10,geo=shape([[0,0],[Math.cos(theta-w)*r,Math.sin(theta-w)*r],[Math.cos(theta+w)*r,Math.sin(theta+w)*r]]);
    cutout(scenery,geo,.004,flat(i%2?0xd7a35b:0xdca860),0,2.02,-.34);
  }
  for(const s of [-1,1])box(scenery,s*2.10,2,-.02,.16,3.8,.82,umber);
  for(let i=0;i<19;i++)box(scenery,-2.10+i*.232,.57,.09,.212,.08,.85,i%3?pine:umber);
  batch(T,scenery);
  const facadeMesh=plane(booth,facade,0,frameH/2,.43,frameW,frameH);
  const curtainAnchorY=2.80,curtainLow=.59,openingWidth=4.32;
  const wings=[fabric(booth,-openingWidth/2,curtainAnchorY,.07,openingWidth/2+.055,curtainAnchorY-curtainLow,true),fabric(booth,openingWidth/2,curtainAnchorY,.077,openingWidth/2+.055,curtainAnchorY-curtainLow,false)];

  // The performer is a painted articulated puppet, visible only through the real stage aperture.
  const player=new T.Group();booth.add(player);player.position.set(.07,.64,-.15);
  const boots=lit(0x493e32);
  function puppetLayer(parent,pts,m,z){return cutout(parent,shape(pts),.035,m,0,0,z);}
  const actor=puppet.scene;
  const bounds=new T.Box3().setFromObject(actor),center=bounds.getCenter(new T.Vector3());
  const scale=1.51/(bounds.max.y-bounds.min.y);
  actor.scale.setScalar(scale);actor.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
  player.add(actor);
  const joints=[];
  actor.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const pos=mesh.geometry.attributes.position,base=pos.array.slice();
    const box=new T.Box3().setFromBufferAttribute(pos),size=box.getSize(new T.Vector3());
    const indices=[];
    for(let i=0;i<pos.count;i++){
      const u=(pos.getX(i)-box.min.x)/size.x,v=(pos.getY(i)-box.min.y)/size.y;
      const w=ease((.45-u)/.19)*ease((v-.52)/.15);
      if(w>0)indices.push([i,w]);
    }
    joints.push({pos,base,indices,x:box.min.x+.39*size.x,y:box.min.y+.72*size.y});
  });
  function perform(t,life){
    const swing=.17*life*Math.sin(t*4.45);
    for(const {pos,base,indices,x,y} of joints){
      for(const [i,w] of indices){
        const dx=base[i*3]-x,dy=base[i*3+1]-y,c=Math.cos(w*swing),s=Math.sin(w*swing);
        pos.setXY(i,x+dx*c-dy*s,y+dx*s+dy*c);
      }
      pos.needsUpdate=true;
    }
    player.rotation.y=.13*Math.sin(t*2.23)*life;
    player.position.y=.64+.025*life*(1-Math.cos(t*4.45));
  }
  const carousel=new T.Group();carousel.position.set(4.53,-2.12,.02);scene.add(carousel);
  const footing=new T.Group();carousel.add(footing);
  disc(footing,0,.05,0,1.75,1.81,.15,blue);disc(footing,0,.17,0,1.67,1.73,.10,gild);
  disc(footing,0,1.53,0,.14,.19,2.75,pine);
  for(let i=0;i<10;i++)disc(footing,0,.48+i*.20,0,.21,.18,.055,i%2?gild:red);
  const roof=new T.Group();footing.add(roof);
  for(let i=0;i<20;i++){
    const t0=i*turn/20,t1=(i+1)*turn/20,pts=[],idx=[];
    const rings=[[.025,3.54],[.35,3.46],[.90,3.18],[1.50,2.96],[1.88,2.91]];
    for(const [r,y] of rings)for(let j=0;j<=4;j++){const t=t0+(t1-t0)*j/4;pts.push(Math.sin(t)*r,y,Math.cos(t)*r);}
    for(let j=0;j<4;j++)for(let k=0;k<4;k++){const a=j*5+k;idx.push(a,a+5,a+6,a,a+6,a+1);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pts,3));g.setIndex(idx);g.computeVertexNormals();mesh(roof,g,i%2?chalk:red);
    const ang=(t0+t1)/2,trim=cutout(roof,shape([[-.299,0],[.299,0],[.28,-.13],[.18,-.24],[0,-.32],[-.18,-.24],[-.28,-.13]]),.024,i%2?blue:red,Math.sin(ang)*1.85,2.91,Math.cos(ang)*1.85);trim.rotation.y=ang;
    orb(roof,Math.sin(ang)*1.88,2.77,Math.cos(ang)*1.88,.034,.034,.034,gild);
  }
  for(const [h,r] of [[2.91,1.88],[.27,1.69]]){const ring=mesh(footing,new T.TorusGeometry(r,.028,8,84),gild,0,h,0);ring.rotation.x=-Math.PI/2;}
  orb(footing,0,3.6,0,.10,.10,.10,gild);disc(footing,0,3.78,0,.023,.027,.34,gild);
  const flag=puppetLayer(footing,[[0,3.97],[.55,3.92],[.40,3.80],[0,3.83]],red,.0);
  batch(T,footing);
  const drumGroup=new T.Group();carousel.add(drumGroup);
  disc(drumGroup,0,.25,0,1.69,1.65,.16,pine);
  const posts=new T.Group();drumGroup.add(posts);
  const horseShape=shape([[-.59,.02],[-.70,.09],[-.76,.23],[-.73,.48],[-.61,.40],[-.64,.25],[-.55,.19],[-.44,.32],[-.17,.35],[.08,.33],[.27,.52],[.32,.67],[.44,.77],[.52,.90],[.57,.73],[.69,.73],[.78,.61],[.87,.53],[.84,.45],[.75,.42],[.58,.49],[.53,.41],[.51,.21],[.40,.05],[.42,-.02],[.64,-.06],[.68,-.30],[.77,-.33],[.73,-.41],[.57,-.38],[.54,-.19],[.33,-.16],[.16,-.03],[-.11,-.05],[-.24,-.14],[-.33,-.34],[-.50,-.41],[-.56,-.36],[-.44,-.27],[-.42,-.03],[-.49,.06]]);
  const horses=[];
  for(let i=0;i<7;i++){
    const a=turn*i/7,r=1.18,x=Math.sin(a)*r,z=Math.cos(a)*r;
    disc(posts,x,1.57,z,.025,.028,2.52,gild,12);
    const mount=new T.Group();mount.position.set(x,1.10,z);mount.rotation.y=a;mount.scale.setScalar(.74);drumGroup.add(mount);
    const m=i%3===0?pine:i%3===1?chalk:lit(0xae7046);
    const horse=cutout(mount,horseShape,.16,m,-.03,0,-.08);
    for(const face of [-1,1]){
      const zz=face*.09;
      puppetLayer(mount,[[-.33,.31],[-.18,.34],[.05,.31],[.11,.18],[.01,.07],[-.27,.11]],i%2?red:blue,zz);
      orb(mount,.62,.62,zz,.028,.029,.017,boots);
      for(let k=0;k<3;k++)orb(mount,.34+.05*k,.58+.05*k,zz,.05,.06,.018,gild);
    }
    batch(T,mount);horses.push(mount);
  }
  batch(T,posts);

  // A peep-show cart recalls the fairground rayok. Three brass eyeholes convey its scale and use.
  const rayok=new T.Group();scene.add(rayok);rayok.position.set(-5.67,-2.01,-.09);
  box(rayok,0,1.04,0,1.75,.95,.73,blue);box(rayok,0,1.64,0,1.93,.17,.88,gild);
  const lid=cutout(rayok,shape([[-.98,1.70],[0,2.25],[.98,1.70]]),.90,red,0,0,-.45);
  for(const x of [-.49,0,.49]){const rim=mesh(rayok,new T.TorusGeometry(.125,.034,10,25),gild,x,1.22,.38);const view=mesh(rayok,new T.CircleGeometry(.102,26),umber,x,1.22,.38);}
  for(const x of [-.7,.7]){const wheel=mesh(rayok,new T.TorusGeometry(.27,.052,9,24),umber,x,.31,.28);for(let j=0;j<4;j++){const spoke=box(rayok,x,.31,.28,.53,.025,.04,gild);spoke.rotation.z=j*Math.PI/4;}}
  for(const x of [-.77,.77])box(rayok,x,.98,.38,.034,.86,.042,gild);
  batch(T,rayok);

  const silhouette=shape(profile.profile_mm.map(([x,y])=>[x/64,y/64]));
  for(const loop of profile.cutouts_mm){const path=new T.Path();loop.forEach(([x,y],i)=>i?path.lineTo(x/64,y/64):path.moveTo(x/64,y/64));path.closePath();silhouette.holes.push(path);}
  const barker=cutout(scene,silhouette,.019,flat(0x3f2b21),-3.95,-2.14,1.08);
  const lamps=new T.Group();booth.add(lamps);
  const lampMat=new T.MeshBasicMaterial({color:0xffdfa3,toneMapped:false});
  for(let i=0;i<13;i++)orb(lamps,-2.10+i*.35,.62,.54,.032,.032,.03,lampMat);
  batch(T,lamps);
  let prev='',dirty=true;
  function redraw(position,elapsed=0,approach=1){
    const p=clamp(position),t=Math.max(0,elapsed),op=ease((t-.20)/2.45),life=ease((t-2.1)/3);
    const stamp=[p.toFixed(4),t.toFixed(3),approach.toFixed(3)].join('/');
    if(stamp===prev)return;prev=stamp;dirty=true;
    wings.forEach(set=>set(op));lamps.visible=t>.14;perform(t,life);
    barker.position.x=-4.34+1.53*p;barker.position.y=-2.17+.20*p;barker.scale.setScalar(1.01+.42*p);
    drumGroup.rotation.y=.38+Math.max(0,t-2.10)*.64*life;
    horses.forEach((o,i)=>o.position.y=1.09+.13*life*Math.sin(t*2+i*1.75));
    const light=.40+.32*clamp(approach)+.28*life;
    back.material.color.setRGB(light,light*.98,light*.92);
    facadeMesh.material.color.setRGB(.70+.30*light,.72+.26*light,.69+.25*light);
    sun.intensity=.94+1.35*light;
  }
  function render(renderer){
    if(!dirty)return;dirty=false;const prevTarget=renderer.getRenderTarget(),shadows=renderer.shadowMap.enabled;
    renderer.shadowMap.enabled=false;renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera);renderer.setRenderTarget(prevTarget);renderer.shadowMap.enabled=shadows;
  }
  redraw(0,0,0);
  return {texture:target.texture,redraw,render};
}
