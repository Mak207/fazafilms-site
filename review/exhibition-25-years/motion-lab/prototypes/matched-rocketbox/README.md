# Matched Rocketbox: отдельный проверяемый reference

**Статус: готовые авторские Idle / Start / базовый Walk / Stop преобразованы одним экземпляром UPF на общий reference текущих 80-костных моделей. В выставочную сцену и runtime v44 этот набор не подключён.**

Это bone-only GLB: геометрия, материалы, skin weights и inverse bind matrices остаются в существующих walking-woman.glb / walking-man.glb. Два GLB в outputs содержат только анимации и исходную иерархию костей для их привязки.

## Что подтверждено

- Все 80 имён, родителей и rest TRS в выходном GLB совпадают с текущим целевым скелетом; rest component delta = 0.
- В каждом наборе четыре клипа по 55 каналов: 54 rotation tracks + Hips translation. Значения конечны, ключи строго упорядочены.
- Авторское движение Hips сохранено. Одна общая пропорция UPF применяется ко всем четырём действиям: Emma 1.0061991773815377, Ethan 1.0241087970998775.
- Ни новый суставной solver, ни ручные изменения коленей, ни покадровая коррекция стоп не добавлены.
- Исходный код UPF, функция существующей semantic calibration, mapping и формулы экспорта не изменены. Исправлено применение готового API: CURRENT references фиксируются на Idle один раз; тот же AnimationRetargeting.retargetAnimation вызывается для всех действий.

| Персонаж / клип | Длительность, с | Горизонтальное перемещение Hips в целевой модели, м |
|---|---:|---:|
| Emma Idle | 15.533333 | ~0 |
| Emma Start | 0.933333 | 0.773016 |
| Emma Walk | 1.233333 | 1.606523 |
| Emma Stop | 1.766667 | 0.677761 |
| Ethan Idle | 11.666667 | ~0 |
| Ethan Start | 0.966667 | 0.621656 |
| Ethan Walk | 1.066667 | 1.531928 |
| Ethan Stop | 2.000000 | 1.424844 |

Таблица содержит длину результирующего вектора XZ между первым и последним ключом, а не гарантированную тормозную дистанцию вдоль произвольного маршрута. Полные XYZ, входные и выходные source hashes находятся в manifest и checks/common-reference-audit.json.

## Две разные причины прежнего несовпадения

1. **Калибровка отдельно для каждого клипа.** Статический импорт animation-only FBX задаёт разную reference pose для Idle, Walk и Stop. Прежний callsite создавал новый CURRENT solver внутри цикла. В исходнике StopEnd и IdleStart совпадают почти точно, но разные reference превращали этот стык в 13.53° (Emma) / 12.87° (Ethan) и скачок Hips Y примерно 6 мм. Один общий экземпляр штатного UPF устраняет добавленный разрыв: осталось 0.02294° / 0.01699°, как в исходных данных; скачок Y 0 / 0.00000006 м.
2. **Выбран другой авторский цикл.** walk_neutral_01 из прежней сборки не являлся точным продолжением walk_start / walk_stop. Найденный у того же автора базовый walk_neutral без номера имеет нужную границу цикла. У Ethan StartEnd → WalkEnd → StopStart различается не более 0.000425° и менее 0.6 мкм по позициям костей стоп; Walk phase 0 также отличается лишь примерно на 0.019° и 3 мкм.

**Ограничение Emma сохранено:** в самом авторском базовом cycle правая нога на границе Start/Walk и Walk/Stop расходится примерно на 1.303°. На целевой модели это 13.835 мм между положениями костей правой стопы/носка; это не измерение материальной точки подошвы. Этот исходный шов не сглажен и не исправлен. Файл не следует объявлять бесшовным.

