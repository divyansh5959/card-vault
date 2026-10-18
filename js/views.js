// Card and gift-card lists, detail sheets and add/edit forms.

import { h, toast, sheet, copyText, confirmSheet, today, combo, chainFields, firstEmpty } from './ui.js';
import { icon, networkMark, chip } from './icons.js';
import {
  NETWORKS, TIERS, detectNetwork, luhnValid, maxLength, formatNumber, maskNumber, last4, digits,
  formatExpiryInput, parseCardExpiry, cardExpiryDays, dateDays, expiryPhrase, urgency, giftState,
  formatINR, groupIndian, totalLimit, matchesQuery, cardText, giftText,
} from './cards.js';
import { BANKS, bankInfo, GIFT_BRANDS } from './data.js';
import { newId } from './store.js';
import { store } from './app.js';
import {
  facetsFor, applyFacets, facetCounts, activePills, removePill, clearFacets, toggleValue,
  sortItems, CARD_SORTS, GIFT_SORTS,
} from './filters.js';

export const TAB_META = {
  credit: { title: 'Credit cards', short: 'Credit', icon: 'credit', add: 'Add credit card', placeholder: 'Search bank, card, last 4 digits…' },
  debit: { title: 'Debit cards', short: 'Debit', icon: 'debit', add: 'Add debit card', placeholder: 'Search bank, card, last 4 digits…' },
  gift: { title: 'Gift cards', short: 'Gift', icon: 'gift', add: 'Add gift card', placeholder: 'Search brand, code, amount…' },
  settings: { title: 'Settings', short: 'Settings', icon: 'settings' },
};

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
  const searched = itemsOf(S, tab).filter((x) => matchesQuery(x, S.query[tab]));
  return sortItems(applyFacets(searched, tab, f), tab, f);
}

const setFilters = (tab, next) => store.setFilters(tab, next);

function fchip(label, on, onclick, count, extraCls = '') {
  const dead = count === 0 && !on;
  return h('button', {
    class: `chip ${on ? 'on' : ''} ${dead ? 'dead' : ''} ${extraCls}`.trim(), type: 'button', 'aria-pressed': String(on), onclick,
  }, label, count !== undefined ? h('span', { class: 'chip-n', text: String(count) }) : null);
}

// One-tap chips shown above the list: the most useful facet values for the tab.
function quickChips(S, tab, items, counts) {
  const f = S.filters[tab];
  const flip = (key, value) => setFilters(tab, toggleValue(f, key, value));
  const out = [];
  if (tab === 'gift') {
    for (const [v, l] of facetsFor('gift')[0].options(items)) {
      out.push(fchip(l, f.status === v, () => setFilters(tab, { ...f, status: v }), counts.status[v], 'status'));
    }
    return out;
  }
  if (items.some((c) => c.fav)) out.push(fchip('★ Favourites', f.fav, () => flip('fav'), counts.fav.true));
  const soon = counts.validity.soon;
  if (soon || f.validity === 'soon') out.push(fchip('Expiring soon', f.validity === 'soon', () => flip('validity', 'soon'), soon));
  for (const [v, l] of facetsFor(tab).find((x) => x.key === 'networks').options(items)) {
    out.push(fchip(l, f.networks.includes(v), () => flip('networks', v), counts.networks[v]));
  }
  return out;
}

