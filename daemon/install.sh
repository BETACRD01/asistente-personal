#!/usr/bin/env bash
# Instalador del daemon (term_server.py) para Linux y macOS.
# Uso:  bash install.sh
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"
echo "== daemon dir: $DIR"

PY=python3
command -v "$PY" >/dev/null || { echo "error: se necesita python3"; exit 1; }
"$PY" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' \
  || { echo "error: python >= 3.10 requerido"; exit 1; }

if [ ! -d .venv ]; then
  echo "== creando .venv"
  "$PY" -m venv .venv
fi
echo "== instalando dependencias"
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r requirements.txt

if [ ! -f .env ]; then
  echo "== generando .env (tokens nuevos)"
  DEV="$(".venv/bin/python" -c 'import secrets; print(secrets.token_urlsafe(32))')"
  TERM="$(".venv/bin/python" -c 'import secrets; print(secrets.token_urlsafe(16))')"
  {
    echo "HUB_WS_URL=wss://agentrelay.duckdns.org/ws/mac"
    echo "DEVICE_TOKEN=$DEV"
    echo "TERM_TOKEN=$TERM"
  } > .env
  chmod 600 .env
  echo
  echo "=============================================================="
  echo "  NUEVO DEVICE_TOKEN de esta maquina (guardalo):"
  echo "  $DEV"
  echo
  echo "  REGISTRALO en el hub: anade este token a DEVICE_TOKENS"
  echo "  (secret del workflow .github/workflows/deploy.yml, o a la"
  echo "  lista device_tokens del .env en la VM del hub)."
  echo "  Sin eso, el hub rechazara la conexion (403)."
  echo "=============================================================="
  echo
else
  echo "== .env ya existe (no lo toco)"
fi

OS="$(uname -s)"
case "$OS" in
  MINGW*|MSYS*|CYGWIN*)
    echo
    echo "== Windows detectado. En Windows usa el lanzador:"
    echo "   run_windows.bat   (doble clic o desde cmd)"
    echo "== (ahora con soporte PTY instalando pywinpty en requirements.txt)"
    exit 0
    ;;
esac
if [ "$OS" = "Linux" ]; then
  UNIT="$HOME/.config/systemd/user/agentrelay-term.service"
  mkdir -p "$(dirname "$UNIT")"
  cat > "$UNIT" <<EOF
[Unit]
Description=AgentRelay daemon (terminal + tunel SSH de la Mac)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$DIR
ExecStart=$DIR/.venv/bin/python $DIR/term_server.py
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable --now agentrelay-term.service
  systemctl --user status agentrelay-term.service --no-pager | head -6
elif [ "$OS" = "Darwin" ]; then
  PLIST="$HOME/Library/LaunchAgents/com.agentrelay.term.plist"
  mkdir -p "$(dirname "$PLIST")"
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key><string>com.agentrelay.term</string>
	<key>ProgramArguments</key>
	<array>
		<string>$DIR/.venv/bin/python</string>
		<string>$DIR/term_server.py</string>
	</array>
	<key>WorkingDirectory</key><string>$DIR</string>
	<key>RunAtLoad</key><true/>
	<key>KeepAlive</key><true/>
	<key>StandardOutPath</key><string>/tmp/term.log</string>
	<key>StandardErrorPath</key><string>/tmp/term.log</string>
	<key>ProcessType</key><string>Interactive</string>
</dict>
</plist>
EOF
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load -w "$PLIST"
  echo "== servicio launchd instalado: com.agentrelay.term"
else
  echo "== SO sin auto-arranque soportado ($OS); ejecuta manualmente:"
  echo "   .venv/bin/python term_server.py"
fi

echo
echo "== listo. Logs en /tmp/term.log"
