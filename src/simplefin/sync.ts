/**
 * The pure half of bank sync: which date range to ask for, and which row
 * changes turn a SimpleFIN feed into an account's transactions. The Edge
 * Function in supabase/functions does the I/O around it.
 */
import { planImport, type ExistingTransaction } from '../domain/match.ts';
import type { Cents } from '../domain/money.ts';
import type { ImportedTransaction } from './normalize.ts';
import type { SimpleFinAccountSet } from './types.ts';

/** Re-fetch this far behind the last sync so late-posting transactions aren't missed. */
export const SYNC_OVERLAP_DAYS = 7;
/**
 * The Bridge documents a 90-day cap per request, but its live responses warn
 * past 45 days ("In the future, this may be capped"). Stay a day inside that.
 */
export const MAX_HISTORY_DAYS = 44;

const DAY_MS = 86_400_000;

/**
 * One request covers every account, so start from the account that is most
 * behind. An account that has never synced gets the full history.
 */
export function syncWindowStart(lastSyncedAt: (string | null)[], now: Date): Date {
  const earliest = now.getTime() - MAX_HISTORY_DAYS * DAY_MS;
  if (lastSyncedAt.length === 0 || lastSyncedAt.includes(null)) return new Date(earliest);
  const oldest = Math.min(...lastSyncedAt.map(t => Date.parse(t as string)));
  return new Date(Math.max(earliest, oldest - SYNC_OVERLAP_DAYS * DAY_MS));
}

/** A transaction row as stored, with the fields a sync may fill in. */
export type StoredTransaction = ExistingTransaction & {
  importedPayee: string | null;
  payeeId: string | null;
  notes: string | null;
};

export type TransactionChanges = Partial<{
  date: string;
  amount: Cents;
  pending: boolean;
  importedId: string;
  importedPayee: string;
  notes: string;
}>;

export type RowUpdate = {
  id: string;
  changes: TransactionChanges;
  /** Set when the row has no payee yet, so the bank's payee name fills it. */
  payeeName?: string;
};

export type AccountSyncPlan = {
  inserts: ImportedTransaction[];
  updates: RowUpdate[];
  deletes: string[];
};

/**
 * Runs the import matcher, then keeps only the updates that change something,
 * since most of a feed overlaps rows already stored. The bank's facts (date,
 * amount, pending, ids) win; what a person typed (payee, notes) is kept and
 * only filled in where it's empty.
 */
export function planAccountSync(
  stored: StoredTransaction[],
  incoming: ImportedTransaction[],
  fetchedFrom: string,
): AccountSyncPlan {
  const plan = planImport(stored, incoming, fetchedFrom);
  const byId = new Map(stored.map(row => [row.id, row]));
  const updates: RowUpdate[] = [];

  for (const { id, incoming: txn } of plan.updates) {
    const row = byId.get(id) as StoredTransaction;
    const changes: TransactionChanges = {};
    if (row.date !== txn.date) changes.date = txn.date;
    if (row.amount !== txn.amount) changes.amount = txn.amount;
    if (row.pending !== txn.pending) changes.pending = txn.pending;
    if (row.importedId !== txn.importedId) changes.importedId = txn.importedId;
    if (row.importedPayee !== txn.importedPayee) changes.importedPayee = txn.importedPayee;
    if (row.notes === null && txn.notes !== null) changes.notes = txn.notes;
    const payeeName = row.payeeId === null && txn.importedPayee ? txn.importedPayee : undefined;

    if (Object.keys(changes).length > 0 || payeeName) {
      updates.push(payeeName ? { id, changes, payeeName } : { id, changes });
    }
  }

  return { inserts: plan.inserts, updates, deletes: plan.deletes };
}

/** Messages the Bridge wants shown to people, from both error formats. */
export function syncWarnings(set: Pick<SimpleFinAccountSet, 'errlist' | 'errors'>): string[] {
  return [...new Set([...set.errlist.map(e => e.msg), ...set.errors])];
}

/** True when a bank login needs someone to sign in again at the Bridge. */
export function needsReauth(set: Pick<SimpleFinAccountSet, 'errlist'>): boolean {
  return set.errlist.some(e => e.code === 'con.auth' || e.code === 'gen.auth');
}

/** SimpleFIN doesn't say what kind an account is; a negative balance is usually a card. */
export function guessAccountType(balance: Cents): 'checking' | 'credit' {
  return balance < 0 ? 'credit' : 'checking';
}

/**
 * Checks a requested backfill range: "YYYY-MM-DD" dates, `to` exclusive, no
 * longer than one Bridge request allows, and not reaching into the future.
 * Returns the range or a reason it was refused.
 */
export function parseBackfillWindow(
  input: unknown,
  now: Date,
): { from: Date; to: Date } | { error: string } {
  const { from, to } = (input ?? {}) as { from?: unknown; to?: unknown };
  const pattern = /^\d{4}-\d{2}-\d{2}$/;
  if (typeof from !== 'string' || typeof to !== 'string' || !pattern.test(from) || !pattern.test(to)) {
    return { error: 'backfill needs from and to as "YYYY-MM-DD"' };
  }
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    return { error: 'backfill from must be a real date before to' };
  }
  if (end.getTime() - start.getTime() > MAX_HISTORY_DAYS * DAY_MS) {
    return { error: `backfill ranges are at most ${MAX_HISTORY_DAYS} days` };
  }
  if (end > now) {
    return { error: 'backfill can’t reach past today; regular syncs cover recent days' };
  }
  return { from: start, to: end };
}
