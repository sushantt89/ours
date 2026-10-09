import crypto from 'node:crypto';
import { env } from '../config/env';

const key = Buffer.from(env.ENCRYPTION_KEY, 'hex');

/** AES-256-GCM encryption for third-party tokens stored at rest. */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

export function decrypt(payload: string): string {
  const [iv, tag, data] = payload.split('.').map((p) => Buffer.from(p, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
export function inviteCode(length = 8) {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
