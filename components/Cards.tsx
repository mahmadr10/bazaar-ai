'use client';
import { useEffect, useState } from 'react';
import type { ChatCard, Limits, ProductCard, Receipt } from '@/lib/contracts';
import { api, refreshMe, usd } from './useMe';

export function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return <span className="stars" aria-label={`${value} out of 5`}>{'★'.repeat(full)}{'☆'.repeat(5 - full)} <span className="muted tiny">{value.toFixed(1)}</span></span>;
}

export function ProductCards({ products, bestId, note }: { products: ProductCard[]; bestId: number | null; note?: string }) {
  return (
    <>
      {note && <div className="note">{note}</div>}
      <div className="products">
        {products.map((p) => (
          <div key={p.id} className={`pcard ${p.id === bestId ? 'best' : ''}`}>
            {p.id === bestId && <span className="best-tag">Best pick</span>}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.thumbnail} alt={p.title} loading="lazy" />
            <div className="body">
              <div className="title">{p.title}</div>
              <div className="price">{usd(p.price)}</div>
              <Stars value={p.rating} />
              <div className="tiny muted">
                {p.reviewCount ? `${p.reviewCount} reviews, avg ${p.avgReview?.toFixed(1)}` : 'No reviews'} | {p.stock > 0 ? `${p.stock} in stock` : 'Out of stock'}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function useCountdown(until?: string | null) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!until) return;
    const tick = () => setLeft(Math.max(0, new Date(until).getTime() - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [until]);
  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
  return { left, label: `${m}:${String(s).padStart(2, '0')}` };
}

const STATUS_TEXT: Record<string, string> = {
  PAID: 'Paid', PAID_OUT: 'Paid, seller paid out', AWAITING_APPROVAL: 'Needs your approval', REFUNDED: 'Refunded',
  CANCELLED: 'Cancelled', REJECTED: 'Not possible', FAILED: 'Failed', PROCESSING: 'Processing',
};

export function ReceiptCard({ receipt: initial }: { receipt: Receipt }) {
  const [r, setR] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const { left, label } = useCountdown(r.status === 'PAID' ? r.undoUntil : null);

  async function undo() {
    setBusy(true); setErr('');
    try { setR(await api<Receipt>(`/api/orders/${r.orderId}/cancel`, {})); refreshMe(); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  }
  async function approve() {
    setBusy(true); setErr('');
    try {
      const res = await api<{ receipt?: Receipt; redirect?: string }>('/api/orders/approve', { orderId: r.orderId });
      if (res.redirect) { window.location.href = res.redirect; return; }
      if (res.receipt) setR(res.receipt);
      refreshMe();
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <div className="receipt">
      <div className="receipt-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {r.thumbnail && <img src={r.thumbnail} alt="" />}
        <div className="grow">
          <div style={{ fontWeight: 700 }}>{r.productTitle}</div>
          <div className="row" style={{ gap: 6 }}>
            <span className={`badge b-${r.status.toLowerCase()}`}>{STATUS_TEXT[r.status] ?? r.status}</span>
            {r.simulated && <span className="badge b-sim">simulated PayPal</span>}
          </div>
        </div>
        <div style={{ fontWeight: 800, fontSize: 18 }}>{usd(r.amount)}</div>
      </div>
      <div className="receipt-body">
        {r.status !== 'REJECTED' && (
          <>
            <div className="receipt-line"><span className="muted">Platform fee (commission)</span><span>{usd(r.platformFee)}</span></div>
            <div className="receipt-line"><span className="muted">Seller receives</span><span>{usd(r.sellerAmount)}</span></div>
            <div className="receipt-line receipt-total"><span>Total paid with PayPal</span><span>{['PAID', 'PAID_OUT', 'REFUNDED'].includes(r.status) ? usd(r.amount) : '-'}</span></div>
          </>
        )}
        {r.paypalOrderId && <div className="receipt-line"><span className="muted">PayPal order</span><span className="mono">{r.paypalOrderId}</span></div>}
        {r.trackingNumber && <div className="receipt-line"><span className="muted">Tracking</span><span className="mono">{r.trackingNumber}</span></div>}
        <div className="rule">Rule: <strong>{r.rule}</strong>{r.ruleMessage ? `. ${r.ruleMessage}` : ''}</div>
        {r.agentReason && <div className="rule">Why this pick: {r.agentReason}</div>}
        {err && <div className="alert alert-err" style={{ margin: '6px 0 0' }}>{err}</div>}
      </div>
      {r.status === 'PAID' && left > 0 && (
        <div className="receipt-foot">
          <span className="grow">Changed your mind? Undo for a full refund.</span>
          <button className="btn btn-sm btn-danger" onClick={undo} disabled={busy}>Undo <span className="timer">({label})</span></button>
        </div>
      )}
      {r.status === 'AWAITING_APPROVAL' && (
        <div className="receipt-foot">
          <span className="grow">The agent did not buy this automatically. Approve to pay with PayPal.</span>
          <button className="btn btn-sm" onClick={undo} disabled={busy}>Cancel</button>
          <button className="btn btn-sm btn-primary" onClick={approve} disabled={busy}>Approve {usd(r.amount)}</button>
        </div>
      )}
    </div>
  );
}

export function LimitsCard({ limits: l }: { limits: Limits }) {
  return (
    <div className="card small" style={{ maxWidth: 420 }}>
      <div className="receipt-line"><span className="muted">Per-order limit</span><strong>{usd(l.perOrder)}</strong></div>
      <div className="receipt-line"><span className="muted">Monthly cap</span><strong>{usd(l.monthly)}</strong></div>
      <div className="receipt-line"><span className="muted">Spent this month</span><strong>{usd(l.spentThisMonth)}</strong></div>
      <div className="receipt-line"><span className="muted">Auto-buy</span><strong>{l.autoBuy ? 'ON' : 'OFF'}</strong></div>
      <div className="receipt-line"><span className="muted">PayPal</span><strong>{l.paypalLinked ? 'Linked' : 'Not linked'}</strong></div>
    </div>
  );
}

export function OrdersMini({ orders }: { orders: Receipt[] }) {
  if (!orders.length) return <div className="card small muted">No orders yet.</div>;
  return (
    <div className="card small" style={{ maxWidth: 520, width: '100%' }}>
      {orders.map((o) => (
        <div key={o.orderId} className="receipt-line" style={{ padding: '4px 0' }}>
          <span>{o.productTitle}</span>
          <span className="row" style={{ gap: 6 }}>{usd(o.amount)} <span className={`badge b-${o.status.toLowerCase()}`}>{o.status}</span></span>
        </div>
      ))}
    </div>
  );
}

// Shows what the agent actually did, so users and judges can see the AI did not decide the payment.
export function AgentSteps({ steps, model }: { steps: string[]; model?: string }) {
  if (!steps.length) return null;
  return (
    <details className="steps">
      <summary>How I did this ({steps.length} step{steps.length === 1 ? '' : 's'})</summary>
      <ol>{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
      {model && <div className="tiny muted">Model: {model}. Prices and payment decisions come from code, not the AI.</div>}
    </details>
  );
}

export function CardView({ card }: { card: ChatCard }) {
  switch (card.type) {
    case 'products': return <ProductCards products={card.products} bestId={card.bestId} note={card.note} />;
    case 'receipt': return <ReceiptCard receipt={card.receipt} />;
    case 'limits': return <LimitsCard limits={card.limits} />;
    case 'orders': return <OrdersMini orders={card.orders} />;
  }
}
