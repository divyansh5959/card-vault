// Card Vault: app shell, lock flow and settings.

import { h, $, clear, toast, sheet, confirmSheet, pickFile, downloadJSON, today } from './ui.js';
import { icon } from './icons.js';
import { pinPad, PIN_LENGTH } from './pinpad.js';
import {
  loadMeta, saveMeta, createVault, readVault, writeVault, eraseAll, storageAvailable,
  makeEncryptedBackup, makePlainExport, parseBackupFile, openEncryptedBackup, makeBackupWrap,
  mergeItems, countKinds, bytesUsed, META_KEY, DATA_KEY,
} from './store.js';
import { wrapWithSecret, unwrapWithSecret, PIN_ITERATIONS, passwordScore, suggestPassphrase } from './crypto.js';
import { prfLikelySupported, enrollPrf, unlockWithPrf } from './passkey.js';
import { WORDS } from './data.js';
import { renderTab, openEditor, tabSummary, crossTabHits, TAB_META } from './views.js';
import { defaultFilters, normalizeFilters } from './filters.js';

export const VERSION = '1.1.1';
const AUTO_LOCK_OPTIONS = [[0, 'Immediately'], [1, 'After 1 minute'], [5, 'After 5 minutes'], [15, 'After 15 minutes']];
const IDLE_LOCK_MS = 10 * 60 * 1000;
const MAX_FREE_TRIES = 5;

const S = {
  meta: null,
  dek: null,
  vault: null,
  tab: 'credit',
  query: { credit: '', debit: '', gift: '' },
  filters: { credit: defaultFilters('credit'), debit: defaultFilters('debit'), gift: defaultFilters('gift') },
  revealed: new Set(),
  installPrompt: null,
  prf: false,
  hiddenAt: 0,
  idleTimer: 0,
};

const appEl = () => document.getElementById('app');

// ---------------- persistence ----------------

async function persist() {
  S.meta.lastChangeAt = Date.now();
  saveMeta(S.meta);
  await writeVault(S.dek, S.vault);
}

export const store = {
  get state() { return S; },
  async upsert(item) {
    const i = S.vault.items.findIndex((x) => x.id === item.id);
    item.updatedAt = Date.now();
    if (i >= 0) S.vault.items[i] = item; else S.vault.items.push(item);
    await persist();
  },
  async upsertMany(items) {
    const now = Date.now();
    for (const item of items) {
      item.updatedAt = now;
      const i = S.vault.items.findIndex((x) => x.id === item.id);
      if (i >= 0) S.vault.items[i] = item; else S.vault.items.push(item);
    }
    await persist();
  },
  async remove(id) {
    const i = S.vault.items.findIndex((x) => x.id === id);
    if (i < 0) return null;
    const [gone] = S.vault.items.splice(i, 1);
    await persist();
    return { item: gone, index: i };
  },
  async restore({ item, index }) {
    S.vault.items.splice(Math.min(index, S.vault.items.length), 0, item);
    await persist();
  },
  // Filters live in the encrypted vault (they name your banks), but changing
  // them is not a data change, so it does not trigger the backup reminder.
  async setFilters(tab, next) {
    S.filters[tab] = normalizeFilters(tab, next);
    S.vault.prefs.filters = { ...(S.vault.prefs.filters || {}), [tab]: S.filters[tab] };
    refreshMain();
    await writeVault(S.dek, S.vault);
  },
  async setHolder(name) {
    if (name && name !== S.vault.prefs.holder) { S.vault.prefs.holder = name; await persist(); }
  },
  refresh: () => refreshMain(),
};

// ---------------- theme ----------------

