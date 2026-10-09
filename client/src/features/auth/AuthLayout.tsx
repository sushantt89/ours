import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { APP_NAME } from '@/lib/constants';

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display text-2xl ${className}`}>
      <span className="grid size-9 place-items-center rounded-[14px] accent-gradient text-lg text-on-accent shadow-[0_8px_20px_-8px_var(--accent)]" aria-hidden>
        ♥
      </span>
      {APP_NAME}
    </span>
  );
}

/** Shared frame for sign-in, sign-up and recovery screens. */
export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="paper grid min-h-dvh bg-bg lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden lg:block">
        <div className="absolute inset-0 accent-gradient" />
        <div className="absolute inset-0 opacity-30 [background:radial-gradient(40rem_30rem_at_20%_10%,white,transparent_60%)]" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <span className="inline-flex items-center gap-2 font-display text-2xl">
            <span className="grid size-9 place-items-center rounded-[14px] bg-white/20 text-lg backdrop-blur" aria-hidden>♥</span>
            {APP_NAME}
          </span>
          <div>
            <p className="max-w-md font-display text-5xl leading-[1.08]">A private home for the two of you.</p>
            <p className="mt-5 max-w-sm text-lg text-white/85">
              Your conversations, memories, little notes and big plans. Seen by exactly two people.
            </p>
          </div>
          <ul className="flex flex-wrap gap-2 text-sm">
            {['💬 Private chat', '📸 Shared memories', '💌 Love notes', '💕 Nudges', '📅 Your calendar'].map((item) => (
              <li key={item} className="rounded-full bg-white/15 px-3.5 py-1.5 backdrop-blur">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <main className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm animate-fade-up">
          <Link to="/login" className="mb-8 inline-block lg:hidden" aria-label={`${APP_NAME} home`}>
            <Wordmark />
          </Link>
          <h1 className="text-[34px] leading-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-muted">{subtitle}</p>}
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-7 text-center text-sm text-muted">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
