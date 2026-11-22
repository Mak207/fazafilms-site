# Лаборатория движения Emma / Ethan

**Кандидат v43 интегрирован в рабочую ветку реальной выставки** через `../visitors-v43.js` и `../visitor-motion-v43.js`. Публичная выставка на fazafilms.ru на момент этой записи остаётся на v42; публикация v43 ожидает просмотра владельцем. Завершён 45-секундный прогон на desktop и 390 px. [Итог интеграции и границы приёмки](INTEGRATION-V43.md) сохраняет строгий FAIL по четырём превышениям cap у Emma: остаточное погружение не более 1,5786 мм при принятом допуске 2 мм. Проверка геометрии отделена от визуального просмотра непрерывного движения.

Стенд на Three.js **0.169.0** загружает прежние выставочные меши и отдельные библиотеки из 13 движений, пересобранные с общей анатомической опорной позой. По умолчанию показан `Native · Wave` на паузе. Масштаб и внешность выставочных GLB сохранены. Сам просмотрщик не запускает production-контроллер: здесь сравниваются клипы и исходные персонажи, а замороженный v42 открывается на `baseline-v42.html`. Внешнее разнесение моделей хранится в `holder`, записывается в JSON и вычитается в `actorWorld`.

## Текущий кандидат · 22.11.2026

У исходного и выставочного скелетов различаются анатомические положения рук в bind-позе. Прежний перенос относительно этих разных поз сохранял систематическую ошибку направлений рук. Текущие 13-клиповые библиотеки используют общую T-позу временных скелетов перед UPF CURRENT; исходные меши, skin, inverse bind matrices и локальные смещения костей выставочных моделей сохранены. Файлы стенда `assets/{emma,ethan}-native-motions.glb` соответствуют библиотекам в [каталоге реальной выставки](../assets/models/visitors/motions/README.md).

В v43 работают один AnimationMixer и отдельный владелец перемещения по маршруту. Фаза Walk зависит от фактически пройденного расстояния. Старые `plantFoot` / `transitionFoot` не применяются к новой позе. Дополнительно подключены **восемь записанных поворотов** из Microsoft Rocketbox: Left/Right 90°/180° для каждого персонажа, по четыре клипа в `../assets/models/visitors/motions/{emma,ethan}-native-turns.glb`.

Поворот переносит исходные yaw и XZ в holder один раз, без изменения авторского угла. Проверяется вся траектория относительно расширенных препятствий. Следующий путь начинается из фактического конца поворота, с прямым выходом по текущему направлению; подход к станции уже направлен к экспонату. Для ровного пола отдельная группа целого персонажа может смещаться на −30…+35 мм по полному набору weighted вершин Foot/Toe. Отрицательная поправка ослабляется при жестах. Это выравнивание по полу, а не foot locking или IK суставов.

Численные проверки исходных движений, переноса и упаковки приведены в [ASSET-SOURCES.md](ASSET-SOURCES.md). Они отделены от приёмки движения в реальной сцене, включая контакт, скольжение и переходы. Предварительный real-scene smoke не заменяет финальный непрерывный прогон.

## Исторические опыты до пересборки canonical-позы

Следующие результаты относятся к **прежним библиотекам до исправления анатомической опорной позы** и сохранены как история исследования:

- [273 позы на персонажа](checks/motion-bundle-validation.json): прежняя точность экспорта 0,1194 / 0,1424 мм подтверждала верность упаковки старого UPF-результата. Она не выявила ошибку исходной калибровки рук и не служит проверкой текущих файлов.
- [73 UI-проверки](checks/ui-validation.json), включая 1440, 390 и 414 px, выполнены на прежней сборке стенда.
- [A/B/C-опыт](CONTACT-RESULTS.md) и [сохранённые измерения](checks/contact-comparison.json): A — исходная походка, B — hh-hang FootIK, C — только подъём всего персонажа с пределом 20 мм. В 480 шагах требовалось 11,2197 / 18,4100 мм. Это исторический опыт, а не текущий v43 с новой canonical-библиотекой, записанными поворотами и signed-коррекцией высоты.
- Прежний шов Walk 6,474 / 10,263 мм по всему скелету и около 0,1 мм на Foot/Toe также относится к старому набору. Эти числа нельзя автоматически переносить на пересобранные клипы.

