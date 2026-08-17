# API y WebSocket

Base URL: `https://agentrelay.duckdns.org`

## REST (FastAPI Hub)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/health` | Estado del hub |
| `POST` | `/auth/login` | Devuelve JWT de app (cuerpo: `{"token": "<APP_TOKEN>"}`) |
| `POST` | `/auth/device` | Devuelve JWT de dispositivo (cuerpo: `{"token": "<DEVICE_TOKEN>"}`) |

## WebSocket: terminal remoto

El hub es un relé de bytes entre el terminal de la Mac y el cliente (Termux).

| Endpoint | Uso |
|----------|-----|
| `wss://agentrelay.duckdns.org/ws/term` | El cliente escribe/lee el terminal (`?token=<DEVICE_TOKEN>&device=<DEVICE_TOKEN>`) |
| `wss://agentrelay.duckdns.org/ws/mac/term` | El daemon de la Mac publica/recibe los bytes del PTY (Bearer con `DEVICE_TOKEN`) |

### Mensajes del terminal

- **Binarios**: datos del terminal (salida de la shell / input del usuario).
- **Texto** (JSON de control):
  - `{"type":"status","state":"connected|offline"}` del hub al cliente.
  - `{"type":"resize","cols":C,"rows":R}` del cliente al daemon para redimensionar el PTY.

## WebSocket: túnel TCP (SSH / SCP / SFTP)

Permite enrutar SSH (y por tanto `scp`/`sftp`) entre el celular y la Mac a través
del hub, sin puerto abierto en la Mac.

| Endpoint | Uso |
|----------|-----|
| `wss://agentrelay.duckdns.org/ws/tcp` | El cliente conecta un túnel TCP (`?token=<DEVICE_TOKEN>&device=<DEVICE_TOKEN>`) |
| `wss://agentrelay.duckdns.org/ws/mac/tcp` | El daemon publica el túnel y lo conecta a `127.0.0.1:22` (sshd) |

### Protocolo

- Multiplexado por `conn_id`: el hub asigna un id por conexión de cliente y
  reenvía los bytes hacia/desde el daemon enmarcados en JSON base64.
- Varias sesiones SSH pueden estar abiertas a la vez.
- Al cerrar el WebSocket del cliente, el daemon cierra el TCP correspondiente
  (la sesión SSH termina limpia).

### Configuración de Termux (`~/.ssh/config`)

```
Host mac
  HostName mac
  User <usuario_mac>
  ServerAliveInterval 60
  ServerAliveCountMax 3
  ProxyCommand websocat -b --no-line --ping-interval 20 "wss://agentrelay.duckdns.org/ws/tcp?token=<DEVICE_TOKEN>&device=<DEVICE_TOKEN>"
```

Con esto funcionan `ssh mac`, `scp <archivo> mac:~/inbox/` y
`scp mac:~/outbox/<archivo> .` sin configuración adicional.

## Ejemplo desde Termux (terminal)

```sh
websocat -b "wss://agentrelay.duckdns.org/ws/term?token=<DEVICE_TOKEN>&device=<DEVICE_TOKEN>"
```