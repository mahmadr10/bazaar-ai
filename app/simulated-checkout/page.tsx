'use client';
import { useEffect, useState } from 'react';

// Stand-in for the PayPal approval page, used only when no sandbox keys are configured.
// With real keys the user is sent to PayPal's sandbox instead.
export default function SimulatedCheckout() {
  const [q, setQ] = useState<URLSearchParams | null>(null);
  useEffect(() => setQ(new URLSearchParams(window.location.search)), []);
  if (!q) return null;
  const kind = q.get('kind');
  const ret = q.get('return') || '/';
  const cancel = q.get('cancel') || '/';
  const safe = (u: string) => (u.startsWith(window.location.origin) || u.startsWith('/') ? u : '/');

  return (
    <div className="sim page">
      <div className="card">
        <span className="badge b-sim">Simulated checkout, no real PayPal call</span>
        <h1 style={{ marginTop: 12 }}>{kind === 'vault' ? 'Save payment method' : 'Approve payment'}</h1>
        <p className="muted small">
          This server has no PayPal sandbox keys yet, so this page stands in for the PayPal approval screen.
          With keys configured, you would log in with a PayPal sandbox buyer account here.
        </p>
        {kind === 'vault'
          ? <p>Allow <strong>Bazaar AI</strong> to charge your saved PayPal for future purchases, only within the limits you set.</p>
          : <p>Pay <strong>${q.get('amount')}</strong> for <strong>{q.get('title')}</strong>.</p>}
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn" onClick={() => (window.location.href = safe(cancel))}>Cancel</button>
          <button className="btn btn-primary grow" onClick={() => (window.location.href = safe(ret))}>{kind === 'vault' ? 'Agree and link' : 'Approve and pay'}</button>
        </div>
      </div>
    </div>
  );
}
