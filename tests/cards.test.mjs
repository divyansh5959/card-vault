// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectNetwork, luhnValid, formatNumber, maskNumber, formatExpiryInput, parseCardExpiry,
  cardExpiryDays, dateDays, expiryPhrase, urgency, giftState, groupIndian, totalLimit, matchesQuery, cardText,
} from '../js/cards.js';

test('detects networks from the first digits', () => {
  const cases = {
    '4111111111111111': 'visa',
    '5500005555555559': 'mastercard',
    '2221000000000009': 'mastercard',
    '2720990000000007': 'mastercard',
    '378282246310005': 'amex',
    '341111111111111': 'amex',
    '6521000000000000': 'rupay',
    '6531000000000000': 'rupay',
    '6070000000000000': 'rupay',
    '5085000000000000': 'rupay',
    '8172000000000000': 'rupay',
    '6011111111111117': 'discover',
    '6500000000000002': 'discover',
    '3530111333300000': 'jcb',
    '30569309025904': 'diners',
    '36000000000008': 'diners',
    '6304000000000000': 'maestro',
    '6200000000000005': 'unionpay',
  };
  for (const [num, want] of Object.entries(cases)) assert.equal(detectNetwork(num), want, num);
  assert.equal(detectNetwork(''), null);
  assert.equal(detectNetwork('9'), null);
});

test('Luhn check', () => {
  assert.equal(luhnValid('4111 1111 1111 1111'), true);
  assert.equal(luhnValid('378282246310005'), true);
  assert.equal(luhnValid('4111111111111112'), false);
  assert.equal(luhnValid('4111'), false);
});

test('formats and masks by network layout', () => {
  assert.equal(formatNumber('4111111111111111'), '4111 1111 1111 1111');
  assert.equal(formatNumber('378282246310005'), '3782 822463 10005');
  assert.equal(formatNumber('30569309025904'), '3056 930902 5904');
  assert.equal(formatNumber('4111111111111111111'), '4111 1111 1111 1111 111');
  assert.equal(maskNumber('4111111111111234'), '•••• •••• •••• 1234');
  assert.equal(maskNumber('378282246310005'), '•••• •••••• •0005');
});

test('expiry input and parsing', () => {
  assert.equal(formatExpiryInput('0829'), '08/29');
  assert.equal(formatExpiryInput('8'), '08/');
  assert.equal(formatExpiryInput('1'), '1');
  assert.equal(formatExpiryInput('12/2'), '12/2');
  assert.deepEqual(parseCardExpiry('08/29'), { month: 8, year: 2029 });
  assert.equal(parseCardExpiry('13/29'), null);
  assert.equal(parseCardExpiry('8/29'), null);
});

test('card expiry runs through the end of the printed month', () => {
  const today = new Date(2026, 9, 18); // 18 Oct 2026
  assert.equal(cardExpiryDays('10/26', today), 13);
  assert.equal(cardExpiryDays('09/26', today), -18);
  assert.equal(cardExpiryDays('11/26', today), 43);
});

test('gift expiry days and phrases', () => {
  const today = new Date(2026, 9, 18);
  assert.equal(dateDays('2026-10-18', today), 0);
  assert.equal(dateDays('2026-10-30', today), 12);
  assert.equal(dateDays('2026-10-17', today), -1);
  assert.equal(dateDays('', today), null);
  assert.equal(expiryPhrase(0), 'Expires today');
  assert.equal(expiryPhrase(1), 'Expires tomorrow');
  assert.equal(expiryPhrase(12), 'Expires in 12 days');
  assert.equal(expiryPhrase(59), 'Expires in 59 days');
  assert.equal(expiryPhrase(120), 'Expires in 4 months');
  assert.equal(expiryPhrase(-1), 'Expired yesterday');
  assert.equal(expiryPhrase(-5), 'Expired 5 days ago');
  assert.equal(expiryPhrase(null), 'No expiry');
  assert.equal(urgency(3), 'urgent');
  assert.equal(urgency(20), 'soon');
  assert.equal(urgency(40), 'ok');
  assert.equal(urgency(-2), 'expired');
  assert.equal(giftState({ used: false, expiry: '2026-10-25' }, today), 'soon');
  assert.equal(giftState({ used: false, expiry: '2027-10-25' }, today), 'active');
  assert.equal(giftState({ used: false, expiry: '2026-10-01' }, today), 'expired');
  assert.equal(giftState({ used: true, expiry: '2027-10-25' }, today), 'used');
  assert.equal(giftState({ used: false, expiry: '' }, today), 'active');
});

test('Indian grouping and shared limits', () => {
  assert.equal(groupIndian('300000'), '3,00,000');
  assert.equal(groupIndian('12345678'), '1,23,45,678');
  assert.equal(groupIndian('999'), '999');
  assert.equal(groupIndian('007'), '7');
  const items = [
    { kind: 'credit', limit: '300000', limitGroup: 'g1' },
    { kind: 'credit', limit: '300000', limitGroup: 'g1' },
    { kind: 'credit', limit: '50000', limitGroup: '' },
    { kind: 'debit', limit: '999999' },
  ];
  assert.equal(totalLimit(items), 350000);
});

test('search matches bank, acronym, last four and multiple words', () => {
  const card = { kind: 'credit', bank: 'Punjab National Bank', name: 'RuPay Select', network: 'rupay', number: '6521000000004321', holder: 'DIVYANSH' };
  assert.equal(matchesQuery(card, 'pnb'), true);
  assert.equal(matchesQuery(card, '4321'), true);
  assert.equal(matchesQuery(card, 'punjab select'), true);
  assert.equal(matchesQuery(card, 'rupay'), true);
  assert.equal(matchesQuery(card, 'hdfc'), false);
  assert.equal(matchesQuery(card, '0000 4321'.replace(' ', '')), true);
  const gift = { kind: 'gift', brand: 'Amazon', code: 'ABCD-1234', amount: 500 };
  assert.equal(matchesQuery(gift, 'amaz'), true);
  assert.equal(matchesQuery(gift, '500'), true);
  assert.equal(matchesQuery(gift, 'abcd'), true);
});

test('copy-all text block', () => {
  const t = cardText({ bank: 'HDFC Bank', name: 'Regalia Gold', network: 'visa', tier: 'Signature', number: '4111111111111111', expiry: '08/29', cvv: '123', holder: 'A B' });
  assert.equal(t, 'HDFC Bank Regalia Gold (Visa Signature)\nNumber: 4111 1111 1111 1111\nExpiry: 08/29\nCVV: 123\nName: A B');
});
