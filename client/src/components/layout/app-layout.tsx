import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router';
import {
  ChevronDown,
  ChevronRight,
  Menu,
  PanelLeft,
  LogOut,
  UserRound,
  Settings2,
  ShieldCheck,
  CircleHelp,
} from 'lucide-react';
import { Sidebar } from './sidebar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NavigationSheet } from '@/components/ui/sheet';
import { useAuth, useLogout } from '@/hooks/use-auth';
import { allNavigation } from '@/routes/navigation';
import { initials } from '@/lib/utils';

export function AppLayout() {
  const { data: user } = useAuth();
  const logout = useLogout();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const current = allNavigation.find(
    (item) =>
      item.path === location.pathname ||
      (item.path !== '/' && location.pathname.startsWith(`${item.path}/`)),
  );
  if (!user) return null;
  return (
    <div className={`app-shell ${collapsed ? 'is-collapsed' : ''}`}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <div className="desktop-sidebar">
        <Sidebar
          user={user}
          collapsed={collapsed}
          onCollapse={() => setCollapsed(!collapsed)}
          onLogout={() => logout.mutate()}
          logoutPending={logout.isPending}
        />
      </div>
      <NavigationSheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <Sidebar
          user={user}
          collapsed={false}
          onNavigate={() => setMobileOpen(false)}
          onLogout={() => logout.mutate()}
          logoutPending={logout.isPending}
        />
      </NavigationSheet>
      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <Button
              size="icon"
              variant="ghost"
              className="mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={20} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="desktop-collapse"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onClick={() => setCollapsed(!collapsed)}
            >
              <PanelLeft size={18} />
            </Button>
            <span className="topbar-divider" />
            <span className="breadcrumb-workspace">Workspace</span>
            <ChevronRight size={13} className="muted" />
            <span className="breadcrumb-current">{current?.title ?? 'Page not found'}</span>
          </div>
          <div className="topbar-right">
            <span className="secure-workspace">
              <ShieldCheck size={14} />
              Secure workspace
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="user-trigger" aria-label="Open account menu">
                  <span className="avatar">{initials(user.name)}</span>
                  <span className="user-details">
                    <strong>{user.name}</strong>
                    <small>{user.role.name}</small>
                  </span>
                  <ChevronDown size={14} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <div className="dropdown-user">
                  <strong>{user.name}</strong>
                  <span>{user.email}</span>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/profile">
                    <UserRound size={16} />
                    My profile
                  </Link>
                </DropdownMenuItem>
                {user.permissions.includes('system:manage') && (
                  <DropdownMenuItem asChild>
                    <Link to="/settings">
                      <Settings2 size={16} />
                      Workspace settings
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => logout.mutate()} disabled={logout.isPending}>
                  <LogOut size={16} />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        {logout.isError && (
          <div className="inline-alert" role="alert">
            {logout.error.message}
            <Button size="sm" variant="ghost" onClick={() => logout.mutate()}>
              Retry sign out
            </Button>
          </div>
        )}
        <main id="main-content" className="page-content" tabIndex={-1}>
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>© {new Date().getFullYear()} Viotech I.T. Solutions</span>
          <span>
            <CircleHelp size={13} />
            ViotechPM <span className="footer-version">v0.1 · Foundation</span>
          </span>
        </footer>
      </div>
    </div>
  );
}
