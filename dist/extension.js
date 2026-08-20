"use strict";
// Alex.opencode-fly (автор @Alex_om) — кнопки запуска opencode через разные
// маршруты рядом с основной кнопкой (sst-dev.opencode = «напрямую»):
//   VPN — хост opencode через VPN-шлюз (прокси из vpn.yaml), порт 4098
//   Dock — opencode в контейнере (своя БД/конфиг), порт 4100
//   VPS — будущее (Франция), порт 4099 — добавляется настройкой, без правки кода
// Заголовки окон отличаются: иконка вкладки (цвет) + подпись в заголовке
// (эмодзи + метка, задаётся OPENCODE_TITLE_NAME через opencode-titled.sh).
//
// Порт в маршруте — БАЗОВЫЙ порт первой сессии маршрута (4098/4100). Каждая
// следующая сессия маршрута («в новой вкладке») получает СВОБОДНЫЙ порт, чтобы
// не конфликтовать с уже работающей (иначе «второе окно ломает первое»).
// Скрипты opencode-console-vpn.sh / opencode-console.sh подхватывают порт из
// env OPENCODE_CONSOLE_PORT — vpn-проект править не нужно.
// Прокси для VPN всегда берётся из config/vpn.yaml (2082) — API-порт opencode
// к маршруту трафика отношения не имеет: каждая сессия идёт через ВПН.
//
// Маршруты и путь к vpn-проекту настраиваются в Settings VSCode:
//   opencodeVpn.vpnDir   — каталог проекта vpn (пусто → DEFAULT_VPN_DIR)
//   opencodeVpn.routes   — массив маршрутов (пусто → DEFAULT_ROUTES)
// Плейсхолдер {vpnDir} в launch подставляется из настроек. Личные пути в коде
// не зашиты: дефолты ниже — только на случай пустой конфигурации.

const vscode = require("vscode");
const net = require("net");

// Внешняя зависимость: скрипты запуска живут в проекте vpn
// (~/.config/vpn/scripts/), рядом со своим config/vpn.yaml, cfg.py,
// docker-compose и opencode-titled.sh. Копировать их сюда нельзя — будет
// дублирование с дрейфом. Путь настраивается через opencodeVpn.vpnDir;
// в коде личные пути не хранятся (портабельность для публикации).
//
// Самодостаточность: если opencodeVpn.vpnDir задан и существует — маршрут
// VPN идёт через скрипты vpn-проекта (наши значения). Если vpnDir пуст или
// недоступен — встроенный запуск opencode с прокси из opencodeVpn.proxy.*
// (по умолчанию 127.0.0.1:2082). Так плагин работает с ЛЮБЫМ VPN.
const DEFAULT_VPN_DIR = "";
const DEFAULT_PROXY_HOST = "127.0.0.1";
const DEFAULT_PROXY_PORT = "2082";

// Встроенные дефолты — используются, когда opencodeVpn.routes пуст.
// Плейсхолдеры {vpnDir}, {proxyHost}, {proxyPort} заменяются из настроек.
const DEFAULT_ROUTES = [
  {
    id: "vpn",
    label: "VPN",
    icon: "button-green.svg",
    terminalName: "opencode (VPN)",
    titleName: "🛡 VPN",
    port: 4098,
    launch:
      "if [ -d '{vpnDir}' ]; then cd '{vpnDir}' && ./scripts/opencode-console-vpn.sh; " +
      "else export HTTP_PROXY=http://{proxyHost}:{proxyPort}; " +
      "export HTTPS_PROXY=$HTTP_PROXY; export ALL_PROXY=socks5h://{proxyHost}:{proxyPort}; " +
      "export NO_PROXY=localhost,127.0.0.1; exec opencode --port \"$OPENCODE_CONSOLE_PORT\"; fi",
  },
  {
    id: "dock",
    label: "Dock",
    icon: "button-blue.svg",
    terminalName: "opencode (Dock)",
    titleName: "🐳 Dock",
    port: 4100,
    launch: "cd '{vpnDir}' && ./scripts/opencode-console.sh",
  },
  // Будущий маршрут VPS (сервер во Франции): включить настройкой
  // opencodeVpn.routes = [..., {id:"vps", ..., port: 4099,
  //   launch: "cd '{vpnDir}' && ./scripts/opencode-vps.sh"}]
];

// Прочитать маршруты из настроек (opencodeVpn.routes), при пустом списке —
// DEFAULT_ROUTES. Плейсхолдеры подставляются из opencodeVpn.*.
function effectiveRoutes() {
  const cfg = vscode.workspace.getConfiguration("opencodeVpn");
  const vpnDir = cfg.get("vpnDir", "") || DEFAULT_VPN_DIR;
  const proxyHost = cfg.get("proxyHost", "") || DEFAULT_PROXY_HOST;
  const proxyPort = cfg.get("proxyPort", "") || DEFAULT_PROXY_PORT;
  const configured = cfg.get("routes", []);
  const base = Array.isArray(configured) && configured.length ? configured : DEFAULT_ROUTES;
  if (!vpnDir && base.some((r) => String(r.launch || "").includes("{vpnDir}"))) {
    vscode.window.showWarningMessage(
      "opencode-fly: настройка opencodeVpn.vpnDir не задана, " +
      "VPN-маршрут работает во встроенном режиме с прокси из настроек.",
    );
  }
  const routes = base.map((r) => ({
    ...r,
    launch: String(r.launch || "")
      .replace(/\{vpnDir\}/g, vpnDir)
      .replace(/\{proxyHost\}/g, proxyHost)
      .replace(/\{proxyPort\}/g, proxyPort),
  }));
  return routes;
}

