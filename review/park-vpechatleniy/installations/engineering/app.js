import {computeEngineering, AUXILIARY_DEFAULTS} from './engineering-model.js';
import {DEFAULT_SCREEN_INPUT, SCREEN_CATEGORY_KEYS, bdmPreview} from './screen-model.js';
import {electricalDiagram} from './electrical-diagram.js';

const $=q=>document.querySelector(q);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nf=(n,d=1)=>n===null||n===undefined||!Number.isFinite(n)?'не задано':new Intl.NumberFormat('ru-RU',{maximumFractionDigits:d}).format(n);
const colors={hero:'#c77739',interactive:'#4a7b43',media:'#4681b0',common:'#397f77',navigation:'#8d6cb1'};
const labels={hero:'Главные',interactive:'Интерактивные',media:'Медийные',common:'Общепарковые',navigation:'Навигационные'};
function errorText(e){
 const fields={widthM:'ширина',heightM:'высота',nearDistanceM:'ближняя позиция',farDistanceM:'дальняя позиция',elementPercent:'размер важной детали',assumedDeviceBudgetW:'бюджет мощности'};
 const parts=String(e.field).split('.');const name=parts[0]==='types'?`${labels[parts[1]]??'Поверхность'}: ${fields[parts[2]]??'параметры'}`:'Исходные данные';
 let message=e.message;
 if(/positive metres/.test(message))message='Введите положительный размер в метрах или оставьте поле пустым, если он неизвестен.';
 else if(/\(0,100\]/.test(message))message='Введите процент больше 0 и не больше 100 либо оставьте поле пустым.';
 else if(/near must not exceed far/.test(message))message='Дальняя позиция должна быть не ближе исходной ближней позиции.';
 else if(/nonnegative.*watts/.test(message))message='Введите неотрицательную мощность в ваттах или оставьте её неизвестной.';
 else if(/overflow/.test(message))message='Значения слишком велики для расчёта. Проверьте единицы и уменьшите исходные значения.';
 else if(/^[a-z]/i.test(message))message='Проверьте значения, диапазоны и единицы измерения.';
 return `${name}: ${message}`;
}
const decode=v=>JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(v.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));
const encode=v=>btoa(Array.from(new TextEncoder().encode(JSON.stringify(v)),b=>String.fromCharCode(b)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
let input={};let result=computeEngineering();let geometries={};let variant='B';let floorId='main';let selectedId=null;let zoomToSelection=false;
const query=new URL(location.href).searchParams;
if(query.get('embed')==='1')document.body.classList.add('embedded');
try{
 const q=query.get('engineering');
 if(q&&q.length<45000){const candidate=decode(q);if(candidate.schema==='faza.park.engineering.v1'&&computeEngineering(candidate.input).valid)input=candidate.input;}
 else{const q=query.get('parkInstallations');if(q&&q.length<20000){const candidate=decode(q);if(candidate.schema==='faza.park.installations.v1'&&computeEngineering({flow:candidate.input}).valid)input={flow:candidate.input};}}
}catch{setStatus('Ссылка содержит неполные параметры. Открыт базовый вариант.');}
result=computeEngineering(input);input=structuredClone(result.input);

function setStatus(s){$('#action-status').textContent=s;}
function fieldValue(n){return n===null?'':Number(n.toFixed(6));}
function buildControls(){
 $('#sizes').innerHTML=SCREEN_CATEGORY_KEYS.map(k=>{const t=input.types[k];return `<tr><th><i class="type-dot" style="background:${colors[k]}"></i>${esc(labels[k])}<span class="sub" id="size-desc-${k}"></span></th><td id="count-${k}"></td>${['widthM','heightM'].map(f=>`<td><input aria-label="${esc(labels[k])}: ${f==='widthM'?'ширина':'высота'} в метрах" type="number" step="any" min="0.01" max="100" data-type="${k}" data-property="${f}" value="${fieldValue(t[f])}"></td>`).join('')}<td id="area-${k}"></td><td><input aria-label="${esc(labels[k])}: дальняя позиция" type="number" step="any" min="0.1" max="200" data-type="${k}" data-property="farDistanceM" value="${fieldValue(t.farDistanceM)}"></td><td><input aria-label="${esc(labels[k])}: минимальная значимая деталь в процентах высоты" type="number" step="any" min="0.1" max="100" data-type="${k}" data-property="elementPercent" value="${fieldValue(t.elementPercent)}"></td><td id="bdm-${k}"></td></tr>`;}).join('');
 $('#power-table').innerHTML=[...SCREEN_CATEGORY_KEYS.map(k=>`<tr><th>${esc(labels[k])}: прибор отображения</th><td id="pc-${k}"></td><td><input aria-label="${esc(labels[k])}: бюджет мощности одного прибора, Вт" data-type="${k}" data-property="assumedDeviceBudgetW" type="number" min="0" max="100000" step="10" value="${fieldValue(input.types[k].assumedDeviceBudgetW)}"></td><td id="pw-${k}"></td><td><span class="pill warn">Допущение</span></td></tr>`),...result.auxiliaryGroups.map(g=>`<tr><th>${esc(g.label)}</th><td id="pc-${g.key}"></td><td><input aria-label="${esc(g.label)}: бюджет мощности, Вт" data-aux="${g.key}" type="number" min="0" max="100000" step="5" value="${fieldValue(input.auxiliaryBudgets[g.key])}"></td><td id="pw-${g.key}"></td><td><span class="pill warn">Допущение</span></td></tr>`)].join('');
 document.querySelectorAll('[data-flow]').forEach(n=>n.value=input.flow[n.dataset.flow]);$('#reserve').value=input.reservePercent;
}
function render(){
 result=computeEngineering(input);
 $('#error').hidden=result.valid;
 ['#metrics','#sizes','#power-table','#csv','#download-sld','#share'].forEach(q=>{const n=$(q);if('disabled'in n)n.disabled=!result.valid;});
 if(!result.valid){$('#error').innerHTML='<strong>Проверьте исходные данные</strong><ul>'+result.errors.map(e=>`<li>${esc(errorText(e))}</li>`).join('')+'</ul>';$('#metrics').hidden=true;document.querySelectorAll('[id^=area-],[id^=bdm-],[id^=pw-],[id^=pc-],[id^=count-],[id^=size-desc-],#range-chart,#content-metrics,#reserve-note,#flow-note,#readability-note,#power-unknown').forEach(n=>n.textContent='Расчёт приостановлен: проверьте параметры.');$('#sld').innerHTML='<p style="padding:25px;color:#663b2e">Схема скрыта: исправьте параметры расчёта.</p>';renderPlanSummary();renderSelection();sendHeight();return;}
 $('#metrics').hidden=false;
 const s=result.screen,c=result.content.counts;
 const kpis=[[nf(s.totals.surfaceCount,0),'поверхности',`${nf(c.totalInstallations,0)} точки + отдельная навигация`],[nf(s.totals.totalActiveAreaM2,1)+' м²','активное изображение','Сценарные размеры; корпус и пол отдельно'],[nf(s.power.budget.totalW===null?null:s.power.budget.totalW/1000,2)+' кВт','бюджет учтённого AV',`${nf(s.power.budget.equipmentCount,0)} предполагаемых устройств`],['не задан','паспортный максимум',`${nf(s.power.maximum.unknownCount,0)} устройств без подтверждённого максимума`]];
 $('#metrics').innerHTML=kpis.map(([n,l,d])=>`<article class="metric"><strong>${n}</strong><span>${l}</span><small>${esc(d)}</small></article>`).join('');
 $('#flow-note').innerHTML=`<strong>${nf(c.interactiveStations,0)} параллельные станции</strong><br>${nf(c.interactiveInstallations,0)} интерактивные точки · ${nf(c.interactiveStations/Math.max(1,c.interactiveInstallations),1)} станции на точку.<br>Присутствие по времени визита: ${nf(result.content.flows.totalOccupancy,0)} чел. Это не нормативная вместимость.`;
 s.categories.forEach(r=>{
  $(`#count-${r.key}`).textContent=nf(r.count,0);$(`#area-${r.key}`).textContent=nf(r.totalAreaM2,2);
  $(`#size-desc-${r.key}`).textContent=r.widthM===null||r.heightM===null?'Размер не определён':`${nf(r.widthM,3)} × ${nf(r.heightM,3)} м · ${nf(r.diagonalIn,1)}″`;
  $(`#bdm-${r.key}`).innerHTML=`<span class="pill ${r.bdm.pass===true?'ok':r.bdm.pass===false?'fail':'warn'}">${r.bdm.pass===true?'Осевой запас':r.bdm.pass===false?'Малая деталь':'Нет данных'}</span><span class="sub">Предел ${nf(r.bdm.maxDistanceM,2)} м</span>`;
  $(`#pc-${r.key}`).textContent=nf(r.count,0);$(`#pw-${r.key}`).textContent=nf(r.assumedDeviceBudgetW===null?null:r.assumedDeviceBudgetW*r.count/1000,2);
 });
 result.auxiliaryGroups.forEach(g=>{$(`#pc-${g.key}`).textContent=nf(g.count,0);$(`#pw-${g.key}`).textContent=nf(g.budgetInputW===null?null:g.budgetInputW*g.count/1000,2);});
 const failures=s.categories.filter(r=>r.count&&r.bdm.pass===false);
 $('#readability-note').className='callout'+(failures.length?' amber':'');
 $('#readability-note').innerHTML=failures.length?`<strong>Нужна корректировка:</strong> ${failures.map(r=>esc(labels[r.key])).join(', ')} — заданная дальняя позиция превышает осевой предел для выбранной детали. Увеличьте изображение или значимый элемент либо сократите дистанцию.`:'Предварительная осевая проверка связывает дальнюю позицию с минимальной значимой деталью. Положительный результат не проверяет боковые места, заслонение зрителями и световую среду.';
 if(s.totals.unknownAreaSurfaceCount)$('#readability-note').innerHTML+=`<p>Площадь ${nf(s.totals.unknownAreaSurfaceCount,0)} поверхностей неизвестна. Полный итог не определён; известная часть ${nf(s.totals.knownAreaSumM2,2)} м².</p>`;
 const values=[['Компактный',s.range.lower.totalActiveAreaM2],['Текущий',s.totals.totalActiveAreaM2],['Крупный',s.range.upper.totalActiveAreaM2]],max=Math.max(1,...values.map(x=>x[1]??0));
 $('#range-chart').innerHTML=values.map(([name,a],i)=>`<div class="range-row ${i===1?'':'dim'}"><span>${name}</span><div class="bar-track"><div class="bar-fill" style="width:${(a??0)/max*100}%"></div></div><strong>${nf(a)} м²</strong></div>`).join('')+'<p class="muted">Компактный: hero 3 м / интерактив 55″ / медиа 65″ / общие 86″ / навигация 55″. Крупный: 5 м / 86″ / 86″ / 120″ / 75″. Число поверхностей берётся из текущего сценария.</p>';
 $('#content-metrics').innerHTML=`<div class="content-facts"><div><strong>${nf(c.digitalPackages,0)}</strong><span>цифровых пакетов</span></div><div><strong>${nf(result.content.content.scopedObjectPackages,0)}</strong><span>редакционных</span></div><div><strong>${nf(result.content.runtime.uniqueChannelMinutes,0)}</strong><span>канал-минут мастеров</span></div></div><p>${nf(result.content.runtime.uniqueLinearMinutes,0)} мин уникальных линейных программ. Выходное разрешение, карта каналов и технические версии фиксируются для каждой поверхности.</p>`;
 $('#reserve-note').innerHTML=`С резервом ${nf(result.reservePercent,0)}%: <strong>${nf(result.reservedBudgetW===null?null:result.reservedBudgetW/1000,2)} кВт</strong> для учтённого AV-состава. Это планировочный ориентир, не разрешённая мощность и не номинал вводного автомата.`;
 $('#sld').innerHTML=electricalDiagram(result);
 $('#power-unknown').innerHTML=`В ведомости ${nf(s.power.budget.equipmentCount,0)} предполагаемых приборов. <strong>Паспортные максимумы и рабочие режимы всех ${nf(s.power.maximum.unknownCount,0)} ещё не заполнены.</strong>`;
 renderPlanSummary();renderSelection();sendHeight();
}
function download(content,name,type){const u=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1500);}
document.addEventListener('input',e=>{
 const n=e.target;if(n.dataset.flow){input.flow[n.dataset.flow]=n.value===''?NaN:n.valueAsNumber;render();}
 if(n.dataset.type){input.types[n.dataset.type][n.dataset.property]=n.value===''?null:n.valueAsNumber;render();}
 if(n.dataset.aux){input.auxiliaryBudgets[n.dataset.aux]=n.value===''?null:n.valueAsNumber;render();}
 if(n.id==='reserve'){input.reservePercent=n.value===''?NaN:n.valueAsNumber;render();}
});
$('#reset').addEventListener('click',()=>{result=computeEngineering();input=structuredClone(result.input);buildControls();render();setStatus('Восстановлены базовые параметры. Ответы анкеты сохранены.');});
$('#csv').addEventListener('click',()=>{
 if(!result.valid)return;const rows=[['Парк впечатлений — инженерный сценарий','24.11.2026'],['Статус','Предложение. Все размеры и бюджеты — допущения'],['Экскурсионный поток',input.flow.guidedFlow],['Самостоятельный поток',input.flow.independentFlow],[],['Поверхность','Кол-во','W м','H м','Всего м²','Дальняя позиция м','Минимальная деталь %','BDM предел м']];
 result.screen.categories.forEach(r=>rows.push([labels[r.key],r.count,r.widthM,r.heightM,r.totalAreaM2,r.farDistanceM,r.elementPercent,r.bdm.maxDistanceM]));
 rows.push([],['ID оборудования','Категория','Бюджет Вт — допущение','Паспортный максимум Вт','Рабочая мощность Вт']);result.screen.equipment.forEach(e=>rows.push([e.id,e.category,e.budgetInputW,e.maximumInputW??'Неизвестно',e.operatingInputW??'Неизвестно']));
 rows.push([],['Сумма бюджета учтённых устройств Вт',result.screen.power.budget.totalW],['Полный максимум парка','Неизвестно'],['Исключены',result.screen.power.missingSubsystems.join(', ')]);
 download('\ufeff'+rows.map(row=>row.map(v=>'"'+String(v??'Неизвестно').replace(/"/g,'""')+'"').join(';')).join('\r\n'),'park-engineering-scenario.csv','text/csv;charset=utf-8');setStatus('Скачана ведомость поверхностей и уникального оборудования.');
});
$('#download-sld').addEventListener('click',()=>{if(result.valid){download(electricalDiagram(result),'park-electrical-concept.svg','image/svg+xml');setStatus('Скачана концептуальная однолинейная схема для текущего бюджета.');}});
$('#share').addEventListener('click',async()=>{if(!result.valid)return;const u=new URL(location.href);u.searchParams.delete('parkInstallations');u.searchParams.delete('embed');u.searchParams.set('engineering',encode({schema:'faza.park.engineering.v1',input:result.input}));$('#share-url').value=u.href;try{await navigator.clipboard.writeText(u.href);$('#share-fallback').hidden=true;setStatus('Ссылка на вариант скопирована. Ответы анкеты в неё не включены.');}catch{$('#share-fallback').hidden=false;$('#share-url').focus();$('#share-url').select();setStatus('Скопируйте выделенную ссылку.');}});
function chooseTab(id){document.querySelectorAll('.panel').forEach(n=>n.hidden=n.id!==id);document.querySelectorAll('[data-tab]').forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.tab===id)));if(id==='placement')renderPlan();sendHeight();}
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>chooseTab(b.dataset.tab)));

