import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import clsx from 'clsx';
import {
  LayoutDashboard,
  ClipboardList,
  ListChecks,
  AlertTriangle,
  Building2,
  BarChart3,
  Users,
  Menu,
  X,
  Sun,
  Moon,
  LogOut,
} from 'lucide-react';
import { useAuth } from './AuthProvider';
import { IconButton } from '../ui/IconButton';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  permissions?: string[];
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Operations',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/jobs', label: 'Job Cards', icon: ClipboardList },
      { to: '/my-jobs', label: 'My Jobs', icon: ListChecks },
      { to: '/attention', label: 'Process Coordinator', icon: AlertTriangle },
    ],
  },
  {
    label: 'Insights',
    items: [{ to: '/reports', label: 'Reports', icon: BarChart3 }],
  },
  {
    label: 'Admin',
    items: [
      { to: '/masters', label: 'Masters', icon: Building2, permissions: ['master.view'] },
      { to: '/users', label: 'Users', icon: Users, permissions: ['user.view'] },
    ],
  },
];

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('sd_theme') as 'light' | 'dark') ?? 'light');
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('sd_theme', theme);
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')) };
}

export function AppShell() {
  const { user, hasPermission, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleGroups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((item) => !item.permissions || hasPermission(...(item.permissions as never[]))),
  })).filter((g) => g.items.length > 0);

  const sidebarContent = (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
      {visibleGroups.map((group) => (
        <div key={group.label}>
          <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-content-muted dark:text-content-dark-muted">{group.label}</p>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  clsx(
                    'flex h-[34px] items-center gap-2 rounded-md px-2.5 text-[15px] font-medium transition-colors duration-fast',
                    // text-primary-strong (not text-primary-hover): an axe-core accessibility
                    // smoke test measured text-primary-hover at 3.35:1 against this background,
                    // short of WCAG AA's 4.5:1 for 15px text — see tailwind.config.ts.
                    isActive
                      ? 'bg-primary-soft text-primary-strong dark:bg-primary/15 dark:text-primary-light'
                      : 'text-content hover:bg-surface-muted dark:text-content-dark dark:hover:bg-surface-dark-muted',
                  )
                }
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface dark:border-border-dark dark:bg-surface-dark lg:flex">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4 dark:border-border-dark">
          {/* bg-primary-strong, not bg-primary: white-on-#f97316 measured 2.8:1 (axe-core), short
              of the 4.5:1 this bold 14px text needs. */}
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-strong text-sm font-bold text-white">SD</div>
          <div>
            <p className="text-sm font-bold leading-tight text-content dark:text-content-dark">ServiceDesk</p>
            <p className="text-[11px] leading-tight text-content-muted dark:text-content-dark-muted">Service Engineering</p>
          </div>
        </div>
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="relative flex w-72 flex-col border-r border-border bg-surface dark:border-border-dark dark:bg-surface-dark">
            <div className="flex h-14 items-center justify-between border-b border-border px-4 dark:border-border-dark">
              <p className="text-sm font-bold text-content dark:text-content-dark">ServiceDesk</p>
              <IconButton label="Close menu" size="sm" onClick={() => setMobileOpen(false)}>
                <X className="h-4 w-4" />
              </IconButton>
            </div>
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-4 dark:border-border-dark dark:bg-surface-dark">
          <IconButton label="Open menu" size="sm" className="lg:hidden" onClick={() => setMobileOpen(true)}>
            <Menu className="h-4 w-4" />
          </IconButton>
          <div className="flex-1" />
          <IconButton label="Toggle theme" size="sm" onClick={toggle}>
            {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </IconButton>
          <div className="flex items-center gap-2 pl-2">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight text-content dark:text-content-dark">{user?.name}</p>
              <p className="text-xs leading-tight text-content-muted dark:text-content-dark-muted">{user?.roles.join(', ')}</p>
            </div>
            <IconButton label="Log out" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4" />
            </IconButton>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-bg p-4 dark:bg-bg-dark sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
