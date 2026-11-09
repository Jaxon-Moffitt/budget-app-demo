import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { AccountType } from '@/domain/accounts';
import type { Cents } from '@/domain/money';
import { addMonths } from '@/domain/month';
import { TRANSFER_WINDOW_DAYS, type TransactionKind } from '@/domain/transactions';
import { supabase } from '@/lib/supabase';

export type Account = {
  id: string;
  name: string;
  nickname: string | null;
  type: AccountType;
  on_budget: boolean;
  closed: boolean;
  /** Null for accounts added by hand rather than linked through SimpleFIN. */
  sfin_account_id: string | null;
  sfin_org_name: string | null;
  balance_current: Cents | null;
  last_synced_at: string | null;
  /** What to show: the bank's balance when linked, else the sum of transactions. */
  balance: Cents;
};

export type Transaction = {
  id: string;
  date: string;
  amount: Cents;
  pending: boolean;
  notes: string | null;
  imported_payee: string | null;
  payee: { name: string } | null;
  account: { name: string; nickname: string | null; on_budget: boolean } | null;
  kind: TransactionKind | null;
  envelope: { name: string } | null;
  category: { name: string } | null;
  imported_id: string | null;
  is_parent: boolean;
  transfer_id: string | null;
  /** The other side's account, for transfers. Filled in by a second query. */
  transferAccount?: Omit<AccountRef, 'id'> | null;
};

export type AccountRef = { id: string; name: string; nickname: string | null; on_budget: boolean };

/** One transaction with what the edit screen needs. */
export type TransactionDetail = {
  id: string;
  household_id: string;
  account_id: string;
  date: string;
  amount: Cents;
  pending: boolean;
  notes: string | null;
  imported_id: string | null;
  imported_payee: string | null;
  kind: TransactionKind | null;
  envelope_id: string | null;
  category_id: string | null;
  is_parent: boolean;
  parent_id: string | null;
  transfer_id: string | null;
  payee: { name: string } | null;
  account: { name: string; nickname: string | null; on_budget: boolean } | null;
  /** The other side, for transfers. */
  transfer: { id: string; date: string; imported_id: string | null; account: AccountRef } | null;
};

export type SplitPart = {
  id: string;
  amount: Cents;
  envelope_id: string | null;
  category_id: string | null;
  notes: string | null;
};
export type Payee = { id: string; name: string };

/** Holds money. */
export type Envelope = {
  id: string;
  group_id: string;
  name: string;
  /** Monthly target in cents. */
  target: Cents | null;
  /** What it held when budgeting started, taken from the opening Ready to assign. */
  starting_balance: Cents;
  /** The savings account this envelope's money sits in, for display only. */
  linked_account_id: string | null;
  hidden: boolean;
  sort_order: number;
};
export type EnvelopeGroup = {
  id: string;
  name: string;
  hidden: boolean;
  sort_order: number;
  envelopes: Envelope[];
};

/** A label for what a transaction was for, for analytics. */
export type Category = {
  id: string;
  name: string;
  /** Picking this category fills in this envelope. */
  default_envelope_id: string | null;
  hidden: boolean;
  sort_order: number;
};

/** "review": budget-account transactions nobody has given a type yet. */
export type TransactionFilter = 'all' | 'review';

export type Household = {
  id: string;
  name: string;
  memberCount: number;
  /** First budgeted month, "YYYY-MM", or null until budgeting is set up. */
  budgetStart: string | null;
};

const PAGE_SIZE = 100;

/** The caller's household, or null if they haven't created or joined one. */
export function useHousehold(enabled: boolean) {
  return useQuery({
    queryKey: ['household'],
    enabled,
    async queryFn(): Promise<Household | null> {
      const { data, error } = await supabase
        .from('households')
        .select('id, name, budget_start, household_members(count)')
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const [members] = data.household_members as { count: number }[];
      return {
        id: data.id,
        name: data.name,
        memberCount: members?.count ?? 0,
        budgetStart: data.budget_start,
      };
    },
  });
}

