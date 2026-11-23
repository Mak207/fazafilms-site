// Geometry: original assembly 1911. The received concept dated 21.10.2026
// is a separate design reference, not executable behavior or final approval.
// Browser controls and media below are our demonstration of the source forms.
export const SOURCE_CITIES = Object.freeze([
  { id: 'vladimir', title: 'Владимир', zoneId: 'vladimir' },
  { id: 'suzdal', title: 'Суздаль', zoneId: 'vladimir' },
  { id: 'tver', title: 'Тверь', zoneId: 'tver' },
  { id: 'yaroslavl', title: 'Ярославль', zoneId: 'yaroslavl' },
  { id: 'rostov', title: 'Ростов', zoneId: 'yaroslavl' },
  { id: 'pereslavl', title: 'Переславль', zoneId: 'yaroslavl' },
  { id: 'sergiev-posad', title: 'Сергиев Посад', zoneId: 'sergiev-posad' },
  { id: 'kostroma', title: 'Кострома', zoneId: 'kostroma' },
  { id: 'ivanovo', title: 'Иваново', zoneId: 'ivanovo' },
  { id: 'nizhny-novgorod', title: 'Нижний Новгород', zoneId: 'nizhny-novgorod' }
]);

export const SOURCE_INTERESTS = Object.freeze([
  { id: 'architecture', title: 'Архитектура', route: ['vladimir', 'suzdal', 'rostov', 'yaroslavl'] },
  { id: 'crafts', title: 'Ремёсла', route: ['ivanovo', 'kostroma', 'sergiev-posad', 'suzdal'] },
  { id: 'rivers', title: 'Реки', route: ['tver', 'yaroslavl', 'kostroma', 'nizhny-novgorod'] }
]);

export const SOURCE_SCROLL_CHAPTERS = Object.freeze([
  { id: 'stone', title: 'Владимир', at: 0 },
  { id: 'capital', title: 'Рублёв', at: .5 },
  { id: 'craft', title: 'Суздаль', at: 1 }
]);

export const SOURCE_WELL_THEMES = Object.freeze([
  { id: 'kalyazin', title: 'Калязин' },
  { id: 'kashin', title: 'Кашин' },
  { id: 'three-seas', title: 'Три моря' }
]);

export const SOURCE_BOBBIN_THEMES = Object.freeze([
  { id: 'filigree', title: 'Скань' },
  { id: 'capital', title: 'Капитал' },
  { id: 'salt', title: 'Соль' }
]);

export const SOURCE_MAP_LAYERS = Object.freeze([
  { id: 'cities', title: 'Города' },
  { id: 'rivers', title: 'Реки' },
  { id: 'nature', title: 'Природа' },
  { id: 'trade', title: 'Торговля' },
  { id: 'crafts', title: 'Ремёсла' },
  { id: 'architecture', title: 'Архитектура' }
]);

export const SOURCE_CRAFTS = Object.freeze([
  { id: 'pottery', title: 'Керамика' },
  { id: 'matryoshka', title: 'Матрёшка' },
  { id: 'gorodets', title: 'Городец' },
  { id: 'palekh', title: 'Палех' },
  { id: 'lace', title: 'Кружево' },
  { id: 'glass', title: 'Стекло' },
  { id: 'finift', title: 'Финифть' },
  { id: 'filigree', title: 'Филигрань' }
]);

export const SOURCE_GLASS_STAGE_NAMES = Object.freeze([
  'Выдувание формы', 'Гладкая заготовка', 'Нанесение огранки', 'Готовое изделие'
]);

const source = pages => ({
  assembly: '1911',
  concept: '2026-10-21',
  pages,
  reference: 'Полученная концепция 21.10.2026, с. ' + pages.join(', ') + '. Исходная сборка 1911.'
});

