import type { CalendarEvent, Recurrence } from './types';

/** Calendar dates travel as 'YYYY-MM-DD' strings so they never shift across time zones. */

export function todayIn(timeZone?: string | null, at = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  }
}

export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const toUTC = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day);
};
const fromUTC = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (d: string, n: number) => fromUTC(toUTC(d) + n * 86400000);
export const daysBetween = (from: string, to: string) => Math.round((toUTC(to) - toUTC(from)) / 86400000);

export function addMonths(d: string, n: number) {
  const [y, m, day] = d.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

/** Whole years, months and days between two dates: "3 years, 4 months, 12 days". */
export function diffYMD(from: string, to: string) {
  if (to < from) return { years: 0, months: 0, days: 0 };
  let months = 0;
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  months = (ty - fy) * 12 + (tm - fm);
  if (addMonths(from, months) > to) months--;
  const days = daysBetween(addMonths(from, months), to);
  return { years: Math.floor(months / 12), months: months % 12, days };
}

export function nextOccurrence(date: string, recurrence: Recurrence, from: string): string | null {
  if (date >= from) return date;
  if (recurrence === 'none') return null;
  if (recurrence === 'weekly') return addDays(date, Math.ceil(daysBetween(date, from) / 7) * 7);
  const [y, m] = date.split('-').map(Number);
  const [fy, fm] = from.split('-').map(Number);
  const unit = recurrence === 'yearly' ? 12 : 1;
  let step = recurrence === 'yearly' ? (fy - y) * 12 : (fy - y) * 12 + (fm - m);
  let candidate = addMonths(date, step);
  while (candidate < from) {
    step += unit;
    candidate = addMonths(date, step);
  }
  return candidate;
}

/** Every date in [from, to] on which an event falls. */
export function occurrencesIn(event: Pick<CalendarEvent, 'date' | 'recurrence'>, from: string, to: string): string[] {
  const out: string[] = [];
  let cursor = nextOccurrence(event.date, event.recurrence, from);
  let guard = 0;
  while (cursor && cursor <= to && guard++ < 60) {
    out.push(cursor);
    if (event.recurrence === 'none') break;
    cursor = nextOccurrence(event.date, event.recurrence, addDays(cursor, 1));
  }
  return out;
}

export interface Milestone {
  key: string;
  label: string;
  date: string;
  days: number;
}

export function milestonesFor(start: string, untilYears = 60): Milestone[] {
  const out: Milestone[] = [];
  for (const n of [100, 200, 300, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000]) {
    out.push({ key: `d${n}`, label: `${n.toLocaleString('en')} days`, date: addDays(start, n), days: n });
  }
  out.push({ key: 'm6', label: '6 months', date: addMonths(start, 6), days: daysBetween(start, addMonths(start, 6)) });
  for (let y = 1; y <= untilYears; y++) {
    const date = addMonths(start, y * 12);
    out.push({ key: `y${y}`, label: y === 1 ? '1 year' : `${y} years`, date, days: daysBetween(start, date) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/* ── Formatting ─────────────────────────────────────────────────────── */

const asDate = (d: string) => new Date(`${d}T12:00:00Z`);

export const formatDate = (d: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }) =>
  new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', ...opts }).format(asDate(d));

export const formatShortDate = (d: string) => formatDate(d, { day: 'numeric', month: 'short' });
export const formatMonth = (ym: string) => formatDate(`${ym}-01`, { month: 'long', year: 'numeric' });
export const formatTime = (iso: string) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
export const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

export function dayLabel(iso: string) {
  const day = todayIn(undefined, new Date(iso));
  const today = todayIn();
  if (day === today) return 'Today';
  if (day === addDays(today, -1)) return 'Yesterday';
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return formatDate(day, sameYear ? { weekday: 'long', day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' });
}

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return '';
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  if (seconds < 86400 * 7) return `${Math.round(seconds / 86400)}d ago`;
  return formatDateTime(iso);
}

export function inDays(n: number) {
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  return `${n.toLocaleString()} days`;
}

export const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

/** Converts a `<input type="datetime-local">` value to an ISO string in the device's zone. */
export const localInputToISO = (value: string) => (value ? new Date(value).toISOString() : null);
export function isoToLocalInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
