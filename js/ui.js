import { icon } from './icons.js';

// Small DOM helpers shared by the UI modules.

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'vars') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, kids);
  return el;
}

function append(el, kids) {
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function clear(el, ...kids) {
  el.replaceChildren();
  append(el, kids);
  return el;
}

let toastTimer = 0;
export function toast(message, opts = {}) {
  const host = document.getElementById('toasts');
  if (!host) return;
  clearTimeout(toastTimer);
  const t = h('div', { class: `toast ${opts.tone || ''}`, role: 'status' }, h('span', { text: message }));
  if (opts.action) {
    t.append(h('button', {
      class: 'toast-act', type: 'button', text: opts.action.label,
      onclick: () => { t.remove(); opts.action.fn(); },
    }));
  }
  host.replaceChildren(t);
  requestAnimationFrame(() => t.classList.add('show'));
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 250);
  }, opts.timeout || 2200);
}

export async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = h('textarea', { class: 'sr-only', readonly: true });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (!ok) { toast('Could not copy on this browser', { tone: 'bad' }); return false; }
  }
  if (navigator.vibrate) navigator.vibrate(12);
  toast(`${label} copied`);
  return true;
}

// Modal sheet built on <dialog>: bottom sheet on phones, centred on laptops.
export function sheet({ title, body, wide = false, onClose, dismissable = true }) {
  const dlg = h('dialog', { class: `sheet ${wide ? 'wide' : ''}`, 'aria-label': title });
  const close = () => {
    if (!dlg.open) return;
    dlg.classList.add('closing');
    setTimeout(() => { dlg.close(); dlg.remove(); onClose && onClose(); }, 160);
  };
  const head = h('header', { class: 'sheet-head' },
    h('span', { class: 'grabber', 'aria-hidden': 'true' }),
    h('h2', { text: title }),
    dismissable ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: close }) : null,
  );
  if (dismissable) head.lastChild.append(icon('close'));
  dlg.append(head, h('div', { class: 'sheet-body' }, body));
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); if (dismissable) close(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg && dismissable) close(); });
  document.body.append(dlg);
  dlg.showModal();
  return { close, el: dlg };
}

export function confirmSheet({ title, message, confirm = 'Confirm', danger = false, typeToConfirm = '' }) {
  return new Promise((resolve) => {
    let done = false;
    const input = typeToConfirm ? h('input', { class: 'field-input', autocomplete: 'off', placeholder: typeToConfirm, 'aria-label': `Type ${typeToConfirm} to confirm` }) : null;
    const go = h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, type: 'button', text: confirm, disabled: !!typeToConfirm });
    if (input) input.addEventListener('input', () => { go.disabled = input.value.trim().toUpperCase() !== typeToConfirm; });
    const s = sheet({
      title,
      body: h('div', { class: 'stack' },
        h('p', { class: 'muted', text: message }),
        input ? h('label', { class: 'field' }, h('span', { class: 'field-label', text: `Type ${typeToConfirm} to continue` }), input) : null,
        h('div', { class: 'row-end' },
          h('button', { class: 'btn ghost', type: 'button', text: 'Cancel', onclick: () => s.close() }),
          go),
      ),
      onClose: () => { if (!done) resolve(false); },
    });
    go.addEventListener('click', () => { done = true; s.close(); resolve(true); });
  });
}

export function pickFile(accept = 'application/json,.json,text/plain') {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, class: 'sr-only' });
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      input.remove();
      if (!f) return resolve(null);
      if (f.size > 20 * 1024 * 1024) { toast('That file is too large to be a backup', { tone: 'bad' }); return resolve(null); }
      resolve({ name: f.name, text: await f.text() });
    });
    document.body.append(input);
    input.click();
  });
}

export function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, class: 'sr-only' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return blob;
}

export function today(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
