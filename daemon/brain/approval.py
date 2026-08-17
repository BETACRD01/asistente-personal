"""Aprobacion de acciones del agente (Preguntar siempre / Aprobar por mi / Acceso completo).

El agente pide aprobacion por el WebSocket local antes de ejecutar una
accion, y espera la respuesta del usuario (con tiempo maximo).
"""

import asyncio
import logging
import time

from config import settings

logger = logging.getLogger("daemon.approval")

_pending: dict[str, asyncio.Future] = {}
_sender = None  # coroutine que envia mensajes por el WS local (websocket.send_json)


def set_sender(fn) -> None:
    global _sender
    _sender = fn


_UNSAFE = {
    "sudo": "requiere permisos de administrador",
    "rm ": "borra archivos",
    "mv ": "mueve o renombra archivos",
    "cp ": "copia archivos",
    "curl": "usa internet",
    "wget": "usa internet",
    "ssh": "conexion remota",
    "scp": "transferencia remota",
    "nc ": "red",
    "netcat": "red",
    "brew install": "instala software",
    "pip install": "instala paquetes",
    "npm install": "instala dependencias",
    "git clone": "descarga un repositorio",
    "diskutil": "gestiona discos",
    "launchctl": "gestiona servicios del sistema",
    "chmod": "cambia permisos de archivos",
    "chown": "cambia el propietario de archivos",
    "kill ": "termina procesos",
    "pkill": "termina procesos",
    "killall": "termina procesos",
    "http://": "usa internet",
    "https://": "usa internet",
    "wget": "usa internet",
}


def _unsafe_reason(command: str) -> str | None:
    low = command.lower()
    for pattern, reason in _UNSAFE.items():
        if pattern in low:
            return reason
    return None


def _needs_approval(command: str) -> str | None:
    mode = settings.approval_mode
    if mode == "full":
        return None
    if mode == "always":
        return "pregunta siempre activa"
    return _unsafe_reason(command)


async def request_approval(command: str) -> bool:
    """Pide aprobacion si el modo lo requiere. Devuelve True si se aprueba."""
    reason = _needs_approval(command)
    if reason is None:
        return True
    if _sender is None:
        logger.warning("sin canal de aprobacion (Hub): se permite la accion")
        return True

    key = f"a{int(time.time() * 1000)}"
    future = asyncio.get_event_loop().create_future()
    _pending[key] = future
    try:
        await _sender({"type": "approval_request", "id": key, "command": command, "reason": reason})
        try:
            return await asyncio.wait_for(future, timeout=settings.approval_timeout_seconds)
        except asyncio.TimeoutError:
            logger.warning("aprobacion agotada para %s", key)
            return False
    finally:
        _pending.pop(key, None)


def resolve(key: str, approved: bool) -> None:
    future = _pending.get(key)
    if future and not future.done():
        future.set_result(approved)