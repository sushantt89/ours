import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Camera, Download, LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { del, errorMessage, patch, post, setAccessToken, upload } from '@/lib/api';
import { ACCENTS, NOTIFICATION_SETTINGS } from '@/lib/constants';
import { browserTimeZone, todayIn } from '@/lib/dates';
import { disablePush, enablePush, getPushState, type PushState } from '@/lib/push';
import { cn } from '@/lib/cn';
import type { Accent, NotificationPrefs, Privacy, Session, User } from '@/lib/types';
import { useAuth, useCouple, useMe, usePartner } from '@/store/auth';
import { confirm, toast, useUI, type ThemeMode } from '@/store/ui';
import { Avatar, Button, Card, Chip, Input, Segmented, Select, Sheet, Switch, Textarea } from '@/components/ui';
import { Page } from '@/components/layout/AppShell';
import { BackButton } from '@/components/layout/BackButton';
import { DriveCard } from '@/features/files/DriveCard';
import { InviteCard } from '@/features/onboarding/InviteCard';
import { SetupSheet, UnlockSheet, turnOffEncryption } from '@/features/chat/E2EESheets';
import { e2eeStatus, useE2EE } from '@/store/e2ee';
import { ShieldCheck } from 'lucide-react';

const SECTIONS = [
  { id: 'account', label: 'Account' },
  { id: 'couple', label: 'Couple' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'encryption', label: 'Encryption' },
  { id: 'data', label: 'Data' },
  { id: 'about', label: 'About' },
] as const;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-32 pt-8 first:pt-2" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="mb-3 px-1 text-2xl">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/** Saves a change to the signed-in user and reflects it immediately. */
async function saveMe(body: Record<string, unknown>) {
  const previous = useAuth.getState().user;
  try {
    const { user } = await patch<{ user: User }>('/me', body);
    useAuth.setState({ user });
    return true;
  } catch (err) {
    useAuth.setState({ user: previous });
    toast.error(errorMessage(err));
    return false;
  }
}

function PhotoButton({ label, onPick, children, wide }: { label: string; onPick: (file: File) => Promise<void>; children: ReactNode; wide?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-busy={busy}
        onClick={() => input.current?.click()}
        className={cn('group relative shrink-0', wide && 'block w-full', busy && 'animate-pulse')}
      >
        {children}
        <span className={cn('absolute grid size-8 place-items-center rounded-full border-[3px] border-surface bg-ink text-bg transition group-hover:scale-110', wide ? 'bottom-3 right-3' : '-bottom-1 -right-1')}>
          <Camera className="size-3.5" />
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          try {
            await onPick(file);
          } catch (err) {
            toast.error(errorMessage(err));
          } finally {
            setBusy(false);
            e.target.value = '';
          }
        }}
      />
    </>
  );
}

