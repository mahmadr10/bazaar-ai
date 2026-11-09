// The shopping agent: ONE LLM (Groq, free tier) with tools.
// The LLM understands the request and explains choices. Code decides money:
// prices come from the database, and the rules engine decides auto-buy vs approval.
import { config } from './env';
import { searchProducts, getProduct, CATEGORIES } from './catalog';
import { checkPurchaseRules, placeOrder, cancelOrder, getMyOrders, getMyLimits } from './orders';
import type { ChatCard, ChatResponse, ProductCard, Receipt } from './contracts';

const SYSTEM = `You are Bazaar AI, a shopping agent for our online store. Prices are in USD.
Language: reply in the SAME language and script as the user's latest message. English -> English. Urdu script (اردو) -> Urdu script. Roman Urdu (Urdu in Latin letters, e.g. "mujhe sasta perfume chahiye") -> Roman Urdu, not Hindi.
Style: 2-4 short sentences. Plain text, no markdown tables, no headings. Product cards and receipts are shown by the app under your message, so do not list every product.
Rules:
- ALWAYS call search_products before talking about products. Use English keywords. Never invent products, prices, ratings, stock or order ids. Only use tool results.
- Budget: "$10 se kam", "under 10", "10 dollar tak" means maxPrice 10.
- Call get_product on the top result to read reviews, then say in one line why it is the best pick (rating, reviews, value).
- If the user wants to buy (e.g. "buy", "get me", "order", "le do", "le lo", "khareed do", "kharid do", "mangwa do", "order kar do", "خرید دیں", "خرید دو", "خرید لو", "لے دو", "منگوا دو") call place_order right away, do not ask again with the best product, requestBudget (the number the user said, or null) and a one-line reason. The server decides AUTO_BUY or NEEDS_APPROVAL. Report its result honestly: if status is PAID say it is bought and can be undone for ${config.undoMinutes} minutes; if AWAITING_APPROVAL explain ruleMessage and tell them to tap Approve; if REJECTED explain why.
- If the user only asks to find or compare, do NOT call place_order. Offer to buy.
- If nothing matches under the budget, say so and mention the closest option returned.
- Undo/cancel/wapas -> cancel_order. Limits ("meri limit kya hai") -> get_my_limits. Orders -> get_my_orders.
- Non-shopping questions: one polite sentence redirecting to shopping, no tools.
- Never ask for card numbers or passwords. Payment is only through the user's linked PayPal.`;

const tools = [
  fn('search_products', 'Search the store catalog. Returns products ranked by value (rating, reviews, price vs budget).', {
    keywords: { type: 'string', description: 'English product keywords, e.g. "lipstick", "running shoes"' },
    category: { type: 'string', enum: CATEGORIES, description: 'Optional category filter' },
    maxPrice: { type: 'number', description: 'Budget in USD, if the user gave one' },
    minRating: { type: 'number', description: 'Optional minimum rating 0-5' },
  }, ['keywords']),
  fn('get_product', 'Get product details and customer reviews.', { id: { type: 'integer' } }, ['id']),
  fn('check_purchase_rules', 'Check whether the server would auto-buy or ask for approval. Does not buy.', {
    productId: { type: 'integer' }, requestBudget: { type: ['number', 'null'] },
  }, ['productId']),
  fn('place_order', 'Buy a product for the user with their linked PayPal. The server enforces limits and may require approval.', {
    productId: { type: 'integer' }, requestBudget: { type: ['number', 'null'], description: 'Budget the user said, or null' },
    reason: { type: 'string', description: 'One line: why this product is the best pick' },
  }, ['productId', 'reason']),
  fn('cancel_order', 'Undo the latest order (refund if paid within the undo window), or a specific order id.', {
    orderId: { type: ['string', 'null'] },
  }, []),
  fn('get_my_orders', 'List the user\'s recent orders.', {}, []),
  fn('get_my_limits', 'Get the user\'s spending limits, spend this month, auto-buy status and PayPal link status.', {}, []),
];

