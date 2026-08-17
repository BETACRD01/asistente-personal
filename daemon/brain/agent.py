"""Agente LangGraph: decide qué herramienta ejecutar y responde.

Grafo:
  entrada → decide (LLM) → ejecuta (Bash/AppleScript) → responde
"""

import logging

from langgraph.graph import END, StateGraph
from pydantic import BaseModel

from brain.llm import complete
from brain.tools import generate_image, run_applescript, run_bash
from config import settings

logger = logging.getLogger("daemon.brain")

_ADMIN_NOTE = (
    "\n- Tienes PERMISOS DE ADMINISTRADOR: puedes ejecutar comandos con 'sudo' "
    "cuando la tarea lo requiera (macOS pedira la contrasena en pantalla)."
    if settings.admin_mode
    else ""
)

SYSTEM_PROMPT = f"""Eres el asistente personal que controla esta Mac.
Tienes estas herramientas: {{tools}}
Devuelve SIEMPRE un JSON valido con una de estas formas EXACTAS:
{{"tool": "bash", "command": "comando a ejecutar"}}
{{"tool": "applescript", "script": "script a ejecutar"}}
{{"tool": "applescript", "script": "...", "jxa": true}}
{{"tool": "generate_image", "command": "describe la imagen que quieres"}}
{{"answer": "tu respuesta directa, sin ejecutar nada"}}
REGLAS:
- Si el usuario saluda, conversa o pide algo que NO requiere ejecutar un comando, responde directo con {{"answer": "..."}}.
- Las unicas claves permitidas son: answer, tool, command, script, jxa.
- No inventes resultados ni herramientas.
- Si el usuario pide CREAR/DIBUJAR/GENERAR una imagen, usa la herramienta generate_image con una buena descripcion.{_ADMIN_NOTE}"""


class AgentState(BaseModel):
    command: str
    tool: str | None = None
    payload: str | None = None
    jxa: bool = False
    output: str | None = None
    answer: str | None = None
    model: str | None = None


async def _decide(state: AgentState) -> AgentState:
    """El LLM decide qué herramienta usar (con reintento si no da accion valida)."""
    from datetime import datetime

    now = datetime.now().strftime("%A, %d de %B de %Y, %H:%M")
    date_note = f"Fecha y hora actual (siempre correctas): {now}."
    for attempt in range(3):
        prompt = (
            f"{SYSTEM_PROMPT}\n\n{date_note}\nPeticion del usuario: {state.command}"
            if attempt == 0
            else (
                f"{SYSTEM_PROMPT}\n\n{date_note}\nPeticion del usuario: {state.command}\n"
                "Tu respuesta anterior no fue una accion valida. "
                "Devuelve SOLO JSON con las claves exactas: answer, tool, command, script, jxa."
            )
        )
        try:
            from brain import llm

            raw = complete(prompt).choices[0].message.content
            state.model = llm.last_model or state.model
        except RuntimeError as exc:
            state.answer = str(exc)
            return state
        result = _parse_decision(raw, state)
        if result.answer or result.tool:
            return result
    return state


async def _execute(state: AgentState) -> AgentState:
    """Ejecuta la herramienta elegida (pidiendo aprobacion si el modo lo pide)."""
    if state.answer:
        return state  # respuesta directa, sin herramienta que ejecutar
    if state.tool:
        from brain import approval

        if not await approval.request_approval(state.payload or ""):
            state.answer = "Accion rechazada por el usuario (aprobacion requerida)."
            return state
    try:
        if state.tool == "bash":
            state.output = await run_bash(state.payload or "")
        elif state.tool == "applescript":
            if state.jxa:
                state.output = await _run_jxa(state.payload or "")
            else:
                state.output = await run_applescript(state.payload or "")
        elif state.tool == "generate_image":
            state.output = await generate_image(state.payload or "")
        else:
            state.answer = "No tengo una herramienta disponible para eso."
    except Exception as exc:
        state.answer = f"Error al ejecutar: {exc}"
    return state


async def _summarize(state: AgentState) -> AgentState:
    """Convierte el stdout en una respuesta amigable (sin inventar contenido)."""
    if state.answer:
        return state
    from brain import llm

    result = (state.output or "").strip()
    if "![imagen](" in result:
        # la salida ya es una imagen generada: no la resumimos con el LLM
        state.answer = result
        state.model = llm.last_model or state.model
        return state
    if not result:
        state.answer = "El comando se ejecutó sin salida."
        state.model = llm.last_model or state.model
        return state
    if len(result) <= 400:
        # salida corta: la devolvemos tal cual, sin inventar interpretaciones
        state.answer = f"Se ejecutó `{state.payload or 'el comando'}`:\n\n{result}"
        state.model = llm.last_model or state.model
        return state
    summary = complete(
        f"El comando '{state.payload}' se ejecutó en una Mac y su salida fue:\n---\n{result}\n---\n"
        "Responde al usuario en español explicando brevemente qué hizo el comando y muestra los "
        "datos relevantes de la salida. NO inventes significados, definiciones ni información que "
        "no esté en la salida. No digas que la tarea se completó si no hay evidencia."
    ).choices[0].message.content
    state.model = llm.last_model or state.model
    state.answer = summary
    return state


def build_graph():
    graph = StateGraph(AgentState)
    graph.add_node("decide", _decide)
    graph.add_node("execute", _execute)
    graph.add_node("summarize", _summarize)
    graph.set_entry_point("decide")
    graph.add_edge("decide", "execute")
    graph.add_edge("execute", "summarize")
    graph.add_edge("summarize", END)
    return graph.compile()


def _parse_decision(raw: str, state: AgentState) -> AgentState:
    """Extrae la decisión JSON del LLM (tolerante a texto alrededor)."""
    import json
    import re

    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        state.answer = "El modelo no devolvio una accion valida."
        return state
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        state.answer = "El modelo devolvio JSON invalido."
        return state

    if "answer" in data and data.get("answer"):
        state.answer = data["answer"]
        return state
    tool = data.get("tool")
    if tool:
        if tool not in settings.allowed_tools:
            state.answer = f"Herramienta {tool!r} no permitida."
            return state
        state.tool = tool
        state.payload = data.get("command") or data.get("script")
        state.jxa = bool(data.get("jxa"))
        return state
    for key in ("response", "message", "respuesta", "text", "output"):
        if isinstance(data.get(key), str) and data[key].strip():
            state.answer = data[key]
            return state
    state.answer = "El modelo no devolvio una accion valida."
    return state


async def _run_jxa(script: str) -> str:
    from brain.tools import run_jxa

    return await run_jxa(script)


agent = build_graph()