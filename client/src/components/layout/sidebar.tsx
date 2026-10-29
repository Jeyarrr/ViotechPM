import { NavLink } from 'react-router';
import { ArrowUpRight, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { Brand } from '@/components/shared/brand';
import { Button } from '@/components/ui/button';
import { navigation } from '@/routes/navigation';
import { cn } from '@/lib/utils';
import type { User } from '@/types/api';

export function Sidebar({
  user,
  collapsed,
  onCollapse,
  onNavigate,
  onLogout,
  logoutPending,
}: {
  user: User;
  collapsed: boolean;
  onCollapse?: () => void;
  onNavigate?: () => void;
  onLogout: () => void;
  logoutPending: boolean;
}) {
  return (
    <aside className={cn('sidebar', collapsed && 'sidebar-collapsed')} aria-label="Main navigation">
      <NavLink to="/" className="brand-link" aria-label="ViotechPM overview" onClick={onNavigate}>
        <Brand compact />
      </NavLink>
      <nav className="sidebar-nav">
        {navigation.map((group) => {
          const items = group.items.filter(
            (item) => !item.permission || user.permissions.includes(item.permission),
          );
          return (
            items.length > 0 && (
              <div className="nav-group" key={group.label}>
                {!collapsed && <p className="nav-label">{group.label}</p>}
                {items.map((item) => (
                  <NavLink
                    to={item.path}
                    end={item.path === '/'}
                    key={item.path}
                    onClick={onNavigate}
                    title={collapsed ? item.title : undefined}
                    className={({ isActive }) => cn('nav-item', isActive && 'nav-item-active')}
                  >
                    <item.icon size={18} strokeWidth={1.7} />
                    <span className={collapsed ? 'sr-only' : ''}>{item.title}</span>
                    {!collapsed &&
                      !['/', '/profile', '/clients', '/projects', '/team', '/tasks'].includes(
                        item.path,
                      ) && <span className="soon-dot" aria-label="Coming in a future phase" />}
                  </NavLink>
                ))}
              </div>
            )
          );
        })}
      </nav>
      <div className="sidebar-bottom">
        {!collapsed && (
          <div className="workspace-status">
            <span className="status-dot" />
            <span>Workspace connected</span>
            <ArrowUpRight size={13} />
          </div>
        )}
        <Button
          variant="ghost"
          className="sidebar-logout"
          onClick={onLogout}
          disabled={logoutPending}
          title="Sign out"
        >
          <LogOut size={17} />
          {!collapsed && <span>{logoutPending ? 'Signing out…' : 'Sign out'}</span>}
        </Button>
        {onCollapse && (
          <button
            className="collapse-button"
            onClick={onCollapse}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        )}
      </div>
    </aside>
  );
}
