import * as T from './vendor/three-0.180/three.module.min.js';
import {GLTFLoader} from './vendor/three-0.180/GLTFLoader.js';
import {createPeople} from './spatial-people.js';
import {makeProjection} from './apparatus-projection.js';
import {dressGallery} from './apparatus-room.js';
import {stations} from './apparatus-spec.js';
import {buildBellEnsemble,bellFilmState} from './bell-ensemble.js';
import {fitMoscowApparatus} from './art/production/moscow-fit.js';

const V=(...a)=>new T.Vector3(...a), clamp=T.MathUtils.clamp;
const smooth=v=>{v=clamp(v,0,1);return v*v*(3-2*v);};
const lerp=T.MathUtils.lerp;
export async function createStage(canvas,id,timing,film){
  const spec=stations[id];
  const [projection,datums]=await Promise.all([makeProjection(T,id,spec),fetch('construction.json').then(r=>r.json())]);
  const drawing=datums[id];
  const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:film,powerPreference:'high-performance'});
  renderer.setPixelRatio(film?1:Math.min(1.65,window.devicePixelRatio||1));renderer.setClearColor(0x252424);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.10;
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(39,16/9,.025,40);
  const room=dressGallery(T,scene,renderer,projection,spec.color);
  const {scene:body}=await new GLTFLoader().loadAsync('art/production/'+id+'.glb');
  const holder=new T.Group();holder.add(body);scene.add(holder);
  // The rope extends 160 mm in Pull. Register the neutral triangles to the CAD
  // coordinates, otherwise the morph's swept bounds shift the whole deck.
  const useRestVertices=id==='barge';
  let box=new T.Box3().setFromObject(body,useRestVertices),size=box.getSize(V()),mid=box.getCenter(V());
  if(!Number.isFinite(size.y)||size.y<.01)throw Error('Размер прибора недоступен');
  const k=spec.height/size.y;
  body.scale.multiplyScalar(k);body.position.add(V(-mid.x,-box.min.y,-mid.z).multiplyScalar(k));
  const base=spec.stand||0;holder.position.y=base;holder.updateWorldMatrix(true,true);
  box=new T.Box3().setFromObject(body,useRestVertices);size=box.getSize(V());mid=box.getCenter(V());
  const normalized=a=>V(a[0]*size.x,base+a[1]*size.y,a[2]*size.z);
  const grip=drawing.grip?V(...drawing.grip):normalized(spec.contact);
  const mechanism=drawing.detail?V(...drawing.detail):normalized(spec.detail);
  if(id==='glass'&&drawing.mouth)mechanism.lerp(V(...drawing.mouth),.62);
  const standTop=drawing.standParts?.find(part=>part.key==='SH-02');
  const fit=await fitMoscowApparatus(scene,T,body,id,{base,grip,detail:mechanism,standFootprint:standTop&&[standTop.size[0],standTop.size[2]],controllerBase:drawing.controllerBase,fairground:drawing.fairground});
  const morphs=[],pulls=[],mapButtons=[];
  body.traverse(o=>{
    if(!o.isMesh)return;o.castShadow=o.receiveShadow=true;
    for(const mat of [].concat(o.material||[]))for(const key of ['map','normalMap','roughnessMap','metalnessMap'])if(mat[key])mat[key].anisotropy=renderer.capabilities.getMaxAnisotropy();
    const dict=o.morphTargetDictionary;
    if(dict?.Press!==undefined)morphs.push(o);
    if(dict?.Pull!==undefined)pulls.push(o);
    if(id==='soundmap')for(const [slot,name] of ['PressLeft','PressMiddle','PressRight'].entries()){
      if(dict?.[name]!==undefined)mapButtons.push({mesh:o,slot,index:dict[name]});
    }
  });
  if(base&&drawing.standParts)for(const piece of drawing.standParts){
    for(const xyz of piece.points){const n=room.box(...xyz,...piece.size,piece.key==='SH-02'?room.oak:room.black);n.name='Drawing_'+piece.key;}
  }
  const spacing=drawing.pitch||Math.min(3.16,size.x+.26);
  const bells=id==='bells'?buildBellEnsemble(T,holder,drawing):null;
  if(bells)scene.add(bells.group);
  const bellScore=id==='bells'&&film?await fetch('art/production/film-bell-score.json').then(r=>{if(!r.ok)throw Error('Не загружена партитура звонницы');return r.json();}):null;
  if(id==='regional')for(const side of [-1,1]){const clone=holder.clone(true);clone.position.x=side*spacing;scene.add(clone);}
  const indicators=[];
  if(id==='soundmap')for(const point of drawing.buttons){
    const ring=new T.Mesh(new T.RingGeometry(.031,.035,64),new T.MeshBasicMaterial({color:0xffd29a,side:T.DoubleSide,transparent:true,opacity:0,depthWrite:false}));
    ring.rotation.x=-Math.PI/2;ring.position.set(...point);ring.position.y+=.004;scene.add(ring);indicators.push(ring);
  }

  let travelling=null,controlSurface=null;
  const amber=new T.MeshStandardMaterial({color:0xcfab71,metalness:.54,roughness:.40});
  const dark=new T.MeshStandardMaterial({color:0x413025,metalness:.06,roughness:.70});
  if(id==='craft'){
    travelling=new T.Group();scene.add(travelling);
    const handle=new T.Mesh(new T.CylinderGeometry(.006,.009,.22,16),room.oak);
    handle.position.y=.13;travelling.add(handle);
    const ferrule=new T.Mesh(new T.CylinderGeometry(.009,.007,.041,16),amber);ferrule.position.y=.021;travelling.add(ferrule);
    const tip=new T.Mesh(new T.ConeGeometry(.008,.033,16),dark);tip.rotation.z=Math.PI;tip.position.y=-.013;travelling.add(tip);travelling.rotation.z=-.27;
  }
  if(id==='passport'){
    const paper=document.createElement('canvas');paper.width=512;paper.height=300;const ctx=paper.getContext('2d');
    const tx=new T.CanvasTexture(paper);tx.colorSpace=T.SRGBColorSpace;
    travelling=new T.Mesh(new T.PlaneGeometry(.20,.116),new T.MeshStandardMaterial({map:tx,roughness:.86,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2}));travelling.rotation.x=-Math.PI/2;scene.add(travelling);
    let ink=null;controlSurface=p=>{const on=p>.27;if(ink===on)return;ink=on;ctx.fillStyle='#e6d5ae';ctx.fillRect(0,0,512,300);ctx.strokeStyle='#927854';ctx.lineWidth=3;ctx.strokeRect(14,14,484,272);ctx.fillStyle='#403b32';ctx.font='35px Georgia';ctx.fillText('Билет путешественника',30,70);
      for(let i=0;i<3;i++){ctx.strokeStyle=on&&i===0?'#a84236':'#bba783';ctx.lineWidth=on&&i===0?9:2;ctx.beginPath();ctx.arc(107+i*145,182,44,0,7);ctx.stroke();}tx.needsUpdate=true;};
  }
  // Project directly onto the active pane in addition to the large spectator display.
  if(id==='regional'){
    const w=size.x*.80,h=size.y*.78,round=Math.min(w*.49,h*.40),s=new T.Shape();s.moveTo(-w*.5,0);s.lineTo(w*.5,0);s.lineTo(w*.5,h-round);s.absarc(0,h-round,round,0,Math.PI,false);s.lineTo(-w*.5,0);
    const geo=new T.ShapeGeometry(s,48),a=geo.attributes.position,uv=geo.attributes.uv;for(let j=0;j<a.count;j++)uv.setXY(j,(a.getX(j)+w*.5)/w,a.getY(j)/h);
    const pane=new T.Mesh(geo,new T.MeshBasicMaterial({map:projection.panes[1],side:T.DoubleSide,toneMapped:false}));pane.position.set(0,.20,(drawing.anchors?.PanelPlane?.[2]??size.z*.45)+.012);scene.add(pane);
    for(const side of [-1,1]){const other=pane.clone();other.position.x=spacing*side;other.material=pane.material.clone();other.material.map=projection.panes[side<0?0:2];scene.add(other);}
  }
  const people=createPeople(scene,T);
  const emptyHall=new URLSearchParams(location.search).has("backgroundPlate");
  const main={role:'user',x:0,z:0,heading:0,reach:0},witness={role:'guest',x:1.58,z:1.44,heading:-2.4};
  const partner={role:id==='loom'?'user':'guest',x:-1,z:.70,heading:1.4,reach:0};
  const cast=emptyHall?[]:(id==='bells'||id==='loom'?[main,witness,partner]:[main,witness]);
  const target=V(),look=V(),eye=V();let manualYaw=0,manualPitch=0,manualZoom=1,hold=null;
  let oldWidth=0,oldHeight=0;
  function resize(){const w=canvas.clientWidth||1280,h=canvas.clientHeight||720;if(w!==oldWidth||h!==oldHeight){renderer.setSize(w,h,false);camera.aspect=w/h;oldWidth=w;oldHeight=h;}}
  function posePeople(p,arm,time,state){
    if(id==='passport')arm=Math.max(arm,smooth(p/.11));
    const stampStroke=smooth((p-.12)/.075)*(1-smooth((p-.235)/.08));
    target.copy(grip);
    if(id==='glass'){target.y-=p*.13449+.012;target.z-=p*.04249;}
    if(id==='barge'&&pulls.length){const end=drawing.anchors?.GripAtFullPull||drawing.anchors?.HandGripAtFullPull||[grip.x,grip.y,grip.z+.16];target.lerp(V(...end),p);}
    if(id==='regional'){target.x+=size.x*(p-.5)*.61;target.z+=.095;}
    if(id==='craft'){
      target.x+=.08*Math.cos(p*6.9);target.z+=.055*Math.sin(p*6.9);
      travelling.position.copy(target);target.y+=.13;
    }
    if(id==='passport'){
      const slide=smooth((p-.31)/.44);travelling.position.copy(V(...drawing.paperFrom)).lerp(V(...drawing.paperTo),slide);travelling.position.y+=.004;
      target.x=lerp(grip.x,travelling.position.x,slide);target.y=lerp(grip.y-.013*stampStroke,travelling.position.y+.028,slide);target.z=lerp(grip.z,travelling.position.z,slide);
    }
    if(id==='loom'&&fit?.handGrips.length)target.copy(fit.handGrips[0]);
    if(id==='soundmap'&&drawing.buttons?.length){
      const phases=p*drawing.buttons.length,index=clamp(Math.ceil(phases-.00001)-1,0,drawing.buttons.length-1),phase=phases-index;
      const prev=Math.max(0,index-1);target.copy(V(...drawing.buttons[prev])).lerp(V(...drawing.buttons[index]),smooth(phase/.43));
      const stroke=smooth((phase-.60)/.20)*(1-smooth((phase-.87)/.12));
      for(const button of mapButtons)button.mesh.morphTargetInfluences[button.index]=button.slot===index?stroke:0;
      indicators.forEach((mark,i)=>{mark.position.y=drawing.buttons[i][1]+.004-(i===index?.003*stroke:0);});
      target.y+=.048*Math.sin(Math.PI*Math.min(1,phase/.63))-.003*stroke;
    }
    if(id==='shadow'){
      if(fit)target.copy(fit.handTarget);
      else target.x+=(.5-p)*size.x*.22;
    }
    const beside=grip.x>0?1:-1;main.x=grip.x+beside*.42;main.z=grip.z+.42;
    main.singleHand=['glass','passport','craft','regional','soundmap','shadow'].includes(id);
    if(id==='glass'){main.x=grip.x+beside*.29;main.z=grip.z+.25;}
    if(id==='loom'&&fit?.handGrips.length){
      main.x=target.x-.18;main.z=target.z+.24;main.lean=.12*arm;main.singleHand=true;
    }
    main.limit=null;
    if(id==='barge'){main.x=grip.x+.015;main.z=size.z*.5+.115+p*.13;main.limit={axis:'z',edge:main.z,sign:1};main.crouch=.225*smooth(arm/.16);main.lean=.10*arm;main.otherTarget=[target.x-.018,target.y+.035,target.z-.055];}
    if(id==='craft'||id==='soundmap'||id==='regional'){
      main.x=target.x-.16;main.z=size.z*.5+.075;main.limit={axis:'z',edge:main.z,sign:1};
    }
    if(id==='passport'){
      const side=-size.x*.5-.065,front=size.z*.5+.075,around=smooth((p-.27)/.32),slide=smooth((p-.51)/.31);
      main.x=lerp(side,target.x-.16,slide);main.z=lerp(grip.z+.095,front,around);main.step=clamp((p-.27)/.55,0,1);
      main.limit=around<.995?{axis:'x',edge:side,sign:-1}:{axis:'z',edge:front,sign:1};
      main.lean=.23*arm;
    }
    main.heading=Math.atan2(target.x-main.x,target.z-main.z);main.reach=arm;
    main.target=arm>.03&&id!=='bells'?target.toArray():null; main.grasp=['barge','craft','loom','shadow'].includes(id);
    if(main.target&&arm<.16){const approach=1-smooth(arm/.16);main.target[1]+=.07*approach;main.target[2]+=.09*approach;}
    if(id==='bells'){
      const approaches=state?.participants??[smooth(p*4),smooth((p-.24)*4),smooth((p-.59)*4)];
      bells.update(state?.voices??approaches.map(Number),approaches);
      [main,witness,partner].forEach((person,i)=>{const step=approaches[i];person.x=(i-1)*spacing+mechanism.x;person.z=lerp(mechanism.z+1.02,mechanism.z,step);person.heading=Math.PI;person.step=step;person.y=mechanism.y*smooth((step-.65)/.35);});
    }else{
      witness.x=-beside*Math.max(1.65,size.x*.49+.85);witness.z=.42;witness.heading=Math.atan2(-witness.x,-1.7);
      if(id==='soundmap'){witness.x=.82;witness.z=-.90;witness.heading=Math.atan2(.2-witness.x,.06-witness.z);}
      if(id==='regional'){witness.x=-spacing-.55;witness.z=.85;witness.heading=2.78;}
      if(id==='loom'&&fit?.handGrips.length){
        const right=fit.handGrips[1];
        partner.x=right.x+.17;partner.z=right.z+.23;partner.heading=Math.atan2(right.x-partner.x,right.z-partner.z);
        partner.reach=smooth((p-.17)/.18);partner.lean=.10*partner.reach;partner.singleHand=true;
        partner.stanceAxis=[.84,.54];partner.contact=right.toArray();partner.footClearance={z:size.z*.5+.065};
        partner.target=partner.reach>.08?right.toArray():null;
        witness.x=-1.88;witness.z=-.78;witness.heading=Math.atan2(right.x-witness.x,right.z-witness.z);
      }
    }
    for(const m of morphs)m.morphTargetInfluences[m.morphTargetDictionary.Press]=id==='passport'?stampStroke:id==='glass'?p:arm;
    for(const m of pulls)m.morphTargetInfluences[m.morphTargetDictionary.Pull]=p;
    indicators.forEach((mark,index)=>{mark.material.opacity=p>0&&clamp(Math.ceil(p*3-.00001)-1,0,2)===index?.98:.06;});
    people.sync(cast);controlSurface?.(p);
  }
  const wide=Math.max(2.42,Math.min(4.2,size.x*.65+.8));
  let performanceCamera;
  function cameraPose(view,u,filmShot){
    const cy=mid.y, sign=grip.x>0?-1:1;
    if(view==='hall'){eye.set(lerp(3.42,2.30,u),lerp(3.85,2.30,u),lerp(5.65,4.4,u));look.set(-.12,lerp(.96,1.04,u),-.31);camera.fov=44;}
    if(view==='user'){eye.set(sign*(wide*.64+.28),1.58+u*.16,2.40+.68*(1-u));look.set(grip.x*.55,clamp((grip.y+1.38)*.5,.82,1.46),.16);camera.fov=42;}
    if(view==='user'&&id==='barge'){eye.set(3.2-.16*u,1.55,1.28+.36*u);look.set(.65,.96,.77);camera.fov=42;}
    if(view==='user'&&id==='soundmap'){eye.set(2.13,1.76,1.40+.30*(1-u));look.set(.12,1.06,.32);camera.fov=40;}
    if(view==='user'&&id==='loom'){eye.set(-.16-.14*u,1.42+.10*u,4.88+.25*(1-u));look.set(-.05,.98,.53);camera.fov=43;}
    if(view==='detail'){
      if(fit){look.copy(fit.focus);eye.copy(look).add(V(sign*.33,.39+.09*(1-u),.43+.10*(1-u)));camera.fov=35;}
      else{eye.copy(mechanism).add(V(sign*(.65+.16*(1-u)),.36+.19*(1-u),.85+.25*(1-u)));look.copy(mechanism).lerp(grip,.10);camera.fov=34;}
      if(id==='loom'&&fit){look.x-=.035;eye.copy(look).add(V(-.55+.08*u,.37+.06*(1-u),.49+.06*(1-u)));camera.fov=36;}
      if(id==='regional'){
        look.copy(mechanism);eye.copy(look).add(V(-.57+.12*u,-.24+.025*u,.60-.14*u));camera.fov=34;
      }
      if(id==='soundmap'&&drawing.buttons?.length){
        if(u<.29){look.copy(V(...drawing.buttons[1]));eye.copy(look).add(V(.43,.23,.31));camera.fov=36;}
        else if(filmShot){look.set(.13,2.01,-3.23);eye.set(-.28+.26*u,2.05,.92+.18*u);camera.fov=46;}
        else{look.copy(mechanism);eye.copy(look).add(V(-.68,.39+.055*(1-u),.88));camera.fov=36;}
      }
    }
    if(view==='result'){eye.set(-2.75-.45*u,1.94+.26*u,3.94+.55*u);look.set(.22,1.59,-1.43);camera.fov=48;}
    if(id==='bells'){
      if(view==='hall'){eye.set(2.45-.90*u,3.09-.38*u,7.55-.30*u);look.set(0,1.15,-.06);camera.fov=43;}
      if(view==='user'){eye.set(.76-.30*u,2.09-.16*u,6.16+.20*u);look.set(0,1.06,.06);camera.fov=47;}
      if(view==='detail'){
        if(u<.46){eye.set(-3.33+.51*u,1.17,2.09-.27*u);look.set(-2.31,1.39,-.02);camera.fov=38;}
        else{eye.set(-.47+2.14*u,1.43,3.28-.16*u);look.set(.63+.51*u,1.41,-.04);camera.fov=52;}
      }
      if(view==='result'){eye.set(.97-.59*u,2.27+.09*u,6.88+.44*u);look.set(.02,1.19,-.12);camera.fov=43;}
    }
    if(id==='glass'){
      if(view==='hall'){eye.set(2.53-.89*u,2.66-.44*u,4.02-.27*u);look.set(.05,1.21,-.90);camera.fov=48;}
      if(view==='user'){
        if(!filmShot||u<.16){eye.set(1.59+.22*u,1.59,-1.67);look.set(.12,.84,-.17);camera.fov=44;}
        else{eye.set(.32-.31*u,1.70+.16*u,1.95+.13*u);look.set(-.22,1.91,-3.20);camera.fov=40;}
      }
      if(view==='detail'){
        if(!filmShot||u<.15){look.copy(mechanism);eye.copy(look).add(V(.48,.34,.69));camera.fov=39;}
        else{eye.set(-.21+.35*u,1.94+.05*u,1.41+.14*u);look.set(-.20,2.02,-3.23);camera.fov=39;}
      }
      if(view==='result'){eye.set(-.50+.32*u,1.83+.17*u,2.45+.20*u);look.set(-.13,1.96,-3.02);camera.fov=40;}
    }
    if(id==='shadow'){
      if(view==='hall'){eye.set(lerp(2.60,1.66,u),lerp(3.13,2.18,u),lerp(5.06,4.32,u));look.set(-.08,1.60,-1.8);camera.fov=43;}
      if(view==='user'){
        // Shoot down the optical axis so the cutout, sliding hand and small screen share the frame.
        eye.set(-1.64+.32*u,1.55+.10*u,1.30-.17*u);look.set(.06,1.18,-.045);camera.fov=34;
      }
      if(view==='detail'){
        if((!filmShot||u<.23)&&fit?.opticalTarget){
          look.copy(fit.opticalTarget);look.y-=.02;eye.copy(look).add(V(-.62,.036,-.055));camera.fov=38;
        }else{
          eye.set(-.69+.42*u,1.89+.09*u,.83+.02*u);
          look.set(-.42,1.95,-3.227);camera.fov=31;
        }
      }
      if(view==='result'){eye.set(.68-.22*u,1.92+.13*u,2.99+.52*u);look.set(-.08,1.85,-2.22);camera.fov=40;}
    }
    if(view==='performance'){
      if(!performanceCamera){
        const face=V(Math.sin(main.heading),0,Math.cos(main.heading));
        const side=V(face.z,0,-face.x).multiplyScalar(id==='glass'?-1:1);
        const focus=V(main.x,.87,main.z).addScaledVector(face,.19);
        const offset=side.multiplyScalar(3.05).addScaledVector(face,.75);offset.y=.39;
        performanceCamera={look:focus,eye:focus.clone().add(offset)};
      }
      look.copy(performanceCamera.look);eye.copy(performanceCamera.eye);camera.fov=38;
    }
    if(view==='top'){look.set(0,.55,-.34);eye.set(.015,6.6,.01);camera.fov=56;}
    if(!filmShot){const d=eye.clone().sub(look),sp=new T.Spherical().setFromVector3(d);sp.theta+=manualYaw;sp.phi=clamp(sp.phi-manualPitch,.22,1.53);sp.radius*=manualZoom;eye.copy(look).add(V().setFromSpherical(sp));}
    camera.position.copy(eye);camera.lookAt(look);camera.updateProjectionMatrix();
  }
  function draw(view,u,p,arm,isFilm,elapsed=0,approach=1,state=null){
    resize();fit?.update(p,id!=='shadow'&&view==='detail'&&(!isFilm||u>.40));posePeople(p,arm,elapsed,state);
    projection.redraw(p,elapsed,approach,state);projection.render?.(renderer);
    cameraPose(view,u,isFilm);renderer.render(scene,camera);
  }
  function frame(t){const c=timing.cues;let idx=0;for(let i=1;i<4;i++)if(t>=c[i].start-.1)idx=i;const start=idx?c[idx].start-.1:0,end=idx===3?timing.duration:c[idx+1].start-.1;
    const u=clamp((t-start)/(end-start),0,1),p=idx===0?0:idx===1?.46*smooth(u):idx===2?.46+.42*smooth(u):.88+.12*smooth(u);
    const arm=idx===0?.16*smooth(u):idx===1?.16+.84*smooth(u):idx===2?1-.14*Math.sin(u*Math.PI):1-.78*smooth(u);
    if(id==='shadow'){
      const handle=idx===0?0:idx===1?smooth(u):1;
      const hand=idx===0?.14*smooth(u):idx===1?.14+.86*smooth(u/.24):idx===2?1-.40*smooth(u):.60-.60*smooth(u);
      draw(['hall','user','detail','result'][idx],u,handle,hand,true,Math.max(0,t-c[2].start),idx===0?smooth(u*2):1);
    }else if(id==='glass'){
      const phase=idx===0?0:idx===1?Math.min(1.67,1.48*u):idx===2?2+Math.max(0,(u-.91)/.09)*.99:3;
      const press=idx===0?.78*smooth((u-.32)/.46):idx===1?.55+.23*Math.cos(u*Math.PI*2.4):idx===2?.35+.22*Math.cos(u*Math.PI*1.4):.12*(1-u);
      draw(['hall','user','detail','result'][idx],u,press,idx===0?smooth((u-.18)/.30):Math.max(.20,arm),true,t,1,{glassPhase:phase});
    }else if(id==='bells'){draw(['hall','user','detail','result'][idx],u,p,arm,true,t,1,bellFilmState(t,bellScore?.events??[]));}
    else if(id==='soundmap'){
      const since=t-start,stroke=idx?Math.min(.985,Math.max(.001,since/2.3)):0;
      const position=idx?(idx-1+stroke)/3:0,section=idx&&since<1.48?idx-1:idx;
      draw(['hall','user','detail','result'][idx],u,position,arm,true,t,1,{mapSection:section});
    }
    else if(id==='regional'){const opened=idx===0?0:idx===1?smooth(u):1;draw(['hall','user','detail','result'][idx],u,opened,arm,true,Math.max(0,t-c[2].start));}
    else draw(['hall','user','detail','result'][idx],u,p,arm,true);
  }
  function interactive(view,p,elapsed=0,state=null){hold={view,p,elapsed,state};draw(view,.60,p,p>.002?.85:.03,false,elapsed,1,state);}
  function orbit(x,y,zoom=1){manualYaw+=x;manualPitch=clamp(manualPitch+y,-.9,.8);manualZoom=clamp(manualZoom*zoom,.52,1.75);if(hold)interactive(hold.view,hold.p,hold.elapsed,hold.state);}
  function resetOrbit(){manualYaw=manualPitch=0;manualZoom=1;}
  function marks(){
    const screen=v=>{const n=v.clone().project(camera);return [(n.x+1)*.5,(1-n.y)*.5];};
    return {contact:screen(target),foot:screen(V(main.x,main.y||0,main.z)),grip:target.toArray(),
      people:cast.map(a=>({foot:screen(V(a.x,a.y||0,a.z)),hand:a.target?screen(V(...a.target)):null}))};
  }
  function plate(view,p,pass,time=0){
    if(view==='performance' && ['loom','bells'].includes(id))view='hall';
    draw(view,.44,p,id==='bells'?0:1,true,time,1);
    const nodes=people.nodes(),vis=new Map(scene.children.map(o=>[o,o.visible]));
    const before=scene.background;
    if(pass==='actor'){
      scene.background=new T.Color(0x00ff00);
      for(const obj of scene.children)if(!obj.isLight && !nodes.includes(obj))obj.visible=false;
      nodes.forEach((o,i)=>{o.visible=i===0 || id==='bells' || (id==='loom'&&i===2);});
     }else if(pass==='room'||pass==='occluders'){
      nodes.forEach(o=>{o.visible=false;});
    }
    let curtain;
    if(pass==='occluders'){
      curtain=new T.Mesh(new T.PlaneGeometry(60,60),new T.MeshBasicMaterial({color:0x00ff00,toneMapped:false}));
      curtain.quaternion.copy(camera.quaternion);
      curtain.position.copy(target).addScaledVector(camera.getWorldDirection(V()),.012);
      scene.add(curtain);
    }
    renderer.render(scene,camera);
    const result=canvas.toDataURL('image/png');
    if(curtain){scene.remove(curtain);curtain.geometry.dispose();curtain.material.dispose();}
    scene.background=before;for(const [obj,visible] of vis)obj.visible=visible;
    return result;
  }
  // Resolve only after the textured, independently posed visitors have actually appeared.
  posePeople(0,0);
  const deadline=performance.now()+45000;while(!cast.every(a=>people.readyFor(a))&&performance.now()<deadline){await new Promise(r=>setTimeout(r,80));posePeople(0,0);}
  if(!cast.every(a=>people.readyFor(a)))throw Error('Не удалось загрузить фигуры посетителей');
  frame(0);
  return {marks,ground:()=>people.ground(),plate,frame,interactive,orbit,resetOrbit,cinema:(v,u,p,t,state)=>draw(v,u,p,p,true,t,1,state),contacts:()=>people.contacts(),dimensions:size.toArray(),grip:grip.toArray(),detail:(fit?.focus||mechanism).toArray(),mount:fit?.measurements||null};
}
