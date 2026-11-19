import * as THREE from './vendor/three-0.180/three.module.min.js';
import { scannedSurfaces } from './spatial-surfaces.js';
import { createPeople } from './spatial-people.js';
import { stageObjects } from './spatial-objects.js';
import { createMoscowDevices } from './art/production/moscow-devices.js';

// All dimensions and texture coordinates use the same model space as picking and the sectional views.
const colourCache = new Map();
const vector = p => new THREE.Vector3(p[0], p[1], p[2]);
function colour(hex) {
  if (!colourCache.has(hex)) colourCache.set(hex, new THREE.Color(hex).toArray());
  return colourCache.get(hex);
}
const materials = {
  wood: new Set(['#986a43','#bc8e62','#705138','#997f60','#79563c','#91623e','#63462f','#a66e42','#694935','#99714b','#cfa570']),
  bronze: new Set(['#b58d56','#e5b45f','#bc995e','#a77b42','#8f784c','#d7ae68','#b39458','#b56948','#dbb878']),
  metal: new Set(['#3a504e','#273d3d','#414b48','#45514e','#384b4c','#364744','#38494a','#505c59']),
  textile: new Set(['#b65746','#63838d','#485854','#d7c294','#eddfbf','#c9a575']),
  water: new Set(['#74a8a5','#709a9d']),
  glass: new Set(['#8bbfbe','#b8c9bf']),
  hotGlass: new Set(['#ed9860']),
  satin: new Set(['#a49c88','#b7b3a5','#8b938e','#808782','#93a39a','#77827c','#68736d']),
  darkIron: new Set(['#535a55','#57605a','#4e5551','#52625d','#42504c']),
};
function finish(face) {
  if (face.media) return 'image';
  if (face.line || face.unlit && !face.material) return 'ink';
  if (face.material) return face.material;
  for (const [name, palette] of Object.entries(materials)) if (palette.has(face.color)) return name;
  return 'matte';
}

// Seamless, neutral material maps modulate the artist's chosen colour in world units.
function materialMap(kind) {
  const width=256, bytes=new Uint8Array(width*width*4), tau=2*Math.PI;
  let seed=2761;
  function random(){ seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; }
  for(let y=0;y<width;y++)for(let x=0;x<width;x++){
    const u=x/width*tau,v=y/width*tau;
    let intensity=249;
    if(kind==='wood'){
      const grain=v*18+2.4*Math.sin(u)+1.3*Math.sin(2*u+.7*Math.sin(v));
      intensity=225+10*Math.sin(grain)+9*Math.sin(grain*3)+7*random();
    } else if(kind==='textile') {
      intensity=235+7*Math.sin(32*u)*Math.cos(32*v)+7*random();
    } else if(kind==='floor') {
      intensity=232+8*Math.sin(2*u+.7*Math.cos(v))*Math.sin(2*v)+10*random();
    } else if(kind==='bronze'||kind==='metal') {
      intensity=239+4*Math.sin(v*42+Math.sin(u))+8*random();
    } else if(kind==='water'){
      intensity=198+17*Math.sin(v*4+1.6*Math.sin(2*u)+.5*Math.sin(3*v))+10*Math.sin(v*9+.7*Math.cos(3*u));
    } else intensity=240+12*random();
    const i=4*(y*width+x);
    bytes[i]=bytes[i+1]=bytes[i+2]=intensity;bytes[i+3]=255;
  }
  const map=new THREE.DataTexture(bytes,width,width,THREE.RGBAFormat);
  map.wrapS=map.wrapT=THREE.RepeatWrapping;map.magFilter=THREE.LinearFilter;
  map.minFilter=THREE.LinearMipmapLinearFilter;map.generateMipmaps=true;map.needsUpdate=true;
  return map;
}

function triangulate(pts) {
  if(pts.length===3)return [[0,1,2]];
  const a=vector(pts[0]), n=new THREE.Vector3();
  for(let i=1;i<pts.length-1 && n.lengthSq()<1e-12;i++)n.crossVectors(vector(pts[i]).sub(a),vector(pts[i+1]).sub(a));
  if(n.lengthSq()<1e-12)return [];
  const normal=n.toArray().map(Math.abs);
  const axis=normal.indexOf(Math.max(...normal));
  const flat=pts.map(p=>new THREE.Vector2(p[(axis+1)%3],p[(axis+2)%3]));
  let sign=0, convex=true;
  for(let i=0;i<flat.length;i++){
    const v=flat[i],w=flat[(i+1)%flat.length],q=flat[(i+2)%flat.length];
    const cross=(w.x-v.x)*(q.y-w.y)-(w.y-v.y)*(q.x-w.x);
    if(Math.abs(cross)<1e-9)continue;
    if(sign*cross<0){convex=false;break;}sign=Math.sign(cross);
  }
  if(convex)return Array.from({length:pts.length-2},(_,i)=>[0,i+1,i+2]);
  const result=THREE.ShapeUtils.triangulateShape(flat,[]);
  return THREE.ShapeUtils.area(flat)<0?result.map(([a,b,c])=>[a,c,b]):result;
}

