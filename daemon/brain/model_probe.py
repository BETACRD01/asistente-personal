"""Deteccion de modelos disponibles y su tier (free/paid) para la cuenta de Google.

Estrategia (no existe campo "free/paid" en models.list):
  1. Estado de billing del proyecto via Cloud Billing REST (token del ADC).
  2. Probe de 1 token a cada modelo candidato via LiteLLM y clasificacion del error.
  3. Tabla estatica de tiers conocidos (2026): Flash/Flash-Lite gratis, Pro solo pago.

Uso:
  python brain/model_probe.py --scan
"""

import json
import logging
import subprocess
import sys
import time
import urllib.request

logger = logging.getLogger("daemon.codex.probe")

# (provider, model, tier_conocido, nota)
# tier: "free" = tiene free tier en Developer API / cuentas personales (2026)
#       "paid" = solo de pago (Pro sin free tier desde abr 2026, 3.1 Pro Preview)
CANDIDATE_MODELS = [
    ("vertex_ai", "gemini-2.5-flash", "free", "flash, 1M ctx"),
    ("vertex_ai", "gemini-2.5-flash-lite", "free", "flash-lite, barato"),
    ("vertex_ai", "gemini-2.5-pro", "paid", "pro, sin free tier"),
    ("vertex_ai", "gemini-3.6-flash", "free", "flash 3.x (puede faltar en Vertex)"),
    ("gemini", "gemini-2.5-flash", "free", "Developer API free tier"),
    ("gemini", "gemini-2.5-flash-lite", "free", "Developer API free tier"),
    ("gemini", "gemini-3.6-flash", "free", "Developer API free tier"),
    ("gemini", "gemini-3.1-flash-lite", "free", "Developer API free tier"),
    ("gemini", "gemini-2.5-pro", "paid", "Developer API: solo trial/paid"),
]

# Strings de error que revelan disponibilidad / restriccion
_NOT_FOUND = ("model not found", "not found", "404", "unknown model", "does not exist", "invalid model")
_LIMITED = (
    "billing", "quota", "429", "resource_exhausted", "free_tier_requests",
    "permission_denied", "403", "insufficient", "finance.quota", "maximum_tokens",
)


def get_adc_token() -> str | None:
    """Devuelve el token del ADC (gcloud auth application-default)."""
    result = subprocess.run(
        ["gcloud", "auth", "application-default", "print-access-token"],
        capture_output=True, text=True,
    )
    token = result.stdout.strip()
    return token or None


def adc_email() -> str | None:
    """Cuenta de Google real detrás del ADC (via tokeninfo)."""
    token = get_adc_token()
    if not token:
        return None
    req = urllib.request.Request(
        "https://oauth2.googleapis.com/tokeninfo",
        headers={"Authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.load(resp).get("email")
    except Exception:
        return None


def check_billing(project: str) -> dict:
    """Estado de billing de un proyecto GCP (Cloud Billing REST, ADC)."""
    token = get_adc_token()
    if not token:
        return {"known": False, "reason": "sin ADC"}
    req = urllib.request.Request(
        f"https://cloudbilling.googleapis.com/v1/projects/{project}/billingInfo",
        headers={"Authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.load(resp)
            return {
                "known": True,
                "billing_enabled": bool(data.get("billingEnabled")),
                "billing_account": data.get("billingAccountName"),
            }
    except Exception as exc:
        return {"known": False, "reason": str(exc)[:120]}


_BILLING_CACHE = {"t": 0.0, "val": None}
_BILLING_TTL = 300.0  # segundos


def billing_is_enabled(project: str) -> bool | None:
    """True=billing activo (Vertex factura), False=free tier OK, None=desconocido.

    En desconocido devolvemos None para que el guard se comporte conservador
    (nunca usar Vertex AI en modo free_only si no se puede confirmar que no cobra).
    Con cache TTL para no consultar en cada llamada.
    """
    now = time.time()
    if now - _BILLING_CACHE["t"] < _BILLING_TTL and _BILLING_CACHE["val"] is not None:
        return _BILLING_CACHE["val"]
    info = check_billing(project)
    val = None
    if info.get("known"):
        val = bool(info.get("billing_enabled"))
    _BILLING_CACHE.update(t=now, val=val)
    return val


def probe_model(provider: str, model: str) -> str:
    """Prueba el modelo con una llamada minima (1 token) y clasifica el resultado."""
    import litellm

    from config import settings

    kwargs = {
        "model": f"{provider}/{model}",
        "messages": [{"role": "user", "content": "ping"}],
        "max_tokens": 1,
    }
    if provider == "gemini":
        kwargs["api_key"] = settings.gemini_api_key
    elif provider == "vertex_ai":
        kwargs["vertex_project"] = settings.vertex_project
        kwargs["vertex_location"] = settings.vertex_location

    try:
        litellm.completion(**kwargs)
        return "ok"
    except Exception as exc:
        msg = str(exc).lower()
        if any(k in msg for k in _NOT_FOUND):
            return "no_disponible"
        if any(k in msg for k in _LIMITED):
            return "limitado"
        return f"error: {str(exc)[:60]}"


def scan(providers: list[str] | None = None) -> list[dict]:
    """Prueba todos los candidatos y devuelve el informe por modelo."""
    results = []
    for provider, model, tier, note in CANDIDATE_MODELS:
        if providers and provider not in providers:
            continue
        status = probe_model(provider, model)
        results.append({
            "provider": provider,
            "model": model,
            "tier": tier,
            "note": note,
            "status": status,
        })
        logger.info("probe %s/%s -> %s", provider, model, status)
    return results


def print_report(billing: dict, results: list[dict]) -> None:
    """Imprime el informe legible del escaneo."""
    print("=" * 68)
    print(f"Cuenta ADC      : {adc_email() or '(no detectada)'}")
    if billing.get("known"):
        print(f"Billing {billing.get('billing_account') or ''} : "
              f"{'ACTIVADO (pago por uso)' if billing.get('billing_enabled') else 'DESACTIVADO (free tier disponible)'}")
    else:
        print(f"Billing         : desconocido ({billing.get('reason', '')})")
    print("-" * 68)
    print(f"{'proveedor':<10} {'modelo':<24} {'tier':<5} {'estado'}")
    print("-" * 68)
    for r in results:
        print(f"{r['provider']:<10} {r['model']:<24} {r['tier']:<5} {r['status']}")
    print("=" * 68)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    if "--scan" not in sys.argv:
        print(__doc__)
        sys.exit(0)

    from config import settings

    project = settings.vertex_project
    print_report(
        check_billing(project) if project else {"known": False, "reason": "sin VERTEX_PROJECT"},
        scan(),
    )


if __name__ == "__main__":
    main()