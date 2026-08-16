"""Agente LangGraph: decide qué herramienta ejecutar y responde.

Grafo:
  entrada → decide (LLM) → ejecuta (Bash/AppleScript) → responde
"""

import logging

from langgraph.graph import END, StateGraph
from pydantic import BaseModel

from brain.llm import complete
from brain.tools import run_applescript, run_bash
from config import settings

logger = logging.getLogger("daemon.brain")

SYSTEM_PROMPT = """Eres el asistente personal que controla esta Mac.
Tienes estas herramientas: {tools}
Devuelve SIEMPRE JSON con una de estas formas:
{{"tool": "bash", "command": "..."}}
{{"tool": "applescript", "script": "..."}}
{{"tool": "applescript", "script": "...", "jxa": true}}
{{"answer": "respuesta directa sin ejecutar nada"}}
No inventes resultados. Si la peticion es ambigua, pide aclaracion con {{"answer": "..."}}."""


class AgentState(BaseModel):
    command: str
    tool: str | None = None
    payload: str | None = None
    jxa: bool = False
    output: str | None = None
    answer: str | None = None


async def _decide(state: AgentState) -> AgentState:
    """El LLM decide qué herramienta usar."""
    prompt = f"{SYSTEM_PROMPT}\n\nPeticion del usuario: {state.command}"
    try:
        raw = complete(prompt).choices[0].message.content
    except RuntimeError as exc:
        state.answer = str(exc)
        return state
    return _parse_decision(raw, state)


async def _execute(state: AgentState) -> AgentState:
    """Ejecuta la herramienta elegida."""
    try:
        if state.tool == "bash":
            state.output = await run_bash(state.payload or "")
        elif state.tool == "applescript":
            if state.jxa:
                state.output = await _run_jxa(state.payload or "")
            else:
                state.output = await run_applescript(state.payload or "")
        else:
            state.answer = "No tengo una herramienta disponible para eso."
    except Exception as exc:
        state.answer = f"Error al ejecutar: {exc}"
    return state


async def _summarize(state: AgentState) -> AgentState:
    """Convierte el stdout en una respuesta amigable."""
    if state.answer:
        return state
    result = state.output or "(sin salida)"
    summary = complete(f"Resume brevemente en espanol: {result}").choices[0].message.content
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

    if "answer" in data:
        state.answer = data["answer"]
        return state
    tool = data.get("tool")
    if tool not in settings.allowed_tools:
        state.answer = f"Herramienta {tool!r} no permitida."
        return state
    state.tool = tool
    state.payload = data.get("command") or data.get("script")
    state.jxa = bool(data.get("jxa"))
    return state


async def _run_jxa(script: str) -> str:
    from brain.tools import run_jxa

    return await run_jxa(script)


agent = build_graph()