import { z } from 'zod';
import { DATE_RE, isValidTimeZone } from './dates';

export const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
export const dateOnly = z
  .string()
  .regex(DATE_RE, 'Use the format YYYY-MM-DD')
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), 'That date does not exist');
export const timeOnly = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the format HH:mm');
export const emoji = z.string().trim().min(1).max(16);
export const timezone = z.string().max(64).refine(isValidTimeZone, 'Unknown time zone');
export const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128, 'Use at most 128 characters');
export const email = z.email('Enter a valid email address').max(254).transform((e) => e.toLowerCase().trim());
export const isoDate = z.iso.datetime({ offset: true }).transform((s) => new Date(s));
export const mediaIds = z.array(objectId).max(12);
