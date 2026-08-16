# Asistente Personal — Daemon (el cerebro)

Programa Python que corre en tu Mac, escucha al Hub por WebSocket y ejecuta
comandos con un agente **LangGraph + LiteLLM**. Puedes elegir el modelo como en
opencode/Codex: Gemini (cuenta o API key), Ollama local (gratis), Claude, GPT,
Groq u OpenRouter.

## Estructura

```text
daemon/
├── main.py              # entrada: conecta al Hub y orquesta
├── config.py            # configuración desde .env
├── configure.py         # asistente para elegir proveedor de IA
├── hub_client.py        # cliente WebSocket con reconexión
└── brain/
    ├── agent.py         # grafo LangGraph (decide → ejecuta → resume)
    ├── llm.py           # LiteLLM (ollama/gemini/anthropic/openai/groq/openrouter)
    └── tools/
        ├── bash.py      # ejecutar comandos de terminal (con bloqueos)
        └── applescript.py # controlar apps/Finder con osascript y JXA
```

## Puesta en marcha

```bash
cd daemon
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python configure.py        # elige el proveedor de IA (Gemini, Ollama, etc.)
python main.py             # arranca el daemon conectado al Hub
```

## Elegir el proveedor de IA

```bash
python configure.py --list                  # ver proveedores y estado
python configure.py --provider gemini       # cambiar a Gemini (pide API key)
python configure.py --provider gemini --key AIza...   # con API key directa
```

Proveedores soportados:

| Proveedor | Cómo | Costo |
|-----------|------|-------|
| `ollama` | Modelo local (llama3.2, etc.) | Gratis, sin conexión |
| `gemini` | API key de Google AI Studio | Gratis/barato |
| `groq` | API key de groq.com | Gratis/barato, rápido |
| `openrouter` | API key, muchos modelos | Según modelo |
| `openai` / `anthropic` | API key | De pago |

## Probar sin VPS

```bash
python -c "import asyncio; from brain.agent import agent; \
print(asyncio.run(agent.ainvoke({'command': 'ejecuta echo hola'})).get('answer'))"
```

## Seguridad

- Comandos Bash con bloqueo de operaciones destructivas (`bash.py`).
- Solo herramientas permitidas en `ALLOWED_TOOLS` (`.env`).
- El daemon solo hace conexión **saliente** al Hub; no expone puertos.