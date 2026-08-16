import { APP_TOKEN, HUB_URL, WS_APP_URL } from '../config';

export interface HubMessage {
  type: string;
  id?: string;
  content?: string;
  message?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

/**
 * Cliente del Hub: login JWT + WebSocket con reconexión.
 */
export class HubClient {
  private ws: WebSocket | null = null;
  private token = '';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private onMessage: (message: HubMessage) => void = () => {};

  async login(): Promise<void> {
    const response = await fetch(`${HUB_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: APP_TOKEN }),
    });
    if (!response.ok) {
      throw new Error('No se pudo autenticar con el servidor');
    }
    const data = await response.json();
    this.token = data.token;
  }

  setMessageHandler(handler: (message: HubMessage) => void): void {
    this.onMessage = handler;
  }

  connect(device: string): void {
    if (!this.token) {
      throw new Error('Inicia sesión antes de conectar');
    }
    this.ws = new WebSocket(`${WS_APP_URL}?token=${this.token}`);
    this.ws.onopen = () => {
      console.log('WS conectado');
      this.onMessage({ type: 'connected' });
    };
    this.ws.onmessage = event => {
      try {
        const message = JSON.parse(String(event.data)) as HubMessage;
        this.onMessage(message);
      } catch {
        // ignorar mensajes no-json
      }
    };
    this.ws.onclose = () => {
      this.scheduleReconnect(device);
    };
    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  sendCommand(device: string, text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.onMessage({ type: 'error', message: 'Sin conexión con el servidor' });
      return;
    }
    this.ws.send(JSON.stringify({ type: 'command', device, text }));
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  private scheduleReconnect(device: string): void {
    if (this.reconnectTimer) {
      return;
    }
    this.onMessage({ type: 'reconnecting' });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      try {
        this.connect(device);
      } catch {
        // reintento siguiente
      }
    }, 3000);
  }
}