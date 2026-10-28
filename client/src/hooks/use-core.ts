import { useMutation, useQueryClient } from '@tanstack/react-query';

export function useCoreMutation<T>(mutationFn: (input: T) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['core'] }),
        client.invalidateQueries({ queryKey: ['dashboard'] }),
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
