// Orders: the only place money moves. Every function re-reads prices from the
// database and re-runs the rules engine. Nothing the AI says is trusted here.
import { randomInt, randomUUID } from 'node:crypto';
import { query, one, num, logEvent } from './db';
import { config, paypalSimulated } from './env';
import { evaluateRules, splitAmount } from './rules-core';
import * as paypal from './paypal';
import type { Limits, Receipt, RuleResult } from './contracts';
import { HttpError } from './auth';
import { withUserLock } from './guards';

type OrderRow = Record<string, any>;

const ORDER_SELECT = `select o.*, p.title as product_title, p.thumbnail from orders o join products p on p.id = o.product_id`;

export function toReceipt(o: OrderRow, ruleMessage?: string): Receipt {
  return {
    orderId: o.id, status: o.status, productId: o.product_id, productTitle: o.product_title, thumbnail: o.thumbnail,
    amount: num(o.amount), platformFee: num(o.platform_fee), sellerAmount: num(o.seller_amount),
    paypalOrderId: o.paypal_order_id, paypalCaptureId: o.paypal_capture_id, trackingNumber: o.tracking_number,
    undoUntil: o.undo_until ? new Date(o.undo_until).toISOString() : null, rule: o.rule_triggered, ruleMessage,
    agentReason: o.agent_reason, payoutBatchId: o.payout_batch_id,
    createdAt: o.created_at ? new Date(o.created_at).toISOString() : undefined, simulated: paypalSimulated(),
  };
}

async function getOrder(id: string) {
  return one<OrderRow>(`${ORDER_SELECT} where o.id = $1`, [id]);
}

async function getMandate(userId: string) {
  return one<OrderRow>('select * from mandates where user_id = $1', [userId]);
}

async function spentThisMonth(userId: string): Promise<number> {
  const r = await one<{ s: string }>(
    `select coalesce(sum(amount), 0) as s from orders
     where user_id = $1 and status in ('PROCESSING', 'PAID', 'PAID_OUT') and created_at >= date_trunc('month', now())`, [userId]);
  return num(r?.s);
}

export async function getMyLimits(userId: string): Promise<Limits> {
  const m = await getMandate(userId);
  return {
    perOrder: num(m?.per_order_limit ?? 20), monthly: num(m?.monthly_limit ?? 50),
    spentThisMonth: await spentThisMonth(userId), autoBuy: m?.auto_buy_enabled ?? true,
    paypalLinked: !!m?.paypal_vault_id, paypalEmail: m?.paypal_email ?? null, simulated: paypalSimulated(), vaultEnabled: config.vaultEnabled,
  };
}

export async function updateLimits(userId: string, v: { perOrder: number; monthly: number; autoBuy: boolean }) {
  if (!(v.perOrder > 0 && v.perOrder <= 10000) || !(v.monthly > 0 && v.monthly <= 100000)) throw new HttpError(400, 'Limits must be positive amounts.');
  if (v.perOrder > v.monthly) throw new HttpError(400, 'Per-order limit cannot be higher than the monthly cap.');
  await query(
    `insert into mandates (user_id, per_order_limit, monthly_limit, auto_buy_enabled, updated_at) values ($1,$2,$3,$4,now())
     on conflict (user_id) do update set per_order_limit = $2, monthly_limit = $3, auto_buy_enabled = $4, updated_at = now()`,
    [userId, v.perOrder, v.monthly, v.autoBuy]);
  await logEvent('MANDATE_UPDATED', 'app', null, { userId, ...v });
  return getMyLimits(userId);
}

export async function checkPurchaseRules(userId: string, productId: number, requestBudget: number | null): Promise<RuleResult> {
  const p = await one<OrderRow>('select price, stock from products where id = $1', [productId]);
  const m = await getMandate(userId);
  return evaluateRules({
    product: p ? { price: num(p.price), stock: p.stock } : null,
    mandate: m ? { perOrderLimit: num(m.per_order_limit), monthlyLimit: num(m.monthly_limit), autoBuy: m.auto_buy_enabled, paypalLinked: !!m.paypal_vault_id } : null,
    spentThisMonth: await spentThisMonth(userId),
    requestBudget,
  });
}

const trackingNumber = () => `BZR-${randomInt(10000000, 99999999)}`;

async function markPaid(orderId: string, cap: paypal.CaptureResult) {
  const tracking = trackingNumber();
  await query(
    `update orders set status = 'PAID', paypal_order_id = $2, paypal_capture_id = $3, tracking_number = $4,
       undo_until = now() + ($5 || ' minutes')::interval, error = null where id = $1`,
    [orderId, cap.paypalOrderId, cap.captureId, tracking, String(config.undoMinutes)]);
  await query('update products set stock = greatest(stock - 1, 0) where id = (select product_id from orders where id = $1)', [orderId]);
  await logEvent('ORDER_PAID', paypalSimulated() ? 'simulated' : config.useSdk ? 'paypal-sdk' : 'paypal', orderId, cap);
  paypal.addTracking(cap.paypalOrderId, cap.captureId, tracking).catch(() => {});
}

