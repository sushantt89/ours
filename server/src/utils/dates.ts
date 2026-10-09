/** Date-only helpers. Calendar dates are stored as 'YYYY-MM-DD' strings to avoid timezone drift. */

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function todayIn(timeZone: string, at = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

export function hourIn(timeZone: string, at = new Date()): number {
  try {
    const h = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hour12: false }).format(at);
    return Number(h) % 24;
  } catch {
    return at.getUTCHours();
  }
}

export function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const toUTC = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day);
};
const fromUTC = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (d: string, n: number) => fromUTC(toUTC(d) + n * 86400000);
export const daysBetween = (from: string, to: string) => Math.round((toUTC(to) - toUTC(from)) / 86400000);

function clampDay(y: number, m: number, day: number) {
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

export function addMonths(d: string, n: number) {
  const [y, m, day] = d.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return clampDay(Math.floor(total / 12), (total % 12) + 1, day);
}

export type Recurrence = 'none' | 'weekly' | 'monthly' | 'yearly';

/** First occurrence of a (possibly recurring) date on or after `from`. */
export function nextOccurrence(date: string, recurrence: Recurrence, from: string): string | null {
  if (date >= from) return date;
  if (recurrence === 'none') return null;
  if (recurrence === 'weekly') {
    const diff = daysBetween(date, from);
    return addDays(date, Math.ceil(diff / 7) * 7);
  }
  const [y, m] = date.split('-').map(Number);
  const [fy, fm] = from.split('-').map(Number);
  let step = recurrence === 'yearly' ? (fy - y) * 12 : (fy - y) * 12 + (fm - m);
  const unit = recurrence === 'yearly' ? 12 : 1;
  let candidate = addMonths(date, step);
  while (candidate < from) {
    step += unit;
    candidate = addMonths(date, step);
  }
  return candidate;
}

export interface Milestone {
  key: string;
  label: string;
  date: string;
  days: number;
}

/** Day-count and yearly milestones for a relationship start date. */
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
