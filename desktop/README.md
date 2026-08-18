# AgentRelay Desktop

App de escritorio del **terminal remoto de la Mac** (via el hub
`agentrelay.duckdns.org`). Funciona en **Windows, Linux y macOS**.

La app puede **servir** el terminal/túnel de esta máquina (marcar *Servir esta
máquina*) o actuar solo como **cliente**: ver el terminal propio o **Buscar
máquinas** para conectarse al terminal de otra máquina registrada en el hub.

**Código de máquina (tipo AnyDesk):** cada app muestra su *código* (su
`DEVICE_TOKEN`). Para conectarte a otra máquina puedes escribir su código en
*Conectar a código* o elegirla de *Buscar máquinas*. El hub le avisa a la
máquina remota y **esa máquina decide**: sale una ventana *¿Permitir
conexión?* con Aceptar/Rechazar.

Modo recomendado: el **daemon de Python** (`term_server.py`, servicio
`com.agentrelay.term`) queda corriendo 24/7 para que el celular entre por
`ssh mac`; la app se usa como cliente con *Servir esta máquina* **desmarcado**
(evita competir con el daemon por el mismo token). El daemon auto-acepta las
peticiones (sin interfaz).

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
> (gana el último que conecte). Por eso, en modo cliente, deja *Servir esta
> máquina* desmarcado. Si quieres que la app sea el servidor, para el daemon:
> `launchctl unload ~/Library/LaunchAgents/com.agentrelay.term.plist`.

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