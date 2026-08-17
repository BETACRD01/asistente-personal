import type { ProviderDef } from './types';

export const PROVIDERS: ProviderDef[] = [
  { id: 'gemini', name: 'Gemini (Google)', desc: 'Inicia sesión con tu cuenta de Google o usa API key de AI Studio. $0, con límites diarios.', needsKey: true, badge: 'gratis' },
  { id: 'ollama', name: 'Ollama', desc: 'Modelos locales en tu Mac. Gratis, sin internet.', needsKey: false, badge: 'gratis' },
  { id: 'openai', name: 'OpenAI (ChatGPT)', desc: 'Usa tu API key de OpenAI. Factura a tu cuenta OpenAI.', needsKey: true, badge: 'pago' },
  { id: 'anthropic', name: 'Claude (Anthropic)', desc: 'Usa tu API key de Anthropic. Factura a tu cuenta.', needsKey: true, badge: 'pago' },
  { id: 'groq', name: 'Groq', desc: 'Rápido y barato. Requiere API key.', needsKey: true, badge: 'pago' },
  { id: 'openrouter', name: 'OpenRouter', desc: 'Muchos modelos con una key.', needsKey: true, badge: 'pago' },
];

export const SUGGESTIONS = [
  '¿Cuánta memoria tiene mi Mac?',
  'Crea una carpeta llamada "agentrelay-test"',
  'Muestra los archivos del Escritorio',
  '¿Qué hora es?',
];

export const FALLBACK_MODELS = ['gemini-3.6-flash', 'gemini-3.1-flash-lite'];