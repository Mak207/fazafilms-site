import {AREA, DEFAULT_INPUT, computePark} from './model.js';
import {createParkPlan} from './plan.js';

const mount = document.getElementById('park-calculator');
const VERSION = '2026-11-24.1';
const DEFAULT_VIEW = {floorShare: AREA.lowerLevelM2 / AREA.totalM2 * 100, densityTarget: 3};
const REGION_NAMES = ['ДФО', 'СФО', 'УФО', 'ПФО', 'ЦФО', 'СКФО', 'ЮФО', 'СЗФО'];
const REGION_FULL = ['Дальний Восток', 'Сибирь', 'Урал', 'Поволжье', 'Центр', 'Северный Кавказ', 'Юг', 'Северо-Запад'];
const NF = new Intl.NumberFormat('ru-RU', {maximumFractionDigits: 1});
const format = (v, digits=1) => v === null || v === undefined || !Number.isFinite(v) ? '—' : new Intl.NumberFormat('ru-RU', {maximumFractionDigits: digits}).format(v);
const safeText = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const GROUPS = [
 {title:'Посетители и экскурсия', open:true, fields:[
  ['guidedFlow','С экскурсией','чел./ч',0,1500,10,'Постоянный входной поток экскурсионных групп.'],
  ['independentFlow','Самостоятельно','чел./ч',0,2500,10,'Добавляется к экскурсионному потоку.'],
  ['guidedMinutes','Длительность экскурсии','мин',30,480,10,'240 минут = 4 часа. Это время обхода, а не часы работы парка.'],
  ['independentMinutes','Самостоятельный визит','мин',15,480,5,'Влияет на людей одновременно в парке.'],
  ['groupSize','Размер группы','чел.',1,100,1,'Интервал запуска вычисляется из размера группы и потока.'],
 ]},
 {title:'Маршрут и участие', fields:[
  ['pointsPerDistrict','Всего точек в округе','точек',1,20,1,'Восемь округов. В исходном варианте — 80 точек на весь парк.'],
  ['interactivePointsPerDistrict','Из них интерактивных','точек',0,20,1,'Остальные точки — главные инсталляции и просмотр.'],
  ['transitionPerDistrictMinutes','Переходы и запас в округе','мин',0,30,.5,'Включите долю лестниц, лифтов и переходов между округами.'],
  ['guidedParticipation','Участвуют у каждой точки: экскурсанты','%',0,100,5,'Активные участники. Остальные могут наблюдать.'],
  ['independentParticipation','Участвуют у каждой точки: самостоятельно','%',0,100,5,'Доля всего самостоятельного потока, использующая одну типовую точку.'],
 ]},
 {title:'Интерактивы и экраны', fields:[
  ['experienceMinutes','Время взаимодействия','мин',.25,10,.25,'Один сеанс на одной станции.'],
  ['turnoverSeconds','Смена участников','сек',0,120,5,'Добавляется к длительности сеанса.'],
  ['usersPerStation','Участников на станции одновременно','чел.',1,30,1,'Считайте активных участников, а не всех зрителей вокруг.'],
  ['targetUtilization','Целевая загрузка оборудования','%',10,100,5,'80% оставляет 20% расчётного резерва времени.'],
  ['existingStationsPerPoint','Заложено станций на одну точку','шт.',0,20,1,'Редактируемая гипотеза исходного оснащения.'],
  ['surfacesPerStation','Поверхностей на одну станцию','шт.',0,6,1,'Одна станция может использовать несколько экранов.'],
  ['fixedContentSurfaces','Общие контентные поверхности','шт.',0,100,1,'Вне типовых интерактивных станций.'],
  ['navigationSurfaces','Навигационные поверхности','шт.',0,100,1,'Не увеличивают пропускную способность интерактивов.'],
 ]},
 {title:'Распределение площади', fields:[
  ['commonArea','Общие пространства','м²',0,10000,10,'Отдельный фонд: РГО, галерея, площадь и общие программы.'],
  ['heroPercent','Главная инсталляция','%',0,100,1,'Доля площади округов после вычета общих пространств.'],
  ['interactivePercent','Музей и интерактивы','%',0,100,1,'Доля площади округов.'],
  ['servicePercent','Сервис, связи и отдых','%',0,100,1,'Оставшаяся до 100% доля становится резервом.'],
  ['densityTarget','Ваш ориентир площади на посетителя','м²/чел.',.5,12,.5,'Сценарный ориентир для сравнения. Не норматив вместимости.'],
 ]},
];
const FIELD_MAP = Object.fromEntries(GROUPS.flatMap(g => g.fields).map(f => [f[0],f]));
FIELD_MAP.guidedPointsVisitedPerDistrict = ['guidedPointsVisitedPerDistrict','Остановок экскурсии в округе'];

