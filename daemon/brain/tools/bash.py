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


def _adminize(command: str) -> str:
    """Con permisos de administrador, 'sudo <cmd>' usa el prompt de macOS."""
    if not settings.admin_mode:
        return command
    stripped = command.lstrip()
    if not stripped.startswith("sudo "):
        return command
    inner = stripped[5:].strip()
    escaped = inner.replace("\\", "\\\\").replace('"', '\\"')
    return f'osascript -e \'do shell script "{escaped}" with administrator privileges\''


async def run_bash(command: str) -> str:
    """Ejecuta un comando de terminal y devuelve stdout+stderr."""
    _validate(command)
    from projects import get_workspace

    cwd = get_workspace()
    command = _adminize(command)
    proc = await asyncio.create_subprocess_shell(
        command,
        cwd=cwd,
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