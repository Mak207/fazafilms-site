import * as THREE from '../interactives/vendor/three-0.180/three.module.min.js';
import { SOURCE_MEDIA, SOURCE_FINALE_CITIES, SOURCE_GLASS_STEPS } from './source-media-data.js?v=3';

const VERTEX = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uImage;
uniform sampler2D uNext;
uniform sampler2D uThird;
uniform sampler2D uCaption;
uniform vec4 uCrop, uNextCrop, uThirdCrop;
uniform vec2 uFocal, uNextFocal, uThirdFocal;
uniform float uAspect, uImageAspect, uNextAspect, uThirdAspect, uClock, uSeed, uMode, uFlip;
uniform float uProgress, uPhase, uStrength, uPattern, uDaylight, uCaptionOn, uAuto, uFit, uSteam, uLace, uTiles, uCaptionOffset;
const float PI = 3.14159265359;
vec2 coverUV(vec2 uv, float aspect, vec2 focal) {
  float panelAspect = uAspect / max(1.0,uTiles);
  vec2 ratio = uFit > .5 ? vec2(max(1.0, panelAspect / aspect), max(1.0, aspect / panelAspect)) : vec2(min(1.0, panelAspect / aspect), min(1.0, aspect / panelAspect));
  vec2 center = uFit > .5 ? vec2(.5) : clamp(focal,ratio*.5,1.0-ratio*.5);
  return (uv - .5) * ratio + center;
}
vec3 sampleImage(sampler2D image, vec2 uv, float aspect, vec4 crop, vec2 focal) {
  vec2 fitted = coverUV(uv,aspect,focal);
  float inside = step(0.0,fitted.x)*step(fitted.x,1.0)*step(0.0,fitted.y)*step(fitted.y,1.0);
  vec2 at = vec2(crop.x, 1.0-crop.y-crop.w) + clamp(fitted,0.0,1.0)*crop.zw;
  return mix(vec3(.028,.063,.057),texture2D(image,at).rgb,inside);
}
vec3 photo(vec2 uv) {
  if(uTiles > 1.5) {
    float tile = mod(floor(uv.x*uTiles),3.0);
    vec2 local = vec2(fract(uv.x*uTiles),uv.y);
    if(tile < .5) return sampleImage(uImage,local,uImageAspect,uCrop,uFocal);
    if(tile < 1.5) return sampleImage(uNext,local,uNextAspect,uNextCrop,uNextFocal);
    return sampleImage(uThird,local,uThirdAspect,uThirdCrop,uThirdFocal);
  }
  vec3 a = sampleImage(uImage, uv, uImageAspect, uCrop, uFocal);
  if (uAuto < .5) return a;
  float fade = smoothstep(.1, .9, .5 - .5 * cos((uClock + uSeed * 7.0) * .13));
  return mix(a, sampleImage(uNext, uv, uNextAspect, uNextCrop, uNextFocal), fade);
}
float thread(float p, float width) { return 1.0 - smoothstep(width, width + .025, abs(sin(p))); }
void main() {
  vec2 uv = vec2(vUv.x, mix(vUv.y, 1.0-vUv.y, uFlip));
  vec3 color = photo(uv);
  float alpha = 1.0;
  if (uMode > .5 && uMode < 1.5) {
    // A woven projection cloth, not an opaque television. Lace follows the
    // original surface UVs; no floor, cap or supporting wire receives an image.
    vec2 p = vec2(uv.x * uAspect, uv.y) * 14.0;
    float vine = sin(p.y * 3.0 + sin(p.x * 3.0));
    float lace = max(thread(p.x * 7.0 + vine * 2.0, .16),
      thread(p.y * 7.0 + cos(p.x * 3.0) * 1.5, .13));
    float petal = pow(abs(sin(p.x * 2.5) * sin(p.y * 2.2)), 8.0);
    color = mix(color * .82 + vec3(.08,.09,.065), vec3(.94,.91,.80), max(lace * uLace, petal * uLace * .7));
    float weave = .965 + .035 * sin(uv.x * 1400.0) * sin(uv.y * 1800.0);
    color *= weave; alpha = .94;
  } else if (uMode > 1.5 && uMode < 2.5) {
    vec2 scrollUV = vec2(uv.x, clamp(uv.y + (uProgress - .5) * .12, .01, .99));
    color = photo(scrollUV);
    float border = smoothstep(.005,.035,min(min(uv.x,1.0-uv.x),min(uv.y,1.0-uv.y)));
    color = mix(vec3(.74,.57,.31), color * vec3(1.02,.98,.88), border);
    color *= .98 + .02 * sin(uv.y * 1800.0);
  } else if (uMode > 2.5 && uMode < 3.5) {
    vec2 p = uv - .5;
    float r = length(p);
    float a = atan(p.y,p.x) + uPhase * PI / 3.0;
    float sector = PI / (3.0 + uPattern);
    a = abs(mod(a + sector * .5, sector) - sector * .5);
    vec2 kaleido = .5 + vec2(cos(a),sin(a)) * r * 1.65;
    kaleido += sin(r * 90.0 - uPhase * PI * 2.0) * .0035;
    color = photo(clamp(kaleido,.01,.99));
    float rings = .5 + .5 * sin(r * 95.0 - uPhase * PI * 2.0);
    vec3 waterTint = uPattern < .5 ? vec3(.13,.43,.46) : uPattern < 1.5 ? vec3(.25,.69,.58) : vec3(.035,.19,.49);
    color = mix(color,waterTint,uPattern < .5 ? .14 : .35) + rings * (.035 + uPattern*.012);
    color *= 1.0 - smoothstep(.42,.52,r) * .4;
    color = mix(color,vec3(.80,.88,.85),uSteam*.67);
  } else if (uMode > 3.5 && uMode < 4.5) {
    vec2 p = vec2(uv.x*uAspect,uv.y) * (12.0 + uPattern*3.0);
    float weave = max(thread(p.x * PI + uPhase * .15,.17), thread(p.y * PI,.18));
    float diamond = step(.52, abs(sin((p.x+p.y)*1.57) * cos((p.x-p.y)*1.57)));
    vec3 textile = mix(vec3(.11,.20,.22),vec3(.83,.35,.22),diamond);
    float revealed = 1.0 - smoothstep(uProgress,uProgress+.018,uv.y);
    color = mix(vec3(.12,.16,.14),mix(photo(uv),textile,.72),max(.38,revealed));
    color = mix(color,vec3(.93,.79,.48),weave * max(.18,revealed) * .72);
  } else if (uMode > 5.5 && uMode < 6.5) {
    // The chosen journey changes the real panorama, including its light.
    color *= mix(vec3(.43,.54,.75),vec3(1.02,1.0,.92),uDaylight);
  }
  if(uMode > 6.5 && uMode < 7.5) {
    // The sphere carries an abstract light-and-route film. Rectangular
    // architectural photographs stay intact on the surrounding triptych.
    vec2 p=vec2(uv.x*PI*2.0,uv.y*PI);
    float flow=sin(p.x*5.0+sin(p.y*6.0)+uSeed*.4+uPhase*PI*2.0);
    float lines=pow(.5+.5*flow,12.0);
    float points=pow(max(0.0,sin(p.x*13.0)*sin(p.y*9.0)),18.0);
    vec3 low=uPattern<.5?vec3(.09,.17,.17):uPattern<1.5?vec3(.19,.07,.10):vec3(.035,.16,.25);
    vec3 high=uPattern<.5?vec3(.81,.58,.23):uPattern<1.5?vec3(.86,.36,.22):vec3(.25,.69,.72);
    color=mix(low,high,.22+lines*.55)+points*vec3(.4,.35,.2);
    color*=mix(.48,1.0,uDaylight);
  }
  if (uCaptionOn > .5) {
    float height = min(.22,uAspect * .94 / 5.333);
    float width = height * 5.333 / uAspect;
    if (uv.y > uCaptionOffset && uv.y < uCaptionOffset+height && uv.x > .03 && uv.x < .03+width) {
      vec4 label = texture2D(uCaption,vec2((uv.x-.03)/width,(uv.y-uCaptionOffset)/height));
      color = mix(color,label.rgb,label.a*.94);
    }
  }
  gl_FragColor = vec4(color * max(.25,uStrength),alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function collectionKey(surface) {
  if (surface.kind === 'arched-vitrine') return 'tverVitrines';
  if (surface.interactiveId && SOURCE_MEDIA[surface.interactiveId]) return surface.interactiveId;
  if (SOURCE_MEDIA[surface.zoneId]) return surface.zoneId;
  return surface.zoneId === 'nizhny-novgorod' ? 'nizhny' : 'tver';
}

function modeFor(surface) {
  const id = surface.interactiveId || '';
  if (surface.kind === 'hanging-cloth' || surface.kind === 'tver-curved') return 1;
  if (id === 'scroll') return 2;
  if (id === 'well') return 3;
  if (id === 'ornament' || id === 'yarn' || id === 'bobbins') return 4;
  if (id === 'map') return 5;
  if (id === 'finale') return surface.kind === 'video-sphere' ? 7 : 6;
  return 0;
}

function captionTexture(renderer) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 192;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return {canvas, context:canvas.getContext('2d'), texture};
}

function writeCaption(label, title, subtitle = '') {
  const ctx = label.context;
  ctx.clearRect(0,0,1024,192);
  ctx.fillStyle = 'rgba(13,28,26,.91)'; ctx.fillRect(0,0,1024,192);
  ctx.fillStyle = '#dcb66f'; ctx.fillRect(38,31,5,128);
  ctx.font = '600 49px Georgia,serif'; ctx.fillStyle = '#f7f0dc';
  ctx.fillText(String(title || ''),66,85,914);
  ctx.font = '28px Arial,sans-serif'; ctx.fillStyle = '#d3d9ca';
  ctx.fillText(String(subtitle || ''),66,137,914);
  label.texture.needsUpdate = true;
}

function makeMapTexture(renderer) {
  const canvas = document.createElement('canvas'); canvas.width=2048;canvas.height=1024;
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  const ctx=canvas.getContext('2d');
  const cities=[
    ['Сергиев Посад',.13,.66],['Переславль',.26,.39],['Ростов',.40,.24],
    ['Ярославль',.56,.20],['Кострома',.75,.25],['Иваново',.78,.55],
    ['Суздаль',.60,.68],['Владимир',.45,.78],['Тверь',.12,.23],['Нижний Новгород',.89,.82]
  ];
  const draw=layer=>{
    ctx.fillStyle='#102b2e';ctx.fillRect(0,0,2048,1024);
    const grad=ctx.createRadialGradient(1024,500,100,1024,500,1000);
    grad.addColorStop(0,'#28524d');grad.addColorStop(1,'#11292e');ctx.fillStyle=grad;ctx.fillRect(0,0,2048,1024);
    ctx.strokeStyle=({rivers:'#79d8dd',nature:'#9dcc8b',trade:'#e8b16b',architecture:'#e0d9be'})[layer]||'#bd9a5e';ctx.lineWidth=layer==='trade'?10:6;
    ctx.beginPath();
    cities.slice(0,8).forEach((p,i)=>i?ctx.lineTo(p[1]*2048,p[2]*900):ctx.moveTo(p[1]*2048,p[2]*900));ctx.closePath();ctx.stroke();
    if(layer==='rivers'){ctx.strokeStyle='#68c5d1';ctx.lineWidth=16;ctx.beginPath();ctx.moveTo(170,130);ctx.bezierCurveTo(600,450,900,50,1500,250);ctx.bezierCurveTo(1800,350,1300,700,1950,830);ctx.stroke();}
    cities.forEach(([name,x,y],i)=>{
      x*=2048;y*=900;ctx.beginPath();ctx.arc(x,y,layer==='crafts'?18:11,0,Math.PI*2);
      ctx.fillStyle=layer==='crafts'?['#e6ba69','#cd8362','#a5c1a0'][i%3]:'#f2dfb2';ctx.fill();
      ctx.font='36px Georgia,serif';ctx.textAlign=x>1600?'right':'left';ctx.fillStyle='#f8efdb';
      ctx.fillText(name,x+(x>1600?-24:24),y-22,390);
      if(layer==='architecture') {
        ctx.strokeStyle='#e4d7b9';ctx.lineWidth=3;ctx.strokeRect(x-12,y+22,24,28);
        ctx.beginPath();ctx.moveTo(x-18,y+22);ctx.lineTo(x,y+8);ctx.lineTo(x+18,y+22);ctx.stroke();
      } else if(layer==='nature') {
        ctx.fillStyle='#83ad78';ctx.beginPath();ctx.ellipse(x-22,y+32,12,23,-.5,0,Math.PI*2);ctx.fill();
      } else if(layer==='trade') {
        ctx.strokeStyle='#e6bf78';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y+35,13,0,Math.PI*2);ctx.stroke();
      }
    });
    ctx.textAlign='left';ctx.font='44px Georgia,serif';ctx.fillStyle='#f2dfb2';ctx.fillText('Золотое кольцо',90,960);
    ctx.font='27px Arial,sans-serif';ctx.fillStyle='#b6c6bb';
    ctx.fillText(({cities:'Города и связи',rivers:'Речные пути',crafts:'Города ремёсел',nature:'Природа и путешествие',trade:'Торговые пути',architecture:'Архитектура городов'})[layer]+' · схема маршрута',560,958);
    texture.needsUpdate=true;
  };
  draw('cities'); return {texture,draw,aspect:2};
}

