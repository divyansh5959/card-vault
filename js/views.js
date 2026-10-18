// Card and gift-card lists, detail sheets and add/edit forms.

import { h, toast, sheet, copyText, confirmSheet, today } from './ui.js';
import { icon, networkMark, chip } from './icons.js';
import {
  NETWORKS, TIERS, detectNetwork, luhnValid, maxLength, formatNumber, maskNumber, last4, digits,
  formatExpiryInput, parseCardExpiry, cardExpiryDays, dateDays, expiryPhrase, urgency, giftState,
  formatINR, groupIndian, totalLimit, matchesQuery, cardText, giftText,
} from './cards.js';
import { BANKS, bankInfo, GIFT_BRANDS } from './data.js';
import { newId } from './store.js';
import { store } from './app.js';

export const TAB_META = {
  credit: { title: 'Credit cards', short: 'Credit', icon: 'credit', add: 'Add credit card', placeholder: 'Search bank, card, last 4 digits…' },
  debit: { title: 'Debit cards', short: 'Debit', icon: 'debit', add: 'Add debit card', placeholder: 'Search bank, card, last 4 digits…' },
  gift: { title: 'Gift cards', short: 'Gift', icon: 'gift', add: 'Add gift card', placeholder: 'Search brand, code, amount…' },
  settings: { title: 'Settings', short: 'Settings', icon: 'settings' },
};

const GIFT_STATUS = [['live', 'Active'], ['soon', 'Expiring ≤30 days'], ['expired', 'Expired'], ['used', 'Used'], ['all', 'All']];
const CARD_SORTS = { bank: 'Bank A–Z', recent: 'Recently added', expiry: 'Expiring first', limit: 'Highest limit' };
const GIFT_SORTS = { expiry: 'Expiring first', amount: 'Highest amount', brand: 'Brand A–Z', recent: 'Recently added' };
const REVEAL_MS = 30_000;

const itemsOf = (S, kind) => S.vault.items.filter((x) => x.kind === kind);

// ---------------- summaries ----------------

export function tabSummary(S, tab) {
  const items = itemsOf(S, tab);
  if (tab === 'gift') {
    const live = items.filter((g) => !g.used && urgency(dateDays(g.expiry)) !== 'expired');
    const value = live.reduce((a, g) => a + (Number(g.amount) || 0), 0);
    const soon = live.filter((g) => ['urgent', 'soon'].includes(urgency(dateDays(g.expiry)))).length;
    if (!items.length) return 'Vouchers with codes, PINs and expiry dates';
    return `${formatINR(value)} usable across ${live.length} card${live.length === 1 ? '' : 's'}${soon ? ` · ${soon} expiring within 30 days` : ''}`;
  }
  if (!items.length) return tab === 'credit' ? 'Card numbers, CVVs and limits' : 'Card numbers and CVVs';
  const n = `${items.length} card${items.length === 1 ? '' : 's'}`;
  if (tab === 'credit') {
    const lim = totalLimit(items);
    return lim ? `${n} · Total limit ${formatINR(lim)}` : n;
  }
  return n;
}

export function crossTabHits(S, tab) {
  const q = S.query[tab];
  if (!q || q.trim().length < 2) return [];
  return ['credit', 'debit', 'gift'].filter((t) => t !== tab)
    .map((t) => [t, itemsOf(S, t).filter((x) => matchesQuery(x, q)).length])
    .filter(([, n]) => n > 0);
}

// ---------------- filtering ----------------

function filtered(S, tab) {
  const f = S.filters[tab];
  const q = S.query[tab];
  let list = itemsOf(S, tab).filter((x) => matchesQuery(x, q));
  if (tab === 'gift') {
    if (f.brand) list = list.filter((g) => g.brand === f.brand);
    if (f.status !== 'all') {
      list = list.filter((g) => {
        const st = giftState(g);
        if (f.status === 'live') return st === 'active' || st === 'soon';
        return st === f.status;
      });
    }
    const exp = (g) => { const d = dateDays(g.expiry); return d === null ? 1e9 : d; };
    const sorts = {
      expiry: (a, b) => exp(a) - exp(b) || a.brand.localeCompare(b.brand),
      amount: (a, b) => (b.amount || 0) - (a.amount || 0),
      brand: (a, b) => a.brand.localeCompare(b.brand) || exp(a) - exp(b),
      recent: (a, b) => b.createdAt - a.createdAt,
    };
    // Used cards sort by when they were used, newest first.
    if (f.status === 'used') return list.sort((a, b) => (b.usedAt || 0) - (a.usedAt || 0));
    return list.sort(sorts[f.sort] || sorts.expiry);
  }
  if (f.bank) list = list.filter((c) => c.bank === f.bank);
  if (f.network) list = list.filter((c) => c.network === f.network);
  const exp = (c) => { const d = cardExpiryDays(c.expiry); return d === null ? 1e9 : d; };
  const sorts = {
    bank: (a, b) => a.bank.localeCompare(b.bank) || a.name.localeCompare(b.name),
    recent: (a, b) => b.createdAt - a.createdAt,
    expiry: (a, b) => exp(a) - exp(b),
    limit: (a, b) => (Number(b.limit) || 0) - (Number(a.limit) || 0),
  };
  return list.sort(sorts[f.sort] || sorts.bank);
}