function renderTools(S, tab) {
  const f = S.filters[tab];
  const all = itemsOf(S, tab);
  if (!all.length) return [];
  const searched = all.filter((x) => matchesQuery(x, S.query[tab]));
  const counts = facetCounts(searched, tab, f);
  const pills = activePills(tab, f, all);
  const shown = applyFacets(searched, tab, f).length;
  const sorts = { ...(tab === 'gift' ? GIFT_SORTS : CARD_SORTS) };
  if (tab === 'debit') delete sorts.limit;

  const filterBtn = h('button', { class: `btn small ghost filter-btn ${pills.length ? 'active' : ''}`, type: 'button', onclick: () => openFilterSheet(S, tab) },
    icon('filter'), 'Filters', pills.length ? h('span', { class: 'badge-n', text: String(pills.length) }) : null);
  const sortSel = h('label', { class: 'sort' }, h('span', { class: 'sr-only', text: 'Sort' }),
    h('select', { class: 'select', 'aria-label': 'Sort', disabled: tab === 'gift' && f.status === 'used', onchange: (e) => setFilters(tab, { ...f, sort: e.target.value }) },
      Object.entries(sorts).map(([v, l]) => h('option', { value: v, selected: v === f.sort, text: l }))));

  const rows = [
    h('div', { class: 'tools-row' }, filterBtn, sortSel),
    h('div', { class: 'chips quick', role: 'group', 'aria-label': 'Quick filters' }, quickChips(S, tab, all, counts)),
  ];
  if (pills.length) {
    rows.push(h('div', { class: 'pills' },
      pills.map((p) => h('button', {
        class: 'pill-x', type: 'button', 'aria-label': `Remove filter ${p.label}`,
        onclick: () => setFilters(tab, removePill(tab, f, p)),
      }, h('span', { text: p.label }), icon('close'))),
      h('button', { class: 'link-btn small', type: 'button', text: 'Clear all', onclick: () => setFilters(tab, clearFacets(tab, f)) })));
  }
  if (pills.length || S.query[tab]) {
    rows.push(h('p', { class: 'result-count', 'aria-live': 'polite', text: `Showing ${shown} of ${all.length}` }));
  }
  return rows;
}

function openFilterSheet(S, tab) {
  const all = itemsOf(S, tab);
  const searched = () => all.filter((x) => matchesQuery(x, S.query[tab]));
  let draft = { ...S.filters[tab] };
  const body = h('div', { class: 'filter-sheet' });
  const showBtn = h('button', { class: 'btn primary', type: 'button' });
  const clearBtn = h('button', { class: 'btn ghost', type: 'button', text: 'Clear all', onclick: () => { draft = clearFacets(tab, draft); paint(); } });

  const paint = () => {
    const items = searched();
    const counts = facetCounts(items, tab, draft);
    const groups = facetsFor(tab).map((fc) => {
      if (fc.bool) {
        return h('label', { class: 'f-switch' },
          h('span', { class: 'f-switch-text' }, fc.label, h('span', { class: 'chip-n', text: String(counts[fc.key].true) })),
          h('input', { type: 'checkbox', checked: !!draft[fc.key], onchange: () => { draft = toggleValue(draft, fc.key); paint(); } }));
      }
      const opts = fc.options(all);
      if (!opts.length) return null;
      return h('section', { class: 'f-group' },
        h('h3', { class: 'f-head' }, fc.label, fc.multi ? h('span', { class: 'f-hint', text: 'any of' }) : null),
        h('div', { class: 'chips wrap' }, opts.map(([v, l]) => {
          const on = fc.multi ? draft[fc.key].includes(v) : draft[fc.key] === v;
          return fchip(l, on, () => { draft = toggleValue(draft, fc.key, v); paint(); }, counts[fc.key][v]);
        })));
    });
    const n = applyFacets(items, tab, draft).length;
    showBtn.textContent = n === 1 ? 'Show 1 result' : `Show ${n} results`;
    showBtn.disabled = n === 0;
    body.replaceChildren(...groups.filter(Boolean), h('div', { class: 'row-end sticky-actions' }, clearBtn, showBtn));
  };
  const s = sheet({ title: `Filter ${TAB_META[tab].title.toLowerCase()}`, body, wide: true });
  showBtn.addEventListener('click', () => { setFilters(tab, draft); s.close(); });
  paint();
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
            setFilters(tab, clearFacets(tab, S.filters[tab]));
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
      h('span', { class: 'cc-kind' }, c.fav ? h('span', { class: 'cc-star', 'aria-label': 'Favourite', text: '★' }) : null, c.kind === 'credit' ? 'CREDIT' : 'DEBIT')),
    h('div', { class: 'cc-mid' }, chip(), icon('wifi', 'cc-nfc')),
    h('div', { class: `cc-number ${revealed ? 'on' : ''}`, text: numberText }),
    h('div', { class: 'cc-bottom' },
      h('div', { class: 'cc-field grow' }, h('span', { class: 'cc-label', text: 'Card holder' }),
        h('span', { class: 'cc-val holder', text: c.holder || '—' })),
      h('div', { class: 'cc-field' }, h('span', { class: 'cc-label', text: 'Valid thru' }), h('span', { class: 'cc-val', text: c.expiry || '—' })),
      h('div', { class: 'cc-field' }, h('span', { class: 'cc-label', text: 'CVV' }), h('span', { class: 'cc-val', text: c.cvv ? (revealed ? c.cvv : '•'.repeat(c.cvv.length)) : '—' })),
      h('div', { class: 'cc-net' }, netMark || h('span', { class: 'cc-net-text', text: NETWORKS[c.network]?.label || '' }),
        c.tier ? h('span', { class: 'cc-tier', text: c.tier }) : null)),
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

