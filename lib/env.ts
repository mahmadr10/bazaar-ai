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
  sessionSecret: e.SESSION_SECRET || 'dev-only-secret-change-me',
  platformFeeRate: Number(e.PLATFORM_FEE_RATE || '0.10'),
  undoMinutes: Number(e.UNDO_WINDOW_MINUTES || '10'),
  appUrl: (e.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, ''),

  demoEmail: 'demo@bazaar.test',
  demoPassword: 'bazaar-demo-2026',
};

// Simulated PayPal mode: used when no sandbox credentials are configured,
// so the whole app can be tried locally. Real sandbox calls are used otherwise.
export const paypalSimulated = () => !config.paypalClientId || !config.paypalSecret;