function applyTheme() {
  const pref = S.meta?.settings?.theme || 'system';
  const dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const tc = document.querySelector('meta[name="theme-color"]');
  if (tc) tc.content = dark ? '#0d0f14' : '#f4f1ea';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

// ---------------- boot ----------------

async function boot() {
  if (!storageAvailable()) {
    clear(appEl(), h('div', { class: 'center-msg' },
      h('h1', { text: 'Storage is blocked' }),
      h('p', { text: 'Card Vault needs this browser\'s local storage. Turn off private browsing or allow site data, then reload.' })));
    return;
  }
  S.meta = loadMeta();
  applyTheme();
  S.prf = await prfLikelySupported();
  if (S.meta) showLock(); else showWelcome();
  registerSW();
}

// ---------------- first run ----------------

function brandBlock(subtitle) {
  return h('div', { class: 'brand-block' },
    h('img', { src: 'icons/icon.svg', alt: '', class: 'brand-logo', width: 64, height: 64 }),
    h('h1', { class: 'brand-title', text: 'Card Vault' }),
    h('p', { class: 'brand-sub', text: subtitle }));
}

function showWelcome() {
  clear(appEl(), h('main', { class: 'welcome' },
    brandBlock('Credit cards, debit cards and gift vouchers, encrypted on this device.'),
    h('ul', { class: 'welcome-points' },
      h('li', {}, icon('shield'), h('span', { text: 'Nothing is uploaded. Data stays in this browser, encrypted with AES-256.' })),
      h('li', {}, icon('fingerprint'), h('span', { text: 'Unlock with a 6-digit PIN, or your fingerprint on supported phones.' })),
      h('li', {}, icon('download'), h('span', { text: 'Move everything to a laptop with an encrypted backup file.' }))),
    h('div', { class: 'stack welcome-actions' },
      h('button', { class: 'btn primary big', type: 'button', text: 'Create my vault', onclick: () => choosePin({ onDone: finishCreate }) }),
      h('button', { class: 'btn ghost big', type: 'button', text: 'Restore from a backup file', onclick: restoreFromFile }))));
}

// Two-step PIN entry: choose, then confirm.
function choosePin({ onDone, title = 'Choose a 6-digit PIN', back = showWelcome }) {
  let first = '';
  const backBtn = h('button', { class: 'link-btn', type: 'button', text: 'Back', onclick: back });
  const pad = pinPad({
    title,
    subtitle: 'You will type this to open the app. Avoid your card PIN or birthday.',
    extra: backBtn,
    onComplete: async (pin) => {
      if (!first) {
        if (/^(\d)\1+$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) {
          return 'Too easy to guess. Pick a less obvious PIN.';
        }
        first = pin;
        pad.el.querySelector('.pin-title').textContent = 'Enter the same PIN again';
        pad.setSubtitle('Just to make sure.');
        return { reset: true };
      }
      if (pin !== first) {
        first = '';
        pad.el.querySelector('.pin-title').textContent = title;
        pad.setSubtitle('Start again.');
        return 'The two PINs did not match.';
      }
      busyScreen('Securing your vault…');
      await onDone(pin);
      return true;
    },
  });
  clear(appEl(), pad.el);
}

function busyScreen(text) {
  clear(appEl(), h('div', { class: 'center-msg' }, h('div', { class: 'spinner', 'aria-hidden': 'true' }), h('p', { text })));
}

async function finishCreate(pin, vault, backupPassword) {
  const res = await createVault(pin, localStorage, vault);
  S.dek = res.dek; S.meta = res.meta; S.vault = res.vault;
  for (const t of ['credit', 'debit', 'gift']) S.filters[t] = defaultFilters(t);
  if (backupPassword) {
    S.meta.backupWrap = await makeBackupWrap(S.dek, backupPassword);
    S.meta.lastBackupAt = Date.now();
    saveMeta(S.meta);
  }
  navigator.storage?.persist?.();
  enterApp();
  if (S.prf) setTimeout(offerFingerprint, 400);
}

function offerFingerprint() {
  const s = sheet({
    title: 'Unlock with fingerprint?',
    body: h('div', { class: 'stack' },
      h('p', { class: 'muted', text: 'Your phone creates a passkey for Card Vault. After that, a fingerprint or face scan opens the app. The PIN keeps working as a backup.' }),
      h('div', { class: 'row-end' },
        h('button', { class: 'btn ghost', type: 'button', text: 'Not now', onclick: () => s.close() }),
        h('button', { class: 'btn primary', type: 'button', text: 'Turn on', onclick: async () => { s.close(); await turnOnFingerprint(); } }))),
  });
}

async function turnOnFingerprint() {
  try {
    S.meta.prf = await enrollPrf(S.dek);
    saveMeta(S.meta);
    toast('Fingerprint unlock is on');
  } catch (e) {
    toast(e?.name === 'NotAllowedError' ? 'Fingerprint setup cancelled' : (e.message || 'Fingerprint setup failed'), { tone: 'bad', timeout: 3500 });
  }
  if (S.tab === 'settings') refreshMain();
}

// ---------------- restore on a new device ----------------

async function restoreFromFile() {
  const f = await pickFile();
  if (!f) return;
  let parsed;
  try { parsed = parseBackupFile(f.text); } catch (e) { toast(e.message, { tone: 'bad', timeout: 3500 }); return; }
  if (parsed.kind === 'plain') {
    toast(`Found ${parsed.items.length} items. Now choose a PIN.`);
    choosePin({ onDone: (pin) => finishCreate(pin, { items: parsed.items, prefs: { holder: '' } }) });
    return;
  }
  askPassword({
    title: 'Open backup',
    message: `Enter the backup password used when ${f.name} was made.`,
    onSubmit: async (pw) => {
      const opened = await openEncryptedBackup(parsed.file, pw);
      toast(`Found ${opened.items.length} items. Now choose a PIN for this device.`, { timeout: 3500 });
      choosePin({ onDone: (pin) => finishCreate(pin, { items: opened.items, prefs: { holder: '', ...opened.prefs } }, pw) });
    },
  });
}

function askPassword({ title, message, onSubmit, submitLabel = 'Continue' }) {
  const input = h('input', { class: 'field-input', type: 'password', autocomplete: 'current-password', 'aria-label': 'Backup password' });
  const err = h('p', { class: 'field-err', role: 'alert' });
  const go = h('button', { class: 'btn primary', type: 'submit', text: submitLabel });
  const form = h('form', { class: 'stack' },
    h('p', { class: 'muted', text: message }),
    h('label', { class: 'field' }, h('span', { class: 'field-label', text: 'Backup password' }), input, err),
    h('div', { class: 'row-end' }, go));
  const s = sheet({ title, body: form });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!input.value) return;
    go.disabled = true; go.textContent = 'Checking…';
    try { await onSubmit(input.value); s.close(); } catch (ex) { err.textContent = ex.message || 'Could not open the file.'; }
    go.disabled = false; go.textContent = submitLabel;
  });
  setTimeout(() => input.focus(), 50);
}

