import { handler, requireUser } from '@/lib/auth';
import { query, logEvent } from '@/lib/db';

export const POST = handler(async () => {
  const user = await requireUser();
  await query('update mandates set paypal_vault_id = null, paypal_customer_id = null, paypal_email = null where user_id = $1', [user.id]);
  await logEvent('PAYPAL_UNLINKED', 'app', null, { userId: user.id });
  return Response.json({ ok: true });
});
