import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultFilters, normalizeFilters, applyFacets, facetCounts, activePills, removePill, clearFacets, toggleValue, sortItems,
} from '../js/filters.js';

const iso = (days) => {
  const d = new Date(); d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const mmyy = (months) => {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + months);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
};

const cards = [
  { id: 'a', kind: 'credit', bank: 'HDFC Bank', name: 'Millennia', network: 'mastercard', tier: 'World', expiry: mmyy(24), createdAt: 1, fav: true, limitGroup: 'g' },
  { id: 'b', kind: 'credit', bank: 'HDFC Bank', name: 'Regalia', network: 'visa', tier: 'Signature', expiry: mmyy(1), createdAt: 2, limit: '300000', limitGroup: 'g' },
  { id: 'c', kind: 'credit', bank: 'Axis Bank', name: 'Atlas', network: 'visa', tier: '', expiry: mmyy(-2), createdAt: 3, limit: '500000' },
  { id: 'd', kind: 'credit', bank: 'SBI', name: 'Elite', network: 'mastercard', tier: 'World Elite', expiry: mmyy(36), createdAt: 4 },
];

const gifts = [
  { id: 'g1', kind: 'gift', brand: 'Amazon', amount: 500, code: 'A', pin: '1', expiry: iso(4), createdAt: 1 },
  { id: 'g2', kind: 'gift', brand: 'Myntra', amount: 2000, code: 'B', pin: '', expiry: iso(45), createdAt: 2, fav: true },
  { id: 'g3', kind: 'gift', brand: 'Amazon', amount: 5000, code: 'C', pin: '', expiry: iso(-3), createdAt: 3 },
  { id: 'g4', kind: 'gift', brand: 'Swiggy', amount: 250, code: 'D', pin: '', expiry: '', createdAt: 4, used: true, usedAt: 9 },
  { id: 'g5', kind: 'gift', brand: 'Croma', amount: 0, code: 'E', pin: '', expiry: iso(20), createdAt: 5 },
];

const ids = (list) => list.map((x) => x.id).sort().join('');

test('multi-select facets OR within, AND across', () => {
  let f = defaultFilters('credit');
  f = toggleValue(f, 'networks', 'mastercard');
  assert.equal(ids(applyFacets(cards, 'credit', f)), 'ad');
  f = toggleValue(f, 'networks', 'visa');
  assert.equal(ids(applyFacets(cards, 'credit', f)), 'abcd');
  f = toggleValue(f, 'banks', 'HDFC Bank');
  assert.equal(ids(applyFacets(cards, 'credit', f)), 'ab');
  f = toggleValue(f, 'tiers', 'World');
  assert.equal(ids(applyFacets(cards, 'credit', f)), 'a');
});

test('variant facet includes "not set"', () => {
  const f = toggleValue(defaultFilters('credit'), 'tiers', '');
  assert.equal(ids(applyFacets(cards, 'credit', f)), 'c');
});

test('validity, favourites and shared limit', () => {
  assert.equal(ids(applyFacets(cards, 'credit', { ...defaultFilters('credit'), validity: 'soon' })), 'b');
  assert.equal(ids(applyFacets(cards, 'credit', { ...defaultFilters('credit'), validity: 'expired' })), 'c');
  assert.equal(ids(applyFacets(cards, 'credit', { ...defaultFilters('credit'), fav: true })), 'a');
  assert.equal(ids(applyFacets(cards, 'credit', { ...defaultFilters('credit'), shared: true })), 'ab');
});

test('facet counts ignore their own facet but respect the others', () => {
  const f = { ...defaultFilters('credit'), banks: ['HDFC Bank'] };
  const c = facetCounts(cards, 'credit', f);
  assert.equal(c.banks['Axis Bank'], 1, 'own facet ignored: Axis still counts');
  assert.equal(c.networks.mastercard, 1, 'other facet applied: only HDFC mastercard');
  assert.equal(c.networks.visa, 1);
  assert.equal(c.fav.true, 1);
});

test('gift status, company, amount band, expires-within, PIN', () => {
  const d = defaultFilters('gift');
  assert.equal(ids(applyFacets(gifts, 'gift', d)), 'g1g2g5', 'active by default');
  assert.equal(ids(applyFacets(gifts, 'gift', { ...d, status: 'expired' })), 'g3');
  assert.equal(ids(applyFacets(gifts, 'gift', { ...d, status: 'used' })), 'g4');
  assert.equal(ids(applyFacets(gifts, 'gift', { ...d, status: 'all', brands: ['Amazon'] })), 'g1g3');
  assert.equal(ids(applyFacets(gifts, 'gift', { ...d, status: 'all', amount: ['gt2000'] })), 'g3');
  assert.equal(ids(applyFacets(gifts, 'gift', { ...d, status: 'all', amount: ['lt500', 'none'] })), 'g4g5');
  assert.equal(ids(applyFacets(gifts, 'gift', { ...d, within: '7' })), 'g1');
  assert.equal(ids(applyFacets(gifts, 'gift', { ...d, within: '30' })), 'g1g5');
  assert.equal(ids(applyFacets(gifts, 'gift', { ...d, pin: true })), 'g1');
});

test('pills list active filters and remove one at a time', () => {
  let f = { ...defaultFilters('gift'), brands: ['Amazon', 'Myntra'], pin: true, within: '7' };
  let pills = activePills('gift', f, gifts);
  assert.deepEqual(pills.map((p) => p.label), ['Amazon', 'Myntra', 'Expires within 7 days', 'Has a PIN']);
  f = removePill('gift', f, pills[0]);
  assert.deepEqual(f.brands, ['Myntra']);
  f = { ...f, status: 'expired' };
  pills = activePills('gift', f, gifts);
  assert.equal(pills[0].label, 'Expired');
  f = removePill('gift', f, pills[0]);
  assert.equal(f.status, 'live', 'required status resets to its default');
  f = clearFacets('gift', { ...f, sort: 'amount' });
  assert.equal(activePills('gift', f, gifts).length, 0);
  assert.equal(f.sort, 'amount', 'clearing keeps the sort');
});

test('normalizeFilters migrates old single-value filters and drops junk', () => {
  const f = normalizeFilters('credit', { bank: 'HDFC Bank', network: 'visa', sort: 'limit', banks: 'x', evil: 1 });
  assert.deepEqual(f.banks, ['HDFC Bank']);
  assert.deepEqual(f.networks, ['visa']);
  assert.equal(f.sort, 'limit');
  assert.equal('evil' in f, false);
  assert.deepEqual(normalizeFilters('gift', null), defaultFilters('gift'));
  assert.deepEqual(normalizeFilters('gift', { brand: 'Amazon' }).brands, ['Amazon']);
});

test('sorting: favourites first, expiry, limit', () => {
  assert.equal(sortItems(cards, 'credit', { sort: 'fav' })[0].id, 'a');
  assert.deepEqual(sortItems(cards, 'credit', { sort: 'expiry' }).map((c) => c.id), ['c', 'b', 'a', 'd']);
  assert.deepEqual(sortItems(cards, 'credit', { sort: 'limit' }).map((c) => c.id).slice(0, 2), ['c', 'b']);
  const g = sortItems(gifts.filter((x) => !x.used), 'gift', { sort: 'expiry', status: 'live' });
  assert.equal(g[0].id, 'g2', 'favourite gift first');
  assert.deepEqual(g.slice(1).map((x) => x.id), ['g3', 'g1', 'g5']);
});
