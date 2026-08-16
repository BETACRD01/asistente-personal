# API y WebSocket

Base URL (pendiente): `https://api.tudominio.com`

## REST (FastAPI Hub)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/auth/login` | Devuelve JWT |
| `GET` | `/history` | Historial de conversación |
| `GET` | `/devices` | Dispositivos (Macs) registrados |
| `POST` | `/commands` | Enviar un comando a un dispositivo (fallback REST) |

## WebSocket

| Endpoint | Uso |
|----------|-----|
| `wss://api.tudominio.com/ws/app` | La app móvil envía mensajes y recibe streaming |
| `wss://api.tudominio.com/ws/mac` | El daemon de la Mac recibe comandos y responde |

### Handshake

- Conexión autenticada con JWT en `Authorization` o query param.
- El daemon se identifica con su **token de dispositivo**.

### Mensajes (JSON)

```jsonc
// App → Hub (comando)
{ "type": "command", "text": "abre safari", "device": "mac-01" }

// Hub → Daemon (reenvío)
{ "type": "command", "id": "msg_123", "text": "abre safari" }

// Daemon → Hub (stream)
{ "type": "token", "id": "msg_123", "content": "Voy a" }
{ "type": "stdout", "id": "msg_123", "content": "Safari abierto" }
{ "type": "done", "id": "msg_123" }
{ "type": "error", "id": "msg_123", "message": "..." }
```

## Enrutamiento (Redis Pub/Sub)

- Canal por dispositivo: `device:{token}`.
- El Hub publica los mensajes de la app en el canal del dispositivo.
- El daemon está suscrito a su canal y responde al Hub vía Pub/Sub de vuelta.