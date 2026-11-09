import { handler, requireUser } from '@/lib/auth';
import { getMyOrders } from '@/lib/orders';

export const GET = handler(async () => Response.json(await getMyOrders((await requireUser()).id)));
