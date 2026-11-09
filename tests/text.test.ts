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

test('buy intent in three languages', () => {
  assert.ok(hasBuyIntent('Under $10 mein best mascara le do'));
  assert.ok(hasBuyIntent('find a body wash and buy it'));
  assert.ok(hasBuyIntent('مجھے نیل پالش خرید دیں'));
  assert.ok(hasBuyIntent('haan'));
  assert.ok(hasBuyIntent('yes please'));
});
test('no buy intent when only searching', () => {
  assert.equal(hasBuyIntent('Find me a lipstick under $10'), false);
  assert.equal(hasBuyIntent('mujhe sasta perfume dikhao'), false);
  assert.equal(hasBuyIntent('Meri limit kya hai?'), false);
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
