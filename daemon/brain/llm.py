"""Capa LLM unificada con LiteLLM (Ollama, Gemini, Vertex AI, Claude, GPT, Groq, OpenRouter).

Garantia FREE: en modo free_only, Vertex AI (cuenta cloud con billing) queda
bloqueado a nivel de runtime para que la cuenta de Google nunca sea cobrada.
"""

import logging
import re
import time

import litellm

from brain import oauth
from config import DEFAULT_MODELS, settings

logger = logging.getLogger("daemon.llm")

_REFUSAL = (
    "Modo free_only: Vertex AI factura tu cuenta de cloud y esta bloqueado. "
    "Usa un proveedor gratuito (gemini, ollama) o confirma el pago por sesion."
)

_MAX_ATTEMPTS = 3
_FALLBACKS = {
    # orden por fiabilidad en el tier gratis de la cuenta (3.1-flash-lite es el mas rapido/estable)
    "gemini": ["gemini-3.1-flash-lite", "gemini-3.6-flash"],
}

# Último modelo que respondió (para mostrarlo en el chat)
last_model: str = ""


def _vertex_blocked() -> bool:
    """True si Vertex AI no debe usarse en el modo activo."""
    if settings.llm_provider != "vertex_ai":
        return False
    if settings.codex_allow_paid:
        return False
    from brain import model_probe

    billing = model_probe.billing_is_enabled(settings.vertex_project)
    return billing is not False  # activo o desconocido => bloqueado


def _is_transient(message: str) -> bool:
    """Errores temporales que merecen reintento (503/429/cuota/saturacion)."""
    low = message.lower()
    return any(
        k in low
        for k in (
            "503",
            "429",
            "high demand",
            "unavailable",
            "resource_exhausted",
            "rate limit",
            "try again later",
            "quota",
            "exceeded your current quota",
        )
    )


def _retry_wait(message: str) -> float:
    """Segundos a esperar si el error indica 'retry in Xs' (p. ej. cuota free tier)."""
    m = re.search(r"retry in ([0-9.]+)s", message, re.IGNORECASE)
    if m:
        return min(float(m.group(1)), 30.0)
    return 0.0


def _candidate_models() -> list[str]:
    """Modelos a probar en orden: el configurado y alternativas del mismo proveedor."""
    configured = settings.llm_model or DEFAULT_MODELS.get(settings.llm_provider, "")
    candidates = [configured] if configured else []
    for extra in _FALLBACKS.get(settings.llm_provider, []):
        if extra not in candidates:
            candidates.append(extra)
    return candidates or ["llama3.2"]


_PROVIDER_PREFIX = {
    "openrouter": "openrouter/",
    "gemini": "gemini/",
    "groq": "groq/",
    "anthropic": "anthropic/",
    "openai": "openai/",
    "ollama": "ollama/",
}


def _build_kwargs(prompt: str, model: str) -> dict:
    # Normaliza el prefijo del proveedor (p. ej. "gemini/", "openrouter/") para
    # que LiteLLM enrute el modelo al proveedor correcto.
    prefix = _PROVIDER_PREFIX.get(settings.llm_provider, "")
    if prefix and not model.startswith(prefix):
        model = f"{prefix}{model}"

    kwargs: dict = {"model": model, "messages": [{"role": "user", "content": prompt}]}

    if settings.llm_provider == "ollama":
        kwargs["api_base"] = settings.ollama_host
    elif settings.llm_provider == "gemini":
        kwargs["api_key"] = settings.gemini_api_key
    elif settings.llm_provider == "vertex_ai":
        kwargs["vertex_project"] = settings.vertex_project
        kwargs["vertex_location"] = settings.vertex_location
        # Vertex AI autentica con la cuenta de Google (ADC) via:
        #   gcloud auth application-default login
    elif settings.llm_provider == "openai":
        kwargs["api_key"] = settings.openai_api_key
    elif settings.llm_provider == "anthropic":
        kwargs["api_key"] = settings.anthropic_api_key
    elif settings.llm_provider == "groq":
        kwargs["api_key"] = settings.groq_api_key
    elif settings.llm_provider == "openrouter":
        kwargs["api_key"] = settings.openrouter_api_key
    return kwargs


def _gemini_oauth_call(prompt: str, model: str):
    """Llama a la API de Gemini con el token de la cuenta Google (free tier personal)."""
    import requests

    token = oauth.get_token()
    if not token:
        raise RuntimeError("No hay sesion iniciada con Google")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    resp = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "x-goog-user-project": oauth.USER_PROJECT,
        },
        json={"contents": [{"parts": [{"text": prompt}]}]},
        timeout=90,
    )
    if resp.status_code == 401:
        # el token pudo quedar revocado o invalido: refrescamos y reintentamos una vez
        logger.info("token OAuth 401, refrescando y reintentando (%s)", model)
        oauth._refresh()
        token = oauth.get_token()
        if token:
            resp = requests.post(
                url,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "x-goog-user-project": oauth.USER_PROJECT,
                },
                json={"contents": [{"parts": [{"text": prompt}]}]},
                timeout=90,
            )
    if resp.status_code != 200:
        raise RuntimeError(f"Gemini OAuth {resp.status_code}: {resp.text[:300]}")
    data = resp.json()
    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        raise RuntimeError(f"Respuesta inesperada: {str(data)[:300]}")
    return _FakeResponse(text, model)


class _FakeMessage:
    def __init__(self, content: str, model: str = ""):
        self.content = content
        self.model = model


class _FakeChoice:
    def __init__(self, content: str, model: str = ""):
        self.message = _FakeMessage(content, model)


class _FakeResponse:
    def __init__(self, content: str, model: str = ""):
        global last_model
        if model:
            last_model = model
        self.choices = [_FakeChoice(content, model)]


def complete(prompt: str, stream: bool = False):
    """Genera una respuesta del LLM con reintentos y fallback a otro modelo gratuito."""
    if _vertex_blocked():
        logger.warning("vertex_ai bloqueado en modo free_only (billing activo/desconocido)")
        raise RuntimeError(_REFUSAL)

    use_oauth = settings.llm_provider == "gemini" and oauth.is_logged_in()

    errors: list[str] = []
    for model in _candidate_models():
        kwargs = _build_kwargs(prompt, model) if not use_oauth else None
        for attempt in range(1, _MAX_ATTEMPTS + 1):
            logger.info("llm call provider=%s model=%s intento=%d oauth=%s", settings.llm_provider, model, attempt, use_oauth)
            try:
                if use_oauth:
                    return _gemini_oauth_call(prompt, model)
                global last_model
                last_model = model
                return litellm.completion(**kwargs, stream=stream)
            except Exception as exc:
                msg = str(exc)
                errors.append(f"{model} (intento {attempt}): {msg[:100]}")
                if _is_transient(msg) and attempt < _MAX_ATTEMPTS:
                    wait = _retry_wait(msg)
                    time.sleep(wait if wait > 0 else attempt)  # espera real o 1s, 2s...
                else:
                    break  # error no temporal (o agotados los intentos) => siguiente modelo

    joined = " | ".join(errors[-4:])
    if any(k in joined for k in ("more credits", "insufficient", "InsufficientBalance", "add funds", "requires more")):
        note = (
            "El modelo elegido es de pago y no hay saldo en esa cuenta. "
            "Elige un modelo ':free' (OpenRouter) o un modelo gratuito."
        )
    else:
        note = (
            "Reintenta en unos segundos, cambia de modelo, o (si es Gemini) "
            "revisa tu sesion de Google y los creditos en AI Studio."
        )
    raise RuntimeError(f"No pude generar respuesta: {note}\n{joined}")