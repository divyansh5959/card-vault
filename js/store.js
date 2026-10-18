// Vault persistence, item validation, backup files and import merging.
// Everything sensitive lives in one AES-GCM blob; only unlock metadata
// (salts, wrapped keys, theme) is stored in the clear.

import {
  newDataKey, sealJSON, openJSON, wrapWithSecret, unwrapWithSecret,
  PIN_ITERATIONS, BACKUP_ITERATIONS,
} from './crypto.js';
import { NETWORKS, digits } from './cards.js';

export const META_KEY = 'cardvault.meta.v1';
export const DATA_KEY = 'cardvault.data.v1';
export const BACKUP_FORMAT = 'card-vault-backup';
export const PLAIN_FORMAT = 'card-vault-export';

const DEFAULT_SETTINGS = { theme: 'system', autoLock: 1, density: 'cards' };

export function storageAvailable(ls = globalThis.localStorage) {
  try { ls.setItem('cardvault.probe', '1'); ls.removeItem('cardvault.probe'); return true; } catch { return false; }
}

export function loadMeta(ls = globalThis.localStorage) {
  try {
    const m = JSON.parse(ls.getItem(META_KEY) || 'null');
    if (m && m.pinWrap) return { ...m, settings: { ...DEFAULT_SETTINGS, ...(m.settings || {}) } };
  } catch { /* corrupt meta is treated as no vault */ }
  return null;
}

export function saveMeta(meta, ls = globalThis.localStorage) {
  ls.setItem(META_KEY, JSON.stringify(meta));
}

export function emptyVault() {
  return { items: [], prefs: { holder: '' } };
}

export async function createVault(pin, ls = globalThis.localStorage, vault = emptyVault()) {
  const dek = await newDataKey();
  const meta = {
    version: 1,
    createdAt: Date.now(),
    pinWrap: await wrapWithSecret(dek, pin, PIN_ITERATIONS),
    prf: null,
    backupWrap: null,
    lastBackupAt: 0,
    lastChangeAt: Date.now(),
    failed: { count: 0, until: 0 },
    settings: { ...DEFAULT_SETTINGS },
  };
  saveMeta(meta, ls);
  ls.setItem(DATA_KEY, JSON.stringify(await sealJSON(dek, vault)));
  return { dek, meta, vault };
}

export async function readVault(dek, ls = globalThis.localStorage) {
  const raw = ls.getItem(DATA_KEY);
  if (!raw) return emptyVault();
  const v = await openJSON(dek, JSON.parse(raw));
  return { items: sanitizeItems(v.items || []), prefs: { holder: '', ...(v.prefs || {}) } };
}

export async function writeVault(dek, vault, ls = globalThis.localStorage) {
  ls.setItem(DATA_KEY, JSON.stringify(await sealJSON(dek, vault)));
}

export function eraseAll(ls = globalThis.localStorage) {
  ls.removeItem(META_KEY);
  ls.removeItem(DATA_KEY);
}

// ---------- item validation (import is a trust boundary) ----------

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : typeof v === 'number' ? String(v).slice(0, max) : '');
const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
const time = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : Date.now());

export function newId() {
  return globalThis.crypto.randomUUID();
}

export function sanitizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = raw.kind;
  if (!['credit', 'debit', 'gift'].includes(kind)) return null;
  const base = {
    id: str(raw.id, 64) || newId(),
    kind,
    createdAt: time(raw.createdAt),
    updatedAt: time(raw.updatedAt),
    notes: str(raw.notes, 500),
    fav: raw.fav === true,
  };
  if (kind === 'gift') {
    const brand = str(raw.brand, 60).trim();
    const code = str(raw.code, 120).trim();
    if (!brand || !code) return null;
    const expiry = /^\d{4}-\d{2}-\d{2}$/.test(raw.expiry || '') ? raw.expiry : '';
    return {
      ...base, brand, code, expiry,
      amount: num(raw.amount),
      pin: str(raw.pin, 40).trim(),
      used: raw.used === true,
      usedAt: raw.used === true ? time(raw.usedAt) : 0,
    };
  }
  const number = digits(raw.number).slice(0, 19);
  const bank = str(raw.bank, 60).trim();
  if (!number || !bank) return null;
  return {
    ...base, bank, number,
    name: str(raw.name, 60).trim(),
    tier: str(raw.tier, 30).trim(),
    network: NETWORKS[raw.network] ? raw.network : 'other',
    holder: str(raw.holder, 60).trim(),
    expiry: /^\d{2}\/\d{2}$/.test(raw.expiry || '') ? raw.expiry : '',
    cvv: digits(raw.cvv).slice(0, 4),
    limit: kind === 'credit' ? digits(raw.limit).slice(0, 10) : '',
    limitGroup: kind === 'credit' ? str(raw.limitGroup, 64) : '',
  };
}