function chipRow(label, options, value, onPick) {
  return h('div', { class: 'chips', role: 'group', 'aria-label': label },
    options.map(([v, l, n]) => h('button', {
      class: `chip ${value === v ? 'on' : ''}`, type: 'button', 'aria-pressed': String(value === v),
      onclick: () => onPick(value === v && v !== '' && v !== 'live' ? '' : v),
    }, l, n !== undefined ? h('span', { class: 'chip-n', text: String(n) }) : null)));
}

function sortSelect(sorts, value, onPick) {
  return h('label', { class: 'sort' }, h('span', { class: 'sr-only', text: 'Sort' }),
    h('select', { class: 'select', 'aria-label': 'Sort', onchange: (e) => onPick(e.target.value) },
      Object.entries(sorts).map(([v, l]) => h('option', { value: v, selected: v === value, text: l }))));
}

function renderTools(S, tab) {
  const f = S.filters[tab];
  const all = itemsOf(S, tab);
  const set = (k) => (v) => { f[k] = v; store.refresh(); };
  if (!all.length) return [];
  if (tab === 'gift') {
    const counts = { live: 0, soon: 0, expired: 0, used: 0, all: all.length };
    for (const g of all) {
      const st = giftState(g);
      if (st === 'active' || st === 'soon') counts.live++;
      if (st !== 'active') counts[st]++;
    }
    const brands = [...new Set(all.map((g) => g.brand))].sort();
    return [
      chipRow('Status', GIFT_STATUS.map(([v, l]) => [v, l, counts[v]]), f.status, (v) => set('status')(v || 'live')),
      h('div', { class: 'tools-row' },
        brands.length > 1
          ? h('select', { class: 'select', 'aria-label': 'Brand', onchange: (e) => set('brand')(e.target.value) },
            h('option', { value: '', text: 'All brands' }),
            brands.map((b) => h('option', { value: b, selected: b === f.brand, text: b })))
          : h('span'),
        f.status === 'used' ? h('span') : sortSelect(GIFT_SORTS, f.sort, set('sort'))),
    ];
  }
  const banks = [...new Set(all.map((c) => c.bank))].sort();
  const nets = [...new Set(all.map((c) => c.network))].filter((n) => n !== 'other');
  const sorts = { ...CARD_SORTS };
  if (tab === 'debit') delete sorts.limit;
  return [
    banks.length > 1 ? chipRow('Bank', [['', 'All banks'], ...banks.map((b) => [b, b, all.filter((c) => c.bank === b).length])], f.bank, set('bank')) : null,
    h('div', { class: 'tools-row' },
      nets.length > 1
        ? chipRow('Network', nets.map((n) => [n, NETWORKS[n].label]), f.network, set('network'))
        : h('span'),
      sortSelect(sorts, f.sort, set('sort'))),
  ];
}

// ---------------- list rendering ----------------

export function renderTab(S, tab) {
  const tools = renderTools(S, tab);
  const list = filtered(S, tab);
  const all = itemsOf(S, tab);
  if (!all.length) return { tools, list: emptyState(tab) };
  if (!list.length) {
    return {
      tools,
      list: h('div', { class: 'empty small' },
        h('p', { text: S.query[tab] ? `Nothing matches “${S.query[tab]}”.` : 'Nothing matches these filters.' }),
        h('button', {
          class: 'btn ghost', type: 'button', text: 'Clear search and filters',
          onclick: () => {
            S.query[tab] = '';
            Object.assign(S.filters[tab], tab === 'gift' ? { status: 'live', brand: '' } : { bank: '', network: '' });
            store.refresh();
          },
        })),
    };
  }
  const dense = S.meta.settings.density === 'list';
  if (tab === 'gift') {
    return { tools, list: h('div', { class: dense ? 'rows' : 'gift-grid' }, list.map((g) => (dense ? giftRow(S, g) : giftTile(S, g)))) };
  }
  return { tools, list: h('div', { class: dense ? 'rows' : 'card-grid' }, list.map((c) => (dense ? cardRow(S, c) : cardTile(S, c)))) };
}

function emptyState(tab) {
  const copy = {
    credit: ['No credit cards yet', 'Add a card and its number, expiry and CVV are one tap away whenever a checkout asks for them.'],
    debit: ['No debit cards yet', 'Keep debit card details here for online payments.'],
    gift: ['No gift cards yet', 'Add vouchers with their code, PIN and expiry date. The ones expiring soonest stay at the top.'],
  }[tab];
  return h('div', { class: 'empty' },
    h('div', { class: 'empty-art', 'aria-hidden': 'true' }, icon(TAB_META[tab].icon)),
    h('h2', { text: copy[0] }),
    h('p', { class: 'muted', text: copy[1] }),
    h('button', { class: 'btn primary', type: 'button', onclick: () => openEditor(tab) }, icon('plus'), TAB_META[tab].add));
}

function reveal(S, id) {
  S.revealed.add(id);
  setTimeout(() => { if (S.revealed.delete(id)) store.refresh(); }, REVEAL_MS);
}

