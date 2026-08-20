"use strict";
// Alex.opencode-fly — кнопки запуска opencode через разные маршруты рядом с
// основной кнопкой (sst-dev.opencode = «напрямую»):
//   VPN — opencode через прокси (встроенный режим) или через внешний скрипт
//   Dock — opencode в контейнере (внешний скрипт) или напрямую на хосте
//   VPS — будущее, добавляется настройкой, без правки кода
// Заголовки окон отличаются: иконка вкладки (цвет) + подпись в заголовке.
//
// Порт в маршруте — БАЗОВЫЙ порт первой сессии маршрута (4098/4100). Каждая
// следующая сессия маршрута («в новой вкладке») получает СВОБОДНЫЙ порт, чтобы
// не конфликтовать с уже работающей (иначе «второе окно ломает первое»).
// Внешние скрипты подхватывают порт из env OPENCODE_CONSOLE_PORT.
//
// Самодостаточность: плагин работает БЕЗ внешних скриптов. Встроенный режим
// запускает opencode напрямую (VPN — с прокси из настроек). Внешние скрипты
// подключаются настройкой opencodeVpn.vpnDir: если каталог существует —
// маршрут идёт через его скрипты.
//
// Маршруты и путь к внешним скриптам настраиваются в Settings VSCode:
//   opencodeVpn.vpnDir     — каталог с внешними скриптами (пусто → встроенный)
//   opencodeVpn.routes     — массив маршрутов (пусто → DEFAULT_ROUTES)
//   opencodeVpn.proxyHost/port — прокси для встроенного режима VPN
// Плейсхолдер {vpnDir} в launch подставляется из настроек.

const vscode = require("vscode");
const net = require("net");

// Внешние скрипты запуска (не обязательны). Если opencodeVpn.vpnDir задан и
// существует — маршрут идёт через его скрипты (scripts/opencode-console-vpn.sh
// и scripts/opencode-console.sh). Иначе — встроенный запуск ниже.
const DEFAULT_VPN_DIR = "";
const DEFAULT_PROXY_HOST = "127.0.0.1";
const DEFAULT_PROXY_PORT = "2082";

// Встроенные дефолты — используются, когда opencodeVpn.routes пуст.
// Плейсхолдеры {vpnDir}, {proxyHost}, {proxyPort} заменяются из настроек.
// Каждый launch самодостаточен: есть внешний скрипт — используем его,
// иначе встроенный запуск opencode.
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
    launch:
      "if [ -d '{vpnDir}' ]; then cd '{vpnDir}' && ./scripts/opencode-console.sh; " +
      "else exec opencode --port \"$OPENCODE_CONSOLE_PORT\"; fi",
  },
  // Будущий маршрут VPS: включить настройкой
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
  // а не хардкод. Внешние скрипты используют OPENCODE_WORKDIR с собственным
  // фолбэком, если папка не открыта.
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