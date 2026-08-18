# AgentRelay Desktop

Cliente de escritorio del **terminal remoto de la Mac** (via el hub
`agentrelay.duckdns.org`). Funciona en **Windows, Linux y macOS**.

## Requisitos

- [Node.js](https://nodejs.org) (>= 18)

## Instalación y uso

```bash
cd desktop
npm install
npm start
```

Se abre la app; pega tu `DEVICE_TOKEN` y pulsa **Conectar**. El token se usa
también como `device` (igual que en Termux).

## Acceso

| Cliente | Cómo |
|---------|------|
| **Esta app** | `npm start` (escritorio) |
| **Termux (celular)** | `ssh mac` (túnel por el hub) |
| **Navegador** | `https://agentrelay.duckdns.org/term` |

## Notas

- En Windows el daemon de la Mac solo expone el túnel SSH; el terminal de esta
  app usa el relé de terminal del hub (`/ws/term`), que en Windows no está
  disponible. Para Windows el flujo recomendado es `ssh`/`scp`/`sftp`.
- No se suben tokens al repo: quedan solo en el almacenamiento local de la app.