if (mount) {
 let input = {...DEFAULT_INPUT};
 let view = {...DEFAULT_VIEW};
 let planView = 'floors';
 let selectedDistrict = 0;
 let result = null;
 let announcementTimer;
 let restored = false;

 // Only known numeric/boolean model fields can enter a shared scenario.
 try {
  const encoded = new URL(location.href).searchParams.get('parkScenario');
  if (encoded && encoded.length < 6000) {
   const parsed = JSON.parse(decodeURIComponent(escape(atob(encoded.replace(/-/g,'+').replace(/_/g,'/')))));
   const candidate = {...DEFAULT_INPUT};
   for (const key of Object.keys(DEFAULT_INPUT)) if (key !== 'districtAreas' && parsed[key] !== undefined) candidate[key] = parsed[key];
   if (computePark(candidate).valid) {
    input = candidate;
    if (Number.isFinite(parsed.floorShare) && parsed.floorShare >= 0 && parsed.floorShare <= 100) view.floorShare = parsed.floorShare;
    if (Number.isFinite(parsed.densityTarget) && parsed.densityTarget > 0 && parsed.densityTarget <= 100) view.densityTarget = parsed.densityTarget;
    restored = true;
   }
  }
 } catch { /* A malformed link never prevents a usable initial calculator. */ }

 function control(field) {
  const [key,label,unit,min,max,step,hint] = field;
  const value = key in view ? view[key] : input[key];
  return `<div class="pc-field"><label for="pc-${key}">${label}<span>${unit}</span></label><div class="pc-input-pair"><input type="range" id="pc-range-${key}" data-field="${key}" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}, ползунок" aria-describedby="pc-hint-${key}"><input type="number" id="pc-${key}" data-field="${key}" min="${min}" max="${max}" step="${step}" value="${value}" aria-describedby="pc-hint-${key}" inputmode="decimal"></div><p id="pc-hint-${key}" class="pc-hint">${hint}</p></div>`;
 }
 mount.innerHTML = `
 <div class="pc-header"><div><p class="pc-eyebrow">Сценарий работы парка</p><h2 id="calculator-title">Посетители, площади<br class="pc-wide-break"> и оборудование</h2><p class="pc-lead">Измените параметры. Схема покажет, как связаны поток людей, экскурсия и потребность в интерактивах.</p></div><div class="pc-area-stamp"><span>Геометрическая основа</span><strong>18 884 <small>м²</small></strong><span>два уровня · восемь округов</span></div></div>
 <div class="pc-toolbar"><div class="pc-presets" role="group" aria-label="Примеры сценариев"><button type="button" data-preset="guided">Только экскурсии</button><button type="button" data-preset="mixed" aria-pressed="true">Смешанный поток</button><button type="button" data-preset="peak">Пиковый поток</button></div><div class="pc-actions"><button type="button" id="pc-share">Ссылка на вариант</button><button type="button" id="pc-export">Скачать расчёт</button><button type="button" id="pc-reset">Сбросить</button></div></div>
 <p class="pc-action-status" id="pc-action-status" role="status"></p><div id="pc-share-fallback" hidden><label for="pc-share-url">Ссылка на текущий вариант</label><input id="pc-share-url" type="text" readonly></div>
 <div class="pc-errors" id="pc-errors" role="alert" hidden></div>
 <div class="pc-kpis" id="pc-kpis"><div class="pc-kpi"><span>Одновременно в парке</span><strong id="pc-total-people">—</strong><small id="pc-people-detail"></small></div><div class="pc-kpi"><span>Интервал запуска групп</span><strong id="pc-group-gap">—</strong><small id="pc-group-detail"></small></div><div class="pc-kpi"><span>Нужно экранных поверхностей</span><strong id="pc-total-surfaces">—</strong><small id="pc-surfaces-detail"></small></div><div class="pc-kpi"><span>Время на одну точку</span><strong id="pc-point-budget">—</strong><small id="pc-time-detail"></small></div></div>
 <div class="pc-workspace"><aside class="pc-controls" aria-label="Настройки расчёта"><div class="pc-controls-heading"><h3>Исходные данные</h3><span>Все значения меняются</span></div>${GROUPS.map(g=>`<details class="pc-control-section" ${g.open?'open':''}><summary>${g.title}<span aria-hidden="true">+</span></summary><div class="pc-control-fields">${g.fields.map(control).join('')}${g.title==='Маршрут и участие'?'<label class="pc-check"><input type="checkbox" id="pc-all-points" '+(input.guidedVisitAllPoints?'checked':'')+'> Экскурсия проходит все точки</label><div id="pc-route-points" '+(input.guidedVisitAllPoints?'hidden':'')+'>'+control(['guidedPointsVisitedPerDistrict','Остановок экскурсии в округе','точек',1,20,1,'Остальные точки доступны для самостоятельного выбора.'])+'</div>':''}${g.title==='Распределение площади'?'<p class="pc-reserve">Резерв: <strong id="pc-reserve-percent">10%</strong></p><button type="button" class="pc-area-proposal" id="pc-area-proposal">Подставить доли из проекта паспорта</button>':''}</div></details>`).join('')}</aside>
 <div class="pc-results" id="pc-results"><section class="pc-diagram-section" aria-labelledby="pc-diagram-title"><div class="pc-section-heading"><div><p class="pc-eyebrow">Связанная схема</p><h3 id="pc-diagram-title">Как распределяется нагрузка</h3></div><div class="pc-view-tabs" role="group" aria-label="Вид схемы"><button type="button" data-plan-view="floors" aria-pressed="true">Два уровня</button><button type="button" data-plan-view="districts" aria-pressed="false">Восемь округов</button></div></div><div class="pc-floor-control" id="pc-floor-control"><label for="pc-floorShare">Посетителей на нижнем уровне <strong id="pc-floor-share-label"></strong></label><input type="range" id="pc-floorShare" min="0" max="100" step="1" value="${view.floorShare}" aria-describedby="pc-floor-hint"><p id="pc-floor-hint">Начальное распределение пропорционально площади. Ползунок меняет долю людей между уровнями.</p></div><div id="pc-plan"></div></section>
 <section class="pc-selected-section" id="pc-selected-section" hidden aria-labelledby="pc-selected-title"><div class="pc-section-heading"><h3 id="pc-selected-title"></h3><span class="pc-assumption-tag">Равное время по округам</span></div><div class="pc-selected-stats" id="pc-selected-stats"></div><div class="pc-point-strip" id="pc-point-strip" aria-label="Точки выбранного округа"></div><p class="pc-note">Это типовые места в расчёте. Темы и реальные координаты экспонатов задаются отдельно.</p></section>
 <section class="pc-capacity-section" aria-labelledby="pc-capacity-title"><div class="pc-section-heading"><div><p class="pc-eyebrow">Одна типовая интерактивная точка</p><h3 id="pc-capacity-title">Спрос и пропускная способность</h3></div><span class="pc-assumption-tag" id="pc-point-count-label"></span></div><div class="pc-capacity-bars" id="pc-capacity-bars"></div><div class="pc-capacity-stats" id="pc-capacity-stats"></div><p id="pc-equipment-meaning" class="pc-note"></p><div class="pc-surface-breakdown" id="pc-surface-breakdown"></div></section>
 <section class="pc-area-section" aria-labelledby="pc-area-title"><div class="pc-section-heading"><div><p class="pc-eyebrow">Функциональные площади</p><h3 id="pc-area-title">Весь объём модели учтён</h3></div><strong id="pc-area-check"></strong></div><div class="pc-area-bar" id="pc-area-bar" role="img" aria-label="Распределение площади модели"></div><div class="pc-area-legend" id="pc-area-legend"></div><p class="pc-note" id="pc-area-detail"></p></section>
 <section class="pc-alerts-section" aria-labelledby="pc-alerts-title"><div class="pc-section-heading"><h3 id="pc-alerts-title">Что требует внимания</h3><span id="pc-alert-count"></span></div><div id="pc-alerts"></div></section>
 <details class="pc-method"><summary>Допущения, исходная база и формулы<span aria-hidden="true">+</span></summary><div class="pc-method-content"><h4>Откуда взялись 168 и почему результат может отличаться от 238</h4><p>В начальных настройках 72 интерактивные точки × 2 станции × 1 поверхность + 12 общих контентных + 12 навигационных = 168. Это редактируемое разложение исходной оценки, а не утверждённая ведомость. Прежнее число 238 не подставляется в формулу. При 300 экскурсантах и 500 самостоятельных посетителях в час текущие допущения дают 240 поверхностей.</p><h4>Что означает расчёт</h4><ul><li>Одна станция обслуживает несколько <strong>активных участников</strong>. Экранная поверхность не всегда означает отдельное устройство или место обслуживания.</li><li>Все интерактивы представлены одной типовой точкой. Для закупочной ведомости нужно задать параметры каждого конкретного интерактива.</li><li>Участие 40% означает, что 40% потока использует каждую типовую точку. Поток на точку не делится на восемь округов.</li><li>Показатели присутствия — средние при установившемся входном потоке. Очереди и столкновения конкретных групп здесь не симулируются.</li><li>Групповая проверка предполагает свободные станции к приходу группы. Совместное расписание с самостоятельными посетителями требует отдельной проверки.</li></ul><h4>Формулы</h4><div class="pc-formulas"><p><strong>Людей одновременно</strong><br>Поток экскурсии × время экскурсии / 60 + самостоятельный поток × время визита / 60.</p><p><strong>Интервал запуска</strong><br>60 × размер группы / экскурсионный поток.</p><p><strong>Время на точку</strong><br>(Время экскурсии / 8 − переходы в округе) / число остановок в округе.</p><p><strong>Спрос у одной точки</strong><br>Экскурсионный поток × доля участия + самостоятельный поток × доля участия.</p><p><strong>Выпуск одной станции в час</strong><br>60 × активных участников / (сеанс + смена участников / 60) × целевая загрузка.</p><p><strong>Станций на точку</strong><br>Больший результат из двух: округлённая вверх потребность по потоку и число параллельных станций для участвующей части группы за время остановки.</p><p><strong>Поверхности</strong><br>Станций на точку × число интерактивных точек × поверхностей на станцию + общие контентные + навигационные.</p></div><h4>Геометрическая основа</h4><p>По сохранённому обмеру 3D-модели: нижний основной пол — 12 312,971 м², верхний — 6 571,084 м². Сумма — 18 884,055 м². Контуры на схеме повторяют эти полы; распределение посетителей и округов задаётся сценарием. Границы экспозиций и очереди на планах не размещены.</p><p>Ориентир м²/чел. используется для сравнения сценариев. Площади ещё включают экспонаты и оборудование: расчёт не устанавливает допустимую вместимость или нормативную безопасность.</p><p class="pc-note">Версия расчёта ${VERSION} · <a href="#tour">Посмотреть 3D-модель</a></p></div></details>
 </div></div><p id="pc-live" class="pc-sr-only" aria-live="polite" aria-atomic="true"></p>`;

 const $ = selector => mount.querySelector(selector);
 const set = (selector,value) => { $(selector).textContent = value; };
 const plan = createParkPlan($('#pc-plan'), {onSelectDistrict(index) {
  if (index === selectedDistrict) return;
  selectedDistrict = index;
  renderSelection();
  updatePlan();
 }});

 function updatePlan() {
  if (!result?.valid) return;
  plan.update({view:planView, floorShare:view.floorShare, densityTarget:view.densityTarget,
   totalOccupancy:result.flows.totalOccupancy, guidedOccupancy:result.flows.guidedOccupancy, independentOccupancy:result.flows.independentOccupancy,
   selectedDistrict, districts:result.districts.map((d,i)=>({id:d.id,name:REGION_NAMES[i],people:d.totalOccupancy,groups:result.flows.guidedGroupsPerDistrictAverage,area:d.areaM2,screens:d.interactiveSurfaces}))});
  set('#pc-floor-share-label',format(view.floorShare,1)+'%');
  $('#pc-floor-control').hidden = planView !== 'floors';
  $('#pc-selected-section').hidden = planView !== 'districts';
 }

 function renderSelection() {
  if (!result?.valid) return;
  const d=result.districts[selectedDistrict];
  set('#pc-selected-title',REGION_NAMES[selectedDistrict]+' · '+REGION_FULL[selectedDistrict]);
  $('#pc-selected-stats').innerHTML = [
   [format(d.areaM2)+' м²','площадь округа'],[format(d.totalOccupancy),'людей одновременно'],
   [format(d.interactiveSurfaces,0),'поверхностей интерактивов'],[format(d.requiredStations,0),'станций по расчёту']
  ].map(([v,l])=>`<div><strong>${v}</strong><span>${l}</span></div>`).join('');
  const visibleCount=Math.min(30,input.pointsPerDistrict);
  $('#pc-point-strip').innerHTML=Array.from({length:visibleCount},(_,i)=>`<div class="pc-point ${i<input.interactivePointsPerDistrict?'pc-point-interactive':'pc-point-show'}"><span>${i+1}</span><strong>${i<input.interactivePointsPerDistrict?format(result.capacity.requiredStationsPerPoint,0)+' ст.':'Обзор'}</strong><small>${i<input.interactivePointsPerDistrict?'интерактив':'инсталляция'}</small></div>`).join('');
 }

 function bar(label,value,maxValue,cls,caption) {
  const width = maxValue > 0 ? Math.min(100,value/maxValue*100):0;
  return `<div class="pc-bar-row"><div class="pc-bar-label"><span>${label}</span><strong>${format(value)} <small>участий/ч</small></strong></div><div class="pc-bar-track"><span class="${cls}" style="width:${width}%"></span></div><p>${caption}</p></div>`;
 }

 function render() {
  result=computePark(input);
  const viewErrors=[];
  if(!Number.isFinite(view.densityTarget)||view.densityTarget<=0) viewErrors.push({field:'densityTarget',message:'Ориентир площади должен быть больше нуля.'});
  const errors=[...result.errors,...viewErrors];
  const valid=result.valid&&!errors.length;
  $('#pc-errors').hidden=valid;
  $('#pc-results').hidden=!valid;
  $('#pc-kpis').hidden=!valid;
  $('#pc-export').disabled=!valid;
  $('#pc-share').disabled=!valid;
  for(const el of mount.querySelectorAll('input[data-field]')) el.removeAttribute('aria-invalid');
  if (!valid) {
   clearTimeout(announcementTimer);
   set('#pc-live','Проверьте исходные данные. Расчёт скрыт до исправления ошибок.');
   $('#pc-errors').innerHTML='<strong>Проверьте исходные данные</strong><ul>'+errors.map(e=>`<li>${safeText(FIELD_MAP[e.field]?.[1]||'Расчёт')}: ${safeText(e.message)}</li>`).join('')+'</ul>';
   errors.forEach(e=>mount.querySelectorAll(`[data-field="${e.field}"]`).forEach(el=>el.setAttribute('aria-invalid','true')));
   window.__parkCalculator={version:VERSION,input:{...input},view:{...view},result};
   return;
  }
  const {flows:f,time:t,capacity:c,surfaces:s,areas:a}=result;
  set('#pc-total-people',format(f.totalOccupancy));
  set('#pc-people-detail',format(f.guidedOccupancy)+' с экскурсией + '+format(f.independentOccupancy)+' самостоятельно');
  set('#pc-group-gap',f.groupLaunchIntervalMinutes===null?'Нет групп':format(f.groupLaunchIntervalMinutes)+' мин');
  set('#pc-group-detail',format(f.guidedGroupsInPark)+' групп одновременно');
  set('#pc-total-surfaces',format(s.total,0));
  set('#pc-surfaces-detail','Задано '+format(s.existingTotal,0)+' · добавить '+format(s.additional,0));
  set('#pc-point-budget',input.guidedFlow>0?format(t.guidedPointBudgetMinutes,2)+' мин':'Нет экскурсии');
  set('#pc-time-detail',format(t.districtVisitMinutes)+' мин на округ · переходы '+format(input.transitionPerDistrictMinutes)+' мин');
  set('#pc-reserve-percent',format(a.reservePercent)+'%');
  set('#pc-point-count-label',format(c.interactivePointCount,0)+' точек в парке');
  const maximum=Math.max(c.demandPerPointPerHour,c.sustainableCapacityPerPointPerHour,c.existingSustainableCapacityPerPointPerHour,1);
  $('#pc-capacity-bars').innerHTML=bar('Спрос на одну точку',c.demandPerPointPerHour,maximum,'pc-bar-demand',format(c.guidedDemandPerPointPerHour)+' экскурсионных + '+format(c.independentDemandPerPointPerHour)+' самостоятельных участий')
   +bar('Выпуск заданных станций',c.existingSustainableCapacityPerPointPerHour,maximum,'pc-bar-existing',format(input.existingStationsPerPoint,0)+' станции на точку при загрузке '+format(input.targetUtilization)+'%')
   +bar('Выпуск по новому расчёту',c.sustainableCapacityPerPointPerHour,maximum,'pc-bar-proposed',format(c.requiredStationsPerPoint,0)+' станции на точку при той же загрузке');
  $('#pc-capacity-stats').innerHTML=[
   [format(c.requiredStationsPerPoint,0),'станций на точку'],[format(c.guidedBatchParticipants,0),'участников из группы'],
   [format(t.stationCycleMinutes,2)+' мин','сеанс со сменой'],[c.guidedBatchFitsBudget?'Укладывается':'Не укладывается','группа во время остановки',c.guidedBatchFitsBudget?'good':'bad']
  ].map(([v,l,state])=>`<div class="${state?'pc-state-'+state:''}"><strong>${v}</strong><span>${l}</span></div>`).join('');
  set('#pc-equipment-meaning','Нужно '+format(c.requiredStationsTotal,0)+' станций на '+format(c.interactivePointCount,0)+' интерактивных точках. Округление вверх выполнено у каждой точки, затем посчитан весь парк.');
  $('#pc-surface-breakdown').innerHTML=`<div><span>Интерактивы</span><strong>${format(s.interactive,0)}</strong></div><b>+</b><div><span>Общий контент</span><strong>${format(s.fixedContent,0)}</strong></div><b>+</b><div><span>Навигация</span><strong>${format(s.navigation,0)}</strong></div><b>=</b><div class="pc-surface-total"><span>Поверхности</span><strong>${format(s.total,0)}</strong></div>`;
  const segments=[['Общие пространства',a.commonAreaM2,'#72a8ff'],['Главные инсталляции',a.heroAreaM2,'#ceff62'],['Музей и интерактивы',a.interactiveAreaM2,'#67d8cc'],['Сервис и связи',a.serviceAreaM2,'#bca4f6'],['Резерв',a.reserveAreaM2,'#65726b']];
  $('#pc-area-bar').innerHTML=segments.filter(x=>x[1]>0).map(([label,value,color])=>`<span style="width:${value/AREA.totalM2*100}%;background:${color}" title="${label}: ${format(value)} м²"></span>`).join('');
  $('#pc-area-bar').setAttribute('aria-label',segments.map(([label,value])=>label+': '+format(value)+' квадратных метров').join('; '));
  $('#pc-area-legend').innerHTML=segments.map(([label,value,color])=>`<div><i style="background:${color}"></i><span>${label}</span><strong>${format(value)} м²</strong></div>`).join('');
  set('#pc-area-check','Σ '+format(AREA.totalM2)+' м²');
  set('#pc-area-detail','На округ — '+format(a.districtAreaAverageM2)+' м². На интерактивную точку — '+format(a.interactiveAreaPerPointM2)+' м², на станцию — '+format(a.interactiveAreaPerRequiredStationM2)+' м². Это фонд площади до детальной расстановки оборудования и очередей.');
  const alerts=result.warnings.map(w=>w.message.replaceAll('имеющихся','заданных').replaceAll('Имеющиеся','Заданные'));
  let criticalCount=result.warnings.length;
  if(f.totalOccupancy>0 && a.accessibleM2PerVisitor!==null && a.accessibleM2PerVisitor<view.densityTarget) {
   alerts.push('Экспозиции и общие зоны дают '+format(a.accessibleM2PerVisitor)+' м² на человека — ниже вашего ориентира '+format(view.densityTarget)+' м²/чел. Проверьте распределение людей и свободную площадь после расстановки.');
   criticalCount++;
  }
  if(input.guidedFlow>0&&t.guidedPointBudgetMinutes>0) alerts.push('При '+format(input.groupSize,0)+' участниках и '+format(input.guidedFlow)+' чел./ч в округе в среднем '+format(f.guidedGroupsPerDistrictAverage)+' экскурсионных групп. План одной группы не описывает всю нагрузку.');
  if(input.surfacesPerStation===0&&c.requiredStationsTotal>0) alerts.push('Для интерактивных станций задано 0 экранных поверхностей. Это допустимо для безэкранных интерактивов; число станций продолжает рассчитываться.');
  set('#pc-alert-count',criticalCount?'Замечаний по расчёту: '+format(criticalCount,0):'Расчёт выполнен');
  $('#pc-alerts').innerHTML=alerts.length?alerts.map((msg,i)=>`<p class="pc-alert ${i<criticalCount?'pc-alert-warning':'pc-alert-info'}">${safeText(msg)}</p>`).join(''):'<p class="pc-alert pc-alert-info">В выбранных параметрах арифметических конфликтов не обнаружено. Реальная расстановка и очередь требуют отдельной проверки.</p>';
  renderSelection();updatePlan();
  clearTimeout(announcementTimer);
  announcementTimer=setTimeout(()=>set('#pc-live',`Расчёт обновлён: ${format(f.totalOccupancy)} человек одновременно, ${format(s.total,0)} экранных поверхностей, ${format(c.requiredStationsPerPoint,0)} станции на интерактивную точку.`),400);
  window.__parkCalculator={version:VERSION,input:{...input},view:{...view},result};
 }

 function syncControls() {
  for(const element of mount.querySelectorAll('input[data-field]')) {
   const key=element.dataset.field;
   element.value=key in view?view[key]:input[key];
  }
  $('#pc-all-points').checked=input.guidedVisitAllPoints;
  $('#pc-route-points').hidden=input.guidedVisitAllPoints;
  $('#pc-floorShare').value=view.floorShare;
 }
 function clearPresetSelection() {mount.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed','false'));}
 mount.addEventListener('input',event=>{
  const key=event.target.dataset.field;
  if(!key)return;
  const value=event.target.value===''?NaN:event.target.valueAsNumber;
  if(key in view)view[key]=value;else input[key]=value;
  // Keep the alternate control synchronized without replacing a focused input.
  mount.querySelectorAll(`[data-field="${key}"]`).forEach(el=>{if(el!==event.target&&Number.isFinite(value))el.value=value;});
  clearPresetSelection();render();
 });
 $('#pc-all-points').addEventListener('change',event=>{input.guidedVisitAllPoints=event.target.checked;$('#pc-route-points').hidden=input.guidedVisitAllPoints;render();});
 $('#pc-floorShare').addEventListener('input',event=>{view.floorShare=event.target.valueAsNumber;updatePlan();if(window.__parkCalculator)window.__parkCalculator.view={...view};});
 mount.querySelectorAll('[data-plan-view]').forEach(button=>button.addEventListener('click',()=>{
  planView=button.dataset.planView;mount.querySelectorAll('[data-plan-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));updatePlan();
 }));
 mount.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{
  input={...DEFAULT_INPUT};view={...DEFAULT_VIEW};
  if(button.dataset.preset==='guided')input.independentFlow=0;
  if(button.dataset.preset==='peak'){input.guidedFlow=600;input.independentFlow=1000;input.independentMinutes=180;}
  mount.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  syncControls();render();set('#pc-action-status','Выбран пример «'+button.textContent+'». Параметры можно изменить.');
 }));
 $('#pc-reset').addEventListener('click',()=>{
  input={...DEFAULT_INPUT};view={...DEFAULT_VIEW};selectedDistrict=0;
  mount.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.preset==='mixed')));
  syncControls();render();set('#pc-action-status','Восстановлены исходные настройки.');
 });
 $('#pc-area-proposal').addEventListener('click',()=>{
  input.heroPercent=23.68;input.interactivePercent=36.32;input.servicePercent=30;
  syncControls();clearPresetSelection();render();set('#pc-action-status','Подставлено предложение паспорта: 23,68 / 36,32 / 30 / 10%.');
 });
 $('#pc-share').addEventListener('click',async()=>{
  if(!result?.valid)return;
  const data={...result.input,...view};delete data.districtAreas;
  const encoded=btoa(unescape(encodeURIComponent(JSON.stringify(data)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const url=new URL(location.href);url.searchParams.set('parkScenario',encoded);url.hash='calculator';
  try{await navigator.clipboard.writeText(url.href);set('#pc-action-status','Ссылка скопирована. Она откроет именно эти параметры.');}
  catch{$('#pc-share-fallback').hidden=false;$('#pc-share-url').value=url.href;$('#pc-share-url').focus();$('#pc-share-url').select();set('#pc-action-status','Скопируйте выделенную ссылку.');}
 });
 $('#pc-export').addEventListener('click',()=>{
  if(!result?.valid)return;
  const rows=[['Парк впечатлений — расчёт сценария',VERSION],['Тип','Показатель','Значение','Единица']];
  for(const g of GROUPS)for(const [key,label,unit] of g.fields)rows.push(['Вход',label,key in view?view[key]:input[key],unit]);
  rows.push(['Вход','Экскурсия проходит все точки',input.guidedVisitAllPoints?'Да':'Нет','']);
  rows.push(['Вход','Остановок экскурсии в округе',input.guidedVisitAllPoints?input.pointsPerDistrict:input.guidedPointsVisitedPerDistrict,'точек']);
  rows.push(['Вход','Доля людей на нижнем уровне',view.floorShare,'%']);
  const output=[['Людей одновременно',result.flows.totalOccupancy,'чел.'],['Экскурсантов одновременно',result.flows.guidedOccupancy,'чел.'],['Самостоятельных одновременно',result.flows.independentOccupancy,'чел.'],['Интервал запуска',result.flows.groupLaunchIntervalMinutes,'мин'],['Время на точку',result.time.guidedPointBudgetMinutes,'мин'],['Интерактивных точек',result.capacity.interactivePointCount,'шт.'],['Спрос у одной точки',result.capacity.demandPerPointPerHour,'участий/ч'],['Станций на точку',result.capacity.requiredStationsPerPoint,'шт.'],['Всего станций',result.capacity.requiredStationsTotal,'шт.'],['Экранных поверхностей',result.surfaces.total,'шт.'],['Задано поверхностей',result.surfaces.existingTotal,'шт.'],['Добавить поверхностей',result.surfaces.additional,'шт.'],['Площадь модели',AREA.totalM2,'м²']];
  output.forEach(r=>rows.push(['Результат',...r]));
  rows.push(['Допущение','Типовой интерактив; исходная ведомость оборудования не утверждена.','','']);
  result.warnings.forEach(w=>rows.push(['Замечание',w.message,'','']));
  const csv='\ufeff'+rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='Парк_впечатлений_Расчёт_сценария.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  set('#pc-action-status','Скачан расчёт с исходными параметрами и замечаниями.');
 });
 syncControls();render();
 if(restored){clearPresetSelection();set('#pc-action-status','Восстановлен вариант из ссылки.');}
}
