import { getUser } from '@/lib/auth';
import { createVaultPaymentToken } from '@/lib/paypal';
import { one, query, logEvent } from '@/lib/db';
import { config } from '@/lib/env';

// Step 2: PayPal sends the user back here. Exchange the approved setup token for a saved payment token.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const setupToken = url.searchParams.get('approval_token_id') || url.searchParams.get('token') || '';
  const back = (q: string) => Response.redirect(`${config.appUrl}/settings?${q}`, 303);
  try {
    const user = await getUser();
    if (!user) return Response.redirect(`${config.appUrl}/login`, 303);
    const m = await one<{ pending_setup_token: string | null }>('select pending_setup_token from mandates where user_id = $1', [user.id]);
    if (!setupToken || m?.pending_setup_token !== setupToken) {
      return back('paypal=error&msg=' + encodeURIComponent('Setup token did not match. Please try linking again.'));
    }
    const t = await createVaultPaymentToken(setupToken);
    await query(
      `update mandates set paypal_vault_id = $2, paypal_customer_id = $3, paypal_email = $4, pending_setup_token = null, updated_at = now() where user_id = $1`,
      [user.id, t.vaultId, t.customerId, t.email]);
    await logEvent('PAYPAL_LINKED', 'paypal', null, { userId: user.id, customerId: t.customerId });
    return back('paypal=linked');
  } catch (err: any) {
    return back('paypal=error&msg=' + encodeURIComponent(err.message));
  }
}
