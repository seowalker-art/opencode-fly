# opencode-fly — launch opencode through different routes

Buttons to launch [opencode](https://opencode.ai) terminals next to the built-in
opencode button (`sst-dev.opencode` = direct launch on the host):

| Route | Button | Tab | Base port |
|-------|--------|-----|-----------|
| VPN (host → proxy) | green | 🛡 VPN | 4098 |
| Dock (container) | blue | 🐳 Dock | 4100 |
| VPS (future) | purple | 🖥 VPS | 4099 (add via settings) |

## Features

- **One terminal per route**, auto-restart if the session died.
- **Multi-session**: every new tab gets a free port (16384–65535), so several
  opencode windows of the same route can run at once without breaking each other.
- **File attach**: `opencode-fly.addFilepathToTerminal` sends the current file
  (`@path`, with selection `#L…` / `#L…-…`) into the route terminal via
  `/tui/append-prompt`.
- Distinct tabs: icon color + window title label (emoji + name).
- Routes are configured via **VS Code Settings** — no code editing.

## Source code

All the logic lives in a single file — [`dist/extension.js`](dist/extension.js):
routes are read from settings (`opencodeVpn.routes`), the `{vpnDir}` placeholder
is substituted from `opencodeVpn.vpnDir`, ports are allocated dynamically and
released when a terminal closes. The manifest is [`package.json`](package.json).

## Requirements

- VS Code ≥ 1.94
- No external dependencies — the extension is self-contained (see below).
  Optionally, external launch scripts can be plugged in via `opencodeVpn.vpnDir`.

## Self-contained (works without external scripts)

The extension is **self-contained**: it starts opencode directly, without any
external project.

- **VPN route** — opencode launches with
  `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY` (socks5h) pointing at
  `opencodeVpn.proxyHost:opencodeVpn.proxyPort` (default `127.0.0.1:2082`).
  Works with any proxy/VPN gateway.
- **Dock route** — opencode launches directly on the host.

Optionally, if `opencodeVpn.vpnDir` points to a directory with launch scripts
(`scripts/opencode-console-vpn.sh` / `scripts/opencode-console.sh`), the routes
run those scripts instead. The scripts must start opencode on the port from env
`OPENCODE_CONSOLE_PORT` and may export `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY`.

## VPN: proxy port and exit-IP are not hardcoded

The extension does **not** store the proxy port or exit IP in code. In the
built-in mode they come from `opencodeVpn.proxyHost`/`opencodeVpn.proxyPort`;
with external scripts (`vpnDir`) they are read from the scripts' own config at
runtime. So the same plugin works with **any VPN setup** — point `vpnDir` at a
project whose scripts export `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY` and start
opencode on `OPENCODE_CONSOLE_PORT`.

The extension only needs the **opencode API port** per session (route `port`,
4098/4100) — that's how multiple windows talk to their own opencode instance.

## Install

1. Download the `.vsix` from the marketplace (or build: `vsce package`).
2. In VS Code: Extensions → `…` → **Install from VSIX…** → select the file.
3. Set `opencodeVpn.vpnDir` to your vpn project path (or leave empty to use the
   built-in default).

The two colored buttons (VPN / Dock) appear in the editor title bar. The
`ctrl+alt+shift+o` keybinding opens the VPN terminal.

## Configuration

Settings under `opencodeVpn`:

- **`opencodeVpn.vpnDir`** — absolute path to the vpn project with the launch
  scripts. Empty → built-in default.
- **`opencodeVpn.routes`** — array of routes. Empty → built-in defaults
  (VPN, Dock).
- **`opencodeVpn.proxyHost`** / **`opencodeVpn.proxyPort`** — VPN proxy
  host/port for the **built-in mode** (default `127.0.0.1:2082`), used when
  `vpnDir` is unset or unavailable.

Example (`settings.json`):

```json
{
  "opencodeVpn.vpnDir": "/path/to/launch-scripts",
  "opencodeVpn.routes": [
    {
      "id": "vpn",
      "label": "VPN",
      "icon": "button-green.svg",
      "terminalName": "opencode (VPN)",
      "titleName": "🛡 VPN",
      "port": 4098,
      "launch": "cd '{vpnDir}' && ./scripts/opencode-console-vpn.sh"
    },
    {
      "id": "dock",
      "label": "Dock",
      "icon": "button-blue.svg",
      "terminalName": "opencode (Dock)",
      "titleName": "🐳 Dock",
      "port": 4100,
      "launch": "cd '{vpnDir}' && ./scripts/opencode-console.sh"
    }
  ]
}
```

Each route needs: `id` (command key `opencode-fly.<id>.openTerminal`), `icon`
(SVG file in `images/`), `terminalName`, `titleName`, `port` (base port of the
first session), `launch` (command; `{vpnDir}` is substituted from
`opencodeVpn.vpnDir`).

## Commands

| Command | What it does |
|---------|--------------|
| `opencode-fly.vpn.openTerminal` | Open opencode (VPN) |
| `opencode-fly.vpn.openNewTerminal` | Open opencode (VPN) in a new tab |
| `opencode-fly.dock.openTerminal` | Open opencode (Dock) |
| `opencode-fly.dock.openNewTerminal` | Open opencode (Dock) in a new tab |
| `opencode-fly.addFilepathToTerminal` | Attach current file to the route terminal |

## Notes

- The extension starts opencode directly (`OPENCODE_TITLE=0`); window titles
  differ by icon + label. Manual runs from the terminal use a title wrapper.
- Host and container have separate opencode DBs; host routes (direct / VPN)
  share the host DB.
- This extension is an independent copy of the launch-button pattern; it does
  not modify `sst-dev.opencode`.

## License

MIT

## Author

[@Alex_om](https://t.me/Alex_om)