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
    const keys = new Set<string>();
    const invalidate = (key: string) => {
      keys.add(key);
      if (timer) return;
      timer = setTimeout(() => {
        for (const key of keys) void client.invalidateQueries({ queryKey: [key] });
        keys.clear();
        timer = undefined;
      }, 250);
    };
    socket.on('connect', () => {
      invalidate('notifications');
      invalidate('dashboard');
      invalidate('core');
    });
    socket.on('notifications:changed', () => invalidate('notifications'));
    socket.on('workspace:changed', () => {
      invalidate('core');
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
