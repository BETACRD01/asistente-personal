# Asistente Personal — Daemon (el cerebro)

Programa Python que corre en tu Mac, escucha al Hub por WebSocket y ejecuta
comandos con un agente **LangGraph + LiteLLM** (Ollama local o Claude/GPT-4o).

## Estructura

```text
daemon/
├── main.py              # entrada: conecta al Hub y orquesta
├── config.py            # configuración desde .env
├── hub_client.py        # cliente WebSocket con reconexión
└── brain/
    ├── agent.py         # grafo LangGraph (decide → ejecuta → resume)
    ├── llm.py           # LiteLLM (ollama/anthropic/openai)
    └── tools/
        ├── bash.py      # ejecutar comandos de terminal (con bloqueos)
        └── applescript.py # controlar apps/Finder con osascript y JXA
```

## Puesta en marcha

```bash
cd daemon
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # editar DEVICE_TOKEN y LLM
python main.py
```

## Probar sin VPS (echo local)

El daemon aún depende del Hub. Para probar el cerebro en local:

```bash
python -c "import asyncio; from brain.agent import agent; \
print(asyncio.run(agent.ainvoke({'command': 'ejecuta echo hola'})).get('answer'))"
```

## Seguridad

- Comandos Bash con bloqueo de operaciones destructivas (`bash.py`).
- Solo herramientas permitidas en `ALLOWED_TOOLS` (`.env`).
- El daemon solo hace conexión **saliente** al Hub; no expone puertos.
- El modelo debe pedir confirmación para acciones riesgosas (aún por implementar).