// ---------------- lock screen ----------------

function lockoutRemaining() {
  return Math.max(0, (S.meta.failed?.until || 0) - Date.now());
}

function registerFailure() {
  const f = S.meta.failed || { count: 0, until: 0 };
  f.count += 1;
  if (f.count >= MAX_FREE_TRIES) {
    const step = f.count - MAX_FREE_TRIES;
    f.until = Date.now() + Math.min(30_000 * 2 ** step, 15 * 60_000);
  }
  S.meta.failed = f;
  saveMeta(S.meta);
}

function showLock() {
  S.dek = null; S.vault = null; S.revealed.clear();
  document.querySelectorAll('dialog').forEach((d) => d.remove());
  let pad;
  const bio = S.meta.prf
    ? h('button', { class: 'pin-key ghost bio', type: 'button', 'aria-label': 'Unlock with fingerprint', onclick: () => tryFingerprint() }, icon('fingerprint'))
    : null;

  const tick = () => {
    const ms = lockoutRemaining();
    if (!pad.el.isConnected) return;
    if (ms > 0) {
      pad.setLocked(true);
      pad.setMessage(`Too many wrong tries. Try again in ${Math.ceil(ms / 1000)} s.`);
      setTimeout(tick, 1000);
    } else if (pad.el.classList.contains('locked')) {
      pad.setLocked(false);
      pad.setMessage('');
    }
  };

  pad = pinPad({
    title: 'Card Vault is locked',
    subtitle: S.meta.prf ? 'Use your fingerprint or enter your PIN' : 'Enter your 6-digit PIN',
    bioButton: bio,
    extra: h('button', { class: 'link-btn', type: 'button', text: 'Forgot PIN?', onclick: forgotPin }),
    onComplete: async (pin) => {
      if (lockoutRemaining() > 0) { tick(); return ''; }
      try {
        const dek = await unwrapWithSecret(S.meta.pinWrap, pin);
        await unlocked(dek);
        return true;
      } catch {
        registerFailure();
        const left = MAX_FREE_TRIES - S.meta.failed.count;
        if (lockoutRemaining() > 0) { setTimeout(tick, 0); return 'Wrong PIN.'; }
        return left > 0 && left <= 3 ? `Wrong PIN. ${left} ${left === 1 ? 'try' : 'tries'} left before a short wait.` : 'Wrong PIN.';
      }
    },
  });
  clear(appEl(), pad.el);
  tick();

  let inFlight = false;
  async function tryFingerprint() {
    if (inFlight || !pad.el.isConnected || lockoutRemaining() > 0) return;
    inFlight = true;
    pad.setMessage('');
    try {
      const dek = await unlockWithPrf(S.meta.prf);
      await unlocked(dek);
    } catch (e) {
      if (pad.el.isConnected) pad.setMessage(e?.name === 'NotAllowedError' ? 'Fingerprint cancelled. Tap the fingerprint key or enter your PIN.' : 'Fingerprint did not work. Enter your PIN.');
    } finally {
      inFlight = false;
    }
  }
  if (S.meta.prf) armAutoFingerprint(pad, tryFingerprint);
}

// Opens the fingerprint prompt by itself whenever the lock screen is on
// screen: at app start and each time you come back to the app. Chrome only
// allows the prompt in a focused window, so it waits briefly for focus.
// After you cancel it, it does not reopen until you leave and come back.
let autoFp = null;
function armAutoFingerprint(pad, run) {
  if (autoFp) autoFp.disarm();
  let triedThisVisit = false;
  let timer = 0;
  const fire = () => {
    if (!pad.el.isConnected) { disarm(); return; }
    if (triedThisVisit || document.visibilityState !== 'visible' || lockoutRemaining() > 0) return;
    triedThisVisit = true;
    run();
  };
  const schedule = () => {
    clearTimeout(timer);
    if (document.hasFocus()) { timer = setTimeout(fire, 150); return; }
    const onFocus = () => { window.removeEventListener('focus', onFocus); clearTimeout(timer); timer = setTimeout(fire, 150); };
    window.addEventListener('focus', onFocus);
    timer = setTimeout(() => { window.removeEventListener('focus', onFocus); fire(); }, 1200);
  };
  const onVis = () => {
    if (document.visibilityState === 'hidden') { triedThisVisit = false; clearTimeout(timer); }
    else schedule();
  };
  const onShow = (e) => { if (e.persisted) { triedThisVisit = false; schedule(); } };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('pageshow', onShow);
  function disarm() {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('pageshow', onShow);
    if (autoFp && autoFp.disarm === disarm) autoFp = null;
  }
  autoFp = { disarm };
  if (document.visibilityState === 'visible') schedule();
}

