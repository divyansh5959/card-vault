# Card Vault

A small installable web app for your credit cards, debit cards and gift vouchers. It is plain HTML, CSS and JavaScript with no backend: everything runs in the browser and your data stays in that browser's local storage, encrypted.

**Open it:** https://divyansh5959.github.io/card-vault/

## Features

- **Credit, Debit and Gift card tabs**, each with its own search, filters and sort.
- **Smart card entry:** the number is grouped as you type, the network (Visa, Mastercard, RuPay, Amex, Diners, Discover, JCB, Maestro, UnionPay) is detected from the first digits, the Luhn checksum is checked, and the cursor moves on to expiry and CVV by itself. Variant chips (Signature, Infinite, World, Select…) and card-name suggestions for 40+ Indian banks fill the rest. A live preview shows the card as you type.
- **One-tap copy** of the number, expiry, CVV, voucher code and voucher PIN, plus "Copy all" and the Android share sheet.
- **Gift cards** with company, amount, voucher code, optional PIN and expiry date. Each card shows "Expires in N days" at the top, the soonest expiring come first, and you can mark a voucher as used.
- **Shared credit limits:** link same-bank cards that share one limit so the total limit counts it once.
- **Search everywhere:** bank, card name, acronyms ("pnb"), last four digits, brand, code or amount. Matches in other tabs are offered as a shortcut.
- **Backup and transfer:** encrypted backup file (download, or share to Drive/WhatsApp on Android), readable JSON export, and import with merge or replace. Use it to move everything from your phone to Chrome on a laptop.
- **Installable PWA** that works offline, with light and dark themes, a laptop layout with a side rail, and keyboard shortcuts (`/` search, `n` new, `1`–`4` tabs).

## Security model

- One random AES-256-GCM key encrypts the whole vault. That key is stored only in wrapped form:
  - by your **6-digit PIN** (PBKDF2-SHA256, 600,000 rounds). The PIN itself is never stored;
  - optionally by a **fingerprint passkey** (WebAuthn PRF extension, Chrome on Android). The phone releases the secret only after it verifies you;
  - optionally by a **backup password**, which encrypts backup files and can reset a forgotten PIN.
- Auto-lock when you leave the app (immediately, or after 1, 5 or 15 minutes) and after 10 idle minutes.
- After 5 wrong PINs the lock screen makes you wait, starting at 30 seconds and doubling.
- A strict Content Security Policy: no third-party scripts, fonts or network calls.

Limits worth knowing: anyone with your PIN, or your phone unlocked with the app open, can see your cards. Someone who copies the browser's storage files could try all one million PINs offline, so keep the phone's own screen lock on and don't use the app on shared computers. The readable JSON export is plain text.

## Install on Android

1. Open the link above in Chrome.
2. Tap **Install app** in the banner, or ⋮ → **Add to Home screen** → **Install**.
3. Create your PIN, and turn on fingerprint unlock when asked.

## Move data to a laptop

1. On the phone: Settings → **Export encrypted backup** (or **Share backup file**). Set a backup password the first time.
2. On the laptop: open the same link in Chrome → **Restore from a backup file** → enter the backup password → choose a PIN.

Each browser keeps its own copy. Import again (Merge) whenever you want to bring changes across; the newer version of each card wins.

## Development

No build step and nothing to run in production: GitHub Pages serves the static files. For local development only, serve the folder over HTTP (service workers and ES modules do not run from `file://`):

```sh
npm run serve        # python3 -m http.server 8437 --bind 127.0.0.1
npm test             # unit tests, Node 20+
```

`tests/e2e.mjs` drives the whole app in headless Chromium with Playwright (`npm i -D playwright-core`, then `CHROME=/path/to/chrome OUT=/tmp/cv node tests/e2e.mjs` while the server runs).

## License

MIT
