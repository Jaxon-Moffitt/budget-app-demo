/**
 * The monthly budget (each envelope's target) split across paychecks, and
 * what "Fill from budget" adds when a paycheck comes in.
 */
import type { Cents } from './money.ts';

export type PaySchedule = 'weekly' | 'biweekly' | 'twice_monthly' | 'monthly';

export const PAY_SCHEDULES: { value: PaySchedule; label: string; perYear: number }[] = [
  { value: 'twice_monthly', label: 'Twice a month', perYear: 24 },
  { value: 'biweekly', label: 'Every 2 weeks', perYear: 26 },
  { value: 'weekly', label: 'Weekly', perYear: 52 },
  { value: 'monthly', label: 'Monthly', perYear: 12 },
];

export function payScheduleLabel(schedule: PaySchedule): string {
  return PAY_SCHEDULES.find(s => s.value === schedule)?.label ?? schedule;
}

/**
 * One paycheck's share of a monthly amount: the year's total spread over
 * the year's paychecks, so every-two-weeks pay (26 a year) gives a little
 * less than half per paycheck.
 */
export function perPaycheck(monthly: Cents, schedule: PaySchedule): Cents {
  const perYear = PAY_SCHEDULES.find(s => s.value === schedule)?.perYear ?? 12;
  return Math.round((monthly * 12) / perYear);
}

export type FillEnvelope = { id: string; target: Cents | null; assigned: Cents };
export type FillLine = { id: string; add: Cents; target: Cents; assigned: Cents };

/**
 * What to add to each envelope: one paycheck's share of its target, or the
 * rest of the month's target, never more than the target still needs this
 * month. So the second of two paychecks tops envelopes up exactly, and a
 * third paycheck in a month (every-2-weeks pay) adds nothing to envelopes
 * that are already full. Envelopes without a target are skipped.
 */
export function fillPlan(envelopes: FillEnvelope[], mode: 'paycheck' | 'month', schedule: PaySchedule): FillLine[] {
  const lines: FillLine[] = [];
  for (const e of envelopes) {
    const target = e.target ?? 0;
    if (target <= 0) continue;
    const needed = Math.max(0, target - e.assigned);
    const add = Math.min(needed, mode === 'month' ? needed : perPaycheck(target, schedule));
    if (add > 0) lines.push({ id: e.id, add, target, assigned: e.assigned });
  }
  return lines;
}

/** A paycheck amount as a monthly one, and back: every-2-weeks pay is 26 paychecks over 12 months. */
export function monthlyFromPaycheck(paycheck: Cents, schedule: PaySchedule): Cents {
  const perYear = PAY_SCHEDULES.find(s => s.value === schedule)?.perYear ?? 12;
  return Math.round((paycheck * perYear) / 12);
}

/**
 * What the expected monthly income leaves after every envelope's monthly
 * target. Negative when the budget asks for more than the income.
 */
export function leftover(expectedIncome: Cents | null, targets: (Cents | null)[]): Cents | null {
  if (expectedIncome === null) return null;
  return expectedIncome - targets.reduce<number>((sum, t) => sum + (t ?? 0), 0);
}

/**
 * The envelopes with the leftover added to one envelope's target, so "Fill
 * from budget" gives it its share of the rest of each paycheck. A budget
 * that's over the income adds nothing.
 */
export function withLeftover<E extends { id: string; target: Cents | null }>(
  envelopes: E[],
  leftoverEnvelopeId: string | null,
  amount: Cents | null,
): E[] {
  if (!leftoverEnvelopeId || !amount || amount <= 0) return envelopes;
  return envelopes.map(e => (e.id === leftoverEnvelopeId ? { ...e, target: (e.target ?? 0) + amount } : e));
}
