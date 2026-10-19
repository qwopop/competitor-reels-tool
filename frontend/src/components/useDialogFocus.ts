import { useEffect, useRef, useState, type RefObject } from 'react';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Keyboard behaviour shared by dialogs and panels:
//  - focus moves into the container when it opens (unless something inside already has it)
//  - Escape calls onClose
//  - with `trap`, Tab and Shift+Tab cycle inside the container
//  - when it closes, focus returns to the element that had it before it opened
export function useDialogFocus(
  containerRef: RefObject<HTMLElement>,
  onClose: () => void,
  { trap = true }: { trap?: boolean } = {}
) {
  // Keep the latest onClose without re-running the effect (which would steal focus back).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Captured while rendering, before any child with autoFocus takes focus, so we
  // remember the control that opened the dialog and not a field inside it.
  const [opener] = useState(() => document.activeElement as HTMLElement | null);

  useEffect(() => {
    const container = containerRef.current;
    const items = () =>
      container ? Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];

    if (container && !container.contains(document.activeElement)) {
      (items()[0] ?? container).focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (!trap || e.key !== 'Tab' || !container) return;
      const list = items();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (!container.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [containerRef, trap, opener]);
}
