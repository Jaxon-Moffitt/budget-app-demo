import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { computeBudget, type BudgetMonth } from '@/domain/budget';
import { buildBudgetInput, type ActivityRow, type AssignedRow } from '@/domain/budget-data';
import { isHidden } from '@/domain/categories';
import type { Cents } from '@/domain/money';
import { localDate, type Month } from '@/domain/month';
import { useEnvelopes, useHousehold, type Envelope, type EnvelopeGroup } from '@/lib/queries';
import { supabase } from '@/lib/supabase';

export function currentMonth(): Month {
  return localDate().slice(0, 7);
}

/** Database totals since the start month, plus every assigned amount. */
function useBudgetRows(start: Month | null) {
  return useQuery({
    queryKey: ['budget', start],
    enabled: start !== null,
    async queryFn() {
      const [activity, assigned] = await Promise.all([
        supabase.rpc('budget_activity', { start_month: start }),
        supabase
          .from('budget_months')
          .select('month, envelope_id, assigned')
          .gte('month', start as string),
      ]);
      if (activity.error) throw activity.error;
      if (assigned.error) throw assigned.error;
      return {
        activity: activity.data as ActivityRow[],
        assigned: assigned.data as AssignedRow[],
      };
    },
  });
}

export type BudgetView = {
  start: Month;
  /** Every month from start through the one asked for, computed in order. */
  months: BudgetMonth[];
  month: BudgetMonth;
  /** What to show: hidden envelopes only when they hold money or had activity this month. */
  groups: EnvelopeGroup[];
  /** Every envelope, hidden ones included. */
  envelopes: Envelope[];
};

/**
 * The budget for one month. Months before the household's start month
 * aren't budgeted; everything before it is the opening Ready to assign.
 */
export function useBudget(month: Month) {
  const household = useHousehold(true);
  const envelopeGroups = useEnvelopes();
  const start = household.data?.budgetStart ?? null;
  const rows = useBudgetRows(start);

  let view: BudgetView | null = null;
  if (start && envelopeGroups.data && rows.data) {
    const through = month < start ? start : month;
    const groups = envelopeGroups.data;
    const envelopes = groups.flatMap(g => g.envelopes);
    // Hidden envelopes still count: their money and spending stay real.
    const months = computeBudget(
      buildBudgetInput({
        envelopes,
        start,
        through,
        activity: rows.data.activity,
        assigned: rows.data.assigned,
      }),
    );
    const current = months[months.length - 1];
    view = {
      start,
      months,
      month: current,
      groups: groups
        .map(g => ({
          ...g,
          envelopes: g.envelopes.filter(e => {
            if (!isHidden(g, e)) return true;
            const values = current.envelopes[e.id];
            return (
              (values?.balance ?? 0) !== 0 ||
              (values?.spending ?? 0) !== 0 ||
              (values?.invested ?? 0) !== 0 ||
              (values?.assigned ?? 0) !== 0
            );
          }),
        }))
        .filter(g => g.envelopes.length > 0),
      envelopes,
    };
  }

  return {
    household,
    view,
    isPending: household.isPending || envelopeGroups.isPending || (start !== null && rows.isPending),
    error: household.error ?? envelopeGroups.error ?? rows.error,
    refetch: () => Promise.all([envelopeGroups.refetch(), rows.refetch()]),
  };
}

function useInvalidateBudget() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['budget'] }),
      queryClient.invalidateQueries({ queryKey: ['envelopes'] }),
      queryClient.invalidateQueries({ queryKey: ['household'] }),
    ]);
}

export function useSetBudgetStart() {
  const invalidate = useInvalidateBudget();
  return useMutation({
    async mutationFn({ householdId, month }: { householdId: string; month: Month }) {
      const { error } = await supabase
        .from('households')
        .update({ budget_start: month })
        .eq('id', householdId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/**
 * Starts the budget over from a new month: everything before it becomes the
 * opening Ready to assign, and older transactions are archived (still in
 * balances and history). Optionally clears every envelope's starting
 * balance, so they can be entered fresh. Assigned amounts from earlier
 * months stay stored, so moving the start back brings them back.
 */
export function useRestartBudget() {
  const invalidate = useInvalidateBudget();
  const queryClient = useQueryClient();
  return useMutation({
    async mutationFn({
      householdId,
      month,
      clearStartingBalances,
    }: {
      householdId: string;
      month: Month;
      clearStartingBalances: boolean;
    }) {
      if (clearStartingBalances) {
        const cleared = await supabase
          .from('envelopes')
          .update({ starting_balance: 0 })
          .eq('household_id', householdId)
          .neq('starting_balance', 0);
        if (cleared.error) throw cleared.error;
      }
      const { error } = await supabase.from('households').update({ budget_start: month }).eq('id', householdId);
      if (error) throw error;
    },
    onSuccess: () =>
      Promise.all([invalidate(), queryClient.invalidateQueries({ queryKey: ['transactions'] })]),
  });
}

/**
 * Sets each envelope's assigned amount for one month. Moving money between
 * envelopes sends both in one call, so it's saved together or not at all.
 */
export function useSetAssigned() {
  const invalidate = useInvalidateBudget();
  return useMutation({
    async mutationFn({
      householdId,
      month,
      amounts,
    }: {
      householdId: string;
      month: Month;
      amounts: { envelopeId: string; assigned: Cents }[];
    }) {
      if (amounts.length === 0) return;
      const { error } = await supabase.from('budget_months').upsert(
        amounts.map(a => ({
          household_id: householdId,
          month,
          envelope_id: a.envelopeId,
          assigned: a.assigned,
        })),
        { onConflict: 'household_id,month,envelope_id' },
      );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export type EnvelopeMoneyChanges = Partial<
  Pick<Envelope, 'target' | 'starting_balance' | 'linked_account_id'>
>;

/** Target, starting balance and linked account: the envelope's money settings. */
export function useUpdateEnvelopeMoney() {
  const invalidate = useInvalidateBudget();
  return useMutation({
    async mutationFn({ envelopeId, changes }: { envelopeId: string; changes: EnvelopeMoneyChanges }) {
      const { error } = await supabase.from('envelopes').update(changes).eq('id', envelopeId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
