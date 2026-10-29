import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { Lookup, PageResult } from '@/types/core';

export function useCoreMutation<T>(mutationFn: (input: T) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['core'] }),
        client.invalidateQueries({ queryKey: ['dashboard'] }),
        client.invalidateQueries({ queryKey: ['analytics'] }),
      ]);
    },
  });
}
export function queryString(values: Record<string, string | number | undefined>) {
  return new URLSearchParams(
    Object.entries(values)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => [k, String(v)]),
  ).toString();
}

export function useLookup(kind: string, enabled = true, includeInactive = false) {
  return useQuery({
    queryKey: ['core', 'lookups', kind, includeInactive],
    enabled,
    queryFn: async () => {
      const items: Lookup[] = [];
      let page = 1,
        pages = 1;
      do {
        const result = await api.get<PageResult<Lookup>>(
          `/lookups/${kind}?page=${page}&pageSize=100&includeInactive=${includeInactive}`,
        );
        items.push(...result.items);
        pages = result.pages;
        page++;
      } while (page <= pages);
      return items;
    },
  });
}
