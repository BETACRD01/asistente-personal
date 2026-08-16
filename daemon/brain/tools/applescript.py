"""Ejecución de AppleScript / JXA para controlar apps, Finder y UI."""

import asyncio
import json

from .bash import ToolError, run_bash


async def run_applescript(script: str) -> str:
    """Ejecuta un script AppleScript con osascript."""
    if not script.strip():
        raise ToolError("AppleScript vacio")
    return await run_bash(f"osascript -e {_quote(script)}")


async def run_jxa(script: str) -> str:
    """Ejecuta JavaScript (JXA) con osascript, devolviendo JSON cuando aplique."""
    if not script.strip():
        raise ToolError("JXA vacio")
    return await run_bash(f"osascript -l JavaScript -e {_quote(script)}")


def _quote(value: str) -> str:
    return json.dumps(value)