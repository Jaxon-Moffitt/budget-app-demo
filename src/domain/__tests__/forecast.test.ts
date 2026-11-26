import { billDates, billsByEnvelope, envelopeTimeline, nextPaydays, plannedContributions } from '../forecast';
import type { Recurring } from '../recurring';

const pay = (date: string, dollars: number) => ({ date, amount: Math.round(dollars * 100) });

describe('nextPaydays', () => {
  const income = [
    pay('2026-09-15', 2150), pay('2026-09-30', 2150), pay('2026-10-01', 4.12), // interest
    pay('2026-10-15', 2150), pay('2026-10-31', 2150), pay('2026-11-14', 2150),
  ];

  it('learns twice-a-month paydays, with the month\'s last day for late ones', () => {
    expect(nextPaydays(income, 'twice_monthly', '2026-11-20', '2027-01-20')).toEqual([
      '2026-11-30', '2026-12-15', '2026-12-31', '2027-01-15',
    ]);
  });

  it('learns the 1st and the 15th', () => {
    const firstAndFifteenth = ['2026-09-01', '2026-09-15', '2026-10-01', '2026-10-15', '2026-11-02', '2026-11-16'].map(d => pay(d, 2150));
    expect(nextPaydays(firstAndFifteenth, 'twice_monthly', '2026-11-20', '2026-12-31')).toEqual(['2026-12-01', '2026-12-15']);
  });

  it('falls back to the 1st and the 15th with no paychecks to learn from', () => {
    expect(nextPaydays([], 'twice_monthly', '2026-11-20', '2026-12-20')).toEqual(['2026-12-01', '2026-12-15']);
  });

  it('counts every two weeks on from the last paycheck', () => {
    expect(nextPaydays([pay('2026-11-06', 1800), pay('2026-11-20', 1800)], 'biweekly', '2026-11-25', '2026-12-31')).toEqual([
      '2026-12-04', '2026-12-18',
    ]);
  });
});

describe('plannedContributions', () => {
  it('adds a paycheck\'s share, never past the month\'s amount', () => {
    // $128 a month, $64 already in this month: the rest of November gets $64.
    expect(
      plannedContributions(['2026-11-30', '2026-12-15', '2026-12-31'], 12800, 6400, 'twice_monthly', '2026-11-20'),
    ).toEqual([
      { date: '2026-11-30', amount: 6400 },
      { date: '2026-12-15', amount: 6400 },
      { date: '2026-12-31', amount: 6400 },
    ]);
    expect(plannedContributions(['2026-11-30'], 12800, 12800, 'twice_monthly', '2026-11-20')).toEqual([]);
  });

  it('skips a third paycheck in a month once the month is full', () => {
    const days = ['2027-01-01', '2027-01-15', '2027-01-29'];
    expect(plannedContributions(days, 13000, 0, 'biweekly', '2026-12-31').map(c => c.amount)).toEqual([6000, 6000, 1000]);
  });
});

describe('billsByEnvelope', () => {
  const charges = [
    { date: '2025-11-22', amount: -76800, merchant: 'SAFE AUTO INSURANCE' },
    { date: '2026-05-22', amount: -76800, merchant: 'SAFE AUTO INSURANCE' },
    ...['2026-08-05', '2026-09-05', '2026-10-05', '2026-11-05'].map(date => ({
      date,
      amount: -1549,
      merchant: 'NETFLIX.COM',
      envelopeId: date === '2026-11-05' ? 'subs' : null,
    })),
  ];

  it('ties a bill to the envelope its latest charge was filed to, else to a matching rule', () => {
    const rules = [{ match_text: 'safe auto', envelope_id: 'ins', kind: 'spending' }];
    const bills = billsByEnvelope(charges, rules, '2026-11-20');
    expect(bills.map(b => [b.merchant, b.envelopeId, b.cadence])).toEqual([
      ['SAFE AUTO INSURANCE', 'ins', 'every 6 months'],
      ['NETFLIX.COM', 'subs', 'monthly'],
    ]);
  });

  it('leaves out bills it can\'t tie to an envelope', () => {
    expect(billsByEnvelope(charges, [], '2026-11-20').map(b => b.merchant)).toEqual(['NETFLIX.COM']);
  });
});

describe('envelopeTimeline', () => {
  const insurance: Recurring = {
    merchant: 'SAFE AUTO INSURANCE',
    cadence: 'every 6 months',
    amount: 76800,
    varies: false,
    lastDate: '2026-05-22',
    nextDate: '2026-11-22',
    monthly: 12800,
    count: 2,
  };
  const contributions = plannedContributions(
    nextPaydays([], 'twice_monthly', '2026-11-01', '2027-05-31'),
    12800,
    0,
    'twice_monthly',
    '2026-11-01',
  );

  it('runs the balance through paydays and the bill, and says it\'s covered', () => {
    const { events, coverage } = envelopeTimeline(64000, contributions, [insurance], '2026-11-01', '2027-05-31');
    const bill = events.find(e => e.kind === 'bill' && e.date === '2026-11-22')!;
    // $640 + $64 on Nov 15 = $704... short of $768 on Nov 22.
    expect(bill.balance).toBe(64000 + 6400 - 76800);
    expect(coverage).toMatchObject({ kind: 'short', date: '2026-11-22', short: 6400, perPaycheck: 6400 });
    expect(events.filter(e => e.kind === 'bill').map(e => e.date)).toEqual(['2026-11-22', '2027-05-22']);
  });

  it('is on track when the envelope will hold enough by the due date', () => {
    const { coverage } = envelopeTimeline(70400, contributions, [insurance], '2026-11-01', '2027-05-31');
    expect(coverage).toMatchObject({ kind: 'ok', date: '2026-11-22' });
  });

  it('puts a bill that\'s late at today', () => {
    const { events } = envelopeTimeline(100000, [], [insurance], '2026-11-25', '2026-12-31');
    expect(events[0]).toMatchObject({ kind: 'bill', date: '2026-11-25', overdue: true });
  });

  it('repeats a bill on its schedule', () => {
    expect(billDates(insurance, '2027-12-31')).toEqual(['2026-11-22', '2027-05-22', '2027-11-22']);
  });
});
