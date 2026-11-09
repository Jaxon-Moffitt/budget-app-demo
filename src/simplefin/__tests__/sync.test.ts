import type { ImportedTransaction } from '../normalize';
import {
  guessAccountType,
  needsReauth,
  parseBackfillWindow,
  planAccountSync,
  syncWarnings,
  syncWindowStart,
  type StoredTransaction,
} from '../sync';

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

function stored(overrides: Partial<StoredTransaction>): StoredTransaction {
  return {
    id: 'r1',
    date: '2026-09-10',
    amount: -1000,
    importedId: 'b1',
    pending: false,
    importedPayee: 'Coffee',
    payeeId: 'p1',
    notes: null,
    ...overrides,
  };
}

describe('syncWindowStart', () => {
  const now = new Date('2026-10-09T12:00:00Z');

  it('asks for full history when any account has never synced', () => {
    expect(syncWindowStart(['2026-10-08T00:00:00Z', null], now)).toEqual(
      new Date('2026-08-26T12:00:00Z'),
    );
    expect(syncWindowStart([], now)).toEqual(new Date('2026-08-26T12:00:00Z'));
  });

  it('overlaps the oldest last sync by a week', () => {
    expect(syncWindowStart(['2026-10-08T00:00:00Z', '2026-10-05T00:00:00Z'], now)).toEqual(
      new Date('2026-09-28T00:00:00Z'),
    );
  });

  it('stays inside the recommended request range', () => {
    expect(syncWindowStart(['2026-01-01T00:00:00Z'], now)).toEqual(
      new Date('2026-08-26T12:00:00Z'),
    );
  });
});

describe('planAccountSync', () => {
  it('skips rows the feed already matches exactly', () => {
    const plan = planAccountSync([stored({})], [bank({})], '2026-09-01');
    expect(plan).toEqual({ inserts: [], updates: [], deletes: [] });
  });

  it('records a pending transaction posting', () => {
    const plan = planAccountSync(
      [stored({ pending: true, date: '2026-09-09', amount: -900 })],
      [bank({})],
      '2026-09-01',
    );
    expect(plan.updates).toEqual([
      { id: 'r1', changes: { date: '2026-09-10', amount: -1000, pending: false } },
    ]);
  });

  it('links a hand-entered row without overwriting its payee or notes', () => {
    const plan = planAccountSync(
      [stored({ importedId: null, importedPayee: null, notes: 'birthday', date: '2026-09-08' })],
      [bank({ notes: 'POS 1234' })],
      '2026-09-01',
    );
    expect(plan.updates).toEqual([
      {
        id: 'r1',
        changes: { date: '2026-09-10', importedId: 'b1', importedPayee: 'Coffee' },
      },
    ]);
  });

  it('fills an empty payee from the bank', () => {
    const plan = planAccountSync([stored({ payeeId: null })], [bank({})], '2026-09-01');
    expect(plan.updates).toEqual([{ id: 'r1', changes: {}, payeeName: 'Coffee' }]);
  });

  it('passes inserts and stale pending deletes through', () => {
    const plan = planAccountSync(
      [stored({ id: 'r2', importedId: 'gone', pending: true, amount: -5 })],
      [bank({})],
      '2026-09-01',
    );
    expect(plan.inserts).toEqual([bank({})]);
    expect(plan.deletes).toEqual(['r2']);
  });
});

describe('errors', () => {
  it('collects both error formats without repeats', () => {
    expect(
      syncWarnings({
        errlist: [{ code: 'con.auth', msg: 'Chase needs attention' }],
        errors: ['Chase needs attention', 'Too many requests'],
      }),
    ).toEqual(['Chase needs attention', 'Too many requests']);
  });

  it('spots a bank login that needs re-auth', () => {
    expect(needsReauth({ errlist: [{ code: 'con.auth', msg: '' }] })).toBe(true);
    expect(needsReauth({ errlist: [{ code: 'act.failed', msg: '' }] })).toBe(false);
  });
});

it('guesses a card from a negative balance', () => {
  expect(guessAccountType(-5000)).toBe('credit');
  expect(guessAccountType(0)).toBe('checking');
});

describe('parseBackfillWindow', () => {
  const now = new Date('2026-10-09T12:00:00Z');

  it('accepts a range one request can cover', () => {
    expect(parseBackfillWindow({ from: '2026-01-01', to: '2026-02-14' }, now)).toEqual({
      from: new Date('2026-01-01T00:00:00Z'),
      to: new Date('2026-02-14T00:00:00Z'),
    });
  });

  it('refuses bad, backwards, too long or future ranges', () => {
    expect(parseBackfillWindow({ from: 'Jan 1', to: '2026-02-01' }, now)).toHaveProperty('error');
    expect(parseBackfillWindow({ from: '2026-02-01', to: '2026-01-01' }, now)).toHaveProperty('error');
    expect(parseBackfillWindow({ from: '2026-01-01', to: '2026-03-01' }, now)).toHaveProperty('error');
    expect(parseBackfillWindow({ from: '2026-09-20', to: '2026-10-20' }, now)).toHaveProperty('error');
    expect(parseBackfillWindow(undefined, now)).toHaveProperty('error');
  });
});
