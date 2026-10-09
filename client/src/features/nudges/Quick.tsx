import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePartner } from '@/store/auth';
import { Button } from '@/components/ui';
import { NudgeButton, useSendNudge } from './Nudges';

const QUICK = [
  { emoji: '❤️', text: 'Send love', send: 'Love you' },
  { emoji: '😘', text: 'Send kiss', send: 'Kiss' },
  { emoji: '🫂', text: 'Send hug', send: 'Hug' },
];

/**
 * The "quick nudge" screen that app-icon shortcuts open. Launching the
 * "Send love" shortcut sends it immediately.
 */
export default function Quick() {
  const partner = usePartner();
  const [params, setParams] = useSearchParams();
  const { send, sending, sent } = useSendNudge();
  const fired = useRef(false);

  useEffect(() => {
    if (params.get('send') === 'love' && partner && !fired.current) {
      fired.current = true;
      void send('🫶', 'Love you');
      setParams({}, { replace: true });
    }
  }, [params, partner, send, setParams]);

  return (
    <div className="mx-auto flex min-h-[80dvh] max-w-sm flex-col items-center justify-center px-6 pb-24 text-center">
      <span className="animate-heartbeat text-6xl" aria-hidden>
        💗
      </span>
      <h1 className="mt-4 text-3xl">{partner ? `Thinking of ${partner.name}?` : 'Quick nudge'}</h1>
      <p className="mt-1 text-muted">One tap and they'll know.</p>
      <div className="mt-8 grid w-full grid-cols-3 gap-3">
        {QUICK.map((q) => (
          <NudgeButton key={q.text} emoji={q.emoji} text={q.text} busy={sending === q.send} justSent={sent?.text === q.send ? sent.key : null} onSend={() => send(q.emoji, q.send)} />
        ))}
      </div>
      <Link to="/nudges" className="mt-8">
        <Button variant="soft">All nudges</Button>
      </Link>
    </div>
  );
}
