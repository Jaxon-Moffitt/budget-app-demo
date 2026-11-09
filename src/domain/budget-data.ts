/**
 * Turns the database's monthly totals (the budget_activity RPC and
 * budget_months rows) into computeBudget()'s input. Pure, so it's tested.
 */
import type { BudgetInput, MonthMap } from './budget.ts';
import type { Cents } from './money.ts';
import { monthRange, type Month } from './month.ts';

export type ActivityRow = {
  month: Month | null;
  envelope_id: string | null;
  kind: 'opening' | 'income' | 'spending' | 'investment' | 'starting' | 'unreviewed';
  amount: Cents;
};

export type AssignedRow = { month: Month; envelope_id: string; assigned: Cents };

export function buildBudgetInput({
  envelopes,
  start,
  through,
  activity,
  assigned,
}: {
  envelopes: { id: string; starting_balance: Cents }[];
  start: Month;
  through: Month;
  activity: ActivityRow[];
  assigned: AssignedRow[];
}): BudgetInput {
  const known = new Set(envelopes.map(e => e.id));
  const input: BudgetInput = {
    envelopes: envelopes.map(e => e.id),
    months: monthRange(start, through),
    assigned: {},
    spending: {},
    invested: {},
    income: {},
    envelopeIncome: {},
    starting: {},
    unreviewed: {},
    startingBalances: Object.fromEntries(envelopes.map(e => [e.id, e.starting_balance])),
    opening: 0,
  };

  const addTo = (map: MonthMap<Cents>, month: Month, id: string, amount: Cents) => {
    const row = (map[month] ??= {});
    row[id] = (row[id] ?? 0) + amount;
  };
  const addMonth = (map: Record<Month, Cents | undefined>, month: Month, amount: Cents) => {
    map[month] = (map[month] ?? 0) + amount;
  };

  for (const row of activity) {
    if (row.kind === 'opening') {
      input.opening += row.amount;
      continue;
    }
    if (row.month === null || row.month < start || row.month > through) continue;
    const envelope = row.envelope_id && known.has(row.envelope_id) ? row.envelope_id : null;
    if ((row.kind === 'spending' || row.kind === 'investment') && envelope) {
      addTo(row.kind === 'spending' ? input.spending : input.invested, row.month, envelope, row.amount);
    } else if (row.kind === 'income' && envelope) {
      addTo(input.envelopeIncome, row.month, envelope, row.amount);
    } else if (row.kind === 'income') {
      addMonth(input.income, row.month, row.amount);
    } else if (row.kind === 'starting') {
      addMonth(input.starting, row.month, row.amount);
    } else {
      // Unreviewed, or an envelope this list doesn't have: the money is
      // still real, so it waits in Ready to assign.
      addMonth(input.unreviewed, row.month, row.amount);
    }
  }

  for (const row of assigned) {
    if (row.month < start || row.month > through || !known.has(row.envelope_id)) continue;
    addTo(input.assigned, row.month, row.envelope_id, row.assigned);
  }

  return input;
}
