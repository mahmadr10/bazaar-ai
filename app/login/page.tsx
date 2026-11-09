'use client';
import { useState } from 'react';
import { useMe } from '@/components/useMe';

export default function LoginPage() {
  const { me } = useMe();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e?: React.FormEvent, creds?: { email: string; password: string }) {
    e?.preventDefault();
    setBusy(true); setErr('');
    const body = creds ?? { email, password };
    const res = await fetch(`/api/auth/${creds ? 'login' : mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error || 'Something went wrong'); setBusy(false); return; }
    window.location.href = '/';
  }

  return (
    <div className="page narrow" style={{ maxWidth: 420 }}>
      <div className="card" style={{ marginTop: 24 }}>
        <h1>{mode === 'login' ? 'Log in' : 'Create account'}</h1>
        <p className="muted small">Bazaar AI is a hackathon demo. Payments use the PayPal sandbox (test money only).</p>
        {err && <div className="alert alert-err">{err}</div>}
        <form onSubmit={submit}>
          <div className="field"><label htmlFor="email">Email</label><input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div className="field"><label htmlFor="pw">Password</label><input id="pw" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={mode === 'signup' ? 8 : 1} required /></div>
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>{mode === 'login' ? 'Log in' : 'Sign up'}</button>
        </form>
        <div className="row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
          <button className="btn btn-sm" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>{mode === 'login' ? 'New here? Sign up' : 'Have an account? Log in'}</button>
          {me?.demo && <button className="btn btn-sm" disabled={busy} onClick={() => submit(undefined, me.demo)}>Use demo account</button>}
        </div>
      </div>
    </div>
  );
}
