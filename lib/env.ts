// All settings in one place, read from environment variables.
// Everything here runs on free tiers: Groq free API, PayPal sandbox, PGlite/Supabase free.
const e = process.env;

export const config = {
  groqKeys: [e.GROQ_API_KEY, e.GROQ_API_KEY_2].filter((k): k is string => !!k),
  // Main model, then a smaller free model if the main one hits the free rate limit.
  groqModels: [e.GROQ_MODEL || 'openai/gpt-oss-120b', e.GROQ_FALLBACK_MODEL || 'openai/gpt-oss-20b'],

  paypalClientId: e.PAYPAL_CLIENT_ID || '',
  paypalSecret: e.PAYPAL_CLIENT_SECRET || '',
  paypalBase: e.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com',
  paypalWebhookId: e.PAYPAL_WEBHOOK_ID || '',

  sellerEmails: (e.SELLER_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean),
  databaseUrl: e.DATABASE_URL || '',
  get sessionSecret(): string {
    const s = e.SESSION_SECRET;
    if (s && s.length >= 16) return s;
    if (e.NODE_ENV === 'production') throw new Error('SESSION_SECRET must be set (16+ characters) in production.');
    return 'dev-only-secret-change-me';
  },
  // Saving PayPal for auto-buy needs PayPal Vault enabled on the sandbox app. Off by default.
  vaultEnabled: e.VAULT_ENABLED === 'true',
  platformFeeRate: Number(e.PLATFORM_FEE_RATE || '0.10'),
  undoMinutes: Number(e.UNDO_WINDOW_MINUTES || '10'),
  // Used for PayPal return links. On Vercel it falls back to the project URL if not set.
  appUrl: (e.NEXT_PUBLIC_APP_URL
    || (e.VERCEL_PROJECT_PRODUCTION_URL ? `https://${e.VERCEL_PROJECT_PRODUCTION_URL}` : '')
    || (e.VERCEL_URL ? `https://${e.VERCEL_URL}` : '')
    || 'http://localhost:3000').replace(/\/$/, ''),
  // Who can open the Admin page and release payouts. The demo account is admin so judges can see it.
  adminEmails: (e.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),

  // Free-tier protection: messages per user per minute, and login attempts per IP per 10 minutes.
  chatPerMinute: Number(e.CHAT_PER_MINUTE || '12'),
  loginAttempts: Number(e.LOGIN_ATTEMPTS || '10'),

  demoEmail: 'demo@bazaar.test',
  demoPassword: 'bazaar-demo-2026',
};

// Simulated PayPal mode: used when no sandbox credentials are configured,
// so the whole app can be tried locally. Real sandbox calls are used otherwise.
export const paypalSimulated = () => !config.paypalClientId || !config.paypalSecret;
