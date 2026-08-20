# Makefile проекта VSCode-плагина opencode-fly.
# Плагин самодостаточен (встроенный запуск opencode); внешние скрипты —
# опционально, подключаются настройкой opencodeVpn.vpnDir.
# Установленная копия — ~/.vscode/extensions/ (EXT ниже).

SHELL := /bin/bash
SRC := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
EXT := $(HOME)/.vscode/extensions/alex.opencode-fly-0.0.6
VSIX := opencode-fly-0.0.6.vsix

.DEFAULT_GOAL := help

## help: список команд проекта
help:
	@echo "Проект VSCode-плагина Alex_om.opencode-fly."
	@echo ""
	@echo "  make install    синхронизировать установленную копию (~/.vscode/extensions)"
	@echo "  make check      node --check (валидность extension.js)"
	@echo "  make status     состояние: исходник vs установленная копия (diff)"
	@echo "  make package    собрать .vsix (в песочнице, node 20)"
	@echo "  make reload     подсказка: Reload Window в VSCode"
	@echo ""

install: plugin_vscode-opencode_vpn-install

## plugin_vscode-opencode_vpn-install: синхронизировать установленную копию
plugin_vscode-opencode_vpn-install:
	@test -d "$(EXT)" || { echo "нет установленной копии $(EXT)"; exit 1; }
	rsync -a --delete \
		--exclude='.git' --exclude='.gitignore' --exclude='.vscodeignore' \
		--exclude='.vsixmanifest' --exclude='readme.md' --exclude='LICENSE.txt' \
		--exclude='Makefile' --exclude='README.md' --exclude='MARKETPLACE.md' \
		--exclude='todo.md' --exclude='*.vsix' --exclude='LICENSE' --exclude='docs' \
		"$(SRC)/" "$(EXT)/"
	@echo "→ установленная копия обновлена: $(EXT)"

check: plugin_vscode-opencode_vpn-check

## plugin_vscode-opencode_vpn-check: валидность extension.js
plugin_vscode-opencode_vpn-check:
	@node --check "$(SRC)/dist/extension.js" && echo "node --check OK"

status: plugin_vscode-opencode_vpn-status

## plugin_vscode-opencode_vpn-status: diff исходник vs установленная копия
plugin_vscode-opencode_vpn-status:
	@PY_PKG=$$(python3 -c "import json; a=json.load(open('$(SRC)/package.json')); a.pop('__metadata',None); b=json.load(open('$(EXT)/package.json')); b.pop('__metadata',None); print('OK' if a==b else 'DIFF')" 2>/dev/null); \
	if diff -rq --exclude=.git --exclude=.gitignore --exclude=.vscodeignore \
		--exclude=.vsixmanifest --exclude=readme.md --exclude=LICENSE.txt \
		--exclude=Makefile --exclude=README.md --exclude=MARKETPLACE.md \
		--exclude=todo.md --exclude='*.vsix' --exclude=LICENSE --exclude=docs "$(SRC)" "$(EXT)" >/dev/null 2>&1 \
		&& [ "$$PY_PKG" = "OK" ]; then \
		echo "✓ копии идентичны (package.json, dist/, images/)"; \
	else \
		echo "⚠ копии отличаются (исходник vs $(EXT)):"; \
		diff -rq --exclude=.git --exclude=.gitignore --exclude=.vscodeignore \
			--exclude=.vsixmanifest --exclude=readme.md --exclude=LICENSE.txt \
			--exclude=Makefile --exclude=README.md --exclude=MARKETPLACE.md \
			--exclude=todo.md --exclude='*.vsix' --exclude=LICENSE --exclude=docs "$(SRC)" "$(EXT)"; \
		[ "$$PY_PKG" = "OK" ] || echo "package.json: отличается только __metadata (VSCode) или реальная разница — проверь"; \
	fi

reload: plugin_vscode-opencode_vpn-reload

## plugin_vscode-opencode_vpn-reload: подсказка по перезагрузке VSCode
plugin_vscode-opencode_vpn-reload:
	@echo "В VSCode: Developer: Reload Window (Ctrl+Shift+P → Reload Window)"

package: plugin_vscode-opencode_vpn-package

## plugin_vscode-opencode_vpn-package: собрать .vsix в песочнице (node 20)
plugin_vscode-opencode_vpn-package:
	@test -d "$(SRC)/.git" || { echo "нет git-каталога $(SRC)"; exit 1; }
	@rm -rf /tmp/opencode/vsix-src && mkdir -p /tmp/opencode/vsix-src
	@rsync -a --exclude=.git --exclude=docs "$(SRC)/" /tmp/opencode/vsix-src/
	@docker exec sandbox bash -lc 'rm -rf /tmp/vsix-src' && \
		docker cp /tmp/opencode/vsix-src/. sandbox:/tmp/vsix-src
	@docker exec sandbox bash -lc \
		'test -d /tmp/vsce-build/node_modules/.bin || { cd /tmp/vsce-build && npm install @vscode/vsce --no-save --silent; }; \
		 cd /tmp/vsix-src && rm -f *.vsix && \
		 /tmp/vsce-build/node_modules/.bin/vsce package --out "$(VSIX)" --readme-path MARKETPLACE.md'
	@docker cp sandbox:/tmp/vsix-src/$(VSIX) "$(SRC)/"
	@echo "→ собран $(SRC)/$(VSIX)"

.PHONY: help install check status reload package \
	plugin_vscode-opencode_vpn-install plugin_vscode-opencode_vpn-check \
	plugin_vscode-opencode_vpn-status plugin_vscode-opencode_vpn-reload \
	plugin_vscode-opencode_vpn-package