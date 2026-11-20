(function () {
  "use strict";

  const refs = {
    roscosmos: "https://www.roscosmos.ru/",
    tmh: "https://tmholding.ru/products/",
    aurus: "https://aurusmotors.com/aurus_senat",
    hydrofoil: "https://ckbspk.ru/",
    mustai: "https://vodohod.com/ships/mustai-karim/",
    usc: "https://aoosk.ru/",
    icebreaker: "https://www.rosatomflot.ru/flot/atomnye-ledokoly/deystvuyushie/",
    ms21: "https://uacrussia.ru/ru/aircraft/lineup/civil/ms-21/",
    helicopters: "https://www.rhc.aero/",
    ivolga: "https://tmholding.ru/media/events/34263.html",
    electrobus: "https://transport.mos.ru/transport/elektrobus",
    autonomy: "https://autonomy.yandex.ru/media",
    gas: "https://www.gazprom.ru/about/production/gasification/",
    luzhniki: "https://walking.sport.mos.ru/luzhniki/luzhniki_m1_09/",
    airport: "https://www.svo.aero/",
    road: "https://history.rosavtodor.gov.ru/",
    hsr: "https://ar2021.rzd.ru/ru/performance-overview/investment-activities/infrastructure-development-projects",
    port: "https://www.rosmorport.ru/filials/spb_seaports/",
    vostochniy: "https://www.roscosmos.ru/tag/vostochnihy/",
    stroi: "https://stroi.mos.ru/",
    skolkovo: "https://tp.sk.ru/",
    domrf: "https://дом.рф/",
    proryv: "https://proryv2020.ru/",
    rosatom: "https://report.rosatom.ru/go/rosatom/go_rosatom_2024/rosatom_2024_ru.pdf",
    glonass: "https://www.iss-reshetnev.ru/",
    gosuslugi: "https://www.gosuslugi.ru/",
    combine: "https://rostselmash.com/",
    geoscan: "https://www.geoscan.ru/ru/products",
    rover: "https://autonomy.yandex.ru/",
    ruble: "https://www.cbr.ru/PSystem/dr/brandbook/",
    ai: "https://developers.sber.ru/help/business-development/3d-design-ai",
    supercomputer: "https://parallel.ru/cluster/superinfo",
    quantum: "https://report.rosatom.ru/go/rosatom/go_rosatom_2024/rosatom_2024_ru.pdf",
    biotech: "https://fmba.gov.ru/press-tsentr/novosti/detail/?ELEMENT_ID=84424",
    materials: "https://umatex.com/"
  };

  const byZone = {
    transport: [
      ["rocket", "Ракета «Ангара-А5»", refs.roscosmos],
      ["doubleTrain", "Двухэтажный пассажирский вагон", refs.tmh],
      ["car", "AURUS Senat", refs.aurus],
      ["locomotive", "Электровоз ЭП2К", "https://tmholding.ru/products/passazhirskie/elektrovozy-postoyannogo-toka-ep2k/"],
      ["hydrofoil", "Судно на подводных крыльях", refs.hydrofoil],
      ["ship", "Теплоход «Мустай Карим»", refs.mustai],
      ["iceShip", "Судно ледового класса", refs.usc],
      ["icebreaker", "Атомный ледокол проекта 22220", "https://rosatomflot.ru/flot/universalnyy-atomnyy-ledokol-proekta-22220/"],
      ["airliner", "МС-21-310", refs.ms21],
      ["helicopter", "Вертолёт и региональный самолёт", refs.helicopters],
      ["fastTrain", "Скоростной электропоезд", refs.ivolga],
      ["bus", "Московский электробус", refs.electrobus],
      ["autocar", "Беспилотный автомобиль", refs.autonomy],
      ["spacecraft", "Космический корабль и разгонный блок", refs.roscosmos]
    ],
    construction: [
      ["pipeline", "Газораспределительная станция", refs.gas],
      ["stadium", "Большая спортивная арена", refs.luzhniki],
      ["airport", "Пассажирский терминал", refs.airport],
      ["bridge", "Вантовый мост", refs.road],
      ["highway", "Автомагистраль с развязкой", refs.road],
      ["railway", "Высокоскоростная магистраль", refs.hsr],
      ["port", "Контейнерный порт", refs.port],
      ["cosmodrome", "Стартовый комплекс Восточного", refs.vostochniy],
      ["hospital", "Современный медицинский центр", refs.stroi],
      ["school", "Школьный кампус", refs.stroi],
      ["technopark", "Технопарк «Сколково»", refs.skolkovo],
      ["district", "Новый жилой микрорайон", refs.domrf],
      ["social", "Культурно-спортивный центр", refs.stroi],
      ["utilities", "Инженерный коллектор", refs.stroi]
    ],
    technology: [
      ["reactor", "Реактор БРЕСТ-ОД-300", refs.proryv],
      ["robot", "Промышленный робот-манипулятор", refs.rosatom],
      ["satellite", "Спутник ГЛОНАСС-К", refs.glonass],
      ["terminal", "Терминал «Госуслуги»", refs.gosuslugi],
      ["combine", "Беспилотный комбайн", refs.combine],
      ["drone", "Профессиональный БПЛА", refs.geoscan],
      ["rover", "Робот-доставщик", refs.rover],
      ["coin", "Знак цифрового рубля", refs.ruble],
      ["aiCore", "Вычислительное ядро ИИ", refs.ai],
      ["server", "Стойка суперкомпьютера", refs.supercomputer],
      ["quantum", "Криостат квантового компьютера", refs.quantum],
      ["biotech", "Биореактор и клеточная модель", refs.biotech],
      ["materials", "Композитная панель и углеволокно", refs.materials],
      ["earthSatellite", "Спутник дистанционного зондирования", refs.roscosmos]
    ]
  };

  const dimensions = {
    transport: [1.08, 0.54, 0.88],
    construction: [0.64, 0.54, 0.88],
    technology: [1.08, 0.54, 0.88]
  };

  const catalog = [];
  Object.entries(byZone).forEach(([zone, entries]) => {
    entries.forEach((entry, index) => {
      const d = dimensions[zone];
      catalog.push({
        id: `${zone}-${String(index + 1).padStart(2, "0")}`,
        zone,
        index,
        kind: entry[0],
        objectTitle: entry[1],
        reference: entry[2],
        dims: d.slice(),
        size: `${d[0].toFixed(2).replace(".", ",")} × ${d[1].toFixed(2).replace(".", ",")} × ${d[2].toFixed(2).replace(".", ",")} м`,
        status: "Hi3D · модель из референсной фотографии"
      });
    });
  });

  window.EXHIBIT_CATALOG = catalog;
  window.CENTER_PROPOSAL = [
    { objectTitle: "Макет делового центра «Москва-Сити»", size: "1,90 × 1,35 × 1,65 м", reference: "https://stroi.mos.ru/moskva-siti" },
    { objectTitle: "Парящий мост парка «Зарядье»", size: "3,20 × 0,55 × 0,75 м", reference: "https://www.zaryadyepark.ru/" },
    { objectTitle: "Городской поезд «Москва-2024»", size: "2,80 × 0,52 × 0,60 м", reference: "https://transport.mos.ru/metro" }
  ];
  window.EXHIBIT_SCENARIOS = {
    technology: {
      title: "Технологии · от ядра к орбите",
      runtime: "0:05",
      beats: [
        ["0:00–0:02", "VISUAL", "Промышленный робот точно обрабатывает металлическое кольцо"],
        ["0:02–0:04", "VISUAL", "Тёплый импульс проходит через материал к молекулярной структуре"],
        ["0:04–0:05", "REST", "Спутник удерживается в орбитальном поле; движение мягко замирает"]
      ]
    },
    construction: {
      title: "Строительство · каркас жизни",
      runtime: "0:05",
      beats: [
        ["0:00–0:02", "VISUAL", "Сумеречный свет раскрывает мост, стадион и аэропорт"],
        ["0:02–0:04", "VISUAL", "Движение машин и свет в зданиях оживляют инфраструктуру"],
        ["0:04–0:05", "REST", "Отражения на воде и архитектурная подсветка собирают общий план"]
      ]
    },
    transport: {
      title: "Транспорт · одна траектория",
      runtime: "0:05",
      beats: [
        ["0:00–0:02", "VISUAL", "Ледокол раскрывает путь через тяжёлый арктический лёд"],
        ["0:02–0:04", "VISUAL", "Поезд и самолёт продолжают движение в едином панорамном пространстве"],
        ["0:04–0:05", "REST", "Ракета и транспортные огни фиксируют масштаб общей системы"]
      ]
    }
  };
})();
