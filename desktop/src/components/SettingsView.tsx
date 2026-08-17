import { useState } from 'react';
import type { ConfigInfo } from '../types';
import { configure as apiConfigure } from '../api';
import LoginCard from './LoginCard';
import ProviderGrid from './ProviderGrid';
import ModelPicker from './ModelPicker';

interface SettingsViewProps {
  config: ConfigInfo | null;
  models: string[];
  onConnected: () => void;
  onModelChanged: () => void;
  onBack: () => void;
}

export default function SettingsView({ config, models, onConnected, onModelChanged, onBack }: SettingsViewProps) {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

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
      <LoginCard />

      <h2 className="section-title">Proveedor y API key</h2>
      <ProviderGrid
        keys={keys}
        busyProvider={busyProvider}
        onKeyChange={(id, v) => setKeys({ ...keys, [id]: v })}
        onConnect={connect}
      />

      <h2 className="section-title">Modelo</h2>
      <ModelPicker models={models} active={config?.model ?? null} onChanged={onModelChanged} />

      {msg && <div className="msg">{msg}</div>}
    </div>
  );
}