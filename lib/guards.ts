// Small in-memory guards: a rate limiter and a per-user lock.
// They run per server instance, which is enough for a demo and for local use.

const hits = new Map<string, number[]>();

// Returns true if the action is allowed. Sliding window.
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) { hits.set(key, list); return false; }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) hits.clear(); // keep memory small
  return true;
}

// Runs one money action per user at a time, so two quick requests cannot
// both pass the monthly cap check and then both get charged.
const locks = new Map<string, Promise<unknown>>();

export async function withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(userId) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  const chained = prev.then(() => mine);
  locks.set(userId, chained);
  await prev.catch(() => {});
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(userId) === chained) locks.delete(userId);
  }
}

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local';
}
