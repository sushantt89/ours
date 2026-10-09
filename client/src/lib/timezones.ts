/** Helpers for the two of you being in different places. */

export function timeIn(timeZone: string, at = new Date(), opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }) {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone, ...opts }).format(at);
  } catch {
    return new Intl.DateTimeFormat(undefined, opts).format(at);
  }
}

/** Minutes ahead of UTC for a zone at a moment. */
export function offsetMinutes(timeZone: string, at = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(at);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
    return Math.round((asUTC - at.getTime()) / 60000);
  } catch {
    return 0;
  }
}

export function hourIn(timeZone: string, at = new Date()) {
  const minutes = (at.getUTCHours() * 60 + at.getUTCMinutes() + offsetMinutes(timeZone, at) + 1440) % 1440;
  return minutes / 60;
}

/** "5 hours ahead", "same time", "2½ hours behind" */
export function differenceLabel(mine: string, theirs: string, at = new Date()) {
  const diff = offsetMinutes(theirs, at) - offsetMinutes(mine, at);
  if (diff === 0) return 'Same time as you';
  const hours = Math.abs(diff) / 60;
  const text = Number.isInteger(hours) ? `${hours}` : hours % 1 === 0.5 ? `${Math.floor(hours)}½` : hours.toFixed(2);
  return `${text} hour${hours === 1 ? '' : 's'} ${diff > 0 ? 'ahead of' : 'behind'} you`;
}

export function partOfDay(hour: number) {
  if (hour < 5) return { label: 'in the middle of the night', emoji: '🌙', asleep: true };
  if (hour < 7) return { label: 'early morning', emoji: '🌅', asleep: true };
  if (hour < 12) return { label: 'morning', emoji: '☀️', asleep: false };
  if (hour < 17) return { label: 'afternoon', emoji: '🌤️', asleep: false };
  if (hour < 21) return { label: 'evening', emoji: '🌆', asleep: false };
  if (hour < 23) return { label: 'late evening', emoji: '🌙', asleep: false };
  return { label: 'late at night', emoji: '🌙', asleep: true };
}

/** The next moment it will be `hh:mm` in a time zone, as a Date. */
export function nextLocalTime(timeZone: string, hh: number, mm: number, from = new Date()) {
  const offset = offsetMinutes(timeZone, from);
  const localNow = new Date(from.getTime() + offset * 60000);
  const target = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate(), hh, mm));
  let utc = target.getTime() - offset * 60000;
  if (utc <= from.getTime() + 60_000) utc += 86400_000;
  // Correct for a daylight-saving change between now and then.
  const drift = offsetMinutes(timeZone, new Date(utc)) - offset;
  return new Date(utc - drift * 60000);
}
