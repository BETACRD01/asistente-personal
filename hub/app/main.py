"""Hub de Asistente Personal: relé de terminal de la Mac (en memoria).

Endpoints WS:
  /ws/mac/term (device token) -> el daemon de la Mac publica/recibe bytes del PTY
  /ws/term     (JWT app o device token) -> el cliente (Termux/app) envía/recoje bytes
"""

import base64
import json
import logging
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from app.auth import create_token, decode_token, login_app_token, login_device_token
from app.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("hub")

STATIC_DIR = Path(__file__).parent / "static"

# registros en memoria
# device_token -> WebSocket (PTY de la Mac)
mac_term_sockets: dict[str, WebSocket] = {}
# app_id -> {"ws": WebSocket, "device": str}
term_app_sockets: dict[str, dict] = {}
# device_token -> WebSocket (túnel TCP de la Mac, p. ej. SSH)
mac_tcp_sockets: dict[str, WebSocket] = {}
# app_id -> {"ws": WebSocket, "device": str}
tcp_app_sockets: dict[str, dict] = {}


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield


app = FastAPI(title="Asistente Hub", version="0.2.0", lifespan=lifespan)


class LoginRequest(BaseModel):
    token: str


@app.get("/health")
async def health():
    return {"status": "ok", "build": "demo-4"}


@app.get("/term", response_class=HTMLResponse)
async def term_page():
    return (STATIC_DIR / "term.html").read_text()


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


async def _term_status(device: str, state: str) -> None:
    msg = json.dumps({"type": "status", "state": state})
    for info in list(term_app_sockets.values()):
        if info["device"] == device:
            try:
                await info["ws"].send_text(msg)
            except Exception:
                pass


@app.websocket("/ws/mac/term")
async def ws_mac_term(websocket: WebSocket, token: str | None = None):
    auth = websocket.headers.get("authorization")
    if not token and auth and auth.startswith("Bearer "):
        token = auth.removeprefix("Bearer ").strip()
    if not token or not login_device_token(token):
        await websocket.close(code=4001, reason="invalid device token")
        return

    mac_term_sockets[token] = websocket
    await websocket.accept()
    logger.info("terminal Mac conectado device=%s", token)
    await _term_status(token, "connected")
    try:
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break
            raw = message.get("bytes") or message.get("text")
            if raw is None:
                continue
            for info in list(term_app_sockets.values()):
                if info["device"] != token:
                    continue
                try:
                    if message.get("bytes") is not None:
                        await info["ws"].send_bytes(raw)
                    else:
                        await info["ws"].send_text(raw)
                except Exception:
                    pass
    except WebSocketDisconnect:
        pass
    finally:
        mac_term_sockets.pop(token, None)
        await _term_status(token, "offline")
        logger.info("terminal Mac desconectado device=%s", token)


@app.websocket("/ws/term")
async def ws_term(websocket: WebSocket, token: str | None = None, device: str | None = None):
    auth = websocket.headers.get("authorization")
    if not token and auth and auth.startswith("Bearer "):
        token = auth.removeprefix("Bearer ").strip()
    if not token:
        await websocket.close(code=4001, reason="missing token")
        return
    is_app = False
    try:
        is_app = decode_token(token).get("sub") == "app"
    except Exception as exc:
        logger.warning("ws_term decode fallo: %s", exc)
    if not is_app and not login_device_token(token):
        await websocket.close(code=4001, reason="invalid token")
        return
    if not device or device not in settings.device_tokens:
        await websocket.close(code=4001, reason="unknown device")
        return

    app_id = uuid.uuid4().hex
    term_app_sockets[app_id] = {"ws": websocket, "device": device}
    await websocket.accept()
    logger.info("terminal app conectado device=%s", device)
    if device in mac_term_sockets:
        await _term_status(device, "connected")
    else:
        await _term_status(device, "offline")
    try:
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break
            raw = message.get("bytes") or message.get("text")
            if raw is None:
                continue
            mac_ws = mac_term_sockets.get(device)
            if not mac_ws:
                await websocket.send_text(json.dumps({"type": "status", "state": "offline"}))
                continue
            if message.get("bytes") is not None:
                await mac_ws.send_bytes(raw)
            else:
                await mac_ws.send_text(raw)
    except WebSocketDisconnect:
        pass
    finally:
        term_app_sockets.pop(app_id, None)


