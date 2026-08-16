"""Capa LLM unificada con LiteLLM (Ollama, Gemini, Claude, GPT, Groq, OpenRouter)."""

import logging

import litellm

from config import settings

logger = logging.getLogger("daemon.llm")


def complete(prompt: str, stream: bool = False):
    """Genera una respuesta del LLM configurado (estilo opencode: un proveedor a la vez)."""
    kwargs: dict = {"model": settings.litellm_model, "messages": [{"role": "user", "content": prompt}]}

    if settings.llm_provider == "ollama":
        kwargs["api_base"] = settings.ollama_host
    elif settings.llm_provider == "gemini":
        kwargs["api_key"] = settings.gemini_api_key
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