/** Every account, closed ones included; screens decide what to show. */
export function useAccounts() {
  return useQuery({
    queryKey: ['accounts'],
    async queryFn(): Promise<Account[]> {
      const [accounts, balances] = await Promise.all([
        supabase
          .from('accounts')
          .select(
            'id, name, nickname, type, on_budget, closed, sfin_account_id, sfin_org_name, balance_current, last_synced_at',
          )
          .order('sort_order')
          .order('name'),
        supabase.rpc('account_balances'),
      ]);
      if (accounts.error) throw accounts.error;
      if (balances.error) throw balances.error;
      const ledger = new Map(
        (balances.data as { account_id: string; balance: Cents }[]).map(b => [b.account_id, b.balance]),
      );
      return (accounts.data as Omit<Account, 'balance'>[]).map(a => ({
        ...a,
        balance:
          a.sfin_account_id !== null && a.balance_current !== null
            ? a.balance_current
            : (ledger.get(a.id) ?? 0),
      }));
    },
  });
}

export type NewAccount = {
  name: string;
  type: AccountType;
  onBudget: boolean;
  startingBalance: Cents;
  /** "YYYY-MM-DD", the day the starting balance applies to. */
  startingDate: string;
};

/** Adds an account by hand, with its opening balance, in one database call. */
export function useCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    async mutationFn(account: NewAccount) {
      const { data, error } = await supabase.rpc('create_account', {
        account_name: account.name,
        account_type: account.type,
        in_budget: account.onBudget,
        starting_balance: account.startingBalance,
        starting_date: account.startingDate,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['accounts'] }),
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      ]),
  });
}

export type AccountChanges = Partial<Pick<Account, 'nickname' | 'type' | 'on_budget' | 'closed'>>;

export function useUpdateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    async mutationFn({ id, changes }: { id: string; changes: AccountChanges }) {
      const { error } = await supabase.from('accounts').update(changes).eq('id', id);
      if (error) throw error;
    },
    // Transactions show account names too.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['accounts'] }),
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      ]),
  });
}

/**
 * Newest first, a page at a time. Split children are left out until splits
 * exist. "uncategorized" skips off-budget accounts, which don't use categories.
 */
export function useTransactions(filter: TransactionFilter = 'all', since: string | null = null) {
  return useInfiniteQuery({
    queryKey: ['transactions', 'list', filter, since],
    initialPageParam: 0,
    async queryFn({ pageParam }) {
      let query = supabase
        .from('transactions')
        .select(
          'id, date, amount, pending, notes, imported_id, imported_payee, kind, is_parent, transfer_id, payee:payees(name), account:accounts!inner(name, nickname, on_budget), envelope:envelopes(name), category:categories(name)',
        )
        .is('parent_id', null);
      // Rows before the budget's first month are archived: kept for history
      // and balances, but not shown day to day.
      if (since) query = query.gte('date', since);
      if (filter === 'review') {
        // Starting Balance rows and off-budget accounts never need a type.
        query = query
          .is('kind', null)
          .is('transfer_id', null)
          .eq('is_parent', false)
          .eq('account.on_budget', true)
          .or('imported_id.is.null,imported_id.neq.starting-balance');
      }
      const { data, error } = await query
        .order('date', { ascending: false })
        .order('id')
        .range(pageParam, pageParam + PAGE_SIZE - 1);
      if (error) throw error;
      const rows = data as unknown as Transaction[];

      // PostgREST doesn't follow transactions' references to themselves, so
      // the other side of each transfer comes from one more query.
      const transferIds = rows.flatMap(r => (r.transfer_id ? [r.transfer_id] : []));
      if (transferIds.length > 0) {
        const others = await supabase
          .from('transactions')
          .select('id, account:accounts(name, nickname, on_budget)')
          .in('id', transferIds);
        if (others.error) throw others.error;
        const byId = new Map(
          (others.data as unknown as { id: string; account: Transaction['transferAccount'] }[]).map(
            o => [o.id, o.account],
          ),
        );
        for (const r of rows) if (r.transfer_id) r.transferAccount = byId.get(r.transfer_id) ?? null;
      }
      return rows;
    },
    getNextPageParam: (last, pages) =>
      last.length < PAGE_SIZE ? undefined : pages.length * PAGE_SIZE,
  });
}

