import { handler, createSession, HttpError } from '@/lib/auth';
import { verifyPassword } from '@/lib/auth-crypto';
import { one } from '@/lib/db';

export const POST = handler(async (req: Request) => {
  const { email, password } = await req.json();
  const u = await one<{ id: string; email: string; password_hash: string }>(
    'select id, email, password_hash from users where email = $1', [String(email ?? '').trim().toLowerCase()]);
  if (!u || !verifyPassword(String(password ?? ''), u.password_hash)) throw new HttpError(401, 'Wrong email or password.');
  await createSession(u);
  return Response.json({ ok: true });
});
