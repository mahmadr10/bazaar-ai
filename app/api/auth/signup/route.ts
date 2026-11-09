import { handler, createSession, HttpError } from '@/lib/auth';
import { hashPassword } from '@/lib/auth-crypto';
import { one, query } from '@/lib/db';

export const POST = handler(async (req: Request) => {
  const { email, password, name } = await req.json();
  const e = String(email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new HttpError(400, 'Please enter a valid email.');
  if (String(password ?? '').length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
  if (await one('select 1 from users where email = $1', [e])) throw new HttpError(409, 'An account with this email already exists.');
  const u = await one<{ id: string; email: string }>(
    'insert into users (email, password_hash, name) values ($1, $2, $3) returning id, email', [e, hashPassword(password), name || null]);
  await query('insert into mandates (user_id) values ($1) on conflict do nothing', [u!.id]);
  await createSession(u!);
  return Response.json({ ok: true });
});
