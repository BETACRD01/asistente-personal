#!/bin/bash
# Abre la sesion compartida 'agent' en la Terminal nativa de la Mac.
# La misma sesion la ven en espejo los clientes remotos (app / celular).

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux no esta instalado: brew install tmux"
  exit 1
fi

# Crea la sesion en segundo plano si no existe
tmux new-session -d -s agent 2>/dev/null

# Abre (o enfoca) una ventana de Terminal.app pegada a la sesion
if tmux has-session -t agent 2>/dev/null; then
  osascript -e 'tell application "Terminal" to do script "tmux attach -t agent"'
  osascript -e 'tell application "Terminal" to activate'
fi