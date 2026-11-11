// PayPal REST client (sandbox). Covers OAuth, Vault v3, Orders v2, Refunds, Payouts and webhook verification.
// If no sandbox credentials are set, every call is simulated locally so the app still works end to end.
import { randomUUID } from 'node:crypto';
import { config, paypalSimulated } from './env';
import { sdkCapture, sdkChargeVault, sdkCreateCheckout, sdkRefund } from './paypal-sdk';

let cachedToken: { value: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.exp) return cachedToken.value;
  const auth = Buffer.from(`${config.paypalClientId}:${config.paypalSecret}`).toString('base64');
  const res = await fetch(`${config.paypalBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal auth failed: ${data.error_description || res.status}`);
  cachedToken = { value: data.access_token, exp: Date.now() + (data.expires_in - 60) * 1000 };
  return cachedToken.value;
}

async function pp<T = any>(method: string, path: string, body?: unknown, requestId?: string): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await accessToken()}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
  if (requestId) headers['PayPal-Request-Id'] = requestId; // idempotency: no double charges
  const res = await fetch(`${config.paypalBase}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text.slice(0, 200) }; }
  if (!res.ok) {
    const detail = data?.details?.[0]?.description || data?.message || data?.error_description || res.statusText;
    throw new Error(`PayPal ${method} ${path} failed (${res.status}): ${detail}`);
  }
  return data as T;
}

const link = (data: any, ...rels: string[]) => data?.links?.find((l: any) => rels.includes(l.rel))?.href as string | undefined;
const fakeId = (prefix: string) => `${prefix}-${randomUUID().replace(/-/g, '').slice(0, 17).toUpperCase()}`;

// ---------- Vault v3: save PayPal once ----------
export async function createVaultSetupToken(): Promise<{ id: string; approveUrl: string }> {
  const returnUrl = `${config.appUrl}/api/paypal/vault/return`;
  const cancelUrl = `${config.appUrl}/settings?paypal=cancelled`;
  if (paypalSimulated()) {
    const id = fakeId('SIM-SETUP');
    return { id, approveUrl: `${config.appUrl}/simulated-checkout?kind=vault&token=${id}&return=${encodeURIComponent(`${returnUrl}?approval_token_id=${id}`)}&cancel=${encodeURIComponent(cancelUrl)}` };
  }
  const data = await pp('POST', '/v3/vault/setup-tokens', {
    payment_source: {
      paypal: {
        description: 'Bazaar AI saves your PayPal so the shopping agent can pay within your limits',
        usage_pattern: 'IMMEDIATE',
        usage_type: 'MERCHANT',
        customer_type: 'CONSUMER',
        permit_multiple_payment_tokens: true,
        experience_context: {
          brand_name: 'Bazaar AI', locale: 'en-US', shipping_preference: 'NO_SHIPPING',
          return_url: returnUrl, cancel_url: cancelUrl,
        },
      },
    },
  }, randomUUID());
  const approveUrl = link(data, 'approve');
  if (!approveUrl) throw new Error('PayPal did not return an approval link for the setup token.');
  return { id: data.id, approveUrl };
}

export async function createVaultPaymentToken(setupTokenId: string): Promise<{ vaultId: string; customerId: string | null; email: string | null }> {
  if (paypalSimulated()) return { vaultId: fakeId('SIM-VAULT'), customerId: fakeId('SIM-CUST'), email: 'sandbox-buyer@personal.example' };
  const data = await pp('POST', '/v3/vault/payment-tokens', {
    payment_source: { token: { id: setupTokenId, type: 'SETUP_TOKEN' } },
  }, `pt-${setupTokenId}`);
  return { vaultId: data.id, customerId: data.customer?.id ?? null, email: data.payment_source?.paypal?.email_address ?? null };
}

// ---------- Orders v2 ----------
type Unit = { orderId: string; amount: number; title: string; productId: number };
const purchaseUnit = (u: Unit) => ({
  reference_id: u.orderId,
  custom_id: u.orderId,
  description: u.title.slice(0, 120),
  amount: { currency_code: 'USD', value: u.amount.toFixed(2) },
  items: [{ name: u.title.slice(0, 120), sku: String(u.productId), quantity: '1', category: 'PHYSICAL_GOODS', unit_amount: { currency_code: 'USD', value: u.amount.toFixed(2) } }],
});
const unitBreakdown = (u: Unit) => {
  const pu = purchaseUnit(u);
  return { ...pu, amount: { ...pu.amount, breakdown: { item_total: { currency_code: 'USD', value: u.amount.toFixed(2) } } } };
};

export type CaptureResult = { paypalOrderId: string; captureId: string; status: string };

// Agent auto-buy: charge the saved PayPal (vault id), no buyer redirect.
export async function chargeVault(u: Unit, vaultId: string): Promise<CaptureResult> {
  if (paypalSimulated()) return { paypalOrderId: fakeId('SIM-ORDER'), captureId: fakeId('SIM-CAPTURE'), status: 'COMPLETED' };
  if (config.useSdk) return sdkChargeVault(u, vaultId);
  let data = await pp('POST', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [unitBreakdown(u)],
    payment_source: { paypal: { vault_id: vaultId } },
  }, `create-${u.orderId}`);
  if (data.status !== 'COMPLETED') data = await pp('POST', `/v2/checkout/orders/${data.id}/capture`, {}, `capture-${u.orderId}`);
  const cap = data.purchase_units?.[0]?.payments?.captures?.[0];
  if (!cap) throw new Error(`PayPal order ${data.id} has no capture (status ${data.status}).`);
  return { paypalOrderId: data.id, captureId: cap.id, status: cap.status };
}

// One-tap approval: normal PayPal checkout, buyer approves on PayPal, then we capture.
export async function createCheckoutOrder(u: Unit): Promise<{ paypalOrderId: string; approveUrl: string }> {
  const returnUrl = `${config.appUrl}/api/paypal/order/return?orderId=${u.orderId}`;
  const cancelUrl = `${config.appUrl}/orders?cancelled=${u.orderId}`;
  if (paypalSimulated()) {
    const id = fakeId('SIM-ORDER');
    return { paypalOrderId: id, approveUrl: `${config.appUrl}/simulated-checkout?kind=order&amount=${u.amount.toFixed(2)}&title=${encodeURIComponent(u.title)}&token=${id}&return=${encodeURIComponent(`${returnUrl}&token=${id}`)}&cancel=${encodeURIComponent(cancelUrl)}` };
  }
  if (config.useSdk) return sdkCreateCheckout(u, returnUrl, cancelUrl);
  const data = await pp('POST', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [unitBreakdown(u)],
    payment_source: { paypal: { experience_context: {
      brand_name: 'Bazaar AI', user_action: 'PAY_NOW', shipping_preference: 'NO_SHIPPING', return_url: returnUrl, cancel_url: cancelUrl,
    } } },
  }, `checkout-${u.orderId}`);
  const approveUrl = link(data, 'payer-action', 'approve');
  if (!approveUrl) throw new Error('PayPal did not return an approval link for the order.');
  return { paypalOrderId: data.id, approveUrl };
}

export async function captureOrder(paypalOrderId: string, orderId: string): Promise<CaptureResult> {
  if (paypalSimulated()) return { paypalOrderId, captureId: fakeId('SIM-CAPTURE'), status: 'COMPLETED' };
  if (config.useSdk) return sdkCapture(paypalOrderId, orderId);
  const data = await pp('POST', `/v2/checkout/orders/${paypalOrderId}/capture`, {}, `capture-${orderId}`);
  const cap = data.purchase_units?.[0]?.payments?.captures?.[0];
  if (!cap) throw new Error(`Capture failed for PayPal order ${paypalOrderId}.`);
  return { paypalOrderId, captureId: cap.id, status: cap.status };
}

// ---------- Refunds (undo) ----------
export async function refundCapture(captureId: string, orderId: string): Promise<{ refundId: string; status: string }> {
  if (paypalSimulated()) return { refundId: fakeId('SIM-REFUND'), status: 'COMPLETED' };
  if (config.useSdk) return sdkRefund(captureId, orderId);
  const data = await pp('POST', `/v2/payments/captures/${captureId}/refund`, { note_to_payer: 'Bazaar AI undo: full refund' }, `refund-${orderId}`);
  return { refundId: data.id, status: data.status };
}

// ---------- Payouts to sellers ----------
export async function sendPayouts(batchId: string, items: { orderId: string; email: string; amount: number; note: string }[]) {
  if (paypalSimulated()) {
    return { batchId: fakeId('SIM-PAYOUT'), status: 'SUCCESS', items: items.map((i) => ({ orderId: i.orderId, itemId: fakeId('SIM-ITEM') })) };
  }
  const data = await pp('POST', '/v1/payments/payouts', {
    sender_batch_header: { sender_batch_id: batchId, email_subject: 'You have a payout from Bazaar AI', email_message: 'Payment for your sold items, minus the platform fee.' },
    items: items.map((i) => ({
      recipient_type: 'EMAIL', receiver: i.email, sender_item_id: i.orderId, note: i.note,
      amount: { value: i.amount.toFixed(2), currency: 'USD' },
    })),
  }, batchId);
  return { batchId: data.batch_header.payout_batch_id as string, status: data.batch_header.batch_status as string, items: [] as { orderId: string; itemId: string }[] };
}

// ---------- Optional: send tracking info to PayPal ----------
export async function addTracking(paypalOrderId: string, captureId: string, trackingNumber: string) {
  if (paypalSimulated()) return;
  await pp('POST', `/v2/checkout/orders/${paypalOrderId}/track`, {
    capture_id: captureId, tracking_number: trackingNumber, carrier: 'OTHER', carrier_name_other: 'Bazaar Express', notify_payer: false,
  });
}

// ---------- Webhooks ----------
export async function verifyWebhook(headers: Headers, event: unknown): Promise<boolean> {
  if (paypalSimulated() || !config.paypalWebhookId) return false;
  const data = await pp('POST', '/v1/notifications/verify-webhook-signature', {
    auth_algo: headers.get('paypal-auth-algo'),
    cert_url: headers.get('paypal-cert-url'),
    transmission_id: headers.get('paypal-transmission-id'),
    transmission_sig: headers.get('paypal-transmission-sig'),
    transmission_time: headers.get('paypal-transmission-time'),
    webhook_id: config.paypalWebhookId,
    webhook_event: event,
  });
  return data.verification_status === 'SUCCESS';
}