`contact-bench.html` остаётся изолированным инструментом для повторяемых опытов. При запуске с заменёнными assets он вычисляет новые значения; старые JSON не переименованы в результаты нового кандидата. [Измеренные дефекты v42](checks/v42-known-defects.json) относятся к сохранённому baseline.

## Запуск

Из корня репозитория:

```console
python -m http.server 8766 --bind 127.0.0.1
```

Открыть `http://127.0.0.1:8766/review/exhibition-25-years/motion-lab/`. На Windows также можно запустить `start-lab.cmd` из этого каталога. Зависимости Three, UPF и FootIK закреплены в `vendor`; необходимые GLB находятся в `assets` и в прежнем каталоге посетителей. Рабочий `manifest.json` уже включён. Параметр `?manifest=...` выбирает другой manifest; относительные URL разрешаются относительно него.

Схема manifest для дополнительных моделей:

```json
{
  "models": [
    { "id": "emma-source", "label": "Emma", "url": "./models/emma-source.glb", "kind": "source", "actor": "Emma" },
    { "id": "ethan-source", "label": "Ethan", "url": "./models/ethan-source.glb", "kind": "source", "actor": "Ethan" },
    { "id": "emma-current", "label": "Emma", "url": "./models/emma-current.glb", "kind": "current", "actor": "Emma" },
    { "id": "ethan-current", "label": "Ethan", "url": "./models/ethan-current.glb", "kind": "current", "actor": "Ethan" }
  ],
  "defaultIds": ["emma-source", "ethan-source"]
}
```

Имена файлов в примере иллюстрируют схему; manifest должен указывать на реальные подготовленные assets. Необязательные поля модели: `clip` (начальный клип) и `visibility: { "show": ["exactName"], "hide": ["exactName"] }`. Hide имеет приоритет при конфликте. В `source` воспроизводится правило исходного Avatar Studio: для известной группы одежды видны только `Outfit_original` / `Skin_original`; Body/Hair и другие меши сохраняются. У `current` автоматической фильтрации одежды нет. MeshoptDecoder подключён из того же Three.js r169.

## Пересборка записанных поворотов

Нужны Blender 4.5, Python для предварительной проверки файлов и Node.js 20.6 или новее. У конвертера нет npm-установки: он читает уже закреплённые `vendor/three/` (r169) и `vendor/upf/` через публичный ESM loader Node. Сторонний код не копируется и не изменяется.

[Manifest восьми FBX](tools/rocketbox-turns-manifest.json) задаёт точную ревизию Microsoft Rocketbox, пути, размеры, Git blob SHA-1 и SHA-256. Сначала поместите эти исходники в `rocketbox-fbx` либо укажите каталог соответствующего checkout. Команды ниже выполняются **из корня репозитория**; пути `rocketbox-fbx` и `build` можно заменить своими.

```console
python review/exhibition-25-years/motion-lab/tools/export_rocketbox_world_samples.py --input-dir ./rocketbox-fbx --verify-only
blender --background --factory-startup --python review/exhibition-25-years/motion-lab/tools/export_rocketbox_world_samples.py -- --input-dir ./rocketbox-fbx --output-dir ./build/rocketbox-world
node --max-old-space-size=256 review/exhibition-25-years/motion-lab/tools/retarget_rocketbox_turns.mjs --actor emma --world-samples ./build/rocketbox-world --target review/exhibition-25-years/assets/models/visitors/walking-woman.glb --out ./build/emma-native-turns.glb
node --max-old-space-size=256 review/exhibition-25-years/motion-lab/tools/retarget_rocketbox_turns.mjs --actor ethan --world-samples ./build/rocketbox-world --target review/exhibition-25-years/assets/models/visitors/walking-man.glb --out ./build/ethan-native-turns.glb
```