export function sanitizeItems(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const it = sanitizeItem(raw);
    if (!it) continue;
    if (seen.has(it.id)) it.id = newId();
    seen.add(it.id);
    out.push(it);
  }
  return out;
}

// Same physical card / voucher even if ids differ (e.g. typed on two devices).
function identity(it) {
  if (it.kind === 'gift') return `gift|${it.brand.toLowerCase()}|${it.code.replace(/\s/g, '').toLowerCase()}`;
  return `card|${it.kind}|${it.number}`;
}

// Merge: newer updatedAt wins for the same id or the same card number / voucher code.
export function mergeItems(current, incoming) {
  const out = current.map((x) => ({ ...x }));
  const byId = new Map(out.map((x, i) => [x.id, i]));
  const byIdent = new Map(out.map((x, i) => [identity(x), i]));
  const stats = { added: 0, updated: 0, unchanged: 0 };
  for (const inc of incoming) {
    const idx = byId.has(inc.id) ? byId.get(inc.id) : byIdent.get(identity(inc));
    if (idx === undefined) {
      out.push({ ...inc });
      byId.set(inc.id, out.length - 1);
      byIdent.set(identity(inc), out.length - 1);
      stats.added++;
    } else if (inc.updatedAt > out[idx].updatedAt) {
      out[idx] = { ...inc, id: out[idx].id };
      stats.updated++;
    } else {
      stats.unchanged++;
    }
  }
  return { items: out, stats };
}

export function countKinds(items) {
  const c = { credit: 0, debit: 0, gift: 0 };
  for (const it of items) c[it.kind]++;
  return c;
}

// ---------- backup files ----------

export async function makeEncryptedBackup(dek, backupWrap, vault) {
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    note: 'Encrypted Card Vault backup. Import it in Card Vault and enter your backup password.',
    key: backupWrap,
    data: await sealJSON(dek, { items: vault.items, prefs: vault.prefs }, 'backup'),
  };
}

export function makePlainExport(vault) {
  return {
    format: PLAIN_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    warning: 'NOT ENCRYPTED. Anyone who opens this file can read every card number, CVV and voucher code.',
    items: vault.items,
  };
}

// Returns { kind: 'encrypted' | 'plain', ... } or throws a user-readable Error.
export function parseBackupFile(text) {
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error('This file is not valid JSON.'); }
  if (obj && obj.format === BACKUP_FORMAT) {
    const k = obj.key;
    if (!k || !k.salt || !k.iv || !k.ct || !Number.isInteger(k.iterations) || !obj.data?.iv || !obj.data?.ct) {
      throw new Error('This backup file is incomplete or damaged.');
    }
    if (k.iterations < 100_000 || k.iterations > 5_000_000) throw new Error('This backup uses unsupported settings.');
    return { kind: 'encrypted', file: obj };
  }
  if (obj && obj.format === PLAIN_FORMAT && Array.isArray(obj.items)) {
    return { kind: 'plain', items: sanitizeItems(obj.items) };
  }
  if (Array.isArray(obj)) {
    const items = sanitizeItems(obj);
    if (items.length) return { kind: 'plain', items };
  }
  throw new Error('This is not a Card Vault backup.');
}

export async function openEncryptedBackup(file, password) {
  let dek;
  try { dek = await unwrapWithSecret(file.key, password); } catch { throw new Error('Wrong backup password.'); }
  const data = await openJSON(dek, file.data, 'backup');
  return { dek, items: sanitizeItems(data.items || []), prefs: data.prefs || {} };
}

export async function makeBackupWrap(dek, password) {
  return wrapWithSecret(dek, password, BACKUP_ITERATIONS);
}

export function bytesUsed(ls = globalThis.localStorage) {
  let n = 0;
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    n += (k.length + (ls.getItem(k) || '').length) * 2;
  }
  return n;
}