export function useTransaction(id: string) {
  return useQuery({
    queryKey: ['transactions', 'one', id],
    async queryFn() {
      const { data, error } = await supabase
        .from('transactions')
        .select(
          'id, household_id, account_id, date, amount, pending, notes, imported_id, imported_payee, kind, envelope_id, category_id, is_parent, parent_id, transfer_id, payee:payees(name), account:accounts(name, nickname, on_budget)',
        )
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const detail = { ...(data as unknown as Omit<TransactionDetail, 'transfer'>), transfer: null };
      if (detail.transfer_id) {
        const other = await supabase
          .from('transactions')
          .select('id, date, imported_id, account:accounts(id, name, nickname, on_budget)')
          .eq('id', detail.transfer_id)
          .maybeSingle();
        if (other.error) throw other.error;
        return { ...detail, transfer: other.data as unknown as TransactionDetail['transfer'] };
      }
      return detail as TransactionDetail;
    },
  });
}

/** One row in an envelope's list for the month. */
export type EnvelopeTransaction = {
  id: string;
  /** The transaction to open: the split itself for a split part. */
  openId: string;
  date: string;
  amount: Cents;
  payee: string;
  account: string | null;
  category: string | null;
  isSplitPart: boolean;
  isInvestment: boolean;
  isIncome: boolean;
};

/**
 * Everything spent, invested or received in one envelope in one month, newest
 * first. Split parts are included (they carry the envelope) and named
 * after their parent's payee, since parts have no payee of their own.
 */
export function useEnvelopeTransactions(envelopeId: string, month: string) {
  return useQuery({
    queryKey: ['transactions', 'envelope', envelopeId, month],
    async queryFn(): Promise<EnvelopeTransaction[]> {
      const { data, error } = await supabase
        .from('transactions')
        .select(
          'id, date, amount, kind, parent_id, imported_payee, payee:payees(name), account:accounts(name, nickname), category:categories(name)',
        )
        .eq('envelope_id', envelopeId)
        .gte('date', `${month}-01`)
        .lt('date', `${addMonths(month, 1)}-01`)
        .order('date', { ascending: false })
        .order('id');
      if (error) throw error;
      type Row = {
        id: string;
        date: string;
        amount: Cents;
        kind: TransactionKind | null;
        parent_id: string | null;
        imported_payee: string | null;
        payee: { name: string } | null;
        account: { name: string; nickname: string | null } | null;
        category: { name: string } | null;
      };
      const rows = data as unknown as Row[];

      const parentIds = [...new Set(rows.flatMap(r => (r.parent_id ? [r.parent_id] : [])))];
      const parents = new Map<string, string | null>();
      if (parentIds.length > 0) {
        const p = await supabase
          .from('transactions')
          .select('id, imported_payee, payee:payees(name)')
          .in('id', parentIds);
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
        payee:
          (r.parent_id ? parents.get(r.parent_id) : (r.payee?.name ?? r.imported_payee)) ?? 'No payee',
        account: r.account ? (r.account.nickname ?? r.account.name) : null,
        category: r.category?.name ?? null,
        isSplitPart: r.parent_id !== null,
        isInvestment: r.kind === 'investment',
        isIncome: r.kind === 'income',
      }));
    },
  });
}

/** A split transaction's parts. */
export function useSplitParts(parentId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['transactions', 'parts', parentId],
    enabled,
    async queryFn() {
      const { data, error } = await supabase
        .from('transactions')
        .select('id, amount, envelope_id, category_id, notes')
        .eq('parent_id', parentId)
        .order('amount');
      if (error) throw error;
      return data as SplitPart[];
    },
  });
}

