export const MODEL_LABELS: Record<string, string> = {
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
  'gemini-3.1-pro-preview': 'Gemini 3.1 Pro Low',
  'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite',
  'gemini-3.5-flash': 'Gemini 3.5 Flash Medium',
  'gemini-3.5-flash-lite': 'Gemini 3.5 Flash Lite',
  'gemini-3.6-flash': 'Gemini 3.6 Flash Low',
  'gemini-3.7-flash': 'Gemini 3.7 Flash Medium',
  'gemini-3-flash-preview': 'Gemini 3 Flash Preview',
};

export const isPaidModel = (m: string) => m.includes('pro') || m.includes('preview');

export const modelLabel = (m: string) => MODEL_LABELS[m] ?? m;