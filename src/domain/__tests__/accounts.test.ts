import {
  accountDisplayName,
  accountTypeLabel,
  compareAccounts,
  groupAccounts,
  normalizeNickname,
} from '../accounts';

describe('accounts', () => {
  it('shows the nickname when set, else the bank name', () => {
    expect(accountDisplayName({ name: 'Everyday Checking (1234)', nickname: 'Paycheck' })).toBe('Paycheck');
    expect(accountDisplayName({ name: 'Everyday Checking (1234)', nickname: null })).toBe(
      'Everyday Checking (1234)',
    );
    expect(accountDisplayName({ name: 'Everyday Checking (1234)', nickname: '  ' })).toBe(
      'Everyday Checking (1234)',
    );
  });

  it('cleans nicknames and treats blank as none', () => {
    expect(normalizeNickname('  Car   Fund ')).toBe('Car Fund');
    expect(normalizeNickname('   ')).toBeNull();
  });

  it('labels types', () => {
    expect(accountTypeLabel('credit')).toBe('Credit Card');
    expect(accountTypeLabel('emergency_fund')).toBe('Emergency Fund');
  });

  it('sorts by type, then by the displayed name', () => {
    const accounts = [
      { name: 'Roth IRA', nickname: null, type: 'investment' as const },
      { name: 'Rewards Visa', nickname: null, type: 'credit' as const },
      { name: 'Everyday Checking (1234)', nickname: 'Paycheck', type: 'checking' as const },
      { name: 'Savings (3310)', nickname: null, type: 'emergency_fund' as const },
      { name: '360 Checking', nickname: null, type: 'checking' as const },
      { name: 'Car Fund', nickname: null, type: 'savings' as const },
    ];
    expect([...accounts].sort(compareAccounts).map(accountDisplayName)).toEqual([
      '360 Checking',
      'Paycheck',
      'Car Fund',
      'Rewards Visa',
      'Roth IRA',
      'Savings (3310)',
    ]);
  });

  it('groups by budget, then by type, with totals', () => {
    const base = { nickname: null, on_budget: true, closed: false };
    const groups = groupAccounts([
      { ...base, name: 'Rewards Visa', type: 'credit' as const, balance: -500 },
      { ...base, name: 'Checking B', type: 'checking' as const, balance: 200 },
      { ...base, name: 'Checking A', type: 'checking' as const, balance: 100 },
      { ...base, name: 'Roth', type: 'investment' as const, balance: 9000, on_budget: false },
      { ...base, name: 'Old card', type: 'credit' as const, balance: 0, closed: true },
    ]);
    expect(
      groups.map(g => ({
        title: g.title,
        total: g.total,
        types: g.types.map(t => [t.label, t.total, t.accounts.map(a => a.name)]),
      })),
    ).toEqual([
      {
        title: 'In budget',
        total: -200,
        types: [
          ['Checking', 300, ['Checking A', 'Checking B']],
          ['Credit Card', -500, ['Rewards Visa']],
        ],
      },
      { title: 'Off budget', total: 9000, types: [['Investment', 9000, ['Roth']]] },
      { title: 'Closed', total: 0, types: [['Credit Card', 0, ['Old card']]] },
    ]);
  });
});
