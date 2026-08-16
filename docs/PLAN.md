# Plan del Sistema — Asistente Personal

## Visión general

Un asistente de voz/texto en el móvil que controla la Mac remota ejecutando
comandos reales (terminal, Finder, UI) usando un LLM para interpretar la
intención del usuario.

## Componentes en detalle

### 1. App Móvil (React Native)

- Pantalla de chat (texto / voz opcional).
- Conexión WebSocket segura con JWT.
- Recibe streaming de tokens y stdout de la Mac.
- Solicita confirmación para acciones destructivas.

### 2. Hub (VPS)

- **FastAPI** expone REST (`/auth`, `/history`) y WebSocket (`/ws/app`, `/ws/mac`).
- **Redis** como capa de estado y **Pub/Sub** para enrutar mensajes:
  - `ws/app` → publica en canal del dispositivo.
  - daemon Mac suscrito al canal privado.
- **Nginx + Certbot** para TLS y proxy reverso.
- Persistencia de historial.

### 3. Daemon (Mac)

- Proceso `python` en segundo plano (launchd).
- Escucha `wss://api.tudominio.com/ws/mac`.
- **LangGraph** orquesta el agente (grafo de pasos y herramientas).
- **LiteLLM** unifica el LLM:
  - **Ollama local** (gratis, sin conexión).
  - **Claude / GPT-4o** (cloud, mejor razonamiento).
- Herramientas:
  - `Bash` → comandos de terminal.
  - `AppleScript / JXA` → controlar Finder, Safari, apps, UI.
- Envía stdout y stream de tokens de vuelta al VPS.

## Seguridad

- JWT para autenticar la app.
- **Token de dispositivo** por canal WebSocket (cada Mac tiene su token).
- Confirmación del usuario para comandos peligrosos.
- El daemon no expone puertos; solo conexión saliente al Hub.

## Fases

1. **Fase 1** — Hub mínimo: WS + Redis Pub/Sub + echo.
2. **Fase 2** — Daemon: conexión WS, ejecutar Bash, responder.
3. **Fase 3** — LangGraph + LiteLLM + Ollama.
4. **Fase 4** — App móvil con chat y streaming (React Native).
5. **Fase 5** — AppleScript/JXA, voz, notificaciones, despliegue con HTTPS.

## Stack resumido

| Capa | Tecnología |
|------|------------|
| Mobile | React Native |
| Hub | FastAPI + Redis + Nginx + Certbot |
| Daemon | Python + LangGraph + LiteLLM + Ollama |
| Modelos | Ollama (local) / Claude / GPT-4o |