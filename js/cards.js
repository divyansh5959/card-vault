// Pure helpers for card numbers, expiry dates, money and search.
// No DOM access here so the module runs under Node for unit tests.

export const NETWORKS = {
  visa:       { id: 'visa',       label: 'Visa',             lengths: [13, 16, 19],         cvv: 3, },
  mastercard: { id: 'mastercard', label: 'Mastercard',       lengths: [16],                 cvv: 3, },
  rupay:      { id: 'rupay',      label: 'RuPay',            lengths: [16],                 cvv: 3, },
  amex:       { id: 'amex',       label: 'American Express', lengths: [15],                 cvv: 4 },
  diners:     { id: 'diners',     label: 'Diners Club',      lengths: [14, 16, 19],         cvv: 3 },
  discover:   { id: 'discover',   label: 'Discover',         lengths: [16, 19],             cvv: 3, },
  jcb:        { id: 'jcb',        label: 'JCB',              lengths: [16, 19],             cvv: 3, },
  maestro:    { id: 'maestro',    label: 'Maestro',          lengths: [12, 13, 16, 18, 19], cvv: 3, },
  unionpay:   { id: 'unionpay',   label: 'UnionPay',         lengths: [16, 17, 18, 19],     cvv: 3, },
  other:      { id: 'other',      label: 'Card',             lengths: [12, 13, 14, 15, 16, 17, 18, 19], cvv: 3, },
};

// Ordered: the first matching rule wins. RuPay is checked before Discover
// because Indian RuPay cards use 60/65 ranges that overlap Discover's.
const RULES = [
  ['amex', /^3[47]/],
  ['diners', /^3(0[0-5]|095|6|[89])/],
  ['jcb', /^35(2[89]|[3-8]\d)/],
  ['discover', /^6011/],
  ['rupay', /^(508[5-9]|60[0-9]|65(2[1-9]|3[01])|8[12])/],
  ['discover', /^(64[4-9]|65)/],
  ['mastercard', /^(5[1-5]|2(2[2-9][1-9]|2[3-9]\d|[3-6]\d\d|7[01]\d|720))/],
  ['maestro', /^(50|5[6-8]|6304|6759|67677[04])/],
  ['unionpay', /^62/],
  ['visa', /^4/],
];

// Tiers each network sells; offered as one-tap suggestions in the form.
export const TIERS = {
  visa: ['Classic', 'Gold', 'Platinum', 'Signature', 'Infinite', 'Business'],
  mastercard: ['Standard', 'Titanium', 'Platinum', 'World', 'World Elite', 'World Legend', 'Business'],
  rupay: ['Classic', 'Platinum', 'Select', 'Business'],
  amex: ['Green', 'Gold', 'Platinum', 'Platinum Reserve', 'Centurion'],
  diners: ['Club', 'Premium', 'Privilege', 'Black', 'Black Metal'],
  discover: ['Standard'],
  jcb: ['Standard', 'Gold', 'Platinum'],
  maestro: ['Standard'],
  unionpay: ['Classic', 'Gold', 'Platinum', 'Diamond'],
  other: [],
};

export const digits = (s) => String(s ?? '').replace(/\D/g, '');

export function detectNetwork(number) {
  const n = digits(number);
  if (!n) return null;
  for (const [id, re] of RULES) if (re.test(n)) return id;
  return null;
}

export function luhnValid(number) {
  const n = digits(number);
  if (n.length < 12) return false;
  let sum = 0;
  let dbl = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let d = n.charCodeAt(i) - 48;
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

export function maxLength(networkId) {
  const net = NETWORKS[networkId] || NETWORKS.other;
  return Math.max(...net.lengths);
}

// Groups digits the way the network prints them: Amex 4-6-5, Diners-14 4-6-4, others 4-4-4-4.
function groupDigits(str, networkId, len) {
  const sixGroup = networkId === 'amex' || (networkId === 'diners' && len === 14);
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const gap = sixGroup ? (i === 4 || i === 10) : (i > 0 && i % 4 === 0);
    if (gap) out += ' ';
    out += str[i];
  }
  return out;
}

export function formatNumber(number, networkId = detectNetwork(number)) {
  const n = digits(number);
  return groupDigits(n, networkId, n.length);
}

export function maskNumber(number, networkId = detectNetwork(number)) {
  const n = digits(number);
  if (n.length <= 4) return n;
  return groupDigits('\u2022'.repeat(n.length - 4) + n.slice(-4), networkId, n.length);
}

export const last4 = (number) => digits(number).slice(-4);

// "0829" or "08/29" -> "08/29" (partial input passes through while typing).
export function formatExpiryInput(value) {
  const d = digits(value).slice(0, 4);
  if (d.length === 1 && d > '1') return '0' + d + '/';
  if (d.length <= 2) return d;
  return d.slice(0, 2) + '/' + d.slice(2);
}

