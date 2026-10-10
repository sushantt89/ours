import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { get } from '@/lib/api';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import { setBadge } from '@/lib/push';
import { announceUpdate, registerServiceWorker } from '@/lib/pwa';
import { useAuth } from '@/store/auth';
import { useChat } from '@/store/chat';
import { AppShell } from '@/components/layout/AppShell';
import { NudgeOverlay } from '@/components/layout/NudgeOverlay';
import { CallOverlay } from '@/features/calls/CallOverlay';
import { useLocationSharing } from '@/features/locate/useLocationSharing';
import { useE2EE } from '@/store/e2ee';
import { patch } from '@/lib/api';
import { browserTimeZone } from '@/lib/dates';
import type { User } from '@/lib/types';
import { ConfirmHost, FullPageLoader, Toasts } from '@/components/ui';
import { Login, Register, ForgotPassword, ResetPassword, VerifyEmail } from '@/features/auth/AuthPages';
import Welcome from '@/features/onboarding/Welcome';
import Join from '@/features/onboarding/Join';
import Home from '@/features/home/Home';

// Everything past the home screen is loaded on demand to keep the first paint fast.
const Chat = lazy(() => import('@/features/chat/Chat'));
const Memories = lazy(() => import('@/features/memories/Memories'));
const Calendar = lazy(() => import('@/features/calendar/Calendar'));
const More = lazy(() => import('@/features/more/More'));
const Notes = lazy(() => import('@/features/notes/Notes'));
const Nudges = lazy(() => import('@/features/nudges/Nudges'));
const Quick = lazy(() => import('@/features/nudges/Quick'));
const DailyQuestion = lazy(() => import('@/features/question/DailyQuestion'));
const Lists = lazy(() => import('@/features/lists/Lists'));
const BucketList = lazy(() => import('@/features/bucket/BucketList'));
const DateNight = lazy(() => import('@/features/dates/DateNight'));
const Countdowns = lazy(() => import('@/features/countdowns/Countdowns'));
const Story = lazy(() => import('@/features/story/Story'));
const Files = lazy(() => import('@/features/files/Files'));
const Notifications = lazy(() => import('@/features/notifications/Notifications'));
const Widgets = lazy(() => import('@/features/widgets/Widgets'));
const Settings = lazy(() => import('@/features/settings/Settings'));
const Music = lazy(() => import('@/features/music/Music'));
const Journal = lazy(() => import('@/features/journal/Journal'));
const LittleThings = lazy(() => import('@/features/little/LittleThings'));
const Gifts = lazy(() => import('@/features/gifts/Gifts'));
const Watchlist = lazy(() => import('@/features/watch/Watchlist'));
const Distance = lazy(() => import('@/features/distance/Distance'));
const Games = lazy(() => import('@/features/games/Games'));
const Recap = lazy(() => import('@/features/recap/Recap'));
const MemoryMap = lazy(() => import('@/features/map/MemoryMap'));
const Locate = lazy(() => import('@/features/locate/Locate'));

/** Signed-in area. Guests are sent to sign in and brought back afterwards. */
function RequireAuth() {
  const status = useAuth((s) => s.status);
  const location = useLocation();
  if (status === 'loading') return <FullPageLoader />;
  if (status === 'guest') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}

/** The couple space itself. Without a couple there is nothing to show yet. */
function RequireCouple() {
  const couple = useAuth((s) => s.couple);
  if (!couple) return <Navigate to="/welcome" replace />;
  return <Outlet />;
}

function GuestOnly() {
  const status = useAuth((s) => s.status);
  const location = useLocation();
  if (status === 'loading') return <FullPageLoader />;
  if (status === 'authed') return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/'} replace />;
  return <Outlet />;
}

/** Starts and stops everything that should only run while a couple is signed in. */
function useLiveSession() {
  const status = useAuth((s) => s.status);
  const coupleId = useAuth((s) => s.couple?.id);
  const unread = useChat((s) => s.unread);

  useEffect(() => {
    if (status !== 'authed' || !coupleId) return;
    connectSocket();
    get<{ count: number }>('/messages/unread')
      .then((r) => useChat.getState().setUnread(r.count))
      .catch(() => undefined);
    return () => {
      disconnectSocket();
      useChat.getState().reset();
    };
  }, [status, coupleId]);

  useEffect(() => setBadge(status === 'authed' ? unread : 0), [unread, status]);

  // Load this device's encryption keys for the couple (if encrypted chat is used).
  const couple = useAuth((s) => s.couple);
  const keyCount = couple?.e2ee.keys.length ?? 0;
  useEffect(() => {
    if (status === 'authed' && couple) void useE2EE.getState().load(couple);
  }, [status, couple?.id, keyCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep each person's time zone current, so long-distance clocks and timed nudges are right.
  const zone = useAuth((s) => s.user?.timezone);
  useEffect(() => {
    if (status !== 'authed' || !zone || useAuth.getState().offlineSession) return;
    const here = browserTimeZone();
    if (zone !== here) {
      patch<{ user: User }>('/me', { timezone: here })
        .then(({ user }) => useAuth.setState({ user }))
        .catch(() => undefined);
    }
  }, [status, zone]);
}

export default function App() {
  const bootstrap = useAuth((s) => s.bootstrap);
  const navigate = useNavigate();

  useEffect(() => {
    void bootstrap();
    registerServiceWorker();
    announceUpdate();
  }, [bootstrap]);

  useEffect(() => {
    // In-app notifications and push clicks ask the router to navigate.
    const go = (e: Event) => navigate((e as CustomEvent<string>).detail);
    window.addEventListener('ours:navigate', go);
    return () => window.removeEventListener('ours:navigate', go);
  }, [navigate]);

  useLiveSession();
  useLocationSharing();

  return (
    <>
      <Suspense fallback={<FullPageLoader />}>
        <Routes>
          <Route element={<GuestOnly />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
          </Route>
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/join/:code" element={<Join />} />

          <Route element={<RequireAuth />}>
            <Route path="/welcome" element={<Welcome />} />
            <Route element={<RequireCouple />}>
              <Route element={<AppShell />}>
                <Route index element={<Home />} />
                <Route path="/chat" element={<Chat />} />
                <Route path="/memories" element={<Memories />} />
                <Route path="/calendar" element={<Calendar />} />
                <Route path="/more" element={<More />} />
                <Route path="/notes" element={<Notes />} />
                <Route path="/nudges" element={<Nudges />} />
                <Route path="/quick" element={<Quick />} />
                <Route path="/question" element={<DailyQuestion />} />
                <Route path="/lists" element={<Lists />} />
                <Route path="/bucket-list" element={<BucketList />} />
                <Route path="/date-night" element={<DateNight />} />
                <Route path="/countdowns" element={<Countdowns />} />
                <Route path="/story" element={<Story />} />
                <Route path="/files" element={<Files />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/widgets" element={<Widgets />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/music" element={<Music />} />
                <Route path="/journal" element={<Journal />} />
                <Route path="/little-things" element={<LittleThings />} />
                <Route path="/gifts" element={<Gifts />} />
                <Route path="/watchlist" element={<Watchlist />} />
                <Route path="/distance" element={<Distance />} />
                <Route path="/games" element={<Games />} />
                <Route path="/recap" element={<Recap />} />
                <Route path="/map" element={<MemoryMap />} />
                <Route path="/locate" element={<Locate />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <NudgeOverlay />
      <CallOverlay />
      <Toasts />
      <ConfirmHost />
    </>
  );
}
