import { useEffect, useRef, useState } from 'react';
import { ApiError, errorMessage, post } from '@/lib/api';
import type { Session } from '@/lib/types';
import { useAuth } from '@/store/auth';
import { toast, useUI } from '@/store/ui';
import { Button, Sheet } from '@/components/ui';

interface GoogleId {
  initialize: (options: { client_id: string; callback: (response: { credential: string }) => void; ux_mode?: string }) => void;
  renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

let loading: Promise<void> | null = null;
function loadGoogle() {
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      reject(new Error('Google sign-in could not be loaded'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** Google's own sign-in button. Renders nothing when Google sign-in isn't configured. */
export function GoogleButton({ label = 'continue_with' }: { label?: 'continue_with' | 'signup_with' }) {
  const clientId = useAuth((s) => s.config?.googleClientId);
  const setSession = useAuth((s) => s.setSession);
  const mode = useUI((s) => s.mode);
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    loadGoogle()
      .then(() => {
        if (cancelled || !ref.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async ({ credential }) => {
            try {
              setSession(await post<Session & { accessToken: string }>('/auth/google', { credential }));
            } catch (err) {
              toast.error(err instanceof ApiError ? err.message : errorMessage(err));
            }
          },
        });
        window.google.accounts.id.renderButton(ref.current, {
          type: 'standard',
          shape: 'pill',
          size: 'large',
          text: label,
          logo_alignment: 'center',
          width: Math.min(384, ref.current.offsetWidth || 320),
          theme: document.documentElement.dataset.theme === 'dark' ? 'filled_black' : 'outline',
        });
        setReady(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [clientId, label, setSession, mode]);

  const divider = (
    <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-widest text-faint">
      <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
    </div>
  );

  if (!clientId) {
    // In production an unconfigured option is simply hidden. In development we show it with
    // setup steps, so it's obvious what's missing rather than silently absent.
    if (!import.meta.env.DEV) return null;
    return (
      <div>
        <button
          type="button"
          onClick={() => setSetupOpen(true)}
          className="flex h-11 w-full items-center justify-center gap-3 rounded-full border border-line bg-surface font-medium text-ink transition hover:bg-surface-2 active:scale-[0.98]"
        >
          <GoogleLogo /> {label === 'signup_with' ? 'Sign up with Google' : 'Continue with Google'}
        </button>
        {divider}
        <Sheet open={setupOpen} onClose={() => setSetupOpen(false)} title="Set up Google sign-in" variant="center">
          <p className="text-sm text-muted">Google sign-in is built in. It just needs a free Google OAuth client ID:</p>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
            <li>
              Open the <strong>Google Cloud console → APIs &amp; Services → Credentials</strong> and create an <strong>OAuth client ID</strong> of type <em>Web application</em>.
            </li>
            <li>
              Under <strong>Authorised JavaScript origins</strong> add <code className="rounded bg-surface-2 px-1">{window.location.origin}</code>
              {window.location.hostname === 'localhost' && <> and <code className="rounded bg-surface-2 px-1">http://localhost</code> (Google needs both for local testing)</>}.
            </li>
            <li>
              Put the ID in <code className="rounded bg-surface-2 px-1">server/.env</code>:
              <pre className="mt-1.5 overflow-x-auto rounded-xl bg-surface-2 p-3 text-xs">GOOGLE_CLIENT_ID=1234-abc.apps.googleusercontent.com</pre>
            </li>
            <li>Restart <code className="rounded bg-surface-2 px-1">npm run dev</code> and refresh this page.</li>
          </ol>
          <p className="mt-3 text-xs text-faint">You only see this message in development. In production the button stays hidden until it's configured.</p>
          <Button block className="mt-5" onClick={() => setSetupOpen(false)}>
            Got it
          </Button>
        </Sheet>
      </div>
    );
  }

  return (
    <div>
      <div ref={ref} className="flex min-h-11 justify-center" aria-busy={!ready} />
      {divider}
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
