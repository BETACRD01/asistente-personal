"""Capa Redis: estado, historial y Pub/Sub."""

import json
import logging

import redis.asyncio as aioredis

from app.config import settings

logger = logging.getLogger("hub.redis")

HISTORY_KEY = "history:{device}"
PREFIX_CMD = "cmd:{device}"
PREFIX_REPLY = "reply:{socket}"


def _client() -> aioredis.Redis:
    return aioredis.from_url(settings.redis_url, decode_responses=True)


async def add_history(device: str, message: dict, maxlen: int = 200) -> None:
    try:
        r = _client()
        await r.lpush(HISTORY_KEY.format(device=device), json.dumps(message))
        await r.ltrim(HISTORY_KEY.format(device=device), 0, maxlen - 1)
        await r.aclose()
    except Exception as exc:
        logger.warning("history error: %s", exc)


async def get_history(device: str, limit: int = 50) -> list[dict]:
    try:
        r = _client()
        items = await r.lrange(HISTORY_KEY.format(device=device), 0, limit - 1)
        await r.aclose()
        return [json.loads(i) for i in items]
    except Exception as exc:
        logger.warning("history read error: %s", exc)
        return []