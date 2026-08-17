import { useCallback, useEffect, useState } from 'react';
import type { ConfigInfo, ChatMessage, DaemonClient, WsMessage } from '../api';
import { setModel as apiSetModel, setApproval as apiSetApproval } from '../api';
import ChatTopBar from './ChatTopBar';
import MessageList from './MessageList';

interface ChatViewProps {
  config: ConfigInfo | null;
  client: DaemonClient;
  status: string;
  connected: boolean;
  project: string | null;
  models: string[];
  onModelChanged: () => void;
  onOpenFolder: () => void;
}

interface PendingApproval {
  id: string;
  command: string;
  reason: string;
}

export default function ChatView({
  config,
  client,
  status,
  connected,
  project,
  models,
  onModelChanged,
  onOpenFolder,
}: ChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);

  const handleWs = useCallback((m: WsMessage) => {
    switch (m.type) {
      case 'token': {
        const id = m.id ?? '';
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
      case 'image': {
        const id = m.id ?? '';
        const src = m.data ? `data:${m.mime ?? 'image/png'};base64,${m.data}` : '';
        setMessages((prev) => [
          ...prev,
          { id: `${id}-img`, role: 'assistant', content: '', image: src, streaming: false },
        ]);
        break;
      }
      case 'done':
        setBusy(false);
        setMessages((prev) =>
          prev.map((x) =>
            x.id === m.id
              ? { ...x, streaming: false, model: m.model || x.model }
              : x.id === `${m.id}-img`
                ? { ...x, streaming: false, model: m.model || x.model }
                : x,
          ),
        );
        break;
      case 'error':
        setBusy(false);
        setMessages((prev) =>
          prev.map((x) =>
            x.id === m.id ? { ...x, content: x.content + (m.message ?? ''), streaming: false } : x,
          ),
        );
        break;
      case 'approval_request':
        setPendingApproval({ id: m.id ?? '', command: m.command ?? '', reason: m.reason ?? 'ejecutar una acción' });
        break;
    }
  }, []);

  useEffect(() => {
    client.onMessage = handleWs;
  }, [client, handleWs]);

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

  const pickApproval = async (mode: string) => {
    const res = await apiSetApproval(mode);
    if (res.ok) onModelChanged();
  };

  const answerApproval = (approved: boolean) => {
    if (!pendingApproval) return;
    client.sendApproval(pendingApproval.id, approved);
    setPendingApproval(null);
  };

  return (
    <div className="chat">
      <ChatTopBar
        project={project}
        connected={connected}
        status={status}
        models={models}
        currentModel={currentModel}
        approval={config?.approval ?? 'smart'}
        onPickModel={pickModel}
        onApproval={pickApproval}
        onOpenFolder={onOpenFolder}
      />
      {pendingApproval && (
        <div className="approval-bubble">
          <div className="approval-title">¿Aprobar esta acción? <span className="approval-reason">({pendingApproval.reason})</span></div>
          <pre className="approval-cmd">{pendingApproval.command}</pre>
          <div className="approval-actions">
            <button className="primary" onClick={() => answerApproval(true)}>✓ Aprobar</button>
            <button className="danger" onClick={() => answerApproval(false)}>✕ Rechazar</button>
          </div>
        </div>
      )}
      <MessageList messages={messages} busy={busy} onSuggest={send} />
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