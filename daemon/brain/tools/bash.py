"""Ejecución de comandos Bash en la Mac."""

import asyncio
import shlex

from config import settings

BASH_BLOCKLIST = [
    "rm -rf /",
    ":(){",
    "mkfs.",
    "dd if=/dev/",
    "> /dev/sda",
    "shutdown",
    "reboot",
]


class ToolError(Exception):
    pass


def _validate(cmd: str) -> None:
    if not cmd.strip():
        raise ToolError("Comando vacio")
    if len(cmd) > settings.max_command_length:
        raise ToolError("Comando demasiado largo")
    for blocked in BASH_BLOCKLIST:
        if blocked in cmd:
            raise ToolError(f"Comando bloqueado: contiene {blocked!r}")


async def run_bash(command: str) -> str:
    """Ejecuta un comando de terminal y devuelve stdout+stderr."""
    _validate(command)
    proc = await asyncio.create_subprocess_shell(
        command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(), timeout=settings.bash_timeout_seconds
        )
    except asyncio.TimeoutError:
        proc.kill()
        raise ToolError(f"El comando excedio {settings.bash_timeout_seconds}s y fue cancelado")
    if proc.returncode != 0:
        raise ToolError(stderr.decode(errors="replace").strip())
    return stdout.decode(errors="replace").strip()