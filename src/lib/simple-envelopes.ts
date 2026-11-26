import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { prefStorage } from '@/lib/storage';

const KEY = 'simple-envelopes';

/**
 * The envelopes the Simple view shows, picked on this phone; null until
 * someone picks, so the view falls back to its default.
 */
export function useChosenEnvelopes() {
  return useQuery({
    queryKey: ['pref', KEY],
    async queryFn(): Promise<string[] | null> {
      try {
        const saved = await prefStorage.getItem(KEY);
        const ids = saved ? JSON.parse(saved) : null;
        return Array.isArray(ids) ? ids.filter((x: unknown): x is string => typeof x === 'string') : null;
      } catch {
        return null;
      }
    },
    staleTime: Infinity,
  });
}

export function useSetChosenEnvelopes() {
  const queryClient = useQueryClient();
  return useMutation({
    async mutationFn(ids: string[] | null) {
      await prefStorage.setItem(KEY, ids === null ? '' : JSON.stringify(ids));
      return ids;
    },
    onSuccess: ids => queryClient.setQueryData(['pref', KEY], ids),
  });
}
