import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChatMessage,
  ConfigInfo,
  DaemonClient,
  ProbeReport,
  configure as apiConfigure,
  getConfig,
  probe as apiProbe,
} from './api';

const PROVIDERS: {
  id: string;
  name: string;
  desc: string;
  needsKey: boolean;
  badge: string;
}[] = [
  { id: 'gemini', name: 'Gemini (Google)', desc: 'Free tier con tu API key de AI Studio. $0, con límites diarios.', needsKey: true, badge: 'gratis' },
  { id: 'ollama', name: 'Ollama', desc: 'Modelos locales en tu Mac. Gratis, sin internet.', needsKey: false, badge: 'gratis' },
  { id: 'openai', name: 'OpenAI (ChatGPT)', desc: 'Usa tu API key de OpenAI. Factura a tu cuenta OpenAI.', needsKey: true, badge: 'pago' },
  { id: 'anthropic', name: 'Claude (Anthropic)', desc: 'Usa tu API key de Anthropic. Factura a tu cuenta.', needsKey: true, badge: 'pago' },
  { id: 'groq', name: 'Groq', desc: 'Rápido y barato. Requiere API key.', needsKey: true, badge: 'pago' },
  { id: 'openrouter', name: 'OpenRouter', desc: 'Muchos modelos con una key.', needsKey: true, badge: 'pago' },
];

const SUGGESTIONS = [
  '¿Cuánta memoria tiene mi Mac?',
  'Crea una carpeta llamada "codex-test"',
  'Muestra los archivos del Escritorio',
  '¿Qué hora es?',
];

