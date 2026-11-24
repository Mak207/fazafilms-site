import {AREA, CONTENT_DEFAULTS, computeContentPlan} from './content-model.js?v=20261124-ux2';
import {createParkPlan} from './visitor-plan.js?v=20261124-ux2';
import {createScreenPlan} from './screen-plan.js?v=20261124-ux2';
import {createInstallationQuestionnaire, getQuestionnaireCalculationInputs} from './questionnaire.js?v=20261124-ux2';

const mount = document.getElementById('park-installations');
const VERSION = '24.11.2026 · редакция 2';
const NF = (n,d=1) => n === null || n === undefined || !Number.isFinite(Number(n)) ? '—' : new Intl.NumberFormat('ru-RU',{maximumFractionDigits:d}).format(n);
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors = {hero:'#ffbd66',interactive:'#68b7ff',media:'#c4a0ff',objects:'#b7c3cb',common:'#55d4b0',navigation:'#ff91b6'};
const GROUPS = [
 {title:'Посетители и группы',open:true,fields:[
  ['guidedFlow','Экскурсионный поток','чел./ч',0,3000,10,'Постоянный входной поток групп.',true],
  ['independentFlow','Самостоятельный поток','чел./ч',0,5000,10,'Нагружает те же интерактивы.',true],
  ['guidedMinutes','Время экскурсии','мин',1,720,5,'240 минут — обход, а не рабочий день.'],
  ['independentMinutes','Самостоятельный визит','мин',1,720,5,'Среднее время присутствия самостоятельного посетителя.'],
  ['groupSize','Человек в группе','чел.',1,100,1,'Из него считается интервал запуска.']
 ]},
 {title:'Состав одной территории',fields:[
  ['heroPointsPerDistrict','Главные инсталляции','шт.',0,10,1,'Крупные многоканальные шоу или центральные экспонаты.'],
  ['interactivePointsPerDistrict','Интерактивные точки','шт.',0,15,1,'У каждой может быть несколько параллельных станций.'],
  ['mediaPointsPerDistrict','Медийные точки','шт.',0,20,1,'Линейные программы с самостоятельным просмотром.'],
  ['objectPointsPerDistrict','Предметные точки','шт.',0,20,1,'Экспонат и редакционный комплект; экран по умолчанию не требуется.']
 ]},
 {title:'Нагрузка на интерактивы',fields:[
  ['guidedParticipation','Участвуют из экскурсии','%',0,100,5,'Доля группы, которая активно использует каждую типовую точку.',true],
  ['independentParticipation','Участвуют самостоятельно','%',0,100,5,'Доля всего самостоятельного потока, которая пользуется одной типовой точкой.',true],
  ['experienceMinutes','Один сеанс','мин',.25,15,.25,'Продолжительность активного взаимодействия.'],
  ['turnoverSeconds','Смена участников','сек',0,180,5,'Добавляется к сеансу.'],
  ['usersPerStation','Активных мест на станции','чел.',1,30,1,'Зрители вокруг не являются обслуживаемыми местами.'],
  ['targetUtilization','Целевая загрузка','%',10,100,5,'80% оставляет расчётный запас на колебания потока.'],
  ['minimumStationsPerInteractive','Минимум станций у точки','шт.',0,10,1,'Базовая комплектация даже при нулевом потоке.']
 ]},
 {title:'Физические поверхности',fields:[
  ['heroSurfacesPerInstallation','На главную инсталляцию','шт.',0,20,1,'Экран или зона проекции; не равно числу проекторов.'],
  ['surfacesPerInteractiveStation','На интерактивную станцию','шт.',0,10,1,'Повторный экран использует ту же программу.'],
  ['mediaSurfacesPerInstallation','На медийную точку','шт.',0,10,1,'По умолчанию один экран.'],
  ['objectSurfacesPerInstallation','На предметную точку','шт.',0,10,1,'Можно задать 0 для безэкранной экспозиции.'],
  ['commonInstallations','Общие инсталляции','шт.',0,50,1,'Добавляются к территориальной программе. РГО автоматически не прибавляется.'],
  ['commonSurfaces','Общие поверхности','шт.',0,100,1,'Заданы суммарно, отдельно от числа установок.'],
  ['navigationSurfaces','Навигационные экраны','шт.',0,100,1,'Навигация считается отдельной системой.']
 ]},
 {title:'Хронометраж и маршрут',fields:[
  ['heroMinutes','Главное шоу / остановка','мин',0,30,.25,'В базовом обходе показываем программу целиком.'],
  ['interactiveStopMinutes','Остановка у интерактива','мин',0,30,.25,'Проверяется, успевает ли участвующая часть группы.'],
  ['mediaMinutes','Медийная программа','мин',0,30,.25,'Одна уникальная линейная программа.'],
  ['objectStopMinutes','Предметная остановка','мин',0,30,.25,'Время экскурсии, не минуты видеоконтента.'],
  ['transitionPerDistrictMinutes','Переходы в территории','мин',0,60,.5,'Включите долю лестниц, лифтов, сборов и смен зон.'],
  ['commonRouteMinutes','Общий блок маршрута','мин',0,120,.5,'Время посещения общепарковых установок.'],
  ['commonMinutesPerPackage','Одна общая программа','мин',0,30,.25,'Используется для оценки линейного производства.']
 ]},
 {title:'Уникальность и версии контента',fields:[
  ['heroUniqueShowCount','Уникальных главных шоу','шт.',0,100,1,'Пусто — по одному на инсталляцию.',false,true],
  ['interactiveContentPackageCount','Интерактивных контентных пакетов','шт.',0,300,1,'Пусто — по одному на точку, независимо от числа станций.',false,true],
  ['mediaUniqueProgramCount','Уникальных медийных программ','шт.',0,300,1,'Пусто — по одной на медийную точку.',false,true],
  ['objectEditorialPackageCount','Предметных редакционных пакетов','шт.',0,300,1,'Пусто — по одному на предметную точку.',false,true],
  ['commonPackages','Общих контентных пакетов','шт.',0,100,1,'Не обязательно равно числу общих установок.'],
  ['languageCount','Языковых комплектов','шт.',1,20,1,'Меняет число выдаваемых комплектов, не исходных сюжетов.'],
  ['deliveryVersions','Технических версий выдачи','шт.',1,20,1,'Например, разные форматы, если они действительно нужны.']
 ]},
 {title:'Фонд площади · предложение',fields:[
  ['commonArea','Общие пространства','м²',0,18000,10,'Предлагаемый фонд общих зон внутри принятых 18 884 м².'],
  ['heroPercent','Главные инсталляции','%',0,100,1,'Доля остатка площади после общих пространств.'],
  ['museumPercent','Музейная часть','%',0,100,1,'Интерактивные, медийные и предметные точки.'],
  ['servicePercent','Сервис и связи','%',0,100,1,'Остаток до 100% — сценарный резерв.'],
  ['interactiveMuseumPercent','Интерактивы внутри музея','%',0,100,5,'Доля музейного фонда, не всего парка.'],
  ['mediaMuseumPercent','Медиа внутри музея','%',0,100,5,'Доля музейного фонда.'],
  ['objectMuseumPercent','Предметы внутри музея','%',0,100,5,'Доля музейного фонда.']
 ]}
];
const labels = Object.fromEntries(GROUPS.flatMap(g=>g.fields).map(f=>[f[0],f[1]]));
let input = {...CONTENT_DEFAULTS};
let result;
let dossier;
let engineeringTypes;
let engineeringValid=true;
let scenarioIssueCount=0;
const baseCounts=computeContentPlan(CONTENT_DEFAULTS).counts;
let view = 'overview';
let planView = 'floors';
let selectedDistrict = 0;
let floorShare = AREA.lowerLevelM2 / AREA.totalM2 * 100;
let regions = ['Дальний Восток','Сибирь','Урал','Поволжье','Центр и Черноземье','Северный Кавказ','Юг','Северо-Запад и Арктика'];
let restored = false;
const hadSharedAnswers = new URL(location.href).searchParams.has('parkAnswers');
const decode = v => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(v.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));
const encode = v => btoa(Array.from(new TextEncoder().encode(JSON.stringify(v)),b=>String.fromCharCode(b)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
try {
 const p=new URL(location.href).searchParams.get('parkInstallations');
 if(p && p.length<20000){const s=decode(p);if(s?.schema==='faza.park.installations.v1'){const checked=computeContentPlan(s.input);if(checked.valid){input={...checked.input};restored=true;}}}
}catch{}

if(mount){
 const field = f => {
  const [key,label,unit,min,max,step,hint,range,optional]=f;
  return `<div class="ic-field"><label for="ic-${key}">${label}<span>${unit}</span></label><div class="ic-control-pair ${range?'has-range':''}">${range?`<input type="range" data-field="${key}" id="ic-range-${key}" min="${min}" max="${max}" step="${step}" value="${input[key]}" aria-label="${label}, ползунок">`:''}<input type="number" id="ic-${key}" data-field="${key}" min="${min}" max="${max}" step="${step}" value="${input[key]??''}" ${optional?'data-optional="true" placeholder="Автоматически"':''} aria-describedby="ic-hint-${key}" inputmode="decimal"></div><p id="ic-hint-${key}">${hint}</p></div>`;
 };
 mount.innerHTML=`
 <div class="ic-heading"><div><p class="ic-eyebrow">Парк впечатлений · рабочий вариант</p><h2 id="installations-title">Расчёт инсталляций</h2><p class="ic-intro">Сколько создаём, где размещаем и что меняется при другом потоке посетителей.</p></div></div>
 <div class="ic-basis" aria-label="Принятая основа проекта"><span><strong>18 884 м²</strong> по 3D из DWG</span><span><strong>8 округов</strong></span><span><strong>4 часа</strong> полная экскурсия</span></div>
 <nav class="ic-tabs" data-az-zone="controls" aria-label="Расчёт инсталляций: разделы"><button type="button" data-view="overview" aria-pressed="true"><span>Состав и план</span><small>Что и где размещаем</small></button><button type="button" data-view="calculator" aria-pressed="false"><span>Посетители и расчёт</span><small>Как поток меняет объём</small></button><button type="button" data-view="engineering" aria-pressed="false"><span>Размеры и электрика</span><small>Площадь экранов и питание</small></button><button type="button" data-view="documents" aria-pressed="false"><span>Обоснование</span><small>Документ, формулы, источники</small></button><button type="button" data-view="questionnaire" aria-pressed="false"><span>Решения и данные</span><small>Что ещё нужно согласовать</small></button></nav>
 <div id="ic-scenario-note" class="ic-current-label">Предложенный сценарий</div>
 <div id="ic-scenario-issues" class="ic-scenario-issues" role="status" hidden></div>
 <div class="ic-errors" id="ic-errors" role="alert" hidden></div>
 <section id="ic-overview" class="ic-view" aria-label="Состав и план экранов">
  <div id="ic-screen-plan"></div>
  <div class="ic-after-plan"><h3>Объём выбранного сценария</h3><div class="ic-kpis" id="ic-kpis" aria-label="Предлагаемый объём текущего сценария"></div><div class="ic-overview-actions"><p>Состав оборудования и контента разрабатываем вместе. Эти количества — изменяемое предложение.</p><button type="button" data-go="calculator">Изменить сценарий</button></div></div>
  <details class="ic-document-section ic-composition"><summary>Из чего складывается объём<span aria-hidden="true">+</span></summary><div class="ic-prose"><p><strong>Инсталляция</strong> — отдельный посетительский опыт. <strong>Экранная поверхность</strong> — одно изображение. <strong>Пакет контента</strong> — уникальная работа: копии на параллельных станциях не создают новых сюжетов.</p><div id="ic-scope-diagram" class="ic-scope-diagram" aria-label="Состав инсталляций"></div><div id="ic-register"></div><p class="ic-note">Навигация считается отдельно от посетительских инсталляций. Проекторы, серверы, опоры и свет уточняются в ведомости оборудования.</p></div></details>
 </section>
 <section id="ic-documents" class="ic-view" aria-label="Обоснование и документы" hidden>
  <div class="ic-document-heading"><div><p class="ic-eyebrow">Основания проекта</p><h3>Что принято и как считаем</h3><p class="ic-note">Площадь 18 884 м² принята по модели из DWG. Состав, оборудование и интерактивы — наша проектная работа. Документ описывает исходный сценарий; изменённые параметры отражаются в калькуляторе.</p></div><button type="button" id="ic-expand">Раскрыть разделы</button></div>
  <div id="ic-dossier" aria-busy="true"><p class="ic-note">Загружаем документ проекта…</p></div>
  <details class="ic-document-section"><summary>Сохранённые документы предыдущей редакции<span aria-hidden="true">+</span></summary><div class="ic-prose"><p>Архив редакции 1. Уточнения площади и ответственности отражены в текущем тексте выше; прежние вопросы в файлах не возобновляют принятые решения.</p><div class="ic-downloads"><a href="./installations/park-project-scope.pdf" target="_blank" rel="noopener">Документ PDF · редакция 1</a><a href="./installations/park-project-scope.docx" download>Документ Word · редакция 1</a><a href="./installations/engineering/park-engineering.pdf" target="_blank" rel="noopener">Инженерное приложение · редакция 1</a></div></div></details>
 </section>
 <section id="ic-calculator" class="ic-view" aria-label="Посетители и расчёт количества экранов" hidden>
  <div class="ic-toolbar"><div class="ic-presets" role="group" aria-label="Сценарии потока"><button type="button" data-preset="base">300 + 500</button><button type="button" data-preset="guided">Только экскурсии</button><button type="button" data-preset="peak">600 + 1000</button></div><div class="ic-actions"><button type="button" id="ic-share">Ссылка на расчёт</button><button type="button" id="ic-export">Скачать ведомость CSV</button><button type="button" id="ic-reset">Сбросить</button></div></div>
  <p class="ic-note" id="ic-action-status" role="status"></p><div id="ic-share-fallback" hidden><label for="ic-share-url">Ссылка на расчёт</label><input type="text" id="ic-share-url" readonly></div>
  <div class="ic-workspace"><aside class="ic-controls" data-az-zone="controls" aria-label="Параметры расчёта"><h3>Параметры сценария</h3><p class="ic-note">Начните с потока. Остальные настройки раскрываются по необходимости.</p>${GROUPS.map((g,i)=>`<details data-control-group="${i}" ${g.open?'open':''}><summary>${g.title}<span aria-hidden="true">+</span></summary><div class="ic-fields">${g.fields.map(field).join('')}${g.title==='Уникальность и версии контента'?`<div class="ic-field"><label for="ic-heroChannelMode">Каналы главного шоу</label><select data-choice="heroChannelMode" id="ic-heroChannelMode"><option value="unique">Разный контент на поверхностях</option><option value="mirror">Одинаковый контент на всех</option></select><p>Одинаковое видео на трёх экранах не становится тремя сюжетами.</p></div><div class="ic-field"><label for="ic-interactiveApplicationMode">Интерактивное ПО</label><select data-choice="interactiveApplicationMode" id="ic-interactiveApplicationMode"><option value="shared-by-type">Общие шаблоны по типам</option><option value="unique-per-point">Отдельное приложение на точку</option></select><p>Региональное содержание считается отдельно от программного шаблона.</p></div><label class="ic-check"><input type="checkbox" id="ic-objectContentInScope" ${input.objectContentInScope?'checked':''}> Предметные тексты и этикетаж входят в работу ФАЗЫ</label>`:''}</div></details>`).join('')}</aside>
  <div id="ic-calculator-results" class="ic-results" data-az-zone="content"><div id="ic-change-summary" class="ic-change-summary" role="status"></div>
   <section class="ic-block"><div class="ic-section-title"><h3>Поток и параллельные станции</h3><span class="ic-badge" id="ic-stations-badge"></span></div><div id="ic-flow-facts" class="ic-facts"></div><div id="ic-capacity"></div><p class="ic-note" id="ic-copy-note"></p></section>
   <section class="ic-block"><div class="ic-section-title"><h3>Время маршрута</h3><span class="ic-badge" id="ic-route-state"></span></div><div id="ic-route"></div></section>
   <details class="ic-block ic-plan-block ic-disclosure"><summary>Нагрузка посетителей по этажам</summary><div class="ic-detail-body"><div class="ic-section-title"><div><p class="ic-eyebrow">Условные метки людей</p><h3>Посетители на двух уровнях</h3></div><div class="ic-toggle" role="group" aria-label="Вид схемы"><button type="button" data-plan="floors" aria-pressed="true">Два уровня</button><button type="button" data-plan="districts" aria-pressed="false">8 территорий</button></div></div><div id="ic-floor-control" class="ic-floor-control"><label for="ic-floor-share">Доля посетителей на нижнем уровне <strong id="ic-floor-value"></strong></label><input type="range" id="ic-floor-share" min="0" max="100" step="1" value="${floorShare}"><p class="ic-note">Начальная доля пропорциональна площади. Ползунок меняет распределение людей между этажами.</p></div><div id="ic-plan"></div><p class="ic-note">Контуры — по принятой модели из DWG. Метки показывают расчётное количество людей с условными позициями. Экраны и оборудование находятся в разделе «Состав и план».</p><div id="ic-selected" hidden></div></div></details>
   <details class="ic-block ic-disclosure"><summary>Контент для ФАЗЫ</summary><div class="ic-detail-body"><div id="ic-content"></div></div></details>
   <details class="ic-block ic-disclosure"><summary>Фонд площади внутри 18 884 м²</summary><div class="ic-detail-body"><div id="ic-area"></div></div></details>
   <section class="ic-block"><div class="ic-section-title"><h3>Что требует внимания</h3></div><div id="ic-warnings"></div></section>
   <details class="ic-document-section"><summary>Формулы расчёта<span aria-hidden="true">+</span></summary><div class="ic-prose"><p><strong>Присутствие:</strong> экскурсионный поток × время экскурсии / 60 + самостоятельный поток × время визита / 60.</p><p><strong>Запуск групп:</strong> 60 × размер группы / экскурсионный поток.</p><p><strong>Спрос у одной точки:</strong> экскурсионный поток × доля участия + самостоятельный поток × доля участия. Поток не делится на восемь территорий.</p><p><strong>Выпуск станции:</strong> 60 × активных мест / (сеанс + смена в минутах) × целевая загрузка.</p><p><strong>Станций на точку:</strong> максимум из округлённой вверх потребности по среднему потоку, потребности прибывшей группы за остановку и заданного минимального оснащения.</p><p><strong>Поверхности:</strong> главные + интерактивные станции × поверхностей на станцию + медийные + предметные + общие + навигационные.</p><p><strong>Уникальный контент:</strong> шоу + интерактивные региональные комплекты + медийные программы + общие программы + навигация. Копии на параллельных станциях не добавляют сюжетов. Предметные редакционные пакеты выделены отдельно.</p><p><strong>Канал-минуты:</strong> длительность каждого линейного шоу × число отличающихся видеоканалов. Языки и технические версии увеличивают комплектность выдачи отдельно.</p></div></details>
  </div></div>
 </section>
 <section id="ic-engineering" class="ic-view" aria-label="Размеры экранов и электроснабжение" hidden><div class="ic-toolbar"><p class="ic-note">Единый сценарий: поток и состав берутся из расчёта посетителей. Здесь меняются размеры, мощность и питание.</p><a id="ic-engineering-open" href="./installations/engineering/" target="_blank" rel="noopener">Открыть инженерный расчёт отдельно</a></div><iframe id="ic-engineering-frame" title="Инженерный калькулятор Парка впечатлений" style="display:block;width:100%;height:1600px;border:0;border-radius:12px" loading="lazy"></iframe></section>
 <section id="ic-questionnaire" class="ic-view" aria-label="Анкета недостающих данных" hidden><div class="ic-question-intro"><p>Сначала — согласование объёма, контента и ответственных. Параметры оборудования и интерактивов предлагаем мы; готовую спецификацию от вас не ожидаем. Внешние данные здания запрашиваются отдельно в инженерном разделе.</p><button type="button" id="ic-seed-questionnaire">Перенести текущий сценарий в анкету</button><p class="ic-note">Кнопка переносит параметры текущего сценария. Они остаются предложением и не означают согласования.</p><p class="ic-note" id="ic-seed-status" role="status"></p></div><div id="ic-questionnaire-root"></div></section>
 <p id="ic-live" class="ic-sr-only" aria-live="polite" aria-atomic="true"></p>`;
 const $=s=>mount.querySelector(s);
 const set=(s,v)=>{$(s).textContent=v;};
 const syncEngineering = () => {
  if(!result?.valid)return;
  const u=new URL('./installations/engineering/',location.href);
  u.searchParams.set('embed','1');
  u.searchParams.set('parkInstallations',encode({schema:'faza.park.installations.v1',input:result.input}));
  const frame=$('#ic-engineering-frame');
  if(!frame.dataset.initialized){frame.src=u.href;frame.dataset.initialized='true';}
  else frame.contentWindow?.postMessage({type:'faza-park-scenario',input:result.input},location.origin);
  u.searchParams.delete('embed');$('#ic-engineering-open').href=u.href;
 };
 window.addEventListener('message',event=>{
  const frame=$('#ic-engineering-frame');
  if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
  if(event.data?.type==='faza-engineering-height'){
   const height=Number(event.data.height);if(Number.isFinite(height)&&height>=300&&height<=20000)frame.style.height=Math.ceil(height)+'px';
  }else if(event.data?.type==='faza-engineering-ready'){syncEngineering();}
  else if(event.data?.type==='faza-engineering-state'){
   engineeringTypes=event.data.types;engineeringValid=event.data.valid===true;updateGlobalStatus();
   screenPlan.update({result,input,screenTypes:engineeringTypes});
   if(event.data.valid===true&&event.data.input){const u=new URL('./installations/engineering/',location.href);u.searchParams.set('engineering',encode({schema:'faza.park.engineering.v1',input:event.data.input}));$('#ic-engineering-open').href=u.href;}
  }else if(event.data?.type==='faza-open-visitors')changeView('calculator');
  else if(event.data?.type==='faza-open-placement')changeView('overview');
 });
 const changeView = value => {
  if(!['overview','calculator','engineering','documents','questionnaire'].includes(value))return;
  const focusWasHidden=!!document.activeElement?.closest('.ic-view');
  view=value;mount.dataset.section=value;
  if(value==='overview'){$('#ic-screen-plan').after($('#ic-scenario-note'),$('#ic-scenario-issues'));}else{mount.querySelector('.ic-tabs').after($('#ic-scenario-note'),$('#ic-scenario-issues'));}
  for(const key of ['overview','calculator','engineering','documents','questionnaire'])$('#ic-'+key).hidden=key!==value;
  mount.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===value)));
  if(value==='calculator')updatePlan();if(value==='engineering')syncEngineering();
  const u=new URL(location.href);u.searchParams.set('installationsView',value);history.replaceState(null,'',u);
  if(focusWasHidden||document.activeElement===$('#ic-engineering-frame'))mount.querySelector(`[data-view="${value}"]`)?.focus();
 };
 mount.querySelectorAll('[data-view],[data-go]').forEach(b=>b.addEventListener('click',()=>changeView(b.dataset.view||b.dataset.go)));
 const screenPlan=createScreenPlan($('#ic-screen-plan'),{onOpenEngineering:()=>changeView('engineering')});
 const plan=createParkPlan($('#ic-plan'),{onSelectDistrict(index){selectedDistrict=index;updatePlan();}});
 const questionnaire=createInstallationQuestionnaire($('#ic-questionnaire-root'),{initialValues:{},sourceQuestionIds:['Q01','Q02','Q03','Q04','Q05','Q06','Q07','Q08','Q09','Q10','Q11'],onApply(state){
  const answered=getQuestionnaireCalculationInputs(state);
  const next={...input,...answered};const checked=computeContentPlan(next);
  if(!checked.valid)throw new Error('Ответы сохранены, но расчёт требует исправления: '+checked.errors.map(e=>(labels[e.field]||e.field)+': '+e.message).join(' '));
  input={...checked.input};syncControls();render();changeView('calculator');set('#ic-action-status',Object.keys(answered).length?'Применены заполненные параметры анкеты, используемые в модели. Число остановок, ручной тираж программы и решения о границах проекта сохранены в анкете и требуют согласования.':'Ответы сохранены в анкете. Среди них пока нет заполненных параметров, используемых в расчётной модели; текущий сценарий сохранён.');
 }});
 $('#ic-seed-questionnaire').addEventListener('click',()=>{
  if(!result?.valid)return;
  const current=questionnaire.state();
  const proposal=getQuestionnaireCalculationInputs(result.input);
  questionnaire.update({...current,answers:{...current.answers,...proposal}},{replace:true});
  set('#ic-seed-status','Параметры сценария подставлены как предложение. Замену можно отменить кнопкой «Отменить замену ответов» внизу анкеты.');
 });

 function updateGlobalStatus(){
  const bar=$('#ic-scenario-issues');bar.hidden=engineeringValid&&scenarioIssueCount===0;
  bar.innerHTML=`<span>${engineeringValid?`Замечаний к сценарию: ${scenarioIssueCount}`:'Есть ошибка в размерах или бюджете мощности'}</span><button type="button">${engineeringValid?'Проверить ограничения':'Проверить инженерные параметры'}</button>`;
  bar.querySelector('button').addEventListener('click',()=>changeView(engineeringValid?'calculator':'engineering'));
 }
 function syncControls(){mount.querySelectorAll('[data-field]').forEach(e=>e.value=input[e.dataset.field]??'');mount.querySelectorAll('[data-choice]').forEach(e=>e.value=input[e.dataset.choice]);$('#ic-objectContentInScope').checked=input.objectContentInScope;}
 function updatePlan(){
  if(!result?.valid)return;
  const c=result.counts,f=result.flows,a=result.areas;
  const surfacesPerDistrict=(c.heroSurfaces+c.interactiveSurfaces+c.mediaSurfaces+c.objectSurfaces)/8;
  plan.update({view:planView,floorShare,densityTarget:3,totalOccupancy:f.totalOccupancy,guidedOccupancy:f.guidedOccupancy,independentOccupancy:f.independentOccupancy,selectedDistrict,districts:regions.map((name,id)=>({id,name,people:f.totalOccupancy/8,groups:f.guidedGroupsInPark/8,area:a.districtAverageM2,screens:surfacesPerDistrict}))});
  $('#ic-floor-control').hidden=planView!=='floors';set('#ic-floor-value',NF(floorShare)+'%');$('#ic-selected').hidden=planView!=='districts';
  $('#ic-selected').innerHTML=`<h4>${esc(regions[selectedDistrict])}</h4><p class="ic-note">Одинаковая типовая матрица для расчёта. Это предложение состава, а не утверждённый список тем.</p><div class="ic-point-types">${result.table.filter(r=>r.perDistrict!==null).map(r=>`<div style="--type-color:${colors[r.id]}"><strong>${NF(r.perDistrict,0)}</strong><span>${esc(r.label)}</span><small>${NF(r.physicalSurfaces/8,0)} поверхн. · ${NF(r.uniquePackages/8,1)} пак./территорию в среднем</small></div>`).join('')}</div><p class="ic-note">${NF(a.districtAverageM2)} м² фонда · ${NF(surfacesPerDistrict,0)} поверхности · ${NF(result.route.districtMinutes,2)} мин обхода. Общие экраны и навигация вынесены за территориальную сумму.</p>`;
 }
 function tableHtml(){
  return `<div class="ic-table-scroll" tabindex="0" role="region" aria-label="Ведомость инсталляций, экранов и контента"><table><thead><tr><th>Состав</th><th>Инсталляции</th><th>Поверхности</th><th>Уникальные пакеты</th><th>Линейные минуты</th></tr></thead><tbody>${result.table.map(r=>`<tr><th><i style="background:${colors[r.id]}"></i>${esc(r.label)}${r.id==='interactive'?`<small>${NF(r.stations,0)} станции · ${NF(r.uniqueApplications,0)} программных шаблона/приложения</small>`:''}${r.id==='navigation'?'<small>Система, вне числа инсталляций</small>':''}</th><td>${r.id==='navigation'?'—':NF(r.installations,0)}</td><td>${NF(r.physicalSurfaces,0)}</td><td>${NF(r.uniquePackages,0)}${r.id==='objects'?' ред.':''}</td><td>${r.linearMinutes?NF(r.linearMinutes):'—'}</td></tr>`).join('')}</tbody><tfoot><tr><th>Всего</th><td>${NF(result.counts.totalInstallations,0)}</td><td>${NF(result.counts.physicalSurfaces,0)}</td><td>${NF(result.counts.scopedPackages,0)}<small>${NF(result.counts.digitalPackages,0)} цифровых + ${NF(result.content.scopedObjectPackages,0)} редакционных</small></td><td>${NF(result.runtime.uniqueLinearMinutes)}</td></tr></tfoot></table></div>`;
 }
 function render(){
  result=computeContentPlan(input); const valid=result.valid;
  $('#ic-errors').hidden=valid;$('#ic-engineering-frame').hidden=!valid;$('#ic-kpis').hidden=!valid;$('#ic-calculator-results').hidden=!valid;$('#ic-register').hidden=!valid;$('#ic-scope-diagram').hidden=!valid;
  $('#ic-share').disabled=!valid;$('#ic-export').disabled=!valid;$('#ic-seed-questionnaire').disabled=!valid;
  mount.querySelectorAll('[data-field]').forEach(e=>e.removeAttribute('aria-invalid'));
  screenPlan.update({result,input,screenTypes:engineeringTypes});
  if(!valid){$('#ic-errors').innerHTML='<strong>Проверьте параметры</strong><ul>'+result.errors.map(e=>`<li>${esc(labels[e.field]||e.field)}: ${esc(e.message)}</li>`).join('')+'</ul>';result.errors.forEach(e=>mount.querySelectorAll(`[data-field="${e.field}"]`).forEach(n=>n.setAttribute('aria-invalid','true')));set('#ic-live','Расчёт скрыт: проверьте исходные данные.');return;}
  const c=result.counts,a=result.areas,f=result.flows,cap=result.capacity,r=result.route,ct=result.content,rt=result.runtime;
  const kpis=[[c.totalInstallations,'инсталляции и точки',`${c.districtInstallations} территориальных + ${c.commonInstallations} общих`],[c.physicalSurfaces,'экранные поверхности',`${c.interactiveStations} интерактивные станции`],[c.scopedPackages,'пакетов контента',`${c.digitalPackages} цифровых + ${ct.scopedObjectPackages} редакционных`]];
  $('#ic-kpis').innerHTML=kpis.map(([v,label,note])=>`<div class="ic-kpi"><strong>${NF(v,0)}</strong><span>${label}</span><small>${note}</small></div>`).join('');
  set('#ic-scenario-note',`Предлагаемый сценарий · ${NF(input.guidedFlow,0)} с экскурсией + ${NF(input.independentFlow,0)} самостоятельно в час · ${c.pointsPerDistrict} точек на территорию`);
  $('#ic-scope-diagram').innerHTML=result.table.filter(t=>t.id!=='navigation').map(t=>`<div class="ic-scope-row" style="--type-color:${colors[t.id]}"><span class="ic-scope-count">${NF(t.installations,0)}</span><span>${esc(t.label)}</span><span class="ic-scope-metric">${NF(t.physicalSurfaces,0)}<small>поверхн.</small></span><span class="ic-scope-metric">${NF(t.uniquePackages,0)}<small>пакетов</small></span></div>`).join('')+`<p class="ic-note">Плюс ${c.navigationSystems} навигационная система на ${c.navigationSurfaces} поверхностях.</p>`;
  $('#ic-register').innerHTML=tableHtml();
  const delta=c.physicalSurfaces-baseCounts.physicalSurfaces;
  $('#ic-change-summary').innerHTML=`<div><strong>${NF(c.physicalSurfaces,0)}</strong><span>экранных поверхностей</span></div><div><strong>${NF(c.interactiveStations,0)}</strong><span>интерактивных станций</span></div><p>${delta===0?'Как в исходном предложении':(delta>0?'+':'')+NF(delta,0)+' поверхностей к исходному предложению'}. <button type="button" data-result-plan>Показать на плане</button></p>`;
  $('#ic-change-summary [data-result-plan]').addEventListener('click',()=>changeView('overview'));
  $('#ic-flow-facts').innerHTML=[[NF(f.totalOccupancy),'людей одновременно'],[f.groupLaunchIntervalMinutes===null?'—':NF(f.groupLaunchIntervalMinutes)+' мин','между запусками групп'],[NF(cap.demandPerPointPerHour),'участий в час у точки']].map(([v,l])=>`<div><strong>${v}</strong><span>${l}</span></div>`).join('');
  set('#ic-stations-badge',`${NF(cap.requiredStationsPerPoint,0)} станции на точку`);
  const max=Math.max(cap.demandPerPointPerHour,cap.sustainablePerPointPerHour,1);
  $('#ic-capacity').innerHTML=`<div class="ic-bar-line"><div><span>Спрос у одной точки</span><strong>${NF(cap.demandPerPointPerHour)} участий/ч</strong></div><div class="ic-bar-track"><i style="width:${cap.demandPerPointPerHour/max*100}%;background:#ffab6f"></i></div></div><div class="ic-bar-line"><div><span>Рабочий выпуск ${NF(cap.requiredStationsPerPoint,0)} станций</span><strong>${NF(cap.sustainablePerPointPerHour)} участий/ч</strong></div><div class="ic-bar-track"><i style="width:${cap.sustainablePerPointPerHour/max*100}%;background:#caff78"></i></div></div><p class="ic-note">Одна станция: ${NF(cap.sustainablePerStationPerHour)} участий/ч при ${input.targetUtilization}% загрузки. Из группы участвуют ${NF(cap.batchParticipants,0)} человек; цикл со сменой — ${NF(cap.cycleMinutes,2)} мин.</p>`;
  set('#ic-copy-note',`${NF(c.interactiveInstallations,0)} интерактивных точек × ${NF(cap.requiredStationsPerPoint,0)} станции = ${NF(c.interactiveStations,0)} станции. Дополнительные параллельные станции воспроизводят те же ${NF(ct.interactiveContentPackages,0)} контентных комплекта; новые сюжеты от тиражирования не появляются.`);
  set('#ic-route-state',r.feasible?(r.exactlyAtLimit?'Ровно в лимит':'Есть запас'):'Требует пересмотра');$('#ic-route-state').classList.toggle('is-warning',!r.feasible||r.exactlyAtLimit);
  const parts=[['Главные шоу',r.heroMinutesPerDistrict*8,colors.hero],['Интерактивы',r.interactiveMinutesPerDistrict*8,colors.interactive],['Медиа',r.mediaMinutesPerDistrict*8,colors.media],['Предметы',r.objectMinutesPerDistrict*8,colors.objects],['Переходы',r.transitionsPerDistrict*8,'#667169'],['Общие',r.commonMinutes,colors.common]];
  $('#ic-route').innerHTML=`<div class="ic-route-total"><strong>${NF(r.totalMinutes,2)}<small> / ${NF(r.targetMinutes,0)} мин</small></strong><span>${r.overrunMinutes>0?'Превышение '+NF(r.overrunMinutes,2)+' мин':r.spareMinutes>0?'Остаётся '+NF(r.spareMinutes,2)+' мин':'Запаса сверх переходов нет'}</span></div><div class="ic-stacked-bar" role="img" aria-label="Время маршрута по типам остановок">${parts.filter(x=>x[1]>0).map(([l,v,color])=>`<i style="width:${v/Math.max(r.totalMinutes,1)*100}%;background:${color}" title="${l}: ${NF(v)} мин"></i>`).join('')}</div><div class="ic-legend">${parts.map(([l,v,color])=>`<span><i style="background:${color}"></i>${l} <strong>${NF(v)} мин</strong></span>`).join('')}</div><p class="ic-note">${NF(r.districtMinutes,2)} мин на территорию × 8 + ${NF(r.commonMinutes)} мин общих программ. Групповая остановка ${cap.batchFitsStop?'помещается':'не помещается'} в заданное время; средний поток не гарантирует отсутствие очереди в момент прихода группы.</p>`;
  $('#ic-content').innerHTML=`<div class="ic-facts"><div><strong>${ct.digitalPackages}</strong><span>цифровых пакетов</span></div><div><strong>${ct.interactiveApplications}</strong><span>${input.interactiveApplicationMode==='shared-by-type'?'шаблона интерактивного ПО':'отдельных приложений'}</span></div><div><strong>${NF(rt.uniqueChannelMinutes)}</strong><span>канал-минут мастеров</span></div></div><p>${ct.heroShows} главных шоу + ${ct.interactiveContentPackages} интерактивных комплектов + ${ct.linearMediaPrograms} медийных программ + ${ct.commonPackages} общих + ${ct.navigationSystems} навигация.</p><p class="ic-note">${ct.scopedObjectPackages} предметных редакционных пакетов ${input.objectContentInScope?'включены':'включено'} в выбранный объём: всего ${ct.scopedPackages}. Интерактивные сценарии, UX, программирование и навигация не переведены в минуты фильма.</p><div class="ic-delivery"><strong>${NF(result.delivery.digitalPackageSets,0)} комплектов цифровой выдачи</strong><span>${ct.digitalPackages} исходных пакетов × ${input.languageCount} языков × ${input.deliveryVersions} технических версий. Для линейных каналов — ${NF(result.delivery.linearChannelMinutes)} канал-минут выдачи.</span></div>`;
  const ap=[['Общие',a.commonM2,colors.common],['Главные',a.heroM2,colors.hero],['Музейные',a.museumM2,colors.interactive],['Сервис',a.serviceM2,colors.objects],['Сценарный резерв',a.reserveM2,'#667169']];
  $('#ic-area').innerHTML=`<p><strong>${NF(a.totalM2,3)} м²</strong> — сумма двух основных полов модели.</p><div class="ic-stacked-bar">${ap.filter(x=>x[1]>0).map(([l,v,color])=>`<i style="width:${v/a.totalM2*100}%;background:${color}" title="${l}: ${NF(v)} м²"></i>`).join('')}</div><div class="ic-legend">${ap.map(([l,v,color])=>`<span><i style="background:${color}"></i>${l} <strong>${NF(v)} м²</strong></span>`).join('')}</div><p class="ic-note">Фонд на одну инсталляцию: главная ${NF(a.heroPerInstallationM2)} м²; интерактивная ${NF(a.interactivePerInstallationM2)} м²; медийная ${NF(a.mediaPerInstallationM2)} м²; предметная ${NF(a.objectPerInstallationM2)} м². Это распределение площади до оборудования, ограждений и очередей. На одну интерактивную станцию приходится ${NF(a.interactivePerStationM2)} м² этого фонда; дополнительные станции делят ту же площадь.</p><p class="ic-warning">18 884 м² приняты по 3D из DWG. В расчётах сохраняется обмер 18 884,055 м². Доли выше — наше предложение распределить этот фонд между функциями; они не задают границы помещений.</p>`;
  const sourceWarnings=[];
  if(f.totalOccupancy>2500)sourceWarnings.push('Одновременно '+NF(f.totalOccupancy)+' человек — выше ориентира 2 500 из ТЗ №062. Уточните действующую вместимость и профиль потока; среднее присутствие не описывает пиковые скопления.');
  sourceWarnings.push('Если держать выбранный поток все 10 часов работы из ТЗ, получится '+NF((input.guidedFlow+input.independentFlow)*10,0)+' посещений в день. В ТЗ №062 указан ориентир 6 500; загруженный час и суточный план нужно согласовать отдельно.');
  scenarioIssueCount=sourceWarnings.length+result.warnings.filter(w=>w.severity!=='info').length;updateGlobalStatus();
  $('#ic-warnings').innerHTML=sourceWarnings.map(message=>`<p class="ic-warning">${esc(message)}</p>`).join('')+result.warnings.map(w=>`<p class="${w.severity==='info'?'ic-note':'ic-warning'}">${esc(w.message)}</p>`).join('')+`<p class="ic-note">Не включено автоматически: возможная отдельная программа РГО, поезд и AR сверх базовой матрицы, аппаратные проекторы и медиасерверы. Их включение определяется анкетой и составом проекта.</p>`;
  updatePlan();if($('#ic-engineering-frame').dataset.initialized)syncEngineering();set('#ic-live',`Расчёт обновлён: ${c.totalInstallations} инсталляций, ${c.physicalSurfaces} поверхностей, ${c.digitalPackages} цифровых пакетов.`);
 }
 mount.addEventListener('input',e=>{const k=e.target.dataset.field;if(!k)return;input[k]=e.target.value===''?(e.target.dataset.optional?null:NaN):e.target.valueAsNumber;mount.querySelectorAll(`[data-field="${k}"]`).forEach(n=>{if(n!==e.target&&Number.isFinite(input[k]))n.value=input[k];});render();});
 mount.querySelectorAll('[data-choice]').forEach(e=>e.addEventListener('change',()=>{input[e.dataset.choice]=e.value;render();}));
 $('#ic-objectContentInScope').addEventListener('change',e=>{input.objectContentInScope=e.target.checked;render();});
 $('#ic-floor-share').addEventListener('input',e=>{floorShare=e.target.valueAsNumber;updatePlan();});
 mount.querySelectorAll('[data-plan]').forEach(b=>b.addEventListener('click',()=>{planView=b.dataset.plan;mount.querySelectorAll('[data-plan]').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));updatePlan();}));
 mount.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{const p=b.dataset.preset;input.guidedFlow=p==='peak'?600:300;input.independentFlow=p==='guided'?0:p==='peak'?1000:500;syncControls();render();set('#ic-action-status','Изменён поток. Состав и другие параметры сохранены.');}));
 $('#ic-reset').addEventListener('click',()=>{input={...CONTENT_DEFAULTS};floorShare=AREA.lowerLevelM2/AREA.totalM2*100;$('#ic-floor-share').value=floorShare;syncControls();render();set('#ic-action-status','Восстановлено базовое предложение. Ответы анкеты сохранены.');});
 $('#ic-share').addEventListener('click',async()=>{if(!result.valid)return;const url=new URL(location.href);url.searchParams.delete('parkScenario');url.searchParams.delete('parkAnswers');url.searchParams.set('parkInstallations',encode({schema:'faza.park.installations.v1',input:result.input}));url.hash='installations';$('#ic-share-url').value=url.href;try{await navigator.clipboard.writeText(url.href);$('#ic-share-fallback').hidden=true;set('#ic-action-status','Ссылка на выбранный расчёт скопирована.');}catch{$('#ic-share-fallback').hidden=false;$('#ic-share-url').focus();$('#ic-share-url').select();set('#ic-action-status','Скопируйте выделенную ссылку.');}});
 $('#ic-export').addEventListener('click',()=>{if(!result.valid)return;const rows=[['Парк впечатлений — рабочее предложение',VERSION],['Входной параметр','Значение']];for(const [k,v]of Object.entries(result.input))rows.push([labels[k]||k,v??'Автоматически']);rows.push([],['Состав','Инсталляции','Поверхности','Уникальные пакеты','Приложения/шаблоны','Линейные минуты','Канал-минуты']);result.table.forEach(t=>rows.push([t.label,t.installations,t.physicalSurfaces,t.uniquePackages,t.uniqueApplications,t.linearMinutes,t.channelMinutes]));rows.push(['ИТОГО',result.counts.totalInstallations,result.counts.physicalSurfaces,result.counts.scopedPackages,result.content.interactiveApplications,result.runtime.uniqueLinearMinutes,result.runtime.uniqueChannelMinutes],[],['Маршрут, мин',result.route.totalMinutes],['Людей одновременно',result.flows.totalOccupancy],['Площадь модели, м²',AREA.totalM2],['Статус','Сценарная оценка; не спецификация закупки']);result.warnings.forEach(w=>rows.push(['Замечание',w.message]));const csv='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');download(csv,'Парк_впечатлений_Ведомость_инсталляций.csv','text/csv;charset=utf-8');set('#ic-action-status','Скачана ведомость с параметрами и замечаниями.');});
 function download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function rich(s){return esc(s).replace(/\[(S\d+)\]/g,(_,id)=>`<a class="ic-citation" href="#source-${id}" data-source="${id}">[${id}]</a>`);}
 function block(b){if(b.type==='table')return `<div class="ic-table-scroll" tabindex="0"><table><thead><tr>${b.headers.map(h=>`<th>${rich(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(row=>`<tr>${row.map((v,i)=>`<${i?'td':'th'}>${rich(v)}</${i?'td':'th'}>`).join('')}</tr>`).join('')}</tbody></table></div>`;if(b.type==='list')return `<ul>${b.items.map(t=>`<li>${rich(t)}</li>`).join('')}</ul>`;if(b.type==='heading')return `<h4>${rich(b.text)}</h4>`;return `<p>${rich(b.text)}</p>`;}
 async function loadDossier(){try{const response=await fetch('./installations/dossier.json?v=20261124-ux2');if(!response.ok)throw Error();dossier=await response.json();if(dossier.regions?.length===8)regions=dossier.regions.map(r=>r.name);$('#ic-dossier').innerHTML=dossier.sections.map(s=>`<details class="ic-document-section" id="document-${esc(s.id)}"><summary>${esc(s.title)}<span aria-hidden="true">+</span></summary><div class="ic-prose">${s.lead?`<p class="ic-lead">${rich(s.lead)}</p>`:''}${s.blocks.map(block).join('')}</div></details>`).join('')+`<details class="ic-document-section" id="ic-sources"><summary>Реестр источников<span aria-hidden="true">+</span></summary><div class="ic-prose ic-source-list">${dossier.sources.map(s=>`<article id="source-${esc(s.id)}"><h4>[${esc(s.id)}] ${esc(s.title)}</h4><p>${esc(s.locator||'')}${s.note?' · '+esc(s.note):''}</p>${s.url&&/^https:\/\//.test(s.url)?`<a href="${esc(s.url)}" target="_blank" rel="noopener">Открыть источник</a>`:''}</article>`).join('')}</div></details>`;$('#ic-dossier').setAttribute('aria-busy','false');updatePlan();}catch{$('#ic-dossier').innerHTML='<p class="ic-warning">Не удалось загрузить текст. Сохранённые PDF и Word доступны ниже в архиве предыдущей редакции.</p>';$('#ic-dossier').setAttribute('aria-busy','false');}}
 $('#ic-dossier').addEventListener('click',e=>{const link=e.target.closest('[data-source]');if(!link)return;e.preventDefault();$('#ic-sources').open=true;document.getElementById('source-'+link.dataset.source)?.scrollIntoView({behavior:'smooth',block:'center'});});
 $('#ic-expand').addEventListener('click',()=>{const items=[...$('#ic-dossier').querySelectorAll('details')];const open=items.some(d=>!d.open);items.forEach(d=>d.open=open);set('#ic-expand',open?'Свернуть разделы':'Раскрыть разделы');});
 syncControls();render();loadDossier();
 const initialView=new URL(location.href).searchParams.get('installationsView');
 changeView(initialView||'overview');
 if(restored&&!initialView){changeView('calculator');set('#ic-action-status','Восстановлен расчёт из ссылки.');}
 if(hadSharedAnswers){
  changeView('questionnaire');
  // Questionnaire restoration cleans its query with replaceState; synchronise
  // the outer review folder even when an incoming URL omitted the fragment.
  if(location.hash!=='#installations')location.hash='installations';
  else window.dispatchEvent(new Event('hashchange'));
 }else if(location.hash==='#calculator')changeView('calculator');
 if(new URL(location.href).searchParams.get('engineeringView')==='1'&&!hadSharedAnswers)changeView('engineering');
 window.addEventListener('hashchange',()=>{if(location.hash==='#calculator')changeView('calculator');});
}
