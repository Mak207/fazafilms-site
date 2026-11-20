(function () {
  "use strict";

  const items = [
    { zone: "transport", title: "Семейство ракет-носителей «Ангара»", text: "Модель ракеты-носителя, элементы конструкции, макеты ступеней и стартового комплекса." },
    { zone: "transport", title: "Новые двухэтажные вагоны", text: "Фрагмент или макет вагона, интерьерный модуль, элементы купе и вагонного оборудования." },
    { zone: "transport", title: "Автомобили семейства «Аурус»", text: "Автомобиль или масштабная модель, элементы салона и шасси." },
    { zone: "transport", title: "Новые локомотивы", text: "Макет или фрагмент локомотива, кабина машиниста, элементы тягового оборудования." },
    { zone: "transport", title: "Судно на подводных крыльях", text: "Макет судна, модель подводных крыльев и интерактивная схема движения." },
    { zone: "transport", title: "Речной теплоход «Мустай Карим»", text: "Макет судна, элементы интерьера, маршрут и технические характеристики." },
    { zone: "transport", title: "Корабли ледового класса", text: "Модели судов, фрагменты корпуса и элементы навигационного оборудования." },
    { zone: "transport", title: "Атомные ледоколы", text: "Крупноформатный макет ледокола, модель реакторного отсека и элементы надстройки." },
    { zone: "transport", title: "Самолёт МС-21 или Суперджет", text: "Фрагмент фюзеляжа, крыло или макет самолёта, элементы композитной конструкции." },
    { zone: "transport", title: "Вертолёты и региональные воздушные суда", text: "Модели и фрагменты российской авиационной техники." },
    { zone: "transport", title: "Скоростные поезда", text: "Макет поезда, элементы интерьера, схема маршрута и скоростной инфраструктуры." },
    { zone: "transport", title: "Городской электротранспорт", text: "Модели электробусов, трамваев и элементов зарядной инфраструктуры." },
    { zone: "transport", title: "Беспилотные транспортные средства", text: "Макеты беспилотных автомобилей, дронов-доставщиков и систем управления." },
    { zone: "transport", title: "Космическая транспортная техника", text: "Модели космических аппаратов, ракет и элементов космодромной инфраструктуры." },

    { zone: "construction", title: "Программа газификации", text: "Интерактивная карта газификации регионов, элементы газопровода, модели оборудования и счётчиков." },
    { zone: "construction", title: "Крупные спортивные стадионы", text: "Макеты стадионов, элементы конструкций, фотопанели и материалы о строительстве." },
    { zone: "construction", title: "Аэропорты", text: "Макеты терминалов, элементы навигационной инфраструктуры и модели воздушных судов." },
    { zone: "construction", title: "Мосты", text: "Масштабные макеты, фрагменты пролётных конструкций и интерактивные модели инженерных решений." },
    { zone: "construction", title: "Автомобильные дороги", text: "Фрагмент дорожного полотна, элементы разметки и модели дорожной техники." },
    { zone: "construction", title: "Скоростные железнодорожные магистрали", text: "Макет участка пути, элементы контактной сети и модель подвижного состава." },
    { zone: "construction", title: "Морские порты", text: "Макет портового терминала, контейнер и элементы кранового оборудования." },
    { zone: "construction", title: "Космодромы", text: "Макет стартового комплекса, элементы стартовой инфраструктуры и модели ракет-носителей." },
    { zone: "construction", title: "Новые больницы и медицинские центры", text: "Макеты зданий, элементы медицинских модулей и интерактивные схемы инфраструктуры." },
    { zone: "construction", title: "Школы и образовательные учреждения", text: "Макеты школьных комплексов и элементы современных учебных пространств." },
    { zone: "construction", title: "Технокластеры и научно-производственные комплексы", text: "Макеты кампусов, элементы лабораторной и производственной инфраструктуры." },
    { zone: "construction", title: "Новые города и микрорайоны", text: "Архитектурные макеты жилых районов, элементы благоустройства и городской среды." },
    { zone: "construction", title: "Социальные объекты", text: "Модели детских садов, культурных центров, спортивных сооружений и общественных пространств." },
    { zone: "construction", title: "Инженерная инфраструктура", text: "Элементы сетей водоснабжения, теплоснабжения, электроснабжения и связи." },

    { zone: "technology", title: "Атомный реактор и проект «Прорыв»", text: "Модель реакторной установки, элементы топливного цикла и схема замкнутого ядерного топливного цикла." },
    { zone: "technology", title: "Роботизация промышленности", text: "Промышленные роботы, манипуляторы и элементы автоматизированных производственных линий." },
    { zone: "technology", title: "Спутниковая группировка ГЛОНАСС", text: "Модели спутников, карта орбитальной группировки, приёмники и элементы навигационных систем." },
    { zone: "technology", title: "Портал «Госуслуги»", text: "Интерактивный терминал, демонстрация цифровых сервисов и элементы пользовательского интерфейса." },
    { zone: "technology", title: "Беспилотный комбайн", text: "Макет или фрагмент сельскохозяйственной техники и элементы систем автономного управления." },
    { zone: "technology", title: "Беспилотники «Гектор»", text: "Модели летательных аппаратов, элементы систем управления и полезной нагрузки." },
    { zone: "technology", title: "Роботы-доставщики", text: "Действующий макет или образец робота, элементы навигации и зарядной станции." },
    { zone: "technology", title: "Цифровой рубль", text: "Интерактивная демонстрация платёжных сценариев и элементы цифровой финансовой инфраструктуры." },
    { zone: "technology", title: "Искусственный интеллект", text: "Демонстрации распознавания образов, обработки данных и принятия решений." },
    { zone: "technology", title: "Суперкомпьютеры и центры обработки данных", text: "Элементы серверного оборудования и визуализация вычислительных мощностей." },
    { zone: "technology", title: "Квантовые технологии", text: "Модели квантовых компьютеров и элементы криптографических систем." },
    { zone: "technology", title: "Биотехнологии и медицина", text: "Модели медицинских изделий, элементы генных и клеточных технологий, диагностическое оборудование." },
    { zone: "technology", title: "Новые материалы", text: "Образцы композитов, сплавов, керамики и функциональных материалов." },
    { zone: "technology", title: "Космические технологии", text: "Модели спутников, элементы дистанционного зондирования Земли и образцы космической связи." }
  ];

  const catalog = window.EXHIBIT_CATALOG || [];
  const zoneOffsets = { transport: 0, construction: 0, technology: 0 };
  items.forEach(function (item) {
    const meta = catalog.find(function (entry) { return entry.zone === item.zone && entry.index === zoneOffsets[item.zone]; });
    zoneOffsets[item.zone] += 1;
    if (meta) Object.assign(item, meta);
  });

  window.EXHIBITION_ITEMS = items;

  const zoneLabels = {
    transport: "Транспорт",
    construction: "Строительство",
    technology: "Технологии"
  };

  const zoneColors = {
    transport: "#89a8ff",
    construction: "#b7df78",
    technology: "#52d5d7"
  };

  const grid = document.getElementById("exhibitGrid");
  const search = document.getElementById("search");
  const resultCount = document.getElementById("resultCount");
  const emptyState = document.getElementById("emptyState");
  const filters = Array.from(document.querySelectorAll(".filter"));
  let activeZone = "all";

  function escapeHTML(value) {
    return value.replace(/[&<>\"]/g, function (symbol) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[symbol];
    });
  }

  grid.innerHTML = items.map(function (item, index) {
    return '<article class="exhibit-card" data-zone="' + item.zone + '" style="--zone:' + zoneColors[item.zone] + '">' +
      '<div class="exhibit-top"><span>' + zoneLabels[item.zone] + '</span><span class="exhibit-number">' + String(index + 1).padStart(2, "0") + '</span></div>' +
      '<h3>' + escapeHTML(item.title) + '</h3><p>' + escapeHTML(item.text) + '</p>' +
      (item.reference ? '<a class="source-link" href="' + item.reference + '" target="_blank" rel="noopener noreferrer">Официальный визуальный референс</a>' : '') + '</article>';
  }).join("");

  const physicalRegister = document.getElementById("physicalRegister");
  if (physicalRegister) {
    const nicheCards = items.map(function (item) {
      return '<article style="--zone:' + zoneColors[item.zone] + '"><span>' + zoneLabels[item.zone] + '</span>' +
        '<strong>' + escapeHTML(item.objectTitle || item.title) + '</strong><small>' + escapeHTML(item.size || "Габарит уточняется") + '</small>' +
        (item.reference ? '<a href="' + item.reference + '" target="_blank" rel="noopener noreferrer">Реальный вид</a>' : '') + '</article>';
    });
    const centerCards = (window.CENTER_PROPOSAL || []).map(function (item) {
      return '<article class="is-center" style="--zone:#ff8a45"><span>Центр · медиаобъект</span><strong>' + escapeHTML(item.objectTitle) + '</strong><small>' + escapeHTML(item.size) + '</small><a href="' + item.reference + '" target="_blank" rel="noopener noreferrer">Референс формы</a></article>';
    });
    physicalRegister.innerHTML = nicheCards.concat(centerCards).join("");
  }

  const scenarioGrid = document.getElementById("scenarioGrid");
  const scenarios = window.EXHIBIT_SCENARIOS || {};
  if (scenarioGrid) {
    scenarioGrid.innerHTML = Object.keys(scenarios).map(function (zone) {
      const scenario = scenarios[zone];
      return '<article style="--zone:' + zoneColors[zone] + '"><div class="scenario-head"><span>' + zoneLabels[zone] + '</span><strong>' + scenario.runtime + '</strong></div>' +
        '<h3>' + escapeHTML(scenario.title) + '</h3><ol>' + scenario.beats.map(function (beat) {
          return '<li class="' + beat[1].toLowerCase() + '"><time>' + beat[0] + '</time><span>' + escapeHTML(beat[2]) + '</span></li>';
        }).join("") + '</ol></article>';
    }).join("");
  }

  const metricsGrid = document.getElementById("metricsGrid");
  const metricGroups = window.EXHIBIT_METRICS || {};
  if (metricsGrid) {
    metricsGrid.innerHTML = Object.keys(metricGroups).map(function (zone) {
      const group = metricGroups[zone];
      return '<article class="metrics-group" style="--zone:' + zoneColors[zone] + '">' +
        '<div class="metrics-group-head"><span>' + escapeHTML(group.title) + '</span><small>' + escapeHTML(group.subtitle) + '</small></div>' +
        '<div class="metrics-group-list">' + group.metrics.map(function (metric) {
          return '<a class="metric-card" href="' + metric.source + '" target="_blank" rel="noopener noreferrer">' +
            '<strong>' + escapeHTML(metric.value) + '</strong><span>' + escapeHTML(metric.label) + '</span><small>' + escapeHTML(metric.detail) + '</small>' +
          '</a>';
        }).join("") + '</div><p>' + escapeHTML(group.sourceLabel) + '</p></article>';
    }).join("");
  }

  const cards = Array.from(grid.querySelectorAll(".exhibit-card"));

  function applyFilter() {
    const query = search.value.trim().toLocaleLowerCase("ru");
    let visible = 0;

    cards.forEach(function (card, index) {
      const item = items[index];
      const zoneMatch = activeZone === "all" || item.zone === activeZone;
      const textMatch = !query || (item.title + " " + item.text).toLocaleLowerCase("ru").includes(query);
      const show = zoneMatch && textMatch;
      card.hidden = !show;
      if (show) visible += 1;
    });

    resultCount.textContent = "Показано " + visible + " " + positionWord(visible);
    emptyState.hidden = visible !== 0;
  }

  function positionWord(number) {
    const lastTwo = number % 100;
    const last = number % 10;
    if (lastTwo >= 11 && lastTwo <= 14) return "позиций";
    if (last === 1) return "позиция";
    if (last >= 2 && last <= 4) return "позиции";
    return "позиций";
  }

  filters.forEach(function (button) {
    button.addEventListener("click", function () {
      activeZone = button.dataset.zone;
      filters.forEach(function (item) {
        const active = item === button;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      applyFilter();
    });
  });

  search.addEventListener("input", applyFilter);
})();
