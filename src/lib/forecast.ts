import { useMemo } from 'react';

import {
  billsByEnvelope,
  envelopeTimeline,
  nextPaydays,
  plannedContributions,
  type Coverage,
  type EnvelopeBill,
  type TimelineEvent,
} from '@/domain/forecast';
import { addMonths, localDate } from '@/domain/month';
import { leftover, withLeftover } from '@/domain/paychecks';
import { useChargeHistory, useIncomeHistory } from '@/lib/analytics';
import { currentMonth, useBudget } from '@/lib/budget';
import { useRules } from '@/lib/rules';

/** How far ahead a timeline looks; further when a bill comes later than that. */
const HORIZON_DAYS = 62;

export type EnvelopeForecast = {
  events: TimelineEvent[];
  coverage: Coverage;
  bills: EnvelopeBill[];
  /** The envelope's monthly amount Fill from budget works from (with any leftover). */
  monthlyTarget: number;
  until: string;
};

/**
 * Forecasts for every envelope: learned paydays, Fill from budget's
 * contributions, bills found in the last 13 months of charges, and the
 * balance they leave, from this month's budget.
 */
export function useForecasts() {
  const today = localDate();
  const month = currentMonth();
  const budget = useBudget(month);
  const charges = useChargeHistory(`${addMonths(month, -13)}-01`);
  const income = useIncomeHistory(`${addMonths(month, -4)}-01`);
  const rules = useRules();
  const household = budget.household.data;
  const view = budget.view;

  const forecasts = useMemo(() => {
    if (!household || !view || !charges.data || !income.data || !rules.data) return null;
    const bills = billsByEnvelope(charges.data, rules.data, today);
    const planned = withLeftover(
      view.envelopes.map(e => ({ id: e.id, target: e.target })),
      household.leftoverEnvelopeId,
      leftover(household.expectedIncome, view.envelopes.map(e => e.target)),
    );
    const base = new Date(`${today}T12:00:00`);
    const horizon = localDate(new Date(base.getFullYear(), base.getMonth(), base.getDate() + HORIZON_DAYS));
    const furthest = localDate(new Date(base.getFullYear() + 1, base.getMonth(), base.getDate()));

    const out = new Map<string, EnvelopeForecast>();
    for (const e of planned) {
      const own = bills.filter(b => b.envelopeId === e.id);
      // Far enough to reach every bill at least once, like insurance twice a year.
      const until = own.reduce((u, b) => (b.nextDate > u && b.nextDate <= furthest ? b.nextDate : u), horizon);
      const paydays = nextPaydays(income.data, household.paySchedule, today, until);
      const monthlyTarget = e.target ?? 0;
      const contributions = plannedContributions(
        paydays,
        monthlyTarget,
        view.month.envelopes[e.id]?.assigned ?? 0,
        household.paySchedule,
        today,
      );
      const { events, coverage } = envelopeTimeline(view.month.envelopes[e.id]?.balance ?? 0, contributions, own, today, until);
      out.set(e.id, { events, coverage, bills: own, monthlyTarget, until });
    }
    return out;
  }, [household, view, charges.data, income.data, rules.data, today]);

  return {
    forecasts,
    budget,
    isPending: budget.isPending || charges.isPending || income.isPending || rules.isPending,
    error: budget.error ?? charges.error ?? income.error ?? rules.error,
  };
}
