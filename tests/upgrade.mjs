// Upgrade test: make a vault on an older version, swap the served files to a
// newer one at the same address, and confirm the update keeps the data.
// Serve a folder on 127.0.0.1:8437 whose `card-vault` entry is a symlink (LINK);
// OLD and NEW are checkouts of the two versions (touch NEW's files so the
// server does not answer 304 from file timestamps). CACHE is NEW's cache name.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const URL = 'http://localhost:8437/card-vault/';
const LINK = process.env.LINK, OLD = process.env.OLD, NEW = process.env.NEW;
const ctx = await chromium.launchPersistentContext(process.env.PROFILE, { executablePath: process.env.CHROME, viewport: { width: 390, height: 844 } });
const page = ctx.pages()[0] || await ctx.newPage();
const pin = async (d) => { for (const x of d) await page.getByRole('button', { name: x, exact: true }).click(); };
const settle = () => page.locator('dialog').waitFor({ state: 'detached' }).catch(() => {});
fs.rmSync(LINK, { force: true }); fs.symlinkSync(OLD, LINK);
await page.goto(URL);
await page.getByRole('button', { name: 'Create my vault' }).click();
await pin('482915'); await page.getByText('Enter the same PIN again').waitFor(); await pin('482915');
await page.locator('#pageTitle', { hasText: 'Credit cards' }).waitFor({ timeout: 15000 });
await page.getByRole('button', { name: 'Not now' }).click({ timeout: 3000 }).catch(() => {}); await settle();
await page.locator('#fab').click();
await page.getByLabel('Card number').pressSequentially('5500005555555559');
await page.keyboard.type('0130'); await page.keyboard.type('456');
await page.getByPlaceholder('Start typing, e.g. HDFC').fill('HDFC Bank');
await page.getByPlaceholder('e.g. Regalia Gold').fill('Millennia');
await page.getByRole('button', { name: 'Save card' }).click(); await settle();
await page.locator('.tab-btn[data-tab=gift]').click();
await page.locator('#fab').click();
await page.getByPlaceholder('e.g. Amazon, Myntra, Swiggy').fill('Amazon');
await page.getByPlaceholder('e.g. 1,000').fill('500');
await page.getByPlaceholder('Voucher / claim code').fill('AMZ-OLD-1');
await page.getByLabel('No expiry').check();
await page.getByRole('button', { name: 'Save gift card' }).click(); await settle();
assert.match(await page.locator('#pageSub').textContent(), /₹500/);
const before = await page.evaluate(() => localStorage['cardvault.data.v1'].length);
console.log('✔ old version: vault created with 1 credit card + 1 gift card');

// Ship 1.1.0 at the same address.
fs.rmSync(LINK); fs.symlinkSync(NEW, LINK);
await page.reload();
await page.waitForTimeout(1500);
console.log('  manual update():', await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); const log = []; r.addEventListener('updatefound', () => { const w = r.installing; log.push('found'); w.addEventListener('statechange', () => log.push(w.state)); }); try { await r.update(); } catch (e) { return 'ERR ' + e.message; } log.push('after-update installing=' + (r.installing?.state) + ' waiting=' + (r.waiting?.state)); await new Promise((res) => setTimeout(res, 3000)); log.push('end waiting=' + r.waiting?.state + ' active=' + r.active?.scriptURL); return log.join(' | '); }));
await page.locator('.toast', { hasText: 'A new version is ready' }).waitFor({ timeout: 20000 });
console.log('✔ open app shows "A new version is ready"');
await Promise.all([page.waitForEvent('load'), page.locator('.toast-act', { hasText: 'Update' }).click()]);
await page.getByText('Card Vault is locked').waitFor({ timeout: 15000 });
await pin('482915');
await page.locator('#pageTitle', { hasText: 'Credit cards' }).waitFor({ timeout: 15000 });
assert.equal(await page.evaluate(() => caches.keys()).then((k) => k.join()), process.env.CACHE);
assert.equal(await page.locator('.tile').count(), 1);
assert.equal(await page.locator('.tile .cc-bank').textContent(), 'HDFC Bank');
assert.ok(await page.getByRole('button', { name: /^Filters/ }).count(), 'new 1.1.0 UI present');
await page.locator('.tab-btn[data-tab=gift]').click();
assert.equal(await page.locator('.gift').count(), 1);
assert.equal(await page.locator('.gift-brand').textContent(), 'Amazon');
console.log(`✔ after update: same PIN unlocks, card and gift card intact (data blob ${before} chars), new filters shown`);
// new feature on old data: variant prompt for the card that has none
await page.locator('.tab-btn[data-tab=credit]').click();
await page.locator('.tile .tile-face').click();
await page.locator('.variant-ask .chip', { hasText: /^World$/ }).click();
await settle();
assert.equal(await page.locator('.tile .cc-tier').textContent(), 'World');
console.log('✔ old card can get a variant after the update');
await ctx.close();
