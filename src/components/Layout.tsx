import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function Layout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-ink-950">
      <Sidebar />
      <main className="relative flex-1 overflow-y-auto">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_70%_0%,rgba(51,102,255,0.10),transparent_70%)]" />
        <div className="relative mx-auto max-w-6xl px-6 py-8 sm:px-10 sm:py-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