function AccountSection() {
  const me = useMe();
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();
  const [name, setName] = useState(me.name);
  const [birthday, setBirthday] = useState(me.birthday ?? '');
  const [saving, setSaving] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = name.trim() !== me.name || birthday !== (me.birthday ?? '');

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    if (await saveMe({ name: name.trim(), birthday: birthday || null })) toast.success('Profile saved');
    setSaving(false);
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (next.length < 8) return setPasswordError('Use at least 8 characters');
    setBusy(true);
    setPasswordError('');
    try {
      const { accessToken } = await post<{ accessToken: string }>('/me/password', { current, next });
      setAccessToken(accessToken);
      toast.success('Password updated. Other devices have been signed out.');
      setPasswordOpen(false);
      setCurrent('');
      setNext('');
    } catch (err) {
      setPasswordError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section id="account" title="Account">
      <Card className="p-5">
        <form onSubmit={save} className="space-y-4">
          <div className="flex items-center gap-4">
            <PhotoButton
              label="Change profile photo"
              onPick={async (file) => {
                const form = new FormData();
                form.append('file', file);
                const { user } = await upload<{ user: User }>('/me/avatar', form);
                useAuth.setState({ user });
              }}
            >
              <Avatar name={me.name} src={me.avatarUrl} size="lg" />
            </PhotoButton>
            <div className="min-w-0">
              <p className="truncate font-semibold">{me.email}</p>
              <p className="text-sm text-muted">
                {me.emailVerified ? (
                  'Email confirmed ✓'
                ) : (
                  <>
                    Email not confirmed.{' '}
                    <button
                      type="button"
                      className="font-semibold text-accent"
                      onClick={() =>
                        post('/auth/resend-verification')
                          .then(() => toast.success('Confirmation email sent', '✉️'))
                          .catch((err) => toast.error(errorMessage(err)))
                      }
                    >
                      Resend link
                    </button>
                  </>
                )}
              </p>
            </div>
          </div>
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          <Input label="Birthday" hint="Shown on your shared calendar." type="date" max={todayIn()} value={birthday} onChange={(e) => setBirthday(e.target.value)} />
          <Button type="submit" loading={saving} disabled={!dirty || !name.trim()}>
            Save profile
          </Button>
        </form>
      </Card>

      <Card className="divide-y divide-line/70">
        <div className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="font-medium">Password</p>
            <p className="text-sm text-muted">Changing it signs you out on other devices.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setPasswordOpen(true)}>
            Change
          </Button>
        </div>
        <div className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="font-medium">Google account</p>
            <p className="text-sm text-muted">{me.hasGoogle ? 'Linked. You can sign in with Google.' : 'Not linked. Sign in with Google using this email address to link it.'}</p>
          </div>
          <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', me.hasGoogle ? 'bg-success/15 text-success' : 'bg-surface-2 text-muted')}>{me.hasGoogle ? 'Linked' : 'Not linked'}</span>
        </div>
        <div className="p-4">
          <Button
            variant="outline"
            icon={<LogOut className="size-4" />}
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            Sign out
          </Button>
        </div>
      </Card>

      <Sheet open={passwordOpen} onClose={() => setPasswordOpen(false)} title="Change password">
        <form onSubmit={changePassword} className="space-y-4">
          <Input label="Current password" type="password" autoComplete="current-password" hint="Leave empty if you only ever signed in with Google." value={current} onChange={(e) => setCurrent(e.target.value)} />
          <Input label="New password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} error={passwordError} hint="At least 8 characters" />
          <Button type="submit" block size="lg" loading={busy}>
            Update password
          </Button>
        </form>
      </Sheet>
    </Section>
  );
}

