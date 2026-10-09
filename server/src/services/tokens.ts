import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Request, Response, CookieOptions } from 'express';
import { env } from '../config/env';
import { Session } from '../models';
import { randomToken } from '../utils/crypto';

const ACCESS_TTL = '15m';
const MEDIA_TTL_MS = 24 * 60 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ROTATION_GRACE_MS = 30 * 1000;

export const REFRESH_COOKIE = 'ours_rt';
export const MEDIA_COOKIE = 'ours_media';

type TokenType = 'access' | 'media' | 'drive_state';

export function sign(sub: string, typ: TokenType, expiresIn: jwt.SignOptions['expiresIn']) {
  return jwt.sign({ typ }, env.JWT_ACCESS_SECRET, { subject: sub, expiresIn, algorithm: 'HS256' });
}

export function verify(token: string, typ: TokenType): string | null {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    return payload.typ === typ && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

export const signAccess = (userId: string) => sign(userId, 'access', ACCESS_TTL);

const hashRefresh = (token: string) =>
  crypto.createHmac('sha256', env.JWT_REFRESH_SECRET).update(token).digest('hex');

function cookieBase(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.isProd || env.COOKIE_SAMESITE === 'none',
    sameSite: env.COOKIE_SAMESITE,
  };
}

/** Sets the httpOnly refresh cookie plus a read-only cookie that lets <img>/<video> load private media. */
async function setCookies(res: Response, userId: string, refreshToken: string) {
  res.cookie(REFRESH_COOKIE, refreshToken, { ...cookieBase(), path: '/api/auth', maxAge: REFRESH_TTL_MS });
  res.cookie(MEDIA_COOKIE, sign(userId, 'media', '1d'), { ...cookieBase(), path: '/api', maxAge: MEDIA_TTL_MS });
}

export async function startSession(req: Request, res: Response, userId: string) {
  const token = randomToken(48);
  await Session.create({
    userId,
    tokenHash: hashRefresh(token),
    userAgent: String(req.headers['user-agent'] ?? '').slice(0, 200),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  await setCookies(res, userId, token);
  return signAccess(userId);
}

/** Rotates the refresh token. The old one stays valid briefly so two tabs refreshing at once both succeed. */
export async function rotateSession(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token || typeof token !== 'string') return null;
  const session = await Session.findOne({ tokenHash: hashRefresh(token), expiresAt: { $gt: new Date() } });
  if (!session) return null;
  const userId = String(session.userId);
  const graceEnd = new Date(Date.now() + ROTATION_GRACE_MS);
  if (session.expiresAt > graceEnd) {
    session.expiresAt = graceEnd;
    await session.save();
  }
  return { userId, accessToken: await startSession(req, res, userId) };
}

export async function endSession(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) await Session.deleteOne({ tokenHash: hashRefresh(String(token)) });
  res.clearCookie(REFRESH_COOKIE, { ...cookieBase(), path: '/api/auth' });
  res.clearCookie(MEDIA_COOKIE, { ...cookieBase(), path: '/api' });
}

export const endAllSessions = (userId: string) => Session.deleteMany({ userId });
