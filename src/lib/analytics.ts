import { useQuery } from '@tanstack/react-query';

import type { AnalyticsRow } from '@/domain/analytics';
import type { Cents } from '@/domain/money';
import type { ChargeRow } from '@/domain/recurring';
import { addMonths, type Month } from '@/domain/month';
import { supabase } from '@/lib/supabase';

/** PostgREST returns at most this many rows per request. */
const PAGE = 1000;

/**
 * Filed money in and out of budget accounts from the start of `from` to the
 * end of `to`: spending, income and investments. Split parts count (they
 * carry the category); split parents, transfers, Starting Balance rows and
 * rows still to review don't. Keyed under 'transactions' so editing one
 * refreshes the charts.
 */
export function useAnalyticsRows(from: Month, to: Month) {
  return useQuery({
    queryKey: ['transactions', 'analytics', from, to],
    async queryFn(): Promise<AnalyticsRow[]> {
      type Row = Omit<AnalyticsRow, 'payee'> & { imported_payee: string | null; payee: { name: string } | null };
      const out: AnalyticsRow[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await supabase
          .from('transactions')
          .select('id, date, amount, kind, category_id, imported_payee, payee:payees(name), account:accounts!inner(on_budget)')
          .eq('account.on_budget', true)
          .eq('is_parent', false)
          .in('kind', ['spending', 'income', 'investment'])
          .or('imported_id.is.null,imported_id.neq.starting-balance')
          .gte('date', `${from}-01`)
          .lt('date', `${addMonths(to, 1)}-01`)
          .order('date')
          .order('id')
          .range(offset, offset + PAGE - 1);
        if (error) throw error;
        const rows = data as unknown as Row[];
        for (const r of rows) {
          out.push({
            date: r.date,
            amount: r.amount,
            kind: r.kind,
            category_id: r.category_id,
            payee: r.payee?.name ?? r.imported_payee,
          });
        }
        if (rows.length < PAGE) return out;
      }
    },
  });
}

/** Spending since `since` that has no category yet: what "Categorize transactions" counts. */
export function useUncategorizedCount(since: string | null) {
  return useQuery({
    queryKey: ['transactions', 'uncategorized-count', since],
    async queryFn(): Promise<number> {
      let query = supabase
        .from('transactions')
        .select('id, account:accounts!inner(on_budget)', { count: 'exact', head: true })
        .is('parent_id', null)
        .eq('is_parent', false)
        .eq('kind', 'spending')
        .is('category_id', null)
        .eq('account.on_budget', true);
      if (since) query = query.gte('date', since);
      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    },
  });
}

/** One row in a category's list for the month. */
export type CategoryTransaction = {
  id: string;
  /** The transaction to open: the split itself for a split part. */
  openId: string;
  date: string;
  amount: Cents;
  payee: string;
  envelope: string | null;
  account: string | null;
  isSplitPart: boolean;
};

/**
 * Spending in one category (null: no category) in one month, newest first.
 * Split parts are named after their parent's payee, since parts have none.
 */
