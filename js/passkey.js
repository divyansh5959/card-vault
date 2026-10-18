// Fingerprint / screen-lock unlock through a passkey with the WebAuthn PRF
// extension. The passkey returns a secret only after the phone verifies the
// user; that secret wraps the vault key. No PIN is stored anywhere.
// Devices without PRF support simply do not get the option.

import { b64, randomBytes, wrapWithPrf, unwrapWithPrf } from './crypto.js';

export async function prfLikelySupported() {
  if (!globalThis.PublicKeyCredential || !navigator.credentials?.create) return false;
  try {
    if (PublicKeyCredential.getClientCapabilities) {
      const caps = await PublicKeyCredential.getClientCapabilities();
      if (caps && 'extension:prf' in caps) return caps['extension:prf'] === true;
    }
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

async function evalPrf(credIdB64, saltB64) {
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [{ type: 'public-key', id: b64.dec(credIdB64) }],
      userVerification: 'required',
      timeout: 60_000,
      extensions: { prf: { eval: { first: b64.dec(saltB64) } } },
    },
  });
  const first = assertion?.getClientExtensionResults?.().prf?.results?.first;
  if (!first) throw new Error('This device did not return a fingerprint key.');
  return new Uint8Array(first);
}

// Creates a passkey and returns the record stored in meta.prf.
export async function enrollPrf(dek) {
  const prfSalt = b64.enc(randomBytes(32));
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: 'Card Vault' },
      user: { id: randomBytes(16), name: 'Card Vault', displayName: 'Card Vault on this device' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60_000,
      extensions: { prf: { eval: { first: b64.dec(prfSalt) } } },
    },
  });
  const ext = cred.getClientExtensionResults?.().prf;
  if (!ext || ext.enabled === false) throw new Error('This phone cannot use fingerprint unlock for web apps.');
  const credId = b64.enc(cred.rawId);
  // Some authenticators return the PRF result at creation; others only on get().
  const secret = ext.results?.first ? new Uint8Array(ext.results.first) : await evalPrf(credId, prfSalt);
  const hkdfSalt = b64.enc(randomBytes(16));
  const wrap = await wrapWithPrf(dek, secret, hkdfSalt);
  secret.fill(0);
  return { credId, prfSalt, hkdfSalt, wrap, createdAt: Date.now() };
}

export async function unlockWithPrf(rec) {
  const secret = await evalPrf(rec.credId, rec.prfSalt);
  try {
    return await unwrapWithPrf(rec.wrap, secret, rec.hkdfSalt);
  } finally {
    secret.fill(0);
  }
}
