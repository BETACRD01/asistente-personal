"""Herramientas que el agente puede ejecutar en la Mac."""

from .bash import run_bash
from .applescript import run_applescript, run_jxa
from .image import generate_image

__all__ = ["run_bash", "run_applescript", "run_jxa", "generate_image"]