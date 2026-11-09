import { parseAmount, type Cents } from '../domain/money.ts';

import type { SimpleFinTransaction } from './types.ts';

/** A bank transaction in the app's own terms, ready for matching. */
export type ImportedTransaction = {
  importedId: string;
  /** "YYYY-MM-DD" */
  date: string;
  amount: Cents;
  pending: boolean;
  /** Raw payee text from the bank, before rules rename it. */
  importedPayee: string;
  notes: string | null;
};

export function normalizeTransaction(txn: SimpleFinTransaction): ImportedTransaction {
  const pending = txn.pending ?? txn.posted === 0;
  // Pending transactions have no posted date yet, so use when it happened.
  const timestamp = pending || !txn.posted ? (txn.transacted_at ?? txn.posted) : txn.posted;
  const payee = txn.payee?.trim() || txn.description.trim();
  const notes = txn.payee?.trim() && txn.description.trim() !== payee ? txn.description.trim() : null;

  return {
    importedId: txn.id,
    date: unixToDate(timestamp),
    amount: parseAmount(txn.amount),
    pending,
    importedPayee: payee,
    notes: notes || txn.memo?.trim() || null,
  };
}

function unixToDate(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}
