# Asistente Personal

Asistente IA móvil que controla tu Mac de forma remota y segura, hablando en lenguaje natural.

<p align="center">
  <a href="https://github.com/BETACRD01/asistente-personal/actions/workflows/deploy.yml">
    <img src="https://github.com/BETACRD01/asistente-personal/actions/workflows/deploy.yml/badge.svg" alt="Deploy Status" />
  </a>
  <img src="https://img.shields.io/badge/Hub-FastAPI-009688.svg?style=flat&logo=fastapi" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Daemon-Python-3776AB.svg?style=flat&logo=python" alt="Python" />
  <img src="https://img.shields.io/badge/Mobile-React_Native-61DAFB.svg?style=flat&logo=react" alt="React Native" />
</p>

## Arquitectura

```text
[ App Móvil (React Native) ]
       │
       │ HTTPS / WSS (Auth JWT + Streaming)
       ▼
[ VPS en la Nube (Ubuntu + Nginx + Certbot + FastAPI Hub + Redis) ]
       │  • Expone: https://api.tudominio.com y wss://api.tudominio.com/ws/app
       │  • Persiste historial, gestiona auth y enruta mensajes por Redis Pub/Sub
       │
       │ WebSocket Seguro (Canal Privado con Token de Dispositivo)
       ▼
[ Tu Mac (Daemon Worker en Python + LangGraph/LiteLLM) ]
       │  • Escucha en: wss://api.tudominio.com/ws/mac
       │  • Ejecuta Ollama local (Gratis) o APIs Cloud (Claude / GPT-4o)
       │  • Ejecuta comandos Bash (Terminal) y AppleScript/JXA (UI/Finder)
       │  • Envía stdout / stream de tokens de vuelta al VPS
```

## Componentes

| Componente | Tecnología | Rol |
|------------|------------|-----|
| `mobile/` | React Native | UI para el usuario; envía comandos y recibe respuestas en streaming |
| `hub/` | FastAPI + Redis | Servidor central: auth JWT, historial, enrutamiento WS por Pub/Sub |
| `daemon/` | Python + LangGraph + LiteLLM | Agente en la Mac: decide y ejecuta acciones locales (Bash, AppleScript/JXA) |

## Flujo de una petición

1. El usuario escribe "abre Safari y busca recetas" en la app.
2. La app envía el mensaje por `wss://api.tudominio.com/ws/app` (JWT).
3. El Hub valida el token, guarda en Redis y reenvía al canal del dispositivo por Pub/Sub.
4. El daemon en la Mac recibe el mensaje, lo procesa con LangGraph + LLM y ejecuta las herramientas (Bash / AppleScript).
5. El daemon transmite stdout / tokens de vuelta al Hub → la app en tiempo real.

## Documentación

- [docs/PLAN.md](docs/PLAN.md) — plan completo del sistema
- [docs/CLOUD.md](docs/CLOUD.md) — cuenta de nube compartida y credenciales
- [docs/API.md](docs/API.md) — contratos de API y WebSocket

## Estado

- [ ] Definir arquitectura
- [ ] Crear cuenta/recursos en la nube
- [ ] Implementar Hub (FastAPI + Redis)
- [ ] Implementar daemon (LangGraph + LiteLLM + Bash/AppleScript)
- [ ] Implementar app móvil
- [ ] Desplegar y proteger con HTTPS