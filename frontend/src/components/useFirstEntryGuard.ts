import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useNavigationType, type Location } from 'react-router-dom';

// When a page is the first entry of its document (it was opened by a full page
// load: a typed URL, a bookmark, a link from another site), browser Back leaves
// the document. Browsers do not let a page cancel that (the Navigation API's
// `navigate` event fires with cancelable=false), so React Router cannot block it
// and only the generic beforeunload prompt is possible.
//
// This hook puts one entry with the same URL on top of that first entry, so the
// first Back stays inside the app, where useBlocker can ask. When the user
// reaches the entry underneath (Back while clean, or Leave page), the hook goes
// back once more, to the page the user came from. The address bar never
// changes, and one Back press still leaves the page.

const GUARD_KEY = 'firstEntryGuard';

export function isFirstEntryGuard(location: Pick<Location, 'state'>): boolean {
  const state = location.state as Record<string, unknown> | null | undefined;
  return !!state && typeof state === 'object' && state[GUARD_KEY] === true;
}

interface NavigationLike {
  canGoForward: boolean;
  currentEntry: { index: number } | null;
  entries(): { url: string | null }[];
}

// React Router's position in its own history (0 = first entry of this document).
// Undefined under a memory router.
function routerIndex(): number | undefined {
  const state = window.history.state as { idx?: unknown } | null;
  return state && typeof state.idx === 'number' ? state.idx : undefined;
}

function documentNavigationType(): string | undefined {
  const entry = performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined;
  return entry?.type;
}

export function useFirstEntryGuard() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  // True while the hook itself is taking the user off the page, so the page's
  // beforeunload prompt can stay quiet (the user already chose to leave).
  const leaving = useRef(false);
  const checked = useRef(false);
  const wasOnGuard = useRef(isFirstEntryGuard(location));

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    if (routerIndex() !== 0 || isFirstEntryGuard(location)) return;
    // Nothing to go back to: Back is not available, so there is nothing to guard.
    if (window.history.length < 2) return;
    const nav = (window as { navigation?: NavigationLike }).navigation;
    if (nav) {
      if (nav.canGoForward) {
        // Pushing would drop the forward history. If the next entry is the guard
        // from an earlier visit (the user left and came back with Forward), step
        // onto it; otherwise keep the forward history and do nothing.
        const index = nav.currentEntry?.index;
        const next = index === undefined ? undefined : nav.entries()[index + 1];
        if (next?.url === window.location.href) window.history.forward();
        return;
      }
    } else if (documentNavigationType() !== 'navigate') {
      // Without the Navigation API the forward history is only known to be empty
      // right after a fresh load.
      return;
    }
    navigate(
      { pathname: location.pathname, search: location.search, hash: location.hash },
      { state: { [GUARD_KEY]: true }, replace: false }
    );
    // Only on mount: the guard is placed once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onGuard = isFirstEntryGuard(location);
    if (wasOnGuard.current && !onGuard && navigationType === 'POP' && routerIndex() === 0) {
      // Back from the guard: continue to the page before this one.
      leaving.current = true;
      window.history.back();
    }
    wasOnGuard.current = onGuard;
  }, [location, navigationType]);

  useEffect(() => {
    // Restored from the back/forward cache: the page is in use again.
    const onPageShow = () => {
      leaving.current = false;
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  return { leaving };
}
