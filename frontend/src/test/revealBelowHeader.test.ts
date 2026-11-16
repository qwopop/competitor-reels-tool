import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { revealBelowHeader } from '@/utils/revealBelowHeader';

// Issue #99 (QA): the ?write=ai scroll must end below the sticky header even when the layout
// above changes after the first scroll (web fonts swapping in, the header's nav wrapping).

let headerHeight = 159;
let targetTop = 600;
let resize: (() => void) | null = null;

class FakeResizeObserver {
  constructor(callback: () => void) {
    resize = callback;
  }
  observe() {}
  disconnect() {}
}

function setup() {
  const header = document.createElement('header');
  header.setAttribute('data-app-header', '');
  header.getBoundingClientRect = () => ({ height: headerHeight }) as DOMRect;
  const target = document.createElement('div');
  target.getBoundingClientRect = () => ({ top: targetTop }) as DOMRect;
  const scroll = vi.fn(() => {
    targetTop = parseFloat(target.style.scrollMarginTop);
  });
  target.scrollIntoView = scroll;
  document.body.append(header, target);
  return { header, target, scroll };
}

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
const settle = async () => {
  await Promise.resolve();
  await frame();
  await frame();
};

beforeEach(() => {
  headerHeight = 159;
  targetTop = 600;
  resize = null;
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('revealBelowHeader', () => {
  it('scrolls with a margin of the header height measured at scroll time plus 16 px', async () => {
    const { target, scroll } = setup();
    const stop = revealBelowHeader(target, { smooth: true });
    await settle();
    expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
    expect(target.style.scrollMarginTop).toBe('175px');
    stop();
  });

  it('uses an instant scroll when smooth is off (reduced motion)', async () => {
    const { target, scroll } = setup();
    const stop = revealBelowHeader(target, { smooth: false });
    await settle();
    expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
    stop();
  });

  it('re-aligns when the layout above moves the block after the scroll', async () => {
    const { target, scroll } = setup();
    const stop = revealBelowHeader(target, { smooth: true });
    await settle();
    expect(scroll).toHaveBeenCalledTimes(1);
    // A font swap re-wraps the text above: the block moves up 79 px, behind the header.
    targetTop -= 79;
    resize?.();
    await settle();
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(targetTop).toBe(175);
    stop();
  });

  it('follows a header that grows after the scroll', async () => {
    const { target, scroll } = setup();
    headerHeight = 71;
    const stop = revealBelowHeader(target, { smooth: true });
    await settle();
    expect(target.style.scrollMarginTop).toBe('87px');
    headerHeight = 159;
    resize?.();
    await settle();
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(target.style.scrollMarginTop).toBe('175px');
    stop();
  });

  it('does nothing more once the person scrolls or clicks', async () => {
    const { target, scroll } = setup();
    revealBelowHeader(target, { smooth: true });
    await settle();
    window.dispatchEvent(new Event('wheel'));
    targetTop -= 79;
    resize?.();
    await settle();
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it('stops after the settle time', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { target, scroll } = setup();
    revealBelowHeader(target, { smooth: true, settleMs: 100 });
    await vi.advanceTimersByTimeAsync(0);
    await settle();
    expect(scroll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(150);
    targetTop -= 79;
    resize?.();
    await settle();
    expect(scroll).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
