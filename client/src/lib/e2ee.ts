import type { Cipher, E2EEKeyInfo } from './types';

/**
 * End-to-end encryption for chat.
 *
 * Both partners type the same secret passphrase. Each device turns it into an AES-256-GCM
 * key with PBKDF2 (600,000 rounds of SHA-256) and keeps that key in IndexedDB as a
 * non-extractable CryptoKey. The passphrase and key never leave the device; the server
 * stores only the random salt and a small encrypted check value used to confirm the
 * passphrase is right.
 */

export const ITERATIONS = 600_000;
const CHECK = 'ours-e2ee-check-v1';
const enc = new TextEncoder();
const dec = new TextDecoder();

export const toB64 = (bytes: ArrayBuffer | Uint8Array) => {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < arr.length; i += 0x8000) s += String.fromCharCode(...arr.subarray(i, i + 0x8000));
  return btoa(s);
};
export const fromB64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export const supported = () => typeof crypto !== 'undefined' && Boolean(crypto.subtle) && typeof indexedDB !== 'undefined';

export async function deriveKey(passphrase: string, saltB64: string, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', enc.encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(saltB64), iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptRaw(key: CryptoKey, data: Uint8Array<ArrayBuffer>) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
  return { iv, ct };
}

export async function makeVerifier(key: CryptoKey) {
  const { iv, ct } = await encryptRaw(key, enc.encode(CHECK));
  return `${toB64(iv)}.${toB64(ct)}`;
}

export async function checkVerifier(key: CryptoKey, verifier: string) {
  try {
    const [iv, data] = verifier.split('.');
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, key, fromB64(data));
    return dec.decode(plain) === CHECK;
  } catch {
    return false;
  }
}

export async function encryptJSON(key: CryptoKey, keyId: string, value: unknown): Promise<Cipher> {
  const { iv, ct } = await encryptRaw(key, enc.encode(JSON.stringify(value)));
  return { keyId, iv: toB64(iv), data: toB64(ct) };
}

export async function decryptJSON<T>(key: CryptoKey, cipher: Cipher): Promise<T> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(cipher.iv) }, key, fromB64(cipher.data));
  return JSON.parse(dec.decode(plain)) as T;
}

/** Encrypts a file: the 12-byte IV followed by the ciphertext. */
export async function encryptBytes(key: CryptoKey, data: ArrayBuffer) {
  const { iv, ct } = await encryptRaw(key, new Uint8Array(data));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return out;
}

export async function decryptBytes(key: CryptoKey, data: ArrayBuffer) {
  const bytes = new Uint8Array(data);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, key, bytes.subarray(12));
}

export async function newKeyParams(passphrase: string) {
  const keyId = `k_${toB64(crypto.getRandomValues(new Uint8Array(12))).replace(/[+/=]/g, '').slice(0, 16)}`;
  const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
  const key = await deriveKey(passphrase, salt, ITERATIONS);
  const info: Omit<E2EEKeyInfo, 'createdAt'> = { keyId, salt, iterations: ITERATIONS, verifier: await makeVerifier(key) };
  return { key, info };
}

/* ── Key storage on this device ─────────────────────────────────────── */

const DB = 'ours-keys';
const STORE = 'keys';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).finally(() => db.close());
}

export const saveKey = (coupleId: string, keyId: string, key: CryptoKey) => tx('readwrite', (s) => s.put(key, `${coupleId}:${keyId}`));
export const loadKey = (coupleId: string, keyId: string) => tx<CryptoKey | undefined>('readonly', (s) => s.get(`${coupleId}:${keyId}`)).catch(() => undefined);
export const clearKeys = () => tx('readwrite', (s) => s.clear()).catch(() => undefined);
