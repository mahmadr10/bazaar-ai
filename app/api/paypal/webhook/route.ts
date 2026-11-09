import { verifyWebhook } from '@/lib/paypal';
import { applyWebhook } from '@/lib/orders';
import { logEvent } from '@/lib/db';

// PayPal sandbox webhooks: verify the signature with PayPal, then update the order and log the event.
export async function POST(req: Request) {
  const event = await req.json().catch(() => null);
  if (!event) return Response.json({ error: 'Bad body' }, { status: 400 });
  let ok = false;
  try { ok = await verifyWebhook(req.headers, event); } catch { ok = false; }
  if (!ok) {
    await logEvent('WEBHOOK_REJECTED', 'paypal-webhook', null, { type: event.event_type, id: event.id });
    return Response.json({ error: 'Signature not verified' }, { status: 400 });
  }
  const orderId = await applyWebhook(event);
  return Response.json({ ok: true, orderId });
}