/** Content is applied only to faces exported from verified original objects. */
export async function installSourceDisplays({surfaces,renderer,clock}) {
  const loader=new THREE.TextureLoader(), cache=new Map(), resolved=new Map(), materials=[], labels=[];
  const records=[], stateById=new Map(); let mapTexture=null;
  const loadTexture=src=>{
    if (!cache.has(src)) cache.set(src,loader.loadAsync(src).then(texture=>{
      texture.colorSpace=THREE.SRGBColorSpace;
      texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
      resolved.set(src,texture);
      return texture;
    }));
    return cache.get(src);
  };
  const resolveSlides=key=>{
    const collection=SOURCE_MEDIA[key];
    const slides=Array.isArray(collection)?collection:collection?.slides||[];
    if(key==='workshops')return [...slides,...SOURCE_GLASS_STEPS];
    if(key==='finale')return Object.entries(SOURCE_FINALE_CITIES).flatMap(([city,data])=>data.slides.map(slide=>({...slide,city,cityTitle:data.title})));
    return slides;
  };
  // Load the complete declared collection once. Missing media is a visible load
  // failure, never an unnoticed empty plane.
  const relevantKeys=new Set(surfaces.map(collectionKey));
  for(const key of relevantKeys) {
    if(key==='map')continue;
    const slides=resolveSlides(key);
    if(!slides.length)throw new Error('No source content collection: '+key);
    await Promise.all(slides.filter(s=>s.src).map(s=>loadTexture(s.src)));
  }
  for (const surface of surfaces) {
    const key=collectionKey(surface), data=SOURCE_MEDIA[key]||{};
    const slides=resolveSlides(key), ordinal=surface.ordinal||0;
    const first=slides[ordinal%Math.max(1,slides.length)], second=slides[(ordinal+1)%Math.max(1,slides.length)];
    let image, next, imageAspect, nextAspect;
    if(surface.interactiveId==='map') {
      mapTexture ||= makeMapTexture(renderer);
      image=next=mapTexture.texture; imageAspect=nextAspect=2;
    } else {
      image=await loadTexture(first.src);next=await loadTexture(second.src);
      imageAspect=image.image.width/image.image.height;nextAspect=next.image.width/next.image.height;
    }
    const caption=captionTexture(renderer);labels.push(caption);
    writeCaption(caption,first?.title||data.title,first?.caption||'');
    const crop=first?.contentCrop||[0,0,1,1],nextCrop=second?.contentCrop||[0,0,1,1];
    imageAspect*=crop[2]/crop[3];nextAspect*=nextCrop[2]/nextCrop[3];
    const mode=modeFor(surface);
    const isOriginalCollage=surface.zoneId==='history';
    const material=new THREE.ShaderMaterial({
      name:'SourceContent_'+surface.id,vertexShader:VERTEX,fragmentShader:FRAGMENT,
      side:THREE.DoubleSide,transparent:mode===1,depthWrite:mode!==1,toneMapped:false,
      uniforms:{
        uImage:{value:image},uNext:{value:next},uThird:{value:resolved.get(slides[(ordinal+2)%Math.max(1,slides.length)]?.src)||image},uCaption:{value:caption.texture},
        uTiles:{value:surface.kind==='history-ribbon'?Math.max(1,Math.round(surface.aspect/3)):surface.kind==='panorama'?3:1},
        uCaptionOffset:{value:surface.kind==='textile-panel'||surface.kind==='arched-vitrine'?.16:0},
        uCrop:{value:new THREE.Vector4(...crop)},uNextCrop:{value:new THREE.Vector4(...nextCrop)},
        uThirdCrop:{value:new THREE.Vector4(0,0,1,1)},uThirdFocal:{value:new THREE.Vector2(.5,.5)},uThirdAspect:{value:3},
        uFocal:{value:new THREE.Vector2(first?.focal?.[0]??.5,1-(first?.focal?.[1]??.5))},
        uNextFocal:{value:new THREE.Vector2(second?.focal?.[0]??.5,1-(second?.focal?.[1]??.5))},
        uFit:{value:first?.objectFit==='contain'||surface.zoneId==='history'||surface.zoneId==='workshops'||surface.interactiveId==='map'?1:0},uSteam:{value:0},uLace:{value:first?.lace??.45},
        uAspect:{value:Math.max(.1,surface.aspect||1)},uImageAspect:{value:imageAspect},uNextAspect:{value:nextAspect},
        uClock:clock,uSeed:{value:ordinal},uMode:{value:mode},uFlip:{value:surface.UVorientation==='v-down'?1:0},
        uProgress:{value:surface.interactiveId==='bobbins'||surface.interactiveId==='yarn'?1:0},uPhase:{value:0},uStrength:{value:1},uPattern:{value:0},uDaylight:{value:.82},
        uCaptionOn:{value:mode===1||mode===3||mode===5||isOriginalCollage||surface.kind==='video-sphere'?0:1},
        uAuto:{value:!surface.interactiveId&&surface.zoneId==='stage'?1:0}
      }
    });
    // A small depth bias belongs to the verified surface itself, not an overlay
    // rectangle that could project beyond an arch or through a wall.
    material.polygonOffset=true;material.polygonOffsetFactor=-.1;material.polygonOffsetUnits=-.1;
    materials.push(material);surface.mesh.material=material;surface.mesh.castShadow=false;
    surface.mesh.userData.sourceDisplayId=surface.id;
    records.push({surface,key,slides,caption,material,slideIndex:ordinal%Math.max(1,slides.length),selection:null});
  }
  function assignSlide(record,index,title,subtitle) {
    const {slides,material,caption}=record;if(!slides.length)return;
    index=((index%slides.length)+slides.length)%slides.length;
    const slide=slides[index];
    const selection=index+'|'+(title||'')+'|'+(subtitle||'');
    if(record.selection===selection)return;
    record.selection=selection;record.slideIndex=index;
    const texture=resolved.get(slide.src);
    if(!texture)throw new Error('Media was not preloaded: '+slide.src);
    const crop=slide.contentCrop||[0,0,1,1];
    material.uniforms.uImage.value=texture;material.uniforms.uImageAspect.value=texture.image.width*crop[2]/(texture.image.height*crop[3]);
    material.uniforms.uCrop.value.fromArray(crop);
    material.uniforms.uFocal.value.set(slide.focal?.[0]??.5,1-(slide.focal?.[1]??.5));
    material.uniforms.uFit.value=slide.objectFit==='contain'||record.surface.zoneId==='history'||record.surface.zoneId==='workshops'?1:0;
    record.currentTitle=title||slide.title;record.currentSrc=slide.src;
    writeCaption(caption,record.currentTitle,subtitle===undefined?slide.caption||'':subtitle);
  }
  function setDisplayState(id,state={}) {
    stateById.set(id,{...state});
    for(const record of records) {
      if(record.surface.interactiveId!==id)continue;
      const u=record.material.uniforms;
      if(Number.isFinite(state.progress))u.uProgress.value=state.progress;
      if(Number.isFinite(state.phase))u.uPhase.value=state.phase;
      if(Number.isFinite(state.steam))u.uSteam.value=state.steam;
      if(Number.isFinite(state.angle))u.uPhase.value=state.angle;
      if(Number.isFinite(state.brightness))u.uStrength.value=.55+.65*state.brightness;
      if(Number.isFinite(state.daylight))u.uDaylight.value=state.daylight;
      if(id==='scroll')assignSlide(record,Number.isFinite(state.chapter)?state.chapter:Math.min(record.slides.length-1,Math.floor((state.progress||0)*record.slides.length)));
      if(id==='well') {
        const index=record.slides.findIndex(slide=>slide.theme===state.theme||slide.id===state.theme);
        const themeIndex=index>=0?index:({kalyazin:0,kashin:1,'three-seas':2})[state.theme]||0;
        assignSlide(record,themeIndex);u.uPattern.value=themeIndex;
      }
      if(id==='ornament') {
        u.uPattern.value=typeof state.pattern==='number'?state.pattern:({diamond:0,flower:1,wave:2})[state.pattern]||0;
        if(Number.isFinite(state.stitchQuality))u.uStrength.value=.7+.3*state.stitchQuality;
      }
      if(id==='bobbins') {
        const index=({filigree:0,capital:1,salt:2})[state.theme]||0;
        assignSlide(record,index);u.uPattern.value=index;
      }
      if(id==='finale') {
        const indices=record.slides.map((slide,index)=>slide.city===state.city?index:-1).filter(index=>index>=0);
        const variant=state.interest==='architecture'?0:1;
        const index=indices[Math.min(variant,indices.length-1)]??0;
        const city=SOURCE_FINALE_CITIES[state.city]?.title||'Золотое кольцо';
        const interest=({architecture:'архитектура',crafts:'ремёсла',rivers:'реки'})[state.interest||'architecture'];
        assignSlide(record,index,city+' · '+interest,record.slides[index].title);
        u.uPattern.value=({architecture:0,crafts:1,rivers:2})[state.interest]||0;
        u.uSeed.value=Object.keys(SOURCE_FINALE_CITIES).indexOf(state.city);
        if(record.surface.kind==='panorama') {
          const route=state.route||[state.city,state.city,state.city];
          for(let slot=0;slot<3;slot++) {
            const choices=record.slides.map((slide,i)=>slide.city===(route[slot]||state.city)?i:-1).filter(i=>i>=0);
            const chosen=record.slides[choices[Math.min(variant,choices.length-1)]??index];
            const texture=resolved.get(chosen.src),crop=chosen.contentCrop||[0,0,1,1];
            const prefix=slot===0?'uImage':slot===1?'uNext':'uThird';
            u[prefix].value=texture;
            u[slot===0?'uImageAspect':slot===1?'uNextAspect':'uThirdAspect'].value=texture.image.width*crop[2]/(texture.image.height*crop[3]);
            u[slot===0?'uCrop':slot===1?'uNextCrop':'uThirdCrop'].value.fromArray(crop);
            u[slot===0?'uFocal':slot===1?'uNextFocal':'uThirdFocal'].value.set(chosen.focal?.[0]??.5,1-(chosen.focal?.[1]??.5));
          }
          u.uFit.value=1;
          writeCaption(record.caption,route.map(city=>SOURCE_FINALE_CITIES[city]?.title||city).join(' → '),'Путешествие · '+interest);
        }
      }
      if(id==='boats') {
        const index=Math.min(record.slides.length-1,Math.floor((state.progress||0)*record.slides.length));
        assignSlide(record,index);
        // The source truss remains still; the river narrative moves across its
        // actual media planes as the selected chapter advances.
        u.uFocal.value.x=.45+.1*(state.progress||0);
      }
      if(id==='map'&&state.layer&&mapTexture) {
        if(record.selection!==state.layer){mapTexture.draw(state.layer);record.selection=state.layer;}
      }
      if(id==='workshops'&&state.craft) {
        const baseIndex=(record.surface.ordinal||0)%SOURCE_MEDIA.workshops.slides.length;
        const own=record.slides[baseIndex];
        const selected=own?.craft===state.craft||own?.craftId===state.craft||own?.id===state.craft;
        u.uStrength.value=selected?1.12:.82;
        if((own?.craftId||own?.id)==='glass'&&state.craft==='glass')assignSlide(record,SOURCE_MEDIA.workshops.slides.length+Math.max(0,Math.min(3,state.step||0)));
        else assignSlide(record,baseIndex);
      }
    }
  }
  return {
    setDisplayState,meshes:records.map(r=>r.surface.mesh),
    snapshot:()=>({count:records.length,collections:[...relevantKeys],textures:cache.size,
      surfaces:records.map(r=>({id:r.surface.id,zoneId:r.surface.zoneId,interactiveId:r.surface.interactiveId||null,
        kind:r.surface.kind,sourceObject:r.surface.sourceObject,craftId:r.surface.zoneId==='workshops'?SOURCE_MEDIA.workshops.slides[(r.surface.ordinal||0)%8]?.craftId:null,title:r.currentTitle||r.slides[r.slideIndex]?.title||SOURCE_MEDIA[r.key]?.title,
        src:r.currentSrc||r.slides[r.slideIndex]?.src||null,aspect:r.surface.aspect,orientation:r.surface.UVorientation})),
      states:Object.fromEntries(stateById)}),
    dispose(){for(const material of materials)material.dispose();for(const label of labels)label.texture.dispose();
      for(const promise of cache.values())promise.then(texture=>texture.dispose());mapTexture?.texture.dispose();}
  };
}