function favButton(item, cls = 'act icon-only') {
  return h('button', {
    class: `${cls} fav ${item.fav ? 'on' : ''}`, type: 'button', 'aria-pressed': String(!!item.fav),
    'aria-label': item.fav ? 'Remove from favourites' : 'Add to favourites',
    onclick: async () => { await store.upsert({ ...item, fav: !item.fav }); store.refresh(); },
  }, icon('star'));
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
      h('div', { class: 'gift-top-actions' },
        favButton(g, 'icon-btn small'),
        h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Gift card details', onclick: () => openGift(S, g) }, icon('more')))),
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
      !c.tier && (TIERS[c.network] || []).length ? h('div', { class: 'variant-ask' },
        h('p', { class: 'muted small', text: `Which ${NETWORKS[c.network].label} variant is this card? It is printed on the card, usually near the logo.` }),
        h('div', { class: 'chips small wrap' }, TIERS[c.network].map((t) => h('button', {
          class: 'chip', type: 'button', text: t,
          onclick: async () => { await store.upsert({ ...c, tier: t }); s.close(); store.refresh(); toast(`Variant set to ${t}`); },
        })))) : null,
      h('div', { class: 'd-actions' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => copyText(cardText(c), 'All details') }, icon('copyAll'), 'Copy all'),
        h('button', { class: `btn ghost fav ${c.fav ? 'on' : ''}`, type: 'button', 'aria-pressed': String(!!c.fav), onclick: async () => { await store.upsert({ ...c, fav: !c.fav }); s.close(); store.refresh(); toast(c.fav ? 'Removed from favourites' : 'Added to favourites'); } }, icon('star'), 'Favourite'),
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
        h('button', { class: `btn ghost fav ${g.fav ? 'on' : ''}`, type: 'button', 'aria-pressed': String(!!g.fav), onclick: async () => { await store.upsert({ ...g, fav: !g.fav }); s.close(); store.refresh(); toast(g.fav ? 'Removed from favourites' : 'Added to favourites'); } }, icon('star'), 'Favourite'),
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

function fieldDiv(label, control, hint) {
  const input = control.querySelector('input');
  const lab = h('label', { class: 'field-label', for: input.id || (input.id = `f-${Math.random().toString(36).slice(2)}`), text: label });
  return h('div', { class: 'field' }, lab, control, hint || null);
}

// Card names offered for a bank: credit products in the Credit tab, debit ones in Debit.
function cardNamesFor(bank, kind) {
  const info = bankInfo(bank);
  const debit = info.cards.filter((n) => /debit/i.test(n));
  const credit = info.cards.filter((n) => !/debit/i.test(n));
  return kind === 'debit' ? (debit.length ? debit : info.cards) : (credit.length ? credit : info.cards);
}

// A card already saved from the same number range (same first 6+ digits):
// its bank, name and variant are almost certainly the same.
function sameRangeCard(items, number, selfId) {
  const n = digits(number);
  if (n.length < 6) return null;
  let best = null;
  let bestLen = 5;
  for (const it of items) {
    if (it.kind === 'gift' || it.id === selfId) continue;
    let k = 0;
    while (k < 8 && k < n.length && it.number[k] === n[k]) k++;
    if (k > bestLen) { best = it; bestLen = k; }
  }
  return best;
}

function cardForm(kind, existing) {
  const S = store.state;
  const c = existing ? { ...existing } : {
    id: newId(), kind, bank: '', name: '', tier: '', network: 'other', holder: S.vault.prefs.holder || '',
    number: '', expiry: '', cvv: '', limit: '', limitGroup: '', notes: '', createdAt: Date.now(),
  };
  let netOverride = existing ? existing.network : '';

  const numberIn = h('input', { class: 'field-input mono', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: '1234 5678 9012 3456', 'aria-label': 'Card number', value: formatNumber(c.number, c.network) });
  const numberHint = h('span', { class: 'field-hint' });
  const bankCombo = combo({
    getOptions: () => BANKS.map((b) => b.name), placeholder: 'Start typing, e.g. HDFC', value: c.bank,
    attrs: { autocapitalize: 'words', 'aria-label': 'Bank' },
    onPick: () => (firstEmpty([nameCombo.input]) || holderIn).focus(),
  });
  const bankIn = bankCombo.input;
  const nameCombo = combo({
    getOptions: () => cardNamesFor(bankIn.value, kind), placeholder: 'e.g. Regalia Gold', value: c.name,
    attrs: { autocapitalize: 'words', 'aria-label': 'Card name' },
  });
  const nameIn = nameCombo.input;
  const rangeHint = h('span', { class: 'field-hint ok' });
  const netSel = h('select', { class: 'select', 'aria-label': 'Network' },
    h('option', { value: '', text: 'Detect from number' }),
    Object.values(NETWORKS).filter((n) => n.id !== 'other').map((n) => h('option', { value: n.id, text: n.label, selected: n.id === netOverride })));
  const tierIn = h('input', { class: 'field-input', type: 'text', autocomplete: 'off', autocapitalize: 'words', placeholder: 'Tap one below or type it', value: c.tier, 'aria-label': 'Variant' });
  const tierChips = h('div', { class: 'chips small wrap', role: 'group', 'aria-label': 'Variant suggestions' });
  const tierHint = h('span', { class: 'field-hint' });
  const holderIn = h('input', { class: 'field-input caps', type: 'text', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false', autocapitalize: 'characters', placeholder: 'As printed on the card', value: c.holder, 'aria-label': 'Name on card' });
  const expIn = h('input', { class: 'field-input mono', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'MM/YY', maxlength: 5, value: c.expiry, 'aria-label': 'Expiry' });
  const cvvIn = h('input', { class: 'field-input mono', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: '123', maxlength: 4, value: c.cvv, 'aria-label': 'CVV' });
  const limitIn = h('input', { class: 'field-input mono', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'e.g. 3,00,000', value: groupIndian(c.limit), 'aria-label': 'Credit limit' });
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

  // Fill bank, name and variant from a saved card in the same number range.
  let rangeFilledFrom = '';
  const applyRange = () => {
    const mate = sameRangeCard(S.vault.items, numberIn.value, c.id);
    if (!mate || rangeFilledFrom === mate.id) return;
    const filled = [];
    if (!bankIn.value.trim() && mate.bank) { bankIn.value = mate.bank; filled.push('bank'); }
    if (!nameIn.value.trim() && mate.name && mate.kind === kind) { nameIn.value = mate.name; filled.push('card name'); }
    if (!tierIn.value.trim() && mate.tier) { tierIn.value = mate.tier; filled.push('variant'); }
    rangeFilledFrom = mate.id;
    rangeHint.textContent = filled.length
      ? `Filled ${filled.join(', ')} from your ${mate.bank}${mate.name ? ' ' + mate.name : ''} (same card range).`
      : '';
    if (filled.length) paintShare();
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
    tierHint.textContent = (TIERS[id] || []).length
      ? `${NETWORKS[id].label} variant. It isn't encoded in the number; pick it once and cards from the same range fill it in.`
      : 'Optional, e.g. Platinum.';
    const draft = { ...c, bank: bankIn.value.trim() || 'Your bank', name: nameIn.value.trim(), tier: tierIn.value.trim(), network: id, holder: holderIn.value.trim().toUpperCase(), number: clipped, expiry: expIn.value, cvv: cvvIn.value };
    preview.replaceChildren(cardFace(draft, true));
  };

  let lastLen = digits(numberIn.value).length;
  numberIn.addEventListener('input', () => {
    update();
    applyRange();
    const n = digits(numberIn.value);
    const grew = n.length > lastLen;
    lastLen = n.length;
    const lens = (NETWORKS[net()] || NETWORKS.other).lengths;
    // Jump to expiry when typing completes the number: a valid length that passes the checksum.
    if (grew && n.length >= 14 && net() !== 'other' && lens.includes(n.length) && luhnValid(n)) expIn.focus();
  });
  netSel.addEventListener('change', () => { netOverride = netSel.value; update(); });
  bankIn.addEventListener('input', () => { paintShare(); update(); });
  bankIn.addEventListener('blur', () => {
    const hit = BANKS.find((b) => b.name.toLowerCase() === bankIn.value.trim().toLowerCase());
    if (hit && hit.name !== bankIn.value) { bankIn.value = hit.name; paintShare(); update(); }
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
    // Next comes the first field still empty, in the order of the form.
    if (cvvIn.value.length === cvvIn.maxLength) (firstEmpty([bankIn, nameIn, holderIn]) || (kind === 'credit' ? limitIn : notesIn)).focus();
  });
  limitIn.addEventListener('input', () => { limitIn.value = groupIndian(limitIn.value); });

  const save = h('button', { class: 'btn primary', type: 'submit', text: existing ? 'Save changes' : 'Save card' });
  const form = h('form', { class: 'form', novalidate: true },
    preview,
    field('Card number', numberIn, numberHint),
    h('div', { class: 'grid2' },
      field('Expiry', expIn),
      field(`CVV${(NETWORKS[net()]?.cvv || 3) === 4 ? ' (4 digits)' : ''}`, cvvIn)),
    fieldDiv('Bank', bankCombo.wrap, rangeHint),
    fieldDiv('Card name', nameCombo.wrap),
    field('Variant', tierIn, tierHint),
    tierChips,
    field('Name on card', holderIn),
    field('Network', netSel, h('span', { class: 'field-hint', text: 'Detected from the number. Change it only if detection is wrong.' })),
    kind === 'credit' ? field('Credit limit (₹, optional)', limitIn) : null,
    kind === 'credit' ? shareBox : null,
    field('Notes', notesIn),
    err,
    h('div', { class: 'row-end sticky-actions' }, save));

  const s = sheet({ title: existing ? 'Edit card' : TAB_META[kind].add, body: form, wide: true });
  chainFields([numberIn, expIn, cvvIn, bankIn, nameIn, tierIn, holderIn, kind === 'credit' ? limitIn : null]);
  paintShare(); update();
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
  const brandCombo = combo({
    getOptions: () => [...new Set([...S.vault.items.filter((x) => x.kind === 'gift').map((x) => x.brand), ...GIFT_BRANDS])],
    placeholder: 'e.g. Amazon, Myntra, Swiggy', value: g.brand, attrs: { autocapitalize: 'words', 'aria-label': 'Company' },
    onPick: () => amountIn.focus(),
  });
  const brandIn = brandCombo.input;
  const amountIn = h('input', { class: 'field-input mono', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'e.g. 1,000', value: g.amount ? groupIndian(g.amount) : '', 'aria-label': 'Amount' });
  const codeIn = h('input', { class: 'field-input mono', type: 'text', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'Voucher / claim code', value: g.code, 'aria-label': 'Voucher code' });
  const pinIn = h('input', { class: 'field-input mono', type: 'text', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'Only if the voucher has one', value: g.pin, 'aria-label': 'Voucher PIN' });
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
    [250, 500, 1000, 2000, 5000].map((a) => h('button', { class: 'chip', type: 'button', text: formatINR(a), onclick: () => { amountIn.value = groupIndian(a); if (!codeIn.value) codeIn.focus(); } })));

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
    fieldDiv('Company', brandCombo.wrap),
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
  chainFields([brandIn, amountIn, codeIn, pinIn]);
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
