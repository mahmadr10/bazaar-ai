import { handler, requireUser } from '@/lib/auth';
import { adminStats, releasePayouts } from '@/lib/orders';

export const GET = handler(async () => {
  await requireUser();
  await releasePayouts(false).catch(() => null); // release anything past the undo window on page load
  return Response.json(await adminStats());
});
