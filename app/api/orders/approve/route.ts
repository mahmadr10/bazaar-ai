import { handler, requireUser, HttpError } from '@/lib/auth';
import { approveOrder } from '@/lib/orders';

// One-tap approval for orders the rules engine did not auto-buy.
export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const { orderId } = await req.json();
  if (!orderId) throw new HttpError(400, 'orderId is required.');
  return Response.json(await approveOrder(user.id, String(orderId)));
});
