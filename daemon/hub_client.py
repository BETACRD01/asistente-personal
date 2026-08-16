"""Conexión WebSocket con el Hub (VPS)."""

import asyncio
import json
import logging

import websockets

from config import settings

logger = logging.getLogger("daemon.hub")


async def connect(handler) -> None:
    """Mantiene viva la conexión con el Hub y reenvía los comandos al handler."""
    headers = {"Authorization": f"Bearer {settings.device_token}"}
    while True:
        try:
            logger.info("conectando a %s", settings.hub_ws_url)
            async with websockets.connect(
                settings.hub_ws_url, additional_headers=headers, ping_interval=20
            ) as ws:
                logger.info("conectado")
                async for raw in ws:
                    try:
                        message = json.loads(raw)
                    except json.JSONDecodeError:
                        logger.warning("mensaje no-json ignorado")
                        continue
                    if message.get("type") == "command":
                        async for reply in handler(message):
                            await ws.send(json.dumps(reply))
        except Exception as exc:
            logger.warning("conexion caida (%s); reintento en 5s", exc)
            await asyncio.sleep(5)