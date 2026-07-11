#!/usr/bin/env bash
set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIMI1_PATH="$REPO_DIR/bin/kimi1.js"

# Ensure Node.js dependencies are installed
if [ ! -d "$REPO_DIR/node_modules" ]; then
  echo "Instalando dependencias de Node.js..."
  (cd "$REPO_DIR" && npm install)
  echo "Dependencias instaladas."
else
  echo "Dependencias ya instaladas."
fi

SHELL_RC=""
if [ -n "$ZSH_VERSION" ] || [ "$SHELL" = "/bin/zsh" ]; then
  SHELL_RC="$HOME/.zshrc"
elif [ -n "$BASH_VERSION" ] || [ "$SHELL" = "/bin/bash" ]; then
  if [ -f "$HOME/.bashrc" ]; then
    SHELL_RC="$HOME/.bashrc"
  else
    SHELL_RC="$HOME/.bash_profile"
  fi
else
  SHELL_RC="$HOME/.profile"
fi

# Migrate official Kimi sessions so --history shows everything from day one
echo "Migrando historial de sesiones oficiales..."
node "$KIMI1_PATH" --migrate-history

if [ ! -f "$SHELL_RC" ]; then
  touch "$SHELL_RC"
fi

BACKUP="$SHELL_RC.kimi1-backup-$(date +%Y%m%d%H%M%S)"
cp "$SHELL_RC" "$BACKUP"
echo "Backup creado: $BACKUP"

if ! grep -q "alias kimi1=" "$SHELL_RC" 2>/dev/null; then
  {
    echo ""
    echo "# kimi1 alias"
    echo "alias kimi1='node \"$KIMI1_PATH\"'"
  } >> "$SHELL_RC"
  echo "Alias 'kimi1' anadido a: $SHELL_RC"
else
  echo "Alias 'kimi1' ya existe en: $SHELL_RC"
fi

echo ""
echo "Instalacion completa."
echo "Recarga tu shell con: source $SHELL_RC"
echo "Luego usa: kimi1 --help"
echo "Para redirigir tambien 'kimi' -> 'kimi1', ejecuta: kimi1 --enable-kimi"
