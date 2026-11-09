# Bazaar AI

An AI shopping agent that finds the best product within your budget and pays for it safely with PayPal.

Built for the **PayPal AI Hackathon 2026** (Devpost). Tell the agent what you want in English, Urdu or Roman Urdu ("Under $10 mein best mascara le do"). It searches the store, reads the reviews, picks the best value, and pays with your saved PayPal, but only inside the spending limits you set. A plain-code rules engine, not the AI, makes the payment decision.

## What it does

- **Multilingual shopping agent.** One LLM (Groq, free tier) with 7 tools. It replies in the same language and script as the user.
- **Save PayPal once (Vault v3).** The user links PayPal one time and sets a mandate: a per-order limit, a monthly cap, and auto-buy on or off.
- **Rules engine decides money.** Auto-buy happens only if the price fits the request budget, the budget is within the per-order limit, the monthly cap is not crossed, auto-buy is on and PayPal is linked. Anything else gets a one-tap **Approve** button.
- **Receipts with a 10-minute undo.** Each auto-purchase can be undone with a full PayPal refund.
- **Marketplace money flow.** The platform keeps a 10% commission, and sellers are paid the rest with **PayPal Payouts** after the undo window closes.
- **Webhooks and audit log.** PayPal webhook signatures are verified, order status is updated, and every event is logged on the Admin page.

## Safety design (why you can trust an agent with your money)

1. **Prices only come from the database.** `place_order` re-reads the price and re-runs the rules on the server. It never trusts a price or a decision from the LLM.
2. **The AI cannot buy unless you asked.** The server checks the user's latest message for buy intent (English, Roman Urdu or Urdu, e.g. "buy", "le lo", "خرید دیں", or "yes/haan" to an offer). Without it, `place_order` is refused, even if the AI tries.
3. **The AI cannot invent a budget.** The server only accepts a budget number that the user actually typed in their last messages.
4. **One order per message, one money action per user at a time.** A per-user lock stops two quick requests from both passing the monthly cap.
5. **The user id comes from the signed session cookie**, never from the AI or the request body.
6. **Idempotency.** Every PayPal create, capture, refund and payout call sends a `PayPal-Request-Id`. Orders are claimed with atomic status updates, so double clicks cannot double charge or double pay.
7. **Undo window before payout.** Sellers are paid only after the refund window closes. Stock goes down on purchase and back up on refund.
8. **Admin only.** The money dashboard and seller payouts are limited to `ADMIN_EMAILS` (and the demo account, so judges can see it).
9. **Free-tier protection.** Chat and login are rate limited, and every Groq and PayPal call has a timeout.
10. **Transparent.** Each reply has a "How I did this" list showing the search, the reviews read and the rules engine decision.
11. **Unit tested:** 22 tests covering every rules engine branch plus the language, budget and buy-intent guards (`npm test`).

## PayPal APIs used

| API | Where | Purpose |
|---|---|---|
| OAuth 2.0 client credentials | `lib/paypal.ts` | Access token, cached until expiry |
| Vault v3 setup tokens and payment tokens | `/api/paypal/vault/setup`, `/api/paypal/vault/return` | Save the buyer's PayPal once |
| Orders v2 with `vault_id` | `lib/orders.ts` `placeOrder` | Agent auto-buy with no redirect |
| Orders v2 checkout plus capture | `/api/orders/approve`, `/api/paypal/order/return` | One-tap approval for over-limit orders |
| Payments v2 refunds | `/api/orders/[id]/cancel` | Undo with a full refund |
| Payouts v1 | `/api/payouts/release` | Pay sellers their share minus commission |
| Order tracking | `lib/paypal.ts` `addTracking` | Send the tracking number to PayPal |
| Webhooks plus signature verification | `/api/paypal/webhook` | Capture, refund and payout events |

## Architecture

```
[ Chat / Settings / Orders / Admin pages ]   Next.js 16 (App Router)
                 |
                 v
 POST /api/chat  ->  Shopping agent: ONE LLM (Groq gpt-oss-120b) with tools
     search_products  get_product  check_purchase_rules  place_order
     cancel_order     get_my_orders  get_my_limits
                 |
                 v
 lib/catalog.ts (search + ranking)    lib/rules-core.ts (rules engine, pure code)
 lib/orders.ts (money flow)           lib/paypal.ts (PayPal REST client)
                 |
                 v
 PostgreSQL: embedded PGlite locally, or Supabase via DATABASE_URL
 tables: users, sellers, products, reviews, mandates, orders, events
```

