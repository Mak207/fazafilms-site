/**
 * Screen content for the customer's Golden Ring model.
 * Paths are relative to tour/index.html.
 * contentCrop = [left, top, width, height], normalized source-image coordinates;
 * top is measured from the top edge. Apply crop before aspect-ratio fitting.
 * Photographs have explicit object names. Existing painted assets are thematic
 * illustrations; they must not be presented as documentary city photographs.
 */
const art = (file) => '../interactives/art/' + file;
const media = (file) => 'assets/source-media/' + file;
const concept = (pages) => 'Полученная концепция «Золотое кольцо», 21.10.2026, с. ' + pages;
const conceptCaption = 'Иллюстрация из полученной концепции.';
const themeCaption = 'Художественная визуализация темы.';
const nicheCrop = [0.30, 0.49, 0.42, 0.30];

const vladimir = {
  src: media('vladimir-dormition.jpg'), title: 'Владимир · Успенский собор',
  caption: 'Фотография: Alexxx1979, 2025. CC BY-SA 4.0.',
  kind: 'photograph', creditId: 'vladimir-dormition', focal: [0.51, 0.50]
};
const suzdal = {
  src: media('suzdal-kremlin.jpg'), title: 'Суздаль · Кремль',
  caption: 'Фотография: Dmitry Makeev (Knopik-som), 2007. CC BY-SA 4.0.',
  kind: 'photograph', creditId: 'suzdal-kremlin', focal: [0.51, 0.45]
};
const kalyazin = {
  src: media('kalyazin-bell-tower.jpg'), title: 'Калязин · Никольская колокольня',
  caption: 'Фотография: Александр Байдуков, 2020. CC BY-SA 4.0.',
  kind: 'photograph', creditId: 'kalyazin-bell-tower', focal: [0.64, 0.50]
};
const river = {src: art('barge-river.webp'), title: 'Волжские берега', caption: themeCaption, kind: 'thematic-illustration'};
const bellsDay = {src: art('bells-riverside.webp'), title: 'Река и соборный звон', caption: themeCaption, kind: 'thematic-illustration'};
const bellsDusk = {src: art('bells-riverside-dusk.webp'), title: 'Вечер над рекой', caption: themeCaption, kind: 'thematic-illustration'};
const cloth = {src: art('loom-finale.webp'), title: 'Нить превращается в узор', caption: themeCaption, kind: 'thematic-illustration'};
const floral = {src: art('craft-finale.webp'), title: 'Цвет и роспись', caption: themeCaption, kind: 'thematic-illustration'};
const pigment = {src: art('craft-pigment.webp'), title: 'Цветочный орнамент', caption: themeCaption, kind: 'thematic-illustration'};
const fair = {src: art('fairground/fair-panorama.webp'), title: 'Ярмарка и торговые пути', caption: themeCaption, kind: 'thematic-illustration'};
const passport = {src: art('passport-finale.webp'), title: 'Начало путешествия', caption: themeCaption, kind: 'thematic-illustration'};

const history = [
  {src: media('history-sergius-1370.jpg'), title: '1370 · Сергий Радонежский', caption: conceptCaption, kind: 'customer-concept', objectFit: 'contain', sourceRef: concept('14')},
  {src: media('history-rublev-1408.jpg'), title: '1408 · Андрей Рублёв', caption: conceptCaption, kind: 'customer-concept', objectFit: 'contain', sourceRef: concept('14')},
  {src: media('history-rostov-bell-1688.jpg'), title: '1688 · Ростов Великий', caption: conceptCaption, kind: 'customer-concept', objectFit: 'contain', sourceRef: concept('14')}
];

