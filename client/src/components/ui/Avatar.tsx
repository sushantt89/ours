import { useState } from 'react';
import { cn } from '@/lib/cn';

const sizes = { xs: 'size-6 text-[10px]', sm: 'size-9 text-sm', md: 'size-12 text-base', lg: 'size-16 text-xl', xl: 'size-24 text-3xl' };

export function Avatar({
  name,
  src,
  size = 'md',
  online,
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof sizes;
  online?: boolean | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initial = name.trim().charAt(0).toUpperCase() || '♥';
  return (
    <span className={cn('relative inline-block shrink-0', className)}>
      <span className={cn('grid place-items-center overflow-hidden rounded-full font-display font-medium text-on-accent accent-gradient', sizes[size])}>
        {src && !failed ? (
          <img src={src} alt="" className="size-full object-cover" onError={() => setFailed(true)} />
        ) : (
          <span aria-hidden>{initial}</span>
        )}
      </span>
      {online && (
        <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-surface bg-success" title="Online" aria-label="Online" />
      )}
    </span>
  );
}

/** Two overlapping avatars: the couple. */
export function CoupleAvatars({
  a,
  b,
  size = 'lg',
}: {
  a: { name: string; avatarUrl?: string | null };
  b?: { name: string; avatarUrl?: string | null } | null;
  size?: keyof typeof sizes;
}) {
  return (
    <span className="inline-flex items-center">
      <Avatar name={a.name} src={a.avatarUrl} size={size} className="rounded-full ring-4 ring-surface" />
      {b ? (
        <Avatar name={b.name} src={b.avatarUrl} size={size} className="-ml-4 rounded-full ring-4 ring-surface" />
      ) : (
        <span className={cn('-ml-4 grid place-items-center rounded-full border-2 border-dashed border-faint bg-surface text-faint ring-4 ring-surface', sizes[size])}>?</span>
      )}
    </span>
  );
}