Ranking is deterministic and explainable: `score = 0.5*(rating/5) + 0.3*(avgReview/5) + 0.2*(1 - price/budget)`, applied to the most relevant search results.

## Run it locally (about 3 minutes, everything free)

Requirements: Node.js 20 or newer.

```bash
git clone <this repo>
cd bazaar-ai
npm install
cp .env.example .env.local
```

Open `.env.local` and set at least `GROQ_API_KEY` (free at https://console.groq.com) and `SESSION_SECRET` (any long random string). Then:

```bash
npm run dev
```

Open http://localhost:3000 and click **Use demo account**. On first start the app creates the database and loads 194 products with reviews from `data/catalog.json`.

**No PayPal keys?** The app runs in **simulated PayPal mode**: the full flow works, IDs start with `SIM-`, and a yellow badge shows the mode. Add sandbox keys to switch to real PayPal sandbox calls.

### Connect the real PayPal sandbox (free)

1. Log in at https://developer.paypal.com and switch to **Sandbox**.
2. Under **Apps and Credentials**, create a REST app. Copy the Client ID and Secret into `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`.
3. In the app's features, make sure **Vault** (save payment methods) and **Payouts** are enabled.
4. Under **Sandbox accounts**, use the default Personal (buyer) account to log in during checkout. Create 3 more Personal accounts to act as sellers and put their emails in `SELLER_EMAILS` (comma separated) **before the first start**, or delete the `.data` folder to re-seed.
5. Webhooks: add a webhook to `https://<your-public-url>/api/paypal/webhook` for `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.PAYOUTS-ITEM.SUCCEEDED` and `PAYMENT.PAYOUTS-ITEM.FAILED`. Put its id in `PAYPAL_WEBHOOK_ID`. Webhooks need a public URL (Vercel, or a free tunnel for local testing).

### Deploy for free (Vercel Hobby plus Supabase free)

1. Create a free Supabase project. Copy the **connection string** (Session pooler) into `DATABASE_URL`. The tables are created automatically on first request (schema in `db/schema.sql`).
2. Import the repo in Vercel, add the same environment variables, and set `NEXT_PUBLIC_APP_URL` to your Vercel URL.
3. Without `DATABASE_URL`, Vercel uses an embedded database in `/tmp` that resets on cold starts. That works for a quick demo, but use Supabase for judging.

## Test accounts (for judges)

| What | Value |
|---|---|
| App demo login | `demo@bazaar.test` / `bazaar-demo-2026` (or click **Use demo account**) |
| PayPal sandbox buyer | Add your sandbox Personal account email here before submitting |

All payments are PayPal **sandbox** (test money). Never use real credentials.

## Try these prompts

| Prompt | What happens |
|---|---|
| `Under $10 mein best mascara le do` | Roman Urdu reply, auto-buy $9.99, receipt with an undo timer |
| `مجھے 10 ڈالر سے کم میں نیل پالش خرید دیں` | Urdu script reply, auto-buy $8.99 |
| `Under $30 achhi shirt chahiye, le lo` | Over the $20 limit, so it shows an Approve button instead of buying |
| `Find me a lipstick under $15`, then `haan, le lo` | First shows options only and asks. The yes reply then places the order |
| `Meri limit kya hai?` | Shows limits and spend this month |
| `undo karo` | Refunds the latest order inside the window |

## Project structure

```
app/
  page.tsx                 chat UI (product, receipt, approval and undo cards)
  settings/ orders/ admin/ login/ simulated-checkout/
  api/chat                 the agent
  api/paypal/...           vault setup and return, order return, webhook
  api/orders/...           list, approve, cancel (undo)
  api/payouts/release      seller payouts
lib/
  agent.ts                 LLM tool loop with server-side guards and a step trace
  text.ts                  language, budget and buy-intent detection, search terms (pure, unit tested)
  guards.ts                rate limiter and per-user lock
  catalog.ts               search and ranking
  rules-core.ts            rules engine (pure, unit tested)
  orders.ts                place, approve, refund, payouts, admin stats, webhooks
  paypal.ts                PayPal REST client (real sandbox or simulated)
  db.ts                    Postgres (PGlite or Supabase), auto schema and seed
db/schema.sql              database schema
data/catalog.json          194 products from DummyJSON (npm run seed refreshes it)
tests/                     rules engine and text guard tests
```

## Tech and cost

Everything runs on free tiers: Groq free API (with automatic fallback to a second key and a smaller model when rate limited), PayPal sandbox, PGlite or Supabase free, and Vercel Hobby.

## License

MIT, see [LICENSE](LICENSE).
