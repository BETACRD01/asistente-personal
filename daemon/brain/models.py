"""Lista los modelos disponibles de cada proveedor usando su API key."""

import logging

import requests

from config import settings

logger = logging.getLogger("daemon.models")

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
OPENAI_BASE = "https://api.openai.com/v1/models"
GROQ_BASE = "https://api.groq.com/openai/v1/models"
OPENROUTER_BASE = "https://openrouter.ai/api/v1/models"
ANTHROPIC_BASE = "https://api.anthropic.com/v1/models"

_EXCLUDE = (
    "embedding",
    "aqa",
    "tts",
    "audio",
    "live",
    "robotics",
    "computer-use",
    "translate",
    "search",
    "whisper",
    "dall-e",
    "moderation",
    "realtime",
    "tokenizer",
    "pretraining",
    "imagen",
    "image",
)

DEFAULT_FALLBACK = {
    "ollama": ["llama3.2", "llama3.1"],
    "gemini": ["gemini-3.6-flash", "gemini-3.1-flash-lite"],
    "vertex_ai": ["gemini-2.5-flash"],
    "openai": ["gpt-4o", "gpt-4o-mini"],
    "anthropic": ["claude-sonnet-4-20250514", "claude-haiku-3-5-20241022"],
    "groq": ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
    "openrouter": ["google/gemini-2.0-flash-001", "anthropic/claude-sonnet-4-20250514"],
}


def _fetch(url: str, headers: dict, params: dict | None = None, timeout: int = 30) -> dict:
    resp = requests.get(url, headers=headers, params=params, timeout=timeout)
    if resp.status_code != 200:
        logger.warning("no se pudieron listar modelos (%s): %s", url, resp.text[:150])
        return {}
    try:
        return resp.json()
    except ValueError:
        return {}


def _filtered(names: list[str]) -> list[str]:
    out = []
    for n in names:
        low = n.lower()
        if any(x in low for x in _EXCLUDE):
            continue
        out.append(n)
    return out


def _list_gemini(key: str) -> list[str]:
    data = _fetch(GEMINI_BASE, {"x-goog-api-key": key}, {"pageSize": 100})
    names = [m.get("name", "").replace("models/", "") for m in data.get("models", [])]
    models = [n for n in names if n.startswith("gemini-")]
    models = _filtered(models)
    # primero los estables 3.x / 2.5, luego previews
    models.sort(key=lambda m: ("preview" in m, "-live" in m, "-tts" in m, m))
    return models


def _list_openai(key: str, base: str) -> list[str]:
    data = _fetch(base, {"Authorization": f"Bearer {key}"})
    names = [m.get("id", "") for m in data.get("data", [])]
    models = _filtered(names)
    models.sort(key=lambda m: (not m.startswith("gpt"), not m.startswith("o"), m))
    return models


def _list_anthropic(key: str) -> list[str]:
    data = _fetch(
        ANTHROPIC_BASE,
        {"x-api-key": key, "anthropic-version": "2023-06-01"},
        {"limit": 100},
    )
    return [m.get("id", "") for m in data.get("data", [])]


def _list_openrouter(key: str) -> list[str]:
    data = _fetch(OPENROUTER_BASE, {"Authorization": f"Bearer {key}"})
    names = [m.get("id", "") for m in data.get("data", [])]
    models = _filtered(names)
    models.sort(key=lambda m: (m.split("/")[0] if "/" in m else m, m))
    return models[:120]


def list_key_models(provider: str) -> list[str]:
    """Modelos reales del proveedor usando su API key (si hay)."""
    keys = {
        "gemini": settings.gemini_api_key,
        "openai": settings.openai_api_key,
        "anthropic": settings.anthropic_api_key,
        "groq": settings.groq_api_key,
        "openrouter": settings.openrouter_api_key,
    }
    key = keys.get(provider)
    if not key:
        return []
    try:
        if provider == "gemini":
            return _list_gemini(key)
        if provider == "openai":
            return _list_openai(key, OPENAI_BASE)
        if provider == "groq":
            return _list_openai(key, GROQ_BASE)
        if provider == "anthropic":
            return _list_anthropic(key)
        if provider == "openrouter":
            return _list_openrouter(key)
    except Exception as exc:
        logger.warning("error listando modelos de %s: %s", provider, exc)
    return []


def default_models(provider: str) -> list[str]:
    return DEFAULT_FALLBACK.get(provider, DEFAULT_FALLBACK["gemini"])
