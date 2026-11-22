# Аудит геометрии по записанным мировым матрицам

`audit_recorded_skin.py` — переносимая CLI-копия вычисления, использованного в проверках v44. Линейное смешивание skin, классификация вершин обуви, статические и парные bounds сохранены. `recorded_skin_geometry.py` содержит геометрическую часть исходного GLB-reader; он не проигрывает и не меняет анимацию.

## Зависимости

- Python 3 и NumPy: `python -m pip install numpy`.
- Node.js нужен только для подготовки обычных bufferViews из meshopt GLB.
- Декодер уже находится в репозитории: `motion-lab/vendor/three/examples/jsm/libs/meshopt_decoder.module.js`.
- SciPy, Blender, браузер и GPU для самого CPU-аудита не нужны.

## Подготовка моделей

Из корня репозитория, заменив `/audit-data/decoded` на свою рабочую папку:

```sh
node review/exhibition-25-years/motion-lab/tools/decode_meshopt_glb.mjs review/exhibition-25-years/assets/models/visitors/walking-woman.glb /audit-data/decoded/emma-current-decoded.glb review/exhibition-25-years/motion-lab/vendor/three/examples/jsm/libs/meshopt_decoder.module.js
node review/exhibition-25-years/motion-lab/tools/decode_meshopt_glb.mjs review/exhibition-25-years/assets/models/visitors/walking-man.glb /audit-data/decoded/ethan-current-decoded.glb review/exhibition-25-years/motion-lab/vendor/three/examples/jsm/libs/meshopt_decoder.module.js
```

Утилита декодирует сжатые bufferViews и не делает retarget, оптимизацию, квантование, перестройку вершин или изменение весов. Проверьте SHA исходных и декодированных моделей по proof нужного измерения: другой GLB или другое преобразование нельзя молча использовать для исторической trace.

## Запуск

Папка `--trace-dir` должна содержать `frames.ndjson.gz`, `skin-metadata.json` и `continuity-report.json` от **одного завершённого захвата**. Пример:

```sh
python review/exhibition-25-years/motion-lab/tools/audit_recorded_skin.py --trace-dir /audit-data/capture --decoded-dir /audit-data/decoded --runtime-sha FULL_RUNTIME_SHA256 --adapter-sha FULL_ADAPTER_SHA256 --expected-frames 5401 --output /audit-data/actual-skin-envelope-clearance.json
```

Подставьте полные 64-символьные SHA и фактическое число записей из выбранного захвата. По умолчанию используется layout из того же checkout. Для исторической версии передайте соответствующий файл через `--layout`. Результат записывается только в новый файл; существующий отчёт не перезаписывается.

`--sample-times 0,18.75,21.2333333333334` предназначен только для короткой проверки переносимости утилиты. Такой результат явно содержит `sampleTimes` и не является проверкой всей trace.

## Формат и метод

Каждая строка gzip NDJSON содержит `time` и `actors`. Для каждого актёра нужны `id`, `state`, `phase`, `holder.position`, `holder.quaternion`, `world.actualSpeed`, `pose.walk.weight`, `pose.correctedShoeMinimumY` и `boneWorldAffine`. Порядок костей берётся из `skin-metadata.json: metadata[].boneNames`.

Каждая мировая аффинная матрица записана 12 числами — элементы Three.js column-major `[0,1,2,4,5,6,8,9,10,12,13,14]`; holder, rig и grounding уже включены. В metadata нужны `meshes[].bindMode`, `bindMatrix`, `bindMatrixInverse`, `matrixWorld`. Аудитор проверяет attached mode и ожидаемые матричные соглашения, после чего применяет полную LBS к POSITION/JOINTS/WEIGHTS/IBM моделей. Текущая схема записи и проверки рассчитана на фиксированный шаг 60 Гц.

Положительный bound `clearance(holder)-radius` доказывает, что окружность, охватывающая всю проекцию skin, не пересекает footprint препятствий. Положительный `centerDistance-radiusA-radiusB` доказывает разделение обоих персонажей в данном кадре. Поэтому это проверка всей skin и внутренних точек её треугольников, а не только костей или расстояния между центрами.

Нижняя точка обуви — минимум вершин с суммарным весом Foot/Toe не менее 0.25. Совпадение с runtime проверяет корректность реконструкции. Этот минимум **не измеряет горизонтальное проскальзывание опорной стопы**, не подтверждает её физическую неподвижность и не доказывает естественность походки. Межкадровые столкновения и самопересечения частей одного персонажа отдельно не проверяются.

## Граница воспроизводимости

Код, decoder, layout и текущие упакованные модели находятся в Git. Большие исторические `frames.ndjson.gz`, metadata, capture manifest, декодированные GLB и покадровые отчёты в Git не дублируются. Они сохранены в локальных каталогах Lenovo `avatar-ready-locomotion-data-20261122` и `avatar-motion-data-20261122/decoded`; точные относительные пути и SHA приведены в соответствующем proof.

**Один checkout без указанных исторических данных не является самодостаточным набором для повторения исторического результата.** Декодированные модели можно получить командами выше при наличии правильных версий исходных GLB; историческую trace нужно отдельно перенести вместе с metadata и manifest либо сделать новый захват и считать его новым измерением. Числовые результаты в proof относятся только к зафиксированным входным SHA.
