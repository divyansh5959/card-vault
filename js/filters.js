// Faceted filtering for the card and gift tabs. Pure functions (no DOM) so
// they run under Node for tests. A facet is one dimension (bank, network,
// variant…); multi-select facets OR their values, facets AND each other.

import { NETWORKS, cardExpiryDays, dateDays, urgency, giftState } from './cards.js';

export const AMOUNT_BANDS = [
  ['lt500', 'Under ₹500', (a) => a > 0 && a < 500],
  ['500to2000', '₹500 – ₹2,000', (a) => a >= 500 && a <= 2000],
  ['gt2000', 'Over ₹2,000', (a) => a > 2000],
  ['none', 'No amount', (a) => !a],
];

export function defaultFilters(tab) {
  if (tab === 'gift') return { status: 'live', brands: [], amount: [], within: '', pin: false, fav: false, sort: 'expiry' };
  return { banks: [], networks: [], tiers: [], validity: '', fav: false, shared: false, sort: 'fav' };
}

// Brings a stored or older filter object up to the current shape.
export function normalizeFilters(tab, f) {
  const d = defaultFilters(tab);
  const src = f && typeof f === 'object' ? f : {};
  const out = { ...d };
  for (const k of Object.keys(d)) {
    if (Array.isArray(d[k])) out[k] = Array.isArray(src[k]) ? src[k].filter((v) => typeof v === 'string').slice(0, 50) : d[k];
    else if (typeof d[k] === 'boolean') out[k] = src[k] === true;
    else if (typeof src[k] === 'string') out[k] = src[k];
  }
  // Older single-value filters (bank/network/brand) carry over.
  if (tab !== 'gift') {
    if (typeof src.bank === 'string' && src.bank) out.banks = [src.bank];
    if (typeof src.network === 'string' && src.network) out.networks = [src.network];
  } else if (typeof src.brand === 'string' && src.brand) out.brands = [src.brand];
  return out;
}

const cardValidity = (c) => {
  const d = cardExpiryDays(c.expiry);
  if (d === null) return 'unknown';
  if (d < 0) return 'expired';
  if (d <= 90) return 'soon';
  return 'valid';
};

const tierKey = (c) => (c.tier || '').trim();

export const CARD_FACETS = [
  {
    key: 'banks', label: 'Bank', multi: true,
    options: (items) => uniq(items.map((c) => c.bank)).sort().map((b) => [b, b]),
    test: (c, v) => c.bank === v,
  },
  {
    key: 'networks', label: 'Network', multi: true,
    options: (items) => uniq(items.map((c) => c.network)).sort().map((n) => [n, NETWORKS[n]?.label || 'Other']),
    test: (c, v) => c.network === v,
  },
  {
    key: 'tiers', label: 'Variant', multi: true,
    options: (items) => {
      const opts = uniq(items.map(tierKey).filter(Boolean)).sort().map((t) => [t, t]);
      if (items.some((c) => !tierKey(c))) opts.push(['', 'Not set']);
      return opts;
    },
    test: (c, v) => tierKey(c) === v,
  },
  {
    key: 'validity', label: 'Expiry', multi: false,
    options: () => [['soon', 'Expiring in 90 days'], ['expired', 'Expired'], ['valid', 'Valid 90+ days']],
    test: (c, v) => cardValidity(c) === v,
  },
  { key: 'fav', label: 'Favourites only', bool: true, test: (c) => c.fav === true },
  { key: 'shared', label: 'Shared limit', bool: true, kinds: ['credit'], test: (c) => !!c.limitGroup },
];

const giftDays = (g) => dateDays(g.expiry);

export const GIFT_FACETS = [
  {
    key: 'status', label: 'Status', multi: false, required: true,
    options: () => [['live', 'Active'], ['soon', 'Expiring ≤30 days'], ['expired', 'Expired'], ['used', 'Used'], ['all', 'All']],
    test: (g, v) => {
      if (v === 'all') return true;
      const st = giftState(g);
      if (v === 'live') return st === 'active' || st === 'soon';
      return st === v;
    },
  },
  {
    key: 'brands', label: 'Company', multi: true,
    options: (items) => uniq(items.map((g) => g.brand)).sort().map((b) => [b, b]),
    test: (g, v) => g.brand === v,
  },
  {
    key: 'amount', label: 'Amount', multi: true,
    options: () => AMOUNT_BANDS.map(([v, l]) => [v, l]),
    test: (g, v) => (AMOUNT_BANDS.find((b) => b[0] === v)?.[2] || (() => false))(Number(g.amount) || 0),
  },
  {
    key: 'within', label: 'Expires within', multi: false,
    options: () => [['7', '7 days'], ['30', '30 days'], ['90', '90 days']],
    test: (g, v) => { const d = giftDays(g); return d !== null && d >= 0 && d <= Number(v); },
  },
  { key: 'pin', label: 'Has a PIN', bool: true, test: (g) => !!g.pin },
  { key: 'fav', label: 'Favourites only', bool: true, test: (g) => g.fav === true },
];

