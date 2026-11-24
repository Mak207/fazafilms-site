/** Cabinet geometry and published series data; no placement or purchase is approved.
 * Metres, pixels, kilograms and AC-input watts. Surface count never becomes cabinet count.
 */
import { DEFAULT_SCREEN_INPUT, SCREEN_CATEGORY_KEYS } from './screen-model.js';

export const LED_PROFILES = Object.freeze([
  Object.freeze({
    id:'gloshine-xpro-158', label:'GLOSHINE X Pro 1.58 · данные серии',
    cabinetWidthM:0.608, cabinetHeightM:0.342, cabinetDepthM:0.084,
    pixelsWide:384, pixelsHigh:216, massKg:8.8,
    maximumDensityWm2:650, averageDensityWm2:325, budgetDensityWm2:650,
    sourceUrl:'https://displayrent.ru/svetodiodnye-ekrany#rec716743424',
    manufacturerUrl:'https://www.gloshine.com/jp/products/841.html',
    serviceLabel:'Магнитные модули, фронтальное обслуживание; зазоры не заданы',
    sourceConflict:false, status:'manufacturer_series_delivery_unconfirmed',
    notes:Object.freeze([
      'Размеры, пиксели и верхние показатели мощности взяты из таблицы производителя серии; паспорт конкретной поставки не подтверждён.',
      'У производителя масса 8,8 кг, у DisplayRent 8,5 кг. В расчёте приняты 8,8 кг; исполнение и крепления требуют сверки.',
      'Средний показатель ≤325 Вт/м² не является измеренной рабочей мощностью. Монтажный конструктив и внешние LED-контроллеры учитываются отдельно.',
    ]),
  }),
  Object.freeze({
    id:'displayrent-uhp-19-unverified', label:'DisplayRent: UHP III 1.9 · название требует сверки',
    cabinetWidthM:0.5, cabinetHeightM:0.5, cabinetDepthM:null,
    pixelsWide:256, pixelsHigh:256, massKg:7.7,
    maximumDensityWm2:null, averageDensityWm2:null, budgetDensityWm2:320,
    sourceUrl:'https://displayrent.ru/svetodiodnye-ekrany#rec714665587',
    manufacturerUrl:'https://it.unilumin.com/products/professional-amp-commercial/uhp.html',
    serviceLabel:'Стойка, стена или ниша по карточке; сторона обслуживания неизвестна',
    sourceConflict:true, status:'supplier_identity_conflict',
    notes:Object.freeze([
      'У поставщика квадратный кабинет P1.9; официальная UHP III — серия 16:9 с другим набором шагов. Модель не идентифицирована.',
      '320 Вт/м² названы потребляемой мощностью без режима. Здесь это только бюджетное допущение; максимум и среднее неизвестны.',
    ]),
  }),
]);

export const DEFAULT_LED_CONFIG = Object.freeze({ profileId:'gloshine-xpro-158', rounding:'nearest' });
const isRecord = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const issue = (field,message) => ({field,message});
const multiply = (...values) => values.some(x => x === null) ? null : values.reduce((a,b)=>a*b,1);
const total = (value,count) => count === 0 ? 0 : multiply(value,count);
const sum = values => values.some(x => x === null) ? null : values.reduce((a,b)=>a+b,0);
const knownSum = values => values.reduce((a,b)=>a+(b??0),0);
const invalid = (errors,details={}) => ({valid:false,errors,profile:null,rows:[],totals:null,...details});

function gridAxis(target, cabinet, rounding) {
  if(target === null) return null;
  const quotient=target/cabinet, nearest=Math.round(quotient);
  const snapped=Math.abs(quotient-nearest)<=Number.EPSILON*Math.max(1,Math.abs(quotient))*8 ? nearest : quotient;
  return Math.max(1,rounding==='ceil'?Math.ceil(snapped):Math.round(snapped));
}

/** `counts` omitted uses the baseline; omitted keys of an explicit counts object are zero.
 * Unknown dimensions stay null. `nearest` can make a screen smaller than its target;
 * `ceil` covers both target axes. Neither mode promises to preserve aspect ratio.
 */
