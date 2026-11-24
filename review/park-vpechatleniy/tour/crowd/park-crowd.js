import { clone as cloneSkeleton } from '/golden-ring/interactives/vendor/three-0.180/SkeletonUtils.js';
import { ParkWorld, CrowdSimulation } from './engine/index.js?v=social-20261124';
import { createAvatarFactory } from './avatars/crowd_factory.js?v=social-20261124';
import { createCrowdRenderer } from './avatars/crowd-renderer.js?v=social-20261124';
import { createElevatorVisuals } from './elevator_visuals.js';
import { createCapacityLink } from './capacity.js';
import { normalizeFixedObstacles } from './dynamic-obstacles.js?v=park-social-compact-20261124';
import { createSocialExhibitTargets, SOCIAL_EXHIBIT_VERSION } from './social-exhibits.js?v=social-20261124';

const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
const getJSON = async url => { const r=await fetch(url);if(!r.ok)throw new Error(r.status+': '+url);return r.json(); };
const formatCount = value => Math.round(value).toLocaleString('ru-RU');

/** One measured world and one renderer; population and layout can change live. */
export async function startParkCrowd({THREE,scene,model,loader,camera,controls,registerMaterial,setSection,setCamera,requestRender,exhibitObstacles,fixedObstacles,onWorldReady}) {
  const $=id=>document.getElementById(id),panel=$('crowd-panel'),countInput=$('crowd-count'),quantityRange=$('crowd-quantity-range');
  const diagnostics=window.__parkCrowd={state:'loading',count:0,requested:100,maxCount:0,errors:[],version:'2026-11-24.social'};
  let paused=false,speed=1,follow=null,lastUI=-Infinity,disposed=false,routeVisible=false;
  let factory,crowdRenderer,capacityLink,elevatorVisuals,socialController,socialTargets,group,handles=new Map(),api;
  let targetCount=100,capacity=null,capacityInvalid=false,populationResult=null,populationLimited=false,nextSpawnRetry=0;
  let routeLines,routeMaterial,lastRoutes=-Infinity,selectionIndex=0;
  const setStatus=text=>{$('crowd-status').textContent=text;};
  const pendingAppearances=new Map();
  function renderCountControls() {
    if(!capacity)return;
    const maximum=capacity.limit;
    countInput.max=quantityRange.max=String(maximum);
    if(document.activeElement!==countInput)countInput.value=String(targetCount);
    quantityRange.value=String(targetCount);
    $('crowd-limit').textContent='По расчёту: '+formatCount(maximum);
    $('crowd-limit').title='Одновременная нагрузка из текущего сценария расчёта. Измените поток или время визита в калькуляторе.';
    const ready=diagnostics.state==='ready';
    countInput.disabled=quantityRange.disabled=!ready;
    $('crowd-minus').disabled=!ready||targetCount===0;
    $('crowd-plus').disabled=!ready||targetCount>=maximum;
    $('crowd-max').disabled=!ready||targetCount===maximum;
    diagnostics.requested=targetCount;diagnostics.maxCount=maximum;
  }
  try {
    capacityLink=createCapacityLink({
      onChange:value=>{
        capacity=value;capacityInvalid=false;targetCount=Math.min(targetCount,value.limit);
        populationLimited=false;nextSpawnRetry=0;renderCountControls();lastUI=-Infinity;
        if(api)api.refreshPopulation();requestRender();
      },
      onInvalid:()=>{capacityInvalid=true;lastUI=-Infinity;requestRender();},
    });
    const [definition,manifest]=await Promise.all([
      getJSON(new URL('./data/park-world.json',import.meta.url)),getJSON(new URL('./avatars/avatar_manifest.json',import.meta.url)),
    ]);
    // Start with the measured fixed bodies only. updateObstacles retains them
    // and validates/commits the current exhibit subset exactly once, before
    // admitting anyone; supplying the full list would duplicate fixed IDs.
    const authored=definition.staticObstacleProxies||[];
    const currentExhibits=typeof exhibitObstacles==='function'?exhibitObstacles():authored.filter(proxy=>proxy.kind==='exhibit');
    if(!Array.isArray(currentExhibits))throw new TypeError('Расстановка должна вернуть список препятствий экспонатов.');
    const fixed=normalizeFixedObstacles(typeof fixedObstacles==='function'?fixedObstacles():authored.filter(proxy=>proxy.kind!=='exhibit'));
    const startupDefinition={...definition,staticObstacleProxies:fixed};
    const world=new ParkWorld(startupDefinition,{pathCacheSize:20000});
    const sim=new CrowdSimulation(world,{fixedStep:1/30,maxFrameDelta:.12,maxSubSteps:4,maxRoutePlansPerStep:24,maxEvents:3000,defaultRadius:.51,defaultHeight:2.17});
    const checked=sim.updateObstacles(currentExhibits,{expectedRevision:world.revision});
    diagnostics.obstacles={fixed:fixed.length,exhibits:currentExhibits.length,revision:checked.revision,
      fixedKinds:fixed.reduce((counts,proxy)=>(counts[proxy.kind]=(counts[proxy.kind]||0)+1,counts),{}),validation:checked};
    if(!checked.ok){
      const details=(checked.conflicts||[]).slice(0,3).map(conflict=>conflict.message||[conflict.obstacleId,conflict.transitionId].filter(Boolean).join(' / ')).filter(Boolean).join('; ');
      throw new Error('Расстановка не прошла проверку: '+checked.reason+(details?' — '+details:''));
    }
    // The editor restores its saved layout through the live guard while the
    // world is still empty. No visitor can spawn against a stale arrangement.
    await onWorldReady?.(sim);
    socialController=sim.enableSocial({seed:20261124});
    socialTargets=createSocialExhibitTargets({simulation:sim,onChange:()=>{lastUI=-Infinity;requestRender();}});
    socialTargets.sync();
    function socialSnapshot(options){
      const state=socialController.snapshot(options);
      return {...state,version:'2026-11-24.social',targetVersion:SOCIAL_EXHIBIT_VERSION,
        photographers:state.phaseCounts.photo||0,targets:socialTargets.getState()};
    }
    Object.defineProperty(diagnostics,'social',{enumerable:true,get:()=>socialSnapshot()});
    elevatorVisuals=await createElevatorVisuals({THREE,loader,scene,model,definitions:definition.elevators,registerMaterial});
    factory=createAvatarFactory({THREE,loader,cloneSkeleton,manifest,assetBaseUrl:new URL('./avatars/',import.meta.url).href});
    setStatus('Загружаем людей и одежду…');
    await factory.preload(undefined,{concurrency:3,onProgress:({complete,total})=>{
      setStatus('Подготовка людей · '+complete+' / '+total);
      panel.style.setProperty('--crowd-load',Math.round(complete/total*100)+'%');requestRender();
    }});
    crowdRenderer=createCrowdRenderer({THREE,scene,camera,factory,registerMaterial,capacity:Math.max(100,Math.min(capacity.limit,2200)),
      maxDetailed:64,maxResidentDetailed:80,detailedDistance:24,
      activityFor:agent=>{
        if(agent.activity==='elevator_ride')return 'idle';
        if(['gather','look','photo','pose','phone'].includes(agent.social?.phase)&&agent.speed<.08)return 'idle';
        if(agent.speed>.03)return 'walk';
        if(agent.activity==='idle'&&agent.ordinal%11===0&&Math.sin(sim.time*.45+agent.ordinal)>.7)return 'wave';
        return 'idle';
      },
    });
    group=crowdRenderer.group;handles=crowdRenderer.handles;
    const bases=manifest.bases;
    const authoredSpawns=definition.visitors.map(visitor=>({floorId:visitor.floorId,position:visitor.position}));
    const spawnKey=(floorId,position)=>floorId+'|'+[position.x??position[0],position.z??position[2]].map(value=>value.toFixed(5)).join('|');
    const templateAtSpawn=new Map(definition.visitors.map(visitor=>[spawnKey(visitor.floorId,visitor.position),visitor]));
    let spawningAuthored=false;
    function makeAgent({id,index,floorId,position,defaultItinerary}) {
      const appearance={baseId:bases[index%bases.length].id,variantIndex:Math.floor(index/bases.length),seed:20261124+Math.floor(index/100)};
      const description=crowdRenderer.describe(appearance),template=spawningAuthored?templateAtSpawn.get(spawnKey(floorId,position)):null;
      pendingAppearances.set(id,appearance);
      // Keep authored inter-floor routes for the first hundred. Additional people
      // receive independent reachable walking goals, not 400 shared waiting slots.
      const itinerary=template?.itinerary?.length?template.itinerary:defaultItinerary;
      return {
        id,floorId,position,strideMeters:description.strideMeters,radius:description.radius,height:description.height,
        maxSpeed:template?.maxSpeed,seed:20261124+index,phaseOffset:template?.phaseOffset,
        itinerary,dwellSeconds:template?.dwellSeconds||[1,4],allowedTransitions:['stairs','elevator'],
      };
    }
    function reconcilePopulation(force=false) {
      socialTargets.sync();
      if(sim.order.length===targetCount)return false;
      const now=performance.now();
      if(!force&&populationLimited&&now<nextSpawnRetry)return false;
      pendingAppearances.clear();
      const options={maxChanges:32,radius:.51,height:2.17,makeAgent};
      let result;
      if(sim.order.length<Math.min(100,targetCount)){
        spawningAuthored=true;
        result=sim.setPopulation(Math.min(100,targetCount),{...options,spawnCandidates:authoredSpawns});
        spawningAuthored=false;
        const remaining=32-result.added.length;
        if(remaining>0&&sim.order.length<targetCount){
          const rest=sim.setPopulation(targetCount,{...options,maxChanges:remaining});
          result={...rest,added:[...result.added,...rest.added],removed:[...result.removed,...rest.removed]};
        }else result={...result,target:targetCount,complete:sim.order.length===targetCount};
      }else result=sim.setPopulation(targetCount,options);
      for(const id of result.removed){crowdRenderer.remove(id);if(follow?.id===id)follow=null;}
      for(const agent of result.added)crowdRenderer.add(agent.id,pendingAppearances.get(agent.id));
      pendingAppearances.clear();
      populationResult=result;populationLimited=result.capacityLimited;
      if(populationLimited)nextSpawnRetry=now+1000;
      diagnostics.population={target:targetCount,count:result.count,complete:result.complete,capacityLimited:result.capacityLimited,reason:result.reason,candidateCount:result.candidateCount};
      lastUI=-Infinity;
      return Boolean(result.added.length||result.removed.length);
    }
    while(sim.order.length<targetCount){
      reconcilePopulation(true);
      $('crowd-population').textContent='В зале '+formatCount(sim.order.length)+' из '+formatCount(targetCount);
      requestRender();await nextFrame();
      if(populationLimited)break;
    }
    routeMaterial=new THREE.LineBasicMaterial({color:0x66dcc1,transparent:true,opacity:.75,depthWrite:false});registerMaterial(routeMaterial);
    routeLines=new THREE.LineSegments(new THREE.BufferGeometry(),routeMaterial);routeLines.visible=false;routeLines.frustumCulled=false;routeLines.name='Visitor routes';scene.add(routeLines);
    function updateRoutes(){
      const vertices=[];
      for(const a of sim.order){
        for(const segment of a.route?.segments.slice(a.routeIndex)||[]){
          const points=segment.points||world.stairs.get(segment.id)?.path.points;if(!points)continue;
          for(let i=1;i<points.length;i++){const p=points[i-1],q=points[i];vertices.push(p.x,p.y+.045,p.z,q.x,q.y+.045,q.z);}
        }
      }
      routeLines.geometry.dispose();routeLines.geometry=new THREE.BufferGeometry();routeLines.geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));lastRoutes=sim.time;
    }
    const vector=p=>new THREE.Vector3(p.x??p[0],p.y??p[1],p.z??p[2]);
    function focus(kind,{instant=false}={}){
      follow=null;
      if(kind==='people'){
        setSection(10.0,true);setCamera(new THREE.Vector3(35,14.2,29),new THREE.Vector3(11,8.25,7),'Среди посетителей',instant);
      }else if(kind==='upper'){
        setSection(16.0,true);setCamera(new THREE.Vector3(10,24,24),new THREE.Vector3(-6,14.3,4),'Антресоль',instant);
      }else if(kind==='visitor'){
        const available=sim.order.filter(a=>a.speed>.1&&a.floorId==='main');
        const a=available[(selectionIndex++)%Math.max(available.length,1)]||sim.order[0];
        if(!a){setStatus('Сначала добавьте посетителей.');return false;}
        const target=vector(a.position).add(new THREE.Vector3(0,1.1,0));const offset=new THREE.Vector3(4.5,2.3,5.5);
        setSection(a.position.y+2.7,true);setCamera(target.clone().add(offset),target,'За посетителем',instant);follow={kind:'visitor',id:a.id,offset};
      }else if(kind==='stairs'){
        const a=sim.order.find(a=>a.activity==='stairs');const stair=world.stairs.get(a?.transit?.transitionId||'stairs_4');
        const foot=a?vector(a.position):vector(stair.path.points[12]),target=foot.clone().add(new THREE.Vector3(0,1.05,0));
        const offset=new THREE.Vector3(0,2.1,4.2);setSection(foot.y+2.1,true);setCamera(target.clone().add(offset),target,'Лестницы между этажами',instant);
        follow={kind:'stairs',id:a?.id,offset};
      }else if(kind==='elevators'){
        const moving=[...sim.elevators.values()].find(e=>e.passengers.size&&Math.abs(e.definition.shaft.x-10)<18&&Math.abs(e.definition.shaft.z)<35);
        const lift=moving||sim.elevators.get('lift-20-11')||[...sim.elevators.values()][0];
        const e=lift.definition,n=vector(e.outward),side=new THREE.Vector3(-n.z,0,n.x),offset=n.multiplyScalar(4).add(side.multiplyScalar(2)).add(new THREE.Vector3(0,8,0));
        const target=new THREE.Vector3(e.shaft.x,lift.carY+1,e.shaft.z);setSection(lift.carY+2.2,true);setCamera(target.clone().add(offset),target,e.name,instant);follow={kind:'elevators',id:e.id,offset};
      }
      requestRender();
    }
    function updateFollow(dt){
      if(!follow)return;
      let target,y;
      if(follow.kind==='elevators'){
        const e=sim.elevators.get(follow.id);if(!e)return;target=new THREE.Vector3(e.definition.shaft.x,e.carY+1,e.definition.shaft.z);y=e.carY;
      }else{
        let a=sim.agents.get(follow.id);
        if(follow.kind==='stairs'&&(!a||a.activity!=='stairs')){a=sim.order.find(a=>a.activity==='stairs');if(a)follow.id=a.id;}
        if(!a){follow=null;return;}target=vector(a.position).add(new THREE.Vector3(0,1.05,0));y=a.position.y;
      }
      const t=1-Math.exp(-Math.max(dt,.016)*5);camera.position.lerp(target.clone().add(follow.offset),t);controls.target.lerp(target,t);
      setSection(y+(follow.kind==='stairs'?2.1:follow.kind==='elevators'?2.2:2.6),true);requestRender();
    }
    function status(){
      const counts={main:0,upper:0,moving:0,stairs:0,elevator:0,waiting:0};
      for(const a of sim.order){if(a.floorId==='main')counts.main++;else if(a.floorId==='upper')counts.upper++;if(a.speed>.03)counts.moving++;if(a.activity==='stairs')counts.stairs++;if(a.activity.startsWith('elevator_'))counts.elevator++;if(a.activity.endsWith('_wait')||a.activity.endsWith('_queue'))counts.waiting++;}
      const social=socialSnapshot();
      renderCountControls();
      if ($('crowd-compact-count')) $('crowd-compact-count').textContent = formatCount(sim.order.length);
      $('crowd-floors').textContent='Основной этаж '+formatCount(counts.main)+' · антресоль '+formatCount(counts.upper);
      panel.dataset.population=populationLimited?'limited':sim.order.length===targetCount?'complete':'changing';
      $('crowd-population').textContent=populationLimited
        ? 'Свободные места: '+formatCount(sim.order.length)+' из '+formatCount(targetCount)+'. Добавляем по мере освобождения.'
        : sim.order.length!==targetCount
          ? (sim.order.length<targetCount?'Добавляем: ':'Уменьшаем: ')+formatCount(sim.order.length)+' → '+formatCount(targetCount)
          : 'В зале '+formatCount(sim.order.length)+' человек';
      setStatus(capacityInvalid?'В калькуляторе есть ошибка — действует последний корректный расчёт.'
        :paused?'Движение приостановлено':sim.order.length===0?'Добавьте людей кнопкой «+» или ползунком.'
          :'Пары '+formatCount(social.pair)+' · группы '+formatCount(social.group)+' · снимают '+formatCount(social.photographers));
      $('crowd-status').title=formatCount(counts.moving)+' в движении; '+formatCount(counts.stairs+counts.elevator)
        +' между этажами. Завершено осмотров: '+formatCount(social.completedVisits)+'; фотографий: '+formatCount(social.photos)+'.';
      Object.assign(diagnostics,{count:sim.order.length,counts,time:sim.time,paused,speed,loadedBases:factory.stats.loadedBases,
        capacity:{limit:capacity.limit,source:capacity.source,occupancy:capacity.occupancy,valid:!capacityInvalid},metrics:{...sim.metrics}});
      lastUI=performance.now();return counts;
    }
    function setCount(value){
      const number=typeof value==='string'&&value.trim()===''?NaN:Number(value);
      if(!Number.isFinite(number)){countInput.setCustomValidity('Введите число посетителей.');countInput.reportValidity();return {ok:false,reason:'invalid_count'};}
      countInput.setCustomValidity('');
      targetCount=Math.max(0,Math.min(capacity.limit,Math.round(number)));
      countInput.value=String(targetCount);quantityRange.value=String(targetCount);
      populationLimited=false;nextSpawnRetry=0;lastUI=-Infinity;
      renderCountControls();requestRender();
      return {ok:true,target:targetCount,count:sim.order.length,maxCount:capacity.limit};
    }
    api={
      world,simulation:sim,handles,factory,renderer:crowdRenderer,focus,socialTargets,socialSnapshot,
      objects:{group,elevators:elevatorVisuals.objects},
      get count(){return sim.order.length;},get target(){return targetCount;},get maxCount(){return capacity.limit;},
      setCount,refreshPopulation(){nextSpawnRetry=0;populationLimited=false;lastUI=-Infinity;requestRender();},
      setPaused(value){paused=Boolean(value);$('crowd-pause').textContent=paused?'Продолжить':'Пауза';$('crowd-pause').setAttribute('aria-pressed',String(paused));status();requestRender();},
      setSpeed(value){speed=Math.max(.25,Math.min(4,Number(value)||1));$('crowd-speed').value=String(speed);status();},
      releaseCamera(){follow=null;},
      setRoutes(value){routeVisible=Boolean(value);routeLines.visible=routeVisible;$('crowd-routes').setAttribute('aria-pressed',String(routeVisible));if(routeVisible)updateRoutes();requestRender();},
      snapshot:()=>({...sim.snapshot(),population:{target:targetCount,count:sim.order.length,maximum:capacity.limit},social:socialSnapshot()}),
      update(dt){
        if(disposed)return false;
        // The obstacle adapter commits before this frame. Refresh destinations
        // before admitting more people or advancing any existing social route.
        const targetsChanged=socialTargets.sync();
        const populationChanged=reconcilePopulation();
        const delta=paused?0:Math.min(.1,Math.max(0,dt))*speed;
        const result=sim.update(delta);updateFollow(dt);
        const shadowMaterial=crowdRenderer.objects.shadows.material;
        const sectionPlane=shadowMaterial.clippingPlanes?.find(plane=>plane.normal.y<-.9999);
        const sectionHeight=sectionPlane?sectionPlane.constant/-sectionPlane.normal.y:Infinity;
        crowdRenderer.update(delta,{simulation:sim,interpolationAlpha:result.interpolationAlpha,sectionHeight,focusId:follow?.id});
        elevatorVisuals.update([...sim.elevators.values()].map(e=>e.snapshot()));
        if(routeVisible&&(sim.time-lastRoutes>.8||populationChanged))updateRoutes();
        if(performance.now()-lastUI>350||lastUI===-Infinity)status();
        diagnostics.visibleAvatars=crowdRenderer.stats.visible;diagnostics.renderer={...crowdRenderer.stats};
        return !paused||Boolean(follow)||sim.order.length!==targetCount||populationChanged||targetsChanged;
      },
      dispose(){
        disposed=true;socialTargets?.dispose();socialController?.dispose();capacityLink?.dispose();crowdRenderer?.dispose();factory?.dispose();elevatorVisuals?.dispose();
        routeLines?.removeFromParent();routeLines?.geometry.dispose();routeMaterial?.dispose();
        countInput.onchange=countInput.onkeydown=null;quantityRange.oninput=null;
        for(const id of ['crowd-minus','crowd-plus','crowd-max'])$(id).onclick=null;
      },
    };
    diagnostics.state='ready';diagnostics.snapshot=api.snapshot;diagnostics.api=api;
    diagnostics.source={park:definition.source.sha256,avatars:manifest.sourceCommit,stairs:world.stairs.size,elevators:world.elevators.size};
    $('crowd-pause').onclick=()=>api.setPaused(!paused);$('crowd-speed').onchange=event=>api.setSpeed(event.target.value);
    $('crowd-routes').onclick=()=>api.setRoutes(!routeVisible);
    $('crowd-minus').onclick=()=>api.setCount(targetCount-1);$('crowd-plus').onclick=()=>api.setCount(targetCount+1);
    $('crowd-max').onclick=()=>api.setCount(capacity.limit);
    countInput.onchange=()=>api.setCount(countInput.value);
    countInput.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();api.setCount(countInput.value);countInput.blur();}};
    quantityRange.oninput=()=>api.setCount(quantityRange.value);
    document.querySelectorAll('[data-crowd-view]').forEach(button=>{button.disabled=false;button.onclick=()=>focus(button.dataset.crowdView);});
    $('crowd-pause').disabled=false;$('crowd-routes').disabled=false;$('crowd-speed').disabled=false;
    panel.dataset.state='ready';status();api.update(0);
    window.dispatchEvent(new CustomEvent('park-crowd-ready',{detail:api}));
    return api;
  }catch(error){
    socialTargets?.dispose();socialController?.dispose();capacityLink?.dispose();crowdRenderer?.dispose();factory?.dispose();elevatorVisuals?.dispose();handles.clear();group?.removeFromParent();
    routeLines?.removeFromParent();routeLines?.geometry.dispose();routeMaterial?.dispose();requestRender();
    diagnostics.state='error';diagnostics.errors.push(error.message);panel.dataset.state='error';
    $('crowd-population').textContent='Посетители не запущены';setStatus('Посетители не загрузились. Обновите страницу.');
    console.error('Park crowd:',error);throw error;
  }
}
