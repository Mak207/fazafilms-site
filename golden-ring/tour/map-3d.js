import * as THREE from '../interactives/vendor/three-0.180/three.module.min.js';
import { MAP_CITIES, MAP_RIVERS, MAP_THEME_KEYS, createMapAtlas, pickMapCity } from './map-content.js?v=12';

/**
 * The received concept (21.10.2026, pp.15–18) combines physical sand drawing
 * with six projection shows. The sand below is real, shaded, relief geometry.
 * City models/trees/goods/ornaments are schematic volumetric projections:
 * their architectural types are illustrative, not surveyed replicas or
 * physical obstacles for the robots. Only sand/base clearance enters IK.
 */
const W=3200,H=1000,TAU=Math.PI*2;
const BASES=[
  [20.066219,.263117,-8.969108],[26.156199,.263117,-10.202194],
  [20.778139,.263117,-5.719343],[26.868116,.263117,-6.952426],
  [28.867630,.263117,-8.001567],[18.613064,.263117,-6.712290],
  [23.946302,.263117,-7.856145]
];
// The supplied robot rigs face these measured tool tips in their neutral pose.
// Short arcs around that heading avoid sending a shoulder around its pedestal.
const TOOL_HEADINGS=[[20.191684,-8.731780],[25.887934,-10.212202],[21.046404,-5.709335],
  [26.742651,-7.189754],[28.702860,-8.213503],[18.881328,-6.702282],[23.718983,-7.998945]];
const RING=['sergiev-posad','pereslavl','rostov','yaroslavl','kostroma','ivanovo','suzdal','vladimir','sergiev-posad'];
const FORESTS=[[540,605,115,46],[890,470,112,48],[1145,745,100,45],
  [1560,580,155,42],[1960,425,120,38],[2380,280,95,30],[2710,650,95,38]];
