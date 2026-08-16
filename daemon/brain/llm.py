"""Capa LLM unificada con LiteLLM (Ollama local o Claude/GPT cloud)."""

import logging

import litellm

from config import settings

logger = logging.getLogger("daemon.llm")


def complete(prompt: str, stream: bool = False):
    """Genera una respuesta del LLM configurado."""
    kwargs = {"model": settings.litellm_model, "messages": [{"role": "user", "content": prompt}]}
    if settings.llm_provider == "ollama":
        kwargs["api_base"] = settings.ollama_host
    logger.info("llm call model=%s", settings.litellm_model)
    return litellm.completion(**kwargs, stream=stream)