// Unit tests for every branch of the rules engine. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRules, splitAmount, type RuleInput } from '../lib/rules-core.ts';

const mandate = { perOrderLimit: 20, monthlyLimit: 50, autoBuy: true, paypalLinked: true };
const base: RuleInput = { product: { price: 9.99, stock: 5 }, mandate, spentThisMonth: 0, requestBudget: 10 };
const run = (o: Partial<RuleInput>) => evaluateRules({ ...base, ...o });

test('auto-buy when within budget and limits', () => {
  const r = run({});
  assert.equal(r.decision, 'AUTO_BUY');
  assert.equal(r.rule, 'AUTO_BUY_WITHIN_LIMIT');
});
test('missing product is rejected', () => assert.equal(run({ product: null }).rule, 'NOT_FOUND'));
test('out of stock is rejected', () => {
  const r = run({ product: { price: 5, stock: 0 } });
  assert.equal(r.decision, 'REJECT');
  assert.equal(r.rule, 'OUT_OF_STOCK');
});
test('PayPal not linked needs approval', () =>
  assert.equal(run({ mandate: { ...mandate, paypalLinked: false } }).rule, 'ONE_TAP_APPROVAL'));
test('no mandate needs approval', () => assert.equal(run({ mandate: null }).rule, 'ONE_TAP_APPROVAL'));
test('price above per-order limit needs approval', () => {
  const r = run({ product: { price: 25, stock: 3 }, requestBudget: 30 });
  assert.equal(r.decision, 'NEEDS_APPROVAL');
  assert.equal(r.rule, 'OVER_PER_ORDER_LIMIT');
});
test('monthly cap needs approval', () => assert.equal(run({ spentThisMonth: 45 }).rule, 'OVER_MONTHLY_LIMIT'));
test('exactly at monthly cap is allowed', () => assert.equal(run({ spentThisMonth: 40.01 }).decision, 'AUTO_BUY'));
test('no budget needs approval', () => assert.equal(run({ requestBudget: null }).rule, 'NO_BUDGET'));
test('price above request budget needs approval', () =>
  assert.equal(run({ product: { price: 12, stock: 3 }, requestBudget: 10 }).rule, 'OVER_REQUEST_BUDGET'));
test('budget above safety limit needs approval even if price is low', () =>
  assert.equal(run({ requestBudget: 30 }).rule, 'BUDGET_OVER_LIMIT'));
test('auto-buy off needs approval', () =>
  assert.equal(run({ mandate: { ...mandate, autoBuy: false } }).rule, 'AUTO_BUY_OFF'));
test('fee split adds up to price', () => {
  const s = splitAmount(9.99, 0.1);
  assert.equal(s.platformFee, 1);
  assert.equal(s.sellerAmount, 8.99);
  assert.equal(Math.round((s.platformFee + s.sellerAmount) * 100), 999);
});
