# Makefile проекта VSCode-плагина opencode-vpn.
# Плагин — самостоятельный проект; vpn-проект (~/.config/vpn) — внешняя
# зависимость (скрипты запуска живут там).
# Цели с префиксом plugin_vscode-opencode_vpn- — для вызова через диспетчер
# ~/.config (`make plugin_vscode-opencode_vpn-<цель>`).

SHELL := /bin/bash
SRC := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
EXT := $(HOME)/.vscode/extensions/alex.opencode-vpn-0.0.2

.DEFAULT_GOAL := help

## help: список команд проекта
help:
	@echo "Проект VSCode-плагина alex.opencode-vpn."
	@echo ""
	@echo "  make install    синхронизировать установленную копию (~/.vscode/extensions)"
	@echo "  make check      node --check (валидность extension.js)"
	@echo "  make status     состояние: исходник vs установленная копия (diff)"
	@echo "  make reload     подсказка: Reload Window в VSCode"
	@echo ""
	@echo "Через диспетчер ~/.config: make plugin_vscode-opencode_vpn-<цель>"

install: plugin_vscode-opencode_vpn-install

## plugin_vscode-opencode_vpn-install: синхронизировать установленную копию
plugin_vscode-opencode_vpn-install:
	@test -d "$(EXT)" || { echo "нет установленной копии $(EXT)"; exit 1; }
	rsync -a --delete \
		--exclude='.git' --exclude='.gitignore' \
		--exclude='Makefile' --exclude='README.md' \
		"$(SRC)/" "$(EXT)/"
	@echo "→ установленная копия обновлена: $(EXT)"

check: plugin_vscode-opencode_vpn-check

## plugin_vscode-opencode_vpn-check: валидность extension.js
plugin_vscode-opencode_vpn-check:
	@node --check "$(SRC)/dist/extension.js" && echo "node --check OK"

status: plugin_vscode-opencode_vpn-status

## plugin_vscode-opencode_vpn-status: diff исходник vs установленная копия
plugin_vscode-opencode_vpn-status:
	@if diff -rq --exclude=.git --exclude=.gitignore \
		--exclude=Makefile --exclude=README.md "$(SRC)" "$(EXT)" >/dev/null 2>&1; then \
		echo "✓ копии идентичны (package.json, dist/, images/)"; \
	else \
		echo "⚠ копии отличаются (исходник vs $(EXT)):"; \
		diff -rq --exclude=.git --exclude=.gitignore \
			--exclude=Makefile --exclude=README.md "$(SRC)" "$(EXT)"; \
	fi

reload: plugin_vscode-opencode_vpn-reload

## plugin_vscode-opencode_vpn-reload: подсказка по перезагрузке VSCode
plugin_vscode-opencode_vpn-reload:
	@echo "В VSCode: Developer: Reload Window (Ctrl+Shift+P → Reload Window)"

.PHONY: help install check status reload \
	plugin_vscode-opencode_vpn-install plugin_vscode-opencode_vpn-check \
	plugin_vscode-opencode_vpn-status plugin_vscode-opencode_vpn-reload