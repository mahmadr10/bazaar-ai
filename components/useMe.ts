'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Limits } from '@/lib/contracts';

export type Me = {
  user: { id: string; email: string; name: string | null } | null; isAdmin?: boolean;
  limits?: Limits; undoMinutes?: number; demo?: { email: string; password: string };
};

// Small shared store so the nav and pages see the same limits after a purchase.
// Many components call useMe at once; they share one request instead of each fetching.
let current: Me | null = null;
let inflight: Promise<Me> | null = null;
let fetchedAt = 0;
const listeners = new Set<(m: Me) => void>();

export function refreshMe(force = true): Promise<Me> {
  if (inflight) return inflight;
  if (!force && current && Date.now() - fetchedAt < 2000) return Promise.resolve(current);
  inflight = fetch('/api/me', { cache: 'no-store' })
    .then((r) => r.json())
    .then((m: Me) => {
      current = m; fetchedAt = Date.now();
      listeners.forEach((l) => l(m));
      return m;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

export function useMe(requireLogin = false) {
  const [me, setMe] = useState<Me | null>(current);
  useEffect(() => {
    listeners.add(setMe);
    refreshMe(false).then((m) => {
      setMe(m);
      if (requireLogin && !m.user) window.location.href = '/login';
    });
    return () => { listeners.delete(setMe); };
  }, [requireLogin]);
  const reload = useCallback(() => refreshMe(), []);
  return { me, reload };
}

export async function api<T = any>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { window.location.href = '/login'; throw new Error('Please log in.'); }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export const usd = (n: number) => `$${(n ?? 0).toFixed(2)}`;
