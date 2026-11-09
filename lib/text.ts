// Pure text helpers used by the agent and the catalog. No imports, so they are unit tested directly.

// ---------- Search keywords ----------
const SYNONYMS: Record<string, string[]> = {
  perfume: ['fragrance', 'eau'], cologne: ['fragrance', 'eau'], scent: ['fragrance'], attar: ['fragrance'],
  phone: ['smartphone', 'phone'], mobile: ['smartphone', 'phone'], makeup: ['beauty'], cosmetic: ['beauty'],
  sneaker: ['shoe'], trainer: ['shoe'], bag: ['bag', 'handbag'], purse: ['bag'],
  shade: ['sunglasses'], glasses: ['sunglasses'], soap: ['soap', 'wash'], cream: ['cream', 'lotion', 'moisture'],
  tshirt: ['shirt', 't-shirt'], tee: ['shirt'],
};
const STOP = new Set(['a', 'an', 'the', 'for', 'me', 'my', 'best', 'good', 'cheap', 'under', 'below', 'with', 'and', 'or', 'of', 'some', 'nice', 'buy', 'find', 'want', 'need']);

export function searchTerms(keywords: string): string[] {
  const words = keywords.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter((w) => w.length > 1 && !STOP.has(w));
  const out = new Set<string>();
  for (let w of words) {
    if (w.length > 4 && /(x|z|ch|sh|ss)es$/.test(w)) w = w.slice(0, -2); // boxes, watches, dresses
    else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1); // shoes, lipsticks
    out.add(w);
    for (const s of SYNONYMS[w] ?? []) out.add(s);
  }
  return [...out].slice(0, 8);
}

// Deterministic, explainable score from the project plan:
// 0.5 * rating/5 + 0.3 * avgReview/5 + 0.2 * (1 - price/budget)   (last term only with a budget)
export function valueScore(p: { rating: number; avgReview: number; price: number }, budget?: number | null): number {
  const base = 0.5 * (p.rating / 5) + 0.3 * (p.avgReview / 5);
  if (!budget || budget <= 0) return base / 0.8;
  return base + 0.2 * Math.max(0, 1 - p.price / budget);
}

// ---------- Language ----------
const ROMAN_URDU = /\b(mujhe|mujhay|chahiye|chahye|kya|hai|hain|mein|se|kam|le|lo|do|dein|kar|karo|meri|mera|achha|achhi|acha|sasta|sasti|wapas|kitna|kitni|tak|wala|wali|nahi|aur|bhi|ke|ki|ka|haan|ji)\b/gi;

export function replyLanguage(text: string): string {
  if (/[؀-ۿ]/.test(text)) return 'Urdu in Urdu script';
  const hits = text.match(ROMAN_URDU)?.length ?? 0;
  return hits >= 2 ? 'Roman Urdu (Urdu written in English letters)' : 'English';
}

// ---------- Budget ----------
// Numbers the user typed. The agent may only use one of these as a budget.
export function numbersInText(text: string): number[] {
  return (text.replace(/,/g, '').match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter((n) => n > 0 && n < 1e6);
}

// ---------- Buy intent ----------
// The AI may only place an order when the user's latest message clearly asks to buy,
// or is a short "yes" reply to a message where the agent offered to buy.
// Common words like "ji", "ok", "pay", "order" or "kar do" alone are NOT a buy request
// ("ji mujhe perfume dikhao", "search kar do", "what is my order status").

// Clear buy requests: count in any message.
const BUY_EN = /\b(buy|purchase|checkout|check out|order (it|this|that|one|now)|place (an |the )?order|get (it|this|that|one)|grab (it|this|that|one)|go ahead|do it|approve)\b/i;
const BUY_ROMAN = /\b(le ?do|le ?lo|le ?dein|le ?len|le ?lijiye|khareed\w*|kharid\w*|mangwa\w*|order kar\w*)\b/i;
const BUY_URDU = /(خرید|لے دو|لے لو|لے دیں|لے لیں|منگوا|آرڈر کر)/;

// Confirmation words: only count as a short reply to an offer.
const YES_LATIN = /\b(yes|yeah|yep|yup|sure|ok|okay|confirm|confirmed|haan|han|ha|ji|jee|theek|thik|bilkul|zaroor)\b/i;
const YES_URDU = /(ہاں|جی|ٹھیک|بالکل|ضرور)/;

// "Don't buy", "mat lo", "nahi chahiye", "نہیں" cancel any buy signal.
const NEGATION = /\b(don'?t|do not|not now|no|nope|nahi|nahin|nai|mat|cancel|wait|ruko)\b|(نہیں|مت|رکو)/i;

// Did the agent's previous message offer to buy something?
const OFFER = /\b(buy|order|purchase|khareed\w*|kharid\w*|mangwa\w*|le ?l[uo]o?n|le ?doon|lena)\b|(خرید|منگوا|لے لوں|آرڈر)/i;

const wordCount = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

export function hasBuyIntent(text: string, previousAssistant = ''): boolean {
  if (NEGATION.test(text)) return false;
  if (BUY_EN.test(text) || BUY_ROMAN.test(text) || BUY_URDU.test(text)) return true;
  const offered = /[?؟]/.test(previousAssistant) && OFFER.test(previousAssistant); // ؟ is the Urdu question mark
  return offered && wordCount(text) <= 4 && (YES_LATIN.test(text) || YES_URDU.test(text));
}
