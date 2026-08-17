"""Generación de imágenes con los modelos de imagen de la cuenta (pago)."""

import base64
import logging
import time
from pathlib import Path

import requests

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
    "gemini-3.1-flash-image-preview",
]

_QUOTA = ("429", "quota", "rate limit", "resource_exhausted", "exceeded")


def _pick_models() -> list[str]:
    current = settings.llm_model
    ordered = []
    if current and "image" in current:
        ordered.append(current)
    for name in IMAGE_MODELS:
        if name not in ordered:
            ordered.append(name)
    return ordered


def _billing_project() -> str | None:
    """Proyecto con facturacion si la cuenta logueada tiene acceso a el."""
    project = (settings.vertex_project or "").strip()
    if not project:
        return None
    token = oauth.get_token()
    if not token:
        return None
    try:
        r = requests.get(
            f"https://serviceusage.googleapis.com/v1/projects/{project}/services?filter=state:ENABLED",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        if r.status_code == 200:
            logger.info("la cuenta tiene acceso al proyecto de facturacion: %s", project)
            return project
    except Exception as exc:
        logger.warning("no se pudo comprobar acceso al proyecto de facturacion: %s", exc)
    return None


def _generate_one(prompt: str, model: str, project: str | None) -> str:
    token = oauth.get_token()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "x-goog-user-project": project or oauth.USER_PROJECT,
    }
    resp = requests.post(
        url,
        headers=headers,
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
            logger.info("imagen generada con %s (%s) en %s", model, project or "free", path)
            return f"![imagen]({path})"
    raise RuntimeError("El modelo no devolvio ninguna imagen")


def generate_image(prompt: str) -> str:
    """Genera una imagen, la guarda en /tmp y devuelve un marcador para el chat."""
    token = oauth.get_token()
    if not token:
        raise RuntimeError("No hay sesion iniciada con Google (necesaria para generar imagenes)")

    project = _billing_project()  # si la cuenta tiene acceso, usa facturacion (sin limite diario)

    errors: list[str] = []
    for model in _pick_models():
        try:
            return _generate_one(prompt, model, project)
        except Exception as exc:
            msg = str(exc)
            errors.append(f"{model}: {msg[:90]}")
            logger.warning("imagen fallida con %s: %s", model, msg[:120])
            if not any(k in msg.lower() for k in _QUOTA):
                # error no transitorio de cuota: no tiene sentido probar otro modelo
                raise
            time.sleep(2)  # breve pausa antes de probar el siguiente modelo

    raise RuntimeError(
        "Todos los modelos de imagen estan saturados o sin cuota (429). "
        "Inicia sesion con la cuenta que tiene facturacion para generar sin limite.\n"
        + " | ".join(errors[-4:])
    )


async def generate_image_async(prompt: str) -> str:
    return generate_image(prompt)