function CoupleSection() {
  const couple = useCouple();
  const partner = usePartner();
  const setSession = useAuth((s) => s.setSession);
  const [form, setForm] = useState({ name: couple.name, description: couple.description, startDate: couple.startDate ?? '' });
  const [saving, setSaving] = useState(false);
  const dirty = form.name.trim() !== couple.name || form.description.trim() !== couple.description || form.startDate !== (couple.startDate ?? '');

  async function update(body: Record<string, unknown>, message?: string) {
    try {
      setSession(await patch<Session>('/couple', body));
      if (message) toast.success(message);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    await update({ name: form.name.trim(), description: form.description.trim(), startDate: form.startDate || null }, 'Saved for both of you');
    setSaving(false);
  }

  const uploadPhoto = (slot: 'avatar' | 'cover') => async (file: File) => {
    const data = new FormData();
    data.append('file', file);
    setSession(await upload<Session>(`/couple/photo/${slot}`, data));
  };

  return (
    <Section id="couple" title="Couple">
      <InviteCard />
      <Card className="overflow-hidden">
        <PhotoButton wide label="Change cover image" onPick={uploadPhoto('cover')}>
          <span className="block h-32 w-full overflow-hidden accent-gradient sm:h-40">
            {couple.coverUrl && <img src={couple.coverUrl} alt="" className="size-full object-cover" />}
          </span>
        </PhotoButton>
        <form onSubmit={save} className="space-y-4 p-5">
          <div className="-mt-12 flex items-end gap-3">
            <PhotoButton label="Change couple photo" onPick={uploadPhoto('avatar')}>
              <span className="block rounded-full ring-4 ring-surface">
                <Avatar name={couple.name || '♥'} src={couple.avatarUrl} size="lg" />
              </span>
            </PhotoButton>
            {partner && (
              <p className="pb-1 text-sm text-muted">
                With <span className="font-semibold text-ink">{partner.name}</span>
              </p>
            )}
          </div>
          <Input label="Couple name" hint="Leave empty to use both your names." value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={60} />
          <Textarea label="About us" rows={2} placeholder="A line that sums you two up" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={240} />
          <Input label="Together since" hint="Sets your counter, milestones and anniversary." type="date" max={todayIn(couple.timezone)} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          <Button type="submit" loading={saving} disabled={!dirty}>
            Save
          </Button>
        </form>
      </Card>

      <Card className="p-5">
        <p className="font-medium">Our colour</p>
        <p className="text-sm text-muted">Changes the look of the app for both of you.</p>
        <div className="mt-3 flex flex-wrap gap-3" role="radiogroup" aria-label="Theme colour">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              role="radio"
              aria-checked={couple.theme === a.id}
              onClick={() => {
                useUI.getState().setAccent(a.id as Accent); // instant, then confirmed by the server
                void update({ theme: a.id });
              }}
              className="flex flex-col items-center gap-1.5"
            >
              <span className={cn('size-12 rounded-full border-[3px] transition', couple.theme === a.id ? 'scale-110 border-ink' : 'border-transparent')} style={{ background: a.swatch }} />
              <span className={cn('text-xs font-medium', couple.theme === a.id ? 'text-ink' : 'text-muted')}>{a.label}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="font-medium">Time zone</p>
          <p className="truncate text-sm text-muted">{couple.timezone.replace(/_/g, ' ')} · decides when "today" starts for reminders</p>
        </div>
        {couple.timezone !== browserTimeZone() && (
          <Button variant="outline" size="sm" onClick={() => update({ timezone: browserTimeZone() }, 'Time zone updated')}>
            Use mine
          </Button>
        )}
      </Card>
    </Section>
  );
}

function AppearanceSection() {
  const mode = useUI((s) => s.mode);
  const setMode = useUI((s) => s.setMode);
  return (
    <Section id="appearance" title="Appearance">
      <Card className="p-5">
        <p className="mb-3 font-medium">Mode</p>
        <Segmented<ThemeMode>
          label="Colour mode"
          className="w-full"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'light', label: <span className="inline-flex items-center gap-1.5"><Sun className="size-4" /> Light</span> },
            { value: 'dark', label: <span className="inline-flex items-center gap-1.5"><Moon className="size-4" /> Dark</span> },
            { value: 'system', label: <span className="inline-flex items-center gap-1.5"><Monitor className="size-4" /> Auto</span> },
          ]}
        />
        <p className="mt-3 text-sm text-muted">Saved on this device only, so each of you can choose your own.</p>
      </Card>
    </Section>
  );
}

