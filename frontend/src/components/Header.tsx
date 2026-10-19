import { Link, NavLink } from 'react-router-dom';
import { Film } from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/competitors', label: 'Competitors', end: false },
  { to: '/reels', label: 'Reels', end: false },
  { to: '/remixes', label: 'Remixes', end: false },
  { to: '/content-plan', label: 'Content Plan', end: false },
];

// Sticky top bar: wordmark, page links, and one action.
export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-ground/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-4 sm:px-10">
        <Link to="/" className="flex items-center gap-2.5 text-lg font-semibold tracking-tight text-ink">
          <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-xl bg-brand text-ground">
            <Film size={16} strokeWidth={2.6} />
          </span>
          ReelRemix
        </Link>

        <nav aria-label="Main" className="order-last flex w-full gap-1 overflow-x-auto md:order-none md:w-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  'whitespace-nowrap rounded-full px-4 py-2 text-sm transition-colors duration-200',
                  isActive ? 'bg-white/10 text-ink' : 'text-ink/60 hover:text-ink',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <Link to="/competitors" className="btn-primary px-5 py-2">
          Add competitor
        </Link>
      </div>
    </header>
  );
}
