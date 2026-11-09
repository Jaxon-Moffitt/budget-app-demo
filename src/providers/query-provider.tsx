import { focusManager, QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

// React Native has no window focus event; refetch stale data when the app returns.
focusManager.setEventListener(handleFocus => {
  const subscription = AppState.addEventListener('change', state => {
    handleFocus(state === 'active');
  });
  return () => subscription.remove();
});

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <LiveUpdates />
      {children}
    </QueryClientProvider>
  );
}

/**
 * Refetches when either phone (or the bank sync) changes a row. Realtime
 * applies the same RLS as queries, so only this household's changes arrive.
 */
function LiveUpdates() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) {
      queryClient.clear();
      return;
    }
    const channel = supabase
      .channel('household-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        // Manual accounts' balances and budget activity come from transactions.
        queryClient.invalidateQueries({ queryKey: ['accounts'] });
        queryClient.invalidateQueries({ queryKey: ['budget'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budget_months' }, () =>
        queryClient.invalidateQueries({ queryKey: ['budget'] }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'envelopes' }, () => {
        queryClient.invalidateQueries({ queryKey: ['envelopes'] });
        // Starting balances are part of the budget math.
        queryClient.invalidateQueries({ queryKey: ['budget'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'envelope_groups' }, () =>
        queryClient.invalidateQueries({ queryKey: ['envelopes'] }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rules' }, () =>
        queryClient.invalidateQueries({ queryKey: ['rules'] }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () =>
        queryClient.invalidateQueries({ queryKey: ['categories'] }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts' }, () => {
        queryClient.invalidateQueries({ queryKey: ['accounts'] });
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        // Moving an account in or out of the budget changes the numbers.
        queryClient.invalidateQueries({ queryKey: ['budget'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  return null;
}