export function computeLedPlan(overrides={}) {
  if(!isRecord(overrides)) return invalid([issue('led','Параметры LED должны быть объектом.')]);
  const config=overrides.config===undefined?{...DEFAULT_LED_CONFIG}:overrides.config;
  if(!isRecord(config)) return invalid([issue('led','Конфигурация LED должна быть объектом.')]);
  const normalizedConfig={...DEFAULT_LED_CONFIG,...config};
  const profile=LED_PROFILES.find(p=>p.id===normalizedConfig.profileId);
  const errors=[];
  if(!profile) errors.push(issue('led.profileId','Выберите известный профиль LED.'));
  if(!['nearest','ceil'].includes(normalizedConfig.rounding)) errors.push(issue('led.rounding','Округление LED: nearest или ceil.'));
  const rawCounts=overrides.counts===undefined?DEFAULT_SCREEN_INPUT.counts:overrides.counts;
  const rawTypes=overrides.types===undefined?{}:overrides.types;
  if(!isRecord(rawCounts)) errors.push(issue('counts','Количество поверхностей должно быть объектом.'));
  if(!isRecord(rawTypes)) errors.push(issue('types','Типоразмеры должны быть объектом.'));
  if(errors.length) return invalid(errors,{config:normalizedConfig,profile:profile??null});
  const keys=[...SCREEN_CATEGORY_KEYS,'unassigned'];
  for(const key of Object.keys(rawCounts)) if(!keys.includes(key)) errors.push(issue(`counts.${key}`,'Неизвестный тип поверхности.'));
  const counts=Object.fromEntries(keys.map(key=>[key,rawCounts[key]??0]));
  for(const key of keys) {
    if(Object.hasOwn(rawCounts,key)&&rawCounts[key]===null) errors.push(issue(`counts.${key}`,'Количество должно быть известным целым числом.'));
    if(!Number.isSafeInteger(counts[key])||counts[key]<0) errors.push(issue(`counts.${key}`,'Нужно неотрицательное целое количество.'));
  }
  const types={};
  for(const key of SCREEN_CATEGORY_KEYS) {
    if(Object.hasOwn(rawTypes,key)&&!isRecord(rawTypes[key])) {errors.push(issue(`types.${key}`,'Нужен объект типоразмера.'));continue;}
    types[key]={...DEFAULT_SCREEN_INPUT.types[key],...rawTypes[key]};
    for(const field of ['widthM','heightM']) {
      const value=types[key][field];
      if(value!==null&&(!Number.isFinite(value)||value<=0)) errors.push(issue(`types.${key}.${field}`,'Нужен положительный размер в метрах или null.'));
    }
  }
  if(errors.length) return invalid(errors,{config:normalizedConfig,profile});
  const rows=SCREEN_CATEGORY_KEYS.map(key=>{
    const t=types[key],count=counts[key];
    const columns=gridAxis(t.widthM,profile.cabinetWidthM,normalizedConfig.rounding);
    const rowCount=gridAxis(t.heightM,profile.cabinetHeightM,normalizedConfig.rounding);
    const widthM=multiply(columns,profile.cabinetWidthM),heightM=multiply(rowCount,profile.cabinetHeightM);
    const cabinetsPerSurface=multiply(columns,rowCount),areaM2=multiply(widthM,heightM);
    const massKg=multiply(cabinetsPerSurface,profile.massKg);
    const maximumW=multiply(areaM2,profile.maximumDensityWm2),averageW=multiply(areaM2,profile.averageDensityWm2);
    const budgetW=multiply(areaM2,profile.budgetDensityWm2);
    return {key,count,columns,rows:rowCount,cabinetsPerSurface,totalCabinets:total(cabinetsPerSurface,count),
      targetWidthM:t.widthM,targetHeightM:t.heightM,widthM,heightM,areaM2,totalAreaM2:total(areaM2,count),
      pixelWidth:multiply(columns,profile.pixelsWide),pixelHeight:multiply(rowCount,profile.pixelsHigh),
      massKg,totalMassKg:total(massKg,count),maximumW,totalMaximumW:total(maximumW,count),
      averageW,totalAverageW:total(averageW,count),budgetW,totalBudgetW:total(budgetW,count)};
  });
  // Object surfaces have no assigned LED type. Do not silently borrow another type.
  if(counts.unassigned>0) rows.push({key:'unassigned',count:counts.unassigned,...Object.fromEntries([
    'columns','rows','cabinetsPerSurface','totalCabinets','targetWidthM','targetHeightM','widthM','heightM',
    'areaM2','totalAreaM2','pixelWidth','pixelHeight','massKg','totalMassKg','maximumW','totalMaximumW',
    'averageW','totalAverageW','budgetW','totalBudgetW',
  ].map(key=>[key,null]))});
  for(const row of rows) {
    for(const [field,value] of Object.entries(row)) if(typeof value==='number'&&!Number.isFinite(value)) errors.push(issue(`led.${row.key}.${field}`,'Числовое переполнение LED.'));
    for(const field of ['columns','rows','cabinetsPerSurface','totalCabinets','pixelWidth','pixelHeight']) {
      if(row[field]!==null&&!Number.isSafeInteger(row[field])) errors.push(issue(`led.${row.key}.${field}`,'Число кабинетов или пикселей выходит за безопасный целочисленный диапазон.'));
    }
  }
  const totals={surfaceCount:Object.values(counts).reduce((a,b)=>a+b,0)};
  for(const [name,field] of [['cabinetCount','totalCabinets'],['totalAreaM2','totalAreaM2'],['totalMassKg','totalMassKg'],
    ['totalMaximumW','totalMaximumW'],['totalAverageW','totalAverageW'],['totalBudgetW','totalBudgetW']]) totals[name]=sum(rows.map(r=>r[field]));
  totals.knownCabinetCount=knownSum(rows.map(r=>r.totalCabinets));
  totals.knownAreaM2=knownSum(rows.map(r=>r.totalAreaM2));
  totals.unknownCabinetSurfaceCount=rows.filter(r=>r.cabinetsPerSurface===null).reduce((n,r)=>n+r.count,0);
  if(!Number.isSafeInteger(totals.surfaceCount)||!Number.isSafeInteger(totals.knownCabinetCount)||
    Object.values(totals).some(x=>x!==null&&!Number.isFinite(x))) errors.push(issue('led.totals','Переполнение итогов LED.'));
  if(errors.length) return invalid(errors,{config:normalizedConfig,profile});
  return {valid:true,errors:[],config:normalizedConfig,profile,rows,totals,status:'proposal',
    maximumEvidence:'published_series_upper_bound_not_delivery_passport',
    averageEvidence:'published_series_average_not_measured_operation',
    warnings:profile.sourceConflict?[issue('led.profileId',profile.notes[0])]:[]};
}
