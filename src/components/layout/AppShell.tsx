import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/appStore';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import type { UserRole } from '../../types';
import { tradesDB } from '../../lib/storage/db';
import { evaluateMilestones } from '../../lib/milestones';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  roles: UserRole[];
  group: 'workspace' | 'directory' | 'settings';
}

const ICONS = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  trades: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M3 6h18M3 12h18M3 18h12" strokeLinecap="round" />
    </svg>
  ),
  clients: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M3 21v-1a6 6 0 0112 0v1" strokeLinecap="round" />
      <circle cx="9" cy="7" r="4" />
      <path d="M16 11a4 4 0 005-3.87" strokeLinecap="round" />
      <path d="M22 21v-1a4 4 0 00-3-3.87" strokeLinecap="round" />
    </svg>
  ),
  contacts: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M5 4h12a2 2 0 012 2v12a2 2 0 01-2 2H5z" strokeLinejoin="round" />
      <path d="M2 8h3M2 12h3M2 16h3" strokeLinecap="round" />
      <circle cx="11" cy="11" r="2" />
      <path d="M7.5 16a4 4 0 017 0" strokeLinecap="round" />
    </svg>
  ),
  entities: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M3 21h18" strokeLinecap="round" />
      <path d="M5 21V7l7-4 7 4v14" strokeLinejoin="round" />
      <path d="M9 21v-6h6v6" />
    </svg>
  ),
  bank: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M3 21h18" strokeLinecap="round" />
      <path d="M3 9l9-6 9 6" strokeLinejoin="round" />
      <path d="M5 9v9M9 9v9M15 9v9M19 9v9" strokeLinecap="round" />
    </svg>
  ),
  partner: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M12 2L4 6v6c0 5 4 9 8 10 4-1 8-5 8-10V6z" strokeLinejoin="round" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a8 8 0 0116 0v1" strokeLinecap="round" />
    </svg>
  ),
  tax: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinejoin="round" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6M9 17h6" strokeLinecap="round" />
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" strokeLinecap="round" />
      <path d="M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  key: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <circle cx="8" cy="15" r="4" />
      <path d="M10.85 12.15L19 4" strokeLinecap="round" />
      <path d="M18 5l3 3M15 8l3 3" strokeLinecap="round" />
    </svg>
  ),
  menu: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" />
    </svg>
  ),
};

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: ICONS.dashboard, roles: ['super_admin', 'internal'], group: 'workspace' },
  { to: '/trades', label: 'Trades', icon: ICONS.trades, roles: ['super_admin', 'internal'], group: 'workspace' },
  { to: '/clients', label: 'Clients', icon: ICONS.clients, roles: ['super_admin', 'internal'], group: 'directory' },
  { to: '/contacts', label: 'Contacts', icon: ICONS.contacts, roles: ['super_admin'], group: 'directory' },
  { to: '/entities', label: 'Entities & Banking', icon: ICONS.bank, roles: ['super_admin'], group: 'settings' },
  { to: '/users', label: 'Users', icon: ICONS.users, roles: ['super_admin'], group: 'settings' },
  { to: '/tax-export', label: 'Tax Readiness', icon: ICONS.tax, roles: ['super_admin'], group: 'settings' },
];

const GROUP_LABELS: Record<NavItem['group'], string> = {
  workspace: 'Workspace',
  directory: 'Directory',
  settings: 'Settings',
};

