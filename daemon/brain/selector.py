"""Selector del mejor modelo disponible respetando la regla free-only por defecto.

Reglas:
  - free_only (por defecto): solo modelos de FREE_MODELS; nunca incurre en cargo.
  - paid (confirmacion explicita por sesion): permite modelos de pago.
  - Nunca activa billing, nunca salta cuotas.

Uso:
  python brain/selector.py --report
"""

import logging
import sys

from brain import model_probe
from config import settings

logger = logging.getLogger("daemon.codex.selector")

# Orden de preferencia de mejor a peor dentro del catalogo
PRIORITY = [
    "gemini-2.5-pro",
    "gemini-3.6-flash",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
]

# Modelos con free tier en 2026 (Flash/Flash-Lite). Pro NO esta.
FREE_MODELS = {
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-3.6-flash",
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash",
}


def _rank(model: str) -> int:
    return PRIORITY.index(model) if model in PRIORITY else len(PRIORITY)


def select(scan_results: list[dict], allow_paid: bool = False, billing: bool | None = None) -> dict | None:
    """Elige el mejor modelo disponible segun el modo activo. None si no hay ninguno.

    billing: True=billing activo, False=off, None=desconocido.
    En free_only NUNCA se elige vertex_ai si billing no esta confirmadamente desactivado.
    """
    available = [r for r in scan_results if r.get("status") == "ok"]
    if not allow_paid:
        pool = [r for r in available if r["model"] in FREE_MODELS]
        if billing is not False:  # billing activo o desconocido => Vertex AI bloqueado
            pool = [r for r in pool if r["provider"] != "vertex_ai"]
    else:
        pool = available
    if not pool:
        return None
    return max(pool, key=lambda r: -_rank(r["model"]))


def resolve(allow_paid: bool | None = None) -> dict:
    """Flujo completo: billing + scan + seleccion. Devuelve el informe."""
    allow = settings.codex_allow_paid if allow_paid is None else allow_paid
    billing = model_probe.check_billing(settings.vertex_project) if settings.vertex_project else {"known": False, "reason": "sin VERTEX_PROJECT"}
    billing_flag = billing.get("billing_enabled") if billing.get("known") else None
    results = model_probe.scan()
    chosen = select(results, allow_paid=allow, billing=billing_flag)
    return {
        "mode": "paid" if allow else "free_only",
        "billing": billing,
        "billing_flag": billing_flag,
        "results": results,
        "chosen": chosen,
    }


def _report() -> None:
    report = resolve()
    mode = report["mode"].upper()
    print("=" * 68)
    print(f"Modo                : {mode}")
    print(f"Cuenta ADC          : {model_probe.adc_email() or '(no detectada)'}")
    billing = report["billing"]
    if billing.get("known"):
        print(f"Billing del proyecto: {'ACTIVADO (Vertex AI factura por uso)' if billing.get('billing_enabled') else 'DESACTIVADO (free tier OK)'}")
    else:
        print(f"Billing del proyecto: desconocido ({billing.get('reason', '')})")
    if report["billing_flag"] is not False:
        print("Garantia FREE: Vertex AI BLOQUEADO (tu cuenta cloud no se cobrara)")
    print("-" * 68)
    for r in report["results"]:
        print(f"  {r['provider']:<10} {r['model']:<24} {r['tier']:<5} {r['status']}")
    print("-" * 68)
    chosen = report["chosen"]
    if chosen:
        print(f"MEJOR MODELO ({report['mode']}): {chosen['provider']}/{chosen['model']}")
    else:
        print("SIN MODELO DISPONIBLE en este modo. Usa 'paid' por sesion si confirmas el pago.")
    print("=" * 68)


def main() -> None:
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(message)s")
    if "--report" not in sys.argv:
        print(__doc__)
        sys.exit(0)
    _report()


if __name__ == "__main__":
    main()