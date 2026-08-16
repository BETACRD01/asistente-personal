"""Hub de Asistente Personal: FastAPI + Redis Pub/Sub para enrutar mensajes.

Endpoints WS:
  /ws/app  (JWT)  -> la app envia comandos, recibe respuestas en streaming
  /ws/mac  (device token) -> el daemon recibe comandos, envia respuestas
"""

import asyncio
import json
import logging
import uuid
from contextlib import asynccontextmanager
from typing import AsyncIterator

import redis.asyncio as aioredis
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Depends, Header
from pydantic import BaseModel

from app.auth import (
    authorize,
    create_token,
    decode_token,
    login_app_token,
    login_device_token,
)
from app.config import settings
from app.redis_client import add_history, get_history

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("hub")

CMD_PREFIX = "cmd:{device}"
REPLY_PREFIX = "reply:{app_id}"

# registros en memoria: device_token -> WebSocket (daemons conectados)
mac_sockets: dict[str, WebSocket] = {}
# command_id -> app_id (para rutear las respuestas del daemon)
reply_map: dict[str, str] = {}
# app_id -> WebSocket
app_sockets: dict[str, WebSocket] = {}


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield


app = FastAPI(title="Asistente Hub", version="0.1.0", lifespan=lifespan)


class LoginRequest(BaseModel):
    token: str


class CommandRequest(BaseModel):
    device: str
    text: str


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/auth/login")
async def login(payload: LoginRequest):
    if not login_app_token(payload.token):
        raise HTTPException(status_code=401, detail="Invalid app token")
    return {"token": create_token("app", ttl_hours=24)}


@app.post("/auth/device")
async def login_device(payload: LoginRequest):
    if not login_device_token(payload.token):
        raise HTTPException(status_code=401, detail="Invalid device token")
    return {"token": create_token(payload.token, ttl_hours=720)}


@app.get("/devices")
async def devices(sub: str = Depends(authorize)):
    return [{"device": t, "connected": t in mac_sockets} for t in settings.device_tokens]


@app.get("/history/{device}")
async def history(device: str, sub: str = Depends(authorize)):
    if device not in settings.device_tokens:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"device": device, "items": await get_history(device)}


@app.post("/commands")
async def send_command(payload: CommandRequest, sub: str = Depends(authorize)):
    if payload.device not in settings.device_tokens:
        raise HTTPException(status_code=404, detail="Device not found")
    if payload.device not in mac_sockets:
        raise HTTPException(status_code=503, detail="Device offline")
    command_id = await _dispatch(payload.device, payload.text, f"rest:{uuid.uuid4().hex}")
    return {"id": command_id}


async def _publish(channel: str, message: dict) -> None:
    try:
        r = aioredis.from_url(settings.redis_url, decode_responses=True)
        await r.publish(channel, json.dumps(message))
        await r.aclose()
    except Exception as exc:
        logger.warning("publish error: %s", exc)


async def _subscribe(channel: str) -> AsyncIterator[dict]:
    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    pubsub = r.pubsub()
    await pubsub.subscribe(channel)
    try:
        while True:
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=30)
            if msg and msg.get("type") == "message":
                yield json.loads(msg["data"])
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.aclose()


async def _dispatch(device: str, text: str, app_id: str) -> str:
    command_id = uuid.uuid4().hex
    reply_map[command_id] = app_id
    message = {"type": "command", "id": command_id, "text": text}
    await _publish(CMD_PREFIX.format(device=device), message)
    await add_history(device, {"type": "command", "id": command_id, "text": text})
    return command_id


async def _app_relay(app_id: str, ws: WebSocket) -> None:
    """Envía a la app todo lo que publique el daemon en su canal de respuesta."""
    try:
        async for message in _subscribe(REPLY_PREFIX.format(app_id=app_id)):
            await ws.send_text(json.dumps(message))
    except Exception as exc:
        logger.warning("app relay %s closed: %s", app_id, exc)


@app.websocket("/ws/app")
async def ws_app(websocket: WebSocket, token: str | None = None):
    auth = websocket.headers.get("authorization")
    if not token and auth and auth.startswith("Bearer "):
        token = auth.removeprefix("Bearer ").strip()
    logger.info("ws_app token=%s", "presente" if token else "FALTA")
    if not token:
        await websocket.close(code=4001, reason="missing token")
        return
    try:
        sub = decode_token(token).get("sub")
        logger.info("ws_app sub=%s", sub)
    except Exception as exc:
        logger.warning("ws_app decode fallo: %s", exc)
        await websocket.close(code=4001, reason="invalid token")
        return
    if sub != "app":
        await websocket.close(code=4001, reason="not an app token")
        return

    app_id = uuid.uuid4().hex
    app_sockets[app_id] = websocket
    await websocket.accept()
    relay = asyncio.create_task(_app_relay(app_id, websocket))
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({"type": "error", "message": "json invalido"}))
                continue
            if message.get("type") != "command":
                continue
            device = message.get("device")
            text = message.get("text")
            if device not in settings.device_tokens:
                await websocket.send_text(json.dumps({"type": "error", "id": message.get("id"), "message": "dispositivo desconocido"}))
                continue
            if device not in mac_sockets:
                await websocket.send_text(json.dumps({"type": "error", "id": message.get("id"), "message": "la Mac esta offline"}))
                continue
            command_id = await _dispatch(device, text, app_id)
    except WebSocketDisconnect:
        pass
    finally:
        relay.cancel()
        app_sockets.pop(app_id, None)
        for cid, aid in list(reply_map.items()):
            if aid == app_id:
                reply_map.pop(cid, None)


@app.websocket("/ws/mac")
async def ws_mac(websocket: WebSocket, token: str | None = None):
    auth = websocket.headers.get("authorization")
    if not token and auth and auth.startswith("Bearer "):
        token = auth.removeprefix("Bearer ").strip()
    if not token or not login_device_token(token):
        await websocket.close(code=4001, reason="invalid device token")
        return

    mac_sockets[token] = websocket
    await websocket.accept()
    logger.info("daemon conectado device=%s", token)
    feed = asyncio.create_task(_mac_feed(token, websocket))
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                continue
            command_id = message.get("id")
            app_id = reply_map.get(command_id)
            if not app_id:
                continue
            message.setdefault("type", "unknown")
            await _publish(REPLY_PREFIX.format(app_id=app_id), message)
            if message.get("type") == "done" or message.get("type") == "error":
                reply_map.pop(command_id, None)
    except WebSocketDisconnect:
        pass
    finally:
        feed.cancel()
        mac_sockets.pop(token, None)
        logger.info("daemon desconectado device=%s", token)


async def _mac_feed(device: str, websocket: WebSocket) -> None:
    """Envía al daemon los comandos publicados en su canal."""
    try:
        async for message in _subscribe(CMD_PREFIX.format(device=device)):
            await websocket.send_text(json.dumps(message))
    except Exception as exc:
        logger.warning("mac feed %s closed: %s", device, exc)