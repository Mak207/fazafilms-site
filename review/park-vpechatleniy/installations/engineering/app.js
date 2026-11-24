import {computeEngineering, AUXILIARY_DEFAULTS, AUXILIARY_LABELS} from './engineering-model.js?v=20261124-led-zones1';
import {DEFAULT_LED_CONFIG} from './led-model.js?v=20261124-led-zones1';
import {createLedPanel} from './led-ui.js?v=20261124-led-zones1';
import {computeContentPlan} from '../content-model.js';
import {DEFAULT_SCREEN_INPUT, SCREEN_CATEGORY_KEYS, bdmPreview} from './screen-model.js';
import {electricalDiagram} from './electrical-diagram.js?v=20261124-led-zones1';
import {createScreenPlan} from '../screen-plan.js?v=20261124-led-zones1';

const $=q=>document.querySelector(q);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nf=(n,d=1)=>n===null||n===undefined||!Number.isFinite(n)?'не задано':new Intl.NumberFormat('ru-RU',{maximumFractionDigits:d}).format(n);
const colors={hero:'#ffbd66',interactive:'#68b7ff',media:'#c4a0ff',common:'#55d4b0',navigation:'#ff91b6'};
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
let result=computeEngineering({led:DEFAULT_LED_CONFIG});
const baselineInput=structuredClone(result.input);
let input=structuredClone(baselineInput);
const query=new URL(location.href).searchParams;
const embedded=query.get('embed')==='1'&&window.parent!==window;
if(embedded)document.body.classList.add('embedded');
try{
 const q=query.get('engineering');
 if(q&&q.length<45000){const candidate=decode(q);if(candidate.schema==='faza.park.engineering.v1'){const checked=computeEngineering(candidate.input);if(checked.valid)input=structuredClone(checked.input);}}
 else{const q=query.get('parkInstallations');if(q&&q.length<20000){const candidate=decode(q);if(candidate.schema==='faza.park.installations.v1'){const checked=computeContentPlan(candidate.input);if(checked.valid)input.flow=structuredClone(checked.input);}}}
}catch{setStatus('Ссылка содержит неполные параметры. Открыт базовый вариант.');}
// A valid visitor scenario can exceed the engineering registry's software limit.
// Keep editable inputs even when that calculation has no normalised result input.
result=computeEngineering(input);if(result.input)input=structuredClone(result.input);
const sharedPlan=createScreenPlan($('#shared-screen-plan'),{onOpenEngineering:()=>chooseTab('calculation')});
function updateSharedPlan(){sharedPlan.update({result:result.valid?result.content:{valid:false},input:input.flow,screenTypes:result.valid?result.screen.input.types:input.types,ledReport:result.valid?result.led:null});}
function sendState(){if(embedded)window.parent.postMessage({type:'faza-engineering-state',valid:result.valid,types:result.valid?result.screen.input.types:input.types,ledReport:result.valid?result.led:null,input:result.valid?result.input:input},location.origin);}
window.addEventListener('message',event=>{
 if(!embedded||event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='faza-park-scenario')return;
 const candidate=computeContentPlan(event.data.input);
 if(!candidate.valid)return;
 input.flow=structuredClone(candidate.input);
 document.querySelectorAll('[data-flow]').forEach(n=>n.value=input.flow[n.dataset.flow]);
 render();
});
$('#parent-visitors').addEventListener('click',()=>window.parent.postMessage({type:'faza-open-visitors'},location.origin));
const ledPanel=createLedPanel($('#led-panel'),{onChange(config){if(config)input.led=config;else delete input.led;result=computeEngineering(input);buildControls();render();}});

