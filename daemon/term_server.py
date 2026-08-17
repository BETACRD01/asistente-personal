"""Terminal remoto de la Mac: PTY real expuesto por WebSocket.

Sirve para conectarse desde el móvil y ejecutar comandos (y los agentes
de IA configurados en la shell) directamente en el terminal de la Mac.

Dos vias de acceso:
  - local  : ws://<IP>:8766/term?token=TERM_TOKEN   (misma red Wi-Fi)
  - nube   : se conecta al hub (agentrelay.duckdns.org/ws/mac/term) y desde
             cualquier red el celular entra por el hub

Protocolo (frames):
  - binarios: datos del terminal (salida de la shell / input del usuario)
  - texto   : JSON de control {"type":"resize","cols":C,"rows":R}
"""

import asyncio
import base64
import fcntl
import json
import logging
import os
import pty
import struct
import subprocess
import termios
from typing import Any, Awaitable, Callable

import uvicorn
import websockets
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("daemon.term")

app = FastAPI(title="Terminal Remoto", version="0.1.0")

PORT = 8766
HUB_TERM_URL = settings.hub_ws_url.replace("/ws/mac", "/ws/mac/term")
HUB_TCP_URL = settings.hub_ws_url.replace("/ws/mac", "/ws/mac/tcp")
TCP_TARGET = ("127.0.0.1", 22)


def _set_size(fd: int, cols: int, rows: int) -> None:
    try:
        fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
    except OSError:
        pass


class TerminalSession:
    """Una sesion de shell real (PTY) enlazada a un WebSocket."""

    def __init__(self) -> None:
        self._master, slave = pty.openpty()
        shell = os.environ.get("SHELL", "/bin/zsh")
        env = {**os.environ, "TERM": "xterm-256color", "COLORTERM": "truecolor"}
        self._proc = subprocess.Popen(
            [shell],
            stdin=slave,
            stdout=slave,
            stderr=slave,
            env=env,
            close_fds=True,
            preexec_fn=os.setsid,
        )
        os.close(slave)

    async def pump(self, send: Callable[[bytes], Awaitable[None]]) -> None:
        loop = asyncio.get_event_loop()
        while True:
            try:
                data = await loop.run_in_executor(None, lambda: os.read(self._master, 65536))
            except OSError:
                return
            if not data:
                return
            try:
                await send(data)
            except Exception:
                return

    async def handle(self, raw: Any, is_text: bool) -> None:
        if is_text:
            try:
                control = json.loads(raw)
                if control.get("type") == "resize":
                    _set_size(
                        self._master,
                        int(control.get("cols", 80)),
                        int(control.get("rows", 24)),
                    )
            except (ValueError, TypeError):
                pass
            return
        try:
            os.write(self._master, raw)
        except OSError:
            pass

    def close(self) -> None:
        try:
            os.killpg(self._proc.pid, 15)
        except Exception:
            pass
        try:
            self._proc.wait(timeout=2)
        except Exception:
            pass
        try:
            os.close(self._master)
        except OSError:
            pass


@app.websocket("/term")
async def term(websocket: WebSocket, token: str = ""):
    if not settings.term_token or token != settings.term_token:
        await websocket.close(code=4001, reason="bad token")
        return

    await websocket.accept()
    logger.info("terminal local conectado")

    session = TerminalSession()
    send_task = asyncio.create_task(session.pump(websocket.send_bytes))
    try:
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break
            raw = message.get("bytes") or message.get("text")
            if raw is None:
                continue
            await session.handle(raw, message.get("text") is not None)
    except WebSocketDisconnect:
        pass
    finally:
        send_task.cancel()
        session.close()
        logger.info("terminal local desconectado")


@app.get("/health")
async def health():
    return {"status": "ok", "terminal": True}


async def hub_bridge() -> None:
    """Mantiene viva la conexion con el hub para el terminal (acceso desde cualquier red)."""
    headers = {"Authorization": f"Bearer {settings.device_token}"}
    while True:
        try:
            logger.info("terminal: conectando al hub %s", HUB_TERM_URL)
            async with websockets.connect(
                HUB_TERM_URL, additional_headers=headers, ping_interval=20
            ) as ws:
                logger.info("terminal: conectado al hub")
                session = TerminalSession()
                send_task = asyncio.create_task(session.pump(ws.send))
                try:
                    async for raw in ws:
                        is_text = isinstance(raw, str)
                        await session.handle(raw, is_text)
                finally:
                    send_task.cancel()
                    session.close()
        except Exception as exc:
            logger.warning("terminal: conexion hub caida (%s); reintento en 5s", exc)
            await asyncio.sleep(5)


async def _tcp_pump_tcp_to_ws(
    reader: asyncio.StreamReader, ws: Any, conn_id: str
) -> None:
    """TCP -> hub (JSON base64 por conn_id)."""
    try:
        while True:
            data = await reader.read(65536)
            if not data:
                break
            await ws.send(
                json.dumps(
                    {"type": "data", "id": conn_id, "data": base64.b64encode(data).decode()}
                )
            )
    except Exception:
        pass
    finally:
        try:
            await ws.send(json.dumps({"type": "eof", "id": conn_id}))
        except Exception:
            pass


async def tcp_bridge() -> None:
    """Puente TCP Mac <-> hub (p. ej. SSH a :22); varias conexiones por conn_id."""
    headers = {"Authorization": f"Bearer {settings.device_token}"}
    while True:
        try:
            logger.info("tcp: conectando al hub %s", HUB_TCP_URL)
            async with websockets.connect(
                HUB_TCP_URL, additional_headers=headers, ping_interval=20
            ) as ws:
                logger.info("tcp: conectado al hub")
                conns: dict[str, asyncio.StreamWriter] = {}
                try:
                    async for raw in ws:
                        if not isinstance(raw, str):
                            continue
                        try:
                            frame = json.loads(raw)
                        except (ValueError, TypeError):
                            continue
                        ftype = frame.get("type")
                        cid = frame.get("id")
                        if ftype == "connect":
                            logger.info("tcp: abriendo conexion %s a %s:%s", cid, *TCP_TARGET)
                            try:
                                reader, writer = await asyncio.open_connection(*TCP_TARGET)
                            except Exception as exc:
                                logger.warning("tcp: no se pudo conectar a ssh (%s)", exc)
                                continue
                            conns[cid] = writer
                            asyncio.create_task(_tcp_pump_tcp_to_ws(reader, ws, cid))
                        elif ftype == "data":
                            writer = conns.get(cid)
                            if writer:
                                try:
                                    writer.write(base64.b64decode(frame.get("data", "")))
                                    await writer.drain()
                                except Exception:
                                    pass
                        elif ftype == "disconnect":
                            writer = conns.pop(cid, None)
                            if writer:
                                try:
                                    writer.close()
                                except Exception:
                                    pass
                finally:
                    for writer in conns.values():
                        try:
                            writer.close()
                        except Exception:
                            pass
        except Exception as exc:
            logger.warning("tcp: conexion hub caida (%s); reintento en 5s", exc)
            await asyncio.sleep(5)


async def main() -> None:
    config = uvicorn.Config(
        app,
        host="0.0.0.0",
        port=PORT,
        log_level="warning",
        ws_ping_interval=None,
        ws_ping_timeout=None,
    )
    server = uvicorn.Server(config)
    await asyncio.gather(server.serve(), hub_bridge(), tcp_bridge())


if __name__ == "__main__":
    asyncio.run(main())