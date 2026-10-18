// End-to-end check of Card Vault in headless Chromium.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const URL = process.env.URL || 'http://localhost:8437/';
const OUT = process.env.OUT;
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const errors = [];
let step = 'start';
const log = (m) => console.log(`✔ ${m}`);

async function newCtx(viewport, mobile = true) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile, acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: URL });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(`[${step}] ${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${step}] pageerror: ${e.message}`));
  return { ctx, page };
}

const settle = (page) => page.locator('dialog').waitFor({ state: 'detached' }).catch(() => {});
const noOverflow = async (page, where) => { const o = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]); assert.ok(o[0] <= o[1], `horizontal overflow on ${where}: ${o}`); };
const pin = async (page, digits) => {
  for (const d of digits) await page.getByRole('button', { name: d, exact: true }).click();
};
const clip = (page) => page.evaluate(() => navigator.clipboard.readText());
const shot = async (page, name) => {
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(450);
    try { await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 8000, animations: 'disabled' }); return; } catch { /* retry */ }
  }
  console.log(`  (screenshot ${name} skipped: renderer busy)`);
};
const toastText = (page) => page.locator('.toast').last().textContent();

try {
  // ---------- first run on a phone ----------
  step = 'setup';
  const { ctx, page } = await newCtx({ width: 390, height: 844 });
  await page.goto(URL);
  await page.getByRole('button', { name: 'Create my vault' }).waitFor();
  await shot(page, '01-welcome');
  await page.getByRole('button', { name: 'Create my vault' }).click();
  await pin(page, '111111');
  await page.getByText('Too easy to guess').waitFor();
  await pin(page, '482915');
  await page.getByText('Enter the same PIN again').waitFor();
  await pin(page, '482916');
  await page.getByText('The two PINs did not match').waitFor();
  await pin(page, '482915');
  await page.getByText('Enter the same PIN again').waitFor();
  await pin(page, '482915');
  await page.locator('#pageTitle', { hasText: 'Credit cards' }).waitFor({ timeout: 15000 });
  log('vault created; weak and mismatched PINs rejected');
  const offer = page.getByRole('button', { name: 'Not now' });
  await offer.waitFor({ timeout: 2500 }).then(() => offer.click()).then(() => log('fingerprint offer shown and dismissed')).catch(() => log('no fingerprint offer (PRF not reported)'));
  await page.locator('dialog[open]').waitFor({ state: 'detached' }).catch(() => {});

  const ls = await page.evaluate(() => JSON.stringify(localStorage));
  assert.ok(!ls.includes('482915'), 'PIN must not be stored');
  await shot(page, '02-empty-credit');

  // ---------- add credit cards ----------
  step = 'add-credit';
  await settle(page); await page.locator('#fab').click();
  const num = page.getByLabel('Card number');
  await num.pressSequentially('4111111111111111');
  assert.equal(await num.inputValue(), '4111 1111 1111 1111');
  await page.getByText('Visa · number looks valid').waitFor();
  const focused = await page.evaluate(() => document.activeElement.placeholder);
  if (focused !== 'MM/YY') console.log('  dbg', await page.evaluate(() => JSON.stringify({ dialogs: [...document.querySelectorAll('dialog')].map((d) => d.getAttribute('aria-label') + ':' + d.open), hint: document.querySelector('.field-hint')?.textContent, ae: document.activeElement.outerHTML.slice(0, 120) })));
  assert.equal(focused, 'MM/YY', 'auto-advance to expiry');
  await page.keyboard.type('0829');
  assert.equal(await page.evaluate(() => document.activeElement.placeholder), '123', 'auto-advance to CVV');
  await page.keyboard.type('123');
  await page.getByPlaceholder('Start typing, e.g. HDFC').fill('HDFC Bank');
  await page.getByPlaceholder('e.g. Regalia Gold').fill('Regalia Gold');
  await page.locator('.form .chips .chip', { hasText: 'Signature' }).click();
  await page.getByPlaceholder('As printed on the card').fill('divyansh bansal');
  await page.getByPlaceholder('e.g. 3,00,000').fill('300000');
  assert.equal(await page.getByPlaceholder('e.g. 3,00,000').inputValue(), '3,00,000');
  await shot(page, '03-add-card-form');
  await page.getByRole('button', { name: 'Save card' }).click();
  await page.locator('.tile').first().waitFor();
  log('Visa card saved with auto-format, auto-advance, tier and Indian limit grouping');

  // Amex, second HDFC card sharing the limit, RuPay with a bad checksum warning
  await settle(page); await page.locator('#fab').click();
  await page.getByLabel('Card number').pressSequentially('378282246310005');
  assert.equal(await page.getByLabel('Card number').inputValue(), '3782 822463 10005');
  await page.getByText('American Express · number looks valid').waitFor();
  await page.keyboard.type('1127');
  await page.keyboard.type('1234');
  await page.getByPlaceholder('Start typing, e.g. HDFC').fill('American Express');
  await page.getByPlaceholder('e.g. Regalia Gold').fill('Platinum Travel');
  await page.getByRole('button', { name: 'Save card' }).click();
  await page.locator('.tile').nth(1).waitFor();
  log('Amex detected: 4-6-5 grouping and 4-digit CVV');

  await settle(page); await page.locator('#fab').click();
  await page.getByLabel('Card number').pressSequentially('5500005555555559');
  await page.keyboard.type('0130');
  await page.keyboard.type('456');
  await page.getByPlaceholder('Start typing, e.g. HDFC').fill('HDFC Bank');
  await page.getByPlaceholder('Start typing, e.g. HDFC').dispatchEvent('change');
  await page.getByPlaceholder('e.g. Regalia Gold').fill('Millennia');
  await page.getByText('Shares this limit with:').waitFor();
  await page.locator('.share-box input[type=checkbox]').check();
  await page.getByRole('button', { name: 'Save card' }).click();
  await page.locator('.tile').nth(2).waitFor();
  const sub = await page.locator('#pageSub').textContent();
  assert.match(sub, /3 cards · Total limit ₹3,50,000|3 cards · Total limit ₹3,00,000/);
  assert.ok(sub.includes('₹3,00,000'), `shared limit counted once: ${sub}`);
  log(`shared limit counted once: "${sub}"`);

  // duplicate detection
  await settle(page); await page.locator('#fab').click();
  await page.getByLabel('Card number').pressSequentially('4111111111111111');
  await page.getByPlaceholder('Start typing, e.g. HDFC').fill('HDFC Bank');
  await page.getByRole('button', { name: 'Save card' }).click();
  await page.getByText('This number is already saved').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  log('duplicate card number rejected');

  // ---------- copy ----------
  step = 'copy';
  await page.locator('.tile', { hasText: 'Regalia' }).getByRole('button', { name: 'Number', exact: true }).click();
  assert.equal(await clip(page), '4111111111111111');
  await page.locator('.tile', { hasText: 'Regalia' }).getByRole('button', { name: 'Copy CVV' }).click();
  assert.equal(await clip(page), '123');
  await page.locator('.tile', { hasText: 'Regalia' }).getByRole('button', { name: 'Copy all details' }).click();
  assert.match(await clip(page), /HDFC Bank Regalia Gold \(Visa Signature\)\nNumber: 4111 1111 1111 1111\nExpiry: 08\/29\nCVV: 123\nName: DIVYANSH BANSAL/);
  log('copy number, CVV and all details');

  // reveal toggles the face
  const face = page.locator('.tile', { hasText: 'Regalia' }).locator('.cc-number');
  assert.equal(await face.textContent(), '•••• •••• •••• 1111');
  await page.locator('.tile', { hasText: 'Regalia' }).getByRole('button', { name: 'Show number' }).click();
  assert.equal(await page.locator('.tile', { hasText: 'Regalia' }).locator('.cc-number').textContent(), '4111 1111 1111 1111');
  log('reveal shows full number');
  await noOverflow(page, 'credit list'); await shot(page, '04-credit-list');

  // ---------- search, filters, cross-tab hint ----------
  step = 'search';
  await page.locator('#search').fill('amex');
  assert.equal(await page.locator('.tile').count(), 1);
  await page.locator('#search').fill('1111');
  assert.equal(await page.locator('.tile').count(), 1);
  await page.locator('#search').fill('');
  await page.locator('.chips[aria-label=Bank] .chip', { hasText: 'HDFC Bank' }).click();
  assert.equal(await page.locator('.tile').count(), 2);
  await page.locator('.chips[aria-label=Bank] .chip', { hasText: 'All banks' }).click();
  await page.locator('select[aria-label=Sort]').selectOption('expiry');
  const firstBank = await page.locator('.tile .cc-bank').first().textContent();
  assert.equal(firstBank, 'American Express', 'expiry sort puts 11/27 Amex before 01/30 and 08/29? (11/27 earliest)');
  log('search by name, last 4; bank filter; expiry sort');

  // ---------- debit tab ----------
  step = 'debit';
  await page.locator('.tab-btn[data-tab=debit]').click();
  await page.locator('#pageTitle', { hasText: 'Debit cards' }).waitFor();
  await settle(page); await page.locator('#fab').click();
  await page.getByLabel('Card number').pressSequentially('6521000000000005');
  const hint = await page.locator('.field-hint').first().textContent();
  assert.ok(hint.startsWith('RuPay'), hint);
  await page.keyboard.press('Tab');
  await page.getByPlaceholder('MM/YY').fill('');
  await page.getByPlaceholder('MM/YY').pressSequentially('1126');
  await page.getByPlaceholder('Start typing, e.g. HDFC').fill('State Bank of India (SBI)');
  await page.getByPlaceholder('e.g. Regalia Gold').fill('Platinum Debit');
  assert.equal(await page.getByPlaceholder('e.g. 3,00,000').count(), 0, 'no credit limit on debit');
  await page.getByRole('button', { name: 'Save card' }).click();
  await page.locator('.tile').first().waitFor();
  assert.equal(await page.locator('.tile').count(), 1);
  log('RuPay debit card in its own tab (no limit field)');

  // ---------- gift cards ----------
  step = 'gift';
  await page.locator('.tab-btn[data-tab=gift]').click();
  await page.locator('#pageTitle', { hasText: 'Gift cards' }).waitFor();
  const addGift = async ({ brand, amount, code, pinCode, days, noExpiry }) => {
    await settle(page); await page.locator('#fab').click();
    await page.getByPlaceholder('e.g. Amazon, Myntra, Swiggy').fill(brand);
    await page.getByPlaceholder('e.g. 1,000').fill(String(amount));
    await page.getByPlaceholder('Voucher / claim code').fill(code);
    if (pinCode) await page.getByPlaceholder('Only if the voucher has one').fill(pinCode);
    if (noExpiry) await page.getByLabel('No expiry').check();
    else {
      const d = new Date(); d.setDate(d.getDate() + days);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      await page.locator('input[type=date]').fill(iso);
      await page.locator('.field-hint', { hasText: `Expires in ${days} days` }).or(page.locator('.field-hint', { hasText: 'Expires' })).first().waitFor();
    }
    if (brand === 'Amazon') await shot(page, '06-add-gift-form');
    await page.getByRole('button', { name: 'Save gift card' }).click();
    await page.locator('dialog[open]').waitFor({ state: 'detached' });
  };
  await addGift({ brand: 'Myntra', amount: 1000, code: 'MYN-8842-KQ', days: 45 });
  await addGift({ brand: 'Amazon', amount: 500, code: 'AMZ1234ABCD9', pinCode: '772211', days: 4 });
  await addGift({ brand: 'Swiggy', amount: 250, code: 'SWG-0091', days: 20 });
  await addGift({ brand: 'Croma', amount: 2000, code: 'CRM-7781', noExpiry: true });
  const pills = await page.locator('.gift .pill').allTextContents();
  assert.deepEqual(pills, ['Expires in 4 days', 'Expires in 20 days', 'Expires in 45 days', 'No expiry'], `sorted by expiry: ${pills}`);
  const gsub = await page.locator('#pageSub').textContent();
  assert.equal(gsub, '₹3,750 usable across 4 cards · 2 expiring within 30 days');
  log(`gift cards sorted soonest first with "Expires in N days" pills; summary "${gsub}"`);
  await noOverflow(page, 'gift list'); await shot(page, '05-gift-list');

  await page.locator('.gift', { hasText: 'Amazon' }).getByRole('button', { name: 'Copy voucher code' }).click();
  assert.equal(await clip(page), 'AMZ1234ABCD9');
  await page.locator('.gift', { hasText: 'Amazon' }).getByRole('button', { name: 'Copy voucher PIN' }).click();
  assert.equal(await clip(page), '772211');
  await page.locator('.gift', { hasText: 'Swiggy' }).getByRole('button', { name: 'Mark used' }).click();
  assert.equal(await page.locator('.gift').count(), 3, 'used card leaves the Active filter');
  await page.locator('.chips[aria-label=Status] .chip', { hasText: 'Used' }).click();
  assert.equal(await page.locator('.gift').count(), 1);
  await page.locator('.chips[aria-label=Status] .chip', { hasText: 'Expiring' }).click();
  assert.equal(await page.locator('.gift').count(), 1, 'only Amazon (4 days) is expiring and unused');
  await page.locator('.chips[aria-label=Status] .chip', { hasText: 'Active' }).click();
  await page.locator('#search').fill('myn');
  assert.equal(await page.locator('.gift').count(), 1);
  await page.locator('#search').fill('hdfc');
  await page.locator('.hint-btn', { hasText: 'Credit cards' }).waitFor();
  log('gift copy code/PIN, mark used, status filters, search, cross-tab hint');
  await page.locator('.hint-btn').click();
  await page.locator('#pageTitle', { hasText: 'Credit cards' }).waitFor();
  assert.equal(await page.locator('.tile').count(), 2);
  await page.locator('#search').fill('');

  // ---------- details, edit, delete + undo ----------
  step = 'details';
  await settle(page);
  await page.locator('.tile', { hasText: 'Platinum Travel' }).locator('.tile-face').click();
  await page.locator('dialog[open] .d-row', { hasText: 'Number' }).waitFor();
  await shot(page, '07-card-detail');
  await page.locator('dialog[open]').getByRole('button', { name: 'Edit' }).click();
  await page.getByPlaceholder('e.g. Regalia Gold').fill('Platinum Charge');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.locator('.tile', { hasText: 'Platinum Charge' }).waitFor();
  await settle(page);
  await page.locator('.tile', { hasText: 'Platinum Charge' }).locator('.tile-face').click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Delete' }).click();
  await page.locator('dialog[aria-label="Delete Card?"]').getByRole('button', { name: 'Delete', exact: true }).click();
  await page.locator('.toast-act', { hasText: 'Undo' }).click();
  await page.locator('.tile', { hasText: 'Platinum Charge' }).waitFor();
  log('detail sheet, edit, delete and undo');

  // ---------- list density ----------
  step = 'settings';
  await page.locator('.tab-btn[data-tab=settings]').click();
  await page.locator('#pageTitle', { hasText: 'Settings' }).waitFor();
  await shot(page, '08-settings');
  await page.getByRole('radio', { name: 'List' }).click();
  await page.locator('.tab-btn[data-tab=credit]').click();
  assert.equal(await page.locator('.row-item').count(), 3);
  await shot(page, '09-list-view');
  await page.locator('.tab-btn[data-tab=settings]').click();
  await page.getByRole('radio', { name: 'Cards' }).click();
  await page.getByRole('radio', { name: 'Light' }).click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
  await page.locator('.tab-btn[data-tab=credit]').click();
  await shot(page, '10-light-credit');
  await page.locator('.tab-btn[data-tab=settings]').click();
  await page.getByRole('radio', { name: 'Dark' }).click();
  log('list view and theme switching');

  // ---------- encrypted backup ----------
  step = 'backup';
  await page.getByRole('button', { name: /Export encrypted backup/ }).click();
  await page.getByRole('heading', { name: 'Set a backup password' }).waitFor();
  await page.getByRole('button', { name: 'Suggest one' }).click();
  const suggested = await page.getByLabel('Backup password', { exact: true }).inputValue();
  assert.match(suggested, /^([a-z]+-){5}\d{2}$/);
  const BACKUP_PW = 'river-mango-tiger-salt-cloud-42';
  await page.getByLabel('Backup password', { exact: true }).fill(BACKUP_PW);
  await page.getByLabel('Repeat backup password').fill(BACKUP_PW);
  const dlP = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save password' }).click();
  const dl = await dlP;
  const backupPath = `${OUT}/backup.json`;
  await dl.saveAs(backupPath);
  const backupText = fs.readFileSync(backupPath, 'utf8');
  for (const s of ['4111111111111111', 'AMZ1234ABCD9', 'HDFC', 'Amazon', '772211']) assert.ok(!backupText.includes(s), `backup leaks ${s}`);
  assert.match(dl.suggestedFilename(), /^card-vault-backup-\d{4}-\d{2}-\d{2}\.json$/);
  log(`encrypted backup downloaded (${dl.suggestedFilename()}), contains no plaintext`);

  // readable export
  await page.getByRole('button', { name: /Export readable JSON/ }).click();
  const dl2P = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export anyway' }).click();
  const dl2 = await dl2P;
  await dl2.saveAs(`${OUT}/readable.json`);
  const readable = JSON.parse(fs.readFileSync(`${OUT}/readable.json`, 'utf8'));
  assert.equal(readable.items.length, 8);
  log('readable JSON export has all 8 items');

  // ---------- lock / unlock / lockout ----------
  step = 'lock';
  await page.getByRole('button', { name: 'Lock now' }).first().click();
  await page.getByRole('heading', { name: 'Card Vault is locked' }).waitFor();
  assert.equal(await page.locator('.tile, .gift').count(), 0);
  await shot(page, '11-locked');
  for (let i = 0; i < 4; i++) { await pin(page, '000000'); await page.getByText('Wrong PIN').waitFor(); }
  await pin(page, '000001');
  await page.getByText(/Too many wrong tries/).waitFor();
  log('5 wrong PINs trigger a timed lockout');
  await page.reload();
  await page.getByText(/Too many wrong tries/).waitFor();
  log('lockout survives reload');
  await page.evaluate(() => { const m = JSON.parse(localStorage['cardvault.meta.v1']); m.failed.until = 0; localStorage['cardvault.meta.v1'] = JSON.stringify(m); });
  await page.reload();
  await page.getByRole('heading', { name: 'Card Vault is locked' }).waitFor();
  await pin(page, '482915');
  await page.locator('#pageTitle', { hasText: 'Credit cards' }).waitFor({ timeout: 15000 });
  log('correct PIN unlocks');

  // forgot PIN via backup password
  await page.getByRole('button', { name: 'Lock now' }).first().click();
  await page.getByRole('button', { name: 'Forgot PIN?' }).click();
  await page.getByLabel('Backup password').fill('wrong password here');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('Wrong backup password.').waitFor();
  await page.getByLabel('Backup password').fill(BACKUP_PW);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('Choose a new PIN').waitFor();
  await pin(page, '305917'); await page.getByText('Enter the same PIN again').waitFor(); await pin(page, '305917');
  await page.locator('#pageTitle', { hasText: 'Credit cards' }).waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Lock now' }).first().click();
  await pin(page, '305917');
  await page.locator('#pageTitle', { hasText: 'Credit cards' }).waitFor({ timeout: 15000 });
  log('forgot PIN: reset with backup password, new PIN works');

  // keyboard PIN entry (laptop)
  await page.getByRole('button', { name: 'Lock now' }).first().click();
  await page.keyboard.type('305917');
  await page.locator('#pageTitle', { hasText: 'Credit cards' }).waitFor({ timeout: 15000 });
  log('PIN can be typed on a keyboard');

  // auto-lock after leaving the app
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.evaluate(() => {
    // pretend two minutes passed
    const realNow = Date.now; Date.now = () => realNow() + 120000;
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    Date.now = realNow;
  });
  await page.getByRole('heading', { name: 'Card Vault is locked' }).waitFor();
  log('auto-locks after leaving the app for longer than the setting');

  // ---------- fingerprint (virtual authenticator with PRF) ----------
  step = 'prf';
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  let prfOk = false;
  try {
    await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true } });
    prfOk = true;
  } catch (e) { console.log('virtual PRF authenticator unavailable:', e.message); }
  if (prfOk) {
    await page.reload();
    await pin(page, '305917');
    await page.locator('#pageTitle', { hasText: 'Credit cards' }).waitFor({ timeout: 15000 });
    await page.locator('.tab-btn[data-tab=settings]').click();
    const sw = page.getByRole('switch', { name: 'Fingerprint unlock' });
    if (await sw.count()) {
      await sw.click();
      await page.locator('.toast').last().waitFor();
      const t = await toastText(page);
      console.log('  fingerprint enrol toast:', t);
      if (t.includes('is on')) {
        const meta = await page.evaluate(() => JSON.parse(localStorage['cardvault.meta.v1']).prf);
        assert.ok(meta && meta.credId && meta.wrap, 'prf record stored');
        await page.getByRole('button', { name: 'Lock now' }).first().click();
        await page.locator('#pageTitle', { hasText: 'Settings' }).waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
        await page.locator('#pageTitle', { hasText: 'Settings' }).waitFor({ timeout: 15000 });
        assert.equal(await page.locator('.pin-screen').count(), 0);
        log('fingerprint unlock: enrolled, then lock screen auto-unlocked through the passkey');
      }
    } else {
      console.log('  fingerprint switch not shown (PRF capability not reported)');
    }
  }

  await ctx.close();

  // ---------- restore on a "laptop" ----------
  step = 'restore';
  const lap = await newCtx({ width: 1440, height: 900 }, false);
  await lap.page.goto(URL);
  await lap.page.getByRole('button', { name: 'Restore from a backup file' }).waitFor();
  await shot(lap.page, '12-desktop-welcome');
  const fcP = lap.page.waitForEvent('filechooser');
  await lap.page.getByRole('button', { name: 'Restore from a backup file' }).click();
  await (await fcP).setFiles(backupPath);
  await lap.page.getByLabel('Backup password').fill(BACKUP_PW);
  await lap.page.getByRole('button', { name: 'Continue' }).click();
  await lap.page.getByText('Choose a 6-digit PIN').waitFor({ timeout: 15000 });
  await lap.page.keyboard.type('615243');
  await lap.page.getByText('Enter the same PIN again').waitFor();
  await lap.page.keyboard.type('615243');
  await lap.page.locator('#pageTitle', { hasText: 'Credit cards' }).waitFor({ timeout: 20000 });
  const offer2 = lap.page.getByRole('button', { name: 'Not now' });
  await offer2.waitFor({ timeout: 2500 }).then(() => offer2.click()).catch(() => {});
  await settle(lap.page);
  assert.equal(await lap.page.locator('.tile').count(), 3);
  await noOverflow(lap.page, 'desktop credit'); await shot(lap.page, '13-desktop-credit');
  await lap.page.locator('.rail-btn[data-tab=gift]').click();
  await lap.page.locator('.chips[aria-label=Status] .chip', { hasText: 'All' }).click();
  assert.equal(await lap.page.locator('.gift').count(), 4);
  await shot(lap.page, '14-desktop-gift');
  log('laptop: restored encrypted backup, all 3 credit + 4 gift cards present');

  // keyboard shortcuts on laptop
  await lap.page.keyboard.press('1');
  await lap.page.locator('#pageTitle', { hasText: 'Credit cards' }).waitFor();
  await lap.page.keyboard.press('/');
  assert.equal(await lap.page.evaluate(() => document.activeElement.id), 'search');
  await lap.page.keyboard.press('Escape');
  await lap.page.locator('body').click({ position: { x: 700, y: 20 } });
  await lap.page.keyboard.press('n');
  await lap.page.locator('dialog[open]').waitFor();
  await lap.page.keyboard.press('Escape');
  log('laptop shortcuts: 1-4 tabs, / search, n new');

  // merge import of the readable file adds nothing new
  await lap.page.locator('.rail-btn[data-tab=settings]').click();
  const fc2 = lap.page.waitForEvent('filechooser');
  await lap.page.getByRole('button', { name: /Import backup or JSON/ }).click();
  await (await fc2).setFiles(`${OUT}/readable.json`);
  await lap.page.locator('.import-stats').waitFor();
  const stats = await lap.page.locator('.import-stats').textContent();
  assert.ok(stats.includes('0 new'), stats);
  await lap.page.getByRole('button', { name: 'Merge', exact: true }).click();
  log(`merge import preview: ${stats.replace(/\s+/g, ' ')}`);

  // erase
  await lap.page.getByRole('button', { name: /Erase everything/ }).click();
  await lap.page.getByLabel('Type ERASE to confirm').fill('erase');
  await lap.page.getByRole('button', { name: 'Erase', exact: true }).click();
  await lap.page.getByRole('button', { name: 'Create my vault' }).waitFor();
  assert.equal(await lap.page.evaluate(() => localStorage.length), 0);
  log('erase clears local storage');

  // ---------- offline after install ----------
  step = 'offline';
  const sw = await lap.page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
  assert.ok(sw, 'service worker active');
  await lap.ctx.setOffline(true);
  await lap.page.reload();
  await lap.page.getByRole('button', { name: 'Create my vault' }).waitFor();
  log('service worker serves the app offline');
  await lap.ctx.close();
} catch (e) {
  console.error(`✘ failed at step "${step}":`, e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  const real = errors.filter((e) => !/favicon/.test(e));
  console.log(real.length ? `console problems:\n${real.join('\n')}` : 'console: no errors or warnings');
}
