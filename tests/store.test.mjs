import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newDataKey, sealJSON, openJSON, wrapWithSecret, unwrapWithSecret, wrapWithPrf, unwrapWithPrf,
  b64, randomBytes, passwordScore, suggestPassphrase,
} from '../js/crypto.js';
import {
  createVault, loadMeta, readVault, writeVault, sanitizeItem, sanitizeItems, mergeItems,
  makeEncryptedBackup, makePlainExport, parseBackupFile, openEncryptedBackup, makeBackupWrap, META_KEY, DATA_KEY,
} from '../js/store.js';
import { WORDS } from '../js/data.js';

// Minimal localStorage stand-in.
function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
    dump: () => Object.fromEntries(m),
  };
}

const FAST = 1000; // iterations for tests; production uses 600k

test('seal/open round trip and tamper detection', async () => {
  const dek = await newDataKey();
  const box = await sealJSON(dek, { a: 1, s: 'hello' });
  assert.deepEqual(await openJSON(dek, box), { a: 1, s: 'hello' });
  const bad = { ...box, ct: b64.enc(b64.dec(box.ct).map((x, i) => (i === 3 ? x ^ 1 : x))) };
  await assert.rejects(openJSON(dek, bad));
  await assert.rejects(openJSON(dek, box, 'backup'), 'wrong AAD must fail');
});

test('PIN wrap: right PIN unwraps, wrong PIN fails', async () => {
  const dek = await newDataKey();
  const wrap = await wrapWithSecret(dek, '482915', FAST);
  const back = await unwrapWithSecret(wrap, '482915');
  const box = await sealJSON(dek, { ok: true });
  assert.deepEqual(await openJSON(back, box), { ok: true });
  await assert.rejects(unwrapWithSecret(wrap, '482916'));
  assert.equal(JSON.stringify(wrap).includes('482915'), false);
});

test('PRF wrap round trip', async () => {
  const dek = await newDataKey();
  const secret = randomBytes(32);
  const salt = b64.enc(randomBytes(16));
  const wrap = await wrapWithPrf(dek, secret, salt);
  const back = await unwrapWithPrf(wrap, secret, salt);
  const box = await sealJSON(dek, [1, 2]);
  assert.deepEqual(await openJSON(back, box), [1, 2]);
  await assert.rejects(unwrapWithPrf(wrap, randomBytes(32), salt));
});

test('vault on disk holds no plaintext card data or PIN', async () => {
  const ls = memStorage();
  const vault = { items: [sanitizeItem({ kind: 'credit', bank: 'HDFC Bank', number: '4111111111111111', cvv: '987' })], prefs: { holder: 'SECRET NAME' } };
  const { dek } = await createVault('482915', ls, vault);
  const raw = JSON.stringify(ls.dump());
  for (const needle of ['4111111111111111', '987', 'HDFC', 'SECRET NAME', '482915']) assert.equal(raw.includes(needle), false, needle);
  assert.ok(loadMeta(ls).pinWrap);
  const read = await readVault(dek, ls);
  assert.equal(read.items[0].number, '4111111111111111');
  read.items.push(sanitizeItem({ kind: 'gift', brand: 'Amazon', code: 'XYZ-1', amount: 500, expiry: '2027-01-01' }));
  await writeVault(dek, read, ls);
  assert.equal((await readVault(dek, ls)).items.length, 2);
  assert.ok(ls.getItem(META_KEY) && ls.getItem(DATA_KEY));
});

test('sanitizeItem enforces kinds, required fields and shapes', () => {
  assert.equal(sanitizeItem({ kind: 'hack' }), null);
  assert.equal(sanitizeItem({ kind: 'credit', bank: 'X' }), null);
  assert.equal(sanitizeItem({ kind: 'gift', brand: 'A' }), null);
  const c = sanitizeItem({ kind: 'debit', bank: 'SBI', number: '4111-1111-1111-1111', cvv: '12a3', expiry: '1/29', network: 'evil', limit: '5000', notes: 'x'.repeat(900) });
  assert.equal(c.number, '4111111111111111');
  assert.equal(c.cvv, '123');
  assert.equal(c.expiry, '');
  assert.equal(c.network, 'other');
  assert.equal(c.limit, '');
  assert.equal(c.notes.length, 500);
  const g = sanitizeItem({ kind: 'gift', brand: 'Myntra', code: ' AB12 ', amount: '-5', expiry: '2027-02-30x', used: 'yes' });
  assert.equal(g.code, 'AB12');
  assert.equal(g.amount, 0);
  assert.equal(g.expiry, '');
  assert.equal(g.used, false);
  const dupIds = sanitizeItems([{ id: 'a', kind: 'gift', brand: 'A', code: '1' }, { id: 'a', kind: 'gift', brand: 'B', code: '2' }]);
  assert.notEqual(dupIds[0].id, dupIds[1].id);
});