export const SOURCE_OBJECT_EVIDENCE = Object.freeze({
  "scroll": {
    "title": "Стол-свиток",
    "sourceObjects": [
      "Group2146524701",
      "Cylinder179",
      "Cylinder180",
      "Object174075797"
    ],
    "description": "Деревянный стол, два валика и полотно внутри белого павильона. Все эти части присутствуют в присланной 3D-сборке.",
    "webDemo": "В туре: прокрутка изображений, вращение валиков и выбор главы."
  },
  "well": {
    "title": "Колодец",
    "sourceObjects": [
      "Group2146524757",
      "Circle010",
      "Circle011",
      "Circle012"
    ],
    "description": "Круглая чаша с деревянным бортом и внутренней круглой поверхностью. В исходнике детали объединены материалом Kolodec.",
    "webDemo": "В туре: три темы, отражения на воде и переход через дымку."
  },
  "boats": {
    "title": "Подвесная речная композиция",
    "sourceObjects": [
      "Layer:01 Install-0.009"
    ],
    "description": "Подвесная ферма с замкнутым контуром и формами, похожими на корпуса судов. Конструкция взята из исходной модели.",
    "webDemo": "В туре: переключение речных сюжетов на исходных поверхностях. Ферма остаётся неподвижной."
  },
  "bells": {
    "title": "Колоколообразные подвесы",
    "sourceObjects": [
      "Cylinder136",
      "Cylinder256–263"
    ],
    "description": "Девять крупных подвесных объёмов колоколообразной формы. Их геометрия есть в исходной модели; это сценография зала.",
    "webDemo": "В туре: синтезированный перезвон и подсветка подвесов по нажатию."
  },
  "bobbins": {
    "title": "Катушки и бобины",
    "sourceObjects": [
      "Бобины.*",
      "Object174075933",
      "Object174075935"
    ],
    "description": "Крупные катушки и составные цилиндры в общем зале Костромы и Иванова. Принадлежность каждой группы конкретному региону пока не установлена.",
    "webDemo": "В туре: вращение исходных катушек и смена цветовой темы."
  },
  "yarn": {
    "title": "Составные веретёна",
    "sourceObjects": [],
    "description": "Назначение отдельных составных цилиндров в исходной модели требует сопоставления.",
    "webDemo": "Световая волна — вариант демонстрации."
  },
  "ornament": {
    "title": "Три плоские панели",
    "sourceObjects": [
      "Box2131647505",
      "Box2131647506",
      "Box2131647507"
    ],
    "description": "Три высокие прямоугольные панели в общем зале Костромы и Иванова. Их форма есть в модели; название устройства и способ управления в 3D-файле не указаны.",
    "webDemo": "В туре: постепенное проявление текстильного узора."
  },
  "finale": {
    "title": "Кольца, сфера и панорама",
    "sourceObjects": [
      "Sphere001",
      "Circle008"
    ],
    "description": "Кольцевая композиция, центральная сфера и окружающая панорамная поверхность. Все основные формы присутствуют в исходной сборке.",
    "webDemo": "В туре: выбор города и темы меняет изображения и освещение."
  },
  "map": {
    "title": "Поле карты и роботизированные руки",
    "sourceObjects": [
      "Shape26",
      "Object174075859",
      "FR20-V6.0-*"
    ],
    "description": "Продолговатое поле и семь сборок роботизированных рук FR20. Их форма и расположение сохранены из исходной модели.",
    "webDemo": "В туре: шесть тематических слоёв карты. Это экранная демонстрация; руки остаются неподвижными."
  },
  "workshops": {
    "title": "Ремесленные ячейки",
    "sourceObjects": [
      "Box2131647155/7156/7158/7160/7164/7166",
      "Object174075920/174075921",
      "Apple_Vision_Pro"
    ],
    "description": "Восемь ячеек с экранными поверхностями и модель гарнитуры Apple Vision Pro на тумбе. Приложение для гарнитуры в 3D-файле отсутствует.",
    "webDemo": "В туре: выбор ремесла и четыре иллюстрированных этапа стекольного процесса."
  }
});