function expiryBadge(days, prefix = '') {
  const u = urgency(days);
  if (u === 'ok' || u === 'none') return null;
  if (u === 'expired') return h('span', { class: 'badge expired', text: `${prefix}Expired` });
  return h('span', { class: `badge ${u}`, text: `${prefix}${expiryPhrase(days)}` });
}

// Card face, drawn like the physical card.
export function cardFace(c, revealed) {
  const b = bankInfo(c.bank);
  const netMark = networkMark(c.network, 'cc-mark');
  const expDays = cardExpiryDays(c.expiry);
  const numberText = !digits(c.number) ? '•••• •••• •••• ••••'
    : revealed ? formatNumber(c.number, c.network) : maskNumber(c.number, c.network);
  return h('div', { class: `cc ${c.kind}`, vars: { '--c1': b.c1, '--c2': b.c2 } },
    h('div', { class: 'cc-sheen', 'aria-hidden': 'true' }),
    h('div', { class: 'cc-top' },
      h('div', { class: 'cc-id' },
        h('span', { class: 'cc-bank', text: c.bank }),
        c.name || c.tier ? h('span', { class: 'cc-name', text: [c.name, c.tier].filter(Boolean).join(' · ') }) : null),
      h('span', { class: 'cc-kind', text: c.kind === 'credit' ? 'CREDIT' : 'DEBIT' })),
    h('div', { class: 'cc-mid' }, chip(), icon('wifi', 'cc-nfc')),
    h('div', { class: `cc-number ${revealed ? 'on' : ''}`, text: numberText }),
    h('div', { class: 'cc-bottom' },
      h('div', { class: 'cc-field grow' }, h('span', { class: 'cc-label', text: 'Card holder' }),
        h('span', { class: 'cc-val holder', text: c.holder || '—' })),
      h('div', { class: 'cc-field' }, h('span', { class: 'cc-label', text: 'Valid thru' }), h('span', { class: 'cc-val', text: c.expiry || '—' })),
      h('div', { class: 'cc-field' }, h('span', { class: 'cc-label', text: 'CVV' }), h('span', { class: 'cc-val', text: c.cvv ? (revealed ? c.cvv : '•'.repeat(c.cvv.length)) : '—' })),
      netMark ? h('div', { class: 'cc-net' }, netMark) : h('div', { class: 'cc-net text', text: NETWORKS[c.network]?.label || '' })),
    expiryBadge(expDays, ''));
}

function cardTile(S, c) {
  const revealed = S.revealed.has(c.id);
  const face = cardFace(c, revealed);
  const tile = h('article', { class: 'tile', 'aria-label': `${c.bank} ${c.name || ''} ending ${last4(c.number)}` },
    h('button', { class: 'tile-face', type: 'button', 'aria-label': `Open ${c.bank} ${c.name || 'card'} details`, onclick: () => openCard(S, c) }, face),
    h('div', { class: 'tile-actions' },
      h('button', { class: 'act primary', type: 'button', onclick: () => copyText(c.number, 'Card number') }, icon('copy'), h('span', { text: 'Number' })),
      c.expiry ? h('button', { class: 'act', type: 'button', onclick: () => copyText(c.expiry, 'Expiry') }, h('span', { class: 'act-mono', text: c.expiry })) : null,
      c.cvv ? h('button', { class: 'act', type: 'button', 'aria-label': 'Copy CVV', onclick: () => copyText(c.cvv, 'CVV') }, h('span', { text: 'CVV' })) : null,
      h('button', { class: 'act icon-only', type: 'button', 'aria-label': 'Copy all details', title: 'Copy all details', onclick: () => copyText(cardText(c), 'All details') }, icon('copyAll')),
      h('button', {
        class: 'act icon-only', type: 'button', 'aria-label': revealed ? 'Hide number' : 'Show number', 'aria-pressed': String(revealed),
        onclick: () => { if (revealed) S.revealed.delete(c.id); else reveal(S, c.id); store.refresh(); },
      }, icon(revealed ? 'eyeOff' : 'eye'))));
  return tile;
}

