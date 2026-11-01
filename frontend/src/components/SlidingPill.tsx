import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// Timing for the pill's slide. Labels use the same curve and duration
// (see PILL_LABEL_TRANSITION) so the active colour crossfades as the pill arrives.
export const PILL_EASE = 'cubic-bezier(0.65, 0, 0.35, 1)';
export const PILL_DURATION_MS = 400;
export const PILL_LABEL_TRANSITION = 'relative z-10 transition-colors duration-[400ms] ease-[cubic-bezier(0.65,0,0.35,1)]';

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

// One highlighted pill that slides to the active item of a group.
//
// The active item is found inside the container with `activeSelector` (for example
// [aria-pressed="true"] or [aria-current="page"]). Whenever `activeKey` changes, its
// offsetLeft/offsetTop/offsetWidth/offsetHeight are read and the pill animates its
// left, top, width and height to match. Top and height matter when the group wraps
// onto two rows on phones.
//
// The first position, resizes and font loading move the pill instantly, so it never
// slides in from the corner or drifts while the window is resized.
export function useSlidingPill<T extends HTMLElement>(activeSelector: string, activeKey: unknown) {
  const containerRef = useRef<T>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [instant, setInstant] = useState(true);

  const measure = useCallback(
    (withAnimation: boolean) => {
      const target = containerRef.current?.querySelector<HTMLElement>(activeSelector);
      setInstant(!withAnimation);
      setBox(
        target
          ? { left: target.offsetLeft, top: target.offsetTop, width: target.offsetWidth, height: target.offsetHeight }
          : null
      );
    },
    [activeSelector]
  );

  // Slide to the new active item. The first run (mount) is instant.
  const mounted = useRef(false);
  useLayoutEffect(() => {
    measure(mounted.current);
    mounted.current = true;
  }, [activeKey, measure]);

  // Keep the pill on its item when the layout changes, without animating.
  useEffect(() => {
    const onLayoutChange = () => measure(false);
    const container = containerRef.current;
    let observer: ResizeObserver | undefined;
    if (container && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(onLayoutChange);
      observer.observe(container);
    }
    window.addEventListener('resize', onLayoutChange);
    document.fonts?.ready.then(onLayoutChange).catch(() => undefined);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', onLayoutChange);
    };
  }, [measure]);

  const pill = (
    <span
      aria-hidden="true"
      data-testid="sliding-pill"
      className="pointer-events-none absolute rounded-full bg-white/10"
      style={{
        left: box?.left ?? 0,
        top: box?.top ?? 0,
        width: box?.width ?? 0,
        height: box?.height ?? 0,
        opacity: box ? 1 : 0,
        transitionProperty: instant ? 'opacity' : 'left, top, width, height, opacity',
        transitionDuration: `${PILL_DURATION_MS}ms`,
        transitionTimingFunction: PILL_EASE,
      }}
    />
  );

  return { containerRef, pill };
}
