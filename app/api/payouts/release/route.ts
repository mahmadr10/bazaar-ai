import { handler, requireUser } from '@/lib/auth';
import { releasePayouts } from '@/lib/orders';

// Pays sellers (PayPal Payouts) for orders past the undo window.
export const POST = handler(async (req: Request) => {
  await requireUser();
  const body = await req.json().catch(() => ({}));
  return Response.json(await releasePayouts(!!body.includeOpen));
});
