import { netWorth, netWorthByMonth } from '../net-worth';

const accounts = [
  { id: 'chk', type: 'checking' as const, closed: false, balance: 250000 },
  { id: 'sav', type: 'savings' as const, closed: false, balance: 850000 },
  { id: 'ef', type: 'emergency_fund' as const, closed: false, balance: 100000 },
  { id: 'brk', type: 'investment' as const, closed: false, balance: 1500000 },
  { id: 'card', type: 'credit' as const, closed: false, balance: -64000 },
  { id: 'card2', type: 'credit' as const, closed: false, balance: 1200 }, // a refund left on a card
  { id: 'old', type: 'checking' as const, closed: true, balance: 99999 },
];

describe('netWorth', () => {
  it('adds up open accounts, with cards as debts', () => {
    const w = netWorth(accounts);
    expect(w.total).toBe(250000 + 850000 + 100000 + 1500000 - 64000 + 1200);
    expect(w.assets).toBe(250000 + 850000 + 100000 + 1500000 + 1200);
    expect(w.debts).toBe(-64000);
    expect(w.groups).toEqual([
      { key: 'cash', label: 'Cash', total: 250000, count: 1 },
      { key: 'savings', label: 'Savings', total: 950000, count: 2 },
      { key: 'investments', label: 'Investments', total: 1500000, count: 1 },
      { key: 'credit', label: 'Credit cards', total: -62800, count: 2 },
    ]);
  });
});

describe('netWorthByMonth', () => {
  it('works back from today by undoing later transactions', () => {
    const activity = [
      { account_id: 'chk', date: '2026-10-15', amount: 200000 }, // paycheck in October
      { account_id: 'card', date: '2026-11-03', amount: -5000 }, // spending in November
      { account_id: 'chk', date: '2026-11-16', amount: -64000 }, // card payment: a transfer, both sides
      { account_id: 'card', date: '2026-11-16', amount: 64000 },
      { account_id: 'old', date: '2026-11-01', amount: -1 }, // closed accounts don't count
    ];
    const today = netWorth(accounts).total;
    expect(netWorthByMonth(accounts, activity, ['2026-09', '2026-10', '2026-11'])).toEqual([
      { month: '2026-09', total: today + 5000 - 200000 },
      { month: '2026-10', total: today + 5000 },
      { month: '2026-11', total: today },
    ]);
  });
});