function cardRow(S, c) {
  const b = bankInfo(c.bank);
  const mark = networkMark(c.network, 'row-mark');
  return h('article', { class: 'row-item' },
    h('button', { class: 'row-main', type: 'button', onclick: () => openCard(S, c) },
      h('span', { class: 'row-swatch', vars: { '--c1': b.c1, '--c2': b.c2 } }, mark),
      h('span', { class: 'row-text' },
        h('span', { class: 'row-title', text: `${c.bank}${c.name ? ' · ' + c.name : ''}` }),
        h('span', { class: 'row-sub' }, h('span', { class: 'mono', text: `•••• ${last4(c.number)}` }), c.expiry ? ` · ${c.expiry}` : '',
          c.kind === 'credit' && c.limit ? ` · ${formatINR(c.limit)}` : '')),
      expiryBadge(cardExpiryDays(c.expiry))),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Copy card number', onclick: () => copyText(c.number, 'Card number') }, icon('copy')));
}

function giftDays(g) { return dateDays(g.expiry); }

function giftPill(g) {
  if (g.used) return h('span', { class: 'pill used' }, icon('check'), `Used${g.usedAt ? ' ' + new Date(g.usedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}`);
  const d = giftDays(g);
  return h('span', { class: `pill ${urgency(d)}` }, icon('clock'), expiryPhrase(d));
}

function brandAvatar(brand) {
  const b = bankInfo(brand);
  const initials = brand.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  return h('span', { class: 'avatar', vars: { '--c1': b.c1, '--c2': b.c2 }, 'aria-hidden': 'true', text: initials });
}

function maskCode(code) {
  const s = code.replace(/\s/g, '');
  if (s.length <= 4) return s;
  return '•'.repeat(Math.min(s.length - 4, 8)) + s.slice(-4);
}

function giftTile(S, g) {
  const revealed = S.revealed.has(g.id);
  const state = giftState(g);
  return h('article', { class: `gift ${state} u-${g.used ? 'used' : urgency(giftDays(g))}` },
    h('div', { class: 'gift-top' }, giftPill(g),
      h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Gift card details', onclick: () => openGift(S, g) }, icon('more'))),
    h('button', { class: 'gift-body', type: 'button', onclick: () => openGift(S, g), 'aria-label': `Open ${g.brand} gift card` },
      brandAvatar(g.brand),
      h('span', { class: 'gift-text' },
        h('span', { class: 'gift-brand', text: g.brand }),
        h('span', { class: 'gift-amount', text: g.amount ? formatINR(g.amount) : 'Amount not set' }))),
    h('div', { class: 'gift-perf', 'aria-hidden': 'true' }),
    h('div', { class: 'gift-codes' },
      h('button', { class: 'code-btn', type: 'button', onclick: () => copyText(g.code, 'Voucher code'), 'aria-label': 'Copy voucher code' },
        h('span', { class: 'code-label', text: 'Code' }),
        h('span', { class: 'code-val mono', text: revealed ? g.code : maskCode(g.code) }), icon('copy')),
      g.pin ? h('button', { class: 'code-btn', type: 'button', onclick: () => copyText(g.pin, 'PIN'), 'aria-label': 'Copy voucher PIN' },
        h('span', { class: 'code-label', text: 'PIN' }),
        h('span', { class: 'code-val mono', text: revealed ? g.pin : '•'.repeat(Math.min(g.pin.length, 6)) }), icon('copy')) : null),
    h('div', { class: 'gift-actions' },
      h('button', {
        class: 'act icon-only', type: 'button', 'aria-label': revealed ? 'Hide code' : 'Show code', 'aria-pressed': String(revealed),
        onclick: () => { if (revealed) S.revealed.delete(g.id); else reveal(S, g.id); store.refresh(); },
      }, icon(revealed ? 'eyeOff' : 'eye')),
      h('button', { class: 'act', type: 'button', onclick: () => copyText(giftText(g), 'Gift card details') }, icon('copyAll'), h('span', { text: 'Copy all' })),
      h('button', { class: `act ${g.used ? '' : 'ok'}`, type: 'button', onclick: () => toggleUsed(g) },
        icon(g.used ? 'undo' : 'check'), h('span', { text: g.used ? 'Not used' : 'Mark used' }))));
}

function giftRow(S, g) {
  return h('article', { class: `row-item ${g.used ? 'dim' : ''}` },
    h('button', { class: 'row-main', type: 'button', onclick: () => openGift(S, g) },
      brandAvatar(g.brand),
      h('span', { class: 'row-text' },
        h('span', { class: 'row-title', text: `${g.brand}${g.amount ? ' · ' + formatINR(g.amount) : ''}` }),
        h('span', { class: 'row-sub mono', text: maskCode(g.code) })),
      giftPill(g)),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Copy voucher code', onclick: () => copyText(g.code, 'Voucher code') }, icon('copy')));
}

async function toggleUsed(g) {
  const next = { ...g, used: !g.used, usedAt: g.used ? 0 : Date.now() };
  await store.upsert(next);
  store.refresh();
  toast(next.used ? `${g.brand} marked as used` : `${g.brand} moved back to active`, {
    action: { label: 'Undo', fn: async () => { await store.upsert({ ...g }); store.refresh(); } },
    timeout: 5000,
  });
}

// ---------------- detail sheets ----------------

function copyRow(label, value, display, copyLabel) {
  return h('div', { class: 'd-row' },
    h('span', { class: 'd-label', text: label }),
    h('span', { class: 'd-val mono', text: display ?? value }),
    value ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Copy ${copyLabel || label}`, onclick: () => copyText(value, copyLabel || label) }, icon('copy')) : h('span'));
}

function infoRow(label, value) {
  if (!value) return null;
  return h('div', { class: 'd-row' }, h('span', { class: 'd-label', text: label }), h('span', { class: 'd-val', text: value }), h('span'));
}

async function shareText(title, text) {
  if (navigator.share) {
    try { await navigator.share({ title, text }); return; } catch (e) { if (e?.name === 'AbortError') return; }
  }
  copyText(text, 'Details');
}

function deleteItem(item, label) {
  return async () => {
    const ok = await confirmSheet({ title: `Delete ${label}?`, message: 'You can undo this for a few seconds afterwards.', confirm: 'Delete', danger: true });
    if (!ok) return;
    const removed = await store.remove(item.id);
    store.refresh();
    toast(`${label} deleted`, { timeout: 6000, action: { label: 'Undo', fn: async () => { await store.restore(removed); store.refresh(); } } });
  };
}

function openCard(S, c) {
  const S2 = S;
  const groupMates = c.limitGroup ? S2.vault.items.filter((x) => x.id !== c.id && x.limitGroup === c.limitGroup) : [];
  const days = cardExpiryDays(c.expiry);
  const s = sheet({
    title: `${c.bank}${c.name ? ' · ' + c.name : ''}`,
    body: h('div', { class: 'detail' },
      h('div', { class: 'detail-face' }, cardFace(c, true)),
      h('div', { class: 'd-list' },
        copyRow('Number', c.number, formatNumber(c.number, c.network), 'Card number'),
        copyRow('Expiry', c.expiry, c.expiry || '—'),
        copyRow('CVV', c.cvv, c.cvv || '—'),
        copyRow('Name on card', c.holder, c.holder || '—'),
        c.kind === 'credit' && c.limit ? infoRow('Credit limit', `${formatINR(c.limit)}${groupMates.length ? ` · shared with ${groupMates.map((m) => m.name || last4(m.number)).join(', ')}` : ''}`) : null,
        infoRow('Network', `${NETWORKS[c.network]?.label || 'Unknown'}${c.tier ? ' ' + c.tier : ''}`),
        days !== null ? infoRow('Validity', expiryPhrase(days)) : null,
        infoRow('Notes', c.notes)),
      h('div', { class: 'd-actions' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => copyText(cardText(c), 'All details') }, icon('copyAll'), 'Copy all'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => shareText(`${c.bank} ${c.name}`, cardText(c)) }, icon('share'), 'Share'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { s.close(); openEditor(c.kind, c); } }, icon('edit'), 'Edit'),
        h('button', { class: 'btn ghost danger-text', type: 'button', onclick: () => { s.close(); deleteItem(c, 'Card')(); } }, icon('trash'), 'Delete'))),
  });
}

function openGift(S, g) {
  const days = giftDays(g);
  const s = sheet({
    title: `${g.brand} gift card`,
    body: h('div', { class: 'detail' },
      h('div', { class: 'gift-hero' }, giftPill(g), brandAvatar(g.brand),
        h('div', { class: 'gift-hero-amt', text: g.amount ? formatINR(g.amount) : '—' })),
      h('div', { class: 'd-list' },
        copyRow('Voucher code', g.code, g.code),
        g.pin ? copyRow('PIN', g.pin, g.pin) : null,
        infoRow('Valid till', g.expiry ? `${new Date(g.expiry + 'T00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} (${expiryPhrase(days).toLowerCase()})` : 'No expiry date'),
        g.used ? infoRow('Used on', new Date(g.usedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })) : null,
        infoRow('Notes', g.notes)),
      h('div', { class: 'd-actions' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => copyText(giftText(g), 'Gift card details') }, icon('copyAll'), 'Copy all'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { s.close(); toggleUsed(g); } }, icon(g.used ? 'undo' : 'check'), g.used ? 'Not used' : 'Mark used'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => shareText(`${g.brand} gift card`, giftText(g)) }, icon('share'), 'Share'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { s.close(); openEditor('gift', g); } }, icon('edit'), 'Edit'),
        h('button', { class: 'btn ghost danger-text', type: 'button', onclick: () => { s.close(); deleteItem(g, 'Gift card')(); } }, icon('trash'), 'Delete'))),
  });
}

