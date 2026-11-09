/**
 * Helpers for editing transactions. Amounts are entered as a positive number
 * plus a direction, then stored signed: money out is negative.
 */
import { parseAmount, type Cents } from './money.ts';

export type Direction = 'out' | 'in';

/**
 * Rows that came from the bank feed or an import carry an imported_id. Their
 * date, amount and account are the bank's facts: sync would overwrite edits
 * to them, and the balances are reconciled against them.
 */
export function isBankTransaction(importedId: string | null): boolean {
  return importedId !== null;
}

/**
 * What a budget-account transaction is. Null means nobody has reviewed it
 * yet; its money waits in Ready to assign.
 */
export type TransactionKind = 'income' | 'spending' | 'transfer' | 'investment';

export const KIND_LABELS: Record<TransactionKind, string> = {
  spending: 'Spending',
  income: 'Income',
  transfer: 'Transfer',
  investment: 'Investment',
};

/** Spending and investments come out of an envelope; income and transfers don't. */
export function kindUsesEnvelope(kind: TransactionKind | null): boolean {
  return kind === 'spending' || kind === 'investment';
}

/**
 * Kinds that can name an envelope: spending and investments must, and
 * income may (it then stays in that envelope instead of going to Ready to
 * assign).
 */
export function kindAllowsEnvelope(kind: TransactionKind | null): boolean {
  return kind === 'spending' || kind === 'investment' || kind === 'income';
}

/** A first guess for a row nobody has reviewed: money in is income, money out is spending. */
export function suggestedKind(amount: Cents): TransactionKind {
  return amount > 0 ? 'income' : 'spending';
}

/** "-12.34" or "12.34" (ignoring a leading $ and any sign) plus a direction → signed cents. */
export function signedAmount(text: string, direction: Direction): Cents {
  const cents = Math.abs(parseAmount(text.replace(/[$\s]/g, '').replace(/^[+-]/, '')));
  return direction === 'out' ? -cents : cents;
}

/** The form's starting values for a stored amount: unsigned text and a direction. */
export function amountFields(cents: Cents): { text: string; direction: Direction } {
  const abs = Math.abs(cents);
  return {
    text: `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`,
    direction: cents < 0 ? 'out' : 'in',
  };
}

/** "YYYY-MM-DD" → a Date at local midnight that day (for the date picker). */
export function dateFromDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** How far apart (days) the two sides of a transfer can be when suggesting matches. */
export const TRANSFER_WINDOW_DAYS = 7;

/**
 * Which side of a transfer is an investment and so needs an envelope: the
 * budget side when money leaves the budget for an off-budget account.
 * Between two budget accounts (moving savings, paying a card) neither side
 * does, and money coming into the budget from outside is income.
 */
export function investmentSide(
  first: { onBudget: boolean; amount: Cents },
  second: { onBudget: boolean; amount: Cents },
): 'none' | 'first' | 'second' {
  if (first.onBudget === second.onBudget) return 'none';
  const budgetSide = first.onBudget ? first : second;
  if (budgetSide.amount >= 0) return 'none';
  return first.onBudget ? 'first' : 'second';
}

/** Possible other sides of a transfer, nearest date first. */
export function rankTransferCandidates<T extends { date: string; amount: Cents; accountId: string }>(
  txn: { date: string; amount: Cents; accountId: string },
  candidates: T[],
): T[] {
  const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
  return candidates
    .filter(
      c =>
        c.accountId !== txn.accountId &&
        c.amount === -txn.amount &&
        days(c.date, txn.date) <= TRANSFER_WINDOW_DAYS,
    )
    .sort((a, b) => days(a.date, txn.date) - days(b.date, txn.date));
}

/** What's left to assign in a split: positive or negative cents. */
export function splitRemaining(total: Cents, parts: { amount: Cents }[]): Cents {
  return total - parts.reduce((sum, p) => sum + p.amount, 0);
}

/** Why a split can't be saved yet, or null when it can. */
export function splitProblem(
  total: Cents,
  parts: { amount: Cents; envelopeId: string | null }[],
): string | null {
  if (parts.length < 2) return 'A split needs at least two parts.';
  if (parts.some(p => p.amount === 0)) return 'Each part needs an amount.';
  if (parts.some(p => p.envelopeId === null)) return 'Each part needs an envelope.';
  if (splitRemaining(total, parts) !== 0) return 'The parts must add up to the transaction.';
  return null;
}

/** Payee names for a typed prefix: starts-with matches first, then contains. */
export function suggestPayees(names: string[], typed: string, limit = 5): string[] {
  const needle = typed.trim().toLowerCase();
  if (!needle) return [];
  const starts: string[] = [];
  const contains: string[] = [];
  for (const name of names) {
    const lower = name.toLowerCase();
    if (lower === needle) continue;
    if (lower.startsWith(needle)) starts.push(name);
    else if (lower.includes(needle)) contains.push(name);
  }
  const byName = (a: string, b: string) => a.localeCompare(b);
  return [...starts.sort(byName), ...contains.sort(byName)].slice(0, limit);
}
