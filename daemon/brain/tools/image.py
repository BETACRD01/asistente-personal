"""Generación de imágenes con los modelos de imagen de la cuenta (pago)."""

import base64
import logging
import time
from pathlib import Path

from brain import oauth
from config import settings

logger = logging.getLogger("daemon.image")

IMAGE_DIR = Path("/tmp/agentrelay-images")
IMAGE_DIR.mkdir(exist_ok=True)

IMAGE_MODELS = [
    "gemini-3.1-flash-image",
    "gemini-2.5-flash-image",
    "gemini-3-pro-image",
    "gemini-3.1-flash-lite-image",
    "gemini-3-pro-image-preview",
]


def _pick_model() -> str:
    current = settings.llm_model
    if current and "image" in current:
        return current
    for name in IMAGE_MODELS:
        if name in oauth.list_models():
            return name
    return "gemini-2.5-flash-image"


def generate_image(prompt: str) -> str:
    """Genera una imagen, la guarda en /tmp y devuelve un marcador para el chat."""
    import requests

    token = oauth.get_token()
    if not token:
        raise RuntimeError("No hay sesion iniciada con Google (necesaria para generar imagenes)")
    model = _pick_model()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    resp = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "x-goog-user-project": oauth.USER_PROJECT,
        },
        json={
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseModalities": ["IMAGE", "TEXT"]},
        },
        timeout=180,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Generacion de imagen {resp.status_code}: {resp.text[:300]}")
    data = resp.json()
    for part in data.get("candidates", [{}])[0].get("content", {}).get("parts", []):
        inline = part.get("inlineData")
        if inline and inline.get("data"):
            mime = inline.get("mimeType", "image/png")
            ext = "png" if mime == "image/png" else (mime.split("/")[-1] or "png")
            path = IMAGE_DIR / f"img_{int(time.time() * 1000)}.{ext}"
            path.write_bytes(base64.b64decode(inline["data"]))
            logger.info("imagen generada con %s en %s", model, path)
            return f"![imagen]({path})"
    raise RuntimeError("El modelo no devolvio ninguna imagen")


async def generate_image_async(prompt: str) -> str:
    return generate_image(prompt)