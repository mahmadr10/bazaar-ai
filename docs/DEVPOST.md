# Devpost submission text (copy and paste)

## Project name
Bazaar AI

## Tagline
An AI shopping agent that finds the best product within your budget and pays for it safely with PayPal.

## Inspiration
Shopping online still means scrolling, comparing and filling forms, and most apps assume you speak English. We wanted an agent you can simply tell "Under $10 mein best mascara le do" and trust with your money.

## What it does
You tell Bazaar AI what you want and your budget, in English, Urdu or Roman Urdu. The agent searches the store, reads reviews, and picks the best value. The server checks the price and your spending limits (per-order limit, monthly cap), then shows an Approve button and the buyer pays through PayPal checkout. A saved-PayPal auto-buy mode (PayPal Vault) is built and switches on when Vault is enabled on the sandbox app. Every purchase comes with a receipt and a 10-minute undo with a full refund. The platform keeps a commission and pays sellers the rest with PayPal Payouts after the undo window.

## How we built it
- Next.js 16 (App Router) for the frontend and API routes.
- One LLM agent (Groq, gpt-oss-120b) with 7 tools: search_products, get_product, check_purchase_rules, place_order, cancel_order, get_my_orders, get_my_limits.
- A deterministic rules engine in plain TypeScript decides AUTO_BUY or NEEDS_APPROVAL, with unit tests for every branch.
- PayPal REST APIs in the sandbox: OAuth, Vault v3 (setup tokens and payment tokens), Orders v2 (vaulted charge and checkout with capture), Refunds, Payouts, order tracking, and webhooks with signature verification.
- PostgreSQL (Supabase, or embedded PGlite for local development) seeded with 194 products and reviews from DummyJSON.

## APIMatic Context Plugin
We installed the APIMatic Context Plugin for PayPal and followed its TypeScript skills to integrate the PayPal Server SDK (`@paypal/paypal-server-sdk`, pinned to 2.5.0) for Orders (create and capture) and Payments (refunds for the 10-minute Undo). It sits behind a switch next to our direct REST client, and the Admin event log shows `paypal-sdk` when it runs. Payouts, webhook verification and Vault stay on REST because the SDK does not cover them. The skill files were used as reference by our AI coding assistant, and the app does not call the plugin at runtime.

## Challenges we ran into
- Making "the agent buys without asking" safe. We solved it with a one-time mandate and a rules engine that re-reads prices from the database on every order. The AI never decides payment.
- Stopping the AI from inventing a budget to trigger auto-buy: the server only accepts budget numbers the user actually typed.
- Keeping replies in the user's script (Urdu script vs Roman Urdu): the server detects the script and tells the model.
- Staying within free tiers: compact prompts, and automatic fallback across keys and models.

## Accomplishments that we're proud of
A full marketplace money flow in the sandbox: save PayPal once, agent auto-buy, undo with refund, commission, and seller payouts, all visible on an admin page with a verified webhook log.

## What we learned
Agentic commerce needs guardrails in code, not in prompts. PayPal's Vault, Orders, Refunds and Payouts APIs fit together well for a marketplace.

## What's next for Bazaar AI
Real local sellers and catalogs, voice input in Urdu, price drop watching ("buy when under $8"), and PayPal Agent Toolkit integration.

## Built with
nextjs, typescript, react, paypal, apimatic, paypal-server-sdk, paypal-vault, paypal-orders, paypal-payouts, groq, llm, postgresql, supabase, pglite, vercel

## Team roles
- **AI Agent and Experience Lead:** built the multilingual shopping agent, product search and ranking, prompt guardrails, and the chat UI with product, receipt, approval and undo cards. Produced the demo video.
- **Payments and Platform Lead:** built the PayPal sandbox integration end to end (Vault, orders, capture, refunds, commission, payouts, webhooks), the database, the rules engine, and the orders and admin dashboards.

## Prize categories to tick
Best Use of Agentic Commerce, Best Use of PayPal + AI (plus the grand prizes, Most Impactful and Best Demo Delivery).
