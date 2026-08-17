"""Persistencia de proyectos (carpetas de trabajo) del daemon.

Guarda la lista de carpetas elegidas por el usuario y la carpeta activa
en un JSON local (daemon/projects.json). Los comandos del agente se
ejecutan dentro de la carpeta activa (workspace).
"""

import json
import logging
from pathlib import Path

from config import settings

logger = logging.getLogger("daemon.projects")

PROJECTS_FILE = Path(__file__).resolve().parent / "projects.json"


def _load() -> dict:
    try:
        data = json.loads(PROJECTS_FILE.read_text())
        if isinstance(data, dict):
            return data
    except Exception as exc:
        logger.warning("no se pudo leer projects.json: %s", exc)
    return {"list": [], "active": ""}


def _save(data: dict) -> None:
    PROJECTS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False))


def list_projects() -> list[str]:
    """Carpetas guardadas que siguen existiendo."""
    data = _load()
    return [p for p in data.get("list", []) if p and Path(p).is_dir()]


def add_project(path: str) -> dict:
    """Añade una carpeta de trabajo y la deja activa."""
    path = path.strip()
    if not path:
        return {"ok": False, "error": "ruta vacia"}
    if not Path(path).is_dir():
        return {"ok": False, "error": f"no existe la carpeta: {path}"}
    data = _load()
    data["list"] = [p for p in data.get("list", []) if p != path] + [path]
    data["active"] = path
    _save(data)
    settings.workspace = path
    logger.info("proyecto añadido y activado: %s", path)
    return {"ok": True}


def remove_project(path: str) -> dict:
    data = _load()
    data["list"] = [p for p in data.get("list", []) if p != path]
    if data.get("active") == path:
        data["active"] = data["list"][0] if data["list"] else ""
    _save(data)
    if data["active"]:
        settings.workspace = data["active"]
    logger.info("proyecto eliminado: %s", path)
    return {"ok": True}


def set_active(path: str) -> dict:
    data = _load()
    if path not in data.get("list", []) or not Path(path).is_dir():
        return {"ok": False, "error": f"proyecto no guardado o inexistente: {path}"}
    data["active"] = path
    _save(data)
    settings.workspace = path
    logger.info("proyecto activo: %s", path)
    return {"ok": True}


def get_active() -> str:
    data = _load()
    active = data.get("active", "")
    if active and Path(active).is_dir():
        settings.workspace = active
        return active
    for p in data.get("list", []):
        if p and Path(p).is_dir():
            settings.workspace = p
            return p
    return ""


def state() -> dict:
    return {"projects": list_projects(), "active": get_active()}


def get_workspace() -> str:
    """Carpeta donde ejecutar los comandos (active, o home si no hay)."""
    return get_active() or str(Path.home())