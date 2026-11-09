import { normalizeTransaction } from '../normalize';

describe('normalizeTransaction', () => {
  it('converts a posted transaction', () => {
    expect(
      normalizeTransaction({
        id: 't1',
        posted: 1790000000,
        amount: '-42.10',
        description: 'POS DEBIT WHOLE FOODS #123',
        payee: 'Whole Foods',
      }),
    ).toEqual({
      importedId: 't1',
      date: '2026-09-21',
      amount: -4210,
      pending: false,
      importedPayee: 'Whole Foods',
      notes: 'POS DEBIT WHOLE FOODS #123',
    });
  });

  it('uses transacted_at for pending transactions', () => {
    const result = normalizeTransaction({
      id: 't2',
      posted: 0,
      transacted_at: 1790000000,
      amount: '5.00',
      description: 'Refund',
    });
    expect(result).toMatchObject({ pending: true, date: '2026-09-21', importedPayee: 'Refund', notes: null });
  });
});