export const SOURCE_WORKSHOP_CRAFTS = [
  {craftId: 'pottery', id: 'pottery', title: 'Мастерская керамики', shortTitle: 'Керамика', file: 'workshop-ceramics.jpg', page: 59, action: 'Сформировать сосуд'},
  {craftId: 'matryoshka', id: 'matryoshka', title: 'Тайна русской матрёшки', shortTitle: 'Матрёшка', file: 'workshop-matryoshka.jpg', page: 59, action: 'Открыть матрёшку'},
  {craftId: 'gorodets', id: 'gorodets', title: 'Художник Городца', shortTitle: 'Городец', file: 'workshop-gorodets.jpg', page: 59, action: 'Расписать узор'},
  {craftId: 'palekh', id: 'palekh', title: 'Секреты Палеха', shortTitle: 'Палех', file: 'workshop-palekh.jpg', page: 59, action: 'Показать образец'},
  {craftId: 'lace', id: 'lace', title: 'Кружевное одеяние', shortTitle: 'Кружево', file: 'workshop-lace.jpg', page: 60, action: 'Выбрать узор'},
  {craftId: 'glass', id: 'glass', title: 'Мастер-стеклодув', shortTitle: 'Стекло', file: 'workshop-glass.jpg', page: 60, action: 'Выдуть форму'},
  {craftId: 'finift', id: 'finift', title: 'Мастерская финифти', shortTitle: 'Финифть', file: 'workshop-finift.jpg', page: 60, action: 'Рассмотреть роспись'},
  {craftId: 'filigree', id: 'filigree', title: 'Искусство филиграни', shortTitle: 'Филигрань', file: 'workshop-filigree.jpg', page: 60, action: 'Соединить узор'}
].map((craft) => ({
  ...craft, src: media(craft.file), caption: conceptCaption,
  kind: 'customer-concept', contentCrop: craft.craftId === 'matryoshka' ? [0.33, 0.45, 0.35, 0.34] : [...nicheCrop], objectFit: 'contain',
  sourceRef: concept(String(craft.page))
}));

export const SOURCE_WELL_MODES = {
  kalyazin: {title: 'Калязин', slides: [kalyazin], sourceRef: concept('28')},
  kashin: {
    title: 'Кашин · источники',
    slides: [{...river, title: 'Вода и источники', caption: 'Водная композиция к сюжету об источниках Кашина. Художественная визуализация.', effect: 'water'}],
    sourceRef: concept('28')
  },
  nikitin: {
    title: 'Три моря',
    slides: [{...river, title: 'Путешествие Афанасия Никитина', caption: 'Образ водного путешествия. Художественная визуализация.', effect: 'water'}],
    sourceRef: concept('28')
  }
};

export const SOURCE_FINALE_CITIES = {
  vladimir: {title: 'Владимир', zoneId: 'vladimir', slides: [vladimir, history[1]], sourceRef: concept('19–25')},
  suzdal: {title: 'Суздаль', zoneId: 'vladimir', slides: [suzdal], sourceRef: concept('19–25')},
  tver: {title: 'Тверь', zoneId: 'tver', slides: [{...kalyazin, caption: 'Тверская область · Калязин. Фотография: Александр Байдуков. CC BY-SA 4.0.'}, river], sourceRef: concept('26–30')},
  yaroslavl: {title: 'Ярославль', zoneId: 'yaroslavl', slides: [{...river, title: 'Ярославский зал · Река времени'}, bellsDay], sourceRef: concept('31–35')},
  rostov: {title: 'Ростов', zoneId: 'yaroslavl', slides: [history[2], {...bellsDay, title: 'Колокольный звон', caption: 'Художественная визуализация темы звона.'}], sourceRef: concept('14, 31–35')},
  pereslavl: {title: 'Переславль', zoneId: 'yaroslavl', slides: [{...river, title: 'Переславль · водные пути', caption: 'Образ воды и путешествия. Художественная визуализация.'}], sourceRef: concept('31–35')},
  'sergiev-posad': {title: 'Сергиев Посад', zoneId: 'sergiev-posad', slides: [history[0], {...bellsDay, title: 'Соборный звон'}], sourceRef: concept('36–40')},
  kostroma: {title: 'Кострома', zoneId: 'kostroma', slides: [SOURCE_WORKSHOP_CRAFTS[7], {...fair, title: 'Костромской зал · ремёсла и торговля'}], sourceRef: concept('43–46')},
  ivanovo: {title: 'Иваново', zoneId: 'ivanovo', slides: [{...cloth, title: 'Ивановский зал · текстиль и орнамент'}, pigment], sourceRef: concept('47–51')},
  'nizhny-novgorod': {title: 'Нижний Новгород', zoneId: 'nizhny-novgorod', slides: [{...fair, title: 'Нижегородский зал · ярмарка'}, SOURCE_WORKSHOP_CRAFTS[2]], sourceRef: concept('52–57')}
};

