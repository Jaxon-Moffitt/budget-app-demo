/**
 * True envelope budget math.
 *
 * Every dollar that comes in goes to Ready to assign, and from there into
 * envelopes. An envelope's balance is everything ever put in, minus
 * everything spent or invested from it, and it always carries into the next
 * month, negative balances included: overspending stays visible until it's
 * covered by moving money from another envelope.
 *
 *   balance(env, m)  = balance(env, m-1) + assigned + spending + invested + income kept in it
 *                      (the first month starts from the envelope's starting balance)
 *   readyToAssign(m) = readyToAssign(m-1) + income not kept in an envelope + other - assigned
 *                      (the first month starts from opening minus every starting balance)
 *
 * "other" is money that isn't income but is still cash in the budget:
 * Starting Balance rows for accounts added later, and transactions nobody
 * has reviewed yet. Counting it keeps envelopes + Ready to assign equal to
 * the money in budget accounts.
 */
import type { Cents } from './money.ts';
import type { Month } from './month.ts';

/** Values keyed by month, then by envelope id. Missing entries count as zero. */
export type MonthMap<T> = Record<Month, Record<string, T> | undefined>;

export type BudgetInput = {
  envelopes: string[];
  /** Consecutive months in ascending order, from the budget's first month. */
  months: Month[];
  /** Money moved into (positive) or out of (negative) each envelope that month. */
  assigned: MonthMap<Cents>;
  /** Spending per envelope: negative, refunds positive. */
  spending: MonthMap<Cents>;
  /** Money sent to investment accounts per envelope: negative. */
  invested: MonthMap<Cents>;
  /** Income that goes to Ready to assign. */
  income: Record<Month, Cents | undefined>;
  /** Income kept straight in an envelope, like interest on its savings account. */
  envelopeIncome: MonthMap<Cents>;
  /** Starting Balance rows after the first month: cash, but not income. */
  starting: Record<Month, Cents | undefined>;
  /** Not yet reviewed: cash, but not income or spending yet. */
  unreviewed: Record<Month, Cents | undefined>;
  /** What each envelope held when budgeting started, taken from opening. */
  startingBalances: Record<string, Cents | undefined>;
  /** Money in budget accounts before the first month. */
  opening: Cents;
};

export type EnvelopeMonth = {
  /** The balance carried in: last month's, or the starting balance. */
  carried: Cents;
  assigned: Cents;
  spending: Cents;
  invested: Cents;
  /** Income kept straight in this envelope. */
  income: Cents;
  balance: Cents;
};

export type BudgetMonth = {
  month: Month;
  /** All income this month, whether it went to Ready to assign or an envelope. */
  income: Cents;
  starting: Cents;
  unreviewed: Cents;
  /** Net money put into envelopes this month. */
  assigned: Cents;
  /** Net spending this month across envelopes: negative. */
  spending: Cents;
  invested: Cents;
  readyToAssign: Cents;
  /** Sum of the negative balances: zero or negative. */
  overspent: Cents;
  envelopes: Record<string, EnvelopeMonth>;
};

export function computeBudget(input: BudgetInput): BudgetMonth[] {
  const result: BudgetMonth[] = [];
  let ready =
    input.opening - input.envelopes.reduce((sum, id) => sum + (input.startingBalances[id] ?? 0), 0);
  let prev: BudgetMonth | undefined;

  for (const month of input.months) {
    const envelopes: Record<string, EnvelopeMonth> = {};
    let assigned = 0;
    let spending = 0;
    let invested = 0;
    let envelopeIncome = 0;
    let overspent = 0;

    for (const id of input.envelopes) {
      const carried = prev ? (prev.envelopes[id]?.balance ?? 0) : (input.startingBalances[id] ?? 0);
      const a = input.assigned[month]?.[id] ?? 0;
      const s = input.spending[month]?.[id] ?? 0;
      const v = input.invested[month]?.[id] ?? 0;
      const inc = input.envelopeIncome[month]?.[id] ?? 0;
      const balance = carried + a + s + v + inc;
      envelopes[id] = { carried, assigned: a, spending: s, invested: v, income: inc, balance };
      assigned += a;
      spending += s;
      invested += v;
      envelopeIncome += inc;
      if (balance < 0) overspent += balance;
    }

    const income = input.income[month] ?? 0;
    const starting = input.starting[month] ?? 0;
    const unreviewed = input.unreviewed[month] ?? 0;
    ready += income + starting + unreviewed - assigned;

    const current: BudgetMonth = {
      month,
      income: income + envelopeIncome,
      starting,
      unreviewed,
      assigned,
      spending,
      invested,
      readyToAssign: ready,
      overspent,
      envelopes,
    };
    result.push(current);
    prev = current;
  }

  return result;
}
