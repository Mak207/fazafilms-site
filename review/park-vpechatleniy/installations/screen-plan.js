import { DEFAULT_SCREEN_INPUT } from './engineering/screen-model.js';
import { ZONE_NAME_STATUS, zoneName, zoneSearchTerms, existingObjectInfo, sceneName, normalizeSearch } from './zone-names.js?v=20261124-led-zones1';

const NS = 'http://www.w3.org/2000/svg';
const CATEGORY = {
  hero: { label: 'Главные', singular: 'Главная инсталляция', color: '#ffbd66', code:'Г', icon: 'M7 2H17L23 12L17 22H7L1 12Z' },
  interactive: { label: 'Интерактивы', singular: 'Интерактивная установка', color: '#68b7ff', code:'И', icon: 'M2 2H22V22H2Z' },
  media: { label: 'Медиаточки', singular: 'Медийная установка', color: '#c4a0ff', code:'М', icon: 'M5 2H19L23 22H1Z' },
  common: { label: 'Общие', singular: 'Общая установка', color: '#55d4b0', code:'О', icon: 'M12 1L23 12L12 23L1 12Z' },
  navigation: { label: 'Навигация', singular: 'Навигационная точка', color: '#ff91b6', code:'Н', icon: 'M2 2H15L23 12L15 22H2Z' },
};
const KIND = { exhibit: 'Экспонат — геометрический прокси', 'monorail-column': 'Колонна монорельса — прокси', 'monorail-foot': 'Основание монорельса — прокси' };
const BASE_FLOW = { guidedFlow: 300, independentFlow: 500, guidedMinutes: 240, independentMinutes: 120, groupSize: 30, usersPerStation: 6, guidedParticipation: 40, independentParticipation: 40, experienceMinutes: 2, turnoverSeconds: 15, targetUtilization: 80 };
const nf = (v, digits = 0) => Number.isFinite(Number(v)) && v !== null ? Number(v).toLocaleString('ru-RU', { maximumFractionDigits: digits }) : 'не задано';
const num = v => typeof v === 'number' && Number.isFinite(v);
const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
const svgNode = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); for (const [k,v] of Object.entries(attrs)) n.setAttribute(k, String(v)); return n; };
const button = (text, cls = 'fsp-button') => { const n = node('button', cls, text); n.type = 'button'; return n; };
function icon(category, map=false) {
  const n = svgNode('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', class: map?'fsp-map-glyph':'fsp-icon' });
  n.append(svgNode('path', { d: CATEGORY[category].icon, fill: '#10291e', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  const letter=svgNode('text',{x:12,y:15.7,'text-anchor':'middle','font-size':11,'font-family':'Arial, sans-serif','font-weight':700,fill:'currentColor'});letter.textContent=CATEGORY[category].code;n.append(letter);
  return n;
}
function coords(g, visit) {
  if (!g) return;
  if (g.type === 'GeometryCollection') { (g.geometries || []).forEach(x => coords(x, visit)); return; }
  const walk = x => { if (Array.isArray(x) && num(x[0]) && num(x[1])) visit(x); else if (Array.isArray(x)) x.forEach(walk); };
  walk(g.coordinates);
}
function bounds(g) {
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  coords(g, p => { x0=Math.min(x0,p[0]);y0=Math.min(y0,p[1]);x1=Math.max(x1,p[0]);y1=Math.max(y1,p[1]); });
  return Number.isFinite(x0) ? [x0,y0,x1,y1] : [0,0,1,1];
}
function geometryPath(g, rotate) {
  if (!g) return '';
  const pair = p => rotate ? `${p[1]} ${-p[0]}` : `${p[0]} ${p[1]}`;
  const line = a => a?.length ? `M${a.map(pair).join('L')}` : '';
  if (g.type==='Polygon') return g.coordinates.map(r=>line(r)+'Z').join(' ');
  if (g.type==='MultiPolygon') return g.coordinates.map(p=>p.map(r=>line(r)+'Z').join(' ')).join(' ');
  if (g.type==='LineString') return line(g.coordinates);
  if (g.type==='MultiLineString') return g.coordinates.map(line).join(' ');
  if (g.type==='GeometryCollection') return (g.geometries||[]).map(x=>geometryPath(x,rotate)).join(' ');
  return '';
}
function validGeometry(g) {
  if (!g || !['Polygon','MultiPolygon','LineString','MultiLineString','GeometryCollection'].includes(g.type)) return false;
  let count=0,valid=true;coords(g,p=>{ count++;if(!p.every(num)||Math.abs(p[0])>1e7||Math.abs(p[1])>1e7)valid=false; });
  return valid && (count>0 || (g.type==='GeometryCollection' && !g.geometries?.length));
}
function validateData(d) {
  if (d?.schema!=='faza.screen-placement.candidates' || d.version!==1 || !Array.isArray(d.floors) || !Array.isArray(d.placements) || !Array.isArray(d.unplaced) || !d.summary) throw new Error('Неизвестный формат геометрии.');
  if (!d.floors.length || !d.floors.every(f=>typeof f.id==='string'&&validGeometry(f.floor))) throw new Error('Нет проверяемых контуров этажей.');
  if (!d.placements.every(p=>CATEGORY[p.category]&&typeof p.id==='string'&&validGeometry(p.parts?.equipment)&&validGeometry(p.parts?.envelope)&&Array.isArray(p.screenLines)&&p.screenLines.every(l=>validGeometry(l.geometry)))) throw new Error('Неполная геометрия экранных сцен.');
  if (new Set(d.placements.map(p=>p.id)).size!==d.placements.length) throw new Error('Повторяются номера сцен.');
  return d;
}

/**
 * Mount next to installations/app.js; link screen-plan.css in the host page.
 * Data are immutable placement candidates, never visitor markers.
 * @param {HTMLElement} container
 * @param {{onOpenEngineering?:Function,geometryURLs?:{A?:string|URL,B?:string|URL}}} options
 * @returns {{update:({result,input,screenTypes,ledReport}?:Object)=>void,destroy:()=>void}}
 */
export function createScreenPlan(container, { onOpenEngineering, geometryURLs = {} } = {}) {
  if (!(container instanceof HTMLElement)) throw new TypeError('Нужен контейнер схемы.');
  const abort = new AbortController();
  const on = (n,event,fn,opts={}) => n.addEventListener(event,fn,{...opts,signal:abort.signal});
  const data = {}, failures = {};
  let state={ledReport:null},variant='B',floorId='main',selected=null,selectedZone=null,records=[],rotate=true,zoom=1,destroyed=false,hoverTarget=null,tipFocusOwner=null,resizeObserver,tipTimer;
  let currentBounds=[0,0,1,1], currentRecordNodes=new Map();
  const root = node('section','faza-screen-plan');
  root.setAttribute('aria-label','План экранов и интерактивов');
  const heading=node('div','fsp-heading');
  const headingText=node('div');
  headingText.append(node('p','fsp-eyebrow','Координаты экранных сцен'),node('h3','fsp-title','План экранов и интерактивов'),node('p','fsp-intro','Наведите на объект для подсказки. Нажмите, чтобы открыть его размеры и состав.'));
  const engineering=button('Размеры и электрика','fsp-button fsp-open');
  on(engineering,'click',()=>{ if(typeof onOpenEngineering==='function')onOpenEngineering();else window.open(new URL('./engineering/',import.meta.url).href,'_blank','noopener'); });
  heading.append(headingText,engineering);root.append(heading);

  const legend=node('ul','fsp-legend');legend.setAttribute('aria-label','Постоянная легенда типов объектов');
  for(const [key,c] of Object.entries(CATEGORY)){ const li=node('li');li.style.setProperty('--fsp-category',c.color);li.append(icon(key),node('span','',c.label));legend.append(li); }
  const neutral=node('li');neutral.append(node('span','fsp-existing-key'),node('span','','Существующие объекты'));legend.append(neutral);
  root.append(legend);
  const status=node('p','fsp-status','Загружаем координаты экранов…');status.setAttribute('role','status');root.append(status);
  const stale=node('details','fsp-stale'),staleSummary=node('summary','fsp-stale-summary'),staleHeadline=node('span','fsp-stale-headline'),staleBody=node('div','fsp-stale-body');
  stale.hidden=true;staleHeadline.setAttribute('role','status');staleHeadline.setAttribute('aria-atomic','true');
  staleSummary.append(staleHeadline);stale.append(staleSummary,staleBody);root.append(stale);
  const toolbar=node('div','fsp-toolbar');
  const floors=node('div','fsp-segmented');floors.setAttribute('role','group');floors.setAttribute('aria-label','Уровень здания');
  const floorButtons={};
  for(const [id,label] of [['main','Нижний уровень'],['upper','Верхний уровень']]){ const b=button(label);b.setAttribute('aria-pressed',String(id===floorId));on(b,'click',()=>{floorId=id;selected=null;selectedZone=null;zoom=1;search.value='';render();});floorButtons[id]=b;floors.append(b); }
  const variantLabel=node('label','fsp-field');variantLabel.append(node('span','','Компоновка'));
  const variantSelect=node('select');variantSelect.setAttribute('aria-label','Компоновка экранных сцен');
  for(const [value,text] of [['B','B · главные экраны в U'],['A','A · главные экраны в ряд']]){const o=node('option','',text);o.value=value;variantSelect.append(o);}variantLabel.append(variantSelect);
  on(variantSelect,'change',()=>{variant=variantSelect.value;selected=null;selectedZone=null;zoom=1;search.value='';render();});
  function check(label,checked){const l=node('label','fsp-check'),input=node('input');input.type='checkbox';input.checked=checked;l.append(input,node('span','',label));return{label:l,input};}
  const zones=check('Зоны зрителей и сервиса',false),existing=check('Существующие объекты',true),zoneLabels=check('Названия зон',true);
  on(zones.input,'change',renderMap);on(existing.input,'change',()=>{if(!existing.input.checked&&selected?.kind==='existing')clearSelection();renderMap();renderList();});
  on(zoneLabels.input,'change',renderMap);
  const extraOptions=node('details','fsp-options');
  const extraTitle=node('summary','','Слои и компоновка · B');
  const extraBody=node('div','fsp-options-body');
  const extraMeta=node('p','fsp-options-meta');
  extraBody.append(variantLabel,zoneLabels.label,zones.label,existing.label,extraMeta);
  extraOptions.append(extraTitle,extraBody);
  toolbar.append(floors,extraOptions);root.append(toolbar);
  const floorInfo=node('p','fsp-floor-info');root.append(floorInfo);

  const layout=node('div','fsp-layout'),mapColumn=node('div','fsp-map-column');
  const mapTools=node('div','fsp-map-tools');
  const minus=button('−'),plus=button('+'),reset=button('Весь этаж'),focus=button('К выбранному');
  minus.setAttribute('aria-label','Уменьшить план');plus.setAttribute('aria-label','Увеличить план');focus.disabled=true;
  const zoomValue=node('span','fsp-zoom','100%');
  mapTools.append(minus,zoomValue,plus,reset,focus);
  const stage=node('div','fsp-stage');
  const scroll=node('div','fsp-scroll');scroll.setAttribute('tabindex','0');scroll.setAttribute('aria-label','План. Для масштаба используйте кнопки; увеличенный план можно прокручивать.');
  const svg=svgNode('svg',{class:'fsp-map',role:'group','aria-label':'Экранные сцены и существующая геометрия в метрах'});scroll.append(svg);stage.append(scroll);
  const tooltip=node('div','fsp-tooltip');tooltip.hidden=true;tooltip.setAttribute('role','tooltip');
  tooltip.id=`fsp-tip-${Math.random().toString(36).slice(2,10)}`;
  stage.append(tooltip);
  const mapHint=node('p','fsp-map-hint','Названия округов — рабочее назначение условных точек, не границы. Нажмите на название, чтобы выделить его сцены. Tab — переход к объекту, Enter — сведения, Esc — снять выбор.');
  mapColumn.append(mapTools,stage,mapHint);
  const sidebar=node('aside','fsp-sidebar');
  const zonePickerLabel=node('label','fsp-zone-picker');zonePickerLabel.append(node('span','','Зона / округ'));
  const zonePicker=node('select');zonePicker.setAttribute('aria-label','Выбор рабочей зоны');zonePickerLabel.append(zonePicker);
  on(zonePicker,'change',()=>{const r=zoneRecords().find(r=>r.item.id===zonePicker.value);if(r)select(r);else clearSelection();});
  const searchLabel=node('label','fsp-search');searchLabel.append(node('span','','Найти округ, тип, объект или ID'));
  const search=node('input');search.type='search';search.placeholder='Сибирский, интерактив, МС-21…';search.autocomplete='off';searchLabel.append(search);
  const list=node('div','fsp-object-list');list.setAttribute('aria-label','Выбор объекта по номеру');
  const listStatus=node('p','fsp-list-status');listStatus.setAttribute('role','status');
  const inspector=node('div','fsp-inspector');inspector.setAttribute('aria-live','polite');
  sidebar.append(zonePickerLabel,searchLabel,listStatus,list,inspector);layout.append(mapColumn,sidebar);root.append(layout);
  const unplaced=node('details','fsp-unplaced'),unplacedTitle=node('summary'),unplacedBody=node('div','fsp-unplaced-body');
  unplaced.append(unplacedTitle,unplacedBody);root.append(unplaced);
  const disclaimer=node('p','fsp-disclaimer','Кандидаты размещения, не монтажный план. Эвакуация, доступность, боковой обзор, высота, крепления и питание требуют проверки. 18 884,055 м² — общая площадь модели. Предметные экспонаты повторно не добавлены.');root.append(disclaimer);
  container.append(root);
  const optionsMedia=typeof window.matchMedia==='function'?window.matchMedia('(max-width: 760px)'):null;
  const adaptOptions=()=>{
    const mobile=Boolean(optionsMedia?.matches);
    extraOptions.open=!mobile;
    (mobile?extraBody:heading).append(engineering);
  };
  adaptOptions();
  if(optionsMedia)on(optionsMedia,'change',adaptOptions);

  function recordLabel(r){
    if(r.kind==='scene')return `${sceneName(r.item)} · ${r.item.id}`;
    if(r.kind==='zone')return `${zoneName(r.item.id)} · ${r.item.id}`;
    if(r.kind==='existing')return `${existingObjectInfo(r.item)?.label||KIND[r.item.kind]||r.item.kind||'Существующий объект'} · ${r.item.id}`;
    if(r.kind==='floor')return `${r.item.name} · контур пола`;
    return 'Резервы лестниц и лифтов';
  }
  function shortInfo(r){
    const p=r.item;
    if(r.kind==='scene')return `${recordLabel(r)}. Поверхностей: ${nf(p.surfaces)}, каждая ${nf(p.surfaceWidthM,2)} × ${nf(p.surfaceHeightM,2)} м. Кандидат, не утверждено.`;
    if(r.kind==='zone'){const s=zoneStats(p.id);return `${recordLabel(r)}. ${ZONE_NAME_STATUS}. Найдено ${s.placedScenes} из ${s.requestedScenes} экранных сцен, ${s.placedSurfaces} из ${s.requestedSurfaces} поверхностей.`;}
    if(r.kind==='existing'){const info=existingObjectInfo(p);return `${recordLabel(r)}. ${info?info.source:'Тип из исходной модели; точное название не задано.'}${info?.note?' '+info.note:''}`;}
    if(r.kind==='floor')return `${recordLabel(r)}. ${nf(p.grossAreaM2,3)} м² общей площади; отметка Y ${nf(p.floorY,1)} м. Полезная площадь и вместимость этим не определены.`;
    return 'Объединённая геометрия существующих лестниц, лифтов и условных резервов. Отдельные номера переходов в этом слое отсутствуют; это не утверждённый эвакуационный маршрут.';
  }
  function getFloor(){return data[variant]?.floors.find(f=>f.id===floorId)||data[variant]?.floors[0];}
  function zoneStats(id){
    const g=data[variant],placed=(g?.placements||[]).filter(p=>p.sectorId===id),unplaced=(g?.unplaced||[]).filter(p=>p.sectorId===id);
    const sum=rows=>rows.reduce((n,p)=>n+(p.surfaces||0),0);
    return {placed,unplaced,placedScenes:placed.length,requestedScenes:placed.length+unplaced.length,placedSurfaces:sum(placed),requestedSurfaces:sum(placed)+sum(unplaced)};
  }
  function zoneRecords(){return (data[variant]?.sectorHypotheses||[]).filter(s=>Array.isArray(s.targetXZ)&&s.targetXZ.every(num)).map(s=>{
    const members=zoneStats(s.id).placed;
    return {key:`zone:${s.id}`,kind:'zone',item:s,geometry:members.length?{type:'GeometryCollection',geometries:members.map(p=>p.parts.envelope)}:{type:'Point',coordinates:s.targetXZ}};
  });}
  function makeRecords(){
    const g=data[variant],f=getFloor();if(!g||!f)return[];
    const out=[{key:`floor:${f.id}`,kind:'floor',item:f,geometry:f.floor}];
    if(validGeometry(f.reservedTransitions))out.push({key:`transitions:${f.id}`,kind:'transition',item:f,geometry:f.reservedTransitions});
    for(const p of f.existingObjects||[])if(validGeometry(p.geometry))out.push({key:`existing:${f.id}:${p.id}`,kind:'existing',item:p,geometry:p.geometry});
    for(const p of g.placements.filter(p=>p.floorId===f.id))out.push({key:`scene:${p.id}`,kind:'scene',item:p,geometry:p.parts.envelope});
    out.push(...zoneRecords().filter(r=>r.item.floorId===f.id));
    return out;
  }
  function cancelTipTimer(){if(tipTimer!==undefined){clearTimeout(tipTimer);tipTimer=undefined;}}
  function hideTip(){cancelTipTimer();tooltip.hidden=true;if(hoverTarget)hoverTarget.removeAttribute('aria-describedby');if(tipFocusOwner)tipFocusOwner.removeAttribute('aria-describedby');hoverTarget=null;tipFocusOwner=null;}
  function scheduleHideTip(){cancelTipTimer();tipTimer=setTimeout(()=>{tipTimer=undefined;if(document.activeElement!==tipFocusOwner&&!tooltip.matches(':hover'))hideTip();},200);}
  function showTip(r,target,event,focusOwner=target){
    if(destroyed)return;hideTip();tooltip.textContent=shortInfo(r);tooltip.hidden=false;hoverTarget=target;tipFocusOwner=focusOwner;focusOwner.setAttribute('aria-describedby',tooltip.id);
    const a=stage.getBoundingClientRect(),b=target.getBoundingClientRect();
    const x=event?.clientX??(b.left+b.width/2),y=event?.clientY??Math.max(a.top+8,b.top);
    const w=tooltip.offsetWidth,h=tooltip.offsetHeight;
    const left=Math.max(8,Math.min(a.width-w-8,x-a.left+12));
    const wantedTop=y-a.top+h+20<a.height?y-a.top+15:y-a.top-h-12;
    const top=Math.max(8,Math.min(a.height-h-8,wantedTop));
    tooltip.style.left=`${left}px`;tooltip.style.top=`${top}px`;
  }
  function bindRecord(target,r){
    target.dataset.record=r.key;target.setAttribute('tabindex','0');target.setAttribute('role','button');target.setAttribute('aria-label',shortInfo(r));target.setAttribute('aria-pressed',String(selected?.key===r.key));
    const title=svgNode('title');title.textContent=shortInfo(r);target.append(title);
    // These nodes are replaced on map redraw, so listeners do not survive that redraw.
    target.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch')showTip(r,target,e);});
    target.addEventListener('pointerleave',scheduleHideTip);
    target.addEventListener('focus',()=>showTip(r,target));target.addEventListener('blur',scheduleHideTip);
    target.addEventListener('click',e=>{e.stopPropagation();select(r);showTip(r,target,e);});
    target.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(r);showTip(r,target);} });
    currentRecordNodes.set(r.key,target);
  }
  function path(g,cls){return svgNode('path',{d:geometryPath(g,rotate),class:cls,'fill-rule':'evenodd','vector-effect':'non-scaling-stroke'});}
  function projectedBounds(g){const b=bounds(g);return rotate?[b[1],-b[2],b[3],-b[0]]:b;}
  function wantsRotation(){const w=stage.clientWidth;return w>0?(rotate?w>=540:w>=580):rotate;}
  function renderMap(){
    if(destroyed)return;hideTip();svg.replaceChildren();currentRecordNodes=new Map();
    const f=getFloor();if(!f)return;
    rotate=wantsRotation();stage.dataset.orientation=rotate?'landscape':'portrait';
    const b=projectedBounds(f.floor),pad=3;currentBounds=[b[0]-pad,b[1]-pad,b[2]-b[0]+2*pad,b[3]-b[1]+2*pad];
    svg.setAttribute('viewBox',currentBounds.join(' '));svg.style.aspectRatio=`${currentBounds[2]} / ${currentBounds[3]}`;
    stage.style.aspectRatio=`${currentBounds[2]} / ${currentBounds[3]}`;
    const title=svgNode('title');title.textContent=`${f.name}. Экраны и оборудование: вариант ${variant}. Все позиции — кандидаты.`;
    const desc=svgNode('desc');desc.textContent='Цвет обозначает тип сцены. Существующие объекты серые, объединённые резервы переходов — штриховые. Маркеров посетителей на этом плане нет.';svg.append(title,desc);
    for(const r of records){
      // Zone records contain member envelopes for focus bounds only, never boundaries to draw.
      if(r.kind==='zone')continue;
      if(r.kind==='existing'&&!existing.input.checked)continue;
      const g=svgNode('g',{class:`fsp-map-object fsp-${r.kind}`});
      if(r.kind==='scene'){
        const p=r.item;g.style.setProperty('--fsp-category',CATEGORY[p.category].color);
        if(zones.input.checked){g.append(path(p.parts.envelope,'fsp-envelope'));for(const name of ['viewers','service','queue'])if(p.parts[name])g.append(path(p.parts[name],`fsp-zone fsp-zone-${name}`));}
        g.append(path(p.parts.equipment,'fsp-hit'),path(p.parts.equipment,'fsp-equipment'));
        for(const line of p.screenLines)g.append(path(line.geometry,'fsp-screen-hit'),path(line.geometry,'fsp-screen-outline'),path(line.geometry,'fsp-screen-line'));
        const glyph=icon(p.category,true),a=p.floorAnchorXYZ;glyph.dataset.x=String(rotate?a[2]:a[0]);glyph.dataset.y=String(rotate?-a[0]:a[2]);g.append(glyph);
      }else g.append(path(r.geometry,r.kind==='floor'?'fsp-floor-shape':r.kind==='existing'?'fsp-existing-shape':'fsp-transition-shape'));
      bindRecord(g,r);svg.append(g);
    }
    if(zoneLabels.input.checked)for(const [index,r] of records.filter(r=>r.kind==='zone').entries()){
      const p=r.item,s=zoneStats(p.id),g=svgNode('g',{class:'fsp-map-object fsp-sector-label'}),[x,z]=p.targetXZ;
      g.dataset.x=String(rotate?z:x);g.dataset.y=String(rotate?-x:z);g.dataset.order=String(index);
      const leader=svgNode('path',{class:'fsp-sector-leader','vector-effect':'non-scaling-stroke'});
      const anchor=svgNode('path',{class:'fsp-sector-anchor','vector-effect':'non-scaling-stroke'});
      const label=svgNode('svg',{class:'fsp-sector-name',viewBox:'0 0 184 48','aria-hidden':'true'});
      label.append(svgNode('rect',{x:1,y:1,width:182,height:46,rx:7,class:'fsp-sector-box'}));
      const name=svgNode('text',{x:92,y:20,'text-anchor':'middle',class:'fsp-sector-title'});name.textContent=zoneName(p.id,true);
      const count=svgNode('text',{x:92,y:37,'text-anchor':'middle',class:'fsp-sector-count'});count.textContent=`${p.id} · ${s.placedScenes}/${s.requestedScenes} сцен`;
      label.append(name,count);g.append(leader,anchor,label);bindRecord(g,r);svg.append(g);
    }
    applySelection();applyZoom(false);renderInspector();
  }
  function applySelection(){
    for(const [key,n]of currentRecordNodes){
      const r=records.find(r=>r.key===key),member=r?.kind==='scene'&&r.item.sectorId===selectedZone;
      n.classList.toggle('is-selected',key===selected?.key);n.classList.toggle('is-in-zone',Boolean(selectedZone&&member));
      n.classList.toggle('is-outside-zone',Boolean(selectedZone&&r?.kind==='scene'&&!member));
      n.classList.toggle('is-active-zone',r?.kind==='zone'&&r.item.id===selectedZone);
      n.setAttribute('aria-pressed',String(key===selected?.key));
    }
    for(const b of list.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.record===selected?.key));
    zonePicker.value=selectedZone||'';
    focus.disabled=!selected;
  }
  function select(r){
    selected=r;
    if(r.kind==='zone'){
      selectedZone=r.item.id;search.value='';
      if(r.item.floorId!==floorId){floorId=r.item.floorId;zoom=1;render();return;}
    }else if(r.kind!=='scene'||r.item.sectorId!==selectedZone)selectedZone=null;
    renderList();applySelection();renderInspector();
  }
  function clearSelection(){selected=null;selectedZone=null;hideTip();renderList();applySelection();renderInspector();}
  function dlRow(dl,label,value){dl.append(node('dt','',label),node('dd','',value));}
  function ledMismatch(p,row){return num(row?.widthM)&&num(row?.heightM)&&(Math.abs(row.widthM-p.surfaceWidthM)>.001||Math.abs(row.heightM-p.surfaceHeightM)>.001);}
  function renderLedAssembly(p){
    const report=state.ledReport;if(!report)return;
    const section=node('section','fsp-led-assembly');section.append(node('h5','','Отдельно: LED-сборка'));
    const row=Array.isArray(report.rows)?report.rows.find(r=>r.key===p.category):null;
    if(report.valid!==true||!row){section.append(node('p','fsp-small-warning','Нет корректного расчёта LED-сборки для этого типа. Исходная геометрия плана сохранена.'));inspector.append(section);return;}
    const profile=report.profile||{},n=p.surfaces,product=(value,multiplier=n)=>num(value)&&num(multiplier)?value*multiplier:null;
    section.append(node('p','fsp-led-profile',profile.label||'Профиль кабинета не назван'));
    const dl=node('dl','fsp-facts');
    dlRow(dl,'Сетка одной поверхности',`${nf(row.columns)} × ${nf(row.rows)} кабинетов · ${nf(row.cabinetsPerSurface)} шт.`);
    dlRow(dl,'Размер LED-поверхности',`${nf(row.widthM,3)} × ${nf(row.heightM,3)} м`);
    dlRow(dl,'Разрешение поверхности',`${nf(row.pixelWidth)} × ${nf(row.pixelHeight)} пикселей`);
    dlRow(dl,`Для ${nf(n)} поверхностей сцены`,`${nf(product(row.cabinetsPerSurface))} кабинетов`);
    dlRow(dl,'Масса LED-кабинетов сцены',`${nf(product(row.massKg),1)} кг`);
    dlRow(dl,'Предел мощности LED по серии',`${nf(product(row.maximumW,n/1000),2)} кВт`);
    if(num(row.averageW))dlRow(dl,'Среднее LED по данным серии',`${nf(product(row.averageW,n/1000),2)} кВт`);
    if(profile.serviceLabel)dlRow(dl,'Обслуживание',profile.serviceLabel);
    section.append(dl);
    if(ledMismatch(p,row))section.append(node('p','fsp-small-warning','LED-сборка требует проверки размещения. Её размеры отличаются от исходного плана; контуры и позиции здесь не пересчитаны.'));
    else section.append(node('p','fsp-led-note','На карте сохранён исходный габарит. Совпадение размеров не подтверждает крепления, доступ для обслуживания или монтаж.'));
    section.append(node('p','fsp-led-note','Количество взято из выбранной исходной сцены. Масса без креплений; мощность относится только к LED-части, не ко всему оборудованию сцены.'));
    const sources=node('div','fsp-led-sources');
    for(const [href,label] of [[profile.sourceUrl,'Поставщик · спецификация'],[profile.manufacturerUrl,'Производитель · масса кабинета']]){
      if(typeof href!=='string')continue;
      try{const url=new URL(href);if(['http:','https:'].includes(url.protocol)){const a=node('a','fsp-led-source',label);a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';sources.append(a);}}catch{}
    }
    if(sources.children.length)section.append(sources);
    inspector.append(section);
  }
  function renderZoneInspector(p){
    const s=zoneStats(p.id),dl=node('dl','fsp-facts');
    inspector.append(node('p','fsp-small-warning',ZONE_NAME_STATUS+'. Подпись отмечает условную цель из геометрии; принадлежность сцен задана рабочим сектором, а не близостью к этой подписи.'));
    dlRow(dl,'Найденные сцены',`${s.placedScenes} / ${s.requestedScenes}`);dlRow(dl,'Найденные поверхности',`${s.placedSurfaces} / ${s.requestedSurfaces}`);
    dlRow(dl,'Уровень',p.floorId==='main'?'Нижний':'Верхний');inspector.append(dl);
    const table=node('table','fsp-zone-counts'),caption=node('caption','','Состав зоны: найдено / запрошено');table.append(caption);
    const head=node('thead'),hr=node('tr');for(const text of ['Тип','Сцены','Поверхности'])hr.append(node('th','',text));head.append(hr);table.append(head);
    const body=node('tbody');for(const key of ['hero','interactive','media']){
      const a=s.placed.filter(x=>x.category===key),b=s.unplaced.filter(x=>x.category===key),sum=rows=>rows.reduce((v,x)=>v+x.surfaces,0),tr=node('tr');
      const th=node('th','',CATEGORY[key].label);th.scope='row';tr.append(th,node('td','',`${a.length}/${a.length+b.length}`),node('td','',`${sum(a)}/${sum(a)+sum(b)}`));body.append(tr);
    }table.append(body);inspector.append(table);
    if(!s.placedScenes)inspector.append(node('p','fsp-small-warning','В этом варианте у зоны нет размещённых экранных сцен. Она остаётся в программе; подпись не означает заполненную экспозицию.'));
    if(s.unplaced.length)inspector.append(node('p','fsp-zone-missing',`Место не найдено: ${s.unplaced.map(x=>x.id).join(', ')}.`));
    const moved=s.placed.filter(x=>x.targetDeviationM>35).length;
    if(moved)inspector.append(node('p','',`У ${moved} сцен расстояние до условной цели больше 35 м. Тематическое соседство и маршрут не подтверждены.`));
  }
  function renderInspector(){
    inspector.replaceChildren();
    if(!selected){inspector.append(node('h4','','Что стоит на плане'),node('p','','Выберите экран, название округа или существующий объект. Здесь появятся его состав, размеры и ограничения.'));return;}
    const r=selected,p=r.item,h=node('div','fsp-inspector-head');h.append(node('h4','',recordLabel(r)));const close=button('×','fsp-close');close.setAttribute('aria-label','Снять выбор объекта');close.addEventListener('click',clearSelection);h.append(close);inspector.append(h);
    if(r.kind==='scene'){
      const badge=node('p','fsp-badge','Кандидат размещения');inspector.append(badge);const dl=node('dl','fsp-facts');
      dlRow(dl,'Габарит на исходном плане',`${nf(p.surfaces)} поверхности, каждая ${nf(p.surfaceWidthM,3)} × ${nf(p.surfaceHeightM,3)} м`);
      dlRow(dl,'Активное изображение',`${nf(p.activeImageAreaM2,2)} м²`);
      dlRow(dl,'Резерв всей сцены',`${nf(p.dimensionsM.width,2)} × ${nf(p.dimensionsM.depth,2)} м`);
      dlRow(dl,'X / Y / Z',p.floorAnchorXYZ.map(x=>nf(x,2)).join(' / ')+' м');
      dlRow(dl,'Граница зрительской зоны',`${nf(p.viewingNearM,1)}–${nf(p.viewingFarM,1)} м${p.scenarioOverride?' · фронтальное полотно':''}`);
      if(p.activeInputPlacesScenario!==null)dlRow(dl,'Активные места',`${nf(p.activeInputPlacesScenario)} · сценарий, интерфейс не проверен`);
      dlRow(dl,'Монтаж / питание','Не заданы');inspector.append(dl,node('p','',p.note||'Параметры требуют согласования.'));
      if(p.scenarioOverride)inspector.append(node('p','fsp-small-warning','Вариант B: фронтальная зона 1–6 м вместо базовой 3–10 м. Боковые места и вместимость не проверены.'));
      if(p.targetDeviationM>35)inspector.append(node('p','fsp-small-warning',`До условной цели территории ${nf(p.targetDeviationM,1)} м. Тематическое соседство и маршрут не подтверждены.`));
      if(p.sectorId)inspector.append(node('p','fsp-zone-note',`${zoneName(p.sectorId)} · ${p.sectorId}. ${ZONE_NAME_STATUS}.`));
      renderLedAssembly(p);
    }else if(r.kind==='zone'){
      renderZoneInspector(p);
    }else if(r.kind==='existing'){
      const info=existingObjectInfo(p),dl=node('dl','fsp-facts');dlRow(dl,'ID из модели',p.id);dlRow(dl,'Исходный тип',p.kind||'не задан');dlRow(dl,'Название объекта',info?.label||'В данных не указано');
      inspector.append(dl);if(info)inspector.append(node('p','',info.source));if(info?.note)inspector.append(node('p','fsp-small-warning',info.note));
      inspector.append(node('p','','Это существующий объект модели, не новый экран. Прокси описывает занятое место; несущую способность и точный паспорт он не подтверждает.'));
    }else if(r.kind==='floor'){
      const dl=node('dl','fsp-facts');dlRow(dl,'Общая площадь',`${nf(p.grossAreaM2,3)} м²`);dlRow(dl,'Отметка пола',`${nf(p.floorY,1)} м`);inspector.append(dl,node('p','','Контур из 3D-модели. Площадь экспонатов, оборудования и путей не вычтена; допустимая вместимость здесь не рассчитана.'));
    }else inspector.append(node('p','',shortInfo(r)),node('p','','Запасы вокруг порталов и очередей — допущения поиска. По этому объединённому слою нельзя восстановить отдельные номера лестниц или назвать утверждённую ширину прохода.'));
  }
  function renderList(){
    list.replaceChildren();const q=normalizeSearch(search.value),tokens=q.split(' ').filter(Boolean);
    const candidates=q?[...records.filter(r=>r.kind!=='zone'),...zoneRecords()]:records;
    const visible=candidates.filter(r=>r.kind!=='existing'||existing.input.checked).filter(r=>{
      if(!q)return r.kind==='scene'&&(!selectedZone||r.item.sectorId===selectedZone);
      const p=r.item,info=r.kind==='existing'?existingObjectInfo(p):null;
      const haystack=normalizeSearch([recordLabel(r),zoneSearchTerms(r.kind==='zone'?p.id:p.sectorId),CATEGORY[p.category]?.label,...(info?.aliases||[])].join(' '));
      return tokens.every(t=>haystack.includes(t));
    });
    listStatus.textContent=q?`Найдено: ${visible.length}. Названия округов ищутся на обоих уровнях.`:selectedZone?`${zoneName(selectedZone)}: ${visible.length} сцен.`:`Сцены на этом этаже: ${visible.length}. Выбор округа — на карте или в списке выше.`;
    for(const r of visible){const b=button('','fsp-object-button');b.dataset.record=r.key;b.setAttribute('aria-pressed',String(selected?.key===r.key));b.title=shortInfo(r);b.setAttribute('aria-label',shortInfo(r));
      const label=node('span','fsp-object-label');
      if(r.kind==='scene'){b.style.setProperty('--fsp-category',CATEGORY[r.item.category].color);b.append(icon(r.item.category));label.append(node('strong','',r.item.id),node('small','',sceneName(r.item)));}
      else if(r.kind==='zone')label.append(node('strong','',zoneName(r.item.id)),node('small','',`${r.item.id} · ${r.item.floorId==='main'?'нижний':'верхний'} уровень · ${zoneStats(r.item.id).placedScenes}/${zoneStats(r.item.id).requestedScenes} сцен`));
      else label.append(node('strong','',r.item.id||recordLabel(r)),node('small','',r.kind==='existing'?(existingObjectInfo(r.item)?.label||KIND[r.item.kind]||'Объект модели'):recordLabel(r)));
      b.append(label);
      b.addEventListener('click',()=>select(r));b.addEventListener('focus',()=>{const n=currentRecordNodes.get(r.key);if(n)showTip(r,n,undefined,b);});b.addEventListener('blur',scheduleHideTip);list.append(b);}
    if(!visible.length)list.append(node('p','fsp-empty',selectedZone&&!q?'В этом варианте у зоны нет размещённых сцен. Не найденные места перечислены в карточке.':'Нет совпадений. Проверьте имя, тип или ID; для поиска отдельных объектов можно переключить уровень.'));
  }
  function staleReasons(){
    const g=data[variant];if(!g)return[];
    const result=state.result?.content?.counts?state.result.content:state.result;
    if(result&&!result.valid)return[];
    const c=result?.counts,reasons=[];
    if(c){
      const scenes={hero:c.heroInstallations,interactive:c.interactiveInstallations,media:c.mediaInstallations,common:c.commonInstallations,navigation:c.navigationSurfaces};
      const surfaces={hero:c.heroSurfaces,interactive:c.interactiveSurfaces,media:c.mediaSurfaces,common:c.commonSurfaces,navigation:c.navigationSurfaces};
      if(Object.keys(CATEGORY).some(k=>scenes[k]!==g.summary.byCategory[k]?.requestedScenes||surfaces[k]!==g.summary.byCategory[k]?.requestedSurfaces)||(c.objectSurfaces??0)>0)reasons.push('Изменилось число установок или поверхностей.');
    }
    const flow=state.input?.flow||state.input||result?.input||{};
    if(['groupSize','usersPerStation','guidedParticipation','independentParticipation'].some(k=>flow[k]!==undefined&&Number(flow[k])!==BASE_FLOW[k]))reasons.push('Изменились группа, активные места или доля участников.');
    if(['guidedFlow','independentFlow','guidedMinutes','independentMinutes','experienceMinutes','turnoverSeconds','targetUtilization'].some(k=>flow[k]!==undefined&&Number(flow[k])!==BASE_FLOW[k]))reasons.push('Поток или цикл работы отличается от исходного сценария.');
    const types=state.screenTypes||DEFAULT_SCREEN_INPUT.types;
    if(Object.keys(CATEGORY).some(k=>['widthM','heightM','nearDistanceM','farDistanceM'].some(field=>{const row=types[k];const v=row&&Object.prototype.hasOwnProperty.call(row,field)?row[field]:DEFAULT_SCREEN_INPUT.types[k][field];return !num(v)||Math.abs(v-DEFAULT_SCREEN_INPUT.types[k][field])>1e-6;})))reasons.push('Изменились размеры экранов или зрительские расстояния.');
    if(state.ledReport?.valid===true&&Array.isArray(state.ledReport.rows)&&g.placements.some(p=>ledMismatch(p,state.ledReport.rows.find(r=>r.key===p.category))))reasons.push('LED-сборка требует проверки размещения: размеры кабинетов изменили габарит поверхностей.');
    return reasons;
  }
  function renderSummary(){
    const g=data[variant];if(!g)return;const s=g.summary,f=getFloor(),local=s.byFloor[f.id];
    status.replaceChildren(node('strong','',`${s.placedScenes}/${s.requestedScenes} сцен · ${s.placedSurfaces}/${s.requestedSurfaces} поверхностей`),node('span','',`Вариант ${variant}. Место ещё не найдено для ${s.unplacedScenes} сцен и ${s.unplacedSurfaces} поверхностей.`));
    floorInfo.textContent=`${local?.placedScenes??0} сцен · ${local?.placedSurfaces??0} поверхностей · ${nf(f.grossAreaM2)} м² по модели`;
    extraTitle.textContent=`Слои и компоновка · ${variant}`;
    extraMeta.textContent=`${f.name}: ${nf(f.grossAreaM2,3)} м² общей площади. Координаты X/Z, метры. Два этажа — 18 884,055 м².`;
    const activeResult=state.result?.content?.counts?state.result.content:state.result;
    const invalid=activeResult&&!activeResult.valid,reasons=staleReasons();stale.hidden=!invalid&&!reasons.length;staleBody.replaceChildren();
    const ledChanged=reasons.some(reason=>reason.startsWith('LED-сборка'));
    const headline=invalid?'В текущем расчёте есть ошибки — показан исходный план.':ledChanged?'LED-размеры изменились: размещение требует проверки':reasons.length?'Параметры изменились: размещение требует проверки':'';
    if(staleHeadline.textContent!==headline)staleHeadline.textContent=headline;
    if(invalid)staleBody.append(node('p','','На плане сохранён исходный вариант кандидатов. Текущий состав не сопоставляется с планом, пока параметры расчёта не исправлены.'));
    else if(reasons.length){const ul=node('ul');for(const reason of reasons)ul.append(node('li','',reason));staleBody.append(ul,node('p','','Здесь сохранены исходные координаты и размеры кандидатов; новый вариант требует повторной проверки.'));}
  }
  function renderUnplaced(){
    const g=data[variant];if(!g)return;unplacedTitle.textContent=`Место не найдено: ${g.summary.unplacedScenes} сцен / ${g.summary.unplacedSurfaces} поверхностей`;
    unplacedBody.replaceChildren(node('p','','Они остаются в программе. Ограниченный поиск не доказывает невозможность другой компоновки.'));
    const ul=node('ul');for(const p of g.unplaced){const li=node('li');li.append(node('strong','',p.id),node('span','',`${sceneName(p)} · ${p.floorId==='main'?'нижний':'верхний'} уровень · ${nf(p.surfaces)} поверхности`));li.title=p.reason||'Нет проверенного кандидата.';ul.append(li);}unplacedBody.append(ul);
  }
  function applyZoom(center=true){
    const cx=scroll.clientWidth/2,cy=scroll.clientHeight/2;
    const oldWidth=svg.getBoundingClientRect().width||scroll.clientWidth;
    const oldHeight=svg.getBoundingClientRect().height||scroll.clientHeight;
    const fx=(scroll.scrollLeft+cx)/oldWidth,fy=(scroll.scrollTop+cy)/oldHeight;
    svg.style.width=`${zoom*100}%`;zoomValue.textContent=`${Math.round(zoom*100)}%`;minus.disabled=zoom<=1;plus.disabled=zoom>=4;
    const size=22*currentBounds[2]/Math.max(1,svg.getBoundingClientRect().width);
    for(const glyph of svg.querySelectorAll('.fsp-map-glyph')){glyph.setAttribute('x',Number(glyph.dataset.x)-size/2);glyph.setAttribute('y',Number(glyph.dataset.y)-size/2);glyph.setAttribute('width',size);glyph.setAttribute('height',size);}
    const unit=currentBounds[2]/Math.max(1,svg.getBoundingClientRect().width),labelWidth=184*unit,labelHeight=48*unit;
    const labelNodes=[...svg.querySelectorAll('.fsp-sector-label')];
    const minGap=labelNodes.length>1?Math.min(...labelNodes.slice(1).map((n,i)=>Math.abs(Number(n.dataset.x)-Number(labelNodes[i].dataset.x))/unit)):Infinity;
    for(const n of labelNodes){
      const x=Number(n.dataset.x),y=Number(n.dataset.y),index=Number(n.dataset.order),rows=rotate&&minGap<98?3:2;
      const shiftY=rotate?(rows===3?[-55,0,55][index%3]:[-38,38][index%2]):-32;
      const shiftX=rotate?0:(index%2?-12:12);
      const lx=Math.max(currentBounds[0]+2*unit,Math.min(currentBounds[0]+currentBounds[2]-labelWidth-2*unit,x-labelWidth/2+shiftX*unit));
      const ly=Math.max(currentBounds[1]+2*unit,Math.min(currentBounds[1]+currentBounds[3]-labelHeight-2*unit,y-labelHeight/2+shiftY*unit));
      const label=n.querySelector('.fsp-sector-name');label.setAttribute('x',lx);label.setAttribute('y',ly);label.setAttribute('width',labelWidth);label.setAttribute('height',labelHeight);
      const endY=y<ly?ly:y>ly+labelHeight?ly+labelHeight:y,endX=Math.max(lx+6*unit,Math.min(lx+labelWidth-6*unit,x));
      n.querySelector('.fsp-sector-leader').setAttribute('d',`M${x} ${y}L${endX} ${endY}`);
      const tick=3*unit;n.querySelector('.fsp-sector-anchor').setAttribute('d',`M${x-tick} ${y}H${x+tick}M${x} ${y-tick}V${y+tick}`);
    }
    if(center){scroll.scrollLeft=fx*svg.getBoundingClientRect().width-cx;scroll.scrollTop=fy*svg.getBoundingClientRect().height-cy;}
  }
  function focusSelection(){
    if(!selected)return;const b=projectedBounds(selected.geometry);
    zoom=selected.kind==='zone'?Math.max(1,Math.min(4,currentBounds[2]/Math.max(20,b[2]-b[0]+12),currentBounds[3]/Math.max(20,b[3]-b[1]+12))):Math.max(2,zoom);
    applyZoom(false);const x=(b[0]+b[2])/2,y=(b[1]+b[3])/2;
    scroll.scrollLeft=(x-currentBounds[0])/currentBounds[2]*svg.getBoundingClientRect().width-scroll.clientWidth/2;
    scroll.scrollTop=(y-currentBounds[1])/currentBounds[3]*svg.getBoundingClientRect().height-scroll.clientHeight/2;
  }
  function render(){
    if(destroyed)return;const g=data[variant];
    for(const [id,b]of Object.entries(floorButtons))b.setAttribute('aria-pressed',String(id===floorId));
    if(!g){status.textContent=failures[variant]?`Не удалось загрузить вариант ${variant}. ${failures[variant]} Откройте подробную инженерную схему.`:`Загружаем вариант ${variant}…`;layout.hidden=true;unplaced.hidden=true;floorInfo.textContent='';stale.hidden=true;return;}
    layout.hidden=false;unplaced.hidden=false;records=makeRecords();selected=selected?records.find(r=>r.key===selected.key)||null:null;
    zonePicker.replaceChildren();const all=node('option','','Все зоны этого этажа');all.value='';zonePicker.append(all);
    for(const r of zoneRecords()){const s=zoneStats(r.item.id),o=node('option','',`${zoneName(r.item.id)} · ${s.placedScenes}/${s.requestedScenes} сцен`);o.value=r.item.id;zonePicker.append(o);}zonePicker.value=selectedZone||'';
    renderSummary();renderMap();renderList();renderUnplaced();
  }
  on(search,'input',renderList);on(scroll,'scroll',hideTip,{passive:true});
  on(tooltip,'pointerenter',cancelTipTimer);on(tooltip,'pointerleave',scheduleHideTip);
  on(plus,'click',()=>{zoom=Math.min(4,zoom*1.5);applyZoom();hideTip();});on(minus,'click',()=>{zoom=Math.max(1,zoom/1.5);applyZoom();hideTip();});
  on(reset,'click',()=>{zoom=1;applyZoom(false);scroll.scrollTo(0,0);hideTip();});on(focus,'click',focusSelection);
  on(root,'keydown',e=>{if(e.key==='Escape'){hideTip();clearSelection();}});
  if(typeof ResizeObserver!=='undefined'){
    let observedWidth=0;
    resizeObserver=new ResizeObserver(()=>{
      if(destroyed||!data[variant])return;
      const width=stage.clientWidth,changed=Math.abs(width-observedWidth)>1;observedWidth=width;
      if(wantsRotation()!==rotate){zoom=1;renderMap();}
      else if(changed)applyZoom(false); // Fixed-pixel labels; height-only resize callbacks do not mutate the DOM.
    });resizeObserver.observe(stage);
  }
  renderInspector();render();
  for(const key of ['B','A']){
    const source=geometryURLs[key]||new URL(`./engineering/${key==='B'?'placement-candidates.json':'placement-frontal.json'}`,import.meta.url);
    fetch(source,{signal:abort.signal,credentials:'same-origin'}).then(async response=>{if(!response.ok)throw new Error(`HTTP ${response.status}`);const text=await response.text();if(text.length>5_000_000)throw new Error('Файл слишком большой.');return validateData(JSON.parse(text));}).then(value=>{if(destroyed)return;data[key]=value;if(key===variant)render();}).catch(error=>{if(destroyed||error.name==='AbortError')return;failures[key]=error.message;if(key===variant)render();});
  }
  return {
    update(next={}){if(destroyed)return;state={...state,...next};if(Object.prototype.hasOwnProperty.call(next,'result')&&!Object.prototype.hasOwnProperty.call(next,'input'))state.input=next.result?.input||next.result?.content?.input||{};if(data[variant]){renderSummary();renderInspector();}},
    destroy(){if(destroyed)return;destroyed=true;abort.abort();resizeObserver?.disconnect();hideTip();root.remove();},
  };
}
