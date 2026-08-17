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
from fastapi.responses import HTMLResponse

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
    """Carpetas de trabajo guardadas por el usuario + la activa."""
    from projects import state

    st = state()
    return {"projects": st["projects"], "active": st["active"]}


@app.post("/api/projects")
def add_project(body: dict):
    """Añade una carpeta de trabajo (la deja activa)."""
    from projects import add_project as _add

    return _add(body.get("path", ""))


@app.post("/api/projects/remove")
def remove_project(body: dict):
    """Elimina una carpeta de trabajo."""
    from projects import remove_project as _remove

    return _remove(body.get("path", ""))


@app.post("/api/project")
def set_project(body: dict):
    """Cambia la carpeta de trabajo activa."""
    from projects import set_active

    return set_active(body.get("path", ""))


@app.get("/api/config")
def config():
    from brain.llm import _vertex_blocked

    return {
        "provider": settings.llm_provider,
        "model": settings.litellm_model,
        "mode": settings.codex_mode,
        "vertex_blocked": _vertex_blocked(),
        "project": settings.vertex_project,
        "admin": settings.admin_mode,
        "workspace": settings.workspace,
        "approval": settings.approval_mode,
        "keys": {
            "gemini": bool(settings.gemini_api_key),
            "openai": bool(settings.openai_api_key),
            "anthropic": bool(settings.anthropic_api_key),
            "groq": bool(settings.groq_api_key),
            "openrouter": bool(settings.openrouter_api_key),
        },
    }


@app.post("/api/logout")
def logout():
    """Cierra la sesion de Google (revoca el token y borra las credenciales)."""
    from brain import oauth

    oauth.logout()
    return {"ok": True}


@app.post("/api/key/remove")
def remove_key(body: dict):
    """Elimina la API key guardada de un proveedor."""
    import configure as cfg

    provider = body.get("provider", "")
    info = cfg.PROVIDERS.get(provider)
    if not info or not info.get("key_env"):
        return {"ok": False, "error": f"el proveedor {provider!r} no guarda API key"}
    env = cfg.read_env()
    env.pop(info["key_env"], None)
    cfg.write_env(env)
    setattr(settings, info["key_env"].lower(), "")
    logger.info("API key eliminada: %s", info["key_env"])
    return {"ok": True, "removed": info["key_env"]}


@app.post("/api/admin")
def set_admin(body: dict):
    """Activa/desactiva permisos de administrador (sudo con prompt de macOS)."""
    import configure as cfg

    enabled = bool(body.get("enabled"))
    env = cfg.read_env()
    env["ADMIN_MODE"] = "true" if enabled else "false"
    cfg.write_env(env)
    settings.admin_mode = enabled
    logger.info("permisos de administrador: %s", "activados" if enabled else "desactivados")
    return {"ok": True, "admin": enabled}


@app.post("/api/approval")
def set_approval(body: dict):
    """Cambia el modo de aprobacion: always (preguntar siempre) | smart (solo inseguras) | full (acceso completo)."""
    import configure as cfg

    mode = body.get("mode", "")
    if mode not in ("always", "smart", "full"):
        return {"ok": False, "error": "modo invalido (always|smart|full)"}
    env = cfg.read_env()
    env["APPROVAL_MODE"] = mode
    cfg.write_env(env)
    settings.approval_mode = mode
    logger.info("modo de aprobacion: %s", mode)
    return {"ok": True, "mode": mode}


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

    # Gemini: con sesion iniciada en Google la API key es opcional
    needs_key = bool(info["key_env"]) and not key
    if needs_key and provider == "gemini":
        from brain import oauth

        if oauth.is_logged_in():
            needs_key = False
    if needs_key and not cfg.read_env().get(info["key_env"]):
        hint = " o inicia sesion con Google" if provider == "gemini" else ""
        return {"ok": False, "error": f"falta la API key de {provider}{hint}"}

    env = cfg.read_env()
    old_provider = env.get("LLM_PROVIDER")
    env["LLM_PROVIDER"] = provider
    if info["key_env"] and key:
        env[info["key_env"]] = key
    # conserva el modelo elegido si es el mismo proveedor
    if provider != old_provider or not env.get("LLM_MODEL"):
        env["LLM_MODEL"] = info["model"]
    cfg.write_env(env)

    # reflejar el cambio en memoria (sin reiniciar el daemon)
    settings.llm_provider = provider
    settings.llm_model = env.get("LLM_MODEL") or info["model"]
    if info["key_env"] and key:
        setattr(settings, info["key_env"].lower(), key)
    return {"ok": True, "provider": provider, "model": settings.llm_model}


