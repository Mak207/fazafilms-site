import {mountSpeaker} from './apparatus-fixtures.js';

const tones=[0xffab56,0xffc070,0xffdd9c];

// The native scan has a single shell for the timber and the bronze. Scale the
// measured bronze section about its suspension. The top of the crown meets
// the existing fixed yoke at its original vertices on all three portals.
function fitBronze(T,body,scale,anchorHeight){
  const n=new T.Vector3();
  // The original scan includes a slightly lopsided, 34 mm low casting lip.
  // Locate its extents on each LOD before registering BL-04 to the drawing.
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity,bottom=Infinity;
  body.traverse(part=>{
    if(!part.isMesh||part.name==='BellClapper')return;
    const p=part.geometry.attributes.position;
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      if(y<.87||y>1.15||Math.hypot(x,z-.004)>.64)continue;
      minX=Math.min(x,minX);maxX=Math.max(x,maxX);minZ=Math.min(z,minZ);maxZ=Math.max(z,maxZ);bottom=Math.min(y,bottom);
    }
  });
  const sx=1.115/(maxX-minX),sz=1.115/(maxZ-minZ),mx=(maxX+minX)/2,mz=(maxZ+minZ)/2;
  body.traverse(part=>{
    if(!part.isMesh)return;
    const geometry=part.geometry.clone(),positions=geometry.attributes.position,normals=geometry.attributes.normal;
    for(let i=0;i<positions.count;i++){
      const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i),r=Math.hypot(x,z-.004);
      if(y<.61||y>=anchorHeight||r>(y>1.77?.365:.64))continue;
      const crownStart=1.87,u=Math.max(0,(y-crownStart)/(anchorHeight-crownStart));
      const k=scale+(1-scale)*u*u*(3-2*u);
      const dk=(1-scale)*6*u*(1-u)/(anchorHeight-crownStart);
      const bronze=part.name!=='BellClapper',register=bronze?1-u:0;
      const bx=x+register*((x-mx)*sx-x),bz=z+register*(.004+(z-mz)*sz-z);
      const by=bronze&&y<1.862?y+(1.862-y)*(1.025-bottom)/(1.862-bottom):y;
      positions.setXYZ(i,k*bx,anchorHeight+k*(by-anchorHeight),.004+k*(bz-.004));
      if(normals&&dk){
        n.fromBufferAttribute(normals,i);
        const ny=(n.y-dk*(x*n.x+(z-.004)*n.z)/k)/(k+dk*(y-anchorHeight));
        n.set(n.x/k,ny,n.z/k).normalize();normals.setXYZ(i,n.x,n.y,n.z);
      }
    }
    geometry.computeBoundingBox();geometry.computeBoundingSphere();part.geometry=geometry;
  });
}

export function buildBellEnsemble(T,holder,drawing){
  const all=new T.Group();all.name='Three measured bell portals';
  const anchor=drawing.anchors.BellSuspension[1],diameters=drawing.ensemble.shellDiametersMm;
  const portals=[holder.clone(true),holder,holder.clone(true)];
  const glow=[],indicators=[];
  for(const [i,portal] of portals.entries()){
    all.add(portal);portal.position.x=drawing.ensemble.axesXmm[i]/1000;
    const scale=diameters[i]/diameters[0];
    fitBronze(T,portal.children[0],scale,anchor);mountSpeaker(T,portal,drawing.speaker);
    portal.name=['Great_Bell','Middle_Bell','Small_Bell'][i];
    const foot=drawing.footplate,rad=foot.diameter/2,th=foot.thickness;
    const points=[[.0001,0],[rad,0],[rad-.012,th*.65],[rad-.022,th],[.0001,th]].map(([x,y])=>new T.Vector2(x,y));
    const plate=new T.Mesh(new T.LatheGeometry(points,80),new T.MeshStandardMaterial({color:0x494745,roughness:.92,metalness:.24}));
    plate.position.set(foot.center[0],foot.center[1]-th,foot.center[2]);plate.name='BL-06_Presence_mat';plate.receiveShadow=true;portal.add(plate);
    const ring=new T.Mesh(new T.RingGeometry(rad-.042,rad-.032,80),new T.MeshBasicMaterial({color:tones[i],transparent:true,opacity:.12,depthWrite:false}));
    ring.name='Illuminated_sensor_outline';ring.rotation.x=-Math.PI/2;ring.position.copy(plate.position);ring.position.y+=th+.001;portal.add(ring);indicators.push(ring);
    const lamp=new T.PointLight(tones[i],0,1.82,2);
    lamp.position.set(.08,anchor+(1.025-anchor)*scale-.06,.37*scale);portal.add(lamp);glow.push(lamp);
  }
  return {group:all,update(voices,participants){
    voices.forEach((a,i)=>{
      glow[i].intensity=3.8*a;
      indicators[i].material.opacity=.12+(participants[i]?.28:0)+a*.58;
    });
  }};
}

export function bellFilmState(t,events){
  const entries=[6.55,13.55,20.45],participants=entries.map(at=>Math.min(1,Math.max(0,(t-at)/1.0)));
  const voices=[0,0,0];
  for(const [at,i] of events){
    const dt=t-at;
    if(dt<0||dt>4)continue;
    voices[i]=Math.min(1,voices[i]+Math.min(1,dt/.04)*Math.exp(-dt/[.92,.70,.55][i]));
  }
  return {voices,participants};
}
