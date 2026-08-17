"""Login con cuenta de Google (OAuth para app de escritorio) y uso de Gemini
con el token de la cuenta personal (free tier, sin API key y sin cobro).

Flujo:
  /api/login  -> abre el navegador con la URL de autorizacion
  /oauth/callback?code=... -> canjea el codigo por tokens y los guarda en .env
  get_token() -> devuelve un access token valido (refresca si expiro)
"""

import logging
import time
import urllib.parse
import webbrowser

import requests

from config import settings
from configure import read_env, write_env

logger = logging.getLogger("daemon.oauth")

TOKEN_URL = "https://oauth2.googleapis.com/token"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
REDIRECT_URI = "http://localhost:8765/oauth/callback"
USER_PROJECT = "agentrelay-oauth-free"
SCOPES = (
    "openid email "
    "https://www.googleapis.com/auth/cloud-platform "
    "https://www.googleapis.com/auth/generative-language.retriever"
)

# Lista curada: pro, flash y nuevos clave (sin previews ruidosos ni duplicados)
PREFERRED_MODELS = [
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-3.1-pro-preview",
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-3-flash-preview",
]

CLIENT_ID = settings.gemini_oauth_client_id
CLIENT_SECRET = settings.gemini_oauth_client_secret


def configured() -> bool:
    return bool(CLIENT_ID and CLIENT_SECRET)


def auth_url() -> str:
    params = {
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPES,
        "access_type": "offline",
        "prompt": "consent",
    }
    return f"{AUTH_URL}?{urllib.parse.urlencode(params)}"


def start_login() -> bool:
    """Abre el navegador con la URL de autorizacion."""
    if not configured():
        raise RuntimeError("Falta el Client ID/Secret de OAuth")
    return webbrowser.open(auth_url())


def _save_tokens(data: dict) -> None:
    now = time.time()
    env = read_env()
    if data.get("access_token"):
        env["GEMINI_OAUTH_ACCESS_TOKEN"] = data["access_token"]
        env["GEMINI_OAUTH_EXPIRES_AT"] = str(int(now + data.get("expires_in", 3600) - 60))
    if data.get("refresh_token"):
        env["GEMINI_OAUTH_REFRESH_TOKEN"] = data["refresh_token"]
    write_env(env)
    settings.gemini_oauth_access_token = env.get("GEMINI_OAUTH_ACCESS_TOKEN", "")
    settings.gemini_oauth_refresh_token = env.get("GEMINI_OAUTH_REFRESH_TOKEN", "")
    settings.gemini_oauth_expires_at = float(env.get("GEMINI_OAUTH_EXPIRES_AT", "0"))


def exchange_code(code: str) -> None:
    """Canjea el codigo de autorizacion por tokens."""
    if not configured():
        raise RuntimeError("Falta el Client ID/Secret de OAuth")
    r = requests.post(
        TOKEN_URL,
        data={
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": REDIRECT_URI,
        },
        timeout=30,
    )
    data = r.json()
    if "access_token" not in data:
        raise RuntimeError(data.get("error_description") or data.get("error") or str(data))
    _save_tokens(data)


def _refresh() -> None:
    if not settings.gemini_oauth_refresh_token:
        raise RuntimeError("Sin refresh token: vuelve a iniciar sesion con Google")
    r = requests.post(
        TOKEN_URL,
        data={
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "refresh_token": settings.gemini_oauth_refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=30,
    )
    data = r.json()
    if "access_token" not in data:
        raise RuntimeError(data.get("error_description") or data.get("error") or str(data))
    _save_tokens(data)


def get_token() -> str | None:
    """Access token valido, refrescandolo si es necesario."""
    if not is_logged_in():
        return None
    if not settings.gemini_oauth_access_token or time.time() >= settings.gemini_oauth_expires_at:
        _refresh()
    return settings.gemini_oauth_access_token


def is_logged_in() -> bool:
    return configured() and bool(settings.gemini_oauth_refresh_token)


def get_email() -> str:
    token = get_token()
    if not token:
        return ""
    try:
        r = requests.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        if r.ok:
            return r.json().get("email", "")
    except Exception as exc:
        logger.warning("no se pudo leer email de sesion: %s", exc)
    return ""


def list_models() -> list[str]:
    """Modelos disponibles para la cuenta logueada (API de Gemini)."""
    token = get_token()
    if not token:
        return []
    r = requests.get(
        "https://generativelanguage.googleapis.com/v1beta/models",
        headers={"Authorization": f"Bearer {token}", "x-goog-user-project": USER_PROJECT},
        params={"pageSize": 100},
        timeout=30,
    )
    if r.status_code != 200:
        raise RuntimeError(f"{r.status_code}: {r.text[:200]}")
    names = [m.get("name", "").removeprefix("models/") for m in r.json().get("models", [])]
    available = set(names)
    return [m for m in PREFERRED_MODELS if m in available]


def is_paid_model(name: str) -> bool:
    """Modelos premium (pro/preview) frente a los de free tier."""
    return "pro" in name or "preview" in name