/**
 * Estimated net worth from the accounts in the app: what's in them minus
 * what's owed on cards. Past months are worked back from today's balances
 * by undoing the transactions since.
 */
import type { AccountType } from './accounts.ts';
import type { Cents } from './money.ts';
import { addMonths, monthOf, type Month } from './month.ts';

type Balance = { id: string; type: AccountType; closed: boolean; balance: Cents };

export type NetWorthGroup = { key: 'cash' | 'savings' | 'investments' | 'credit'; label: string; total: Cents; count: number };

const GROUPS: { key: NetWorthGroup['key']; label: string; types: AccountType[] }[] = [
  { key: 'cash', label: 'Cash', types: ['checking'] },
  { key: 'savings', label: 'Savings', types: ['savings', 'emergency_fund'] },
  { key: 'investments', label: 'Investments', types: ['investment'] },
  { key: 'credit', label: 'Credit cards', types: ['credit'] },
];

export type NetWorth = { total: Cents; assets: Cents; debts: Cents; groups: NetWorthGroup[] };

/**
 * Open accounts only. A positive balance on a card (a refund) counts as an
 * asset, and an overdrawn account as a debt, so assets and debts are
 * worked out per account rather than per type.
 */
export function netWorth(accounts: Balance[]): NetWorth {
  const open = accounts.filter(a => !a.closed);
  const groups = GROUPS.map(g => {
    const members = open.filter(a => g.types.includes(a.type));
    return { key: g.key, label: g.label, total: members.reduce((s, a) => s + a.balance, 0), count: members.length };
  }).filter(g => g.count > 0);
  const assets = open.reduce((s, a) => s + Math.max(0, a.balance), 0);
  const debts = open.reduce((s, a) => s + Math.min(0, a.balance), 0);
  return { total: assets + debts, assets, debts, groups };
}

/**
 * Net worth at the end of each month given (the last one is today). Each
 * open account's month-end balance is today's balance less everything that
 * happened after that month. `activity` is every transaction (split parents,
 * not parts) in open accounts after the first month.
 */
export function netWorthByMonth(
  accounts: Balance[],
  activity: { account_id: string; date: string; amount: Cents }[],
  months: Month[],
): { month: Month; total: Cents }[] {
  const open = new Set(accounts.filter(a => !a.closed).map(a => a.id));
  const today = accounts.filter(a => !a.closed).reduce((s, a) => s + a.balance, 0);
  // How much each month changed things, so later months can be undone.
  const change = new Map<Month, Cents>();
  for (const t of activity) {
    if (!open.has(t.account_id)) continue;
    const m = monthOf(t.date);
    change.set(m, (change.get(m) ?? 0) + t.amount);
  }
  const last = months[months.length - 1];
  return months.map(month => {
    let total = today;
    for (let m = addMonths(month, 1); m <= last; m = addMonths(m, 1)) total -= change.get(m) ?? 0;
    // Anything dated after the last month (future-dated rows) is undone too.
    for (const [m, c] of change) if (m > last) total -= c;
    return { month, total };
  });
}