// ---------------- forms ----------------

export function openEditor(kind, existing = null) {
  if (kind === 'gift') return giftForm(existing);
  if (kind === 'credit' || kind === 'debit') return cardForm(kind, existing);
}

function field(label, input, hint, err) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label', text: label }), input, hint || null, err || null);
}

function datalist(id, values) {
  return h('datalist', { id }, values.map((v) => h('option', { value: v })));
}

function cardForm(kind, existing) {
  const S = store.state;
  const c = existing ? { ...existing } : {
    id: newId(), kind, bank: '', name: '', tier: '', network: 'other', holder: S.vault.prefs.holder || '',
    number: '', expiry: '', cvv: '', limit: '', limitGroup: '', notes: '', createdAt: Date.now(),
  };
  let netOverride = existing ? existing.network : '';
  const listId = `dl-${Math.random().toString(36).slice(2)}`;

  const numberIn = h('input', { class: 'field-input mono', inputmode: 'numeric', autocomplete: 'off', placeholder: '1234 5678 9012 3456', 'aria-label': 'Card number', value: formatNumber(c.number, c.network) });
  const numberHint = h('span', { class: 'field-hint' });
  const bankIn = h('input', { class: 'field-input', list: `${listId}-banks`, autocomplete: 'off', placeholder: 'Start typing, e.g. HDFC', value: c.bank });
  const nameIn = h('input', { class: 'field-input', list: `${listId}-cards`, autocomplete: 'off', placeholder: 'e.g. Regalia Gold', value: c.name });
  const cardsList = datalist(`${listId}-cards`, []);
  const netSel = h('select', { class: 'select', 'aria-label': 'Network' },
    h('option', { value: '', text: 'Detect from number' }),
    Object.values(NETWORKS).filter((n) => n.id !== 'other').map((n) => h('option', { value: n.id, text: n.label, selected: n.id === netOverride })));
  const tierIn = h('input', { class: 'field-input', autocomplete: 'off', placeholder: 'e.g. Signature', value: c.tier });
  const tierChips = h('div', { class: 'chips small' });
  const holderIn = h('input', { class: 'field-input caps', autocomplete: 'off', autocapitalize: 'characters', placeholder: 'As printed on the card', value: c.holder });
  const expIn = h('input', { class: 'field-input mono', inputmode: 'numeric', autocomplete: 'off', placeholder: 'MM/YY', maxlength: 5, value: c.expiry });
  const cvvIn = h('input', { class: 'field-input mono', inputmode: 'numeric', autocomplete: 'off', placeholder: '123', maxlength: 4, value: c.cvv });
  const limitIn = h('input', { class: 'field-input mono', inputmode: 'numeric', autocomplete: 'off', placeholder: 'e.g. 3,00,000', value: groupIndian(c.limit) });
  const shareBox = h('div', { class: 'share-box' });
  const notesIn = h('textarea', { class: 'field-input', rows: 2, placeholder: 'Optional: billing date, reward notes…' });
  notesIn.value = c.notes || '';
  const err = h('p', { class: 'field-err', role: 'alert' });
  const preview = h('div', { class: 'form-preview' });

  const net = () => netOverride || detectNetwork(numberIn.value) || 'other';

  const paintTiers = () => {
    const tiers = TIERS[net()] || [];
    tierChips.replaceChildren(...tiers.map((t) => h('button', {
      class: `chip ${tierIn.value === t ? 'on' : ''}`, type: 'button', text: t,
      onclick: () => { tierIn.value = tierIn.value === t ? '' : t; update(); },
    })));
  };

  const paintCardNames = () => {
    const info = bankInfo(bankIn.value);
    const names = info.cards.filter((n) => (kind === 'debit' ? /debit/i.test(n) || info.cards.every((x) => !/debit/i.test(x)) : !/debit/i.test(n)));
    cardsList.replaceChildren(...(names.length ? names : info.cards).map((v) => h('option', { value: v })));
  };

  const paintShare = () => {
    if (kind !== 'credit') return;
    const mates = S.vault.items.filter((x) => x.kind === 'credit' && x.id !== c.id && x.bank && x.bank.toLowerCase() === bankIn.value.trim().toLowerCase());
    if (!mates.length) { shareBox.replaceChildren(h('span', { class: 'field-hint', text: 'Cards from the same bank that share one limit can be linked here.' })); return; }
    shareBox.replaceChildren(h('span', { class: 'field-hint', text: 'Shares this limit with:' }),
      ...mates.map((m) => h('label', { class: 'check' },
        h('input', { type: 'checkbox', value: m.id, checked: !!(c.limitGroup && m.limitGroup === c.limitGroup) }),
        h('span', { text: `${m.name || 'Card'} •••• ${last4(m.number)}${m.limit ? ' (' + formatINR(m.limit) + ')' : ''}` }))));
  };

  const update = () => {
    const n = digits(numberIn.value);
    const id = net();
    const max = maxLength(id);
    const clipped = n.slice(0, max);
    const formatted = formatNumber(clipped, id);
    if (numberIn.value !== formatted) {
      numberIn.value = formatted;
    }
    const lens = (NETWORKS[id] || NETWORKS.other).lengths;
    if (!clipped) numberHint.textContent = 'Visa, Mastercard, RuPay, Amex and more are detected as you type.';
    else if (lens.includes(clipped.length)) {
      numberHint.textContent = luhnValid(clipped) ? `${NETWORKS[id].label} · number looks valid` : `${NETWORKS[id].label} · check the digits, this number fails the card checksum`;
    } else numberHint.textContent = `${NETWORKS[id].label} · ${clipped.length} digits`;
    numberHint.classList.toggle('warn', lens.includes(clipped.length) && !luhnValid(clipped));
    cvvIn.maxLength = NETWORKS[id]?.cvv || 3;
    paintTiers();
    const draft = { ...c, bank: bankIn.value.trim() || 'Your bank', name: nameIn.value.trim(), tier: tierIn.value.trim(), network: id, holder: holderIn.value.trim().toUpperCase(), number: clipped, expiry: expIn.value, cvv: cvvIn.value };
    preview.replaceChildren(cardFace(draft, true));
  };

  let lastLen = digits(numberIn.value).length;
  numberIn.addEventListener('input', () => {
    update();
    const n = digits(numberIn.value);
    const grew = n.length > lastLen;
    lastLen = n.length;
    const lens = (NETWORKS[net()] || NETWORKS.other).lengths;
    // Jump to expiry when typing completes the number: a valid length that passes the checksum.
    if (grew && n.length >= 14 && net() !== 'other' && lens.includes(n.length) && luhnValid(n)) expIn.focus();
  });
  netSel.addEventListener('change', () => { netOverride = netSel.value; update(); });
  bankIn.addEventListener('input', () => { paintCardNames(); paintShare(); update(); });
  bankIn.addEventListener('change', () => {
    const hit = BANKS.find((b) => b.name.toLowerCase() === bankIn.value.trim().toLowerCase());
    if (hit) bankIn.value = hit.name;
    paintCardNames(); paintShare(); update();
  });
  [nameIn, tierIn, holderIn].forEach((el) => el.addEventListener('input', update));
  expIn.addEventListener('input', (e) => {
    if (e.inputType && e.inputType.startsWith('delete')) { update(); return; }
    expIn.value = formatExpiryInput(expIn.value);
    update();
    if (expIn.value.length === 5 && parseCardExpiry(expIn.value)) cvvIn.focus();
  });
  cvvIn.addEventListener('input', () => {
    cvvIn.value = digits(cvvIn.value).slice(0, cvvIn.maxLength);
    update();
    if (cvvIn.value.length === cvvIn.maxLength) (kind === 'credit' ? limitIn : holderIn).focus();
  });
  limitIn.addEventListener('input', () => { limitIn.value = groupIndian(limitIn.value); });

  const save = h('button', { class: 'btn primary', type: 'submit', text: existing ? 'Save changes' : 'Save card' });
  const form = h('form', { class: 'form', novalidate: true },
    preview,
    field('Card number', numberIn, numberHint),
    h('div', { class: 'grid2' },
      field('Expiry', expIn),
      field(`CVV${(NETWORKS[net()]?.cvv || 3) === 4 ? ' (4 digits)' : ''}`, cvvIn)),
    field('Bank', bankIn),
    datalist(`${listId}-banks`, BANKS.map((b) => b.name)),
    field('Card name', nameIn, h('span', { class: 'field-hint', text: 'Suggestions appear for the bank you pick.' })),
    cardsList,
    h('div', { class: 'grid2' }, field('Network', netSel), field('Variant', tierIn)),
    tierChips,
    field('Name on card', holderIn),
    kind === 'credit' ? field('Credit limit (₹, optional)', limitIn) : null,
    kind === 'credit' ? shareBox : null,
    field('Notes', notesIn),
    err,
    h('div', { class: 'row-end sticky-actions' }, save));

  const s = sheet({ title: existing ? 'Edit card' : TAB_META[kind].add, body: form, wide: true });
  paintCardNames(); paintShare(); update();
  if (!existing) numberIn.focus();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const number = digits(numberIn.value);
    const bank = bankIn.value.trim();
    const expiry = expIn.value.trim();
    const cvv = digits(cvvIn.value);
    const id = net();
    const fail = (m, el) => { err.textContent = m; el?.focus(); };
    if (number.length < 12) return fail('Enter the full card number.', numberIn);
    if (!bank) return fail('Enter the bank name.', bankIn);
    if (expiry && !parseCardExpiry(expiry)) return fail('Expiry should look like 08/29.', expIn);
    if (cvv && cvv.length !== (NETWORKS[id]?.cvv || 3) && !(cvv.length === 3 && id === 'other')) {
      return fail(`CVV for ${NETWORKS[id]?.label || 'this card'} has ${NETWORKS[id]?.cvv || 3} digits.`, cvvIn);
    }
    const dup = S.vault.items.find((x) => x.kind === kind && x.id !== c.id && x.number === number);
    if (dup) return fail(`This number is already saved as ${dup.bank} ${dup.name}.`, numberIn);
    const limit = kind === 'credit' ? digits(limitIn.value) : '';

    const item = {
      ...c, kind, number, bank, expiry, cvv, network: id,
      name: nameIn.value.trim(), tier: tierIn.value.trim(), holder: holderIn.value.trim().toUpperCase(),
      limit, notes: notesIn.value.trim(),
    };

    // Shared limit: one group id for this card and every ticked same-bank card.
    const changed = [item];
    if (kind === 'credit') {
      const ticked = [...shareBox.querySelectorAll('input[type=checkbox]:checked')].map((x) => x.value);
      const oldGroup = c.limitGroup;
      if (ticked.length) {
        const mates = S.vault.items.filter((x) => ticked.includes(x.id));
        const gid = oldGroup || mates.find((m) => m.limitGroup)?.limitGroup || newId();
        item.limitGroup = gid;
        if (!limit) item.limit = mates.find((m) => m.limit)?.limit || '';
        for (const m of mates) changed.push({ ...m, limitGroup: gid, limit: item.limit || m.limit });
      } else {
        item.limitGroup = '';
      }
      // Cards that were in the old group but are no longer ticked leave it.
      if (oldGroup) {
        for (const x of S.vault.items) {
          if (x.id !== c.id && !ticked.includes(x.id) && x.limitGroup === oldGroup) changed.push({ ...x, limitGroup: '' });
        }
      }
    }

    save.disabled = true;
    await store.upsertMany(dedupe(changed));
    await store.setHolder(item.holder);
    s.close();
    store.refresh();
    toast(existing ? 'Card updated' : 'Card saved');
  });
}

