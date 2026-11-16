// Scrolls `target` to just below the sticky app header ([data-app-header]) and keeps it there
// while the page settles (issue #99).
//
// Where the block ends depends on layout that can still change after the first scroll: the
// header's height (its nav wraps on phones) and, above all, the web fonts. Until Inter arrives,
// text renders in a wider fallback font; when it swaps in, the title and paragraphs above the
// block re-wrap shorter and the block moves up behind the header. So this:
//   1. waits for the fonts that are loading (at most `fontWaitMs`) and a frame, then scrolls with
//      a scroll margin of the header's height measured at that moment plus `gap`;
//   2. re-aligns whenever the page or the header changes size, a font finishes loading, or a
//      scroll ends off target, for `settleMs`;
//   3. stops as soon as the person scrolls, taps, clicks or types, so it never fights them.
// Returns a function that stops it (call it on unmount).

const USER_INPUT = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;

export function revealBelowHeader(
  target: HTMLElement,
  { smooth, gap = 16, settleMs = 10000, fontWaitMs = 1000 }: { smooth: boolean; gap?: number; settleMs?: number; fontWaitMs?: number }
): () => void {
  let stopped = false;
  const cleanups: (() => void)[] = [];
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cleanups.forEach((fn) => fn());
  };

  const offset = () => {
    const header = document.querySelector<HTMLElement>('[data-app-header]');
    return (header ? Math.ceil(header.getBoundingClientRect().height) : 0) + gap;
  };
  const align = (behavior: ScrollBehavior) => {
    target.style.scrollMarginTop = `${offset()}px`;
    target.scrollIntoView?.({ block: 'start', behavior });
  };
  const offTarget = () => Math.abs(target.getBoundingClientRect().top - offset()) > 1;

  let frame = 0;
  const realign = (behavior: ScrollBehavior) => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (!stopped && offTarget()) align(behavior);
    });
  };
  cleanups.push(() => cancelAnimationFrame(frame));

  for (const type of USER_INPUT) {
    window.addEventListener(type, stop, { capture: true, passive: true });
    cleanups.push(() => window.removeEventListener(type, stop, { capture: true }));
  }

  const timer = window.setTimeout(stop, settleMs);
  cleanups.push(() => window.clearTimeout(timer));

  const behavior: ScrollBehavior = smooth ? 'smooth' : 'auto';
  const fontsReady = document.fonts?.ready ?? Promise.resolve();
  const fontWait = new Promise((resolve) => window.setTimeout(resolve, fontWaitMs));
  Promise.race([fontsReady, fontWait]).then(() => {
    if (stopped) return;
    frame = requestAnimationFrame(() => {
      if (stopped) return;
      align(behavior);
      watch();
    });
  });

  function watch() {
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => realign(behavior));
      observer.observe(document.body);
      const header = document.querySelector('[data-app-header]');
      if (header) observer.observe(header);
      cleanups.push(() => observer.disconnect());
    }
    const onFont = () => realign(behavior);
    document.fonts?.addEventListener?.('loadingdone', onFont);
    cleanups.push(() => document.fonts?.removeEventListener?.('loadingdone', onFont));
    // A smooth scroll that ended off target (content moved while it ran) is corrected at once.
    const onScrollEnd = () => realign('auto');
    window.addEventListener('scrollend', onScrollEnd);
    cleanups.push(() => window.removeEventListener('scrollend', onScrollEnd));
  }

  return stop;
}
