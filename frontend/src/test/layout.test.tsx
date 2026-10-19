import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Layout, pageTitle } from '@/components/Layout';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="*" element={<p>page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('page titles', () => {
  it.each([
    ['/', 'Dashboard · ReelRemix'],
    ['/competitors', 'Competitors · ReelRemix'],
    ['/reels', 'Reels · ReelRemix'],
    ['/remixes', 'Remixes · ReelRemix'],
    ['/remix/remix_1', 'Edit remix · ReelRemix'],
    ['/content-plan', 'Content plan · ReelRemix'],
  ])('%s sets the tab title to %s', (path, title) => {
    renderAt(path);
    expect(document.title).toBe(title);
  });

  it('falls back to the app name for unknown paths', () => {
    expect(pageTitle('/nowhere')).toBe('ReelRemix');
  });
});

describe('index.html', () => {
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

  it('links an icon file that exists', () => {
    const icon = html.match(/rel="icon"[^>]*href="([^"]+)"/)?.[1];
    expect(icon).toBeTruthy();
    expect(existsSync(resolve(process.cwd(), 'public', icon!.replace(/^\//, '')))).toBe(true);
  });

  it('does not point at another product', () => {
    expect(html).not.toMatch(/bolt\.new/i);
  });

  it('has a description and a social title', () => {
    expect(html).toMatch(/<meta\s+name="description"/);
    expect(html).toMatch(/property="og:title"/);
  });
});
