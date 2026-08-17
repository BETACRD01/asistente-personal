import { useEffect, useState } from 'react';
import type { AccountInfo } from '../types';
import { getAccount as apiGetAccount, login as apiLogin, logout as apiLogout } from '../api';

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

  const doLogout = async () => {
    setBusy(true);
    setMsg('');
    try {
      const res = await apiLogout();
      if (!res.ok) {
        setMsg(`⚠ ${res.error}`);
      } else {
        setMsg('✓ Sesión cerrada');
        setAccount(await apiGetAccount());
      }
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
      {account?.logged ? (
        <div className="row-actions">
          <button className="primary" onClick={doLogin} disabled={busy}>
            Cambiar cuenta
          </button>
          <button className="danger" onClick={doLogout} disabled={busy}>
            Cerrar sesión
          </button>
        </div>
      ) : (
        <button className="primary" onClick={doLogin} disabled={busy}>
          {busy ? 'Iniciando sesión…' : 'Iniciar sesión con Google'}
        </button>
      )}
      {msg && <div className="msg">{msg}</div>}
    </div>
  );
}