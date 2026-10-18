import { NavLink } from 'react-router-dom';
import { Film, LayoutDashboard, Users, Clapperboard } from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/competitors', label: 'Competitors', icon: Users, end: false },
];

export function Sidebar() {
  return (
    <aside className="flex h-full w-64 flex-col border-r border-white/10 bg-ink-900/80 backdrop-blur-xl">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 text-ink-950 shadow-glow">
          <Clapperboard size={18} strokeWidth={2.4} />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-white">ReelRemix</p>
          <p className="text-[11px] text-gray-500">Vibe-coding intel</p>
        </div>
      </div>

      <nav className="mt-2 flex-1 space-y-1 px-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-accent-500/15 text-accent-200 shadow-[inset_0_0_0_1px_rgba(63,199,135,0.25)]'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white',
                ].join(' ')
              }
            >
              <Icon size={17} className="shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="px-5 py-4">
        <div className="rounded-xl border border-white/10 bg-ink-800/60 p-3">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Film size={14} className="text-accent-400" />
            <span>Mock backend active</span>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-gray-500">
            Data is stored locally in your browser. Swap the service layer to go
            live.
          </p>
        </div>
      </div>
    </aside>
  );
}
