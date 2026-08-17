import { PROVIDERS } from '../constants';

interface ProviderGridProps {
  keys: Record<string, string>;
  busyProvider: string | null;
  onKeyChange: (id: string, value: string) => void;
  onConnect: (id: string) => void;
}

export default function ProviderGrid({ keys, busyProvider, onKeyChange, onConnect }: ProviderGridProps) {
  return (
    <div className="providers">
      {PROVIDERS.map((p) => (
        <div className="card provider" key={p.id}>
          <div className="provider-name">
            {p.name} <span className={`badge ${p.badge === 'gratis' ? 'free' : 'paid'}`}>{p.badge}</span>
          </div>
          <div className="provider-desc">{p.desc}</div>
          <div className="provider-actions">
            {p.needsKey ? (
              <>
                <input
                  type="password"
                  placeholder="Pega tu API key"
                  value={keys[p.id] || ''}
                  onChange={(e) => onKeyChange(p.id, e.target.value)}
                />
                <button onClick={() => onConnect(p.id)} disabled={busyProvider !== null}>
                  {busyProvider === p.id ? '…' : 'Conectar'}
                </button>
              </>
            ) : (
              <button onClick={() => onConnect(p.id)} disabled={busyProvider !== null}>
                {busyProvider === p.id ? '…' : 'Conectar'}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}