import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { ApiError, errorMessage, post } from '@/lib/api';
import type { Session } from '@/lib/types';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/ui';
import { Button, Input, Spinner } from '@/components/ui';
import { AuthLayout } from './AuthLayout';
import { GoogleButton } from './GoogleButton';

type Errors = Record<string, string>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(values: { name?: string; email?: string; password?: string }, fields: string[]) {
  const errors: Errors = {};
  if (fields.includes('name') && !values.name?.trim()) errors.name = 'Tell us your name';
  if (fields.includes('email') && !EMAIL_RE.test(values.email ?? '')) errors.email = 'Enter a valid email address';
  if (fields.includes('password') && (values.password?.length ?? 0) < 8) errors.password = 'Use at least 8 characters';
  return errors;
}

/** Turns a server error into per-field messages where possible. */
function serverErrors(err: unknown): Errors {
  if (err instanceof ApiError) {
    if (err.fields && Object.keys(err.fields).length) return err.fields;
    if (err.code === 'email_taken') return { email: err.message };
    return { _: err.message };
  }
  return { _: errorMessage(err) };
}

function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? 'text' : 'password'} className="pr-12" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute right-2 top-7 grid size-11 place-items-center text-muted hover:text-ink"
      >
        {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  );
}

function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
      {message}
    </p>
  );
}

export function Login() {
  const setSession = useAuth((s) => s.setSession);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validate({ email, password: password || '' }, ['email']);
    if (!password) found.password = 'Enter your password';
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      setSession(await post<Session & { accessToken: string }>('/auth/login', { email, password }));
    } catch (err) {
      setErrors(serverErrors(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your space."
      footer={
        <>
          New here?{' '}
          <Link to="/register" className="font-semibold text-accent">
            Create an account
          </Link>
        </>
      }
    >
      <GoogleButton />
      <form onSubmit={submit} noValidate className="space-y-4">
        <FormError message={errors._} />
        <Input label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <PasswordInput label="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
        <div className="text-right">
          <Link to="/forgot-password" className="text-sm font-medium text-accent">
            Forgot your password?
          </Link>
        </div>
        <Button type="submit" size="lg" block loading={busy}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}

export function Register() {
  const setSession = useAuth((s) => s.setSession);
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validate(values, ['name', 'email', 'password']);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      setSession(await post<Session & { accessToken: string }>('/auth/register', values));
      toast.success('Welcome! Check your inbox to confirm your email.', '💌');
    } catch (err) {
      setErrors(serverErrors(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Make a home for two"
      subtitle="Create your account, then invite your person."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-accent">
            Sign in
          </Link>
        </>
      }
    >
      <GoogleButton label="signup_with" />
      <form onSubmit={submit} noValidate className="space-y-4">
        <FormError message={errors._} />
        <Input label="Your name" autoComplete="given-name" value={values.name} onChange={set('name')} error={errors.name} maxLength={60} />
        <Input label="Email" type="email" autoComplete="email" inputMode="email" value={values.email} onChange={set('email')} error={errors.email} />
        <PasswordInput label="Password" autoComplete="new-password" value={values.password} onChange={set('password')} error={errors.password} hint="At least 8 characters" />
        <Button type="submit" size="lg" block loading={busy}>
          Create account
        </Button>
        <p className="text-center text-xs text-faint">Your space is private. There are no public profiles and nothing is shared outside the two of you.</p>
      </form>
    </AuthLayout>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email)) return setError('Enter a valid email address');
    setError('');
    setBusy(true);
    try {
      await post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title={sent ? 'Check your inbox' : 'Reset your password'}
      subtitle={
        sent
          ? `If an account exists for ${email}, a reset link is on its way. It expires in one hour.`
          : "Enter your email and we'll send you a link to choose a new one."
      }
      footer={
        <Link to="/login" className="font-semibold text-accent">
          Back to sign in
        </Link>
      }
    >
      {!sent && (
        <form onSubmit={submit} noValidate className="space-y-4">
          <Input label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} />
          <Button type="submit" size="lg" block loading={busy}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError('Use at least 8 characters');
    setBusy(true);
    try {
      await post('/auth/reset-password', { token, password });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout title="This link isn't valid" subtitle="Request a new password reset link to continue.">
        <Link to="/forgot-password" className="font-semibold text-accent">
          Request a new link
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={done ? 'Password updated' : 'Choose a new password'}
      subtitle={done ? "You've been signed out everywhere. Sign in with your new password." : undefined}
    >
      {done ? (
        <Link to="/login">
          <Button size="lg" block>
            Sign in
          </Button>
        </Link>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <PasswordInput label="New password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={error} hint="At least 8 characters" />
          <Button type="submit" size="lg" block loading={busy}>
            Update password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

export function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working');
  const status = useAuth((s) => s.status);
  const reload = useAuth((s) => s.reload);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // the token is single-use, so only try once
    started.current = true;
    if (!token) return setState('failed');
    post('/auth/verify-email', { token })
      .then(() => {
        setState('done');
        void reload();
      })
      .catch(() => setState('failed'));
  }, [token, reload]);

  return (
    <AuthLayout
      title={state === 'working' ? 'Confirming your email…' : state === 'done' ? 'Email confirmed' : "That link didn't work"}
      subtitle={
        state === 'done'
          ? 'Thank you. Your account is now recoverable if you ever forget your password.'
          : state === 'failed'
            ? 'It may have expired or already been used. You can send a new one from Settings.'
            : undefined
      }
    >
      {state === 'working' ? (
        <Spinner className="size-6 text-accent" />
      ) : (
        <Link to={status === 'authed' ? '/' : '/login'}>
          <Button size="lg" block>
            {status === 'authed' ? 'Back to our space' : 'Sign in'}
          </Button>
        </Link>
      )}
    </AuthLayout>
  );
}
