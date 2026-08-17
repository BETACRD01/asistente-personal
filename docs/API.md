# API y WebSocket

Base URL: `https://agentrelay.duckdns.org`

## REST (FastAPI Hub)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/health` | Estado del hub |
| `POST` | `/auth/login` | Devuelve JWT de app (cuerpo: `{"token": "<APP_TOKEN>"}`) |
| `POST` | `/auth/device` | Devuelve JWT de dispositivo (cuerpo: `{"token": "<DEVICE_TOKEN>"}`) |

## WebSocket (terminal remoto)

El hub es un relé de bytes entre el terminal de la Mac y el cliente (Termux/app).

| Endpoint | Uso |
|----------|-----|
| `wss://agentrelay.duckdns.org/ws/term` | El cliente escribe/lee el terminal (`?token=<jwt o device token>&device=<DEVICE_TOKEN>`) |
| `wss://agentrelay.duckdns.org/ws/mac/term` | El daemon de la Mac publica/recibe los bytes del PTY (Bearer con `DEVICE_TOKEN`) |

### Handshake

- Cliente: JWT de app (de `/auth/login`) **o** el `DEVICE_TOKEN` directamente, más el parámetro `device`.
- Daemon: se identifica con su **token de dispositivo** (Bearer).

### Mensajes

- **Binarios**: datos del terminal (salida de la shell / input del usuario).
- **Texto** (JSON de control):
  - `{"type":"status","state":"connected|offline"}` del hub al cliente.
  - `{"type":"resize","cols":C,"rows":R}` del cliente al daemon para redimensionar el PTY.

### Ejemplo desde Termux

```sh
websocat -b "wss://agentrelay.duckdns.org/ws/term?token=<DEVICE_TOKEN>&device=<DEVICE_TOKEN>"
```