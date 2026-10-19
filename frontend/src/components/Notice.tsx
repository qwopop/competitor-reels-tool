// A one-line status message. Calls onDismiss when the user closes it.
export function Notice({
  message,
  tone = 'success',
  onDismiss,
}: {
  message: string;
  tone?: 'success' | 'info' | 'error';
  onDismiss: () => void;
}) {
  const toneClass = {
    success: 'bg-accent/15 text-ink',
    info: 'bg-surface-2 text-ink',
    error: 'bg-danger/10 text-danger',
  }[tone];
  return (
    <div role="status" className={`flex items-center justify-between gap-4 rounded-xl px-4 py-3 text-sm ${toneClass}`}>
      <span>{message}</span>
      <button type="button" onClick={onDismiss} className="btn-ghost px-2 py-1 text-xs">
        Dismiss
      </button>
    </div>
  );
}