function geometryPath(g){
 if(!g)return '';const ring=r=>'M'+r.map(p=>p.map(x=>Number(x).toFixed(3)).join(' ')).join('L')+'Z';
 if(g.type==='Polygon')return g.coordinates.map(ring).join(' ');
 if(g.type==='MultiPolygon')return g.coordinates.flatMap(p=>p.map(ring)).join(' ');
 if(g.type==='LineString')return 'M'+g.coordinates.map(p=>p.join(' ')).join('L');
 if(g.type==='MultiLineString')return g.coordinates.map(r=>'M'+r.map(p=>p.join(' ')).join('L')).join(' ');
 if(g.type==='GeometryCollection')return g.geometries.map(geometryPath).join(' ');return '';
}
function bounds(g){const pts=[];const walk=x=>{if(Array.isArray(x)&&typeof x[0]==='number')pts.push(x);else if(Array.isArray(x))x.forEach(walk);};walk(g?.coordinates);if(!pts.length)return[-50,-87,50,83];return[Math.min(...pts.map(p=>p[0])),Math.min(...pts.map(p=>p[1])),Math.max(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[1]))];}
function path(g,fill,stroke='none',width=.1,extra=''){return `<path d="${geometryPath(g)}" fill="${fill}" fill-rule="evenodd" stroke="${stroke}" stroke-width="${width}" ${extra}/>`;}
function planChanged(){
 if(!result.valid)return true;
 const g=geometries[variant];if(!g)return true;
 const c=result.content.counts;
 const scenes={hero:c.heroInstallations,interactive:c.interactiveInstallations,media:c.mediaInstallations,common:c.commonInstallations,navigation:c.navigationSurfaces};
 return result.screen.categories.some(r=>r.count!==g.summary.byCategory[r.key].requestedSurfaces||scenes[r.key]!==g.summary.byCategory[r.key].requestedScenes||Math.abs((r.widthM??0)-DEFAULT_SCREEN_INPUT.types[r.key].widthM)>1e-6||Math.abs((r.heightM??0)-DEFAULT_SCREEN_INPUT.types[r.key].heightM)>1e-6||r.farDistanceM!==DEFAULT_SCREEN_INPUT.types[r.key].farDistanceM)||input.flow.groupSize!==30||input.flow.usersPerStation!==6||input.flow.guidedParticipation!==40||input.flow.independentParticipation!==40;
}
function renderPlanSummary(){const g=geometries[variant];if(!g)return;const s=g.summary;$('#placement-summary').className='callout amber';$('#placement-summary').innerHTML=`<strong>Вариант ${esc(variant)}: ${s.placedScenes} из ${s.requestedScenes} экранных сцен · ${s.placedSurfaces} из ${s.requestedSurfaces} поверхностей.</strong><br>Место ещё не найдено для ${s.unplacedScenes} сцен и ${s.unplacedSurfaces} поверхностей. Поиск дискретный и ограниченный; результат не доказывает невозможность другой расстановки. 16 предметных точек не добавлены повторно поверх 24 существующих экземпляров экспонатов.${planChanged()?'<p><strong>Параметры калькулятора изменены.</strong> На плане сохранены исходные размеры и количества; расстановка для нового сценария не пересчитана.</p>':''}${variant==='B'?'<p>Вариант B: три главных полотна по 4 × 2,25 м вокруг группы. Дальняя позиция 6 м относится к фронтальному полотну; у базового расчёта — 10 м. Боковые места и вместимость не подтверждены.</p>':''}`;
 $('#placement-checks').innerHTML=`<ul class="small-list"><li>${s.placedScenes} контуров внутри исходных полов и выбранной консервативной маски.</li><li>${g.qa.envelopeIntersections.length} пересечений новых полных контуров; ${g.qa.reservedGeometryIntersections.length} пересечений резервов переходов.</li><li>48 контрольных привязок сохранили исходную связность своих компонентов. Это не подтверждает общий маршрут или эвакуацию.</li><li>${g.qa.largeSectorTargetDeviations.length} кандидатов существенно отклоняются от целей условных секторов. Тематическая и маршрутная группировка не решена.</li></ul>`;
 $('#unplaced').innerHTML='<p>Программа из 152 поверхностей сохранена полностью. Эти позиции остаются в требуемом объёме оборудования и контента.</p><div class="table-wrap"><table><thead><tr><th>ID</th><th>Тип</th><th>Уровень поиска</th><th>Поверхности</th></tr></thead><tbody>'+g.unplaced.map(p=>`<tr><th>${esc(p.id)}</th><td>${esc(labels[p.category])}</td><td>${p.floorId==='main'?'Нижний':'Верхний'}</td><td>${p.surfaces}</td></tr>`).join('')+'</tbody></table></div><p class="muted">Следующие варианты: разделить параллельные станции внутри смыслового блока, уточнить места зрителей, пересобрать маршрут и привязать утверждённые границы экспозиции. Сокращение программы не выполнялось.</p>';
 const a=document.querySelector('a[href$="placement-candidates.json"],a[data-plan-download]');if(a){a.dataset.planDownload='true';a.href=variant==='B'?'./placement-candidates.json':'./placement-frontal.json';}
}
function renderPlan(){const g=geometries[variant];if(!g)return;const floor=g.floors.find(f=>f.id===floorId);if(!floor)return;const placements=g.placements.filter(p=>p.floorId===floorId);if(!placements.some(p=>p.id===selectedId))selectedId=placements[0]?.id??null;
 let b=bounds(floor.floor);const selected=placements.find(p=>p.id===selectedId);if(zoomToSelection&&selected)b=bounds(selected.parts.envelope);const pad=zoomToSelection?5:4;$('#plan').setAttribute('viewBox',`${b[0]-pad} ${b[1]-pad} ${b[2]-b[0]+2*pad} ${b[3]-b[1]+2*pad}`);
 let svg='<title>Кандидаты экранных сцен. Полные резервы не являются утверждённой планировкой.</title>'+path(floor.floor,'#fff','#7c897d',.12)+path(floor.candidateMask,'#e6eddf')+path(floor.reservedTransitions,'#ddd8c4','#b8aa7c',.08);
 if($('#show-obstacles').checked)svg+=(floor.existingObjects??[]).map(o=>path(o.geometry,o.kind==='exhibit'?'#9b9f9a':'#bec2b8','#7e867c',.08)).join('');
 svg+=placements.map(p=>{const active=p.id===selectedId,color=colors[p.category];return `<g data-scene="${esc(p.id)}" tabindex="0" role="button" aria-label="${esc(p.id+' '+labels[p.category])}" style="cursor:pointer">${$('#show-envelopes').checked?path(p.parts.envelope,active?'#d5e7bf':'#dce7d3',active?'#304c2b':color,active?.35:.13,'fill-opacity=".7"'):''}${path(p.parts.equipment,color,color,.1)}${p.screenLines.map(l=>path(l.geometry,'none','#214b37',active?.5:.25)).join('')}<circle cx="${p.floorAnchorXYZ[0]}" cy="${p.floorAnchorXYZ[2]}" r="${active?1.1:.7}" fill="${color}" stroke="white" stroke-width=".15"/><text x="${p.floorAnchorXYZ[0]}" y="${p.floorAnchorXYZ[2]+2.3}" font-size="1.65" text-anchor="middle" fill="#233b28" font-family="Arial">${esc(p.id)}</text><title>${esc(p.id)} · ${p.surfaces} поверхности · ${nf(p.dimensionsM.width)} × ${nf(p.dimensionsM.depth)} м резерв</title></g>`;}).join('');
 svg+=`<path d="M${b[0]+2} ${b[3]+2}h10m-10-.7v1.4m10-1.4v1.4" stroke="#334b38" stroke-width=".2"/><text x="${b[0]+7}" y="${b[3]+1.2}" font-size="1.6" text-anchor="middle" fill="#334b38">10 м</text>`;$('#plan').innerHTML=svg;
 $('#plan').querySelectorAll('[data-scene]').forEach(n=>{const pick=()=>{selectedId=n.dataset.scene;renderPlan();};n.addEventListener('click',pick);n.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick();}});});renderPlanSummary();renderSelection();sendHeight();
}
function renderSelection(){const g=geometries[variant];if(!g)return;const p=g.placements.find(p=>p.id===selectedId);if(!p){$('#selection').innerHTML='<p>Выберите экранную сцену на плане.</p>';return;}
 const row=result.valid?result.screen.categories.find(r=>r.key===p.category):null;
 const bdm=bdmPreview({imageHeightM:p.surfaceHeightM,elementFraction:row?.elementPercent===null||!row?null:row.elementPercent/100,farDistanceM:p.viewingFarM});
 const w=p.surfaceWidthM,h=p.surfaceHeightM;const scale=Math.min(230/w,120/h);
 $('#selection').innerHTML=`<p class="eyebrow">${esc(p.id)} / Вариант ${esc(variant)}</p><h3>${esc(p.label)}</h3><span class="pill warn">Кандидат, не утверждено</span><svg viewBox="0 0 270 180" aria-label="Пропорции одной активной поверхности"><rect x="${(270-w*scale)/2}" y="26" width="${w*scale}" height="${h*scale}" rx="2" fill="#263f2b" stroke="#c9f77e"/><text x="135" y="${43+h*scale}" text-anchor="middle" font-size="11" fill="#c9f77e">${nf(w,3)} × ${nf(h,3)} м</text><text x="135" y="164" text-anchor="middle" font-size="10" fill="#aebcb0">активная поверхность; корпус отдельно</text></svg><dl><dt>Поверхностей в сцене</dt><dd>${p.surfaces}</dd><dt>Активная площадь</dt><dd>${nf(p.activeImageAreaM2,2)} м²</dd><dt>Весь резерв сцены</dt><dd>${nf(p.dimensionsM.width)} × ${nf(p.dimensionsM.depth)} м</dd><dt>Привязка X / Y / Z</dt><dd>${p.floorAnchorXYZ.map(n=>nf(n,2)).join(' / ')}</dd><dt>Поворот на плане</dt><dd>${nf(p.rotationPlanDeg,0)}°</dd><dt>Ближняя / дальняя</dt><dd>${nf(p.viewingNearM)} / ${nf(p.viewingFarM)} м</dd><dt>Осевой BDM-предел</dt><dd>${nf(bdm.maxDistanceM,2)} м</dd><dt>Высота низа / крепёж</dt><dd>Не заданы</dd><dt>Питание / кабель</dt><dd>Не заданы</dd></dl><p>${esc(p.note)}</p>${p.targetDeviationM>30?`<p class="callout amber">Отклонение от цели условного сектора: ${nf(p.targetDeviationM)} м. Тематическое соседство и маршрут требуют переработки.</p>`:''}${planChanged()?'<p class="callout amber">Здесь показаны исходные параметры плана. Изменения калькулятора требуют новой проверки места.</p>':''}<button id="zoom-scene">${zoomToSelection?'Показать весь этаж':'Приблизить сцену'}</button>`;
 $('#zoom-scene').addEventListener('click',()=>{zoomToSelection=!zoomToSelection;renderPlan();});
}
document.querySelectorAll('[data-floor]').forEach(b=>b.addEventListener('click',()=>{floorId=b.dataset.floor;zoomToSelection=false;document.querySelectorAll('[data-floor]').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));renderPlan();}));
$('#variant').addEventListener('change',()=>{variant=$('#variant').value;selectedId=null;zoomToSelection=false;renderPlan();});['#show-envelopes','#show-obstacles'].forEach(q=>$(q).addEventListener('change',renderPlan));$('#plan-reset').addEventListener('click',()=>{zoomToSelection=false;renderPlan();});

