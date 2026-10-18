// SVG icons and network marks. All markup here is constant (never user data),
// so building it from strings is safe; no style attributes, so the strict CSP holds.

const NS = 'http://www.w3.org/2000/svg';

const PATHS = {
  credit: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6 15h4"/>',
  debit: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M6 15h2M11 15h2M2.5 9.5h19"/><circle cx="17.5" cy="14.5" r="1.5"/>',
  gift: '<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M3 12h18M12 8v13"/><path d="M12 8c-1.5-3-5-3.5-5.5-1.5S9 8 12 8c3 0 6-1.5 5.5-1.5S13.5 5 12 8z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  copyAll: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11M11.5 12.5h6M11.5 16h6"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M10.7 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.2 3.1M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6M3 3l18 18M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 13.3 7.6 4.4M15.8 6.3 8.2 10.7"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  fingerprint: '<path d="M12 11v3a8 8 0 0 1-1 4"/><path d="M8.5 7.5A5 5 0 0 1 17 11v1"/><path d="M7 11a5 5 0 0 1 .5-2.2M7 14.5c0 2-.4 3.6-1 5"/><path d="M17 15c0 2.4-.4 4.4-1.2 6"/><path d="M4.5 9A8 8 0 0 1 19.6 8.5M3.5 13.5a8 8 0 0 0 .4-2.5"/><path d="M10 11a2 2 0 1 1 4 0v2.5c0 2.8-.6 5.2-1.8 7"/>',
  backspace: '<path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"/><path d="m12 9 6 6M18 9l-6 6"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M4 3h16"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M17 5l3 3M14.5 7.5l2 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  wifi: '<path d="M8.5 16.5a5 5 0 0 1 0-9M5.5 19.5a9.5 9.5 0 0 1 0-15M11.5 13.5a1.6 1.6 0 0 1 0-3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};

function parse(markup) {
  const tpl = document.createElementNS(NS, 'svg');
  tpl.innerHTML = markup;
  return tpl;
}

export function icon(name, cls = '') {
  const svg = parse(PATHS[name] || '');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `ico ${cls}`.trim());
  return svg;
}

// Simplified network marks, drawn for use on dark card faces.
const MARKS = {
  visa: ['0 0 60 20', '<text x="30" y="17" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="19" font-weight="900" font-style="italic" fill="currentColor" letter-spacing="-0.5">VISA</text>'],
  mastercard: ['0 0 40 24', '<circle cx="14" cy="12" r="10" fill="#eb001b"/><circle cx="26" cy="12" r="10" fill="#f79e1b"/><path d="M20 4a10 10 0 0 1 0 16 10 10 0 0 1 0-16z" fill="#ff5f00"/>'],
  maestro: ['0 0 40 24', '<circle cx="14" cy="12" r="10" fill="#0099df"/><circle cx="26" cy="12" r="10" fill="#e3001b"/><path d="M20 4a10 10 0 0 1 0 16 10 10 0 0 1 0-16z" fill="#6c6bbd"/>'],
  rupay: ['0 0 70 22', '<text x="0" y="17" font-family="Arial,Helvetica,sans-serif" font-size="17" font-weight="800" font-style="italic" fill="currentColor">RuPay</text><path d="M54 3l8 8-8 8z" fill="#f7941d"/><path d="M60 3l8 8-8 8z" fill="#00a651"/>'],
  amex: ['0 0 54 22', '<rect width="54" height="22" rx="3" fill="#2e77bc"/><text x="27" y="15.5" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="900" fill="#fff" letter-spacing="1">AMEX</text>'],
  diners: ['0 0 24 24', '<circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="15" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/>'],
  discover: ['0 0 76 20', '<text x="0" y="15" font-family="Arial,Helvetica,sans-serif" font-size="14" font-weight="800" fill="currentColor">DISC</text><circle cx="45" cy="10" r="6.5" fill="#f58220"/><text x="52" y="15" font-family="Arial,Helvetica,sans-serif" font-size="14" font-weight="800" fill="currentColor">VER</text>'],
  jcb: ['0 0 42 24', '<rect x="0" y="1" width="13" height="22" rx="3" fill="#0e4c96"/><rect x="14.5" y="1" width="13" height="22" rx="3" fill="#e21836"/><rect x="29" y="1" width="13" height="22" rx="3" fill="#00a14b"/><text x="6.5" y="16" text-anchor="middle" font-family="Arial" font-size="10" font-weight="900" fill="#fff">J</text><text x="21" y="16" text-anchor="middle" font-family="Arial" font-size="10" font-weight="900" fill="#fff">C</text><text x="35.5" y="16" text-anchor="middle" font-family="Arial" font-size="10" font-weight="900" fill="#fff">B</text>'],
  unionpay: ['0 0 60 22', '<text x="30" y="16" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="800" fill="currentColor">UnionPay</text>'],
};

export function networkMark(id, cls = 'mark') {
  const m = MARKS[id];
  if (!m) return null;
  const svg = parse(m[1]);
  svg.setAttribute('viewBox', m[0]);
  svg.setAttribute('class', cls);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', id);
  return svg;
}

export function chip() {
  const svg = parse(
    '<rect x="0.5" y="0.5" width="39" height="29" rx="5" fill="url(#cvchip)" stroke="#8a6a2a" stroke-opacity=".5"/>' +
    '<defs><linearGradient id="cvchip" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3d58a"/><stop offset=".5" stop-color="#c9a24a"/><stop offset="1" stop-color="#ead08a"/></linearGradient></defs>' +
    '<path d="M0 10h13M0 20h13M27 10h13M27 20h13M13 0v30M27 0v30M13 15h14" stroke="#7a5a1a" stroke-opacity=".55" fill="none"/>',
  );
  svg.setAttribute('viewBox', '0 0 40 30');
  svg.setAttribute('class', 'cc-chip');
  svg.setAttribute('aria-hidden', 'true');
  return svg;
}
