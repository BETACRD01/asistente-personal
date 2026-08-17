# Plan del Sistema — Asistente Personal

## Visión general

Controlar la Mac desde el celular ejecutando comandos en su terminal real, y usar
los agentes de IA (`agent`, codex, etc.) configurados en su shell. El cliente es
**Termux** (Android); el acceso funciona desde cualquier red mediante el hub en la
nube.

## Componentes en detalle

### 1. Cliente (Termux en el celular)

- `websocat` conecta al hub por WebSocket y da acceso al terminal real de la Mac.
- No hay app propia: se configura Termux (Play Store) con la URL del relé.

### 2. Hub (VPS)

- **FastAPI** expone REST (`/auth/login`, `/auth/device`, `/health`) y WebSocket.
- Relé de terminal en memoria (sin Redis): `ws/mac/term` (daemon) ↔ `ws/term` (cliente).
- Cliente autentica con JWT de app o con el `DEVICE_TOKEN` directamente.
- **Nginx + Certbot** para TLS y proxy reverso.

### 3. Daemon (Mac)

- `daemon/local_api.py` + `daemon/cli.py`: asistente `agent` en la shell.
- `daemon/term_server.py`: expone el PTY real (`zsh`) en `:8766` (Wi-Fi) y se
  conecta al hub (`/ws/mac/term`) para acceso desde cualquier red.
- **OpenRouter** como proveedor de LLM (modelos `:free`), con respaldo OAuth (Gemini).

## Seguridad

- JWT para autenticar al cliente (o `DEVICE_TOKEN` directo en el relé).
- `DEVICE_TOKEN` por dispositivo (cada Mac tiene el suyo).
- Confirmación del usuario para comandos peligrosos en el CLI.

## Fases

1. **Hecho** — Hub mínimo: WS + relé de terminal (FastAPI, en memoria).
2. **Hecho** — Daemon: terminal PTY real + puente al hub.
3. **Hecho** — CLI `agent` con LLM (OpenRouter `:free`).
4. **En curso** — Despliegue del hub actualizado en el VPS; configuración de Termux.
5. **Opcional** — AppleScript/JXA, voz, notificaciones.

## Stack resumido

| Capa | Tecnología |
|------|------------|
| Cliente | Termux + websocat |
| Hub | FastAPI + Nginx + Certbot |
| Daemon | Python + PTY (zsh) |
| Modelos | OpenRouter (`:free`) / Gemini (respaldo) |