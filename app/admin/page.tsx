'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Receipt } from '@/lib/contracts';
import { api, useMe, usd } from '@/components/useMe';

type Admin = {
  totals: Record<string, number>;
  sellers: { name: string; email: string; pending: number; paid: number }[];
  events: { id: number; order_id: string | null; type: string; source: string; payload: any; created_at: string }[];
  orders: Receipt[];
  simulated: boolean;
  feeRate: number;
};

export default function AdminPage() {
  const { me } = useMe(true);
  const [d, setD] = useState<Admin | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const load = useCallback(async () => setD(await api<Admin>('/api/admin')), []);
  useEffect(() => { load(); }, [load]);

  async function release(includeOpen: boolean) {
    setBusy(true);
    try {
      const r = await api<{ released: number; batchId: string | null }>('/api/payouts/release', { includeOpen });
      setMsg({ kind: 'ok', text: r.released ? `Paid out ${r.released} order(s) to sellers. Batch ${r.batchId}.` : 'No orders are ready for payout.' });
      await load();
    } catch (e: any) { setMsg({ kind: 'err', text: e.message }); }
    setBusy(false);
  }

  if (!me?.user || !d) return <div className="page muted">Loading...</div>;
  const t = d.totals;
  return (
    <div className="page">
      <h1>Platform money flow</h1>
      <p className="muted small">Buyer pays the full price through PayPal. The platform keeps a {Math.round(d.feeRate * 100)}% commission. Sellers are paid the rest with PayPal Payouts after the undo window closes.</p>
      {d.simulated && <div className="alert alert-warn small">PayPal is in simulated mode (no sandbox keys configured). IDs starting with SIM- are generated locally.</div>}
      {msg && <div className={`alert alert-${msg.kind}`}>{msg.text}</div>}

      <div className="stat-grid">
        <div className="stat"><div className="k">Total sales</div><div className="v">{usd(t.sales)}</div></div>
        <div className="stat"><div className="k">Platform revenue</div><div className="v">{usd(t.revenue)}</div></div>
        <div className="stat"><div className="k">Owed to sellers</div><div className="v">{usd(t.pending_payouts)}</div></div>
        <div className="stat"><div className="k">Paid to sellers</div><div className="v">{usd(t.paid_out)}</div></div>
        <div className="stat"><div className="k">Refunded (undo)</div><div className="v">{usd(t.refunded)}</div></div>
        <div className="stat"><div className="k">Auto-buys / approvals</div><div className="v">{t.auto_buys} / {t.approvals}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <div className="grow">
            <h2>Seller payouts</h2>
            <p className="small muted" style={{ margin: 0 }}>Payouts run automatically when this page loads for orders past the undo window.</p>
          </div>
          <button className="btn" disabled={busy} onClick={() => release(false)}>Release due payouts</button>
          <button className="btn btn-primary" disabled={busy} onClick={() => release(true)} title="Demo shortcut: also pays orders still inside the undo window">Release all now (demo)</button>
        </div>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead><tr><th>Seller</th><th>PayPal email</th><th className="num">Owed</th><th className="num">Paid out</th></tr></thead>
            <tbody>
              {d.sellers.map((s) => (
                <tr key={s.email}><td>{s.name}</td><td className="mono">{s.email}</td><td className="num">{usd(s.pending)}</td><td className="num">{usd(s.paid)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <h2>Recent orders</h2>
      <div className="table-wrap" style={{ marginBottom: 16 }}>
        <table>
          <thead><tr><th>Product</th><th>Status</th><th>Rule</th><th className="num">Amount</th><th className="num">Fee</th><th className="num">Seller</th><th>PayPal IDs</th></tr></thead>
          <tbody>
            {d.orders.length === 0 && <tr><td colSpan={7} className="muted">No orders yet.</td></tr>}
            {d.orders.map((o) => (
              <tr key={o.orderId}>
                <td>{o.productTitle}<div className="tiny muted">{o.agentReason}</div></td>
                <td><span className={`badge b-${o.status.toLowerCase()}`}>{o.status}</span></td>
                <td className="tiny">{o.rule}</td>
                <td className="num">{usd(o.amount)}</td>
                <td className="num">{usd(o.platformFee)}</td>
                <td className="num">{usd(o.sellerAmount)}</td>
                <td className="mono tiny">{[o.paypalOrderId, o.paypalCaptureId, o.payoutBatchId].filter(Boolean).join(' / ') || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Event log (webhooks and audit)</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Time</th><th>Event</th><th>Source</th><th>Details</th></tr></thead>
          <tbody>
            {d.events.length === 0 && <tr><td colSpan={4} className="muted">No events yet.</td></tr>}
            {d.events.map((e) => (
              <tr key={e.id}>
                <td className="tiny" style={{ whiteSpace: 'nowrap' }}>{new Date(e.created_at).toLocaleTimeString()}</td>
                <td><strong className="small">{e.type}</strong></td>
                <td className="tiny">{e.source}</td>
                <td className="mono tiny">{JSON.stringify(e.payload).slice(0, 160)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
