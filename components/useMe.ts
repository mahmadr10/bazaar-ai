'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Limits } from '@/lib/contracts';

export type Me = { user: { id: string; email: string; name: string | null } | null; limits?: Limits; undoMinutes?: number; demo?: { email: string; password: string } };

// Small shared store so the nav and pages see the same limits after a purchase.
let current: Me | null = null;
const listeners = new Set<(m: Me) => void>();

export async function refreshMe(): Promise<Me> {
  const res = await fetch('/api/me', { cache: 'no-store' });
  current = await res.json();
  listeners.forEach((l) => l(current!));
  return current!;
}

export function useMe(requireLogin = false) {
  const [me, setMe] = useState<Me | null>(current);
  useEffect(() => {
    listeners.add(setMe);
    refreshMe().then((m) => {
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
