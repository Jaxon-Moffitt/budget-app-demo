import type { ImportedTransaction } from '@/simplefin/normalize';

import { planImport, type ExistingTransaction } from '../match';

function bank(overrides: Partial<ImportedTransaction>): ImportedTransaction {
  return {
    importedId: 'b1',
    date: '2026-09-10',
    amount: -1000,
    pending: false,
    importedPayee: 'Coffee',
    notes: null,
    ...overrides,
  };
}

function row(overrides: Partial<ExistingTransaction>): ExistingTransaction {
  return { id: 'r1', date: '2026-09-10', amount: -1000, importedId: null, pending: false, ...overrides };
}

describe('planImport', () => {
  it('inserts new transactions', () => {
    const plan = planImport([], [bank({})], '2026-09-01');
    expect(plan.inserts).toHaveLength(1);
    expect(plan.updates).toEqual([]);
  });

  it('updates on an exact importedId match', () => {
    const plan = planImport([row({ importedId: 'b1', pending: true })], [bank({})], '2026-09-01');
    expect(plan.updates).toEqual([{ id: 'r1', incoming: bank({}) }]);
    expect(plan.deletes).toEqual([]);
  });

  it('matches a hand-entered transaction with the same amount nearby', () => {
    const plan = planImport([row({ date: '2026-09-08' })], [bank({})], '2026-09-01');
    expect(plan.updates.map(u => u.id)).toEqual(['r1']);
  });

  it('does not fuzzy match outside the window or on a different amount', () => {
    const plan = planImport(
      [row({ id: 'far', date: '2026-08-20' }), row({ id: 'diff', amount: -999 })],
      [bank({})],
      '2026-09-01',
    );
    expect(plan.inserts).toHaveLength(1);
  });

  it('prefers the nearest date', () => {
    const plan = planImport(
      [row({ id: 'r-far', date: '2026-09-04' }), row({ id: 'r-near', date: '2026-09-11' })],
      [bank({})],
      '2026-09-01',
    );
    expect(plan.updates.map(u => u.id)).toEqual(['r-near']);
  });

  it('does not steal a row that already belongs to another bank transaction', () => {
    const plan = planImport([row({ importedId: 'other' })], [bank({})], '2026-09-01');
    expect(plan.inserts).toHaveLength(1);
  });

  it('matches a pending row whose id changed when it posted', () => {
    const plan = planImport(
      [row({ importedId: 'pending-id', pending: true })],
      [bank({ importedId: 'posted-id' })],
      '2026-09-01',
    );
    expect(plan.updates.map(u => u.id)).toEqual(['r1']);
    expect(plan.deletes).toEqual([]);
  });

  it('deletes pending rows that dropped off the feed', () => {
    const plan = planImport(
      [row({ importedId: 'gone', pending: true, amount: -500 })],
      [],
      '2026-09-01',
    );
    expect(plan.deletes).toEqual(['r1']);
  });

  it('keeps pending rows older than the fetched range', () => {
    const plan = planImport(
      [row({ importedId: 'old', pending: true, date: '2026-08-01' })],
      [],
      '2026-09-01',
    );
    expect(plan.deletes).toEqual([]);
  });
});
