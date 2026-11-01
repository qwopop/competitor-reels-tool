import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ViewToggle } from '@/components/ViewToggle';
import { Header } from '@/components/Header';

// jsdom has no layout, so give each element a position from its label.
const POSITIONS: Record<string, { left: number; width: number }> = {
  Board: { left: 4, width: 70 },
  Table: { left: 74, width: 64 },
  Dashboard: { left: 0, width: 100 },
  Videos: { left: 210, width: 80 },
};
const originals = new Map<string, PropertyDescriptor | undefined>();

beforeAll(() => {
  const read = (el: HTMLElement, key: 'left' | 'width') => POSITIONS[el.textContent?.trim() ?? '']?.[key] ?? 0;
  const props: Record<string, (el: HTMLElement) => number> = {
    offsetLeft: (el) => read(el, 'left'),
    offsetWidth: (el) => read(el, 'width'),
    offsetTop: () => 4,
    offsetHeight: () => 32,
  };
  for (const [name, get] of Object.entries(props)) {
    originals.set(name, Object.getOwnPropertyDescriptor(HTMLElement.prototype, name));
    Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get() { return get(this); } });
  }
});

afterAll(() => {
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor);
  }
});

function Toggle() {
  const [view, setView] = useState<'board' | 'table'>('board');
  return (
    <ViewToggle
      label="Plan view"
      value={view}
      onChange={setView}
      options={[
        { value: 'board', label: 'Board' },
        { value: 'table', label: 'Table' },
      ]}
    />
  );
}

describe('sliding pill', () => {
  it('starts on the active option without animating', () => {
    render(<Toggle />);
    const pill = screen.getByTestId('sliding-pill');
    expect(pill.style.left).toBe('4px');
    expect(pill.style.width).toBe('70px');
    expect(pill.style.transitionProperty).toBe('opacity');
  });

  it('slides its left and width to the clicked option with the easing curve', async () => {
    const user = userEvent.setup();
    render(<Toggle />);
    await user.click(screen.getByRole('button', { name: 'Table' }));

    const pill = screen.getByTestId('sliding-pill');
    expect(pill.style.left).toBe('74px');
    expect(pill.style.width).toBe('64px');
    expect(pill.style.transitionProperty).toContain('left');
    expect(pill.style.transitionProperty).toContain('width');
    expect(pill.style.transitionDuration).toBe('400ms');
    expect(pill.style.transitionTimingFunction).toBe('cubic-bezier(0.65, 0, 0.35, 1)');
    expect(screen.getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('labels crossfade on the same curve and timing', () => {
    render(<Toggle />);
    const board = screen.getByRole('button', { name: 'Board' });
    expect(board.className).toContain('transition-colors');
    expect(board.className).toContain('duration-[400ms]');
    expect(board.className).toContain('ease-[cubic-bezier(0.65,0,0.35,1)]');
    expect(board.className).toContain('text-ink');
    expect(screen.getByRole('button', { name: 'Table' }).className).toContain('text-ink/60');
  });

  it('follows the current page in the main navigation', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <Header />
      </MemoryRouter>
    );
    const pill = screen.getByTestId('sliding-pill');
    expect(pill.style.left).toBe('0px');
    expect(pill.style.width).toBe('100px');

    await user.click(screen.getByRole('link', { name: 'Videos' }));
    expect(pill.style.left).toBe('210px');
    expect(pill.style.width).toBe('80px');
    expect(pill.style.opacity).toBe('1');
  });

  it('hides when no page in the navigation is current', () => {
    render(
      <MemoryRouter initialEntries={['/remix/remix_1']}>
        <Header />
      </MemoryRouter>
    );
    expect(screen.getByTestId('sliding-pill').style.opacity).toBe('0');
  });
});
