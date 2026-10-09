import 'dotenv/config';
import crypto from 'node:crypto';
import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  SERVER_URL: z.string().default('http://localhost:4000'),
  MONGODB_URI: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().optional(),
  JWT_REFRESH_SECRET: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  REQUIRE_EMAIL_VERIFICATION: bool,
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('Ours <no-reply@example.com>'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:admin@example.com'),
  GIPHY_API_KEY: z.string().optional(),
  MAX_UPLOAD_MB: z.coerce.number().default(25),
  METERED_DOMAIN: z.string().optional(),
  METERED_API_KEY: z.string().optional(),
  TURN_URLS: z.string().optional(),
  TURN_USERNAME: z.string().optional(),
  TURN_CREDENTIAL: z.string().optional(),
});

const raw = schema.parse(
  Object.fromEntries(Object.entries(process.env).map(([k, v]) => [k, v === '' ? undefined : v])),
);

const isProd = raw.NODE_ENV === 'production';

/** In production every secret must be supplied. In dev/test we generate throwaway ones. */
function secret(name: 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET' | 'ENCRYPTION_KEY', bytes: number) {
  const value = raw[name];
  if (value) return value;
  if (isProd) throw new Error(`${name} must be set in production`);
  if (raw.NODE_ENV === 'development') {
    console.warn(`[env] ${name} is not set — using a temporary value (sessions reset on restart).`);
  }
  return crypto.randomBytes(bytes).toString('hex');
}

const encryptionKey = secret('ENCRYPTION_KEY', 32);
if (!/^[0-9a-f]{64}$/i.test(encryptionKey)) {
  throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
}

export const env = {
  ...raw,
  isProd,
  isTest: raw.NODE_ENV === 'test',
  CLIENT_URL: raw.CLIENT_URL.replace(/\/$/, ''),
  SERVER_URL: raw.SERVER_URL.replace(/\/$/, ''),
  JWT_ACCESS_SECRET: secret('JWT_ACCESS_SECRET', 48),
  JWT_REFRESH_SECRET: secret('JWT_REFRESH_SECRET', 48),
  ENCRYPTION_KEY: encryptionKey,
  googleEnabled: Boolean(raw.GOOGLE_CLIENT_ID),
  driveEnabled: Boolean(raw.GOOGLE_CLIENT_ID && raw.GOOGLE_CLIENT_SECRET),
  pushEnabled: Boolean(raw.VAPID_PUBLIC_KEY && raw.VAPID_PRIVATE_KEY),
  mailEnabled: Boolean(raw.SMTP_HOST),
  gifsEnabled: Boolean(raw.GIPHY_API_KEY),
  turnEnabled: Boolean((raw.METERED_DOMAIN && raw.METERED_API_KEY) || raw.TURN_URLS),
};
