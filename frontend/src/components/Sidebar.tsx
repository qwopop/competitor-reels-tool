import { NavLink } from 'react-router-dom';
import { USING_MOCK } from '@/services';

const navItems = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/competitors', label: 'Competitors', end: false },
  { to: '/reels', label: 'Reels', end: false },
  { to: '/remixes', label: 'Remixes', end: false },
  { to: '/content-plan', label: 'Content Plan', end: false },
];

export function Sidebar() {
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col bg-surface">
      <div className="px-6 pb-12 pt-8">
        <p className="text-lg font-semibold tracking-tight text-ink">ReelRemix</p>
      </div>

      <nav className="flex flex-col gap-1 px-3">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              [
                'relative px-3 py-2.5 text-[15px] transition-colors duration-200',
                isActive ? 'bg-surface-3 text-ink' : 'text-ink/60 hover:text-ink',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span aria-hidden="true" className="absolute left-0 top-0 h-full w-[3px] bg-accent" />}
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <p className="mt-auto px-6 py-6 text-xs leading-relaxed text-ink/50">
        {USING_MOCK ? 'Demo: saved in this browser only.' : 'Saved to the database.'}
      </p>
    </aside>
  );
}