Измерены C0 позы на границах, а не равенство скоростей/ускорений. Дополнительная диагностика Hips в checks/root-boundary-kinematics.json показывает разность первой/последней XZ скорости за 1/60 с на Walk loop: Emma ≈0.456 м/с, Ethan ≈0.0415 м/с. Это root-only finite difference; он не измеряет опору подошвы и не устанавливает визуальную причину. Совпадение поз не доказывает отсутствие скольжения, пересечений skin или естественный вид движения. Отдельный source-only ролик записан в обычном темпе (28.6667 с, четыре сочетания персонажа/ракурса). Это reference для просмотра, а не полная визуальная или контактная приёмка. По сообщению агента записи грубого коленного излома на просмотренных границах не видно; измеренного contact PASS нет. Историческая первая попытка не скопирована в assets: её цифры и точный SHA сохранены в checks/reference-ab.json. Сравнение Stop/Idle изолирует только переиспользование reference; сравнение Start/Walk дополнительно меняет авторский цикл.

## Готовый API, который используется

UPF constructor клонирует srcBindPose и trgBindPose и вычисляет precomputedQuats. retargetAnimation использует эти фиксированные данные повторно. Принцип применения:

~~~js
// sourceReference и targetReference откалиброваны один раз существующей функцией.
const solver = new AnimationRetargeting(sourceReference.skeleton, targetReference.skeleton, {
  srcPoseMode: AnimationRetargeting.BindPoseModes.CURRENT,
  trgPoseMode: AnimationRetargeting.BindPoseModes.CURRENT,
  srcEmbedWorldTransforms: false,
  trgEmbedWorldTransforms: false,
  boneNameMap
});
const results = clips.map(clip => solver.retargetAnimation(clip));
~~~

Переключение на DEFAULT само по себе не решает ошибку, если synthetic Skeleton был создан из разных первых поз animation-only файлов. Здесь важно один раз зафиксировать **общую** reference pose. Исходные FBX содержат 121 костей; используемая карта включает 54 семантические кости. Число 121 относится к реально импортированным анимационным FBX, а не к непроверенным файлам аватаров.

## Просмотр без выставочной сцены

Откройте replay.html через HTTP из корня репозитория. Воспроизводится:
последняя секунда Idle → Start → два полных Walk → Stop → первая секунда Idle.

В каждый момент активен один авторский клип с весом 1. Изменяются только XZ смещения внешнего контейнера для непрерывного продвижения между клипами. Y источника сохранён; плоскость пола фиксируется один раз по IdleEnd и не следует за стопами. Смешивание, Crowd, ручные углы, повороты контейнера и IK отсутствуют. Камера следует XZ таза, сетка пола остаётся неподвижной. Это сохраняет видимым исходный женский шов.

Для автоматической записи:
~~~js
await window.__MATCHED_REPLAY.ready;
await window.__MATCHED_REPLAY.setPerson('ethan'); // or 'emma'
window.__MATCHED_REPLAY.setView('side');          // or 'front'
window.__MATCHED_REPLAY.seekTime(seconds);
const canvas = window.__MATCHED_REPLAY.canvas;
~~~

## Воспроизведение конвертации

Нужны Python 3 (стандартная библиотека для загрузки/проверки), Blender **4.5**, Node **>=20.6**, текущие target GLB и уже сохранённые vendor/three r169 и vendor/upf из этого репозитория. Исходные FBX и большие world-samples в Git не включены. Все восемь pinned FBX можно получить из официального репозитория с проверкой размера, Git blob SHA-1 и SHA-256.

В PowerShell перейдите в этот каталог. motionWork — новый внешний каталог результатов; не используйте outputs этого reference как место повторной сборки.

