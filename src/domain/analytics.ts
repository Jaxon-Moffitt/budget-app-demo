/**
 * Numbers for the Analytics tab: spending by category, month totals and top
 * payees. Pure functions over filed budget-account transactions (split
 * parts included, split parents and transfers left out).
 */
import type { Cents } from './money.ts';
import { monthOf, type Month } from './month.ts';

export type AnalyticsRow = {
  date: string;
  /** Negative for money out, as everywhere else. */
  amount: Cents;
  kind: 'spending' | 'income' | 'investment';
  category_id: string | null;
  /** Payee name, else the bank's description. */
  payee: string | null;
};

export type MonthTotals = { month: Month; income: Cents; spent: Cents; invested: Cents };

/** Spending is money out, so a refund (positive spending) lowers it. */
const spentBy = (row: AnalyticsRow) => (row.kind === 'spending' ? -row.amount : 0);

/** Income, spending and investing for each month given, in order. */
export function monthTotals(rows: AnalyticsRow[], months: Month[]): MonthTotals[] {
  const totals = new Map(months.map(m => [m, { month: m, income: 0, spent: 0, invested: 0 }]));
  for (const row of rows) {
    const t = totals.get(monthOf(row.date));
    if (!t) continue;
    if (row.kind === 'income') t.income += row.amount;
    else if (row.kind === 'investment') t.invested -= row.amount;
    else t.spent -= row.amount;
  }
  return months.map(m => totals.get(m)!);
}

export type CategorySpending = {
  /** Null for spending with no category. */
  categoryId: string | null;
  spent: Cents;
  count: number;
};

/**
 * What each category spent in the month, most first. Categories whose
 * refunds cancel out their spending are left out.
 */
export function spendingByCategory(rows: AnalyticsRow[], month: Month): CategorySpending[] {
  const by = new Map<string | null, CategorySpending>();
  for (const row of rows) {
    if (row.kind !== 'spending' || monthOf(row.date) !== month) continue;
    const c = by.get(row.category_id) ?? { categoryId: row.category_id, spent: 0, count: 0 };
    c.spent += spentBy(row);
    c.count += 1;
    by.set(row.category_id, c);
  }
  return [...by.values()].filter(c => c.spent !== 0).sort((a, b) => b.spent - a.spent);
}

/** One category's spending in each month given (null: no category). */
export function categoryTrend(
  rows: AnalyticsRow[],
  categoryId: string | null,
  months: Month[],
): { month: Month; spent: Cents }[] {
  const by = new Map(months.map(m => [m, 0]));
  for (const row of rows) {
    if (row.kind !== 'spending' || row.category_id !== categoryId) continue;
    const m = monthOf(row.date);
    if (by.has(m)) by.set(m, by.get(m)! + spentBy(row));
  }
  return months.map(m => ({ month: m, spent: by.get(m)! }));
}

export type PayeeSpending = { payee: string; spent: Cents; count: number };

/** Where the most money went in the month, by payee. */
export function topPayees(rows: AnalyticsRow[], month: Month, limit = 5): PayeeSpending[] {
  const by = new Map<string, PayeeSpending>();
  for (const row of rows) {
    if (row.kind !== 'spending' || monthOf(row.date) !== month) continue;
    const name = row.payee?.trim() || 'No payee';
    // Bank descriptions differ in case ("WALMART" vs "Walmart").
    const key = name.toLowerCase();
    const p = by.get(key) ?? { payee: name, spent: 0, count: 0 };
    p.spent += spentBy(row);
    p.count += 1;
    by.set(key, p);
  }
  return [...by.values()]
    .filter(p => p.spent > 0)
    .sort((a, b) => b.spent - a.spent)
    .slice(0, limit);
}
