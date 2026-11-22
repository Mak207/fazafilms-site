# Лаборатория движения Emma / Ethan

Стенд готовых движений для выставочных Emma и Ethan на Three.js **0.169.0**. Главная страница загружает прежние выставочные меши и отдельные библиотеки из 13 перенесённых движений. По умолчанию показан `Native · Wave` на паузе. Масштаб и внешность выставочных GLB сохранены.

Сравнение исходных персонажей, замороженного runtime v42 и отдельного FootIK-опыта доступно со страницы стенда. Основной просмотрщик проигрывает клипы; v42 запускается только на `baseline-v42.html`. Внешнее разнесение моделей хранится в `holder`, записывается в JSON и вычитается в `actorWorld`.

## Итог практического опыта · 22.11.2026

Готовы 13 перенесённых движений на каждом из двух прежних выставочных персонажей. По 273 позы проверены после экспорта; максимальная ошибка положения костей — 0,1194 / 0,1424 мм. UI прошёл 73 проверки, включая ширины 1440, 390 и 414 px.

[Полный результат A/B/C](CONTACT-RESULTS.md) и [машиночитаемое сравнение](checks/contact-comparison.json): готовый hh-hang FootIK устраняет погружение обуви, но меняет её зазор и движение. Для ровного пола выбран **C — общий вертикальный подъём по всем weighted вершинам Foot/Toe** с пределом 20 мм. В 480 шагах на персонажа фактически потребовалось 11,2197 / 18,4100 мм; координаты XZ и локальные transforms суставов не изменились. Это кандидат для последующей интеграции, не foot locking и не решение лестниц/склонов.

Минимальный шов повторяемого Walk остаётся: максимум 6,474 / 10,263 мм по всему скелету, около 0,1 мм на Foot/Toe. Переходы, повороты и взаимное избегание посетителей проверяются отдельно. Frozen v42 сохранён; production runtime не заменён.

[Происхождение моделей и инструментов](ASSET-SOURCES.md) · [Точность motion GLB](checks/motion-bundle-validation.json) · [UI-проверка](checks/ui-validation.json) · [Дефекты v42](checks/v42-known-defects.json).

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
