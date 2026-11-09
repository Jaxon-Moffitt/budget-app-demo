import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ruleRow, type RuleDirection, type RuleDraft } from '@/domain/rules';
import type { TransactionKind } from '@/domain/transactions';
import { supabase } from '@/lib/supabase';

export type Rule = {
  id: string;
  match_text: string;
  direction: RuleDirection | null;
  account_id: string | null;
  kind: TransactionKind;
  envelope_id: string | null;
  category_id: string | null;
  sort_order: number;
};

/** Every rule, in the order they're tried: the first match wins. */
export function useRules() {
  return useQuery({
    queryKey: ['rules'],
    async queryFn() {
      const { data, error } = await supabase
        .from('rules')
        .select('id, match_text, direction, account_id, kind, envelope_id, category_id, sort_order')
        .order('sort_order')
        .order('created_at');
      if (error) throw error;
      return data as Rule[];
    },
  });
}

/** Files everything still waiting for review. Returns how many rows changed. */
async function applyRules(): Promise<number> {
  const { data, error } = await supabase.rpc('apply_rules');
  if (error) throw error;
  return data as number;
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['rules'] }),
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['budget'] }),
    ]);
}

/**
 * Saves a rule (new when id is null), then runs the rules over everything
 * waiting for review, so a new rule files matching transactions straight
 * away. Returns how many were filed.
 */
export function useSaveRule() {
  const refresh = useRefresh();
  return useMutation({
    async mutationFn({
      id,
      householdId,
      rule,
      sortOrder,
    }: {
      id: string | null;
      householdId: string;
      rule: RuleDraft;
      sortOrder: number;
    }) {
      const row = ruleRow(rule);
      const { error } = id
        ? await supabase.from('rules').update(row).eq('id', id)
        : await supabase.from('rules').insert({ ...row, household_id: householdId, sort_order: sortOrder });
      if (error) throw error;
      return applyRules();
    },
    onSuccess: refresh,
  });
}

export function useDeleteRule() {
  const refresh = useRefresh();
  return useMutation({
    async mutationFn({ id }: { id: string }) {
      const { error } = await supabase.from('rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

export function useSetRuleOrder() {
  const refresh = useRefresh();
  return useMutation({
    async mutationFn({ ids }: { ids: string[] }) {
      const { error } = await supabase.rpc('set_rule_order', { ordered: ids });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

/** Runs rules and transfer matching over everything waiting for review. */
export function useApplyRules() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: applyRules, onSuccess: refresh });
}