function setStatus(s){$('#action-status').textContent=s;}
function fieldValue(n){return n===null?'':Number(n.toFixed(6));}
function buildControls(){
 $('#sizes').innerHTML=SCREEN_CATEGORY_KEYS.map(k=>{const t=input.types[k];return `<tr><th><i class="type-dot" style="background:${colors[k]}"></i>${esc(labels[k])}<span class="sub" id="size-desc-${k}"></span></th><td id="count-${k}"></td>${['widthM','heightM'].map(f=>`<td><input aria-label="${esc(labels[k])}: ${f==='widthM'?'целевая ширина':'целевая высота'} в метрах" type="number" step="any" min="0.01" max="100" data-type="${k}" data-property="${f}" value="${fieldValue(t[f])}"></td>`).join('')}<td id="area-${k}"></td><td><input aria-label="${esc(labels[k])}: дальняя позиция" type="number" step="any" min="0.1" max="200" data-type="${k}" data-property="farDistanceM" value="${fieldValue(t.farDistanceM)}"></td><td><input aria-label="${esc(labels[k])}: минимальная значимая деталь в процентах высоты" type="number" step="any" min="0.1" max="100" data-type="${k}" data-property="elementPercent" value="${fieldValue(t.elementPercent)}"></td><td id="bdm-${k}"></td></tr>`;}).join('');
 $('#power-table').innerHTML=[...SCREEN_CATEGORY_KEYS.map(k=>`<tr><th>${esc(labels[k])}: экранное полотно</th><td id="pc-${k}"></td><td><input aria-label="${esc(labels[k])}: бюджет мощности одного прибора, Вт" data-type="${k}" data-property="assumedDeviceBudgetW" type="number" min="0" max="100000" step="10" value="${fieldValue(input.types[k].assumedDeviceBudgetW)}"></td><td id="pw-${k}"></td><td><span class="pill warn" data-power-source="${k}">Допущение</span></td></tr>`),...Object.keys(AUXILIARY_DEFAULTS).map(key=>({key,label:AUXILIARY_LABELS[key]})).map(g=>`<tr><th>${esc(g.label)}</th><td id="pc-${g.key}"></td><td><input aria-label="${esc(g.label)}: бюджет мощности, Вт" data-aux="${g.key}" type="number" min="0" max="100000" step="5" value="${fieldValue(input.auxiliaryBudgets[g.key])}"></td><td id="pw-${g.key}"></td><td><span class="pill warn">Допущение</span></td></tr>`)].join('');
 document.querySelectorAll('[data-flow]').forEach(n=>n.value=input.flow[n.dataset.flow]);$('#reserve').value=input.reservePercent;
}
function render(){
 result=computeEngineering(input);
 ledPanel.update(result,input);
 $('#error').hidden=result.valid;
 ['#metrics','#sizes','#power-table','#csv','#download-sld','#share'].forEach(q=>{const n=$(q);if('disabled'in n)n.disabled=!result.valid;});
 if(!result.valid){$('#error').innerHTML='<strong>Проверьте исходные данные</strong><ul>'+result.errors.map(e=>`<li>${esc(errorText(e))}</li>`).join('')+'</ul>';$('#metrics').hidden=true;document.querySelectorAll('[id^=area-],[id^=bdm-],[id^=pw-],[id^=pc-],[id^=count-],[id^=size-desc-],#range-chart,#content-metrics,#reserve-note,#flow-note,#readability-note,#power-unknown').forEach(n=>n.textContent='Расчёт приостановлен: проверьте параметры.');$('#sld').innerHTML='<p style="padding:25px;color:#663b2e">Схема скрыта: исправьте параметры расчёта.</p>';updateSharedPlan();sendHeight();sendState();return;}
 $('#metrics').hidden=false;
 const s=result.screen,c=result.content.counts;
 const kpis=[[nf(s.totals.surfaceCount,0),'экранные поверхности',`${nf(c.totalInstallations,0)} инсталляции + навигация`],[nf(s.totals.totalActiveAreaM2,1)+' м²','активное изображение','Размеры — проектное предложение'],[nf(s.power.budget.totalW===null?null:s.power.budget.totalW/1000,2)+' кВт','бюджет мощности AV',`${nf(s.power.maximum.unknownCount,0)} позиций без значения максимума`]];
 $('#metrics').innerHTML=kpis.map(([n,l,d])=>`<article class="metric"><strong>${n}</strong><span>${l}</span><small>${esc(d)}</small></article>`).join('');
 $('#flow-note').innerHTML=`<strong>${nf(c.interactiveStations,0)} параллельные станции</strong><br>${nf(c.interactiveInstallations,0)} интерактивные точки · ${nf(c.interactiveStations/Math.max(1,c.interactiveInstallations),1)} станции на точку.<br>Присутствие по времени визита: ${nf(result.content.flows.totalOccupancy,0)} чел. Это не нормативная вместимость.`;
 s.categories.forEach(r=>{
  $(`#count-${r.key}`).textContent=nf(r.count,0);$(`#area-${r.key}`).textContent=nf(r.totalAreaM2,2);
  $(`#size-desc-${r.key}`).textContent=r.widthM===null||r.heightM===null?'Размер не определён':`${result.led?'Сборка: ':''}${nf(r.widthM,3)} × ${nf(r.heightM,3)} м${result.led?'':' · '+nf(r.diagonalIn,1)+'″'}`;
  $(`#bdm-${r.key}`).innerHTML=`<span class="pill ${r.bdm.pass===true?'ok':r.bdm.pass===false?'fail':'warn'}">${r.bdm.pass===true?'Осевой запас':r.bdm.pass===false?'Малая деталь':'Нет данных'}</span><span class="sub">Предел ${nf(r.bdm.maxDistanceM,2)} м</span>`;
  $(`#pc-${r.key}`).textContent=nf(r.count,0);$(`#pw-${r.key}`).textContent=nf(r.count===0?0:r.assumedDeviceBudgetW===null?null:r.assumedDeviceBudgetW*r.count/1000,2);
  const powerField=document.querySelector(`[data-type="${r.key}"][data-property="assumedDeviceBudgetW"]`);powerField.readOnly=!!result.led;powerField.setAttribute('aria-readonly',String(!!result.led));if(result.led)powerField.value=r.assumedDeviceBudgetW===null?'':Number(r.assumedDeviceBudgetW.toFixed(2));
  document.querySelector(`[data-power-source="${r.key}"]`).textContent=result.led?'По LED-профилю':'Допущение';
 });
 result.auxiliaryGroups.forEach(g=>{$(`#pc-${g.key}`).textContent=nf(g.count,0);$(`#pw-${g.key}`).textContent=nf(g.count===0?0:g.budgetInputW===null?null:g.budgetInputW*g.count/1000,2);});
 const failures=s.categories.filter(r=>r.count&&r.bdm.pass===false);
 $('#readability-note').className='callout'+(failures.length?' amber':'');
 $('#readability-note').innerHTML=failures.length?`<strong>Нужна корректировка:</strong> ${failures.map(r=>esc(labels[r.key])).join(', ')} — заданная дальняя позиция превышает осевой предел для выбранной детали. Увеличьте изображение или значимый элемент либо сократите дистанцию.`:'Предварительная осевая проверка связывает дальнюю позицию с минимальной значимой деталью. Положительный результат не проверяет боковые места, заслонение зрителями и световую среду.';
 if(s.totals.unknownAreaSurfaceCount)$('#readability-note').innerHTML+=`<p>Площадь ${nf(s.totals.unknownAreaSurfaceCount,0)} поверхностей неизвестна. Полный итог не определён; известная часть ${nf(s.totals.knownAreaSumM2,2)} м².</p>`;
 const values=[['Компактный',s.range.lower.totalActiveAreaM2],['Текущий',s.totals.totalActiveAreaM2],['Крупный',s.range.upper.totalActiveAreaM2]],max=Math.max(1,...values.map(x=>x[1]??0));
 $('#range-chart').innerHTML=values.map(([name,a],i)=>`<div class="range-row ${i===1?'':'dim'}"><span>${name}</span><div class="bar-track"><div class="bar-fill" style="width:${(a??0)/max*100}%"></div></div><strong>${nf(a)} м²</strong></div>`).join('')+'<p class="muted">Цели компактного варианта: главный экран 3 м, интерактив 55″, медиа 65″, общие 86″, навигация 55″. Крупного: 5 м / 86″ / 86″ / 120″ / 75″. В LED-режиме каждый размер приведён к целой сетке кабинетов выбранного профиля.</p>';
 $('#content-metrics').innerHTML=`<div class="content-facts"><div><strong>${nf(c.digitalPackages,0)}</strong><span>цифровых пакетов</span></div><div><strong>${nf(result.content.content.scopedObjectPackages,0)}</strong><span>редакционных</span></div><div><strong>${nf(result.content.runtime.uniqueChannelMinutes,0)}</strong><span>канал-минут мастеров</span></div></div><p>${nf(result.content.runtime.uniqueLinearMinutes,0)} мин уникальных линейных программ. Выходное разрешение, карта каналов и технические версии фиксируются для каждой поверхности.</p>`;
 $('#reserve-note').innerHTML=`С резервом ${nf(result.reservePercent,0)}%: <strong>${nf(result.reservedBudgetW===null?null:result.reservedBudgetW/1000,2)} кВт</strong> для учтённого AV-состава. Это планировочный ориентир, не разрешённая мощность и не номинал вводного автомата.`;
 $('#sld').innerHTML=electricalDiagram(result);
 $('#power-unknown').innerHTML=`В ведомости ${nf(s.power.budget.equipmentCount,0)} записей оборудования${result.led?' с учётом LED-кабинетов':''}. <strong>Максимумы ${nf(s.power.maximum.unknownCount,0)} позиций ещё не заданы.</strong> Данные LED относятся к выбранной серии; конкретная поставка и рабочие режимы требуют проверки.`;
 $('#power-basis').textContent=result.led?'LED-полотна суммируются по целым кабинетам. В таблице указан бюджет одного собранного полотна; вспомогательные устройства редактируются отдельно. Пределы серии не заменяют проверку конкретной поставки и полного состава парка.':'Ручные бюджеты перечисленного состава. Для модульных экранов выберите LED-профиль выше.';
 updateSharedPlan();sendHeight();sendState();
}
function download(content,name,type){const u=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1500);}
document.addEventListener('input',e=>{
 const n=e.target;if(n.dataset.flow){input.flow[n.dataset.flow]=n.value===''?NaN:n.valueAsNumber;render();}
 if(n.dataset.type&&!n.readOnly){input.types[n.dataset.type][n.dataset.property]=n.value===''?null:n.valueAsNumber;render();}
 if(n.dataset.aux){input.auxiliaryBudgets[n.dataset.aux]=n.value===''?null:n.valueAsNumber;render();}
 if(n.id==='reserve'){input.reservePercent=n.value===''?NaN:n.valueAsNumber;render();}
});
$('#reset').addEventListener('click',()=>{const flow=structuredClone(input.flow);input=structuredClone(baselineInput);if(embedded)input.flow=flow;result=computeEngineering(input);buildControls();render();setStatus(embedded?'Восстановлены базовые размеры и бюджеты. Сценарий посетителей сохранён.':'Восстановлен базовый сценарий. Ответы анкеты сохранены.');});
$('#csv').addEventListener('click',()=>{
 if(!result.valid)return;const rows=[['Парк впечатлений — инженерный сценарий','24.11.2026'],['Статус','Рабочий сценарий. LED по выбранному профилю; монтаж и поставка требуют проверки'],['Экскурсионный поток',input.flow.guidedFlow],['Самостоятельный поток',input.flow.independentFlow],[],['Поверхность','Кол-во','W м','H м','Всего м²','Дальняя позиция м','Минимальная деталь %','BDM предел м']];
 result.screen.categories.forEach(r=>rows.push([labels[r.key],r.count,r.widthM,r.heightM,r.totalAreaM2,r.farDistanceM,r.elementPercent,r.bdm.maxDistanceM]));
 if(result.led){rows.push([],['LED-профиль',result.led.profile.label],['Тип','Полотен','Колонок','Рядов','Кабинетов всего','Пиксели W','Пиксели H','Масса кабинетов кг','Максимум LED Вт']);result.led.rows.forEach(r=>rows.push([labels[r.key],r.count,r.columns,r.rows,r.totalCabinets,r.pixelWidth,r.pixelHeight,r.totalMassKg,r.totalMaximumW]));}
 rows.push([],['ID оборудования','ID полотна','Категория','Планировочный бюджет Вт','Опубликованный максимум / предел серии Вт','Основание максимума','Источник','Рабочая мощность Вт']);result.screen.equipment.forEach(e=>rows.push([e.id,e.surfaceId??'',e.category,e.budgetInputW,e.maximumInputW??'Неизвестно',e.maximumInputW===null||e.maximumInputW===undefined?'Не задано':e.maximumEvidence==='published_series_upper_bound_not_delivery_passport'?'Предел серии; паспорт поставки не проверен':e.maximumEvidence??'Требует проверки',e.sourceUrl??'',e.operatingInputW??'Неизвестно']));
 rows.push([],['Сумма бюджета учтённых устройств Вт',result.screen.power.budget.totalW],['Полный максимум парка','Неизвестно'],['Исключены',result.screen.power.missingSubsystems.join(', ')]);
 download('\ufeff'+rows.map(row=>row.map(v=>'"'+String(v??'Неизвестно').replace(/"/g,'""')+'"').join(';')).join('\r\n'),'park-engineering-scenario.csv','text/csv;charset=utf-8');setStatus('Скачана ведомость поверхностей и уникального оборудования.');
});
$('#download-sld').addEventListener('click',()=>{if(result.valid){download(electricalDiagram(result),'park-electrical-concept.svg','image/svg+xml');setStatus('Скачана концептуальная однолинейная схема для текущего бюджета.');}});
$('#share').addEventListener('click',async()=>{if(!result.valid)return;const u=new URL(location.href);u.searchParams.delete('parkInstallations');u.searchParams.delete('embed');u.searchParams.set('engineering',encode({schema:'faza.park.engineering.v1',input:result.input}));$('#share-url').value=u.href;try{await navigator.clipboard.writeText(u.href);$('#share-fallback').hidden=true;setStatus('Ссылка на вариант скопирована. Ответы анкеты в неё не включены.');}catch{$('#share-fallback').hidden=false;$('#share-url').focus();$('#share-url').select();setStatus('Скопируйте выделенную ссылку.');}});
function chooseTab(id){if(embedded&&id==='placement'){window.parent.postMessage({type:'faza-open-placement'},location.origin);return;}document.querySelectorAll('.panel').forEach(n=>n.hidden=n.id!==id);document.querySelectorAll('[data-tab]').forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.tab===id)));if(id==='placement')updateSharedPlan();sendHeight();}
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>chooseTab(b.dataset.tab)));