// One optical pass shares the render's actual depth. Controls and hit markers
// are drawn later on the presentation canvas and stay completely sharp.
function makeLens(renderer) {
  if(!renderer.extensions.has('EXT_color_buffer_float'))return null;
  const plate=new THREE.WebGLRenderTarget(1,1,{
    type:THREE.HalfFloatType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,
    depthBuffer:true,stencilBuffer:false,samples:Math.min(2,renderer.capabilities.maxSamples)
  });
  plate.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
  const uniforms={
    plate:{value:plate.texture},zBuffer:{value:plate.depthTexture},
    inverseSize:{value:new THREE.Vector2()},focus:{value:1},aperture:{value:1}
  };
  const material=new THREE.ShaderMaterial({
    uniforms,depthTest:false,depthWrite:false,
    vertexShader:`varying vec2 frame;
      void main(){frame=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader:`varying vec2 frame;
      uniform sampler2D plate,zBuffer;
      uniform vec2 inverseSize;
      uniform float focus,aperture;
      float depthAt(vec2 uv){
        float d=texture2D(zBuffer,uv).r;
        return 13.5/(75.-74.82*d);
      }
      void main(){
        vec3 centre=texture2D(plate,frame).rgb;
        float distance=depthAt(frame);
        float coc=min(7.,aperture*abs(focus-distance)/max(.55,distance));
        vec3 collected=centre;
        float weights=1.,occ=0.;
        vec2 slope=clamp(vec2(dFdx(distance),dFdy(distance)),vec2(-.06),vec2(.06));
        for(int i=0;i<10;i++){
          float fi=float(i);
          float a=fi*2.39996;
          vec2 ray=vec2(cos(a),sin(a));
          vec2 offset=ray*coc*sqrt((fi+.5)/10.);
          vec2 tap=clamp(frame+offset*inverseSize,vec2(.001),vec2(.999));
          float sampleDepth=depthAt(tap);
          // The in-focus silhouette remains distinct against an out-of-focus wall.
          float weight=smoothstep(-.30,-.02,sampleDepth-distance+.22);
          collected+=weight*texture2D(plate,tap).rgb;
          weights+=weight;
          vec2 nearOffset=ray*(3.+mod(fi,3.)*2.);
          float gap=distance+dot(slope,nearOffset)-depthAt(frame+nearOffset*inverseSize);
          occ+=smoothstep(.015,.16,gap)*(1.-smoothstep(.23,.65,gap));
        }
        vec3 colour=mix(centre,collected/weights,smoothstep(.25,1.3,coc));
        colour*=1.-occ*.027;
        // Low optical falloff keeps the eye at the exhibit without crushing the room.
        vec2 edge=frame-.5;
        colour*=1.-.105*dot(edge,edge);
        gl_FragColor=vec4(colour,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const screen=new THREE.Scene();
  const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);quad.frustumCulled=false;screen.add(quad);
  const camera=new THREE.Camera();
  return function render(scene,view,width,height,focus,shot){
    if(plate.width!==width||plate.height!==height)plate.setSize(width,height);
    uniforms.inverseSize.value.set(1/width,1/height);
    uniforms.focus.value=focus;
    // Circle of confusion is capped in output pixels to stay legible on phones.
    uniforms.aperture.value=(shot==='action'?7.8:shot==='result'?2.0:.42)*Math.min(1.6,width/850);
    renderer.setRenderTarget(plate);renderer.render(scene,view);
    renderer.setRenderTarget(null);renderer.render(screen,camera);
  };
}

function makeStudio() {
  const canvas=document.createElement('canvas');
  const gl=canvas.getContext('webgl2',{antialias:true,alpha:true,premultipliedAlpha:true,powerPreference:'high-performance'});
  if(!gl)return null;
  const renderer=new THREE.WebGLRenderer({canvas,context:gl,antialias:true,alpha:true});
  renderer.setClearColor(0x000000,0);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.NoToneMapping;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
  const people=createPeople(scene,THREE);
  const placeObjects=stageObjects(scene);
  const devices=createMoscowDevices(scene,THREE);
  const lens=makeLens(renderer);
  const sky=new THREE.HemisphereLight(0xfff3de,0xa3b2ac,1.55);scene.add(sky);
  const sun=new THREE.DirectionalLight(0xffe6bd,2.0);sun.position.set(0.8,8,5.8);
  sun.target.position.set(-.55,.15,-.35);scene.add(sun,sun.target);sun.castShadow=true;
  const sh=sun.shadow;sh.mapSize.set(1024,1024);
  Object.assign(sh.camera,{left:-6.5,right:6.5,top:5.4,bottom:-5.2,near:.2,far:19});sh.camera.updateProjectionMatrix();
  sh.bias=-.00022;sh.normalBias=.016;
  const fill=new THREE.DirectionalLight(0xc0dadf,.68);fill.position.set(-4,3.2,-2);scene.add(fill);
  const spot=new THREE.SpotLight(0xffdea9,0,12,.60,.70,2);
  const wash=new THREE.PointLight(0xafd6e2,0,8,2);
  const practical=new THREE.PointLight(0xffbe77,0,5.8,2);
  scene.add(spot,spot.target,wash,practical);
  const night=new THREE.Color('#343b3b');
  let activeGallery;
  function lightGallery(g,progress){
    if(g!==activeGallery){
      activeGallery=g;
      renderer.toneMapping=g?THREE.ACESFilmicToneMapping:THREE.NoToneMapping;
      renderer.toneMappingExposure=g?1.16:1;
      scene.background=g?night:null;
      scene.environmentIntensity=g?.29:.42;
      sky.color.set(g?'#dbdddb':'#fff3de');sky.groundColor.set(g?'#9c8977':'#a3b2ac');sky.intensity=g?.70:1.55;
      sun.color.set(g?g.key:'#ffe6bd');sun.intensity=g?1.63:2;
      sun.position.set(...(g?[-2.55,5.9,3.15]:[.8,8,5.8]));
      fill.color.set(g?g.rim:'#c0dadf');fill.intensity=g?1.35:.68;
      fill.position.set(...(g?[3.3,3.4,-2.75]:[-4,3.2,-2]));
      spot.intensity=g?54:0;wash.intensity=g?23:0;
      if(g){
        const [x,,z]=g.source;
        spot.color.set(g.key);spot.position.set(x-1.85,3.72,z+1.45);spot.target.position.set(x,.55,z);
        wash.color.set(g.rim);wash.position.set(2.85,2.70,-2.20);
        practical.color.set(g.bounce);practical.position.set(...g.source);
      }
    }
    practical.intensity=g?3.2+Math.min(progress,3)*.75:0;
  }
  const textures=new Map(),surfaceMaterials=new Map(),meshes=new Map(),loader=new THREE.TextureLoader();
  const applyScans=scannedSurfaces(THREE,loader,renderer);
  const topology=new WeakMap();
  const repeatMaps=new Map();
  const style={
    wood:[.54,.035], bronze:[.31,.66], metal:[.38,.48], textile:[.94,0],
    water:[.22,.15], glass:[.13,.035],hotGlass:[.16,.04],satin:[.35,.73],darkIron:[.60,.43],
    floor:[.63,.035],wall:[.91,0],ceiling:[.96,0],matte:[.78,.03]
  };
  // Soft boxes outside the model give brass and glass stable reflections as the camera orbits.
  const studioSet=new THREE.Scene();
  studioSet.background=new THREE.Color(0x989f98);
  for(const [pos,w,h,power] of [[[-3,4,3],4,3,3.2],[[4,2,-2],2,4,1.8],[[1,5,-3],5,1,2.6]]){
    const panel=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color(power,power*.95,power*.86),side:THREE.DoubleSide}));
    panel.position.set(...pos);panel.lookAt(0,0,0);studioSet.add(panel);
  }
  const pmrem=new THREE.PMREMGenerator(renderer);
  const environment=pmrem.fromScene(studioSet,.035,.1,20,{size:64});
  scene.environment=environment.texture;scene.environmentIntensity=.42;
  studioSet.traverse(obj=>{obj.geometry?.dispose();obj.material?.dispose();});pmrem.dispose();
  function material(kind,face) {
    const opacity=face.opacity??1;
    const key=[kind,face.media||'',opacity,face.line?'line':'face'].join('|');
    if(surfaceMaterials.has(key))return surfaceMaterials.get(key);
    const common={vertexColors:true, side:THREE.DoubleSide,transparent:opacity<.999,opacity,depthWrite:opacity>=.999};
    let mat;
    if(kind==='ink'||kind==='image'){
      mat=new THREE.MeshBasicMaterial(common);
      if(face.media){
        // Gallery images are calibrated self-luminous displays with their own grade.
        mat.toneMapped=false;
        if(!textures.has(face.media)){
          const map=loader.load(new URL('art/'+face.media+'.webp',import.meta.url).href,()=>window.dispatchEvent(new Event('ringtexture')));
          map.flipY=false;map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
          textures.set(face.media,map);
        }
        mat.map=textures.get(face.media);mat.alphaTest=.41;
      }
    } else {
      const [roughness,metalness]=style[kind]||style.matte;
      if(kind==='glass'||kind==='hotGlass'){
        mat=new THREE.MeshPhysicalMaterial({...common,roughness,metalness,clearcoat:.86,clearcoatRoughness:.09,ior:1.50});
        if(kind==='hotGlass'){mat.emissive.set('#ff7d36');mat.emissiveIntensity=.22;}
      }else mat=new THREE.MeshStandardMaterial({...common,roughness,metalness});
      if(kind==='water'){
        if(!repeatMaps.has(kind))repeatMaps.set(kind,materialMap(kind));
        mat.bumpMap=repeatMaps.get(kind);mat.bumpScale=.012;
      }
      if(!applyScans(mat,kind) && ['bronze','metal','textile','floor'].includes(kind)){
        if(!repeatMaps.has(kind)){
          const initial=materialMap(kind);repeatMaps.set(kind,initial);
          if(['wood','bronze','textile','floor'].includes(kind)){
            const image=loader.load(new URL('art/surface-'+kind+'.webp',import.meta.url).href,()=>{
              image.wrapS=image.wrapT=THREE.RepeatWrapping;
              image.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
              for(const other of surfaceMaterials.values())if(other.map===initial){
                other.map=image;other.bumpMap=image;other.roughnessMap=image;other.needsUpdate=true;
              }
              repeatMaps.set(kind,image);initial.dispose();window.dispatchEvent(new Event('ringtexture'));
            });
          }
        }
        mat.map=repeatMaps.get(kind);
        mat.bumpMap=mat.map;mat.roughnessMap=mat.map;
        mat.bumpScale=kind==='wood'?.015:kind==='textile'?.008:kind==='floor'?.010:.004;
      }
    }
    if(face.line){mat.polygonOffset=true;mat.polygonOffsetFactor=-1;mat.polygonOffsetUnits=-1;}
    surfaceMaterials.set(key,mat);return mat;
  }
  function fillBatch(batch,face,indices,normal){
    const n=normal.toArray();
    const c=face.media?[1,1,1]:colour(face.color);
    const vertical=Math.abs(n[1])<.65, across=Math.abs(n[0])>.67;
    for(const tri of indices)for(const i of tri){
      const v=face.points[i];
      batch.positions.push(...v);batch.normals.push(...(face.normals?.[i]||n));batch.colours.push(...c);
      const uv=face.uv?.[i];
      if(uv)batch.uv.push(...uv);
      else if(vertical)batch.uv.push(across?v[2]:v[0],v[1]);
      else batch.uv.push(v[0],v[2]);
    }
  }
  function draw(ctx,geometry,settings) {
    const {w,h,eye,forward,focal}=settings;
    if(gl.isContextLost())return false;
    lightGallery(settings.gallery,settings.progress);
    const pixelRatio=Math.min(devicePixelRatio||1,1.7,Math.sqrt(1400000/(w*h)));
    const rw=Math.round(w*pixelRatio),rh=Math.round(h*pixelRatio);
    if(canvas.width!==rw||canvas.height!==rh)renderer.setSize(rw,rh,false);
    camera.position.set(...eye);camera.up.set(0,1,0);camera.lookAt(...eye.map((x,i)=>x+forward[i]));
    camera.fov=2*Math.atan(h/(2*focal))*180/Math.PI;camera.aspect=w/h;camera.near=.18;camera.far=75;
    camera.updateProjectionMatrix();camera.projectionMatrix.elements[9]=.04;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    const batches=new Map(),look=vector(forward);
    const visitors=geometry.visitors||[];
    people.sync(visitors);
    const installed=placeObjects(geometry,settings);
    const mounted=devices.sync({id:geometry.sceneId,progress:settings.progress,...settings.device});
    ctx.canvas.dataset.device=mounted.device?(mounted.service?'open':'closed'):'';
    ctx.canvas.dataset.deviceMask=String(mounted.mask??0);
    ctx.canvas.dataset.exhibit=installed.object?geometry.sceneId:'';
    const replacements=visitors.filter(v=>people.readyFor(v));
    ctx.canvas.dataset.people=String(replacements.length);
    function add(face){
      const pts=face.points;
      if(pts.length<3)return;
      let shape=topology.get(pts);
      if(!shape){
        const normal=vector(pts[1]).sub(vector(pts[0])).cross(vector(pts[2]).sub(vector(pts[0]))).normalize();
        shape={normal,triangles:triangulate(pts)};topology.set(pts,shape);
      }
      const kind=finish(face),mat=material(kind,face);
      if(!batches.has(mat))batches.set(mat,{positions:[],normals:[],colours:[],uv:[],kind});
      fillBatch(batches.get(mat),face,shape.triangles,shape.normal);
    }
    let replacement=0;
    for(let faceIndex=0;faceIndex<geometry.faces.length;faceIndex++){
      if(replacement<replacements.length && faceIndex===replacements[replacement].firstFace){
        faceIndex=replacements[replacement++].afterFace-1;
        continue;
      }
      const face=geometry.faces[faceIndex];
      if((face.fallbackAsset==='guide'&&mounted.guide)||(face.fallbackAsset==='device'&&mounted.device))continue;
      if(face.fallbackAsset==='loom' && installed.object || face.fallbackAsset==='bench' && installed.bench)continue;
      if(face.line){
        for(let i=1;i<face.points.length;i++){
          const a=vector(face.points[i-1]),b=vector(face.points[i]);
          const dir=b.clone().sub(a),side=dir.clone().cross(look).normalize().multiplyScalar(face.line*.5);
          if(dir.lengthSq()<1e-10||side.lengthSq()<1e-12)continue;
          const quad=[a.clone().add(side),a.sub(side),b.clone().sub(side),b.add(side)].map(v=>v.toArray());
          add({...face,points:quad,unlit:true});
        }
      }else add(face);
    }
    for(const mesh of meshes.values())mesh.visible=false;
    for(const [mat,b] of batches){
      let mesh=meshes.get(mat);
      if(!mesh){
        mesh=new THREE.Mesh(new THREE.BufferGeometry(),mat);mesh.frustumCulled=false;
        mesh.castShadow=!['ink','image','ceiling'].includes(b.kind)&&!mat.transparent;
        mesh.receiveShadow=b.kind!=='ink'&&b.kind!=='image';scene.add(mesh);meshes.set(mat,mesh);
      }
      mesh.visible=true;
      const previous=mesh.geometry.getAttribute('position');
      if(previous&&previous.array.length<b.positions.length){
        mesh.geometry.dispose();mesh.geometry=new THREE.BufferGeometry();
      }
      for(const [name,values,count] of [['position',b.positions,3],['normal',b.normals,3],['color',b.colours,3],['uv',b.uv,2]]){
        let attr=mesh.geometry.getAttribute(name);
        if(!attr||attr.array.length<values.length){
          attr=new THREE.BufferAttribute(new Float32Array(Math.ceil(values.length/count*1.15)*count),count);
          attr.setUsage(THREE.DynamicDrawUsage);mesh.geometry.setAttribute(name,attr);
        }
        attr.array.set(values);attr.clearUpdateRanges();attr.addUpdateRange(0,values.length);attr.needsUpdate=true;
      }
      mesh.geometry.setDrawRange(0,b.positions.length/3);
    }
    if(settings.gallery&&lens)lens(scene,camera,rw,rh,settings.focusDistance,settings.shot);
    else renderer.render(scene,camera);
    ctx.clearRect(0,0,w,h);ctx.drawImage(canvas,0,0,w,h);
    return true;
  }
  return {draw};
}

let studio;
window.RingLitRender=(ctx,geometry,settings)=>{
  try {
    if(studio===undefined)studio=makeStudio();
    return studio?.draw(ctx,geometry,settings)??false;
  } catch(error) {
    console.warn('Spatial lighting unavailable',error);
    studio=null;return false;
  }
};
window.dispatchEvent(new Event('ringtexture'));