// Eleven cloths: one large, legible image per surface with a separate lace layer.
// Repeated panoramas deliberately form one environment; 356-pixel previews are not used.
export const SOURCE_TVER_CLOTHS = [
  {...kalyazin, lace: 0.18},
  {...river, title: 'Кружево памяти · вода', focal: [0.20, 0.48], lace: 0.42},
  {...bellsDay, title: 'Кружево памяти · свет', focal: [0.72, 0.48], lace: 0.52},
  {...river, title: 'Волжские берега', focal: [0.35, 0.48], lace: 0.32},
  {...kalyazin, lace: 0.24},
  {...bellsDusk, title: 'Вечер над Волгой', focal: [0.74, 0.48], lace: 0.48},
  {...river, title: 'Вода и кружево', focal: [0.50, 0.48], lace: 0.56},
  {...bellsDay, title: 'Речной свет', focal: [0.30, 0.48], lace: 0.34},
  {...kalyazin, lace: 0.22},
  {...river, title: 'Волжские берега', focal: [0.70, 0.48], lace: 0.46},
  {...bellsDusk, title: 'Кружево памяти · вечер', focal: [0.70, 0.48], lace: 0.54}
];

// These are exhibition backboards inside original vitrines, not additional LED hardware.
export const SOURCE_VITRINE_CONTENT = [
  {...cloth, title: 'Арочная витрина · Текстильный узор', caption: 'Экспозиционное наполнение для веб-тура.', kind: 'web-exposition', focal: [.48, .52]},
  {...river, title: 'Арочная витрина · Волжские берега', caption: 'Экспозиционное наполнение для веб-тура.', kind: 'web-exposition', focal: [.54, .50]}
];

