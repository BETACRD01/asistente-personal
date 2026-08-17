import type { ConversationSummary } from '../types';
import ProjectList from './ProjectList';

interface SidebarProps {
  view: 'chat' | 'settings';
  connected: boolean;
  status: string;
  projects: string[];
  project: string | null;
  history: ConversationSummary[];
  convId: string;
  onView: (v: 'chat' | 'settings') => void;
  onNewTask: () => void;
  onOpenConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onOpenFolder: () => void;
  onSelectProject: (p: string) => void;
  onRemoveProject: (p: string) => void;
}

export default function Sidebar({
  view,
  connected,
  status,
  projects,
  project,
  history,
  convId,
  onView,
  onNewTask,
  onOpenConversation,
  onDeleteConversation,
  onOpenFolder,
  onSelectProject,
  onRemoveProject,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand-row">
        <span className="logo">AR</span>
        <span className="brand-name">AgentRelay</span>
        <span className="brand-ver">v0.1</span>
      </div>
      <button
        className="new-task"
        onClick={() => {
          onNewTask();
          onView('chat');
        }}
      >
        + Nueva tarea
      </button>
      <nav className="nav">
        <button className={view === 'chat' ? 'active' : ''} onClick={() => onView('chat')}>
          Tareas
        </button>
        <button>Programadas</button>
        <button>Complementos</button>
      </nav>
      <ProjectList
        projects={projects}
        active={project}
        onSelect={onSelectProject}
        onRemove={onRemoveProject}
        onOpenFolder={onOpenFolder}
      />
      <div className="section-title">Historial</div>
      <ul className="projects conversations">
        {history.length === 0 && <li className="empty">Aún no hay conversaciones guardadas.</li>}
        {history.map((c) => (
          <li
            key={c.id}
            className={c.id === convId ? 'active' : ''}
            onClick={() => onOpenConversation(c.id)}
            title={c.title}
          >
            <span className="conv-title">{c.title || 'Conversación'}</span>
            <span className="conv-meta">{c.count} msgs</span>
            <span
              className="remove"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteConversation(c.id);
              }}
              title="Borrar conversación"
            >
              ✕
            </span>
          </li>
        ))}
      </ul>
      <div className="sidebar-footer">
        <div className="conn">
          <span className={`dot ${connected ? 'on' : 'off'}`} />
          {status}
        </div>
        <button className="gear" onClick={() => onView('settings')} title="Ajustes">
          ⚙
        </button>
      </div>
    </aside>
  );
}