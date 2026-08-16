"""Autenticación JWT y tokens de dispositivo."""

from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Header, HTTPException

from app.config import settings

ALGORITHM = "HS256"


def create_token(subject: str, ttl_hours: int | None = None) -> str:
    ttl = ttl_hours or settings.jwt_expire_hours
    payload = {
        "sub": subject,
        "exp": datetime.now(timezone.utc) + timedelta(hours=ttl),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])


def authorize(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        payload = decode_token(authorization.removeprefix("Bearer ").strip())
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    return payload.get("sub", "")


def login_device_token(token: str) -> bool:
    return token in settings.device_tokens


def login_app_token(token: str) -> bool:
    return bool(settings.app_token) and token == settings.app_token