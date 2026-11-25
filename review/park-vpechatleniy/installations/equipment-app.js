import { createDefaultState, normalizeState, setQuantity, getInstances, getSummary, getContentPlan, getUnitMetrics } from './equipment-model.js?v=equipment-3d-20261125';
import { createEquipmentMap } from './equipment-map.js?v=walk-split-20261125';
import {equipmentVariant, readEquipmentVariant, createEquipmentChannel, encodeEquipmentVariant, consumeEquipmentShare} from './equipment-state.js?v=equipment-3d-20261125';
import {createEquipmentWalk} from './equipment-walk.js?v=walk-split-20261125';

const STORAGE_KEY = 'faza.park.equipment-plan.v1';
const NF = new Intl.NumberFormat('ru-RU', {maximumFractionDigits: 1});
const nf = n => Number.isFinite(n) ? NF.format(n) : '—';
const nfDimension = n => Number.isFinite(n) ? new Intl.NumberFormat('ru-RU',{maximumFractionDigits:3}).format(n) : '—';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const copy = value => JSON.parse(JSON.stringify(value));
const views = ['plan', 'equipment', 'content', 'basis'];
const contentType = type => ({linear:'Фильм', video:'Фильм', interactive:'Интерактивная программа', app:'Интерактивная программа', editorial:'Тексты и иллюстрации', navigation:'Навигация', ambient:'Фоновая программа', projection:'Проекция', vr:'VR-программа', audio:'Звук', realtime:'Генеративная сцена'}[type] || 'Медиапрограмма');
const matches = (g, s) => (!s.regionId || g.regionId === s.regionId) && (!s.hallId || g.hallId === s.hallId) && (!s.floorId || g.floorId === s.floorId);

