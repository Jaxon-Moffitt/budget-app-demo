import { fillPlan, leftover, monthlyFromPaycheck, perPaycheck, withLeftover } from '../paychecks';

describe('perPaycheck', () => {
  it('splits a monthly amount by how often pay comes', () => {
    expect(perPaycheck(145000, 'twice_monthly')).toBe(72500);
    expect(perPaycheck(145000, 'monthly')).toBe(145000);
    expect(perPaycheck(130000, 'biweekly')).toBe(60000); // 1300 × 12 / 26
    expect(perPaycheck(52000, 'weekly')).toBe(12000);
  });
});

describe('fillPlan', () => {
  const envelopes = [
    { id: 'rent', target: 145000, assigned: 0 },
    { id: 'phone', target: 4501, assigned: 0 }, // odd cents
    { id: 'fun', target: 60000, assigned: 50000 }, // nearly full already
    { id: 'none', target: null, assigned: 0 },
    { id: 'full', target: 3000, assigned: 3000 },
  ];

  it('adds one paycheck\'s share, capped at what the month still needs', () => {
    expect(fillPlan(envelopes, 'paycheck', 'twice_monthly')).toEqual([
      { id: 'rent', add: 72500, target: 145000, assigned: 0 },
      { id: 'phone', add: 2251, target: 4501, assigned: 0 },
      { id: 'fun', add: 10000, target: 60000, assigned: 50000 },
    ]);
  });

  it('tops envelopes up exactly on the second paycheck', () => {
    const after = envelopes.map(e => {
      const line = fillPlan(envelopes, 'paycheck', 'twice_monthly').find(l => l.id === e.id);
      return { ...e, assigned: e.assigned + (line?.add ?? 0) };
    });
    const second = fillPlan(after, 'paycheck', 'twice_monthly');
    expect(second).toEqual([
      { id: 'rent', add: 72500, target: 145000, assigned: 72500 },
      { id: 'phone', add: 2250, target: 4501, assigned: 2251 },
    ]);
    // A third paycheck in the month adds nothing.
    const third = after.map(e => ({ ...e, assigned: e.target ?? 0 }));
    expect(fillPlan(third, 'paycheck', 'biweekly')).toEqual([]);
  });

  it('fills the whole rest of the month at once when asked', () => {
    expect(fillPlan(envelopes, 'month', 'twice_monthly').map(l => [l.id, l.add])).toEqual([
      ['rent', 145000],
      ['phone', 4501],
      ['fun', 10000],
    ]);
  });
});

describe('leftover', () => {
  it('is the expected income less every monthly target', () => {
    expect(leftover(793000, [145000, 18000, null, 60000])).toBe(570000);
    expect(leftover(100000, [145000])).toBe(-45000);
    expect(leftover(null, [145000])).toBeNull();
  });

  it('converts a paycheck amount to a monthly one', () => {
    expect(monthlyFromPaycheck(396500, 'twice_monthly')).toBe(793000);
    expect(monthlyFromPaycheck(300000, 'biweekly')).toBe(650000); // 26 paychecks over 12 months
  });
});

describe('withLeftover', () => {
  const envelopes = [
    { id: 'rent', target: 145000, assigned: 0 },
    { id: 'savings', target: 20000, assigned: 0 },
    { id: 'fun', target: null, assigned: 0 },
  ];

  it('adds the leftover to its envelope, which then fills a paycheck share of it', () => {
    const plan = fillPlan(withLeftover(envelopes, 'savings', 80000), 'paycheck', 'twice_monthly');
    expect(plan.find(l => l.id === 'savings')).toMatchObject({ add: 50000, target: 100000 });
    // An envelope with no target of its own can take the leftover too.
    expect(fillPlan(withLeftover(envelopes, 'fun', 30000), 'paycheck', 'twice_monthly').find(l => l.id === 'fun')).toMatchObject({ add: 15000 });
  });

  it('adds nothing when the budget is over the income or no envelope is chosen', () => {
    expect(withLeftover(envelopes, 'savings', -5000)).toBe(envelopes);
    expect(withLeftover(envelopes, null, 5000)).toBe(envelopes);
  });
});