`blender` означает путь к установленному исполняемому файлу Blender 4.5. [Exporter](tools/export_rocketbox_world_samples.py) делает отдельные импорты статической reference-позы и анимации, включает анимированный объект Armature в world matrices, сохраняет 54 mapped кости при 60 Гц в метрах и Y-up. Он не перезаписывает существующие JSON; повторный экспорт требует нового выходного каталога.

[Конвертер](tools/retarget_rocketbox_turns.mjs) сохраняет оригинальные offsets текущего скелета, использует UPF и общие semantic-сегменты опорной позы, записывает bone-only GLB и соседний `.report.json`. По умолчанию создаются четыре поворота выбранного персонажа. `--clips left90` ограничивает проверку одним клипом; `--report`, `--three` и `--upf` задают явные пути отчёта и существующих зависимостей. Файлы вывода должны отличаться от входного GLB. Итоговые движения требуют отдельной проверки в сцене; команды не публикуют сайт и не копируют результаты в production assets автоматически.

## API для Playwright

```js
await page.waitForFunction(() => Boolean(window.motionLab));
await page.evaluate(() => window.motionLab.whenReady());
await page.evaluate(() => window.motionLab.load(['emma-source', 'ethan-source']));
await page.waitForFunction(() => window.motionLab.isReady());
const clipResult = await page.evaluate(() => window.motionLab.setClip('Wave'));
// Проверить clipResult.missing: отсутствующие клипы не заменяются молча.
await page.evaluate(() => window.motionLab.pause());
await page.evaluate(() => window.motionLab.seek(0.8)); // секунды каждого клипа
await page.evaluate(() => window.motionLab.setView('side'));
const metrics = await page.evaluate(() => window.motionLab.snapshot());
await page.screenshot({ path: 'motion-lab-side.png', fullPage: true });
```

Методы:

- `load(ids)` → Promise `{ready, loaded, failed}`; задаёт видимые модели. Это API ядра; панель `experiments.js` после загрузки выбирает две current-модели и `Native · Wave`. Просмотр стартует на паузе.
- `setClip(name, ids?)` или `setClip({modelId: clipName})` → `{changed, missing}`. Сравнение имён точное.
- `seek(seconds, {ids?, normalized?: false})`; `setPhase(0…1, ids?)` — относительная фаза. Seek не меняет play/pause; UI-перемотка ставит просмотр на паузу.
- `play()`, `pause()`, `step(frames = 1, fps = 30)`, `setSpeed(0…8)`, `setLoop(boolean)`.
- `advanceFixedStep(delta, ids?)` — непрерывный шаг для детерминированного A/B: `0 < delta <= 0.1` секунды, без сброса hook на каждом кадре. Глобальный play/pause не изменяется; перед циклом вызовите `pause()`. Delta задаёт именно время клипа и не умножается на UI speed. Разрыв loop по-прежнему отмечен `reason: 'loop-wrap'`.
- `setView('front' | 'side' | 'back' | 'three-quarter')`, `fit()`.
- `setDisplay({skeleton?, soles?, grid?})`.
- `snapshot({ids?, allBones?: true})` — JSON без ссылок на объекты Three.js. Содержит кости world / actorWorld, ноги, длины сегментов, root, треки, видимость одежды, точки подошв и сведения о методе.
- `isReady()` — выбранные модели полностью загружены; `whenReady()` — результат начальной загрузки. `errors`, `warnings`, `models`, `activeIds` — свойства для диагностики.

## Внутренний API для изолированных опытов

Ни один плагин по умолчанию не подключён. Следующие методы предназначены для отдельного UPF / FootIK эксперимента в браузерном контексте; объекты Three.js не нужно передавать через JSON Playwright.

