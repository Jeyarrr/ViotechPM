import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Bell, CheckCheck, ClipboardCheck, Flag, MessageSquare, FolderKanban } from 'lucide-react';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { PageResult } from '@/types/core';

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  createdAt: string;
  readAt: string | null;
  href: string;
};
function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000));
  return minutes < 1
    ? 'Just now'
    : minutes < 60
      ? `${minutes}m ago`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}h ago`
        : `${Math.floor(minutes / 1440)}d ago`;
}
function NotificationIcon({ type }: { type: string }) {
  const Icon = type.includes('task')
    ? ClipboardCheck
    : type.includes('milestone')
      ? Flag
      : type.includes('comment')
        ? MessageSquare
        : FolderKanban;
  return <Icon size={18} aria-hidden="true" />;
}
function NotificationList({ compact = false }: { compact?: boolean }) {
  const [page, setPage] = useState(1);
  const [unread, setUnread] = useState(false);
  const [type, setType] = useState('');
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['notifications', 'list', page, unread, type, compact],
    queryFn: () =>
      api.get<PageResult<Notification>>(
        `/notifications?page=${page}&pageSize=${compact ? 5 : 20}${unread ? '&unread=true' : ''}${type ? `&type=${type}` : ''}`,
      ),
  });
  const read = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/notifications/${id === 'all' ? 'read-all' : `${id}/read`}`, {}),
    onSuccess: () => client.invalidateQueries({ queryKey: ['notifications'] }),
  });
  return (
    <div className="notification-list">
      <div className="notification-heading">
        <strong>Notifications</strong>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => read.mutate('all')}
          disabled={read.isPending}
        >
          <CheckCheck size={15} /> Mark all read
        </Button>
      </div>
      {!compact && (
        <div className="notification-filters">
          <label>
            <input
              type="checkbox"
              checked={unread}
              onChange={(e) => {
                setUnread(e.target.checked);
                setPage(1);
              }}
            />{' '}
            Unread only
          </label>
          <label>
            Type{' '}
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All types</option>
              {[
                'project.member_assigned',
                'task.created',
                'task.reassigned',
                'task.status_changed',
                'task.completed',
                'milestone.updated',
                'transaction.submitted',
                'transaction.status_changed',
              ].map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll('.', ' ').replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {(query.isError || read.isError) && (
        <p role="alert">{query.error?.message ?? read.error?.message}</p>
      )}
      {query.isPending && <p role="status">Loading notifications…</p>}
      {query.data?.items.length === 0 && (
        <div className="notification-empty">
          <Bell size={26} />
          <strong>You’re all caught up</strong>
          <p>Assignments and updates will appear here.</p>
        </div>
      )}
      {query.data?.items.map((item) => (
        <article
          className={`notification-item ${item.readAt ? '' : 'notification-unread'}`}
          key={item.id}
        >
          <NotificationIcon type={item.type} />
          <div>
            <Link
              to={item.href}
              onClick={() => {
                if (!item.readAt) read.mutate(item.id);
              }}
            >
              <strong>{item.title}</strong>
              <p>{item.message}</p>
            </Link>
            <time
              title={new Date(item.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}
            >
              {relativeTime(item.createdAt)}
            </time>
          </div>
          {!item.readAt && (
            <Button
              size="sm"
              variant="ghost"
              disabled={read.isPending}
              onClick={() => read.mutate(item.id)}
            >
              Mark read
            </Button>
          )}
        </article>
      ))}
      {compact ? (
        <Link className="notification-view-all" to="/notifications">
          View all notifications
        </Link>
      ) : (
        query.data && (
          <div className="notification-heading">
            <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span>
              Page {page} of {query.data.pages}
            </span>
            <Button
              variant="outline"
              disabled={page >= query.data.pages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        )
      )}
    </div>
  );
}
export function NotificationBell() {
  const query = useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: () => api.get<{ count: number }>('/notifications/unread-count'),
  });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="notification-bell"
          variant="ghost"
          size="icon"
          aria-label={`Notifications${query.data?.count ? `, ${query.data.count} unread` : ''}`}
        >
          <Bell size={19} />
          {!!query.data?.count && (
            <span className="notification-count">
              {query.data.count > 99 ? '99+' : query.data.count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="notification-dropdown">
        <NotificationList compact />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
export function NotificationsPage() {
  return (
    <section>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Your workspace</span>
          <h1>Notifications</h1>
          <p>Assignments, discussions and project updates.</p>
        </div>
      </div>
      <div className="card">
        <NotificationList />
      </div>
    </section>
  );
}
