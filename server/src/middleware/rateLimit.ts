import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

const make = (windowMs: number, limit: number, message: string) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => env.isTest,
    message: { error: { message, code: 'rate_limited' } },
  });

const MIN = 60 * 1000;

export const apiLimiter = make(MIN, 600, 'Too many requests. Please slow down a little.');
export const authLimiter = make(15 * MIN, 30, 'Too many attempts. Please wait a few minutes and try again.');
export const emailLimiter = make(60 * MIN, 8, 'Too many emails requested. Please try again later.');
export const joinLimiter = make(60 * MIN, 20, 'Too many invite code attempts. Please try again later.');
export const nudgeLimiter = make(MIN, 30, "That's a lot of nudges! Give them a moment to reply.");
export const uploadLimiter = make(MIN, 60, 'Too many uploads at once. Please wait a moment.');
