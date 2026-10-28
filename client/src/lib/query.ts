import { QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/services/api';

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401)
        queryClient.setQueryData(['auth', 'me'], null);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 1,
    },
  },
});
