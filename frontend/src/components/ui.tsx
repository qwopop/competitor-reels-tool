import { Loader2 } from 'lucide-react';

export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} size={16} />;
}

export function FullPageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-24 text-sm text-ink/60">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="max-w-md py-16">
      <h2 className="text-3xl font-semibold leading-tight tracking-[-0.02em] text-ink">
        {title}
      </h2>
      <p className="mt-3 text-base text-ink/70">{description}</p>
      {action ? <div className="mt-8">{action}</div> : null}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return <div className="bg-danger/10 px-4 py-3 text-sm text-danger">{message}</div>;
}
