import { computeBudget } from '@/domain/budget';
import { buildBudgetInput, type ActivityRow, type AssignedRow } from '@/domain/budget-data';
import { createDemoClient, demoTables, resetDemo } from '../db';

const client = createDemoClient();

async function budgetFor(month: string) {
  const household = (await client.from('households').select('id, name, budget_start, household_members(count)').maybeSingle()).data;
  const groups = (await client.from('envelope_groups').select('id, name, hidden, sort_order, envelopes(id, group_id, name, target, starting_balance, linked_account_id, hidden, sort_order)')).data;
  const activity = (await client.rpc('budget_activity', { start_month: household.budget_start })).data as ActivityRow[];
  const assigned = (await client.from('budget_months').select('month, envelope_id, assigned').gte('month', household.budget_start)).data as AssignedRow[];
  const envelopes = groups.flatMap((g: { envelopes: { id: string; starting_balance: number }[] }) => g.envelopes);
  const months = computeBudget(buildBudgetInput({ envelopes, start: household.budget_start, through: month, activity, assigned }));
  return { household, months, last: months[months.length - 1] };
}

function onBudgetCash() {
  const t = demoTables();
  const onBudget = new Set(t.accounts.filter(a => a.on_budget).map(a => a.id));
  return t.transactions.filter(x => onBudget.has(x.account_id) && !x.parent_id).reduce((s, x) => s + x.amount, 0);
}

describe.each(['2026-11-20', '2026-12-01', '2027-01-31', '2026-02-28'])('demo data on %s', today => {
  beforeEach(() => resetDemo(new Date(`${today}T12:00:00`)));

  it('balances: envelopes plus Ready to assign equal the cash in budget accounts', async () => {
    const { last, household } = await budgetFor(today.slice(0, 7));
    expect(household.household_members).toEqual([{ count: 2 }]);
    const inEnvelopes = Object.values(last.envelopes).reduce((s, e) => s + e.balance, 0);
    expect(inEnvelopes + last.readyToAssign).toBe(onBudgetCash());
    expect(last.readyToAssign).toBeGreaterThan(0);
  });

  it('keeps savings envelopes in step with their accounts', async () => {
    const { last } = await budgetFor(today.slice(0, 7));
    const balance = (id: string) =>
      demoTables().transactions.filter(t => t.account_id === id && !t.parent_id).reduce((s, t) => s + t.amount, 0);
    // Emergency fund and Travel fund each live in their own savings account.
    expect(last.envelopes.ef.balance).toBe(balance('sav'));
    expect(last.envelopes.travel.balance).toBe(balance('trv'));
  });
});

describe('the app’s queries', () => {
  beforeEach(() => resetDemo(new Date('2026-11-20T12:00:00')));

  it('lists To review the way the Transactions tab asks', async () => {
    const { data, error } = await client
      .from('transactions')
      .select('id, date, amount, kind, payee:payees(name), account:accounts!inner(name, nickname, on_budget), envelope:envelopes(name), category:categories(name)')
      .is('parent_id', null)
      .gte('date', '2026-10-01')
      .is('kind', null)
      .is('transfer_id', null)
      .eq('is_parent', false)
      .eq('account.on_budget', true)
      .or('imported_id.is.null,imported_id.neq.starting-balance')
      .order('date', { ascending: false })
      .order('id')
      .range(0, 99);
    expect(error).toBeNull();
    expect(data.length).toBe(3);
    expect(data.every((t: { account: { on_budget: boolean } }) => t.account.on_budget)).toBe(true);
    expect(data[0].date >= data[1].date).toBe(true);
  });

  it('shows the overspent Gifts envelope this month', async () => {
    const { last } = await budgetFor('2026-11');
    expect(last.envelopes.gifts.balance).toBeLessThan(0);
  });

  it('pairs every seeded transfer both ways', () => {
    const t = demoTables().transactions;
    for (const row of t.filter(x => x.transfer_id)) {
      expect(t.find(x => x.id === row.transfer_id)?.transfer_id).toBe(row.id);
    }
  });

  it('refuses spending without an envelope, like the database', async () => {
    const id = demoTables().transactions.find(t => t.kind === null && t.account_id === 'card')!.id;
    const { error } = await client.from('transactions').update({ kind: 'spending' }).eq('id', id);
    expect(error?.message).toMatch(/envelope/);
  });

  it('files a new transaction by the rules', async () => {
    await client.from('transactions').insert({ household_id: 'h1', account_id: 'card', date: '2026-11-19', amount: -4100, imported_payee: 'SHELL OIL 123' });
    const row = demoTables().transactions.find(t => t.imported_payee === 'SHELL OIL 123');
    expect(row).toMatchObject({ kind: 'spending', envelope_id: 'fts', category_id: 'gas' });
  });

  it('moves money between envelopes in one upsert', async () => {
    await client.from('budget_months').upsert(
      [
        { household_id: 'h1', month: '2026-11', envelope_id: 'fts', assigned: 50000 },
        { household_id: 'h1', month: '2026-11', envelope_id: 'gifts', assigned: 10000 },
      ],
      { onConflict: 'household_id,month,envelope_id' },
    );
    const { last } = await budgetFor('2026-11');
    expect(last.envelopes.gifts.assigned).toBe(10000);
    expect(last.envelopes.fts.assigned).toBe(50000);
  });

  it('splits a transaction and keeps the total', async () => {
    const parent = demoTables().transactions.find(t => t.imported_payee === 'HOME DEPOT #0412')!;
    const { error } = await client.rpc('save_split', {
      parent: parent.id,
      parts: [
        { amount: -3000, envelope_id: 'fts', category_id: 'household', notes: null },
        { amount: -2630, envelope_id: 'gifts', category_id: null, notes: null },
      ],
    });
    expect(error).toBeNull();
    expect(demoTables().transactions.filter(t => t.parent_id === parent.id)).toHaveLength(2);
    const { last } = await budgetFor('2026-11');
    const inEnvelopes = Object.values(last.envelopes).reduce((s, e) => s + e.balance, 0);
    expect(inEnvelopes + last.readyToAssign).toBe(onBudgetCash());
  });
});
