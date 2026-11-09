/**
 * How one envelope looks on the Budget tab, and the rules of the envelope
 * sheet. Pure, so it's tested.
 */
import type { EnvelopeMonth } from './budget.ts';
import type { Cents } from './money.ts';

export type EnvelopeStatus = 'over' | 'empty' | 'low' | 'ok';

/** Under this share of its money left, an envelope shows as running low. */
export const LOW_SHARE = 0.2;

export type EnvelopeView = {
  carried: Cents;
  /** Net money added this month (negative if more was taken out). */
  added: Cents;
  /** Income kept straight in the envelope this month, like interest. */
  received: Cents;
  /** Spent this month, as a positive number; refunds lower it. */
  spent: Cents;
  /** Sent to investments this month, as a positive number. */
  invested: Cents;
  balance: Cents;
  status: EnvelopeStatus;
  /** How full the bar is, 0 to 1. Overspent envelopes show a full bar in the over color. */
  fill: number;
};

export function envelopeView(values: EnvelopeMonth | undefined): EnvelopeView {
  const carried = values?.carried ?? 0;
  const added = values?.assigned ?? 0;
  const received = values?.income ?? 0;
  // 0 - x rather than -x, so nothing spent is 0 and not -0.
  const spent = 0 - (values?.spending ?? 0);
  const invested = 0 - (values?.invested ?? 0);
  const balance = values?.balance ?? 0;
  const funded = carried + added + received;

  let status: EnvelopeStatus;
  let fill: number;
  if (balance < 0) {
    status = 'over';
    fill = 1;
  } else if (balance === 0) {
    status = 'empty';
    fill = 0;
  } else {
    // A refund can leave more than was put in.
    fill = funded > 0 ? Math.min(1, balance / funded) : 1;
    status = fill < LOW_SHARE ? 'low' : 'ok';
  }
  return { carried, added, received, spent, invested, balance, status, fill };
}

/**
 * Whether a move can be saved. Money comes from Ready to assign (from
 * null) or another envelope. Taking more from Ready to assign than it
 * holds is allowed with a warning (it shows as assigned too much), but no
 * envelope can give more than it holds.
 */
export type MoveCheck =
  | { kind: 'none' }
  | { kind: 'ok' }
  | { kind: 'overbudget'; by: Cents }
  | { kind: 'too-much'; most: Cents };

export function checkMove(amount: Cents, sourceBalance: Cents, fromReady: boolean): MoveCheck {
  if (amount <= 0) return { kind: 'none' };
  if (amount <= sourceBalance) return { kind: 'ok' };
  if (fromReady) return { kind: 'overbudget', by: amount - Math.max(0, sourceBalance) };
  return { kind: 'too-much', most: Math.max(0, sourceBalance) };
}

export type QuickPick = { kind: 'cover' | 'refill' | 'target' | 'round'; amount: Cents };

/**
 * One-tap amounts for adding money: cover overspending, refill what was
 * spent, reach the monthly target, then round amounts.
 */
export function quickPicks(e: EnvelopeView, target: Cents | null): QuickPick[] {
  const picks: QuickPick[] = [];
  if (e.status === 'over') picks.push({ kind: 'cover', amount: -e.balance });
  else if (e.spent > 0) picks.push({ kind: 'refill', amount: e.spent });
  const toTarget = target !== null ? target - e.added : 0;
  if (toTarget > 0 && !picks.some(p => p.amount === toTarget)) picks.push({ kind: 'target', amount: toTarget });
  for (const amount of [2500, 5000, 10000]) {
    if (!picks.some(p => p.amount === amount)) picks.push({ kind: 'round', amount });
  }
  return picks;
}

/**
 * For an envelope tied to a savings account: how the envelopes linked to
 * that account compare with what the bank says it holds. Positive
 * difference means the account holds more than its envelopes.
 */
export function linkedCheck(accountBalance: Cents, envelopeBalances: Cents[]) {
  const envelopes = envelopeBalances.reduce((sum, b) => sum + b, 0);
  return { envelopes, account: accountBalance, difference: accountBalance - envelopes };
}
