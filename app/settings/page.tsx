'use client';
import { useEffect, useState } from 'react';
import { api, refreshMe, useMe, usd } from '@/components/useMe';

export default function SettingsPage() {
  const { me } = useMe(true);
  const l = me?.limits;
  const [perOrder, setPerOrder] = useState('20');
  const [monthly, setMonthly] = useState('50');
  const [autoBuy, setAutoBuy] = useState(true);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!l) return;
    setPerOrder(String(l.perOrder)); setMonthly(String(l.monthly)); setAutoBuy(l.autoBuy);
  }, [l?.perOrder, l?.monthly, l?.autoBuy]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('paypal') === 'linked') setMsg({ kind: 'ok', text: 'PayPal linked. The agent can now auto-buy within your limits.' });
    if (q.get('paypal') === 'cancelled') setMsg({ kind: 'warn', text: 'PayPal linking was cancelled.' });
    if (q.get('paypal') === 'error') setMsg({ kind: 'err', text: q.get('msg') || 'PayPal linking failed.' });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      await api('/api/settings', { perOrder: Number(perOrder), monthly: Number(monthly), autoBuy });
      await refreshMe();
      setMsg({ kind: 'ok', text: 'Limits saved.' });
    } catch (err: any) { setMsg({ kind: 'err', text: err.message }); }
    setBusy(false);
  }
  async function link() {
    setBusy(true);
    try { window.location.href = (await api<{ approvalUrl: string }>('/api/paypal/vault/setup', {})).approvalUrl; }
    catch (err: any) { setMsg({ kind: 'err', text: err.message }); setBusy(false); }
  }
  async function unlink() {
    setBusy(true);
    try { await api('/api/paypal/vault/unlink', {}); await refreshMe(); setMsg({ kind: 'ok', text: 'PayPal unlinked.' }); }
    catch (err: any) { setMsg({ kind: 'err', text: err.message }); }
    setBusy(false);
  }

  if (!l) return <div className="page muted">Loading...</div>;
  return (
    <div className="page narrow">
      <h1>Settings</h1>
      <p className="muted">Your mandate: what the agent is allowed to do on its own. Code enforces these limits on every order, so the AI cannot go over them.</p>
      {msg && <div className={`alert alert-${msg.kind}`}>{msg.text}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>1. Link PayPal once</h2>
        <p className="small muted">You log in to PayPal (sandbox) and approve saving it for future purchases (PayPal Vault). The agent then pays with it, inside your limits.</p>
        {l.simulated && <div className="alert alert-warn small">No PayPal sandbox keys are configured on this server, so linking is simulated. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to use the real sandbox.</div>}
        <div className="row">
          {l.paypalLinked
            ? <><span className="badge b-linked">PayPal linked</span><span className="small muted grow">{l.paypalEmail ?? ''}</span><button className="btn btn-sm btn-danger" onClick={unlink} disabled={busy}>Unlink</button></>
            : <button className="btn btn-primary" onClick={link} disabled={busy}>Link PayPal</button>}
        </div>
      </div>

      <form className="card" onSubmit={save}>
        <h2>2. Safety limits</h2>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="field grow"><label htmlFor="po">Max per order (USD)</label><input id="po" className="input" type="number" min="1" step="0.01" value={perOrder} onChange={(e) => setPerOrder(e.target.value)} /></div>
          <div className="field grow"><label htmlFor="mo">Monthly cap (USD)</label><input id="mo" className="input" type="number" min="1" step="0.01" value={monthly} onChange={(e) => setMonthly(e.target.value)} /></div>
        </div>
        <label className="switch" style={{ marginBottom: 14 }}>
          <input type="checkbox" checked={autoBuy} onChange={(e) => setAutoBuy(e.target.checked)} />
          Auto-buy without asking when inside my limits
        </label>
        <p className="small muted">Spent this month: {usd(l.spentThisMonth)} of {usd(l.monthly)}.</p>
        <button className="btn btn-primary" disabled={busy}>Save limits</button>
      </form>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>How the agent decides</h2>
        <ul className="small" style={{ margin: 0, paddingLeft: 18, color: 'var(--ink-2)' }}>
          <li>Auto-buy only if: price is within the budget you said, that budget is within your per-order limit, the monthly cap is not crossed, auto-buy is on and PayPal is linked.</li>
          <li>Anything else: the agent shows the best product with an Approve button.</li>
          <li>Every auto-purchase has a {me?.undoMinutes ?? 10}-minute undo with a full PayPal refund. Sellers are paid after the undo window.</li>
        </ul>
      </div>
    </div>
  );
}
