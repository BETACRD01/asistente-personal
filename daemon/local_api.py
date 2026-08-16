"""API local del daemon para la app de escritorio (solo 127.0.0.1:8765).

Endpoints:
  GET  /api/config      estado actual (proveedor, modelo, guard free)
  GET  /api/probe       escaneo de modelos + seleccion (tarda ~30s)
  POST /api/configure   cambiar proveedor (free providers; vertex_ai bloqueado)
  WS   /ws              chat streaming (protocolo igual al Hub: token/stdout/done)
"""

import json
import logging

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from config import settings

logger = logging.getLogger("daemon.local")

app = FastAPI(title="Codex local", version="0.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/projects")
def projects():
    """Lista carpetas de proyectos (Developer, Desktop, Documents)."""
    from pathlib import Path

    home = Path.home()
    found = []
    for folder in ("Developer", "Desktop", "Documents"):
        base = home / folder
        if base.is_dir():
            for child in sorted(base.iterdir()):
                if child.is_dir() and not child.name.startswith("."):
                    found.append(str(child))
    return {"projects": found}


@app.get("/api/config")
def config():
    from brain.llm import _vertex_blocked

    return {
        "provider": settings.llm_provider,
        "model": settings.litellm_model,
        "mode": settings.codex_mode,
        "vertex_blocked": _vertex_blocked(),
        "project": settings.vertex_project,
    }


@app.get("/api/probe")
def probe():
    from brain.selector import resolve

    report = resolve()
    return {
        "billing": report["billing"],
        "mode": report["mode"],
        "results": report["results"],
        "chosen": report["chosen"],
    }


@app.post("/api/configure")
def configure(body: dict):
    import configure as cfg

    provider = body.get("provider", "")
    key = body.get("key", "")
    if provider not in cfg.PROVIDERS:
        return {"ok": False, "error": f"proveedor desconocido: {provider}"}
    if provider == "vertex_ai":
        return {"ok": False, "error": "vertex_ai factura tu cuenta cloud y esta bloqueado; usa un proveedor gratuito"}

    info = cfg.PROVIDERS[provider]
    if info["key_env"] and not key:
        if not cfg.read_env().get(info["key_env"]):
            return {"ok": False, "error": f"falta la API key de {provider}"}

    env = cfg.read_env()
    env["LLM_PROVIDER"] = provider
    if info["key_env"] and key:
        env[info["key_env"]] = key
    env["LLM_MODEL"] = info["model"]
    cfg.write_env(env)

    # reflejar el cambio en memoria (sin reiniciar el daemon)
    settings.llm_provider = provider
    settings.llm_model = info["model"]
    if info["key_env"] and key:
        setattr(settings, info["key_env"].lower(), key)
    return {"ok": True, "provider": provider, "model": info["model"]}


@app.get("/api/account")
def account():
    """Cuenta de Google activa en esta Mac (para login personal)."""
    email = ""
    try:
        r = subprocess.run(
            ["gcloud", "config", "get-value", "account"],
            capture_output=True, text=True, timeout=10,
        )
        email = (r.stdout or "").strip()
        if email in ("", "(unset)", "None"):
            email = ""
    except Exception as exc:
        logger.warning("no se pudo leer cuenta gcloud: %s", exc)
    return {"ok": True, "email": email, "logged": bool(email)}


@app.post("/api/login")
def login():
    """Inicia sesion con la cuenta de Google (abre el navegador, OAuth de gcloud)."""
    import subprocess

    try:
        r = subprocess.run(
            ["gcloud", "auth", "application-default", "login", "--force"],
            capture_output=True, text=True, timeout=180,
        )
        ok = r.returncode == 0
        return {"ok": ok, "error": None if ok else (r.stderr or r.stdout or "error al iniciar sesion")[:300]}
    except Exception as exc:
        return {"ok": False, "error": str(exc)[:300]}


@app.post("/api/model")
def set_model(body: dict):
    """Cambia el modelo activo (escribe LLM_MODEL y lo aplica en memoria)."""
    import configure as cfg

    model = (body.get("model") or "").strip()
    if not model:
        return {"ok": False, "error": "falta modelo"}
    env = cfg.read_env()
    env["LLM_MODEL"] = model
    cfg.write_env(env)
    settings.llm_model = model
    logger.info("modelo cambiado a %s", model)
    return {"ok": True, "model": model}


@app.websocket("/ws")
async def ws(websocket: WebSocket):
    from main import handle_command

    await websocket.accept()
    logger.info("escritorio conectado")
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "JSON invalido"})
                continue
            if message.get("type") == "command":
                async for reply in handle_command(message):
                    await websocket.send_json(reply)
    except WebSocketDisconnect:
        logger.info("escritorio desconectado")


async def run_local_server() -> None:
    """Levanta la API local (127.0.0.1:8765)."""
    config = uvicorn.Config(app, host="127.0.0.1", port=8765, log_level="warning")
    server = uvicorn.Server(config)
    await server.serve()