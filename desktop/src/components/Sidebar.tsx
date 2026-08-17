import ProjectList from './ProjectList';

interface SidebarProps {
  view: 'chat' | 'settings';
  connected: boolean;
  status: string;
  projects: string[];
  project: string | null;
  onView: (v: 'chat' | 'settings') => void;
  onNewTask: () => void;
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
  onView,
  onNewTask,
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