# --- Túnel TCP: SSH de la Mac a cualquier red (p. ej. ssh por websocat) ---
# Varias sesiones simultáneas: cada conexión de app recibe un conn_id y el
# puente de la Mac abre un TCP por id. Los datos viajan como JSON base64.


async def _tcp_control(device: str, message: dict) -> None:
    mac_ws = mac_tcp_sockets.get(device)
    if not mac_ws:
        return
    try:
        await mac_ws.send_text(json.dumps(message))
    except Exception:
        pass


@app.websocket("/ws/mac/tcp")
async def ws_mac_tcp(websocket: WebSocket, token: str | None = None):
    auth = websocket.headers.get("authorization")
    if not token and auth and auth.startswith("Bearer "):
        token = auth.removeprefix("Bearer ").strip()
    if not token or not login_device_token(token):
        await websocket.close(code=4001, reason="invalid device token")
        return

    mac_tcp_sockets[token] = websocket
    await websocket.accept()
    logger.info("tcp Mac conectado device=%s", token)
    try:
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break
            raw = message.get("bytes") or message.get("text")
            if raw is None:
                continue
            try:
                frame = json.loads(raw) if isinstance(raw, str) else None
            except (ValueError, TypeError):
                frame = None
            if not frame:
                continue
            ftype = frame.get("type")
            cid = frame.get("id")
            if ftype == "data":
                for info in list(tcp_app_sockets.values()):
                    if info["conn_id"] == cid:
                        try:
                            await info["ws"].send_bytes(base64.b64decode(frame.get("data", "")))
                        except Exception:
                            pass
            elif ftype == "eof":
                for info in list(tcp_app_sockets.values()):
                    if info["conn_id"] == cid:
                        try:
                            await info["ws"].close(code=1000)
                        except Exception:
                            pass
    except WebSocketDisconnect:
        pass
    finally:
        mac_tcp_sockets.pop(token, None)
        logger.info("tcp Mac desconectado device=%s", token)


@app.websocket("/ws/tcp")
async def ws_tcp(websocket: WebSocket, token: str | None = None, device: str | None = None):
    auth = websocket.headers.get("authorization")
    if not token and auth and auth.startswith("Bearer "):
        token = auth.removeprefix("Bearer ").strip()
    if not token:
        await websocket.close(code=4001, reason="missing token")
        return
    is_app = False
    try:
        is_app = decode_token(token).get("sub") == "app"
    except Exception as exc:
        logger.warning("ws_tcp decode fallo: %s", exc)
    if not is_app and not login_device_token(token):
        await websocket.close(code=4001, reason="invalid token")
        return
    if not device or device not in settings.device_tokens:
        await websocket.close(code=4001, reason="unknown device")
        return
    if device not in mac_tcp_sockets:
        await websocket.close(code=4004, reason="device offline")
        return

    conn_id = uuid.uuid4().hex
    tcp_app_sockets[conn_id] = {"ws": websocket, "device": device, "conn_id": conn_id}
    await websocket.accept()
    logger.info("tcp app conectado device=%s conn=%s", device, conn_id)
    await _tcp_control(device, {"type": "connect", "id": conn_id})
    try:
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break
            raw = message.get("bytes") or message.get("text")
            if raw is None:
                continue
            try:
                await _tcp_control(
                    device,
                    {
                        "type": "data",
                        "id": conn_id,
                        "data": base64.b64encode(raw).decode(),
                    },
                )
            except Exception:
                break
    except WebSocketDisconnect:
        pass
    finally:
        tcp_app_sockets.pop(conn_id, None)
        await _tcp_control(device, {"type": "disconnect", "id": conn_id})