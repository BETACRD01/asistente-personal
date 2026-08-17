import ModelSelect from './ModelSelect';

interface ChatTopBarProps {
  project: string | null;
  connected: boolean;
  status: string;
  models: string[];
  currentModel: string;
  onPickModel: (model: string) => void;
  onOpenFolder: () => void;
}

export default function ChatTopBar({
  project,
  connected,
  status,
  models,
  currentModel,
  onPickModel,
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
      <div className={`dot ${connected ? 'on' : 'off'}`} title={status} />
    </div>
  );
}