test('merge: newer wins by id or by card number / voucher code', () => {
  const cur = sanitizeItems([
    { id: '1', kind: 'credit', bank: 'HDFC', number: '4111111111111111', name: 'old', updatedAt: 100 },
    { id: '2', kind: 'gift', brand: 'Amazon', code: 'AAA', amount: 1, updatedAt: 100 },
    { id: '3', kind: 'debit', bank: 'SBI', number: '6521000000000000', updatedAt: 500 },
  ]);
  const inc = sanitizeItems([
    { id: 'x', kind: 'credit', bank: 'HDFC', number: '4111111111111111', name: 'new', updatedAt: 200 },
    { id: 'y', kind: 'gift', brand: 'amazon', code: 'aaa', amount: 9, updatedAt: 50 },
    { id: '3', kind: 'debit', bank: 'SBI', number: '6521000000000000', updatedAt: 400 },
    { id: 'z', kind: 'gift', brand: 'Swiggy', code: 'S1', amount: 100, updatedAt: 10 },
  ]);
  const { items, stats } = mergeItems(cur, inc);
  assert.deepEqual(stats, { added: 1, updated: 1, unchanged: 2 });
  assert.equal(items.length, 4);
  assert.equal(items.find((i) => i.id === '1').name, 'new');
  assert.equal(items.find((i) => i.id === '2').amount, 1);
});

test('encrypted backup: opens with password, rejects wrong password, no plaintext', async () => {
  const dek = await newDataKey();
  const items = sanitizeItems([{ kind: 'credit', bank: 'Axis Bank', number: '5500005555555559', cvv: '321' }]);
  const wrap = await makeBackupWrap(dek, 'correct horse battery staple');
  const file = await makeEncryptedBackup(dek, wrap, { items, prefs: { holder: 'Z' } });
  const text = JSON.stringify(file);
  assert.equal(text.includes('5500005555555559'), false);
  assert.equal(text.includes('Axis'), false);
  const parsed = parseBackupFile(text);
  assert.equal(parsed.kind, 'encrypted');
  const opened = await openEncryptedBackup(parsed.file, 'correct horse battery staple');
  assert.equal(opened.items[0].number, '5500005555555559');
  await assert.rejects(openEncryptedBackup(parsed.file, 'wrong'), /Wrong backup password/);
});

test('plain export and file validation', () => {
  const items = sanitizeItems([{ kind: 'gift', brand: 'Zomato', code: 'Z1', amount: 200 }]);
  const plain = parseBackupFile(JSON.stringify(makePlainExport({ items })));
  assert.equal(plain.kind, 'plain');
  assert.equal(plain.items[0].brand, 'Zomato');
  assert.throws(() => parseBackupFile('not json'), /not valid JSON/);
  assert.throws(() => parseBackupFile('{"hello":1}'), /not a Card Vault backup/);
  assert.throws(() => parseBackupFile(JSON.stringify({ format: 'card-vault-backup', key: {}, data: {} })), /incomplete/);
  assert.throws(() => parseBackupFile(JSON.stringify({ format: 'card-vault-backup', key: { salt: 'a', iv: 'b', ct: 'c', iterations: 1 }, data: { iv: 'a', ct: 'b' } })), /unsupported/);
});

test('password score and passphrase suggestion', () => {
  assert.equal(passwordScore('short'), 0);
  assert.equal(passwordScore('abcdefghij'), 1);
  assert.equal(passwordScore('Abcdefgh12!x'), 2);
  assert.equal(passwordScore('river-mango-tiger-salt-cloud'), 3);
  const p = suggestPassphrase(WORDS);
  assert.match(p, /^([a-z]+-){5}\d{2}$/);
  assert.ok(passwordScore(p) >= 2);
});
