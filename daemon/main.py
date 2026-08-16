"""Cerebro: punto de entrada del daemon.

Escucha al Hub (VPS) y ejecuta el agente LangGraph para cada comando,
transmitiendo tokens y stdout de vuelta.
"""

import asyncio
import logging

from brain.agent import agent
from hub_client import connect

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("daemon")


async def handle_command(message: dict):
    """Procesa un comando y emite mensajes de vuelta (stream)."""
    command_id = message.get("id", "?")
    text = message.get("text", "")
    logger.info("comando %s: %s", command_id, text)

    try:
        result = await agent.ainvoke({"command": text})
    except Exception as exc:
        logger.warning("fallo procesando %s: %s", command_id, exc)
        yield {"type": "token", "id": command_id, "content": f"Error: {exc}"}
        yield {"type": "done", "id": command_id}
        return
    answer = result.get("answer") or "(sin respuesta)"
    yield {"type": "token", "id": command_id, "content": answer}
    if result.get("output"):
        yield {"type": "stdout", "id": command_id, "content": result["output"]}
    yield {"type": "done", "id": command_id}


async def main() -> None:
    logger.info("daemon iniciado")
    from local_api import run_local_server

    await asyncio.gather(connect(handle_command), run_local_server())


if __name__ == "__main__":
    asyncio.run(main())