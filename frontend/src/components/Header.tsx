import { Link, NavLink, useLocation } from 'react-router-dom';
import { PILL_LABEL_TRANSITION, useSlidingPill } from '@/components/SlidingPill';
import { Film } from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/competitors', label: 'Competitors', end: false },
  { to: '/videos', label: 'Videos', end: false },
  { to: '/remixes', label: 'Remixes', end: false },
  { to: '/content-plan', label: 'Content Plan', end: false },
  { to: '/go-to-videos', label: 'Go to videos', end: false },
];

// Sticky top bar: wordmark, page links, and one action.
export function Header() {
  const { pathname } = useLocation();
  // NavLink marks the current page with aria-current="page"; the pill follows it.
  const { containerRef, pill } = useSlidingPill<HTMLElement>('[aria-current="page"]', pathname);
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-ground/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-4 sm:px-10">
        <Link to="/" className="flex items-center gap-2.5 text-lg font-semibold tracking-tight text-ink">
          <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-xl bg-brand text-ground">
            <Film size={16} strokeWidth={2.6} />
          </span>
          ClipRemix
        </Link>

        <nav
          ref={containerRef}
          aria-label="Main"
          className="relative order-last flex w-full flex-wrap gap-1 md:order-none md:w-auto"
        >
          {pill}
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  'whitespace-nowrap rounded-full px-4 py-2 text-sm',
                  PILL_LABEL_TRANSITION,
                  isActive ? 'text-ink' : 'text-ink/60 hover:text-ink',
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
