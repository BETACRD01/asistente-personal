import { useState } from 'react';
import type { ConfigInfo } from '../types';
import { configure as apiConfigure, removeApiKey as apiRemoveKey, setAdmin as apiSetAdmin } from '../api';
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
  const [adminBusy, setAdminBusy] = useState(false);

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

  const toggleAdmin = async (enabled: boolean) => {
    setAdminBusy(true);
    try {
      const res = await apiSetAdmin(enabled);
      setMsg(res.ok ? `✓ Permisos de administrador ${enabled ? 'activados' : 'desactivados'}` : `⚠ ${res.error}`);
      onModelChanged();
    } catch (e) {
      setMsg(`⚠ ${String(e)}`);
    } finally {
      setAdminBusy(false);
    }
  };

  const removeKey = async (id: string) => {
    try {
      const res = await apiRemoveKey(id);
      setMsg(res.ok ? `✓ API key de ${id} eliminada` : `⚠ ${res.error}`);
      setKeys({ ...keys, [id]: '' });
      onModelChanged();
    } catch (e) {
      setMsg(`⚠ ${String(e)}`);
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

      <h2 className="section-title">Permisos</h2>
      <div className="card">
        <div className="billing">
          Administrador:{' '}
          <b>{config?.admin ? 'Activado' : 'Desactivado'}</b>
        </div>
        <p className="provider-desc">
          Con permisos de administrador el agente puede ejecutar comandos con <code>sudo</code>.
          macOS pedirá tu contraseña en pantalla cada vez.
        </p>
        <button className="primary" onClick={() => toggleAdmin(!config?.admin)} disabled={adminBusy}>
          {adminBusy
            ? 'Guardando…'
            : config?.admin
              ? 'Desactivar permisos de administrador'
              : 'Activar permisos de administrador'}
        </button>
      </div>

      <h2 className="section-title">Proveedor y API key</h2>
      <ProviderGrid
        keys={keys}
        hasKeys={config?.keys ?? {}}
        busyProvider={busyProvider}
        onKeyChange={(id, v) => setKeys({ ...keys, [id]: v })}
        onConnect={connect}
        onRemoveKey={removeKey}
      />

      <h2 className="section-title">Modelo</h2>
      <ModelPicker models={models} active={config?.model ?? null} onChanged={onModelChanged} />

      {msg && <div className="msg">{msg}</div>}
    </div>
  );
}