/** A single state drives quantities, the drawing and all dependent figures. */
export function createEquipmentPlanner(mount, {data, mapFactory = createEquipmentMap, walkFactory = createEquipmentWalk, storage, initialState, locationObject = window.location} = {}) {
  if (!mount || !Array.isArray(data?.groups)) throw new Error('Не удалось загрузить оборудование.');
  let safeStorage = storage;
  if (safeStorage === undefined) { try { safeStorage = window.localStorage; } catch { safeStorage = null; } }
  const baseline = createDefaultState(data);
  let state = normalizeState(data, initialState || baseline);
  let scope = {regionId:'rgo', hallId:null, floorId:null}, mapFloor='main';
  let exhibitId = '', selectedId = '', view = 'plan', report = null, map, destroyed = false, announcementTimer, clearAnnouncementTimer;
  let history = [], future = [], lastEdit = null, channel=null, walk=null, applyingRemote=false;
  let splitMap=null, splitMapPending=null, splitScope=null;
  const abort = new AbortController();
  const url = new URL(locationObject.href);
  const restored=readEquipmentVariant(data,{storage:safeStorage,locationObject,initialState});
  let restoreMessage=restored.error?'Сохранённый вариант не открылся. Показано начальное оснащение.':restored.shared?'Открыт вариант из ссылки.':'';
  if(restored.restored){state=normalizeState(data,restored.variant.state);scope={...scope,...restored.variant.scope};mapFloor=restored.variant.mapFloor;exhibitId=restored.variant.exhibitId;}
  if (!data.regions.some(r => r.id === scope.regionId)) scope.regionId = null;
  if (!data.halls.some(h => h.id === scope.hallId && h.regionId === scope.regionId)) scope.hallId = null;
  scope.floorId=null;
  if (!['main','upper'].includes(mapFloor)) mapFloor = 'main';
  if (url.searchParams.get('rgo')) {scope.regionId='rgo';mapFloor='main';const h=data.halls.find(h=>h.id.endsWith(url.searchParams.get('rgo')));scope.hallId=h?.id || null;}
  const initialView = url.searchParams.get('equipmentView');
  if (views.includes(initialView)) view = initialView;
  const root = document.createElement('div'); root.className = 'equipment-planner';
  mount.replaceChildren(root);
  root.innerHTML = `
    <div id="ep-walk"></div>
    <div class="ep-heading"><div><h2 id="installations-title">Расчёт инсталляций</h2><p class="ep-intro">Меняйте количество, передвигайте и поворачивайте оборудование на плане. Общая 3D-схема и расчёты обновляются вместе с ним.</p></div><button type="button" class="ep-open-3d" data-action="3d">Общая 3D-схема</button></div>
    <div class="ep-basis" aria-label="Основа проекта"><span><strong>18 884 м²</strong> площадь парка</span><span><strong>8 округов</strong></span><span><strong>9 залов РГО</strong></span><span><strong>4 часа</strong> полная экскурсия</span></div>
    <div class="ep-toolbar" data-az-zone="controls">
      <label class="ep-field">Зона<select id="ep-region" aria-label="Зона"></select></label>
      <label class="ep-field" id="ep-hall-field">Зал<select id="ep-hall" aria-label="Зал"></select></label>
      <label class="ep-field">Экспонат<select id="ep-exhibit" aria-label="Экспонат"></select></label>
      <label class="ep-field">Уровень на плане<select id="ep-floor" aria-label="Уровень на плане"><option value="main">Нижний уровень</option><option value="upper">Верхний уровень</option></select></label>
    </div>
    <div class="ep-tabs" role="tablist" aria-label="Оснащение выбранной зоны" data-az-zone="controls">
      <button type="button" id="ep-tab-plan" role="tab" data-view="plan" aria-controls="ep-panel-plan">План и количество</button>
      <button type="button" id="ep-tab-equipment" role="tab" data-view="equipment" aria-controls="ep-panel-equipment">Оборудование</button>
      <button type="button" id="ep-tab-content" role="tab" data-view="content" aria-controls="ep-panel-content">Контент</button>
      <button type="button" id="ep-tab-basis" role="tab" data-view="basis" aria-controls="ep-panel-basis">Как считаем</button>
    </div>
    <div class="ep-summary" id="ep-summary" aria-label="Оснащение выбранной зоны"></div>
    <section id="ep-panel-plan" class="ep-panel" role="tabpanel" aria-labelledby="ep-tab-plan">
      <div class="ep-workspace"><div class="ep-map-column">
        <div class="ep-map-head"><h3 id="ep-map-title"></h3><p id="ep-map-subtitle"></p></div>
        <div id="ep-map"></div><p id="ep-placement-status" class="ep-status" role="status"></p>
        <div id="ep-unplaced"></div><div id="ep-selection" class="ep-selection" hidden></div>
      </div><aside class="ep-editor" aria-label="Количество оборудования"><div class="ep-editor-heading"><h3>Количество оборудования</h3><p>Кнопки и поля меняют текущий вариант.</p></div><div id="ep-equipment-list" class="ep-equipment-list"></div><div id="ep-add-row" class="ep-add-row"></div></aside></div>
    </section>
    <section id="ep-panel-equipment" class="ep-panel" role="tabpanel" aria-labelledby="ep-tab-equipment" hidden><div id="ep-equipment-table"></div><div id="ep-region-table"></div></section>
    <section id="ep-panel-content" class="ep-panel" role="tabpanel" aria-labelledby="ep-tab-content" hidden><div id="ep-content"></div></section>
    <section id="ep-panel-basis" class="ep-panel" role="tabpanel" aria-labelledby="ep-tab-basis" hidden><div id="ep-basis-detail"></div></section>
    <div class="ep-actions" data-az-zone="controls"><button type="button" data-action="undo">Отменить</button><button type="button" data-action="redo">Повторить</button><button type="button" data-action="share">Ссылка на вариант</button><button type="button" data-action="csv">Скачать ведомость</button><button type="button" data-action="reset">Начальное оснащение</button></div>
    <p class="ep-status" id="ep-save-status">План и 3D используют одну расстановку. Изменения сохраняются в этом браузере; ссылкой можно передать выбранный вариант.</p>
    <p class="ep-toast" id="ep-announcement" role="status" aria-live="polite" aria-atomic="true"></p>
    <label id="ep-share-fallback" class="ep-field" hidden>Ссылка на вариант<input type="text" readonly aria-label="Ссылка на вариант"></label>`;
  const $ = id => root.querySelector(id);
  const on = (el, type, handler) => el.addEventListener(type, handler, {signal:abort.signal});
  const cat = g => data.catalog.find(t=>t.id===g.typeId) || {};
  const scopedGroups = () => data.groups.filter(g => matches(g,scope) && (!exhibitId || g.exhibitId === exhibitId));
  const scopedData = () => ({...data,groups:scopedGroups()});
  const scopeName = () => data.halls.find(h=>h.id===scope.hallId)?.name || data.regions.find(r=>r.id===scope.regionId)?.name || 'Весь парк';
  const quantity = g => Number(state.quantities[g.id] ?? g.defaultQuantity ?? 0);
  const groupName = g => g.name || cat(g).name || 'Оборудование';
  const summary = () => getSummary(data,state,{...scope,exhibitId:exhibitId||null});
  const mapScope = () => ({...scope,floorId:mapFloor,exhibitId:exhibitId||null});
  const walkScope = () => ({regionId:scope.regionId,hallId:scope.hallId,floorId:mapFloor});
  const walkLabel = () => `${scopeName()} · ${mapFloor==='upper'?'Верхний уровень':'Нижний уровень'}`;
  function updateWalkScope() {walk?.updateScope(walkScope(),walkLabel());splitScope=walkScope();syncSplitMap();}
  const mapState = (nextScope=mapScope(),nextExhibit=exhibitId) => ({data,instances:getInstances(data,state),scope:nextScope,selectedId,positions:state.positions||{},exhibitId:nextExhibit});
  function syncSplitMap() {if(splitMap)splitMap.update(mapState(splitScope||walkScope(),''));}
  function selectEquipment(source,id) {
    selectedId=(typeof id==='string'?id:id?.id)||'';renderSelection();
    // The source SVG owns its active pointer gesture. Updating it here would
    // replace the grabbed element on the very first pointerdown.
    if(source!==map)map?.update(mapState());
    if(source!==splitMap)syncSplitMap();
  }
  function moveEquipment(id,position) {commit({...state,positions:{...state.positions,[id]:position}},{message:'Положение и поворот сохранены на плане и в 3D.'});}
  function previewEquipment(id,position,meta) {if(meta?.valid!==false)channel?.preview(id,position);else channel?.endPreview(id);}
  function endEquipmentPreview(id,meta) {channel?.endPreview(id,meta);}
  function suspendSplitMap() {
    splitMap?.cancelInteraction?.();
    // This end barrier must reach the iframe before layout/visibility changes.
    channel?.endPreview();
  }
  function ensureSplitMap(host) {
    if(splitMap){syncSplitMap();splitMap.refreshLayout?.();return Promise.resolve(splitMap);}
    if(splitMapPending)return splitMapPending;
    splitMapPending=Promise.resolve(map?.ready).then(geometry=>{
      if(destroyed||!walk?.isSplitVisible?.())return null;
      splitMap=mapFactory(host,{geometry,
        onSelect:id=>selectEquipment(splitMap,id),onMove:moveEquipment,
        onPreview:previewEquipment,onPreviewEnd:endEquipmentPreview,
        onScopeChange:next=>selectScope(next)});
      // Only the original map accepts automatic placement into the shared
      // state. Both views read those same positions; neither creates a variant.
      syncSplitMap();splitMap.refreshLayout?.();return splitMap;
    }).catch(()=>{if(!destroyed)host.textContent='Не удалось загрузить схему зоны. Обновите страницу.';return null;})
      .finally(()=>{splitMapPending=null;});
    return splitMapPending;
  }
  const scopeInstances = () => getInstances(data,state).filter(i=>matches(i,mapScope()) && (!exhibitId || data.groups.find(g=>g.id===i.groupId)?.exhibitId===exhibitId));
  function announce(text) { clearTimeout(announcementTimer);clearTimeout(clearAnnouncementTimer); $('#ep-announcement').textContent=''; announcementTimer=setTimeout(()=>{if(!destroyed){$('#ep-announcement').textContent=text;clearAnnouncementTimer=setTimeout(()=>{if(!destroyed)$('#ep-announcement').textContent='';},5000);}},100); }
  function savedVariant() {return equipmentVariant(data,state,{scope,mapFloor,exhibitId});}
  function persist() {
    if(applyingRemote)return;
    if(channel){channel.publish(savedVariant());return;}
    try {safeStorage?.setItem(STORAGE_KEY,JSON.stringify(savedVariant()));}
    catch {$('#ep-save-status').textContent='Браузер не сохранил вариант. Используйте «Ссылка на вариант», чтобы сохранить изменения.';}
  }
  function commit(next,{key='',message='',refreshEditor=false}={}) {
    const checked=normalizeState(data,next);
    if(JSON.stringify(checked)===JSON.stringify(state))return;
    const now=Date.now();
    if(!lastEdit || lastEdit.key!==key || !key || now-lastEdit.time>750) history.push(copy(state));
    if(history.length>60)history.shift(); future=[];lastEdit={key,time:now};state=checked;
    if(selectedId && !getInstances(data,state).some(i=>i.id===selectedId)) selectedId='';
    renderSelectors();persist();render(true);if(message)announce(message);
  }
  function changeQuantity(id,value,fromInput=false) {
    const g=data.groups.find(g=>g.id===id); if(!g)return;
    if(!Number.isFinite(value)||value<0||Math.floor(value)!==value)return;
    const max=g.maxQuantity ?? 99;value=Math.min(value,max);
    mapFloor=g.floorId;$('#ep-floor').value=mapFloor;
    commit(setQuantity(data,state,id,value),{key:fromInput?id:'',message:`${groupName(g)}: ${nf(value)}. Схема и расчёты обновлены.`});
  }
  function options(select,items,value) {select.innerHTML=items.map(i=>`<option value="${esc(i.value)}">${esc(i.label)}</option>`).join('');select.value=value || '';}
  function renderSelectors() {
    options($('#ep-region'),[{value:'',label:'Весь парк'},...data.regions.map(r=>({value:r.id,label:r.name}))],scope.regionId);
    const halls=data.halls.filter(h=>h.regionId===scope.regionId);
    $('#ep-hall-field').hidden=!halls.length;
    options($('#ep-hall'),[{value:'',label:'Все залы'},...halls.map(h=>({value:h.id,label:h.name}))],scope.hallId);
    const exhibitMap=new Map();data.groups.filter(g=>matches(g,scope)&&(quantity(g)>0||g.exhibitId===exhibitId)).forEach(g=>{if(g.exhibitId)exhibitMap.set(g.exhibitId,g.exhibitName || g.name);});
    if(exhibitId && !exhibitMap.has(exhibitId))exhibitId='';
    options($('#ep-exhibit'),[{value:'',label:'Все экспонаты'},...Array.from(exhibitMap,([value,label])=>({value,label}))],exhibitId);
    const region=data.regions.find(r=>r.id===scope.regionId);const available=region?.floors?.map(f=>f.id)||['main','upper'];if(!available.includes(mapFloor))mapFloor=available[0]||'main';for(const option of $('#ep-floor').options)option.disabled=!available.includes(option.value);$('#ep-floor').value=mapFloor;
  }
  function stat(value,label,detail='') {return `<div class="ep-stat"><strong>${nf(value)}</strong><span>${label}</span>${detail?`<small>${esc(detail)}</small>`:''}</div>`;}
  function renderSummary() {
    const s=summary();
    $('#ep-summary').innerHTML=stat(s.screens,'Экранов',`${nf(s.screenAreaM2)} м² изображения`)+stat(s.ledCabinets,'LED-кабинетов',`Для ${nf(s.ledScreens)} LED-экранов`)+stat(s.interactiveStations,'Интерактивных станций',`${nf(s.interactivePlaces)} активных мест`)+stat(s.digitalPrograms,'Цифровых программ',`${nf(s.linearMinutes)} мин линейного контента`);
    const a=getSummary(data,state,scope),area=a.areaKnown?`${nf(a.areaM2)} м² по плану зон`:'Площадь уточняется по плану';
    $('#ep-map-title').textContent=scopeName();$('#ep-map-subtitle').textContent=`${mapFloor==='upper'?'Верхний уровень':'Нижний уровень'} на плане · ${area}.${data.regions.find(r=>r.id===scope.regionId)?.floors?.length===1?'':' Итоги по обоим уровням.'}`;
  }
  function stepper(g,location='editor') {const n=quantity(g),max=g.maxQuantity??99;return `<div class="ep-stepper"><button type="button" data-count-step="-1" data-group="${esc(g.id)}" aria-label="Убрать одно: ${esc(groupName(g))}" ${n<=0?'disabled':''}>−</button><input type="number" data-equipment-count="${esc(g.id)}" data-location="${location}" value="${n}" min="0" max="${max}" step="1" inputmode="numeric" aria-label="Количество: ${esc(groupName(g))}"><button type="button" data-count-step="1" data-group="${esc(g.id)}" aria-label="Добавить одно: ${esc(groupName(g))}" ${n>=max?'disabled':''}>+</button></div>`;}
  function dimensions(g,display=true) {const d=(display?g.displayDimensions:null)||g.dimensions||{};return [d.widthM,d.heightM].every(Number.isFinite)?`${nfDimension(d.widthM)} × ${nfDimension(d.heightM)} м`:'';}
  function equipmentMeta(g) {
    const one=getUnitMetrics(data,g);
    return [g.floorId==='upper'?'Верхний уровень':'Нижний уровень',dimensions(g),one.ledCabinets?`${nf(one.ledCabinets)} LED-кабинетов на экран`:'',one.interactivePlaces?`${nf(one.interactivePlaces)} активных мест`:''].filter(Boolean).join(' · ');
  }
  function row(g){return `<article class="ep-equipment-row" data-equipment-row="${esc(g.id)}"><div class="ep-equipment-row-head"><div class="ep-equipment-name"><h4>${esc(groupName(g))}</h4>${g.exhibitName&&g.exhibitName!==g.name?`<span>${esc(g.exhibitName)}</span>`:''}</div>${stepper(g)}</div><p class="ep-equipment-meta">${esc(equipmentMeta(g))}</p><button type="button" class="ep-reveal" data-show-group="${esc(g.id)}">Показать на плане</button></article>`;}
  function renderEditor() {
    const groups=scopedGroups(),editing=document.activeElement?.dataset?.equipmentCount,active=groups.filter(g=>quantity(g)>0||g.id===editing);
    const byHall=new Map();for(const g of active){const key=g.hallId||g.regionId; if(!byHall.has(key))byHall.set(key,[]);byHall.get(key).push(g);}
    if(byHall.size>1 && !scope.hallId && !exhibitId) $('#ep-equipment-list').innerHTML=Array.from(byHall,([key,items],i)=>`<details class="ep-detail ep-equipment-section" data-section="${esc(key)}" ${i===0?'open':''}><summary>${esc(data.halls.find(h=>h.id===key)?.name || data.regions.find(r=>r.id===key)?.name || 'Оборудование')}<small>${nf(items.reduce((sum,g)=>sum+quantity(g),0))}</small></summary><div class="ep-detail-body">${items.map(row).join('')}</div></details>`).join('');
    else $('#ep-equipment-list').innerHTML=active.map(row).join('') || '<p class="ep-empty">В этой части плана пока нет оборудования. Добавьте его из списка ниже.</p>';
    const addable=groups.filter(g=>quantity(g)===0);
    $('#ep-add-row').innerHTML=addable.length?`<label class="ep-field">Добавить оборудование<select id="ep-add-type" aria-label="Добавить оборудование">${addable.map(g=>`<option value="${esc(g.id)}">${esc((!scope.hallId&&g.hallName?g.hallName+' · ':'')+groupName(g)+(g.floorId==='upper'?' · верхний уровень':''))}</option>`).join('')}</select></label><button type="button" data-action="add">Добавить</button>`:'<p class="ep-note">Чтобы добавить ещё одно устройство, увеличьте его количество.</p>';
  }
  function syncInputs() {for(const input of root.querySelectorAll('[data-equipment-count]')){const g=data.groups.find(g=>g.id===input.dataset.equipmentCount);if(g&&document.activeElement!==input)input.value=quantity(g);if(g){const stepper=input.parentElement;stepper.querySelector('[data-count-step="-1"]').disabled=quantity(g)<=0;stepper.querySelector('[data-count-step="1"]').disabled=quantity(g)>=(g.maxQuantity??99);}}}
  function renderEquipment() {
    const editing=document.activeElement?.dataset?.equipmentCount,groups=scopedGroups().filter(g=>quantity(g)>0||g.id===editing),s=summary();
    $('#ep-equipment-table').innerHTML=`<h3>Оборудование · ${esc(scopeName())}</h3><p class="ep-note">Размеры относятся к одному устройству. Количество можно менять прямо в ведомости.</p><div class="ep-table-wrap"><table class="ep-table"><thead><tr><th scope="col">Оборудование</th><th scope="col">Количество</th><th scope="col">Изображение</th><th scope="col">LED-кабинеты</th><th scope="col">Активные места</th></tr></thead><tbody>${groups.map(g=>{const t=getSummary({...data,groups:[g]},state,{});return `<tr><th scope="row">${esc(groupName(g))}<small>${esc(g.hallName||g.exhibitName||'')}${dimensions(g)?` · ${esc(dimensions(g))}`:''}</small></th><td>${stepper(g,'table')}</td><td>${nf(t.screenAreaM2)} м²</td><td>${t.ledCabinets?nf(t.ledCabinets):'—'}</td><td>${t.interactivePlaces?nf(t.interactivePlaces):'—'}</td></tr>`;}).join('')||'<tr><td colspan="5">Оборудование пока не добавлено.</td></tr>'}</tbody><tfoot><tr><th>Всего</th><td>${nf(s.equipmentCount)}</td><td>${nf(s.screenAreaM2)} м²</td><td>${nf(s.ledCabinets)}</td><td>${nf(s.interactivePlaces)}</td></tr></tfoot></table></div><div class="ep-basis"><span><strong>${nf(s.showcases)}</strong> витрин</span><span><strong>${nf(s.projectors)}</strong> проекторов</span><span><strong>${nf(s.vrStations)}</strong> VR-мест</span><span><strong>${nf(s.footprintM2)} м²</strong> площадь оборудования на полу</span></div>`;
    const rows=scope.regionId==='rgo'?data.halls.map(h=>({name:h.name,scope:{regionId:'rgo',hallId:h.id},hallId:h.id,regionId:'rgo'})):data.regions.map(r=>({name:r.name,scope:{regionId:r.id},regionId:r.id}));
    $('#ep-region-table').innerHTML=`<h3>${scope.regionId==='rgo'?'Оснащение залов РГО':'Оснащение зон парка'}</h3><div class="ep-table-wrap"><table class="ep-table"><thead><tr><th scope="col">${scope.regionId==='rgo'?'Зал':'Зона'}</th><th scope="col">Экраны</th><th scope="col">LED-кабинеты</th><th scope="col">Интерактивы</th><th scope="col">Программы</th></tr></thead><tbody>${rows.map(r=>{const t=getSummary(data,state,r.scope);return `<tr><th scope="row"><button type="button" class="ep-action-link" data-region="${esc(r.regionId)}" data-hall="${esc(r.hallId||'')}">${esc(r.name)}</button></th><td>${nf(t.screens)}</td><td>${nf(t.ledCabinets)}</td><td>${nf(t.interactiveStations)}</td><td>${nf(t.digitalPrograms)}</td></tr>`;}).join('')}</tbody></table></div>`;
  }
  function renderContent() {
    const items=getContentPlan(data,state,{...scope,exhibitId:exhibitId||null}),s=summary();
    $('#ep-content').innerHTML=`<h3>Что нужно создать · ${esc(scopeName())}</h3><p class="ep-note">Одинаковая программа на нескольких устройствах создаётся один раз. Хронометраж ниже — начальное предложение для производства.</p><div class="ep-summary">${stat(s.digitalPrograms,'Цифровых программ')+stat(s.editorialPackages,'Комплектов текстов и иллюстраций')+stat(s.linearMinutes,'Минут линейных программ')+stat(s.channelMinutes,'Канало-минут видео','С учётом разных изображений в одном шоу')}</div><div class="ep-content-grid">${items.map(c=>`<article class="ep-content-card"><div class="ep-tags"><span>${esc(contentType(c.type))}</span></div><h3>${esc(c.title)}</h3>${c.description?`<p>${esc(c.description)}</p>`:''}${Array.isArray(c.topics)&&c.topics.length?`<ul>${c.topics.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`:''}<div class="ep-content-meta"><span>${c.type==='editorial'?'Тексты и подписи для экспозиции':`На ${nf(c.deviceCount)} ${c.deviceCount===1?'устройстве':'устройствах'}`}</span>${Number.isFinite(c.durationMinutes)&&c.durationMinutes>0?`<span>${nf(c.durationMinutes)} мин</span>`:''}${c.channels>1?`<span>${nf(c.channels)} разных изображения</span>`:''}</div><details class="ep-detail"><summary>${c.type==='editorial'?'Для чего готовим':'Где показываем и в каком формате'}</summary><div class="ep-detail-body">${c.type==='editorial'&&!c.deviceCount?`<p>${esc(data.halls.find(h=>h.id===c.hallId)?.name||data.regions.find(r=>r.id===c.regionId)?.name||'Экспозиция')}</p>`:''}${(c.deliveryFormats||[]).map(f=>`<p>${nfDimension(f.widthM)} × ${nfDimension(f.heightM)} м${f.pixelWidth&&f.pixelHeight?` · ${nf(f.pixelWidth)} × ${nf(f.pixelHeight)} пикселей`: ' · разрешение уточняется'}</p>`).join('')}${(c.groupIds||[]).map(id=>data.groups.find(g=>g.id===id)).filter(Boolean).map(g=>`<p>${esc(g.hallName||g.exhibitName||data.regions.find(r=>r.id===g.regionId)?.name)} · ${esc(groupName(g))} — ${nf(quantity(g))}</p>`).join('')}</div></details></article>`).join('')||'<p class="ep-empty">Добавьте оборудование, чтобы увидеть программы для производства.</p>'}</div>`;
  }
  function renderBasis() {
    const s=summary();const changed=data.groups.filter(g=>quantity(g)!==g.defaultQuantity).length;
    $('#ep-basis-detail').innerHTML=`<h3>От оборудования к расчётам</h3><p>Площади и программа залов задают основу. Вы выбираете оборудование; количества, размещение, питание и объём контента считаются из этого выбора.</p>
      <details class="ep-detail" open><summary>Экраны и LED-кабинеты</summary><div class="ep-detail-body"><p><strong>${nf(s.screens)} экранов</strong>, из них <strong>${nf(s.ledScreens)} LED-экранов</strong>. LED-кабинет — сборный блок большого экрана; он не является отдельным сюжетом.</p><p>Для принятого размера кабинета 608 × 342 мм число колонок = ширина экрана ÷ 0,608, число рядов = высота ÷ 0,342. Оба значения округляются вверх до целых кабинетов.</p><p>Кабинеты одного экрана = колонки × ряды. Общий результат — сумма по всем LED-экранам: <strong>${nf(s.ledCabinets)} кабинетов</strong>, <strong>${nf(s.ledAreaM2)} м²</strong> LED-изображения. ЖК-экраны и проекции в это число кабинетов не входят.</p></div></details>
      <details class="ep-detail"><summary>Интерактивы и места посетителей</summary><div class="ep-detail-body"><p>В выбранной части плана <strong>${nf(s.interactiveStations)} интерактивных станций</strong> и <strong>${nf(s.interactivePlaces)} активных мест</strong>. Добавление такой же станции увеличивает число мест, сохраняя ту же программу.</p><p>Активные места не равны общей вместимости зала. Пропускная способность зависит ещё от длительности сеанса, смены участников и маршрута группы. Поток посетителей по залам пока не закреплён, поэтому очередь и вместимость здания из числа устройств не выводятся.</p></div></details>
      <details class="ep-detail"><summary>Площадь и свободное место</summary><div class="ep-detail-body"><p>Принятая площадь парка — <strong>18 884,055 м²</strong> по модели из DWG. Площади территорий берутся из исходного плана зон; <strong>1 120 м²</strong> — сумма площадей девяти залов по программе РГО.</p><p>На схеме оборудование занимает <strong>${nf(s.footprintM2)} м²</strong> по своим габаритам на полу. Для размещения дополнительно нужны проходы и место перед экраном. Остаток площади после вычитания оборудования не считается свободной вместимостью.</p><p>Цветовые границы залов РГО показывают их расположение внутри экспозиции. Это схема распределения, а не обмерные стены помещений. Если установка не помещается, она остаётся в ведомости и появляется в списке оборудования, которому нужно место.</p></div></details>
      <details class="ep-detail"><summary>Питание</summary><div class="ep-detail-body"><p>${s.powerCoverage==='complete'?`Суммарная известная мощность выбранного оборудования — <strong>${nf(s.powerKw)} кВт</strong>.`:`Для оборудования с известными параметрами — <strong>${nf(s.knownPowerKw)} кВт</strong>. Ещё для ${nf(s.unknownPowerItems)} устройств нужны паспортные данные.`}</p><p>Это сумма по выбранному оборудованию. Она меняется вместе с его количеством. Кабельные линии, резерв, пусковые токи, охлаждение и допустимая мощность здания требуют отдельного инженерного расчёта.</p></div></details>
      <details class="ep-detail"><summary>Объём контента</summary><div class="ep-detail-body"><p>Считаем уникальные цифровые программы, которые используются хотя бы на одном устройстве. Удаление последнего устройства убирает связанную цифровую программу из текущего объёма. Тексты и подписи для предметных экспонатов продолжают требоваться. Три одинаковых терминала с одной программой дают три места показа и одну работу для производства.</p><p>Минуты линейных программ — длительность уникальных фильмов и фоновых циклов. Канало-минуты учитывают разные изображения в многоканальном шоу. Интерактивное приложение, VR и тексты считаются отдельными работами; они не переводятся автоматически в минуты видео.</p></div></details>
      <details class="ep-detail"><summary>Начальное оснащение и источники</summary><div class="ep-detail-body"><p>Начальная комплектация предложена по программе экспозиции и текущей расстановке. Её можно менять. В этом варианте изменено ${nf(changed)} позиций оборудования.</p><ul><li>Границы и площади территорий — исходная схема зонирования парка.</li><li>Залы РГО — программа из девяти залов, включая предметную экспозицию, проекции и интерактивы.</li><li>Положение экспонатов и существующих экранов — текущая 3D-расстановка.</li><li>Расчёт LED — сетка кабинетов 608 × 342 мм; серия и окончательные паспорта уточняются при подборе оборудования.</li></ul><p><a href="./tour/?floorColors=1" target="_blank" rel="noopener">Открыть 3D-тур</a> · <a href="./tour/rgo-source-plan.jpg" target="_blank" rel="noopener">Исходный план РГО</a></p></div></details>`;
  }
  function renderPlacement() {
    if(!report){$('#ep-placement-status').textContent='Загружаем план здания…';return;}
    const ids=new Set(scopeInstances().map(i=>i.id));
    const placed=(report.placed||[]).filter(i=>ids.has(typeof i==='string'?i:i.id));
    const unplaced=(report.unplaced||[]).filter(i=>ids.has(typeof i==='string'?i:i.id));
    $('#ep-placement-status').textContent='';
    $('#ep-unplaced').innerHTML=unplaced.length?`<details class="ep-detail ep-warning" open><summary>${nf(unplaced.length)} ${unplaced.length===1?'устройству нужно':'устройствам нужно'} место</summary><div class="ep-detail-body"><p>Уменьшите количество или измените расположение оборудования.</p>${unplaced.map(i=>{const instance=getInstances(data,state).find(n=>n.id===i.id);return `<p>${esc(i.name||instance?.name||'Оборудование')}: ${esc(i.reason||'Не найдено свободное место в выбранной зоне.')}</p>`;}).join('')}</div></details>`:'';
  }
  function acceptPlacement(next) {
    report=next;
    const placed=(next.all||next).placed||[],positions={...state.positions};
    for(const item of placed) if((!item.seedPosition||state.positions[item.id]) && Number.isFinite(item.position?.x) && Number.isFinite(item.position?.z))positions[item.id]={...item.position};
    if(JSON.stringify(positions)!==JSON.stringify(state.positions)){state=normalizeState(data,{...state,positions});persist();syncSplitMap();}
    renderPlacement();
  }
  function renderSelection() {
    const instance=getInstances(data,state).find(i=>i.id===selectedId),el=$('#ep-selection');el.hidden=!instance;if(!instance)return;
    const g=data.groups.find(g=>g.id===instance.groupId),one=getUnitMetrics(data,g);
    const cols=one.cabinetColumns,rows=one.cabinetRows;
    el.innerHTML=`<h3>${esc(groupName(g))}</h3><p>${esc(g.exhibitName||g.hallName||scopeName())}</p><div class="ep-basis"><span>${one.screens?'Изображение':'Габариты'}: ${esc(dimensions(g))}</span>${one.screens&&dimensions(g)!==dimensions(g,false)?`<span>Габариты: ${esc(dimensions(g,false))}</span>`:''}${one.pixelWidth&&one.pixelHeight?`<span>${nf(one.pixelWidth)} × ${nf(one.pixelHeight)} пикселей</span>`:''}${one.ledCabinets?`<span>${nf(one.ledCabinets)} LED-кабинетов</span>`:''}${one.interactivePlaces?`<span>${nf(one.interactivePlaces)} активных мест</span>`:''}</div>${one.ledCabinets&&cols*rows<=300?`<div class="ep-led-grid" style="grid-template-columns:repeat(${cols},1fr)" aria-label="${cols} колонок и ${rows} рядов LED-кабинетов">${Array.from({length:cols*rows},()=>'<span class="ep-led-cell"></span>').join('')}</div><p class="ep-note">${cols} колонок × ${rows} рядов</p>`:''}<p class="ep-note">${esc((g.contentIds||[]).map(id=>data.content.find(c=>c.id===id)?.title).filter(Boolean).join(' · '))}</p>`;
  }
  function render(rebuildEditor=true) {
    const focused=document.activeElement,focus=focused?.dataset?.equipmentCount?{group:focused.dataset.equipmentCount,location:focused.dataset.location,value:focused.value}:null;
    const openSections=new Map(Array.from(root.querySelectorAll('[data-section]'),n=>[n.dataset.section,n.open]));
    renderSummary();if(rebuildEditor)renderEditor();syncInputs();
    if(view==='equipment')renderEquipment();if(view==='content')renderContent();if(view==='basis')renderBasis();
    for(const key of views){$(`#ep-panel-${key}`).hidden=key!==view;const tab=$(`#ep-tab-${key}`);tab.setAttribute('aria-selected',String(key===view));tab.tabIndex=key===view?0:-1;}
    root.querySelector('[data-action="undo"]').disabled=!history.length;root.querySelector('[data-action="redo"]').disabled=!future.length;
    walk?.setHistory?.({canUndo:!!history.length,canRedo:!!future.length});
    map?.update(mapState());syncSplitMap();renderPlacement();renderSelection();
    for(const node of root.querySelectorAll('[data-section]'))if(openSections.has(node.dataset.section))node.open=openSections.get(node.dataset.section);
    if(focus){const replacement=Array.from(root.querySelectorAll('[data-equipment-count]')).find(n=>n.dataset.equipmentCount===focus.group&&n.dataset.location===focus.location);if(replacement){replacement.value=focus.value;replacement.focus({preventScroll:true});}}
  }
  function selectScope(next) {if(next.hallId){const hall=data.halls.find(h=>h.id===next.hallId||h.id===`RGO-${next.hallId}`);if(hall)next={...next,hallId:hall.id};}if(next.floorId)mapFloor=next.floorId;scope={...scope,...next,floorId:null};if(scope.hallId||scope.regionId==='rgo')mapFloor='main';exhibitId='';selectedId='';lastEdit=null;renderSelectors();persist();render(true);updateWalkScope();}
  function undo() {if(!history.length)return;future.push(copy(state));state=history.pop();lastEdit=null;persist();render(true);announce('Последнее изменение отменено.');}
  function redo() {if(!future.length)return;history.push(copy(state));state=future.pop();lastEdit=null;persist();render(true);announce('Изменение восстановлено.');}
  function selectView(next) {if(!views.includes(next))return;view=next;render(false);}
  function exportCSV() {
    const rows=[['Зона','Зал','Экспонат','Оборудование','Количество','Ширина, м','Высота, м','Экраны','LED-кабинеты','Площадь изображения, м²','Активные места','Контент']];
    for(const g of data.groups.filter(g=>quantity(g)>0)){const s=getSummary({...data,groups:[g]},state,{});rows.push([data.regions.find(r=>r.id===g.regionId)?.name,g.hallName||'',g.exhibitName||'',g.name,quantity(g),g.dimensions?.widthM,g.dimensions?.heightM,s.screens,s.ledCabinets,s.screenAreaM2,s.interactivePlaces,(g.contentIds||[]).map(id=>data.content.find(c=>c.id===id)?.title).filter(Boolean).join(' / ')]);}
    const csv='\uFEFF'+rows.map(row=>row.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
    const link=document.createElement('a'),href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));link.href=href;link.download='park-equipment.csv';link.click();setTimeout(()=>URL.revokeObjectURL(href),1000);announce('Ведомость оборудования сохранена.');
  }
  async function share() {
    const target=new URL(locationObject.href);for(const k of ['parkInstallations','parkAnswers','equipmentView','rgo','installationsView'])target.searchParams.delete(k);
    target.searchParams.set('equipmentPlan',encodeEquipmentVariant(savedVariant()));target.hash='installations';
    try {await navigator.clipboard.writeText(target.href);announce('Ссылка на этот вариант скопирована.');}
    catch {const box=$('#ep-share-fallback');box.hidden=false;const input=box.querySelector('input');input.value=target.href;input.focus();input.select();announce('Скопируйте ссылку из поля.');}
  }
  function open3D() {
    persist();
    const focus={id:selectedId||null,regionId:scope.regionId,hallId:scope.hallId,floorId:mapFloor};
    channel?.focus(focus);
    const frame=root.ownerDocument.getElementById('park-tour');
    if(frame){locationObject.hash='tour';return;}
    const target=new URL('../tour/',import.meta.url);
    target.searchParams.set('equipmentPlan',encodeEquipmentVariant(savedVariant()));
    if(selectedId)target.searchParams.set('equipmentFocus',selectedId);
    else if(scope.regionId)target.searchParams.set('section',scope.regionId==='rgo'?'rgo':'zone:'+scope.regionId);
    if(scope.hallId)target.searchParams.set('rgo',scope.hallId.replace('RGO-',''));
    root.ownerDocument.defaultView?.open(target.href,'_blank','noopener');
  }
  on($('#ep-region'),'change',e=>selectScope({regionId:e.target.value||null,hallId:null}));
  on($('#ep-hall'),'change',e=>selectScope({hallId:e.target.value||null,floorId:'main'}));
  on($('#ep-floor'),'change',e=>{mapFloor=e.target.value;selectedId='';persist();render(false);updateWalkScope();});
  on($('#ep-exhibit'),'change',e=>{exhibitId=e.target.value;selectedId='';persist();render(true);});
  on(root,'input',e=>{const input=e.target.closest('[data-equipment-count]');if(!input)return;const valid=input.value!==''&&Number.isInteger(Number(input.value))&&Number(input.value)>=0&&Number(input.value)<=Number(input.max);input.setAttribute('aria-invalid',String(!valid));if(valid)changeQuantity(input.dataset.equipmentCount,Number(input.value),true);});
  on(root,'change',e=>{const input=e.target.closest('[data-equipment-count]');if(!input)return;const g=data.groups.find(g=>g.id===input.dataset.equipmentCount);if(!g)return;if(input.value===''||!Number.isInteger(Number(input.value))||Number(input.value)<0||Number(input.value)>Number(input.max)){input.value=quantity(g);announce(`Введите целое количество от 0 до ${g.maxQuantity??99}.`);}input.removeAttribute('aria-invalid');});
  on(root,'click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.view){selectView(b.dataset.view);return;}
    if(b.dataset.countStep){const g=data.groups.find(g=>g.id===b.dataset.group);if(g)changeQuantity(g.id,quantity(g)+Number(b.dataset.countStep));return;}
    if(b.dataset.showGroup){const i=getInstances(data,state).find(i=>i.groupId===b.dataset.showGroup);if(i){selectedId=i.id;mapFloor=i.floorId;$('#ep-floor').value=mapFloor;view='plan';render(false);}return;}
    if(b.dataset.region){selectScope({regionId:b.dataset.region,hallId:b.dataset.hall||null});selectView('plan');return;}
    const action=b.dataset.action;
    if(action==='3d'){open3D();return;}
    if(action==='add'){const g=data.groups.find(g=>g.id===$('#ep-add-type')?.value);if(g){mapFloor=g.floorId;$('#ep-floor').value=mapFloor;commit(setQuantity(data,state,g.id,1),{refreshEditor:true,message:`Добавлено: ${groupName(g)}.`});selectedId=getInstances(data,state).find(i=>i.groupId===g.id)?.id||'';render(true);}return;}
    if(action==='undo')undo();
    if(action==='redo')redo();
    if(action==='reset')commit(copy(baseline),{refreshEditor:true,message:'Восстановлено начальное оснащение. Его можно вернуть кнопкой «Отменить».'});
    if(action==='share')share();if(action==='csv')exportCSV();
  });
  on(root,'keydown',e=>{const tab=e.target.closest('[role="tab"]');if(!tab)return;let n=views.indexOf(tab.dataset.view);if(e.key==='ArrowRight')n=(n+1)%views.length;else if(e.key==='ArrowLeft')n=(n+views.length-1)%views.length;else if(e.key==='Home')n=0;else if(e.key==='End')n=views.length-1;else return;e.preventDefault();selectView(views[n]);$(`#ep-tab-${views[n]}`).focus();});
  channel=createEquipmentChannel({data,variant:restored.variant,storage:safeStorage,windowObject:root.ownerDocument.defaultView,
    onVariant(next){
      const checked=normalizeState(data,next.state);if(JSON.stringify(checked)===JSON.stringify(state))return;
      history.push(copy(state));if(history.length>60)history.shift();future=[];lastEdit=null;state=checked;
      if(selectedId&&!getInstances(data,state).some(i=>i.id===selectedId))selectedId='';
      applyingRemote=true;renderSelectors();render(true);applyingRemote=false;
      announce('Расстановка обновлена из 3D или другой открытой вкладки.');
    },onStatus(message){$('#ep-save-status').textContent=message;announce(message);},onStorageError(){ $('#ep-save-status').textContent='Изменения видны на плане и в 3D, но браузер их не сохранил. Используйте «Ссылка на вариант».'; }
  });
  if(restored.shared&&restored.restored){channel.publish(savedVariant(),{force:true});consumeEquipmentShare(root.ownerDocument.defaultView,locationObject);}
  renderSelectors();
  splitScope=walkScope();
  walk=walkFactory($('#ep-walk'),{scope:splitScope,label:walkLabel(),
    onSplitChange(visible,{mount,scope:nextScope}){if(visible){splitScope={...nextScope};ensureSplitMap(mount);}},
    onMapSuspend:suspendSplitMap,onMapResize:()=>splitMap?.refreshLayout?.(),onUndo:undo,onRedo:redo});
  render(true);
  map=mapFactory($('#ep-map'),{onSelect:id=>selectEquipment(map,id),onMove:moveEquipment,onPreview:previewEquipment,onPreviewEnd:endEquipmentPreview,onScopeChange:next=>selectScope(next),onReport:acceptPlacement});
  map?.update(mapState());
  if(map?.ready) Promise.resolve(map.ready).then(()=>{if(destroyed)return;report=map.getPlacementReport?.()||report;renderPlacement();}).catch(()=>{if(!destroyed)$('#ep-placement-status').textContent='План здания не загрузился. Количества и ведомость доступны; обновите страницу, чтобы повторить.';});
  if(restoreMessage)announce(restoreMessage);
  channel.request();
  return {getState:()=>copy(state),getScope:()=>({...scope}),getSummary:summary,setQuantity:(id,n)=>changeQuantity(id,n),selectScope,selectView,getPlacementReport:()=>report,destroy(){destroyed=true;abort.abort();walk?.destroy();splitMap?.destroy();map?.destroy();channel?.dispose();clearTimeout(announcementTimer);clearTimeout(clearAnnouncementTimer);root.remove();}};
}

const mount = typeof document!=='undefined' ? document.getElementById('park-installations') : null;
if(mount) {
  mount.innerHTML='<div class="equipment-planner"><h2 id="installations-title">Расчёт инсталляций</h2><p class="ep-status" role="status">Загружаем план и оборудование…</p></div>';
  fetch(new URL('./equipment-data.json?v=equipment-3d-20261125',import.meta.url)).then(r=>{if(!r.ok)throw Error('data');return r.json();}).then(data=>{createEquipmentPlanner(mount,{data});}).catch(()=>{mount.innerHTML='<div class="equipment-planner"><h2 id="installations-title">Расчёт инсталляций</h2><p class="ep-error" role="alert">Не удалось загрузить план оборудования. Обновите страницу.</p></div>';});
}
