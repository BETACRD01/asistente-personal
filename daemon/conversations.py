"""Historial de conversaciones: se guardan localmente en conversations.json."""

import json
import threading
import time
from pathlib import Path

PATH = Path(__file__).resolve().parent.parent / "conversations.json"

_lock = threading.Lock()


def _load() -> list[dict]:
    if not PATH.exists():
        return []
    try:
        data = json.loads(PATH.read_text())
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _save(data: list[dict]) -> None:
    PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2))


def upsert(conv: dict) -> dict:
    """Crea o actualiza una conversacion por su id."""
    now = time.time()
    conv["updated_at"] = now
    conv["count"] = len(conv.get("messages", []))
    with _lock:
        data = _load()
        replaced = False
        for i, c in enumerate(data):
            if c.get("id") == conv.get("id"):
                conv["created_at"] = c.get("created_at", now)
                data[i] = conv
                replaced = True
                break
        if not replaced:
            conv["created_at"] = conv.get("created_at", now)
            data.insert(0, conv)
        _save(data)
    return conv


def list_conversations() -> list[dict]:
    with _lock:
        return [
            {
                "id": c.get("id", ""),
                "title": c.get("title", ""),
                "created_at": c.get("created_at", 0),
                "updated_at": c.get("updated_at", 0),
                "count": c.get("count", len(c.get("messages", []))),
            }
            for c in _load()
        ]


def get(conv_id: str) -> dict | None:
    with _lock:
        for c in _load():
            if c.get("id") == conv_id:
                return c
    return None


def delete(conv_id: str) -> bool:
    with _lock:
        data = _load()
        new = [c for c in data if c.get("id") != conv_id]
        if len(new) == len(data):
            return False
        _save(new)
        return True