async function unlocked(dek) {
  if (autoFp) autoFp.disarm();
  S.vault = await readVault(dek);
  S.dek = dek;
  const saved = S.vault.prefs.filters || {};
  for (const t of ['credit', 'debit', 'gift']) S.filters[t] = normalizeFilters(t, saved[t]);
  S.meta.failed = { count: 0, until: 0 };
  saveMeta(S.meta);
  enterApp();
}

function forgotPin() {
  if (!S.meta.backupWrap) {
    const s = sheet({
      title: 'Forgot PIN',
      body: h('div', { class: 'stack' },
        h('p', { class: 'muted', text: 'The PIN is the key that decrypts your data, so it cannot be reset without a backup password, and you have not set one on this device.' }),
        h('p', { class: 'muted', text: 'If you have a backup file from another device, you can erase this device and restore from it.' }),
        h('div', { class: 'row-end' },
          h('button', { class: 'btn ghost', type: 'button', text: 'Keep trying', onclick: () => s.close() }),
          h('button', { class: 'btn danger', type: 'button', text: 'Erase this device', onclick: async () => { s.close(); await eraseFlow(); } }))),
    });
    return;
  }
  askPassword({
    title: 'Reset PIN',
    message: 'Enter your backup password. You can then choose a new PIN.',
    onSubmit: async (pw) => {
      let dek;
      try { dek = await unwrapWithSecret(S.meta.backupWrap, pw); } catch { throw new Error('Wrong backup password.'); }
      choosePin({
        title: 'Choose a new PIN',
        back: showLock,
        onDone: async (pin) => {
          S.meta.pinWrap = await wrapWithSecret(dek, pin, PIN_ITERATIONS);
          saveMeta(S.meta);
          await unlocked(dek);
          toast('New PIN saved');
        },
      });
    },
  });
}

export function lockNow() {
  showLock();
}

// Auto-lock: after leaving the app for the chosen time, or after 10 idle minutes.
document.addEventListener('visibilitychange', () => {
  if (!S.dek) return;
  if (document.visibilityState === 'hidden') {
    S.hiddenAt = Date.now();
    if ((S.meta.settings.autoLock ?? 1) === 0) lockNow();
  } else if (S.hiddenAt) {
    const mins = S.meta.settings.autoLock ?? 1;
    if (Date.now() - S.hiddenAt >= mins * 60_000) lockNow();
    S.hiddenAt = 0;
  }
});

