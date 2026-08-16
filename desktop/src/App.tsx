import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChatMessage,
  ConfigInfo,
  DaemonClient,
  ProbeReport,
  configure as apiConfigure,
  getConfig,
  getProjects,
  probe as apiProbe,
  setModel as apiSetModel,
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
  'Crea una carpeta llamada "agentrelay-test"',
  'Muestra los archivos del Escritorio',
  '¿Qué hora es?',
];

const FALLBACK_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

function SettingsView({
  config,
  onConnected,
  onModelChanged,
  onBack,
}: {
  config: ConfigInfo | null;
  onConnected: () => void;
  onModelChanged: () => void;
  onBack: () => void;
}) {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [scanning, setScanning] = useState(false);
  const [report, setReport] = useState<ProbeReport | null>(null);
  const [modelMsg, setModelMsg] = useState('');

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
    } catch (e) {
      setMsg(`⚠ Escaneo falló: ${String(e)}`);
    } finally {
      setScanning(false);
    }
  };

  const pickModel = async (model: string) => {
    setModelMsg('');
    try {
      const res = await apiSetModel(model);
      if (res.ok) {
        setModelMsg(`✓ Modelo activo: ${res.model}`);
        onModelChanged();
      } else {
        setModelMsg(`⚠ ${res.error}`);
      }
    } catch (e) {
      setModelMsg(`⚠ ${String(e)}`);
    }
  };

  const availableModels =
    report && report.results.filter((r) => r.status === 'ok').map((r) => r.model);
  const modelList = availableModels && availableModels.length > 0 ? availableModels : FALLBACK_MODELS;

  return (
    <div className="settings">
      <div className="settings-head">
        <button className="link" onClick={onBack}>
          ← Volver
        </button>
        <h1>Ajustes</h1>
      </div>

      {config && (
        <div className="card current">
          <b>Proveedor</b> {config.provider} · {config.model} · modo <code>{config.mode}</code>
          {config.vertex_blocked && (
            <div className="warn">Vertex AI bloqueado — tu cuenta cloud no se cobra</div>
          )}
        </div>
      )}

      <h2 className="section-title">Proveedor y API key</h2>
      <div className="providers">
        {PROVIDERS.map((p) => (
          <div className="card provider" key={p.id}>
            <div className="provider-name">
              {p.name} <span className={`badge ${p.badge === 'gratis' ? 'free' : 'paid'}`}>{p.badge}</span>
            </div>
            <div className="provider-desc">{p.desc}</div>
            <div className="provider-actions">
              {p.needsKey ? (
                <>
                  <input
                    type="password"
                    placeholder="Pega tu API key"
                    value={keys[p.id] || ''}
                    onChange={(e) => setKeys({ ...keys, [p.id]: e.target.value })}
                  />
                  <button onClick={() => connect(p.id)} disabled={busyProvider !== null}>
                    {busyProvider === p.id ? '…' : 'Conectar'}
                  </button>
                </>
              ) : (
                <button onClick={() => connect(p.id)} disabled={busyProvider !== null}>
                  {busyProvider === p.id ? '…' : 'Conectar'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <h2 className="section-title">Modelo</h2>
      <div className="card">
        <div className="billing">
          Activo: <b>{config?.model ?? '—'}</b>
        </div>
        <div className="model-list">
          {modelList.map((m) => (
            <button
              key={m}
              className={m === config?.model ? 'model active' : 'model'}
              onClick={() => pickModel(m)}
            >
              {m}
            </button>
          ))}
        </div>
        {modelMsg && <div className="msg">{modelMsg}</div>}
      </div>

      <h2 className="section-title">Escaneo de modelos</h2>
      <button onClick={scan} disabled={scanning} className="scan-btn">
        {scanning ? 'Escaneando… (~30s)' : '🔍 Escanear modelos disponibles'}
      </button>

      {report && (
        <div className="card report">
          <div className="billing">
            Billing:{' '}
            {report.billing.known
              ? report.billing.billing_enabled
                ? 'ACTIVADO (Vertex AI factura)'
                : 'DESACTIVADO (free OK)'
              : `desconocido (${report.billing.reason || '?'})`}
          </div>
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
            <div className="chosen">✓ Mejor gratuito: {report.chosen.provider}/{report.chosen.model}</div>
          ) : (
            <div className="warn">Sin modelo gratuito disponible en este modo.</div>
          )}
        </div>
      )}

      {msg && <div className="msg">{msg}</div>}
    </div>
  );
}

function ChatView({
  config,
  client,
  status,
  connected,
  project,
}: {
  config: ConfigInfo | null;
  client: DaemonClient;
  status: string;
  connected: boolean;
  project: string | null;
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
      case 'done':
        setBusy(false);
        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, streaming: false } : x)));
        break;
      case 'error':
        setBusy(false);
        setMessages((prev) =>
          prev.map((x) =>
            x.id === m.id
              ? { ...x, content: x.content + (m.message ?? ''), streaming: false }
              : x,
          ),
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
      <div className="chat-top">
        <div className="project-chip">{project ?? 'Local'}</div>
        <div className="model-chip">{config?.provider}/{config?.model}</div>
        <div className={`dot ${connected ? 'on' : 'off'}`} title={status} />
      </div>

      <div className="messages" ref={listRef}>
        {messages.length === 0 && (
          <div className="welcome">
            <h2>¿Qué hacemos hoy?</h2>
            <p>Dame una tarea de desarrollo y la ejecuto en tu Mac.</p>
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
          placeholder="Escribe una tarea para tu Mac…"
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
  const [view, setView] = useState<'chat' | 'settings'>('chat');
  const [status, setStatus] = useState('Iniciando…');
  const [connected, setConnected] = useState(false);
  const [projects, setProjects] = useState<string[]>([]);
  const [project, setProject] = useState<string | null>(null);
  const [session, setSession] = useState(0);
  const clientRef = useRef<DaemonClient | null>(null);
  if (!clientRef.current) {
    clientRef.current = new DaemonClient((s, c) => {
      setStatus(s);
      setConnected(c);
    });
  }

  useEffect(() => {
    getConfig()
      .then(setConfig)
      .catch(() => setStatus('Daemon no disponible (python main.py)'));
    getProjects().then(setProjects).catch(() => undefined);
    clientRef.current?.connect();
    return () => clientRef.current?.disconnect();
  }, []);

  const refresh = useCallback(() => {
    getConfig()
      .then(setConfig)
      .catch(() => undefined);
  }, []);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand-row">
          <span className="logo">AR</span>
          <span className="brand-name">AgentRelay</span>
          <span className="brand-ver">v0.1</span>
        </div>
        <button className="new-task" onClick={() => { setSession((s) => s + 1); setView('chat'); }}>
          + Nueva tarea
        </button>
        <nav className="nav">
          <button className={view === 'chat' ? 'active' : ''} onClick={() => setView('chat')}>
            Tareas
          </button>
          <button>Programadas</button>
          <button>Complementos</button>
        </nav>
        <div className="section-title">Proyectos</div>
        <ul className="projects">
          {projects.map((p) => (
            <li
              key={p}
              className={project === p ? 'active' : ''}
              onClick={() => setProject(p)}
              title={p}
            >
              {p.split('/').slice(-2).join('/')}
            </li>
          ))}
        </ul>
        <div className="sidebar-footer">
          <div className="conn">
            <span className={`dot ${connected ? 'on' : 'off'}`} />
            {status}
          </div>
          <button className="gear" onClick={() => setView('settings')} title="Ajustes">
            ⚙
          </button>
        </div>
      </aside>

      <main className="main">
        {view === 'chat' && clientRef.current ? (
          <ChatView
            key={session}
            config={config}
            client={clientRef.current}
            status={status}
            connected={connected}
            project={project}
          />
        ) : view === 'settings' ? (
          <SettingsView
            config={config}
            onConnected={() => {
              refresh();
              setView('chat');
            }}
            onModelChanged={refresh}
            onBack={() => setView('chat')}
          />
        ) : null}
      </main>
    </div>
  );
}