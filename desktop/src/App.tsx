import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConfigInfo } from './types';
import { DaemonClient, getConfig, getModels as apiGetModels } from './api';
import { FALLBACK_MODELS } from './constants';
import { useProjects } from './hooks/useProjects';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import SettingsView from './components/SettingsView';

export default function App() {
  const [config, setConfig] = useState<ConfigInfo | null>(null);
  const [view, setView] = useState<'chat' | 'settings'>('chat');
  const [status, setStatus] = useState('Iniciando…');
  const [connected, setConnected] = useState(false);
  const [session, setSession] = useState(0);
  const [models, setModels] = useState<string[]>(FALLBACK_MODELS);
  const { projects, project, loadProjects, openFolderPicker, selectProject, removeProject } = useProjects();
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
    loadProjects();
    apiGetModels().then((m) => m.length && setModels(m)).catch(() => undefined);
    clientRef.current?.connect();
    return () => clientRef.current?.disconnect();
  }, [loadProjects]);

  const refresh = useCallback(() => {
    getConfig()
      .then(setConfig)
      .catch(() => undefined);
    apiGetModels().then((m) => m.length && setModels(m)).catch(() => undefined);
  }, []);

  return (
    <div className="app">
      <Sidebar
        view={view}
        connected={connected}
        status={status}
        projects={projects}
        project={project}
        onView={setView}
        onNewTask={() => setSession((s) => s + 1)}
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