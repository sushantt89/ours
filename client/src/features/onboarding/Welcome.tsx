import { useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Camera, Heart, KeyRound, LogOut } from 'lucide-react';
import { ApiError, errorMessage, patch, post, upload } from '@/lib/api';
import { browserTimeZone, todayIn } from '@/lib/dates';
import type { Session, User } from '@/lib/types';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/ui';
import { Avatar, Button, Card, Input } from '@/components/ui';
import { Wordmark } from '@/features/auth/AuthLayout';

const INVITE_KEY = 'ours:invite';
export const rememberInvite = (code: string) => sessionStorage.setItem(INVITE_KEY, code);
const forgetInvite = () => sessionStorage.removeItem(INVITE_KEY);

type Step = 'profile' | 'choose' | 'create' | 'join';

/** First-run flow: set up a profile, then start a couple space or join one. */
export default function Welcome() {
  const user = useAuth((s) => s.user)!;
  const couple = useAuth((s) => s.couple);
  const setSession = useAuth((s) => s.setSession);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();
  // Set when the person arrived through an invite link before signing up.
  const [invited] = useState(() => sessionStorage.getItem(INVITE_KEY));

  const [step, setStep] = useState<Step>('profile');
  const [name, setName] = useState(user.name);
  const [birthday, setBirthday] = useState(user.birthday ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [coupleName, setCoupleName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [code, setCode] = useState(invited ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  if (couple) return <Navigate to="/" replace />;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const saveProfile = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Tell us your name');
    void run(async () => {
      const { user: updated } = await patch<{ user: User }>('/me', { name: name.trim(), birthday: birthday || null });
      useAuth.setState({ user: updated });
      setStep(code ? 'join' : 'choose');
    });
  };

  const pickPhoto = (file?: File) => {
    if (!file) return;
    void run(async () => {
      const form = new FormData();
      form.append('file', file);
      const { user: updated } = await upload<{ user: User }>('/me/avatar', form);
      useAuth.setState({ user: updated });
      setAvatarUrl(updated.avatarUrl);
    });
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      setSession(await post<Session>('/couple', { name: coupleName.trim(), startDate: startDate || undefined, timezone: browserTimeZone() }));
      navigate('/', { replace: true });
    });
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    if (code.trim().length < 4) return setError('Enter the invite code your partner sent you');
    void run(async () => {
      setSession(await post<Session>('/couple/join', { code: code.trim() }));
      forgetInvite();
      toast.success("You're in. Welcome home.", '🥂');
      navigate('/', { replace: true });
    });
  };

  return (
    <div className="paper flex min-h-dvh flex-col items-center bg-bg px-5 py-8">
      <div className="flex w-full max-w-md items-center justify-between">
        <Wordmark />
        <Button variant="ghost" size="sm" icon={<LogOut className="size-4" />} onClick={logout}>
          Sign out
        </Button>
      </div>

      <div className="mt-10 w-full max-w-md animate-fade-up" key={step}>
        {step === 'profile' && (
          <form onSubmit={saveProfile} noValidate>
            <h1 className="text-[34px] leading-tight">First, a little about you</h1>
            <p className="mt-2 text-muted">This is how your partner will see you.</p>
            <div className="mt-8 flex flex-col items-center">
              <button type="button" onClick={() => fileInput.current?.click()} className="group relative" aria-label="Add a profile photo">
                <Avatar name={name || '?'} src={avatarUrl} size="xl" />
                <span className="absolute -bottom-1 -right-1 grid size-9 place-items-center rounded-full border-4 border-bg bg-ink text-bg transition group-hover:scale-110">
                  <Camera className="size-4" />
                </span>
              </button>
              <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => pickPhoto(e.target.files?.[0])} />
            </div>
            <div className="mt-8 space-y-4">
              <Input label="Your name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="given-name" />
              <Input label="Your birthday" hint="Optional. Adds it to your shared calendar." type="date" value={birthday} max={todayIn()} onChange={(e) => setBirthday(e.target.value)} />
              {error && <p role="alert" className="text-sm text-danger">{error}</p>}
              <Button type="submit" size="lg" block loading={busy}>
                Continue
              </Button>
            </div>
          </form>
        )}

        {step === 'choose' && (
          <div>
            <h1 className="text-[34px] leading-tight">Hi {user.name}. Now, the two of you.</h1>
            <p className="mt-2 text-muted">A space holds exactly two people. One of you starts it, the other joins.</p>
            <div className="mt-8 space-y-3">
              <button onClick={() => setStep('create')} className="block w-full text-left">
                <Card className="flex items-center gap-4 p-5 transition hover:-translate-y-0.5 hover:shadow-float">
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl accent-gradient text-on-accent">
                    <Heart className="size-6" />
                  </span>
                  <span>
                    <span className="block font-display text-xl">Start our space</span>
                    <span className="text-sm text-muted">Create it and get a code to invite your partner.</span>
                  </span>
                </Card>
              </button>
              <button onClick={() => setStep('join')} className="block w-full text-left">
                <Card className="flex items-center gap-4 p-5 transition hover:-translate-y-0.5 hover:shadow-float">
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
                    <KeyRound className="size-6" />
                  </span>
                  <span>
                    <span className="block font-display text-xl">I have an invite code</span>
                    <span className="text-sm text-muted">Your partner already started your space.</span>
                  </span>
                </Card>
              </button>
            </div>
          </div>
        )}

        {step === 'create' && (
          <form onSubmit={create} noValidate>
            <h1 className="text-[34px] leading-tight">Start your space</h1>
            <p className="mt-2 text-muted">You can change any of this later, together.</p>
            <div className="mt-8 space-y-4">
              <Input label="What should we call you two?" hint='Optional. Leave blank to use your names, like "Sushant & Priya".' value={coupleName} onChange={(e) => setCoupleName(e.target.value)} maxLength={60} placeholder="Team Us" />
              <Input label="When did it all begin?" hint="Powers your relationship counter and anniversary." type="date" value={startDate} max={todayIn()} onChange={(e) => setStartDate(e.target.value)} />
              {error && <p role="alert" className="text-sm text-danger">{error}</p>}
              <Button type="submit" size="lg" block loading={busy}>
                Create our space
              </Button>
              <Button variant="ghost" block onClick={() => setStep('choose')}>
                Back
              </Button>
            </div>
          </form>
        )}

        {step === 'join' && (
          <form onSubmit={join} noValidate>
            <h1 className="text-[34px] leading-tight">Join your partner</h1>
            <p className="mt-2 text-muted">Enter the 8-character code they shared with you.</p>
            <div className="mt-8 space-y-4">
              <Input
                label="Invite code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                maxLength={8}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                className="text-center font-display text-2xl tracking-[0.3em]"
                error={error}
                placeholder="········"
              />
              <Button type="submit" size="lg" block loading={busy}>
                Join our space
              </Button>
              <Button variant="ghost" block onClick={() => { setError(''); forgetInvite(); setStep('choose'); }}>
                Back
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
