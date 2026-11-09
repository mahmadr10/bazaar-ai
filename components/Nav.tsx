'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMe, usd } from './useMe';

const LINKS = [
  { href: '/', label: 'Chat' },
  { href: '/settings', label: 'Settings' },
  { href: '/orders', label: 'Orders' },
  { href: '/admin', label: 'Admin' },
];

export default function Nav() {
  const path = usePathname();
  const { me } = useMe();
  if (path === '/simulated-checkout') return null;

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <header className="nav">
      <div className="nav-inner">
        <Link href="/" className="brand"><span className="brand-mark">B</span>Bazaar AI</Link>
        {me?.user && (
          <nav className="nav-links">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={path === l.href ? 'active' : ''}>{l.label}</Link>
            ))}
          </nav>
        )}
        <div className="nav-right">
          {me?.limits?.simulated && <span className="badge b-sim" title="No PayPal sandbox keys configured, payments are simulated">PayPal simulated</span>}
          {me?.limits && !me.limits.simulated && <span className="badge b-linked">PayPal sandbox</span>}
          {me?.user && <span className="who">{me.user.email}</span>}
          {me?.user && <button className="btn btn-sm" onClick={logout}>Log out</button>}
        </div>
      </div>
    </header>
  );
}

export function LimitsPills() {
  const { me } = useMe();
  const l = me?.limits;
  if (!l) return null;
  return (
    <div className="limits-bar">
      <span className="pill">Per order <strong>{usd(l.perOrder)}</strong></span>
      <span className="pill">This month <strong>{usd(l.spentThisMonth)}</strong> of {usd(l.monthly)}</span>
      <span className="pill">Auto-buy <strong>{l.autoBuy ? 'ON' : 'OFF'}</strong></span>
      <span className="pill">PayPal <strong>{l.paypalLinked ? 'linked' : 'not linked'}</strong></span>
      {!l.paypalLinked && <Link href="/settings" className="small">Link PayPal to enable auto-buy</Link>}
    </div>
  );
}