const C={stone:'#eee2be',white:'#fff3da',gold:'#bf8b36',blue:'#3b7894',green:'#52746b',
  brick:'#a8563b',roof:'#304f51',window:'#294e56',wood:'#947052',sand:'#d6ba7b',
  red:'#af5c4a',water:'#4a9fb2',waterLight:'#b8e6df'};
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const smooth=(a,b,n)=>{const t=clamp((n-a)/(b-a));return t*t*(3-2*t);};
const cityIndex=new Map(MAP_CITIES.map((c,i)=>[c.id,i]));
const cityAt=id=>MAP_CITIES[cityIndex.get(id)];
const distanceSegment=(x,z,a,b)=>{
  const dx=b[0]-a[0],dz=b[2]-a[2],t=clamp(((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz||1));
  return Math.hypot(x-a[0]-t*dx,z-a[2]-t*dz);
};
function convexHull(points){
  const ps=points.map(p=>[p[0],p[1]]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const unique=ps.filter((p,i)=>!i||Math.abs(p[0]-ps[i-1][0])+Math.abs(p[1]-ps[i-1][1])>1e-7);
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const low=[],high=[];
  for(const p of unique){while(low.length>1&&cross(low.at(-2),low.at(-1),p)<=1e-9)low.pop();low.push(p);}
  for(const p of [...unique].reverse()){while(high.length>1&&cross(high.at(-2),high.at(-1),p)<=1e-9)high.pop();high.push(p);}
  return low.slice(0,-1).concat(high.slice(0,-1));
}
function insideHull(u,v,hull){
  let inside=false;
  for(let i=0,j=hull.length-1;i<hull.length;j=i++){
    const a=hull[i],b=hull[j];
    if((a[1]>v)!==(b[1]>v)&&u<(b[0]-a[0])*(v-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
function spanAt(hull,y){
  const xs=[];
  hull.forEach((a,i)=>{
    const b=hull[(i+1)%hull.length];
    if(Math.abs(a[1]-b[1])<1e-10){if(Math.abs(y-a[1])<1e-8)xs.push(a[0],b[0]);return;}
    if(y>=Math.min(a[1],b[1])-1e-9&&y<=Math.max(a[1],b[1])+1e-9)
      xs.push(a[0]+(b[0]-a[0])*clamp((y-a[1])/(b[1]-a[1])));
  });
  return [Math.min(...xs),Math.max(...xs)];
}

// Derive UV→world from the actual source mesh, not an approximate bounding box.
function surfaceMapping(mesh,atlas){
  mesh.updateWorldMatrix(true,false);
  const uv=mesh.geometry.attributes.uv,p=mesh.geometry.attributes.position;
  if(!uv||!p)throw new Error('Map relief requires the source field position and UV attributes.');
  const local=new THREE.Vector3(),world=i=>local.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld).clone();
  const a=0;let b=0,c=0,best=0;
  for(let i=1;i<uv.count;i++){const d=(uv.getX(i)-uv.getX(a))**2+(uv.getY(i)-uv.getY(a))**2;if(d>best){best=d;b=i;}}
  const du=uv.getX(b)-uv.getX(a),dv=uv.getY(b)-uv.getY(a);best=0;
  for(let i=1;i<uv.count;i++){const d=Math.abs(du*(uv.getY(i)-uv.getY(a))-dv*(uv.getX(i)-uv.getX(a)));if(d>best){best=d;c=i;}}
  if(best<1e-7)throw new Error('Map field has degenerate UVs.');
  const uc=uv.getX(c)-uv.getX(a),vc=uv.getY(c)-uv.getY(a),det=du*vc-dv*uc;
  const pa=world(a),pb=world(b).sub(pa),pc=world(c).sub(pa);
  const U=pb.clone().multiplyScalar(vc/det).addScaledVector(pc,-dv/det);
  const V=pc.clone().multiplyScalar(du/det).addScaledVector(pb,-uc/det);
  const origin=pa.clone().addScaledVector(U,-uv.getX(a)).addScaledVector(V,-uv.getY(a));
  const uniforms=mesh.material?.uniforms||{};
  const val=(key,fallback)=>uniforms[key]?.value??fallback;
  const panel=val('uAspect',mesh.userData.aspect||3.17),image=atlas.aspect;
  const fit=val('uFit',1)>.5,flip=val('uFlip',mesh.userData.UVorientation==='v-down'?1:0)>.5;
  const ru=fit?Math.max(1,panel/image):Math.min(1,panel/image);
  const rv=fit?Math.max(1,image/panel):Math.min(1,image/panel);
  const canvasToWorld=(x,y)=>{
    const u=(x/W-.5)/ru+.5,vf=((1-y/H)-.5)/rv+.5,v=flip?1-vf:vf;
    return origin.clone().addScaledVector(U,u).addScaledVector(V,v);
  };
  const inverseDet=U.x*V.z-U.z*V.x;
  if(Math.abs(inverseDet)<1e-7)throw new Error('Map field must be a horizontal sand table.');
  const worldToCanvas=(x,z)=>{
    const dx=x-origin.x,dz=z-origin.z;
    const u=(dx*V.z-dz*V.x)/inverseDet,v=(U.x*dz-U.z*dx)/inverseDet;
    return [((u-.5)*ru+.5)*W,(1-(((flip?1-v:v)-.5)*rv+.5))*H];
  };
  let fitError=0;
  const points=[];
  for(let i=0;i<uv.count;i++){
    const q=origin.clone().addScaledVector(U,uv.getX(i)).addScaledVector(V,uv.getY(i));
    fitError=Math.max(fitError,q.distanceTo(world(i)));
    points.push([(uv.getX(i)-.5)*ru+.5,1-(((flip?1-uv.getY(i):uv.getY(i))-.5)*rv+.5)]);
  }
  if(fitError>.008)throw new Error('Map field UVs are not affine; relief would not match the source.');
  const hull=convexHull(points);
  const xAxis=canvasToWorld(W,0).sub(canvasToWorld(0,0)).normalize();
  const zAxis=canvasToWorld(0,H).sub(canvasToWorld(0,0)).normalize();
  return {canvasToWorld,worldToCanvas,hull,xAxis,zAxis,fitError,origin,
    width:U.length()/ru,depth:V.length()/rv,baseY:pa.y};
}

// One BufferGeometry per city. Hundreds of architectural parts share the same
// draw call and vertex colours, including genuinely open arches and colonnades.
class Assembly{
  constructor(){this.p=[];this.n=[];this.c=[];}
  add(geometry,color,x=0,y=0,z=0,rx=0,ry=0,rz=0){
    const g=geometry.index?geometry.toNonIndexed():geometry;
    const m=new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)),new THREE.Vector3(1,1,1));
    const normalMatrix=new THREE.Matrix3().getNormalMatrix(m),v=new THREE.Vector3(),n=new THREE.Vector3(),col=new THREE.Color(color);
    for(let i=0;i<g.attributes.position.count;i++){
      v.fromBufferAttribute(g.attributes.position,i).applyMatrix4(m);
      n.fromBufferAttribute(g.attributes.normal,i).applyMatrix3(normalMatrix).normalize();
      this.p.push(v.x,v.y,v.z);this.n.push(n.x,n.y,n.z);
      if(g.attributes.color)this.c.push(g.attributes.color.getX(i),g.attributes.color.getY(i),g.attributes.color.getZ(i));
      else this.c.push(col.r,col.g,col.b);
    }
    if(g!==geometry)g.dispose();geometry.dispose();return this;
  }
  box(x,y,z,w,h,d,color=C.stone,rotation=0){return this.add(new THREE.BoxGeometry(w,h,d),color,x,y+h/2,z,0,rotation);}
  cyl(x,y,z,rt,rb,h,color=C.stone,segments=12){return this.add(new THREE.CylinderGeometry(rt,rb,h,segments),color,x,y+h/2,z);}
  roof(x,y,z,w,d,h,color=C.roof){
    const g=new THREE.CylinderGeometry(0,1,1,4,1);g.rotateY(Math.PI/4);g.scale(w/Math.SQRT2,h,d/Math.SQRT2);
    return this.add(g,color,x,y+h/2,z);
  }
  dome(x,y,z,r=.028,h=.048,color=C.gold){
    const points=[[0,0],[.64,0],[.9,.17],[1,.42],[.78,.68],[.35,.88],[0,1]].map(([a,b])=>new THREE.Vector2(a*r,b*h));
    this.cyl(x,y,z,r*.5,r*.5,h*.28,C.stone,12);
    this.add(new THREE.LatheGeometry(points,12),color,x,y+h*.24,z);
    this.box(x,y+h*1.2,z,.005,.027,.005,color);this.box(x,y+h*1.21+.012,z,.018,.004,.004,color);
    return this;
  }
  arch(x,y,z,w,h,d,color=C.stone,rotation=0){
    const inner=w*.31,spring=h*.43,s=new THREE.Shape();
    s.moveTo(-w/2,0);s.lineTo(-w/2,h);s.lineTo(w/2,h);s.lineTo(w/2,0);s.lineTo(inner,0);
    s.lineTo(inner,spring);s.absarc(0,spring,inner,0,Math.PI,false);s.lineTo(-inner,0);s.closePath();
    const g=new THREE.ExtrudeGeometry(s,{depth:d,bevelEnabled:false,curveSegments:8,steps:1});g.translate(0,0,-d/2);
    return this.add(g,color,x,y,z,0,rotation);
  }
  windows(x,y,z,w,h,count=4,color=C.window){
    for(let i=0;i<count;i++)this.arch(x+(i-(count-1)/2)*w/count,y,z,w/count*.63,h,.006,color);
    return this;
  }
  geometry(){
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));
    g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));
    g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));g.computeBoundingBox();g.computeBoundingSphere();return g;
  }
}
function cathedral(a,x,z,{width=.2,depth=.16,height=.15,domes=5,roof=C.green,stone=C.white}={}){
  a.box(x,0,z,width,height,depth,stone);
  a.box(x,height*.68,z,width*1.05,.015,depth*1.05,C.stone);
  a.roof(x,height,z,width*1.08,depth*1.08,.025,roof);
  a.windows(x,.045,z+depth/2+.004,width*.85,.053,3);
  a.cyl(x,height+.018,z,.025,.027,.028,stone);
  a.dome(x,height+.044,z,.031,.052,roof);
  if(domes===5)for(const dx of [-1,1])for(const dz of [-1,1])
    a.dome(x+dx*width*.29,height+.015,z+dz*depth*.28,.021,.043,roof);
  for(const dx of [-1,0,1])a.cyl(x+dx*width*.27,0,z-depth*.49,width*.15,width*.15,height*.72,stone,12);
}
function bellTower(a,x,z,{height=.39,color=C.stone,roof=C.gold}={}){
  const widths=[.105,.079,.055],heights=[height*.27,height*.24,height*.21];
  let y=0;
  for(let i=0;i<3;i++){
    const w=widths[i],h=heights[i];
    a.box(x,y,z,w*1.12,.014,w*1.12,C.white);y+=.014;
    a.arch(x,y,z+w*.37,w,h,.022,color);
    a.arch(x,y,z-w*.37,w,h,.022,color);
    a.box(x-w*.37,y,z,.021,h,w*.68,color);
    a.box(x+w*.37,y,z,.021,h,w*.68,color);
    y+=h;
  }
  a.cyl(x,y,z,.037,.04,.017,C.white,8);a.cyl(x,y+.017,z,0,.038,height*.13,roof,8);
  a.box(x,y+height*.16,z,.004,height*.09,.004,roof);
}
function cityGeometry(city){
  const a=new Assembly();
  // The low plinth and radial steps read as a projected miniature, not a real
  // full-size building occupying the robot's working surface.
  a.cyl(0,-.009,0,.255,.265,.018,C.sand,36);
  a.cyl(0,.006,0,.231,.246,.008,C.stone,36);
  if(city.id==='tver'){
    bellTower(a,0,0,{height:.41,color:C.white});a.box(0,.016,0,.15,.016,.15,C.stone);
    a.box(-.13,.016,.06,.065,.027,.05,C.stone);a.box(.13,.016,-.07,.06,.022,.06,C.stone);
  }else if(city.id==='sergiev-posad'){
    cathedral(a,-.065,0,{width:.18,depth:.16,height:.16,roof:C.blue});
    bellTower(a,.125,-.055,{height:.38,color:'#e5d39f',roof:C.gold});
    for(const x of [-.19,.19])a.box(x,.014,.04,.028,.055,.27,C.white);
    a.box(0,.014,-.145,.39,.055,.025,C.white);
    a.arch(0,.014,.145,.09,.08,.035,C.white);
  }else if(city.id==='pereslavl'){
    cathedral(a,.02,0,{width:.18,depth:.16,height:.13,domes:1,roof:C.green});
    a.box(-.145,.016,.07,.09,.045,.065,C.wood);a.roof(-.145,.061,.07,.105,.08,.037,C.roof);
    a.box(.13,.016,-.09,.055,.03,.04,C.stone);
  }else if(city.id==='rostov'){
    for(const x of [-.16,.16])for(const z of [-.12,.12]){
      a.cyl(x,.014,z,.026,.03,.115,C.white,12);a.cyl(x,.129,z,0,.037,.047,C.green,12);
    }
    for(const x of [-.16,.16])a.box(x,.014,0,.028,.073,.24,C.white);
    a.box(0,.014,-.12,.32,.073,.025,C.white);a.arch(0,.014,.12,.135,.095,.035,C.white);
    a.box(-.12,.014,.12,.08,.073,.025,C.white);a.box(.12,.014,.12,.08,.073,.025,C.white);
    cathedral(a,-.025,0,{width:.15,depth:.12,height:.15,roof:'#798f83'});
    for(const x of [.08,.115,.15])a.arch(x,.11,-.08,.035,.065,.022,C.white);
  }else if(city.id==='yaroslavl'){
    cathedral(a,-.055,0,{width:.18,depth:.145,height:.18,roof:'#426d58',stone:'#e6c7a2'});
    bellTower(a,.14,.02,{height:.31,color:C.brick,roof:C.green});
    a.box(0,.016,-.14,.35,.036,.045,C.stone);
    for(let i=-3;i<4;i++)a.cyl(i*.046,.052,-.14,.006,.007,.035,C.stone,8);
  }else if(city.id==='kostroma'){
    for(const z of [-.12,.12]){
      a.box(-.035,.091,z,.33,.025,.07,'#e7c581');a.roof(-.035,.116,z,.35,.08,.024,C.green);
      for(let i=-3;i<4;i++)a.arch(-.035+i*.045,.015,z+.018,.046,.077,.026,'#e7c581');
    }
    a.box(-.19,.014,0,.05,.1,.26,'#e7c581');bellTower(a,.16,0,{height:.32,color:'#d8b870',roof:C.roof});
  }else if(city.id==='ivanovo'){
    a.box(-.02,.014,.015,.32,.14,.13,C.brick);a.box(.095,.014,-.09,.11,.12,.12,C.brick);
    for(let i=0;i<5;i++)a.roof(-.145+i*.063,.154,.015,.065,.15,.035,C.roof);
    a.windows(-.02,.047,.083,.31,.035,7,'#abd4cf');a.windows(-.02,.102,.083,.31,.034,7,'#abd4cf');
    a.cyl(.16,.015,-.09,.018,.027,.32,C.brick,16);
    a.cyl(.16,.309,-.09,.023,.023,.02,'#6a433a',16);
    a.box(-.02,.09,.085,.33,.012,.01,'#e0b38b');
  }else if(city.id==='suzdal'){
    cathedral(a,-.04,0,{width:.205,depth:.16,height:.17,roof:'#497d9d'});
    bellTower(a,.145,-.045,{height:.30,color:C.white,roof:'#497d9d'});
    a.box(-.04,.018,-.145,.32,.04,.024,C.white);
    // Tiny gold stars on the blue drum make this silhouette distinct.
    for(const x of [-.1,-.04,.02])a.cyl(x,.223,.06,.004,.004,.005,C.gold,5);
  }else if(city.id==='vladimir'){
    a.arch(-.065,.014,.035,.17,.17,.13,C.white);
    a.box(-.065,.184,.035,.19,.019,.145,C.stone);
    // Move the small gate church above the actual arched masonry.
    const gateChurch=new Assembly();cathedral(gateChurch,0,0,{width:.075,depth:.07,height:.07,domes:1,roof:C.gold});
    a.add(gateChurch.geometry(),C.white,-.065,.203,.035);
    cathedral(a,.135,-.06,{width:.115,depth:.115,height:.17,domes:1,roof:C.gold});
    for(const x of [-.205,.075])a.box(x,.014,.035,.09,.055,.06,C.white);
  }else{
    a.box(0,.014,0,.26,.13,.13,'#dfb08b');a.roof(0,.144,0,.28,.15,.054,C.roof);
    a.windows(0,.033,.068,.26,.071,5,'#6a4f43');
    for(const x of [-.175,.175]){
      a.box(x,.014,0,.085,.155,.16,'#d89b7c');a.roof(x,.169,0,.105,.18,.068,C.roof);
      a.windows(x,.047,.083,.075,.063,2);
      a.cyl(x,.237,0,0,.029,.058,C.gold,8);
    }
    a.arch(0,.014,.088,.075,.12,.03,C.stone);
    a.roof(0,.20,.02,.085,.085,.058,C.gold);
    a.box(0,.257,.02,.007,.033,.007,C.gold);
  }
  const geometry=a.geometry();geometry.userData={cityId:city.id,schematic:true,physical:false};return geometry;
}
function ribbonGeometry(points,width,heightAt,lift=.005){
  const positions=[],uvs=[],indices=[];
  for(let i=0;i<points.length;i++){
    const p=points[i],before=points[Math.max(0,i-1)],after=points[Math.min(points.length-1,i+1)];
    const dx=after[0]-before[0],dz=after[2]-before[2],length=Math.hypot(dx,dz)||1;
    for(const side of [-1,1]){
      const x=p[0]-dz/length*width*.5*side,z=p[2]+dx/length*width*.5*side;
      positions.push(x,heightAt(x,z)+lift,z);uvs.push(i/(points.length-1),side===1?1:0);
    }
    if(i<points.length-1){const n=i*2;indices.push(n,n+2,n+1,n+1,n+2,n+3);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingSphere();return g;
}

export function createMap3D({model,surfaceMesh,renderer,atlas:existingAtlas,robotBases=BASES,reducedMotion=false}={}){
  if(!model||!surfaceMesh?.isMesh||!renderer)throw new Error('Map3D needs model, source surfaceMesh and renderer.');
  const atlas=existingAtlas||createMapAtlas(renderer,surfaceMesh.userData.aspect),ownsAtlas=!existingAtlas;
  model.updateWorldMatrix(true,false);
  const map=surfaceMapping(surfaceMesh,atlas),resources=new Set(),materials=new Set(),textures=new Set();
  atlas.setSpatialMode(true);
  const group=new THREE.Group();group.name='GoldenRing_SandRelief_3D';
  group.userData={interactiveId:'map',sourceSurfaceId:'map-surface',physical:false,conceptPages:'15–18'};
  // Geometry is constructed in world metres; cancel the current parent matrix.
  group.matrixAutoUpdate=false;group.matrix.copy(model.matrixWorld).invert();model.add(group);
  const sourceWasVisible=surfaceMesh.visible;surfaceMesh.visible=false;
  const pickables=[],cities=[],water=[],routes=[],crafts=[],flowInstances=[];
  const bases=robotBases.map(p=>Array.isArray(p)?p:[p.x,p.y,p.z]);
  const register=(mesh,{pick=true,name}={})=>{
    if(name)mesh.name=name;
    mesh.userData.interactiveId='map';mesh.userData.sourceDisplayId='map-surface';
    mesh.castShadow=false;mesh.receiveShadow=true;group.add(mesh);
    if(mesh.geometry)resources.add(mesh.geometry);
    if(mesh.material)materials.add(mesh.material);
    if(pick)pickables.push(mesh);return mesh;
  };
  const toPoint=(x,y)=>map.canvasToWorld(x,y).toArray();
  const worldHull=map.hull.map(([u,v])=>toPoint(u*W,v*H));
  const edgeDistance=(x,z)=>Math.min(...worldHull.map((a,i)=>distanceSegment(x,z,a,worldHull[(i+1)%worldHull.length])));
  const riverPaths=MAP_RIVERS.map(r=>{
    const curve=new THREE.CatmullRomCurve3(r.points.map(([x,y])=>map.canvasToWorld(x,y)),false,'centripetal');
    return {...r,points:curve.getSpacedPoints(r.id==='volga'?160:65).map(p=>p.toArray()),physical:true,mode:'show',layer:'rivers'};
  });
  const lakes=[[1025,520,65,40],[1335,485,70,35]].map(([x,y,rx,ry])=>({p:toPoint(x,y),rx:rx/W*map.width,rz:ry/H*map.depth}));
  const hills=[[860,570,140,90,.024],[1510,610,210,80,.029],[2010,485,180,65,.027],[2480,660,170,70,.022]];
  function heightAt(x,z){
    const [cx,cy]=map.worldToCanvas(x,z);
    let h=.018+.013*(.5+.5*Math.sin(cx*.0105+Math.sin(cy*.014)*.8)*Math.cos(cy*.014));
    h+=.008*(.5+.5*Math.sin(cx*.031+cy*.023)*Math.cos(cy*.025));
    for(const [hx,hy,rx,ry,amp] of hills)h+=amp*Math.exp(-(((cx-hx)/rx)**2+((cy-hy)/ry)**2)*.75);
    let channel=0;
    for(const river of riverPaths){
      let d=Infinity;
      for(let i=1;i<river.points.length;i++)d=Math.min(d,distanceSegment(x,z,river.points[i-1],river.points[i]));
      const radius=Math.max(.035,river.width/W*map.width*.65);
      channel=Math.max(channel,1-smooth(radius*.22,radius*1.8,d));
    }
    for(const lake of lakes){const d=Math.hypot((x-lake.p[0])/lake.rx,(z-lake.p[2])/lake.rz);channel=Math.max(channel,1-smooth(.85,1.15,d));}
    h=h*(1-channel*.87);
    let fade=smooth(0,.055,edgeDistance(x,z));
    for(const b of bases)fade=Math.min(fade,smooth(.15,.25,Math.hypot(x-b[0],z-b[2])));
    return map.baseY+Math.min(.075,h)*fade;
  }
  function sampleSurface(x,z){
    const canvas=map.worldToCanvas(x,z),inside=insideHull(canvas[0]/W,canvas[1]/H,map.hull);
    const baseDistance=Math.min(...bases.map(b=>Math.hypot(x-b[0],z-b[2])));
    const height=heightAt(x,z),e=.007;
    const normal=new THREE.Vector3(heightAt(x-e,z)-heightAt(x+e,z),2*e,heightAt(x,z-e)-heightAt(x,z+e)).normalize();
    return {height,blocked:!inside||baseDistance<.25,normal:normal.toArray(),clearanceRadius:baseDistance<.25?.25:0};
  }
  const terrainPositions=[],terrainUV=[],terrainIndices=[];
  const ys=[...new Set([...Array.from({length:57},(_,i)=>i/56),...map.hull.map(p=>p[1])].map(n=>Number(n.toFixed(9))))].sort((a,b)=>a-b);
  const columns=144;
  let minHeight=Infinity,maxHeight=-Infinity;
  for(const y of ys){
    const [left,right]=spanAt(map.hull,y);
    for(let i=0;i<=columns;i++){
      const x=left+(right-left)*i/columns,p=map.canvasToWorld(x*W,y*H),height=heightAt(p.x,p.z);
      minHeight=Math.min(minHeight,height);maxHeight=Math.max(maxHeight,height);
      terrainPositions.push(p.x,height,p.z);terrainUV.push(x,1-y);
    }
  }
  for(let j=0;j<ys.length-1;j++)for(let i=0;i<columns;i++){
    const a=j*(columns+1)+i,b=a+1,c=a+columns+1,d=c+1;
    terrainIndices.push(a,c,b,b,c,d);
  }
  const terrainGeometry=new THREE.BufferGeometry();
  terrainGeometry.setAttribute('position',new THREE.Float32BufferAttribute(terrainPositions,3));
  terrainGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(terrainUV,2));terrainGeometry.setIndex(terrainIndices);
  // Make the face winding match world up regardless of the source UV direction.
  const tp=terrainGeometry.attributes.position,ti=terrainGeometry.index;
  const va=new THREE.Vector3().fromBufferAttribute(tp,ti.getX(0)),vb=new THREE.Vector3().fromBufferAttribute(tp,ti.getX(1)),vc=new THREE.Vector3().fromBufferAttribute(tp,ti.getX(2));
  if(vb.sub(va).cross(vc.sub(va)).y<0)for(let i=0;i<ti.count;i+=3){const t=ti.getX(i+1);ti.setX(i+1,ti.getX(i+2));ti.setX(i+2,t);}
  terrainGeometry.computeVertexNormals();terrainGeometry.computeBoundingSphere();terrainGeometry.computeBoundingBox();
  const grain=new Uint8Array(128*128*4);let seed=42717;
  for(let i=0;i<grain.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const v=80+(seed>>>24)%150;grain[i]=grain[i+1]=grain[i+2]=v;grain[i+3]=255;}
  const bump=new THREE.DataTexture(grain,128,128);bump.wrapS=bump.wrapT=THREE.RepeatWrapping;
  bump.repeat.set(map.width/.14,map.depth/.14);bump.needsUpdate=true;bump.name='Map_physical_sand_grain';textures.add(bump);
  const terrainMaterial=new THREE.MeshStandardMaterial({map:atlas.texture,bumpMap:bump,bumpScale:.0018,roughness:.94,metalness:0,color:0xc7b892,
    emissive:0x000000,emissiveIntensity:0});
  const terrain=register(new THREE.Mesh(terrainGeometry,terrainMaterial),{name:'Map_SculptedSand_SourceContour'});
  terrain.userData.physical=true;terrain.userData.mapTerrain=true;terrain.userData.mapImageUV=true;
  // Border follows every source contour point. Nothing crosses the original rim.
  const borderPoints=worldHull.concat([worldHull[0]]).map(p=>[p[0],heightAt(p[0],p[2]),p[2]]);
  const border=register(new THREE.Mesh(ribbonGeometry(borderPoints,.018,heightAt,.003),new THREE.MeshStandardMaterial({
    color:0xb59a5b,roughness:.67,metalness:.28,side:THREE.DoubleSide})),{name:'Map_ContourInlay',pick:false});
  border.visible=false; // The preserved source stand already supplies its rim.
  const cityBasis=new THREE.Matrix4().makeBasis(map.xAxis,new THREE.Vector3(0,1,0),map.zAxis);
  const cityQuaternion=new THREE.Quaternion().setFromRotationMatrix(cityBasis);
  for(const city of MAP_CITIES){
    const geometry=cityGeometry(city),material=new THREE.MeshStandardMaterial({vertexColors:true,color:0xffffff,roughness:.82,metalness:0,
      emissive:0xffe5a9,emissiveIntensity:0});
    const mesh=register(new THREE.Mesh(geometry,material),{name:'Map3D_City_'+city.id});
    // The pedestal stays on the city's point but extends away from the label.
    // This keeps both the city name and its short thematic caption exposed.
    const p=map.canvasToWorld(city.x,city.y+(city.labelY<city.y?42:-42));
    let footHeight=heightAt(p.x,p.z);
    for(let i=0;i<16;i++)footHeight=Math.max(footHeight,heightAt(p.x+Math.cos(i*TAU/16)*.29,p.z+Math.sin(i*TAU/16)*.29));
    mesh.position.set(p.x,footHeight+.016,p.z);mesh.quaternion.copy(cityQuaternion);
    mesh.userData.mapCityId=city.id;mesh.userData.physical=false;
    const ringGeo=new THREE.RingGeometry(.274,.292,48);ringGeo.rotateX(-Math.PI/2);
    const halo=register(new THREE.Mesh(ringGeo,new THREE.MeshBasicMaterial({color:0xc39c48,transparent:true,opacity:.5,depthWrite:false,side:THREE.DoubleSide})),
      {name:'Map_CityLight_'+city.id});
    halo.position.copy(mesh.position);halo.position.y-=.005;halo.userData.mapCityId=city.id;
    cities.push({city,mesh,halo,baseHeight:mesh.position.y});
  }
  for(const river of riverPaths){
    const mesh=register(new THREE.Mesh(ribbonGeometry(river.points,Math.max(.027,river.width/W*map.width*.9),heightAt,.004),
      new THREE.MeshStandardMaterial({color:C.water,roughness:.24,metalness:.16,emissive:C.water,emissiveIntensity:.22,side:THREE.DoubleSide})),
      {name:'Map3D_River_'+river.id});
    water.push({mesh,river,indexCount:mesh.geometry.index.count,index:water.length});
  }
  for(let i=0;i<lakes.length;i++){
    const l=lakes[i],g=new THREE.CircleGeometry(1,48);g.rotateX(-Math.PI/2);g.scale(l.rx,.001,l.rz);
    const mesh=register(new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:'#71b7bf',roughness:.24,metalness:.1,emissive:0x214e55,emissiveIntensity:.2})),
      {name:'Map3D_Lake_'+i});
    mesh.position.set(l.p[0],heightAt(l.p[0],l.p[2])+.005,l.p[2]);water.push({mesh,lake:true});
  }
  function pathWorld(ids,segments=100){
    const curve=new THREE.CatmullRomCurve3(ids.map(id=>{const c=cityAt(id);return map.canvasToWorld(c.x,c.y);}),false,'centripetal');
    return curve.getSpacedPoints(segments).map(p=>p.toArray());
  }
  const cityRoute=pathWorld(RING,220),branches=[
    pathWorld(['tver','sergiev-posad'],45),pathWorld(['suzdal','nizhny-novgorod'],65)
  ];
  [cityRoute,...branches].forEach((points,i)=>{
    const mesh=register(new THREE.Mesh(ribbonGeometry(points,.021,heightAt,.008),new THREE.MeshBasicMaterial({
      color:i?0xb8a16a:0xdbb04d,transparent:true,opacity:.85,depthWrite:false,side:THREE.DoubleSide})),
      {name:'Map3D_CityRoute_'+i});
    routes.push({mesh,points,indexCount:mesh.geometry.index.count,kind:'cities'});
  });
  const tradePaths=[
    riverPaths[0].points,riverPaths[1].points,pathWorld(['ivanovo','kostroma','nizhny-novgorod'],110)
  ];
  tradePaths.forEach((points,i)=>{
    const mesh=register(new THREE.Mesh(ribbonGeometry(points,.028,heightAt,.013),new THREE.MeshBasicMaterial({
      color:0xd89d42,transparent:true,opacity:.9,depthWrite:false,side:THREE.DoubleSide})),
      {name:'Map3D_TradeFlow_'+i});
    routes.push({mesh,points,indexCount:mesh.geometry.index.count,kind:'trade'});
  });
  // Small forests are batched. Their positions represent landscape imagery,
  // never cadastral forest boundaries. Seasonal colour is part of show 03.
  const forestData=[];
  FORESTS.forEach(([cx,cy,rx,ry],cluster)=>{
    for(let i=0;i<15;i++){
      const angle=i*2.399963+cluster*.8,r=Math.sqrt((i+.5)/15),px=cx+Math.cos(angle)*rx*r,py=cy+Math.sin(angle)*ry*r;
      const p=map.canvasToWorld(px,py),s=sampleSurface(p.x,p.z);
      if(s.blocked||cities.some(c=>Math.hypot(c.mesh.position.x-p.x,c.mesh.position.z-p.z)<.36))continue;
      forestData.push({p:[p.x,s.height+.006,p.z],height:.075+.035*((i*7)%11)/11,phase:(i+cluster*3)%9});
    }
  });
  const treesGeometry=new THREE.ConeGeometry(1,1,7,1),trunkGeometry=new THREE.CylinderGeometry(.07,.09,1,6);
  const trees=register(new THREE.InstancedMesh(treesGeometry,new THREE.MeshStandardMaterial({color:0xffffff,roughness:.9,emissive:0x1b301f,emissiveIntensity:.12}),forestData.length),
    {name:'Map3D_SeasonalForests',pick:false});
  const trunks=register(new THREE.InstancedMesh(trunkGeometry,new THREE.MeshStandardMaterial({color:0x947052,roughness:1}),forestData.length),
    {name:'Map3D_ForestTrunks',pick:false});
  const dummy=new THREE.Object3D();
  forestData.forEach((d,i)=>{
    dummy.position.set(d.p[0],d.p[1]+d.height*.7,d.p[2]);dummy.scale.set(d.height*.36,d.height,d.height*.36);dummy.updateMatrix();trees.setMatrixAt(i,dummy.matrix);
    dummy.position.y=d.p[1]+d.height*.3;dummy.scale.set(d.height*.7,d.height*.65,d.height*.7);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
    trees.setColorAt(i,new THREE.Color(i%3===0?'#66856c':'#456d57'));
  });
  trees.instanceMatrix.needsUpdate=trunks.instanceMatrix.needsUpdate=true;
  const goods=new Assembly();goods.box(0,0,0,.055,.037,.04,C.wood);
  goods.box(0,.035,0,.058,.006,.044,C.gold);goods.box(0,0,0,.009,.042,.043,C.gold);
  const goodsMesh=register(new THREE.InstancedMesh(goods.geometry(),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.75,emissive:0x664014,emissiveIntensity:.25}),12),
    {name:'Map3D_MovingGoods',pick:false});
  const boat=new Assembly();boat.add(new THREE.CylinderGeometry(.027,.043,.025,4),C.wood,0,.012,0,0,Math.PI/4);
  boat.box(0,.025,0,.004,.073,.004,C.wood);
  const sail=new THREE.BufferGeometry();sail.setAttribute('position',new THREE.Float32BufferAttribute([0,.035,0,0,.09,0,.045,.035,0],3));sail.computeVertexNormals();
  boat.add(sail,C.white,0,0,.002);
  const boats=register(new THREE.InstancedMesh(boat.geometry(),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.65,side:THREE.DoubleSide}),6),
    {name:'Map3D_MovingRiverBoats',pick:false});
  flowInstances.push({mesh:goodsMesh,count:12,paths:tradePaths,speed:.055,lift:.018},
    {mesh:boats,count:6,paths:riverPaths.slice(0,2).map(r=>r.points),speed:.041,lift:.013});
  // Craft medallions are actual shallow relief strokes, not a repeated icon.
  for(const [index,entry] of cities.entries()){
    const {city,mesh}=entry,segments=[];
    const circle=(r,turns=1)=>Array.from({length:49},(_,i)=>[Math.cos(i/48*TAU*turns)*r,Math.sin(i/48*TAU*turns)*r]);
    segments.push(circle(.30));
    if(city.id==='ivanovo'||city.id==='tver'){
      for(let i=-3;i<=3;i++){segments.push([[-.2,i*.055],[.2,i*.055]]);segments.push([[i*.055,-.2],[i*.055,.2]]);}
    }else if(city.id==='vladimir'||city.id==='suzdal'){
      for(let i=0;i<8;i++){const a=i*TAU/8;segments.push([[Math.cos(a)*.11,Math.sin(a)*.11],[Math.cos(a+.22)*.24,Math.sin(a+.22)*.24],[Math.cos(a+.43)*.11,Math.sin(a+.43)*.11]]);}
    }else if(city.id==='kostroma'){
      for(let k=0;k<3;k++)segments.push(Array.from({length:41},(_,i)=>{const t=i/40*TAU;return[Math.sin(t)*.2,Math.cos(t)*.09+(k-1)*.07];}));
    }else{
      const petals=city.id==='rostov'?6:city.id==='nizhny-novgorod'?5:8;
      segments.push(Array.from({length:121},(_,i)=>{const t=i/120*TAU,r=.12+.1*Math.cos(t*petals);return[Math.cos(t)*r,Math.sin(t)*r];}));
    }
    const a=new Assembly();
    for(const points of segments){
      const p=points.map(([x,z])=>new THREE.Vector3(x,.018,z));
      a.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p),Math.max(12,p.length),.004,5,false),index%2?C.gold:C.red);
    }
    const medallion=register(new THREE.Mesh(a.geometry(),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.45,metalness:.25,emissive:0xd8a759,emissiveIntensity:.2})),
      {name:'Map3D_CraftRelief_'+city.id});
    medallion.position.copy(mesh.position);medallion.position.y+=.016;medallion.quaternion.copy(cityQuaternion);
    medallion.userData.mapCityId=city.id;crafts.push(medallion);
  }
  // Real contact strokes: one fixed-capacity dynamic mesh. Each stroke has a
  // dark groove and two fine sand berms, and can only be supplied by robot IK.
  const strokeCapacity=4096,strokePositions=new Float32Array(strokeCapacity*18),strokeColors=new Float32Array(strokeCapacity*18);
  const strokeGeometry=new THREE.BufferGeometry();
  strokeGeometry.setAttribute('position',new THREE.BufferAttribute(strokePositions,3).setUsage(THREE.DynamicDrawUsage));
  strokeGeometry.setAttribute('color',new THREE.BufferAttribute(strokeColors,3).setUsage(THREE.DynamicDrawUsage));strokeGeometry.setDrawRange(0,0);
  strokeGeometry.boundingBox=terrainGeometry.boundingBox.clone();strokeGeometry.boundingSphere=terrainGeometry.boundingSphere.clone();
  const strokes=register(new THREE.Mesh(strokeGeometry,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide})),
    {name:'Map_RobotContactSandStrokes',pick:false});strokes.frustumCulled=false;
  let strokeCursor=0,strokeCount=0,contactCount=0,lastStrokeRobot=null;
  function writeStroke(a,b,width,color,lift,offset=0){
    const dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz);if(len<.0002)return;
    const nx=-dz/len,nz=dx/len,index=(strokeCursor++%strokeCapacity)*18,col=new THREE.Color(color);
    const corners=[[-1,0],[-1,1],[1,0],[1,0],[-1,1],[1,1]];
    corners.forEach(([side,end],i)=>{
      const p=end?b:a,x=p[0]+nx*(offset+side*width/2),z=p[2]+nz*(offset+side*width/2);
      strokePositions[index+i*3]=x;strokePositions[index+i*3+1]=heightAt(x,z)+lift;strokePositions[index+i*3+2]=z;
      strokeColors.set([col.r,col.g,col.b],index+i*3);
    });
    strokeCount=Math.min(strokeCapacity,strokeCount+1);
  }
  function applyStroke(stroke){
    if(!stroke?.from||!stroke?.to)return false;
    const a=stroke.from,b=stroke.to;
    if(![...a,...b].every(Number.isFinite)||Math.hypot(a[0]-b[0],a[2]-b[2])>.18)return false;
    const sa=sampleSurface(a[0],a[2]),sb=sampleSurface(b[0],b[2]);
    if(sa.blocked||sb.blocked||Math.abs(a[1]-sa.height)>.015||Math.abs(b[1]-sb.height)>.015)return false;
    const width=clamp(stroke.width||.012,.004,.035);
    writeStroke(a,b,width,'#94733e',.0017);
    writeStroke(a,b,width*.24,'#f6dfac',.0032,-width*.6);
    writeStroke(a,b,width*.18,'#cdb17b',.0026,width*.6);
    strokeGeometry.attributes.position.needsUpdate=true;strokeGeometry.attributes.color.needsUpdate=true;
    strokeGeometry.setDrawRange(0,strokeCount*6);contactCount++;lastStrokeRobot=stroke.robotId;return true;
  }
  function clearStrokes(){
    strokeCursor=0;strokeCount=0;contactCount=0;lastStrokeRobot=null;
    strokePositions.fill(0);strokeColors.fill(0);
    strokeGeometry.attributes.position.needsUpdate=true;
    strokeGeometry.attributes.color.needsUpdate=true;
    strokeGeometry.setDrawRange(0,0);
  }
  const localPaths=[];
  bases.forEach((base,robot)=>{
    // Two short arcs per base stay in the verified neutral-tool heading.
    const heading=TOOL_HEADINGS[robot]||[base[0]+.3,base[2]];
    const angle=Math.atan2(heading[1]-base[2],heading[0]-base[0]);
    for(let ring=0;ring<2;ring++){
      let part=[];
      const flush=()=>{if(part.length>5)localPaths.push({id:'sand-'+robot+'-'+ring+'-'+localPaths.length,robotId:'robot-'+(robot+1),
        layer:'idle',mode:'idle',physical:true,points:part});part=[];};
      for(let i=0;i<=40;i++){
        const a=angle+(i/40-.5)*.56,r=.398+ring*.035+.009*Math.sin(i/40*Math.PI),x=base[0]+Math.cos(a)*r,z=base[2]+Math.sin(a)*r;
        const s=sampleSurface(x,z);if(s.blocked||edgeDistance(x,z)<.035){flush();continue;}part.push([x,s.height,z]);
      }flush();
    }
  });
  const globalPaths=[
    ...riverPaths.map(r=>({id:r.id,layer:'rivers',mode:'show',physical:true,points:r.points.map(p=>[p[0],heightAt(p[0],p[2]),p[2]])})),
    {id:'city-route',layer:'cities',mode:'show',physical:true,points:cityRoute.map(p=>[p[0],heightAt(p[0],p[2]),p[2]])}
  ];
  let state={running:false,layer:'cities',city:'all',showProgress:0,showCount:0},paused=false,time=0,lastSeason=-1,disposed=false;
  const pointOn=(points,t)=>{
    const i=clamp(t,0,.999999)*(points.length-1),a=points[Math.floor(i)],b=points[Math.min(points.length-1,Math.floor(i)+1)],f=i%1;
    return {p:[a[0]+(b[0]-a[0])*f,0,a[2]+(b[2]-a[2])*f],angle:Math.atan2(b[0]-a[0],b[2]-a[2])};
  };
  function setState(next={}){
    const before=state.layer+'|'+state.city;
    state={...state,...next};if(!MAP_THEME_KEYS.includes(state.layer))state.layer='cities';
    if(state.city!=='all'&&!cityIndex.has(state.city))state.city='all';
    state.showProgress=clamp(Number(state.showProgress)||0);
    if(before!==state.layer+'|'+state.city)atlas.draw(state.layer,state.city);
    updateVisuals(0);
  }
  function updateVisuals(dt){
    const progress=state.showProgress,layer=state.layer,show=state.running&&!reducedMotion,complete=!state.running;
    const highlight=state.city==='all'?(show?Math.min(9,Math.floor(progress*10)):-1):cityIndex.get(state.city);
    cities.forEach((e,i)=>{
      const selected=i===highlight,architectural=layer==='architecture',crafting=layer==='crafts';
      const reveal=show?smooth(i*.075,i*.075+.17,progress):1;
      const s=crafting?.58:architectural?(.78+.28*reveal):.87+.13*reveal;
      e.mesh.scale.setScalar(s);
      e.mesh.material.emissiveIntensity=selected?.025:architectural?.015:0;
      e.halo.material.opacity=selected?.93:(state.city==='all'?.46:.18);
      e.halo.material.color.set(selected?0xffcf5d:0xaaa16f);
      const pulse=selected&&show?1+.045*Math.sin(time*3):1;e.halo.scale.setScalar(pulse);
    });
    water.forEach(({mesh,indexCount,index})=>{
      mesh.material.emissiveIntensity=layer==='rivers'?.5:layer==='nature'?.26:.06;
      mesh.material.color.set(layer==='rivers'?C.waterLight:layer==='nature'?'#73aca9':'#76a3a4');
      if(indexCount){const reveal=layer==='rivers'&&show?clamp(progress*1.5-index*.075):1;
        mesh.geometry.setDrawRange(0,Math.floor(indexCount*reveal/6)*6);}
    });
    routes.forEach(r=>{
      r.mesh.visible=r.kind==='cities'?(layer==='cities'||layer==='architecture'):layer==='trade';
      const fraction=complete||reducedMotion?1:Math.max(.018,progress);
      r.mesh.geometry.setDrawRange(0,Math.floor(r.indexCount*fraction/6)*6);
      r.mesh.material.opacity=layer==='architecture'?.35:.82;
    });
    crafts.forEach((m,i)=>{m.visible=layer==='crafts';const r=show?smooth(i*.06,i*.06+.21,progress):1;
      m.scale.setScalar(.65+.35*r);m.material.emissiveIntensity=.12+r*.5;});
    trees.visible=trunks.visible=layer==='nature'||layer==='cities'||layer==='rivers';
    if(trees.visible){
      const season=layer==='nature'?Math.floor(progress*36)+1:0;
      if(lastSeason!==season||lastSeason===-1){
        const stops=['#82a46b','#416d50','#bb8045','#d3dfd8'],t=layer==='nature'?progress*3.999:1;
        const a=new THREE.Color(stops[Math.floor(t)]),b=new THREE.Color(stops[Math.min(3,Math.floor(t)+1)]),base=a.lerp(b,t%1);
        forestData.forEach((d,i)=>trees.setColorAt(i,base.clone().multiplyScalar(.87+d.phase*.025)));
        if(trees.instanceColor)trees.instanceColor.needsUpdate=true;lastSeason=season;
      }
    }
    for(const f of flowInstances){
      f.mesh.visible=layer==='trade'||(f.mesh===boats&&layer==='rivers');
      if(!f.mesh.visible&&f.initialized)continue;
      for(let i=0;i<f.count;i++){
        const path=f.paths[i%f.paths.length],t=(i/f.count+progress*32*f.speed)%1,q=pointOn(path,t);
        dummy.position.set(q.p[0],heightAt(q.p[0],q.p[2])+f.lift,q.p[2]);
        dummy.rotation.set(0,q.angle,0);dummy.scale.setScalar(f.mesh===boats?1.15:1);
        dummy.updateMatrix();f.mesh.setMatrixAt(i,dummy.matrix);
      }f.mesh.instanceMatrix.needsUpdate=true;f.initialized=true;
    }
  }
  function update(dt=0){
    if(disposed||paused)return;
    if(Number.isFinite(dt)&&dt>0)time+=Math.min(dt,.1);
    updateVisuals(dt);
  }
  function pick(hit){
    if(!hit?.object)return null;
    let o=hit.object;while(o&&o!==group){if(o.userData.mapCityId)return o.userData.mapCityId;o=o.parent;}
    if(hit.object.userData.mapTerrain&&hit.uv)return pickMapCity(hit.uv,{uAspect:{value:atlas.aspect},uImageAspect:{value:atlas.aspect},uFit:{value:1}});
    if(hit.point){
      const [x,y]=map.worldToCanvas(hit.point.x,hit.point.z);
      return pickMapCity({x:x/W,y:1-y/H},{uAspect:{value:atlas.aspect},uImageAspect:{value:atlas.aspect},uFit:{value:1}});
    }
    return null;
  }
  function cityFocus(cityId){
    const entry=cities.find(item=>item.city.id===cityId);
    if(!entry)return null;
    entry.mesh.updateWorldMatrix(true,false);entry.halo.updateWorldMatrix(true,false);
    const bounds=new THREE.Box3().setFromObject(entry.mesh).expandByObject(entry.halo);
    bounds.expandByScalar(.035);
    const target=bounds.getCenter(new THREE.Vector3());
    const direction=map.xAxis.clone().multiplyScalar(-.42)
      .addScaledVector(map.zAxis,1.08).add(new THREE.Vector3(0,.82,0)).normalize();
    const position=target.clone().addScaledVector(direction,1.8);
    return {cityId:entry.city.id,title:entry.city.title,fov:42,
      position:position.toArray(),target:target.toArray(),
      bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()}};
  }
  setState(state);
  return {
    group,meshes:pickables,terrain,atlas,setState,update,pick,cityFocus,applyStroke,clearStrokes,sampleSurface,
    setPaused(value){paused=Boolean(value);},
    getDrawingPaths(layer='all'){
      const paths=layer==='idle'?localPaths:layer==='all'?[...localPaths,...globalPaths]:
        [...localPaths.map(p=>({...p,layer,mode:'show'})),...globalPaths.filter(p=>p.layer===layer)];
      return paths.map(p=>({...p,points:p.points.map(v=>[...v])}));
    },
    snapshot(){
      let triangles=0,meshCount=0,instancedCount=0;group.traverse(o=>{if(o.isMesh){meshCount++;const n=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
        triangles+=n*(o.isInstancedMesh?o.count:1);if(o.isInstancedMesh)instancedCount+=o.count;}});
      return {version:1,kind:'sand-relief-and-volumetric-projection',source:'concept-2026-10-21-p15-18',
        state:{...state},paused,physicalRelief:{baseY:map.baseY,minY:minHeight,maxY:maxHeight,maxHeight:maxHeight-map.baseY,
          vertices:terrainGeometry.attributes.position.count,triangles:terrainGeometry.index.count/3,
          riverbeds:riverPaths.length,lakes:lakes.length,sourceContourPreserved:true,uvFitError:map.fitError},
        cities:cities.map(({city,mesh})=>({id:city.id,title:city.title,position:mesh.position.toArray(),physical:false,
          triangles:mesh.geometry.attributes.position.count/3,bounds:mesh.geometry.boundingBox.getSize(new THREE.Vector3()).toArray()})),
        cityCount:cities.length,layerCount:MAP_THEME_KEYS.length,forestInstances:forestData.length,
        materialCount:materials.size,meshCount,instancedCount,triangles:Math.round(triangles),
        robotClearance:{flatRadius:.15,transitionRadius:.25,bases:bases.map(b=>[...b])},
        robotDrawing:{contactCount,lastRobot:lastStrokeRobot,visibleStrokeQuads:strokeCount,pathCount:localPaths.length,requiresContact:true},
        atlas:atlas.snapshot(),convention:'Схематическая песочная карта; миниатюры — объёмные проекции, не обмерные копии.'};
    },
    dispose(){
      if(disposed)return;disposed=true;group.removeFromParent();
      resources.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
      surfaceMesh.visible=sourceWasVisible;atlas.setSpatialMode(false);if(ownsAtlas)atlas.texture.dispose();
    }
  };
}