function bumpIdle() {
  clearTimeout(S.idleTimer);
  if (S.dek) S.idleTimer = setTimeout(() => { if (S.dek) { lockNow(); toast('Locked after 10 idle minutes'); } }, IDLE_LOCK_MS);
}
['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, bumpIdle, { passive: true }));

// ---------------- main shell ----------------

const TABS = ['credit', 'debit', 'gift', 'settings'];

function navButtons(cls) {
  const counts = countKinds(S.vault.items);
  return TABS.map((t) => {
    const meta = TAB_META[t];
    const b = h('button', {
      class: `${cls} ${S.tab === t ? 'active' : ''}`, type: 'button', 'aria-current': S.tab === t ? 'page' : null,
      dataset: { tab: t }, onclick: () => switchTab(t),
    }, icon(meta.icon), h('span', { class: 'nav-label', text: meta.short }),
    t !== 'settings' && counts[t] ? h('span', { class: 'nav-count', text: String(counts[t]) }) : null,
    t === 'settings' && backupDue() ? h('span', { class: 'nav-dot', 'aria-label': 'Backup due' }) : null);
    return b;
  });
}

function enterApp() {
  bumpIdle();
  const searchInput = h('input', {
    class: 'search-input', type: 'search', id: 'search', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search',
    oninput: (e) => { S.query[S.tab] = e.target.value; refreshList(); },
  });
  const shell = h('div', { class: 'shell' },
    h('a', { class: 'skip', href: '#content', text: 'Skip to content' }),
    h('aside', { class: 'rail' },
      h('div', { class: 'rail-brand' }, h('img', { src: 'icons/icon.svg', alt: '', width: 32, height: 32 }), h('span', { text: 'Card Vault' })),
      h('nav', { class: 'rail-nav', 'aria-label': 'Sections' }),
      h('button', { class: 'rail-lock btn ghost', type: 'button', onclick: lockNow }, icon('lock'), h('span', { text: 'Lock' }))),
    h('div', { class: 'main' },
      h('header', { class: 'topbar' },
        h('div', { class: 'topbar-text' },
          h('h1', { class: 'page-title', id: 'pageTitle' }),
          h('p', { class: 'page-sub', id: 'pageSub' })),
        h('button', { class: 'icon-btn topbar-lock', type: 'button', 'aria-label': 'Lock now', onclick: lockNow }, icon('lock'))),
      h('div', { class: 'searchbar', id: 'searchbar' },
        h('label', { class: 'search' }, icon('search'), h('span', { class: 'sr-only', text: 'Search' }), searchInput,
          h('kbd', { class: 'kbd', text: '/' }))),
      h('div', { class: 'tools', id: 'tools' }),
      h('div', { class: 'hint', id: 'crossHint' }),
      h('main', { class: 'content', id: 'content', tabindex: '-1' })),
    h('nav', { class: 'tabbar', 'aria-label': 'Sections' }),
    h('button', { class: 'fab', id: 'fab', type: 'button', onclick: () => openEditor(S.tab) }, icon('plus'), h('span', { id: 'fabLabel' })));
  clear(appEl(), shell);
  refreshMain();
}

function switchTab(t) {
  S.tab = t;
  refreshMain();
  $('#content')?.scrollTo?.(0, 0);
  window.scrollTo(0, 0);
}

function refreshMain() {
  if (!S.dek || !$('.shell')) return;
  clear($('.rail-nav'), navButtons('rail-btn'));
  clear($('.tabbar'), navButtons('tab-btn'));
  const meta = TAB_META[S.tab];
  const isSettings = S.tab === 'settings';
  $('#searchbar').hidden = isSettings;
  $('#fab').hidden = isSettings;
  $('#tools').hidden = isSettings;
  if (!isSettings) {
    const input = $('#search');
    input.placeholder = meta.placeholder;
    if (input.value !== S.query[S.tab]) input.value = S.query[S.tab];
    $('#fabLabel').textContent = meta.add;
    $('#fab').setAttribute('aria-label', meta.add);
  }
  refreshList();
}

function refreshList() {
  if (!S.dek || !$('.shell')) return;
  const meta = TAB_META[S.tab];
  $('#pageTitle').textContent = meta.title;
  if (S.tab === 'settings') {
    $('#pageSub').textContent = `Version ${VERSION}`;
    clear($('#crossHint'));
    clear($('#content'), renderSettings());
    return;
  }
  $('#pageSub').textContent = tabSummary(S, S.tab);
  const { tools, list } = renderTab(S, S.tab);
  clear($('#tools'), tools);
  clear($('#content'), list);
  const hits = crossTabHits(S, S.tab);
  clear($('#crossHint'), hits.map(([t, n]) => h('button', {
    class: 'hint-btn', type: 'button', onclick: () => { S.query[t] = S.query[S.tab]; switchTab(t); },
  }, `${n} match${n === 1 ? '' : 'es'} in ${TAB_META[t].title}`, icon('chevron'))));
}

// Keyboard shortcuts for laptop use.
document.addEventListener('keydown', (e) => {
  if (!S.dek || document.querySelector('dialog[open]')) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
  if (e.key === '/' && !typing) { e.preventDefault(); $('#search')?.focus(); }
  else if (e.key === 'Escape' && document.activeElement?.id === 'search') { e.target.value = ''; S.query[S.tab] = ''; refreshList(); }
  else if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (e.key === 'n' && S.tab !== 'settings') { e.preventDefault(); openEditor(S.tab); }
    else if (e.key >= '1' && e.key <= '4') switchTab(TABS[Number(e.key) - 1]);
  }
});

// ---------------- settings ----------------

function backupDue() {
  if (!S.meta || !S.vault?.items.length) return false;
  return S.meta.lastChangeAt > (S.meta.lastBackupAt || 0) && Date.now() - (S.meta.lastBackupAt || 0) > 7 * 86400000;
}

function row({ ic, title, sub, control, onclick, danger }) {
  const tag = onclick ? 'button' : 'div';
  return h(tag, { class: `set-row ${onclick ? 'tap' : ''} ${danger ? 'danger' : ''}`, type: onclick ? 'button' : null, onclick },
    h('span', { class: 'set-ico' }, icon(ic)),
    h('span', { class: 'set-text' }, h('span', { class: 'set-title', text: title }), sub ? h('span', { class: 'set-sub', text: sub }) : null),
    control || (onclick ? icon('chevron', 'set-chev') : null));
}

function group(title, ...rows) {
  return h('section', { class: 'set-group' }, h('h2', { class: 'set-head', text: title }), h('div', { class: 'set-card' }, rows));
}

