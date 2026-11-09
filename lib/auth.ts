// Session helpers for route handlers. The user id always comes from the
// signed cookie on the server, never from the browser body or from the AI.
import { cookies } from 'next/headers';
import { config } from './env';
import { signToken, verifyToken } from './auth-crypto';
import { one } from './db';

const COOKIE = 'bazaar_session';

export type SessionUser = { id: string; email: string; name: string | null };

export async function createSession(user: { id: string; email: string }) {
  const token = signToken({ uid: user.id, email: user.email, exp: Date.now() + 7 * 864e5 }, config.sessionSecret);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/', secure: config.appUrl.startsWith('https'), maxAge: 7 * 86400,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

export async function getUser(): Promise<SessionUser | null> {
  const data = verifyToken<{ uid: string }>((await cookies()).get(COOKIE)?.value, config.sessionSecret);
  if (!data) return null;
  return one<SessionUser>('select id, email, name from users where id = $1', [data.uid]);
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getUser();
  if (!u) throw new HttpError(401, 'Please log in first.');
  return u;
}

// Wraps a route handler so errors become clean JSON responses.
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err: any) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      return Response.json({ error: err?.message || 'Something went wrong' }, { status });
    }
  };
}
