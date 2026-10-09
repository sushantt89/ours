import type { Request, Response, NextFunction } from 'express';
import { User, Couple } from '../models';
import { verify, MEDIA_COOKIE } from '../services/tokens';
import { unauthorized, forbidden } from '../utils/http';

function bearer(req: Request) {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

/** Requires a valid access token and attaches the fresh user document. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = bearer(req);
  const userId = token && verify(token, 'access');
  if (!userId) throw unauthorized();
  const user = await User.findById(userId);
  if (!user) throw unauthorized();
  req.user = user;
  next();
}

/**
 * Media is loaded by <img>/<video> tags, which cannot send an Authorization header,
 * so GET requests for media may authenticate with the read-only media cookie instead.
 */
export async function requireMediaAuth(req: Request, _res: Response, next: NextFunction) {
  const token = bearer(req);
  const userId =
    (token && verify(token, 'access')) ||
    (typeof req.cookies?.[MEDIA_COOKIE] === 'string' && verify(req.cookies[MEDIA_COOKIE], 'media'));
  if (!userId) throw unauthorized();
  const user = await User.findById(userId);
  if (!user) throw unauthorized();
  req.user = user;
  next();
}

/**
 * The single gate for couple data. The couple is always resolved from the authenticated
 * user — never from a client-supplied id — and membership is re-checked on every request.
 */
export async function requireCouple(req: Request, _res: Response, next: NextFunction) {
  if (!req.user.coupleId) throw forbidden('Create or join a couple space first', 'no_couple');
  const couple = await Couple.findById(req.user.coupleId);
  if (!couple || !couple.members.some((m) => m.equals(req.user._id))) {
    throw forbidden('Create or join a couple space first', 'no_couple');
  }
  req.couple = couple;
  req.partnerId = couple.members.find((m) => !m.equals(req.user._id));
  next();
}
