import { AlertCircle, LoaderCircle, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function LoadingScreen() {
  return (
    <div className="loading-screen" role="status">
      <LoaderCircle className="animate-spin" size={26} />
      <span>Opening your workspace…</span>
    </div>
  );
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={24} />
      <h2>We couldn’t load this view</h2>
      <p>{message}</p>
      {retry && (
        <Button variant="secondary" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}
export function EmptyState({
  icon: Icon,
  title,
  description,
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div className={`empty-state ${compact ? 'empty-compact' : ''}`}>
      <span className="empty-icon">
        <Icon size={21} strokeWidth={1.5} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
