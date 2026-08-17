# Terminal Remoto de la Mac

Expose el terminal real (`zsh`) de la Mac por WebSocket, para acceder desde el
celular (Termux) usando el hub como relé.

## Estructura

```text
daemon/
├── term_server.py   # PTY real + servidor WS local (:8766) + puente al hub
├── config.py        # configuración desde .env
└── .env             # HUB_WS_URL, DEVICE_TOKEN, TERM_TOKEN
```

## Puesta en marcha

```bash
cd daemon
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python term_server.py
```

## Vías de acceso

- **Wi-Fi**: `ws://<IP-de-la-Mac>:8766/term?token=TERM_TOKEN`
- **Nube**: el puente se conecta a `HUB_WS_URL` y desde el celular:
  ```sh
  websocat -b "wss://agentrelay.duckdns.org/ws/term?token=<DEVICE_TOKEN>&device=<DEVICE_TOKEN>"
  ```

## Seguridad

- El daemon solo hace conexión **saliente** al hub; el acceso local usa `TERM_TOKEN`.
- El hub exige `DEVICE_TOKEN` (o JWT de app) para el relé.