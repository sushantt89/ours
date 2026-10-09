import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errorMessage, get, post } from '@/lib/api';
import type { Session } from '@/lib/types';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/ui';
import { Button, FullPageLoader } from '@/components/ui';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { rememberInvite } from './Welcome';

/** Landing page for an invite link. Works whether or not the visitor has an account yet. */
export default function Join() {
  const { code = '' } = useParams();
  const status = useAuth((s) => s.status);
  const couple = useAuth((s) => s.couple);
  const setSession = useAuth((s) => s.setSession);
  const navigate = useNavigate();
  const [invite, setInvite] = useState<{ inviterName: string; coupleName: string } | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'invalid'>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    get<{ inviterName: string; coupleName: string }>(`/couple/invite/${encodeURIComponent(code)}`)
      .then((data) => {
        setInvite(data);
        setState('ready');
      })
      .catch(() => setState('invalid'));
  }, [code]);

  if (status === 'loading' || state === 'loading') return <FullPageLoader />;

  if (state === 'invalid') {
    return (
      <AuthLayout title="This invite isn't active" subtitle="It may have already been used, or your partner created a new code. Ask them to send it again.">
        <Link to="/">
          <Button size="lg" block>
            Go to Ours
          </Button>
        </Link>
      </AuthLayout>
    );
  }

  if (status === 'authed' && couple) {
    return (
      <AuthLayout title="You're already in a space" subtitle="An account can belong to one couple at a time. To accept this invite, leave your current space first in Settings.">
        <Link to="/">
          <Button size="lg" block>
            Back to our space
          </Button>
        </Link>
      </AuthLayout>
    );
  }

  async function accept() {
    setBusy(true);
    try {
      setSession(await post<Session>('/couple/join', { code }));
      toast.success("You're in. Welcome home.", '🥂');
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const carry = () => rememberInvite(code);

  return (
    <AuthLayout
      title={`${invite!.inviterName} invited you`}
      subtitle={`Join ${invite!.coupleName ? `"${invite!.coupleName}"` : 'your private space'} on Ours: a home for just the two of you.`}
    >
      {status === 'authed' ? (
        <Button size="lg" block loading={busy} onClick={accept}>
          Join {invite!.inviterName}
        </Button>
      ) : (
        <div className="space-y-3">
          <Link to="/register" onClick={carry}>
            <Button size="lg" block>
              Create my account
            </Button>
          </Link>
          <Link to="/login" onClick={carry} className="block">
            <Button size="lg" variant="outline" block>
              I already have an account
            </Button>
          </Link>
        </div>
      )}
    </AuthLayout>
  );
}
