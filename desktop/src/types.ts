export interface ConfigInfo {
  provider: string;
  model: string;
  mode: string;
  vertex_blocked: boolean;
  project: string;
}

export interface AccountInfo {
  ok: boolean;
  email?: string;
  logged: boolean;
  url?: string;
  opened?: boolean;
  error?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

export interface ConfigureResponse {
  ok: boolean;
  provider?: string;
  model?: string;
  error?: string;
}

export interface ProviderDef {
  id: string;
  name: string;
  desc: string;
  needsKey: boolean;
  badge: string;
}

export type WsMessage = {
  type: string;
  id?: string;
  content?: string;
  message?: string;
};