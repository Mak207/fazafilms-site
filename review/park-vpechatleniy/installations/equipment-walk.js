export const INSTALLATIONS_WALK_PROTOCOL = 'faza.park.installations-walk.v1';
let nextWalkId=0;

const normalizedScope = value => ({
  regionId:typeof value?.regionId==='string'?value.regionId:null,
  hallId:typeof value?.hallId==='string'?value.hallId:null,
  floorId:value?.floorId==='upper'?'upper':'main'
});

/** A bounded, finite camera snapshot; it is never part of the saved equipment variant. */
export function normalizeWalkView(value) {
  if(value===null)return null;
  const finite=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000;
  if(!value||typeof value!=='object'||Array.isArray(value)||!['main','upper'].includes(value.floorId))return undefined;
  if(![value.x,value.y,value.z].every(finite)||!Array.isArray(value.directionXZ)||value.directionXZ.length!==2||!value.directionXZ.every(finite))return undefined;
  const length=Math.hypot(...value.directionXZ),fov=value.horizontalFovRad;
  if(length<1e-6||typeof fov!=='number'||!Number.isFinite(fov)||fov<=0||fov>=Math.PI)return undefined;
  const range=value.maxDistanceM===undefined?24:value.maxDistanceM;
  if(!Number.isFinite(range)||range<=0||range>100)return undefined;
  const polygon=value.visiblePolygonXZ;
  if(!Array.isArray(polygon)||polygon.length<3||polygon.length>128||polygon.some(p=>!Array.isArray(p)||p.length!==2||!p.every(finite)))return undefined;
  return {x:value.x,y:value.y,z:value.z,floorId:value.floorId,directionXZ:value.directionXZ.map(n=>n/length),horizontalFovRad:fov,maxDistanceM:range,
    visiblePolygonXZ:polygon.map(p=>[...p]),...(typeof value.zoneId==='string'&&/^[a-z0-9-]{1,64}$/i.test(value.zoneId)?{zoneId:value.zoneId}:{})};
}

