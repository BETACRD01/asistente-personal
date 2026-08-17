# AgentRelay: agente de desarrollo con detección de modelos free/paid

> **Archivado (2026-08-17).** El agente IA embebido (`daemon/brain/`, `cli.py`,
> `local_api.py`, `main.py`, chat/Redis en el hub, app móvil) fue **eliminado**.
> El sistema actual es **terminal remoto + SSH desde Termux** (ver `PLAN.md` y
> `API.md`). Este documento queda como referencia histórica del diseño del agente
> y ya no refleja el código del repositorio.

Documento de investigación y diseño de "AgentRelay" (asistente de desarrollo
tipo Codex/Claude Code): un agente que inicia
sesión con la cuenta de Google, detecta qué modelos de IA tiene realmente
disponibles (gratuitos vs. de pago), y usa **solo modelos gratuitos** salvo que
el usuario autorice el pago explícitamente por sesión.

## Objetivo

- Trabajar con el código del proyecto (leer, planear, ejecutar tareas de dev).
- Autenticarse con la cuenta de Google (sin keys manuales de por medio).
- Detectar programáticamente qué modelos están disponibles para la cuenta.
- Diferenciar modelos gratuitos de modelos de pago.
- **Nunca** activar facturación solo, saltar cuotas, ni usar modelos de pago sin
  confirmación del usuario en esa sesión.
- Seleccionar automáticamente el mejor modelo disponible según el modo activo.

## Estado real de la cuenta (verificado el 2026-08-16)

| Dato | Valor |
| --- | --- |
| Proyecto GCP | `delivery-109f4` |
| Cuenta con acceso | `wd1501074@gmail.com` (la que usa el ADC del daemon) |
| Cuenta activa en `gcloud` | `gonzaloguanipatin@gmail.com` (sin permiso sobre el proyecto) |
| ADC (application-default) | `wd1501074@gmail.com`, scope `cloud-platform`, quota project `delivery-109f4` |
| Billing del proyecto | **ACTIVADO** (`billingEnabled: true`, cuenta `012719-2216DC-AA1359`) |
| Vertex AI | `aiplatform.googleapis.com` habilitado, región `us-central1` |
| Modelos verificados en Vertex (vía ADC) | `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.5-flash-lite` OK; `gemini-3.6-flash` NO |
| API key AI Studio | acceso a la familia Flash 3.x, **no** a `gemini-2.5-flash` |

> **Consecuencia importante:** `delivery-109f4` tiene billing activado, por lo
> que **Vertex AI factura por uso** (medido contra crédito/cuenta de cobro). No
> es un "free tier". El camino realmente gratuito es la Developer API (API key
> de AI Studio) en un proyecto **sin** billing, o el free tier de cuenta
> personal de Gemini CLI. El selector debe reflejar esto.

## Cómo funciona el acceso a Gemini en 2026 (hallazgos)

1. **Developer API (AI Studio) con API key.**
   - Free tier vigente: familias **Flash y Flash-Lite** (2.5 y 3.x), con límites
     ~10–15 RPM / ~1.000–1.500 RPD / ~250K TPM. Sin tarjeta.
   - Los datos del free tier pueden usarse para mejorar los modelos de Google.
   - **Trampa de billing:** activar billing en el proyecto **elimina el free
     tier**: desde el primer token todo se factura. No existe "free allowance"
     dentro del tier de pago. Práctica correcta: separar proyectos free/paid.
   - Pro: `gemini-2.5-pro` perdió su free tier en abr 2026 (solo acceso trial);
     `gemini-3.1-pro-preview` es solo de pago.

2. **OAuth con cuenta personal (estilo Gemini CLI).**
   - Login por navegador, credenciales cacheadas en `~/.gemini`.
   - Free tier publicitado: 60 RPM / 1.000 RPD con **Gemini 2.5 Pro** y ventana
     de 1M tokens, sin tarjeta. Es el único de los tres agentes de terminal
     (Claude Code, Codex CLI, Gemini CLI) con free tier real.
   - Hay fuentes contradictorias sobre si ese free tier sigue vigente
     (una menciona cierre en jun 2026); verificar con un probe antes de confiar.
   - Gemini CLI es open source (Apache-2.0): blueprint del asistente AgentRelay.