/**
 * Transactions that could be the other side of a transfer: the opposite
 * amount, in another account, within TRANSFER_WINDOW_DAYS, and not already
 * a transfer or part of a split. Ranked nearest date first by the caller.
 */
export function useTransferCandidates(txn: TransactionDetail) {
  return useQuery({
    queryKey: ['transactions', 'transfer-candidates', txn.id],
    async queryFn() {
      const shift = (days: number) => {
        const d = new Date(`${txn.date}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + days);
        return d.toISOString().slice(0, 10);
      };
      const { data, error } = await supabase
        .from('transactions')
        .select(
          'id, date, amount, account_id, imported_payee, payee:payees(name), account:accounts(id, name, nickname, on_budget)',
        )
        .eq('amount', -txn.amount)
        .neq('account_id', txn.account_id)
        .is('transfer_id', null)
        .is('parent_id', null)
        .eq('is_parent', false)
        .gte('date', shift(-TRANSFER_WINDOW_DAYS))
        .lte('date', shift(TRANSFER_WINDOW_DAYS));
      if (error) throw error;
      return data as unknown as {
        id: string;
        date: string;
        amount: Cents;
        account_id: string;
        imported_payee: string | null;
        payee: { name: string } | null;
        account: AccountRef;
      }[];
    },
  });
}

/** Every payee name, for suggestions while typing. */
export function usePayees() {
  return useQuery({
    queryKey: ['payees'],
    async queryFn() {
      const { data, error } = await supabase.from('payees').select('id, name').order('name');
      if (error) throw error;
      return (data as Payee[]).filter(p => p.name !== 'Starting Balance');
    },
    staleTime: 5 * 60_000,
  });
}

export type PayeeChoice = {
  kind: TransactionKind;
  envelope_id: string | null;
  category_id: string | null;
};

/** How a payee's most recent reviewed transaction was filed, if any. */
export async function lastChoiceForPayee(payeeId: string): Promise<PayeeChoice | null> {
  const { data, error } = await supabase
    .from('transactions')
    .select('kind, envelope_id, category_id')
    .eq('payee_id', payeeId)
    .not('kind', 'is', null)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as PayeeChoice | null) ?? null;
}

/**
 * Envelope groups in budget order, each with its envelopes, hidden ones
 * included: their money still counts in the budget and old transactions
 * still name them. Pickers leave them out (see visibleGroups).
 */
export function useEnvelopes() {
  return useQuery({
    queryKey: ['envelopes'],
    async queryFn() {
      const { data, error } = await supabase
        .from('envelope_groups')
        .select(
          'id, name, hidden, sort_order, envelopes(id, group_id, name, target, starting_balance, linked_account_id, hidden, sort_order)',
        )
        .order('sort_order')
        .order('name')
        .order('sort_order', { referencedTable: 'envelopes' })
        .order('name', { referencedTable: 'envelopes' });
      if (error) throw error;
      return data as EnvelopeGroup[];
    },
    staleTime: 5 * 60_000,
  });
}

/** Every category, hidden ones included, in their order. */
export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    async queryFn() {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, default_envelope_id, hidden, sort_order')
        .order('sort_order')
        .order('name');
      if (error) throw error;
      return data as Category[];
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * What the forms edit. For bank transactions the account, date and amount
 * aren't sent. envelopeId must be null unless the kind uses an envelope
 * (the database checks this).
 */
export type TransactionFields = {
  accountId: string;
  date: string;
  amount: Cents;
  payeeName: string;
  kind: TransactionKind | null;
  envelopeId: string | null;
  categoryId: string | null;
  notes: string | null;
};

/** Finds or creates the payee row for a name; a blank name means no payee. */
async function payeeIdFor(householdId: string, name: string): Promise<string | null> {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  const upsert = await supabase
    .from('payees')
    .upsert({ household_id: householdId, name: trimmed }, { onConflict: 'household_id,name', ignoreDuplicates: true });
  if (upsert.error) throw upsert.error;
  const { data, error } = await supabase
    .from('payees')
    .select('id')
    .eq('household_id', householdId)
    .eq('name', trimmed)
    .single();
  if (error) throw error;
  return data.id as string;
}

function useInvalidateMoney() {
  const queryClient = useQueryClient();
  // Balances of manual accounts and budget activity are sums of
  // transactions, so they refresh too, and a save may have added a payee.
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['accounts'] }),
      queryClient.invalidateQueries({ queryKey: ['payees'] }),
      queryClient.invalidateQueries({ queryKey: ['budget'] }),
    ]);
}

export function useCreateTransaction() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    async mutationFn({
      householdId,
      userId,
      fields,
    }: {
      householdId: string;
      userId: string;
      fields: TransactionFields;
    }) {
      const payeeId = await payeeIdFor(householdId, fields.payeeName);
      const { error } = await supabase.from('transactions').insert({
        household_id: householdId,
        account_id: fields.accountId,
        date: fields.date,
        amount: fields.amount,
        payee_id: payeeId,
        kind: fields.kind,
        envelope_id: fields.envelopeId,
        category_id: fields.categoryId,
        notes: fields.notes,
        created_by: userId,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateTransaction() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    async mutationFn({
      transaction,
      fields,
    }: {
      transaction: TransactionDetail;
      fields: TransactionFields;
    }) {
      const payeeId = await payeeIdFor(transaction.household_id, fields.payeeName);
      const bankFacts =
        transaction.imported_id === null
          ? { account_id: fields.accountId, date: fields.date, amount: fields.amount }
          : {};
      const { error } = await supabase
        .from('transactions')
        .update({
          ...bankFacts,
          payee_id: payeeId,
          kind: fields.kind,
          envelope_id: fields.envelopeId,
          category_id: fields.categoryId,
          notes: fields.notes,
        })
        .eq('id', transaction.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/**
 * Only hand-entered transactions can be deleted; sync would bring bank ones
 * back. A hand-entered transfer's other side goes too, if it was also
 * entered by hand.
 */
export function useDeleteTransaction() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    async mutationFn({ id, transferId }: { id: string; transferId: string | null }) {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .in('id', transferId ? [id, transferId] : [id])
        .is('imported_id', null);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

function useRpc<Args>(fn: string) {
  const invalidate = useInvalidateMoney();
  return useMutation({
    async mutationFn(args: Args) {
      const { error } = await supabase.rpc(fn, args as object);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export const useLinkTransfer = () =>
  useRpc<{ first_id: string; second_id: string; budget_envelope: string | null }>('link_transfer');
export const useUnlinkTransfer = () => useRpc<{ transaction_id: string }>('unlink_transfer');
export const useCreateTransfer = () =>
  useRpc<{
    from_account: string;
    to_account: string;
    amount: Cents;
    transfer_date: string;
    budget_envelope: string | null;
    transfer_notes: string | null;
  }>('create_transfer');
export const useSaveSplit = () =>
  useRpc<{
    parent: string;
    parts: { amount: Cents; envelope_id: string; category_id: string | null; notes: string | null }[];
  }>('save_split');
export const useRemoveSplit = () => useRpc<{ parent: string }>('remove_split');

/**
 * Pull-to-refresh: ask the server to sync with the bank (it skips quietly if
 * it synced within the hour), then reload. Realtime also delivers the rows,
 * but refetching makes the spinner end when the data is actually here.
 */
export function useBankRefresh() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setRefreshing(true);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke<{
      status: string;
      message: string | null;
    }>('simplefin-sync');
    if (invokeError) setError('Could not reach the bank sync');
    else if (data?.status === 'error') setError(data.message);
    await queryClient.invalidateQueries();
    setRefreshing(false);
  }

  return { refreshing, refresh, error };
}
