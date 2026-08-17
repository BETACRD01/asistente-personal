"""Terminal remoto de la Mac: PTY real expuesto por WebSocket.

Sirve para conectarse desde el móvil y ejecutar comandos (y los agentes
de IA configurados en la shell) directamente en el terminal de la Mac.

Escucha en 0.0.0.0:8766 (solo ruta /term) con autenticacion por token.

Protocolo:
  - frames binarios: datos del terminal (salida de la shell / input del usuario)
  - frames de texto: JSON de control {"type":"resize","cols":C,"rows":R}
"""

import asyncio
import fcntl
import json
import logging
import os
import pty
import struct
import subprocess
import termios

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("daemon.term")

app = FastAPI(title="Terminal Remoto", version="0.1.0")

PORT = 8766


def _set_size(fd: int, cols: int, rows: int) -> None:
    try:
        fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
    except OSError:
        pass


@app.websocket("/term")
async def term(websocket: WebSocket, token: str = ""):
    if not settings.term_token or token != settings.term_token:
        await websocket.close(code=4001, reason="bad token")
        return

    await websocket.accept()
    logger.info("terminal conectado")

    master, slave = pty.openpty()
    shell = os.environ.get("SHELL", "/bin/zsh")
    env = {**os.environ, "TERM": "xterm-256color", "COLORTERM": "truecolor"}
    proc = subprocess.Popen(
        [shell],
        stdin=slave,
        stdout=slave,
        stderr=slave,
        env=env,
        close_fds=True,
        preexec_fn=os.setsid,
    )
    os.close(slave)

    loop = asyncio.get_event_loop()
    send_task: asyncio.Task | None = None

    def read_pty() -> bytes:
        try:
            return os.read(master, 65536)
        except OSError:
            return b""

    async def pump_pty() -> None:
        while True:
            data = await loop.run_in_executor(None, read_pty)
            if not data:
                break
            try:
                await websocket.send_bytes(data)
            except Exception:
                break

    send_task = asyncio.create_task(pump_pty())
    try:
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break
            raw = message.get("bytes") or message.get("text")
            if raw is None:
                continue
            if message.get("text") is not None:
                try:
                    control = json.loads(raw)
                    if control.get("type") == "resize":
                        _set_size(master, int(control.get("cols", 80)), int(control.get("rows", 24)))
                except (ValueError, TypeError):
                    pass
                continue
            try:
                os.write(master, raw)
            except OSError:
                break
    except WebSocketDisconnect:
        pass
    finally:
        if send_task:
            send_task.cancel()
        try:
            os.killpg(proc.pid, 15)
        except Exception:
            pass
        try:
            proc.wait(timeout=2)
        except Exception:
            pass
        try:
            os.close(master)
        except OSError:
            pass
        logger.info("terminal desconectado")


@app.get("/health")
async def health():
    return {"status": "ok", "terminal": True}


def main() -> None:
    config = uvicorn.Config(
        app,
        host="0.0.0.0",
        port=PORT,
        log_level="warning",
        ws_ping_interval=None,
        ws_ping_timeout=None,
    )
    server = uvicorn.Server(config)
    asyncio.run(server.serve())


if __name__ == "__main__":
    main()