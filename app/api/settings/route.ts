import { handler, requireUser } from '@/lib/auth';
import { getMyLimits, updateLimits } from '@/lib/orders';

export const GET = handler(async () => Response.json(await getMyLimits((await requireUser()).id)));

export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const b = await req.json();
  return Response.json(await updateLimits(user.id, { perOrder: Number(b.perOrder), monthly: Number(b.monthly), autoBuy: !!b.autoBuy }));
});
