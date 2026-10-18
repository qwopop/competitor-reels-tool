import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function Layout() {
  return (
    <div className="flex h-dvh w-screen overflow-hidden bg-ground">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 py-10 sm:px-10 sm:py-14">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
