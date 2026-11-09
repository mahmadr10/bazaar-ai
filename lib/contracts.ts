// Shared types (Section 6 of the project plan). Used by the agent, the API and the UI.

export type ProductCard = {
  id: number; title: string; price: number; rating: number;
  category: string; thumbnail: string; stock: number;
  avgReview?: number; reviewCount?: number; score?: number;
};

export type ProductDetails = ProductCard & {
  description: string; brand?: string | null;
  reviews: { rating: number; comment: string; reviewer_name: string }[];
};

export type Decision = 'AUTO_BUY' | 'NEEDS_APPROVAL' | 'REJECT';

export type RuleResult = {
  decision: Decision;
  // AUTO_BUY_WITHIN_LIMIT, OVER_PER_ORDER_LIMIT, OVER_MONTHLY_LIMIT, NO_BUDGET,
  // OVER_REQUEST_BUDGET, BUDGET_OVER_LIMIT, AUTO_BUY_OFF, OUT_OF_STOCK, PAYPAL_NOT_LINKED, NOT_FOUND
  rule: string;
  message: string;
};

export type Receipt = {
  orderId: string; status: string; productId: number; productTitle: string; thumbnail?: string;
  amount: number; platformFee: number; sellerAmount: number;
  paypalOrderId?: string | null; paypalCaptureId?: string | null; trackingNumber?: string | null;
  undoUntil?: string | null; rule: string; ruleMessage?: string; agentReason?: string | null;
  payoutBatchId?: string | null; createdAt?: string; simulated?: boolean;
};

export type Limits = {
  perOrder: number; monthly: number; spentThisMonth: number;
  autoBuy: boolean; paypalLinked: boolean; paypalEmail?: string | null; simulated: boolean;
};

// What the chat API sends back to the UI: text plus cards built from tool results.
export type ChatCard =
  | { type: 'products'; products: ProductCard[]; bestId: number | null; budget: number | null; note?: string }
  | { type: 'receipt'; receipt: Receipt }
  | { type: 'limits'; limits: Limits }
  | { type: 'orders'; orders: Receipt[] };

// trace: plain-language steps the agent took (search, reviews, rules engine), shown under the reply.
export type ChatResponse = { reply: string; cards: ChatCard[]; context: string; model?: string; trace?: string[] };