3. **Vertex AI (la vía que ya usa el daemon).**
   - Autenticación con cuenta de Google vía ADC (`gcloud auth
     application-default login`). Sin API key.
   - Pago por uso ligado al billing del proyecto. No hay free tier "de pago"
     dentro del mismo proyecto con billing activo.
   - `models.list` / listado de modelos publicados no devuelve catálogo por
     bulk de forma fiable (v1 → 404, v1beta1 → vacío). **Detección real = probe**
     con una llamada mínima de 1 token.

## Detección programática (no existe campo "free/paid")

No hay un campo `free_tier` en la respuesta de `models.list`. El asistente infiere
el tier combinando:

1. **Estado de billing del proyecto** → `cloudbilling.googleapis.com/v1/projects/{project}/billingInfo`
   (con el token del ADC). `billingEnabled=true` ⇒ camino de pago disponible.
2. **Probe de disponibilidad** → una llamada de 1 token (`max_tokens=1`) a cada
   modelo candidato y clasificación del resultado/error:
   - `ok` → disponible
   - "model not found"/404 → no disponible
   - "billing"/quota/429/"free_tier_requests"/403 → limitado o solo de pago
3. **Tabla estática de tiers conocidos** (actualizable): qué familias tienen
   free tier en 2026 (Flash/Flash-Lite) y cuáles no (Pro).

## Arquitectura

```
daemon/brain/
  model_probe.py   # probe 1 token por modelo candidato + billingInfo del proyecto
  selector.py      # ranking pro>flash>flash-lite, modo free_only/paid, regla por sesión
  llm.py           # sin cambios: litellm.completion (usa settings)
  agent.py         # sin cambios: grafo LangGraph decide→ejecuta→resume
```

Modos de uso (por sesión):

| Modo | Comportamiento |
| --- | --- |
| `free_only` (por defecto) | Solo modelos de la tabla FREE_MODELS. Si el billing está activo y no hay free tier en Vertex, recomienda usar la Developer API sin billing o bloquea la llamada. |
| `paid` (confirmación explícita por sesión) | Permite modelos de pago (p. ej. `gemini-2.5-pro` en Vertex) con advertencia de gasto estimado y nunca auto-enciende billing. |

Reglas de oro:

- Nunca activar billing automáticamente.
- Nunca saltar cuotas ni límites.
- En `free_only`, ninguna llamada puede incurrir en cargo.
- El paso a `paid` requiere confirmación del usuario en esa sesión.

## Comandos

```bash
# Verificación manual del estado (sin cambiar nada)
gcloud auth application-default print-access-token | head -c 12

# Billing del proyecto (cuenta correcta)
gcloud --account=wd1501074@gmail.com billing projects describe delivery-109f4

# Escaneo de modelos (probe 1 token por candidato) + informe del selector
python brain/selector.py --report

# Ajustar automáticamente LLM_MODEL al mejor modelo gratuito disponible
python configure.py --codex-auto
```

## Roadmap

- [x] Investigación de acceso, free tiers 2026 y detección
- [x] `model_probe.py` (billingInfo + probe 1 token + clasificación)
- [x] `selector.py` (ranking + modo free_only/paid + informe)
- [x] Guard runtime en `llm.py`: Vertex AI bloqueado en free_only (nunca cobra la cuenta cloud)
- [x] API local `local_api.py` (127.0.0.1:8765): config, probe, configure, WS chat
- [x] UI desktop `desktop/` (React+Vite): login por proveedor, escaneo, chat streaming
- [ ] Envolver la UI en Tauri (requiere instalar Rust)
- [ ] Integrar selector en `main.py` (comando explícito `@codex` con confirmación por sesión)
- [ ] Multi-usuario en Hub (M2): credenciales cifradas por usuario + contexto por comando
- [ ] Control móvil de la sesión de escritorio (M3)
- [ ] (Opcional) OAuth cuenta personal estilo Gemini CLI para 2.5 Pro gratis