function fmtDate(ts) {
  if (!ts) return 'never';
  return new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function segmented(options, value, onChange, label) {
  return h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label },
    options.map(([v, l]) => h('button', {
      class: `seg-btn ${v === value ? 'on' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(v === value),
      text: l, onclick: () => onChange(v),
    })));
}

function renderSettings() {
  const m = S.meta;
  const counts = countKinds(S.vault.items);
  const out = h('div', { class: 'settings' });

  if (backupDue()) {
    out.append(h('div', { class: 'banner warn' }, icon('alert'),
      h('span', { text: m.lastBackupAt ? `You changed things since your last backup on ${fmtDate(m.lastBackupAt)}. Export a backup so you don't lose them.` : 'You have not made a backup yet. If this phone is lost or Chrome clears its data, your cards go with it.' }),
      h('button', { class: 'btn small primary', type: 'button', text: 'Back up now', onclick: exportEncrypted })));
  }
  if (S.installPrompt) {
    out.append(h('div', { class: 'banner' }, icon('phone'),
      h('span', { text: 'Install Card Vault as an app for an icon on your home screen and offline use.' }),
      h('button', { class: 'btn small primary', type: 'button', text: 'Install', onclick: installApp })));
  }

  out.append(group('Unlock',
    S.prf || m.prf
      ? row({
        ic: 'fingerprint', title: 'Fingerprint unlock',
        sub: m.prf ? `On since ${fmtDate(m.prf.createdAt)}` : 'Use the phone\'s fingerprint or face unlock instead of typing the PIN',
        control: h('button', {
          class: `switch ${m.prf ? 'on' : ''}`, type: 'button', role: 'switch', 'aria-checked': String(!!m.prf), 'aria-label': 'Fingerprint unlock',
          onclick: async () => {
            if (m.prf) { m.prf = null; saveMeta(m); toast('Fingerprint unlock is off'); refreshMain(); } else await turnOnFingerprint();
          },
        }, h('span', { class: 'knob' })),
      })
      : row({ ic: 'fingerprint', title: 'Fingerprint unlock', sub: 'Not available in this browser. Chrome on Android with a screen lock supports it.' }),
    row({ ic: 'key', title: 'Change PIN', sub: `${PIN_LENGTH} digits`, onclick: changePin }),
    row({
      ic: 'clock', title: 'Auto-lock', sub: 'When you leave the app. It also locks after 10 idle minutes.',
      control: h('select', {
        class: 'select', 'aria-label': 'Auto-lock',
        onchange: (e) => { m.settings.autoLock = Number(e.target.value); saveMeta(m); toast('Auto-lock updated'); },
      }, AUTO_LOCK_OPTIONS.map(([v, l]) => h('option', { value: String(v), selected: v === (m.settings.autoLock ?? 1), text: l }))),
    }),
    row({ ic: 'lock', title: 'Lock now', onclick: lockNow }),
  ));

  out.append(group('Backup and transfer',
    row({
      ic: 'shield', title: m.backupWrap ? 'Change backup password' : 'Set a backup password',
      sub: m.backupWrap ? 'Encrypts backup files. Also lets you reset a forgotten PIN.' : 'Needed for encrypted backups and for resetting a forgotten PIN',
      onclick: () => setBackupPassword(),
    }),
    row({ ic: 'download', title: 'Export encrypted backup', sub: `Last backup: ${fmtDate(m.lastBackupAt)}`, onclick: exportEncrypted }),
    navigator.canShare ? row({ ic: 'share', title: 'Share backup file', sub: 'Send it to Drive, email or your laptop', onclick: () => exportEncrypted({ share: true }) }) : null,
    row({ ic: 'upload', title: 'Import backup or JSON', sub: 'Merge into this vault or replace it', onclick: importFlow }),
    row({ ic: 'database', title: 'Export readable JSON', sub: 'Not encrypted. For viewing on a laptop or moving to another app.', onclick: exportPlain }),
  ));

  out.append(group('Appearance',
    row({ ic: 'sun', title: 'Theme', control: segmented([['system', 'Auto'], ['light', 'Light'], ['dark', 'Dark']], m.settings.theme, (v) => { m.settings.theme = v; saveMeta(m); applyTheme(); refreshMain(); }, 'Theme') }),
    row({ ic: 'grid', title: 'Card view', control: segmented([['cards', 'Cards'], ['list', 'List']], m.settings.density, (v) => { m.settings.density = v; saveMeta(m); refreshMain(); }, 'Card view') }),
  ));

  const storageRow = row({ ic: 'database', title: 'On this device', sub: `${counts.credit} credit, ${counts.debit} debit, ${counts.gift} gift cards · ${(bytesUsed() / 1024).toFixed(1)} KB in local storage` });
  const persistRow = row({ ic: 'shield', title: 'Storage protection', sub: 'Checking…' });
  navigator.storage?.persisted?.().then((p) => {
    persistRow.querySelector('.set-sub').textContent = p
      ? 'Chrome will not clear this data to free up space.'
      : 'Chrome may clear site data when space runs low. Installing the app usually fixes this. Keep backups.';
  }).catch(() => { persistRow.querySelector('.set-sub').textContent = 'Unknown'; });
  out.append(group('Storage',
    storageRow,
    persistRow,
    row({ ic: 'list', title: 'What is stored here', sub: 'Local storage keys and what they hold', onclick: showStorageKeys }),
    row({ ic: 'trash', title: 'Erase everything on this device', sub: 'Cannot be undone', danger: true, onclick: eraseFlow }),
  ));

  out.append(h('p', { class: 'about' },
    `Card Vault ${VERSION}. Runs entirely in your browser: no account, no server, no analytics. `,
    h('a', { href: 'privacy.html', text: 'Privacy' }), ' · ',
    h('a', { href: 'https://github.com/divyansh5959/card-vault', target: '_blank', rel: 'noopener', text: 'Source code' })));
  return out;
}

