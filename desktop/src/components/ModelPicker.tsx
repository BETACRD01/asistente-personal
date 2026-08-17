import { useState } from 'react';
import { setModel as apiSetModel } from '../api';
import { isPaidModel, modelLabel } from '../lib/models';

interface ModelPickerProps {
  models: string[];
  active: string | null;
  onChanged: () => void;
}

export default function ModelPicker({ models, active, onChanged }: ModelPickerProps) {
  const [msg, setMsg] = useState('');

  const pick = async (model: string) => {
    try {
      const res = await apiSetModel(model);
      setMsg(res.ok ? `✓ Modelo activo: ${res.model}` : `⚠ ${res.error}`);
      if (res.ok) onChanged();
    } catch (e) {
      setMsg(`⚠ ${String(e)}`);
    }
  };

  return (
    <div className="card">
      <div className="billing">
        Activo: <b>{active ? (isPaidModel(active) ? '⚠ ' : '') + modelLabel(active) : '—'}</b>
      </div>
      <div className="model-list">
        {models.map((m) => (
          <button key={m} className={m === active ? 'model active' : 'model'} onClick={() => pick(m)}>
            {(isPaidModel(m) ? '⚠ ' : '') + modelLabel(m)}
          </button>
        ))}
      </div>
      {msg && <div className="msg">{msg}</div>}
    </div>
  );
}