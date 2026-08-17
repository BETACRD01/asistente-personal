import ModelSelect from './ModelSelect';

interface ChatTopBarProps {
  project: string | null;
  connected: boolean;
  status: string;
  models: string[];
  currentModel: string;
  approval: string;
  onPickModel: (model: string) => void;
  onApproval: (mode: string) => void;
  onOpenFolder: () => void;
}

export default function ChatTopBar({
  project,
  connected,
  status,
  models,
  currentModel,
  approval,
  onPickModel,
  onApproval,
  onOpenFolder,
}: ChatTopBarProps) {
  return (
    <div className="chat-top">
      <button className="project-chip" title={project ?? 'Selecciona una carpeta'} onClick={onOpenFolder}>
        {(project ?? 'Abrir').split('/').pop()}
      </button>
      <button className="folder-btn" onClick={onOpenFolder} title="Abrir carpeta del proyecto">
        📂
      </button>
      <ModelSelect models={models} value={currentModel} disabled={!connected} onPick={onPickModel} />
      <select className="model-select approval-select" value={approval} onChange={(e) => onApproval(e.target.value)} title="Permisos de aprobación del agente">
        <option value="always">Preguntar siempre</option>
        <option value="smart">Aprobar por mí</option>
        <option value="full">Acceso completo</option>
      </select>
      <div className={`dot ${connected ? 'on' : 'off'}`} title={status} />
    </div>
  );
}