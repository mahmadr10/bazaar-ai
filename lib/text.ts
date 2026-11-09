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
// The AI may only place an order when the user's latest message asks to buy (or says yes to an offer).
const BUY_EN = /\b(buy|order|purchase|checkout|pay|get (it|this|that|me|one)|grab|yes|yeah|yep|sure|ok|okay|confirm|go ahead|do it|approve)\b/i;
const BUY_ROMAN = /\b(le ?do|le ?lo|lelo|ledo|le ?dein|khareed|kharid|khareedo|kharido|mangwa|mangwao|order kar|kar do|haan|han|ji|jee|theek|thik|bilkul)\b/i;
const BUY_URDU = /(خرید|لے دو|لے لو|لے دیں|منگوا|آرڈر|ہاں|جی|ٹھیک|بالکل)/;

export function hasBuyIntent(text: string): boolean {
  return BUY_EN.test(text) || BUY_ROMAN.test(text) || BUY_URDU.test(text);
}