export const SOURCE_MEDIA = {
  tverVitrines: {title: 'Арочные витрины Твери', slides: SOURCE_VITRINE_CONTENT,
    sourceRef: 'Форма: Group_Vitrina_01 / Group_Vitrina_02 в сборке 1911. Изображения добавлены для веб-тура.'},
  tver: {title: 'Кружево памяти', slides: SOURCE_TVER_CLOTHS, sourceRef: concept('26–30')},
  history: {title: 'История Золотого кольца', slides: history, sourceRef: concept('13–14, 18')},
  map: {
    title: 'Карта путешествия',
    slides: [
      {...vladimir, themeId: 'cities', title: 'Города'},
      {...river, themeId: 'rivers', title: 'Реки'},
      {...river, themeId: 'nature', title: 'Природа', focal: [0.30, 0.50]},
      {...fair, themeId: 'trade', title: 'Торговля'},
      {...cloth, themeId: 'crafts', title: 'Ремёсла'},
      {...suzdal, themeId: 'architecture', title: 'Архитектура'}
    ],
    sourceRef: concept('15–18'),
    presentationNote: 'Тематические изображения для выбора карты; географическую карту представляет исходная 3D-поверхность.'
  },
  scroll: {title: 'Рождение столицы', slides: [vladimir, history[1], suzdal], sourceRef: concept('23–25')},
  well: {title: 'Колодец-калейдоскоп', slides: [kalyazin, SOURCE_WELL_MODES.kashin.slides[0], SOURCE_WELL_MODES.nikitin.slides[0]], sourceRef: concept('28')},
  boats: {title: 'Река времени', slides: [river, bellsDay, fair], sourceRef: concept('33–35')},
  bells: {title: 'Соборный звон', slides: [bellsDay, history[0], bellsDusk], sourceRef: concept('38–40')},
  bobbins: {
    title: 'Оборот',
    slides: [
      {...SOURCE_WORKSHOP_CRAFTS[7], title: 'Скань Красного-на-Волге', caption: 'Филигрань. Иллюстрация ремесла из полученной концепции.'},
      {...fair, title: 'Капитал и торговые пути', caption: 'Художественный образ к теме капитала Чижова.'},
      {...river, title: 'Соль и речной путь', caption: 'Художественный образ к теме соли Нерехты.'}
    ],
    sourceRef: concept('45–46, 50')
  },
  yarn: {title: 'Пряжа', slides: [cloth, pigment, SOURCE_WORKSHOP_CRAFTS[4]], sourceRef: concept('49–51')},
  ornament: {title: 'Орнамент', slides: [cloth, pigment, floral], sourceRef: concept('49–51')},
  finale: {title: 'Путешествие продолжается', slides: [river, vladimir, suzdal, bellsDusk, passport], sourceRef: concept('62–65')},
  workshops: {title: 'Мастерские', slides: SOURCE_WORKSHOP_CRAFTS, sourceRef: concept('58–61')},
  stage: {title: 'Речной причал', slides: [river, fair, bellsDusk], sourceRef: concept('41–42')},
  nizhny: {title: 'Ярмарка', slides: [fair, floral, SOURCE_WORKSHOP_CRAFTS[2]], sourceRef: concept('52–57')},
  prologue: {title: 'Начало путешествия', slides: [passport, history[0], river], sourceRef: concept('7–11')}
};

export const SOURCE_MEDIA_CREDITS_URL = 'assets/source-media/credits.html';
export const SOURCE_MEDIA_CREDITS = [
  {
    id: 'vladimir-dormition', src: vladimir.src, title: 'Владимир. Успенский собор',
    author: 'Alexxx1979', authorUrl: 'https://commons.wikimedia.org/wiki/User:Alexxx1979',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Vladimir._Dormition_Cathedral_P5191019_2800.jpg',
    license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    changes: 'Официальная миниатюра Wikimedia Commons 1920 px. В 3D-туре возможно кадрирование.'
  },
  {
    id: 'suzdal-kremlin', src: suzdal.src, title: 'Суздальский кремль',
    author: 'Dmitry Makeev (Knopik-som)', authorUrl: 'https://commons.wikimedia.org/wiki/User:Knopik-som',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Suzdal_Kremlin.jpg',
    license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    changes: 'Официальная миниатюра Wikimedia Commons 1920 px. В 3D-туре возможно кадрирование.'
  },
  {
    id: 'kalyazin-bell-tower', src: kalyazin.src, title: 'Калязин. Колокольня Никольского собора',
    author: 'Александр Байдуков', authorUrl: 'https://commons.wikimedia.org/wiki/User:Александр_Байдуков',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Kalyazin,_in_the_flood_zone._Bell_tower_of_St._Nicholas_Cathedral.jpg',
    license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    changes: 'Официальная миниатюра Wikimedia Commons 1920 px. В 3D-туре возможно кадрирование.'
  }
];


export const SOURCE_GLASS_STEPS = [
  {id: 'blow', title: 'Выдувание формы', src: art('glass-process/1.webp'), caption: 'Иллюстрация стекольного процесса.'},
  {id: 'blank', title: 'Гладкая заготовка', src: art('glass-process/2.webp'), caption: 'Иллюстрация стекольного процесса.'},
  {id: 'cut', title: 'Нанесение огранки', src: art('glass-process/3.webp'), caption: 'Иллюстрация стекольного процесса.'},
  {id: 'complete', title: 'Готовое изделие', src: art('glass-process/4.webp'), caption: 'Иллюстрация стекольного процесса.'}
];