/** The same iframe stays mounted while the equipment planner updates. */
export function createEquipmentWalk(host,{scope,label='',windowObject=host?.ownerDocument?.defaultView,onStatus=()=>{},
  onSplitChange=()=>{},onMapSuspend=()=>{},onMapResize=()=>{},onWalkView=()=>{},onUndo=()=>{},onRedo=()=>{}}={}) {
  if(!host||!windowObject)throw Error('Не удалось открыть прогулку.');
  const win=windowObject,doc=host.ownerDocument,origin=win.location.origin;
  let currentScope=normalizedScope(scope),sequence=0,visible=false,loaded=false,ready=false,disposed=false,splitVisible=false;
  let viewSequence=-1,viewScopeSequence=-1;
  const listeners=[];
  const listen=(target,type,handler)=>{target.addEventListener(type,handler);listeners.push(()=>target.removeEventListener(type,handler));};
  host.classList.add('ep-walk');host.setAttribute('role','region');host.setAttribute('aria-label','Прогулка по выбранной зоне');
  const mapPanelId=`ep-walk-map-panel-${++nextWalkId}`;
  host.innerHTML=`<div class="ep-walk-heading"><div><h2>Прогулка по зоне</h2><p class="ep-walk-zone"></p></div><div class="ep-walk-actions" data-az-zone="controls"><button type="button" data-walk-split aria-pressed="false" aria-expanded="false" aria-controls="${mapPanelId}">Схема зоны</button><button type="button" data-walk-restart>К началу зоны</button><button type="button" data-walk-fullscreen>На весь экран</button></div></div>
    <div class="ep-walk-stage">
      <div class="ep-walk-viewport"><iframe title="Прогулка по выбранной зоне Парка впечатлений" loading="eager" allow="fullscreen" allowfullscreen referrerpolicy="same-origin"></iframe><p class="ep-walk-loading" role="status">Загружаем прогулку…</p></div>
      <section class="ep-walk-map-panel" id="${mapPanelId}" aria-label="Схема выбранной зоны" hidden>
        <div class="ep-walk-map-heading"><h3>Схема зоны</h3><div class="ep-walk-map-actions" data-az-zone="controls"><button type="button" data-walk-undo aria-label="Отменить последнее изменение" disabled>Отменить</button><button type="button" data-walk-redo aria-label="Повторить последнее изменение" disabled>Повторить</button></div></div>
        <div class="ep-walk-map"></div>
      </section>
    </div>
    <p class="ep-walk-help"><span class="ep-walk-help-desktop">Нажмите на 3D-вид: WASD или стрелки — идти, мышь — оглядеться, E — включить интерактив.</span><span class="ep-walk-help-touch">Оглядывайтесь пальцем, двигайтесь кнопками на экране.</span><span class="ep-walk-split-help" hidden> На схеме «Вы» — ваше положение, сектор — направление и угол обзора. Оборудование можно перетаскивать и поворачивать круглым маркером.</span></p><p class="ep-walk-status" role="status" aria-live="polite"></p>`;
  const frame=host.querySelector('iframe'),zoneLabel=host.querySelector('.ep-walk-zone'),loading=host.querySelector('.ep-walk-loading'),status=host.querySelector('.ep-walk-status');
  const restartButton=host.querySelector('[data-walk-restart]'),fullscreenButton=host.querySelector('[data-walk-fullscreen]');
  const splitButton=host.querySelector('[data-walk-split]'),stage=host.querySelector('.ep-walk-stage'),mapPanel=host.querySelector('.ep-walk-map-panel'),mapHost=host.querySelector('.ep-walk-map'),splitHelp=host.querySelector('.ep-walk-split-help');
  const undoButton=host.querySelector('[data-walk-undo]'),redoButton=host.querySelector('[data-walk-redo]');
  zoneLabel.textContent=label||'Выбранная зона';
  restartButton.disabled=true;
  fullscreenButton.hidden=typeof host.requestFullscreen!=='function';
  const url=new URL('tour/index.html',new URL('./',win.location.href));
  url.searchParams.set('embedded','installations');url.searchParams.set('v','walk-location-20261125');

  function post(kind,payload={}) {
    if(disposed||!loaded||origin==='null')return;
    const sent=++sequence;
    try{frame.contentWindow?.postMessage({protocol:INSTALLATIONS_WALK_PROTOCOL,kind,sequence:sent,...payload},origin);}catch{}
    return sent;
  }
  function sendZone(restart=false){onWalkView(null);viewScopeSequence=post('zone',{scope:{...currentScope},...(restart?{restart:true}:{})})??-1;}
  function sendLayout(){post('layout',{split:splitVisible});}
  function refreshMapLayout(){if(!disposed&&splitVisible&&visible)onMapResize();}
  function setSplitVisible(next){
    if(disposed||splitVisible===Boolean(next))return;
    const nextVisible=Boolean(next);
    if(!nextVisible){onMapSuspend('split-close');onWalkView(null);}
    splitVisible=nextVisible;stage.classList.toggle('is-split',splitVisible);mapPanel.hidden=!splitVisible;splitHelp.hidden=!splitVisible;
    splitButton.setAttribute('aria-pressed',String(splitVisible));splitButton.setAttribute('aria-expanded',String(splitVisible));
    sendLayout();onSplitChange(splitVisible,{mount:mapHost,scope:{...currentScope}});refreshMapLayout();
  }
  function setStatus(text){status.textContent=String(text||'').slice(0,500);onStatus(status.textContent);}
  function setVisible(next){
    if(disposed)return;
    const changed=visible!==Boolean(next);
    if(changed&&!next){onMapSuspend('visibility-hidden');onWalkView(null);}
    visible=Boolean(next);
    if(visible&&!loaded){loaded=true;frame.src=url.href;}
    if(changed||!ready)post('visibility',{visible});
    if(changed&&visible)refreshMapLayout();
  }
  function isVisible(){
    if(doc.visibilityState==='hidden')return false;
    const section=host.closest('#installations');
    return section?!section.closest('[hidden]'):doc.body?.dataset.folder==='installations';
  }
  const refreshVisibility=()=>setVisible(isVisible());
  listen(frame,'load',()=>{if(!loaded)return;viewSequence=-1;post('visibility',{visible});sendLayout();sendZone();});
  listen(frame,'error',()=>{onWalkView(null);loading.hidden=true;setStatus('Не удалось загрузить прогулку. Обновите страницу.');});
  listen(win,'message',event=>{
    if(disposed||event.origin!==origin||event.source!==frame.contentWindow||event.data?.protocol!==INSTALLATIONS_WALK_PROTOCOL)return;
    if(event.data.kind==='ready'){
      ready=true;loading.hidden=true;restartButton.disabled=false;setStatus('');post('visibility',{visible});sendLayout();sendZone();
    }else if(event.data.kind==='view'){
      const message=event.data;
      if(!Number.isSafeInteger(message.sequence)||message.sequence<0||message.sequence<=viewSequence)return;
      if(message.scopeSequence!==viewScopeSequence)return;
      const view=normalizeWalkView(message.view);if(view===undefined)return;
      if(view&&(!ready||!visible||!splitVisible))return;
      viewSequence=message.sequence;
      onWalkView(view);
    }else if(event.data.kind==='status'){
      if(event.data.error===true){ready=false;loading.hidden=true;restartButton.disabled=true;onWalkView(null);}
      else if(event.data.active===false)onWalkView(null);
      if(typeof event.data.text==='string')setStatus(event.data.text);
    }
  });
  listen(splitButton,'click',()=>setSplitVisible(!splitVisible));
  listen(undoButton,'click',()=>{if(!undoButton.disabled)onUndo();});
  listen(redoButton,'click',()=>{if(!redoButton.disabled)onRedo();});
  listen(restartButton,'click',()=>{if(visible&&ready)sendZone(true);});
  listen(fullscreenButton,'click',async()=>{
    try{if(doc.fullscreenElement===host)await doc.exitFullscreen();else await host.requestFullscreen();}
    catch{setStatus('Полноэкранный режим недоступен в этом браузере.');}
  });
  listen(doc,'fullscreenchange',()=>{fullscreenButton.textContent=doc.fullscreenElement===host?'Вернуть на страницу':'На весь экран';refreshMapLayout();});
  listen(win,'resize',refreshMapLayout);
  listen(win,'park-folder-change',refreshVisibility);
  listen(win,'hashchange',refreshVisibility);
  listen(doc,'visibilitychange',refreshVisibility);
  const section=host.closest('#installations');
  let observer=null;
  if(section&&typeof win.MutationObserver==='function'){
    observer=new win.MutationObserver(refreshVisibility);observer.observe(section,{attributes:true,attributeFilter:['hidden']});
  }
  let resizeObserver=null;
  if(typeof win.ResizeObserver==='function'){
    resizeObserver=new win.ResizeObserver(refreshMapLayout);resizeObserver.observe(stage);resizeObserver.observe(mapHost);
  }
  refreshVisibility();
  return {
    updateScope(next,nextLabel){
      if(disposed)return;
      const checked=normalizedScope(next),changed=JSON.stringify(checked)!==JSON.stringify(currentScope);
      if(changed)onMapSuspend('scope-change');currentScope=checked;
      if(typeof nextLabel==='string')zoneLabel.textContent=nextLabel;
      if(changed){setStatus('');sendZone();}
    },
    setVisible,
    getMapHost:()=>mapHost,
    isSplitVisible:()=>splitVisible,
    setSplitVisible,
    setHistory({canUndo=false,canRedo=false}={}){if(disposed)return;undoButton.disabled=!canUndo;redoButton.disabled=!canRedo;},
    destroy(){if(disposed)return;onMapSuspend('destroy');onWalkView(null);post('visibility',{visible:false});disposed=true;observer?.disconnect();resizeObserver?.disconnect();listeners.forEach(remove=>remove());host.replaceChildren();}
  };
}
