/** Human-readable names, without changing geometry or assigning approved boundaries. */
export const ZONE_NAME_STATUS = 'Рабочее назначение; границы не утверждены';
export const ZONE_NAMES = Object.freeze({
  S01: { name:'Дальневосточный округ', short:'Дальневосточный', aliases:['Дальний Восток','ДФО'], floorId:'main' },
  S02: { name:'Сибирский округ', short:'Сибирский', aliases:['Сибирь','СФО'], floorId:'main' },
  S03: { name:'Уральский округ', short:'Уральский', aliases:['Урал','УФО'], floorId:'main' },
  S04: { name:'Приволжский округ', short:'Приволжский', aliases:['Поволжье','ПФО'], floorId:'main' },
  S05: { name:'Центральный округ', short:'Центральный', aliases:['Центр','ЦФО'], floorId:'main' },
  S06: { name:'Северо-Кавказский округ', short:'Северо-Кавказский', aliases:['Северный Кавказ','СКФО'], floorId:'upper' },
  S07: { name:'Южный округ', short:'Южный', aliases:['Юг','ЮФО'], floorId:'upper' },
  S08: { name:'Северо-Западный округ', short:'Северо-Западный', aliases:['Северо-Запад','СЗФО'], floorId:'upper' },
});

/**
 * Names verified against 3D_Объекты_по_ролику/На_утверждение/object_register.json.
 * SHA256 d55213f22bc900bda09636f83698315abd8885edc9326d293bb857eea05745c2.
 * Oxx-N inherits the catalogue name + instance number; absent objects are never created.
 * Catalogue support_groups S01... are NOT geographic sector IDs.
 */
export const EXISTING_OBJECT_NAMES = Object.freeze({
  O01: { name:'Круглый модуль лунной базы', aliases:['Лунная база'] },
  O02: { name:'Геодезический купол лунной базы', aliases:['Купол'] },
  O03: { name:'Сфера Луны на опоре', aliases:['Луна'] },
  O04: { name:'Космонавт в скафандре', aliases:['Космонавт'] },
  O05: { name:'Самолёт МС-21', aliases:['МС21','МС 21','Самолет'] },
  O06: { name:'Макет плотины / ГЭС', aliases:['Плотина','Гидроэлектростанция'] },
  O07: { name:'Кит — синий обтекаемый вариант', aliases:['Синий кит'] },
  O08: { name:'Кит — крупный серый вариант', aliases:['Серый кит'] },
  O09: { name:'Ракета «Ангара-А5»', aliases:['Ангара','АнгараА5','Ангара А5'] },
  O10: { name:'Башня обслуживания ракеты', aliases:['Стартовая башня'] },
  O11: { name:'Реакторный стенд с трубопроводами', aliases:['Реактор'], note:'Связь с проектом «Прорыв» не подтверждена каталогом.' },
  O12: { name:'Атомный ледокол «Лидер»', aliases:['Ледокол','Лидер'] },
  O13: { name:'Красный комбайн с жаткой', aliases:['Комбайн'] },
  O14: { name:'Зелёный агродрон / мультикоптер', aliases:['Агродрон','Дрон'] },
  O15: { name:'Арочный металлический ферменный мост', aliases:['Мост'], note:'Реальный прототип моста не установлен.' },
  O16: { name:'Аркадный павильон с фронтоном', aliases:['Павильон','Аркада'], note:'Историческая идентификация не подтверждена. Не отождествляется с Херсонесом или экспозицией РГО.' },
});

export function zoneName(id, short=false) {
  const z=ZONE_NAMES[id];return z?(short?z.short:z.name):(id?`Условная зона ${id}`:'Общепарковая зона');
}
export function zoneSearchTerms(id) {
  const z=ZONE_NAMES[id];return z?[id,z.name,z.short,...z.aliases].join(' '):String(id||'');
}
export function existingObjectInfo(object) {
  if(object?.kind==='monorail-column'||object?.kind==='monorail-foot'){
    const support=String(object.id||'').match(/^rail-support-(\d+)-(column|base)$/);
    if(!support)return null;
    const name=`${support[2]==='column'?'Колонна монорельса':'Основание опоры монорельса'} ${support[1]}`;
    return {name,label:name,aliases:['Монорельс','Опора'],source:'Тип и номер опоры из существующего слоя модели; конструктивный паспорт не подтверждён.'};
  }
  if(object?.kind!=='exhibit')return null;
  const match=/^(O\d{2})(?:-(\d+))?$/.exec(String(object.id||''));
  if(!match||!EXISTING_OBJECT_NAMES[match[1]])return null;
  const entry=EXISTING_OBJECT_NAMES[match[1]];
  return {...entry,baseId:match[1],instance:match[2]?Number(match[2]):null,
    label:entry.name+(match[2]?` · экземпляр ${Number(match[2])}`:''),
    source:'Описание из каталога объектов по ролику (на согласовании); связь через objectId. Положение — из текущего слоя модели.'};
}
export function sceneName(scene) {
  const labels={hero:'Главная инсталляция',interactive:'Интерактивная установка',media:'Медиаточка',common:'Общепарковая установка',navigation:'Навигационная точка'};
  const type=labels[scene.category]||scene.label||'Экранная сцена';
  const number=String(scene.id||'').match(/-[HIMCN](\d+)$/)?.[1];
  const ordinal=number&&scene.category!=='hero'?` ${Number(number)}`:'';
  if(scene.sectorId)return `${type}${ordinal} · ${zoneName(scene.sectorId)}`;
  const floor=scene.floorId==='main'?'нижний уровень':scene.floorId==='upper'?'верхний уровень':'уровень не задан';
  return `${type}${ordinal} · ${floor}`;
}
export function normalizeSearch(value) {
  return String(value||'').toLocaleLowerCase('ru').replace(/ё/g,'е').match(/[\p{L}\p{N}]+/gu)?.join(' ')||'';
}
