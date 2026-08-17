import type { AccountInfo, ChatMessage, ConfigInfo, ConfigureResponse, WsMessage } from './types';

export type {
  AccountInfo,
  ChatMessage,
  ConfigInfo,
  ConfigureResponse,
  WsMessage,
};

export interface ProbeResult {
  provider: string;
  model: string;
  tier: string;
  note: string;
  status: string;
}

export interface ProbeReport {
  billing: { known: boolean; billing_enabled?: boolean; billing_account?: string; reason?: string };
  mode: string;
  results: ProbeResult[];
  chosen: ProbeResult | null;
}

const BASE = 'http://127.0.0.1:8765';

export async function getProjects(): Promise<{ projects: string[]; active: string }> {
  const res = await fetch(`${BASE}/api/projects`);
  return res.json();
}

export async function addProject(path: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${BASE}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  return res.json();
}

export async function removeProject(path: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${BASE}/api/projects/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  return res.json();
}

export async function setProject(path: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${BASE}/api/project`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  return res.json();
}

export async function getConfig(): Promise<ConfigInfo> {
  const res = await fetch(`${BASE}/api/config`);
  return res.json();
}

export async function probe(): Promise<ProbeReport> {
  const res = await fetch(`${BASE}/api/probe`);
  return res.json();
}

export async function configure(provider: string, key?: string): Promise<ConfigureResponse> {
  const res = await fetch(`${BASE}/api/configure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, key: key ?? '' }),
  });
  return res.json();
}

export async function setModel(model: string): Promise<ConfigureResponse> {
  const res = await fetch(`${BASE}/api/model`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model }),
  });
  return res.json();
}

export async function getAccount(): Promise<AccountInfo> {
  const res = await fetch(`${BASE}/api/account`);
  return res.json();
}

export async function getModels(): Promise<string[]> {
  const res = await fetch(`${BASE}/api/models`);
  const data = await res.json();
  return data.models ?? [];
}

export async function login(): Promise<AccountInfo> {
  const res = await fetch(`${BASE}/api/login`, { method: 'POST' });
  return res.json();
}

export async function setAdmin(enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${BASE}/api/admin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  return res.json();
}

export async function logout(): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${BASE}/api/logout`, { method: 'POST' });
  return res.json();
}

export async function removeApiKey(provider: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${BASE}/api/key/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider }),
  });
  return res.json();
}

export class DaemonClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  onMessage: (m: WsMessage) => void = () => {};

  constructor(private onStatus: (status: string, connected: boolean) => void) {}

  connect() {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) {
      return;
    }
    this.onStatus('Conectando...', false);
    this.ws = new WebSocket('ws://127.0.0.1:8765/ws');
    this.ws.onopen = () => this.onStatus('Conectado', true);
    this.ws.onclose = () => {
      this.onStatus('Desconectado. Reintentando...', false);
      this.ws = null;
      this.reconnectTimer = window.setTimeout(() => this.connect(), 3000);
    };
    this.ws.onerror = () => this.ws?.close();
    this.ws.onmessage = (event) => {
      try {
        this.onMessage(JSON.parse(event.data));
      } catch {
        /* ignorar frames no-json */
      }
    };
  }

  sendCommand(id: string, text: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'command', id, text }));
    }
  }

  disconnect() {
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}