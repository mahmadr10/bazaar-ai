import { handler, getUser } from '@/lib/auth';
import { getMyLimits } from '@/lib/orders';
import { config } from '@/lib/env';

export const GET = handler(async () => {
  const user = await getUser();
  if (!user) return Response.json({ user: null, demo: { email: config.demoEmail, password: config.demoPassword } });
  return Response.json({ user, limits: await getMyLimits(user.id), undoMinutes: config.undoMinutes });
});
