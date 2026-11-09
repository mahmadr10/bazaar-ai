import { completeCheckout } from '@/lib/orders';
import { config } from '@/lib/env';

// Buyer approved the checkout on PayPal. Capture it, then show the order.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const orderId = url.searchParams.get('orderId') || '';
  const paypalOrderId = url.searchParams.get('token') || '';
  try {
    await completeCheckout(orderId, paypalOrderId);
    return Response.redirect(`${config.appUrl}/orders?paid=${orderId}`, 303);
  } catch (err: any) {
    return Response.redirect(`${config.appUrl}/orders?error=${encodeURIComponent(err.message)}`, 303);
  }
}
