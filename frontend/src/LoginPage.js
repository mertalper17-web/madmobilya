import { useState } from 'react';
import { useAuth } from '@/AuthContext';
import { LogIn, Lock } from 'lucide-react';
import './LoginPage.css';

export default function LoginPage() {
  const { login } = useAuth();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try { await login(u.trim(), p); }
    catch (e2) { setErr(e2.response?.data?.detail || 'Giriş başarısız'); }
    finally { setBusy(false); }
  };

  return <div className="login-shell">
    <div className="login-card">
      <img src="/logo.jpg" alt="MAD Mobilya" className="login-logo"/>
      <h1>MAD MOBİLYA</h1>
      <p className="login-sub">İşletme Yönetim Sistemi</p>
      <form onSubmit={submit}>
        <label>Kullanıcı adı
          <input value={u} onChange={e => setU(e.target.value)} autoFocus autoComplete="username" data-testid="login-username"/>
        </label>
        <label>Şifre
          <input type="password" value={p} onChange={e => setP(e.target.value)} autoComplete="current-password" data-testid="login-password"/>
        </label>
        {err && <div className="form-error" data-testid="login-error">{err}</div>}
        <button className="primary full" type="submit" disabled={busy} data-testid="login-submit">
          {busy ? <span className="calc-spin"/> : <LogIn size={14}/>} {busy ? 'Giriş yapılıyor...' : 'Giriş Yap'}
        </button>
      </form>
      <p className="login-foot"><Lock size={11}/> Yetkili erişim gereklidir. Kullanıcı adı ve şifrenizi yöneticinizden alın.</p>
    </div>
  </div>;
}
