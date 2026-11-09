import { buildBudgetInput, type ActivityRow } from '../budget-data';

describe('buildBudgetInput', () => {
  const envelopes = [
    { id: 'food', starting_balance: 0 },
    { id: 'invest', starting_balance: 5000 },
  ];

  it('sorts database totals by kind', () => {
    const activity: ActivityRow[] = [
      { month: null, envelope_id: null, kind: 'opening', amount: 100000 },
      { month: '2026-10', envelope_id: null, kind: 'income', amount: 430000 },
      { month: '2026-10', envelope_id: 'invest', kind: 'income', amount: 1 },
      { month: '2026-10', envelope_id: 'gone', kind: 'income', amount: 5 },
      { month: '2026-10', envelope_id: 'food', kind: 'spending', amount: -4000 },
      { month: '2026-10', envelope_id: 'invest', kind: 'investment', amount: -50000 },
      { month: '2026-10', envelope_id: null, kind: 'unreviewed', amount: -2000 },
      { month: '2026-11', envelope_id: null, kind: 'starting', amount: 7000 },
    ];
    const input = buildBudgetInput({
      envelopes,
      start: '2026-10',
      through: '2026-11',
      activity,
      assigned: [{ month: '2026-10', envelope_id: 'food', assigned: 30000 }],
    });
    expect(input.months).toEqual(['2026-10', '2026-11']);
    expect(input.opening).toBe(100000);
    // Income kept in a deleted envelope still counts, in Ready to assign.
    expect(input.income).toEqual({ '2026-10': 430005 });
    expect(input.envelopeIncome).toEqual({ '2026-10': { invest: 1 } });
    expect(input.spending).toEqual({ '2026-10': { food: -4000 } });
    expect(input.invested).toEqual({ '2026-10': { invest: -50000 } });
    expect(input.unreviewed).toEqual({ '2026-10': -2000 });
    expect(input.starting).toEqual({ '2026-11': 7000 });
    expect(input.assigned).toEqual({ '2026-10': { food: 30000 } });
    expect(input.startingBalances).toEqual({ food: 0, invest: 5000 });
  });

  it('keeps money from unknown envelopes in Ready to assign, and skips later months', () => {
    const input = buildBudgetInput({
      envelopes,
      start: '2026-10',
      through: '2026-10',
      activity: [
        { month: '2026-10', envelope_id: 'gone', kind: 'spending', amount: -1500 },
        { month: '2026-12', envelope_id: 'food', kind: 'spending', amount: -9999 },
      ],
      assigned: [
        { month: '2026-10', envelope_id: 'gone', assigned: 1000 },
        { month: '2026-12', envelope_id: 'food', assigned: 1000 },
      ],
    });
    expect(input.unreviewed).toEqual({ '2026-10': -1500 });
    expect(input.spending).toEqual({});
    expect(input.assigned).toEqual({});
  });
});