function NotificationsSection() {
  const me = useMe();
  const config = useAuth((s) => s.config);
  const prefs = me.notificationPrefs;
  const [push, setPush] = useState<PushState>('off');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getPushState().then(setPush);
  }, []);

  const setPref = (patchPrefs: Partial<NotificationPrefs> | { quietHours: Partial<NotificationPrefs['quietHours']> }) => {
    // Optimistic: flip the switch now, roll back if the save fails.
    const next = { ...prefs, ...patchPrefs, quietHours: { ...prefs.quietHours, ...(patchPrefs as { quietHours?: object }).quietHours } };
    useAuth.setState({ user: { ...me, notificationPrefs: next } });
    void saveMe({ notificationPrefs: patchPrefs });
  };

  async function togglePush(on: boolean) {
    setBusy(true);
    try {
      if (on) {
        if (!config?.pushPublicKey) return toast.error('Push notifications are not set up on this server yet');
        const state = await enablePush(config.pushPublicKey);
        setPush(state);
        if (state === 'on') setPref({ push: true });
        else if (state === 'blocked') toast.error("Notifications are blocked in your browser's settings for this site");
      } else {
        setPush(await disablePush());
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const hours = Array.from({ length: 24 }, (_, h) => ({ value: h, label: new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' }) }));

  return (
    <Section id="notifications" title="Notifications">
      <Card className="px-5 py-2">
        <Switch
          label="Push notifications on this device"
          hint={
            push === 'unsupported'
              ? "This browser doesn't support push notifications."
              : push === 'needs-install'
                ? 'On iPhone, add the app to your home screen first.'
                : push === 'blocked'
                  ? "Blocked in your browser's site settings."
                  : !config?.pushPublicKey
                    ? 'Not set up on this server yet.'
                    : 'Get notified even when the app is closed.'
          }
          checked={push === 'on'}
          disabled={busy || push === 'unsupported' || push === 'needs-install' || !config?.pushPublicKey}
          onChange={togglePush}
        />
        {push === 'on' && (
          <div className="pb-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                post('/notifications/push/test')
                  .then(() => toast.info('Sent. It should arrive in a moment (put the app in the background to see it).'))
                  .catch((err) => toast.error(errorMessage(err)))
              }
            >
              Send a test
            </Button>
          </div>
        )}
      </Card>

      <Card className="divide-y divide-line/70 px-5">
        {NOTIFICATION_SETTINGS.map((item) => (
          <Switch
            key={item.key}
            label={item.label}
            hint={item.hint}
            checked={prefs[item.key as keyof NotificationPrefs] as boolean}
            onChange={(value) => setPref({ [item.key]: value } as Partial<NotificationPrefs>)}
          />
        ))}
      </Card>

      <Card className="px-5 py-2">
        <Switch label="Quiet hours" hint="Hold reminders overnight. Messages and nudges still come through." checked={prefs.quietHours.enabled} onChange={(enabled) => setPref({ quietHours: { enabled } })} />
        {prefs.quietHours.enabled && (
          <div className="grid grid-cols-2 gap-3 pb-4">
            <Select label="From" value={prefs.quietHours.start} onChange={(e) => setPref({ quietHours: { start: Number(e.target.value) } })}>
              {hours.map((h) => (
                <option key={h.value} value={h.value}>
                  {h.label}
                </option>
              ))}
            </Select>
            <Select label="Until" value={prefs.quietHours.end} onChange={(e) => setPref({ quietHours: { end: Number(e.target.value) } })}>
              {hours.map((h) => (
                <option key={h.value} value={h.value}>
                  {h.label}
                </option>
              ))}
            </Select>
          </div>
        )}
      </Card>
    </Section>
  );
}

function PrivacySection() {
  const me = useMe();
  const privacy = me.privacy;
  const set = (change: Partial<Privacy>) => {
    useAuth.setState({ user: { ...me, privacy: { ...privacy, ...change } } });
    void saveMe({ privacy: change });
  };
  return (
    <Section id="privacy" title="Privacy">
      <Card className="divide-y divide-line/70 px-5">
        <Switch label="Show when I'm online" hint="Your partner sees a green dot while you have the app open." checked={privacy.showOnline} onChange={(v) => set({ showOnline: v })} />
        <Switch label="Show last seen" hint="Your partner sees when you were last here." checked={privacy.showLastSeen} onChange={(v) => set({ showLastSeen: v })} />
        <Switch label="Read receipts" hint="Your partner sees when you've read their messages." checked={privacy.readReceipts} onChange={(v) => set({ readReceipts: v })} />
        <Switch label="Share my mood" hint="When off, moods you log are kept just for you." checked={privacy.shareMood} onChange={(v) => set({ shareMood: v })} />
        <Switch
          label="Keep new memories private by default"
          hint="You can still choose per upload. Private memories are only visible to you."
          checked={privacy.memoryDefault === 'private'}
          onChange={(v) => set({ memoryDefault: v ? 'private' : 'shared' })}
        />
      </Card>
      <p className="px-1 text-sm leading-relaxed text-muted">
        Your space has no public profile and cannot be found or viewed by anyone else. Photos and files are only served to the two of you, and nothing is shared with third parties unless you connect a service yourself.
      </p>
    </Section>
  );
}

function EncryptionSection() {
  const couple = useCouple();
  const config = useAuth((s) => s.config);
  const setSession = useAuth((s) => s.setSession);
  const keys = useE2EE((s) => s.keys);
  const status = e2eeStatus(couple, keys);
  const [setup, setSetup] = useState(false);
  const [unlock, setUnlock] = useState(false);
  const missing = couple.e2ee.keys.filter((k) => !keys[k.keyId]).length;

  return (
    <Section id="encryption" title="Encrypted chat & calls">
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className={cn('grid size-11 shrink-0 place-items-center rounded-2xl', status.enabled ? 'bg-success/15 text-success' : 'bg-surface-2 text-muted')}>
            <ShieldCheck className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">End-to-end encrypted chat</p>
            <p className="text-sm text-muted">
              {status.enabled
                ? status.locked
                  ? 'On. This device needs your passphrase to read and send messages.'
                  : 'On. Only your two devices can read new messages, photos and voice notes.'
                : couple.e2ee.keys.length
                  ? 'Off. Earlier encrypted messages stay readable on devices with the passphrase.'
                  : 'Lock your messages with a passphrase only the two of you know. Not even the server can read them.'}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {!status.enabled && couple.e2ee.keys.length === 0 && <Button onClick={() => setSetup(true)}>Turn on</Button>}
          {!status.enabled && couple.e2ee.keys.length > 0 && (
            <Button
              onClick={async () => {
                try {
                  setSession(await post<Session>('/couple/e2ee/enabled', { enabled: true }));
                } catch (err) {
                  toast.error(errorMessage(err));
                }
              }}
            >
              Turn back on
            </Button>
          )}
          {missing > 0 && (
            <Button variant={status.locked ? 'primary' : 'outline'} onClick={() => setUnlock(true)}>
              Unlock on this device
            </Button>
          )}
          {status.enabled && !status.locked && (
            <Button variant="outline" onClick={() => setSetup(true)}>
              Change passphrase
            </Button>
          )}
          {status.enabled && (
            <Button variant="ghost" className="text-danger" onClick={turnOffEncryption}>
              Turn off
            </Button>
          )}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-muted">
          Signing out removes the key from this device; you'll enter the passphrase again next time. Who sent what and when, reactions, and call times are not encrypted.
        </p>
      </Card>
      <Card className="flex items-start gap-3 p-5">
        <span className="text-2xl">📞</span>
        <div className="text-sm">
          <p className="font-semibold">Voice and video calls</p>
          <p className="mt-0.5 text-muted">
            Calls go directly between your two devices and are always encrypted in transit.
            {config?.turnEnabled ? ' A relay server is set up for networks that block direct calls.' : ' No relay server is set up, so calls may not connect on some mobile or work networks.'}
          </p>
        </div>
      </Card>
      <SetupSheet open={setup} onClose={() => setSetup(false)} />
      <UnlockSheet open={unlock} onClose={() => setUnlock(false)} />
    </Section>
  );
}

function DataSection() {
  const me = useMe();
  const couple = useCouple();
  const partner = usePartner();
  const setSession = useAuth((s) => s.setSession);
  const clear = useAuth((s) => s.clear);
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function leave() {
    const ok = await confirm({
      title: 'Leave this couple space?',
      body: partner
        ? `You'll lose access to everything here straight away. ${partner.name} keeps the space to look back on, but nobody new can join it. This can't be undone.`
        : "Your space and everything in it will be permanently deleted. This can't be undone.",
      confirmLabel: 'Leave space',
      danger: true,
      typeToConfirm: 'LEAVE',
    });
    if (!ok) return;
    try {
      setSession(await post<Session>('/couple/leave', { confirm: 'LEAVE' }));
      navigate('/welcome', { replace: true });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function deleteAccount(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await del('/me', { password: password || undefined, confirm: 'DELETE' });
      clear();
      navigate('/login', { replace: true });
      toast.info('Your account has been deleted');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section id="data" title="Data">
      <Card className="divide-y divide-line/70">
        <div className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="font-medium">Export our data</p>
            <p className="text-sm text-muted">Messages, notes, calendar, lists and more as a JSON file.</p>
          </div>
          <a href="/api/data/export.json" download>
            <Button variant="outline" size="sm" icon={<Download className="size-4" />}>
              Export
            </Button>
          </a>
        </div>
        <div className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="font-medium">Download memories</p>
            <p className="text-sm text-muted">Every photo and video, in a zip organised by date.</p>
          </div>
          <a href="/api/data/memories.zip" download>
            <Button variant="outline" size="sm" icon={<Download className="size-4" />}>
              Download
            </Button>
          </a>
        </div>
      </Card>

      <Card className="divide-y divide-line/70 border-danger/25">
        <div className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="font-medium">Leave couple</p>
            <p className="text-sm text-muted">{couple.status === 'ended' || !partner ? 'Deletes this space and everything in it.' : 'Removes you from this space.'}</p>
          </div>
          <Button variant="outline" size="sm" className="text-danger" onClick={leave}>
            Leave
          </Button>
        </div>
        <div className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="font-medium">Delete account</p>
            <p className="text-sm text-muted">Permanently removes your account and personal data.</p>
          </div>
          <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
            Delete
          </Button>
        </div>
      </Card>

      <Sheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete your account?" variant="center">
        <form onSubmit={deleteAccount} className="space-y-4">
          <p className="text-muted">
            This permanently deletes your account, {me.email}. You'll leave your couple space
            {partner ? `, and ${partner.name} will keep read access to what you shared` : ' and it will be deleted'}. Consider exporting your data first.
          </p>
          <Input label="Your password" type="password" autoComplete="current-password" hint="Leave empty if you only ever signed in with Google." value={password} onChange={(e) => setPassword(e.target.value)} error={error} />
          <Input label="Type DELETE to confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" autoComplete="off" />
          <div className="flex gap-3">
            <Button variant="outline" block onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" block loading={busy} disabled={typed.trim().toUpperCase() !== 'DELETE'}>
              Delete forever
            </Button>
          </div>
        </form>
      </Sheet>
    </Section>
  );
}

/** Which version is running and which features the server has switched on, plus a manual update. */
function AboutSection() {
  const config = useAuth((s) => s.config);
  const [checking, setChecking] = useState(false);
  const version = __APP_COMMIT__ ? `${__APP_COMMIT__} · built ${__APP_BUILT__} UTC` : `built ${__APP_BUILT__} UTC`;
  const outdated = Boolean(config?.commit && __APP_COMMIT__ && config.commit !== __APP_COMMIT__);
  const features: [string, boolean | undefined][] = [
    ['GIFs', config?.gifsEnabled],
    ['Notifications', Boolean(config?.pushPublicKey)],
    ['Google', Boolean(config?.googleClientId)],
    ['Call relay', config?.turnEnabled],
  ];

  async function check() {
    setChecking(true);
    try {
      const { updateApp } = await import('@/lib/pwa');
      if ((await updateApp()) === 'current') toast.success("You're on the latest version");
      else toast.info('Updating…', '✨');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setChecking(false);
    }
  }

  return (
    <Section id="about" title="About">
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium">App version</p>
            <p className="truncate text-sm text-muted">{version}</p>
            {outdated && <p className="text-sm text-accent">A newer version is available</p>}
          </div>
          <Button variant="outline" size="sm" loading={checking} onClick={check}>
            Check for updates
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {config ? (
            features.map(([label, on]) => (
              <span key={label} className={cn('rounded-full px-2.5 py-1 text-xs font-medium', on ? 'bg-success/15 text-success' : 'bg-surface-2 text-faint')}>
                {label}: {on ? 'on' : 'off'}
              </span>
            ))
          ) : (
            <span className="text-sm text-muted">Couldn't reach the server for feature settings yet.</span>
          )}
        </div>
      </Card>
    </Section>
  );
}

export default function Settings() {
  const [params] = useSearchParams();
  const [active, setActive] = useState<string>(params.get('section') ?? 'account');

  const jump = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    const section = params.get('section');
    if (section) setTimeout(() => document.getElementById(section)?.scrollIntoView({ block: 'start' }), 80);
  }, [params]);

  return (
    <Page title="Settings" back={<BackButton />}>
      <nav aria-label="Settings sections" className="no-scrollbar sticky top-[calc(env(safe-area-inset-top)+4rem)] z-10 -mx-4 flex gap-2 overflow-x-auto bg-bg/80 px-4 py-2 backdrop-blur-xl lg:top-[5.5rem] lg:mx-0 lg:px-0">
        {SECTIONS.map((s) => (
          <Chip key={s.id} active={active === s.id} onClick={() => jump(s.id)}>
            {s.label}
          </Chip>
        ))}
      </nav>

      <AccountSection />
      <CoupleSection />
      <AppearanceSection />
      <NotificationsSection />
      <Section id="integrations" title="Integrations">
        <DriveCard />
        <Card className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="font-medium">Google Calendar and other calendars</p>
            <p className="text-sm text-muted">Export your shared calendar as an .ics file and import it into Google, Apple or Outlook. Live two-way sync isn't built yet.</p>
          </div>
          <Link to="/calendar">
            <Button variant="outline" size="sm">
              Open
            </Button>
          </Link>
        </Card>
      </Section>
      <PrivacySection />
      <EncryptionSection />
      <DataSection />
      <AboutSection />
      <p className="pt-10 text-center text-xs text-faint">Ours · made for two</p>
    </Page>
  );
}
