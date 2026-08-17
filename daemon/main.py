"""Cerebro: punto de entrada del daemon.

Escucha al Hub (VPS) y ejecuta el agente LangGraph para cada comando,
transmitiendo tokens y stdout de vuelta.
"""

import asyncio
import base64
import logging
import re
from pathlib import Path

from brain.agent import agent
from hub_client import connect

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("daemon")

_IMAGE_RE = re.compile(r"!\[[^\]]*\]\(([^)]+)\)")


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
    model = result.get("model") or ""

    # Imagenes generadas: se envian aparte y se quitan del texto
    clean = _IMAGE_RE.sub("", answer).strip()
    for path in _IMAGE_RE.findall(answer):
        try:
            raw = Path(path).read_bytes()
            mime = "image/png" if path.endswith(".png") else "image/jpeg"
            yield {
                "type": "image",
                "id": command_id,
                "path": path,
                "mime": mime,
                "data": base64.b64encode(raw).decode(),
            }
        except Exception as exc:
            yield {"type": "token", "id": command_id, "content": f"\n(no se pudo leer la imagen: {exc})"}

    if clean:
        yield {"type": "token", "id": command_id, "content": clean}
    if result.get("output"):
        yield {"type": "stdout", "id": command_id, "content": result["output"]}
    yield {"type": "done", "id": command_id, "model": model}


async def main() -> None:
    logger.info("daemon iniciado")
    from local_api import run_local_server

    await asyncio.gather(connect(handle_command), run_local_server())


if __name__ == "__main__":
    asyncio.run(main())