function showStorageKeys() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
  const desc = {
    [META_KEY]: 'Unlock settings: salts, wrapped keys, theme and auto-lock. No card data.',
    [DATA_KEY]: 'All your cards and vouchers, as one AES-256-GCM encrypted blob.',
  };
  sheet({
    title: 'What is stored here',
    body: h('div', { class: 'stack' },
      h('p', { class: 'muted', text: 'In Chrome on a laptop you can see these under DevTools → Application → Local storage. Card data only appears there in encrypted form; use "Export readable JSON" to see it in plain text.' }),
      h('ul', { class: 'key-list' }, keys.sort().map((k) => h('li', {},
        h('code', { text: k }),
        h('span', { class: 'muted', text: `${((localStorage.getItem(k) || '').length / 1024).toFixed(1)} KB · ${desc[k] || 'Other'}` }))))),
  });
}

function changePin() {
  const back = () => { enterApp(); switchTab('settings'); };
  const pad = pinPad({
    title: 'Enter your current PIN',
    extra: h('button', { class: 'link-btn', type: 'button', text: 'Cancel', onclick: back }),
    onComplete: async (pin) => {
      try { await unwrapWithSecret(S.meta.pinWrap, pin); } catch { return 'That is not your current PIN.'; }
      choosePin({
        title: 'Choose a new PIN',
        back,
        onDone: async (newPin) => {
          S.meta.pinWrap = await wrapWithSecret(S.dek, newPin, PIN_ITERATIONS);
          saveMeta(S.meta);
          back();
          toast('PIN changed');
        },
      });
      return true;
    },
  });
  clear(appEl(), pad.el);
}

function setBackupPassword(after) {
  const pw = h('input', { class: 'field-input', type: 'text', autocomplete: 'new-password', spellcheck: 'false', autocapitalize: 'off', 'aria-label': 'Backup password' });
  const pw2 = h('input', { class: 'field-input', type: 'text', autocomplete: 'new-password', spellcheck: 'false', autocapitalize: 'off', 'aria-label': 'Repeat backup password' });
  const meter = h('div', { class: 'meter', 'aria-hidden': 'true' }, h('span'), h('span'), h('span'));
  const meterText = h('span', { class: 'field-hint' });
  const err = h('p', { class: 'field-err', role: 'alert' });
  const labels = ['At least 10 characters', 'OK', 'Good', 'Strong'];
  const paint = () => {
    const sc = passwordScore(pw.value);
    meter.dataset.score = String(sc);
    meterText.textContent = pw.value ? labels[sc] : 'At least 10 characters. Four or five random words work well.';
  };
  pw.addEventListener('input', paint);
  const suggest = h('button', {
    class: 'btn small ghost', type: 'button', text: 'Suggest one',
    onclick: () => { pw.value = suggestPassphrase(WORDS); pw2.value = ''; paint(); pw2.focus(); },
  });
  const save = h('button', { class: 'btn primary', type: 'submit', text: 'Save password' });
  const form = h('form', { class: 'stack' },
    h('p', { class: 'muted', text: 'This password encrypts backup files. You will type it on your laptop to open a backup, and it can reset a forgotten PIN. Save it in a password manager or write it down. Nobody can recover it for you.' }),
    S.meta.backupWrap ? h('p', { class: 'muted small', text: 'Backups made before this change still need the old password.' }) : null,
    h('label', { class: 'field' }, h('span', { class: 'field-label', text: 'Backup password' }), pw, meter, meterText),
    h('div', { class: 'row-start' }, suggest),
    h('label', { class: 'field' }, h('span', { class: 'field-label', text: 'Type it again' }), pw2, err),
    h('div', { class: 'row-end' }, save));
  const s = sheet({ title: S.meta.backupWrap ? 'Change backup password' : 'Set a backup password', body: form });
  paint();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (passwordScore(pw.value) < 1) { err.textContent = 'Use at least 10 characters.'; return; }
    if (pw.value !== pw2.value) { err.textContent = 'The two passwords do not match.'; return; }
    save.disabled = true; save.textContent = 'Saving…';
    S.meta.backupWrap = await makeBackupWrap(S.dek, pw.value);
    saveMeta(S.meta);
    s.close();
    toast('Backup password saved');
    refreshMain();
    if (after) after();
  });
  setTimeout(() => pw.focus(), 50);
}

const stamp = () => today();

