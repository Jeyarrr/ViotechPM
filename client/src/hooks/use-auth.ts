import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api, ApiError } from '@/services/api';
import type { User } from '@/types/api';

export function useAuth() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      try {
        return (await api.get<{ user: User }>('/auth/me')).user;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
  });
}
export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      api.post<{ user: User }>('/auth/login', input),
    onSuccess: (data) => {
      client.clear();
      client.setQueryData(['auth', 'me'], data.user);
    },
  });
}
export function useLogout() {
  const client = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: () => {
      client.clear();
      client.setQueryData(['auth', 'me'], null);
      navigate('/login', { replace: true });
    },
  });
}
