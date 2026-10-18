// Six-digit PIN pad. Works with taps on a phone and the number keys on a laptop.

import { h } from './ui.js';
import { icon } from './icons.js';

export const PIN_LENGTH = 6;

// onComplete(pin) resolves to true (accepted), { reset: true } (clear quietly)
// or an error string to show.
export function pinPad({ title, subtitle = '', onComplete, extra = null, bioButton = null }) {
  let pin = '';
  let busy = false;
  const dots = h('div', { class: 'pin-dots', 'aria-hidden': 'true' },
    Array.from({ length: PIN_LENGTH }, () => h('span', { class: 'pin-dot' })));
  const live = h('p', { class: 'sr-only', 'aria-live': 'polite' });
  const msg = h('p', { class: 'pin-msg', role: 'alert' });
  const sub = h('p', { class: 'pin-sub', text: subtitle });

  const paint = () => {
    dots.childNodes.forEach((d, i) => d.classList.toggle('on', i < pin.length));
    live.textContent = `${pin.length} of ${PIN_LENGTH} digits entered`;
  };

  const submit = async () => {
    busy = true;
    root.classList.add('busy');
    const res = await onComplete(pin);
    busy = false;
    root.classList.remove('busy');
    if (res === true) return;
    pin = '';
    if (res && typeof res === 'object' && res.reset) { paint(); msg.textContent = ''; return; }
    paint();
    msg.textContent = res || '';
    dots.classList.remove('shake');
    void dots.offsetWidth;
    dots.classList.add('shake');
    if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
  };

  const press = (d) => {
    if (busy || root.classList.contains('locked')) return;
    if (d === 'back') { pin = pin.slice(0, -1); paint(); return; }
    if (pin.length >= PIN_LENGTH) return;
    pin += d;
    msg.textContent = '';
    paint();
    if (pin.length === PIN_LENGTH) { busy = true; setTimeout(submit, 90); }
  };

  const key = (label, val, aria) => h('button', {
    class: 'pin-key', type: 'button', 'aria-label': aria || label,
    onclick: () => press(val),
  }, label);

  const back = h('button', { class: 'pin-key ghost', type: 'button', 'aria-label': 'Delete last digit', onclick: () => press('back') }, icon('backspace'));
  const pad = h('div', { class: 'pin-pad' },
    ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => key(n, n)),
    bioButton || h('span'),
    key('0', '0'),
    back,
  );

  const root = h('section', { class: 'pin-screen' },
    h('div', { class: 'pin-head' },
      h('div', { class: 'pin-badge' }, icon('lock')),
      h('h1', { class: 'pin-title', text: title }),
      sub),
    dots, live, msg, pad, extra);

  const onKey = (e) => {
    if (!root.isConnected) { document.removeEventListener('keydown', onKey); return; }
    if (document.querySelector('dialog[open]')) return;
    if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); press('back'); }
  };
  document.addEventListener('keydown', onKey);

  paint();
  return {
    el: root,
    setMessage(t) { msg.textContent = t; },
    setSubtitle(t) { sub.textContent = t; },
    setLocked(on) { root.classList.toggle('locked', on); },
  };
}