export function AppShell() {
  const { user, logout } = useAppStore();
  const navigate = useNavigate();
  const [overdueCount, setOverdueCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    evaluateMilestones();
    const overdue = tradesDB
      .list()
      .filter((t) => t.trade_status === 'overdue').length;
    setOverdueCount(overdue);
  }, [user, navigate]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [navigate]);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  const navBadges = useMemo(
    (): Record<string, { count: number; tone: 'danger' | 'warning' }> => ({
      '/': overdueCount > 0
        ? { count: overdueCount, tone: 'danger' as const }
        : { count: 0, tone: 'warning' as const },
    }),
    [overdueCount],
  );

  if (!user) return null;

  const isPartner = user.role === 'partner';
  const items = NAV_ITEMS.filter((i) => i.roles.includes(user.role));

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const groupedItems = items.reduce<Record<NavItem['group'], NavItem[]>>(
    (acc, it) => {
      (acc[it.group] ??= []).push(it);
      return acc;
    },
    {} as Record<NavItem['group'], NavItem[]>,
  );

  const sidebarContent = (
    <>
      {/* Brand header */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-ink-900 to-ink-700 text-white font-bold shadow-soft ring-1 ring-ink-900/10">
          T
          <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full bg-success-500 ring-2 ring-white" />
        </div>
        <div className="leading-tight">
          <div className="text-[14px] font-semibold text-ink-900 tracking-tight">
            TradeMirror OS
          </div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-ink-400">
            Chipa Farm
          </div>
        </div>
        {/* Close button — only visible on mobile */}
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="ml-auto rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 md:hidden"
          aria-label="Close menu"
        >
          {ICONS.close}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        {isPartner ? (
          <NavLink
            to="/partner"
            className={({ isActive }) =>
              clsx(
                'group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-ink-900 text-white shadow-soft'
                  : 'text-ink-700 hover:bg-ink-100/70 hover:text-ink-900',
              )
            }
          >
            {ICONS.partner}
            Partner Dashboard
          </NavLink>
        ) : (
          <div className="space-y-5">
            {(['workspace', 'directory', 'settings'] as const).map(
              (groupKey) => {
                const groupItems = groupedItems[groupKey];
                if (!groupItems || groupItems.length === 0) return null;
                return (
                  <div key={groupKey}>
                    <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
                      {GROUP_LABELS[groupKey]}
                    </div>
                    <ul className="space-y-0.5">
                      {groupItems.map((item) => {
                        const badge = navBadges[item.to];
                        return (
                          <li key={item.to}>
                            <NavLink
                              to={item.to}
                              end={item.to === '/'}
                              className={({ isActive }) =>
                                clsx(
                                  'group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150',
                                  isActive
                                    ? 'bg-ink-900 text-white shadow-soft'
                                    : 'text-ink-600 hover:bg-ink-100/70 hover:text-ink-900',
                                )
                              }
                            >
                              {({ isActive }) => (
                                <>
                                  <span
                                    className={clsx(
                                      'transition-colors',
                                      isActive
                                        ? 'text-white'
                                        : 'text-ink-400 group-hover:text-ink-700',
                                    )}
                                  >
                                    {item.icon}
                                  </span>
                                  <span className="flex-1 truncate">
                                    {item.label}
                                  </span>
                                  {badge && badge.count > 0 && (
                                    <span
                                      className={clsx(
                                        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold ring-1 ring-white/20',
                                        badge.tone === 'danger'
                                          ? 'bg-danger-500 text-white shadow-[0_0_0_3px_rgba(239,68,68,0.18)]'
                                          : 'bg-warning-500 text-white',
                                      )}
                                      title={`${badge.count} overdue`}
                                    >
                                      {badge.count}
                                    </span>
                                  )}
                                </>
                              )}
                            </NavLink>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              },
            )}
          </div>
        )}
      </nav>

      {/* Account footer */}
      <div className="border-t border-ink-100 p-3">
        <div className="group rounded-xl border border-ink-100 bg-gradient-to-br from-white to-ink-50/40 p-3 mb-2 shadow-soft">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-900 text-white text-xs font-bold">
              {user.full_name
                .split(' ')
                .map((p) => p[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-ink-900 truncate">
                {user.full_name}
              </div>
              <div className="text-[11px] text-ink-500 truncate">
                {user.email}
              </div>
            </div>
          </div>
          <div className="mt-2.5 flex items-center gap-1.5">
            <span
              className={clsx(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                user.role === 'super_admin'
                  ? 'bg-ink-900 text-white'
                  : user.role === 'partner'
                    ? 'bg-warning-100 text-warning-700'
                    : 'bg-brand-50 text-brand-700',
              )}
            >
              {user.role.replace('_', ' ')}
            </span>
          </div>
        </div>
        <NavLink
          to="/account"
          className={({ isActive }) =>
            clsx(
              'btn-ghost w-full justify-start text-[13px]',
              isActive && 'bg-ink-100/70 text-ink-900',
            )
          }
        >
          {ICONS.key}
          Account & password
        </NavLink>
        <button
          type="button"
          onClick={handleLogout}
          className="btn-ghost w-full justify-start text-[13px]"
        >
          {ICONS.logout}
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen">
      {/* ── Desktop sidebar ── always visible on md+ ── */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-white/80 backdrop-blur-sm border-r border-ink-200/70">
        {sidebarContent}
      </aside>

      {/* ── Mobile sidebar overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          aria-hidden
          onClick={() => setSidebarOpen(false)}
          style={{ background: 'rgba(15,23,42,0.45)' }}
        />
      )}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-white shadow-elevated transition-transform duration-300 md:hidden',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {sidebarContent}
      </aside>

      {/* ── Main content area ── */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 border-b border-ink-200/60 bg-white/80 backdrop-blur-sm px-4 py-3 md:hidden sticky top-0 z-30">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-1.5 text-ink-600 hover:bg-ink-100"
            aria-label="Open menu"
          >
            {ICONS.menu}
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink-900 text-white text-xs font-bold">
              T
            </div>
            <span className="text-sm font-semibold text-ink-900">TradeMirror OS</span>
          </div>
        </div>

        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