~~~powershell
$motionWork = "C:/temp/matched-rocketbox-rebuild"
py -3 tools/fetch_sources.py --out-dir "$motionWork/fbx"
py -3 tools/export_matched_world_samples.py --input-dir "$motionWork/fbx" --verify-only
& "C:/Program Files/Blender Foundation/Blender 4.5/blender.exe" --background --factory-startup --disable-autoexec --python-exit-code 1 --threads 2 --python tools/export_matched_world_samples.py -- --input-dir "$motionWork/fbx" --output-dir "$motionWork/world-samples"
node tools/retarget_rocketbox_shared_reference.mjs --actor emma --world-samples "$motionWork/world-samples" --target "../../../assets/models/visitors/walking-woman.glb" --out "$motionWork/emma-matched-locomotion.glb" --report "$motionWork/emma-report.json" --three "../../vendor/three/build/three.module.js" --upf "../../vendor/upf/retargeting.js"
node tools/retarget_rocketbox_shared_reference.mjs --actor ethan --world-samples "$motionWork/world-samples" --target "../../../assets/models/visitors/walking-man.glb" --out "$motionWork/ethan-matched-locomotion.glb" --report "$motionWork/ethan-report.json" --three "../../vendor/three/build/three.module.js" --upf "../../vendor/upf/retargeting.js"
~~~

На другой ОС используйте python3 вместо py -3 и свой путь blender; CLI и исходные данные те же. Экспорт world-samples откажется перезаписывать имеющиеся результаты. Converter не должен получать model path в качестве out/report. Для повторного запуска выбирайте новый output path.

Точные локальные исходные пути и SHA сохранены в manifest.json.externalInputs: существующая сборка находится в avatar-ready-locomotion-data-20261122/matched-rocketbox/common-reference. При переносе используйте pinned source-manifest.json и команды выше. Исторические численные audits также указывают исходный NumPy/SciPy helper и его SHA; этот внешний helper не требуется для Blender→UPF пересборки, но без него и сохранённых samples полный исторический audit не является автономным.

## Источники и лицензии

- Microsoft-Rocketbox, pin 0943055db6ec570bcef9f2c8b41c9e5467c808f9, MIT. Восемь точных paths/URLs/хешей в source-manifest.json.
- UPF GTI retargeting-threejs, pin 82f1b8218813547224dd96df1638c950d241824d, Apache-2.0. Использован существующий vendor/upf/retargeting.js, SHA 4fca7f6deab1a912b659b30998595e248d88b1d46d6cca414287139af02506c6.
- Three.js r169, MIT; существующий vendor/three, без обновления зависимости.
- Карта Biped/Mixamo из Avatar Studio rb_build.py, pin 2fd9ec82fbe1613d40ae38aadcca3f410725f740, MIT. Прямая bake_native здесь не вызвана: её предположения о native Biped axes и дополнительной коррекции Spine не подходят для прямой перезаписи текущих GLB.
- Полные notices в licenses/. Происхождение текущих моделей описано в ../../ASSET-SOURCES.md.

## Граница следующей интеграции

Этот пакет не заменяет runtime. Для отдельной новой версии понадобятся: планирование авторской Start и Stop траектории до прибытия; один владелец world/root; стыковка именно на границе базового Walk; учёт ненулевой скорости конца Start и начала Stop; проверка поддержки стоп и envelope всего перехода. Простой запуск Stop после прибытия или переключение с root-driven Start на Crowd, обнуляющий скорость, заново создаст рывок. Существующая геометрическая и root acceptance выставочной версии не переносится автоматически на новый набор.

## Дополнительные сохранённые proofs

- [Source-reference video proof](../../checks/matched-rocketbox-source-reference-video.json): обычный темп, оба персонажа и два ракурса; контакт не принят.
- [Crowd handoff API feasibility](checks/crowd-handoff-feasibility.json): проверена возможность передачи скорости через существующий API; динамический handoff не реализован и не проверен.
- [Stop lead static feasibility](checks/stop-lead-navmesh-feasibility.json): статическое размещение траектории торможения; не доказательство поведения двух посетителей в движении.
- [Capture script](../../tools/capture_matched_rocketbox_reference.py): отдельный инструмент записи source-reference, сохранён агентом визуальной проверки.
