export function brushStroke(T,scene,body,center){
  const positions=[],indices=[],points=[];
  const ray=new T.Raycaster(),down=new T.Vector3(0,-1,0),count=64;
  for(let i=0;i<=count;i++){
    const u=i/count,x=center.x-.057+.106*u,z=center.z+.034-.056*Math.sin(u*Math.PI*.94);
    ray.set(new T.Vector3(x,center.y+.092,z),down);
    const hit=ray.intersectObject(body,true).find(h=>h.distance<.19);
    const y=(hit?hit.point.y:center.y)+.0014;
    points.push(new T.Vector3(x,y,z));
    const half=.0006+.0072*Math.sin(Math.PI*u)**.8;
    positions.push(x,y,z-half,x,y,z+half);
    if(i){const a=2*i-2;indices.push(a,a+1,a+2,a+2,a+1,a+3);}
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  geometry.setDrawRange(0,0);
  scene.add(new T.Mesh(geometry,new T.MeshStandardMaterial({color:0xcb5477,side:T.DoubleSide,roughness:.56})));
  return (progress,tip)=>{
    const f=progress*count,i=Math.min(count-1,Math.floor(f));
    geometry.setDrawRange(0,Math.round(f)*6);
    return tip.copy(points[i]).lerp(points[i+1],f-i);
  };
}

// The overhead camera feeds the very same painted dish and brush to the wall.
export function craftCamera(T){
  const target=new T.WebGLRenderTarget(1280,516,{stencilBuffer:false});
  target.texture.colorSpace=T.SRGBColorSpace;
  const camera=new T.OrthographicCamera(-.62,.62,.25,-.25,.07,.85);
  let scene,display;
  function connect(gallery,screen,anchors){
    scene=gallery;display=screen;
    camera.position.fromArray(anchors.CameraHead);
    camera.up.set(0,0,-1);
    camera.lookAt(new T.Vector3(...anchors.PlateCentre));
  }
  function render(renderer){
    if(!scene)return;
    const before=renderer.getRenderTarget(),shadows=renderer.shadowMap.autoUpdate;
    display.visible=false;renderer.shadowMap.autoUpdate=false;
    renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera);
    renderer.setRenderTarget(before);renderer.shadowMap.autoUpdate=shadows;display.visible=true;
  }
  return {texture:target.texture,connect,redraw(){},render};
}
