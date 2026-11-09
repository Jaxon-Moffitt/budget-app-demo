import { checkMove, envelopeView, linkedCheck, quickPicks } from '../envelope';

const month = (carried: number, assigned: number, spending: number, invested = 0, income = 0) => ({
  carried,
  assigned,
  spending,
  invested,
  income,
  balance: carried + assigned + spending + invested + income,
});

describe('envelopeView', () => {
  it('shows the balance, what was added and what was spent', () => {
    // $50 carried, $100 added, $90 spent: $60 of $150 left.
    const e = envelopeView(month(5000, 10000, -9000));
    expect(e).toMatchObject({ carried: 5000, added: 10000, spent: 9000, balance: 6000, status: 'ok' });
    expect(e.fill).toBeCloseTo(0.4);
  });

  it('is low under 20% left, empty at zero, over below zero', () => {
    expect(envelopeView(month(0, 10000, -8500)).status).toBe('low');
    expect(envelopeView(month(0, 10000, -10000))).toMatchObject({ status: 'empty', fill: 0 });
    expect(envelopeView(month(0, 10000, -12000))).toMatchObject({ status: 'over', fill: 1 });
    expect(envelopeView(month(-2000, 0, 0))).toMatchObject({ status: 'over', balance: -2000 });
    expect(envelopeView(undefined)).toMatchObject({ status: 'empty', balance: 0 });
  });

  it('counts investments separately from spending', () => {
    expect(envelopeView(month(0, 50000, 0, -50000))).toMatchObject({ spent: 0, invested: 50000, balance: 0 });
  });

  it('shows income kept in the envelope separately from money added', () => {
    expect(envelopeView(month(10000, 0, 0, 0, 1))).toMatchObject({ added: 0, received: 1, balance: 10001, status: 'ok' });
  });

  it('caps the bar when a refund leaves more than was put in', () => {
    expect(envelopeView(month(0, 0, 3000))).toMatchObject({ status: 'ok', fill: 1, spent: -3000 });
  });
});

describe('checkMove', () => {
  it('lets Ready to assign go below zero, with a warning', () => {
    expect(checkMove(0, 5000, true)).toEqual({ kind: 'none' });
    expect(checkMove(2500, 5000, true)).toEqual({ kind: 'ok' });
    expect(checkMove(7500, 5000, true)).toEqual({ kind: 'overbudget', by: 2500 });
    expect(checkMove(2500, -1000, true)).toEqual({ kind: 'overbudget', by: 2500 });
  });

  it('never takes more than an envelope holds', () => {
    expect(checkMove(1000, 1000, false)).toEqual({ kind: 'ok' });
    expect(checkMove(1500, 1000, false)).toEqual({ kind: 'too-much', most: 1000 });
    expect(checkMove(100, -500, false)).toEqual({ kind: 'too-much', most: 0 });
  });
});

describe('quickPicks', () => {
  it('offers cover, refill, target and round amounts without repeats', () => {
    expect(quickPicks(envelopeView(month(0, 10000, -12000)), null).map(p => p.kind)).toEqual([
      'cover',
      'round',
      'round',
      'round',
    ]);
    // Refill is $50, so the round $50 isn't offered twice.
    expect(quickPicks(envelopeView(month(0, 10000, -5000)), 30000)).toEqual([
      { kind: 'refill', amount: 5000 },
      { kind: 'target', amount: 20000 },
      { kind: 'round', amount: 2500 },
      { kind: 'round', amount: 10000 },
    ]);
  });
});

describe('linkedCheck', () => {
  it('compares an account with the envelopes linked to it', () => {
    expect(linkedCheck(480000, [300000, 200000])).toEqual({ envelopes: 500000, account: 480000, difference: -20000 });
  });
});
