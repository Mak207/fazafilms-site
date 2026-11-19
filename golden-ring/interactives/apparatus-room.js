import {scannedSurfaces} from './spatial-surfaces.js';
export function dressGallery(T,scene,renderer,projection,theme){
  const scanned=scannedSurfaces(T,new T.TextureLoader(),renderer);
  const mat=(c,r=.65,m=0)=>new T.MeshStandardMaterial({color:c,roughness:r,metalness:m});
  const plaster=mat(0x8d8073),floor=mat(0x91847b),oak=mat(0x8b674d),bronze=mat(0xa08054,.31,.72),basalt=mat(0x383737,.45),black=mat(0x252426);
  scanned(plaster,'wall');scanned(floor,'tile');scanned(oak,'wood');
  const luminous=new T.MeshBasicMaterial({color:new T.Color(2.5,1.75,1.0),toneMapped:false});
  function add(geo,material,x,y,z){const o=new T.Mesh(geo,material);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;scene.add(o);return o;}
  function box(x,y,z,w,h,d,m){const g=new T.BoxGeometry(w,h,d);const pa=g.attributes.position,normal=g.attributes.normal,uv=g.attributes.uv;
    for(let i=0;i<pa.count;i++){const nx=Math.abs(normal.getX(i)),ny=Math.abs(normal.getY(i));uv.setXY(i,nx>.9?pa.getZ(i):pa.getX(i),ny>.9?pa.getZ(i):pa.getY(i));}
    return add(g,m,x,y,z);}
  // Individual slabs, a continuous skirting and a bronze shadow-gap read at eye level.
  box(0,-.10,0,16,.16,18,basalt);
  for(let iz=-4;iz<7;iz++)for(let ix=-4;ix<4;ix++)box(ix*1.85+(iz%2)*.47,-.023,iz*1.42,1.845,.045,1.415,floor);
  box(0,2.30,8.45,13.15,4.60,.20,plaster);
  box(0,.18,8.31,13.10,.32,.09,oak);
  for(const x of [-4.5,-2.25,0,2.25,4.5])box(x,2.2,8.30,.10,4.4,.10,oak);
  for(const side of [-1,1])box(side*6.52,2.25,6.66,.16,4.5,3.72,plaster);
  box(0,2.30,-3.55,13.8,4.60,.20,plaster);
  for(const side of [-1,1]){
    box(side*6.52,2.25,.6,.16,4.5,8.4,plaster);box(side*6.41,.20,.6,.06,.38,8.4,oak);
    for(const z of [-2.7,.5,3.7]){box(side*6.34,2.17,z,.22,4.34,.37,oak);box(side*6.21,2.17,z,.023,4.34,.035,bronze);}
    for(let ix=0;ix<16;ix++)box(side*(4.47+ix*.105),2.13,-3.39,.048,3.90,.10,oak);
  }
  box(0,.18,-3.39,13,.32,.09,oak);box(0,.365,-3.37,13,.023,.075,bronze);
  box(0,4.28,-3.26,13,.075,.11,luminous);box(0,4.35,-3.2,13,.11,.18,oak);
  for(const z of [-2.7,0,2.7]){
    box(0,4.6,z,13,.15,.21,oak);
    for(const x of [-3.30,0,3.25]){
      const track=add(new T.CylinderGeometry(.085,.095,.21,24),black,x,4.42,z);track.rotation.x=.35;
      const lens=add(new T.CylinderGeometry(.081,.081,.006,24),luminous,x,4.32,z-.037);lens.rotation.x=.35;
    }
  }
  box(0,2.08,-3.37,6.90,2.85,.19,black);box(0,2.08,-3.26,6.82,2.78,.042,bronze);
  const display=new T.Mesh(new T.PlaneGeometry(6.75,2.72),new T.MeshBasicMaterial({map:projection.texture,toneMapped:false,color:0xe8ded3}));display.position.set(0,2.08,-3.228);scene.add(display);
  const hemisphere=new T.HemisphereLight(0xffead3,0x858e97,1.0);scene.add(hemisphere);
  const key=new T.DirectionalLight(0xffe5c1,2.6);key.position.set(-4,6,4);key.castShadow=true;key.shadow.mapSize.set(1536,1536);
  Object.assign(key.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:.3,far:15});key.shadow.normalBias=.012;key.shadow.bias=-.00018;scene.add(key);
  const rim=new T.DirectionalLight(0xb6d4e1,1.16);rim.position.set(3.5,3,-2.6);scene.add(rim);
  const wash=new T.PointLight(theme,12,8,2);wash.position.set(0,2.4,-2.5);scene.add(wash);
  const softbox=new T.Scene();softbox.background=new T.Color(.19,.19,.18);
  for(const [x,y,z,w,h,power] of [[-3,3,1,3,4,3.9],[1,2,-4,4,2,2.2],[4,2,2,2.4,4,2.0]]){
    const p=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({color:new T.Color(power,power*.91,power*.79),side:T.DoubleSide}));p.position.set(x,y,z);p.lookAt(0,1,0);softbox.add(p);
  }
  const pm=new T.PMREMGenerator(renderer);scene.environment=pm.fromScene(softbox,.025,.1,16,{size:64}).texture;scene.environmentIntensity=.42;pm.dispose();
  return {box,oak,bronze,black,wash};
}