- `getRuntime(id)` возвращает ссылки `THREE`, `root` / `rig`, `holder`, `mixer`, `clips`, `bones`, `roles`, `scene`, `camera`, `controls`, `ground`, `groundMeshes` / `floorMeshes`, текущие `action` / `clip`, функцию `getAction()` и описание исходной `restPose`. `holder` владеет только разнесением моделей для сравнения; постобработчик изменяет rig/кости, не placement.
- `setRestPose(ids?)` ставит стенд на паузу, останавливает действия и восстанавливает исходные локальные transforms и morph weights. Выбранный клип становится `null`. Вызов подходит для калибровки и создания ретаргетера по CURRENT-позе. Существующий hook получает `onReset`, но его применение к rest-позе пропускается; вернуть клип можно через `setClip`.
- `addClips(id, clips, {prefix?: 'UPF · '})` клонирует и добавляет новые AnimationClip, обновляет селекторы. Непустой prefix обязателен; по умолчанию `UPF · `. Исходные клипы не заменяются; совпавшее имя приводит к ошибке до добавления всего пакета.
- `attachPoseHook(id, {label, beforePose?, afterPose?, onReset?, onDetach?})` подключает один обработчик к модели. Можно передать только функцию `afterPose`. Повторное подключение запрещено до `detachPoseHook(id)`.
- `detachPoseHook(id)` вызывает `onDetach`, убирает hook и восстанавливает чистую анимированную позу.

Порядок одного вычисления: `onReset` при скачке времени → `beforePose` на предыдущей позе → восстановление чистой анимированной базы → mixer → сохранение новой чистой базы → `afterPose` → обновление world matrices. Поэтому повторные seek и paused-кадры не накапливают изменения костей. Метрики и снимки **не вызывают hooks повторно**. Контекст callback содержит runtime-поля, `delta`, `time`, `duration`, `phase`, `reason`, `discontinuity` и счётчик `evaluation`. Сброс происходит при seek, смене клипа, шаге, разрыве цикла, смене loop и размещении модели. Во время обычного воспроизведения `delta` следует скорости клипа. Для FootIK `beforeAnimation` вызывается из `beforePose`, `afterAnimation` — из `afterPose`, а `reset` — из `onReset`.

Подключённая постобработка явно отображается в интерфейсе и `snapshot.models[].poseHook`; поле `scope` перестаёт утверждать отсутствие внешней обработки. Контроллер v42 по-прежнему не запускается.

## Метрики основного просмотрщика

В исходной rest-позе выбираются видимые вершины с суммарным skin weight не менее 0.25 на Foot/Toe и их потомках. Сохраняются до 64 вершин нижней полосы каждой стопы. На каждом измерении применяются morph/skinning и world transform, затем вычисляются минимум Y и центр этой выборки. Идентификаторы вершин записываются в снимок, чтобы отслеживать одну и ту же точку между кадрами.

Это диагностическая геометрическая выборка, а не гарантия полной контактной поверхности. Значения `near-floor` / `below-floor` / `above-floor` используют расстояние до Y=0 и порог 0.015 **единицы сцены**; они не являются размеченной фазой опоры. По одному снимку нельзя установить скольжение: нужна последовательность положений фиксированной точки/набора вершин. Разное время клипов не превращается автоматически в общую фазу; UI показывает фазу первого клипа, а перемотка синхронизирует долю длительности каждого клипа.

Основной просмотрщик без подключённого pose hook не корректирует позу или root motion. В отдельном `contact-bench.html` извлечено линейное смещение цикла и сравниваются A/B/C. Для его полного контроля высоты и поправки C перебираются **все** вершины с суммарным Foot/Toe weight ≥0,25; центр прежней 64-точечной выборки используется только для сопоставимой эвристики движения. Визуальная оценка полного движения и переходов остаётся отдельным шагом.