const questions=[
 ['powerConnection','Точка подключения и существующие щиты','text','Номер ВРУ/ГРЩ, помещение, ссылка на схему'],
 ['availablePowerKW','Выделенная мощность для AV, кВт','number','По техническим условиям здания'],
 ['earthing','Фактическая система заземления','select',''],
 ['supplyData','Параметры источника и токи КЗ','text','Напряжение, фазы, резерв, данные для защиты'],
 ['firePlan','Утверждённые пути, выходы и пожарные отсеки','textarea','Ссылка на актуальные планы, ограничения и допустимую численность'],
 ['structure','Несущие основания и нагрузки','textarea','Перекрытия, стены, фермы; допустимые местные/точечные нагрузки; обследование'],
 ['mountingPermission','Разрешённые крепления и зоны запрета','textarea','Сверление, анкеры, подвесы, независимые рамы, требования собственника'],
 ['cableRoutes','Кабельные трассы и помещения оборудования','textarea','Щитовые, серверные, лотки, шахты, длины, способы прокладки и сервисный доступ'],
 ['equipmentPassports','Ограничения по уже выбранному оборудованию, если оно есть','textarea','Необязательно. Если оборудование ещё не выбрано, подбор и сбор паспортов выполняем мы. Здесь можно указать существующие приборы или обязательные ограничения'],
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
 try{
  const response=await fetch(new URL('./source-summary.json',import.meta.url));if(!response.ok)throw Error('source-summary');const data=await response.json();
  $('#evidence-content').innerHTML='<details><summary>Что найдено в Wiki и архиве</summary><div class="detail-body"><div class="evidence-grid">'+data.archive.map(a=>`<article class="card"><strong>${esc(a.number)}</strong><h3>${esc(a.title)}</h3><p>${esc(a.text)}</p><small>${esc(a.locator)}</small></article>`).join('')+'</div></div></details>'+data.sections.map(s=>`<details><summary>${esc(s.title)}</summary><div class="detail-body prose">${s.paragraphs.map(p=>`<p>${esc(p)}</p>`).join('')}</div></details>`).join('');
  $('#sources').innerHTML=data.sources.map(s=>`<article class="source-entry"><h4>[${esc(s.id)}] ${esc(s.title)}</h4><p>${esc(s.status)}</p><a href="${esc(s.url)}" target="_blank" rel="noopener">Открыть первичный источник</a></article>`).join('');
 }catch{$('#evidence-content').textContent='Не удалось загрузить материалы. Инженерное приложение доступно в архиве документов.';}
 sendHeight();
}
function sendHeight(){if(window.parent!==window){const height=Math.min(20000,Math.ceil(document.body.getBoundingClientRect().height));window.parent.postMessage({type:'faza-engineering-height',height},location.origin);}}
document.addEventListener('toggle',()=>requestAnimationFrame(sendHeight),true);
window.addEventListener('resize',sendHeight);
buildControls();render();loadData();
if(embedded)window.parent.postMessage({type:'faza-engineering-ready'},location.origin);
const initialTab=query.get('tab');if(['calculation','placement','electrical','evidence'].includes(initialTab))chooseTab(initialTab);
