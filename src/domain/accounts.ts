/** Account kinds, in the order the edit screen lists them. Matches the accounts_type_check constraint. */
export const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'credit', label: 'Credit Card' },
  { value: 'investment', label: 'Investment' },
  { value: 'emergency_fund', label: 'Emergency Fund' },
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number]['value'];

export function accountTypeLabel(type: AccountType): string {
  return ACCOUNT_TYPES.find(t => t.value === type)?.label ?? type;
}

/** The nickname if one is set, otherwise the bank's name. */
export function accountDisplayName(account: { name: string; nickname: string | null }): string {
  return account.nickname?.trim() || account.name;
}

/** A blank nickname clears it, so the bank's name shows again. */
export function normalizeNickname(input: string): string | null {
  const trimmed = input.trim().replace(/\s+/g, ' ');
  return trimmed === '' ? null : trimmed;
}

/** Sorts by type, in ACCOUNT_TYPES order, then by the name people see. */
export function compareAccounts(
  a: { type: AccountType; name: string; nickname: string | null },
  b: { type: AccountType; name: string; nickname: string | null },
): number {
  const rank = (type: AccountType) => ACCOUNT_TYPES.findIndex(t => t.value === type);
  return rank(a.type) - rank(b.type) || accountDisplayName(a).localeCompare(accountDisplayName(b));
}

type Groupable = {
  type: AccountType;
  name: string;
  nickname: string | null;
  on_budget: boolean;
  closed: boolean;
  balance: number;
};

export type AccountTypeGroup<T> = { type: AccountType; label: string; total: number; accounts: T[] };
export type AccountBudgetGroup<T> = { title: string; total: number; types: AccountTypeGroup<T>[] };

/**
 * In budget, Off budget, then Closed; inside each, one group per type in
 * ACCOUNT_TYPES order. Empty groups are left out. Totals are in cents.
 */
export function groupAccounts<T extends Groupable>(accounts: T[]): AccountBudgetGroup<T>[] {
  const open = accounts.filter(a => !a.closed);
  const buckets: [string, T[]][] = [
    ['In budget', open.filter(a => a.on_budget)],
    ['Off budget', open.filter(a => !a.on_budget)],
    ['Closed', accounts.filter(a => a.closed)],
  ];
  return buckets
    .map(([title, members]) => {
      const types = ACCOUNT_TYPES.map(({ value, label }) => {
        const ofType = members.filter(a => a.type === value).sort(compareAccounts);
        return { type: value, label, total: sum(ofType), accounts: ofType };
      }).filter(t => t.accounts.length > 0);
      return { title, total: sum(members), types };
    })
    .filter(g => g.types.length > 0);
}

function sum(accounts: { balance: number }[]): number {
  return accounts.reduce((total, a) => total + a.balance, 0);
}
