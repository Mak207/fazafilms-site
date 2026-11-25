export const INSTALLATIONS_WALK_PROTOCOL = 'faza.park.installations-walk.v1';

const normalizedScope = value => ({
  regionId:typeof value?.regionId==='string'?value.regionId:null,
  hallId:typeof value?.hallId==='string'?value.hallId:null,
  floorId:value?.floorId==='upper'?'upper':'main'
});

/** The same iframe stays mounted while the equipment planner updates. */
export function createEquipmentWalk(host,{scope,label='',windowObject=host?.ownerDocument?.defaultView,onStatus=()=>{}}={}) {
  if(!host||!windowObject)throw Error('Не удалось открыть прогулку.');
  const win=windowObject,doc=host.ownerDocument,origin=win.location.origin;
  let currentScope=normalizedScope(scope),sequence=0,visible=false,loaded=false,ready=false,disposed=false;
  const listeners=[];
  const listen=(target,type,handler)=>{target.addEventListener(type,handler);listeners.push(()=>target.removeEventListener(type,handler));};
  host.classList.add('ep-walk');host.setAttribute('role','region');host.setAttribute('aria-label','Прогулка по выбранной зоне');
  host.innerHTML=`<div class="ep-walk-heading"><div><h2>Прогулка по зоне</h2><p class="ep-walk-zone"></p></div><div class="ep-walk-actions" data-az-zone="controls"><button type="button" data-walk-restart>К началу зоны</button><button type="button" data-walk-fullscreen>На весь экран</button></div></div><div class="ep-walk-viewport"><iframe title="Прогулка по выбранной зоне Парка впечатлений" loading="eager" allow="fullscreen" allowfullscreen referrerpolicy="same-origin"></iframe><p class="ep-walk-loading" role="status">Загружаем прогулку…</p></div><p class="ep-walk-help"><span class="ep-walk-help-desktop">Нажмите на 3D-вид: WASD или стрелки — идти, мышь — оглядеться, E — включить интерактив.</span><span class="ep-walk-help-touch">Оглядывайтесь пальцем, двигайтесь кнопками на экране.</span></p><p class="ep-walk-status" role="status" aria-live="polite"></p>`;
  const frame=host.querySelector('iframe'),zoneLabel=host.querySelector('.ep-walk-zone'),loading=host.querySelector('.ep-walk-loading'),status=host.querySelector('.ep-walk-status');
  const restartButton=host.querySelector('[data-walk-restart]'),fullscreenButton=host.querySelector('[data-walk-fullscreen]');
  zoneLabel.textContent=label||'Выбранная зона';
  restartButton.disabled=true;
  fullscreenButton.hidden=typeof host.requestFullscreen!=='function';
  const url=new URL('tour/index.html',new URL('./',win.location.href));
  url.searchParams.set('embedded','installations');url.searchParams.set('v','installations-walk-20261125');

  function post(kind,payload={}) {
    if(disposed||!loaded||origin==='null')return;
    try{frame.contentWindow?.postMessage({protocol:INSTALLATIONS_WALK_PROTOCOL,kind,sequence:++sequence,...payload},origin);}catch{}
  }
  function sendZone(restart=false){post('zone',{scope:{...currentScope},...(restart?{restart:true}:{})});}
  function setStatus(text){status.textContent=String(text||'').slice(0,500);onStatus(status.textContent);}
  function setVisible(next){
    if(disposed)return;
    const changed=visible!==Boolean(next);visible=Boolean(next);
    if(visible&&!loaded){loaded=true;frame.src=url.href;}
    if(changed||!ready)post('visibility',{visible});
  }
  function isVisible(){
    if(doc.visibilityState==='hidden')return false;
    const section=host.closest('#installations');
    return section?!section.closest('[hidden]'):doc.body?.dataset.folder==='installations';
  }
  const refreshVisibility=()=>setVisible(isVisible());
  listen(frame,'load',()=>{if(!loaded)return;post('visibility',{visible});sendZone();});
  listen(frame,'error',()=>{loading.hidden=true;setStatus('Не удалось загрузить прогулку. Обновите страницу.');});
  listen(win,'message',event=>{
    if(disposed||event.origin!==origin||event.source!==frame.contentWindow||event.data?.protocol!==INSTALLATIONS_WALK_PROTOCOL)return;
    if(event.data.kind==='ready'){
      ready=true;loading.hidden=true;restartButton.disabled=false;setStatus('');post('visibility',{visible});sendZone();
    }else if(event.data.kind==='status'){
      if(event.data.error===true){ready=false;loading.hidden=true;restartButton.disabled=true;}
      if(typeof event.data.text==='string')setStatus(event.data.text);
    }
  });
  listen(restartButton,'click',()=>{if(visible&&ready)sendZone(true);});
  listen(fullscreenButton,'click',async()=>{
    try{if(doc.fullscreenElement===host)await doc.exitFullscreen();else await host.requestFullscreen();}
    catch{setStatus('Полноэкранный режим недоступен в этом браузере.');}
  });
  listen(doc,'fullscreenchange',()=>{fullscreenButton.textContent=doc.fullscreenElement===host?'Вернуть на страницу':'На весь экран';});
  listen(win,'park-folder-change',refreshVisibility);
  listen(win,'hashchange',refreshVisibility);
  listen(doc,'visibilitychange',refreshVisibility);
  const section=host.closest('#installations');
  let observer=null;
  if(section&&typeof win.MutationObserver==='function'){
    observer=new win.MutationObserver(refreshVisibility);observer.observe(section,{attributes:true,attributeFilter:['hidden']});
  }
  refreshVisibility();
  return {
    updateScope(next,nextLabel){
      if(disposed)return;
      const checked=normalizedScope(next),changed=JSON.stringify(checked)!==JSON.stringify(currentScope);currentScope=checked;
      if(typeof nextLabel==='string')zoneLabel.textContent=nextLabel;
      if(changed){setStatus('');sendZone();}
    },
    setVisible,
    destroy(){if(disposed)return;post('visibility',{visible:false});disposed=true;observer?.disconnect();listeners.forEach(remove=>remove());host.replaceChildren();}
  };
}
