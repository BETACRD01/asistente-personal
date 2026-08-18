# AgentRelay Desktop

App de escritorio del **terminal remoto de la Mac** (via el hub
`agentrelay.duckdns.org`). Funciona en **Windows, Linux y macOS**.

La app **incluye el servidor integrado**: al conectar, abre el terminal (PTY) y
el túnel TCP/SSH hacia el hub desde dentro de la app (no hace falta el daemon de
Python ni un servicio aparte). En Windows el PTY también funciona (ConPTY).

## Requisitos

- [Node.js](https://nodejs.org) (>= 18)

## Instalación y uso

```bash
cd desktop
npm install
npm run build:mac   # o: npm start para desarrollo
```

Pega tu `DEVICE_TOKEN` y pulsa **Conectar**. El token se usa también como
`device` (igual que en Termux). Al cerrar la app se desconecta el servidor.

> Si el daemon de Python (`term_server.py`, servicio `com.agentrelay.term`)
> también está corriendo con el **mismo token**, compite con la app por el hub
> (gana el último que conecte). Para usar la app como servidor, para el daemon:
> `launchctl unload ~/Library/LaunchAgents/com.agentrelay.term.plist` (o usa un
> token distinto por máquina).

## Acceso

| Cliente | Cómo |
|---------|------|
| **Esta app** | `npm start` o `AgentRelay.app` (escritorio, servidor integrado) |
| **Termux (celular)** | `ssh mac` (túnel por el hub) |
| **Navegador** | `https://agentrelay.duckdns.org/term` |

## Notas

- No se suben tokens al repo: quedan solo en el almacenamiento local de la app.
- En Windows, para que `ssh`/`scp`/`sftp` lleguen a esa máquina, activa el
  **servidor OpenSSH** de Windows (puerto 22) y pon ese puerto en el campo SSH.