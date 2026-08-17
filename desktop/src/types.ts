export interface ConfigInfo {
  provider: string;
  model: string;
  mode: string;
  vertex_blocked: boolean;
  project: string;
  admin: boolean;
  workspace: string;
  approval: string;
  keys: Record<string, boolean>;
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
  model?: string;
  image?: string;
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
  model?: string;
  path?: string;
  mime?: string;
  data?: string;
  command?: string;
  reason?: string;
};