import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccountInfo,
  ChatMessage,
  ConfigInfo,
  DaemonClient,
  configure as apiConfigure,
  getAccount as apiGetAccount,
  getConfig,
  getModels as apiGetModels,
  getProjects,
  login as apiLogin,
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

const FALLBACK_MODELS = ['gemini-3.6-flash', 'gemini-3.1-flash-lite'];

const isPaidModel = (m: string) => m.includes('pro') || m.includes('preview');

const MODEL_LABELS: Record<string, string> = {
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

const modelLabel = (m: string) => MODEL_LABELS[m] ?? m;

function SettingsView({
  config,
  models,
  onConnected,
  onModelChanged,
  onBack,
}: {
  config: ConfigInfo | null;
  models: string[];
  onConnected: () => void;
  onModelChanged: () => void;
  onBack: () => void;
}) {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [modelMsg, setModelMsg] = useState('');
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);

  useEffect(() => {
    apiGetAccount().then(setAccount).catch(() => undefined);
  }, []);

  const doLogin = async () => {
    setLoginBusy(true);
    setMsg('');
    try {
      const res = await apiLogin();
      if (!res.ok) {
        setMsg(`⚠ ${res.error}`);
        setLoginBusy(false);
        return;
      }
      setMsg('✓ Autoriza en la ventana del navegador… esperando…');
      let acct = await apiGetAccount();
      for (let i = 0; i < 60 && !acct.logged; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        acct = await apiGetAccount();
      }
      setAccount(acct);
      setMsg(acct.logged ? `✓ Sesión iniciada: ${acct.email}` : '⚠ No se completó la sesión. Intenta de nuevo.');
    } catch (e) {
      setMsg(`⚠ ${String(e)}`);
    } finally {
      setLoginBusy(false);
    }
  };

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

      <h2 className="section-title">Cuenta</h2>
      <div className="card">
        <div className="billing">
          Cuenta de Google: <b>{account?.email || 'No iniciada'}</b>
        </div>
        <button className="primary" onClick={doLogin} disabled={loginBusy}>
          {loginBusy ? 'Iniciando sesión…' : account?.logged ? 'Cambiar cuenta / iniciar sesión' : 'Iniciar sesión con Google'}
        </button>
      </div>

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
          Activo: <b>{(config?.model ? (isPaidModel(config.model) ? '⚠ ' : '') + modelLabel(config.model) : '—')}</b>
        </div>
        <div className="model-list">
          {models.map((m) => (
            <button
              key={m}
              className={m === config?.model ? 'model active' : 'model'}
              onClick={() => pickModel(m)}
            >
              {(isPaidModel(m) ? '⚠ ' : '') + modelLabel(m)}
            </button>
          ))}
        </div>
        {modelMsg && <div className="msg">{modelMsg}</div>}
      </div>

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
  models,
  onModelChanged,
}: {
  config: ConfigInfo | null;
  client: DaemonClient;
  status: string;
  connected: boolean;
  project: string | null;
  models: string[];
  onModelChanged: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const streamingNow = messages.some((m) => m.streaming);

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
    const msgId = `u${Date.now()}`;
    const cmdId = `c${Date.now()}`;
    setMessages((prev) => [...prev, { id: msgId, role: 'user', content: text }]);
    setInput('');
    setBusy(true);
    client.sendCommand(cmdId, text);
  };

  const currentModel = config?.model?.split('/').pop() ?? '';

  const pickModel = async (model: string) => {
    if (!model) return;
    const res = await apiSetModel(model);
    if (res.ok) onModelChanged();
  };

  return (
    <div className="chat">
      <div className="chat-top">
        <div className="project-chip" title={project ?? 'Mac local'}>
          {(project ?? 'Mac')[0].toUpperCase()}
        </div>
        <select
          className="model-select"
          value={currentModel}
          onChange={(e) => pickModel(e.target.value)}
          disabled={!connected}
          title="Modelo activo"
        >
          {!models.includes(currentModel) && currentModel && (
            <option value={currentModel}>
              {(isPaidModel(currentModel) ? '⚠ ' : '') + modelLabel(currentModel)}
            </option>
          )}
          {models.map((m) => (
            <option key={m} value={m}>
              {(isPaidModel(m) ? '⚠ ' : '') + modelLabel(m)}
            </option>
          ))}
        </select>
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
        {busy && !streamingNow && (
          <div className="bubble assistant typing" aria-label="procesando">
            <div className="bubble-text">
              <span className="dots"><span /><span /><span /></span>
            </div>
          </div>
        )}
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
  const [models, setModels] = useState<string[]>(FALLBACK_MODELS);
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
    apiGetModels().then((m) => m.length && setModels(m)).catch(() => undefined);
    clientRef.current?.connect();
    return () => clientRef.current?.disconnect();
  }, []);

  const refresh = useCallback(() => {
    getConfig()
      .then(setConfig)
      .catch(() => undefined);
    apiGetModels().then((m) => m.length && setModels(m)).catch(() => undefined);
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
            models={models}
            onModelChanged={refresh}
          />
        ) : view === 'settings' ? (
          <SettingsView
            config={config}
            models={models}
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