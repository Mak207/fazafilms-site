/**
 * Local-first installation brief. No network request is made by this module.
 * Optional adapters are called only after the corresponding user action.
 */
export const QUESTIONNAIRE_SCHEMA_VERSION = 1;
export const QUESTIONNAIRE_SCHEMA_ID = 'faza.park.installation-questionnaire';
const DEFAULT_STORAGE_KEY = 'faza:park:installation-questionnaire:v1';
const MAX_SHARE_URL_LENGTH = 60000;
const SCOPE_ITEMS = [
  ['content', 'Контент: сценарии, видео, звук и графика'],
  ['software', 'Программное обеспечение интерактивов'],
  ['mediaServers', 'Медиасерверы и система воспроизведения'],
  ['equipment', 'Экраны, проекторы и другое оборудование'],
  ['integration', 'Монтаж, настройка и интеграция'],
  ['support', 'Поддержка после запуска']
];
const num = (id, label, min = 0, max = 100000, step = 1, hint = '', unit = '') => ({ id, label, type: 'number', min, max, step, hint, unit });
const txt = (id, label, hint = '', multiline = false) => ({ id, label, type: multiline ? 'textarea' : 'text', hint });
const FIELDS = [
  num('guidedFlow', 'Экскурсионных посетителей в час', 0, 100000, 1, 'Расчётный поток на входе в парк.', 'чел./ч'),
  num('independentFlow', 'Самостоятельных посетителей в час', 0, 100000, 1, 'Поток считается отдельно от экскурсионного.', 'чел./ч'),
  num('groupSize', 'Человек в одной группе', 1, 1000, 1, '', 'человек'),
  num('operatingHours', 'Часов работы Парка в день', 0, 24, 0.5, 'Для дневного задания. Продолжительность работы Парка отличается от длительности одного визита.', 'часов'),
  num('dayTarget', 'План посетителей за день', 0, 1000000, 1, 'Суммарное число входов за день. Почасовой поток и пики нужно задавать отдельно.', 'человек/день'),
  txt('peakNotes', 'Как распределён поток и когда ожидаются пики', 'Дни недели, сезонность, часы максимальной нагрузки и возможный одновременный приход нескольких групп.', true),
  num('guidedMinutes', 'Продолжительность полной экскурсии', 1, 1440, 1, 'Четыре часа соответствуют 240 минутам. Это не часы работы парка.', 'минут'),
  num('stopsPerVisit', 'Остановок в полной экскурсии', 0, 500, 1, 'Для выборочного маршрута перечислите точки в дополнительных параметрах. Текущий калькулятор проверяет полный обход всех точек.', 'остановок'),
  txt('selectedRoutePoints', 'Точки выборочного маршрута', 'Укажите территории, точки и порядок посещения. Этот список требует отдельной проверки маршрута; он не исключает точки из текущей модели автоматически.', true),
  num('heroMinutes', 'Показ у одной главной инсталляции', 0, 240, 0.5, 'Время одного показа / остановки. Если группа находится здесь дольше, укажите это в замечаниях.', 'минут'),
  num('guidedParticipation', 'Участвуют в интерактиве: экскурсанты', 0, 100, 1, 'Доля активных участников у типовой точки; наблюдатели отдельно не добавляются.', '%'),
  num('independentParticipation', 'Участвуют: самостоятельные посетители', 0, 100, 1, '', '%'),
  num('usersPerStation', 'Активных мест на одной станции', 1, 1000, 1, 'Сколько человек одновременно управляют интерактивом. Наблюдатели вокруг не добавляют обслуживаемые места.', 'человек'),
  num('experienceMinutes', 'Продолжительность активного сеанса', 0.25, 240, 0.25, 'Время использования интерактива одним участником или одновременно работающей группой.', 'минут'),
  num('turnoverSeconds', 'Время смены участников', 0, 3600, 1, 'Добавляется к активному сеансу при расчёте пропускной способности.', 'секунд'),
  num('targetUtilization', 'Целевая загрузка станции', 1, 100, 1, 'Доля доступного времени, которую можно занимать сеансами. Остаток оставляет резерв на колебания потока.', '%'),
  num('heroPointsPerDistrict', 'Главных инсталляций', 0, 100, 1),
  num('interactivePointsPerDistrict', 'Интерактивных точек', 0, 100, 1),
  num('mediaPointsPerDistrict', 'Точек с линейным показом', 0, 100, 1, 'Например, фильм без активного управления.'),
  num('objectPointsPerDistrict', 'Предметных / музейных точек', 0, 100, 1),
  { id: 'geographicStructure', label: 'На какие восемь частей делится Парк?', type: 'select', choices: [['federal_districts', 'Восемь федеральных округов'], ['geographic_territories', 'Восемь географических территорий по региональному документу']], hint: 'Это разные основания деления. Нужен единый вариант для программы и маршрута.' },
  txt('approvedScopeDocument', 'Подтверждённое задание на проект', 'Ссылка или название документа, версия, дата и кто его утвердил. Укажите, какой состав инсталляций и контента подтверждён.', true),
  txt('areaScheduleLink', 'Подтверждённая экспликация помещений', 'Ссылка или название документа с площадями и границами зон. Уточните, какие общие пространства и экспозиции включены.'),
  num('heroSurfacesPerInstallation', 'Поверхностей у главной инсталляции', 0, 1000, 1),
  num('mediaSurfacesPerInstallation', 'Поверхностей у линейной точки', 0, 1000, 1),
  num('surfacesPerInteractiveStation', 'Поверхностей на одну интерактивную станцию', 0, 1000, 1, 'Станция может иметь несколько поверхностей.'),
  { id: 'heroChannelMode', label: 'Что показывают поверхности главной инсталляции?', type: 'select', choices: [['unique', 'На каждой — отдельный контент'], ['mirror', 'Все повторяют один контент']], hint: 'Повтор одного ролика на трёх поверхностях не создаёт три разных программы.' },
  txt('AVspecification', 'Техническое задание на поверхности и AV-систему', 'Тип и размер поверхностей, разрешение в пикселях, число независимых каналов, проекция или LED; ссылка или название документа поставщика. По этим данным уточняются форматы контента и выдачи.', true),
  num('stationCopiesPerProgram', 'Станций с одной и той же программой', 1, 1000, 1, 'Тираж оборудования не равен числу разных программ.', 'копий'),
  { id: 'interactiveApplicationMode', label: 'Как используются шаблоны интерактивного ПО?', type: 'select', choices: [['shared-by-type', 'Общий шаблон ПО для каждого типа точки'], ['unique-per-point', 'Отдельное приложение для каждой точки']], hint: 'Шаблоны ПО и контентные пакеты считаются отдельно: например, 3 шаблона могут обслуживать 24 региональных пакета. Количество рабочих станций рассчитывается по потоку.' },
  { id: 'commonZonesIncluded', label: 'Есть дополнительные общие зоны?', type: 'boolean', hint: 'РГО, галерея, площадь, входная зона и другие пространства вне восьми округов.' },
  txt('commonZonesDescription', 'Какие общие зоны входят в объём', 'Если общих зон нет, это поле можно оставить пустым.', true),
  { id: 'rgoScope', label: 'Как учитывать экспозицию РГО?', type: 'select', choices: [['included', 'Уже учтена в площади и текущей программе'], ['additional', 'Нужна дополнительная программа в площади Парка'], ['separate_project', 'Отдельный проект / вне этой программы']], hint: 'В источнике указаны 9 зон, 45+ экспонатов и 1 400 м². Нужно проверить их привязку к 18 884 м² и текущей программе, включая общие установки. Этот ответ сам по себе не прибавляет площади или установки.' },
  { id: 'languages', label: 'Языки контента', type: 'languages', hint: 'Перечислите через запятую. Например: русский, английский.' },
  txt('contentApprover', 'Кто окончательно утверждает содержание', 'Имя или роль; при необходимости организация.'),
  txt('materialsProvider', 'Кто предоставляет исходные материалы', 'Ответственный за факты, тексты, архивы, изображения и права на их использование.'),
  { id: 'fazaScope', label: 'Что входит в объём ФАЗЫ', type: 'scope', items: SCOPE_ITEMS },
  num('transitionPerDistrictMinutes', 'Переходы в одном округе', 0, 240, 0.5, 'Включая лестницы, лифты и смену аудитории, если они относятся к этому блоку.', 'минут'),
  num('independentMinutes', 'Средний самостоятельный визит', 1, 1440, 1, 'Отдельное допущение для числа людей одновременно в парке.', 'минут'),
  txt('districtExceptions', 'Чем округа отличаются от типового состава', 'Можно указать округ и отличающиеся количества.', true),
  txt('programReuseNotes', 'Ограничения повторного использования программ', 'Что одинаково, что требует отдельного сценария, графики или механики.', true),
  num('commonPackages', 'Разных программ в общих зонах', 0, 1000, 1),
  num('commonSurfaces', 'Поверхностей в общих зонах', 0, 1000, 1),
  num('commonInstallations', 'Установок в общих зонах', 0, 1000, 1),
  num('commonMinutesPerPackage', 'Длительность одной программы общей зоны', 0, 240, 0.5, '', 'минут'),
  num('commonRouteMinutes', 'Общее время этих зон в экскурсионном маршруте', 0, 1440, 0.5, 'Не все программы общих зон обязательно входят в каждую экскурсию.', 'минут'),
  num('mediaMinutes', 'Длительность одного линейного ролика', 0, 240, 0.5, '', 'минут'),
  num('interactiveStopMinutes', 'Время на одну интерактивную точку', 0, 240, 0.25, 'Время участия и смены пользователя на маршруте.', 'минут'),
  num('objectStopMinutes', 'Время у предметной / музейной точки', 0, 240, 0.5, '', 'минут'),
  { id: 'objectContentInScope', label: 'Предметные тексты и этикетаж входят в работу ФАЗЫ?', type: 'boolean', hint: 'Редакционные пакеты считаются отдельно от цифровых программ. Наличие экрана не определяет, кто готовит тексты.' },
  num('deliveryVersions', 'Технических версий выдачи без языковых переводов', 1, 100, 1, 'Например, разные форматы выдачи одной программы. Короткую и полную программы с разным хронометражем укажите в дополнительных адаптациях.'),
  txt('accessibilityVersions', 'Дополнительные адаптации', 'Субтитры, тифлокомментарий, возрастные или иные версии.', true),
  txt('approvalStages', 'Этапы согласования и сроки ответа', 'Кто согласует сценарий, раскадровку, черновой и финальный результат.', true),
  { id: 'sourceMaterialsStatus', label: 'Готовность исходных материалов', type: 'select', choices: [['ready', 'Собраны'], ['partial', 'Собраны частично'], ['not_ready', 'Нужно собрать']] },
  txt('sourceMaterialsLinks', 'Где находятся материалы', 'Ссылки или названия папок. Анкета не загружает материалы по этим ссылкам.', true),
  txt('scopeNotes', 'Границы ответственности и исключения', 'Что предоставляет заказчик или другой подрядчик; что ещё нужно определить.', true),
  txt('notes', 'Дополнительные замечания', '', true)
];
const FIELD_BY_ID = Object.fromEntries(FIELDS.map(field => [field.id, field]));
const QUESTIONS = [
  { id: 'Q01', title: 'Потоки и размер группы', fields: ['guidedFlow', 'independentFlow', 'groupSize'], required: ['guidedFlow', 'independentFlow', 'groupSize'], advanced: ['operatingHours', 'dayTarget', 'peakNotes'] },
  { id: 'Q02', title: 'Остановки и время экскурсии', fields: ['guidedMinutes', 'stopsPerVisit', 'heroMinutes'], required: ['guidedMinutes', 'stopsPerVisit', 'heroMinutes'], advanced: ['transitionPerDistrictMinutes', 'independentMinutes', 'selectedRoutePoints'] },
  { id: 'Q03', title: 'Участники и пропускная способность станции', fields: ['guidedParticipation', 'independentParticipation', 'usersPerStation', 'experienceMinutes', 'turnoverSeconds', 'targetUtilization'], required: ['guidedParticipation', 'independentParticipation', 'usersPerStation', 'experienceMinutes', 'turnoverSeconds', 'targetUtilization'] },
  { id: 'Q04', title: 'География и типовой состав одной части Парка', fields: ['geographicStructure', 'heroPointsPerDistrict', 'interactivePointsPerDistrict', 'mediaPointsPerDistrict', 'objectPointsPerDistrict'], required: ['geographicStructure', 'heroPointsPerDistrict', 'interactivePointsPerDistrict', 'mediaPointsPerDistrict', 'objectPointsPerDistrict'], advanced: ['districtExceptions', 'objectContentInScope', 'approvedScopeDocument', 'areaScheduleLink'] },
  { id: 'Q05', title: 'Поверхности в каждой установке', fields: ['heroSurfacesPerInstallation', 'mediaSurfacesPerInstallation', 'surfacesPerInteractiveStation', 'heroChannelMode'], required: ['heroSurfacesPerInstallation', 'mediaSurfacesPerInstallation', 'surfacesPerInteractiveStation', 'heroChannelMode'], advanced: ['AVspecification'] },
  { id: 'Q06', title: 'Тираж одной программы', fields: ['interactiveApplicationMode'], required: ['interactiveApplicationMode'], advanced: ['stationCopiesPerProgram', 'programReuseNotes'] },
  { id: 'Q07', title: 'Общие зоны и включение РГО', fields: ['commonZonesIncluded', 'commonZonesDescription', 'rgoScope'], required: ['commonZonesIncluded', 'rgoScope'], advanced: ['commonInstallations', 'commonPackages', 'commonSurfaces', 'commonMinutesPerPackage', 'commonRouteMinutes'] },
  { id: 'Q08', title: 'Языки и версии контента', fields: ['languages', 'deliveryVersions'], required: ['languages', 'deliveryVersions'], advanced: ['mediaMinutes', 'interactiveStopMinutes', 'objectStopMinutes', 'accessibilityVersions'] },
  { id: 'Q09', title: 'Кто принимает содержание', fields: ['contentApprover'], required: ['contentApprover'], advanced: ['approvalStages'] },
  { id: 'Q10', title: 'Кто даёт исходные материалы', fields: ['materialsProvider'], required: ['materialsProvider'], advanced: ['sourceMaterialsStatus', 'sourceMaterialsLinks'] },
  { id: 'Q11', title: 'Границы объёма ФАЗЫ', fields: ['fazaScope'], required: ['fazaScope'], advanced: ['scopeNotes', 'notes'] }
];
const GROUPS = [
  { id: 'visitors', title: 'Посетители и маршрут', questions: ['Q01', 'Q02', 'Q03'] },
  { id: 'installations', title: 'Инсталляции и оборудование', questions: ['Q04', 'Q05', 'Q06'] },
  { id: 'content', title: 'Программы и контент', questions: ['Q07', 'Q08'] },
  { id: 'owners', title: 'Согласование и материалы', questions: ['Q09', 'Q10'] },
  { id: 'faza', title: 'Объём работ ФАЗЫ', questions: ['Q11'] }
];
const QUESTION_BY_ID = Object.fromEntries(QUESTIONS.map(question => [question.id, question]));
export const INSTALLATION_QUESTIONNAIRE_SCHEMA = Object.freeze({
  id: QUESTIONNAIRE_SCHEMA_ID,
  version: QUESTIONNAIRE_SCHEMA_VERSION,
  fields: FIELDS,
  groups: GROUPS,
  questions: QUESTIONS,
  unknownValue: null
});
let instanceCounter = 0;
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const clone = object => JSON.parse(JSON.stringify(object));
const now = () => new Date().toISOString();
const trim = value => typeof value === 'string' ? value.trim().slice(0, 5000) : '';
function localDate(value = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Vladivostok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
function localTime(value) {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Vladivostok', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
function emptyAnswers() {
  return Object.fromEntries(FIELDS.map(field => [field.id, field.type === 'scope' ? Object.fromEntries(SCOPE_ITEMS.map(([key]) => [key, null])) : null]));
}
function cleanField(field, value) {
  if (field.type === 'scope') return Object.fromEntries(SCOPE_ITEMS.map(([key]) => [key, typeof value?.[key] === 'boolean' ? value[key] : null]));
  if (value === null || value === undefined || value === '') return null;
  if (field.type === 'number') {
    const number = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
    if (!Number.isFinite(number) || number < field.min || number > field.max || (field.step === 1 && !Number.isInteger(number))) return null;
    return number;
  }
  if (field.type === 'boolean') return typeof value === 'boolean' ? value : null;
  if (field.type === 'languages') {
    const input = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,;\n]+/) : [];
    const found = new Set();
    const result = input.map(item => trim(item).slice(0, 100)).filter(item => item && !found.has(item.toLowerCase()) && found.add(item.toLowerCase())).slice(0, 30);
    return result.length ? result : null;
  }
  if (field.type === 'select') return field.choices.some(([key]) => key === value) ? value : null;
  return trim(value) || null;
}
export function normalizeQuestionnaire(values = {}, { sourceQuestionIds = null } = {}) {
  const raw = values && typeof values === 'object' ? values : {};
  const source = raw.answers && typeof raw.answers === 'object' ? raw.answers : raw;
  const answers = emptyAnswers();
  for (const field of FIELDS) if (hasOwn(source, field.id)) answers[field.id] = cleanField(field, source[field.id]);
  return {
    schema: QUESTIONNAIRE_SCHEMA_ID,
    schemaVersion: QUESTIONNAIRE_SCHEMA_VERSION,
    revision: Number.isSafeInteger(raw.revision) && raw.revision >= 0 ? raw.revision : 0,
    updatedAt: typeof raw.updatedAt === 'string' && Number.isFinite(Date.parse(raw.updatedAt)) ? raw.updatedAt : now(),
    timezone: 'Asia/Vladivostok',
    answers,
    sourceQuestionIds: clone(raw.sourceQuestionIds ?? sourceQuestionIds)
  };
}
function isKnown(field, value) {
  if (field.type === 'scope') return SCOPE_ITEMS.every(([key]) => typeof value?.[key] === 'boolean');
  return value !== null && value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0);
}
function questionStatus(question, answers) {
  const required = [...question.required];
  if (question.id === 'Q07' && answers.commonZonesIncluded === true) required.push('commonZonesDescription');
  const count = required.filter(key => isKnown(FIELD_BY_ID[key], answers[key])).length;
  return { id: question.id, complete: count === required.length, partial: count > 0, answered: count, total: required.length };
}
export function getQuestionnaireProgress(value) {
  const answers = normalizeQuestionnaire(value).answers;
  const questions = QUESTIONS.map(question => questionStatus(question, answers));
  return { answered: questions.filter(question => question.complete).length, total: questions.length, questions };
}
/** Only explicitly answered inputs shared with content-model.js are returned.
 * Scope decisions (RGO, geography, suppliers, FAZA responsibilities) remain in
 * the envelope and never silently change measured area or installation totals.
 */