function dedupe(list) {
  const m = new Map();
  for (const x of list) m.set(x.id, { ...(m.get(x.id) || {}), ...x });
  return [...m.values()];
}

function giftForm(existing) {
  const S = store.state;
  const g = existing ? { ...existing } : { id: newId(), kind: 'gift', brand: '', amount: 0, code: '', pin: '', expiry: '', used: false, usedAt: 0, notes: '', createdAt: Date.now() };
  const listId = `dl-${Math.random().toString(36).slice(2)}`;
  const brandIn = h('input', { class: 'field-input', list: `${listId}-brands`, autocomplete: 'off', placeholder: 'e.g. Amazon, Myntra, Swiggy', value: g.brand });
  const amountIn = h('input', { class: 'field-input mono', inputmode: 'numeric', autocomplete: 'off', placeholder: 'e.g. 1,000', value: g.amount ? groupIndian(g.amount) : '' });
  const codeIn = h('input', { class: 'field-input mono', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'Voucher / claim code', value: g.code });
  const pinIn = h('input', { class: 'field-input mono', autocomplete: 'off', spellcheck: 'false', placeholder: 'Only if the voucher has one', value: g.pin });
  const expIn = h('input', { class: 'field-input', type: 'date', value: g.expiry, min: existing ? null : today() });
  const noExp = h('input', { type: 'checkbox', checked: !!existing && !g.expiry });
  const expHint = h('span', { class: 'field-hint' });
  const notesIn = h('textarea', { class: 'field-input', rows: 2, placeholder: 'Optional: where it came from, terms…' });
  notesIn.value = g.notes || '';
  const err = h('p', { class: 'field-err', role: 'alert' });

  const quick = h('div', { class: 'chips small' },
    [['+1 month', 1], ['+3 months', 3], ['+6 months', 6], ['+1 year', 12]].map(([l, m]) => h('button', {
      class: 'chip', type: 'button', text: l,
      onclick: () => { const d = new Date(); d.setMonth(d.getMonth() + m); expIn.value = today(d); noExp.checked = false; paint(); },
    })));
  const amountChips = h('div', { class: 'chips small' },
    [250, 500, 1000, 2000, 5000].map((a) => h('button', { class: 'chip', type: 'button', text: formatINR(a), onclick: () => { amountIn.value = groupIndian(a); } })));

  const paint = () => {
    expIn.disabled = noExp.checked;
    if (noExp.checked) { expHint.textContent = 'Shown as “No expiry”.'; expHint.className = 'field-hint'; return; }
    const d = dateDays(expIn.value);
    expHint.textContent = d === null ? 'Pick the last date the voucher can be used.' : expiryPhrase(d);
    expHint.className = `field-hint u-${urgency(d)}`;
  };
  expIn.addEventListener('input', paint);
  noExp.addEventListener('change', paint);
  amountIn.addEventListener('input', () => { amountIn.value = groupIndian(amountIn.value); });

  const save = h('button', { class: 'btn primary', type: 'submit', text: existing ? 'Save changes' : 'Save gift card' });
  const form = h('form', { class: 'form', novalidate: true },
    field('Company', brandIn),
    datalist(`${listId}-brands`, [...new Set([...S.vault.items.filter((x) => x.kind === 'gift').map((x) => x.brand), ...GIFT_BRANDS])]),
    field('Amount (₹)', amountIn),
    amountChips,
    field('Voucher code', codeIn),
    field('PIN (optional)', pinIn),
    field('Expiry date', expIn, expHint),
    h('div', { class: 'row-start wrap' }, quick, h('label', { class: 'check' }, noExp, h('span', { text: 'No expiry' }))),
    field('Notes', notesIn),
    err,
    h('div', { class: 'row-end sticky-actions' }, save));

  const s = sheet({ title: existing ? 'Edit gift card' : 'Add gift card', body: form, wide: true });
  paint();
  if (!existing) brandIn.focus();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const brand = brandIn.value.trim();
    const code = codeIn.value.trim();
    const amount = Number(digits(amountIn.value)) || 0;
    const fail = (m, el) => { err.textContent = m; el?.focus(); };
    if (!brand) return fail('Enter the company name.', brandIn);
    if (!amount) return fail('Enter the amount.', amountIn);
    if (!code) return fail('Enter the voucher code.', codeIn);
    if (!noExp.checked && !expIn.value) return fail('Pick an expiry date, or tick “No expiry”.', expIn);
    const dup = S.vault.items.find((x) => x.kind === 'gift' && x.id !== g.id && x.brand.toLowerCase() === brand.toLowerCase() && x.code.replace(/\s/g, '').toLowerCase() === code.replace(/\s/g, '').toLowerCase());
    if (dup) return fail('This voucher code is already saved.', codeIn);
    save.disabled = true;
    await store.upsert({ ...g, brand, amount, code, pin: pinIn.value.trim(), expiry: noExp.checked ? '' : expIn.value, notes: notesIn.value.trim() });
    s.close();
    store.refresh();
    toast(existing ? 'Gift card updated' : 'Gift card saved');
  });
}
