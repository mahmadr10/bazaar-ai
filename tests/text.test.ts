// Tests for the agent's language, budget and buy-intent guards. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replyLanguage, numbersInText, hasBuyIntent, searchTerms, valueScore } from '../lib/text.ts';

test('detects English', () => assert.equal(replyLanguage('Find me a good body wash under $15'), 'English'));
test('detects Roman Urdu', () => assert.match(replyLanguage('Meri limit kya hai?'), /Roman Urdu/));
test('detects Urdu script', () => assert.match(replyLanguage('مجھے نیل پالش چاہیے'), /Urdu script/));
test('one stray word is not Roman Urdu', () => assert.equal(replyLanguage('Do you have shoes?'), 'English'));

test('reads budgets the user typed', () => {
  assert.deepEqual(numbersInText('Under $10 mein mascara'), [10]);
  assert.deepEqual(numbersInText('budget 1,200 or 9.99'), [1200, 9.99]);
  assert.deepEqual(numbersInText('no numbers here'), []);
});

const OFFER_EN = 'The best pick is the Red Lipstick for $8.99. Should I buy it for you?';
const OFFER_ROMAN = 'Sab se achhi lipstick $8.99 ki hai. Kya main ye aap ke liye khareed loon?';
const OFFER_URDU = 'سب سے اچھی لپ اسٹک 8.99 ڈالر کی ہے۔ کیا میں یہ آپ کے لیے خرید لوں؟';

test('buy intent in three languages', () => {
  assert.ok(hasBuyIntent('Under $10 mein best mascara le do'));
  assert.ok(hasBuyIntent('find a body wash and buy it'));
  assert.ok(hasBuyIntent('mujhe $10 se kam mein perfume chahiye, le lo'));
  assert.ok(hasBuyIntent('مجھے نیل پالش خرید دیں'));
  assert.ok(hasBuyIntent('order it'));
});
test('a short yes counts only after the agent offered to buy', () => {
  assert.ok(hasBuyIntent('haan', OFFER_ROMAN));
  assert.ok(hasBuyIntent('yes please', OFFER_EN));
  assert.ok(hasBuyIntent('ok', OFFER_EN));
  assert.ok(hasBuyIntent('ji bilkul', OFFER_ROMAN));
  assert.ok(hasBuyIntent('جی ہاں', OFFER_URDU));
  assert.equal(hasBuyIntent('haan'), false); // no offer before it
  assert.equal(hasBuyIntent('yes', 'Here are three lipsticks under $10.'), false); // not an offer
  assert.equal(hasBuyIntent('ok but show me cheaper ones first', OFFER_EN), false); // long reply, not a yes
});
test('no buy intent when only searching or asking', () => {
  assert.equal(hasBuyIntent('Find me a lipstick under $10'), false);
  assert.equal(hasBuyIntent('mujhe sasta perfume dikhao'), false);
  assert.equal(hasBuyIntent('Meri limit kya hai?'), false);
  assert.equal(hasBuyIntent('ji mujhe perfume dikhao'), false);
  assert.equal(hasBuyIntent('search kar do lipstick'), false);
  assert.equal(hasBuyIntent('how do I pay with paypal?'), false);
  assert.equal(hasBuyIntent('what is my order status'), false);
  assert.equal(hasBuyIntent('is this ok for dry skin?'), false);
  assert.equal(hasBuyIntent('جی مجھے پرفیوم دکھائیں'), false);
});
test('saying no cancels a buy', () => {
  assert.equal(hasBuyIntent("don't buy it yet"), false);
  assert.equal(hasBuyIntent('nahi, abhi mat lo', OFFER_ROMAN), false);
  assert.equal(hasBuyIntent('نہیں ابھی مت خریدیں', OFFER_URDU), false);
});

test('search terms singularise and add synonyms', () => {
  const t = searchTerms('best perfumes');
  assert.ok(t.includes('perfume'));
  assert.ok(t.includes('fragrance'));
  assert.ok(!t.includes('best'));
  assert.deepEqual(searchTerms('shoes'), ['shoe']);
});

test('value score prefers cheaper at equal quality', () => {
  const a = valueScore({ rating: 4, avgReview: 4, price: 5 }, 10);
  const b = valueScore({ rating: 4, avgReview: 4, price: 9 }, 10);
  assert.ok(a > b);
});
