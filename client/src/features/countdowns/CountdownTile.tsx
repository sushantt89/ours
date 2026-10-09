import { COUNTDOWN_BACKGROUNDS } from '@/lib/constants';
import { daysBetween, formatDate } from '@/lib/dates';
import { cn } from '@/lib/cn';
import type { Countdown } from '@/lib/types';

export function CountdownTile({ countdown, today, className, onClick }: { countdown: Countdown; today: string; className?: string; onClick?: () => void }) {
  const days = daysBetween(today, countdown.date);
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={cn('relative flex aspect-[4/5] flex-col justify-between overflow-hidden rounded-[26px] p-4 text-left text-white shadow-card transition', onClick && 'hover:-translate-y-0.5 active:scale-[0.98]', className)}
      style={{ background: COUNTDOWN_BACKGROUNDS[countdown.background] ?? COUNTDOWN_BACKGROUNDS.sunset }}
    >
      {countdown.imageUrl && (
        <>
          <img src={countdown.imageUrl} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
          <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/10" />
        </>
      )}
      <span className="relative text-3xl drop-shadow" aria-hidden>
        {countdown.emoji}
      </span>
      <span className="relative">
        <span className="block font-display text-[40px] font-medium leading-none">{days <= 0 ? (days === 0 ? 'Today' : 'Done') : days.toLocaleString()}</span>
        {days > 0 && <span className="block text-sm font-medium opacity-90">{days === 1 ? 'day to go' : 'days to go'}</span>}
        <span className="mt-2 block truncate font-semibold">{countdown.title}</span>
        <span className="block text-xs opacity-85">{formatDate(countdown.date, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
      </span>
    </Tag>
  );
}
