import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { api } from '@/services/api';

export function useRealtime(userId?: string) {
  const client = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const socket = io(import.meta.env.VITE_API_URL || undefined, {
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
    let timer: ReturnType<typeof setTimeout> | undefined;
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
    socket.on('connect', () => {
      // Initial mounting already fetches active queries. Reconnect catches missed events.
      if (connectedBefore) {
        invalidate('notifications');
        invalidate('dashboard');
        invalidate('core');
        invalidate('analytics');
      }
      connectedBefore = true;
    });
    socket.on('notifications:changed', () => invalidate('notifications'));
    socket.on('workspace:changed', (event: { entityType?: string }) => {
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
    socket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect')
        void client.invalidateQueries({ queryKey: ['auth', 'me'] });
    });
    socket.connect();
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [client, userId]);
}