export function parseCardExpiry(mmyy) {
  const m = /^(\d{2})\/(\d{2})$/.exec(String(mmyy || ''));
  if (!m) return null;
  const month = Number(m[1]);
  if (month < 1 || month > 12) return null;
  return { month, year: 2000 + Number(m[2]) };
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Card expiry: valid through the last day of the printed month.
export function cardExpiryDays(mmyy, today = new Date()) {
  const e = parseCardExpiry(mmyy);
  if (!e) return null;
  const lastDay = new Date(e.year, e.month, 0);
  return Math.round((lastDay - startOfDay(today)) / 86400000);
}

// Gift card expiry stored as "YYYY-MM-DD"; usable through that date.
export function dateDays(iso, today = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.round((d - startOfDay(today)) / 86400000);
}

export function expiryPhrase(days) {
  if (days === null || days === undefined) return 'No expiry';
  if (days < -1) return `Expired ${-days} days ago`;
  if (days === -1) return 'Expired yesterday';
  if (days === 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  if (days < 60) return `Expires in ${days} days`;
  const months = Math.round(days / 30.44);
  if (months < 24) return `Expires in ${months} months`;
  return `Expires in ${Math.round(days / 365.25)} years`;
}

// Urgency bucket used for colour and filters.
export function urgency(days) {
  if (days === null || days === undefined) return 'none';
  if (days < 0) return 'expired';
  if (days <= 7) return 'urgent';
  if (days <= 30) return 'soon';
  return 'ok';
}

export function giftState(item, today = new Date()) {
  if (item.used) return 'used';
  const days = dateDays(item.expiry, today);
  const u = urgency(days);
  if (u === 'expired') return 'expired';
  if (u === 'urgent' || u === 'soon') return 'soon';
  return 'active';
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export const formatINR = (n) => inr.format(Number(n) || 0);

// Indian digit grouping for input fields: 300000 -> "3,00,000".
export function groupIndian(value) {
  const n = digits(value).replace(/^0+(?=\d)/, '');
  if (!n) return '';
  const last3 = n.slice(-3);
  const rest = n.slice(0, -3);
  return rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3;
}

// Sum of credit limits, counting each shared-limit group once (its largest value).
export function totalLimit(items) {
  const groups = new Map();
  let total = 0;
  for (const it of items) {
    if (it.kind !== 'credit' || !it.limit) continue;
    const v = Number(it.limit) || 0;
    if (it.limitGroup) groups.set(it.limitGroup, Math.max(groups.get(it.limitGroup) || 0, v));
    else total += v;
  }
  for (const v of groups.values()) total += v;
  return total;
}

export const acronym = (s) => String(s || '').split(/[\s&().-]+/).filter(Boolean).map((w) => w[0]).join('').toLowerCase();

// Every whitespace-separated query token must appear somewhere in the item.
export function matchesQuery(item, query) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return true;
  const n = digits(item.number);
  const hay = [
    item.bank, acronym(item.bank), item.name, acronym(item.name), item.tier, item.holder,
    NETWORKS[item.network]?.label, item.network, item.notes, item.brand, acronym(item.brand), item.code,
    n.slice(-4), n.slice(0, 6), item.amount ? String(item.amount) : '', item.expiry,
    item.kind === 'credit' ? 'credit' : item.kind === 'debit' ? 'debit' : '', item.fav ? 'favourite' : '',
  ].filter(Boolean).join(' \u0001 ').toLowerCase();
  return q.split(/\s+/).every((t) => hay.includes(t) || (/^\d+$/.test(t) && t.length >= 4 && n.includes(t)));
}

// Plain-text block used by "Copy all" and "Share".
export function cardText(item) {
  const net = NETWORKS[item.network]?.label || '';
  const title = [item.bank, item.name].filter(Boolean).join(' ');
  const lines = [`${title}${net ? ` (${net}${item.tier ? ' ' + item.tier : ''})` : ''}`];
  lines.push(`Number: ${formatNumber(item.number, item.network)}`);
  if (item.expiry) lines.push(`Expiry: ${item.expiry}`);
  if (item.cvv) lines.push(`CVV: ${item.cvv}`);
  if (item.holder) lines.push(`Name: ${item.holder}`);
  return lines.join('\n');
}

export function giftText(item) {
  const lines = [`${item.brand} gift card${item.amount ? ' ' + formatINR(item.amount) : ''}`];
  lines.push(`Code: ${item.code}`);
  if (item.pin) lines.push(`PIN: ${item.pin}`);
  if (item.expiry) lines.push(`Valid till: ${item.expiry}`);
  return lines.join('\n');
}
