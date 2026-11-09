'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Receipt } from '@/lib/contracts';
import { ReceiptCard } from '@/components/Cards';
import { api, useMe } from '@/components/useMe';

export default function OrdersPage() {
  const { me } = useMe(true);
  const [orders, setOrders] = useState<Receipt[] | null>(null);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);

  const load = useCallback(async () => setOrders(await api<Receipt[]>('/api/orders')), []);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('paid')) setMsg({ kind: 'ok', text: 'Payment approved and captured with PayPal.' });
    if (q.get('cancelled')) setMsg({ kind: 'warn', text: 'PayPal checkout was cancelled. The order is still waiting for approval.' });
    if (q.get('error')) setMsg({ kind: 'err', text: q.get('error')! });
    load();
  }, [load]);

  if (!me?.user) return <div className="page muted">Loading...</div>;
  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 8 }}>
        <h1 className="grow">My orders</h1>
        <button className="btn btn-sm" onClick={load}>Refresh</button>
      </div>
      <p className="muted small">Every order shows which rule the engine applied and why the agent picked the product.</p>
      {msg && <div className={`alert alert-${msg.kind}`}>{msg.text}</div>}
      {orders === null && <p className="muted">Loading...</p>}
      {orders?.length === 0 && <div className="card muted">No orders yet. Ask the agent to buy something from the Chat page.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
        {orders?.map((o) => (
          <div key={o.orderId}>
            <div className="tiny muted" style={{ marginBottom: 4 }}>{o.createdAt ? new Date(o.createdAt).toLocaleString() : ''}</div>
            <ReceiptCard receipt={o} />
          </div>
        ))}
      </div>
    </div>
  );
}