export function getQuestionnaireCalculationInputs(value) {
  const { answers } = normalizeQuestionnaire(value);
  const compatible = [
    'guidedFlow', 'independentFlow', 'groupSize', 'guidedMinutes', 'independentMinutes',
    'guidedParticipation', 'independentParticipation', 'usersPerStation', 'experienceMinutes',
    'turnoverSeconds', 'targetUtilization', 'transitionPerDistrictMinutes',
    'heroPointsPerDistrict', 'interactivePointsPerDistrict', 'mediaPointsPerDistrict', 'objectPointsPerDistrict',
    'heroMinutes', 'interactiveStopMinutes', 'mediaMinutes', 'objectStopMinutes',
    'heroSurfacesPerInstallation', 'mediaSurfacesPerInstallation', 'surfacesPerInteractiveStation',
    'heroChannelMode', 'interactiveApplicationMode', 'objectContentInScope',
    'commonInstallations', 'commonPackages', 'commonSurfaces', 'commonMinutesPerPackage', 'commonRouteMinutes',
    'deliveryVersions'
  ];
  const result = {};
  for (const key of compatible) if (answers[key] !== null) result[key] = answers[key];
  if (answers.languages !== null) result.languageCount = answers.languages.length;
  return result;
}
export function validateQuestionnaireEnvelope(record) {
  const errors = [];
  if (!record || typeof record !== 'object' || Array.isArray(record) || record.schema !== QUESTIONNAIRE_SCHEMA_ID || record.schemaVersion !== QUESTIONNAIRE_SCHEMA_VERSION || !record.answers || typeof record.answers !== 'object' || Array.isArray(record.answers)) {
    return { valid: false, errors: ['Нужен JSON этой анкеты версии 1.'] };
  }
  if (record.revision !== undefined && (!Number.isSafeInteger(record.revision) || record.revision < 0)) errors.push('Неверный номер редакции.');
  if (record.updatedAt !== undefined && (typeof record.updatedAt !== 'string' || !Number.isFinite(Date.parse(record.updatedAt)))) errors.push('Неверная дата обновления.');
  if (Object.keys(record.answers).some(key => !hasOwn(FIELD_BY_ID, key))) errors.push('В ответах есть поля, которых нет в этой версии анкеты.');
  for (const field of FIELDS) {
    if (!hasOwn(record.answers, field.id)) continue;
    const raw = record.answers[field.id];
    if (raw === null || raw === undefined || raw === '') continue;
    let valid = true;
    if (field.type === 'scope') {
      valid = typeof raw === 'object' && !Array.isArray(raw)
        && Object.keys(raw).every(key => SCOPE_ITEMS.some(([scopeKey]) => key === scopeKey))
        && SCOPE_ITEMS.every(([key]) => !hasOwn(raw, key) || raw[key] === null || typeof raw[key] === 'boolean');
    } else if (field.type === 'number') valid = typeof raw === 'number' && cleanField(field, raw) !== null;
    else if (field.type === 'boolean') valid = typeof raw === 'boolean';
    else if (field.type === 'languages') valid = Array.isArray(raw) && raw.length <= 30 && raw.every(item => typeof item === 'string' && item.length <= 100 && item.trim());
    else if (field.type === 'select') valid = field.choices.some(([key]) => key === raw);
    else valid = typeof raw === 'string' && raw.length <= 5000;
    if (!valid) errors.push(`Неверный ответ: «${field.label}».`);
  }
  return { valid: errors.length === 0, errors };
}
export function buildQuestionnaireShareUrl(value, baseUrl) {
  const state = normalizeQuestionnaire(value);
  const url = new URL(baseUrl);
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  if (bytes.length > 44000) throw new Error('Для ссылки слишком много текста. Скачайте ответы JSON.');
  const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
  const payload = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  url.searchParams.set('parkAnswers', payload);
  url.hash = 'installations';
  if (url.href.length >= MAX_SHARE_URL_LENGTH) throw new Error('Ссылка слишком длинная. Скачайте ответы JSON.');
  return url.href;
}
export function readQuestionnaireShareUrl(baseUrl) {
  try {
    const url = new URL(baseUrl);
    const matches = url.searchParams.getAll('parkAnswers');
    if (matches.length === 0) return { present: false, state: null, error: null };
    if (matches.length !== 1 || url.href.length >= MAX_SHARE_URL_LENGTH) throw new Error('Ссылка с ответами повреждена или слишком длинная.');
    const payload = matches[0];
    if (!payload || !/^[A-Za-z0-9_-]+$/.test(payload) || payload.length % 4 === 1) throw new Error('Неверный формат ответов в ссылке.');
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - payload.length % 4) % 4);
    const binary = atob(base64);
    if (binary.length > 44000) throw new Error('В ссылке слишком много текста. Используйте файл JSON.');
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    const validation = validateQuestionnaireEnvelope(record);
    if (!validation.valid) throw new Error(validation.errors.join(' '));
    return { present: true, state: normalizeQuestionnaire(record), error: null };
  } catch (error) {
    return { present: true, state: null, error: trim(error?.message) || 'Ответы из ссылки не удалось прочитать.' };
  }
}
function displayValue(field, value) {
  if (value === null || value === undefined || value === '') return 'Не уточнено';
  if (field.type === 'boolean') return value ? 'Да' : 'Нет';
  if (field.type === 'languages') return value.join(', ');
  if (field.type === 'select') return field.choices.find(([key]) => key === value)?.[1] || 'Не уточнено';
  if (field.type === 'number') return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(value)}${field.unit ? ' ' + field.unit : ''}`;
  return String(value);
}
export function buildQuestionnaireText(value) {
  const state = normalizeQuestionnaire(value);
  const progress = getQuestionnaireProgress(state);
  const lines = ['ПАРК ВПЕЧАТЛЕНИЙ', 'Анкета для расчёта инсталляций и контента ФАЗЫ', '', `Редакция ответов: ${state.revision}`, `Обновлено: ${localTime(state.updatedAt)} (Владивосток)`, `Уточнено ключевых решений: ${progress.answered} из ${progress.total}`, 'Пустые ответы означают «не уточнено», а не ноль.', 'Этот файл сам по себе не подтверждает отправку ответов в проект.', ''];
  for (const group of GROUPS) {
    lines.push(group.title.toUpperCase(), '');
    for (const questionId of group.questions) {
      const question = QUESTION_BY_ID[questionId];
      lines.push(question.title);
      for (const key of [...question.fields, ...(question.advanced || [])]) {
        const field = FIELD_BY_ID[key];
        if (field.type === 'scope') {
          for (const [scopeKey, label] of SCOPE_ITEMS) lines.push(`  ${label}: ${state.answers.fazaScope[scopeKey] === null ? 'Не уточнено' : state.answers.fazaScope[scopeKey] ? 'Входит' : 'Не входит'}`);
        } else {
          lines.push(`  ${field.label}: ${displayValue(field, state.answers[key])}`);
        }
      }
      lines.push('');
    }
  }
  lines.push(`Схема данных: ${state.schema}; версия ${state.schemaVersion}.`);
  return lines.join('\n');
}
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
function printHtml(state) {
  return '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Парк впечатлений — ответы на анкету</title><style>body{font:15px/1.6 system-ui,sans-serif;color:#16251d;margin:32px auto;max-width:850px;padding:0 20px}h1{font-size:24px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}@media print{body{margin:0;max-width:none;padding:0;font-size:11pt}@page{margin:18mm}}</style><body><pre>' + escapeHtml(buildQuestionnaireText(state)) + '</pre></body></html>';
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function action(text, className = '') {
  const button = element('button', `iq-button ${className}`.trim(), text);
  button.type = 'button';
  return button;
}

/**
 * saveRemote(state) must resolve {saved:true} or {ok:true} after a durable save.
 * loadRemote() resolves an envelope, {state:envelope}, or null when no saved answers exist.
 * initialValues may be an answer map or a full envelope. A valid browser draft is
 * restored first unless an explicitly supplied full envelope is newer.
 */
export function createInstallationQuestionnaire(container, {
  initialValues = {}, onApply, sourceQuestionIds = null, saveRemote, loadRemote,
  storageKey = DEFAULT_STORAGE_KEY
} = {}) {
  if (!(container instanceof HTMLElement)) throw new TypeError('Для анкеты нужен HTML-контейнер.');
  const instanceId = `installation-questionnaire-${++instanceCounter}`;
  let state = normalizeQuestionnaire(initialValues, { sourceQuestionIds });
  let destroyed = false;
  let storageAvailable = true;
  let restored = false;
  let restoredFromLink = false;
  let sharedLinkError = null;
  let saveTimer;
  let previousState = null;
  const errors = new Map();
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.schema === QUESTIONNAIRE_SCHEMA_ID && saved.schemaVersion === QUESTIONNAIRE_SCHEMA_VERSION) {
        const incomingIsNewer = initialValues?.schema === QUESTIONNAIRE_SCHEMA_ID && Date.parse(initialValues.updatedAt) > Date.parse(saved.updatedAt);
        if (!incomingIsNewer) { state = normalizeQuestionnaire(saved, { sourceQuestionIds }); restored = true; }
      }
    }
  } catch { storageAvailable = false; }
  const sharedAnswers = readQuestionnaireShareUrl(window.location.href);
  if (sharedAnswers.state) {
    previousState = clone(state);
    state = sharedAnswers.state;
    restoredFromLink = true;
    restored = false;
    try {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('parkAnswers');
      cleanUrl.hash = 'installations';
      window.history.replaceState(window.history.state, '', cleanUrl.href);
    } catch { /* The imported answers remain usable even if URL cleanup is unavailable. */ }
  } else if (sharedAnswers.error) sharedLinkError = sharedAnswers.error;
  const root = element('section', 'installation-questionnaire');
  root.id = instanceId;
  const heading = element('div', 'iq-heading');
  const title = element('h3', 'iq-title', 'Что нужно уточнить для расчёта');
  title.id = `${instanceId}-title`;
  root.setAttribute('aria-labelledby', title.id);
  heading.append(title, element('p', 'iq-intro', '11 ключевых решений. Отвечайте по мере готовности: неизвестные значения можно оставить пустыми. Дополнительные параметры находятся внутри раскрывающихся разделов.'));
  root.append(heading);
  const progressRow = element('div', 'iq-progress-row');
  const progressLabel = element('span', 'iq-progress-label');
  const progress = element('progress', 'iq-progress');
  progress.max = QUESTIONS.length;
  progress.setAttribute('aria-label', 'Уточнённые ключевые решения');
  const nextButton = action('Следующий вопрос', 'iq-button-secondary');
  progressRow.append(progressLabel, progress, nextButton);
  root.append(progressRow);
  const localNote = element('p', 'iq-storage-note');
  const status = element('p', 'iq-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  root.append(localNote);

  const form = element('form', 'iq-form');
  form.noValidate = true;
  form.addEventListener('submit', event => event.preventDefault());
  const controls = new Map();
  const groupViews = new Map();
  const questionViews = new Map();

  function notify(message, error = false) {
    status.textContent = message;
    status.dataset.kind = error ? 'error' : 'info';
  }
  function storageMessage() {
    localNote.textContent = storageAvailable
      ? 'Черновик сохраняется в этом браузере. Чтобы передать ответы для расчёта, скопируйте ссылку или скачайте JSON и прикрепите в чат.'
      : 'Автосохранение недоступно в этом браузере. Чтобы передать ответы для расчёта, скопируйте ссылку или скачайте JSON и прикрепите в чат.';
  }
  function persist() {
    clearTimeout(saveTimer);
    if (destroyed) return;
    try { window.localStorage.setItem(storageKey, JSON.stringify(state)); storageAvailable = true; }
    catch { storageAvailable = false; }
    storageMessage();
  }
  function changed() {
    state.revision += 1;
    state.updatedAt = now();
    refreshProgress();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 250);
  }
  function setError(key, text, input, errorNode) {
    if (text) errors.set(key, text); else errors.delete(key);
    input.setCustomValidity?.(text || '');
    input.setAttribute('aria-invalid', text ? 'true' : 'false');
    errorNode.textContent = text || '';
    errorNode.hidden = !text;
  }
  function buildInput(field, scopeKey = null, scopeLabel = null) {
    const key = scopeKey ? `${field.id}.${scopeKey}` : field.id;
    const wrap = element('div', 'iq-field');
    const label = element('label', 'iq-label', scopeLabel || field.label);
    const inputId = `${instanceId}-${key}`;
    label.htmlFor = inputId;
    let input;
    if (field.type === 'scope' || field.type === 'boolean' || field.type === 'select') {
      input = element('select', 'iq-input');
      input.append(new Option('Не уточнено', ''));
      const choices = field.type === 'scope' ? [['true', 'Входит'], ['false', 'Не входит']]
        : field.type === 'boolean' ? [['true', 'Да'], ['false', 'Нет']] : field.choices;
      for (const [value, text] of choices) input.append(new Option(text, value));
    } else {
      input = element(field.type === 'textarea' ? 'textarea' : 'input', 'iq-input');
      if (field.type === 'number') {
        input.type = 'number'; input.min = String(field.min); input.max = String(field.max); input.step = String(field.step); input.inputMode = field.step === 1 ? 'numeric' : 'decimal';
      } else if (field.type !== 'textarea') { input.type = 'text'; }
      if (field.type === 'textarea') { input.rows = 3; wrap.classList.add('iq-field-wide'); }
      input.maxLength = 5000;
      input.placeholder = 'Не уточнено';
    }
    input.id = inputId;
    input.name = key;
    const hint = element('p', 'iq-hint', field.type === 'scope' ? '' : field.hint || (field.unit ? `Единица: ${field.unit}` : ''));
    hint.id = `${inputId}-hint`;
    if (!hint.textContent) hint.hidden = true;
    const errorNode = element('p', 'iq-field-error');
    errorNode.id = `${inputId}-error`;
    errorNode.setAttribute('role', 'alert');
    errorNode.hidden = true;
    input.setAttribute('aria-describedby', `${hint.id} ${errorNode.id}`);
    wrap.append(label, input, hint, errorNode);
    function read() {
      let value;
      let error = '';
      if (scopeKey || field.type === 'boolean') value = input.value === '' ? null : input.value === 'true';
      else if (field.type === 'number') {
        if (!input.value) {
          value = null;
          if (input.validity.badInput) error = 'Введите число или оставьте поле пустым.';
        } else {
          const parsed = Number(input.value);
          value = cleanField(field, parsed);
          if (value === null) error = field.step === 1 ? `Нужно целое число от ${field.min} до ${field.max}.` : `Нужно число от ${field.min} до ${field.max}.`;
        }
      } else value = cleanField(field, input.value);
      setError(key, error, input, errorNode);
      if (scopeKey) state.answers.fazaScope[scopeKey] = value;
      else state.answers[field.id] = value;
      changed();
    }
    input.addEventListener(field.type === 'scope' || field.type === 'boolean' || field.type === 'select' ? 'change' : 'input', read);
    controls.set(key, { input, field, scopeKey, errorNode });
    return wrap;
  }
  function buildField(fieldId) {
    const field = FIELD_BY_ID[fieldId];
    if (field.type !== 'scope') return buildInput(field);
    const wrap = element('div', 'iq-scope-grid iq-field-wide');
    for (const [key, label] of SCOPE_ITEMS) wrap.append(buildInput(field, key, label));
    return wrap;
  }
  for (const [groupIndex, group] of GROUPS.entries()) {
    const details = element('details', 'iq-group');
    details.open = groupIndex === 0;
    const summary = element('summary', 'iq-group-summary');
    const count = element('span', 'iq-group-count');
    summary.append(element('span', 'iq-group-name', group.title), count);
    details.append(summary);
    for (const questionId of group.questions) {
      const question = QUESTION_BY_ID[questionId];
      const fieldset = element('fieldset', 'iq-question');
      const legend = element('legend', 'iq-question-title', question.title);
      const questionState = element('span', 'iq-question-state');
      const grid = element('div', 'iq-fields');
      fieldset.id = `${instanceId}-question-${questionId}`;
      legend.append(questionState);
      fieldset.append(legend);
      for (const fieldId of question.fields) grid.append(buildField(fieldId));
      fieldset.append(grid);
      if (question.advanced?.length) {
        const advanced = element('details', 'iq-advanced');
        const advancedSummary = element('summary', 'iq-advanced-summary', 'Дополнительные параметры');
        const advancedGrid = element('div', 'iq-fields');
        for (const fieldId of question.advanced) advancedGrid.append(buildField(fieldId));
        advanced.append(advancedSummary, advancedGrid);
        fieldset.append(advanced);
      }
      details.append(fieldset);
      questionViews.set(questionId, { fieldset, state: questionState, parent: details });
    }
    groupViews.set(group.id, { details, count });
    form.append(details);
  }
  root.append(form);
  const actions = element('div', 'iq-actions');
  const applyButton = action('Применить заполненное к расчёту', 'iq-button-primary');
  applyButton.hidden = typeof onApply !== 'function';
  const exportJsonButton = action('Скачать ответы JSON');
  const shareButton = action('Скопировать ссылку с ответами');
  const exportTextButton = action('Скачать текст');
  const printButton = action('Печать ответов');
  const importButton = action('Загрузить ответы из файла');
  const undoButton = action('Отменить замену ответов', 'iq-button-secondary');
  undoButton.hidden = !restoredFromLink;
  const fileInput = element('input', 'iq-file-input');
  fileInput.type = 'file'; fileInput.accept = '.json,application/json'; fileInput.hidden = true;
  actions.append(applyButton, shareButton, exportJsonButton, exportTextButton, printButton, importButton, undoButton, fileInput);
  root.append(actions);
  const shareFallback = element('div', 'iq-share-fallback');
  shareFallback.hidden = true;
  const shareLabel = element('label', 'iq-label', 'Ссылка с ответами');
  shareLabel.htmlFor = `${instanceId}-share-link`;
  const shareInput = element('textarea', 'iq-input');
  shareInput.id = shareLabel.htmlFor; shareInput.readOnly = true; shareInput.rows = 3;
  shareFallback.append(shareLabel, shareInput, element('p', 'iq-hint', 'Скопируйте ссылку из этого поля и передайте её для расчёта. Она восстанавливает ответы на другом устройстве.'));
  root.append(shareFallback);
  const remoteActions = element('div', 'iq-remote-actions');
  const saveRemoteButton = action('Сохранить ответы в проекте');
  const loadRemoteButton = action('Загрузить ответы проекта');
  saveRemoteButton.hidden = typeof saveRemote !== 'function';
  loadRemoteButton.hidden = typeof loadRemote !== 'function';
  remoteActions.hidden = saveRemoteButton.hidden && loadRemoteButton.hidden;
  remoteActions.append(saveRemoteButton, loadRemoteButton);
  root.append(remoteActions, status);
  container.append(root);

  function hydrate() {
    for (const [key, { input, field, scopeKey, errorNode }] of controls) {
      const value = scopeKey ? state.answers.fazaScope[scopeKey] : state.answers[field.id];
      input.value = value === null ? '' : field.type === 'languages' ? value.join(', ') : String(value);
      setError(key, '', input, errorNode);
    }
    refreshProgress();
  }
  function refreshProgress() {
    const result = getQuestionnaireProgress(state);
    progress.value = result.answered;
    progressLabel.textContent = `Уточнено ${result.answered} из ${result.total} ключевых решений`;
    for (const question of result.questions) {
      const view = questionViews.get(question.id);
      view.state.textContent = question.complete ? 'Уточнено' : question.partial ? 'Частично' : 'Не уточнено';
      view.state.dataset.complete = String(question.complete);
    }
    for (const group of GROUPS) {
      const answered = result.questions.filter(question => group.questions.includes(question.id) && question.complete).length;
      groupViews.get(group.id).count.textContent = `${answered}/${group.questions.length}`;
    }
    nextButton.disabled = result.answered === result.total;
    applyButton.disabled = errors.size > 0;
  }
  function replaceAnswers(record) {
    previousState = clone(state);
    state = normalizeQuestionnaire(record, { sourceQuestionIds });
    state.revision = Math.max(state.revision, previousState.revision) + 1;
    state.updatedAt = now();
    undoButton.hidden = false;
    hydrate(); persist();
  }
  function exportValue(format = 'json') {
    if (format === 'json') return JSON.stringify(state, null, 2);
    if (format === 'text' || format === 'txt') return buildQuestionnaireText(state);
    if (format === 'html' || format === 'print') return printHtml(state);
    if (format === 'url' || format === 'link') return buildQuestionnaireShareUrl(state, window.location.href);
    throw new Error('Доступные форматы: json, text, html, url.');
  }
  function download(format) {
    const type = format === 'json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8';
    const blob = new Blob([format === 'json' ? exportValue('json') : '\ufeff' + exportValue('text')], { type });
    const url = URL.createObjectURL(blob);
    const link = element('a');
    link.href = url;
    link.download = `Парк_впечатлений_Анкета_ответы_${localDate()}.${format === 'json' ? 'json' : 'txt'}`;
    root.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Файл ответов подготовлен. Это выгрузка; она не отправляет ответы в проект.');
  }
  nextButton.addEventListener('click', () => {
    const result = getQuestionnaireProgress(state);
    const next = result.questions.find(question => !question.complete);
    if (!next) return;
    const view = questionViews.get(next.id);
    view.parent.open = true;
    const definition = QUESTION_BY_ID[next.id];
    const fieldId = definition.required.find(key => !isKnown(FIELD_BY_ID[key], state.answers[key])) || (next.id === 'Q07' ? 'commonZonesDescription' : definition.fields[0]);
    const field = FIELD_BY_ID[fieldId];
    const key = field.type === 'scope' ? `fazaScope.${SCOPE_ITEMS.find(([scopeKey]) => state.answers.fazaScope[scopeKey] === null)?.[0] || SCOPE_ITEMS[0][0]}` : fieldId;
    view.fieldset.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    controls.get(key)?.input.focus({ preventScroll: true });
  });
  applyButton.addEventListener('click', async () => {
    if (errors.size) { notify('Исправьте подсвеченные значения перед применением.', true); return; }
    applyButton.disabled = true;
    try { persist(); await onApply?.(clone(state)); notify('Заполненные ответы переданы в расчёт. Неизвестные ответы остаются неуточнёнными.'); }
    catch (error) { notify(`Не удалось применить ответы: ${trim(error?.message) || 'попробуйте ещё раз'}`, true); }
    finally { if (!destroyed) applyButton.disabled = errors.size > 0; }
  });
  exportJsonButton.addEventListener('click', () => download('json'));
  shareButton.addEventListener('click', async () => {
    let url;
    try { persist(); url = buildQuestionnaireShareUrl(state, window.location.href); }
    catch (error) { notify(trim(error?.message) || 'Не удалось подготовить ссылку. Скачайте JSON.', true); return; }
    shareInput.value = url;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Буфер обмена недоступен.');
      await navigator.clipboard.writeText(url);
      shareFallback.hidden = true;
      notify('Ссылка с ответами скопирована. Её можно прислать в чат или открыть на другом устройстве.');
    } catch {
      shareFallback.hidden = false;
      shareInput.focus(); shareInput.select();
      notify('Ссылка подготовлена ниже. Браузер не разрешил автоматическое копирование — скопируйте её из поля.');
    }
  });
  exportTextButton.addEventListener('click', () => download('text'));
  printButton.addEventListener('click', () => {
    const popup = window.open('', '_blank');
    if (!popup) { notify('Браузер не открыл окно печати. Можно скачать текст ответов.', true); return; }
    popup.document.open(); popup.document.write(printHtml(state)); popup.document.close(); popup.focus(); popup.print();
  });
  importButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('Файл анкеты должен быть меньше 1 МБ.');
      const record = JSON.parse(await file.text());
      const validation = validateQuestionnaireEnvelope(record);
      if (!validation.valid) throw new Error(validation.errors.join(' '));
      replaceAnswers(record);
      notify('Ответы загружены из файла. Замену можно отменить; для изменения расчёта нажмите «Применить».');
    } catch (error) { notify(`Файл не загружен: ${trim(error?.message) || 'неверный формат'}`, true); }
    finally { fileInput.value = ''; }
  });
  undoButton.addEventListener('click', () => {
    if (!previousState) return;
    state = clone(previousState); previousState = null;
    state.revision += 1; state.updatedAt = now();
    undoButton.hidden = true; hydrate(); persist();
    notify('Предыдущие ответы восстановлены.');
  });
  saveRemoteButton.addEventListener('click', async () => {
    if (typeof saveRemote !== 'function') return;
    if (errors.size) { notify('Исправьте подсвеченные значения перед сохранением в проекте.', true); return; }
    saveRemoteButton.disabled = true;
    try {
      persist();
      const submitted = clone(state);
      const result = await saveRemote(submitted);
      if (result?.saved !== true && result?.ok !== true) throw new Error('Сервер не подтвердил сохранение.');
      notify(state.revision === submitted.revision ? 'Сервер подтвердил сохранение ответов в проекте.' : `В проекте сохранена редакция ${submitted.revision}. Текущий черновик уже изменён.`);
    } catch (error) { notify(`Ответы не сохранены в проекте: ${trim(error?.message) || 'ошибка соединения'}. Черновик можно скачать.`, true); }
    finally { if (!destroyed) saveRemoteButton.disabled = false; }
  });
  loadRemoteButton.addEventListener('click', async () => {
    if (typeof loadRemote !== 'function') return;
    loadRemoteButton.disabled = true;
    try {
      const result = await loadRemote();
      const record = result?.state || result;
      if (record === null || record === undefined) { notify('В проекте пока нет сохранённых ответов.'); return; }
      const validation = validateQuestionnaireEnvelope(record);
      if (!validation.valid) throw new Error(validation.errors.join(' '));
      replaceAnswers(record);
      notify('Ответы проекта загружены. Замену можно отменить.');
    } catch (error) { notify(`Не удалось загрузить ответы: ${trim(error?.message) || 'ошибка соединения'}`, true); }
    finally { if (!destroyed) loadRemoteButton.disabled = false; }
  });
  hydrate(); storageMessage();
  window.addEventListener('pagehide', persist);
  if (restoredFromLink) {
    persist();
    notify('Ответы восстановлены из ссылки. Для изменения расчёта нажмите «Применить заполненное к расчёту».');
  } else if (sharedLinkError) {
    notify(`Ответы из ссылки не загружены: ${sharedLinkError} Текущий черновик сохранён.`, true);
  } else if (restored) notify(`Восстановлен черновик от ${localTime(state.updatedAt)} по Владивостоку.`);
  return {
    update(values = {}, { replace = false } = {}) {
      if (destroyed) return;
      if (replace) { replaceAnswers(values); return; }
      const patch = values.answers && typeof values.answers === 'object' ? values.answers : values;
      const merged = clone(state);
      for (const field of FIELDS) {
        if (!hasOwn(patch, field.id)) continue;
        merged.answers[field.id] = field.type === 'scope'
          ? { ...state.answers.fazaScope, ...(patch[field.id] || {}) }
          : patch[field.id];
      }
      state = normalizeQuestionnaire(merged, { sourceQuestionIds });
      hydrate(); changed();
    },
    state() { return clone(state); },
    getState() { return clone(state); },
    export: exportValue,
    shareUrl() { return buildQuestionnaireShareUrl(state, window.location.href); },
    progress() { return getQuestionnaireProgress(state); },
    destroy() { persist(); destroyed = true; clearTimeout(saveTimer); window.removeEventListener('pagehide', persist); root.remove(); }
  };
}
