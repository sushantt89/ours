import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { daysBetween, diffYMD, formatDate, plural, todayIn } from '@/lib/dates';
import { cn } from '@/lib/cn';

type Unit = 'days' | 'weeks' | 'months' | 'years';
const UNITS: Unit[] = ['days', 'weeks', 'months', 'years'];

const read = (): Unit => {
  try {
    const saved = localStorage.getItem('ours:counter-unit') as Unit | null;
    return saved && UNITS.includes(saved) ? saved : 'days';
  } catch {
    return 'days';
  }
};

/** "Together for 1,247 days", switchable between days, weeks, months and years. */
export function RelationshipCounter({ startDate, timezone, onDark }: { startDate: string; timezone: string; onDark?: boolean }) {
  const [unit, setUnit] = useState<Unit>(read);
  const today = todayIn(timezone);

  const { value, breakdown } = useMemo(() => {
    const days = Math.max(0, daysBetween(startDate, today));
    const ymd = diffYMD(startDate, today);
    const totalMonths = ymd.years * 12 + ymd.months;
    const values: Record<Unit, number> = {
      days,
      weeks: Math.floor(days / 7),
      months: totalMonths,
      years: ymd.years,
    };
    const parts = [ymd.years && plural(ymd.years, 'year'), ymd.months && plural(ymd.months, 'month'), plural(ymd.days, 'day')].filter(Boolean);
    return { value: values[unit], breakdown: parts.join(' · ') };
  }, [startDate, today, unit]);

  const choose = (next: Unit) => {
    setUnit(next);
    try {
      localStorage.setItem('ours:counter-unit', next);
    } catch {
      /* ignore */
    }
  };

  const label = unit === 'days' ? 'day' : unit === 'weeks' ? 'week' : unit === 'months' ? 'month' : 'year';

  return (
    <div className="text-center">
      <p className={cn('text-sm font-medium uppercase tracking-[0.16em]', onDark ? 'text-white/80' : 'text-muted')}>Together for</p>
      <div className="relative mt-1 h-[84px] overflow-hidden" aria-live="polite">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.p
            key={unit}
            initial={{ y: 28, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -28, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 260 }}
            className="font-display text-[72px] font-medium leading-[84px] tracking-tight"
          >
            {value.toLocaleString()}
          </motion.p>
        </AnimatePresence>
      </div>
      <p className={cn('-mt-1 font-display text-xl', onDark ? 'text-white/90' : 'text-ink')}>{value === 1 ? label : `${label}s`}</p>

      <div
        role="tablist"
        aria-label="Counter unit"
        className={cn('mx-auto mt-4 inline-flex rounded-full p-1', onDark ? 'bg-white/15 backdrop-blur' : 'bg-surface-2')}
      >
        {UNITS.map((u) => (
          <button
            key={u}
            role="tab"
            aria-selected={unit === u}
            onClick={() => choose(u)}
            className={cn(
              'h-7 rounded-full px-3 text-xs font-semibold capitalize transition',
              unit === u ? (onDark ? 'bg-white text-black' : 'bg-surface text-ink shadow-sm') : onDark ? 'text-white/80' : 'text-muted',
            )}
          >
            {u}
          </button>
        ))}
      </div>

      <p className={cn('mt-4 text-sm', onDark ? 'text-white/85' : 'text-muted')}>
        {breakdown}
        <span className="mx-2 opacity-50">•</span>
        <span className="whitespace-nowrap">❤️ Since {formatDate(startDate)}</span>
      </p>
    </div>
  );
}
