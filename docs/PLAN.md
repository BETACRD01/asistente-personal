# Plan del Sistema — Terminal Remoto (Termux ↔ Mac)

## Visión general

Controlar el **terminal real de la Mac** desde el celular, desde cualquier red.
El cliente es **Termux** (Android) y el acceso pasa por un **hub en la nube** que
enruta el tráfico (terminal y SSH) entre el celular y la Mac. No hay app propia
ni agente de IA embebido: se usa `ssh`/`scp`/`sftp` desde Termux y `opencode`
(en la Mac) para tareas de IA.

## Arquitectura

```
Termux (celular)
  ├─ ssh / scp / sftp  (openssh)
  └─ websocat  →  WebSocket al hub
                        │
                        ▼
          Hub en la nube (FastAPI, relé en memoria)
                        │  WebSocket
                        ▼
          Daemon en la Mac (term_server.py, bajo launchd)
                        ├─ PTY real (zsh)  →  terminal remoto
                        └─ túnel TCP → sshd local (127.0.0.1:22)
                                        → SSH / SCP / SFTP
```

## Componentes

### 1. Cliente (Termux en el celular)

- `websocat` + `openssh` (cliente).
- `~/.ssh/config` define `Host mac` con `ProxyCommand` que enruta por el hub;
  `ssh mac`, `scp` y `sftp` reutilizan esa misma config.
- Clave pública de Termux instalada en la Mac (`ssh-copy-id`) para entrar sin
  contraseña.

### 2. Hub (VPS)

- **FastAPI**, relé **en memoria** (sin Redis): terminal y túnel TCP.
- REST: `/auth/login`, `/auth/device`, `/health`.
- WebSocket:
  - `/ws/term` ↔ `/ws/mac/term`: relé de bytes del terminal (PTY de la Mac).
  - `/ws/tcp` ↔ `/ws/mac/tcp`: túnel TCP multiplexado (SSH/SCP/SFTP).
- **Nginx + Certbot** para TLS y proxy reverso.
- Despliegue automático desde GitHub Actions (push a `main` con cambios en `hub/`).

### 3. Daemon (Mac)

- `term_server.py`: PTY real (`zsh`) en `:8766` (red local) + puentes al hub:
  - `hub_bridge()` → `/ws/mac/term` (terminal).
  - `tcp_bridge()` → `/ws/mac/tcp` (reenvía a `127.0.0.1:22`, multiplexado por `conn_id`).
- Corriendo como **servicio de macOS** (`com.agentrelay.term`, launchd):
  arranca al encender la Mac y se reinicia solo si se cae.

## Transferencia de archivos (SFTP/SCP por el túnel)

| Dirección | Comando (en Termux) |
|-----------|---------------------|
| Celular → Mac | `scp <archivo> mac:~/inbox/` |
| Mac → Celular | `scp mac:~/outbox/<archivo> ~/storage/shared/Download/` |

- Carpetas en la Mac: `~/inbox` (lo que envía el celular) y `~/outbox`
  (lo que devuelve el agente).
- Para acceder a las fotos del celular: `termux-setup-storage` y usar
  `~/storage/shared/DCIM/...`.
- Ejemplo con IA en la Mac:
  `opencode run -f ~/inbox/foto.jpg "analiza esta imagen"` y el resultado se
  deja en `~/outbox/`.
- Para uso desde Termux se recomienda `OPENCODE_DISABLE_MOUSE=true` (evita
  basura ANSI y problemas con el teclado).

## Seguridad

- Cliente WebSocket autentica con su `DEVICE_TOKEN` (parámetros `token` y `device`).
- SSH real cifrado entre celular y Mac (clave pública de Termux).
- **No subir tokens ni `.env` al repositorio** (es **público** en GitHub).
- Tokens solo en `.env` local (gitignored) con respaldo en iCloud.

## Mantenimiento de la Mac despierta (pantalla cerrada)

- `pmset`: `sleep 0` (AC y batería), `displaysleep 0` (AC), `disablesleep 1` (AC).
- `sshd`: `ClientAliveInterval 60`, `ClientAliveCountMax 4` (latidos del servidor).
- En Termux: activar *Acquire wakelock* para que Android no suspenda la sesión.

## Fases

1. **Hecho** — Hub relé de terminal (WebSocket, en memoria).
2. **Hecho** — Daemon: PTY real + puente al hub.
3. **Hecho** — Túnel TCP para SSH (multiplexado por conexión).
4. **Hecho** — Termux: `ssh`/`scp`/`sftp` por el túnel; servicio launchd; Mac sin sueño.
5. **Hecho** — Transferencia de archivos SFTP/SCP con carpetas `~/inbox` y `~/outbox`.
6. **Opcional** — Voz, notificaciones, sincronización automática de carpetas.

## Stack resumido

| Capa | Tecnología |
|------|------------|
| Cliente | Termux + websocat + openssh |
| Hub | FastAPI + Nginx + Certbot (relé en memoria) |
| Daemon | Python + PTY (zsh) + launchd |
| Archivos | SFTP/SCP sobre el túnel SSH |