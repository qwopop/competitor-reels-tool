import { useEffect, useId, type ReactNode } from 'react';

// A dialog over the page. Escape and a click on the backdrop close it.
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ground/80 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-3xl bg-surface-2 p-7"
      >
        <h2 id={titleId} className="text-2xl font-semibold tracking-[-0.02em] text-ink">
          {title}
        </h2>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-base text-ink/70">{message}</p>
      <div className="mt-8 flex flex-wrap justify-end gap-3">
        <button type="button" onClick={onCancel} className="btn-ghost">
          Cancel
        </button>
        <button type="button" onClick={onConfirm} className="btn-primary">
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
