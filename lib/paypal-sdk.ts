// PayPal Server SDK path (APIMatic-generated, @paypal/paypal-server-sdk 2.5.0).
// Used for Orders (create, capture) and Payments (refunds) when USE_PAYPAL_SDK=true.
// Written with the APIMatic Context Plugin for PayPal as the reference: install the pinned
// package, build one Client with OAuth client credentials, and instantiate controllers yourself.
// Vault, Payouts, order tracking and webhook verification stay on the REST client in paypal.ts.
import { config } from './env';

type Unit = { orderId: string; amount: number; title: string; productId: number };
type Sdk = typeof import('@paypal/paypal-server-sdk');
type Loaded = { mod: Sdk; orders: InstanceType<Sdk['OrdersController']>; payments: InstanceType<Sdk['PaymentsController']> };

let cached: Promise<Loaded> | null = null;

// One shared client. The SDK fetches and refreshes the OAuth token for us.
function load(): Promise<Loaded> {
  if (!cached) {
    cached = import('@paypal/paypal-server-sdk').then((mod) => {
      const client = new mod.Client({
        environment: config.paypalBase.includes('sandbox') ? mod.Environment.Sandbox : mod.Environment.Production,
        timeout: 20_000,
        clientCredentialsAuthCredentials: { oAuthClientId: config.paypalClientId, oAuthClientSecret: config.paypalSecret },
      });
      return { mod, orders: new mod.OrdersController(client), payments: new mod.PaymentsController(client) };
    });
  }
  return cached;
}

// The SDK throws ApiError on non-2xx. Keep the same "(status)" message shape as the REST client.
function fail(op: string, err: any): never {
  if (err && typeof err.statusCode === 'number') {
    const detail = err.result?.details?.[0]?.description || err.result?.message || err.message;
    throw new Error(`PayPal SDK ${op} failed (${err.statusCode}): ${detail}`);
  }
  throw err;
}

function purchaseUnit(mod: Sdk, u: Unit) {
  const money = { currencyCode: 'USD', value: u.amount.toFixed(2) };
  return {
    referenceId: u.orderId,
    customId: u.orderId,
    description: u.title.slice(0, 120),
    amount: { ...money, breakdown: { itemTotal: money } },
    items: [{ name: u.title.slice(0, 120), sku: String(u.productId), quantity: '1', category: mod.ItemCategory.PhysicalGoods, unitAmount: money }],
  };
}

export type SdkCapture = { paypalOrderId: string; captureId: string; status: string };

// Buyer checkout: create the order and return PayPal's approval link.
export async function sdkCreateCheckout(u: Unit, returnUrl: string, cancelUrl: string): Promise<{ paypalOrderId: string; approveUrl: string }> {
  const { mod, orders } = await load();
  try {
    const { result } = await orders.createOrder({
      body: {
        intent: mod.CheckoutPaymentIntent.Capture,
        purchaseUnits: [purchaseUnit(mod, u)],
        paymentSource: {
          paypal: {
            experienceContext: {
              brandName: 'Bazaar AI',
              userAction: mod.PaypalExperienceUserAction.PayNow,
              shippingPreference: mod.PaypalWalletContextShippingPreference.NoShipping,
              returnUrl,
              cancelUrl,
            },
          },
        },
      },
      paypalRequestId: `checkout-${u.orderId}`, // idempotency key: no duplicate orders
      prefer: 'return=representation',
    });
    const approveUrl = result.links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href;
    if (!approveUrl || !result.id) throw new Error('PayPal did not return an approval link for the order.');
    return { paypalOrderId: result.id, approveUrl };
  } catch (err) {
    return fail('createOrder', err);
  }
}

// Capture an approved order.
export async function sdkCapture(paypalOrderId: string, orderId: string): Promise<SdkCapture> {
  const { orders } = await load();
  try {
    const { result } = await orders.captureOrder({
      id: paypalOrderId,
      paypalRequestId: `capture-${orderId}`,
      prefer: 'return=representation',
    });
    const cap = result.purchaseUnits?.[0]?.payments?.captures?.[0];
    if (!cap?.id) throw new Error(`Capture failed for PayPal order ${paypalOrderId}.`);
    return { paypalOrderId, captureId: cap.id, status: String(cap.status) };
  } catch (err) {
    return fail('captureOrder', err);
  }
}

// Saved-PayPal charge (needs Vault). Create with the vault id, then capture if PayPal did not already.
export async function sdkChargeVault(u: Unit, vaultId: string): Promise<SdkCapture> {
  const { mod, orders } = await load();
  try {
    const { result } = await orders.createOrder({
      body: { intent: mod.CheckoutPaymentIntent.Capture, purchaseUnits: [purchaseUnit(mod, u)], paymentSource: { paypal: { vaultId } } },
      paypalRequestId: `create-${u.orderId}`,
      prefer: 'return=representation',
    });
    if (!result.id) throw new Error('PayPal did not return an order id.');
    if (String(result.status) === 'COMPLETED') {
      const cap = result.purchaseUnits?.[0]?.payments?.captures?.[0];
      if (cap?.id) return { paypalOrderId: result.id, captureId: cap.id, status: String(cap.status) };
    }
    return await sdkCapture(result.id, u.orderId);
  } catch (err) {
    return fail('createOrder (vault)', err);
  }
}

// Undo: full refund of a captured payment.
export async function sdkRefund(captureId: string, orderId: string): Promise<{ refundId: string; status: string }> {
  const { payments } = await load();
  try {
    const { result } = await payments.refundCapturedPayment({
      captureId,
      paypalRequestId: `refund-${orderId}`,
      prefer: 'return=representation',
      body: { noteToPayer: 'Bazaar AI undo: full refund' },
    });
    if (!result.id) throw new Error('PayPal did not return a refund id.');
    return { refundId: result.id, status: String(result.status) };
  } catch (err) {
    return fail('refundCapturedPayment', err);
  }
}
