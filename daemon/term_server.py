"""Terminal remoto de la Mac/PC: PTY real expuesto por WebSocket.

Sirve para conectarse desde el movil y ejecutar comandos (y los agentes
de IA configurados en la shell) directamente en el terminal.

Dos vias de acceso:
  - local  : ws://<IP>:8766/term?token=TERM_TOKEN   (misma red Wi-Fi)
  - nube   : se conecta al hub (agentrelay.duckdns.org/ws/mac/term) y desde
             cualquier red el celular entra por el hub

Sistemas:
  - POSIX (Linux/macOS): terminal PTY + tunel TCP (SSH/SCP/SFTP).
  - Windows: terminal interactivo (pywinpty) + tunel TCP (SSH/SCP/SFTP).

Protocolo (frames):
  - binarios: datos del terminal (salida de la shell / input del usuario)
  - texto   : JSON de control {"type":"resize","cols":C,"rows":R}
"""

import asyncio
import base64
import json
import logging
import os
import shutil
import struct
import subprocess
import sys
import time
from typing import Any, Awaitable, Callable

import uvicorn
import websockets
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from config import settings

IS_POSIX = os.name == "posix"
IS_WINDOWS = os.name == "nt"

HAS_PTY = False
TerminalSessionClass = None

if IS_POSIX:
    import fcntl
    import pty
    import termios
    HAS_PTY = True

    def _set_size(fd: int, cols: int, rows: int) -> None:
        try:
            fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
        except OSError:
            pass

    class PosixTerminalSession:
        """Una sesion de shell real (PTY) enlazada a un WebSocket."""

        def __init__(self) -> None:
            self._master, slave = pty.openpty()
            shell = os.environ.get("SHELL", "/bin/zsh" if sys.platform == "darwin" else "/bin/bash")
            tmux = shutil.which("tmux")
            if tmux:
                cmd = [tmux, "new-session", "-A", "-s", "agent"]
            else:
                cmd = [shell]
                if os.path.basename(shell) in ("zsh", "bash"):
                    cmd.append("-l")
            env = {**os.environ, "TERM": "xterm-256color", "COLORTERM": "truecolor"}
            self._proc = subprocess.Popen(
                cmd,
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
                decoded = raw.decode("utf-8")
            except Exception:
                decoded = None
            if decoded is not None:
                try:
                    control = json.loads(decoded)
                    if control.get("type") == "resize":
                        _set_size(
                            self._master,
                            int(control.get("cols", 80)),
                            int(control.get("rows", 24)),
                        )
                        return
                except (ValueError, TypeError):
                    pass
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

    TerminalSessionClass = PosixTerminalSession

elif IS_WINDOWS:
    try:
        from winpty import PtyProcess
        HAS_PTY = True

        class WindowsTerminalSession:
            def __init__(self) -> None:
                shell = os.environ.get("COMSPEC", "cmd.exe")
                self._proc = PtyProcess.spawn(shell)

            async def pump(self, send: Callable[[bytes], Awaitable[None]]) -> None:
                loop = asyncio.get_event_loop()
                while True:
                    try:
                        data = await loop.run_in_executor(None, lambda: self._proc.read(4096))
                    except Exception:
                        return
                    if not data:
                        return
                    try:
                        if isinstance(data, str):
                            data = data.encode("utf-8")
                        await send(data)
                    except Exception:
                        return

            async def handle(self, raw: Any, is_text: bool) -> None:
                if is_text:
                    try:
                        control = json.loads(raw)
                        if control.get("type") == "resize":
                            self._proc.set_size(
                                int(control.get("cols", 80)),
                                int(control.get("rows", 24)),
                            )
                    except (ValueError, TypeError):
                        pass
                    return
                try:
                    if isinstance(raw, bytes):
                        raw_str = raw.decode("utf-8", errors="replace")
                    else:
                        raw_str = raw
                except Exception:
                    raw_str = ""
                try:
                    control = json.loads(raw_str)
                    if control.get("type") == "resize":
                        self._proc.set_size(
                            int(control.get("cols", 80)),
                            int(control.get("rows", 24)),
                        )
                        return
                except (ValueError, TypeError):
                    pass
                try:
                    self._proc.write(raw_str)
                except Exception:
                    pass

            def close(self) -> None:
                try:
                    self._proc.close()
                except Exception:
                    pass

        TerminalSessionClass = WindowsTerminalSession
    except ImportError:
        pass

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("daemon.term")


async def _watchdog(ws: Any, stop: asyncio.Event, name: str = "") -> None:
    """Marca actividad del puente y cierra la conexion si el hub deja de
    responder pings (evita quedar colgado tras un redeploy o un corte de red
    que no cierra el TCP). Tambien evita que el supervisor reinicie el daemon
    por falsa inactividad mientras el puente esta conectado pero en calma."""
    while not stop.is_set():
        await asyncio.sleep(20)
        if name:
            _hb(name)
        try:
            pong = await asyncio.wait_for(ws.ping(), timeout=10)
            await asyncio.wait_for(pong, timeout=10)
        except Exception:
            logger.warning("watchdog: hub sin respuesta; reconectando")
            stop.set()
            try:
                await ws.close()
            except Exception:
                pass
            return
if not HAS_PTY:
    logger.warning("Soporte PTY no disponible en este sistema.")

app = FastAPI(title="Terminal Remoto", version="0.1.0")

PORT = 8766
HUB_TERM_URL = settings.hub_ws_url.replace("/ws/mac", "/ws/mac/term")
HUB_TCP_URL = settings.hub_ws_url.replace("/ws/mac", "/ws/mac/tcp")
HUB_REQ_URL = settings.hub_ws_url.replace("/ws/mac", "/ws/mac/req")
TCP_TARGET = ("127.0.0.1", 22)


@app.websocket("/term")
async def term(websocket: WebSocket, token: str = ""):
    if not HAS_PTY or not TerminalSessionClass:
        await websocket.close(code=1011, reason="PTY no soportado")
        return
    if not settings.term_token or token != settings.term_token:
        await websocket.close(code=4001, reason="bad token")
        return

    await websocket.accept()
    logger.info("terminal local conectado")

    session = TerminalSessionClass()
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

async def hub_bridge() -> None:
    """Mantiene viva la conexion con el hub para el terminal (acceso desde cualquier red)."""
    if not HAS_PTY or not TerminalSessionClass:
        return
    headers = {
        "Authorization": f"Bearer {settings.device_token}",
        "X-Device-Name": settings.device_name
    }
    while True:
        _hb("term")
        try:
            logger.info("terminal: conectando al hub %s", HUB_TERM_URL)
            async with websockets.connect(
                HUB_TERM_URL, additional_headers=headers, ping_interval=20
            ) as ws:
                logger.info("terminal: conectado al hub")
                stop = asyncio.Event()
                watchdog = asyncio.create_task(_watchdog(ws, stop, "term"))
                session = TerminalSessionClass()
                send_task = asyncio.create_task(session.pump(ws.send))
                try:
                    async for raw in ws:
                        is_text = isinstance(raw, str)
                        await session.handle(raw, is_text)
                finally:
                    stop.set()
                    watchdog.cancel()
                    send_task.cancel()
                    session.close()
        except Exception as exc:
            logger.warning("terminal: conexion hub caida (%s); reintento en 5s", exc)
            await asyncio.sleep(5)


@app.get("/health")
async def health():
    return {"status": "ok", "terminal": HAS_PTY, "tunnel": True}


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
    headers = {
        "Authorization": f"Bearer {settings.device_token}",
        "X-Device-Name": settings.device_name
    }
    while True:
        _hb("tcp")
        try:
            logger.info("tcp: conectando al hub %s", HUB_TCP_URL)
            async with websockets.connect(
                HUB_TCP_URL, additional_headers=headers, ping_interval=20
            ) as ws:
                logger.info("tcp: conectado al hub")
                stop = asyncio.Event()
                watchdog = asyncio.create_task(_watchdog(ws, stop, "tcp"))
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
                    stop.set()
                    watchdog.cancel()
                    for writer in conns.values():
                        try:
                            writer.close()
                        except Exception:
                            pass
        except Exception as exc:
            logger.warning("tcp: conexion hub caida (%s); reintento en 5s", exc)
            await asyncio.sleep(5)


async def req_bridge() -> None:
    """Canal de peticiones del hub: auto-acepta conexiones (daemon sin interfaz)."""
    headers = {
        "Authorization": f"Bearer {settings.device_token}",
        "X-Device-Name": settings.device_name
    }
    while True:
        _hb("req")
        try:
            logger.info("peticiones: conectando al hub %s", HUB_REQ_URL)
            async with websockets.connect(
                HUB_REQ_URL, additional_headers=headers, ping_interval=20
            ) as ws:
                logger.info("peticiones: canal listo (auto-acepta)")
                stop = asyncio.Event()
                watchdog = asyncio.create_task(_watchdog(ws, stop, "req"))
                try:
                    async for raw in ws:
                        if not isinstance(raw, str):
                            continue
                        try:
                            frame = json.loads(raw)
                        except (ValueError, TypeError):
                            continue
                        if frame.get("type") == "conn_req":
                            logger.info(
                                "peticiones: auto-aceptar %s de %s",
                                frame.get("kind"),
                                frame.get("from"),
                            )
                            await ws.send(
                                json.dumps({"type": "conn_ok", "id": frame.get("id"), "ok": True})
                            )
                finally:
                    stop.set()
                    watchdog.cancel()
        except Exception as exc:
            logger.warning("peticiones: conexion hub caida (%s); reintento en 5s", exc)
            await asyncio.sleep(5)


def _clear_port(port: int) -> None:
    """Si el puerto esta ocupado por un daemon previo, lo mata (evita SystemExit 3)."""
    if os.name == "nt":
        return
    try:
        out = subprocess.check_output(["lsof", "-ti", f"TCP:{port}"], text=True)
    except Exception:
        return
    for pid in out.split():
        if pid.isdigit() and int(pid) != os.getpid():
            logger.warning("puerto %s ocupado por pid %s; lo mato", port, pid)
            os.kill(int(pid), 9)


# latidos por puente (para el supervisor: detecta puentes colgados)
BRIDGE_HB: dict[str, float] = {"tcp": 0.0, "req": 0.0}
if HAS_PTY:
    BRIDGE_HB["term"] = 0.0


def _hb(name: str) -> None:
    BRIDGE_HB[name] = time.monotonic()


async def _supervisor() -> None:
    """Si un puente no marca actividad en 90s, reinicia el proceso (launchd lo revive).
    Evita quedar offline para siempre cuando el hub se reinicia y el daemon no reconecta."""
    while True:
        await asyncio.sleep(30)
        now = time.monotonic()
        for name, last in list(BRIDGE_HB.items()):
            if now - last > 90:
                logger.error("puente %s sin actividad (%ss); reinicio forzado", name, int(now - last))
                os._exit(1)


async def main() -> None:
    _clear_port(PORT)
    config = uvicorn.Config(
        app,
        host="0.0.0.0",
        port=PORT,
        log_level="warning",
        ws_ping_interval=None,
        ws_ping_timeout=None,
    )
    server = uvicorn.Server(config)
    tasks: list[Awaitable[None]] = [server.serve(), tcp_bridge(), req_bridge(), _supervisor()]
    if HAS_PTY:
        tasks.append(hub_bridge())
    await asyncio.gather(*tasks)


if __name__ == "__main__":
    asyncio.run(main())
