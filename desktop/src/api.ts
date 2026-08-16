export interface ConfigInfo {
  provider: string;
  model: string;
  mode: string;
  vertex_blocked: boolean;
  project: string;
}

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

export interface ConfigureResponse {
  ok: boolean;
  provider?: string;
  model?: string;
  error?: string;
}

const BASE = 'http://127.0.0.1:8765';

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

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

type WsMessage = {
  type: string;
  id?: string;
  content?: string;
  message?: string;
};

export class DaemonClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  onMessage: (m: WsMessage) => void = () => {};

  constructor(private onStatus: (status: string, connected: boolean) => void) {}

  connect() {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) {
      return;
    }
    this.onStatus('Conectando al daemon local...', false);
    this.ws = new WebSocket('ws://127.0.0.1:8765/ws');
    this.ws.onopen = () => this.onStatus('Conectado al daemon local', true);
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