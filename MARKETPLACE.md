# opencode (VPN / Dock / VPS) — launch opencode through different routes

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
- **File attach**: `opencode-vpn.addFilepathToTerminal` sends the current file
  (`@path`, with selection `#L…` / `#L…-…`) into the route terminal via
  `/tui/append-prompt`.
- Distinct tabs: icon color + window title label (emoji + name).
- Routes are configured via **VS Code Settings** — no code editing.

## Requirements

- VS Code ≥ 1.94
- The **vpn project** (external dependency): the extension runs launch scripts
  from a directory you point to via `opencodeVpn.vpnDir`. These scripts must
  provide `opencode-console-vpn.sh` / `opencode-console.sh` that start opencode
  on a given port (env `OPENCODE_CONSOLE_PORT`). See
  [the vpn project](https://github.com/sst/opencode) layout for reference.

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

Each route needs: `id` (command key `opencode-vpn.<id>.openTerminal`), `icon`
(SVG file in `images/`), `terminalName`, `titleName`, `port` (base port of the
first session), `launch` (command; `{vpnDir}` is substituted from
`opencodeVpn.vpnDir`).

## Commands

| Command | What it does |
|---------|--------------|
| `opencode-vpn.vpn.openTerminal` | Open opencode (VPN) |
| `opencode-vpn.vpn.openNewTerminal` | Open opencode (VPN) in a new tab |
| `opencode-vpn.dock.openTerminal` | Open opencode (Dock) |
| `opencode-vpn.dock.openNewTerminal` | Open opencode (Dock) in a new tab |
| `opencode-vpn.addFilepathToTerminal` | Attach current file to the route terminal |

## Notes

- The extension starts opencode directly (`OPENCODE_TITLE=0`); window titles
  differ by icon + label. Manual runs from the terminal use a title wrapper.
- Host and container have separate opencode DBs; host routes (direct / VPN)
  share the host DB.
- This extension is an independent copy of the launch-button pattern; it does
  not modify `sst-dev.opencode`.

## License

MIT