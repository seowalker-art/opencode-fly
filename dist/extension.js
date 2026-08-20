"use strict";
// alex.opencode-vpn — кнопки запуска opencode через разные маршруты рядом с
// основной кнопкой (sst-dev.opencode = «напрямую»):
//   VPN — хост opencode через VPN-шлюз (прокси из vpn.yaml), порт 4098
//   Dock — opencode в контейнере (своя БД/конфиг), порт 4100
//   VPS — будущее (Франция), порт 4099 — добавляется данными, без правки кода
// Заголовки окон отличаются: иконка вкладки (цвет) + подпись в заголовке
// (эмодзи + метка, задаётся OPENCODE_TITLE_NAME через opencode-titled.sh).
//
// Порт в ROUTES — БАЗОВЫЙ порт первой сессии маршрута (4098/4100). Каждая
// следующая сессия маршрута («в новой вкладке») получает СВОБОДНЫЙ порт, чтобы
// не конфликтовать с уже работающей (иначе «второе окно ломает первое»).
// Скрипты opencode-console-vpn.sh / opencode-console.sh подхватывают порт из
// env OPENCODE_CONSOLE_PORT — vpn-проект править не нужно.
// Прокси для VPN всегда берётся из config/vpn.yaml (2082) — API-порт opencode
// к маршруту трафика отношения не имеет: каждая сессия идёт через ВПН.

const vscode = require("vscode");
const net = require("net");

// Внешняя зависимость: скрипты запуска живут в проекте vpn
// (~/.config/vpn/scripts/), рядом со своим config/vpn.yaml, cfg.py,
// docker-compose и opencode-titled.sh. Копировать их сюда нельзя — будет
// дублирование с дрейфом. Если vpn-проект переехал — править только здесь.
const VPN_DIR = "/path/to/launch-scripts";

const ROUTES = [
  {
    id: "vpn",
    label: "VPN",
    icon: "button-green.svg",
    terminalName: "opencode (VPN)",
    titleName: "🛡 VPN",
    port: 4098,
    launch: `cd '${VPN_DIR}' && ./scripts/opencode-console-vpn.sh`,
  },
  {
    id: "dock",
    label: "Dock",
    icon: "button-blue.svg",
    terminalName: "opencode (Dock)",
    titleName: "🐳 Dock",
    port: 4100,
    launch: `cd '${VPN_DIR}' && ./scripts/opencode-console.sh`,
  },
  // Будущий маршрут VPS (сервер во Франции): добавляется данными, код не трогаем.
  // {
  //   id: "vps",
  //   label: "VPS",
  //   icon: "button-purple.svg",
  //   terminalName: "opencode (VPS)",
  //   titleName: "🖥 VPS",
  //   port: 4099,
  //   launch: `cd '${VPN_DIR}' && ./scripts/opencode-vps.sh`,
  // },
];

// Порты, уже отданные сессиям (чтобы две новые сессии не получили один и тот же).
const usedPorts = new Set();

function activate(context) {
  for (const route of ROUTES) {
    context.subscriptions.push(
      vscode.commands.registerCommand(
        `opencode-vpn.${route.id}.openTerminal`,
        () => openConsole(context, route, false),
      ),
      vscode.commands.registerCommand(
        `opencode-vpn.${route.id}.openNewTerminal`,
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
    "opencode-vpn.addFilepathToTerminal",
    async () => {
      const ref = currentFileRef();
      if (!ref) return;
      const term = vscode.window.activeTerminal;
      if (!term) return;
      if (!isRouteTerminal(term.name)) return;
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

function isRouteTerminal(name) {
  return ROUTES.some(
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

  const iconPath = {
    light: vscode.Uri.file(context.asAbsolutePath(`images/${route.icon}`)),
    dark: vscode.Uri.file(context.asAbsolutePath(`images/${route.icon}`)),
  };
  const term = vscode.window.createTerminal({
    name: route.terminalName,
    iconPath,
    location: { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
    env: {
      _EXTENSION_OPENCODE_PORT: String(port),
      OPENCODE_CALLER: "vscode",
      OPENCODE_CONSOLE_PORT: String(port),
      OPENCODE_TITLE_NAME: route.titleName,
      OPENCODE_TITLE: "0",
      OPENCODE_TITLE_SOUND: process.env.OPENCODE_TITLE_SOUND || "1",
    },
  });
  usedPorts.add(port);
  term.show();
  term.sendText(route.launch);

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