// Порты, уже отданные сессиям (чтобы две новые сессии не получили один и тот же).
const usedPorts = new Set();

function activate(context) {
  const routes = effectiveRoutes();

  for (const route of routes) {
    context.subscriptions.push(
      vscode.commands.registerCommand(
        `opencode-fly.${route.id}.openTerminal`,
        () => openConsole(context, route, false),
      ),
      vscode.commands.registerCommand(
        `opencode-fly.${route.id}.openNewTerminal`,
        () => openConsole(context, route, true),
      ),
    );
  }

  // Освобождаем порт при закрытии терминала маршрута.
  vscode.window.onDidCloseTerminal((term) => {
    const env = term.creationOptions ? term.creationOptions.env : undefined;
    const port = env ? env._EXTENSION_OPENCODE_PORT : undefined;
    if (port) usedPorts.delete(parseInt(port, 10));
  }, null, context.subscriptions);

  const addFile = vscode.commands.registerCommand(
    "opencode-fly.addFilepathToTerminal",
    async () => {
      const ref = currentFileRef();
      if (!ref) return;
      const term = vscode.window.activeTerminal;
      if (!term) return;
      if (!isRouteTerminal(term.name, routes)) return;
      const env = term.creationOptions ? term.creationOptions.env : undefined;
      const port = env ? env._EXTENSION_OPENCODE_PORT : undefined;
      if (port) {
        await appendPrompt(parseInt(port, 10), ref);
      } else {
        term.sendText(ref, false);
      }
      term.show();
    },
  );

  context.subscriptions.push(addFile);
}

function isRouteTerminal(name, routes) {
  return routes.some(
    (r) => r.terminalName === name || name.startsWith(`${r.terminalName} `),
  );
}

async function openConsole(context, route, forceNew) {
  const existing = vscode.window.terminals.find((t) => t.name === route.terminalName);
  if (existing && !forceNew) {
    if (await portAlive(route.port)) {
      existing.show();
      return;
    }
    existing.dispose();
  }

  const port = await allocPort(route, forceNew);

  // Рабочий каталог — проект, открытый в редакторе (первая папка воркспейса),
  // а не хардкод. Скрипты запуска используют OPENCODE_WORKDIR с фолбэком на
  // свой config/vpn.yaml, если папка не открыта.
  const wf = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  const workdir = wf ? wf.uri.fsPath : "";

  const iconPath = {
    light: vscode.Uri.file(context.asAbsolutePath(`images/${route.icon}`)),
    dark: vscode.Uri.file(context.asAbsolutePath(`images/${route.icon}`)),
  };
  // Команду запускаем через bash -c (shellArgs), а не term.sendText: так она
  // не «печатается» в терминале на глазах у пользователя. Скрипты всё равно
  // exec-ят opencode (TUI), поэтому интерактивный shell не нужен.
  const term = vscode.window.createTerminal({
    name: route.terminalName,
    iconPath,
    location: { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
    shellPath: "/bin/bash",
    // bash -c (не sendText) — команда не «печатается» на глазах. Сначала
    // подгружаем .bashrc: в интерактивной оболочке он читается автоматически,
    // а здесь PATH из него (напр. ~/.opencode/bin) нужен для запуска opencode.
    shellArgs: ["-c", `source "$HOME/.bashrc" 2>/dev/null; ${route.launch}`],
    env: {
      _EXTENSION_OPENCODE_PORT: String(port),
      OPENCODE_CALLER: "vscode",
      OPENCODE_CONSOLE_PORT: String(port),
      OPENCODE_WORKDIR: workdir,
      OPENCODE_TITLE_NAME: route.titleName,
      OPENCODE_TITLE: "0",
      OPENCODE_TITLE_SOUND: process.env.OPENCODE_TITLE_SOUND || "1",
    },
  });
  usedPorts.add(port);
  term.show();

  const ref = currentFileRef();
  if (!ref) return;

  let ok = false;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(`http://localhost:${port}/app`);
      if (res.ok) { ok = true; break; }
    } catch {}
  }
  if (ok) {
    await appendPrompt(port, `In ${ref}`);
    term.show();
  }
}

// Выделить порт для новой сессии. Первая сессия маршрута — базовый порт
// (ROUTES[].port); если он уже занят живой сессией — новый свободный.
async function allocPort(route, forceNew) {
  if (!forceNew || !(await canBind(route.port))) return route.port;
  for (let i = 0; i < 50; i++) {
    const p = Math.floor(Math.random() * 49152) + 16384;
    if (usedPorts.has(p)) continue;
    if (await canBind(p)) return p;
  }
  return route.port;
}

// Порт свободен, если на 127.0.0.1:port никто не слушает (и он ещё не отдан
// сессии этого процесса). Опираемся на реальный bind, а не на GET /app, чтобы
// не «съесть» порт, занятый посторонним процессом.
function canBind(port) {
  if (usedPorts.has(port)) return Promise.resolve(false);
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.listen(port, "127.0.0.1", () => {
      srv.close(() => resolve(true));
    });
  });
}

async function portAlive(port) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`http://localhost:${port}/app`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

async function appendPrompt(port, text) {
  try {
    await fetch(`http://localhost:${port}/tui/append-prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch {}
}

function currentFileRef() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const doc = editor.document;
  if (!vscode.workspace.getWorkspaceFolder(doc.uri)) return;
  let ref = `@${vscode.workspace.asRelativePath(doc.uri)}`;
  const sel = editor.selection;
  if (!sel.isEmpty) {
    const start = sel.start.line + 1;
    const end = sel.end.line + 1;
    ref += start === end ? `#L${start}` : `#L${start}-${end}`;
  }
  return ref;
}

function deactivate() {}

module.exports = { activate, deactivate };