function Setup({
  config,
  onConnected,
  onProbeReport,
}: {
  config: ConfigInfo | null;
  onConnected: () => void;
  onProbeReport: (r: ProbeReport) => void;
}) {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [scanning, setScanning] = useState(false);
  const [report, setReport] = useState<ProbeReport | null>(null);

  const connect = async (id: string) => {
    setBusyProvider(id);
    setMsg('');
    try {
      const res = await apiConfigure(id, keys[id] || undefined);
      if (!res.ok) {
        setMsg(`⚠ ${res.error}`);
      } else {
        setMsg(`✓ Conectado a ${res.provider} (${res.model})`);
        onConnected();
      }
    } catch (e) {
      setMsg(`⚠ Error de conexión: ${String(e)}`);
    } finally {
      setBusyProvider(null);
    }
  };

  const scan = async () => {
    setScanning(true);
    setMsg('');
    try {
      const r = await apiProbe();
      setReport(r);
      onProbeReport(r);
    } catch (e) {
      setMsg(`⚠ Escaneo falló: ${String(e)}`);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="setup">
      <div className="setup-head">
        <h1>Codex</h1>
        <p>Asistente de desarrollo para tu Mac. Conecta un proveedor para empezar.</p>
      </div>

      {config && (
        <div className="current">
          <span className="badge">Actual</span>
          <b>{config.provider}</b> · {config.model} · modo <code>{config.mode}</code>
          {config.vertex_blocked && (
            <span className="warn">Vertex AI bloqueado (no cobra tu cuenta cloud)</span>
          )}
        </div>
      )}

      <div className="providers">
        {PROVIDERS.map((p) => (
          <div className="provider-card" key={p.id}>
            <div className="provider-row">
              <div>
                <div className="provider-name">
                  {p.name} <span className={`badge ${p.badge === 'gratis' ? 'free' : 'paid'}`}>{p.badge}</span>
                </div>
                <div className="provider-desc">{p.desc}</div>
              </div>
            </div>
            {p.needsKey ? (
              <div className="provider-actions">
                <input
                  type="password"
                  placeholder="Pega tu API key"
                  value={keys[p.id] || ''}
                  onChange={(e) => setKeys({ ...keys, [p.id]: e.target.value })}
                />
                <button
                  onClick={() => connect(p.id)}
                  disabled={busyProvider !== null}
                >
                  {busyProvider === p.id ? '...' : 'Conectar'}
                </button>
              </div>
            ) : (
              <div className="provider-actions">
                <button onClick={() => connect(p.id)} disabled={busyProvider !== null}>
                  {busyProvider === p.id ? '...' : 'Conectar'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="scan">
        <button onClick={scan} disabled={scanning}>
          {scanning ? 'Escaneando modelos... (~30s)' : '🔍 Escanear modelos disponibles'}
        </button>
      </div>

      {report && (
        <div className="probe-report">
          <h3>Escaneo de la cuenta</h3>
          <p className="billing">
            Billing:{' '}
            {report.billing.known
              ? report.billing.billing_enabled
                ? 'ACTIVADO (Vertex AI factura)' 
                : 'DESACTIVADO (free OK)'
              : `desconocido (${report.billing.reason || '?'})`}
          </p>
          <table>
            <thead>
              <tr>
                <th>Proveedor</th>
                <th>Modelo</th>
                <th>Tier</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {report.results.map((r, i) => (
                <tr key={i}>
                  <td>{r.provider}</td>
                  <td>{r.model}</td>
                  <td>{r.tier}</td>
                  <td>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {report.chosen ? (
            <p className="chosen">✓ Mejor gratuito: {report.chosen.provider}/{report.chosen.model}</p>
          ) : (
            <p className="warn">Sin modelo gratuito disponible en este modo.</p>
          )}
        </div>
      )}

      {msg && <div className="msg">{msg}</div>}
    </div>
  );
}

function Chat({
  config,
  client,
  status,
  connected,
  onBack,
}: {
  config: ConfigInfo | null;
  client: DaemonClient;
  status: string;
  connected: boolean;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const handleWs = useCallback((m: any) => {
    switch (m.type) {
      case 'token': {
        const id = m.id;
        setMessages((prev) => {
          const existing = prev.find((x) => x.id === id);
          if (existing) {
            return prev.map((x) =>
              x.id === id ? { ...x, content: x.content + (m.content ?? ''), streaming: true } : x,
            );
          }
          return [...prev, { id, role: 'assistant', content: m.content ?? '', streaming: true }];
        });
        break;
      }
      case 'stdout':
        setBusy(false);
        break;
      case 'done':
        setBusy(false);
        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, streaming: false } : x)));
        break;
      case 'error':
        setBusy(false);
        setMessages((prev) =>
          prev.map((x) => (x.id === m.id ? { ...x, content: x.content + (m.message ?? ''), streaming: false } : x)),
        );
        break;
    }
  }, []);

  useEffect(() => {
    client.onMessage = handleWs;
  }, [client, handleWs]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || !connected || busy) return;
    const id = `u${Date.now()}`;
    setMessages((prev) => [...prev, { id, role: 'user', content: text }]);
    setInput('');
    setBusy(true);
    client.sendCommand(id, text);
  };

  return (
    <div className="chat">
      <header className="chat-head">
        <button className="link" onClick={onBack}>
          ⚙ Proveedor
        </button>
        <div className="chat-brand">
          <b>Codex</b>
          <span className="model-chip">
            {config?.provider}/{config?.model}
          </span>
        </div>
        <div className={`dot ${connected ? 'on' : 'off'}`} title={status} />
      </header>

      <div className="messages" ref={listRef}>
        {messages.length === 0 && (
          <div className="welcome">
            <h2>¿Qué hacemos hoy?</h2>
            <p>Dame una tarea de desarrollo y yo la ejecuto en tu Mac.</p>
            <div className="chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`bubble ${m.role}`}>
            <div className="bubble-text">
              {m.content}
              {m.streaming && <span className="cursor" />}
            </div>
          </div>
        ))}
      </div>

      <div className="input-bar">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Escribe una tarea para tu Mac..."
          disabled={!connected}
        />
        <button className="send" onClick={() => send()} disabled={!connected || busy}>
          {busy ? '…' : '▲'}
        </button>
      </div>
      <div className="status-line">{status}</div>
    </div>
  );
}

export default function App() {
  const [config, setConfig] = useState<ConfigInfo | null>(null);
  const [view, setView] = useState<'setup' | 'chat'>('setup');
  const [status, setStatus] = useState('Iniciando...');
  const [connected, setConnected] = useState(false);
  const clientRef = useRef<DaemonClient | null>(null);

  useEffect(() => {
    getConfig()
      .then(setConfig)
      .catch(() => setStatus('Daemon no disponible. ¿Está corriendo? (python main.py)'));
    const client = new DaemonClient((s, c) => {
      setStatus(s);
      setConnected(c);
    });
    clientRef.current = client;
    client.connect();
    return () => client.disconnect();
  }, []);

  const refresh = useCallback(() => {
    getConfig()
      .then(setConfig)
      .catch(() => undefined);
  }, []);

  return (
    <div className="app">
      {view === 'setup' ? (
        <Setup
          config={config}
          onConnected={() => {
            refresh();
            setView('chat');
          }}
          onProbeReport={() => refresh()}
        />
      ) : (
        <Chat
          config={config}
          client={clientRef.current!}
          status={status}
          connected={connected}
          onBack={() => {
            refresh();
            setView('setup');
          }}
        />
      )}
    </div>
  );
}