@app.get("/api/account")
def account():
    """Estado de la sesion de Google (OAuth de la cuenta personal)."""
    from brain import oauth

    if oauth.is_logged_in():
        return {"ok": True, "email": oauth.get_email() or "", "logged": True}
    return {"ok": True, "email": "", "logged": False}


@app.get("/api/oauth/status")
def oauth_status():
    from brain import oauth

    return {"ok": True, "logged": oauth.is_logged_in(), "email": oauth.get_email() if oauth.is_logged_in() else ""}


@app.get("/api/models")
def models():
    """Modelos disponibles para la sesion actual (cuenta Google o API key)."""
    from brain import oauth
    from brain import models as model_list

    if oauth.is_logged_in():
        try:
            names = oauth.list_models()
            if names:
                return {"ok": True, "logged": True, "models": names}
        except Exception as exc:
            logger.warning("no se pudieron listar modelos de la cuenta: %s", exc)
    names = model_list.list_key_models(settings.llm_provider)
    if not names:
        names = model_list.default_models(settings.llm_provider)
    return {"ok": True, "logged": oauth.is_logged_in(), "models": names}


@app.post("/api/login")
def login():
    """Inicia sesion con la cuenta de Google: abre el navegador y espera el callback."""
    from brain import oauth

    if not oauth.configured():
        return {"ok": False, "error": "Falta configurar el Client ID/Secret de OAuth"}
    try:
        opened = oauth.start_login()
        return {"ok": True, "url": oauth.auth_url(), "opened": opened}
    except Exception as exc:
        return {"ok": False, "error": str(exc)[:300]}


@app.get("/oauth/callback")
def oauth_callback(code: str = ""):
    """Recibe el codigo de Google, guarda la sesion y muestra confirmacion."""
    from brain import oauth

    try:
        oauth.exchange_code(code)
        return HTMLResponse(
            "<html><body style='font-family:sans-serif;text-align:center;padding:40px'>"
            "<h2>✓ Sesión iniciada con Google</h2>"
            "<p>Puedes cerrar esta pestaña y volver a AgentRelay.</p></body></html>"
        )
    except Exception as exc:
        return HTMLResponse(
            "<html><body style='font-family:sans-serif;text-align:center;padding:40px'>"
            f"<h2>⚠ Error</h2><p>{exc}</p></body></html>"
        )


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


@app.get("/api/conversations")
def conversations():
    """Lista las conversaciones guardadas (id, titulo, fechas, n. de mensajes)."""
    from conversations import list_conversations

    return {"ok": True, "conversations": list_conversations()}


@app.get("/api/conversations/{conv_id}")
def conversation(conv_id: str):
    from conversations import get

    conv = get(conv_id)
    if not conv:
        return {"ok": False, "error": "no existe"}
    return {"ok": True, "conversation": conv}


@app.post("/api/conversations")
def save_conversation(body: dict):
    """Guarda (crea o actualiza) una conversacion completa."""
    from conversations import upsert

    conv_id = body.get("id", "")
    if not conv_id:
        return {"ok": False, "error": "falta el id de la conversacion"}
    conv = {
        "id": conv_id,
        "title": body.get("title", "Conversación"),
        "messages": body.get("messages", []),
    }
    upsert(conv)
    return {"ok": True}


@app.post("/api/conversations/delete")
def delete_conversation(body: dict):
    from conversations import delete

    return {"ok": delete(body.get("id", ""))}


@app.websocket("/ws")
async def ws(websocket: WebSocket):
    from main import handle_command
    from brain import approval

    await websocket.accept()
    logger.info("escritorio conectado")
    approval.set_sender(websocket.send_json)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "JSON invalido"})
                continue
            if message.get("type") == "approval_response":
                approval.resolve(message.get("id", ""), bool(message.get("approved")))
                continue
            if message.get("type") == "command":
                async for reply in handle_command(message):
                    await websocket.send_json(reply)
    except WebSocketDisconnect:
        logger.info("escritorio desconectado")
        approval.set_sender(None)


async def run_local_server() -> None:
    """Levanta la API local (127.0.0.1:8765)."""
    config = uvicorn.Config(
        app,
        host="127.0.0.1",
        port=8765,
        log_level="warning",
        ws_ping_interval=None,
        ws_ping_timeout=None,
    )
    server = uvicorn.Server(config)
    await server.serve()