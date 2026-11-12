import { categoryTrend, monthTotals, spendingByCategory, topPayees, type AnalyticsRow } from '../analytics';

const row = (r: Partial<AnalyticsRow> & Pick<AnalyticsRow, 'date' | 'amount'>): AnalyticsRow => ({
  kind: 'spending',
  category_id: null,
  payee: null,
  ...r,
});

const rows: AnalyticsRow[] = [
  row({ date: '2026-10-03', amount: -5000, category_id: 'groceries', payee: 'Walmart' }),
  row({ date: '2026-11-02', amount: -8000, category_id: 'groceries', payee: 'WALMART' }),
  row({ date: '2026-11-05', amount: 1500, category_id: 'groceries', payee: 'Walmart' }), // refund
  row({ date: '2026-11-07', amount: -12000, category_id: 'dining', payee: 'Sushi House' }),
  row({ date: '2026-11-09', amount: -2446, payee: 'Target' }),
  row({ date: '2026-11-10', amount: -900, category_id: 'gifts', payee: 'Card shop' }),
  row({ date: '2026-11-11', amount: 900, category_id: 'gifts', payee: 'Card shop' }),
  row({ date: '2026-11-01', amount: 215000, kind: 'income', payee: 'Acme' }),
  row({ date: '2026-11-15', amount: -25000, kind: 'investment', payee: 'Brokerage' }),
];

describe('monthTotals', () => {
  it('sums income, spending (net of refunds) and investing per month', () => {
    expect(monthTotals(rows, ['2026-10', '2026-11', '2026-12'])).toEqual([
      { month: '2026-10', income: 0, spent: 5000, invested: 0 },
      { month: '2026-11', income: 215000, spent: 8000 - 1500 + 12000 + 2446, invested: 25000 },
      { month: '2026-12', income: 0, spent: 0, invested: 0 },
    ]);
  });
});

describe('spendingByCategory', () => {
  it('ranks categories by net spending and keeps uncategorized spending', () => {
    expect(spendingByCategory(rows, '2026-11')).toEqual([
      { categoryId: 'dining', spent: 12000, count: 1 },
      { categoryId: 'groceries', spent: 6500, count: 2 },
      { categoryId: null, spent: 2446, count: 1 },
    ]);
  });
});

describe('categoryTrend', () => {
  it('gives one category per month, zero when nothing was spent', () => {
    expect(categoryTrend(rows, 'groceries', ['2026-09', '2026-10', '2026-11'])).toEqual([
      { month: '2026-09', spent: 0 },
      { month: '2026-10', spent: 5000 },
      { month: '2026-11', spent: 6500 },
    ]);
    expect(categoryTrend(rows, null, ['2026-11'])).toEqual([{ month: '2026-11', spent: 2446 }]);
  });
});

describe('topPayees', () => {
  it('groups payees ignoring case and leaves out ones refunded in full', () => {
    expect(topPayees(rows, '2026-11', 2)).toEqual([
      { payee: 'Sushi House', spent: 12000, count: 1 },
      { payee: 'WALMART', spent: 6500, count: 2 },
    ]);
    expect(topPayees(rows, '2026-11').map(p => p.payee)).not.toContain('Card shop');
  });
});
