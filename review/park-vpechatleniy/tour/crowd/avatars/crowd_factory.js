// Crowd derivatives: Microsoft Rocketbox / Avatar Studio, MIT.
// Engine-independent adapter: inject the park's existing THREE, GLTFLoader instance,
// and SkeletonUtils.clone. Never imports or creates a second Three.js engine.
import {createPhoneResources,createSocialPose} from './social-pose.js?v=social-20261124';
const canonical = name => name.replace(/^mixamorig:?/i, '');
const OUTFITS = ['original', 'formal', 'shirt', 'tee', 'shirt'];
const HEIGHTS = [0.97, 1.03, 1.00, 1.07, 0.94];
const WIDTHS = [0.98, 1.03, 1.00, 0.97, 1.04];
const PALETTES = [
  { name:'original', top:null, trousers:'#364353' },
  { name:'navy', top:'#3f587b', trousers:'#33373e' },
  { name:'forest', top:'#3d7669', trousers:'#333b46' },
  { name:'cream', top:'#d7caa9', trousers:'#36517a' },
  { name:'terracotta', top:'#ae6151', trousers:'#666055' },
  { name:'blue', top:'#668cb9', trousers:'#30353c' },
  { name:'burgundy', top:'#824451', trousers:'#454957' },
  { name:'ochre', top:'#b69a62', trousers:'#364959' },
];
function hash(text) { let h=2166136261; for(const c of String(text)) h=Math.imul(h^c.charCodeAt(0),16777619); return h>>>0; }
const clamp = (v,a,b) => Math.min(b,Math.max(a,v));

