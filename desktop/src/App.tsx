import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, ConfigInfo, ConversationSummary } from './types';
import {
  DaemonClient,
  deleteConversation as apiDeleteConversation,
  getConfig,
  getConversation as apiGetConversation,
  getConversations as apiGetConversations,
  getModels as apiGetModels,
} from './api';
import { FALLBACK_MODELS } from './constants';
import { useProjects } from './hooks/useProjects';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import SettingsView from './components/SettingsView';

const genId = () => `conv${Date.now()}`;

export default function App() {
  const [config, setConfig] = useState<ConfigInfo | null>(null);
  const [view, setView] = useState<'chat' | 'settings'>('chat');
  const [status, setStatus] = useState('Iniciando…');
  const [connected, setConnected] = useState(false);
  const [session, setSession] = useState(0);
  const [models, setModels] = useState<string[]>(FALLBACK_MODELS);
  const [convId, setConvId] = useState<string>(genId());
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([]);
  const [history, setHistory] = useState<ConversationSummary[]>([]);
  const { projects, project, loadProjects, openFolderPicker, selectProject, removeProject } = useProjects();
  const clientRef = useRef<DaemonClient | null>(null);
  if (!clientRef.current) {
    clientRef.current = new DaemonClient((s, c) => {
      setStatus(s);
      setConnected(c);
    });
  }

  const loadHistory = useCallback(async () => {
    try {
      const res = await apiGetConversations();
      setHistory(res.conversations ?? []);
    } catch {
      /* daemon sin historial */
    }
  }, []);

  useEffect(() => {
    getConfig()
      .then(setConfig)
      .catch(() => setStatus('Daemon no disponible (python main.py)'));
    loadProjects();
    loadHistory();
    apiGetModels().then((m) => m.length && setModels(m)).catch(() => undefined);
    clientRef.current?.connect();
    return () => clientRef.current?.disconnect();
  }, [loadProjects, loadHistory]);

  const refresh = useCallback(() => {
    getConfig()
      .then(setConfig)
      .catch(() => undefined);
    apiGetModels().then((m) => m.length && setModels(m)).catch(() => undefined);
  }, []);

  const newTask = useCallback(() => {
    setInitialMessages([]);
    setConvId(genId());
    setSession((s) => s + 1);
  }, []);

  const openConversation = useCallback(async (id: string) => {
    const conv = await apiGetConversation(id);
    if (!conv) return;
    setInitialMessages(conv.messages ?? []);
    setConvId(id);
    setSession((s) => s + 1);
  }, []);

  const delConversation = useCallback(
    async (id: string) => {
      await apiDeleteConversation(id).catch(() => undefined);
      await loadHistory();
      if (id === convId) newTask();
    },
    [convId, loadHistory, newTask]
  );

  return (
    <div className="app">
      <Sidebar
        view={view}
        connected={connected}
        status={status}
        projects={projects}
        project={project}
        history={history}
        convId={convId}
        onView={setView}
        onNewTask={newTask}
        onOpenConversation={openConversation}
        onDeleteConversation={delConversation}
        onOpenFolder={openFolderPicker}
        onSelectProject={selectProject}
        onRemoveProject={removeProject}
      />
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
            convId={convId}
            initialMessages={initialMessages}
            onHistoryChange={loadHistory}
            onModelChanged={refresh}
            onOpenFolder={openFolderPicker}
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