import { handler, requireUser } from '@/lib/auth';
import { cancelOrder } from '@/lib/orders';

// Undo: refund within the undo window, or cancel an order that is waiting for approval.
export const POST = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return Response.json(await cancelOrder(user.id, id));
});
