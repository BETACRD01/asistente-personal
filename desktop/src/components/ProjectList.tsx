interface ProjectListProps {
  projects: string[];
  active: string | null;
  onSelect: (path: string) => void;
  onRemove: (path: string) => void;
  onOpenFolder: () => void;
}

export default function ProjectList({ projects, active, onSelect, onRemove, onOpenFolder }: ProjectListProps) {
  return (
    <>
      <div className="section-title">
        Proyectos
        <button className="folder-btn" onClick={onOpenFolder} title="Abrir carpeta">
          📂
        </button>
      </div>
      <ul className="projects">
        {projects.length === 0 && <li className="empty">Ninguna carpeta. Toca 📂 para abrir una.</li>}
        {projects.map((p) => (
          <li key={p} className={active === p ? 'active' : ''} onClick={() => onSelect(p)} title={p}>
            {p.split('/').slice(-2).join('/')}
            <span
              className="remove"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(p);
              }}
            >
              ✕
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}