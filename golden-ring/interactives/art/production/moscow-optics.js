// The tabletop screen receives the outline of the actual moving cutout. Points
// are projected from the measured optical aperture; the screen clips the image.
export function buildTabletopOptics(T,scene,body,bounds,plan,movingParts){
  if(!plan.lamp||!plan.screenLimits||!movingParts.length)return null;
  const size=bounds.getSize(new T.Vector3());
  const point=normalized=>new T.Vector3(...normalized).multiply(size).add(bounds.min);
  const lamp=point(plan.lamp),x=point([plan.screenPlane,0,0]).x;
  const [ay,by,az,bz]=plan.screenLimits;
  const lower=point([0,ay,az]),upper=point([0,by,bz]);
  const screen=new T.Mesh(new T.PlaneGeometry(upper.z-lower.z,upper.y-lower.y),
    new T.MeshStandardMaterial({color:0xe9d7ae,roughness:.92,metalness:0,side:T.DoubleSide,emissive:0xffdbaa,emissiveIntensity:.13}));
  screen.name='TabletopMatte';screen.rotation.y=-Math.PI/2;
  screen.position.set(x,(lower.y+upper.y)/2,(lower.z+upper.z)/2);scene.add(screen);
  const image=new T.ShaderMaterial({
    uniforms:{aperture:{value:lamp},screenX:{value:x-.0015},extent:{value:new T.Vector4(lower.y,upper.y,lower.z,upper.z)}},
    side:T.DoubleSide,depthWrite:false,
    vertexShader:`uniform vec3 aperture;uniform float screenX;varying vec2 yz;
      void main(){vec3 source=(modelMatrix*vec4(position,1.0)).xyz;
      float t=(screenX-aperture.x)/max(.01,source.x-aperture.x);
      vec3 hit=aperture+(source-aperture)*t; yz=hit.yz;
      gl_Position=projectionMatrix*viewMatrix*vec4(hit,1.0);}`,
    fragmentShader:`uniform vec4 extent;varying vec2 yz;void main(){
      if(yz.x<extent.x||yz.x>extent.y||yz.y<extent.z||yz.y>extent.w) discard;
      gl_FragColor=vec4(.074,.062,.042,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
  });
  const leaves=[];
  for(const part of movingParts)part.traverse(n=>{if(n.isMesh)leaves.push(n);});
  for(const original of leaves){
    const projected=new T.Mesh(original.geometry,image);
    projected.name='Actual silhouette on the matte screen';
    projected.frustumCulled=false;projected.renderOrder=2;original.add(projected);
  }
  function captureTarget(){
    const pts=[];
    for(const original of leaves){
      original.updateWorldMatrix(true,false);
      const edges=new T.EdgesGeometry(original.geometry,38),v=edges.getAttribute('position');
      for(let n=0;n<v.count;n++){
        const world=new T.Vector3().fromBufferAttribute(v,n).applyMatrix4(original.matrixWorld);
        const reach=(x-lamp.x)/(world.x-lamp.x);
        pts.push(x-.0008,lamp.y+(world.y-lamp.y)*reach,lamp.z+(world.z-lamp.z)*reach);
      }
      edges.dispose();
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pts,3));
    const outline=new T.LineSegments(g,new T.LineBasicMaterial({color:0x9b7042,transparent:true,opacity:.56,depthWrite:false}));
    outline.name='Registration mark on diffuser';scene.add(outline);
  }
  return {apertureMm:lamp.toArray().map(v=>Math.round(v*1000)),screenXmm:Math.round(x*1000),
    usableScreenMm:[Math.round((upper.z-lower.z)*1000),Math.round((upper.y-lower.y)*1000)],captureTarget};
}
