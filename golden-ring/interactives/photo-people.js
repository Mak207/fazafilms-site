/* AI photographic performers, posed in the instrument's coordinate system.
   The active hand follows the same measured target as the loading mechanism. */
export function createPhotoPeople(scene,T,camera,id){
  const loader=new T.TextureLoader();
  const figures=new Map(), textures=new Map();
  let serial=0;
  function texture(name){
    if(!textures.has(name)){
      const promise=loader.loadAsync('art/cast/'+name+'.webp').then(t=>{
        t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;return t;
      });
      textures.set(name,promise);
    }
    return textures.get(name);
  }
  const stamp=document.createElement('canvas');stamp.width=stamp.height=96;
  const c=stamp.getContext('2d'),g=c.createRadialGradient(48,48,5,48,48,47);
  g.addColorStop(0,'rgba(15,11,9,.42)');g.addColorStop(1,'rgba(15,11,9,0)');c.fillStyle=g;c.fillRect(0,0,96,96);
  const shadowTexture=new T.CanvasTexture(stamp);
  function make(person){
    const order=serial++,active=person.role==='user';
    const secondWeaver=id==='loom'&&order===2;
    const kind=active?(id==='bells'?'idle':id==='barge'||secondWeaver?'pull':id==='regional'?'wipe':'visitor'):order===1?'observer':'companion';
    const height=kind==='pull'?1.48:active?1.67:order===1?1.78:1.63;
    const geo=new T.PlaneGeometry(1,1,55,65);
    const mat=new T.MeshBasicMaterial({transparent:true,alphaTest:.28,side:T.DoubleSide,toneMapped:false});
    const plane=new T.Mesh(geo,mat);plane.visible=false;plane.frustumCulled=false;
    const container=new T.Group();container.add(plane);scene.add(container);
    const shadow=new T.Mesh(new T.PlaneGeometry(.62,.32),new T.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false}));
    shadow.rotation.x=-Math.PI/2;scene.add(shadow);
    const state={plane,container,shadow,height,geo,kind,active,ready:false,order};
    Promise.all([texture(kind),active&&kind==='visitor'?texture('idle'):Promise.resolve(null)]).then(([t,idle])=>{mat.map=t;state.actionTexture=t;state.idleTexture=idle;mat.needsUpdate=true;state.ready=true;});
    figures.set(person,state);return state;
  }
  function sync(cast){ for(const p of cast){if(!figures.has(p))make(p);} }
  const smooth=(a,b,x)=>T.MathUtils.smoothstep(x,a,b);
  // UV landmarks were measured on the transparent source photos. Feet stay on
  // the floor. The cuff and hand turn together about the shoulder in metres.
  const rigs={
    visitor:{hand:[.035,.589],shoulder:[.72,.794],pivot:.72},
    pull:{hand:[.205,.596],shoulder:[.77,.785],pivot:.76},
    wipe:{hand:[.035,.836],shoulder:[.70,.784],pivot:.71}
  };
  function armWeight(kind,u,v){
    if(kind==='wipe'){
      const shoulder=(1-smooth(.37,.62,u))*(1-smooth(.792,.816,v));
      const raisedPalm=1-smooth(.13,.23,u);
      return Math.max(shoulder,raisedPalm)*smooth(.69,.745,v);
    }
    if(kind==='pull')return (1-smooth(.44,.76,u))*smooth(.53,.59,v)*(1-smooth(.785,.84,v));
    const sleeve=1-smooth(.040,.095,Math.abs(v-(.583+.255*u)));
    return (1-smooth(.37,.68,u))*sleeve*smooth(.535,.572,v)*(1-smooth(.755,.81,v));
  }
  function align(view){
    for(const [p,f] of figures){
      if(!f.ready)continue;
      const h=f.height,g=f.container,source=p.contact||p.target;
      const rig=rigs[f.kind],acting=f.active&&rig&&source;
      const mat=f.plane.material;
      // Keep an identical performer between the action and its release; use the
      // photographic rest pose only before a station has a blocking target.
      mat.map=f.idleTexture&&!acting?f.idleTexture:f.actionTexture;
      const w=h*mat.map.image.width/mat.map.image.height;
      let rx,rz,angle=0,lean=0,shiftX=0,shiftZ=0;
      const pivot=acting?rig.pivot:.5,baseY=p.y||0;
      if(acting){
        [rx,rz]=p.stanceAxis||[.81,.59];const len=Math.hypot(rx,rz);rx/=len;rz/=len;
        // A photographic slice has no back volume. At grazing angles preserve
        // a three-quarter profile about the fixed contact point.
        let ex=camera.position.x-source[0],ez=camera.position.z-source[2];
        const distance=Math.hypot(ex,ez)||1;ex/=distance;ez/=distance;
        const projected=rx*ez-rz*ex;
        if(Math.abs(projected)<.68){
          const side=Math.abs(projected)<.10?Math.sign(rx*ez||1):Math.sign(projected);
          const near=Math.sign(rx*ex+rz*ez)||1;
          const depth=Math.sqrt(1-.68*.68)*near;
          rx=.68*side*ez+depth*ex;rz=-.68*side*ex+depth*ez;
        }
        lean=f.kind==='visitor'?(id==='soundmap'?.19:id==='craft'?.13:id==='shadow'?.09:.045):0;
        const dx=(rig.hand[0]-rig.shoulder[0])*w,dy=(rig.hand[1]-rig.shoulder[1])*h;
        // Invert a rigid shoulder rotation for contact height. Blending is
        // confined to the sleeve; head, legs and the resting hand stay intact.
        const handTorsoY=(rig.hand[0]-.72)*w*Math.sin(lean)+(rig.hand[1]-.50)*h*Math.cos(lean)+.50*h;
        const want=source[1]-baseY-handTorsoY;
        let lo=-.76,hi=.90;
        for(let j=0;j<15;j++){const a=(lo+hi)/2;const lift=dx*Math.sin(a)+dy*(Math.cos(a)-1);if(lift>want)lo=a;else hi=a;}
        angle=(lo+hi)/2;
      }else{
        const dx=camera.position.x-p.x,dz=camera.position.z-p.z,dist=Math.hypot(dx,dz)||1;
        rx=dz/dist;rz=-dx/dist;
        if(Math.sin(p.heading||0)*rx+Math.cos(p.heading||0)*rz>0){rx=-rx;rz=-rz;}
      }
      g.rotation.y=Math.atan2(-rz,rx);
      const sn=Math.sin(angle),cs=Math.cos(angle),sl=Math.sin(lean),cl=Math.cos(lean);
      function shape(u,v){
        let x=(u-pivot)*w,y=v*h;
        if(!acting)return [x,y,0];
        const torso=smooth(.42,.56,v),tx=(u-.72)*w,ty=(v-.50)*h;
        x+=(tx*(cl-1)-ty*sl)*torso;y+=(tx*sl+ty*(cl-1))*torso;
        if(id==='soundmap'&&f.kind==='visitor'){
          const neck=smooth(.812,.85,v),nx=(u-.66)*w,ny=(v-.84)*h;
          x+=(nx*(.98723-1)-ny*.15932)*neck;y+=(nx*.15932+ny*(.98723-1))*neck;
        }
        const weight=armWeight(f.kind,u,v),ax=(u-rig.shoulder[0])*w,ay=(v-rig.shoulder[1])*h;
        return [x+(ax*(cs-1)-ay*sn)*weight,y+(ax*sn+ay*(cs-1))*weight,weight];
      }
      if(acting){
        const hand=shape(...rig.hand);
        const nearX=source[0]-rx*hand[0],nearZ=source[2]-rz*hand[0];
        const clearance=p.footClearance;
        if(clearance){
          // The tip of the nearest shoe is read from the photo, at floor height.
          const footU=f.kind==='pull'?.015:f.kind==='wipe'?.34:.32;
          const left=(footU-pivot)*w,right=(.98-pivot)*w;
          if(clearance.z!=null)shiftZ=Math.min(.33,Math.max(0,clearance.z-Math.min(nearZ+rz*left,nearZ+rz*right)));
          if(clearance.x!=null)shiftX=Math.max(-.34,Math.min(0,clearance.x-Math.max(nearX+rx*left,nearX+rx*right)));
        }
        g.position.set(nearX+shiftX,baseY,nearZ+shiftZ);
      }else g.position.set(p.x,baseY,p.z);
      const pos=f.geo.attributes.position,uv=f.geo.attributes.uv;
      for(let i=0;i<pos.count;i++){
        const [x,y,weight]=shape(uv.getX(i),uv.getY(i));
        const sx=-shiftX*weight,sz=-shiftZ*weight;
        pos.setXYZ(i,x+sx*rx+sz*rz,y,-sx*rz+sz*rx);
      }
      pos.needsUpdate=true;f.shadow.position.set(g.position.x,baseY+.003,g.position.z);
      const distance=Math.hypot(camera.position.x-g.position.x,camera.position.z-g.position.z);
      f.plane.visible=view!=='detail'||distance>.78;
    }
  }
  return {sync,align,readyFor:p=>figures.get(p)?.ready===true};
}
