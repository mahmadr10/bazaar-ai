import { handler, requireUser, HttpError } from '@/lib/auth';
import { createVaultSetupToken } from '@/lib/paypal';
import { query, logEvent } from '@/lib/db';

// Step 1 of saving PayPal: create a setup token and send the user to PayPal to approve it.
export const POST = handler(async () => {
  const user = await requireUser();
  let t;
  try {
    t = await createVaultSetupToken();
  } catch (err: any) {
    // PayPal answers 403 when Vault (saved payment methods) is not enabled on the sandbox app.
    if (/\(403\)|NOT_AUTHORIZED/i.test(err.message)) {
      throw new HttpError(
        503,
        'Saving PayPal for auto-buy (PayPal Vault) is not enabled on this sandbox app yet. You can still shop: every order uses the Approve button and pays through PayPal checkout.',
      );
    }
    throw err;
  }
  await query(
    `insert into mandates (user_id, pending_setup_token) values ($1, $2)
     on conflict (user_id) do update set pending_setup_token = $2, updated_at = now()`, [user.id, t.id]);
  await logEvent('VAULT_SETUP_STARTED', 'app', null, { userId: user.id, setupToken: t.id });
  return Response.json({ approvalUrl: t.approveUrl });
});
