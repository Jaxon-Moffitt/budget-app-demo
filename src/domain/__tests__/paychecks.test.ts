import { fillPlan, perPaycheck } from '../paychecks';

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
