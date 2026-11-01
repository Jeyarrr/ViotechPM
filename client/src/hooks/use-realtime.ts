import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import { api } from '@/services/api';

export function useRealtime(userId?: string) {
  const client = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let socket: Socket | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void import('socket.io-client')
      .then(({ io }) => {
        if (cancelled) return;
        const connection = io(import.meta.env.VITE_API_URL || undefined, {
          withCredentials: true,
          transports: ['websocket'],
          autoConnect: false,
          auth: async (done) => {
            try {
              done(await api.get('/auth/csrf'));
            } catch {
              done({});
            }
          },
        });
        socket = connection;
        const keys = new Map<string, number>();
        const invalidate = (key: string) => {
          keys.set(key, Date.now());
          if (timer) return;
          timer = setTimeout(() => {
            for (const [key, changedAt] of keys) {
              const prefix = key.split('/');
              void client.invalidateQueries(
                {
                  predicate: (query) =>
                    prefix.every((part, index) => query.queryKey[index] === part) &&
                    query.state.dataUpdatedAt < changedAt,
                },
                { cancelRefetch: false },
              );
            }
            keys.clear();
            timer = undefined;
          }, 250);
        };
        let connectedBefore = false;
        connection.on('connect', () => {
          // Initial mounting already fetches active queries. Reconnect catches missed events.
          if (connectedBefore) {
            invalidate('notifications');
            invalidate('dashboard');
            invalidate('core');
            invalidate('analytics');
          }
          connectedBefore = true;
        });
        connection.on('notifications:changed', () => invalidate('notifications'));
        connection.on('workspace:changed', (event: { entityType?: string }) => {
          const affected: Record<string, string[]> = {
            Task: [
              'tasks',
              'task',
              'comments',
              'documents',
              'activities',
              'project',
              'projects',
              'milestones',
              'milestone',
              'project-milestones',
              'report',
            ],
            Milestone: [
              'milestones',
              'milestone',
              'project-milestones',
              'milestone-options',
              'tasks',
              'task',
              'project',
              'activities',
              'report',
            ],
            Project: [
              'projects',
              'project',
              'project-budget',
              'members',
              'member-options',
              'activity-members',
              'activities',
              'tasks',
              'task',
              'lookups/projects',
              'lookups/assignees',
              'approval-policy',
            ],
            ProjectTransaction: [
              'transactions',
              'transaction',
              'transaction-history',
              'approvals',
              'expenses',
              'expense-summary',
              'project-budget',
              'postable-transactions',
              'activities',
              'report',
            ],
            Expense: [
              'expenses',
              'expense-summary',
              'project-budget',
              'postable-transactions',
              'transaction',
              'report',
              'activities',
            ],
            ProjectDocument: ['documents', 'activities'],
          };
          for (const key of affected[event.entityType ?? ''] ?? ['activities'])
            invalidate('core/' + key);
          invalidate('dashboard');
          invalidate('analytics');
        });
        connection.on('disconnect', (reason) => {
          if (reason === 'io server disconnect')
            void client.invalidateQueries({ queryKey: ['auth', 'me'] });
        });
        connection.connect();
      })
      .catch(() => {
        /* REST remains available; reconnect on the next authenticated mount. */
      });
    return () => {
      cancelled = true;
      socket?.removeAllListeners();
      socket?.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [client, userId]);
}
