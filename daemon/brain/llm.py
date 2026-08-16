"""Capa LLM unificada con LiteLLM (Ollama, Gemini, Vertex AI, Claude, GPT, Groq, OpenRouter).

Garantia FREE: en modo free_only, Vertex AI (cuenta cloud con billing) queda
bloqueado a nivel de runtime para que la cuenta de Google nunca sea cobrada.
"""

import logging

import litellm

from config import settings

logger = logging.getLogger("daemon.llm")

_REFUSAL = (
    "Modo free_only: Vertex AI factura tu cuenta de cloud y esta bloqueado. "
    "Usa un proveedor gratuito (gemini, ollama) o confirma el pago por sesion."
)


def _vertex_blocked() -> bool:
    """True si Vertex AI no debe usarse en el modo activo."""
    if settings.llm_provider != "vertex_ai":
        return False
    if settings.codex_allow_paid:
        return False
    from brain import model_probe

    billing = model_probe.billing_is_enabled(settings.vertex_project)
    return billing is not False  # activo o desconocido => bloqueado


def complete(prompt: str, stream: bool = False):
    """Genera una respuesta del LLM configurado (estilo opencode: un proveedor a la vez)."""
    if _vertex_blocked():
        logger.warning("vertex_ai bloqueado en modo free_only (billing activo/desconocido)")
        raise RuntimeError(_REFUSAL)

    kwargs: dict = {"model": settings.litellm_model, "messages": [{"role": "user", "content": prompt}]}

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

    logger.info("llm call provider=%s model=%s", settings.llm_provider, settings.litellm_model)
    return litellm.completion(**kwargs, stream=stream)