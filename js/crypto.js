// Envelope encryption for the vault.
//
// One random 256-bit data key (DEK) encrypts the whole vault with AES-GCM.
// The DEK itself is stored only in wrapped (encrypted) form, once per unlock
// method: the PIN, the fingerprint passkey and the backup password each
// derive their own key-encryption key. Changing the PIN re-wraps the DEK;
// the vault data is never re-encrypted under a new secret.

const te = new TextEncoder();
const td = new TextDecoder();
const subtle = globalThis.crypto.subtle;

export const PIN_ITERATIONS = 600_000;      // OWASP 2023 figure for PBKDF2-SHA256
export const BACKUP_ITERATIONS = 600_000;

export const b64 = {
  enc(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return btoa(s);
  },
  dec(str) {
    return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
  },
};

export const randomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

export async function newDataKey() {
  return subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

async function pbkdf2Key(secret, salt, iterations) {
  const base = await subtle.importKey('raw', te.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// Fingerprint path: the passkey's PRF output is high-entropy, so HKDF is enough.
async function hkdfKey(secretBytes, salt) {
  const base = await subtle.importKey('raw', secretBytes, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: te.encode('card-vault/prf-wrap/v1') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function sealBytes(key, bytes, aad) {
  const iv = randomBytes(12);
  const params = { name: 'AES-GCM', iv };
  if (aad) params.additionalData = te.encode(aad);
  const ct = await subtle.encrypt(params, key, bytes);
  return { iv: b64.enc(iv), ct: b64.enc(ct) };
}

async function openBytes(key, box, aad) {
  const params = { name: 'AES-GCM', iv: b64.dec(box.iv) };
  if (aad) params.additionalData = te.encode(aad);
  return new Uint8Array(await subtle.decrypt(params, key, b64.dec(box.ct)));
}

async function wrapWith(kek, dek) {
  const raw = new Uint8Array(await subtle.exportKey('raw', dek));
  try { return await sealBytes(kek, raw, 'dek'); } finally { raw.fill(0); }
}

async function unwrapWith(kek, box) {
  const raw = await openBytes(kek, box, 'dek');
  try {
    return await subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  } finally { raw.fill(0); }
}

export async function wrapWithSecret(dek, secret, iterations) {
  const salt = randomBytes(16);
  const kek = await pbkdf2Key(secret, salt, iterations);
  return { kdf: 'PBKDF2-SHA256', iterations, salt: b64.enc(salt), ...(await wrapWith(kek, dek)) };
}

// Throws (OperationError) when the secret is wrong: AES-GCM authentication fails.
export async function unwrapWithSecret(wrap, secret) {
  const kek = await pbkdf2Key(secret, b64.dec(wrap.salt), wrap.iterations);
  return unwrapWith(kek, wrap);
}

export async function wrapWithPrf(dek, prfBytes, saltB64) {
  const kek = await hkdfKey(prfBytes, b64.dec(saltB64));
  return wrapWith(kek, dek);
}

export async function unwrapWithPrf(wrap, prfBytes, saltB64) {
  const kek = await hkdfKey(prfBytes, b64.dec(saltB64));
  return unwrapWith(kek, wrap);
}

export async function sealJSON(dek, obj, aad = 'vault') {
  return sealBytes(dek, te.encode(JSON.stringify(obj)), aad);
}

export async function openJSON(dek, box, aad = 'vault') {
  return JSON.parse(td.decode(await openBytes(dek, box, aad)));
}

// Rough strength check for the backup password: length plus character classes.
export function passwordScore(pw) {
  const s = String(pw || '');
  if (s.length < 10) return 0;
  let classes = 0;
  if (/[a-z]/.test(s)) classes++;
  if (/[A-Z]/.test(s)) classes++;
  if (/\d/.test(s)) classes++;
  if (/[^A-Za-z0-9]/.test(s)) classes++;
  const words = s.trim().split(/[\s-]+/).length;
  if (s.length >= 20 || words >= 4) return 3;
  if (s.length >= 14 || classes >= 3) return 2;
  return 1;
}

// Five random words plus two digits: easy to type on a laptop.
// With a 256-word list that is about 46 bits, on top of 600k PBKDF2 rounds.
export function suggestPassphrase(words) {
  const r = randomBytes(6);
  const picked = Array.from(r.subarray(0, 5), (b) => words[b % words.length]);
  return picked.join('-') + '-' + String(10 + (r[5] % 90));
}
