import { handler, clearSession } from '@/lib/auth';

export const POST = handler(async () => {
  await clearSession();
  return Response.json({ ok: true });
});
