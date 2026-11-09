import { computeBudget, type BudgetInput } from '../budget';

function input(overrides: Partial<BudgetInput>): BudgetInput {
  return {
    envelopes: ['food', 'rent'],
    months: ['2026-10'],
    assigned: {},
    spending: {},
    invested: {},
    income: {},
    envelopeIncome: {},
    starting: {},
    unreviewed: {},
    startingBalances: {},
    opening: 0,
    ...overrides,
  };
}

describe('computeBudget', () => {
  it('assigns income into envelopes, leaving the rest ready to assign', () => {
    const [oct] = computeBudget(
      input({
        income: { '2026-10': 400000 },
        assigned: { '2026-10': { food: 60000, rent: 150000 } },
        spending: { '2026-10': { food: -20000 } },
      }),
    );
    expect(oct.readyToAssign).toBe(190000);
    expect(oct.envelopes.food).toEqual({ carried: 0, assigned: 60000, spending: -20000, invested: 0, income: 0, balance: 40000 });
    expect(oct.spending).toBe(-20000);
  });

  it('carries every balance into next month, negative ones too', () => {
    const [, nov] = computeBudget(
      input({
        months: ['2026-10', '2026-11'],
        income: { '2026-10': 100000 },
        assigned: { '2026-10': { food: 10000, rent: 50000 } },
        spending: { '2026-10': { food: -15000, rent: -50000 } },
      }),
    );
    expect(nov.envelopes.food.carried).toBe(-5000);
    expect(nov.envelopes.food.balance).toBe(-5000);
    expect(nov.overspent).toBe(-5000);
    // Overspending isn't taken from Ready to assign: it stays in the envelope.
    expect(nov.readyToAssign).toBe(40000);
  });

  it('covers overspending by moving money between envelopes', () => {
    const [oct] = computeBudget(
      input({
        income: { '2026-10': 100000 },
        assigned: { '2026-10': { food: 10000 - (-5000), rent: 50000 - 5000 } },
        spending: { '2026-10': { food: -15000 } },
      }),
    );
    expect(oct.envelopes.food.balance).toBe(0);
    expect(oct.envelopes.rent.balance).toBe(45000);
    expect(oct.readyToAssign).toBe(40000);
  });

  it('starts from the opening money, minus envelope starting balances', () => {
    const [oct] = computeBudget(
      input({ opening: 500000, startingBalances: { rent: 150000 } }),
    );
    expect(oct.envelopes.rent).toMatchObject({ carried: 150000, balance: 150000 });
    expect(oct.readyToAssign).toBe(350000);
  });

  it('counts investments out of an envelope but not as spending', () => {
    const [oct] = computeBudget(
      input({
        income: { '2026-10': 100000 },
        assigned: { '2026-10': { food: 50000 } },
        invested: { '2026-10': { food: -50000 } },
      }),
    );
    expect(oct.envelopes.food.balance).toBe(0);
    expect(oct.spending).toBe(0);
    expect(oct.invested).toBe(-50000);
  });

  it('keeps income in an envelope when asked, outside Ready to assign', () => {
    const [oct, nov] = computeBudget(
      input({
        months: ['2026-10', '2026-11'],
        income: { '2026-10': 100000 },
        envelopeIncome: { '2026-10': { food: 1 } },
      }),
    );
    expect(oct.envelopes.food).toMatchObject({ income: 1, balance: 1 });
    expect(oct.income).toBe(100001);
    expect(oct.readyToAssign).toBe(100000);
    expect(nov.envelopes.food.balance).toBe(1);
  });

  it('keeps unreviewed money and later starting balances in Ready to assign', () => {
    const [oct] = computeBudget(
      input({ unreviewed: { '2026-10': -2000 }, starting: { '2026-10': 30000 } }),
    );
    expect(oct.readyToAssign).toBe(28000);
    expect(oct.income).toBe(0);
  });

  it('always matches the cash: envelopes plus Ready to assign', () => {
    const months = computeBudget(
      input({
        months: ['2026-10', '2026-11'],
        opening: 100000,
        startingBalances: { food: 20000 },
        income: { '2026-10': 300000, '2026-11': 300000 },
        assigned: { '2026-10': { food: 50000, rent: 150000 }, '2026-11': { food: 70000 } },
        spending: { '2026-10': { food: -80000 }, '2026-11': { rent: -150000 } },
        invested: { '2026-11': { food: -10000 } },
        envelopeIncome: { '2026-11': { rent: 7 } },
        unreviewed: { '2026-11': -500 },
      }),
    );
    const cash = 100000 + 600000 - 80000 - 150000 - 10000 + 7 - 500;
    const last = months[1];
    const inEnvelopes = Object.values(last.envelopes).reduce((s, e) => s + e.balance, 0);
    expect(inEnvelopes + last.readyToAssign).toBe(cash);
  });
});
