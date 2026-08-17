#!/usr/bin/env python3
"""AgentRelay CLI — dale instrucciones a tu Mac desde el terminal.

Conecta con el daemon local (127.0.0.1:8765) y permite:
  - enviar tareas normales (el agente las ejecuta en tu Mac)
  - aprobar/rechazar acciones desde el chat
  - cambiar de carpeta de trabajo y de modelo
"""

import asyncio
import base64
import json
import subprocess
import sys
import threading
import time
from pathlib import Path

import requests
import websockets

DAEMON_DIR = Path(__file__).resolve().parent
BASE = "http://127.0.0.1:8765"
WS_URL = "ws://127.0.0.1:8765/ws"

HELP = """\
Comandos:
  <texto>            Envía una tarea al asistente
  s / n              Aprobar / rechazar una acción pendiente
  /ayuda             Esta ayuda
  /estado            Proveedor, modelo y carpeta activos
  /proyecto          Lista tus carpetas de trabajo
  /proyecto <ruta>   Cambia a esa carpeta
  /modelo            Modelo actual
  /modelo <id>       Cambia de modelo
  /modelos           Lista los modelos disponibles
  /salir             Salir
"""


def api(path: str, method: str = "GET", **kw) -> dict:
    url = BASE + path
    try:
        if method == "POST":
            r = requests.post(url, json=kw, timeout=10)
        else:
            r = requests.get(url, timeout=10)
        return r.json()
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def ensure_daemon() -> bool:
    try:
        if "provider" in api("/api/config"):
            return True
    except Exception:
        pass
    print("El daemon no está corriendo, lo arranco...")
    log = open("/tmp/daemon.log", "a")
    python = str(DAEMON_DIR / ".venv/bin/python")
    if not Path(python).exists():
        python = "python3"
    subprocess.Popen(
        [python, "main.py"],
        cwd=str(DAEMON_DIR),
        stdout=log,
        stderr=log,
        start_new_session=True,
    )
    for _ in range(20):
        time.sleep(1)
        try:
            if "provider" in api("/api/config"):
                return True
        except Exception:
            pass
    print("No pude arrancar el daemon. Revisa /tmp/daemon.log")
    return False


def cmd_estado() -> None:
    c = api("/api/config")
    if "provider" not in c:
        print("Daemon sin config:", c.get("error", c.get("detail", "")))
        return
    print(f"  proveedor : {c.get('provider')}")
    print(f"  modelo    : {c.get('model')}")
    print(f"  carpeta   : {c.get('workspace')}  (proyecto {c.get('project') or '—'})")
    print(f"  aprobación: {c.get('approval')}")


def cmd_proyecto(rest: str) -> None:
    if rest:
        r = api("/api/projects", "POST", path=rest)
        if not r.get("ok"):
            r2 = api("/api/project", "POST", path=rest)
            print(("✓ " + str(r2.get("ok", False))) if r2.get("ok") else r2.get("error", str(r2)))
        else:
            print("✓ carpeta activa:", rest)
        return
    p = api("/api/projects")
    if not p.get("ok") and "projects" not in p:
        print("No se pudo leer las carpetas:", p)
        return
    print("  activa:", p.get("active"))
    for item in p.get("projects", []):
        if isinstance(item, dict):
            label = item.get("path") or item.get("name") or str(item)
        else:
            label = item
        print("   -", label)


def cmd_modelo(rest: str) -> None:
    if rest:
        r = api("/api/model", "POST", model=rest)
        print("✓ modelo:", r.get("model", rest)) if r.get("ok") else print(r.get("detail", r))
        return
    c = api("/api/config")
    print("  modelo:", c.get("model"))


def cmd_modelos() -> None:
    r = api("/api/models")
    for m in r.get("models", []):
        print("   -", m)


async def chat_loop() -> None:
    print("Conectando con el daemon...")
    try:
        ws = await websockets.connect(WS_URL)
    except Exception as exc:
        print("No pude conectar:", exc)
        return

    c = api("/api/config")
    print("Listo. Trabajo en:", c.get("workspace") or "—", "| modelo:", c.get("model"))
    print("Escribe /ayuda para ver los comandos. Ctrl+C o /salir para terminar.\n")

    queue: asyncio.Queue = asyncio.Queue()
    pending = {"approval": None}
    state = {"busy": False}

    def reader() -> None:
        while True:
            try:
                line = input("> ")
            except (EOFError, KeyboardInterrupt):
                queue.put_nowait(None)
                break
            queue.put_nowait(line)

    threading.Thread(target=reader, daemon=True).start()

    async def receiver() -> None:
        try:
            async for raw in ws:
                m = json.loads(raw)
                t = m.get("type")
                if t == "token":
                    sys.stdout.write(m.get("content", ""))
                    sys.stdout.flush()
                elif t == "done":
                    state["busy"] = False
                    model = m.get("model") or ""
                    print()
                    print("  └─ modelo: " + model)
                elif t == "error":
                    state["busy"] = False
                    print()
                    print("ERROR:", m.get("message", ""))
                elif t == "image":
                    f = Path(f"/tmp/cli_img_{m.get('id','x')}.png")
                    try:
                        f.write_bytes(base64.b64decode(m.get("data", "")))
                        print(f"\n[imagen guardada en {f}]")
                    except Exception:
                        print("\n[recibida imagen]")
                elif t == "approval_request":
                    pending["approval"] = m.get("id")
                    print()
                    print(f"⚠ Se requiere aprobación ({m.get('reason', 'acción')}):")
                    print("  " + (m.get("command") or "").replace("\n", "\n  "))
                    print("  Escribe s (aprobar) / n (rechazar)")
        except websockets.ConnectionClosed:
            if not state.get("done"):
                print("\nSe cerró la conexión con el daemon.")

    async def sender() -> None:
        while True:
            line = await queue.get()
            if line is None:
                break
            text = line.strip()
            if not text:
                continue
            if pending["approval"] is not None:
                if text.lower() in ("s", "si", "y", "yes"):
                    await ws.send(json.dumps({"type": "approval_response", "id": pending["approval"], "approved": True}))
                    pending["approval"] = None
                    print("✓ Aprobado")
                elif text.lower() in ("n", "no"):
                    await ws.send(json.dumps({"type": "approval_response", "id": pending["approval"], "approved": False}))
                    pending["approval"] = None
                    print("✕ Rechazado")
                else:
                    print("  Responde s o n")
                continue
            if text.startswith("/"):
                part = text.split(None, 1)
                cmd = part[0]
                rest = part[1] if len(part) > 1 else ""
                if cmd in ("/ayuda", "/help"):
                    print(HELP)
                elif cmd == "/estado":
                    cmd_estado()
                elif cmd == "/proyecto":
                    cmd_proyecto(rest)
                elif cmd == "/modelo":
                    cmd_modelo(rest)
                elif cmd == "/modelos":
                    cmd_modelos()
                elif cmd in ("/salir", "/quit"):
                    state["done"] = True
                    await ws.close()
                    break
                else:
                    print("Comando desconocido. /ayuda para la lista")
                continue
            state["busy"] = True
            await ws.send(json.dumps({"type": "command", "id": f"c{int(time.time()*1000)}", "text": text}))

    try:
        await asyncio.gather(receiver(), sender())
    except websockets.ConnectionClosed:
        print("\nSe cerró la conexión con el daemon.")
    except KeyboardInterrupt:
        pass


def main() -> int:
    if not ensure_daemon():
        return 1
    try:
        asyncio.run(chat_loop())
    except KeyboardInterrupt:
        print()
    print("Hasta luego.")
    return 0


if __name__ == "__main__":
    sys.exit(main())