"""Hub de Asistente Personal: relé de terminal y túnel con control de acceso.

Cada máquina se auto-registra al conectar (su token = su identidad). Para
conectarse a una máquina, el cliente pide acceso y la máquina remota lo
acepta/niega a través de su canal de peticiones (/ws/mac/req).

Endpoints WS:
  /ws/mac/term (device token) -> la máquina publica/recibe bytes del PTY
  /ws/mac/tcp  (device token) -> túnel TCP de la máquina (SSH/SCP/SFTP)
  /ws/mac/req  (device token) -> canal de peticiones (conn_req / conn_ok)
  /ws/term     -> el cliente pide el terminal de una máquina
  /ws/tcp      -> el cliente pide un túnel TCP a una máquina
"""

import asyncio
import base64
import json
import logging
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from app.auth import create_token, decode_token, login_app_token, login_device_token
from app.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("hub")

STATIC_DIR = Path(__file__).parent / "static"

# registros en memoria
# device_token -> WebSocket (PTY de la máquina)
mac_term_sockets: dict[str, WebSocket] = {}
# device_token -> WebSocket (túnel TCP de la máquina, p. ej. SSH)
mac_tcp_sockets: dict[str, WebSocket] = {}
# device_token -> WebSocket (canal de peticiones / aceptación)
mac_req_sockets: dict[str, WebSocket] = {}
# app_id -> {"ws": WebSocket, "device": str}
term_app_sockets: dict[str, dict] = {}
# conn_id -> {"ws": WebSocket, "device": str}
tcp_app_sockets: dict[str, dict] = {}
# req_id -> {"event": asyncio.Event, "ok": bool}
pending: dict[str, dict] = {}

# máquinas conocidas: semilla de DEVICE_TOKENS + auto-registradas
known_devices: set[str] = set(settings.device_tokens)

MIN_TOKEN_LEN = 12


device_names: dict[str, str] = {}

def _register(token: str | None, name: str = "") -> bool:
    """Auto-registra una máquina. Su token es su identidad en el hub."""
    if not token or len(token) < MIN_TOKEN_LEN:
        return False
    known_devices.add(token)
    if name:
        device_names[token] = name
    return True


def _is_known(device: str) -> bool:
    return device in known_devices


def _identity_ok(token: str | None, is_app: bool) -> bool:
    """Identidad de un cliente: app (JWT) o cualquier token de máquina valido."""
    return is_app or (token is not None and len(token) >= MIN_TOKEN_LEN)


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield


app = FastAPI(title="Asistente Hub", version="0.2.0", lifespan=lifespan)

# La app de escritorio (Electron, origen file://) hace fetch a /devices
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class LoginRequest(BaseModel):
    token: str


@app.get("/health")
async def health():
    return {"status": "ok", "build": "demo-4"}


@app.get("/devices")
async def devices(token: str | None = None):
    """Lista las maquinas registradas y su estado (terminal/tunel online)."""
    if not token:
        raise HTTPException(status_code=401, detail="missing token")
    is_app = False
    try:
        is_app = decode_token(token).get("sub") == "app"
    except Exception:
        pass
    if not _identity_ok(token, is_app):
        raise HTTPException(status_code=401, detail="invalid token")
    return {
        "devices": [
            {
                "device": dev,
                "name": device_names.get(dev, ""),
                "terminal": dev in mac_term_sockets,
                "tunnel": dev in mac_tcp_sockets,
            }
            for dev in sorted(known_devices)
            if (dev in mac_term_sockets or dev in mac_tcp_sockets) or device_names.get(dev)
        ]
    }


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


async def _request_access(device: str, kind: str, from_token: str) -> bool:
    """Conexion directa (sin pedir aceptacion a la maquina remota)."""
    return True


@app.websocket("/ws/mac/req")
async def ws_mac_req(websocket: WebSocket, token: str | None = None):
    """Canal de peticiones de una máquina: recibe conn_req y responde conn_ok."""
    auth = websocket.headers.get("authorization")
    if not token and auth and auth.startswith("Bearer "):
        token = auth.removeprefix("Bearer ").strip()
    name = websocket.headers.get("x-device-name", "")
    if not token or not (_register(token, name) or login_device_token(token)):
        await websocket.close(code=4001, reason="invalid device token")
        return

    mac_req_sockets[token] = websocket
    await websocket.accept()
    logger.info("peticiones Mac conectado device=%s", token)
    try:
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break
            raw = message.get("bytes") or message.get("text")
            if not isinstance(raw, str):
                continue
            try:
                frame = json.loads(raw)
            except ValueError:
                continue
            if frame.get("type") != "conn_ok":
                continue
            pend = pending.get(frame.get("id"))
            if pend:
                pend["ok"] = bool(frame.get("ok"))
                pend["event"].set()
    except WebSocketDisconnect:
        pass
    finally:
        mac_req_sockets.pop(token, None)
        logger.info("peticiones Mac desconectado device=%s", token)


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
    name = websocket.headers.get("x-device-name", "")
    if not token or not (_register(token, name) or login_device_token(token)):
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
    if not _identity_ok(token, is_app):
        await websocket.close(code=4001, reason="invalid token")
        return
    if not device or not _is_known(device):
        await websocket.close(code=4001, reason="unknown device")
        return

    app_id = uuid.uuid4().hex
    term_app_sockets[app_id] = {"ws": websocket, "device": device}
    await websocket.accept()
    logger.info("terminal app conectado device=%s", device)
    if device in mac_term_sockets:
        if not await _request_access(device, "term", token):
            await websocket.close(code=4005, reason="rejected")
            return
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
    name = websocket.headers.get("x-device-name", "")
    if not token or not (_register(token, name) or login_device_token(token)):
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
    if not _identity_ok(token, is_app):
        await websocket.close(code=4001, reason="invalid token")
        return
    if not device or not _is_known(device):
        await websocket.close(code=4001, reason="unknown device")
        return
    if device not in mac_tcp_sockets:
        await websocket.close(code=4004, reason="device offline")
        return
    if not await _request_access(device, "tcp", token):
        await websocket.close(code=4005, reason="rejected")
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