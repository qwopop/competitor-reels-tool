import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { USING_MOCK } from '@/services';

const TITLES: [prefix: string, title: string][] = [
  ['/content-plan', 'Content plan'],
  ['/competitors', 'Competitors'],
  ['/reels', 'Reels'],
  ['/remixes', 'Remixes'],
  ['/remix/', 'Edit remix'],
];

export function pageTitle(pathname: string): string {
  if (pathname === '/') return 'Dashboard';
  return TITLES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? 'ReelRemix';
}

export function Layout() {
  const { pathname } = useLocation();
  useEffect(() => {
    const title = pageTitle(pathname);
    document.title = title === 'ReelRemix' ? title : `${title} · ReelRemix`;
  }, [pathname]);

  return (
    <div className="flex min-h-dvh flex-col bg-ground">
      <Header />
      <main className="flex-1 overflow-x-clip">
        <div className="mx-auto max-w-6xl px-6 py-12 sm:px-10 sm:py-16">
          <Outlet />
        </div>
      </main>
      <footer className="px-6 pb-8 text-center text-xs text-ink/40">
        {USING_MOCK ? 'Demo: saved in this browser only.' : 'Saved to the database.'}
      </footer>
    </div>
  );
}