async function exportEncrypted(opts = {}) {
  if (!S.meta.backupWrap) { setBackupPassword(() => exportEncrypted(opts)); return; }
  const file = await makeEncryptedBackup(S.dek, S.meta.backupWrap, S.vault);
  const name = `card-vault-backup-${stamp()}.json`;
  if (opts.share === true && navigator.canShare) {
    const f = new File([JSON.stringify(file, null, 2)], name, { type: 'application/json' });
    if (navigator.canShare({ files: [f] })) {
      try {
        await navigator.share({ files: [f], title: 'Card Vault backup' });
        markBackedUp();
        return;
      } catch (e) {
        if (e?.name === 'AbortError') return;
      }
    }
  }
  downloadJSON(file, name);
  markBackedUp();
}

function markBackedUp() {
  S.meta.lastBackupAt = Date.now();
  saveMeta(S.meta);
  toast('Encrypted backup saved');
  refreshMain();
}

async function exportPlain() {
  const ok = await confirmSheet({
    title: 'Export readable JSON?',
    message: 'This file is NOT encrypted. Anyone who opens it can read every card number, CVV and voucher code. Delete it after use and never email it.',
    confirm: 'Export anyway',
    danger: true,
  });
  if (!ok) return;
  downloadJSON(makePlainExport(S.vault), `card-vault-readable-${stamp()}.json`);
  toast('Readable JSON downloaded');
}

async function importFlow() {
  const f = await pickFile();
  if (!f) return;
  let parsed;
  try { parsed = parseBackupFile(f.text); } catch (e) { toast(e.message, { tone: 'bad', timeout: 3500 }); return; }
  if (parsed.kind === 'plain') { previewImport(parsed.items, f.name); return; }
  askPassword({
    title: 'Open backup',
    message: `Enter the backup password for ${f.name}.`,
    onSubmit: async (pw) => {
      const opened = await openEncryptedBackup(parsed.file, pw);
      setTimeout(() => previewImport(opened.items, f.name), 200);
    },
  });
}

function previewImport(items, filename) {
  const c = countKinds(items);
  const { stats } = mergeItems(S.vault.items, items);
  const s = sheet({
    title: 'Import',
    body: h('div', { class: 'stack' },
      h('p', { text: `${filename} has ${c.credit} credit, ${c.debit} debit and ${c.gift} gift cards.` }),
      h('ul', { class: 'import-stats' },
        h('li', {}, h('strong', { text: String(stats.added) }), ' new'),
        h('li', {}, h('strong', { text: String(stats.updated) }), ' newer than yours'),
        h('li', {}, h('strong', { text: String(stats.unchanged) }), ' already here')),
      h('p', { class: 'muted small', text: 'Merge keeps everything you have and adds or updates from the file. Replace deletes what is on this device first.' }),
      h('div', { class: 'row-end' },
        h('button', {
          class: 'btn ghost danger-text', type: 'button', text: 'Replace all',
          onclick: async () => {
            s.close();
            const ok = await confirmSheet({ title: 'Replace everything?', message: `This deletes the ${S.vault.items.length} items on this device and keeps only the ${items.length} from the file.`, confirm: 'Replace', danger: true, typeToConfirm: 'REPLACE' });
            if (!ok) return;
            S.vault.items = items;
            await persist();
            toast(`Replaced with ${items.length} items`);
            refreshMain();
          },
        }),
        h('button', {
          class: 'btn primary', type: 'button', text: 'Merge',
          onclick: async () => {
            s.close();
            const res = mergeItems(S.vault.items, items);
            S.vault.items = res.items;
            await persist();
            toast(`Imported: ${res.stats.added} new, ${res.stats.updated} updated`);
            refreshMain();
          },
        }))),
  });
}

async function eraseFlow() {
  const ok = await confirmSheet({
    title: 'Erase everything?',
    message: 'All cards, vouchers, your PIN and fingerprint setup will be deleted from this browser. Export a backup first if you might need them.',
    confirm: 'Erase',
    danger: true,
    typeToConfirm: 'ERASE',
  });
  if (!ok) return;
  eraseAll();
  S.meta = null; S.dek = null; S.vault = null;
  showWelcome();
  toast('Everything on this device was erased');
}

// ---------------- PWA ----------------

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  S.installPrompt = e;
  if (S.tab === 'settings') refreshMain();
});
window.addEventListener('appinstalled', () => { S.installPrompt = null; toast('Card Vault installed'); refreshMain(); });

async function installApp() {
  const p = S.installPrompt;
  if (!p) return;
  p.prompt();
  await p.userChoice.catch(() => null);
  S.installPrompt = null;
  refreshMain();
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const offer = (w) => toast('A new version is ready', {
      timeout: 15000,
      action: { label: 'Update', fn: () => w.postMessage('skip-waiting') },
    });
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
    });
    // An installed app can stay open in the background for days; check for a
    // new version whenever it comes back to the foreground.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(() => { /* offline support is optional */ });
  // Reload only when a new version replaces a running one. On the first visit the
  // worker also claims the page, and reloading then would wipe a half-typed PIN.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
  });
}

boot();