function fn(name: string, description: string, properties: Record<string, unknown>, required: string[]) {
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } };
}

type Msg = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: any[]; tool_call_id?: string };

async function groq(messages: Msg[]): Promise<{ message: any; model: string }> {
  if (!config.groqKeys.length) throw new Error('GROQ_API_KEY is not set.');
  let lastErr = '';
  // Free-tier friendly: try each key with the main model, then each key with the smaller model.
  for (const model of config.groqModels) {
    for (const key of config.groqKeys) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages, tools, tool_choice: 'auto', temperature: 0.3, max_completion_tokens: 900, reasoning_effort: 'low' }),
        });
        if (res.ok) return { message: (await res.json()).choices[0].message, model };
        const body = await res.text();
        lastErr = `${res.status} ${body.slice(0, 200)}`;
        if (res.status === 400 && body.includes('tool_use_failed')) continue; // malformed tool call: retry once
        break; // 429 rate limit, 401, 5xx: move to next key/model
      }
    }
  }
  throw new Error(`The AI service is busy (free tier limit). Please try again in a minute. (${lastErr})`);
}

// Only trust a budget that the user actually typed. Stops the AI from inventing a budget to trigger auto-buy.
function budgetsInText(text: string): number[] {
  const nums = (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter((n) => n > 0 && n < 1e6);
  return nums;
}

// Detect the script of the user's latest message so the reply language is decided by code, not guessed.
const ROMAN_URDU = /\b(mujhe|mujhay|chahiye|chahye|kya|hai|hain|mein|main|se|kam|le|lo|do|dein|kar|karo|meri|mera|achha|achhi|acha|sasta|wapas|kitna|kitni|tak|wala|wali|nahi|aur|bhi|ke|ki|ka)\b/gi;
export function replyLanguage(text: string): string {
  if (/[؀-ۿ]/.test(text)) return 'Urdu in Urdu script';
  const hits = text.match(ROMAN_URDU)?.length ?? 0;
  return hits >= 2 ? 'Roman Urdu (Urdu written in English letters)' : 'English';
}

export async function runAgent(userId: string, history: { role: 'user' | 'assistant'; content: string }[], context: string): Promise<ChatResponse> {
  const recent = history.slice(-8);
  // Budgets the user typed in their last two messages (so "buy it" after "under $10" still works).
  const userTexts = recent.filter((m) => m.role === 'user').slice(-2).map((m) => m.content).join(' ');
  const allowedBudgets = budgetsInText(userTexts);
  const messages: Msg[] = [
    {
      role: 'system',
      content: SYSTEM + (context ? `\nContext from earlier in this chat: ${context}` : '')
        + `\nReply language for THIS turn: ${replyLanguage(recent[recent.length - 1]?.content ?? '')}.`,
    },
    ...recent.map((m) => ({ role: m.role, content: m.content.slice(0, 1500) })),
  ];
  // Repeat the language rule next to the newest message so earlier replies in another script are not copied.
  const last = messages[messages.length - 1];
  if (last?.role === 'user') last.content += `\n\n[Reply in ${replyLanguage(recent[recent.length - 1].content)}. Use fresh tool results.]`;

  let products: ProductCard[] = [];
  let productNote: string | undefined;
  let budget: number | null = null;
  let orderedId: number | null = null;
  const receipts: Receipt[] = [];
  const extraCards: ChatCard[] = [];
  let model = '';

  for (let step = 0; step < 6; step++) {
    const res = await groq(messages);
    model = res.model;
    const msg = res.message;
    const calls = msg.tool_calls ?? [];
    messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: calls.length ? calls : undefined });
    if (!calls.length) {
      return finish(msg.content ?? '');
    }
    for (const call of calls) {
      let args: any = {};
      try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* keep empty */ }
      let result: unknown;
      try {
        result = await runTool(call.function.name, args);
      } catch (err: any) {
        result = { error: err.message };
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 3500) });
    }
  }
  return finish('I have prepared everything above. Tell me if you want me to continue.');

  async function runTool(name: string, a: any): Promise<unknown> {
    const safeBudget = (b: unknown) => (typeof b === 'number' && allowedBudgets.includes(b) ? b : null);
    switch (name) {
      case 'search_products': {
        const maxPrice = safeBudget(a.maxPrice);
        let found = await searchProducts({ keywords: String(a.keywords ?? ''), category: a.category, maxPrice, minRating: a.minRating, limit: 5 });
        let note: string | undefined;
        if (!found.length && maxPrice) {
          const all = await searchProducts({ keywords: String(a.keywords ?? ''), category: a.category, limit: 20 });
          found = all.sort((x, y) => x.price - y.price).slice(0, 3);
          if (found.length) note = `Nothing under $${maxPrice}. Closest options shown.`;
        }
        products = found; productNote = note; budget = maxPrice;
        return {
          budget: maxPrice, note: note ?? null,
          results: found.map((p) => ({ id: p.id, title: p.title, price: p.price, rating: p.rating, avgReview: p.avgReview, reviews: p.reviewCount, stock: p.stock, category: p.category })),
        };
      }
      case 'get_product': {
        const p = await getProduct(Number(a.id));
        if (!p) return { error: 'Product not found' };
        return { id: p.id, title: p.title, price: p.price, rating: p.rating, brand: p.brand, stock: p.stock, description: p.description.slice(0, 200), reviews: p.reviews.slice(0, 3) };
      }
      case 'check_purchase_rules':
        return checkPurchaseRules(userId, Number(a.productId), safeBudget(a.requestBudget));
      case 'place_order': {
        if (receipts.some((r) => r.productId === Number(a.productId) && r.status !== 'REJECTED')) return { error: 'Already ordered in this turn' };
        const r = await placeOrder(userId, Number(a.productId), safeBudget(a.requestBudget), String(a.reason ?? ''));
        receipts.push(r); orderedId = r.productId;
        return { status: r.status, rule: r.rule, ruleMessage: r.ruleMessage, product: r.productTitle, amount: r.amount, orderId: r.orderId, tracking: r.trackingNumber, undoMinutes: config.undoMinutes };
      }
      case 'cancel_order': {
        const r = await cancelOrder(userId, a.orderId || null);
        receipts.push(r);
        return { status: r.status, product: r.productTitle, amount: r.amount, message: r.ruleMessage };
      }
      case 'get_my_orders': {
        const orders = await getMyOrders(userId, 5);
        extraCards.push({ type: 'orders', orders });
        return orders.map((o) => ({ orderId: o.orderId, product: o.productTitle, amount: o.amount, status: o.status, date: o.createdAt }));
      }
      case 'get_my_limits': {
        const limits = await getMyLimits(userId);
        extraCards.push({ type: 'limits', limits });
        return limits;
      }
      default:
        return { error: `Unknown tool ${name}` };
    }
  }

  function finish(reply: string): ChatResponse {
    const cards: ChatCard[] = [];
    if (products.length) {
      const shown = products.slice(0, 3);
      if (orderedId && !shown.some((p) => p.id === orderedId)) {
        const o = products.find((p) => p.id === orderedId);
        if (o) shown[2] = o;
      }
      cards.push({ type: 'products', products: shown, bestId: orderedId ?? shown[0]?.id ?? null, budget, note: productNote });
    }
    for (const r of receipts) cards.push({ type: 'receipt', receipt: r });
    cards.push(...extraCards);
    const ctx = [
      products.length ? `Products shown: ${products.slice(0, 3).map((p) => `#${p.id} ${p.title} ($${p.price})`).join('; ')}` : '',
      receipts.length ? `Last order: ${receipts.map((r) => `${r.orderId || 'none'} ${r.productTitle} ${r.status}`).join('; ')}` : '',
    ].filter(Boolean).join('. ');
    return { reply: reply.trim() || 'Done.', cards, context: ctx || context, model };
  }
}
