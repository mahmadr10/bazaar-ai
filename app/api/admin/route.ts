import { handler, requireAdmin } from '@/lib/auth';
import { adminStats, releasePayouts } from '@/lib/orders';

export const GET = handler(async () => {
  await requireAdmin();
  await releasePayouts(false).catch(() => null); // release anything past the undo window on page load
  return Response.json(await adminStats());
});
