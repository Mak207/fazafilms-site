# Подключение Unreal Pixel Streaming

## Локальный просмотр 4K-ролика

Не открывайте `index.html` напрямую через файловый просмотрщик: большой MP4 требует HTTP-сервера
с поддержкой byte-range запросов. Для локального просмотра дважды нажмите
`START_HOROVOD_PREVIEW.cmd` в корне сайта. Откроется адрес
`http://127.0.0.1:4173/horovod/`, на котором 4K-ролик воспроизводится полностью.

В ролик включена аранжировка народной мелодии «Во поле берёза стояла» из версии с 509 линиями.
Отдельный файл доставки хранится как PCM 24-bit / 48 kHz / stereo в
`media/horovod-folk-master-24bit-48khz.wav`; браузерная версия MP4 содержит совместимую AAC-копию.
Исходник этой аранжировки был PCM 16-bit, поэтому конвертация в 24-bit не восстанавливает
отсутствовавшую в исходнике звуковую детализацию.

Страница `/horovod/` уже содержит полноэкранную панель для интерактивной Unreal-сессии. Сам `fazafilms.ru` размещён на GitHub Pages и не исполняет Unreal Engine: сцену нужно запускать на отдельном GPU-сервере и передавать в браузер через WebRTC.

## Как активировать кнопку

В `horovod/index.html` найдите секцию:

```html
<section class="showcase" id="showcase" data-stream-url="">
```

Укажите публичный HTTPS-адрес Pixel Streaming frontend:

```html
<section class="showcase" id="showcase" data-stream-url="https://stream.fazafilms.ru/">
```

После этого кнопка «Запустить интерактив» загрузит сессию в полноэкранный iframe. Если адрес пуст, посетителю показывается честное уведомление, а 4K-ролик остаётся доступен.

## Требования к серверу

- GPU-сервер Windows или Linux с упакованным Unreal-проектом;
- Pixel Streaming Infrastructure версии, совместимой с проектом Unreal;
- HTTPS/WSS для сигнального сервера;
- TURN-сервер для клиентов за корпоративными NAT и firewall;
- разрешение встраивания с `https://fazafilms.ru` через CSP `frame-ancestors`;
- ограничение доступа к клиентской презентации: временная ссылка или токен сессии.

Для первой клиентской версии используйте 1920×1080 и целевой видеобитрейт около 10–15 Мбит/с. 4K включайте отдельным профилем после проверки GPU и реального соединения заказчика.

Официальные материалы Epic Games:

- <https://dev.epicgames.com/documentation/en-us/unreal-engine/pixel-streaming-in-unreal-engine>
- <https://dev.epicgames.com/documentation/unreal-engine/hosting-and-networking-guide-for-pixel-streaming-in-unreal-engine>
- <https://dev.epicgames.com/documentation/unreal-engine/stream-tuning-guide>
