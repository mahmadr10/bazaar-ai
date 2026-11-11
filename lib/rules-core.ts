// The rules engine. Plain code, no AI. It alone decides whether a purchase
// can happen automatically. The AI cannot overspend even if it makes a mistake.
// This file has no imports so it can be unit tested directly with node --test.

export type Decision = 'AUTO_BUY' | 'NEEDS_APPROVAL' | 'REJECT';
export type RuleResult = { decision: Decision; rule: string; message: string };

export type RuleInput = {
  product: { price: number; stock: number } | null;
  mandate: { perOrderLimit: number; monthlyLimit: number; autoBuy: boolean; paypalLinked: boolean } | null;
  spentThisMonth: number;
  requestBudget: number | null;
};

const money = (n: number) => `$${n.toFixed(2)}`;
const R = (decision: Decision, rule: string, message: string): RuleResult => ({ decision, rule, message });

export function evaluateRules({ product, mandate, spentThisMonth, requestBudget }: RuleInput): RuleResult {
  if (!product) return R('REJECT', 'NOT_FOUND', 'This product does not exist in our store.');
  if (product.stock <= 0) return R('REJECT', 'OUT_OF_STOCK', 'This product is out of stock.');
  if (!mandate || !mandate.paypalLinked)
    return R('NEEDS_APPROVAL', 'ONE_TAP_APPROVAL', 'Every order needs your one-tap approval, then you pay through PayPal checkout.');
  if (product.price > mandate.perOrderLimit)
    return R('NEEDS_APPROVAL', 'OVER_PER_ORDER_LIMIT', `Price ${money(product.price)} is above your per-order limit of ${money(mandate.perOrderLimit)}.`);
  // Compare in cents so floating point never blocks or allows a purchase by mistake.
  if (Math.round((spentThisMonth + product.price) * 100) > Math.round(mandate.monthlyLimit * 100))
    return R('NEEDS_APPROVAL', 'OVER_MONTHLY_LIMIT', `This would take your monthly spend to ${money(spentThisMonth + product.price)}, above your ${money(mandate.monthlyLimit)} monthly cap.`);
  if (requestBudget === null || requestBudget === undefined || !(requestBudget > 0))
    return R('NEEDS_APPROVAL', 'NO_BUDGET', 'No budget was given in the request, so I need your approval before paying.');
  if (product.price > requestBudget)
    return R('NEEDS_APPROVAL', 'OVER_REQUEST_BUDGET', `Price ${money(product.price)} is above the budget you asked for (${money(requestBudget)}).`);
  if (requestBudget > mandate.perOrderLimit)
    return R('NEEDS_APPROVAL', 'BUDGET_OVER_LIMIT', `Your budget ${money(requestBudget)} is above your per-order safety limit of ${money(mandate.perOrderLimit)}.`);
  if (!mandate.autoBuy) return R('NEEDS_APPROVAL', 'AUTO_BUY_OFF', 'Auto-buy is turned off in your settings.');
  return R('AUTO_BUY', 'AUTO_BUY_WITHIN_LIMIT', `Within your budget and safety limits (${money(mandate.perOrderLimit)} per order, ${money(mandate.monthlyLimit)} per month).`);
}

export function splitAmount(price: number, feeRate: number) {
  const fee = Math.round(price * feeRate * 100) / 100;
  return { platformFee: fee, sellerAmount: Math.round((price - fee) * 100) / 100 };
}
