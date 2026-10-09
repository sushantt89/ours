import { type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import { cn } from '@/lib/cn';
import { daysBetween, todayIn } from '@/lib/dates';
import { useAuth, useCouple, useMe, usePartner } from '@/store/auth';
import { useChat } from '@/store/chat';
import { useUI } from '@/store/ui';
import { useUnreadNotifications } from '@/features/notifications/useNotifications';
import { CoupleAvatars } from '@/components/ui';
import { GROUPS, MORE_TAB, PRIMARY, UTILITY, type NavItem } from './nav';

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-bold leading-none text-on-accent" aria-label={`${count} unread`}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function coupleTitle(coupleName: string, me: string, partner?: string | null) {
  return coupleName || (partner ? `${me} & ${partner}` : me);
}

function SideLink({ item, badge }: { item: NavItem; badge?: number }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn(
          'flex h-10 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition',
          isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-ink',
        )
      }
    >
      <Icon className="size-[18px]" strokeWidth={2} />
      <span className="flex-1 truncate">{item.label}</span>
      <Badge count={badge ?? 0} />
    </NavLink>
  );
}

function Sidebar() {
  const me = useMe();
  const couple = useCouple();
  const partner = usePartner();
  const unreadChat = useChat((s) => s.unread);
  const unreadNotifications = useUnreadNotifications();
  const days = couple.startDate ? daysBetween(couple.startDate, todayIn(couple.timezone)) : null;

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col border-r border-line/70 bg-surface/70 backdrop-blur-xl lg:flex">
      <div className="px-5 pb-4 pt-6">
        <CoupleAvatars a={me} b={partner} size="md" />
        <p className="mt-3 truncate font-display text-xl leading-tight">{coupleTitle(couple.name, me.name, partner?.name)}</p>
        {days !== null && <p className="text-sm text-muted">Day {(days + 1).toLocaleString()} together</p>}
      </div>
      <nav className="no-scrollbar flex-1 space-y-0.5 overflow-y-auto px-3 pb-4" aria-label="Main">
        {PRIMARY.map((item) => (
          <SideLink key={item.to} item={item} badge={item.to === '/chat' ? unreadChat : undefined} />
        ))}
        {GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">{group.label}</p>
            {group.items.map((item) => (
              <SideLink key={item.to} item={item} />
            ))}
          </div>
        ))}
      </nav>
      <div className="space-y-0.5 border-t border-line/70 px-3 py-3">
        {UTILITY.map((item) => (
          <SideLink key={item.to} item={item} badge={item.to === '/notifications' ? unreadNotifications : undefined} />
        ))}
      </div>
    </aside>
  );
}

function BottomNav() {
  const unreadChat = useChat((s) => s.unread);
  const unreadNotifications = useUnreadNotifications();
  const { pathname } = useLocation();
  const primaryPaths = PRIMARY.map((p) => p.to);
  // Anything that isn't one of the four main tabs lives under "More".
  const moreActive = !primaryPaths.some((p) => (p === '/' ? pathname === '/' : pathname.startsWith(p)));

  return (
    <nav
      aria-label="Main"
      className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-surface/85 backdrop-blur-xl lg:hidden"
    >
      <ul className="mx-auto flex h-16 max-w-md items-stretch px-2">
        {[...PRIMARY, MORE_TAB].map((item) => {
          const Icon = item.icon;
          const isMore = item.to === '/more';
          const badge = item.to === '/chat' ? unreadChat : isMore ? unreadNotifications : 0;
          return (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'relative flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition active:scale-95',
                    (isMore ? moreActive : isActive) ? 'text-accent' : 'text-muted',
                  )
                }
              >
                {({ isActive }) => {
                  const on = isMore ? moreActive : isActive;
                  return (
                    <>
                      <span className={cn('relative grid h-8 w-14 place-items-center rounded-full transition-colors', on && 'bg-accent-soft')}>
                        <Icon className="size-[22px]" strokeWidth={on ? 2.2 : 1.8} />
                        {badge > 0 && (
                          <span className="absolute -top-0.5 right-1.5">
                            <Badge count={badge} />
                          </span>
                        )}
                      </span>
                      {item.label}
                    </>
                  );
                }}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function OfflineBanner() {
  const online = useUI((s) => s.online);
  const offlineSession = useAuth((s) => s.offlineSession);
  if (online && !offlineSession) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-ink px-4 py-1.5 text-center text-xs font-medium text-bg">
      <WifiOff className="size-3.5" /> You're offline. Showing what was saved on this device.
    </div>
  );
}

export function AppShell() {
  const { pathname } = useLocation();
  const immersive = pathname.startsWith('/chat');
  return (
    <div className="paper min-h-dvh bg-bg">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded-full focus:bg-surface focus:px-4 focus:py-2 focus:shadow-float">
        Skip to content
      </a>
      <Sidebar />
      <div className="lg:pl-[264px]">
        <OfflineBanner />
        <main id="main">
          <Outlet />
        </main>
      </div>
      {!immersive && <BottomNav />}
    </div>
  );
}

/** Standard page frame: sticky title bar plus a centred content column. */
export function Page({
  title,
  subtitle,
  back,
  actions,
  children,
  wide,
  flush,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  wide?: boolean;
  flush?: boolean;
}) {
  return (
    <div className={cn('mx-auto w-full', wide ? 'max-w-5xl' : 'max-w-2xl')}>
      <header className="safe-top sticky top-0 z-20 bg-bg/80 backdrop-blur-xl">
        <div className="flex min-h-16 items-center gap-2 px-4 py-2 lg:px-6 lg:pt-6">
          {back}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[26px] leading-tight lg:text-3xl">{title}</h1>
            {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </div>
      </header>
      <div className={cn('animate-fade-up pb-28 lg:pb-12', !flush && 'px-4 pt-2 lg:px-6')}>{children}</div>
    </div>
  );
}