export const facetsFor = (tab) => (tab === 'gift' ? GIFT_FACETS : CARD_FACETS.filter((f) => !f.kinds || f.kinds.includes(tab)));

function uniq(arr) { return [...new Set(arr)]; }

function facetPasses(facet, item, value) {
  if (facet.bool) return !value || facet.test(item);
  if (facet.multi) return !value.length || value.some((v) => facet.test(item, v));
  return !value || facet.test(item, value);
}

// Items passing every facet except `skipKey` (used for faceted counts).
export function applyFacets(items, tab, f, skipKey = null) {
  const facets = facetsFor(tab);
  return items.filter((it) => facets.every((fc) => fc.key === skipKey || facetPasses(fc, it, f[fc.key])));
}

// How many items each option would show, given the other active facets.
export function facetCounts(items, tab, f) {
  const out = {};
  for (const fc of facetsFor(tab)) {
    const base = applyFacets(items, tab, f, fc.key);
    if (fc.bool) out[fc.key] = { true: base.filter((it) => fc.test(it)).length };
    else {
      out[fc.key] = {};
      for (const [v] of fc.options(items)) out[fc.key][v] = base.filter((it) => fc.test(it, v)).length;
    }
  }
  return out;
}

// Active filters as removable pills: [{ key, value, label }]. The gift
// status facet is always set, so only a non-default status is listed.
export function activePills(tab, f, items) {
  const pills = [];
  for (const fc of facetsFor(tab)) {
    const v = f[fc.key];
    if (fc.bool) { if (v) pills.push({ key: fc.key, value: true, label: fc.label.replace(' only', '') }); continue; }
    const labelOf = (val) => (fc.options(items).find((o) => o[0] === val) || [val, val])[1];
    if (fc.multi) for (const val of v) pills.push({ key: fc.key, value: val, label: fc.key === 'tiers' && !val ? 'Variant not set' : labelOf(val) });
    else if (v && !(fc.required && v === defaultFilters(tab)[fc.key])) pills.push({ key: fc.key, value: v, label: fc.key === 'within' ? `Expires within ${labelOf(v)}` : labelOf(v) });
  }
  return pills;
}

export function removePill(tab, f, pill) {
  const fc = facetsFor(tab).find((x) => x.key === pill.key);
  if (!fc) return f;
  const next = { ...f };
  if (fc.bool) next[fc.key] = false;
  else if (fc.multi) next[fc.key] = f[fc.key].filter((v) => v !== pill.value);
  else next[fc.key] = fc.required ? defaultFilters(tab)[fc.key] : '';
  return next;
}

export function clearFacets(tab, f) {
  return { ...defaultFilters(tab), sort: f.sort };
}

export function toggleValue(f, key, value) {
  const fc = [...CARD_FACETS, ...GIFT_FACETS].find((x) => x.key === key);
  const next = { ...f };
  if (fc?.bool) next[key] = !f[key];
  else if (fc?.multi) next[key] = f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value];
  else next[key] = f[key] === value && !fc?.required ? '' : value;
  return next;
}

// ---------- sorting ----------

export const CARD_SORTS = {
  fav: 'Favourites first',
  bank: 'Bank A–Z',
  recent: 'Recently added',
  expiry: 'Expiring first',
  limit: 'Highest limit',
};

export const GIFT_SORTS = {
  expiry: 'Expiring first',
  amount: 'Highest amount',
  brand: 'Company A–Z',
  recent: 'Recently added',
};

export function sortItems(list, tab, f) {
  const arr = [...list];
  if (tab === 'gift') {
    if (f.status === 'used') return arr.sort((a, b) => (b.usedAt || 0) - (a.usedAt || 0));
    const exp = (g) => { const d = giftDays(g); return d === null ? 1e9 : d; };
    const by = {
      expiry: (a, b) => exp(a) - exp(b) || a.brand.localeCompare(b.brand),
      amount: (a, b) => (b.amount || 0) - (a.amount || 0) || exp(a) - exp(b),
      brand: (a, b) => a.brand.localeCompare(b.brand) || exp(a) - exp(b),
      recent: (a, b) => b.createdAt - a.createdAt,
    }[f.sort] || ((a, b) => exp(a) - exp(b));
    return arr.sort((a, b) => (b.fav === true) - (a.fav === true) || by(a, b));
  }
  const exp = (c) => { const d = cardExpiryDays(c.expiry); return d === null ? 1e9 : d; };
  const bank = (a, b) => a.bank.localeCompare(b.bank) || (a.name || '').localeCompare(b.name || '');
  const by = {
    fav: (a, b) => (b.fav === true) - (a.fav === true) || bank(a, b),
    bank,
    recent: (a, b) => b.createdAt - a.createdAt,
    expiry: (a, b) => exp(a) - exp(b) || bank(a, b),
    limit: (a, b) => (Number(b.limit) || 0) - (Number(a.limit) || 0) || bank(a, b),
  }[f.sort] || bank;
  return arr.sort(by);
}

export const urgencyOf = (g) => urgency(giftDays(g));