const questions=[
 ['powerConnection','Точка подключения и существующие щиты','text','Номер ВРУ/ГРЩ, помещение, ссылка на схему'],
 ['availablePowerKW','Выделенная мощность для AV, кВт','number','По техническим условиям здания'],
 ['earthing','Фактическая система заземления','select',''],
 ['supplyData','Параметры источника и токи КЗ','text','Напряжение, фазы, резерв, данные для защиты'],
 ['firePlan','Утверждённые пути, выходы и пожарные отсеки','textarea','Ссылка на актуальные планы, ограничения и допустимую численность'],
 ['structure','Несущие основания и нагрузки','textarea','Перекрытия, стены, фермы; допустимые местные/точечные нагрузки; обследование'],
 ['mountingPermission','Разрешённые крепления и зоны запрета','textarea','Сверление, анкеры, подвесы, независимые рамы, требования собственника'],
 ['cableRoutes','Кабельные трассы и помещения оборудования','textarea','Щитовые, серверные, лотки, шахты, длины, способы прокладки и сервисный доступ'],
 ['equipmentPassports','Паспорта оборудования','textarea','Модели, максимумы/режимы, пуск/утечки, PF, масса с рамой/оптикой, зазоры'],
 ['light','Свет и проекция','textarea','Освещённость на поверхностях, режимы рабочего света, отражающие материалы, возможность затемнения'],
 ['content','Исходные данные контента ФАЗЫ','textarea','Pixel maps, минимальные детали, языки, каналы/повторы, ввод, лицензии, версии выдачи'],
 ['audience','Зрительские места и работа групп','textarea','Где стоят наблюдатели и очередь, дети/МГН, органы ввода для шести участников'],
 ['extraSystems','Дополнительный состав оборудования','textarea','Звук, свет, эффекты, механика, охлаждение, монорельс — состав и границы подрядчиков'],
 ['estimateBasis','Исходные данные сметы','textarea','Регион, дата цен, финансирование, метод, коммерческие предложения, состав работ'],
 ['responsible','Ответственный за технические исходные данные','text','Имя или роль, версия и дата комплекта']
];
let answers={};try{const saved=JSON.parse(localStorage.getItem('faza.park.engineering.answers.v1'));if(saved?.schema==='faza.park.engineering.answers.v1'&&saved.answers&&typeof saved.answers==='object')answers=saved.answers;}catch{}
$('#question-fields').innerHTML=questions.map(([key,label,type,placeholder])=>`<label>${esc(label)}${type==='textarea'?`<textarea data-answer="${key}" maxlength="4000" placeholder="${esc(placeholder)}">${esc(answers[key]??'')}</textarea>`:type==='select'?`<select data-answer="${key}">${['Неизвестно','TN-S','TN-C-S','TT','IT','Другое — указать в параметрах'].map(v=>`<option ${answers[key]===v?'selected':''}>${v}</option>`).join('')}</select>`:`<input data-answer="${key}" type="${type}" ${type==='number'?'min="0" step="0.1"':'maxlength="1000"'} value="${esc(answers[key]??'')}" placeholder="${esc(placeholder)}">`}</label>`).join('');
$('#engineering-form').addEventListener('submit',e=>e.preventDefault());
$('#engineering-form').addEventListener('input',e=>{const key=e.target.dataset.answer;if(!key)return;answers[key]=e.target.value;try{localStorage.setItem('faza.park.engineering.answers.v1',JSON.stringify({schema:'faza.park.engineering.answers.v1',answers,updatedAt:new Date().toISOString()}));$('#answers-status').textContent='Черновик сохранён в этом браузере.';}catch{$('#answers-status').textContent='Браузер не разрешил сохранение. Скачайте JSON.';}});
$('#export-answers').addEventListener('click',()=>{if(!$('#engineering-form').reportValidity())return;download(JSON.stringify({schema:'faza.park.engineering.answers.v1',status:'user_input_requires_verification',answers,scenario:result.valid?result.input:null,updatedAt:new Date().toISOString()},null,2),'park-engineering-answers.json','application/json');$('#answers-status').textContent='Ответы выгружены. Для передачи приложите файл к проекту.';});
async function loadData(){
 const sources=[['B','placement-candidates.json'],['A','placement-frontal.json'],['evidence','source-summary.json']];
 const loaded=await Promise.allSettled(sources.map(async([id,file])=>{const r=await fetch(new URL(file,import.meta.url));if(!r.ok)throw new Error(file);return {id,data:await r.json()};}));
 loaded.forEach((r,i)=>{if(r.status!=='fulfilled'){if(i<2)$('#placement-summary').textContent='Не удалось загрузить геометрию. Координатный реестр и приложение доступны отдельными файлами.';else $('#evidence-content').textContent='Не удалось загрузить текст. Откройте инженерное приложение PDF.';return;}const {id,data}=r.value;if(id!=='evidence')geometries[id]=data;else{
  $('#evidence-content').innerHTML='<div class="evidence-grid">'+data.archive.map(a=>`<article class="card"><strong>${esc(a.number)}</strong><h3>${esc(a.title)}</h3><p>${esc(a.text)}</p><small>${esc(a.locator)}</small></article>`).join('')+'</div>'+data.sections.map(s=>`<details><summary>${esc(s.title)}</summary><div class="detail-body prose">${s.paragraphs.map(p=>`<p>${esc(p)}</p>`).join('')}</div></details>`).join('');
  $('#sources').innerHTML=data.sources.map(s=>`<article class="source-entry"><h4>[${esc(s.id)}] ${esc(s.title)}</h4><p>${esc(s.status)}</p><a href="${esc(s.url)}" target="_blank" rel="noopener">Открыть первичный источник</a></article>`).join('');
 }});renderPlan();sendHeight();
}
function sendHeight(){if(window.parent!==window){const height=Math.min(20000,Math.ceil(document.body.getBoundingClientRect().height));window.parent.postMessage({type:'faza-engineering-height',height},location.origin);}}
document.addEventListener('toggle',()=>requestAnimationFrame(sendHeight),true);
window.addEventListener('resize',sendHeight);
buildControls();render();loadData();
