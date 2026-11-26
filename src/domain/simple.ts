/**
 * The Simple view of the budget: this month's expected bills and whether
 * each one is covered by what its envelope holds now. The rule is to start
 * each month with every bill's money already in its envelope, so paydays
 * still to come don't count.
 */
import { billDates, type EnvelopeBill } from './forecast.ts';
import type { Cents } from './money.ts';

export type MonthBill = {
  envelopeId: string;
  merchant: string;
  date: string;
  amount: Cents;
  /** Paid already this month; covered by what the envelope holds; or not. */
  status: 'paid' | 'covered' | 'short';
  /** How much of this bill the envelope can't pay, when short. */
  short: Cents;
  /** Expected earlier this month but not seen yet. */
  late: boolean;
};

/**
 * Every bill expected in the month of `today`, in date order. A bill whose
 * latest charge was this month is paid. The rest are covered in date order
 * from their envelope's balance today: each envelope pays its bills one by
 * one until it runs out.
 */
export function monthBills(bills: EnvelopeBill[], balanceOf: (envelopeId: string) => Cents, today: string): MonthBill[] {
  const month = today.slice(0, 7);
  const end = `${month}-31`;
  const out: MonthBill[] = [];
  for (const bill of bills) {
    if (bill.lastDate.slice(0, 7) === month) {
      out.push({ envelopeId: bill.envelopeId, merchant: bill.merchant, date: bill.lastDate, amount: bill.amount, status: 'paid', short: 0, late: false });
    }
    for (const date of billDates(bill, end)) {
      if (date.slice(0, 7) > month) break;
      // Expected before this month and never seen: due now.
      const late = date < today;
      out.push({ envelopeId: bill.envelopeId, merchant: bill.merchant, date: late ? today : date, amount: bill.amount, status: 'covered', short: 0, late });
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || a.merchant.localeCompare(b.merchant));

  const left = new Map<string, Cents>();
  for (const b of out) {
    if (b.status === 'paid') continue;
    const has = left.get(b.envelopeId) ?? balanceOf(b.envelopeId);
    const after = has - b.amount;
    left.set(b.envelopeId, after);
    if (after < 0) {
      b.status = 'short';
      b.short = Math.min(b.amount, -after);
    }
  }
  return out;
}

/**
 * Which envelopes the Simple view shows until someone picks: those in a
 * group named for everyday spending ("Discretionary", "Spending", "Fun"),
 * or failing that, those with no bills and no savings account behind them.
 */
export function defaultDiscretionary(
  groups: { name: string; envelopes: { id: string; linked_account_id: string | null }[] }[],
  billEnvelopeIds: Set<string>,
  savingsAccountIds: Set<string>,
): string[] {
  const named = groups.filter(g => /discretion|spend|fun|personal|everyday/i.test(g.name));
  if (named.length > 0) return named.flatMap(g => g.envelopes.map(e => e.id));
  return groups
    .flatMap(g => g.envelopes)
    .filter(e => !billEnvelopeIds.has(e.id) && !(e.linked_account_id && savingsAccountIds.has(e.linked_account_id)))
    .map(e => e.id);
}
