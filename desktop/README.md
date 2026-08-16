# AgentRelay — UI local del asistente de desarrollo

Aplicación de escritorio (React + Vite, lista para envolver en Tauri) que se
conecta al daemon local de la Mac (`127.0.0.1:8765`) para chatear, ejecutar
tareas y elegir proveedor de IA.

## Requisitos

- El daemon corriendo (ver `../daemon`):
  ```bash
  cd ../daemon && .venv/bin/python main.py
  ```
- Node.js 20+ (para esta UI).

## Uso

```bash
npm install
npm run dev      # desarrollo (http://localhost:5173)
npm run build    # build de producción (dist/)
npm run preview  # sirve el build (http://localhost:4173)
```

## Características

- **Login por proveedor**: Gemini (free tier con API key), Ollama (local),
  OpenAI, Claude, Groq y OpenRouter.
- **Garantía free**: Vertex AI (tu cuenta cloud con billing) está bloqueado
  desde la UI. Solo se pueden usar proveedores gratuitos o tus propias keys
  de pago.
- **Escaneo de modelos**: `/api/probe` prueba 1 token por modelo y muestra
  disponibilidad + el mejor modelo gratuito.
- **Chat streaming** estilo Claude Code: respuestas del agente con cursor, ejecución
  de herramientas en la Mac (bash/applescript) y estado en vivo.

## API local del daemon (127.0.0.1:8765)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/config` | Proveedor/modelo/modo actuales |
| GET | `/api/probe` | Escaneo de modelos (~30s) |
| POST | `/api/configure` | Cambiar proveedor (+ key opcional) |
| WS | `/ws` | Chat streaming (token/stdout/done) |

## App nativa (Tauri)

La UI ya está envuelta en Tauri (Rust). El binario vive en
`src-tauri/target/release/bundle/`.

```bash
npm run tauri dev      # ventana nativa en desarrollo
npm run tauri build    # genera AgentRelay.app y el .dmg
```

> La ventana se conecta al daemon local (`127.0.0.1:8765`); asegúrate de tener
> `python main.py` corriendo antes de abrir la app.