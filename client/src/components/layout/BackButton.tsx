import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { IconButton } from '@/components/ui';

/** Goes back in history, or to a sensible parent when the page was opened directly. */
export function BackButton({ to = '/more' }: { to?: string }) {
  const navigate = useNavigate();
  return (
    <IconButton
      label="Back"
      className="-ml-2 lg:hidden"
      onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate(to, { replace: true }))}
    >
      <ChevronLeft className="size-6" />
    </IconButton>
  );
}