export function placeOrder(userId: string, productId: number, requestBudget: number | null, agentReason: string): Promise<Receipt> {
  return withUserLock(userId, () => placeOrderLocked(userId, productId, requestBudget, agentReason));
}

async function placeOrderLocked(userId: string, productId: number, requestBudget: number | null, agentReason: string): Promise<Receipt> {
  const rule = await checkPurchaseRules(userId, productId, requestBudget);
  const product = await one<OrderRow>('select id, title, thumbnail, price from products where id = $1', [productId]);
  if (rule.decision === 'REJECT' || !product) {
    return {
      orderId: '', status: 'REJECTED', productId, productTitle: product?.title ?? `Product ${productId}`, thumbnail: product?.thumbnail,
      amount: num(product?.price), platformFee: 0, sellerAmount: 0, rule: rule.rule, ruleMessage: rule.message, simulated: paypalSimulated(),
    };
  }
  const price = num(product.price); // price from the database only
  const { platformFee, sellerAmount } = splitAmount(price, config.platformFeeRate);
  const auto = rule.decision === 'AUTO_BUY';
  const orderId = randomUUID();
  await query(
    `insert into orders (id, user_id, product_id, amount, platform_fee, seller_amount, status, rule_triggered, agent_reason, request_budget)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [orderId, userId, productId, price, platformFee, sellerAmount, auto ? 'PROCESSING' : 'AWAITING_APPROVAL', rule.rule, agentReason?.slice(0, 500) ?? null, requestBudget]);
  await logEvent(auto ? 'AUTO_BUY_STARTED' : 'APPROVAL_REQUIRED', 'rules-engine', orderId, rule);

  if (auto) {
    const m = await getMandate(userId);
    try {
      await markPaid(orderId, await paypal.chargeVault({ orderId, amount: price, title: product.title, productId }, m!.paypal_vault_id));
    } catch (err: any) {
      // Fallback from the plan: if the saved-PayPal charge fails, ask for a one-tap approval instead.
      await query(`update orders set status = 'AWAITING_APPROVAL', rule_triggered = 'VAULT_CHARGE_FAILED', error = $2 where id = $1`, [orderId, err.message]);
      await logEvent('VAULT_CHARGE_FAILED', 'paypal', orderId, { error: err.message });
      return toReceipt((await getOrder(orderId))!, 'The saved PayPal charge did not go through, so this needs a one-tap approval.');
    }
  }
  return toReceipt((await getOrder(orderId))!, rule.message);
}

// One-tap approval for AWAITING_APPROVAL orders. The user clicked Approve, which is explicit consent.
export function approveOrder(userId: string, orderId: string): Promise<{ receipt?: Receipt; redirect?: string }> {
  return withUserLock(userId, () => approveOrderLocked(userId, orderId));
}

async function approveOrderLocked(userId: string, orderId: string): Promise<{ receipt?: Receipt; redirect?: string }> {
  const claimed = await one<OrderRow>(
    `update orders set status = 'PROCESSING' where id = $1 and user_id = $2 and status = 'AWAITING_APPROVAL' returning *`, [orderId, userId]);
  if (!claimed) throw new HttpError(409, 'This order is not waiting for approval (it may already be paid or cancelled).');
  const product = await one<OrderRow>('select title, stock from products where id = $1', [claimed.product_id]);
  if (!product || product.stock <= 0) {
    await query(`update orders set status = 'CANCELLED', error = 'Out of stock' where id = $1`, [orderId]);
    throw new HttpError(409, 'Sorry, this product just went out of stock.');
  }
  const unit = { orderId, amount: num(claimed.amount), title: product.title, productId: claimed.product_id };
  const m = await getMandate(userId);
  try {
    if (m?.paypal_vault_id && claimed.rule_triggered !== 'VAULT_CHARGE_FAILED') {
      await markPaid(orderId, await paypal.chargeVault(unit, m.paypal_vault_id));
      await logEvent('ORDER_APPROVED', 'user', orderId, { via: 'saved PayPal' });
      return { receipt: toReceipt((await getOrder(orderId))!) };
    }
    const checkout = await paypal.createCheckoutOrder(unit);
    await query(`update orders set status = 'AWAITING_APPROVAL', paypal_order_id = $2 where id = $1`, [orderId, checkout.paypalOrderId]);
    return { redirect: checkout.approveUrl };
  } catch (err: any) {
    await query(`update orders set status = 'AWAITING_APPROVAL', error = $2 where id = $1`, [orderId, err.message]);
    throw new HttpError(502, err.message);
  }
}

// Buyer came back from PayPal checkout: capture the payment.
export async function completeCheckout(orderId: string, paypalOrderId: string): Promise<Receipt> {
  const claimed = await one<OrderRow>(
    `update orders set status = 'PROCESSING' where id = $1 and paypal_order_id = $2 and status = 'AWAITING_APPROVAL' returning *`,
    [orderId, paypalOrderId]);
  if (!claimed) {
    const existing = await getOrder(orderId);
    if (existing) return toReceipt(existing);
    throw new HttpError(404, 'Order not found.');
  }
  try {
    await markPaid(orderId, await paypal.captureOrder(paypalOrderId, orderId));
    await logEvent('ORDER_APPROVED', 'user', orderId, { via: 'PayPal checkout' });
  } catch (err: any) {
    await query(`update orders set status = 'AWAITING_APPROVAL', error = $2 where id = $1`, [orderId, err.message]);
    throw new HttpError(502, err.message);
  }
  return toReceipt((await getOrder(orderId))!);
}

// Undo: refund within the undo window, or cancel an order still waiting for approval.
export async function cancelOrder(userId: string, orderId?: string | null): Promise<Receipt> {
  const o = orderId
    ? await one<OrderRow>(`${ORDER_SELECT} where o.id = $1 and o.user_id = $2`, [orderId, userId])
    : await one<OrderRow>(`${ORDER_SELECT} where o.user_id = $1 and o.status in ('PAID', 'AWAITING_APPROVAL') order by o.created_at desc limit 1`, [userId]);
  if (!o) throw new HttpError(404, 'No order found to cancel.');
  if (o.status === 'AWAITING_APPROVAL') {
    await query(`update orders set status = 'CANCELLED' where id = $1 and status = 'AWAITING_APPROVAL'`, [o.id]);
    await logEvent('ORDER_CANCELLED', 'user', o.id, {});
    return toReceipt((await getOrder(o.id))!, 'Cancelled before payment. Nothing was charged.');
  }
  if (o.status !== 'PAID') return toReceipt(o, `This order is ${o.status} and cannot be undone.`);
  if (!o.undo_until || new Date(o.undo_until) < new Date()) return toReceipt(o, 'The undo window has closed for this order.');
  const claimed = await one<OrderRow>(`update orders set status = 'PROCESSING' where id = $1 and status = 'PAID' returning id`, [o.id]);
  if (!claimed) return toReceipt((await getOrder(o.id))!, 'This order is already being processed.');
  try {
    const r = await paypal.refundCapture(o.paypal_capture_id, o.id);
    await query(`update orders set status = 'REFUNDED', refund_id = $2, undo_until = null where id = $1`, [o.id, r.refundId]);
    await query('update products set stock = stock + 1 where id = $1', [o.product_id]);
    await logEvent('ORDER_REFUNDED', paypalSimulated() ? 'simulated' : config.useSdk ? 'paypal-sdk' : 'paypal', o.id, r);
  } catch (err: any) {
    await query(`update orders set status = 'PAID', error = $2 where id = $1`, [o.id, err.message]);
    throw new HttpError(502, err.message);
  }
  return toReceipt((await getOrder(o.id))!, 'Refunded in full through PayPal.');
}

export async function getMyOrders(userId: string, limit = 50): Promise<Receipt[]> {
  const rows = await query<OrderRow>(`${ORDER_SELECT} where o.user_id = $1 order by o.created_at desc limit $2`, [userId, limit]);
  return rows.map((r) => toReceipt(r));
}

// Pay sellers for orders whose undo window has passed. `includeOpen` is a demo shortcut.
export async function releasePayouts(includeOpen = false) {
  const due = await query<OrderRow>(
    `select o.id, o.seller_amount, p.title, s.paypal_email from orders o
     join products p on p.id = o.product_id join sellers s on s.id = p.seller_id
     where o.status = 'PAID' ${includeOpen ? '' : 'and o.undo_until < now()'} order by o.created_at limit 100`);
  if (!due.length) return { released: 0, batchId: null as string | null };
  const ids = due.map((d) => d.id);
  // Claim them first so two clicks cannot pay a seller twice.
  const claimed = await query<OrderRow>(`update orders set status = 'PROCESSING' where id = any($1::uuid[]) and status = 'PAID' returning id`, [ids]);
  const claimedIds = new Set(claimed.map((c) => c.id));
  const items = due.filter((d) => claimedIds.has(d.id)).map((d) => ({
    orderId: d.id, email: d.paypal_email, amount: num(d.seller_amount), note: `Bazaar AI sale: ${d.title}`.slice(0, 120),
  }));
  try {
    const batchKey = `bazaar-${Date.now()}`;
    const res = await paypal.sendPayouts(batchKey, items);
    for (const it of items) {
      const itemId = res.items.find((x) => x.orderId === it.orderId)?.itemId ?? null;
      await query(`update orders set status = 'PAID_OUT', payout_batch_id = $2, payout_item_id = $3, undo_until = null where id = $1`, [it.orderId, res.batchId, itemId]);
    }
    await logEvent('PAYOUTS_SENT', paypalSimulated() ? 'simulated' : 'paypal', null, { batchId: res.batchId, status: res.status, count: items.length, total: items.reduce((a, b) => a + b.amount, 0) });
    return { released: items.length, batchId: res.batchId };
  } catch (err: any) {
    await query(`update orders set status = 'PAID' where id = any($1::uuid[]) and status = 'PROCESSING'`, [[...claimedIds]]);
    await logEvent('PAYOUTS_FAILED', 'paypal', null, { error: err.message });
    throw new HttpError(502, err.message);
  }
}

export async function adminStats() {
  const t = await one<OrderRow>(`select
      coalesce(sum(amount) filter (where status in ('PAID','PAID_OUT')), 0) as sales,
      coalesce(sum(platform_fee) filter (where status in ('PAID','PAID_OUT')), 0) as revenue,
      coalesce(sum(seller_amount) filter (where status = 'PAID'), 0) as pending_payouts,
      coalesce(sum(seller_amount) filter (where status = 'PAID_OUT'), 0) as paid_out,
      coalesce(sum(amount) filter (where status = 'REFUNDED'), 0) as refunded,
      count(*) filter (where rule_triggered = 'AUTO_BUY_WITHIN_LIMIT' and status <> 'FAILED')::int as auto_buys,
      count(*) filter (where rule_triggered <> 'AUTO_BUY_WITHIN_LIMIT')::int as approvals,
      count(*)::int as orders
    from orders`);
  const sellers = await query<OrderRow>(`select s.name, s.paypal_email,
      coalesce(sum(o.seller_amount) filter (where o.status = 'PAID'), 0) as pending,
      coalesce(sum(o.seller_amount) filter (where o.status = 'PAID_OUT'), 0) as paid
    from sellers s left join products p on p.seller_id = s.id left join orders o on o.product_id = p.id
    group by s.id order by s.id`);
  const events = await query<OrderRow>('select id, order_id, type, source, payload, created_at from events order by id desc limit 20');
  const recent = await query<OrderRow>(`${ORDER_SELECT} order by o.created_at desc limit 20`);
  return {
    totals: Object.fromEntries(Object.entries(t ?? {}).map(([k, v]) => [k, num(v)])),
    sellers: sellers.map((s) => ({ name: s.name, email: s.paypal_email, pending: num(s.pending), paid: num(s.paid) })),
    events, orders: recent.map((r) => toReceipt(r)), simulated: paypalSimulated(), feeRate: config.platformFeeRate,
  };
}

// Webhook handling: keep our order status in sync with PayPal.
export async function applyWebhook(event: any) {
  const type: string = event?.event_type ?? 'UNKNOWN';
  const r = event?.resource ?? {};
  let orderId: string | null = null;
  if (type === 'PAYMENT.CAPTURE.COMPLETED') {
    const o = await one<OrderRow>('select id from orders where paypal_capture_id = $1 or id::text = $2', [r.id, r.custom_id ?? '']);
    orderId = o?.id ?? null;
  } else if (type === 'PAYMENT.CAPTURE.REFUNDED') {
    const captureId = r.links?.find((l: any) => l.rel === 'up')?.href?.split('/').pop();
    const o = await one<OrderRow>('select id from orders where paypal_capture_id = $1 or id::text = $2', [captureId ?? r.id, r.custom_id ?? '']);
    orderId = o?.id ?? null;
    if (orderId) await query(`update orders set status = 'REFUNDED' where id = $1 and status in ('PAID', 'PROCESSING')`, [orderId]);
  } else if (type.startsWith('PAYMENT.PAYOUTS-ITEM.')) {
    const o = await one<OrderRow>('select id from orders where id::text = $1 or payout_item_id = $2', [r.payout_item?.sender_item_id ?? '', r.payout_item_id ?? '']);
    orderId = o?.id ?? null;
    if (orderId && type !== 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED') {
      await query(`update orders set error = $2 where id = $1`, [orderId, `Payout item ${type.split('.').pop()}`]);
    }
  }
  await logEvent(type, 'paypal-webhook', orderId, { id: event?.id, resource_id: r.id, status: r.status ?? r.transaction_status });
  return orderId;
}
