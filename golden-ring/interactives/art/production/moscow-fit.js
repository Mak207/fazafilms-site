import {guide,receiver,loadMoscowTemplates,loadLoomEntryShell} from './moscow-devices.js';
import {buildTabletopOptics} from './moscow-optics.js';

// All dimensions below are metres, measured on the unscaled F02/E03 donor.
const SHOE_HALF=.065, ENCLOSURE_HALF=.0985, SHADOW_GAUGE=.138, AXLE_HEIGHT=.056;
const roundMM=v=>Math.round(v*1000);
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

export async function fitMoscowApparatus(scene,T,body,id,{base=0,grip,detail,standFootprint,controllerBase}={}) {
  if(id!=='loom'&&id!=='shadow')return null;
  body.updateWorldMatrix(true,true);
  const measuredBody=new T.Box3().setFromObject(body,true),registered=body.userData.moscowRegistrationM;
  const bounds=registered?new T.Box3(...registered.map(x=>new T.Vector3(...x))).applyMatrix4(body.matrixWorld):measuredBody;
  const size=bounds.getSize(new T.Vector3()),mid=bounds.getCenter(new T.Vector3());
  const plan=body.userData.moscowMount||{};
  const widthAxis=plan.axis||(size.x>=size.z?'x':'z'),cross=widthAxis==='x'?'z':'x';
  const length=size[widthAxis],depth=size[cross];
  const allowance=Math.max(.018,length*.040), margin=allowance+ENCLOSURE_HALF;
  const span=plan.ends||[margin/length,1-margin/length];
  const slope=plan.crossSlope||0,cosine=1/Math.hypot(1,slope);
  const projectedLength=(span[1]-span[0])*length,shaftLength=projectedLength/cosine,datum=(.5*(span[0]+span[1])-.5)*length;
  if(shaftLength<.29||depth<.195)return null;
  const rotation=widthAxis==='x'?-Math.atan(slope):-Math.PI/2+Math.atan(slope);
  const across=new T.Vector3();across[widthAxis]=-slope*cosine;across[cross]=cosine;
  const at=(along,y,offset)=>{
    const p=mid.clone();p[widthAxis]+=along;p[cross]+=offset+slope*(along-datum);p.y=y;return p;
  };
  const nominalY=Number.isFinite(plan.top)?bounds.min.y+plan.top*size.y:(detail?.y??(base+size.y*(id==='loom'?.5:.24)));
  // Use real triangles at the front of the generated body. A centred bounding
  // box alone can put bolts into air, especially below the open warp of a loom.
  const ray=new T.Raycaster(),down=new T.Vector3(0,-1,0);
  ray.near=.001;ray.far=size.y*1.28;
  function mountHit(along,offset) {
    ray.set(at(along,bounds.max.y+.08,offset),down);
    const hits=ray.intersectObject(body,true).filter(h=>h.point.y>=base-.002&&h.point.y<=nominalY+.20*size.y);
    if(!hits.length)return null;
    const local=hits.filter(h=>h.face&&h.face.normal.clone().applyNormalMatrix(new T.Matrix3().getNormalMatrix(h.object.matrixWorld)).y>.23);
    return (local.length?local:hits).sort((a,b)=>Math.abs(a.point.y-nominalY)-Math.abs(b.point.y-nominalY))[0].point;
  }
  const end=projectedLength/2,anchors=[datum-end,datum+end];
  const candidates=[];
  const offsets=plan.crossSections?plan.crossSections.map(value=>value-.5):[.28,.35,.21,.14,.07,0,-.10];
  for(const fraction of offsets){
    const offset=fraction*depth,hits=anchors.map(a=>mountHit(a,offset));
    if(hits.every(Boolean)){
      const dev=Math.max(...hits.map(v=>Math.abs(v.y-nominalY)));
      candidates.push({offset,hits,score:dev+Math.abs(fraction-offsets[0])*.08});
    }
  }
  if(!candidates.length)return null;
  candidates.sort((a,b)=>a.score-b.score);
  const {offset,hits}=candidates[0];
  const mountHeight=Math.max(...hits.map(p=>p.y))+.006;
  const gauge=id==='shadow'?SHADOW_GAUGE:Math.min(.144,depth*.26);
  const guideHeight=mountHeight+AXLE_HEIGHT;
  const [guideTemplate,unitTemplate]=await loadMoscowTemplates(id);
  const group=new T.Group();group.name='FittedF02_'+id;scene.add(group);
  const material=new T.MeshStandardMaterial({color:0x434c45,roughness:.44,metalness:.56});
  if(plan.deckCorners){
    // The image-derived board is open under the original travelling hardware.
    // A continuous 12 mm replacement skin closes that opening within the old rim.
    const vertices=[],uv=[],corners=plan.deckCorners.map(([u,v])=>[bounds.min.x+size.x*u,bounds.min.z+size.z*v]);
    const top=mountHeight-.006,bottom=top-.012;
    const point=(i,y)=>[corners[i][0],y,corners[i][1]];
    const quad=(a,b,c,d)=>{for(const p of [a,b,c,a,c,d]){vertices.push(...p);uv.push(p[0]/1.8,p[2]/1.8);}};
    quad(point(0,top),point(3,top),point(2,top),point(1,top));
    for(let i=0;i<4;i++){const j=(i+1)%4;quad(point(i,bottom),point(i,top),point(j,top),point(j,bottom));}
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
    geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();
    const loader=new T.TextureLoader(),wood=new T.MeshStandardMaterial({color:0x996843,roughness:.72,side:T.DoubleSide});
    wood.map=loader.load(new URL('../surfaces/oak-color.webp',import.meta.url).href,()=>window.dispatchEvent(new Event('ringtexture')));
    wood.map.colorSpace=T.SRGBColorSpace;wood.map.wrapS=wood.map.wrapT=T.RepeatWrapping;
    const surface=new T.Mesh(geometry,wood);surface.name='Continuous deck insert';group.add(surface);
  }
  const brackets=[];
  for(const point of hits) {
    const rise=mountHeight-point.y,span=gauge+.102;
    const plate=new T.Mesh(new T.BoxGeometry(.118,.006,span),material);
    plate.position.copy(point);plate.position.y=mountHeight-.003;plate.rotation.y=rotation;
    group.add(plate);brackets.push(plate);
    if(rise>.008) {
      const upright=new T.Mesh(new T.BoxGeometry(.038,rise,.040),material);
      upright.position.copy(point);upright.position.y+=rise/2;group.add(upright);brackets.push(upright);
    }
  }
  for(const d of [-gauge/2,gauge/2]){
    const rail=guide(guideTemplate,shaftLength);
    rail.traverse(o=>{if(o.userData.moscow_source==='shoe')o.visible=false;});
    rail.position.copy(at(datum,mountHeight,offset)).addScaledVector(across,d);rail.rotation.y=rotation;group.add(rail);
  }
  // At 138/144 mm centres, two original 150 mm shoes intersect. A single
  // milled plate at each end retains all four donor holes and their fasteners.
  const bevel=.0008,hx=.065-bevel,hz=(gauge+.150)/2-bevel,r=.009,outline=new T.Shape();
  outline.moveTo(-hx+r,-hz);outline.lineTo(hx-r,-hz);outline.quadraticCurveTo(hx,-hz,hx,-hz+r);
  outline.lineTo(hx,hz-r);outline.quadraticCurveTo(hx,hz,hx-r,hz);outline.lineTo(-hx+r,hz);
  outline.quadraticCurveTo(-hx,hz,-hx,hz-r);outline.lineTo(-hx,-hz+r);outline.quadraticCurveTo(-hx,-hz,-hx+r,-hz);
  for(const rail of [-gauge/2,gauge/2])for(const hole of [-.045,.045]){
    const path=new T.Path();path.absarc(0,rail+hole,.00225+bevel,0,2*Math.PI,true);outline.holes.push(path);
  }
  const sole=new T.ExtrudeGeometry(outline,{depth:.020-2*bevel,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:2,curveSegments:8});
  sole.rotateX(-Math.PI/2);
  for(const endX of anchors){
    const foot=new T.Mesh(sole,material);foot.name='Paired F02 sole with four mounting holes';
    foot.position.copy(at(endX,mountHeight+bevel,offset));foot.rotation.y=rotation;group.add(foot);
  }
  const units=[];
  const entryShell=id==='loom'?await loadLoomEntryShell():null;
  for(let i=0;i<(id==='loom'?2:1);i++){
    const unit=receiver(unitTemplate);unit.root.rotation.y=rotation+(id==='loom'?i*Math.PI:0);
    if(entryShell)unit.hood.traverse(node=>{
      if(node.isMesh&&node.userData.moscow_source==='hood'){
        node.geometry=entryShell.geometry;node.name='LM07_With_CAD_Entry';
      }
    });
    const centre=id==='loom'?anchors[i]:datum;
    unit.root.position.copy(at(centre,id==='loom'?mountHeight+.002:guideHeight+.012+.0195,offset));
    group.add(unit.root);units.push(unit);
  }
  let controller=null;
  if(plan.separateController){
    // A full-height enclosure under the silhouette would lift it 100 mm above
    // the projector axis. Keep the carriage low and bolt electronics to the deck.
    const sled=units[0].root;
    const stack=units[0];
    stack.hood.visible=false;sled.getObjectByName('Service').visible=false;
    sled.traverse(o=>{
      if(/Load_path|Spindle_bracket|Isolating_seam/.test(o.name))o.visible=false;
      if(/Stem_sleeve|Socket_recess|Hand_screw|Thumb_cap/.test(o.name))o.position.y-=.098;
    });
    const fixed=receiver((await loadMoscowTemplates('loom'))[1]);controller=fixed;
    fixed.trigger.visible=false;fixed.root.traverse(o=>{if(o.name==='Pusher')o.visible=false;});
    const [ex,ez]=plan.separateController;
    if(controllerBase)fixed.root.position.fromArray(controllerBase);
    else fixed.root.position.set(bounds.min.x+ex*size.x,mountHeight-.004,bounds.min.z+ez*size.z);
    group.add(fixed.root);
    const brass=new T.MeshStandardMaterial({color:0x866d48,roughness:.42,metalness:.72});
    const peg=new T.Mesh(new T.CylinderGeometry(.003,.003,plan.cutoutPinMm/1000,16),brass);
    peg.position.y=.051+plan.cutoutPinMm/2000;sled.add(peg);
    const shank=new T.Mesh(new T.CylinderGeometry(.006,.006,.058,16),brass);
    shank.rotation.x=Math.PI/2;shank.position.set(0,.022,.108);sled.add(shank);
    const knob=new T.Mesh(new T.SphereGeometry(1,22,14),new T.MeshStandardMaterial({color:0x72442d,roughness:.46}));
    knob.scale.set(.023,.024,.041);knob.position.set(0,.022,.15);sled.add(knob);
  }
  const movingParts=[];
  body.traverse(o=>{if(o.userData.movingCraftPart)movingParts.push(o);});
  const craft=new T.Group();craft.name='WorkingCraftPart';group.add(craft);
  movingParts.forEach(o=>craft.attach(o));
  const handGrips=[],levers=[];
  if(plan.handGrips){
    for(const [i,key] of ['left','right'].entries()){
      const control=new T.Group(),pivot=new T.Vector3(...plan.leverPivots[i]).multiply(size).add(bounds.min);
      control.position.copy(pivot);group.add(control);control.updateWorldMatrix(true,true);
      const surfaces=[];body.traverse(node=>{if(node.userData.moscowHandle===key)surfaces.push(node);});
      surfaces.forEach(node=>control.attach(node));
      const loc=new T.Vector3(...plan.handGrips[i]).multiply(size).add(bounds.min);
      handGrips.push(loc.clone());levers.push({pivot:control,offset:loc.sub(pivot)});
    }
  }
  const craftBounds=movingParts.length?new T.Box3().setFromObject(craft,true):null;
  const craftMid=craftBounds?.getCenter(new T.Vector3()),craftSize=craftBounds?.getSize(new T.Vector3());
  const cutoutScale=plan.cutoutWidthMm&&craftSize?plan.cutoutWidthMm/(1000*craftSize.x):1;
  const ySeat=id==='loom'?guideHeight+.014:units[0].root.position.y+(controller ? .051+(plan.cutoutPinMm||0)/1000 : .149);
  if(craftMid){
    if(id==='shadow'&&plan.lamp){
      // The scan shows the bird broadside to a front camera. Rotate the real
      // cutout across the beam so the lantern projects its profile, not an edge.
      craft.rotation.y=rotation-Math.PI/2;
      craftMid.applyAxisAngle(new T.Vector3(0,1,0),craft.rotation.y);
    }
    craft.scale.setScalar(cutoutScale);craftMid.multiplyScalar(cutoutScale);
    craft.position.y=ySeat-craftBounds.min.y*cutoutScale;
    craft.position[cross]=mid[cross]+offset-craftMid[cross];
  }
  group.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  const optical=id==='shadow'?buildTabletopOptics(T,scene,body,bounds,plan,movingParts):null;
  const clearance=.016;
  // The centre of each loom switch roller is 91 mm inboard of its unit origin.
  const switchSpacing=shaftLength-.182;
  const stroke=Math.max(0,id==='shadow'?shaftLength-2*(ENCLOSURE_HALF+clearance):switchSpacing-(craftSize?.[widthAxis]||0));
  const focus=units[id==='loom'?1:0].root.position.clone();focus.y+=.072;
  const handTarget=(grip||focus).clone();
  const measurements={
    id,axis:widthAxis,bodyMm:measuredBody.getSize(new T.Vector3()).toArray().map(roundMM),
    registrationEnvelopeMm:size.toArray().map(roundMM),pairedEndSoleMm:[130,roundMM(gauge+.150),20],
    entryDiameterMm:entryShell?.userData.bore_diameter_mm??null,entryDepthMm:entryShell?.userData.bore_length_mm??null,
    pairedEndSoleCount:2,soleFastenersM4:8,soleHoleMm:4.5,
    shaftDiameterMm:24,shaftLengthMm:roundMM(shaftLength),endToEndFeetMm:roundMM(shaftLength+2*SHOE_HALF),
    gaugeMm:roundMM(gauge),workingStrokeMm:roundMM(stroke),railYawDeg:Math.round(rotation*180/Math.PI*10)/10,
    strokeDefinition:id==='shadow'?'clear carriage-centre travel':'shuttle-centre travel between opposite roller contacts',
    enclosureMm:[197,176,id==='loom'||controller?116.7:169.1],fixedControlMm:controller?.root.position.toArray().map(roundMM)||null,
    lowCarriageHeightMm:controller?70.5:null,replacementDeckThicknessMm:plan.deckCorners?12:null,
    anchorsMm:hits.map(p=>p.toArray().map(roundMM)),mountPlaneYmm:roundMM(mountHeight),
    signalSpacingMm:id==='loom'?roundMM(switchSpacing):null,
    nativeMovingParts:movingParts.length,movingPartMm:craftSize?.clone().multiplyScalar(cutoutScale).toArray().map(roundMM)||null,
    originalMovingPartMm:craftSize?.toArray().map(roundMM)||null,cutoutPinMm:plan.cutoutPinMm||null,
    handleCentresMm:handGrips.map(pt=>pt.toArray().map(roundMM)),handleTravelDeg:levers.length?14:null,
    cutoutYawDeg:optical?Math.round(craft.rotation.y*180/Math.PI*10)/10:null,optical,
    proposedMountClearanceMm:roundMM(clearance),donorScale:1
  };
  function update(p,service=false){
    p=clamp(p,0,1);
    const scaled=p*3,leg=Math.min(2,Math.floor(scaled)),fraction=scaled-leg;
    const travel=id==='loom'?(leg%2?1-fraction:fraction):p;
    for(const [i,lever] of levers.entries()){
      const working=(leg%2)===i,press=working?Math.sin(Math.PI*fraction):0;
      lever.pivot.rotation.x=.24435*press;lever.pivot.updateWorldMatrix(true,true);
      handGrips[i].copy(lever.offset).applyMatrix4(lever.pivot.matrixWorld);
    }
    const shift=(travel-.5)*stroke*(plan.runDirection||1)*cosine;
    const along=mid[widthAxis]+datum+shift,crossing=mid[cross]+offset+slope*shift;
    if(craftMid){craft.position[widthAxis]=along-craftMid[widthAxis];craft.position[cross]=crossing-craftMid[cross];}
    const mask=id==='loom'?(1<<Math.floor(scaled+.00001))-1:1<<Math.min(2,Math.floor(p*3));
    units.forEach((u,i)=>{
      u.hood.visible=!service&&!controller;
      if(u.trigger)u.trigger.rotation.z=-.17*clamp(1-Math.abs(travel-i)/.055,0,1);
      if(id==='shadow'){
        u.root.position[widthAxis]=along;u.root.position[cross]=crossing;
        focus.copy(u.root.position);focus.y+=controller ? .046 : .072;
        if(service&&controller){focus.lerp(controller.root.position,.45);focus.y+=.030;}
        if(controller){
          u.root.updateWorldMatrix(true,false);handTarget.set(0,.045,.15).applyMatrix4(u.root.matrixWorld);
        }else{
          handTarget[widthAxis]=along;handTarget[cross]=crossing;handTarget.y=u.root.position.y+.152;
        }
      }
      for(let bit=0;bit<3;bit++){
        const m=u.indicators[bit],on=mask&(1<<bit);
        m.color.set(on?0xefb668:0x394446);m.emissive.set(on?0xffa82c:0);m.emissiveIntensity=on?1.05:0;
      }
    });
    if(controller){
      controller.hood.visible=!service;
      for(let n=0;n<3;n++){
        const mat=controller.indicators[n],on=mask&(1<<n);
        mat.color.set(on?0xefb668:0x394446);mat.emissive.set(on?0xffa82c:0);mat.emissiveIntensity=on?1.05:0;
      }
    }
  }
  function visibleEnvelope(){
    const physical=new T.Box3(),vertex=new T.Vector3(),subjects=[body,group];
    const screen=scene.getObjectByName('TabletopMatte');if(screen)subjects.push(screen);
    for(const subject of subjects){
      subject.updateWorldMatrix(true,true);subject.traverseVisible(mesh=>{
        if(!mesh.isMesh||mesh.name==='Actual silhouette on the matte screen')return;
        const geometry=mesh.geometry,pos=geometry.getAttribute('position'),indices=geometry.getIndex(),range=geometry.drawRange;
        const stop=Math.min(indices?.count??pos.count,range.start+range.count);
        for(let n=range.start;n<stop;n++){
          mesh.getVertexPosition(indices?indices.getX(n):n,vertex);
          physical.expandByPoint(vertex.applyMatrix4(mesh.matrixWorld));
        }
      });
    }
    return physical;
  }
  const millimetres=box=>({min:box.min.toArray().map(roundMM),max:box.max.toArray().map(roundMM),size:box.getSize(new T.Vector3()).toArray().map(roundMM)});
  const swept=new T.Box3();
  measurements.envelopesByTravel=[0,.5,1].map(p=>{
    update(p,false);const box=visibleEnvelope();swept.union(box);
    return {p,...millimetres(box)};
  });
  measurements.assembledTravelEnvelopeMm=millimetres(swept);
  if(base>0){
    const [w,d]=standFootprint||[measuredBody.getSize(new T.Vector3()).x+.22,measuredBody.getSize(new T.Vector3()).z+.28];
    const stand=new T.Box3(new T.Vector3(-w/2,0,-d/2),new T.Vector3(w/2,base,d/2));
    measurements.withDisplayStandMm=millimetres(stand.union(swept));
  }
  update(0,false);
  const opticalTarget=optical?new T.Vector3(optical.screenXmm/1000,base+.43,mid.z):null;
  return {group,measurements,focus,handTarget,handGrips,update,opticalTarget};
}
