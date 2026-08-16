#!/usr/bin/env python3
"""Configura el proveedor de IA del daemon (estilo opencode/codex).

Uso:
  python configure.py                   # asistente interactivo
  python configure.py --list            # muestra proveedores y modelo activo
  python configure.py --provider gemini # cambia a Gemini (pide API key)
"""

import argparse
import os
import sys
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parent / ".env"

PROVIDERS = {
    "ollama": {
        "desc": "Local y gratis (sin conexion). Requiere Ollama instalado.",
        "key_env": None,
        "model": "llama3.2",
    },
    "gemini": {
        "desc": "Google Gemini (gratis con API key de AI Studio / cuenta).",
        "key_env": "GEMINI_API_KEY",
        "model": "gemini-3.6-flash",
    },
    "vertex_ai": {
        "desc": "Google Vertex AI (login con tu cuenta de Google, sin API key).",
        "key_env": None,
        "model": "gemini-2.5-flash",
    },
    "openai": {
        "desc": "OpenAI GPT (requiere API key).",
        "key_env": "OPENAI_API_KEY",
        "model": "gpt-4o",
    },
    "anthropic": {
        "desc": "Claude (requiere API key).",
        "key_env": "ANTHROPIC_API_KEY",
        "model": "claude-sonnet-4-20250514",
    },
    "groq": {
        "desc": "Groq (gratis/barato, muy rapido). Requiere API key.",
        "key_env": "GROQ_API_KEY",
        "model": "llama-3.3-70b-versatile",
    },
    "openrouter": {
        "desc": "OpenRouter (muchos modelos, incl. Gemini gratis).",
        "key_env": "OPENROUTER_API_KEY",
        "model": "google/gemini-2.0-flash-001",
    },
}


def read_env() -> dict[str, str]:
    values: dict[str, str] = {}
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                values[key.strip()] = value.strip()
    return values


def write_env(values: dict[str, str]) -> None:
    ENV_PATH.write_text("".join(f"{k}={v}\n" for k, v in values.items()))


def apply(provider: str, key: str = "") -> None:
    if provider not in PROVIDERS:
        print(f"Proveedor desconocido: {provider}")
        sys.exit(1)

    env = read_env()
    env["LLM_PROVIDER"] = provider
    info = PROVIDERS[provider]

    if provider == "vertex_ai":
        import subprocess

        print("Iniciando sesion con tu cuenta de Google...")
        print("Se abrira el navegador. Autoriza el acceso y vuelve aqui.\n")
        result = subprocess.run(["gcloud", "auth", "application-default", "login"], check=False)
        if result.returncode != 0:
            print("\nEl login de Google fallo.")
            print("Alternativa: ejecuta manualmente  gcloud auth application-default login")
            sys.exit(1)
        project = subprocess.run(
            ["gcloud", "config", "get-value", "project"], capture_output=True, text=True
        ).stdout.strip()
        if not project:
            project = input("Pega tu Project ID de GCP: ").strip()
        env["VERTEX_PROJECT"] = project
        print(f"\nProyecto GCP detectado: {project}")

    if info["key_env"]:
        if key:
            env[info["key_env"]] = key
        elif info["key_env"] in env and env[info["key_env"]]:
            print(f"Usando API key existente ({info['key_env']} ya configurada).")
        else:
            key = input(f"Pega tu API key de {provider}: ").strip()
            if not key:
                print("API key vacia. Cancelo.")
                sys.exit(1)
            env[info["key_env"]] = key

    env["LLM_MODEL"] = info["model"]
    write_env(env)
    print(f"\nProveedor configurado: {provider} ({info['model']})")
    print(f"Reinicia el daemon: python main.py")


def show_status() -> None:
    env = read_env()
    provider = env.get("LLM_PROVIDER", "ollama")
    model = env.get("LLM_MODEL", PROVIDERS.get(provider, {}).get("model", "?"))
    print(f"Proveedor activo: {provider}")
    print(f"Modelo:           {model}")
    print("\nDisponibles:")
    for name, info in PROVIDERS.items():
        print(f"  {name:<10} {info['desc']}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Configura el proveedor de IA del daemon")
    parser.add_argument("--list", action="store_true", help="muestra estado y proveedores")
    parser.add_argument("--provider", choices=list(PROVIDERS), help="proveedor a configurar")
    parser.add_argument("--key", default="", help="API key (opcional, se pregunta si falta)")
    args = parser.parse_args()

    if args.list:
        show_status()
        return

    if args.provider:
        apply(args.provider, args.key)
        return

    print("¿Qué proveedor de IA quieres usar?\n")
    for i, (name, info) in enumerate(PROVIDERS.items(), 1):
        print(f"  {i}. {name}: {info['desc']}")
    choice = input("\nElige (1-7): ").strip()
    try:
        provider = list(PROVIDERS)[int(choice) - 1]
    except (ValueError, IndexError):
        print("Opcion invalida")
        sys.exit(1)
    apply(provider)


if __name__ == "__main__":
    main()