export function useCategoryTransactions(categoryId: string | null, month: Month) {
  return useQuery({
    queryKey: ['transactions', 'category', categoryId, month],
    async queryFn(): Promise<CategoryTransaction[]> {
      let query = supabase
        .from('transactions')
        .select(
          'id, date, amount, parent_id, imported_payee, payee:payees(name), envelope:envelopes(name), account:accounts!inner(name, nickname, on_budget)',
        )
        .eq('kind', 'spending')
        .eq('is_parent', false)
        .eq('account.on_budget', true)
        .gte('date', `${month}-01`)
        .lt('date', `${addMonths(month, 1)}-01`);
      query = categoryId === null ? query.is('category_id', null) : query.eq('category_id', categoryId);
      const { data, error } = await query.order('date', { ascending: false }).order('id');
      if (error) throw error;
      type Row = {
        id: string;
        date: string;
        amount: Cents;
        parent_id: string | null;
        imported_payee: string | null;
        payee: { name: string } | null;
        envelope: { name: string } | null;
        account: { name: string; nickname: string | null } | null;
      };
      const rows = data as unknown as Row[];

      const parentIds = [...new Set(rows.flatMap(r => (r.parent_id ? [r.parent_id] : [])))];
      const parents = new Map<string, string | null>();
      if (parentIds.length > 0) {
        const p = await supabase.from('transactions').select('id, imported_payee, payee:payees(name)').in('id', parentIds);
        if (p.error) throw p.error;
        for (const parent of p.data as unknown as Pick<Row, 'id' | 'imported_payee' | 'payee'>[]) {
          parents.set(parent.id, parent.payee?.name ?? parent.imported_payee);
        }
      }

      return rows.map(r => ({
        id: r.id,
        openId: r.parent_id ?? r.id,
        date: r.date,
        amount: r.amount,
        payee: (r.parent_id ? parents.get(r.parent_id) : (r.payee?.name ?? r.imported_payee)) ?? 'No payee',
        envelope: r.envelope?.name ?? null,
        account: r.account ? (r.account.nickname ?? r.account.name) : null,
        isSplitPart: r.parent_id !== null,
      }));
    },
  });
}

/**
 * Words in bank descriptions of money moving between accounts. Unfiled rows
 * with them aren't purchases, so they can't be subscriptions.
 */
const MOVES_MONEY = /\b(transfers?|xfer|trnsfr|pmt|pymt|payments?|withdrawal|atm)\b/i;

/**
 * Money out of budget accounts since `since`, for finding subscriptions:
 * spending, plus rows nobody has filed (older history is mostly unfiled).
 * Transfers, investments and Starting Balance rows are left out.
 */
export function useChargeHistory(since: string) {
  return useQuery({
    queryKey: ['transactions', 'charges', since],
    async queryFn(): Promise<ChargeRow[]> {
      type Row = {
        date: string;
        amount: Cents;
        kind: string | null;
        imported_id: string | null;
        imported_payee: string | null;
        payee: { name: string } | null;
      };
      const out: ChargeRow[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await supabase
          .from('transactions')
          .select('id, date, amount, kind, imported_id, imported_payee, payee:payees(name), account:accounts!inner(on_budget)')
          .eq('account.on_budget', true)
          .is('parent_id', null)
          .is('transfer_id', null)
          .lt('amount', 0)
          .gte('date', since)
          .order('date')
          .order('id')
          .range(offset, offset + PAGE - 1);
        if (error) throw error;
        const rows = data as unknown as Row[];
        for (const r of rows) {
          if (r.imported_id === 'starting-balance') continue;
          if (r.kind !== null && r.kind !== 'spending') continue;
          const merchant = r.payee?.name ?? r.imported_payee;
          if (!merchant) continue;
          if (r.kind === null && MOVES_MONEY.test(`${merchant} ${r.imported_payee ?? ''}`)) continue;
          out.push({ date: r.date, amount: r.amount, merchant });
        }
        if (rows.length < PAGE) return out;
      }
    },
  });
}

/**
 * Every transaction in any account from `since` on (split parents, not
 * parts), for working net worth back from today's balances.
 */
export function useAccountActivity(since: string) {
  return useQuery({
    queryKey: ['transactions', 'account-activity', since],
    async queryFn(): Promise<{ account_id: string; date: string; amount: Cents }[]> {
      const out: { account_id: string; date: string; amount: Cents }[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await supabase
          .from('transactions')
          .select('id, account_id, date, amount')
          .is('parent_id', null)
          .gte('date', since)
          .order('date')
          .order('id')
          .range(offset, offset + PAGE - 1);
        if (error) throw error;
        const rows = data as { account_id: string; date: string; amount: Cents }[];
        for (const r of rows) out.push({ account_id: r.account_id, date: r.date, amount: r.amount });
        if (rows.length < PAGE) return out;
      }
    },
  });
}
