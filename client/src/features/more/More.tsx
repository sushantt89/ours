import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useCouple, useMe, usePartner } from '@/store/auth';
import { Card, CoupleAvatars } from '@/components/ui';
import { Page, coupleTitle } from '@/components/layout/AppShell';
import { GROUPS, UTILITY } from '@/components/layout/nav';
import { useUnreadNotifications } from '@/features/notifications/useNotifications';

/** The phone "More" tab: everything that doesn't fit in the bottom bar. */
export default function More() {
  const me = useMe();
  const couple = useCouple();
  const partner = usePartner();
  const unread = useUnreadNotifications();

  return (
    <Page title="More">
      <Link to="/story" className="mb-5 flex items-center gap-4 rounded-card border border-line/70 bg-surface p-4 shadow-card">
        <CoupleAvatars a={me} b={partner} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xl">{coupleTitle(couple.name, me.name, partner?.name)}</p>
          <p className="text-sm text-muted">See your story and milestones</p>
        </div>
        <ChevronRight className="size-5 text-faint" />
      </Link>

      {GROUPS.map((group) => (
        <section key={group.label} className="mb-6">
          <h2 className="mb-2.5 px-1 font-sans text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">{group.label}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {group.items.map((item) => (
              <Link key={item.to} to={item.to} className="flex flex-col rounded-[26px] border border-line/70 bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-float active:scale-[0.98]">
                <span className="grid size-11 place-items-center rounded-2xl bg-accent-soft text-2xl" aria-hidden>
                  {item.emoji}
                </span>
                <span className="mt-3 font-semibold">{item.label}</span>
                <span className="mt-0.5 text-[13px] leading-snug text-muted">{item.hint}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <Card className="mt-5 divide-y divide-line/70 overflow-hidden">
        {UTILITY.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.to} to={item.to} className="flex items-center gap-3.5 px-4 py-3.5 transition hover:bg-surface-2">
              <Icon className="size-5 text-muted" />
              <span className="flex-1 font-medium">{item.label}</span>
              {item.to === '/notifications' && unread > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-on-accent">{unread}</span>
              )}
              <ChevronRight className="size-4 text-faint" />
            </Link>
          );
        })}
      </Card>
    </Page>
  );
}
