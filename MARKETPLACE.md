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
- The **vpn project** (external dependency): the extension runs launch scripts
  from a directory you point to via `opencodeVpn.vpnDir`. These scripts must
  provide `opencode-console-vpn.sh` / `opencode-console.sh` that start opencode
  on a given port (env `OPENCODE_CONSOLE_PORT`). See
  [the vpn project](https://github.com/sst/opencode) layout for reference.

## VPN: port and exit-IP are dynamic (script-provided)

The VPN route does **not** hardcode the proxy port or exit IP in the extension.
The launch script reads them at runtime from its own config (`config/vpn.yaml`):

- **Proxy port** — default `2082` (local VPN gateway on the host).
- **Exit-IP** — the public IP the VPN route leaves from (e.g. `203.0.113.0`),
  read from the vpn project config and re-checked by its tools.

Why no `port`/`ip` field in the extension settings: the proxy is owned by the
vpn project, not by this extension. Hardcoding it here would duplicate the
source of truth and drift when the VPN config changes. The extension only needs
the **opencode API port** per session (route `port`, 4098/4100), which is how
multiple windows talk to their own opencode instance. The proxy port / exit-IP
are supplied by the script, so the same plugin works with **any VPN setup**
(Quatro, WireGuard, commercial, corporate) — point `vpnDir` at a project whose
scripts export `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY` and start opencode on
`OPENCODE_CONSOLE_PORT`.

To inspect the current values from the vpn project:

```bash
cd ~/.config/vpn
./scripts/cfg.py config/vpn.yaml opencode.proxy.port   # → 2082
./scripts/vpn-toggle.sh status                          # → exit-IP каждого порта
```

### Self-contained: works with any VPN

The VPN route is **self-contained**. If `opencodeVpn.vpnDir` is set and exists,
it runs the vpn project scripts (your values). Otherwise it falls back to a
**built-in launch**: opencode starts directly with
`HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY` (socks5h) pointing at
`opencodeVpn.proxyHost:opencodeVpn.proxyPort` (default `127.0.0.1:2082`).
So the extension works with any VPN (Quatro, WireGuard, commercial, corporate):
point the proxy settings at your gateway — no external project needed.

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
  "opencodeVpn.vpnDir": "/home/user/launch-scripts",
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