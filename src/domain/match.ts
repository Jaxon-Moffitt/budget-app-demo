/**
 * Decides how a batch of bank transactions lands in an account, modeled on
 * Actual Budget's matchTransactions (packages/loot-core/src/server/accounts/sync.ts):
 *
 *  1. Exact match on importedId → update that row (e.g. pending → posted).
 *  2. Otherwise fuzzy match: same amount, date within MATCH_WINDOW_DAYS.
 *     Candidates are rows with no importedId (entered by hand), or pending
 *     rows whose importedId vanished from the feed (some banks give a posted
 *     transaction a new id). Nearest date wins; ties prefer hand-entered rows.
 *  3. Otherwise → insert.
 *
 * Pending rows inside the fetched date range that neither appeared in the
 * feed nor got matched are stale (the hold dropped off) and get deleted.
 */
import type { ImportedTransaction } from '../simplefin/normalize.ts';

import type { Cents } from './money.ts';

export const MATCH_WINDOW_DAYS = 7;

export type ExistingTransaction = {
  id: string;
  date: string;
  amount: Cents;
  importedId: string | null;
  pending: boolean;
};

export type MatchPlan = {
  inserts: ImportedTransaction[];
  updates: { id: string; incoming: ImportedTransaction }[];
  deletes: string[];
};

export function planImport(
  existing: ExistingTransaction[],
  incoming: ImportedTransaction[],
  fetchedFrom: string,
): MatchPlan {
  const plan: MatchPlan = { inserts: [], updates: [], deletes: [] };
  const byImportedId = new Map(
    existing.filter(e => e.importedId).map(e => [e.importedId as string, e]),
  );
  const incomingIds = new Set(incoming.map(t => t.importedId));
  const claimed = new Set<string>();
  const unmatched: ImportedTransaction[] = [];

  for (const txn of incoming) {
    const exact = byImportedId.get(txn.importedId);
    if (exact) {
      claimed.add(exact.id);
      plan.updates.push({ id: exact.id, incoming: txn });
    } else {
      unmatched.push(txn);
    }
  }

  for (const txn of unmatched) {
    const candidates = existing
      .filter(
        e =>
          !claimed.has(e.id) &&
          e.amount === txn.amount &&
          dayDistance(e.date, txn.date) <= MATCH_WINDOW_DAYS &&
          (e.importedId === null || (e.pending && !incomingIds.has(e.importedId))),
      )
      .sort(
        (a, b) =>
          dayDistance(a.date, txn.date) - dayDistance(b.date, txn.date) ||
          Number(a.importedId !== null) - Number(b.importedId !== null),
      );

    const match = candidates[0];
    if (match) {
      claimed.add(match.id);
      plan.updates.push({ id: match.id, incoming: txn });
    } else {
      plan.inserts.push(txn);
    }
  }

  for (const e of existing) {
    if (
      e.pending &&
      e.importedId !== null &&
      !claimed.has(e.id) &&
      !incomingIds.has(e.importedId) &&
      e.date >= fetchedFrom
    ) {
      plan.deletes.push(e.id);
    }
  }

  return plan;
}

function dayDistance(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
}
