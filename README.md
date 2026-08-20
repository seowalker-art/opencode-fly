# opencode-fly — VSCode-плагин маршрутов opencode

Кнопки запуска [opencode](https://opencode.ai) рядом с основной чёрной кнопкой
(`sst-dev.opencode` = «напрямую»):

| Маршрут | Кнопка | Вкладка | Базовый порт |
|---------|--------|---------|------|
| VPN (через прокси) | зелёная | `🛡 VPN` | 4098 |
| Dock (контейнер) | синяя | `🐳 Dock` | 4100 |
| VPS (добавить настройкой) | фиолетовая | `🖥 VPS` | 4099 |

> **Порт — не лимит сессий.** В таблице указан **базовый** порт маршрута —
> его занимает первая сессия. Каждая следующая сессия («в новой вкладке»)
> получает **любой свободный порт** из диапазона 16384–65535 (проверка
> реальным bind, как в исходном плагине sst-dev.opencode). Ограничения в 3
> сессии нет: `VPN → 4098, затем 20473, 53821, …`.

## Возможности

- **Один терминал на маршрут**, авто-перезапуск, если сессия умерла.
- **Multi-session**: каждая новая вкладка получает свободный порт — несколько
  окон opencode одного маршрута работают одновременно, не ломая друг друга.
- **Прикрепление файла**: `opencode-fly.addFilepathToTerminal` отправляет
  текущий файл (`@путь`, с выделением `#L…` / `#L…-…`) в терминал маршрута
  через `/tui/append-prompt`.
- Окна различаются: цвет иконки вкладки + подпись в заголовке (эмодзи + метка).
- Маршруты настраиваются из **Settings VSCode** — без правки кода.

## Структура

```
package.json         манифест расширения (Alex.opencode-fly)
dist/extension.js    весь код плагина (маршруты из настроек, без правки кода)
images/              иконки кнопок (SVG) и иконка расширения (icon.png)
```

Маршруты задаются **настройками** в VSCode (Settings → `opencodeVpn.*`), не
правкой кода. Пустой `opencodeVpn.routes` = встроенные дефолты (VPN, Dock).

## Самодостаточность (без внешних скриптов)

Плагин работает **без внешних зависимостей** — во встроенном режиме он
запускает opencode напрямую:

- **VPN** — opencode стартует с `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY` (socks5h),
  указывающими на `opencodeVpn.proxyHost`/`opencodeVpn.proxyPort`
  (по умолчанию `127.0.0.1:2082`). Подходит для любого прокси/VPN.
- **Dock** — opencode запускается напрямую на хосте.

Опционально, если задан `opencodeVpn.vpnDir` (абсолютный путь к каталогу с
внешними скриптами запуска), маршруты идут через его скрипты
(`scripts/opencode-console-vpn.sh`, `scripts/opencode-console.sh`), которые
стартуют opencode на порту из env `OPENCODE_CONSOLE_PORT`. Так можно подключить
собственные контейнеры, прокси и конфигурации.

## VPN: порт прокси и exit-IP

Во встроенном режиме плагин не хранит в коде порт прокси и IP — они задаются
настройками `opencodeVpn.proxyHost`/`opencodeVpn.proxyPort`. При подключении
внешних скриптов (`vpnDir`) значения берутся из их конфигурации, и плагин
работает с любым VPN — нужно лишь, чтобы скрипты экспортировали
`HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY` и стартовали opencode на
`OPENCODE_CONSOLE_PORT`.

## Код (один файл)

Вся логика — в [`dist/extension.js`](dist/extension.js): маршруты читаются из
настроек (`opencodeVpn.routes`), `{vpnDir}` подставляется из
`opencodeVpn.vpnDir`, порты выделяются динамически и освобождаются при
закрытии терминала. Манифест — [`package.json`](package.json).

## Установка (.vsix)

1. Скачайте `.vsix` из релиза (или соберите: `vsce package`).
2. В VSCode: Extensions → `…` → **Install from VSIX…** → выберите файл.
3. (Необязательно) задайте `opencodeVpn.vpnDir` для внешних скриптов.

Цветные кнопки (VPN / Dock) появятся в заголовке редактора. Хоткей
`ctrl+alt+shift+o` открывает VPN-терминал.

## Настройка маршрутов (Settings VSCode)

Настройки (префикс `opencodeVpn`):

1. **`opencodeVpn.vpnDir`** — абсолютный путь к каталогу с внешними скриптами
   запуска. Пусто или недоступно → встроенный режим.
2. **`opencodeVpn.routes`** — массив маршрутов. Каждый элемент — одна кнопка
   (`id`, `icon`, `terminalName`, `titleName`, `port`, `launch`). Пустой массив
   → встроенные дефолты (VPN, Dock).
3. **`opencodeVpn.proxyHost` / `opencodeVpn.proxyPort`** — хост и порт
   VPN-прокси для встроенного режима (по умолчанию `127.0.0.1:2082`).

В команде `launch` плейсхолдер `{vpnDir}` подставляется из `opencodeVpn.vpnDir`:

```json
{
  "opencodeVpn.routes": [
    {
      "id": "vpn",
      "label": "VPN",
      "icon": "button-green.svg",
      "terminalName": "opencode (VPN)",
      "titleName": "🛡 VPN",
      "port": 4098,
      "launch": "cd '{vpnDir}' && ./scripts/opencode-console-vpn.sh"
    }
  ]
}
```

## Новая кнопка (маршрут)

1. Скопировать SVG в `images/` под своим именем и перекрасить:
   ```bash
   cp images/button-green.svg images/button-red.svg
   ```
   В SVG два fill-цвета: светлый фон и тёмный силуэт. Примеры: зелёный
   `#69f0ae`/`#00c853`, синий `#81d4fa`/`#039be5`, фиолетовый
   `#e1bee7`/`#7b1fa2`, красный `#ef9a9a`/`#d32f2f`, жёлтый `#fff59d`/`#f9a825`.
2. Добавить элемент в `opencodeVpn.routes` (Settings VSCode): `id`, `icon`,
   `terminalName`, `titleName`, `port`, `launch` (команда запуска, путь через
   плейсхолдер `{vpnDir}`).
3. `npm`-шаг не нужен — плагин без сборки (простой `dist/extension.js`).
4. **Reload Window** в VSCode — кнопка появится на панели.

Чтобы **убрать** кнопку — удалить элемент из `opencodeVpn.routes` (SVG можно
оставить). Порядок элементов определяет порядок кнопок на панели.

## Команды

| Команда | Действие |
|---------|----------|
| `opencode-fly.vpn.openTerminal` | Открыть opencode (VPN) |
| `opencode-fly.vpn.openNewTerminal` | Открыть opencode (VPN) в новой вкладке |
| `opencode-fly.dock.openTerminal` | Открыть opencode (Dock) |
| `opencode-fly.dock.openNewTerminal` | Открыть opencode (Dock) в новой вкладке |
| `opencode-fly.addFilepathToTerminal` | Прикрепить текущий файл к терминалу маршрута |

## Замечания

- Плагин ставит `OPENCODE_TITLE=0` — opencode запускается напрямую (как
  sst-dev); различие окон — иконка + название.
- Хост и контейнер — разные БД opencode; хостовые маршруты (напрямую / VPN)
  делят одну хостовую БД.

## Лицензия

MIT

## Автор

[@Alex_om](https://t.me/Alex_om)