export function createAvatarFactory({ THREE, loader, cloneSkeleton, manifest,
  assetBaseUrl=new URL('./',import.meta.url).href, textureAnisotropy=2 }) {
  if(!THREE || !loader?.loadAsync || typeof cloneSkeleton!=='function') throw new Error('Inject THREE, one shared GLTFLoader, and SkeletonUtils.clone');
  if(!Array.isArray(manifest?.bases) || !manifest.bases.length) throw new Error('Missing avatar manifest bases');
  const catalog=new Map(manifest.bases.map(row=>[row.id,row]));
  const pending=new Map(), templates=new Map(), textures=new Map(), materials=new Map(), handles=new Set();
  const ownedMaterials=new Set(), ownedTextures=new Set(), ownedGeometries=new Set(), textureColors=new Map();
  const phoneResources=createPhoneResources(THREE);
  let disposed=false, loadRequests=0;
  const assertLive=()=>{if(disposed)throw new Error('Avatar factory has been disposed');};
  function rootTrack(clip,hips) {
    const tracks=clip.tracks.filter(t=>{
      const p=THREE.PropertyBinding.parseTrackName(t.name);
      const name=p.objectName==='bones'?p.objectIndex:p.nodeName;
      return p.propertyName==='position' && typeof name==='string' && canonical(name).toLowerCase()===canonical(hips.name).toLowerCase();
    });
    if(tracks.length!==1)throw new Error(`${clip.name}: expected one Hips translation track`);
    return tracks[0];
  }
  function prepareClip(source,hips) {
    const clip=source.clone();
    clip.tracks=clip.tracks.filter(t=>!['morphTargetInfluences','weights'].includes(THREE.PropertyBinding.parseTrackName(t.name).propertyName));
    const track=rootTrack(clip,hips), first=Array.from(track.createInterpolant().evaluate(0)), last=Array.from(track.createInterpolant().evaluate(source.duration));
    const cyclic=/^(Walk|Idle)$/i.test(source.name);
    const cubic=Boolean(track.createInterpolant?.isInterpolantFactoryMethodGLTFCubicSpline);
    const width=track.getValueSize(),size=cubic?width/3:width;
    for(let k=0;k<track.times.length;k++)for(const axis of [0,2]){
      const drift=cyclic?(last[axis]-first[axis])/source.duration:0;
      track.values[k*width+(cubic?size:0)+axis]-=first[axis]+drift*track.times[k];
      if(cubic){track.values[k*width+axis]-=drift;track.values[k*width+2*size+axis]-=drift;}
    }
    return {clip,first,last};
  }
  function poolMaterialTextures(material,row) {
    ownedMaterials.add(material);
    const signatures=row.materialTextureSignatures?.[material.name]||{};
    for(const slot of ['map','normalMap','roughnessMap','metalnessMap','alphaMap','aoMap']){
      const t=material[slot];if(!t)continue;
      t.anisotropy=textureAnisotropy;
      const signature=signatures[slot];
      if(!signature){ownedTextures.add(t);continue;}
      const key=[signature,t.colorSpace,t.flipY,t.wrapS,t.wrapT,t.minFilter,t.magFilter,t.mapping].join('|');
      const shared=textures.get(key);
      if(shared && shared!==t){material[slot]=shared;t.dispose();}
      else {textures.set(key,t);ownedTextures.add(t);}
    }
  }
  function floorSamples(rig,bones) {
    const feet=new Set();
    for(const bone of [bones.LeftFoot,bones.RightFoot])bone?.traverse(o=>{if(o.isBone)feet.add(o);});
    const entries=[];
    rig.traverse(mesh=>{
      if(!mesh.isSkinnedMesh)return;
      const index=mesh.geometry.attributes.skinIndex,weight=mesh.geometry.attributes.skinWeight;
      if(!index||!weight)return;
      const accepted=mesh.skeleton.bones.map(b=>feet.has(b)),ids=[];
      for(let i=0;i<index.count;i++){
        let influence=0;for(let j=0;j<4;j++)if(accepted[index.getComponent(i,j)])influence+=weight.getComponent(i,j);
        if(influence>=.25)ids.push(i);
      }
      if(ids.length)entries.push({mesh,ids});
    });
    return entries;
  }
  function averageMaterialColor(material,fallback) {
    const m=Array.isArray(material)?material[0]:material,color=m?.color?.clone()||new THREE.Color(fallback);
    const texture=m?.map;
    if(texture?.image && typeof document!=='undefined'){
      let average=textureColors.get(texture.uuid);
      if(!average){
        try{
          const canvas=document.createElement('canvas');canvas.width=canvas.height=24;
          const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(texture.image,0,0,24,24);
          const pixels=context.getImageData(0,0,24,24).data;let r=0,g=0,b=0,count=0;
          for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]<128||pixels[i]+pixels[i+1]+pixels[i+2]<24)continue;r+=pixels[i];g+=pixels[i+1];b+=pixels[i+2];count++;}
          if(count)average=new THREE.Color().setRGB(r/count/255,g/count/255,b/count/255,THREE.SRGBColorSpace);
        }catch{ /* A blocked texture read leaves the original material color. */ }
        average ||= new THREE.Color(1,1,1);textureColors.set(texture.uuid,average);
      }
      color.multiply(average);
    }
    return color;
  }
  async function load(id) {
    assertLive();if(templates.has(id))return templates.get(id);if(pending.has(id))return pending.get(id);
    const row=catalog.get(id);if(!row)throw new Error(`Unknown avatar base: ${id}`);
    const promise=(async()=>{
      loadRequests++;
      const gltf=await loader.loadAsync(new URL(row.url,assetBaseUrl).href);
      if(disposed)throw new Error('Avatar factory disposed while loading');
      const rig=gltf.scene,bones={};
      rig.traverse(o=>{
        if(o.isBone)bones[canonical(o.name)]=o;
        if(o.isMesh){
          ownedGeometries.add(o.geometry);
          for(const m of Array.isArray(o.material)?o.material:[o.material])poolMaterialTextures(m,row);
        }
      });
      if(!bones.Hips||!bones.LeftFoot||!bones.RightFoot)throw new Error(`${id}: incompatible skeleton`);
      rig.updateWorldMatrix(true,true);
      const clips=new Map();let strideMeters=0,forwardYaw=0;
      for(const source of gltf.animations){
        const prepared=prepareClip(source,bones.Hips);clips.set(source.name.toLowerCase(),prepared.clip);
        if(source.name==='Walk'){
          const delta=new THREE.Vector3(prepared.last[0]-prepared.first[0],0,prepared.last[2]-prepared.first[2]);
          if(bones.Hips.parent)delta.applyMatrix3(new THREE.Matrix3().setFromMatrix4(bones.Hips.parent.matrixWorld));
          strideMeters=Math.hypot(delta.x,delta.z);forwardYaw=Math.atan2(delta.x,delta.z);
        }
      }
      for(const name of ['idle','walk','wave','talk'])if(!clips.has(name))throw new Error(`${id}: missing ${name}`);
      if(!(strideMeters>0&&Number.isFinite(strideMeters)))throw new Error(`${id}: invalid walk stride`);
      // One-time foot-height measurement per base/outfit; never per-vertex on every visitor frame.
      const mixer=new THREE.AnimationMixer(rig),action=mixer.clipAction(clips.get('idle'));
      action.play();action.time=0;mixer.update(0);rig.updateWorldMatrix(true,true);
      rig.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});
      const entries=floorSamples(rig,bones),p=new THREE.Vector3(),floorOffsets={};
      for(const [outfit,definition]of Object.entries(row.outfits)){
        const visible=new Set(['Body','Hair',...definition.parts]);let min=Infinity;
        for(const {mesh,ids}of entries)if(visible.has(mesh.name))for(const i of ids){mesh.getVertexPosition(i,p).applyMatrix4(mesh.matrixWorld);min=Math.min(min,p.y);}
        floorOffsets[outfit]=Number.isFinite(min)?-min:0;
      }
      // Bounds are measured once per source, never by cloning all simulated people.
      // The walking envelope includes clothing/arms above the knees; it is used
      // for the simulation's body radius, while foot placement stays animation-owned.
      const selectedMeshes=[];rig.traverse(mesh=>{if(mesh.isMesh&&mesh.geometry?.attributes.position)selectedMeshes.push(mesh);});
      const envelopes=new Map(selectedMeshes.map(mesh=>[mesh,{height:-Infinity,waveHeight:-Infinity,radius:0}]));
      function measurePose(name,phase){
        mixer.stopAllAction();const pose=mixer.clipAction(clips.get(name));pose.reset().play();pose.time=clips.get(name).duration*phase;mixer.update(0);
        rig.updateWorldMatrix(true,true);rig.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});
        for(const mesh of selectedMeshes){const envelope=envelopes.get(mesh);
          for(let i=0;i<mesh.geometry.attributes.position.count;i++){
            mesh.getVertexPosition(i,p).applyMatrix4(mesh.matrixWorld);
            if(name==='wave')envelope.waveHeight=Math.max(envelope.waveHeight,p.y);
            else {envelope.height=Math.max(envelope.height,p.y);if(p.y>=.65)envelope.radius=Math.max(envelope.radius,Math.hypot(p.x,p.z));}
          }
        }
      }
      measurePose('idle',0);for(let i=0;i<8;i++)measurePose('walk',i/8);for(const phase of [.15,.35,.55,.75])measurePose('wave',phase);
      const outfitInfo={};
      for(const [outfit,definition]of Object.entries(row.outfits)){
        const visible=new Set(['Body','Hair',...definition.parts]),offset=floorOffsets[outfit]||0;
        let height=0,waveHeight=0,radius=0;
        for(const mesh of selectedMeshes)if(visible.has(mesh.name)){const e=envelopes.get(mesh);height=Math.max(height,e.height+offset);waveHeight=Math.max(waveHeight,e.waveHeight+offset);radius=Math.max(radius,e.radius);}
        const find=names=>selectedMeshes.find(mesh=>visible.has(mesh.name)&&names.some(name=>mesh.name.startsWith(name)));
        const skin=find(['Body','Skin_']),top=find(['Outfit_','Top_']),bottom=find(['Trousers','Outfit_']),hair=find(['Hair']);
        outfitInfo[outfit]={heightMeters:height,waveHeightMeters:Math.max(height,waveHeight),bodyRadius:radius,
          colors:{skin:averageMaterialColor(skin?.material,'#bc896c'),top:averageMaterialColor(top?.material,'#668090'),
            trousers:averageMaterialColor(bottom?.material,'#354052'),hair:hair?averageMaterialColor(hair.material,'#322821'):new THREE.Color('#322821')}};
      }
      mixer.stopAllAction();mixer.uncacheRoot(rig);
      const value={row,rig,clips,outfitInfo,info:{strideMeters,walkDurationSeconds:clips.get('walk').duration,forwardYaw,floorOffsets,boneCount:Object.keys(bones).length}};
      templates.set(id,value);return value;
    })().catch(error=>{pending.delete(id);throw error;});
    pending.set(id,promise);return promise;
  }
  async function preload(ids=[...catalog.keys()],{concurrency=3,onProgress}={}) {
    assertLive();let next=0,complete=0;
    await Promise.all(Array.from({length:Math.min(concurrency,ids.length)},async()=>{
      while(next<ids.length){const id=ids[next++];await load(id);complete++;onProgress?.({complete,total:ids.length,id});}
    }));
    return api;
  }
  function variantFor(baseId,index=0,seed=0) {
    const i=((index%5)+5)%5,offset=hash(baseId+':'+seed)%PALETTES.length;
    return {index:i,outfit:OUTFITS[i],palette:i===0?PALETTES[0]:PALETTES[(offset+i)%PALETTES.length],heightScale:HEIGHTS[i],widthScale:WIDTHS[i]};
  }
  function describe({baseId,variantIndex=0,seed=0,heightScale,widthScale}={}){
    assertLive();const template=templates.get(baseId);if(!template)throw new Error(`Call preload before describe: ${baseId}`);
    const variant=variantFor(baseId,variantIndex,seed);
    variant.heightScale=clamp(heightScale??variant.heightScale,.88,1.12);variant.widthScale=clamp(widthScale??variant.widthScale,.92,1.08);
    const measured=template.outfitInfo[variant.outfit],horizontal=variant.heightScale*Math.max(1,variant.widthScale);
    const colors=Object.fromEntries(Object.entries(measured.colors).map(([name,color])=>[name,color.clone()]));
    if(variant.palette.top){colors.top.multiply(new THREE.Color(variant.palette.top));if(!['shirt','tee'].includes(variant.outfit))colors.top.multiplyScalar(1.35);}
    if(variant.palette.trousers)colors.trousers.multiply(new THREE.Color(variant.palette.trousers));
    const info={...template.info,strideMeters:template.info.strideMeters*variant.heightScale,
      heightMeters:measured.heightMeters*variant.heightScale,waveHeightMeters:measured.waveHeightMeters*variant.heightScale,
      radius:Math.max(.42*horizontal,measured.bodyRadius*horizontal+.035),height:measured.waveHeightMeters*variant.heightScale+.06,
      groundOffsetMeters:(template.info.floorOffsets[variant.outfit]||0)*variant.heightScale,grounding:'fixed start-pose sole offset; no IK',
      visibleTriangles:template.row.outfits[variant.outfit].triangles,drawCalls:template.row.outfits[variant.outfit].drawCalls};
    return {baseId,variantIndex,seed,variant,info,strideMeters:info.strideMeters,heightMeters:info.heightMeters,
      radius:info.radius,height:info.height,lodColors:Object.fromEntries(Object.entries(colors).map(([name,color])=>[name,color.toArray()]))};
  }
  function materialFor(baseId,source,meshName,variant) {
    const cloth=/^(Outfit_|Top_)/.test(meshName),trousers=meshName==='Trousers',hair=/^Hair/.test(meshName);
    if(!cloth&&!trousers&&!hair)return source;
    const tint=trousers?variant.palette.trousers:(cloth?variant.palette.top:null);
    const key=[baseId,source.uuid,meshName,tint||'none'].join('|');
    if(materials.has(key))return materials.get(key);
    const m=source.clone();ownedMaterials.add(m);
    if(tint){m.color.multiply(new THREE.Color(tint));if(cloth&&!/^Top_/.test(meshName))m.color.multiplyScalar(1.35);}
    if(hair){m.transparent=false;m.alphaTest=.38;m.alphaToCoverage=true;m.side=THREE.DoubleSide;m.depthWrite=true;}
    materials.set(key,m);return m;
  }
  function create({baseId,variantIndex=0,seed=0,heightScale,widthScale,castShadow=false}={}) {
    assertLive();const template=templates.get(baseId);if(!template)throw new Error(`Call preload before create: ${baseId}`);
    const description=describe({baseId,variantIndex,seed,heightScale,widthScale}),variant=description.variant;
    const root=new THREE.Group(),sizeGroup=new THREE.Group(),facingGroup=new THREE.Group(),groundGroup=new THREE.Group();
    root.name=`visitor_${baseId}_${variantIndex}`;root.add(sizeGroup);sizeGroup.add(facingGroup);facingGroup.add(groundGroup);
    sizeGroup.scale.set(variant.heightScale*variant.widthScale,variant.heightScale,variant.heightScale);
    groundGroup.position.y=template.info.floorOffsets[variant.outfit]||0;
    const rig=cloneSkeleton(template.rig);groundGroup.add(rig);
    const visible=new Set(['Body','Hair',...template.row.outfits[variant.outfit].parts]);
    const remove=[],faceMeshes=[],skeletons=new Set();
    rig.traverse(o=>{
      if(!o.isMesh)return;
      if(!visible.has(o.name)){remove.push(o);return;}
      o.material=Array.isArray(o.material)?o.material.map(m=>materialFor(baseId,m,o.name,variant)):materialFor(baseId,o.material,o.name,variant);
      o.frustumCulled=false;o.castShadow=castShadow;o.receiveShadow=false;
      if(o.skeleton)skeletons.add(o.skeleton);
      if(o.morphTargetInfluences)faceMeshes.push(o);
    });
    for(const mesh of remove)mesh.removeFromParent();
    const mixer=new THREE.AnimationMixer(rig),actions=new Map();
    for(const [name,clip]of template.clips){const a=mixer.clipAction(clip);a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;a.paused=true;a.setEffectiveWeight(0).play();actions.set(name,a);}
    let current='idle',time=0,speed=1,loop=true,elapsed=0,transition=null,dead=false;
    const socialPose=createSocialPose({THREE,root,rig,info:description.info,phoneResources});
    const expression={},blinkOffset=(hash(baseId+':'+variantIndex+':'+seed)%1000)/173;
    function switchMotion(name,{phase=0,timeScale=1,fade=.18,loop:repeat=true}={}) {
      const key=name.toLowerCase();if(!actions.has(key))throw new Error(`Unsupported crowd clip: ${name}`);
      if(key!==current){transition=fade>0?{from:current,time,duration:fade,age:0}:null;current=key;time=phase*template.clips.get(key).duration;}
      speed=timeScale;loop=repeat;
    }
    function applyPose() {
      socialPose.reset();
      for(const a of actions.values())a.setEffectiveWeight(0);
      const duration=template.clips.get(current).duration;
      actions.get(current).time=loop?THREE.MathUtils.euclideanModulo(time,duration):clamp(time,0,duration);
      const weight=transition?clamp(transition.age/transition.duration,0,1):1;
      actions.get(current).setEffectiveWeight(weight);
      if(transition&&weight<1){const a=actions.get(transition.from);a.time=THREE.MathUtils.euclideanModulo(transition.time,template.clips.get(transition.from).duration);a.setEffectiveWeight(1-weight);}else transition=null;
      mixer.update(0);facingGroup.rotation.y=current==='walk'?-template.info.forwardYaw:0;
    }
    function applyFace(enabled=true) {
      let blink=0;const phase=THREE.MathUtils.euclideanModulo(elapsed+blinkOffset,4.1);
      if(phase<.18)blink=Math.sin(Math.PI*phase/.18);
      for(const mesh of faceMeshes){
        mesh.morphTargetInfluences.fill(0);if(!enabled)continue;
        for(const [name,value]of Object.entries(expression)){const i=mesh.morphTargetDictionary?.[name];if(i!==undefined)mesh.morphTargetInfluences[i]=clamp(value,0,1);}
        for(const name of ['eyeBlinkLeft','eyeBlinkRight']){const i=mesh.morphTargetDictionary?.[name];if(i!==undefined)mesh.morphTargetInfluences[i]=Math.max(blink,expression[name]||0);}
      }
    }
    const handle={root,rig,baseId,variant,
      info:{...description.info},
      play(name,options){if(dead)return;switchMotion(name,options);},
      get socialState(){return socialPose.state;},
      phone:socialPose.phone,
      pose(name,timeSeconds,{loop:repeat=true}={}){if(dead)return;switchMotion(name,{fade:0,loop:repeat});transition=null;time=timeSeconds;applyPose();applyFace(true);socialPose.update(null);},
      update(dt,{gaitPhase,activity,animate=true,face=true,social=null,socialStopped=true,socialHeadYaw=0,socialHeadPitch=0}={}){
        if(dead)return;dt=Math.max(0,Number.isFinite(dt)?dt:0);elapsed+=dt;
        if(activity)switchMotion(activity,{fade:.18,loop:true});
        time=current==='walk'&&Number.isFinite(gaitPhase)?gaitPhase*template.info.walkDurationSeconds:time+dt*speed;
        if(transition){transition.age+=dt;transition.time+=dt;}
        if(animate){applyPose();applyFace(face);socialPose.update(social,{time:elapsed,stopped:socialStopped,headYaw:socialHeadYaw,headPitch:socialHeadPitch});}
      },
      setExpression(values={}){for(const k of Object.keys(expression))delete expression[k];for(const [k,v]of Object.entries(values))if(manifest.faceMorphSubset.includes(k))expression[k]=v;},
      setShadows(value){rig.traverse(o=>{if(o.isMesh)o.castShadow=Boolean(value);});},
      dispose(){if(dead)return;dead=true;socialPose.dispose();root.removeFromParent();mixer.stopAllAction();mixer.uncacheRoot(rig);for(const skeleton of skeletons)skeleton.dispose();handles.delete(handle);},
    };
    applyPose();applyFace(true);root.updateMatrixWorld(true);handles.add(handle);return handle;
  }
  const api={load,preload,create,describe,variantFor,
    get stats(){return {baseFaces:catalog.size,loadedBases:templates.size,loadRequests,visitors:handles.size,pooledTextures:textures.size,pooledMaterials:materials.size};},
    dispose(){if(disposed)return;for(const h of [...handles])h.dispose();phoneResources.dispose();for(const g of ownedGeometries)g.dispose();for(const m of ownedMaterials)m.dispose();for(const t of ownedTextures)t.dispose();
      const images=new Set([...ownedTextures].map(t=>t.image));for(const image of images)image?.close?.();
      templates.clear();pending.clear();textures.clear();textureColors.clear();materials.clear();disposed=true;},
  };
  return api;
}