export const SOURCE_INTERACTIVE_DEFINITIONS = Object.freeze([
  {
    id: 'scroll', zoneId: 'vladimir', objectId: 'scroll',
    title: 'Стол-свиток «Рождение столицы»',
    button: 'Открыть свиток', action: 'Прокрутить летопись',
    description: 'Прокручивайте летопись: изображение движется между двумя исходными валиками стола.',
    instruction: 'Прокрутите полотно или выберите главу.',
    camera: { position: [-6.2, 2.3, -8.5], target: [-5.9, .8, -6], fov: 65 },
    bounds: { min: [-7.100031, .151226, -7.25404], max: [-4.62762, 1.185892, -4.549749] },
    ...source([23, 24])
  },
  {
    id: 'well', zoneId: 'tver', objectId: 'kaleidoscope',
    title: 'Колодец-калейдоскоп',
    button: 'Заглянуть в колодец', action: 'Выбрать историю',
    description: 'Три истории Тверской земли отражаются на воде колодца. Переход между ними раскрывается через дымку.',
    instruction: 'Выберите историю и включите движение воды.',
    camera: { position: [-13.8, 2.9, -8.3], target: [-16.104, .98, -10.397], fov: 53 },
    bounds: { min: [-17.055523, .377501, -11.349126], max: [-15.153356, 1.077499, -9.447049] },
    ...source([28, 29, 30])
  },
  {
    id: 'boats', zoneId: 'yaroslavl', objectId: 'river-of-time',
    title: 'Река времени',
    button: 'Река времени вблизи', action: 'Запустить речную историю',
    description: 'Исходная подвесная композиция с замкнутой рейкой и речным медиарассказом.',
    instruction: 'Выберите главу речной истории.',
    camera: { position: [-18, 7, 10], target: [-13, 2.7, 2], fov: 62 },
    bounds: { min: [-19.294098, .008092, -1.900652], max: [-8.306767, 5.393902, 8.57196] },
    ...source([33, 34])
  },
  {
    id: 'bells', zoneId: 'sergiev-posad', objectId: 'bell-ensemble',
    title: 'Соборный звон',
    button: 'Включить звон', action: 'Сыграть перезвон',
    description: 'Выберите голос колокола: световой отклик появляется на исходной колоколообразной сценографии.',
    instruction: 'Звук включается только после нажатия.',
    camera: { position: [-12, 9, 17], target: [-21, 2.9, 12], fov: 55 },
    bounds: { min: [-26.67794, 1.488382, 9.905815], max: [-12.744102, 5.864812, 17.504923] },
    ...source([38, 39, 40])
  },
  {
    id: 'bobbins', zoneId: 'kostroma', zoneIds: ['kostroma', 'ivanovo'], objectId: 'spools',
    title: 'Оборот',
    button: 'Запустить бобины', action: 'Выбрать тему и вращение',
    description: 'Катушки исходной сборки в общем зале Костромы и Иванова. Вращение и свет раскрывают выбранную тему ремёсел.',
    instruction: 'Выберите тему, затем запустите вращение.',
    camera: { position: [-11.1, 3.8, 12.3], target: [-8.3, 1.5, 8.5], fov: 54 },
    bounds: { min: [-9.421103, .001389, 5.877631], max: [-1.456647, 3.307062, 11.988347] },
    ...source([45, 46, 49, 50])
  },
  {
    id: 'yarn', zoneId: 'ivanovo', objectId: 'yarn',
    title: 'Пряжа',
    button: 'Включить световую пряжу', action: 'Запустить световую волну',
    description: 'Свет проходит по сегментам-веретёнам исходной установки.',
    instruction: 'Запустите движение света.',
    camera: { position: [-7, 4.2, 13.2], target: [-5.8, 1.8, 8.5], fov: 53 },
    ...source([49, 50])
  },
  {
    id: 'ornament', zoneId: 'ivanovo', objectId: 'ornament',
    title: 'Орнамент',
    button: 'Вышить орнамент', action: 'Вышивать узор',
    description: 'Узор раскрывается на гибком экране стежок за стежком, вслед за движением посетителя.',
    instruction: 'Нажмите «Вышивать» или ведите ползунок ровно.',
    camera: { position: [-5.2, 3.6, 5.4], target: [-5.5, 1.7, 8.5], fov: 55 },
    ...source([49, 50])
  },
  {
    id: 'finale', zoneId: 'finale', objectId: 'journey',
    title: 'Выбор путешествия',
    button: 'Выбрать путешествие', action: 'Выбрать город и интерес',
    description: 'Выберите первый город и тему путешествия. Панорама и сфера покажут соответствующий образ маршрута.',
    instruction: 'Город и интерес задают начало вашего маршрута.',
    camera: { position: [31, 6.6, 12.2], target: [24.49, 3.3, 4.18], fov: 59 },
    bounds: { min: [19.789677, 2.204708, -.521782], max: [29.192535, 5.204708, 8.881079] },
    ...source([63, 65])
  },
  {
    id: 'map', zoneId: 'map', objectId: 'sand-map',
    title: 'Карта Золотого кольца',
    button: 'Управлять картой', action: 'Выбрать слой карты',
    description: 'Исследуйте города, реки, природу, торговлю, ремёсла и архитектуру на исходном поле карты.',
    instruction: 'Выберите, что показать на карте.',
    camera: { position: [27.4, 7.8, -2.9], target: [23.42, .52, -8.05], fov: 58 },
    bounds: { min: [15.559132, 0, -10.540543], max: [31.285397, 1.033772, -5.554237] },
    ...source([15, 16, 17, 18])
  },
  {
    id: 'workshops', zoneId: 'workshops', objectId: 'craft-screens',
    title: 'Мастерская',
    button: 'Выбрать ремесло', action: 'Показать процесс ремесла',
    description: 'Выберите ремесло. В стекольной мастерской показаны четыре этапа — от горячей формы до огранённого изделия.',
    instruction: 'Выберите ремесло на экранах мастерской.',
    camera: { position: [13.4, 3.8, 16.4], target: [13, 1.45, 12.2], fov: 60 },
    ...source([59, 60, 61])
  }
].map(item => Object.freeze({
  ...item,
  conceptTitle: item.title,
  ...SOURCE_OBJECT_EVIDENCE[item.id],
  reference: 'Форма: исходная сборка 1911. ' + (SOURCE_OBJECT_EVIDENCE[item.id]?.sourceObjects || []).join(', ') + '. Сценарное сопоставление: концепция 21.10.2026, с. ' + item.pages.join(', ') + '. Веб-управление добавлено Фазой.',
  viewId: 'object-' + item.zoneId + '-' + item.objectId
})));

export function sourceJourney(city, interest) {
  const start = SOURCE_CITIES.some(item => item.id === city) ? city : 'vladimir';
  const theme = SOURCE_INTERESTS.find(item => item.id === interest) || SOURCE_INTERESTS[0];
  return [start, ...theme.route.filter(id => id !== start)].slice(0, 3);
}
