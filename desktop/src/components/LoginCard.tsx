import { useEffect, useState } from 'react';
import type { AccountInfo } from '../types';
import { getAccount as apiGetAccount, login as apiLogin } from '../api';

export default function LoginCard() {
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    apiGetAccount().then(setAccount).catch(() => undefined);
  }, []);

  const doLogin = async () => {
    setBusy(true);
    setMsg('');
    try {
      const res = await apiLogin();
      if (!res.ok) {
        setMsg(`⚠ ${res.error}`);
        setBusy(false);
        return;
      }
      setMsg('✓ Autoriza en la ventana del navegador… esperando…');
      let acct = await apiGetAccount();
      for (let i = 0; i < 60 && !acct.logged; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        acct = await apiGetAccount();
      }
      setAccount(acct);
      setMsg(acct.logged ? `✓ Sesión iniciada: ${acct.email}` : '⚠ No se completó la sesión. Intenta de nuevo.');
    } catch (e) {
      setMsg(`⚠ ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="billing">
        Cuenta de Google: <b>{account?.email || 'No iniciada'}</b>
      </div>
      <button className="primary" onClick={doLogin} disabled={busy}>
        {busy ? 'Iniciando sesión…' : account?.logged ? 'Cambiar cuenta / iniciar sesión' : 'Iniciar sesión con Google'}
      </button>
      {msg && <div className="msg">{msg}</div>}
    </div>
  );
}